// SETI action reducer. Every board gesture maps to one small, serializable
// action. Main actions never advance the turn; normal turns require end_turn,
// while pass resolves its visual discard/income choices and then advances.

import {
  SETI_BODIES,
  SETI_GOLD_TILES,
  SETI_PROJECT_BY_ID,
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
  type SetiEffectOp,
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
  SETI_NEUTRAL_MARKERS_PER_THRESHOLD,
  assertSetiState,
  bodyAtSetiCell,
  decodeSetiComputerSlot,
  drawSetiProjectCard,
  earthSetiCell,
  earthSetiSectorId,
  getSetiBodyCells,
  getSetiLegalTargets,
  isSetiAsteroidCell,
  isSetiPublicityCell,
  refillSetiProjectRow,
  setiComputerSlotIds,
  setiIncomeCounts,
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
  | { type: 'orbit'; pieceId: string; body: SetiBody }
  | { type: 'land'; pieceId: string; body: SetiBody }
  | { type: 'scan' }
  | { type: 'place_data'; slot: number }
  | { type: 'analyze' }
  | { type: 'research'; stackId: SetiTechStackId }
  | { type: 'play_card'; cardId: string }
  | { type: 'discard_for_corner'; cardId: string }
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

function activePlayerError(s: SetiState, seat: number, allowAfterMain = true): string | null {
  if (s.phase !== 'playing') return 'SETI is not in the action phase';
  if (!s.players[seat]) return 'Invalid seat';
  if (s.activeSeat !== seat) return 'Not your turn';
  if (s.players[seat].passed) return 'You have passed';
  if (s.pending.length) return 'Resolve the highlighted decision first';
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

function drawIntoHand(s: SetiState, player: SetiPlayer, amount: number): void {
  for (let i = 0; i < amount; i++) {
    const card = drawSetiProjectCard(s);
    if (card) player.hand.push(card);
  }
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
  for (let i = 0; i < amount; i++) {
    const options = setiTraceTargets(s, color);
    if (options.length) s.pending.push({ kind: 'trace-space', owner: player.seat, color, options });
    else gainScore(player, 3); // both species boards exhausted: printed overflow value
  }
}

function queueSignal(s: SetiState, player: SetiPlayer, color: SetiSignalColor | null, amount: number, options?: SetiSectorId[]): void {
  for (let i = 0; i < amount; i++) {
    s.pending.push({ kind: 'signal-sector', owner: player.seat, source: 'effect', options: options ?? signalOptionsForColor(color), signalColor: color });
  }
}

function queueTuckIncome(s: SetiState, player: SetiPlayer, amount: number): void {
  for (let i = 0; i < amount && player.hand.length > 0; i++) {
    s.pending.push({ kind: 'tuck-income-card', owner: player.seat, options: [...player.hand] });
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

// ---------------------------------------------------------------------------
// Signals and sector completion
// ---------------------------------------------------------------------------

export function markSetiSignal(s: SetiState, seat: number, sectorId: SetiSectorId): void {
  const player = s.players[seat];
  const sector = s.sectors[sectorId];
  if (!player || !sector) throw new Error('Invalid SETI signal target');
  const excess = sector.dataRemaining === 0;
  const ordinaryBefore = sector.signals.filter((marker) => !marker.excess).length;
  s.markerSequence++;
  sector.signals.push({ owner: seat, sequence: s.markerSequence, excess });
  if (!excess) {
    sector.dataRemaining--;
    gainData(player, 1);
    if (ordinaryBefore === 1) gainScore(player, 2);
  }
  if (sector.dataRemaining === 0) {
    sector.completionPending = true;
    if (!s.deferredCompletedSectors.includes(sectorId)) s.deferredCompletedSectors.push(sectorId);
  }
  emit(s, player, 'marks a signal', SETI_SECTORS.find((definition) => definition.id === sectorId)?.name ?? sectorId, { sectorId });
}

function resolveSetiSector(s: SetiState, sectorId: SetiSectorId): void {
  const sector = s.sectors[sectorId];
  if (!sector.completionPending) return;
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
}

export function settleSetiCompletedSectors(s: SetiState, owner: number): void {
  const pending = s.deferredCompletedSectors.filter((id) => s.sectors[id].completionPending);
  if (pending.length === 0) return;
  if (pending.length === 1) {
    resolveSetiSector(s, pending[0]);
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
  const oldSupport = new Map(s.solar.pieces.map((piece) => [piece.id, piece.supportLayer]));
  if (selected >= 1) s.solar.orientations.disc1 = (s.solar.orientations.disc1 + 7) % 8;
  if (selected >= 2) s.solar.orientations.disc2 = (s.solar.orientations.disc2 + 7) % 8;
  if (selected >= 3) s.solar.orientations.disc3 = (s.solar.orientations.disc3 + 7) % 8;

  for (const piece of s.solar.pieces) {
    const from = piece.cell;
    const supportBefore = oldSupport.get(piece.id) ?? piece.supportLayer;
    const attached = supportBefore >= 1 && supportBefore <= selected;
    const supportAfterAtOldCell = setiSupportLayerForCell(s, piece.cell);
    const bumped = !attached && supportAfterAtOldCell >= 1 && supportAfterAtOldCell <= selected;
    if (attached || bumped) {
      const parsed = parseSetiCell(piece.cell);
      piece.cell = setiCellId(parsed.ring, parsed.sector - 1);
      const player = s.players[piece.owner];
      if (isSetiPublicityCell(s, piece.cell) || bodyAtSetiCell(s, piece.cell) === 'Oumuamua') gainPublicity(player, 1);
      emit(s, player, bumped ? 'is bumped by solar rotation' : 'moves with solar rotation', '', { pieceId: piece.id, from, to: piece.cell });
    }
    piece.supportLayer = setiSupportLayerForCell(s, piece.cell);
  }
  s.solar.rotationPointer = selected === 3 ? 1 : (selected + 1) as 2 | 3;

  const earthSector = parseSetiCell(earthSetiCell(s)).sector;
  for (const slot of s.species) {
    if (slot.revealed && slot.module?.kind === 'anomalies') {
      for (const anomaly of slot.module.anomalies) {
        if (anomaly.sector === earthSector) {
          slot.module.triggerCount++;
          s.log.push(`Anomaly ${anomaly.id} triggers after solar rotation; its printed column reward awaits marked-space resolution.`);
        }
      }
    }
  }
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
        messageQueue: Object.fromEntries(s.players.map((player) => [player.seat, []])),
      };
    case 'exertians': {
      const leader = Math.max(...s.players.map((player) => player.score));
      return { kind: 'exertians', milestones: [leader + 20, leader + 40], dangerBySeat: Object.fromEntries(s.players.map((player) => [player.seat, 0])) };
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
    const discoveryOwners = (['purple', 'orange', 'blue'] as SetiTraceColor[])
      .map((color) => slot.discovery[color]?.owner)
      .filter((owner): owner is number => owner !== null && owner !== undefined);
    if (slot.speciesId === 'exertians') {
      for (const player of s.players) for (let i = 0; i < 3; i++) drawAlienCard(slot, player);
    }
    for (const owner of discoveryOwners) drawAlienCard(slot, s.players[owner]);
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

function resolveNeutralMilestones(s: SetiState): void {
  const high = Math.max(...s.players.map((player) => player.score));
  for (const threshold of SETI_RULES.neutralThresholds) {
    if (s.neutralMilestonesResolved[threshold] || high < threshold) continue;
    s.neutralMilestonesResolved[threshold] = true;
    for (let i = 0; i < SETI_NEUTRAL_MARKERS_PER_THRESHOLD(s.players.length); i++) {
      const target = firstOpenDiscovery(s);
      if (!target) break;
      s.markerSequence++;
      target.slot.discovery[target.color] = { owner: null, sequence: s.markerSequence };
      if (Object.values(target.slot.discovery).every(Boolean) && !s.pendingSpeciesDiscoveries.includes(target.slot.slot)) s.pendingSpeciesDiscoveries.push(target.slot.slot);
    }
  }
}

function queueGoldMilestones(s: SetiState, player: SetiPlayer): void {
  for (const threshold of SETI_RULES.goldThresholds) {
    if (player.score < threshold || player.goldClaims.some((claim) => claim.threshold === threshold)) continue;
    const claimed = new Set(player.goldClaims.map((claim) => claim.tileId));
    const options = s.goldTiles.map((tile) => tile.id).filter((id) => !claimed.has(id));
    if (options.length) s.pending.push({ kind: 'gold-tile', owner: player.seat, threshold, options });
  }
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
}

function goldUnits(s: SetiState, player: SetiPlayer, tileId: SetiGoldTileId): number {
  const side = s.goldTiles.find((tile) => tile.id === tileId)?.side ?? 'A';
  const definition = SETI_GOLD_TILES.find((tile) => tile.id === tileId && tile.side === side)!;
  const byType = (type: string) => player.techs.filter((tech) => SETI_TECH_BY_ID[tech.stackId]?.type === type).length;
  const traces = setiTraceCounts(player);
  const nonStarting = player.incomeCards.filter((income) => !income.starting);
  const incomes = { credit: nonStarting.filter((income) => income.kind === 'credit').length, energy: nonStarting.filter((income) => income.kind === 'energy').length, card: nonStarting.filter((income) => income.kind === 'card').length };
  const sectorWins = SETI_SECTOR_IDS.reduce((sum, id) => sum + s.sectors[id].wins.filter((marker) => marker.owner === player.seat).length, 0);
  switch (definition.unit) {
    case 'tech-set': return Math.min(byType('probe'), byType('telescope'), byType('computer'));
    case 'any-two-techs': return Math.floor(player.techs.length / 2);
    case 'completed-mission': return player.completedMissions.length;
    case 'mission-pair': return Math.floor((player.completedMissions.length + player.scoringCards.length) / 2);
    case 'income-trio': return Math.min(incomes.credit, incomes.energy, incomes.card);
    case 'income-large': return Math.max(incomes.credit, incomes.energy);
    case 'trace-trio': return Math.min(traces.purple, traces.orange, traces.blue);
    case 'sector-and-spacecraft': return Math.min(sectorWins, setiPlayerOrbiters(s, player.seat) + setiPlayerLanders(s, player.seat));
  }
}

function scoreGoldTile(s: SetiState, player: SetiPlayer, tileId: SetiGoldTileId): number {
  const side = s.goldTiles.find((tile) => tile.id === tileId)?.side ?? 'A';
  const definition = SETI_GOLD_TILES.find((tile) => tile.id === tileId && tile.side === side)!;
  const units = goldUnits(s, player, tileId);
  if (units <= 0) return 0;
  return definition.values[0] + (units >= 2 ? definition.values[1] : 0) + Math.max(0, units - 2) * definition.values[2];
}

export function finishSetiGame(s: SetiState): void {
  for (const player of s.players) {
    let final = player.score;
    for (const claim of player.goldClaims) final += scoreGoldTile(s, player, claim.tileId);
    // Untranscribed gold-box project effects remain explicitly unscored rather
    // than receiving guessed values.
    player.finalScore = final;
  }
  for (const slot of s.species) {
    if (slot.module?.kind !== 'exertians') continue;
    const greatest = Math.max(...Object.values(slot.module.dangerBySeat));
    for (const player of s.players) {
      if (greatest > 0 && slot.module.dangerBySeat[player.seat] === greatest) {
        player.finalScore! -= Math.floor(player.finalScore! / 10);
      }
    }
  }
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
  if (s.solo) {
    const need = s.round;
    const spend = Math.min(need, s.solo.completedObjectives.length);
    s.solo.completedObjectives.splice(0, spend);
    s.solo.progress += (need - spend) * 3;
  }
  applyIncome(s);
  s.round++;
  s.startingSeat = s.firstPassSeat ?? s.startingSeat;
  s.activeSeat = s.startingSeat;
  s.firstPassSeat = null;
  s.passResolutionSeat = null;
  s.passedSeats = [];
  for (const player of s.players) player.passed = false;
  s.mainActionTaken = false;
  emit(s, null, `round ${s.round} begins`, `${s.players[s.startingSeat].name} starts`);
}

function settleTurnResolution(s: SetiState): void {
  if (!s.turnResolution || s.pending.length) return;
  const resolution = s.turnResolution;
  const player = s.players[resolution.seat];
  if (!resolution.milestonesQueued) {
    resolution.milestonesQueued = true;
    queueGoldMilestones(s, player);
    if (s.pending.length) return;
  }
  resolveNeutralMilestones(s);
  revealPendingSpecies(s);
  s.turnResolution = null;

  if (resolution.kind === 'pass') {
    s.passResolutionSeat = null;
    if (s.players.every((candidate) => candidate.passed)) finishRound(s);
    else {
      const next = nextUnpassedSeat(s, resolution.seat)!;
      s.activeSeat = next;
      s.mainActionTaken = false;
    }
    return;
  }
  const next = nextUnpassedSeat(s, resolution.seat);
  if (next === null) finishRound(s);
  else {
    s.activeSeat = next;
    s.mainActionTaken = false;
    emit(s, s.players[next], 'turn begins', `Round ${s.round}`);
  }
}

function settleChoiceConsequences(s: SetiState, owner: number): void {
  const ownerPlayer = s.players[owner];
  for (const decision of s.pending) {
    if (decision.owner !== owner) continue;
    if (decision.kind === 'trace-space') decision.options = setiTraceTargets(s, decision.color);
    if (decision.kind === 'tuck-income-card') decision.options = [...ownerPlayer.hand];
  }
  const stillSignals = s.pending.some((decision) => decision.kind === 'signal-sector');
  if (!stillSignals) settleSetiCompletedSectors(s, owner);
  if (!s.pending.some((decision) => decision.kind === 'signal-sector' && decision.source === 'project-row') && s.projectRow.some((card) => card === null)) refillSetiProjectRow(s);
  if (s.phase === 'income-selection' && s.pending.length === 0) {
    s.phase = 'playing';
    s.activeSeat = s.startingSeat;
    s.mainActionTaken = false;
    emit(s, s.players[s.activeSeat], 'turn begins', 'Round 1');
  }
  settleTurnResolution(s);
}

// ---------------------------------------------------------------------------
// Pending decisions
// ---------------------------------------------------------------------------

function tuckCard(s: SetiState, player: SetiPlayer, cardId: string, starting: boolean): string | null {
  const index = player.hand.indexOf(cardId);
  if (index < 0) return 'Card is not in your hand';
  const definition = SETI_PROJECT_BY_ID[cardId];
  if (!definition) return 'Unknown project card';
  player.hand.splice(index, 1);
  player.incomeCards.push({ cardId, kind: definition.printed.incomeCorner, starting });
  return null;
}

function resolveTraceChoice(s: SetiState, player: SetiPlayer, decision: Extract<SetiPendingDecision, { kind: 'trace-space' }>, spaceId: string): string | null {
  if (!decision.options.includes(spaceId)) return 'That trace space is not legal';
  const match = /^seti_species_([01])_(discovery|research|overflow)_(purple|orange|blue)$/.exec(spaceId);
  if (!match) return 'Invalid trace space';
  const slot = s.species[Number(match[1]) as 0 | 1];
  const area = match[2];
  const color = match[3] as SetiTraceColor;
  if (color !== decision.color) return 'Trace color does not match';
  s.markerSequence++;
  if (area === 'discovery') {
    if (slot.revealed || slot.discovery[color]) return 'Discovery space is occupied';
    slot.discovery[color] = { owner: player.seat, sequence: s.markerSequence };
    if (Object.values(slot.discovery).every(Boolean) && !s.pendingSpeciesDiscoveries.includes(slot.slot)) s.pendingSpeciesDiscoveries.push(slot.slot);
  } else {
    const overflow = area === 'overflow';
    slot.research.push({ owner: player.seat, spaceId, color, overflow });
    if (overflow) gainScore(player, 3);
  }
  player.traceMarkers.push({ color, speciesSlot: slot.slot, spaceId, overflow: area === 'overflow' });
  return null;
}

function acquireTechnology(s: SetiState, player: SetiPlayer, stackId: SetiTechStackId, free: boolean): string | null {
  const definition = SETI_TECH_BY_ID[stackId];
  const stack = s.techStacks[stackId];
  if (!definition || !stack) return 'Unknown technology stack';
  if (player.techs.some((tech) => tech.stackId === stackId)) return 'Technology already owned';
  if (!stack.tiles.length) return 'Technology stack is empty';
  if (!free) {
    if (player.publicity < SETI_RULES.researchPublicity) return 'Not enough publicity';
    player.publicity -= SETI_RULES.researchPublicity;
  }
  rotateSetiSolarSystem(s);
  const tileId = stack.tiles.shift()!;
  player.techs.push({ stackId, tileId });
  if (stack.firstTakeBonusAvailable) {
    stack.firstTakeBonusAvailable = false;
    gainScore(player, 2);
  }
  const tile = definition.tiles.find((candidate) => candidate.id === tileId);
  if (tile) applyKnownRewardOps(s, player, tile.immediateReward.ops);
  if (definition.type === 'computer') player.computer.tech[stackId] = { upper: false, lower: false };
  if (definition.ability === 'probe-limit-and-launch') launchProbe(s, player, true);
  emit(s, player, 'researches a technology', stackId);
  return null;
}

function resolveChoice(s: SetiState, player: SetiPlayer, decision: SetiPendingDecision, choice: SetiChoice): SetiResult {
  const done = (): SetiResult => {
    s.pending.shift();
    settleChoiceConsequences(s, player.seat);
    return { ok: true };
  };
  switch (decision.kind) {
    case 'initial-income-card': {
      if (choice.kind !== 'card' || !decision.options.includes(choice.cardId)) return err('Choose one highlighted income card');
      const failure = tuckCard(s, player, choice.cardId, true);
      if (failure) return err(failure);
      const kind = SETI_PROJECT_BY_ID[choice.cardId].printed.incomeCorner;
      if (kind === 'credit') player.credits++;
      else if (kind === 'energy') player.energy++;
      else drawIntoHand(s, player, 1);
      emit(s, player, 'chooses starting income', SETI_PROJECT_BY_ID[choice.cardId].name);
      return done();
    }
    case 'discard-to-four': {
      if (choice.kind !== 'cards' || choice.cardIds.length !== decision.count || new Set(choice.cardIds).size !== choice.cardIds.length) return err(`Discard exactly ${decision.count} cards`);
      if (choice.cardIds.some((card) => !player.hand.includes(card))) return err('A selected card is not in your hand');
      for (const card of choice.cardIds) {
        player.hand.splice(player.hand.indexOf(card), 1);
        s.projectDiscard.push(card);
      }
      return done();
    }
    case 'end-round-card': {
      if (choice.kind !== 'card' || !decision.options.includes(choice.cardId)) return err('Choose a highlighted end-round card');
      const stack = s.roundEndStacks[decision.round - 1];
      const index = stack.indexOf(choice.cardId);
      if (index < 0) return err('End-round card is no longer available');
      stack.splice(index, 1);
      const definition = SETI_PROJECT_BY_ID[choice.cardId];
      player.incomeCards.push({ cardId: choice.cardId, kind: definition.printed.incomeCorner, starting: false });
      emit(s, player, 'takes an end-round income card', definition.name);
      return done();
    }
    case 'signal-sector': {
      if (choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return err('Choose a highlighted signal sector');
      if (decision.source === 'project-row') {
        if (typeof choice.row !== 'number' || !decision.rowOptions?.includes(choice.row)) return err('Choose one project-row card for its printed signal');
        const card = s.projectRow[choice.row];
        if (!card) return err('Project-row card is no longer available');
        s.projectRow[choice.row] = null;
        s.projectDiscard.push(card);
      }
      markSetiSignal(s, player.seat, choice.sectorId);
      return done();
    }
    case 'completed-sector-order': {
      if (choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return err('Choose a completed sector');
      resolveSetiSector(s, choice.sectorId);
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
      if (choice.kind !== 'gold-tile' || !decision.options.includes(choice.tileId)) return err('Choose a highlighted gold tile');
      player.goldClaims.push({ threshold: decision.threshold, tileId: choice.tileId });
      emit(s, player, `claims the ${decision.threshold} milestone`, choice.tileId);
      return done();
    }
    case 'tech-stack': {
      if (choice.kind !== 'tech-stack' || !decision.options.includes(choice.stackId)) return err('Choose a highlighted technology stack');
      const failure = acquireTechnology(s, player, choice.stackId, decision.free);
      if (failure) return err(failure);
      return done();
    }
    case 'mars-first-data': {
      if (choice.kind !== 'number' || !decision.options.includes(choice.value)) return err('Choose an available Mars landing bonus');
      const index = s.planets.Mars.firstLandingBonuses.indexOf(choice.value);
      if (index < 0) return err('Mars landing bonus is no longer available');
      s.planets.Mars.firstLandingBonuses.splice(index, 1);
      gainData(player, choice.value);
      return done();
    }
    case 'tuck-income-card': {
      if (choice.kind !== 'card' || !decision.options.includes(choice.cardId)) return err('Choose a highlighted card to tuck');
      const failure = tuckCard(s, player, choice.cardId, false);
      if (failure) return err(failure);
      return done();
    }
    case 'card-effect-choice': {
      const option = choice.kind === 'option' ? choice.option : choice.kind === 'options' && choice.options.length === 1 ? choice.options[0] : null;
      if (!option || !decision.options.includes(option)) return err('Choose a highlighted printed-effect option');
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
    case 'alien-card-source': case 'centaurian-reward': case 'exertian-card': case 'manual-trigger-choice': {
      const option = choice.kind === 'option' ? choice.option : null;
      if (!option || !decision.options.includes(option)) return err('Choose a highlighted option');
      s.log.push(`${player.name}: resolves ${decision.kind} (${option}) through its bounded species adapter.`);
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
    const head = s.pending[0];
    if (!head) return err('No decision is waiting');
    if (head.owner !== seat) return err('That decision belongs to another player');
    return resolveChoice(s, player, head, action.choice);
  }

  const activeError = activePlayerError(s, seat, action.type !== 'launch' && action.type !== 'orbit' && action.type !== 'land' && action.type !== 'scan' && action.type !== 'analyze' && action.type !== 'research' && action.type !== 'play_card' && action.type !== 'pass');
  if (activeError) return err(activeError);

  switch (action.type) {
    case 'launch': {
      const piece = launchProbe(s, player, false);
      if (!piece) return err(setiProbesInSpace(s, seat) >= setiProbeLimit(player) ? 'Probe limit reached' : 'Not enough credits');
      s.mainActionTaken = true;
      emit(s, player, 'launches a probe', 'Earth', { pieceId: piece.id, to: piece.cell });
      return { ok: true };
    }
    case 'move': {
      const piece = s.solar.pieces.find((candidate) => candidate.id === action.pieceId && candidate.owner === seat);
      if (!piece) return err('Piece is not yours or is not in space');
      if (!adjacentSetiCells(piece.cell).includes(action.to)) return err('Destination is not orthogonally adjacent');
      const surcharge = isSetiAsteroidCell(s, piece.cell) && !setiPlayerHasAbility(player, 'asteroid-navigation') ? SETI_RULES.asteroidExitEnergy : 0;
      const cost = SETI_RULES.moveEnergy + surcharge;
      if (action.payment?.cardId) {
        const card = SETI_PROJECT_BY_ID[action.payment.cardId];
        if (!card || !player.hand.includes(action.payment.cardId) || card.printed.freeCorner !== 'move') return err('Selected card has no verified movement corner');
        if (player.energy < surcharge) return err('Not enough energy to leave asteroids');
        player.hand.splice(player.hand.indexOf(action.payment.cardId), 1);
        s.projectDiscard.push(action.payment.cardId);
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
      piece.supportLayer = setiSupportLayerForCell(s, action.to);
      if (isSetiPublicityCell(s, action.to) || bodyAtSetiCell(s, action.to) === 'Oumuamua') gainPublicity(player, 1);
      emit(s, player, 'moves a probe', `${from} to ${action.to}`, { pieceId: piece.id, from, to: action.to });
      return { ok: true };
    }
    case 'orbit': {
      const piece = s.solar.pieces.find((candidate) => candidate.id === action.pieceId && candidate.owner === seat && candidate.kind === 'probe');
      if (!piece) return err('Choose one of your probes');
      const body = bodyAtSetiCell(s, piece.cell);
      if (!body || body === 'Earth' || body !== action.body || SETI_BODIES[action.body].moon) return err('Probe is not visiting that planet');
      if (player.credits < SETI_RULES.orbitCredits || player.energy < SETI_RULES.orbitEnergy) return err('Orbit costs 1 credit and 1 energy');
      player.credits -= SETI_RULES.orbitCredits;
      player.energy -= SETI_RULES.orbitEnergy;
      removeOwnedPiece(s, player, piece.id);
      const planet = s.planets[action.body];
      const first = planet.orbiters.length === 0;
      planet.orbiters.push(seat);
      if (first) gainScore(player, 3);
      const reward = SETI_BODIES[action.body].orbitReward;
      if (reward.status === 'typed') applyKnownRewardOps(s, player, reward.ops);
      s.mainActionTaken = true;
      emit(s, player, `places an orbiter at ${action.body}`, first ? 'First orbiter: 3 VP' : '', { body: action.body });
      return { ok: true };
    }
    case 'land': {
      const piece = s.solar.pieces.find((candidate) => candidate.id === action.pieceId && candidate.owner === seat && candidate.kind === 'probe');
      if (!piece) return err('Choose one of your probes');
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
      s.planets[action.body].landers.push(seat);
      if (action.body === 'Mars' && s.planets.Mars.firstLandingBonuses.length) {
        s.pending.push({ kind: 'mars-first-data', owner: seat, options: [...s.planets.Mars.firstLandingBonuses] });
      } else if (!definition.moon && s.planets[action.body].firstLandingBonuses.length) {
        gainData(player, s.planets[action.body].firstLandingBonuses.shift()!);
      }
      applyKnownRewardOps(s, player, definition.landingRewards);
      s.mainActionTaken = true;
      emit(s, player, `lands on ${action.body}`, `${cost} energy`, { body: action.body });
      return { ok: true };
    }
    case 'scan': {
      if (player.credits < SETI_RULES.scanCredits || player.energy < SETI_RULES.scanEnergy) return err('Scan costs 1 credit and 2 energy');
      if (!s.projectRow.some(Boolean)) return err('Project row is empty');
      player.credits -= SETI_RULES.scanCredits;
      player.energy -= SETI_RULES.scanEnergy;
      const earth = earthSetiSectorId(s);
      const earthOptions = setiPlayerHasAbility(player, 'earth-signal-adjacent')
        ? [earth, s.sectorOrder[(s.sectorOrder.indexOf(earth) + 7) % 8], s.sectorOrder[(s.sectorOrder.indexOf(earth) + 1) % 8]]
        : [earth];
      s.pending.push({ kind: 'signal-sector', owner: seat, source: 'earth', options: [...new Set(earthOptions)], signalColor: null });
      s.pending.push({
        kind: 'signal-sector', owner: seat, source: 'project-row', options: [...SETI_SECTOR_IDS], signalColor: null,
        rowOptions: s.projectRow.map((card, index) => card ? index : -1).filter((index) => index >= 0),
      });
      s.mainActionTaken = true;
      emit(s, player, 'begins a scan', 'Place the Earth signal, then use a project-row card');
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
      } else {
        const state = player.computer.tech[decoded.stackId]!;
        if (decoded.part === 'upper') {
          if (state.upper) return err('Upper technology space is already filled');
          state.upper = true;
          gainScore(player, 2);
        } else {
          if (!state.upper) return err('Fill the upper technology space first');
          if (state.lower) return err('Lower technology space is already filled');
          state.lower = true;
          s.log.push(`${player.name}: covers an art-authoritative computer-tech lower reward.`);
        }
      }
      player.dataPool--;
      emit(s, player, 'places data in the computer', `Space ${action.slot}`);
      return { ok: true };
    }
    case 'analyze': {
      if (!player.computer.top.every(Boolean)) return err('Fill all six top computer spaces first');
      if (player.energy < SETI_RULES.analyzeEnergy) return err('Analyze costs 1 energy');
      player.energy--;
      player.computer.top.fill(false);
      for (const state of Object.values(player.computer.tech)) if (state) { state.upper = false; state.lower = false; }
      queueTrace(s, player, 'blue', 1);
      s.mainActionTaken = true;
      emit(s, player, 'analyzes data', 'Blue trace earned');
      return { ok: true };
    }
    case 'research': {
      const legal = getSetiLegalTargets(s, seat).techStackTargets;
      if (!legal.includes(action.stackId)) return err('Technology stack is not legal or affordable');
      const failure = acquireTechnology(s, player, action.stackId, false);
      if (failure) return err(failure);
      s.mainActionTaken = true;
      return { ok: true };
    }
    case 'play_card': {
      const definition = SETI_PROJECT_BY_ID[action.cardId];
      if (!definition || !player.hand.includes(action.cardId)) return err('Card is not in your hand');
      if (definition.printed.status !== 'typed' || definition.printed.cost === null || !definition.printed.effects || !definition.printed.cardType) {
        return err('Printed main effect is not yet transcribed; inspect the authentic card art');
      }
      if (player.credits < definition.printed.cost) return err('Not enough credits');
      player.credits -= definition.printed.cost;
      player.hand.splice(player.hand.indexOf(action.cardId), 1);
      const effectFailure = applyTypedCardOps(s, player, definition.printed.effects);
      if (effectFailure) return err(effectFailure);
      if (definition.printed.cardType === 'ordinary') s.projectDiscard.push(action.cardId);
      else if (definition.printed.cardType === 'end-game') player.scoringCards.push(action.cardId);
      else player.missions.push(action.cardId);
      s.mainActionTaken = true;
      emit(s, player, `plays ${definition.name}`);
      return { ok: true };
    }
    case 'discard_for_corner': {
      const definition = SETI_PROJECT_BY_ID[action.cardId];
      if (!definition || !player.hand.includes(action.cardId)) return err('Card is not in your hand');
      if (!definition.printed.freeCorner) return err('Printed free-action corner is not yet transcribed');
      player.hand.splice(player.hand.indexOf(action.cardId), 1);
      s.projectDiscard.push(action.cardId);
      switch (definition.printed.freeCorner) {
        case 'credit': player.credits++; break;
        case 'energy': player.energy++; break;
        case 'publicity': gainPublicity(player, 1); break;
        case 'data': gainData(player, 1); break;
        case 'card': drawIntoHand(s, player, 1); break;
        case 'move': return err('Select a probe and use this card as its movement payment');
      }
      emit(s, player, `discards ${definition.name} for its corner`);
      return { ok: true };
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
      emit(s, player, 'buys a project card', SETI_PROJECT_BY_ID[card]?.name ?? card);
      return { ok: true };
    }
    case 'exchange': {
      if (action.receive === 'card') {
        if (typeof action.row === 'number') {
          if (!Number.isInteger(action.row) || action.row < 0 || action.row >= s.projectRow.length || !s.projectRow[action.row]) return err('Selected project source is empty');
        } else if (s.projectDeck.length + s.projectDiscard.length === 0) return err('Project deck is empty');
      }
      if (action.give === 'cards') {
        const cards = action.cardIds ?? [];
        if (cards.length !== 2 || new Set(cards).size !== 2 || cards.some((card) => !player.hand.includes(card))) return err('Exchange exactly two cards from your hand');
        for (const card of cards) { player.hand.splice(player.hand.indexOf(card), 1); s.projectDiscard.push(card); }
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
      return { ok: true };
    }
    case 'pass': {
      player.passed = true;
      s.passedSeats.push(seat);
      s.mainActionTaken = true;
      s.passResolutionSeat = seat;
      if (s.firstPassSeat === null) {
        s.firstPassSeat = seat;
        rotateSetiSolarSystem(s);
      }
      if (player.hand.length > SETI_RULES.handLimitAtPass) {
        s.pending.push({ kind: 'discard-to-four', owner: seat, count: player.hand.length - SETI_RULES.handLimitAtPass, reason: 'pass' });
      }
      if (s.round <= 4) {
        s.pending.push({ kind: 'end-round-card', owner: seat, round: s.round, options: [...s.roundEndStacks[s.round - 1]] });
      }
      s.turnResolution = { kind: 'pass', seat, milestonesQueued: false };
      emit(s, player, 'passes', s.firstPassSeat === seat ? 'First passer rotates the solar system' : '');
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

function applyTypedCardOps(s: SetiState, player: SetiPlayer, ops: readonly SetiEffectOp[]): string | null {
  for (const op of ops) {
    if (op.kind === 'launch') {
      for (let i = 0; i < op.amount; i++) if (!launchProbe(s, player, true, !!op.ignoreProbeLimit)) return 'Card launch exceeds the probe limit';
    } else if (op.kind === 'move') {
      s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: 'seti_effect_move', label: `Move ${op.amount}`, min: 1, max: 1, options: s.solar.pieces.filter((piece) => piece.owner === player.seat).map((piece) => piece.id) });
    } else if (op.kind === 'scan') {
      queueSignal(s, player, null, op.amount);
    } else if (op.kind === 'analyze') {
      queueTrace(s, player, 'blue', op.amount);
    } else if (op.kind === 'research') {
      const options = SETI_TECH_STACKS.filter((stack) => !op.technologyType || stack.type === op.technologyType).map((stack) => stack.id);
      s.pending.push({ kind: 'tech-stack', owner: player.seat, options, free: true });
    } else if (op.kind === 'choice') {
      s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: 'seti_typed_card_choice', label: 'Choose printed effect', min: op.choose, max: op.choose, options: op.options.map((_, index) => String(index)) });
    } else if (op.kind === 'conditional') {
      // Typed condition evaluators are added alongside their card transcription;
      // never guess from the human-readable label.
      return `Condition evaluator is missing for ${op.condition}`;
    } else {
      applyKnownRewardOps(s, player, [op]);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deterministic bot
// ---------------------------------------------------------------------------

function choiceForBot(s: SetiState, player: SetiPlayer, decision: SetiPendingDecision): SetiAction {
  switch (decision.kind) {
    case 'initial-income-card': return { type: 'choose_initial_income', cardId: decision.options[0] };
    case 'discard-to-four': return { type: 'choose', choice: { kind: 'cards', cardIds: player.hand.slice(-decision.count) } };
    case 'end-round-card': case 'tuck-income-card': return { type: 'choose', choice: { kind: 'card', cardId: decision.options[0] } };
    case 'signal-sector': {
      const sectorId = [...decision.options].sort((a, b) => s.sectors[b].dataRemaining - s.sectors[a].dataRemaining || a.localeCompare(b))[0];
      return { type: 'choose', choice: { kind: 'sector', sectorId, ...(decision.source === 'project-row' ? { row: decision.rowOptions?.[0] } : {}) } };
    }
    case 'completed-sector-order': return { type: 'choose', choice: { kind: 'sector', sectorId: decision.options[0] } };
    case 'trace-space': return { type: 'choose', choice: { kind: 'trace-space', spaceId: decision.options[0] } };
    case 'gold-tile': return { type: 'choose', choice: { kind: 'gold-tile', tileId: decision.options[0] } };
    case 'tech-stack': return { type: 'choose', choice: { kind: 'tech-stack', stackId: decision.options[0] } };
    case 'mars-first-data': return { type: 'choose', choice: { kind: 'number', value: Math.max(...decision.options) } };
    case 'card-effect-choice': return { type: 'choose', choice: { kind: 'option', option: decision.options[0] } };
    case 'alien-card-source': case 'centaurian-reward': case 'exertian-card': case 'manual-trigger-choice':
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
  const head = s.pending[0];
  if (head) return head.owner === seat ? choiceForBot(s, player, head) : null;
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
    if (toward && legal.moveTargets[movable.id].includes(toward)) return { type: 'move', pieceId: movable.id, to: toward, payment: { energy: legal.moveEnergyCost[movable.id][toward] } };
  }
  if (player.credits >= SETI_RULES.scanCredits && player.energy >= SETI_RULES.scanEnergy && s.projectRow.some(Boolean)) return { type: 'scan' };
  if (legal.techStackTargets.length) return { type: 'research', stackId: legal.techStackTargets[0] };
  return { type: 'pass' };
}

export function runSetiBotGame(s: SetiState, maxActions = 5000): number {
  let actions = 0;
  while (s.phase !== 'ended' && actions < maxActions) {
    const owner = s.pending[0]?.owner ?? s.activeSeat;
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
