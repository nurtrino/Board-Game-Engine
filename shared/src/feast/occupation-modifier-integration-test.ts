// Reducer-level integration coverage for mandatory occupation modifiers.
// Run: npx tsx shared/src/feast/occupation-modifier-integration-test.ts

import {
  FEAST_ACTION_BY_ID,
  applyFeastAction,
  createFeast,
  feastViewFor,
  type FeastAction,
  type FeastPendingDecision,
  type FeastState,
} from './index.js';

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string): void {
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

function fresh(seed: number): FeastState {
  return createFeast(
    [{ name: 'Modifier Tester', color: 'Red' }],
    seed,
    { length: 'short', occupationMode: 'all' },
  );
}

function playDirectly(state: FeastState, ...numbers: number[]): void {
  const player = state.players[0];
  player.playedOccupations = numbers.map((number) => `occupation-${number}`);
  // Fourth-column tests must exercise the printed action immediately rather
  // than pause at the independent play-an-occupation timing bonus.
  player.occupationHand = [];
}

function addLongships(state: FeastState, count: number): void {
  const player = state.players[0];
  for (let index = 0; index < count; index++) {
    player.ships.push({
      id: `test-longship-${index + 1}`,
      type: 'longship',
      ore: 0,
      emigrated: false,
      emigratedRound: null,
    });
  }
}

function act(state: FeastState, action: FeastAction, label: string): void {
  const result = applyFeastAction(state, 0, action);
  check(result.ok, `${label}${result.error ? `: ${result.error}` : ''}`);
}

function currentDecision(state: FeastState, kind: FeastPendingDecision['kind']): FeastPendingDecision {
  const decision = state.pending[0];
  if (!decision || decision.kind !== kind) {
    throw new Error(`Expected ${kind} decision, got ${decision?.kind ?? 'none'}`);
  }
  return decision;
}

function placeAndStartDie(state: FeastState, spaceId: string): FeastPendingDecision {
  act(state, { type: 'place_workers', spaceId }, `place workers on ${spaceId}`);
  let decision = currentDecision(state, 'die');
  if (decision.meta?.stage === 'boats') {
    const ship = decision.options.find((option) => !option.disabled);
    if (!ship) throw new Error(`No eligible ship for ${spaceId}`);
    act(state, {
      type: 'resolve_decision', decisionId: decision.id,
      choice: { optionIds: [ship.id] },
    }, `choose ship for ${spaceId}`);
    decision = currentDecision(state, 'die');
  }
  return decision;
}

function roll(state: FeastState, command: 'roll' | 'reroll', label: string): void {
  const decision = currentDecision(state, 'die');
  act(state, {
    type: 'resolve_decision',
    decisionId: decision.id,
    choice: { optionIds: [command] },
  }, label);
}

function rolledEvents(state: FeastState, afterSeq: number) {
  return state.events.filter((event) => event.seq > afterSeq && event.title.startsWith('Rolled d'));
}

// ---------------------------------------------------------------------------
// Occupation 106: Plundering costs 4/3/2 Vikings with 2/3/4 longships.
// ---------------------------------------------------------------------------

equal(FEAST_ACTION_BY_ID.plunder.workers, 4, 'Plundering retains its printed four-Viking cost');

for (const [longships, expectedCost] of [[2, 4], [3, 3], [4, 2]] as const) {
  const state = fresh(100 + longships);
  playDirectly(state, 106);
  addLongships(state, longships);
  state.players[0].workersAvailable = 7;
  const workersBefore = state.players[0].workersAvailable;
  const hoardsBefore = state.players[0].goods['silver-hoard'];

  act(state, { type: 'place_workers', spaceId: 'plunder' }, `Warmonger Plundering with ${longships} longships`);

  const occupancy = state.actionSpaces.find((space) => space.id === 'plunder')?.occupants;
  equal(occupancy?.map((entry) => entry.workers), [expectedCost], `occupation 106 places exactly ${expectedCost} physical Vikings with ${longships} longships`);
  equal(state.players[0].workersAvailable, workersBefore - expectedCost, `occupation 106 decrements the available-Viking supply by ${expectedCost}`);
  const ships = currentDecision(state, 'ship');
  act(state, {
    type: 'resolve_decision', decisionId: ships.id,
    choice: { optionIds: [ships.options[0].id] },
  }, `choose the physical Plundering longships at the ${longships}-ship tier`);
  equal(state.players[0].goods['silver-hoard'], hoardsBefore + 1, `occupation 106 still resolves the authentic Plundering reward at the ${longships}-longship tier`);
}

{
  const state = fresh(110);
  playDirectly(state, 153); // A dice modifier must not affect worker cost.
  addLongships(state, 4);
  state.players[0].workersAvailable = 7;
  act(state, { type: 'place_workers', spaceId: 'plunder' }, 'Plundering with an unrelated occupation');
  equal(
    state.actionSpaces.find((space) => space.id === 'plunder')?.occupants.map((entry) => entry.workers),
    [4],
    'an unrelated occupation leaves Plundering at its printed four-Viking cost',
  );
  equal(state.players[0].workersAvailable, 3, 'unmodified Plundering removes four available Vikings');
  const ships = currentDecision(state, 'ship');
  act(state, {
    type: 'resolve_decision', decisionId: ships.id,
    choice: { optionIds: [ships.options[0].id] },
  }, 'choose physical ships for unmodified Plundering');
}

{
  const state = fresh(111);
  playDirectly(state, 106);
  state.players[0].workersAvailable = 7;
  act(state, { type: 'place_workers', spaceId: 'weekly-beans' }, 'Warmonger on an unrelated action space');
  equal(
    state.actionSpaces.find((space) => space.id === 'weekly-beans')?.occupants.map((entry) => entry.workers),
    [1],
    'occupation 106 does not change an unrelated one-Viking action',
  );
  equal(state.players[0].workersAvailable, 6, 'unrelated action decrements only its printed worker count');
}

// ---------------------------------------------------------------------------
// Occupations 4, 13, 136, and 146: every physical roll is modified and scoped.
// ---------------------------------------------------------------------------

{
  // Seed 1 has deterministic physical hunting rolls 7, 5, 6. Occupations 4,
  // 13, and 146 each subtract one. Occupation 136 is also owned here but must
  // remain scoped to Raiding/Pillaging.
  const state = fresh(1);
  playDirectly(state, 4, 13, 136, 146);
  const beforeSeq = state.eventSeq;
  placeAndStartDie(state, 'hunt-game-1');
  roll(state, 'roll', 'stacked hunting roll 1');
  check(currentDecision(state, 'die').options.some((option) => option.id === 'reroll'), 'stacked hunting roll 1 can be rerolled');
  roll(state, 'reroll', 'stacked hunting roll 2');
  check(currentDecision(state, 'die').options.some((option) => option.id === 'reroll'), 'stacked hunting roll 2 can be rerolled');
  roll(state, 'reroll', 'stacked hunting roll 3');

  const events = rolledEvents(state, beforeSeq);
  equal(events.map((event) => event.detail), [
    '7 -3 = 4 -> result 4',
    '5 -3 = 2 -> result 2',
    '6 -3 = 3 -> result 3',
  ], 'all three physical hunting rolls retain deterministic raw-versus-stacked-modifier evidence');
  equal(events.map((event) => event.die?.result), [4, 2, 3], 'all three typed die events expose the modified hunting result');
  equal(events.map((event) => event.die?.roll), [1, 2, 3], 'all three typed die events retain their physical roll sequence');
  equal(currentDecision(state, 'die').meta?.result, 3, 'the live decision uses the third modified hunting result');
  check(!currentDecision(state, 'die').options.some((option) => option.id === 'reroll'), 'normal three-roll maximum is enforced after modifiers');
}

{
  // The paired unmodified run proves that the left-hand values above are the
  // deterministic physical dice, rather than already-modified results.
  const state = fresh(1);
  playDirectly(state, 189); // Scoring is unrelated to dice.
  const beforeSeq = state.eventSeq;
  placeAndStartDie(state, 'hunt-game-1');
  roll(state, 'roll', 'unmodified hunting roll 1');
  roll(state, 'reroll', 'unmodified hunting roll 2');
  roll(state, 'reroll', 'unmodified hunting roll 3');
  const events = rolledEvents(state, beforeSeq);
  equal(events.map((event) => event.detail), [
    '7 -> result 7',
    '5 -> result 5',
    '6 -> result 6',
  ], 'paired deterministic run records the same physical rolls without occupation changes');
  equal(events.map((event) => event.die?.result), [7, 5, 6], 'unrelated occupation leaves every hunting result unchanged');
}

{
  const state = fresh(1);
  playDirectly(state, 136);
  addLongships(state, 1);
  const beforeSeq = state.eventSeq;
  placeAndStartDie(state, 'raid');
  roll(state, 'roll', 'Raider physical roll');
  const event = rolledEvents(state, beforeSeq)[0];
  equal(event?.detail, '7 +1 = 8 -> result 8', 'occupation 136 records raw 7 and modified battle result 8');
  equal(event?.die?.result, 8, 'occupation 136 changes the live typed battle result');
}

{
  const state = fresh(1);
  playDirectly(state, 4, 13, 136, 146);
  addLongships(state, 1);
  const beforeSeq = state.eventSeq;
  placeAndStartDie(state, 'raid');
  roll(state, 'roll', 'opposing stacked raid modifiers');
  const event = rolledEvents(state, beforeSeq)[0];
  equal(event?.die?.result, 7, 'occupations 4 and 136 stack to net zero on Raiding');
  equal(event?.detail, '7 -> result 7', 'net-zero stacked modifiers preserve the deterministic physical battle result');
}

{
  const state = fresh(1);
  playDirectly(state, 13, 146);
  addLongships(state, 1);
  const beforeSeq = state.eventSeq;
  placeAndStartDie(state, 'raid');
  roll(state, 'roll', 'unrelated hunting cards on Raiding');
  equal(rolledEvents(state, beforeSeq)[0]?.die?.result, 7, 'occupations 13 and 146 do not modify Raiding');
}

{
  const state = fresh(1);
  playDirectly(state, 136);
  const beforeSeq = state.eventSeq;
  placeAndStartDie(state, 'hunt-game-1');
  roll(state, 'roll', 'unrelated Raider card on Hunting');
  equal(rolledEvents(state, beforeSeq)[0]?.die?.result, 7, 'occupation 136 does not modify Hunting');
}

{
  // Seed 4 begins with a physical 2. The three mandatory hunting reductions
  // clamp it to zero; a low-roll zero must succeed and costs nothing.
  const state = fresh(4);
  playDirectly(state, 4, 13, 136, 146);
  const hideBefore = state.players[0].goods.hide;
  const meatBefore = state.players[0].goods['game-meat'];
  const beforeSeq = state.eventSeq;
  placeAndStartDie(state, 'hunt-game-1');
  roll(state, 'roll', 'stacked hunting roll clamped to zero');
  const decision = currentDecision(state, 'die');
  const event = rolledEvents(state, beforeSeq)[0];
  equal(event?.detail, '2 -3 = 0 -> result 0', 'raw-versus-modified event evidence records a legal clamped zero');
  equal(decision.meta?.result, 0, 'zero is the live hunting result');
  check(!decision.options.some((option) => option.id === 'reroll'), 'a zero result cannot be rerolled');
  check(decision.options.find((option) => option.id === 'fail')?.disabled === true, 'a zero result cannot be declared a failure');

  const beforeIllegalFail = JSON.stringify(state);
  const failedAttempt = applyFeastAction(state, 0, {
    type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['fail'] },
  });
  check(!failedAttempt.ok, 'the reducer rejects declaring failure on a zero result');
  equal(JSON.stringify(state), beforeIllegalFail, 'rejected zero-result failure is atomic');

  act(state, {
    type: 'resolve_decision',
    decisionId: currentDecision(state, 'die').id,
    choice: { optionIds: ['resolve'], allocations: [] },
  }, 'resolve zero-cost hunting success');
  equal(state.players[0].goods.hide, hideBefore + 1, 'zero-cost hunting success gains Hide');
  equal(state.players[0].goods['game-meat'], meatBefore + 1, 'zero-cost hunting success gains Game Meat');
  check(state.pending.length === 0 && state.players[0].turnMayEnd, 'zero-cost success finishes the printed action normally');
}

// ---------------------------------------------------------------------------
// Occupations 90/132: added ore comes only from the resolving longship.
// ---------------------------------------------------------------------------

for (const fixture of [
  { card: 90, spaceId: 'raid', resolving: 'raid-resolving', other: 'raid-other', delta: 2 },
  { card: 132, spaceId: 'pillage-2', resolving: 'pillage-resolving', other: 'pillage-other', delta: 3 },
] as const) {
  const state = fresh(9000 + fixture.card);
  playDirectly(state, fixture.card);
  state.players[0].ships.push(
    { id: fixture.resolving, type: 'longship', ore: 2, emigrated: false, emigratedRound: null },
    { id: fixture.other, type: 'longship', ore: 3, emigrated: false, emigratedRound: null },
  );

  act(state, { type: 'place_workers', spaceId: fixture.spaceId },
    `start card ${fixture.card} resolving-ship action`);
  const boats = currentDecision(state, 'die');
  check(boats.meta?.stage === 'boats', `card ${fixture.card} starts with a physical ship choice`);
  check(boats.options.some((option) => option.id === fixture.resolving)
    && boats.options.some((option) => option.id === fixture.other),
  `card ${fixture.card} fixture exposes both ore-bearing longships before one resolves`);
  act(state, {
    type: 'resolve_decision', decisionId: boats.id,
    choice: { optionIds: [fixture.resolving] },
  }, `bind card ${fixture.card} to its resolving longship`);

  const occupation = currentDecision(state, 'card-effect');
  equal(occupation.meta?.cardId, `occupation-${fixture.card}`,
    `card ${fixture.card} owns the optional ore-spend decision`);
  equal(occupation.meta?.requestKind, 'confirmation',
    `card ${fixture.card} asks only whether to spend ore, not which ship to raid`);
  act(state, {
    type: 'resolve_decision', decisionId: occupation.id, choice: { accepted: true },
  }, `accept card ${fixture.card} resolving-ship ore spend`);

  const restoredRoll = currentDecision(state, 'die');
  equal(restoredRoll.meta?.stage, 'roll',
    `card ${fixture.card} auto-binds its payment and returns directly to the roll`);
  equal(state.players[0].ships.find((ship) => ship.id === fixture.resolving)?.ore, 1,
    `card ${fixture.card} removes exactly one ore from the resolving longship`);
  equal(state.players[0].ships.find((ship) => ship.id === fixture.other)?.ore, 3,
    `card ${fixture.card} cannot remove ore from the other eligible longship`);
  check(state.occupationActiveModifiers.some((entry) => entry.cardId === `occupation-${fixture.card}`
    && entry.modifier.kind === 'modify-die' && entry.modifier.delta === fixture.delta),
  `card ${fixture.card} registers its +${fixture.delta} every-roll modifier after exact payment`);
}

// ---------------------------------------------------------------------------
// Occupation 153: the real die continuation permits exactly four rolls.
// ---------------------------------------------------------------------------

{
  const state = fresh(153);
  playDirectly(state, 153);
  addLongships(state, 1);
  const beforeSeq = state.eventSeq;
  const initial = placeAndStartDie(state, 'raid');
  equal(initial.meta?.rollLimit, 4, 'occupation 153 replaces the normal maximum with four rolls');
  equal(initial.meta?.rollsRemaining, 4, 'occupation 153 begins with four physical rolls remaining');
  check(/(?:four|4)/i.test(initial.prompt), 'occupation 153 tells the player that four rolls are available');

  for (let index = 0; index < 4; index++) {
    roll(state, index === 0 ? 'roll' : 'reroll', `occupation 153 roll ${index + 1}`);
    const decision = currentDecision(state, 'die');
    equal(decision.meta?.rollsRemaining, 3 - index, `occupation 153 tracks ${3 - index} rolls remaining after roll ${index + 1}`);
    check(
      decision.options.some((option) => option.id === 'reroll') === (index < 3),
      `occupation 153 ${index < 3 ? 'offers' : 'removes'} reroll after physical roll ${index + 1}`,
    );
  }

  const events = rolledEvents(state, beforeSeq);
  equal(events.length, 4, 'occupation 153 emits four separate typed physical-roll events');
  equal(events.map((event) => event.die?.roll), [1, 2, 3, 4], 'occupation 153 events identify rolls one through four');

  const beforeFifth = JSON.stringify(state);
  const fifth = applyFeastAction(state, 0, {
    type: 'resolve_decision',
    decisionId: currentDecision(state, 'die').id,
    choice: { optionIds: ['reroll'] },
  });
  check(!fifth.ok, 'occupation 153 rejects a fifth physical roll');
  equal(JSON.stringify(state), beforeFifth, 'rejected fifth roll is atomic');
}

{
  const state = fresh(154);
  playDirectly(state, 189); // Unrelated scoring card.
  addLongships(state, 1);
  const initial = placeAndStartDie(state, 'raid');
  equal(initial.meta?.rollLimit, 3, 'unrelated occupation leaves the normal three-roll maximum');
  check(/(?:three|3)/i.test(initial.prompt), 'unmodified die action tells the player that three rolls are available');
  roll(state, 'roll', 'normal roll 1');
  roll(state, 'reroll', 'normal roll 2');
  roll(state, 'reroll', 'normal roll 3');
  check(!currentDecision(state, 'die').options.some((option) => option.id === 'reroll'), 'unmodified die action removes reroll after roll three');
}

// ---------------------------------------------------------------------------
// Occupation 189: live preview and reducer-triggered final scoring share tiers.
// ---------------------------------------------------------------------------

const explorationIds = ['shetland', 'faroe-islands', 'iceland', 'greenland', 'baffin-island'] as const;
const scoringBonus = [0, 0, 4, 9, 16, 0] as const;

function addExplorations(state: FeastState, count: number): void {
  for (const [index, definitionId] of explorationIds.slice(0, count).entries()) {
    state.players[0].boards.push({
      id: `test-exploration-${index + 1}`,
      definitionId,
      kind: 'exploration',
      owner: 0,
      placements: [],
    });
  }
}

function queueFinalScoring(state: FeastState, suffix: string): void {
  state.phase = 'return_vikings';
  state.phaseNumber = 12;
  state.feastCursor = 0;
  state.pending = [{
    id: `test-final-${suffix}`,
    seat: 0,
    kind: 'final-placement',
    label: 'Final Placement',
    prompt: 'Confirm final placements.',
    options: [{ id: 'confirm', label: 'Confirm Final Placements' }],
    min: 1,
    max: 1,
    meta: { scoring: true },
    continuation: { kind: 'none' },
    private: false,
  }];
}

for (let count = 0; count <= 5; count++) {
  const state = fresh(1890 + count);
  playDirectly(state, 189);
  state.players[0].silver = 5;
  addExplorations(state, count);

  const preview = feastViewFor(state, 0).scorePreview[0];
  equal(preview.silver, 5 + scoringBonus[count], `occupation 189 live preview applies the ${count}-exploration silver tier`);

  queueFinalScoring(state, String(count));
  act(state, {
    type: 'resolve_decision',
    decisionId: currentDecision(state, 'final-placement').id,
    choice: { optionIds: ['confirm'] },
  }, `confirm final scoring with ${count} explorations`);
  check(state.phase === 'ended', `final-placement reducer path ends the ${count}-exploration scoring state`);
  equal(state.scores?.[0].silver, 5 + scoringBonus[count], `occupation 189 final score applies the ${count}-exploration silver tier`);
  equal(state.scores?.[0].silver, preview.silver, `occupation 189 live preview and final score agree at ${count} explorations`);
}

{
  const state = fresh(1900);
  playDirectly(state, 153); // A dice card must not add exploration silver.
  state.players[0].silver = 5;
  addExplorations(state, 4);
  equal(feastViewFor(state, 0).scorePreview[0].silver, 5, 'unrelated occupation adds no exploration silver to the live preview');
  queueFinalScoring(state, 'unrelated');
  act(state, {
    type: 'resolve_decision',
    decisionId: currentDecision(state, 'final-placement').id,
    choice: { optionIds: ['confirm'] },
  }, 'confirm final scoring with an unrelated occupation');
  equal(state.scores?.[0].silver, 5, 'unrelated occupation adds no exploration silver to the final score');
}

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`${passed}/${passed} mandatory occupation modifier integration checks passed`);
}
