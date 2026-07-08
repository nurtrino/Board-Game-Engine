// Personal device for Rails & Sails. Setup: pick tickets (keep >=3) and your
// train/ship fleet split. In game: the world map fills the screen, actions on
// the right (draw travel cards from the shared market, claim a glowing route,
// draw tickets, build a harbor, exchange pieces), your hand fanned below.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATALOG, RULES, ROUTE_BY_ID, HARBOR_SNAP,
  claimableRoutes, bestCardsFor, harborCities, harborCardsFor,
  type TtrView, type TtrAction,
} from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { TtrTable, useTtrScene, type TtrSceneDef } from './TtrScene';
import { cardFace, ticketFace } from './TtrBoard';
import { GameIntro, TTR_INTRO } from './GameIntro';
import { playSfx } from '../sfx';

const CSS = `
.tp-hand { position: absolute; left: 50%; bottom: -30px; height: 170px; pointer-events: none; z-index: 30; }
.tp-card {
  position: absolute; bottom: 0; left: 0; width: 86px; height: 122px; margin-left: -43px;
  border-radius: 7px; transform-origin: 50% 130%; pointer-events: auto;
  box-shadow: 0 3px 10px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.14);
  transition: transform 0.15s ease; background-size: cover; background-position: center;
}
.tp-card:hover { transform: translateX(var(--tx)) translateY(calc(var(--ty) - 40px)) rotate(0deg) scale(1.25) !important; z-index: 40 !important; }
.tp-overlay { position: absolute; inset: 0; background: rgba(3,6,9,0.82); z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
.tp-tickets { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; max-width: 86vw; }
.tp-ticket { width: 200px; border-radius: 10px; overflow: hidden; cursor: pointer; border: 3px solid rgba(255,255,255,0.12); transition: border-color .12s ease, transform .12s ease; background: #0a0e12; }
.tp-ticket img { display: block; width: 100%; }
.tp-ticket.sel { border-color: #6fd3e8; transform: translateY(-6px); }
.tp-market { display: flex; gap: 10px; align-items: center; }
.tp-mcard { width: 92px; height: 130px; border-radius: 8px; overflow: hidden; border: 2px solid rgba(255,255,255,0.16); cursor: pointer; background: #0a0e12; transition: transform .12s ease, border-color .12s ease; padding: 0; }
.tp-mcard:hover:not(:disabled) { transform: translateY(-6px); border-color: #6fd3e8; }
.tp-mcard img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tp-act {
  display: block; width: 100%; text-align: center; padding: 12px 14px; border-radius: 11px;
  border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06);
  color: #e8ebf0; font: 700 13px Inter, sans-serif; letter-spacing: 1.2px; text-transform: uppercase;
  transition: background .12s ease;
}
.tp-act:hover:not(:disabled) { background: rgba(255,255,255,0.13); }
.tp-act:disabled { opacity: 0.35; cursor: default; }
.tp-act.primary { background: #dfe9ee; color: #06121a; border-color: transparent; }
.tp-step { display: inline-flex; align-items: center; gap: 12px; }
.tp-step button { width: 40px; height: 40px; border-radius: 10px; font: 700 18px Inter, sans-serif; }
`;

const RIGHT_W = 'min(34vw, 420px)';

export function TtrPlay({ view, act: rawAct, error }: {
  view: TtrView;
  act: (a: TtrAction) => void;
  error: string | null;
}) {
  const scene = useTtrScene();
  const act = (a: TtrAction) => { playSfx('click'); rawAct(a); };
  useEffect(() => { if (error) playSfx('error'); }, [error]);
  const me = view.you !== null ? view.players[view.you] : null;
  const [picked, setPicked] = useState<number[]>([]); // pending ticket indices
  const [trains, setTrains] = useState(20);
  const [arm, setArm] = useState<'idle' | 'draw' | 'claim' | 'harbor' | 'exchange' | 'mytickets' | 'hand' | 'tickets' | 'deck'>('idle');
  // reveal a card drawn blind from the ship/train deck
  const [reveal, setReveal] = useState<number | null>(null);
  const blindPending = useRef(false);
  const prevHandLen = useRef(0);
  useEffect(() => {
    const hand = view.you !== null ? view.players[view.you]?.hand : undefined;
    const len = hand?.length ?? 0;
    if (blindPending.current && hand && len > prevHandLen.current) {
      setReveal(hand[len - 1]);
      blindPending.current = false;
    }
    prevHandLen.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  useEffect(() => { if (reveal === null) return; const t = window.setTimeout(() => setReveal(null), 2400); return () => window.clearTimeout(t); }, [reveal]);
  const [confirmRoute, setConfirmRoute] = useState<string | null>(null);
  const [exTrains, setExTrains] = useState(0);
  const [exShips, setExShips] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);

  const myTurn = me !== null && view.turnColor === me.color && view.phase === 'playing';
  const claimable = useMemo(() => {
    if (!me || !myTurn) return [];
    // reconstruct enough state for the shared helpers
    const s = stateShim(view);
    return claimableRoutes(s, s.players[me.seat]);
  }, [view, me, myTurn]);

  if (!scene || !me) return <div className="page center"><h2>Loading the world</h2></div>;

  const mine = me;
  const shim = stateShim(view);
  const meShim = shim.players[mine.seat];

  // ---------- setup phase ----------
  if (view.phase === 'setup') {
    if (mine.ready) {
      return (
        <div className="page center" style={{ flexDirection: 'column', gap: 8 }}>
          <h2>Fleet locked in</h2>
          <p className="dim">Waiting for the other captains.</p>
        </div>
      );
    }
    const ships = RULES.pieceTotal - trains;
    const canReady = picked.length >= RULES.setupKeepMin && trains >= RULES.pieceTotal - RULES.maxShips && trains <= RULES.maxTrains;
    return (
      <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
        <style>{CSS}</style>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '26px 18px 100px' }}>
          <div className="ig-lab">Rails and Sails — setup</div>
          <h1 style={{ margin: '2px 0 4px' }}>Choose your tickets</h1>
          <p className="dim">Keep at least {RULES.setupKeepMin} of {mine.pendingTickets?.length ?? 0}. Unkept tickets go under the deck.</p>
          <div className="tp-tickets" style={{ justifyContent: 'flex-start', margin: '14px 0 26px' }}>
            {(mine.pendingTickets ?? []).map((t, i) => (
              <div key={i} className={`tp-ticket ${picked.includes(i) ? 'sel' : ''}`}
                onClick={() => setPicked((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i])}>
                {ticketFace(scene, t.idx) && <img src={ticketFace(scene, t.idx)!} alt="" />}
                <div style={{ padding: '6px 10px', font: '600 12px Inter, sans-serif' }}>
                  {t.cities.join(' — ')} <span style={{ opacity: 0.6 }}>· {t.points}{t.tour ? ' tour' : ''}</span>
                </div>
              </div>
            ))}
          </div>

          <h2 style={{ margin: '0 0 4px' }}>Split your fleet</h2>
          <p className="dim">60 pieces total — up to {RULES.maxTrains} trains and {RULES.maxShips} ships. New captains do well with 20 trains, 40 ships.</p>
          <div className="tp-step" style={{ margin: '12px 0 26px' }}>
            <button onClick={() => setTrains((t) => Math.max(RULES.pieceTotal - RULES.maxShips, t - 1))}>−</button>
            <div style={{ textAlign: 'center', minWidth: 160 }}>
              <div style={{ font: '800 22px Inter, sans-serif' }}>{trains} trains · {ships} ships</div>
            </div>
            <button onClick={() => setTrains((t) => Math.min(RULES.maxTrains, t + 1))}>+</button>
          </div>

          <button className="tp-act primary" style={{ maxWidth: 380 }} disabled={!canReady}
            onClick={() => act({ type: 'setup_ready', tickets: picked, trains, ships })}>
            Set sail — {picked.length} tickets kept
          </button>
          {error && <div className="toast">{error}</div>}
        </div>
      </div>
    );
  }

  // ---------- keep-tickets interrupt ----------
  const pending = mine.pendingTickets ?? [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <style>{CSS}</style>

      {/* map */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: RIGHT_W }}>
        <TtrTable
          scene={scene}
          routeOwners={view.routeOwners}
          harborOwners={view.harborOwners}
          harborSnapOf={HARBOR_SNAP}
          markers={view.players.map((p) => ({ color: p.color, score: p.score }))}
          pickRoutes={arm === 'claim' ? claimable : undefined}
          onPickRoute={(id) => setConfirmRoute(id)}
        />
      </div>

      {/* right rail */}
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: RIGHT_W, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div className="ig-glass" style={{ padding: '12px 14px', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: SEAT_HEX[mine.color] }} />
            <b>{mine.name}</b>
            <span style={{ marginLeft: 'auto', font: '800 16px Inter, sans-serif' }}>{mine.score}</span>
          </div>
          <div className="ig-hold">
            <div><div className="ig-lab">Trains</div><div className="ig-stat-v ig-num">{mine.trains}</div></div>
            <div><div className="ig-lab">Ships</div><div className="ig-stat-v ig-num">{mine.ships}</div></div>
            <div><div className="ig-lab">Harbors</div><div className="ig-stat-v ig-num">{mine.harbors}</div></div>
            <div><div className="ig-lab">Tickets</div><div className="ig-stat-v ig-num">{mine.ticketCount}</div></div>
          </div>
        </div>

        <div className="ig-glass" style={{ padding: '10px 12px', borderRadius: 14, textAlign: 'center', font: '700 13px Inter, sans-serif', letterSpacing: 1, textTransform: 'uppercase' }}>
          {view.winner ? `${view.winner} wins` : myTurn ? (view.turnDraws > 0 ? 'Draw one more or end turn' : 'Your turn') : `${view.turnColor} is sailing`}
          {view.finalTurns !== null && !view.winner && <div className="ig-lab" style={{ paddingTop: 3 }}>Final turns</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="tp-act" disabled={!myTurn || view.turnDraws >= 2} onClick={() => setArm(arm === 'draw' ? 'idle' : 'draw')}>Draw cards</button>
          <button className="tp-act" disabled={!myTurn || view.turnDraws > 0 || claimable.length === 0}
            onClick={() => { if (claimable.length === 0) setNotice('No route you can afford right now'); setArm(arm === 'claim' ? 'idle' : 'claim'); }}>
            Claim a route{claimable.length ? ` (${claimable.length})` : ''}
          </button>
          <button className="tp-act" disabled={!myTurn || view.turnDraws > 0 || view.ticketDeckCount === 0}
            onClick={() => setArm('tickets')}>Draw tickets</button>
          <button className="tp-act" disabled={!myTurn || view.turnDraws > 0 || harborCities(shim, meShim).length === 0 || !harborCardsFor(meShim)}
            onClick={() => setArm(arm === 'harbor' ? 'idle' : 'harbor')}>Build a harbor</button>
          <button className="tp-act" disabled={!myTurn || view.turnDraws > 0 || (mine.boxTrains + mine.boxShips === 0)}
            onClick={() => { setExTrains(0); setExShips(0); setArm('exchange'); }}>Exchange pieces</button>
          <button className="tp-act" onClick={() => setArm('mytickets')}>My tickets</button>
          <button className="tp-act" onClick={() => setArm('deck')}>Show deck</button>
        </div>

        {/* End turn — shown whenever it's your turn so it's always clear how to
            conclude; enabled once ending is a legal move (drew a card, or stuck) */}
        {myTurn && !view.winner && (
          <button
            className="tp-act primary"
            style={{ marginTop: 'auto' }}
            disabled={view.turnDraws === 0 && claimable.length + harborCities(shim, meShim).length > 0}
            onClick={() => { act({ type: 'end_turn' }); setArm('idle'); }}
          >
            End turn
          </button>
        )}

        {arm === 'harbor' && (
          <div className="ig-glass" style={{ padding: 12, borderRadius: 14 }}>
            <div className="ig-lab" style={{ paddingBottom: 8 }}>Build where</div>
            {harborCities(shim, meShim).map((city) => (
              <button key={city} className="tp-act" style={{ marginBottom: 6 }}
                onClick={() => { const cards = harborCardsFor(meShim); if (cards) act({ type: 'build_harbor', city, cards }); setArm('idle'); }}>
                {city}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* market overlay */}
      {arm === 'draw' && (
        <div className="tp-overlay" onClick={() => setArm('idle')}>
          <div className="ig-lab">Take up to two cards — a faceup wild counts as both</div>
          <div className="tp-market" onClick={(e) => e.stopPropagation()}>
            <button className="tp-mcard" disabled={view.shipDeckCount === 0} style={{ background: '#12202b', color: '#e8ebf0', font: '700 15px Inter, sans-serif' }}
              onClick={() => { blindPending.current = true; act({ type: 'draw_card', source: 'ship' }); }}>
              SHIPS<br />{view.shipDeckCount}
            </button>
            {view.market.map((c, i) => (
              <button key={i} className="tp-mcard" disabled={c === null || (view.turnDraws > 0 && c !== null && !!CATALOG[c]?.wild)}
                onClick={() => act({ type: 'draw_card', source: i })}>
                {c !== null && cardFace(scene, c) && <img src={cardFace(scene, c)!} alt="" />}
              </button>
            ))}
            <button className="tp-mcard" disabled={view.trainDeckCount === 0} style={{ background: '#1d1712', color: '#e8ebf0', font: '700 15px Inter, sans-serif' }}
              onClick={() => { blindPending.current = true; act({ type: 'draw_card', source: 'train' }); }}>
              TRAINS<br />{view.trainDeckCount}
            </button>
          </div>
          <div className="ig-lab">{view.turnDraws === 1 ? 'One taken — take another or end your turn' : view.turnDraws === 0 ? 'Your first card starts the turn' : ''}</div>
          {view.turnDraws > 0
            ? <button className="tp-act primary" style={{ maxWidth: 220 }} onClick={() => { act({ type: 'end_turn' }); setArm('idle'); }}>End turn</button>
            : <button className="tp-act" style={{ maxWidth: 200 }} onClick={() => setArm('idle')}>Close</button>}
        </div>
      )}

      {/* draw-tickets confirm (so you can cancel getting more routes) */}
      {arm === 'tickets' && (
        <div className="tp-overlay" onClick={() => setArm('idle')}>
          <div className="ig-glass" style={{ padding: '22px 30px', borderRadius: 18, textAlign: 'center', maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">Draw destination tickets</div>
            <div style={{ opacity: 0.8, margin: '8px 0 16px' }}>You'll draw new tickets and must keep at least one. This uses your turn.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="tp-act primary" style={{ width: 'auto', padding: '12px 26px' }}
                onClick={() => { act({ type: 'draw_tickets' }); setArm('idle'); }}>Draw</button>
              <button className="tp-act" style={{ width: 'auto', padding: '12px 26px' }} onClick={() => setArm('idle')}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* reveal a card drawn blind from a deck */}
      {reveal !== null && cardFace(scene, reveal) && (
        <div className="tp-overlay" style={{ zIndex: 60 }} onClick={() => setReveal(null)}>
          <div className="ig-lab">You drew</div>
          <img src={cardFace(scene, reveal)!} alt="" style={{ width: 150, height: 210, borderRadius: 12, border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 14px 44px rgba(0,0,0,0.75)' }} />
          <button className="tp-act" style={{ maxWidth: 160 }} onClick={() => setReveal(null)}>OK</button>
        </div>
      )}

      {/* claim confirm */}
      {confirmRoute && (() => {
        const r = ROUTE_BY_ID[confirmRoute];
        const cards = bestCardsFor(shim, meShim, confirmRoute);
        return (
          <div className="tp-overlay" onClick={() => setConfirmRoute(null)}>
            <div className="ig-glass" style={{ padding: '22px 30px', borderRadius: 18, textAlign: 'center', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="ig-lab">Claim this route</div>
              <div style={{ font: '800 22px Inter, sans-serif', margin: '4px 0' }}>{r.a} — {r.b}</div>
              <div style={{ opacity: 0.75, marginBottom: 12 }}>
                {r.length} {r.kind === 'rail' ? 'train' : 'ship'} spaces · {r.color ?? 'any color'}{r.pair ? ' · pairs' : ''}
              </div>
              {cards && (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                  {cards.map((ci) => {
                    const face = mine.hand ? cardFace(scene, mine.hand[ci]) : null;
                    return face ? <img key={ci} src={face} alt="" style={{ width: 44, height: 62, borderRadius: 5, border: '1px solid rgba(255,255,255,0.2)' }} /> : null;
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="tp-act primary" style={{ width: 'auto', padding: '12px 26px' }}
                  onClick={() => { if (cards) act({ type: 'claim', route: confirmRoute, cards }); setConfirmRoute(null); setArm('idle'); }}>
                  Claim
                </button>
                <button className="tp-act" style={{ width: 'auto', padding: '12px 26px' }} onClick={() => setConfirmRoute(null)}>Back</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* keep-tickets overlay */}
      {pending.length > 0 && (
        <div className="tp-overlay">
          <div className="ig-lab">Keep at least one ticket</div>
          <div className="tp-tickets">
            {pending.map((t, i) => (
              <div key={i} className={`tp-ticket ${picked.includes(i) ? 'sel' : ''}`}
                onClick={() => setPicked((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i])}>
                {ticketFace(scene, t.idx) && <img src={ticketFace(scene, t.idx)!} alt="" />}
                <div style={{ padding: '6px 10px', font: '600 12px Inter, sans-serif' }}>
                  {t.cities.join(' — ')} <span style={{ opacity: 0.6 }}>· {t.points}{t.tour ? ' tour' : ''}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="tp-act primary" style={{ maxWidth: 280 }} disabled={picked.length < 1}
            onClick={() => { act({ type: 'keep_tickets', keep: picked }); setPicked([]); }}>
            Keep {picked.length}
          </button>
        </div>
      )}

      {/* my tickets overlay */}
      {arm === 'mytickets' && (
        <div className="tp-overlay" onClick={() => setArm('idle')}>
          <div className="ig-lab">Your tickets</div>
          <div className="tp-tickets">
            {(mine.tickets ?? []).map((t, i) => (
              <div key={i} className="tp-ticket" style={{ cursor: 'default' }}>
                {ticketFace(scene, t.idx) && <img src={ticketFace(scene, t.idx)!} alt="" />}
                <div style={{ padding: '6px 10px', font: '600 12px Inter, sans-serif' }}>
                  {t.cities.join(' — ')} <span style={{ opacity: 0.6 }}>· {t.points}{t.tour ? ' tour' : ''}</span>
                </div>
              </div>
            ))}
            {(mine.tickets ?? []).length === 0 && <p className="dim">No tickets.</p>}
          </div>
          <button className="tp-act" style={{ maxWidth: 200 }} onClick={() => setArm('idle')}>Close</button>
        </div>
      )}

      {/* exchange overlay */}
      {arm === 'exchange' && (
        <div className="tp-overlay" onClick={() => setArm('idle')}>
          <div className="ig-glass" style={{ padding: '22px 30px', borderRadius: 18, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">Exchange pieces — 1 point each</div>
            <div style={{ display: 'flex', gap: 26, margin: '14px 0' }}>
              <div>
                <div className="ig-lab">Take trains ({mine.boxTrains} boxed)</div>
                <div className="tp-step" style={{ marginTop: 6 }}>
                  <button onClick={() => setExTrains((v) => Math.max(0, v - 1))}>−</button>
                  <b style={{ minWidth: 24 }}>{exTrains}</b>
                  <button onClick={() => setExTrains((v) => Math.min(mine.boxTrains, v + 1))}>+</button>
                </div>
              </div>
              <div>
                <div className="ig-lab">Take ships ({mine.boxShips} boxed)</div>
                <div className="tp-step" style={{ marginTop: 6 }}>
                  <button onClick={() => setExShips((v) => Math.max(0, v - 1))}>−</button>
                  <b style={{ minWidth: 24 }}>{exShips}</b>
                  <button onClick={() => setExShips((v) => Math.min(mine.boxShips, v + 1))}>+</button>
                </div>
              </div>
            </div>
            <button className="tp-act primary" disabled={exTrains + exShips === 0}
              onClick={() => { act({ type: 'exchange', trains: exTrains, ships: exShips }); setArm('idle'); }}>
              Exchange — costs {exTrains + exShips} point{exTrains + exShips === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {/* hand fan */}
      <div className="tp-hand" style={{ left: `calc((100vw - ${RIGHT_W}) / 2)` }}>
        {(mine.hand ?? []).map((c, i) => {
          const n = mine.hand!.length;
          const off = i - (n - 1) / 2;
          const tx = off * Math.min(56, 500 / Math.max(1, n));
          const ty = Math.abs(off) * Math.abs(off) * 3.4;
          const rot = off * 5.5;
          const face = cardFace(scene, c);
          return (
            <div key={i} className="tp-card" style={{
              backgroundImage: face ? `url(${face})` : undefined,
              transform: `translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg)`,
              ['--tx' as string]: `${tx}px`, ['--ty' as string]: `${ty}px`,
              zIndex: 10 + i,
            }} />
          );
        })}
      </div>

      {/* view-whole-hand button, just right of the fan */}
      <button
        onClick={() => setArm('hand')}
        style={{
          position: 'absolute', bottom: 18, left: `calc((100vw - ${RIGHT_W}) / 2 + min(46vw, 300px))`,
          zIndex: 35, borderRadius: 12, padding: '10px 14px', font: '700 11px Inter, sans-serif',
          letterSpacing: 1, textTransform: 'uppercase',
        }}
        className="ig-glass"
      >
        View hand<br /><span style={{ opacity: 0.6, fontWeight: 400 }}>{(mine.hand ?? []).length} cards</span>
      </button>

      {/* whole hand in the foreground, grouped by color + type with counts */}
      {arm === 'hand' && (
        <div className="tp-overlay" onClick={() => setArm('idle')}>
          <div className="ig-lab">Your hand — {(mine.hand ?? []).length} cards</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            {handGroups(mine.hand ?? []).map((grp) => (
              <div key={grp.key} style={{ position: 'relative', width: 128, height: 182 }}>
                {grp.cards.map((c, j) => (
                  <div key={j} style={{
                    position: 'absolute', top: 0, left: j * 15, width: 128, height: 182,
                    borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
                    backgroundImage: cardFace(scene, c) ? `url(${cardFace(scene, c)})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                  }} />
                ))}
                <span style={{
                  position: 'absolute', bottom: -10, left: grp.cards.length * 15 + 40, transform: 'translateX(-50%)',
                  background: '#0c1116', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999,
                  padding: '3px 10px', font: '800 13px Inter, sans-serif', zIndex: 30,
                }}>×{grp.cards.length}</span>
              </div>
            ))}
            {(mine.hand ?? []).length === 0 && <p className="dim">Empty hand.</p>}
          </div>
          <button className="tp-act" style={{ maxWidth: 200, marginTop: 18 }} onClick={() => setArm('idle')}>Close</button>
        </div>
      )}

      {/* start-of-game goal + rulebook link (dismissible; ? reopens it) */}
      {showIntro && <GameIntro intro={TTR_INTRO} onClose={() => setShowIntro(false)} />}
      <button
        onClick={() => setShowIntro(true)}
        title="How to play"
        className="ig-glass"
        style={{ position: 'absolute', top: 12, left: 12, zIndex: 45, width: 40, height: 40, borderRadius: '50%', font: '700 18px Inter, sans-serif', padding: 0 }}
      >?</button>

      {(error || notice) && (
        <div className="toast" onAnimationEnd={() => setNotice(null)}>{error || notice}</div>
      )}
    </div>
  );
}

/** Group a hand into stacks by (type, color/wild) for the whole-hand view. */
function handGroups(hand: number[]): { key: string; cards: number[] }[] {
  const map = new Map<string, number[]>();
  for (const c of hand) {
    const t = CATALOG[c];
    const key = `${t.type}:${t.wild ? 'wild' : t.color}:${t.double ? 'd' : 's'}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(c);
  }
  return [...map.entries()].map(([key, cards]) => ({ key, cards }));
}

// The shared legality helpers take a TtrState; the view carries everything
// they read (routeOwners, players' public counts + own hand). Build a shim.
function stateShim(view: TtrView) {
  return {
    routeOwners: view.routeOwners,
    harborOwners: view.harborOwners,
    players: view.players.map((p) => ({
      ...p,
      hand: p.hand ?? [],
      tickets: p.tickets ?? [],
      pendingTickets: p.pendingTickets ?? [],
      boxTrains: p.boxTrains,
      boxShips: p.boxShips,
    })),
  } as unknown as import('@bge/shared').TtrState;
}
