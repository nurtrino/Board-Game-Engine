// Focused atomic occupation-plan executor suite.
// Run: npx tsx shared/src/feast/occupation-executor-test.ts

import { createFeast, feastWeaponConservation } from './state.js';
import {
  feastExecuteOccupationPlan, feastOccupationPromptModel,
  type FeastOccupationExecutionSuccess,
} from './occupationExecutor.js';
import { feastOccupationRule, type FeastOccupationOperation } from './occupationRules.js';
import {
  feastPlanOccupationClause, feastValidateOccupationSelection,
  type FeastOccupationEventContext,
  type FeastOccupationPlan,
  type FeastOccupationSelection,
} from './occupationRuntime.js';
import type { FeastSeatColor, FeastState } from './types.js';

let passed = 0;
let failed = 0;
const check = (condition: unknown, message: string): void => {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
};
const equal = (actual: unknown, expected: unknown, message: string): void =>
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const seats = (count = 1) => (['Red', 'Blue', 'Green', 'Purple'] as FeastSeatColor[]).slice(0, count)
  .map((color, index) => ({ name: `Player ${index + 1}`, color }));

interface PlannedFixture {
  state: FeastState;
  plan: FeastOccupationPlan;
}

function fixture(
  number: number, configure: (state: FeastState) => void = () => {},
  fields: Readonly<Record<string, string | number | boolean | null | readonly string[]>> = {},
  clauseIndex = 0,
): PlannedFixture {
  const state = createFeast(seats(), 8200 + number, { occupationMode: 'all' });
  state.pending = [];
  const rule = feastOccupationRule(`occupation-${number}`);
  if (!rule) throw new Error(`Missing occupation ${number}`);
  const clause = rule.clauses[clauseIndex];
  if (!clause) throw new Error(`Missing clause ${clauseIndex} for occupation ${number}`);
  state.players[0].playedOccupations = [rule.id];
  configure(state);
  const trigger = clause.triggers[0];
  const context: FeastOccupationEventContext = {
    hook: trigger.hook, event: trigger.event, window: trigger.window,
    fields: { seat: 0, ...(trigger.filter ?? {}), ...fields }, round: state.round,
    actionId: `action-${number}`, eventId: `event-${number}`,
    ...(trigger.hook === 'card-played' ? { cardId: rule.id } : {}),
  };
  const plan = feastPlanOccupationClause(state, 0, rule, clause, context);
  if (!plan) throw new Error(`Could not plan occupation ${number}:${clause.id}`);
  return { state, plan };
}

function execute(test: PlannedFixture, selection: FeastOccupationSelection): FeastOccupationExecutionSuccess {
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, selection);
  check(result.ok, `${test.plan.cardId}:${test.plan.clauseId} executes${result.ok ? '' : ` (${result.errors[0]?.message})`}`);
  if (!result.ok) throw new Error(result.errors[0]?.message ?? 'Execution failed');
  return result;
}

function operationPath(plan: FeastOccupationPlan, kind: FeastOccupationOperation['kind']): string {
  const walk = (operations: FeastOccupationPlan['operations']): string | null => {
    for (const operation of operations) {
      if (operation.kind === kind) return operation.path;
      if (operation.kind === 'choice') for (const option of operation.options) {
        const nested = walk(option.operations); if (nested) return nested;
      }
      if (operation.kind === 'replace') { const nested = walk(operation.replacement); if (nested) return nested; }
    }
    return null;
  };
  const result = walk(plan.operations);
  if (!result) throw new Error(`Missing ${kind} in ${plan.cardId}`);
  return result;
}

// ---------------------------------------------------------------------------
// All 13 canonical operation families execute through their typed path.
// ---------------------------------------------------------------------------

{
  const test = fixture(43);
  const before = test.state.players[0].goods.fruits;
  const result = execute(test, { accepted: true });
  check(result.nextState.players[0].goods.fruits === before + 1, 'transfer mutates cloned inventory');
  check(result.applied.some((entry) => entry.kind === 'inventory' && entry.item === 'fruits'), 'transfer emits applied audit mutation');
  check(test.state.players[0].goods.fruits === before, 'transfer never mutates caller state');
}

{
  const test = fixture(44, (state) => {
    state.players[0].goods.hide = 1; state.players[0].goods.wool = 1; state.players[0].goods.linen = 1;
  });
  const result = execute(test, { accepted: true });
  check(result.nextState.players[0].goods.clothing === test.state.players[0].goods.clothing + 1, 'exchange grants exact output');
  check(result.nextState.players[0].silver === test.state.players[0].silver + 3, 'exchange grants compound silver output');
  check(result.nextState.players[0].goods.hide === 0 && result.nextState.players[0].goods.wool === 0 && result.nextState.players[0].goods.linen === 0, 'exchange pays every input');
}

{
  const test = fixture(62, (state) => { state.players[0].resources.ore = 1; state.players[0].silver = 1; });
  const choicePath = operationPath(test.plan, 'choice');
  const result = execute(test, { accepted: true, choices: { [choicePath]: ['crucifix'] } });
  check(result.nextState.players[0].specials.includes('crucifix'), 'choice executes only selected option');
  check(!result.nextState.specialSupply.includes('crucifix'), 'choice consumes finite unique special supply');
  check(result.nextState.specialSupply.includes('cloakpin'), 'choice leaves unselected option supply untouched');
}

{
  const test = fixture(1, () => {}, { printedCost: 2 });
  const result = execute(test, { accepted: true });
  equal(result.modifiers.map((entry) => entry.kind), ['discount'], 'discount becomes a typed modifier registration');
}

{
  const test = fixture(4, () => {}, { action: 'hunting-game', roll: 5 });
  const result = execute(test, { accepted: true });
  check(result.modifiers.some((entry) => entry.kind === 'modify-die' && entry.delta === -1), 'modify-die becomes a typed modifier registration');
}

{
  const test = fixture(3, () => {}, { printedSilverReward: 1, rewardSource: 'action-space' });
  const before = feastWeaponConservation(test.state);
  const result = execute(test, { accepted: true });
  check(result.nextState.players[0].weapons.snare === test.state.players[0].weapons.snare + 1, 'named draw-weapons awards requested weapon');
  check(feastWeaponConservation(result.nextState) === before, 'named weapon search preserves finite physical supply');
}

{
  const test = fixture(17);
  const result = execute(test, { accepted: true });
  check(result.deferred.some((entry) => entry.kind === 'grant-action' && entry.action === 'upgrade-good'), 'grant-action is deferred to reducer orchestration');
}

{
  const test = fixture(38);
  const choicePath = operationPath(test.plan, 'choice');
  const result = execute(test, { accepted: true, choices: { [choicePath]: ['wood'] } });
  check(result.replacements.length === 1 && result.replacements[0].target === 'weapon-draw', 'replace registers original suppression target');
  check(result.nextState.players[0].resources.wood === test.state.players[0].resources.wood + 1, 'replace recursively executes selected replacement branch');
}

{
  const test = fixture(40);
  const result = execute(test, { accepted: true });
  check(result.modifiers.some((entry) => entry.kind === 'modify-rule' && entry.rule === 'placement-material'), 'modify-rule becomes a typed rule registration');
}

{
  const test = fixture(39, (state) => {
    state.players[0].ships.push({ id: 'ore-longship', type: 'longship', ore: 2, emigrated: false, emigratedRound: null });
  }, { selectedAmount: 1 });
  const path = operationPath(test.plan, 'move');
  const result = execute(test, { accepted: true, targets: { [path]: 'ore-longship' } });
  check(result.deferred.some((entry) => entry.kind === 'move' && entry.target === 'ore-longship'), 'move returns validated physical target command');
  check(result.nextState.players[0].ships.find((ship) => ship.id === 'ore-longship')?.ore === 2, 'deferred move does not bypass ship reducer');
}

{
  const test = fixture(90, (state) => {
    state.players[0].ships.push({ id: 'raid-longship', type: 'longship', ore: 1, emigrated: false, emigratedRound: null });
  }, { shipId: 'raid-longship' });
  const path = operationPath(test.plan, 'move');
  const prompt = feastOccupationPromptModel(test.state, 0, test.plan);
  check(!prompt.requests.some((entry) => entry.kind === 'target' && entry.key === path),
    'resolving Raid ship is reducer-bound without a redundant target prompt');
  const result = execute(test, { accepted: true });
  const move = result.deferred.find((entry) => entry.kind === 'move');
  const die = result.modifiers.find((entry) => entry.kind === 'modify-die');
  check(move?.target === 'raid-longship', 'bound Raid move carries the exact authoritative resolving ship');
  check(move !== undefined && die !== undefined && move.order < die.order, 'global order keeps required ore move before its die modifier');
}

{
  const test = fixture(60, (state) => {
    state.actionSpaces[0].occupants = [{ seat: 0, workers: 1, workerColor: state.players[0].activeWorkerColor, copiedFrom: null }];
  });
  const choicePath = operationPath(test.plan, 'choice');
  const workerPath = operationPath(test.plan, 'return-workers');
  const prompt = feastOccupationPromptModel(test.state, 0, test.plan);
  const workerRequest = prompt.requests.find((entry) => entry.kind === 'target' && entry.key === workerPath);
  check(workerRequest?.dependencies.some((dependency) => dependency.choicePath === choicePath && dependency.optionId === 'one-worker'), 'nested worker target declares its active choice dependency');
  const result = execute(test, { accepted: true, choices: { [choicePath]: ['one-worker'] }, targets: { [workerPath]: test.state.actionSpaces[0].id } });
  check(result.deferred.some((entry) => entry.kind === 'return-workers' && entry.quantity === 1), 'return-workers emits validated reducer command');
}

{
  const test = fixture(5);
  const result = execute(test, { accepted: true });
  check(result.deferred.some((entry) => entry.kind === 'phase' && entry.phase === 'feast' && entry.scope === 'self'), 'phase emits scoped reducer command');
}

{
  const test = fixture(189);
  test.state.players[0].boards.push(
    { id: 'explore-a', definitionId: 'shetland', kind: 'exploration', owner: 0, placements: [] },
    { id: 'explore-b', definitionId: 'iceland', kind: 'exploration', owner: 0, placements: [] },
  );
  // Re-plan after changing the scoring metric.
  const replanned = fixture(189, (state) => state.players[0].boards.push(
    { id: 'explore-a', definitionId: 'shetland', kind: 'exploration', owner: 0, placements: [] },
    { id: 'explore-b', definitionId: 'iceland', kind: 'exploration', owner: 0, placements: [] },
  ));
  const result = execute(replanned, { accepted: true });
  check(result.modifiers.some((entry) => entry.kind === 'score' && entry.currency === 'silver' && entry.amount === 4), 'score emits exact scoring registration');
}

equal(new Set([
  'transfer', 'exchange', 'choice', 'discount', 'modify-die', 'draw-weapons', 'grant-action',
  'replace', 'modify-rule', 'move', 'return-workers', 'phase', 'score',
]).size, 13, 'table covers all 13 canonical operation kinds');

// ---------------------------------------------------------------------------
// Repeats, generic item targets, physical supplies, and prompt contract.
// ---------------------------------------------------------------------------

{
  const test = fixture(47, (state) => { state.players[0].goods['salt-meat'] = 3; });
  const path = operationPath(test.plan, 'exchange');
  const result = execute(test, { accepted: true, repeats: { [path]: 2 } });
  check(result.nextState.players[0].goods['salt-meat'] === 1 && result.nextState.players[0].goods.hide === test.state.players[0].goods.hide + 2, 'declared repeat count scales both exchange sides');
  const prompt = feastOccupationPromptModel(test.state, 0, test.plan);
  check(prompt.requests.some((entry) => entry.kind === 'repeat' && entry.key === path && entry.max === 3), 'prompt exposes exact repeat range');
}

{
  const test = fixture(48, (state) => { state.players[0].goods.cattle = 1; });
  const path = operationPath(test.plan, 'exchange');
  const targetKey = path;
  const prompt = feastOccupationPromptModel(test.state, 0, test.plan);
  check(prompt.requests.some((entry) => entry.kind === 'target' && entry.key === targetKey
    && entry.options.some((option) => option.id === 'cattle')), 'prompt exposes canonical generic farm-animal target key and legal option');
  const selection = { accepted: true, targets: { [targetKey]: 'cattle' } } as const;
  check(feastValidateOccupationSelection(test.state, 0, test.plan, selection) === null, 'prompt selection is accepted by stable runtime validator');
  const result = execute(test, selection);
  check(result.nextState.players[0].goods.cattle === 0 && result.nextState.players[0].goods.jewelry === test.state.players[0].goods.jewelry + 1, 'generic farm-animal selection resolves to concrete inventory');
}

{
  const test = fixture(9, (state) => {
    state.players[0].ships.push({ id: 'placement-longship', type: 'longship', ore: 0, emigrated: false, emigratedRound: null });
  });
  const path = operationPath(test.plan, 'transfer');
  const home = test.state.players[0].boards.find((board) => board.kind === 'home')!;
  const prompt = feastOccupationPromptModel(test.state, 0, test.plan);
  check(prompt.requests.some((entry) => entry.kind === 'target' && entry.key === path
    && entry.options.some((option) => option.id === home.id)), 'prompt exposes direct-placement board target');
  const result = execute(test, { accepted: true, targets: { [path]: home.id } });
  check(result.deferred.some((entry) => entry.kind === 'placement' && entry.destination === 'immediate-home-or-exploration-placement'), 'direct-placement reward is deferred with typed items');
  check(result.nextState.players[0].resources.ore === test.state.players[0].resources.ore, 'direct-placement reward does not leak into ordinary inventory');
}

{
  const test = fixture(69);
  const before = feastWeaponConservation(test.state);
  const result = execute(test, { accepted: true });
  equal(result.nextState.players[0].weapons, { bow: 2, snare: 2, spear: 2, 'long-sword': 2 }, 'fill-to-count draws each named weapon up to target count');
  check(feastWeaponConservation(result.nextState) === before, 'fill-to-count weapon search preserves physical-plus-substitute conservation');
}

{
  const test = fixture(184, (state) => { state.players[0].resources.wood = 4; state.players[0].resources.ore = 3; });
  const choicePath = operationPath(test.plan, 'choice');
  const movePath = operationPath(test.plan, 'move');
  const result = execute(test, { accepted: true, choices: { [choicePath]: ['wood'] }, targets: { [movePath]: 'new-longship' } });
  check(result.nextState.players[0].ships.some((ship) => ship.type === 'longship'), 'compound choice atomically creates finite-berth ship');
  check(result.deferred.some((entry) => entry.kind === 'move' && entry.to === 'new-longship'), 'compound choice defers ore move to newly created ship');
}

{
  const configure = (state: FeastState): void => {
    const player = state.players[0];
    const home = player.boards.find((board) => board.kind === 'home')!;
    player.specials.push('cloakpin');
    state.specialSupply.splice(state.specialSupply.indexOf('cloakpin'), 1);
    home.placements.push({ id: 'placed-cloakpin', pieceKind: 'special', pieceId: 'cloakpin', color: 'blue',
      x: 0, y: 0, rotation: 0, mask: ['#'], covered: [{ x: 0, y: 0 }] });
    player.boards.push({ id: 'unrelated-shed', definitionId: 'shed', kind: 'building', owner: 0, placements: [] });
  };
  const test = fixture(70, configure, { cloakpinLocation: 'board' });
  const movePath = operationPath(test.plan, 'move');
  const placementPath = operationPath(test.plan, 'transfer');
  const prompt = feastOccupationPromptModel(test.state, 0, test.plan);
  const placementRequest = prompt.requests.find((entry) => entry.kind === 'target' && entry.key === placementPath);
  check(placementRequest?.kind === 'target' && placementRequest.options.some((option) => option.id === 'placed-cloakpin')
    && !placementRequest.options.some((option) => option.id === 'unrelated-shed'), 'vacated-cell prompt offers only the matching committed special placement');
  const result = execute(test, { accepted: true, targets: { [movePath]: 'placed-cloakpin', [placementPath]: 'placed-cloakpin' } });
  check(result.deferred.filter((entry) => entry.kind === 'move' || entry.kind === 'placement').length === 2, 'vacated-cell compound effect preserves ordered move and placement commands');

  const forged = fixture(70, configure, { cloakpinLocation: 'board' });
  const forgedMove = operationPath(forged.plan, 'move');
  const forgedPlacement = operationPath(forged.plan, 'transfer');
  const rejected = feastExecuteOccupationPlan(forged.state, 0, forged.plan, { accepted: true,
    targets: { [forgedMove]: 'placed-cloakpin', [forgedPlacement]: 'unrelated-shed' } });
  check(!rejected.ok && rejected.errors[0]?.code === 'target', 'vacated-cell reward rejects unrelated forged board target');
}

{
  const test = fixture(62, (state) => { state.players[0].resources.ore = 1; state.players[0].silver = 1; });
  const prompt = feastOccupationPromptModel(test.state, 0, test.plan);
  const choice = prompt.requests.find((entry) => entry.kind === 'choice');
  check(prompt.requests[0]?.kind === 'confirmation' && prompt.requests[0].mandatory === false, 'prompt begins with explicit optional confirmation');
  check(choice?.kind === 'choice' && choice.min === 1 && choice.max === 1
    && choice.options.some((option) => option.id === 'crucifix'), 'prompt exposes declared choice cardinality and option ids');
  check(prompt.planKey === test.plan.usage.key && prompt.cardNumber === 62 && prompt.sourceText.length > 0, 'prompt exposes stable server plan key and authentic card provenance');
}

// ---------------------------------------------------------------------------
// Forged/invalid selections and cumulative failures reject atomically.
// ---------------------------------------------------------------------------

{
  const test = fixture(43);
  const before = JSON.stringify(test.state);
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, { accepted: true, targets: { forged: 'silver' } });
  check(!result.ok && result.errors[0]?.code === 'selection', 'surplus forged target key rejects');
  check(JSON.stringify(test.state) === before, 'forged target rejection leaves caller state byte-identical');
}

{
  const test = fixture(62, (state) => { state.players[0].resources.ore = 1; state.players[0].silver = 1; });
  const path = operationPath(test.plan, 'choice');
  const before = JSON.stringify(test.state);
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, { accepted: true, choices: { [path]: ['not-a-real-option'] } });
  check(!result.ok && result.errors[0]?.message.includes('Unknown option'), 'unknown choice id rejects');
  check(JSON.stringify(test.state) === before, 'unknown choice rejection is atomic');
}

{
  const test = fixture(47, (state) => { state.players[0].goods['salt-meat'] = 2; });
  const path = operationPath(test.plan, 'exchange');
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, { accepted: true, repeats: { [path]: 3 } });
  check(!result.ok && result.errors[0]?.message.includes('0-2'), 'repeat above server-planned maximum rejects');
}

{
  const test = fixture(48, (state) => { state.players[0].goods.cattle = 1; });
  const path = operationPath(test.plan, 'exchange');
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, { accepted: true, targets: { [path]: 'sheep' } });
  check(!result.ok && result.errors[0]?.code === 'target', 'wrong constrained generic target rejects');
}

{
  const test = fixture(85, (state) => { state.players[0].silver = 2; });
  const path = operationPath(test.plan, 'choice');
  const before = JSON.stringify(test.state);
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, { accepted: true, choices: { [path]: ['hunt', 'snare'] } });
  check(!result.ok && result.errors[0]?.code === 'inventory', 'cumulative selected-branch overspend rejects');
  check(JSON.stringify(test.state) === before, 'cumulative failure discards partial clone and deferred commands');
}

{
  const test = fixture(39, (state) => {
    state.players[0].ships.push({ id: 'empty-longship', type: 'longship', ore: 0, emigrated: false, emigratedRound: null });
  }, { selectedAmount: 0 });
  // Card 39 removes exactly one added ore per activation. With no removable
  // ore, the plan is unavailable; a positive source still requires an exact
  // owned physical ship target.
  const positive = fixture(39, (state) => {
    state.players[0].ships.push({ id: 'armed-longship', type: 'longship', ore: 1, emigrated: false, emigratedRound: null });
  }, { selectedAmount: 1 });
  const path = operationPath(positive.plan, 'move');
  const result = feastExecuteOccupationPlan(positive.state, 0, positive.plan, { accepted: true, targets: { [path]: 'not-owned' } });
  check(!result.ok && result.errors[0]?.code === 'target', 'forged physical ship id rejects');
  check(!test.plan.valid, 'card 39 is unavailable when no added ship ore can be removed');
}

{
  const test = fixture(43);
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, { accepted: false });
  check(!result.ok && result.errors[0]?.message.includes('mandatory'), 'mandatory effect cannot be declined');
}

{
  const test = fixture(44, (state) => { state.players[0].goods.hide = 1; state.players[0].goods.wool = 1; state.players[0].goods.linen = 1; });
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, { accepted: false });
  check(result.ok && !result.accepted && result.usage === null && result.applied.length === 0, 'declined optional plan records no usage or mutation');
}

{
  const test = fixture(43);
  test.state.players[0].playedOccupations = [];
  const result = feastExecuteOccupationPlan(test.state, 0, test.plan, { accepted: true });
  check(!result.ok && result.errors[0]?.code === 'ownership', 'executor requires owned played card capability');
}

{
  const test = fixture(43);
  const forged = structuredClone(test.plan);
  const operation = forged.operations[0];
  if (operation.kind !== 'transfer') throw new Error('Expected transfer fixture');
  (operation as { operation: FeastOccupationOperation }).operation = { ...operation.operation, mode: 'discard' };
  const result = feastExecuteOccupationPlan(test.state, 0, forged, { accepted: true });
  check(!result.ok && result.errors[0]?.code === 'plan' && result.errors[0]?.message.includes('canonical'), 'tampered planned operation rejects against registry contract');
}

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`${passed}/${passed} occupation executor checks passed`);
}
