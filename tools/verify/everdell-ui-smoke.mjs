// Everdell ship gate: a full 4-seat game played entirely by clicking the real
// device DOM — hand/meadow close-ups, the visual placement board, pending
// prompts, END TURN — never raw WS actions. A stall is a UI finding.
// Usage: node everdell-ui-smoke.mjs [wsPort] [seats] [pageBase]
// wsPort talks to the game server; pageBase is the CLIENT the pages load —
// default the Vite dev server (5173). Pointing pages at the Express port
// serves the last production build, which can be stale.
import puppeteer from 'puppeteer';
import WebSocket from 'ws';

const PORT = process.argv[2] ?? '8787';
const SEATS = Number(process.argv[3] ?? '4');
const BASE = process.argv[4] ?? 'http://localhost:5173';

// ---------- room setup (lobby only; play is all DOM) ----------
// One socket per seat: the host socket creates, joins first, and starts.
function joinSeat(roomId, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const send = (o) => ws.send(JSON.stringify(o));
    ws.on('open', () => send({ type: 'join', roomId, name }));
    ws.on('message', (buf) => {
      const m = JSON.parse(buf.toString());
      if (m.type === 'joined') resolve({ ws, token: m.playerToken });
      if (m.type === 'error') reject(new Error(m.message));
    });
    setTimeout(() => reject(new Error('join timeout')), 8000);
  });
}

async function setupRoom() {
  const host = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const send = (o) => ws.send(JSON.stringify(o));
    let roomId = null;
    ws.on('open', () => send({ type: 'create_room', name: 'Everdell UI smoke', game: 'everdell' }));
    ws.on('message', (buf) => {
      const m = JSON.parse(buf.toString());
      if (m.type === 'room_created') {
        roomId = m.roomId;
        send({ type: 'join', roomId, name: 'Seat1' });
      }
      if (m.type === 'joined') resolve({ ws, roomId, token: m.playerToken });
      if (m.type === 'error') reject(new Error(m.message));
    });
    setTimeout(() => reject(new Error('room setup timeout')), 10000);
  });
  const tokens = [host.token];
  const socks = [host.ws];
  for (let i = 2; i <= SEATS; i++) {
    const { ws, token } = await joinSeat(host.roomId, `Seat${i}`);
    tokens.push(token);
    socks.push(ws);
  }
  host.ws.send(JSON.stringify({ type: 'start' }));
  await sleep(900);
  for (const ws of socks) ws.close(); // pages take over the seats
  return { roomId: host.roomId, tokens };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One driver step for a seat's page. Returns a short description or null.
async function step(page) {
  return page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => [...document.querySelectorAll(sel)];
    const enabled = (el) => el && !el.disabled;
    const click = (el, what) => { el.click(); return what; };

    if (q('.ev-end')) return 'ENDED';

    // 1. pending decision sheet
    const sheet = q('[data-testid="ev-pending-sheet"]');
    if (sheet) {
      const inSheet = (sel) => [...sheet.querySelectorAll(sel)];
      const primary = inSheet('.ev-btn.primary').find(enabled);
      if (primary) return click(primary, `pending:${primary.textContent.slice(0, 24)}`);
      const mapOk = inSheet('.ev-spot.ok, .ev-map-forest.ok, .ev-map-dest.ok, .ev-map-event.ok').find(enabled);
      if (mapOk) return click(mapOk, 'pending:map-target');
      const pick = inSheet('.ev-pick:not(.sel):not(.dim)').find(enabled);
      if (pick) return click(pick, 'pending:pick');
      const plus = inSheet('.ev-stepper button:last-child').find(enabled);
      if (plus) return click(plus, 'pending:step+');
      const anyBtn = inSheet('.ev-btn').find((b) => enabled(b) && !/CLOSE/.test(b.textContent));
      if (anyBtn) return click(anyBtn, `pending:${anyBtn.textContent.slice(0, 24)}`);
      return 'pending:stuck';
    }

    const status = q('[data-testid="ev-status"]')?.textContent ?? '';
    const endBtn = q('[data-testid="ev-end-turn"]');
    if (/PRESS END TURN/.test(status) && enabled(endBtn)) return click(endBtn, 'end-turn');
    if (!/YOUR TURN/.test(status)) return null; // waiting

    // 2. an open close-up: play it if possible, else close
    const playBtn = q('[data-testid="ev-play-card"]');
    if (playBtn) {
      if (enabled(playBtn)) return click(playBtn, 'play-card');
      const close = qa('.ev-sheet .ev-btn').find((b) => /CLOSE/.test(b.textContent));
      if (close) return click(close, 'closeup-close');
    }

    // 3. the placement sheet: tap a glowing target (prefer board spots)
    const place = q('[data-testid="ev-place-sheet"]');
    if (place) {
      const spot = [...place.querySelectorAll('.ev-spot.ok')].find(enabled)
        ?? [...place.querySelectorAll('.ev-map-forest.ok, .ev-map-event.ok, .ev-map-dest.ok')].find(enabled);
      if (spot) return click(spot, 'place-worker(' + (spot.getAttribute('aria-label') ?? '') + ')');
      const close = [...place.querySelectorAll('.ev-btn')].find((b) => /CLOSE/.test(b.textContent));
      const diag = `spots:${place.querySelectorAll('.ev-spot').length}`
        + ` map:${place.querySelectorAll('.ev-map').length}`
        + ` wrap:${place.querySelectorAll('.ev-mapwrap').length}`
        + ` forest:${place.querySelectorAll('.ev-map-forest').length}`
        + ` events:${place.querySelectorAll('.ev-map-event').length}`
        + ` html:${place.innerHTML.length}`;
      if (close) return click(close, 'place-close(' + diag + ')');
    }

    // 4. try a card first (hand then meadow), sometimes; else worker; else season
    const hand = qa('[data-testid="ev-hand"] .ev-hcard');
    const meadow = qa('[data-testid="ev-meadow"] .ev-mcard');
    const tryCards = [...hand, ...meadow];
    const turnCount = (window.__evTried = (window.__evTried ?? 0) + 1);
    const card = tryCards[turnCount % Math.max(1, tryCards.length)];
    if (card && turnCount % 3 !== 0) return click(card, 'open-closeup');

    const placeBtn = qa('.ev-act').find((b) => /PLACE WORKER/.test(b.textContent) && enabled(b));
    if (placeBtn) return click(placeBtn, 'open-place');
    const prep = qa('.ev-act').find((b) => /PREPARE FOR SEASON/.test(b.textContent) && enabled(b));
    if (prep) return click(prep, 'prepare');
    const pass = qa('.ev-act').find((b) => /^PASS/.test(b.textContent.trim()) && enabled(b));
    if (pass) return click(pass, 'pass-arm');
    const confirm = qa('.ev-act').find((b) => /CONFIRM PASS/.test(b.textContent) && enabled(b));
    if (confirm) return click(confirm, 'pass-confirm');
    if (card) return click(card, 'open-closeup-fallback');
    return 'no-move';
  });
}

const { roomId, tokens } = await setupRoom();
console.log('room', roomId, 'seats', tokens.length);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
  ],
});
const pages = [];
for (let i = 0; i < tokens.length; i++) {
  // one isolated browser context per seat: localStorage is per-origin, and
  // four tabs sharing one origin would overwrite each other's seat token
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const label = `page${i + 1}`;
  page.on('pageerror', (e) => console.log(`${label} pageerror:`, e.message.slice(0, 240)));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`${label} console:`, m.text().slice(0, 200)); });
  await page.setViewport({ width: 1024, height: 768 });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [roomId, tokens[i]]);
  await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2', timeout: 45000 });
  pages.push(page);
}
await sleep(2500);
for (let i = 0; i < pages.length; i++) {
  const id = await pages[i].evaluate(() => document.querySelector('.ev-id')?.textContent ?? 'NO ID');
  console.log(`page${i + 1} identity: ${id}`);
  if (!id.includes(`SEAT${i + 1}`)) console.log(`FINDING: page${i + 1} joined the wrong seat`);
}

// One step per seat per round: a click must see its WS round-trip land
// before the next decision, or queued clicks race the view.
let idle = 0;
let ended = false;
let steps = 0;
const startAt = Date.now();
for (let iter = 0; iter < 12000 && !ended; iter++) {
  let acted = false;
  for (let i = 0; i < pages.length && !ended; i++) {
    let what = null;
    try {
      what = await step(pages[i]);
    } catch (e) {
      console.log(`seat${i + 1} step error:`, e.message.slice(0, 120));
    }
    if (what === 'ENDED') { ended = true; break; }
    if (what === 'pending:stuck') {
      console.log(`FINDING: seat${i + 1} pending sheet has no usable control`);
      await pages[i].screenshot({ path: `../../tmp/ev-smoke-stuck-s${i + 1}.png` });
      idle = 999;
      continue;
    }
    if (what && what !== 'no-move' && !String(what).startsWith('wait')) {
      acted = true;
      steps++;
      if (steps % 60 === 0 || String(what).startsWith('place-close') || steps <= 12) {
        console.log(`[${steps}] seat${i + 1}: ${what}`);
      }
    }
  }
  if (!acted) {
    idle++;
    if (idle > 120) {
      console.log('FINDING: UI stalled — no seat could act');
      for (let i = 0; i < pages.length; i++) {
        await pages[i].screenshot({ path: `../../tmp/ev-smoke-stall-s${i + 1}.png` });
        const status = await pages[i].evaluate(() => document.querySelector('[data-testid="ev-status"]')?.textContent);
        console.log(`  seat${i + 1}: ${status}`);
      }
      break;
    }
  } else {
    idle = 0;
  }
  await sleep(140);
  if (Date.now() - startAt > 25 * 60 * 1000) { console.log('FINDING: 25-minute timeout'); break; }
}

if (ended) {
  await sleep(800);
  const summary = await pages[0].evaluate(() => document.querySelector('.ev-end')?.textContent ?? '');
  console.log('GAME ENDED:', summary.slice(0, 220));
  await pages[0].screenshot({ path: '../../tmp/ev-smoke-end.png' });
  console.log('UI SMOKE PASSED');
} else {
  console.log('UI SMOKE DID NOT FINISH');
}
await browser.close();
process.exit(ended ? 0 : 1);
