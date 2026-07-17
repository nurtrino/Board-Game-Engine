// UI-driven full-game smoke for Dune: Imperium (playbook §6.4b ship gate).
// Creates a room, joins FOUR seats over WS (tokens only — no gameplay via
// WS), then opens four puppeteer pages on /play/:room and plays an entire
// game by clicking the real device DOM: leader grid, hand cards, space
// picker, deploy/sell pickers, acquire strip, intrigue drawer, pending
// prompts, combat pass. If it stalls, the UI is missing an affordance.
// Run: node tools/verify/dune-ui-smoke.mjs [base] [wsUrl]

import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const WS_URL = process.argv[3] ?? 'ws://localhost:8787/ws';
const SEATS = 4;
const STALL_MS = 90_000;
const HARD_MS = 20 * 60_000;

// ---- 1. create the room and claim four seats over WS (setup only) ----
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

async function setupRoom() {
  const roomId = await wsOnce(
    (ws) => ws.send(JSON.stringify({ type: 'create_room', name: 'UI smoke', game: 'dune' })),
    (m) => (m.type === 'room_created' ? m.roomId : undefined),
  );
  const tokens = [];
  for (let i = 0; i < SEATS; i++) {
    tokens.push(await wsOnce(
      (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: `Seat${i + 1}` })),
      (m) => (m.type === 'joined' ? m.playerToken : undefined),
    ));
  }
  // start from the first seat and wait for the first state push
  await wsOnce(
    (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Seat1', playerToken: tokens[0] })),
    (m, ws) => {
      if (m.type === 'joined') { ws.send(JSON.stringify({ type: 'start' })); return undefined; }
      return m.type === 'state' && m.view?.phase ? true : undefined;
    },
  );
  return { roomId, tokens };
}

// ---- 2. one decision tick, entirely inside the page DOM ----
// Returns a short string describing what was clicked (or null).
function tickInPage() {
  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  const enabled = (els) => els.filter((b) => !b.disabled);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const label = document.querySelector('.dn-lab')?.textContent ?? '';
  const heading = document.querySelector('.dn-main h1')?.textContent ?? '';
  const banner = document.querySelector('.dn-banner')?.textContent ?? '';
  const myBanner = document.querySelector('.dn-banner.you')?.textContent ?? '';
  const byText = (t) => q('button').find((b) => b.textContent.trim() === t);

  // game over?
  if (/\bwins\b/i.test(banner)) return 'ENDED:' + banner;

  // dismiss the rules intro
  const got = byText('Got it');
  if (got) { got.click(); return 'intro'; }

  // leader pick
  if (heading === 'Choose your leader') {
    const cards = enabled(q('button.dn-card'));
    if (cards.length) { pick(cards).click(); return 'leader'; }
    return null;
  }

  // pending decision prompt: a .dn-overlay with no Close button (the House
  // mat and intrigue drawer both have Close; prompts never do)
  const overlays = q('.dn-overlay');
  for (const ov of overlays) {
    const closeBtn = q('button', ov).find((b) => b.textContent.trim() === 'Close');
    if (closeBtn) {
      // an open drawer: play something if the drawer offers it, else close
      const plays = enabled(q('button.dn-space', ov)).concat(enabled(q('button.dn-btn', ov)).filter((b) => /^Deploy \d$/.test(b.textContent.trim())));
      if (plays.length) { plays[0].click(); return 'drawer-play'; }
      closeBtn.click(); return 'drawer-close';
    }
    const btns = enabled([...q('button.dn-btn', ov), ...q('button.dn-space', ov)]);
    if (btns.length) { pick(btns).click(); return 'pending'; }
  }

  // Prefer unambiguous enabled controls over prose matching so a harmless
  // status-copy change cannot strand a full-game run.
  const revealNow = enabled(q('button')).find((b) => b.textContent.trim().startsWith('Reveal'));
  if (revealNow) { revealNow.click(); return 'reveal'; }
  const endNow = byText('End Turn');
  if (endNow && !endNow.disabled) { endNow.click(); return 'end-turn'; }
  const passNow = byText('Pass');
  if (passNow && !passNow.disabled) { passNow.click(); return 'combat-pass'; }

  // space picker
  if (label.startsWith('Send an agent with')) {
    const sendAgent = enabled(q('button.dn-btn')).find((b) => b.textContent.trim().startsWith('Send agent'));
    if (sendAgent) { sendAgent.click(); return 'send-agent'; }
    const nums = enabled(q('button.dn-btn')).filter((b) => /^\d( for \d+)?$/.test(b.textContent.trim()));
    if (nums.length) { nums[0].click(); return 'picker-num'; }
    const spaces = enabled(q('button.dn-space')).filter((b) => !b.textContent.includes('Card effect'));
    if (spaces.length) { spaces[0].click(); return 'space'; }
    const back = byText('Back');
    if (back) { back.click(); return 'back'; }
    return null;
  }

  // main screen decisions, keyed off the status line
  if (myBanner.includes('Tap a card to place an agent')) {
    const hand = enabled(q('button.dn-card'));
    if (hand.length) { hand[0].click(); return 'hand-card'; }
    const reveal = byText('Reveal');
    if (reveal && !reveal.disabled) { reveal.click(); return 'reveal'; }
    return null;
  }
  if (myBanner.includes('No agents left') && myBanner.includes('REVEAL')) {
    const reveal = byText('Reveal');
    if (reveal && !reveal.disabled) { reveal.click(); return 'reveal'; }
    return null;
  }
  if (myBanner.includes('END TURN')) {
    const buys = enabled(q('button.dn-card'))
      .concat(enabled(q('button.dn-btn')).filter((b) => /Liaison|Spice Must Flow/.test(b.textContent)));
    if (buys.length) { buys[0].click(); return 'buy'; }
    const end = byText('End Turn');
    if (end && !end.disabled) { end.click(); return 'end-turn'; }
    return null;
  }
  if (myBanner.toLowerCase().includes('combat')) {
    const pass = byText('Pass');
    if (pass && !pass.disabled) { pass.click(); return 'combat-pass'; }
    return null;
  }
  return null; // not our turn / waiting
}

// ---- 3. run four pages until someone sees the winner ----
const { roomId, tokens } = await setupRoom();
console.log('room', roomId);

function within(promise, label, ms = 10_000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 60_000,
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  // The phone UI intentionally uses the lightweight board summary. Keeping
  // WebGL disabled here prevents an accidental desktop-mat regression from
  // turning this four-page interaction smoke into a software-rendering burn.
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-webgl', '--disable-dev-shm-usage'],
});

try {
  const pages = [];
  for (let i = 0; i < SEATS; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r, t), [roomId, tokens[i]]);
    await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2', timeout: 45000 });
    const phone = await page.evaluate(() => ({
      width: window.innerWidth,
      canvases: document.querySelectorAll('canvas').length,
      summary: Boolean(document.querySelector('[aria-label^="Your board:"]')),
    }));
    if (phone.width > 720 || phone.canvases !== 0) {
      throw new Error(`phone renderer regression: ${JSON.stringify(phone)}`);
    }
    pages.push(page);
  }

  const started = Date.now();
  let lastAct = Date.now();
  let acts = 0;
  let round = '';

  for (;;) {
    for (let i = 0; i < SEATS; i++) {
      let did = null;
      try { did = await within(pages[i].evaluate(tickInPage), `seat ${i + 1} decision`); }
      catch (error) { throw new Error(`seat ${i + 1} decision failed: ${error instanceof Error ? error.message : String(error)}`); }
      if (did?.startsWith('ENDED:')) {
        console.log(`UI SMOKE PASS — ${did.slice(6)} · ${acts} UI actions · ${Math.round((Date.now() - started) / 1000)}s`);
        process.exit(0);
      }
      if (did) { acts++; lastAct = Date.now(); }
      const r = await within(
        pages[i].evaluate(() => document.body.textContent.match(/Conflict · round (\d+)/)?.[1] ?? ''),
        `seat ${i + 1} round read`,
      ).catch(() => '');
      if (r && r !== round) { round = r; console.log(`round ${r} · ${acts} acts`); }
    }
    if (Date.now() - lastAct > STALL_MS) {
      for (let i = 0; i < SEATS; i++) {
        const state = await pages[i].evaluate(() => ({
          label: document.querySelector('.dn-lab')?.textContent,
          heading: document.querySelector('.dn-main h1')?.textContent,
          banner: document.querySelector('.dn-banner.you')?.textContent,
          buttons: [...document.querySelectorAll('button')].map((b) => `${b.textContent.trim().slice(0, 28)}${b.disabled ? '(x)' : ''}`).slice(0, 14),
          err: document.querySelector('.dn-err')?.textContent ?? null,
        })).catch(() => null);
        console.error(`seat ${i}:`, JSON.stringify(state));
      }
      console.error('UI SMOKE STALLED — no UI action for 90s');
      process.exit(1);
    }
    if (Date.now() - started > HARD_MS) { console.error('UI SMOKE TIMEOUT'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 350));
  }
} finally {
  await browser.close();
}
