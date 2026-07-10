// Create a fresh 1941 room and screenshot the live 3D TV board with the full
// setup rendered in the mod's meshes: whole map + regional close-ups.
// Run: node tools/verify/shoot-axis-board.mjs [base] [wsUrl] [outDir]

import WebSocket from 'ws';
import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const WS_URL = process.argv[3] ?? 'ws://localhost:8899/ws';
const OUT = process.argv[4] ?? path.join(process.env.TMP ?? '/tmp', 'axshots');
fs.mkdirSync(OUT, { recursive: true });

function wsOnce(setup, wanted) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => setup(ws));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'error') { ws.close(); reject(new Error(m.message)); }
      const out = wanted(m, ws);
      if (out !== undefined) { ws.close(); resolve(out); }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('ws timeout')); }, 15000);
  });
}

const roomId = await wsOnce(
  (ws) => ws.send(JSON.stringify({ type: 'create_room', name: 'Board shots', game: 'axis', options: { scenario: '1941', rnd: false, nationalObjectives: true, winCondition: 'standard' } })),
  (m) => (m.type === 'room_created' ? m.roomId : undefined),
);
const token = await wsOnce(
  (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Shooter' })),
  (m) => (m.type === 'joined' ? m.playerToken : undefined),
);
await wsOnce(
  (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Shooter', playerToken: token })),
  (m, ws) => {
    if (m.type === 'joined') { ws.send(JSON.stringify({ type: 'start' })); return undefined; }
    return m.type === 'state' ? true : undefined;
  },
);
console.log('room', roomId);

const SHOTS = [
  ['board-wide', ''],
  ['board-europe', '?cam=2800,1400,17'],
  ['board-pacific', '?cam=6900,2600,24'],
  ['board-atlantic-us', '?cam=700,1900,16'],
];

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1720, height: 940, deviceScaleFactor: 1 });
  for (const [name, cam] of SHOTS) {
    await page.goto(`${BASE}/board/${roomId}${cam}`, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise((r) => setTimeout(r, name === 'board-wide' ? 35000 : 18000)); // OBJ parses + camera settle
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  }
} finally {
  await browser.close();
}
console.log('done ->', OUT);
