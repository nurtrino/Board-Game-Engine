/**
 * JSON-only contracts for the 2016 classic base game of A Feast for Odin.
 *
 * State deliberately contains no Map, Set, Date, class instances, callbacks,
 * or undefined values.  This keeps saved games and redacted WebSocket views
 * stable across server restarts.
 */

export type FeastSeatColor = 'Red' | 'Blue' | 'Green' | 'Purple';
export type FeastLength = 'short' | 'long';
export type FeastOccupationMode = 'A' | 'BC' | 'all';
export type FeastSoloStartingOccupation = 'random' | 'choose';

export interface FeastOptions {
  length: FeastLength;
  occupationMode: FeastOccupationMode;
  soloStartingOccupation: FeastSoloStartingOccupation;
}

export interface FeastSeated {
  name: string;
  color: FeastSeatColor;
}

export type FeastPhase =
  | 'new_viking'
  | 'harvest'
  | 'exploration'
  | 'weapon'
  | 'actions'
  | 'start_player'
  | 'income'
  | 'breeding'
  | 'feast'
  | 'bonus'
  | 'mountains'
  | 'return_vikings'
  | 'ended';

export const FEAST_PHASES: readonly FeastPhase[] = [
  'new_viking', 'harvest', 'exploration', 'weapon', 'actions',
  'start_player', 'income', 'breeding', 'feast', 'bonus',
  'mountains', 'return_vikings',
] as const;

export type FeastGoodColor = 'orange' | 'red' | 'green' | 'blue';

export type FeastGood =
  | 'peas' | 'flax' | 'beans' | 'grain' | 'cabbage' | 'fruits'
  | 'mead' | 'stockfish' | 'milk' | 'salt-meat' | 'game-meat'
  | 'whale-meat' | 'sheep' | 'pregnant-sheep' | 'cattle'
  | 'pregnant-cattle'
  | 'oil' | 'hide' | 'wool' | 'linen' | 'skin-and-bones' | 'fur'
  | 'robe' | 'clothing'
  | 'rune-stone' | 'silverware' | 'chest' | 'silk' | 'spices'
  | 'jewelry' | 'treasure-chest' | 'silver-hoard';

export type FeastBuildingResource = 'wood' | 'stone' | 'ore';
export type FeastWeapon = 'bow' | 'snare' | 'spear' | 'long-sword';
export type FeastShipType = 'whaling-boat' | 'knarr' | 'longship';
export type FeastBuildingType = 'shed' | 'stone-house' | 'long-house';
export type FeastBoardKind = 'home' | 'exploration' | 'building';

export interface FeastGoodDefinition {
  id: FeastGood;
  name: string;
  color: FeastGoodColor;
  width: number;
  height: number;
  reverse: FeastGood | null;
  upgrade: FeastGood | null;
  animal: boolean;
}

export interface FeastBounds {
  /** Normalized against the authentic 2500 x 5000 action-board art. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FeastActionGroup =
  | 'Build Houses'
  | 'Build Ships'
  | 'Hunting'
  | 'Livestock Market'
  | 'Weekly Market'
  | 'Products'
  | 'Crafting'
  | 'Mountains and Trade'
  | 'Sailing'
  | 'Raiding, Pillaging, and Plundering'
  | 'Exploration'
  | 'Emigration and Occupation';

export interface FeastAmount {
  kind: 'silver' | 'resource' | 'good' | 'weapon';
  id?: FeastBuildingResource | FeastGood | FeastWeapon;
  amount: number;
}

export interface FeastDieRule {
  kind: 'raid' | 'pillage' | 'hunt' | 'snare' | 'whale';
  sides: 8 | 12;
  direction: 'high' | 'low';
  maxRolls: number;
  boatsMin?: number;
  boatsMax?: number;
  returnedVikingsOnFailure: number;
}

/**
 * Ordered, machine-readable printed effects. Optional/alternative effects are
 * represented explicitly so the reducer and UI use the same information.
 */
export type FeastPrintedEffect =
  | { kind: 'gain'; items: FeastAmount[]; optional?: boolean }
  | { kind: 'pay'; items: FeastAmount[]; optional?: boolean }
  | { kind: 'build'; building: FeastBuildingType }
  | { kind: 'ship'; ship: FeastShipType; mode: 'gain' | 'exchange-whaling' }
  | { kind: 'choose'; min: number; max: number; options: { id: string; label: string; effects: FeastPrintedEffect[] }[] }
  | { kind: 'die'; rule: FeastDieRule }
  | { kind: 'mountain'; allowances: number[] }
  | { kind: 'upgrade'; count: number; steps: 1 | 2; distinct?: boolean }
  | { kind: 'overseas-trade' }
  | { kind: 'special-sale'; max: number }
  | { kind: 'explore'; faces: string[]; ship: 'any' | 'large' | 'longship' }
  | { kind: 'emigrate'; exchangeWhaling?: boolean }
  | { kind: 'occupation'; mode: 'draw' | 'play'; min: number; max: number; payment?: ('stone' | 'ore')[] }
  | { kind: 'draw-weapons'; amount: number }
  | { kind: 'conditional-production'; animal: 'sheep' | 'cattle'; good: FeastGood; max: number }
  | { kind: 'weekly-four' }
  | { kind: 'forge' }
  | { kind: 'plunder' };

export interface FeastActionSpaceDefinition {
  id: string;
  order: number;
  name: string;
  group: FeastActionGroup;
  column: 1 | 2 | 3 | 4;
  workers: 1 | 2 | 3 | 4;
  effects: FeastPrintedEffect[];
  requirements: string[];
  bounds: FeastBounds;
}

export interface FeastActionOccupancy {
  seat: number;
  workers: number;
  workerColor: FeastSeatColor;
  copiedFrom: string | null;
}

export interface FeastActionSpaceState {
  id: string;
  occupants: FeastActionOccupancy[];
}

/** Durable, reducer-owned placement provenance for effects whose wording
 * counts placement opportunities rather than Vikings that still remain on
 * the action board. */
export interface FeastWorkerPlacementRecord {
  round: number;
  seat: number;
  actionSpaceId: string;
  column: 1 | 2 | 3 | 4;
  workers: number;
  workerColor: FeastSeatColor;
  imitate: boolean;
  /** Occupations relevant to placement-history predicates that were active
   * when the placement committed. */
  activeOccupationIds: string[];
}

export interface FeastCell {
  x: number;
  y: number;
}

export interface FeastPlacement {
  id: string;
  pieceKind: 'good' | 'special' | 'silver' | 'ore' | 'wood' | 'stone';
  pieceId: string;
  color: FeastGoodColor | 'silver' | 'ore' | 'wood' | 'stone' | 'blue';
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  mask: string[];
  covered: FeastCell[];
}

export interface FeastBoardState {
  id: string;
  definitionId: string;
  kind: FeastBoardKind;
  owner: number;
  placements: FeastPlacement[];
}

export interface FeastBoardDefinition {
  id: string;
  name: string;
  kind: FeastBoardKind;
  faceCode: string | null;
  rows: number;
  cols: number;
  /** `#` valid, `.` outside board, `X` forbidden/pillar. */
  layout: string[];
  points: number;
  negativeCells: { cell: FeastCell; value: number }[];
  incomeTracks: { id: string; entries: { value: number; cell: FeastCell | null }[] }[];
  bonuses: {
    cell: FeastCell;
    rewards: { kind: 'good' | 'resource' | 'special' | 'building'; id: string; amount: number }[];
    finite?: boolean;
  }[];
  designatedResources: { cell: FeastCell; resource: 'wood' | 'stone'; negativeValue?: number }[];
}

export interface FeastSpecialDefinition {
  id: string;
  name: string;
  area: number;
  mask: string[];
  swordValue: number;
  silverCost: number | null;
  forge: boolean;
  points: number;
}

export interface FeastMountainState {
  id: string;
  /** Arrow-end item is index 0. `silver-2` is one item. */
  items: ('wood' | 'stone' | 'ore' | 'silver-2')[];
}

export interface FeastExplorationSupply {
  boardId: string;
  face: string;
  reverseFace: string;
  faceCode: 'A' | 'B' | 'C' | 'D';
  silver: number;
  claimedBy: number | null;
}

export interface FeastShip {
  id: string;
  type: FeastShipType;
  ore: number;
  emigrated: boolean;
  emigratedRound: number | null;
}

export interface FeastOccupationDefinition {
  id: string;
  number: number;
  deck: 'A' | 'B' | 'C';
  starting: boolean;
  name: string;
  points: number;
  type: 'immediate' | 'anytime' | 'each-time' | 'as-soon-as';
  category: string;
  clarification: string;
  cell: number;
  sheet: string;
  back: string;
}

export interface FeastOccupationUse {
  cardId: string;
  round: number;
  usesThisRound: number;
  usedOnce: boolean;
}

/** Durable clause-level provenance used by the typed occupation runtime. */
export interface FeastOccupationUsageStateRecord {
  key: string;
  cardId: string;
  clauseId: string;
  limit: 'once-per-card' | 'once-per-round' | 'once-per-action' | 'once-per-event' | 'unlimited';
  round: number;
  actionId?: string;
  eventId?: string;
}

/** Accepted replacement registrations retained so the surrounding reducer
 * transaction can suppress the exact original action/reward. */
export interface FeastOccupationReplacementStateRecord {
  cardId: string;
  clauseId: string;
  target: 'action' | 'reward' | 'payment' | 'ship' | 'harvest-good' | 'bonus-good' | 'weapon-draw' | 'loot';
  round: number;
  actionId?: string;
  eventId?: string;
  parameters?: Record<string, FeastJsonValue>;
}

/** Concrete modifier emitted by an accepted optional occupation effect and
 * retained for its action/event/round lifetime. */
export interface FeastOccupationActiveModifierStateRecord {
  seat: number;
  cardId: string;
  clauseId: string;
  round: number;
  actionId?: string;
  eventId?: string;
  modifier: Record<string, FeastJsonValue>;
}

export interface FeastPlayer {
  seat: number;
  name: string;
  color: FeastSeatColor;
  workerColors: FeastSeatColor[];
  activeWorkerColor: FeastSeatColor;
  /** Per-color totals are only plural in the original solo game. */
  workersByColor: Partial<Record<FeastSeatColor, number>>;
  workersTotal: number;
  workersAvailable: number;
  workersWaiting: number;
  passed: boolean;
  turnActionTaken: boolean;
  turnMayEnd: boolean;
  /** At least one printed effect (payment counts) has actually resolved. */
  turnEffectUsed: boolean;
  /** Stable id shared by every occupation hook in the current worker action. */
  turnActionId: string | null;
  /** Physical ships and accumulated typed facts for the current action. */
  turnSelectedShipIds: string[];
  turnActionFacts: Record<string, FeastJsonValue>;
  /** Internal serializable flag for the fourth-column after-action card bonus. */
  fourthOccupationAfter: boolean;
  silver: number;
  resources: Record<FeastBuildingResource, number>;
  goods: Record<FeastGood, number>;
  weapons: Record<FeastWeapon, number>;
  ships: FeastShip[];
  specials: string[];
  occupationHand: string[];
  playedOccupations: string[];
  occupationUses: FeastOccupationUse[];
  boards: FeastBoardState[];
  feastPlacements: FeastPlacement[];
  /** Banquet placements whose Feast-arrival placement hook has already run. */
  feastRewardedPlacementIds: string[];
  feastHorizontalTypes: FeastGood[];
  feastNoMeadCommitted: boolean;
  thingPenalties: number;
  finalIncome: number;
  scoreAdjustments: { cardId: string; amount: number; reason: string }[];
}

export interface FeastDecisionOption {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  reason?: string;
  value?: number;
  art?: string;
}

export type FeastDecisionKind =
  | 'goods' | 'mountain' | 'ship'
  | 'exploration' | 'special' | 'occupation' | 'emigration'
  | 'die' | 'die-spend' | 'occupation-timing' | 'card-effect'
  | 'feast' | 'setup-occupation' | 'final-placement';

export interface FeastPendingDecision {
  id: string;
  seat: number;
  kind: FeastDecisionKind;
  label: string;
  prompt: string;
  options: FeastDecisionOption[];
  min?: number;
  max?: number;
  /** Typed visual metadata (die, board, ship, source action, etc.). */
  meta?: Record<string, string | number | boolean | null | string[] | number[]>;
  /** Reducer-only continuation data; removed from non-dev views. */
  continuation: FeastContinuation;
  private: boolean;
}

export type FeastJsonValue = null | string | number | boolean | FeastJsonValue[] | { [key: string]: FeastJsonValue };

/** Serializable event context retained only while server card effects resolve. */
export interface FeastOccupationContextState {
  hook: string;
  event: string;
  window: string;
  fields: Record<string, FeastJsonValue>;
  round?: number;
  actionId?: string;
  eventId?: string;
  cardId?: string;
  snapshots?: Record<string, FeastPlayer>;
  available?: Record<string, number | boolean>;
  payments?: Record<string, number>;
  activatedClauseIds?: string[];
}

export interface FeastOccupationPlanKey {
  cardId: string;
  clauseId: string;
}

export interface FeastOccupationSelectionState {
  accepted: boolean;
  optionIds?: string[];
  choices?: Record<string, string[]>;
  repeats?: Record<string, number>;
  targets?: Record<string, string | number | string[]>;
}

export interface FeastOccupationConcreteStateItem {
  item: string;
  id: string;
  quantity: number;
  state?: Record<string, FeastJsonValue>;
  physicalIds?: string[];
}

export interface FeastAutomaticBonusState {
  seat: number;
  boardId: string;
  boardKind: string;
  eventId: string;
  /** Total number of bonus goods produced by this physical board in this
   * Bonus resolution. Replacement cards such as Maid qualify per house, not
   * per flattened reward entry. */
  producerGoodCount: number;
  reward: { kind: 'good' | 'resource' | 'special' | 'building'; id: string; amount: number };
}

export type FeastOccupationDeferredState =
  | { order: number; kind: 'grant-action'; path: string; action: string; parameters?: Record<string, FeastJsonValue> }
  | { order: number; kind: 'phase'; path: string; phase: 'harvest' | 'income' | 'breeding' | 'feast' | 'bonus'; scope: 'self' | 'houses' | 'home-board' }
  | { order: number; kind: 'placement'; path: string; mode: 'gain-direct'; destination: string; target: string | number | string[]; items: FeastOccupationConcreteStateItem[] }
  | { order: number; kind: 'move'; path: string; subject: FeastOccupationConcreteStateItem; from: string; to: string; target: string | number | string[]; parameters?: Record<string, FeastJsonValue> }
  | { order: number; kind: 'return-workers'; path: string; quantity: number; actionSpaceIds: string[]; parameters: Record<string, FeastJsonValue> };

export type FeastContinuation =
  | { kind: 'printed'; actionSpaceId: string; effectIndex: number; resume?: FeastContinuation }
  | {
    kind: 'selected-effects'; seat: number; actionSpaceId: string;
    effects: FeastPrintedEffect[]; resume: FeastContinuation;
  }
  | {
    kind: 'die'; actionSpaceId: string; stage: 'roll' | 'spend' | 'loot';
    rolls: number[]; result: number | null; selectedShips?: string[];
    returnWorkersOnFailure: boolean;
    /** Where an occupation-granted die action returns after it fully resolves. */
    resume: FeastContinuation;
  }
  | { kind: 'occupation-play'; cardIds: string[]; remaining: number; resumeActionSpaceId?: string; resumeEffectIndex?: number }
  | { kind: 'occupation-card-chain'; cardIds: string[]; index: number; printedEffect: boolean; resume: FeastContinuation }
  | { kind: 'occupation-context-chain'; contexts: FeastOccupationContextState[]; index: number; resume: FeastContinuation }
  | { kind: 'finish-action'; seat: number; actionSpaceId: string }
  | { kind: 'finish-printed'; seat: number; actionSpaceId: string }
  | { kind: 'queue-loot'; seat: number; actionSpaceId: string; result: number; resume: FeastContinuation }
  | { kind: 'commit-workers'; seat: number; actionSpaceId: string; imitate: boolean }
  | { kind: 'after-worker-placement'; seat: number; actionSpaceId: string }
  | { kind: 'start-action'; seat: number; actionSpaceId: string }
  | { kind: 'finish-actions-phase' }
  | { kind: 'restore-decision'; decision: FeastPendingDecision }
  | {
    kind: 'restore-action-id'; seat: number; actionId: string | null;
    selectedShipIds: string[]; actionFacts: Record<string, FeastJsonValue>;
    resume: FeastContinuation;
  }
  | { kind: 'after-feast'; seat: number; extra: boolean; resume: FeastContinuation }
  | { kind: 'queue-extra-feast'; seat: number; resume: FeastContinuation }
  | { kind: 'draw-occupation'; seat: number; eventId: string; markTurnEffect: boolean; resume: FeastContinuation }
  | {
    kind: 'bonus-reward-chain'; seat: number; rewards: FeastAutomaticBonusState[];
    index: number; offered: boolean; label: string; resume: FeastContinuation;
  }
  | {
    kind: 'occupation-event'; context: FeastOccupationContextState;
    plans: FeastOccupationPlanKey[]; index: number; requestIndex?: number;
    confirmationResolved?: boolean; selection?: FeastOccupationSelectionState;
    resume: FeastContinuation;
  }
  | {
    kind: 'occupation-deferred'; seat: number; commands: FeastOccupationDeferredState[];
    index: number; resume: FeastContinuation; cardId?: string; clauseId?: string;
    context?: Record<string, FeastJsonValue>; intent?: Record<string, FeastJsonValue>;
  }
  | { kind: 'automatic' }
  | { kind: 'occupation-complete' }
  | { kind: 'setup-occupation' }
  | { kind: 'feast' }
  | { kind: 'none' };

export interface FeastDecisionChoice {
  optionIds?: string[];
  amount?: number;
  accepted?: boolean;
  allocations?: { id: string; amount: number }[];
}

export type FeastLegacyOccupationOperation =
  | { kind: 'acknowledge'; detail: string }
  | { kind: 'resource'; resource: FeastBuildingResource | FeastGood; amount: number }
  | { kind: 'weapon'; weapon: FeastWeapon; amount: number }
  | { kind: 'silver'; amount: number }
  | { kind: 'ship'; ship: FeastShipType; amount: -1 | 1 }
  | { kind: 'ore'; shipId: string | null; amount: number }
  | { kind: 'building'; building: FeastBuildingType; amount: -1 | 1 }
  | { kind: 'board'; boardId: string; mode: 'claim' | 'return' }
  | { kind: 'animal'; animal: 'sheep' | 'cattle'; pregnant: boolean; amount: number }
  | { kind: 'occupation'; mode: 'draw' | 'play' | 'discard'; cardId?: string; amount?: number }
  | { kind: 'placement'; boardId: string; pieceId: string; mode: 'place' | 'return'; x?: number; y?: number; rotation?: 0 | 90 | 180 | 270 }
  | { kind: 'copy-action'; actionSpaceId: string }
  | { kind: 'phase'; phase: 'harvest' | 'income' | 'breeding' | 'feast' | 'bonus'; times: 1 }
  | { kind: 'special'; specialId: string; mode: 'gain' | 'return' }
  | { kind: 'score'; amount: number; reason: string };

export type FeastAction =
  | { type: 'place_workers'; spaceId: string; imitateSpaceId?: string }
  | { type: 'resolve_decision'; decisionId: string; choice: FeastDecisionChoice }
  | { type: 'end_turn' }
  | { type: 'pass' }
  | { type: 'place_tile'; pieceId: string; boardId: string; x: number; y: number; rotation: 0 | 90 | 180 | 270 }
  | { type: 'buy_ship'; ship: FeastShipType }
  | { type: 'place_ore'; shipId: string; amount?: number }
  | { type: 'play_occupation'; cardId: string }
  | { type: 'activate_occupation'; cardId: string }
  | { type: 'use_occupation'; cardId: string; operations: FeastLegacyOccupationOperation[]; note: string }
  | { type: 'feast_place'; pieceId: string; x: number; y: number; rotation: 0 | 90 | 180 | 270 }
  | { type: 'feast_finish' };

export interface FeastScoreBreakdown {
  seat: number;
  ships: number;
  emigrations: number;
  explorations: number;
  buildings: number;
  animals: number;
  occupations: number;
  silver: number;
  finalIncome: number;
  englishCrown: number;
  cardAdjustments: number;
  boardNegatives: number;
  thingPenalties: number;
  total: number;
}

export interface FeastEvent {
  seq: number;
  round: number;
  phase: FeastPhase;
  phaseNumber: number;
  seat: number | null;
  player: string | null;
  title: string;
  detail: string;
  actionSpaceId?: string;
  boardId?: string;
  die?: { sides: number; result: number; roll: number };
}

export interface FeastState {
  schemaVersion: 1;
  game: 'feast';
  edition: 'CLASSIC BASE - 2016';
  seed: number;
  rngCounter: number;
  nextId: number;
  options: FeastOptions;
  phase: FeastPhase;
  phaseNumber: number;
  round: number;
  rounds: 6 | 7;
  firstPlayer: number;
  turn: number;
  lastWorkerSeat: number | null;
  feastCursor: number;
  /** Serializable automatic-phase occupation checkpoint and affected-seat cursor. */
  automaticCheckpoint: string | null;
  automaticSeatCursor: number;
  automaticItems: string[];
  automaticItemCursor: number;
  /** Persisted newborn-animal receipt hooks after the ordinary Breeding phase. */
  automaticBreedingContexts: FeastOccupationContextState[];
  automaticBreedingContextCursor: number;
  automaticBonuses: FeastAutomaticBonusState[];
  automaticBonusCursor: number;
  automaticBonusOffered: boolean;
  /** Persisted phase-10 reward stage. A resumed occupation decision must not
   * offer a replacement twice or apply the physical reward twice. */
  automaticBonusStage: 'offer' | 'apply' | 'receipts';
  /** Receipt hooks derived from the already-applied current Bonus reward. */
  automaticBonusContexts: FeastOccupationContextState[];
  automaticBonusContextCursor: number;
  players: FeastPlayer[];
  actionSpaces: FeastActionSpaceState[];
  workerPlacementHistory: FeastWorkerPlacementRecord[];
  imitationColumns: number[];
  mountains: FeastMountainState[];
  mountainDeck: FeastMountainState[];
  explorations: FeastExplorationSupply[];
  specialSupply: string[];
  buildingSupply: Record<FeastBuildingType, number>;
  occupationDeck: string[];
  occupationDiscard: string[];
  startingOccupationDeck: string[];
  weaponDeck: FeastWeapon[];
  weaponDiscard: FeastWeapon[];
  /** Rulebook replacement tokens issued only when the physical weapon is absent. */
  weaponSubstitutes: Record<FeastWeapon, number>;
  /** Server-owned occupation clause usage; never exposed as a writable client delta. */
  occupationUsage: FeastOccupationUsageStateRecord[];
  occupationReplacements: FeastOccupationReplacementStateRecord[];
  occupationActiveModifiers: FeastOccupationActiveModifierStateRecord[];
  pending: FeastPendingDecision[];
  eventSeq: number;
  lastEvent: FeastEvent | null;
  /** Typed public history used to replay automatic phases on the shared TV. */
  events: FeastEvent[];
  log: string[];
  scores: FeastScoreBreakdown[] | null;
  winners: FeastSeatColor[] | null;
}

export interface FeastPlayerView extends Omit<FeastPlayer, 'occupationHand'> {
  occupationHand?: string[];
  occupationHandCount: number;
}

export interface FeastActionSpaceView extends FeastActionSpaceDefinition {
  /** Current card-modified placement cost; `workers` remains the printed value. */
  effectiveWorkers: number;
  occupants: FeastActionOccupancy[];
  /** Primary printed-space occupant; imitation never replaces this seat. */
  occupiedBy: number | null;
  /** Seats whose enabled four-player extension copied this printed space. */
  imitatedBy: number[];
  legal: boolean;
  reason?: string;
  imitationLegal: boolean;
  imitationReason?: string;
}

export interface FeastPendingView extends Omit<FeastPendingDecision, 'continuation'> {}

export interface FeastView {
  game: 'feast';
  you: number | null;
  edition: FeastState['edition'];
  options: FeastOptions;
  phase: FeastPhase;
  phaseNumber: number;
  round: number;
  rounds: 6 | 7;
  turn: number;
  actingSeat: number | null;
  firstPlayer: number;
  players: FeastPlayerView[];
  actionSpaces: FeastActionSpaceView[];
  imitationColumns: number[];
  mountains: FeastMountainState[];
  explorations: FeastExplorationSupply[];
  specialSupply: string[];
  buildingSupply: Record<FeastBuildingType, number>;
  occupationDeckCount: number;
  occupationDiscardCount: number;
  weaponDeckCount: number;
  weaponDiscard: FeastWeapon[];
  weaponSubstitutes: Record<FeastWeapon, number>;
  pending: FeastPendingView | null;
  eventSeq: number;
  lastEvent: FeastEvent | null;
  events: FeastEvent[];
  scorePreview: FeastScoreBreakdown[];
  scores: FeastScoreBreakdown[] | null;
  winners: FeastSeatColor[] | null;
  log: string[];
}

export interface FeastResult {
  ok: boolean;
  error?: string;
}
