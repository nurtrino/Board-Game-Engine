// Official SETI solo rival runtime.
//
// The rival is not represented as a normal player seat: it has no hand,
// credits, energy, income, or hidden choices. Public rival pieces and markers
// use owner -1 so the shared physical board remains the single source of truth.

import {
  SETI_BODIES,
  SETI_RULES,
  SETI_SECTORS,
  SETI_SECTOR_IDS,
  SETI_TECH_BY_ID,
  adjacentSetiCells,
  parseSetiCell,
  type SetiBody,
  type SetiCellId,
  type SetiGoldTileId,
  type SetiKnownRewardOp,
  type SetiPrimaryBody,
  type SetiSectorId,
  type SetiSignalColor,
  type SetiTechStackId,
  type SetiTraceColor,
} from './data.js';
import {
  SETI_ALIEN_CARDS_BY_ID,
  SETI_ALIEN_DISCOVERY_SLOTS,
  SETI_ALIEN_SPECIES_BY_ID,
  SETI_ANOMALY_TOKENS,
  SETI_CENTAURIAN_MESSAGE_REWARDS,
  SETI_MASCAMITE_SAMPLE_REWARDS,
  type SetiAlienResearchSpace,
  type SetiAlienReward,
} from './alienCatalog.js';
import { SETI_PROJECT_CATALOG_BY_ID } from './projectCatalog.js';
import {
  SETI_RIVAL_ACTION_BY_ID,
  SETI_SOLO_DIFFICULTY_BY_LEVEL,
  SETI_SOLO_OBJECTIVE_BY_ID,
  SETI_SOLO_OBJECTIVE_RULES,
  advanceSetiRivalProgress,
  chooseSetiRivalSector,
  chooseSetiRivalTechStack,
  getSetiSoloObjectiveCandidates,
  placeSetiRivalData,
  refillSetiRivalComputerFromPool,
  setiSoloFinalObjectiveScore,
  setiSoloRoundObjectivePenalty,
  setiSoloThresholdSatisfied,
  type SetiRivalActionCard,
  type SetiRivalActionStep,
  type SetiRivalArrow,
  type SetiRivalSignalSource,
  type SetiRivalSpeciesId,
  type SetiRivalTechStackId,
  type SetiRivalTechType,
  type SetiSoloObjectiveEvent,
} from './soloCatalog.js';
import {
  earthSetiCell,
  earthSetiSectorId,
  getSetiBodyCells,
  getSetiSolarFeatures,
  isSetiAsteroidCell,
  isSetiPublicityCell,
  placeSetiSpacecraft,
  refillSetiProjectRow,
  setiFirstLandingSpaceId,
  setiFirstOrbitSpaceAvailable,
  setiFirstOrbitSpaceId,
  setiMoonLandingSpaceId,
  setiRoll,
  setiShuffle,
  setiSupportLayerForCell,
  type SetiPlayer,
  type SetiSectorState,
  type SetiSolarPiece,
  type SetiSpeciesSlotState,
  type SetiState,
} from './state.js';

export const SETI_RIVAL_OWNER = -1;

export interface SetiSoloRuntimeAdapter {
  rotateSolarSystem(s: SetiState): void;
  applyHumanRewardOps(s: SetiState, player: SetiPlayer, rewards: readonly SetiKnownRewardOp[]): void;
  onHumanSectorWin?(s: SetiState, player: SetiPlayer, sectorId: SetiSectorId): void;
  revealPendingSpecies?(s: SetiState): void;
  placeNeutralMarker?(s: SetiState, threshold: 20 | 30): void;
  emit?(s: SetiState, title: string, detail?: string): void;
}

export interface SetiRivalTurnResult {
  kind: 'action' | 'pass';
  cardId: string | null;
  stepIndex: number | null;
  stepKind: SetiRivalActionStep['kind'] | null;
}

function rival(s: SetiState) {
  if (!s.solo) throw new Error('SETI rival operation requires solo mode');
  return s.solo;
}

function rivalTechCount(s: SetiState, type: SetiRivalTechType): number {
  return rival(s).techs[type].length;
}

function removeRivalTech(s: SetiState, type: SetiRivalTechType): string | null {
  return rival(s).techs[type].shift() ?? null;
}

function emit(adapter: SetiSoloRuntimeAdapter, s: SetiState, title: string, detail = ''): void {
  adapter.emit?.(s, title, detail);
  if (!adapter.emit) s.log.push(`Rival: ${title}${detail ? ` - ${detail}` : ''}`);
}

export function gainSetiRivalScore(s: SetiState, amount: number): void {
  const solo = rival(s);
  solo.rivalScore = Math.max(0, solo.rivalScore + amount);
}

export function gainSetiRivalPublicity(s: SetiState, amount: number): void {
  const solo = rival(s);
  solo.rivalPublicity = Math.max(0, Math.min(SETI_RULES.publicityMax, solo.rivalPublicity + amount));
}

export function advanceSetiRivalProgressState(s: SetiState, spaces: number): void {
  if (spaces <= 0) return;
  const solo = rival(s);
  const setup = SETI_SOLO_DIFFICULTY_BY_LEVEL[solo.difficulty];
  const result = advanceSetiRivalProgress(setup, solo.progress, spaces);
  solo.progress = result.index;
  solo.progressLoops += result.strengthCardsGained;
  for (let index = 0; index < result.strengthCardsGained; index++) {
    const card = solo.advancedReserve.shift();
    if (card) solo.actionDeck.unshift(card);
  }
}

export function gainSetiRivalData(s: SetiState, amount: number): void {
  const solo = rival(s);
  const placed = placeSetiRivalData({ spaces: solo.computer, dataPool: solo.dataPool }, amount);
  solo.computer = placed.spaces;
  solo.dataPool = placed.dataPool;
  gainSetiRivalPublicity(s, placed.publicity);
  advanceSetiRivalProgressState(s, placed.progress);
}

function rivalProjectCards(s: SetiState, amount: number): void {
  advanceSetiRivalProgressState(s, amount);
}

function rivalIncome(s: SetiState, amount: number): void {
  advanceSetiRivalProgressState(s, amount * 4);
}

function signalColorForSector(sectorId: SetiSectorId): SetiSignalColor {
  return SETI_SECTORS.find((sector) => sector.id === sectorId)!.printedSignalColor;
}

function chooseArrowEdge<T>(values: readonly T[], arrow: SetiRivalArrow): T | null {
  if (!values.length) return null;
  return arrow === 'left' ? values[0] : values[values.length - 1];
}

function applyRivalKnownRewards(
  s: SetiState,
  rewards: readonly SetiKnownRewardOp[],
  adapter: SetiSoloRuntimeAdapter,
  options: { technologyTile?: boolean; arrow?: SetiRivalArrow } = {},
): void {
  for (const reward of rewards) {
    if (options.technologyTile && reward.kind === 'trace' && reward.color === 'orange') continue;
    if (options.technologyTile && reward.kind === 'data' && reward.amount === 2) continue;
    switch (reward.kind) {
      case 'vp': gainSetiRivalScore(s, reward.amount); break;
      case 'credit':
      case 'energy': advanceSetiRivalProgressState(s, reward.amount); break;
      case 'data': gainSetiRivalData(s, reward.amount); break;
      case 'publicity': gainSetiRivalPublicity(s, reward.amount); break;
      case 'trace':
        for (let index = 0; index < reward.amount; index++) markSetiRivalTrace(s, reward.color, options.arrow ?? rival(s).currentDecisionArrow, adapter);
        break;
      case 'signal':
        for (let index = 0; index < reward.amount; index++) markSetiRivalSignalByColor(s, reward.color, adapter);
        break;
      case 'signal-at-body-sector': {
        const cell = getSetiBodyCells(s)[reward.body];
        const sector = cell ? s.sectorOrder[parseSetiCell(cell).sector] : null;
        if (sector) for (let index = 0; index < reward.amount; index++) markSetiRivalSectorSignal(s, sector, adapter);
        break;
      }
      case 'draw-project': rivalProjectCards(s, reward.amount); break;
      case 'tuck-income': rivalIncome(s, reward.amount); break;
    }
  }
}

function applyRivalAlienRewards(
  s: SetiState,
  rewards: readonly SetiAlienReward[],
  arrow: SetiRivalArrow,
  adapter: SetiSoloRuntimeAdapter,
): void {
  for (const reward of rewards) {
    switch (reward.kind) {
      case 'gain':
        if (reward.resource === 'vp') gainSetiRivalScore(s, reward.amount);
        else if (reward.resource === 'publicity') gainSetiRivalPublicity(s, reward.amount);
        else if (reward.resource === 'data') gainSetiRivalData(s, reward.amount);
        else if (reward.resource === 'credit' || reward.resource === 'energy') advanceSetiRivalProgressState(s, reward.amount);
        else if (reward.resource === 'movement') { /* Rival board rewards never bank movement. */ }
        else if (reward.resource === 'exofossil') {
          const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'oumuamua');
          if (slot?.module?.kind === 'oumuamua') slot.module.exofossils[SETI_RIVAL_OWNER] = (slot.module.exofossils[SETI_RIVAL_OWNER] ?? 0) + reward.amount;
        }
        break;
      case 'draw-project': rivalProjectCards(s, reward.amount); break;
      case 'mark-trace':
        markSetiRivalTrace(s, reward.color === 'any' ? 'any' : reward.color, arrow, adapter);
        break;
      case 'mark-signal':
        for (let index = 0; index < reward.amount; index++) {
          if (reward.location === 'oumuamua-sector') {
            const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'oumuamua');
            if (slot?.module?.kind === 'oumuamua') {
              const sector = s.sectorOrder[parseSetiCell(slot.module.cell).sector];
              markSetiRivalSectorSignal(s, sector, adapter);
            }
          } else if (!reward.color) {
            const candidates = SETI_SECTOR_IDS.map((id) => sectorCandidate(s, id));
            const selected = chooseSetiRivalSector(candidates);
            if (selected) markSetiRivalSectorSignal(s, selected.id as SetiSectorId, adapter);
          } else markSetiRivalSignalByColor(s, reward.color, adapter);
        }
        break;
      case 'take-tech':
        acquireSetiRivalTechnology(s, 0, 0, arrow, adapter);
        break;
      case 'rotate-solar-system': rotateForRival(s, adapter); break;
      case 'tuck-income': rivalIncome(s, reward.amount); break;
      case 'draw-alien-card': advanceSetiRivalProgressState(s, reward.amount); break;
      case 'resolve-mascamite-sample': break;
    }
  }
}

// ---------------------------------------------------------------------------
// Human objective controller
// ---------------------------------------------------------------------------

function markObjectiveTask(s: SetiState, objectiveId: string, taskIndex: number): boolean {
  const progress = rival(s).activeObjectives.find((entry) => entry.objectiveId === objectiveId);
  const definition = SETI_SOLO_OBJECTIVE_BY_ID[objectiveId];
  if (!progress || !definition || !definition.tasks[taskIndex] || progress.marked[taskIndex]) return false;
  progress.marked[taskIndex] = true;
  return true;
}

export function recordSetiSoloObjectiveEvent(s: SetiState, event: SetiSoloObjectiveEvent): void {
  recordSetiSoloObjectiveTrigger(s, [event]);
}

export function recordSetiSoloObjectiveTrigger(s: SetiState, events: readonly SetiSoloObjectiveEvent[]): void {
  if (!s.solo || s.solo.difficulty === 1) return;
  const candidates = events.flatMap((event) => getSetiSoloObjectiveCandidates(s.solo!.activeObjectives, event))
    .filter((candidate, index, all) => all.findIndex((other) => other.objectiveId === candidate.objectiveId && other.taskIndex === candidate.taskIndex) === index);
  if (!candidates.length) return;
  if (candidates.length === 1) {
    markObjectiveTask(s, candidates[0].objectiveId, candidates[0].taskIndex);
    return;
  }
  const options = candidates.map((candidate) => `${candidate.objectiveId}|${candidate.taskIndex}`);
  s.pending.push({ kind: 'solo-objective-task', owner: 0, eventId: s.projectRuntime.nextResolutionId++, options });
}

export function resolveSetiSoloObjectiveChoice(s: SetiState, option: string): string | null {
  if (!s.solo) return 'Solo objectives are unavailable';
  const separator = option.lastIndexOf('|');
  const objectiveId = option.slice(0, separator);
  const taskIndex = Number(option.slice(separator + 1));
  if (separator < 0 || !Number.isInteger(taskIndex) || !markObjectiveTask(s, objectiveId, taskIndex)) return 'That objective task is unavailable';
  return null;
}

export function evaluateSetiSoloThresholds(s: SetiState, player: SetiPlayer): void {
  if (!s.solo || s.solo.difficulty === 1) return;
  const stats = { vp: player.score, publicity: player.publicity, dataPool: player.dataPool };
  const candidates: { objectiveId: string; taskIndex: number }[] = [];
  for (const progress of s.solo.activeObjectives) {
    const definition = SETI_SOLO_OBJECTIVE_BY_ID[progress.objectiveId];
    definition?.tasks.forEach((task, index) => {
      if (!progress.marked[index] && setiSoloThresholdSatisfied(task, stats)) candidates.push({ objectiveId: progress.objectiveId, taskIndex: index });
    });
  }
  if (!candidates.length) return;
  if (candidates.length === 1) {
    markObjectiveTask(s, candidates[0].objectiveId, candidates[0].taskIndex);
    return;
  }
  const options = candidates.map((candidate) => `${candidate.objectiveId}|${candidate.taskIndex}`);
  const alreadyQueued = s.pending.some((decision) => decision.kind === 'solo-objective-task'
    && options.every((option) => decision.options.includes(option)));
  if (!alreadyQueued) s.pending.push({ kind: 'solo-objective-task', owner: player.seat, eventId: s.projectRuntime.nextResolutionId++, options });
}

function objectiveComplete(s: SetiState, objectiveId: string): boolean {
  const progress = rival(s).activeObjectives.find((entry) => entry.objectiveId === objectiveId);
  return !!progress && progress.marked.length > 0 && progress.marked.every(Boolean);
}

export function settleSetiSoloObjectivesAtEndOfHumanTurn(s: SetiState): void {
  if (!s.solo || s.solo.difficulty === 1) return;
  const solo = s.solo;
  let changed = true;
  while (changed) {
    changed = false;
    const completed = solo.activeObjectives.filter((entry) => objectiveComplete(s, entry.objectiveId));
    if (completed.length) {
      changed = true;
      const ids = new Set(completed.map((entry) => entry.objectiveId));
      solo.activeObjectives = solo.activeObjectives.filter((entry) => !ids.has(entry.objectiveId));
      solo.completedObjectives.push(...completed.map((entry) => entry.objectiveId));
    }
    while (solo.activeObjectives.length < SETI_SOLO_OBJECTIVE_RULES.activeCount && solo.objectiveDeck.length) {
      changed = true;
      const objectiveId = solo.objectiveDeck.shift()!;
      const definition = SETI_SOLO_OBJECTIVE_BY_ID[objectiveId];
      solo.activeObjectives.push({ objectiveId, marked: Array(definition.tasks.length).fill(false) });
      evaluateSetiSoloThresholds(s, s.players[0]);
      if (s.pending.some((decision) => decision.kind === 'solo-objective-task')) break;
    }
    if (s.pending.some((decision) => decision.kind === 'solo-objective-task')) break;
  }
}

export function settleSetiSoloEndRoundObjectives(s: SetiState, round: 1 | 2 | 3 | 4): void {
  if (!s.solo || s.solo.difficulty === 1) return;
  const result = setiSoloRoundObjectivePenalty(round, s.solo.completedObjectives.length);
  s.solo.completedObjectives.splice(0, result.spent);
  advanceSetiRivalProgressState(s, result.rivalProgress);
}

// ---------------------------------------------------------------------------
// Rival life traces and species rules
// ---------------------------------------------------------------------------

interface RivalTraceCandidate {
  slot: SetiSpeciesSlotState;
  color: SetiTraceColor;
  target: string;
  space: SetiAlienResearchSpace | null;
  height: number;
  boardOrder: number;
  overflow: boolean;
  discovery: boolean;
}

function rivalExofossils(slot: SetiSpeciesSlotState): number {
  return slot.module?.kind === 'oumuamua' ? slot.module.exofossils[SETI_RIVAL_OWNER] ?? 0 : 0;
}

function rivalResearchSpaceEligible(s: SetiState, slot: SetiSpeciesSlotState, space: SetiAlienResearchSpace): boolean {
  const target = `seti_species_${slot.slot}_research_${space.id}`;
  if (!space.repeatable && slot.research.some((marker) => marker.spaceId === target)) return false;
  if (space.dynamic === 'mascamite-sample-token') {
    if (slot.module?.kind !== 'mascamites') return false;
    const number = Number(space.id.slice(space.id.lastIndexOf('_') + 1));
    if (number > 1 + slot.module.capsulesDelivered.length) return false;
  }
  if (space.payment?.resource === 'exofossil' && rivalExofossils(slot) < space.payment.amount) return false;
  if (space.payment?.resource === 'data-pool') {
    const solo = rival(s);
    if (!solo.computer.every(Boolean) || solo.dataPool < space.payment.amount) return false;
  }
  return true;
}

function traceCandidatesForSlot(s: SetiState, slot: SetiSpeciesSlotState, colors: readonly SetiTraceColor[]): RivalTraceCandidate[] {
  if (!slot.revealed) {
    return colors.flatMap((color) => slot.discovery[color] ? [] : [{
      slot,
      color,
      target: `seti_species_${slot.slot}_discovery_${color}`,
      space: null,
      height: slot.slot === 1 ? 1 : 2,
      boardOrder: slot.slot * 3 + ['purple', 'orange', 'blue'].indexOf(color),
      overflow: false,
      discovery: true,
    }]);
  }
  const definition = SETI_ALIEN_SPECIES_BY_ID[slot.speciesId];
  const result: RivalTraceCandidate[] = [];
  for (const color of colors) {
    const spaces = definition.researchSpaces.filter((space) => space.trace === color);
    const legal = spaces.flatMap((space, index) => rivalResearchSpaceEligible(s, slot, space) ? [{ space, index }] : []);
    if (!legal.length) continue;
    const lowest = legal.sort((left, right) => right.index - left.index)[0];
    result.push({
      slot,
      color,
      target: `seti_species_${slot.slot}_research_${lowest.space.id}`,
      space: lowest.space,
      height: spaces.length - lowest.index,
      boardOrder: slot.slot * 3 + ['purple', 'orange', 'blue'].indexOf(color),
      overflow: false,
      discovery: false,
    });
  }
  return result;
}

function chooseRivalTraceCandidate(
  s: SetiState,
  color: SetiTraceColor | 'any',
  arrow: SetiRivalArrow,
): RivalTraceCandidate | null {
  const colors = color === 'any' ? (['purple', 'orange', 'blue'] as const) : [color];
  const candidates = s.species.flatMap((slot) => traceCandidatesForSlot(s, slot, colors));
  if (candidates.length) {
    return candidates.sort((left, right) => left.height - right.height
      || (arrow === 'left' ? left.boardOrder - right.boardOrder : right.boardOrder - left.boardOrder))[0];
  }
  const overflow = s.species.flatMap((slot) => slot.revealed ? colors.map((traceColor) => ({
    slot,
    color: traceColor,
    target: `seti_species_${slot.slot}_overflow_${traceColor}`,
    space: null,
    height: Number.MAX_SAFE_INTEGER,
    boardOrder: slot.slot * 3 + ['purple', 'orange', 'blue'].indexOf(traceColor),
    overflow: true,
    discovery: false,
  })) : []);
  return overflow.sort((left, right) => arrow === 'left' ? left.boardOrder - right.boardOrder : right.boardOrder - left.boardOrder)[0] ?? null;
}

function sampleReward(slot: SetiSpeciesSlotState, space: SetiAlienResearchSpace): readonly SetiAlienReward[] {
  if (slot.module?.kind !== 'mascamites' || space.dynamic !== 'mascamite-sample-token') return space.reward;
  const index = Number(space.id.slice(space.id.lastIndexOf('_') + 1)) - 1;
  const sampleId = [slot.module.revealedBlueSample, ...slot.module.capsulesDelivered][index];
  const sampleIndex = Number(sampleId?.slice(sampleId.lastIndexOf('_') + 1)) - 1;
  return SETI_MASCAMITE_SAMPLE_REWARDS[sampleIndex] ?? space.reward;
}

function applyRivalTraceCandidate(
  s: SetiState,
  candidate: RivalTraceCandidate,
  arrow: SetiRivalArrow,
  adapter: SetiSoloRuntimeAdapter,
): void {
  s.markerSequence++;
  if (candidate.discovery) {
    candidate.slot.discovery[candidate.color] = { owner: SETI_RIVAL_OWNER, sequence: s.markerSequence };
    const reward = SETI_ALIEN_DISCOVERY_SLOTS[candidate.slot.slot].rewardPerSpace;
    applyRivalAlienRewards(s, reward, arrow, adapter);
    // Ordinary species would deal one alien card for this marker; Exertians
    // replace that draw with the same one-space progress explicitly.
    advanceSetiRivalProgressState(s, 1);
    if (Object.values(candidate.slot.discovery).every(Boolean) && !s.pendingSpeciesDiscoveries.includes(candidate.slot.slot)) {
      s.pendingSpeciesDiscoveries.push(candidate.slot.slot);
    }
    return;
  }
  candidate.slot.research.push({
    owner: SETI_RIVAL_OWNER,
    sequence: s.markerSequence,
    spaceId: candidate.target,
    color: candidate.color,
    overflow: candidate.overflow,
  });
  if (candidate.overflow) {
    gainSetiRivalScore(s, 3);
    return;
  }
  const space = candidate.space!;
  if (space.payment?.resource === 'exofossil' && candidate.slot.module?.kind === 'oumuamua') {
    candidate.slot.module.exofossils[SETI_RIVAL_OWNER] -= space.payment.amount;
  } else if (space.payment?.resource === 'data-pool') {
    rival(s).dataPool -= space.payment.amount;
  }
  applyRivalAlienRewards(s, sampleReward(candidate.slot, space), arrow, adapter);
  if (space.danger && candidate.slot.module?.kind === 'exertians') {
    candidate.slot.module.dangerBySeat[SETI_RIVAL_OWNER] = (candidate.slot.module.dangerBySeat[SETI_RIVAL_OWNER] ?? 0) + space.danger;
  }
}

export function markSetiRivalTrace(
  s: SetiState,
  color: SetiTraceColor | 'any',
  arrow: SetiRivalArrow,
  adapter: SetiSoloRuntimeAdapter,
): boolean {
  const candidate = chooseRivalTraceCandidate(s, color, arrow);
  if (!candidate) return false;
  applyRivalTraceCandidate(s, candidate, arrow, adapter);
  return true;
}

function anomalySlot(s: SetiState): SetiSpeciesSlotState | null {
  return s.species.find((slot) => slot.revealed && slot.speciesId === 'anomalies') ?? null;
}

function nextAnomaly(s: SetiState): { slot: SetiSpeciesSlotState; index: number; color: SetiTraceColor } | null {
  const slot = anomalySlot(s);
  if (!slot || slot.module?.kind !== 'anomalies') return null;
  const earth = parseSetiCell(earthSetiCell(s)).sector;
  const ranked = slot.module.anomalies.map((entry, index) => ({
    index,
    distance: (entry.sector - earth + 8) % 8 || 8,
  })).sort((left, right) => left.distance - right.distance || left.index - right.index);
  const selected = ranked[0];
  return selected ? { slot, index: selected.index, color: SETI_ANOMALY_TOKENS[selected.index].color } : null;
}

function anomalyColumnWinner(slot: SetiSpeciesSlotState, color: SetiTraceColor): number | null {
  const prefix = `seti_species_${slot.slot}_research_anomalies_${color}_`;
  const markers = slot.research.filter((marker) => marker.spaceId.startsWith(prefix));
  if (!markers.length) return null;
  return [...markers].sort((left, right) => {
    const leftRow = Number(left.spaceId.slice(left.spaceId.lastIndexOf('_') + 1));
    const rightRow = Number(right.spaceId.slice(right.spaceId.lastIndexOf('_') + 1));
    return leftRow - rightRow || right.sequence - left.sequence;
  })[0].owner;
}

function rivalWinningNextAnomaly(s: SetiState): boolean {
  const next = nextAnomaly(s);
  return !!next && anomalyColumnWinner(next.slot, next.color) === SETI_RIVAL_OWNER;
}

function markRivalNextAnomaly(s: SetiState, arrow: SetiRivalArrow, adapter: SetiSoloRuntimeAdapter): void {
  const next = nextAnomaly(s);
  if (!next) return;
  const candidates = traceCandidatesForSlot(s, next.slot, [next.color]);
  const candidate = candidates[0] ?? {
    slot: next.slot,
    color: next.color,
    target: `seti_species_${next.slot.slot}_overflow_${next.color}`,
    space: null,
    height: Number.MAX_SAFE_INTEGER,
    boardOrder: 0,
    overflow: true,
    discovery: false,
  };
  applyRivalTraceCandidate(s, candidate, arrow, adapter);
  gainSetiRivalScore(s, 3);
}

// Called immediately after the ordinary species initializer reveals a board.
export function onSetiSoloSpeciesRevealed(s: SetiState, slot: SetiSpeciesSlotState): void {
  if (!s.solo) return;
  const species = slot.speciesId as SetiRivalSpeciesId;
  if (!s.solo.discoveredSpeciesInOrder.includes(species)) s.solo.discoveredSpeciesInOrder.push(species);
  if (slot.module?.kind === 'oumuamua') {
    const module = slot.module;
    module.exofossils[SETI_RIVAL_OWNER] = 0;
    if (s.solar.pieces.some((piece) => piece.owner === SETI_RIVAL_OWNER && piece.kind === 'probe' && piece.cell === module.cell)) {
      gainSetiRivalPublicity(s, 1);
    }
  }
  if (slot.module?.kind === 'centaurians') {
    s.solo.centaurianMessagesReserve = Math.max(0, 4 - s.players.length);
    s.solo.centaurianMessageTarget = null;
  }
  if (slot.module?.kind === 'exertians') slot.module.dangerBySeat[SETI_RIVAL_OWNER] = 0;
}

// ---------------------------------------------------------------------------
// Rival signals and shared sector completion
// ---------------------------------------------------------------------------

function sectorCandidate(s: SetiState, id: SetiSectorId) {
  const sector = s.sectors[id];
  const rivalMarkers = sector.signals.filter((marker) => marker.owner === SETI_RIVAL_OWNER).length;
  const ordinaryMarkers = sector.signals.filter((marker) => !marker.excess).length;
  const maximumOther = Math.max(0, ...s.players.map((player) => sector.signals.filter((marker) => marker.owner === player.seat).length));
  return {
    id,
    wouldWin: sector.dataRemaining === 1 && rivalMarkers + 1 >= maximumOther,
    wouldScoreSecondSignal: sector.dataRemaining > 0 && ordinaryMarkers === 1,
    rivalMarkers,
    capacity: sector.capacity,
    boardOrder: s.sectorOrder.indexOf(id),
  };
}

function resolveCompletedSectorWithRival(s: SetiState, sectorId: SetiSectorId, adapter: SetiSoloRuntimeAdapter): void {
  const sector = s.sectors[sectorId];
  if (!sector.completionPending) return;
  const contributors = [...new Set(sector.signals.map((marker) => marker.owner))];
  const ranked = contributors.map((owner) => {
    const markers = sector.signals.filter((marker) => marker.owner === owner);
    return { owner, count: markers.length, latest: Math.max(...markers.map((marker) => marker.sequence)) };
  }).sort((left, right) => right.count - left.count || right.latest - left.latest);
  const winner = ranked[0];
  const second = ranked[1];
  if (winner) {
    const firstWin = sector.wins.length === 0;
    s.markerSequence++;
    sector.wins.push({ owner: winner.owner, sequence: s.markerSequence });
    const definition = SETI_SECTORS.find((entry) => entry.id === sectorId)!;
    const rewards = firstWin ? definition.printedWinReward.first : definition.printedWinReward.later;
    if (winner.owner === SETI_RIVAL_OWNER) applyRivalKnownRewards(s, rewards, adapter, { arrow: rival(s).currentDecisionArrow });
    else {
      const human = s.players[winner.owner];
      if (human) {
        adapter.applyHumanRewardOps(s, human, rewards);
        adapter.onHumanSectorWin?.(s, human, sectorId);
      }
    }
  }
  for (const owner of contributors) {
    if (owner === SETI_RIVAL_OWNER) gainSetiRivalPublicity(s, 1);
    else if (s.players[owner]) s.players[owner].publicity = Math.min(SETI_RULES.publicityMax, s.players[owner].publicity + 1);
  }
  let retained: SetiSectorState['signals'][number] | null = null;
  if (second && second.owner !== winner?.owner) {
    const marker = sector.signals.filter((entry) => entry.owner === second.owner).sort((left, right) => right.sequence - left.sequence)[0];
    retained = { ...marker, excess: false };
  }
  sector.signals = retained ? [retained] : [];
  sector.dataRemaining = sector.capacity - sector.signals.length;
  sector.completionPending = false;
  s.deferredCompletedSectors = s.deferredCompletedSectors.filter((id) => id !== sectorId);
}

export function settleSetiSoloCompletedSector(s: SetiState, sectorId: SetiSectorId, adapter: SetiSoloRuntimeAdapter): boolean {
  if (!s.solo || !s.sectors[sectorId].signals.some((marker) => marker.owner === SETI_RIVAL_OWNER)) return false;
  resolveCompletedSectorWithRival(s, sectorId, adapter);
  return true;
}

export function markSetiRivalSectorSignal(s: SetiState, sectorId: SetiSectorId, adapter: SetiSoloRuntimeAdapter): void {
  const sector = s.sectors[sectorId];
  if (!sector) throw new Error('Invalid rival signal sector');
  const excess = sector.dataRemaining === 0;
  const ordinaryBefore = sector.signals.filter((marker) => !marker.excess).length;
  s.markerSequence++;
  sector.signals.push({ owner: SETI_RIVAL_OWNER, sequence: s.markerSequence, excess });
  if (!excess) {
    sector.dataRemaining--;
    gainSetiRivalData(s, 1);
    if (ordinaryBefore === 1) gainSetiRivalScore(s, 2);
  }
  if (sector.dataRemaining === 0) {
    sector.completionPending = true;
    resolveCompletedSectorWithRival(s, sectorId, adapter);
  }
}

export function markSetiRivalSignalByColor(s: SetiState, color: SetiSignalColor, adapter: SetiSoloRuntimeAdapter): void {
  const candidates = SETI_SECTORS.filter((sector) => sector.printedSignalColor === color).map((sector) => sectorCandidate(s, sector.id));
  const selected = chooseSetiRivalSector(candidates);
  if (selected) markSetiRivalSectorSignal(s, selected.id as SetiSectorId, adapter);
}

function markRivalOumuamuaTile(s: SetiState): void {
  const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'oumuamua');
  if (slot?.module?.kind !== 'oumuamua') return;
  const module = slot.module;
  const before = module.signals.length;
  s.markerSequence++;
  module.signals.push({ owner: SETI_RIVAL_OWNER, sequence: s.markerSequence, excess: false });
  module.dataRemaining = Math.max(0, module.dataRemaining - 1);
  gainSetiRivalData(s, 1);
  if (before === 0) gainSetiRivalScore(s, 1);
  if (before === 2) gainSetiRivalScore(s, 2);
  if (module.dataRemaining === 0) {
    for (const owner of new Set(module.signals.map((signal) => signal.owner))) {
      module.exofossils[owner] = (module.exofossils[owner] ?? 0) + 1;
    }
    module.signals = [];
    module.dataRemaining = 3;
  }
}

// ---------------------------------------------------------------------------
// Rival technology, movement, and printed actions
// ---------------------------------------------------------------------------

function rotateForRival(s: SetiState, adapter: SetiSoloRuntimeAdapter): void {
  const anomaly = anomalySlot(s);
  const before = anomaly?.module?.kind === 'anomalies' ? anomaly.module.triggerCount : 0;
  adapter.rotateSolarSystem(s);
  if (anomaly?.module?.kind !== 'anomalies' || anomaly.module.triggerCount <= before) return;
  const earth = parseSetiCell(earthSetiCell(s)).sector;
  anomaly.module.anomalies.forEach((entry, index) => {
    if (entry.sector !== earth) return;
    const token = SETI_ANOMALY_TOKENS[index];
    if (anomalyColumnWinner(anomaly, token.color) === SETI_RIVAL_OWNER) {
      applyRivalAlienRewards(s, token.sides[entry.side], rival(s).currentDecisionArrow, adapter);
    }
  });
}

function acquireSetiRivalTechnology(
  s: SetiState,
  publicityCost: 0 | 6,
  progressAfter: 0 | 1,
  arrow: SetiRivalArrow,
  adapter: SetiSoloRuntimeAdapter,
): boolean {
  const solo = rival(s);
  if (solo.rivalPublicity < publicityCost) return false;
  const setup = SETI_SOLO_DIFFICULTY_BY_LEVEL[solo.difficulty];
  const stackId = chooseSetiRivalTechStack(setup, solo.progress, Object.values(s.techStacks).map((stack) => ({
    id: stack.id as SetiRivalTechStackId,
    tiles: stack.tiles.length,
    firstTakeBonusAvailable: stack.firstTakeBonusAvailable,
  })));
  if (!stackId) return false;
  const stack = s.techStacks[stackId as SetiTechStackId];
  const definition = SETI_TECH_BY_ID[stackId as SetiTechStackId];
  solo.rivalPublicity -= publicityCost;
  rotateForRival(s, adapter);
  const tileId = stack.tiles.shift()!;
  solo.techs[definition.type].push(tileId);
  if (stack.firstTakeBonusAvailable) {
    stack.firstTakeBonusAvailable = false;
    gainSetiRivalScore(s, 2);
  }
  const tile = definition.tiles.find((entry) => entry.id === tileId)!;
  applyRivalKnownRewards(s, tile.immediateReward.ops, adapter, { technologyTile: true, arrow });
  advanceSetiRivalProgressState(s, progressAfter);
  return true;
}

function rivalProbeOnEarth(s: SetiState): SetiSolarPiece | null {
  const earth = earthSetiCell(s);
  return s.solar.pieces.find((piece) => piece.owner === SETI_RIVAL_OWNER && piece.kind === 'probe' && piece.cell === earth) ?? null;
}

function launchSetiRivalProbe(s: SetiState, publicity: 0 | 1, progress: 0 | 1): boolean {
  if (rivalProbeOnEarth(s)) return false;
  const cell = earthSetiCell(s);
  s.solar.pieces.push({
    id: `seti_rival_probe_${s.solar.nextPieceId++}`,
    owner: SETI_RIVAL_OWNER,
    kind: 'probe',
    cell,
    supportLayer: setiSupportLayerForCell(s, cell),
  });
  gainSetiRivalPublicity(s, publicity);
  advanceSetiRivalProgressState(s, progress);
  return true;
}

interface RivalRoute {
  cells: SetiCellId[];
  cost: number;
  publicity: number;
}

function arrivalPublicity(s: SetiState, cell: SetiCellId): number {
  if (isSetiPublicityCell(s, cell)) return 1;
  return getSetiSolarFeatures(s).some((feature) => feature.cell === cell && (feature.kind === 'comet' || (feature.kind === 'planet' && feature.body !== 'Earth'))) ? 1 : 0;
}

function rivalRoutesToBody(s: SetiState, body: Exclude<SetiPrimaryBody, 'Earth'>, maxMoves: number): RivalRoute[] {
  const start = earthSetiCell(s);
  const target = getSetiBodyCells(s)[body];
  if (!target) return [];
  const routes: RivalRoute[] = [];
  const visit = (cell: SetiCellId, cost: number, publicity: number, path: SetiCellId[], seen: Set<SetiCellId>): void => {
    if (cell === target) routes.push({ cells: [...path], cost, publicity });
    for (const next of adjacentSetiCells(cell)) {
      if (seen.has(next)) continue;
      const stepCost = 1 + (isSetiAsteroidCell(s, cell) ? 1 : 0);
      if (cost + stepCost > maxMoves) continue;
      seen.add(next);
      path.push(next);
      visit(next, cost + stepCost, publicity + arrivalPublicity(s, next), path, seen);
      path.pop();
      seen.delete(next);
    }
  };
  visit(start, 0, 0, [], new Set([start]));
  return routes.sort((left, right) => right.publicity - left.publicity || left.cost - right.cost || left.cells.join().localeCompare(right.cells.join()));
}

function chooseRivalFlight(
  s: SetiState,
  step: Extract<SetiRivalActionStep, { kind: 'fly-orbit-land' }>,
): { body: Exclude<SetiPrimaryBody, 'Earth'>; route: RivalRoute } | null {
  if (!rivalProbeOnEarth(s)) return null;
  for (const target of step.targets) {
    const route = rivalRoutesToBody(s, target.body, target.maxMoves)[0];
    if (route) return { body: target.body, route };
  }
  return null;
}

function moonOptions(body: SetiPrimaryBody): SetiBody[] {
  return (Object.keys(SETI_BODIES) as SetiBody[]).filter((candidate) => SETI_BODIES[candidate].parent === body);
}

function removeRivalProbe(s: SetiState, probe: SetiSolarPiece): void {
  const index = s.solar.pieces.indexOf(probe);
  if (index >= 0) s.solar.pieces.splice(index, 1);
}

function exposeRandomMascamiteSample(s: SetiState, body: SetiPrimaryBody): void {
  const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'mascamites');
  if (slot?.module?.kind !== 'mascamites' || (body !== 'Jupiter' && body !== 'Saturn')) return;
  const supply = body === 'Jupiter' ? slot.module.samplesAtJupiter : slot.module.samplesAtSaturn;
  if (!supply.length) return;
  const index = setiRoll(s, 0, supply.length - 1);
  slot.module.capsulesDelivered.push(supply.splice(index, 1)[0]);
}

function placeRivalSpacecraft(
  s: SetiState,
  probe: SetiSolarPiece,
  body: Exclude<SetiPrimaryBody, 'Earth'>,
  step: Extract<SetiRivalActionStep, { kind: 'fly-orbit-land' }>,
  arrow: SetiRivalArrow,
  adapter: SetiSoloRuntimeAdapter,
): void {
  const openMoons = moonOptions(body).filter((moon) => s.planets[moon].landers.length === 0);
  if (step.moon !== 'not-applicable' && rivalTechCount(s, 'probe') > 0 && openMoons.length) {
    removeRivalTech(s, 'probe');
    const moon = chooseArrowEdge(openMoons, arrow)!;
    removeRivalProbe(s, probe);
    placeSetiSpacecraft(s, { owner: SETI_RIVAL_OWNER, kind: 'lander', body: moon, spaceId: setiMoonLandingSpaceId(moon), coveredReward: { kind: 'moon-landing' } });
    applyRivalKnownRewards(s, SETI_BODIES[moon].landingRewards, adapter, { arrow });
    if (step.revealMascamiteSample) exposeRandomMascamiteSample(s, body);
    return;
  }
  const planet = s.planets[body];
  const firstOrbiterOpen = setiFirstOrbitSpaceAvailable(s, body);
  const firstLanderOpen = planet.landers.length === 0;
  let placement: 'orbit' | 'land';
  if (firstOrbiterOpen !== firstLanderOpen) placement = firstOrbiterOpen ? 'orbit' : 'land';
  else placement = step.planetPlacementTieOrder[0];
  removeRivalProbe(s, probe);
  if (placement === 'orbit') {
    const first = setiFirstOrbitSpaceAvailable(s, body);
    placeSetiSpacecraft(s, {
      owner: SETI_RIVAL_OWNER,
      kind: 'orbiter',
      body,
      ...(first ? { spaceId: setiFirstOrbitSpaceId(body), coveredReward: { kind: 'first-orbit-vp' as const, amount: 3 as const } } : { coveredReward: null }),
    });
    if (first) gainSetiRivalScore(s, 3);
    if (body === 'Oumuamua') {
      const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'oumuamua');
      if (slot?.module?.kind === 'oumuamua') {
        const sector = s.sectorOrder[parseSetiCell(slot.module.cell).sector];
        markSetiRivalSectorSignal(s, sector, adapter);
      }
      rivalIncome(s, 1);
    } else {
      const reward = SETI_BODIES[body].orbitReward;
      if (reward.status === 'typed') applyRivalKnownRewards(s, reward.ops, adapter, { arrow });
    }
  } else {
    let landingData: number | null = null;
    if (body !== 'Oumuamua' && planet.firstLandingBonuses.length) {
      landingData = chooseArrowEdge(planet.firstLandingBonuses, arrow)!;
      planet.firstLandingBonuses.splice(planet.firstLandingBonuses.indexOf(landingData), 1);
    }
    placeSetiSpacecraft(s, {
      owner: SETI_RIVAL_OWNER,
      kind: 'lander',
      body,
      ...(landingData === null ? { coveredReward: null } : {
        spaceId: setiFirstLandingSpaceId(body, landingData),
        coveredReward: { kind: 'first-landing-data' as const, amount: landingData },
      }),
    });
    if (body === 'Oumuamua') {
      gainSetiRivalScore(s, 10);
      const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'oumuamua');
      if (slot?.module?.kind === 'oumuamua') slot.module.exofossils[SETI_RIVAL_OWNER] = (slot.module.exofossils[SETI_RIVAL_OWNER] ?? 0) + 1;
    } else {
      if (landingData !== null) gainSetiRivalData(s, landingData);
      applyRivalKnownRewards(s, SETI_BODIES[body].landingRewards, adapter, { arrow });
    }
  }
  if (step.revealMascamiteSample) exposeRandomMascamiteSample(s, body);
}

function flySetiRival(
  s: SetiState,
  step: Extract<SetiRivalActionStep, { kind: 'fly-orbit-land' }>,
  arrow: SetiRivalArrow,
  adapter: SetiSoloRuntimeAdapter,
): boolean {
  const selected = chooseRivalFlight(s, step);
  const probe = rivalProbeOnEarth(s);
  if (!selected || !probe) return false;
  for (const cell of selected.route.cells) {
    probe.cell = cell;
    probe.supportLayer = setiSupportLayerForCell(s, cell);
    gainSetiRivalPublicity(s, arrivalPublicity(s, cell));
  }
  placeRivalSpacecraft(s, probe, selected.body, step, arrow, adapter);
  return true;
}

function projectRowIndex(s: SetiState, arrow: SetiRivalArrow): number | null {
  const indices = s.projectRow.flatMap((card, index) => card ? [index] : []);
  return chooseArrowEdge(indices, arrow);
}

function resolveRivalSignalSource(s: SetiState, source: SetiRivalSignalSource, arrow: SetiRivalArrow, adapter: SetiSoloRuntimeAdapter): void {
  if (source === 'earth-sector') {
    markSetiRivalSectorSignal(s, earthSetiSectorId(s), adapter);
    return;
  }
  if (source === 'oumuamua-tile') {
    markRivalOumuamuaTile(s);
    return;
  }
  const row = projectRowIndex(s, arrow);
  if (row === null) return;
  const cardId = s.projectRow[row]!;
  s.projectRow[row] = null;
  s.projectDiscard.push(cardId);
  markSetiRivalSignalByColor(s, SETI_PROJECT_CATALOG_BY_ID[cardId].signalColor, adapter);
}

function scanSetiRival(
  s: SetiState,
  step: Extract<SetiRivalActionStep, { kind: 'scan' }>,
  arrow: SetiRivalArrow,
  adapter: SetiSoloRuntimeAdapter,
): void {
  for (const source of step.signals) resolveRivalSignalSource(s, source, arrow, adapter);
  if (rivalTechCount(s, 'telescope') > 0) {
    removeRivalTech(s, 'telescope');
    resolveRivalSignalSource(s, 'project-row', arrow, adapter);
  }
  refillSetiProjectRow(s);
}

function analyzeSetiRival(
  s: SetiState,
  step: Extract<SetiRivalActionStep, { kind: 'analyze' }>,
  arrow: SetiRivalArrow,
  adapter: SetiSoloRuntimeAdapter,
): boolean {
  const solo = rival(s);
  if (!solo.computer.every(Boolean)) return false;
  solo.computer.fill(false);
  gainSetiRivalScore(s, step.baseVictoryPoints);
  markSetiRivalTrace(s, 'blue', arrow, adapter);
  const refill = refillSetiRivalComputerFromPool({ spaces: solo.computer, dataPool: solo.dataPool });
  solo.computer = refill.spaces;
  solo.dataPool = refill.dataPool;
  gainSetiRivalPublicity(s, refill.publicity);
  advanceSetiRivalProgressState(s, refill.progress);
  if (rivalTechCount(s, 'computer') > 0) {
    removeRivalTech(s, 'computer');
    gainSetiRivalScore(s, step.computerTech.victoryPoints);
    advanceSetiRivalProgressState(s, step.computerTech.progress);
  }
  return true;
}

function playRivalExertian(s: SetiState): boolean {
  const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'exertians');
  if (!slot?.alienDeck.length) return false;
  const index = setiRoll(s, 0, slot.alienDeck.length - 1);
  rival(s).exertianCards.push(slot.alienDeck.splice(index, 1)[0]);
  return true;
}

function rivalExertianBoardTraces(s: SetiState): number {
  const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'exertians');
  return slot?.research.filter((marker) => marker.owner === SETI_RIVAL_OWNER && !marker.overflow).length ?? 0;
}

function placeRivalCentaurianMessage(s: SetiState): boolean {
  const solo = rival(s);
  if (solo.centaurianMessagesReserve <= 0 || solo.centaurianMessageTarget !== null) return false;
  solo.centaurianMessagesReserve--;
  solo.centaurianMessageTarget = solo.rivalScore + 15;
  advanceSetiRivalProgressState(s, 1);
  return true;
}

function resolveRivalCentaurianMessage(s: SetiState, arrow: SetiRivalArrow, adapter: SetiSoloRuntimeAdapter): void {
  const solo = rival(s);
  if (solo.centaurianMessageTarget === null || solo.rivalScore < solo.centaurianMessageTarget) return;
  const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'centaurians');
  solo.centaurianMessageTarget = null;
  if (slot?.module?.kind !== 'centaurians') return;
  const module = slot.module;
  const available = SETI_CENTAURIAN_MESSAGE_REWARDS.map((_, index) => index)
    .filter((index) => !module.claimedRewards.includes(`reward:${index}`));
  const selected = chooseArrowEdge(available, arrow);
  if (selected === null) return;
  module.claimedRewards.push(`reward:${selected}`);
  applyRivalAlienRewards(s, SETI_CENTAURIAN_MESSAGE_REWARDS[selected], arrow, adapter);
}

function stepIsLegal(s: SetiState, step: SetiRivalActionStep): boolean {
  const solo = rival(s);
  switch (step.kind) {
    case 'analyze': return solo.computer.every(Boolean);
    case 'launch': return !rivalProbeOnEarth(s);
    case 'research-tech': return solo.rivalPublicity >= step.publicityCost && Object.values(s.techStacks).some((stack) => stack.tiles.length > 0);
    case 'fly-orbit-land': return chooseRivalFlight(s, step) !== null;
    case 'scan': return true;
    case 'replace-for-discovered-species': return solo.discoveredSpeciesInOrder.length >= step.discoveryOrder;
    case 'anomalies': return !!nextAnomaly(s) && !rivalWinningNextAnomaly(s);
    case 'centaurian-message': return solo.centaurianMessagesReserve > 0 && solo.centaurianMessageTarget === null;
    case 'play-exertian': return solo.exertianCards.length + rivalExertianBoardTraces(s) < step.legalOnlyIfPlayedPlusDangerTracesBelow
      && !!s.species.find((slot) => slot.revealed && slot.speciesId === 'exertians')?.alienDeck.length;
  }
}

function executeRivalStep(
  s: SetiState,
  card: SetiRivalActionCard,
  step: SetiRivalActionStep,
  adapter: SetiSoloRuntimeAdapter,
): SetiRivalActionCard {
  const arrow = card.arrow;
  switch (step.kind) {
    case 'analyze': analyzeSetiRival(s, step, arrow, adapter); break;
    case 'launch': launchSetiRivalProbe(s, step.publicity, step.progress); break;
    case 'research-tech': acquireSetiRivalTechnology(s, step.publicityCost, step.progress, arrow, adapter); break;
    case 'fly-orbit-land': flySetiRival(s, step, arrow, adapter); break;
    case 'scan': scanSetiRival(s, step, arrow, adapter); break;
    case 'anomalies': markRivalNextAnomaly(s, arrow, adapter); break;
    case 'centaurian-message': placeRivalCentaurianMessage(s); break;
    case 'play-exertian': playRivalExertian(s); break;
    case 'replace-for-discovered-species': {
      const species = rival(s).discoveredSpeciesInOrder[step.discoveryOrder - 1];
      const replacement = Object.values(SETI_RIVAL_ACTION_BY_ID).find((candidate) => candidate.group === 'species' && candidate.species === species);
      if (!replacement) break;
      rival(s).removedActionCards.push(card.id);
      const replacementStep = replacement.steps.find((candidate) => stepIsLegal(s, candidate));
      if (!replacementStep) throw new Error(`No legal action on rival species card ${replacement.id}`);
      executeRivalStep(s, replacement, replacementStep, adapter);
      return replacement;
    }
  }
  return card;
}

// ---------------------------------------------------------------------------
// Milestones, passing, turns, and endgame
// ---------------------------------------------------------------------------

function tileHasAnyClaim(s: SetiState, tileId: SetiGoldTileId): boolean {
  return rival(s).goldClaims.some((claim) => claim.tileId === tileId)
    || s.players.some((player) => player.goldClaims.some((claim) => claim.tileId === tileId));
}

function resolveRivalGoldMilestones(s: SetiState, arrow: SetiRivalArrow): void {
  const solo = rival(s);
  for (const threshold of SETI_RULES.goldThresholds) {
    if (solo.rivalScore < threshold || solo.goldClaims.some((claim) => claim.threshold === threshold)) continue;
    const options = s.goldTiles.map((tile) => tile.id).filter((tileId) => !tileHasAnyClaim(s, tileId));
    const selected = chooseArrowEdge(options, arrow);
    if (selected) solo.goldClaims.push({ threshold, tileId: selected });
  }
}

function resolveRivalNeutralMilestones(s: SetiState, adapter: SetiSoloRuntimeAdapter): void {
  const solo = rival(s);
  for (const threshold of [20, 30] as const) {
    if (solo.rivalScore < threshold || solo.neutralMilestones[threshold]) continue;
    solo.neutralMilestones[threshold] = true;
    adapter.placeNeutralMarker?.(s, threshold);
  }
}

export function settleSetiRivalMilestones(s: SetiState, adapter: SetiSoloRuntimeAdapter): void {
  if (!s.solo) return;
  resolveRivalCentaurianMessage(s, s.solo.currentDecisionArrow, adapter);
  resolveRivalGoldMilestones(s, s.solo.currentDecisionArrow);
  resolveRivalNeutralMilestones(s, adapter);
  adapter.revealPendingSpecies?.(s);
}

export function passSetiRival(s: SetiState, adapter: SetiSoloRuntimeAdapter): SetiRivalTurnResult {
  const solo = rival(s);
  if (solo.actionDeck.length) throw new Error('The rival can pass only when its action deck is empty');
  solo.actionDeck = setiShuffle(s, solo.actionDiscard);
  solo.actionDiscard = [];
  solo.passed = true;
  const roundStack = s.roundEndStacks[s.round - 1];
  const card = roundStack?.shift() ?? null;
  if (card) {
    s.projectDiscard.push(card);
    advanceSetiRivalProgressState(s, 1);
  }
  if (s.firstPassSeat === null) {
    s.firstPassSeat = SETI_RIVAL_OWNER;
    rotateForRival(s, adapter);
  }
  settleSetiRivalMilestones(s, adapter);
  emit(adapter, s, 'passes', card ? 'The round-end project card becomes 1 progress' : 'No round-end card remained');
  return { kind: 'pass', cardId: null, stepIndex: null, stepKind: null };
}

export function runSetiRivalTurn(s: SetiState, adapter: SetiSoloRuntimeAdapter): SetiRivalTurnResult {
  const solo = rival(s);
  if (solo.passed) return { kind: 'pass', cardId: null, stepIndex: null, stepKind: null };
  if (solo.actionDeck.length === 0) return passSetiRival(s, adapter);
  const cardId = solo.actionDeck.shift()!;
  const card = SETI_RIVAL_ACTION_BY_ID[cardId];
  if (!card) throw new Error(`Unknown rival action card ${cardId}`);
  solo.currentActionCard = card.id;
  solo.currentDecisionArrow = card.arrow;
  const stepIndex = card.steps.findIndex((step) => stepIsLegal(s, step));
  if (stepIndex < 0) throw new Error(`Rival action card ${card.printedId} has no legal action`);
  const step = card.steps[stepIndex];
  const resolvedCard = executeRivalStep(s, card, step, adapter);
  if (!solo.removedActionCards.includes(card.id)) solo.actionDiscard.push(resolvedCard.id);
  else solo.actionDiscard.push(resolvedCard.id);
  solo.lastActionCard = resolvedCard.id;
  solo.lastActionStep = resolvedCard === card ? stepIndex : resolvedCard.steps.findIndex((candidate) => stepIsLegal(s, candidate));
  solo.currentActionCard = null;
  solo.turnsTaken++;
  settleSetiRivalMilestones(s, adapter);
  emit(adapter, s, `resolves ${resolvedCard.printedId}`, step.kind);
  return { kind: 'action', cardId: resolvedCard.id, stepIndex, stepKind: step.kind };
}

export function beginSetiSoloRound(s: SetiState, adapter: SetiSoloRuntimeAdapter): SetiRivalTurnResult | null {
  if (!s.solo) return null;
  s.solo.passed = false;
  if (!s.solo.rivalStartsRound) return null;
  return runSetiRivalTurn(s, adapter);
}

export function afterSetiHumanTurn(s: SetiState, adapter: SetiSoloRuntimeAdapter): { bothPassed: boolean; rivalTurns: number } {
  if (!s.solo) return { bothPassed: false, rivalTurns: 0 };
  settleSetiSoloObjectivesAtEndOfHumanTurn(s);
  let rivalTurns = 0;
  // The rival can gain score or reach a message milestone during the human's
  // action (most commonly when a shared signal sector completes). Resolve
  // those end-of-turn milestones before the rival begins its own turn.
  settleSetiRivalMilestones(s, adapter);
  if (s.pending.length) return { bothPassed: false, rivalTurns };
  if (!s.solo.passed && !(s.players[0].passed && s.deferredEndRoundCard && s.solo.actionDeck.length === 0)) {
    runSetiRivalTurn(s, adapter);
    rivalTurns++;
  }
  while (s.players[0].passed && !s.solo.passed && s.pending.length === 0) {
    // The rival's automatic round-card removal is still a passing player's
    // choice for ordering purposes. It waits behind the human's deferred fan,
    // exactly as another human passer would.
    if (s.deferredEndRoundCard && s.solo.actionDeck.length === 0) break;
    runSetiRivalTurn(s, adapter);
    rivalTurns++;
  }
  return { bothPassed: s.players[0].passed && s.solo.passed, rivalTurns };
}

export function prepareSetiSoloNextRound(s: SetiState): void {
  if (!s.solo) return;
  s.solo.rivalStartsRound = !s.solo.rivalStartsRound;
  s.solo.passed = false;
  s.solo.currentActionCard = null;
}

function humanExertianDanger(s: SetiState, player: SetiPlayer): number {
  const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'exertians');
  if (slot?.module?.kind !== 'exertians') return 0;
  return (slot.module.dangerBySeat[player.seat] ?? 0)
    + player.hiddenExertian.reduce((sum, id) => sum + (SETI_ALIEN_CARDS_BY_ID[id]?.exertian?.danger ?? 0), 0);
}

function rivalExertianDanger(s: SetiState): number {
  const slot = s.species.find((candidate) => candidate.revealed && candidate.speciesId === 'exertians');
  if (slot?.module?.kind !== 'exertians') return 0;
  return (slot.module.dangerBySeat[SETI_RIVAL_OWNER] ?? 0)
    + rival(s).exertianCards.reduce((sum, id) => sum + (SETI_ALIEN_CARDS_BY_ID[id]?.exertian?.danger ?? 0), 0);
}

export function scoreSetiSoloEndGame(s: SetiState): number {
  const solo = rival(s);
  solo.rivalScore += setiSoloFinalObjectiveScore(solo.activeObjectives.length, solo.objectiveDeck.length, solo.difficulty);
  solo.rivalScore += solo.exertianCards.reduce((sum, id) => sum + (SETI_ALIEN_CARDS_BY_ID[id]?.exertian?.victoryPoints ?? 0), 0);
  const human = s.players[0];
  const humanDanger = humanExertianDanger(s, human);
  const rivalDanger = rivalExertianDanger(s);
  const greatest = Math.max(humanDanger, rivalDanger);
  if (greatest > 0 && humanDanger === greatest && human.finalScore !== null) human.finalScore -= Math.floor(human.finalScore / 10);
  if (greatest > 0 && rivalDanger === greatest) solo.rivalScore -= Math.floor(solo.rivalScore / 10);
  return solo.rivalScore;
}

export function setiSoloRivalPreferredTech(s: SetiState): SetiTechStackId | null {
  if (!s.solo) return null;
  const setup = SETI_SOLO_DIFFICULTY_BY_LEVEL[s.solo.difficulty];
  return chooseSetiRivalTechStack(setup, s.solo.progress, Object.values(s.techStacks).map((stack) => ({
    id: stack.id as SetiRivalTechStackId,
    tiles: stack.tiles.length,
    firstTakeBonusAvailable: stack.firstTakeBonusAvailable,
  }))) as SetiTechStackId | null;
}

// Runtime-level completeness guards. They make a future catalog addition fail
// loudly until the executor is extended as well.
const EXECUTED_STEP_KINDS: ReadonlySet<SetiRivalActionStep['kind']> = new Set([
  'analyze', 'launch', 'research-tech', 'fly-orbit-land', 'scan',
  'replace-for-discovered-species', 'anomalies', 'centaurian-message', 'play-exertian',
]);
for (const card of Object.values(SETI_RIVAL_ACTION_BY_ID)) {
  for (const step of card.steps) if (!EXECUTED_STEP_KINDS.has(step.kind)) throw new Error(`No solo runtime for rival step ${step.kind}`);
}
