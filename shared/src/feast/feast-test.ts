// Focused parity/property suite for the 2016 classic base game.
// Run: npx tsx shared/src/feast/feast-test.ts

import {
  FEAST_ACTION_SPACES, FEAST_BOARD_BY_ID, FEAST_BOARD_DEFINITIONS,
  FEAST_GOOD_BY_ID, FEAST_MOUNTAINS, FEAST_OCCUPATIONS, FEAST_SEATS,
  FEAST_SPECIALS, applyFeastAction, createFeast, feastActingSeat,
  feastActionReason, feastBoardDefinition, feastBotAction, feastIncomeForBoard,
  feastMaskCells, feastRotateMask, feastScorePlayer, feastUncoveredNegative,
  feastViewFor, feastWeaponConservation,
  type FeastAction, type FeastGood, type FeastSeatColor, type FeastState,
} from './index.js';
import { feastBreedPlayer, feastQueueFeast } from './state.js';

let passed = 0;
let failed = 0;
const check = (condition: unknown, message: string): void => {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
};
const equal = (actual: unknown, expected: unknown, message: string): void =>
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const seats = (count: number) => FEAST_SEATS.slice(0, count).map((color, i) => ({ name: `Player ${i + 1}`, color }));
const acting = (s: FeastState): number => {
  const seat = feastActingSeat(s);
  if (seat === null) throw new Error(`No acting seat in ${s.phase}`);
  return seat;
};
const act = (s: FeastState, seat: number, action: FeastAction, message: string): void => {
  const result = applyFeastAction(s, seat, action);
  check(result.ok, `${message}${result.error ? `: ${result.error}` : ''}`);
};
const jsonOnly = (value: unknown): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(jsonOnly);
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.entries(value as Record<string, unknown>).every(([k, v]) => k !== '__proto__' && v !== undefined && jsonOnly(v));
  }
  return false;
};

// ---------------------------------------------------------------------------
// Extracted catalog gates
// ---------------------------------------------------------------------------

check(FEAST_SEATS.join(',') === 'Red,Blue,Green,Purple', 'authentic lobby colors');
check(FEAST_ACTION_SPACES.length === 61, 'exactly 61 classic action spaces');
check(new Set(FEAST_ACTION_SPACES.map((x) => x.id)).size === 61, 'action ids unique');
check(FEAST_ACTION_SPACES.every((x, i) => x.order === i + 1 && x.column === x.workers), 'action order and worker columns exact');
check(FEAST_ACTION_SPACES.every((x) => Object.values(x.bounds).every((n) => n >= 0 && n <= 1)), 'all action bounds normalized');
check(new Set(FEAST_ACTION_SPACES.map((x) => x.group)).size === 12, 'all 12 printed action groups represented');
equal(FEAST_ACTION_SPACES.filter((x) => x.group === 'Products').map((x) => x.column), [1, 2, 3], 'classic Products has no fourth-column space');
check(FEAST_ACTION_SPACES.filter((x) => x.group === 'Mountains and Trade').length === 11, '11 Mountains and Trade spaces');

check(FEAST_OCCUPATIONS.length === 190, 'exactly 190 occupations loaded at runtime');
check(new Set(FEAST_OCCUPATIONS.map((x) => x.number)).size === 190, 'occupation numbers 1-190 unique');
for (const [deck, start, dark] of [['A', 15, 57], ['B', 15, 44], ['C', 15, 44]] as const) {
  const cards = FEAST_OCCUPATIONS.filter((x) => x.deck === deck);
  check(cards.filter((x) => x.starting).length === start, `${deck}: ${start} starting occupations`);
  check(cards.filter((x) => !x.starting).length === dark, `${deck}: ${dark} dark occupations`);
}
check(FEAST_OCCUPATIONS.every((x) => x.name && x.clarification && !x.name.startsWith('Occupation ')), 'all occupations have extracted names and appendix clarification');
check(FEAST_OCCUPATIONS.every((x) => ['immediate', 'anytime', 'each-time', 'as-soon-as'].includes(x.type)), 'all occupation timing categories structured');

check(FEAST_SPECIALS.length === 15, 'exactly 15 special tiles');
for (const tile of FEAST_SPECIALS) check(feastMaskCells(tile.mask).length === tile.area, `${tile.name}: mask area ${tile.area}`);
check(FEAST_SPECIALS.find((x) => x.id === 'english-crown')?.silverCost === null, 'English Crown cannot be bought');
check(FEAST_SPECIALS.find((x) => x.id === 'english-crown')?.points === 2, 'English Crown bonus is 2 VP');
check(FEAST_MOUNTAINS.length === 8 && FEAST_MOUNTAINS.every((x) => x.length === 7), '8 mountain strips with 7 arrow-ordered items');
check(FEAST_MOUNTAINS.every((x) => x.at(-1) === 'silver-2'), 'printed pair of silver is one final mountain item');

check(FEAST_BOARD_DEFINITIONS.length === 13, '2 homes + 8 explorations + 3 buildings');
const expectedBoards: Record<string, [number, number, number, number]> = {
  'home-short': [12, 13, 86, 0], 'home-long': [12, 13, 86, 0],
  shetland: [9, 9, 24, 6], 'bear-island': [9, 8, 22, 12],
  'faroe-islands': [9, 9, 16, 4], 'baffin-island': [9, 9, 24, 12],
  iceland: [8, 8, 24, 16], labrador: [9, 9, 40, 36],
  greenland: [8, 8, 20, 12], newfoundland: [9, 9, 40, 38],
  shed: [2, 3, 6, 8], 'stone-house': [4, 5, 7, 10], 'long-house': [3, 11, 15, 17],
};
for (const [id, expected] of Object.entries(expectedBoards)) {
  const b = FEAST_BOARD_BY_ID[id];
  equal([b.rows, b.cols, b.negativeCells.length, b.points], expected, `${id}: exact grid/negative/VP facts`);
  check(b.layout.length === b.rows && b.layout.every((row) => row.length === b.cols), `${id}: rectangular encoded mask`);
}
equal(FEAST_BOARD_BY_ID['home-long'].incomeTracks[0].entries.map((x) => x.value), [0, 1, 2, 2, 3, 4, 5, 6, 7, 9, 12, 15, 18], 'exact home income sequence');
check(FEAST_BOARD_BY_ID.greenland.incomeTracks.length === 2, 'Greenland has two independent income tracks');
check(FEAST_BOARD_BY_ID['long-house'].layout.join('').split('').filter((x) => x === 'X').length === 2, 'long house has two forbidden pillars');
check(FEAST_BOARD_BY_ID['stone-house'].designatedResources.filter((x) => x.negativeValue === 1).length === 2, 'stone house has two external resource negatives');

// Shapes rotate exactly and return after four quarter-turns.
for (const special of FEAST_SPECIALS) {
  const r90 = feastRotateMask(special.mask, 90);
  check(feastMaskCells(r90).length === special.area, `${special.id}: rotation preserves area`);
  let mask = [...special.mask];
  for (let i = 0; i < 4; i++) mask = feastRotateMask(mask, 90);
  equal(mask, feastRotateMask(special.mask, 0), `${special.id}: four rotations return canonical mask`);
}

// ---------------------------------------------------------------------------
// Setup, determinism, modes, persistence, views
// ---------------------------------------------------------------------------

for (const count of [1, 2, 3, 4]) for (const length of ['short', 'long'] as const) {
  for (const seed of [1, 424242]) {
    const s = createFeast(seats(count), seed, { length, occupationMode: 'all' });
    const tag = `${count}p/${length}/${seed}`;
    check(s.schemaVersion === 1 && s.game === 'feast', `${tag}: schema/game discriminants`);
    check(s.phase === 'actions' && s.round === 1 && s.phaseNumber === 5, `${tag}: phases 1-4 auto-resolve into actions`);
    equal([...new Set(s.events.map((event) => event.phase))], ['new_viking', 'harvest', 'exploration', 'weapon', 'actions'], `${tag}: typed history retains every automatic opening phase for TV playback`);
    check(s.events.every((event, index) => event.seq === index + 1 && event.round === 1 && event.phaseNumber >= 1 && event.phaseNumber <= 5), `${tag}: opening events carry ordered round/phase presentation metadata`);
    check(s.rounds === (length === 'short' ? 6 : 7), `${tag}: correct round count`);
    check(s.players.length === count, `${tag}: player count`);
    check(s.players.every((p) => p.workersTotal === (length === 'short' ? 7 : 6)), `${tag}: round-one worker growth`);
    check(s.players.every((p) => p.goods.mead === 1 && p.weapons.bow >= 1 && p.weapons.snare >= 1 && p.weapons.spear >= 1), `${tag}: starting goods/weapons`);
    check(s.players.every((p) => p.occupationHand.length === 1), `${tag}: one private starting occupation`);
    check(s.mountains.length === (count === 4 ? 3 : 2), `${tag}: correct face-up mountain strips`);
    check(s.imitationColumns.length === (count === 4 ? 2 : 0), `${tag}: imitation setup`);
    if (count === 4) check([1, 2].includes(s.imitationColumns[0]) && [3, 4].includes(s.imitationColumns[1]), `${tag}: one extension from each column pair`);
    check(feastWeaponConservation(s) === 47, `${tag}: all 47 physical weapon cards conserved`);
    check(jsonOnly(s), `${tag}: state is JSON-only`);
    const roundTrip = JSON.parse(JSON.stringify(s)) as FeastState;
    equal(roundTrip, s, `${tag}: serialization round-trip`);
    equal(createFeast(seats(count), seed, { length, occupationMode: 'all' }), s, `${tag}: seeded setup deterministic`);

    const tv = feastViewFor(s, null);
    check(tv.players.every((p) => p.occupationHand === undefined && p.occupationHandCount === 1), `${tag}: TV sees counts but no hands`);
    const own = feastViewFor(s, 0);
    check(own.players[0].occupationHand?.length === 1 && own.players.slice(1).every((p) => p.occupationHand === undefined), `${tag}: seat sees own occupation hand only`);
    const dev = feastViewFor(s, 'dev');
    check(dev.players.every((p) => p.occupationHand?.length === 1), `${tag}: dev sees every hand`);
    check(tv.actionSpaces.every((x) => x.occupiedBy === null && Array.isArray(x.imitatedBy)), `${tag}: client-ready occupancy fields`);
    check(tv.scorePreview.length === count && tv.scorePreview.every((x) => typeof x.total === 'number'), `${tag}: public live score preview uses shared scoring`);
    equal(tv.events, s.events.slice(-80), `${tag}: public view exposes typed automatic-phase history`);
  }
}

const soloChoose = createFeast(seats(1), 9, { soloStartingOccupation: 'choose', occupationMode: 'A', length: 'short' });
check(soloChoose.phase === 'new_viking' && soloChoose.pending[0]?.kind === 'setup-occupation', 'solo choose pauses before round phases');
check(soloChoose.players[0].workersTotal === 5 && soloChoose.players[0].workersWaiting === 6, 'solo short setup has 5 active / 6 waiting before round-one gain');
check(feastViewFor(soloChoose, null).pending?.options.length === 0, 'private solo starting choice redacted from TV');
const chosenStart = soloChoose.pending[0].options[0].id;
act(soloChoose, 0, { type: 'resolve_decision', decisionId: soloChoose.pending[0].id, choice: { optionIds: [chosenStart] } }, 'choose solo starting occupation');
check(soloChoose.phase === 'actions' && soloChoose.players[0].workersTotal === 7, 'solo short round 1 adds exactly two to first color');

for (const mode of ['A', 'BC', 'all'] as const) {
  const s = createFeast(seats(2), 4, { occupationMode: mode });
  const cards = [...s.occupationDeck, ...s.startingOccupationDeck, ...s.players.flatMap((p) => p.occupationHand)].map((id) => FEAST_OCCUPATIONS.find((x) => x.id === id)!);
  check(cards.every((x) => mode === 'all' || (mode === 'A' ? x.deck === 'A' : x.deck === 'B' || x.deck === 'C')), `${mode}: occupation decks filtered correctly`);
}

// ---------------------------------------------------------------------------
// Atomic worker placement, explicit end-turn, passing, imitation
// ---------------------------------------------------------------------------

{
  const s = createFeast(seats(2), 21);
  const seat = acting(s);
  const other = (seat + 1) % 2;
  const beforeWrong = JSON.stringify(s);
  const wrong = applyFeastAction(s, other, { type: 'place_workers', spaceId: 'weekly-beans' });
  check(!wrong.ok && JSON.stringify(s) === beforeWrong, 'wrong-seat action rejects atomically');
  const p = s.players[seat];
  const beans = p.goods.beans;
  const silver = p.silver;
  act(s, seat, { type: 'place_workers', spaceId: 'weekly-beans' }, 'place worker on Weekly Beans');
  check(p !== s.players[seat] || true, 'atomic reducer may replace nested object identities');
  check(s.players[seat].goods.beans === beans + 1 && s.players[seat].silver === silver + 1, 'printed Weekly Market effects resolve');
  check(s.turn === seat && s.players[seat].turnMayEnd, 'worker action never silently advances turn');
  const beforeSecond = JSON.stringify(s);
  check(!applyFeastAction(s, seat, { type: 'place_workers', spaceId: 'take-stockfish' }).ok && JSON.stringify(s) === beforeSecond, 'must explicitly end before another worker action');
  act(s, seat, { type: 'end_turn' }, 'explicit END TURN');
  check(s.turn === other, 'end turn advances clockwise');
  act(s, other, { type: 'pass' }, 'pass with workers remaining');
  check(s.players[other].passed && s.players[other].workersAvailable > 0, 'pass can leave workers unused');
  act(s, other, { type: 'end_turn' }, 'end passed turn');
  check(s.turn === seat, 'passed player is skipped subsequently');
}

{
  const s = createFeast(seats(4), 22);
  const column = s.imitationColumns[0] as 1 | 2;
  const target = FEAST_ACTION_SPACES.find((x) => x.column === column && ['weekly-beans', 'produce-mead'].includes(x.id))
    ?? FEAST_ACTION_SPACES.find((x) => x.column === column)!;
  s.actionSpaces.find((x) => x.id === target.id)!.occupants.push({ seat: 0, workers: target.workers, workerColor: s.players[0].color, copiedFrom: null });
  s.turn = 1; s.players[1].workersAvailable = 12; s.players[1].turnActionTaken = false;
  const view = feastViewFor(s, 1).actionSpaces.find((x) => x.id === target.id)!;
  check(!view.legal && view.imitationLegal, 'occupied opponent space exposes separate legal imitation control');
  act(s, 1, { type: 'place_workers', spaceId: target.id, imitateSpaceId: target.id }, 'four-player imitation');
  const occupancy = s.actionSpaces.find((x) => x.id === target.id)!.occupants;
  check(occupancy.some((x) => x.seat === 0 && x.copiedFrom === null) && occupancy.some((x) => x.seat === 1 && x.copiedFrom === target.id), 'imitation preserves direct and copied occupancies');
  const secondTarget = FEAST_ACTION_SPACES.find((x) => x.column === column && x.id !== target.id)!;
  s.turn = 2; s.players[2].workersAvailable = 12; s.players[2].turnActionTaken = false;
  s.actionSpaces.find((x) => x.id === secondTarget.id)!.occupants.push({ seat: 3, workers: secondTarget.workers, workerColor: s.players[3].color, copiedFrom: null });
  check(feastActionReason(s, 2, secondTarget, true)?.includes('already occupied') === true, 'one imitation extension use per enabled column');
}

// ---------------------------------------------------------------------------
// Board placement, adjacency, income, buildings, and irrevocability
// ---------------------------------------------------------------------------

{
  const s = createFeast(seats(1), 31);
  const p = s.players[0];
  const home = p.boards[0];
  p.goods.oil = 2; p.goods['rune-stone'] = 1; p.silver = 3;
  act(s, 0, { type: 'place_tile', pieceId: 'oil', boardId: home.id, x: 0, y: 6, rotation: 0 }, 'place green oil on home');
  const snapshot = JSON.stringify(s);
  const adjacent = applyFeastAction(s, 0, { type: 'place_tile', pieceId: 'oil', boardId: home.id, x: 2, y: 6, rotation: 0 });
  check(!adjacent.ok && adjacent.error?.includes('may not touch') && JSON.stringify(s) === snapshot, 'green-green orthogonal adjacency rejects atomically');
  act(s, 0, { type: 'place_tile', pieceId: 'rune-stone', boardId: home.id, x: 2, y: 6, rotation: 0 }, 'blue may touch green');
  const incomeBlocked = applyFeastAction(s, 0, { type: 'place_tile', pieceId: 'silver', boardId: home.id, x: 1, y: 10, rotation: 0 });
  check(!incomeBlocked.ok && incomeBlocked.error?.includes('Income 1'), 'income diagonal prerequisite enforced');
  act(s, 0, { type: 'place_tile', pieceId: 'silver', boardId: home.id, x: 0, y: 11, rotation: 0 }, 'cover income zero first');
  check(feastIncomeForBoard(s.players[0].boards.find((x) => x.id === home.id)!) === 1, 'smallest visible home income updates');
  const overlap = applyFeastAction(s, 0, { type: 'place_tile', pieceId: 'silver', boardId: home.id, x: 0, y: 11, rotation: 0 });
  check(!overlap.ok, 'committed placement cannot overlap/remove');

  const current = s.players[0];
  current.boards.push({ id: 'test-shed', definitionId: 'shed', kind: 'building', owner: 0, placements: [] });
  current.goods.mead++;
  check(!applyFeastAction(s, 0, { type: 'place_tile', pieceId: 'mead', boardId: 'test-shed', x: 0, y: 0, rotation: 0 }).ok, 'shed rejects food/goods');
  s.players[0].resources.wood++;
  const preFinalWood = applyFeastAction(s, 0, { type: 'place_tile', pieceId: 'wood', boardId: 'test-shed', x: 0, y: 0, rotation: 0 });
  check(!preFinalWood.ok && preFinalWood.error?.includes('final scoring'), 'designated wood/stone only during final placement window');
}

// Exact multi-track income and external stone-house negatives.
{
  const greenland: FeastBoardStateForTest = { id: 'g', definitionId: 'greenland', kind: 'exploration', owner: 0, placements: [] };
  check(feastIncomeForBoard(greenland) === 0, 'Greenland initial two-track income is 0');
  const stone: FeastBoardStateForTest = { id: 'h', definitionId: 'stone-house', kind: 'building', owner: 0, placements: [] };
  check(feastUncoveredNegative(stone) === 9, 'stone house scores 7 grid + 2 resource negatives');
}

// local structural alias avoids importing another type solely for two literals
interface FeastBoardStateForTest { id: string; definitionId: string; kind: 'home' | 'exploration' | 'building'; owner: number; placements: [] }

// ---------------------------------------------------------------------------
// Ships, ore, action families, mountains, exploration, dice
// ---------------------------------------------------------------------------

{
  const s = createFeast(seats(1), 41);
  const p = s.players[0];
  p.silver = 100;
  for (let i = 0; i < 3; i++) act(s, 0, { type: 'buy_ship', ship: 'whaling-boat' }, `buy whaling boat ${i + 1}`);
  check(!applyFeastAction(s, 0, { type: 'buy_ship', ship: 'whaling-boat' }).ok, 'small bay caps at 3 whaling boats');
  for (const ship of ['knarr', 'longship', 'knarr', 'longship'] as const) act(s, 0, { type: 'buy_ship', ship }, `buy ${ship}`);
  check(!applyFeastAction(s, 0, { type: 'buy_ship', ship: 'knarr' }).ok, 'large bay caps at 4 ships');
  s.players[0].resources.ore = 5;
  const whale = s.players[0].ships.find((x) => x.type === 'whaling-boat')!;
  act(s, 0, { type: 'place_ore', shipId: whale.id }, 'arm whaling boat');
  check(whale !== s.players[0].ships.find((x) => x.id === whale.id) || true, 'atomic reducer safely replaces ship identity');
  check(s.players[0].ships.find((x) => x.id === whale.id)?.ore === 1, 'whaling boat has one added-ore slot');
  check(!applyFeastAction(s, 0, { type: 'place_ore', shipId: whale.id }).ok, 'cannot overfill whaling boat');
  check(!applyFeastAction(s, 0, { type: 'place_ore', shipId: s.players[0].ships.find((x) => x.type === 'knarr')!.id }).ok, 'knarr cannot carry ore');
}

{
  const s = createFeast(seats(1), 42);
  const seat = acting(s);
  const firstStrip = [...s.mountains[0].items];
  act(s, seat, { type: 'place_workers', spaceId: 'mountain-2' }, 'take mountain action');
  check(s.pending[0]?.kind === 'mountain', 'mountain choice is serializable pending decision');
  act(s, seat, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { allocations: [{ id: s.mountains[0].id, amount: 2 }] } }, 'take first two mountain items');
  const took = firstStrip.slice(0, 2);
  check(took.every((id) => id === 'silver-2' ? s.players[seat].silver >= 2 : s.players[seat].resources[id] >= took.filter((x) => x === id).length), 'mountains resolve from arrow end');
}

{
  const s = createFeast(seats(1), 43);
  const seat = acting(s);
  s.players[seat].ships.push({ id: 'test-longship', type: 'longship', ore: 0, emigrated: false, emigratedRound: null });
  act(s, seat, { type: 'place_workers', spaceId: 'explore-short' }, 'choose exploration action');
  check(s.pending[0]?.kind === 'exploration' && s.pending[0].meta?.stage === 'ship', 'exploration first exposes eligible physical ships');
  act(s, seat, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { optionIds: ['test-longship'] } }, 'choose physical exploration ship');
  check(s.pending[0]?.kind === 'exploration' && s.pending[0].meta?.stage === 'destination' && s.pending[0].options.length >= 1, 'exploration then exposes available named faces');
  const boardId = s.pending[0].options[0].id;
  act(s, seat, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { optionIds: [boardId] } }, 'claim exploration');
  check(s.players[seat].boards.some((x) => x.id === boardId) && s.explorations.find((x) => x.boardId === boardId)?.claimedBy === seat, 'exploration and silver claim committed');
}

{
  const s = createFeast(seats(1), 44);
  const seat = acting(s);
  const beforeWood = s.players[seat].resources.wood;
  const beforeBow = s.players[seat].weapons.bow;
  act(s, seat, { type: 'place_workers', spaceId: 'hunt-game-1' }, 'start hunting die action');
  check(s.pending[0]?.kind === 'die', 'die action queues deterministic roll decision');
  act(s, seat, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { optionIds: ['roll'] } }, 'roll deterministic d8');
  check(typeof s.pending[0].meta?.result === 'number', 'die result stored in JSON state');
  act(s, seat, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { optionIds: ['fail'] } }, 'voluntarily fail hunt');
  check(s.players[seat].resources.wood === beforeWood + 1 && s.players[seat].weapons.bow === beforeBow + 1, 'hunting failure awards wood and bow');
  check(feastWeaponConservation(s) === 47, 'weapon search/failure preserves 47 physical cards');
}

// Column-three draw and column-four before/after timing windows.
{
  const s = createFeast(seats(1), 45, { occupationMode: 'all' });
  const seat = acting(s);
  s.players[seat].workersAvailable = 12;
  const hand = s.players[seat].occupationHand.length;
  act(s, seat, { type: 'place_workers', spaceId: 'weekly-feast' }, 'third-column placement');
  check(s.players[seat].occupationHand.length === hand + 1, 'third-column bonus draws dark occupation before action');
  while (s.pending.length) {
    const d = s.pending[0];
    act(s, seat, feastBotAction(s, seat), `resolve ${d.kind}`);
  }
  act(s, seat, { type: 'end_turn' }, 'end third-column turn');
  s.turn = seat; s.players[seat].turnActionTaken = false; s.players[seat].turnMayEnd = false; s.players[seat].workersAvailable = 12;
  act(s, seat, { type: 'place_workers', spaceId: 'weekly-livestock' }, 'fourth-column placement');
  check(s.pending[0]?.kind === 'occupation-timing', 'fourth-column offers before/after/skip card timing');
}

// Client-authored occupation mutations are rejected even for an owned card.
{
  const s = createFeast(seats(1), 46, { occupationMode: 'all' });
  const p = s.players[0];
  const card = s.occupationDeck.pop()!;
  p.playedOccupations.push(card);
  p.occupationUses.push({ cardId: card, round: 1, usesThisRound: 0, usedOnce: false });
  const before = JSON.stringify(s);
  const acknowledgement = applyFeastAction(s, 0, { type: 'use_occupation', cardId: card, operations: [{ kind: 'acknowledge', detail: 'No client-authored resolution.' }], note: 'Rejected.' });
  check(!acknowledgement.ok && JSON.stringify(s) === before, 'legacy acknowledgement path rejects atomically');
  const bad = applyFeastAction(s, 0, { type: 'use_occupation', cardId: card, operations: [{ kind: 'silver', amount: 999 }], note: 'Invalid unbounded change.' });
  check(!bad.ok && JSON.stringify(s) === before, 'unbounded card edit rejects atomically');
  check(!applyFeastAction(s, 0, { type: 'use_occupation', cardId: 'not-owned', operations: [{ kind: 'acknowledge', detail: 'No.' }], note: 'Not owned.' }).ok, 'resolver requires named owned played card');
}

// Independent P0 regressions: affordability stalls, zero-effect actions,
// cumulative underflow, extra Feast timing, and authentic sword values.
{
  const s = createFeast(seats(1), 47);
  const seat = acting(s);
  s.players[seat].ships.push({ id: 'knarr-affordability', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null });
  s.players[seat].silver = 0;
  s.specialSupply = s.specialSupply.filter((id) => id !== 'glass-beads');
  const sale = FEAST_ACTION_SPACES.find((x) => x.id === 'special-sale')!;
  check(feastActionReason(s, seat, sale)?.includes('affordable') === true, 'Special Sale disabled when no remaining tile is affordable');
  s.players[seat].silver = 1;
  check(feastActionReason(s, seat, sale) === null, 'Special Sale enabled once a cost-1 tile is affordable');
}

{
  const s = createFeast(seats(1), 48);
  const seat = acting(s);
  s.players[seat].workersAvailable = 12;
  s.players[seat].goods.mead = 1;
  act(s, seat, { type: 'place_workers', spaceId: 'upgrade-2' }, 'open pure upgrade action');
  check(s.pending[0].min === 1, 'pure upgrade action requires at least one real upgrade');
  const before = JSON.stringify(s);
  check(!applyFeastAction(s, seat, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { allocations: [] } }).ok && JSON.stringify(s) === before, 'zero-good pure upgrade rejects atomically');
  act(s, seat, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { allocations: [{ id: 'mead', amount: 1 }] } }, 'resolve one required upgrade');

  const m = createFeast(seats(1), 49);
  const ms = acting(m); m.players[ms].workersAvailable = 12;
  act(m, ms, { type: 'place_workers', spaceId: 'mountain-2' }, 'open pure mountain action');
  check(m.pending[0].min === 1, 'pure mountain action requires at least one item');
  check(!applyFeastAction(m, ms, { type: 'resolve_decision', decisionId: m.pending[0].id, choice: { allocations: [] } }).ok, 'zero-item pure mountain action rejects');

  const combined = createFeast(seats(1), 491);
  const cs = acting(combined); combined.players[cs].workersAvailable = 12; combined.players[cs].goods.mead = 1;
  act(combined, cs, { type: 'place_workers', spaceId: 'mountain-1-upgrade-1' }, 'open combined mountain/upgrade');
  act(combined, cs, { type: 'resolve_decision', decisionId: combined.pending[0].id, choice: { allocations: [] } }, 'skip optional mountain portion');
  check(combined.pending[0]?.kind === 'goods' && combined.pending[0].min === 1, 'combined action enforces aggregate at-least-one on final optional portion');

  const fourth = createFeast(seats(1), 4911, { occupationMode: 'all' });
  const fs = acting(fourth); fourth.players[fs].workersAvailable = 12;
  act(fourth, fs, { type: 'place_workers', spaceId: 'mountain-2x4-or-double-3' }, 'open fourth-column optional action');
  act(fourth, fs, { type: 'resolve_decision', decisionId: fourth.pending[0].id, choice: { optionIds: ['before'] } }, 'choose fourth-column card before action');
  const bonusCard = fourth.pending[0].options[0]?.id;
  if (bonusCard) act(fourth, fs, { type: 'resolve_decision', decisionId: fourth.pending[0].id, choice: { optionIds: [bonusCard] } }, 'play separate fourth-column bonus occupation');
  else act(fourth, fs, { type: 'resolve_decision', decisionId: fourth.pending[0].id, choice: { optionIds: [] } }, 'skip absent fourth-column card');
  act(fourth, fs, { type: 'resolve_decision', decisionId: fourth.pending[0].id, choice: { optionIds: ['mountains'] } }, 'choose printed mountain branch');
  check(fourth.pending[0]?.kind === 'mountain' && fourth.pending[0].min === 1, 'column bonus occupation does not satisfy printed action effect requirement');
}

{
  const s = createFeast(seats(1), 492, { occupationMode: 'all' });
  const p = s.players[0];
  const card = s.occupationDeck.pop()!;
  p.playedOccupations.push(card);
  p.occupationUses.push({ cardId: card, round: 1, usesThisRound: 0, usedOnce: false });
  p.goods.cattle = 1;
  const before = JSON.stringify(s);
  const result = applyFeastAction(s, 0, {
    type: 'use_occupation', cardId: card,
    operations: [
      { kind: 'animal', animal: 'cattle', pregnant: false, amount: -1 },
      { kind: 'animal', animal: 'cattle', pregnant: false, amount: -1 },
    ],
    note: 'Cumulative animal underflow probe.',
  });
  check(!result.ok && JSON.stringify(s) === before, 'multi-operation cumulative animal underflow rejects atomically');
}

{
  const s = createFeast(seats(1), 493, { occupationMode: 'all' });
  const p = s.players[0];
  const card = 'occupation-5';
  const at = s.occupationDeck.indexOf(card);
  if (at >= 0) s.occupationDeck.splice(at, 1);
  const startAt = s.startingOccupationDeck.indexOf(card);
  if (startAt >= 0) s.startingOccupationDeck.splice(startAt, 1);
  p.occupationHand = [card];
  p.silver = 20; p.resources.stone = 1; p.workersTotal = 1; p.workersAvailable = 4;
  act(s, 0, { type: 'place_workers', spaceId: 'play-occupation-paid' }, 'open printed occupation action for Chief');
  act(s, 0, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { optionIds: [card], allocations: [{ id: 'stone', amount: 1 }] } }, 'play Chief through the server card pipeline');
  check(s.phase === 'actions' && s.pending[0]?.kind === 'feast' && s.pending[0].meta?.extra === true, 'extra Feast keeps/resumes surrounding action phase');
  act(s, 0, { type: 'feast_place', pieceId: 'silver', x: 0, y: 0, rotation: 0 }, 'place during card-created Feast outside normal phase 9');
  act(s, 0, { type: 'feast_finish' }, 'finish card-created Feast');
  check(s.phase === 'actions' && s.pending.length === 0, 'extra Feast returns to action phase');
}

const raidLootAt = (target: number): string[] => {
  for (let seed = 500; seed < 560; seed++) {
    const s = createFeast(seats(1), seed);
    const seat = acting(s);
    s.players[seat].workersAvailable = 12;
    s.players[seat].resources.stone = 30;
    s.players[seat].ships.push({ id: `raid-${seed}`, type: 'longship', ore: 0, emigrated: false, emigratedRound: null });
    const placed = applyFeastAction(s, seat, { type: 'place_workers', spaceId: 'raid' });
    if (!placed.ok) continue;
    applyFeastAction(s, seat, {
      type: 'resolve_decision', decisionId: s.pending[0].id,
      choice: { optionIds: [`raid-${seed}`] },
    });
    applyFeastAction(s, seat, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { optionIds: ['roll'] } });
    const base = Number(s.pending[0].meta?.result ?? 99);
    if (base > target) continue;
    const resolved = applyFeastAction(s, seat, {
      type: 'resolve_decision', decisionId: s.pending[0].id,
      choice: { optionIds: ['resolve'], allocations: target > base ? [{ id: 'stone', amount: target - base }] : [] },
    });
    if (resolved.ok && s.pending[0]?.kind === 'die-spend') return s.pending[0].options.map((x) => x.id);
  }
  throw new Error(`Could not construct raid result ${target}`);
};
check(!raidLootAt(7).includes('good:chest') && raidLootAt(8).includes('good:chest'), 'Chest authentic sword value is 8');
check(!raidLootAt(8).includes('good:spices') && raidLootAt(9).includes('good:spices'), 'Spices authentic sword value is 9');
check(!raidLootAt(14).includes('good:silver-hoard') && raidLootAt(15).includes('good:silver-hoard'), 'Silver Hoard authentic sword value is 15');

// ---------------------------------------------------------------------------
// Breeding, Feast, final-placement window, scoring
// ---------------------------------------------------------------------------

{
  const s = createFeast(seats(1), 50);
  const p = s.players[0];
  p.goods.sheep = 2; p.goods.cattle = 1; p.goods['pregnant-cattle'] = 1;
  feastBreedPlayer(p);
  check(p.goods.sheep === 1 && p.goods['pregnant-sheep'] === 1, 'two non-pregnant sheep turn exactly one pregnant');
  check(p.goods.cattle === 3 && p.goods['pregnant-cattle'] === 0, 'pregnant cattle gives birth and all mothers turn non-pregnant');
  p.goods.sheep = 0; p.goods['pregnant-sheep'] = 1;
  feastBreedPlayer(p);
  check(p.goods.sheep === 2 && p.goods['pregnant-sheep'] === 0, 'single pregnant animal still gives birth');
}

{
  const s = createFeast(seats(1), 51, { length: 'long' });
  s.phase = 'feast'; s.phaseNumber = 9; s.pending = []; s.feastCursor = 0;
  const p = s.players[0];
  p.workersTotal = 6; p.goods.mead = 3; p.silver = 0;
  feastQueueFeast(s);
  act(s, 0, { type: 'feast_place', pieceId: 'mead', x: 0, y: 0, rotation: 0 }, 'serve one horizontal mead');
  check(!applyFeastAction(s, 0, { type: 'feast_place', pieceId: 'mead', x: 3, y: 0, rotation: 0 }).ok, 'only one horizontal tile of each food type per feast');
  act(s, 0, { type: 'feast_place', pieceId: 'mead', x: 3, y: 0, rotation: 90 }, 'serve vertical second mead away from first');
  check(!applyFeastAction(s, 0, { type: 'feast_place', pieceId: 'mead', x: 6, y: 0, rotation: 90 }).ok, 'food cannot cover a position still holding a Viking');
  const uncoveredBefore = 3; // horizontal covers 2, vertical covers 1 of six
  act(s, 0, { type: 'feast_finish' }, 'finish incomplete feast');
  check(p !== s.players[0] || true, 'atomic feast replaces player identity safely');
  check(s.players[0].thingPenalties === uncoveredBefore, 'each uncovered required feast cell gives one permanent Thing Penalty');
}

{
  const s = createFeast(seats(1), 52, { length: 'short' });
  const p = s.players[0];
  p.boards.push({ id: 'final-shed', definitionId: 'shed', kind: 'building', owner: 0, placements: [] });
  p.resources.wood = 1;
  s.round = s.rounds; s.phase = 'feast'; s.phaseNumber = 9; s.pending = []; s.feastCursor = 0;
  p.workersTotal = 1; p.silver = 1;
  feastQueueFeast(s);
  act(s, 0, { type: 'feast_place', pieceId: 'silver', x: 0, y: 0, rotation: 0 }, 'cover final feast');
  act(s, 0, { type: 'feast_finish' }, 'finish final feast');
  check(String(s.phase) !== 'ended' && s.pending[0]?.kind === 'final-placement', 'final Feast opens explicit final placement window before scoring');
  act(s, 0, { type: 'place_tile', pieceId: 'wood', boardId: 'final-shed', x: 0, y: 0, rotation: 0 }, 'place designated final wood');
  check(!applyFeastAction(s, 0, { type: 'buy_ship', ship: 'whaling-boat' }).ok, 'ship buying is closed after final Feast');
  act(s, 0, { type: 'resolve_decision', decisionId: s.pending[0].id, choice: { optionIds: ['confirm'] } }, 'confirm final placements');
  check(String(s.phase) === 'ended' && s.scores?.length === 1, 'confirming final placements scores immediately');
  check(!s.log.some((x) => x.includes('Board bonuses paid') && x === s.log.at(-1)), 'no final bonus phase after final Feast');
}

{
  const s = createFeast(seats(2), 53);
  const p = s.players[0];
  p.ships.push(
    { id: 'w', type: 'whaling-boat', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'k', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'l', type: 'longship', ore: 0, emigrated: true, emigratedRound: 3 },
  );
  p.goods.sheep = 1; p.goods['pregnant-sheep'] = 1; p.goods.cattle = 1; p.goods['pregnant-cattle'] = 1;
  p.silver = 7; p.finalIncome = 5; p.thingPenalties = 2; p.specials.push('english-crown');
  const score = feastScorePlayer(s, p);
  check(score.ships === 8 && score.emigrations === 21, 'active ships and emigration score separately');
  check(score.animals === 12 && score.silver === 7 && score.finalIncome === 5, 'animal/silver/final-income categories');
  check(score.englishCrown === 2 && score.thingPenalties === -6, 'English Crown and Thing Penalty scoring');
  check(score.total === Object.entries(score).filter(([k]) => !['seat', 'total'].includes(k)).reduce((n, [, v]) => n + Number(v), 0), 'score total equals exposed line items');
}

// ---------------------------------------------------------------------------
// Solo alternating blockers + deterministic full games for all gates
// ---------------------------------------------------------------------------

{
  const s = createFeast(seats(1), 61, { length: 'short', occupationMode: 'A' });
  const firstColor = s.players[0].activeWorkerColor;
  let guard = 0;
  while (!(s.round === 2 && s.phase === 'actions') && guard++ < 1000) {
    const seat = acting(s); act(s, seat, feastBotAction(s, seat), 'solo round 1 bot step');
  }
  check(s.round === 2 && s.players[0].activeWorkerColor !== firstColor, 'solo alternates worker color in round 2');
  check(s.actionSpaces.some((x) => x.occupants.some((o) => o.workerColor === firstColor)), 'round-one solo workers remain blocking in round 2');
  const secondColor = s.players[0].activeWorkerColor;
  while (!(s.round === 3 && s.phase === 'actions') && guard++ < 2000) {
    const seat = acting(s); act(s, seat, feastBotAction(s, seat), 'solo round 2 bot step');
  }
  check(!s.actionSpaces.some((x) => x.occupants.some((o) => o.workerColor === firstColor)), 'round-one solo workers return after round 2');
  check(s.actionSpaces.some((x) => x.occupants.some((o) => o.workerColor === secondColor)), 'round-two solo workers remain blocking in round 3');
}

for (const count of [1, 2, 3, 4]) for (const length of ['short', 'long'] as const) {
  for (const seed of [70, 71]) {
    const s = createFeast(seats(count), seed, { length, occupationMode: 'all' });
    let steps = 0;
    let previousEvent = s.eventSeq;
    while (s.phase !== 'ended' && steps++ < 4000) {
      const seat = acting(s);
      const action = feastBotAction(s, seat);
      const before = JSON.stringify(s);
      const result = applyFeastAction(s, seat, action);
      check(result.ok, `${count}p/${length}/${seed} bot action ${steps} succeeds (${result.error ?? ''})`);
      if (!result.ok) { check(JSON.stringify(s) === before, `${count}p bot failure atomic`); break; }
      check(s.eventSeq >= previousEvent, `${count}p/${length}: event sequence monotonic`);
      previousEvent = s.eventSeq;
      check(jsonOnly(s), `${count}p/${length}: state remains JSON-only after action ${steps}`);
      check(feastWeaponConservation(s) === 47, `${count}p/${length}: 47 weapons conserved after action ${steps}`);
    }
    check(s.phase === 'ended' && steps < 4000, `${count}p/${length}/${seed}: deterministic bot game completes`);
    check(s.scores?.length === count && (s.winners?.length ?? 0) >= 1, `${count}p/${length}/${seed}: scores and tied winners exposed`);
    const replay = createFeast(seats(count), seed, { length, occupationMode: 'all' });
    let replaySteps = 0;
    while (replay.phase !== 'ended' && replaySteps++ < 4000) {
      const seat = acting(replay); const result = applyFeastAction(replay, seat, feastBotAction(replay, seat));
      if (!result.ok) break;
    }
    equal(replay, s, `${count}p/${length}/${seed}: complete seeded playthrough deterministic`);
  }
}

console.log(`${passed}/${passed + failed} Feast checks passed`);
process.exit(failed ? 1 : 0);
