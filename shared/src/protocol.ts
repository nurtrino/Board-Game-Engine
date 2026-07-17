// WebSocket protocol between clients (phones + TV) and the server: the
// room/lobby layer plus the per-game state stream.

import type { BrassView, Color } from './brass/state.js';
import type { BrassAction } from './brass/actions.js';
import type { TtrView, TtrColor } from './ttr/state.js';
import type { TtrAction } from './ttr/actions.js';
import type { TrekView, TrekSeat } from './trek/state.js';
import type { TrekAction } from './trek/actions.js';
import type { DtView, DtSeat } from './darktower/state.js';
import type { DtAction } from './darktower/actions.js';
import type { DuneView, DuneSeat } from './dune/state.js';
import type { DuneAction } from './dune/actions.js';
import type { AxisView, AxisSeat, AxisAction } from './axis/game.js';
import type { PolitikView, PolitikSeat } from './politik/state.js';
import type { PolitikAction } from './politik/actions.js';
import type { DsView, DsSeat } from './darksouls/state.js';
import type { DsAction } from './darksouls/actions.js';
import type { FeastAction, FeastSeatColor, FeastView } from './feast/types.js';
import type { BbView, BbSeat } from './bloodborne/state.js';
import type { BbAction } from './bloodborne/actions.js';
import type { SetiView } from './seti/state.js';
import type { SetiAction } from './seti/actions.js';
import type { SetiSeatColor } from './seti/data.js';
import type { BlokusView, BlokusSeat } from './blokus/state.js';
import type { BlokusAction } from './blokus/actions.js';
import { SEAT_COLORS } from './brass/state.js';
import { TTR_COLORS } from './ttr/state.js';
import { TREK_SEATS } from './trek/state.js';
import { DT_SEATS } from './darktower/state.js';
import { DUNE_SEATS } from './dune/state.js';
import { AXIS_SEATS } from './axis/state.js';
import { POLITIK_SEATS } from './politik/state.js';
import { DS_SEATS } from './darksouls/state.js';
import { FEAST_SEATS } from './feast/state.js';
import { BB_SEATS } from './bloodborne/state.js';
import { SETI_SEATS } from './seti/data.js';
import { BLOKUS_SEATS } from './blokus/state.js';

/** Any seat color across games. */
export type SeatColor = Color | TtrColor | TrekSeat | DtSeat | DuneSeat | AxisSeat | PolitikSeat | DsSeat | FeastSeatColor | BbSeat | SetiSeatColor | BlokusSeat;

/** Per-game lobby facts: seat colors in pick order + max players. */
export const GAME_SEATS: Record<string, { colors: readonly SeatColor[]; max: number }> = {
  brass: { colors: SEAT_COLORS, max: 4 },
  ttr: { colors: TTR_COLORS, max: 5 },
  trek: { colors: TREK_SEATS, max: 5 },
  darktower: { colors: DT_SEATS, max: 4 },
  dune: { colors: DUNE_SEATS, max: 4 },
  axis: { colors: AXIS_SEATS, max: 6 },
  politik: { colors: POLITIK_SEATS, max: 6 },
  darksouls: { colors: DS_SEATS, max: 4 },
  feast: { colors: FEAST_SEATS, max: 4 },
  bloodborne: { colors: BB_SEATS, max: 4 },
  seti: { colors: SETI_SEATS, max: 4 },
  blokus: { colors: BLOKUS_SEATS, max: 4 },
};

export type GameView = BrassView | TtrView | TrekView | DtView | DuneView | AxisView | PolitikView | DsView | FeastView | BbView | SetiView | BlokusView;
export type GameAction = BrassAction | TtrAction | TrekAction | DtAction | DuneAction | AxisAction | PolitikAction | DsAction | FeastAction | BbAction | SetiAction | BlokusAction;

/** Per-game create options chosen on the create screen (scenario, variants). */
export type GameOptions = Record<string, string | number | boolean>;

export interface RoomInfo {
  roomId: string;
  name: string; // the save's name, e.g. "Brass — Jul 7"
  game: string; // game id: 'brass' | 'ttr'
  createdAt: number;
  started: boolean;
  players: { name: string; color: SeatColor; connected: boolean; isBot?: boolean }[];
  joinUrl: string; // LAN url phones should open
}

/** One saved game, as listed by GET /api/saves (newest first). */
export interface SaveInfo {
  roomId: string;
  name: string;
  game: string;
  /** False when a historical room contains state from a different engine. */
  compatible: boolean;
  createdAt: number;
  updatedAt: number;
  status: 'lobby' | 'playing' | 'ended';
  era: 'canal' | 'rail' | null;
  round: number | null;
  numRounds: number | null;
  players: { name: string; color: SeatColor }[];
}

export type ClientMsg =
  | { type: 'create_room'; name?: string; game?: string; options?: GameOptions }
  | { type: 'join'; roomId: string; name: string; playerToken?: string }
  | { type: 'watch'; roomId: string } // TV board view
  | { type: 'start' } // host or TV starts the game
  | { type: 'pick_color'; color: SeatColor } // lobby: claim a seat color
  | { type: 'action'; action: GameAction } // play an action (as your seat, or your dev seat)
  | { type: 'axis_battle_visual_ready'; combatId: number; visualSeq: number; ready: boolean } // TV only: exact battle-state presentation readiness
  | { type: 'dev_view'; seat: number | null }; // dev: view/control as any seat (null = own)

export type ServerMsg =
  | { type: 'room_created'; roomId: string; joinUrl: string; /** Save-owner credential; absent only on older servers. */ ownerToken?: string }
  | { type: 'joined'; roomId: string; playerToken: string; playerIndex: number }
  | { type: 'watching'; roomId: string }
  | { type: 'room'; info: RoomInfo }
  | { type: 'state'; view: GameView } // game state, redacted for the recipient
  | { type: 'error'; message: string };
