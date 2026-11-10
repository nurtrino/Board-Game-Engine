// WebSocket protocol between clients (phones + TV) and the server: the
// room/lobby layer plus the per-game state stream.

import type { BrassView, Color } from './brass/state.js';
import type { BrassAction } from './brass/actions.js';
import type { ShSeat, ShView } from './secret-hitler/room.js';
import type { ShAction } from './secret-hitler/rules.js';
import type { AxisView, AxisSeat, AxisAction } from './axis/game.js';
import { SEAT_COLORS } from './brass/state.js';
import { AXIS_SEATS } from './axis/state.js';
import { SH_PICK_ORDER } from './secret-hitler/rules.js';

/** Any seat color across games. */
export type SeatColor = Color | ShSeat | AxisSeat;

/** Per-game lobby facts: seat colors in pick order + max players. */
export const GAME_SEATS: Record<string, { colors: readonly SeatColor[]; max: number }> = {
  brass: { colors: SEAT_COLORS, max: 4 },
  secrethitler: { colors: SH_PICK_ORDER, max: 10 },
  axis: { colors: AXIS_SEATS, max: 6 },
};

export type GameView = BrassView | ShView | AxisView;
export type GameAction = BrassAction | ShAction | AxisAction;

/** Per-game create options chosen on the create screen (scenario, variants). */
export type GameOptions = Record<string, string | number | boolean>;

export interface RoomInfo {
  roomId: string;
  name: string; // the save's name, e.g. "Brass - Jul 7"
  game: string; // game id: 'brass' | 'secrethitler'
  createdAt: number;
  started: boolean;
  players: { name: string; color: SeatColor; connected: boolean; isBot?: boolean }[];
  joinUrl: string; // url phones should open
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
  | { type: 'presented'; seq: number } // TV only: finished showing events up to seq
  | { type: 'rematch' } // host or TV: deal a new game to the same table
  | { type: 'dev_view'; seat: number | null }; // dev: view/control as any seat (null = own)

export type ServerMsg =
  | { type: 'room_created'; roomId: string; joinUrl: string; /** Save-owner credential; absent only on older servers. */ ownerToken?: string }
  | { type: 'joined'; roomId: string; playerToken: string; playerIndex: number }
  | { type: 'watching'; roomId: string }
  | { type: 'room'; info: RoomInfo }
  | { type: 'state'; view: GameView } // game state, redacted for the recipient
  | { type: 'error'; message: string };
