// Docking + capacity + cargo verification: drives a 5-seat game over WS into a
// rich state — every board hosting a docked visitor, factory/harbor lots filled
// to their limits, one boat loaded to 5 crates — then screenshots the TV with
// camera overrides (top-down per board, multiple boat angles) and a device mat.
// Run: node tools/verify/container-dock-probe.mjs [out-dir]

import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import WebSocket from 'ws';

const BASE = 'http://localhost:8787';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const SEATS = 5;
const OUT = process.argv[2] ?? 'tools/verify';

// ---- scene math (mirror of cont-scene.ts, for camera targets) ----
const scene = JSON.parse(readFileSync(new URL('../../client/public/container/scene.json', import.meta.url)));
const { ax, az } = scene.mat.transform;
const [MW, MH] = scene.mat.px;
const { bx, bz } = scene.mat.transform;
const px2r = (px, py) => [(px - MW / 2) * ax, (py - MH / 2) * -az];
const w2px = (wx, wz) => [(wx - bx) / ax, (wz - bz) / az];
const w2r = (wx, wz) => px2r(...w2px(wx, wz));
const pb2local = (px, py) => [-(px - scene.pb.cx) * scene.pb.s, (py - scene.pb.cy) * scene.pb.s];
const yawRot = (yaw, [x, z]) => {
  switch (((yaw % 360) + 360) % 360) {
    case 0: return [x, z];
    case 90: return [z, -x];
    case 180: return [-x, -z];
    default: return [-z, x];
  }
};
const boardSpot = (seatColor, artPx) => {
  const b = scene.boards[seatColor];
  const [dx, dz] = yawRot(b.yaw, pb2local(artPx[0], artPx[1]));
  return w2r(b.pos[0] + dx, b.pos[1] + dz);
};

// ---- ws seats ----
function connectSeat(roomId, token, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const seat = { ws, token, view: null, send: (m) => ws.send(JSON.stringify(m)) };
    ws.on('open', () => seat.send({ type: 'join', roomId, name, playerToken: token }));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'state') { seat.view = m.view; seat.onView?.(m.view); }
      if (m.type === 'joined') resolve(seat);
      if (m.type === 'error') console.error(name, 'ws error:', m.message);
    });
    ws.on('error', reject);
  });
}

const setup = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(WS_URL);
  const send = (m) => ws.send(JSON.stringify(m));
  let roomId = null;
  const tokens = [];
  let joining = 0;
  const maybeDone = () => {
    if (tokens.length === SEATS) {
      send({ type: 'start' });
      setTimeout(() => resolve({ roomId, tokens }), 700);
    }
  };
  ws.on('open', () => send({ type: 'create_room', name: 'dock probe', game: 'container', options: { length: 'short' } }));
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    if (m.type === 'room_created') {
      roomId = m.roomId;
      send({ type: 'join', roomId, name: `Dock ${++joining}` });
      for (let i = 1; i < SEATS; i++) {
        const w = new WebSocket(WS_URL);
        w.on('open', () => w.send(JSON.stringify({ type: 'join', roomId, name: `Dock ${++joining}` })));
        w.on('message', (d) => {
          const mm = JSON.parse(d.toString());
          if (mm.type === 'joined') { tokens.push(mm.playerToken); maybeDone(); }
        });
      }
    } else if (m.type === 'joined') { tokens.unshift(m.playerToken); maybeDone(); }
    else if (m.type === 'error') reject(new Error(m.message));
  });
  setTimeout(() => reject(new Error('room setup timeout')), 15000);
});

const { roomId, tokens } = await setup();
console.log('room', roomId);
const seats = [];
for (let i = 0; i < SEATS; i++) seats.push(await connectSeat(roomId, tokens[i], `Dock ${i + 1}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(60);
  }
  throw new Error('timeout waiting for ' + what);
};
await until(() => seats.every((s) => s.view), 'initial views');
// join order races: re-index the socket list by each connection's own seat
{
  const bySeat = [];
  for (const s of seats) bySeat[s.view.you] = s;
  seats.splice(0, seats.length, ...bySeat);
}

/** run one seat action and wait for the event seq to advance (or error) */
async function act(s, action) {
  const before = seats[0].view.lastEvent.seq;
  s.send({ type: 'action', action });
  await until(() => seats[0].view.lastEvent.seq !== before, JSON.stringify(action), 4000).catch(() => {
    console.error('NO-OP (likely rejected):', JSON.stringify(action));
  });
  console.log('  act', action.type, 'seq', seats[0].view.lastEvent.seq, '-', seats[0].view.lastEvent.text);
}

const my = (s) => s.view.players[s.view.you];
const lotsAll2 = (district) => ({ ...Object.fromEntries((district === 'factory' ? [1, 2, 3, 4] : [2, 3, 4, 5, 6]).map((p) => [p, []])), 2: null });
const flat = (lots) => Object.values(lots).flat();

async function turnOf(i) {
  await until(() => seats[0].view.turn === i && seats[0].view.actionsLeft === 2, `turn of seat ${i}`);
}

// ---- round 1: two factories each ----
for (let r = 0; r < SEATS; r++) {
  const i = seats[0].view.turn;
  const s = seats[i];
  for (let b = 0; b < 2; b++) {
    const owned = my(s).factories;
    const color = Object.entries(s.view.supply.factories)
      .filter(([c, n]) => n > 0 && !owned.includes(c))
      .sort((a, b2) => b2[1] - a[1])[0][0];
    await act(s, { type: 'build_factory', color });
  }
  await act(s, { type: 'end_turn' });
}

// ---- round 2: loan, produce all into the $2 lot, warehouse ----
for (let r = 0; r < SEATS; r++) {
  const i = seats[0].view.turn;
  const s = seats[i];
  await act(s, { type: 'take_loan' });
  const p = my(s);
  const eligible = p.factories.filter((c) => s.view.supply.containers[c] > 0);
  const room = p.factories.length * 2 - flat(p.factoryLots).length;
  const make = eligible.slice(0, Math.min(eligible.length, room));
  const all = [...flat(p.factoryLots), ...make];
  await act(s, { type: 'produce', make, lots: { 1: [], 2: all, 3: [], 4: [] } });
  await act(s, { type: 'build_warehouse' });
  await act(s, { type: 'end_turn' });
}

// ---- round 3: produce to the factory limit, buy 2 into the harbor $2 lot ----
for (let r = 0; r < SEATS; r++) {
  const i = seats[0].view.turn;
  const s = seats[i];
  const p = my(s);
  const eligible = p.factories.filter((c) => s.view.supply.containers[c] > 0);
  const room = p.factories.length * 2 - flat(p.factoryLots).length;
  const make = eligible.slice(0, Math.min(eligible.length, room));
  if (make.length > 0) {
    const all = [...flat(p.factoryLots), ...make];
    await act(s, { type: 'produce', make, lots: { 1: [], 2: all, 3: [], 4: [] } });
  }
  const from = (i + 1) % SEATS;
  const sellerLot2 = seats[0].view.players[from].factoryLots[2];
  const picks = [];
  for (const color of new Set(sellerLot2.slice(0, 2))) {
    picks.push({ price: 2, color, count: sellerLot2.slice(0, 2).filter((c) => c === color).length });
  }
  if (picks.length > 0) {
    const bought = picks.flatMap((x) => Array.from({ length: x.count }, () => x.color));
    const allH = [...flat(my(s).harborLots), ...bought];
    await act(s, { type: 'factory_buy', from, picks, lots: { 2: allH, 3: [], 4: [], 5: [], 6: [] } });
  }
  await act(s, { type: 'end_turn' });
}

// ---- round 4: second loan, dock at the next seat's harbor, load the deck.
// Seats 1 and 2 skip their purchase so hosts 2/3 keep stock for the showcase
// boat's later tour to a full 5-crate deck. ----
for (let r = 0; r < SEATS; r++) {
  const i = seats[0].view.turn;
  const s = seats[i];
  await act(s, { type: 'take_loan' });
  const host = (i + 1) % SEATS;
  await act(s, { type: 'sail', to: { harbor: host } });
  // free anchor purchase: load whatever is affordable
  const hostLots = seats[0].view.players[host].harborLots;
  const avail = hostLots[2] ?? [];
  const canAfford = Math.floor((my(s).cash ?? 0) / 2);
  const skip = i === 1 || i === 2;
  const n = skip ? 0 : Math.min(avail.length, canAfford, 5 - my(s).ship.cargo.length);
  if (n > 0) {
    const picks = [];
    for (const color of new Set(avail.slice(0, n))) {
      picks.push({ price: 2, color, count: avail.slice(0, n).filter((c) => c === color).length });
    }
    await act(s, { type: 'harbor_buy', picks, free: true });
  }
  await act(s, { type: 'end_turn' });
}

// ---- capture: every board hosts one docked visitor ----
console.log('ships:', seats[0].view.players.map((p) => `${p.color}:${JSON.stringify(p.ship.loc)} cargo ${p.ship.cargo.length}`).join(' | '));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--window-size=1400,900'],
});
const shot = async (name, cam, w = 1280, h = 720) => {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h });
  await page.goto(`${BASE}/board/${roomId}?cam=${cam.map((v) => v.toFixed(2)).join(',')}`, { waitUntil: 'domcontentloaded' });
  await sleep(4200);
  await page.screenshot({ path: `${OUT}/dock-${name}.png` });
  await ctx.close();
  console.log('shot', name);
};

// whole-table top-down
await shot('all-top', [0, 2, 1, 120]);
// each board top-down (board center pushed a little seaward so the dock shows)
for (const [color, b] of Object.entries(scene.boards)) {
  const [x, z] = w2r(b.pos[0], b.pos[1]);
  const [sx, sz] = boardSpot(color, [scene.pb.cx, -350]);
  const cx = (x + sx) / 2, cz = (z + sz) / 2;
  await shot(`board-${color.toLowerCase()}-top`, [cx, cz, 1, 24]);
}

// ---- seat 0 sails on to fill its deck to 5 ----
const s0seat = 0;
for (let round = 0; round < 2; round++) {
  for (let r = 0; r < SEATS; r++) {
    const i = seats[0].view.turn;
    const s = seats[i];
    if (i !== s0seat) { await act(s, { type: 'end_turn' }); continue; }
    await act(s, { type: 'sail', to: 'ocean' });
    const host = (s0seat + 2 + round) % SEATS;
    await act(s, { type: 'sail', to: { harbor: host } });
    const avail = seats[0].view.players[host].harborLots[2] ?? [];
    const n = Math.min(avail.length, Math.floor((my(s).cash ?? 0) / 2), 5 - my(s).ship.cargo.length);
    if (n > 0) {
      const picks = [];
      for (const color of new Set(avail.slice(0, n))) {
        picks.push({ price: 2, color, count: avail.slice(0, n).filter((c) => c === color).length });
      }
      await act(s, { type: 'harbor_buy', picks, free: true });
    }
    await act(s, { type: 'end_turn' });
  }
}
const s0 = seats[0].view.players[s0seat];
console.log('showcase boat:', s0.color, JSON.stringify(s0.ship.loc), 'cargo', s0.ship.cargo.length, s0.ship.cargo.join(','));

// boat close-ups from several angles (dock cove of the host board)
if (s0.ship.loc.kind === 'harbor') {
  const hostSeat = s0.ship.loc.seat;
  const host = seats[0].view.players[hostSeat];
  const n = seats[0].view.players.length;
  const cove = scene.pb.docks[(s0seat - hostSeat - 1 + n) % n % scene.pb.docks.length];
  const [sx, sz] = boardSpot(host.color, [cove[0], -333]);
  await shot('boat-top', [sx, sz + 1.5, 1, 10]);
  await shot('boat-oblique', [sx, sz + 1, 8, 5]);
  await shot('boat-low', [sx, sz + 0.5, 6, 2]);
}

// device mat of the host seat: the visitor tied up at the dock
{
  const hostSeat = s0.ship.loc.kind === 'harbor' ? s0.ship.loc.seat : 1;
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument((room, token) => {
    localStorage.setItem('bge-token-' + room.toUpperCase(), token);
  }, roomId, seats[hostSeat].token);
  await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'domcontentloaded' });
  await sleep(2600);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent ?? '').trim() === 'Got it') { b.click(); break; }
    }
  });
  await sleep(1400);
  await page.screenshot({ path: `${OUT}/dock-mat-host.png` });
  console.log('shot mat-host (seat', hostSeat, ')');
  await ctx.close();
}

console.log('lots:', seats[0].view.players.map((p) => `${p.color} F$2:${p.factoryLots[2].length} H$2:${p.harborLots[2].length}`).join(' | '));
await browser.close();
process.exit(0);
