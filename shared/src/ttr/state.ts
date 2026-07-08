// Ticket to Ride: Rails & Sails — The World. Setup + state + views, built from
// the golden extracted from the TTS mod (board-data.json: 452 snaps, 130
// labeled routes, 38 harbors) and the mod's bundled official rulebook
// (cards-data.json: full deck composition, tickets, scoring).
//
// Setup, per the mod's own scripts + rulebook: deal 3 train cards + 7 ship
// cards + 5 tickets to each player; flip 3 ship + 3 train cards faceup as the
// market. Players then simultaneously keep >=3 tickets and choose their piece
// assortment (any trains+ships totalling 60; max 25 trains, max 50 ships) and
// receive 3 harbors. First player is random; play proceeds in seat order.

import board from './board-data.json';
import cards from './cards-data.json';
import { mulberry32, shuffle } from '../brass/rng.js';

export type TtrColor = 'Green' | 'Red' | 'Blue' | 'Brown' | 'Yellow';
export const TTR_COLORS: TtrColor[] = ['Green', 'Red', 'Blue', 'Brown', 'Yellow'];

export type CardColor = 'Black' | 'Green' | 'Purple' | 'Red' | 'White' | 'Yellow';

/** One travel-card TYPE (the deck holds many copies, tracked by sheet id). */
export interface TravelCardType {
  sheet: number; // the mod's CustomDeck sheet id (art lookup)
  type: 'train' | 'ship';
  color: CardColor | null; // null = wild (trains only)
  wild: boolean;
  double: boolean; // double-ship: places up to 2 ships
  harbor: boolean; // carries the harbor symbol
}

export interface TtrRoute {
  id: string;
  kind: 'rail' | 'sea';
  a: string;
  b: string;
  color: CardColor | null; // null = gray
  pair: number; // >0: every space needs a 2-card same-color set
  length: number;
  snaps: number[]; // 1-based indices into board.snaps
}

export interface Ticket {
  idx: number; // index into cards.tickets (art = the mod's per-card image)
  cities: string[]; // 2 for a pair, 3-5 for a tour
  tour: boolean;
  points: number; // pair value, or tour "exact" value
  anyOrder?: number; // tour: completed but not in printed order
  fail: number; // subtracted when incomplete
}

export interface TtrPlayer {
  seat: number;
  color: TtrColor;
  name: string;
  hand: number[]; // card type ids (index into catalog)
  tickets: Ticket[];
  pendingTickets: Ticket[]; // dealt, awaiting keep decision (setup or draw)
  trains: number;
  ships: number;
  boxTrains: number; // pieces returned to the box (exchange pool)
  boxShips: number;
  harbors: number; // unbuilt harbors in supply
  score: number; // on the track (routes, exchanges); tickets/harbors at end
  ready: boolean; // setup: split + tickets locked in
}

export interface TtrEvent {
  seq: number;
  color: TtrColor;
  player: string;
  title: string;
  detail: string;
  route?: string; // focus a claimed route
  city?: string; // focus a harbor city
  drew?: number;
}

export interface TtrState {
  seed: number;
  phase: 'setup' | 'playing' | 'ended';
  turn: number; // index into players (seat order; first player random offset)
  first: number; // seat of the first player
  players: TtrPlayer[];
  routeOwners: Record<string, TtrColor>;
  harborOwners: Record<string, TtrColor>; // by city
  trainDeck: number[]; // card type ids, top = end
  shipDeck: number[];
  trainDiscard: number[];
  shipDiscard: number[];
  market: (number | null)[]; // 6 faceup card type ids
  ticketDeck: number[]; // ticket idx, top = end
  // turn-in-progress state
  turnDraws: number; // travel cards drawn so far this turn (0-2); >0 = mid draw action
  finalTurns: number | null; // turns remaining after end trigger (null = not triggered)
  lastEvent: TtrEvent | null;
  winner: TtrColor | null;
  log: string[];
}

// ---------------------------------------------------------------------------
// Card catalog: one entry per card TYPE; decks hold catalog indices.
// ---------------------------------------------------------------------------

export const CATALOG: TravelCardType[] = [];
export const CATALOG_COUNT: number[] = [];
for (const [sheet, d] of Object.entries(cards.trainSheets)) {
  CATALOG.push({ sheet: +sheet, type: 'train', color: (d as { color: CardColor | null }).color, wild: !!(d as { wild?: boolean }).wild, double: false, harbor: !!(d as { harbor?: boolean }).harbor });
  CATALOG_COUNT.push((d as { count: number }).count);
}
for (const [sheet, d] of Object.entries(cards.shipSheets)) {
  CATALOG.push({ sheet: +sheet, type: 'ship', color: (d as { color: CardColor }).color, wild: false, double: !!(d as { double?: boolean }).double, harbor: !!(d as { harbor?: boolean }).harbor });
  CATALOG_COUNT.push((d as { count: number }).count);
}

export const ROUTES: TtrRoute[] = board.routes as TtrRoute[];
export const ROUTE_BY_ID: Record<string, TtrRoute> = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
export const DOUBLES: string[][] = board.doubles;
export const DOUBLE_OF: Record<string, string> = {};
for (const [a, b] of DOUBLES) { DOUBLE_OF[a] = b; DOUBLE_OF[b] = a; }
export const HARBOR_CITIES: string[] = board.harbors.map((h: { city: string }) => h.city);
/** city -> its harbor snap index (1-based into board.snaps). */
export const HARBOR_SNAP: Record<string, number> = Object.fromEntries(
  board.harbors.map((h: { city: string; snap: number }) => [h.city, h.snap]),
);
export const CITIES: string[] = board.cities;
export const ROUTE_SCORE: Record<number, number> = Object.fromEntries(Object.entries(cards.routeScore).map(([k, v]) => [+k, v as number]));
export const RULES = cards.rules;

export function makeTicket(idx: number): Ticket {
  const t = cards.tickets[idx] as { a?: string; b?: string; points?: number; tour?: string[]; exact?: number; any?: number; fail?: number };
  if (t.tour) return { idx, cities: t.tour, tour: true, points: t.exact!, anyOrder: t.any, fail: t.fail! };
  return { idx, cities: [t.a!, t.b!], tour: false, points: t.points!, fail: t.points! };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface TtrSeated { name: string; color: TtrColor; }

export function createTtr(seated: TtrSeated[], seed: number): TtrState {
  const P = seated.length;
  if (P < 2 || P > 5) throw new Error(`Rails & Sails supports 2-5 players, got ${P}`);
  const rng = mulberry32(seed);

  let trainDeck: number[] = [];
  let shipDeck: number[] = [];
  CATALOG.forEach((c, id) => {
    const pile = c.type === 'train' ? trainDeck : shipDeck;
    for (let k = 0; k < CATALOG_COUNT[id]; k++) pile.push(id);
  });
  trainDeck = shuffle(trainDeck, rng);
  shipDeck = shuffle(shipDeck, rng);

  const ticketDeck = shuffle(cards.tickets.map((_, i) => i), rng);

  const players: TtrPlayer[] = seated.map(({ name, color }, seat) => ({
    seat, color, name,
    hand: [
      ...trainDeck.splice(-RULES.dealTrainCards),
      ...shipDeck.splice(-RULES.dealShipCards),
    ],
    tickets: [],
    pendingTickets: ticketDeck.splice(-RULES.dealTickets).map(makeTicket),
    trains: RULES.maxTrains,
    ships: RULES.maxShips,
    boxTrains: 0,
    boxShips: 0,
    harbors: RULES.harborsPerPlayer,
    score: 0,
    ready: false,
  }));

  // market: 3 ship cards then 3 train cards, per the mod's setup script
  const market = [
    ...shipDeck.splice(-3),
    ...trainDeck.splice(-3),
  ] as (number | null)[];

  return {
    seed,
    phase: 'setup',
    first: Math.floor(rng() * P),
    turn: 0,
    players,
    routeOwners: {},
    harborOwners: {},
    trainDeck, shipDeck,
    trainDiscard: [], shipDiscard: [],
    market,
    ticketDeck,
    turnDraws: 0,
    finalTurns: null,
    lastEvent: null,
    winner: null,
    log: [`Game set up for ${P} players.`],
  };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface TtrPlayerView {
  seat: number;
  color: TtrColor;
  name: string;
  handCount: number;
  hand?: number[];
  ticketCount: number;
  tickets?: Ticket[];
  pendingTickets?: Ticket[];
  trains: number;
  ships: number;
  boxTrains: number;
  boxShips: number;
  harbors: number;
  score: number;
  ready: boolean;
}

export interface TtrView {
  game: 'ttr';
  you: number | null;
  phase: TtrState['phase'];
  turnColor: TtrColor;
  first: number;
  players: TtrPlayerView[];
  routeOwners: Record<string, TtrColor>;
  harborOwners: Record<string, TtrColor>;
  market: (number | null)[];
  trainDeckCount: number;
  shipDeckCount: number;
  trainDiscardTop: number | null;
  shipDiscardTop: number | null;
  ticketDeckCount: number;
  turnDraws: number; // cards drawn this turn (0-2)
  finalTurns: number | null;
  lastEvent: TtrEvent | null;
  winner: TtrColor | null;
  log: string[];
}

export function ttrViewFor(state: TtrState, viewer: number | null | 'dev'): TtrView {
  const seatOf = (i: number) => state.players[(state.first + i) % state.players.length];
  return {
    game: 'ttr',
    you: typeof viewer === 'number' ? viewer : null,
    phase: state.phase,
    turnColor: seatOf(state.turn).color,
    first: state.first,
    players: state.players.map((p) => {
      const reveal = viewer === 'dev' || viewer === p.seat;
      return {
        seat: p.seat, color: p.color, name: p.name,
        handCount: p.hand.length,
        hand: reveal ? p.hand : undefined,
        ticketCount: p.tickets.length,
        tickets: reveal ? p.tickets : undefined,
        pendingTickets: reveal ? p.pendingTickets : undefined,
        trains: p.trains, ships: p.ships,
        boxTrains: p.boxTrains, boxShips: p.boxShips,
        harbors: p.harbors, score: p.score, ready: p.ready,
      };
    }),
    routeOwners: state.routeOwners,
    harborOwners: state.harborOwners,
    market: state.market,
    trainDeckCount: state.trainDeck.length,
    shipDeckCount: state.shipDeck.length,
    trainDiscardTop: state.trainDiscard.at(-1) ?? null,
    shipDiscardTop: state.shipDiscard.at(-1) ?? null,
    ticketDeckCount: state.ticketDeck.length,
    turnDraws: state.turnDraws,
    finalTurns: state.finalTurns,
    lastEvent: state.lastEvent,
    winner: state.winner,
    log: state.log,
  };
}
