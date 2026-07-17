// Lightweight real-DOM smoke for the three original pointer-heavy game UIs.
// It verifies their first useful interaction at phone and tablet sizes without
// bypassing gameplay through WebSocket actions. WebSocket is setup-only.
//
// Run: node tools/verify/legacy-ui-smoke.mjs [baseUrl] [wsUrl]

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const WS_URL = process.argv[3] ?? BASE.replace(/^http/, 'ws') + '/ws';
const OUT = fileURLToPath(new URL('../../tmp/legacy-ui-smoke/', import.meta.url));
const VIEWPORTS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  tablet: { width: 1024, height: 768, deviceScaleFactor: 1, hasTouch: true },
};

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

async function createRoom(game) {
  console.log(`setup - creating ${game} room`);
  const ws = await connect();
  ws.send(JSON.stringify({ type: 'create_room', name: `${game} legacy UI smoke`, game }));
  const roomId = await waitFor(ws, (message) => message.type === 'room_created' ? message.roomId : undefined);
  ws.send(JSON.stringify({ type: 'join', roomId, name: 'Legacy UI' }));
  const token = await waitFor(ws, (message) => message.type === 'joined' ? message.playerToken : undefined);
  const tokens = [token];
  const humanSeats = game === 'brass' ? 4 : game === 'trek' ? 3 : 1;
  if (humanSeats > 1) {
    for (let seat = 1; seat < humanSeats; seat++) {
      const extra = await connect();
      extra.send(JSON.stringify({ type: 'join', roomId, name: `Legacy UI ${seat + 1}` }));
      tokens.push(await waitFor(extra, (message) => message.type === 'joined' ? message.playerToken : undefined));
      extra.close();
    }
  }
  const started = waitFor(ws, (message) => message.type === 'state' && message.view?.game === game ? message.view : undefined);
  ws.send(JSON.stringify({ type: 'start' }));
  const view = await started;
  ws.close();
  const actingSeat = game === 'brass'
    ? Math.max(0, view.players.findIndex((player) => player.color === view.currentColor))
    : game === 'trek' ? view.turn : 0;
  return { roomId, token: tokens[actingSeat] };
}

function watchErrors(page, label) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`); });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    // React/three cancels texture fetches when a scene unmounts or the viewport
    // swap rebuilds its renderer. Canceled requests are not missing assets.
    if (reason !== 'net::ERR_ABORTED') errors.push(`${label} request: ${request.url()} ${reason}`);
  });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${label} HTTP ${response.status()}: ${response.url()}`); });
  return errors;
}

async function openDevice(browser, game, viewportName, roomId, token) {
  console.log(`load - ${game} ${viewportName}`);
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[viewportName]);
  const errors = watchErrors(page, `${game}-${viewportName}`);
  await page.evaluateOnNewDocument(({ key, value }) => localStorage.setItem(key, value), {
    key: `bge-token-${roomId.toUpperCase()}`,
    value: token,
  });
  await page.goto(`${BASE}/play/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !/Connecting|Dealing|Preparing|Loading the (world|trails)/i.test(document.body.innerText), { timeout: 60_000 });
  return { page, errors };
}

async function clickText(page, text, exact = true) {
  const clicked = await page.evaluate(({ wanted, exactMatch }) => {
    const normalized = (value) => (value ?? '').trim().replace(/\s+/g, ' ');
    const button = [...document.querySelectorAll('button')].find((entry) => {
      const label = normalized(entry.textContent);
      return !entry.disabled && (exactMatch ? label === wanted : label.includes(wanted));
    });
    if (!button) return false;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
    return true;
  }, { wanted: text, exactMatch: exact });
  check(clicked, `clicked ${text}`);
}

async function layoutReport(page, game, viewportName) {
  const report = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const normalized = (value) => (value ?? '').trim().replace(/\s+/g, ' ');
    const candidates = [...document.querySelectorAll('button, [role="button"], .tp-ticket, .picker-card')].filter(visible);
    const small = [];
    for (const control of candidates) {
      const leaves = [control, ...control.querySelectorAll('*')].filter((element) => {
        if (!visible(element)) return false;
        return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && normalized(node.textContent));
      });
      for (const leaf of leaves) {
        const text = normalized([...leaf.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' '));
        const px = Number.parseFloat(getComputedStyle(leaf).fontSize);
        if (text && px < 11) small.push({ text: text.slice(0, 48), px });
      }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      htmlWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      small: small.sort((a, b) => a.px - b.px).slice(0, 12),
    };
  });
  console.log(`${game}-${viewportName} layout ${JSON.stringify(report)}`);
  check(report.htmlWidth <= report.viewport.width + 1, `${game} ${viewportName} document has no horizontal overflow`);
  check(report.bodyWidth <= report.viewport.width + 1, `${game} ${viewportName} body has no horizontal overflow`);
  return report;
}

async function assertReachable(page, game, label, selector, text) {
  const result = await page.evaluate(({ css, wanted }) => {
    const normalized = (value) => (value ?? '').trim().replace(/\s+/g, ' ');
    const elements = [...document.querySelectorAll(css)];
    const element = wanted ? elements.find((entry) => normalized(entry.textContent).includes(wanted)) : elements[0];
    if (!element || element.disabled) return { found: false };
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    return {
      found: true,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, { css: selector, wanted: text });
  check(result.found, `${game} exposes ${label}`);
  check(result.rect.left >= -1 && result.rect.right <= result.viewport.width + 1 && result.rect.top >= -1 && result.rect.bottom <= result.viewport.height + 1,
    `${game} keeps ${label} on-screen after scrolling (${JSON.stringify(result.rect)})`);
  check(result.rect.height >= 44, `${game} ${label} has a usable ${Math.round(result.rect.height)}px target`);
}

async function dismissIntro(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Got it'), { timeout: 60_000 });
  await clickText(page, 'Got it');
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Got it'), { timeout: 20_000 });
}

async function playBrass(page) {
  await dismissIntro(page);
  await assertReachable(page, 'brass', 'Pass action', 'button.ig-act', 'Pass');
  await clickText(page, 'PassSkip · discard a card');
  await page.waitForSelector('.picker-card:not(.dim)', { timeout: 20_000 });
  await page.evaluate(() => document.querySelector('.picker-card:not(.dim)')?.click());
  await assertReachable(page, 'brass', 'Discard & pass confirmation', 'button', 'Discard & pass');
  await clickText(page, 'Discard & pass');
  await page.waitForFunction(() => !document.querySelector('.picker-backdrop'), { timeout: 20_000 });
}

async function setupTicketToRide(page) {
  await page.waitForSelector('.tp-ticket', { timeout: 60_000 });
  const picked = await page.evaluate(() => {
    const tickets = [...document.querySelectorAll('.tp-ticket')].slice(0, 3);
    tickets.forEach((ticket) => ticket.click());
    return tickets.length;
  });
  check(picked === 3, 'Ticket to Ride selected three real ticket controls');
  await assertReachable(page, 'ttr', 'Set sail setup action', 'button.tp-act.primary', 'Set sail');
  await clickText(page, 'Set sail', false);
  await dismissIntro(page);
}

async function playTrekking(page) {
  await dismissIntro(page);
  const result = await page.evaluate(() => {
    const section = [...document.querySelectorAll('.ig-glass')].find((entry) => entry.textContent?.includes('Face-up trek cards'));
    const button = section ? [...section.querySelectorAll('button')].find((entry) => !entry.disabled) : null;
    if (!button) return null;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();
    button.click();
    return { width: rect.width, height: rect.height, label: button.textContent?.trim() || button.getAttribute('aria-label') || 'face-up card' };
  });
  check(result, 'Trekking exposes a legal face-up/deck draw control');
  check(result.height >= 40, `Trekking draw target is usable (${Math.round(result.width)}x${Math.round(result.height)}px)`);
  await page.waitForFunction(() => document.body.innerText.includes('Last:'), { timeout: 20_000 });
}

async function captureFailure(game, device) {
  if (!device) return;
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    await device.page.setViewport(viewport).catch(() => undefined);
    await device.page.screenshot({
      path: path.join(OUT, `${game}-${name}-failure.png`),
      captureBeyondViewport: false,
      fromSurface: true,
      optimizeForSpeed: true,
    }).catch(() => undefined);
  }
}

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 180_000,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  ],
});

const games = [
  { id: 'brass', interact: playBrass },
  { id: 'ttr', interact: setupTicketToRide },
  { id: 'trek', interact: playTrekking },
];

try {
  for (const game of games) {
    const { roomId, token } = await createRoom(game.id);
    let device;
    try {
      device = await openDevice(browser, game.id, 'phone', roomId, token);
      const phoneBefore = await layoutReport(device.page, game.id, 'phone');
      if (phoneBefore.small.length) console.log(`${game.id} critically-small interactive text: ${JSON.stringify(phoneBefore.small)}`);
      await game.interact(device.page);
      const phoneAfter = await layoutReport(device.page, game.id, 'phone-after-action');
      if (phoneAfter.small.length) console.log(`${game.id} post-action critically-small interactive text: ${JSON.stringify(phoneAfter.small)}`);
      await device.page.setViewport(VIEWPORTS.tablet);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await layoutReport(device.page, game.id, 'tablet-after-action');
      const errors = device.errors;
      check(errors.length === 0, `${game.id} pages have no console, request, or HTTP errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
      console.log(`PASS - ${game.id} legacy UI room ${roomId}`);
    } catch (error) {
      await captureFailure(game.id, device);
      throw error;
    } finally {
      await device?.page.close().catch(() => undefined);
    }
  }
  console.log('LEGACY UI SMOKE PASS - Brass, Ticket to Ride, and Trekking');
} finally {
  await browser.close();
}
