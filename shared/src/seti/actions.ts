// SETI action reducer. Every board gesture maps to one small, serializable
// action. Main actions never advance the turn; normal turns require end_turn,
// while pass resolves its visual discard/income choices and then advances.

import {
  SETI_BODIES,
  SETI_GOLD_TILES,
  SETI_RULES,
  SETI_SECTORS,
  SETI_SECTOR_IDS,
  SETI_TECH_BY_ID,
  SETI_TECH_STACKS,
  adjacentSetiCells,
  parseSetiCell,
  setiCellId,
  type SetiBody,
  type SetiCellId,
  type SetiGoldTileId,
  type SetiIncomeKind,
  type SetiKnownRewardOp,
  type SetiPrimaryBody,
  type SetiSectorId,
  type SetiSignalColor,
  type SetiTechStackId,
  type SetiTraceColor,
} from './data.js';
import {
  SETI_PROJECT_CATALOG_BY_ID,
  type SetiProjectOp,
} from './projectCatalog.js';
import {
  getSetiSolarRotationTransition,
  rotateSetiSolarOrientations,
  setiSolarVisitGrantsPublicity,
} from './solarGeometry.js';
import {
  beginSetiProjectResolution,
  projectCardDestination,
  queueSetiConditionalMissionOffers,
  queueSetiProjectTrigger,
  resumeSetiProjectResolution,
  resolveSetiProjectManualTrigger,
  resolveSetiProjectPending,
  scoreSetiProjectEndGame,
  setiProjectOnPlayOperations,
  suspendSetiProjectForInterrupt,
  touchSetiProjectRevision,
  type SetiProjectExecutorAdapter,
} from './projectExecutor.js';
import {
  addSetiProjectTurnBody,
  addSetiProjectTurnFeature,
  emptySetiProjectTurnFacts,
  setiProjectHasTemporaryRule,
  setiProjectRuntime,
  type SetiProjectBody,
} from './projectRuntime.js';
import {
  assertSetiState,
  bodyAtSetiCell,
  decodeSetiComputerSlot,
  drawSetiProjectCard,
  earthSetiCell,
  earthSetiSectorId,
  getSetiBodyCells,
  getSetiSolarFeatures,
  getSetiLegalTargets,
  isSetiAsteroidCell,
  isSetiPublicityCell,
  placeSetiSpacecraft,
  refillSetiProjectRow,
  setiComputerSlotIds,
  setiFirstLandingSpaceId,
  setiFirstOrbitSpaceAvailable,
  setiFirstOrbitSpaceId,
  setiIncomeCounts,
  setiMoonLandingSpaceId,
  setiPlayerHasAbility,
  setiPlayerLanders,
  setiPlayerOrbiters,
  setiProbeLimit,
  setiProbesInSpace,
  setiRoll,
  setiShuffle,
  setiSupportLayerForCell,
  setiTraceCounts,
  setiTraceTargets,
  type SetiEvent,
  type SetiPendingDecision,
  type SetiPlayer,
  type SetiSectorState,
  type SetiSolarPiece,
  type SetiSpeciesModule,
  type SetiSpeciesSlotState,
  type SetiState,
} from './state.js';
import {
  SETI_COMPUTER_TECH_TOP_SPACES,
  scoreSetiGoldClaim,
  setiGoldPointsPerSet,
  setiNextStartingSeat,
  type SetiComputerTechBoardSlot,
} from './coreRules.js';
import {
  applySetiAlienDiscoverySpaceReward,
  applySetiAlienIncome,
  applySetiOumuamuaLandingReward,
  applySetiOumuamuaOrbitReward,
  completeSetiAlienMission,
  deliverSetiMascamiteSample,
  discardSetiAlienCardForCorner,
  discardSetiAlienCardForSignal,
  onSetiAlienSpeciesRevealed,
  onSetiAlienTechnologyResearched,
  onSetiAlienTraceMarked,
  playSetiAlienCard,
  queueSetiAlienMilestone,
  resolveSetiAlienChoice,
  resolveSetiAlienResearchSpace,
  resolveSetiAlienRotation,
  routeSetiSignalThroughOumuamua,
  scoreSetiAlienEndgame,
  settleSetiAlienAutomaticContinuations,
  type SetiAlienRuntimeHooks,
} from './alienRuntime.js';
import {
  SETI_RIVAL_OWNER,
  afterSetiHumanTurn,
  beginSetiSoloRound,
  evaluateSetiSoloThresholds,
  gainSetiRivalPublicity,
  onSetiSoloSpeciesRevealed,
  prepareSetiSoloNextRound,
  recordSetiSoloObjectiveEvent,
  recordSetiSoloObjectiveTrigger,
  resolveSetiSoloObjectiveChoice,
  scoreSetiSoloEndGame,
  settleSetiSoloCompletedSector,
  settleSetiSoloEndRoundObjectives,
  type SetiSoloRuntimeAdapter,
} from './soloRuntime.js';
import { SETI_ALIEN_CARDS_BY_ID } from './alienCatalog.js';

export type SetiChoice =
  | { kind: 'card'; cardId: string }
  | { kind: 'cards'; cardIds: string[] }
  | { kind: 'sector'; sectorId: SetiSectorId; row?: number }
  | { kind: 'trace-space'; spaceId: string }
  | { kind: 'gold-tile'; tileId: SetiGoldTileId }
  | { kind: 'tech-stack'; stackId: SetiTechStackId }
  | { kind: 'number'; value: number }
  | { kind: 'option'; option: string }
  | { kind: 'options'; options: string[] };

export type SetiAction =
  | { type: 'choose_initial_income'; cardId: string }
  | { type: 'launch' }
  | { type: 'move'; pieceId: string; to: SetiCellId; payment?: { energy?: number; cardId?: string } }
  | { type: 'orbit'; pieceId: string; body: SetiProjectBody }
  | { type: 'land'; pieceId: string; body: SetiProjectBody }
  | { type: 'scan' }
  | { type: 'place_data'; slot: number }
  | { type: 'analyze' }
  | { type: 'research' }
  | { type: 'play_card'; cardId: string }
  | { type: 'discard_for_corner'; cardId: string }
  | { type: 'complete_alien_mission'; cardId: string }
  | { type: 'deliver_sample'; pieceId: string; cardId: string }
  | { type: 'buy_card'; source: 'deck' | number }
  | { type: 'exchange'; give: 'cards' | 'credits' | 'energy'; receive: 'card' | 'credit' | 'energy'; cardIds?: string[]; row?: number }
  | { type: 'pass' }
  | { type: 'choose'; choice: SetiChoice }
  | { type: 'end_turn' };

export interface SetiResult { ok: boolean; error?: string }

const err = (error: string): SetiResult => ({
  ok: false,
  error: error.replace(/\s+—\s+/g, ', ').replace(/^\p{Ll}/u, (letter) => letter.toUpperCase()),
});

const SETI_ALIEN_HOOKS: SetiAlienRuntimeHooks = {
  rotateSolarSystem: rotateSetiSolarSystem,
  markSectorSignal: markSetiSignal,
  settleCompletedSectors: settleSetiCompletedSectors,
  recordSolarVisit,
  onDiscardFreeCorner(s, player, freeCorner) {
    queueSetiProjectTrigger(s, player, { kind: 'discard-free-corner', freeCorner });
  },
};

function emit(s: SetiState, player: SetiPlayer | null, title: string, detail = '', extra: Partial<SetiEvent> = {}): void {
  s.eventCounter++;
  s.lastEvent = {
    seq: s.eventCounter,
    seat: player?.seat ?? null,
    color: player?.color ?? null,
    player: player?.name ?? 'SETI',
    title,
    detail,
    ...extra,
  };
  s.log.push(`${player?.name ?? 'SETI'}: ${title}${detail ? ` - ${detail}` : ''}`);
}

function activePlayerError(s: SetiState, seat: number, allowAfterMain = true, allowProjectInterrupt = false): string | null {
  if (s.phase !== 'playing') return 'SETI is not in the action phase';
  if (!s.players[seat]) return 'Invalid seat';
  if (s.activeSeat !== seat) return 'Not your turn';
  if (s.players[seat].passed) return 'You have passed';
  if (s.pending.length && !allowProjectInterrupt) return 'Resolve the highlighted decision first';
  if (s.turnResolution) return 'Turn resolution is in progress';
  if (!allowAfterMain && s.mainActionTaken) return 'Main action already taken';
  return null;
}

function gainPublicity(player: SetiPlayer, amount: number): void {
  player.publicity = Math.max(0, Math.min(SETI_RULES.publicityMax, player.publicity + amount));
}

function gainData(player: SetiPlayer, amount: number): void {
  player.dataPool = Math.max(0, Math.min(SETI_RULES.dataMax, player.dataPool + amount));
}

function gainScore(player: SetiPlayer, amount: number): void {
  player.score = Math.max(0, player.score + amount);
}

function drawIntoHand(s: SetiState, player: SetiPlayer, amount: number): string[] {
  const drawn: string[] = [];
  for (let i = 0; i < amount; i++) {
    const card = drawSetiProjectCard(s);
    if (card) { player.hand.push(card); drawn.push(card); }
  }
  return drawn;
}

function removeOwnedPiece(s: SetiState, player: SetiPlayer, id: string): SetiSolarPiece | null {
  const index = s.solar.pieces.findIndex((piece) => piece.id === id && piece.owner === player.seat);
  if (index < 0) return null;
  return s.solar.pieces.splice(index, 1)[0];
}

function launchProbe(s: SetiState, player: SetiPlayer, free: boolean, ignoreLimit = false): SetiSolarPiece | null {
  if (!ignoreLimit && setiProbesInSpace(s, player.seat) >= setiProbeLimit(player)) return null;
  if (!free) {
    if (player.credits < SETI_RULES.launchCredits) return null;
    player.credits -= SETI_RULES.launchCredits;
  }
  const cell = earthSetiCell(s);
  const piece: SetiSolarPiece = {
    id: `seti_probe_${s.solar.nextPieceId++}`,
    owner: player.seat,
    kind: 'probe',
    cell,
    supportLayer: setiSupportLayerForCell(s, cell),
  };
  s.solar.pieces.push(piece);
  return piece;
}

function signalOptionsForColor(color: SetiSignalColor | null): SetiSectorId[] {
  if (color === null) return [...SETI_SECTOR_IDS];
  return SETI_SECTORS.filter((sector) => sector.printedSignalColor === color).map((sector) => sector.id);
}

function bodySectorId(s: SetiState, body: SetiPrimaryBody): SetiSectorId | null {
  const cell = getSetiBodyCells(s)[body];
  if (!cell) return null;
  return s.sectorOrder[parseSetiCell(cell).sector] ?? null;
}

function queueTrace(s: SetiState, player: SetiPlayer, color: SetiTraceColor, amount: number): void {
  const resolutionId = s.projectRuntime.nextResolutionId++;
  for (let i = 0; i < amount; i++) {
    const options = setiTraceTargets(s, color, player.seat);
    if (options.length) s.pending.push({ kind: 'trace-space', owner: player.seat, color, options, resolutionId });
    else gainScore(player, 3); // both species boards exhausted: printed overflow value
  }
}

function queueSignal(s: SetiState, player: SetiPlayer, color: SetiSignalColor | null, amount: number, options?: SetiSectorId[]): void {
  for (let i = 0; i < amount; i++) {
    s.pending.push({ kind: 'signal-sector', owner: player.seat, source: 'effect', options: options ?? signalOptionsForColor(color), signalColor: color });
  }
}

function queueTuckIncome(s: SetiState, player: SetiPlayer, amount: number): void {
  const cards = [...player.hand, ...player.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species !== 'exertians')];
  for (let i = 0; i < amount && cards.length > 0; i++) {
    s.pending.push({ kind: 'tuck-income-card', owner: player.seat, options: ['skip', ...cards], optional: true });
  }
}

function queueDrawChoice(s: SetiState, player: SetiPlayer, amount: number, source: 'row-or-deck' | 'deck'): void {
  if (source === 'deck') {
    drawIntoHand(s, player, amount);
    return;
  }
  for (let i = 0; i < amount; i++) {
    const options = ['deck', ...s.projectRow.flatMap((card, index) => card ? [`row:${index}`] : [])];
    s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: 'seti_reward_draw_project', label: 'Take a project card from the row or deck', min: 1, max: 1, options });
  }
}

function applyKnownRewardOps(s: SetiState, player: SetiPlayer, ops: readonly SetiKnownRewardOp[]): void {
  for (const op of ops) {
    switch (op.kind) {
      case 'vp': gainScore(player, op.amount); break;
      case 'credit': player.credits += op.amount; break;
      case 'energy': player.energy += op.amount; break;
      case 'data': gainData(player, op.amount); break;
      case 'publicity': gainPublicity(player, op.amount); break;
      case 'trace': queueTrace(s, player, op.color, op.amount); break;
      case 'signal': queueSignal(s, player, op.color, op.amount); break;
      case 'signal-at-body-sector': {
        const sector = bodySectorId(s, op.body);
        if (sector) queueSignal(s, player, null, op.amount, [sector]);
        break;
      }
      case 'draw-project': queueDrawChoice(s, player, op.amount, op.source); break;
      case 'tuck-income': queueTuckIncome(s, player, op.amount); break;
    }
  }
}

const SETI_SOLO_ADAPTER: SetiSoloRuntimeAdapter = {
  rotateSolarSystem: rotateSetiSolarSystem,
  applyHumanRewardOps: applyKnownRewardOps,
  onHumanSectorWin(s, player, sectorId) {
    recordSetiSoloObjectiveEvent(s, { kind: 'win-sector', color: SETI_SECTORS.find((sector) => sector.id === sectorId)!.printedSignalColor });
    evaluateSetiSoloThresholds(s, player);
  },
  revealPendingSpecies,
  placeNeutralMarker: placeSetiSoloNeutralMarker,
  emit(s, title, detail = '') { emit(s, null, title, detail); },
};

// ---------------------------------------------------------------------------
// Signals and sector completion
// ---------------------------------------------------------------------------

export function markSetiSignal(s: SetiState, seat: number, sectorId: SetiSectorId, gainSignalData = true): void {
  const player = s.players[seat];
  const sector = s.sectors[sectorId];
  if (!player || !sector) throw new Error('Invalid SETI signal target');
  const excess = sector.dataRemaining === 0;
  const ordinaryBefore = sector.signals.filter((marker) => !marker.excess).length;
  s.markerSequence++;
  sector.signals.push({ owner: seat, sequence: s.markerSequence, excess });
  if (!excess) {
    sector.dataRemaining--;
    if (gainSignalData) gainData(player, 1);
    if (ordinaryBefore === 1) gainScore(player, 2);
  }
  if (sector.dataRemaining === 0) {
    sector.completionPending = true;
    if (!s.deferredCompletedSectors.includes(sectorId)) s.deferredCompletedSectors.push(sectorId);
  }
  emit(s, player, 'marks a signal', SETI_SECTORS.find((definition) => definition.id === sectorId)?.name ?? sectorId, { sectorId });
  queueSetiProjectTrigger(s, player, { kind: 'mark-signal', signalColor: SETI_SECTORS.find((definition) => definition.id === sectorId)!.printedSignalColor });
}

function resolveSetiSector(s: SetiState, sectorId: SetiSectorId, triggerOwner?: number): void {
  const sector = s.sectors[sectorId];
  if (!sector.completionPending) return;
  if (settleSetiSoloCompletedSector(s, sectorId, SETI_SOLO_ADAPTER)) return;
  const contributors = [...new Set(sector.signals.map((marker) => marker.owner))];
  const ranked = contributors.map((owner) => {
    const markers = sector.signals.filter((marker) => marker.owner === owner);
    return { owner, count: markers.length, latest: Math.max(...markers.map((marker) => marker.sequence)) };
  }).sort((a, b) => b.count - a.count || b.latest - a.latest);
  const winner = ranked[0];
  const second = ranked[1];
  if (winner) {
    const player = s.players[winner.owner];
    const firstWin = sector.wins.length === 0;
    s.markerSequence++;
    sector.wins.push({ owner: winner.owner, sequence: s.markerSequence });
    const definition = SETI_SECTORS.find((candidate) => candidate.id === sectorId)!;
    applyKnownRewardOps(s, player, firstWin ? definition.printedWinReward.first : definition.printedWinReward.later);
  }
  for (const owner of contributors) gainPublicity(s.players[owner], 1);

  let retained: typeof sector.signals[number] | null = null;
  if (second && second.owner !== winner?.owner) {
    retained = sector.signals.filter((marker) => marker.owner === second.owner).sort((a, b) => b.sequence - a.sequence)[0];
    retained = { ...retained, excess: false };
  }
  sector.signals = retained ? [retained] : [];
  sector.dataRemaining = sector.capacity - sector.signals.length;
  sector.completionPending = false;
  s.deferredCompletedSectors = s.deferredCompletedSectors.filter((id) => id !== sectorId);
  emit(s, winner ? s.players[winner.owner] : null, 'completes a signal sector', SETI_SECTORS.find((definition) => definition.id === sectorId)?.name ?? sectorId, { sectorId });
  const actor = triggerOwner === undefined ? null : s.players[triggerOwner];
  if (actor) {
    if (!s.projectRuntime.turn.completedSectors.includes(sectorId)) s.projectRuntime.turn.completedSectors.push(sectorId);
    queueSetiProjectTrigger(s, actor, { kind: 'complete-sector' });
  }
}

export function settleSetiCompletedSectors(s: SetiState, owner: number): void {
  const pending = s.deferredCompletedSectors.filter((id) => s.sectors[id].completionPending);
  if (pending.length === 0) return;
  if (pending.length === 1) {
    resolveSetiSector(s, pending[0], owner);
    return;
  }
  if (!s.pending.some((decision) => decision.kind === 'completed-sector-order')) {
    s.pending.unshift({ kind: 'completed-sector-order', owner, options: pending });
  }
}

// ---------------------------------------------------------------------------
// Rotation, species, milestones, and round flow
// ---------------------------------------------------------------------------

export function rotateSetiSolarSystem(s: SetiState): void {
  const selected = s.solar.rotationPointer;
  const orientationsBefore = {
    disc1: s.solar.orientations.disc1,
    disc2: s.solar.orientations.disc2,
    disc3: s.solar.orientations.disc3,
  };
  const orientationsAfter = rotateSetiSolarOrientations(orientationsBefore, selected);
  s.solar.orientations = { base: 0, ...orientationsAfter };

  // The visitor tile is printed at a fixed disc-3 cell and must reach its new
  // destination before moved pieces resolve their visit effects.
  for (const slot of s.species) {
    if (slot.revealed && slot.module?.kind === 'oumuamua') slot.module.cell = setiCellId(2, 5 + orientationsAfter.disc3);
  }

  for (const piece of s.solar.pieces) {
    const from = piece.cell;
    const transition = getSetiSolarRotationTransition(orientationsBefore, selected, from);
    if (transition.moved) {
      piece.cell = transition.to;
      const player = s.players[piece.owner];
      if (piece.owner === SETI_RIVAL_OWNER && s.solo) {
        const feature = getSetiSolarFeatures(s).find((candidate) => candidate.cell === piece.cell) ?? null;
        if (feature?.grantsPrintedPublicity) gainSetiRivalPublicity(s, 1);
        emit(s, null, transition.reason === 'bumped' ? 'rival probe is bumped by solar rotation' : 'rival probe moves with solar rotation', '', { pieceId: piece.id, from, to: piece.cell });
      } else if (player) {
        recordSolarVisit(s, player, piece, from, piece.cell);
        emit(s, player, transition.reason === 'bumped' ? 'is bumped by solar rotation' : 'moves with solar rotation', '', { pieceId: piece.id, from, to: piece.cell });
      }
    }
    piece.supportLayer = transition.supportAfter;
  }
  s.solar.rotationPointer = selected === 3 ? 1 : (selected + 1) as 2 | 3;

  resolveSetiAlienRotation(s, SETI_ALIEN_HOOKS);
}

function drawAlienCard(slot: SetiSpeciesSlotState, player: SetiPlayer): void {
  const card = slot.alienDeck.shift();
  if (card) player.alienHand.push(card);
}

function initializeSpeciesModule(s: SetiState, slot: SetiSpeciesSlotState): SetiSpeciesModule {
  switch (slot.speciesId) {
    case 'mascamites': {
      const samples = setiShuffle(s, Array.from({ length: 7 }, (_, index) => `seti_mascamite_sample_${index + 1}`));
      return { kind: 'mascamites', samplesAtJupiter: samples.slice(0, 3), samplesAtSaturn: samples.slice(3, 6), revealedBlueSample: samples[6], capsulesDelivered: [] };
    }
    case 'anomalies': {
      const earth = parseSetiCell(earthSetiCell(s)).sector;
      return {
        kind: 'anomalies',
        anomalies: [earth, (earth + 3) % 8, (earth + 5) % 8].map((sector, index) => ({ id: `seti_anomaly_${index + 1}`, sector, side: setiRoll(s, 0, 1) as 0 | 1 })),
        triggerCount: 0,
      };
    }
    case 'oumuamua':
      return { kind: 'oumuamua', cell: setiCellId(2, 5 + s.solar.orientations.disc3), dataRemaining: 3, signals: [], exofossils: Object.fromEntries(s.players.map((player) => [player.seat, 0])) };
    case 'centaurians':
      return {
        kind: 'centaurians',
        messageMilestones: Object.fromEntries(s.players.map((player) => [player.seat, [player.score + 15]])),
        messageQueue: Object.fromEntries(s.players.map((player) => [player.seat, ['seti_centaurian_board_message']])),
        claimedRewards: [],
      };
    case 'exertians': {
      const leader = Math.max(...s.players.map((player) => player.score));
      return {
        kind: 'exertians',
        milestones: [leader + 20, leader + 40],
        dangerBySeat: Object.fromEntries(s.players.map((player) => [player.seat, 0])),
        resolvedMilestones: Object.fromEntries(s.players.map((player) => [player.seat, [false, false]])),
      };
    }
  }
}

function revealPendingSpecies(s: SetiState): void {
  while (s.pendingSpeciesDiscoveries.length) {
    const index = s.pendingSpeciesDiscoveries.shift()!;
    const slot = s.species[index];
    if (slot.revealed) continue;
    slot.revealed = true;
    slot.module = initializeSpeciesModule(s, slot);
    onSetiAlienSpeciesRevealed(s, slot);
    onSetiSoloSpeciesRevealed(s, slot);
    emit(s, null, `discovers ${slot.speciesId}`, `Species slot ${slot.slot + 1}`);
  }
}

function firstOpenDiscovery(s: SetiState): { slot: SetiSpeciesSlotState; color: SetiTraceColor } | null {
  for (const slot of s.species) {
    if (slot.revealed) continue;
    for (const color of ['purple', 'orange', 'blue'] as SetiTraceColor[]) if (!slot.discovery[color]) return { slot, color };
  }
  return null;
}

function placeNeutralMarkerFromThreshold(s: SetiState, threshold: 20 | 30): boolean {
  if (s.neutralMilestonesRemaining[threshold] <= 0) return false;
  const target = firstOpenDiscovery(s);
  if (!target) return false;
  s.neutralMilestonesRemaining[threshold]--;
  s.markerSequence++;
  target.slot.discovery[target.color] = { owner: null, sequence: s.markerSequence };
  if (Object.values(target.slot.discovery).every(Boolean) && !s.pendingSpeciesDiscoveries.includes(target.slot.slot)) {
    s.pendingSpeciesDiscoveries.push(target.slot.slot);
  }
  return true;
}

function placeSetiSoloNeutralMarker(s: SetiState, threshold: 20 | 30): void {
  placeNeutralMarkerFromThreshold(s, threshold);
}

function resolveNeutralMilestones(s: SetiState, turnSeat: number): void {
  for (let offset = 0; offset < s.players.length; offset++) {
    const player = s.players[(turnSeat + offset) % s.players.length];
    for (const threshold of SETI_RULES.neutralThresholds as readonly (20 | 30)[]) {
      if (player.score < threshold || player.neutralMilestones[threshold]) continue;
      player.neutralMilestones[threshold] = true;
      placeNeutralMarkerFromThreshold(s, threshold);
    }
  }
}

function queueNextGoldMilestone(s: SetiState, turnSeat: number): boolean {
  for (let offset = 0; offset < s.players.length; offset++) {
    const player = s.players[(turnSeat + offset) % s.players.length];
    for (const threshold of SETI_RULES.goldThresholds) {
      if (player.score < threshold || player.goldClaims.some((claim) => claim.threshold === threshold)) continue;
      const claimed = new Set(player.goldClaims.map((claim) => claim.tileId));
      const options = s.goldTiles.map((tile) => tile.id).filter((id) => !claimed.has(id));
      if (options.length) {
        s.pending.push({ kind: 'gold-tile', owner: player.seat, threshold, options });
        return true;
      }
    }
  }
  return false;
}

function nextUnpassedSeat(s: SetiState, after: number): number | null {
  for (let offset = 1; offset <= s.players.length; offset++) {
    const seat = (after + offset) % s.players.length;
    if (!s.players[seat].passed) return seat;
  }
  return null;
}

function applyIncome(s: SetiState): void {
  for (const player of s.players) {
    const income = setiIncomeCounts(player);
    player.credits += SETI_RULES.baseIncomeCredits + income.credit;
    player.energy += SETI_RULES.baseIncomeEnergy + income.energy;
    drawIntoHand(s, player, SETI_RULES.baseIncomeCards + income.card);
  }
  applySetiAlienIncome(s);
}

function goldUnits(s: SetiState, player: SetiPlayer, tileId: SetiGoldTileId): number {
  const side = s.goldTiles.find((tile) => tile.id === tileId)?.side ?? 'A';
  const definition = SETI_GOLD_TILES.find((tile) => tile.id === tileId && tile.side === side)!;
  const byType = (type: string) => player.techs.filter((tech) => SETI_TECH_BY_ID[tech.stackId]?.type === type).length;
  const traces = setiTraceCounts(player);
  const nonStarting = player.incomeCards.filter((income) => !income.starting);
  const countIncome = (kind: SetiIncomeKind) => nonStarting.filter((income) => income.kind === kind).length
    + player.alienIncomeCards.filter((income) => income.kind === kind).length;
  const incomes = { credit: countIncome('credit'), energy: countIncome('energy'), card: countIncome('card') };
  const completedMissions = player.completedMissions.length + player.completedAlienMissions.length;
  const scoringCards = player.scoringCards.length + player.alienScoringCards.length;
  const sectorWins = SETI_SECTOR_IDS.reduce((sum, id) => sum + s.sectors[id].wins.filter((marker) => marker.owner === player.seat).length, 0);
  switch (definition.unit) {
    case 'tech-set': return Math.min(byType('probe'), byType('telescope'), byType('computer'));
    case 'any-two-techs': return Math.floor(player.techs.length / 2);
    case 'completed-mission': return completedMissions;
    case 'mission-pair': return Math.floor((completedMissions + scoringCards) / 2);
    case 'income-trio': return Math.min(incomes.credit, incomes.energy, incomes.card);
    case 'income-large': return Math.max(incomes.credit, incomes.energy);
    case 'trace-trio': return Math.min(traces.purple, traces.orange, traces.blue);
    case 'sector-and-spacecraft': return Math.min(sectorWins, setiPlayerOrbiters(s, player.seat) + setiPlayerLanders(s, player.seat));
  }
}

function goldDefinition(s: SetiState, tileId: SetiGoldTileId) {
  const side = s.goldTiles.find((tile) => tile.id === tileId)?.side ?? 'A';
  return SETI_GOLD_TILES.find((tile) => tile.id === tileId && tile.side === side)!;
}

function goldClaimCount(s: SetiState, tileId: SetiGoldTileId): number {
  return s.players.reduce((sum, player) => sum + player.goldClaims.filter((claim) => claim.tileId === tileId).length, 0)
    + (s.solo?.goldClaims.filter((claim) => claim.tileId === tileId).length ?? 0);
}

function scoreGoldTileClaim(s: SetiState, player: SetiPlayer, claim: SetiPlayer['goldClaims'][number]): number {
  const definition = goldDefinition(s, claim.tileId);
  const pointsPerSet = claim.pointsPerSet ?? definition.values[2];
  return scoreSetiGoldClaim(goldUnits(s, player, claim.tileId), pointsPerSet);
}

function scoreRightmostUnmarkedGoldTile(s: SetiState, player: SetiPlayer): number {
  const claimed = new Set(player.goldClaims.map((claim) => claim.tileId));
  const available = s.goldTiles.map((tile) => tile.id).filter((tileId) => !claimed.has(tileId));
  return available.length
    ? Math.max(...available.map((tileId) => scoreSetiGoldClaim(goldUnits(s, player, tileId), goldDefinition(s, tileId).values[2])))
    : 0;
}

export function finishSetiGame(s: SetiState): void {
  for (const player of s.players) {
    const gold = player.goldClaims.reduce((sum, claim) => sum + scoreGoldTileClaim(s, player, claim), 0);
    const projects = scoreSetiProjectEndGame(s, player, scoreRightmostUnmarkedGoldTile);
    const total = player.score + gold + projects;
    player.finalScore = total;
    player.finalScoreBreakdown = { base: player.score, gold, projects, aliens: 0, total };
  }
  scoreSetiAlienEndgame(s);
  for (const player of s.players) {
    if (!player.finalScoreBreakdown) continue;
    player.finalScoreBreakdown.aliens = (player.finalScore ?? player.finalScoreBreakdown.total) - player.finalScoreBreakdown.total;
    player.finalScoreBreakdown.total = player.finalScore ?? player.finalScoreBreakdown.total;
  }
  if (s.solo) scoreSetiSoloEndGame(s);
  const best = Math.max(...s.players.map((player) => player.finalScore ?? player.score));
  s.winners = s.players.filter((player) => (player.finalScore ?? player.score) === best).map((player) => player.color);
  if (s.solo && best <= s.solo.rivalScore) s.winners = [];
  s.phase = 'ended';
  emit(s, null, 'game over', s.winners.length ? `${s.winners.join(' and ')} win` : 'The solo rival wins');
}

function finishRound(s: SetiState): void {
  if (s.round <= 4) {
    const leftovers = s.roundEndStacks[s.round - 1].splice(0);
    s.projectDiscard.push(...leftovers);
  }
  if (s.round === SETI_RULES.rounds) {
    finishSetiGame(s);
    return;
  }
  if (s.solo) settleSetiSoloEndRoundObjectives(s, s.round as 1 | 2 | 3 | 4);
  applyIncome(s);
  s.round++;
  if (s.solo) {
    s.startingSeat = 0;
    prepareSetiSoloNextRound(s);
  } else s.startingSeat = setiNextStartingSeat(s.startingSeat, s.players.length);
  s.activeSeat = s.startingSeat;
  s.projectRuntime.turn = emptySetiProjectTurnFacts(s.startingSeat);
  s.firstPassSeat = null;
  s.passResolutionSeat = null;
  s.passedSeats = [];
  for (const player of s.players) player.passed = false;
  s.mainActionTaken = false;
  emit(s, null, `round ${s.round} begins`, s.solo?.rivalStartsRound ? 'The rival starts' : `${s.players[s.startingSeat].name} starts`);
  if (s.solo) beginSetiSoloRound(s, SETI_SOLO_ADAPTER);
}

function settleTurnResolution(s: SetiState): void {
  if (!s.turnResolution || s.pending.length) return;
  const resolution = s.turnResolution;

  // Passing has three printed steps. The end-round card is the one explicit
  // exception to ordinary serialization: an earlier passer may leave that
  // private choice open while unpassed players act, but it becomes a barrier
  // before the next passer receives their own card choice.
  if (resolution.kind === 'pass' && resolution.passStage !== 'complete') {
    if (resolution.passStage === 'discard') {
      if (resolution.firstPass) rotateSetiSolarSystem(s);
      resolution.passStage = 'round-card';
      if (s.pending.length) return;
    }
    if (resolution.passStage === 'round-card' && s.deferredEndRoundCard) return;
    if (resolution.passStage === 'round-card' && s.round <= 4) {
      s.deferredEndRoundCard = {
        kind: 'end-round-card',
        owner: resolution.seat,
        round: s.round,
        options: [...s.roundEndStacks[s.round - 1]],
      };
    }
    resolution.passStage = 'complete';
  }

  while (queueSetiAlienMilestone(s, resolution.seat, SETI_ALIEN_HOOKS)) {
    if (s.pending.length) return;
  }
  if (queueNextGoldMilestone(s, resolution.seat)) return;
  resolution.milestonesQueued = true;
  resolveNeutralMilestones(s, resolution.seat);
  revealPendingSpecies(s);
  if (s.pending.length) return;

  if (s.solo) {
    if (!resolution.soloRivalProcessed) {
      const soloResult = afterSetiHumanTurn(s, SETI_SOLO_ADAPTER);
      resolution.soloRivalProcessed = soloResult.bothPassed
        || (resolution.kind === 'end-turn' && (soloResult.rivalTurns > 0 || s.solo.passed));
      if (s.pending.length) return;
    }
    const bothPassed = s.players[0].passed && s.solo.passed;
    if (resolution.kind === 'pass' && s.players[0].passed && s.deferredEndRoundCard) return;
    s.turnResolution = null;
    s.passResolutionSeat = null;
    if (bothPassed) finishRound(s);
    else {
      s.activeSeat = 0;
      s.projectRuntime.turn = emptySetiProjectTurnFacts(0);
      s.mainActionTaken = false;
      emit(s, s.players[0], 'turn begins', `Round ${s.round}`);
    }
    return;
  }

  if (resolution.kind === 'pass') {
    if (s.players.every((candidate) => candidate.passed) && s.deferredEndRoundCard) return;
    s.turnResolution = null;
    s.passResolutionSeat = null;
    if (s.players.every((candidate) => candidate.passed)) finishRound(s);
    else {
      const next = nextUnpassedSeat(s, resolution.seat)!;
      s.activeSeat = next;
      s.projectRuntime.turn = emptySetiProjectTurnFacts(next);
      s.mainActionTaken = false;
    }
    return;
  }
  s.turnResolution = null;
  const next = nextUnpassedSeat(s, resolution.seat);
  if (next === null) finishRound(s);
  else {
    s.activeSeat = next;
    s.projectRuntime.turn = emptySetiProjectTurnFacts(next);
    s.mainActionTaken = false;
    emit(s, s.players[next], 'turn begins', `Round ${s.round}`);
  }
}

function settleChoiceConsequences(s: SetiState, owner: number): void {
  settleSetiAlienAutomaticContinuations(s, SETI_ALIEN_HOOKS);
  const ownerPlayer = s.players[owner];
  if (s.projectRuntime.resolution) return;
  if (resumeSetiProjectResolution(s, ownerPlayer, SETI_PROJECT_ADAPTER)) return;
  queueSetiConditionalMissionOffers(s, ownerPlayer);
  for (const decision of s.pending) {
    if (decision.owner !== owner) continue;
    if (decision.kind === 'trace-space') decision.options = setiTraceTargets(s, decision.color, decision.owner);
    if (decision.kind === 'tuck-income-card') decision.options = [
      ...(decision.optional ? ['skip'] : []),
      ...ownerPlayer.hand,
      ...ownerPlayer.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species !== 'exertians'),
    ];
  }
  const stillSignals = s.pending.some((decision) => decision.kind === 'signal-sector');
  const projectTriggerPending = s.pending.some((decision) => decision.kind === 'manual-trigger-choice' && decision.triggerId.startsWith('project-'));
  if (!stillSignals && !projectTriggerPending) settleSetiCompletedSectors(s, owner);
  if (!s.pending.some((decision) => decision.kind === 'signal-sector' && decision.source === 'project-row') && s.projectRow.some((card) => card === null)) refillSetiProjectRow(s);
  if (s.phase === 'income-selection' && s.pending.length === 0) {
    s.phase = 'playing';
    s.activeSeat = s.startingSeat;
    s.projectRuntime.turn = emptySetiProjectTurnFacts(s.startingSeat);
    s.mainActionTaken = false;
    if (s.solo) beginSetiSoloRound(s, SETI_SOLO_ADAPTER);
    emit(s, s.players[s.activeSeat], 'turn begins', 'Round 1');
  }
  evaluateSetiSoloThresholds(s, ownerPlayer);
  settleTurnResolution(s);
}

function offerConditionalProjectsIfIdle(s: SetiState, player: SetiPlayer): void {
  evaluateSetiSoloThresholds(s, player);
  if (!s.pending.length && !s.projectRuntime.resolution && !s.projectRuntime.resolutionStack.length) queueSetiConditionalMissionOffers(s, player);
}

// ---------------------------------------------------------------------------
// Pending decisions
// ---------------------------------------------------------------------------

function tuckCard(s: SetiState, player: SetiPlayer, cardId: string, starting: boolean): string | null {
  const index = player.hand.indexOf(cardId);
  if (index >= 0) {
    const definition = SETI_PROJECT_CATALOG_BY_ID[cardId];
    if (!definition) return 'Unknown project card';
    player.hand.splice(index, 1);
    player.incomeCards.push({ cardId, kind: definition.income, starting });
    if (!starting) {
      if (definition.income === 'credit') player.credits++;
      else if (definition.income === 'energy') player.energy++;
      else drawIntoHand(s, player, 1);
    }
    return null;
  }
  if (starting) return 'Starting income must use a project card';
  const alienIndex = player.alienHand.indexOf(cardId);
  const alien = SETI_ALIEN_CARDS_BY_ID[cardId];
  if (alienIndex < 0 || !alien?.incomeCorner || alien.species === 'exertians') return 'Card is not in your hand';
  player.alienHand.splice(alienIndex, 1);
  player.alienIncomeCards.push({ cardId, kind: alien.incomeCorner });
  if (alien.incomeCorner === 'credit') player.credits++;
  else if (alien.incomeCorner === 'energy') player.energy++;
  else if (alien.incomeCorner === 'card') drawIntoHand(s, player, 1);
  else if (alien.incomeCorner === 'publicity') gainPublicity(player, 1);
  else gainData(player, 1);
  return null;
}

function resolveTraceChoice(s: SetiState, player: SetiPlayer, decision: Extract<SetiPendingDecision, { kind: 'trace-space' }>, spaceId: string): string | null {
  if (!decision.options.includes(spaceId)) return 'That trace space is not legal';
  const match = /^seti_species_([01])_(discovery|overflow)_(purple|orange|blue)$/.exec(spaceId);
  const research = /^seti_species_([01])_research_(.+)$/.exec(spaceId);
  if (!match && !research) return 'Invalid trace space';
  const slot = s.species[Number((match ?? research)![1]) as 0 | 1];
  const area = match?.[2] ?? 'research';
  const color = decision.color;
  if (match && match[3] !== color) return 'Trace color does not match';
  s.markerSequence++;
  if (area === 'discovery') {
    if (slot.revealed || slot.discovery[color]) return 'Discovery space is occupied';
    slot.discovery[color] = { owner: player.seat, sequence: s.markerSequence };
    applySetiAlienDiscoverySpaceReward(s, player, slot.slot, SETI_ALIEN_HOOKS);
    if (Object.values(slot.discovery).every(Boolean) && !s.pendingSpeciesDiscoveries.includes(slot.slot)) s.pendingSpeciesDiscoveries.push(slot.slot);
  } else {
    const overflow = area === 'overflow';
    if (overflow) gainScore(player, 3);
    else {
      const failure = resolveSetiAlienResearchSpace(s, player, slot, spaceId, SETI_ALIEN_HOOKS);
      if (failure) { s.markerSequence--; return failure; }
    }
    slot.research.push({ owner: player.seat, sequence: s.markerSequence, spaceId, color, overflow });
  }
  player.traceMarkers.push({ color, speciesSlot: slot.slot, spaceId, overflow: area === 'overflow' });
  const emittedEffectId = decision.resolutionId ?? s.projectRuntime.nextResolutionId++;
  const alienConsumed = onSetiAlienTraceMarked(s, player, emittedEffectId);
  if (!alienConsumed) queueSetiProjectTrigger(s, player, { kind: 'mark-trace', traceColor: color });
  return null;
}

function acquireTechnology(
  s: SetiState,
  player: SetiPlayer,
  stackId: SetiTechStackId,
  free: boolean,
  projectOperation?: Extract<SetiProjectOp, { kind: 'research' }>,
  emittedEffectId = s.projectRuntime.nextResolutionId++,
): string | null {
  const definition = SETI_TECH_BY_ID[stackId];
  const stack = s.techStacks[stackId];
  if (!definition || !stack) return 'Unknown technology stack';
  if (player.techs.some((tech) => tech.stackId === stackId)) return 'Technology already owned';
  if (!stack.tiles.length) return 'Technology stack is empty';
  if (!free) {
    if (player.publicity < SETI_RULES.researchPublicity) return 'Not enough publicity';
    player.publicity -= SETI_RULES.researchPublicity;
  }
  if (projectOperation?.rotateSolarSystem ?? true) rotateSetiSolarSystem(s);
  const tileId = stack.tiles.shift()!;
  player.techs.push({ stackId, tileId });
  if (stack.firstTakeBonusAvailable) {
    stack.firstTakeBonusAvailable = false;
    gainScore(player, 2);
  }
  const tile = definition.tiles.find((candidate) => candidate.id === tileId);
  if (tile && (projectOperation?.gainTileReward ?? true) && !projectOperation?.skipPrintedTileBonusOnly) applyKnownRewardOps(s, player, tile.immediateReward.ops);
  // International Collaboration skips the variable square reward, not the
  // Telescope I stack's intrinsic +2 data printed on every tile.
  if (projectOperation?.skipPrintedTileBonusOnly && definition.ability === 'earth-signal-adjacent') gainData(player, 2);
  if (definition.type === 'computer') {
    const occupied = new Set(Object.values(player.computer.tech).flatMap((state) => state ? [state.boardSlot] : []));
    const options = ([0, 1, 2, 3] as SetiComputerTechBoardSlot[]).filter((slot) => !occupied.has(slot));
    if (options.length) s.pending.push({ kind: 'computer-tech-slot', owner: player.seat, stackId, tileId, options });
  }
  if (definition.ability === 'probe-limit-and-launch') {
    const launched = launchProbe(s, player, true);
    if (launched) {
      addSetiProjectTurnBody(s, player, 'Earth');
      queueSetiProjectTrigger(s, player, { kind: 'launch' });
      emit(s, player, 'launches a probe', 'Technology effect: Earth', { pieceId: launched.id, to: launched.cell });
    }
  }
  const alienConsumed = onSetiAlienTechnologyResearched(s, player, emittedEffectId);
  if (!alienConsumed) queueSetiProjectTrigger(s, player, { kind: 'research', technology: definition.type });
  recordSetiSoloObjectiveEvent(s, { kind: 'research-tech', technology: definition.type });
  emit(s, player, 'researches a technology', stackId);
  return null;
}

function recordSolarVisit(s: SetiState, player: SetiPlayer, piece: SetiSolarPiece, from: SetiCellId, to: SetiCellId): void {
  if (parseSetiCell(from).ring === parseSetiCell(to).ring) s.projectRuntime.turn.movedSameRing = true;
  const visibleFeature = getSetiSolarFeatures(s).find((candidate) => candidate.cell === to) ?? null;
  const body = visibleFeature?.kind === 'planet' ? visibleFeature.body ?? null : null;
  if (body) {
    addSetiProjectTurnBody(s, player, body);
    queueSetiProjectTrigger(s, player, { kind: 'visit-body', body });
  }
  if (visibleFeature?.kind === 'asteroid' || visibleFeature?.kind === 'comet') {
    addSetiProjectTurnFeature(s, player, visibleFeature.kind);
    queueSetiProjectTrigger(s, player, { kind: 'visit-feature', feature: visibleFeature.kind });
    recordSetiSoloObjectiveEvent(s, { kind: 'visit-feature', feature: visibleFeature.kind });
  }
  const visitPublicity = setiSolarVisitGrantsPublicity(visibleFeature, setiPlayerHasAbility(player, 'asteroid-navigation'));
  const slingshotPlanetVisit = visibleFeature?.kind === 'planet' && visibleFeature.body !== 'Earth';
  if (!player.suppressProbePublicityThisTurn && visitPublicity && slingshotPlanetVisit && setiProjectHasTemporaryRule(s, player, 'replace-visit-publicity-with-move')) {
    const sourceCardId = s.projectRuntime.turn.temporaryRules.find((entry) => entry.rule === 'replace-visit-publicity-with-move')?.sourceCardId;
    if (sourceCardId) s.pending.push({ kind: 'project-visit-reward', owner: player.seat, sourceCardId, options: ['publicity', 'move'] });
  } else if (!player.suppressProbePublicityThisTurn && visitPublicity) gainPublicity(player, 1);
  piece.supportLayer = setiSupportLayerForCell(s, to);
}

function moveProjectProbe(s: SetiState, player: SetiPlayer, pieceId: string, to: SetiCellId): string | null {
  const piece = s.solar.pieces.find((candidate) => candidate.id === pieceId && candidate.owner === player.seat);
  if (!piece) return 'Piece is not yours or is not in space';
  if (!adjacentSetiCells(piece.cell).includes(to)) return 'Destination is not orthogonally adjacent';
  const from = piece.cell;
  piece.cell = to;
  recordSolarVisit(s, player, piece, from, to);
  emit(s, player, 'moves a probe', `${from} to ${to}`, { pieceId: piece.id, from, to });
  return null;
}

function landProjectProbe(
  s: SetiState,
  player: SetiPlayer,
  pieceId: string,
  body: SetiBody,
  operation: Extract<SetiProjectOp, { kind: 'land' }>,
  occupiedSpacecraftId?: string,
): string | null {
  const piece = s.solar.pieces.find((candidate) => candidate.id === pieceId && candidate.owner === player.seat && candidate.kind === 'probe');
  if (!piece) return 'Choose one of your probes';
  const primary = bodyAtSetiCell(s, piece.cell);
  const definition = SETI_BODIES[body];
  if (!definition) return 'Choose a highlighted landing space';
  const occupied = occupiedSpacecraftId
    ? s.placedSpacecraft.find((candidate) => candidate.id === occupiedSpacecraftId && candidate.kind === 'lander' && candidate.body === body) ?? null
    : null;
  if (occupiedSpacecraftId && (!operation.allowOccupiedSpaceAndGainCoveredReward || !occupied)) return 'That occupied landing space is no longer available';
  if (!primary || primary === 'Earth') return 'Probe is not visiting a landable body';
  if (definition.moon) {
    if (definition.parent !== primary) return 'That moon does not orbit the visited planet';
    if (!operation.ignoreMoonTechnology && !setiPlayerHasAbility(player, 'moon-landing')) return 'Moon-landing technology required';
    if (s.planets[body].landers.length && !occupied) return 'Moon is already occupied';
  } else if (body !== primary) return 'Probe is not visiting that planet';
  removeOwnedPiece(s, player, piece.id);
  let coveredReward = occupied?.coveredReward ? { ...occupied.coveredReward } : definition.moon ? { kind: 'moon-landing' as const } : null;
  let coveredSpaceId = occupied?.spaceId ?? (definition.moon ? setiMoonLandingSpaceId(body) : undefined);
  if (!occupied && body !== 'Mars' && !definition.moon && s.planets[body].firstLandingBonuses.length) {
    const amount = s.planets[body].firstLandingBonuses.shift()!;
    coveredReward = { kind: 'first-landing-data', amount };
    coveredSpaceId = setiFirstLandingSpaceId(body, amount);
    gainData(player, amount);
  }
  const spacecraft = placeSetiSpacecraft(s, {
    owner: player.seat,
    kind: 'lander',
    body,
    ...(coveredSpaceId ? { spaceId: coveredSpaceId } : {}),
    coveredReward,
  });
  if (occupied?.coveredReward?.kind === 'first-landing-data') gainData(player, occupied.coveredReward.amount);
  if (!occupied && body === 'Mars' && s.planets.Mars.firstLandingBonuses.length) {
    s.pending.push({ kind: 'mars-first-data', owner: player.seat, spacecraftId: spacecraft.id, options: [...s.planets.Mars.firstLandingBonuses] });
  }
  if (body === 'Oumuamua') applySetiOumuamuaLandingReward(s, player);
  else applyKnownRewardOps(s, player, definition.landingRewards);
  addSetiProjectTurnBody(s, player, body);
  queueSetiProjectTrigger(s, player, { kind: 'land', body });
  emit(s, player, `lands on ${body}`, 'Project effect: free landing', { body });
  return null;
}

function installedPlutoOperation(s: SetiState, player: SetiPlayer): Extract<SetiProjectOp, { kind: 'install-pluto' }> | null {
  if (s.projectRuntime.pluto.installedBy !== player.seat) return null;
  for (const cardId of player.permanentCards) {
    const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
    for (const effect of card?.effects ?? []) {
      if (effect.timing !== 'permanent') continue;
      const operation = effect.operations.find((candidate): candidate is Extract<SetiProjectOp, { kind: 'install-pluto' }> => candidate.kind === 'install-pluto');
      if (operation) return operation;
    }
  }
  return null;
}

function finishResolvingProjectCard(s: SetiState, player: SetiPlayer): void {
  const resolving = s.projectRuntime.resolvingCard;
  if (!resolving || resolving.owner !== player.seat) return;
  const card = SETI_PROJECT_CATALOG_BY_ID[resolving.cardId];
  if (!resolving.relocated) {
    if (resolving.destination === 'discard') s.projectDiscard.push(resolving.cardId);
    else if (resolving.destination === 'mission') player.missions.push(resolving.cardId);
    else if (resolving.destination === 'scoring') player.scoringCards.push(resolving.cardId);
    else player.permanentCards.push(resolving.cardId);
  }
  s.projectRuntime.resolvingCard = null;
  queueSetiProjectTrigger(s, player, resolving.playEvent, false, resolving.cardId);
  emit(s, player, `plays ${card?.canonicalName ?? resolving.cardId}`);
}

const SETI_PROJECT_ADAPTER: SetiProjectExecutorAdapter = {
  drawIntoHand,
  launchProbe(s, player, ignoreProbeLimit) {
    const piece = launchProbe(s, player, true, ignoreProbeLimit);
    if (piece) emit(s, player, 'launches a probe', 'Project effect: Earth', { pieceId: piece.id, to: piece.cell });
    return piece;
  },
  moveProbeFree: moveProjectProbe,
  landProbeFree: landProjectProbe,
  markSignal(s, player, sectorId, gainSignalData) { markSetiSignal(s, player.seat, sectorId, gainSignalData); },
  placeTrace(s, player, color, spaceId) {
    const resolutionId = s.projectRuntime.resolution?.id;
    const decision: Extract<SetiPendingDecision, { kind: 'trace-space' }> = { kind: 'trace-space', owner: player.seat, color, options: [spaceId], ...(resolutionId ? { resolutionId } : {}) };
    const result = resolveTraceChoice(s, player, decision, spaceId);
    if (!result) emit(s, player, `places a ${color} trace`, spaceId);
    return result;
  },
  prepareResearch(s, _player, operation) {
    if (operation.rotateSolarSystem) rotateSetiSolarSystem(s);
  },
  acquireTechnology(s, player, stackId, operation) {
    return acquireTechnology(s, player, stackId, true, { ...operation, rotateSolarSystem: false }, s.projectRuntime.resolution?.id);
  },
  signalCorner(player, cardId) {
    return SETI_PROJECT_CATALOG_BY_ID[cardId]?.signalColor ?? SETI_ALIEN_CARDS_BY_ID[cardId]?.signalCorner ?? null;
  },
  discardHandCardForSignal(s, player, cardId, sectorId) {
    if (SETI_ALIEN_CARDS_BY_ID[cardId]) {
      const error = discardSetiAlienCardForSignal(s, player, cardId, sectorId, SETI_ALIEN_HOOKS);
      return { error, signalHandled: !error };
    }
    const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
    const index = player.hand.indexOf(cardId);
    const targetColor = SETI_SECTORS.find((sector) => sector.id === sectorId)?.printedSignalColor;
    if (!card || index < 0) return { error: 'That project card is not in your hand', signalHandled: false };
    if (targetColor !== card.signalColor) return { error: 'The signal sector does not match the card corner', signalHandled: false };
    player.hand.splice(index, 1);
    s.projectDiscard.push(cardId);
    return { error: null, signalHandled: false };
  },
  applyKnownRewards(s, player, body) { applyKnownRewardOps(s, player, SETI_BODIES[body].landingRewards); },
  emit(s, player, title, detail = '') { emit(s, player, title, detail); },
  afterResolution(s, player) {
    finishResolvingProjectCard(s, player);
    queueSetiConditionalMissionOffers(s, player);
    settleChoiceConsequences(s, player.seat);
  },
};

function resolveChoice(s: SetiState, player: SetiPlayer, decision: SetiPendingDecision, choice: SetiChoice): SetiResult {
  if ('resolutionId' in decision && decision.resolutionId && s.projectRuntime.resolution?.id === decision.resolutionId) {
    const project = resolveSetiProjectPending(s, player, decision, choice as Parameters<typeof resolveSetiProjectPending>[3], SETI_PROJECT_ADAPTER);
    if (project) return project.ok ? { ok: true } : err(project.error ?? 'Project effect could not resolve');
  }
  const done = (): SetiResult => {
    if (s.pending[0] === decision) s.pending.shift();
    else if (s.deferredEndRoundCard === decision) s.deferredEndRoundCard = null;
    else throw new Error(`SETI resolved an untracked ${decision.kind} decision`);
    settleChoiceConsequences(s, player.seat);
    return { ok: true };
  };
  switch (decision.kind) {
    case 'initial-income-card': {
      if (choice.kind !== 'card' || !decision.options.includes(choice.cardId)) return err('Choose one highlighted income card');
      const failure = tuckCard(s, player, choice.cardId, true);
      if (failure) return err(failure);
      const kind = SETI_PROJECT_CATALOG_BY_ID[choice.cardId].income;
      if (kind === 'credit') player.credits++;
      else if (kind === 'energy') player.energy++;
      else drawIntoHand(s, player, 1);
      emit(s, player, 'chooses starting income', SETI_PROJECT_CATALOG_BY_ID[choice.cardId].canonicalName);
      return done();
    }
    case 'discard-to-four': {
      if (choice.kind !== 'cards' || choice.cardIds.length !== decision.count || new Set(choice.cardIds).size !== choice.cardIds.length) return err(`Discard exactly ${decision.count} cards`);
      if (choice.cardIds.some((card) => !player.hand.includes(card) && !player.alienHand.includes(card))) return err('A selected card is not in your hand');
      if (choice.cardIds.some((card) => SETI_ALIEN_CARDS_BY_ID[card]?.species === 'exertians')) return err('Exertian cards do not count toward the hand limit and cannot be discarded');
      for (const card of choice.cardIds) {
        const projectIndex = player.hand.indexOf(card);
        if (projectIndex >= 0) {
          player.hand.splice(projectIndex, 1);
          s.projectDiscard.push(card);
        } else {
          player.alienHand.splice(player.alienHand.indexOf(card), 1);
          const definition = SETI_ALIEN_CARDS_BY_ID[card];
          s.species.find((slot) => slot.speciesId === definition.species)?.alienDiscard.push(card);
        }
      }
      return done();
    }
    case 'end-round-card': {
      if (choice.kind !== 'card' || !decision.options.includes(choice.cardId)) return err('Choose a highlighted end-round card');
      const stack = s.roundEndStacks[decision.round - 1];
      const index = stack.indexOf(choice.cardId);
      if (index < 0) return err('End-round card is no longer available');
      stack.splice(index, 1);
      const definition = SETI_PROJECT_CATALOG_BY_ID[choice.cardId];
      player.incomeCards.push({ cardId: choice.cardId, kind: definition.income, starting: false });
      emit(s, player, 'takes an end-round income card', definition.canonicalName);
      return done();
    }
    case 'signal-sector': {
      if (choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return err('Choose a highlighted signal sector');
      if (decision.source === 'project-row') {
        if (typeof choice.row !== 'number' || !decision.rowOptions?.includes(choice.row)) return err('Choose one project-row card for its printed signal');
        const card = s.projectRow[choice.row];
        if (!card) return err('Project-row card is no longer available');
        const project = SETI_PROJECT_CATALOG_BY_ID[card];
        const targetColor = SETI_SECTORS.find((sector) => sector.id === choice.sectorId)?.printedSignalColor;
        if (!project || targetColor !== project.signalColor) return err(`That card marks only a ${project?.signalColor ?? 'matching'} signal sector`);
        s.projectRow[choice.row] = null;
        s.projectDiscard.push(card);
      }
      if (!routeSetiSignalThroughOumuamua(s, player, choice.sectorId, decision.alienCardId ?? '')) {
        markSetiSignal(s, player.seat, choice.sectorId);
      }
      return done();
    }
    case 'completed-sector-order': {
      if (choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return err('Choose a completed sector');
      resolveSetiSector(s, choice.sectorId, player.seat);
      s.pending.shift();
      settleSetiCompletedSectors(s, player.seat);
      settleChoiceConsequences(s, player.seat);
      return { ok: true };
    }
    case 'trace-space': {
      if (choice.kind !== 'trace-space') return err('Choose a highlighted trace space');
      const failure = resolveTraceChoice(s, player, decision, choice.spaceId);
      if (failure) return err(failure);
      emit(s, player, `places a ${decision.color} trace`, choice.spaceId);
      return done();
    }
    case 'gold-tile': {
      const alreadyClaimed = new Set(player.goldClaims.map((claim) => claim.tileId));
      if (choice.kind !== 'gold-tile' || !decision.options.includes(choice.tileId) || alreadyClaimed.has(choice.tileId)) return err('Choose a highlighted unclaimed gold tile');
      if (player.goldClaims.some((claim) => claim.threshold === decision.threshold)) return err('That milestone was already resolved');
      const definition = goldDefinition(s, choice.tileId);
      const claimOrder = goldClaimCount(s, choice.tileId);
      const pointsPerSet = setiGoldPointsPerSet(definition, claimOrder);
      player.goldClaims.push({ threshold: decision.threshold, tileId: choice.tileId, pointsPerSet, claimOrder });
      emit(s, player, `claims the ${decision.threshold} milestone`, choice.tileId);
      return done();
    }
    case 'tech-stack': {
      if (choice.kind !== 'tech-stack' || !decision.options.includes(choice.stackId)) return err('Choose a highlighted technology stack');
      const preparedOperation: Extract<SetiProjectOp, { kind: 'research' }> | undefined = decision.rotateApplied
        ? { kind: 'research', technology: 'any', cost: 'free', rotateSolarSystem: false, gainTileReward: true }
        : undefined;
      const failure = acquireTechnology(s, player, choice.stackId, decision.free, preparedOperation, decision.resolutionId);
      if (failure) return err(failure);
      return done();
    }
    case 'computer-tech-slot': {
      if (choice.kind !== 'number' || !decision.options.includes(choice.value as SetiComputerTechBoardSlot)) return err('Choose one highlighted computer technology slot');
      const boardSlot = choice.value as SetiComputerTechBoardSlot;
      if (Object.values(player.computer.tech).some((state) => state?.boardSlot === boardSlot)) return err('That computer technology slot is occupied');
      const owned = player.techs.find((tech) => tech.stackId === decision.stackId && tech.tileId === decision.tileId);
      if (!owned || SETI_TECH_BY_ID[owned.stackId]?.type !== 'computer') return err('That computer technology is unavailable');
      owned.computerSlot = boardSlot;
      player.computer.tech[decision.stackId] = { boardSlot, lower: false };
      emit(s, player, 'installs a computer technology', `Slot ${boardSlot + 1}`);
      return done();
    }
    case 'mars-first-data': {
      if (choice.kind !== 'number' || !decision.options.includes(choice.value)) return err('Choose an available Mars landing bonus');
      const index = s.planets.Mars.firstLandingBonuses.indexOf(choice.value);
      if (index < 0) return err('Mars landing bonus is no longer available');
      const spacecraft = s.placedSpacecraft.find((piece) => piece.id === decision.spacecraftId && piece.owner === player.seat && piece.kind === 'lander' && piece.body === 'Mars');
      if (!spacecraft) return err('The Mars lander awaiting that reward is no longer available');
      s.planets.Mars.firstLandingBonuses.splice(index, 1);
      spacecraft.spaceId = setiFirstLandingSpaceId('Mars', choice.value);
      spacecraft.coveredReward = { kind: 'first-landing-data', amount: choice.value };
      gainData(player, choice.value);
      return done();
    }
    case 'tuck-income-card': {
      if (decision.optional && choice.kind === 'option' && choice.option === 'skip') return done();
      if (choice.kind !== 'card' || !decision.options.includes(choice.cardId)) return err('Choose a highlighted card to tuck');
      const failure = tuckCard(s, player, choice.cardId, false);
      if (failure) return err(failure);
      return done();
    }
    case 'card-effect-choice': {
      const option = choice.kind === 'option' ? choice.option : choice.kind === 'options' && choice.options.length === 1 ? choice.options[0] : null;
      if (!option || !decision.options.includes(option)) return err('Choose a highlighted printed-effect option');
      const alien = resolveSetiAlienChoice(s, player, decision, option, SETI_ALIEN_HOOKS);
      if (alien.handled) return alien.error ? err(alien.error) : done();
      if (decision.cardId === 'seti_reward_draw_project') {
        if (option === 'deck') drawIntoHand(s, player, 1);
        else {
          const row = Number(option.slice(4));
          const card = s.projectRow[row];
          if (!option.startsWith('row:') || !card) return err('That project-row card is unavailable');
          player.hand.push(card);
          s.projectRow[row] = null;
          refillSetiProjectRow(s);
        }
      }
      return done();
    }
    case 'alien-card-source': case 'centaurian-reward': case 'exertian-card': {
      const option = choice.kind === 'option' ? choice.option : null;
      if (!option || !decision.options.includes(option)) return err('Choose a highlighted option');
      const alien = resolveSetiAlienChoice(s, player, decision, option, SETI_ALIEN_HOOKS);
      return alien.error ? err(alien.error) : done();
    }
    case 'solo-objective-task': {
      const option = choice.kind === 'option' ? choice.option : null;
      if (!option || !decision.options.includes(option)) return err('Choose a highlighted solo objective task');
      const failure = resolveSetiSoloObjectiveChoice(s, option);
      return failure ? err(failure) : done();
    }
    case 'project-visit-reward': {
      const option = choice.kind === 'option' ? choice.option : null;
      if ((option !== 'publicity' && option !== 'move') || !decision.options.includes(option)) return err('Choose publicity or one movement');
      s.pending.shift();
      if (option === 'publicity') {
        gainPublicity(player, 1);
        settleChoiceConsequences(s, player.seat);
      } else {
        beginSetiProjectResolution(s, player, decision.sourceCardId, 'temporary-rule', [{ kind: 'move', amount: 1 }], SETI_PROJECT_ADAPTER);
      }
      return { ok: true };
    }
    case 'manual-trigger-choice': {
      const option = choice.kind === 'option' ? choice.option : null;
      if (!option || !decision.options.includes(option)) return err('Choose a highlighted option');
      const project = resolveSetiProjectManualTrigger(s, player, decision, option, SETI_PROJECT_ADAPTER);
      if (project) return project.ok ? { ok: true } : err(project.error ?? 'Project trigger could not resolve');
      s.log.push(`${player.name}: resolves ${decision.kind} (${option}) through its bounded trigger adapter.`);
      return done();
    }
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function applySetiAction(s: SetiState, seat: number, action: SetiAction): SetiResult {
  const player = s.players[seat];
  if (!player) return err('Invalid seat');

  if (action.type === 'choose_initial_income') {
    const head = s.pending[0];
    if (!head || head.kind !== 'initial-income-card' || head.owner !== seat) return err('No starting income choice is waiting for you');
    return resolveChoice(s, player, head, { kind: 'card', cardId: action.cardId });
  }
  if (action.type === 'choose') {
    const queued = s.pending[0] ?? null;
    const decision = queued?.owner === seat
      ? queued
      : s.deferredEndRoundCard?.owner === seat
        ? s.deferredEndRoundCard
        : null;
    if (!decision) {
      if (queued || s.deferredEndRoundCard) return err('That decision belongs to another player');
      return err('No decision is waiting');
    }
    return resolveChoice(s, player, decision, action.choice);
  }

  const interruptibleFreeAction = ['move', 'place_data', 'discard_for_corner', 'buy_card', 'exchange', 'complete_alien_mission', 'deliver_sample'].includes(action.type);
  const awaitingProject = s.projectRuntime.resolution?.awaiting;
  const projectDecision = s.pending[0];
  const decisionResolutionId = projectDecision && 'resolutionId' in projectDecision ? projectDecision.resolutionId : undefined;
  const canInterruptProject = !!awaitingProject
    && interruptibleFreeAction
    && decisionResolutionId === s.projectRuntime.resolution?.id
    && awaitingProject.kind !== 'move'
    && awaitingProject.kind !== 'tuck-income'
    && awaitingProject.kind !== 'market-corners'
    && (awaitingProject.kind !== 'scan' || awaitingProject.phase === 'choose-step');
  const activeError = activePlayerError(
    s,
    seat,
    action.type !== 'launch' && action.type !== 'orbit' && action.type !== 'land' && action.type !== 'scan' && action.type !== 'analyze' && action.type !== 'research' && action.type !== 'play_card' && action.type !== 'pass',
    canInterruptProject,
  );
  if (activeError) return err(activeError);
  const pendingBeforeInterrupt = canInterruptProject ? [...s.pending] : [];
  const finishInterrupt = (): SetiResult => {
    if (canInterruptProject && projectDecision) {
      const prior = new Set(pendingBeforeInterrupt);
      if (s.pending.some((decision) => !prior.has(decision))) {
        suspendSetiProjectForInterrupt(s, projectDecision, pendingBeforeInterrupt);
      }
    }
    return { ok: true };
  };
  touchSetiProjectRevision(s);

  switch (action.type) {
    case 'launch': {
      const piece = launchProbe(s, player, false);
      if (!piece) return err(setiProbesInSpace(s, seat) >= setiProbeLimit(player) ? 'Probe limit reached' : 'Not enough credits');
      addSetiProjectTurnBody(s, player, 'Earth');
      queueSetiProjectTrigger(s, player, { kind: 'launch' });
      s.mainActionTaken = true;
      recordSetiSoloObjectiveEvent(s, { kind: 'main-action', action: 'launch' });
      emit(s, player, 'launches a probe', 'Earth', { pieceId: piece.id, to: piece.cell });
      offerConditionalProjectsIfIdle(s, player);
      return { ok: true };
    }
    case 'move': {
      const piece = s.solar.pieces.find((candidate) => candidate.id === action.pieceId && candidate.owner === seat);
      if (!piece) return err('Piece is not yours or is not in space');
      if (!adjacentSetiCells(piece.cell).includes(action.to)) return err('Destination is not orthogonally adjacent');
      const ignoresSurcharge = setiProjectHasTemporaryRule(s, player, 'ignore-asteroid-exit-surcharge');
      const surcharge = isSetiAsteroidCell(s, piece.cell) && !setiPlayerHasAbility(player, 'asteroid-navigation') && !ignoresSurcharge ? SETI_RULES.asteroidExitEnergy : 0;
      const cost = SETI_RULES.moveEnergy + surcharge;
      if (action.payment?.cardId) {
        const card = SETI_PROJECT_CATALOG_BY_ID[action.payment.cardId];
        if (!card || !player.hand.includes(action.payment.cardId) || card.freeCorner !== 'move') return err('Selected card has no verified movement corner');
        if (player.energy < surcharge) return err('Not enough energy to leave asteroids');
        player.hand.splice(player.hand.indexOf(action.payment.cardId), 1);
        s.projectDiscard.push(action.payment.cardId);
        queueSetiProjectTrigger(s, player, { kind: 'discard-free-corner', freeCorner: 'move' });
        if (surcharge > 0) {
          player.energy -= surcharge;
        }
      } else {
        if (player.energy < cost) return err('Not enough energy');
        if (action.payment?.energy !== undefined && action.payment.energy !== cost) return err(`Movement costs exactly ${cost} energy`);
        player.energy -= cost;
      }
      const from = piece.cell;
      piece.cell = action.to;
      recordSolarVisit(s, player, piece, from, action.to);
      emit(s, player, 'moves a probe', `${from} to ${action.to}`, { pieceId: piece.id, from, to: action.to });
      offerConditionalProjectsIfIdle(s, player);
      return finishInterrupt();
    }
    case 'orbit': {
      const piece = s.solar.pieces.find((candidate) => candidate.id === action.pieceId && candidate.owner === seat && candidate.kind === 'probe');
      if (!piece) return err('Choose one of your probes');
      if (action.body === 'Pluto') {
        const operation = installedPlutoOperation(s, player);
        if (!operation || parseSetiCell(piece.cell).ring !== 2) return err('Pluto is available only to its owner from the outer ring');
        if (s.projectRuntime.pluto.orbiters.length >= operation.orbitCapacity) return err('Pluto orbit is occupied');
        if (player.credits < operation.orbitCost.credit || player.energy < operation.orbitCost.energy) return err('Pluto orbit costs 1 credit and 1 energy');
        player.credits -= operation.orbitCost.credit;
        player.energy -= operation.orbitCost.energy;
        removeOwnedPiece(s, player, piece.id);
        placeSetiSpacecraft(s, { owner: seat, kind: 'orbiter', body: 'Pluto', spaceId: 'seti_pluto_orbit', coveredReward: null });
        s.mainActionTaken = true;
        addSetiProjectTurnBody(s, player, 'Pluto');
        queueSetiProjectTrigger(s, player, { kind: 'orbit', body: 'Pluto' });
        recordSetiSoloObjectiveEvent(s, { kind: 'main-action', action: 'orbit' });
        emit(s, player, 'places an orbiter at Pluto', '1 credit and 1 energy', { body: 'Pluto' });
        beginSetiProjectResolution(s, player, s.projectRuntime.pluto.cardId!, 'permanent-reward', operation.orbitReward, SETI_PROJECT_ADAPTER);
        return { ok: true };
      }
      const body = bodyAtSetiCell(s, piece.cell);
      if (!body || body === 'Earth' || body !== action.body || SETI_BODIES[action.body].moon) return err('Probe is not visiting that planet');
      if (player.credits < SETI_RULES.orbitCredits || player.energy < SETI_RULES.orbitEnergy) return err('Orbit costs 1 credit and 1 energy');
      player.credits -= SETI_RULES.orbitCredits;
      player.energy -= SETI_RULES.orbitEnergy;
      removeOwnedPiece(s, player, piece.id);
      const planet = s.planets[action.body];
      const first = setiFirstOrbitSpaceAvailable(s, action.body);
      placeSetiSpacecraft(s, {
        owner: seat,
        kind: 'orbiter',
        body: action.body,
        ...(first ? { spaceId: setiFirstOrbitSpaceId(action.body), coveredReward: { kind: 'first-orbit-vp' as const, amount: 3 as const } } : { coveredReward: null }),
      });
      if (first) gainScore(player, 3);
      const reward = SETI_BODIES[action.body].orbitReward;
      if (action.body === 'Oumuamua') applySetiOumuamuaOrbitReward(s, player);
      else if (reward.status === 'typed') applyKnownRewardOps(s, player, reward.ops);
      addSetiProjectTurnBody(s, player, action.body);
      queueSetiProjectTrigger(s, player, { kind: 'orbit', body: action.body });
      recordSetiSoloObjectiveTrigger(s, [
        { kind: 'main-action', action: 'orbit' },
        { kind: 'orbit-or-land', body: action.body },
      ]);
      s.mainActionTaken = true;
      emit(s, player, `places an orbiter at ${action.body}`, first ? 'First orbiter: 3 VP' : '', { body: action.body });
      offerConditionalProjectsIfIdle(s, player);
      return { ok: true };
    }
    case 'land': {
      const piece = s.solar.pieces.find((candidate) => candidate.id === action.pieceId && candidate.owner === seat && candidate.kind === 'probe');
      if (!piece) return err('Choose one of your probes');
      if (action.body === 'Pluto') {
        const operation = installedPlutoOperation(s, player);
        if (!operation || parseSetiCell(piece.cell).ring !== 2) return err('Pluto is available only to its owner from the outer ring');
        if (s.projectRuntime.pluto.landers.length >= operation.landCapacity) return err('Pluto landing is occupied');
        const discount = operation.landCost.technologyDiscountApplies && setiPlayerHasAbility(player, 'landing-discount') ? 1 : 0;
        const cost = Math.max(0, (s.projectRuntime.pluto.orbiters.length ? operation.landCost.energyWithOrbiter : operation.landCost.energy) - discount);
        if (player.energy < cost) return err(`Pluto landing costs ${cost} energy`);
        player.energy -= cost;
        removeOwnedPiece(s, player, piece.id);
        placeSetiSpacecraft(s, { owner: seat, kind: 'lander', body: 'Pluto', spaceId: 'seti_pluto_landing', coveredReward: null });
        s.mainActionTaken = true;
        addSetiProjectTurnBody(s, player, 'Pluto');
        queueSetiProjectTrigger(s, player, { kind: 'land', body: 'Pluto' });
        recordSetiSoloObjectiveEvent(s, { kind: 'main-action', action: 'land' });
        emit(s, player, 'lands on Pluto', `${cost} energy`, { body: 'Pluto' });
        beginSetiProjectResolution(s, player, s.projectRuntime.pluto.cardId!, 'permanent-reward', operation.landReward, SETI_PROJECT_ADAPTER);
        return { ok: true };
      }
      const primary = bodyAtSetiCell(s, piece.cell);
      const definition = SETI_BODIES[action.body];
      if (!primary || primary === 'Earth') return err('Probe is not visiting a landable body');
      if (definition.moon) {
        if (definition.parent !== primary) return err('That moon does not orbit the visited planet');
        if (!setiPlayerHasAbility(player, 'moon-landing')) return err('Moon-landing technology required');
        if (s.planets[action.body].landers.length) return err('Moon is already occupied');
      } else if (action.body !== primary) return err('Probe is not visiting that planet');
      const orbitBody = definition.moon ? definition.parent! : action.body as SetiPrimaryBody;
      const hasOrbiter = s.planets[orbitBody].orbiters.length > 0;
      const discount = setiPlayerHasAbility(player, 'landing-discount') ? 1 : 0;
      const cost = Math.max(0, (hasOrbiter ? SETI_RULES.landWithOrbiterEnergy : SETI_RULES.landEnergy) - discount);
      if (player.energy < cost) return err(`Landing costs ${cost} energy`);
      player.energy -= cost;
      removeOwnedPiece(s, player, piece.id);
      let coveredReward: { kind: 'first-landing-data'; amount: number } | { kind: 'moon-landing' } | null = definition.moon ? { kind: 'moon-landing' } : null;
      let coveredSpaceId = definition.moon ? setiMoonLandingSpaceId(action.body) : undefined;
      if (action.body !== 'Mars' && !definition.moon && s.planets[action.body].firstLandingBonuses.length) {
        const amount = s.planets[action.body].firstLandingBonuses.shift()!;
        coveredReward = { kind: 'first-landing-data', amount };
        coveredSpaceId = setiFirstLandingSpaceId(action.body, amount);
        gainData(player, amount);
      }
      const spacecraft = placeSetiSpacecraft(s, {
        owner: seat,
        kind: 'lander',
        body: action.body,
        ...(coveredSpaceId ? { spaceId: coveredSpaceId } : {}),
        coveredReward,
      });
      if (action.body === 'Mars' && s.planets.Mars.firstLandingBonuses.length) {
        s.pending.push({ kind: 'mars-first-data', owner: seat, spacecraftId: spacecraft.id, options: [...s.planets.Mars.firstLandingBonuses] });
      }
      if (action.body === 'Oumuamua') applySetiOumuamuaLandingReward(s, player);
      else applyKnownRewardOps(s, player, definition.landingRewards);
      addSetiProjectTurnBody(s, player, action.body);
      queueSetiProjectTrigger(s, player, { kind: 'land', body: action.body });
      recordSetiSoloObjectiveTrigger(s, [
        { kind: 'main-action', action: 'land' },
        { kind: 'orbit-or-land', body: (SETI_BODIES[action.body].parent ?? action.body) as SetiPrimaryBody },
      ]);
      s.mainActionTaken = true;
      emit(s, player, `lands on ${action.body}`, `${cost} energy`, { body: action.body });
      offerConditionalProjectsIfIdle(s, player);
      return { ok: true };
    }
    case 'scan': {
      if (player.credits < SETI_RULES.scanCredits || player.energy < SETI_RULES.scanEnergy) return err('Scan costs 1 credit and 2 energy');
      if (!s.projectRow.some(Boolean)) return err('Project row is empty');
      player.credits -= SETI_RULES.scanCredits;
      player.energy -= SETI_RULES.scanEnergy;
      s.mainActionTaken = true;
      recordSetiSoloObjectiveEvent(s, { kind: 'main-action', action: 'scan' });
      beginSetiProjectResolution(
        s,
        player,
        'seti_main_scan',
        'temporary-rule',
        [{ kind: 'scan', baseCost: 'waived', optionalTechnologyCosts: 'pay' }],
        SETI_PROJECT_ADAPTER,
      );
      emit(s, player, 'begins a scan', 'Choose the two printed Scan steps and any telescope technologies');
      return { ok: true };
    }
    case 'place_data': {
      if (player.dataPool <= 0) return err('No data in your pool');
      const decoded = decodeSetiComputerSlot(player, action.slot);
      if (!decoded) return err('Invalid computer space');
      if (decoded.kind === 'top') {
        const leftmost = player.computer.top.findIndex((filled) => !filled);
        if (decoded.index !== leftmost) return err('Fill the leftmost open top computer space');
        player.computer.top[decoded.index] = true;
        player.dataPool--;
        const installed = Object.entries(player.computer.tech).find(([, state]) => state
          && SETI_COMPUTER_TECH_TOP_SPACES[state.boardSlot] === decoded.index);
        if (installed) gainScore(player, 2);
        else if (decoded.index === 1) gainPublicity(player, 1);
        else if (decoded.index === 3) queueTuckIncome(s, player, 1);
      } else {
        const state = player.computer.tech[decoded.stackId]!;
        const topSpace = SETI_COMPUTER_TECH_TOP_SPACES[state.boardSlot];
        if (!player.computer.top[topSpace]) return err('Fill the aligned upper computer space first');
        if (state.lower) return err('Lower technology space is already filled');
        state.lower = true;
        player.dataPool--;
        const owned = player.techs.find((tech) => tech.stackId === decoded.stackId);
        const tile = owned ? SETI_TECH_BY_ID[decoded.stackId]?.tiles.find((candidate) => candidate.id === owned.tileId) : null;
        if (tile) applyKnownRewardOps(s, player, tile.immediateReward.ops);
      }
      emit(s, player, 'places data in the computer', `Space ${action.slot}`);
      offerConditionalProjectsIfIdle(s, player);
      return finishInterrupt();
    }
    case 'analyze': {
      if (!player.computer.top.every(Boolean)) return err('Fill all six top computer spaces first');
      if (player.energy < SETI_RULES.analyzeEnergy) return err('Analyze costs 1 energy');
      player.energy--;
      player.computer.top.fill(false);
      for (const state of Object.values(player.computer.tech)) if (state) state.lower = false;
      queueTrace(s, player, 'blue', 1);
      s.mainActionTaken = true;
      recordSetiSoloObjectiveEvent(s, { kind: 'main-action', action: 'analyze' });
      emit(s, player, 'analyzes data', 'Blue trace earned');
      return { ok: true };
    }
    case 'research': {
      if (player.publicity < SETI_RULES.researchPublicity) return err('Research costs 6 publicity');
      const options = SETI_TECH_STACKS
        .filter((stack) => s.techStacks[stack.id].tiles.length > 0 && !player.techs.some((tech) => tech.stackId === stack.id))
        .map((stack) => stack.id);
      if (!options.length) return err('No technology remains available');
      player.publicity -= SETI_RULES.researchPublicity;
      rotateSetiSolarSystem(s);
      s.pending.push({ kind: 'tech-stack', owner: seat, options, free: true, rotateApplied: true });
      s.mainActionTaken = true;
      emit(s, player, 'begins technology research', 'Choose one physical technology stack');
      return { ok: true };
    }
    case 'play_card': {
      if (player.alienHand.includes(action.cardId)) {
        const failure = playSetiAlienCard(s, player, action.cardId, SETI_ALIEN_HOOKS);
        if (failure) return err(failure);
        s.mainActionTaken = true;
        settleSetiAlienAutomaticContinuations(s, SETI_ALIEN_HOOKS);
        emit(s, player, `plays ${SETI_ALIEN_CARDS_BY_ID[action.cardId]?.name ?? 'an alien card'}`);
        offerConditionalProjectsIfIdle(s, player);
        return { ok: true };
      }
      const definition = SETI_PROJECT_CATALOG_BY_ID[action.cardId];
      if (!definition || !player.hand.includes(action.cardId)) return err('Card is not in your hand');
      if (player.credits < definition.cost) return err('Not enough credits');
      player.credits -= definition.cost;
      player.hand.splice(player.hand.indexOf(action.cardId), 1);
      s.mainActionTaken = true;
      recordSetiSoloObjectiveEvent(s, { kind: 'play-project-for-effect', printedCreditCost: definition.cost });
      s.projectRuntime.resolvingCard = {
        owner: player.seat,
        cardId: action.cardId,
        destination: projectCardDestination(definition.cardType),
        playEvent: { kind: 'play-project', printedCost: definition.cost, sourceCardId: definition.sourceCardId },
        relocated: false,
      };
      beginSetiProjectResolution(s, player, action.cardId, 'on-play', setiProjectOnPlayOperations(action.cardId), SETI_PROJECT_ADAPTER);
      return { ok: true };
    }
    case 'discard_for_corner': {
      if (player.alienHand.includes(action.cardId)) {
        const failure = discardSetiAlienCardForCorner(s, player, action.cardId, SETI_ALIEN_HOOKS);
        if (failure) return err(failure);
        emit(s, player, `discards ${SETI_ALIEN_CARDS_BY_ID[action.cardId]?.name ?? 'an alien card'} for its corner`);
        offerConditionalProjectsIfIdle(s, player);
        return finishInterrupt();
      }
      const definition = SETI_PROJECT_CATALOG_BY_ID[action.cardId];
      if (!definition || !player.hand.includes(action.cardId)) return err('Card is not in your hand');
      if (definition.freeCorner === 'move') return err('Select a probe and use this card as its movement payment');
      player.hand.splice(player.hand.indexOf(action.cardId), 1);
      s.projectDiscard.push(action.cardId);
      switch (definition.freeCorner) {
        case 'publicity': gainPublicity(player, 1); break;
        case 'data': gainData(player, 1); break;
      }
      queueSetiProjectTrigger(s, player, { kind: 'discard-free-corner', freeCorner: definition.freeCorner });
      queueSetiConditionalMissionOffers(s, player);
      emit(s, player, `discards ${definition.canonicalName} for its corner`);
      return finishInterrupt();
    }
    case 'complete_alien_mission': {
      const failure = completeSetiAlienMission(s, player, action.cardId, SETI_ALIEN_HOOKS);
      if (failure) return err(failure);
      recordSetiSoloObjectiveEvent(s, { kind: 'complete-mission' });
      emit(s, player, `completes ${SETI_ALIEN_CARDS_BY_ID[action.cardId]?.name ?? 'an alien mission'}`);
      return finishInterrupt();
    }
    case 'deliver_sample': {
      const failure = deliverSetiMascamiteSample(s, player, action.pieceId, action.cardId, SETI_ALIEN_HOOKS);
      if (failure) return err(failure);
      recordSetiSoloObjectiveEvent(s, { kind: 'complete-mission' });
      emit(s, player, `delivers a Mascamite sample`, SETI_ALIEN_CARDS_BY_ID[action.cardId]?.name ?? action.cardId);
      return finishInterrupt();
    }
    case 'buy_card': {
      if (player.publicity < SETI_RULES.buyPublicity) return err('Buying a card costs 3 publicity');
      let card: string | null = null;
      if (action.source === 'deck') card = drawSetiProjectCard(s);
      else if (Number.isInteger(action.source) && action.source >= 0 && action.source < s.projectRow.length) {
        card = s.projectRow[action.source];
        if (card) s.projectRow[action.source] = null;
      }
      if (!card) return err('Selected project source is empty');
      player.publicity -= SETI_RULES.buyPublicity;
      player.hand.push(card);
      refillSetiProjectRow(s);
      emit(s, player, 'buys a project card', SETI_PROJECT_CATALOG_BY_ID[card]?.canonicalName ?? card);
      offerConditionalProjectsIfIdle(s, player);
      return finishInterrupt();
    }
    case 'exchange': {
      if (action.receive === 'card') {
        if (typeof action.row === 'number') {
          if (!Number.isInteger(action.row) || action.row < 0 || action.row >= s.projectRow.length || !s.projectRow[action.row]) return err('Selected project source is empty');
        } else if (s.projectDeck.length + s.projectDiscard.length === 0) return err('Project deck is empty');
      }
      if (action.give === 'cards') {
        const cards = action.cardIds ?? [];
        if (cards.length !== 2 || new Set(cards).size !== 2) return err('Exchange exactly two cards from your hand');
        if (cards.some((card) => !player.hand.includes(card) && !player.alienHand.includes(card))) return err('A selected card is not in your hand');
        if (cards.some((card) => SETI_ALIEN_CARDS_BY_ID[card]?.species === 'exertians')) return err('Exertian cards cannot be exchanged');
        for (const card of cards) {
          const projectIndex = player.hand.indexOf(card);
          if (projectIndex >= 0) {
            player.hand.splice(projectIndex, 1);
            s.projectDiscard.push(card);
          } else {
            player.alienHand.splice(player.alienHand.indexOf(card), 1);
            const definition = SETI_ALIEN_CARDS_BY_ID[card];
            s.species.find((slot) => slot.speciesId === definition.species)?.alienDiscard.push(card);
          }
        }
      } else if (action.give === 'credits') {
        if (player.credits < 2) return err('Exchange requires 2 credits');
        player.credits -= 2;
      } else {
        if (player.energy < 2) return err('Exchange requires 2 energy');
        player.energy -= 2;
      }
      if (action.receive === 'credit') player.credits++;
      else if (action.receive === 'energy') player.energy++;
      else {
        let card: string | null = null;
        if (typeof action.row === 'number') {
          card = s.projectRow[action.row] ?? null;
          if (card) s.projectRow[action.row] = null;
        } else card = drawSetiProjectCard(s);
        if (!card) return err('Selected project source is empty');
        player.hand.push(card);
        refillSetiProjectRow(s);
      }
      emit(s, player, 'exchanges resources', `${action.give} for ${action.receive}`);
      offerConditionalProjectsIfIdle(s, player);
      return finishInterrupt();
    }
    case 'pass': {
      player.passed = true;
      s.passedSeats.push(seat);
      s.mainActionTaken = true;
      s.passResolutionSeat = seat;
      const firstPass = s.firstPassSeat === null;
      if (s.firstPassSeat === null) {
        s.firstPassSeat = seat;
      }
      const ordinaryAliens = player.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species !== 'exertians');
      const handSize = player.hand.length + ordinaryAliens.length;
      if (handSize > SETI_RULES.handLimitAtPass) {
        s.pending.push({ kind: 'discard-to-four', owner: seat, count: handSize - SETI_RULES.handLimitAtPass, reason: 'pass' });
      }
      s.turnResolution = { kind: 'pass', seat, milestonesQueued: false, passStage: 'discard', firstPass };
      emit(s, player, 'passes', firstPass ? 'First passer rotates the solar system after discarding' : '');
      settleTurnResolution(s);
      return { ok: true };
    }
    case 'end_turn': {
      if (!s.mainActionTaken) return err('Take one main action before ending the turn');
      s.turnResolution = { kind: 'end-turn', seat, milestonesQueued: false };
      emit(s, player, 'ends the turn');
      settleTurnResolution(s);
      return { ok: true };
    }
    default: return err('Unknown SETI action');
  }
}

// ---------------------------------------------------------------------------
// Deterministic bot
// ---------------------------------------------------------------------------

function choiceForBot(s: SetiState, player: SetiPlayer, decision: SetiPendingDecision): SetiAction {
  switch (decision.kind) {
    case 'initial-income-card': return { type: 'choose_initial_income', cardId: decision.options[0] };
    case 'discard-to-four': {
      const options = [...player.hand, ...player.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species !== 'exertians')];
      return { type: 'choose', choice: { kind: 'cards', cardIds: options.slice(-decision.count) } };
    }
    case 'end-round-card': return { type: 'choose', choice: { kind: 'card', cardId: decision.options[0] } };
    case 'tuck-income-card': return decision.optional
      ? { type: 'choose', choice: { kind: 'option', option: 'skip' } }
      : { type: 'choose', choice: { kind: 'card', cardId: decision.options[0] } };
    case 'signal-sector': {
      const row = decision.source === 'project-row' ? decision.rowOptions?.[0] : undefined;
      const rowColor = row === undefined || !s.projectRow[row] ? null : SETI_PROJECT_CATALOG_BY_ID[s.projectRow[row]!]?.signalColor;
      const matching = rowColor ? decision.options.filter((sectorId) => SETI_SECTORS.find((sector) => sector.id === sectorId)?.printedSignalColor === rowColor) : decision.options;
      const sectorId = [...matching].sort((a, b) => s.sectors[b].dataRemaining - s.sectors[a].dataRemaining || a.localeCompare(b))[0];
      return { type: 'choose', choice: { kind: 'sector', sectorId, ...(row !== undefined ? { row } : {}) } };
    }
    case 'completed-sector-order': return { type: 'choose', choice: { kind: 'sector', sectorId: decision.options[0] } };
    case 'trace-space': return { type: 'choose', choice: { kind: 'trace-space', spaceId: decision.options[0] } };
    case 'gold-tile': return { type: 'choose', choice: { kind: 'gold-tile', tileId: decision.options[0] } };
    case 'tech-stack': return { type: 'choose', choice: { kind: 'tech-stack', stackId: decision.options[0] } };
    case 'computer-tech-slot': return { type: 'choose', choice: { kind: 'number', value: decision.options[0] } };
    case 'mars-first-data': return { type: 'choose', choice: { kind: 'number', value: Math.max(...decision.options) } };
    case 'card-effect-choice': return { type: 'choose', choice: { kind: 'option', option: decision.options[0] } };
    case 'alien-card-source': case 'centaurian-reward': case 'exertian-card': case 'solo-objective-task': case 'project-visit-reward': case 'manual-trigger-choice':
      return { type: 'choose', choice: { kind: 'option', option: decision.options[0] } };
  }
}

function distanceTowardBody(s: SetiState, from: SetiCellId): SetiCellId | null {
  const targets = new Set(Object.entries(getSetiBodyCells(s)).filter(([body]) => body !== 'Earth').map(([, cell]) => cell));
  const queue: { cell: SetiCellId; first: SetiCellId | null }[] = [{ cell: from, first: null }];
  const seen = new Set<SetiCellId>([from]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.cell !== from && targets.has(current.cell)) return current.first;
    for (const next of adjacentSetiCells(current.cell)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ cell: next, first: current.first ?? next });
    }
  }
  return null;
}

export function chooseSetiBotAction(s: SetiState, seat = s.activeSeat): SetiAction | null {
  const player = s.players[seat];
  if (!player || s.phase === 'ended') return null;
  const queued = s.pending[0] ?? null;
  const decision = queued?.owner === seat
    ? queued
    : s.deferredEndRoundCard?.owner === seat
      ? s.deferredEndRoundCard
      : null;
  if (decision) return choiceForBot(s, player, decision);
  if (queued) return null;
  if (s.phase !== 'playing' || s.activeSeat !== seat || player.passed) return null;
  const dataSlot = setiComputerSlotIds(player)[0];
  if (player.dataPool > 0 && dataSlot !== undefined) return { type: 'place_data', slot: dataSlot };
  if (s.mainActionTaken) return { type: 'end_turn' };

  const legal = getSetiLegalTargets(s, seat);
  if (legal.canAnalyze) return { type: 'analyze' };
  for (const piece of s.solar.pieces.filter((candidate) => candidate.owner === seat && candidate.kind === 'probe')) {
    const lands = legal.landTargets[piece.id];
    if (lands?.length) return { type: 'land', pieceId: piece.id, body: lands[0] };
    const orbits = legal.orbitTargets[piece.id];
    if (orbits?.length) return { type: 'orbit', pieceId: piece.id, body: orbits[0] };
  }
  if (legal.canLaunch) return { type: 'launch' };
  const movable = s.solar.pieces.find((piece) => piece.owner === seat && legal.moveTargets[piece.id]?.length);
  if (movable) {
    const toward = distanceTowardBody(s, movable.cell);
    if (toward && legal.moveTargets[movable.id].includes(toward)) {
      const energy = legal.moveEnergyCost[movable.id][toward] ?? SETI_RULES.moveEnergy;
      const movementCard = player.hand.find((cardId) => SETI_PROJECT_CATALOG_BY_ID[cardId]?.freeCorner === 'move');
      const payment = player.energy >= energy ? { energy } : movementCard ? { cardId: movementCard } : { energy };
      return { type: 'move', pieceId: movable.id, to: toward, payment };
    }
  }
  if (player.credits >= SETI_RULES.scanCredits && player.energy >= SETI_RULES.scanEnergy && s.projectRow.some(Boolean)) return { type: 'scan' };
  if (legal.canResearch) return { type: 'research' };
  return { type: 'pass' };
}

export function runSetiBotGame(s: SetiState, maxActions = 5000): number {
  let actions = 0;
  while (s.phase !== 'ended' && actions < maxActions) {
    const owner = s.pending[0]?.owner ?? s.deferredEndRoundCard?.owner ?? s.activeSeat;
    const action = chooseSetiBotAction(s, owner);
    if (!action) throw new Error(`SETI bot has no action in ${s.phase} for seat ${owner}`);
    const result = applySetiAction(s, owner, action);
    if (!result.ok) throw new Error(`SETI bot action failed (${action.type}): ${result.error}`);
    assertSetiState(s);
    actions++;
  }
  if (s.phase !== 'ended') throw new Error(`SETI bot exceeded ${maxActions} actions`);
  return actions;
}

export { getSetiLegalTargets };
