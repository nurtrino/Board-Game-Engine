// Probe: fill the active seat's factory + harbor lots with containers via the
// real UI, then screenshot the 3D personal mat at a large size to judge
// container scale and lot placement.
import puppeteer from 'puppeteer';
import WebSocket from 'ws';

const BASE = 'http://localhost:8787';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const SEATS = 4;
const OUT = process.argv[2] ?? 'tools/verify';

const wsCall = () => new Promise((resolve, reject) => {
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
  ws.on('open', () => send({ type: 'create_room', name: 'mat probe', game: 'container', options: { length: 'short' } }));
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    if (m.type === 'room_created') {
      roomId = m.roomId;
      send({ type: 'join', roomId, name: `UI ${++joining}` });
      for (let i = 1; i < SEATS; i++) {
        const w = new WebSocket(WS_URL);
        w.on('open', () => w.send(JSON.stringify({ type: 'join', roomId, name: `UI ${++joining}` })));
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

const clickButton = (page, re, { onlyEnabled = true } = {}) => page.evaluate((src, enabledOnly) => {
  const rx = new RegExp(src);
  for (const b of document.querySelectorAll('button')) {
    const t = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!rx.test(t)) continue;
    if (enabledOnly && b.disabled) continue;
    b.click();
    return t;
  }
  return null;
}, re.source, onlyEnabled);

async function drainArrange(page) {
  // place every pool chip into the $2 lot, then confirm
  for (let i = 0; i < 30; i++) {
    if (await clickButton(page, /^CONFIRM PRICES$/)) return true;
    const chip = await page.$('.cont-arrange-pool .cont-chip');
    if (!chip) break;
    await chip.click().catch(() => {});
    await clickButton(page, /^\$2\s*\+?$/);
  }
  return clickButton(page, /^CONFIRM PRICES$/);
}

const { roomId, tokens } = await wsCall();
console.log('room', roomId);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--window-size=1500,1000'],
});
const pages = [];
for (let i = 0; i < SEATS; i++) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1440, height: 950 });
  await p.evaluateOnNewDocument((room, token) => {
    localStorage.setItem('bge-token-' + room.toUpperCase(), token);
  }, roomId, tokens[i]);
  await p.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
  pages.push(p);
}
await new Promise((r) => setTimeout(r, 2000));
for (const p of pages) await clickButton(p, /^Got it$/);

const activePage = async () => {
  for (const p of pages) {
    if (await p.evaluate(() => document.body.innerText.includes('YOUR TURN ·'))) return p;
  }
  return null;
};
const page = await activePage();
if (!page) { console.error('no active page'); process.exit(1); }

// action 1: produce 1 container into the $2 factory lot
console.log('produce:', await clickButton(page, /^PRODUCE/));
await new Promise((r) => setTimeout(r, 400));
console.log('arrange:', await drainArrange(page));
await new Promise((r) => setTimeout(r, 400));

// action 2: factory purchase from the first opponent with stock -> harbor $2
console.log('factory buy:', await clickButton(page, /^FACTORY PURCHASE$/));
await new Promise((r) => setTimeout(r, 300));
console.log('pick seller:', await clickButton(page, /FOR SALE$/));
await new Promise((r) => setTimeout(r, 300));
// press the last + stepper once (one container available from the seller)
const plus = (await page.$$('.cont-mini')).at(-1);
if (plus) await plus.click().catch(() => {});
console.log('buy:', await clickButton(page, /^BUY AND PLACE$/));
await new Promise((r) => setTimeout(r, 300));
console.log('arrange harbor:', await drainArrange(page));
await new Promise((r) => setTimeout(r, 900));

await page.screenshot({ path: `${OUT}/mat-probe.png` });
// TV: same room, camera on the acting seat's board region
const tv = await (await browser.createBrowserContext()).newPage();
await tv.setViewport({ width: 1280, height: 720 });
await tv.goto(`${BASE}/board/${roomId}`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 3500));
await tv.screenshot({ path: `${OUT}/mat-probe-tv.png` });
console.log('done');
await browser.close();
process.exit(0);
