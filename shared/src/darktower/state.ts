// Dark Tower. State + setup + views, a faithful port of the TTS mod's global
// Lua (games/dark-tower/golden/global.lua — itself a ROM-faithful port of the
// 1981 TMS-1400 tower). Rules per docs/specs/dark-tower.md, which carries Lua
// line refs for every mechanic. 2-4 players; one action per turn; nothing is
// hidden (the original's scorecards are public).

import { mulberry32 } from '../brass/rng.js';

export type DtSeat = 'Red' | 'Blue' | 'Yellow' | 'Green';
export const DT_SEATS: DtSeat[] = ['Red', 'Blue', 'Yellow', 'Green'];
export const KINGDOMS: Record<DtSeat, string> = {
  Red: 'Arisilon', Blue: 'Brynthia', Yellow: 'Durnin', Green: 'Zenon',
};

export type DtKey = 'brasskey' | 'silverkey' | 'goldkey';
export const DT_KEYS: DtKey[] = ['brasskey', 'silverkey', 'goldkey'];

/** One tower display beat: reel picture, 2-char LCD, sound, hold time. */
export interface DtStep { pic: string; lcd: string; sfx: string; ms: number }

export interface DtPlayer {
  seat: number;
  color: DtSeat;
  name: string;
  warriors: number;
  gold: number;
  food: number;
  beast: 0 | 1;
  scout: 0 | 1;
  healer: 0 | 1;
  sword: 0 | 1;
  pegasus: 0 | 1;
  brasskey: 0 | 1;
  silverkey: 0 | 1;
  goldkey: 0 | 1;
  quad: number; // kingdoms crossed: 0 home start .. 4 home again
  cursed: 0 | 1;
  citadelUsed: 0 | 1; // the once-only quad-4 warrior doubling
  moves: number;
  fed: boolean; // this turn's food check already ran
  spot: { x: number; z: number }; // token position on the board (player-placed, like the mod)
}

/** Where each seat's token starts: on its kingdom's citadel. These are the
 *  world (x,z) the mod placed each citadel MODEL at (GUIDs d4a57e/e1ae0b/
 *  3749e1/2ee535), matched to kingdoms by seat proximity. `spot` is in the
 *  same world frame as the buildings, so a token at spot = citadel lands on
 *  the printed badge. */
// centres measured from the printed citadel badges on boardart.webp (colour-
// weighted centroid), so each crest piece lands dead-on its printed badge —
// the old hand-eyed values sat the E/W pieces ~0.27 outward of the print.
export const CITADEL_SPOTS: Record<DtSeat, { x: number; z: number }> = {
  Red: { x: -0.54, z: -11.56 }, // Arisilon
  Blue: { x: 11.13, z: 0.68 }, // Brynthia
  Yellow: { x: -0.99, z: 11.38 }, // Durnin
  Green: { x: -11.34, z: -0.77 }, // Zenon
};

// The disc is four 90-degree wedges, each centred on a citadel. Going CCW by
// board bearing the order is Blue(+X) -> Yellow(+Z) -> Green(-X) -> Red(-Z).
// A player starts in their own (home) kingdom and advances one wedge in this
// order on every frontier crossing; quad 4 wraps back to home.
export const KINGDOM_ORDER: DtSeat[] = ['Blue', 'Yellow', 'Green', 'Red'];

/** Which kingdom a player physically occupies, from home + crossings. */
export function currentKingdom(home: DtSeat, quad: number): DtSeat {
  const i = KINGDOM_ORDER.indexOf(home);
  return KINGDOM_ORDER[(i + Math.min(Math.max(quad, 0), 4)) % 4];
}

/** The centre bearing (world atan2(z,x), radians) of a kingdom's wedge. */
export function kingdomAngle(k: DtSeat): number {
  const c = CITADEL_SPOTS[k];
  return Math.atan2(c.z, c.x);
}

// A token stays within +-HALF_WEDGE of its kingdom's bearing and between these
// radii (off the tower base, on the board). It can never slide into another
// kingdom by dragging — only FRONTIER carries it across.
export const TOKEN_MIN_R = 4.5;
export const TOKEN_MAX_R = 12.4;
export const HALF_WEDGE = (43 * Math.PI) / 180; // ~90-deg wedge, small guard band

/** Clamp a desired (x,z) into a kingdom's wedge and ring. */
export function clampToKingdom(k: DtSeat, x: number, z: number): { x: number; z: number } {
  const center = kingdomAngle(k);
  const r = Math.min(TOKEN_MAX_R, Math.max(TOKEN_MIN_R, Math.hypot(x, z) || 1));
  let d = Math.atan2(z, x) - center;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  d = Math.max(-HALF_WEDGE, Math.min(HALF_WEDGE, d));
  const a = center + d;
  return { x: +(r * Math.cos(a)).toFixed(2), z: +(r * Math.sin(a)).toFixed(2) };
}

/** Where a token lands when it enters a kingdom: mid-wedge, mid-ring. */
export function kingdomEntrySpot(k: DtSeat): { x: number; z: number } {
  const a = kingdomAngle(k);
  const r = 8.5;
  return { x: +(r * Math.cos(a)).toFixed(2), z: +(r * Math.sin(a)).toFixed(2) };
}

export interface DtEvent {
  seq: number;
  color: DtSeat;
  player: string;
  title: string;
  detail: string;
  steps: DtStep[];
}

export type DtPhase =
  | 'playing' // current player picks an action
  | 'battle' // rounds resolve on continue/bail
  | 'bazaar' // offer cycle: yes/no/haggle
  | 'cursePick' // wizard: choose a victim
  | 'riddle' // guess key 1 then key 2
  | 'turnDone' // action resolved; end_turn passes the tower
  | 'ended';

export interface DtState {
  seed: number;
  phase: DtPhase;
  level: 1 | 2 | 3;
  dtBrigands: number;
  riddle: [DtKey, DtKey];
  dragon: { warriors: number; gold: number };
  turn: number;
  first: number;
  players: DtPlayer[];
  // sub-state
  battle: { brigands: number; tower: boolean; startW?: number } | null;
  bazaar: {
    offer: 'warrior' | 'food' | 'beast' | 'scout' | 'healer';
    prices: { warrior: number; beast: number; scout: number; healer: number };
    buying: number; // warrior/food quantity so far
    haggled: boolean; // first haggle succeeds 12/16, later 8/16
  } | null;
  riddlePhase: 0 | 1 | 2; // which position is being guessed
  curse: { warriors: number; gold: number } | null; // stored amounts awaiting the victim's turn
  turnSpot: { x: number; z: number }; // current player's spot at turn start (Lua tokenX/tokenZ — lost/cursed snap back here)
  totalMoves: number;
  rolls: number; // draws taken from the seeded rng stream (persistence-safe)
  winner: DtSeat | null;
  score: number | null; // the classic 0-99 rating for the winner
  lastEvent: DtEvent | null;
  log: string[];
}

export const DT_RULES = {
  startWarriors: 10, startGold: 30, startFood: 25,
  eatPer: 15, // ceil(warriors/15) food per turn
  cap: 99,
  goldCap: (p: { warriors: number; beast: number }) => Math.min(99, p.warriors * 6 + p.beast * 50),
} as const;

const RIDDLES: [DtKey, DtKey][] = [
  ['goldkey', 'silverkey'], ['goldkey', 'brasskey'],
  ['silverkey', 'goldkey'], ['silverkey', 'brasskey'],
  ['brasskey', 'silverkey'], ['brasskey', 'goldkey'],
];

export function createDarkTower(seated: { name: string; color: DtSeat }[], seed: number, level: 1 | 2 | 3 = 1): DtState {
  if (seated.length < 2 || seated.length > 4) throw new Error('Dark Tower is 2-4 players');
  const rng = mulberry32(seed);
  const ri = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const dtBrigands = level === 1 ? ri(17, 32) : level === 2 ? ri(33, 64) : ri(17, 64);
  const players: DtPlayer[] = seated.map((s, seat) => ({
    seat, color: s.color, name: s.name,
    warriors: DT_RULES.startWarriors, gold: DT_RULES.startGold, food: DT_RULES.startFood,
    beast: 0, scout: 0, healer: 0, sword: 0, pegasus: 0,
    brasskey: 0, silverkey: 0, goldkey: 0,
    quad: 0, cursed: 0, citadelUsed: 0, moves: 0, fed: false,
    spot: { ...CITADEL_SPOTS[s.color] },
  }));
  const first = Math.floor(rng() * players.length);
  return {
    seed, phase: 'playing', level, dtBrigands,
    riddle: RIDDLES[Math.floor(rng() * RIDDLES.length)],
    dragon: { warriors: 2, gold: 6 },
    turn: first, first, players,
    battle: null, bazaar: null, riddlePhase: 0, curse: null,
    turnSpot: { ...CITADEL_SPOTS[players[first].color] },
    totalMoves: 0, rolls: 0, winner: null, score: null,
    lastEvent: null, log: [],
  };
}

// Everything is public — the view is the state minus the rng internals and
// with the riddle answer hidden until the game ends.
export interface DtView {
  game: 'darktower';
  you: number | null;
  phase: DtPhase;
  level: number;
  turn: number;
  first: number;
  players: DtPlayer[];
  battle: DtState['battle'];
  bazaar: DtState['bazaar'];
  riddlePhase: DtState['riddlePhase'];
  dragon: DtState['dragon'];
  dtBrigands: number | null; // shown once someone reaches the tower fight or at end
  riddle: [DtKey, DtKey] | null; // revealed at game end
  totalMoves: number;
  winner: DtSeat | null;
  score: number | null;
  lastEvent: DtEvent | null;
  log: string[];
}

export function dtViewFor(s: DtState, seat: number | null | 'dev'): DtView {
  const over = s.phase === 'ended';
  return {
    game: 'darktower',
    you: typeof seat === 'number' ? seat : null,
    phase: s.phase, level: s.level, turn: s.turn, first: s.first,
    players: s.players,
    battle: s.battle, bazaar: s.bazaar, riddlePhase: s.riddlePhase,
    dragon: s.dragon,
    dtBrigands: s.battle?.tower || over || seat === 'dev' ? s.dtBrigands : null,
    riddle: over || seat === 'dev' ? s.riddle : null,
    totalMoves: s.totalMoves, winner: s.winner, score: s.score,
    lastEvent: s.lastEvent, log: s.log.slice(-40),
  };
}
