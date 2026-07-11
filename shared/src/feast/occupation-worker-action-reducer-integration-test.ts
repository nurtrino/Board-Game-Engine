/**
 * Public-reducer integration for the worker/action-space occupation slice:
 * 60, 76, 151, 153-156, 161-164, 166, and 168.
 *
 * Run: npx tsx shared/src/feast/occupation-worker-action-reducer-integration-test.ts
 */

import {
  FEAST_ACTION_BY_ID,
  FEAST_ACTION_SPACES,
  applyFeastAction,
  createFeast,
  feastAdvanceAutomaticWithOccupations,
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
  else { failed++; console.error(`FAIL: ${message}`); }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

function scenario(name: string, run: () => void): void {
  try { run(); }
  catch (error) {
    failed++;
    console.error(`FAIL: ${name} aborted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const COLORS: readonly FeastSeatColor[] = ['Red', 'Blue', 'Green', 'Purple'];

function fresh(cards: readonly number[] = [], players = 1, seed = 73): FeastState {
  const state = createFeast(
    COLORS.slice(0, players).map((color, seat) => ({ name: `Worker ${seat + 1}`, color })),
    seed, { length: 'long', occupationMode: 'all' },
  );
  state.phase = 'actions'; state.phaseNumber = 5; state.firstPlayer = 0; state.turn = 0;
  state.pending = []; state.occupationUsage = []; state.occupationReplacements = [];
  state.occupationActiveModifiers = []; state.workerPlacementHistory = [];
  for (const player of state.players) {
    player.passed = false; player.turnActionTaken = false; player.turnMayEnd = false;
    player.turnEffectUsed = false; player.turnActionId = null;
    player.turnSelectedShipIds = []; player.turnActionFacts = {};
    player.fourthOccupationAfter = false;
    player.occupationHand = []; player.playedOccupations = []; player.occupationUses = [];
    player.workersTotal = 12; player.workersAvailable = 12;
    player.workersByColor[player.activeWorkerColor] = 12;
    player.resources = { wood: 30, stone: 30, ore: 30 };
    player.silver = 0;
  }
  for (const space of state.actionSpaces) space.occupants = [];
  install(state, 0, ...cards);
  return state;
}

function install(state: FeastState, seat: number, ...cards: number[]): void {
  for (const number of cards) {
    const id = `occupation-${number}`;
    if (!state.players[seat].playedOccupations.includes(id)) state.players[seat].playedOccupations.push(id);
    if (!state.players[seat].occupationUses.some((entry) => entry.cardId === id)) {
      state.players[seat].occupationUses.push({ cardId: id, round: state.round, usesThisRound: 0, usedOnce: false });
    }
    state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
    state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  }
}

function putInHand(state: FeastState, seat: number, ...cards: number[]): void {
  for (const number of cards) {
    const id = `occupation-${number}`;
    if (!state.players[seat].occupationHand.includes(id)) state.players[seat].occupationHand.push(id);
    state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
    state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  }
}

function apply(state: FeastState, action: FeastAction, seat = 0): ReturnType<typeof applyFeastAction> {
  return applyFeastAction(state, seat, action);
}

function mustApply(state: FeastState, action: FeastAction, label: string, seat = 0): void {
  const result = apply(state, action, seat);
  check(result.ok, `${label}${result.ok ? '' : `: ${result.error}`}`);
  if (!result.ok) throw new Error(`${label}: ${result.error}`);
}

function rejectAtomic(state: FeastState, action: FeastAction, label: string, seat = 0): void {
  const snapshot = JSON.stringify(state);
  const result = apply(state, action, seat);
  check(!result.ok, `${label} is rejected`);
  equal(JSON.stringify(state), snapshot, `${label} rejection is atomic`);
}

function head(state: FeastState, kind?: FeastPendingDecision['kind']): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, `${kind ?? 'pending'} decision exists`);
  if (!decision) throw new Error(`Missing ${kind ?? 'pending'} decision`);
  if (kind) check(decision.kind === kind, `pending decision is ${kind}, got ${decision.kind}`);
  if (kind && decision.kind !== kind) throw new Error(`Expected ${kind}, got ${decision.kind}`);
  return decision;
}

function resolve(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice, label: string, seat = decision.seat,
): void {
  mustApply(state, { type: 'resolve_decision', decisionId: decision.id, choice }, label, seat);
}

function cardDecision(state: FeastState, number: number, requestKind?: string): FeastPendingDecision {
  const decision = head(state, 'card-effect');
  check(decision.meta?.cardId === `occupation-${number}`,
    `decision belongs to occupation ${number}, got ${String(decision.meta?.cardId)}`);
  if (requestKind) check(decision.meta?.requestKind === requestKind,
    `occupation ${number} request kind is ${requestKind}, got ${String(decision.meta?.requestKind)}`);
  return decision;
}

function addShip(state: FeastState, type: FeastShipType, id: string, ore = 0): void {
  state.players[0].ships.push({ id, type, ore, emigrated: false, emigratedRound: null });
}

function weaponCount(state: FeastState, seat = 0): number {
  return Object.values(state.players[seat].weapons).reduce((sum, amount) => sum + amount, 0);
}

function occupy(
  state: FeastState, actionSpaceId: string, workers: number, seat = 0,
  workerColor = state.players[seat].activeWorkerColor, copiedFrom: string | null = null,
): void {
  const space = state.actionSpaces.find((candidate) => candidate.id === actionSpaceId);
  if (!space) throw new Error(`Unknown action space ${actionSpaceId}`);
  space.occupants.push({ seat, workers, workerColor, copiedFrom });
}

function failDie(state: FeastState, label: string): void {
  let decision = head(state, 'die');
  if (decision.meta?.stage === 'boats') {
    const selected = decision.options.filter((option) => !option.disabled)
      .slice(0, Math.max(1, decision.min ?? 1)).map((option) => option.id);
    resolve(state, decision, { optionIds: selected }, `${label}: select physical ship(s)`);
    decision = head(state, 'die');
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const command = decision.meta?.stage === 'roll' ? 'roll' : 'reroll';
    resolve(state, decision, { optionIds: [command] }, `${label}: ${command}`);
    decision = head(state, 'die');
    const fail = decision.options.find((option) => option.id === 'fail' && !option.disabled);
    if (fail) {
      resolve(state, decision, { optionIds: ['fail'] }, `${label}: declare failure`);
      return;
    }
    check(decision.options.some((option) => option.id === 'reroll' && !option.disabled),
      `${label}: a forced zero result retains another roll`);
  }
  throw new Error(`${label}: could not obtain a legally failable roll`);
}

function succeedLowDie(state: FeastState, label: string): void {
  let decision = head(state, 'die');
  if (decision.meta?.stage === 'boats') {
    const selected = decision.options.filter((option) => !option.disabled)
      .slice(0, Math.max(1, decision.min ?? 1)).map((option) => option.id);
    resolve(state, decision, { optionIds: selected }, `${label}: select physical ship(s)`);
    decision = head(state, 'die');
  }
  resolve(state, decision, { optionIds: ['roll'] }, `${label}: roll`);
  decision = head(state, 'die');
  const result = Number(decision.meta?.result ?? 0);
  resolve(state, decision, {
    optionIds: ['resolve'], allocations: result ? [{ id: 'wood', amount: result }] : [],
  }, `${label}: pay ${result} Wood and succeed`);
}

function clearAndReturn(state: FeastState, actionSpaceId: string, seat = 0): void {
  const space = state.actionSpaces.find((candidate) => candidate.id === actionSpaceId)!;
  const returned = space.occupants.filter((occupant) => occupant.seat === seat)
    .reduce((sum, occupant) => sum + occupant.workers, 0);
  space.occupants = space.occupants.filter((occupant) => occupant.seat !== seat);
  state.players[seat].workersAvailable += returned;
}

scenario('151 and 168 observe exact worker-return batches and repeated Thing crossings', () => {
  const state = fresh([151, 168], 1, 73);
  const player = state.players[0];
  player.workersTotal = 4; player.workersAvailable = 4;
  player.workersByColor[player.activeWorkerColor] = 4;

  mustApply(state, { type: 'place_workers', spaceId: 'lay-snare' }, 'place two Vikings for a failed Snare');
  failDie(state, 'failed Snare');
  equal(state.players[0].workersAvailable, 3, 'one failed-Snare Viking returns to make exactly three in the Thing');
  equal(state.players[0].silver, 2, 'cards 151 and 168 each grant one silver for the one-worker return to three');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-151').length, 1,
    'card 151 records one use for the one-worker return batch');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-168').length, 1,
    'card 168 records the first transition into exactly three');

  mustApply(state, { type: 'end_turn' }, 'end failed-Snare turn');
  putInHand(state, 0, 60);
  mustApply(state, { type: 'place_workers', spaceId: 'play-occupations-2' }, 'start printed Inspector play');
  let decision = head(state, 'occupation');
  resolve(state, decision, { optionIds: ['occupation-60'] }, 'play Inspector');
  decision = cardDecision(state, 60, 'confirmation');
  resolve(state, decision, { accepted: true }, 'accept Inspector');
  decision = cardDecision(state, 60, 'choice');
  const twoWorkers = decision.options.find((option) => /two.worker/i.test(`${option.id} ${option.label}`));
  check(!!twoWorkers, 'Inspector exposes its exact two-worker branch');
  resolve(state, decision, { optionIds: [twoWorkers!.id] }, 'choose Inspector two-worker return');
  decision = cardDecision(state, 60, 'target');
  const resolvingSpace = decision.options.find((option) =>
    option.meta?.actionSpaceId === 'play-occupations-2' || /play.*occupation/i.test(option.label));
  check(!!resolvingSpace, 'Inspector can target the two Vikings on its resolving action space');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['forged-action-space'] },
  }, 'forged Inspector worker target');
  resolve(state, decision, { optionIds: [resolvingSpace!.id] }, 'return both resolving Vikings');

  equal(state.players[0].workersAvailable, 3, 'the two-worker occupation batch returns the Thing to exactly three');
  equal(state.players[0].silver, 3, 'Inspector pays round-one silver, then cards 151 and 168 each grant one');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-151').length, 2,
    'card 151 fires once per batch, not once per returned Viking');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-168').length, 2,
    'card 168 can fire again after the Thing moved away from and back to three');
});

scenario('151 rejects a single three-worker Homecomer batch', () => {
  const state = fresh([151], 1, 7603);
  const player = state.players[0];
  player.workersTotal = 8; player.workersAvailable = 2;
  player.workersByColor[player.activeWorkerColor] = 8;
  for (const id of ['weekly-livestock', 'master-crafting', 'whaling-minor']) occupy(state, id, 1);
  putInHand(state, 0, 76);
  mustApply(state, { type: 'place_workers', spaceId: 'play-occupations-2' }, 'start Homecomer play');
  resolve(state, head(state, 'occupation'), { optionIds: ['occupation-76'] }, 'play Homecomer');
  const confirm = cardDecision(state, 76, 'confirmation');
  resolve(state, confirm, { accepted: true }, 'accept Homecomer');

  equal(state.players[0].workersAvailable, 3, 'Homecomer returns one Viking from each of three fourth-column spaces');
  check(['weekly-livestock', 'master-crafting', 'whaling-minor'].every((id) =>
    !state.actionSpaces.find((space) => space.id === id)?.occupants.some((occupant) => occupant.seat === 0)),
  'all three deterministic fourth-column worker targets resolve');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-151').length, 0,
    'card 151 does not fire for an exact three-worker batch');
  equal(state.players[0].silver, 0, 'the suppressed three-worker batch grants no Thing Spokesman silver');
});

scenario('60 Inspector exposes and returns only the active solo Viking color', () => {
  const state = fresh([], 1, 60076);
  const player = state.players[0];
  const inactiveColor = player.workerColors.find((color) => color !== player.activeWorkerColor);
  check(!!inactiveColor, 'solo Inspector fixture has an inactive worker color');
  occupy(state, 'build-shed', 1, 0, inactiveColor!);
  occupy(state, 'produce-mead', 1, 0, player.activeWorkerColor);
  const waitingBefore = player.workersWaiting;
  putInHand(state, 0, 60);

  mustApply(state, { type: 'place_workers', spaceId: 'play-occupations-2' }, 'start mixed-color Inspector play');
  resolve(state, head(state, 'occupation'), { optionIds: ['occupation-60'] }, 'play mixed-color Inspector');
  resolve(state, cardDecision(state, 60, 'confirmation'), { accepted: true }, 'accept mixed-color Inspector');
  let decision = cardDecision(state, 60, 'choice');
  const oneWorker = decision.options.find((option) => /one.worker/i.test(`${option.id} ${option.label}`));
  check(!!oneWorker, 'mixed-color Inspector exposes its one-worker branch');
  resolve(state, decision, { optionIds: [oneWorker!.id] }, 'choose one active Inspector Viking');

  decision = cardDecision(state, 60, 'target');
  check(!decision.options.some((option) => /build shed/i.test(option.label)),
    'Inspector omits an action space occupied only by the inactive solo color');
  const activeTarget = decision.options.find((option) => /produce mead/i.test(option.label));
  check(!!activeTarget, 'Inspector lists an action space occupied by the active solo color');
  const activeAvailableBefore = state.players[0].workersAvailable;
  resolve(state, decision, { optionIds: [activeTarget!.id] }, 'return the active-color Inspector Viking');

  equal(state.actionSpaces.find((space) => space.id === 'build-shed')?.occupants
    .filter((occupant) => occupant.workerColor === inactiveColor).reduce((sum, occupant) => sum + occupant.workers, 0), 1,
  'Inspector leaves the inactive-color Viking on its action space');
  equal(state.players[0].workersAvailable, activeAvailableBefore + 1,
    'Inspector makes the returned active-color Viking immediately available');
  equal(state.players[0].workersWaiting, waitingBefore,
    'Inspector never moves an inactive Viking into the waiting pool');
});

scenario('76 Homecomer counts one active-color Viking per fourth-column space in solo play', () => {
  const state = fresh([], 1, 76060);
  const player = state.players[0];
  const inactiveColor = player.workerColors.find((color) => color !== player.activeWorkerColor);
  check(!!inactiveColor, 'solo Homecomer fixture has an inactive worker color');
  occupy(state, 'weekly-livestock', 1, 0, player.activeWorkerColor);
  occupy(state, 'master-crafting', 1, 0, inactiveColor!);
  occupy(state, 'whaling-minor', 1, 0, inactiveColor!);
  occupy(state, 'whaling-minor', 1, 0, player.activeWorkerColor);
  const waitingBefore = player.workersWaiting;
  putInHand(state, 0, 76);

  mustApply(state, { type: 'place_workers', spaceId: 'play-occupations-2' }, 'start mixed-color Homecomer play');
  resolve(state, head(state, 'occupation'), { optionIds: ['occupation-76'] }, 'play mixed-color Homecomer');
  const availableAfterPlay = state.players[0].workersAvailable;
  resolve(state, cardDecision(state, 76, 'confirmation'), { accepted: true }, 'accept mixed-color Homecomer');

  equal(state.players[0].workersAvailable, availableAfterPlay + 2,
    'Homecomer counts and returns exactly two active-color fourth-column Vikings');
  equal(state.players[0].workersWaiting, waitingBefore,
    'Homecomer never returns an inactive-color Viking to the waiting pool');
  equal(state.actionSpaces.find((space) => space.id === 'weekly-livestock')?.occupants.length, 0,
    'Homecomer clears the active-only fourth-column space');
  equal(state.actionSpaces.find((space) => space.id === 'master-crafting')?.occupants
    .filter((occupant) => occupant.workerColor === inactiveColor).reduce((sum, occupant) => sum + occupant.workers, 0), 1,
  'Homecomer leaves an inactive-only fourth-column space untouched');
  equal(state.actionSpaces.find((space) => space.id === 'whaling-minor')?.occupants
    .filter((occupant) => occupant.workerColor === inactiveColor).reduce((sum, occupant) => sum + occupant.workers, 0), 1,
  'Homecomer removes only the active Viking from a mixed-color fourth-column space');
});

scenario('151 does not treat the ordinary phase-12 return as a card event', () => {
  const state = fresh([151], 2, 15112);
  occupy(state, 'produce-mead', 2);
  state.phase = 'return_vikings'; state.phaseNumber = 12; state.round = state.rounds;
  feastAdvanceAutomaticWithOccupations(state);
  check(!state.actionSpaces.find((space) => space.id === 'produce-mead')?.occupants.length,
    'the ordinary return phase still clears the action board');
  equal(state.players[0].silver, 0, 'Thing Spokesman grants no silver for the ordinary phase return');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-151').length, 0,
    'the ordinary phase return consumes no Thing Spokesman event use');
});

scenario('168 also observes a placement from the Thing into exactly three', () => {
  const state = fresh([168], 1, 16803);
  const player = state.players[0];
  player.workersTotal = 5; player.workersAvailable = 5;
  player.workersByColor[player.activeWorkerColor] = 5;
  mustApply(state, { type: 'place_workers', spaceId: 'produce-mead' }, 'place two Vikings from five');
  equal(state.players[0].workersAvailable, 3, 'the outbound placement leaves exactly three Vikings in the Thing');
  equal(state.players[0].silver, 3, 'Earl of Lade silver is added to the two printed Mead-space silver');
});

scenario('153 exposes four rolls on every printed dice-action family', () => {
  const cases: readonly { spaceId: string; ship?: FeastShipType }[] = [
    { spaceId: 'hunt-game-1' }, { spaceId: 'lay-snare' },
    { spaceId: 'whaling-minor', ship: 'whaling-boat' },
    { spaceId: 'raid', ship: 'longship' }, { spaceId: 'pillage-2', ship: 'longship' },
  ];
  for (const [index, test] of cases.entries()) {
    const state = fresh([153], 1, 15300 + index);
    if (test.ship) addShip(state, test.ship, `${test.ship}-${index}`);
    mustApply(state, { type: 'place_workers', spaceId: test.spaceId }, `start ${test.spaceId}`);
    let decision = head(state, 'die');
    equal(decision.meta?.rollLimit, 4, `${test.spaceId} resolves the Proficient Hunter limit to four`);
    if (decision.meta?.stage === 'boats') {
      const count = Math.max(1, decision.min ?? 1);
      resolve(state, decision, { optionIds: decision.options.slice(0, count).map((option) => option.id) },
        `${test.spaceId}: choose physical ship(s)`);
      decision = head(state, 'die');
      equal(decision.meta?.rollLimit, 4, `${test.spaceId} preserves the limit after physical ship selection`);
    }
  }

  const state = fresh([153], 1, 15344);
  addShip(state, 'longship', 'four-roll-longship');
  mustApply(state, { type: 'place_workers', spaceId: 'raid' }, 'start four-roll Raiding proof');
  let decision = head(state, 'die');
  resolve(state, decision, { optionIds: ['four-roll-longship'] }, 'select raiding longship');
  decision = head(state, 'die');
  resolve(state, decision, { optionIds: ['roll'] }, 'first raid roll');
  for (let roll = 2; roll <= 3; roll++) {
    decision = head(state, 'die');
    check(decision.options.some((option) => option.id === 'reroll'), `raid offers roll ${roll}`);
    resolve(state, decision, { optionIds: ['reroll'] }, `raid roll ${roll}`);
  }
  decision = head(state, 'die');
  check(decision.options.some((option) => option.id === 'reroll'), 'a fourth roll remains after three unresolved rolls');
  check(decision.options.some((option) => option.id === 'fail'), 'Proficient Hunter still permits voluntary early failure');
  resolve(state, decision, { optionIds: ['reroll'] }, 'raid fourth roll');
  decision = head(state, 'die');
  check(!decision.options.some((option) => option.id === 'reroll'), 'the fourth roll is the hard maximum');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['reroll'] },
  }, 'forged fifth roll');
});

scenario('154-156 aggregate gross action-space mountain receipts once per action', () => {
  const state = fresh([154, 155, 156], 1, 154156);
  state.mountains = [
    { id: 'worker-batch-a', items: ['wood', 'wood', 'wood'] },
    { id: 'worker-batch-b', items: ['stone', 'stone'] },
  ];
  mustApply(state, { type: 'place_workers', spaceId: 'mountain-3-plus-2' }, 'start mixed five-item mountain action');
  resolve(state, head(state, 'mountain'), { allocations: [
    { id: 'worker-batch-a', amount: 3 }, { id: 'worker-batch-b', amount: 2 },
  ] }, 'take three Wood and two Stone as one Viking action');
  const cooper = cardDecision(state, 155, 'confirmation');
  resolve(state, cooper, { accepted: true }, 'exchange one received Wood with Cooper');

  equal(state.players[0].resources.wood, 32, 'Cooper spends exactly one of three received Wood');
  equal(state.players[0].resources.stone, 32, 'both received Stone remain');
  equal(state.players[0].goods.stockfish, 1, 'Cooper grants one Stockfish');
  equal(state.players[0].silver, 2, 'Woodcutter and Stone Crusher grant exactly one silver each');
  for (const card of [154, 155, 156]) equal(
    state.occupationUsage.filter((entry) => entry.cardId === `occupation-${card}`).length, 1,
    `card ${card} resolves at most once for the aggregated worker action`,
  );
});

scenario('154-155 include Wood per Player and reject stale Cooper payment atomically', () => {
  const state = fresh([154, 155], 2, 1541552);
  state.players[0].resources.wood = 0;
  mustApply(state, { type: 'place_workers', spaceId: 'wood-per-player' }, 'take Wood per Player in a two-player game');
  let cooper = cardDecision(state, 155, 'confirmation');
  equal(state.players[0].resources.wood, 2, 'Wood per Player grants one Wood for each of two players');
  equal(state.players[0].silver, 1, 'Woodcutter explicitly qualifies for the two-player Wood action');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: cooper.id, choice: { optionIds: ['forged-confirmation'] },
  }, 'forged Cooper confirmation');

  state.players[0].resources.wood = 0;
  cooper = state.pending[0];
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: cooper.id, choice: { accepted: true },
  }, 'stale Cooper exchange after Wood disappears');
  state.players[0].resources.wood = 2;
  resolve(state, state.pending[0], { accepted: true }, 'accept Cooper with restored authoritative Wood');
  equal(state.players[0].resources.wood, 1, 'Cooper consumes exactly one authoritative Wood');
  equal(state.players[0].goods.stockfish, 1, 'Cooper grants exactly one Stockfish');
});

scenario('154-156 exclude Bonus-phase resource production', () => {
  const state = fresh([154, 155, 156], 1, 15415610);
  state.players[0].resources.wood = 0; state.players[0].resources.stone = 0;
  state.phase = 'bonus'; state.phaseNumber = 10;
  state.automaticCheckpoint = 'bonus:rewards';
  state.automaticBonuses = [
    {
      seat: 0, boardId: 'serialized-bonus-home', boardKind: 'home',
      eventId: 'phase:1:bonus:wood-two', producerGoodCount: 0,
      reward: { kind: 'resource', id: 'wood', amount: 2 },
    },
    {
      seat: 0, boardId: 'serialized-bonus-home', boardKind: 'home',
      eventId: 'phase:1:bonus:stone-one', producerGoodCount: 0,
      reward: { kind: 'resource', id: 'stone', amount: 1 },
    },
  ];
  state.automaticBonusCursor = 0; state.automaticBonusOffered = false;
  state.automaticBonusStage = 'offer'; state.automaticBonusContexts = [];
  state.automaticBonusContextCursor = 0;
  feastAdvanceAutomaticWithOccupations(state);

  equal([state.players[0].resources.wood, state.players[0].resources.stone], [2, 1],
    'the serialized Bonus rewards resolve through the ordinary automatic reducer');
  check([154, 155, 156].every((card) =>
    !state.occupationUsage.some((entry) => entry.cardId === `occupation-${card}`)),
  'Woodcutter, Cooper, and Stone Crusher ignore Bonus-phase resource receipts');
  check(!state.pending.some((decision) => decision.meta?.cardId === 'occupation-155'),
    'Bonus Wood never opens a Cooper exchange');
});

scenario('161-162 count actual current solo-color occupants at Bonus', () => {
  const state = fresh([161, 162], 1, 161162);
  const player = state.players[0];
  const inactive = player.workerColors.find((color) => color !== player.activeWorkerColor)!;
  const third = FEAST_ACTION_SPACES.filter((space) => space.column === 3).slice(0, 3);
  const second = FEAST_ACTION_SPACES.filter((space) => space.column === 2).slice(0, 3);
  occupy(state, third[0].id, 3, 0, player.activeWorkerColor);
  occupy(state, third[1].id, 4, 0, player.activeWorkerColor);
  occupy(state, third[2].id, 5, 0, inactive);
  occupy(state, second[0].id, 2, 0, player.activeWorkerColor);
  occupy(state, second[1].id, 4, 0, player.activeWorkerColor);
  occupy(state, second[2].id, 4, 0, inactive);
  const cabbageBefore = player.goods.cabbage;
  const flaxBefore = player.goods.flax;
  state.round = state.rounds;
  state.phase = 'bonus'; state.phaseNumber = 10; state.automaticCheckpoint = null;
  feastAdvanceAutomaticWithOccupations(state);

  equal(state.players[0].goods.cabbage, cabbageBefore + 1,
    'Whaling Assistant counts seven actual active-color Vikings in column three');
  equal(state.players[0].goods.flax, flaxBefore,
    'Flax Farmer ignores stale inactive solo-color occupants above an active count of six');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-161').length, 1,
    'Whaling Assistant grants once in the Bonus phase');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-162').length, 0,
    'Flax Farmer does not use its once-per-round limit below seven active Vikings');

  const seven = fresh([162], 1, 16207);
  const sevenPlayer = seven.players[0];
  const columnTwo = FEAST_ACTION_SPACES.filter((space) => space.column === 2).slice(0, 2);
  occupy(seven, columnTwo[0].id, 2, 0, sevenPlayer.activeWorkerColor);
  occupy(seven, columnTwo[1].id, 5, 0, sevenPlayer.activeWorkerColor);
  const before = sevenPlayer.goods.flax;
  seven.round = seven.rounds;
  seven.phase = 'bonus'; seven.phaseNumber = 10; seven.automaticCheckpoint = null;
  feastAdvanceAutomaticWithOccupations(seven);
  equal(seven.players[0].goods.flax, before + 1, 'Flax Farmer triggers at the exact current-occupant threshold of seven');

  const owned = fresh([161], 2, 16102);
  const ownedThird = FEAST_ACTION_SPACES.filter((space) => space.column === 3).slice(0, 3);
  occupy(owned, ownedThird[0].id, 3, 0);
  occupy(owned, ownedThird[1].id, 3, 0);
  occupy(owned, ownedThird[2].id, 4, 1);
  const ownedBefore = owned.players[0].goods.cabbage;
  owned.round = owned.rounds;
  owned.phase = 'bonus'; owned.phaseNumber = 10; owned.automaticCheckpoint = null;
  feastAdvanceAutomaticWithOccupations(owned);
  equal(owned.players[0].goods.cabbage, ownedBefore,
    'Whaling Assistant does not combine another player\'s column-three Vikings with its owner\'s six');
  equal(owned.occupationUsage.filter((entry) => entry.cardId === 'occupation-161').length, 0,
    'another player\'s occupants consume no Whaling Assistant use');
});

scenario('163 binds to successful direct use of the exact two-worker Hunting space', () => {
  const state = fresh([163], 1, 16302);
  state.players[0].goods.hide = 0;
  mustApply(state, { type: 'place_workers', spaceId: 'hunt-game-2' }, 'start direct second-column Hunting');
  succeedLowDie(state, 'direct second-column Hunting');
  equal(state.players[0].goods.hide, 2, 'Farmhand adds one Hide to the normal successful Hunting Hide');
  equal(state.players[0].silver, 1, 'Farmhand adds exactly one silver');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-163').length, 1,
    'Farmhand resolves once for the exact successful action');

  const firstColumn = fresh([163], 1, 16301);
  firstColumn.players[0].goods.hide = 0;
  mustApply(firstColumn, { type: 'place_workers', spaceId: 'hunt-game-1' }, 'start first-column Hunting');
  succeedLowDie(firstColumn, 'first-column Hunting');
  equal(firstColumn.players[0].goods.hide, 1, 'first-column Hunting receives only its normal Hide');
  equal(firstColumn.players[0].silver, 0, 'Farmhand rejects the one-worker Hunting space');

  const failure = fresh([163], 1, 16399);
  failure.players[0].goods.hide = 0;
  mustApply(failure, { type: 'place_workers', spaceId: 'hunt-game-2' }, 'start failed second-column Hunting');
  failDie(failure, 'failed second-column Hunting');
  equal(failure.players[0].goods.hide, 0, 'Farmhand grants no Hide on failure');
  equal(failure.players[0].silver, 0, 'Farmhand grants no silver on failure');
});

scenario('163 excludes copied four-player Hunting', () => {
  const state = fresh([163], 4, 16304);
  state.imitationColumns = [2, 4];
  occupy(state, 'hunt-game-2', 2, 1, state.players[1].activeWorkerColor);
  state.players[0].goods.hide = 0;
  mustApply(state, { type: 'place_workers', spaceId: 'hunt-game-2', imitateSpaceId: 'hunt-game-2' },
    'imitate opponent second-column Hunting');
  succeedLowDie(state, 'imitated Hunting');
  equal(state.players[0].goods.hide, 1, 'imitated Hunting receives only its normal Hide');
  equal(state.players[0].silver, 0, 'Farmhand does not treat the imitation slot as the printed Hunting space');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-163').length, 0,
    'copied Hunting consumes no Farmhand use');
});

scenario('164 resolves before commit, restricts the mountain arrow end, and rejects stale choices', () => {
  const state = fresh([164], 1, 16404);
  state.mountains = [{ id: 'armed-fighter-strip', items: ['stone', 'ore'] }];
  const workersBefore = state.players[0].workersAvailable;
  mustApply(state, { type: 'place_workers', spaceId: 'master-crafting' }, 'propose direct four-worker placement');
  let decision = cardDecision(state, 164, 'confirmation');
  equal(state.players[0].workersAvailable, workersBefore,
    'Armed Fighter window occurs before the four Vikings commit');
  check(!state.actionSpaces.find((space) => space.id === 'master-crafting')?.occupants.length,
    'the fourth-column action space is still empty during the before-placement window');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['forged-confirmation'] },
  }, 'forged Armed Fighter confirmation');
  resolve(state, decision, { accepted: true }, 'accept Armed Fighter');

  decision = head(state, 'mountain');
  check(decision.options.some((option) => option.id === 'armed-fighter-strip'),
    'the server offers the legal Stone arrow end');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: decision.id,
    choice: { allocations: [{ id: 'armed-fighter-strip', amount: 2 }] },
  }, 'forged two-item Armed Fighter allocation');
  state.mountains[0].items[0] = 'wood';
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: decision.id,
    choice: { allocations: [{ id: 'armed-fighter-strip', amount: 1 }] },
  }, 'stale Armed Fighter target after its arrow end becomes Wood');
  state.mountains[0].items[0] = 'stone';
  resolve(state, state.pending[0], { allocations: [{ id: 'armed-fighter-strip', amount: 1 }] },
    'take exactly one Stone with Armed Fighter');

  equal(state.players[0].resources.stone, 31, 'Armed Fighter takes exactly the legal Stone arrow-end item');
  equal(state.players[0].workersAvailable, workersBefore - 4,
    'the original four Vikings commit only after the occupation action resolves');
  equal(state.actionSpaces.find((space) => space.id === 'master-crafting')?.occupants[0]?.workers, 4,
    'the resolving fourth-column space receives all four committed Vikings');
  if (state.pending[0]?.kind === 'goods') resolve(state, state.pending[0], { optionIds: [] }, 'skip Master Crafting conversions');
});

scenario('164 excludes the four-player imitation slot', () => {
  const state = fresh([164], 4, 16444);
  state.imitationColumns = [2, 4];
  occupy(state, 'master-crafting', 4, 1, state.players[1].activeWorkerColor);
  const stone = state.players[0].resources.stone;
  mustApply(state, { type: 'place_workers', spaceId: 'master-crafting', imitateSpaceId: 'master-crafting' },
    'imitate occupied fourth-column Master Crafting');
  check(state.pending[0]?.meta?.cardId !== 'occupation-164', 'imitation opens no Armed Fighter opportunity');
  equal(state.players[0].resources.stone, stone, 'imitation grants no Armed Fighter mountain item');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-164').length, 0,
    'imitation consumes no Armed Fighter use');
});

scenario('166 tracks committed qualifying placements instead of surviving occupancy', () => {
  const state = fresh([166], 1, 16602);
  const beforeWeapons = weaponCount(state);
  mustApply(state, { type: 'place_workers', spaceId: 'produce-mead' }, 'first direct second-column placement');
  equal(weaponCount(state), beforeWeapons, 'the first qualifying placement grants no weapon');
  equal(state.workerPlacementHistory.length, 1, 'the first committed placement has durable reducer provenance');
  clearAndReturn(state, 'produce-mead');
  mustApply(state, { type: 'end_turn' }, 'end first second-column turn');

  mustApply(state, { type: 'place_workers', spaceId: 'weekly-flax-stockfish' },
    'second direct second-column placement after the first Vikings returned');
  let decision = cardDecision(state, 166, 'confirmation');
  equal(state.actionSpaces.find((space) => space.id === 'weekly-flax-stockfish')?.occupants.length, 0,
    'Weapons Warden resolves before the later Vikings commit');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['forged-confirmation'] },
  }, 'forged Weapons Warden confirmation');
  decision = state.pending[0];
  resolve(state, decision, { accepted: true }, 'draw on the later qualifying placement');
  equal(weaponCount(state), beforeWeapons + 1, 'the later qualifying placement draws exactly one weapon');
  equal(state.workerPlacementHistory.length, 2, 'both committed placements remain distinguished after worker return');
  equal(state.occupationUsage.filter((entry) => entry.cardId === 'occupation-166').length, 1,
    'Weapons Warden records only the accepted later draw, not its suppressed first opportunity');
});

scenario('166 starts counting only while played and excludes failed/copied placements', () => {
  const afterPlay = fresh([], 1, 16620);
  const weapons = weaponCount(afterPlay);
  mustApply(afterPlay, { type: 'place_workers', spaceId: 'produce-mead' }, 'place in column two before Weapons Warden is played');
  clearAndReturn(afterPlay, 'produce-mead');
  mustApply(afterPlay, { type: 'end_turn' }, 'end pre-card placement turn');
  install(afterPlay, 0, 166);
  mustApply(afterPlay, { type: 'place_workers', spaceId: 'weekly-flax-stockfish' },
    'make first qualifying placement after Weapons Warden enters play');
  equal(weaponCount(afterPlay), weapons, 'a pre-card placement does not consume the no-weapon first occurrence');
  check(afterPlay.pending.length === 0, 'first post-play qualifying placement opens no draw prompt');

  const failed = fresh([166], 2, 16621);
  occupy(failed, 'produce-mead', 2, 1, failed.players[1].activeWorkerColor);
  const snapshot = JSON.stringify(failed);
  const rejected = apply(failed, { type: 'place_workers', spaceId: 'produce-mead' });
  check(!rejected.ok, 'an occupied direct placement is rejected before any Weapons Warden opportunity');
  equal(JSON.stringify(failed), snapshot, 'failed placement leaves history and card state atomic');
  equal(failed.workerPlacementHistory.length, 0, 'failed placement creates no committed history record');

  const copied = fresh([166], 4, 16624);
  copied.imitationColumns = [2, 4];
  occupy(copied, 'produce-mead', 2, 1, copied.players[1].activeWorkerColor);
  const copiedWeapons = weaponCount(copied);
  mustApply(copied, { type: 'place_workers', spaceId: 'produce-mead', imitateSpaceId: 'produce-mead' },
    'copy a second-column action in four-player imitation');
  equal(weaponCount(copied), copiedWeapons, 'copied placement grants no Weapons Warden draw');
  equal(copied.workerPlacementHistory[0]?.imitate, true, 'copied placement is durably classified as imitation');
  equal(copied.occupationUsage.filter((entry) => entry.cardId === 'occupation-166').length, 0,
    'copied placement consumes no Weapons Warden use');
});

scenario('worker-placement history is bounded to the current Actions phase', () => {
  const state = fresh([166], 1, 16630);
  mustApply(state, { type: 'place_workers', spaceId: 'produce-mead' }, 'record current-round qualifying placement');
  check(state.workerPlacementHistory.length === 1, 'current Actions phase records committed placement');
  state.round++;
  clearAndReturn(state, 'produce-mead');
  mustApply(state, { type: 'end_turn' }, 'start synthetic next-round worker turn');
  const before = weaponCount(state);
  mustApply(state, { type: 'place_workers', spaceId: 'weekly-flax-stockfish' }, 'first placement in new round');
  equal(weaponCount(state), before, 'prior-round history cannot unlock a Weapons Warden draw');
  check(state.pending.length === 0, 'prior-round history creates no stale prompt');
});

check(FEAST_ACTION_BY_ID['hunt-game-2']?.column === 2 && FEAST_ACTION_BY_ID['master-crafting']?.workers === 4,
  'focused fixtures remain bound to authentic printed action-space definitions');

console.log(`${passed}/${passed + failed} worker/action-space occupation reducer checks passed`);
if (failed) process.exitCode = 1;
