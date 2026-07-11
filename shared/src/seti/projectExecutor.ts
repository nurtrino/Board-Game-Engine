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
  type SetiProjectTriggerEvent,
} from './projectRuntime.js';
import {
  bodyAtSetiCell,
  drawSetiProjectCard,
  earthSetiSectorId,
  getSetiSolarFeatures,
  refillSetiProjectRow,
  setiPlayerHasAbility,
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
  landProbeFree(s: SetiState, player: SetiPlayer, pieceId: string, body: SetiBody, operation: ProjectLandOp): string | null;
  markSignal(s: SetiState, player: SetiPlayer, sectorId: SetiSectorId, gainData: boolean): void;
  placeTrace(s: SetiState, player: SetiPlayer, color: SetiTraceColor, spaceId: string): string | null;
  acquireTechnology(s: SetiState, player: SetiPlayer, stackId: SetiTechStackId, operation: ProjectResearchOp): string | null;
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

function gainPrintedIncome(s: SetiState, player: SetiPlayer, kind: SetiIncomeKind, adapter: SetiProjectExecutorAdapter): void {
  if (kind === 'credit') player.credits++;
  else if (kind === 'energy') player.energy++;
  else adapter.drawIntoHand(s, player, 1);
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

function cardEffectOptions(s: SetiState): string[] {
  return ['deck', ...s.projectRow.flatMap((card, index) => card ? [`row:${index}`] : [])];
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
    if (!primary || primary === 'Earth' || primary === 'Oumuamua') continue;
    options.push(`${piece.id}|${primary}`);
    for (const body of Object.keys(SETI_BODIES) as SetiBody[]) {
      const definition = SETI_BODIES[body];
      if (!definition.moon || definition.parent !== primary) continue;
      if (!op.ignoreMoonTechnology && !setiPlayerHasAbility(player, 'moon-landing')) continue;
      if (!op.allowOccupiedSpaceAndGainCoveredReward && s.planets[body].landers.length > 0) continue;
      options.push(`${piece.id}|${body}`);
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
  setiProjectRuntime(s).resolution = null;
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
  const context = emptySetiProjectContext();
  if (condition) context.conditionSpeciesSlot = setiProjectConditionSpeciesSlot(player, condition);
  runtime.resolution = {
    id: runtime.nextResolutionId++, owner: player.seat, cardId, source,
    operations: [...operations], index: 0, context, awaiting: null,
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
        if (!s.projectRow.some(Boolean)) { resolution.index++; break; }
        const earth = earthSetiSectorId(s);
        const options = setiPlayerHasAbility(player, 'earth-signal-adjacent')
          ? [earth, s.sectorOrder[(s.sectorOrder.indexOf(earth) + 7) % 8], s.sectorOrder[(s.sectorOrder.indexOf(earth) + 1) % 8]]
          : [earth];
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'scan' }> = { kind: 'scan', phase: 'earth', operation: op };
        queueSetiProjectTrigger(s, player, { kind: 'scan' }, true);
        pause(s, resolution, awaiting, signalDecision(resolution, [...new Set(options)], null, 'earth'));
        return;
      }
      case 'research': {
        const options = researchOptions(s, player, op);
        if (!options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'research' }> = { kind: 'research', operation: op };
        resolution.awaiting = awaiting;
        s.pending.unshift({ kind: 'tech-stack', owner: player.seat, options, free: true, resolutionId: resolution.id } as ProjectPendingDecision as SetiPendingDecision);
        return;
      }
      case 'mark-signal': {
        const options = setiProjectSignalOptions(s, player, op.target);
        if (!options.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'signal' }> = { kind: 'signal', remaining: op.amount, operation: op };
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
        if (!player.hand.length || op.maximum <= 0) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'hand-signals' }> = { kind: 'hand-signals', used: 0, operation: op, selectedCardId: null, signalColor: null };
        const options = [...(op.minimum === 0 ? ['done'] : []), ...player.hand];
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
        const options = (Object.keys(SETI_BODIES) as SetiBody[]).filter((body) => {
          if (op.from === 'any-planet' && SETI_BODIES[body].moon) return false;
          const pieces = op.piece === 'orbiter' ? s.planets[body].orbiters : s.planets[body].landers;
          return pieces.includes(player.seat);
        });
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
        if (!player.hand.length) { resolution.index++; break; }
        const awaiting: Extract<SetiProjectAwaiting, { kind: 'tuck-income' }> = { kind: 'tuck-income', operation: op };
        pause(s, resolution, awaiting, projectDecision(resolution, 'Choose a card to tuck as income, or skip', ['skip', ...player.hand]));
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
        pause(s, resolution, awaiting, projectDecision(resolution, 'Choose a probe whose sector receives a signal', probes.map((probe) => probe.id)));
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
      const separator = option.lastIndexOf('|');
      const pieceId = option.slice(0, separator);
      const body = option.slice(separator + 1) as SetiBody;
      const error = adapter.landProbeFree(s, player, pieceId, body, awaiting.operation);
      if (error) return failure(error);
      resolution.context.landedBodies.push(body);
      return finishHeadAndOperation(s, player, adapter);
    }
    case 'scan': {
      if (decision.kind !== 'signal-sector' || choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return failure('Choose a highlighted scan sector');
      if (awaiting.phase === 'earth') {
        recordSignal(s, player, resolution, choice.sectorId, true, adapter);
        awaiting.phase = 'project-row';
        const rows = s.projectRow.map((card, index) => card ? index : -1).filter((index) => index >= 0);
        const colors = new Set(rows.map((row) => SETI_PROJECT_CATALOG_BY_ID[s.projectRow[row]!]!.signalColor));
        const options = SETI_SECTORS.filter((sector) => colors.has(sector.printedSignalColor)).map((sector) => sector.id);
        replaceHead(s, signalDecision(resolution, options, null, 'project-row', rows));
        return success();
      }
      if (typeof choice.row !== 'number' || !decision.rowOptions?.includes(choice.row)) return failure('Choose one project-row card for its printed signal');
      const cardId = s.projectRow[choice.row];
      const card = cardId ? SETI_PROJECT_CATALOG_BY_ID[cardId] : null;
      if (!cardId || !card) return failure('Project-row card is unavailable');
      if (setiProjectSignalColor(choice.sectorId) !== card.signalColor) return failure(`That card marks only a ${card.signalColor} signal sector`);
      s.projectRow[choice.row] = null;
      s.projectDiscard.push(cardId);
      recordSignal(s, player, resolution, choice.sectorId, true, adapter);
      refillSetiProjectRow(s);
      return finishHeadAndOperation(s, player, adapter);
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
      replaceHead(s, signalDecision(resolution, setiProjectSignalOptions(s, player, awaiting.operation.target), decision.signalColor));
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
        const card = SETI_PROJECT_CATALOG_BY_ID[option];
        if (!card || !removeOne(player.hand, option)) return failure('That card is not in your hand');
        s.projectDiscard.push(option);
        awaiting.selectedCardId = option;
        awaiting.signalColor = card.signalColor;
        const options = SETI_SECTORS.filter((sector) => sector.printedSignalColor === card.signalColor).map((sector) => sector.id);
        replaceHead(s, signalDecision(resolution, options, card.signalColor));
        return success();
      }
      if (decision.kind !== 'signal-sector' || choice.kind !== 'sector' || !decision.options.includes(choice.sectorId)) return failure('Choose a matching signal sector');
      recordSignal(s, player, resolution, choice.sectorId, true, adapter);
      awaiting.used++;
      awaiting.selectedCardId = null;
      awaiting.signalColor = null;
      if (awaiting.used >= awaiting.operation.maximum || !player.hand.length) return finishHeadAndOperation(s, player, adapter);
      const canFinish = awaiting.used >= awaiting.operation.minimum;
      replaceHead(s, projectDecision(resolution, 'Discard another hand card for its signal, or finish', [...(canFinish ? ['done'] : []), ...player.hand]));
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
      const body = option as SetiBody;
      const pieces = awaiting.operation.piece === 'orbiter' ? s.planets[body].orbiters : s.planets[body].landers;
      const index = pieces.indexOf(player.seat);
      if (index < 0) return failure('That spacecraft is no longer available');
      pieces.splice(index, 1);
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
      queueSetiProjectTrigger(s, player, { kind: 'discard-free-corner', freeCorner: card.freeCorner });
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
          if (!card || !removeOne(player.hand, option)) return failure('That card is not in your hand');
          player.incomeCards.push({ cardId: option, kind: card.income, starting: false });
          gainPrintedIncome(s, player, card.income, adapter);
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
  if (runtime.resolution) return;
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
  s.pending.shift();
  if (option === 'skip') {
    adapter.afterResolution(s, player);
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
    projectPlayer.missionClaims[cardId].push(slotId);
    for (const pending of s.pending) {
      if (pending.kind !== 'manual-trigger-choice' || !pending.triggerId.startsWith('project-slot:')) continue;
      pending.options = pending.options.filter((candidate) => {
        if (candidate === 'skip') return true;
        const [, pendingCardId, pendingSlotId] = candidate.split('|');
        return !(pendingCardId === cardId && projectPlayer.missionClaims[cardId].includes(pendingSlotId));
      });
    }
    if (setiProjectMissionIsComplete(player, cardId)) {
      removeOne(player.missions, cardId);
      player.completedMissions.push(cardId);
    }
    beginSetiProjectResolution(s, player, cardId, 'mission-slot', slot.operations, adapter);
    return success();
  }
  if (decision.triggerId.startsWith('project-condition:')) {
    const [, cardId] = option.split('|');
    const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
    const effect = card?.effects.find((candidate): candidate is Extract<SetiProjectEffect, { timing: 'conditional-mission' }> => candidate.timing === 'conditional-mission');
    if (!card || !effect || !player.missions.includes(cardId) || !evaluateSetiProjectPredicate(s, player, effect.condition)) return failure('That conditional mission is not complete');
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
