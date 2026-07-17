// Politik shared state, deterministic setup, public/private views, and control
// helpers.  Card art remains the source of truth for the 412 unique Politik
// effects; actions.ts supplies the guided resolver used for untranscribed text.

import data from './data.json';

export const POLITIK_DATA = data;

export const POLITIK_SEATS = ['Brown', 'Yellow', 'Blue', 'Green', 'Red', 'Purple'] as const;
export type PolitikSeat = (typeof POLITIK_SEATS)[number];

export const BASES = ['capitalism', 'communism', 'statism', 'fascism'] as const;
export type BaseId = (typeof BASES)[number];
export const COUNCIL_SEATS = ['chair', 'justice', 'commerce', 'labor', 'intel', 'defense'] as const;
export type CouncilId = (typeof COUNCIL_SEATS)[number];
export const INDUSTRIES = ['media', 'energy', 'financial', 'humanities', 'technology', 'manufacturing'] as const;
export type IndustryId = (typeof INDUSTRIES)[number];
export const MARKETS_PER_INDUSTRY = 15;
/** The physical mod contains exactly twenty Company boards/Margin dials. */
export const MAX_COMPANIES = 20;
export const PRICE_TRACKS = ['food', 'carbon', 'research', 'campaign', 'clash', 'educate'] as const;
export type PriceId = (typeof PRICE_TRACKS)[number];
export const ARENAS = ['military', 'political', 'corporate'] as const;
export type Arena = (typeof ARENAS)[number];
export const NATIONAL_ACTIONS = ['income', 'rally', 'produce', 'refresh'] as const;
export type NationalActionId = (typeof NATIONAL_ACTIONS)[number];
export type ResourceId = 'capital' | 'carbon' | 'food';
export type LocationId = string;

// Authentic colored connection lines extracted from the 5760x3840 board.
// Broadcast Stations connect into each of their two adjacent Region networks.
export const POLITIK_EDGES = data.board.adjacency as [LocationId, LocationId][];
export const POLITIK_ADJACENCY: Record<LocationId, LocationId[]> = {};
for (const [a, b] of POLITIK_EDGES) {
  (POLITIK_ADJACENCY[a] ??= []).push(b);
  (POLITIK_ADJACENCY[b] ??= []).push(a);
}

export interface NationDef {
  id: string;
  name: string;
  titleVerified: boolean;
  capital: number;
  carbon: number;
  food: number;
  support: number;
  leaders: number;
  card: { sheet: number; cell: number };
  propaganda: string[];
}

export interface PropagandaMeta {
  id: string;
  name: string;
  bases: BaseId[];
  corruption: boolean;
  negotiation: boolean;
  card: { sheet: number; cell: number };
}

export interface PolitikCardDef {
  id: string;
  name: string;
  type: 'asset' | 'company' | 'event' | 'propaganda';
  costText: string;
  focus: Record<Arena, number>;
  focusVerified: boolean;
  capitalCost: number | null;
  carbonCost: number | null;
  corruptionRequirement: number | null;
  supportCost: number | null;
  bases: BaseId[];
  declarationVerified: boolean;
  margin: number | 'X' | null;
  industries: IndustryId[];
  corruption: boolean;
  negotiation: boolean;
  edgeTimings: ('at_any_time' | 'after_cost' | 'during_focus' | 'after_reveal' | 'before_resolve' | 'other')[];
  edgeTriggerText: string[];
  structureVerified: boolean;
  rulesText: string;
  keywordsText: string;
}

export interface StartupDef {
  id: string;
  name: string;
  industries: IndustryId[];
  startingMargin: number;
  capitalCost: number;
  carbonCost: number;
  corruption: boolean;
}

export interface LandscapeDef {
  id: string;
  delta: -2 | -1 | 1 | 2;
  industries: IndustryId[];
  priceTracks: PriceId[];
}

export const NATIONS = data.cards.nationDefs as NationDef[];
export const NATION_BY_ID: Record<string, NationDef> = Object.fromEntries(NATIONS.map((n) => [n.id, n]));

// Setup-relevant icons transcribed from authentic sheet 10416.  Unity carries
// all four Base keywords.  The six cards bearing the Corruption icon draw an
// Obligation at setup.  Negotiation is a keyword used by Final Say.
const PROPAGANDA_ICONS: Record<string, { bases: BaseId[]; corruption?: boolean; negotiation?: boolean }> = {
  specializations: { bases: ['capitalism'] },
  homeland: { bases: ['statism'] },
  intensification: { bases: ['statism'] },
  cultureOfOpenness: { bases: ['statism'], negotiation: true },
  steelyWit: { bases: ['fascism'] },
  intimidationTactics: { bases: ['fascism'], corruption: true },
  oathOfPoverty: { bases: ['communism'] },
  honorCulture: { bases: ['fascism'] },
  assuredStability: { bases: ['communism'] },
  loftyRhetoric: { bases: ['communism'] },
  holisticLearnings: { bases: ['communism'] },
  unity: { bases: [...BASES] },
  proteges: { bases: ['communism'], corruption: true },
  improvisation: { bases: ['fascism'] },
  backchannels: { bases: ['capitalism'], corruption: true, negotiation: true },
  cryptocracy: { bases: ['capitalism'] },
  redEmpire: { bases: ['fascism'] },
  petrostate: { bases: ['statism'] },
  greyArea: { bases: ['capitalism'], corruption: true },
  dogmatic: { bases: ['statism'] },
  oldMoney: { bases: ['capitalism'], corruption: true },
  birthright: { bases: ['communism'] },
  marketmaker: { bases: ['capitalism'] },
  catchAndKill: { bases: ['fascism'], corruption: true },
};

export const PROPAGANDA: PropagandaMeta[] = data.cards.propagandaDefs.map((p) => ({
  ...p,
  bases: PROPAGANDA_ICONS[p.id]?.bases ?? [],
  corruption: !!PROPAGANDA_ICONS[p.id]?.corruption,
  negotiation: !!PROPAGANDA_ICONS[p.id]?.negotiation,
})) as PropagandaMeta[];
export const PROPAGANDA_BY_ID: Record<string, PropagandaMeta> = Object.fromEntries(PROPAGANDA.map((p) => [p.id, p]));
export const POLITIK_CARDS = data.cards.catalog as Record<string, PolitikCardDef>;
export const STARTUPS = data.cards.startupDefs as StartupDef[];
export const STARTUP_BY_ID: Record<string, StartupDef> = Object.fromEntries(STARTUPS.map((x) => [x.id, x]));
export const LANDSCAPES = data.cards.landscapeDefs as LandscapeDef[];
export const LANDSCAPE_BY_ID: Record<string, LandscapeDef> = Object.fromEntries(LANDSCAPES.map((x) => [x.id, x]));

export interface PolitikOptions {
  longWar?: boolean;
  trifecta?: boolean;
  teamGame?: boolean;
  draftGame?: boolean;
  ragingImperials?: boolean;
}

export interface HandCard {
  kind: 'politik' | 'obligation' | 'startup' | 'starting_propaganda';
  id: string;
}

export interface TableauCard {
  instanceId: string;
  card: HandCard;
  title: string;
  ready: boolean;
  bases: BaseId[];
  corruption: boolean;
  negotiation: boolean;
  industries: IndustryId[];
}

export interface CompanyState {
  id: string;
  card: HandCard;
  title: string;
  ready: boolean;
  printedIndustries: IndustryId[];
  industries: IndustryId[];
  markets: Partial<Record<IndustryId, number>>;
  margin: number;
  assets: TableauCard[];
  negotiation: boolean;
}

export interface PolitikPlayer {
  seat: number;
  color: PolitikSeat;
  name: string;
  nationChoices: string[];
  nation: string | null;
  startingPropaganda: string | null;
  propaganda: TableauCard[];
  hand: HandCard[];
  capital: number;
  carbon: number;
  food: number;
  corruption: number;
  support: Record<BaseId, number>;
  leaders: Record<Arena, number>;
  companies: CompanyState[];
  eventsInPlay: TableauCard[];
  nationalUsed: NationalActionId[];
  powerGrabs: Record<Arena, number>;
  immunity: { defense: boolean; temporary: boolean };
  negotiation: number;
  mulliganUsed: boolean;
  setupComplete: boolean;
}

export interface PolitikLocation {
  id: LocationId;
  name: string;
  kind: 'state' | 'station';
  region: string | null;
  regions: string[];
  benefit: 'research' | 'food' | 'carbon' | 'support' | null;
  influence: number[];
  imperialInfluence: number;
  stationCard: string | null;
  stationReady: boolean;
}

export interface ClashCardCommitment { card: HandCard; focus: number }
export interface ClashCommitment {
  cards: ClashCardCommitment[];
  leaders: number;
  focusInfluence: Partial<Record<LocationId, number>>;
  total: number;
}

export type ClashTarget =
  | { arena: 'military'; location: LocationId }
  | { arena: 'political'; council: CouncilId; defender: number }
  | { arena: 'corporate'; attackerCompany: string; defenderCompany: string; defender: number };

export interface PublicClash {
  arena: Arena;
  attacker: number;
  defender: number | null;
  target: ClashTarget;
  attackerCommitment: ClashCommitment;
  defenderCommitment: ClashCommitment | null;
  attackerTotal: number;
  defenderTotal: number;
  winner: number | null;
  imperialWon: boolean;
  difference: number;
  modifiers?: ClashModifier[];
  cancelled?: boolean;
}

export interface TradeTransfer {
  from: number;
  to: number;
  kind: 'capital' | 'carbon' | 'food' | 'hand_card' | 'margin' | 'market' | 'tableau_card' | 'state' | 'use' | 'favor';
  amount?: number;
  handIndex?: number;
  company?: string;
  toCompany?: string;
  industry?: IndustryId;
  tableauKind?: 'company' | 'asset' | 'propaganda';
  tableauId?: string;
  location?: LocationId;
  source?: { kind: 'company' | 'asset' | 'propaganda' | 'station'; id: string };
  activate?: boolean;
  favor?: string;
  /** Server-derived offer identity, present only in approver views. */
  card?: HandCard;
  /** Server-derived readable offer label, present only in approver views. */
  label?: string;
}

export interface EdgeWindow {
  kind: 'edge_window';
  seat: number;
  active: number;
  order: number[];
  cursor: number;
  passed: number[];
  reason: string;
}

export type ClashStage =
  | 'after_cost'
  | 'attacker_commit'
  | 'attacker_focus'
  | 'defender_commit'
  | 'defender_focus'
  | 'after_reveal'
  | 'before_resolve';

export interface ClashModifier {
  seat: number;
  side: 'attacker' | 'defender';
  amount: number;
  source: string;
}

export interface ClashPending {
  kind: 'clash';
  seat: number;
  stage: ClashStage;
  arena: Arena;
  attacker: number;
  defender: number | null;
  target: ClashTarget;
  commitments: Partial<Record<number, ClashCommitment>>;
  imperialCommitment: ClashCommitment | null;
  politicalLimit: { attacker: number; defender: number };
  modifiers: ClashModifier[];
  order: number[];
  cursor: number;
  passed: number[];
  reason: string;
}

export type PolitikResume = EdgeWindow | ClashPending;

export interface GuidedPending {
  kind: 'guided';
  seat: number;
  source: string;
  sourceCard: HandCard | null;
  instruction: string;
  context: 'card' | 'ability' | 'landscape';
  resume?: PolitikResume;
}

export interface LandscapeOverflow {
  company: string;
  owner: number;
  title: string;
  industry: IndustryId;
  total: number;
  eligibleIndustries: IndustryId[];
}

export interface LandscapePending {
  kind: 'landscape';
  /** Seat currently responsible for the next overflow choice. */
  seat: number;
  /** Seat that revealed the Landscape (the first player during setup). */
  initiator: number;
  card: string;
  context: 'setup' | 'refresh';
  delta: LandscapeDef['delta'];
  industries: IndustryId[];
  priceTracks: PriceId[];
  industryIndex: number;
  companyIndex: number;
  marketMoves: Partial<Record<IndustryId, number>>;
  priceMoves: Partial<Record<PriceId, number>>;
  overflow: LandscapeOverflow | null;
}

export interface CorporateGainPending {
  kind: 'corporate_gain';
  /** The winning Company owner makes the normal Margin-crossing choice. */
  seat: number;
  loser: number;
  loserCompany: string;
  winnerCompany: string;
  marginTransferred: number;
  marketsTransferred: Partial<Record<IndustryId, number>>;
  total: number;
  eligibleIndustries: IndustryId[];
  clash: PublicClash;
}

export type PolitikPending =
  | { kind: 'mulligan'; seat: number }
  | { kind: 'nation'; seat: number }
  | { kind: 'setup_bonus'; seat: number; available: SetupBonus[] }
  | { kind: 'start_state'; seat: number }
  | GuidedPending
  | ClashPending
  | { kind: 'corporate_loss'; seat: number; loser: number; loserCompany: string; winnerCompany: string; amount: number; clash: PublicClash }
  | CorporateGainPending
  | { kind: 'trade'; seat: number; proposer: number; participants: number[]; approvers: number[]; approvals: Partial<Record<number, boolean>>; transfers: TradeTransfer[]; resume?: PolitikResume }
  | { kind: 'hand_limit'; seat: number; excess: number }
  | { kind: 'allocate_support'; seat: number; amount: number; eligible: BaseId[]; reason: string }
  | LandscapePending
  | EdgeWindow;

export type SetupBonus = 'capital' | 'food' | 'carbon' | 'research' | 'exchange';

export interface PolitikEvent {
  seq: number;
  seat: number | null;
  player: string;
  title: string;
  detail: string;
  location?: LocationId;
  card?: HandCard;
}

export interface TieContest {
  key: string;
  kind: 'location' | 'region' | 'council' | 'industry';
  id: string;
  candidates: number[];
  value: number;
  ruling: number | null;
}

export interface PolitikState {
  game: 'politik';
  seed: number;
  rngState: number;
  options: PolitikOptions;
  phase: 'setup' | 'playing' | 'ended';
  players: PolitikPlayer[];
  first: number;
  turn: number;
  turnNumber: number;
  actionsTaken: number;
  actionsAllowed: number;
  setupStage: 'landscape' | 'mulligan' | 'nation' | 'bonus' | 'state' | 'done';
  setupQueue: number[];
  setupCursor: number;
  setupBonusesTaken: SetupBonus[];
  pending: PolitikPending | null;
  politicsDeck: string[];
  politicsDiscard: string[];
  obligationDeck: string[];
  startupDeck: string[];
  startupDiscard: string[];
  nationDeck: string[];
  landscapeDeck: string[];
  landscapeDiscard: string[];
  activeLandscape: string | null;
  upcomingLandscape: string | null;
  locations: Record<LocationId, PolitikLocation>;
  councilSupport: Record<CouncilId, number[]>;
  marketSupply: Record<IndustryId, number>;
  marketReserve: Record<IndustryId, number>;
  prices: Record<PriceId, number>;
  finalSay: number;
  tieRulings: Record<string, { winner: number; candidates: string; value: number }>;
  lastClash: PublicClash | null;
  winners: number[] | null;
  eventSeq: number;
  lastEvent: PolitikEvent | null;
  log: string[];
  nextInstance: number;
}

export interface PolitikPlayerView extends Omit<PolitikPlayer, 'hand' | 'nationChoices' | 'mulliganUsed'> {
  handCount: number;
  hand?: HandCard[];
  nationChoices?: string[];
  mulliganUsed?: boolean;
}

export type PolitikPendingView =
  | Exclude<PolitikPending, { kind: 'clash' } | { kind: 'trade' } | { kind: 'guided' }>
  | Omit<GuidedPending, 'resume'>
  | {
      kind: 'clash'; seat: number; stage: ClashStage; arena: Arena; attacker: number; defender: number | null; target: ClashTarget;
      committed: Record<number, boolean>; imperialCommitted: boolean; modifiers: ClashModifier[];
      order: number[]; cursor: number; passed: number[]; reason: string;
      yourCommitment?: ClashCommitment;
      revealedCommitments?: { attacker: ClashCommitment | null; defender: ClashCommitment | null };
    }
  | { kind: 'trade'; seat: number; proposer: number; participants: number[]; approvers: number[]; approvals: Partial<Record<number, boolean>>; transfers?: TradeTransfer[] };

export interface PolitikView {
  game: 'politik';
  you: number | null;
  phase: PolitikState['phase'];
  options: PolitikOptions;
  turn: number;
  first: number;
  turnNumber: number;
  actionsTaken: number;
  actionsAllowed: number;
  players: PolitikPlayerView[];
  prices: Record<PriceId, number>;
  locations: Record<LocationId, PolitikLocation>;
  councilSupport: Record<CouncilId, number[]>;
  marketSupply: Record<IndustryId, number>;
  marketReserve: Record<IndustryId, number>;
  landscape: { active: string | null; upcoming: string | null; deckCount: number; discardCount: number };
  politicsDeckCount: number;
  politicsDiscardCount: number;
  obligationDeckCount: number;
  startupDiscardCount: number;
  pending: PolitikPendingView | null;
  finalSay: number;
  ties: TieContest[];
  lastClash: PublicClash | null;
  winners: number[] | null;
  eventSeq: number;
  lastEvent: PolitikEvent | null;
  log: string[];
}

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

/** State-carried PRNG. Save/reload resumes at exactly the same point. */
export function politikRandom(s: Pick<PolitikState, 'rngState'>): number {
  let x = (s.rngState + 0x6d2b79f5) | 0;
  s.rngState = x >>> 0;
  x = Math.imul(x ^ (x >>> 15), 1 | x);
  x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

export function politikShuffle<T>(items: readonly T[], s: Pick<PolitikState, 'rngState'>): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(politikRandom(s) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function politikEvent(
  s: PolitikState,
  seat: number | null,
  title: string,
  detail: string,
  extra: Partial<Pick<PolitikEvent, 'location' | 'card'>> = {},
): void {
  const p = seat === null ? null : s.players[seat];
  const e: PolitikEvent = {
    seq: ++s.eventSeq,
    seat,
    player: p?.name ?? 'Table',
    title,
    detail,
    ...extra,
  };
  s.lastEvent = e;
  s.log.push(`${e.player}: ${title}${detail ? ` - ${detail}` : ''}`);
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

export function drawPolitik(s: PolitikState, p: PolitikPlayer, amount = 1): number {
  let drawn = 0;
  for (let i = 0; i < amount; i++) {
    if (!s.politicsDeck.length && s.politicsDiscard.length) {
      s.politicsDeck = politikShuffle(s.politicsDiscard, s);
      s.politicsDiscard = [];
    }
    const id = s.politicsDeck.pop();
    if (!id) break;
    p.hand.push({ kind: 'politik', id });
    drawn++;
  }
  return drawn;
}

export function drawObligation(s: PolitikState, p: PolitikPlayer): boolean {
  const id = s.obligationDeck.pop();
  if (!id) return false;
  p.hand.push({ kind: 'obligation', id });
  return true;
}

export function nextInstanceId(s: PolitikState, prefix: string): string {
  return `${prefix}-${s.nextInstance++}`;
}

function landscapeCompanies(s: PolitikState, industry: IndustryId): CompanyState[] {
  return s.players.flatMap((player) => player.companies).filter((company) => company.industries.includes(industry));
}

function finishLandscape(s: PolitikState, pending: LandscapePending): void {
  s.pending = null;
  politikEvent(
    s, pending.initiator, `resolved Landscape ${pending.card}`,
    `delta ${pending.delta}; Markets ${JSON.stringify(pending.marketMoves)}; Prices ${JSON.stringify(pending.priceMoves)}`,
  );
  if (pending.context === 'setup') {
    s.setupStage = 'mulligan';
    s.setupCursor = 0;
    s.pending = { kind: 'mulligan', seat: s.setupQueue[0] };
  }
}

function advanceLandscapeMargins(s: PolitikState, pending: LandscapePending): void {
  while (pending.industryIndex < pending.industries.length) {
    const industry = pending.industries[pending.industryIndex];
    const companies = landscapeCompanies(s, industry);
    if (pending.companyIndex >= companies.length) {
      pending.industryIndex++;
      pending.companyIndex = 0;
      continue;
    }
    const company = companies[pending.companyIndex++];
    const total = company.margin + pending.delta;
    if (pending.delta < 0) {
      company.margin = Math.max(0, total);
      continue;
    }
    if (total <= 9) {
      company.margin = total;
      continue;
    }
    const owner = s.players.find((player) => player.companies.some((candidate) => candidate.id === company.id))!.seat;
    pending.overflow = {
      company: company.id, owner, title: company.title, industry, total,
      eligibleIndustries: [...company.industries],
    };
    pending.seat = owner;
    s.pending = pending;
    return;
  }
  finishLandscape(s, pending);
}

/** Apply every deterministic part of a newly active Landscape immediately. */
export function beginPolitikLandscape(s: PolitikState, seat: number, context: 'setup' | 'refresh'): string | null {
  const card = s.activeLandscape;
  const def = card ? LANDSCAPE_BY_ID[card] : null;
  if (!card || !def) return 'active Landscape has no exact definition';
  const marketMoves: Partial<Record<IndustryId, number>> = {};
  for (const industry of def.industries) {
    const move = def.delta > 0
      ? Math.min(def.delta, s.marketReserve[industry])
      : -Math.min(-def.delta, s.marketSupply[industry]);
    s.marketSupply[industry] += move;
    s.marketReserve[industry] -= move;
    marketMoves[industry] = move;
  }
  const priceMoves: Partial<Record<PriceId, number>> = {};
  for (const price of def.priceTracks) {
    const before = s.prices[price];
    s.prices[price] = Math.max(1, Math.min(10, before + def.delta));
    priceMoves[price] = s.prices[price] - before;
  }
  const pending: LandscapePending = {
    kind: 'landscape', seat, initiator: seat, card, context, delta: def.delta,
    industries: [...def.industries], priceTracks: [...def.priceTracks],
    industryIndex: 0, companyIndex: 0, marketMoves, priceMoves, overflow: null,
  };
  advanceLandscapeMargins(s, pending);
  return null;
}

/** Resolve exactly one crossing Company, then continue until the next choice. */
export function resolvePolitikLandscapeOverflow(s: PolitikState, seat: number, choice: IndustryId | null): string | null {
  const pending = s.pending;
  if (pending?.kind !== 'landscape' || pending.seat !== seat || !pending.overflow) return 'not your Landscape overflow choice';
  const company = s.players[pending.overflow.owner]?.companies.find((candidate) => candidate.id === pending.overflow!.company);
  if (!company) return 'crossing Company no longer exists';
  if (choice === null) {
    company.margin = 9;
  } else {
    if (!pending.overflow.eligibleIndustries.includes(choice)) return 'overflow Market must match a Company Industry';
    if (s.marketSupply[choice] <= 0) return `no ${choice} Market remains`;
    s.marketSupply[choice]--;
    company.markets[choice] = (company.markets[choice] ?? 0) + 1;
    company.margin = Math.min(9, pending.overflow.total - 10);
  }
  politikEvent(s, seat, `resolved ${company.title} Margin overflow`, choice === null ? 'remained at 9 Margin' : `took 1 ${choice} Market and reset/continued`);
  pending.overflow = null;
  advanceLandscapeMargins(s, pending);
  return null;
}

function makeLocations(playerCount: number): Record<LocationId, PolitikLocation> {
  const out: Record<LocationId, PolitikLocation> = {};
  for (const x of data.board.states) {
    out[x.id] = {
      id: x.id,
      name: x.name,
      kind: 'state',
      region: x.region,
      regions: [x.region],
      benefit: x.benefit as PolitikLocation['benefit'],
      influence: Array(playerCount).fill(0),
      imperialInfluence: 1,
      stationCard: null,
      stationReady: false,
    };
  }
  for (const x of data.board.stations) {
    const card = data.cards.broadcastStations[x.card];
    out[x.id] = {
      id: x.id,
      name: x.name,
      kind: 'station',
      region: null,
      regions: [...x.regions],
      benefit: 'support',
      influence: Array(playerCount).fill(0),
      imperialInfluence: 1,
      stationCard: card?.id ?? null,
      stationReady: true,
    };
  }
  return out;
}

export function createPolitik(
  seated: { name: string; color: PolitikSeat }[],
  seed: number,
  options: PolitikOptions = {},
): PolitikState {
  if (seated.length < 2 || seated.length > 6) throw new Error('Politik is 2-6 players');
  if (new Set(seated.map((p) => p.color)).size !== seated.length) throw new Error('Politik seats must be unique');

  // Construct the serializable stream carrier before every shuffle.
  const stream = { rngState: seed >>> 0 };
  const politicsDeck = politikShuffle(data.cards.politics.map((c) => c.id), stream);
  const obligationDeck = politikShuffle(data.cards.obligations.map((c) => c.id), stream);
  const startupDeck = politikShuffle(data.cards.startups.map((c) => c.id), stream);
  const nationDeck = politikShuffle(NATIONS.map((n) => n.id), stream);
  const landscapeDeck = politikShuffle(data.cards.landscapes.map((c) => c.id), stream);

  const players: PolitikPlayer[] = seated.map((x, seat) => ({
    seat,
    color: x.color,
    name: x.name,
    nationChoices: [nationDeck.pop()!, nationDeck.pop()!],
    nation: null,
    startingPropaganda: null,
    propaganda: [],
    hand: [],
    capital: 0,
    carbon: 0,
    food: 0,
    corruption: 0,
    support: zeroRecord(BASES),
    leaders: zeroRecord(ARENAS),
    companies: [],
    eventsInPlay: [],
    nationalUsed: [],
    powerGrabs: zeroRecord(ARENAS),
    immunity: { defense: false, temporary: false },
    negotiation: 0,
    mulliganUsed: false,
    setupComplete: false,
  }));

  for (const p of players) {
    for (let i = 0; i < 6; i++) p.hand.push({ kind: 'politik', id: politicsDeck.pop()! });
    p.hand.push({ kind: 'startup', id: startupDeck.pop()! });
  }

  const first = Math.floor(politikRandom(stream) * players.length);
  const clockwise = Array.from({ length: players.length }, (_, i) => (first + i) % players.length);
  const activeLandscape = landscapeDeck.pop() ?? null;
  const upcomingLandscape = landscapeDeck.pop() ?? null;
  const councilSupport = Object.fromEntries(COUNCIL_SEATS.map((id) => [id, Array(players.length).fill(0)])) as Record<CouncilId, number[]>;
  const marketSupply = Object.fromEntries(INDUSTRIES.map((id) => [id, players.length])) as Record<IndustryId, number>;
  const marketReserve = Object.fromEntries(INDUSTRIES.map((id) => [id, MARKETS_PER_INDUSTRY - players.length])) as Record<IndustryId, number>;
  const prices = { ...data.board.prices } as Record<PriceId, number>;

  const s: PolitikState = {
    game: 'politik',
    seed,
    rngState: stream.rngState,
    options: { ...options },
    phase: 'setup',
    players,
    first,
    turn: first,
    turnNumber: 1,
    actionsTaken: 0,
    actionsAllowed: 2,
    setupStage: 'landscape',
    setupQueue: clockwise,
    setupCursor: 0,
    setupBonusesTaken: [],
    pending: null,
    politicsDeck,
    politicsDiscard: [],
    obligationDeck,
    startupDeck,
    startupDiscard: [],
    nationDeck,
    landscapeDeck,
    landscapeDiscard: [],
    activeLandscape,
    upcomingLandscape,
    locations: makeLocations(players.length),
    councilSupport,
    marketSupply,
    marketReserve,
    prices,
    finalSay: first,
    tieRulings: {},
    lastClash: null,
    winners: null,
    eventSeq: 0,
    lastEvent: null,
    log: [],
    nextInstance: 1,
  };
  politikEvent(s, null, 'game setup began', `${players.length} Nations; first player is ${players[first].name}`);
  if (activeLandscape) {
    politikEvent(s, null, 'Landscape revealed', `${activeLandscape}; exact Market, Margin, and Price changes resolve automatically`);
  }
  const landscapeError = beginPolitikLandscape(s, first, 'setup');
  if (landscapeError) throw new Error(landscapeError);
  return s;
}

/** Strict unique maximum; used while determining who holds Final Say. */
function uniqueMaximum(values: number[], positive = false): number | null {
  const max = Math.max(...values);
  if (positive && max <= 0) return null;
  const seats = values.map((v, i) => ({ v, i })).filter((x) => x.v === max).map((x) => x.i);
  return seats.length === 1 ? seats[0] : null;
}

/** Re-evaluate the four printed Final Say criteria in order. */
export function recomputeFinalSay(s: PolitikState): number {
  // Justice is based on control, including a still-valid case-by-case ruling.
  const justice = councilController(s, 'justice');
  const corruption = uniqueMaximum(s.players.map((p) => p.corruption));
  const negotiation = uniqueMaximum(s.players.map((p) => p.negotiation), true);
  const holder = justice ?? corruption ?? negotiation ?? s.turn;
  s.finalSay = holder;
  return holder;
}

/** A tied maximum is awarded to Final Say when they are one of the leaders. */
export function mostWithFinalSay(s: PolitikState, values: number[], positive = true, key?: string): number | null {
  const max = Math.max(...values);
  if (positive && max <= 0) return null;
  const tied = values.map((v, i) => ({ v, i })).filter((x) => x.v === max).map((x) => x.i);
  if (tied.length === 1) return tied[0];
  const ruling = key === undefined ? undefined : s.tieRulings[key];
  const signature = [...tied].sort((a, b) => a - b).join(',');
  return ruling !== undefined && ruling.value === max && ruling.candidates === signature && tied.includes(ruling.winner) ? ruling.winner : null;
}

export function locationController(s: PolitikState, id: LocationId): number | null {
  const loc = s.locations[id];
  if (!loc) return null;
  return mostWithFinalSay(s, loc.influence, true, `location:${id}`);
}

export function councilController(s: PolitikState, id: CouncilId): number | null {
  return mostWithFinalSay(s, s.councilSupport[id], true, `council:${id}`);
}

export function industryMarketTotals(s: PolitikState, industry: IndustryId): number[] {
  return s.players.map((p) => p.companies.reduce((sum, c) => sum + (c.markets[industry] ?? 0), 0));
}

export function industryController(s: PolitikState, industry: IndustryId): number | null {
  return mostWithFinalSay(s, industryMarketTotals(s, industry), true, `industry:${industry}`);
}

export function regionController(s: PolitikState, region: string): number | null {
  const totals = s.players.map(() => 0);
  for (const loc of Object.values(s.locations)) {
    if (loc.kind !== 'state' || loc.region !== region) continue;
    const owner = locationController(s, loc.id);
    if (owner !== null) totals[owner]++;
  }
  const max = Math.max(...totals);
  if (max < 2) return null;
  return mostWithFinalSay(s, totals, true, `region:${region}`);
}

/** Public, currently-live ties. Final Say may persist a ruling for any one. */
export function politikTieContests(s: PolitikState): TieContest[] {
  const contests: TieContest[] = [];
  const add = (kind: TieContest['kind'], id: string, values: number[]): void => {
    const value = Math.max(...values);
    if (value <= 0) return;
    const candidates = values.map((v, i) => ({ v, i })).filter((x) => x.v === value).map((x) => x.i);
    if (candidates.length < 2) return;
    const key = `${kind}:${id}`;
    const saved = s.tieRulings[key];
    const signature = [...candidates].sort((a, b) => a - b).join(',');
    contests.push({ key, kind, id, candidates, value, ruling: saved !== undefined && saved.value === value && saved.candidates === signature && candidates.includes(saved.winner) ? saved.winner : null });
  };
  for (const loc of Object.values(s.locations)) add('location', loc.id, loc.influence);
  for (const id of COUNCIL_SEATS) add('council', id, s.councilSupport[id]);
  for (const id of INDUSTRIES) add('industry', id, industryMarketTotals(s, id));
  for (const region of ['A', 'B', 'C', 'D', 'E']) {
    const totals = s.players.map(() => 0);
    for (const loc of Object.values(s.locations)) {
      if (loc.kind !== 'state' || loc.region !== region) continue;
      const owner = locationController(s, loc.id);
      if (owner !== null) totals[owner]++;
    }
    if (Math.max(...totals) >= 2) add('region', region, totals);
  }
  return contests;
}

export function controlledRegions(s: PolitikState, seat: number): string[] {
  return ['A', 'B', 'C', 'D', 'E'].filter((r) => regionController(s, r) === seat);
}

export function controlledCouncil(s: PolitikState, seat: number): CouncilId[] {
  return COUNCIL_SEATS.filter((id) => councilController(s, id) === seat);
}

export function controlledIndustries(s: PolitikState, seat: number): IndustryId[] {
  return INDUSTRIES.filter((id) => industryController(s, id) === seat);
}

export function victoryThreshold(s: PolitikState): number {
  const standard = s.players.length === 2 ? 4 : s.players.length <= 4 ? 3 : 2;
  return s.options.longWar ? standard + 1 : standard;
}

export function meetsVictory(s: PolitikState, p: PolitikPlayer): boolean {
  if (s.options.trifecta) return ARENAS.every((a) => p.powerGrabs[a] >= 1);
  const types = ARENAS.filter((a) => p.powerGrabs[a] > 0).length;
  const total = ARENAS.reduce((n, a) => n + p.powerGrabs[a], 0);
  return types >= 2 && total >= victoryThreshold(s);
}

function redactedPending(s: PolitikState, viewer: number | null | 'dev'): PolitikPendingView | null {
  const p = s.pending;
  if (!p) return null;
  if (p.kind === 'clash') {
    const committed = Object.fromEntries([p.attacker, ...(p.defender === null ? [] : [p.defender])].map((seat) => [seat, !!p.commitments[seat]]));
    const mine = viewer === 'dev' ? undefined : typeof viewer === 'number' ? p.commitments[viewer] : undefined;
    const revealed = p.stage === 'after_reveal' || p.stage === 'before_resolve';
    const attackerCommitment = p.commitments[p.attacker] ?? null;
    const defenderCommitment = p.defender === null ? p.imperialCommitment : p.commitments[p.defender] ?? null;
    return {
      kind: 'clash', seat: p.seat, stage: p.stage, arena: p.arena, attacker: p.attacker, defender: p.defender, target: p.target,
      committed, imperialCommitted: !!p.imperialCommitment, modifiers: p.modifiers.map((modifier) => ({ ...modifier })),
      order: [...p.order], cursor: p.cursor, passed: [...p.passed], reason: p.reason,
      ...(!revealed && mine ? { yourCommitment: mine } : {}),
      ...(revealed || viewer === 'dev' ? { revealedCommitments: { attacker: attackerCommitment, defender: defenderCommitment } } : {}),
    };
  }
  if (p.kind === 'trade') {
    const canSee = viewer === 'dev' || (typeof viewer === 'number' && p.approvers.includes(viewer));
    const visibleTransfers = p.transfers.map((x) => {
      const transfer: TradeTransfer = { ...x, source: x.source ? { ...x.source } : undefined };
      if (x.kind === 'hand_card' && x.handIndex !== undefined) {
        const offered = s.players[x.from]?.hand[x.handIndex];
        if (offered) {
          transfer.card = { ...offered };
          transfer.label = offered.kind === 'politik'
            ? POLITIK_CARDS[offered.id]?.name ?? offered.id
            : offered.kind === 'startup'
              ? STARTUP_BY_ID[offered.id]?.name ?? offered.id
              : offered.id;
        }
      }
      return transfer;
    });
    return {
      kind: 'trade', seat: p.seat, proposer: p.proposer, participants: [...p.participants], approvers: [...p.approvers], approvals: { ...p.approvals },
      ...(canSee ? { transfers: visibleTransfers } : {}),
    };
  }
  if (p.kind === 'guided') {
    const { resume: _resume, ...visible } = p;
    return visible;
  }
  return { ...p } as PolitikPendingView;
}

export function politikViewFor(s: PolitikState, viewer: number | null | 'dev'): PolitikView {
  return {
    game: 'politik',
    you: typeof viewer === 'number' ? viewer : null,
    phase: s.phase,
    options: { ...s.options },
    turn: s.turn,
    first: s.first,
    turnNumber: s.turnNumber,
    actionsTaken: s.actionsTaken,
    actionsAllowed: s.actionsAllowed,
    players: s.players.map((p) => {
      const mine = viewer === 'dev' || viewer === p.seat;
      const { hand, nationChoices, mulliganUsed, ...pub } = p;
      return {
        ...pub,
        support: { ...p.support },
        leaders: { ...p.leaders },
        companies: p.companies.map((c) => ({ ...c, printedIndustries: [...c.printedIndustries], industries: [...c.industries], markets: { ...c.markets }, assets: c.assets.map((a) => ({ ...a, bases: [...a.bases], industries: [...a.industries], card: { ...a.card } })), card: { ...c.card } })),
        propaganda: p.propaganda.map((x) => ({ ...x, bases: [...x.bases], industries: [...x.industries], card: { ...x.card } })),
        eventsInPlay: p.eventsInPlay.map((x) => ({ ...x, bases: [...x.bases], industries: [...x.industries], card: { ...x.card } })),
        nationalUsed: [...p.nationalUsed],
        powerGrabs: { ...p.powerGrabs },
        immunity: { ...p.immunity },
        handCount: hand.length,
        ...(mine ? { hand: hand.map((c) => ({ ...c })), nationChoices: [...nationChoices], mulliganUsed } : {}),
      };
    }),
    prices: { ...s.prices },
    locations: Object.fromEntries(Object.entries(s.locations).map(([id, x]) => [id, { ...x, regions: [...x.regions], influence: [...x.influence] }])),
    councilSupport: Object.fromEntries(COUNCIL_SEATS.map((id) => [id, [...s.councilSupport[id]]])) as Record<CouncilId, number[]>,
    marketSupply: { ...s.marketSupply },
    marketReserve: { ...s.marketReserve },
    landscape: { active: s.activeLandscape, upcoming: s.upcomingLandscape, deckCount: s.landscapeDeck.length, discardCount: s.landscapeDiscard.length },
    politicsDeckCount: s.politicsDeck.length,
    politicsDiscardCount: s.politicsDiscard.length,
    obligationDeckCount: s.obligationDeck.length,
    startupDiscardCount: s.startupDiscard.length,
    pending: redactedPending(s, viewer),
    finalSay: s.finalSay,
    ties: politikTieContests(s),
    lastClash: s.lastClash,
    winners: s.winners ? [...s.winners] : null,
    eventSeq: s.eventSeq,
    lastEvent: s.lastEvent ? { ...s.lastEvent, card: s.lastEvent.card ? { ...s.lastEvent.card } : undefined } : null,
    log: s.log.slice(-80),
  };
}
