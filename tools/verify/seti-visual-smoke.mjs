// SETI visual/action ship gate.
//
// WebSockets are used only to create/start rooms and obtain player tokens.
// Every gameplay decision is made through the rendered device UI. The gate
// deliberately reports an action branch as missing when the live game cannot
// reach it; it never patches state or treats an attempted click as coverage.
//
// Usage:
//   node tools/verify/seti-visual-smoke.mjs [base-url] [ws-url]
//
// Artifacts:
//   tmp/QA/seti-visual-<timestamp>/

// Optional tuning:
//   SETI_VISUAL_MAX_STEPS=260
//   SETI_VISUAL_STEP_DELAY=180


import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const WS_URL = process.argv[3] ?? 'ws://localhost:8899/ws';
const MAX_STEPS = Math.max(1, Number(process.env.SETI_VISUAL_MAX_STEPS ?? 260));
const STEP_DELAY = Math.max(80, Number(process.env.SETI_VISUAL_STEP_DELAY ?? 180));
const DEVICE_VIEWPORT = { width: 1024, height: 768, deviceScaleFactor: 1, hasTouch: true };
const TV_VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 1 };
const REQUIRED_ACTIONS = ['launch', 'move', 'orbit', 'land', 'scan', 'research', 'analyze', 'card'];
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const qaRoot = fileURLToPath(new URL('../../tmp/QA/', import.meta.url));
const outDir = path.join(qaRoot, `seti-visual-${runStamp}`);

const report = {
  gate: 'SETI visual/action smoke',
  startedAt: new Date().toISOString(),
  baseUrl: BASE,
  wsUrl: WS_URL,
  viewports: { device: DEVICE_VIEWPORT, tv: TV_VIEWPORT },
  rooms: {},
  screenshots: [],
  checks: [],
  failures: [],
  browserErrors: [],
  actionCoverage: Object.fromEntries(REQUIRED_ACTIONS.map((name) => [name, {
    reached: false,
    evidence: [],
    attempts: [],
  }])),
};

await mkdir(outDir, { recursive: true });
console.log(`SETI visual artifacts: ${outDir}`);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForRenderedRoot(page, selector, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await page.evaluate((wanted) => Boolean(document.querySelector(wanted)), selector).catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error(`Rendered SETI root did not appear within ${timeout}ms: ${selector}`);
}

function recordCheck(name, passed, detail = undefined) {
  report.checks.push({ name, passed, detail });
  if (!passed) recordFailure(`${name}${detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}

function recordFailure(message) {
  if (!report.failures.includes(message)) report.failures.push(message);
}

function wsOnce(setup, wanted) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('SETI visual gate room setup timed out'));
    }, 15_000);
    ws.on('open', () => setup(ws));
    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch (error) {
        clearTimeout(timeout);
        ws.close();
        reject(error);
        return;
      }
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
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function setupRoom(label, seats, soloDifficulty = 3, seed = undefined) {
  const seatName = (seat) => `VIS-${label[0].toUpperCase()}-${runStamp.slice(-6, -1)}-${seat + 1}`;
  const roomId = await wsOnce(
    (ws) => ws.send(JSON.stringify({
      type: 'create_room',
      name: `SETI visual ${label}`,
      game: 'seti',
      options: { soloDifficulty, ...(seed === undefined ? {} : { seed }) },
    })),
    (message) => message.type === 'room_created' ? message.roomId : undefined,
  );
  const tokens = [];
  for (let seat = 0; seat < seats; seat++) {
    tokens.push(await wsOnce(
      (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: seatName(seat) })),
      (message) => message.type === 'joined' ? message.playerToken : undefined,
    ));
  }
  await wsOnce(
    (ws) => ws.send(JSON.stringify({
      type: 'join',
      roomId,
      name: seatName(0),
      playerToken: tokens[0],
    })),
    (message, ws) => {
      if (message.type === 'joined') {
        ws.send(JSON.stringify({ type: 'start' }));
        return undefined;
      }
      return message.type === 'state' && message.view?.phase ? true : undefined;
    },
  );
  report.rooms[label] = { roomId, seats, soloDifficulty, ...(seed === undefined ? {} : { seed }) };
  console.log(`${label}: room ${roomId}, ${seats} seat${seats === 1 ? '' : 's'}`);
  return { label, roomId, tokens, seats };
}

function watchPage(page, label) {
  page.on('error', (error) => report.browserErrors.push(`${label} renderer: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') report.browserErrors.push(`${label} console: ${message.text()}`);
  });
  page.on('pageerror', (error) => report.browserErrors.push(`${label} pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown';
    // SPA navigation legitimately cancels lazy modules and unplayed audio
    // from the page being left. All other transport failures remain fatal.
    if (errorText === 'net::ERR_ABORTED') return;
    report.browserErrors.push(`${label} request failed: ${request.method()} ${request.url()} (${errorText})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) report.browserErrors.push(`${label} HTTP ${response.status()}: ${response.url()}`);
  });
}

async function dismissOnboarding(page) {
  await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const overlay = document.querySelector('[role="dialog"], .game-intro, .ig-intro, .intro-overlay');
    if (!overlay) return;
    const button = [...overlay.querySelectorAll('button')].find((candidate) => (
      visible(candidate)
      && !candidate.disabled
      && /^(got it|continue|start|play|close|let'?s play)$/i.test(candidate.textContent?.trim() ?? '')
    ));
    button?.click();
  });
  await sleep(100);
}

async function openDevice(browser, room, seat) {
  const label = `${room.label}-device-${seat + 1}`;
  const page = await browser.newPage();
  watchPage(page, label);
  await page.setViewport(DEVICE_VIEWPORT);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.evaluate(([roomId, token]) => {
    localStorage.setItem(`bge-token-${roomId}`, token);
  }, [room.roomId, room.tokens[seat]]);
  await page.goto(`${BASE}/play/${room.roomId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // Poll the live DOM directly. Puppeteer's isolated-world WaitTask can be
  // replaced during Vite reconciliation even though the painted device root
  // is already stable and visible.
  await waitForRenderedRoot(page, '[data-testid="seti-device-root"] .seti-board-stage, .seti-root.seti-device .seti-board-stage');
  await dismissOnboarding(page);
  return page;
}

async function openTv(browser, room) {
  const label = `${room.label}-tv`;
  const page = await browser.newPage();
  watchPage(page, label);
  await page.setViewport(TV_VIEWPORT);
  await page.goto(`${BASE}/board/${room.roomId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForRenderedRoot(page, '[data-testid="seti-tv-root"] [data-testid="seti-table"], .seti-root.seti-tv [data-testid="seti-table"]');
  await dismissOnboarding(page);
  return page;
}

function safeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function capture(page, name) {
  await page.bringToFront();
  const filename = `${String(report.screenshots.length + 1).padStart(2, '0')}-${safeName(name)}.png`;
  const target = path.join(outDir, filename);
  await page.screenshot({ path: target, fullPage: false });
  report.screenshots.push({ name, file: target });
  return target;
}

async function auditPage(page, label, expectedRoot) {
  await page.bringToFront();
  const metrics = await page.evaluate((rootSelector) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0';
    };
    const descriptor = (element) => {
      const testId = element.getAttribute('data-testid');
      const target = element.getAttribute('data-seti-target');
      const value = element.getAttribute('data-seti-value');
      const aria = element.getAttribute('aria-label');
      const text = element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60);
      return testId ? `[data-testid="${testId}"]`
        : target ? `[data-seti-target="${target}"]${value ? `[data-seti-value="${value}"]` : ''}`
          : aria ? `[aria-label="${aria}"]`
            : `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 3).join('.')}${text ? ` (${text})` : ''}`;
    };
    const candidates = [...document.querySelectorAll('button, [role="button"], [data-seti-target]')]
      .filter((element) => visible(element))
      .filter((element) => !element.matches(':disabled'))
      .filter((element) => element.getAttribute('aria-disabled') !== 'true')
      .filter((element) => getComputedStyle(element).pointerEvents !== 'none');
    const smallTargets = candidates.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        target: descriptor(element),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    }).filter(({ width, height }) => width < 40 || height < 40);
    const badImages = [...document.images]
      .filter((image) => visible(image))
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src || image.alt || 'unnamed image');
    const root = document.querySelector(rootSelector);
    const errors = [...document.querySelectorAll('.seti-error')]
      .filter((element) => visible(element))
      .map((element) => element.textContent?.replace(/\s+/g, ' ').trim());
    return {
      innerWidth,
      innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      rootPresent: Boolean(root),
      smallTargets,
      badImages,
      errors,
    };
  }, expectedRoot);
  const overflow = metrics.documentWidth > metrics.innerWidth + 1
    || metrics.documentHeight > metrics.innerHeight + 1
    || metrics.bodyWidth > metrics.innerWidth + 1
    || metrics.bodyHeight > metrics.innerHeight + 1;
  recordCheck(`${label}: expected root`, metrics.rootPresent, expectedRoot);
  recordCheck(`${label}: no viewport overflow`, !overflow, metrics);
  recordCheck(`${label}: enabled targets are at least 40x40`, metrics.smallTargets.length === 0, metrics.smallTargets);
  recordCheck(`${label}: visible images loaded`, metrics.badImages.length === 0, metrics.badImages);
  recordCheck(`${label}: no visible SETI error`, metrics.errors.length === 0, metrics.errors);
  return metrics;
}

async function switchLayer(page, layer) {
  await page.bringToFront();
  await waitForRenderedRoot(page, '[data-testid="seti-device-root"] .seti-board-stage, .seti-root.seti-device .seti-board-stage', 30_000);
  const selector = `[data-testid="seti-layer-${layer}"]`;
  if (!await clickEnabled(page, selector)) throw new Error(`SETI layer switch disappeared: ${layer}`);
  await page.waitForFunction((wanted) => {
    const layerElement = document.querySelector(`.seti-${wanted}-layer`);
    return layerElement?.classList.contains('is-visible');
  }, { timeout: 5_000 }, layer);
  return page.evaluate((wanted) => {
    const personal = document.querySelector('.seti-personal-layer');
    const solar = document.querySelector('.seti-solar-layer');
    const active = wanted === 'personal' ? personal : solar;
    const inactive = wanted === 'personal' ? solar : personal;
    const activeStyle = active ? getComputedStyle(active) : null;
    const inactiveStyle = inactive ? getComputedStyle(inactive) : null;
    return {
      activeVisible: Boolean(active?.classList.contains('is-visible')),
      activePointerEvents: activeStyle?.pointerEvents,
      inactiveVisible: Boolean(inactive?.classList.contains('is-visible')),
      inactivePointerEvents: inactiveStyle?.pointerEvents,
      inactiveAriaHidden: inactive?.getAttribute('aria-hidden'),
    };
  }, layer);
}

async function captureDeviceMatrix(page, label) {
  const personal = await switchLayer(page, 'personal');
  recordCheck(`${label}: personal surface activates`, personal.activeVisible && !personal.inactiveVisible, personal);
  recordCheck(`${label}: hidden solar surface cannot intercept input`, personal.inactivePointerEvents === 'none', personal);
  await capture(page, `${label} personal`);
  await auditPage(page, `${label} personal`, '[data-testid="seti-device-root"]');

  const solar = await switchLayer(page, 'solar');
  recordCheck(`${label}: solar surface activates`, solar.activeVisible && !solar.inactiveVisible, solar);
  recordCheck(`${label}: hidden personal surface cannot intercept input`, solar.inactivePointerEvents === 'none', solar);
  await capture(page, `${label} solar`);
  await auditPage(page, `${label} solar`, '[data-testid="seti-device-root"]');
}

async function verifyTvSurface(page, label, expectedSeats, expectSolo = false) {
  await page.bringToFront();
  await waitForRenderedRoot(page, '[data-testid="seti-tv-root"] [data-testid="seti-table"], .seti-root.seti-tv [data-testid="seti-table"]', 30_000);
  const surface = await page.evaluate(() => ({
    table: Boolean(document.querySelector('[data-testid="seti-table"]')),
    boardStage: Boolean(document.querySelector('[data-testid="seti-board-stage"]')),
    scoreChips: document.querySelectorAll('.seti-score-chip').length,
    starfield: Boolean(document.querySelector('.seti-starfield')),
    soloHud: Boolean(document.querySelector('.seti-tv-solo')),
  }));
  recordCheck(`${label}: shared table and board stage render`, surface.table && surface.boardStage, surface);
  recordCheck(`${label}: starfield renders behind table`, surface.starfield, surface);
  recordCheck(`${label}: score rail represents every seat`, surface.scoreChips === expectedSeats, surface);
  recordCheck(`${label}: solo HUD presence matches room`, surface.soloHud === expectSolo, surface);
}

// Returns the label of one physical pending-choice click. The function only
// clicks visible, enabled UI; it cannot modify application state directly.
function clickOnePendingChoice() {
  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const layer = element.closest('.seti-personal-layer, .seti-solar-layer');
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.pointerEvents !== 'none'
      && (!layer || layer.classList.contains('is-visible'));
  };
  const enabled = (selector, root = document) => [...root.querySelectorAll(selector)]
    .filter((element) => element instanceof HTMLButtonElement && !element.disabled && visible(element));
  const clickFirst = (selector, label, root = document) => {
    const button = enabled(selector, root)[0];
    if (!button) return null;
    button.click();
    return label;
  };

  // Starting income and several card effects intentionally open the real
  // card closeup before the player commits the printed action.
  const cardModal = document.querySelector('.seti-card-modal');
  if (cardModal) {
    const committed = clickFirst('.seti-card-commit button', 'card-commit', cardModal);
    if (committed) return committed;
    const close = clickFirst('.seti-close', 'card-close', cardModal);
    if (close) return close;
  }

  const soloModal = document.querySelector('.seti-solo-modal');
  if (soloModal) {
    const result = clickFirst('.is-choice, [data-seti-target]:not([disabled])', 'solo-objective', soloModal);
    if (result) return result;
  }

  const confirm = clickFirst('.seti-pending-confirm:not([disabled])', 'pending-confirm');
  if (confirm) return confirm;

  const pendingPanel = document.querySelector('.seti-pending-panel');
  if (pendingPanel) {
    const option = enabled('.seti-pending-options button:not(.is-selected)', pendingPanel)[0]
      ?? enabled('.seti-pending-options button', pendingPanel)[0];
    if (option) {
      option.click();
      return 'pending-option';
    }
  }

  const directSelectors = [
    '.seti-pending-artifacts button:not([disabled])',
    '.seti-hand-card.is-choice:not(.is-pending-selected)',
    // Once a Scan row has been touched it remains highlighted while sectors
    // become legal, so an available sector must outrank the persistent row.
    '.seti-sector-target:not([disabled])',
    '[data-testid="seti-scan-earth-step-target"]:not([disabled])',
    '[data-testid^="seti-project-row-"].is-choice:not([disabled])',
    '[aria-label^="choose project row card"]:not([disabled])',
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
    '.seti-computer-tech-slot.is-legal',
    '.seti-tech-stack.is-legal',
    '.seti-board-gold-target:not([disabled])',
    '.seti-board-mars-data-target:not([disabled])',
    '.seti-oumuamua-target:not([disabled])',
    '.seti-alien-space-target:not([disabled])',
    '.seti-planet-target:not([disabled])',
    '.seti-cell-target.is-legal:not([disabled])',
    '[data-seti-target="sample"]:not([disabled])',
    // Finish/skip is deliberately last. Scan, research, trace, movement, and
    // card effects must touch every available printed component before DONE.
    '.seti-direct-cue button:not([disabled])',
  ];
  for (const selector of directSelectors) {
    const result = clickFirst(selector, `direct:${selector}`);
    if (result) return result;
  }
  return null;
}

async function settleRoom(pages, maxClicks = 100) {
  const actions = [];
  let quietCycles = 0;
  let repeatFingerprint = '';
  let repeatCount = 0;
  for (let click = 0; click < maxClicks && quietCycles < 2; click++) {
    const pendingPresent = await Promise.all(pages.map((page) => page.evaluate(() => Boolean(
      document.querySelector('.seti-card-modal, .seti-solo-modal, .seti-pending-panel, .seti-direct-cue, .seti-pending-wait, .seti-pending-artifacts'),
    )).catch(() => false)));
    if (!pendingPresent.some(Boolean)) break;
    let progressed = false;
    for (let seat = 0; seat < pages.length; seat++) {
      const result = await pages[seat].evaluate(clickOnePendingChoice).catch(() => null);
      if (result) {
        actions.push({ seat, result });
        progressed = true;
        await sleep(STEP_DELAY);
        const fingerprint = await pages[seat].evaluate((action) => `${action}|${document.querySelector('.seti-turn-line')?.textContent ?? ''}|${document.querySelector('.seti-pending-panel, .seti-direct-cue, .seti-pending-artifacts')?.textContent ?? ''}`, result).catch(() => result);
        repeatCount = fingerprint === repeatFingerprint ? repeatCount + 1 : 0;
        repeatFingerprint = fingerprint;
        if (repeatCount >= 8) return actions;
      }
    }
    quietCycles = progressed ? 0 : quietCycles + 1;
    if (!progressed) await sleep(100);
  }
  return actions;
}

async function ownedPending(page) {
  return page.evaluate(() => {
    const wait = document.querySelector('.seti-pending-wait');
    const pending = document.querySelector('.seti-pending-panel, .seti-direct-cue, .seti-pending-artifacts, .seti-solo-modal');
    if (!pending || wait) return null;
    return {
      cue: pending.textContent?.replace(/\s+/g, ' ').trim() ?? 'pending decision',
      turn: document.querySelector('.seti-turn-line')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    };
  }).catch(() => null);
}

async function ownedPendings(pages) {
  const states = await Promise.all(pages.map((page) => ownedPending(page)));
  return states.flatMap((state, seat) => state ? [{ seat, ...state }] : []);
}

async function clickButtonByText(page, rootSelector, pattern) {
  return page.evaluate(({ root, source }) => {
    const container = document.querySelector(root);
    if (!container) return false;
    const expression = new RegExp(source, 'i');
    const button = [...container.querySelectorAll('button')].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return !candidate.disabled
        && rect.width > 0
        && rect.height > 0
        && expression.test(candidate.textContent ?? '');
    });
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  }, { root: rootSelector, source: pattern }).catch(() => false);
}

async function resolveSeed82Setup(pages) {
  const setup = [
    { seat: 3, handIndex: 3, cardId: '204665' },
    { seat: 0, handIndex: 3, cardId: '204622' },
    { seat: 1, handIndex: 2, cardId: '204564' },
    { seat: 2, handIndex: 3, cardId: '204526' },
  ];
  report.seed82Setup = [];
  for (const choice of setup) {
    const deadline = Date.now() + 8_000;
    let pending = null;
    while (Date.now() < deadline) {
      pending = await ownedPending(pages[choice.seat]);
      if (pending) break;
      await sleep(80);
    }
    if (!pending) throw new Error(`Seed 82 setup did not reach seat ${choice.seat + 1}`);
    const page = pages[choice.seat];
    await switchLayer(page, 'personal');
    const selector = `[data-testid="seti-hand-card-${choice.handIndex}"].is-choice`;
    if (!await clickEnabled(page, selector)) {
      throw new Error(`Seed 82 setup card ${choice.cardId} was not touchable at ${selector}`);
    }
    await page.waitForSelector('.seti-card-modal', { visible: true, timeout: 4_000 });
    if (!await clickButtonByText(page, '.seti-card-modal', 'TUCK FOR INCOME')) {
      throw new Error(`Seed 82 setup card ${choice.cardId} did not expose TUCK FOR INCOME`);
    }
    const departed = await waitForModeDeparture(page, 'pending', 4_000);
    if (departed.mode === 'pending' || departed.error) {
      throw new Error(`Seed 82 setup card ${choice.cardId} was not acknowledged: ${JSON.stringify(departed)}`);
    }
    report.seed82Setup.push({ ...choice, result: 'tucked-through-card-closeup' });
  }
  const unresolved = await ownedPendings(pages);
  if (unresolved.length) throw new Error(`Seed 82 setup left pending decisions: ${JSON.stringify(unresolved)}`);
}

async function inspectCardCloseup(page, label) {
  await switchLayer(page, 'personal');
  const opened = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    const card = [...document.querySelectorAll('[data-testid^="seti-hand-card-"]')]
      .find((candidate) => visible(candidate) && !candidate.classList.contains('is-choice'));
    if (!(card instanceof HTMLButtonElement)) return false;
    card.click();
    return true;
  });
  recordCheck(`${label}: hand card opens by touching the card`, opened);
  if (!opened) return false;
  try {
    await page.waitForSelector('[data-testid="seti-card-closeup"]', { visible: true, timeout: 5_000 });
  } catch {
    recordCheck(`${label}: card closeup appears`, false, 'closeup did not appear after card touch');
    return false;
  }
  const geometry = await page.evaluate(() => {
    const closeup = document.querySelector('[data-testid="seti-card-closeup"]');
    const art = closeup?.querySelector('.seti-card-art');
    if (!(closeup instanceof HTMLElement) || !(art instanceof HTMLElement)) return null;
    const closeupRect = closeup.getBoundingClientRect();
    const artRect = art.getBoundingClientRect();
    return {
      closeup: { width: closeupRect.width, height: closeupRect.height },
      art: { width: artRect.width, height: artRect.height },
    };
  });
  recordCheck(
    `${label}: card closeup art is at least 370x540`,
    Boolean(geometry && geometry.art.width >= 370 && geometry.art.height >= 540),
    geometry,
  );
  await capture(page, `${label} card closeup`);
  await auditPage(page, `${label} card closeup`, '[data-testid="seti-device-root"]');
  await page.click('.seti-card-closeup .seti-close').catch(() => page.keyboard.press('Escape'));
  await page.waitForSelector('[data-testid="seti-card-closeup"]', { hidden: true, timeout: 5_000 }).catch(() => {});
  return true;
}

async function enabled(page, selector) {
  return page.evaluate((wanted) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const layer = element.closest('.seti-personal-layer, .seti-solar-layer');
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.pointerEvents !== 'none'
        && (!layer || layer.classList.contains('is-visible'));
    };
    return [...document.querySelectorAll(wanted)].some((element) => (
      element instanceof HTMLButtonElement
      && !element.disabled
      && element.getAttribute('aria-disabled') !== 'true'
      && visible(element)
    ));
  }, selector).catch(() => false);
}

// Querying and clicking in one renderer task avoids a React reconciliation
// race where Puppeteer finds an enabled target, yields, and then tries to click
// a node that the next state update has already replaced.
async function clickEnabled(page, selector) {
  return page.evaluate((wanted) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const layer = element.closest('.seti-personal-layer, .seti-solar-layer');
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.pointerEvents !== 'none'
        && (!layer || layer.classList.contains('is-visible'));
    };
    const element = [...document.querySelectorAll(wanted)].find((candidate) => (
      candidate instanceof HTMLButtonElement
      && !candidate.disabled
      && candidate.getAttribute('aria-disabled') !== 'true'
      && visible(candidate)
    ));
    if (!(element instanceof HTMLButtonElement)) return false;
    element.click();
    return true;
  }, selector).catch(() => false);
}

async function pieceMotionFrame(page, testId = null) {
  return page.evaluate((wanted) => {
    const piece = wanted
      ? document.querySelector(`[data-testid="${CSS.escape(wanted)}"]`)
      : document.querySelector('.seti-space-piece.is-selected, [data-testid^="seti-piece-"]');
    if (!(piece instanceof HTMLElement)) return null;
    const orbit = piece.closest('.seti-piece-orbit');
    const counter = piece.closest('.seti-piece-counter');
    if (!(orbit instanceof HTMLElement) || !(counter instanceof HTMLElement)) return null;
    const bounds = piece.getBoundingClientRect();
    const orbitStyle = getComputedStyle(orbit);
    const counterStyle = getComputedStyle(counter);
    return {
      testId: piece.getAttribute('data-testid'),
      state: orbit.dataset.motionState ?? 'missing',
      center: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      orbitTransition: { property: orbitStyle.transitionProperty, duration: orbitStyle.transitionDuration, timing: orbitStyle.transitionTimingFunction },
      counterTransition: { property: counterStyle.transitionProperty, duration: counterStyle.transitionDuration, timing: counterStyle.transitionTimingFunction },
    };
  }, testId).catch(() => null);
}

async function waitForPieceMotion(page, testId, wantedStates, timeout = 2_500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = await pieceMotionFrame(page, testId);
    if (frame && wantedStates.includes(frame.state)) return frame;
    await sleep(20);
  }
  return pieceMotionFrame(page, testId);
}

async function turnState(page) {
  return page.evaluate(() => {
    const turn = document.querySelector('.seti-turn-line')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const ownedPending = document.querySelector('.seti-pending-panel, .seti-direct-cue, .seti-pending-artifacts, .seti-solo-modal');
    const waitingPending = document.querySelector('.seti-pending-wait');
    let mode = 'inactive';
    if (ownedPending) mode = 'pending';
    else if (waitingPending) mode = 'waiting-pending';
    else if (/YOUR TURN/i.test(turn) && /FREE ACTIONS OR END TURN/i.test(turn)) mode = 'post-main';
    else if (/YOUR TURN/i.test(turn) && /TOUCH A PIECE OR PRINTED ACTION/i.test(turn)) mode = 'main';
    else if (/MISSION COMPLETE/i.test(turn)) mode = 'ended';
    return {
      mode,
      turn,
      pending: ownedPending?.textContent?.replace(/\s+/g, ' ').trim() ?? waitingPending?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      error: document.querySelector('.seti-error')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    };
  }).catch(() => ({ mode: 'unavailable', turn: '', pending: null, error: null }));
}

async function waitForModeDeparture(page, previousMode, timeout = 4_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await turnState(page);
    if (state.mode !== previousMode) return state;
    await sleep(80);
  }
  return turnState(page);
}

async function resourceCounts(page) {
  return page.evaluate(() => {
    const result = { credits: 0, energy: 0, data: 0, publicity: 0 };
    for (const piece of document.querySelectorAll('.seti-resource-piece')) {
      const label = piece.querySelector('small')?.textContent?.trim().toLowerCase();
      const value = Number(piece.querySelector('b')?.textContent?.trim() ?? 0);
      if (label && label in result && Number.isFinite(value)) result[label] = value;
    }
    return result;
  }).catch(() => ({ credits: 0, energy: 0, data: 0, publicity: 0 }));
}

async function findActiveSeat(pages) {
  const states = await Promise.all(pages.map((page) => turnState(page)));
  return states.findIndex((state) => state.mode === 'main' || state.mode === 'post-main');
}

async function diagnostic(page) {
  return page.evaluate(() => ({
    turn: document.querySelector('.seti-turn-line')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    pending: document.querySelector('.seti-pending-panel, .seti-direct-cue, .seti-pending-wait, .seti-pending-artifacts')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    event: document.querySelector('.seti-event-caption')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    error: document.querySelector('.seti-error')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    enabled: [...document.querySelectorAll('button:not(:disabled)')]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const layer = button.closest('.seti-personal-layer, .seti-solar-layer');
        const style = getComputedStyle(button);
        return rect.width > 0
          && rect.height > 0
          && style.visibility !== 'hidden'
          && style.pointerEvents !== 'none'
          && (!layer || layer.classList.contains('is-visible'));
      })
      .map((button) => button.getAttribute('data-testid')
        ?? button.getAttribute('data-seti-value')
        ?? button.getAttribute('aria-label')
        ?? button.textContent?.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 30),
  })).catch(() => null);
}

async function markCoverage(name, page, tv, detail) {
  const entry = report.actionCoverage[name];
  if (!entry) return;
  entry.reached = true;
  entry.evidence.push({ at: new Date().toISOString(), detail, state: await diagnostic(page) });
  if (entry.evidence.length === 1) {
    await capture(page, `action ${name} device`);
    await capture(tv, `action ${name} tv`);
    await auditPage(page, `action ${name} device`, '[data-testid="seti-device-root"]');
    await auditPage(tv, `action ${name} TV`, '[data-testid="seti-tv-root"]');
  }
}

async function attemptMainButton(pages, seat, tv, name) {
  const page = pages[seat];
  const selector = `[data-testid="seti-action-${name}"]`;
  await switchLayer(page, 'personal');
  const initialTurn = await turnState(page);
  if (initialTurn.mode !== 'main') {
    report.actionCoverage[name].attempts.push({ result: 'not-in-main-action-window', state: await diagnostic(page) });
    return false;
  }
  if (!await enabled(page, selector)) {
    report.actionCoverage[name].attempts.push({ result: 'button-disabled', state: await diagnostic(page) });
    return false;
  }
  const before = await diagnostic(page);
  if (!await clickEnabled(page, selector)) {
    report.actionCoverage[name].attempts.push({ result: 'button-reconciled-before-click', before });
    return false;
  }
  await sleep(Math.max(STEP_DELAY, 140));
  await capture(page, `action ${name} pending choice`);
  const choices = await settleRoom(pages, 80);
  const unresolved = await ownedPending(page);
  if (['scan', 'research', 'analyze'].includes(name) && (choices.length === 0 || unresolved)) {
    report.actionCoverage[name].attempts.push({
      result: unresolved ? 'physical-follow-up-remained-unresolved' : 'no-physical-follow-up-choice-reached',
      before,
      after: await diagnostic(page),
      unresolved,
      physicalFollowUps: choices,
    });
    return false;
  }
  const after = await diagnostic(page);
  const finalTurn = await turnState(page);
  if (after?.error && after.error !== before?.error) {
    report.actionCoverage[name].attempts.push({ result: 'ui-error', before, after });
    return false;
  }
  if (finalTurn.mode !== 'post-main') {
    report.actionCoverage[name].attempts.push({
      result: 'main-action-not-acknowledged',
      before,
      after,
      turnState: finalTurn,
      physicalFollowUps: choices,
    });
    return false;
  }
  await markCoverage(name, page, tv, {
    trigger: `${selector} accepted by live UI`,
    physicalFollowUps: choices,
  });
  return true;
}

async function attemptCard(pages, seat, tv) {
  const page = pages[seat];
  if (report.actionCoverage.card.reached) return false;
  await switchLayer(page, 'personal');
  if ((await turnState(page)).mode !== 'main') {
    report.actionCoverage.card.attempts.push({ result: 'not-in-main-action-window', state: await diagnostic(page) });
    return false;
  }
  const before = await diagnostic(page);
  const opened = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.seti-hand-card.is-playable')]
      .find((candidate) => candidate instanceof HTMLButtonElement && !candidate.disabled);
    if (!(card instanceof HTMLButtonElement)) return false;
    card.click();
    return true;
  });
  if (!opened) {
    report.actionCoverage.card.attempts.push({ result: 'no-playable-card', state: await diagnostic(page) });
    return false;
  }
  await sleep(STEP_DELAY);
  const committed = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.seti-card-commit button')]
      .find((candidate) => !candidate.disabled && /play main/i.test(candidate.textContent ?? ''));
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  });
  if (!committed) {
    report.actionCoverage.card.attempts.push({ result: 'play-main-unavailable', state: await diagnostic(page) });
    await page.click('.seti-card-closeup .seti-close').catch(() => {});
    return false;
  }
  await sleep(Math.max(STEP_DELAY, 140));
  const choices = await settleRoom(pages, 80);
  const unresolved = await ownedPending(page);
  const after = await diagnostic(page);
  const finalTurn = await turnState(page);
  if (unresolved || (after?.error && after.error !== before?.error) || finalTurn.mode !== 'post-main') {
    report.actionCoverage.card.attempts.push({
      result: unresolved ? 'physical-follow-up-remained-unresolved'
        : after?.error && after.error !== before?.error ? 'ui-error'
          : 'main-action-not-acknowledged',
      before,
      after,
      unresolved,
      physicalFollowUps: choices,
      turnState: finalTurn,
    });
    return false;
  }
  await markCoverage('card', page, tv, 'playable hand card touched, then PLAY MAIN committed');
  return true;
}

const spatialMemory = { visited: new Set(), selectedPieceAttempts: 0 };

async function affordableRenderedTarget(page, selector, kind) {
  const resources = await resourceCounts(page);
  return page.evaluate(({ wanted, targetKind, available, visited }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const layer = element.closest('.seti-personal-layer, .seti-solar-layer');
      return rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.pointerEvents !== 'none'
        && (!layer || layer.classList.contains('is-visible'));
    };
    const choices = [...document.querySelectorAll(wanted)]
      .filter((candidate) => candidate instanceof HTMLButtonElement && !candidate.disabled && visible(candidate))
      .map((candidate) => {
        const label = candidate.getAttribute('aria-label') ?? '';
        const usesCard = /movement card/i.test(label);
        const energyMatch = label.match(/(\d+) energy/i);
        const creditMatch = label.match(/(\d+) credit/i);
        const energy = usesCard ? 0 : Number(energyMatch?.[1] ?? (targetKind === 'move' ? 1 : 0));
        const credits = Number(creditMatch?.[1] ?? 0);
        const value = candidate.getAttribute('data-seti-value') ?? candidate.getAttribute('data-testid') ?? '';
        return {
          testId: candidate.getAttribute('data-testid'),
          value,
          label,
          energy,
          credits,
          unseen: !visited.includes(value),
          ring: Number(value.match(/r(\d+)/)?.[1] ?? 0),
        };
      })
      .filter((choice) => choice.energy <= available.energy && choice.credits <= available.credits)
      .sort((a, b) => Number(b.unseen) - Number(a.unseen)
        || a.energy - b.energy
        || b.ring - a.ring
        || a.value.localeCompare(b.value));
    return choices[0] ?? null;
  }, { wanted: selector, targetKind: kind, available: resources, visited: [...spatialMemory.visited] });
}

async function attemptSpatial(pages, seat, tv) {
  const page = pages[seat];
  if (report.actionCoverage.move.reached && report.actionCoverage.orbit.reached && report.actionCoverage.land.reached) return null;
  if ((await turnState(page)).mode !== 'main') return null;
  await switchLayer(page, 'solar');
  const pieceTouched = await page.evaluate(() => {
    const piece = [...document.querySelectorAll('[data-testid^="seti-piece-"]')]
      .find((candidate) => candidate instanceof HTMLButtonElement && !candidate.disabled && candidate.getBoundingClientRect().width > 0);
    if (!(piece instanceof HTMLButtonElement)) return false;
    piece.click();
    return true;
  });
  if (!pieceTouched) return null;
  spatialMemory.selectedPieceAttempts++;
  await sleep(140);

  // Orbit first, then use a later fresh probe for land. Both costs are read
  // from the rendered target so an attractive-but-unaffordable glow is never
  // sent to the server.
  for (const name of ['orbit', 'land']) {
    if (report.actionCoverage[name].reached) continue;
    const selector = `[data-testid^="seti-${name}-target-"]:not([disabled])`;
    const target = await affordableRenderedTarget(page, selector, name);
    if (!target?.testId) continue;
    const before = await diagnostic(page);
    if (!await clickEnabled(page, `[data-testid="${target.testId}"]`)) continue;
    await sleep(Math.max(STEP_DELAY, 140));
    const choices = await settleRoom(pages, 80);
    const after = await diagnostic(page);
    const finalTurn = await turnState(page);
    if ((after?.error && after.error !== before?.error) || finalTurn.mode !== 'post-main') {
      report.actionCoverage[name].attempts.push({
        result: after?.error && after.error !== before?.error ? 'ui-error' : 'main-action-not-acknowledged',
        target,
        before,
        after,
        turnState: finalTurn,
        physicalFollowUps: choices,
      });
      return null;
    }
    await markCoverage(name, page, tv, `piece touched, then affordable rendered ${name} target ${target.value} touched`);
    return name;
  }

  if (spatialMemory.selectedPieceAttempts > 36) return null;
  const selector = '[data-testid^="seti-cell-target-"]:not([disabled])';
  const target = await affordableRenderedTarget(page, selector, 'move');
  if (!target?.testId) return null;
  const before = await diagnostic(page);
  const beforeResources = await resourceCounts(page);
  spatialMemory.visited.add(target.value);
  if (!await clickEnabled(page, `[data-testid="${target.testId}"]`)) return null;
  await sleep(Math.max(STEP_DELAY, 180));
  const choices = await settleRoom(pages, 40);
  const after = await diagnostic(page);
  const afterResources = await resourceCounts(page);
  const finalTurn = await turnState(page);
  const selectionCleared = !await enabled(page, selector);
  const acknowledged = selectionCleared
    || choices.length > 0
    || beforeResources.energy !== afterResources.energy
    || beforeResources.credits !== afterResources.credits;
  if ((after?.error && after.error !== before?.error) || finalTurn.mode !== 'main' || !acknowledged) {
    report.actionCoverage.move.attempts.push({
      result: after?.error && after.error !== before?.error ? 'ui-error'
        : finalTurn.mode !== 'main' ? 'free-move-left-main-window'
          : 'move-not-acknowledged',
      target,
      before,
      after,
      beforeResources,
      afterResources,
      turnState: finalTurn,
      physicalFollowUps: choices,
    });
    return null;
  }
  if (!report.actionCoverage.move.reached) {
    await markCoverage('move', page, tv, `piece touched, then affordable legal solar cell ${target.value} touched`);
  }
  return 'move';
}

async function attemptLaunch(pages, seat, tv) {
  const page = pages[seat];
  await switchLayer(page, 'personal');
  if ((await turnState(page)).mode !== 'main') {
    report.actionCoverage.launch.attempts.push({ result: 'not-in-main-action-window', state: await diagnostic(page) });
    return false;
  }
  const before = await diagnostic(page);
  if (!await enabled(page, '[data-testid="seti-action-launch"]')) {
    report.actionCoverage.launch.attempts.push({ result: 'launch-disabled', state: await diagnostic(page) });
    return false;
  }
  if (!await clickEnabled(page, '[data-testid="seti-action-launch"]')) {
    report.actionCoverage.launch.attempts.push({ result: 'launch-reconciled-before-click', state: await diagnostic(page) });
    return false;
  }
  await sleep(120);
  await switchLayer(page, 'solar');
  if (!await enabled(page, '[data-testid="seti-launch-earth-target"]')) {
    report.actionCoverage.launch.attempts.push({ result: 'earth-target-unavailable', state: await diagnostic(page) });
    return false;
  }
  if (!await clickEnabled(page, '[data-testid="seti-launch-earth-target"]')) {
    report.actionCoverage.launch.attempts.push({ result: 'earth-target-reconciled-before-click', state: await diagnostic(page) });
    return false;
  }
  await sleep(Math.max(STEP_DELAY, 140));
  const choices = await settleRoom(pages, 80);
  const unresolved = await ownedPending(page);
  const after = await diagnostic(page);
  const finalTurn = await turnState(page);
  if (unresolved || (after?.error && after.error !== before?.error) || finalTurn.mode !== 'post-main') {
    report.actionCoverage.launch.attempts.push({
      result: unresolved ? 'physical-follow-up-remained-unresolved'
        : after?.error && after.error !== before?.error ? 'ui-error'
          : 'main-action-not-acknowledged',
      before,
      after,
      unresolved,
      physicalFollowUps: choices,
      turnState: finalTurn,
    });
    return false;
  }
  await markCoverage('launch', page, tv, 'LAUNCH touched, then the rendered Earth launch target touched');
  return true;
}

async function placeOneData(pages, seat) {
  const page = pages[seat];
  if ((await turnState(page)).mode !== 'main') return false;
  await switchLayer(page, 'personal');
  const before = await diagnostic(page);
  const beforeResources = await resourceCounts(page);
  const selected = await page.evaluate(() => {
    const resource = [...document.querySelectorAll('button.seti-resource-piece')].find((button) => (
      !button.disabled
      && [...button.querySelectorAll('small')].some((label) => /^data$/i.test(label.textContent?.trim() ?? ''))
      && button.getBoundingClientRect().width > 0
    ));
    if (!(resource instanceof HTMLButtonElement)) return false;
    resource.click();
    return true;
  });
  if (!selected) return false;
  await sleep(100);
  if (!await enabled(page, '.seti-computer-slot.is-legal')) return false;
  if (!await clickEnabled(page, '.seti-computer-slot.is-legal')) return false;
  await sleep(Math.max(STEP_DELAY, 140));
  const choices = await settleRoom(pages, 40);
  const after = await diagnostic(page);
  const afterResources = await resourceCounts(page);
  const finalTurn = await turnState(page);
  const acknowledged = afterResources.data < beforeResources.data || choices.length > 0;
  if ((after?.error && after.error !== before?.error) || finalTurn.mode !== 'main' || !acknowledged) return false;
  return true;
}

async function currentRound(pages) {
  const rounds = await Promise.all(pages.map((page) => page.evaluate(() => {
    const text = document.querySelector('.seti-turn-line')?.textContent ?? '';
    return Number(text.match(/ROUND\s*(\d+)\s*OF\s*5/i)?.[1] ?? 0);
  }).catch(() => 0)));
  return Math.max(1, ...rounds);
}

async function requireActiveSeat(pages, expectedSeat, label) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await settleRoom(pages, 80);
    const unresolved = await ownedPendings(pages);
    if (unresolved.length) throw new Error(`${label} left unresolved pending UI: ${JSON.stringify(unresolved)}`);
    const active = await findActiveSeat(pages);
    if (active === expectedSeat && (await turnState(pages[active])).mode === 'main') return pages[active];
    await sleep(100);
  }
  const states = await Promise.all(pages.map((page) => turnState(page)));
  throw new Error(`${label} expected active seat ${expectedSeat + 1}: ${JSON.stringify(states)}`);
}

async function useCorner(pages, seat, expectedCardName = null) {
  const page = pages[seat];
  const beforeTurn = await turnState(page);
  if (!['main', 'post-main'].includes(beforeTurn.mode)) return false;
  await switchLayer(page, 'personal');
  const before = await page.evaluate(() => ({
    hand: document.querySelectorAll('.seti-hand-card').length,
    error: document.querySelector('.seti-error')?.textContent?.trim() ?? null,
  }));
  const opened = await page.evaluate((wantedName) => {
    const cards = [...document.querySelectorAll('.seti-hand-card.has-corner')];
    const card = cards.find((candidate) => {
      if (!wantedName) return true;
      const label = candidate.querySelector('.seti-card-art')?.getAttribute('aria-label') ?? '';
      return label.toLowerCase() === wantedName.toLowerCase();
    });
    if (!(card instanceof HTMLButtonElement) || card.disabled) return false;
    card.click();
    return true;
  }, expectedCardName);
  if (!opened) return false;
  await page.waitForSelector('.seti-card-modal', { visible: true, timeout: 12_000 });
  if (!await clickButtonByText(page, '.seti-card-modal', 'USE CORNER')) return false;
  try {
    await page.waitForFunction((expectedHand) => (
      !document.querySelector('.seti-card-modal')
      && document.querySelectorAll('.seti-hand-card').length === expectedHand
    ), { timeout: 12_000 }, before.hand - 1);
  } catch {
    return false;
  }
  await sleep(Math.max(STEP_DELAY, 140));
  const choices = await settleRoom(pages, 40);
  const after = await page.evaluate(() => ({
    hand: document.querySelectorAll('.seti-hand-card').length,
    error: document.querySelector('.seti-error')?.textContent?.trim() ?? null,
  }));
  let afterTurn = await turnState(page);
  const stableDeadline = Date.now() + 12_000;
  while (Date.now() < stableDeadline && !['main', 'post-main'].includes(afterTurn.mode)) {
    await sleep(80);
    afterTurn = await turnState(page);
  }
  return after.hand === before.hand - 1
    && !(after.error && after.error !== before.error)
    && ['main', 'post-main'].includes(afterTurn.mode)
    && !(await ownedPending(page))
    && Array.isArray(choices);
}

async function placeDataSlot(pages, seat, slot) {
  const page = pages[seat];
  const beforeTurn = await turnState(page);
  if (!['main', 'post-main'].includes(beforeTurn.mode)) return false;
  await switchLayer(page, 'personal');
  const before = await resourceCounts(page);
  const selected = await page.evaluate(() => {
    const resource = [...document.querySelectorAll('button.seti-resource-piece')].find((button) => (
      !button.disabled
      && [...button.querySelectorAll('small')].some((label) => /^data$/i.test(label.textContent?.trim() ?? ''))
    ));
    if (!(resource instanceof HTMLButtonElement)) return false;
    resource.click();
    return true;
  });
  if (!selected) return false;
  await sleep(80);
  const selector = `.seti-computer-slot.is-legal[data-seti-value="${slot}"]`;
  if (!await clickEnabled(page, selector)) return false;
  try {
    await page.waitForFunction(({ value, expectedData }) => {
      const filled = document.querySelector(`.seti-computer-slot[data-seti-value="${value}"]`)?.classList.contains('is-filled') ?? false;
      const dataPiece = [...document.querySelectorAll('.seti-resource-piece')].find((piece) => (
        piece.querySelector('small')?.textContent?.trim().toLowerCase() === 'data'
      ));
      const data = Number(dataPiece?.querySelector('b')?.textContent?.trim() ?? Number.NaN);
      return filled && data === expectedData;
    }, { timeout: 12_000 }, { value: String(slot), expectedData: before.data - 1 });
  } catch {
    return false;
  }
  await sleep(Math.max(STEP_DELAY, 140));
  await settleRoom(pages, 40);
  const after = await resourceCounts(page);
  const filled = await page.evaluate((value) => document.querySelector(`.seti-computer-slot[data-seti-value="${value}"]`)?.classList.contains('is-filled') ?? false, String(slot));
  let afterTurn = await turnState(page);
  const stableDeadline = Date.now() + 12_000;
  while (Date.now() < stableDeadline && !['main', 'post-main'].includes(afterTurn.mode)) {
    await sleep(80);
    afterTurn = await turnState(page);
  }
  return filled && after.data === before.data - 1 && ['main', 'post-main'].includes(afterTurn.mode) && !afterTurn.error;
}

async function moveToSeed82Mars(pages, seat, tv) {
  const page = pages[seat];
  if ((await turnState(page)).mode !== 'post-main') return false;
  await switchLayer(page, 'solar');
  if (!await clickEnabled(page, '[data-testid^="seti-piece-"]')) return false;
  await sleep(120);
  const target = await affordableRenderedTarget(page, '[data-testid="seti-cell-target-r1s3"]', 'move');
  if (!target?.testId) return false;
  const before = await diagnostic(page);
  const beforeResources = await resourceCounts(page);
  const proveMotion = !report.actionCoverage.move.reached;
  let preDevice = null;
  let preTv = null;
  let midDevice = null;
  let midTv = null;
  let postDevice = null;
  let postTv = null;
  let deviceMotionPromise = Promise.resolve(null);
  let tvMotionPromise = Promise.resolve(null);
  if (proveMotion) {
    preDevice = await pieceMotionFrame(page);
    if (!preDevice?.testId) return false;
    preTv = await pieceMotionFrame(tv, preDevice.testId);
    await capture(page, 'movement temporal pre device');
    await capture(tv, 'movement temporal pre tv');
    deviceMotionPromise = waitForPieceMotion(page, preDevice.testId, ['travelling', 'arriving']);
    tvMotionPromise = waitForPieceMotion(tv, preDevice.testId, ['travelling', 'arriving']);
  }
  if (!await clickEnabled(page, `[data-testid="${target.testId}"]`)) return false;
  if (proveMotion) {
    [midDevice, midTv] = await Promise.all([deviceMotionPromise, tvMotionPromise]);
    recordCheck('movement enters a timed physical transition on device', !!midDevice && ['travelling', 'arriving'].includes(midDevice.state), midDevice);
    recordCheck('movement enters a timed physical transition on TV', !!midTv && ['travelling', 'arriving'].includes(midTv.state), midTv);
    recordCheck('movement interpolates angular and radial coordinates', !!midDevice
      && /transform/.test(midDevice.orbitTransition.property)
      && /left/.test(midDevice.counterTransition.property)
      && /transform/.test(midDevice.counterTransition.property)
      && midDevice.orbitTransition.duration !== '0s', midDevice);
    await capture(page, 'movement temporal mid device');
    await capture(tv, 'movement temporal mid tv');
  }
  await sleep(Math.max(STEP_DELAY, 180));
  const choices = await settleRoom(pages, 40);
  if (proveMotion && preDevice?.testId) {
    [postDevice, postTv] = await Promise.all([
      waitForPieceMotion(page, preDevice.testId, ['idle'], 3_000),
      waitForPieceMotion(tv, preDevice.testId, ['idle'], 3_000),
    ]);
    const moved = (beforeFrame, afterFrame) => !!beforeFrame && !!afterFrame
      && Math.hypot(afterFrame.center.x - beforeFrame.center.x, afterFrame.center.y - beforeFrame.center.y) > 2;
    recordCheck('movement settles at a new authoritative device coordinate', postDevice?.state === 'idle' && moved(preDevice, postDevice), { pre: preDevice, mid: midDevice, post: postDevice });
    recordCheck('movement settles at a new authoritative TV coordinate', postTv?.state === 'idle' && moved(preTv, postTv), { pre: preTv, mid: midTv, post: postTv });
  }
  const after = await diagnostic(page);
  const afterResources = await resourceCounts(page);
  const afterTurn = await turnState(page);
  const acknowledged = afterResources.energy < beforeResources.energy || choices.length > 0;
  if (!acknowledged || afterTurn.mode !== 'post-main' || (after?.error && after.error !== before?.error)) return false;
  if (proveMotion) {
    await markCoverage('move', page, tv, {
      gesture: 'seed 82 probe touched at Earth, then rendered Mars cell r1s3 touched',
      temporalFrames: { device: { pre: preDevice, mid: midDevice, post: postDevice }, tv: { pre: preTv, mid: midTv, post: postTv } },
    });
  }
  return true;
}

async function bodyAction(pages, seat, tv, kind, body = 'Mars') {
  const page = pages[seat];
  if ((await turnState(page)).mode !== 'main') return false;
  await switchLayer(page, 'solar');
  if (!await clickEnabled(page, '[data-testid^="seti-piece-"]')) return false;
  await sleep(120);
  const selector = `[data-testid="seti-${kind}-target-${body}"]`;
  const target = await affordableRenderedTarget(page, selector, kind);
  if (!target?.testId) return false;
  const before = await diagnostic(page);
  if (!await clickEnabled(page, selector)) return false;
  await sleep(Math.max(STEP_DELAY, 160));
  const choices = await settleRoom(pages, 80);
  const after = await diagnostic(page);
  const afterTurn = await turnState(page);
  if ((after?.error && after.error !== before?.error) || afterTurn.mode !== 'post-main' || await ownedPending(page)) return false;
  await markCoverage(kind, page, tv, `seed 82 probe touched at Mars, then rendered ${kind} target touched`);
  return Array.isArray(choices);
}

async function finishAcknowledgedTurn(pages, seat, label) {
  const page = pages[seat];
  const before = await turnState(page);
  if (before.mode !== 'post-main') throw new Error(`${label}: seat ${seat + 1} was not in acknowledged post-main state: ${JSON.stringify(before)}`);
  if (!await clickEnabled(page, '[data-testid="seti-end-turn"]')) throw new Error(`${label}: End Turn was not touchable`);
  const deadline = Date.now() + 12_000;
  let states = await Promise.all(pages.map((candidate) => turnState(candidate)));
  while (Date.now() < deadline) {
    const acting = states[seat];
    const anotherSeatAdvanced = states.some((state, index) => (
      index !== seat && (state.mode === 'main' || state.mode === 'post-main')
    ));
    if (acting.error) throw new Error(`${label}: End Turn produced an error: ${JSON.stringify(acting)}`);
    if (acting.mode !== 'post-main' || anotherSeatAdvanced) return;
    await sleep(100);
    states = await Promise.all(pages.map((candidate) => turnState(candidate)));
  }
  throw new Error(`${label}: End Turn was not acknowledged by any device: ${JSON.stringify(states)}`);
}

async function passMainWindow(page, seat, label) {
  const before = await turnState(page);
  if (before.mode !== 'main') throw new Error(`${label}: seat ${seat + 1} was not in a main-action window`);
  if (!await clickEnabled(page, '[data-testid="seti-pass"]')) throw new Error(`${label}: Pass was not touchable`);
  const departed = await waitForModeDeparture(page, 'main');
  if (departed.mode === 'main' || departed.error) throw new Error(`${label}: Pass was not acknowledged: ${JSON.stringify(departed)}`);
}

async function playCoverageScenario(pages, tv) {
  await requireActiveSeat(pages, 3, 'seed 82 starting seat');
  const first = 3;
  const roles = { analyze: 3, land: 0, orbit: 1, research: 2 };
  report.orchestration = { seed: 82, roles, events: [] };
  const event = (seat, action, detail = undefined) => report.orchestration.events.push({ seat: seat + 1, role: Object.entries(roles).find(([, value]) => value === seat)?.[0], action, detail });
  console.log('seed 82 route: analyze=seat 4, land=seat 1, orbit=seat 2, research=seat 3');

  // Cycle 1: build the exact resources and board position proven by reducer.
  await requireActiveSeat(pages, roles.analyze, 'cycle 1 analyze seat');
  if (!await attemptMainButton(pages, roles.analyze, tv, 'scan')) throw new Error('Seed 82 analyze seat could not Scan');
  event(roles.analyze, 'scan');
  for (let card = 0; card < 4; card++) {
    if (!await useCorner(pages, roles.analyze)) throw new Error(`Seed 82 analyze seat could not discard data corner ${card + 1}`);
    event(roles.analyze, 'data-corner');
  }
  for (let slot = 0; slot < 6; slot++) {
    if (!await placeDataSlot(pages, roles.analyze, slot)) throw new Error(`Seed 82 analyze seat could not fill computer slot ${slot}`);
    event(roles.analyze, 'place-data', { slot });
  }
  await finishAcknowledgedTurn(pages, roles.analyze, 'cycle 1 analyze seat');

  await requireActiveSeat(pages, roles.land, 'cycle 1 land seat');
  if (!await attemptLaunch(pages, roles.land, tv)) throw new Error('Seed 82 land seat could not Launch');
  event(roles.land, 'launch');
  if (!await moveToSeed82Mars(pages, roles.land, tv)) throw new Error('Seed 82 land seat could not move Earth to Mars');
  event(roles.land, 'move-mars');
  await finishAcknowledgedTurn(pages, roles.land, 'cycle 1 land seat');

  await requireActiveSeat(pages, roles.orbit, 'cycle 1 orbit seat');
  if (!await attemptLaunch(pages, roles.orbit, tv)) throw new Error('Seed 82 orbit seat could not Launch');
  event(roles.orbit, 'launch');
  if (!await moveToSeed82Mars(pages, roles.orbit, tv)) throw new Error('Seed 82 orbit seat could not move Earth to Mars');
  event(roles.orbit, 'move-mars');
  await finishAcknowledgedTurn(pages, roles.orbit, 'cycle 1 orbit seat');

  await requireActiveSeat(pages, roles.research, 'cycle 1 research seat');
  if (!await attemptMainButton(pages, roles.research, tv, 'scan')) throw new Error('Seed 82 research seat could not Scan');
  event(roles.research, 'scan');
  for (let slot = 0; slot < 2; slot++) {
    if (!await placeDataSlot(pages, roles.research, slot)) throw new Error(`Seed 82 research seat could not fill computer slot ${slot}`);
    event(roles.research, 'place-data', { slot });
  }
  if (!await useCorner(pages, roles.research, 'Lightsail')) throw new Error('Seed 82 research seat could not discard Lightsail publicity corner');
  event(roles.research, 'publicity-corner', { card: '204565' });
  await finishAcknowledgedTurn(pages, roles.research, 'cycle 1 research seat');

  // Cycle 2: consume the prepared resources with the four hard main actions.
  await requireActiveSeat(pages, roles.analyze, 'cycle 2 analyze seat');
  if (!await attemptMainButton(pages, roles.analyze, tv, 'analyze')) throw new Error('Seed 82 analyze seat could not Analyze');
  event(roles.analyze, 'analyze');
  await finishAcknowledgedTurn(pages, roles.analyze, 'cycle 2 analyze seat');

  await requireActiveSeat(pages, roles.land, 'cycle 2 land seat');
  if (!await bodyAction(pages, roles.land, tv, 'land')) throw new Error('Seed 82 land seat could not Land on Mars');
  event(roles.land, 'land-mars');
  await finishAcknowledgedTurn(pages, roles.land, 'cycle 2 land seat');

  await requireActiveSeat(pages, roles.orbit, 'cycle 2 orbit seat');
  if (!await bodyAction(pages, roles.orbit, tv, 'orbit')) throw new Error('Seed 82 orbit seat could not Orbit Mars');
  event(roles.orbit, 'orbit-mars');
  await finishAcknowledgedTurn(pages, roles.orbit, 'cycle 2 orbit seat');

  await requireActiveSeat(pages, roles.research, 'cycle 2 research seat');
  if (!await attemptMainButton(pages, roles.research, tv, 'research')) throw new Error('Seed 82 research seat could not Research');
  event(roles.research, 'research');
  await finishAcknowledgedTurn(pages, roles.research, 'cycle 2 research seat');

  // Card play uses the first remaining seat with a playable physical card.
  for (let attempt = 0; attempt < pages.length && !report.actionCoverage.card.reached; attempt++) {
    const active = await findActiveSeat(pages);
    if (active < 0) throw new Error('Seed 82 card route had no active seat');
    if (await attemptCard(pages, active, tv)) {
      event(active, 'card');
      break;
    }
    await passMainWindow(pages[active], active, 'seed 82 card fallback');
    event(active, 'pass-for-card');
    await settleRoom(pages, 80);
  }

  const missing = REQUIRED_ACTIONS.filter((name) => !report.actionCoverage[name].reached);
  if (missing.length) {
    const active = await findActiveSeat(pages);
    for (const name of missing) report.actionCoverage[name].attempts.push({
      result: 'seed-82-route-did-not-reach-action',
      roles,
      state: active >= 0 ? await diagnostic(pages[active]) : null,
    });
  }
}

async function verifySoloSurface(device, tv) {
  await settleRoom([device], 100);
  await captureDeviceMatrix(device, 'solo device');
  await capture(tv, 'solo tv');
  await verifyTvSurface(tv, 'solo TV', 1, true);
  await auditPage(tv, 'solo tv', '[data-testid="seti-tv-root"]');
  const soloHud = await tv.$('[data-testid="seti-tv-solo"], .seti-tv-solo');
  recordCheck('solo TV exposes rival HUD', Boolean(soloHud));

  await switchLayer(device, 'personal');
  const chipEnabled = await enabled(device, '[data-testid="seti-solo-rival"]');
  recordCheck('solo rival chip is an enabled visual target', chipEnabled);
  if (chipEnabled) {
    await clickEnabled(device, '[data-testid="seti-solo-rival"]');
    try {
      await device.waitForSelector('[data-testid="seti-solo-panel"]', { visible: true, timeout: 5_000 });
      await capture(device, 'solo rival panel');
      await auditPage(device, 'solo rival panel', '[data-testid="seti-device-root"]');
      await device.click('.seti-solo-panel .seti-close').catch(() => {});
    } catch {
      recordCheck('solo rival chip opens rival panel', false, await diagnostic(device));
    }
  }
}

let browser;
let fatalError;
const allPages = [];
try {
  const multiplayer = await setupRoom('multiplayer', 4, 3, 82);
  const solo = await setupRoom('solo', 1, 3);

  browser = await puppeteer.launch({
    // Full Chrome's current headless renderer is materially more stable than
    // chrome-headless-shell with five simultaneous animated SETI surfaces.
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion,BackForwardCache,MemorySaverMode',
    ],
  });

  const multiplayerDevices = [];
  for (let seat = 0; seat < multiplayer.seats; seat++) {
    const page = await openDevice(browser, multiplayer, seat);
    multiplayerDevices.push(page);
    allPages.push({ page, label: `multiplayer device ${seat + 1}`, root: '[data-testid="seti-device-root"]' });
  }
  const multiplayerTv = await openTv(browser, multiplayer);
  allPages.push({ page: multiplayerTv, label: 'multiplayer TV', root: '[data-testid="seti-tv-root"]' });

  await resolveSeed82Setup(multiplayerDevices);
  await capture(multiplayerTv, 'multiplayer tv setup');
  await verifyTvSurface(multiplayerTv, 'multiplayer TV', multiplayer.seats, false);
  await auditPage(multiplayerTv, 'multiplayer TV setup', '[data-testid="seti-tv-root"]');
  await captureDeviceMatrix(multiplayerDevices[0], 'multiplayer device');
  await inspectCardCloseup(multiplayerDevices[0], 'multiplayer device');
  await playCoverageScenario(multiplayerDevices, multiplayerTv);

  const soloDevice = await openDevice(browser, solo, 0);
  const soloTv = await openTv(browser, solo);
  allPages.push(
    { page: soloDevice, label: 'solo device', root: '[data-testid="seti-device-root"]' },
    { page: soloTv, label: 'solo TV', root: '[data-testid="seti-tv-root"]' },
  );
  await verifySoloSurface(soloDevice, soloTv);

  for (const item of allPages) await auditPage(item.page, `${item.label} final`, item.root);
  recordCheck('no console, page, request, or HTTP errors', report.browserErrors.length === 0, report.browserErrors);

  const missing = REQUIRED_ACTIONS.filter((name) => !report.actionCoverage[name].reached);
  recordCheck(
    'all requested live action paths reached',
    missing.length === 0,
    missing.length ? { missing, coverage: report.actionCoverage } : undefined,
  );
} catch (error) {
  fatalError = error;
  recordFailure(`fatal gate error: ${error.stack ?? error.message}`);
  for (const item of allPages) {
    await capture(item.page, `${item.label} fatal diagnostic`).catch(() => {});
  }
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = !fatalError && report.failures.length === 0;
  const reportPath = path.join(outDir, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (browser) await browser.close();
  console.log(`SETI visual report: ${reportPath}`);
}

if (!report.passed) {
  const missing = REQUIRED_ACTIONS.filter((name) => !report.actionCoverage[name].reached);
  const suffix = missing.length ? ` Missing action coverage: ${missing.join(', ')}.` : '';
  throw new Error(`SETI visual/action ship gate failed with ${report.failures.length} issue(s).${suffix} See ${path.join(outDir, 'report.json')}`);
}

console.log(`SETI VISUAL/ACTION SMOKE PASS - ${report.screenshots.length} screenshots, all requested paths covered`);
