// Everdell base game — state + setup + per-viewer views, per
// docs/specs/everdell.md. Setup numbers come from the mod's Lua
// (deal 5/6/7/8 clockwise, 3 forest cards at 2p else 4, meadow 8, 4 of 16
// special events); rules enforcement comes from The Gilded Book pp28-41 and
// The Archive appendix. All public names are Everdell/EVERDELL_/ev-prefixed.

import {
  EV_BASIC_EVENTS, EV_CARD_BY_ID, EV_FOREST, EV_SPECIAL_EVENTS,
  everdellDeckList, type EvResMap, type EvResource,
} from './catalog.js';

export type EverdellSeat = 'White' | 'Brown' | 'Teal' | 'Orange';
/** Mod PlayerColors order (Lua 1-8); join order = clockwise turn order. */
export const EVERDELL_SEATS: readonly EverdellSeat[] = ['White', 'Brown', 'Teal', 'Orange'];
/** Display hexes for the lobby swatches + worker tints (TTS player tints). */
export const EVERDELL_SEAT_HEX: Record<EverdellSeat, string> = {
  White: '#e9e6dd', Brown: '#8a5a33', Teal: '#27a098', Orange: '#e2803a',
};

export type EvSeason = 'winter' | 'spring' | 'summer' | 'autumn';
export const EV_SEASONS: readonly EvSeason[] = ['winter', 'spring', 'summer', 'autumn'];

export type EvRes = Record<EvResource, number>;
export const evZeroRes = (): EvRes => ({ twig: 0, resin: 0, pebble: 0, berry: 0 });

/** Where a worker stands. */
export type EvLocRef =
  | { t: 'basic'; id: string }
  | { t: 'forest'; id: string }
  | { t: 'haven' }
  | { t: 'journey'; id: string }
  | { t: 'city'; seat: number; uid: number }       // destination card (incl. Storehouse spot)
  | { t: 'basicEvent'; id: string }
  | { t: 'specialEvent'; id: string };

export interface EvWorker {
  loc: EvLocRef;
  permanent: boolean; // Journey / Monastery / Cemetery never return
}

/** One occupied city space (or spaceless card: Wanderer never lands here). */
export interface EvCityCard {
  uid: number;
  card: string;               // catalog id
  /** Gatherer/Harvester sharing this space (partner card id). */
  sharedWith: string | null;
  sharedUid: number | null;
  /** Construction: its free-critter link has been used. */
  occupiedUsed: boolean;
  /** Point tokens stored on this card (Chapel, Clock Tower). */
  storedPoints: number;
  /** Resources stored on this card (Storehouse). */
  storedRes: EvRes;
  /** Dungeon: imprisoned critter card ids (max 2, second needs Ranger). */
  prisoners: string[];
}

export interface EvSpecialEventState {
  id: string;
  claimedBy: number | null;
  /** Resources placed on the event (fireworks twigs, performer berries, new-management mix). */
  storedRes: EvRes;
  /** Cards placed beneath the event (acorn thieves, scrolls, graduation). */
  beneath: string[];
}

export interface EvBasicEventState { id: string; claimedBy: number | null }

/** A queued decision; only the head may be resolved, only by its seat. */
export type EvPending =
  | { kind: 'gain-any'; seat: number; n: number; reason: string }
  | { kind: 'storehouse'; seat: number; uid: number }
  | { kind: 'pay-per-point'; seat: number; resource: EvResource; max: number; reason: string }
  | { kind: 'peddler'; seat: number; max: number }
  | { kind: 'monk-give'; seat: number; max: number }
  | { kind: 'chip-sweep'; seat: number }
  | { kind: 'miner-mole'; seat: number }
  | { kind: 'teacher-give'; seat: number; cards: string[] }
  | { kind: 'harvester-any'; seat: number; n: number }
  | { kind: 'courthouse'; seat: number }
  | { kind: 'bard-discard'; seat: number; max: number }
  | { kind: 'ruins-target'; seat: number; ruinsUid: number }
  | { kind: 'fool-target'; seat: number }
  | { kind: 'pigeon-play'; seat: number; revealed: string[] }
  | { kind: 'ranger-move'; seat: number }
  | { kind: 'undertaker-discard'; seat: number; remaining: number }
  | { kind: 'undertaker-draw'; seat: number }
  | { kind: 'haven'; seat: number }
  | { kind: 'journey-discard'; seat: number; id: string; n: number }
  | { kind: 'copy-basic'; seat: number; draw: number; allowForest: boolean; allowOccupied: boolean }
  | { kind: 'meadow2-draw'; seat: number }
  | { kind: 'play-discounted'; seat: number; discount: number; from: 'hand' | 'meadow' | 'both'; fromCards: string[] | null; maxPoints: number | null; free: boolean; reason: string; optional: boolean }
  | { kind: 'inn-play'; seat: number }
  | { kind: 'post-office-give'; seat: number }
  | { kind: 'post-office-redraw'; seat: number }
  | { kind: 'university-target'; seat: number }
  | { kind: 'monastery-give'; seat: number }
  | { kind: 'cemetery-source'; seat: number }
  | { kind: 'cemetery-play'; seat: number; revealed: string[] }
  | { kind: 'clock-tower'; seat: number; uid: number }
  | { kind: 'summer-meadow'; seat: number; remaining: number }
  | { kind: 'discard-any-draw'; seat: number }        // forest: discard any, draw 2x
  | { kind: 'discard-up-to-3-any'; seat: number }     // forest: discard up to 3, gain 1 any each
  | { kind: 'fireworks-twigs'; seat: number; eventId: string }
  | { kind: 'performer-berries'; seat: number; eventId: string }
  | { kind: 'new-management'; seat: number; eventId: string }
  | { kind: 'acorn-thieves'; seat: number; eventId: string }
  | { kind: 'graduation'; seat: number; eventId: string }
  | { kind: 'ancient-scrolls'; seat: number; eventId: string; revealed: string[] }
  | { kind: 'marketing-plan'; seat: number; eventId: string }
  | { kind: 'croak-city-discard'; seat: number; eventId: string }
  | { kind: 'well-run-city'; seat: number; eventId: string }
  | { kind: 'shepherd-pay'; seat: number; cost: EvResMap };

export interface EverdellPlayer {
  seat: number;
  color: EverdellSeat;
  name: string;
  isCpu: boolean;
  season: EvSeason;
  passed: boolean;
  hand: string[];
  city: EvCityCard[];
  res: EvRes;
  points: number;              // loose point tokens
  workersTotal: number;
  workers: EvWorker[];         // deployed
  achievedBasic: string[];
  achievedSpecial: string[];
  /** Set at game end. */
  score: number | null;
  scoreParts: { cards: number; tokens: number; prosperity: number; journey: number; events: number } | null;
}

export interface EverdellState {
  game: 'everdell';
  seed: number;
  rolls: number;
  phase: 'playing' | 'ended';
  players: EverdellPlayer[];
  turn: number;
  /** The current seat's action is complete; END TURN is the only legal act. */
  turnDone: boolean;
  deck: string[];
  discard: string[];
  meadow: (string | null)[];   // 8 slots
  forest: { id: string; }[];   // 3 (2p) or 4 dealt locations
  basicEvents: EvBasicEventState[];
  specialEvents: EvSpecialEventState[];
  pending: EvPending[];
  nextUid: number;
  winners: number[];
  /** loc lets the TV fly the camera to where the action landed. */
  lastEvent: { seq: number; text: string; kind?: string; loc?: EvLocRef };
}

// ---------- seeded rng ----------

function hash32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Advance the state's rng stream; uniform int in [0, n). */
export function evRandInt(s: { seed: number; rolls: number }, n: number): number {
  s.rolls += 1;
  return hash32(s.seed ^ Math.imul(s.rolls, 0x9e3779b1)) % n;
}

export function evShuffle<T>(s: { seed: number; rolls: number }, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = evRandInt(s, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- setup ----------

export function createEverdell(seated: { name: string; color: EverdellSeat }[], seed: number): EverdellState {
  const s: EverdellState = {
    game: 'everdell',
    seed,
    rolls: 0,
    phase: 'playing',
    players: seated.map((p, seat) => ({
      seat,
      color: p.color,
      name: p.name,
      isCpu: /^CPU\b/i.test(p.name),
      season: 'winter',
      passed: false,
      hand: [],
      city: [],
      res: evZeroRes(),
      points: 0,
      workersTotal: 2,          // winter: start1 + start2 (Lua meeple_GUID)
      workers: [],
      achievedBasic: [],
      achievedSpecial: [],
      score: null,
      scoreParts: null,
    })),
    turn: 0,
    turnDone: false,
    deck: [],
    discard: [],
    meadow: Array.from({ length: 8 }, () => null),
    forest: [],
    basicEvents: EV_BASIC_EVENTS.map((e) => ({ id: e.id, claimedBy: null })),
    specialEvents: [],
    pending: [],
    nextUid: 1,
    winners: [],
    lastEvent: { seq: 0, text: 'WINTER FALLS ON EVERDELL', kind: 'turn' },
  };

  // main deck: 128 shuffled (base 120 + farms 8; Lua 1928-1934, 2045)
  s.deck = evShuffle(s, everdellDeckList());

  // forest locations: 3 at 2p, 4 at 3-4p (Lua 1038-1047)
  const forestPool = evShuffle(s, EV_FOREST.map((f) => f.id));
  const forestCount = s.players.length <= 2 ? 3 : 4;
  s.forest = forestPool.slice(0, forestCount).map((id) => ({ id }));

  // special events: 4 of 16 (Lua setupSpecialEvents)
  const eventPool = evShuffle(s, EV_SPECIAL_EVENTS.map((e) => e.id));
  s.specialEvents = eventPool.slice(0, 4).map((id) => ({ id, claimedBy: null, storedRes: evZeroRes(), beneath: [] }));

  // meadow: 8 face up
  for (let i = 0; i < 8; i++) s.meadow[i] = s.deck.pop() ?? null;

  // opening hands: 5/6/7/8 clockwise from the starting player (Lua 2173-2185)
  for (let i = 0; i < s.players.length; i++) {
    const n = 5 + i;
    for (let k = 0; k < n; k++) {
      const c = s.deck.pop();
      if (c) s.players[i].hand.push(c);
    }
  }

  s.lastEvent = { seq: 1, text: `${s.players[0].name.toUpperCase()} OPENS THE GAME`, kind: 'turn' };
  return s;
}

// ---------- helpers shared with the client ----------

/** Does this card id occupy a city space when played into a city? */
export function evTakesSpace(cardId: string): boolean {
  return !EV_CARD_BY_ID[cardId]?.noSpace;
}

/** Spaces used in a city (shared pairs = 1; Wanderer = 0). */
export function evCitySpaces(city: EvCityCard[]): number {
  return city.filter((c) => evTakesSpace(c.card)).length;
}

export function evCityHas(city: EvCityCard[], cardId: string): boolean {
  return city.some((c) => c.card === cardId || c.sharedWith === cardId);
}

/** Count copies of a card in a city (shared partners count). */
export function evCityCount(city: EvCityCard[], cardId: string): number {
  let n = 0;
  for (const c of city) {
    if (c.card === cardId) n++;
    if (c.sharedWith === cardId) n++;
  }
  return n;
}

export const EV_CITY_LIMIT = 15;
export const EV_HAND_LIMIT = 8;

// ---------- views ----------

export interface EvPlayerView extends Omit<EverdellPlayer, 'hand'> {
  hand: string[];      // your own; empty for others
  handCount: number;
}

export interface EverdellView {
  game: 'everdell';
  you: number | null;
  phase: 'playing' | 'ended';
  players: EvPlayerView[];
  turn: number;
  turnDone: boolean;
  deckCount: number;
  discardCount: number;
  meadow: (string | null)[];
  forest: { id: string }[];
  basicEvents: EvBasicEventState[];
  specialEvents: EvSpecialEventState[];
  /** The head decision if it belongs to you (or a public stub), else null. */
  pending: EvPending | null;
  pendingCount: number;
  winners: number[];
  lastEvent: { seq: number; text: string; kind?: string; loc?: EvLocRef };
}

export function everdellViewFor(state: EverdellState, viewer: number | null | 'dev'): EverdellView {
  const you = viewer === 'dev' ? 0 : viewer;
  const head = state.pending[0] ?? null;
  return {
    game: 'everdell',
    you,
    phase: state.phase,
    players: state.players.map((p) => ({
      ...p,
      hand: p.seat === you ? p.hand : [],
      handCount: p.hand.length,
    })),
    turn: state.turn,
    turnDone: state.turnDone,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    meadow: state.meadow,
    forest: state.forest,
    basicEvents: state.basicEvents,
    specialEvents: state.specialEvents,
    pending: head,
    pendingCount: state.pending.length,
    winners: state.winners,
    lastEvent: state.lastEvent,
  };
}
