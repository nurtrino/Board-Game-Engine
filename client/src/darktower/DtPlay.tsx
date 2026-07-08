// Personal device for Dark Tower. The board fills the main-left area; the
// right rail is the mod creator's tower control panel — the same 12 printed
// buttons, pressable, phase-aware — above the player's own kingdom scorecard
// built from the mod's card art. Riddle keys and curse victims cycle with NO
// and confirm with YES, exactly like the 1981 tower.

import { useEffect, useState } from 'react';
import { DT_KEYS, KINGDOMS, type DtView, type DtAction, type DtKey } from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { DtTable, useDtScene, type DtSceneDef } from './DtScene';
import { useTowerDisplay } from './DtBoard';
import { GameIntro, DT_INTRO } from '../ttr/GameIntro';

const CSS = `
.dt-lcd {
  display: inline-block; padding: 4px 12px; border-radius: 6px; background: #180b0b;
  border: 1px solid rgba(255,80,60,0.35); font: 700 24px "Courier New", monospace;
  letter-spacing: 6px; color: #ff5a3c; text-shadow: 0 0 12px rgba(255,90,60,0.8);
  min-width: 64px; text-align: center;
}
.dtp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 8px; border-radius: 12px; background: #17120e; border: 1px solid rgba(255,255,255,0.1); }
.dtp button {
  border: 1px solid rgba(0,0,0,0.55); border-radius: 4px; cursor: pointer; padding: 10px 4px;
  font: 700 11px Inter, sans-serif; letter-spacing: 0.4px; color: #14100a; text-transform: uppercase;
  line-height: 1.25; min-height: 52px; transition: filter .1s ease, transform .05s ease;
}
.dtp button:not(:disabled):hover { filter: brightness(1.12); }
.dtp button:not(:disabled):active { transform: translateY(1px); }
.dtp button:disabled { filter: grayscale(0.75) brightness(0.45); cursor: default; }
.dtp .split { display: block; border-top: 1.5px solid rgba(0,0,0,0.55); margin-top: 2px; padding-top: 2px; }
.tp-overlay { position: absolute; inset: 0; background: rgba(3,6,9,0.85); z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
.tp-act {
  display: block; width: 100%; text-align: center; padding: 12px 14px; border-radius: 11px;
  border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06);
  color: #e8ebf0; font: 700 13px Inter, sans-serif; letter-spacing: 1.2px; text-transform: uppercase;
}
.dt-tile { position: absolute; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.45); transition: filter .15s ease; }
.dt-tile.off { filter: grayscale(1) brightness(0.42); box-shadow: none; }
`;

const RIGHT_W = 'min(36vw, 440px)';
// key cycle order matches the tower (gold -> brass -> silver -> gold, L2420)
const KEY_CYCLE: DtKey[] = ['brasskey', 'silverkey', 'goldkey'];
const KEY_LABEL: Record<DtKey, string> = { brasskey: 'Brass key', silverkey: 'Silver key', goldkey: 'Gold key' };

/** One picture cropped from a reel strip (3 rows per texture). */
function ReelPic({ scene, pic, w = 84, h = 56 }: { scene: DtSceneDef; pic: string; w?: number; h?: number }) {
  const reel = scene.wedge.reelOf[pic];
  if (reel === undefined) return <div style={{ width: w, height: h }} />;
  const row = scene.wedge.rowOf[pic] ?? 0;
  return (
    <div style={{
      width: w, height: h, borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)',
      backgroundImage: `url(${scene.reelTextures[String(reel)]})`,
      backgroundSize: '100% 300%',
      backgroundPosition: `0% ${row * 50}%`,
      margin: '0 auto',
    }} />
  );
}

// tile slots as percentages of the card body art; y = tile BOTTOM, sitting
// just above each printed label (WARRIORS at 52%, BEAST 69%, SWORD 85%, keys 98%)
const CARD_SLOTS: Record<string, { x: number; y: number; w: number }> = {
  warriors: { x: 24.6, y: 50.5, w: 20 }, gold: { x: 50, y: 50.5, w: 20 }, food: { x: 75.6, y: 50.5, w: 20 },
  beast: { x: 24.6, y: 67.5, w: 20 }, scout: { x: 50, y: 67.5, w: 20 }, healer: { x: 75.6, y: 67.5, w: 20 },
  sword: { x: 37.8, y: 83.5, w: 20 }, pegasus: { x: 63, y: 83.5, w: 20 },
  brassk: { x: 22.5, y: 94.5, w: 24 }, silverk: { x: 50, y: 94.5, w: 24 }, goldk: { x: 77.5, y: 94.5, w: 24 },
};

// the body art's aspect (487x888) and where the tile region starts — the rail
// shows only the tile region so the whole panel fits without scrolling
const CARD_ASPECT = 487 / 888;
const CROP_TOP = 0.365;

/** The player's kingdom scorecard: the mod's body art with its tile art,
 *  lit when owned. Warriors/gold/food carry counts; the pegasus tile is the
 *  pegasus button, as in the mod. `crop` trims the decorative top third. */
export function Scorecard({ scene, view, seat, act, big = false, crop = false }: {
  scene: DtSceneDef; view: DtView; seat: number; act?: (a: DtAction) => void; big?: boolean; crop?: boolean;
}) {
  const p = view.players[seat];
  const card = scene.scorecards?.[p.color];
  if (!card?.body) return null;
  const canFly = act && p.pegasus === 1 && view.turn === seat && view.phase === 'playing';
  const counts: Record<string, number | null> = { warriors: p.warriors, gold: p.gold, food: p.food };
  const owned = (k: string): boolean =>
    k === 'warriors' || k === 'gold' || k === 'food' ? true : (p as unknown as Record<string, number>)[k === 'brassk' ? 'brasskey' : k === 'silverk' ? 'silverkey' : k === 'goldk' ? 'goldkey' : k] === 1;
  const inner = (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${CARD_ASPECT}` }}>
      <img src={card.body} alt={`${card.kingdom} scorecard`} style={{ display: 'block', width: '100%', height: '100%' }} />
      {Object.entries(CARD_SLOTS).map(([k, s]) => {
        const img = card.tiles[k];
        if (!img) return null;
        const isKey = k.endsWith('k');
        const on = owned(k);
        const fly = k === 'pegasus' && on && canFly;
        return (
          <div key={k}
            className={`dt-tile${on ? '' : ' off'}`}
            onClick={() => { if (fly && act) act({ type: 'pegasus' }); }}
            title={fly ? 'Fly the pegasus — take another action' : undefined}
            style={{
              left: `${s.x - s.w / 2}%`, top: `${s.y}%`, width: `${s.w}%`,
              transform: 'translateY(-100%)',
              cursor: fly ? 'pointer' : 'default',
              outline: fly ? '2px solid #7fe7ff' : 'none',
            }}>
            <img src={img} alt={k} style={{ display: 'block', width: '100%', borderRadius: 4, aspectRatio: isKey ? undefined : '1' , objectFit: 'cover' }} />
            {counts[k] !== undefined && (
              <span style={{
                position: 'absolute', right: -4, bottom: -6, background: '#0c1116', color: '#e8ebf0',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: big ? '2px 9px' : '1px 7px',
                font: `800 ${big ? 14 : 11}px Inter, sans-serif`,
              }}>{counts[k]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
  if (!crop) {
    return (
      <div style={{ position: 'relative', width: '100%', flexShrink: 0, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
        {inner}
      </div>
    );
  }
  // rail version: only the tile region shows (logo + crest trimmed), sized
  // so the whole rail fits an ipad without scrolling
  return (
    <div style={{
      position: 'relative', width: '66%', margin: '0 auto', flexShrink: 0, borderRadius: 10, overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', aspectRatio: `${CARD_ASPECT / (1 - CROP_TOP)}`,
    }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${(-CROP_TOP / (1 - CROP_TOP)) * 100}%` }}>
        {inner}
      </div>
    </div>
  );
}

// the printed panel's colors
const PANEL_HEX = {
  yes: '#3f9e43', repeat: '#aebfd0', no: '#c2342c',
  haggle: '#dd9a1f', bazaar: '#4a86c9', clear: '#dcdfe2',
  tomb: '#4a86c9', move: '#4a86c9', sanctuary: '#4a86c9',
  tower: '#cd4d26', frontier: '#4a86c9', inventory: '#b3905c',
};

export function DtPlay({ view, act, error }: {
  view: DtView;
  act: (a: DtAction) => void;
  error: string | null;
}) {
  const scene = useDtScene();
  const display = useTowerDisplay(view, false); // the TV voices; phones stay quiet
  const me = view.you !== null ? view.players[view.you] : null;
  const [showIntro, setShowIntro] = useState(true);
  const [focusTower, setFocusTower] = useState(false);
  const [showInv, setShowInv] = useState(false);
  const [keyIdx, setKeyIdx] = useState(0); // riddle: shown key (NO cycles, YES locks in)
  const [curseIdx, setCurseIdx] = useState(0); // cursePick: shown victim

  const phase = view.phase;
  useEffect(() => { if (phase === 'riddle') setKeyIdx(0); }, [phase, view.riddlePhase]);
  useEffect(() => { if (phase === 'cursePick') setCurseIdx(0); }, [phase]);

  if (!scene || !me) return <div className="page center"><h2>Raising the tower</h2></div>;
  const mine = me;
  const myTurn = view.turn === mine.seat && phase !== 'ended';
  const victims = view.players.filter((p) => p.seat !== mine.seat);
  const victim = victims[curseIdx % victims.length];

  // what the readout shows: the riddle/curse cycling is local, like the toy
  const shownPic = myTurn && phase === 'riddle' ? KEY_CYCLE[keyIdx % 3] : display.pic;
  const shownLcd = myTurn && phase === 'riddle' ? `${view.riddlePhase} `
    : myTurn && phase === 'cursePick' ? `C${victim?.color[0] ?? ' '}` : display.lcd;

  // the panel: which buttons do something right now
  const canAct = myTurn && phase === 'playing';
  const press = {
    yes: myTurn && phase === 'bazaar' ? () => act({ type: 'bazaar_yes' })
      : myTurn && phase === 'battle' ? () => act({ type: 'battle_continue' })
      : myTurn && phase === 'riddle' ? () => act({ type: 'riddle_guess', key: KEY_CYCLE[keyIdx % 3] })
      : myTurn && phase === 'cursePick' && victim ? () => act({ type: 'curse', victim: victim.seat })
      : null,
    no: myTurn && phase === 'bazaar' ? () => act({ type: 'bazaar_no' })
      : myTurn && phase === 'battle' ? () => act({ type: 'battle_bail' })
      : myTurn && phase === 'riddle' ? () => setKeyIdx((i) => i + 1)
      : myTurn && phase === 'cursePick' ? () => setCurseIdx((i) => i + 1)
      : myTurn && phase === 'turnDone' ? () => act({ type: 'end_turn' })
      : null,
    haggle: myTurn && phase === 'bazaar' && (view.bazaar?.buying ?? 0) === 0 ? () => act({ type: 'bazaar_haggle' }) : null,
    repeat: view.lastEvent ? () => display.replay() : null,
    clear: null, // the mod's CLEAR undoes honor-system mistakes; moves are enforced here
    move: canAct ? () => act({ type: 'move' }) : null,
    tomb: canAct ? () => act({ type: 'tomb' }) : null,
    bazaar: canAct ? () => act({ type: 'bazaar' }) : null,
    sanctuary: canAct ? () => act({ type: 'sanctuary' }) : null,
    frontier: canAct ? () => act({ type: 'frontier' }) : null,
    tower: canAct ? () => act({ type: 'tower' }) : null,
    inventory: () => setShowInv(true),
  };

  const P = ({ id, children }: { id: keyof typeof PANEL_HEX & keyof typeof press; children: React.ReactNode }) => (
    <button style={{ background: PANEL_HEX[id] }} disabled={!press[id]} onClick={() => press[id]?.()}>{children}</button>
  );

  const statusLine = view.winner ? `${view.players.find((p) => p.color === view.winner)?.name} conquered the tower`
    : !myTurn ? `${view.players[view.turn]?.name} is playing`
    : phase === 'playing' ? 'Your turn — press an action'
    : phase === 'battle' ? `${view.battle?.brigands} brigands — YES fights, NO retreats`
    : phase === 'bazaar' ? ((view.bazaar?.buying ?? 0) > 0
      ? `Buying ${view.bazaar!.buying} — YES adds one, NO pays`
      : `${view.bazaar?.offer} at ${view.bazaar?.offer === 'food' ? 1 : view.bazaar?.prices[view.bazaar.offer]} gold — YES buys, NO next, or HAGGLE`)
    : phase === 'riddle' ? `Key ${view.riddlePhase} of 2 — NO cycles, YES answers ${KEY_LABEL[KEY_CYCLE[keyIdx % 3]]}`
    : phase === 'cursePick' ? `NO cycles the victim, YES curses ${victim?.name}`
    : 'Turn complete — NO | END passes the tower';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <style>{CSS}</style>

      {/* main area: the board */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: RIGHT_W }}>
        <DtTable
          scene={scene}
          tokens={view.players.map((p) => ({ color: p.color, quad: p.quad }))}
          pic={shownPic}
          lcd={shownLcd}
          wedgeMaps={scene.wedge}
          aim={focusTower ? { x: 0, z: 1, h: 7, y: 7 } : null}
        />
        <button className="ig-glass" onClick={() => setFocusTower((f) => !f)} style={{
          position: 'absolute', bottom: 14, left: 14, padding: '9px 13px', borderRadius: 11,
          font: '700 11px Inter, sans-serif', letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
        }}>{focusTower ? 'Show board' : 'Focus the tower'}</button>
      </div>

      {/* right rail: readout, the tower panel, your scorecard */}
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: RIGHT_W, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div className="ig-glass" style={{ padding: '10px 14px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="dt-lcd">{shownLcd || '  '}</span>
          <div style={{ flex: 1 }}>
            {shownPic ? <ReelPic scene={scene} pic={shownPic} w={84} h={58} /> : <div style={{ width: 84, height: 58 }} />}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="ig-lab">Level {view.level}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', paddingTop: 3 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[mine.color] }} />
              <b style={{ fontSize: 13 }}>{mine.name}</b>
            </div>
            <div className="ig-lab" style={{ paddingTop: 2 }}>{KINGDOMS[mine.color]} · {mine.quad}/4</div>
          </div>
        </div>

        <div className="ig-glass" style={{ padding: '9px 12px', borderRadius: 12, textAlign: 'center', font: '700 12px Inter, sans-serif', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {statusLine}
        </div>

        {/* the tower's control panel */}
        <div className="dtp">
          <P id="yes"><span>Yes</span><span className="split">Buy</span></P>
          <P id="repeat">Repeat</P>
          <P id="no"><span>No</span><span className="split">End</span></P>
          <P id="haggle">Haggle</P>
          <P id="bazaar">Bazaar</P>
          <P id="clear">Clear</P>
          <P id="tomb"><span>Tomb</span><span className="split">Ruin</span></P>
          <P id="move">Move</P>
          <P id="sanctuary"><span>Sanctuary</span><span className="split">Citadel</span></P>
          <P id="tower"><span>Dark</span><span className="split">Tower</span></P>
          <P id="frontier">Frontier</P>
          <P id="inventory">Inventory</P>
        </div>

        {/* your kingdom scorecard */}
        <Scorecard scene={scene} view={view} seat={mine.seat} act={act} crop />

        {/* rivals, one line each */}
        <div className="ig-glass" style={{ padding: '9px 12px', borderRadius: 12 }}>
          {victims.map((p) => (
            <div key={p.seat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
              <b>{p.name}</b>
              <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{p.warriors}w · {p.gold}g · {p.food}f · {p.quad}/4</span>
            </div>
          ))}
        </div>
      </div>

      {/* enlarged scorecard */}
      {showInv && (
        <div className="tp-overlay" onClick={() => setShowInv(false)}>
          <div style={{ width: 'min(46vh, 86vw)' }} onClick={(e) => e.stopPropagation()}>
            <Scorecard scene={scene} view={view} seat={mine.seat} act={act} big />
          </div>
          <button className="tp-act" style={{ maxWidth: 200 }} onClick={() => setShowInv(false)}>Close</button>
        </div>
      )}

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
