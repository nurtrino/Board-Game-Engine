// WebSocket protocol between clients (phones + TV) and the server: the
// room/lobby layer plus the Brass game state stream.

import type { BrassView, Color } from './brass/state.js';
import type { BrassAction } from './brass/actions.js';

export interface RoomInfo {
  roomId: string;
  name: string; // the save's name, e.g. "Brass — Jul 7"
  game: string; // game id, e.g. 'brass'
  createdAt: number;
  started: boolean;
  players: { name: string; color: Color; connected: boolean; isBot?: boolean }[];
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
  players: { name: string; color: Color }[];
}

export type ClientMsg =
  | { type: 'create_room'; name?: string; game?: string }
  | { type: 'join'; roomId: string; name: string; playerToken?: string }
  | { type: 'watch'; roomId: string } // TV board view
  | { type: 'start' } // host or TV starts the game
  | { type: 'pick_color'; color: Color } // lobby: claim a seat color
  | { type: 'action'; action: BrassAction } // play an action (as your seat, or your dev seat)
  | { type: 'dev_view'; seat: number | null }; // dev: view/control as any seat (null = own)

export type ServerMsg =
  | { type: 'room_created'; roomId: string; joinUrl: string }
  | { type: 'joined'; roomId: string; playerToken: string; playerIndex: number }
  | { type: 'watching'; roomId: string }
  | { type: 'room'; info: RoomInfo }
  | { type: 'state'; view: BrassView } // Brass game state, redacted for the recipient
  | { type: 'error'; message: string };
