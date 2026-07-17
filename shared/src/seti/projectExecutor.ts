// Ordered project-card executor.  It converts catalog operations into the
// existing SETI choice/action vocabulary, pausing only for a visual target.

import {
  SETI_BODIES,
  SETI_RULES,
  SETI_SECTORS,
  SETI_TECH_BY_ID,
  SETI_TECH_STACKS,
  adjacentSetiCells,
  parseSetiCell,
  type SetiBody,
  type SetiCellId,
  type SetiIncomeKind,
  type SetiSectorId,
  type SetiSignalColor,
  type SetiTechStackId,
  type SetiTraceColor,
} from './data.js';
import {
  SETI_PROJECT_CATALOG_BY_ID,
  type SetiProjectEffect,
  type SetiProjectCardType,
  type SetiProjectOp,
} from './projectCatalog.js';
import {
  SETI_ALIEN_CARDS_BY_ID,
  type SetiAlienIncome,
} from './alienCatalog.js';
import {
  addSetiProjectTurnBody,
  countSetiProjectMetric,
  emptySetiProjectContext,
  evaluateSetiProjectPredicate,
  getSetiTriggerableProjectSlots,
  setiProjectConditionSpeciesSlot,
  setiProjectMissionIsComplete,
  setiProjectRuntime,
  setiProjectSignalColor,
  setiProjectSignalOptions,
  type SetiProjectAwaiting,
  type SetiProjectBody,
  type SetiProjectResolution,
  type SetiProjectScanStep,
  type SetiProjectTriggerEvent,
} from './projectRuntime.js';
import {
  bodyAtSetiCell,
  drawSetiProjectCard,
  earthSetiSectorId,
  getSetiSolarFeatures,
  removeSetiPlacedSpacecraft,
  refillSetiProjectRow,
  setiPlayerHasAbility,
  setiProbeLimit,
  setiProbesInSpace,
  setiTraceTargets,
  type SetiPendingDecision,
  type SetiPlayer,
  type SetiSolarPiece,
  type SetiState,
} from './state.js';

export type SetiProjectChoice =
  | { kind: 'card'; cardId: string }
  | { kind: 'sector'; sectorId: SetiSectorId; row?: number }
  | { kind: 'trace-space'; spaceId: string }
  | { kind: 'tech-stack'; stackId: SetiTechStackId }
  | { kind: 'option'; option: string }
  | { kind: 'options'; options: string[] };

export interface SetiProjectExecutionResult { ok: boolean; error?: string }

type ProjectLandOp = Extract<SetiProjectOp, { kind: 'land' }>;
type ProjectResearchOp = Extract<SetiProjectOp, { kind: 'research' }>;

export interface SetiProjectExecutorAdapter {
  drawIntoHand(s: SetiState, player: SetiPlayer, amount: number): string[];
  launchProbe(s: SetiState, player: SetiPlayer, ignoreProbeLimit: boolean): SetiSolarPiece | null;
  moveProbeFree(s: SetiState, player: SetiPlayer, pieceId: string, to: SetiCellId): string | null;
  landProbeFree(s: SetiState, player: SetiPlayer, pieceId: string, body: SetiBody, operation: ProjectLandOp, occupiedSpacecraftId?: string): string | null;
  markSignal(s: SetiState, player: SetiPlayer, sectorId: SetiSectorId, gainData: boolean): void;
  placeTrace(s: SetiState, player: SetiPlayer, color: SetiTraceColor, spaceId: string): string | null;
  /** Rotate before choices are offered, as required even when no tech is available. */
  prepareResearch(s: SetiState, player: SetiPlayer, operation: ProjectResearchOp): void;
  acquireTechnology(s: SetiState, player: SetiPlayer, stackId: SetiTechStackId, operation: ProjectResearchOp): string | null;
  signalCorner(player: SetiPlayer, cardId: string): SetiSignalColor | null;
  discardHandCardForSignal(s: SetiState, player: SetiPlayer, cardId: string, sectorId: SetiSectorId): { error: string | null; signalHandled: boolean };
  applyKnownRewards(s: SetiState, player: SetiPlayer, body: SetiBody): void;
  emit(s: SetiState, player: SetiPlayer, title: string, detail?: string): void;
  afterResolution(s: SetiState, player: SetiPlayer): void;
}

type ProjectPendingDecision = SetiPendingDecision & { resolutionId?: number };

const success = (): SetiProjectExecutionResult => ({ ok: true });
const failure = (error: string): SetiProjectExecutionResult => ({ ok: false, error });

function gainPublicity(player: SetiPlayer, amount: number): void {
  player.publicity = Math.max(0, Math.min(SETI_RULES.publicityMax, player.publicity + amount));
}

function gainData(player: SetiPlayer, amount: number): void {
  player.dataPool = Math.max(0, Math.min(SETI_RULES.dataMax, player.dataPool + amount));
}

function gainResource(player: SetiPlayer, resource: Exclude<Extract<SetiProjectOp, { kind: 'gain' }>['resource'], 'move'>, amount: number): void {
  switch (resource) {
    case 'credit': player.credits += amount; break;
    case 'energy': player.energy += amount; break;
    case 'publicity': gainPublicity(player, amount); break;
    case 'data': gainData(player, amount); break;
    case 'vp': player.score = Math.max(0, player.score + amount); break;
  }
}

function projectDecision(
  resolution: SetiProjectResolution,
  label: string,
  options: string[],
): ProjectPendingDecision {
  return {
    kind: 'card-effect-choice',
    owner: resolution.owner,
    cardId: resolution.cardId,
    label,
    min: 1,
    max: 1,
    options,
    resolutionId: resolution.id,
  } as ProjectPendingDecision;
}

function signalDecision(
  resolution: SetiProjectResolution,
  options: SetiSectorId[],
  signalColor: SetiSignalColor | null,
  source: 'earth' | 'project-row' | 'effect' = 'effect',
  rowOptions?: number[],
): ProjectPendingDecision {
  return {
    kind: 'signal-sector', owner: resolution.owner, source, options, signalColor,
    ...(rowOptions ? { rowOptions } : {}), resolutionId: resolution.id,
  } as ProjectPendingDecision;
}

function pause(s: SetiState, resolution: SetiProjectResolution, awaiting: SetiProjectAwaiting, decision: ProjectPendingDecision): void {
  resolution.awaiting = awaiting;
  s.pending.unshift(decision as SetiPendingDecision);
}

function removeOne(values: string[], value: string): boolean {
  const index = values.indexOf(value);
  if (index < 0) return false;
  values.splice(index, 1);
  return true;
}

function removeCurrentCardFromZone(s: SetiState, player: SetiPlayer, cardId: string): void {
  if (removeOne(s.projectDiscard, cardId)) return;
  const permanentCards = (player as SetiPlayer & { permanentCards: string[] }).permanentCards ?? [];
  for (const zone of [player.missions, player.completedMissions, player.scoringCards, permanentCards] as string[][]) {
    if (removeOne(zone, cardId)) return;
  }
  const income = player.incomeCards.findIndex((card) => card.cardId === cardId);
  if (income >= 0) player.incomeCards.splice(income, 1);
}

function gainPrintedIncome(s: SetiState, player: SetiPlayer, kind: SetiIncomeKind | SetiAlienIncome, adapter: SetiProjectExecutorAdapter): void {
  if (kind === 'credit') player.credits++;
  else if (kind === 'energy') player.energy++;
  else if (kind === 'card') adapter.drawIntoHand(s, player, 1);
  else if (kind === 'publicity') gainPublicity(player, 1);
  else gainData(player, 1);
}

function tuckThisCard(s: SetiState, player: SetiPlayer, resolution: SetiProjectResolution, adapter: SetiProjectExecutorAdapter): void {
  const card = SETI_PROJECT_CATALOG_BY_ID[resolution.cardId];
  if (!card) return;
  removeCurrentCardFromZone(s, player, resolution.cardId);
  player.incomeCards.push({ cardId: resolution.cardId, kind: card.income, starting: false });
  if (setiProjectRuntime(s).resolvingCard?.cardId === resolution.cardId) setiProjectRuntime(s).resolvingCard!.relocated = true;
  gainPrintedIncome(s, player, card.income, adapter);
}

function completeOperation(s: SetiState, player: SetiPlayer, adapter: SetiProjectExecutorAdapter): void {
  const resolution = setiProjectRuntime(s).resolution;
  if (!resolution) return;
  resolution.awaiting = null;
  resolution.index++;
  continueSetiProjectResolution(s, player, adapter);
}

function suspendSetiProjectResolution(s: SetiState, resolution: SetiProjectResolution): void {
  const runtime = setiProjectRuntime(s);
  if (runtime.resolution !== resolution) return;
  runtime.resolution = null;
  runtime.resolutionStack.push(resolution);
}

/** Resume a parent card after all decisions emitted by its previous effect. */
export function resumeSetiProjectResolution(
  s: SetiState,
  _player: SetiPlayer,
  adapter: SetiProjectExecutorAdapter,
): boolean {
  const runtime = setiProjectRuntime(s);
  if (!runtime.resolution && runtime.resolutionStack.length && !s.pending.length) {
    const parent = runtime.resolutionStack.pop()!;
    runtime.resolution = parent;
    if (parent.resumeDecision) {
      s.pending.unshift(parent.resumeDecision, ...parent.resumePending);
      parent.resumeDecision = null;
      parent.resumePending = [];
    }
    const owner = s.players[parent.owner];
    if (!owner) throw new Error(`SETI suspended project resolution ${parent.id} has no owner`);
    continueSetiProjectResolution(s, owner, adapter);
  }
  return !!runtime.resolution || runtime.resolutionStack.length > 0;
}

/** Suspend an awaiting main-action effect while one complete free action runs. */
export function suspendSetiProjectForInterrupt(
  s: SetiState,
  decision: SetiPendingDecision,
  pendingBeforeInterrupt: readonly SetiPendingDecision[],
): boolean {
  const runtime = setiProjectRuntime(s);
  const resolution = runtime.resolution;
  const decisionId = 'resolutionId' in decision ? decision.resolutionId : undefined;
  if (!resolution || !resolution.awaiting || decisionId !== resolution.id) return false;
  const prior = new Set(pendingBeforeInterrupt);
  const added = s.pending.filter((candidate) => !prior.has(candidate));
  const oldTail = pendingBeforeInterrupt.filter((candidate) => candidate !== decision);
  resolution.resumeDecision = decision;
  resolution.resumePending = [...oldTail];
  s.pending = added;
  suspendSetiProjectResolution(s, resolution);
  return true;
}

function cardEffectOptions(s: SetiState): string[] {
  return ['deck', ...s.projectRow.flatMap((card, index) => card ? [`row:${index}`] : [])];
}

function signalHandCards(player: SetiPlayer, adapter: SetiProjectExecutorAdapter): string[] {
  return [...player.hand, ...player.alienHand].filter((cardId) => adapter.signalCorner(player, cardId) !== null);
}

function incomeHandCards(player: SetiPlayer): string[] {
  return [
    ...player.hand.filter((cardId) => !!SETI_PROJECT_CATALOG_BY_ID[cardId]),
    ...player.alienHand.filter((cardId) => {
      const card = SETI_ALIEN_CARDS_BY_ID[cardId];
      return !!card && card.species !== 'exertians' && card.incomeCorner !== null;
    }),
  ];
}

function scanStepOptions(
  s: SetiState,
  player: SetiPlayer,
  awaiting: Extract<SetiProjectAwaiting, { kind: 'scan' }>,
  adapter: SetiProjectExecutorAdapter,
): string[] {
  const options: string[] = [];
  if (!awaiting.completedBase.includes('earth')) options.push('earth');
  if (!awaiting.completedBase.includes('project-row') && s.projectRow.some(Boolean)) options.push('project-row');
  if (!awaiting.usedTech.includes('discard-extra-signal')
    && setiPlayerHasAbility(player, 'discard-extra-signal')
    && signalHandCards(player, adapter).length) options.push('discard-extra-signal');
  if (!awaiting.usedTech.includes('mercury-publicity-signal')
    && setiPlayerHasAbility(player, 'mercury-publicity-signal')
    && player.publicity >= 1) options.push('mercury-publicity-signal');
  const canLaunch = setiProbesInSpace(s, player.seat) < setiProbeLimit(player);
  const canMove = s.solar.pieces.some((piece) => piece.owner === player.seat);
  if (!awaiting.usedTech.includes('energy-launch-or-move')
    && setiPlayerHasAbility(player, 'energy-launch-or-move')
    && player.energy >= 1 && (canLaunch || canMove)) options.push('energy-launch-or-move');
  if (awaiting.completedBase.includes('earth') && awaiting.completedBase.includes('project-row')) options.push('done');
  return options;
}

function scanStepDecision(
  s: SetiState,
  player: SetiPlayer,
  resolution: SetiProjectResolution,
  awaiting: Extract<SetiProjectAwaiting, { kind: 'scan' }>,
  adapter: SetiProjectExecutorAdapter,
): ProjectPendingDecision {
  awaiting.phase = 'choose-step';
  awaiting.activeStep = null;
  awaiting.selectedCardId = null;
  awaiting.selectedPieceId = null;
  return projectDecision(resolution, 'Choose the next Scan element on the table', scanStepOptions(s, player, awaiting, adapter));
}

function researchOptions(s: SetiState, player: SetiPlayer, op: ProjectResearchOp): SetiTechStackId[] {
  const allowed: readonly string[] = typeof op.technology !== 'string'
    ? [...op.technology]
    : op.technology === 'any' ? ['probe', 'telescope', 'computer'] : [op.technology];
  return SETI_TECH_STACKS
    .filter((stack) => allowed.includes(stack.type)
      && s.techStacks[stack.id].tiles.length > 0
      && !player.techs.some((tech) => tech.stackId === stack.id)
      && (!op.onlyIfResearchedByAnother || s.techStacks[stack.id].tiles.length < stack.tiles.length))
    .map((stack) => stack.id);
}

function freeLandOptions(s: SetiState, player: SetiPlayer, op: ProjectLandOp): string[] {
  const options: string[] = [];
  for (const piece of s.solar.pieces.filter((candidate) => candidate.owner === player.seat && candidate.kind === 'probe')) {
    const primary = bodyAtSetiCell(s, piece.cell);
    if (!primary || primary === 'Earth') continue;
    options.push(`${piece.id}|${primary}`);
    if (op.allowOccupiedSpaceAndGainCoveredReward) {
      for (const occupied of s.placedSpacecraft.filter((candidate) => candidate.kind === 'lander' && candidate.body === primary)) {
        options.push(`${piece.id}|${primary}|occupied:${occupied.id}`);
      }
    }
    for (const body of Object.keys(SETI_BODIES) as SetiBody[]) {
      const definition = SETI_BODIES[body];
      if (!definition.moon || definition.parent !== primary) continue;
      if (!op.ignoreMoonTechnology && !setiPlayerHasAbility(player, 'moon-landing')) continue;
      const occupied = s.placedSpacecraft.filter((candidate) => candidate.kind === 'lander' && candidate.body === body);
      if (!occupied.length) options.push(`${piece.id}|${body}`);
      else if (op.allowOccupiedSpaceAndGainCoveredReward) {
        for (const target of occupied) options.push(`${piece.id}|${body}|occupied:${target.id}`);
      }
    }
  }
  return options;
}

function traceOptions(s: SetiState, player: SetiPlayer, awaiting: Extract<SetiProjectAwaiting, { kind: 'trace' }>, color: SetiTraceColor): string[] {
  let options = setiTraceTargets(s, color);
  const slot = setiProjectRuntime(s).resolution?.context.conditionSpeciesSlot;
  if (awaiting.operation.species === 'same-as-condition' && slot !== null && slot !== undefined) {
    options = options.filter((space) => space.startsWith(`seti_species_${slot}_`));
  }
  if (awaiting.operation.requiresLifeTraceSameColor) {
    const ownedSlots = new Set(player.traceMarkers.filter((trace) => trace.color === color).map((trace) => trace.speciesSlot));
    options = options.filter((space) => [...ownedSlots].some((candidate) => space.startsWith(`seti_species_${candidate}_`)));
  }
  return options;
}

function queueTraceSpace(s: SetiState, player: SetiPlayer, resolution: SetiProjectResolution, awaiting: Extract<SetiProjectAwaiting, { kind: 'trace' }>, color: SetiTraceColor): boolean {
  const options = traceOptions(s, player, awaiting, color);
  if (!options.length) return false;
  awaiting.color = color;
  s.pending.unshift({ kind: 'trace-space', owner: player.seat, color, options, resolutionId: resolution.id } as ProjectPendingDecision as SetiPendingDecision);
  return true;
}

function probeSector(s: SetiState, pieceId: string): SetiSectorId | null {
  const piece = s.solar.pieces.find((candidate) => candidate.id === pieceId);
  return piece ? s.sectorOrder[parseSetiCell(piece.cell).sector] : null;
}

function beginMove(
  s: SetiState,
  resolution: SetiProjectResolution,
  amount: number,
  completion: 'operation' | 'drawn-corner' = 'operation',
  resumeMarketCorners?: number,
): boolean {
  if (amount <= 0 || !s.solar.pieces.some((piece) => piece.owner === resolution.owner)) return false;
  const awaiting: Extract<SetiProjectAwaiting, { kind: 'move' }> = { kind: 'move', remaining: amount, pieceId: null, completion, ...(resumeMarketCorners !== undefined ? { resumeMarketCorners } : {}) };
  pause(s, resolution, awaiting, projectDecision(resolution, 'Choose a piece to move, or skip the optional movement', ['skip', ...s.solar.pieces.filter((piece) => piece.owner === resolution.owner).map((piece) => piece.id)]));
  return true;
}

function finishResolution(s: SetiState, player: SetiPlayer, adapter: SetiProjectExecutorAdapter): void {
  const runtime = setiProjectRuntime(s);
  const finished = runtime.resolution;
  if (!finished) return;
  runtime.resolution = null;
  if (finished.deferredPending.length) s.pending.unshift(...finished.deferredPending);
  if (runtime.resolutionStack.length) {
    resumeSetiProjectResolution(s, player, adapter);
    return;
  }
  adapter.afterResolution(s, player);
}

export function beginSetiProjectResolution(
  s: SetiState,
  player: SetiPlayer,
  cardId: string,
  source: SetiProjectResolution['source'],
  operations: readonly SetiProjectOp[],
  adapter: SetiProjectExecutorAdapter,
  condition?: Extract<SetiProjectEffect, { timing: 'conditional-mission' }>['condition'],
): void {
  const runtime = setiProjectRuntime(s);
  if (runtime.resolution) throw new Error(`SETI project resolution ${runtime.resolution.id} is already active`);
  const deferredPending = s.pending.splice(0);
  const context = emptySetiProjectContext();
  if (condition) context.conditionSpeciesSlot = setiProjectConditionSpeciesSlot(player, condition);
  runtime.resolution = {
    id: runtime.nextResolutionId++, owner: player.seat, cardId, source,
    operations: [...operations], index: 0, context, awaiting: null, deferredPending,
    resumeDecision: null, resumePending: [], preparedOperationIndices: [],
  };
  // Temporary rules govern all movement granted by the card, even when their
  // explanatory icon follows the movement icons on the printed card.
  for (const op of operations) {
    if (op.kind !== 'temporary-rule') continue;
    if (!runtime.turn.temporaryRules.some((entry) => entry.rule === op.rule)) runtime.turn.temporaryRules.push({ rule: op.rule, sourceCardId: cardId });
  }
  continueSetiProjectResolution(s, player, adapter);
}

export function continueSetiProjectResolution(s: SetiState, player: SetiPlayer, adapter: SetiProjectExecutorAdapter): void {
  const resolution = setiProjectRuntime(s).resolution;
  if (!resolution || resolution.owner !== player.seat || resolution.awaiting) return;
  if (s.pending.length) {
    suspendSetiProjectResolution(s, resolution);
    return;
  }
  while (resolution.index < resolution.operations.length) {
    const op = resolution.operations[resolution.index];
    switch (op.kind) {
      case 'gain': {
        if (op.resource === 'move') {
          if (beginMove(s, resolution, op.amount)) return;
        } else gainResource(player, op.resource, op.amount);
        resolution.index++;
        break;
      }
      case 'gain-per': {
        const amount = op.amount * countSetiProjectMetric(s, player, op.metric, resolution.context);
        if (op.resource === 'move') {
          if (beginMove(s, resolution, amount)) return;
        } else gainResource(player, op.resource, amount);
        resolution.index++;
        break;
      }
      case 'draw-project': {
        if (op.source === 'deck') {
          const drawn = adapter.drawIntoHand(s, player, op.amount);
          resolution.context.lastDrawnCardId = drawn.at(-1) ?? resolution.context.lastDrawnCardId;
          resolution.index++;
          break;
        }
        const options = cardEffectOptions(s);
        if (!options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'draw-project' }> = { kind: 'draw-project', remaining: op.amount, operation: op };
        pause(s, resolution, awaiting, projectDecision(resolution, 'Take a project card from the row or deck', options));
        return;
      }
      case 'launch': {
        for (let count = 0; count < op.amount; count++) {
          const piece = adapter.launchProbe(s, player, !!op.ignoreProbeLimit);
          if (!piece) break;
          addSetiProjectTurnBody(s, player, 'Earth');
          queueSetiProjectTrigger(s, player, { kind: 'launch' });
        }
        resolution.index++;
        break;
      }
      case 'move': {
        if (beginMove(s, resolution, op.amount)) return;
        resolution.index++;
        break;
      }
      case 'land': {
        const options = freeLandOptions(s, player, op);
        if (!options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'land' }> = { kind: 'land', operation: op };
        pause(s, resolution, awaiting, projectDecision(resolution, 'Choose a probe and landing destination', options));
        return;
      }
      case 'scan': {
        if (!resolution.preparedOperationIndices.includes(resolution.index)) {
          resolution.preparedOperationIndices.push(resolution.index);
          queueSetiProjectTrigger(s, player, { kind: 'scan' });
          if (s.pending.length) {
            suspendSetiProjectResolution(s, resolution);
            return;
          }
        }
        refillSetiProjectRow(s);
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'scan' }> = {
          kind: 'scan', phase: 'choose-step', operation: op,
          completedBase: s.projectRow.some(Boolean) ? [] : ['project-row'],
          usedTech: [], activeStep: null, selectedCardId: null, selectedPieceId: null,
        };
        pause(s, resolution, awaiting, scanStepDecision(s, player, resolution, awaiting, adapter));
        return;
      }
      case 'research': {
        if (!resolution.preparedOperationIndices.includes(resolution.index)) {
          resolution.preparedOperationIndices.push(resolution.index);
          adapter.prepareResearch(s, player, op);
          if (s.pending.length) {
            suspendSetiProjectResolution(s, resolution);
            return;
          }
        }
        const options = researchOptions(s, player, op);
        if (!options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'research' }> = { kind: 'research', operation: op };
        resolution.awaiting = awaiting;
        s.pending.unshift({ kind: 'tech-stack', owner: player.seat, options, free: true, resolutionId: resolution.id } as ProjectPendingDecision as SetiPendingDecision);
        return;
      }
      case 'mark-signal': {
        const options = op.target.kind === 'own-probe-sector-and-neighbors'
          ? setiProjectSignalOptions(s, player, { kind: 'own-probe-sector', probeMustBeOnSolarSystem: true })
          : setiProjectSignalOptions(s, player, op.target);
        if (!options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'signal' }> = { kind: 'signal', remaining: op.amount, operation: op, lockedOptions: null };
        pause(s, resolution, awaiting, signalDecision(resolution, options, op.target.kind === 'color' ? op.target.color : null));
        return;
      }
      case 'discard-market-for-signals': {
        const row = s.projectRow.flatMap((card, index) => card ? [`row:${index}`] : []);
        if (!row.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'market-signals' }> = { kind: 'market-signals', remaining: op.amount, operation: op, selectedCardId: null, signalColor: null };
        pause(s, resolution, awaiting, projectDecision(resolution, 'Choose a project-row card to discard for its signal', row));
        return;
      }
      case 'discard-hand-for-signals': {
        const handCards = signalHandCards(player, adapter);
        if (!handCards.length || op.maximum <= 0) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'hand-signals' }> = { kind: 'hand-signals', used: 0, operation: op, selectedCardId: null, signalColor: null };
        const options = [...(op.minimum === 0 ? ['done'] : []), ...handCards];
        pause(s, resolution, awaiting, projectDecision(resolution, 'Discard project cards for their signals, or finish', options));
        return;
      }
      case 'discard-deck-top-for-signal': {
        const cardId = drawSetiProjectCard(s);
        if (!cardId) { resolution.index++; break; }
        s.projectDiscard.push(cardId);
        const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
        const options = card ? SETI_SECTORS.filter((sector) => sector.printedSignalColor === card.signalColor).map((sector) => sector.id) : [];
        if (!card || !options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'deck-signals' }> = { kind: 'deck-signals', remaining: op.repeat, operation: op, selectedCardId: cardId, signalColor: card.signalColor };
        pause(s, resolution, awaiting, signalDecision(resolution, options, card.signalColor));
        return;
      }
      case 'mark-trace': {
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'trace' }> = { kind: 'trace', operation: op, color: op.color === 'any' ? null : op.color };
        resolution.awaiting = awaiting;
        if (op.color === 'any') {
          s.pending.unshift(projectDecision(resolution, 'Choose a life-trace color', ['purple', 'orange', 'blue']) as SetiPendingDecision);
          return;
        }
        if (queueTraceSpace(s, player, resolution, awaiting, op.color)) return;
        resolution.awaiting = null;
        resolution.index++;
        break;
      }
      case 'remove-piece': {
        const options = s.placedSpacecraft.filter((piece) => piece.owner === player.seat
          && piece.kind === op.piece
          && (piece.body === 'Pluto' || op.from === 'any-planet-or-moon' || !SETI_BODIES[piece.body].moon))
          .map((piece) => piece.id);
        if (!options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'remove-piece' }> = { kind: 'remove-piece', operation: op };
        pause(s, resolution, awaiting, projectDecision(resolution, `Choose an ${op.piece} to remove`, options));
        return;
      }
      case 'resolve-drawn-project-free-corner': {
        const cardId = resolution.context.lastDrawnCardId;
        const card = cardId ? SETI_PROJECT_CATALOG_BY_ID[cardId] : null;
        if (!card || !player.hand.includes(card.id)) { resolution.index++; break; }
        removeOne(player.hand, card.id);
        s.projectDiscard.push(card.id);
        queueSetiProjectTrigger(s, player, { kind: 'discard-free-corner', freeCorner: card.freeCorner });
        if (card.freeCorner === 'move') {
          if (beginMove(s, resolution, 1, 'drawn-corner')) return;
        } else if (card.freeCorner === 'publicity') gainPublicity(player, 1);
        else gainData(player, 1);
        resolution.index++;
        break;
      }
      case 'discard-market-for-free-corners': {
        const options = s.projectRow.flatMap((card, index) => card ? [`row:${index}`] : []);
        if (!options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'market-corners' }> = { kind: 'market-corners', remaining: op.amount, operation: op };
        pause(s, resolution, awaiting, projectDecision(resolution, 'Choose a project-row card to discard for its free corner', options));
        return;
      }
      case 'tuck-income': {
        if (op.card === 'this-card') {
          // Income effects are optional.  The explicit skip is important when
          // the printed income would be worse than keeping the card in its zone.
          const awaiting: Extract<SetiProjectAwaiting, { kind: 'tuck-income' }> = { kind: 'tuck-income', operation: op };
          pause(s, resolution, awaiting, projectDecision(resolution, 'Tuck this card as income?', ['skip', resolution.cardId]));
          return;
        }
        const hand = incomeHandCards(player);
        if (!hand.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'tuck-income' }> = { kind: 'tuck-income', operation: op };
        pause(s, resolution, awaiting, projectDecision(resolution, 'Choose a card to tuck as income, or skip', ['skip', ...hand]));
        return;
      }
      case 'resolve-rightmost-unmarked-gold-tile-space':
        // This operation is resolved by the dedicated end-game scorer.
        resolution.index++;
        break;
      case 'return-this-card-to-hand':
        removeCurrentCardFromZone(s, player, resolution.cardId);
        if (!player.hand.includes(resolution.cardId)) player.hand.push(resolution.cardId);
        if (setiProjectRuntime(s).resolvingCard?.cardId === resolution.cardId) setiProjectRuntime(s).resolvingCard!.relocated = true;
        resolution.index++;
        break;
      case 'mark-signals-at-selected-probes': {
        const probes = s.solar.pieces.filter((piece) => piece.kind === 'probe');
        if (!probes.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'probe-signals' }> = { kind: 'probe-signals', remaining: op.maximum, selectedProbeIds: [], operation: op };
        pause(s, resolution, awaiting, projectDecision(resolution, 'Choose a probe whose sector receives a signal, or finish', ['done', ...probes.map((probe) => probe.id)]));
        return;
      }
      case 'survey-selected-probe': {
        const probes = s.solar.pieces.filter((piece) => piece.owner === player.seat && piece.kind === 'probe');
        if (!probes.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'survey-probe' }> = { kind: 'survey-probe', operation: op };
        pause(s, resolution, awaiting, projectDecision(resolution, 'Choose one of your probes to survey', probes.map((probe) => probe.id)));
        return;
      }
      case 'temporary-rule':
        resolution.index++;
        break;
      case 'if': {
        const replacement = evaluateSetiProjectPredicate(s, player, op.condition, resolution.context) ? [...op.then] : [];
        resolution.operations.splice(resolution.index, 1, ...replacement);
        break;
      }
      case 'install-pluto': {
        const pluto = setiProjectRuntime(s).pluto;
        pluto.installedBy = player.seat;
        pluto.cardId = resolution.cardId;
        resolution.index++;
        break;
      }
      default: {
        const exhaustive: never = op;
        throw new Error(`Unsupported SETI project operation ${(exhaustive as SetiProjectOp).kind}`);
      }
    }
    if (s.pending.length && !resolution.awaiting) {
      suspendSetiProjectResolution(s, resolution);
      return;
    }
  }
  finishResolution(s, player, adapter);
}

function optionFrom(choice: SetiProjectChoice): string | null {
  if (choice.kind === 'option') return choice.option;
  if (choice.kind === 'options' && choice.options.length === 1) return choice.options[0];
  return null;
}

function replaceHead(s: SetiState, decision: ProjectPendingDecision): void {
  s.pending.shift();
  s.pending.unshift(decision as SetiPendingDecision);
}

function finishHeadAndOperation(s: SetiState, player: SetiPlayer, adapter: SetiProjectExecutorAdapter): SetiProjectExecutionResult {
  s.pending.shift();
  completeOperation(s, player, adapter);
  return success();
}

function finishMovementHead(
  s: SetiState,
  player: SetiPlayer,
  resolution: SetiProjectResolution,
  awaiting: Extract<SetiProjectAwaiting, { kind: 'move' }>,
  adapter: SetiProjectExecutorAdapter,
): SetiProjectExecutionResult {
  s.pending.shift();
  if (awaiting.resumeMarketCorners !== undefined) {
    const remaining = awaiting.resumeMarketCorners;
    if (remaining > 0 && s.projectRow.some(Boolean)) {
      const operation = resolution.operations[resolution.index];
      if (operation.kind !== 'discard-market-for-free-corners') return failure('Project corner resolution lost its printed operation');
      const resumed: Extract<SetiProjectAwaiting, { kind: 'market-corners' }> = { kind: 'market-corners', remaining, operation };
      resolution.awaiting = resumed;
      s.pending.unshift(projectDecision(resolution, 'Choose another row card for its free corner', s.projectRow.flatMap((card, index) => card ? [`row:${index}`] : [])) as SetiPendingDecision);
      return success();
    }
    refillSetiProjectRow(s);
  }
  completeOperation(s, player, adapter);
  return success();
}

function recordSignal(s: SetiState, player: SetiPlayer, resolution: SetiProjectResolution, sectorId: SetiSectorId, gainSignalData: boolean, adapter: SetiProjectExecutorAdapter): void {
  adapter.markSignal(s, player, sectorId, gainSignalData);
  const color = setiProjectSignalColor(sectorId);
  resolution.context.signalsMarked.push({ sectorId, color });
  resolution.context.targetSectorId = sectorId;
  if (s.sectors[sectorId].completionPending) resolution.context.completedSector = true;
}

export function resolveSetiProjectPending(
  s: SetiState,
  player: SetiPlayer,
  decision: ProjectPendingDecision,
  choice: SetiProjectChoice,
  adapter: SetiProjectExecutorAdapter,
): SetiProjectExecutionResult | null {
  const resolution = setiProjectRuntime(s).resolution;
  if (!decision.resolutionId) return null;
  if (!resolution || resolution.id !== decision.resolutionId || resolution.owner !== player.seat || !resolution.awaiting) return failure('Project effect is no longer waiting for that target');
  const awaiting = resolution.awaiting;
  const option = optionFrom(choice);
  switch (awaiting.kind) {
    case 'draw-project': {
      if (!option || !(decision.kind === 'card-effect-choice') || !decision.options.includes(option)) return failure('Choose a highlighted project source');
      let cardId: string | null = null;
      if (option === 'deck') cardId = drawSetiProjectCard(s);
      else if (option.startsWith('row:')) {
        const row = Number(option.slice(4));
        cardId = s.projectRow[row] ?? null;
        if (cardId) s.projectRow[row] = null;
      }
      if (!cardId) return failure('That project source is empty');
      player.hand.push(cardId);
      resolution.context.lastDrawnCardId = cardId;
      refillSetiProjectRow(s);
      awaiting.remaining--;
      if (awaiting.remaining <= 0) return finishHeadAndOperation(s, player, adapter);
      replaceHead(s, projectDecision(resolution, 'Take another project card from the row or deck', cardEffectOptions(s)));
      return success();
    }
    case 'move': {
      if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose a highlighted movement target');
      if (option === 'skip') return finishMovementHead(s, player, resolution, awaiting, adapter);
      if (awaiting.pieceId === null) {
        const piece = s.solar.pieces.find((candidate) => candidate.id === option && candidate.owner === player.seat);
        if (!piece) return failure('Choose one of your pieces');
        awaiting.pieceId = piece.id;
        replaceHead(s, projectDecision(resolution, 'Move to an adjacent space, or skip the remaining movement', ['skip', ...adjacentSetiCells(piece.cell)]));
        return success();
      }
      const to = option as SetiCellId;
      const error = adapter.moveProbeFree(s, player, awaiting.pieceId, to);
      if (error) return failure(error);
      awaiting.remaining--;
      awaiting.pieceId = null;
      if (awaiting.remaining <= 0) return finishMovementHead(s, player, resolution, awaiting, adapter);
      replaceHead(s, projectDecision(resolution, 'Choose a piece for the next optional movement', ['skip', ...s.solar.pieces.filter((piece) => piece.owner === player.seat).map((piece) => piece.id)]));
      return success();
    }
    case 'land': {
      if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose a highlighted landing');
      const [pieceId, bodyValue, occupiedValue] = option.split('|');
      const body = bodyValue as SetiBody;
      const occupiedSpacecraftId = occupiedValue?.startsWith('occupied:') ? occupiedValue.slice('occupied:'.length) : undefined;
      const error = adapter.landProbeFree(s, player, pieceId, body, awaiting.operation, occupiedSpacecraftId);
      if (error) return failure(error);
      resolution.context.landedBodies.push(body);
      return finishHeadAndOperation(s, player, adapter);
    }
    case 'scan': {
      if (awaiting.phase === 'choose-step') {
        if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose a highlighted Scan element');
        if (option === 'done') {
          refillSetiProjectRow(s);
          return finishHeadAndOperation(s, player, adapter);
        }
        awaiting.activeStep = option as SetiProjectScanStep;
        if (option === 'earth') {
          const earth = earthSetiSectorId(s);
          const options = setiPlayerHasAbility(player, 'earth-signal-adjacent')
            ? [earth, s.sectorOrder[(s.sectorOrder.indexOf(earth) + 7) % 8], s.sectorOrder[(s.sectorOrder.indexOf(earth) + 1) % 8]]
            : [earth];
          awaiting.phase = 'signal';
          replaceHead(s, signalDecision(resolution, [...new Set(options)], null, 'earth'));
          return success();
        }
        if (option === 'project-row') {
          const rows = s.projectRow.map((card, index) => card ? index : -1).filter((index) => index >= 0);
          const colors = new Set(rows.map((row) => SETI_PROJECT_CATALOG_BY_ID[s.projectRow[row]!]!.signalColor));
          const options = SETI_SECTORS.filter((sector) => colors.has(sector.printedSignalColor)).map((sector) => sector.id);
          awaiting.phase = 'signal';
          replaceHead(s, signalDecision(resolution, options, null, 'project-row', rows));
          return success();
        }
        if (option === 'discard-extra-signal') {
          awaiting.phase = 'hand-card';
          replaceHead(s, projectDecision(resolution, 'Touch one hand card to discard for its signal', signalHandCards(player, adapter)));
          return success();
        }
        if (option === 'mercury-publicity-signal') {
          if (player.publicity < 1) return failure('The Mercury telescope tech costs 1 publicity');
          player.publicity--;
          awaiting.phase = 'signal';
          const options = setiProjectSignalOptions(s, player, { kind: 'body-sector', body: 'Mercury' });
          replaceHead(s, signalDecision(resolution, options, null));
          return success();
        }
        const canLaunch = setiProbesInSpace(s, player.seat) < setiProbeLimit(player);
        const canMove = s.solar.pieces.some((piece) => piece.owner === player.seat);
        if (option !== 'energy-launch-or-move' || player.energy < 1 || (!canLaunch && !canMove)) return failure('The energy telescope tech is unavailable');
        awaiting.phase = 'energy-choice';
        replaceHead(s, projectDecision(resolution, 'Touch the launch bay or one of your probes', [...(canLaunch ? ['launch'] : []), ...(canMove ? ['move'] : [])]));
        return success();
      }
      if (awaiting.phase === 'hand-card') {
        if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option) || !signalHandCards(player, adapter).includes(option)) return failure('Choose a signal card that is still in your hand');
        const color = adapter.signalCorner(player, option);
        if (!color) return failure('That card has no signal corner');
        awaiting.selectedCardId = option;
        awaiting.phase = 'signal';
        replaceHead(s, signalDecision(resolution, SETI_SECTORS.filter((sector) => sector.printedSignalColor === color).map((sector) => sector.id), color));
        return success();
      }
      if (awaiting.phase === 'energy-choice') {
        if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option) || player.energy < 1) return failure('Choose a highlighted telescope-tech action');
        if (option === 'launch') {
          if (setiProbesInSpace(s, player.seat) >= setiProbeLimit(player)) return failure('Probe limit reached');
          player.energy--;
          const launched = adapter.launchProbe(s, player, false);
          if (!launched) { player.energy++; return failure('The probe could not launch'); }
          addSetiProjectTurnBody(s, player, 'Earth');
          queueSetiProjectTrigger(s, player, { kind: 'launch' });
          awaiting.usedTech.push('energy-launch-or-move');
          replaceHead(s, scanStepDecision(s, player, resolution, awaiting, adapter));
          return success();
        }
        awaiting.phase = 'move-piece';
        replaceHead(s, projectDecision(resolution, 'Touch one of your probes', s.solar.pieces.filter((piece) => piece.owner === player.seat).map((piece) => piece.id)));
        return success();
      }
      if (awaiting.phase === 'move-piece') {
        if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose one of your probes');
        const piece = s.solar.pieces.find((candidate) => candidate.id === option && candidate.owner === player.seat);
        if (!piece) return failure('That probe is unavailable');
        awaiting.selectedPieceId = piece.id;
        awaiting.phase = 'move-target';
        replaceHead(s, projectDecision(resolution, 'Move the probe to an adjacent space', adjacentSetiCells(piece.cell)));
        return success();
      }
      if (awaiting.phase === 'move-target') {
        if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option) || !awaiting.selectedPieceId || player.energy < 1) return failure('Choose a highlighted movement space');
        player.energy--;
        const error = adapter.moveProbeFree(s, player, awaiting.selectedPieceId, option as SetiCellId);
        if (error) { player.energy++; return failure(error); }
        awaiting.usedTech.push('energy-launch-or-move');
        replaceHead(s, scanStepDecision(s, player, resolution, awaiting, adapter));
        return success();
      }
      if (decision.kind !== 'signal-sector' || choice.kind !== 'sector' || !decision.options.includes(choice.sectorId) || !awaiting.activeStep) return failure('Choose a highlighted Scan sector');
      if (awaiting.activeStep === 'project-row') {
        if (typeof choice.row !== 'number' || !decision.rowOptions?.includes(choice.row)) return failure('Choose one project-row card for its printed signal');
        const cardId = s.projectRow[choice.row];
        const card = cardId ? SETI_PROJECT_CATALOG_BY_ID[cardId] : null;
        if (!cardId || !card) return failure('Project-row card is unavailable');
        if (setiProjectSignalColor(choice.sectorId) !== card.signalColor) return failure(`That card marks only a ${card.signalColor} signal sector`);
        s.projectRow[choice.row] = null;
        s.projectDiscard.push(cardId);
        recordSignal(s, player, resolution, choice.sectorId, true, adapter);
        awaiting.completedBase.push('project-row');
      } else if (awaiting.activeStep === 'discard-extra-signal') {
        if (!awaiting.selectedCardId) return failure('Choose a hand card first');
        const discarded = adapter.discardHandCardForSignal(s, player, awaiting.selectedCardId, choice.sectorId);
        if (discarded.error) return failure(discarded.error);
        if (discarded.signalHandled) {
          resolution.context.signalsMarked.push({ sectorId: choice.sectorId, color: setiProjectSignalColor(choice.sectorId) });
          resolution.context.targetSectorId = choice.sectorId;
          if (s.sectors[choice.sectorId].completionPending) resolution.context.completedSector = true;
        } else recordSignal(s, player, resolution, choice.sectorId, true, adapter);
        awaiting.usedTech.push('discard-extra-signal');
      } else {
        recordSignal(s, player, resolution, choice.sectorId, true, adapter);
        if (awaiting.activeStep === 'earth') awaiting.completedBase.push('earth');
        else awaiting.usedTech.push('mercury-publicity-signal');
      }
      replaceHead(s, scanStepDecision(s, player, resolution, awaiting, adapter));
      return success();
    }
    case 'research': {
      if (decision.kind !== 'tech-stack' || choice.kind !== 'tech-stack' || !decision.options.includes(choice.stackId)) return failure('Choose a highlighted technology');
      const definition = SETI_TECH_BY_ID[choice.stackId];
      if (!definition) return failure('Unknown technology stack');
      const before = s.techStacks[choice.stackId].tiles.length;
      const error = adapter.acquireTechnology(s, player, choice.stackId, awaiting.operation);
      if (error) return failure(error);
      resolution.context.chosenTechnology = definition.type;
      resolution.context.technologyResearchedByAnother = before < SETI_TECH_STACKS.find((stack) => stack.id === choice.stackId)!.tiles.length;
      return finishHeadAndOperation(s, player, adapter);
    }
    case 'signal': {
      if (decision.kind !== 'signal-sector' || choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return failure('Choose a highlighted signal sector');
      recordSignal(s, player, resolution, choice.sectorId, awaiting.operation.gainData, adapter);
      awaiting.remaining--;
      if (awaiting.remaining <= 0) return finishHeadAndOperation(s, player, adapter);
      if (awaiting.lockedOptions === null) {
        if (awaiting.operation.target.kind === 'own-probe-sector') {
          awaiting.lockedOptions = [choice.sectorId];
        } else if (awaiting.operation.target.kind === 'own-probe-sector-and-neighbors') {
          const center = s.sectorOrder.indexOf(choice.sectorId);
          awaiting.lockedOptions = [s.sectorOrder[(center + 7) % 8], s.sectorOrder[(center + 1) % 8]];
        }
      } else if (awaiting.operation.target.kind === 'own-probe-sector-and-neighbors') {
        awaiting.lockedOptions = awaiting.lockedOptions.filter((sectorId) => sectorId !== choice.sectorId);
      }
      const options = awaiting.lockedOptions ?? setiProjectSignalOptions(s, player, awaiting.operation.target);
      replaceHead(s, signalDecision(resolution, options, decision.signalColor));
      return success();
    }
    case 'market-signals': {
      if (awaiting.selectedCardId === null) {
        if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option) || !option.startsWith('row:')) return failure('Choose a highlighted project-row card');
        const row = Number(option.slice(4));
        const cardId = s.projectRow[row];
        const card = cardId ? SETI_PROJECT_CATALOG_BY_ID[cardId] : null;
        if (!cardId || !card) return failure('Project-row card is unavailable');
        s.projectRow[row] = null;
        s.projectDiscard.push(cardId);
        awaiting.selectedCardId = cardId;
        awaiting.signalColor = card.signalColor;
        const options = SETI_SECTORS.filter((sector) => sector.printedSignalColor === card.signalColor).map((sector) => sector.id);
        replaceHead(s, signalDecision(resolution, options, card.signalColor));
        return success();
      }
      if (decision.kind !== 'signal-sector' || choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return failure('Choose a matching signal sector');
      recordSignal(s, player, resolution, choice.sectorId, true, adapter);
      awaiting.remaining--;
      awaiting.selectedCardId = null;
      awaiting.signalColor = null;
      if (awaiting.remaining <= 0 || !s.projectRow.some(Boolean)) {
        refillSetiProjectRow(s);
        return finishHeadAndOperation(s, player, adapter);
      }
      replaceHead(s, projectDecision(resolution, 'Choose another project-row card to discard for its signal', s.projectRow.flatMap((card, index) => card ? [`row:${index}`] : [])));
      return success();
    }
    case 'hand-signals': {
      if (awaiting.selectedCardId === null) {
        if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose a highlighted hand card or finish');
        if (option === 'done') {
          if (awaiting.used < awaiting.operation.minimum) return failure(`Discard at least ${awaiting.operation.minimum} card(s)`);
          return finishHeadAndOperation(s, player, adapter);
        }
        const color = adapter.signalCorner(player, option);
        if (!color) return failure('That card has no usable signal corner');
        awaiting.selectedCardId = option;
        awaiting.signalColor = color;
        const options = SETI_SECTORS.filter((sector) => sector.printedSignalColor === color).map((sector) => sector.id);
        replaceHead(s, signalDecision(resolution, options, color));
        return success();
      }
      if (decision.kind !== 'signal-sector' || choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return failure('Choose a matching signal sector');
      const discarded = adapter.discardHandCardForSignal(s, player, awaiting.selectedCardId, choice.sectorId);
      if (discarded.error) return failure(discarded.error);
      if (discarded.signalHandled) {
        resolution.context.signalsMarked.push({ sectorId: choice.sectorId, color: setiProjectSignalColor(choice.sectorId) });
        resolution.context.targetSectorId = choice.sectorId;
        if (s.sectors[choice.sectorId].completionPending) resolution.context.completedSector = true;
      } else recordSignal(s, player, resolution, choice.sectorId, true, adapter);
      awaiting.used++;
      awaiting.selectedCardId = null;
      awaiting.signalColor = null;
      const handCards = signalHandCards(player, adapter);
      if (awaiting.used >= awaiting.operation.maximum || !handCards.length) return finishHeadAndOperation(s, player, adapter);
      const canFinish = awaiting.used >= awaiting.operation.minimum;
      replaceHead(s, projectDecision(resolution, 'Discard another hand card for its signal, or finish', [...(canFinish ? ['done'] : []), ...handCards]));
      return success();
    }
    case 'deck-signals': {
      if (decision.kind !== 'signal-sector' || choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return failure('Choose a matching signal sector');
      recordSignal(s, player, resolution, choice.sectorId, true, adapter);
      awaiting.remaining--;
      if (awaiting.remaining <= 0) return finishHeadAndOperation(s, player, adapter);
      const next = drawSetiProjectCard(s);
      if (!next) return finishHeadAndOperation(s, player, adapter);
      s.projectDiscard.push(next);
      const card = SETI_PROJECT_CATALOG_BY_ID[next];
      if (!card) return finishHeadAndOperation(s, player, adapter);
      awaiting.selectedCardId = next;
      awaiting.signalColor = card.signalColor;
      const options = SETI_SECTORS.filter((sector) => sector.printedSignalColor === card.signalColor).map((sector) => sector.id);
      replaceHead(s, signalDecision(resolution, options, card.signalColor));
      return success();
    }
    case 'trace': {
      if (awaiting.color === null) {
        if (decision.kind !== 'card-effect-choice' || !option || !['purple', 'orange', 'blue'].includes(option)) return failure('Choose a life-trace color');
        const color = option as SetiTraceColor;
        resolution.context.chosenTraceColor = color;
        awaiting.color = color;
        s.pending.shift();
        if (!queueTraceSpace(s, player, resolution, awaiting, color)) {
          completeOperation(s, player, adapter);
        }
        return success();
      }
      if (decision.kind !== 'trace-space' || choice.kind !== 'trace-space' || !decision.options.includes(choice.spaceId)) return failure('Choose a highlighted trace space');
      const error = adapter.placeTrace(s, player, awaiting.color, choice.spaceId);
      if (error) return failure(error);
      resolution.context.chosenTraceColor = awaiting.color;
      return finishHeadAndOperation(s, player, adapter);
    }
    case 'remove-piece': {
      if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose a highlighted spacecraft');
      const target = s.placedSpacecraft.find((piece) => piece.id === option && piece.owner === player.seat && piece.kind === awaiting.operation.piece);
      if (!target || (target.body !== 'Pluto' && awaiting.operation.from === 'any-planet' && SETI_BODIES[target.body].moon)) return failure('That spacecraft is no longer available');
      const removed = removeSetiPlacedSpacecraft(s, target.id);
      if (!removed) return failure('That spacecraft is no longer available');
      const rewardStillCovered = s.placedSpacecraft.some((piece) => piece.spaceId === removed.spaceId);
      if (!rewardStillCovered && removed.coveredReward?.kind === 'first-landing-data' && removed.body !== 'Pluto') {
        const bonuses = s.planets[removed.body].firstLandingBonuses;
        if (!bonuses.includes(removed.coveredReward.amount)) bonuses.push(removed.coveredReward.amount);
        bonuses.sort((a, b) => a - b);
      }
      return finishHeadAndOperation(s, player, adapter);
    }
    case 'market-corners': {
      if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option) || !option.startsWith('row:')) return failure('Choose a highlighted project-row card');
      const row = Number(option.slice(4));
      const cardId = s.projectRow[row];
      const card = cardId ? SETI_PROJECT_CATALOG_BY_ID[cardId] : null;
      if (!cardId || !card) return failure('Project-row card is unavailable');
      s.projectRow[row] = null;
      s.projectDiscard.push(cardId);
      awaiting.remaining--;
      if (card.freeCorner === 'publicity') gainPublicity(player, 1);
      else if (card.freeCorner === 'data') gainData(player, 1);
      else {
        const remaining = awaiting.remaining;
        s.pending.shift();
        resolution.awaiting = null;
        if (beginMove(s, resolution, 1, 'operation', remaining)) return success();
        if (remaining > 0 && s.projectRow.some(Boolean)) {
          const resumed: Extract<SetiProjectAwaiting, { kind: 'market-corners' }> = { kind: 'market-corners', remaining, operation: awaiting.operation };
          resolution.awaiting = resumed;
          s.pending.unshift(projectDecision(resolution, 'Choose another row card for its free corner', s.projectRow.flatMap((candidate, index) => candidate ? [`row:${index}`] : [])) as SetiPendingDecision);
          return success();
        }
        refillSetiProjectRow(s);
        completeOperation(s, player, adapter);
        return success();
      }
      if (awaiting.remaining <= 0 || !s.projectRow.some(Boolean)) {
        refillSetiProjectRow(s);
        return finishHeadAndOperation(s, player, adapter);
      }
      replaceHead(s, projectDecision(resolution, 'Choose another row card for its free corner', s.projectRow.flatMap((candidate, index) => candidate ? [`row:${index}`] : [])));
      return success();
    }
    case 'tuck-income': {
      if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose a highlighted income option');
      if (option !== 'skip') {
        if (awaiting.operation.card === 'this-card') tuckThisCard(s, player, resolution, adapter);
        else {
          const card = SETI_PROJECT_CATALOG_BY_ID[option];
          const alien = SETI_ALIEN_CARDS_BY_ID[option];
          if (card) {
            if (!removeOne(player.hand, option)) return failure('That card is not in your hand');
            player.incomeCards.push({ cardId: option, kind: card.income, starting: false });
            gainPrintedIncome(s, player, card.income, adapter);
          } else if (alien && alien.species !== 'exertians' && alien.incomeCorner) {
            if (!removeOne(player.alienHand, option)) return failure('That card is not in your hand');
            player.alienIncomeCards.push({ cardId: option, kind: alien.incomeCorner });
            gainPrintedIncome(s, player, alien.incomeCorner, adapter);
          } else return failure('That card cannot become income');
        }
      }
      return finishHeadAndOperation(s, player, adapter);
    }
    case 'probe-signals': {
      if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose a highlighted probe');
      if (option === 'done') return finishHeadAndOperation(s, player, adapter);
      const sector = probeSector(s, option);
      if (!sector || awaiting.selectedProbeIds.includes(option)) return failure('That probe cannot be selected');
      awaiting.selectedProbeIds.push(option);
      resolution.context.selectedProbeId = option;
      recordSignal(s, player, resolution, sector, true, adapter);
      awaiting.remaining--;
      const probes = s.solar.pieces.filter((piece) => piece.kind === 'probe' && !awaiting.selectedProbeIds.includes(piece.id));
      if (awaiting.remaining <= 0 || !probes.length) return finishHeadAndOperation(s, player, adapter);
      replaceHead(s, projectDecision(resolution, 'Choose another distinct probe, or finish', ['done', ...probes.map((probe) => probe.id)]));
      return success();
    }
    case 'survey-probe': {
      if (decision.kind !== 'card-effect-choice' || !option || !decision.options.includes(option)) return failure('Choose a highlighted probe');
      const piece = s.solar.pieces.find((candidate) => candidate.id === option && candidate.owner === player.seat);
      if (!piece) return failure('That probe is unavailable');
      resolution.context.selectedProbeId = piece.id;
      const features = getSetiSolarFeatures(s);
      let data = features.some((feature) => feature.kind === 'asteroid' && feature.cell === piece.cell) ? awaiting.operation.dataIfOnAsteroid : 0;
      const adjacent = adjacentSetiCells(piece.cell);
      data += new Set(features.filter((feature) => feature.kind === 'asteroid' && adjacent.includes(feature.cell)).map((feature) => feature.cell)).size * awaiting.operation.dataPerAdjacentAsteroid;
      gainData(player, data);
      return finishHeadAndOperation(s, player, adapter);
    }
  }
}

export function queueSetiProjectTrigger(
  s: SetiState,
  player: SetiPlayer,
  event: SetiProjectTriggerEvent,
  beforeExisting = false,
  excludeCardId?: string,
): void {
  const slots = getSetiTriggerableProjectSlots(s, player, event, excludeCardId);
  if (!slots.length) return;
  // One emitted effect can cover at most one eligible mission slot globally.
  // Distinct effects call this function separately and therefore receive their
  // own optional claim (living FAQ Q29).
  const decision: SetiPendingDecision = {
    kind: 'manual-trigger-choice',
    owner: player.seat,
    triggerId: `project-slot:${setiProjectRuntime(s).revision}:${event.kind}:${s.pending.length}`,
    options: [...slots.map((entry) => `claim|${entry.cardId}|${entry.slot.id}`), 'skip'],
  };
  if (beforeExisting) s.pending.unshift(decision);
  else s.pending.push(decision);
}

export function touchSetiProjectRevision(s: SetiState): void {
  setiProjectRuntime(s).revision++;
}

export function queueSetiConditionalMissionOffers(s: SetiState, player: SetiPlayer): void {
  const runtime = setiProjectRuntime(s);
  if (runtime.resolution || runtime.resolutionStack.length) return;
  if (s.phase !== 'playing' || s.activeSeat !== player.seat || player.passed) return;
  for (const cardId of player.missions) {
    const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
    const effect = card?.effects.find((candidate): candidate is Extract<SetiProjectEffect, { timing: 'conditional-mission' }> => candidate.timing === 'conditional-mission');
    if (!effect || runtime.conditionalOfferRevision[cardId] === runtime.revision) continue;
    if (!evaluateSetiProjectPredicate(s, player, effect.condition)) continue;
    runtime.conditionalOfferRevision[cardId] = runtime.revision;
    if (!s.pending.some((decision) => decision.kind === 'manual-trigger-choice' && decision.triggerId === `project-condition:${cardId}`)) {
      s.pending.push({ kind: 'manual-trigger-choice', owner: player.seat, triggerId: `project-condition:${cardId}`, options: [`complete|${cardId}`, 'skip'] });
    }
  }
}

export function resolveSetiProjectManualTrigger(
  s: SetiState,
  player: SetiPlayer,
  decision: Extract<SetiPendingDecision, { kind: 'manual-trigger-choice' }>,
  option: string,
  adapter: SetiProjectExecutorAdapter,
): SetiProjectExecutionResult | null {
  if (!decision.triggerId.startsWith('project-')) return null;
  if (!decision.options.includes(option)) return failure('Choose a highlighted project trigger');
  if (option === 'skip') {
    s.pending.shift();
    if (!resumeSetiProjectResolution(s, player, adapter)) adapter.afterResolution(s, player);
    return success();
  }
  if (decision.triggerId.startsWith('project-slot:')) {
    const [, cardId, slotId] = option.split('|');
    const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
    const effect = card?.effects.find((candidate): candidate is Extract<SetiProjectEffect, { timing: 'triggerable-mission' }> => candidate.timing === 'triggerable-mission');
    const slot = effect?.slots.find((candidate) => candidate.id === slotId);
    if (!card || !slot || !player.missions.includes(cardId)) return failure('That mission slot is unavailable');
    const projectPlayer = player as SetiPlayer & { missionClaims: Record<string, string[]> };
    projectPlayer.missionClaims[cardId] ??= [];
    if (projectPlayer.missionClaims[cardId].includes(slotId)) return failure('That mission slot is already claimed');
    s.pending.shift();
    projectPlayer.missionClaims[cardId].push(slotId);
    if (setiProjectMissionIsComplete(player, cardId)) {
      removeOne(player.missions, cardId);
      player.completedMissions.push(cardId);
    }
    for (const pending of s.pending) {
      if (pending.kind !== 'manual-trigger-choice' || !pending.triggerId.startsWith('project-slot:')) continue;
      pending.options = pending.options.filter((candidate) => {
        if (candidate === 'skip') return true;
        const [, pendingCardId, pendingSlotId] = candidate.split('|');
        if (!player.missions.includes(pendingCardId)) return false;
        return !(projectPlayer.missionClaims[pendingCardId] ?? []).includes(pendingSlotId);
      });
    }
    beginSetiProjectResolution(s, player, cardId, 'mission-slot', slot.operations, adapter);
    return success();
  }
  if (decision.triggerId.startsWith('project-condition:')) {
    const [, cardId] = option.split('|');
    const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
    const effect = card?.effects.find((candidate): candidate is Extract<SetiProjectEffect, { timing: 'conditional-mission' }> => candidate.timing === 'conditional-mission');
    if (!card || !effect || !player.missions.includes(cardId) || !evaluateSetiProjectPredicate(s, player, effect.condition)) return failure('That conditional mission is not complete');
    s.pending.shift();
    removeOne(player.missions, cardId);
    player.completedMissions.push(cardId);
    beginSetiProjectResolution(s, player, cardId, 'conditional-mission', effect.operations, adapter, effect.condition);
    return success();
  }
  return failure('Unknown project trigger');
}

export function setiProjectOnPlayOperations(cardId: string): SetiProjectOp[] {
  return SETI_PROJECT_CATALOG_BY_ID[cardId]?.effects.flatMap((effect) => effect.timing === 'on-play' || effect.timing === 'permanent' ? [...effect.operations] : []) ?? [];
}

export function scoreSetiProjectEndGame(
  s: SetiState,
  player: SetiPlayer,
  scoreUnmarkedGoldTile: (s: SetiState, player: SetiPlayer) => number,
): number {
  let score = 0;
  const scoreOps = (ops: readonly SetiProjectOp[], context = emptySetiProjectContext()): void => {
    for (const op of ops) {
      switch (op.kind) {
        case 'gain': if (op.resource === 'vp') score += op.amount; break;
        case 'gain-per': if (op.resource === 'vp') score += op.amount * countSetiProjectMetric(s, player, op.metric, context); break;
        case 'resolve-rightmost-unmarked-gold-tile-space': score += scoreUnmarkedGoldTile(s, player); break;
        case 'if': if (evaluateSetiProjectPredicate(s, player, op.condition, context)) scoreOps(op.then, context); break;
        default: break;
      }
    }
  };
  for (const cardId of player.scoringCards) {
    const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
    if (!card) continue;
    for (const effect of card.effects) {
      if (effect.timing !== 'end-game' || (effect.condition && !evaluateSetiProjectPredicate(s, player, effect.condition))) continue;
      scoreOps(effect.operations);
    }
  }
  return score;
}

export function projectCardDestination(cardType: SetiProjectCardType | null): 'discard' | 'mission' | 'scoring' | 'permanent' {
  if (cardType === 'triggerable-mission' || cardType === 'conditional-mission') return 'mission';
  if (cardType === 'end-game') return 'scoring';
  if (cardType === 'permanent') return 'permanent';
  return 'discard';
}
