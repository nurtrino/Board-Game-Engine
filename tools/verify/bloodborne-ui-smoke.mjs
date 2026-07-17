// UI-driven smoke for Bloodborne: The Board Game (playbook §6.4b ship gate).
// Creates a room with partySize 4, joins FOUR human seats (no CPU fill: every
// decision flows through the device DOM), opens four puppeteer pages on
// /play/:room and plays the whole chapter through the real client: hunter
// picks, hand-card action bar, SVG map taps (steps / reveal exits / targets),
// attack-slot modals, and every pending prompt (combat attack/dodge, stun,
// dream upgrades + incorporation, return placement, tile orientation, mission
// choices, round refresh).
//
// Random-legal play will usually LOSE to the hunt track — YOU DIED is a legal
// terminal. Gate: reach a terminal screen with zero 90s UI stalls. If any
// affordance is missing from the DOM, the watchdog fails the run and dumps
// each seat's visible controls.
// Run: node tools/verify/bloodborne-ui-smoke.mjs [base] [wsUrl]

import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:8791';
const WS_URL = process.argv[3] ?? 'ws://localhost:8791/ws';
const SEATS = 4;
const STALL_MS = 90_000;
const HARD_MS = 30 * 60_000;

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
      type: 'create_room', name: 'BB UI smoke', game: 'bloodborne',
      options: { campaign: 'the-long-hunt', chapter: 1, partySize: 4 },
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
  const text = (el) => (el?.textContent ?? '').trim();
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const enabled = (els) => els.filter((b) => !b.disabled);
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // terminal?
  const over = document.querySelector('.bb-end-title');
  if (over) return 'ENDED:' + text(over);

  const tutorialContinue = document.querySelector('[data-testid="bb-tutorial-continue"]');
  if (tutorialContinue) { tutorialContinue.click(); return 'combat-tutorial'; }
  const combatResultContinue = document.querySelector('[data-testid="bb-combat-result-continue"]');
  if (combatResultContinue) { combatResultContinue.click(); return 'combat-result'; }

  // setup: open a hunter's inspect dialog, then confirm the pick inside it
  const confirmPick = document.querySelector('[data-testid="bb-inspect-dialog"] [data-testid^="bb-pick-"]');
  if (confirmPick) {
    if (!confirmPick.disabled) { confirmPick.click(); return 'pick-hunter'; }
    const close = q('[data-testid="bb-inspect-dialog"] button.bb-btn.ghost').pop();
    if (close) { close.click(); return 'inspect-close'; }
  }
  const picked = text(document.querySelector('[data-testid="bb-setup"] .bb-head-note')).includes('WAITING');
  const inspects = enabled(q('[data-testid^="bb-inspect-"]'));
  if (inspects.length && !picked && !document.querySelector('.bb-modal')) {
    pick(inspects).click();
    return 'inspect-hunter';
  }

  // prompt modal?
  const prompt = document.querySelector('[data-testid^="bb-prompt-"]');
  if (prompt) {
    const kind = prompt.getAttribute('data-testid').replace('bb-prompt-', '');
    // generic flow: try slot buttons (visible after a card pick), then cards,
    // then confirm/primary, then pass/ghost options
    const slotBtns = enabled(q('.bb-slot-pick .bb-btn, .bb-battle-slot-command', prompt));
    if (slotBtns.length) { pick(slotBtns).click(); return kind + ':slot'; }
    const confirm = q('[data-testid="bb-refresh-confirm"]', prompt);
    if (confirm.length) { confirm[0].click(); return 'round-refresh'; }
    const upgrades = enabled(q('[data-testid^="bb-upgrade-"]', prompt));
    if (upgrades.length) { pick(upgrades).click(); return 'dream-upgrade'; }
    const rots = enabled(q('[data-testid^="bb-rot-"]', prompt));
    if (rots.length) { pick(rots).click(); return 'tile-rot'; }
    const lamps = enabled(q('[data-testid="bb-lamp"]', prompt));
    if (lamps.length) { pick(lamps).click(); return 'return-lamp'; }
    const options = enabled(q('[data-testid="bb-mission-option"]', prompt));
    if (options.length) { pick(options).click(); return 'mission-choice'; }
    if (kind === 'combat-modifiers') {
      const modifierPass = q('[data-testid="bb-modifiers-pass"]', prompt);
      if (modifierPass.length) { modifierPass[0].click(); return 'combat-modifiers:reveal'; }
    }
    if (kind === 'combat-reaction') {
      const reactions = enabled(q('[data-testid^="bb-reaction-"]', prompt))
        .filter((b) => b.getAttribute('data-testid') !== 'bb-reaction-pass');
      if (reactions.length && Math.random() < 0.5) {
        pick(reactions).click(); return 'combat-reaction:use';
      }
      const reactionPass = q('[data-testid="bb-reaction-pass"]', prompt);
      if (reactionPass.length) { reactionPass[0].click(); return 'combat-reaction:pass'; }
    }
    const cards = enabled(q('.bb-card', prompt));
    if (kind === 'combat-attack' && cards.length && Math.random() < 0.8) { pick(cards).click(); return 'combat-card'; }
    if ((kind === 'combat-dodge' || kind === 'combat-rider') && cards.length && Math.random() < 0.7) { pick(cards).click(); return 'dodge-card'; }
    if (kind === 'discard-for-stun' && cards.length) { pick(cards).click(); return 'stun-discard'; }
    if (kind === 'dream-incorporate') {
      if (cards.length && Math.random() < 0.7) { pick(cards).click(); return 'incorporate'; }
      const disc = q('button', prompt).find((b) => text(b).includes('DISCARD THE UPGRADE'));
      if (disc) { disc.click(); return 'incorporate-discard'; }
    }
    const pass = q('[data-testid="bb-combat-pass"], [data-testid="bb-dodge-pass"], [data-testid="bb-reaction-pass"]', prompt);
    if (pass.length) { pass[0].click(); return kind + ':pass'; }
    const ghost = q('button.bb-btn.ghost, button.bb-btn', prompt).filter((b) => !b.disabled);
    if (ghost.length) { ghost[ghost.length - 1].click(); return kind + ':fallback'; }
    return null; // prompt with no affordance = finding
  }

  // attack slot modal (outside pending)
  const atkSlots = enabled(q('[data-testid^="bb-attackslot-"]'));
  if (atkSlots.length) { pick(atkSlots).click(); return 'attack-slot'; }

  // begin turn
  const begin = document.querySelector('[data-testid="bb-begin-turn"]');
  if (begin && !begin.disabled) { begin.click(); return 'begin-turn'; }

  // moving: step targets, reveal exits, end move
  const endMove = document.querySelector('[data-testid="bb-end-move"]');
  if (endMove) {
    const steps = q('[data-testid="bb-step-target"]');
    const exits = q('[data-testid="bb-reveal-exit"]');
    if (exits.length && Math.random() < 0.6) { fire(pick(exits)); return 'reveal'; }
    if (steps.length && Math.random() < 0.85) { fire(pick(steps)); return 'step'; }
    endMove.click(); return 'end-move';
  }

  // action bar visible? click an enabled action (attack first)
  const bar = document.querySelector('[data-testid="bb-actions"]');
  if (bar) {
    for (const id of ['bb-act-attack', 'bb-act-interact', 'bb-act-move', 'bb-act-transform']) {
      const b = bar.querySelector(`[data-testid="${id}"]`);
      if (b && !b.disabled && Math.random() < 0.75) { b.click(); return id; }
    }
    const any = enabled(q('button', bar));
    if (any.length) { pick(any).click(); return 'action-any'; }
  }

  // my turn, no card selected: select a hand card or end turn
  const endTurn = document.querySelector('[data-testid="bb-end-turn"]');
  const hand = enabled(q('[data-testid^="bb-hand-"]'));
  if (endTurn && !endTurn.disabled) {
    if (hand.length && Math.random() < 0.8) { pick(hand).click(); return 'hand-select'; }
    endTurn.click(); return 'end-turn';
  }
  return null;
}

function dumpControls() {
  const q = (sel) => [...document.querySelectorAll(sel)];
  return q('button').filter((b) => b.offsetParent !== null).map((b) => (b.textContent ?? '').trim().slice(0, 40)).slice(0, 30);
}

const { roomId, tokens } = await setupRoom();
console.log('room', roomId);

const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const pages = [];
for (let i = 0; i < SEATS; i++) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1024, height: 768 });
  await p.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2' });
  await p.evaluate(([r, t]) => localStorage.setItem('bge-token-' + r.toUpperCase(), t), [roomId, tokens[i]]);
  await p.reload({ waitUntil: 'networkidle2' });
  pages.push(p);
}

let lastProgress = Date.now();
const started = Date.now();
let clicks = 0;
let ended = null;

while (!ended) {
  for (let i = 0; i < SEATS && !ended; i++) {
    let r = null;
    try {
      r = await pages[i].evaluate(tickInPage);
    } catch { /* page busy re-rendering */ }
    if (r) {
      if (r.startsWith('ENDED:')) { ended = r.slice(6); break; }
      clicks++;
      lastProgress = Date.now();
      if (clicks % 25 === 0) console.log(`${clicks} clicks · last: seat ${i + 1} ${r}`);
    }
  }
  if (Date.now() - lastProgress > STALL_MS) {
    console.error('STALL: no clickable affordance for 90s');
    for (let i = 0; i < SEATS; i++) {
      const controls = await pages[i].evaluate(dumpControls).catch(() => []);
      console.error(`seat ${i + 1} controls:`, controls.join(' | '));
      await pages[i].screenshot({ path: `bb-ui-stall-seat${i + 1}.png` }).catch(() => {});
    }
    await browser.close();
    process.exit(1);
  }
  if (Date.now() - started > HARD_MS) {
    console.error('HARD TIMEOUT (30m)');
    await browser.close();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 220));
}

console.log(`TERMINAL: ${ended} · ${clicks} clicks · ${Math.round((Date.now() - started) / 1000)}s`);
await browser.close();
process.exit(0);
