// Container ship gate: a full game played entirely by clicking the real
// device DOM, one puppeteer page per seat (4 seats). No raw WS actions —
// if this stalls, the UI is missing an affordance a human would also miss.
// Run: node tools/verify/container-ui-smoke.mjs [base-url]

import puppeteer from 'puppeteer';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const SEATS = 4;

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
  ws.on('open', () => send({ type: 'create_room', name: 'Container UI smoke', game: 'container', options: { length: 'short' } }));
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
    } else if (m.type === 'joined') {
      tokens.unshift(m.playerToken); // creator holds seat 0
      maybeDone();
    } else if (m.type === 'error') reject(new Error(m.message));
  });
  setTimeout(() => reject(new Error('room setup timeout')), 15000);
});

const textOf = (el) => el.evaluate((n) => n.textContent ?? '');

/** find + click a button by text in ONE in-page evaluate (fast) */
async function clickButton(page, re, { onlyEnabled = true } = {}) {
  return page.evaluate((src, flags, enabledOnly) => {
    const rx = new RegExp(src, flags);
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!rx.test(t)) continue;
      if (enabledOnly && b.disabled) continue;
      b.click();
      return t;
    }
    return null;
  }, re.source, re.flags, onlyEnabled).catch(() => null);
}
const hasText = async (page, re) => re.test(await page.evaluate(() => document.body.innerText));

async function drainDialogs(page) {
  // arrangement dialog: pool chip -> price button until CONFIRM enabled
  for (let i = 0; i < 40; i++) {
    if (await clickButton(page, /^CONFIRM PRICES$/)) return true;
    const chip = await page.$('.cont-arrange-pool .cont-chip');
    if (!chip) break;
    await chip.click();
    // lowest factory price to keep goods affordable for the other seats
    const priced = await clickButton(page, /^\$\d+\s*\+?$/);
    if (!priced) break;
  }
  // produce/build color pick: click chips until CONFIRM enables
  if (await page.$('.cont-produce-pick')) {
    for (let i = 0; i < 6; i++) {
      if (await clickButton(page, /^CONFIRM$/)) return true;
      const chip = await page.$('.cont-produce-pick .cont-chip:not(.active)');
      if (!chip) break;
      await chip.click();
    }
    await clickButton(page, /^CONFIRM$/);
    return true;
  }
  // purchase pickers: press a few + steppers then confirm
  if (await page.$('.cont-pick')) {
    for (let i = 0; i < 3; i++) {
      const plus = (await page.$$('.cont-mini')).at(-1);
      if (plus && /\+/.test(await textOf(plus))) await plus.click().catch(() => {});
      if (await clickButton(page, /^(BUY AND PLACE|BUY AND LOAD|SAIL TO THE BANK|PLACE BID)$/)) return true;
    }
    if (await clickButton(page, /^(BUY AND PLACE|BUY AND LOAD|SAIL TO THE BANK|PLACE BID)$/)) return true;
    await clickButton(page, /^✕$/, { onlyEnabled: false });
    return true;
  }
  // bank distribute / seizure
  if (await hasText(page, /DISTRIBUTE YOUR BID|BANK SEIZURE/)) {
    for (let i = 0; i < 20; i++) {
      const chip = await page.$('.cont-arrange-pool .cont-chip, .ig-modal .cont-chip');
      if (chip) await chip.click().catch(() => {});
      await clickButton(page, /·\s*\d+\/\d+$/); // lot buttons in distribute
      if (await clickButton(page, /^CONFIRM( SEIZURE)?$/)) return true;
    }
  }
  return false;
}

async function act(page, idx, turnCounter) {
  // delivery prompts first
  if (await clickButton(page, /^PLACE SECRET BID$/)) return 'bid';
  if (await clickButton(page, /^ACCEPT HIGH BID|^ACCEPT ·/)) return 'accept';
  if (await hasText(page, /DELIVERY · BIDS REVEALED/)) {
    if (await clickButton(page, /^BUY OUT/)) return 'buyout';
  }
  if (await drainDialogs(page)) return 'dialog';

  const myTurn = await hasText(page, /YOUR TURN ·/);
  if (!myTurn) return null;

  // once, early: exercise CALL BANK through the UI
  if (idx === 0 && turnCounter.calls === 0 && await clickButton(page, /^CALL BANK$/)) {
    if (await clickButton(page, /^BID CASH FOR CONTAINER LOT/)) {
      turnCounter.calls = 1;
      await new Promise((r) => setTimeout(r, 150));
      await clickButton(page, /^\+1$/);
      await clickButton(page, /^PLACE BID$/);
      return 'call-bank';
    }
    await clickButton(page, /^✕$/, { onlyEnabled: false });
  }

  if (await clickButton(page, /^PRODUCE/)) return 'produce';
  if (turnCounter.n < 3 && await clickButton(page, /^BUILD FACTORY/)) return 'build';
  // keep goods moving: buy from factories when possible
  if (await clickButton(page, /^FACTORY PURCHASE$/)) {
    await new Promise((r) => setTimeout(r, 150));
    if (await clickButton(page, /FOR SALE$/)) return 'factory-buy';
    await clickButton(page, /^✕$/, { onlyEnabled: false });
  }
  if (await clickButton(page, /^HARBOR PURCHASE/)) return 'harbor-buy';
  if (await clickButton(page, /^SAIL$/)) {
    await new Promise((r) => setTimeout(r, 150));
    if (await clickButton(page, /^CONTAINER ISLAND ·(?!.*EMPTY SHIP)/)) return 'sail-island';
    if (await clickButton(page, /'S HARBOR · [1-9]/)) return 'sail-harbor';
    if (await clickButton(page, /^TO THE OCEAN$/)) return 'sail-ocean';
    await clickButton(page, /^✕$/, { onlyEnabled: false });
  }
  if (await clickButton(page, /^TAKE LOAN$/) && await hasText(page, /CASH\s*\$[0-3]\b/)) return 'loan';
  if (await clickButton(page, /^END TURN$/)) return 'end';
  return null;
}

const { roomId, tokens } = await wsCall();
console.log('room', roomId);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--window-size=1100,820'],
});
const pages = [];
for (let i = 0; i < SEATS; i++) {
  // one incognito context per seat: the token key is per-room, so shared
  // storage would put every page in the last-joined seat
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  await page.evaluateOnNewDocument((room, token) => {
    localStorage.setItem('bge-token-' + room.toUpperCase(), token);
  }, roomId, tokens[i]);
  await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
  pages.push(page);
}
await new Promise((r) => setTimeout(r, 2500));

let lastProgress = Date.now();
let steps = 0;
const counters = pages.map(() => ({ n: 0, calls: 0 }));
for (let tick = 0; tick < 4000; tick++) {
  let advanced = false;
  for (let i = 0; i < SEATS; i++) {
    if (await hasText(pages[i], /GAME OVER/)) {
      console.log(`UI GAME COMPLETE after ${steps} clicks`);
      await pages[0].screenshot({ path: 'tools/verify/container-ui-final.png' });
      await browser.close();
      process.exit(0);
    }
    const what = await act(pages[i], i, counters[i]);
    if (what) {
      steps++;
      counters[i].n++;
      lastProgress = Date.now();
      advanced = true;
      if (steps % 10 === 0 || steps < 40) console.log(`#${steps} seatpage ${i}: ${what}`);
      await new Promise((r) => setTimeout(r, 90));
    }
  }
  if (!advanced) await new Promise((r) => setTimeout(r, 220));
  if (Date.now() - lastProgress > 90000) {
    console.error('UI STALL after', steps, 'clicks');
    for (let i = 0; i < SEATS; i++) {
      await pages[i].screenshot({ path: `tools/verify/container-ui-stall-${i}.png` });
      console.error(`seat ${i} sees:`, (await pages[i].evaluate(() => document.body.innerText)).slice(0, 400).replace(/\n+/g, ' | '));
    }
    await browser.close();
    process.exit(1);
  }
}
console.error('tick limit reached');
process.exit(1);
