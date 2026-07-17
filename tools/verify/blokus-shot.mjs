// Blokus visual check: create a room, play a handful of moves, then
// screenshot the TV board and the device with puppeteer (swiftshader GL).
// Run: node tools/verify/blokus-shot.mjs [base] [outDir]

import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:8899';
const OUT = process.argv[3] ?? '.';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

function wsOnce(setup, wanted, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => setup(ws));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'error') { ws.close(); reject(new Error(m.message)); return; }
      const out = wanted(m, ws);
      if (out !== undefined) { ws.close(); resolve(out); }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('ws timeout')); }, timeoutMs);
  });
}

const roomId = await wsOnce(
  (ws) => ws.send(JSON.stringify({ type: 'create_room', name: 'Blokus shots', game: 'blokus' })),
  (m) => (m.type === 'room_created' ? m.roomId : undefined),
);
const token = await wsOnce(
  (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Chase', color: 'Blue' })),
  (m) => (m.type === 'joined' ? m.playerToken : undefined),
);
// same minimal legality mirror as blokus-smoke
const SIZE = 20;
const PIECES = {
  I1: [[0,0]], I2: [[0,0],[1,0]], I3: [[0,0],[1,0],[2,0]], V3: [[0,0],[1,0],[0,1]],
  I4: [[0,0],[1,0],[2,0],[3,0]], O4: [[0,0],[1,0],[0,1],[1,1]],
  T4: [[0,0],[1,0],[2,0],[1,1]], L4: [[0,0],[1,0],[2,0],[2,1]], S4: [[1,0],[2,0],[0,1],[1,1]],
  F5: [[1,0],[2,0],[0,1],[1,1],[1,2]], I5: [[0,0],[1,0],[2,0],[3,0],[4,0]],
  L5: [[0,0],[1,0],[2,0],[3,0],[3,1]], N5: [[0,0],[1,0],[1,1],[2,1],[3,1]],
  P5: [[0,0],[1,0],[0,1],[1,1],[0,2]], T5: [[0,0],[1,0],[2,0],[1,1],[1,2]],
  U5: [[0,0],[2,0],[0,1],[1,1],[2,1]], V5: [[0,0],[0,1],[0,2],[1,2],[2,2]],
  W5: [[0,0],[0,1],[1,1],[1,2],[2,2]], X5: [[1,0],[0,1],[1,1],[2,1],[1,2]],
  Y5: [[1,0],[0,1],[1,1],[2,1],[3,1]], Z5: [[0,0],[1,0],[1,1],[1,2],[2,2]],
};
const CORNERS = { Blue: [19, 19], Yellow: [0, 19], Red: [0, 0], Green: [19, 0] };
function transform(cells, rot, flip) {
  let out = cells.map(([x, y]) => (flip ? [-x, y] : [x, y]));
  for (let i = 0; i < rot; i++) out = out.map(([x, y]) => [-y, x]);
  const mx = Math.min(...out.map(([x]) => x)), my = Math.min(...out.map(([, y]) => y));
  return out.map(([x, y]) => [x - mx, y - my]);
}
function botLike(view) {
  const seat = 0;
  const idx = (x, y) => y * SIZE + x;
  const me = view.players[seat];
  const legal = (cells) => {
    for (const [x, y] of cells) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
      if (view.board[idx(x, y)] !== null) return false;
    }
    let corner = false;
    for (const [x, y] of cells) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && view.board[idx(nx, ny)] === seat) return false;
      }
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && view.board[idx(nx, ny)] === seat) corner = true;
      }
    }
    if (me.remaining.length === 21) {
      const [kx, ky] = CORNERS[me.color];
      return cells.some(([x, y]) => x === kx && y === ky);
    }
    return corner;
  };
  const ids = [...me.remaining].sort((a, b) => PIECES[b].length - PIECES[a].length);
  for (const pieceId of ids) {
    for (const flip of [false, true]) for (let rot = 0; rot < 4; rot++) {
      const shape = transform(PIECES[pieceId], rot, flip);
      const w = Math.max(...shape.map(([x]) => x)), h = Math.max(...shape.map(([, y]) => y));
      for (let y = 0; y + h < SIZE; y++) for (let x = 0; x + w < SIZE; x++) {
        if (legal(shape.map(([cx, cy]) => [cx + x, cy + y]))) return { type: 'place', pieceId, rot, flip, x, y };
      }
    }
  }
  return { type: 'pass' };
}


// start and wait until ~14 pieces are on the board (bots play three colors)
await new Promise((resolve, reject) => {
  const ws = new WebSocket(WS_URL);
  let started = false;
  const timer = setTimeout(() => { ws.close(); reject(new Error('setup timeout')); }, 90000);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Chase', playerToken: token })));
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === 'joined' && !started) { started = true; ws.send(JSON.stringify({ type: 'start' })); return; }
    if (m.type !== 'state' || m.view?.game !== 'blokus') return;
    if (typeof m.playerIndex === 'number' && m.playerIndex !== 0) return;
    const v = m.view;
    const placedPieces = v.players.reduce((n, p) => n + (21 - p.remaining.length), 0);
    if (placedPieces >= 14) { clearTimeout(timer); ws.close(); resolve(null); return; }
    if (v.phase === 'playing' && v.turn === 0 && v.you === 0) {
      // human plays the largest piece the engine's own bot would: ask the
      // server to validate by trying the canonical opening sweep
      ws.send(JSON.stringify({ type: 'action', action: botLike(v) }));
    }
  });
  ws.on('error', reject);
});

console.log('room', roomId, 'mid-game; shooting');
const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const tv = await browser.newPage();
await tv.setViewport({ width: 1280, height: 800 });
await tv.goto(`${BASE}/board/${roomId}`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 7000));
await tv.screenshot({ path: `${OUT}/blokus-tv.png` });

const dev = await browser.newPage();
await dev.setViewport({ width: 1024, height: 768 });
await dev.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
await dev.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [roomId, token]);
await dev.reload({ waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500));
// select a piece so the tray + controls state shows
await dev.evaluate(() => document.querySelector('[data-testid="bk-piece-W5"], .bk-piece')?.click());
await new Promise((r) => setTimeout(r, 600));
await dev.evaluate(() => {
  const svg = document.querySelector('[data-testid="bk-grid"]');
  const rect = svg.getBoundingClientRect();
  svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width * 0.62, clientY: rect.top + rect.height * 0.62 }));
});
await new Promise((r) => setTimeout(r, 600));
const scroll = await dev.evaluate(() => ({
  x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
}));
console.log('device scroll overflow at 1024x768:', JSON.stringify(scroll));
await dev.screenshot({ path: `${OUT}/blokus-device.png` });
await browser.close();
console.log('shots saved');
process.exit(0);
