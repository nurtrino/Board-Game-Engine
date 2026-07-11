/**
 * Public-reducer integration coverage for the four action-proposed occupation
 * replacements in the classic base game: 102, 105, 107, and 185.
 *
 * The tests install an already-played occupation as fixture setup, but every
 * worker placement, occupation decision, printed decision, and continuation
 * enters through applyFeastAction. Invalid and stale responses are checked for
 * atomic rejection at the same public boundary.
 *
 * Run: npx tsx shared/src/feast/occupation-action-replacement-reducer-integration-test.ts
 */

import {
  applyFeastAction,
  createFeast,
  type FeastAction,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastSeatColor,
  type FeastShipType,
  type FeastState,
} from './index.js';

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string): asserts condition {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`,
  );
}

function scenario(name: string, body: () => void): void {
  try {
    body();
  } catch (error) {
    failed++;
    console.error(`FAIL: ${name} aborted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const COLOR: FeastSeatColor = 'Red';

function fresh(seed: number): FeastState {
  const state = createFeast([{ name: 'Replacement Tester', color: COLOR }], seed, {
    occupationMode: 'all',
  });
  state.pending = [];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  state.firstPlayer = 0;
  state.mountains = [{ id: 'replacement-mountain', items: ['wood', 'stone', 'ore'] }];
  const player = state.players[0];
  player.passed = false;
  player.turnActionTaken = false;
  player.turnMayEnd = false;
  player.turnEffectUsed = false;
  player.turnActionId = null;
  player.fourthOccupationAfter = false;
  return state;
}

function cardId(number: number): string {
  return `occupation-${number}`;
}

function removeCardEverywhere(state: FeastState, id: string): void {
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  state.occupationDiscard = state.occupationDiscard.filter((candidate) => candidate !== id);
  state.occupationUsage = state.occupationUsage.filter((entry) => entry.cardId !== id);
  state.occupationReplacements = state.occupationReplacements.filter((entry) => entry.cardId !== id);
  for (const player of state.players) {
    player.occupationHand = player.occupationHand.filter((candidate) => candidate !== id);
    player.playedOccupations = player.playedOccupations.filter((candidate) => candidate !== id);
    player.occupationUses = player.occupationUses.filter((entry) => entry.cardId !== id);
  }
}

function markPlayed(state: FeastState, number: number): void {
  const id = cardId(number);
  removeCardEverywhere(state, id);
  state.players[0].playedOccupations.push(id);
  state.players[0].occupationUses.push({
    cardId: id, round: state.round, usesThisRound: 0, usedOnce: false,
  });
}

function addShip(state: FeastState, type: FeastShipType, id: string, ore = 0): void {
  state.players[0].ships.push({ id, type, ore, emigrated: false, emigratedRound: null });
}

function apply(state: FeastState, action: FeastAction): ReturnType<typeof applyFeastAction> {
  return applyFeastAction(state, 0, action);
}

function mustApply(state: FeastState, action: FeastAction, message: string): void {
  const result = apply(state, action);
  check(result.ok, `${message}${result.ok ? '' : ` (${result.error})`}`);
  if (!result.ok) throw new Error(`${message}: ${result.error}`);
}

function head(state: FeastState, kind?: FeastPendingDecision['kind']): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, `pending ${kind ?? 'decision'} exists`);
  if (!decision) throw new Error(`Missing pending ${kind ?? 'decision'}`);
  if (kind) {
    check(decision.kind === kind, `pending decision kind is ${kind} (got ${decision.kind})`);
    if (decision.kind !== kind) throw new Error(`Expected ${kind}, got ${decision.kind}`);
  }
  return decision;
}

function resolve(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice,
  message: string,
): void {
  mustApply(state, {
    type: 'resolve_decision', decisionId: decision.id, choice,
  }, message);
}

function rejectAtomic(
  state: FeastState, decisionId: string, choice: FeastDecisionChoice, message: string,
): void {
  const before = JSON.stringify(state);
  const result = apply(state, { type: 'resolve_decision', decisionId, choice });
  check(!result.ok, `${message}: reducer rejects`);
  equal(JSON.stringify(state), before, `${message}: rejection is atomic`);
}

function replacementConfirmation(state: FeastState, number: number): FeastPendingDecision {
  const decision = head(state, 'card-effect');
  const correctCard = decision.meta?.cardId === cardId(number);
  const replacement = decision.meta?.requirement === 'replacement';
  const confirmation = decision.meta?.requestKind === 'confirmation';
  check(correctCard, `card ${number} owns the replacement confirmation`);
  check(replacement, `card ${number} is identified as an optional replacement`);
  check(confirmation, `card ${number} starts at a confirmation boundary`);
  if (!correctCard || !replacement || !confirmation) throw new Error(`Malformed card ${number} replacement decision`);
  return decision;
}

function optionMatching(decision: FeastPendingDecision, pattern: RegExp): string {
  const option = decision.options.find((candidate) => pattern.test(`${candidate.label} ${candidate.detail ?? ''}`));
  check(!!option, `${decision.label} offers ${pattern}`);
  if (!option) throw new Error(`${decision.label} lacks ${pattern}`);
  check(!option.disabled, `${decision.label} keeps the expected option enabled`);
  return option.id;
}

function occupancy(state: FeastState, spaceId: string): number {
  return state.actionSpaces.find((space) => space.id === spaceId)?.occupants
    .filter((entry) => entry.seat === 0)
    .reduce((total, entry) => total + entry.workers, 0) ?? 0;
}

function assertReplacementRecorded(state: FeastState, number: number, target: string): void {
  const records = state.occupationReplacements.filter((entry) => entry.cardId === cardId(number));
  equal(records.length, 1, `card ${number} records exactly one accepted replacement`);
  check(records[0]?.target === target, `card ${number} records replacement target ${target}`);
  check(records[0]?.actionId === state.players[0].turnActionId, `card ${number} replacement remains scoped to its worker action`);
  equal(
    state.occupationUsage.filter((entry) => entry.cardId === cardId(number)).length,
    1,
    `card ${number} records one accepted once-per-action use`,
  );
}

function assertDeclinedNotConsumed(state: FeastState, number: number): void {
  equal(
    state.occupationReplacements.filter((entry) => entry.cardId === cardId(number)).length,
    0,
    `declining card ${number} does not register suppression`,
  );
  equal(
    state.occupationUsage.filter((entry) => entry.cardId === cardId(number)).length,
    0,
    `declining card ${number} does not consume its once-per-action use`,
  );
}

// ---------------------------------------------------------------------------
// 102 - Fur instead of the single printed upgrade. The eligible two-worker
// mixed action proves the column worker cost and its mountain half survive.
// ---------------------------------------------------------------------------

scenario('102 accepted replacement', () => {
  const state = fresh(10102);
  markPlayed(state, 102);
  state.players[0].goods.silk = 1;
  const workersBefore = state.players[0].workersAvailable;

  mustApply(state, { type: 'place_workers', spaceId: 'mountain-3-upgrade-1' }, 'propose the eligible two-worker upgrade action');
  const confirmation = replacementConfirmation(state, 102);
  rejectAtomic(state, confirmation.id, { optionIds: ['forged-confirmation-payload'] }, 'card 102 malformed confirmation');
  resolve(state, confirmation, { accepted: true }, 'accept card 102');

  const choice = head(state, 'card-effect');
  check(choice.meta?.cardId === cardId(102) && choice.meta?.requestKind === 'choice', 'card 102 exposes its server-owned payment choice');
  rejectAtomic(state, choice.id, { optionIds: ['occ:v1:choice:forged:silk'] }, 'card 102 forged payment route');
  const silk = optionMatching(choice, /silk/i);
  resolve(state, choice, { optionIds: [silk] }, 'pay Silk for Fur');

  equal(state.players[0].goods.silk, 0, 'card 102 consumes exactly one Silk');
  equal(state.players[0].goods.fur, 1, 'card 102 grants exactly one Fur');
  const mountain = head(state, 'mountain');
  resolve(state, mountain, { allocations: [{ id: 'replacement-mountain', amount: 1 }] }, 'take the preserved printed mountain benefit');

  equal(state.players[0].resources.wood, 1, 'card 102 preserves the non-replaced mountain reward');
  check(state.pending.length === 0, 'card 102 suppresses the original upgrade decision');
  equal(occupancy(state, 'mountain-3-upgrade-1'), 2, 'card 102 preserves the authentic column-two worker placement');
  equal(state.players[0].workersAvailable, workersBefore - 2, 'card 102 spends exactly two Vikings');
  check(state.players[0].turnMayEnd, 'card 102 resumes through action completion');
  assertReplacementRecorded(state, 102, 'action');
  rejectAtomic(state, choice.id, { optionIds: [silk] }, 'card 102 stale nested choice');
});

scenario('102 declined replacement', () => {
  const state = fresh(20102);
  markPlayed(state, 102);
  state.players[0].goods['game-meat'] = 1;

  mustApply(state, { type: 'place_workers', spaceId: 'mountain-1-upgrade-1' }, 'propose the one-worker mixed upgrade action');
  const confirmation = replacementConfirmation(state, 102);
  resolve(state, confirmation, { accepted: false }, 'decline card 102');
  rejectAtomic(state, confirmation.id, { accepted: false }, 'card 102 stale confirmation after decline');

  const mountain = head(state, 'mountain');
  resolve(state, mountain, { allocations: [{ id: 'replacement-mountain', amount: 1 }] }, 'resolve original mountain half after decline');
  const upgrade = head(state, 'goods');
  check(upgrade.meta?.mode === 'upgrade', 'declining card 102 preserves the original upgrade decision');
  resolve(state, upgrade, { optionIds: ['game-meat'] }, 'resolve the original printed upgrade');

  equal(state.players[0].goods['game-meat'], 0, 'declined card 102 leaves the original Game Meat payment to the printed upgrade');
  equal(state.players[0].goods['skin-and-bones'], 1, 'declined card 102 produces the normal one-step upgrade');
  equal(state.players[0].goods.fur, 0, 'declined card 102 grants no replacement Fur');
  equal(occupancy(state, 'mountain-1-upgrade-1'), 1, 'declined card 102 still commits its worker');
  check(state.players[0].turnMayEnd && state.pending.length === 0, 'declined card 102 completes the original action continuation');
  assertDeclinedNotConsumed(state, 102);
});

// ---------------------------------------------------------------------------
// 105 - Pay 3 Wood for a Knarr instead of building a Whaling Boat.
// ---------------------------------------------------------------------------

scenario('105 accepted replacement bypasses full small-ship berths', () => {
  const state = fresh(10105);
  markPlayed(state, 105);
  state.players[0].resources.wood = 3;
  addShip(state, 'whaling-boat', 'whaler-a');
  addShip(state, 'whaling-boat', 'whaler-b');
  addShip(state, 'whaling-boat', 'whaler-c');
  const workersBefore = state.players[0].workersAvailable;

  mustApply(state, { type: 'place_workers', spaceId: 'build-whaling-boat' }, 'propose ship building although all small berths are full');
  const confirmation = replacementConfirmation(state, 105);
  rejectAtomic(state, confirmation.id, { optionIds: ['knarr'] }, 'card 105 malformed confirmation');
  resolve(state, confirmation, { accepted: true }, 'accept card 105');

  equal(state.players[0].resources.wood, 0, 'card 105 charges exactly 3 Wood, with no original 1-Wood payment');
  equal(state.players[0].ships.filter((ship) => ship.type === 'whaling-boat' && !ship.emigrated).length, 3, 'card 105 does not build or remove a Whaling Boat');
  equal(state.players[0].ships.filter((ship) => ship.type === 'knarr' && !ship.emigrated).length, 1, 'card 105 builds exactly one Knarr');
  equal(occupancy(state, 'build-whaling-boat'), 1, 'card 105 still places the printed action worker');
  equal(state.players[0].workersAvailable, workersBefore - 1, 'card 105 spends the printed one Viking');
  check(state.pending.length === 0 && state.players[0].turnMayEnd, 'card 105 suppresses the original ship action and completes');
  assertReplacementRecorded(state, 105, 'ship');
  rejectAtomic(state, confirmation.id, { accepted: true }, 'card 105 stale confirmation');
});

scenario('105 declined replacement resolves the printed ship action', () => {
  const state = fresh(20105);
  markPlayed(state, 105);
  state.players[0].resources.wood = 3;

  mustApply(state, { type: 'place_workers', spaceId: 'build-whaling-boat' }, 'propose ordinary Whaling Boat building');
  const confirmation = replacementConfirmation(state, 105);
  resolve(state, confirmation, { accepted: false }, 'decline card 105');

  equal(state.players[0].resources.wood, 2, 'declining card 105 pays the normal 1 Wood');
  equal(state.players[0].ships.filter((ship) => ship.type === 'whaling-boat' && !ship.emigrated).length, 1, 'declining card 105 builds the printed Whaling Boat');
  equal(state.players[0].ships.filter((ship) => ship.type === 'knarr' && !ship.emigrated).length, 0, 'declining card 105 builds no Knarr');
  equal(occupancy(state, 'build-whaling-boat'), 1, 'declined card 105 still commits its worker');
  check(state.pending.length === 0 && state.players[0].turnMayEnd, 'declined card 105 completes the printed action continuation');
  assertDeclinedNotConsumed(state, 105);
});

// ---------------------------------------------------------------------------
// 107 - Use the short exploration space to take any other face-up board.
// ---------------------------------------------------------------------------

scenario('107 accepted replacement bypasses exhausted nearby faces', () => {
  const state = fresh(10107);
  markPlayed(state, 107);
  addShip(state, 'whaling-boat', 'exploration-boat');
  for (const supply of state.explorations) {
    if (supply.face === 'shetland' || supply.face === 'faroe-islands') supply.claimedBy = 0;
  }
  const far = state.explorations.find((supply) => supply.face === 'iceland');
  check(!!far, 'Iceland exploration fixture exists');
  if (!far) throw new Error('Missing Iceland exploration fixture');
  far.silver = 3;

  mustApply(state, { type: 'place_workers', spaceId: 'explore-short' }, 'propose short exploration after both printed faces are gone');
  const confirmation = replacementConfirmation(state, 107);
  resolve(state, confirmation, { accepted: true }, 'accept card 107');

  const target = head(state, 'card-effect');
  check(target.meta?.cardId === cardId(107) && target.meta?.targetKind === 'exploration', 'card 107 exposes a server-owned exploration target');
  rejectAtomic(state, target.id, { optionIds: ['occ:v1:target:forged:exploration-1'] }, 'card 107 forged nearby target');
  const iceland = optionMatching(target, /iceland/i);
  resolve(state, target, { optionIds: [iceland] }, 'claim Iceland with card 107');

  const replacementShip = head(state, 'exploration');
  check(replacementShip.meta?.stage === 'ship' && replacementShip.meta?.replacementOnly === true,
    'card 107 still asks for the physical ship used by the replacement exploration');
  rejectAtomic(state, replacementShip.id, { optionIds: ['forged-exploration-ship'] }, 'card 107 forged physical ship');
  resolve(state, replacementShip, { optionIds: ['exploration-boat'] }, 'use the owned Whaling Boat for card 107');

  check(far !== state.explorations.find((supply) => supply.boardId === far.boardId), 'card 107 commits an atomic state graph');
  const committedFar = state.explorations.find((supply) => supply.boardId === far.boardId)!;
  equal(committedFar.claimedBy, 0, 'card 107 claims the selected distant face-up board');
  equal(committedFar.silver, 0, 'card 107 removes accumulated silver from the exploration supply');
  equal(state.players[0].silver, 3, 'card 107 awards the selected board accumulated silver');
  check(state.players[0].boards.some((board) => board.id === far.boardId && board.definitionId === 'iceland'), 'card 107 adds the authentic exploration board to the player');
  equal(occupancy(state, 'explore-short'), 1, 'card 107 still places the printed action worker');
  check(state.pending.length === 0 && state.players[0].turnMayEnd, 'card 107 suppresses the nearby exploration decision and completes');
  assertReplacementRecorded(state, 107, 'reward');
  rejectAtomic(state, target.id, { optionIds: [iceland] }, 'card 107 stale target');
});

scenario('107 declined replacement resolves a nearby exploration', () => {
  const state = fresh(20107);
  markPlayed(state, 107);
  addShip(state, 'knarr', 'nearby-knarr');
  const nearby = state.explorations.find((supply) => supply.face === 'shetland');
  check(!!nearby, 'Shetland exploration fixture exists');
  if (!nearby) throw new Error('Missing Shetland exploration fixture');
  nearby.silver = 2;

  mustApply(state, { type: 'place_workers', spaceId: 'explore-short' }, 'propose ordinary short exploration');
  const confirmation = replacementConfirmation(state, 107);
  resolve(state, confirmation, { accepted: false }, 'decline card 107');

  const exploration = head(state, 'exploration');
  check(exploration.meta?.stage === 'ship' && exploration.options.some((option) => option.id === 'nearby-knarr'),
    'declining card 107 first exposes the owned physical nearby-exploration ship');
  resolve(state, exploration, { optionIds: ['nearby-knarr'] }, 'use the Knarr for the printed nearby exploration');
  const destination = head(state, 'exploration');
  check(destination.meta?.stage === 'destination'
    && destination.options.every((option) => ['exploration-1', 'exploration-2'].includes(option.id)),
  'declining card 107 preserves only the printed nearby destination choices');
  resolve(state, destination, { optionIds: [nearby.boardId] }, 'claim the printed nearby board');

  equal(state.explorations.find((supply) => supply.boardId === nearby.boardId)?.claimedBy, 0, 'declined card 107 claims the normal nearby board');
  equal(state.players[0].silver, 2, 'declined card 107 awards nearby-board silver normally');
  check(!state.players[0].boards.some((board) => board.definitionId === 'iceland'), 'declined card 107 grants no distant exploration');
  equal(occupancy(state, 'explore-short'), 1, 'declined card 107 still commits its worker');
  check(state.pending.length === 0 && state.players[0].turnMayEnd, 'declined card 107 completes the original continuation');
  assertDeclinedNotConsumed(state, 107);
});

// ---------------------------------------------------------------------------
// 185 - Upgrade one or two goods instead of Raiding.
// ---------------------------------------------------------------------------

scenario('185 accepted replacement bypasses the longship prerequisite', () => {
  const state = fresh(10185);
  markPlayed(state, 185);
  state.players[0].goods.peas = 2;
  state.players[0].goods.mead = 0;
  const workersBefore = state.players[0].workersAvailable;

  mustApply(state, { type: 'place_workers', spaceId: 'raid' }, 'propose Raiding without a Longship');
  const confirmation = replacementConfirmation(state, 185);
  resolve(state, confirmation, { accepted: true }, 'accept card 185');

  const upgrade = head(state, 'card-effect');
  check(upgrade.meta?.mode === 'occupation-deferred' && upgrade.meta?.grantAction === 'upgrade-good', 'card 185 exposes a reducer-owned replacement upgrade');
  const route = upgrade.options.find((option) => option.id === 'peas->mead');
  check(!!route && !route.disabled, 'card 185 offers Peas -> Mead from current inventory');
  rejectAtomic(state, upgrade.id, { allocations: [{ id: 'peas->mead', amount: 3 }] }, 'card 185 over-limit allocation');
  resolve(state, upgrade, { allocations: [{ id: 'peas->mead', amount: 2 }] }, 'upgrade two Peas instead of Raiding');

  equal(state.players[0].goods.peas, 0, 'card 185 spends exactly two Peas');
  equal(state.players[0].goods.mead, 2, 'card 185 gains exactly two Mead');
  equal(state.players[0].ships.filter((ship) => ship.type === 'longship').length, 0, 'card 185 remains legal without a Longship');
  equal(occupancy(state, 'raid'), 1, 'card 185 still places the Raiding worker');
  equal(state.players[0].workersAvailable, workersBefore - 1, 'card 185 spends the printed one Viking');
  check(state.pending.length === 0, 'card 185 suppresses the Raiding die and loot decisions');
  check(state.players[0].turnMayEnd, 'card 185 resumes through full action completion');
  assertReplacementRecorded(state, 185, 'action');
  rejectAtomic(state, upgrade.id, { allocations: [{ id: 'peas->mead', amount: 1 }] }, 'card 185 stale upgrade choice');
});

scenario('185 declined replacement resolves the original raid', () => {
  const state = fresh(20185);
  markPlayed(state, 185);
  state.players[0].goods.peas = 1;
  addShip(state, 'longship', 'raiding-longship', 0);

  mustApply(state, { type: 'place_workers', spaceId: 'raid' }, 'propose ordinary Raiding with a Longship');
  const confirmation = replacementConfirmation(state, 185);
  resolve(state, confirmation, { accepted: false }, 'decline card 185');
  rejectAtomic(state, confirmation.id, { accepted: false }, 'card 185 stale confirmation after decline');

  const shipChoice = head(state, 'die');
  check(shipChoice.meta?.stage === 'boats', 'declining card 185 preserves the original Raiding ship selection');
  resolve(state, shipChoice, { optionIds: ['raiding-longship'] }, 'select the Longship for the preserved Raid');
  const die = head(state, 'die');
  check(die.id === shipChoice.id && die.meta?.stage === 'roll', 'Raiding continuation advances to the roll stage');
  resolve(state, die, { optionIds: ['roll'] }, 'roll the preserved Raiding die');
  const rolled = head(state, 'die');
  check(rolled.id === die.id && rolled.meta?.stage === 'spend', 'Raiding continuation advances to the spend/fail stage');
  resolve(state, rolled, { optionIds: ['fail'] }, 'declare failure to complete the original Raid deterministically');

  equal(state.players[0].goods.peas, 1, 'declined card 185 does not spend an upgrade good');
  equal(state.players[0].goods.mead, 1, 'declined card 185 grants no replacement upgrade beyond the starting Mead');
  equal(state.players[0].resources.stone, 1, 'declined card 185 resolves the printed Raid failure consolation');
  equal(occupancy(state, 'raid'), 1, 'declined card 185 preserves the original worker placement');
  check(state.pending.length === 0 && state.players[0].turnMayEnd, 'declined card 185 completes the die-action continuation');
  assertDeclinedNotConsumed(state, 185);
});

console.log(`Feast action-replacement reducer integration: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
