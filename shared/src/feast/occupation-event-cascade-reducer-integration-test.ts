/**
 * Public-reducer coverage for occupation events emitted by real mutations.
 *
 * Run: npx tsx shared/src/feast/occupation-event-cascade-reducer-integration-test.ts
 */

import {
  applyFeastAction,
  createFeast,
  type FeastAction,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastState,
} from './index.js';

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string): asserts condition {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

function fresh(seed: number): FeastState {
  const state = createFeast([{ name: 'Cascade Tester', color: 'Red' }], seed, { occupationMode: 'all' });
  state.pending = [];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  state.firstPlayer = 0;
  state.players[0].passed = false;
  state.players[0].turnActionTaken = false;
  state.players[0].turnMayEnd = false;
  state.players[0].silver = 20;
  return state;
}

function markPlayed(state: FeastState, number: number): void {
  const id = `occupation-${number}`;
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  state.occupationDiscard = state.occupationDiscard.filter((candidate) => candidate !== id);
  state.players[0].occupationHand = state.players[0].occupationHand.filter((candidate) => candidate !== id);
  state.players[0].playedOccupations.push(id);
  state.players[0].occupationUses.push({ cardId: id, round: state.round, usesThisRound: 0, usedOnce: false });
}

function putInHand(state: FeastState, number: number): void {
  const id = `occupation-${number}`;
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  state.occupationDiscard = state.occupationDiscard.filter((candidate) => candidate !== id);
  state.players[0].playedOccupations = state.players[0].playedOccupations.filter((candidate) => candidate !== id);
  state.players[0].occupationUses = state.players[0].occupationUses.filter((entry) => entry.cardId !== id);
  state.players[0].occupationHand = [
    ...state.players[0].occupationHand.filter((candidate) => candidate !== id), id,
  ];
}

function addShip(state: FeastState, type: 'whaling-boat' | 'knarr' | 'longship', id: string): void {
  state.players[0].ships.push({ id, type, ore: 0, emigrated: false, emigratedRound: null });
}

function mustApply(state: FeastState, action: FeastAction, message: string): void {
  const result = applyFeastAction(state, 0, action);
  check(result.ok, `${message}${result.ok ? '' : ` (${result.error})`}`);
  if (!result.ok) throw new Error(`${message}: ${result.error}`);
}

function head(state: FeastState): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, 'a pending decision exists');
  if (!decision) throw new Error('Missing pending decision');
  return decision;
}

function resolve(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice, message: string): void {
  mustApply(state, { type: 'resolve_decision', decisionId: decision.id, choice }, message);
}

function rejectAtomic(state: FeastState, decisionId: string, choice: FeastDecisionChoice, message: string): void {
  const before = JSON.stringify(state);
  const result = applyFeastAction(state, 0, { type: 'resolve_decision', decisionId, choice });
  check(!result.ok, `${message}: reducer rejects`);
  equal(JSON.stringify(state), before, `${message}: rejection is atomic`);
}

function scenario(name: string, body: () => void): void {
  try { body(); }
  catch (error) {
    failed++;
    console.error(`FAIL: ${name} aborted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

scenario('150 accepts one-for-one replacement after a printed pair gain', () => {
  const state = fresh(15001);
  markPlayed(state, 150);
  mustApply(state, { type: 'place_workers', spaceId: 'buy-stockfish' }, 'buy the printed Stockfish pair');

  const decision = head(state);
  check(decision.kind === 'card-effect', 'card 150 uses a card-effect decision');
  check(decision.meta?.cardId === 'occupation-150', 'card 150 owns the replacement decision');
  check(decision.meta?.requirement === 'replacement', 'card 150 is identified as a replacement');
  rejectAtomic(state, decision.id, { optionIds: ['forged'] }, 'forged card 150 response');
  resolve(state, decision, { accepted: true }, 'accept card 150');

  equal(state.players[0].goods.stockfish, 1, 'one original Stockfish remains');
  equal(state.players[0].goods['game-meat'], 1, 'one Game Meat replaces one Stockfish');
  equal(state.occupationReplacements.filter((entry) => entry.cardId === 'occupation-150').length, 1,
    'one reward replacement is recorded');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-150').length, 1,
    'accepted replacement consumes exactly one event use');
  check(state.pending.length === 0, 'the action resumes after replacement and follow-up events');
  rejectAtomic(state, decision.id, { accepted: true }, 'stale card 150 response');
});

scenario('150 decline preserves the complete printed pair', () => {
  const state = fresh(15002);
  markPlayed(state, 150);
  mustApply(state, { type: 'place_workers', spaceId: 'buy-salt-meat' }, 'buy the printed Salt Meat pair');
  const decision = head(state);
  resolve(state, decision, { accepted: false }, 'decline card 150');

  equal(state.players[0].goods['salt-meat'], 2, 'declining preserves both Salt Meat');
  equal(state.players[0].goods['game-meat'], 0, 'declining grants no Game Meat');
  equal(state.occupationReplacements.filter((entry) => entry.cardId === 'occupation-150').length, 0,
    'decline records no replacement');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-150').length, 0,
    'decline consumes no use');
  check(state.pending.length === 0, 'declined replacement resumes the printed action');
});

scenario('150 resumes the adjusted original gain into card 175', () => {
  const state = fresh(15003);
  markPlayed(state, 150);
  markPlayed(state, 175);
  mustApply(state, { type: 'place_workers', spaceId: 'buy-stockfish' }, 'buy Stockfish with both cards active');
  const replacement = head(state);
  resolve(state, replacement, { accepted: true }, 'replace one Stockfish with Game Meat');

  const followUp = head(state);
  check(followUp.meta?.cardId === 'occupation-175', 'the remaining action-space Stockfish reaches card 175');
  check(followUp.meta?.requestKind === 'confirmation', 'card 175 exposes its optional purchase');
  resolve(state, followUp, { accepted: true }, 'buy Oil with card 175');

  equal(state.players[0].goods.stockfish, 1, 'the adjusted original reward remains one Stockfish');
  equal(state.players[0].goods['game-meat'], 1, 'the replacement still grants one Game Meat');
  equal(state.players[0].goods.oil, 1, 'the downstream after-hook grants Oil');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-175').length, 1,
    'the downstream hook records one use');
  check(state.pending.length === 0, 'the chained event returns to action completion');
});

scenario('148 Spices mutation cascades into mandatory card 190 Oil', () => {
  const state = fresh(148190);
  markPlayed(state, 148);
  markPlayed(state, 190);
  state.players[0].resources.wood = 2;
  mustApply(state, { type: 'place_workers', spaceId: 'build-knarr' }, 'build a Knarr with wood');

  const conversion = head(state);
  check(conversion.meta?.cardId === 'occupation-148', 'the wood-built Knarr reaches card 148');
  resolve(state, conversion, { accepted: true }, 'buy Spices through card 148');

  equal(state.players[0].ships.filter((ship) => ship.type === 'knarr' && !ship.emigrated).length, 1,
    'the printed action builds one Knarr');
  equal(state.players[0].goods.spices, 1, 'card 148 grants one Spices');
  equal(state.players[0].goods.oil, 1, 'card 190 observes that Spices mutation and grants one Oil');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-190').length, 1,
    'the cascading mandatory card records one event use');
  check(state.pending.length === 0, 'the chained ship and good events finish the action');
});

scenario('178 and 180 threshold cards fire from a fourth large-ship mutation', () => {
  const state = fresh(178180);
  markPlayed(state, 178);
  markPlayed(state, 180);
  addShip(state, 'longship', 'threshold-longship-1');
  addShip(state, 'longship', 'threshold-longship-2');
  addShip(state, 'longship', 'threshold-longship-3');
  state.players[0].resources.wood = 2;
  mustApply(state, { type: 'place_workers', spaceId: 'build-knarr' }, 'build the fourth large ship');

  equal(state.players[0].ships.filter((ship) => ship.type === 'whaling-boat' && !ship.emigrated).length, 2,
    'card 178 fills both empty small berths with Whaling Boats');
  equal(state.players[0].goods.silverware, 4,
    'card 180 uses its low-income tier after the third Longship threshold');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-178').length, 1,
    'card 178 fires once despite its own ship mutation');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-180').length, 1,
    'exactly one shared card-180 tier fires');
  check(state.pending.length === 0, 'mandatory threshold cascades settle without a client prompt');
});

scenario('179 Stockfish mutation cascades into optional card 175', () => {
  const state = fresh(179175);
  markPlayed(state, 175);
  markPlayed(state, 179);
  addShip(state, 'knarr', 'existing-knarr');
  state.players[0].resources.wood = 2;
  mustApply(state, { type: 'place_workers', spaceId: 'build-knarr' }, 'build the next Knarr');

  const conversion = head(state);
  check(conversion.meta?.cardId === 'occupation-175', 'card 179 Stockfish reaches card 175');
  resolve(state, conversion, { accepted: true }, 'buy Oil after card 179 Stockfish');

  equal(state.players[0].goods.stockfish, 2, 'card 179 counts both owned Knarrs');
  equal(state.players[0].goods.oil, 1, 'card 175 converts one silver after the occupation gain');
  equal(state.players[0].silver, 21, 'card 179 grants two silver and card 175 spends one');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-179').length, 1,
    'card 179 is consumed after its next Knarr only');
  check(state.pending.length === 0, 'the nested mandatory-to-optional cascade resumes cleanly');
});

scenario('181 selects one shared income tier after the third large ship', () => {
  const state = fresh(181003);
  markPlayed(state, 181);
  addShip(state, 'longship', 'sail-patcher-longship-1');
  addShip(state, 'knarr', 'sail-patcher-knarr-1');
  state.players[0].resources.wood = 2;
  mustApply(state, { type: 'place_workers', spaceId: 'build-knarr' }, 'build the third large ship');

  equal(state.players[0].goods.wool, 3, 'card 181 uses exactly its low-income tier');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-181').length, 1,
    'card 181 shares one latch across all three tier clauses');
  check(state.pending.length === 0, 'card 181 does not retrigger from its own Wool mutation');
});

scenario('house events feed cards 15, 182, and then 190 in order', () => {
  const state = fresh(15182190);
  markPlayed(state, 15);
  markPlayed(state, 182);
  markPlayed(state, 190);
  state.players[0].resources.stone = 3;
  state.players[0].resources.wood = 5;

  mustApply(state, { type: 'place_workers', spaceId: 'build-stone-house' }, 'build the first qualifying house');
  equal(state.players[0].goods.hide, 1, 'card 15 observes the first house');
  check(state.pending.length === 0, 'one house is below card 182 threshold');
  mustApply(state, { type: 'end_turn' }, 'finish the first house turn');

  mustApply(state, { type: 'place_workers', spaceId: 'build-long-house' }, 'build the second qualifying house');
  equal(state.players[0].goods.hide, 2, 'card 15 observes the second house independently');
  let threshold = head(state);
  check(threshold.meta?.cardId === 'occupation-182', 'the second house reaches card 182');
  if (threshold.meta?.requestKind === 'confirmation') {
    resolve(state, threshold, { accepted: true }, 'accept the card 182 threshold opportunity');
    threshold = head(state);
  }
  const oneSpices = threshold.options.find((option) => /one-spices|1 spices|one spices|wood.*spices/i.test(`${option.id} ${option.label} ${option.detail ?? ''}`));
  check(!!oneSpices && !oneSpices.disabled, 'card 182 offers its two-Wood Spices branch');
  if (!oneSpices) throw new Error('Missing card 182 one-Spices choice');
  resolve(state, threshold, { optionIds: [oneSpices.id] }, 'choose card 182 one-Spices branch');

  equal(state.players[0].resources.wood, 3, 'card 182 spends exactly two Wood');
  equal(state.players[0].goods.spices, 1, 'card 182 grants one Spices');
  equal(state.players[0].goods.oil, 1, 'card 190 observes the card 182 Spices mutation');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-182').length, 1,
    'card 182 consumes its once-per-card threshold use');
  check(state.pending.length === 0, 'the house-threshold cascade returns to action completion');
});

scenario('28 offers one Oil purchase for each chest in a batch', () => {
  const state = fresh(28002);
  markPlayed(state, 28);
  state.players[0].resources.stone = 2;
  state.players[0].resources.wood = 2;
  mustApply(state, { type: 'place_workers', spaceId: 'craft-runes-and-chests' }, 'craft the printed pair of Chests');

  const offer = head(state);
  check(offer.meta?.cardId === 'occupation-28', 'the two new Chests reach card 28');
  resolve(state, offer, { accepted: true }, 'accept card 28 purchases');
  const repeats = head(state);
  check(repeats.meta?.requestKind === 'repeat' && repeats.meta?.repeatMax === 2,
    'card 28 exposes up to two independently priced purchases');
  rejectAtomic(state, repeats.id, { amount: 3 }, 'card 28 forged third purchase');
  resolve(state, repeats, { amount: 2 }, 'buy Oil for both new Chests');

  equal(state.players[0].goods.chest, 2, 'both printed Chests remain in supply');
  equal(state.players[0].goods.oil, 2, 'card 28 grants one Oil per purchased Chest opportunity');
  equal(state.players[0].silver, 18, 'card 28 charges one silver for each Oil');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-28').length, 1,
    'the batch uses one event record with a bounded repeat count');
  check(state.pending.length === 0, 'the repeated exchange resumes the printed action');
});

scenario('mountain resource batches reach cards 154, 155, and 156', () => {
  const state = fresh(154155156);
  markPlayed(state, 154);
  markPlayed(state, 155);
  markPlayed(state, 156);
  state.mountains = [{ id: 'resource-event-mountain', items: ['wood', 'wood', 'stone'] }];
  mustApply(state, { type: 'place_workers', spaceId: 'mountain-3-plus-2' }, 'start the printed mountain Viking action');
  const mountain = head(state);
  check(mountain.kind === 'mountain', 'the printed action exposes a mountain allocation');
  resolve(state, mountain, { allocations: [{ id: 'resource-event-mountain', amount: 3 }] },
    'take two Wood and one Stone together');

  const cooper = head(state);
  check(cooper.meta?.cardId === 'occupation-155', 'the aggregated two-Wood event reaches card 155');
  resolve(state, cooper, { accepted: true }, 'exchange one received Wood with card 155');

  equal(state.players[0].resources.wood, 1, 'the action gains two Wood and Cooper spends one');
  equal(state.players[0].resources.stone, 1, 'the same action gains one Stone');
  equal(state.players[0].goods.stockfish, 1, 'card 155 grants one Stockfish');
  equal(state.players[0].silver, 22, 'cards 154 and 156 each grant one silver');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-154').length, 1,
    'card 154 fires once for the batched Viking-action Wood');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-155').length, 1,
    'card 155 fires once for the same Wood batch');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-156').length, 1,
    'card 156 fires once for the Stone receipt');
  check(state.pending.length === 0, 'the mountain resource cascade returns to action completion');
});

scenario('79 pregnancy flip does not masquerade as a new cattle event for 174', () => {
  const state = fresh(79174);
  markPlayed(state, 174);
  putInHand(state, 79);
  state.players[0].goods.cattle = 1;
  state.players[0].silver = 10;

  mustApply(state, { type: 'place_workers', spaceId: 'play-occupations-2' }, 'take the printed occupation action');
  const play = head(state);
  check(play.kind === 'occupation', 'the printed action exposes the real hand');
  resolve(state, play, { optionIds: ['occupation-79'] }, 'play Cattle Keeper');
  const pregnancy = head(state);
  check(pregnancy.meta?.cardId === 'occupation-79', 'card 79 owns the pregnancy offer');
  resolve(state, pregnancy, { accepted: true }, 'make the existing cattle pregnant');

  equal(state.players[0].goods.cattle, 0, 'the same cattle leaves its non-pregnant face');
  equal(state.players[0].goods['pregnant-cattle'], 1, 'the same physical cattle enters its pregnant face');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-174').length, 0,
    'card 174 does not treat a face flip as a newly received animal');
  equal(state.players[0].silver, 10, 'no false card-174 luxury purchase is offered or charged');
  check(state.pending.length === 0 && state.players[0].turnMayEnd,
    'the occupation action completes without a spurious animal prompt');
});

scenario('15 ignores Earl purchase 72 but observes a real House Building action', () => {
  const state = fresh(15072);
  markPlayed(state, 15);
  putInHand(state, 72);
  state.players[0].resources.stone = 1;
  const stoneHousesBefore = state.players[0].boards.filter((board) => board.definitionId === 'stone-house').length;

  mustApply(state, { type: 'place_workers', spaceId: 'play-occupations-2' }, 'take an occupation action for Earl');
  let decision = head(state);
  check(decision.kind === 'occupation', 'the occupation action exposes Earl from the real hand');
  resolve(state, decision, { optionIds: ['occupation-72'] }, 'play Earl');
  decision = head(state);
  check(decision.meta?.cardId === 'occupation-72' && decision.meta?.requestKind === 'confirmation',
    'Earl exposes its server-authored round-cost house purchase');
  resolve(state, decision, { accepted: true }, 'buy Earl stone house');

  equal(state.players[0].boards.filter((board) => board.definitionId === 'stone-house').length,
    stoneHousesBefore + 1, 'Earl still creates the purchased Stone House');
  equal(state.players[0].goods.hide, 0,
    'Cottager ignores Earl because the purchase is explicitly not House Building');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-15').length, 0,
    'the non-House-Building purchase consumes no Cottager event use');
  check(state.pending.length === 0 && state.players[0].turnMayEnd,
    'the classified Earl house event resumes the occupation action');

  mustApply(state, { type: 'end_turn' }, 'finish the Earl occupation turn');
  mustApply(state, { type: 'place_workers', spaceId: 'build-stone-house' }, 'use a real House Building action');
  equal(state.players[0].goods.hide, 1,
    'Cottager grants one Hide for the authoritative House Building action');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-15').length, 1,
    'the real House Building event records exactly one Cottager use');
});

console.log(`Feast occupation event cascade reducer integration: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
