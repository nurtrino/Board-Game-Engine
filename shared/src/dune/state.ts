// Dune: Imperium. State + setup + views, built from the goldens transcribed
// from TTS mod 2354919205 (spaces.json = the rulebook's Board Space Guide,
// cards.json / conflicts.json / leaders.json = card-by-card sheet reads).
// The mod itself is honor-system; this engine enforces the full rules per
// docs/specs/dune-imperium.md. 2-4 players. Rise of Ix / Immortality content
// is staged in the assets and recorded as create options, but not yet
// implemented — options must be off.

import { mulberry32, shuffle } from '../brass/rng.js';
import spacesJson from './spaces.json';
import conflictsJson from './conflicts.json';
import leadersJson from './leaders.json';
import cardsJson from './cards.json';

export type DuneSeat = 'Red' | 'Blue' | 'Orange' | 'Green';
export const DUNE_SEATS: DuneSeat[] = ['Red', 'Blue', 'Orange', 'Green'];

export type Faction = 'emperor' | 'guild' | 'beneGesserit' | 'fremen';
export const FACTIONS: Faction[] = ['emperor', 'guild', 'beneGesserit', 'fremen'];

export type AgentIcon = Faction | 'landsraad' | 'city' | 'spiceTrade';

// ---------- golden data ----------

export interface SpaceDef {
  id: string;
  name: string;
  icon: string; // which agent icon a card needs: emperor/guild/beneGesserit/fremen/landsraad/city/spiceTrade
  influence?: Faction;
  combat?: boolean;
  maker?: boolean;
  cost?: { spice?: number; water?: number; solari?: number };
  requires?: { fremenInfluence?: number };
  oncePerGame?: boolean;
  control?: 'solari' | 'spice';
  rewards?: Record<string, unknown>;
  sellMelange?: Record<string, number>;
}

export const SPACES: SpaceDef[] = spacesJson.spaces as SpaceDef[];
export const SPACE_BY_ID: Record<string, SpaceDef> = Object.fromEntries(SPACES.map((s) => [s.id, s]));
export const DUNE_RULES = {
  rounds: (spacesJson as { round: { rounds: number } }).round.rounds,
  winVp: (spacesJson as { round: { winVp: number } }).round.winVp,
  handSize: 5,
  imperiumRow: 5,
  troopStrength: 2,
  swordStrength: 1,
  garrisonDeployMax: 2,
  vpAt2Influence: 1,
  allianceAt4: 4,
  startWater: 1,
  startGarrison: 3,
  highCouncilPersuasion: 2,
  troopsTotal: 12,
} as const;
export const INFLUENCE_BONUS_AT_4: Record<Faction, Record<string, number>> =
  (spacesJson as { influenceTracks: { bonusAt4: Record<Faction, Record<string, number>> } }).influenceTracks.bonusAt4;
export const SELL_MELANGE: Record<string, number> = SPACE_BY_ID.sellMelange.sellMelange!;
export const ENDGAME_TIEBREAK = ['spice', 'solari', 'water', 'garrison'] as const;

export interface ConflictDef {
  id: string;
  name: string;
  sheet: number;
  cell: number;
  first: Record<string, unknown>;
  second: Record<string, unknown>;
  third: Record<string, unknown>;
}
export const CONFLICTS_I: ConflictDef[] = conflictsJson.tierI as ConflictDef[];
export const CONFLICTS_II: ConflictDef[] = conflictsJson.tierII as ConflictDef[];
export const CONFLICTS_III: ConflictDef[] = conflictsJson.tierIII as ConflictDef[];
export const CONFLICT_BY_ID: Record<string, ConflictDef> =
  Object.fromEntries([...CONFLICTS_I, ...CONFLICTS_II, ...CONFLICTS_III].map((c) => [c.id, c]));

export interface LeaderDef {
  id: string;
  name: string;
  house: string;
  complexity: number;
  image: string;
  passive: { title: string; text: string; effect?: Record<string, unknown> };
  signet: { title: string; text: string; effect?: Record<string, unknown> };
}
export const LEADERS: LeaderDef[] = leadersJson.base as LeaderDef[];
export const LEADER_BY_ID: Record<string, LeaderDef> = Object.fromEntries(LEADERS.map((l) => [l.id, l]));

export interface CardDef {
  id: string;
  name: string;
  sheet?: number;
  cell?: number | string;
  copies?: number;
  cost?: number;
  faction?: string | string[];
  agents: string[]; // agent icons; ['any'] = Kwisatz Haderach
  agentBox?: Record<string, unknown> | null;
  reveal?: Record<string, unknown> | null;
  acquireBox?: Record<string, unknown>;
  trashTrigger?: Record<string, unknown>;
}
const cj = cardsJson as unknown as {
  starter: CardDef[]; reserve: CardDef[]; imperium: CardDef[];
  intrigue: { id: string; name: string; kind: string; copies?: number; effect: Record<string, unknown> }[];
};
export const STARTER_CARDS: CardDef[] = cj.starter;
export const RESERVE_CARDS: CardDef[] = cj.reserve;
export const IMPERIUM_CARDS: CardDef[] = cj.imperium;
export const CARD_BY_ID: Record<string, CardDef> =
  Object.fromEntries([...STARTER_CARDS, ...RESERVE_CARDS, ...IMPERIUM_CARDS].map((c) => [c.id, c]));

export interface IntrigueDef {
  id: string;
  name: string;
  kind: string; // plot | combat | endgame | combat-endgame
  copies?: number;
  effect: Record<string, unknown>;
}
export const INTRIGUE_CARDS: IntrigueDef[] = cj.intrigue;
export const INTRIGUE_BY_ID: Record<string, IntrigueDef> = Object.fromEntries(INTRIGUE_CARDS.map((c) => [c.id, c]));

// ---------- state ----------

/** A pending choice the acting player must resolve before anything else. */
export type DuneDecision =
  | { kind: 'influenceAny'; amount: number; label: string }
  | { kind: 'influencePickTwo'; label: string } // two different factions, 1 each
  | { kind: 'influenceWhereBehind'; label: string } // Leto signet
  | { kind: 'influencePick'; options: Faction[]; label: string; lose?: boolean } // e.g. Firm Grip / lose-one costs
  | { kind: 'voiceSpace'; label: string } // The Voice: pick a space to block
  | { kind: 'trash'; optional: boolean; label: string } // trash one of your cards
  | { kind: 'discardOrLoseTroop'; label: string } // Test of Humanity (per opponent, seat in `seat`)
  | { kind: 'baronFactions'; label: string } // Masterstroke: pick 2 factions
  | { kind: 'helenaRow'; label: string } // Manipulate: swap out an Imperium Row card
  | { kind: 'recallAgent'; label: string } // Urgent Mission
  | { kind: 'pickOpponentInConflict'; label: string } // Double Cross
  | { kind: 'freeAcquire'; limit: number; toTop: boolean; label: string } // Bypass Protocol
  | { kind: 'conflictChoice'; options: Record<string, unknown>[]; pick: number; label: string };

export interface PendingDecision {
  seat: number;
  decision: DuneDecision;
}

export interface DunePlayer {
  seat: number;
  color: DuneSeat;
  name: string;
  leader: string | null;
  deck: string[];
  hand: string[];
  discard: string[];
  inPlay: string[]; // agent-played + revealed cards, cleaned up at reveal end
  intrigue: string[];
  agentsTotal: number; // 2, +1 with swordmaster
  agentsLeft: number;
  hasSwordmaster: boolean;
  hasHighCouncil: boolean;
  mentat: boolean; // holds the Mentat as an extra agent this round
  solari: number;
  spice: number;
  water: number;
  supply: number; // troop cubes in supply
  garrison: number;
  inConflict: number;
  deployedThisTurn: number; // for Baron's Masterstroke
  influence: Record<Faction, number>;
  alliances: Faction[];
  vp: number;
  revealed: boolean;
  persuasion: number; // remaining to spend after reveal
  swords: number; // strength bonus from revealed cards + intrigue
  spentSpaces: string[]; // once-per-game spaces used (highCouncil, swordmaster)
  baronFactions: Faction[] | null; // Masterstroke secret picks
  spiceMustFlowBonus: number; // Guild Bankers: discount on The Spice Must Flow this turn
  acquireToTop: boolean; // Recruitment Mission rider
  turnsTaken: number;
  actedThisTurn: 'agent' | 'reveal' | null;
  mentatCarry: boolean; // won the Mentat as a Conflict reward (keeps it next round)
  binduPass: boolean; // Bindu Suspension: may end the turn without acting
  envoy: boolean; // Dispatch an Envoy: next card played gains all faction icons
  helenaAside: { card: string } | null; // Manipulate: set-aside row card at -1
  baronRevealed: boolean; // Masterstroke already triggered
}

export type DunePhase = 'leaders' | 'round' | 'combat' | 'ended';

export interface DuneEvent {
  seq: number;
  color: DuneSeat;
  player: string;
  title: string;
  detail: string;
}

export interface DuneState {
  game?: 'dune';
  seed: number;
  rolls: number;
  options: { riseOfIx: boolean; immortality: boolean };
  phase: DunePhase;
  round: number; // 1..10
  firstPlayer: number;
  turn: number; // seat whose turn it is (leader pick / agent-reveal turns / combat window)
  players: DunePlayer[];
  leaderPool: string[]; // remaining leader picks during 'leaders'
  spaces: Record<string, number[]>; // spaceId -> occupying seats
  control: { arrakeen: number | null; carthag: number | null; imperialBasin: number | null };
  makerSpice: { greatFlat: number; haggaBasin: number; imperialBasin: number };
  conflictDeck: string[];
  conflict: string | null; // current conflict card
  imperiumDeck: string[];
  imperiumRow: (string | null)[];
  intrigueDeck: string[];
  intrigueDiscard: string[];
  reserve: { foldspace: number; arrakisLiaison: number; theSpiceMustFlow: number };
  mentatFree: boolean; // Mentat token on its board space
  voiceBlock: { space: string; by: number } | null; // opponents of `by` can't place there this round
  infiltrateNext: number | null; // seat whose next agent ignores blocking (Infiltrate)
  pending: PendingDecision[]; // decisions to resolve, head first
  combatPassed: number[]; // seats that passed in the current combat window
  combatWinner: number | null; // set while the post-win intrigue window is open
  postCombat: boolean; // winner may play "when you win" intrigue, then pass
  winner: DuneSeat | null;
  finalScores: { seat: number; vp: number; spice: number; solari: number; water: number; garrison: number }[] | null;
  lastEvent: DuneEvent | null;
  log: string[];
}

// seeded rng stream: every draw advances s.rolls so saves replay identically
export function duneRoll(s: DuneState, lo: number, hi: number): number {
  s.rolls++;
  const r = mulberry32((s.seed ^ (s.rolls * 0x9e3779b9)) >>> 0)();
  return lo + Math.floor(r * (hi - lo + 1));
}

export function duneShuffle<T>(s: DuneState, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = duneRoll(s, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function starterDeck(): string[] {
  const deck: string[] = [];
  for (const c of STARTER_CARDS) for (let i = 0; i < (c.copies ?? 1); i++) deck.push(c.id);
  return deck;
}

export function drawCards(s: DuneState, p: DunePlayer, n: number): void {
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) return;
      p.deck = duneShuffle(s, p.discard);
      p.discard = [];
    }
    p.hand.push(p.deck.shift()!);
  }
}

export function createDune(
  seated: { name: string; color: DuneSeat }[],
  seed: number,
  options: { riseOfIx?: boolean; immortality?: boolean } = {},
): DuneState {
  if (seated.length < 2 || seated.length > 4) throw new Error('Dune: Imperium is 2-4 players');
  if (options.riseOfIx || options.immortality) throw new Error('Expansions are not available yet');
  const rng = mulberry32(seed);

  const players: DunePlayer[] = seated.map((x, seat) => ({
    seat, color: x.color, name: x.name,
    leader: null,
    deck: [], hand: [], discard: [], inPlay: [], intrigue: [],
    agentsTotal: 2, agentsLeft: 2,
    hasSwordmaster: false, hasHighCouncil: false, mentat: false,
    solari: 0, spice: 0, water: DUNE_RULES.startWater,
    supply: DUNE_RULES.troopsTotal - DUNE_RULES.startGarrison,
    garrison: DUNE_RULES.startGarrison, inConflict: 0, deployedThisTurn: 0,
    influence: { emperor: 0, guild: 0, beneGesserit: 0, fremen: 0 },
    alliances: [], vp: seated.length === 4 ? 1 : 0,
    revealed: false, persuasion: 0, swords: 0,
    spentSpaces: [], baronFactions: null,
    spiceMustFlowBonus: 0, acquireToTop: false, turnsTaken: 0,
    actedThisTurn: null, mentatCarry: false, binduPass: false, envoy: false,
    helenaAside: null, baronRevealed: false,
  }));

  const s: DuneState = {
    game: 'dune',
    seed, rolls: 0,
    options: { riseOfIx: !!options.riseOfIx, immortality: !!options.immortality },
    phase: 'leaders',
    round: 0,
    firstPlayer: Math.floor(rng() * players.length),
    turn: 0,
    players,
    leaderPool: LEADERS.map((l) => l.id),
    spaces: {},
    control: { arrakeen: null, carthag: null, imperialBasin: null },
    makerSpice: { greatFlat: 0, haggaBasin: 0, imperialBasin: 0 },
    conflictDeck: [], conflict: null,
    imperiumDeck: [], imperiumRow: [],
    intrigueDeck: [], intrigueDiscard: [],
    reserve: { foldspace: 6, arrakisLiaison: 8, theSpiceMustFlow: 10 },
    mentatFree: true,
    voiceBlock: null, infiltrateNext: null,
    pending: [],
    combatPassed: [],
    combatWinner: null, postCombat: false,
    winner: null, finalScores: null,
    lastEvent: null, log: [],
  };
  s.turn = s.firstPlayer;

  // decks (seeded stream so the leader phase can't perturb them)
  const conflictIII = duneShuffle(s, CONFLICTS_III.map((c) => c.id));
  const conflictII = duneShuffle(s, CONFLICTS_II.map((c) => c.id)).slice(0, 5);
  const conflictI = duneShuffle(s, CONFLICTS_I.map((c) => c.id)).slice(0, 1);
  // draw order: 1 CI, then 5 CII, then 4 CIII (deck bottom = late game)
  s.conflictDeck = [...conflictI, ...conflictII, ...conflictIII];

  const imperium: string[] = [];
  for (const c of IMPERIUM_CARDS) for (let i = 0; i < (c.copies ?? 1); i++) imperium.push(c.id);
  s.imperiumDeck = duneShuffle(s, imperium);
  s.imperiumRow = s.imperiumDeck.splice(0, DUNE_RULES.imperiumRow);

  const intrigue: string[] = [];
  for (const c of INTRIGUE_CARDS) for (let i = 0; i < (c.copies ?? 1); i++) intrigue.push(c.id);
  s.intrigueDeck = duneShuffle(s, intrigue);

  for (const p of players) {
    p.deck = duneShuffle(s, starterDeck());
    drawCards(s, p, DUNE_RULES.handSize);
  }

  s.log.push(`Leader pick: ${players[s.firstPlayer].name} chooses first`);
  return s;
}

// ---------- views ----------

export interface DunePlayerView {
  seat: number;
  color: DuneSeat;
  name: string;
  leader: string | null;
  handCount: number;
  deckCount: number;
  discard: string[];
  inPlay: string[];
  intrigueCount: number;
  agentsLeft: number;
  agentsTotal: number;
  hasSwordmaster: boolean;
  hasHighCouncil: boolean;
  mentat: boolean;
  solari: number;
  spice: number;
  water: number;
  garrison: number;
  inConflict: number;
  strength: number; // troops*2 + swords (public during combat)
  influence: Record<Faction, number>;
  alliances: Faction[];
  vp: number;
  revealed: boolean;
  persuasion: number;
  actedThisTurn: 'agent' | 'reveal' | null;
  spiceMustFlowBonus: number;
  // private (own seat only)
  hand?: string[];
  intrigue?: string[];
  deckTop?: string | null; // Paul Atreides' Prescience
  baronFactions?: Faction[] | null;
  helenaAside?: { card: string } | null;
}

export interface DuneView {
  game: 'dune';
  you: number | null;
  phase: DunePhase;
  options: DuneState['options'];
  round: number;
  rounds: number;
  firstPlayer: number;
  turn: number;
  players: DunePlayerView[];
  leaderPool: string[];
  spaces: Record<string, number[]>;
  control: DuneState['control'];
  makerSpice: DuneState['makerSpice'];
  conflict: string | null;
  conflictsLeft: number;
  imperiumRow: (string | null)[];
  reserve: DuneState['reserve'];
  intrigueDeckCount: number;
  mentatFree: boolean;
  voiceBlock: DuneState['voiceBlock'];
  pending: PendingDecision | null; // only the head is actionable
  combatPassed: number[];
  winner: DuneSeat | null;
  finalScores: DuneState['finalScores'];
  lastEvent: DuneEvent | null;
  log: string[];
}

export function strengthOf(p: DunePlayer): number {
  return p.inConflict * DUNE_RULES.troopStrength + p.swords;
}

export function duneViewFor(s: DuneState, seat: number | null | 'dev'): DuneView {
  const me = typeof seat === 'number' ? seat : null;
  const dev = seat === 'dev';
  return {
    game: 'dune',
    you: me,
    phase: s.phase,
    options: s.options,
    round: s.round,
    rounds: DUNE_RULES.rounds,
    firstPlayer: s.firstPlayer,
    turn: s.turn,
    players: s.players.map((p) => {
      const v: DunePlayerView = {
        seat: p.seat, color: p.color, name: p.name, leader: p.leader,
        handCount: p.hand.length, deckCount: p.deck.length,
        discard: p.discard, inPlay: p.inPlay,
        intrigueCount: p.intrigue.length,
        agentsLeft: p.agentsLeft, agentsTotal: p.agentsTotal + (p.mentat ? 1 : 0),
        hasSwordmaster: p.hasSwordmaster, hasHighCouncil: p.hasHighCouncil, mentat: p.mentat,
        solari: p.solari, spice: p.spice, water: p.water,
        garrison: p.garrison, inConflict: p.inConflict,
        strength: strengthOf(p),
        influence: p.influence, alliances: p.alliances, vp: p.vp,
        revealed: p.revealed, persuasion: p.persuasion,
        actedThisTurn: p.actedThisTurn, spiceMustFlowBonus: p.spiceMustFlowBonus,
      };
      if (dev || p.seat === me) {
        v.hand = p.hand;
        v.intrigue = p.intrigue;
        v.baronFactions = p.baronFactions;
        v.helenaAside = p.helenaAside;
        if (p.leader === 'paulAtreides') v.deckTop = p.deck[0] ?? null;
      }
      return v;
    }),
    leaderPool: s.leaderPool,
    spaces: s.spaces,
    control: s.control,
    makerSpice: s.makerSpice,
    conflict: s.conflict,
    conflictsLeft: s.conflictDeck.length,
    imperiumRow: s.imperiumRow,
    reserve: s.reserve,
    intrigueDeckCount: s.intrigueDeck.length,
    mentatFree: s.mentatFree,
    voiceBlock: s.voiceBlock,
    pending: s.pending[0] ?? null,
    combatPassed: s.combatPassed,
    winner: s.winner,
    finalScores: s.finalScores,
    lastEvent: s.lastEvent,
    log: s.log.slice(-40),
  };
}
