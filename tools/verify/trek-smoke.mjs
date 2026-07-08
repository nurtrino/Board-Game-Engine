// Live WS smoke test for Trekking: three driver-controlled players play a full
// game through the real server (create room -> join -> start -> play to end),
// checking view redaction and turn flow along the way.
// Run from repo root: npx tsx tools/verify/trek-smoke.mjs [port]

import WebSocket from 'ws';
import {
  TREK_CATALOG, PARKS, MAJORS, TREK_RULES,
  distancesFrom, findPath,
} from '../../shared/src/index.ts';

const PORT = process.argv[2] ?? '8787';
const URL = `ws://localhost:${PORT}/ws`;

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } };

const mkClient = (name) => new Promise((resolve, reject) => {
  const ws = new WebSocket(URL);
  const c = { ws, name, view: null, room: null, seat: null, handlers: [] };
  ws.on('open', () => resolve(c));
  ws.on('error', reject);
  ws.on('message', (buf) => {
    const msg = JSON.parse(buf.toString());
    if (msg.type === 'room') c.room = msg.info;
    // the creator's socket is also a room watcher; keep only our seat's frames
    if (msg.type === 'state' && (c.seat === null || msg.view.you === c.seat)) c.view = msg.view;
    if (msg.type === 'joined') c.seat = msg.playerIndex;
    for (const h of [...c.handlers]) h(msg);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.wait = (pred, timeout = 15000) => new Promise((res, rej) => {
    if (pred(c)) return res(null);
    const t = setTimeout(() => { c.handlers = c.handlers.filter((h) => h !== h2); rej(new Error(`${name}: timeout waiting`)); }, timeout);
    const h2 = () => { if (pred(c)) { clearTimeout(t); c.handlers = c.handlers.filter((h) => h !== h2); res(null); } };
    c.handlers.push(h2);
  });
});

// same greedy policy as the engine test bot
function payFor(hand, cost) {
  const used = new Set();
  for (const suit of cost) {
    const i = hand.findIndex((cc, idx) => !used.has(idx) && TREK_CATALOG[cc].suit === suit);
    if (i < 0) return null;
    used.add(i);
  }
  return [...used];
}

function pickAction(view, seat) {
  const p = view.players[seat];
  const hand = p.hand ?? [];
  if (view.actionsLeft <= 0) {
    if (hand.length > TREK_RULES.handLimit) {
      const idx = hand.map((c, i) => ({ i, v: TREK_CATALOG[c].value })).sort((a, b) => a.v - b.v)
        .slice(0, hand.length - TREK_RULES.handLimit).map((x) => x.i);
      return { type: 'discard', cards: idx };
    }
    return { type: 'end_turn' };
  }
  for (let slot = 0; slot < view.parkRiver.length; slot++) {
    const id = view.parkRiver[slot];
    if (id === null || PARKS[id].node !== p.node) continue;
    const cards = payFor(hand, PARKS[id].cost);
    if (cards) return { type: 'claim', slot, cards };
  }
  for (const majorId of view.majors) {
    const m = MAJORS[majorId];
    if (m.node !== p.node || p.majors.includes(majorId) || p.campsites <= 0) continue;
    const cards = payFor(hand, m.cost);
    if (cards) return { type: 'occupy', major: majorId, cards };
  }
  const shim = { players: view.players.map((q) => ({ seat: q.seat, node: q.node })) };
  const meShim = shim.players[seat];
  if (hand.length) {
    const dist = distancesFrom(p.node);
    const goals = view.parkRiver
      .map((id, slot) => ({ id, slot }))
      .filter((g) => g.id !== null && PARKS[g.id].node !== p.node)
      .map((g) => ({ ...g, cost: payFor(hand, PARKS[g.id].cost), d: dist[PARKS[g.id].node] }))
      .filter((g) => g.cost !== null)
      .sort((a, b) => a.d - b.d);
    const subsetSum = (idx, target) => {
      if (target === 0) return [];
      for (let k = 0; k < idx.length; k++) {
        const v = TREK_CATALOG[hand[idx[k]]].value;
        if (v > target) continue;
        const rest = subsetSum(idx.slice(k + 1), target - v);
        if (rest) return [idx[k], ...rest];
      }
      return null;
    };
    for (const g of goals) {
      const spare = hand.map((_, i) => i).filter((i) => !g.cost.includes(i));
      const cards = subsetSum(spare, g.d);
      if (!cards) continue;
      const path = findPath(shim, meShim, PARKS[g.id].node, g.d);
      if (path) return { type: 'move', path, cards };
    }
    if (hand.length >= 6) {
      const one = Math.floor(Math.random() * hand.length);
      const len = TREK_CATALOG[hand[one]].value;
      const all = Object.keys(dist).map(Number).filter((n) => dist[n] === len && n !== p.node);
      for (const dest of all.sort(() => Math.random() - 0.5).slice(0, 6)) {
        const path = findPath(shim, meShim, dest, len);
        if (path) return { type: 'move', path, cards: [one] };
      }
    }
  }
  const slot = view.trekRiver.findIndex((c) => c !== null);
  return { type: 'draw', source: slot >= 0 ? slot : 'deck' };
}

const names = ['Ada', 'Ben', 'Cy'];
const clients = await Promise.all(names.map(mkClient));
const [ada, ben, cy] = clients;

ada.send({ type: 'create_room', name: 'Trek smoke', game: 'trek' });
let roomId = null;
await new Promise((res) => { ada.handlers.push((m) => { if (m.type === 'room_created') { roomId = m.roomId; res(null); } }); });
console.log('room', roomId);

for (const c of clients) {
  c.send({ type: 'join', roomId, name: c.name });
  await c.wait((x) => x.seat !== null);
}
await ada.wait((c) => c.room?.players?.length === 3).catch(() => ok(false, `3 players joined (${ada.room?.players?.length})`));

ada.send({ type: 'start' });
await ada.wait((c) => c.view?.game === 'trek' && c.view.phase === 'playing');
console.log('started; first =', ada.view.turn, 'majors =', ada.view.majors.map((m) => MAJORS[m].name).join(', '));

// redaction: each client sees only its own hand
for (const c of clients) {
  await c.wait((x) => x.view !== null);
  const v = c.view;
  ok(v.players[c.seat].hand !== undefined, `${c.name} sees own hand`);
  ok(v.players.filter((_, i) => i !== c.seat).every((q) => q.hand === undefined), `${c.name} cannot see other hands`);
  ok(v.players[c.seat].hand.length === 2, `${c.name} dealt 2 cards`);
}

// play to the end
let acts = 0;
const started = Date.now();
while (ada.view.phase === 'playing' && acts < 3000 && Date.now() - started < 240000) {
  const turnSeat = ada.view.turn;
  const c = clients[turnSeat];
  await c.wait((x) => x.view.turn === turnSeat || x.view.phase === 'ended', 20000);
  if (c.view.phase === 'ended') break;
  const before = JSON.stringify([c.view.actionsLeft, c.view.turn, c.view.players[turnSeat].hand, c.view.lastEvent?.seq]);
  const action = pickAction(c.view, turnSeat);
  c.send({ type: 'action', action });
  try {
    await c.wait((x) => x.view.phase === 'ended' || JSON.stringify([x.view.actionsLeft, x.view.turn, x.view.players[turnSeat].hand, x.view.lastEvent?.seq]) !== before, 8000);
  } catch {
    ok(false, `no state change after ${action.type} (seat ${turnSeat})`);
    break;
  }
  acts++;
}

ok(ada.view.phase === 'ended', `game ended (${acts} acts, phase=${ada.view.phase})`);
ok((ada.view.winners?.length ?? 0) >= 1, 'winners set');
console.log('final:', ada.view.players.map((p) => `${p.name}:${p.score}`).join(' '), '— winners', ada.view.winners?.join('&'));
console.log(fails ? `${fails} FAILURES` : 'SMOKE OK', `(${acts} acts)`);
for (const c of clients) c.ws.close();
process.exit(fails ? 1 : 0);
