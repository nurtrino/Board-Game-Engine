// Blokus 20x20 — state + setup + views, per docs/specs/blokus.md. Rules come
// from the official rulebook staged with the mod (295656883 has no Lua); the
// mod supplies board art, colors, corner assignment, and piece proportions
// (mirrored in data.json by tools/tts-extract/extract-blokus.mjs).

import data from './data.json';

export type BlokusSeat = 'Blue' | 'Yellow' | 'Red' | 'Green';
/** Official turn order; also the seat-index order (seat 0 = Blue). */
export const BLOKUS_SEATS: readonly BlokusSeat[] = data.turnOrder as BlokusSeat[];
export const BLOKUS_SIZE: number = data.size;
export const BLOKUS_COLORS: Record<BlokusSeat, string> = data.colors as Record<BlokusSeat, string>;
/** Printed corner square per color (grid coords: x right, y down in art). */
export const BLOKUS_CORNERS: Record<BlokusSeat, [number, number]> = data.corners as Record<BlokusSeat, [number, number]>;
/** Authentic piece proportions measured from the mod's cached meshes. */
export const BLOKUS_CELL_WORLD: number = data.cellWorld;
export const BLOKUS_PIECE_HEIGHT: number = data.pieceHeight;

export interface BlokusPieceDef {
  id: string;
  cells: [number, number][];
}

/** The 21 standard Blokus polyominoes (89 squares), canonical orientation. */
export const BLOKUS_PIECES: BlokusPieceDef[] = [
  { id: 'I1', cells: [[0, 0]] },
  { id: 'I2', cells: [[0, 0], [1, 0]] },
  { id: 'I3', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'V3', cells: [[0, 0], [1, 0], [0, 1]] },
  { id: 'I4', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: 'O4', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: 'T4', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: 'L4', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: 'S4', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { id: 'F5', cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]] },
  { id: 'I5', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { id: 'L5', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]] },
  { id: 'N5', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]] },
  { id: 'P5', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
  { id: 'T5', cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
  { id: 'U5', cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
  { id: 'V5', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { id: 'W5', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
  { id: 'X5', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
  { id: 'Y5', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1]] },
  { id: 'Z5', cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] },
];
export const BLOKUS_PIECE_BY_ID: Record<string, BlokusPieceDef> = Object.fromEntries(
  BLOKUS_PIECES.map((p) => [p.id, p]),
);

export const BLOKUS_SCORING = data.scoring as { perSquare: number; allPlaced: number; monominoLast: number };

/** rot quarter-turns clockwise, optional flip (x mirror), normalized to min (0,0). */
export function blokusTransform(cells: [number, number][], rot: 0 | 1 | 2 | 3, flip: boolean): [number, number][] {
  let out = cells.map(([x, y]) => (flip ? [-x, y] : [x, y]) as [number, number]);
  for (let i = 0; i < rot; i++) out = out.map(([x, y]) => [-y, x] as [number, number]);
  const minX = Math.min(...out.map(([x]) => x));
  const minY = Math.min(...out.map(([, y]) => y));
  out = out.map(([x, y]) => [x - minX, y - minY] as [number, number]);
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export interface BlokusPlayer {
  seat: number;
  color: BlokusSeat;
  name: string;
  isCpu: boolean;
  remaining: string[]; // piece ids not yet placed
  passed: boolean; // permanent, per the rulebook
  lastPieceId: string | null;
  score: number | null; // set at game end
}

export interface BlokusState {
  game: 'blokus';
  seed: number;
  phase: 'playing' | 'ended';
  /** 400 cells (y * 20 + x); seat index or null. */
  board: (number | null)[];
  /** Indexed by room seat: humans first (their picked colors), CPUs fill the rest. */
  players: BlokusPlayer[];
  /** Seat indices in the rulebook turn sequence Blue, Yellow, Red, Green. */
  order: number[];
  turn: number; // seat index whose turn it is
  winners: number[]; // seats sharing the top score (ended only)
  lastPlaced: { seat: number; pieceId: string; cells: number[] } | null;
  lastEvent: { seq: number; text: string; kind?: string };
}

export function createBlokus(seated: { name: string; color: BlokusSeat }[], seed: number): BlokusState {
  // All four colors always play (rulebook). Humans keep their room seat index
  // (the server's contract); unclaimed colors become CPU seats after them.
  const taken = new Set(seated.map((s) => s.color));
  const cpuColors = BLOKUS_SEATS.filter((c) => !taken.has(c));
  const players: BlokusPlayer[] = [
    ...seated.map((s, seat) => ({
      seat, color: s.color, name: s.name, isCpu: false,
      remaining: BLOKUS_PIECES.map((p) => p.id), passed: false, lastPieceId: null, score: null,
    })),
    ...cpuColors.map((color, i) => ({
      seat: seated.length + i, color, name: `CPU ${color}`, isCpu: true,
      remaining: BLOKUS_PIECES.map((p) => p.id), passed: false, lastPieceId: null, score: null,
    })),
  ];
  const order = [...players]
    .sort((a, b) => BLOKUS_SEATS.indexOf(a.color) - BLOKUS_SEATS.indexOf(b.color))
    .map((p) => p.seat);
  return {
    game: 'blokus',
    seed,
    phase: 'playing',
    board: Array.from({ length: BLOKUS_SIZE * BLOKUS_SIZE }, () => null),
    players,
    order,
    turn: order[0],
    winners: [],
    lastPlaced: null,
    lastEvent: { seq: 0, text: 'BLUE OPENS THE GAME', kind: 'turn' },
  };
}

export interface BlokusView extends BlokusState {
  you: number | null;
  /** squares each color still holds (derived for HUD chips) */
  squaresLeft: number[];
}

/** Full-information game: every viewer sees the whole state. */
export function blokusViewFor(state: BlokusState, viewer: number | null | 'dev'): BlokusView {
  return {
    ...state,
    you: viewer === 'dev' ? 0 : viewer,
    squaresLeft: state.players.map((p) =>
      p.remaining.reduce((sum, id) => sum + (BLOKUS_PIECE_BY_ID[id]?.cells.length ?? 0), 0)),
  };
}
