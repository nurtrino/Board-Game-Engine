// Trekking the National Parks. Setup + state + views, built from the golden
// extracted from the TTS mod (data.json: 46-node trail graph, 39 park cards
// with transcribed icon costs, 6 major parks, 24 trek faces) and the mod's
// global Lua (scoring, stone-bonus and tie-break semantics) per
// docs/specs/trekking.md.
//
// Setup, per the rulebook: seed one random stone on every park location;
// reveal 3 of 6 Major Parks; deal 2 Trek cards to each player; flip 5 Trek
// cards (river) and 3 Park cards (river). Each turn = exactly 2 actions
// (draw / move / claim / occupy), then discard to 12 and pass.

import data from './data.json';
import { mulberry32, shuffle } from '../brass/rng.js';

export type TrekSeat = 'Blue' | 'Red' | 'White' | 'Yellow' | 'Orange' | 'Green';
export const TREK_SEATS: TrekSeat[] = data.seats as TrekSeat[];

export type TrekSuit = 'Blue' | 'Yellow' | 'Purple' | 'Red' | 'Green' | 'Brown';
export const TREK_SUITS: TrekSuit[] = data.suits as TrekSuit[];

export type StoneColor = 'Yellow' | 'Red' | 'Black' | 'Green' | 'Blue';
export const STONE_COLORS: StoneColor[] = ['Yellow', 'Red', 'Black', 'Green', 'Blue'];

export type MajorAbility =
  | 'plusOneMove' // Grand Canyon: each move may stretch card total by +1
  | 'wildPairs' // Acadia: any 2 trek cards = 1 wild icon
  | 'stoneSwap' // Everglades: on occupy, swap a stone with another player
  | 'freeHop' // Hawai'i Volcanoes: after each claim, free move of distance 1
  | 'drawTwo' // Denali: on occupy, draw 2 trek cards
  | 'drawOnClaim'; // Yellowstone: after each claim, draw 1 trek card

/** One trek-card FACE; decks hold catalog indices (4 copies each). */
export interface TrekCardType { suit: TrekSuit; value: 1 | 2 | 3 | 4; cell: number }
export const TREK_CATALOG: TrekCardType[] = data.trekCatalog as TrekCardType[];
export const TREK_COPIES = 4;

export interface ParkCard { name: string; vp: 5 | 7 | 10; cost: TrekSuit[]; cell: number; node: number }
export const PARKS: ParkCard[] = data.parks as ParkCard[];

export interface MajorPark { name: string; cost: TrekSuit[]; cell: number; node: number; ability: MajorAbility }
export const MAJORS: MajorPark[] = data.majors as MajorPark[];

export interface TrekNode { name: string; px: number[]; major: boolean }
export const NODES: Record<number, TrekNode> = Object.fromEntries(
  Object.entries(data.nodes).map(([id, n]) => [Number(id), n as TrekNode]),
);
export const START = 0;
export const PARK_NODE_IDS: number[] = Object.keys(NODES).map(Number).filter((id) => id !== START);

export const EDGES: [number, number][] = data.edges as [number, number][];
export const NEIGHBORS: Record<number, number[]> = {};
for (const id of [START, ...PARK_NODE_IDS]) NEIGHBORS[id] = [];
for (const [a, b] of EDGES) { NEIGHBORS[a].push(b); NEIGHBORS[b].push(a); }

export const STONE_COUNT: Record<StoneColor, number> = data.stoneCount as Record<StoneColor, number>;
export const SCORING = data.scoring as {
  stoneVp: number; campsiteVp: number;
  mostStones: Record<StoneColor, number>; secondMostStones: Record<StoneColor, number>;
};

export const TREK_RULES = {
  handLimit: 12,
  startHand: 2,
  campsites: 3,
  trekRiver: 5,
  parkRiver: 3,
  majorsInPlay: 3,
  actionsPerTurn: 2,
  endTriggerParks: 5,
} as const;

export interface TrekPlayer {
  seat: number;
  color: TrekSeat;
  name: string;
  node: number; // current trekker location (0 = START)
  hand: number[]; // trek catalog ids
  campsites: number; // unplaced (start 3)
  stones: Record<StoneColor, number>;
  parks: number[]; // claimed park ids (index into PARKS)
  majors: number[]; // occupied major ids (index into MAJORS)
  score: number; // final score (filled at end)
}

export interface TrekEvent {
  seq: number;
  color: TrekSeat;
  player: string;
  title: string;
  detail: string;
  node?: number; // focus a board location
  drew?: number;
}

export interface TrekState {
  seed: number;
  phase: 'playing' | 'ended';
  turn: number; // index into players
  first: number; // first player (round anchor for the end trigger)
  actionsLeft: number; // 2 at turn start; end_turn allowed at any count
  players: TrekPlayer[];
  stones: Record<number, StoneColor | null>; // by node id; null once collected
  trekDeck: number[]; // catalog ids, top = end
  trekDiscard: number[];
  trekRiver: (number | null)[]; // 5 faceup
  parkDeck: number[]; // park ids, top = end
  parkRiver: (number | null)[]; // 3 faceup
  majors: number[]; // the 3 MAJORS ids in play
  finalRound: boolean; // end trigger seen; finish the round
  bonuses: { most: Partial<Record<StoneColor, TrekSeat>>; second: Partial<Record<StoneColor, TrekSeat>> } | null;
  lastEvent: TrekEvent | null;
  winners: TrekSeat[] | null; // >1 = shared victory
  log: string[];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createTrek(seated: { name: string; color: TrekSeat }[], seed: number): TrekState {
  if (seated.length < 2 || seated.length > 5) throw new Error('Trekking is 2-5 players');
  const rng = mulberry32(seed);

  // stones: bag of 45, one per park location
  const bag: StoneColor[] = [];
  for (const c of STONE_COLORS) for (let i = 0; i < STONE_COUNT[c]; i++) bag.push(c);
  shuffle(bag, rng);
  if (bag.length !== PARK_NODE_IDS.length) throw new Error('stone/park count mismatch');
  const stones: Record<number, StoneColor | null> = {};
  PARK_NODE_IDS.forEach((id, i) => { stones[id] = bag[i]; });

  // majors: 3 of 6
  const majorIds = shuffle(MAJORS.map((_, i) => i), rng).slice(0, TREK_RULES.majorsInPlay);

  // trek deck: 96 = 24 faces x 4
  const trekDeck: number[] = [];
  TREK_CATALOG.forEach((_, id) => { for (let i = 0; i < TREK_COPIES; i++) trekDeck.push(id); });
  shuffle(trekDeck, rng);

  const parkDeck = shuffle(PARKS.map((_, i) => i), rng);

  const players: TrekPlayer[] = seated.map((s, seat) => ({
    seat, color: s.color, name: s.name, node: START,
    hand: [trekDeck.pop()!, trekDeck.pop()!],
    campsites: TREK_RULES.campsites,
    stones: { Yellow: 0, Red: 0, Black: 0, Green: 0, Blue: 0 },
    parks: [], majors: [], score: 0,
  }));

  const st: TrekState = {
    seed, phase: 'playing',
    first: Math.floor(rng() * players.length),
    turn: 0,
    actionsLeft: TREK_RULES.actionsPerTurn,
    players,
    stones,
    trekDeck, trekDiscard: [],
    trekRiver: Array.from({ length: TREK_RULES.trekRiver }, () => trekDeck.pop() ?? null),
    parkDeck,
    parkRiver: Array.from({ length: TREK_RULES.parkRiver }, () => parkDeck.pop() ?? null),
    majors: majorIds,
    finalRound: false,
    bonuses: null,
    lastEvent: null,
    winners: null,
    log: [],
  };
  st.turn = st.first;
  settleTrekRiver(st);
  return st;
}

/** Four-of-five flush: if 4 of the 5 faceup trek cards share a suit, redeal. */
export function settleTrekRiver(s: TrekState): void {
  for (let guard = 0; guard < 30; guard++) {
    const faces = s.trekRiver.filter((c): c is number => c !== null);
    if (faces.length < 5) return;
    const bySuit: Record<string, number> = {};
    for (const c of faces) bySuit[TREK_CATALOG[c].suit] = (bySuit[TREK_CATALOG[c].suit] ?? 0) + 1;
    if (!Object.values(bySuit).some((n) => n >= 4)) return;
    s.trekDiscard.push(...faces);
    for (let i = 0; i < s.trekRiver.length; i++) s.trekRiver[i] = drawTrekCard(s);
  }
}

/** Top of the trek deck, reshuffling the discard when empty. */
export function drawTrekCard(s: TrekState): number | null {
  if (!s.trekDeck.length && s.trekDiscard.length) {
    s.trekDeck = shuffle(s.trekDiscard, mulberry32(s.seed + s.trekDiscard.length * 7919));
    s.trekDiscard = [];
  }
  return s.trekDeck.pop() ?? null;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface TrekPlayerView extends Omit<TrekPlayer, 'hand'> {
  hand?: number[];
  handCount: number;
}

export interface TrekView {
  game: 'trek';
  you: number | null;
  phase: TrekState['phase'];
  turn: number;
  first: number;
  actionsLeft: number;
  players: TrekPlayerView[];
  stones: Record<number, StoneColor | null>;
  trekRiver: (number | null)[];
  parkRiver: (number | null)[];
  majors: number[];
  majorOwners: Record<number, TrekSeat[]>; // major id -> seats that occupied it
  trekDeckCount: number;
  trekDiscardCount: number;
  parkDeckCount: number;
  finalRound: boolean;
  bonuses: TrekState['bonuses'];
  lastEvent: TrekEvent | null;
  winners: TrekSeat[] | null;
  log: string[];
}

export function trekViewFor(s: TrekState, seat: number | null | 'dev'): TrekView {
  const majorOwners: Record<number, TrekSeat[]> = {};
  for (const id of s.majors) {
    majorOwners[id] = s.players.filter((p) => p.majors.includes(id)).map((p) => p.color);
  }
  return {
    game: 'trek',
    you: typeof seat === 'number' ? seat : null,
    phase: s.phase, turn: s.turn, first: s.first, actionsLeft: s.actionsLeft,
    players: s.players.map((p) => {
      const mine = seat === 'dev' || seat === p.seat || s.phase === 'ended';
      const { hand, ...rest } = p;
      return { ...rest, ...(mine ? { hand } : {}), handCount: hand.length };
    }),
    stones: s.stones,
    trekRiver: s.trekRiver, parkRiver: s.parkRiver,
    majors: s.majors, majorOwners,
    trekDeckCount: s.trekDeck.length, trekDiscardCount: s.trekDiscard.length,
    parkDeckCount: s.parkDeck.length,
    finalRound: s.finalRound, bonuses: s.bonuses,
    lastEvent: s.lastEvent, winners: s.winners, log: s.log.slice(-40),
  };
}
