// SETI rare-state visual ship gate.
//
// A complete deterministic two-player engine game supplies authentic public
// views for automatic states that are intentionally awkward to force through
// the short DOM action gate: a rotation bump, round income, neutral and gold
// milestones, both species reveals, and final scoring. The snapshots are then
// rendered by the real Vite SetiBoard and SetiPlay components at their ship
// viewports. Device renders use the private view of the seat that can act on
// the captured state (pending owner first, otherwise the active seat).
//
// Usage:
//   npx tsx tools/verify/seti-rare-visual-smoke.ts [base-url]


import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import {
  SETI_SEATS,
  applySetiAction,
  chooseSetiBotAction,
  createSeti,
  setiViewFor,
  type SetiView,
} from '../../shared/src/index.ts';

const BASE = process.argv[2] ?? 'http://localhost:5273';
const TV_VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 1 };
const DEVICE_VIEWPORT = { width: 1024, height: 768, deviceScaleFactor: 1 };
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const qaRoot = fileURLToPath(new URL('../../tmp/QA/', import.meta.url));
const outDir = path.join(qaRoot, `seti-rare-visual-${runStamp}`);
const REQUIRED = [
  'rotation-bump',
  'round-income',
  'neutral-milestone',
  'gold-milestone',
  'species-one',
  'species-two',
  'final-scoring',
] as const;
type SnapshotKind = typeof REQUIRED[number];
type Surface = 'tv' | 'device';
type Snapshot = {
  kind: SnapshotKind;
  action: number;
  publicView: SetiView;
  privateView: SetiView;
  privateSeat: number;
  detail: unknown;
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const snapshots = new Map<SnapshotKind, Snapshot>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function privateSeatFor(state: Parameters<typeof setiViewFor>[0]): number {
  const pendingOwner = state.pending[0]?.owner ?? state.deferredEndRoundCard?.owner;
  if (pendingOwner !== undefined && pendingOwner >= 0 && state.players[pendingOwner]) return pendingOwner;
  return state.players[state.activeSeat] ? state.activeSeat : 0;
}

function remember(kind: SnapshotKind, state: Parameters<typeof setiViewFor>[0], action: number, detail: unknown): void {
  if (snapshots.has(kind)) return;
  const privateSeat = privateSeatFor(state);
  snapshots.set(kind, {
    kind,
    action,
    publicView: clone(setiViewFor(state, null)),
    privateView: clone(setiViewFor(state, privateSeat)),
    privateSeat,
    detail: clone(detail),
  });
}

const state = createSeti(
  SETI_SEATS.slice(0, 2).map((color, seat) => ({ name: `RARE ${seat + 1}`, color })),
  1,
);
let actions = 0;
while (state.phase !== 'ended' && actions < 2_000) {
  const owner = state.pending[0]?.owner ?? state.deferredEndRoundCard?.owner ?? state.activeSeat;
  const action = chooseSetiBotAction(state, owner);
  if (!action) throw new Error(`SETI rare-state driver had no action for seat ${owner}`);

  const beforeRound = state.round;
  const beforeOrientations = clone(state.solar.orientations);
  const beforePieces = clone(state.solar.pieces.map((piece) => ({ id: piece.id, cell: piece.cell, supportLayer: piece.supportLayer })));
  const beforeNeutral = clone(state.neutralMilestonesRemaining);
  const beforeGold = state.players.map((player) => player.goldClaims.length);
  const beforeSpecies = state.species.map((slot) => slot.revealed);

  const result = applySetiAction(state, owner, action);
  if (!result.ok) throw new Error(`SETI rare-state action ${action.type} failed: ${result.error}`);
  actions++;

  const afterPieces = state.solar.pieces.map((piece) => ({ id: piece.id, cell: piece.cell, supportLayer: piece.supportLayer }));
  if (JSON.stringify(beforeOrientations) !== JSON.stringify(state.solar.orientations)
    && JSON.stringify(beforePieces) !== JSON.stringify(afterPieces)) {
    remember('rotation-bump', state, actions, {
      event: state.lastEvent,
      beforeOrientations,
      afterOrientations: state.solar.orientations,
      beforePieces,
      afterPieces,
    });
  }
  if (state.round !== beforeRound) {
    remember('round-income', state, actions, {
      fromRound: beforeRound,
      toRound: state.round,
      event: state.lastEvent,
      incomes: state.players.map((player) => ({
        seat: player.seat,
        credits: player.credits,
        energy: player.energy,
        hand: player.hand.length,
      })),
    });
  }
  if (JSON.stringify(beforeNeutral) !== JSON.stringify(state.neutralMilestonesRemaining)) {
    remember('neutral-milestone', state, actions, {
      before: beforeNeutral,
      after: state.neutralMilestonesRemaining,
      event: state.lastEvent,
    });
  }
  if (beforeGold.some((count, seat) => state.players[seat].goldClaims.length !== count)) {
    remember('gold-milestone', state, actions, {
      before: beforeGold,
      after: state.players.map((player) => player.goldClaims),
      event: state.lastEvent,
    });
  }
  for (let slot = 0; slot < 2; slot++) {
    if (!beforeSpecies[slot] && state.species[slot].revealed) {
      remember(slot === 0 ? 'species-one' : 'species-two', state, actions, {
        slot,
        speciesId: state.species[slot].speciesId,
        event: state.lastEvent,
      });
    }
  }
}
if (state.phase !== 'ended') throw new Error(`SETI rare-state driver exceeded ${actions} actions`);
remember('final-scoring', state, actions, {
  winners: state.winners,
  scores: state.players.map((player) => player.finalScoreBreakdown),
  event: state.lastEvent,
});

const missingSnapshots = REQUIRED.filter((kind) => !snapshots.has(kind));
if (missingSnapshots.length) throw new Error(`SETI rare-state simulation missed: ${missingSnapshots.join(', ')}`);

await mkdir(outDir, { recursive: true });
const report: {
  gate: string;
  seed: number;
  engineActions: number;
  viewports: { tv: typeof TV_VIEWPORT; device: typeof DEVICE_VIEWPORT };
  screenshots: Array<{
    kind: SnapshotKind;
    surface: Surface;
    file: string;
    action: number;
    privateSeat: number;
    detail: unknown;
    metrics: unknown;
  }>;
  browserErrors: string[];
  failures: string[];
  passed?: boolean;
} = {
  gate: 'SETI rare-state visual smoke',
  seed: 1,
  engineActions: actions,
  viewports: { tv: TV_VIEWPORT, device: DEVICE_VIEWPORT },
  screenshots: [],
  browserErrors: [],
  failures: [],
};

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
});

try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') report.browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => report.browserErrors.push(`pageerror: ${error.message}`));
  page.on('error', (error) => report.browserErrors.push(`renderer: ${error.message}`));
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
      report.browserErrors.push(`request: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`);
    }
  });
  await page.setViewport(TV_VIEWPORT);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="seti-fixture-root"></div>';
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOMClient from '/node_modules/.vite/deps/react-dom_client.js';
      import { SetiBoard } from '/src/seti/SetiBoard.tsx';
      import { SetiPlay } from '/src/seti/SetiPlay.tsx';
      const fixtureRoot = ReactDOMClient.createRoot(document.getElementById('seti-fixture-root'));
      window.__renderSetiFixture = (surface, view) => {
        const Component = surface === 'tv' ? SetiBoard : SetiPlay;
        const props = surface === 'tv' ? { view } : { view, act: () => undefined };
        fixtureRoot.render(React.createElement(Component, props));
      };
      window.__setiFixtureReady = true;
    `;
    document.body.appendChild(script);
  });
  await page.waitForFunction(() => (window as unknown as { __setiFixtureReady?: boolean }).__setiFixtureReady === true, { timeout: 30_000 });

  for (const kind of REQUIRED) {
    const snapshot = snapshots.get(kind)!;

    await page.setViewport(TV_VIEWPORT);
    await page.evaluate((view) => {
      (window as unknown as { __renderSetiFixture: (surface: Surface, next: unknown) => void }).__renderSetiFixture('tv', view);
    }, snapshot.publicView);
    await page.waitForSelector('[data-testid="seti-tv-root"] [data-testid="seti-table"]', { timeout: 30_000 });
    await sleep(650);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), { timeout: 30_000 });

    const tvMetrics = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-testid="seti-tv-root"]');
      const rect = root?.getBoundingClientRect();
      return {
        root: Boolean(root),
        rootBounds: rect ? {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        } : null,
        table: Boolean(document.querySelector('[data-testid="seti-table"]')),
        stage: Boolean(document.querySelector('[data-testid="seti-board-stage"]')),
        starfield: Boolean(document.querySelector('.seti-starfield')),
        scoreChips: document.querySelectorAll('.seti-score-chip').length,
        revealedSpecies: document.querySelectorAll('.seti-alien-board.is-revealed').length,
        finalTransmission: /FINAL TRANSMISSION/i.test(document.querySelector('.seti-round-readout')?.textContent ?? ''),
        viewport: { width: innerWidth, height: innerHeight },
        document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        scroll: { x: scrollX, y: scrollY },
        badImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src),
      };
    });
    if (!tvMetrics.root || !tvMetrics.table || !tvMetrics.stage || !tvMetrics.starfield) report.failures.push(`${kind}/tv: core TV surface missing`);
    if (tvMetrics.scoreChips !== 2) report.failures.push(`${kind}/tv: expected 2 score chips, got ${tvMetrics.scoreChips}`);
    if (tvMetrics.viewport.width !== TV_VIEWPORT.width || tvMetrics.viewport.height !== TV_VIEWPORT.height) {
      report.failures.push(`${kind}/tv: expected ${TV_VIEWPORT.width}x${TV_VIEWPORT.height}, got ${tvMetrics.viewport.width}x${tvMetrics.viewport.height}`);
    }
    if (tvMetrics.document.width > tvMetrics.viewport.width + 1 || tvMetrics.document.height > tvMetrics.viewport.height + 1
      || tvMetrics.scroll.x !== 0 || tvMetrics.scroll.y !== 0) {
      report.failures.push(`${kind}/tv: viewport scrolled or overflowed ${JSON.stringify(tvMetrics)}`);
    }
    if (tvMetrics.badImages.length) report.failures.push(`${kind}/tv: ${tvMetrics.badImages.length} broken images`);
    if (kind === 'species-one' && tvMetrics.revealedSpecies < 1) report.failures.push('species-one/tv: first board did not reveal');
    if ((kind === 'species-two' || kind === 'final-scoring') && tvMetrics.revealedSpecies < 2) report.failures.push(`${kind}/tv: both alien boards did not reveal`);
    if (kind === 'final-scoring' && !tvMetrics.finalTransmission) report.failures.push('final-scoring/tv: final transmission state missing');

    const tvFilename = `${String(report.screenshots.length + 1).padStart(2, '0')}-${kind}-tv.png`;
    const tvTarget = path.join(outDir, tvFilename);
    await page.screenshot({ path: tvTarget, fullPage: false });
    report.screenshots.push({
      kind,
      surface: 'tv',
      file: tvTarget,
      action: snapshot.action,
      privateSeat: snapshot.privateSeat,
      detail: snapshot.detail,
      metrics: tvMetrics,
    });

    const privatePlayer = snapshot.privateView.players.find((player) => player.seat === snapshot.privateSeat);
    if (!privatePlayer) throw new Error(`${kind}: private seat ${snapshot.privateSeat} was not in its own view`);
    const expectedHandCards = (privatePlayer.hand?.length ?? 0)
      + (privatePlayer.alienHand?.length ?? 0)
      + (privatePlayer.hiddenExertian?.length ?? 0);
    const expectedTurnLabel = snapshot.privateView.phase === 'ended'
      ? 'MISSION COMPLETE'
      : snapshot.privateView.pending
        && (snapshot.privateView.pending.owner < 0 || snapshot.privateView.pending.owner === snapshot.privateSeat)
        ? 'YOUR DECISION'
        : snapshot.privateView.activeSeat === snapshot.privateSeat
          ? 'YOUR TURN'
          : `${snapshot.privateView.players.find((player) => player.seat === snapshot.privateView.activeSeat)?.name ?? 'AGENCY'} OPERATING`;

    await page.setViewport(DEVICE_VIEWPORT);
    await page.evaluate((view) => {
      (window as unknown as { __renderSetiFixture: (surface: Surface, next: unknown) => void }).__renderSetiFixture('device', view);
    }, snapshot.privateView);
    await page.waitForSelector('[data-testid="seti-device-root"] .seti-personal-board-wrap', { timeout: 30_000 });
    await page.waitForSelector('[data-testid="seti-device-root"] .seti-hand-rail', { timeout: 30_000 });
    await sleep(650);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), { timeout: 30_000 });

    const deviceMetrics = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-testid="seti-device-root"]');
      const rect = root?.getBoundingClientRect();
      const touchTargets = [...new Set([
        ...document.querySelectorAll<HTMLElement>('[data-testid="seti-device-root"] button:not(:disabled)'),
        ...document.querySelectorAll<HTMLElement>('[data-testid="seti-device-root"] [data-seti-target]'),
      ])].filter((element) => {
        for (let current: HTMLElement | null = element; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (current.hidden || current.getAttribute('aria-hidden') === 'true'
            || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
          if (current === root) break;
        }
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0
          && bounds.right > 0 && bounds.bottom > 0 && bounds.left < innerWidth && bounds.top < innerHeight;
      });
      const smallTargets = touchTargets.flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.width >= 39.5 && bounds.height >= 39.5) return [];
        return [{
          label: element.getAttribute('aria-label')
            ?? element.getAttribute('data-testid')
            ?? element.getAttribute('data-seti-target')
            ?? element.className,
          width: Math.round(bounds.width * 10) / 10,
          height: Math.round(bounds.height * 10) / 10,
        }];
      });
      return {
        root: Boolean(root),
        rootBounds: rect ? {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        } : null,
        rootOverflow: root ? getComputedStyle(root).overflow : null,
        personalBoard: Boolean(root?.querySelector('.seti-personal-board-wrap')),
        handRail: Boolean(root?.querySelector('.seti-hand-rail')),
        starfield: Boolean(root?.querySelector('.seti-starfield')),
        agencyName: root?.querySelector('.seti-device-agency b')?.textContent?.trim() ?? '',
        handCards: root?.querySelectorAll('.seti-hand-card').length ?? 0,
        turnLabel: root?.querySelector('.seti-turn-line b')?.textContent?.trim() ?? '',
        productionError: root?.querySelector('.seti-error')?.textContent?.trim() ?? '',
        touchTargets: touchTargets.length,
        minimumTouchTarget: 40,
        smallTargets,
        viewport: { width: innerWidth, height: innerHeight },
        document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        scroll: { x: scrollX, y: scrollY },
        badImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src),
      };
    });
    if (!deviceMetrics.root || !deviceMetrics.personalBoard || !deviceMetrics.handRail || !deviceMetrics.starfield) {
      report.failures.push(`${kind}/device: core private device surface missing`);
    }
    if (snapshot.privateView.you !== snapshot.privateSeat || deviceMetrics.agencyName !== privatePlayer.name) {
      report.failures.push(`${kind}/device: expected private seat ${snapshot.privateSeat} (${privatePlayer.name}), got view seat ${snapshot.privateView.you} and UI agency ${deviceMetrics.agencyName}`);
    }
    if (deviceMetrics.handCards !== expectedHandCards) {
      report.failures.push(`${kind}/device: expected ${expectedHandCards} private hand cards, got ${deviceMetrics.handCards}`);
    }
    if (deviceMetrics.turnLabel !== expectedTurnLabel) {
      report.failures.push(`${kind}/device: expected turn label ${expectedTurnLabel}, got ${deviceMetrics.turnLabel}`);
    }
    if (deviceMetrics.viewport.width !== DEVICE_VIEWPORT.width || deviceMetrics.viewport.height !== DEVICE_VIEWPORT.height) {
      report.failures.push(`${kind}/device: expected ${DEVICE_VIEWPORT.width}x${DEVICE_VIEWPORT.height}, got ${deviceMetrics.viewport.width}x${deviceMetrics.viewport.height}`);
    }
    if (!deviceMetrics.rootBounds || Math.abs(deviceMetrics.rootBounds.left) > 1 || Math.abs(deviceMetrics.rootBounds.top) > 1
      || Math.abs(deviceMetrics.rootBounds.right - DEVICE_VIEWPORT.width) > 1
      || Math.abs(deviceMetrics.rootBounds.bottom - DEVICE_VIEWPORT.height) > 1) {
      report.failures.push(`${kind}/device: root did not fill viewport ${JSON.stringify(deviceMetrics.rootBounds)}`);
    }
    if (deviceMetrics.document.width > deviceMetrics.viewport.width + 1 || deviceMetrics.document.height > deviceMetrics.viewport.height + 1
      || deviceMetrics.scroll.x !== 0 || deviceMetrics.scroll.y !== 0) {
      report.failures.push(`${kind}/device: viewport scrolled or overflowed ${JSON.stringify(deviceMetrics)}`);
    }
    if (deviceMetrics.badImages.length) report.failures.push(`${kind}/device: ${deviceMetrics.badImages.length} broken images`);
    if (deviceMetrics.productionError) report.failures.push(`${kind}/device: production error visible: ${deviceMetrics.productionError}`);
    if (deviceMetrics.touchTargets === 0) report.failures.push(`${kind}/device: no visible touch targets`);
    if (deviceMetrics.smallTargets.length) {
      report.failures.push(`${kind}/device: ${deviceMetrics.smallTargets.length} visible touch targets below 40px ${JSON.stringify(deviceMetrics.smallTargets)}`);
    }
    if (kind === 'final-scoring' && deviceMetrics.turnLabel !== 'MISSION COMPLETE') {
      report.failures.push('final-scoring/device: mission-complete state missing');
    }

    const deviceFilename = `${String(report.screenshots.length + 1).padStart(2, '0')}-${kind}-device.png`;
    const deviceTarget = path.join(outDir, deviceFilename);
    await page.screenshot({ path: deviceTarget, fullPage: false });
    report.screenshots.push({
      kind,
      surface: 'device',
      file: deviceTarget,
      action: snapshot.action,
      privateSeat: snapshot.privateSeat,
      detail: snapshot.detail,
      metrics: deviceMetrics,
    });
  }
} finally {
  await browser.close();
}

report.failures.push(...report.browserErrors);
report.passed = report.failures.length === 0;
const reportPath = path.join(outDir, 'report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`SETI rare-state visual report: ${reportPath}`);
if (!report.passed) throw new Error(`SETI rare-state visual smoke failed: ${report.failures.join(' | ')}`);
console.log(`SETI RARE-STATE VISUAL PASS - ${report.screenshots.length} screenshots, ${actions} deterministic engine actions`);
