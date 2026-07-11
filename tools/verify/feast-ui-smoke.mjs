// A Feast for Odin ship gate: creates a real short solo room, exercises the
// visual lessons/live coach marks, then plays the complete game by clicking
// only the rendered device UI. WebSocket is used only for room creation/start.
//
// Run: node tools/verify/feast-ui-smoke.mjs [baseUrl] [wsUrl]

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const WS_URL = process.argv[3] ?? BASE.replace(/^http/, 'ws') + '/ws';
const OUT = fileURLToPath(new URL('../../tmp/feast-ui/', import.meta.url));
const HARD_MS = 12 * 60_000;
const STALL_MS = 45_000;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitFor(ws, predicate, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('WebSocket wait timed out')), timeout);
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'error') return done(new Error(message.message));
      const value = predicate(message);
      if (value !== undefined) done(null, value);
    };
    const onError = (error) => done(error);
    function done(error, value) {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      error ? reject(error) : resolve(value);
    }
    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

async function createSoloRoom() {
  const ws = await connect();
  ws.send(JSON.stringify({
    type: 'create_room', name: 'Feast UI ship gate', game: 'feast',
    options: { length: 'short', occupationMode: 'A', soloStartingOccupation: 'random' },
  }));
  const roomId = await waitFor(ws, (message) => message.type === 'room_created' ? message.roomId : undefined);
  ws.send(JSON.stringify({ type: 'join', roomId, name: 'UI Viking' }));
  const token = await waitFor(ws, (message) => message.type === 'joined' ? message.playerToken : undefined);
  const started = waitFor(ws, (message) => message.type === 'state' && message.view?.game === 'feast' ? message.view : undefined);
  ws.send(JSON.stringify({ type: 'start' }));
  const view = await started;
  check(view.players.length === 1, 'solo room has exactly one player and no CPU opponent');
  check(view.rounds === 6, 'short game exposes six rounds');
  ws.close();
  return { roomId, token };
}

function watchErrors(page, name) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${name} pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${name} console: ${message.text()}`); });
  page.on('requestfailed', (request) => errors.push(`${name} request: ${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${name} HTTP ${response.status()}: ${response.url()}`); });
  return errors;
}

function capture(page, file) {
  // Viewport-only capture avoids Chromium compositor stalls on large textured
  // board surfaces while preserving the exact responsive acceptance frame.
  return page.screenshot({ path: path.join(OUT, file), captureBeyondViewport: false, fromSurface: true, optimizeForSpeed: true });
}

async function clickText(page, wanted) {
  const clicked = await page.evaluate((label) => {
    const normalize = (value) => (value ?? '').trim().replace(/\s+/g, ' ');
    const button = [...document.querySelectorAll('button')].find((entry) => normalize(entry.textContent) === label && !entry.disabled);
    if (!button) return false;
    button.click();
    return true;
  }, wanted);
  check(clicked, `clicked ${wanted}`);
}

// One legal interaction performed entirely through the Feast React DOM.
async function tickFeastDevice() {
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const text = (element) => (element?.textContent ?? '').trim().replace(/\s+/g, ' ');
  const click = (element, result) => { if (!element) return null; element.click(); return result; };

  if (document.querySelector('[data-testid="feast-final-score"]')) return 'ENDED';
  const gotIt = all('button').find((button) => text(button) === 'Got it' && !button.disabled);
  if (gotIt) return click(gotIt, 'intro');

  const final = all('button').find((button) => text(button) === 'LOCK BOARDS AND SCORE' && !button.disabled);
  if (final) return click(final, 'final-score-confirm');

  const decision = document.querySelector('[data-testid="feast-decision"]');
  if (decision) {
    const confirm = all('button', decision).find((button) => text(button) === 'CONFIRM CHOICE' && !button.disabled);
    if (confirm) return click(confirm, 'decision-confirm');
    const skip = all('button', decision).find((button) => text(button) === 'SKIP OPTIONAL EFFECT' && !button.disabled);
    if (skip) return click(skip, 'decision-skip');
    const availableChoices = all('.ft-choice:not(:disabled), .ft-decision-card:not(:disabled)', decision)
      .filter((button) => !button.classList.contains('on'));
    const choice = (decision.textContent?.includes('DIE')
      ? availableChoices.find((button) => /DECLARE FAILURE/i.test(text(button)))
      : null) ?? availableChoices[0];
    if (choice) {
      const label = `decision:${text(choice).slice(0, 30)}`;
      choice.click();
      // React owns the local selection. Confirm in the same rendered cycle so
      // a concurrent room-state broadcast cannot clear it between two ticks.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const ready = all('button', document.querySelector('[data-testid="feast-decision"]') ?? decision)
        .find((button) => text(button) === 'CONFIRM CHOICE' && !button.disabled);
      if (ready) {
        ready.click();
        return `${label}+confirm`;
      }
      return label;
    }
    const plus = all('.ft-allocation button:not(:disabled)', decision).find((button) => text(button) === '+');
    if (plus) return click(plus, 'allocation-plus');
    return null;
  }

  const banquet = document.querySelector('[data-testid="feast-banquet-table"]');
  if (banquet) {
    // Finishing a Feast is always a complete, legal path. Prefer it over
    // blindly retrying a placement cell after a resource has been exhausted;
    // the shared reducer suite and four-player browser gate exercise the
    // puzzle interaction directly.
    const finish = all('button').find((button) => text(button) === 'FINISH FEAST' && !button.disabled);
    if (finish) return click(finish, 'finish-feast');
    const selected = document.querySelector('.ft-good-button.on');
    const silver = all('.ft-good-button').find((button) => /SILVER/i.test(text(button)) && !button.disabled);
    if (silver && (!selected || !/SILVER/i.test(text(selected)))) return click(silver, 'select-silver');
    if (silver) {
      const cells = all('.ft-banquet-table > i').slice(36);
      const open = cells.find((cell) => !cell.classList.contains('closed') && !cell.classList.contains('ship') && !cell.classList.contains('covered'));
      if (open) return click(open, 'place-feast-silver');
    }
    return null;
  }

  const end = all('button').find((button) => text(button) === 'END TURN' && !button.disabled);
  if (end) return click(end, 'end-turn');

  const actionTab = all('.ft-mode-tabs button').find((button) => text(button).startsWith('ACTION BOARD'));
  if (actionTab && !actionTab.classList.contains('on')) return click(actionTab, 'open-action-board');

  const priorities = [
    'Beans and Silver', 'Flax, Stockfish, and Silver', 'Fruit, Oil, Salt Meat, and Silver',
    'Mead and Silver', 'Take 1 Stockfish', 'Wood per Player and 1 Ore',
    'Produce Milk', 'Produce Wool', 'Take up to 2 Mountain Items',
  ];
  const hotspots = all('.ft-action-hotspot:not(.disabled)');
  const wanted = priorities.map((name) => hotspots.find((button) => button.title === name)).find(Boolean) ?? hotspots[0];
  const selectedHotspot = document.querySelector('.ft-action-hotspot.selected');
  if (wanted && selectedHotspot !== wanted) return click(wanted, `select-action:${wanted.title}`);
  const place = all('.ft-place-workers').find((button) => text(button).startsWith('PLACE ') && !button.disabled);
  if (place) return click(place, `place-workers:${text(place)}`);

  const pass = all('button').find((button) => text(button) === 'PASS FOR ROUND' && !button.disabled);
  if (pass) return click(pass, 'pass');
  return null;
}

await mkdir(OUT, { recursive: true });
const { roomId, token } = await createSoloRoom();
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-webgl',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const device = await browser.newPage();
const tv = await browser.newPage();
await device.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
await tv.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
const deviceErrors = watchErrors(device, 'device');
const tvErrors = watchErrors(tv, 'tv');
await device.evaluateOnNewDocument(({ key, value }) => localStorage.setItem(key, value), { key: `bge-token-${roomId.toUpperCase()}`, value: token });
await Promise.all([
  device.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2', timeout: 60_000 }),
  tv.goto(`${BASE}/board/${roomId}`, { waitUntil: 'networkidle2', timeout: 60_000 }),
]);
try {
  await device.waitForSelector('[data-testid="feast-device"]', { timeout: 60_000 });
  await tv.waitForSelector('[data-testid="feast-tv"]', { timeout: 60_000 });
} catch (error) {
  await Promise.all([
    capture(device, 'mount-failure-device.png'),
    capture(tv, 'mount-failure-tv.png'),
  ]).catch(() => undefined);
  const debug = await Promise.all([device, tv].map(async (page) => ({ url: page.url(), title: await page.title(), body: (await page.evaluate(() => document.body.innerText)).slice(0, 2000) })));
  throw new Error(`${error.message}\nMount debug: ${JSON.stringify(debug, null, 2)}\nBrowser errors: ${[...deviceErrors, ...tvErrors].join('\n')}`);
}
await clickText(device, 'Got it');

check(await device.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.body.scrollHeight <= innerHeight), 'device has no page-level scroll at 1024x768');
check(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.body.scrollHeight <= innerHeight), 'TV has no page-level scroll at 1366x768');
check(await device.evaluate(() => /100-POINT SOLO BENCHMARK/i.test(document.body.innerText)),
  'solo device displays the official 100-point benchmark');

await clickText(device, 'VISUAL LESSONS');
await device.waitForSelector('[data-testid="feast-lessons"]');
await capture(device, 'lessons-1024x768.png');
await clickText(device, 'CLOSE');
await clickText(device, 'LIVE TOUR');
await device.waitForSelector('[data-testid="feast-tutorial"]');
await capture(device, 'live-tour-1024x768.png');
await clickText(device, 'SKIP TOUR');
await Promise.all([
  capture(device, 'device-start-1024x768.png'),
  capture(tv, 'tv-start-1366x768.png'),
]);

let actions = 0;
let lastProgress = Date.now();
let lastMarker = '';
let lastFingerprint = '';
const seenWorkerColors = new Set();
let sawAlternatingBlockersTogether = false;
const startedAt = Date.now();
while (Date.now() - startedAt < HARD_MS) {
  const result = await device.evaluate(tickFeastDevice);
  if (result === 'ENDED') break;
  if (result) {
    actions++;
    if (actions % 25 === 0) console.log(`progress - ${actions} UI clicks, last ${result}`);
  }
  const marker = await device.evaluate(() => document.querySelector('.ft-status')?.textContent ?? '');
  lastMarker = marker;
  const fingerprint = await device.evaluate(() => JSON.stringify({
    status: document.querySelector('.ft-status')?.textContent ?? '',
    decision: document.querySelector('[data-testid="feast-decision"]')?.textContent ?? '',
    selectedAction: document.querySelector('.ft-action-hotspot.selected')?.getAttribute('title') ?? '',
    feastCovered: document.querySelectorAll('.ft-banquet-table > i.covered').length,
    final: !!document.querySelector('[data-testid="feast-final-score"]'),
  }));
  if (fingerprint !== lastFingerprint) {
    lastFingerprint = fingerprint;
    lastProgress = Date.now();
  }
  const workerColors = await device.evaluate(() => [...document.querySelectorAll('.ft-worker-stack i')]
    .map((worker) => worker.style.getPropertyValue('--worker')).filter(Boolean));
  workerColors.forEach((color) => seenWorkerColors.add(color));
  if (new Set(workerColors).size >= 2) sawAlternatingBlockersTogether = true;
  if (Date.now() - lastProgress > STALL_MS) {
    const visible = await device.evaluate(() => [...document.querySelectorAll('button')].filter((button) => button.offsetParent !== null).map((button) => `${button.disabled ? '[disabled] ' : ''}${button.textContent.trim().replace(/\s+/g, ' ')}`).slice(0, 80));
    throw new Error(`FAIL: Feast UI stalled at ${marker}; visible controls:\n${visible.join('\n')}`);
  }
  await new Promise((resolve) => setTimeout(resolve, result ? 120 : 300));
}

check(await device.$('[data-testid="feast-final-score"]'), 'complete game reached the final score through UI clicks');
check(seenWorkerColors.size >= 2, 'solo UI rendered both alternating worker colors');
check(sawAlternatingBlockersTogether, 'solo action board visibly retained one blocker color while the other acted');
await tv.bringToFront();
const sagaOpened = await tv.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'SAGA LOG');
  button?.click();
  return !!button;
});
check(sagaOpened, 'opened the public TV Saga Log');
await tv.waitForSelector('.ft-saga-log');
const finalSagaEntry = await tv.$eval('.ft-saga-log li:first-child', (entry) => entry.textContent?.trim() ?? '');
check(/^Game over\b.*\bwins\b/i.test(finalSagaEntry), 'public TV audit trail received the authoritative winner event');
await Promise.all([
  capture(device, 'device-final-1024x768.png'),
  capture(tv, 'tv-final-1366x768.png'),
]);
check(actions > 60, `full game exercised a substantial device path (${actions} clicks)`);
const errors = [...deviceErrors, ...tvErrors];
check(errors.length === 0, errors.length ? `browser errors:\n${errors.join('\n')}` : 'no browser, asset, console, or request errors');
await browser.close();
console.log(`PASS - Feast UI ship gate completed room ${roomId}; screenshots in ${OUT}`);
