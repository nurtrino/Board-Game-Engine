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
  }));
  const first = Math.floor(rng() * players.length);
  return {
    seed, phase: 'playing', level, dtBrigands,
    riddle: RIDDLES[Math.floor(rng() * RIDDLES.length)],
    dragon: { warriors: 2, gold: 6 },
    turn: first, first, players,
    battle: null, bazaar: null, riddlePhase: 0, curse: null,
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
