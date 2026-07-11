// Runtime coverage and directed FAQ regressions for the complete project deck.
// Run: npx tsx shared/src/seti/project-runtime-test.ts

import {
  SETI_PROJECT_CATALOG,
  SETI_PROJECT_CATALOG_BY_ID,
  type SetiCountMetric,
  type SetiProjectOp,
  type SetiProjectPredicate,
  type SetiProjectTrigger,
} from './projectCatalog.js';
import {
  SETI_PROJECT_METRIC_SUPPORT,
  SETI_PROJECT_OP_SUPPORT,
  SETI_PROJECT_PREDICATE_SUPPORT,
  SETI_PROJECT_TRIGGER_SUPPORT,
  emptySetiProjectTurnFacts,
  evaluateSetiProjectPredicate,
  setiProjectRuntime,
  type SetiProjectRuntimeState,
} from './projectRuntime.js';
import {
  beginSetiProjectResolution,
  queueSetiProjectTrigger,
  resolveSetiProjectPending,
  setiProjectOnPlayOperations,
  type SetiProjectExecutorAdapter,
} from './projectExecutor.js';
import { createSeti, drawSetiProjectCard, type SetiPendingDecision, type SetiState } from './state.js';
import { SETI_SEATS } from './data.js';

let passed = 0;
let failed = 0;
function ok(condition: unknown, message: string): asserts condition {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

function equal<T>(actual: T, expected: T, message: string): void {
  ok(Object.is(actual, expected), `${message} (got ${String(actual)}, expected ${String(expected)})`);
}

const opKinds = new Set<SetiProjectOp['kind']>();
const predicateKinds = new Set<SetiProjectPredicate['kind']>();
const metricKinds = new Set<SetiCountMetric['kind']>();
const triggerKinds = new Set<SetiProjectTrigger['kind']>();

function visitPredicate(predicate: SetiProjectPredicate): void {
  predicateKinds.add(predicate.kind);
}

function visitOp(op: SetiProjectOp): void {
  opKinds.add(op.kind);
  if (op.kind === 'gain-per') metricKinds.add(op.metric.kind);
  if (op.kind === 'if') {
    visitPredicate(op.condition);
    op.then.forEach(visitOp);
  }
  if (op.kind === 'install-pluto') {
    op.orbitReward.forEach(visitOp);
    op.landReward.forEach(visitOp);
  }
}

for (const card of SETI_PROJECT_CATALOG) {
  card.requirements.forEach(visitPredicate);
  for (const effect of card.effects) {
    if ('condition' in effect && effect.condition) visitPredicate(effect.condition);
    if (effect.timing === 'triggerable-mission') {
      for (const slot of effect.slots) {
        triggerKinds.add(slot.trigger.kind);
        slot.operations.forEach(visitOp);
      }
    } else effect.operations.forEach(visitOp);
  }
}

for (const kind of opKinds) ok(SETI_PROJECT_OP_SUPPORT[kind], `catalog operation ${kind} has a runtime`);
for (const kind of predicateKinds) ok(SETI_PROJECT_PREDICATE_SUPPORT[kind], `catalog predicate ${kind} has a runtime`);
for (const kind of metricKinds) ok(SETI_PROJECT_METRIC_SUPPORT[kind], `catalog metric ${kind} has a runtime`);
for (const kind of triggerKinds) ok(SETI_PROJECT_TRIGGER_SUPPORT[kind], `catalog trigger ${kind} has a runtime`);
equal(Object.keys(SETI_PROJECT_OP_SUPPORT).length, 24, 'all 24 typed operation variants are explicitly supported');
equal(Object.keys(SETI_PROJECT_PREDICATE_SUPPORT).length, 22, 'all 22 typed predicate variants are explicitly supported');
equal(Object.keys(SETI_PROJECT_METRIC_SUPPORT).length, 12, 'all 12 typed count metrics are explicitly supported');
equal(Object.keys(SETI_PROJECT_TRIGGER_SUPPORT).length, 15, 'all 15 typed trigger variants are explicitly supported');
equal(SETI_PROJECT_CATALOG.length, 140, 'runtime is backed by all 138 base cards and both promos');

function attachRuntime(s: SetiState): void {
  (s as SetiState & { projectRuntime: SetiProjectRuntimeState }).projectRuntime = {
    nextResolutionId: 1,
    resolution: null,
    resolvingCard: null,
    revision: 1,
    conditionalOfferRevision: {},
    turn: emptySetiProjectTurnFacts(s.activeSeat),
    pluto: { installedBy: null, cardId: null, orbiters: [], landers: [] },
  };
  for (const player of s.players) Object.assign(player, { missionClaims: {}, permanentCards: [] });
}

// Living FAQ Q29: a single emitted effect offers one global slot even when
// several mission cards are eligible; separately emitted effects get separate
// choices.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 911);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  player.missions = ['seti_project_204400', 'seti_project_204558']; // Lunar Gateway + Johnson Space Center
  queueSetiProjectTrigger(s, player, { kind: 'orbit', body: 'Mars' });
  equal(s.pending.length, 1, 'one orbit effect creates one global mission-slot decision');
  ok(s.pending[0].kind === 'manual-trigger-choice' && s.pending[0].options.filter((option) => option.startsWith('claim|')).length === 3, 'global choice contains every eligible slot but permits one claim');
  queueSetiProjectTrigger(s, player, { kind: 'orbit', body: 'Mars' });
  equal(s.pending.length, 2, 'a separately emitted orbit effect creates a separate mission choice');
}

function testAdapter(onFinish: (s: SetiState) => void): SetiProjectExecutorAdapter {
  return {
    drawIntoHand(s, player, amount) {
      const drawn: string[] = [];
      for (let index = 0; index < amount; index++) {
        const card = drawSetiProjectCard(s);
        if (card) { player.hand.push(card); drawn.push(card); }
      }
      return drawn;
    },
    launchProbe: () => null,
    moveProbeFree: () => null,
    landProbeFree: () => null,
    markSignal: () => undefined,
    placeTrace: () => null,
    acquireTechnology: () => null,
    applyKnownRewards: () => undefined,
    emit: () => undefined,
    afterResolution: onFinish,
  };
}

function conditionalEffect(cardId: string) {
  const effect = SETI_PROJECT_CATALOG_BY_ID[cardId].effects.find((candidate) => candidate.timing === 'conditional-mission');
  if (!effect || effect.timing !== 'conditional-mission') throw new Error(`${cardId} has no conditional mission`);
  return effect;
}

// Living FAQ (2025-11-11): the complete main effect resolves before the
// played mission enters the active mission area.  NIAC therefore draws three
// cards before its empty-hand condition can be checked.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 912);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  const cardId = 'seti_project_204612';
  player.hand = [];
  let activeWhileDrawing = false;
  const base = testAdapter((state) => {
    const resolving = setiProjectRuntime(state).resolvingCard!;
    player.missions.push(resolving.cardId);
    setiProjectRuntime(state).resolvingCard = null;
  });
  const adapter: SetiProjectExecutorAdapter = {
    ...base,
    drawIntoHand(state, owner, amount) {
      activeWhileDrawing ||= owner.missions.includes(cardId);
      return base.drawIntoHand(state, owner, amount);
    },
  };
  setiProjectRuntime(s).resolvingCard = { owner: player.seat, cardId, destination: 'mission', playEvent: { kind: 'play-project', printedCost: 3, sourceCardId: 204612 }, relocated: false };
  beginSetiProjectResolution(s, player, cardId, 'on-play', setiProjectOnPlayOperations(cardId), adapter);
  equal(activeWhileDrawing, false, '#89 is not active while its draw-three main effect resolves');
  equal(player.hand.length, 3, '#89 draws all three cards before mission placement');
  ok(player.missions.includes(cardId), '#89 enters the active mission area after its main effect');
  equal(evaluateSetiProjectPredicate(s, player, conditionalEffect(cardId).condition), false, '#89 empty-hand condition is checked against the post-draw hand');
}

// #51 follows the same rule even though its Scan main effect pauses for two
// physical sector choices.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 913);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  const cardId = 'seti_project_204567';
  player.publicity = 8;
  const adapter = testAdapter((state) => {
    const resolving = setiProjectRuntime(state).resolvingCard!;
    player.missions.push(resolving.cardId);
    setiProjectRuntime(state).resolvingCard = null;
  });
  setiProjectRuntime(s).resolvingCard = { owner: player.seat, cardId, destination: 'mission', playEvent: { kind: 'play-project', printedCost: 3, sourceCardId: 204567 }, relocated: false };
  beginSetiProjectResolution(s, player, cardId, 'on-play', setiProjectOnPlayOperations(cardId), adapter);
  ok(setiProjectRuntime(s).resolution !== null && !player.missions.includes(cardId), '#51 remains outside the mission area while Scan is waiting');
  const earth = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  let result = resolveSetiProjectPending(s, player, earth, { kind: 'sector', sectorId: earth.options[0] }, adapter);
  ok(result?.ok, '#51 Earth scan signal resolves');
  const rowDecision = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  const row = rowDecision.rowOptions![0];
  const rowCard = SETI_PROJECT_CATALOG_BY_ID[s.projectRow[row]!]!;
  const matching = rowDecision.options.find((sector) => {
    const names: Record<string, string[]> = {
      red: ['proxima_centauri', 'barnards_star'], yellow: ['kepler_22', '61_virginis'], blue: ['sirius_a', 'procyon'], black: ['vega', 'beta_pictoris'],
    };
    return names[rowCard.signalColor].some((needle) => sector.includes(needle));
  }) ?? rowDecision.options[0];
  result = resolveSetiProjectPending(s, player, rowDecision, { kind: 'sector', sectorId: matching, row }, adapter);
  ok(result?.ok, '#51 project-row scan signal resolves with its authentic color');
  ok(player.missions.includes(cardId) && setiProjectRuntime(s).resolution === null, '#51 becomes active only after both Scan signals finish');
  equal(evaluateSetiProjectPredicate(s, player, conditionalEffect(cardId).condition), true, '#51 condition is evaluated after its complete main effect');
}

if (failed) {
  console.error(`SETI project runtime coverage: ${passed} passed, ${failed} failed`);
  process.exitCode = 1;
} else console.log(`SETI project runtime coverage: ${passed} passed, 0 failed`);
