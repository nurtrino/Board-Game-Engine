// Verify the TV fly-to: create a solo-vs-CPU room, place a worker via the
// device DOM, then screenshot the TV mid-flight and after the ease-back.
import puppeteer from 'puppeteer';
import WebSocket from 'ws';

const PORT = '8787';
const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { roomId, token } = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const send = (o) => ws.send(JSON.stringify(o));
  let roomId = null;
  ws.on('open', () => send({ type: 'create_room', name: 'fly test', game: 'everdell' }));
  ws.on('message', (buf) => {
    const m = JSON.parse(buf.toString());
    if (m.type === 'room_created') { roomId = m.roomId; send({ type: 'join', roomId, name: 'Fly' }); }
    if (m.type === 'joined') {
      send({ type: 'start' });
      setTimeout(() => { ws.close(); resolve({ roomId, token: m.playerToken }); }, 800);
    }
    if (m.type === 'error') reject(new Error(m.message));
  });
  setTimeout(() => reject(new Error('setup timeout')), 8000);
});
console.log('room', roomId);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'],
});
const tvCtx = await browser.createBrowserContext();
const tv = await tvCtx.newPage();
await tv.setViewport({ width: 1280, height: 800 });
await tv.goto(`${BASE}/board/${roomId}`, { waitUntil: 'networkidle2' });

const devCtx = await browser.createBrowserContext();
const dev = await devCtx.newPage();
await dev.setViewport({ width: 1024, height: 768 });
await dev.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await dev.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [roomId, token]);
await dev.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
await sleep(3500);

// place a worker on the berry spot (far right of the board)
const placed = await dev.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('PLACE WORKER'));
  if (!btn || btn.disabled) return 'no place button';
  btn.click();
  await sleep(400);
  const spot = document.querySelector('.ev-spot.ok[aria-label*="BERRY · SHARED"], .ev-spot.ok[aria-label*="1 BERRY"]')
    ?? document.querySelector('.ev-spot.ok');
  if (!spot) return 'no spot';
  const label = spot.getAttribute('aria-label');
  spot.click();
  return 'placed ' + label;
});
console.log(placed);

await sleep(1600); // mid-hold of the fly-in
await tv.screenshot({ path: '../../tmp/ev-fly-mid.png' });
await sleep(4500); // after ease-back
await tv.screenshot({ path: '../../tmp/ev-fly-home.png' });
console.log('shots written');
await browser.close();
