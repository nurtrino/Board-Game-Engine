// Real-browser Politik TV/device smoke. WebSocket is used only to create the
// save and advance server-CPU setup; the verification itself clicks the actual
// React device and shared-board DOM at the playbook's landscape-tablet target.
//
// Run: node tools/verify/politik-ui-smoke.mjs [baseUrl] [wsUrl]

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import puppeteer from 'puppeteer';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const WS_URL = process.argv[3] ?? BASE.replace(/^http/, 'ws') + '/ws';
const OUT = fileURLToPath(new URL('../../tmp/', import.meta.url));
const data = JSON.parse(await readFile(new URL('../../shared/src/politik/data.json', import.meta.url), 'utf8'));
const nationById = Object.fromEntries(data.cards.nationDefs.map((nation) => [nation.id, nation]));
const catalog = data.cards.catalog;
const BASES = ['capitalism', 'communism', 'statism', 'fascism'];
const propagandaBases = {
  specializations: ['capitalism'], homeland: ['statism'], intensification: ['statism'], cultureOfOpenness: ['statism'],
  steelyWit: ['fascism'], intimidationTactics: ['fascism'], oathOfPoverty: ['communism'], honorCulture: ['fascism'],
  assuredStability: ['communism'], loftyRhetoric: ['communism'], holisticLearnings: ['communism'], unity: [...BASES],
  proteges: ['communism'], improvisation: ['fascism'], backchannels: ['capitalism'], cryptocracy: ['capitalism'],
  redEmpire: ['fascism'], petrostate: ['statism'], greyArea: ['capitalism'], dogmatic: ['statism'],
  oldMoney: ['capitalism'], birthright: ['communism'], marketmaker: ['capitalism'], catchAndKill: ['fascism'],
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
      const value = predicate(message, ws);
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

function setupDecision(view) {
  const pending = view.pending;
  const player = view.players[0];
  if (!pending || pending.seat !== 0) return null;
  if (pending.kind === 'mulligan') return { type: 'mulligan', take: false };
  if (pending.kind === 'nation') {
    const nation = nationById[player.nationChoices[0]];
    const propaganda = nation.propaganda.find((id) => id !== 'steelyWit' && id !== 'dogmatic') ?? nation.propaganda[0];
    return { type: 'choose_nation', nation: nation.id, propaganda, support: { [propagandaBases[propaganda][0]]: nation.support }, leaders: { military: nation.leaders } };
  }
  if (pending.kind === 'setup_bonus') {
    const bonus = pending.available.find((value) => value !== 'exchange') ?? 'exchange';
    return bonus === 'exchange' ? { type: 'choose_setup_bonus', bonus, exchange: [{ resource: 'food', mode: 'buy', amount: 1 }] } : { type: 'choose_setup_bonus', bonus };
  }
  if (pending.kind === 'start_state') {
    const state = Object.values(view.locations).find((location) => location.kind === 'state' && location.benefit !== 'support' && location.influence.every((value) => value === 0));
    return { type: 'choose_start_state', state: state.id };
  }
  if (pending.kind === 'landscape') return { type: 'resolve_landscape', choice: pending.overflow?.eligibleIndustries?.find((industry) => view.marketSupply[industry] > 0) ?? null };
  if (pending.kind === 'guided') return { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Printed effect checked.' }], note: 'Printed effect checked.' };
  if (pending.kind === 'clash') {
    if (pending.stage !== 'attacker_commit' && pending.stage !== 'defender_commit') return { type: 'pass_clash' };
    const ranked = (player.hand ?? []).map((card, handIndex) => ({ handIndex, focus: card.kind === 'startup' ? 1 : card.kind === 'politik' ? (catalog[card.id]?.focus?.[pending.arena] ?? -1) : -1 })).filter((entry) => entry.focus >= 0).sort((a, b) => b.focus - a.focus).slice(0, 2);
    return { type: 'clash_commit', cards: ranked.map(({ handIndex }) => ({ handIndex })), leaders: 0, focusInfluence: {} };
  }
  if (pending.kind === 'edge_window') return { type: 'pass_edge' };
  if (pending.kind === 'trade') return { type: 'respond_trade', accept: false };
  if (pending.kind === 'allocate_support') return { type: 'allocate_support', support: { [player.propaganda[0]?.bases?.[0] ?? 'capitalism']: pending.amount } };
  if (pending.kind === 'corporate_loss') {
    const company = player.companies.find((entry) => entry.id === pending.loserCompany);
    let left = pending.amount;
    const margin = Math.min(left, company?.margin ?? 0);
    left -= margin;
    const markets = {};
    for (const industry of ['media', 'energy', 'financial', 'humanities', 'technology', 'manufacturing']) {
      const amount = Math.min(left, company?.markets?.[industry] ?? 0);
      if (amount) markets[industry] = amount;
      left -= amount;
    }
    return { type: 'resolve_corporate_loss', margin, markets };
  }
  if (pending.kind === 'corporate_gain') return { type: 'resolve_corporate_gain', choice: pending.eligibleIndustries?.find((industry) => view.marketSupply[industry] > 0) ?? null };
  if (pending.kind === 'hand_limit') {
    const handIndices = (player.hand ?? []).map((card, index) => ({ card, index })).filter(({ card }) => card.kind !== 'obligation').slice(0, pending.excess).map(({ index }) => index);
    return { type: 'discard', handIndices };
  }
  return null;
}

async function createReadyRoom() {
  const ws = await connect();
  ws.send(JSON.stringify({ type: 'create_room', name: 'Politik visual smoke', game: 'politik' }));
  const roomId = await waitFor(ws, (message) => message.type === 'room_created' ? message.roomId : undefined);
  ws.send(JSON.stringify({ type: 'join', roomId, name: 'Visual Nation' }));
  const token = await waitFor(ws, (message) => message.type === 'joined' ? message.playerToken : undefined);

  const ready = new Promise((resolve, reject) => {
    let last = '';
    const timer = setTimeout(() => reject(new Error('Politik setup did not reach the human turn')), 150_000);
    ws.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'error') return reject(new Error(message.message));
      if (message.type !== 'state' || message.view?.game !== 'politik' || message.view.you !== 0) return;
      const view = message.view;
      const fingerprint = JSON.stringify([view.phase, view.turn, view.actionsTaken, view.eventSeq, view.pending, view.ties]);
      if (fingerprint === last) return;
      const decision = setupDecision(view);
      if (decision) {
        last = fingerprint;
        ws.send(JSON.stringify({ type: 'action', action: decision }));
        return;
      }
      const tie = view.ties.find((entry) => entry.ruling === null);
      if (tie && view.finalSay === 0) {
        last = fingerprint;
        ws.send(JSON.stringify({ type: 'action', action: { type: 'final_say', contest: tie.key, winner: tie.candidates[0] } }));
        return;
      }
      if (view.phase === 'playing' && view.turn === 0 && view.actionsTaken === 0 && !view.pending && !tie) {
        clearTimeout(timer);
        resolve(view);
      }
    });
  });
  ws.send(JSON.stringify({ type: 'start' }));
  const view = await ready;
  ws.close();
  return { roomId, token, view };
}

// Keep a second disposable room paused on the human mulligan so setup-only
// affordances are exercised in the browser instead of being inferred from
// source markup. Earlier setup prompts, if any, are resolved normally.
async function createMulliganRoom() {
  const ws = await connect();
  ws.send(JSON.stringify({ type: 'create_room', name: 'Politik setup visual smoke', game: 'politik' }));
  const roomId = await waitFor(ws, (message) => message.type === 'room_created' ? message.roomId : undefined);
  ws.send(JSON.stringify({ type: 'join', roomId, name: 'Setup Nation' }));
  const token = await waitFor(ws, (message) => message.type === 'joined' ? message.playerToken : undefined);

  const paused = new Promise((resolve, reject) => {
    let last = '';
    const timer = setTimeout(() => done(new Error('Politik setup did not reach the human mulligan')), 90_000);
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'error') return done(new Error(message.message));
      if (message.type !== 'state' || message.view?.game !== 'politik' || message.view.you !== 0) return;
      const view = message.view;
      const fingerprint = JSON.stringify([view.phase, view.eventSeq, view.pending]);
      if (fingerprint === last) return;
      if (view.pending?.seat === 0 && view.pending.kind === 'mulligan') return done(null, view);
      const decision = setupDecision(view);
      if (!decision) return;
      last = fingerprint;
      ws.send(JSON.stringify({ type: 'action', action: decision }));
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
  ws.send(JSON.stringify({ type: 'start' }));
  const view = await paused;
  ws.close();
  return { roomId, token, view };
}

async function clickButton(page, wanted, mode = 'exact') {
  const clicked = await page.evaluate(({ wanted, mode }) => {
    const buttons = [...document.querySelectorAll('button')];
    const button = buttons.find((candidate) => {
      const text = candidate.textContent.trim().replace(/\s+/g, ' ');
      return mode === 'exact' ? text === wanted : text.includes(wanted);
    });
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, { wanted, mode });
  check(clicked, `clicked ${wanted}`);
}

function watchErrors(page, name) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${name} pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${name} console: ${message.text()}`); });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    // The smoke first opens `/` to seed the player token, then immediately
    // navigates to the room. Lazy home-page assets cancelled by that deliberate
    // navigation are benign; failures from the actual room still surface.
    if (reason === 'net::ERR_ABORTED') return;
    errors.push(`${name} request: ${request.url()} ${reason}`);
  });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${name} HTTP ${response.status()}: ${response.url()}`); });
  return errors;
}

// One gameplay decision made only by clicking the rendered device DOM. The
// human follows a stable National-Action cycle while the two server Nations
// pursue the normal strategic CPU path. This keeps the browser gate focused on
// affordance completeness rather than on reproducing the reducer in Puppeteer.
function tickDeviceGame() {
  const buttons = [...document.querySelectorAll('button')];
  const text = (button) => button.textContent.trim().replace(/\s+/g, ' ');
  const exact = (label) => buttons.find((button) => text(button) === label && !button.disabled);
  const containing = (label, root = document) => [...root.querySelectorAll('button')].find((button) => text(button).includes(label) && !button.disabled);
  const click = (button, result) => { if (!button) return null; button.click(); return result; };

  if (document.querySelector('.pk-end-screen')) return 'ENDED';
  const gotIt = exact('Got it');
  if (gotIt) return click(gotIt, 'intro');

  const finalSay = document.querySelector('.pk-final-say');
  if (finalSay) return click(finalSay.querySelector('button:not(:disabled)'), 'final-say');

  const edge = document.querySelector('.pk-edge-prompt');
  if (edge) return click(edge.querySelector('[data-testid="politik-edge-pass"], button.pk-primary:not(:disabled)'), 'edge-pass');

  const clashPass = buttons.find((button) => /PASS (?:THIS )?CLASH|PASS TIMING|PASS RESPONSE/.test(text(button)) && !button.disabled);
  if (clashPass) return click(clashPass, 'clash-pass');

  const clash = document.querySelector('.pk-clash-prompt');
  if (clash) {
    const pass = containing('PASS', clash);
    if (pass) return click(pass, 'clash-pass');
    return click(clash.querySelector('[data-testid="politik-clash-commit"]:not(:disabled)'), 'clash-commit');
  }

  const handLimit = document.querySelector('.pk-hand-limit');
  if (handLimit) {
    const confirm = containing('DISCARD SELECTED', handLimit);
    if (confirm) return click(confirm, 'hand-discard');
    const excess = Number(handLimit.querySelector('h2')?.textContent.match(/\d+/)?.[0] ?? 0);
    const choices = [...handLimit.querySelectorAll('.pk-commit-hand button:not(:disabled)')].filter((button) => !button.classList.contains('on')).slice(0, excess);
    if (choices.length) { choices.forEach((button) => button.click()); return 'hand-select'; }
  }

  const allocation = [...document.querySelectorAll('.pk-prompt-card')].find((element) => /ALLOCATE \d+ SUPPORT/.test(element.textContent));
  if (allocation) {
    const confirm = containing('CONFIRM SUPPORT', allocation);
    if (confirm) return click(confirm, 'support-confirm');
    return click(containing('PLUS', allocation), 'support-plus');
  }

  const corporateGain = document.querySelector('[data-testid="politik-corporate-gain"]');
  if (corporateGain) {
    const confirm = corporateGain.querySelector('[data-testid="politik-corporate-gain-confirm"]:not(:disabled)');
    if (confirm) return click(confirm, 'corporate-confirm');
    return click(corporateGain.querySelector('[data-testid="politik-corporate-gain-remain"]'), 'corporate-remain');
  }

  // Wait while another Nation owns the pending prompt or turn.
  if (!document.querySelector('.pk-turn-status.mine')) return null;

  const end = document.querySelector('.pk-end-turn:not(:disabled)');
  if (end) return click(end, 'end-turn');

  const nationalPanel = document.querySelector('.pk-national-grid');
  if (nationalPanel) {
    const confirm = document.querySelector('.pk-action-detail .pk-primary:not(:disabled)');
    if (confirm) return click(confirm, 'national-confirm');
    const choice = nationalPanel.querySelector('button:not(:disabled)');
    if (choice) return click(choice, 'national-choice');
  }

  const national = [...document.querySelectorAll('.pk-action-grid button:not(:disabled)')].find((button) => button.querySelector('b')?.textContent === 'NATIONAL');
  if (national) return click(national, 'open-national');
  return null;
}

await mkdir(OUT, { recursive: true });
let readyRoom = await createReadyRoom();
for (let attempt = 1; readyRoom.view.first === 0 && attempt < 8; attempt++) {
  // The strategic server contender is the randomized first Nation. Keep the
  // browser Nation non-contending so a full game can finish while all of its
  // own decisions remain real UI clicks.
  await fetch(`${BASE}/api/saves/${readyRoom.roomId}`, { method: 'DELETE' }).catch(() => undefined);
  readyRoom = await createReadyRoom();
}
check(readyRoom.view.first !== 0, 'visual-smoke Nation is paired with a CPU first-player contender');
const { roomId, token } = readyRoom;
console.log(`room ${roomId}`);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'],
});

let setupRoomId = null;
try {
  // Setup is intentionally audited in its own paused room because the main
  // smoke room has already completed setup before its longer gameplay pass.
  const setupRoom = await createMulliganRoom();
  setupRoomId = setupRoom.roomId;
  const setupDevice = await browser.newPage();
  const setupErrors = watchErrors(setupDevice, 'setup device');
  await setupDevice.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
  await setupDevice.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await setupDevice.evaluate(([room, seatToken]) => localStorage.setItem('bge-token-' + room.toUpperCase(), seatToken), [setupRoom.roomId, setupRoom.token]);
  await setupDevice.goto(`${BASE}/play/${setupRoom.roomId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await setupDevice.waitForSelector('.pk-device', { timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await setupDevice.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Got it');
    button?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await setupDevice.waitForSelector('[data-pk-tutorial="setup-hand"]', { timeout: 30_000 });
  const setupHand = await setupDevice.evaluate(() => {
    const shell = document.querySelector('[data-pk-tutorial="setup-hand"]');
    const zooms = [...shell.querySelectorAll('[data-testid^="politik-setup-card-zoom-"]')];
    return {
      cards: zooms.length,
      everyCardExplainsCloseUp: zooms.every((button) => /VIEW CLOSE UP/.test(button.textContent)),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
  check(setupHand.cards === 7 && setupHand.everyCardExplainsCloseUp, `mulligan shows all six Politik cards plus the Startup as explicit close-ups ${JSON.stringify(setupHand)}`);
  check(setupHand.scrollWidth <= setupHand.viewportWidth + 2, 'setup close-up grid does not create horizontal page scroll');
  await setupDevice.click('[data-testid="politik-setup-card-zoom-0"]');
  await setupDevice.waitForSelector('[data-testid="politik-card-zoom"]');
  const setupZoom = await setupDevice.$eval('[data-testid="politik-card-zoom"] .pk-card-art', (element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
  check(setupZoom.height >= 540 && setupZoom.width >= 370, `setup card close-up fills the tablet view ${JSON.stringify(setupZoom)}`);
  await setupDevice.screenshot({ path: path.join(OUT, 'politik-setup-card-zoom-1024x768.png') });
  await setupDevice.click('.pk-card-zoom-head button');
  await setupDevice.waitForSelector('[data-testid="politik-card-zoom"]', { hidden: true });
  check(setupErrors.length === 0, setupErrors.length ? setupErrors.join('\n') : 'setup close-up has no page, console, request, or HTTP errors');
  await setupDevice.close();
  await fetch(`${BASE}/api/saves/${setupRoomId}`, { method: 'DELETE' }).catch(() => undefined);
  setupRoomId = null;

  const device = await browser.newPage();
  const board = await browser.newPage();
  const deviceErrors = watchErrors(device, 'device');
  const boardErrors = watchErrors(board, 'board');

  await device.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
  await device.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await device.evaluate(([room, seatToken]) => localStorage.setItem('bge-token-' + room.toUpperCase(), seatToken), [roomId, token]);
  await device.goto(`${BASE}/play/${roomId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await device.waitForSelector('.pk-device', { timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  const gotIt = await device.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Got it');
    if (!button) return false;
    button.click();
    return true;
  });
  if (gotIt) await new Promise((resolve) => setTimeout(resolve, 400));

  const deviceLayout = await device.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    hasHeader: !!document.querySelector('.pk-device-head'),
    hasActions: !!document.querySelector('.pk-action-rail'),
    hasHand: !!document.querySelector('.pk-hand-dock'),
    handCards: document.querySelectorAll('.pk-hand-scroll > button').length,
  }));
  check(deviceLayout.hasHeader && deviceLayout.hasActions && deviceLayout.hasHand, 'device exposes identity, actions, and private hand');
  check(deviceLayout.handCards > 0, 'private hand has clickable authentic cards');
  check(deviceLayout.scrollWidth <= deviceLayout.width + 2 && deviceLayout.scrollHeight <= deviceLayout.height + 2, '1024x768 device shell has no page scroll');
  const readableType = await device.evaluate(() => ({
    resourceLabel: Number.parseFloat(getComputedStyle(document.querySelector('.pk-head-resources small')).fontSize),
    actionDetail: Number.parseFloat(getComputedStyle(document.querySelector('.pk-action-empty p')).fontSize),
    actionSecondary: Number.parseFloat(getComputedStyle(document.querySelector('.pk-action-grid button small')).fontSize),
    handTitle: Number.parseFloat(getComputedStyle(document.querySelector('.pk-hand-scroll > button > span')).fontSize),
  }));
  check(readableType.resourceLabel >= 7.4 && readableType.actionDetail >= 9.9 && readableType.actionSecondary >= 7.9 && readableType.handTitle >= 8.9, `personal-device type hierarchy is readable ${JSON.stringify(readableType)}`);

  await clickButton(device, 'MAIN BOARD');
  await device.waitForFunction(() => document.querySelector('.pk-main-layer')?.classList.contains('active'));
  await new Promise((resolve) => setTimeout(resolve, 700));
  check(await device.$eval('.pk-main-layer.active', (element) => !!element.querySelector('canvas')), 'one-click main-board mode renders the live board');
  const mainBoardLayout = await device.$eval('.pk-main-layer.active', (element) => {
    const canvas = element.querySelector('canvas');
    const layer = element.getBoundingClientRect();
    const rendered = canvas?.getBoundingClientRect();
    return { layerWidth: layer.width, layerHeight: layer.height, canvasWidth: rendered?.width ?? 0, canvasHeight: rendered?.height ?? 0 };
  });
  check(mainBoardLayout.layerWidth > 500 && mainBoardLayout.layerHeight > 400 && Math.abs(mainBoardLayout.canvasWidth - mainBoardLayout.layerWidth) < 3 && Math.abs(mainBoardLayout.canvasHeight - mainBoardLayout.layerHeight) < 3, `main-board canvas expands to the full device workspace ${JSON.stringify(mainBoardLayout)}`);
  await device.screenshot({ path: path.join(OUT, 'politik-device-main-1024x768.png') });
  await clickButton(device, 'PERSONAL');
  await device.waitForFunction(() => document.querySelector('.pk-personal-layer')?.classList.contains('active'));
  await new Promise((resolve) => setTimeout(resolve, 350));
  const personalTableau = await device.evaluate(() => {
    const root = document.querySelector('[data-testid="politik-personal-tableau"]');
    const nation = document.querySelector('[data-testid="politik-personal-nation"]');
    const ledger = document.querySelector('.pk-mat-ledger-zone');
    const companies = document.querySelector('[data-testid="politik-personal-companies"]');
    const board = document.querySelector('.pk-mat-nation-board');
    const nationCard = document.querySelector('.pk-mat-nation-card');
    const mainMini = document.querySelector('.pk-main-layer.mini');
    const rect = (element) => { const value = element?.getBoundingClientRect(); return value ? { top: value.top, left: value.left, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null; };
    return {
      hasRoot: !!root,
      hasCanvas: !!root?.querySelector('canvas'),
      copy: root?.textContent ?? '',
      root: rect(root), nation: rect(nation), ledger: rect(ledger), companies: rect(companies), board: rect(board), nationCard: rect(nationCard),
      leaderCount: root?.querySelectorAll('.pk-mat-leader').length ?? 0,
      companyBoards: root?.querySelectorAll('[data-testid^="politik-personal-company-"]').length ?? 0,
      mainMiniDisplay: mainMini ? getComputedStyle(mainMini).display : '',
      resourceFont: Number.parseFloat(getComputedStyle(document.querySelector('.pk-mat-resource-ledger small')).fontSize),
      resourceValueFont: Number.parseFloat(getComputedStyle(document.querySelector('.pk-mat-resource-ledger b')).fontSize),
    };
  });
  const zonesOrdered = personalTableau.nation && personalTableau.ledger && personalTableau.companies
    && personalTableau.nation.right <= personalTableau.ledger.left + 1
    && personalTableau.ledger.right <= personalTableau.companies.left + 1;
  const nationCardSeated = personalTableau.board && personalTableau.nationCard
    && personalTableau.nationCard.left >= personalTableau.board.left
    && personalTableau.nationCard.right <= personalTableau.board.right
    && personalTableau.nationCard.top >= personalTableau.board.top
    && personalTableau.nationCard.bottom <= personalTableau.board.bottom;
  check(personalTableau.hasRoot && !personalTableau.hasCanvas && /TOP-DOWN · AUTHENTIC ART/.test(personalTableau.copy), 'personal tableau is a fixed top-down authentic-art layout, not an angled 3D camera');
  check(zonesOrdered && nationCardSeated && personalTableau.leaderCount === 3, `Nation, ledger, Companies, card, and three leader reserves occupy separate valid zones ${JSON.stringify(personalTableau)}`);
  check(personalTableau.mainMiniDisplay === 'none', 'personal mode does not cover Company boards with a redundant main-board mini-map');
  check(personalTableau.resourceFont >= 6.9 && personalTableau.resourceValueFont >= 14.9, `personal tableau exact resource counts remain readable ${JSON.stringify({ label: personalTableau.resourceFont, value: personalTableau.resourceValueFont })}`);
  await clickButton(device, 'HELP', 'contains');
  await device.waitForSelector('.pk-viewer');
  check(await device.$eval('.pk-viewer', (element) => /MAIN ACTIONS/i.test(element.textContent) && /OPEN OFFICIAL RULEBOOK/i.test(element.textContent)), 'device help contains action explanations and official rulebook');

  const expectedLessonIds = ['start-here', 'how-to-win', 'turn-and-timing', 'main-actions', 'edge-actions', 'board-and-control', 'cards-and-keywords', 'national-actions', 'clashes', 'companies-and-economy', 'corruption-and-obligations', 'final-say-and-ties', 'trading', 'worked-examples', 'strategy-and-variants'];
  const lessonLibrary = await device.evaluate((expectedIds) => {
    const buttons = [...document.querySelectorAll('.pk-lessons-index button')];
    const ids = buttons.map((button) => button.getAttribute('data-testid')?.replace('politik-lessons-index-', ''));
    const body = document.querySelector('.pk-lessons-fact p, .pk-lessons-fact li');
    const indexTitle = document.querySelector('.pk-lessons-index button b');
    const boundary = document.querySelector('[data-testid="politik-lessons-rulebook-boundary"]')?.textContent ?? '';
    return {
      count: buttons.length,
      ids,
      exactIndex: expectedIds.every((id, index) => ids[index] === id),
      bodyFont: Number.parseFloat(getComputedStyle(body).fontSize),
      indexFont: Number.parseFloat(getComputedStyle(indexTitle).fontSize),
      authenticBoundary: /Authentic printed card art governs/i.test(boundary) && /OCR text is only a hint/i.test(boundary) && /enter its printed values/i.test(boundary),
    };
  }, expectedLessonIds);
  check(lessonLibrary.count === 15 && lessonLibrary.exactIndex, `Help exposes the complete ordered 15-lesson library ${JSON.stringify(lessonLibrary.ids)}`);
  check(lessonLibrary.bodyFont >= 12.4 && lessonLibrary.indexFont >= 9.9, `lesson text remains readable at tablet size ${JSON.stringify({ bodyFont: lessonLibrary.bodyFont, indexFont: lessonLibrary.indexFont })}`);
  check(lessonLibrary.authenticBoundary, 'lesson library clearly separates authentic card art from optional OCR hints');
  await device.click('[data-testid="politik-lessons-index-strategy-and-variants"]');
  await device.waitForSelector('[data-testid="politik-lesson-strategy-and-variants"]');
  check(await device.$eval('[data-testid="politik-lessons-index-strategy-and-variants"]', (element) => element.getAttribute('aria-current') === 'page'), 'lesson index navigates to a selected topic without leaving Help');

  // Walk every learn-to-play step. Steps 3-23 each name a live UI target;
  // selectorless introduction and conclusion cards remain centered.
  await device.click('[data-testid="politik-lessons-start-tour"]');
  await device.waitForSelector('[data-testid="politik-tutorial"]');
  const tutorialAudits = [];
  for (let position = 1; position <= 24; position++) {
    await device.waitForFunction((expected) => document.querySelector('.pk-tour-meta b')?.textContent.trim() === `${expected} / 24`, {}, position);
    if (position >= 3 && position <= 23) await device.waitForSelector('.pk-tour-ring', { timeout: 5_000 });
    await device.waitForFunction((expected) => {
      const progress = document.querySelector('.pk-tour-progress')?.getBoundingClientRect();
      const fill = document.querySelector('.pk-tour-progress i')?.getBoundingClientRect();
      return !!progress?.width && !!fill && Math.abs(fill.width / progress.width - expected / 24) < 0.02;
    }, { timeout: 5_000 }, position);
    await new Promise((resolve) => setTimeout(resolve, 80));
    tutorialAudits.push(await device.evaluate((expected) => {
      const card = document.querySelector('.pk-tour-card').getBoundingClientRect();
      const progress = document.querySelector('.pk-tour-progress').getBoundingClientRect();
      const fill = document.querySelector('.pk-tour-progress i').getBoundingClientRect();
      const ringElement = document.querySelector('.pk-tour-ring');
      const ring = ringElement?.getBoundingClientRect();
      return {
        position: expected,
        meta: document.querySelector('.pk-tour-meta b')?.textContent.trim(),
        chapters: document.querySelectorAll('.pk-tour-chapters button').length,
        card: { top: card.top, left: card.left, right: card.right, bottom: card.bottom },
        progress: progress.width ? fill.width / progress.width : 0,
        ring: ring ? { top: ring.top, left: ring.left, right: ring.right, bottom: ring.bottom } : null,
        viewport: { width: innerWidth, height: innerHeight },
        page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      };
    }, position));
    if (position < 24) await device.click('.pk-tour-next');
  }
  const tutorialFailures = tutorialAudits.filter((audit) => {
    const cardClips = audit.card.top < -1 || audit.card.left < -1 || audit.card.right > audit.viewport.width + 1 || audit.card.bottom > audit.viewport.height + 1;
    const progressWrong = Math.abs(audit.progress - audit.position / 24) > 0.025;
    const expectsRing = audit.position >= 3 && audit.position <= 23;
    const ringClips = expectsRing && (!audit.ring || audit.ring.top < 3 || audit.ring.left < 3 || audit.ring.right > audit.viewport.width - 3 || audit.ring.bottom > audit.viewport.height - 3);
    const pageScrolls = audit.page.width > audit.viewport.width + 2 || audit.page.height > audit.viewport.height + 2;
    return audit.meta !== `${audit.position} / 24` || audit.chapters !== 7 || cardClips || progressWrong || ringClips || pageScrolls;
  });
  check(tutorialFailures.length === 0, tutorialFailures.length ? `tutorial layout failures: ${JSON.stringify(tutorialFailures)}` : 'all 24 tutorial steps resolve their targets, progress accurately, and fit 1024x768');
  await device.click('.pk-tour-next');
  await device.waitForSelector('[data-testid="politik-tutorial"]', { hidden: true });

  await clickButton(device, 'HELP', 'contains');
  await device.waitForSelector('.pk-viewer');
  await device.type('[data-testid="politik-help-card-search"]', 'Steely Wit');
  await device.waitForFunction(() => /Steely Wit/i.test(document.querySelector('.pk-card-reference-grid')?.textContent ?? ''));
  check(true, 'searchable authentic reference finds Starting Propaganda by name');
  await device.click('[data-testid="politik-reference-propaganda-steelyWit"]');
  await device.waitForFunction(() => /Steely Wit/i.test(document.querySelector('.pk-card-reference-focus')?.textContent ?? ''));
  await clickButton(device, 'VIEW CARD CLOSE UP');
  await device.waitForSelector('[data-testid="politik-card-zoom"]');
  const zoomLayout = await device.$eval('[data-testid="politik-card-zoom"] .pk-card-art', (element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
  check(zoomLayout.height >= 540 && zoomLayout.width >= 370, `authentic card close-up fills the tablet view ${JSON.stringify(zoomLayout)}`);
  await device.screenshot({ path: path.join(OUT, 'politik-device-card-zoom-1024x768.png') });
  await device.click('.pk-card-zoom-head button');
  await device.waitForSelector('[data-testid="politik-card-zoom"]', { hidden: true });
  await clickButton(device, 'CLOSE');

  // Every shipped card is now multi-pass verified. Opening a hand card must
  // show the locked printed values directly, without the old manual-entry
  // detour or an OCR-as-rules ambiguity.
  await device.click('.pk-hand-scroll > button');
  await device.waitForSelector('.pk-focus-card');
  const verifiedCard = await device.evaluate(() => ({
    exact: document.querySelector('.pk-exact-card-data')?.textContent ?? '',
    hasManual: !!document.querySelector('.pk-manual-card-status, [data-testid="politik-card-manual-editor"]'),
    hasOcrRules: !!document.querySelector('.pk-ocr-hint'),
  }));
  check(/VERIFIED (STARTUP|PRINTED CARD) DATA/.test(verifiedCard.exact) && !verifiedCard.hasManual && !verifiedCard.hasOcrRules, `verified cards expose locked printed data without a manual-entry detour ${JSON.stringify(verifiedCard)}`);
  await device.click('[data-testid="politik-focus-card-zoom"]');
  await device.waitForSelector('[data-testid="politik-card-zoom"]');
  const focusedZoom = await device.$eval('[data-testid="politik-card-zoom"] .pk-card-art', (element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
  check(focusedZoom.height >= 540 && focusedZoom.width >= 370, `card being used can be inspected at full size ${JSON.stringify(focusedZoom)}`);
  await device.click('.pk-card-zoom-head button');
  await device.waitForSelector('[data-testid="politik-card-zoom"]', { hidden: true });
  await clickButton(device, 'CLOSE');

  // Execute one genuine main action through the rendered action rail.
  const national = await device.evaluate(() => {
    const button = [...document.querySelectorAll('.pk-action-grid button')].find((candidate) => candidate.querySelector('b')?.textContent === 'NATIONAL');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  });
  check(national, 'opened National action builder through device UI');
  await device.waitForSelector('.pk-national-grid');
  await clickButton(device, 'CONFIRM INCOME');
  await device.waitForFunction(() => /1 \/ \d+ USED/.test(document.querySelector('.pk-action-head')?.textContent ?? ''), { timeout: 20_000 });
  check(true, 'server accepted a real UI-driven Income action');
  await device.screenshot({ path: path.join(OUT, 'politik-device-personal-1024x768.png') });

  await board.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await board.goto(`${BASE}/board/${roomId}`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await board.waitForSelector('.pk-tv', { timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const boardText = await board.$eval('.pk-tv', (element) => element.textContent);
  check(/CURRENT PRICES/.test(boardText) && /LANDSCAPE/.test(boardText) && /HAND/.test(boardText), 'TV shows public prices, Landscape, and hand counts');
  check(!/PRIVATE DEVICE|FULL HAND|OPEN OFFICIAL RULEBOOK/.test(boardText), 'TV contains no private-device content');
  await clickButton(board, 'EXPLAIN BOARD');
  await board.waitForSelector('.pk-tv-guide');
  check(await board.$eval('.pk-tv-guide', (element) => /BOARD GUIDE/.test(element.textContent)), 'TV board guide opens with one click');
  await board.screenshot({ path: path.join(OUT, 'politik-tv-1280x800.png') });
  await board.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 700));
  await board.screenshot({ path: path.join(OUT, 'politik-tv-1024x768.png') });

  // Finish the live game. Only the browser Nation requires Puppeteer input;
  // server CPUs are deliberately paced and every human prompt is handled by
  // the same visible controls a player uses.
  const gameStarted = Date.now();
  let lastActivity = Date.now();
  let lastActivitySignature = '';
  let uiActions = 1; // Income above
  for (;;) {
    const activitySignature = await device.evaluate(() => [
      document.querySelector('.pk-turn-status')?.textContent,
      document.querySelector('.pk-action-head')?.textContent,
      document.querySelector('.pk-prompt-card, .pk-prompt-wait, .pk-final-say, .pk-clash-prompt, .pk-edge-prompt')?.textContent,
      document.querySelector('.pk-end-screen')?.textContent,
    ].join('|').replace(/\s+/g, ' ').slice(0, 1_200)).catch(() => '');
    if (activitySignature && activitySignature !== lastActivitySignature) {
      lastActivitySignature = activitySignature;
      lastActivity = Date.now();
    }
    const result = await device.evaluate(tickDeviceGame).catch(() => null);
    if (result === 'ENDED') break;
    if (result) { uiActions++; lastActivity = Date.now(); }
    if (Date.now() - lastActivity > 180_000) {
      const snapshot = await device.evaluate(() => ({
        turn: document.querySelector('.pk-turn-status')?.textContent,
        prompt: document.querySelector('.pk-prompt-card, .pk-prompt-wait, .pk-final-say')?.textContent?.slice(0, 500),
        enabled: [...document.querySelectorAll('button:not(:disabled)')].map((button) => button.textContent.trim().replace(/\s+/g, ' ').slice(0, 70)).slice(0, 24),
      }));
      throw new Error(`FAIL: Politik UI full game stalled: ${JSON.stringify(snapshot)}`);
    }
    // Production CPUs deliberately pause between every visible action and each
    // Clash timing window. Some legal seeds need well over 60 turns to secure
    // three Regions, so this gate guards a true runaway rather than imposing a
    // speed target on an intentionally paced shared-table game.
    if (Date.now() - gameStarted > 25 * 60_000) throw new Error('FAIL: Politik UI full game exceeded 25 minutes');
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  check(await device.$eval('.pk-end-screen', (element) => /NEW WORLD ORDER/.test(element.textContent)), `full live game reached its winner screen through ${uiActions} device actions`);
  await device.screenshot({ path: path.join(OUT, 'politik-device-winner-1024x768.png') });
  await board.screenshot({ path: path.join(OUT, 'politik-tv-winner-1024x768.png') });

  check(deviceErrors.length === 0, deviceErrors.length ? deviceErrors.join('\n') : 'device has no page, console, request, or HTTP errors');
  check(boardErrors.length === 0, boardErrors.length ? boardErrors.join('\n') : 'TV has no page, console, request, or HTTP errors');
  console.log(`POLITIK UI SMOKE PASS - room ${roomId}`);
  console.log(`SCREENSHOTS=${path.join(OUT, 'politik-setup-card-zoom-1024x768.png')};${path.join(OUT, 'politik-device-card-zoom-1024x768.png')};${path.join(OUT, 'politik-device-personal-1024x768.png')};${path.join(OUT, 'politik-device-main-1024x768.png')};${path.join(OUT, 'politik-tv-1280x800.png')};${path.join(OUT, 'politik-tv-1024x768.png')};${path.join(OUT, 'politik-device-winner-1024x768.png')}`);
} finally {
  await browser.close();
  if (setupRoomId) await fetch(`${BASE}/api/saves/${setupRoomId}`, { method: 'DELETE' }).catch(() => undefined);
  await fetch(`${BASE}/api/saves/${roomId}`, { method: 'DELETE' }).catch(() => undefined);
}
