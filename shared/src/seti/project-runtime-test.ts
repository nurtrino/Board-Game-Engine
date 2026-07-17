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
  countSetiProjectMetric,
  emptySetiProjectContext,
  getSetiTriggerableProjectSlots,
  type SetiProjectRuntimeState,
} from './projectRuntime.js';
import {
  beginSetiProjectResolution,
  queueSetiProjectTrigger,
  resolveSetiProjectPending,
  setiProjectOnPlayOperations,
  resolveSetiProjectManualTrigger,
  type SetiProjectExecutorAdapter,
} from './projectExecutor.js';
import {
  assertSetiState,
  createSeti,
  drawSetiProjectCard,
  earthSetiCell,
  getSetiBodyCells,
  getSetiSolarFeatures,
  placeSetiSpacecraft,
  setiFirstLandingSpaceId,
  setiFirstOrbitSpaceAvailable,
  setiFirstOrbitSpaceId,
  setiMoonLandingSpaceId,
  setiProjectCardTotal,
  setiSupportLayerForCell,
  type SetiPendingDecision,
  type SetiState,
} from './state.js';
import { applySetiAction, chooseSetiBotAction } from './actions.js';
import { SETI_SEATS, SETI_TECH_STACKS, adjacentSetiCells, parseSetiCell, setiCellId } from './data.js';
import { SETI_ALIEN_CARDS } from './alienCatalog.js';

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
    resolutionStack: [],
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

function drainWithBot(s: SetiState, maximum = 400): string | null {
  for (let guard = 0; s.pending.length && guard < maximum; guard++) {
    const owner = s.pending[0].owner;
    const action = chooseSetiBotAction(s, owner);
    if (!action) return `no bot choice for ${s.pending[0].kind}`;
    const result = applySetiAction(s, owner, action);
    if (!result.ok) return `${s.pending[0]?.kind ?? action.type}: ${result.error}`;
  }
  return s.pending.length ? `queue exceeded ${maximum} choices` : null;
}

function extractProjectCard(s: SetiState, cardId: string): boolean {
  const simpleZones = [s.projectDeck, s.projectDiscard, ...s.roundEndStacks];
  for (const zone of simpleZones) {
    const index = zone.indexOf(cardId);
    if (index >= 0) { zone.splice(index, 1); return true; }
  }
  const row = s.projectRow.indexOf(cardId);
  if (row >= 0) { s.projectRow[row] = null; return true; }
  for (const player of s.players) {
    for (const zone of [player.hand, player.missions, player.completedMissions, player.scoringCards, player.permanentCards]) {
      const index = zone.indexOf(cardId);
      if (index >= 0) { zone.splice(index, 1); return true; }
    }
    const income = player.incomeCards.findIndex((card) => card.cardId === cardId);
    if (income >= 0) { player.incomeCards.splice(income, 1); return true; }
  }
  return false;
}

// Every catalog card must enter the real reducer, execute its ordered main
// effect, and drain all visual decisions without an unsupported-op escape.
for (const [index, card] of SETI_PROJECT_CATALOG.entries()) {
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, seat) => ({ name: `P${seat}`, color })), 2000 + index, { promoCards: true });
  const setupFailure = drainWithBot(s);
  ok(!setupFailure, `${card.canonicalName}: setup choices drain (${setupFailure ?? 'ok'})`);
  if (setupFailure) continue;
  const player = s.players[s.activeSeat];
  ok(extractProjectCard(s, card.id), `${card.canonicalName}: catalog card exists in physical setup`);
  player.hand.push(card.id);
  player.credits = 99;
  player.energy = 99;
  player.publicity = 10;
  const mars = getSetiBodyCells(s).Mars ?? earthSetiCell(s);
  s.solar.pieces.push({ id: `seti_runtime_probe_${index}`, owner: player.seat, kind: 'probe', cell: mars, supportLayer: setiSupportLayerForCell(s, mars) });
  placeSetiSpacecraft(s, { owner: player.seat, kind: 'orbiter', body: 'Jupiter', coveredReward: null });
  placeSetiSpacecraft(s, { owner: player.seat, kind: 'lander', body: 'Venus', coveredReward: null });
  const played = applySetiAction(s, player.seat, { type: 'play_card', cardId: card.id });
  ok(played.ok, `${card.canonicalName}: play_card enters typed runtime (${played.error ?? 'accepted'})`);
  if (!played.ok) continue;
  const resolutionFailure = drainWithBot(s);
  ok(!resolutionFailure, `${card.canonicalName}: visual effect queue drains (${resolutionFailure ?? 'ok'})`);
  equal(setiProjectRuntime(s).resolution, null, `${card.canonicalName}: no project resolution is stranded`);
  equal(setiProjectCardTotal(s), 140, `${card.canonicalName}: project conservation survives execution`);
  if (!resolutionFailure) assertSetiState(s);
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
    prepareResearch: () => undefined,
    acquireTechnology: () => null,
    signalCorner: (_player, cardId) => SETI_PROJECT_CATALOG_BY_ID[cardId]?.signalColor ?? null,
    discardHandCardForSignal: () => ({ error: null, signalHandled: false }),
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
  setiProjectRuntime(s).resolvingCard = { owner: player.seat, cardId, destination: 'mission', playEvent: { kind: 'play-project', printedCost: 2, sourceCardId: 204612 }, relocated: false };
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
  const start = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> & { resolutionId: number };
  let result = resolveSetiProjectPending(s, player, start, { kind: 'option', option: 'earth' }, adapter);
  ok(result?.ok, '#51 lets the player select Earth as the first Scan element');
  const earth = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  result = resolveSetiProjectPending(s, player, earth, { kind: 'sector', sectorId: earth.options[0] }, adapter);
  ok(result?.ok, '#51 Earth scan signal resolves');
  const next = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> & { resolutionId: number };
  result = resolveSetiProjectPending(s, player, next, { kind: 'option', option: 'project-row' }, adapter);
  ok(result?.ok, '#51 lets the player select the project row as the next Scan element');
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
  const finish = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> & { resolutionId: number };
  result = resolveSetiProjectPending(s, player, finish, { kind: 'option', option: 'done' }, adapter);
  ok(result?.ok, '#51 Scan finishes only after both mandatory elements');
  ok(player.missions.includes(cardId) && setiProjectRuntime(s).resolution === null, '#51 becomes active only after both Scan signals finish');
  equal(evaluateSetiProjectPredicate(s, player, conditionalEffect(cardId).condition), true, '#51 condition is evaluated after its complete main effect');
}

// Ordinary alien cards follow the rules for cards in hand and cards tucked
// for income. Exertians are the sole exception (rulebook p.20; FAQ #89).
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 914);
  attachRuntime(s);
  const player = s.players[0];
  const ordinary = SETI_ALIEN_CARDS.find((card) => card.species !== 'exertians'
    && card.incomeCorner === 'energy'
    && card.freeCorner.some((reward) => reward.kind === 'gain' && reward.resource === 'movement'))!;
  const exertian = SETI_ALIEN_CARDS.find((card) => card.species === 'exertians')!;
  player.hand = [];
  player.alienHand = [ordinary.id];
  ok(!evaluateSetiProjectPredicate(s, player, { kind: 'hand-size', equals: 0, exertianCardsAreNotHand: true }), '#89 counts an ordinary alien card in hand');
  equal(countSetiProjectMetric(s, player, { kind: 'hand-cards', income: 'energy' }), 1, 'project hand-income metrics count alien cards');
  equal(countSetiProjectMetric(s, player, { kind: 'hand-cards', freeCorner: 'move' }), 1, '#74 counts an alien movement corner');
  player.alienHand = [exertian.id];
  ok(evaluateSetiProjectPredicate(s, player, { kind: 'hand-size', equals: 0, exertianCardsAreNotHand: true }), '#89 excludes Exertians from the hand');
  player.alienHand = [];
  player.alienIncomeCards.push({ cardId: ordinary.id, kind: 'energy' });
  equal(countSetiProjectMetric(s, player, { kind: 'tucked-income-cards', income: 'energy' }), 1, '#91 counts alien cards tucked for matching income');
}

// Perseverance's printed "or any moon" clause is independent of Mars and
// Mercury and therefore accepts a landing on Titan.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 915);
  attachRuntime(s);
  const context = emptySetiProjectContext();
  context.landedBodies.push('Titan');
  ok(evaluateSetiProjectPredicate(s, s.players[0], {
    kind: 'landed-with-this-effect', bodies: ['Mars', 'Mercury'], includeMoons: false, anyMoon: true,
  }, context), '#13 rewards landing on any moon');
}

// Optimal Launch Window counts only other planets/comets in Earth's radial
// sector, never Earth itself.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 916);
  attachRuntime(s);
  const earthSector = parseSetiCell(earthSetiCell(s)).sector;
  const visible = getSetiSolarFeatures(s);
  const includingEarth = visible.filter((feature) => parseSetiCell(feature.cell).sector === earthSector && (feature.kind === 'planet' || feature.kind === 'comet')).length;
  const expected = Math.min(3, visible.filter((feature) => parseSetiCell(feature.cell).sector === earthSector
    && (feature.kind === 'comet' || (feature.kind === 'planet' && feature.body !== 'Earth'))).length);
  equal(countSetiProjectMetric(s, s.players[0], { kind: 'planets-and-comets-in-earth-sector', maximum: 3 }), expected, '#133 excludes Earth from its move count');
  ok(includingEarth >= expected, '#133 comparison includes a distinct Earth feature when visible');
}

// Asteroids Research can trigger from the owner's research/pass rotation, but
// not when another player's turn pushes that probe onto asteroids.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 917);
  attachRuntime(s);
  const player = s.players[0];
  player.missions = ['seti_project_204509'];
  s.activeSeat = 1;
  equal(getSetiTriggerableProjectSlots(s, player, { kind: 'visit-feature', feature: 'asteroid' }).length, 0, '#129 ignores asteroid visits outside its owner turn');
  s.activeSeat = player.seat;
  equal(getSetiTriggerableProjectSlots(s, player, { kind: 'visit-feature', feature: 'asteroid' }).length, 3, '#129 exposes all three spaces on its owner turn');
}

// Rewards triggered by an earlier printed effect resolve before the next
// effect on the card. This is observable here because the parent's final VP
// must remain unapplied while the launch mission choice is waiting.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 918);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  player.missions = ['seti_project_204556']; // ISS
  const startScore = player.score;
  const base = testAdapter(() => undefined);
  const adapter: SetiProjectExecutorAdapter = {
    ...base,
    launchProbe: () => ({ id: 'nested-launch', owner: player.seat, kind: 'probe', cell: earthSetiCell(s), supportLayer: 1 }),
  };
  beginSetiProjectResolution(s, player, 'seti_project_204645', 'on-play', [
    { kind: 'launch', amount: 1, cost: 'free' },
    { kind: 'gain', resource: 'vp', amount: 1 },
  ], adapter);
  equal(player.score, startScore, 'parent card pauses before its later effect');
  equal(setiProjectRuntime(s).resolution, null, 'parent resolution is serializably suspended');
  equal(setiProjectRuntime(s).resolutionStack.length, 1, 'parent resolution is retained on the stack');
  const trigger = s.pending[0] as Extract<SetiPendingDecision, { kind: 'manual-trigger-choice' }>;
  const claim = trigger.options.find((candidate) => candidate.includes('launch-vp'))!;
  const claimed = resolveSetiProjectManualTrigger(s, player, trigger, claim, adapter);
  ok(claimed?.ok, 'nested launch reward resolves');
  equal(player.score, startScore + 6, 'nested 5 VP reward resolves before the parent final 1 VP');
  equal(setiProjectRuntime(s).resolutionStack.length, 0, 'nested resolution stack drains');
}

// Invalid/stale mission choices are atomic: validation occurs before the
// pending queue or claim markers are mutated.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 919);
  attachRuntime(s);
  const player = s.players[0];
  const decision: Extract<SetiPendingDecision, { kind: 'manual-trigger-choice' }> = {
    kind: 'manual-trigger-choice', owner: player.seat, triggerId: 'project-slot:stale', options: ['claim|seti_project_204556|launch-vp', 'skip'],
  };
  s.pending = [decision];
  const result = resolveSetiProjectManualTrigger(s, player, decision, decision.options[0], testAdapter(() => undefined));
  ok(result && !result.ok, 'stale mission claim is rejected');
  equal(s.pending[0], decision, 'stale mission claim leaves the pending decision intact');
  equal(player.missionClaims.seti_project_204556, undefined, 'stale mission claim adds no marker');
}

// Multi-signal telescope cards bind all markers to the one selected probe.
// James Webb additionally marks the two neighboring sectors exactly once.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 920);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  s.solar.pieces.push(
    { id: 'probe-a', owner: player.seat, kind: 'probe', cell: setiCellId(0, 0), supportLayer: 1 },
    { id: 'probe-b', owner: player.seat, kind: 'probe', cell: setiCellId(0, 3), supportLayer: 1 },
  );
  const adapter = testAdapter(() => undefined);
  beginSetiProjectResolution(s, player, 'seti_project_204563', 'on-play', [{
    kind: 'mark-signal', amount: 2, target: { kind: 'own-probe-sector', probeMustBeOnSolarSystem: true }, gainData: true,
  }], adapter);
  const first = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  const selected = first.options[0];
  resolveSetiProjectPending(s, player, first, { kind: 'sector', sectorId: selected }, adapter);
  const second = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }>;
  equal(JSON.stringify(second.options), JSON.stringify([selected]), '#28 locks its second signal to the selected probe sector');
}

{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 921);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  s.solar.pieces.push({ id: 'probe-center', owner: player.seat, kind: 'probe', cell: setiCellId(0, 2), supportLayer: 1 });
  const adapter = testAdapter(() => undefined);
  beginSetiProjectResolution(s, player, 'seti_project_204557', 'on-play', [{
    kind: 'mark-signal', amount: 3, target: { kind: 'own-probe-sector-and-neighbors', probeMustBeOnSolarSystem: true }, gainData: true,
  }], adapter);
  const centerDecision = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  equal(centerDecision.options.length, 1, '#29 initially targets only the sector containing the selected probe');
  const center = centerDecision.options[0];
  resolveSetiProjectPending(s, player, centerDecision, { kind: 'sector', sectorId: center }, adapter);
  const neighbors = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  equal(neighbors.options.length, 2, '#29 exposes exactly the two neighboring sectors after its center signal');
  const left = neighbors.options[0];
  resolveSetiProjectPending(s, player, neighbors, { kind: 'sector', sectorId: left }, adapter);
  const last = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }>;
  equal(last.options.length, 1, '#29 cannot place both neighboring signals in the same sector');
  ok(last.options[0] !== left, '#29 final signal uses the other neighbor');
}

// "Up to 3" permits choosing no probes at all.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 922);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  s.solar.pieces.push({ id: 'other-probe', owner: 1, kind: 'probe', cell: setiCellId(0, 4), supportLayer: 1 });
  beginSetiProjectResolution(s, player, 'seti_project_204549', 'on-play', [{ kind: 'mark-signals-at-selected-probes', maximum: 3, probes: 'distinct-any-owner' }], testAdapter(() => undefined));
  const decision = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }>;
  ok(decision.options.includes('done'), '#30 can select zero probes');
}

// A card-provided research action rotates before offering a stack and rotates
// even if all technologies of the requested type are already owned (FAQ Q3).
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 923);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  for (const stack of SETI_TECH_STACKS.filter((candidate) => candidate.type === 'telescope')) {
    player.techs.push({ stackId: stack.id, tileId: `owned-${stack.id}` });
  }
  let rotations = 0;
  const adapter: SetiProjectExecutorAdapter = { ...testAdapter(() => undefined), prepareResearch: () => { rotations++; } };
  beginSetiProjectResolution(s, player, 'seti_project_204530', 'on-play', [{
    kind: 'research', technology: 'telescope', cost: 'free', rotateSolarSystem: true, gainTileReward: true,
  }], adapter);
  equal(rotations, 1, 'unavailable card research still rotates exactly once');
  equal(setiProjectRuntime(s).resolution, null, 'unavailable research is ignored after its rotation');
}

// Card-granted Scan is the complete Scan action: both mandatory sources and
// every owned telescope tech can be resolved in any order at printed costs.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 924);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  for (const stack of SETI_TECH_STACKS.filter((candidate) => candidate.type === 'telescope')) {
    player.techs.push({ stackId: stack.id, tileId: `owned-${stack.id}` });
  }
  const discardCard = s.projectDeck[0];
  player.hand.push(discardCard);
  player.publicity = 5;
  player.energy = 5;
  let launches = 0;
  const adapter: SetiProjectExecutorAdapter = {
    ...testAdapter(() => undefined),
    launchProbe: () => {
      launches++;
      return { id: `scan-launch-${launches}`, owner: player.seat, kind: 'probe', cell: earthSetiCell(s), supportLayer: 1 };
    },
  };
  beginSetiProjectResolution(s, player, 'seti_project_204567', 'on-play', [{ kind: 'scan', baseCost: 'waived', optionalTechnologyCosts: 'pay' }], adapter);
  let step = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> & { resolutionId: number };
  for (const option of ['earth', 'project-row', 'discard-extra-signal', 'mercury-publicity-signal', 'energy-launch-or-move']) {
    ok(step.options.includes(option), `full Scan exposes ${option} as a physical step`);
  }

  let result = resolveSetiProjectPending(s, player, step, { kind: 'option', option: 'mercury-publicity-signal' }, adapter);
  ok(result?.ok, 'Mercury telescope tech activates');
  const mercury = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  result = resolveSetiProjectPending(s, player, mercury, { kind: 'sector', sectorId: mercury.options[0] }, adapter);
  ok(result?.ok, 'Mercury telescope signal resolves');
  equal(player.publicity, 4, 'Mercury telescope tech costs exactly 1 publicity');

  step = s.pending[0] as typeof step;
  result = resolveSetiProjectPending(s, player, step, { kind: 'option', option: 'energy-launch-or-move' }, adapter);
  ok(result?.ok, 'energy telescope tech activates');
  const energyChoice = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> & { resolutionId: number };
  result = resolveSetiProjectPending(s, player, energyChoice, { kind: 'option', option: 'launch' }, adapter);
  ok(result?.ok, 'energy telescope tech launches from the physical supply');
  equal(player.energy, 4, 'energy telescope tech costs exactly 1 energy');
  equal(launches, 1, 'energy telescope tech launches exactly one probe');

  step = s.pending[0] as typeof step;
  result = resolveSetiProjectPending(s, player, step, { kind: 'option', option: 'discard-extra-signal' }, adapter);
  ok(result?.ok, 'discard telescope tech activates');
  const handCard = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> & { resolutionId: number };
  result = resolveSetiProjectPending(s, player, handCard, { kind: 'option', option: discardCard }, adapter);
  ok(result?.ok, 'discard telescope tech selects a hand card');
  const handSignal = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  result = resolveSetiProjectPending(s, player, handSignal, { kind: 'sector', sectorId: handSignal.options[0] }, adapter);
  ok(result?.ok, 'discard telescope tech marks the matching signal');

  step = s.pending[0] as typeof step;
  result = resolveSetiProjectPending(s, player, step, { kind: 'option', option: 'earth' }, adapter);
  const earth = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  result = resolveSetiProjectPending(s, player, earth, { kind: 'sector', sectorId: earth.options[0] }, adapter);
  ok(result?.ok, 'base Earth signal can resolve after telescope techs');

  step = s.pending[0] as typeof step;
  result = resolveSetiProjectPending(s, player, step, { kind: 'option', option: 'project-row' }, adapter);
  const rowSignal = s.pending[0] as Extract<SetiPendingDecision, { kind: 'signal-sector' }> & { resolutionId: number };
  const row = rowSignal.rowOptions![0];
  const rowCard = SETI_PROJECT_CATALOG_BY_ID[s.projectRow[row]!]!;
  const matchingSector = rowSignal.options.find((sectorId) => {
    const colors: Record<string, string[]> = {
      red: ['proxima_centauri', 'barnards_star'], yellow: ['kepler_22', '61_virginis'], blue: ['sirius_a', 'procyon'], black: ['vega', 'beta_pictoris'],
    };
    return colors[rowCard.signalColor].some((needle) => sectorId.includes(needle));
  })!;
  result = resolveSetiProjectPending(s, player, rowSignal, { kind: 'sector', sectorId: matchingSector, row }, adapter);
  ok(result?.ok, 'base project-row signal can resolve last');

  step = s.pending[0] as typeof step;
  equal(step.options.includes('done'), true, 'Scan exposes finish only after both mandatory sources');
  result = resolveSetiProjectPending(s, player, step, { kind: 'option', option: 'done' }, adapter);
  ok(result?.ok, 'full Scan finishes explicitly');
  equal(setiProjectRuntime(s).resolution, null, 'full Scan resolution drains');
}

// Atmospheric Entry and Sample Return target an exact physical figure. Only
// the reward space actually uncovered becomes available; neighboring figures
// never slide into it.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 925);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  const first = placeSetiSpacecraft(s, {
    owner: player.seat, kind: 'orbiter', body: 'Jupiter',
    spaceId: setiFirstOrbitSpaceId('Jupiter'), coveredReward: { kind: 'first-orbit-vp', amount: 3 },
  });
  const later = placeSetiSpacecraft(s, { owner: player.seat, kind: 'orbiter', body: 'Jupiter', coveredReward: null });
  const adapter = testAdapter(() => undefined);
  beginSetiProjectResolution(s, player, 'seti_project_204512', 'on-play', [{
    kind: 'remove-piece', piece: 'orbiter', from: 'any-planet', firstRewardSpaceBecomesAvailable: true,
  }], adapter);
  const decision = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> & { resolutionId: number };
  ok(decision.options.includes(first.id) && decision.options.includes(later.id), '#15 exposes each owned orbiter as a distinct physical target');
  const result = resolveSetiProjectPending(s, player, decision, { kind: 'option', option: first.id }, adapter);
  ok(result?.ok, '#15 removes the touched orbiter');
  ok(setiFirstOrbitSpaceAvailable(s, 'Jupiter'), '#15 reopens the uncovered first-orbit reward even while another orbiter remains');
  ok(s.placedSpacecraft.some((piece) => piece.id === later.id && piece.spaceId === later.spaceId), '#15 does not slide a later orbiter into the reopened reward space');
}

{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 926);
  attachRuntime(s);
  s.pending = [];
  const player = s.players[0];
  s.planets.Mars.firstLandingBonuses = [];
  const one = placeSetiSpacecraft(s, {
    owner: player.seat, kind: 'lander', body: 'Mars',
    spaceId: setiFirstLandingSpaceId('Mars', 1), coveredReward: { kind: 'first-landing-data', amount: 1 },
  });
  const two = placeSetiSpacecraft(s, {
    owner: player.seat, kind: 'lander', body: 'Mars',
    spaceId: setiFirstLandingSpaceId('Mars', 2), coveredReward: { kind: 'first-landing-data', amount: 2 },
  });
  const adapter = testAdapter(() => undefined);
  beginSetiProjectResolution(s, player, 'seti_project_204635', 'on-play', [{
    kind: 'remove-piece', piece: 'lander', from: 'any-planet-or-moon', firstRewardSpaceBecomesAvailable: true,
  }], adapter);
  const decision = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> & { resolutionId: number };
  const result = resolveSetiProjectPending(s, player, decision, { kind: 'option', option: one.id }, adapter);
  ok(result?.ok, '#84 removes the touched Mars lander');
  equal(JSON.stringify(s.planets.Mars.firstLandingBonuses), JSON.stringify([1]), '#84 reopens exactly the uncovered Mars data space');
  ok(s.placedSpacecraft.some((piece) => piece.id === two.id && piece.spaceId === setiFirstLandingSpaceId('Mars', 2)), '#84 leaves the other Mars lander on its original 2-data space');
}

// Dragonfly can share an occupied moon space, gains the covered moon reward,
// and leaves the original lander in place.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 927);
  const setupFailure = drainWithBot(s);
  ok(!setupFailure, `#16 setup choices drain (${setupFailure ?? 'ok'})`);
  const player = s.players[s.activeSeat];
  const cardId = 'seti_project_204528';
  ok(extractProjectCard(s, cardId), '#16 card is available for directed play');
  player.hand.push(cardId);
  player.credits = 20;
  player.energy = 20;
  const moonTech = SETI_TECH_STACKS.find((stack) => stack.ability === 'moon-landing')!;
  player.techs.push({ stackId: moonTech.id, tileId: moonTech.tiles[0].id });
  const jupiter = getSetiBodyCells(s).Jupiter!;
  const probeId = 'dragonfly-probe';
  s.solar.pieces.push({ id: probeId, owner: player.seat, kind: 'probe', cell: jupiter, supportLayer: setiSupportLayerForCell(s, jupiter) });
  const occupied = placeSetiSpacecraft(s, {
    owner: s.players.find((candidate) => candidate.seat !== player.seat)!.seat,
    kind: 'lander', body: 'Callisto', spaceId: setiMoonLandingSpaceId('Callisto'), coveredReward: { kind: 'moon-landing' },
  });
  const score = player.score;
  const data = player.dataPool;
  const played = applySetiAction(s, player.seat, { type: 'play_card', cardId });
  ok(played.ok, '#16 enters the real reducer');
  const decision = s.pending[0] as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }>;
  const option = `${probeId}|Callisto|occupied:${occupied.id}`;
  ok(decision.options.includes(option), '#16 exposes the exact occupied moon lander as a touch target');
  const landed = applySetiAction(s, player.seat, { type: 'choose', choice: { kind: 'option', option } });
  ok(landed.ok, '#16 resolves the occupied-moon landing');
  ok(s.placedSpacecraft.some((piece) => piece.id === occupied.id), '#16 does not displace the original moon lander');
  const dragonfly = s.placedSpacecraft.find((piece) => piece.owner === player.seat && piece.kind === 'lander' && piece.body === 'Callisto');
  ok(dragonfly && dragonfly.spaceId === occupied.spaceId, '#16 adds the new lander to the same occupied physical space');
  equal(player.score, score + 13, '#16 gains the reward covered on Callisto');
  equal(player.dataPool, Math.min(10, data + 4), '#16 gains Callisto covered data');
}

// Gravitational Slingshot offers a visual reward choice on every qualifying
// visit, and suppressed visit publicity produces neither branch.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 928);
  const setupFailure = drainWithBot(s);
  ok(!setupFailure, `#19 setup choices drain (${setupFailure ?? 'ok'})`);
  const player = s.players[s.activeSeat];
  player.energy = 20;
  s.projectRuntime.turn.temporaryRules.push({ rule: 'replace-visit-publicity-with-move', sourceCardId: 'seti_project_204548' });
  const destination = getSetiSolarFeatures(s).find((feature) => feature.kind === 'planet' && feature.body !== 'Earth')!.cell;
  const origin = adjacentSetiCells(destination)[0];
  const piece = { id: 'slingshot-probe', owner: player.seat, kind: 'probe' as const, cell: origin, supportLayer: setiSupportLayerForCell(s, origin) };
  s.solar.pieces.push(piece);
  const publicity = player.publicity;
  let moved = applySetiAction(s, player.seat, { type: 'move', pieceId: piece.id, to: destination });
  ok(moved.ok && s.pending[0]?.kind === 'project-visit-reward', '#19 turns a qualifying visit into a tactile publicity-or-move choice');
  equal(player.publicity, publicity, '#19 does not grant publicity before the player chooses');
  let chosen = applySetiAction(s, player.seat, { type: 'choose', choice: { kind: 'option', option: 'publicity' } });
  ok(chosen.ok, '#19 publicity branch resolves');
  equal(player.publicity, publicity + 1, '#19 publicity branch grants exactly 1 publicity');

  piece.cell = origin;
  piece.supportLayer = setiSupportLayerForCell(s, origin);
  moved = applySetiAction(s, player.seat, { type: 'move', pieceId: piece.id, to: destination });
  ok(moved.ok && s.pending[0]?.kind === 'project-visit-reward', '#19 offers the choice again on a later visit this turn');
  chosen = applySetiAction(s, player.seat, { type: 'choose', choice: { kind: 'option', option: 'move' } });
  ok(chosen.ok && s.pending[0]?.kind === 'card-effect-choice', '#19 move branch becomes one physical movement gesture');
  if (s.pending[0]?.kind === 'card-effect-choice') {
    ok(s.pending[0].options.includes(piece.id), '#19 movement branch highlights the movable probe');
    applySetiAction(s, player.seat, { type: 'choose', choice: { kind: 'option', option: 'skip' } });
  }

  const comet = getSetiSolarFeatures(s).find((feature) => feature.kind === 'comet');
  ok(!!comet, '#19 regression setup has a visible comet');
  if (comet) {
    const cometOrigin = adjacentSetiCells(comet.cell)[0];
    piece.cell = cometOrigin;
    piece.supportLayer = setiSupportLayerForCell(s, cometOrigin);
    const beforeComet = player.publicity;
    moved = applySetiAction(s, player.seat, { type: 'move', pieceId: piece.id, to: comet.cell });
    ok(moved.ok && !s.pending.some((pending) => pending.kind === 'project-visit-reward'), '#19 does not replace a comet visit with movement');
    equal(player.publicity, beforeComet + 1, '#19 leaves ordinary comet publicity unchanged');
  }

  player.suppressProbePublicityThisTurn = true;
  piece.cell = origin;
  piece.supportLayer = setiSupportLayerForCell(s, origin);
  const beforeSuppressed = player.publicity;
  moved = applySetiAction(s, player.seat, { type: 'move', pieceId: piece.id, to: destination });
  ok(moved.ok && !s.pending.some((pending) => pending.kind === 'project-visit-reward'), '#19 offers no replacement when visit publicity is suppressed');
  equal(player.publicity, beforeSuppressed, '#19 suppressed visit grants no publicity');
}

// International Collaboration keeps the Telescope I stack's intrinsic
// 2-data line while skipping the selected tile's variable reward.
{
  const s = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `P${index}`, color })), 929);
  const setupFailure = drainWithBot(s);
  ok(!setupFailure, `#81 setup choices drain (${setupFailure ?? 'ok'})`);
  const player = s.players[s.activeSeat];
  const other = s.players.find((candidate) => candidate.seat !== player.seat)!;
  const cardId = 'seti_project_204554';
  ok(extractProjectCard(s, cardId), '#81 card is available for directed play');
  player.hand.push(cardId);
  player.credits = 20;
  const telescopeOne = SETI_TECH_STACKS.find((stack) => stack.ability === 'earth-signal-adjacent')!;
  const priorTile = s.techStacks[telescopeOne.id].tiles.shift()!;
  other.techs.push({ stackId: telescopeOne.id, tileId: priorTile });
  s.techStacks[telescopeOne.id].firstTakeBonusAvailable = false;
  const played = applySetiAction(s, player.seat, { type: 'play_card', cardId });
  ok(played.ok && s.pending[0]?.kind === 'tech-stack', '#81 offers only previously researched technology stacks');
  const before = { data: player.dataPool, energy: player.energy, publicity: player.publicity, score: player.score, hand: player.hand.length };
  const researched = applySetiAction(s, player.seat, { type: 'choose', choice: { kind: 'tech-stack', stackId: telescopeOne.id } });
  ok(researched.ok, '#81 researches the touched technology');
  equal(player.dataPool, Math.min(10, before.data + 2), '#81 preserves Telescope I intrinsic +2 data');
  equal(player.energy, before.energy, '#81 skips an energy tile reward');
  equal(player.publicity, before.publicity, '#81 skips a publicity tile reward');
  equal(player.score, before.score, '#81 skips a VP tile reward');
  equal(player.hand.length, before.hand, '#81 skips a project-card tile reward');
}

if (failed) {
  console.error(`SETI project runtime coverage: ${passed} passed, ${failed} failed`);
  process.exitCode = 1;
} else console.log(`SETI project runtime coverage: ${passed} passed, 0 failed`);
