import {
  SETI_ALIEN_CARDS_BY_CARD_ID,
  SETI_ALIEN_CARDS_BY_ID,
  type SetiAlienSpeciesId,
} from './alienCatalog.js';
import {
  applySetiOumuamuaLandingReward,
  deliverSetiMascamiteSample,
  onSetiAlienSpeciesRevealed,
  playSetiAlienCard,
  queueSetiAlienMilestone,
  resolveSetiAlienResearchSpace,
  resolveSetiAlienRotation,
  resolveSetiAlienChoice,
  routeSetiSignalThroughOumuamua,
  scoreSetiAlienEndgame,
  settleSetiAlienAutomaticContinuations,
  type SetiAlienRuntimeHooks,
} from './alienRuntime.js';
import { applySetiAction } from './actions.js';
import { SETI_SEATS, adjacentSetiCells, parseSetiCell, setiCellId, type SetiSectorId } from './data.js';
import {
  bodyAtSetiCell,
  createSeti,
  earthSetiCell,
  getSetiBodyCells,
  setiSupportLayerForCell,
  setiViewFor,
  type SetiPendingDecision,
  type SetiSpeciesModule,
  type SetiSpeciesSlotState,
  type SetiState,
} from './state.js';

let passed = 0;
const failures: string[] = [];

function ok(value: unknown, message: string): void {
  if (value) passed++;
  else failures.push(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  ok(Object.is(actual, expected), `${message} (got ${String(actual)}, expected ${String(expected)})`);
}

function game(players = 2, seed = 711): SetiState {
  const s = createSeti(SETI_SEATS.slice(0, players).map((color, index) => ({ name: `Alien ${index + 1}`, color })), seed, { mode: players === 1 ? 'solo' : 'multiplayer' });
  s.pending = [];
  s.phase = 'playing';
  s.activeSeat = 0;
  s.startingSeat = 0;
  s.mainActionTaken = false;
  return s;
}

function moduleFor(s: SetiState, species: SetiAlienSpeciesId): SetiSpeciesModule {
  if (species === 'mascamites') return {
    kind: 'mascamites',
    samplesAtJupiter: ['seti_mascamite_sample_1', 'seti_mascamite_sample_2', 'seti_mascamite_sample_3'],
    samplesAtSaturn: ['seti_mascamite_sample_4', 'seti_mascamite_sample_5', 'seti_mascamite_sample_6'],
    revealedBlueSample: 'seti_mascamite_sample_7',
    capsulesDelivered: [],
  };
  if (species === 'anomalies') return {
    kind: 'anomalies',
    anomalies: [0, 3, 5].map((sector, index) => ({ id: `seti_anomaly_${index + 1}`, sector, side: 0 as const })),
    triggerCount: 0,
  };
  if (species === 'oumuamua') return {
    kind: 'oumuamua',
    cell: setiCellId(2, 5 + s.solar.orientations.disc3),
    dataRemaining: 3,
    signals: [],
    exofossils: Object.fromEntries(s.players.map((player) => [player.seat, 0])),
  };
  if (species === 'centaurians') return {
    kind: 'centaurians',
    messageMilestones: Object.fromEntries(s.players.map((player) => [player.seat, [player.score + 15]])),
    messageQueue: Object.fromEntries(s.players.map((player) => [player.seat, ['seti_centaurian_board_message']])),
    claimedRewards: [],
  };
  const leader = Math.max(...s.players.map((player) => player.score));
  return {
    kind: 'exertians', milestones: [leader + 20, leader + 40],
    dangerBySeat: Object.fromEntries(s.players.map((player) => [player.seat, 0])),
    resolvedMilestones: Object.fromEntries(s.players.map((player) => [player.seat, [false, false] as [boolean, boolean]])),
  };
}

function forceSpecies(s: SetiState, species: SetiAlienSpeciesId, slotIndex: 0 | 1 = 0): SetiSpeciesSlotState {
  const slot: SetiSpeciesSlotState = {
    slot: slotIndex,
    speciesId: species,
    revealed: true,
    discovery: { purple: null, orange: null, blue: null },
    research: [],
    alienDeck: Object.values(SETI_ALIEN_CARDS_BY_ID).filter((card) => card.species === species).map((card) => card.id),
    alienFaceUp: null,
    alienDiscard: [],
    module: moduleFor(s, species),
  };
  s.species[slotIndex] = slot;
  return slot;
}

const hooks: SetiAlienRuntimeHooks = {
  rotateSolarSystem: () => undefined,
  markSectorSignal: (s, seat, sectorId) => {
    const sector = s.sectors[sectorId];
    s.markerSequence++;
    sector.signals.push({ owner: seat, sequence: s.markerSequence, excess: false });
  },
  settleCompletedSectors: () => undefined,
};

function resolveRuntimeChoice(s: SetiState, decision: SetiPendingDecision, option: string): void {
  const player = s.players[decision.owner];
  const result = resolveSetiAlienChoice(s, player, decision, option, hooks);
  ok(result.handled && !result.error, `alien choice ${decision.kind}/${option} resolves: ${result.error ?? 'ok'}`);
  s.pending.shift();
  settleSetiAlienAutomaticContinuations(s, hooks);
}

function resolveSignal(s: SetiState, sectorId: SetiSectorId): void {
  const decision = s.pending[0];
  ok(decision?.kind === 'signal-sector', 'a signal decision is pending');
  if (!decision || decision.kind !== 'signal-sector') return;
  const player = s.players[decision.owner];
  if (!routeSetiSignalThroughOumuamua(s, player, sectorId, decision.alienCardId ?? '')) hooks.markSectorSignal(s, player.seat, sectorId);
  s.pending.shift();
  settleSetiAlienAutomaticContinuations(s, hooks);
}

// The signal is placed before Amazing Uncertainty counts anomaly-sector signals.
{
  const s = game();
  const slot = forceSpecies(s, 'anomalies');
  const player = s.players[0];
  const card = SETI_ALIEN_CARDS_BY_CARD_ID[203900];
  player.alienHand.push(card.id);
  player.credits = 5;
  const target = s.sectorOrder[2];
  if (slot.module?.kind === 'anomalies') slot.module.anomalies[0].sector = 2;
  const before = player.score;
  equal(playSetiAlienCard(s, player, card.id, hooks), null, 'Amazing Uncertainty can be played');
  settleSetiAlienAutomaticContinuations(s, hooks);
  resolveSignal(s, target);
  equal(player.score, before + 1, 'newly placed anomaly-sector signal scores immediately');
  ok(slot.alienDiscard.includes(card.id), 'ordinary alien card discards after its entire effect');
}

// Designer ruling: an alien mission remains out of play until both Scan signals,
// including the nested Oumuamua tile destination, have fully resolved.
{
  const s = game();
  const slot = forceSpecies(s, 'oumuamua');
  const player = s.players[0];
  const card = SETI_ALIEN_CARDS_BY_CARD_ID[203700];
  player.alienHand.push(card.id);
  player.credits = 5;
  equal(playSetiAlienCard(s, player, card.id, hooks), null, 'Altered Trajectory can be played');
  settleSetiAlienAutomaticContinuations(s, hooks);
  ok(!player.alienMissions.includes(card.id), 'mission is inactive while Scan is unresolved');
  const first = s.pending[0];
  if (first?.kind === 'signal-sector') resolveSignal(s, first.options[0]);
  ok(!player.alienMissions.includes(card.id), 'mission is inactive after only one Scan signal');
  const second = s.pending.find((decision) => decision.kind === 'signal-sector');
  if (second?.kind === 'signal-sector' && slot.module?.kind === 'oumuamua') {
    const sector = s.sectorOrder[parseSetiCell(slot.module.cell).sector];
    resolveSignal(s, sector);
  }
  const destination = s.pending[0];
  if (destination?.kind === 'card-effect-choice') resolveRuntimeChoice(s, destination, destination.options.find((option) => option.startsWith('tile:'))!);
  equal(slot.module?.kind === 'oumuamua' ? slot.module.signals.length : -1, 1, 'Scan can place a signal on the Oumuamua tile');
  equal(slot.module?.kind === 'oumuamua' ? slot.module.exofossils[player.seat] : -1, 1, 'Altered Trajectory gains its exofossil once');
  ok(player.alienMissions.includes(card.id), 'mission activates only after the full Scan effect');
}

// Movement, landing, sample pickup, and delivery are one visual piece flow.
{
  const s = game();
  const slot = forceSpecies(s, 'mascamites');
  const player = s.players[0];
  const card = SETI_ALIEN_CARDS_BY_CARD_ID[203803];
  const jupiter = getSetiBodyCells(s).Jupiter!;
  const start = adjacentSetiCells(jupiter)[0];
  s.solar.pieces.push({ id: 'sample-probe', owner: player.seat, kind: 'probe', cell: start, supportLayer: setiSupportLayerForCell(s, start) });
  player.alienHand.push(card.id);
  player.credits = 5;
  player.publicity = 0;
  equal(playSetiAlienCard(s, player, card.id, hooks), null, 'First Contact can be played');
  settleSetiAlienAutomaticContinuations(s, hooks);
  let decision = s.pending[0];
  if (decision?.kind === 'card-effect-choice') {
    const move = decision.options.find((option) => option.includes(`|${jupiter}|`));
    ok(!!move, 'movement exposes the adjacent Jupiter cell');
    if (move) resolveRuntimeChoice(s, decision, move);
  }
  decision = s.pending[0];
  if (decision?.kind === 'card-effect-choice') {
    const land = decision.options.find((option) => option.startsWith('land|'));
    ok(!!land, 'the moved probe itself exposes a landing gesture');
    if (land) resolveRuntimeChoice(s, decision, land);
  }
  while (s.pending[0]?.kind === 'trace-space') {
    const trace = s.pending.shift() as Extract<SetiPendingDecision, { kind: 'trace-space' }>;
    player.traceMarkers.push({ color: trace.color, speciesSlot: slot.slot, spaceId: trace.options[0], overflow: false });
    settleSetiAlienAutomaticContinuations(s, hooks);
  }
  ok(!player.alienMissions.includes(card.id), 'delivery mission waits for sample pickup choice');
  decision = s.pending[0];
  if (decision?.kind === 'card-effect-choice') resolveRuntimeChoice(s, decision, decision.options[0]);
  const capsule = s.solar.pieces.find((piece) => piece.owner === player.seat && piece.kind === 'capsule');
  ok(!!capsule?.sampleId, 'landing turns the selected sample into a movable capsule');
  ok(player.alienMissions.includes(card.id), 'delivery mission activates after sample pickup');
  if (capsule) {
    capsule.cell = earthSetiCell(s);
    capsule.supportLayer = setiSupportLayerForCell(s, capsule.cell);
    equal(bodyAtSetiCell(s, capsule.cell), 'Earth', 'sample capsule reaches Earth');
    equal(deliverSetiMascamiteSample(s, player, capsule.id, card.id, hooks), null, 'touching the capsule on Earth delivers it');
  }
  ok(player.completedAlienMissions.includes(card.id), 'delivery completes the mission');
  equal(slot.module?.kind === 'mascamites' ? slot.module.capsulesDelivered.length : -1, 1, 'delivered sample unlocks its blue research space');
  equal(player.dataPool, 4, 'Jupiter first-landing data and First Contact delivery data both resolve');
  equal(player.publicity, 4, 'Jupiter visit publicity and the revealed sample reward are both gained');
}

// Oumuamua planet landing is a typed 10 VP + exofossil reward.
{
  const s = game();
  const slot = forceSpecies(s, 'oumuamua');
  const player = s.players[0];
  const before = player.score;
  applySetiOumuamuaLandingReward(s, player);
  equal(player.score, before + 10, 'Oumuamua landing scores 10 VP');
  equal(slot.module?.kind === 'oumuamua' ? slot.module.exofossils[player.seat] : -1, 1, 'Oumuamua landing grants 1 exofossil');
}

// A real Orbit action on Oumuamua serializes its sector-or-tile signal before
// the physical income tuck, and both choices change the authoritative state.
{
  const s = game();
  const slot = forceSpecies(s, 'oumuamua');
  const player = s.players[0];
  const cell = slot.module?.kind === 'oumuamua' ? slot.module.cell : earthSetiCell(s);
  const pieceId = 'oumuamua-orbit-probe';
  s.solar.pieces.push({ id: pieceId, owner: player.seat, kind: 'probe', cell, supportLayer: setiSupportLayerForCell(s, cell) });
  player.credits = 5;
  player.energy = 5;
  const tuckCardId = player.hand[0];
  const sector = s.sectorOrder[parseSetiCell(cell).sector];
  const signalsBefore = s.sectors[sector].signals.length;
  const incomeBefore = player.incomeCards.length;
  const orbited = applySetiAction(s, player.seat, { type: 'orbit', pieceId, body: 'Oumuamua' });
  ok(orbited.ok, `Oumuamua Orbit action resolves (${orbited.error ?? 'ok'})`);
  equal(s.pending[0]?.kind, 'card-effect-choice', 'Oumuamua Orbit first exposes its physical signal destination');
  const signal = s.pending[0];
  if (signal?.kind === 'card-effect-choice') resolveRuntimeChoice(s, signal, `sector:${sector}`);
  equal(s.sectors[sector].signals.length, signalsBefore + 1, 'Oumuamua Orbit places exactly one signal in the chosen sector');
  const tuck = s.pending[0];
  equal(tuck?.kind, 'card-effect-choice', 'Oumuamua Orbit then exposes the real income-card tuck');
  if (tuck?.kind === 'card-effect-choice') resolveRuntimeChoice(s, tuck, tuckCardId);
  equal(player.incomeCards.length, incomeBefore + 1, 'Oumuamua Orbit tucks exactly one selected card for income');
}

// Rotation rewards the highest marked trace in the Earth-aligned anomaly
// column; an empty column pays nobody and a later repeatable-top marker wins.
{
  const s = game();
  const slot = forceSpecies(s, 'anomalies');
  const module = slot.module;
  const earthSector = parseSetiCell(getSetiBodyCells(s).Earth!).sector;
  if (module?.kind === 'anomalies') module.anomalies[0] = { ...module.anomalies[0], sector: earthSector, side: 0 };
  slot.research.push(
    { owner: 0, color: 'purple', spaceId: `seti_species_${slot.slot}_research_anomalies_purple_2`, sequence: 1, overflow: false },
    { owner: 1, color: 'purple', spaceId: `seti_species_${slot.slot}_research_anomalies_purple_1`, sequence: 2, overflow: false },
  );
  const credits = s.players.map((player) => player.credits);
  resolveSetiAlienRotation(s, hooks);
  equal(s.players[0].credits, credits[0], 'a lower anomaly marker receives no reward');
  equal(s.players[1].credits, credits[1] + 1, 'the highest anomaly marker receives the aligned token reward');

  slot.research.push({ owner: 0, color: 'purple', spaceId: `seti_species_${slot.slot}_research_anomalies_purple_1`, sequence: 3, overflow: false });
  resolveSetiAlienRotation(s, hooks);
  equal(s.players[0].credits, credits[0] + 1, 'the later marker on the repeatable top space ranks highest');

  slot.research = [];
  const emptyCredits = s.players.map((player) => player.credits);
  resolveSetiAlienRotation(s, hooks);
  equal(s.players[0].credits, emptyCredits[0], 'an empty aligned anomaly column pays no reward');
  equal(s.players[1].credits, emptyCredits[1], 'an empty aligned anomaly column changes no opponent resources');
}

// The initial Centaurian message covers one globally exclusive board reward.
{
  const s = game();
  const slot = forceSpecies(s, 'centaurians');
  const player = s.players[0];
  if (slot.module?.kind === 'centaurians') player.score = slot.module.messageMilestones[player.seat][0];
  ok(queueSetiAlienMilestone(s, player.seat, hooks), 'crossed Centaurian message queues a reward');
  const decision = s.pending[0];
  if (decision?.kind === 'centaurian-reward') resolveRuntimeChoice(s, decision, 'reward:3');
  equal(player.score, 24, '8 VP Centaurian board reward resolves');
  ok(slot.module?.kind === 'centaurians' && slot.module.claimedRewards.includes('reward:3'), 'Centaurian board reward is covered globally');
}

// Multiple Centaurian messages resolve oldest-first. Board payments consume
// only pool data, while the repeatable top space remains legal after marking.
{
  const s = game();
  const slot = forceSpecies(s, 'centaurians');
  const player = s.players[0];
  const messageCards = [SETI_ALIEN_CARDS_BY_CARD_ID[203502], SETI_ALIEN_CARDS_BY_CARD_ID[203504]];
  equal(messageCards.length, 2, 'two Centaurian message cards are available for queue-order coverage');
  if (slot.module?.kind === 'centaurians') {
    slot.module.messageMilestones[player.seat] = [10, 20];
    slot.module.messageQueue[player.seat] = messageCards.map((card) => card.id);
  }
  player.score = 20;
  ok(queueSetiAlienMilestone(s, player.seat, hooks), 'the oldest crossed Centaurian message queues first');
  equal(slot.module?.kind === 'centaurians' ? slot.module.messageQueue[player.seat][0] : null, messageCards[1]?.id, 'the newer message remains at the front after the oldest is consumed');
  let messageReward = s.pending[0];
  if (messageReward?.kind === 'centaurian-reward') resolveRuntimeChoice(s, messageReward, 'reward:3');
  ok(queueSetiAlienMilestone(s, player.seat, hooks), 'the second already-crossed message queues immediately afterward');
  messageReward = s.pending[0];
  ok(messageReward?.kind === 'centaurian-reward' && !messageReward.options.includes('reward:3'), 'the globally claimed reward is unavailable to the next message');
  if (messageReward?.kind === 'centaurian-reward') resolveRuntimeChoice(s, messageReward, 'reward:2');

  const target = `seti_species_${slot.slot}_research_centaurians_purple_1`;
  player.computer.top[0] = true;
  player.dataPool = 0;
  const scoreBefore = player.score;
  equal(resolveSetiAlienResearchSpace(s, player, slot, target, hooks), 'Not enough data in your pool', 'computer-board data cannot pay a Centaurian space');
  equal(player.score, scoreBefore, 'a rejected computer-data payment is atomic');
  player.dataPool = 2;
  equal(resolveSetiAlienResearchSpace(s, player, slot, target, hooks), null, 'one pool data pays the repeatable Centaurian space');
  slot.research.push({ owner: player.seat, color: 'purple', spaceId: target, sequence: ++s.markerSequence, overflow: false });
  equal(resolveSetiAlienResearchSpace(s, player, slot, target, hooks), null, 'the marked top Centaurian space remains repeatable');
  equal(player.dataPool, 0, 'each repeatable use consumes one pool data');
  equal(player.score, scoreBefore + 12, 'both repeatable payments grant their printed 6 VP');
}

// Human Exertian reveal deals private cards, gives discovery owners an
// immediate optional face-down play, then enforces the free/paid milestones.
{
  const s = game(2);
  const slot = forceSpecies(s, 'exertians');
  slot.discovery.purple = { owner: 0, sequence: ++s.markerSequence };
  const player = s.players[0];
  const other = s.players[1];
  onSetiAlienSpeciesRevealed(s, slot);
  equal(player.alienHand.length, 4, 'the discovery owner receives three Exertians plus one discovery bonus');
  equal(other.alienHand.length, 3, 'every other human receives the private three-card deal');
  const ownerView = setiViewFor(s, player.seat);
  const otherView = setiViewFor(s, other.seat);
  ok((ownerView.players[player.seat].alienHand?.length ?? 0) === 4, 'the owner sees authentic Exertian card identities');
  equal(otherView.players[player.seat].alienHand, undefined, 'opponents receive no Exertian hand identities');
  equal(otherView.players[player.seat].alienHandCount, 4, 'opponents see only the public card-back count');

  let exertian = s.pending[0];
  equal(exertian?.kind, 'exertian-card', 'the discovery bonus offers an immediate optional face-down play');
  const immediate = exertian?.kind === 'exertian-card' ? exertian.options.find((option) => option !== 'skip') : undefined;
  if (exertian?.kind === 'exertian-card' && immediate) resolveRuntimeChoice(s, exertian, immediate);
  equal(player.hiddenExertian.length, 1, 'the chosen discovery-bonus card becomes a private face-down Exertian');
  equal(setiViewFor(s, other.seat).players[player.seat].hiddenExertian, undefined, 'the face-down Exertian identity remains private');

  if (slot.module?.kind === 'exertians') slot.module.milestones = [20, 40];
  player.score = 20;
  player.credits = 0;
  ok(queueSetiAlienMilestone(s, player.seat, hooks), 'the first Exertian milestone queues');
  exertian = s.pending[0];
  ok(exertian?.kind === 'exertian-card' && exertian.options.some((option) => option.startsWith('0|')), 'the first milestone play costs zero credits');
  const freeCard = exertian?.kind === 'exertian-card' ? exertian.options.find((option) => option !== 'skip') : undefined;
  if (exertian?.kind === 'exertian-card' && freeCard) resolveRuntimeChoice(s, exertian, freeCard);

  player.score = 40;
  player.credits = 1;
  ok(queueSetiAlienMilestone(s, player.seat, hooks), 'the second Exertian milestone queues');
  exertian = s.pending[0];
  ok(exertian?.kind === 'exertian-card' && exertian.options.some((option) => option.startsWith('1|')), 'the second milestone attaches its one-credit cost to the card');
  const paidCard = exertian?.kind === 'exertian-card' ? exertian.options.find((option) => option !== 'skip') : undefined;
  if (exertian?.kind === 'exertian-card' && paidCard) resolveRuntimeChoice(s, exertian, paidCard);
  equal(player.credits, 0, 'the paid Exertian milestone consumes exactly one credit');
  equal(player.hiddenExertian.length, 3, 'discovery, first milestone, and second milestone cards all remain face-down');
}

// Exertian card scoring happens once, then all players tied for greatest total
// danger lose floor(10%) after every other point.
{
  const s = game(2);
  const slot = forceSpecies(s, 'exertians');
  const player = s.players[0];
  const other = s.players[1];
  const card = SETI_ALIEN_CARDS_BY_CARD_ID[203600];
  player.hiddenExertian.push(card.id);
  for (let i = 0; i < 6; i++) player.traceMarkers.push({ color: i % 3 === 0 ? 'purple' : i % 3 === 1 ? 'orange' : 'blue', speciesSlot: slot.slot, spaceId: `trace_${i}`, overflow: false });
  player.finalScore = 100;
  other.finalScore = 90;
  if (slot.module?.kind === 'exertians') {
    slot.module.dangerBySeat[player.seat] = 2;
    slot.module.dangerBySeat[other.seat] = 1;
  }
  scoreSetiAlienEndgame(s);
  equal(player.finalScore, 97, 'Exertian condition adds 7, then greatest danger loses 10');
  equal(other.finalScore, 90, 'lower-danger player keeps the full final score');
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  console.error(`${passed}/${passed + failures.length} SETI alien runtime checks passed`);
  process.exit(1);
}

console.log(`SETI alien runtime: ${passed} checks passed.`);
