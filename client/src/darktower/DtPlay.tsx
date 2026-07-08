// Personal device for Dark Tower. Brass-style: the board fills the main-left
// area with the tower panel top-right — tap either to swap which is large.
// The panel offers only the buttons legal in the current phase, plus your
// full inventory, and mirrors the tower's reel picture + LCD.

import { useState } from 'react';
import { DT_KEYS, KINGDOMS, type DtView, type DtAction, type DtKey, type DtSeat } from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { DtTable, useDtScene } from './DtScene';
import { useTowerDisplay } from './DtBoard';
import { GameIntro, DT_INTRO } from '../ttr/GameIntro';

const CSS = `
.tp-act {
  display: block; width: 100%; text-align: center; padding: 12px 14px; border-radius: 11px;
  border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06);
  color: #e8ebf0; font: 700 13px Inter, sans-serif; letter-spacing: 1.2px; text-transform: uppercase;
  transition: background .12s ease;
}
.tp-act:hover:not(:disabled) { background: rgba(255,255,255,0.13); }
.tp-act:disabled { opacity: 0.35; cursor: default; }
.tp-act.primary { background: #dfe9ee; color: #06121a; border-color: transparent; }
.dt-lcd {
  display: inline-block; padding: 4px 12px; border-radius: 6px; background: #180b0b;
  border: 1px solid rgba(255,80,60,0.35); font: 700 24px "Courier New", monospace;
  letter-spacing: 6; color: #ff5a3c; text-shadow: 0 0 12px rgba(255,90,60,0.8);
  min-width: 64px; text-align: center;
}
`;

const RIGHT_W = 'min(36vw, 440px)';
const KEY_LABEL: Record<DtKey, string> = { brasskey: 'Brass key', silverkey: 'Silver key', goldkey: 'Gold key' };

export function DtPlay({ view, act, error }: {
  view: DtView;
  act: (a: DtAction) => void;
  error: string | null;
}) {
  const scene = useDtScene();
  const display = useTowerDisplay(view, false); // phones stay quiet; the TV voices
  const me = view.you !== null ? view.players[view.you] : null;
  const [showIntro, setShowIntro] = useState(true);
  const [focusTower, setFocusTower] = useState(false);

  if (!scene || !me) return <div className="page center"><h2>Raising the tower</h2></div>;
  const mine = me;
  const myTurn = view.turn === mine.seat && view.phase !== 'ended';
  const phase = view.phase;

  const board = (
    <DtTable
      scene={scene}
      tokens={view.players.map((p) => ({ color: p.color, quad: p.quad }))}
      pic={display.pic}
      lcd={display.lcd}
      wedgeMaps={scene.wedge}
      aim={focusTower ? { x: -0.5, z: -0.4, h: 9, y: 8 } : null}
    />
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <style>{CSS}</style>

      {/* main area: the board (tap the mini panel to swap focus) */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: RIGHT_W }}>
        {board}
        {/* focus hint */}
        <button className="ig-glass" onClick={() => setFocusTower((f) => !f)} style={{
          position: 'absolute', bottom: 14, left: 14, padding: '9px 13px', borderRadius: 11,
          font: '700 11px Inter, sans-serif', letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
        }}>{focusTower ? 'Show board' : 'Focus the tower'}</button>
      </div>

      {/* right rail: the tower panel */}
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: RIGHT_W, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {/* readout */}
        <div className="ig-glass" style={{ padding: '12px 14px', borderRadius: 14, textAlign: 'center' }}>
          <div className="ig-lab" style={{ paddingBottom: 6 }}>The Dark Tower — level {view.level}</div>
          <span className="dt-lcd">{display.lcd || '  '}</span>
          {display.pic && <div className="ig-lab" style={{ paddingTop: 6 }}>{display.pic.replace('key', ' key')}</div>}
        </div>

        {/* me */}
        <div className="ig-glass" style={{ padding: '12px 14px', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: SEAT_HEX[mine.color] }} />
            <b>{mine.name}</b>
            <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>{KINGDOMS[mine.color]} - kingdom {mine.quad}/4</span>
          </div>
          <div className="ig-hold">
            <div><div className="ig-lab">Warriors</div><div className="ig-stat-v ig-num">{mine.warriors}</div></div>
            <div><div className="ig-lab">Gold</div><div className="ig-stat-v ig-num">{mine.gold}</div></div>
            <div><div className="ig-lab">Food</div><div className="ig-stat-v ig-num">{mine.food}</div></div>
            <div><div className="ig-lab">Moves</div><div className="ig-stat-v ig-num">{mine.moves}</div></div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 8 }}>
            {([['beast', 'Beast'], ['scout', 'Scout'], ['healer', 'Healer'], ['sword', 'Sword'], ['pegasus', 'Pegasus'], ['brasskey', 'Brass key'], ['silverkey', 'Silver key'], ['goldkey', 'Gold key']] as const)
              .map(([k, label]) => (
                <span key={k} style={{
                  padding: '3px 9px', borderRadius: 999, fontSize: 11, letterSpacing: 0.4,
                  border: '1px solid rgba(255,255,255,0.16)',
                  opacity: mine[k] ? 1 : 0.25,
                }}>{label}</span>
              ))}
            {mine.cursed === 1 && <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, border: '1px solid rgba(255,90,60,0.5)', color: '#ff5a3c' }}>Cursed</span>}
          </div>
        </div>

        {/* status */}
        <div className="ig-glass" style={{ padding: '10px 12px', borderRadius: 14, textAlign: 'center', font: '700 13px Inter, sans-serif', letterSpacing: 1, textTransform: 'uppercase' }}>
          {view.winner ? `${view.players.find((p) => p.color === view.winner)?.name} conquered the tower`
            : myTurn ? (phase === 'playing' ? 'Your turn — choose an action'
              : phase === 'battle' ? `Battle — ${view.battle?.brigands} brigands`
              : phase === 'bazaar' ? `Bazaar — ${view.bazaar?.offer} offered`
              : phase === 'riddle' ? `Riddle — key ${view.riddlePhase} of 2`
              : phase === 'cursePick' ? 'Choose who to curse'
              : 'Turn complete')
            : `${view.players[view.turn]?.name} is playing`}
        </div>

        {/* phase controls */}
        {myTurn && phase === 'playing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="tp-act" onClick={() => act({ type: 'move' })}>Move</button>
            <button className="tp-act" onClick={() => act({ type: 'tomb' })}>Tomb / ruin</button>
            <button className="tp-act" onClick={() => act({ type: 'bazaar' })}>Bazaar</button>
            <button className="tp-act" onClick={() => act({ type: 'sanctuary' })}>Sanctuary / citadel</button>
            <button className="tp-act" onClick={() => act({ type: 'frontier' })}>Frontier</button>
            <button className="tp-act" disabled={mine.quad < 4 || !mine.goldkey} onClick={() => act({ type: 'tower' })}>The Dark Tower</button>
            {mine.pegasus === 1 && <button className="tp-act" onClick={() => act({ type: 'pegasus' })}>Fly the pegasus</button>}
          </div>
        )}

        {myTurn && phase === 'battle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="tp-act primary" onClick={() => act({ type: 'battle_continue' })}>Fight on</button>
            {!view.battle?.tower && <button className="tp-act" onClick={() => act({ type: 'battle_bail' })}>Retreat (lose 1 warrior)</button>}
            {view.battle?.tower && <button className="tp-act" onClick={() => act({ type: 'battle_bail' })}>Flee the tower (lose 1 warrior)</button>}
          </div>
        )}

        {myTurn && phase === 'bazaar' && view.bazaar && (
          <div className="ig-glass" style={{ padding: 12, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="ig-lab">
              {view.bazaar.buying > 0
                ? `Buying ${view.bazaar.buying} ${view.bazaar.offer}${view.bazaar.buying > 1 ? 's' : ''} — YES adds one, NO pays`
                : `${view.bazaar.offer} at ${view.bazaar.offer === 'food' ? 1 : view.bazaar.prices[view.bazaar.offer]} gold`}
            </div>
            <button className="tp-act primary" onClick={() => act({ type: 'bazaar_yes' })}>Yes — buy</button>
            <button className="tp-act" onClick={() => act({ type: 'bazaar_no' })}>{view.bazaar.buying > 0 ? 'Pay and leave' : 'No — next offer'}</button>
            <button className="tp-act" disabled={view.bazaar.buying > 0} onClick={() => act({ type: 'bazaar_haggle' })}>Haggle</button>
          </div>
        )}

        {myTurn && phase === 'riddle' && (
          <div className="ig-glass" style={{ padding: 12, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="ig-lab">Name key {view.riddlePhase} of the sequence</div>
            {DT_KEYS.map((k) => (
              <button key={k} className="tp-act" onClick={() => act({ type: 'riddle_guess', key: k })}>{KEY_LABEL[k]}</button>
            ))}
          </div>
        )}

        {myTurn && phase === 'cursePick' && (
          <div className="ig-glass" style={{ padding: 12, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="ig-lab">The wizard obeys — curse whom?</div>
            {view.players.filter((p) => p.seat !== mine.seat).map((p) => (
              <button key={p.seat} className="tp-act" style={{ borderColor: SEAT_HEX[p.color] }} onClick={() => act({ type: 'curse', victim: p.seat })}>
                {p.name} ({p.warriors}w, {p.gold}g)
              </button>
            ))}
          </div>
        )}

        {myTurn && phase === 'turnDone' && (
          <button className="tp-act primary" style={{ marginTop: 'auto' }} onClick={() => act({ type: 'end_turn' })}>End turn</button>
        )}

        {/* other players */}
        <div className="ig-glass" style={{ padding: '10px 12px', borderRadius: 14, marginTop: myTurn && phase === 'turnDone' ? 0 : 'auto' }}>
          {view.players.filter((p) => p.seat !== mine.seat).map((p) => (
            <div key={p.seat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
              <b>{p.name}</b>
              <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{p.warriors}w · {p.gold}g · {p.food}f · {p.quad}/4</span>
            </div>
          ))}
        </div>
      </div>

      {showIntro && <GameIntro intro={DT_INTRO} onClose={() => setShowIntro(false)} />}
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
