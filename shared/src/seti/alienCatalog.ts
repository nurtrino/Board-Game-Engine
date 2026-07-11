// SETI alien-species catalog.
//
// Printed identity and card order come from the English deck sheets in TTS
// Workshop save 3415673254. Rules semantics are transcribed from the English
// rulebook, alien-species sheets, and the November 2024 official FAQ staged at
// client/public/seti. Card cells are row-major, five cards per row.

export type SetiAlienSpeciesId = 'mascamites' | 'anomalies' | 'oumuamua' | 'centaurians' | 'exertians';
export type SetiAlienTraceColor = 'purple' | 'orange' | 'blue';
export type SetiAlienSignalColor = 'yellow' | 'red' | 'blue' | 'black';
export type SetiAlienTechType = 'probe' | 'telescope' | 'computer' | 'any';
export type SetiAlienIncome = 'credit' | 'energy' | 'card' | 'publicity' | 'data';
export type SetiAlienBody =
  | 'Earth' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Oumuamua'
  | 'Phobos' | 'Deimos' | 'Callisto' | 'Ganymede' | 'Europa' | 'Enceladus' | 'Titan' | 'Titania' | 'Triton';

export type SetiAlienReward =
  | { kind: 'gain'; resource: 'vp' | 'credit' | 'energy' | 'publicity' | 'data' | 'exofossil' | 'movement'; amount: number }
  | { kind: 'draw-project'; amount: number; source: 'deck' | 'row' | 'row-or-deck' }
  | { kind: 'mark-trace'; color: SetiAlienTraceColor | 'any'; species: 'this' }
  | { kind: 'mark-signal'; amount: number; location: 'any-sector' | 'one-chosen-sector' | 'oumuamua-sector' | 'oumuamua-tile' | 'next-anomaly-sector'; color?: SetiAlienSignalColor }
  | { kind: 'take-tech'; technology: SetiAlienTechType }
  | { kind: 'rotate-solar-system' }
  | { kind: 'tuck-income'; amount: number }
  | { kind: 'resolve-mascamite-sample'; multiplier: number }
  | { kind: 'draw-alien-card'; species: SetiAlienSpeciesId; amount: number; choice: 'face-up-or-deck' };

export type SetiAlienCondition =
  | { kind: 'trace-count'; species: 'this' | 'other'; atLeast: number; color: SetiAlienTraceColor | 'any' | 'same' }
  | { kind: 'trace-set'; species: 'this'; colors: readonly SetiAlienTraceColor[] }
  | { kind: 'exofossils-held'; atLeast: number }
  | { kind: 'lander-at'; body: 'Oumuamua' }
  | { kind: 'signal-count'; location: 'oumuamua-tile'; atLeast: number }
  | { kind: 'paid-oumuamua-space'; acceptedCosts: readonly number[] }
  | { kind: 'event'; event: 'mark-any-trace' | 'research-any-tech' }
  | { kind: 'prior-action-result'; result: 'marked-oumuamua-signal' | 'visited-oumuamua' | 'landed-oumuamua' | 'landed-in-anomaly-sector' };

export type SetiAlienEffect =
  | SetiAlienReward
  | { kind: 'main-action'; action: 'land' | 'orbit-or-land' | 'scan'; baseCost: 'waived'; allowedBodies?: 'planet' | 'planet-or-moon' | 'oumuamua'; ignoreRequiredTech?: boolean }
  | { kind: 'move'; amount: number; probePublicity: 'normal' | 'suppressed-for-turn' }
  | { kind: 'collect-mascamite-sample'; location: 'landed-body' | 'planet-with-your-probe'; takeToken: boolean; gainReward: boolean; returnToken: boolean }
  | { kind: 'inspect-mascamite-samples'; bodyChoice: readonly ['Jupiter', 'Saturn']; takeToken: false; gainReward: true; returnToken: true }
  | { kind: 'resolve-next-anomaly-reward'; recipient: 'card-player' }
  | { kind: 'draw-project-choice'; draw: number; keep: number; discardForFreeCorner: number; discardForIncomeResource: number }
  | { kind: 'spend-exofossil-for-movement'; repeatable: true; cost: 1; movement: 2 }
  | { kind: 'spend-exofossil-for-signal'; cost: 1; location: 'any-sector' }
  | { kind: 'spend-exofossil-for-data'; cost: 1; data: 1 }
  | { kind: 'spend'; resource: 'exofossil'; amount: number }
  | { kind: 'score-signals-in-anomaly-sectors'; vpPerSignal: 1; timing: 'before-completed-sector-resolution' }
  | { kind: 'score-oumuamua-signals-from-this-effect'; vpPerSignal: number }
  | { kind: 'conditional'; when: SetiAlienCondition; then: readonly SetiAlienEffect[] }
  | { kind: 'choose'; choose: number; options: readonly (readonly SetiAlienEffect[])[] };

export type SetiAlienMission =
  | {
      kind: 'delivery';
      countsAsMission: true;
      payload: 'mascamite-sample';
      destination: 'Earth' | 'Mars';
      reward: readonly SetiAlienReward[];
      freeAction: true;
    }
  | {
      kind: 'conditional';
      countsAsMission: true;
      condition: SetiAlienCondition;
      reward: readonly SetiAlienEffect[];
      completionTiming: 'during-own-turn-free-action';
    }
  | {
      kind: 'triggerable';
      countsAsMission: true;
      trigger: SetiAlienCondition;
      rewards: readonly (readonly SetiAlienReward[])[];
      oneSpacePerTrigger: true;
      rewardOrder: 'printed' | 'any';
    }
  | {
      kind: 'endgame';
      countsAsEndgameScoringCard: true;
      condition: SetiAlienCondition;
      vpPerMatchingMarker: number;
    };

export interface SetiAlienCardArt {
  sheet: `/seti/cards/alien-${SetiAlienSpeciesId}.webp`;
  columns: 5;
  rows: 2 | 3;
  cell: number;
  column: number;
  row: number;
}

export interface SetiAlienCardDefinition {
  id: `seti_alien_${SetiAlienSpeciesId}_${string}`;
  species: SetiAlienSpeciesId;
  cardId: number;
  sourceGuid: string;
  name: string;
  art: SetiAlienCardArt;
  playCost: null | { resource: 'credit' | 'energy'; amount: number };
  freeCorner: readonly SetiAlienReward[];
  signalCorner: SetiAlienSignalColor | null;
  incomeCorner: SetiAlienIncome | null;
  handRules: 'normal' | 'exertian-separate';
  effects: readonly SetiAlienEffect[];
  mission: SetiAlienMission | null;
  message: null | {
    milestoneOffset: 15;
    immediate: readonly SetiAlienEffect[];
    delayed: readonly SetiAlienEffect[];
    resolvesInSentOrder: true;
  };
  exertian: null | {
    danger: number;
    condition: SetiExertianScoringCondition;
    victoryPoints: number;
    scoreAtMostOnce: true;
  };
  printedText: readonly string[];
  faq: readonly string[];
}

export type SetiExertianScoringCondition =
  | { kind: 'trace-count'; species: 'this' | 'other'; atLeast: number }
  | { kind: 'spacecraft-at-one-planet-family'; atLeast: number; spacecraft: 'orbiter-or-lander'; moonsCountWithParent: true }
  | { kind: 'sector-wins'; color: SetiAlienSignalColor; atLeast: number }
  | { kind: 'technology-count'; technology: Exclude<SetiAlienTechType, 'any'>; atLeast: number }
  | { kind: 'income-cards'; atLeast: number }
  | { kind: 'lander-count'; atLeast: number; includeMoons: true }
  | { kind: 'same-color-traces'; atLeast: number }
  | { kind: 'orbiter-count'; atLeast: number }
  | { kind: 'completed-missions'; atLeast: number };

export interface SetiAlienResearchSpace {
  id: string;
  trace: SetiAlienTraceColor;
  reward: readonly SetiAlienReward[];
  payment?: { resource: 'exofossil' | 'data-pool'; amount: number };
  repeatable: boolean;
  danger?: 1 | 2 | 3;
  dynamic?: 'mascamite-sample-token';
}

export interface SetiAlienSpeciesDefinition {
  id: SetiAlienSpeciesId;
  name: string;
  componentCounts: Readonly<Record<string, number>>;
  discovery: readonly SetiAlienSpeciesRule[];
  researchSpaces: readonly SetiAlienResearchSpace[];
  rules: readonly SetiAlienSpeciesRule[];
  soloRules: readonly SetiAlienSpeciesRule[];
}

export type SetiAlienSpeciesRule =
  | { kind: 'deal-discovery-cards'; perDiscoveryMarker: number; overflowMarkersRewarded: false; faceUpMarket: true; normalHandLimit: boolean }
  | { kind: 'alien-card-market'; drawChoice: readonly ['face-up', 'deck']; replaceFaceUpFromDeck: true; cardsCanTuckOrUseFreeCorner: true; cardsCountForHandLimit: true; emptyDeckEffect: 'none' }
  | { kind: 'exertian-discovery-deal'; baseCardsPerPlayer: 3; extraPerDiscoveryMarker: 1; mayPlayPerDiscoveryMarker: 1; returnDeckRemainder: true }
  | { kind: 'sample-setup'; shuffledFaceDown: 7; onJupiter: 3; onSaturn: 3; faceUpOnBoard: 1 }
  | { kind: 'sample-collection'; requiresCardEffect: true; chooseOneTokenAtBody: true; unchosenTokensStay: true; cardStaysIfNoSample: true; capsuleStartsAtCollectedBody: true }
  | { kind: 'sample-capsule'; countsAsProbeForEffects: true; countsAgainstProbeLimit: false; canOrbitOrLand: false; movesLikeProbe: true; publicityAndAsteroidsApply: true; moveInsteadOfProbe: true }
  | { kind: 'sample-delivery'; freeAction: true; removeCapsule: true; revealAndGainReward: true; addTokenAsBlueResearchSpace: true }
  | { kind: 'multiple-sample-capsules'; allowed: true; capsulesNeedNotStayLinkedToEnablingCard: true; oneDeliveryCompletesOneMission: true }
  | { kind: 'anomaly-setup'; randomSides: true; locationsFromEarth: readonly [0, -3, 3] }
  | { kind: 'anomaly-trigger'; timing: 'immediately-after-solar-rotation'; winner: 'highest-marker-in-color-column'; emptyColumnReward: 'none'; discoveryAndOverflowIgnored: true; repeatableTopLaterMarkerRanksHigher: true }
  | { kind: 'anomaly-probe-visit'; bonus: 'none' }
  | { kind: 'oumuamua-setup'; outerDisc: 3; data: 3; displacedProbeStaysAndGainsPublicity: 1; exofossilSupply: 17 }
  | { kind: 'oumuamua-planet'; visitPublicity: 1; canOrbit: true; canLand: true; landingReward: readonly SetiAlienReward[]; orbitReward: readonly SetiAlienReward[] }
  | { kind: 'oumuamua-signals'; sectorSignalMayUseTile: true; tileCompletionContributorsGainExofossil: 1; winner: 'none'; refillData: 3; firstSignalVp: 1; thirdSignalVp: 2 }
  | { kind: 'exofossil'; exchangeable: false; endgameValue: 0; repeatableSpacePaymentEachTime: true }
  | { kind: 'message-setup'; milestoneAheadOfOwnScore: 15; tilesPerPlayer: 1 }
  | { kind: 'message-resolution'; timing: 'end-of-turn-milestones'; rewardsAreExclusive: true; freeActionsDuringResolution: false; multipleMessagesOldestFirst: true; playersFromTurnPlayerClockwise: true }
  | { kind: 'centaurian-card'; playCost: 'energy'; notMission: true; setMilestoneBeforeImmediateEffect: true }
  | { kind: 'centaurian-board-payment'; source: 'data-pool-only'; computerDataCannotPay: true; cannotMarkIfUnableToPay: true }
  | { kind: 'exertian-milestones'; relativeToLeadingScore: readonly [20, 40]; firstCostCredits: 0; secondCostCredits: 1; missedSecondCannotBePaidLater: true }
  | { kind: 'exertian-card'; faceDown: true; secretDanger: true; notInHand: true; cannotDiscard: true; notMission: true; notEndgameScoringCard: true; scoreConditionOnce: true }
  | { kind: 'danger'; boardTiers: readonly [1, 2, 3]; penalty: 'floor-one-tenth-final-score'; tiedMostAllPenalized: true; afterAllOtherScoring: true }
  | { kind: 'solo-mascamites'; target: readonly ['Saturn', 'Jupiter']; movementLimits: readonly [4, 5]; exposeRandomSampleWithoutReward: true; skipIfNoneAtBody: true }
  | { kind: 'solo-anomalies'; nextAnomalyDirection: 'counter-clockwise'; actIfNotWinning: true; markLowestMatchingSpace: true; bonusVp: 3 }
  | { kind: 'solo-oumuamua'; specialSignalAlwaysUsesTile: true; allOtherSignalsNeverUseTile: true; paysSpaceOnlyWhenAble: true; otherwiseTreatSpaceOccupied: true }
  | { kind: 'solo-centaurians'; takesUnusedMessageTiles: true; maxMessagesOnTrack: 1; rewardChoice: 'decision-arrow-edge'; paidSpaceRequiresFullComputerAndPoolData: true }
  | { kind: 'solo-exertians'; discoveryDrawsCards: false; discoveryProgressPerMarker: 1; ignoresMilestones: true; speciesActionOnly: true; actionPlayThreshold: 5; thresholdCountsBoardTracesOnly: true; allPlayedCardsFulfilled: true; dangerComparisonApplies: true };

const gain = (resource: Extract<SetiAlienReward, { kind: 'gain' }>['resource'], amount: number): SetiAlienReward => ({ kind: 'gain', resource, amount });
const draw = (amount: number, source: 'deck' | 'row' | 'row-or-deck' = 'row-or-deck'): SetiAlienReward => ({ kind: 'draw-project', amount, source });
const rewardKey = (reward: readonly SetiAlienReward[]): string => reward.map((item) => JSON.stringify(item)).join('|');

export const SETI_ALIEN_DISCOVERY_SLOTS = [
  { slot: 0, rewardPerSpace: [gain('vp', 5), gain('publicity', 1)] },
  { slot: 1, rewardPerSpace: [gain('vp', 3), gain('publicity', 1)] },
] as const;

export const SETI_ALIEN_OVERFLOW = {
  reward: [gain('vp', 3)] as readonly SetiAlienReward[],
  mayChooseWhileResearchSpaceIsOpen: true,
  countsAsTraceForSpecies: true,
  discoverySpacesCountAsTraceForSpecies: true,
  rewardsAlienDiscovery: false,
} as const;

export const SETI_ALIEN_RESEARCH_RULES = {
  spacesNeedNotBeFilledBottomToTop: true,
  chooseAnyUnoccupiedMatchingColorSpace: true,
  universalTraceMayUseAnyColor: true,
  nonplayerMarkersOnlyUseDiscoverySpaces: true,
  alienCardsMayBeDiscardedFromHandForTechSignal: true,
  faceUpAlienMarketCardIsNotAProjectRowCard: true,
  exertianCardsCanNeverBeDiscarded: true,
} as const;

export const SETI_MASCAMITE_SAMPLE_REWARDS = [
  [gain('publicity', 3)],
  [gain('vp', 7)],
  [gain('vp', 3), draw(1)],
  [draw(2, 'deck')],
  [gain('data', 2)],
  [gain('energy', 2)],
  [gain('credit', 2)],
] as const satisfies readonly (readonly SetiAlienReward[])[];

export const SETI_ANOMALY_TOKENS = [
  { color: 'purple', sides: [[gain('credit', 1)], [gain('vp', 4)]] },
  { color: 'orange', sides: [[gain('publicity', 2)], [draw(1)]] },
  { color: 'blue', sides: [[gain('data', 1)], [gain('energy', 1)]] },
] as const satisfies readonly { color: SetiAlienTraceColor; sides: readonly [readonly SetiAlienReward[], readonly SetiAlienReward[]] }[];

function repeatedColumnSpaces(
  species: SetiAlienSpeciesId,
  color: SetiAlienTraceColor,
  rows: readonly Omit<SetiAlienResearchSpace, 'id' | 'trace'>[],
): SetiAlienResearchSpace[] {
  return rows.map((row, index) => ({ ...row, id: `${species}_${color}_${index + 1}`, trace: color }));
}

const standardBoardRows = (values: readonly number[]): readonly Omit<SetiAlienResearchSpace, 'id' | 'trace'>[] => values.map((vp, index) => ({
  reward: index < 2 ? [gain('vp', vp)] : [gain('vp', vp), draw(1)],
  repeatable: false,
}));

const MASCAMITE_SPACES: readonly SetiAlienResearchSpace[] = [
  ...repeatedColumnSpaces('mascamites', 'purple', standardBoardRows([4, 5, 3, 5])),
  ...repeatedColumnSpaces('mascamites', 'orange', standardBoardRows([4, 5, 3, 5])),
  ...repeatedColumnSpaces('mascamites', 'blue', [
    ...SETI_MASCAMITE_SAMPLE_REWARDS.map((reward) => ({ reward, repeatable: false, dynamic: 'mascamite-sample-token' as const })),
    { reward: [gain('vp', 3), draw(1)], repeatable: false },
    { reward: [gain('vp', 5), draw(1)], repeatable: false },
  ]),
];

const anomalyRows: readonly Omit<SetiAlienResearchSpace, 'id' | 'trace'>[] = [
  { reward: [gain('vp', 2)], repeatable: true },
  { reward: [gain('vp', 3)], repeatable: false },
  { reward: [gain('vp', 2), gain('publicity', 1)], repeatable: false },
  { reward: [gain('vp', 2), draw(1)], repeatable: false },
  { reward: [gain('vp', 4), draw(1)], repeatable: false },
];
const ANOMALY_SPACES = (['purple', 'orange', 'blue'] as const).flatMap((color) => repeatedColumnSpaces('anomalies', color, anomalyRows));

const oumuamuaRows: readonly Omit<SetiAlienResearchSpace, 'id' | 'trace'>[] = [
  { reward: [gain('vp', 6)], payment: { resource: 'exofossil', amount: 1 }, repeatable: true },
  { reward: [gain('vp', 2), gain('exofossil', 1)], repeatable: false },
  { reward: [gain('vp', 3), draw(1)], repeatable: false },
  { reward: [gain('vp', 3), draw(1), gain('exofossil', 1)], repeatable: false },
  { reward: [gain('vp', 25)], payment: { resource: 'exofossil', amount: 4 }, repeatable: false },
];
const OUMUAMUA_SPACES = (['purple', 'orange', 'blue'] as const).flatMap((color) => repeatedColumnSpaces('oumuamua', color, oumuamuaRows));

const centaurianRows: readonly Omit<SetiAlienResearchSpace, 'id' | 'trace'>[] = [
  { reward: [gain('vp', 6)], payment: { resource: 'data-pool', amount: 1 }, repeatable: true },
  { reward: [gain('vp', 15)], payment: { resource: 'data-pool', amount: 3 }, repeatable: false },
  { reward: [gain('vp', 5)], repeatable: false },
  { reward: [gain('vp', 3), draw(1)], repeatable: false },
  { reward: [gain('vp', 5), draw(1)], repeatable: false },
];
const CENTAURIAN_SPACES = (['purple', 'orange', 'blue'] as const).flatMap((color) => repeatedColumnSpaces('centaurians', color, centaurianRows));

const exertianRowsByColor: Readonly<Record<SetiAlienTraceColor, readonly Omit<SetiAlienResearchSpace, 'id' | 'trace'>[]>> = {
  purple: [
    { reward: [gain('vp', 3), gain('publicity', 1)], repeatable: false, danger: 1 },
    { reward: [gain('vp', 4), gain('credit', 1)], repeatable: false, danger: 2 },
    { reward: [gain('vp', 5), gain('credit', 1)], repeatable: false, danger: 2 },
    { reward: [gain('vp', 7), gain('credit', 1)], repeatable: false, danger: 3 },
    { reward: [gain('vp', 9), gain('credit', 1)], repeatable: false, danger: 3 },
  ],
  orange: [
    { reward: [gain('vp', 3), gain('publicity', 1)], repeatable: false, danger: 1 },
    { reward: [gain('vp', 1), gain('energy', 1), draw(1)], repeatable: false, danger: 2 },
    { reward: [gain('vp', 2), gain('energy', 1), draw(1)], repeatable: false, danger: 2 },
    { reward: [gain('vp', 4), gain('energy', 1), draw(1)], repeatable: false, danger: 3 },
    { reward: [gain('vp', 6), gain('energy', 1), draw(1)], repeatable: false, danger: 3 },
  ],
  blue: [
    { reward: [gain('vp', 3), gain('publicity', 1)], repeatable: false, danger: 1 },
    { reward: [gain('vp', 1), gain('data', 1), gain('publicity', 1)], repeatable: false, danger: 2 },
    { reward: [gain('vp', 2), gain('data', 1), gain('publicity', 1)], repeatable: false, danger: 2 },
    { reward: [gain('vp', 4), gain('data', 1), gain('publicity', 1)], repeatable: false, danger: 3 },
    { reward: [gain('vp', 6), gain('data', 1), gain('publicity', 1)], repeatable: false, danger: 3 },
  ],
};
const EXERTIAN_SPACES = (['purple', 'orange', 'blue'] as const).flatMap((color) => repeatedColumnSpaces('exertians', color, exertianRowsByColor[color]));

export const SETI_CENTAURIAN_MESSAGE_REWARDS = [
  [{ kind: 'mark-trace', color: 'any', species: 'this' }],
  [draw(1), gain('energy', 1)],
  [gain('publicity', 3)],
  [gain('vp', 8)],
] as const satisfies readonly (readonly SetiAlienReward[])[];

export const SETI_ALIEN_SPECIES: readonly SetiAlienSpeciesDefinition[] = [
  {
    id: 'mascamites', name: 'Mascamites', componentCounts: { board: 1, ruleSheet: 1, cards: 10, samples: 7 },
    discovery: [
      { kind: 'deal-discovery-cards', perDiscoveryMarker: 1, overflowMarkersRewarded: false, faceUpMarket: true, normalHandLimit: true },
      { kind: 'sample-setup', shuffledFaceDown: 7, onJupiter: 3, onSaturn: 3, faceUpOnBoard: 1 },
    ],
    researchSpaces: MASCAMITE_SPACES,
    rules: [
      { kind: 'alien-card-market', drawChoice: ['face-up', 'deck'], replaceFaceUpFromDeck: true, cardsCanTuckOrUseFreeCorner: true, cardsCountForHandLimit: true, emptyDeckEffect: 'none' },
      { kind: 'sample-collection', requiresCardEffect: true, chooseOneTokenAtBody: true, unchosenTokensStay: true, cardStaysIfNoSample: true, capsuleStartsAtCollectedBody: true },
      { kind: 'sample-capsule', countsAsProbeForEffects: true, countsAgainstProbeLimit: false, canOrbitOrLand: false, movesLikeProbe: true, publicityAndAsteroidsApply: true, moveInsteadOfProbe: true },
      { kind: 'sample-delivery', freeAction: true, removeCapsule: true, revealAndGainReward: true, addTokenAsBlueResearchSpace: true },
      { kind: 'multiple-sample-capsules', allowed: true, capsulesNeedNotStayLinkedToEnablingCard: true, oneDeliveryCompletesOneMission: true },
    ],
    soloRules: [{ kind: 'solo-mascamites', target: ['Saturn', 'Jupiter'], movementLimits: [4, 5], exposeRandomSampleWithoutReward: true, skipIfNoneAtBody: true }],
  },
  {
    id: 'anomalies', name: 'Anomalies', componentCounts: { board: 1, ruleSheet: 1, cards: 10, anomalyTokens: 3 },
    discovery: [
      { kind: 'deal-discovery-cards', perDiscoveryMarker: 1, overflowMarkersRewarded: false, faceUpMarket: true, normalHandLimit: true },
      { kind: 'anomaly-setup', randomSides: true, locationsFromEarth: [0, -3, 3] },
    ],
    researchSpaces: ANOMALY_SPACES,
    rules: [
      { kind: 'alien-card-market', drawChoice: ['face-up', 'deck'], replaceFaceUpFromDeck: true, cardsCanTuckOrUseFreeCorner: true, cardsCountForHandLimit: true, emptyDeckEffect: 'none' },
      { kind: 'anomaly-trigger', timing: 'immediately-after-solar-rotation', winner: 'highest-marker-in-color-column', emptyColumnReward: 'none', discoveryAndOverflowIgnored: true, repeatableTopLaterMarkerRanksHigher: true },
      { kind: 'anomaly-probe-visit', bonus: 'none' },
    ],
    soloRules: [{ kind: 'solo-anomalies', nextAnomalyDirection: 'counter-clockwise', actIfNotWinning: true, markLowestMatchingSpace: true, bonusVp: 3 }],
  },
  {
    id: 'oumuamua', name: "'Oumuamua", componentCounts: { board: 1, ruleSheet: 1, cards: 10, oumuamuaTile: 1, exofossils: 17 },
    discovery: [
      { kind: 'deal-discovery-cards', perDiscoveryMarker: 1, overflowMarkersRewarded: false, faceUpMarket: true, normalHandLimit: true },
      { kind: 'oumuamua-setup', outerDisc: 3, data: 3, displacedProbeStaysAndGainsPublicity: 1, exofossilSupply: 17 },
    ],
    researchSpaces: OUMUAMUA_SPACES,
    rules: [
      { kind: 'alien-card-market', drawChoice: ['face-up', 'deck'], replaceFaceUpFromDeck: true, cardsCanTuckOrUseFreeCorner: true, cardsCountForHandLimit: true, emptyDeckEffect: 'none' },
      { kind: 'oumuamua-planet', visitPublicity: 1, canOrbit: true, canLand: true, landingReward: [gain('vp', 10), gain('exofossil', 1)], orbitReward: [{ kind: 'mark-signal', amount: 1, location: 'oumuamua-sector' }, { kind: 'tuck-income', amount: 1 }] },
      { kind: 'oumuamua-signals', sectorSignalMayUseTile: true, tileCompletionContributorsGainExofossil: 1, winner: 'none', refillData: 3, firstSignalVp: 1, thirdSignalVp: 2 },
      { kind: 'exofossil', exchangeable: false, endgameValue: 0, repeatableSpacePaymentEachTime: true },
    ],
    soloRules: [{ kind: 'solo-oumuamua', specialSignalAlwaysUsesTile: true, allOtherSignalsNeverUseTile: true, paysSpaceOnlyWhenAble: true, otherwiseTreatSpaceOccupied: true }],
  },
  {
    id: 'centaurians', name: 'Centaurians', componentCounts: { board: 1, ruleSheet: 1, cards: 10, messageTiles: 4 },
    discovery: [
      { kind: 'deal-discovery-cards', perDiscoveryMarker: 1, overflowMarkersRewarded: false, faceUpMarket: true, normalHandLimit: true },
      { kind: 'message-setup', milestoneAheadOfOwnScore: 15, tilesPerPlayer: 1 },
    ],
    researchSpaces: CENTAURIAN_SPACES,
    rules: [
      { kind: 'alien-card-market', drawChoice: ['face-up', 'deck'], replaceFaceUpFromDeck: true, cardsCanTuckOrUseFreeCorner: true, cardsCountForHandLimit: true, emptyDeckEffect: 'none' },
      { kind: 'centaurian-card', playCost: 'energy', notMission: true, setMilestoneBeforeImmediateEffect: true },
      { kind: 'message-resolution', timing: 'end-of-turn-milestones', rewardsAreExclusive: true, freeActionsDuringResolution: false, multipleMessagesOldestFirst: true, playersFromTurnPlayerClockwise: true },
      { kind: 'centaurian-board-payment', source: 'data-pool-only', computerDataCannotPay: true, cannotMarkIfUnableToPay: true },
    ],
    soloRules: [{ kind: 'solo-centaurians', takesUnusedMessageTiles: true, maxMessagesOnTrack: 1, rewardChoice: 'decision-arrow-edge', paidSpaceRequiresFullComputerAndPoolData: true }],
  },
  {
    id: 'exertians', name: 'Exertians', componentCounts: { board: 1, ruleSheet: 1, cards: 15, milestoneTiles: 2 },
    discovery: [
      { kind: 'exertian-discovery-deal', baseCardsPerPlayer: 3, extraPerDiscoveryMarker: 1, mayPlayPerDiscoveryMarker: 1, returnDeckRemainder: true },
      { kind: 'exertian-milestones', relativeToLeadingScore: [20, 40], firstCostCredits: 0, secondCostCredits: 1, missedSecondCannotBePaidLater: true },
    ],
    researchSpaces: EXERTIAN_SPACES,
    rules: [
      { kind: 'exertian-card', faceDown: true, secretDanger: true, notInHand: true, cannotDiscard: true, notMission: true, notEndgameScoringCard: true, scoreConditionOnce: true },
      { kind: 'danger', boardTiers: [1, 2, 3], penalty: 'floor-one-tenth-final-score', tiedMostAllPenalized: true, afterAllOtherScoring: true },
    ],
    soloRules: [{ kind: 'solo-exertians', discoveryDrawsCards: false, discoveryProgressPerMarker: 1, ignoresMilestones: true, speciesActionOnly: true, actionPlayThreshold: 5, thresholdCountsBoardTracesOnly: true, allPlayedCardsFulfilled: true, dangerComparisonApplies: true }],
  },
];

export const SETI_ALIEN_SPECIES_BY_ID: Readonly<Record<SetiAlienSpeciesId, SetiAlienSpeciesDefinition>> = Object.fromEntries(
  SETI_ALIEN_SPECIES.map((species) => [species.id, species]),
) as Record<SetiAlienSpeciesId, SetiAlienSpeciesDefinition>;

// Used by tests and reducer adapters to compare rewards without relying on
// object identity from generated identical columns.
export function setiAlienRewardSignature(reward: readonly SetiAlienReward[]): string {
  return rewardKey(reward);
}

interface AlienCardInput {
  species: SetiAlienSpeciesId;
  cardId: number;
  sourceGuid: string;
  name: string;
  cost: null | { resource: 'credit' | 'energy'; amount: number };
  freeCorner?: readonly SetiAlienReward[];
  signalCorner?: SetiAlienSignalColor | null;
  incomeCorner?: SetiAlienIncome | null;
  effects?: readonly SetiAlienEffect[];
  mission?: SetiAlienMission | null;
  message?: SetiAlienCardDefinition['message'];
  exertian?: SetiAlienCardDefinition['exertian'];
  printedText: readonly string[];
  faq?: readonly string[];
}

function defineAlienCard(input: AlienCardInput): SetiAlienCardDefinition {
  const cell = input.cardId % 100;
  const rows = input.species === 'exertians' ? 3 : 2;
  return {
    id: `seti_alien_${input.species}_${String(cell + 1).padStart(2, '0')}`,
    species: input.species,
    cardId: input.cardId,
    sourceGuid: input.sourceGuid,
    name: input.name,
    art: {
      sheet: `/seti/cards/alien-${input.species}.webp`,
      columns: 5,
      rows,
      cell,
      column: cell % 5,
      row: Math.floor(cell / 5),
    },
    playCost: input.cost,
    freeCorner: input.freeCorner ?? [],
    signalCorner: input.signalCorner ?? null,
    incomeCorner: input.incomeCorner ?? null,
    handRules: input.species === 'exertians' ? 'exertian-separate' : 'normal',
    effects: input.effects ?? [],
    mission: input.mission ?? null,
    message: input.message ?? null,
    exertian: input.exertian ?? null,
    printedText: input.printedText,
    faq: input.faq ?? [],
  };
}

const FREE_PUBLICITY_2 = [gain('publicity', 2)] as const;
const FREE_VP_MOVE = [gain('vp', 1), gain('movement', 1)] as const;
const FREE_VP_DATA = [gain('vp', 1), gain('data', 1)] as const;
const scanFree: SetiAlienEffect = { kind: 'main-action', action: 'scan', baseCost: 'waived' };
const landFree: SetiAlienEffect = { kind: 'main-action', action: 'land', baseCost: 'waived', allowedBodies: 'planet' };
const allTraceColors = ['purple', 'orange', 'blue'] as const;

const MASCAMITE_CARDS: readonly SetiAlienCardDefinition[] = [
  defineAlienCard({
    species: 'mascamites', cardId: 203800, sourceGuid: '249e81', name: 'Breeding Sample',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'red', incomeCorner: 'energy',
    effects: [landFree, { kind: 'collect-mascamite-sample', location: 'landed-body', takeToken: true, gainReward: false, returnToken: false }],
    mission: { kind: 'delivery', countsAsMission: true, payload: 'mascamite-sample', destination: 'Earth', reward: [{ kind: 'resolve-mascamite-sample', multiplier: 2 }], freeAction: true },
    printedText: ['Land. Then look at all samples on the planet and pick one up.', 'Deliver a sample to Earth: resolve its reward twice.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203801, sourceGuid: '39cf63', name: 'Computer Simulations',
    cost: { resource: 'credit', amount: 3 }, freeCorner: FREE_VP_DATA, signalCorner: 'yellow', incomeCorner: 'card',
    effects: [gain('publicity', 1), { kind: 'rotate-solar-system' }, { kind: 'take-tech', technology: 'computer' }],
    mission: {
      kind: 'conditional', countsAsMission: true,
      condition: { kind: 'trace-count', species: 'this', atLeast: 2, color: 'blue' },
      reward: [{ kind: 'inspect-mascamite-samples', bodyChoice: ['Jupiter', 'Saturn'], takeToken: false, gainReward: true, returnToken: true }],
      completionTiming: 'during-own-turn-free-action',
    },
    printedText: ['Gain 1 publicity, rotate the solar system, and take a computer tech.', 'Have 2 blue traces for this species: choose Jupiter or Saturn; inspect all its samples, gain one reward, then put it back.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203802, sourceGuid: '0f6859', name: 'Ecosystem Study',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_MOVE, signalCorner: 'blue', incomeCorner: 'card',
    effects: [{ kind: 'collect-mascamite-sample', location: 'planet-with-your-probe', takeToken: false, gainReward: true, returnToken: true }],
    mission: { kind: 'endgame', countsAsEndgameScoringCard: true, condition: { kind: 'trace-count', species: 'this', atLeast: 0, color: 'any' }, vpPerMatchingMarker: 1 },
    printedText: ['Look at all samples on a planet with your probe. Choose one, gain its reward, and put it back.', 'At game end, gain 1 VP for each trace you have marked for this species.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203803, sourceGuid: 'c3ed03', name: 'First Contact',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'blue', incomeCorner: 'card',
    effects: [gain('movement', 1), landFree, { kind: 'collect-mascamite-sample', location: 'landed-body', takeToken: true, gainReward: false, returnToken: false }],
    mission: { kind: 'delivery', countsAsMission: true, payload: 'mascamite-sample', destination: 'Earth', reward: [{ kind: 'resolve-mascamite-sample', multiplier: 1 }, gain('data', 2)], freeAction: true },
    printedText: ['Gain 1 movement, then land. Inspect the samples on that planet and pick one up.', 'Deliver a sample to Earth: gain its reward and 2 data.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203804, sourceGuid: '1fabda', name: 'Hive Sample',
    cost: { resource: 'credit', amount: 3 }, freeCorner: FREE_VP_MOVE, signalCorner: 'blue', incomeCorner: 'energy',
    effects: [gain('publicity', 1), { kind: 'rotate-solar-system' }, { kind: 'take-tech', technology: 'probe' }],
    mission: {
      kind: 'conditional', countsAsMission: true,
      condition: { kind: 'trace-count', species: 'this', atLeast: 2, color: 'orange' },
      reward: [{ kind: 'inspect-mascamite-samples', bodyChoice: ['Jupiter', 'Saturn'], takeToken: false, gainReward: true, returnToken: true }],
      completionTiming: 'during-own-turn-free-action',
    },
    printedText: ['Gain 1 publicity, rotate the solar system, and take a probe tech.', 'Have 2 orange traces for this species: choose Jupiter or Saturn; inspect all its samples, gain one reward, then put it back.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203805, sourceGuid: '51f582', name: 'Martian Quarantine Lab',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_DATA, signalCorner: 'red', incomeCorner: 'credit',
    effects: [landFree, { kind: 'collect-mascamite-sample', location: 'landed-body', takeToken: true, gainReward: false, returnToken: false }],
    mission: { kind: 'delivery', countsAsMission: true, payload: 'mascamite-sample', destination: 'Mars', reward: [{ kind: 'resolve-mascamite-sample', multiplier: 1 }, gain('vp', 2), draw(1)], freeAction: true },
    printedText: ['Land. Then look at all samples on the planet and pick one up.', 'Deliver a sample to Mars: gain its reward, 2 VP, and a card from the row or deck.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203806, sourceGuid: '7fc245', name: 'Mass Sample Collection',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_DATA, signalCorner: 'yellow', incomeCorner: 'energy',
    effects: [{ kind: 'main-action', action: 'orbit-or-land', baseCost: 'waived', allowedBodies: 'planet' }, { kind: 'collect-mascamite-sample', location: 'landed-body', takeToken: true, gainReward: false, returnToken: false }],
    mission: { kind: 'delivery', countsAsMission: true, payload: 'mascamite-sample', destination: 'Earth', reward: [{ kind: 'resolve-mascamite-sample', multiplier: 1 }, gain('vp', 3), gain('credit', 1)], freeAction: true },
    printedText: ['Orbit or land, then look at all samples on the planet and pick one up.', 'Deliver a sample to Earth: gain its reward, 3 VP, and 1 credit.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203807, sourceGuid: '2a0981', name: 'Orbital Monitoring',
    cost: { resource: 'credit', amount: 3 }, freeCorner: FREE_VP_MOVE, signalCorner: 'red', incomeCorner: 'credit',
    effects: [gain('publicity', 1), { kind: 'rotate-solar-system' }, { kind: 'take-tech', technology: 'telescope' }],
    mission: {
      kind: 'conditional', countsAsMission: true,
      condition: { kind: 'trace-count', species: 'this', atLeast: 2, color: 'purple' },
      reward: [{ kind: 'inspect-mascamite-samples', bodyChoice: ['Jupiter', 'Saturn'], takeToken: false, gainReward: true, returnToken: true }],
      completionTiming: 'during-own-turn-free-action',
    },
    printedText: ['Gain 1 publicity, rotate the solar system, and take a telescope tech.', 'Have 2 purple traces for this species: choose Jupiter or Saturn; inspect all its samples, gain one reward, then put it back.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203808, sourceGuid: '78d965', name: 'Rover Exploration',
    cost: { resource: 'credit', amount: 2 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'black', incomeCorner: 'energy',
    effects: [{ kind: 'main-action', action: 'land', baseCost: 'waived', allowedBodies: 'planet-or-moon', ignoreRequiredTech: true }, { kind: 'collect-mascamite-sample', location: 'landed-body', takeToken: true, gainReward: false, returnToken: false }],
    mission: { kind: 'delivery', countsAsMission: true, payload: 'mascamite-sample', destination: 'Earth', reward: [{ kind: 'resolve-mascamite-sample', multiplier: 1 }, gain('vp', 3), gain('data', 3)], freeAction: true },
    printedText: ['Land on a planet or moon, even without the required tech. Inspect that body\'s samples and pick one up.', 'Deliver a sample to Earth: gain its reward, 3 VP, and 3 data.'],
  }),
  defineAlienCard({
    species: 'mascamites', cardId: 203809, sourceGuid: '69218c', name: 'The Queen',
    cost: { resource: 'credit', amount: 2 }, freeCorner: FREE_VP_MOVE, signalCorner: 'red', incomeCorner: 'credit',
    effects: [{ kind: 'main-action', action: 'land', baseCost: 'waived', allowedBodies: 'planet-or-moon', ignoreRequiredTech: true }, { kind: 'collect-mascamite-sample', location: 'landed-body', takeToken: true, gainReward: false, returnToken: false }],
    mission: { kind: 'delivery', countsAsMission: true, payload: 'mascamite-sample', destination: 'Earth', reward: [{ kind: 'resolve-mascamite-sample', multiplier: 1 }, gain('vp', 6), gain('publicity', 2)], freeAction: true },
    printedText: ['Land on a planet or moon, even without the required tech. Inspect that body\'s samples and pick one up.', 'Deliver a sample to Earth: gain its reward, 6 VP, and 2 publicity.'],
  }),
];

const ANOMALY_CARDS: readonly SetiAlienCardDefinition[] = [
  defineAlienCard({
    species: 'anomalies', cardId: 203900, sourceGuid: '561002', name: 'Amazing Uncertainty',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'yellow', incomeCorner: 'energy',
    effects: [
      { kind: 'mark-signal', amount: 1, location: 'any-sector' },
      { kind: 'score-signals-in-anomaly-sectors', vpPerSignal: 1, timing: 'before-completed-sector-resolution' },
    ],
    printedText: ['Mark a signal in any sector.', 'Then gain 1 VP for each signal you have in sectors with anomalies.'],
    faq: ['Include the signal just marked if it is in an anomaly sector. Score before resolving any sector completed by this card.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203901, sourceGuid: '8f4e98', name: 'Are We Being Observed?',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_MOVE, signalCorner: 'yellow', incomeCorner: 'card',
    effects: [{ kind: 'resolve-next-anomaly-reward', recipient: 'card-player' }],
    mission: { kind: 'conditional', countsAsMission: true, condition: { kind: 'trace-set', species: 'this', colors: allTraceColors }, reward: [gain('vp', 3), gain('publicity', 2)], completionTiming: 'during-own-turn-free-action' },
    printedText: ['Gain the reward from the anomaly that is going to be triggered next.', 'Have one trace of each color for this species: gain 3 VP and 2 publicity.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203902, sourceGuid: '9d6f11', name: 'Close-up View',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'red', incomeCorner: 'credit',
    effects: [{ kind: 'move', amount: 5, probePublicity: 'suppressed-for-turn' }],
    printedText: ['Gain 5 movement. Do not gain any publicity for moving probes this turn.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203903, sourceGuid: '750923', name: 'Concerned People',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_DATA, signalCorner: 'yellow', incomeCorner: 'credit',
    effects: [gain('publicity', 1)],
    mission: {
      kind: 'triggerable', countsAsMission: true, trigger: { kind: 'event', event: 'research-any-tech' }, oneSpacePerTrigger: true, rewardOrder: 'any',
      rewards: [[gain('energy', 1)], [draw(1)], [gain('vp', 3)]],
    },
    printedText: ['Gain 1 publicity.', 'Each time you research any tech, mark one remaining mission space and gain its reward: 1 energy, a card, or 3 VP.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203904, sourceGuid: '7facf2', name: 'Flooding the Media Space',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_DATA, signalCorner: 'red', incomeCorner: 'credit',
    effects: [draw(3, 'row')],
    printedText: ['Draw all three cards from the card row.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203905, sourceGuid: 'e89b1d', name: 'Listening Carefully',
    cost: { resource: 'credit', amount: 2 }, freeCorner: FREE_VP_MOVE, signalCorner: 'red', incomeCorner: 'card',
    effects: [scanFree, { kind: 'mark-signal', amount: 1, location: 'next-anomaly-sector' }],
    printedText: ['Scan.', 'In addition, mark a signal in the sector with the anomaly that is going to be triggered next.'],
    faq: ['The Scan action has no base cost; optional telescope-tech additions still require their printed additional costs.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203906, sourceGuid: '8c43d3', name: 'Message Capsule',
    cost: { resource: 'credit', amount: 2 }, freeCorner: FREE_VP_DATA, signalCorner: 'blue', incomeCorner: 'credit',
    effects: [{ kind: 'rotate-solar-system' }, { kind: 'take-tech', technology: 'any' }],
    printedText: ['Rotate the solar system and take a tech of any type.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203907, sourceGuid: 'fac558', name: 'New Physics',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'black', incomeCorner: 'energy',
    effects: [{ kind: 'mark-trace', color: 'any', species: 'this' }],
    printedText: ['Mark any life trace for this species.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203908, sourceGuid: '5263f4', name: 'Part of Everyday Life',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_MOVE, signalCorner: 'blue', incomeCorner: 'energy',
    effects: [{ kind: 'draw-project-choice', draw: 3, keep: 1, discardForFreeCorner: 1, discardForIncomeResource: 1 }],
    printedText: ['Draw 3 random cards. Discard one for its free-action corner, discard another to gain the resource corresponding to its income, and keep the remaining card.'],
    faq: ['Resolve the free-action corner on one drawn card, gain the printed income resource of a different drawn card, and keep the third.'],
  }),
  defineAlienCard({
    species: 'anomalies', cardId: 203909, sourceGuid: 'e6a0ee', name: 'Signs of Life',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'blue', incomeCorner: 'card',
    effects: [landFree, { kind: 'conditional', when: { kind: 'prior-action-result', result: 'landed-in-anomaly-sector' }, then: [gain('movement', 1)] }],
    printedText: ['Land. If the planet was in a sector with an anomaly, gain 1 movement.'],
  }),
];

const OUMUAMUA_CARDS: readonly SetiAlienCardDefinition[] = [
  defineAlienCard({
    species: 'oumuamua', cardId: 203700, sourceGuid: '85edd7', name: 'Altered Trajectory',
    cost: { resource: 'credit', amount: 2 }, freeCorner: FREE_VP_MOVE, signalCorner: 'red', incomeCorner: 'energy',
    effects: [
      scanFree,
      { kind: 'conditional', when: { kind: 'prior-action-result', result: 'marked-oumuamua-signal' }, then: [gain('exofossil', 1)] },
    ],
    mission: { kind: 'conditional', countsAsMission: true, condition: { kind: 'lander-at', body: 'Oumuamua' }, reward: [gain('vp', 4)], completionTiming: 'during-own-turn-free-action' },
    printedText: ["Scan. If you mark at least 1 signal on 'Oumuamua, gain 1 exofossil.", "Have a lander on 'Oumuamua: gain 4 VP."],
    faq: ['The Scan action has no base cost; optional telescope-tech additions still require their printed additional costs. The exofossil is gained once if at least one signal from this effect is placed on the tile.'],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203701, sourceGuid: 'db7e4c', name: 'Comparative Analysis',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_MOVE, signalCorner: 'red', incomeCorner: 'energy',
    effects: [gain('exofossil', 1)],
    mission: {
      kind: 'triggerable', countsAsMission: true, trigger: { kind: 'event', event: 'mark-any-trace' }, oneSpacePerTrigger: true, rewardOrder: 'any',
      rewards: [[gain('data', 1)], [gain('publicity', 1)], [gain('vp', 3)]],
    },
    printedText: ['Gain 1 exofossil.', 'Each time you mark any life trace, mark one remaining mission space and gain its reward: 1 data, 1 publicity, or 3 VP.'],
    faq: ['A trace event marks only one reward on this mission, and the three rewards may be covered in any order.'],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203702, sourceGuid: '7767ab', name: 'Exofossil Discovery',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'yellow', incomeCorner: 'energy',
    effects: [{ kind: 'mark-signal', amount: 1, location: 'oumuamua-sector' }],
    mission: {
      kind: 'conditional', countsAsMission: true, condition: { kind: 'exofossils-held', atLeast: 3 },
      reward: [{ kind: 'spend', resource: 'exofossil', amount: 2 }, gain('vp', 11)], completionTiming: 'during-own-turn-free-action',
    },
    printedText: ["Mark a signal in the sector with 'Oumuamua.", 'Have at least 3 exofossils: spend 2 exofossils to gain 11 VP.'],
    faq: ["A signal in 'Oumuamua's sector may be placed either in the star sector or on the 'Oumuamua tile."],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203703, sourceGuid: 'e25492', name: 'Excavation Rover',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_DATA, signalCorner: 'black', incomeCorner: 'card',
    effects: [landFree, { kind: 'conditional', when: { kind: 'prior-action-result', result: 'landed-oumuamua' }, then: [gain('vp', 3)] }],
    mission: { kind: 'conditional', countsAsMission: true, condition: { kind: 'trace-set', species: 'this', colors: allTraceColors }, reward: [gain('exofossil', 1)], completionTiming: 'during-own-turn-free-action' },
    printedText: ["Land. If you land on 'Oumuamua with this action, gain 3 VP.", 'Have one trace of each color for this species: gain 1 exofossil.'],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203704, sourceGuid: 'd39c9f', name: 'Exofossil Samples',
    cost: { resource: 'credit', amount: 2 }, freeCorner: FREE_VP_MOVE, signalCorner: 'blue', incomeCorner: 'card',
    effects: [{ kind: 'rotate-solar-system' }, { kind: 'take-tech', technology: 'computer' }, { kind: 'spend-exofossil-for-data', cost: 1, data: 1 }],
    printedText: ['Rotate the solar system and take a computer tech. Then you may spend 1 exofossil to gain 1 data.'],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203705, sourceGuid: '07f094', name: 'Perfect Timing',
    cost: { resource: 'credit', amount: 2 }, freeCorner: FREE_VP_DATA, signalCorner: 'yellow', incomeCorner: 'credit',
    effects: [
      { kind: 'move', amount: 4, probePublicity: 'normal' },
      { kind: 'conditional', when: { kind: 'prior-action-result', result: 'visited-oumuamua' }, then: [gain('exofossil', 1)] },
    ],
    mission: { kind: 'conditional', countsAsMission: true, condition: { kind: 'signal-count', location: 'oumuamua-tile', atLeast: 1 }, reward: [gain('exofossil', 1)], completionTiming: 'during-own-turn-free-action' },
    printedText: ["Gain 4 movement. If you visit 'Oumuamua this turn, gain 1 exofossil.", "Have at least 1 signal on the 'Oumuamua tile: gain 1 exofossil."],
    faq: ["Visiting requires moving a probe into 'Oumuamua's space during this turn; beginning there is insufficient. The mission signal must be on the tile, not merely in the same sector."],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203706, sourceGuid: '974351', name: 'Probe Customisation',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_VP_DATA, signalCorner: 'blue', incomeCorner: 'credit',
    effects: [{ kind: 'spend-exofossil-for-movement', repeatable: true, cost: 1, movement: 2 }, landFree],
    printedText: ['You may spend 1 exofossil any number of times to gain 2 movement each time. Then land.'],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203707, sourceGuid: '592564', name: 'Race Against Time',
    cost: { resource: 'credit', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'red', incomeCorner: 'energy',
    effects: [landFree, gain('exofossil', 1)],
    printedText: ['Land, then gain 1 exofossil.'],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203708, sourceGuid: '79bec8', name: 'Terrain Mapping',
    cost: { resource: 'credit', amount: 3 }, freeCorner: FREE_VP_MOVE, signalCorner: 'yellow', incomeCorner: 'credit',
    effects: [
      { kind: 'mark-signal', amount: 1, location: 'any-sector', color: 'yellow' },
      { kind: 'mark-signal', amount: 1, location: 'any-sector', color: 'red' },
      { kind: 'mark-signal', amount: 1, location: 'any-sector', color: 'blue' },
      { kind: 'spend-exofossil-for-signal', cost: 1, location: 'any-sector' },
    ],
    mission: { kind: 'endgame', countsAsEndgameScoringCard: true, condition: { kind: 'trace-count', species: 'this', atLeast: 0, color: 'any' }, vpPerMatchingMarker: 1 },
    printedText: ['Mark one signal in each of a yellow, red, and blue sector. Then you may spend 1 exofossil to mark a signal in any sector.', 'At game end, gain 1 VP for each trace you have marked for this species.'],
  }),
  defineAlienCard({
    species: 'oumuamua', cardId: 203709, sourceGuid: '0dbf48', name: 'Visitor in the Sky',
    cost: { resource: 'credit', amount: 2 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'blue', incomeCorner: 'card',
    effects: [scanFree, { kind: 'score-oumuamua-signals-from-this-effect', vpPerSignal: 2 }],
    mission: { kind: 'conditional', countsAsMission: true, condition: { kind: 'paid-oumuamua-space', acceptedCosts: [1, 4] }, reward: [gain('data', 1)], completionTiming: 'during-own-turn-free-action' },
    printedText: ["Scan. Gain 2 VP for each signal this action places on the 'Oumuamua tile.", "Have a trace marked for this species on a space that required an exofossil payment: gain 1 data."],
    faq: ['The Scan action has no base cost; optional telescope-tech additions still require their printed additional costs. The mission accepts a 25-VP space costing 4 exofossils or the repeatable 6-VP space costing 1.'],
  }),
];

function messageCard(input: Omit<AlienCardInput, 'message' | 'effects' | 'mission' | 'exertian'> & {
  immediate: readonly SetiAlienEffect[];
  delayed: readonly SetiAlienEffect[];
}): SetiAlienCardDefinition {
  return defineAlienCard({
    ...input,
    effects: [],
    message: { milestoneOffset: 15, immediate: input.immediate, delayed: input.delayed, resolvesInSentOrder: true },
  });
}

const TUCK_THIS_MESSAGE = [{ kind: 'tuck-income', amount: 1 }] as const satisfies readonly SetiAlienEffect[];

const CENTAURIAN_CARDS: readonly SetiAlienCardDefinition[] = [
  messageCard({
    species: 'centaurians', cardId: 203500, sourceGuid: 'abeff6', name: 'A Message from Afar',
    cost: { resource: 'energy', amount: 1 }, freeCorner: FREE_VP_MOVE, signalCorner: 'red', incomeCorner: 'energy',
    immediate: [draw(1, 'deck')], delayed: [{ kind: 'mark-trace', color: 'purple', species: 'this' }],
    printedText: ['Place a message marker 15 VP ahead, then draw 1 random card.', 'When the message returns, mark a purple trace for this species.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203501, sourceGuid: '8040de', name: 'Alien Schematics',
    cost: { resource: 'energy', amount: 1 }, freeCorner: FREE_VP_DATA, signalCorner: 'blue', incomeCorner: 'credit',
    immediate: [gain('publicity', 2)], delayed: [{ kind: 'mark-trace', color: 'blue', species: 'this' }],
    printedText: ['Place a message marker 15 VP ahead, then gain 2 publicity.', 'When the message returns, mark a blue trace for this species.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203502, sourceGuid: 'fc07dc', name: 'Exocomputers',
    cost: { resource: 'energy', amount: 1 }, freeCorner: FREE_VP_MOVE, signalCorner: 'red', incomeCorner: 'data',
    immediate: [gain('data', 2)], delayed: TUCK_THIS_MESSAGE,
    printedText: ['Place a message marker 15 VP ahead, then gain 2 data.', 'When the message returns, increase your data income with this card.'],
    faq: ['When this card becomes income, gain its 1 data immediately. This unusual income does not count for the credit/energy/card gold scoring tile.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203503, sourceGuid: '886be6', name: 'Hivemind Concept',
    cost: { resource: 'energy', amount: 2 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'blue', incomeCorner: 'data',
    immediate: [{ kind: 'rotate-solar-system' }, { kind: 'take-tech', technology: 'computer' }], delayed: TUCK_THIS_MESSAGE,
    printedText: ['Place a message marker 15 VP ahead, then rotate the solar system and take a computer tech.', 'When the message returns, increase your card income with this card.'],
    faq: ['When this card becomes income, gain its 1 data immediately. This unusual income does not count for the credit/energy/card gold scoring tile.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203504, sourceGuid: 'ab45c6', name: 'Infocluster',
    cost: { resource: 'energy', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'yellow', incomeCorner: 'publicity',
    immediate: [gain('publicity', 1), gain('credit', 1)], delayed: TUCK_THIS_MESSAGE,
    printedText: ['Place a message marker 15 VP ahead, then gain 1 publicity and 1 credit.', 'When the message returns, increase your publicity income with this card.'],
    faq: ['When this card becomes income, gain its 1 publicity immediately. This unusual income does not count for the credit/energy/card gold scoring tile.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203505, sourceGuid: '4c1f7f', name: 'Music of the Spheres',
    cost: { resource: 'energy', amount: 2 }, freeCorner: FREE_VP_DATA, signalCorner: 'black', incomeCorner: 'energy',
    immediate: [draw(1)], delayed: [gain('credit', 1), { kind: 'mark-trace', color: 'any', species: 'this' }],
    printedText: ['Place a message marker 15 VP ahead, then gain a card from the row or deck.', 'When the message returns, gain 1 credit and mark any trace for this species.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203506, sourceGuid: 'af0570', name: 'Synthesis Instructions',
    cost: { resource: 'energy', amount: 1 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'yellow', incomeCorner: 'card',
    immediate: [gain('data', 1)], delayed: [{ kind: 'mark-trace', color: 'orange', species: 'this' }],
    printedText: ['Place a message marker 15 VP ahead, then gain 1 data.', 'When the message returns, mark an orange trace for this species.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203507, sourceGuid: '3b71be', name: 'Telescope Blueprints',
    cost: { resource: 'energy', amount: 2 }, freeCorner: FREE_VP_MOVE, signalCorner: 'red', incomeCorner: 'publicity',
    immediate: [{ kind: 'rotate-solar-system' }, { kind: 'take-tech', technology: 'telescope' }], delayed: TUCK_THIS_MESSAGE,
    printedText: ['Place a message marker 15 VP ahead, then rotate the solar system and take a telescope tech.', 'When the message returns, increase your publicity income with this card.'],
    faq: ['When this card becomes income, gain its 1 publicity immediately. This unusual income does not count for the credit/energy/card gold scoring tile.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203508, sourceGuid: '6dd35b', name: 'Torrent-chain Signal',
    cost: { resource: 'energy', amount: 2 }, freeCorner: FREE_PUBLICITY_2, signalCorner: 'yellow', incomeCorner: 'data',
    immediate: [{ kind: 'mark-signal', amount: 2, location: 'one-chosen-sector' }], delayed: TUCK_THIS_MESSAGE,
    printedText: ['Place a message marker 15 VP ahead, then mark 2 signals in one sector of your choice.', 'When the message returns, increase your data income with this card.'],
    faq: ['When this card becomes income, gain its 1 data immediately. This unusual income does not count for the credit/energy/card gold scoring tile.'],
  }),
  messageCard({
    species: 'centaurians', cardId: 203509, sourceGuid: '2266e2', name: 'Vessel Designs',
    cost: { resource: 'energy', amount: 1 }, freeCorner: FREE_VP_DATA, signalCorner: 'blue', incomeCorner: 'publicity',
    immediate: [landFree], delayed: TUCK_THIS_MESSAGE,
    printedText: ['Place a message marker 15 VP ahead, then land.', 'When the message returns, increase your publicity income with this card.'],
    faq: ['When this card becomes income, gain its 1 publicity immediately. This unusual income does not count for the credit/energy/card gold scoring tile.'],
  }),
];

function exertianCard(
  cardId: number,
  sourceGuid: string,
  name: string,
  danger: number,
  condition: SetiExertianScoringCondition,
  victoryPoints: number,
  conditionText: string,
): SetiAlienCardDefinition {
  return defineAlienCard({
    species: 'exertians', cardId, sourceGuid, name, cost: null,
    exertian: { danger, condition, victoryPoints, scoreAtMostOnce: true },
    printedText: [`Danger ${danger}.`, `At the end of the game, if ${conditionText}, gain ${victoryPoints} VP.`],
    faq: ['This condition scores at most once. The card is neither a mission nor an endgame-scoring card.'],
  });
}

const EXERTIAN_CARDS: readonly SetiAlienCardDefinition[] = [
  exertianCard(203600, '2efc06', 'Automated Lab', 0, { kind: 'trace-count', species: 'this', atLeast: 6 }, 7, 'you have at least 6 traces for this species'),
  exertianCard(203601, 'bf9629', 'Casette Deployment', 2, { kind: 'spacecraft-at-one-planet-family', atLeast: 3, spacecraft: 'orbiter-or-lander', moonsCountWithParent: true }, 10, 'you have at least 3 orbiters and/or landers at a single planet, including its moons'),
  exertianCard(203602, 'a26e4e', 'Core-breach Exoplanet', 4, { kind: 'sector-wins', color: 'blue', atLeast: 2 }, 12, 'you have at least 2 wins in blue sectors'),
  exertianCard(203603, '47f13c', 'Deflector', 7, { kind: 'technology-count', technology: 'telescope', atLeast: 3 }, 15, 'you have at least 3 telescope techs'),
  exertianCard(203604, '6fd2d7', 'Expender Core', 3, { kind: 'technology-count', technology: 'computer', atLeast: 3 }, 9, 'you have at least 3 computer techs'),
  exertianCard(203605, 'f0d3d7', 'Extractor', 8, { kind: 'income-cards', atLeast: 8 }, 18, 'you have at least 8 cards tucked for income'),
  exertianCard(203606, 'b604d3', 'Fission-sun Exoplanet', 5, { kind: 'sector-wins', color: 'black', atLeast: 2 }, 14, 'you have at least 2 wins in black sectors'),
  exertianCard(203607, '8b977e', 'Generative Infrastructure', 7, { kind: 'lander-count', atLeast: 4, includeMoons: true }, 16, 'you have at least 4 landers, including landers on moons'),
  exertianCard(203608, '6ab118', 'Nanowielder Node', 1, { kind: 'same-color-traces', atLeast: 5 }, 8, 'you have at least 5 traces of the same color'),
  exertianCard(203609, '7b2b9e', 'Neuralab', 9, { kind: 'trace-count', species: 'other', atLeast: 6 }, 20, 'you have at least 6 traces for the other species'),
  exertianCard(203610, 'd57c0b', 'Oscillating Probes', 3, { kind: 'orbiter-count', atLeast: 3 }, 11, 'you have at least 3 orbiters'),
  exertianCard(203611, '7c6cd1', 'Pierced Exoplanet', 4, { kind: 'sector-wins', color: 'red', atLeast: 2 }, 12, 'you have at least 2 wins in red sectors'),
  exertianCard(203612, 'b4901a', 'Razor-edge Shuttle', 6, { kind: 'technology-count', technology: 'probe', atLeast: 3 }, 14, 'you have at least 3 probe techs'),
  exertianCard(203613, 'db3bae', 'Stratoelevator', 4, { kind: 'completed-missions', atLeast: 5 }, 12, 'you have completed at least 5 missions'),
  exertianCard(203614, 'a5f22d', 'Vortex Exoplanet', 4, { kind: 'sector-wins', color: 'yellow', atLeast: 2 }, 12, 'you have at least 2 wins in yellow sectors'),
];

export const SETI_ALIEN_CARDS: readonly SetiAlienCardDefinition[] = [
  ...MASCAMITE_CARDS,
  ...ANOMALY_CARDS,
  ...OUMUAMUA_CARDS,
  ...CENTAURIAN_CARDS,
  ...EXERTIAN_CARDS,
];

export const SETI_ALIEN_CARDS_BY_ID: Readonly<Record<string, SetiAlienCardDefinition>> = Object.fromEntries(
  SETI_ALIEN_CARDS.map((card) => [card.id, card]),
);

export const SETI_ALIEN_CARDS_BY_CARD_ID: Readonly<Record<number, SetiAlienCardDefinition>> = Object.fromEntries(
  SETI_ALIEN_CARDS.map((card) => [card.cardId, card]),
) as Record<number, SetiAlienCardDefinition>;

export const SETI_ALIEN_CARD_COUNTS = {
  mascamites: 10,
  anomalies: 10,
  oumuamua: 10,
  centaurians: 10,
  exertians: 15,
} as const satisfies Record<SetiAlienSpeciesId, number>;

function assertAlienCatalog(): void {
  if (SETI_ALIEN_CARDS.length !== 55) throw new Error(`SETI alien catalog must contain 55 cards, got ${SETI_ALIEN_CARDS.length}`);
  if (new Set(SETI_ALIEN_CARDS.map((card) => card.id)).size !== SETI_ALIEN_CARDS.length) throw new Error('SETI alien card ids must be unique');
  if (new Set(SETI_ALIEN_CARDS.map((card) => card.cardId)).size !== SETI_ALIEN_CARDS.length) throw new Error('SETI alien CardIDs must be unique');
  if (new Set(SETI_ALIEN_CARDS.map((card) => card.sourceGuid)).size !== SETI_ALIEN_CARDS.length) throw new Error('SETI alien source GUIDs must be unique');
  for (const species of Object.keys(SETI_ALIEN_CARD_COUNTS) as SetiAlienSpeciesId[]) {
    const actual = SETI_ALIEN_CARDS.filter((card) => card.species === species).length;
    if (actual !== SETI_ALIEN_CARD_COUNTS[species]) throw new Error(`${species} must contain ${SETI_ALIEN_CARD_COUNTS[species]} cards, got ${actual}`);
  }
  for (const card of SETI_ALIEN_CARDS) {
    if (!card.name || card.printedText.length === 0 || card.printedText.some((line) => line.trim().length === 0)) throw new Error(`Incomplete alien card ${card.cardId}`);
    if (card.art.cell !== card.cardId % 100 || card.art.column !== card.art.cell % 5 || card.art.row !== Math.floor(card.art.cell / 5)) throw new Error(`Bad art cell for alien card ${card.cardId}`);
    if (card.species === 'exertians') {
      if (!card.exertian || card.playCost || card.signalCorner || card.incomeCorner || card.freeCorner.length) throw new Error(`Bad Exertian shape ${card.cardId}`);
    } else if (!card.playCost || !card.signalCorner || !card.incomeCorner || card.freeCorner.length === 0) {
      throw new Error(`Missing printed cost/corners for alien card ${card.cardId}`);
    }
    if (card.species === 'centaurians' && !card.message) throw new Error(`Missing Centaurian message semantics ${card.cardId}`);
  }
  if (SETI_ALIEN_SPECIES.length !== 5 || new Set(SETI_ALIEN_SPECIES.map((species) => species.id)).size !== 5) throw new Error('SETI requires five unique alien species');
  if (SETI_MASCAMITE_SAMPLE_REWARDS.length !== 7 || SETI_ANOMALY_TOKENS.length !== 3 || SETI_CENTAURIAN_MESSAGE_REWARDS.length !== 4) throw new Error('SETI alien module component catalog is incomplete');
}

assertAlienCatalog();
