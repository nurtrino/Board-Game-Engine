// TV view for Kanban EV — the factory board in 3D (meeples, Sandra, cars,
// parts, markers), with player chips, the day plate and the action caption
// as HUD. Phones hold the player boards and make every move.

import { useEffect, useRef } from 'react';
import { DEPTS, type KanbanView } from '@bge/shared';
import { KanbanTable, SEAT_TINT, useKanbanScene } from './KanbanScene';
import { playSfx } from '../sfx';

const hex = (t: number[]) => `#${t.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

export function KanbanBoard({ view }: { view: KanbanView }) {
  const scene = useKanbanScene();

  const lastSeq = useRef(0);
  useEffect(() => {
    const e = view.lastEvent;
    if (!e || e.seq <= lastSeq.current) return;
    lastSeq.current = e.seq;
    const t = e.title ?? '';
    playSfx(/rolls out|Claims/.test(t) ? 'win' : /Collects|order/.test(t) ? 'coins' : /Selects/.test(t) ? 'cardDraw' : 'link');
  }, [view.lastEvent?.seq]);
  const prevTurn = useRef(view.turn);
  useEffect(() => {
    if (view.phase !== 'ended' && prevTurn.current !== view.turn) { prevTurn.current = view.turn; playSfx('turn'); }
  }, [view.turn, view.phase]);
  const ended = useRef(false);
  useEffect(() => { if (view.winner && !ended.current) { ended.current = true; playSfx('win'); } }, [view.winner]);

  if (!scene) return <div className="page center"><h2>Opening the factory</h2></div>;

  const ev = view.lastEvent;
  const current = view.players[view.turn];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <KanbanTable scene={scene} view={view} />
      </div>

      {/* title plate */}
      <div className="ig-glass" style={{ position: 'absolute', top: 12, left: 12, padding: '10px 14px', borderRadius: 14 }}>
        <div className="ig-lab">
          {view.phase === 'ended' ? 'Game over'
            : view.phase === 'meeting' ? `Day ${view.day} · Board meeting`
            : view.phase === 'orientation' ? 'New employee orientation'
            : `Day ${view.day} · Week ${view.week} · Cycle ${view.cycle}`}
        </div>
        <div style={{ font: '700 16px Inter, sans-serif' }}>Kanban EV</div>
        <div style={{ fontSize: 11, opacity: 0.6, paddingTop: 2 }}>
          Sandra: {view.sandra.desk ? 'at her desk' : view.sandra.dept}
        </div>
      </div>

      {/* player chips */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {view.players.map((p) => (
          <div key={p.seat} className="ig-glass" style={{
            padding: '8px 12px', borderRadius: 14, minWidth: 240,
            outline: view.turn === p.seat && view.phase !== 'ended' ? `2px solid ${hex(SEAT_TINT[p.color])}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: hex(SEAT_TINT[p.color]) }} />
              <b>{p.name}</b>
              <span style={{ opacity: 0.55, fontSize: 11 }}>{p.workstation ? p.workstation.dept : ''}</span>
              <span style={{ marginLeft: 'auto', font: '800 16px Inter, sans-serif' }}>{p.pp} PP</span>
            </div>
            <div style={{ display: 'flex', gap: 9, paddingTop: 4, fontSize: 12, opacity: 0.85 }}>
              <span title="banked shifts">{p.bankedShifts}bk</span>
              <span title="books">{p.books}bo</span>
              <span title="vouchers">{p.vouchers}vo</span>
              <span title="speech on board">{p.speechOnBoard}sp</span>
              <span title="certifications" style={{ marginLeft: 'auto' }}>
                {DEPTS.filter((d) => p.training[d] >= 3).length} certs · {p.garages.filter(Boolean).length} cars
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* caption */}
      {ev && view.phase !== 'ended' && (
        <div className="ig-glass" style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 18px', borderRadius: 14, minWidth: 320, maxWidth: 560, textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: hex(SEAT_TINT[ev.color]) }} />
            <span className="ig-lab">{ev.player}</span>
          </div>
          <div style={{ font: '700 18px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 0.4 }}>{ev.title}</div>
          {ev.detail && <div style={{ opacity: 0.7, fontSize: 13 }}>{ev.detail}</div>}
        </div>
      )}

      {/* whose turn / pending */}
      {view.phase !== 'ended' && current && (
        <div className="ig-glass" style={{
          position: 'absolute', top: 108, left: 12, padding: '8px 12px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: hex(SEAT_TINT[view.pending ? view.players[view.pending.seat].color : current.color]) }} />
          <b>{view.pending ? view.players[view.pending.seat].name : current.name}</b>
          <span style={{ opacity: 0.6 }}>
            {view.pending ? 'deciding' : view.phase === 'meeting' ? 'speaking' : view.phase === 'select' ? 'choosing a workstation' : 'working'}
          </span>
        </div>
      )}

      {view.winner && (
        <div className="ig-glass" style={{
          position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%,-50%)',
          padding: '26px 44px', borderRadius: 20, textAlign: 'center',
        }}>
          <div className="ig-lab">Employee of the month</div>
          <div style={{ font: '800 30px Inter, sans-serif', color: hex(SEAT_TINT[view.winner]) }}>
            {view.players.find((p) => p.color === view.winner)?.name}
          </div>
          {view.finalScores && (
            <div style={{ opacity: 0.8, paddingTop: 8, fontSize: 13 }}>
              {view.finalScores.map((f) => (
                <div key={f.seat}>{view.players[f.seat].name} — {f.pp} PP</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
