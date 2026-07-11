// Runtime facts and pure evaluators for the complete SETI project catalog.
//
// The reducer in actions.ts owns mutations and visual decisions.  This module
// keeps the declarative catalog honest: every predicate, count metric, trigger,
// and operation kind has one typed runtime representation and an exhaustive
// support table.  Stored resolution state is deliberately serializable so a
// card can pause for a board gesture and resume in printed order.

import {
  SETI_BODIES,
  SETI_SECTORS,
  SETI_TECH_BY_ID,
  adjacentSetiCells,
  parseSetiCell,
  type SetiBody,
  type SetiCellId,
  type SetiPrimaryBody,
  type SetiSectorId,
  type SetiSignalColor,
  type SetiTraceColor,
} from './data.js';
import {
  SETI_PROJECT_CATALOG_BY_ID,
  type SetiCountMetric,
  type SetiMissionSlot,
  type SetiProjectCardType,
  type SetiProjectFreeCorner,
  type SetiProjectOp,
  type SetiProjectPredicate,
  type SetiProjectTechnology,
  type SetiProjectTrigger,
  type SetiSignalTarget,
} from './projectCatalog.js';
import {
  earthSetiCell,
  getSetiBodyCells,
  getSetiSolarFeatures,
  type SetiPlayer,
  type SetiState,
} from './state.js';

export type SetiProjectBody = SetiBody | 'Pluto';
export type SetiProjectTemporaryRule =
  | 'replace-visit-publicity-with-move'
  | 'ignore-asteroid-exit-surcharge';

export interface SetiProjectTurnFacts {
  seat: number;
  visitedBodies: SetiProjectBody[];
  visitedFeatures: ('asteroid' | 'comet')[];
  movedSameRing: boolean;
  completedSectors: SetiSectorId[];
  temporaryRules: { rule: SetiProjectTemporaryRule; sourceCardId: string }[];
}

export interface SetiProjectEffectContext {
  signalsMarked: { sectorId: SetiSectorId; color: SetiSignalColor }[];
  completedSector: boolean;
  landedBodies: SetiProjectBody[];
  selectedProbeId: string | null;
  targetSectorId: SetiSectorId | null;
  chosenTechnology: SetiProjectTechnology | null;
  technologyResearchedByAnother: boolean;
  chosenTraceColor: SetiTraceColor | null;
  conditionSpeciesSlot: 0 | 1 | null;
  lastDrawnCardId: string | null;
}

type ProjectOp<K extends SetiProjectOp['kind']> = Extract<SetiProjectOp, { kind: K }>;

export type SetiProjectAwaiting =
  | { kind: 'draw-project'; remaining: number; operation: ProjectOp<'draw-project'> }
  | { kind: 'move'; remaining: number; pieceId: string | null; completion: 'operation' | 'drawn-corner'; resumeMarketCorners?: number }
  | { kind: 'land'; operation: ProjectOp<'land'> }
  | { kind: 'scan'; phase: 'earth' | 'project-row'; operation: ProjectOp<'scan'> }
  | { kind: 'research'; operation: ProjectOp<'research'> }
  | { kind: 'signal'; remaining: number; operation: ProjectOp<'mark-signal'> }
  | { kind: 'market-signals'; remaining: number; operation: ProjectOp<'discard-market-for-signals'>; selectedCardId: string | null; signalColor: SetiSignalColor | null }
  | { kind: 'hand-signals'; used: number; operation: ProjectOp<'discard-hand-for-signals'>; selectedCardId: string | null; signalColor: SetiSignalColor | null }
  | { kind: 'deck-signals'; remaining: number; operation: ProjectOp<'discard-deck-top-for-signal'>; selectedCardId: string | null; signalColor: SetiSignalColor | null }
  | { kind: 'trace'; operation: ProjectOp<'mark-trace'>; color: SetiTraceColor | null }
  | { kind: 'remove-piece'; operation: ProjectOp<'remove-piece'> }
  | { kind: 'market-corners'; remaining: number; operation: ProjectOp<'discard-market-for-free-corners'> }
  | { kind: 'tuck-income'; operation: ProjectOp<'tuck-income'> }
  | { kind: 'probe-signals'; remaining: number; selectedProbeIds: string[]; operation: ProjectOp<'mark-signals-at-selected-probes'> }
  | { kind: 'survey-probe'; operation: ProjectOp<'survey-selected-probe'> };

export interface SetiProjectResolution {
  id: number;
  owner: number;
  cardId: string;
  source: 'on-play' | 'mission-slot' | 'conditional-mission' | 'permanent-reward' | 'temporary-rule';
  operations: SetiProjectOp[];
  index: number;
  context: SetiProjectEffectContext;
  awaiting: SetiProjectAwaiting | null;
}

export interface SetiPlutoState {
  installedBy: number | null;
  cardId: string | null;
  orbiters: number[];
  landers: number[];
}

export interface SetiProjectRuntimeState {
  nextResolutionId: number;
  resolution: SetiProjectResolution | null;
  resolvingCard: {
    owner: number;
    cardId: string;
    destination: 'discard' | 'mission' | 'scoring' | 'permanent';
    playEvent: SetiProjectTriggerEvent;
    relocated: boolean;
  } | null;
  revision: number;
  conditionalOfferRevision: Record<string, number>;
  turn: SetiProjectTurnFacts;
  pluto: SetiPlutoState;
}

export interface SetiProjectTriggerEvent {
  kind:
    | 'visit-body'
    | 'visit-feature'
    | 'complete-sector'
    | 'mark-signal'
    | 'research'
    | 'mark-trace'
    | 'scan'
    | 'launch'
    | 'orbit'
    | 'land'
    | 'discard-free-corner'
    | 'play-project';
  body?: SetiProjectBody;
  feature?: 'asteroid' | 'comet';
  signalColor?: SetiSignalColor;
  technology?: SetiProjectTechnology;
  traceColor?: SetiTraceColor;
  freeCorner?: SetiProjectFreeCorner;
  printedCost?: number;
  sourceCardId?: number;
}

export interface SetiTriggerableProjectSlot {
  cardId: string;
  slot: SetiMissionSlot;
}

export const SETI_PROJECT_OP_SUPPORT: Readonly<Record<SetiProjectOp['kind'], true>> = {
  gain: true,
  'gain-per': true,
  'draw-project': true,
  launch: true,
  move: true,
  land: true,
  scan: true,
  research: true,
  'mark-signal': true,
  'discard-market-for-signals': true,
  'discard-hand-for-signals': true,
  'discard-deck-top-for-signal': true,
  'mark-trace': true,
  'remove-piece': true,
  'resolve-drawn-project-free-corner': true,
  'discard-market-for-free-corners': true,
  'tuck-income': true,
  'resolve-rightmost-unmarked-gold-tile-space': true,
  'return-this-card-to-hand': true,
  'mark-signals-at-selected-probes': true,
  'survey-selected-probe': true,
  'temporary-rule': true,
  if: true,
  'install-pluto': true,
};

export const SETI_PROJECT_PREDICATE_SUPPORT: Readonly<Record<SetiProjectPredicate['kind'], true>> = {
  'piece-at-body': true,
  'piece-at-each-body': true,
  'piece-count': true,
  'planetary-system-pair': true,
  'probe-on-feature': true,
  'probe-distance-from-earth': true,
  'sector-wins': true,
  'current-signals-in-distinct-sectors': true,
  'trace-count': true,
  'trace-colors-on-one-species': true,
  'technology-count': true,
  publicity: true,
  score: true,
  'hand-size': true,
  'visited-this-turn': true,
  'moved-same-ring-this-turn': true,
  'completed-sector-this-turn': true,
  'landed-with-this-effect': true,
  'marked-signal-with-this-effect': true,
  'tech-taken-with-this-effect-was-researched-by-another': true,
  'exact-own-signals-in-target-sector': true,
  'probe-in-ring': true,
};

export const SETI_PROJECT_METRIC_SUPPORT: Readonly<Record<SetiCountMetric['kind'], true>> = {
  'pieces-at-body': true,
  'sector-wins': true,
  'sectors-with-current-signal': true,
  'signals-marked-by-this-effect': true,
  'adjacent-features-to-selected-probe': true,
  'tucked-income-cards': true,
  'hand-cards': true,
  traces: true,
  technologies: true,
  publicity: true,
  'unique-planets-visited-this-turn': true,
  'planets-and-comets-in-earth-sector': true,
};

export const SETI_PROJECT_TRIGGER_SUPPORT: Readonly<Record<SetiProjectTrigger['kind'], true>> = {
  'visit-body': true,
  'visit-any-planet': true,
  'visit-feature': true,
  'complete-sector': true,
  'mark-signal': true,
  research: true,
  'mark-trace': true,
  scan: true,
  launch: true,
  orbit: true,
  land: true,
  'orbit-or-land': true,
  'discard-hand-card-for-free-corner': true,
  'play-project-as-main-action': true,
  'orbit-or-land-at-mars-or-play-mars-flavor': true,
};

export function emptySetiProjectContext(): SetiProjectEffectContext {
  return {
    signalsMarked: [],
    completedSector: false,
    landedBodies: [],
    selectedProbeId: null,
    targetSectorId: null,
    chosenTechnology: null,
    technologyResearchedByAnother: false,
    chosenTraceColor: null,
    conditionSpeciesSlot: null,
    lastDrawnCardId: null,
  };
}

export function emptySetiProjectTurnFacts(seat: number): SetiProjectTurnFacts {
  return {
    seat,
    visitedBodies: [],
    visitedFeatures: [],
    movedSameRing: false,
    completedSectors: [],
    temporaryRules: [],
  };
}

function runtime(s: SetiState): SetiProjectRuntimeState {
  return (s as SetiState & { projectRuntime: SetiProjectRuntimeState }).projectRuntime;
}

function planetBodiesFor(body: SetiBody, includeMoons: boolean): SetiBody[] {
  if (!includeMoons || SETI_BODIES[body].moon) return [body];
  return [body, ...(Object.keys(SETI_BODIES) as SetiBody[]).filter((candidate) => SETI_BODIES[candidate].moon && SETI_BODIES[candidate].parent === body)];
}

function bodyPieceCount(
  s: SetiState,
  player: SetiPlayer,
  body: SetiBody,
  includeMoons: boolean,
  piece: 'orbiter' | 'lander' | 'orbiter-or-lander',
): number {
  let total = 0;
  for (const candidate of planetBodiesFor(body, includeMoons)) {
    const state = s.planets[candidate];
    if (piece !== 'lander') total += state.orbiters.filter((owner) => owner === player.seat).length;
    if (piece !== 'orbiter') total += state.landers.filter((owner) => owner === player.seat).length;
  }
  return total;
}

function allPieceCount(s: SetiState, player: SetiPlayer, piece: 'orbiter' | 'lander' | 'orbiter-or-lander', includeMoons: boolean): number {
  let total = 0;
  for (const body of Object.keys(SETI_BODIES) as SetiBody[]) {
    if (!includeMoons && SETI_BODIES[body].moon) continue;
    if (piece !== 'lander') total += s.planets[body].orbiters.filter((owner) => owner === player.seat).length;
    if (piece !== 'orbiter') total += s.planets[body].landers.filter((owner) => owner === player.seat).length;
  }
  const pluto = runtime(s).pluto;
  if (piece !== 'lander') total += pluto.orbiters.filter((owner) => owner === player.seat).length;
  if (piece !== 'orbiter') total += pluto.landers.filter((owner) => owner === player.seat).length;
  return total;
}

function playerSignalsInSector(s: SetiState, player: SetiPlayer, sectorId: SetiSectorId): number {
  return s.sectors[sectorId].signals.filter((marker) => marker.owner === player.seat).length;
}

function sectorColor(sectorId: SetiSectorId): SetiSignalColor {
  return SETI_SECTORS.find((sector) => sector.id === sectorId)!.printedSignalColor;
}

function ownedSectorWins(s: SetiState, player: SetiPlayer, color?: SetiSignalColor): number {
  return SETI_SECTORS
    .filter((sector) => color === undefined || sector.printedSignalColor === color)
    .reduce((sum, sector) => sum + s.sectors[sector.id].wins.filter((marker) => marker.owner === player.seat).length, 0);
}

function graphDistance(from: SetiCellId, to: SetiCellId): number {
  if (from === to) return 0;
  const queue: { cell: SetiCellId; distance: number }[] = [{ cell: from, distance: 0 }];
  const seen = new Set<SetiCellId>([from]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacentSetiCells(current.cell)) {
      if (seen.has(next)) continue;
      if (next === to) return current.distance + 1;
      seen.add(next);
      queue.push({ cell: next, distance: current.distance + 1 });
    }
  }
  return Number.POSITIVE_INFINITY;
}

function ownProbeOnFeature(s: SetiState, player: SetiPlayer, feature: 'asteroid' | 'comet', adjacentToEarth: boolean): boolean {
  const earth = earthSetiCell(s);
  const cells = getSetiSolarFeatures(s)
    .filter((candidate) => candidate.kind === feature && (!adjacentToEarth || adjacentSetiCells(earth).includes(candidate.cell)))
    .map((candidate) => candidate.cell);
  return s.solar.pieces.some((piece) => piece.owner === player.seat && piece.kind === 'probe' && cells.includes(piece.cell));
}

export function setiProjectConditionSpeciesSlot(
  player: SetiPlayer,
  predicate: SetiProjectPredicate,
): 0 | 1 | null {
  if (predicate.kind !== 'trace-colors-on-one-species') return null;
  for (const slot of [0, 1] as const) {
    if (predicate.colors.every((color) => player.traceMarkers.some((trace) => trace.speciesSlot === slot && trace.color === color))) return slot;
  }
  return null;
}

export function evaluateSetiProjectPredicate(
  s: SetiState,
  player: SetiPlayer,
  predicate: SetiProjectPredicate,
  context: SetiProjectEffectContext | null = null,
  turn: SetiProjectTurnFacts = runtime(s).turn,
): boolean {
  switch (predicate.kind) {
    case 'piece-at-body':
      return bodyPieceCount(s, player, predicate.body, predicate.includeMoons, predicate.piece) > 0;
    case 'piece-at-each-body':
      return predicate.bodies.every((body) => bodyPieceCount(s, player, body, predicate.includeMoons, predicate.piece) > 0);
    case 'piece-count':
      return allPieceCount(s, player, predicate.piece, predicate.includeMoons) >= predicate.atLeast;
    case 'planetary-system-pair':
      return (['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Oumuamua'] as SetiBody[]).some((body) => {
        const hasOrbiter = s.planets[body].orbiters.includes(player.seat);
        const hasLander = planetBodiesFor(body, true).some((candidate) => s.planets[candidate].landers.includes(player.seat));
        return hasOrbiter && hasLander;
      }) || (runtime(s).pluto.orbiters.includes(player.seat) && runtime(s).pluto.landers.includes(player.seat));
    case 'probe-on-feature':
      return ownProbeOnFeature(s, player, predicate.feature, predicate.adjacentTo === 'Earth');
    case 'probe-distance-from-earth': {
      const earth = earthSetiCell(s);
      return s.solar.pieces.some((piece) => piece.owner === player.seat && piece.kind === 'probe' && graphDistance(earth, piece.cell) >= predicate.spacesAtLeast);
    }
    case 'sector-wins':
      if (predicate.sameSector) return SETI_SECTORS.some((sector) => s.sectors[sector.id].wins.filter((marker) => marker.owner === player.seat).length >= predicate.atLeast);
      return ownedSectorWins(s, player, predicate.color) >= predicate.atLeast;
    case 'current-signals-in-distinct-sectors':
      return SETI_SECTORS.filter((sector) => playerSignalsInSector(s, player, sector.id) > 0).length >= predicate.atLeast;
    case 'trace-count': {
      const perSpecies = ([0, 1] as const).map((slot) => player.traceMarkers.filter((trace) => trace.speciesSlot === slot && trace.color === predicate.color).length);
      return predicate.species === 'each'
        ? perSpecies.every((count) => count >= predicate.atLeast)
        : perSpecies.reduce((sum, count) => sum + count, 0) >= predicate.atLeast;
    }
    case 'trace-colors-on-one-species':
      return setiProjectConditionSpeciesSlot(player, predicate) !== null;
    case 'technology-count':
      return player.techs.filter((tech) => SETI_TECH_BY_ID[tech.stackId]?.type === predicate.technology).length >= predicate.atLeast;
    case 'publicity': return player.publicity >= predicate.atLeast;
    case 'score': return player.score >= predicate.atLeast;
    case 'hand-size': return player.hand.length === predicate.equals;
    case 'visited-this-turn':
      return predicate.target.kind === 'body'
        ? turn.visitedBodies.includes(predicate.target.body)
        : turn.visitedFeatures.includes(predicate.target.feature);
    case 'moved-same-ring-this-turn': return turn.movedSameRing;
    case 'completed-sector-this-turn': return !!context?.completedSector || turn.completedSectors.length > 0;
    case 'landed-with-this-effect':
      return !!context?.landedBodies.some((body) => {
        if (body === 'Pluto') return false;
        if (predicate.bodies.includes(body)) return true;
        return predicate.includeMoons && SETI_BODIES[body].moon && predicate.bodies.includes(SETI_BODIES[body].parent!);
      });
    case 'marked-signal-with-this-effect':
      return (context?.signalsMarked.filter((marker) => !predicate.color || marker.color === predicate.color).length ?? 0) >= predicate.atLeast;
    case 'tech-taken-with-this-effect-was-researched-by-another': return !!context?.technologyResearchedByAnother;
    case 'exact-own-signals-in-target-sector':
      return !!context?.targetSectorId && playerSignalsInSector(s, player, context.targetSectorId) === predicate.count;
    case 'probe-in-ring':
      return s.solar.pieces.some((piece) => piece.owner === player.seat && piece.kind === 'probe' && parseSetiCell(piece.cell).ring === 2);
  }
}

export function countSetiProjectMetric(
  s: SetiState,
  player: SetiPlayer,
  metric: SetiCountMetric,
  context: SetiProjectEffectContext | null = null,
  turn: SetiProjectTurnFacts = runtime(s).turn,
): number {
  switch (metric.kind) {
    case 'pieces-at-body': return bodyPieceCount(s, player, metric.body, metric.includeMoons, metric.piece);
    case 'sector-wins': return ownedSectorWins(s, player, metric.color);
    case 'sectors-with-current-signal': return SETI_SECTORS.filter((sector) => playerSignalsInSector(s, player, sector.id) > 0).length;
    case 'signals-marked-by-this-effect': {
      const signals = context?.signalsMarked.filter((signal) => !metric.color || signal.color === metric.color) ?? [];
      return metric.distinctSectors ? new Set(signals.map((signal) => signal.sectorId)).size : signals.length;
    }
    case 'adjacent-features-to-selected-probe': {
      const piece = s.solar.pieces.find((candidate) => candidate.id === context?.selectedProbeId);
      if (!piece) return 0;
      const adjacent = adjacentSetiCells(piece.cell);
      return new Set(getSetiSolarFeatures(s).filter((feature) => feature.kind === metric.feature && adjacent.includes(feature.cell)).map((feature) => feature.cell)).size;
    }
    case 'tucked-income-cards': return player.incomeCards.filter((income) => income.kind === metric.income).length;
    case 'hand-cards':
      return player.hand.filter((cardId) => {
        const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
        return !!card && (!metric.income || card.income === metric.income) && (!metric.freeCorner || card.freeCorner === metric.freeCorner);
      }).length;
    case 'traces': {
      const color = metric.color === 'chosen-by-previous-op' ? context?.chosenTraceColor : metric.color;
      return color ? player.traceMarkers.filter((trace) => trace.color === color).length : 0;
    }
    case 'technologies': {
      const technology = metric.technology === 'chosen-by-previous-op' ? context?.chosenTechnology : metric.technology;
      return technology ? player.techs.filter((tech) => SETI_TECH_BY_ID[tech.stackId]?.type === technology).length : 0;
    }
    case 'publicity': return player.publicity;
    case 'unique-planets-visited-this-turn': return new Set(turn.visitedBodies).size;
    case 'planets-and-comets-in-earth-sector': {
      const earthSector = parseSetiCell(earthSetiCell(s)).sector;
      const count = getSetiSolarFeatures(s).filter((feature) => parseSetiCell(feature.cell).sector === earthSector && (feature.kind === 'planet' || feature.kind === 'comet')).length;
      return Math.min(metric.maximum, count);
    }
  }
}

function isMarsBody(body: SetiProjectBody | undefined): boolean {
  return body === 'Mars' || (body !== undefined && body !== 'Pluto' && SETI_BODIES[body].moon && SETI_BODIES[body].parent === 'Mars');
}

export function setiProjectTriggerMatches(trigger: SetiProjectTrigger, event: SetiProjectTriggerEvent): boolean {
  switch (trigger.kind) {
    case 'visit-body': return event.kind === 'visit-body' && event.body === trigger.body;
    case 'visit-any-planet': return event.kind === 'visit-body' && event.body !== undefined && event.body !== 'Earth';
    case 'visit-feature': return event.kind === 'visit-feature' && event.feature === trigger.feature;
    case 'complete-sector': return event.kind === 'complete-sector';
    case 'mark-signal': return event.kind === 'mark-signal' && event.signalColor === trigger.color;
    case 'research': return event.kind === 'research' && event.technology === trigger.technology;
    case 'mark-trace': return event.kind === 'mark-trace' && event.traceColor === trigger.color;
    case 'scan': return event.kind === 'scan';
    case 'launch': return event.kind === 'launch';
    case 'orbit':
    case 'land':
    case 'orbit-or-land': {
      if (!(event.kind === 'orbit' || event.kind === 'land')) return false;
      if (trigger.kind !== 'orbit-or-land' && event.kind !== trigger.kind) return false;
      if (!trigger.body) return true;
      if (event.body === trigger.body) return true;
      return !!trigger.includeMoons && event.body !== undefined && event.body !== 'Pluto' && SETI_BODIES[event.body].moon && SETI_BODIES[event.body].parent === trigger.body;
    }
    case 'discard-hand-card-for-free-corner':
      return event.kind === 'discard-free-corner' && event.freeCorner === trigger.freeCorner;
    case 'play-project-as-main-action':
      return event.kind === 'play-project' && event.printedCost === trigger.printedCost;
    case 'orbit-or-land-at-mars-or-play-mars-flavor':
      return ((event.kind === 'orbit' || event.kind === 'land') && isMarsBody(event.body))
        || (event.kind === 'play-project' && event.sourceCardId !== undefined && trigger.qualifyingBaseProjectCardIds.includes(event.sourceCardId));
  }
}

export function getSetiTriggerableProjectSlots(
  s: SetiState,
  player: SetiPlayer,
  event: SetiProjectTriggerEvent,
  excludeCardId?: string,
): SetiTriggerableProjectSlot[] {
  const missionClaims = (player as SetiPlayer & { missionClaims: Record<string, string[]> }).missionClaims ?? {};
  const result: SetiTriggerableProjectSlot[] = [];
  for (const cardId of player.missions) {
    if (cardId === excludeCardId) continue;
    const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
    if (!card) continue;
    const claimed = new Set(missionClaims[cardId] ?? []);
    for (const effect of card.effects) {
      if (effect.timing !== 'triggerable-mission') continue;
      for (const slot of effect.slots) {
        if (!claimed.has(slot.id) && setiProjectTriggerMatches(slot.trigger, event)) result.push({ cardId, slot });
      }
    }
  }
  return result;
}

export function setiProjectCardType(cardId: string): SetiProjectCardType | null {
  return SETI_PROJECT_CATALOG_BY_ID[cardId]?.cardType ?? null;
}

export function setiProjectSignalColor(sectorId: SetiSectorId): SetiSignalColor {
  return sectorColor(sectorId);
}

export function setiProjectSignalOptions(s: SetiState, player: SetiPlayer, target: SetiSignalTarget): SetiSectorId[] {
  const fromCell = (cell: SetiCellId): SetiSectorId => s.sectorOrder[parseSetiCell(cell).sector];
  switch (target.kind) {
    case 'body-sector': {
      const body = (target.body === 'Earth' || !SETI_BODIES[target.body].moon ? target.body : SETI_BODIES[target.body].parent!) as SetiPrimaryBody;
      const cell = getSetiBodyCells(s)[body];
      return cell ? [fromCell(cell)] : [];
    }
    case 'earth-sector': return [fromCell(earthSetiCell(s))];
    case 'named-sector': {
      const id = `seti_sector_${target.sector.replaceAll('-', '_')}` as SetiSectorId;
      return s.sectors[id] ? [id] : [];
    }
    case 'color': return SETI_SECTORS.filter((sector) => sector.printedSignalColor === target.color).map((sector) => sector.id);
    case 'any-sector': return SETI_SECTORS.map((sector) => sector.id);
    case 'own-probe-sector':
      return [...new Set(s.solar.pieces.filter((piece) => piece.owner === player.seat && piece.kind === 'probe').map((piece) => fromCell(piece.cell)))];
    case 'own-probe-sector-and-neighbors': {
      const indices = s.solar.pieces
        .filter((piece) => piece.owner === player.seat && piece.kind === 'probe')
        .flatMap((piece) => {
          const index = parseSetiCell(piece.cell).sector;
          return [index, (index + 7) % 8, (index + 1) % 8];
        });
      return [...new Set(indices.map((index) => s.sectorOrder[index]))];
    }
    case 'selected-probe-sectors':
      return [...new Set(s.solar.pieces.filter((piece) => piece.kind === 'probe').map((piece) => fromCell(piece.cell)))];
    case 'discarded-card-signal': return [];
  }
}

export function setiProjectMissionIsComplete(player: SetiPlayer, cardId: string): boolean {
  const card = SETI_PROJECT_CATALOG_BY_ID[cardId];
  const claims = (player as SetiPlayer & { missionClaims: Record<string, string[]> }).missionClaims?.[cardId] ?? [];
  const slots = card?.effects.flatMap((effect) => effect.timing === 'triggerable-mission' ? effect.slots : []) ?? [];
  return slots.length > 0 && slots.every((slot) => claims.includes(slot.id));
}

export function setiProjectHasTemporaryRule(s: SetiState, player: SetiPlayer, rule: SetiProjectTemporaryRule): boolean {
  const turn = runtime(s).turn;
  return turn.seat === player.seat && turn.temporaryRules.some((entry) => entry.rule === rule);
}

export function addSetiProjectTurnBody(s: SetiState, player: SetiPlayer, body: SetiProjectBody): void {
  const turn = runtime(s).turn;
  if (turn.seat !== player.seat) return;
  if (!turn.visitedBodies.includes(body)) turn.visitedBodies.push(body);
}

export function addSetiProjectTurnFeature(s: SetiState, player: SetiPlayer, feature: 'asteroid' | 'comet'): void {
  const turn = runtime(s).turn;
  if (turn.seat !== player.seat) return;
  if (!turn.visitedFeatures.includes(feature)) turn.visitedFeatures.push(feature);
}

export function setiProjectRuntime(s: SetiState): SetiProjectRuntimeState {
  return runtime(s);
}
