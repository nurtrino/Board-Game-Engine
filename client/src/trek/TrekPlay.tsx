// Personal device for Trekking the National Parks. The map fills the screen,
// actions on the right (draw from the trek river, move by playing number
// cards, claim the park you stand on, occupy a major), your hand fanned below.
// Moving: select cards, the exact-distance destinations glow, tap one.

import { useEffect, useMemo, useState } from 'react';
import {
  TREK_CATALOG, PARKS, MAJORS, NODES, NEIGHBORS, TREK_RULES, STONE_COLORS, SCORING,
  findPath, nodeName,
  type TrekView, type TrekAction, type TrekSuit, type StoneColor, type TrekState, type TrekPlayer,
  type MajorAbility,
} from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { TrekTable, useTrekScene } from './TrekScene';
import { trekFaceByCell } from './TrekBoard';
import { GameIntro, TREK_INTRO } from '../ttr/GameIntro';
import { playSfx } from '../sfx';

const CSS = `
.tk-hand { position: absolute; left: 50%; bottom: -30px; height: 190px; pointer-events: none; z-index: 30; }
.tk-card {
  position: absolute; bottom: 0; left: 0; width: 82px; height: 116px; margin-left: -41px;
  border-radius: 7px; transform-origin: 50% 150%; pointer-events: auto; cursor: pointer;
  box-shadow: 0 3px 10px rgba(0,0,0,0.6); border: 2px solid rgba(255,255,255,0.14);
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.tk-card:hover { transform: translateX(var(--tx)) translateY(calc(var(--ty) - 44px)) rotate(0deg) scale(1.2) !important; z-index: 40 !important; }
.tk-card.sel { border-color: #6fd3e8; transform: translateX(var(--tx)) translateY(calc(var(--ty) - 30px)) rotate(var(--rot)) !important; }
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
.tp-why { font: 400 11px Inter, sans-serif; opacity: 0.6; padding: 4px 4px 0; text-align: center; line-height: 1.4; }

@media (max-width: 720px) and (orientation: portrait) {
  .tp-responsive-shell { --tp-mobile-board-height: 43dvh; overflow: hidden; }
  .tp-board-pane {
    top: 0 !important; right: 0 !important; bottom: auto !important; left: 0 !important;
    width: 100% !important; height: var(--tp-mobile-board-height) !important; overflow: hidden;
  }
  .tp-control-sheet {
    top: var(--tp-mobile-board-height) !important; right: 0 !important; bottom: 0 !important; left: 0 !important;
    z-index: 25; width: 100% !important; min-height: 0; padding: 12px 12px calc(18px + env(safe-area-inset-bottom)) !important;
    overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
    border-top: 1px solid rgba(255,255,255,.16); background: rgba(5,8,11,.97); box-shadow: 0 -16px 36px rgba(0,0,0,.5);
  }
  .tp-act { min-height: 44px; }
  .tk-map-hand {
    left: 50% !important; bottom: calc(100dvh - var(--tp-mobile-board-height) + 2px) !important;
    transform: scale(.58); transform-origin: 50% 100%;
  }
  .tp-help-button { top: max(12px, env(safe-area-inset-top)) !important; width: 44px !important; height: 44px !important; }
}
`;

const RIGHT_W = 'min(34vw, 420px)';

// Plain-language gloss for each major park's power, so we never just say "+ ability".
const ABILITY_TEXT: Record<MajorAbility, string> = {
  plusOneMove: 'Every move may stretch your card total by +1 trail.',
  wildPairs: 'Any 2 trek cards together count as 1 wild card of any color.',
  stoneSwap: 'When you occupy, swap one of your stones for a rival\'s.',
  freeHop: 'After every claim, take a free 1-trail hop.',
  drawTwo: 'When you occupy, draw 2 trek cards.',
  drawOnClaim: 'After every claim, draw 1 trek card.',
};

// Running score you can see all game: park points + 5 per campsite + 1 per stone.
// (End-game stone-majority awards are not known until scoring, so they are not counted here.)
function runningScore(p: { parks: number[]; majors: number[]; stones: Record<StoneColor, number> }): number {
  const stones = STONE_COLORS.reduce((t, c) => t + (p.stones[c] ?? 0), 0);
  const parkPts = p.parks.reduce((t, id) => t + PARKS[id].vp, 0);
  return parkPts + p.majors.length * SCORING.campsiteVp + stones * SCORING.stoneVp;
}

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
  const [arm, setArm] = useState<'idle' | 'move' | 'discard' | 'parks' | 'deck'>('idle');
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

  // why a control is greyed out (shown only on your own turn, so it reads as guidance not clutter)
  const moveReason = !myTurn ? null
    : view.actionsLeft <= 0 ? 'No actions left this turn.'
      : hand.length === 0 ? 'You need number cards in hand to move.' : null;
  const claimReason = !myTurn ? null
    : view.actionsLeft <= 0 ? 'No actions left this turn.'
      : !claimPark ? 'Stand on a park to claim it.'
        : !claimPay ? 'You need matching cards to claim this park.' : null;
  const occupyReason = !myTurn ? null
    : view.actionsLeft <= 0 ? 'No actions left this turn.'
      : !occupyMajor ? 'Stand on a major park to occupy it.'
        : mine.campsites <= 0 && !paymentFor(hand, occupyMajor.cost, acadia) ? 'Needs a campsite and matching cards.'
          : mine.campsites <= 0 ? 'You have no campsites left to place.'
            : !occupyPay ? 'You need matching cards to occupy.' : null;

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
    <div className="tp-responsive-shell" style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <style>{CSS}</style>

      {/* map */}
      <div className="tp-board-pane" role="region" aria-label="Trekking trail map" style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: RIGHT_W }}>
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
      <div className="tp-control-sheet" role="region" aria-label="Trekking status and controls" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: RIGHT_W, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div className="ig-glass" style={{ padding: '12px 14px', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: SEAT_HEX[mine.color] }} />
            <b>{mine.name}</b>
            <span style={{ marginLeft: 'auto', font: '600 12px Inter, sans-serif', opacity: 0.8 }}>You're at: {nodeName(mine.node)}</span>
          </div>
          <div className="ig-hold">
            <div><div className="ig-lab">Score</div><div className="ig-stat-v ig-num">{runningScore(mine)}</div></div>
            <div><div className="ig-lab">Parks</div><div className="ig-stat-v ig-num">{mine.parks.length}</div></div>
            <div><div className="ig-lab">Stones</div><div className="ig-stat-v ig-num">{myStoneTotal}</div></div>
            <div><div className="ig-lab">Campsites</div><div className="ig-stat-v ig-num">{mine.campsites}</div></div>
            <div><div className="ig-lab">Cards</div><div className="ig-stat-v ig-num">{hand.length}</div></div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, paddingTop: 8, lineHeight: 1.55 }}>
            SCORE is your running total: park points + 5 per campsite + 1 per stone.
            CAMPSITES are the tents you place when you occupy a major park.
            STONES are collected from parks you pass through.
          </div>
        </div>

        {/* running standings — the winning number, visible the whole game */}
        <div className="ig-glass" style={{ padding: '10px 12px', borderRadius: 14 }}>
          <div className="ig-lab" style={{ paddingBottom: 6 }}>Score · everyone</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[...view.players].sort((a, b) => runningScore(b) - runningScore(a)).map((p) => (
              <div key={p.seat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
                <span style={{ flex: 1, opacity: p.seat === mine.seat ? 1 : 0.8, fontWeight: p.seat === mine.seat ? 700 : 400 }}>
                  {p.name}{p.seat === mine.seat ? ' (you)' : ''}
                </span>
                <b className="ig-num">{runningScore(p)}</b>
              </div>
            ))}
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
            : myTurn ? `Your turn · ${view.actionsLeft} action${view.actionsLeft === 1 ? '' : 's'} left`
              : `${view.players[view.turn]?.name}'s turn`}
          {!myTurn && !view.winners && (
            <div className="ig-lab" style={{ paddingTop: 3, textTransform: 'none', letterSpacing: 0 }}>
              Waiting for {view.players[view.turn]?.name}...
            </div>
          )}
          {view.finalRound && !view.winners && <div className="ig-lab" style={{ paddingTop: 3 }}>Final round</div>}
          {view.lastEvent && !view.winners && (
            <div className="ig-lab" style={{ paddingTop: 6, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>
              Last: {view.lastEvent.player} {view.lastEvent.title.toLowerCase()}
              {view.lastEvent.detail ? ` · ${view.lastEvent.detail}` : ''}
            </div>
          )}
        </div>

        {/* the shared trek river: tap to take */}
        <div className="ig-glass" style={{ padding: 10, borderRadius: 14 }}>
          <div className="ig-lab" style={{ paddingBottom: 6 }}>Face-up trek cards · tap to take</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {view.trekRiver.map((c, i) => (
              <button key={i} disabled={!myTurn || view.actionsLeft <= 0 || c === null}
                style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', opacity: myTurn && view.actionsLeft > 0 ? 1 : 0.55 }}
                onClick={() => act({ type: 'draw', source: i })}>
                {c !== null ? trekFaceByCell(scene, 'trek', TREK_CATALOG[c].cell, 46, 64) : <div style={{ width: 46, height: 64 }} />}
              </button>
            ))}
            <button className="tp-act" style={{ width: 46, height: 64, padding: 0, fontSize: 11 }}
              disabled={!myTurn || view.actionsLeft <= 0 || (view.trekDeckCount + view.trekDiscardCount) === 0}
              onClick={() => act({ type: 'draw', source: 'deck' })}>
              Deck {view.trekDeckCount}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <button className="tp-act" disabled={!myTurn || view.actionsLeft <= 0 || hand.length === 0}
              onClick={() => { setSel([]); setArm(arm === 'move' ? 'idle' : 'move'); }}>
              {arm === 'move' ? 'Cancel move' : 'Move'}
            </button>
            {arm !== 'move' && moveReason && <div className="tp-why">{moveReason}</div>}
          </div>
          <div>
            <button className="tp-act" disabled={!myTurn || view.actionsLeft <= 0 || !claimPay}
              onClick={() => { setHop(null); setConfirmClaim(claimSlot); }}>
              {claimPark ? `Claim ${claimPark.name}` : 'Claim a park'}
            </button>
            {claimReason && <div className="tp-why">{claimReason}</div>}
          </div>
          <div>
            <button className="tp-act" disabled={!myTurn || view.actionsLeft <= 0 || !occupyPay}
              onClick={() => { setSwapGive(null); setSwapTake(null); setConfirmOccupy(occupyId); }}>
              {occupyMajor ? `Occupy ${occupyMajor.name}` : 'Occupy a major park'}
            </button>
            {occupyReason && <div className="tp-why">{occupyReason}</div>}
          </div>
          <button className="tp-act" onClick={() => setArm('parks')}>My parks</button>
          <button className="tp-act" onClick={() => setArm('deck')}>Card reference</button>
        </div>

        {/* show deck — the card sheets as a reference */}
        {arm === 'deck' && (
          <div className="tp-overlay" style={{ overflowY: 'auto', padding: '30px 16px' }} onClick={() => setArm('idle')}>
            <div className="ig-lab">The decks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'center', alignItems: 'flex-start' }} onClick={(e) => e.stopPropagation()}>
              {(['trek', 'parks', 'majors'] as const).map((k) => {
                const sheet = Object.values(scene.decks[k].sheets)[0];
                const label = k === 'trek' ? 'Trek cards' : k === 'parks' ? 'Park cards' : 'Major parks';
                return sheet ? (
                  <div key={k} style={{ textAlign: 'center' }}>
                    <div className="ig-lab" style={{ paddingBottom: 6 }}>{label}</div>
                    <img src={sheet.face} alt={label} style={{ maxWidth: 400, maxHeight: '58vh', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)' }} />
                  </div>
                ) : null;
              })}
            </div>
            <button className="tp-act" style={{ maxWidth: 160 }} onClick={() => setArm('idle')}>Close</button>
          </div>
        )}

        {arm === 'move' && (
          <div className="ig-glass" style={{ padding: 12, borderRadius: 14 }}>
            <div className="ig-lab">Tap number cards below to add them up</div>
            <div style={{ font: '800 20px Inter, sans-serif', padding: '4px 0' }}>
              {moveSum} trail{moveSum === 1 ? '' : 's'}{grandCanyon && moveSum > 0 ? ` (or ${moveSum + 1})` : ''}
            </div>
            <div style={{ opacity: 0.7, fontSize: 12.5, lineHeight: 1.5 }}>
              Trails are the steps between spots on the map. Your cards must total the EXACT distance to a park.
              {grandCanyon && ' Grand Canyon lets you stretch the total by +1, so either number works.'}
            </div>
            <div style={{ fontSize: 12.5, paddingTop: 6 }}>
              {moveSum === 0 ? 'Tap cards in your hand to add them up.'
                : moveTargets.length ? 'Tap a glowing park on the map.'
                  : `No park sits exactly ${moveSum} trail${moveSum === 1 ? '' : 's'} away. Add or remove a card to change the total.`}
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
              Discard {sel.length} of {overLimit}
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
            End turn{view.actionsLeft > 0 ? ` (${view.actionsLeft} action${view.actionsLeft === 1 ? '' : 's'} unused)` : ''}
          </button>
        )}
      </div>

      {/* claim confirm (+ Hawai'i hop) */}
      {confirmClaim !== null && claimPark && claimPay && (
        <div className="tp-overlay" onClick={() => setConfirmClaim(null)}>
          <div className="ig-glass" style={{ padding: '22px 30px', borderRadius: 18, textAlign: 'center', maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">Claim this park · {claimPark.vp} points</div>
            <div style={{ font: '800 22px Inter, sans-serif', margin: '4px 0 10px' }}>{claimPark.name}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              {claimPay.cards.map((ci) => (
                <div key={ci}>{trekFaceByCell(scene, 'trek', TREK_CATALOG[hand[ci]].cell, 46, 66)}</div>
              ))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 12 }}>We picked the cheapest matching cards for you.</div>
            {claimPay.wildPairs.length > 0 && (
              <div className="ig-lab" style={{ paddingBottom: 8, textTransform: 'none', letterSpacing: 0 }}>
                {claimPay.wildPairs.length} Acadia wild pair{claimPay.wildPairs.length === 1 ? '' : 's'} included · any 2 cards stand in for 1 you're missing
              </div>
            )}
            {hasAbility('freeHop') && (
              <div style={{ marginBottom: 12 }}>
                <div className="ig-lab" style={{ paddingBottom: 6, textTransform: 'none', letterSpacing: 0 }}>Hawai'i Volcanoes · take a free 1-trail hop after claiming</div>
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
            <div className="ig-lab">Occupy · 5 points, a campsite, and this ability</div>
            <div style={{ font: '800 22px Inter, sans-serif', margin: '4px 0 4px' }}>{occupyMajor.name}</div>
            <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 12, lineHeight: 1.45 }}>{ABILITY_TEXT[occupyMajor.ability]}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              {occupyPay.cards.map((ci) => (
                <div key={ci}>{trekFaceByCell(scene, 'trek', TREK_CATALOG[hand[ci]].cell, 46, 66)}</div>
              ))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 12 }}>We picked the cheapest matching cards for you.</div>
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
      <div className="tk-hand tk-map-hand" role="group" aria-label={`${hand.length} trek cards in hand`} style={{ left: `calc((100vw - ${RIGHT_W}) / 2)` }}>
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
              role={selectable ? 'button' : undefined}
              tabIndex={selectable ? 0 : undefined}
              aria-label={selectable ? `${sel.includes(i) ? 'Deselect' : 'Select'} trek card ${i + 1}` : undefined}
              aria-pressed={selectable ? sel.includes(i) : undefined}
              onKeyDown={selectable ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSel(i); }
              } : undefined}
              style={{
                overflow: 'hidden',
                transform: `translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg)`,
                ['--tx' as string]: `${tx}px`, ['--ty' as string]: `${ty}px`, ['--rot' as string]: `${rot}deg`,
                zIndex: 10 + i,
              }}>
              <div style={{
                position: 'absolute', inset: 0,
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
        className="ig-glass tp-help-button"
        aria-label="Open the Trekking help guide"
        style={{ position: 'absolute', top: 12, left: 12, zIndex: 45, width: 40, height: 40, borderRadius: '50%', font: '700 18px Inter, sans-serif', padding: 0 }}
      >?</button>

      {error && <div className="toast">{error}</div>}
    </div>
  );
}
