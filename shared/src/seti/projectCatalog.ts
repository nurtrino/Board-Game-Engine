// Complete SETI base-project catalog.
//
// Printed fields were read from the English cards staged from Workshop save
// 3415673254. Rules semantics follow the English rulebook and the official
// living FAQ. The compact helpers below are a declarative rules language: the
// reducer can interpret it without scraping prose or guessing icon meanings.

import {
  SETI_BASE_PROJECT_CARDS,
  SETI_PROMO_PROJECT_CARDS,
  type SetiBody,
  type SetiCardArtRef,
  type SetiIncomeKind,
  type SetiSignalColor,
  type SetiTraceColor,
} from './data.js';

export type SetiProjectFreeCorner = 'move' | 'publicity' | 'data';
export type SetiProjectCardType =
  | 'ordinary'
  | 'conditional-mission'
  | 'triggerable-mission'
  | 'end-game'
  | 'permanent';
export type SetiProjectResource = 'credit' | 'energy' | 'publicity' | 'data' | 'vp' | 'move';
export type SetiProjectTechnology = 'probe' | 'telescope' | 'computer';
// The rules call every colored marker a life trace, including markers placed
// on a revealed alien board or an overflow space. There is no second
// "intelligence" resource type.
export type SetiTraceStage = 'life';

export type SetiSignalTarget =
  | { kind: 'body-sector'; body: SetiBody }
  | { kind: 'earth-sector' }
  | { kind: 'named-sector'; sector: '61-virginis' | 'barnards-star' | 'beta-pictoris' | 'kepler-22' | 'procyon' | 'proxima-centauri' | 'sirius-a' | 'vega' }
  | { kind: 'color'; color: SetiSignalColor }
  | { kind: 'any-sector' }
  | { kind: 'own-probe-sector'; probeMustBeOnSolarSystem: true }
  | { kind: 'selected-probe-sectors'; owner: 'any'; distinctProbes: true; maximum: number }
  | { kind: 'own-probe-sector-and-neighbors'; probeMustBeOnSolarSystem: true }
  | { kind: 'discarded-card-signal' };

export type SetiProjectPredicate =
  | { kind: 'piece-at-body'; piece: 'orbiter-or-lander'; body: SetiBody; includeMoons: boolean }
  | { kind: 'piece-at-each-body'; piece: 'orbiter-or-lander'; bodies: readonly SetiBody[]; includeMoons: boolean }
  | { kind: 'piece-count'; piece: 'orbiter' | 'lander' | 'orbiter-or-lander'; atLeast: number; includeMoons: boolean }
  | { kind: 'planetary-system-pair'; pieces: readonly ['orbiter', 'lander']; includeMoons: true }
  | { kind: 'probe-on-feature'; feature: 'asteroid' | 'comet'; adjacentTo?: 'Earth' }
  | { kind: 'probe-distance-from-earth'; spacesAtLeast: number }
  | { kind: 'sector-wins'; color?: SetiSignalColor; atLeast: number; sameSector?: true }
  | { kind: 'current-signals-in-distinct-sectors'; atLeast: number; currentOnly: true }
  | { kind: 'trace-count'; color: SetiTraceColor; stage: SetiTraceStage; atLeast: number; species: 'any' | 'each' }
  | { kind: 'trace-colors-on-one-species'; colors: readonly SetiTraceColor[]; stage: SetiTraceStage }
  | { kind: 'technology-count'; technology: SetiProjectTechnology; atLeast: number }
  | { kind: 'publicity'; atLeast: number }
  | { kind: 'score'; atLeast: number }
  | { kind: 'hand-size'; equals: number; exertianCardsAreNotHand: true }
  | { kind: 'visited-this-turn'; target: { kind: 'body'; body: SetiBody } | { kind: 'feature'; feature: 'asteroid' | 'comet' } }
  | { kind: 'moved-same-ring-this-turn' }
  | { kind: 'completed-sector-this-turn' }
  | { kind: 'landed-with-this-effect'; bodies: readonly SetiBody[]; includeMoons: boolean; anyMoon?: true }
  | { kind: 'marked-signal-with-this-effect'; atLeast: number; color?: SetiSignalColor }
  | { kind: 'tech-taken-with-this-effect-was-researched-by-another' }
  | { kind: 'exact-own-signals-in-target-sector'; count: number }
  | { kind: 'probe-in-ring'; ring: 'outermost' };

export type SetiCountMetric =
  | { kind: 'pieces-at-body'; piece: 'orbiter-or-lander'; body: SetiBody; includeMoons: boolean }
  | { kind: 'sector-wins'; color: SetiSignalColor }
  | { kind: 'sectors-with-current-signal' }
  | { kind: 'signals-marked-by-this-effect'; color?: SetiSignalColor; distinctSectors?: true }
  | { kind: 'adjacent-features-to-selected-probe'; feature: 'asteroid' }
  | { kind: 'tucked-income-cards'; income: SetiIncomeKind }
  | { kind: 'hand-cards'; income?: SetiIncomeKind; freeCorner?: SetiProjectFreeCorner }
  | { kind: 'traces'; color: SetiTraceColor | 'chosen-by-previous-op'; stage: SetiTraceStage }
  | { kind: 'technologies'; technology: SetiProjectTechnology | 'chosen-by-previous-op' }
  | { kind: 'publicity' }
  | { kind: 'unique-planets-visited-this-turn'; includeEarth: true }
  | { kind: 'planets-and-comets-in-earth-sector'; maximum: 3 };

export type SetiProjectOp =
  | { kind: 'gain'; resource: SetiProjectResource; amount: number }
  | { kind: 'gain-per'; resource: SetiProjectResource; amount: number; metric: SetiCountMetric }
  | { kind: 'draw-project'; amount: number; source: 'deck' | 'row-or-deck' }
  | { kind: 'launch'; amount: number; cost: 'free'; ignoreProbeLimit?: true }
  | { kind: 'move'; amount: number }
  | { kind: 'land'; cost: 'free'; ignoreMoonTechnology?: true; allowOccupiedSpaceAndGainCoveredReward?: true }
  | { kind: 'scan'; baseCost: 'waived'; optionalTechnologyCosts: 'pay' }
  | {
      kind: 'research';
      technology: SetiProjectTechnology | 'any' | readonly ['probe', 'telescope'];
      cost: 'free';
      rotateSolarSystem: boolean;
      gainTileReward: boolean;
      onlyIfResearchedByAnother?: true;
      bindChoiceAs?: 'chosen-by-previous-op';
      skipPrintedTileBonusOnly?: true;
    }
  | { kind: 'mark-signal'; amount: number; target: SetiSignalTarget; gainData: boolean }
  | { kind: 'discard-market-for-signals'; amount: number; refill: 'after-all-discards' }
  | { kind: 'discard-hand-for-signals'; minimum: number; maximum: number }
  | { kind: 'discard-deck-top-for-signal'; repeat: number; sequential: true; signalMandatory: true }
  | { kind: 'mark-trace'; stage: SetiTraceStage; color: SetiTraceColor | 'any'; species: 'choose' | 'same-as-condition'; bindColorAs?: 'chosen-by-previous-op'; requiresLifeTraceSameColor?: true }
  | { kind: 'remove-piece'; piece: 'orbiter' | 'lander'; from: 'any-planet' | 'any-planet-or-moon'; firstRewardSpaceBecomesAvailable: true }
  | { kind: 'resolve-drawn-project-free-corner' }
  | { kind: 'discard-market-for-free-corners'; amount: 3; refill: 'after-all-discards' }
  | { kind: 'tuck-income'; card: 'this-card' | 'one-from-hand'; gainPrintedIncomeImmediately: true }
  | { kind: 'resolve-rightmost-unmarked-gold-tile-space' }
  | { kind: 'return-this-card-to-hand' }
  | { kind: 'mark-signals-at-selected-probes'; maximum: 3; probes: 'distinct-any-owner' }
  | { kind: 'survey-selected-probe'; dataIfOnAsteroid: 2; dataPerAdjacentAsteroid: 1; adjacency: 'orthogonal' }
  | { kind: 'temporary-rule'; rule: 'replace-visit-publicity-with-move' | 'ignore-asteroid-exit-surcharge'; duration: 'this-turn' }
  | { kind: 'if'; condition: SetiProjectPredicate; then: readonly SetiProjectOp[] }
  | {
      kind: 'install-pluto';
      ownerOnly: true;
      orbitCapacity: 1;
      landCapacity: 1;
      probeRequirement: { ring: 'outermost' };
      orbitCost: { credit: 1; energy: 1 };
      landCost: { energy: 3; energyWithOrbiter: 2; technologyDiscountApplies: true };
      orbitReward: readonly SetiProjectOp[];
      landReward: readonly SetiProjectOp[];
      countsAsPlanet: true;
    };

export type SetiProjectTrigger =
  | { kind: 'visit-body'; body: SetiBody; excludeEarth?: true }
  | { kind: 'visit-any-planet'; excludeEarth: true }
  | { kind: 'visit-feature'; feature: 'asteroid'; onlyOnOwnersTurn: true }
  | { kind: 'complete-sector' }
  | { kind: 'mark-signal'; color: SetiSignalColor }
  | { kind: 'research'; technology: SetiProjectTechnology }
  | { kind: 'mark-trace'; stage: SetiTraceStage; color: SetiTraceColor }
  | { kind: 'scan' }
  | { kind: 'launch' }
  | { kind: 'orbit' | 'land' | 'orbit-or-land'; body?: SetiBody; includeMoons?: boolean }
  | { kind: 'discard-hand-card-for-free-corner'; freeCorner: SetiProjectFreeCorner; qualifyingAlienCorners: true }
  | { kind: 'play-project-as-main-action'; printedCost: 1 | 2 | 3 }
  | {
      kind: 'orbit-or-land-at-mars-or-play-mars-flavor';
      includeMarsMoons: true;
      flavorNeedle: 'Mars';
      qualifyingBaseProjectCardIds: readonly number[];
    };

export interface SetiMissionSlot {
  id: string;
  trigger: SetiProjectTrigger;
  operations: readonly SetiProjectOp[];
}

export type SetiProjectEffect =
  | { timing: 'on-play'; operations: readonly SetiProjectOp[] }
  | { timing: 'conditional-mission'; condition: SetiProjectPredicate; operations: readonly SetiProjectOp[]; optionalCompletion: true }
  | { timing: 'triggerable-mission'; slots: readonly SetiMissionSlot[]; claimLimitPerTrigger: 1; optionalClaim: true }
  | { timing: 'end-game'; condition?: SetiProjectPredicate; operations: readonly SetiProjectOp[] }
  | { timing: 'permanent'; operations: readonly SetiProjectOp[] };

export type SetiProjectRuling =
  | { kind: 'include-moons'; officialCardNumber: 58 | 60 | 112 }
  | { kind: 'one-mission-slot-per-trigger'; officialCardNumber: 117 }
  | { kind: 'current-signals-before-sector-resolution'; officialCardNumber: 88; markedSignals: 2; probeMustBeOnSolarSystem: true }
  | { kind: 'herschel-current-markers'; officialCardNumber: 134; markedSignals: 1; probeMustBeOnSolarSystem: true; completeBeforeSectorResolution: true }
  | { kind: 'card-scan-waives-base-cost-only' }
  | { kind: 'telescope-time-allocation-before-sector-resolution'; officialCardNumber: 101 }
  | { kind: 'lagrange-return-before-sector-resolution'; officialCardNumber: 120 }
  | { kind: 'pluto-official-faq' };

export interface SetiProjectCatalogCard {
  id: string;
  sourceCardId: number;
  officialNumber: number | null;
  promoCode: 'SE EN 01' | 'SE EN 02' | null;
  canonicalName: string;
  sourceName: string;
  sourceGuid: string;
  promo: boolean;
  art: SetiCardArtRef;
  cost: 0 | 1 | 2 | 3 | 4;
  signalColor: SetiSignalColor;
  matchingSectorRule: 'either active sector of signalColor';
  freeCorner: SetiProjectFreeCorner;
  income: SetiIncomeKind;
  cardType: SetiProjectCardType;
  requirements: readonly SetiProjectPredicate[];
  effects: readonly SetiProjectEffect[];
  rulings: readonly SetiProjectRuling[];
}

interface AuthoredDefinition {
  officialNumber: number | null;
  sourceCardId: number;
  promoCode: 'SE EN 01' | 'SE EN 02' | null;
  canonicalName: string;
  effects: readonly SetiProjectEffect[];
  rulings: readonly SetiProjectRuling[];
}

const gain = (resource: SetiProjectResource, amount: number): SetiProjectOp => ({ kind: 'gain', resource, amount });
const draw = (amount = 1, source: 'deck' | 'row-or-deck' = 'row-or-deck'): SetiProjectOp => ({ kind: 'draw-project', amount, source });
const launch = (amount = 1, ignoreProbeLimit = false): SetiProjectOp => ({ kind: 'launch', amount, cost: 'free', ...(ignoreProbeLimit ? { ignoreProbeLimit: true as const } : {}) });
const move = (amount: number): SetiProjectOp => ({ kind: 'move', amount });
const scan = (): SetiProjectOp => ({ kind: 'scan', baseCost: 'waived', optionalTechnologyCosts: 'pay' });
const research = (
  technology: SetiProjectTechnology | 'any' | readonly ['probe', 'telescope'],
  options: Partial<Extract<SetiProjectOp, { kind: 'research' }>> = {},
): SetiProjectOp => ({ kind: 'research', technology, cost: 'free', rotateSolarSystem: true, gainTileReward: true, ...options });
const signal = (amount: number, target: SetiSignalTarget, gainData = true): SetiProjectOp => ({ kind: 'mark-signal', amount, target, gainData });
const trace = (color: SetiTraceColor | 'any', stage: SetiTraceStage = 'life', species: 'choose' | 'same-as-condition' = 'choose'): SetiProjectOp => ({ kind: 'mark-trace', color, stage, species });
const per = (resource: SetiProjectResource, amount: number, metric: SetiCountMetric): SetiProjectOp => ({ kind: 'gain-per', resource, amount, metric });
const when = (condition: SetiProjectPredicate, ...then: SetiProjectOp[]): SetiProjectOp => ({ kind: 'if', condition, then });
const onPlay = (...operations: SetiProjectOp[]): SetiProjectEffect => ({ timing: 'on-play', operations });
const conditional = (condition: SetiProjectPredicate, ...operations: SetiProjectOp[]): SetiProjectEffect => ({ timing: 'conditional-mission', condition, operations, optionalCompletion: true });
const endGame = (...operations: SetiProjectOp[]): SetiProjectEffect => ({ timing: 'end-game', operations });
const endGameIf = (condition: SetiProjectPredicate, ...operations: SetiProjectOp[]): SetiProjectEffect => ({ timing: 'end-game', condition, operations });
const missionSlot = (id: string, trigger: SetiProjectTrigger, ...operations: SetiProjectOp[]): SetiMissionSlot => ({ id, trigger, operations });
const triggered = (...slots: SetiMissionSlot[]): SetiProjectEffect => ({ timing: 'triggerable-mission', slots, claimLimitPerTrigger: 1, optionalClaim: true });
const definition = (
  officialNumber: number | null,
  sourceCardId: number,
  canonicalName: string,
  effects: readonly SetiProjectEffect[],
  rulings: readonly SetiProjectRuling[] = [],
  promoCode: 'SE EN 01' | 'SE EN 02' | null = null,
): AuthoredDefinition => ({ officialNumber, sourceCardId, promoCode, canonicalName, effects, rulings });

const bodySector = (body: SetiBody): SetiSignalTarget => ({ kind: 'body-sector', body });
const namedSector = (sector: Extract<SetiSignalTarget, { kind: 'named-sector' }>['sector']): SetiSignalTarget => ({ kind: 'named-sector', sector });
const colorSector = (color: SetiSignalColor): SetiSignalTarget => ({ kind: 'color', color });
const pieceAt = (body: SetiBody, includeMoons: boolean): SetiProjectPredicate => ({ kind: 'piece-at-body', piece: 'orbiter-or-lander', body, includeMoons });
const wins = (color: SetiSignalColor, atLeast: number): SetiProjectPredicate => ({ kind: 'sector-wins', color, atLeast });
const traces = (color: SetiTraceColor, atLeast: number, species: 'any' | 'each' = 'any'): SetiProjectPredicate => ({ kind: 'trace-count', color, stage: 'life', atLeast, species });

// sourceCardId cost signalColor freeCorner
const PRINTED_METADATA_SOURCE = `
204400 3 red publicity
204500 2 blue move
204501 1 blue publicity
204502 1 red data
204503 3 blue move
204504 2 red publicity
204505 2 yellow move
204506 2 black publicity
204507 3 blue data
204508 3 yellow publicity
204509 0 red move
204510 0 red publicity
204511 3 red publicity
204512 1 blue move
204513 2 blue publicity
204514 1 blue move
204515 1 yellow publicity
204516 1 blue publicity
204517 1 red publicity
204518 1 red publicity
204519 1 black publicity
204520 3 red publicity
204521 2 blue move
204522 1 yellow publicity
204523 1 yellow publicity
204524 1 black publicity
204525 1 blue publicity
204526 1 red data
204527 2 blue move
204528 1 blue move
204529 3 red publicity
204530 3 blue publicity
204531 1 yellow data
204532 3 blue publicity
204533 2 black publicity
204534 1 blue data
204535 2 black data
204536 3 yellow move
204537 4 black move
204538 2 red move
204539 3 red publicity
204540 1 blue data
204541 3 red publicity
204542 4 yellow move
204543 0 red move
204544 1 red publicity
204545 3 yellow publicity
204546 3 yellow publicity
204547 1 yellow publicity
204548 1 yellow publicity
204549 2 yellow move
204550 2 black move
204551 1 black move
204552 1 red move
204553 1 red publicity
204554 2 yellow move
204555 3 red publicity
204556 2 red data
204557 2 yellow publicity
204558 1 yellow data
204559 3 red data
204560 2 blue publicity
204561 1 blue publicity
204562 2 red publicity
204563 2 blue publicity
204564 3 black move
204565 2 red publicity
204566 2 blue data
204567 3 red move
204568 1 yellow publicity
204569 3 yellow data
204600 0 blue move
204601 2 blue move
204602 1 yellow data
204603 2 red move
204604 2 yellow publicity
204605 1 red publicity
204606 3 yellow publicity
204607 1 yellow publicity
204608 3 blue data
204609 1 blue move
204610 2 yellow data
204611 1 yellow data
204612 2 blue publicity
204613 2 blue move
204614 3 black data
204615 3 red data
204616 2 red data
204617 1 black move
204618 1 yellow move
204619 2 yellow move
204620 1 blue publicity
204621 0 yellow move
204622 3 blue data
204623 1 red publicity
204624 3 yellow publicity
204625 1 yellow data
204626 2 red data
204627 2 yellow publicity
204628 1 red data
204629 2 yellow publicity
204630 3 yellow move
204631 2 yellow move
204632 3 black publicity
204633 3 red publicity
204634 2 blue publicity
204635 1 blue publicity
204636 2 blue publicity
204637 2 red data
204638 3 blue data
204639 1 black publicity
204640 2 red data
204641 1 black data
204642 3 blue move
204643 2 red move
204644 2 blue data
204645 2 yellow data
204646 3 black move
204647 3 blue publicity
204648 4 red publicity
204649 1 yellow move
204650 2 yellow move
204651 1 red data
204652 2 yellow publicity
204653 1 blue data
204654 1 blue data
204655 2 blue publicity
204656 2 red publicity
204657 1 red publicity
204658 3 blue move
204659 2 red move
204660 1 yellow publicity
204661 2 red move
204662 2 yellow publicity
204663 0 yellow move
204664 3 yellow data
204665 2 blue move
204666 3 blue move
41500 1 blue data
204700 0 red move
`;

interface PrintedMetadata {
  cost: 0 | 1 | 2 | 3 | 4;
  signalColor: SetiSignalColor;
  freeCorner: SetiProjectFreeCorner;
}

const PRINTED_METADATA: ReadonlyMap<number, PrintedMetadata> = new Map(
  PRINTED_METADATA_SOURCE.trim().split('\n').map((line) => {
    const [idText, costText, signalColor, freeCorner] = line.trim().split(/\s+/);
    return [Number(idText), {
      cost: Number(costText) as PrintedMetadata['cost'],
      signalColor: signalColor as SetiSignalColor,
      freeCorner: freeCorner as SetiProjectFreeCorner,
    }] as const;
  }),
);

const CARD_DEFINITIONS: readonly AuthoredDefinition[] = [
  definition(1, 204621, 'Pioneer 11 Mission', [
    triggered(
      missionSlot('jupiter-data', { kind: 'visit-body', body: 'Jupiter' }, gain('data', 1)),
      missionSlot('saturn-vp', { kind: 'visit-body', body: 'Saturn' }, gain('vp', 4)),
    ),
  ]),
  definition(2, 204600, 'Mariner 10 Mission', [
    triggered(
      missionSlot('mercury-card', { kind: 'visit-body', body: 'Mercury' }, draw(1, 'deck')),
      missionSlot('venus-publicity', { kind: 'visit-body', body: 'Venus' }, gain('publicity', 1)),
    ),
  ]),
  definition(3, 204663, 'Voyager 2 Mission', [
    triggered(
      missionSlot('uranus-energy', { kind: 'visit-body', body: 'Uranus' }, gain('energy', 1)),
      missionSlot('neptune-credit', { kind: 'visit-body', body: 'Neptune' }, gain('credit', 1)),
    ),
  ]),
  definition(4, 204543, 'Galileo Mission', [
    triggered(
      missionSlot('venus-publicity', { kind: 'visit-body', body: 'Venus' }, gain('publicity', 1)),
      missionSlot('jupiter-data', { kind: 'visit-body', body: 'Jupiter' }, gain('data', 1)),
    ),
  ]),
  definition(5, 204658, 'Venera Probe', [
    onPlay(launch(), gain('publicity', 1)),
    conditional(pieceAt('Venus', false), gain('vp', 7), gain('publicity', 1)),
  ]),
  definition(6, 204559, 'Juno Probe', [
    onPlay(launch(), gain('data', 1)),
    conditional(pieceAt('Jupiter', true), gain('vp', 7), gain('publicity', 1)),
  ]),
  definition(7, 204606, 'MESSENGER Probe', [
    onPlay(launch(), move(1)),
    conditional(pieceAt('Mercury', false), gain('vp', 7), gain('publicity', 1)),
  ]),
  definition(8, 204520, 'Cassini Probe', [
    onPlay(launch(), draw()),
    conditional(pieceAt('Saturn', true), gain('vp', 6), gain('publicity', 1)),
  ]),
  definition(9, 204536, 'Falcon Heavy', [onPlay(launch(2, true), gain('publicity', 1))]),
  definition(10, 204614, 'ODINUS Mission', [
    onPlay(research('probe')),
    conditional(
      { kind: 'piece-at-each-body', piece: 'orbiter-or-lander', bodies: ['Neptune', 'Uranus'], includeMoons: true },
      gain('vp', 5), draw(),
    ),
  ]),
  definition(11, 204547, 'Grant', [onPlay(draw(), { kind: 'resolve-drawn-project-free-corner' })]),
  definition(12, 204533, 'Europa Clipper', [
    onPlay({ kind: 'land', cost: 'free', ignoreMoonTechnology: true }),
    endGame(per('vp', 3, { kind: 'pieces-at-body', piece: 'orbiter-or-lander', body: 'Jupiter', includeMoons: true })),
  ]),
  definition(13, 204620, 'Perseverance Rover', [
    onPlay(
      { kind: 'land', cost: 'free' },
      when(
        { kind: 'landed-with-this-effect', bodies: ['Mars', 'Mercury'], includeMoons: false, anyMoon: true },
        gain('vp', 4),
      ),
    ),
  ]),
  definition(14, 204603, 'Mars Science Laboratory', [
    onPlay(gain('publicity', 1), gain('data', 2)),
    endGame(per('vp', 4, { kind: 'pieces-at-body', piece: 'orbiter-or-lander', body: 'Mars', includeMoons: true })),
  ]),
  definition(15, 204512, 'Atmospheric Entry', [
    onPlay(
      { kind: 'remove-piece', piece: 'orbiter', from: 'any-planet', firstRewardSpaceBecomesAvailable: true },
      gain('vp', 3), gain('data', 1), draw(),
    ),
  ]),
  definition(16, 204528, 'Dragonfly', [
    onPlay({ kind: 'land', cost: 'free', allowOccupiedSpaceAndGainCoveredReward: true }),
  ]),
  definition(17, 204618, 'OSIRIS-REx', [
    onPlay({ kind: 'survey-selected-probe', dataIfOnAsteroid: 2, dataPerAdjacentAsteroid: 1, adjacency: 'orthogonal' }),
  ]),
  definition(18, 204551, 'Hayabusa', [
    onPlay(when({ kind: 'probe-on-feature', feature: 'asteroid' }, trace('orange'))),
  ]),
  definition(19, 204548, 'Gravitational Slingshot', [
    onPlay(move(2), { kind: 'temporary-rule', rule: 'replace-visit-publicity-with-move', duration: 'this-turn' }),
  ]),
  definition(20, 204605, 'Mercury Flyby', [
    onPlay(move(2), when({ kind: 'visited-this-turn', target: { kind: 'body', body: 'Mercury' } }, gain('vp', 4))),
  ]),
  definition(21, 204660, 'Venus Flyby', [
    onPlay(move(2), when({ kind: 'visited-this-turn', target: { kind: 'body', body: 'Venus' } }, gain('vp', 3))),
  ]),
  definition(22, 204602, 'Mars Flyby', [
    onPlay(move(2), when({ kind: 'visited-this-turn', target: { kind: 'body', body: 'Mars' } }, gain('vp', 4))),
  ]),
  definition(23, 204561, 'Jupiter Flyby', [
    onPlay(move(2), when({ kind: 'visited-this-turn', target: { kind: 'body', body: 'Jupiter' } }, gain('vp', 4))),
  ]),
  definition(24, 204637, 'Saturn Flyby', [
    onPlay(move(2), when({ kind: 'visited-this-turn', target: { kind: 'body', body: 'Saturn' } }, gain('vp', 6))),
  ]),
  definition(25, 204565, 'Lightsail', [
    onPlay(move(4), per('vp', 1, { kind: 'unique-planets-visited-this-turn', includeEarth: true })),
  ]),
  definition(26, 204653, 'Through the Asteroid Belt', [
    onPlay(move(2), { kind: 'temporary-rule', rule: 'ignore-asteroid-exit-surcharge', duration: 'this-turn' }),
  ]),
  definition(27, 204553, 'Hubble Space Telescope', [
    onPlay(move(1), signal(1, { kind: 'own-probe-sector', probeMustBeOnSolarSystem: true })),
  ]),
  definition(28, 204563, 'Kepler Space Telescope', [
    onPlay(move(1), signal(2, { kind: 'own-probe-sector', probeMustBeOnSolarSystem: true })),
  ]),
  definition(29, 204557, 'James Webb Space Telescope', [
    onPlay(move(1), signal(3, { kind: 'own-probe-sector-and-neighbors', probeMustBeOnSolarSystem: true })),
  ]),
  definition(30, 204549, 'Great Observatories Project', [
    onPlay({ kind: 'mark-signals-at-selected-probes', maximum: 3, probes: 'distinct-any-owner' }),
  ]),
  definition(31, 204645, 'Space Launch System', [
    onPlay(launch(), move(1)),
    conditional({ kind: 'piece-count', piece: 'lander', atLeast: 3, includeMoons: false }, gain('credit', 1)),
  ]),
  definition(32, 204604, 'Mercury Exploration Program', [
    onPlay(signal(2, bodySector('Mercury'))),
    conditional(pieceAt('Mercury', false), gain('vp', 4)),
  ]),
  definition(33, 204659, 'Venus Exploration Program', [
    onPlay(signal(2, bodySector('Venus'))),
    conditional(pieceAt('Venus', false), gain('vp', 4)),
  ]),
  definition(34, 204601, 'Mars Exploration Program', [
    onPlay(signal(2, bodySector('Mars'))),
    conditional(pieceAt('Mars', true), gain('vp', 4)),
  ]),
  definition(35, 204560, 'Jupiter Exploration Program', [
    onPlay(signal(2, bodySector('Jupiter'))),
    conditional(pieceAt('Jupiter', true), gain('vp', 4)),
  ]),
  definition(36, 204636, 'Saturn Exploration Program', [
    onPlay(signal(2, bodySector('Saturn'))),
    conditional(pieceAt('Saturn', true), gain('vp', 4)),
  ]),
  definition(37, 204631, 'Proxima Centauri Observation', [
    onPlay(signal(2, namedSector('proxima-centauri'))),
    conditional(wins('red', 2), gain('vp', 4), gain('publicity', 1)),
  ]),
  definition(38, 204513, "Barnard's Star Observation", [
    onPlay(signal(2, namedSector('barnards-star'))),
    endGame(per('vp', 3, { kind: 'sector-wins', color: 'red' })),
  ]),
  definition(39, 204500, '61 Virginis Observation', [
    onPlay(signal(2, namedSector('61-virginis'))),
    conditional(wins('yellow', 2), gain('vp', 4), gain('publicity', 1)),
  ]),
  definition(40, 204562, 'Kepler 22 Observation', [
    onPlay(signal(2, namedSector('kepler-22'))),
    endGame(per('vp', 3, { kind: 'sector-wins', color: 'yellow' })),
  ]),
  definition(41, 204643, 'Sirius A Observation', [
    onPlay(signal(2, namedSector('sirius-a'))),
    conditional(wins('blue', 2), gain('vp', 4), gain('publicity', 1)),
  ]),
  definition(42, 204629, 'Procyon Observation', [
    onPlay(signal(2, namedSector('procyon'))),
    endGame(per('vp', 3, { kind: 'sector-wins', color: 'blue' })),
  ]),
  definition(43, 204514, 'Beta Pictoris Observation', [
    onPlay(signal(1, namedSector('beta-pictoris'))),
    conditional(wins('black', 1), gain('vp', 2), gain('publicity', 1)),
  ]),
  definition(44, 204657, 'Vega Observation', [
    onPlay(signal(1, namedSector('vega'))),
    endGame(per('vp', 3, { kind: 'sector-wins', color: 'black' })),
  ]),
  definition(45, 204504, 'Allen Telescope Array', [
    onPlay(
      { kind: 'discard-market-for-signals', amount: 2, refill: 'after-all-discards' },
      when({ kind: 'completed-sector-this-turn' }, gain('energy', 1)),
    ),
  ]),
  definition(46, 204505, 'ALMA Observatory', [
    onPlay(
      { kind: 'discard-market-for-signals', amount: 2, refill: 'after-all-discards' },
      when({ kind: 'completed-sector-this-turn' }, draw(1, 'deck')),
    ),
  ]),
  definition(47, 204662, 'Very Large Array', [
    onPlay(
      { kind: 'discard-market-for-signals', amount: 2, refill: 'after-all-discards' },
      when({ kind: 'completed-sector-this-turn' }, gain('data', 1)),
    ),
  ]),
  definition(48, 204516, 'Breakthrough Starshot', [onPlay(move(1), signal(1, colorSector('red')))]),
  definition(49, 204517, 'Breakthrough Watch', [onPlay(move(1), signal(1, colorSector('yellow')))]),
  definition(50, 204647, 'Square Kilometre Array', [
    onPlay(
      { kind: 'discard-market-for-signals', amount: 3, refill: 'after-all-discards' },
      per('vp', 2, { kind: 'signals-marked-by-this-effect', distinctSectors: true }),
    ),
  ]),
  definition(51, 204567, 'Lovell Telescope', [
    onPlay(gain('data', 1), scan()),
    conditional({ kind: 'publicity', atLeast: 8 }, gain('vp', 3), draw()),
  ], [{ kind: 'card-scan-waives-base-cost-only' }]),
  definition(52, 204619, 'Parkes Observatory', [
    onPlay(scan(), per('vp', 2, { kind: 'signals-marked-by-this-effect', color: 'red' })),
  ], [{ kind: 'card-scan-waives-base-cost-only' }]),
  definition(53, 204527, 'Deep Synoptic Array', [
    onPlay(scan(), per('vp', 2, { kind: 'signals-marked-by-this-effect', color: 'yellow' })),
  ], [{ kind: 'card-scan-waives-base-cost-only' }]),
  definition(54, 204661, 'VERITAS Telescopes', [
    onPlay(scan(), per('vp', 2, { kind: 'signals-marked-by-this-effect', color: 'blue' })),
  ], [{ kind: 'card-scan-waives-base-cost-only' }]),
  definition(55, 204508, 'Arecibo Observatory', [
    onPlay(scan(), signal(1, { kind: 'any-sector' })),
  ], [{ kind: 'card-scan-waives-base-cost-only' }]),
  definition(56, 204515, 'Breakthrough Listen', [onPlay(move(1), signal(1, colorSector('blue')))]),
  definition(57, 204530, 'Effelsberg Telescope Construction', [onPlay(draw(), research('telescope'))]),
  definition(58, 204656, 'Uranus Orbiter and Probe', [
    onPlay(launch()),
    conditional(pieceAt('Uranus', true), gain('vp', 3), draw(1, 'deck')),
  ], [{ kind: 'include-moons', officialCardNumber: 58 }]),
  definition(59, 204555, 'Ion Propulsion System', [onPlay(gain('energy', 1), research('probe'))]),
  definition(60, 204655, 'Trident Probe', [
    onPlay(launch()),
    conditional(pieceAt('Neptune', true), gain('vp', 4), gain('data', 1)),
  ], [{ kind: 'include-moons', officialCardNumber: 60 }]),
  definition(61, 204632, 'Quantum Computer', [
    onPlay(research('computer')),
    conditional({ kind: 'score', atLeast: 50 }, { kind: 'tuck-income', card: 'one-from-hand', gainPrintedIncomeImmediately: true }),
  ]),
  definition(62, 204615, 'Onsala Telescope Construction', [
    onPlay(research('telescope')),
    endGame(per('vp', 2, { kind: 'traces', color: 'purple', stage: 'life' })),
  ]),
  definition(63, 204642, 'SHERLOC', [
    onPlay(research('probe')),
    endGame(per('vp', 2, { kind: 'traces', color: 'orange', stage: 'life' })),
  ]),
  definition(64, 204503, 'ALICE', [
    onPlay(research('computer')),
    conditional(traces('blue', 1, 'each'), gain('data', 2)),
  ]),
  definition(65, 204537, 'FAST Telescope Construction', [
    onPlay({ kind: 'discard-market-for-signals', amount: 2, refill: 'after-all-discards' }, research('telescope')),
  ]),
  definition(66, 204545, 'GMRT Telescope Construction', [
    onPlay(research('telescope')),
    conditional(traces('purple', 1, 'each'), gain('vp', 2), gain('energy', 1)),
  ]),
  definition(67, 204666, 'Yevpatoria Telescope Construction', [
    onPlay(gain('publicity', 1), research('telescope'), { kind: 'discard-hand-for-signals', minimum: 0, maximum: 1 }),
  ]),
  definition(68, 204529, 'DUNE', [
    onPlay(research('computer')),
    endGame(per('vp', 2, { kind: 'traces', color: 'blue', stage: 'life' })),
  ]),
  definition(69, 204564, 'Large Hadron Collider', [onPlay(gain('data', 1), research('computer'))]),
  definition(70, 204511, 'ATLAS', [
    onPlay(research('computer')),
    conditional(traces('blue', 3), gain('vp', 3), gain('data', 1)),
  ]),
  definition(71, 204539, 'Focused Research', [
    onPlay(
      research('any', { bindChoiceAs: 'chosen-by-previous-op' }),
      per('vp', 2, { kind: 'technologies', technology: 'chosen-by-previous-op' }),
    ),
  ]),
  definition(72, 204638, 'Scientific Cooperation', [
    onPlay(
      research('any'),
      when({ kind: 'tech-taken-with-this-effect-was-researched-by-another' }, gain('publicity', 2)),
    ),
  ]),
  definition(73, 204522, 'Clean Space Initiative', [onPlay({ kind: 'discard-market-for-free-corners', amount: 3, refill: 'after-all-discards' })]),
  definition(74, 204627, 'Pre-launch Testing', [
    onPlay(launch(), per('move', 1, { kind: 'hand-cards', freeCorner: 'move' })),
  ]),
  definition(75, 204535, 'Extremophiles Study', [
    onPlay(
      { kind: 'mark-trace', color: 'any', stage: 'life', species: 'choose', bindColorAs: 'chosen-by-previous-op' },
      per('vp', 1, { kind: 'traces', color: 'chosen-by-previous-op', stage: 'life' }),
    ),
  ]),
  definition(76, 204609, 'NASA Research Center', [
    triggered(
      missionSlot('probe-energy', { kind: 'research', technology: 'probe' }, gain('energy', 1)),
      missionSlot('telescope-publicity', { kind: 'research', technology: 'telescope' }, gain('publicity', 1)),
      missionSlot('computer-card', { kind: 'research', technology: 'computer' }, draw()),
    ),
  ]),
  definition(77, 204607, 'NASA Astrobiology Institute', [
    onPlay(gain('publicity', 1)),
    triggered(
      missionSlot('purple-trace-data', { kind: 'mark-trace', stage: 'life', color: 'purple' }, gain('data', 1)),
      missionSlot('orange-trace-data', { kind: 'mark-trace', stage: 'life', color: 'orange' }, gain('data', 1)),
      missionSlot('blue-trace-data', { kind: 'mark-trace', stage: 'life', color: 'blue' }, gain('data', 1)),
    ),
  ]),
  definition(78, 204640, 'SETI Institute', [
    onPlay(gain('publicity', 1)),
    triggered(
      missionSlot('scan-data', { kind: 'scan' }, gain('data', 2)),
      missionSlot('scan-card', { kind: 'scan' }, draw()),
      missionSlot('scan-vp', { kind: 'scan' }, gain('vp', 4)),
    ),
  ]),
  definition(79, 204556, 'ISS', [
    onPlay(gain('publicity', 1)),
    triggered(
      missionSlot('launch-credit', { kind: 'launch' }, gain('credit', 1)),
      missionSlot('launch-card', { kind: 'launch' }, draw()),
      missionSlot('launch-vp', { kind: 'launch' }, gain('vp', 5)),
    ),
  ]),
  definition(80, 204519, 'Cape Canaveral SFS', [
    triggered(
      missionSlot('launch-move-1', { kind: 'launch' }, move(1)),
      missionSlot('launch-move-2', { kind: 'launch' }, move(1)),
      missionSlot('launch-move-3', { kind: 'launch' }, move(1)),
    ),
  ]),
  definition(81, 204554, 'International Collaboration', [
    onPlay(research('any', {
      onlyIfResearchedByAnother: true,
      rotateSolarSystem: false,
      gainTileReward: true,
      skipPrintedTileBonusOnly: true,
    })),
  ]),
  definition(82, 204558, 'Johnson Space Center', [
    triggered(
      missionSlot('orbit-publicity', { kind: 'orbit' }, gain('publicity', 2)),
      missionSlot('land-publicity', { kind: 'land' }, gain('publicity', 2)),
    ),
  ]),
  definition(83, 204665, 'Wow! Signal', [onPlay(gain('publicity', 1), signal(2, { kind: 'earth-sector' }))]),
  definition(84, 204635, 'Sample Return', [
    onPlay(
      { kind: 'remove-piece', piece: 'lander', from: 'any-planet-or-moon', firstRewardSpaceBecomesAvailable: true },
      trace('orange'),
    ),
  ]),
  definition(85, 204648, 'Starship', [onPlay(launch(), research('probe'))]),
  definition(86, 204544, 'Giant Magellan Telescope', [
    onPlay(
      { kind: 'discard-market-for-signals', amount: 1, refill: 'after-all-discards' },
      per('vp', 1, { kind: 'sectors-with-current-signal' }),
    ),
  ]),
  definition(87, 204630, 'Project Longshot', [
    onPlay(research('probe')),
    conditional({ kind: 'probe-distance-from-earth', spacesAtLeast: 5 }, gain('vp', 3), gain('energy', 1)),
  ]),
  definition(88, 204521, 'Chandra Space Observatory', [
    onPlay(signal(2, { kind: 'own-probe-sector', probeMustBeOnSolarSystem: true })),
    conditional({ kind: 'current-signals-in-distinct-sectors', atLeast: 4, currentOnly: true }, gain('publicity', 2)),
  ], [{ kind: 'current-signals-before-sector-resolution', officialCardNumber: 88, markedSignals: 2, probeMustBeOnSolarSystem: true }]),
  definition(89, 204612, 'NIAC Program', [
    onPlay(draw(3, 'deck')),
    conditional({ kind: 'hand-size', equals: 0, exertianCardsAreNotHand: true }, draw()),
  ]),
  definition(90, 204540, 'Fuel Tanks Construction', [
    onPlay(per('energy', 1, { kind: 'hand-cards', income: 'energy' })),
  ]),
  definition(91, 204541, 'Fusion Reactor', [
    onPlay(
      per('energy', 1, { kind: 'tucked-income-cards', income: 'energy' }),
      { kind: 'tuck-income', card: 'this-card', gainPrintedIncomeImmediately: true },
    ),
  ]),
  definition(92, 204608, 'NASA Image of the Day', [
    onPlay(
      gain('publicity', 2),
      per('publicity', 1, { kind: 'tucked-income-cards', income: 'card' }),
      { kind: 'tuck-income', card: 'this-card', gainPrintedIncomeImmediately: true },
    ),
  ]),
  definition(93, 204546, 'Government Funding', [
    onPlay(
      per('vp', 3, { kind: 'tucked-income-cards', income: 'credit' }),
      { kind: 'tuck-income', card: 'this-card', gainPrintedIncomeImmediately: true },
    ),
  ]),
  definition(94, 204626, 'Popularization of Science', [
    onPlay(gain('publicity', 1)),
    triggered(
      missionSlot('probe-publicity', { kind: 'research', technology: 'probe' }, gain('publicity', 2)),
      missionSlot('telescope-publicity', { kind: 'research', technology: 'telescope' }, gain('publicity', 2)),
      missionSlot('computer-publicity', { kind: 'research', technology: 'computer' }, gain('publicity', 2)),
    ),
  ]),
  definition(95, 204610, 'Near-Earth Asteroids Survey', [
    onPlay(gain('publicity', 2)),
    conditional({ kind: 'probe-on-feature', feature: 'asteroid', adjacentTo: 'Earth' }, gain('vp', 5), draw()),
  ]),
  definition(96, 204650, 'Tardigrades Study', [
    onPlay(gain('publicity', 1), gain('data', 1), draw(1, 'deck')),
    conditional(traces('orange', 3), trace('orange')),
  ]),
  definition(97, 204507, 'Apollo 11 Mission', [
    onPlay(research('probe')),
    conditional(traces('orange', 1, 'each'), gain('vp', 2), draw(1, 'deck')),
  ]),
  definition(98, 204526, 'Coronal Spectrograph', [
    onPlay({ kind: 'mark-trace', color: 'purple', stage: 'life', species: 'choose', requiresLifeTraceSameColor: true }),
  ]),
  definition(99, 204531, 'Electron Microscope', [
    onPlay({ kind: 'mark-trace', color: 'orange', stage: 'life', species: 'choose', requiresLifeTraceSameColor: true }),
  ]),
  definition(100, 204534, 'Exascale Supercomputer', [
    onPlay({ kind: 'mark-trace', color: 'blue', stage: 'life', species: 'choose', requiresLifeTraceSameColor: true }),
  ]),
  definition(101, 204652, 'Telescope Time Allocation', [
    triggered(
      missionSlot('scan-yellow-signal', { kind: 'scan' }, signal(1, colorSector('yellow'))),
      missionSlot('scan-red-signal', { kind: 'scan' }, signal(1, colorSector('red'))),
      missionSlot('scan-blue-signal', { kind: 'scan' }, signal(1, colorSector('blue'))),
    ),
  ], [{ kind: 'telescope-time-allocation-before-sector-resolution', officialCardNumber: 101 }]),
  definition(102, 204566, 'Linguistic Analysis', [
    onPlay(gain('publicity', 3)),
    conditional(
      { kind: 'trace-colors-on-one-species', colors: ['purple', 'orange', 'blue'], stage: 'life' },
      trace('any', 'life', 'same-as-condition'),
    ),
  ]),
  definition(103, 204664, 'Westerbork Synthesis Radio Telescope', [
    onPlay(research('telescope')),
    conditional({ kind: 'sector-wins', atLeast: 2, sameSector: true }, gain('vp', 9)),
  ]),
  definition(104, 204634, 'Rosetta Probe', [
    onPlay(launch()),
    conditional({ kind: 'probe-on-feature', feature: 'comet' }, gain('vp', 3), gain('data', 1)),
  ]),
  definition(105, 204550, 'Green Bank Telescope', [
    onPlay(scan()),
    conditional(traces('purple', 3), trace('purple')),
  ], [{ kind: 'card-scan-waives-base-cost-only' }]),
  definition(106, 204649, 'Strategic Planning', [
    triggered(
      missionSlot('cost-1-vp', { kind: 'play-project-as-main-action', printedCost: 1 }, gain('vp', 2)),
      missionSlot('cost-2-card', { kind: 'play-project-as-main-action', printedCost: 2 }, draw()),
      missionSlot('cost-3-publicity', { kind: 'play-project-as-main-action', printedCost: 3 }, gain('publicity', 2)),
    ),
  ]),
  definition(107, 204538, 'First Black Hole Photo', [
    onPlay(gain('data', 2)),
    triggered(
      missionSlot('blue-trace-publicity', { kind: 'mark-trace', stage: 'life', color: 'blue' }, gain('publicity', 2)),
      missionSlot('blue-trace-vp', { kind: 'mark-trace', stage: 'life', color: 'blue' }, gain('vp', 4)),
    ),
  ]),
  definition(108, 204641, 'SETI@Home', [
    onPlay(when({ kind: 'publicity', atLeast: 8 }, trace('purple'))),
  ]),
  definition(109, 204569, 'Low-Power Microprocessors', [onPlay(gain('energy', 1), research('computer'))]),
  definition(110, 204628, 'Press Statement', [onPlay(gain('publicity', 3))]),
  definition(111, 204633, 'Roman Space Telescope', [
    onPlay(research('telescope')),
    conditional({ kind: 'piece-count', piece: 'orbiter', atLeast: 2, includeMoons: false }, gain('data', 2)),
  ]),
  definition(112, 204624, 'Planetary Geologic Mapping', [
    onPlay(research('probe')),
    conditional(
      { kind: 'planetary-system-pair', pieces: ['orbiter', 'lander'], includeMoons: true },
      gain('vp', 3), gain('data', 1),
    ),
  ], [{ kind: 'include-moons', officialCardNumber: 112 }]),
  definition(113, 204644, 'Solvay Conference', [
    onPlay(gain('publicity', 2)),
    endGame({ kind: 'resolve-rightmost-unmarked-gold-tile-space' }),
  ]),
  definition(114, 204623, 'Planet Hunters', [
    onPlay(draw(), { kind: 'discard-hand-for-signals', minimum: 0, maximum: 3 }),
  ]),
  definition(115, 204518, 'Canadian Hydrogen Telescope', [
    onPlay(signal(1, { kind: 'any-sector' })),
    conditional({ kind: 'technology-count', technology: 'telescope', atLeast: 3 }, gain('data', 1)),
  ]),
  definition(116, 204524, 'Control Center', [
    triggered(
      missionSlot('yellow-signal-move', { kind: 'mark-signal', color: 'yellow' }, move(1)),
      missionSlot('red-signal-move', { kind: 'mark-signal', color: 'red' }, move(1)),
      missionSlot('blue-signal-move', { kind: 'mark-signal', color: 'blue' }, move(1)),
    ),
  ]),
  definition(117, 204400, 'Lunar Gateway', [
    onPlay(launch()),
    triggered(
      missionSlot('orbit-or-land-launch', { kind: 'orbit-or-land' }, launch()),
      missionSlot('orbit-or-land-energy', { kind: 'orbit-or-land' }, gain('energy', 1)),
    ),
  ], [{ kind: 'one-mission-slot-per-trigger', officialCardNumber: 117 }]),
  definition(118, 204625, 'PLATO', [
    onPlay(signal(3, { kind: 'own-probe-sector', probeMustBeOnSolarSystem: true }, false)),
  ]),
  definition(119, 204622, 'PIXL', [
    onPlay(research('computer'), per('vp', 1, { kind: 'publicity' })),
  ]),
  definition(120, 204617, 'Orbiting Lagrange Point', [
    onPlay(
      signal(1, { kind: 'own-probe-sector', probeMustBeOnSolarSystem: true }),
      when({ kind: 'exact-own-signals-in-target-sector', count: 1 }, { kind: 'return-this-card-to-hand' }),
    ),
  ], [{ kind: 'lagrange-return-before-sector-resolution', officialCardNumber: 120 }]),
  definition(121, 204542, 'Future Circular Collider', [onPlay(gain('data', 3), research('computer'))]),
  definition(122, 204506, 'Amateur Astronomers', [
    onPlay({ kind: 'discard-deck-top-for-signal', repeat: 3, sequential: true, signalMandatory: true }),
  ]),
  definition(123, 204510, 'Asteroids Flyby', [
    onPlay(move(1), when({ kind: 'visited-this-turn', target: { kind: 'feature', feature: 'asteroid' } }, gain('data', 1))),
  ]),
  definition(124, 204523, 'Cometary Encounter', [
    onPlay(move(2), when({ kind: 'visited-this-turn', target: { kind: 'feature', feature: 'comet' } }, gain('vp', 4))),
  ]),
  definition(125, 204654, 'Trajectory Correction', [
    onPlay(move(1), when({ kind: 'moved-same-ring-this-turn' }, gain('vp', 3), gain('publicity', 1))),
  ]),
  definition(126, 204532, 'Euclid Telescope Construction', [
    onPlay(research(['probe', 'telescope']), per('vp', 2, { kind: 'technologies', technology: 'computer' })),
  ]),
  definition(127, 204611, 'NEAR Shoemaker', [
    onPlay(gain('publicity', 2)),
    endGameIf({ kind: 'probe-on-feature', feature: 'asteroid' }, gain('vp', 13)),
  ]),
  definition(128, 204501, 'Advanced Navigation System', [
    triggered(
      missionSlot('planet-energy', { kind: 'visit-any-planet', excludeEarth: true }, gain('energy', 1)),
      missionSlot('planet-data', { kind: 'visit-any-planet', excludeEarth: true }, gain('data', 1)),
      missionSlot('planet-move', { kind: 'visit-any-planet', excludeEarth: true }, move(1)),
    ),
  ]),
  definition(129, 204509, 'Asteroids Research', [
    triggered(
      missionSlot('asteroid-data-1', { kind: 'visit-feature', feature: 'asteroid', onlyOnOwnersTurn: true }, gain('data', 1)),
      missionSlot('asteroid-data-2', { kind: 'visit-feature', feature: 'asteroid', onlyOnOwnersTurn: true }, gain('data', 1)),
      missionSlot('asteroid-data-3', { kind: 'visit-feature', feature: 'asteroid', onlyOnOwnersTurn: true }, gain('data', 1)),
    ),
  ]),
  definition(130, 204568, 'Low-Cost Space Launch', [onPlay(launch())]),
  definition(131, 204651, 'Telescope Modernization', [
    onPlay(draw()),
    triggered(
      missionSlot('telescope-publicity', { kind: 'research', technology: 'telescope' }, gain('publicity', 1)),
      missionSlot('scan-data', { kind: 'scan' }, gain('data', 1)),
    ),
  ]),
  definition(132, 204646, 'Space Shuttle', [
    onPlay(launch(), gain('publicity', 2)),
    conditional({ kind: 'piece-count', piece: 'orbiter-or-lander', atLeast: 5, includeMoons: true }, gain('vp', 3), gain('credit', 1)),
  ]),
  definition(133, 204616, 'Optimal Launch Window', [
    onPlay(launch(), per('move', 1, { kind: 'planets-and-comets-in-earth-sector', maximum: 3 })),
  ]),
  definition(134, 204552, 'Herschel Space Observatory', [
    onPlay(signal(1, { kind: 'own-probe-sector', probeMustBeOnSolarSystem: true })),
    conditional({ kind: 'current-signals-in-distinct-sectors', atLeast: 4, currentOnly: true }, gain('publicity', 2)),
  ], [{ kind: 'herschel-current-markers', officialCardNumber: 134, markedSignals: 1, probeMustBeOnSolarSystem: true, completeBeforeSectorResolution: true }]),
  definition(135, 204613, 'Noto Radio Observatory', [onPlay(gain('publicity', 1), scan())], [
    { kind: 'card-scan-waives-base-cost-only' },
  ]),
  definition(136, 204502, 'Algonquin Radio Observatory', [
    onPlay(
      signal(1, colorSector('yellow'), false),
      signal(1, colorSector('red'), false),
      signal(1, colorSector('blue'), false),
      signal(1, colorSector('black'), false),
    ),
  ]),
  definition(137, 204639, 'SETI Data Archive', [onPlay(gain('data', 2))]),
  definition(138, 204525, 'Cornell University', [
    triggered(
      missionSlot('publicity-corner', { kind: 'discard-hand-card-for-free-corner', freeCorner: 'publicity', qualifyingAlienCorners: true }, gain('publicity', 1)),
      missionSlot('data-corner', { kind: 'discard-hand-card-for-free-corner', freeCorner: 'data', qualifyingAlienCorners: true }, gain('data', 1)),
      missionSlot('move-corner', { kind: 'discard-hand-card-for-free-corner', freeCorner: 'move', qualifyingAlienCorners: true }, move(1)),
    ),
  ]),
  definition(null, 41500, 'Gateway to Mars', [
    triggered(
      missionSlot('mars-publicity', {
        kind: 'orbit-or-land-at-mars-or-play-mars-flavor',
        includeMarsMoons: true,
        flavorNeedle: 'Mars',
        qualifyingBaseProjectCardIds: [204601, 204602, 204603, 204609, 204620, 204622, 204635, 204648],
      }, gain('publicity', 2)),
      missionSlot('mars-vp', {
        kind: 'orbit-or-land-at-mars-or-play-mars-flavor',
        includeMarsMoons: true,
        flavorNeedle: 'Mars',
        qualifyingBaseProjectCardIds: [204601, 204602, 204603, 204609, 204620, 204622, 204635, 204648],
      }, gain('vp', 5)),
    ),
  ], [], 'SE EN 02'),
  definition(null, 204700, 'Not a planet since 2006', [
    {
      timing: 'permanent',
      operations: [{
        kind: 'install-pluto',
        ownerOnly: true,
        orbitCapacity: 1,
        landCapacity: 1,
        probeRequirement: { ring: 'outermost' },
        orbitCost: { credit: 1, energy: 1 },
        landCost: { energy: 3, energyWithOrbiter: 2, technologyDiscountApplies: true },
        orbitReward: [gain('vp', 11), gain('publicity', 3), trace('any')],
        landReward: [gain('vp', 11), gain('data', 4), trace('orange')],
        countsAsPlanet: true,
      }],
    },
  ], [{ kind: 'pluto-official-faq' }], 'SE EN 01'),
];

function cardTypeFor(effects: readonly SetiProjectEffect[]): SetiProjectCardType {
  if (effects.some((effect) => effect.timing === 'permanent')) return 'permanent';
  if (effects.some((effect) => effect.timing === 'end-game')) return 'end-game';
  if (effects.some((effect) => effect.timing === 'triggerable-mission')) return 'triggerable-mission';
  if (effects.some((effect) => effect.timing === 'conditional-mission')) return 'conditional-mission';
  return 'ordinary';
}

const sourceCards = [...SETI_BASE_PROJECT_CARDS, ...SETI_PROMO_PROJECT_CARDS];
const sourceByCardId = new Map(sourceCards.map((card) => [card.art.sourceCardId, card] as const));

function buildCatalogCard(authored: AuthoredDefinition): SetiProjectCatalogCard {
  const source = sourceByCardId.get(authored.sourceCardId);
  if (!source) throw new Error(`SETI catalog references unknown CardID ${authored.sourceCardId}`);
  const metadata = PRINTED_METADATA.get(authored.sourceCardId);
  if (!metadata) throw new Error(`SETI catalog is missing printed metadata for CardID ${authored.sourceCardId}`);
  const requirements = authored.effects.flatMap((effect) =>
    (effect.timing === 'conditional-mission' || effect.timing === 'end-game') && effect.condition
      ? [effect.condition]
      : [],
  );
  return {
    id: source.id,
    sourceCardId: authored.sourceCardId,
    officialNumber: authored.officialNumber,
    promoCode: authored.promoCode,
    canonicalName: authored.canonicalName,
    sourceName: source.name,
    sourceGuid: source.sourceGuid,
    promo: source.promo,
    art: source.art,
    cost: metadata.cost,
    signalColor: metadata.signalColor,
    matchingSectorRule: 'either active sector of signalColor',
    freeCorner: metadata.freeCorner,
    income: source.printed.incomeCorner,
    cardType: cardTypeFor(authored.effects),
    requirements,
    effects: authored.effects,
    rulings: authored.rulings,
  };
}

export const SETI_PROJECT_CATALOG: readonly SetiProjectCatalogCard[] = CARD_DEFINITIONS.map(buildCatalogCard);
export const SETI_BASE_PROJECT_CATALOG: readonly SetiProjectCatalogCard[] = SETI_PROJECT_CATALOG
  .filter((card) => !card.promo)
  .sort((left, right) => (left.officialNumber ?? 999) - (right.officialNumber ?? 999));
export const SETI_PROMO_PROJECT_CATALOG: readonly SetiProjectCatalogCard[] = SETI_PROJECT_CATALOG.filter((card) => card.promo);
export const SETI_PROJECT_CATALOG_BY_ID: Readonly<Record<string, SetiProjectCatalogCard>> = Object.fromEntries(
  SETI_PROJECT_CATALOG.map((card) => [card.id, card]),
);
export const SETI_PROJECT_CATALOG_BY_CARD_ID: Readonly<Record<number, SetiProjectCatalogCard>> = Object.fromEntries(
  SETI_PROJECT_CATALOG.map((card) => [card.sourceCardId, card]),
);

// Fail fast if source extraction or an authored entry drifts. These assertions
// deliberately live beside the catalog so incomplete decks cannot boot.
if (SETI_BASE_PROJECT_CATALOG.length !== 138) {
  throw new Error(`SETI project catalog must contain 138 base cards, got ${SETI_BASE_PROJECT_CATALOG.length}`);
}
if (SETI_PROMO_PROJECT_CATALOG.length !== 2) {
  throw new Error(`SETI project catalog must contain 2 promos, got ${SETI_PROMO_PROJECT_CATALOG.length}`);
}
if (new Set(SETI_PROJECT_CATALOG.map((card) => card.sourceCardId)).size !== SETI_PROJECT_CATALOG.length) {
  throw new Error('SETI project catalog contains duplicate CardIDs');
}
if (new Set(SETI_PROJECT_CATALOG.map((card) => card.id)).size !== SETI_PROJECT_CATALOG.length) {
  throw new Error('SETI project catalog contains duplicate stable ids');
}
const officialNumbers = SETI_BASE_PROJECT_CATALOG.map((card) => card.officialNumber);
if (officialNumbers.some((number, index) => number !== index + 1)) {
  throw new Error('SETI project catalog must contain every official card number from 1 through 138 exactly once');
}
if (PRINTED_METADATA.size !== SETI_PROJECT_CATALOG.length) {
  throw new Error(`SETI printed metadata must contain 140 entries, got ${PRINTED_METADATA.size}`);
}
