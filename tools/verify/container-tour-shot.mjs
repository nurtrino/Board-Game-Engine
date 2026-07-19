// Screenshot the Container device walkthrough: the auto-opened intro, then a
// few live coach-mark tour steps. Creates its own room.
// Run: node tools/verify/container-tour-shot.mjs <base> <outdir>

import puppeteer from 'puppeteer';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const OUT = process.argv[3] ?? '.';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

const room = await new Promise((resolve, reject) => {
  const ws = new WebSocket(WS_URL);
  const send = (m) => ws.send(JSON.stringify(m));
  let roomId = null;
  ws.on('open', () => send({ type: 'create_room', game: 'container', name: 'tour shot', options: { length: 'standard' } }));
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === 'room_created') { roomId = m.roomId; send({ type: 'join', roomId, name: 'Chase' }); }
    if (m.type === 'joined') { setTimeout(() => send({ type: 'start' }), 250); setTimeout(() => resolve({ roomId, token: m.playerToken }), 900); }
    if (m.type === 'error') reject(new Error(m.message));
  });
  setTimeout(() => reject(new Error('setup timeout')), 12000);
});
console.log('room', room.roomId);

const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 768 });
await page.evaluateOnNewDocument((r, t) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), room.roomId, room.token);
await page.goto(`${BASE}/play/${room.roomId}`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 2500));

await page.screenshot({ path: `${OUT}/tour-0-intro.png` });

const click = (re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  for (const b of document.querySelectorAll('button')) {
    if (rx.test((b.textContent ?? '').trim())) { b.click(); return true; }
  }
  return false;
}, re.source);

await click(/walk me through/i);
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: `${OUT}/tour-1-welcome.png` });
for (let i = 0; i < 3; i++) { await click(/^NEXT$/); await new Promise((r) => setTimeout(r, 550)); }
await page.screenshot({ path: `${OUT}/tour-2-produce.png` });
for (let i = 0; i < 8; i++) { await click(/^NEXT$/); await new Promise((r) => setTimeout(r, 450)); }
await page.screenshot({ path: `${OUT}/tour-3-scorecard.png` });

await browser.close();
console.log('done');
process.exit(0); // the room WS stays referenced otherwise
