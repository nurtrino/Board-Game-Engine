/**
 * Public scheduler/reducer coverage for receipt hooks emitted by ordinary
 * phase-10 Bonus rewards.
 *
 * Run: npx tsx shared/src/feast/occupation-bonus-cascade-reducer-integration-test.ts
 */

import {
  applyFeastAction, createFeast, feastAdvanceAutomaticWithOccupations,
  type FeastAction, type FeastAutomaticBonusState, type FeastDecisionChoice,
  type FeastPendingDecision, type FeastState,
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

function scenario(name: string, body: () => void): void {
  try { body(); }
  catch (error) {
    failed++;
    console.error(`FAIL: ${name} aborted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fresh(seed: number): FeastState {
  const state = createFeast([{ name: 'Bonus Tester', color: 'Red' }], seed, {
    occupationMode: 'all', length: 'long',
  });
  state.pending = [];
  state.phase = 'bonus';
  state.phaseNumber = 10;
  state.firstPlayer = 0;
  state.turn = 0;
  state.automaticCheckpoint = 'bonus:rewards';
  state.automaticSeatCursor = 0;
  state.automaticBonuses = [];
  state.automaticBonusCursor = 0;
  state.automaticBonusOffered = false;
  state.automaticBonusStage = 'offer';
  state.automaticBonusContexts = [];
  state.automaticBonusContextCursor = 0;
  return state;
}

function markPlayed(state: FeastState, number: number): void {
  const id = `occupation-${number}`;
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  state.occupationDiscard = state.occupationDiscard.filter((candidate) => candidate !== id);
  state.players[0].occupationHand = state.players[0].occupationHand.filter((candidate) => candidate !== id);
  state.players[0].playedOccupations.push(id);
  state.players[0].occupationUses.push({
    cardId: id, round: state.round, usesThisRound: 0, usedOnce: false,
  });
}

function reward(
  eventId: string, kind: FeastAutomaticBonusState['reward']['kind'], id: string,
  amount = 1, boardKind = 'home', producerGoodCount = kind === 'good' ? amount : 0,
): FeastAutomaticBonusState {
  return {
    seat: 0, boardId: `board-${eventId}`, boardKind,
    eventId, producerGoodCount, reward: { kind, id, amount },
  };
}

function head(state: FeastState): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, 'a pending decision exists');
  if (!decision) throw new Error('Missing pending decision');
  return decision;
}

function mustApply(state: FeastState, action: FeastAction, message: string): void {
  const result = applyFeastAction(state, 0, action);
  check(result.ok, `${message}${result.ok ? '' : ` (${result.error})`}`);
  if (!result.ok) throw new Error(`${message}: ${result.error}`);
}

function resolve(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice, message: string,
): void {
  mustApply(state, {
    type: 'resolve_decision', decisionId: decision.id, choice,
  }, message);
}

function rejectAtomic(
  state: FeastState, decisionId: string, choice: FeastDecisionChoice, message: string,
): void {
  const before = JSON.stringify(state);
  const result = applyFeastAction(state, 0, {
    type: 'resolve_decision', decisionId, choice,
  });
  check(!result.ok, `${message}: reducer rejects`);
  equal(JSON.stringify(state), before, `${message}: rejection is atomic`);
}

function optionMatching(decision: FeastPendingDecision, pattern: RegExp): string {
  const option = decision.options.find((candidate) =>
    pattern.test(`${candidate.id} ${candidate.label} ${candidate.detail ?? ''}`));
  check(!!option, `${decision.label} offers ${pattern}`);
  if (!option) throw new Error(`${decision.label} lacks ${pattern}`);
  check(!option.disabled, `${option.label} is enabled`);
  return option.id;
}

scenario('a Bonus Spices receipt cascades into Bosporus Merchant Oil exactly once', () => {
  const state = fresh(19010);
  markPlayed(state, 190);
  state.automaticBonuses = [reward('phase-bonus-spices', 'good', 'spices', 2)];

  feastAdvanceAutomaticWithOccupations(state);

  equal(state.players[0].goods.spices, 2, 'the physical Bonus grants the complete Spices batch');
  equal(state.players[0].goods.oil, 2, 'card 190 observes source=bonus and grants Oil per Spices');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-190').length, 1,
    'card 190 records one receipt event use');
  equal(state.automaticBonuses, [], 'the completed Bonus queue is cleared');
  feastAdvanceAutomaticWithOccupations(state);
  equal(state.players[0].goods.spices, 2, 're-entering the scheduler does not replay Spices');
  equal(state.players[0].goods.oil, 2, 're-entering the scheduler does not replay Oil');
});

scenario('a Bonus Chest pauses for Locksmith and resumes after the applied reward', () => {
  const state = fresh(28010);
  markPlayed(state, 28);
  state.players[0].silver = 3;
  state.automaticBonuses = [reward('phase-bonus-chest', 'good', 'chest')];

  feastAdvanceAutomaticWithOccupations(state);
  let decision = head(state);
  check(decision.meta?.cardId === 'occupation-28', 'the Bonus Chest reaches Locksmith');
  check(decision.meta?.requestKind === 'confirmation', 'Locksmith first asks for confirmation');
  check(decision.continuation.kind === 'occupation-event'
    && decision.continuation.context.fields.source === 'bonus'
    && decision.continuation.context.fields.phase === 'bonus',
  'Locksmith receives reducer-authored Bonus provenance');
  equal(state.players[0].goods.chest, 1, 'the Chest is committed before its optional receipt hook');
  equal(state.automaticBonusStage, 'receipts', 'the scheduler persists the post-apply receipt stage');
  rejectAtomic(state, decision.id, { optionIds: ['forged'] }, 'forged Locksmith confirmation');
  resolve(state, decision, { accepted: true }, 'accept the Locksmith purchase');

  decision = head(state);
  check(decision.meta?.requestKind === 'repeat', 'Locksmith exposes its bounded purchase count');
  rejectAtomic(state, decision.id, { amount: 2 }, 'forged second Oil for one Chest');
  resolve(state, decision, { amount: 1 }, 'buy one Oil for the Bonus Chest');

  equal(state.players[0].goods.chest, 1, 'resuming never reapplies the Chest');
  equal(state.players[0].goods.oil, 1, 'Locksmith grants one Oil');
  equal(state.players[0].silver, 2, 'Locksmith charges one Silver');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-28').length, 1,
    'Locksmith consumes one event use');
  check(state.pending.length === 0, 'the scheduler completes after the optional purchase');
  rejectAtomic(state, decision.id, { amount: 1 }, 'stale Locksmith repeat decision');
});

scenario('each cattle in one Bonus batch gets an independent Bosporus Traveller event', () => {
  const state = fresh(17420);
  markPlayed(state, 174);
  state.players[0].silver = 10;
  state.automaticBonuses = [reward('phase-bonus-cattle', 'good', 'cattle', 2)];

  feastAdvanceAutomaticWithOccupations(state);
  let confirmation = head(state);
  check(confirmation.meta?.cardId === 'occupation-174', 'the first Bonus cattle reaches card 174');
  check(confirmation.meta?.requestKind === 'confirmation', 'the first cattle offers its optional purchase');
  resolve(state, confirmation, { accepted: true }, 'accept the first cattle purchase');
  let decision = head(state);
  const firstId = decision.id;
  const spices = optionMatching(decision, /spices/i);
  resolve(state, decision, { optionIds: [spices] }, 'buy Spices for the first cattle');

  confirmation = head(state);
  check(confirmation.meta?.cardId === 'occupation-174', 'the second Bonus cattle reaches card 174');
  check(confirmation.id !== firstId, 'each physical cattle has a distinct decision identity');
  rejectAtomic(state, firstId, { optionIds: [spices] }, 'stale first-cattle decision');
  resolve(state, confirmation, { accepted: true }, 'accept the second cattle purchase');
  decision = head(state);
  const silk = optionMatching(decision, /silk/i);
  resolve(state, decision, { optionIds: [silk] }, 'buy Silk for the second cattle');

  equal(state.players[0].goods.cattle, 2, 'the cattle batch is applied once');
  equal(state.players[0].goods.spices, 1, 'the first animal purchase grants Spices');
  equal(state.players[0].goods.silk, 1, 'the second animal purchase grants Silk');
  equal(state.players[0].silver, 3, 'the independent animal purchases cost four plus three Silver');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-174').length, 2,
    'card 174 records one use for each animal event');
  check(state.pending.length === 0, 'both per-animal events return to the scheduler');
});

scenario('Bonus provenance excludes Viking-action-only Wood and Stockfish cards', () => {
  const state = fresh(154155175);
  markPlayed(state, 150);
  markPlayed(state, 154);
  markPlayed(state, 155);
  markPlayed(state, 175);
  state.players[0].silver = 5;
  state.automaticBonuses = [
    reward('phase-bonus-wood', 'resource', 'wood', 2),
    reward('phase-bonus-stockfish', 'good', 'stockfish', 2),
  ];

  feastAdvanceAutomaticWithOccupations(state);

  equal(state.players[0].resources.wood, 2, 'the Bonus Wood is paid normally');
  equal(state.players[0].goods.stockfish, 2, 'the complete Bonus Stockfish pair is paid normally');
  equal(state.players[0].silver, 5, 'Woodcutter grants no Silver outside a Viking action');
  equal(state.players[0].goods.oil, 0, 'Codliver Oil Presser ignores Bonus Stockfish');
  equal(state.players[0].goods.stockfish, 2, 'Meat Buyer and Cooper do not alter Bonus goods');
  equal(state.occupationUsage.filter((entry) =>
    ['occupation-150', 'occupation-154', 'occupation-155', 'occupation-175'].includes(entry.cardId)).length, 0,
  'source-exclusion cards consume no use during Bonus');
  check(state.pending.length === 0, 'excluded cards create no Bonus decision');
});

scenario('ordinary Breeding emits one Bosporus Traveller event per newborn cattle', () => {
  const state = fresh(17480);
  markPlayed(state, 174);
  state.phase = 'breeding';
  state.phaseNumber = 8;
  state.automaticCheckpoint = null;
  state.automaticBreedingContexts = [];
  state.automaticBreedingContextCursor = 0;
  state.players[0].goods['pregnant-cattle'] = 1;
  state.players[0].silver = 10;

  feastAdvanceAutomaticWithOccupations(state);
  let purchase = head(state);
  check(purchase.meta?.cardId === 'occupation-174', 'the single newborn cattle reaches card 174');
  resolve(state, purchase, { accepted: true }, 'accept the newborn-cattle purchase');
  purchase = head(state);
  const spices = optionMatching(purchase, /spices/i);
  resolve(state, purchase, { optionIds: [spices] }, 'buy Spices for the newborn cattle');

  equal(state.players[0].goods.cattle, 2, 'the pregnant mother flips and one new cattle is born');
  equal(state.players[0].goods['pregnant-cattle'], 0, 'the mother is no longer pregnant after birth');
  equal(state.players[0].goods.spices, 1, 'card 174 offers exactly one newborn purchase');
  equal(state.players[0].silver, 6, 'the newborn purchase costs four Silver');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-174').length, 1,
    'the mother flip is not miscounted as a second new animal');
  check(state.pending[0]?.kind === 'feast', 'Breeding resumes to the normal Feast after the newborn hook');
});

console.log(`Feast occupation Bonus cascade reducer integration: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
