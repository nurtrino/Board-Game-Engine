/**
 * Public-reducer integration coverage for phase-sensitive occupations.
 *
 * The expected timing and restrictions are taken from the staged classic
 * occupation appendix in games/feast/golden/occupations.json. Every gameplay
 * transition below enters through the public reducer (automatic phase
 * advancement is the same helper used by the reducer after a continuation).
 *
 * Run: npx tsx shared/src/feast/occupation-phase-scheduler-reducer-integration-test.ts
 */

import {
  FEAST_OCCUPATION_BY_ID,
  applyFeastAction,
  createFeast,
  feastAdvanceAutomaticWithOccupations,
  feastDecodeOccupationPlacementTarget,
  feastMakePlacement,
  type FeastAction,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastSeatColor,
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

const COLORS: readonly FeastSeatColor[] = ['Red', 'Blue', 'Green', 'Purple'];

function fresh(seed: number, playerCount = 1): FeastState {
  const state = createFeast(
    Array.from({ length: playerCount }, (_, seat) => ({
      name: `Phase Tester ${seat + 1}`, color: COLORS[seat],
    })),
    seed,
    { occupationMode: 'all' },
  );
  state.pending = [];
  state.automaticCheckpoint = null;
  state.automaticSeatCursor = 0;
  state.feastCursor = 0;
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

function cardId(number: number): string {
  return `occupation-${number}`;
}

function markPlayed(state: FeastState, seat: number, number: number): void {
  const id = cardId(number);
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
  state.players[seat].playedOccupations.push(id);
  state.players[seat].occupationUses.push({
    cardId: id, round: state.round, usesThisRound: 0, usedOnce: false,
  });
}

function apply(state: FeastState, seat: number, action: FeastAction) {
  return applyFeastAction(state, seat, action);
}

function mustApply(state: FeastState, seat: number, action: FeastAction, message: string): void {
  const result = apply(state, seat, action);
  check(result.ok, `${message}${result.ok ? '' : ` (${result.error})`}`);
  if (!result.ok) throw new Error(`${message}: ${result.error}`);
}

function rejectAtomic(
  state: FeastState, seat: number, action: FeastAction, message: string,
): void {
  const before = JSON.stringify(state);
  const result = apply(state, seat, action);
  check(!result.ok, `${message}: reducer rejects`);
  equal(JSON.stringify(state), before, `${message}: rejection is atomic`);
}

function head(state: FeastState, kind?: FeastPendingDecision['kind']): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, `pending ${kind ?? 'decision'} exists`);
  if (!decision) throw new Error(`Missing pending ${kind ?? 'decision'}`);
  if (kind) {
    check(decision.kind === kind, `pending decision is ${kind} (got ${decision.kind})`);
    if (decision.kind !== kind) throw new Error(`Expected ${kind}, got ${decision.kind}`);
  }
  return decision;
}

function cardDecision(
  state: FeastState, number: number, requestKind?: string,
): FeastPendingDecision {
  const decision = head(state, 'card-effect');
  check(decision.meta?.cardId === cardId(number), `card ${number} owns the pending decision`);
  if (requestKind) {
    check(decision.meta?.requestKind === requestKind,
      `card ${number} request is ${requestKind} (got ${String(decision.meta?.requestKind)})`);
  }
  return decision;
}

function resolve(
  state: FeastState, seat: number, decision: FeastPendingDecision,
  choice: FeastDecisionChoice, message: string,
): void {
  mustApply(state, seat, {
    type: 'resolve_decision', decisionId: decision.id, choice,
  }, message);
}

function optionMatching(decision: FeastPendingDecision, pattern: RegExp): string {
  const option = decision.options.find((candidate) =>
    pattern.test(`${candidate.id} ${candidate.label} ${candidate.detail ?? ''}`));
  check(!!option, `${decision.label} offers ${pattern}`);
  if (!option) throw new Error(`${decision.label} lacks ${pattern}`);
  check(!option.disabled, `${option.label} is enabled`);
  return option.id;
}

function occupationEventId(decision: FeastPendingDecision): string {
  const continuation = decision.continuation;
  check(continuation.kind === 'occupation-event', 'card decision retains an occupation event continuation');
  if (continuation.kind !== 'occupation-event') throw new Error('Missing occupation event continuation');
  return continuation.context.eventId ?? '';
}

scenario('staged classic appendix remains the source contract', () => {
  check(/instead of drawing a weapon card/i.test(FEAST_OCCUPATION_BY_ID['occupation-38'].clarification),
    'Peacemaker appendix text describes a replacement');
  check(/without placing any more Vikings/i.test(FEAST_OCCUPATION_BY_ID['occupation-91'].clarification),
    'Latecomer appendix text forbids worker placement');
  check(/use for the feast right away/i.test(FEAST_OCCUPATION_BY_ID['occupation-160'].clarification),
    'Sober Man appendix text makes the silver immediately spendable');
  check(/any or all of the stockfish/i.test(FEAST_OCCUPATION_BY_ID['occupation-172'].clarification),
    'Fish Cook appendix text permits partial and full movement');
  check(/at any time \(but only once\)/i.test(FEAST_OCCUPATION_BY_ID['occupation-182'].clarification),
    'Herb Gardener appendix text defines its stable once-only activation');
});

function prepareCard9Income(seed: number): { state: FeastState; homeId: string; explorationId: string } {
  const state = fresh(seed);
  state.phase = 'income';
  state.phaseNumber = 7;
  markPlayed(state, 0, 9);
  state.players[0].ships.push(
    { id: 'card-9-longship-a', type: 'longship', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'card-9-longship-b', type: 'longship', ore: 0, emigrated: false, emigratedRound: null },
  );
  const homeId = state.players[0].boards.find((board) => board.kind === 'home')!.id;
  const explorationId = 'card-9-iceland';
  state.players[0].boards.push({
    id: explorationId, definitionId: 'iceland', kind: 'exploration', owner: 0, placements: [],
  });
  feastAdvanceAutomaticWithOccupations(state);
  return { state, homeId, explorationId };
}

scenario('9 splits its per-longship Ore across owned home and exploration boards', () => {
  const { state, homeId, explorationId } = prepareCard9Income(90001);
  const destinations = cardDecision(state, 9, 'target');
  equal(destinations.min, 1, 'card 9 requires at least one owned destination board');
  equal(destinations.max, 2, 'two longships let card 9 select up to two distinct destination boards');
  const home = optionMatching(destinations, /player-0-home|home long/i);
  const exploration = optionMatching(destinations, /card-9-iceland|iceland/i);
  resolve(state, 0, destinations, { optionIds: [home, exploration] },
    'select both owned boards for card 9');

  const placements = head(state, 'card-effect');
  check(placements.meta?.mode === 'occupation-deferred' && placements.meta?.intentKind === 'placement',
    'card 9 exposes a server-owned direct-placement intent');
  const homePlacement = placements.options.find((option) =>
    feastDecodeOccupationPlacementTarget(option.id)?.boardId === homeId);
  const explorationPlacement = placements.options.find((option) =>
    feastDecodeOccupationPlacementTarget(option.id)?.boardId === explorationId);
  check(!!homePlacement && !!explorationPlacement,
    'card 9 offers exact legal Ore cells on both selected boards');
  resolve(state, 0, placements, { optionIds: [homePlacement!.id, explorationPlacement!.id] },
    'place one gained Ore on each selected board');

  equal(state.players[0].boards.find((board) => board.id === homeId)?.placements
    .filter((placement) => placement.pieceId === 'ore').length, 1,
  'one card 9 Ore is committed to the home board');
  equal(state.players[0].boards.find((board) => board.id === explorationId)?.placements
    .filter((placement) => placement.pieceId === 'ore').length, 1,
  'one card 9 Ore is committed to the exploration board');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(9)).length, 1,
    'card 9 consumes one round use for the complete per-longship placement');
});

scenario('9 may place multiple per-longship Ore pieces on the same owned board', () => {
  const { state, homeId } = prepareCard9Income(90002);
  const destinations = cardDecision(state, 9, 'target');
  const home = optionMatching(destinations, /player-0-home|home long/i);
  resolve(state, 0, destinations, { optionIds: [home] }, 'select only the home board for both card 9 Ore');

  const placements = head(state, 'card-effect');
  const homeOptions = placements.options.map((option) => ({
    option, decoded: feastDecodeOccupationPlacementTarget(option.id),
  })).filter((entry) => entry.decoded?.boardId === homeId);
  let pair: readonly [string, string] | null = null;
  for (let left = 0; left < homeOptions.length && !pair; left++) for (let right = left + 1; right < homeOptions.length; right++) {
    const a = homeOptions[left].decoded!;
    const b = homeOptions[right].decoded!;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) {
      pair = [homeOptions[left].option.id, homeOptions[right].option.id];
      break;
    }
  }
  check(!!pair, 'card 9 offers two non-touching legal Ore cells on the home board');
  resolve(state, 0, placements, { optionIds: [...pair!] }, 'place both gained Ore on the same home board');
  equal(state.players[0].boards.find((board) => board.id === homeId)?.placements
    .filter((placement) => placement.pieceId === 'ore').length, 2,
  'both per-longship Ore pieces commit to the selected home board');
});

scenario('38 accepted replacement is offered to its exact player and suppresses only that draw', () => {
  const state = fresh(38001, 2);
  state.phase = 'weapon';
  state.phaseNumber = 4;
  state.firstPlayer = 1;
  state.weaponDeck = ['bow'];
  markPlayed(state, 1, 38);
  const beforeWeapons = state.players.map((player) => ({ ...player.weapons }));

  feastAdvanceAutomaticWithOccupations(state);
  let decision = cardDecision(state, 38, 'confirmation');
  equal(decision.seat, 1, 'Peacemaker is offered to its owner in first-player order');
  equal(occupationEventId(decision), `phase:${state.round}:weapon:phase-started:instead:1`,
    'Peacemaker replacement is tied to the owner phase event');
  rejectAtomic(state, 1, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['forged'] },
  }, 'forged Peacemaker confirmation');
  resolve(state, 1, decision, { accepted: true }, 'accept Peacemaker');

  decision = cardDecision(state, 38, 'choice');
  rejectAtomic(state, 1, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['forged-resource'] },
  }, 'forged Peacemaker resource');
  const stone = optionMatching(decision, /stone/i);
  resolve(state, 1, decision, { optionIds: [stone] }, 'take Stone instead of a weapon');

  equal(state.phase, 'actions', 'weapon phase resumes into Actions');
  equal(state.players[1].resources.stone, 1, 'Peacemaker owner gains exactly one Stone');
  equal(state.players[1].weapons, beforeWeapons[1], 'Peacemaker owner draws no weapon');
  equal(state.players[0].weapons.bow, beforeWeapons[0].bow + 1, 'other player still draws the controlled weapon');
  equal(state.weaponDeck.length, 0, 'only the unreplaced weapon draw consumes the deck');
  equal(state.occupationReplacements.filter((entry) => entry.cardId === cardId(38)).length, 1,
    'one exact weapon-draw replacement is recorded');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(38)).length, 1,
    'accepted Peacemaker consumes one round use');
  rejectAtomic(state, 1, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: [stone] },
  }, 'stale Peacemaker resource choice');
});

scenario('38 decline occurs on the later owner event and preserves both normal draws', () => {
  const state = fresh(38002, 2);
  state.phase = 'weapon';
  state.phaseNumber = 4;
  state.firstPlayer = 1;
  state.weaponDeck = ['bow', 'snare'];
  markPlayed(state, 0, 38);
  const beforeWeapons = state.players.map((player) => ({ ...player.weapons }));

  feastAdvanceAutomaticWithOccupations(state);
  const decision = cardDecision(state, 38, 'confirmation');
  equal(decision.seat, 0, 'scheduler skips the first player and offers the later Peacemaker owner');
  equal(occupationEventId(decision), `phase:${state.round}:weapon:phase-started:instead:0`,
    'later Peacemaker offer has the owner-specific event id');
  resolve(state, 0, decision, { accepted: false }, 'decline Peacemaker');

  equal(state.phase, 'actions', 'declined Peacemaker resumes the automatic scheduler');
  equal(state.players[0].weapons.snare, beforeWeapons[0].snare + 1, 'declining owner receives the first normal draw');
  equal(state.players[1].weapons.bow, beforeWeapons[1].bow + 1, 'other player receives the second normal draw');
  equal(state.occupationReplacements.filter((entry) => entry.cardId === cardId(38)).length, 0,
    'decline records no weapon replacement');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(38)).length, 0,
    'decline does not consume the round use');
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { accepted: true },
  }, 'stale declined Peacemaker confirmation');
});

scenario('91 resolves in first-player order and performs a full adjacent action without Vikings', () => {
  const state = fresh(91001, 2);
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.firstPlayer = 1;
  state.turn = 0;
  markPlayed(state, 0, 91);
  for (const player of state.players) {
    player.passed = true;
    player.turnActionTaken = true;
    player.turnMayEnd = true;
    player.silver = 5;
  }
  state.actionSpaces.find((space) => space.id === 'produce-milk')!.occupants = [{
    seat: 0, workers: 1, workerColor: state.players[0].activeWorkerColor, copiedFrom: null,
  }];
  const occupantsBefore = structuredClone(state.actionSpaces.map((space) => ({
    id: space.id, occupants: space.occupants,
  })));
  const beansBefore = state.players[0].goods.beans;
  const silverBefore = state.players[0].silver;

  mustApply(state, 0, { type: 'end_turn' }, 'finish the Actions phase');
  let decision = cardDecision(state, 91, 'confirmation');
  equal(decision.seat, 0, 'Latecomer is offered to its owner after the first-player seat is checked');
  equal(occupationEventId(decision), `phase:${state.round}:actions:after:1`,
    'Latecomer event index reflects first-player order');
  resolve(state, 0, decision, { accepted: true }, 'accept Latecomer and pay one Silver');

  decision = cardDecision(state, 91);
  check(decision.meta?.grantAction === 'action-space', 'Latecomer exposes a server-authored action-space choice');
  check(decision.options.every((option) => option.id !== 'produce-milk'),
    'the occupied source action is not offered');
  const weekly = optionMatching(decision, /weekly-beans|beans and silver/i);
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['forged-space'] },
  }, 'forged Latecomer action space');
  resolve(state, 0, decision, { optionIds: [weekly] }, 'resolve the adjacent Weekly Market action');

  equal(state.players[0].goods.beans, beansBefore + 1, 'Latecomer resolves the complete printed Beans reward');
  equal(state.players[0].silver, silverBefore, 'one Silver payment and one printed Silver reward net to zero');
  equal(state.actionSpaces.map((space) => ({ id: space.id, occupants: space.occupants })), occupantsBefore,
    'Latecomer places and removes no Vikings anywhere');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(91)).length, 1,
    'Latecomer consumes one use for the round');
  check(state.phase !== 'actions', 'scheduler advances only after the extra action fully resolves');
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: [weekly] },
  }, 'stale Latecomer action-space choice');
});

scenario('160 commitment grants spendable Feast silver, rejects Mead, and resets after Feast', () => {
  const state = fresh(160001);
  state.phase = 'feast';
  state.phaseNumber = 9;
  state.players[0].silver = 0;
  markPlayed(state, 0, 160);

  feastAdvanceAutomaticWithOccupations(state);
  const decision = cardDecision(state, 160, 'confirmation');
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['forged'] },
  }, 'forged Sober Man commitment');
  resolve(state, 0, decision, { accepted: true }, 'commit to no Mead with Sober Man');

  equal(state.players[0].silver, 1, 'Sober Man grants one Silver before Feast placement');
  check(state.players[0].feastNoMeadCommitted, 'the no-Mead commitment is retained during the Feast');
  check(head(state, 'feast').seat === 0, 'ordinary Banquet Table placement follows the commitment');
  mustApply(state, 0, {
    type: 'feast_place', pieceId: 'silver', x: 0, y: 0, rotation: 0,
  }, 'spend Sober Man Silver immediately on the Banquet Table');
  equal(state.players[0].silver, 0, 'the granted Silver is physically spent during this Feast');
  rejectAtomic(state, 0, {
    type: 'feast_place', pieceId: 'mead', x: 2, y: 0, rotation: 0,
  }, 'Mead after accepting Sober Man');
  mustApply(state, 0, { type: 'feast_finish' }, 'finish the committed Feast');

  check(!state.players[0].feastNoMeadCommitted, 'Sober Man commitment resets after Feast resolution');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(160)).length, 1,
    'accepted Sober Man records exactly one round use');
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { accepted: false },
  }, 'stale Sober Man commitment');
});

scenario('160 decline preserves the ordinary Mead Feast option', () => {
  const state = fresh(160002);
  state.phase = 'feast';
  state.phaseNumber = 9;
  state.players[0].silver = 0;
  markPlayed(state, 0, 160);

  feastAdvanceAutomaticWithOccupations(state);
  const decision = cardDecision(state, 160, 'confirmation');
  resolve(state, 0, decision, { accepted: false }, 'decline Sober Man');
  check(!state.players[0].feastNoMeadCommitted, 'decline creates no no-Mead commitment');
  equal(state.players[0].silver, 0, 'decline grants no Silver');
  mustApply(state, 0, {
    type: 'feast_place', pieceId: 'mead', x: 0, y: 0, rotation: 0,
  }, 'serve Mead after declining Sober Man');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(160)).length, 0,
    'decline does not consume Sober Man');
});

scenario('186 passively opens the second horizontal Peas slot without a phase prompt', () => {
  const state = fresh(186001);
  state.phase = 'feast';
  state.phaseNumber = 9;
  markPlayed(state, 0, 186);
  state.players[0].goods.peas = 4;

  feastAdvanceAutomaticWithOccupations(state);

  check(head(state, 'feast').seat === 0,
    'Pea Flour Baker proceeds directly to the ordinary Feast decision');
  check(!state.pending.some((decision) => decision.kind === 'card-effect'
    && decision.meta?.cardId === cardId(186)),
  'Pea Flour Baker never asks for a redundant optional activation');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(186)).length, 0,
    'the passive placement permission needs no activation usage record');
  mustApply(state, 0, {
    type: 'feast_place', pieceId: 'peas', x: 0, y: 0, rotation: 0,
  }, 'place first horizontal Peas through the passive rule');
  mustApply(state, 0, {
    type: 'feast_place', pieceId: 'peas', x: 3, y: 0, rotation: 0,
  }, 'place second horizontal Peas through the passive rule');
});

scenario('157 receives the reducer Feast phase on each physical animal placement', () => {
  const state = fresh(157001);
  state.phase = 'feast';
  state.phaseNumber = 9;
  markPlayed(state, 0, 157);
  state.players[0].goods.sheep = 1;
  state.players[0].goods['skin-and-bones'] = 0;

  feastAdvanceAutomaticWithOccupations(state);
  check(head(state, 'feast').seat === 0, 'Feast placement window opens for card 157');
  mustApply(state, 0, {
    type: 'feast_place', pieceId: 'sheep', x: 0, y: 0, rotation: 0,
  }, 'serve a physical Sheep tile with card 157');

  equal(state.players[0].goods['skin-and-bones'], 1,
    'card 157 grants exactly one Skin and Bones for the Feast animal placement');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(157)).length, 1,
    'card 157 records the physical placement as one event');
  check(head(state, 'feast').seat === 0, 'the Banquet Table decision resumes after card 157');
});

scenario('158 receives the reducer Feast phase on each physical meat placement', () => {
  const state = fresh(158001);
  state.phase = 'feast';
  state.phaseNumber = 9;
  markPlayed(state, 0, 158);
  state.players[0].goods['game-meat'] = 1;
  state.players[0].silver = 0;
  const weaponsBefore = Object.values(state.players[0].weapons).reduce((sum, count) => sum + count, 0);

  feastAdvanceAutomaticWithOccupations(state);
  mustApply(state, 0, {
    type: 'feast_place', pieceId: 'game-meat', x: 0, y: 0, rotation: 0,
  }, 'serve a physical Game Meat tile with card 158');

  const weaponsAfter = Object.values(state.players[0].weapons).reduce((sum, count) => sum + count, 0);
  equal(weaponsAfter, weaponsBefore + 3, 'card 158 draws exactly three physical/replacement weapons');
  equal(state.players[0].silver, 1, 'card 158 grants exactly one Silver');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(158)).length, 1,
    'card 158 records the physical placement as one event');
  check(head(state, 'feast').seat === 0, 'the Banquet Table decision resumes after card 158');
});

scenario('173 rewards every phase-11 Ore and 2-Silver removal as a distinct event', () => {
  const state = fresh(173001);
  state.phase = 'mountains';
  state.phaseNumber = 11;
  state.players[0].silver = 0;
  markPlayed(state, 0, 173);
  state.mountains = [
    { id: 'punch-ore-a', items: ['ore'] },
    { id: 'punch-ore-b', items: ['ore'] },
    { id: 'punch-silver-a', items: ['silver-2'] },
    { id: 'punch-silver-b', items: ['silver-2'] },
  ];
  state.mountainDeck = [];

  feastAdvanceAutomaticWithOccupations(state);

  equal(state.players[0].silver, 6,
    'card 173 grants 1+1 Silver for two Ore and 2+2 Silver for two 2-Silver removals');
  const uses = state.occupationUsage.filter((entry) => entry.cardId === cardId(173));
  equal(uses.length, 4, 'card 173 records one mandatory use per removed physical item');
  equal(new Set(uses.map((entry) => entry.eventId)).size, 4,
    'each removed physical item has distinct stable event provenance');
});

function prepareFishCook(state: FeastState, stockfish: number): void {
  state.phase = 'feast';
  state.phaseNumber = 9;
  state.automaticCheckpoint = null;
  state.automaticSeatCursor = 0;
  state.feastCursor = 0;
  markPlayed(state, 0, 172);
  state.players[0].boards.push({
    id: 'fish-cook-house', definitionId: 'stone-house', kind: 'building', owner: 0, placements: [],
  });
  state.players[0].boards.push({
    id: 'fish-cook-shed', definitionId: 'shed', kind: 'building', owner: 0, placements: [],
  });
  state.players[0].goods.stockfish = stockfish;
  feastAdvanceAutomaticWithOccupations(state);
  mustApply(state, 0, {
    type: 'feast_place', pieceId: 'stockfish', x: 0, y: 0, rotation: 0,
  }, 'serve the first physical Stockfish');
  if (stockfish > 1) mustApply(state, 0, {
    type: 'feast_place', pieceId: 'stockfish', x: 4, y: 0, rotation: 90,
  }, 'serve the second physical Stockfish');
  mustApply(state, 0, { type: 'feast_finish' }, 'finish the Feast with Stockfish on the table');
}

function acceptFishCookAndChooseHouse(state: FeastState): FeastPendingDecision {
  let decision = cardDecision(state, 172, 'confirmation');
  resolve(state, 0, decision, { accepted: true }, 'accept Fish Cook');
  decision = cardDecision(state, 172, 'target');
  check(decision.options.every((option) => !/shed|home/i.test(`${option.id} ${option.label} ${option.detail ?? ''}`)),
    'Fish Cook offers neither sheds nor the home board');
  const house = optionMatching(decision, /fish-cook-house|stone house/i);
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['fish-cook-shed'] },
  }, 'forged Fish Cook shed target');
  resolve(state, 0, decision, { optionIds: [house] }, 'choose the owned Stone House');
  return cardDecision(state, 172);
}

scenario('172 moves a selected subset and returns the unselected Feast tile to supply', () => {
  const state = fresh(172001);
  prepareFishCook(state, 2);
  const placementDecision = acceptFishCookAndChooseHouse(state);
  equal(placementDecision.min, 1, 'Fish Cook requires at least one placement after acceptance');
  equal(placementDecision.max, 2, 'Fish Cook allows up to every served Stockfish');
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: placementDecision.id, choice: { optionIds: ['forged-placement'] },
  }, 'forged Fish Cook placement');
  resolve(state, 0, placementDecision, { optionIds: [placementDecision.options[0].id] },
    'move only one of two Stockfish');

  const house = state.players[0].boards.find((board) => board.id === 'fish-cook-house')!;
  equal(house.placements.filter((placement) => placement.pieceId === 'stockfish').length, 1,
    'exactly the selected Stockfish moves into the house');
  equal(state.players[0].feastPlacements.length, 0,
    'remaining Banquet tiles return to supply after the post-Feast window');
  equal(state.players[0].goods.stockfish, 0,
    'moving a served Stockfish neither duplicates nor refunds inventory');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(172)).length, 1,
    'partial Fish Cook movement consumes one round use');
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: placementDecision.id,
    choice: { optionIds: [placementDecision.options[0].id] },
  }, 'stale Fish Cook placement');
});

function nonTouchingPlacementPair(decision: FeastPendingDecision): [string, string] {
  for (let left = 0; left < decision.options.length; left++) {
    const a = feastDecodeOccupationPlacementTarget(decision.options[left].id);
    if (!a) continue;
    const aCells = feastMakePlacement('fish-a', 'stockfish', a.x, a.y, a.rotation).covered;
    for (let right = left + 1; right < decision.options.length; right++) {
      const b = feastDecodeOccupationPlacementTarget(decision.options[right].id);
      if (!b) continue;
      const bCells = feastMakePlacement('fish-b', 'stockfish', b.x, b.y, b.rotation).covered;
      const overlap = aCells.some((first) => bCells.some((second) =>
        first.x === second.x && first.y === second.y));
      const orthogonallyTouching = aCells.some((first) => bCells.some((second) =>
        Math.abs(first.x - second.x) + Math.abs(first.y - second.y) === 1));
      if (!overlap && !orthogonallyTouching) {
        return [decision.options[left].id, decision.options[right].id];
      }
    }
  }
  throw new Error('No legal non-touching Stockfish placement pair was offered');
}

scenario('172 moves every served Stockfish through one atomic legal packing', () => {
  const state = fresh(172002);
  prepareFishCook(state, 2);
  const placementDecision = acceptFishCookAndChooseHouse(state);
  const pair = nonTouchingPlacementPair(placementDecision);
  resolve(state, 0, placementDecision, { optionIds: pair }, 'move both served Stockfish');

  const house = state.players[0].boards.find((board) => board.id === 'fish-cook-house')!;
  equal(house.placements.filter((placement) => placement.pieceId === 'stockfish').length, 2,
    'all selected Stockfish move into legal house cells');
  equal(new Set(house.placements.flatMap((placement) =>
    placement.covered.map((cell) => `${cell.x},${cell.y}`))).size, 6,
  'the two physical 3-cell tiles do not overlap');
  equal(state.players[0].feastPlacements.length, 0, 'Banquet Table is cleared after full movement');
});

scenario('182 triggers at the second house, can be deferred to a stable anytime window, then latches', () => {
  const state = fresh(182001);
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  markPlayed(state, 0, 182);
  const player = state.players[0];
  player.workersAvailable = Math.max(player.workersAvailable, 2);
  player.resources.stone = 1;
  player.resources.wood = 5;
  player.boards.push({
    id: 'herb-first-house', definitionId: 'stone-house', kind: 'building', owner: 0, placements: [],
  });

  rejectAtomic(state, 0, {
    type: 'activate_occupation', cardId: cardId(182),
  }, 'Herb Gardener before the two-house threshold');
  mustApply(state, 0, { type: 'place_workers', spaceId: 'build-stone-house' },
    'build the second qualifying house');
  let decision = cardDecision(state, 182, 'confirmation');
  check(decision.continuation.kind === 'occupation-event'
    && decision.continuation.context.hook === 'state-changed'
    && decision.continuation.context.event === 'inventory-threshold',
  'the second house emits the typed inventory-threshold event');
  resolve(state, 0, decision, { accepted: false }, 'defer Herb Gardener at the threshold');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(182)).length, 0,
    'declining the threshold opportunity leaves the once-only use available');
  check(state.pending.length === 0 && state.players[0].turnMayEnd,
    'the completed action returns to a stable no-decision window');

  mustApply(state, 0, { type: 'activate_occupation', cardId: cardId(182) },
    'activate Herb Gardener during the stable Actions window');
  decision = cardDecision(state, 182, 'confirmation');
  rejectAtomic(state, 0, {
    type: 'activate_occupation', cardId: cardId(182),
  }, 'second anytime activation while the first decision is open');
  resolve(state, 0, decision, { accepted: true }, 'confirm the anytime Herb Gardener exchange');
  decision = cardDecision(state, 182, 'choice');
  const oneSpices = optionMatching(decision, /one-spices|2 wood.*1 spices|1 spices/i);
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['forged-branch'] },
  }, 'forged Herb Gardener branch');
  resolve(state, 0, decision, { optionIds: [oneSpices] }, 'exchange two Wood for one Spices');

  equal(state.players[0].resources.wood, 3, 'Herb Gardener spends exactly two Wood');
  equal(state.players[0].goods.spices, 1, 'Herb Gardener grants exactly one Spices');
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(182)).length, 1,
    'Herb Gardener records one once-per-card use');
  rejectAtomic(state, 0, {
    type: 'activate_occupation', cardId: cardId(182),
  }, 'second Herb Gardener use in the same round');
  state.round++;
  rejectAtomic(state, 0, {
    type: 'activate_occupation', cardId: cardId(182),
  }, 'second Herb Gardener use in a later round');
  rejectAtomic(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: [oneSpices] },
  }, 'stale Herb Gardener choice');
});

console.log(`Feast occupation phase scheduler reducer integration: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
