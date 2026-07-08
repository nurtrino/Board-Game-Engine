// Personal device for Trekking the National Parks. The map fills the screen,
// actions on the right (draw from the trek river, move by playing number
// cards, claim the park you stand on, occupy a major), your hand fanned below.
// Moving: select cards, the exact-distance destinations glow, tap one.

import { useEffect, useMemo, useState } from 'react';
import {
  TREK_CATALOG, PARKS, MAJORS, NODES, NEIGHBORS, TREK_RULES, STONE_COLORS,
  findPath, nodeName,
  type TrekView, type TrekAction, type TrekSuit, type StoneColor, type TrekState, type TrekPlayer,
} from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { TrekTable, useTrekScene } from './TrekScene';
import { trekFaceByCell } from './TrekBoard';
import { GameIntro, TREK_INTRO } from '../ttr/GameIntro';
import { playSfx } from '../sfx';

const CSS = `
.tk-hand { position: absolute; left: 50%; bottom: -26px; height: 150px; pointer-events: none; z-index: 30; }
.tk-card {
  position: absolute; bottom: 0; left: 0; width: 112px; height: 78px; margin-left: -56px;
  border-radius: 7px; transform-origin: 50% 140%; pointer-events: auto; cursor: pointer;
  box-shadow: 0 3px 10px rgba(0,0,0,0.6); border: 2px solid rgba(255,255,255,0.14);
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.tk-card:hover { transform: translateX(var(--tx)) translateY(calc(var(--ty) - 36px)) rotate(0deg) scale(1.2) !important; z-index: 40 !important; }
.tk-card.sel { border-color: #6fd3e8; transform: translateX(var(--tx)) translateY(calc(var(--ty) - 26px)) rotate(var(--rot)) !important; }
.tp-overlay { position: absolute; inset: 0; background: rgba(3,6,9,0.82); z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
.tp-act {
  display: block; width: 100%; text-align: center; padding: 12px 14px; border-radius: 11px;
  border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06);
  color: #e8ebf0; font: 700 13px Inter, sans-serif; letter-spacing: 1.2px; text-transform: uppercase;
  transition: background .12s ease;
}
.tp-act:hover:not(:disabled) { background: rgba(255,255,255,0.13); }
.tp-act:disabled { opacity: 0.35; cursor: default; }
.tp-act.primary { background: #dfe9ee; color: #06121a; border-color: transparent; }
`;

const RIGHT_W = 'min(34vw, 420px)';

/** Hand indices + Acadia wild pairs paying a cost, or null. Greedy: suits first, wilds from low-value spares. */
export function paymentFor(hand: number[], cost: TrekSuit[], acadia: boolean): { cards: number[]; wildPairs: number[][] } | null {
  const used = new Set<number>();
  let missing = 0;
  for (const suit of cost) {
    const i = hand.findIndex((c, idx) => !used.has(idx) && TREK_CATALOG[c].suit === suit);
    if (i >= 0) used.add(i); else missing++;
  }
  if (!missing) return { cards: [...used], wildPairs: [] };
  if (!acadia) return null;
  const spare = hand.map((_, i) => i).filter((i) => !used.has(i))
    .sort((a, b) => TREK_CATALOG[hand[a]].value - TREK_CATALOG[hand[b]].value);
  if (spare.length < missing * 2) return null;
  const wildPairs = Array.from({ length: missing }, (_, k) => [spare[2 * k], spare[2 * k + 1]]);
  return { cards: [...used, ...wildPairs.flat()], wildPairs };
}

// findPath reads only players' seats/nodes and the mover's node/seat
function shimState(view: TrekView): TrekState {
  return { players: view.players.map((p) => ({ seat: p.seat, node: p.node })) } as never;
}

export function TrekPlay({ view, act: rawAct, error }: {
  view: TrekView;
  act: (a: TrekAction) => void;
  error: string | null;
}) {
  const scene = useTrekScene();
  const act = (a: TrekAction) => { playSfx('click'); rawAct(a); };
  useEffect(() => { if (error) playSfx('error'); }, [error]);
  const me = view.you !== null ? view.players[view.you] : null;
  const [sel, setSel] = useState<number[]>([]); // selected hand indices (move / discard)
  const [arm, setArm] = useState<'idle' | 'move' | 'discard' | 'parks'>('idle');
  const [confirmClaim, setConfirmClaim] = useState<number | null>(null); // park river slot
  const [confirmOccupy, setConfirmOccupy] = useState<number | null>(null); // major id
  const [hop, setHop] = useState<number | null>(null);
  const [swapGive, setSwapGive] = useState<StoneColor | null>(null);
  const [swapTake, setSwapTake] = useState<{ from: number; color: StoneColor } | null>(null);
  const [showIntro, setShowIntro] = useState(true);

  const myTurn = me !== null && view.turn === me.seat && view.phase === 'playing';
  const hand = me?.hand ?? [];
  const overLimit = hand.length - TREK_RULES.handLimit;

  const hasAbility = (a: string) => me !== null && me.majors.some((m) => MAJORS[m].ability === a);
  const acadia = hasAbility('wildPairs');
  const grandCanyon = hasAbility('plusOneMove');

  // exact-distance destinations for the selected cards
  const moveSum = sel.reduce((t, i) => t + (hand[i] !== undefined ? TREK_CATALOG[hand[i]].value : 0), 0);
  const moveTargets = useMemo(() => {
    if (!me || arm !== 'move' || !sel.length || moveSum === 0 || moveSum > 10) return [];
    const s = shimState(view);
    const p = s.players[me.seat] as TrekPlayer;
    const out: number[] = [];
    for (const id of Object.keys(NODES).map(Number)) {
      if (id === me.node) continue;
      if (findPath(s, p, id, moveSum) || (grandCanyon && findPath(s, p, id, moveSum + 1))) out.push(id);
    }
    return out;
  }, [view, me, arm, sel, moveSum, grandCanyon]);

  if (!scene || !me) return <div className="page center"><h2>Loading the trails</h2></div>;
  const mine = me;

  // claim / occupy availability at my location
  const claimSlot = view.parkRiver.findIndex((id) => id !== null && PARKS[id].node === mine.node);
  const claimPark = claimSlot >= 0 ? PARKS[view.parkRiver[claimSlot]!] : null;
  const claimPay = claimPark ? paymentFor(hand, claimPark.cost, acadia) : null;
  const occupyId = view.majors.find((id) => MAJORS[id].node === mine.node && !mine.majors.includes(id)) ?? null;
  const occupyMajor = occupyId !== null ? MAJORS[occupyId] : null;
  const occupyPay = occupyMajor && mine.campsites > 0 ? paymentFor(hand, occupyMajor.cost, acadia) : null;

  const doMove = (dest: number) => {
    const s = shimState(view);
    const p = s.players[mine.seat] as TrekPlayer;
    const path = findPath(s, p, dest, moveSum) ?? (grandCanyon ? findPath(s, p, dest, moveSum + 1) : null);
    if (path) act({ type: 'move', path, cards: sel });
    setSel([]); setArm('idle');
  };

  const toggleSel = (i: number) => setSel((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i]);

  const myStoneTotal = (Object.values(mine.stones) as number[]).reduce((a, b) => a + b, 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <style>{CSS}</style>

      {/* map */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: RIGHT_W }}>
        <TrekTable
          scene={scene}
          stones={view.stones}
          trekkers={view.players.map((p) => ({ color: p.color, node: p.node }))}
          majorTents={view.majors.map((id) => ({ node: MAJORS[id].node, colors: view.majorOwners[id] ?? [] }))}
          pickNodes={arm === 'move' ? moveTargets : undefined}
          onPickNode={doMove}
        />
      </div>

      {/* right rail */}
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: RIGHT_W, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div className="ig-glass" style={{ padding: '12px 14px', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: SEAT_HEX[mine.color] }} />
            <b>{mine.name}</b>
            <span style={{ marginLeft: 'auto', font: '600 12px Inter, sans-serif', opacity: 0.8 }}>{nodeName(mine.node)}</span>
          </div>
          <div className="ig-hold">
            <div><div className="ig-lab">Parks</div><div className="ig-stat-v ig-num">{mine.parks.length}</div></div>
            <div><div className="ig-lab">Stones</div><div className="ig-stat-v ig-num">{myStoneTotal}</div></div>
            <div><div className="ig-lab">Campsites</div><div className="ig-stat-v ig-num">{mine.campsites}</div></div>
            <div><div className="ig-lab">Cards</div><div className="ig-stat-v ig-num">{hand.length}</div></div>
          </div>
        </div>

        {/* your stones — a little pile, enumerated per colour */}
        <div className="ig-glass" style={{ padding: '10px 12px', borderRadius: 14 }}>
          <div className="ig-lab" style={{ paddingBottom: 8 }}>Your stones</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {STONE_COLORS.map((color) => {
              const n = mine.stones[color] ?? 0;
              if (n === 0) return null;
              const rgb = scene.tints.stones[color] ?? [0.6, 0.6, 0.6];
              const hex = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
              return (
                <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ position: 'relative', width: 30, height: 24 }}>
                    {Array.from({ length: Math.min(n, 6) }).map((_, k) => (
                      <span key={k} style={{
                        position: 'absolute', width: 15, height: 15, borderRadius: '50%',
                        left: (k % 3) * 7, top: Math.floor(k / 3) * 8,
                        background: `radial-gradient(circle at 34% 30%, rgba(255,255,255,0.7), ${hex} 62%, rgba(0,0,0,0.4))`,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.6)', border: '1px solid rgba(0,0,0,0.35)',
                      }} />
                    ))}
                  </div>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>×{n}</b>
                </div>
              );
            })}
            {myStoneTotal === 0 && <span className="dim">none yet</span>}
          </div>
        </div>

        <div className="ig-glass" style={{ padding: '10px 12px', borderRadius: 14, textAlign: 'center', font: '700 13px Inter, sans-serif', letterSpacing: 1, textTransform: 'uppercase' }}>
          {view.winners ? (view.winners.length > 1 ? 'Shared victory' : `${view.players.find((p) => p.color === view.winners![0])?.name} wins`)
            : myTurn ? `Your turn — ${view.actionsLeft} action${view.actionsLeft === 1 ? '' : 's'} left`
              : `${view.players[view.turn]?.name} is trekking`}
          {view.finalRound && !view.winners && <div className="ig-lab" style={{ paddingTop: 3 }}>Final round</div>}
        </div>

        {/* the shared trek river: tap to take */}
        <div className="ig-glass" style={{ padding: 10, borderRadius: 14 }}>
          <div className="ig-lab" style={{ paddingBottom: 6 }}>Trek river — tap to draw</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {view.trekRiver.map((c, i) => (
              <button key={i} disabled={!myTurn || view.actionsLeft <= 0 || c === null}
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', opacity: myTurn && view.actionsLeft > 0 ? 1 : 0.55 }}
                onClick={() => act({ type: 'draw', source: i })}>
                {c !== null ? trekFaceByCell(scene, 'trek', TREK_CATALOG[c].cell, 46, 64) : <div style={{ width: 46, height: 64 }} />}
              </button>
            ))}
            <button className="tp-act" style={{ width: 46, height: 64, padding: 0, fontSize: 10 }}
              disabled={!myTurn || view.actionsLeft <= 0 || (view.trekDeckCount + view.trekDiscardCount) === 0}
              onClick={() => act({ type: 'draw', source: 'deck' })}>
              Deck {view.trekDeckCount}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="tp-act" disabled={!myTurn || view.actionsLeft <= 0 || hand.length === 0}
            onClick={() => { setSel([]); setArm(arm === 'move' ? 'idle' : 'move'); }}>
            {arm === 'move' ? 'Cancel move' : 'Move'}
          </button>
          <button className="tp-act" disabled={!myTurn || view.actionsLeft <= 0 || !claimPay}
            onClick={() => { setHop(null); setConfirmClaim(claimSlot); }}>
            {claimPark ? `Claim ${claimPark.name}` : 'Claim a park'}
          </button>
          <button className="tp-act" disabled={!myTurn || view.actionsLeft <= 0 || !occupyPay}
            onClick={() => { setSwapGive(null); setSwapTake(null); setConfirmOccupy(occupyId); }}>
            {occupyMajor ? `Occupy ${occupyMajor.name}` : 'Occupy a major park'}
          </button>
          <button className="tp-act" onClick={() => setArm('parks')}>My parks</button>
        </div>

        {arm === 'move' && (
          <div className="ig-glass" style={{ padding: 12, borderRadius: 14 }}>
            <div className="ig-lab">Select number cards below</div>
            <div style={{ font: '800 20px Inter, sans-serif', padding: '4px 0' }}>
              {moveSum} trail{moveSum === 1 ? '' : 's'}{grandCanyon && moveSum > 0 ? ` (or ${moveSum + 1})` : ''}
            </div>
            <div style={{ opacity: 0.7, fontSize: 12.5 }}>
              {moveSum === 0 ? 'Tap cards in your hand to add them up.'
                : moveTargets.length ? 'Tap a glowing park on the map.' : 'No destination at that exact distance.'}
            </div>
          </div>
        )}

        {/* hand-limit discard */}
        {myTurn && view.actionsLeft <= 0 && overLimit > 0 && (
          <div className="ig-glass" style={{ padding: 12, borderRadius: 14 }}>
            <div className="ig-lab" style={{ paddingBottom: 6 }}>Over the hand limit</div>
            <div style={{ fontSize: 13, opacity: 0.8, paddingBottom: 8 }}>Select {overLimit} card{overLimit === 1 ? '' : 's'} to discard.</div>
            <button className="tp-act primary" disabled={sel.length !== overLimit}
              onClick={() => { act({ type: 'discard', cards: sel }); setSel([]); setArm('idle'); }}>
              Discard {sel.length}/{overLimit}
            </button>
          </div>
        )}

        {myTurn && !view.winners && (
          <button
            className={`tp-act${view.actionsLeft === 0 ? ' primary' : ''}`}
            style={{ marginTop: 'auto' }}
            disabled={overLimit > 0}
            onClick={() => { act({ type: 'end_turn' }); setSel([]); setArm('idle'); }}
          >
            End turn{view.actionsLeft > 0 ? ` (skip ${view.actionsLeft})` : ''}
          </button>
        )}
      </div>

      {/* claim confirm (+ Hawai'i hop) */}
      {confirmClaim !== null && claimPark && claimPay && (
        <div className="tp-overlay" onClick={() => setConfirmClaim(null)}>
          <div className="ig-glass" style={{ padding: '22px 30px', borderRadius: 18, textAlign: 'center', maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">Claim this park — {claimPark.vp} points</div>
            <div style={{ font: '800 22px Inter, sans-serif', margin: '4px 0 10px' }}>{claimPark.name}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              {claimPay.cards.map((ci) => (
                <div key={ci}>{trekFaceByCell(scene, 'trek', TREK_CATALOG[hand[ci]].cell, 46, 66)}</div>
              ))}
            </div>
            {claimPay.wildPairs.length > 0 && (
              <div className="ig-lab" style={{ paddingBottom: 8 }}>{claimPay.wildPairs.length} Acadia wild pair{claimPay.wildPairs.length === 1 ? '' : 's'} included</div>
            )}
            {hasAbility('freeHop') && (
              <div style={{ marginBottom: 12 }}>
                <div className="ig-lab" style={{ paddingBottom: 6 }}>Hawai'i Volcanoes — free hop after claiming</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="tp-act" style={{ width: 'auto', padding: '8px 12px', background: hop === null ? 'rgba(255,255,255,0.2)' : undefined }}
                    onClick={() => setHop(null)}>Stay</button>
                  {NEIGHBORS[mine.node].map((nb) => (
                    <button key={nb} className="tp-act" style={{ width: 'auto', padding: '8px 12px', background: hop === nb ? 'rgba(255,255,255,0.2)' : undefined }}
                      onClick={() => setHop(nb)}>{nodeName(nb)}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="tp-act primary" style={{ width: 'auto', padding: '12px 26px' }}
                onClick={() => { act({ type: 'claim', slot: confirmClaim, cards: claimPay.cards, wildPairs: claimPay.wildPairs, hop }); setConfirmClaim(null); setSel([]); setArm('idle'); }}>
                Claim
              </button>
              <button className="tp-act" style={{ width: 'auto', padding: '12px 26px' }} onClick={() => setConfirmClaim(null)}>Back</button>
            </div>
          </div>
        </div>
      )}

      {/* occupy confirm (+ Everglades swap) */}
      {confirmOccupy !== null && occupyMajor && occupyPay && (
        <div className="tp-overlay" onClick={() => setConfirmOccupy(null)}>
          <div className="ig-glass" style={{ padding: '22px 30px', borderRadius: 18, textAlign: 'center', maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">Occupy — 5 points + ability</div>
            <div style={{ font: '800 22px Inter, sans-serif', margin: '4px 0 10px' }}>{occupyMajor.name}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              {occupyPay.cards.map((ci) => (
                <div key={ci}>{trekFaceByCell(scene, 'trek', TREK_CATALOG[hand[ci]].cell, 46, 66)}</div>
              ))}
            </div>
            {occupyMajor.ability === 'stoneSwap' && myStoneTotal > 0 && (
              <div style={{ marginBottom: 12, textAlign: 'left' }}>
                <div className="ig-lab" style={{ paddingBottom: 6 }}>Swap a stone (optional): give one of yours, take one of theirs</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 6 }}>
                  {(Object.entries(mine.stones) as [StoneColor, number][]).filter(([, n]) => n > 0).map(([c]) => (
                    <button key={c} className="tp-act" style={{ width: 'auto', padding: '7px 11px', background: swapGive === c ? 'rgba(255,255,255,0.2)' : undefined }}
                      onClick={() => setSwapGive(swapGive === c ? null : c)}>Give {c}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {view.players.filter((q) => q.seat !== mine.seat).flatMap((q) =>
                    (Object.entries(q.stones) as [StoneColor, number][]).filter(([, n]) => n > 0).map(([c]) => (
                      <button key={`${q.seat}:${c}`} className="tp-act"
                        style={{ width: 'auto', padding: '7px 11px', background: swapTake?.from === q.seat && swapTake.color === c ? 'rgba(255,255,255,0.2)' : undefined }}
                        onClick={() => setSwapTake(swapTake?.from === q.seat && swapTake.color === c ? null : { from: q.seat, color: c })}>
                        Take {q.name}'s {c}
                      </button>
                    )))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="tp-act primary" style={{ width: 'auto', padding: '12px 26px' }}
                onClick={() => {
                  const swap = swapGive && swapTake ? { give: swapGive, from: swapTake.from, take: swapTake.color } : null;
                  act({ type: 'occupy', major: confirmOccupy, cards: occupyPay.cards, wildPairs: occupyPay.wildPairs, swap });
                  setConfirmOccupy(null); setSel([]); setArm('idle');
                }}>
                Occupy
              </button>
              <button className="tp-act" style={{ width: 'auto', padding: '12px 26px' }} onClick={() => setConfirmOccupy(null)}>Back</button>
            </div>
          </div>
        </div>
      )}

      {/* my parks overlay */}
      {arm === 'parks' && (
        <div className="tp-overlay" onClick={() => setArm('idle')}>
          <div className="ig-lab">Your parks and campsites</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            {mine.parks.map((id) => (
              <div key={id} style={{ textAlign: 'center' }}>
                {trekFaceByCell(scene, 'parks', PARKS[id].cell, 150, 105)}
                <div className="ig-lab" style={{ paddingTop: 5 }}>{PARKS[id].name} · {PARKS[id].vp}</div>
              </div>
            ))}
            {mine.majors.map((id) => (
              <div key={`m${id}`} style={{ textAlign: 'center' }}>
                {trekFaceByCell(scene, 'majors', MAJORS[id].cell, 150, 105)}
                <div className="ig-lab" style={{ paddingTop: 5 }}>{MAJORS[id].name} · campsite</div>
              </div>
            ))}
            {mine.parks.length + mine.majors.length === 0 && <p className="dim">Nothing claimed yet.</p>}
          </div>
          <div className="ig-lab">
            Stones: {(Object.entries(mine.stones) as [StoneColor, number][]).filter(([, n]) => n > 0).map(([c, n]) => `${c} ×${n}`).join(' · ') || 'none'}
          </div>
          <button className="tp-act" style={{ maxWidth: 200 }} onClick={() => setArm('idle')}>Close</button>
        </div>
      )}

      {/* hand fan — selectable in move/discard contexts */}
      <div className="tk-hand" style={{ left: `calc((100vw - ${RIGHT_W}) / 2)` }}>
        {hand.map((c, i) => {
          const n = hand.length;
          const off = i - (n - 1) / 2;
          const tx = off * Math.min(64, 520 / Math.max(1, n));
          const ty = Math.abs(off) * Math.abs(off) * 3.0;
          const rot = off * 4.5;
          const t = TREK_CATALOG[c];
          const sheet = Object.values(scene.decks.trek.sheets)[0];
          const col = t.cell % sheet.cols, row = Math.floor(t.cell / sheet.cols);
          const selectable = arm === 'move' || (myTurn && view.actionsLeft <= 0 && overLimit > 0);
          return (
            <div key={i} className={`tk-card${sel.includes(i) ? ' sel' : ''}`}
              onClick={() => selectable && toggleSel(i)}
              style={{
                overflow: 'hidden',
                transform: `translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg)`,
                ['--tx' as string]: `${tx}px`, ['--ty' as string]: `${ty}px`, ['--rot' as string]: `${rot}deg`,
                zIndex: 10 + i,
              }}>
              <div style={{
                position: 'absolute', width: 74, height: 108, left: '50%', top: '50%',
                transform: 'translate(-50%,-50%) rotate(-90deg)',
                backgroundImage: `url(${sheet.face})`,
                backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
                backgroundPosition: `${(col / (sheet.cols - 1)) * 100}% ${(row / (sheet.rows - 1)) * 100}%`,
              }} />
            </div>
          );
        })}
      </div>

      {/* start-of-game goal + rulebook link */}
      {showIntro && <GameIntro intro={TREK_INTRO} onClose={() => setShowIntro(false)} />}
      <button
        onClick={() => setShowIntro(true)}
        title="How to play"
        className="ig-glass"
        style={{ position: 'absolute', top: 12, left: 12, zIndex: 45, width: 40, height: 40, borderRadius: '50%', font: '700 18px Inter, sans-serif', padding: 0 }}
      >?</button>

      {error && <div className="toast">{error}</div>}
    </div>
  );
}
