// TV view for Rails & Sails: the world map fills the screen; score chips top,
// the shared card market + decks along the bottom (public info), and a caption
// with camera fly-to on every action.

import { CATALOG, HARBOR_SNAP, type TtrView } from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { TtrTable, useTtrScene, routeCenter, type TtrSceneDef, type TtrFocus } from './TtrScene';

export function cardFace(scene: TtrSceneDef, cardId: number): string | null {
  const t = CATALOG[cardId];
  if (!t) return null;
  const deck = t.type === 'train' ? scene.decks.train : scene.decks.ship;
  return deck.sheets[String(t.sheet)]?.face ?? null;
}

export function ticketFace(scene: TtrSceneDef, idx: number): string | null {
  const d = scene.decks.ticket;
  const c = d.cards[idx];
  return c ? d.sheets[String(c.sheet)]?.face ?? null : null;
}

export function TtrBoard({ view }: { view: TtrView }) {
  const scene = useTtrScene();

  if (!scene) return <div className="page center"><h2>Loading the world</h2></div>;

  const ev = view.lastEvent;
  const focus: TtrFocus | undefined = ev?.route
    ? { seq: ev.seq, ...routeCenter(scene, ev.route) }
    : undefined;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <TtrTable
          scene={scene}
          routeOwners={view.routeOwners}
          harborOwners={view.harborOwners}
          harborSnapOf={HARBOR_SNAP}
          markers={view.players.map((p) => ({ color: p.color, score: p.score }))}
          focus={focus}
          interactive
        />
      </div>

      {/* phase banner */}
      <div className="ig-glass" style={{ position: 'absolute', top: 12, left: 12, padding: '10px 14px', borderRadius: 14 }}>
        <div className="ig-lab">{view.phase === 'setup' ? 'Choosing tickets and fleets' : view.finalTurns !== null ? 'Final turns' : 'Rails & Sails'}</div>
        <div style={{ font: '700 16px Inter, sans-serif' }}>The World</div>
      </div>

      {/* player chips */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
        {view.players.map((p) => (
          <div key={p.seat} className="ig-glass" style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999,
            outline: view.turnColor === p.color && view.phase === 'playing' ? `2px solid ${SEAT_HEX[p.color]}` : 'none',
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
            <b>{p.name}</b>
            <span style={{ opacity: 0.75 }}>{p.score}</span>
            <span style={{ opacity: 0.5, fontSize: 12 }}>{p.trains}·{p.ships}</span>
          </div>
        ))}
      </div>

      {/* market: 6 faceup + decks */}
      <div className="ig-glass" style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 52, height: 74, borderRadius: 6, background: '#12202b', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 13px Inter, sans-serif' }}>{view.shipDeckCount}</div>
          <div className="ig-lab" style={{ paddingTop: 4 }}>Ships</div>
        </div>
        {view.market.map((c, i) => (
          <div key={i} style={{ width: 52, height: 74, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)', background: '#0a0e12' }}>
            {c !== null && cardFace(scene, c) && (
              <img src={cardFace(scene, c)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        ))}
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 52, height: 74, borderRadius: 6, background: '#1d1712', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 13px Inter, sans-serif' }}>{view.trainDeckCount}</div>
          <div className="ig-lab" style={{ paddingTop: 4 }}>Trains</div>
        </div>
      </div>

      {/* caption */}
      {ev && view.phase !== 'setup' && (
        <div className="ig-glass" style={{
          position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 18px', borderRadius: 14, minWidth: 300, textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[ev.color] }} />
            <span className="ig-lab">{ev.player}</span>
          </div>
          <div style={{ font: '700 18px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 0.4 }}>{ev.title}</div>
          {ev.detail && <div style={{ opacity: 0.7, fontSize: 13 }}>{ev.detail}</div>}
        </div>
      )}

      {view.winner && (
        <div className="ig-glass" style={{
          position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%,-50%)',
          padding: '26px 44px', borderRadius: 20, textAlign: 'center',
        }}>
          <div className="ig-lab">Winner</div>
          <div style={{ font: '800 30px Inter, sans-serif', color: SEAT_HEX[view.winner] }}>
            {view.players.find((p) => p.color === view.winner)?.name}
          </div>
        </div>
      )}
    </div>
  );
}
