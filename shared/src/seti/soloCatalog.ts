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
