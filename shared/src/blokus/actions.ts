// Blokus reducer + legality helpers, per docs/specs/blokus.md (rulebook is
// the rules authority; the mod is scriptless). Shared by the server, the
// device UI (greying), and the CPU seats.

import {
  BLOKUS_CORNERS, BLOKUS_PIECE_BY_ID, BLOKUS_PIECES, BLOKUS_SCORING, BLOKUS_SIZE,
  blokusTransform, type BlokusState,
} from './state.js';

export type BlokusAction =
  | { type: 'place'; pieceId: string; rot: 0 | 1 | 2 | 3; flip: boolean; x: number; y: number }
  | { type: 'pass' };

export interface BlokusResult { ok: boolean; error?: string }
const err = (error: string): BlokusResult => ({ ok: false, error });

const idx = (x: number, y: number) => y * BLOKUS_SIZE + x;
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < BLOKUS_SIZE && y < BLOKUS_SIZE;

export interface BlokusPlacementCheck { ok: boolean; why?: string; cells?: [number, number][] }

/** Rulebook legality for one placement (does not check turn ownership). */
export function blokusCheckPlacement(
  s: BlokusState, seat: number, pieceId: string, rot: 0 | 1 | 2 | 3, flip: boolean, x: number, y: number,
): BlokusPlacementCheck {
  const player = s.players[seat];
  if (!player) return { ok: false, why: 'BAD SEAT' };
  const def = BLOKUS_PIECE_BY_ID[pieceId];
  if (!def) return { ok: false, why: 'UNKNOWN PIECE' };
  if (!player.remaining.includes(pieceId)) return { ok: false, why: 'PIECE ALREADY PLACED' };

  const cells = blokusTransform(def.cells, rot, flip).map(([cx, cy]) => [cx + x, cy + y] as [number, number]);
  for (const [cx, cy] of cells) {
    if (!inBounds(cx, cy)) return { ok: false, why: 'OFF THE BOARD', cells };
    if (s.board[idx(cx, cy)] !== null) return { ok: false, why: 'OVERLAPS A PIECE', cells };
  }

  const firstMove = player.remaining.length === BLOKUS_PIECES.length;
  let cornerContact = false;
  for (const [cx, cy] of cells) {
    // never edge-to-edge with your own color
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx, ny = cy + dy;
      if (inBounds(nx, ny) && s.board[idx(nx, ny)] === seat) {
        return { ok: false, why: 'TOUCHES YOUR COLOR EDGE TO EDGE', cells };
      }
    }
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = cx + dx, ny = cy + dy;
      if (inBounds(nx, ny) && s.board[idx(nx, ny)] === seat) cornerContact = true;
    }
  }

  if (firstMove) {
    const [kx, ky] = BLOKUS_CORNERS[player.color];
    if (!cells.some(([cx, cy]) => cx === kx && cy === ky)) {
      return { ok: false, why: 'FIRST PIECE MUST COVER YOUR CORNER', cells };
    }
  } else if (!cornerContact) {
    return { ok: false, why: 'MUST TOUCH YOUR COLOR CORNER TO CORNER', cells };
  }
  return { ok: true, cells };
}

/** Any legal placement for one piece in any orientation/position? */
function pieceHasPlacement(s: BlokusState, seat: number, pieceId: string): boolean {
  return blokusFirstPlacement(s, seat, [pieceId]) !== null;
}

/** True while the seat can still legally place something. */
export function blokusHasMove(s: BlokusState, seat: number): boolean {
  const player = s.players[seat];
  if (!player || player.passed) return false;
  return player.remaining.some((id) => pieceHasPlacement(s, seat, id));
}

/** First legal placement among the given piece ids (bot + has-move probe). */
export function blokusFirstPlacement(
  s: BlokusState, seat: number, pieceIds: string[],
): { pieceId: string; rot: 0 | 1 | 2 | 3; flip: boolean; x: number; y: number } | null {
  for (const pieceId of pieceIds) {
    const def = BLOKUS_PIECE_BY_ID[pieceId];
    if (!def) continue;
    const seen = new Set<string>();
    for (const flip of [false, true]) {
      for (const rot of [0, 1, 2, 3] as const) {
        const shape = blokusTransform(def.cells, rot, flip);
        const key = shape.map(([a, b]) => `${a},${b}`).join(';');
        if (seen.has(key)) continue; // symmetric orientation, skip duplicates
        seen.add(key);
        const w = Math.max(...shape.map(([a]) => a));
        const h = Math.max(...shape.map(([, b]) => b));
        for (let y = 0; y + h < BLOKUS_SIZE; y++) {
          for (let x = 0; x + w < BLOKUS_SIZE; x++) {
            if (blokusCheckPlacement(s, seat, pieceId, rot, flip, x, y).ok) {
              return { pieceId, rot, flip, x, y };
            }
          }
        }
      }
    }
  }
  return null;
}

/** Greedy CPU: place the largest piece that fits, else pass. */
export function blokusBotAction(s: BlokusState, seat: number): BlokusAction {
  const player = s.players[seat];
  const bySize = [...(player?.remaining ?? [])].sort(
    (a, b) => BLOKUS_PIECE_BY_ID[b].cells.length - BLOKUS_PIECE_BY_ID[a].cells.length,
  );
  const found = blokusFirstPlacement(s, seat, bySize);
  return found ? { type: 'place', ...found } : { type: 'pass' };
}

function seatDone(s: BlokusState, seat: number): boolean {
  const p = s.players[seat];
  return p.passed || p.remaining.length === 0;
}

function advance(s: BlokusState): void {
  // Rulebook rotation is by color (Blue, Yellow, Red, Green), independent of
  // room seat indices — walk the color order ring from the current seat.
  const at = s.order.indexOf(s.turn);
  for (let step = 1; step <= s.order.length; step++) {
    const next = s.order[(at + step) % s.order.length];
    if (!seatDone(s, next)) {
      s.turn = next;
      return;
    }
  }
  endGame(s);
}

function endGame(s: BlokusState): void {
  s.phase = 'ended';
  let best = -Infinity;
  for (const p of s.players) {
    if (p.remaining.length === 0) {
      p.score = BLOKUS_SCORING.allPlaced + (p.lastPieceId === 'I1' ? BLOKUS_SCORING.monominoLast : 0);
    } else {
      p.score = BLOKUS_SCORING.perSquare
        * p.remaining.reduce((sum, id) => sum + BLOKUS_PIECE_BY_ID[id].cells.length, 0);
    }
    best = Math.max(best, p.score);
  }
  s.winners = s.players.filter((p) => p.score === best).map((p) => p.seat);
  const names = s.winners.map((w) => s.players[w].color.toUpperCase()).join(' · ');
  event(s, `${names} WINS THE BOARD · ${best} POINTS`, 'win');
}

function event(s: BlokusState, text: string, kind?: string): void {
  s.lastEvent = { seq: s.lastEvent.seq + 1, text, kind };
}

export function applyBlokusAction(s: BlokusState, seat: number, a: BlokusAction): BlokusResult {
  if (s.phase !== 'playing') return err('Game over');
  const player = s.players[seat];
  if (!player) return err('Bad seat');
  if (s.turn !== seat) return err('Not your turn');

  if (a.type === 'pass') {
    player.passed = true;
    event(s, `${player.color.toUpperCase()} PASSES`, 'pass');
    advance(s);
    if (s.phase === 'playing') event(s, `${s.players[s.turn].color.toUpperCase()} TO PLAY`, 'turn');
    return { ok: true };
  }

  if (a.type === 'place') {
    const rot = ([0, 1, 2, 3].includes(a.rot) ? a.rot : 0) as 0 | 1 | 2 | 3;
    const check = blokusCheckPlacement(s, seat, a.pieceId, rot, !!a.flip, a.x, a.y);
    if (!check.ok || !check.cells) return err(check.why ?? 'Illegal placement');
    const cellIds = check.cells.map(([cx, cy]) => idx(cx, cy));
    for (const c of cellIds) s.board[c] = seat;
    player.remaining = player.remaining.filter((id) => id !== a.pieceId);
    player.lastPieceId = a.pieceId;
    s.lastPlaced = { seat, pieceId: a.pieceId, cells: cellIds };
    const size = BLOKUS_PIECE_BY_ID[a.pieceId].cells.length;
    event(s, `${player.color.toUpperCase()} PLACES ${a.pieceId} · ${size} SQUARE${size === 1 ? '' : 'S'}`, 'place');
    advance(s);
    if (s.phase === 'playing' && s.turn !== seat) {
      event(s, `${s.players[s.turn].color.toUpperCase()} TO PLAY`, 'turn');
    }
    return { ok: true };
  }

  return err('Unknown action');
}
