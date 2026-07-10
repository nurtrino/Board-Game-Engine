// UI-driven smoke for Axis & Allies Anniversary (playbook §6.4b ship gate).
// Creates a 1941 room with RND + national objectives on, joins FOUR seats,
// opens four puppeteer pages on /play/:room and plays through the real
// device DOM: research, purchases, combat moves resolved through the battle
// sheet (rolls, casualty picks, retreat calls), noncombat, mobilize (China
// included on the US turn), income. Seats act round-robin; the dev
// control-all model means each page drives whichever power is active.
//
// A&A has no fixed game length, so the gate is: complete TARGET_ROUNDS full
// rounds (or win outright) with zero UI stalls. If any phase's affordance is
// missing from the DOM, the stall watchdog fails the run.
// Run: node tools/verify/axis-ui-smoke.mjs [base] [wsUrl]

import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const WS_URL = process.argv[3] ?? 'ws://localhost:8899/ws';
const SEATS = 4;
// One complete round = all six powers through all seven phases, plus the
// round rollover into round 2. A&A has no fixed game length, so this (or an
// outright victory) is the completion gate; the stall watchdog is the
// correctness gate.
const TARGET_ROUNDS = 2;
const STALL_MS = 90_000;
const HARD_MS = 20 * 60_000;

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
    (ws) => ws.send(JSON.stringify({
      type: 'create_room', name: 'Axis UI smoke', game: 'axis',
      options: { scenario: '1941', rnd: true, nationalObjectives: true, winCondition: 'short' },
    })),
    (m) => (m.type === 'room_created' ? m.roomId : undefined),
  );
  const tokens = [];
  for (let i = 0; i < SEATS; i++) {
    tokens.push(await wsOnce(
      (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: `Seat${i + 1}` })),
      (m) => (m.type === 'joined' ? m.playerToken : undefined),
    ));
  }
  await wsOnce(
    (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: 'Seat1', playerToken: tokens[0] })),
    (m, ws) => {
      if (m.type === 'joined') { ws.send(JSON.stringify({ type: 'start' })); return undefined; }
      return m.type === 'state' && m.view?.phase ? true : undefined;
    },
  );
  return { roomId, tokens };
}

// One decision tick inside the page DOM. Returns what was clicked, or null.
function tickInPage() {
  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  const chips = q('button.ax-chip').filter((b) => !b.disabled);
  const text = (b) => b.textContent.trim();
  const by = (re) => chips.find((b) => re.test(text(b)));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const labs = q('.ax-left .ig-lab, .ax-sheet-body .ig-lab').map((e) => e.textContent).join(' | ');

  // game over?
  if (/Game over/i.test(labs)) return 'ENDED:' + (document.body.textContent.match(/The (Axis|Allies) win/)?.[0] ?? 'won');

  // rules intro
  const got = q('button').find((b) => text(b) === 'Got it');
  if (got) { got.click(); return 'intro'; }

  // nation panel accidentally open
  const close = chips.find((b) => text(b) === 'Close');
  if (close) { close.click(); return 'close-panel'; }

  // battle first: the big center buttons block everything else
  const megas = q('button.ax-mega').filter((b) => !b.disabled);
  const mega = (re) => megas.find((b) => re.test(text(b)));
  if (/Battle ·/.test(labs) || megas.length) {
    // battle over: both commanders confirm the report
    const cont = mega(/^CONTINUE ·/i);
    if (cont) { cont.click(); return 'battle-continue'; }
    const confirm = mega(/^CONFIRM CASUALTIES/i);
    if (confirm) { confirm.click(); return 'confirm-casualties'; }
    const roll = mega(/^ROLL THE DICE$/i);
    if (roll) { roll.click(); return 'battle-roll'; }
    const press = mega(/^PRESS THE ATTACK$/i);
    const retreat = mega(/^RETREAT$/i);
    if (press && (Math.random() < 0.85 || !retreat)) { press.click(); return 'press'; }
    if (retreat) { retreat.click(); return 'retreat'; }
    const strike = mega(/^STRIKE$/i);
    if (strike) { strike.click(); return 'strike'; }
    const sub = mega(/^SUBMERGE$/i);
    if (sub) { sub.click(); return 'submerge'; }
    if (/Battle ·/.test(labs)) {
      // casualty picking: chips inside the centered card
      const disabledConfirm = q('button.ax-mega').find((b) => /^CONFIRM/i.test(text(b)) && b.disabled);
      const unitChips = q('.ax-battle-cas button.ax-chip').filter((b) => !b.disabled);
      if (disabledConfirm && unitChips.length) { pick(unitChips).click(); return 'pick-casualty'; }
      return null;
    }
  }

  if (/Research & Development/i.test(labs)) {
    const rollDie = by(/^Roll 1 research die$/i);
    if (rollDie && Math.random() < 0.35) { rollDie.click(); return 'research'; }
    const skip = by(/^Skip research$/i);
    if (skip) { skip.click(); return 'skip-research'; }
  }
  if (/choose a chart/i.test(labs)) {
    const charts = q('button.ax-big');
    if (charts.length) { pick(charts).click(); return 'chart'; }
  }

  if (/Purchase units/i.test(labs)) {
    // the armory popup: + buttons buy, DONE PURCHASING closes out
    const buys = q('.ax-buy button.ax-buy-btn.buy').filter((b) => !b.disabled);
    if (buys.length && Math.random() < 0.55) { pick(buys).click(); return 'buy'; }
    const doneBig = q('.ax-buy button.ax-order-go').find((b) => !b.disabled);
    if (doneBig) { doneBig.click(); return 'done-purchasing'; }
    const openArmory = by(/^Open the armory$/i);
    if (openArmory) { openArmory.click(); return 'open-armory'; }
    const done = by(/^Done purchasing$/i);
    if (done) { done.click(); return 'done-purchasing'; }
  }

  if (/Combat move\./i.test(labs) || /Noncombat move\./i.test(labs)) {
    const combat = /Noncombat move\./i.test(labs) ? false : true;
    // an armed order? the big HOI4 button executes it
    const orderGo = q('button.ax-order-go').find((b) => !b.disabled);
    if (orderGo) { orderGo.click(); return 'order-go'; }
    // in a picked-origin state?
    const changeOrigin = by(/^Back$/i);
    if (changeOrigin) {
      // bump some steppers so targets appear
      const targetChips = chips.filter((b) => /^●? ?(Attack|Assault|To|Offload to|Load into) /.test(text(b)));
      if (targetChips.length) { pick(targetChips).click(); return combat ? 'arm-order' : 'arm-move'; }
      const plus = q('.ax-step button').filter((b) => text(b) === '+' && !b.disabled);
      if (plus.length) { pick(plus).click(); return 'stepper'; }
      changeOrigin.click(); return 'back';
    }
    const endChip = by(combat ? /^No more attacks$/i : /^Done moving$/i);
    const headerChips = /^(Nation|\?|Close)$/;
    const origins = chips.filter((b) => b !== endChip && b.dataset.tone !== 'gold' && !headerChips.test(text(b)));
    const wantAct = Math.random() < (combat ? 0.4 : 0.18);
    if (wantAct && origins.length) { pick(origins).click(); return 'origin'; }
    if (endChip) { endChip.click(); return combat ? 'end-combat' : 'end-noncombat'; }
  }

  // strategic bombing raid popup
  if (/Bombers over/i.test(document.body.textContent)) {
    const raid = by(/^Strategic bombing raid$/i);
    const assault = by(/^Attack the defenders$/i);
    const choice = Math.random() < 0.5 ? raid : assault;
    if (choice) { choice.click(); return 'sbr-choice'; }
  }

  if (/Mobilize ·/i.test(labs)) {
    const placeAt = chips.filter((b) => /^Place at /.test(text(b)));
    if (placeAt.length) { pick(placeAt).click(); return 'place'; }
    const plus = q('.ax-step button').filter((b) => text(b) === '+' && !b.disabled);
    if (plus.length && Math.random() < 0.75) { pick(plus).click(); return 'pick-staged'; }
    // mobilize + collect income are one merged stage: End turn does both
    const end = by(/^End turn$/i);
    if (end) { end.click(); return 'end-turn'; }
  }

  return null;
}

const { roomId, tokens } = await setupRoom();
console.log('room', roomId);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'],
});

try {
  const pages = [];
  for (let i = 0; i < SEATS; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r, t), [roomId, tokens[i]]);
    await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 12000)); // let the map + meshes stream in
    pages.push(page);
  }

  const started = Date.now();
  let lastAct = Date.now();
  let acts = 0;
  let round = 1;
  let pass = 0;

  for (;;) {
    // one actor per pass, rotating: every seat's DOM drives the game in turn
    const i = pass++ % SEATS;
    let did = null;
    try { did = await pages[i].evaluate(tickInPage); } catch { /* re-rendering */ }
    if (did?.startsWith('ENDED:')) {
      console.log(`UI SMOKE PASS (victory) · ${did.slice(6)} · ${acts} UI actions · ${Math.round((Date.now() - started) / 1000)}s`);
      process.exit(0);
    }
    if (did) { acts++; lastAct = Date.now(); }
    if (did && process.env.SMOKE_VERBOSE) console.log(`act ${acts} seat${i}: ${did}`);
    if (acts % 200 === 0 && did) console.log(`heartbeat · ${acts} acts · round ${round} · ${Math.round((Date.now() - started) / 1000)}s`);

    const r = pass % 8 === 0
      ? await pages[i].evaluate(() => Number(document.querySelector('.ax-left-head .ig-lab')?.textContent?.match(/Round (\d+)/)?.[1] ?? 0)).catch(() => 0)
      : 0;
    if (r > round) {
      round = r;
      console.log(`round ${r} · ${acts} acts · ${Math.round((Date.now() - started) / 1000)}s`);
      if (round >= TARGET_ROUNDS) {
        console.log(`UI SMOKE PASS · completed ${TARGET_ROUNDS - 1} full rounds through the UI · ${acts} actions · ${Math.round((Date.now() - started) / 1000)}s`);
        process.exit(0);
      }
    }

    if (Date.now() - lastAct > STALL_MS) {
      for (let k = 0; k < SEATS; k++) {
        const state = await pages[k].evaluate(() => ({
          labs: [...document.querySelectorAll('.ig-lab')].map((e) => e.textContent).slice(0, 4),
          chips: [...document.querySelectorAll('button.ax-chip')].map((b) => `${b.textContent.trim().slice(0, 26)}${b.disabled ? '(x)' : ''}`).slice(0, 16),
          err: document.querySelector('.ax-error')?.textContent ?? null,
        })).catch(() => null);
        console.error(`seat ${k}:`, JSON.stringify(state));
      }
      console.error('UI SMOKE STALLED · no UI action for 90s');
      process.exit(1);
    }
    if (Date.now() - started > HARD_MS) { console.error('UI SMOKE TIMEOUT'); process.exit(1); }
    await new Promise((res) => setTimeout(res, 90));
  }
} finally {
  await browser.close();
}
