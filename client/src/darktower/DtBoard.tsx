// TV view for Dark Tower: the circular board with the real tower center.
// Every action's display steps (reel picture / LCD / sound) replay in
// sequence exactly as the 1981 tower would show them, with a caption.

import { useEffect, useRef, useState } from 'react';
import { KINGDOMS, type DtView, type DtStep } from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { DtTable, useDtScene } from './DtScene';
import { sfxEnabled } from '../sfx';

// step-player: walks lastEvent.steps on their own timing
export function useTowerDisplay(view: DtView, playSound: boolean) {
  const [display, setDisplay] = useState<{ pic: string; lcd: string }>({ pic: '', lcd: '  ' });
  const lastSeq = useRef(0);
  const queue = useRef<DtStep[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const scene = useDtScene();

  useEffect(() => {
    const ev = view.lastEvent;
    if (!ev || ev.seq <= lastSeq.current) return;
    lastSeq.current = ev.seq;
    queue.current.push(...ev.steps);
    const tick = () => {
      const s = queue.current.shift();
      if (!s) { timer.current = undefined; return; }
      setDisplay({ pic: s.pic, lcd: s.lcd });
      if (playSound && s.sfx && scene?.sounds[s.sfx] && sfxEnabled()) {
        try { new Audio(scene.sounds[s.sfx]).play().catch(() => undefined); } catch { /* autoplay */ }
      }
      timer.current = setTimeout(tick, s.ms);
    };
    if (!timer.current) tick();
  }, [view.lastEvent?.seq, playSound, scene]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return display;
}

export function DtBoard({ view }: { view: DtView }) {
  const scene = useDtScene();
  const display = useTowerDisplay(view, true);

  if (!scene) return <div className="page center"><h2>Raising the tower</h2></div>;

  const ev = view.lastEvent;
  const current = view.players[view.turn];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <DtTable
          scene={scene}
          tokens={view.players.map((p) => ({ color: p.color, quad: p.quad }))}
          pic={display.pic}
          lcd={display.lcd}
          wedgeMaps={scene.wedge}
          interactive
        />
      </div>

      {/* title plate + LCD readout */}
      <div className="ig-glass" style={{ position: 'absolute', top: 12, left: 12, padding: '10px 14px', borderRadius: 14 }}>
        <div className="ig-lab">Level {view.level}{view.dtBrigands !== null ? ` — ${view.dtBrigands} brigands within` : ''}</div>
        <div style={{ font: '700 16px Inter, sans-serif' }}>Dark Tower</div>
        <div style={{
          marginTop: 6, display: 'inline-block', padding: '4px 12px', borderRadius: 6,
          background: '#180b0b', border: '1px solid rgba(255,80,60,0.35)',
          font: '700 26px "Courier New", monospace', letterSpacing: 6, color: '#ff5a3c',
          textShadow: '0 0 12px rgba(255,90,60,0.8)', minWidth: 70, textAlign: 'center',
        }}>{display.lcd || '  '}</div>
      </div>

      {/* player chips */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
        {view.players.map((p) => (
          <div key={p.seat} className="ig-glass" style={{
            padding: '8px 12px', borderRadius: 14,
            outline: view.turn === p.seat && view.phase !== 'ended' ? `2px solid ${SEAT_HEX[p.color]}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
              <b>{p.name}</b>
              <span style={{ opacity: 0.55, fontSize: 11 }}>{KINGDOMS[p.color]}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 4, fontSize: 12, opacity: 0.85 }}>
              <span title="warriors">{p.warriors}w</span>
              <span title="gold">{p.gold}g</span>
              <span title="food">{p.food}f</span>
              <span title="kingdoms crossed">{p.quad}/4</span>
              <span title="keys held">{['brasskey', 'silverkey', 'goldkey'].filter((k) => p[k as 'brasskey']).length} keys</span>
            </div>
          </div>
        ))}
      </div>

      {/* caption */}
      {ev && (
        <div className="ig-glass" style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 18px', borderRadius: 14, minWidth: 320, textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[ev.color] }} />
            <span className="ig-lab">{ev.player}</span>
          </div>
          <div style={{ font: '700 18px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 0.4 }}>{ev.title}</div>
          {ev.detail && <div style={{ opacity: 0.7, fontSize: 13 }}>{ev.detail}</div>}
        </div>
      )}

      {/* whose turn */}
      {view.phase !== 'ended' && current && (
        <div className="ig-glass" style={{
          position: 'absolute', top: 120, left: 12, padding: '8px 12px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[current.color] }} />
          <b>{current.name}</b>
          <span style={{ opacity: 0.6 }}>
            {view.phase === 'battle' ? 'in battle' : view.phase === 'bazaar' ? 'at the bazaar'
              : view.phase === 'riddle' ? 'at the tower gates' : view.phase === 'cursePick' ? 'casting a curse'
              : view.phase === 'turnDone' ? 'turn over' : 'to act'}
          </span>
        </div>
      )}

      {view.winner && (
        <div className="ig-glass" style={{
          position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)',
          padding: '26px 44px', borderRadius: 20, textAlign: 'center',
        }}>
          <div className="ig-lab">The Dark Tower falls</div>
          <div style={{ font: '800 30px Inter, sans-serif', color: SEAT_HEX[view.winner] }}>
            {view.players.find((p) => p.color === view.winner)?.name}
          </div>
          <div style={{ opacity: 0.8, paddingTop: 6 }}>Rating {view.score}</div>
        </div>
      )}
    </div>
  );
}
