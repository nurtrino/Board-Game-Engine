import assert from 'node:assert/strict';
import {
  SETI_TYPED_ALIEN_CARDS,
  SETI_PROJECT_CATALOG_BY_ID,
  SETI_RIVAL_ACTION_BY_ID,
  SETI_RIVAL_ACTION_CARDS,
  SETI_RIVAL_OWNER,
  SETI_SOLO_DIFFICULTIES,
  SETI_SOLO_OBJECTIVES,
  SETI_SOLO_OBJECTIVE_BY_ID,
  advanceSetiRivalProgressState,
  afterSetiHumanTurn,
  applySetiAction,
  assertSetiState,
  chooseSetiBotAction,
  createSeti,
  earthSetiCell,
  onSetiSoloSpeciesRevealed,
  markSetiRivalSectorSignal,
  recordSetiSoloObjectiveEvent,
  resolveSetiSoloObjectiveChoice,
  rotateSetiSolarSystem,
  runSetiRivalTurn,
  scoreSetiSoloEndGame,
  setiViewFor,
  settleSetiRivalMilestones,
  type SetiKnownRewardOp,
  type SetiPlayer,
  type SetiSoloRuntimeAdapter,
  type SetiSpeciesModule,
  type SetiState,
} from '../index.js';

const humanRewards = (s: SetiState, player: SetiPlayer, rewards: readonly SetiKnownRewardOp[]): void => {
  for (const reward of rewards) {
    if (reward.kind === 'vp') player.score += reward.amount;
    else if (reward.kind === 'publicity') player.publicity = Math.min(10, player.publicity + reward.amount);
    else if (reward.kind === 'data') player.dataPool = Math.min(6, player.dataPool + reward.amount);
    else if (reward.kind === 'credit') player.credits += reward.amount;
    else if (reward.kind === 'energy') player.energy += reward.amount;
  }
};

const adapter: SetiSoloRuntimeAdapter = {
  rotateSolarSystem: rotateSetiSolarSystem,
  applyHumanRewardOps: humanRewards,
  emit() {},
};

function fresh(difficulty: 1 | 2 | 3 | 4 | 5, seed = 1000 + difficulty): SetiState {
  const s = createSeti([{ name: 'Human', color: 'Green' }], seed, { mode: 'solo', soloDifficulty: difficulty });
  s.pending = [];
  s.phase = 'playing';
  s.activeSeat = 0;
  s.mainActionTaken = false;
  s.players[0].passed = false;
  s.solo!.passed = false;
  return s;
}

function addRivalProbeAtEarth(s: SetiState): void {
  const cell = earthSetiCell(s);
  s.solar.pieces.push({
    id: `seti_rival_probe_test_${s.solar.nextPieceId++}`,
    owner: SETI_RIVAL_OWNER,
    kind: 'probe',
    cell,
    supportLayer: 1,
  });
}

function installSpecies(s: SetiState, speciesId: 'mascamites' | 'anomalies' | 'oumuamua' | 'centaurians' | 'exertians', module: SetiSpeciesModule): void {
  const slot = s.species[0];
  slot.speciesId = speciesId;
  slot.revealed = true;
  slot.module = module;
  slot.discovery = { purple: null, orange: null, blue: null };
  slot.research = [];
  slot.alienDeck = SETI_TYPED_ALIEN_CARDS.filter((card) => card.species === speciesId).map((card) => card.id);
  slot.alienFaceUp = null;
  slot.alienDiscard = [];
  onSetiSoloSpeciesRevealed(s, slot);
}

function forceRivalCard(s: SetiState, id: string): void {
  s.solo!.actionDeck = [id];
  s.solo!.actionDiscard = [];
  s.solo!.passed = false;
}

// Catalog completeness and exact printed setup composition.
assert.equal(SETI_RIVAL_ACTION_CARDS.length, 19);
assert.deepEqual(SETI_RIVAL_ACTION_CARDS.map((card) => card.printedId), Array.from({ length: 19 }, (_, index) => `S.${index + 1}`));
assert.deepEqual(
  SETI_RIVAL_ACTION_CARDS.map((card) => [card.printedId, card.group, card.arrow, ...card.steps.map((step) => step.kind)]),
  [
    ['S.1', 'basic', 'left', 'analyze', 'launch', 'research-tech', 'fly-orbit-land'],
    ['S.2', 'basic', 'right', 'analyze', 'research-tech', 'scan'],
    ['S.3', 'basic', 'left', 'replace-for-discovered-species', 'research-tech', 'scan'],
    ['S.4', 'basic', 'right', 'replace-for-discovered-species', 'fly-orbit-land', 'research-tech'],
    ['S.5', 'advanced', 'left', 'analyze', 'research-tech', 'scan'],
    ['S.6', 'advanced', 'left', 'research-tech', 'launch', 'scan'],
    ['S.7', 'advanced', 'right', 'research-tech', 'fly-orbit-land', 'scan'],
    ['S.8', 'advanced', 'left', 'analyze', 'fly-orbit-land', 'scan'],
    ['S.9', 'advanced', 'right', 'analyze', 'launch', 'fly-orbit-land'],
    ['S.10', 'advanced', 'right', 'analyze', 'launch', 'scan'],
    ['S.11', 'advanced', 'right', 'research-tech', 'analyze', 'scan'],
    ['S.12', 'advanced', 'left', 'research-tech', 'launch', 'fly-orbit-land'],
    ['S.13', 'advanced', 'left', 'fly-orbit-land', 'analyze', 'scan'],
    ['S.14', 'advanced', 'right', 'launch', 'research-tech', 'scan'],
    ['S.15', 'species', 'right', 'launch', 'fly-orbit-land'],
    ['S.16', 'species', 'left', 'anomalies', 'research-tech'],
    ['S.17', 'species', 'left', 'fly-orbit-land', 'scan'],
    ['S.18', 'species', 'right', 'centaurian-message', 'scan'],
    ['S.19', 'species', 'right', 'play-exertian', 'scan'],
  ],
);
assert.equal(SETI_SOLO_OBJECTIVES.length, 24);
assert.deepEqual([1, 2, 3].map((tier) => SETI_SOLO_OBJECTIVES.filter((objective) => objective.tier === tier).length), [4, 11, 9]);
assert.deepEqual(
  SETI_SOLO_DIFFICULTIES.map((setup) => [setup.difficulty, setup.randomAdvancedAtSetup, setup.objectiveCounts.tier1, setup.objectiveCounts.tier2, setup.objectiveCounts.tier3]),
  [[1, 0, 0, 0, 0], [2, 0, 2, 3, 5], [3, 1, 2, 4, 6], [4, 1, 2, 6, 7], [5, 1, 2, 7, 8]],
);

for (const difficulty of [1, 2, 3, 4, 5] as const) {
  const first = createSeti([{ name: 'Human', color: 'Green' }], 700 + difficulty, { mode: 'solo', soloDifficulty: difficulty });
  const second = createSeti([{ name: 'Human', color: 'Green' }], 700 + difficulty, { mode: 'solo', soloDifficulty: difficulty });
  assert.deepEqual(first, second, `difficulty ${difficulty} setup must be deterministic`);
  assert.equal(first.roundEndStacks.every((stack) => stack.length === 3), true, 'solo uses two-player round stacks');
  assert.equal(first.solo!.actionDeck.length, difficulty >= 3 ? 5 : 4);
  assert.equal(first.solo!.actionDeck.every((id) => SETI_RIVAL_ACTION_BY_ID[id].group !== 'species'), true);
  assert.equal(first.solo!.activeObjectives.length, difficulty === 1 ? 0 : 3);
  const setup = SETI_SOLO_DIFFICULTIES[difficulty - 1];
  assert.equal(first.solo!.activeObjectives.length + first.solo!.objectiveDeck.length,
    setup.objectiveCounts.tier1 + setup.objectiveCounts.tier2 + setup.objectiveCounts.tier3);
  assert.deepEqual([first.players[0].score, first.solo!.rivalScore].sort((a, b) => a - b), [1, 2]);
  assert.equal(first.solo!.rivalPublicity, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first, 'solo state must survive a JSON round trip');
  const publicView = JSON.stringify(setiViewFor(first, null));
  assert.equal(publicView.includes(first.solo!.actionDeck[0]), false, 'future rival action cards stay hidden');
  assert.equal(publicView.includes(first.solo!.advancedReserve[0] ?? '__none__'), false, 'advanced reserve order stays hidden');
}

// Crossing the progress-loop icon adds one random unused advanced card to the top.
{
  const s = fresh(3, 801);
  const before = s.solo!.advancedReserve.length;
  const distance = 12 - s.solo!.progress;
  advanceSetiRivalProgressState(s, distance);
  assert.equal(s.solo!.progress, 0);
  assert.equal(s.solo!.progressLoops, 1);
  assert.equal(s.solo!.advancedReserve.length, before - 1);
  assert.equal(SETI_RIVAL_ACTION_BY_ID[s.solo!.actionDeck[0]].group, 'advanced');
}

// Q50: a trigger can mark one objective and one triggerable mission independently.
{
  const s = fresh(2, 802);
  const objectiveId = 'seti_solo_objective_3_05';
  s.solo!.activeObjectives = [{ objectiveId, marked: [false, false, false] }];
  s.solo!.objectiveDeck = [];
  const missionId = Object.values(SETI_PROJECT_CATALOG_BY_ID).find((card) => card.canonicalName === 'ISS')!.id;
  s.players[0].missions = [missionId];
  const result = applySetiAction(s, 0, { type: 'launch' });
  assert.equal(result.ok, true);
  assert.equal(s.solo!.activeObjectives[0].marked[1], true, 'launch objective marks');
  assert.equal(s.pending.some((decision) => decision.kind === 'manual-trigger-choice'), true, 'launch mission independently offers a reward');
}

// One emitted trigger can still mark only one objective if several match.
{
  const s = fresh(2, 803);
  s.solo!.activeObjectives = [
    { objectiveId: 'seti_solo_objective_3_05', marked: [false, false, false] },
    { objectiveId: 'seti_solo_objective_3_08', marked: [false, false] },
  ];
  recordSetiSoloObjectiveEvent(s, { kind: 'main-action', action: 'launch' });
  const decision = s.pending.find((entry) => entry.kind === 'solo-objective-task');
  assert.ok(decision && decision.options.length === 2);
  assert.equal(resolveSetiSoloObjectiveChoice(s, decision.options[0]), null);
  assert.equal(s.solo!.activeObjectives.flatMap((entry) => entry.marked).filter(Boolean).length, 1);
}

// S.15 Mascamites: fly to Saturn/Jupiter and expose one random sample without its reward.
{
  const s = fresh(2, 815);
  s.solar.orientations.disc1 = 0;
  s.solar.orientations.disc3 = 2; // Earth and Saturn align for a bounded route.
  installSpecies(s, 'mascamites', {
    kind: 'mascamites',
    samplesAtJupiter: ['seti_mascamite_sample_1', 'seti_mascamite_sample_2', 'seti_mascamite_sample_3'],
    samplesAtSaturn: ['seti_mascamite_sample_4', 'seti_mascamite_sample_5', 'seti_mascamite_sample_6'],
    revealedBlueSample: 'seti_mascamite_sample_7',
    capsulesDelivered: [],
  });
  addRivalProbeAtEarth(s);
  s.solo!.techs.probe = ['seti_solo_test_probe_tech'];
  forceRivalCard(s, 'seti_solo_action_s15');
  const result = runSetiRivalTurn(s, adapter);
  assert.equal(result.cardId, 'seti_solo_action_s15');
  assert.equal(s.solo!.techs.probe.length, 0, 'S.15 spends probe tech to prefer an open moon');
  const module = s.species[0].module!;
  assert.equal(module.kind, 'mascamites');
  if (module.kind === 'mascamites') assert.equal(module.capsulesDelivered.length, 1);
  assert.equal(s.solar.pieces.some((piece) => piece.owner === SETI_RIVAL_OWNER), false);
  assert.equal(Object.values(s.planets).some((planet) => planet.orbiters.includes(SETI_RIVAL_OWNER) || planet.landers.includes(SETI_RIVAL_OWNER)), true);
}

// S.16 Anomalies: if not winning the next anomaly, mark its lowest space and gain 3 VP.
{
  const s = fresh(2, 816);
  const earth = Number(earthSetiCell(s).slice(-1));
  installSpecies(s, 'anomalies', {
    kind: 'anomalies',
    anomalies: [1, 3, 5].map((offset, index) => ({ id: `seti_anomaly_${index + 1}`, sector: (earth + offset) % 8, side: 0 as const })),
    triggerCount: 0,
  });
  const before = s.solo!.rivalScore;
  forceRivalCard(s, 'seti_solo_action_s16');
  runSetiRivalTurn(s, adapter);
  assert.equal(s.species[0].research.some((marker) => marker.owner === SETI_RIVAL_OWNER), true);
  assert.ok(s.solo!.rivalScore >= before + 3);
}

// S.17 / Q51: the special signal always uses the Oumuamua tile; ordinary signals never do.
{
  const s = fresh(2, 817);
  installSpecies(s, 'oumuamua', {
    kind: 'oumuamua',
    cell: `seti_cell_r2s${earthSetiCell(s).slice(-1)}` as const,
    dataRemaining: 3,
    signals: [],
    exofossils: { [SETI_RIVAL_OWNER]: 0, 0: 0 },
  });
  forceRivalCard(s, 'seti_solo_action_s17');
  runSetiRivalTurn(s, adapter); // no Earth probe, so the printed Scan is selected
  const module = s.species[0].module!;
  assert.equal(module.kind, 'oumuamua');
  if (module.kind === 'oumuamua') {
    assert.equal(module.signals.length, 1);
    assert.equal(module.signals[0].owner, SETI_RIVAL_OWNER);
    assert.equal(module.dataRemaining, 2);
  }
}

// The printed 2 VP belongs to the second signal in a sector globally, not the
// rival's second personal marker.
{
  const s = fresh(1, 821);
  const sectorId = s.sectorOrder[0];
  const sector = s.sectors[sectorId];
  sector.signals = [{ owner: 0, sequence: ++s.markerSequence, excess: false }];
  sector.dataRemaining = sector.capacity - 1;
  const before = s.solo!.rivalScore;
  markSetiRivalSectorSignal(s, sectorId, adapter);
  assert.equal(s.solo!.rivalScore, before + 2);
}

// S.18 Centaurians: only one message can be on the score track and it starts +15.
{
  const s = fresh(2, 818);
  installSpecies(s, 'centaurians', {
    kind: 'centaurians',
    messageMilestones: { 0: [s.players[0].score + 15] },
    messageQueue: { 0: ['seti_centaurian_board_message'] },
    claimedRewards: [],
  });
  const beforeProgress = s.solo!.progress;
  const beforeScore = s.solo!.rivalScore;
  forceRivalCard(s, 'seti_solo_action_s18');
  runSetiRivalTurn(s, adapter);
  assert.equal(s.solo!.centaurianMessageTarget, beforeScore + 15);
  assert.equal(s.solo!.progress, (beforeProgress + 1) % 12);
  assert.equal(s.solo!.centaurianMessagesReserve, 2);
}

// S.19 Exertians: draw/play only via the species action and all played cards score.
{
  const s = fresh(1, 819);
  installSpecies(s, 'exertians', {
    kind: 'exertians', milestones: [20, 40], dangerBySeat: { 0: 0, [SETI_RIVAL_OWNER]: 0 }, resolvedMilestones: { 0: [false, false] },
  });
  const deckBefore = s.species[0].alienDeck.length;
  forceRivalCard(s, 'seti_solo_action_s19');
  runSetiRivalTurn(s, adapter);
  assert.equal(s.solo!.exertianCards.length, 1);
  assert.equal(s.species[0].alienDeck.length, deckBefore - 1);
  const card = SETI_TYPED_ALIEN_CARDS.find((entry) => entry.id === s.solo!.exertianCards[0])!;
  const before = s.solo!.rivalScore;
  scoreSetiSoloEndGame(s);
  const fulfilled = before + (card.exertian?.victoryPoints ?? 0);
  assert.equal(s.solo!.rivalScore, fulfilled - Math.floor(fulfilled / 10), 'played card scores fully before the danger penalty');
}

// S.3 replaces itself permanently with the first discovered species card.
{
  const s = fresh(1, 820);
  installSpecies(s, 'exertians', {
    kind: 'exertians', milestones: [20, 40], dangerBySeat: { 0: 0, [SETI_RIVAL_OWNER]: 0 }, resolvedMilestones: { 0: [false, false] },
  });
  s.solo!.discoveredSpeciesInOrder = ['exertians'];
  forceRivalCard(s, 'seti_solo_action_s03');
  const result = runSetiRivalTurn(s, adapter);
  assert.equal(result.cardId, 'seti_solo_action_s19');
  assert.equal(s.solo!.removedActionCards.includes('seti_solo_action_s03'), true);
  assert.equal(s.solo!.actionDiscard.includes('seti_solo_action_s19'), true);
}

// Q49: rival takes only an unoccupied first gold space and never scores gold.
{
  const s = fresh(1, 849);
  const firstTile = s.goldTiles[0].id;
  s.players[0].goldClaims.push({ threshold: 25, tileId: firstTile });
  s.solo!.rivalScore = 25;
  s.solo!.currentDecisionArrow = 'left';
  settleSetiRivalMilestones(s, adapter);
  assert.equal(s.solo!.goldClaims.length, 1);
  assert.notEqual(s.solo!.goldClaims[0].tileId, firstTile);
  const before = s.solo!.rivalScore;
  scoreSetiSoloEndGame(s);
  assert.equal(s.solo!.rivalScore, before, 'gold claims are blocking markers only for the rival');
}

// Q48: no income. Passing grants exactly the one printed round-end card progress.
{
  const s = fresh(1, 848);
  s.players[0].hand = s.players[0].hand.slice(0, 4);
  s.solo!.rivalStartsRound = true; // alternates to human for round 2; no automatic opening action
  s.solo!.actionDeck = [];
  s.solo!.actionDiscard = ['seti_solo_action_s01'];
  const before = {
    score: s.solo!.rivalScore,
    publicity: s.solo!.rivalPublicity,
    data: s.solo!.dataPool,
    progress: s.solo!.progress,
  };
  const roundCardsBeforePass = s.roundEndStacks[0].length;
  assert.equal(applySetiAction(s, 0, { type: 'pass' }).ok, true);
  assert.equal(s.deferredEndRoundCard?.owner, 0, 'human round-card choice remains privately deferred');
  assert.equal(s.solo!.passed, false, 'rival waits before its automatic passing card removal');
  assert.equal(s.roundEndStacks[0].length, roundCardsBeforePass, 'rival cannot remove a card ahead of the earlier passer');
  while (s.pending.length || s.deferredEndRoundCard) {
    const action = chooseSetiBotAction(s, 0);
    assert.ok(action);
    const result = applySetiAction(s, 0, action);
    assert.equal(result.ok, true, result.error);
  }
  assert.equal(s.round, 2);
  assert.equal(s.solo!.rivalScore, before.score);
  assert.equal(s.solo!.rivalPublicity, before.publicity);
  assert.equal(s.solo!.dataPool, before.data);
  assert.equal(s.solo!.progress, (before.progress + 1) % 12);
}

// Seeded D1-D5 pass-through games exercise strengthening, alternating starts,
// objective penalties, automatic rival turns, and strict solo end conditions.
for (const difficulty of [1, 2, 3, 4, 5] as const) {
  const s = createSeti([{ name: 'Human', color: 'Green' }], 9000 + difficulty, { mode: 'solo', soloDifficulty: difficulty });
  const replay = createSeti([{ name: 'Human', color: 'Green' }], 9000 + difficulty, { mode: 'solo', soloDifficulty: difficulty });
  const setupTv = setiViewFor(s, null);
  assert.equal(setupTv.players[0].hand, undefined, `difficulty ${difficulty}: TV redacts the human hand`);
  assert.equal(setupTv.species.every((slot) => slot.speciesId === null), true, `difficulty ${difficulty}: TV redacts hidden species`);
  assert.notEqual(setiViewFor(s, 0).players[0].hand, undefined, `difficulty ${difficulty}: human receives the private hand`);
  const starterByRound = new Map<number, boolean>();
  let guard = 0;
  while (s.phase !== 'ended' && guard++ < 500) {
    assert.equal(JSON.stringify(replay), JSON.stringify(s), `difficulty ${difficulty}: replay matches before action ${guard}`);
    starterByRound.set(s.round, s.solo!.rivalStartsRound);
    assertSetiState(s);
    const conservedRivalCards = new Set([
      ...s.solo!.actionDeck.filter((id) => SETI_RIVAL_ACTION_BY_ID[id]?.group !== 'species'),
      ...s.solo!.actionDiscard.filter((id) => SETI_RIVAL_ACTION_BY_ID[id]?.group !== 'species'),
      ...s.solo!.advancedReserve,
      ...s.solo!.removedActionCards,
    ]);
    assert.equal(conservedRivalCards.size, 14, `difficulty ${difficulty}: all basic/advanced rival cards are conserved`);
    const pending = s.pending[0] ?? s.deferredEndRoundCard;
    const replayPending = replay.pending[0] ?? replay.deferredEndRoundCard;
    const action = pending ? chooseSetiBotAction(s, 0) : { type: 'pass' as const };
    const replayAction = replayPending ? chooseSetiBotAction(replay, 0) : { type: 'pass' as const };
    assert.ok(action, `difficulty ${difficulty}: pending ${pending?.kind ?? 'pass'} must be resolvable`);
    assert.ok(replayAction, `difficulty ${difficulty}: replay action must exist`);
    assert.equal(JSON.stringify(replayAction), JSON.stringify(action), `difficulty ${difficulty}: deterministic action ${guard}`);
    const result = applySetiAction(s, 0, action);
    const replayResult = applySetiAction(replay, 0, replayAction);
    assert.equal(result.ok, true, `difficulty ${difficulty}: ${result.error ?? 'action failed'}`);
    assert.equal(replayResult.ok, true, `difficulty ${difficulty}: replay ${replayResult.error ?? 'action failed'}`);
    assert.equal(JSON.stringify(replay), JSON.stringify(s), `difficulty ${difficulty}: replay matches after action ${guard}`);
  }
  assert.ok(guard < 500, `difficulty ${difficulty}: seeded game must terminate`);
  assert.equal(s.phase, 'ended');
  assert.equal(s.round, 5);
  assert.equal(s.players[0].finalScore !== null, true);
  assert.equal(Number.isFinite(s.solo!.rivalScore), true);
  assert.equal(starterByRound.size, 5);
  const restored = JSON.parse(JSON.stringify(s)) as SetiState;
  assertSetiState(restored);
  assert.equal(JSON.stringify(restored), JSON.stringify(s), `difficulty ${difficulty}: final state survives JSON round trip`);
  const starters = [...starterByRound.values()];
  for (let index = 1; index < starters.length; index++) assert.notEqual(starters[index], starters[index - 1], 'starting marker alternates each round');
}

assert.ok(SETI_SOLO_OBJECTIVE_BY_ID.seti_solo_objective_1_02);
void afterSetiHumanTurn;
console.log('seti solo runtime: ok');
