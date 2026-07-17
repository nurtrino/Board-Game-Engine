// Blokus player device: the board grid (mod art) for placement, the tray of
// remaining pieces in your color, rotate/flip controls, and a guarded
// permanent PASS. Placement mirrors the engine's legality check so illegal
// taps grey out with the reason instead of bouncing errors.

import { useMemo, useRef, useState } from 'react';
import type { BlokusAction, BlokusView } from '@bge/shared';
import {
  BLOKUS_COLORS, BLOKUS_CORNERS, BLOKUS_PIECE_BY_ID, BLOKUS_PIECES, BLOKUS_SIZE,
  blokusCheckPlacement, blokusHasMove, blokusTransform,
} from '@bge/shared';
import { playSfx } from '../sfx';
import './blokus.css';

interface Props {
  view: BlokusView;
  act: (a: BlokusAction) => void;
  seat: number;
  error: string | null;
}

/** SVG mini of one polyomino (tray + preview). */
function PieceGlyph({ cells, color, size = 12 }: { cells: [number, number][]; color: string; size?: number }) {
  const w = Math.max(...cells.map(([x]) => x)) + 1;
  const h = Math.max(...cells.map(([, y]) => y)) + 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w * size} height={h * size} aria-hidden="true">
      {cells.map(([x, y]) => (
        <rect key={`${x},${y}`} x={x + 0.05} y={y + 0.05} width={0.9} height={0.9} rx={0.12}
          fill={color} stroke="rgba(0,0,0,.4)" strokeWidth={0.06} />
      ))}
    </svg>
  );
}

export default function BlokusPlay({ view, act, seat, error }: Props) {
  const me = view.players[seat];
  const [sel, setSel] = useState<string | null>(null);
  const [rot, setRot] = useState<0 | 1 | 2 | 3>(0);
  const [flip, setFlip] = useState(false);
  const [anchor, setAnchor] = useState<[number, number] | null>(null);
  const [confirmPass, setConfirmPass] = useState(false);
  const dragging = useRef(false);

  const myTurn = view.phase === 'playing' && view.turn === seat;
  const done = !me || me.passed || me.remaining.length === 0;
  const canMove = useMemo(
    () => (myTurn && !done ? blokusHasMove(view, seat) : false),
    // board is the only input that changes placement legality between turns
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myTurn, done, view.board, seat],
  );

  const shape = sel ? blokusTransform(BLOKUS_PIECE_BY_ID[sel].cells, rot, flip) : null;
  const placement = sel && shape && anchor
    ? blokusCheckPlacement(view, seat, sel, rot, flip, anchor[0], anchor[1])
    : null;

  if (!me) return <div className="page center"><h2>Watching the board</h2></div>;

  const statusLine = view.phase === 'ended'
    ? `${view.winners.map((w) => view.players[w].color.toUpperCase()).join(' · ')} WINS`
    : done ? (me.remaining.length === 0 ? 'ALL 21 PLACED' : 'PASSED · GAME DONE FOR YOU')
      : myTurn ? (sel ? (anchor ? (placement?.ok ? 'LEGAL · PLACE IT' : placement?.why ?? '') : 'DRAG THE PIECE ON THE BOARD')
        : canMove ? 'YOUR TURN · PICK A PIECE' : 'NO LEGAL PLACEMENT · PASS')
        : `${view.players[view.turn]?.color.toUpperCase()} TO PLAY`;

  const ghost = shape && anchor
    ? shape.map(([cx, cy]) => [cx + anchor[0], cy + anchor[1]] as [number, number])
    : [];

  /** Center the piece footprint under the pointer, clamped on board. */
  const aimAt = (e: { clientX: number; clientY: number; currentTarget: EventTarget }) => {
    if (!shape) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const gx = Math.floor(((e.clientX - rect.left) / rect.width) * BLOKUS_SIZE);
    const gy = Math.floor(((e.clientY - rect.top) / rect.height) * BLOKUS_SIZE);
    const w = Math.max(...shape.map(([x]) => x)) + 1;
    const h = Math.max(...shape.map(([, y]) => y)) + 1;
    const ax = Math.max(0, Math.min(BLOKUS_SIZE - w, gx - Math.floor(w / 2)));
    const ay = Math.max(0, Math.min(BLOKUS_SIZE - h, gy - Math.floor(h / 2)));
    setAnchor((prev) => (prev && prev[0] === ax && prev[1] === ay ? prev : [ax, ay]));
  };

  return (
    <div className="bk-play" data-testid="bk-play">
      <header className="bk-head ig-glass">
        <span className="bk-id" style={{ borderColor: BLOKUS_COLORS[me.color] }}>
          {me.color.toUpperCase()} · {me.name.toUpperCase()}
        </span>
        <span className={'bk-status' + (myTurn ? ' active' : '')} aria-live="polite" data-testid="bk-status">
          {statusLine}
        </span>
        <span className="bk-spacer" />
        <span className="bk-score-note">{view.squaresLeft[seat]} SQUARES LEFT</span>
        <a className="bk-btn ghost" href="/blokus/rulebook.pdf" target="_blank" rel="noreferrer">RULEBOOK</a>
      </header>

      <div className="bk-main">
        <section className="bk-grid-wrap ig-glass" aria-label="Board">
          <svg className="bk-grid" viewBox={`0 0 ${BLOKUS_SIZE} ${BLOKUS_SIZE}`} data-testid="bk-grid"
            onPointerDown={(e) => {
              if (!myTurn || done || !shape) return;
              e.preventDefault();
              (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
              dragging.current = true;
              aimAt(e);
            }}
            onPointerMove={(e) => { if (dragging.current) aimAt(e); }}
            onPointerUp={() => { dragging.current = false; }}
            onPointerCancel={() => { dragging.current = false; }}>
            {/* board art aligned so the printed grid spans 0..20 */}
            <image href="/blokus/board.webp"
              x={-0.1162 * (BLOKUS_SIZE / 0.7764)} y={-0.1079 * (BLOKUS_SIZE / 0.7764)}
              width={BLOKUS_SIZE / 0.7764} height={BLOKUS_SIZE / 0.7764} />
            {view.board.map((cellSeat, i) => {
              if (cellSeat === null) return null;
              const x = i % BLOKUS_SIZE, y = Math.floor(i / BLOKUS_SIZE);
              const hot = view.lastPlaced?.cells.includes(i);
              return (
                <rect key={i} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} rx={0.1}
                  fill={BLOKUS_COLORS[view.players[cellSeat].color]}
                  stroke={hot ? '#fff' : 'rgba(0,0,0,.45)'} strokeWidth={hot ? 0.09 : 0.05} />
              );
            })}
            {/* your corner marker while opening */}
            {me.remaining.length === BLOKUS_PIECES.length && (
              <circle cx={BLOKUS_CORNERS[me.color][0] + 0.5} cy={BLOKUS_CORNERS[me.color][1] + 0.5} r={0.62}
                fill="none" stroke={BLOKUS_COLORS[me.color]} strokeWidth={0.14} strokeDasharray="0.25 0.16" />
            )}
            {ghost.map(([x, y]) => (
              <rect key={`g${x},${y}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} rx={0.1}
                fill={BLOKUS_COLORS[me.color]} opacity={0.55}
                stroke={placement?.ok ? '#9df0a8' : '#f08a80'} strokeWidth={0.12} />
            ))}
          </svg>
        </section>

        <aside className="bk-rail">
          <div className="bk-rail-head">
            <span>YOUR PIECES</span>
            <span>{me.remaining.length} LEFT</span>
          </div>
          <div className="bk-tray ig-glass" data-testid="bk-tray">
            {BLOKUS_PIECES.filter((p) => me.remaining.includes(p.id)).map((p) => (
              <button key={p.id} className={'bk-piece' + (sel === p.id ? ' sel' : '')}
                data-testid={`bk-piece-${p.id}`} aria-pressed={sel === p.id}
                disabled={done || view.phase !== 'playing'}
                onClick={() => { setSel(sel === p.id ? null : p.id); setRot(0); setFlip(false); playSfx('click'); }}>
                <PieceGlyph cells={p.cells} color={BLOKUS_COLORS[me.color]} />
              </button>
            ))}
            {me.remaining.length === 0 && <span className="bk-empty">EVERY PIECE PLACED</span>}
          </div>

          <div className="bk-actions ig-glass" data-testid="bk-actions">
            <button className="bk-btn" data-testid="bk-rotate" disabled={!sel}
              onClick={() => setRot(((rot + 1) % 4) as 0 | 1 | 2 | 3)}>ROTATE</button>
            <button className="bk-btn" data-testid="bk-flip" disabled={!sel}
              onClick={() => setFlip(!flip)}>FLIP</button>
            <button className="bk-btn primary" data-testid="bk-place"
              disabled={!myTurn || !placement?.ok}
              onClick={() => {
                if (!sel || !anchor) return;
                act({ type: 'place', pieceId: sel, rot, flip, x: anchor[0], y: anchor[1] });
                setSel(null); setAnchor(null); setRot(0); setFlip(false); setConfirmPass(false);
              }}>
              PLACE{myTurn && sel && anchor && !placement?.ok && placement?.why ? ` · ${placement.why}` : ''}
            </button>
            <button className={'bk-btn' + (myTurn && !canMove ? ' primary' : ' ghost')} data-testid="bk-pass"
              disabled={!myTurn || done}
              onClick={() => {
                if (!confirmPass) { setConfirmPass(true); return; }
                act({ type: 'pass' });
                setConfirmPass(false); setSel(null); setAnchor(null);
              }}>
              {confirmPass ? 'CONFIRM PASS · PERMANENT' : 'PASS'}
            </button>
            <span className="bk-note">
              {sel ? 'DRAG THE PIECE INTO POSITION, ROTATE AND FLIP, THEN PLACE' : 'FIRST PIECE MUST COVER YOUR CORNER'}
            </span>
          </div>
        </aside>
      </div>

      {view.phase === 'ended' && (
        <div className="bk-end-sheet ig-glass" data-testid="bk-end">
          <span className="bk-end-title">
            {view.winners.includes(seat) ? 'YOU WIN' : `${view.winners.map((w) => view.players[w].color.toUpperCase()).join(' · ')} WINS`}
          </span>
          {[...view.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((p) => (
            <span key={p.seat} className="bk-end-row" style={{ borderColor: BLOKUS_COLORS[p.color] }}>
              {p.color.toUpperCase()} · {(p.score ?? 0) > 0 ? '+' : ''}{p.score}
            </span>
          ))}
        </div>
      )}

      {error && <div className="bk-toast" data-testid="bk-error">{error}</div>}
    </div>
  );
}
