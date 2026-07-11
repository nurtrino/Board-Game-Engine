/**
 * Blocking reducer-integration audit for the classic occupation event surface.
 *
 * This suite deliberately does not call the occupation planner or executor
 * directly. Every row installs one already-played occupation, drives an
 * ordinary reducer action or automatic phase transition, and observes the
 * public game state/decision that the real path must produce.
 *
 * Run:
 *   npx tsx shared/src/feast/occupation-event-integration-audit-test.ts
 */

import {
  FEAST_BOARD_BY_ID, FEAST_OCCUPATION_BY_ID,
  applyFeastAction, createFeast, feastAdvanceAutomaticWithOccupations, feastOccupationRule, feastPlacementError, feastScorePlayer,
  type FeastAction, type FeastBoardState, type FeastDecisionChoice,
  type FeastOccupationHook, type FeastPlacement, type FeastSeatColor,
  type FeastShip, type FeastState,
} from './index.js';
import { feastQueueFeast } from './state.js';

type AuditResult = { ok: true } | { ok: false; detail: string };

interface AuditRow {
  hook: FeastOccupationHook;
  card: number;
  drive: string;
  expected: string;
  run: () => void;
}

const COLORS: readonly FeastSeatColor[] = ['Red', 'Blue', 'Green', 'Purple'];

function fresh(card: number, players = 1, seed = 73): FeastState {
  const state = createFeast(
    COLORS.slice(0, players).map((color, seat) => ({ name: `Player ${seat + 1}`, color })),
    seed,
    { length: 'short', occupationMode: 'all' },
  );
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.firstPlayer = 0;
  state.turn = 0;
  state.pending = [];
  state.occupationUsage = [];
  for (const player of state.players) {
    player.passed = false;
    player.turnActionTaken = false;
    player.turnMayEnd = false;
    player.turnEffectUsed = false;
    player.fourthOccupationAfter = false;
    player.occupationHand = [];
    player.playedOccupations = [];
    player.occupationUses = [];
  }
  const id = `occupation-${card}`;
  const player = state.players[0];
  player.playedOccupations.push(id);
  player.occupationUses.push({ cardId: id, round: state.round, usesThisRound: 0, usedOnce: false });
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  return state;
}

function fail(message: string): never {
  throw new Error(message);
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function act(state: FeastState, action: FeastAction, seat = 0): void {
  const result = applyFeastAction(state, seat, action);
  if (!result.ok) fail(`${action.type} failed: ${result.error ?? 'unknown reducer error'}`);
}

function resolve(state: FeastState, choice: FeastDecisionChoice, seat = 0): void {
  const decision = state.pending[0];
  if (!decision) fail('Expected a pending reducer decision');
  act(state, { type: 'resolve_decision', decisionId: decision.id, choice }, seat);
}

function hasCardDecision(state: FeastState, card: number): boolean {
  const expected = `occupation-${card}`;
  return state.pending.some((decision) => decision.kind === 'card-effect' && decision.meta?.cardId === expected);
}

function ship(id: string, type: FeastShip['type']): FeastShip {
  return { id, type, ore: 0, emigrated: false, emigratedRound: null };
}

function occupy(state: FeastState, actionSpaceId: string, workers: number): void {
  const space = state.actionSpaces.find((candidate) => candidate.id === actionSpaceId);
  if (!space) fail(`Unknown action space ${actionSpaceId}`);
  space.occupants.push({
    seat: 0, workers, workerColor: state.players[0].activeWorkerColor, copiedFrom: null,
  });
}

function rollAndFail(state: FeastState): void {
  expect(state.pending[0]?.kind === 'die', 'Expected the real die decision after worker placement');
  if (state.pending[0]?.meta?.stage === 'boats') {
    const ship = state.pending[0].options.find((option) => !option.disabled);
    expect(!!ship, 'Expected an eligible physical ship for the die action');
    resolve(state, { optionIds: [ship!.id] });
    expect(state.pending[0]?.kind === 'die', 'Expected the roll decision after choosing the physical ship');
  }
  resolve(state, { optionIds: ['roll'] });
  expect(state.pending[0]?.kind === 'die', 'Expected the die spend/failure decision after rolling');
  resolve(state, { optionIds: ['fail'] });
}

function firstLegalPlacement(
  state: FeastState, boardId: string, pieceId: string,
): { x: number; y: number; rotation: 0 | 90 | 180 | 270 } {
  const board = state.players[0].boards.find((candidate) => candidate.id === boardId);
  const definition = board && FEAST_BOARD_BY_ID[board.definitionId];
  if (!board || !definition) fail(`Missing test board ${boardId}`);
  for (const rotation of [0, 90, 180, 270] as const) {
    for (let y = 0; y < definition.rows; y++) for (let x = 0; x < definition.cols; x++) {
      if (feastPlacementError(state, 0, boardId, pieceId, x, y, rotation) === null) return { x, y, rotation };
    }
  }
  return fail(`No legal ${pieceId} placement exists on ${definition.id}`);
}

function surroundedStoneHouse(): FeastBoardState {
  const definition = FEAST_BOARD_BY_ID['stone-house'];
  const bonus = definition.bonuses[0]?.cell;
  if (!bonus) fail('Stone house has no extracted bonus cell');
  const covered = definition.layout.flatMap((row, y) => [...row].flatMap((cell, x) =>
    cell === '#' && (x !== bonus.x || y !== bonus.y) ? [{ x, y }] : [],
  ));
  const placement: FeastPlacement = {
    id: 'audit-surrounding-tiles', pieceKind: 'silver', pieceId: 'silver', color: 'silver',
    x: 0, y: 0, rotation: 0, mask: ['#'], covered,
  };
  return {
    id: 'audit-stone-house', definitionId: 'stone-house', kind: 'building', owner: 0,
    placements: [placement],
  };
}

const rows: AuditRow[] = [
  {
    hook: 'action-proposed', card: 1,
    drive: 'Place 2 Vikings on Buy Cattle and Milk with only 2 silver.',
    expected: 'Peddler discounts the printed 3-silver livestock cost to 2.',
    run: () => {
      const state = fresh(1);
      state.players[0].silver = 2;
      act(state, { type: 'place_workers', spaceId: 'buy-cattle-milk' });
      expect(state.players[0].silver === 0 && state.players[0].goods.cattle === 1,
        'Peddler did not modify the real livestock action cost');
    },
  },
  {
    hook: 'action-started', card: 149,
    drive: 'Start the printed Overseas Trading action with a knarr and 1 silver.',
    expected: 'Priest grants 1 oil immediately before the printed action.',
    run: () => {
      const state = fresh(149);
      state.players[0].silver = 1;
      state.players[0].ships.push(ship('audit-knarr', 'knarr'));
      act(state, { type: 'place_workers', spaceId: 'overseas-trade-1' });
      expect(state.players[0].goods.oil === 1, 'Priest did not fire on the real action-started path');
    },
  },
  {
    hook: 'action-resolved', card: 3,
    drive: 'Resolve Beans and Silver, one of the printed 1-silver Viking spaces.',
    expected: 'Furrier searches out and grants 1 snare after the action.',
    run: () => {
      const state = fresh(3);
      const before = state.players[0].weapons.snare;
      state.weaponDiscard.unshift('snare');
      act(state, { type: 'place_workers', spaceId: 'weekly-beans' });
      expect(state.players[0].weapons.snare === before + 1,
        'Furrier did not fire after the real printed action resolved');
    },
  },
  {
    hook: 'die-rolled', card: 4,
    drive: 'Roll the Hunting Game die in two seed-identical states.',
    expected: 'Hunter reduces the physical roll by exactly 1, to a floor of 0.',
    run: () => {
      const modified = fresh(4, 1, 401);
      const baseline = fresh(3, 1, 401);
      for (const state of [modified, baseline]) {
        act(state, { type: 'place_workers', spaceId: 'hunt-game-1' });
        resolve(state, { optionIds: ['roll'] });
      }
      const actual = Number(modified.pending[0]?.meta?.rolled);
      const physical = Number(baseline.pending[0]?.meta?.rolled);
      expect(Number.isFinite(actual) && Number.isFinite(physical), 'The real die decision did not retain its rolled value');
      expect(actual === Math.max(0, physical - 1),
        `Hunter produced ${actual} from the seed-identical physical roll ${physical}`);
    },
  },
  {
    hook: 'die-resolved', card: 134,
    drive: 'Roll once for Raiding and deliberately declare failure.',
    expected: 'Drunkard grants 1 consolatory mead after the failed die action.',
    run: () => {
      const state = fresh(134);
      state.players[0].ships.push(ship('audit-longship', 'longship'));
      const before = state.players[0].goods.mead;
      act(state, { type: 'place_workers', spaceId: 'raid' });
      rollAndFail(state);
      expect(state.players[0].goods.mead === before + 1,
        'Drunkard did not fire after the real failed Raiding resolution');
    },
  },
  {
    hook: 'phase-started', card: 8,
    drive: 'Enter Income with 6 Vikings currently on Crafting spaces.',
    expected: 'Craft Leader grants 1 oil immediately before Income.',
    run: () => {
      const state = fresh(8);
      occupy(state, 'craft-linen', 1);
      occupy(state, 'craft-clothing', 2);
      occupy(state, 'craft-runes-and-chests', 3);
      state.phase = 'income';
      state.phaseNumber = 7;
      feastAdvanceAutomaticWithOccupations(state);
      expect(state.players[0].goods.oil === 1,
        'Craft Leader did not fire when the real Income transition started');
    },
  },
  {
    hook: 'phase-resolved', card: 7,
    drive: 'Finish a real Feast while retaining exactly 1 grain.',
    expected: 'Miller grants 1 silver immediately after Feast.',
    run: () => {
      const state = fresh(7);
      state.players[0].goods.grain = 1;
      state.phase = 'feast';
      state.phaseNumber = 9;
      state.feastCursor = 0;
      state.pending = [];
      feastQueueFeast(state);
      act(state, { type: 'feast_finish' });
      expect(state.players[0].silver === 1,
        'Miller did not fire after the real Feast completion');
    },
  },
  {
    hook: 'good-received', card: 28,
    drive: 'Craft a chest by paying wood through the printed choice.',
    expected: 'Locksmith opens a card-effect choice to buy oil for 1 silver.',
    run: () => {
      const state = fresh(28);
      state.players[0].resources.wood = 1;
      state.players[0].silver = 1;
      act(state, { type: 'place_workers', spaceId: 'craft-chest' });
      resolve(state, { optionIds: ['wood'] });
      expect(hasCardDecision(state, 28),
        'Locksmith did not queue a server-authored choice after the real chest gain');
    },
  },
  {
    hook: 'resource-received', card: 154,
    drive: 'In a 2-player game, resolve Wood per Player and 1 Ore.',
    expected: 'Woodcutter grants 1 silver for the batch of 2 wood.',
    run: () => {
      const state = fresh(154, 2);
      act(state, { type: 'place_workers', spaceId: 'wood-per-player' });
      expect(state.players[0].resources.wood === 2 && state.players[0].silver === 1,
        'Woodcutter did not fire for the real 2-wood Viking-action batch');
    },
  },
  {
    hook: 'ship-acquired', card: 117,
    drive: 'Build a knarr with the printed 2-wood ship-building action.',
    expected: 'Shipowner opens its optional one-good upgrade card effect.',
    run: () => {
      const state = fresh(117);
      state.players[0].resources.wood = 2;
      state.players[0].goods.peas = 1;
      act(state, { type: 'place_workers', spaceId: 'build-knarr' });
      expect(hasCardDecision(state, 117),
        'Shipowner did not queue after the real knarr acquisition');
    },
  },
  {
    hook: 'house-built', card: 15,
    drive: 'Build a stone house with the printed house-building action.',
    expected: 'Cottager grants 1 hide after the new house enters the estate.',
    run: () => {
      const state = fresh(15);
      state.players[0].resources.stone = 1;
      act(state, { type: 'place_workers', spaceId: 'build-stone-house' });
      expect(state.players[0].goods.hide === 1,
        'Cottager did not fire after the real stone-house build');
    },
  },
  {
    hook: 'animal-entered-stable', card: 174,
    drive: 'Buy cattle and milk from the printed Livestock Market space.',
    expected: 'Bosporus Traveller opens the spices/silk purchase choice.',
    run: () => {
      const state = fresh(174);
      state.players[0].silver = 7;
      act(state, { type: 'place_workers', spaceId: 'buy-cattle-milk' });
      expect(hasCardDecision(state, 174),
        'Bosporus Traveller did not queue after cattle entered the real stable');
    },
  },
  {
    hook: 'occupation-received', card: 99,
    drive: 'Use Draw an Occupation while another occupation is in hand.',
    expected: 'Preceptor offers its play-instead-of-receive replacement.',
    run: () => {
      const state = fresh(99);
      state.players[0].occupationHand = ['occupation-1'];
      expect(state.occupationDeck.length > 0, 'Occupation deck unexpectedly empty');
      act(state, { type: 'place_workers', spaceId: 'draw-occupation' });
      expect(hasCardDecision(state, 99),
        'Preceptor did not queue on the real occupation draw path');
    },
  },
  {
    hook: 'tile-placed', card: 98,
    drive: 'Place grain legally in an owned stone house.',
    expected: 'Nobleman opens the optional 2-silver silk purchase.',
    run: () => {
      const state = fresh(98);
      const board: FeastBoardState = {
        id: 'audit-stone-house', definitionId: 'stone-house', kind: 'building', owner: 0, placements: [],
      };
      state.players[0].boards.push(board);
      state.players[0].goods.grain = 1;
      state.players[0].silver = 2;
      const placement = firstLegalPlacement(state, board.id, 'grain');
      act(state, { type: 'place_tile', pieceId: 'grain', boardId: board.id, ...placement });
      expect(hasCardDecision(state, 98),
        'Nobleman did not queue after the real house-tile placement');
    },
  },
  {
    hook: 'workers-placed', card: 164,
    drive: 'Place 4 Vikings on the fourth-column Master Crafting space.',
    expected: 'Armed Fighter opens its pre-action stone/ore mountain choice.',
    run: () => {
      const state = fresh(164);
      act(state, { type: 'place_workers', spaceId: 'master-crafting' });
      expect(hasCardDecision(state, 164),
        'Armed Fighter did not queue on the real fourth-column placement path');
    },
  },
  {
    hook: 'workers-returned', card: 151,
    drive: 'Fail Laying a Snare so exactly 1 placed Viking returns.',
    expected: 'Thing Spokesman grants 1 silver for the returned Viking.',
    run: () => {
      const state = fresh(151);
      act(state, { type: 'place_workers', spaceId: 'lay-snare' });
      rollAndFail(state);
      expect(state.players[0].silver === 1,
        'Thing Spokesman did not fire after the real Viking return');
    },
  },
  {
    hook: 'thing-count-changed', card: 168,
    drive: 'Fail Laying a Snare with 2 Vikings in the Thing so the return makes exactly 3.',
    expected: 'Earl of Lade grants 1 silver when the Thing reaches 3 Vikings.',
    run: () => {
      const state = fresh(168);
      const player = state.players[0];
      player.workersTotal = 4;
      player.workersAvailable = 4;
      player.workersByColor[player.activeWorkerColor] = 4;
      act(state, { type: 'place_workers', spaceId: 'lay-snare' });
      rollAndFail(state);
      expect(state.players[0].workersAvailable === 3, 'The real failed snare did not return one Viking to make 3');
      expect(state.players[0].silver === 1,
        'Earl of Lade did not fire when the real Thing count became exactly 3');
    },
  },
  {
    hook: 'mountain-item-taken', card: 6,
    drive: 'Take 1 stone from the arrow end through a printed mountain action.',
    expected: 'Stone Carver grants 1 silver with the taken stone.',
    run: () => {
      const state = fresh(6);
      state.mountains = [{ id: 'audit-mountain', items: ['stone'] }];
      act(state, { type: 'place_workers', spaceId: 'mountain-2' });
      resolve(state, { allocations: [{ id: 'audit-mountain', amount: 1 }] });
      expect(state.players[0].resources.stone === 1 && state.players[0].silver === 1,
        'Stone Carver did not fire on the real mountain-take decision');
    },
  },
  {
    hook: 'mountain-item-removed', card: 173,
    drive: 'Enter Mountain Strips with ore at the arrow end of a strip.',
    expected: 'Punchcutter grants 1 silver when phase 11 removes that ore.',
    run: () => {
      const state = fresh(173);
      state.phase = 'mountains';
      state.phaseNumber = 11;
      state.pending = [];
      state.mountains = [{ id: 'audit-mountain', items: ['ore'] }];
      state.mountainDeck = [];
      feastAdvanceAutomaticWithOccupations(state);
      expect(state.players[0].silver === 1,
        'Punchcutter did not fire during the real Mountain Strips transition');
    },
  },
  {
    hook: 'bonus-produced', card: 177,
    drive: 'Resolve Bonus with exactly 1 earned good on a stone house.',
    expected: 'Maid intercepts the house batch and offers/replaces it with silverware.',
    run: () => {
      const state = fresh(177);
      state.players[0].boards.push(surroundedStoneHouse());
      state.phase = 'bonus';
      state.phaseNumber = 10;
      state.pending = [];
      feastAdvanceAutomaticWithOccupations(state);
      const replaced = state.players[0].goods.silverware === 1 && state.players[0].goods.hide === 0;
      expect(replaced || hasCardDecision(state, 177),
        'Maid neither intercepted nor replaced the real one-good house bonus');
    },
  },
  {
    hook: 'state-changed', card: 178,
    drive: 'Build a fourth large ship while two small-ship berths remain open.',
    expected: 'Boat Builder crosses its threshold and grants 2 whaling boats once.',
    run: () => {
      const state = fresh(178);
      state.players[0].ships.push(
        ship('audit-knarr-1', 'knarr'), ship('audit-knarr-2', 'knarr'), ship('audit-longship-1', 'longship'),
      );
      state.players[0].resources.wood = 2;
      act(state, { type: 'place_workers', spaceId: 'build-knarr' });
      const whalers = state.players[0].ships.filter((candidate) => candidate.type === 'whaling-boat' && !candidate.emigrated).length;
      expect(whalers === 2,
        `Boat Builder crossed four large ships but produced ${whalers} whaling boats`);
    },
  },
  {
    hook: 'scoring', card: 189,
    drive: 'Score an estate containing exactly 2 exploration boards.',
    expected: 'Seafarer contributes 4 silver through the real score breakdown.',
    run: () => {
      const state = fresh(189);
      state.players[0].boards.push(
        { id: 'audit-shetland', definitionId: 'shetland', kind: 'exploration', owner: 0, placements: [] },
        { id: 'audit-iceland', definitionId: 'iceland', kind: 'exploration', owner: 0, placements: [] },
      );
      const score = feastScorePlayer(state, state.players[0]);
      expect(score.silver === 4,
        `Seafarer contributed ${score.silver} silver instead of 4 through real scoring`);
    },
  },
];

function audit(row: AuditRow): AuditResult {
  const rule = FEAST_OCCUPATION_BY_ID[`occupation-${row.card}`];
  if (!rule) return { ok: false, detail: `Missing extracted occupation ${row.card}` };
  const executable = feastOccupationRule(`occupation-${row.card}`);
  if (!executable?.clauses.some((clause) => clause.triggers.some((trigger) => trigger.hook === row.hook))) {
    return { ok: false, detail: `Occupation ${row.card} is not registered for ${row.hook}` };
  }
  try {
    row.run();
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

const results = rows.map((row) => ({ row, result: audit(row) }));
console.table(results.map(({ row, result }) => ({
  hook: row.hook,
  card: `${row.card} ${FEAST_OCCUPATION_BY_ID[`occupation-${row.card}`]?.name ?? 'UNKNOWN'}`,
  status: result.ok ? 'IMPLEMENTED' : 'MISSING',
  drive: row.drive,
})));

for (const { row, result } of results) {
  if (!result.ok) console.error(`MISSING ${row.hook} / occupation-${row.card}: ${result.detail}\n  Expected: ${row.expected}`);
}

const implemented = results.filter(({ result }) => result.ok).length;
const missing = results.length - implemented;
console.log(`${implemented}/${results.length} representative reducer occupation hooks implemented; ${missing} missing.`);
if (missing > 0) process.exitCode = 1;
