// Small HUD parts shared by the big screen and the player devices.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SEAT_HEX, type CardSheet } from './pieces';

export const seatVar = (color: string, extra: CSSProperties = {}): CSSProperties =>
  ({ '--seat': SEAT_HEX[color] ?? '#888', ...extra } as CSSProperties);

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** A number that counts to its new value and shows what changed beside it. */
export function Ticker({ value, prefix = '', suffix = '', quiet = false }: {
  value: number; prefix?: string; suffix?: string; quiet?: boolean;
}) {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<{ n: number; id: number } | null>(null);
  const at = useRef(value);
  useEffect(() => {
    const start = at.current;
    if (start === value) return;
    const d = value - start;
    if (!quiet) setDelta({ n: d, id: performance.now() });
    const t0 = performance.now();
    const dur = Math.min(1100, 260 + Math.abs(d) * 34);
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = Math.round(start + d * easeOut(k));
      at.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const clear = window.setTimeout(() => setDelta(null), 2000);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(clear); at.current = value; };
  }, [value, quiet]);
  return (
    <span className="bbx-tick">
      {shown < 0 ? '−' : ''}{prefix}{Math.abs(shown)}{suffix}
      {delta && (
        <i key={delta.id} className={delta.n > 0 ? 'up' : 'down'}>
          {delta.n > 0 ? '+' : '−'}{prefix}{Math.abs(delta.n)}
        </i>
      )}
    </span>
  );
}

/** Counts from 0 to `to` once `run` turns true. Calls onStep as it climbs. */
export function Count({ to, run, ms = 520, prefix = '', onStep }: {
  to: number; run: boolean; ms?: number; prefix?: string; onStep?: (n: number) => void;
}) {
  const [n, setN] = useState(0);
  const step = useRef(onStep);
  step.current = onStep;
  useEffect(() => {
    if (!run) { setN(0); return; }
    if (to === 0) { setN(0); return; }
    const t0 = performance.now();
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = Math.round(to * easeOut(k));
      if (v !== last) { last = v; setN(v); step.current?.(v); }
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return <span className="ig-num">{run ? `${prefix}${n}` : ''}</span>;
}

/** The actions in a turn: spent ones are hollow, the ones left are solid. */
export function Pips({ total, left }: { total: number; left: number }) {
  return (
    <span className="bbx-pips" aria-label={`${left} of ${total} actions left`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < total - left ? 'spent' : ''} />)}
    </span>
  );
}

/** Rounds of the era as segments: done, current, to come. */
export function RoundBar({ round, numRounds }: { round: number; numRounds: number }) {
  return (
    <div className="bbx-rounds" aria-hidden>
      {Array.from({ length: numRounds }, (_, i) => (
        <i key={i} className={i + 1 < round ? 'done' : i + 1 === round ? 'now' : ''} />
      ))}
    </div>
  );
}

export function cardBg(sheet: CardSheet, cell: number) {
  const col = cell % sheet.cols;
  const row = Math.floor(cell / sheet.cols);
  return {
    backgroundImage: `url(${sheet.image})`,
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${(col / (sheet.cols - 1)) * 100}% ${(row / (sheet.rows - 1)) * 100}%`,
  } as const;
}

export const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;
