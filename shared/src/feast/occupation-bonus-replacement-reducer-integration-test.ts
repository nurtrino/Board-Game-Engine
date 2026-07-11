/**
 * Reducer integration for Maid (177), including occupation-granted private
 * Bonus phases. This deliberately drives only public Feast actions and the
 * real automatic scheduler.
 *
 * Run: npx tsx shared/src/feast/occupation-bonus-replacement-reducer-integration-test.ts
 */

import {
  FEAST_BOARD_BY_ID, applyFeastAction, createFeast,
  feastAdvanceAutomaticWithOccupations,
  type FeastAction, type FeastBoardState, type FeastDecisionChoice,
  type FeastPlacement, type FeastSeatColor, type FeastState,
} from './index.js';

let checks = 0;
function check(condition: unknown, message: string): asserts condition {
  checks++;
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const COLORS: readonly FeastSeatColor[] = ['Red', 'Blue', 'Green', 'Purple'];

function fresh(players = 1, seed = 177): FeastState {
  const state = createFeast(
    COLORS.slice(0, players).map((color, seat) => ({ name: `Player ${seat + 1}`, color })),
    seed, { length: 'short', occupationMode: 'all' },
  );
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.firstPlayer = 0;
  state.turn = 0;
  state.pending = [];
  state.occupationUsage = [];
  state.occupationReplacements = [];
  for (const player of state.players) {
    player.passed = false;
    player.turnActionTaken = false;
    player.turnMayEnd = false;
    player.turnEffectUsed = false;
    player.occupationHand = [];
    player.playedOccupations = [];
    player.occupationUses = [];
  }
  return state;
}

function installPlayed(state: FeastState, seat: number, card: number): void {
  const id = `occupation-${card}`;
  state.players[seat].playedOccupations.push(id);
  state.players[seat].occupationUses.push({
    cardId: id, round: state.round, usesThisRound: 0, usedOnce: false,
  });
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
}

function act(state: FeastState, seat: number, action: FeastAction): void {
  const result = applyFeastAction(state, seat, action);
  check(result.ok, `${action.type} should resolve (${result.ok ? '' : result.error})`);
}

function decide(state: FeastState, seat: number, choice: FeastDecisionChoice): string {
  const decision = state.pending[0];
  check(decision?.seat === seat, `seat ${seat} should own the current decision`);
  act(state, seat, { type: 'resolve_decision', decisionId: decision.id, choice });
  return decision.id;
}

/** Create a physical building with exactly the selected printed bonus cells
 * open and every other valid cell covered. */
function producingHouse(
  definitionId: 'stone-house' | 'long-house', id: string, openBonusIndexes: readonly number[], owner = 0,
): FeastBoardState {
  const definition = FEAST_BOARD_BY_ID[definitionId];
  const open = new Set(openBonusIndexes.map((index) => {
    const bonus = definition.bonuses[index];
    if (!bonus) throw new Error(`Unknown ${definitionId} bonus ${index}`);
    return `${bonus.cell.x},${bonus.cell.y}`;
  }));
  const covered = definition.layout.flatMap((row, y) => [...row].flatMap((cell, x) =>
    cell === '#' && !open.has(`${x},${y}`) ? [{ x, y }] : [],
  ));
  const placement: FeastPlacement = {
    id: `${id}-cover`, pieceKind: 'silver', pieceId: 'silver', color: 'silver',
    x: 0, y: 0, rotation: 0, mask: ['#'], covered,
  };
  return { id, definitionId, kind: 'building', owner, placements: [placement] };
}

// A regular Bonus resolves each physical house independently. A long house
// producing three goods is not three separate Maid opportunities, and another
// player's one-good house is not intercepted by Maid owned by seat 0.
{
  const state = fresh(2, 17701);
  installPlayed(state, 0, 177);
  state.players[0].boards.push(
    producingHouse('stone-house', 'regular-one', [0]),
    producingHouse('long-house', 'regular-three', [0, 1, 2]),
  );
  state.players[1].boards.push(producingHouse('stone-house', 'other-player-one', [0], 1));
  const before = state.players.map((player) => ({
    hide: player.goods.hide, silverware: player.goods.silverware,
    peas: player.goods.peas, oil: player.goods.oil, beans: player.goods.beans,
  }));
  state.phase = 'bonus';
  state.phaseNumber = 10;
  feastAdvanceAutomaticWithOccupations(state);

  check(state.pending[0]?.meta?.cardId === 'occupation-177',
    'regular Bonus should stop at Maid for the owner\'s one-good stone house');
  const maidDecisionId = state.pending[0].id;
  act(state, 0, { type: 'resolve_decision', decisionId: maidDecisionId, choice: { accepted: true } });

  check(state.pending.length === 0,
    'the three-good long house and another player\'s house should create no Maid prompts');
  check(state.players[0].goods.hide === before[0].hide,
    'accepted Maid should suppress exactly the original stone-house hide');
  check(state.players[0].goods.silverware === before[0].silverware + 1,
    'accepted Maid should grant exactly one silverware');
  check(state.players[0].goods.peas === before[0].peas + 1
    && state.players[0].goods.oil === before[0].oil + 1
    && state.players[0].goods.beans === before[0].beans + 1,
  'a long house producing three goods should retain all three original rewards');
  check(state.players[1].goods.hide === before[1].hide + 1
    && state.players[1].goods.silverware === before[1].silverware,
  'another player should receive their untouched original house reward');
  check(state.occupationReplacements.filter((record) => record.cardId === 'occupation-177').length === 1,
    'regular Bonus should persist one exact accepted replacement record');
}

// Builder (20) runs a private houses-only Bonus while Actions remains active.
// Two qualifying houses must be offered independently, while a three-good
// house pays normally and other players are completely outside the scope.
{
  const state = fresh(2, 17702);
  installPlayed(state, 0, 177);
  state.players[0].occupationHand.push('occupation-20');
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== 'occupation-20');
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== 'occupation-20');
  state.players[0].boards.push(
    producingHouse('stone-house', 'private-accept', [0]),
    producingHouse('stone-house', 'private-decline', [0]),
    producingHouse('long-house', 'private-three', [0, 1, 2]),
  );
  state.players[1].boards.push(producingHouse('stone-house', 'private-other-player', [0], 1));
  const before = state.players.map((player) => ({
    hide: player.goods.hide, silverware: player.goods.silverware,
    peas: player.goods.peas, oil: player.goods.oil, beans: player.goods.beans,
  }));

  act(state, 0, { type: 'place_workers', spaceId: 'play-occupations-2' });
  check(state.pending[0]?.kind === 'occupation', 'the printed action should request an occupation card');
  decide(state, 0, { optionIds: ['occupation-20'] });
  check(state.pending[0]?.meta?.cardId === 'occupation-20', 'Builder should offer its private Bonus');
  decide(state, 0, { accepted: true });

  check(state.pending[0]?.meta?.cardId === 'occupation-177',
    'the first qualifying private house should stop at Maid');
  const firstMaidId = state.pending[0].id;

  const beforeForged = JSON.stringify(state);
  const forged = applyFeastAction(state, 0, {
    type: 'resolve_decision', decisionId: firstMaidId,
    choice: { accepted: true, optionIds: ['forged-original-good'] },
  });
  check(!forged.ok, 'a forged item selection must not satisfy Maid\'s confirmation');
  check(JSON.stringify(state) === beforeForged, 'a forged Maid response must be atomic');

  act(state, 0, { type: 'resolve_decision', decisionId: firstMaidId, choice: { accepted: true } });
  check(state.pending[0]?.meta?.cardId === 'occupation-177',
    'the second qualifying private house should receive an independent Maid choice');
  const secondMaidId = state.pending[0].id;
  check(secondMaidId !== firstMaidId, 'each house should have a distinct decision identity');

  const beforeStale = JSON.stringify(state);
  const stale = applyFeastAction(state, 0, {
    type: 'resolve_decision', decisionId: firstMaidId, choice: { accepted: false },
  });
  check(!stale.ok, 'a stale first-house decision id must not resolve the second house');
  check(JSON.stringify(state) === beforeStale, 'a stale Maid response must be atomic');
  act(state, 0, { type: 'resolve_decision', decisionId: secondMaidId, choice: { accepted: false } });

  check(state.phase === 'actions' && state.pending.length === 0,
    'the private Bonus should return deterministically to the Actions phase');
  check(state.players[0].goods.hide === before[0].hide + 1,
    'one accepted and one declined Maid choice should leave exactly one original hide');
  check(state.players[0].goods.silverware === before[0].silverware + 1,
    'only the accepted private-house replacement should grant silverware');
  check(state.players[0].goods.peas === before[0].peas + 1
    && state.players[0].goods.oil === before[0].oil + 1
    && state.players[0].goods.beans === before[0].beans + 1,
  'the ineligible three-good private house should pay all original rewards once');
  check(state.players[1].goods.hide === before[1].hide
    && state.players[1].goods.silverware === before[1].silverware,
  'Builder\'s private Bonus must not resolve another player\'s house');
  check(state.occupationReplacements.filter((record) => record.cardId === 'occupation-177').length === 1,
    'private Bonus should persist only the accepted house replacement');
  check(state.players[0].playedOccupations.includes('occupation-20'),
    'the private Bonus should resume and finish Builder\'s real play chain');
}

console.log(`Feast occupation Bonus replacement reducer integration: ${checks}/${checks} checks passed.`);
