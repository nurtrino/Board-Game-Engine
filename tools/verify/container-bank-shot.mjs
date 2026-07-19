// Visual check: open a device page, press CALL BANK, screenshot the bank
// close-up (before pick, after token drop, and the bid-tile widget after bid).
import puppeteer from 'puppeteer';
import WebSocket from 'ws';

const BASE = 'http://localhost:8787';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const SEATS = 3;
const OUT = process.argv[2] ?? 'tools/verify';

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
  ws.on('open', () => send({ type: 'create_room', name: 'bank shot', game: 'container', options: { length: 'short' } }));
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    if (m.type === 'room_created') {
      roomId = m.roomId;
      send({ type: 'join', roomId, name: `Shot ${++joining}` });
      for (let i = 1; i < SEATS; i++) {
        const w = new WebSocket(WS_URL);
        w.on('open', () => w.send(JSON.stringify({ type: 'join', roomId, name: `Shot ${++joining}` })));
        w.on('message', (d) => {
          const mm = JSON.parse(d.toString());
          if (mm.type === 'joined') { tokens.push(mm.playerToken); maybeDone(); }
        });
      }
    } else if (m.type === 'joined') { tokens.unshift(m.playerToken); maybeDone(); }
    else if (m.type === 'error') reject(new Error(m.message));
  });
  setTimeout(() => reject(new Error('timeout')), 15000);
});

const clickButton = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src);
  for (const b of document.querySelectorAll('button')) {
    const t = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (rx.test(t) && !b.disabled) { b.click(); return t; }
  }
  return null;
}, re.source);

const { roomId, tokens } = await setup();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--window-size=1100,820'],
});
// open every seat, find whose turn it is
const pages = [];
for (let i = 0; i < SEATS; i++) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1024, height: 768 });
  await p.evaluateOnNewDocument((room, token) => {
    localStorage.setItem('bge-token-' + room.toUpperCase(), token);
  }, roomId, tokens[i]);
  await p.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  await clickButton(p, /^(Got it|CLOSE|SKIP)$/i); // dismiss intro
  pages.push(p);
}
await new Promise((r) => setTimeout(r, 300));
const activePage = async () => {
  for (const p of pages) {
    if (await p.evaluate(() => document.body.innerText.includes('YOUR TURN ·'))) return p;
  }
  return null;
};
const page = await activePage();
if (!page) { console.error('no active seat found'); process.exit(1); }

console.log('call bank:', await clickButton(page, /^CALL BANK$/));
await new Promise((r) => setTimeout(r, 2600)); // canvas + textures
await page.screenshot({ path: `${OUT}/bank-1-closeup.png` });
console.log('pick lot:', await clickButton(page, /^BID CASH · LOT/));
await new Promise((r) => setTimeout(r, 400)); // mid-drop
await page.screenshot({ path: `${OUT}/bank-2-drop.png` });
await new Promise((r) => setTimeout(r, 700)); // dialog open
await page.screenshot({ path: `${OUT}/bank-3-dialog.png` });
await clickButton(page, /^\+1$/);
await clickButton(page, /^\+1$/);
console.log('place bid:', await clickButton(page, /^PLACE BID$/));
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/bank-4-tile.png` });

// hand the turn over and let the next player OUTBID through the close-up
console.log('end turn:', await clickButton(page, /^END TURN$/));
await new Promise((r) => setTimeout(r, 900));
const rival = await activePage();
if (!rival) { console.error('no rival seat found'); process.exit(1); }
console.log('rival call bank:', await clickButton(rival, /^CALL BANK$/));
await new Promise((r) => setTimeout(r, 2200)); // canvas + textures
await rival.screenshot({ path: `${OUT}/bank-5-outbid.png` });
console.log('outbid spot:', await clickButton(rival, /^OUTBID · \$/));
await new Promise((r) => setTimeout(r, 400));
await clickButton(rival, /^\+1$/);
console.log('rival place bid:', await clickButton(rival, /^PLACE BID$/));
await new Promise((r) => setTimeout(r, 900));
await rival.screenshot({ path: `${OUT}/bank-6-outbid-tile.png` });
const body = await rival.evaluate(() => document.body.innerText);
console.log('rival holds tile:', body.includes('YOUR BID TILE'));

// the TV: auction token on the lot, bid tile with the money by the bidder
const tv = await (await browser.createBrowserContext()).newPage();
await tv.setViewport({ width: 1280, height: 720 });
await tv.goto(`${BASE}/board/${roomId}`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 3500));
await tv.screenshot({ path: `${OUT}/bank-7-tv.png` });
await browser.close();
process.exit(0);
