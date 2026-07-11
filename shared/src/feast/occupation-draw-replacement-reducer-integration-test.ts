/** Public-reducer integration for card 99's per-card occupation draw replacement. */

import {
  applyFeastAction, createFeast,
  type FeastAction, type FeastDecisionChoice, type FeastPendingDecision, type FeastState,
} from './index.js';

let passed = 0;
let failed = 0;
const check = (condition: unknown, message: string): void => {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
};
const equal = (actual: unknown, expected: unknown, message: string): void =>
  check(JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

function fresh(seed: number): FeastState {
  const state = createFeast([{ name: 'Draw Replacement Tester', color: 'Red' }], seed, { occupationMode: 'all' });
  state.pending = [];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  state.firstPlayer = 0;
  state.players[0].passed = false;
  state.players[0].turnActionTaken = false;
  state.players[0].turnMayEnd = false;
  return state;
}

function removeEverywhere(state: FeastState, id: string): void {
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

function install(state: FeastState): void {
  removeEverywhere(state, 'occupation-99');
  removeEverywhere(state, 'occupation-12');
  state.players[0].playedOccupations.push('occupation-99');
  state.players[0].occupationUses.push({
    cardId: 'occupation-99', round: state.round, usesThisRound: 0, usedOnce: false,
  });
  state.players[0].occupationHand.push('occupation-12');
}

function act(state: FeastState, action: FeastAction, message: string): void {
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
  act(state, { type: 'resolve_decision', decisionId: decision.id, choice }, message);
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

scenario('accepted card 99 plays from hand and suppresses the pending draw', () => {
  const state = fresh(9901);
  install(state);
  const deckBefore = state.occupationDeck.length;
  act(state, { type: 'place_workers', spaceId: 'weekly-feast' }, 'place three Vikings on a column-three space');

  const replacement = head(state);
  check(replacement.meta?.cardId === 'occupation-99', 'card 99 owns the draw replacement');
  check(replacement.meta?.requirement === 'replacement', 'card 99 is identified as a replacement');
  rejectAtomic(state, replacement.id, { optionIds: ['forged'] }, 'forged replacement confirmation');
  resolve(state, replacement, { accepted: true }, 'accept card 99');

  const play = head(state);
  check(play.kind === 'card-effect' && play.meta?.grantAction === 'play-occupation',
    'accepted card 99 opens a server-owned occupation play picker');
  check(play.options.some((option) => option.id === 'occupation-12'), 'the picker contains the real card in hand');
  rejectAtomic(state, play.id, { optionIds: ['occupation-190'] }, 'forged occupation outside the hand');
  resolve(state, play, { optionIds: ['occupation-12'] }, 'play card 12 instead of drawing');

  check(state.players[0].playedOccupations.includes('occupation-12'), 'card 12 moves from hand to played occupations');
  check(!state.players[0].occupationHand.includes('occupation-12'), 'card 12 leaves the hand');
  equal(state.players[0].goods.chest, 1, 'card 12 resolves its authentic play effect');
  equal(state.occupationDeck.length, deckBefore, 'the replaced occupation draw consumes no deck card');
  equal(state.occupationReplacements.filter((entry) => entry.cardId === 'occupation-99').length, 1,
    'one accepted reward replacement is recorded');
  check(state.players[0].turnMayEnd, 'the column-three printed action resumes after the replacement play');
  check(state.pending.length === 0, 'the complete nested chain leaves no pending decision');
  rejectAtomic(state, play.id, { optionIds: ['occupation-12'] }, 'stale play decision');
});

scenario('declined card 99 draws normally and consumes no replacement use', () => {
  const state = fresh(9902);
  install(state);
  const handBefore = state.players[0].occupationHand.length;
  const deckBefore = state.occupationDeck.length;
  act(state, { type: 'place_workers', spaceId: 'weekly-feast' }, 'start another column-three draw');
  const replacement = head(state);
  resolve(state, replacement, { accepted: false }, 'decline card 99');

  equal(state.occupationDeck.length, deckBefore - 1, 'decline draws exactly one deck card');
  equal(state.players[0].occupationHand.length, handBefore + 1, 'decline adds exactly one occupation to hand');
  check(state.players[0].occupationHand.includes('occupation-12'), 'decline leaves the existing hand card untouched');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-99').length, 0,
    'decline consumes no once-per-event use');
  equal(state.occupationReplacements.filter((entry) => entry.cardId === 'occupation-99').length, 0,
    'decline records no suppression');
  check(state.players[0].turnMayEnd && state.pending.length === 0,
    'declined replacement resumes and completes the printed action');
});

console.log(`Feast occupation draw replacement integration: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
