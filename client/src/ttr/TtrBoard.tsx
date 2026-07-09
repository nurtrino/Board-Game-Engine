// TV view for Rails & Sails: the world map fills the screen; score chips top,
// the shared card market + decks along the bottom (public info), and a caption
// with camera fly-to on every action.

import { useEffect, useRef } from 'react';
import { CATALOG, HARBOR_SNAP, type TtrView } from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { TtrTable, useTtrScene, routeCenter, type TtrSceneDef, type TtrFocus } from './TtrScene';
import { playSfx } from '../sfx';

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

  // the TV is the table: it voices each action, the turnover, and the win
  const lastSeq = useRef(0);
  useEffect(() => {
    const e = view.lastEvent;
    if (e && e.seq > lastSeq.current) { lastSeq.current = e.seq; playSfx(e.drew ? 'cardDraw' : e.route ? 'build' : 'link'); }
  }, [view.lastEvent?.seq]);
  const prevColor = useRef(view.turnColor);
  useEffect(() => {
    if (view.phase === 'playing' && prevColor.current !== view.turnColor) { prevColor.current = view.turnColor; playSfx('turn'); }
  }, [view.turnColor, view.phase]);
  const ended = useRef(false);
  useEffect(() => { if (view.phase === 'ended' && !ended.current) { ended.current = true; playSfx('win'); } }, [view.phase]);

  if (!scene) return <div className="page center"><h2>Loading the world</h2></div>;

  const ev = view.lastEvent;
  const focus: TtrFocus | undefined = ev?.route
    ? { seq: ev.seq, ...routeCenter(scene, ev.route) }
    : undefined;
  const turnName = view.players.find((p) => p.color === view.turnColor)?.name ?? view.turnColor;
  const turnHex = SEAT_HEX[view.turnColor];
  const standings = [...view.players].sort((a, b) => b.score - a.score);

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

      {/* big whose-turn banner, readable from the couch */}
      {view.phase === 'playing' && !view.winner && (
        <div className="ig-glass" style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 22px', borderRadius: 16, textAlign: 'center',
          borderBottom: `3px solid ${turnHex}`,
        }}>
          <div className="ig-lab" style={{ opacity: 0.6 }}>Now playing</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: turnHex }} />
            <span style={{ font: '800 26px Inter, sans-serif' }}>{turnName}</span>
          </div>
          {view.finalTurns !== null && (
            <div style={{ marginTop: 4, color: '#e0b060', font: '700 12px Inter, sans-serif', letterSpacing: 0.4 }}>
              FINAL TURNS · A FLEET RAN LOW, THE GAME IS ENDING
            </div>
          )}
        </div>
      )}

      {/* player chips */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-end' }}>
        {view.players.map((p) => (
          <div key={p.seat} className="ig-glass" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 14, minWidth: 200,
            outline: view.turnColor === p.color && view.phase === 'playing' ? `2px solid ${SEAT_HEX[p.color]}` : 'none',
          }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
            <b style={{ flex: 1 }}>{p.name}</b>
            <span style={{ font: '800 22px Inter, sans-serif' }}>{p.score}<span style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, marginLeft: 3 }}>PTS</span></span>
            <span style={{ opacity: 0.55, fontSize: 12, textAlign: 'right', lineHeight: 1.2 }}>
              {p.trains} trains<br />{p.ships} ships
            </span>
          </div>
        ))}
        <div className="ig-lab" style={{ opacity: 0.5, paddingRight: 4 }}>Score · pieces left</div>
      </div>

      {/* market: 6 faceup + decks */}
      <div className="ig-glass" style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 14px 10px', borderRadius: 16,
      }}>
        <div className="ig-lab" style={{ opacity: 0.6 }}>Shared travel cards · anyone may draw these</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <div className="ig-lab" style={{ paddingTop: 4 }}>Trains left</div>
        </div>
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
