type UnknownRecord = Record<string, unknown>;

export type SetiSeatColor = 'white' | 'green' | 'purple' | 'orange' | string;

export interface SetiUiOwnedTech {
  stackId: string;
  tileId: string;
  computerSlot: number | null;
}

export interface SetiUiComputerTech {
  stackId: string;
  boardSlot: number;
  lower: boolean;
}

export interface SetiUiComputer {
  top: boolean[];
  tech: SetiUiComputerTech[];
}

export interface SetiUiPlayer {
  seat: number;
  name: string;
  color: SetiSeatColor;
  score: number;
  finalScore: number | null;
  finalScoreBreakdown: { base: number; gold: number; projects: number; aliens: number; total: number } | null;
  publicity: number;
  credits: number;
  energy: number;
  dataPool: number;
  computer: SetiUiComputer;
  techs: SetiUiOwnedTech[];
  hand: string[];
  alienHand: string[];
  hiddenExertian: string[];
  income: string[];
  missions: string[];
  completedMissions: string[];
  scoringCards: string[];
  permanentCards: string[];
  goldClaims: string[];
  goldClaimDetails: { threshold: number; tileId: string; pointsPerSet: number | null; claimOrder: number | null }[];
  passed: boolean;
}

export interface SetiUiPiece {
  id: string;
  owner: number;
  kind: string;
  cell: string;
  supportLayer: number;
  body?: string;
}

export interface SetiUiSector {
  id: string;
  data: number;
  capacity: number;
  markers: { owner: number; order: number }[];
  wins: number[];
  winner?: number;
}

export interface SetiUiPlanet {
  body: string;
  orbiters: number[];
  landers: number[];
  firstLandingBonuses: number[];
}

export interface SetiUiPlacedSpacecraft {
  id: string;
  owner: number;
  kind: 'orbiter' | 'lander';
  body: string;
  spaceId: string;
  coveredReward: { kind: string; amount?: number } | null;
}

export interface SetiUiTechStack {
  id: string;
  type: string;
  count: number;
  top?: string;
  bonus: boolean;
}

export interface SetiUiSpecies {
  id: string;
  revealed: boolean;
  faceUp: string;
  deckCount: number;
  module: UnknownRecord;
  markers: { id: string; owner: number; color: string; space?: string }[];
}

export interface SetiUiPending {
  kind: string;
  owner: number;
  prompt: string;
  options: unknown[];
  raw: UnknownRecord;
}

export interface SetiUiLegal {
  canEndTurn: boolean;
  canPass: boolean;
  canLaunch: boolean;
  canAnalyze: boolean;
  canResearch: boolean;
  moveTargets: Record<string, string[]>;
  orbitTargets: Record<string, string[]>;
  landTargets: Record<string, string[]>;
  scanSectorTargets: string[];
  techStackTargets: string[];
  traceTargets: string[];
  playableCards: string[];
  cornerCards: string[];
  placeDataSlots: number[];
  buyableRow: number[];
}

export interface SetiUiEvent {
  seq: number;
  title: string;
  detail: string;
  seat?: number;
  kind: string;
}

export interface SetiUiSolo {
  difficulty: number;
  rivalScore: number;
  rivalPublicity: number;
  progress: number;
  progressLoops: number;
  activeObjectives: { objectiveId: string; marked: boolean[] }[];
  completedObjectives: string[];
  objectiveDeckCount: number;
  actionDeckCount: number;
  actionDiscardCount: number;
  currentActionCard: string | null;
  lastActionCard: string | null;
  lastActionStep: number | null;
  techs: { probe: number; telescope: number; computer: number };
  computer: boolean[];
  dataPool: number;
  rivalStartsRound: boolean;
  passed: boolean;
  /** Legacy aggregate retained for old presentation components. */
  techTokens: number;
}

export interface SetiUiGoldTile {
  id: string;
  side: string;
}

export interface SetiUiView {
  round: number;
  phase: string;
  activeSeat: number;
  startingSeat: number;
  you: number | null;
  mainActionTaken: boolean;
  passedSeats: number[];
  players: SetiUiPlayer[];
  orientations: number[];
  rotationPointer: number;
  pieces: SetiUiPiece[];
  bodyCells: Record<string, string>;
  sectorBoardOrder: string[];
  sectors: SetiUiSector[];
  planets: SetiUiPlanet[];
  placedSpacecraft: SetiUiPlacedSpacecraft[];
  projectRow: string[];
  projectDeckCount: number;
  projectDiscard: string[];
  roundEndCount: number;
  neutralMilestonesRemaining: { 20: number; 30: number };
  techStacks: SetiUiTechStack[];
  goldTiles: SetiUiGoldTile[];
  species: SetiUiSpecies[];
  pending: SetiUiPending | null;
  solo: SetiUiSolo | null;
  lastEvent: SetiUiEvent | null;
  winners: number[];
  legal: SetiUiLegal;
  raw: UnknownRecord;
}

const record = (value: unknown): UnknownRecord => value && typeof value === 'object' && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined || value === '') return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};
const boolean = (value: unknown): boolean => value === true;
const cardId = (value: unknown): string => {
  if (typeof value === 'string') return value;
  const item = record(value);
  return text(item.id ?? item.cardId ?? item.card ?? item.stackId ?? item.tileId ?? item.key);
};
const stringList = (value: unknown): string[] => list(value).map(cardId).filter(Boolean);
const indexedValues = (value: unknown): unknown[] => Array.isArray(value) ? value : Object.values(record(value));

function stringMap(value: unknown): Record<string, string[]> {
  return Object.fromEntries(Object.entries(record(value)).map(([key, values]) => [key, stringList(values)]));
}

function normalizePlayer(value: unknown, index: number, passedSeats: number[]): SetiUiPlayer {
  const player = record(value);
  const resources = record(player.resources);
  const seat = number(player.seat ?? player.index, index);
  return {
    seat,
    name: text(player.name ?? player.agency, `AGENCY ${seat + 1}`),
    color: text(player.color ?? player.seatColor, ['white', 'green', 'purple', 'orange'][seat] ?? 'white').toLowerCase(),
    score: number(player.score ?? player.vp ?? player.points),
    finalScore: player.finalScore === null || player.finalScore === undefined ? null : number(player.finalScore),
    finalScoreBreakdown: (() => {
      const breakdown = record(player.finalScoreBreakdown);
      return Object.keys(breakdown).length ? {
        base: number(breakdown.base),
        gold: number(breakdown.gold),
        projects: number(breakdown.projects),
        aliens: number(breakdown.aliens),
        total: number(breakdown.total),
      } : null;
    })(),
    publicity: number(player.publicity ?? resources.publicity),
    credits: number(player.credits ?? resources.credits ?? resources.credit),
    energy: number(player.energy ?? resources.energy),
    dataPool: number(player.dataPool ?? player.data ?? resources.data),
    computer: normalizeComputer(player.computer ?? player.computerData ?? player.dataComputer),
    techs: normalizeOwnedTechs(player.techs ?? player.technologies),
    hand: stringList(player.hand ?? player.projectHand),
    alienHand: stringList(player.alienHand ?? player.alienCards),
    hiddenExertian: stringList(player.hiddenExertian),
    income: [
      ...stringList(player.incomeCards ?? player.tuckedCards ?? player.income),
      ...stringList(player.alienIncomeCards),
    ],
    missions: [
      ...stringList(player.missions ?? player.projects ?? player.tableau),
      ...stringList(player.alienMissions),
    ],
    completedMissions: [
      ...stringList(player.completedMissions),
      ...stringList(player.completedAlienMissions),
    ],
    scoringCards: [
      ...stringList(player.scoringCards),
      ...stringList(player.alienScoringCards),
    ],
    permanentCards: stringList(player.permanentCards),
    goldClaims: stringList(player.goldClaims),
    goldClaimDetails: list(player.goldClaims).map((entry) => {
      const claim = record(entry);
      return {
        threshold: number(claim.threshold),
        tileId: text(claim.tileId ?? claim.id),
        pointsPerSet: claim.pointsPerSet === undefined || claim.pointsPerSet === null ? null : number(claim.pointsPerSet),
        claimOrder: claim.claimOrder === undefined || claim.claimOrder === null ? null : number(claim.claimOrder),
      };
    }).filter((claim) => !!claim.tileId),
    passed: boolean(player.passed) || passedSeats.includes(seat),
  };
}

function normalizeOwnedTechs(value: unknown): SetiUiOwnedTech[] {
  return list(value).map((entry) => {
    if (typeof entry === 'string') return { stackId: entry, tileId: entry, computerSlot: null };
    const tech = record(entry);
    return {
      stackId: text(tech.stackId ?? tech.id),
      tileId: text(tech.tileId ?? tech.tile ?? tech.id),
      computerSlot: tech.computerSlot === undefined || tech.computerSlot === null ? null : number(tech.computerSlot),
    };
  }).filter((tech) => !!tech.stackId);
}

function normalizeComputer(value: unknown): SetiUiComputer {
  const computer = record(value);
  if (Array.isArray(value)) return { top: value.slice(0, 6).map(boolean), tech: [] };
  const top = list(computer.top).slice(0, 6).map(boolean);
  const tech = Object.entries(record(computer.tech)).flatMap(([stackId, entry]) => {
    const slot = record(entry);
    if (!Object.keys(slot).length) return [];
    return [{
      stackId,
      boardSlot: number(slot.boardSlot ?? slot.slot),
      lower: boolean(slot.lower),
    }];
  });
  return { top: [...top, ...Array.from({ length: Math.max(0, 6 - top.length) }, () => false)], tech };
}

function normalizePiece(value: unknown, index: number): SetiUiPiece {
  const piece = record(value);
  return {
    id: text(piece.id ?? piece.pieceId, `piece-${index}`),
    owner: number(piece.owner ?? piece.seat ?? piece.player),
    kind: text(piece.kind ?? piece.type, 'probe').toLowerCase(),
    cell: cardId(piece.cell ?? piece.cellId ?? piece.location),
    supportLayer: number(piece.supportLayer ?? piece.support ?? piece.layer),
    body: text(piece.body ?? piece.planet) || undefined,
  };
}

function normalizeSector(value: unknown, key: string): SetiUiSector {
  const sector = record(value);
  const markers = list(sector.markers ?? sector.signals).map((entry, index) => {
    const marker = record(entry);
    return { owner: number(marker.owner ?? marker.seat ?? entry), order: number(marker.order ?? marker.sequence, index) };
  });
  return {
    id: text(sector.id, key),
    data: number(sector.data ?? sector.dataCount ?? sector.dataRemaining ?? sector.remainingData),
    capacity: number(sector.capacity ?? sector.size ?? sector.slots, Math.max(markers.length, 1)),
    markers,
    wins: list(sector.wins).map((entry) => number(record(entry).owner ?? entry)),
    winner: sector.winner === undefined && !list(sector.wins).length
      ? undefined
      : number(sector.winner ?? record(list(sector.wins)[0]).owner),
  };
}

function normalizeTech(value: unknown, index: number): SetiUiTechStack {
  const stack = record(value);
  return {
    id: text(stack.id ?? stack.stackId, `tech-${index}`),
    type: text(stack.type ?? stack.kind, /probe/i.test(text(stack.id ?? stack.stackId)) ? 'probe' : /telescope/i.test(text(stack.id ?? stack.stackId)) ? 'telescope' : /computer/i.test(text(stack.id ?? stack.stackId)) ? 'computer' : 'technology'),
    count: number(stack.count ?? list(stack.tiles).length, 1),
    top: cardId(stack.top ?? stack.topTile ?? stack.topTileId) || undefined,
    bonus: stack.bonus === undefined ? boolean(stack.firstTakeBonusAvailable ?? stack.firstTakeBonus ?? stack.hasBonus ?? true) : boolean(stack.bonus),
  };
}

function normalizeSpecies(value: unknown, index: number): SetiUiSpecies {
  const species = record(value);
  const discovery = Object.entries(record(species.discovery)).flatMap(([color, entry]) => entry ? [{ ...record(entry), color, space: `seti_species_${number(species.slot, index)}_discovery_${color}` }] : []);
  const research = list(species.research);
  return {
    id: text(species.id ?? species.speciesId, `species-${number(species.slot, index)}`),
    revealed: boolean(species.revealed) || boolean(species.isRevealed),
    faceUp: cardId(species.alienFaceUp ?? species.faceUp),
    deckCount: number(species.alienDeckCount ?? species.deckCount),
    module: record(species.module),
    markers: [...list(species.markers ?? species.researchMarkers), ...discovery, ...research].map((entry, markerIndex) => {
      const marker = record(entry);
      return {
        id: text(marker.id, `species-${index}-marker-${markerIndex}`),
        owner: number(marker.owner ?? marker.seat, -1),
        color: text(marker.color ?? marker.trace, 'universal'),
        space: text(marker.space ?? marker.spaceId) || undefined,
      };
    }),
  };
}

function normalizePending(value: unknown): SetiUiPending | null {
  const pending = Array.isArray(value) ? record(value[0]) : record(value);
  if (!Object.keys(pending).length) return null;
  const decision = record(pending.decision);
  const source = Object.keys(decision).length ? decision : pending;
  const kind = text(source.kind ?? pending.kind ?? source.type, 'choice');
  const options = list(source.options ?? source.choices ?? source.cards ?? source.targets);
  return {
    kind,
    owner: number(source.owner ?? pending.owner ?? source.seat ?? source.actor, -1),
    prompt: text(source.prompt ?? source.label ?? pending.prompt ?? source.title, kind.replace(/[-_]/g, ' ')),
    options,
    raw: source,
  };
}

function normalizeEvent(value: unknown): SetiUiEvent | null {
  const event = record(value);
  if (!Object.keys(event).length) return null;
  return {
    seq: number(event.seq ?? event.id),
    title: text(event.title ?? event.action ?? event.kind, 'MISSION UPDATE'),
    detail: text(event.detail ?? event.text ?? event.message),
    seat: event.seat === undefined && event.owner === undefined ? undefined : number(event.seat ?? event.owner),
    kind: text(event.kind ?? event.type, 'event'),
  };
}

export function normalizeSetiView(input: unknown): SetiUiView {
  const view = record(input);
  const solar = record(view.solar ?? view.solarSystem);
  const legal = record(view.legal ?? view.legalTargets);
  const passedSeats = list(view.passedSeats ?? view.passed).map((seat) => number(seat));
  const players = list(view.players).map((player, index) => normalizePlayer(player, index, passedSeats));
  const youValue = view.you ?? view.viewerSeat ?? view.playerSeat;
  const youRecord = record(youValue);
  const you = youValue === null || youValue === undefined
    ? null
    : number(youRecord.seat ?? youRecord.index ?? youValue, -1);
  const rawSectors = view.sectors;
  const sectors = Array.isArray(rawSectors)
    ? rawSectors.map((sector, index) => normalizeSector(sector, `sector-${index}`))
    : Object.entries(record(rawSectors)).map(([key, sector]) => normalizeSector(sector, key));
  const orientationRecord = record(solar.orientations ?? solar.layerOrientations ?? view.orientations);
  const orientations = Array.isArray(solar.orientations ?? solar.layerOrientations ?? view.orientations)
    ? list(solar.orientations ?? solar.layerOrientations ?? view.orientations).map((item) => number(record(item).orientation ?? record(item).steps ?? item))
    : [number(orientationRecord.disc1), number(orientationRecord.disc2), number(orientationRecord.disc3)];
  const winnerValues = list(view.winners ?? (view.winner === undefined ? [] : [view.winner]));
  const winners = winnerValues.map((winner) => {
    if (typeof winner === 'string') return players.find((player) => player.color.toLowerCase() === winner.toLowerCase())?.seat ?? -1;
    return number(winner, -1);
  }).filter((seat) => seat >= 0);
  const pending = normalizePending(view.pending ?? view.decisionQueue);
  if (pending && pending.options.length === 0) pending.options = list(legal.pendingOptions);
  return {
    round: number(view.round, 1),
    phase: text(view.phase, 'playing'),
    activeSeat: number(view.activeSeat ?? view.turn ?? view.currentSeat),
    startingSeat: number(view.startingSeat ?? view.firstSeat),
    you: you !== null && you >= 0 ? you : null,
    mainActionTaken: boolean(view.mainActionTaken ?? view.actedThisTurn),
    passedSeats,
    players,
    orientations,
    rotationPointer: number(solar.rotationPointer ?? solar.nextDisc ?? view.rotationPointer, 1),
    pieces: list(solar.pieces ?? view.solarPieces ?? view.pieces).map(normalizePiece),
    bodyCells: Object.fromEntries(Object.entries(record(solar.bodyCells)).map(([body, cell]) => [body, cardId(cell)]).filter(([, cell]) => !!cell)),
    sectorBoardOrder: stringList(view.sectorBoardOrder),
    sectors,
    planets: Object.entries(record(view.planets)).map(([body, value]) => {
      const planet = record(value);
      return {
        body: text(planet.body, body),
        orbiters: list(planet.orbiters).map((owner) => number(owner)),
        landers: list(planet.landers).map((owner) => number(owner)),
        firstLandingBonuses: list(planet.firstLandingBonuses).map((amount) => number(amount)),
      };
    }),
    placedSpacecraft: list(view.placedSpacecraft).map((value, index) => {
      const piece = record(value);
      const reward = record(piece.coveredReward);
      return {
        id: text(piece.id, `seti-spacecraft-${index}`),
        owner: number(piece.owner, -1),
        kind: text(piece.kind, 'lander') === 'orbiter' ? 'orbiter' as const : 'lander' as const,
        body: text(piece.body),
        spaceId: text(piece.spaceId),
        coveredReward: Object.keys(reward).length ? { kind: text(reward.kind), ...(reward.amount === undefined ? {} : { amount: number(reward.amount) }) } : null,
      };
    }),
    projectRow: list(view.projectRow ?? view.cardRow).map(cardId),
    projectDeckCount: number(view.projectDeckCount ?? view.deckCount),
    projectDiscard: stringList(view.projectDiscard ?? view.discard),
    roundEndCount: number(view.roundEndCount ?? view.endRoundCount),
    neutralMilestonesRemaining: {
      20: number(record(view.neutralMilestonesRemaining)[20] ?? record(view.neutralMilestonesRemaining)['20']),
      30: number(record(view.neutralMilestonesRemaining)[30] ?? record(view.neutralMilestonesRemaining)['30']),
    },
    techStacks: indexedValues(view.techStacks ?? view.technologyStacks).map(normalizeTech),
    goldTiles: indexedValues(view.goldTiles).map((value, index) => {
      const tile = record(value);
      return { id: text(tile.id ?? tile.tileId, `seti_gold_${index}`), side: text(tile.side, 'A') };
    }),
    species: indexedValues(view.species ?? view.aliens).map(normalizeSpecies),
    pending,
    solo: Object.keys(record(view.solo)).length ? (() => {
      const solo = record(view.solo);
      const techs = record(solo.techs);
      const normalizedTechs = {
        probe: number(techs.probe),
        telescope: number(techs.telescope),
        computer: number(techs.computer),
      };
      return {
        difficulty: number(solo.difficulty, 1),
        rivalScore: number(solo.rivalScore),
        rivalPublicity: number(solo.rivalPublicity),
        progress: number(solo.progress),
        progressLoops: number(solo.progressLoops),
        activeObjectives: list(solo.activeObjectives).map((value) => {
          if (typeof value === 'string') return { objectiveId: value, marked: [] };
          const objective = record(value);
          return { objectiveId: text(objective.objectiveId ?? objective.id), marked: list(objective.marked).map(boolean) };
        }).filter((objective) => !!objective.objectiveId),
        completedObjectives: stringList(solo.completedObjectives),
        objectiveDeckCount: number(solo.objectiveDeckCount),
        actionDeckCount: number(solo.actionDeckCount),
        actionDiscardCount: number(solo.actionDiscardCount),
        currentActionCard: cardId(solo.currentActionCard) || null,
        lastActionCard: cardId(solo.lastActionCard) || null,
        lastActionStep: solo.lastActionStep === null || solo.lastActionStep === undefined ? null : number(solo.lastActionStep),
        techs: normalizedTechs,
        computer: list(solo.computer).map(boolean),
        dataPool: number(solo.dataPool),
        rivalStartsRound: boolean(solo.rivalStartsRound),
        passed: boolean(solo.passed),
        techTokens: number(solo.techTokens, normalizedTechs.probe + normalizedTechs.telescope + normalizedTechs.computer),
      };
    })() : null,
    lastEvent: normalizeEvent(view.lastEvent ?? list(view.log).at(-1)),
    winners,
    legal: {
      canEndTurn: boolean(legal.canEndTurn),
      canPass: boolean(legal.canPass),
      canLaunch: boolean(legal.canLaunch),
      canAnalyze: boolean(legal.canAnalyze),
      canResearch: boolean(legal.canResearch),
      moveTargets: stringMap(legal.moveTargets),
      orbitTargets: stringMap(legal.orbitTargets),
      landTargets: stringMap(legal.landTargets),
      scanSectorTargets: stringList(legal.scanSectorTargets),
      techStackTargets: (() => {
        const explicit = stringList(legal.techStackTargets);
        return explicit.length ? explicit : pending?.kind === 'tech-stack' ? pending.options.map(cardId).filter(Boolean) : [];
      })(),
      traceTargets: stringList(legal.traceTargets),
      playableCards: stringList(legal.playableCards),
      cornerCards: (() => {
        const explicit = stringList(legal.cornerCards ?? legal.discardableCards);
        return explicit;
      })(),
      placeDataSlots: list(legal.placeDataSlots).map((slot) => number(slot)),
      buyableRow: list(legal.buyableRow).map((slot) => number(slot)),
    },
    raw: view,
  };
}

export const setiSeatColor = (color: string | undefined): string => {
  switch ((color ?? '').toLowerCase()) {
    case 'white': return '#f2efe7';
    case 'green': return '#80d3a0';
    case 'purple': return '#b29ae9';
    case 'orange': return '#f5a55c';
    default: return '#9fd9ed';
  }
};
