// SETI DOM-only full-game ship gate (porting playbook section 6.4b).
// WebSockets are used only to create/start the room and obtain seat tokens.
// Every gameplay action is produced by clicking the real device DOM.
//
// Run multiplayer:
//   node tools/verify/seti-ui-smoke.mjs [base] [ws-url] 4
// Run solo:
//   node tools/verify/seti-ui-smoke.mjs [base] [ws-url] 1 [difficulty]

import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const WS_URL = process.argv[3] ?? 'ws://localhost:8899/ws';
const SEATS = Math.max(1, Math.min(4, Number(process.argv[4] ?? 4)));
const SOLO_DIFFICULTY = Math.max(1, Math.min(5, Number(process.argv[5] ?? 3)));
const DEBUG_LIMIT = Math.max(0, Number(process.env.SETI_UI_DEBUG_LIMIT ?? 0));
const STALL_MS = 25_000;
const HARD_MS = 8 * 60_000;

function wsOnce(setup, wanted) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('SETI UI smoke setup timed out'));
    }, 15_000);
    ws.on('open', () => setup(ws));
    ws.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'error') {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(message.message));
        return;
      }
      const result = wanted(message, ws);
      if (result !== undefined) {
        clearTimeout(timeout);
        ws.close();
        resolve(result);
      }
    });
    ws.on('error', reject);
  });
}

async function setupRoom() {
  const roomId = await wsOnce(
    (ws) => ws.send(JSON.stringify({
      type: 'create_room',
      name: 'SETI DOM smoke',
      game: 'seti',
      options: { soloDifficulty: SOLO_DIFFICULTY },
    })),
    (message) => message.type === 'room_created' ? message.roomId : undefined,
  );
  const tokens = [];
  for (let seat = 0; seat < SEATS; seat++) {
    tokens.push(await wsOnce(
      (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: `UI Seat ${seat + 1}` })),
      (message) => message.type === 'joined' ? message.playerToken : undefined,
    ));
  }
  await wsOnce(
    (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: 'UI Seat 1', playerToken: tokens[0] })),
    (message, ws) => {
      if (message.type === 'joined') {
        ws.send(JSON.stringify({ type: 'start' }));
        return undefined;
      }
      return message.type === 'state' && message.view?.phase ? true : undefined;
    },
  );
  return { roomId, tokens };
}

// Runs inside the page. Returning null means this seat is waiting or exposes
// no usable affordance; the outer watchdog turns a persistent null into a
// ship-gate failure with a DOM diagnostic.
function tickSetiDevice() {
  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const enabled = (selector, root = document) => [...root.querySelectorAll(selector)]
    .filter((element) => element instanceof HTMLButtonElement && !element.disabled && visible(element));
  const clickFirst = (selector, label, root = document) => {
    const button = enabled(selector, root)[0];
    if (!button) return null;
    button.click();
    return label;
  };

  if (document.querySelector('.seti-turn-line')?.textContent?.includes('MISSION COMPLETE')) return 'ENDED';

  // A closeup is still a real physical card commitment. Prefer its explicit
  // action over dismissing it.
  const cardModal = document.querySelector('.seti-card-modal');
  if (cardModal) {
    const committed = clickFirst('.seti-card-commit button', 'card-commit', cardModal);
    if (committed) return committed;
    const close = clickFirst('.seti-close', 'card-close', cardModal);
    if (close) return close;
  }

  const soloModal = document.querySelector('.seti-solo-modal');
  if (soloModal) {
    const target = clickFirst('.is-choice, [data-seti-target]:not([disabled])', 'solo-objective', soloModal);
    if (target) return target;
  }

  // Multi-pick panels require selecting physical cards/tiles first and then
  // the explicit confirmation target.
  const confirm = clickFirst('.seti-pending-confirm:not([disabled])', 'pending-confirm');
  if (confirm) return confirm;

  const pendingPanel = document.querySelector('.seti-pending-panel');
  if (pendingPanel) {
    const unselected = enabled('.seti-pending-options button:not(.is-selected)', pendingPanel)[0];
    if (unselected) {
      unselected.click();
      return 'pending-component';
    }
    const any = clickFirst('.seti-pending-options button', 'pending-component', pendingPanel);
    if (any) return any;
  }

  // Direct pending presentations live on the authentic table, not in a text
  // list. Choose an already glowing component. Order avoids clicking a generic
  // container before its more specific card/piece target.
  const directSelectors = [
    // A multi-pick cue becomes enabled only after the requested number of
    // physical cards/tiles have been touched. Commit it before touching a
    // third option, which would otherwise replace one of the staged choices.
    '.seti-direct-cue button:not([disabled])',
    '.seti-pending-artifacts button:not([disabled])',
    '.seti-hand-card.is-choice:not(.is-pending-selected)',
    '.seti-mission-slot-target:not([disabled])',
    '.seti-mission-complete-target:not([disabled])',
    '.seti-mission-strip button.is-choice',
    '.seti-solo-objective.is-choice',
    '.seti-alien-face-up.is-choice',
    '.seti-alien-deck.is-choice',
    '.seti-dock-card.is-choice',
    '.seti-project-deck.is-choice',
    '.seti-row-card.is-choice',
    '.seti-row-deck.is-choice',
    '.seti-computer-slot.is-legal',
    '.seti-computer-tech-slot.is-legal',
    '.seti-tech-stack.is-legal',
    '.seti-board-gold-target:not([disabled])',
    '.seti-board-mars-data-target:not([disabled])',
    '.seti-oumuamua-target:not([disabled])',
    '.seti-sector-target:not([disabled])',
    '.seti-alien-space-target:not([disabled])',
    '.seti-planet-target:not([disabled])',
    '.seti-cell-target.is-legal:not([disabled])',
    '[data-seti-target="sample"]:not([disabled])',
  ];
  for (const selector of directSelectors) {
    const result = clickFirst(selector, `direct:${selector}`);
    if (result) return result;
  }

  // The smoke deliberately passes as its main action. That yields a short,
  // deterministic five-round full game while exercising all pass, milestone,
  // income, starting-player, solo-rival, and final-scoring continuations.
  const pass = clickFirst('[data-testid="seti-pass"]:not([disabled])', 'pass');
  if (pass) return pass;
  const end = clickFirst('[data-testid="seti-end-turn"]:not([disabled])', 'end-turn');
  if (end) return end;
  return null;
}

const { roomId, tokens } = await setupRoom();
console.log(`SETI UI room ${roomId} (${SEATS} seat${SEATS === 1 ? '' : 's'})`);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--disable-dev-shm-usage',
  ],
});

try {
  const pages = [];
  const browserErrors = [];
  for (let seat = 0; seat < SEATS; seat++) {
    const page = await browser.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`seat ${seat} console: ${message.text()}`);
    });
    page.on('pageerror', (error) => browserErrors.push(`seat ${seat} pageerror: ${error.message}`));
    await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1, hasTouch: true });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.evaluate(([room, token]) => localStorage.setItem(`bge-token-${room}`, token), [roomId, tokens[seat]]);
    // The live device intentionally keeps HTTP/WebSocket activity open. Gate
    // on the actual SETI surface instead of a fragile network-idle heuristic.
    await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.seti-device .seti-board-stage', { timeout: 45_000 });
    pages.push(page);
  }

  const began = Date.now();
  let lastAction = Date.now();
  let lastProgress = Date.now();
  let actions = 0;
  let lastRound = '';
  const domSignatures = Array(pages.length).fill('');

  for (;;) {
    for (let seat = 0; seat < pages.length; seat++) {
      let result = null;
      try {
        result = await pages[seat].evaluate(tickSetiDevice);
      } catch {
        // A React reconciliation can detach a just-read node; retry next tick.
      }
      if (result === 'ENDED') {
        for (const [index, page] of pages.entries()) {
          const metrics = await page.evaluate(() => ({
            innerWidth,
            innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            errors: [...document.querySelectorAll('.seti-error')].map((element) => element.textContent),
          }));
          if (metrics.scrollWidth > metrics.innerWidth || metrics.scrollHeight > metrics.innerHeight || metrics.errors.length || browserErrors.length) {
            throw new Error(`Seat ${index} final viewport/error failure: ${JSON.stringify({ metrics, browserErrors })}`);
          }
        }
        console.log(`SETI UI SMOKE PASS - ${SEATS} seat(s), ${actions} DOM actions, ${Math.round((Date.now() - began) / 1000)}s`);
        process.exitCode = 0;
        break;
      }
      if (result) {
        actions++;
        lastAction = Date.now();
        if (actions % 25 === 0) console.log(`${actions} DOM clicks`);
      }
      const domState = await pages[seat].evaluate(() => ({
        turn: document.querySelector('.seti-turn-line')?.textContent?.replace(/\s+/g, ' ').trim(),
        pending: document.querySelector('.seti-pending-panel, .seti-direct-cue, .seti-pending-wait, .seti-pending-artifacts')?.textContent?.replace(/\s+/g, ' ').trim(),
        event: document.querySelector('.seti-event-caption')?.textContent?.replace(/\s+/g, ' ').trim(),
        hand: document.querySelector('.seti-hand-label')?.textContent?.replace(/\s+/g, ' ').trim(),
        enabled: [...document.querySelectorAll('button:not(:disabled)')].map((button) => button.getAttribute('data-seti-value') ?? button.getAttribute('data-testid') ?? button.getAttribute('aria-label')).filter(Boolean),
      })).catch(() => null);
      const domSignature = domState ? JSON.stringify(domState) : '';
      if (domSignature && domSignature !== domSignatures[seat]) {
        domSignatures[seat] = domSignature;
        lastProgress = Date.now();
      }
      if (result && DEBUG_LIMIT) console.log(`debug ${actions} seat ${seat} ${result}: ${JSON.stringify(domState)}`);
      if (DEBUG_LIMIT && actions >= DEBUG_LIMIT) throw new Error(`SETI UI debug limit ${DEBUG_LIMIT} reached`);
      const round = await pages[seat].evaluate(() => document.querySelector('.seti-round-readout, .seti-turn-line')?.textContent?.match(/(?:ROUND|MISSION ROUND)\s*(\d)/i)?.[1] ?? '').catch(() => '');
      if (round && round !== lastRound) {
        lastRound = round;
        console.log(`round ${round} - ${actions} DOM actions`);
      }
    }
    if (process.exitCode === 0) break;
    if (Date.now() - lastProgress > STALL_MS || Date.now() - began > HARD_MS) {
      for (let seat = 0; seat < pages.length; seat++) {
        const diagnostic = await pages[seat].evaluate(() => ({
          turn: document.querySelector('.seti-turn-line')?.textContent?.replace(/\s+/g, ' ').trim(),
          pending: document.querySelector('.seti-pending-panel, .seti-direct-cue, .seti-pending-wait')?.textContent?.replace(/\s+/g, ' ').trim(),
          error: document.querySelector('.seti-error')?.textContent ?? null,
          buttons: [...document.querySelectorAll('button')]
            .filter((button) => !button.disabled)
            .map((button) => `${button.getAttribute('aria-label') ?? button.textContent?.replace(/\s+/g, ' ').trim()}`.slice(0, 80))
            .slice(0, 24),
        })).catch(() => null);
        console.error(`seat ${seat}: ${JSON.stringify(diagnostic)}`);
      }
      throw new Error(Date.now() - lastProgress > STALL_MS ? 'SETI UI smoke stalled without a DOM state transition' : 'SETI UI smoke timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
} finally {
  await browser.close();
}
