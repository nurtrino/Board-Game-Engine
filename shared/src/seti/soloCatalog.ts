// Official SETI solo-rival catalog and deterministic rule helpers.
//
// Component identity and art cells come from TTS Workshop save 3415673254.
// Rules are transcribed from the English rulebook pp. 22-27, the English
// alien-species sheets, and the official November 2024 FAQ staged under
// client/public/seti. The data in this file is intentionally declarative so
// the reducer and UI can share one source of truth.

export type SetiSoloDifficulty = 1 | 2 | 3 | 4 | 5;
export type SetiRivalArrow = 'left' | 'right';
export type SetiRivalTechType = 'probe' | 'telescope' | 'computer';
export type SetiRivalTraceColor = 'purple' | 'orange' | 'blue';
export type SetiRivalSignalColor = 'yellow' | 'red' | 'blue' | 'black';
export type SetiRivalSpeciesId = 'mascamites' | 'anomalies' | 'oumuamua' | 'centaurians' | 'exertians';
export type SetiRivalBody =
  | 'Earth' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Oumuamua';
export type SetiRivalPlacement = 'moon' | 'orbit' | 'land';
export type SetiRivalTechStackId =
  | 'seti_tech_stack_probe_1' | 'seti_tech_stack_probe_2' | 'seti_tech_stack_probe_3' | 'seti_tech_stack_probe_4'
  | 'seti_tech_stack_telescope_1' | 'seti_tech_stack_telescope_2' | 'seti_tech_stack_telescope_3' | 'seti_tech_stack_telescope_4'
  | 'seti_tech_stack_computer_1' | 'seti_tech_stack_computer_2' | 'seti_tech_stack_computer_3' | 'seti_tech_stack_computer_4';

export type SetiRivalReward =
  | { kind: 'gain'; resource: 'vp' | 'publicity' | 'progress' | 'data'; amount: number }
  | { kind: 'mark-trace'; color: SetiRivalTraceColor | 'any'; amount: number }
  | { kind: 'take-tech'; publicityCost: 0 | 6; progressAfter: 0 | 1 }
  | { kind: 'launch'; publicity: 0 | 1; progress: 0 | 1 };

export interface SetiRivalFlightTarget {
  body: Exclude<SetiRivalBody, 'Earth'>;
  maxMoves: 3 | 4 | 5;
}

export type SetiRivalSignalSource = 'earth-sector' | 'project-row' | 'oumuamua-tile';

export type SetiRivalActionStep =
  | {
      kind: 'analyze';
      requiresFullComputer: true;
      baseVictoryPoints: 0 | 3;
      trace: 'blue';
      computerTech: { discardAtMostOne: true; victoryPoints: 3; progress: 1 };
    }
  | {
      kind: 'launch';
      legalOnlyWithoutProbeOnEarth: true;
      publicity: 0 | 1;
      progress: 0 | 1;
    }
  | {
      kind: 'research-tech';
      publicityCost: 0 | 6;
      progress: 0 | 1;
      rotateSolarSystem: true;
    }
  | {
      kind: 'fly-orbit-land';
      from: 'Earth';
      targets: readonly SetiRivalFlightTarget[];
      leaveAsteroidsCostsExtraMove: 1;
      chooseMaximumPublicityRoute: true;
      moon: 'discard-one-probe-tech-first-if-a-moon-is-open' | 'not-applicable';
      moonTieUsesArrow: true;
      planetPlacementTieOrder: readonly Exclude<SetiRivalPlacement, 'moon'>[];
      revealMascamiteSample: boolean;
    }
  | {
      kind: 'scan';
      signals: readonly SetiRivalSignalSource[];
      projectRowChoicesUseArrow: true;
      replenishProjectRowAfterAllSignals: true;
      telescopeTech: { discardAtMostOne: true; extraProjectRowSignals: 1 };
    }
  | {
      kind: 'replace-for-discovered-species';
      discoveryOrder: 1 | 2;
      removeThisCard: true;
      resolveReplacementImmediately: true;
    }
  | {
      kind: 'anomalies';
      legalOnlyIfNotWinningNextCounterClockwiseAnomaly: true;
      markLowestSpaceOfNextAnomalyColor: true;
      bonusVictoryPoints: 3;
    }
  | {
      kind: 'centaurian-message';
      legalOnlyWithReserveAndNoneOnScoreTrack: true;
      placeAheadOfCurrentScore: 15;
      progress: 1;
    }
  | {
      kind: 'play-exertian';
      legalOnlyIfPlayedPlusDangerTracesBelow: 5;
      randomFaceDownCard: true;
    };

export interface SetiRivalActionArt {
  sheet: '/seti/solo/rival-actions.webp';
  columns: 5;
  rows: 4;
  cell: number;
  column: number;
  row: number;
}

export interface SetiRivalActionCard {
  id: `seti_solo_action_s${string}`;
  printedId: `S.${number}`;
  cardId: number;
  sourceGuid: string;
  group: 'basic' | 'advanced' | 'species';
  species: SetiRivalSpeciesId | null;
  arrow: SetiRivalArrow;
  art: SetiRivalActionArt;
  steps: readonly SetiRivalActionStep[];
}

export type SetiSoloObjectiveEvent =
  | { kind: 'score-reached'; victoryPoints: number }
  | { kind: 'publicity-reached'; publicity: number }
  | { kind: 'data-pool-reached'; dataPool: number }
  | { kind: 'main-action'; action: 'launch' | 'orbit' | 'land' | 'scan' | 'analyze' }
  | { kind: 'research-tech'; technology: SetiRivalTechType }
  | { kind: 'complete-mission' }
  | { kind: 'visit-feature'; feature: 'asteroid' | 'comet' }
  | { kind: 'play-project-for-effect'; printedCreditCost: number }
  | { kind: 'orbit-or-land'; body: SetiRivalBody }
  | { kind: 'win-sector'; color: SetiRivalSignalColor };

export type SetiSoloObjectiveTask =
  | { kind: 'threshold'; stat: 'vp' | 'publicity' | 'data-pool'; atLeast: number; evaluateImmediatelyWhenRevealed: true }
  | { kind: 'main-action'; action: 'launch' | 'orbit' | 'land' | 'scan' | 'analyze' }
  | { kind: 'research-tech'; technology: SetiRivalTechType | 'any' }
  | { kind: 'complete-mission' }
  | { kind: 'visit-feature'; feature: 'asteroid' | 'comet' }
  | { kind: 'play-project-for-effect'; printedCreditCost: 3 }
  | { kind: 'orbit-or-land'; bodies: readonly SetiRivalBody[] }
  | { kind: 'win-sector'; colors: readonly SetiRivalSignalColor[] }
  | { kind: 'either'; options: readonly SetiSoloObjectiveTask[] };

export interface SetiSoloObjective {
  id: `seti_solo_objective_${number}_${string}`;
  printedId: `${1 | 2 | 3}.${string}`;
  tier: 1 | 2 | 3;
  sourceGuid: string;
  art: `/seti/solo/objective-${1 | 2 | 3}-${string}.webp`;
  tasks: readonly SetiSoloObjectiveTask[];
}

export interface SetiRivalProgressNode {
  stackId: SetiRivalTechStackId;
  type: SetiRivalTechType;
  glyph: 'single' | 'infinity' | 'chain' | 'cluster';
}

export interface SetiSoloDifficultySetup {
  difficulty: SetiSoloDifficulty;
  boardArt: '/seti/solo/rival-board-1-2.webp' | `/seti/solo/rival-board-${3 | 4 | 5}.webp`;
  startingActionCards: readonly ['seti_solo_action_s01', 'seti_solo_action_s02', 'seti_solo_action_s03', 'seti_solo_action_s04'];
  randomAdvancedAtSetup: 0 | 1;
  objectiveCounts: Readonly<{ tier1: number; tier2: number; tier3: number }>;
  progressTrack: readonly SetiRivalProgressNode[];
  startingProgressIndex: number;
}

const gain = (resource: Extract<SetiRivalReward, { kind: 'gain' }>['resource'], amount: number): SetiRivalReward => ({ kind: 'gain', resource, amount });
const analyze = (baseVictoryPoints: 0 | 3): SetiRivalActionStep => ({
  kind: 'analyze', requiresFullComputer: true, baseVictoryPoints, trace: 'blue',
  computerTech: { discardAtMostOne: true, victoryPoints: 3, progress: 1 },
});
const launch = (publicity: 0 | 1, progress: 0 | 1): SetiRivalActionStep => ({ kind: 'launch', legalOnlyWithoutProbeOnEarth: true, publicity, progress });
const tech = (publicityCost: 0 | 6, progress: 0 | 1): SetiRivalActionStep => ({ kind: 'research-tech', publicityCost, progress, rotateSolarSystem: true });
const scan = (...signals: SetiRivalSignalSource[]): SetiRivalActionStep => ({
  kind: 'scan', signals, projectRowChoicesUseArrow: true, replenishProjectRowAfterAllSignals: true,
  telescopeTech: { discardAtMostOne: true, extraProjectRowSignals: 1 },
});
const flight = (
  moves: 3 | 4,
  bodies: readonly Exclude<SetiRivalBody, 'Earth'>[],
  planetPlacementTieOrder: readonly Exclude<SetiRivalPlacement, 'moon'>[],
  options: { revealMascamiteSample?: boolean; moon?: 'discard-one-probe-tech-first-if-a-moon-is-open' | 'not-applicable' } = {},
): SetiRivalActionStep => ({
  kind: 'fly-orbit-land', from: 'Earth', targets: bodies.map((body) => ({ body, maxMoves: moves })),
  leaveAsteroidsCostsExtraMove: 1, chooseMaximumPublicityRoute: true,
  moon: options.moon ?? 'discard-one-probe-tech-first-if-a-moon-is-open', moonTieUsesArrow: true,
  planetPlacementTieOrder, revealMascamiteSample: options.revealMascamiteSample ?? false,
});
const art = (cell: number): SetiRivalActionArt => ({
  sheet: '/seti/solo/rival-actions.webp', columns: 5, rows: 4, cell, column: cell % 5, row: Math.floor(cell / 5),
});

function rivalCard(
  number: number,
  cardId: number,
  sourceGuid: string,
  group: SetiRivalActionCard['group'],
  arrow: SetiRivalArrow,
  steps: readonly SetiRivalActionStep[],
  species: SetiRivalSpeciesId | null = null,
): SetiRivalActionCard {
  return {
    id: `seti_solo_action_s${String(number).padStart(2, '0')}`,
    printedId: `S.${number}`,
    cardId,
    sourceGuid,
    group,
    species,
    arrow,
    art: art(cardId % 100),
    steps,
  } as SetiRivalActionCard;
}

export const SETI_RIVAL_ACTION_CARDS: readonly SetiRivalActionCard[] = [
  rivalCard(1, 42500, '1c87b4', 'basic', 'left', [
    analyze(0),
    launch(1, 0),
    tech(6, 0),
    flight(3, ['Saturn', 'Mars', 'Jupiter', 'Venus'], ['orbit', 'land']),
  ]),
  rivalCard(2, 42501, '2d6337', 'basic', 'right', [
    analyze(0),
    tech(6, 0),
    scan('earth-sector', 'project-row', 'project-row'),
  ]),
  rivalCard(3, 42502, 'ecb5ee', 'basic', 'left', [
    { kind: 'replace-for-discovered-species', discoveryOrder: 1, removeThisCard: true, resolveReplacementImmediately: true },
    tech(6, 0),
    scan('earth-sector', 'project-row', 'project-row'),
  ]),
  rivalCard(4, 42503, '6cf391', 'basic', 'right', [
    { kind: 'replace-for-discovered-species', discoveryOrder: 2, removeThisCard: true, resolveReplacementImmediately: true },
    flight(3, ['Jupiter', 'Mars', 'Saturn', 'Venus'], ['land', 'orbit']),
    tech(0, 1),
  ]),
  rivalCard(5, 42504, '766542', 'advanced', 'left', [
    analyze(3),
    tech(6, 1),
    scan('earth-sector', 'earth-sector', 'project-row'),
  ]),
  rivalCard(6, 42505, '81e3fe', 'advanced', 'left', [
    tech(6, 1),
    launch(1, 1),
    scan('earth-sector', 'earth-sector', 'project-row'),
  ]),
  rivalCard(7, 42506, 'ffa93a', 'advanced', 'right', [
    tech(6, 1),
    flight(4, ['Neptune', 'Saturn', 'Mercury', 'Venus'], ['land', 'orbit']),
    scan('earth-sector', 'earth-sector', 'project-row'),
  ]),
  rivalCard(8, 42507, '414259', 'advanced', 'left', [
    analyze(3),
    flight(4, ['Uranus', 'Jupiter', 'Mercury', 'Venus'], ['land', 'orbit']),
    scan('earth-sector', 'earth-sector', 'project-row'),
  ]),
  rivalCard(9, 42508, '2080ca', 'advanced', 'right', [
    analyze(3),
    launch(1, 1),
    flight(4, ['Neptune', 'Uranus', 'Mercury', 'Venus'], ['orbit', 'land']),
  ]),
  rivalCard(10, 42509, '406f53', 'advanced', 'right', [
    analyze(3),
    launch(1, 1),
    scan('earth-sector', 'earth-sector', 'project-row'),
  ]),
  rivalCard(11, 42510, 'c2cfe7', 'advanced', 'right', [
    tech(6, 1),
    analyze(3),
    scan('earth-sector', 'earth-sector', 'project-row'),
  ]),
  rivalCard(12, 42511, '9aabd5', 'advanced', 'left', [
    tech(6, 1),
    launch(1, 1),
    flight(4, ['Mercury', 'Saturn', 'Jupiter', 'Venus'], ['land', 'orbit']),
  ]),
  rivalCard(13, 42512, '3541b9', 'advanced', 'left', [
    flight(4, ['Neptune', 'Uranus', 'Mars', 'Venus'], ['land', 'orbit']),
    analyze(3),
    scan('earth-sector', 'earth-sector', 'project-row'),
  ]),
  rivalCard(14, 42513, 'c9fae8', 'advanced', 'right', [
    launch(1, 1),
    tech(6, 1),
    scan('earth-sector', 'earth-sector', 'project-row'),
  ]),
  rivalCard(15, 42514, '9975ec', 'species', 'right', [
    launch(1, 0),
    {
      kind: 'fly-orbit-land', from: 'Earth',
      targets: [{ body: 'Saturn', maxMoves: 4 }, { body: 'Jupiter', maxMoves: 5 }],
      leaveAsteroidsCostsExtraMove: 1, chooseMaximumPublicityRoute: true,
      moon: 'discard-one-probe-tech-first-if-a-moon-is-open', moonTieUsesArrow: true,
      planetPlacementTieOrder: ['land'], revealMascamiteSample: true,
    },
  ], 'mascamites'),
  rivalCard(16, 42515, '3e49ed', 'species', 'left', [
    {
      kind: 'anomalies', legalOnlyIfNotWinningNextCounterClockwiseAnomaly: true,
      markLowestSpaceOfNextAnomalyColor: true, bonusVictoryPoints: 3,
    },
    tech(0, 1),
  ], 'anomalies'),
  rivalCard(17, 42516, '5116c5', 'species', 'left', [
    flight(4, ['Oumuamua'], ['land', 'orbit'], { moon: 'not-applicable' }),
    scan('earth-sector', 'project-row', 'oumuamua-tile'),
  ], 'oumuamua'),
  rivalCard(18, 42517, '1eec4c', 'species', 'right', [
    {
      kind: 'centaurian-message', legalOnlyWithReserveAndNoneOnScoreTrack: true,
      placeAheadOfCurrentScore: 15, progress: 1,
    },
    scan('earth-sector', 'project-row', 'project-row'),
  ], 'centaurians'),
  rivalCard(19, 42518, '0e95c1', 'species', 'right', [
    { kind: 'play-exertian', legalOnlyIfPlayedPlusDangerTracesBelow: 5, randomFaceDownCard: true },
    scan('earth-sector', 'project-row', 'project-row'),
  ], 'exertians'),
] as const;

export const SETI_RIVAL_ACTION_BY_ID: Readonly<Record<string, SetiRivalActionCard>> = Object.fromEntries(
  SETI_RIVAL_ACTION_CARDS.map((card) => [card.id, card]),
);
export const SETI_RIVAL_ACTION_BY_CARD_ID: Readonly<Record<number, SetiRivalActionCard>> = Object.fromEntries(
  SETI_RIVAL_ACTION_CARDS.map((card) => [card.cardId, card]),
);
export const SETI_RIVAL_SPECIES_ACTION: Readonly<Record<SetiRivalSpeciesId, SetiRivalActionCard>> = Object.fromEntries(
  SETI_RIVAL_ACTION_CARDS.filter((card): card is SetiRivalActionCard & { species: SetiRivalSpeciesId } => card.species !== null)
    .map((card) => [card.species, card]),
) as Readonly<Record<SetiRivalSpeciesId, SetiRivalActionCard>>;

const threshold = (stat: 'vp' | 'publicity' | 'data-pool', atLeast: number): SetiSoloObjectiveTask => ({
  kind: 'threshold', stat, atLeast, evaluateImmediatelyWhenRevealed: true,
});
const mainAction = (action: Extract<SetiSoloObjectiveTask, { kind: 'main-action' }>['action']): SetiSoloObjectiveTask => ({ kind: 'main-action', action });
const research = (technology: SetiRivalTechType | 'any'): SetiSoloObjectiveTask => ({ kind: 'research-tech', technology });
const mission = (): SetiSoloObjectiveTask => ({ kind: 'complete-mission' });
const visit = (feature: 'asteroid' | 'comet'): SetiSoloObjectiveTask => ({ kind: 'visit-feature', feature });
const bodies = (...entries: SetiRivalBody[]): SetiSoloObjectiveTask => ({ kind: 'orbit-or-land', bodies: entries });
const sectors = (...colors: SetiRivalSignalColor[]): SetiSoloObjectiveTask => ({ kind: 'win-sector', colors });
const either = (...options: SetiSoloObjectiveTask[]): SetiSoloObjectiveTask => ({ kind: 'either', options });

function objective(
  tier: 1 | 2 | 3,
  number: number,
  sourceGuid: string,
  tasks: readonly SetiSoloObjectiveTask[],
): SetiSoloObjective {
  const suffix = String(number).padStart(2, '0');
  return {
    id: `seti_solo_objective_${tier}_${suffix}`,
    printedId: `${tier}.${suffix}`,
    tier,
    sourceGuid,
    art: `/seti/solo/objective-${tier}-${suffix}.webp`,
    tasks,
  } as SetiSoloObjective;
}

export const SETI_SOLO_OBJECTIVES: readonly SetiSoloObjective[] = [
  objective(1, 1, 'fb4473', [threshold('publicity', 8)]),
  objective(1, 2, 'fc64a9', [threshold('vp', 16)]),
  objective(1, 3, '33cf54', [either(mainAction('land'), mission())]),
  objective(1, 4, 'e7119e', [threshold('data-pool', 5)]),

  objective(2, 1, 'b9d855', [bodies('Jupiter', 'Saturn')]),
  objective(2, 2, '7d01f3', [research('probe'), mission()]),
  objective(2, 3, 'a762a5', [research('computer'), mainAction('analyze')]),
  objective(2, 4, '99382a', [visit('asteroid'), mainAction('analyze')]),
  objective(2, 5, '86b80e', [sectors('blue', 'red')]),
  objective(2, 6, 'd9cd41', [research('telescope'), mission()]),
  objective(2, 7, '784c54', [visit('comet'), { kind: 'play-project-for-effect', printedCreditCost: 3 }]),
  objective(2, 8, '64fab9', [bodies('Venus', 'Mercury')]),
  objective(2, 9, 'd6d957', [sectors('red', 'yellow')]),
  objective(2, 10, 'bb16b6', [bodies('Mars', 'Uranus', 'Neptune')]),
  objective(2, 11, '3d4c6d', [sectors('yellow', 'blue')]),

  objective(3, 1, '11e725', [mainAction('scan'), mainAction('scan')]),
  objective(3, 2, 'df4e8a', [research('telescope'), sectors('black')]),
  objective(3, 3, '9dcfcd', [mainAction('orbit')]),
  objective(3, 4, '4e23a6', [mainAction('analyze'), mainAction('analyze')]),
  objective(3, 5, '8b964e', [mainAction('analyze'), mainAction('launch'), mainAction('scan')]),
  objective(3, 6, '9c0920', [research('probe'), mainAction('land')]),
  objective(3, 7, '81667c', [research('computer'), research('any')]),
  objective(3, 8, '654cfa', [mainAction('launch'), threshold('publicity', 9)]),
  objective(3, 9, '6f1e6c', [sectors('black')]),
] as const;

export const SETI_SOLO_OBJECTIVE_BY_ID: Readonly<Record<string, SetiSoloObjective>> = Object.fromEntries(
  SETI_SOLO_OBJECTIVES.map((entry) => [entry.id, entry]),
);

const PROBE_TRACK: readonly SetiRivalProgressNode[] = [
  { stackId: 'seti_tech_stack_probe_1', type: 'probe', glyph: 'single' },
  { stackId: 'seti_tech_stack_probe_2', type: 'probe', glyph: 'infinity' },
  { stackId: 'seti_tech_stack_probe_3', type: 'probe', glyph: 'chain' },
  { stackId: 'seti_tech_stack_probe_4', type: 'probe', glyph: 'cluster' },
];
const TELESCOPE_TRACK: readonly SetiRivalProgressNode[] = [
  { stackId: 'seti_tech_stack_telescope_1', type: 'telescope', glyph: 'single' },
  { stackId: 'seti_tech_stack_telescope_3', type: 'telescope', glyph: 'infinity' },
  { stackId: 'seti_tech_stack_telescope_2', type: 'telescope', glyph: 'chain' },
  { stackId: 'seti_tech_stack_telescope_4', type: 'telescope', glyph: 'cluster' },
];
const COMPUTER_TRACK: readonly SetiRivalProgressNode[] = [
  { stackId: 'seti_tech_stack_computer_1', type: 'computer', glyph: 'single' },
  { stackId: 'seti_tech_stack_computer_2', type: 'computer', glyph: 'infinity' },
  { stackId: 'seti_tech_stack_computer_3', type: 'computer', glyph: 'chain' },
  { stackId: 'seti_tech_stack_computer_4', type: 'computer', glyph: 'cluster' },
];
const BASIC_ACTIONS = [
  'seti_solo_action_s01', 'seti_solo_action_s02', 'seti_solo_action_s03', 'seti_solo_action_s04',
] as const;

export const SETI_SOLO_DIFFICULTIES: readonly SetiSoloDifficultySetup[] = [
  {
    difficulty: 1, boardArt: '/seti/solo/rival-board-1-2.webp', startingActionCards: BASIC_ACTIONS,
    randomAdvancedAtSetup: 0, objectiveCounts: { tier1: 0, tier2: 0, tier3: 0 },
    progressTrack: [...COMPUTER_TRACK, ...TELESCOPE_TRACK, ...PROBE_TRACK], startingProgressIndex: 0,
  },
  {
    difficulty: 2, boardArt: '/seti/solo/rival-board-1-2.webp', startingActionCards: BASIC_ACTIONS,
    randomAdvancedAtSetup: 0, objectiveCounts: { tier1: 2, tier2: 3, tier3: 5 },
    progressTrack: [...COMPUTER_TRACK, ...TELESCOPE_TRACK, ...PROBE_TRACK], startingProgressIndex: 0,
  },
  {
    difficulty: 3, boardArt: '/seti/solo/rival-board-3.webp', startingActionCards: BASIC_ACTIONS,
    randomAdvancedAtSetup: 1, objectiveCounts: { tier1: 2, tier2: 4, tier3: 6 },
    progressTrack: [...TELESCOPE_TRACK, ...PROBE_TRACK, ...COMPUTER_TRACK], startingProgressIndex: 0,
  },
  {
    difficulty: 4, boardArt: '/seti/solo/rival-board-4.webp', startingActionCards: BASIC_ACTIONS,
    randomAdvancedAtSetup: 1, objectiveCounts: { tier1: 2, tier2: 6, tier3: 7 },
    progressTrack: [...COMPUTER_TRACK, ...TELESCOPE_TRACK, ...PROBE_TRACK], startingProgressIndex: 3,
  },
  {
    difficulty: 5, boardArt: '/seti/solo/rival-board-5.webp', startingActionCards: BASIC_ACTIONS,
    randomAdvancedAtSetup: 1, objectiveCounts: { tier1: 2, tier2: 7, tier3: 8 },
    progressTrack: [...PROBE_TRACK, ...COMPUTER_TRACK, ...TELESCOPE_TRACK], startingProgressIndex: 8,
  },
] as const;

export const SETI_SOLO_DIFFICULTY_BY_LEVEL: Readonly<Record<SetiSoloDifficulty, SetiSoloDifficultySetup>> = Object.fromEntries(
  SETI_SOLO_DIFFICULTIES.map((entry) => [entry.difficulty, entry]),
) as Readonly<Record<SetiSoloDifficulty, SetiSoloDifficultySetup>>;

export const SETI_RIVAL_SETUP_RULES = {
  useOrdinaryTwoPlayerSetup: true,
  roundEndProjectCardsPerRound: 3,
  neutralMarkersAtTwentyAndThirty: 2,
  randomStartingPlayer: true,
  startingVictoryPoints: { first: 1, second: 2 },
  startingPublicity: 4,
  rivalStartingIncomeCard: false,
  rivalStartingCredits: 0,
  rivalStartingEnergy: 0,
  startingPlayerMarkerAlternatesEveryRound: true,
  basicActionCards: BASIC_ACTIONS,
  advancedActionCards: SETI_RIVAL_ACTION_CARDS.filter((card) => card.group === 'advanced').map((card) => card.id),
  speciesActionCards: SETI_RIVAL_ACTION_CARDS.filter((card) => card.group === 'species').map((card) => card.id),
  actionDeckSetup: 'shuffle-basic-plus-optional-random-advanced',
  objectiveSetup: {
    shuffleTiersSeparately: true,
    stackOrderTopToBottom: [1, 2, 3] as const,
    reveal: 3,
    difficultyOneHasNoObjectives: true,
  },
} as const;

export const SETI_RIVAL_RESOURCE_RULES = {
  creditEnergyOrProjectCardToProgress: 1,
  incomeIncreaseToProgress: 4,
  cardFromPassingCounts: true,
  cardFromAlienDiscoveryCounts: true,
  noRoundIncome: true,
  publicityCap: 10,
  dataPoolLimit: null,
} as const;

export const SETI_RIVAL_COMPUTER_RULES = {
  spaces: 6,
  fillOrder: 'left-to-right',
  rewards: [null, gain('publicity', 1), null, gain('progress', 4), null, null] as const,
  gainedDataFillsComputerBeforeUnlimitedPool: true,
  analyzeRequiresFullComputer: true,
  analyzeClearsComputerOnly: true,
  analyzeAlwaysMarksBlueTrace: true,
  afterAnalyzeRefillFromPoolImmediately: true,
  refillRewardsResolveAsCovered: true,
} as const;

export const SETI_RIVAL_TECH_RULES = {
  normalPersistentAbilitiesIgnored: true,
  storedByType: true,
  selection: 'preferred-progress-stack-then-clockwise',
  preferStacksWithFirstTakeTwoPointBonus: true,
  ifNoTwoPointBonusSelectFirstAvailableClockwise: true,
  gainPrintedImmediateReward: true,
  gainFirstTakeTwoPointBonus: true,
  ignoredImmediateRewards: [
    { kind: 'mark-trace', color: 'orange', amount: 1 },
    { kind: 'gain', resource: 'data', amount: 2 },
  ] as const,
  rotateSolarSystemWheneverTechGained: true,
  consumableBonuses: {
    probe: 'discard-one-to-prioritize-an-open-moon',
    telescope: 'discard-one-to-mark-one-extra-project-row-signal',
    computer: 'discard-at-most-one-after-analyze-for-three-vp-and-one-progress',
  },
} as const;

export const SETI_RIVAL_SIGNAL_RULES = {
  cardRowChoiceUsesDecisionArrow: true,
  replaceCardRowAfterAllSignals: true,
  sectorPriority: ['would-win-sector', 'would-score-second-signal-vp', 'most-rival-markers', 'largest-capacity'] as const,
  largestCapacityBreaksEachPriorityTie: true,
  normalSignalsNeverUseOumuamuaTile: true,
  specialOumuamuaSignalAlwaysUsesTile: true,
  telescopeActionIsAlwaysLegal: true,
} as const;

export const SETI_RIVAL_TRACE_RULES = {
  compareMatchingColumnsAcrossBothSpecies: true,
  universalTraceConsidersAllColumns: true,
  chooseLowestAvailableSpace: true,
  ignoreOverflowUnlessAllOtherEligibleSpacesAreFull: true,
  equalHeightTieUsesDecisionArrow: true,
  gainMarkedSpaceReward: true,
} as const;

export const SETI_RIVAL_SCORE_AND_MILESTONE_RULES = {
  scoreAllOrdinaryRewards: true,
  triggerNeutralMilestones: true,
  triggerGoldMilestones: true,
  goldClaimOnlyFirstMostValuableSpace: true,
  goldTileTieUsesDecisionArrow: true,
  noGoldClaimIfEveryFirstSpaceOccupied: true,
  neverScoreGoldTilesAtGameEnd: true,
} as const;

export const SETI_RIVAL_PASS_RULES = {
  passWhenTurnStartsWithEmptyActionDeck: true,
  shufflePlayedCardsForNextRoundImmediately: true,
  takeOneRoundEndProjectCard: true,
  roundEndCardConvertsToProgress: 1,
  rotateSolarSystemIfFirstToPass: true,
  rivalNeverKeepsTheRoundEndProjectCard: true,
} as const;

export const SETI_SOLO_OBJECTIVE_RULES = {
  activeCount: 3,
  oneTaskAcrossAllObjectivesPerSingleTrigger: true,
  objectiveAndTriggerableMissionMayBothMarkFromSameTrigger: true,
  replaceCompletedAtEndOfHumanTurn: true,
  replacementContinuesUntilNoCompletedObjectiveOrStackEmpty: true,
  roundSpend: { 1: 1, 2: 2, 3: 3, 4: 4 } as const,
  missingCompletedObjectiveProgress: 3,
  finalVictoryPointsPerIncompleteObjective: 5,
  incompleteIncludesActiveAndStack: true,
  difficultyOneIgnoresAllObjectiveRules: true,
} as const;

export const SETI_SOLO_END_GAME_RULES = {
  rounds: 5,
  humanScoresNormally: true,
  rivalScoresGoldTiles: false,
  rivalIncompleteObjectiveVictoryPoints: 5,
  rivalPlayedExertianCardsAlwaysFulfilled: true,
  exertianDangerPenaltyAfterAllOtherScoring: true,
  exertianDangerPenalty: 'floor-one-tenth-own-final-score',
  tiedMostDangerAllPenalized: true,
  humanMustStrictlyOutscoreRival: true,
  tieWinner: 'rival',
} as const;

export interface SetiRivalStepContext {
  computerFull: boolean;
  publicity: number;
  probeOnEarth: boolean;
  minimumMovesToBody: Partial<Record<Exclude<SetiRivalBody, 'Earth'>, number>>;
  availableTechnologyStacks: number;
  discoveredSpeciesInOrder: readonly SetiRivalSpeciesId[];
  nextAnomalyWonByRival: boolean;
  centaurianMessagesInReserve: number;
  centaurianMessagesOnScoreTrack: number;
  rivalPlayedExertians: number;
  rivalDangerTraceMarkers: number;
}

export function isSetiRivalStepLegal(step: SetiRivalActionStep, context: SetiRivalStepContext): boolean {
  switch (step.kind) {
    case 'analyze': return context.computerFull;
    case 'launch': return !context.probeOnEarth;
    case 'research-tech': return context.availableTechnologyStacks > 0 && context.publicity >= step.publicityCost;
    case 'fly-orbit-land': return context.probeOnEarth && step.targets.some((target) => {
      const distance = context.minimumMovesToBody[target.body];
      return distance !== undefined && distance <= target.maxMoves;
    });
    case 'scan': return true;
    case 'replace-for-discovered-species': return context.discoveredSpeciesInOrder.length >= step.discoveryOrder;
    case 'anomalies': return !context.nextAnomalyWonByRival;
    case 'centaurian-message': return context.centaurianMessagesInReserve > 0 && context.centaurianMessagesOnScoreTrack === 0;
    case 'play-exertian': return context.rivalPlayedExertians + context.rivalDangerTraceMarkers < step.legalOnlyIfPlayedPlusDangerTracesBelow;
  }
}

export function selectSetiRivalActionStep(
  card: SetiRivalActionCard,
  context: SetiRivalStepContext,
): { index: number; step: SetiRivalActionStep } | null {
  const index = card.steps.findIndex((step) => isSetiRivalStepLegal(step, context));
  return index < 0 ? null : { index, step: card.steps[index] };
}

export interface SetiRivalSectorCandidate {
  id: string;
  wouldWin: boolean;
  wouldScoreSecondSignal: boolean;
  rivalMarkers: number;
  capacity: number;
  boardOrder: number;
}

export function chooseSetiRivalSector(candidates: readonly SetiRivalSectorCandidate[]): SetiRivalSectorCandidate | null {
  return [...candidates].sort((left, right) =>
    Number(right.wouldWin) - Number(left.wouldWin)
    || Number(right.wouldScoreSecondSignal) - Number(left.wouldScoreSecondSignal)
    || right.rivalMarkers - left.rivalMarkers
    || right.capacity - left.capacity
    || left.boardOrder - right.boardOrder,
  )[0] ?? null;
}

export interface SetiRivalTechStackAvailability {
  id: SetiRivalTechStackId;
  tiles: number;
  firstTakeBonusAvailable: boolean;
}

export function chooseSetiRivalTechStack(
  setup: SetiSoloDifficultySetup,
  progressIndex: number,
  stacks: readonly SetiRivalTechStackAvailability[],
): SetiRivalTechStackId | null {
  const byId = new Map(stacks.map((stack) => [stack.id, stack]));
  const ordered = Array.from({ length: setup.progressTrack.length }, (_, offset) =>
    setup.progressTrack[(progressIndex + offset + setup.progressTrack.length) % setup.progressTrack.length],
  );
  const withBonus = ordered.find((node) => {
    const stack = byId.get(node.stackId);
    return !!stack && stack.tiles > 0 && stack.firstTakeBonusAvailable;
  });
  if (withBonus) return withBonus.stackId;
  return ordered.find((node) => (byId.get(node.stackId)?.tiles ?? 0) > 0)?.stackId ?? null;
}

export interface SetiRivalProgressResult {
  index: number;
  strengthCardsGained: number;
  preferredStackId: SetiRivalTechStackId;
}

export function advanceSetiRivalProgress(
  setup: SetiSoloDifficultySetup,
  progressIndex: number,
  spaces: number,
): SetiRivalProgressResult {
  if (!Number.isInteger(spaces) || spaces < 0) throw new Error('Rival progress must be a non-negative integer');
  const length = setup.progressTrack.length;
  const normalized = ((progressIndex % length) + length) % length;
  const absolute = normalized + spaces;
  const index = absolute % length;
  return {
    index,
    strengthCardsGained: Math.floor(absolute / length),
    preferredStackId: setup.progressTrack[index].stackId,
  };
}

export interface SetiRivalComputerState {
  spaces: readonly boolean[];
  dataPool: number;
}

export interface SetiRivalComputerPlacementResult {
  spaces: boolean[];
  dataPool: number;
  publicity: number;
  progress: number;
  placed: number;
}

export function placeSetiRivalData(
  state: SetiRivalComputerState,
  amount: number,
): SetiRivalComputerPlacementResult {
  if (state.spaces.length !== SETI_RIVAL_COMPUTER_RULES.spaces) throw new Error('Rival computer must have six spaces');
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Rival data gain must be a non-negative integer');
  const spaces = [...state.spaces];
  let dataPool = state.dataPool;
  let publicity = 0;
  let progress = 0;
  let placed = 0;
  for (let token = 0; token < amount; token++) {
    const index = spaces.findIndex((filled) => !filled);
    if (index < 0) {
      dataPool++;
      continue;
    }
    spaces[index] = true;
    placed++;
    const reward = SETI_RIVAL_COMPUTER_RULES.rewards[index];
    if (reward?.kind === 'gain' && reward.resource === 'publicity') publicity += reward.amount;
    if (reward?.kind === 'gain' && reward.resource === 'progress') progress += reward.amount;
  }
  return { spaces, dataPool, publicity, progress, placed };
}

export function refillSetiRivalComputerFromPool(state: SetiRivalComputerState): SetiRivalComputerPlacementResult {
  const open = state.spaces.filter((filled) => !filled).length;
  const moved = Math.min(open, state.dataPool);
  const result = placeSetiRivalData({ spaces: state.spaces, dataPool: state.dataPool - moved }, moved);
  return result;
}

export interface SetiSoloObjectiveStats {
  vp: number;
  publicity: number;
  dataPool: number;
}

export function setiSoloTaskMatchesEvent(
  task: SetiSoloObjectiveTask,
  event: SetiSoloObjectiveEvent,
): boolean {
  switch (task.kind) {
    case 'threshold':
      if (task.stat === 'vp') return event.kind === 'score-reached' && event.victoryPoints >= task.atLeast;
      if (task.stat === 'publicity') return event.kind === 'publicity-reached' && event.publicity >= task.atLeast;
      return event.kind === 'data-pool-reached' && event.dataPool >= task.atLeast;
    case 'main-action': return event.kind === 'main-action' && event.action === task.action;
    case 'research-tech': return event.kind === 'research-tech' && (task.technology === 'any' || event.technology === task.technology);
    case 'complete-mission': return event.kind === 'complete-mission';
    case 'visit-feature': return event.kind === 'visit-feature' && event.feature === task.feature;
    case 'play-project-for-effect': return event.kind === 'play-project-for-effect' && event.printedCreditCost === task.printedCreditCost;
    case 'orbit-or-land': return event.kind === 'orbit-or-land' && task.bodies.includes(event.body);
    case 'win-sector': return event.kind === 'win-sector' && task.colors.includes(event.color);
    case 'either': return task.options.some((option) => setiSoloTaskMatchesEvent(option, event));
  }
}

export function setiSoloThresholdSatisfied(task: SetiSoloObjectiveTask, stats: SetiSoloObjectiveStats): boolean {
  if (task.kind === 'either') return task.options.some((option) => setiSoloThresholdSatisfied(option, stats));
  if (task.kind !== 'threshold') return false;
  if (task.stat === 'vp') return stats.vp >= task.atLeast;
  if (task.stat === 'publicity') return stats.publicity >= task.atLeast;
  return stats.dataPool >= task.atLeast;
}

export interface SetiSoloObjectiveProgress {
  objectiveId: string;
  marked: readonly boolean[];
}

export interface SetiSoloObjectiveCandidate {
  objectiveId: string;
  taskIndex: number;
}

export function getSetiSoloObjectiveCandidates(
  active: readonly SetiSoloObjectiveProgress[],
  event: SetiSoloObjectiveEvent,
): SetiSoloObjectiveCandidate[] {
  const candidates: SetiSoloObjectiveCandidate[] = [];
  for (const progress of active) {
    const objectiveDefinition = SETI_SOLO_OBJECTIVE_BY_ID[progress.objectiveId];
    if (!objectiveDefinition) continue;
    objectiveDefinition.tasks.forEach((task, taskIndex) => {
      if (!progress.marked[taskIndex] && setiSoloTaskMatchesEvent(task, event)) {
        candidates.push({ objectiveId: progress.objectiveId, taskIndex });
      }
    });
  }
  return candidates;
}

export function setiSoloRoundObjectivePenalty(round: 1 | 2 | 3 | 4, completedAvailable: number): {
  spent: number;
  missing: number;
  rivalProgress: number;
} {
  const required = SETI_SOLO_OBJECTIVE_RULES.roundSpend[round];
  const spent = Math.min(required, Math.max(0, completedAvailable));
  const missing = required - spent;
  return { spent, missing, rivalProgress: missing * SETI_SOLO_OBJECTIVE_RULES.missingCompletedObjectiveProgress };
}

export function setiSoloFinalObjectiveScore(active: number, stack: number, difficulty: SetiSoloDifficulty): number {
  if (difficulty === 1) return 0;
  return (Math.max(0, active) + Math.max(0, stack)) * SETI_SOLO_OBJECTIVE_RULES.finalVictoryPointsPerIncompleteObjective;
}

export function setiSoloHumanWins(humanFinalScore: number, rivalFinalScore: number): boolean {
  return humanFinalScore > rivalFinalScore;
}

// Catalog integrity assertions deliberately fail at module load. A missing
// component or placeholder must never silently produce a playable solo game.
if (SETI_RIVAL_ACTION_CARDS.length !== 19) throw new Error('SETI solo must contain 19 rival action cards');
if (SETI_SOLO_OBJECTIVES.length !== 24) throw new Error('SETI solo must contain 24 objectives');
if (SETI_SOLO_DIFFICULTIES.length !== 5) throw new Error('SETI solo must contain five difficulty setups');
if (new Set(SETI_RIVAL_ACTION_CARDS.map((card) => card.id)).size !== 19) throw new Error('Duplicate SETI rival action id');
if (new Set(SETI_RIVAL_ACTION_CARDS.map((card) => card.cardId)).size !== 19) throw new Error('Duplicate SETI rival CardID');
if (new Set(SETI_RIVAL_ACTION_CARDS.map((card) => card.sourceGuid)).size !== 19) throw new Error('Duplicate SETI rival source GUID');
if (new Set(SETI_SOLO_OBJECTIVES.map((objectiveDefinition) => objectiveDefinition.id)).size !== 24) throw new Error('Duplicate SETI objective id');
if (new Set(SETI_SOLO_OBJECTIVES.map((objectiveDefinition) => objectiveDefinition.sourceGuid)).size !== 24) throw new Error('Duplicate SETI objective source GUID');
if (SETI_RIVAL_ACTION_CARDS.some((card) => !card.steps.length)) throw new Error('Every SETI rival card needs an action flow');
if (SETI_SOLO_OBJECTIVES.some((objectiveDefinition) => !objectiveDefinition.tasks.length)) throw new Error('Every SETI objective needs a task');
if (/untranscribed|placeholder|todo|tbd/i.test(JSON.stringify({
  actions: SETI_RIVAL_ACTION_CARDS,
  objectives: SETI_SOLO_OBJECTIVES,
  difficulties: SETI_SOLO_DIFFICULTIES,
}))) throw new Error('SETI solo catalog contains an incomplete transcription');
