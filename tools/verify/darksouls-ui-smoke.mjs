// UI-driven smoke for Dark Souls: The Board Game (playbook §6.4b ship gate).
// Creates a standard one-shot room with partySize 4, joins FOUR human seats
// (no CPU fill: every decision flows through the device DOM), opens four
// puppeteer pages on /play/:room and plays the whole game through the real
// client: class picks, bonfire travel/shop/level-ups, encounter rail buttons
// (walk/run/attacks/estus/heroic/end), SVG node-map taps, and every centered
// pending prompt (defence, post-roll, push, treasure, trap, aggro).
//
// Random-legal play will usually LOSE on sparks — a loss screen IS a legal
// terminal. Gate: reach VICTORY or YOU DIED with zero 90s UI stalls, having
// cleared at least one encounter and entered a boss fight (or sparked out
// trying). If any affordance is missing from the DOM, the watchdog fails the
// run and dumps each seat's visible controls.
// Run: node tools/verify/darksouls-ui-smoke.mjs [base] [wsUrl]

import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const WS_URL = process.argv[3] ?? 'ws://localhost:8899/ws';
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
      type: 'create_room', name: 'Dark Souls UI smoke', game: 'darksouls',
      options: { scenario: 'standard', partySize: 4 },
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
  // SVG nodes have React onClick on the <g>; dispatch a bubbling click
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // terminal?
  const over = document.querySelector('.ds-over h1');
  if (over) return 'ENDED:' + text(over);

  // rules intro (normally pre-seeded away via localStorage)
  const got = q('button').find((b) => text(b) === 'Got it');
  if (got) { got.click(); return 'intro'; }

  // Spatial pending decisions stay docked so the authentic board remains the
  // input surface (entry, push, dodge move, spell target, Aggro/model picks).
  const spatial = document.querySelector('.ds-spatial-prompt');
  if (spatial) {
    const pieces = q('svg [data-map-target="piece"]');
    if (pieces.length) { fire(pick(pieces)); return 'spatial-piece'; }
    const nodes = q('svg [data-map-target="node"]');
    if (nodes.length) { fire(pick(nodes)); return 'spatial-node'; }
    const auxiliary = q('button.ds-choice', spatial).filter((b) => !b.disabled);
    if (auxiliary.length) { pick(auxiliary).click(); return 'spatial-aux'; }
    return null;
  }

  // a pending decision addressed to this seat: centered prompt, always first
  const prompt = document.querySelector('.ds-prompt-veil .ds-prompt');
  const dieCount = (el) => el.querySelectorAll('.ds-die').length;
  if (prompt) {
    const choices = q('button.ds-choice', prompt).filter((b) => !b.disabled);
    if (choices.length === 0) return null;
    const equip = choices.filter((b) => /EQUIP/.test(text(b)));
    if (equip.length) { pick(equip).click(); return 'prompt-equip'; }
    const primary = choices.find((b) => b.classList.contains('primary'));
    if (primary) { primary.click(); return 'prompt-accept'; }
    // defence: take whichever pool rolls more dice (ties favour the free block)
    const defs = choices.filter((b) => /^(BLOCK|RESIST|DODGE)/.test(text(b)));
    if (defs.length) {
      const best = [...defs].sort((a, b) => dieCount(b) - dieCount(a)
        || (/^DODGE/.test(text(a)) ? 1 : -1))[0];
      best.click(); return 'prompt-def:' + text(best).slice(0, 12);
    }
    const c = pick(choices);
    c.click(); return 'prompt:' + text(c).slice(0, 28);
  }
  // someone else decides
  if (document.querySelector('.ds-wait')) return null;

  // class pick (setup)
  const pickScreen = document.querySelector('.ds-pick');
  if (pickScreen) {
    if (/WAITING FOR THE PARTY/.test(text(pickScreen.querySelector('.ds-pick-head')))) return null;
    const cards = q('button.ds-pick-card', pickScreen).filter((b) => !b.disabled);
    if (cards.length) { pick(cards).click(); return 'class-pick'; }
    return null;
  }

  // node/target pick mode (after WALK / RUN / a multi-target attack).
  // Walk destinations aim at the nearest hostile marker so the party actually
  // closes and fights instead of wandering (a scattered party sparks out
  // before clearing anything).
  const nearestToHostile = (nodes) => {
    const hostiles = q('svg.ds-map-svg circle').filter((c) => {
      const f = c.getAttribute('fill') ?? '';
      return f === '#5d2323' || f === '#7a2f4e' || f.startsWith('rgba(103,58,150');
    }).map((c) => ({ x: +c.getAttribute('cx'), y: +c.getAttribute('cy') }));
    if (hostiles.length === 0) return pick(nodes);
    let best = nodes[0]; let bestD = Infinity;
    for (const el of nodes) {
      const x = +el.getAttribute('cx'); const y = +el.getAttribute('cy');
      const d = Math.min(...hostiles.map((h) => Math.hypot(h.x - x, h.y - y)));
      if (d < bestD) { bestD = d; best = el; }
    }
    return best;
  };
  const picking = document.querySelector('.ds-picking');
  if (picking) {
    const btns = q('button.ds-btn', picking).filter((b) => !b.disabled);
    const targets = btns.filter((b) => !/^CANCEL$/.test(text(b)));
    const pieces = q('svg [data-map-target="piece"]');
    if (pieces.length) { fire(pick(pieces)); return 'map-piece'; }
    const nodes = q('svg .ds-map-pick');
    if (nodes.length && (targets.length === 0 || Math.random() < 0.7)) { fire(nearestToHostile(nodes)); return 'map-node'; }
    if (targets.length) { const t = pick(targets); t.click(); return 'pick:' + text(t).slice(0, 24); }
    const cancel = btns.find((b) => /^CANCEL$/.test(text(b)));
    if (cancel) { cancel.click(); return 'cancel-pick'; }
    return null;
  }

  // bonfire phase: the travel strip is the tell
  const travel = document.querySelector('.ds-travel');
  if (travel) {
    const stripBtns = q('button.ds-btn', travel).filter((b) => !b.disabled);
    const label = (b) => text(b.querySelector('.ds-btn-main b') ?? b);
    const fog = stripBtns.find((b) => label(b) === 'ENTER FOG GATE');
    if (fog) { fog.click(); return 'fog-gate'; }
    const chest = stripBtns.find((b) => /^(OPEN CHEST|RE-ENGAGE)/.test(label(b)));
    if (chest && Math.random() < 0.8) { chest.click(); return 'chest'; }
    // firekeeper level-ups when that tab is open (cost text like "2S")
    const lvl = q('.ds-tiers button.ds-mini-btn').filter((b) => !b.disabled && /^\d+S$/.test(text(b)));
    if (lvl.length && Math.random() < 0.6) { pick(lvl).click(); return 'level-up'; }
    // Andre: buy treasure (spawns a treasureKeep prompt for the drawer)
    const buy = q('.ds-rail-body button.ds-btn').filter((b) => !b.disabled)
      .find((b) => label(b) === 'BUY TREASURE');
    if (buy && Math.random() < 0.45) { buy.click(); return 'buy-treasure'; }
    // rotate the shop tabs occasionally so both panels get exercised
    const tabs = q('.ds-tabs button');
    const offTabs = tabs.filter((b) => !b.classList.contains('on') && text(b) !== 'STASH');
    if (offTabs.length && Math.random() < 0.25) { const t = pick(offTabs); t.click(); return 'tab:' + text(t); }
    // travel forward: the strip is linear, so the LAST enabled tile that is
    // not where we stand always moves the party toward the fog gate
    const tiles = q('button.ds-tile', travel).filter((b) => !b.disabled && !b.classList.contains('here'));
    if (tiles.length) { const t = tiles[tiles.length - 1]; t.click(); return 'travel:' + text(t.querySelector('b')); }
    // REST is deliberately never pressed: it spends a spark and resets tiles
    return null;
  }

  // encounter: the action rail
  const railBtns = q('.ds-rail-body > button.ds-btn').filter((b) => !b.disabled);
  if (railBtns.length) {
    const label = (b) => text(b.querySelector('.ds-btn-main b') ?? b);
    const FIXED = ['WALK', 'RUN', 'ESTUS FLASK', 'SWAP BACKUP', 'END ACTIVATION'];
    const attacks = railBtns.filter((b) => !FIXED.includes(label(b)) && !label(b).startsWith('DASH THROUGH'));
    const byLabel = (l) => railBtns.find((b) => label(b) === l);
    if (attacks.length && Math.random() < 0.9) {
      // hit with the biggest dice pool available
      const a = [...attacks].sort((x, y) => dieCount(y) - dieCount(x))[0];
      a.click(); return 'attack:' + label(a).slice(0, 24);
    }
    const estus = byLabel('ESTUS FLASK');
    if (estus && q('.ds-cube.red').length >= 4) { estus.click(); return 'estus'; }
    const walk = byLabel('WALK');
    if (walk && Math.random() < 0.55) { walk.click(); return 'walk-mode'; }
    const run = byLabel('RUN');
    if (run && Math.random() < 0.2) { run.click(); return 'run-mode'; }
    const end = byLabel('END ACTIVATION');
    if (end) { end.click(); return 'end-activation'; }
    if (walk) { walk.click(); return 'walk-mode'; }
    if (run) { run.click(); return 'run-mode'; }
  }

  return null;
}

// Cheap progress probe: gate evidence + spark countdown for the heartbeat.
function probeInPage() {
  const travel = document.querySelector('.ds-travel');
  return {
    cleared: Boolean(document.querySelector('.ds-tile.cleared'))
      || /CLEARED|DONE · NEVER RESETS/.test(travel?.textContent ?? ''),
    boss: /BOSS ARENA/.test(document.querySelector('.ds-map-head')?.textContent ?? ''),
    sparks: (document.querySelector('.ds-head-right')?.textContent ?? '').match(/SPARKS(\d+\/\d+)/)?.[1] ?? null,
  };
}

function stallStateInPage() {
  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  const text = (el) => (el?.textContent ?? '').trim();
  return {
    turn: text(document.querySelector('.ds-head-turn')),
    gate: text(document.querySelector('.ds-gate')),
    prompt: text(document.querySelector('.ds-prompt-veil .ds-prompt h3')),
    promptOpts: q('.ds-prompt-veil button.ds-choice').map((b) => `${text(b).slice(0, 30)}${b.disabled ? '(x)' : ''}`),
    wait: text(document.querySelector('.ds-wait')),
    picking: text(document.querySelector('.ds-picking .ig-lab')),
    spatial: text(document.querySelector('.ds-spatial-prompt')),
    mapPicks: q('svg .ds-map-pick').length + q('svg [data-map-target="piece"]').length,
    rail: q('.ds-rail-body > button.ds-btn').map((b) =>
      `${text(b.querySelector('.ds-btn-main b'))}${b.disabled ? `(x ${text(b.querySelector('.ds-reason')).slice(0, 34)})` : ''}`),
    tiles: q('button.ds-tile').map((b) => `${text(b.querySelector('b'))}${b.disabled ? '(x)' : ''}${b.classList.contains('here') ? '*' : ''}`),
    err: text(document.querySelector('.ds-error')) || null,
  };
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
    // one incognito context per seat: pages share the origin's localStorage
    // otherwise, so the last-written token hijacks every seat on reconnect
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    // the device is an iPad in landscape
    await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(([r, t]) => {
      localStorage.setItem('bge-token-' + r, t);
      localStorage.setItem('ds-guide-v1', 'seen'); // skip the intro overlay
    }, [roomId, tokens[i]]);
    await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 8000)); // let the mod manifest stream in
    pages.push(page);
  }

  const started = Date.now();
  let lastAct = Date.now();
  let acts = 0;
  let pass = 0;
  const flags = { cleared: false, boss: false, sparks: null };

  const finish = (terminal) => {
    const secs = Math.round((Date.now() - started) / 1000);
    const win = /PREVAILS/i.test(terminal);
    console.log(`terminal: ${terminal} (${win ? 'VICTORY' : 'YOU DIED'})`);
    console.log(`evidence: encounter cleared=${flags.cleared} · boss fight entered=${flags.boss} · sparks last seen=${flags.sparks}`);
    if (flags.cleared && (flags.boss || !win)) {
      console.log(`UI SMOKE PASS · legal terminal through the device DOM · ${acts} UI actions · ${secs}s`);
      process.exit(0);
    }
    console.error(`UI SMOKE WEAK TERMINAL · reached "${terminal}" but gate evidence incomplete · ${acts} actions · ${secs}s`);
    process.exit(1);
  };

  for (;;) {
    const i = pass++ % SEATS;
    let did = null;
    try { did = await pages[i].evaluate(tickInPage); } catch { /* re-rendering */ }
    if (did?.startsWith('ENDED:')) finish(did.slice(6));
    if (did) { acts++; lastAct = Date.now(); }
    if (did && process.env.SMOKE_VERBOSE) console.log(`act ${acts} seat${i}: ${did}`);
    if (acts % 200 === 0 && did) {
      console.log(`heartbeat · ${acts} acts · sparks ${flags.sparks ?? '?'} · cleared=${flags.cleared} boss=${flags.boss} · ${Math.round((Date.now() - started) / 1000)}s`);
    }

    if (pass % 8 === 0) {
      const p = await pages[i].evaluate(probeInPage).catch(() => null);
      if (p) {
        if (p.cleared && !flags.cleared) { flags.cleared = true; console.log(`first encounter cleared · ${acts} acts · ${Math.round((Date.now() - started) / 1000)}s`); }
        if (p.boss && !flags.boss) { flags.boss = true; console.log(`boss fight entered · ${acts} acts · ${Math.round((Date.now() - started) / 1000)}s`); }
        if (p.sparks) flags.sparks = p.sparks;
      }
    }

    if (Date.now() - lastAct > STALL_MS) {
      for (let k = 0; k < SEATS; k++) {
        const state = await pages[k].evaluate(stallStateInPage).catch(() => null);
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
