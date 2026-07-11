// Server-owned occupation decision/cursor coverage.
// Run: npx tsx shared/src/feast/occupation-decisions-test.ts

import {
  FEAST_OCCUPATION_RULE_LIST,
  type FeastOccupationClause,
  type FeastOccupationOperation,
  type FeastRuleValue,
} from './occupationRules.js';
import {
  feastCreateOccupationDecisionCursor,
  feastDecodeOccupationDecisionChoice,
  feastDecodeOccupationDecisionStep,
  feastOccupationDecisionSequence,
  feastOccupationDecisionSpec,
  type FeastOccupationDecisionCursor,
} from './occupationDecisions.js';
import {
  feastPlanOccupationClause,
  type FeastOccupationEventContext,
  type FeastOccupationPlan,
  type FeastOccupationPlannedOperation,
  type FeastOccupationResolvedItem,
} from './occupationRuntime.js';
import { FEAST_ACTION_BY_ID, FEAST_GOOD_IDS } from './data.js';
import { createFeast } from './state.js';
import type {
  FeastDecisionChoice,
  FeastGood,
  FeastState,
} from './types.js';

let passed = 0;
let failed = 0;
const check = (condition: unknown, message: string): void => {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
};
const equal = (actual: unknown, expected: unknown, message: string): void =>
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const base = (path: string, disposition: FeastOccupationPlannedOperation['disposition']) => ({
  path, disposition, valid: true, issues: [], automaticDeltas: [],
});

function resolved(
  item: FeastOccupationResolvedItem['item'], quantity = 1,
  extra: Partial<FeastOccupationResolvedItem> = {},
): FeastOccupationResolvedItem {
  return {
    item, quantity, owned: 20, available: null, needsSelection: true, ...extra,
  };
}

let fixtureNumber = 0;
function fixturePlan(
  operations: FeastOccupationPlannedOperation[],
  options: Partial<Pick<FeastOccupationPlan, 'requirement' | 'kind' | 'automatic' | 'requiresConfirmation'>> = {},
): FeastOccupationPlan {
  fixtureNumber++;
  const requirement = options.requirement ?? 'mandatory';
  return {
    cardId: 'occupation-1', cardNumber: 1, cardName: `Decision Fixture ${fixtureNumber}`,
    clauseId: `fixture-${fixtureNumber}`,
    trigger: { hook: 'card-played', event: 'occupation-played', window: 'after' },
    requirement, limit: 'unlimited',
    usage: {
      key: `occupation-1:fixture-${fixtureNumber}:unlimited`, cardId: 'occupation-1',
      clauseId: `fixture-${fixtureNumber}`, limit: 'unlimited', round: 1,
    },
    kind: options.kind ?? 'compound',
    automatic: options.automatic ?? false,
    requiresConfirmation: options.requiresConfirmation ?? true,
    valid: true, issues: [], operations, automaticDeltas: [],
  };
}

function transfer(
  path: string, mode: 'gain' | 'pay' | 'discard' | 'return',
  items: FeastOccupationResolvedItem[], destination?: string,
  disposition: FeastOccupationPlannedOperation['disposition'] = 'prompt',
): Extract<FeastOccupationPlannedOperation, { kind: 'transfer' }> {
  const sourceItems = items.map((item) => ({
    item: item.item, quantity: item.quantity, ...(item.id ? { id: item.id } : {}),
    ...(item.state ? { state: item.state } : {}),
  }));
  return {
    kind: 'transfer',
    operation: { kind: 'transfer', mode, items: sourceItems, ...(destination ? { destination } : {}) },
    items, ...base(path, disposition),
  };
}

function richState(): FeastState {
  const state = createFeast([{ name: 'Decision Tester', color: 'Red' }], 8_020_190, {
    length: 'short', occupationMode: 'all', soloStartingOccupation: 'random',
  });
  state.pending = [];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  const player = state.players[0];
  player.silver = 100;
  player.resources = { wood: 20, stone: 20, ore: 20 };
  for (const id of FEAST_GOOD_IDS) player.goods[id] = 10;
  player.weapons = { bow: 5, snare: 4, spear: 3, 'long-sword': 2 };
  player.occupationHand = ['occupation-2', 'occupation-3', 'occupation-4'];
  player.ships = [
    { id: 'whaler-decision', type: 'whaling-boat', ore: 1, emigrated: false, emigratedRound: null },
    { id: 'knarr-decision', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'longship-decision', type: 'longship', ore: 3, emigrated: false, emigratedRound: null },
  ];
  player.boards.push(
    { id: 'decision-house', definitionId: 'stone-house', kind: 'building', owner: 0, placements: [] },
    { id: 'decision-shed', definitionId: 'shed', kind: 'building', owner: 0, placements: [] },
    { id: 'decision-exploration', definitionId: 'iceland', kind: 'exploration', owner: 0, placements: [] },
  );
  const occupied = state.actionSpaces[0];
  occupied.occupants = [{ seat: 0, workers: 2, workerColor: 'Red', copiedFrom: null }];
  return state;
}

function current(
  state: FeastState, plan: FeastOccupationPlan, cursor?: FeastOccupationDecisionCursor,
) {
  return feastOccupationDecisionSequence(state, 0, plan, cursor ?? feastCreateOccupationDecisionCursor(plan));
}

function advance(
  state: FeastState, plan: FeastOccupationPlan, cursor: FeastOccupationDecisionCursor,
  choice: FeastDecisionChoice,
): FeastOccupationDecisionCursor {
  const result = feastDecodeOccupationDecisionStep(state, 0, plan, cursor, choice);
  check(result.ok, result.ok ? `advanced ${plan.clauseId}` : `${plan.clauseId}: ${result.error}`);
  if (!result.ok) throw new Error(result.error);
  return result.cursor;
}

function optionIdContaining(sequence: ReturnType<typeof current>, text: string): string {
  const option = sequence.decision?.options.find((candidate) =>
    candidate.label.toLowerCase().includes(text.toLowerCase())
    || candidate.detail?.toLowerCase().includes(text.toLowerCase()));
  if (!option) throw new Error(`Missing option containing ${text}`);
  return option.id;
}

const state = richState();

// ---------------------------------------------------------------------------
// Automatic confirmation and optional decline.
// ---------------------------------------------------------------------------

const automaticPath = 'occupation-1.auto.operations[0]';
const automaticPlan = fixturePlan([
  transfer(automaticPath, 'gain', [resolved('silver', 2, { needsSelection: false })], undefined, 'automatic'),
], { kind: 'automatic', automatic: true, requiresConfirmation: false });
const automaticSpec = feastOccupationDecisionSpec(state, 0, automaticPlan);
equal(automaticSpec.meta.mode, 'automatic-confirm', 'automatic plan has a tutorial-safe confirmation shape');
equal(automaticSpec.options, [], 'automatic confirmation accepts no client-authored operation options');
equal([automaticSpec.meta.cardId, automaticSpec.meta.clauseId, automaticSpec.meta.requirement, automaticSpec.meta.repeatMax],
  [automaticPlan.cardId, automaticPlan.clauseId, 'mandatory', 0], 'stable occupation metadata is always present');
const automaticSequence = current(state, automaticPlan);
check(automaticSequence.complete && automaticSequence.selection?.accepted === true, 'normal sequence auto-completes a mandatory automatic plan');
check(feastDecodeOccupationDecisionChoice(state, 0, automaticPlan, { accepted: true }).ok, 'automatic one-shot confirmation decodes');

const optionalPlan = fixturePlan([
  transfer('occupation-1.optional.operations[0]', 'gain', [resolved('silver', 1, { needsSelection: false })], undefined, 'automatic'),
], { requirement: 'optional', kind: 'automatic', automatic: false, requiresConfirmation: true });
let sequence = current(state, optionalPlan);
equal(sequence.decision?.meta.mode, 'confirm', 'optional effect begins with confirmation');
let cursor = advance(state, optionalPlan, sequence.cursor, { accepted: false });
sequence = current(state, optionalPlan, cursor);
check(sequence.complete && sequence.selection?.accepted === false, 'optional decline completes without later requests');
const declinedWithPayload = feastDecodeOccupationDecisionStep(state, 0, optionalPlan,
  current(state, optionalPlan).cursor, { accepted: false, optionIds: ['forged'] });
check(!declinedWithPayload.ok, 'decline rejects hidden payload selections');

// ---------------------------------------------------------------------------
// Declared choices, branch dependencies, and forged option rejection.
// ---------------------------------------------------------------------------

const choicePath = 'occupation-1.choice.operations[0]';
const nestedPath = `${choicePath}.options.workers.operations[0]`;
const choicePlan = fixturePlan([{
  kind: 'choice',
  operation: { kind: 'choice', min: 1, max: 1, options: [
    { id: 'silver', operations: [{ kind: 'transfer', mode: 'gain', items: [{ item: 'silver', quantity: 1 }] }] },
    { id: 'workers', operations: [{ kind: 'return-workers', quantity: 1, parameters: { from: 'one-action-space', to: 'thing-square' } }] },
  ] },
  min: 1, max: 1,
  options: [
    {
      id: 'silver', valid: true, issues: [], operations: [
        transfer(`${choicePath}.options.silver.operations[0]`, 'gain', [resolved('silver', 1, { needsSelection: false })], undefined, 'automatic'),
      ],
    },
    {
      id: 'workers', valid: true, issues: [], operations: [{
        kind: 'return-workers', operation: { kind: 'return-workers', quantity: 1, parameters: { from: 'one-action-space', to: 'thing-square' } },
        quantity: 1, ...base(nestedPath, 'prompt'),
      }],
    },
  ],
  ...base(choicePath, 'prompt'),
}], { kind: 'choice' });
sequence = current(state, choicePlan);
cursor = advance(state, choicePlan, sequence.cursor, { accepted: true });
sequence = current(state, choicePlan, cursor);
equal(sequence.decision?.meta.mode, 'choice', 'declared choice projects to a choice request');
check(sequence.decision?.options.every((option) => option.id.startsWith('occ:v1:choice:')) === true, 'choice ids use documented opaque encoding');
const forgedChoice = feastDecodeOccupationDecisionStep(state, 0, choicePlan, sequence.cursor,
  { optionIds: ['occ:v1:choice:forged:workers'] });
check(!forgedChoice.ok && /Unknown occupation option/.test(forgedChoice.error), 'forged declared option is rejected');
cursor = advance(state, choicePlan, sequence.cursor, { optionIds: [optionIdContaining(sequence, 'workers')] });
sequence = current(state, choicePlan, cursor);
equal(sequence.decision?.meta.targetKind, 'action-space', 'selected nested branch reveals its worker target request');
cursor = advance(state, choicePlan, sequence.cursor, { optionIds: [sequence.decision!.options[0].id] });
sequence = current(state, choicePlan, cursor);
check(sequence.complete, 'nested choice and target complete sequentially');
equal(sequence.selection?.choices?.[choicePath], ['workers'], 'declared choice accumulates at exact executor path');
equal(sequence.selection?.targets?.[nestedPath], state.actionSpaces[0].id, 'nested worker target accumulates at exact executor path');

// Choosing the other branch must skip the inactive worker request.
let alternate = current(state, choicePlan);
let alternateCursor = advance(state, choicePlan, alternate.cursor, { accepted: true });
alternate = current(state, choicePlan, alternateCursor);
alternateCursor = advance(state, choicePlan, alternate.cursor, { optionIds: [optionIdContaining(alternate, 'silver')] });
alternate = current(state, choicePlan, alternateCursor);
check(alternate.complete && !alternate.selection?.targets?.[nestedPath], 'inactive nested branch request is skipped');

// ---------------------------------------------------------------------------
// Repeat requests and weapon-card allocations.
// ---------------------------------------------------------------------------

const repeatPath = 'occupation-1.repeat.operations[0]';
const weaponItem = resolved('weapon-card', 2, { state: { anyTypes: true }, owned: 14 });
const repeatPlan = fixturePlan([{
  kind: 'exchange',
  operation: {
    kind: 'exchange',
    from: [{ item: 'weapon-card', quantity: 2, state: { anyTypes: true } }],
    to: [{ item: 'ore', quantity: 1 }], repeat: 'unlimited',
  },
  from: [weaponItem],
  to: [resolved('ore', 1, { needsSelection: false })],
  maximumRepeats: 3,
  ...base(repeatPath, 'prompt'),
}], { requirement: 'optional', kind: 'choice' });
sequence = current(state, repeatPlan);
cursor = advance(state, repeatPlan, sequence.cursor, { accepted: true });
sequence = current(state, repeatPlan, cursor);
equal([sequence.decision?.meta.mode, sequence.decision?.meta.repeatMax], ['repeat', 3], 'repeat request exposes stable repeatMax');
cursor = advance(state, repeatPlan, sequence.cursor, { amount: 2 });
sequence = current(state, repeatPlan, cursor);
equal(sequence.decision?.meta.targetKind, 'weapon', 'repeat payment asks for weapon cards');
equal(sequence.decision?.meta.requiredCount, 4, 'per-repeat target resolves exact accumulated quantity');
const bowId = optionIdContaining(sequence, 'bow');
const snareId = optionIdContaining(sequence, 'snare');
const overCap = feastDecodeOccupationDecisionStep(state, 0, repeatPlan, sequence.cursor,
  { allocations: [{ id: bowId, amount: 99 }] });
check(!overCap.ok, 'forged weapon allocation over server cap is rejected');
cursor = advance(state, repeatPlan, sequence.cursor, {
  allocations: [{ id: bowId, amount: 2 }, { id: snareId, amount: 2 }],
});
sequence = current(state, repeatPlan, cursor);
check(sequence.complete, 'repeat plus allocated payment completes sequentially');
equal(sequence.selection?.repeats?.[repeatPath], 2, 'repeat count accumulated by operation path');
equal(sequence.selection?.targets?.[repeatPath], ['bow', 'bow', 'snare', 'snare'], 'weapon-card allocation decodes to concrete card ids at executor convenience path');

// A zero repeat skips the dependent target request entirely.
let zeroRepeat = current(state, repeatPlan);
let zeroCursor = advance(state, repeatPlan, zeroRepeat.cursor, { accepted: true });
zeroRepeat = current(state, repeatPlan, zeroCursor);
zeroCursor = advance(state, repeatPlan, zeroRepeat.cursor, { amount: 0 });
zeroRepeat = current(state, repeatPlan, zeroCursor);
check(zeroRepeat.complete && zeroRepeat.selection?.repeats?.[repeatPath] === 0, 'zero repetitions skip item target request');

// ---------------------------------------------------------------------------
// Every supported generic item selection accumulates across flat requests.
// ---------------------------------------------------------------------------

const itemPath = 'occupation-1.items.operations[0]';
const itemPlan = fixturePlan([
  transfer(itemPath, 'pay', [
    resolved('good', 1, { id: '$selected-type', state: { excludeAnimals: true } }),
    resolved('building-resource'),
    resolved('weapon-card', 2, { state: { anyTypes: true } }),
    resolved('occupation-card'),
    resolved('ship'),
    resolved('house'),
    resolved('farm-animal', 1, { id: 'sheep', state: { pregnancy: 'either' } }),
  ]),
], { kind: 'choice' });
sequence = current(state, itemPlan);
cursor = advance(state, itemPlan, sequence.cursor, { accepted: true });
const expectedTargetKinds = ['good', 'resource', 'weapon', 'occupation', 'ship', 'board', 'good'];
for (let index = 0; index < expectedTargetKinds.length; index++) {
  sequence = current(state, itemPlan, cursor);
  equal(sequence.decision?.meta.targetKind, expectedTargetKinds[index], `generic item ${index} has correct visual target kind`);
  check(sequence.decision?.options.length, `generic item ${index} derives options from state`);
  if (index === 2) {
    cursor = advance(state, itemPlan, sequence.cursor, {
      allocations: [
        { id: optionIdContaining(sequence, 'bow'), amount: 1 },
        { id: optionIdContaining(sequence, 'snare'), amount: 1 },
      ],
    });
  } else {
    cursor = advance(state, itemPlan, sequence.cursor, { optionIds: [sequence.decision!.options[0].id] });
  }
}
sequence = current(state, itemPlan, cursor);
check(sequence.complete, 'seven heterogeneous item requests accumulate and finish');
const itemTargets = sequence.selection?.targets ?? {};
for (let index = 0; index < expectedTargetKinds.length; index++) {
  check(itemTargets[`${itemPath}.items[${index}]`] !== undefined, `generic item ${index} stored at canonical .items key`);
}
equal(itemTargets[`${itemPath}.items[2]`], ['bow', 'snare'], 'weapon-card mixed allocation is preserved');
check(String(itemTargets[`${itemPath}.items[3]`]).startsWith('occupation-'), 'occupation-card choice comes only from player hand');
check(['whaling-boat', 'knarr', 'longship'].includes(String(itemTargets[`${itemPath}.items[4]`])), 'ship selection decodes a declared ship type');
check(['stone-house', 'long-house'].includes(String(itemTargets[`${itemPath}.items[5]`])), 'house selection decodes a declared house type');
check(['sheep', 'pregnant-sheep'].includes(String(itemTargets[`${itemPath}.items[6]`])), 'farm-animal choice respects requested animal');

// ---------------------------------------------------------------------------
// Placement destinations, move sources, and worker-return targets.
// ---------------------------------------------------------------------------

const placementPath = 'occupation-1.targets.operations[0]';
const movePath = 'occupation-1.targets.operations[1]';
const workersPath = 'occupation-1.targets.operations[2]';
const targetPlan = fixturePlan([
  transfer(placementPath, 'gain', [resolved('oil', 1, { needsSelection: false })], 'immediate-home-or-exploration-placement', 'prompt'),
  {
    kind: 'move',
    operation: { kind: 'move', subject: { item: 'ore', quantity: 1 }, from: 'whaling-boat-or-longship', to: 'supply' },
    subject: resolved('ore', 1, { needsSelection: false }),
    ...base(movePath, 'prompt'),
  },
  {
    kind: 'return-workers',
    operation: { kind: 'return-workers', quantity: 1, parameters: { from: 'one-action-space', to: 'thing-square' } },
    quantity: 1,
    ...base(workersPath, 'prompt'),
  },
], { kind: 'compound' });
sequence = current(state, targetPlan);
cursor = advance(state, targetPlan, sequence.cursor, { accepted: true });
sequence = current(state, targetPlan, cursor);
equal([sequence.decision?.meta.targetKind, sequence.decision?.meta.requestKey], ['board', placementPath], 'direct placement asks for an owned board destination');
cursor = advance(state, targetPlan, sequence.cursor, { optionIds: [optionIdContaining(sequence, 'home')] });
sequence = current(state, targetPlan, cursor);
equal([sequence.decision?.meta.targetKind, sequence.decision?.meta.requestKey], ['ship', movePath], 'ore move asks for an eligible physical ship');
cursor = advance(state, targetPlan, sequence.cursor, { optionIds: [optionIdContaining(sequence, 'longship')] });
sequence = current(state, targetPlan, cursor);
equal([sequence.decision?.meta.targetKind, sequence.decision?.meta.requestKey], ['action-space', workersPath], 'worker return asks for an occupied action space');
cursor = advance(state, targetPlan, sequence.cursor, { optionIds: [sequence.decision!.options[0].id] });
sequence = current(state, targetPlan, cursor);
check(sequence.complete, 'placement, move, and worker targets complete sequentially');
check(typeof sequence.selection?.targets?.[placementPath] === 'string', 'placement destination is server-derived board id');
equal(sequence.selection?.targets?.[movePath], 'longship-decision', 'move target is server-derived physical ship id');
equal(sequence.selection?.targets?.[workersPath], state.actionSpaces[0].id, 'worker target is server-derived action-space id');

// A stale option from the move request cannot be replayed at the worker step.
let stale = current(state, targetPlan);
let staleCursor = advance(state, targetPlan, stale.cursor, { accepted: true });
stale = current(state, targetPlan, staleCursor);
staleCursor = advance(state, targetPlan, stale.cursor, { optionIds: [stale.decision!.options[0].id] });
stale = current(state, targetPlan, staleCursor);
const staleMoveId = stale.decision!.options[0].id;
staleCursor = advance(state, targetPlan, stale.cursor, { optionIds: [staleMoveId] });
stale = current(state, targetPlan, staleCursor);
const staleResult = feastDecodeOccupationDecisionStep(state, 0, targetPlan, stale.cursor, { optionIds: [staleMoveId] });
check(!staleResult.ok && /Unknown occupation option/.test(staleResult.error), 'option capability cannot be replayed across sequential requests');

// ---------------------------------------------------------------------------
// Exhaustive registry projection and all five runtime dispositions.
// ---------------------------------------------------------------------------

function planningContext(clause: FeastOccupationClause): FeastOccupationEventContext {
  const trigger = clause.triggers[0];
  return {
    hook: trigger.hook, event: trigger.event, window: trigger.window,
    seat: 0, round: state.round, actionId: 'decision-action', eventId: 'decision-event',
    fields: {
      seat: 0, round: state.round, amount: 1, batchAmount: 1, selectedAmount: 1,
      shipId: 'longship-decision', ...(trigger.filter ?? {}),
    } as Record<string, FeastRuleValue>,
    available: { belt: 1, cloakpin: 1, crucifix: 1, 'stone-house': 3 },
  };
}

function walk(operations: readonly FeastOccupationPlannedOperation[]): FeastOccupationPlannedOperation[] {
  const result: FeastOccupationPlannedOperation[] = [];
  for (const operation of operations) {
    result.push(operation);
    if (operation.kind === 'choice') for (const option of operation.options) result.push(...walk(option.operations));
    if (operation.kind === 'replace') result.push(...walk(operation.replacement));
  }
  return result;
}

const projectedCards = new Set<string>();
const dispositions = new Set<string>();
let projectedClauses = 0;
for (const rule of FEAST_OCCUPATION_RULE_LIST) for (const clause of rule.clauses) {
  const unconditional: FeastOccupationClause = { ...clause, condition: undefined };
  const plan = feastPlanOccupationClause(state, 0, rule, unconditional, planningContext(unconditional));
  check(plan !== null, `${rule.id}.${clause.id}: creates decision plan`);
  if (!plan) continue;
  projectedCards.add(rule.id);
  projectedClauses++;
  for (const operation of walk(plan.operations)) dispositions.add(operation.disposition);
  const spec = feastOccupationDecisionSpec(state, 0, plan);
  equal(spec.kind, 'card-effect', `${rule.id}.${clause.id}: projects to card-effect`);
  equal([spec.meta.cardId, spec.meta.clauseId, spec.meta.requirement],
    [plan.cardId, plan.clauseId, plan.requirement], `${rule.id}.${clause.id}: stable identity metadata`);
  check(typeof spec.meta.mode === 'string' && typeof spec.meta.repeatMax === 'number', `${rule.id}.${clause.id}: stable mode and repeat metadata`);
  check(spec.options.every((option) => option.id.startsWith('occ:v1:')), `${rule.id}.${clause.id}: every selectable value uses opaque v1 id`);
}
equal(projectedCards.size, 190, 'all 190 occupation cards project into the decision contract');
check(projectedClauses > 190, 'every occupation clause, including compound cards, projects');
equal([...dispositions].sort(), ['automatic', 'deferred', 'modifier', 'prompt', 'replacement'], 'all five runtime operation dispositions are exhaustively projected');

// Ensure the test's handcrafted operation source shapes remain valid rule ops.
const operationKinds = new Set<FeastOccupationOperation['kind']>();
for (const rule of FEAST_OCCUPATION_RULE_LIST) for (const clause of rule.clauses) for (const operation of clause.operations) operationKinds.add(operation.kind);
check(operationKinds.has('transfer') && operationKinds.has('choice') && operationKinds.has('exchange'), 'decision fixtures exercise real registry operation families');

console.log(`${passed}/${passed + failed} occupation decision checks passed`);
if (failed) process.exit(1);
