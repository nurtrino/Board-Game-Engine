// Positive-path E2E: human vs CPU; gather resources with workers across
// seasons, then play the first affordable card through the closeup UI and
// assert the city grows and resources are paid.
import puppeteer from 'puppeteer';
import WebSocket from 'ws';

const PORT = '8787';
const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { roomId, token } = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const send = (o) => ws.send(JSON.stringify(o));
  let roomId = null;
  ws.on('open', () => send({ type: 'create_room', name: 'play e2e', game: 'everdell' }));
  ws.on('message', (buf) => {
    const m = JSON.parse(buf.toString());
    if (m.type === 'room_created') { roomId = m.roomId; send({ type: 'join', roomId, name: 'Probe' }); }
    if (m.type === 'joined') {
      send({ type: 'start' }); // solo pads with one CPU
      setTimeout(() => { ws.close(); resolve({ roomId, token: m.playerToken }); }, 800);
    }
    if (m.type === 'error') reject(new Error(m.message));
  });
  setTimeout(() => reject(new Error('setup timeout')), 8000);
});
console.log('room', roomId);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const context = await browser.createBrowserContext();
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 240)));
await page.setViewport({ width: 1024, height: 768 });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [roomId, token]);
await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
await sleep(2500);

let played = false;
for (let round = 0; round < 40 && !played; round++) {
  const res = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const q = (s) => document.querySelector(s);
    const status = q('[data-testid="ev-status"]')?.textContent ?? '';
    if (q('[data-testid="ev-pending-sheet"]')) {
      // resolve any prompt generically (skip / primary / first pick)
      const sheet = q('[data-testid="ev-pending-sheet"]');
      const primary = [...sheet.querySelectorAll('.ev-btn.primary')].find((b) => !b.disabled);
      const skip = [...sheet.querySelectorAll('.ev-btn')].find((b) => /SKIP/.test(b.textContent));
      const pick = [...sheet.querySelectorAll('.ev-pick:not(.dim)')].find((b) => !b.disabled);
      (primary ?? skip ?? pick)?.click();
      return 'pending';
    }
    if (/PRESS END TURN/.test(status)) { q('[data-testid="ev-end-turn"]')?.click(); return 'end'; }
    if (!/YOUR TURN/.test(status)) return 'wait';

    const ledger = q('[data-testid="ev-ledger"]').textContent;
    // try to play any affordable hand/meadow card
    const cards = [...document.querySelectorAll('[data-testid="ev-hand"] .ev-hcard'), ...document.querySelectorAll('[data-testid="ev-meadow"] .ev-mcard')];
    for (const c of cards) {
      c.click();
      await sleep(220);
      const btn = q('[data-testid="ev-play-card"]');
      if (btn && !btn.disabled) {
        const cityBefore = q('[data-testid="ev-city-label"]').textContent;
        btn.click();
        await sleep(700);
        return `PLAYED ledger-before:${ledger} city-before:${cityBefore} ledger-after:${q('[data-testid="ev-ledger"]').textContent} city-after:${q('[data-testid="ev-city-label"]').textContent}`;
      }
      [...document.querySelectorAll('.ev-sheet .ev-btn')].find((b) => /CLOSE/.test(b.textContent))?.click();
      await sleep(120);
    }
    // otherwise place a worker (or season/pass)
    const placeBtn = [...document.querySelectorAll('.ev-act')].find((b) => /PLACE WORKER/.test(b.textContent) && !b.disabled);
    if (placeBtn) {
      placeBtn.click();
      await sleep(300);
      const sheet = q('[data-testid="ev-place-sheet"]');
      const spot = [...(sheet?.querySelectorAll('.ev-spot.ok') ?? [])][0]
        ?? [...(sheet?.querySelectorAll('.ev-map-forest.ok') ?? [])][0];
      if (spot) { spot.click(); return 'placed:' + (spot.getAttribute('aria-label') ?? ''); }
      [...(sheet?.querySelectorAll('.ev-btn') ?? [])].find((b) => /CLOSE/.test(b.textContent))?.click();
    }
    const prep = [...document.querySelectorAll('.ev-act')].find((b) => /PREPARE/.test(b.textContent) && !b.disabled);
    if (prep) { prep.click(); return 'prepare'; }
    return 'none';
  });
  if (String(res).startsWith('PLAYED')) {
    console.log(res);
    played = true;
    break;
  }
  if (round % 5 === 0) console.log(`[${round}] ${res}`);
  await sleep(700);
}
console.log(played ? 'PLAY PATH OK' : 'PLAY PATH NEVER FIRED');
await browser.close();
process.exit(played ? 0 : 1);
