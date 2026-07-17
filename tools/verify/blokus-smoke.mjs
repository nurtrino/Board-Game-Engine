// Live WS smoke for Blokus 20x20: create a room, join one human seat, start,
// and play the human's color with the engine's own bot policy over the real
// server while the server's CPUs drive the other three colors. Asserts the
// game reaches 'ended' with scores and no rejected actions.
// Run: node tools/verify/blokus-smoke.mjs [wsUrl]

import WebSocket from 'ws';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WS_URL = process.argv[2] ?? 'ws://localhost:8899/ws';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '../../package.json'));
// engine helpers straight from the workspace source via tsx-less import:
// blokus modules are plain TS; use the compiled logic through tsx loader is
// unavailable here, so re-derive the bot from the view with a local probe.

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

// ---- minimal mirror of the engine legality for the driver's own moves ----
const SIZE = 20;
const PIECES = {
  I1: [[0, 0]], I2: [[0, 0], [1, 0]], I3: [[0, 0], [1, 0], [2, 0]], V3: [[0, 0], [1, 0], [0, 1]],
  I4: [[0, 0], [1, 0], [2, 0], [3, 0]], O4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T4: [[0, 0], [1, 0], [2, 0], [1, 1]], L4: [[0, 0], [1, 0], [2, 0], [2, 1]], S4: [[1, 0], [2, 0], [0, 1], [1, 1]],
  F5: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], I5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  L5: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], N5: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]],
  P5: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]], T5: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
  U5: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]], V5: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  W5: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]], X5: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  Y5: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1]], Z5: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
};
const CORNERS = { Blue: [19, 19], Yellow: [0, 19], Red: [0, 0], Green: [19, 0] };

function transform(cells, rot, flip) {
  let out = cells.map(([x, y]) => (flip ? [-x, y] : [x, y]));
  for (let i = 0; i < rot; i++) out = out.map(([x, y]) => [-y, x]);
  const mx = Math.min(...out.map(([x]) => x));
  const my = Math.min(...out.map(([, y]) => y));
  return out.map(([x, y]) => [x - mx, y - my]);
}

function legal(view, seat, cells) {
  const idx = (x, y) => y * SIZE + x;
  const me = view.players[seat];
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
}

function findMove(view, seat) {
  const me = view.players[seat];
  const ids = [...me.remaining].sort((a, b) => PIECES[b].length - PIECES[a].length);
  for (const pieceId of ids) {
    for (const flip of [false, true]) for (let rot = 0; rot < 4; rot++) {
      const shape = transform(PIECES[pieceId], rot, flip);
      const w = Math.max(...shape.map(([x]) => x));
      const h = Math.max(...shape.map(([, y]) => y));
      for (let y = 0; y + h < SIZE; y++) for (let x = 0; x + w < SIZE; x++) {
        if (legal(view, seat, shape.map(([cx, cy]) => [cx + x, cy + y]))) {
          return { type: 'place', pieceId, rot, flip, x, y };
        }
      }
    }
  }
  return { type: 'pass' };
}

const roomId = await wsOnce(
  (ws) => ws.send(JSON.stringify({ type: 'create_room', name: 'Blokus smoke', game: 'blokus' })),
  (m) => (m.type === 'room_created' ? m.roomId : undefined),
);
const token = await wsOnce(
  (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Smoke', color: 'Blue' })),
  (m) => (m.type === 'joined' ? m.playerToken : undefined),
);
console.log('room', roomId);

await new Promise((resolve, reject) => {
  const ws = new WebSocket(WS_URL);
  let started = false;
  let acted = 0;
  const deadline = setTimeout(() => { ws.close(); reject(new Error('smoke timeout (180s)')); }, 180000);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Smoke', playerToken: token })));
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === 'error') { clearTimeout(deadline); ws.close(); reject(new Error(m.message)); return; }
    if (m.type === 'joined' && !started) { started = true; ws.send(JSON.stringify({ type: 'start' })); return; }
    if (m.type !== 'state' || !m.view || m.view.game !== 'blokus') return;
    const view = m.view;
    if (typeof m.playerIndex === 'number' && m.playerIndex !== 0) return;
    if (view.phase === 'ended') {
      clearTimeout(deadline);
      ws.close();
      const scores = view.players.map((p) => `${p.color}:${p.score}`).join(' ');
      const filled = view.board.filter((c) => c !== null).length;
      console.log(`ENDED after ${acted} human actions · filled ${filled} · ${scores}`);
      if (view.players.some((p) => p.score === null)) reject(new Error('missing scores'));
      else resolve(null);
      return;
    }
    if (view.phase === 'playing' && view.turn === 0 && view.you === 0) {
      const action = findMove(view, 0);
      acted++;
      ws.send(JSON.stringify({ type: 'action', action }));
    }
  });
  ws.on('error', reject);
});
console.log('SMOKE OK');
process.exit(0);
