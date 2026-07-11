// Four-player A Feast for Odin UI ship gate.
//
// WebSocket is used only to create the room, claim four human seats, and
// start the game. After setup, every game action is performed through the
// rendered Feast device UI. The verifier also exercises the shared-table
// controls and the visual teaching/reference surfaces.
//
// Run: node tools/verify/feast-ui-four-player.mjs [baseUrl] [wsUrl]

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const WS_URL = process.argv[3] ?? BASE.replace(/^http/, 'ws') + '/ws';
const OUT = fileURLToPath(new URL('../../tmp/feast-ui-4p/', import.meta.url));
const SEATS = 4;
const HARD_MS = 30 * 60_000;
const STALL_MS = 75_000;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

function wsOnce(setup, predicate, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let settled = false;
    const timer = setTimeout(() => finish(new Error('WebSocket setup wait timed out')), timeout);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      error ? reject(error) : resolve(value);
    }

    ws.once('open', () => {
      try { setup(ws); } catch (error) { finish(error); }
    });
    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(String(raw));
        if (message.type === 'error') return finish(new Error(message.message));
        const value = predicate(message, ws);
        if (value !== undefined) finish(null, value);
      } catch (error) {
        finish(error);
      }
    });
    ws.once('error', (error) => finish(error));
  });
}

async function setupFourHumanRoom() {
  const roomId = await wsOnce(
    (ws) => ws.send(JSON.stringify({
      type: 'create_room',
      name: 'Feast four-player UI ship gate',
      game: 'feast',
      options: { length: 'short', occupationMode: 'A', soloStartingOccupation: 'random' },
    })),
    (message) => message.type === 'room_created' ? message.roomId : undefined,
  );

  const tokens = [];
  const names = ['Astrid', 'Bjorn', 'Freydis', 'Leif'];
  for (let seat = 0; seat < SEATS; seat++) {
    const joined = await wsOnce(
      (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: names[seat] })),
      (message) => message.type === 'joined'
        ? { token: message.playerToken, playerIndex: message.playerIndex }
        : undefined,
    );
    check(joined.playerIndex === seat, `${names[seat]} claimed human seat ${seat + 1}`);
    tokens.push(joined.token);
  }

  const view = await wsOnce(
    (ws) => ws.send(JSON.stringify({ type: 'join', roomId, name: names[0], playerToken: tokens[0] })),
    (message, ws) => {
      if (message.type === 'joined') {
        ws.send(JSON.stringify({ type: 'start' }));
        return undefined;
      }
      return message.type === 'state' && message.view?.game === 'feast' ? message.view : undefined;
    },
  );

  check(view.players.length === SEATS, 'started room exposes exactly four seats');
  check(view.players.map((player) => player.name).join('|') === names.join('|'), 'all four seats remain human-owned with no CPU fill');
  check(view.rounds === 6 && view.options?.length === 'short', 'room uses the complete six-round short game');
  check(Array.isArray(view.imitationColumns) && view.imitationColumns.length === 2, 'four-player imitation extensions are enabled');
  return { roomId, tokens, names };
}

function watchErrors(page, label) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    errors.push(`${label} request: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${label} HTTP ${response.status()}: ${response.url()}`);
  });
  return errors;
}

function capture(page, file) {
  return page.screenshot({
    path: path.join(OUT, file),
    captureBeyondViewport: false,
    fromSurface: true,
    optimizeForSpeed: true,
  });
}

async function clickExact(page, label, required = true) {
  const clicked = await page.evaluate((wanted) => {
    const normalize = (value) => (value ?? '').trim().replace(/\s+/g, ' ');
    const button = [...document.querySelectorAll('button')]
      .find((entry) => normalize(entry.textContent) === wanted && !entry.disabled && entry.offsetParent !== null);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  if (required) check(clicked, `clicked ${label}`);
  return clicked;
}

async function clickContaining(page, label) {
  const clicked = await page.evaluate((wanted) => {
    const normalize = (value) => (value ?? '').trim().replace(/\s+/g, ' ');
    const button = [...document.querySelectorAll('button')]
      .find((entry) => normalize(entry.textContent).includes(wanted) && !entry.disabled && entry.offsetParent !== null);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  check(clicked, `clicked control containing ${label}`);
}

async function assertNoPageScroll(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerHeight,
    document: document.documentElement.scrollHeight,
    body: document.body.scrollHeight,
    x: document.documentElement.scrollWidth,
    viewportX: innerWidth,
  }));
  check(
    dimensions.document <= dimensions.viewport + 1
      && dimensions.body <= dimensions.viewport + 1
      && dimensions.x <= dimensions.viewportX + 1,
    `${label} has no page-level scroll at ${dimensions.viewportX}x${dimensions.viewport}`,
  );
}

async function exerciseLessonsAndReferences(page) {
  await clickExact(page, 'VISUAL LESSONS');
  await page.waitForSelector('[data-testid="feast-lessons"]');
  const lessonCount = await page.$$eval('[data-testid="feast-lessons"] aside button', (buttons) => buttons.length);
  check(lessonCount >= 15, `visual lesson library exposes all major chapters (${lessonCount} lessons)`);
  await clickContaining(page, 'LEGAL GOODS PLACEMENT');
  await page.waitForFunction(() => document.querySelector('.ft-lessons main h3')?.textContent?.includes('LEGAL GOODS PLACEMENT'));
  await assertNoPageScroll(page, 'visual lessons overlay');
  await capture(page, '01-lessons-placement.png');
  await clickExact(page, 'SHOW THIS ON THE LIVE TABLE');
  await page.waitForSelector('[data-testid="feast-tutorial"]');
  await page.waitForSelector('.ft-tour-ring', { timeout: 5_000 });
  const tourState = await page.evaluate(() => ({
    title: document.querySelector('.ft-tour-card h2')?.textContent ?? '',
    hasRing: !!document.querySelector('.ft-tour-ring'),
    progress: document.querySelector('.ft-tour-meta b')?.textContent ?? '',
  }));
  check(/THE PUZZLE IS YOUR ECONOMY/i.test(tourState.title), 'placement lesson launches its matching live-table tutorial step');
  check(tourState.hasRing, 'live tutorial visually highlights a rendered table control');
  check(/\d+\s*\/\s*\d+/.test(tourState.progress), 'live tutorial exposes step progress');
  await assertNoPageScroll(page, 'live tutorial overlay');
  await capture(page, '02-live-tour-placement.png');
  await clickExact(page, 'NEXT');
  await delay(150);
  await clickExact(page, 'SKIP TOUR');

  // Walk the complete live tutorial from its first step. Every step with a
  // declared live selector must produce a visible, non-zero spotlight after
  // any requested mode transition settles. Goal is the one overview card
  // without a selector.
  await clickExact(page, 'LIVE TOUR');
  await page.waitForSelector('[data-testid="feast-tutorial"]');
  const tourTitles = new Set();
  for (let step = 1; step <= 20; step++) {
    await page.waitForFunction((expected) => {
      const progress = document.querySelector('.ft-tour-meta b')?.textContent ?? '';
      return progress.replace(/\s+/g, '') === `${expected}/20`;
    }, {}, step);
    await delay(180);
    const state = await page.evaluate(() => {
      const title = document.querySelector('.ft-tour-card h2')?.textContent?.trim() ?? '';
      const ring = document.querySelector('.ft-tour-ring')?.getBoundingClientRect();
      return {
        title,
        ring: ring ? { x: ring.x, y: ring.y, width: ring.width, height: ring.height } : null,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    tourTitles.add(state.title);
    check(state.title.length > 4, `tutorial step ${step}/20 has instructional copy`);
    if (step !== 1) {
      check(!!state.ring
        && state.ring.width > 10 && state.ring.height > 10
        && state.ring.x < state.viewport.width && state.ring.y < state.viewport.height
        && state.ring.x + state.ring.width > 0 && state.ring.y + state.ring.height > 0,
      `tutorial step ${step}/20 spotlights a visible live control`);
    }
    await assertNoPageScroll(page, `tutorial step ${step}/20`);
    if ([1, 8, 15, 20].includes(step)) {
      await capture(page, `02-tour-step-${String(step).padStart(2, '0')}.png`);
    }
    await clickExact(page, step === 20 ? 'DONE' : 'NEXT');
  }
  check(tourTitles.size === 20, 'all 20 live tutorial steps expose distinct guidance');

  await clickContaining(page, 'CARDS');
  await page.waitForSelector('.ft-cards-layout');
  const privateCards = await page.$$eval('.ft-card-section:first-child .ft-card', (cards) => cards.length);
  check(privateCards >= 1, 'private starting occupation is rendered as an authentic card control');
  await page.click('.ft-card-section:first-child .ft-card');
  await page.waitForSelector('[data-testid="feast-card-dialog"]');
  const clarification = await page.$eval('.ft-card-dialog-copy p', (entry) => entry.textContent?.trim() ?? '');
  check(clarification.length > 30, 'occupation dialog shows its official appendix clarification');
  await assertNoPageScroll(page, 'occupation detail overlay');
  await capture(page, '03-occupation-detail.png');
  await clickExact(page, 'CLOSE');

  await clickExact(page, 'SHOW ALL OCCUPATIONS');
  await page.waitForSelector('.ft-catalog-grid');
  const occupationCount = await page.$$eval('.ft-catalog-grid .ft-card', (cards) => cards.length);
  check(occupationCount === 190, 'complete 190-card occupation catalog is rendered');
  await assertNoPageScroll(page, 'occupation catalog overlay');
  await capture(page, '04-all-occupations.png');
  await clickExact(page, 'CLOSE');

  await clickExact(page, 'SHOW WEAPONS');
  await page.waitForSelector('.ft-weapon-catalog img');
  await page.waitForFunction(() => {
    const image = document.querySelector('.ft-weapon-catalog img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  const weaponCopy = await page.$eval('.ft-weapon-catalog', (entry) => entry.textContent ?? '');
  check(/47-CARD DRAW DECK/.test(weaponCopy) && /12 bows/i.test(weaponCopy) && /11 long swords/i.test(weaponCopy), 'weapon catalog explains the exact physical deck composition');
  await assertNoPageScroll(page, 'weapon catalog overlay');
  await capture(page, '05-weapon-catalog.png');
  await clickExact(page, 'CLOSE');
  await clickContaining(page, 'HOME');
}

async function exerciseTvEstateSelector(tv, names) {
  const buttons = await tv.$$('[data-testid="feast-tv-scoreboard"] button');
  check(buttons.length === SEATS, 'TV scoreboard renders four selectable player estates');
  const target = await tv.evaluate(() => {
    const entries = [...document.querySelectorAll('[data-testid="feast-tv-scoreboard"] button')];
    const button = entries.find((entry) => !entry.classList.contains('selected')) ?? entries[1];
    if (!button) return null;
    const label = button.getAttribute('aria-label') ?? '';
    button.click();
    return label.replace(/^Show\s+/, '').replace(/\s+public estate$/, '');
  });
  check(target && names.includes(target), 'TV selector targets another human player');
  await tv.waitForFunction((name) => document.querySelector('.ft-tv-estate h3')?.textContent?.includes(name.toUpperCase()), {}, target);
  check(await tv.$eval('.ft-tv-estate h3', (heading) => /PUBLIC ESTATE/.test(heading.textContent ?? '')), 'TV switches the public-estate inspector without exposing private cards');
  await capture(tv, '06-tv-public-estate.png');
  await clickExact(tv, 'VIEW AUTHENTIC BOARD LAYOUTS');
  await tv.waitForSelector('.ft-public-board-gallery');
  await tv.waitForFunction(() => {
    const cards = document.querySelectorAll('.ft-public-board-card');
    const images = [...document.querySelectorAll('.ft-public-board-face')];
    return cards.length > 0 && images.length === cards.length && images.every((image) =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);
  }, { timeout: 20_000 });
  const gallery = await tv.evaluate(() => ({
    cards: document.querySelectorAll('.ft-public-board-card').length,
    loaded: [...document.querySelectorAll('.ft-public-board-face')].every((image) =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
    title: document.querySelector('.ft-public-board-gallery h2')?.textContent ?? '',
  }));
  check(gallery.cards >= 1 && gallery.loaded, 'TV exposes every selected player board with authentic loaded art');
  check(gallery.title.includes(target.toUpperCase()), 'public board gallery remains scoped to the selected player');
  await assertNoPageScroll(tv, 'public board gallery');
  await capture(tv, '06-tv-public-boards.png');
  await clickExact(tv, 'CLOSE');
}

async function actingPageIndex(pages) {
  for (let index = 0; index < pages.length; index++) {
    const active = await pages[index].evaluate(() => !!document.querySelector('.ft-status.you'));
    if (active) return index;
  }
  return -1;
}

async function waitForActingPage(pages, excluded = -1, timeout = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const actor = await actingPageIndex(pages);
    if (actor >= 0 && actor !== excluded) return actor;
    await delay(80);
  }
  throw new Error('FAIL: next human actor did not render on any authenticated device');
}

async function selectActionSpace(page, title) {
  await clickContaining(page, 'ACTION BOARD');
  await page.waitForSelector('[data-testid="feast-action-board"]');
  const found = await page.evaluate((wanted) => {
    const hotspot = [...document.querySelectorAll('.ft-action-hotspot')]
      .find((entry) => (entry.getAttribute('title') ?? '').startsWith(wanted));
    if (!hotspot) return false;
    hotspot.click();
    return true;
  }, title);
  check(found, `selected authentic action-board space ${title}`);
  await page.waitForFunction((wanted) => document.querySelector('.ft-action-detail h2')?.textContent === wanted, {}, title);
}

async function placeDirectWorkers(page, workers) {
  const clicked = await page.evaluate((amount) => {
    const button = [...document.querySelectorAll('button.ft-place-workers')]
      .find((entry) => new RegExp(`^PLACE ${amount} VIKING`).test((entry.textContent ?? '').trim()) && !entry.disabled);
    if (!button) return false;
    button.click();
    return true;
  }, workers);
  check(clicked, `placed ${workers} Vikings through the printed-space control`);
}

async function exerciseFourPlayerImitation(pages, tv) {
  const columns = await tv.$$eval('.ft-tv-extensions img', (images) => images.flatMap((image) => {
    const match = image.getAttribute('alt')?.match(/Column\s+(\d+)/i);
    return match ? [Number(match[1])] : [];
  }));
  const column = [...new Set(columns)].find((entry) => entry === 1 || entry === 2);
  check(column === 1 || column === 2, 'TV renders an authentic low-column imitation extension');
  const target = column === 1 ? 'Beans and Silver' : 'Flax, Stockfish, and Silver';

  let actor = await actingPageIndex(pages);
  check(actor >= 0, 'found the opening human actor from rendered device state');
  await selectActionSpace(pages[actor], target);
  await pages[actor].waitForFunction(() => {
    const image = document.querySelector('.ft-imitation-note img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, { timeout: 20_000 });
  const directArt = await pages[actor].evaluate(() => {
    const image = document.querySelector('.ft-imitation-note img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  check(directArt, 'device action detail shows the authentic four-player extension tile');
  await placeDirectWorkers(pages[actor], column);
  await pages[actor].waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'END TURN' && !button.disabled));
  await clickExact(pages[actor], 'END TURN');

  actor = await waitForActingPage(pages, actor);
  check(actor >= 0, 'next human actor receives the turn after direct placement');
  await selectActionSpace(pages[actor], target);
  await pages[actor].waitForFunction(() => {
    const image = document.querySelector('.ft-imitation-note img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, { timeout: 20_000 });
  const imitationReady = await pages[actor].evaluate(() => {
    const button = [...document.querySelectorAll('button.ft-place-workers')]
      .find((entry) => /^IMITATE THIS SPACE/.test((entry.textContent ?? '').trim()));
    const image = document.querySelector('.ft-imitation-note img');
    return {
      enabled: !!button && !button.disabled,
      authenticArt: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      note: document.querySelector('.ft-imitation-note')?.textContent ?? '',
    };
  });
  check(imitationReady.enabled, 'occupied opponent space enables the distinct imitation control');
  check(imitationReady.authenticArt && /FOUR-PLAYER EXTENSION/.test(imitationReady.note), 'imitation control remains attached to authentic extension art and rules copy');
  await capture(pages[actor], '07-imitation-ready-device.png');

  const imitated = await pages[actor].evaluate(() => {
    const button = [...document.querySelectorAll('button.ft-place-workers')]
      .find((entry) => /^IMITATE THIS SPACE/.test((entry.textContent ?? '').trim()) && !entry.disabled);
    if (!button) return false;
    button.click();
    return true;
  });
  check(imitated, 'performed a legal four-player imitation through the extension UI');
  await tv.waitForFunction(() => /Imitated/i.test(document.querySelector('.ft-tv-event')?.textContent ?? ''), { timeout: 15_000 });
  await capture(tv, '08-tv-imitation-occupied.png');
  return actor;
}

async function exerciseSagaLog(tv) {
  await clickExact(tv, 'SAGA LOG');
  await tv.waitForSelector('.ft-saga-log');
  const audit = await tv.evaluate(() => ({
    rows: document.querySelectorAll('.ft-saga-log li').length,
    text: document.querySelector('.ft-saga-log')?.textContent ?? '',
  }));
  check(audit.rows >= 3, `public saga log exposes a meaningful audit trail (${audit.rows} entries)`);
  check(/Imitated/i.test(audit.text), 'public saga log records the four-player imitation');
  await capture(tv, '09-tv-saga-log.png');
  await clickExact(tv, 'CLOSE');
}

async function exercisePlacementPreview(page) {
  await clickContaining(page, 'HOME');
  await page.waitForSelector('[data-testid="feast-home-board"]');
  const selected = await page.evaluate(() => {
    const normalize = (value) => (value ?? '').trim().replace(/\s+/g, ' ');
    const silver = [...document.querySelectorAll('.ft-good-button')]
      .find((button) => /SILVER/i.test(normalize(button.textContent)) && !button.disabled);
    if (!silver) return false;
    silver.click();
    return true;
  });
  check(selected, 'selected gained silver from the rendered goods inventory');

  const before = await page.$$eval('.ft-placement-layer .ft-placement:not(.ghost)', (placements) => placements.length);
  const cells = await page.$$eval('.ft-board-grid i:not(.outside)', (entries) => entries.map((entry) => {
    const rect = entry.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, visible: rect.width > 1 && rect.height > 1 };
  }));
  let valid = false;
  let dragged = false;
  for (const cell of cells.filter((entry) => entry.visible)) {
    dragged = await page.evaluate(({ x, y }) => {
      const source = document.querySelector('.ft-good-button.on');
      const board = document.querySelector('[data-testid="feast-home-board"]');
      if (!(source instanceof HTMLElement) || !(board instanceof HTMLElement)) return false;
      const transfer = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      board.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y }));
      board.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y }));
      return true;
    }, cell);
    await delay(45);
    valid = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find((entry) => entry.textContent?.trim() === 'CONFIRM PLACEMENT' && entry.offsetParent !== null);
      return !!document.querySelector('.ft-placement.ghost') && !!button && !button.disabled;
    });
    if (valid) break;
  }
  check(dragged, 'dispatched a real HTML drag/drop sequence from inventory to board');
  check(valid, 'board drop creates a legal, visibly rendered placement ghost');
  await assertNoPageScroll(page, 'placement preview');
  await capture(page, '10-placement-preview.png');
  await clickExact(page, 'CONFIRM PLACEMENT');
  await page.waitForFunction((count) => !document.querySelector('.ft-placement.ghost')
    && document.querySelectorAll('.ft-placement-layer .ft-placement:not(.ghost)').length > count, {}, before);
  check(!await page.$('.ft-toast'), 'confirmed placement was accepted without an engine error');
  await capture(page, '11-placement-committed.png');
}

// Perform one legal interaction using only rendered controls. This function is
// serialized into each browser page, so it deliberately has no outer-scope
// dependencies.
async function tickFeastDevice() {
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const text = (element) => (element?.textContent ?? '').trim().replace(/\s+/g, ' ');
  const enabled = (element) => !!element && !element.disabled && element.offsetParent !== null;
  const click = (element, result) => { if (!enabled(element)) return null; element.click(); return result; };
  const exact = (label, root = document) => all('button', root).find((button) => text(button) === label && enabled(button));
  const chooseAndConfirm = async (choice, result) => {
    if (!enabled(choice)) return null;
    choice.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const current = document.querySelector('[data-testid="feast-decision"]');
    const confirm = current ? exact('CONFIRM CHOICE', current) : null;
    if (confirm) {
      confirm.click();
      return `${result}+confirm`;
    }
    return result;
  };

  if (document.querySelector('[data-testid="feast-final-score"]')) return 'ENDED';
  const error = document.querySelector('.ft-toast[role="alert"]');
  if (error && !/not your action turn/i.test(text(error))) return `ERROR:${text(error)}`;

  const gotIt = exact('Got it');
  if (gotIt) return click(gotIt, 'intro');
  if (!document.querySelector('.ft-status.you')) return null;

  // Immediate/as-soon-as cards can open the bounded occupation resolver.
  const resolver = document.querySelector('.ft-operation-resolver');
  if (resolver) {
    const change = resolver.querySelector('select');
    const operations = resolver.querySelectorAll('.ft-operation-list button');
    if (change && change.value !== 'acknowledge') {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(change, 'acknowledge');
      change.dispatchEvent(new Event('change', { bubbles: true }));
      return 'occupation-acknowledgement-mode';
    }
    if (!operations.length) return click(exact('ADD CHANGE', resolver), 'occupation-add-acknowledgement');
    const apply = exact('APPLY AND RECORD', resolver);
    if (apply) return click(apply, 'occupation-apply');
    return null;
  }

  const final = exact('LOCK BOARDS AND SCORE');
  if (final) return click(final, 'final-score-confirm');

  const decision = document.querySelector('[data-testid="feast-decision"]');
  if (decision) {
    const roll = exact('ROLL', decision);
    if (roll) return click(roll, 'decision-roll');

    // The fourth-column bonus is optional in intent but has a required timing
    // choice. Choosing its explicit skip keeps the verifier deterministic.
    const declineTiming = all('.ft-choice:not(:disabled)', decision)
      .find((button) => /DO NOT PLAY A CARD/i.test(text(button)) && !button.classList.contains('on'));
    if (declineTiming) return chooseAndConfirm(declineTiming, 'decision-skip-fourth-column-card');

    const confirm = exact('CONFIRM CHOICE', decision);
    if (confirm) return click(confirm, 'decision-confirm');

    const plus = all('.ft-allocation button', decision)
      .find((button) => text(button) === '+' && enabled(button));
    if (plus) return click(plus, 'decision-allocation-plus');

    const availableChoices = all('.ft-choice:not(:disabled), .ft-decision-card:not(:disabled)', decision)
      .filter((button) => enabled(button) && !button.classList.contains('on'));
    const choice = (decision.textContent?.includes('DIE')
      ? availableChoices.find((button) => /DECLARE FAILURE/i.test(text(button)))
      : null) ?? availableChoices[0];
    if (choice) return chooseAndConfirm(choice, `decision:${text(choice).slice(0, 42)}`);

    const skip = exact('SKIP OPTIONAL EFFECT', decision);
    if (skip) return click(skip, 'decision-skip-optional');
    return null;
  }

  // Finishing immediately is always a legal Feast choice; open cells become
  // printed Thing penalties. It avoids inventing a strategy in a parity gate.
  const finish = exact('FINISH FEAST');
  if (finish) return click(finish, 'finish-feast');

  const end = exact('END TURN');
  if (end) return click(end, 'end-turn');

  const actionTab = all('.ft-mode-tabs button').find((button) => text(button).startsWith('ACTION BOARD'));
  if (actionTab && !actionTab.classList.contains('on')) return click(actionTab, 'open-action-board');

  const hotspots = all('.ft-action-hotspot:not(.disabled)').filter(enabled);
  const priorities = [
    'Spices and Livestock Produce',
    'Fruit, Oil, Salt Meat, and Silver',
    'Produce Wool',
    'Flax, Stockfish, and Silver',
    'Mead and Silver',
    'Beans and Silver',
    'Wood per Player and 1 Ore',
    'Take up to 2 Mountain Items',
    'Take 1 Stockfish',
  ];
  const preferred = priorities.map((name) => hotspots.find((button) => (button.getAttribute('title') ?? '') === name)).find(Boolean);
  const byWorkers = [...hotspots].sort((left, right) => {
    const amount = (entry) => Number(entry.getAttribute('aria-label')?.match(/,\s*(\d+)\s+Viking/i)?.[1] ?? 0);
    return amount(right) - amount(left);
  });
  const wanted = preferred ?? byWorkers[0];
  const selected = document.querySelector('.ft-action-hotspot.selected');
  if (wanted && selected !== wanted) return click(wanted, `select-action:${(wanted.getAttribute('title') ?? '').slice(0, 42)}`);

  const place = all('button.ft-place-workers').find((button) => /^PLACE\s+\d+\s+VIKING/.test(text(button)) && enabled(button));
  if (place) return click(place, `place-workers:${text(place)}`);

  const pass = exact('PASS FOR ROUND');
  if (pass) return click(pass, 'pass');
  return null;
}

async function visibleState(page) {
  return page.evaluate(() => ({
    status: document.querySelector('.ft-status')?.textContent?.trim().replace(/\s+/g, ' ') ?? '',
    mode: document.querySelector('.ft-mode-tabs button.on')?.textContent?.trim().replace(/\s+/g, ' ') ?? '',
    pending: document.querySelector('[data-testid="feast-decision"] h2')?.textContent ?? null,
    toast: document.querySelector('.ft-toast')?.textContent ?? null,
    buttons: [...document.querySelectorAll('button')]
      .filter((button) => button.offsetParent !== null)
      .map((button) => `${button.disabled ? '[disabled] ' : ''}${button.textContent?.trim().replace(/\s+/g, ' ').slice(0, 68)}`)
      .slice(0, 90),
  }));
}

await mkdir(OUT, { recursive: true });
const { roomId, tokens, names } = await setupFourHumanRoom();
console.log(`room - ${roomId}`);

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--disable-webgl',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});

const contexts = [];
const pages = [];
const errorBuckets = [];
let tv;

try {
  for (let seat = 0; seat < SEATS; seat++) {
    const context = await browser.createBrowserContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
    errorBuckets.push(watchErrors(page, `seat-${seat + 1}`));
    await page.evaluateOnNewDocument(({ key, value }) => localStorage.setItem(key, value), {
      key: `bge-token-${roomId.toUpperCase()}`,
      value: tokens[seat],
    });
    pages.push(page);
  }

  const tvContext = await browser.createBrowserContext();
  contexts.push(tvContext);
  tv = await tvContext.newPage();
  await tv.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  errorBuckets.push(watchErrors(tv, 'tv'));

  await Promise.all([
    ...pages.map((page) => page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })),
    tv.goto(`${BASE}/board/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 90_000 }),
  ]);
  await Promise.all([
    ...pages.map((page) => page.waitForSelector('[data-testid="feast-device"]', { timeout: 90_000 })),
    tv.waitForSelector('[data-testid="feast-tv"]', { timeout: 90_000 }),
  ]);

  for (const page of pages) await clickExact(page, 'Got it', false);
  await Promise.all(pages.map((page) => page.waitForSelector('.ft-mode-tabs')));

  const authenticatedSeatColors = [];
  for (let seat = 0; seat < SEATS; seat++) {
    const identity = await pages[seat].evaluate(() => ({
      seatColor: getComputedStyle(document.querySelector('[data-testid="feast-device"]')).getPropertyValue('--ft-seat').trim(),
      privateCards: document.querySelector('.ft-mode-tabs button:last-child span')?.textContent ?? '',
    }));
    check(/^\d+$/.test(identity.privateCards.trim()) && Number(identity.privateCards) >= 1, `seat ${seat + 1} loaded a private occupation count`);
    check(/^#[0-9a-f]{6}$/i.test(identity.seatColor), `seat ${seat + 1} loaded an authenticated colored device view`);
    authenticatedSeatColors.push(identity.seatColor.toLowerCase());
  }
  check(new Set(authenticatedSeatColors).size === SEATS, 'four isolated browser contexts authenticate as four distinct seats');

  await Promise.all([
    ...pages.map((page, index) => assertNoPageScroll(page, `seat ${index + 1}`)),
    assertNoPageScroll(tv, 'TV'),
  ]);
  await capture(pages[0], '00-device-start.png');
  await exerciseLessonsAndReferences(pages[0]);
  await exerciseTvEstateSelector(tv, names);

  const imitationActor = await exerciseFourPlayerImitation(pages, tv);
  await exerciseSagaLog(tv);
  await exercisePlacementPreview(pages[imitationActor]);
  await clickExact(pages[imitationActor], 'END TURN');
  await pages[imitationActor].waitForFunction(() => !document.querySelector('.ft-status.you'), { timeout: 20_000 });
  check(await waitForActingPage(pages, imitationActor, 20_000) >= 0, 'rendered turn ownership settled before full-game automation');

  let actions = 0;
  let lastProgress = Date.now();
  let lastMarker = '';
  let lastScrollAudit = 0;
  const startedAt = Date.now();
  let ended = false;

  while (Date.now() - startedAt < HARD_MS) {
    for (let seat = 0; seat < SEATS; seat++) {
      let result = null;
      try { result = await pages[seat].evaluate(tickFeastDevice); } catch { /* React may replace a control during this tick. */ }
      if (result === 'ENDED') { ended = true; break; }
      if (result?.startsWith('ERROR:')) throw new Error(`FAIL: seat ${seat + 1} rendered an engine error: ${result.slice(6)}`);
      if (result) {
        actions++;
        if (actions % 40 === 0) console.log(`progress - ${actions} UI interactions; seat ${seat + 1}: ${result}`);
        if (result === 'end-turn' || result === 'pass') {
          await delay(180);
          break;
        }
      }
    }
    if (ended) break;

    const marker = (await Promise.all(pages.map((page) => page.evaluate(() => JSON.stringify({
      status: document.querySelector('.ft-status')?.textContent ?? '',
      decision: document.querySelector('[data-testid="feast-decision"]')?.textContent ?? '',
      selectedAction: document.querySelector('.ft-action-hotspot.selected')?.getAttribute('title') ?? '',
      feastCovered: document.querySelectorAll('.ft-banquet-table > i.covered').length,
      final: !!document.querySelector('[data-testid="feast-final-score"]'),
    })).catch(() => '')))).join('|');
    if (marker !== lastMarker) {
      lastMarker = marker;
      lastProgress = Date.now();
    }

    const browserErrors = errorBuckets.flat();
    if (browserErrors.length) throw new Error(`FAIL: browser errors detected during play:\n${browserErrors.join('\n')}`);
    if (actions >= lastScrollAudit + 80) {
      lastScrollAudit = actions;
      await Promise.all([
        ...pages.map((page, index) => assertNoPageScroll(page, `seat ${index + 1} during play`)),
        assertNoPageScroll(tv, 'TV during play'),
      ]);
    }
    if (Date.now() - lastProgress > STALL_MS) {
      const states = await Promise.all(pages.map(visibleState));
      throw new Error(`FAIL: four-player Feast UI stalled for ${Math.round(STALL_MS / 1000)}s\n${states.map((state, seat) => `SEAT ${seat + 1}:\n${JSON.stringify(state, null, 2)}`).join('\n')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 130));
  }

  check(ended, `complete four-player game reached final scoring within ${Math.round(HARD_MS / 60_000)} minutes`);
  await Promise.all(pages.map((page) => page.waitForSelector('[data-testid="feast-final-score"]', { timeout: 20_000 })));
  await tv.bringToFront();
  const finalLogOpened = await tv.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'SAGA LOG');
    button?.click();
    return !!button;
  });
  check(finalLogOpened, 'opened the final public TV Saga Log');
  await tv.waitForSelector('.ft-saga-log');
  const finalSagaEntry = await tv.$eval('.ft-saga-log li:first-child', (entry) => entry.textContent?.trim() ?? '');
  check(/^Game over\b.*\bwins\b/i.test(finalSagaEntry), 'public TV audit trail received the authoritative multiplayer winner event');
  check(actions > 180, `complete game exercised a substantial multi-device path (${actions} rendered UI interactions after feature checks)`);

  await Promise.all([
    ...pages.map((page, index) => capture(page, `12-final-seat-${index + 1}.png`)),
    capture(tv, '13-final-tv.png'),
  ]);
  await Promise.all([
    ...pages.map((page, index) => assertNoPageScroll(page, `final seat ${index + 1}`)),
    assertNoPageScroll(tv, 'final TV'),
  ]);

  const browserErrors = errorBuckets.flat();
  check(browserErrors.length === 0, browserErrors.length
    ? `browser, console, asset, or request errors:\n${browserErrors.join('\n')}`
    : 'no browser, console, asset, or request errors across five pages');
  console.log(`PASS - four-human Feast UI completed room ${roomId}; screenshots in ${OUT}`);
} catch (error) {
  await Promise.all([
    ...pages.map((page, index) => capture(page, `failure-seat-${index + 1}.png`).catch(() => undefined)),
    tv ? capture(tv, 'failure-tv.png').catch(() => undefined) : undefined,
  ]);
  throw error;
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  await browser.close();
}
