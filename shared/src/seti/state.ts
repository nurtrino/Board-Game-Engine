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
  getSetiVisibleSolarFeatures,
  setiSolarSupportLayerForCell as pureSetiSolarSupportLayerForCell,
} from './solarGeometry.js';
import {
  SETI_COMPUTER_TECH_TOP_SPACES,
  setiNeutralMarkersPerThreshold,
  type SetiComputerTechBoardSlot,
} from './coreRules.js';
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
import {
  SETI_RIVAL_ACTION_CARDS,
  SETI_SOLO_DIFFICULTY_BY_LEVEL,
  SETI_SOLO_OBJECTIVES,
  type SetiRivalArrow,
  type SetiRivalSpeciesId,
  type SetiRivalTechType,
  type SetiSoloDifficulty,
} from './soloCatalog.js';

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
  computerSlot?: SetiComputerTechBoardSlot;
}

export interface SetiComputerState {
  top: boolean[];
  tech: Partial<Record<SetiTechStackId, { boardSlot: SetiComputerTechBoardSlot; lower: boolean }>>;
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
  /** Stored when claimed because later players occupy lower-value spaces. */
  pointsPerSet?: number;
  /** Global claim order on this tile, used to preserve its exact marker space. */
  claimOrder?: number;
}

export interface SetiPlayer {
  seat: number;
  color: SetiSeatColor;
  name: string;
  score: number;
  finalScore: number | null;
  finalScoreBreakdown: { base: number; gold: number; projects: number; aliens: number; total: number } | null;
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
  neutralMilestones: Record<20 | 30, boolean>;
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

/**
 * A physical orbiter or lander after its probe leaves the solar-system board.
 * `spaceId` records the exact printed space it covers; Dragonfly can therefore
 * share an occupied space without displacing its original figure, and removal
 * effects can reopen only the reward that was actually uncovered.
 */
export type SetiCoveredSpaceReward =
  | { kind: 'first-orbit-vp'; amount: 3 }
  | { kind: 'first-landing-data'; amount: number }
  | { kind: 'moon-landing' };

export interface SetiPlacedSpacecraft {
  id: string;
  owner: number;
  kind: 'orbiter' | 'lander';
  body: SetiProjectBody;
  spaceId: string;
  coveredReward: SetiCoveredSpaceReward | null;
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

export interface SetiSoloObjectiveProgressState {
  objectiveId: string;
  marked: boolean[];
}

export interface SetiSoloState {
  difficulty: SetiSoloDifficulty;
  rivalScore: number;
  rivalPublicity: number;
  progress: number;
  progressLoops: number;
  objectiveDeck: string[];
  activeObjectives: SetiSoloObjectiveProgressState[];
  completedObjectives: string[];
  actionDeck: string[];
  actionDiscard: string[];
  advancedReserve: string[];
  removedActionCards: string[];
  currentActionCard: string | null;
  currentDecisionArrow: SetiRivalArrow;
  lastActionCard: string | null;
  lastActionStep: number | null;
  techs: Record<SetiRivalTechType, string[]>;
  computer: boolean[];
  dataPool: number;
  goldClaims: { threshold: number; tileId: SetiGoldTileId }[];
  neutralMilestones: Record<20 | 30, boolean>;
  discoveredSpeciesInOrder: SetiRivalSpeciesId[];
  centaurianMessagesReserve: number;
  centaurianMessageTarget: number | null;
  exertianCards: string[];
  rivalStartsRound: boolean;
  passed: boolean;
  turnsTaken: number;
}

export type SetiPendingDecision =
  | { kind: 'initial-income-card'; owner: number; options: string[] }
  | { kind: 'discard-to-four'; owner: number; count: number; reason: 'pass' }
  | { kind: 'end-round-card'; owner: number; round: number; options: string[] }
  | { kind: 'signal-sector'; owner: number; source: 'earth' | 'project-row' | 'effect'; options: SetiSectorId[]; signalColor: SetiSignalColor | null; rowOptions?: number[]; resolutionId?: number; alienCardId?: string }
  | { kind: 'completed-sector-order'; owner: number; options: SetiSectorId[] }
  | { kind: 'trace-space'; owner: number; color: SetiTraceColor; options: string[]; resolutionId?: number }
  | { kind: 'gold-tile'; owner: number; threshold: number; options: SetiGoldTileId[] }
  | { kind: 'tech-stack'; owner: number; options: SetiTechStackId[]; free: boolean; rotateApplied?: true; resolutionId?: number }
  | { kind: 'computer-tech-slot'; owner: number; stackId: SetiTechStackId; tileId: string; options: SetiComputerTechBoardSlot[] }
  | { kind: 'mars-first-data'; owner: number; spacecraftId: string; options: number[] }
  | { kind: 'tuck-income-card'; owner: number; options: string[]; optional?: true }
  | { kind: 'card-effect-choice'; owner: number; cardId: string; label: string; min: number; max: number; options: string[]; resolutionId?: number }
  | { kind: 'alien-card-source'; owner: number; speciesSlot: 0 | 1; options: string[] }
  | { kind: 'centaurian-reward'; owner: number; options: string[] }
  | { kind: 'exertian-card'; owner: number; options: string[] }
  | { kind: 'solo-objective-task'; owner: number; eventId: number; options: string[] }
  | { kind: 'project-visit-reward'; owner: number; sourceCardId: string; options: ['publicity', 'move'] }
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

export type SetiDeferredEndRoundCard = Extract<SetiPendingDecision, { kind: 'end-round-card' }>;

export interface SetiTurnResolution {
  kind: 'end-turn' | 'pass';
  seat: number;
  milestonesQueued: boolean;
  soloRivalProcessed?: boolean;
  passStage?: 'discard' | 'round-card' | 'complete';
  firstPass?: boolean;
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
  placedSpacecraft: SetiPlacedSpacecraft[];
  nextSpacecraftId: number;
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
  neutralMilestonesRemaining: Record<20 | 30, number>;
  pending: SetiPendingDecision[];
  deferredEndRoundCard: SetiDeferredEndRoundCard | null;
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

function makeSoloState(s: SetiState, difficulty: SetiSoloDifficulty): SetiSoloState {
  const setup = SETI_SOLO_DIFFICULTY_BY_LEVEL[difficulty];
  const objectiveDeck: string[] = [];
  if (difficulty !== 1) {
    const counts = [setup.objectiveCounts.tier1, setup.objectiveCounts.tier2, setup.objectiveCounts.tier3] as const;
    for (const tier of [1, 2, 3] as const) {
      const tierDeck = setiShuffle(s, SETI_SOLO_OBJECTIVES.filter((objective) => objective.tier === tier).map((objective) => objective.id));
      objectiveDeck.push(...tierDeck.slice(0, counts[tier - 1]));
    }
  }

  const advancedReserve = setiShuffle(
    s,
    SETI_RIVAL_ACTION_CARDS.filter((card) => card.group === 'advanced').map((card) => card.id),
  );
  const startingActions: string[] = [...setup.startingActionCards];
  if (setup.randomAdvancedAtSetup) startingActions.push(advancedReserve.shift()!);
  const activeObjectives = objectiveDeck.splice(0, Math.min(3, objectiveDeck.length)).map((objectiveId) => ({
    objectiveId,
    marked: Array(SETI_SOLO_OBJECTIVES.find((objective) => objective.id === objectiveId)!.tasks.length).fill(false),
  }));

  return {
    difficulty,
    rivalScore: 2,
    rivalPublicity: SETI_RULES.startPublicity,
    progress: setup.startingProgressIndex,
    progressLoops: 0,
    objectiveDeck,
    activeObjectives,
    completedObjectives: [],
    actionDeck: setiShuffle(s, startingActions),
    actionDiscard: [],
    advancedReserve,
    removedActionCards: [],
    currentActionCard: null,
    currentDecisionArrow: 'left',
    lastActionCard: null,
    lastActionStep: null,
    techs: { probe: [], telescope: [], computer: [] },
    computer: Array(6).fill(false),
    dataPool: 0,
    goldClaims: [],
    neutralMilestones: { 20: false, 30: false },
    discoveredSpeciesInOrder: [],
    centaurianMessagesReserve: 0,
    centaurianMessageTarget: null,
    exertianCards: [],
    rivalStartsRound: false,
    passed: false,
    turnsTaken: 0,
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
    finalScoreBreakdown: null,
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
    neutralMilestones: { 20: false, 30: false },
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
    placedSpacecraft: [],
    nextSpacecraftId: 1,
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
    neutralMilestonesRemaining: {
      20: setiNeutralMarkersPerThreshold(players.length),
      30: setiNeutralMarkersPerThreshold(players.length),
    },
    pending: [],
    deferredEndRoundCard: null,
    projectRuntime: {
      nextResolutionId: 1,
      resolution: null,
      resolutionStack: [],
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
    const setupPlayerCount = mode === 'solo' ? 2 : players.length;
    for (let i = 0; i < setupPlayerCount + 1; i++) {
      const card = drawSetiProjectCard(s);
      if (!card) throw new Error('SETI project deck exhausted building round stacks');
      s.roundEndStacks[round].push(card);
    }
  }

  for (let offset = 0; offset < players.length; offset++) {
    const owner = (s.startingSeat + offset) % players.length;
    s.pending.push({ kind: 'initial-income-card', owner, options: [...players[owner].hand] });
  }

  if (mode === 'solo') {
    s.solo = makeSoloState(s, difficulty);
    s.solo.rivalStartsRound = setiRoll(s, 0, 1) === 1;
    if (s.solo.rivalStartsRound) {
      players[0].score = 2;
      s.solo.rivalScore = 1;
    }
  }
  s.log.push(`SETI setup complete. ${s.solo?.rivalStartsRound ? 'The rival' : players[s.startingSeat].name} is starting player.`);
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
  kind: 'planet' | 'asteroid' | 'comet';
  body?: SetiPrimaryBody;
  grantsPrintedPublicity: boolean;
}

export function getSetiSolarFeatures(s: SetiState): SetiResolvedSolarFeature[] {
  const anomalyCells = new Set<SetiCellId>();
  let oumuamua: SetiResolvedSolarFeature | null = null;
  for (const slot of s.species) {
    if (!slot.revealed) continue;
    if (slot.module?.kind === 'anomalies') for (const anomaly of slot.module.anomalies) anomalyCells.add(setiCellId(2, anomaly.sector));
    if (slot.module?.kind === 'oumuamua') oumuamua = { layer: 3, cell: slot.module.cell, kind: 'planet', body: 'Oumuamua', grantsPrintedPublicity: true };
  }
  const features: SetiResolvedSolarFeature[] = getSetiVisibleSolarFeatures(s.solar.orientations)
    .filter((feature) => !anomalyCells.has(feature.cell) && feature.cell !== oumuamua?.cell);
  if (oumuamua && !anomalyCells.has(oumuamua.cell)) features.unshift(oumuamua);
  return features;
}

export function isSetiAnomalyCell(s: SetiState, cell: SetiCellId): boolean {
  const parsed = parseSetiCell(cell);
  return parsed.ring === 2 && s.species.some((slot) => slot.revealed
    && slot.module?.kind === 'anomalies'
    && slot.module.anomalies.some((anomaly) => anomaly.sector === parsed.sector));
}

export function bodyAtSetiCell(s: SetiState, cell: SetiCellId): SetiPrimaryBody | null {
  const body = getSetiSolarFeatures(s)
    .find((feature) => feature.cell === cell && feature.kind === 'planet' && feature.body);
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
  return getSetiSolarFeatures(s).some((feature) => feature.cell === cell && feature.grantsPrintedPublicity);
}

export function setiSupportLayerForCell(s: SetiState, cell: SetiCellId): 0 | 1 | 2 | 3 {
  return pureSetiSolarSupportLayerForCell(s.solar.orientations, cell);
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

export function setiFirstOrbitSpaceId(body: SetiProjectBody): string {
  return `seti_${body.toLowerCase()}_first_orbit`;
}

export function setiFirstLandingSpaceId(body: SetiBody, amount: number): string {
  return `seti_${body.toLowerCase()}_first_landing_${amount}`;
}

export function setiMoonLandingSpaceId(body: SetiBody): string {
  return `seti_${body.toLowerCase()}_moon_landing`;
}

export function setiFirstOrbitSpaceAvailable(s: SetiState, body: SetiProjectBody): boolean {
  const spaceId = setiFirstOrbitSpaceId(body);
  return !s.placedSpacecraft.some((piece) => piece.kind === 'orbiter' && piece.body === body && piece.spaceId === spaceId);
}

/** Add one physical spacecraft while preserving the legacy per-body owner arrays. */
export function placeSetiSpacecraft(
  s: SetiState,
  placement: Omit<SetiPlacedSpacecraft, 'id' | 'spaceId'> & { spaceId?: string },
): SetiPlacedSpacecraft {
  const id = `seti_spacecraft_${s.nextSpacecraftId++}`;
  const piece: SetiPlacedSpacecraft = {
    ...placement,
    id,
    spaceId: placement.spaceId ?? `seti_${placement.body.toLowerCase()}_${placement.kind}_${id}`,
    coveredReward: placement.coveredReward ? { ...placement.coveredReward } : null,
  };
  s.placedSpacecraft.push(piece);
  const owners = placement.body === 'Pluto'
    ? (placement.kind === 'orbiter' ? s.projectRuntime.pluto.orbiters : s.projectRuntime.pluto.landers)
    : (placement.kind === 'orbiter' ? s.planets[placement.body].orbiters : s.planets[placement.body].landers);
  owners.push(placement.owner);
  return piece;
}

/** Remove exactly one selected physical figure and its matching legacy owner entry. */
export function removeSetiPlacedSpacecraft(s: SetiState, spacecraftId: string): SetiPlacedSpacecraft | null {
  const index = s.placedSpacecraft.findIndex((piece) => piece.id === spacecraftId);
  if (index < 0) return null;
  const [piece] = s.placedSpacecraft.splice(index, 1);
  const owners = piece.body === 'Pluto'
    ? (piece.kind === 'orbiter' ? s.projectRuntime.pluto.orbiters : s.projectRuntime.pluto.landers)
    : (piece.kind === 'orbiter' ? s.planets[piece.body].orbiters : s.planets[piece.body].landers);
  const ownerIndex = owners.indexOf(piece.owner);
  if (ownerIndex < 0) throw new Error(`SETI spacecraft ${spacecraftId} has no matching owner marker`);
  owners.splice(ownerIndex, 1);
  return piece;
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
  for (const state of Object.values(player.computer.tech)) {
    if (!state || state.lower) continue;
    const topSpace = SETI_COMPUTER_TECH_TOP_SPACES[state.boardSlot];
    if (player.computer.top[topSpace]) open.push(SETI_RULES.computerTopSpaces + state.boardSlot);
  }
  return open;
}

export function decodeSetiComputerSlot(player: SetiPlayer, slot: number):
  | { kind: 'top'; index: number }
  | { kind: 'tech'; stackId: SetiTechStackId; part: 'lower'; boardSlot: SetiComputerTechBoardSlot }
  | null {
  if (Number.isInteger(slot) && slot >= 0 && slot < SETI_RULES.computerTopSpaces) return { kind: 'top', index: slot };
  const boardSlot = slot - SETI_RULES.computerTopSpaces;
  if (!Number.isInteger(boardSlot) || boardSlot < 0 || boardSlot >= SETI_COMPUTER_TECH_TOP_SPACES.length) return null;
  const entry = Object.entries(player.computer.tech).find(([, state]) => state?.boardSlot === boardSlot);
  if (!entry) return null;
  return { kind: 'tech', stackId: entry[0] as SetiTechStackId, part: 'lower', boardSlot: boardSlot as SetiComputerTechBoardSlot };
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
  canResearch: boolean;
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
    canResearch: false,
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

function deferredEndRoundCardBlocksPlay(s: SetiState): boolean {
  if (!s.deferredEndRoundCard || s.turnResolution?.kind !== 'pass') return false;
  if (s.turnResolution.passStage === 'round-card') return true;
  return s.solo
    ? s.players[0].passed && s.solo.passed
    : s.players.every((player) => player.passed);
}

function setiDecisionForSeat(s: SetiState, seat: number): SetiPendingDecision | null {
  const queued = s.pending[0] ?? null;
  if (queued?.owner === seat) return queued;
  if (s.deferredEndRoundCard?.owner === seat) return s.deferredEndRoundCard;
  return queued ?? (deferredEndRoundCardBlocksPlay(s) ? s.deferredEndRoundCard : null);
}

export function getSetiLegalTargets(s: SetiState, seat: number): SetiLegalTargets {
  const legal = emptyLegal();
  const player = s.players[seat];
  if (!player || s.phase === 'ended') return legal;
  const head = setiDecisionForSeat(s, seat);
  if (head) {
    legal.pendingKind = head.kind;
    if (head.owner !== seat) return legal;
    switch (head.kind) {
      case 'initial-income-card': case 'end-round-card': case 'tuck-income-card': case 'card-effect-choice':
      case 'alien-card-source': case 'centaurian-reward': case 'exertian-card': case 'manual-trigger-choice': case 'project-visit-reward':
        legal.pendingOptions = [...head.options]; break;
      case 'discard-to-four': legal.pendingOptions = [
        ...player.hand,
        ...player.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species !== 'exertians'),
      ]; break;
      case 'signal-sector': legal.pendingOptions = [...head.options]; legal.scanSectorTargets = [...head.options]; break;
      case 'completed-sector-order': legal.pendingOptions = [...head.options]; break;
      case 'trace-space': legal.pendingOptions = [...head.options]; legal.traceTargets = [...head.options]; break;
      case 'gold-tile': legal.pendingOptions = [...head.options]; break;
      case 'tech-stack':
        legal.pendingOptions = [...head.options];
        legal.techStackTargets = [...head.options];
        break;
      case 'computer-tech-slot': legal.pendingOptions = [...head.options]; break;
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
    const canPayWithMovementCard = player.energy >= surcharge
      && player.hand.some((cardId) => SETI_PROJECT_CATALOG_BY_ID[cardId]?.freeCorner === 'move');
    if (player.energy >= energyCost || canPayWithMovementCard) {
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
  legal.canResearch = canTakeMain
    && player.publicity >= SETI_RULES.researchPublicity
    && SETI_TECH_STACKS.some((stack) => s.techStacks[stack.id].tiles.length > 0 && !player.techs.some((tech) => tech.stackId === stack.id));
  legal.playableCards = canTakeMain
    ? [
      ...player.hand.filter((cardId) => !!SETI_PROJECT_CATALOG_BY_ID[cardId] && player.credits >= SETI_PROJECT_CATALOG_BY_ID[cardId].cost),
      ...player.alienHand.filter((cardId) => {
        const card = SETI_ALIEN_CARDS_BY_ID[cardId];
        if (!card?.playCost || card.species === 'exertians') return false;
        return card.playCost.resource === 'credit'
          ? player.credits >= card.playCost.amount
          : player.energy >= card.playCost.amount;
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
  rivalPublicity: number;
  progress: number;
  progressLoops: number;
  activeObjectives: SetiSoloObjectiveProgressState[];
  completedObjectives: string[];
  objectiveDeckCount: number;
  actionDeckCount: number;
  actionDiscardCount: number;
  currentActionCard: string | null;
  lastActionCard: string | null;
  lastActionStep: number | null;
  techs: Record<SetiRivalTechType, number>;
  computer: boolean[];
  dataPool: number;
  rivalStartsRound: boolean;
  passed: boolean;
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
  placedSpacecraft: SetiPlacedSpacecraft[];
  pluto: SetiPlutoState;
  neutralMilestonesRemaining: Record<20 | 30, number>;
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
  const queued = s.pending[0] ?? null;
  const privateDeferred = me !== null && s.deferredEndRoundCard?.owner === me
    ? s.deferredEndRoundCard
    : null;
  const head = dev
    ? queued ?? s.deferredEndRoundCard
    : queued?.owner === me
      ? queued
      : privateDeferred ?? queued ?? (deferredEndRoundCardBlocksPlay(s) ? s.deferredEndRoundCard : null);
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
  const solarPieces = s.solar.pieces.map((piece) => {
    if (dev || piece.owner === me || !piece.sampleId) return { ...piece };
    const { sampleId: _hiddenSample, ...publicPiece } = piece;
    return publicPiece;
  });

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
    solar: { ...s.solar, pieces: solarPieces, features: getSetiSolarFeatures(s), bodyCells: getSetiBodyCells(s) },
    planets: s.planets,
    placedSpacecraft: s.placedSpacecraft.map((piece) => ({ ...piece, coveredReward: piece.coveredReward ? { ...piece.coveredReward } : null })),
    pluto: s.projectRuntime.pluto,
    neutralMilestonesRemaining: { ...s.neutralMilestonesRemaining },
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
      // The technology side is face down in the physical stack, leaving the
      // shuffled immediate-reward face publicly visible.
      topTileId: s.techStacks[stack.id].tiles[0] ?? null,
    })),
    goldTiles: [...s.goldTiles],
    species,
    pending,
    solo: s.solo ? {
      difficulty: s.solo.difficulty,
      rivalScore: s.solo.rivalScore,
      rivalPublicity: s.solo.rivalPublicity,
      progress: s.solo.progress,
      progressLoops: s.solo.progressLoops,
      activeObjectives: s.solo.activeObjectives.map((objective) => ({ ...objective, marked: [...objective.marked] })),
      completedObjectives: [...s.solo.completedObjectives],
      objectiveDeckCount: s.solo.objectiveDeck.length,
      actionDeckCount: s.solo.actionDeck.length,
      actionDiscardCount: s.solo.actionDiscard.length,
      currentActionCard: s.solo.currentActionCard,
      lastActionCard: s.solo.lastActionCard,
      lastActionStep: s.solo.lastActionStep,
      techs: {
        probe: s.solo.techs.probe.length,
        telescope: s.solo.techs.telescope.length,
        computer: s.solo.techs.computer.length,
      },
      computer: [...s.solo.computer],
      dataPool: s.solo.dataPool,
      rivalStartsRound: s.solo.rivalStartsRound,
      passed: s.solo.passed,
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
  const neutralMarkerLimit = setiNeutralMarkersPerThreshold(s.players.length);
  for (const threshold of [20, 30] as const) {
    const remaining = s.neutralMilestonesRemaining[threshold];
    if (!Number.isInteger(remaining) || remaining < 0 || remaining > neutralMarkerLimit) {
      throw new Error(`SETI ${threshold}-point neutral marker supply is invalid`);
    }
  }
  if (s.deferredEndRoundCard) {
    const decision = s.deferredEndRoundCard;
    if (!s.players[decision.owner]?.passed) throw new Error('SETI deferred end-round card owner has not passed');
    if (decision.round !== s.round || s.round > 4) throw new Error('SETI deferred end-round card belongs to the wrong round');
    const stack = s.roundEndStacks[decision.round - 1];
    if (!decision.options.length || decision.options.some((cardId) => !stack.includes(cardId))) {
      throw new Error('SETI deferred end-round card options are stale');
    }
  }
  for (const player of s.players) {
    if (player.publicity < 0 || player.publicity > SETI_RULES.publicityMax) throw new Error(`SETI publicity limit failed for ${player.color}`);
    if (player.dataPool < 0 || player.dataPool > SETI_RULES.dataMax) throw new Error(`SETI data limit failed for ${player.color}`);
    if (player.credits < 0 || player.energy < 0) throw new Error(`SETI resource below zero for ${player.color}`);
    if (player.finalScoreBreakdown && player.finalScoreBreakdown.total !== player.finalScore) throw new Error(`SETI final score breakdown is inconsistent for ${player.color}`);
    if (player.computer.top.length !== SETI_RULES.computerTopSpaces) throw new Error('SETI computer top row must contain six spaces');
    if (typeof player.neutralMilestones[20] !== 'boolean' || typeof player.neutralMilestones[30] !== 'boolean') throw new Error('SETI player neutral milestone state is invalid');
    const occupiedComputerSlots = new Set<number>();
    for (const [stackId, computer] of Object.entries(player.computer.tech)) {
      if (!computer) continue;
      const stack = SETI_TECH_BY_ID[stackId as SetiTechStackId];
      const owned = player.techs.find((tech) => tech.stackId === stackId);
      if (!stack || stack.type !== 'computer' || !owned || owned.computerSlot !== computer.boardSlot) {
        throw new Error(`SETI computer technology ${stackId} is not installed consistently`);
      }
      if (!Number.isInteger(computer.boardSlot) || computer.boardSlot < 0 || computer.boardSlot >= SETI_COMPUTER_TECH_TOP_SPACES.length || occupiedComputerSlots.has(computer.boardSlot)) {
        throw new Error(`SETI computer technology ${stackId} occupies an invalid board slot`);
      }
      occupiedComputerSlots.add(computer.boardSlot);
      if (computer.lower && !player.computer.top[SETI_COMPUTER_TECH_TOP_SPACES[computer.boardSlot]]) {
        throw new Error(`SETI computer technology ${stackId} has lower data without its aligned upper data`);
      }
    }
    for (const tech of player.techs) {
      if (tech.computerSlot === undefined) continue;
      if (player.computer.tech[tech.stackId]?.boardSlot !== tech.computerSlot) throw new Error(`SETI owned technology ${tech.stackId} has a stale computer slot`);
    }
    for (const claim of player.goldClaims) {
      if (claim.pointsPerSet !== undefined && (!Number.isInteger(claim.pointsPerSet) || claim.pointsPerSet < 0)) throw new Error('SETI gold claim value is invalid');
    }
    for (const cardId of [...player.missions, ...player.completedMissions, ...player.scoringCards, ...player.permanentCards]) {
      if (!SETI_PROJECT_CATALOG_BY_ID[cardId]) throw new Error(`Unknown SETI project in a persistent zone: ${cardId}`);
    }
  }
  if (s.projectRuntime.resolution && !s.players[s.projectRuntime.resolution.owner]) throw new Error('SETI project resolution has an invalid owner');
  if (s.projectRuntime.resolutionStack.some((resolution) => !s.players[resolution.owner])) throw new Error('SETI suspended project resolution has an invalid owner');
  if (s.projectRuntime.resolvingCard && !SETI_PROJECT_CATALOG_BY_ID[s.projectRuntime.resolvingCard.cardId]) throw new Error('SETI resolving project card is unknown');
  if (s.projectRuntime.pluto.orbiters.length > 1 || s.projectRuntime.pluto.landers.length > 1) throw new Error('SETI Pluto promo has one orbit and one landing space');
  if (s.projectRuntime.pluto.installedBy !== null && !s.players[s.projectRuntime.pluto.installedBy]) throw new Error('SETI Pluto promo has an invalid owner');
  const spacecraftIds = new Set<string>();
  for (const piece of s.placedSpacecraft) {
    if (spacecraftIds.has(piece.id)) throw new Error(`Duplicate SETI spacecraft id ${piece.id}`);
    spacecraftIds.add(piece.id);
    if (piece.owner !== -1 && !s.players[piece.owner]) throw new Error(`SETI spacecraft ${piece.id} has invalid owner`);
    if (piece.owner === -1 && !s.solo) throw new Error(`SETI rival spacecraft ${piece.id} exists outside solo play`);
    if (piece.body !== 'Pluto' && !SETI_BODIES[piece.body]) throw new Error(`SETI spacecraft ${piece.id} has invalid body`);
    if (piece.coveredReward?.kind === 'first-orbit-vp' && piece.kind !== 'orbiter') throw new Error(`SETI lander ${piece.id} covers an orbit reward`);
    if ((piece.coveredReward?.kind === 'first-landing-data' || piece.coveredReward?.kind === 'moon-landing') && piece.kind !== 'lander') throw new Error(`SETI orbiter ${piece.id} covers a landing reward`);
    if (piece.coveredReward?.kind === 'first-landing-data' && piece.body !== 'Pluto' && s.planets[piece.body].firstLandingBonuses.includes(piece.coveredReward.amount)) {
      throw new Error(`SETI first-landing reward ${piece.body}/${piece.coveredReward.amount} is both covered and available`);
    }
  }
  const metadataMarkers = s.placedSpacecraft.map((piece) => `${piece.body}|${piece.kind}|${piece.owner}`).sort();
  const legacyMarkers = (Object.keys(SETI_BODIES) as SetiBody[]).flatMap((body) => [
    ...s.planets[body].orbiters.map((owner) => `${body}|orbiter|${owner}`),
    ...s.planets[body].landers.map((owner) => `${body}|lander|${owner}`),
  ]).concat(
    s.projectRuntime.pluto.orbiters.map((owner) => `Pluto|orbiter|${owner}`),
    s.projectRuntime.pluto.landers.map((owner) => `Pluto|lander|${owner}`),
  ).sort();
  if (metadataMarkers.length !== legacyMarkers.length || metadataMarkers.some((marker, index) => marker !== legacyMarkers[index])) {
    throw new Error('SETI placed-spacecraft metadata does not match the planetary owner arrays');
  }
  for (const id of SETI_SECTOR_IDS) {
    const sector = s.sectors[id];
    if (sector.dataRemaining < 0 || sector.dataRemaining > sector.capacity) throw new Error(`SETI sector data limit failed for ${id}`);
  }
  if (s.solo) {
    if (s.solo.rivalPublicity < 0 || s.solo.rivalPublicity > SETI_RULES.publicityMax) throw new Error('SETI rival publicity limit failed');
    if (s.solo.dataPool < 0 || !Number.isInteger(s.solo.dataPool)) throw new Error('SETI rival data pool must be a non-negative integer');
    if (s.solo.computer.length !== 6) throw new Error('SETI rival computer must contain six spaces');
    for (const progress of s.solo.activeObjectives) {
      const objective = SETI_SOLO_OBJECTIVES.find((candidate) => candidate.id === progress.objectiveId);
      if (!objective || progress.marked.length !== objective.tasks.length) throw new Error(`Invalid SETI solo objective ${progress.objectiveId}`);
    }
    for (const id of [...s.solo.actionDeck, ...s.solo.actionDiscard, ...s.solo.advancedReserve]) {
      if (!SETI_RIVAL_ACTION_CARDS.some((card) => card.id === id)) throw new Error(`Unknown SETI rival action ${id}`);
    }
  }
  for (const piece of s.solar.pieces) {
    if (!s.players[piece.owner] && !(s.solo && piece.owner === -1)) throw new Error(`SETI piece ${piece.id} has invalid owner`);
    if (!SETI_CELL_IDS.includes(piece.cell)) throw new Error(`SETI piece ${piece.id} has invalid cell`);
  }
}

export const SETI_NEUTRAL_MARKERS_PER_THRESHOLD = neutralMarkerCount;
export const SETI_GOLD_TILE_CATALOG = SETI_GOLD_TILES;
