// SETI state, seeded setup, public/private projections, and target discovery.
// Reducer code lives in actions.ts; this file intentionally contains no UI
// assumptions beyond stable piece/space ids.

import {
  SETI_BODIES,
  SETI_CELL_IDS,
  SETI_GOLD_TILES,
  SETI_RULES,
  SETI_SEATS,
  SETI_SECTORS,
  SETI_SECTOR_IDS,
  SETI_SOLAR_ALPHA_MASKS,
  SETI_SOLAR_LAYER_FEATURES,
  SETI_SPECIES,
  SETI_TECH_BY_ID,
  SETI_TECH_STACKS,
  adjacentSetiCells,
  parseSetiCell,
  setiCellId,
  type SetiBody,
  type SetiCellId,
  type SetiGoldSide,
  type SetiGoldTileId,
  type SetiIncomeKind,
  type SetiPrimaryBody,
  type SetiSeatColor,
  type SetiSectorId,
  type SetiSignalColor,
  type SetiSpeciesId,
  type SetiTechAbility,
  type SetiTechStackId,
  type SetiTraceColor,
} from './data.js';
import {
  SETI_BASE_PROJECT_CATALOG,
  SETI_PROJECT_CATALOG_BY_ID,
  SETI_PROMO_PROJECT_CATALOG,
} from './projectCatalog.js';
import type { SetiProjectBody, SetiProjectRuntimeState, SetiPlutoState } from './projectRuntime.js';
import {
  SETI_ALIEN_CARDS as SETI_TYPED_ALIEN_CARDS,
  SETI_ALIEN_CARDS_BY_ID,
  SETI_ALIEN_SPECIES_BY_ID,
  type SetiAlienIncome,
} from './alienCatalog.js';

export type SetiPhase = 'income-selection' | 'playing' | 'ended';
export type SetiMode = 'multiplayer' | 'solo';

export interface SetiCreateOptions {
  mode?: SetiMode;
  soloDifficulty?: 1 | 2 | 3 | 4 | 5;
  promoCards?: boolean;
}

export interface SetiIncomeCard {
  cardId: string;
  kind: SetiIncomeKind;
  starting: boolean;
}

export interface SetiAlienIncomeCard {
  cardId: string;
  kind: SetiAlienIncome;
}

export interface SetiOwnedTech {
  stackId: SetiTechStackId;
  tileId: string;
}

export interface SetiComputerState {
  top: boolean[];
  tech: Partial<Record<SetiTechStackId, { upper: boolean; lower: boolean }>>;
}

export interface SetiTraceMarker {
  color: SetiTraceColor;
  speciesSlot: 0 | 1;
  spaceId: string;
  overflow: boolean;
}

export interface SetiGoldClaim {
  threshold: number;
  tileId: SetiGoldTileId;
}

export interface SetiPlayer {
  seat: number;
  color: SetiSeatColor;
  name: string;
  score: number;
  finalScore: number | null;
  publicity: number;
  credits: number;
  energy: number;
  dataPool: number;
  hand: string[];
  alienHand: string[];
  hiddenExertian: string[];
  alienIncomeCards: SetiAlienIncomeCard[];
  alienMissions: string[];
  completedAlienMissions: string[];
  alienScoringCards: string[];
  alienMissionProgress: Record<string, string[]>;
  suppressProbePublicityThisTurn: boolean;
  incomeCards: SetiIncomeCard[];
  techs: SetiOwnedTech[];
  computer: SetiComputerState;
  traceMarkers: SetiTraceMarker[];
  missions: string[];
  missionClaims: Record<string, string[]>;
  completedMissions: string[];
  scoringCards: string[];
  permanentCards: string[];
  goldClaims: SetiGoldClaim[];
  passed: boolean;
}

export interface SetiSolarPiece {
  id: string;
  owner: number;
  kind: 'probe' | 'capsule';
  cell: SetiCellId;
  supportLayer: 0 | 1 | 2 | 3;
  sampleId?: string;
}

export interface SetiSolarState {
  orientations: { base: number; disc1: number; disc2: number; disc3: number };
  rotationPointer: 1 | 2 | 3;
  pieces: SetiSolarPiece[];
  nextPieceId: number;
}

export interface SetiPlanetState {
  body: SetiBody;
  orbiters: number[];
  landers: number[];
  firstLandingBonuses: number[];
}

export interface SetiSignalMarker {
  owner: number;
  sequence: number;
  excess: boolean;
}

export interface SetiSectorWinMarker {
  owner: number;
  sequence: number;
}

export interface SetiSectorState {
  id: SetiSectorId;
  capacity: number;
  dataRemaining: number;
  signals: SetiSignalMarker[];
  wins: SetiSectorWinMarker[];
  completionPending: boolean;
}

export interface SetiTechStackState {
  id: SetiTechStackId;
  tiles: string[];
  firstTakeBonusAvailable: boolean;
}

export interface SetiDiscoveryMarker {
  owner: number | null;
  sequence: number;
}

export interface SetiResearchMarker {
  owner: number;
  sequence: number;
  spaceId: string;
  color: SetiTraceColor;
  overflow: boolean;
}

export interface SetiMascamiteModule {
  kind: 'mascamites';
  samplesAtJupiter: string[];
  samplesAtSaturn: string[];
  revealedBlueSample: string;
  capsulesDelivered: string[];
}

export interface SetiAnomaliesModule {
  kind: 'anomalies';
  anomalies: { id: string; sector: number; side: 0 | 1 }[];
  triggerCount: number;
}

export interface SetiOumuamuaModule {
  kind: 'oumuamua';
  cell: SetiCellId;
  dataRemaining: number;
  signals: SetiSignalMarker[];
  exofossils: Record<number, number>;
}

export interface SetiCentaurianModule {
  kind: 'centaurians';
  messageMilestones: Record<number, number[]>;
  messageQueue: Record<number, string[]>;
  claimedRewards: string[];
}

export interface SetiExertianModule {
  kind: 'exertians';
  milestones: [number, number];
  dangerBySeat: Record<number, number>;
  resolvedMilestones: Record<number, [boolean, boolean]>;
}

export type SetiSpeciesModule =
  | SetiMascamiteModule
  | SetiAnomaliesModule
  | SetiOumuamuaModule
  | SetiCentaurianModule
  | SetiExertianModule;

export interface SetiSpeciesSlotState {
  slot: 0 | 1;
  speciesId: SetiSpeciesId;
  revealed: boolean;
  discovery: Record<SetiTraceColor, SetiDiscoveryMarker | null>;
  research: SetiResearchMarker[];
  alienDeck: string[];
  alienFaceUp: string | null;
  alienDiscard: string[];
  module: SetiSpeciesModule | null;
}

export interface SetiGoldTileState {
  id: SetiGoldTileId;
  side: SetiGoldSide;
}

export interface SetiSoloState {
  difficulty: 1 | 2 | 3 | 4 | 5;
  rivalScore: number;
  progress: number;
  objectiveDeck: string[];
  activeObjectives: string[];
  completedObjectives: string[];
  actionDeck: string[];
  actionDiscard: string[];
  techTokens: number;
}

export type SetiPendingDecision =
  | { kind: 'initial-income-card'; owner: number; options: string[] }
  | { kind: 'discard-to-four'; owner: number; count: number; reason: 'pass' }
  | { kind: 'end-round-card'; owner: number; round: number; options: string[] }
  | { kind: 'signal-sector'; owner: number; source: 'earth' | 'project-row' | 'effect'; options: SetiSectorId[]; signalColor: SetiSignalColor | null; rowOptions?: number[]; resolutionId?: number }
  | { kind: 'completed-sector-order'; owner: number; options: SetiSectorId[] }
  | { kind: 'trace-space'; owner: number; color: SetiTraceColor; options: string[]; resolutionId?: number }
  | { kind: 'gold-tile'; owner: number; threshold: number; options: SetiGoldTileId[] }
  | { kind: 'tech-stack'; owner: number; options: SetiTechStackId[]; free: boolean; resolutionId?: number }
  | { kind: 'mars-first-data'; owner: number; options: number[] }
  | { kind: 'tuck-income-card'; owner: number; options: string[]; optional?: true }
  | { kind: 'card-effect-choice'; owner: number; cardId: string; label: string; min: number; max: number; options: string[]; resolutionId?: number }
  | { kind: 'alien-card-source'; owner: number; speciesSlot: 0 | 1; options: string[] }
  | { kind: 'centaurian-reward'; owner: number; options: string[] }
  | { kind: 'exertian-card'; owner: number; options: string[] }
  | { kind: 'manual-trigger-choice'; owner: number; triggerId: string; options: string[] };

export interface SetiEvent {
  seq: number;
  seat: number | null;
  color: SetiSeatColor | null;
  player: string;
  title: string;
  detail: string;
  pieceId?: string;
  from?: SetiCellId;
  to?: SetiCellId;
  body?: SetiProjectBody;
  sectorId?: SetiSectorId;
}

export interface SetiTurnResolution {
  kind: 'end-turn' | 'pass';
  seat: number;
  milestonesQueued: boolean;
}

export interface SetiState {
  game: 'seti';
  schemaVersion: 1;
  seed: number;
  rngCounter: number;
  options: { mode: SetiMode; soloDifficulty: 1 | 2 | 3 | 4 | 5; promoCards: boolean };
  phase: SetiPhase;
  round: number;
  activeSeat: number;
  startingSeat: number;
  mainActionTaken: boolean;
  passedSeats: number[];
  firstPassSeat: number | null;
  passResolutionSeat: number | null;
  turnResolution: SetiTurnResolution | null;
  players: SetiPlayer[];
  solar: SetiSolarState;
  planets: Record<SetiBody, SetiPlanetState>;
  sectorBoardOrder: string[];
  sectorOrder: SetiSectorId[];
  sectors: Record<SetiSectorId, SetiSectorState>;
  markerSequence: number;
  deferredCompletedSectors: SetiSectorId[];
  projectDeck: string[];
  projectDiscard: string[];
  projectRow: (string | null)[];
  roundEndStacks: string[][];
  techStacks: Record<SetiTechStackId, SetiTechStackState>;
  goldTiles: SetiGoldTileState[];
  species: [SetiSpeciesSlotState, SetiSpeciesSlotState];
  pendingSpeciesDiscoveries: (0 | 1)[];
  neutralMilestonesResolved: Record<number, boolean>;
  pending: SetiPendingDecision[];
  projectRuntime: SetiProjectRuntimeState;
  solo: SetiSoloState | null;
  eventCounter: number;
  lastEvent: SetiEvent | null;
  log: string[];
  winners: SetiSeatColor[] | null;
}

// ---------------------------------------------------------------------------
// Deterministic random stream
// ---------------------------------------------------------------------------

function setiRandomUnit(seed: number): number {
  let a = seed >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function setiRoll(s: SetiState, lo: number, hi: number): number {
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) throw new Error('Invalid SETI roll range');
  s.rngCounter++;
  const mixed = (s.seed ^ Math.imul(s.rngCounter, 0x9e3779b9)) >>> 0;
  return lo + Math.floor(setiRandomUnit(mixed) * (hi - lo + 1));
}

export function setiShuffle<T>(s: SetiState, values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = setiRoll(s, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function drawSetiProjectCard(s: SetiState): string | null {
  if (s.projectDeck.length === 0 && s.projectDiscard.length > 0) {
    s.projectDeck = setiShuffle(s, s.projectDiscard);
    s.projectDiscard = [];
  }
  return s.projectDeck.shift() ?? null;
}

export function refillSetiProjectRow(s: SetiState): void {
  for (let i = 0; i < SETI_RULES.projectRow; i++) {
    if (s.projectRow[i] == null) s.projectRow[i] = drawSetiProjectCard(s);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function emptyPlanet(body: SetiBody): SetiPlanetState {
  const def = SETI_BODIES[body];
  const bonuses = body === 'Mars' ? [1, 2] : def.firstLandingData > 0 ? [def.firstLandingData] : [];
  return { body, orbiters: [], landers: [], firstLandingBonuses: bonuses };
}

function neutralMarkerCount(playerCount: number): number {
  if (playerCount <= 2) return 2;
  if (playerCount === 3) return 1;
  return 0;
}

function makeSoloState(s: SetiState, difficulty: 1 | 2 | 3 | 4 | 5): SetiSoloState {
  const objectiveDeck = difficulty === 1
    ? []
    : setiShuffle(s, Array.from({ length: 24 }, (_, i) => `seti_solo_objective_${String(i + 1).padStart(2, '0')}`));
  const actionDeck = setiShuffle(s, Array.from({ length: 19 }, (_, i) => `seti_solo_action_${String(i + 1).padStart(2, '0')}`));
  return {
    difficulty,
    rivalScore: 0,
    progress: 0,
    objectiveDeck,
    activeObjectives: objectiveDeck.splice(0, difficulty === 1 ? 0 : Math.min(3, objectiveDeck.length)),
    completedObjectives: [],
    actionDeck,
    actionDiscard: [],
    techTokens: 0,
  };
}

export function createSeti(
  seated: { name: string; color: SetiSeatColor }[],
  seed: number,
  options: SetiCreateOptions = {},
): SetiState {
  if (seated.length < 1 || seated.length > 4) throw new Error('SETI is 1-4 players');
  if (new Set(seated.map((seat) => seat.color)).size !== seated.length) throw new Error('SETI seat colors must be unique');
  if (seated.some((seat) => !SETI_SEATS.includes(seat.color))) throw new Error('Invalid SETI seat color');
  const mode: SetiMode = options.mode ?? (seated.length === 1 ? 'solo' : 'multiplayer');
  if (mode === 'solo' && seated.length !== 1) throw new Error('SETI solo mode requires one human seat');
  if (mode === 'multiplayer' && seated.length === 1) throw new Error('One SETI seat uses solo mode');
  const difficulty = options.soloDifficulty ?? 3;
  if (difficulty < 1 || difficulty > 5) throw new Error('SETI solo difficulty is 1-5');

  const players: SetiPlayer[] = seated.map((seat, index) => ({
    seat: index,
    color: seat.color,
    name: seat.name,
    score: index + 1,
    finalScore: null,
    publicity: SETI_RULES.startPublicity,
    credits: SETI_RULES.startCredits,
    energy: SETI_RULES.startEnergy,
    dataPool: 0,
    hand: [],
    alienHand: [],
    hiddenExertian: [],
    alienIncomeCards: [],
    alienMissions: [],
    completedAlienMissions: [],
    alienScoringCards: [],
    alienMissionProgress: {},
    suppressProbePublicityThisTurn: false,
    incomeCards: [],
    techs: [],
    computer: { top: Array(SETI_RULES.computerTopSpaces).fill(false), tech: {} },
    traceMarkers: [],
    missions: [],
    missionClaims: {},
    completedMissions: [],
    scoringCards: [],
    permanentCards: [],
    goldClaims: [],
    passed: false,
  }));

  const planets = Object.fromEntries((Object.keys(SETI_BODIES) as SetiBody[]).map((body) => [body, emptyPlanet(body)])) as Record<SetiBody, SetiPlanetState>;
  const sectors = Object.fromEntries(SETI_SECTORS.map((def) => [def.id, {
    id: def.id,
    capacity: def.capacity,
    dataRemaining: def.capacity,
    signals: [],
    wins: [],
    completionPending: false,
  }])) as unknown as Record<SetiSectorId, SetiSectorState>;

  const s: SetiState = {
    game: 'seti',
    schemaVersion: 1,
    seed: seed >>> 0,
    rngCounter: 0,
    options: { mode, soloDifficulty: difficulty, promoCards: !!options.promoCards },
    phase: 'income-selection',
    round: 1,
    activeSeat: 0,
    startingSeat: 0,
    mainActionTaken: false,
    passedSeats: [],
    firstPassSeat: null,
    passResolutionSeat: null,
    turnResolution: null,
    players,
    solar: {
      orientations: { base: 0, disc1: 0, disc2: 0, disc3: 0 },
      rotationPointer: 1,
      pieces: [],
      nextPieceId: 1,
    },
    planets,
    sectorBoardOrder: [],
    sectorOrder: [...SETI_SECTOR_IDS],
    sectors,
    markerSequence: 0,
    deferredCompletedSectors: [],
    projectDeck: [],
    projectDiscard: [],
    projectRow: Array(SETI_RULES.projectRow).fill(null),
    roundEndStacks: [[], [], [], []],
    techStacks: {} as Record<SetiTechStackId, SetiTechStackState>,
    goldTiles: [],
    species: [] as unknown as [SetiSpeciesSlotState, SetiSpeciesSlotState],
    pendingSpeciesDiscoveries: [],
    neutralMilestonesResolved: { 20: false, 30: false },
    pending: [],
    projectRuntime: {
      nextResolutionId: 1,
      resolution: null,
      resolvingCard: null,
      revision: 0,
      conditionalOfferRevision: {},
      turn: {
        seat: 0,
        visitedBodies: [],
        visitedFeatures: [],
        movedSameRing: false,
        completedSectors: [],
        temporaryRules: [],
      },
      pluto: { installedBy: null, cardId: null, orbiters: [], landers: [] },
    },
    solo: null,
    eventCounter: 0,
    lastEvent: null,
    log: [],
    winners: null,
  };

  s.startingSeat = setiRoll(s, 0, players.length - 1);
  s.activeSeat = s.startingSeat;
  s.projectRuntime.turn.seat = s.startingSeat;
  s.solar.orientations = {
    base: 0,
    disc1: setiRoll(s, 0, 7),
    disc2: setiRoll(s, 0, 7),
    disc3: setiRoll(s, 0, 7),
  };

  const sourceBoards = [...new Set(SETI_SECTORS.map((sector) => sector.sourceBoardGuid))];
  s.sectorBoardOrder = setiShuffle(s, sourceBoards);
  s.sectorOrder = s.sectorBoardOrder.flatMap((guid) => SETI_SECTORS.filter((sector) => sector.sourceBoardGuid === guid).map((sector) => sector.id));

  const selectedSpecies = setiShuffle(s, SETI_SPECIES).slice(0, 2);
  s.species = selectedSpecies.map((speciesId, slot) => ({
    slot: slot as 0 | 1,
    speciesId,
    revealed: false,
    discovery: { purple: null, orange: null, blue: null },
    research: [],
    alienDeck: setiShuffle(s, SETI_TYPED_ALIEN_CARDS.filter((card) => card.species === speciesId).map((card) => card.id)),
    alienFaceUp: null,
    alienDiscard: [],
    module: null,
  })) as unknown as [SetiSpeciesSlotState, SetiSpeciesSlotState];

  for (const stack of SETI_TECH_STACKS) {
    s.techStacks[stack.id] = {
      id: stack.id,
      tiles: setiShuffle(s, stack.tiles.map((tile) => tile.id)),
      firstTakeBonusAvailable: true,
    };
  }

  for (const id of ['seti_gold_tech', 'seti_gold_mission', 'seti_gold_income', 'seti_gold_other'] as SetiGoldTileId[]) {
    s.goldTiles.push({ id, side: setiRoll(s, 0, 1) === 0 ? 'A' : 'B' });
  }

  const projectIds = [
    ...SETI_BASE_PROJECT_CATALOG.map((card) => card.id),
    ...(s.options.promoCards ? SETI_PROMO_PROJECT_CATALOG.map((card) => card.id) : []),
  ];
  s.projectDeck = setiShuffle(s, projectIds);

  for (const player of players) {
    for (let i = 0; i < SETI_RULES.startHand; i++) {
      const card = drawSetiProjectCard(s);
      if (!card) throw new Error('SETI project deck exhausted during setup');
      player.hand.push(card);
    }
  }
  refillSetiProjectRow(s);
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < players.length + 1; i++) {
      const card = drawSetiProjectCard(s);
      if (!card) throw new Error('SETI project deck exhausted building round stacks');
      s.roundEndStacks[round].push(card);
    }
  }

  for (let offset = 0; offset < players.length; offset++) {
    const owner = (s.startingSeat + offset) % players.length;
    s.pending.push({ kind: 'initial-income-card', owner, options: [...players[owner].hand] });
  }

  if (mode === 'solo') s.solo = makeSoloState(s, difficulty);
  s.log.push(`SETI setup complete. ${players[s.startingSeat].name} is starting player.`);
  // Retain this fact in state for invariant tests and neutral resolution policy.
  void neutralMarkerCount(players.length);
  return s;
}

// ---------------------------------------------------------------------------
// Solar geometry adapter
// ---------------------------------------------------------------------------

export interface SetiResolvedSolarFeature {
  layer: 0 | 1 | 2 | 3;
  cell: SetiCellId;
  kind: 'planet' | 'asteroid' | 'publicity' | 'comet';
  body?: SetiPrimaryBody;
}

function orientationForLayer(s: SetiState, layer: 0 | 1 | 2 | 3): number {
  if (layer === 0) return s.solar.orientations.base;
  if (layer === 1) return s.solar.orientations.disc1;
  if (layer === 2) return s.solar.orientations.disc2;
  return s.solar.orientations.disc3;
}

export function getSetiSolarFeatures(s: SetiState): SetiResolvedSolarFeature[] {
  const features: SetiResolvedSolarFeature[] = SETI_SOLAR_LAYER_FEATURES.map((feature) => ({
    layer: feature.layer,
    cell: setiCellId(feature.ring, feature.sector + orientationForLayer(s, feature.layer)),
    kind: feature.kind,
    ...(feature.body ? { body: feature.body } : {}),
  }));
  for (const slot of s.species) {
    if (slot.revealed && slot.module?.kind === 'oumuamua') {
      features.push({ layer: 3, cell: slot.module.cell, kind: 'planet', body: 'Oumuamua' });
    }
  }
  return features;
}

function layerPriority(layer: 0 | 1 | 2 | 3): number {
  return layer === 0 ? 4 : layer;
}

export function bodyAtSetiCell(s: SetiState, cell: SetiCellId): SetiPrimaryBody | null {
  const support = setiSupportLayerForCell(s, cell);
  const body = getSetiSolarFeatures(s)
    .find((feature) => feature.cell === cell && feature.layer === support && feature.kind === 'planet' && feature.body);
  return body?.body ?? null;
}

export function getSetiBodyCells(s: SetiState): Partial<Record<SetiPrimaryBody, SetiCellId>> {
  const result: Partial<Record<SetiPrimaryBody, SetiCellId>> = {};
  for (const body of ['Earth', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Oumuamua'] as SetiPrimaryBody[]) {
    const cell = SETI_CELL_IDS.find((candidate) => bodyAtSetiCell(s, candidate) === body);
    if (cell) result[body] = cell;
  }
  return result;
}

export function earthSetiCell(s: SetiState): SetiCellId {
  const earth = getSetiBodyCells(s).Earth;
  if (!earth) throw new Error('SETI solar adapter has no Earth cell');
  return earth;
}

export function isSetiAsteroidCell(s: SetiState, cell: SetiCellId): boolean {
  return getSetiSolarFeatures(s).some((feature) => feature.cell === cell && feature.kind === 'asteroid');
}

export function isSetiPublicityCell(s: SetiState, cell: SetiCellId): boolean {
  return getSetiSolarFeatures(s).some((feature) => feature.cell === cell && feature.kind === 'publicity');
}

export function setiSupportLayerForCell(s: SetiState, cell: SetiCellId): 0 | 1 | 2 | 3 {
  const { ring, sector } = parseSetiCell(cell);
  for (const layer of [1, 2, 3] as const) {
    const orientation = orientationForLayer(s, layer);
    const baselineSector = ((sector - orientation) % 8 + 8) % 8;
    if (SETI_SOLAR_ALPHA_MASKS[layer][ring][baselineSector] === '1') return layer;
  }
  return 0;
}

export function earthSetiSectorId(s: SetiState): SetiSectorId {
  const sector = parseSetiCell(earthSetiCell(s)).sector;
  return s.sectorOrder[sector] ?? s.sectorOrder[0];
}

// ---------------------------------------------------------------------------
// Common calculated facts
// ---------------------------------------------------------------------------

export function setiPlayerHasAbility(player: SetiPlayer, ability: SetiTechAbility): boolean {
  return player.techs.some((tech) => SETI_TECH_BY_ID[tech.stackId]?.ability === ability);
}

export function setiProbeLimit(player: SetiPlayer): number {
  return setiPlayerHasAbility(player, 'probe-limit-and-launch') ? SETI_RULES.upgradedProbeLimit : SETI_RULES.probeLimit;
}

export function setiProbesInSpace(s: SetiState, seat: number): number {
  return s.solar.pieces.filter((piece) => piece.owner === seat && piece.kind === 'probe').length;
}

export function setiIncomeCounts(player: SetiPlayer): Record<SetiIncomeKind, number> {
  const result: Record<SetiIncomeKind, number> = { credit: 0, energy: 0, card: 0 };
  for (const income of player.incomeCards) result[income.kind]++;
  return result;
}

export function setiPlayerOrbiters(s: SetiState, seat: number): number {
  return (Object.values(s.planets) as SetiPlanetState[]).reduce((sum, planet) => sum + planet.orbiters.filter((owner) => owner === seat).length, 0)
    + s.projectRuntime.pluto.orbiters.filter((owner) => owner === seat).length;
}

export function setiPlayerLanders(s: SetiState, seat: number): number {
  return (Object.values(s.planets) as SetiPlanetState[]).reduce((sum, planet) => sum + planet.landers.filter((owner) => owner === seat).length, 0)
    + s.projectRuntime.pluto.landers.filter((owner) => owner === seat).length;
}

export function setiTraceCounts(player: SetiPlayer): Record<SetiTraceColor, number> {
  return {
    purple: player.traceMarkers.filter((trace) => trace.color === 'purple').length,
    orange: player.traceMarkers.filter((trace) => trace.color === 'orange').length,
    blue: player.traceMarkers.filter((trace) => trace.color === 'blue').length,
  };
}

export function setiTraceTargets(s: SetiState, color: SetiTraceColor, seat?: number): string[] {
  const targets: string[] = [];
  for (const slot of s.species) {
    if (!slot.revealed) {
      if (!slot.discovery[color]) targets.push(`seti_species_${slot.slot}_discovery_${color}`);
      // Hidden boards do not expose research overflow before discovery.
      continue;
    }
    const species = SETI_ALIEN_SPECIES_BY_ID[slot.speciesId];
    for (const space of species.researchSpaces.filter((candidate) => candidate.trace === color)) {
      const target = `seti_species_${slot.slot}_research_${space.id}`;
      const occupied = slot.research.some((marker) => marker.spaceId === target);
      if (space.dynamic === 'mascamite-sample-token') {
        const number = Number(space.id.slice(space.id.lastIndexOf('_') + 1));
        const available = slot.module?.kind === 'mascamites' ? 1 + slot.module.capsulesDelivered.length : 0;
        if (number > available) continue;
      }
      if (seat !== undefined && space.payment?.resource === 'data-pool' && (s.players[seat]?.dataPool ?? 0) < space.payment.amount) continue;
      if (seat !== undefined && space.payment?.resource === 'exofossil') {
        const held = slot.module?.kind === 'oumuamua' ? slot.module.exofossils[seat] ?? 0 : 0;
        if (held < space.payment.amount) continue;
      }
      if (space.repeatable || !occupied) targets.push(target);
    }
    targets.push(`seti_species_${slot.slot}_overflow_${color}`);
  }
  return targets;
}

export function setiComputerSlotIds(player: SetiPlayer): number[] {
  const open: number[] = [];
  const leftmost = player.computer.top.findIndex((filled) => !filled);
  if (leftmost >= 0) open.push(leftmost);
  const computerTechs = player.techs.filter((tech) => SETI_TECH_BY_ID[tech.stackId]?.type === 'computer');
  for (let index = 0; index < computerTechs.length; index++) {
    const tech = computerTechs[index];
    const state = player.computer.tech[tech.stackId] ?? { upper: false, lower: false };
    const upperId = SETI_RULES.computerTopSpaces + index * 2;
    if (!state.upper) open.push(upperId);
    else if (!state.lower) open.push(upperId + 1);
  }
  return open;
}

export function decodeSetiComputerSlot(player: SetiPlayer, slot: number):
  | { kind: 'top'; index: number }
  | { kind: 'tech'; stackId: SetiTechStackId; part: 'upper' | 'lower' }
  | null {
  if (Number.isInteger(slot) && slot >= 0 && slot < SETI_RULES.computerTopSpaces) return { kind: 'top', index: slot };
  const relative = slot - SETI_RULES.computerTopSpaces;
  if (!Number.isInteger(relative) || relative < 0) return null;
  const computerTechs = player.techs.filter((tech) => SETI_TECH_BY_ID[tech.stackId]?.type === 'computer');
  const tech = computerTechs[Math.floor(relative / 2)];
  if (!tech) return null;
  return { kind: 'tech', stackId: tech.stackId, part: relative % 2 === 0 ? 'upper' : 'lower' };
}

export function setiMoonTargetsForPrimary(s: SetiState, player: SetiPlayer, primary: SetiPrimaryBody): SetiBody[] {
  if (!setiPlayerHasAbility(player, 'moon-landing')) return [];
  return (Object.keys(SETI_BODIES) as SetiBody[]).filter((body) => {
    const def = SETI_BODIES[body];
    return def.moon && def.parent === primary && s.planets[body].landers.length === 0;
  });
}

export interface SetiLegalTargets {
  canEndTurn: boolean;
  canPass: boolean;
  canLaunch: boolean;
  canAnalyze: boolean;
  moveTargets: Record<string, SetiCellId[]>;
  moveEnergyCost: Record<string, Partial<Record<SetiCellId, number>>>;
  orbitTargets: Record<string, SetiProjectBody[]>;
  landTargets: Record<string, SetiProjectBody[]>;
  scanSectorTargets: SetiSectorId[];
  techStackTargets: SetiTechStackId[];
  traceTargets: string[];
  playableCards: string[];
  placeDataSlots: number[];
  buyableRow: number[];
  pendingKind: SetiPendingDecision['kind'] | null;
  pendingOptions: (string | number)[];
}

function emptyLegal(): SetiLegalTargets {
  return {
    canEndTurn: false,
    canPass: false,
    canLaunch: false,
    canAnalyze: false,
    moveTargets: {},
    moveEnergyCost: {},
    orbitTargets: {},
    landTargets: {},
    scanSectorTargets: [],
    techStackTargets: [],
    traceTargets: [],
    playableCards: [],
    placeDataSlots: [],
    buyableRow: [],
    pendingKind: null,
    pendingOptions: [],
  };
}

export function getSetiLegalTargets(s: SetiState, seat: number): SetiLegalTargets {
  const legal = emptyLegal();
  const player = s.players[seat];
  if (!player || s.phase === 'ended') return legal;
  const head = s.pending[0];
  if (head) {
    legal.pendingKind = head.kind;
    if (head.owner !== seat) return legal;
    switch (head.kind) {
      case 'initial-income-card': case 'end-round-card': case 'tuck-income-card': case 'card-effect-choice':
      case 'alien-card-source': case 'centaurian-reward': case 'exertian-card': case 'manual-trigger-choice':
        legal.pendingOptions = [...head.options]; break;
      case 'discard-to-four': legal.pendingOptions = [...player.hand]; break;
      case 'signal-sector': legal.pendingOptions = [...head.options]; legal.scanSectorTargets = [...head.options]; break;
      case 'completed-sector-order': legal.pendingOptions = [...head.options]; break;
      case 'trace-space': legal.pendingOptions = [...head.options]; legal.traceTargets = [...head.options]; break;
      case 'gold-tile': case 'tech-stack': legal.pendingOptions = [...head.options]; break;
      case 'mars-first-data': legal.pendingOptions = [...head.options]; break;
    }
    return legal;
  }
  if (s.phase !== 'playing' || s.activeSeat !== seat || player.passed || s.turnResolution) return legal;

  const canTakeMain = !s.mainActionTaken;
  legal.canEndTurn = s.mainActionTaken;
  legal.canPass = canTakeMain;
  legal.canLaunch = canTakeMain && player.credits >= SETI_RULES.launchCredits && setiProbesInSpace(s, seat) < setiProbeLimit(player);
  legal.canAnalyze = canTakeMain && player.energy >= SETI_RULES.analyzeEnergy && player.computer.top.every(Boolean);
  legal.placeDataSlots = player.dataPool > 0 ? setiComputerSlotIds(player) : [];
  legal.buyableRow = player.publicity >= SETI_RULES.buyPublicity
    ? s.projectRow.map((card, index) => card ? index : -1).filter((index) => index >= 0)
    : [];

  for (const piece of s.solar.pieces.filter((candidate) => candidate.owner === seat)) {
    const ignoresAsteroids = s.projectRuntime.turn.seat === seat
      && s.projectRuntime.turn.temporaryRules.some((entry) => entry.rule === 'ignore-asteroid-exit-surcharge');
    const surcharge = isSetiAsteroidCell(s, piece.cell) && !setiPlayerHasAbility(player, 'asteroid-navigation') && !ignoresAsteroids
      ? SETI_RULES.asteroidExitEnergy
      : 0;
    const energyCost = SETI_RULES.moveEnergy + surcharge;
    if (player.energy >= energyCost) {
      legal.moveTargets[piece.id] = adjacentSetiCells(piece.cell);
      legal.moveEnergyCost[piece.id] = Object.fromEntries(legal.moveTargets[piece.id].map((cell) => [cell, energyCost]));
    }
    if (piece.kind !== 'probe' || !canTakeMain) continue;
    if (parseSetiCell(piece.cell).ring === 2 && s.projectRuntime.pluto.installedBy === seat) {
      if (s.projectRuntime.pluto.orbiters.length < 1 && player.credits >= 1 && player.energy >= 1) {
        (legal.orbitTargets[piece.id] ??= []).push('Pluto');
      }
      const plutoDiscount = setiPlayerHasAbility(player, 'landing-discount') ? 1 : 0;
      const plutoLandCost = Math.max(0, (s.projectRuntime.pluto.orbiters.length ? 2 : 3) - plutoDiscount);
      if (s.projectRuntime.pluto.landers.length < 1 && player.energy >= plutoLandCost) {
        (legal.landTargets[piece.id] ??= []).push('Pluto');
      }
    }
    const primary = bodyAtSetiCell(s, piece.cell);
    if (!primary || primary === 'Earth') continue;
    if (player.credits >= SETI_RULES.orbitCredits && player.energy >= SETI_RULES.orbitEnergy) legal.orbitTargets[piece.id] = [primary];
    const hasOrbiter = s.planets[primary].orbiters.length > 0;
    const discount = setiPlayerHasAbility(player, 'landing-discount') ? 1 : 0;
    const landCost = Math.max(0, (hasOrbiter ? SETI_RULES.landWithOrbiterEnergy : SETI_RULES.landEnergy) - discount);
    if (player.energy >= landCost) {
      legal.landTargets[piece.id] = [primary, ...setiMoonTargetsForPrimary(s, player, primary)];
    }
  }

  if (canTakeMain && player.credits >= SETI_RULES.scanCredits && player.energy >= SETI_RULES.scanEnergy && s.projectRow.some(Boolean)) {
    legal.scanSectorTargets = [earthSetiSectorId(s), ...SETI_SECTOR_IDS.filter((id) => id !== earthSetiSectorId(s))];
  }
  if (canTakeMain && player.publicity >= SETI_RULES.researchPublicity) {
    legal.techStackTargets = SETI_TECH_STACKS
      .filter((stack) => s.techStacks[stack.id].tiles.length > 0 && !player.techs.some((tech) => tech.stackId === stack.id))
      .map((stack) => stack.id);
  }
  legal.playableCards = canTakeMain
    ? [
      ...player.hand.filter((cardId) => !!SETI_PROJECT_CATALOG_BY_ID[cardId] && player.credits >= SETI_PROJECT_CATALOG_BY_ID[cardId].cost),
      ...player.alienHand.filter((cardId) => {
        const card = SETI_ALIEN_CARDS_BY_ID[cardId];
        return !!card && card.species !== 'exertians';
      }),
    ]
    : [];
  return legal;
}

// ---------------------------------------------------------------------------
// Views and redaction
// ---------------------------------------------------------------------------

export interface SetiPlayerView extends Omit<SetiPlayer, 'hand' | 'alienHand' | 'hiddenExertian'> {
  handCount: number;
  alienHandCount: number;
  hiddenExertianCount: number;
  probesInSpace: number;
  orbiters: number;
  landers: number;
  income: Record<SetiIncomeKind, number>;
  traces: Record<SetiTraceColor, number>;
  hand?: string[];
  alienHand?: string[];
  hiddenExertian?: string[];
}

export interface SetiTechStackView {
  id: SetiTechStackId;
  count: number;
  firstTakeBonusAvailable: boolean;
  topTileId: string | null;
}

export interface SetiSpeciesView {
  slot: 0 | 1;
  revealed: boolean;
  speciesId: SetiSpeciesId | null;
  discovery: Record<SetiTraceColor, SetiDiscoveryMarker | null>;
  research: SetiResearchMarker[];
  alienDeckCount: number;
  alienFaceUp: string | null;
  alienDiscardCount: number;
  module: SetiSpeciesModule | { kind: SetiSpeciesModule['kind']; hidden: true } | null;
}

export interface SetiPendingView {
  kind: SetiPendingDecision['kind'];
  owner: number;
  decision?: SetiPendingDecision;
}

export interface SetiSoloView {
  difficulty: number;
  rivalScore: number;
  progress: number;
  activeObjectives: string[];
  completedObjectives: string[];
  objectiveDeckCount: number;
  actionDeckCount: number;
  techTokens: number;
}

export interface SetiView {
  game: 'seti';
  schemaVersion: 1;
  you: number | null;
  options: SetiState['options'];
  phase: SetiPhase;
  round: number;
  rounds: number;
  activeSeat: number;
  startingSeat: number;
  mainActionTaken: boolean;
  passedSeats: number[];
  players: SetiPlayerView[];
  solar: SetiSolarState & { features: SetiResolvedSolarFeature[]; bodyCells: Partial<Record<SetiPrimaryBody, SetiCellId>> };
  planets: Record<SetiBody, SetiPlanetState>;
  pluto: SetiPlutoState;
  sectorBoardOrder: string[];
  sectorOrder: SetiSectorId[];
  sectors: Record<SetiSectorId, SetiSectorState>;
  projectRow: (string | null)[];
  projectDeckCount: number;
  projectDiscard: string[];
  roundEndCount: number;
  techStacks: SetiTechStackView[];
  goldTiles: SetiGoldTileState[];
  species: [SetiSpeciesView, SetiSpeciesView];
  pending: SetiPendingView | null;
  solo: SetiSoloView | null;
  lastEvent: SetiEvent | null;
  log: string[];
  winners: SetiSeatColor[] | null;
  legal: SetiLegalTargets;
}

function redactSpeciesModule(module: SetiSpeciesModule | null, dev: boolean): SetiSpeciesView['module'] {
  if (!module) return null;
  if (dev) return module;
  if (module.kind === 'mascamites') {
    return {
      ...module,
      samplesAtJupiter: module.samplesAtJupiter.map(() => 'seti_hidden_sample'),
      samplesAtSaturn: module.samplesAtSaturn.map(() => 'seti_hidden_sample'),
    };
  }
  if (module.kind === 'exertians') {
    return { ...module, dangerBySeat: {} };
  }
  return module;
}

export function setiViewFor(s: SetiState, seat: number | null | 'dev'): SetiView {
  const dev = seat === 'dev';
  const me = typeof seat === 'number' ? seat : null;
  const head = s.pending[0] ?? null;
  const pending: SetiPendingView | null = head
    ? { kind: head.kind, owner: head.owner, ...((dev || head.owner === me) ? { decision: head } : {}) }
    : null;
  const species = s.species.map((slot): SetiSpeciesView => ({
    slot: slot.slot,
    revealed: slot.revealed,
    speciesId: slot.revealed || dev ? slot.speciesId : null,
    discovery: slot.discovery,
    research: slot.research,
    alienDeckCount: slot.alienDeck.length,
    alienFaceUp: slot.alienFaceUp,
    alienDiscardCount: slot.alienDiscard.length,
    module: slot.revealed ? redactSpeciesModule(slot.module, dev) : null,
  })) as [SetiSpeciesView, SetiSpeciesView];

  return {
    game: 'seti',
    schemaVersion: 1,
    you: me,
    options: s.options,
    phase: s.phase,
    round: s.round,
    rounds: SETI_RULES.rounds,
    activeSeat: s.activeSeat,
    startingSeat: s.startingSeat,
    mainActionTaken: s.mainActionTaken,
    passedSeats: [...s.passedSeats],
    players: s.players.map((player): SetiPlayerView => ({
      ...player,
      handCount: player.hand.length,
      alienHandCount: player.alienHand.length,
      hiddenExertianCount: player.hiddenExertian.length,
      probesInSpace: setiProbesInSpace(s, player.seat),
      orbiters: setiPlayerOrbiters(s, player.seat),
      landers: setiPlayerLanders(s, player.seat),
      income: setiIncomeCounts(player),
      traces: setiTraceCounts(player),
      ...((dev || me === player.seat) ? {
        hand: [...player.hand],
        alienHand: [...player.alienHand],
        hiddenExertian: [...player.hiddenExertian],
      } : {}),
      // Object spread above copied private arrays, so erase them from public seats.
      ...(!(dev || me === player.seat) ? { hand: undefined, alienHand: undefined, hiddenExertian: undefined } : {}),
    })),
    solar: { ...s.solar, features: getSetiSolarFeatures(s), bodyCells: getSetiBodyCells(s) },
    planets: s.planets,
    pluto: s.projectRuntime.pluto,
    sectorBoardOrder: [...s.sectorBoardOrder],
    sectorOrder: [...s.sectorOrder],
    sectors: s.sectors,
    projectRow: [...s.projectRow],
    projectDeckCount: s.projectDeck.length,
    projectDiscard: [...s.projectDiscard],
    roundEndCount: s.round <= 4 ? s.roundEndStacks[s.round - 1].length : 0,
    techStacks: SETI_TECH_STACKS.map((stack) => ({
      id: stack.id,
      count: s.techStacks[stack.id].tiles.length,
      firstTakeBonusAvailable: s.techStacks[stack.id].firstTakeBonusAvailable,
      topTileId: dev ? s.techStacks[stack.id].tiles[0] ?? null : null,
    })),
    goldTiles: [...s.goldTiles],
    species,
    pending,
    solo: s.solo ? {
      difficulty: s.solo.difficulty,
      rivalScore: s.solo.rivalScore,
      progress: s.solo.progress,
      activeObjectives: [...s.solo.activeObjectives],
      completedObjectives: [...s.solo.completedObjectives],
      objectiveDeckCount: s.solo.objectiveDeck.length,
      actionDeckCount: s.solo.actionDeck.length,
      techTokens: s.solo.techTokens,
    } : null,
    lastEvent: s.lastEvent,
    log: s.log.slice(-80),
    winners: s.winners,
    legal: me === null && !dev ? emptyLegal() : getSetiLegalTargets(s, dev ? s.activeSeat : me!),
  };
}

// ---------------------------------------------------------------------------
// Invariants used by tests/server diagnostics
// ---------------------------------------------------------------------------

export function setiProjectCardTotal(s: SetiState): number {
  return s.projectDeck.length
    + s.projectDiscard.length
    + s.projectRow.filter((card): card is string => card !== null).length
    + s.roundEndStacks.reduce((sum, stack) => sum + stack.length, 0)
    + s.players.reduce((sum, player) => sum + player.hand.length + player.incomeCards.length + player.missions.length + player.completedMissions.length + player.scoringCards.length + player.permanentCards.length, 0)
    + (s.projectRuntime.resolvingCard && !s.projectRuntime.resolvingCard.relocated ? 1 : 0);
}

export function assertSetiState(s: SetiState): void {
  if (s.game !== 'seti' || s.schemaVersion !== 1) throw new Error('Invalid SETI state header');
  if (s.round < 1 || s.round > SETI_RULES.rounds) throw new Error(`Invalid SETI round ${s.round}`);
  if (!s.players[s.activeSeat]) throw new Error('Invalid SETI active seat');
  const expectedProjects = SETI_BASE_PROJECT_CATALOG.length + (s.options.promoCards ? SETI_PROMO_PROJECT_CATALOG.length : 0);
  if (setiProjectCardTotal(s) !== expectedProjects) throw new Error(`SETI project conservation failed: ${setiProjectCardTotal(s)} != ${expectedProjects}`);
  for (const player of s.players) {
    if (player.publicity < 0 || player.publicity > SETI_RULES.publicityMax) throw new Error(`SETI publicity limit failed for ${player.color}`);
    if (player.dataPool < 0 || player.dataPool > SETI_RULES.dataMax) throw new Error(`SETI data limit failed for ${player.color}`);
    if (player.credits < 0 || player.energy < 0) throw new Error(`SETI resource below zero for ${player.color}`);
    if (player.computer.top.length !== SETI_RULES.computerTopSpaces) throw new Error('SETI computer top row must contain six spaces');
    for (const cardId of [...player.missions, ...player.completedMissions, ...player.scoringCards, ...player.permanentCards]) {
      if (!SETI_PROJECT_CATALOG_BY_ID[cardId]) throw new Error(`Unknown SETI project in a persistent zone: ${cardId}`);
    }
  }
  if (s.projectRuntime.resolution && !s.players[s.projectRuntime.resolution.owner]) throw new Error('SETI project resolution has an invalid owner');
  if (s.projectRuntime.resolvingCard && !SETI_PROJECT_CATALOG_BY_ID[s.projectRuntime.resolvingCard.cardId]) throw new Error('SETI resolving project card is unknown');
  if (s.projectRuntime.pluto.orbiters.length > 1 || s.projectRuntime.pluto.landers.length > 1) throw new Error('SETI Pluto promo has one orbit and one landing space');
  if (s.projectRuntime.pluto.installedBy !== null && !s.players[s.projectRuntime.pluto.installedBy]) throw new Error('SETI Pluto promo has an invalid owner');
  for (const id of SETI_SECTOR_IDS) {
    const sector = s.sectors[id];
    if (sector.dataRemaining < 0 || sector.dataRemaining > sector.capacity) throw new Error(`SETI sector data limit failed for ${id}`);
  }
  for (const piece of s.solar.pieces) {
    if (!s.players[piece.owner]) throw new Error(`SETI piece ${piece.id} has invalid owner`);
    if (!SETI_CELL_IDS.includes(piece.cell)) throw new Error(`SETI piece ${piece.id} has invalid cell`);
  }
}

export const SETI_NEUTRAL_MARKERS_PER_THRESHOLD = neutralMarkerCount;
export const SETI_GOLD_TILE_CATALOG = SETI_GOLD_TILES;
