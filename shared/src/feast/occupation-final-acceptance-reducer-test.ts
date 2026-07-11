/**
 * Final adversarial acceptance coverage for cross-card timing, Feast
 * pre-placement, Anytime interruption, and provenance composition.
 *
 * Run: npx tsx shared/src/feast/occupation-final-acceptance-reducer-test.ts
 */

import {
  FEAST_OCCUPATION_BY_ID,
  applyFeastAction,
  createFeast,
  feastAdvanceAutomaticWithOccupations,
  feastFeastPlacementError,
  feastPlacementError,
  feastViewFor,
  type FeastAction,
  type FeastBoardState,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastSeatColor,
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

function scenario(name: string, body: () => void): void {
  try { body(); }
  catch (error) {
    failed++;
    console.error(`FAIL: ${name} aborted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const COLORS: FeastSeatColor[] = ['Red', 'Blue', 'Green', 'Purple'];

function fresh(seed: number, count = 1): FeastState {
  const state = createFeast(Array.from({ length: count }, (_, seat) => ({
    name: `Acceptance ${seat + 1}`, color: COLORS[seat],
  })), seed, { occupationMode: 'all' });
  state.pending = [];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  state.firstPlayer = 0;
  state.feastCursor = 0;
  state.automaticCheckpoint = null;
  state.automaticSeatCursor = 0;
  for (const player of state.players) {
    player.passed = false;
    player.turnActionTaken = false;
    player.turnMayEnd = false;
    player.turnEffectUsed = false;
    player.turnActionId = null;
    player.turnSelectedShipIds = [];
    player.turnActionFacts = {};
  }
  return state;
}

const cardId = (number: number): string => `occupation-${number}`;

function removeEverywhere(state: FeastState, id: string): void {
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  state.occupationDiscard = state.occupationDiscard.filter((candidate) => candidate !== id);
  state.occupationUsage = state.occupationUsage.filter((entry) => entry.cardId !== id);
  for (const player of state.players) {
    player.occupationHand = player.occupationHand.filter((candidate) => candidate !== id);
    player.playedOccupations = player.playedOccupations.filter((candidate) => candidate !== id);
    player.occupationUses = player.occupationUses.filter((entry) => entry.cardId !== id);
  }
}

function markPlayed(state: FeastState, number: number, seat = 0): void {
  const id = cardId(number);
  removeEverywhere(state, id);
  state.players[seat].playedOccupations.push(id);
  state.players[seat].occupationUses.push({ cardId: id, round: state.round, usesThisRound: 0, usedOnce: false });
}

function putInHand(state: FeastState, number: number, seat = 0): void {
  const id = cardId(number);
  removeEverywhere(state, id);
  state.players[seat].occupationHand.push(id);
}

function mustApply(state: FeastState, seat: number, action: FeastAction, message: string): void {
  const result = applyFeastAction(state, seat, action);
  check(result.ok, `${message}${result.ok ? '' : ` (${result.error})`}`);
  if (!result.ok) throw new Error(`${message}: ${result.error}`);
}

function head(state: FeastState, kind?: FeastPendingDecision['kind']): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, `pending ${kind ?? 'decision'} exists`);
  if (!decision) throw new Error(`Missing pending ${kind ?? 'decision'}`);
  if (kind) check(decision.kind === kind, `pending decision is ${kind}`);
  return decision;
}

function resolve(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice,
  message: string, seat = 0,
): void {
  mustApply(state, seat, { type: 'resolve_decision', decisionId: decision.id, choice }, message);
}

function confirmCard(state: FeastState, number: number): void {
  const decision = head(state, 'card-effect');
  equal(decision.meta?.cardId, cardId(number), `card ${number} owns its confirmation`);
  equal(decision.meta?.requestKind, 'confirmation', `card ${number} opens with confirmation`);
  resolve(state, decision, { accepted: true }, `accept card ${number}`);
}

function beginPrintedOccupation(state: FeastState, number: number): void {
  putInHand(state, number);
  mustApply(state, 0, { type: 'place_workers', spaceId: 'play-occupations-2' },
    `place Vikings to play ${FEAST_OCCUPATION_BY_ID[cardId(number)]?.name ?? cardId(number)}`);
  const chooser = head(state, 'occupation');
  resolve(state, chooser, { optionIds: [cardId(number)] }, `play card ${number}`);
}

function resolveOneRepeat(state: FeastState, number: number): void {
  confirmCard(state, number);
  const repeat = state.pending[0];
  if (repeat?.kind === 'card-effect' && repeat.meta?.cardId === cardId(number)
    && repeat.meta?.requestKind === 'repeat') {
    resolve(state, repeat, { accepted: true, amount: 1 }, `resolve one card ${number} exchange`);
  }
}

function firstFeastPlacement(state: FeastState, pieceId: string): { x: number; y: number; rotation: 0 | 90 | 180 | 270 } {
  for (const rotation of [0, 90, 180, 270] as const) for (let y = 0; y < 4; y++) for (let x = 0; x < 12; x++) {
    if (!feastFeastPlacementError(state, 0, pieceId, x, y, rotation)) return { x, y, rotation };
  }
  throw new Error(`No legal Banquet placement for ${pieceId}`);
}

function feastPlacementSequence(
  state: FeastState, pieceIds: readonly string[], index = 0,
): { pieceId: string; x: number; y: number; rotation: 0 | 90 | 180 | 270 }[] | null {
  if (index >= pieceIds.length) return [];
  const pieceId = pieceIds[index];
  for (const rotation of [0, 90, 180, 270] as const) for (let y = 0; y < 4; y++) for (let x = 0; x < 12; x++) {
    if (feastFeastPlacementError(state, 0, pieceId, x, y, rotation)) continue;
    const next = structuredClone(state);
    const result = applyFeastAction(next, 0, { type: 'feast_place', pieceId, x, y, rotation });
    if (!result.ok) continue;
    const rest = feastPlacementSequence(next, pieceIds, index + 1);
    if (rest) return [{ pieceId, x, y, rotation }, ...rest];
  }
  return null;
}

function firstBoardPlacement(
  state: FeastState, board: FeastBoardState, pieceId: string,
): { x: number; y: number; rotation: 0 | 90 | 180 | 270 } {
  for (const rotation of [0, 90, 180, 270] as const) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!feastPlacementError(state, 0, board.id, pieceId, x, y, rotation)) return { x, y, rotation };
  }
  throw new Error(`No legal ${pieceId} placement on ${board.definitionId}`);
}

function finalPlacementDecision(state: FeastState): FeastPendingDecision {
  return {
    id: `acceptance-final-${state.nextId++}`, seat: 0, kind: 'final-placement',
    label: 'Final Placement', prompt: 'Lock boards after placement.',
    options: [{ id: 'confirm', label: 'Confirm' }], min: 1, max: 1,
    meta: { scoring: true }, continuation: { kind: 'none' }, private: false,
  };
}

scenario('113 funds the exact Crafting action it precedes and does not reclassify it for 122', () => {
  const state = fresh(910113);
  markPlayed(state, 113);
  markPlayed(state, 122);
  state.players[0].goods.flax = 1;
  state.players[0].resources.stone = 0;
  state.mountains[0].items = ['stone', ...state.mountains[0].items];

  mustApply(state, 0, { type: 'place_workers', spaceId: 'craft-rune-stone' },
    'propose otherwise-unaffordable Rune Stone crafting');
  confirmCard(state, 113);
  const mountain = head(state, 'mountain');
  resolve(state, mountain, { allocations: [{ id: state.mountains[0].id, amount: 1 }] },
    'take the needed Stone before payment');

  equal(state.players[0].resources.stone, 0, 'the granted Stone is paid to the printed Crafting action');
  equal(state.players[0].goods['rune-stone'], 1, 'the funded action grants its Rune Stone');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(122)).length, 0,
    'occupation mountain grant does not false-classify Crafting as a mountain action');
  check(state.pending.length === 0 && state.players[0].turnMayEnd, 'the funded action completes normally');
});

scenario('121 may fund card 105 before the replacement choice', () => {
  const state = fresh(910121);
  markPlayed(state, 121);
  markPlayed(state, 105);
  state.players[0].resources.wood = 2;
  state.mountains[0].items = ['wood', ...state.mountains[0].items];

  mustApply(state, 0, { type: 'place_workers', spaceId: 'build-whaling-boat' },
    'propose Ship Building with two Wood and a mountain grant');
  confirmCard(state, 121);
  const mountain = head(state, 'mountain');
  resolve(state, mountain, { allocations: [{ id: state.mountains[0].id, amount: 1 }] },
    'take the third Wood first');
  confirmCard(state, 105);

  equal(state.players[0].resources.wood, 0, 'all three Wood pay for the replacement Knarr');
  equal(state.players[0].ships.filter((ship) => ship.type === 'knarr' && !ship.emigrated).length, 1,
    'card 105 builds the replacement Knarr');
  equal(state.players[0].ships.filter((ship) => ship.type === 'whaling-boat' && !ship.emigrated).length, 0,
    'the printed Whaling Boat is suppressed');
});

scenario('84 and 170 combine on an occupation-granted Emigration', () => {
  const state = fresh(910170);
  state.round = 5;
  markPlayed(state, 170);
  state.players[0].silver = 2;
  state.players[0].ships.push({ id: 'discount-knarr', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null });
  beginPrintedOccupation(state, 84);
  confirmCard(state, 84);

  const emigration = head(state, 'card-effect');
  const ship = emigration.options.find((option) => option.id === 'discount-knarr');
  check(!!ship && !ship.disabled, 'combined discounts make the Knarr Emigration affordable');
  check(ship?.detail?.includes('2 silver'), 'UI contract previews the exact combined 2-silver cost');
  resolve(state, emigration, { optionIds: ['discount-knarr'] }, 'resolve discounted occupation Emigration');
  check(state.players[0].ships.find((candidate) => candidate.id === 'discount-knarr')?.emigrated,
    'the selected Knarr emigrates');
  equal(state.players[0].silver, 0, 'exactly two silver are paid');
});

scenario('Tutor hand choice is private to its owner', () => {
  const state = fresh(910052, 2);
  markPlayed(state, 52);
  putInHand(state, 43);
  state.players[0].silver = 1;
  mustApply(state, 0, { type: 'activate_occupation', cardId: cardId(52) }, 'activate Tutor');
  confirmCard(state, 52);
  const ownerDecision = head(state, 'card-effect');
  check(ownerDecision.private, 'Tutor choice is marked private by the reducer');
  check(ownerDecision.options.some((option) => option.id === cardId(43)), 'owner sees the exact hand card');
  equal(feastViewFor(state, 1).pending?.options, [], 'other player sees no hand-card options');
});

scenario('Follower copied reward has zero-worker occupation provenance', () => {
  const state = fresh(910077, 2);
  markPlayed(state, 154);
  const copied = state.actionSpaces.find((space) => space.id === 'wood-per-player')!;
  copied.occupants.push({ seat: 1, workers: 2, workerColor: state.players[1].activeWorkerColor, copiedFrom: null });
  beginPrintedOccupation(state, 77);
  confirmCard(state, 77);
  const grant = head(state, 'card-effect');
  const option = grant.options.find((candidate) => candidate.id === 'wood-per-player');
  check(!!option && !option.disabled, 'Follower offers the occupied second-column Wood action');
  const silverBefore = state.players[0].silver;
  resolve(state, grant, { optionIds: ['wood-per-player'] }, 'copy Wood per Player without Vikings');
  equal(state.players[0].resources.wood, 2, 'two-player copied action grants two Wood');
  equal(state.players[0].resources.ore, 1, 'copied action grants its Ore');
  equal(state.players[0].silver, silverBefore, 'card 154 grants no false Viking-action silver');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(154)).length, 0,
    'card 154 records no false use');
});

scenario('Feast food pre-placement stages 157/158 once and counts Mead/Meat for 160/159', () => {
  const state = fresh(910158);
  for (const card of [157, 158, 159, 160]) markPlayed(state, card);
  state.players[0].goods.sheep = 1;
  state.players[0].goods['game-meat'] = 1;
  state.players[0].goods.mead = 1;
  state.players[0].workersTotal = 12;
  const weaponsBefore = Object.values(state.players[0].weapons).reduce((sum, count) => sum + count, 0);

  const sequence = feastPlacementSequence(state, ['game-meat', 'sheep', 'mead']);
  check(!!sequence, 'a legal three-piece pre-Feast layout exists');
  if (!sequence) throw new Error('No legal three-piece pre-Feast layout');
  for (const placement of sequence) mustApply(state, 0, { type: 'feast_place', ...placement },
    `pre-place ${placement.pieceId}`);
  equal(state.players[0].goods['skin-and-bones'], 0, 'animal reward waits until Feast begins');

  state.phase = 'feast';
  state.phaseNumber = 9;
  state.automaticCheckpoint = null;
  feastAdvanceAutomaticWithOccupations(state);
  const feast = head(state, 'feast');
  equal(state.players[0].goods['skin-and-bones'], 1, 'card 157 rewards the pre-placed Sheep at Feast arrival');
  equal(Object.values(state.players[0].weapons).reduce((sum, count) => sum + count, 0), weaponsBefore + 3,
    'card 158 draws three weapons for pre-placed Game Meat');
  equal(state.players[0].silver, 1, 'card 158 grants one silver and card 160 is suppressed by pre-placed Mead');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(157)).length, 1,
    'card 157 fires exactly once');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(158)).length, 1,
    'card 158 fires exactly once');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(160)).length, 0,
    'card 160 sees the actual pre-placed Mead count');
  equal(state.players[0].feastRewardedPlacementIds.length, 3, 'every pre-placement is checkpointed exactly once');

  mustApply(state, 0, { type: 'feast_finish' }, 'finish the Feast with pre-placed food');
  const hunter = head(state, 'card-effect');
  equal(hunter.meta?.cardId, cardId(159), 'card 159 sees pre-placed Game Meat after the Feast');
  resolve(state, hunter, { accepted: false }, 'decline the post-Feast Hunt');
  equal(state.players[0].feastPlacements, [], 'resolved Feast clears staged food');
  equal(state.players[0].feastRewardedPlacementIds, [], 'resolved Feast clears its reward checkpoint');
  void feast;
});

scenario('Anytime cards safely interrupt and restore Feast/final-placement decisions', () => {
  const feastState = fresh(910057);
  markPlayed(feastState, 57);
  feastState.players[0].goods.beans = 2;
  feastState.phase = 'feast';
  feastState.phaseNumber = 9;
  feastAdvanceAutomaticWithOccupations(feastState);
  const feastId = head(feastState, 'feast').id;
  mustApply(feastState, 0, { type: 'activate_occupation', cardId: cardId(57) }, 'activate Bean Trader during Feast');
  resolveOneRepeat(feastState, 57);
  equal(head(feastState, 'feast').id, feastId, 'the original Feast decision is restored');
  equal(feastState.players[0].goods.beans, 0, 'Bean Trader spends two Beans');
  equal(feastState.players[0].goods.stockfish, 1, 'Bean Trader creates usable Feast food');

  const finalState = fresh(910187);
  markPlayed(finalState, 187);
  finalState.players[0].goods.flax = 3;
  finalState.phase = 'feast';
  const final = finalPlacementDecision(finalState);
  finalState.pending = [final];
  mustApply(finalState, 0, { type: 'activate_occupation', cardId: cardId(187) },
    'activate Belt Maker before final scoring');
  resolveOneRepeat(finalState, 187);
  equal(head(finalState, 'final-placement').id, final.id, 'the final-placement lock decision is restored');
  equal(finalState.players[0].goods.flax, 0, 'Belt Maker spends three Flax');
  equal(finalState.players[0].goods['treasure-chest'], 1, 'Belt Maker grants the Treasure Chest before scoring');
});

scenario('card 40 placement and final card 100 hooks preserve their blocking decisions', () => {
  const feastState = fresh(910040);
  markPlayed(feastState, 40);
  feastState.players[0].resources.wood = 1;
  const house: FeastBoardState = {
    id: 'acceptance-stone-house', definitionId: 'stone-house', kind: 'building', owner: 0, placements: [],
  };
  feastState.players[0].boards.push(house);
  feastState.phase = 'feast';
  feastState.phaseNumber = 9;
  feastAdvanceAutomaticWithOccupations(feastState);
  const feastDecision = head(feastState, 'feast');
  const wood = firstBoardPlacement(feastState, house, 'wood');
  mustApply(feastState, 0, { type: 'place_tile', pieceId: 'wood', boardId: house.id, ...wood },
    'place Wood as house silver during Feast');
  equal(head(feastState, 'feast').id, feastDecision.id, 'card 40 restores the Feast decision');
  equal(feastState.players[0].boards.find((board) => board.id === house.id)?.placements.length, 1,
    'card 40 commits the Wood to the Stone House');

  const finalState = fresh(910100);
  markPlayed(finalState, 100);
  finalState.players[0].goods['rune-stone'] = 1;
  const exploration: FeastBoardState = {
    id: 'acceptance-iceland', definitionId: 'iceland', kind: 'exploration', owner: 0, placements: [],
  };
  finalState.players[0].boards.push(exploration);
  finalState.phase = 'feast';
  const final = finalPlacementDecision(finalState);
  finalState.pending = [final];
  const rune = firstBoardPlacement(finalState, exploration, 'rune-stone');
  mustApply(finalState, 0, { type: 'place_tile', pieceId: 'rune-stone', boardId: exploration.id, ...rune },
    'place final Rune Stone on exploration board');
  equal(head(finalState, 'final-placement').id, final.id, 'final placement decision is restored after hooks');
  equal(finalState.players[0].silver, 1, 'card 100 rewards the final Rune Stone placement');
  equal(finalState.occupationUsage.filter((entry) => entry.cardId === cardId(100)).length, 1,
    'card 100 records exactly one final-placement event');
});

console.log(`Feast final acceptance reducer: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
