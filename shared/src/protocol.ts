// WebSocket protocol between clients (phones + TV) and the server: the
// room/lobby layer plus the per-game state stream.

import type { BrassView, Color } from './brass/state.js';
import type { BrassAction } from './brass/actions.js';
import type { TtrView, TtrColor } from './ttr/state.js';
import type { TtrAction } from './ttr/actions.js';
import type { TrekView, TrekSeat } from './trek/state.js';
import type { TrekAction } from './trek/actions.js';
import { SEAT_COLORS } from './brass/state.js';
import { TTR_COLORS } from './ttr/state.js';
import { TREK_SEATS } from './trek/state.js';

/** Any seat color across games. */
export type SeatColor = Color | TtrColor | TrekSeat;

/** Per-game lobby facts: seat colors in pick order + max players. */
export const GAME_SEATS: Record<string, { colors: readonly SeatColor[]; max: number }> = {
  brass: { colors: SEAT_COLORS, max: 4 },
  ttr: { colors: TTR_COLORS, max: 5 },
  trek: { colors: TREK_SEATS, max: 5 },
};

export type GameView = BrassView | TtrView | TrekView;
export type GameAction = BrassAction | TtrAction | TrekAction;

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
  createdAt: number;
  updatedAt: number;
  status: 'lobby' | 'playing' | 'ended';
  era: 'canal' | 'rail' | null;
  round: number | null;
  numRounds: number | null;
  players: { name: string; color: SeatColor }[];
}

export type ClientMsg =
  | { type: 'create_room'; name?: string; game?: string }
  | { type: 'join'; roomId: string; name: string; playerToken?: string }
  | { type: 'watch'; roomId: string } // TV board view
  | { type: 'start' } // host or TV starts the game
  | { type: 'pick_color'; color: SeatColor } // lobby: claim a seat color
  | { type: 'action'; action: GameAction } // play an action (as your seat, or your dev seat)
  | { type: 'dev_view'; seat: number | null }; // dev: view/control as any seat (null = own)

export type ServerMsg =
  | { type: 'room_created'; roomId: string; joinUrl: string }
  | { type: 'joined'; roomId: string; playerToken: string; playerIndex: number }
  | { type: 'watching'; roomId: string }
  | { type: 'room'; info: RoomInfo }
  | { type: 'state'; view: GameView } // game state, redacted for the recipient
  | { type: 'error'; message: string };
