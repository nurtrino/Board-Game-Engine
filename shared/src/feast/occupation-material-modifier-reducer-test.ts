/**
 * Reducer-level parity checks for the two occupation material modifiers:
 * Master Joiner (40) and Master Bricklayer (116).
 *
 * Run: npx tsx shared/src/feast/occupation-material-modifier-reducer-test.ts
 */

import {
  FEAST_ACTION_BY_ID,
  applyFeastAction,
  createFeast,
  feastActionReason,
  feastPlacementError,
  feastScorePlayer,
  type FeastAction,
  type FeastBoardState,
  type FeastBuildingType,
  type FeastDecisionChoice,
  type FeastResult,
  type FeastState,
} from './index.js';
import { feastActionResourceCost } from './state.js';

let checks = 0;
const failures: string[] = [];

function check(condition: unknown, message: string): boolean {
  checks++;
  if (!condition) failures.push(message);
  return !!condition;
}

function equal(actual: unknown, expected: unknown, message: string): boolean {
  return check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`,
  );
}

function fresh(seed: number, cards: number[] = []): FeastState {
  const state = createFeast(
    [{ name: 'Material Modifier Tester', color: 'Red' }], seed,
    { length: 'short', occupationMode: 'all' },
  );
  const player = state.players[0];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  state.pending = [];
  state.occupationUsage = [];
  state.occupationReplacements = [];
  state.occupationActiveModifiers = [];
  player.passed = false;
  player.turnActionTaken = false;
  player.turnMayEnd = false;
  player.turnEffectUsed = false;
  player.turnActionId = null;
  player.workersAvailable = Math.max(player.workersAvailable, 7);
  player.occupationHand = [];
  player.playedOccupations = cards.map((number) => `occupation-${number}`);
  player.occupationUses = cards.map((number) => ({
    cardId: `occupation-${number}`, round: state.round, usesThisRound: 0, usedOnce: false,
  }));
  return state;
}

function addBuilding(state: FeastState, type: FeastBuildingType, id = `test-${type}`): FeastBoardState {
  const board: FeastBoardState = {
    id, definitionId: type, kind: 'building', owner: 0, placements: [],
  };
  state.players[0].boards.push(board);
  return board;
}

function apply(state: FeastState, action: FeastAction): FeastResult {
  return applyFeastAction(state, 0, action);
}

function resolve(state: FeastState, choice: FeastDecisionChoice): FeastResult {
  const decision = state.pending[0];
  if (!decision) return { ok: false, error: 'No pending decision' };
  return apply(state, { type: 'resolve_decision', decisionId: decision.id, choice });
}

// ---------------------------------------------------------------------------
// 40 Master Joiner: wood is a one-cell silver substitute on owned house grids.
// ---------------------------------------------------------------------------

{
  const control = fresh(400);
  const house = addBuilding(control, 'stone-house');
  control.players[0].resources.wood = 1;
  check(
    /final scoring preparation/i.test(feastPlacementError(control, 0, house.id, 'wood', 1, 0, 0) ?? ''),
    'without card 40, wood cannot fill an ordinary stone-house grid cell during Actions',
  );

  const state = fresh(401, [40]);
  const stoneHouse = addBuilding(state, 'stone-house', 'master-joiner-stone-house');
  const longHouse = addBuilding(state, 'long-house', 'master-joiner-long-house');
  const shed = addBuilding(state, 'shed', 'master-joiner-shed');
  state.players[0].resources.wood = 4;
  const beforeScore = feastScorePlayer(state, state.players[0]).total;

  equal(feastPlacementError(state, 0, stoneHouse.id, 'wood', 1, 0, 0), null,
    'card 40 makes a valid empty stone-house grid cell legal for wood');
  const first = apply(state, {
    type: 'place_tile', boardId: stoneHouse.id, pieceId: 'wood', x: 1, y: 0, rotation: 0,
  });
  check(first.ok, `card 40 commits wood to the stone house${first.error ? `: ${first.error}` : ''}`);
  equal(state.players[0].resources.wood, 3, 'card 40 consumes exactly one physical wood');
  check(stoneHouse !== state.players[0].boards.find((board) => board.id === stoneHouse.id),
    'atomic reducer replaces nested state rather than mutating the caller fixture reference');
  const committedStone = state.players[0].boards.find((board) => board.id === stoneHouse.id)!;
  equal(committedStone.placements.map((placement) => placement.pieceId), ['wood'],
    'the committed placement remains a wood token for inventory and audit purposes');
  equal(feastScorePlayer(state, state.players[0]).total, beforeScore + 1,
    'wood-as-silver covers the house negative cell for ordinary scoring');

  const woodBeforeOverlap = state.players[0].resources.wood;
  const overlap = apply(state, {
    type: 'place_tile', boardId: stoneHouse.id, pieceId: 'wood', x: 1, y: 0, rotation: 0,
  });
  check(!overlap.ok && /overlaps/i.test(overlap.error ?? ''), 'card 40 still rejects an occupied house cell');
  equal(state.players[0].resources.wood, woodBeforeOverlap, 'a rejected card-40 placement is atomic');

  const second = apply(state, {
    type: 'place_tile', boardId: longHouse.id, pieceId: 'wood', x: 0, y: 0, rotation: 0,
  });
  check(second.ok, `card 40 also covers a valid long-house cell${second.error ? `: ${second.error}` : ''}`);
  equal(state.players[0].resources.wood, 2, 'each repeated card-40 placement consumes one more wood');

  const forbidden = apply(state, {
    type: 'place_tile', boardId: longHouse.id, pieceId: 'wood', x: 3, y: 1, rotation: 0,
  });
  check(!forbidden.ok && /forbidden|overhang/i.test(forbidden.error ?? ''),
    'card 40 does not cover a forbidden long-house cell');
  const shedAttempt = apply(state, {
    type: 'place_tile', boardId: shed.id, pieceId: 'wood', x: 0, y: 0, rotation: 0,
  });
  check(!shedAttempt.ok && /final scoring preparation/i.test(shedAttempt.error ?? ''),
    'card 40 does not extend to sheds');
  const home = state.players[0].boards.find((board) => board.kind === 'home')!;
  const homeAttempt = apply(state, {
    type: 'place_tile', boardId: home.id, pieceId: 'wood', x: 0, y: 0, rotation: 0,
  });
  check(!homeAttempt.ok && /only green, blue, silver, and ore/i.test(homeAttempt.error ?? ''),
    'card 40 does not extend to the home board');
  check(/final scoring preparation/i.test(feastPlacementError(state, 0, stoneHouse.id, 'wood', 5, 0, 0) ?? ''),
    'card 40 does not turn the external stone-house wood pasture into a normal grid cell');
}

// ---------------------------------------------------------------------------
// 116 Master Bricklayer: one-stone discount on House Building action spaces.
// ---------------------------------------------------------------------------

{
  const stoneDef = FEAST_ACTION_BY_ID['build-stone-house'];
  const control = fresh(1160);
  control.players[0].resources.stone = 0;
  check(/needs 1 stone/i.test(feastActionReason(control, 0, stoneDef) ?? ''),
    'without card 116, zero stone cannot start the Stone House action');

  const state = fresh(1161, [116]);
  state.players[0].resources.stone = 0;
  equal(feastActionReason(state, 0, stoneDef), null,
    'card 116 affordability preview applies its floor-zero Stone House discount');
  const built = apply(state, { type: 'place_workers', spaceId: stoneDef.id });
  check(built.ok, `card 116 builds a Stone House with zero stone${built.error ? `: ${built.error}` : ''}`);
  equal(state.players[0].resources.stone, 0, 'the one-stone cost is reduced to zero, never below zero');
  check(state.players[0].boards.some((board) => board.definitionId === 'stone-house'),
    'the discounted Stone House action still resolves its printed building');
  check(!state.pending.some((decision) => decision.kind === 'card-effect'),
    'the mandatory card-116 discount applies passively without a redundant confirmation');
}

{
  const state = fresh(1162, [116]);
  state.players[0].resources.stone = 1;
  const built = apply(state, { type: 'place_workers', spaceId: 'build-long-house' });
  check(built.ok, `card 116 builds a Long House for one stone${built.error ? `: ${built.error}` : ''}`);
  equal(state.players[0].resources.stone, 0, 'the printed two-stone Long House cost becomes one');
  check(state.players[0].boards.some((board) => board.definitionId === 'long-house'),
    'the discounted Long House action resolves normally');
}

for (const [seed, optionId, house, ship] of [
  [1163, 'stone-house-longship', 'stone-house', 'longship'],
  [1164, 'long-house-knarr', 'long-house', 'knarr'],
] as const) {
  const state = fresh(seed, [116]);
  state.players[0].resources.stone = 1;
  state.players[0].resources.wood = 2;
  const started = apply(state, { type: 'place_workers', spaceId: 'build-house-and-ship' });
  check(started.ok, `card 116 starts fourth-column ${optionId}${started.error ? `: ${started.error}` : ''}`);
  equal(state.players[0].resources.stone, 0, `${optionId} pays one discounted stone`);
  equal(state.players[0].resources.wood, 0, `${optionId} still pays both printed wood`);
  check(state.pending[0]?.kind === 'goods' && state.pending[0].meta?.mode === 'printed-choice',
    `${optionId} reaches the authentic printed house/ship choice`);
  const chosen = resolve(state, { optionIds: [optionId] });
  check(chosen.ok, `${optionId} resolves${chosen.error ? `: ${chosen.error}` : ''}`);
  check(state.players[0].boards.some((board) => board.definitionId === house),
    `${optionId} gains the selected house`);
  check(state.players[0].ships.some((candidate) => candidate.type === ship),
    `${optionId} gains the paired selected ship`);
}

{
  const state = fresh(1165, [116]);
  state.players[0].resources.wood = 2;
  state.players[0].resources.stone = 0;
  const shed = apply(state, { type: 'place_workers', spaceId: 'build-shed' });
  check(shed.ok, `card 116 does not obstruct an ordinary Shed build${shed.error ? `: ${shed.error}` : ''}`);
  equal(state.players[0].resources.wood, 0, 'card 116 does not discount the shed\'s unchanged two-wood cost');
  equal(state.players[0].resources.stone, 0, 'card 116 never invents a stone payment for the shed');
  equal(feastActionResourceCost(state.players[0], 'build-shed', 'stone', 1), 0,
    'if another effect first replaces the Shed cost with one stone, card 116 discounts that stone');
  equal(feastActionResourceCost(state.players[0], 'build-shed', 'wood', 2), 2,
    'the explicit Shed contingency still never discounts wood');
}

{
  const state = fresh(1166, [116]);
  state.players[0].resources.stone = 1;
  const crafted = apply(state, { type: 'place_workers', spaceId: 'craft-rune-stone' });
  check(crafted.ok, `card 116 allows an affordable non-house stone action${crafted.error ? `: ${crafted.error}` : ''}`);
  equal(state.players[0].resources.stone, 0, 'card 116 does not discount Craft Rune Stone');
  equal(state.players[0].goods['rune-stone'], 1, 'the non-house crafting action resolves its printed reward');
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`\n${failures.length} failed across ${checks} occupation material modifier checks`);
  process.exitCode = 1;
} else {
  console.log(`${checks}/${checks} occupation material modifier checks passed`);
}
