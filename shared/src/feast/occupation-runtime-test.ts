// Exhaustive pure-runtime coverage for all 190 classic occupation cards.
// Run: npx tsx shared/src/feast/occupation-runtime-test.ts

import {
  FEAST_OCCUPATION_RULE_LIST,
  type FeastOccupationClause,
  type FeastOccupationOperation,
  type FeastOccupationPredicate,
  type FeastOccupationQuantity,
  type FeastOccupationRule,
  type FeastOccupationTrigger,
  type FeastRuleMetric,
  type FeastRuleRecord,
  type FeastRuleValue,
} from './occupationRules.js';
import {
  EMPTY_FEAST_OCCUPATION_USAGE,
  feastOccupationActionModifiers,
  feastOccupationDieModifiers,
  feastOccupationFeastHorizontalLimit,
  feastOccupationLimitAvailable,
  feastOccupationLootModifiers,
  feastOccupationMatchesTrigger,
  feastOccupationMetric,
  feastOccupationPredicateMatches,
  feastOccupationQuantity,
  feastOccupationScoringModifiers,
  feastPlanOccupationClause,
  feastPlanOccupationEvent,
  feastValidateOccupationSelection,
  type FeastOccupationEventContext,
  type FeastOccupationPlannedOperation,
  type FeastOccupationPlan,
  type FeastOccupationUsageProvenance,
} from './occupationRuntime.js';
import { FEAST_ACTION_BY_ID, FEAST_GOOD_IDS } from './data.js';
import { createFeast } from './state.js';
import type {
  FeastBoardState, FeastGood, FeastPlacement, FeastState,
} from './types.js';

let passed = 0;
let failed = 0;
const check = (condition: unknown, message: string): void => {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
};
const equal = (actual: unknown, expected: unknown, message: string): void =>
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

function placement(id: string, pieceId: string): FeastPlacement {
  return {
    id, pieceKind: pieceId === 'cloakpin' || pieceId === 'drinking-horn' ? 'special' : 'good',
    pieceId, color: 'blue', x: 0, y: 0, rotation: 0, mask: ['#'], covered: [{ x: 0, y: 0 }],
  };
}

function building(id: string, definitionId: 'stone-house' | 'long-house' | 'shed', pieces: FeastPlacement[] = []): FeastBoardState {
  return { id, definitionId, kind: 'building', owner: 0, placements: pieces };
}

function exploration(id: string, definitionId: string): FeastBoardState {
  return { id, definitionId, kind: 'exploration', owner: 0, placements: [] };
}

function richState(): FeastState {
  const state = createFeast([{ name: 'Runtime', color: 'Red' }], 190_2016, {
    length: 'long', occupationMode: 'all', soloStartingOccupation: 'random',
  });
  state.pending = [];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  const player = state.players[0];
  player.silver = 100;
  player.resources = { wood: 100, stone: 100, ore: 100 };
  for (const id of FEAST_GOOD_IDS) player.goods[id] = 10;
  player.weapons = { bow: 10, snare: 10, spear: 10, 'long-sword': 10 };
  player.workersAvailable = 12;
  player.workersTotal = 12;
  player.ships = [
    { id: 'whaler-1', type: 'whaling-boat', ore: 3, emigrated: false, emigratedRound: null },
    { id: 'knarr-1', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'longship-1', type: 'longship', ore: 3, emigrated: false, emigratedRound: null },
    { id: 'longship-2', type: 'longship', ore: 2, emigrated: false, emigratedRound: null },
  ];
  player.specials = ['belt', 'cloakpin', 'drinking-horn', 'crucifix', 'chalice'];
  player.boards.push(
    building('house-1', 'stone-house', [placement('cloakpin-on-board', 'cloakpin')]),
    building('house-2', 'long-house', [placement('horn-on-board', 'drinking-horn')]),
    building('shed-1', 'shed'),
    exploration('explore-1', 'iceland'),
    exploration('explore-2', 'greenland'),
    exploration('explore-3', 'labrador'),
  );
  player.feastPlacements = [placement('feast-stockfish-1', 'stockfish'), placement('feast-stockfish-2', 'stockfish')];
  player.playedOccupations = FEAST_OCCUPATION_RULE_LIST.map((rule) => rule.id);
  player.occupationHand = ['occupation-1', 'occupation-2', 'occupation-3', 'occupation-4'];
  player.occupationUses = [];
  for (const space of state.actionSpaces.slice(0, 8)) {
    space.occupants = [{ seat: 0, workers: FEAST_ACTION_BY_ID[space.id]?.workers ?? 1, workerColor: 'Red', copiedFrom: null }];
  }
  return state;
}

function contextForTrigger(
  trigger: FeastOccupationTrigger, fields: Record<string, FeastRuleValue> = {},
): FeastOccupationEventContext {
  return {
    hook: trigger.hook, event: trigger.event, window: trigger.window,
    round: 1, actionId: 'action-runtime', eventId: 'event-runtime',
    fields: { seat: 0, round: 1, ...(trigger.filter ?? {}), ...fields },
    available: { belt: 1, cloakpin: 1, crucifix: 1, 'stone-house': 3 },
  };
}

function rule(number: number): FeastOccupationRule {
  const found = FEAST_OCCUPATION_RULE_LIST.find((candidate) => candidate.number === number);
  if (!found) throw new Error(`Missing occupation ${number}`);
  return found;
}

function clause(number: number, clauseId?: string): FeastOccupationClause {
  const found = clauseId ? rule(number).clauses.find((candidate) => candidate.id === clauseId) : rule(number).clauses[0];
  if (!found) throw new Error(`Missing occupation ${number} clause ${clauseId ?? 0}`);
  return found;
}

function actualPlan(
  state: FeastState, number: number, clauseId?: string,
  fields: Record<string, FeastRuleValue> = {}, triggerIndex = 0,
): FeastOccupationPlan | null {
  const candidate = clause(number, clauseId);
  const trigger = candidate.triggers[triggerIndex];
  return feastPlanOccupationClause(state, 0, rule(number), candidate, contextForTrigger(trigger, fields));
}

function walk(operations: readonly FeastOccupationPlannedOperation[]): FeastOccupationPlannedOperation[] {
  const out: FeastOccupationPlannedOperation[] = [];
  for (const operation of operations) {
    out.push(operation);
    if (operation.kind === 'replace') out.push(...walk(operation.replacement));
    if (operation.kind === 'choice') for (const option of operation.options) out.push(...walk(option.operations));
  }
  return out;
}

function walkRegistry(operations: readonly FeastOccupationOperation[]): FeastOccupationOperation[] {
  const out: FeastOccupationOperation[] = [];
  for (const operation of operations) {
    out.push(operation);
    if (operation.kind === 'replace') out.push(...walkRegistry(operation.replacement));
    if (operation.kind === 'choice') for (const option of operation.options) out.push(...walkRegistry(option.operations));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exhaustive structural planning: every card, clause and nested operation.
// ---------------------------------------------------------------------------

const state = richState();
const cardsPlanned = new Set<number>();
const registryKinds = new Map<string, number>();
const plannedKinds = new Map<string, number>();
const planPaths = new Set<string>();
let clausePlans = 0;

for (const candidateRule of FEAST_OCCUPATION_RULE_LIST) {
  for (const candidateClause of candidateRule.clauses) {
    const operationPathClause: FeastOccupationClause = { ...candidateClause, condition: undefined };
    const context = contextForTrigger(candidateClause.triggers[0], {
      selectedAmount: 1, amount: 1, batchAmount: 1, action: candidateClause.triggers[0].event,
      shipId: 'longship-1', cloakpinLocation: 'board', drinkingHornLocation: 'board',
    });
    const plan = feastPlanOccupationClause(state, 0, candidateRule, operationPathClause, context);
    check(plan !== null, `${candidateRule.id}.${candidateClause.id}: has a well-formed plan path`);
    if (!plan) continue;
    cardsPlanned.add(candidateRule.number);
    clausePlans++;
    check(plan.operations.length === candidateClause.operations.length, `${candidateRule.id}.${candidateClause.id}: top-level operation count preserved`);
    check(['automatic', 'choice', 'action', 'replacement', 'modifier', 'compound'].includes(plan.kind), `${candidateRule.id}.${candidateClause.id}: bounded plan kind`);
    check(plan.issues.every((entry) => entry.path.startsWith(candidateRule.id)), `${candidateRule.id}.${candidateClause.id}: issues retain provenance path`);
    for (const operation of walkRegistry(candidateClause.operations)) registryKinds.set(operation.kind, (registryKinds.get(operation.kind) ?? 0) + 1);
    for (const operation of walk(plan.operations)) {
      plannedKinds.set(operation.kind, (plannedKinds.get(operation.kind) ?? 0) + 1);
      check(!planPaths.has(operation.path), `${operation.path}: operation provenance path unique`);
      planPaths.add(operation.path);
      check(['automatic', 'prompt', 'deferred', 'modifier', 'replacement'].includes(operation.disposition), `${operation.path}: structured disposition`);
      check(!['acknowledge', 'manual', 'arbitrary'].includes(operation.kind), `${operation.path}: no generic/manual operation`);
    }
  }
}

equal(cardsPlanned.size, 190, 'all 190 occupations traverse at least one well-formed plan path');
check(clausePlans > 190, 'every clause, including compound-card clauses, planned');
equal([...plannedKinds.keys()].sort(), [...registryKinds.keys()].sort(), 'every registry operation kind has a planned runtime representation');
for (const [kind, count] of registryKinds) equal(plannedKinds.get(kind), count, `${kind}: every nested occurrence planned exactly once`);
equal([...registryKinds.keys()].sort(), [
  'choice', 'discount', 'draw-weapons', 'exchange', 'grant-action', 'modify-die',
  'modify-rule', 'move', 'phase', 'replace', 'return-workers', 'score', 'transfer',
], 'all 13 exhaustive operation kinds covered');

// ---------------------------------------------------------------------------
// Trigger, predicate, comparator, metric and quantity semantics.
// ---------------------------------------------------------------------------

const playTrigger = clause(5).triggers[0];
check(feastOccupationMatchesTrigger(playTrigger, contextForTrigger(playTrigger)), 'exact trigger matches');
check(!feastOccupationMatchesTrigger(playTrigger, { ...contextForTrigger(playTrigger), window: 'after' }), 'trigger window mismatch rejected');
const filteredTrigger = clause(105).triggers[0];
check(feastOccupationMatchesTrigger(filteredTrigger, contextForTrigger(filteredTrigger)), 'trigger record filter matches');
check(!feastOccupationMatchesTrigger(filteredTrigger, contextForTrigger(filteredTrigger, { actionSpaceId: 'wrong' })), 'trigger record filter mismatch rejected');

const comparatorPredicates: FeastOccupationPredicate[] = [
  { kind: 'event', field: 'n', comparator: 'eq', value: 4 },
  { kind: 'event', field: 'n', comparator: 'neq', value: 5 },
  { kind: 'event', field: 'n', comparator: 'lt', value: 5 },
  { kind: 'event', field: 'n', comparator: 'lte', value: 4 },
  { kind: 'event', field: 'n', comparator: 'gt', value: 3 },
  { kind: 'event', field: 'n', comparator: 'gte', value: 4 },
  { kind: 'event', field: 'word', comparator: 'in', value: ['x', 'odin'] },
  { kind: 'event', field: 'list', comparator: 'contains', value: 'fjord' },
];
const predicateContext: FeastOccupationEventContext = {
  hook: 'state-changed', event: 'inventory-threshold', window: 'when',
  fields: { seat: 0, n: 4, word: 'odin', list: ['fjord', 'ship'] }, available: { token: 2 },
};
for (const predicate of comparatorPredicates) check(feastOccupationPredicateMatches(state, 0, predicate, predicateContext), `${'comparator' in predicate ? predicate.comparator : predicate.kind}: comparator variant`);
const predicateKinds: FeastOccupationPredicate[] = [
  { kind: 'metric', metric: 'silver', comparator: 'gte', value: 100 },
  { kind: 'event', field: 'word', comparator: 'eq', value: 'odin' },
  { kind: 'available', subject: 'token', comparator: 'gte', value: 2 },
  { kind: 'all', terms: comparatorPredicates.slice(0, 2) },
  { kind: 'any', terms: [{ kind: 'event', field: 'n', comparator: 'eq', value: 9 }, comparatorPredicates[0]] },
  { kind: 'not', term: { kind: 'event', field: 'n', comparator: 'eq', value: 9 } },
];
for (const predicate of predicateKinds) check(feastOccupationPredicateMatches(state, 0, predicate, predicateContext), `${predicate.kind}: predicate variant`);
check(!feastOccupationPredicateMatches(state, 0, { kind: 'available', subject: 'missing' }, predicateContext), 'unavailable subject rejected');

const allMetrics: FeastRuleMetric[] = [
  'silver', 'round', 'player-count', 'income', 'goods', 'resources', 'weapons', 'ships',
  'large-ships', 'houses', 'special-tiles', 'exploration-boards', 'workers-on-spaces',
  'workers-in-thing', 'ore-on-ships', 'event-amount', 'event-cost', 'event-roll',
  'event-workers', 'event-distinct-types', 'event-items', 'empty-berths',
];
const metricContext = { ...predicateContext, fields: {
  ...predicateContext.fields, amount: 3, cost: 4, roll: 5, workers: 2,
  distinctTypes: ['wood', 'stone', 'wood'], items: ['wood', 'ore'],
} } satisfies FeastOccupationEventContext;
for (const metric of allMetrics) check(Number.isFinite(feastOccupationMetric(state, 0, metric, undefined, metricContext)), `${metric}: metric is total and finite`);
equal(feastOccupationMetric(state, 0, 'goods', { animal: 'sheep', includePregnant: true }), 20, 'goods animal/includePregnant filter');
equal(feastOccupationMetric(state, 0, 'goods', { ids: ['sheep', 'pregnant-sheep', 'cattle', 'pregnant-cattle'], distinctAnimalTypes: true }), 2, 'distinct animal-type filter');
equal(feastOccupationMetric(state, 0, 'goods', { pairedIds: ['game-meat', 'whale-meat'] }), 10, 'paired-good filter');
equal(feastOccupationMetric(state, 0, 'ships', { type: 'longship', oreAtLeast: 2 }), 2, 'ship type/ore filter');
equal(feastOccupationMetric(state, 0, 'ships', { completeSets: ['whaling-boat', 'knarr', 'longship'] }), 1, 'complete fleet-set filter');
equal(feastOccupationMetric(state, 0, 'ore-on-ships', { shipTypes: ['whaling-boat', 'longship'] }), 8, 'ore ship-type filter');
equal(feastOccupationMetric(state, 0, 'empty-berths', { berth: 'large' }), 1, 'large berth capacity metric');

const quantities: [string, FeastOccupationQuantity, number][] = [
  ['number', 3, 3],
  ['count', { kind: 'count', metric: 'ships', filter: { type: 'longship' }, multiplier: 2, cap: 3 }, 3],
  ['tier', { kind: 'tier', metric: 'ships', filter: { type: 'longship' }, tiers: [{ exactly: 2, value: 7 }], default: 1 }, 7],
  ['event', { kind: 'event', field: 'amount', multiplier: 2, cap: 5 }, 5],
  ['round', { kind: 'round', offset: -2, floor: 1 }, 1],
  ['player-count', { kind: 'player-count', offset: 2 }, 3],
];
for (const [name, quantity, expected] of quantities) equal(feastOccupationQuantity(state, 0, quantity, metricContext), expected, `${name}: quantity variant`);
equal(feastOccupationQuantity(state, 0, { kind: 'tier', metric: 'goods', filter: { id: 'silk' }, tiers: [{ atLeast: 1, value: 1 }, { atLeast: 3, value: 6 }], default: 0 }), 6, 'tier uses highest matching threshold');
const completeFleetState = richState();
completeFleetState.players[0].ships.push(
  { id: 'whaler-2', type: 'whaling-boat', ore: 0, emigrated: false, emigratedRound: null },
  { id: 'knarr-2', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
  { id: 'whaler-3', type: 'whaling-boat', ore: 0, emigrated: false, emigratedRound: null },
  { id: 'knarr-3', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
  { id: 'longship-3', type: 'longship', ore: 0, emigrated: false, emigratedRound: null },
);
const fleetQuantity = (clause(14).operations[0] as Extract<FeastOccupationOperation, { kind: 'transfer' }>).items[0].quantity;
equal(feastOccupationQuantity(completeFleetState, 0, fleetQuantity), 2, 'filter-level cap limits complete-fleet reward to two');

// Snapshot metrics use immutable phase-start player data.
const snapshot = structuredClone(state.players[0]);
snapshot.goods.flax = 1;
state.players[0].goods.flax = 10;
const snapshotContext = { ...metricContext, snapshots: { 'phase-start': snapshot } };
equal(feastOccupationMetric(state, 0, 'goods', { id: 'flax', snapshot: 'phase-start' }, snapshotContext), 1, 'named player snapshot metric');

// ---------------------------------------------------------------------------
// Limits and usage provenance are caller-owned and stable.
// ---------------------------------------------------------------------------

const grainClause = clause(7);
const grainContext = contextForTrigger(grainClause.triggers[0]);
const grainPlan = feastPlanOccupationClause(state, 0, rule(7), grainClause, grainContext)!;
check(grainPlan.usage.key.includes(':round:1'), 'once-per-round usage key includes concrete round');
const used: FeastOccupationUsageProvenance = { records: [grainPlan.usage] };
check(!feastOccupationLimitAvailable(grainClause, { ...grainContext, round: 1 }, used, rule(7).id), 'used once-per-round clause unavailable');
check(!feastOccupationLimitAvailable(grainClause, { ...grainContext, round: 1 }, used), 'unique clause provenance enforces limit without optional card id');
check(feastPlanOccupationClause(state, 0, rule(7), grainClause, grainContext, used) === null, 'planner suppresses repeated once-per-round clause');
const nextRoundState = structuredClone(state);
nextRoundState.round = 2;
check(feastPlanOccupationClause(nextRoundState, 0, rule(7), grainClause, { ...grainContext, round: 2 }, used) !== null, 'same clause available next round');
check(feastOccupationLimitAvailable(clause(39), contextForTrigger(clause(39).triggers[0]), used, rule(39).id), 'unlimited clause never consumed');

// ---------------------------------------------------------------------------
// Automatic effects, prompts, affordability, finite supply and targets.
// ---------------------------------------------------------------------------

const fruitsPlan = actualPlan(state, 43)!;
check(fruitsPlan.automatic && fruitsPlan.kind === 'automatic', 'mandatory concrete transfer is automatic');
equal(fruitsPlan.automaticDeltas, [{ item: 'fruits', amount: 1, mode: 'gain' }], 'automatic transfer emits exact delta');

const randomWeaponPlan = actualPlan(state, 68)!;
check(randomWeaponPlan.kind === 'action' && !randomWeaponPlan.automatic, 'random draw is deferred to deterministic reducer RNG, not a user-authored operation');
const phasePlan = actualPlan(state, 5)!;
check(phasePlan.kind === 'action' && phasePlan.operations[0].kind === 'phase', 'extra phase is typed deferred action');
const replacementPlan = actualPlan(state, 38)!;
check(replacementPlan.kind === 'replacement' && replacementPlan.requiresConfirmation, 'optional weapon replacement is structured replacement prompt');

const piratePlan = actualPlan(state, 45)!;
check(piratePlan.valid, 'affordable exchange plan enabled');
const poor = richState();
poor.players[0].resources.wood = 0;
poor.players[0].silver = 0;
const poorPirate = actualPlan(poor, 45)!;
check(!poorPirate.valid && poorPirate.issues.some((entry) => entry.code === 'inventory'), 'unaffordable exchange disabled with inventory provenance');

const metalsmith = actualPlan(state, 73)!;
check(metalsmith.kind === 'choice' && metalsmith.operations[0].kind === 'choice', 'bounded choice produces option plans');
if (metalsmith.operations[0].kind === 'choice') {
  check(metalsmith.operations[0].options.every((option) => option.valid), 'affordable choice options enabled');
  check(feastValidateOccupationSelection(state, 0, metalsmith, { accepted: true, optionIds: ['chalice'] }) === null, 'valid choice selection accepted');
  check(feastValidateOccupationSelection(state, 0, metalsmith, { accepted: true, optionIds: ['bad'] })?.includes('Unknown option'), 'unknown choice selection rejected');
}
const aggregatePoor = richState();
aggregatePoor.players[0].silver = 2;
const hornblower = actualPlan(aggregatePoor, 85)!;
check(hornblower.valid, 'hornblower options are individually affordable');
check(feastValidateOccupationSelection(aggregatePoor, 0, hornblower, { accepted: true, optionIds: ['hunt', 'snare'] })?.includes('across the selected options'), 'combined choice affordability prevents overspending shared inventory');

const exactGoods = richState();
exactGoods.players[0].goods.flax = 3;
const fourthCopy = actualPlan(exactGoods, 31)!;
check(fourthCopy !== null && fourthCopy.kind === 'choice', 'occupation 31 exact-three condition creates typed target prompt');
const fourthCopyPath = fourthCopy.operations[0].path;
check(feastValidateOccupationSelection(exactGoods, 0, fourthCopy, { accepted: true, targets: { [fourthCopyPath]: 'flax' } }) === null, 'occupation 31 validates selected exact-three non-animal good');
check(feastValidateOccupationSelection(exactGoods, 0, fourthCopy, { accepted: true, targets: { [fourthCopyPath]: 'sheep' } })?.includes('non-animal'), 'occupation 31 rejects animal target');

const hornturner = actualPlan(state, 63)!;
check(feastValidateOccupationSelection(state, 0, hornturner, { accepted: true, optionIds: ['buy-drinking-horn'] }) === null, 'unselected nested animal exchange does not demand a target');
const sponsor = actualPlan(state, 184)!;
check(feastValidateOccupationSelection(state, 0, sponsor, { accepted: true, optionIds: ['wood'] }) === null, 'deterministic ore-to-new-longship move needs no redundant target prompt');
const raidFailure = actualPlan(state, 104, undefined, { success: false, rollsUsed: 2, declaredFailure: true })!;
check(feastValidateOccupationSelection(state, 0, raidFailure, { accepted: false }) === null, 'optional triggered choice may be declined');
check(feastValidateOccupationSelection(state, 0, raidFailure, { accepted: true, optionIds: ['oil'] }) === null, 'mandatory bounded choice accepts one valid option');
check(feastValidateOccupationSelection(state, 0, fruitsPlan, { accepted: false })?.includes('mandatory'), 'mandatory automatic effect cannot be rejected');

const noSpecial = richState();
noSpecial.specialSupply = noSpecial.specialSupply.filter((id) => id !== 'crucifix' && id !== 'cloakpin');
const noSpecialClause = clause(62);
const noSpecialContext = { ...contextForTrigger(noSpecialClause.triggers[0]), available: { crucifix: 0, cloakpin: 0 } };
check(feastPlanOccupationClause(noSpecial, 0, rule(62), noSpecialClause, noSpecialContext) === null, 'availability predicate suppresses exhausted special-tile clause');

const badShipTarget = richState();
const targetPlan = actualPlan(badShipTarget, 90, undefined, { shipId: 'not-a-ship' })!;
check(!targetPlan.valid && targetPlan.issues.some((entry) => entry.code === 'target'), 'invalid selected ship target rejected');
const goodTargetPlan = actualPlan(state, 90, undefined, { shipId: 'longship-1' })!;
check(goodTargetPlan.valid, 'ore-bearing longship target accepted');

// Event scanner sees only owned cards (plus the currently played immediate card).
const ownedState = richState();
ownedState.players[0].playedOccupations = ['occupation-43'];
const card43Context = contextForTrigger(clause(43).triggers[0]);
const eventPlans = feastPlanOccupationEvent(ownedState, { ...card43Context, cardId: 'occupation-43' }, EMPTY_FEAST_OCCUPATION_USAGE);
equal(eventPlans.plans.map((plan) => plan.cardId), ['occupation-43'], 'event scan is ownership/card scoped');
check(eventPlans.automatic.length === 1 && eventPlans.prompts.length === 0, 'event scanner partitions automatic plan');

// ---------------------------------------------------------------------------
// Audited card paths explicitly exercise the historically risky clauses.
// ---------------------------------------------------------------------------

const auditedCards = [
  1, 2, 4, 5, 11, 20, 38, 40, 60, 70, 89, 90, 99, 105, 106, 107, 116,
  132, 136, 137, 138, 139, 147, 153, 159, 166, 169, 170, 172,
  184, 185, 186, 187, 188, 189, 190,
];
const auditedFields: Record<number, Record<string, FeastRuleValue>> = {
  1: { printedCost: 2 }, 2: { printedSilverCost: 2 }, 4: { action: 'raiding' },
  70: { cloakpinLocation: 'board' }, 89: { action: 'raiding' }, 90: { shipId: 'longship-1' },
  136: { action: 'raiding' }, 137: { action: 'raiding' }, 138: { action: 'raiding', success: true },
  139: { action: 'raiding' }, 159: { gameMeatPlacedThisFeast: 1 },
  166: { matchingPlacementsEarlierThisRound: 1 },
  169: {}, 172: { selectedAmount: 1 }, 188: {}, 190: { goodId: 'spices', batchAmount: 2 },
};
for (const number of auditedCards) {
  const candidate = actualPlan(state, number, number === 169 ? 'flax-or-grain-harvest' : undefined, auditedFields[number] ?? {});
  check(candidate !== null, `audited occupation ${number}: real condition/trigger yields plan`);
  if (candidate) check(candidate.operations.length > 0, `audited occupation ${number}: typed operation payload`);
}
// Additional audited clauses on compound cards.
check(actualPlan(state, 11, 'spear-whaling-value', { action: 'whaling' }) !== null, 'occupation 11 spear/whaling modifier path');
check(actualPlan(state, 136, 'split-battle-loot', { action: 'raiding', success: true }) !== null, 'occupation 136 split-loot path');
check(actualPlan(state, 188, 'last-mountain-silver-bonus', { item: 'silver-2', wasLastStripSpace: true }) !== null, 'occupation 188 final mountain item path');

// ---------------------------------------------------------------------------
// First-class modifier queries.
// ---------------------------------------------------------------------------

function only(...numbers: number[]): FeastState {
  const isolated = richState();
  isolated.players[0].playedOccupations = numbers.map((number) => `occupation-${number}`);
  return isolated;
}

let modifierState = only(1);
let actionContext = contextForTrigger(clause(1).triggers[0], { printedCost: 3, printedSilverCost: 3, actionKind: 'livestock-market' });
let actionMods = feastOccupationActionModifiers(modifierState, 0, actionContext);
equal([actionMods.silverDiscount, actionMods.effectiveSilverCost], [1, 2], 'occupation 1 livestock total-cost discount');

modifierState = only(2);
actionContext = contextForTrigger(clause(2).triggers[0], { printedSilverCost: 4, actionKind: 'viking-action' });
actionMods = feastOccupationActionModifiers(modifierState, 0, actionContext);
equal([actionMods.silverDiscount, actionMods.effectiveSilverCost], [1, 3], 'occupation 2 costly-space discount');
actionMods = feastOccupationActionModifiers(modifierState, 0, contextForTrigger(clause(2).triggers[0], { printedSilverCost: 4, actionKind: 'ship-purchase' }));
equal(actionMods.silverDiscount, 0, 'occupation 2 ship-purchase exclusion');

modifierState = only(116);
actionMods = feastOccupationActionModifiers(modifierState, 0, contextForTrigger(clause(116).triggers[0], { printedStoneCost: 3 }));
equal([actionMods.stoneDiscount, actionMods.effectiveStoneCost], [1, 2], 'occupation 116 stone house discount');

modifierState = only(170);
actionMods = feastOccupationActionModifiers(modifierState, 0, contextForTrigger(clause(170).triggers[0], { printedSilverCost: 1 }));
equal(actionMods.effectiveSilverCost, 0, 'occupation 170 emigration discount floors at zero');

modifierState = only(106);
modifierState.players[0].ships.push({ id: 'longship-3', type: 'longship', ore: 0, emigrated: false, emigratedRound: null });
modifierState.players[0].ships.push({ id: 'longship-4', type: 'longship', ore: 0, emigrated: false, emigratedRound: null });
actionMods = feastOccupationActionModifiers(modifierState, 0, contextForTrigger(clause(106).triggers[0], { action: 'plundering' }));
equal(actionMods.workerCost, 2, 'occupation 106 four-longship worker cost tier');

modifierState = only(147);
actionMods = feastOccupationActionModifiers(modifierState, 0, contextForTrigger(clause(147).triggers[0], { action: 'raiding' }));
equal(actionMods.eligibility, ['knarr-substitutes-longship'], 'occupation 147 knarr action eligibility');

modifierState = only(4);
let dieContext = contextForTrigger(clause(4).triggers[0], { action: 'raiding', roll: 6 });
let dieMods = feastOccupationDieModifiers(modifierState, 0, dieContext);
equal(dieMods.delta, -1, 'occupation 4 applies -1 to matching die action');

modifierState = only(11);
dieContext = { ...contextForTrigger(clause(11, 'spear-whaling-value').triggers[0], { action: 'whaling' }), payments: { spear: 2 } };
dieMods = feastOccupationDieModifiers(modifierState, 0, dieContext);
equal(dieMods.delta, -4, 'occupation 11 spear payment has replacement -2 value per spear');
check(dieMods.payments[0]?.replacesNormalWeaponValue === true, 'occupation 11 exposes weapon-value replacement semantics');

modifierState = only(90);
dieContext = { ...contextForTrigger(clause(90).triggers[0], { action: 'raiding', shipId: 'longship-1' }), activatedClauseIds: ['occupation-90:raid-ore-plus-two'] };
dieMods = feastOccupationDieModifiers(modifierState, 0, dieContext);
equal(dieMods.delta, 2, 'occupation 90 activated ore modifier adds two');
check(dieMods.everyRollClauseIds.includes('occupation-90:raid-ore-plus-two'), 'occupation 90 persists for every roll in action');

modifierState = only(153);
dieMods = feastOccupationDieModifiers(modifierState, 0, contextForTrigger(clause(153).triggers[0], { action: 'hunting-game' }));
equal(dieMods.rollLimit, 4, 'occupation 153 replaces roll maximum with four');

modifierState = only(136);
let lootContext = { ...contextForTrigger(clause(136, 'split-battle-loot').triggers[0], { action: 'raiding', success: true }), activatedClauseIds: ['occupation-136:split-battle-loot'] };
let lootMods = feastOccupationLootModifiers(modifierState, 0, lootContext);
equal(lootMods.maxTiles, 2, 'occupation 136 activated split permits two loot tiles');

modifierState = only(138);
lootContext = { ...contextForTrigger(clause(138).triggers[0], { action: 'raiding', success: true }), activatedClauseIds: ['occupation-138:green-battle-loot'] };
lootMods = feastOccupationLootModifiers(modifierState, 0, lootContext);
equal([lootMods.lootColor, lootMods.swordValueDelta], ['green-instead-of-blue', -1], 'occupation 138 green loot/back sword adjustment');

modifierState = only(139);
lootMods = feastOccupationLootModifiers(modifierState, 0, contextForTrigger(clause(139).triggers[0], { action: 'raiding' }));
equal(lootMods.swordValueDelta, -1, 'occupation 139 highest special sword reduction');

modifierState = only(186);
equal(feastOccupationFeastHorizontalLimit(modifierState, 0, 'peas'), 2, 'occupation 186 permits second horizontal peas');
equal(feastOccupationFeastHorizontalLimit(modifierState, 0, 'grain'), 1, 'occupation 186 does not change other goods');

modifierState = only(189);
let scoring = feastOccupationScoringModifiers(modifierState, 0);
equal(scoring.map((entry) => [entry.currency, entry.amount]), [['silver', 9]], 'occupation 189 scores 9 silver for three explorations');
modifierState.players[0].boards.push(exploration('explore-4', 'newfoundland'));
scoring = feastOccupationScoringModifiers(modifierState, 0);
equal(scoring[0]?.amount, 16, 'occupation 189 scores 16 silver for four explorations');

// Runtime output remains finite JSON, with no callbacks/classes/state mutation.
const before = JSON.stringify(state);
const jsonPlan = actualPlan(state, 184)!;
check(JSON.stringify(jsonPlan).length > 0 && JSON.stringify(state) === before, 'planning is JSON-only and does not mutate state');

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`${passed}/${passed} occupation runtime checks passed (190 cards, ${clausePlans} clauses, ${[...registryKinds.values()].reduce((a, b) => a + b, 0)} operations)`);
}
