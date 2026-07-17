// Directed acceptance tests for SETI's cross-step core timing rules.
// Run: npx tsx shared/src/seti/core-flow-test.ts

import assert from 'node:assert/strict';
import {
  SETI_RULES,
  SETI_SEATS,
  SETI_TECH_BY_ID,
  type SetiTechStackId,
} from './data.js';
import { SETI_ALIEN_CARDS } from './alienCatalog.js';
import { SETI_COMPUTER_TECH_TOP_SPACES } from './coreRules.js';
import { SETI_BASE_PROJECT_CATALOG } from './projectCatalog.js';
import {
  createSeti,
  drawSetiProjectCard,
  getSetiBodyCells,
  setiSupportLayerForCell,
  setiViewFor,
  type SetiPlayer,
  type SetiState,
} from './state.js';
import {
  applySetiAction,
  finishSetiGame,
  type SetiAction,
  type SetiResult,
} from './actions.js';

const failures: string[] = [];
let passed = 0;

function test(name: string, run: () => void): void {
  try {
    run();
    passed++;
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    failures.push(`${name}\n${detail}`);
  }
}

function seats(count: number) {
  return SETI_SEATS.slice(0, count).map((color, index) => ({ name: `Flow ${index + 1}`, color }));
}

function act(s: SetiState, seat: number, action: SetiAction): SetiResult {
  const result = applySetiAction(s, seat, action);
  assert.equal(result.ok, true, `${action.type} rejected: ${result.error ?? 'unknown error'}`);
  return result;
}

function ready(count = 2, seed = 1): SetiState {
  const s = createSeti(seats(count), seed);
  while (s.pending[0]?.kind === 'initial-income-card') {
    const decision = s.pending[0];
    act(s, decision.owner, { type: 'choose_initial_income', cardId: decision.options[0] });
  }
  assert.equal(s.phase, 'playing');
  assert.equal(s.pending.length, 0);
  return s;
}

function solarSignature(s: SetiState): string {
  return JSON.stringify({ orientations: s.solar.orientations, pointer: s.solar.rotationPointer });
}

function endSyntheticTurn(s: SetiState, seat: number): void {
  assert.equal(s.pending.length, 0, 'synthetic turn must begin with no pending decision');
  assert.equal(s.turnResolution, null, 'synthetic turn must begin with no unresolved turn');
  s.activeSeat = seat;
  s.projectRuntime.turn.seat = seat;
  s.mainActionTaken = true;
  act(s, seat, { type: 'end_turn' });
}

function resolvePassChoices(s: SetiState, seat: number): void {
  while (s.pending[0]?.owner === seat || s.deferredEndRoundCard?.owner === seat) {
    const decision = s.pending[0]?.owner === seat ? s.pending[0] : s.deferredEndRoundCard!;
    if (decision.kind === 'discard-to-four') {
      const ordinaryAliens = s.players[seat].alienHand.filter((id) => SETI_ALIEN_CARDS.find((card) => card.id === id)?.handRules !== 'exertian-separate');
      const options = [...s.players[seat].hand, ...ordinaryAliens];
      act(s, seat, { type: 'choose', choice: { kind: 'cards', cardIds: options.slice(-decision.count) } });
    } else if (decision.kind === 'end-round-card') {
      act(s, seat, { type: 'choose', choice: { kind: 'card', cardId: decision.options[0] } });
    } else {
      assert.fail(`unexpected pass decision ${decision.kind}`);
    }
  }
}

function passAndResolve(s: SetiState, seat: number): void {
  act(s, seat, { type: 'pass' });
  resolvePassChoices(s, seat);
}

function claimAtTwentyFive(s: SetiState, seat: number, tileId: SetiState['goldTiles'][number]['id']) {
  s.players[seat].score = 25;
  endSyntheticTurn(s, seat);
  const decision = s.pending[0];
  assert.equal(decision?.kind, 'gold-tile', `seat ${seat} should choose a gold tile`);
  if (!decision || decision.kind !== 'gold-tile') assert.fail('missing gold-tile decision');
  assert.ok(decision.options.includes(tileId));
  act(s, seat, { type: 'choose', choice: { kind: 'gold-tile', tileId } });
  const claim = s.players[seat].goldClaims.find((candidate) => candidate.threshold === 25);
  assert.ok(claim, `seat ${seat} gold claim was not stored`);
  return claim;
}

function neutralMarkerPositions(s: SetiState): string[] {
  const result: string[] = [];
  for (const slot of s.species) {
    for (const color of ['purple', 'orange', 'blue'] as const) {
      if (slot.discovery[color]?.owner === null) result.push(`${slot.slot}:${color}`);
    }
  }
  return result;
}

function beginResearch(): SetiAction {
  // The public gesture is the Research action itself. The stack is deliberately
  // absent because it is selected only after payment and solar rotation.
  return { type: 'research' } as unknown as SetiAction;
}

function forceTopTile(s: SetiState, stackId: SetiTechStackId, tileId: string): void {
  const tiles = s.techStacks[stackId].tiles;
  assert.ok(tiles.includes(tileId), `${tileId} is not in ${stackId}`);
  s.techStacks[stackId].tiles = [tileId, ...tiles.filter((candidate) => candidate !== tileId)];
}

function removeProjectFromAllZones(s: SetiState, cardId: string): void {
  const removeString = (cards: string[]): void => {
    const index = cards.indexOf(cardId);
    if (index >= 0) cards.splice(index, 1);
  };
  removeString(s.projectDeck);
  removeString(s.projectDiscard);
  for (const stack of s.roundEndStacks) removeString(stack);
  const row = s.projectRow.indexOf(cardId);
  if (row >= 0) s.projectRow[row] = null;
  for (const player of s.players) {
    removeString(player.hand);
    removeString(player.missions);
    removeString(player.completedMissions);
    removeString(player.scoringCards);
    removeString(player.permanentCards);
    const income = player.incomeCards.findIndex((card) => card.cardId === cardId);
    if (income >= 0) player.incomeCards.splice(income, 1);
  }
}

function addProbeAt(s: SetiState, player: SetiPlayer, cell: ReturnType<typeof getSetiBodyCells>[keyof ReturnType<typeof getSetiBodyCells>]): string {
  assert.ok(cell, 'probe test body is not visible');
  const id = `seti_flow_probe_${s.solar.nextPieceId++}`;
  s.solar.pieces.push({ id, owner: player.seat, kind: 'probe', cell, supportLayer: setiSupportLayerForCell(s, cell) });
  return id;
}

test('Pass stages discard, then first-pass rotation, then preserves the deferred round card', () => {
  const s = ready(2, 701);
  const seat = s.activeSeat;
  const player = s.players[seat];
  while (player.hand.length < 6) {
    const card = drawSetiProjectCard(s);
    assert.ok(card);
    player.hand.push(card);
  }

  const beforeSolar = solarSignature(s);
  act(s, seat, { type: 'pass' });
  assert.deepEqual(s.pending.map((decision) => decision.kind), ['discard-to-four']);
  assert.equal(solarSignature(s), beforeSolar, 'first-pass rotation must wait until discard-to-four resolves');

  const discard = s.pending[0];
  assert.equal(discard.kind, 'discard-to-four');
  if (discard.kind !== 'discard-to-four') assert.fail('missing discard decision');
  act(s, seat, { type: 'choose', choice: { kind: 'cards', cardIds: player.hand.slice(-discard.count) } });
  assert.notEqual(solarSignature(s), beforeSolar, 'solar system rotates between the discard and round-card steps');
  assert.equal(s.pending.length, 0, 'the private round-card choice does not occupy the blocking queue');
  assert.equal(s.deferredEndRoundCard?.kind, 'end-round-card');
  assert.equal(player.hand.length, SETI_RULES.handLimitAtPass);

  const roundCard = s.deferredEndRoundCard;
  if (!roundCard || roundCard.kind !== 'end-round-card') assert.fail('missing end-round-card decision');
  const incomeBefore = player.incomeCards.length;
  act(s, seat, { type: 'choose', choice: { kind: 'card', cardId: roundCard.options[0] } });
  assert.equal(player.incomeCards.length, incomeBefore + 1);
});

test('An earlier passer may defer privately while play continues, but must choose before the next passer', () => {
  const s = ready(2, 702);
  const first = s.activeSeat;
  const second = (first + 1) % s.players.length;
  const firstIncomeBefore = s.players[first].incomeCards.length;
  const secondIncomeBefore = s.players[second].incomeCards.length;
  const initialFan = [...s.roundEndStacks[0]];

  act(s, first, { type: 'pass' });
  const firstPassDecision = s.pending[0];
  if (firstPassDecision?.kind === 'discard-to-four') {
    const ordinaryAliens = s.players[first].alienHand.filter((id) => SETI_ALIEN_CARDS.find((card) => card.id === id)?.handRules !== 'exertian-separate');
    const cards = [...s.players[first].hand, ...ordinaryAliens].slice(-firstPassDecision.count);
    act(s, first, { type: 'choose', choice: { kind: 'cards', cardIds: cards } });
  }
  assert.equal(s.pending.length, 0, 'the deferred fan must not block the next active player');
  assert.equal(s.turnResolution, null, 'the earlier pass completes around its deferred fan');
  assert.equal(s.activeSeat, second);
  assert.equal(s.deferredEndRoundCard?.owner, first);
  assert.deepEqual(s.deferredEndRoundCard?.options, initialFan, 'the exact private fan is preserved');

  const firstView = setiViewFor(s, first);
  const secondView = setiViewFor(s, second);
  const tableView = setiViewFor(s, null);
  assert.equal(firstView.pending?.kind, 'end-round-card');
  assert.equal(firstView.pending?.owner, first);
  assert.equal(firstView.pending?.decision?.kind, 'end-round-card', 'only the passer receives the private decision');
  assert.equal(secondView.pending, null, 'the active player is not presented with another seat\'s nonblocking fan');
  assert.equal(tableView.pending, null, 'the nonblocking private fan is not published to the table view');

  s.players[second].credits = Math.max(s.players[second].credits, SETI_RULES.launchCredits);
  act(s, second, { type: 'launch' });
  assert.equal(s.mainActionTaken, true, 'the next player can take a real main action while the fan remains open');
  assert.equal(s.deferredEndRoundCard?.owner, first);
  act(s, second, { type: 'end_turn' });
  assert.equal(s.activeSeat, second, 'with the other seat passed, the eligible player takes another turn');

  act(s, second, { type: 'pass' });
  const secondPassDecision = s.pending[0];
  if (secondPassDecision?.kind === 'discard-to-four') {
    const ordinaryAliens = s.players[second].alienHand.filter((id) => SETI_ALIEN_CARDS.find((card) => card.id === id)?.handRules !== 'exertian-separate');
    const cards = [...s.players[second].hand, ...ordinaryAliens].slice(-secondPassDecision.count);
    act(s, second, { type: 'choose', choice: { kind: 'cards', cardIds: cards } });
  }
  assert.equal(s.round, 1);
  assert.equal(s.turnResolution?.kind, 'pass');
  assert.equal(s.turnResolution?.passStage, 'round-card', 'the next pass stops at its card step');
  assert.equal(s.deferredEndRoundCard?.owner, first, 'the earlier fan remains the barrier');
  const barrierView = setiViewFor(s, second);
  assert.equal(barrierView.pending?.owner, first, 'other seats can see who must finish at the barrier');
  assert.equal(barrierView.pending?.decision, undefined, 'the barrier never leaks another player\'s card decision');

  const secondJump = applySetiAction(s, second, { type: 'choose', choice: { kind: 'card', cardId: initialFan[0] } });
  assert.equal(secondJump.ok, false, 'the next passer cannot choose ahead of the earlier passer');

  const firstDecision = s.deferredEndRoundCard;
  if (!firstDecision) assert.fail('missing first deferred fan');
  const firstCard = firstDecision.options[0];
  act(s, first, { type: 'choose', choice: { kind: 'card', cardId: firstCard } });
  assert.equal(s.players[first].incomeCards.length, firstIncomeBefore + 1);
  assert.equal(s.deferredEndRoundCard?.owner, second, 'the next passer receives a fresh fan only afterward');
  assert.ok(!s.deferredEndRoundCard?.options.includes(firstCard), 'the taken card is absent from the next fan');
  assert.equal(s.round, 1, 'all-passed round transition waits for the last private choice');

  const secondDecision = s.deferredEndRoundCard;
  if (!secondDecision) assert.fail('missing second deferred fan');
  act(s, second, { type: 'choose', choice: { kind: 'card', cardId: secondDecision.options[0] } });
  assert.equal(s.players[second].incomeCards.length, secondIncomeBefore + 1);
  assert.equal(s.round, 2, 'round transition occurs immediately after every passed seat is resolved');
  assert.equal(s.deferredEndRoundCard, null);
  assert.equal(s.turnResolution, null);
  assert.equal(s.roundEndStacks[0].length, 0, 'the single leftover card is discarded during transition');
});

test('Next round starts clockwise from the prior starter, never with the first passer', () => {
  const s = ready(3, 703);
  const priorStarter = s.startingSeat;
  const clockwise = (priorStarter + 1) % s.players.length;
  const third = (priorStarter + 2) % s.players.length;

  endSyntheticTurn(s, priorStarter);
  assert.equal(s.activeSeat, clockwise);
  endSyntheticTurn(s, clockwise);
  assert.equal(s.activeSeat, third);

  passAndResolve(s, third);
  assert.equal(s.firstPassSeat, third);
  passAndResolve(s, priorStarter);
  passAndResolve(s, clockwise);

  assert.equal(s.round, 2);
  assert.equal(s.startingSeat, clockwise);
  assert.notEqual(s.startingSeat, third, 'the first passer was intentionally not clockwise from the old starter');
  assert.equal(s.activeSeat, clockwise);
});

test('Gold claims freeze first/second/later per-set value and count alien missions', () => {
  const s = ready(3, 709);
  const tileId = 'seti_gold_mission' as const;
  s.goldTiles.find((tile) => tile.id === tileId)!.side = 'A';

  const first = claimAtTwentyFive(s, 0, tileId);
  const second = claimAtTwentyFive(s, 1, tileId);
  const later = claimAtTwentyFive(s, 2, tileId);
  assert.equal(first.pointsPerSet, 4);
  assert.equal(second.pointsPerSet, 3);
  assert.equal(later.pointsPerSet, 2);

  const alienMissions = SETI_ALIEN_CARDS.filter((card) => card.mission).slice(0, 3).map((card) => card.id);
  assert.equal(alienMissions.length, 3);
  s.players[0].completedAlienMissions.push(...alienMissions);
  finishSetiGame(s);
  assert.equal(s.players[0].finalScore, 25 + 3 * 4, 'three alien missions are three sets at the stored first-claim value');
});

test('Gold income scoring includes ordinary alien income cards', () => {
  const s = ready(2, 719);
  const player = s.players[0];
  const tileId = 'seti_gold_income' as const;
  s.goldTiles.find((tile) => tile.id === tileId)!.side = 'A';
  const claim = claimAtTwentyFive(s, player.seat, tileId);
  assert.equal(claim.pointsPerSet, 11);

  const credits = SETI_BASE_PROJECT_CATALOG.filter((card) => card.income === 'credit').slice(0, 2);
  const energy = SETI_BASE_PROJECT_CATALOG.filter((card) => card.income === 'energy').slice(0, 2);
  const alienCards = SETI_ALIEN_CARDS.filter((card) => card.handRules === 'normal' && card.incomeCorner === 'card').slice(0, 2);
  assert.equal(credits.length, 2);
  assert.equal(energy.length, 2);
  assert.equal(alienCards.length, 2);
  player.incomeCards.push(
    ...credits.map((card) => ({ cardId: card.id, kind: 'credit' as const, starting: false })),
    ...energy.map((card) => ({ cardId: card.id, kind: 'energy' as const, starting: false })),
  );
  player.alienIncomeCards.push(...alienCards.map((card) => ({ cardId: card.id, kind: 'card' as const })));

  finishSetiGame(s);
  assert.equal(player.finalScore, 25 + 2 * 11, 'alien card-income corners complete two income trios');
});

test('#113 Solvay Conference uses the lowest/rightmost tier without claiming', () => {
  const s = ready(2, 727);
  const player = s.players[0];
  const solvay = 'seti_project_204644';
  removeProjectFromAllZones(s, solvay);
  player.scoringCards.push(solvay);
  for (const tile of s.goldTiles) tile.side = 'A';
  player.completedAlienMissions.push(...SETI_ALIEN_CARDS.filter((card) => card.mission).slice(0, 3).map((card) => card.id));
  const scoreBefore = player.score;

  finishSetiGame(s);
  assert.equal(player.finalScore, scoreBefore + 3 * 2, 'three mission sets use Mission A\'s lowest/rightmost value of 2');
  assert.equal(player.goldClaims.length, 0, 'Solvay Conference does not place a gold claim');
});

test('Neutral 20/30 milestones trigger once per player, leftmost, while supply remains', () => {
  const s = ready(2, 733);
  assert.deepEqual(s.neutralMilestonesRemaining, { 20: 2, 30: 2 });

  s.players[0].score = 20;
  endSyntheticTurn(s, 0);
  assert.deepEqual(neutralMarkerPositions(s), ['0:purple']);
  assert.equal(s.players[0].neutralMilestones[20], true);

  s.players[0].score = 21;
  endSyntheticTurn(s, 0);
  assert.deepEqual(neutralMarkerPositions(s), ['0:purple'], 'one player cannot consume the same threshold twice');

  s.players[1].score = 20;
  endSyntheticTurn(s, 1);
  assert.deepEqual(neutralMarkerPositions(s), ['0:purple', '0:orange']);
  assert.equal(s.neutralMilestonesRemaining[20], 0);

  for (const player of s.players) {
    player.goldClaims.push({ threshold: 25, tileId: 'seti_gold_tech', pointsPerSet: 5 });
  }
  s.players[0].score = 30;
  endSyntheticTurn(s, 0);
  assert.deepEqual(neutralMarkerPositions(s), ['0:purple', '0:orange', '0:blue']);
  s.players[0].score = 31;
  endSyntheticTurn(s, 0);
  assert.deepEqual(neutralMarkerPositions(s), ['0:purple', '0:orange', '0:blue']);

  s.players[1].score = 30;
  endSyntheticTurn(s, 1);
  assert.deepEqual(neutralMarkerPositions(s), ['0:purple', '0:orange', '0:blue', '1:purple']);
  assert.equal(s.neutralMilestonesRemaining[30], 0);

  const fourPlayer = ready(4, 739);
  fourPlayer.players[0].score = 20;
  endSyntheticTurn(fourPlayer, 0);
  assert.deepEqual(neutralMarkerPositions(fourPlayer), [], 'four-player setup has no neutral-marker supply');
});

test('Research pays and rotates before exposing the physical tech-stack choice', () => {
  const s = ready(2, 743);
  const player = s.players[s.activeSeat];
  const stackId: SetiTechStackId = 'seti_tech_stack_probe_2';
  const energyTile = `${stackId}_tile_04`;
  forceTopTile(s, stackId, energyTile);
  player.publicity = 10;
  const solarBefore = solarSignature(s);
  const stackBefore = [...s.techStacks[stackId].tiles];

  act(s, player.seat, beginResearch());
  assert.equal(player.publicity, 4);
  assert.notEqual(solarSignature(s), solarBefore);
  assert.deepEqual(s.techStacks[stackId].tiles, stackBefore, 'no tile is selected during the initiating Research gesture');
  assert.equal(player.techs.length, 0);
  const decision = s.pending[0];
  assert.equal(decision?.kind, 'tech-stack');
  if (!decision || decision.kind !== 'tech-stack') assert.fail('missing post-rotation technology choice');
  assert.ok(decision.options.includes(stackId));
  const postRotation = solarSignature(s);

  act(s, player.seat, { type: 'choose', choice: { kind: 'tech-stack', stackId } });
  assert.equal(solarSignature(s), postRotation, 'choosing the stack must not rotate a second time');
  assert.equal(s.techStacks[stackId].tiles.length, stackBefore.length - 1);
  assert.ok(player.techs.some((tech) => tech.stackId === stackId && tech.tileId === energyTile));
});

test('Computer tech aligns to 0/1/3/5, replaces its top reward, unlocks lower, and Analyze clears both', () => {
  const s = ready(2, 751);
  const player = s.players[s.activeSeat];
  const stackId: SetiTechStackId = 'seti_tech_stack_computer_1';
  const energyTile = `${stackId}_tile_02`;
  forceTopTile(s, stackId, energyTile);
  player.publicity = 10;
  player.computer.top[3] = true;

  act(s, player.seat, beginResearch());
  act(s, player.seat, { type: 'choose', choice: { kind: 'tech-stack', stackId } });
  const slotDecision = s.pending[0];
  assert.equal(slotDecision?.kind, 'computer-tech-slot');
  if (!slotDecision || slotDecision.kind !== 'computer-tech-slot') assert.fail('missing computer slot choice');
  assert.deepEqual(slotDecision.options, [0, 1, 2, 3]);
  assert.deepEqual([...SETI_COMPUTER_TECH_TOP_SPACES], [0, 1, 3, 5]);
  const scoreBeforeInstall = player.score;
  act(s, player.seat, { type: 'choose', choice: { kind: 'number', value: 2 } });
  assert.equal(player.score, scoreBeforeInstall, 'installing below occupied top index 3 gives no retroactive 2 VP');
  assert.equal(player.techs.find((tech) => tech.stackId === stackId)?.computerSlot, 2);
  assert.equal(player.computer.tech[stackId]?.boardSlot, 2);

  player.computer.top.fill(false);
  player.dataPool = 6;
  const lowerSlot = SETI_RULES.computerTopSpaces + 2;
  const dataBeforeRejectedLower = player.dataPool;
  const rejected = applySetiAction(s, player.seat, { type: 'place_data', slot: lowerSlot });
  assert.equal(rejected.ok, false, 'lower space remains locked until aligned top index 3 is filled');
  assert.equal(player.dataPool, dataBeforeRejectedLower);

  for (const slot of [0, 1, 2]) act(s, player.seat, { type: 'place_data', slot });
  const scoreBeforeAlignedTop = player.score;
  act(s, player.seat, { type: 'place_data', slot: 3 });
  assert.equal(player.score, scoreBeforeAlignedTop + 2, 'computer tile replaces aligned top index 3 reward with 2 VP');

  const energyBeforeLower = player.energy;
  act(s, player.seat, { type: 'place_data', slot: lowerSlot });
  assert.equal(player.energy, energyBeforeLower + 1, 'lower space repeats the acquired tile\'s printed energy reward');
  assert.equal(player.computer.tech[stackId]?.lower, true);

  act(s, player.seat, { type: 'place_data', slot: 4 });
  player.dataPool = 1;
  act(s, player.seat, { type: 'place_data', slot: 5 });
  act(s, player.seat, { type: 'end_turn' });
  s.activeSeat = player.seat;
  s.projectRuntime.turn.seat = player.seat;
  s.mainActionTaken = false;
  act(s, player.seat, { type: 'analyze' });
  assert.ok(player.computer.top.every((filled) => !filled));
  assert.equal(player.computer.tech[stackId]?.lower, false, 'Analyze clears the lower computer-tech data token');
});

test('Ordinary alien cards can be tucked and exchanged; Exertians cannot', () => {
  const tuckState = ready(2, 757);
  const tuckPlayer = tuckState.players[tuckState.activeSeat];
  const ordinary = SETI_ALIEN_CARDS.find((card) => card.handRules === 'normal' && card.incomeCorner === 'credit');
  const exertian = SETI_ALIEN_CARDS.find((card) => card.handRules === 'exertian-separate');
  assert.ok(ordinary);
  assert.ok(exertian);
  tuckPlayer.alienHand.push(ordinary.id, exertian.id);
  tuckPlayer.credits = 5;
  tuckPlayer.energy = 5;
  const venus = getSetiBodyCells(tuckState).Venus;
  const probe = addProbeAt(tuckState, tuckPlayer, venus);
  act(tuckState, tuckPlayer.seat, { type: 'orbit', pieceId: probe, body: 'Venus' });
  const tuck = tuckState.pending[0];
  assert.equal(tuck?.kind, 'tuck-income-card');
  if (!tuck || tuck.kind !== 'tuck-income-card') assert.fail('Venus did not offer its income tuck');
  assert.ok(tuck.options.includes(ordinary.id));
  assert.ok(!tuck.options.includes(exertian.id));
  const rejectedTuck = applySetiAction(tuckState, tuckPlayer.seat, { type: 'choose', choice: { kind: 'card', cardId: exertian.id } });
  assert.equal(rejectedTuck.ok, false);
  const creditsBeforeTuck = tuckPlayer.credits;
  act(tuckState, tuckPlayer.seat, { type: 'choose', choice: { kind: 'card', cardId: ordinary.id } });
  assert.ok(!tuckPlayer.alienHand.includes(ordinary.id));
  assert.ok(tuckPlayer.alienIncomeCards.some((card) => card.cardId === ordinary.id));
  assert.equal(tuckPlayer.credits, creditsBeforeTuck + 1, 'alien income is gained immediately when tucked');

  const exchangeState = ready(2, 761);
  const exchangePlayer = exchangeState.players[exchangeState.activeSeat];
  const activeOrdinarySpecies = exchangeState.species.find((slot) => slot.speciesId !== 'exertians')!.speciesId;
  const exchangeAliens = SETI_ALIEN_CARDS.filter((card) => card.species === activeOrdinarySpecies && card.handRules === 'normal').slice(0, 3);
  assert.equal(exchangeAliens.length, 3);
  exchangePlayer.alienHand.push(...exchangeAliens.map((card) => card.id), exertian.id);
  const creditsBeforeExchange = exchangePlayer.credits;
  act(exchangeState, exchangePlayer.seat, {
    type: 'exchange', give: 'cards', receive: 'credit', cardIds: exchangeAliens.slice(0, 2).map((card) => card.id),
  });
  assert.equal(exchangePlayer.credits, creditsBeforeExchange + 1);
  assert.ok(exchangeAliens.slice(0, 2).every((card) => !exchangePlayer.alienHand.includes(card.id)));
  const alienDiscard = exchangeState.species.find((slot) => slot.speciesId === activeOrdinarySpecies)!.alienDiscard;
  assert.ok(exchangeAliens.slice(0, 2).every((card) => alienDiscard.includes(card.id)));

  const rejectSnapshot = JSON.stringify({
    credits: exchangePlayer.credits,
    alienHand: exchangePlayer.alienHand,
    alienDiscard,
    projectDiscard: exchangeState.projectDiscard,
  });
  const rejectedExchange = applySetiAction(exchangeState, exchangePlayer.seat, {
    type: 'exchange', give: 'cards', receive: 'credit', cardIds: [exchangeAliens[2].id, exertian.id],
  });
  assert.equal(rejectedExchange.ok, false);
  assert.equal(JSON.stringify({
    credits: exchangePlayer.credits,
    alienHand: exchangePlayer.alienHand,
    alienDiscard,
    projectDiscard: exchangeState.projectDiscard,
  }), rejectSnapshot, 'rejected Exertian exchange is atomic');
});

test('Public tech views reveal the top reward but redact every deeper tile', () => {
  const s = ready(2, 769);
  const stackId: SetiTechStackId = 'seti_tech_stack_computer_3';
  const privateOrder = [...s.techStacks[stackId].tiles];
  assert.equal(privateOrder.length, 4);
  const tv = setiViewFor(s, null);
  const seat = setiViewFor(s, 0);
  const tvStack = tv.techStacks.find((stack) => stack.id === stackId);
  const seatStack = seat.techStacks.find((stack) => stack.id === stackId);
  assert.ok(tvStack);
  assert.ok(seatStack);
  assert.equal(tvStack.topTileId, privateOrder[0]);
  assert.equal(seatStack.topTileId, privateOrder[0]);
  assert.equal('tiles' in tvStack, false, 'the public stack projection never includes its private order');
  const topDefinition = SETI_TECH_BY_ID[stackId].tiles.find((tile) => tile.id === tvStack.topTileId);
  assert.ok(topDefinition?.immediateReward.ops.length, 'the public top id resolves to its printed reward');
  const serialized = JSON.stringify(tv);
  for (const hiddenTile of privateOrder.slice(1)) {
    assert.equal(serialized.includes(hiddenTile), false, `public view leaked deeper tile ${hiddenTile}`);
  }
});

test('A free action resolves completely before another free action can begin', () => {
  const s = ready(2, 773);
  const player = s.players[s.activeSeat];
  player.computer.top = [true, true, true, false, false, false];
  player.dataPool = 2;
  player.publicity = 10;

  act(s, player.seat, { type: 'place_data', slot: 3 });
  assert.equal(s.pending[0]?.kind, 'tuck-income-card', 'the fourth computer space opens its physical income-card decision');
  const snapshot = JSON.stringify({ publicity: player.publicity, row: s.projectRow, pending: s.pending });
  const interrupted = applySetiAction(s, player.seat, { type: 'buy_card', source: 0 });
  assert.equal(interrupted.ok, false, 'a second free action cannot interrupt the first free action');
  assert.match(interrupted.error ?? '', /resolve the highlighted decision/i);
  assert.equal(JSON.stringify({ publicity: player.publicity, row: s.projectRow, pending: s.pending }), snapshot, 'the rejected interrupt is atomic');

  act(s, player.seat, { type: 'choose', choice: { kind: 'option', option: 'skip' } });
  assert.equal(s.pending.length, 0);
  act(s, player.seat, { type: 'buy_card', source: 0 });
});

test('Milestone and species resolution reject free actions until their physical decisions settle', () => {
  const milestone = ready(2, 779);
  const milestonePlayer = milestone.players[milestone.activeSeat];
  milestonePlayer.score = 25;
  milestonePlayer.energy = 5;
  const milestoneProbe = addProbeAt(milestone, milestonePlayer, getSetiBodyCells(milestone).Earth);
  endSyntheticTurn(milestone, milestonePlayer.seat);
  assert.equal(milestone.pending[0]?.kind, 'gold-tile');
  const blockedMove = applySetiAction(milestone, milestonePlayer.seat, {
    type: 'move', pieceId: milestoneProbe, to: 'seti_cell_r1s0', payment: { energy: 1 },
  });
  assert.equal(blockedMove.ok, false, 'free movement is unavailable during milestone resolution');

  const species = ready(2, 787);
  const slot = species.species[0];
  slot.discovery.purple = { owner: 0, sequence: ++species.markerSequence };
  slot.discovery.orange = { owner: 0, sequence: ++species.markerSequence };
  slot.discovery.blue = { owner: 0, sequence: ++species.markerSequence };
  species.pendingSpeciesDiscoveries.push(slot.slot);
  species.players[species.activeSeat].dataPool = 1;
  endSyntheticTurn(species, species.activeSeat);
  assert.equal(slot.revealed, true, 'the completed physical discovery row reveals its species');
  assert.ok(species.turnResolution || species.pending.length, 'species continuation remains serialized before the next turn');
  const blockedData = applySetiAction(species, species.activeSeat, { type: 'place_data', slot: 0 });
  assert.equal(blockedData.ok, false, 'free data placement is unavailable during species resolution');
});

test('Simultaneous milestones resolve current player clockwise and neutral markers resolve last', () => {
  const s = ready(3, 797);
  const current = 1;
  s.activeSeat = current;
  s.projectRuntime.turn.seat = current;
  for (const player of s.players) player.score = 25;

  endSyntheticTurn(s, current);
  const order: number[] = [];
  while (s.pending[0]?.kind === 'gold-tile') {
    const decision = s.pending[0];
    order.push(decision.owner);
    assert.deepEqual(neutralMarkerPositions(s), [], 'neutral markers wait until every player milestone is resolved');
    act(s, decision.owner, { type: 'choose', choice: { kind: 'gold-tile', tileId: decision.options[0] } });
  }
  assert.deepEqual(order, [1, 2, 0], 'player milestones resolve from the current player clockwise');
  assert.deepEqual(neutralMarkerPositions(s), ['0:purple'], 'the single three-player neutral marker resolves after all player choices');
});

test('A multi-move effect can split across probes and stop with movement remaining', () => {
  const s = ready(2, 809);
  const player = s.players[s.activeSeat];
  const cardId = 'seti_project_204565'; // Lightsail: four optional movements.
  removeProjectFromAllZones(s, cardId);
  player.hand.push(cardId);
  const first = addProbeAt(s, player, getSetiBodyCells(s).Earth);
  const second = addProbeAt(s, player, getSetiBodyCells(s).Mars);

  act(s, player.seat, { type: 'play_card', cardId });
  let decision = s.pending[0];
  assert.equal(decision?.kind, 'card-effect-choice');
  if (!decision || decision.kind !== 'card-effect-choice') assert.fail('missing first movement choice');
  assert.ok(decision.options.includes(first) && decision.options.includes(second) && decision.options.includes('skip'));

  act(s, player.seat, { type: 'choose', choice: { kind: 'option', option: first } });
  decision = s.pending[0];
  if (!decision || decision.kind !== 'card-effect-choice') assert.fail('missing first destination choice');
  const firstDestination = decision.options.find((option) => option !== 'skip');
  assert.ok(firstDestination);
  act(s, player.seat, { type: 'choose', choice: { kind: 'option', option: firstDestination } });

  decision = s.pending[0];
  if (!decision || decision.kind !== 'card-effect-choice') assert.fail('missing split movement piece choice');
  assert.ok(decision.options.includes(second), 'a different probe lifts for the next movement');
  act(s, player.seat, { type: 'choose', choice: { kind: 'option', option: second } });
  decision = s.pending[0];
  if (!decision || decision.kind !== 'card-effect-choice') assert.fail('missing second destination choice');
  const secondDestination = decision.options.find((option) => option !== 'skip');
  assert.ok(secondDestination);
  act(s, player.seat, { type: 'choose', choice: { kind: 'option', option: secondDestination } });

  decision = s.pending[0];
  assert.equal(decision?.kind, 'card-effect-choice');
  assert.ok(decision?.options.includes('skip'), 'the remaining two movements may be finished early');
  act(s, player.seat, { type: 'choose', choice: { kind: 'option', option: 'skip' } });
  assert.equal(s.projectRuntime.resolution, null);
  assert.equal(s.pending.length, 0);
  assert.equal(s.mainActionTaken, true);
});

if (failures.length) {
  console.error(`\n${failures.length} SETI core-flow test(s) failed; ${passed} passed.`);
  for (const failure of failures) console.error(`\n${failure}`);
  process.exitCode = 1;
} else {
  console.log(`SETI core flow: ${passed} directed tests passed.`);
}
