// Brass: Birmingham setup — the "start script". createBrass() builds the
// authoritative initial game state directly from the extracted golden
// (setup-data.json), faithfully reproducing the TTS mod's setup:
//   - seat colors assigned by join order (Orange, Purple, Teal, Yellow)
//   - the correct per-player-count card deck, shuffled; one dead card removed
//     per player, then 8 dealt to each hand
//   - each player: £17, income marker at its start offset, 0 VP, full tile
//     pool on their mat, 14 links
//   - coal/iron markets pre-filled per the golden
//   - merchant tiles for the player count placed (beer on every "Buys" tile)
//   - random canal-era turn order
// viewFor() redacts hidden info (a hand is visible only to its owner, or to a
// dev viewer). The rules engine will layer actions on top of this state.

import data from './setup-data.json';
import { mulberry32, shuffle } from './rng.js';

export type Color = 'Orange' | 'Purple' | 'Teal' | 'Yellow';
export const SEAT_COLORS: Color[] = ['Orange', 'Purple', 'Teal', 'Yellow'];

export interface Card { cell: number; name: string; kind: 'location' | 'industry' | 'wild'; }

export interface SeatedPlayer { name: string; color: Color; }

export interface BrassPlayer {
  seat: number;
  color: Color;
  name: string;
  money: number;
  incomeOffset: number; // position on the income track (income = incomeTrack[offset])
  vp: number;
  hand: Card[];
  links: number; // link tiles remaining for this era
  spent: number; // money spent this round (drives next turn order)
  beer: number; // display total: beer cubes across own unflipped breweries
  discards: Card[]; // face-up discard pile (last = top)
  tiles: Record<string, number>; // industry tile pool on the mat, by tile name
}

export interface BuiltIndustry {
  color: Color;
  tile: string;
  flipped: boolean;
  /** resource cubes sitting on the tile (coal/iron/beer, by industry type) */
  cubes: number;
}

/** A board event, for the TV caption + camera fly-to. */
export interface BrassEvent {
  seq: number;
  color: Color;
  player: string;
  title: string; // "Built Coal Mine I"
  detail: string; // "Dudley · £5 and 1 iron"
  kind?: 'build' | 'network' | 'develop' | 'sell' | 'loan' | 'scout' | 'pass'; // banner form
  tile?: string; // the placed/flipped industry tile, e.g. "Coal Mine I" — drives the banner art
  location?: string; // "Dudley" — where it happened, uppercased on the banner
  cost?: string; // money + resources paid, e.g. "£5 · 1 iron"
  square?: string; // focus: a location square name
  link?: string; // focus: a link name
  incomeDelta?: number; // income steps gained/lost by the actor
  drew?: number; // cards drawn back at end of turn
}

/** slot is the index into the golden merchants array (drives board placement). */
export interface Merchant { slot: number; location: string; tile: string; beer: boolean; }

export interface BrassState {
  seed: number;
  phase: 'playing' | 'ended';
  era: 'canal' | 'rail';
  round: number;
  numRounds: number;
  turnOrder: Color[];
  current: number; // index into turnOrder
  actionsLeft: number; // actions remaining for the current player's turn
  players: BrassPlayer[]; // indexed by seat (join order)
  board: {
    industries: Record<string, BuiltIndustry>; // by location square name
    links: Record<string, Color>; // by link name
  };
  markets: { coal: number[]; iron: number[] }; // per-slot fill (1 = cube present)
  merchants: Merchant[];
  drawDeck: Card[];
  deadCards: Card[]; // removed face down at setup
  wild: { location: number; industry: number };
  lastEvent: BrassEvent | null;
  winner: Color | null;
  log: string[];
}

export function incomeAt(offset: number): number {
  return data.incomeTrack[Math.max(0, Math.min(offset, data.incomeTrack.length - 1))];
}

export function createBrass(seated: SeatedPlayer[], seed: number): BrassState {
  const P = seated.length;
  if (P < 2 || P > 4) throw new Error(`Brass supports 2-4 players, got ${P}`);
  if (new Set(seated.map((s) => s.color)).size !== P) throw new Error('Duplicate player colors');
  const rng = mulberry32(seed);
  const deck = data.decks[P as 2 | 3 | 4];

  // shuffle the deck, remove one dead card per player, deal 8 to each hand
  const cards = shuffle(deck.list as Card[], rng);
  const deadCards = cards.splice(0, P);
  const players: BrassPlayer[] = seated.map(({ name, color }, seat) => ({
    seat,
    color,
    name,
    money: data.constants.initialFunds,
    incomeOffset: data.markerStarts.income,
    vp: 0,
    hand: cards.splice(0, data.constants.handSize),
    links: data.constants.linksPerPlayerPerEra,
    spent: 0,
    beer: 0,
    discards: [],
    tiles: Object.fromEntries(Object.entries(data.industryTiles).map(([name, d]) => [name, (d as { count: number }).count])),
  }));

  // merchant tiles for this player count, shuffled onto the active slots
  const activeSlots = data.merchants.map((m, slot) => ({ ...m, slot })).filter((m) => m.players.includes(P));
  const merchantTiles = shuffle(data.merchantTiles[String(P) as '2' | '3' | '4'], rng);
  const merchants: Merchant[] = activeSlots.map((m, i) => ({
    slot: m.slot,
    location: m.location,
    tile: merchantTiles[i],
    beer: merchantTiles[i].startsWith('Buys '),
  }));

  const turnOrder = shuffle(players.map((p) => p.color), rng);

  return {
    seed,
    phase: 'playing',
    era: 'canal',
    round: 1,
    numRounds: data.constants.roundsPerEra[String(P) as '2' | '3' | '4'],
    turnOrder,
    current: 0,
    actionsLeft: 1, // canal era round 1: a single action per turn
    players,
    board: { industries: {}, links: {} },
    markets: { coal: [...data.markets.coal.fill], iron: [...data.markets.iron.fill] },
    merchants,
    drawDeck: cards,
    deadCards,
    wild: { location: data.wildCards.location, industry: data.wildCards.industry },
    lastEvent: null,
    winner: null,
    log: [`Game set up for ${P} players.`],
  };
}

// ---- view: what a given viewer is allowed to see ----

export interface BrassPlayerView {
  seat: number;
  color: Color;
  name: string;
  money: number;
  income: number;
  incomeOffset: number;
  vp: number;
  handCount: number;
  hand?: Card[]; // only for the owner or a dev viewer
  links: number;
  spent: number;
  beer: number;
  discardTop: Card | null; // discard piles are face up — public
  discardCount: number;
  tiles: Record<string, number>;
  tileCount: number;
}

export interface BrassView {
  you: number | null; // your seat, or null for the TV
  phase: 'playing' | 'ended';
  era: 'canal' | 'rail';
  round: number;
  numRounds: number;
  turnOrder: Color[];
  currentColor: Color;
  actionsLeft: number;
  players: BrassPlayerView[];
  board: { industries: Record<string, BuiltIndustry>; links: Record<string, Color> };
  markets: { coal: number[]; iron: number[] };
  merchants: Merchant[];
  drawCount: number;
  wild: { location: number; industry: number };
  lastEvent: BrassEvent | null;
  winner: Color | null;
  log: string[];
}

/** viewer: a seat number, null (TV / neutral), or 'dev' (everything revealed). */
export function viewFor(state: BrassState, viewer: number | null | 'dev'): BrassView {
  return {
    you: typeof viewer === 'number' ? viewer : null,
    phase: state.phase,
    era: state.era,
    round: state.round,
    numRounds: state.numRounds,
    turnOrder: state.turnOrder,
    currentColor: state.turnOrder[state.current],
    actionsLeft: state.actionsLeft,
    players: state.players.map((p) => {
      const reveal = viewer === 'dev' || viewer === p.seat;
      return {
        seat: p.seat,
        color: p.color,
        name: p.name,
        money: p.money,
        income: incomeAt(p.incomeOffset),
        incomeOffset: p.incomeOffset,
        vp: p.vp,
        handCount: p.hand.length,
        hand: reveal ? p.hand : undefined,
        links: p.links,
        spent: p.spent,
        beer: p.beer,
        discardTop: p.discards.length ? p.discards[p.discards.length - 1] : null,
        discardCount: p.discards.length,
        tiles: p.tiles,
        tileCount: Object.values(p.tiles).reduce((a, b) => a + b, 0),
      };
    }),
    board: state.board,
    markets: state.markets,
    merchants: state.merchants,
    drawCount: state.drawDeck.length,
    wild: state.wild,
    lastEvent: state.lastEvent,
    winner: state.winner,
    log: state.log,
  };
}
