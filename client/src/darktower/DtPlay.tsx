// Personal device for Dark Tower. The board fills the main-left area; the
// right rail is the mod creator's tower control panel — the same 12 printed
// buttons, pressable, phase-aware — above the player's own kingdom scorecard
// built from the mod's card art. Riddle keys and curse victims cycle with NO
// and confirm with YES, exactly like the 1981 tower.

import { useEffect, useRef, useState } from 'react';
import { DT_KEYS, DT_NODE, KINGDOMS, dtActionForNode, dtHomeSpot, type DtView, type DtAction, type DtKey } from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { DtTable, useDtScene, type DtSceneDef } from './DtScene';
import { useTowerDisplay, TOWER_AIM, holdsTower } from './DtBoard';
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
.dtp button.match { outline: 3px solid #fff0a8; outline-offset: 1px; box-shadow: 0 0 15px rgba(255,224,120,.65); }
.dtp .split { display: block; border-top: 1.5px solid rgba(0,0,0,0.55); margin-top: 2px; padding-top: 2px; }
.tp-overlay { position: absolute; inset: 0; background: rgba(3,6,9,0.85); z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
.tp-act {
  display: block; width: 100%; text-align: center; padding: 12px 14px; border-radius: 11px;
  border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06);
  color: #e8ebf0; font: 700 13px Inter, sans-serif; letter-spacing: 1.2px; text-transform: uppercase;
}
.dt-tile { position: absolute; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.45); transition: filter .15s ease; }
.dt-tile.off { filter: grayscale(1) brightness(0.42); box-shadow: none; }
/* the permanently-dead reset key: reads as a decorative, non-interactive part
   of the panel rather than a broken button. */
.dtp button.decor { filter: grayscale(1) brightness(0.5); border-style: dashed; cursor: default; }
.dt-help {
  position: absolute; top: 12px; left: 12px; z-index: 45; display: flex; align-items: center; gap: 8px;
  padding: 8px 14px 8px 10px; border-radius: 999px; cursor: pointer;
  font: 700 12px Inter, sans-serif; letter-spacing: 1.2px; text-transform: uppercase;
}
.dt-help .q { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid currentColor; font-size: 13px; }
.dt-key { font-size: 11px; line-height: 1.5; }
.dt-key .k { display: flex; gap: 8px; padding: 2px 0; }
.dt-key .k b { color: #e8ebf0; letter-spacing: 0.4px; white-space: nowrap; min-width: 118px; }
.dt-key .k span { opacity: 0.68; }
.dt-hint { font-size: 12px; line-height: 1.45; padding: 3px 0; }
.dt-hint.warn { color: #f2b34a; }
.dt-hint.ready { color: #7fe0a0; }
.dt-fly {
  display: block; width: 100%; padding: 11px 12px; border-radius: 11px; border: 1px solid #7fe7ff;
  background: rgba(127,231,255,0.14); color: #d8f6ff; cursor: pointer;
  font: 700 12px Inter, sans-serif; letter-spacing: 1.2px; text-transform: uppercase;
}
.dt-fly:hover { filter: brightness(1.12); }
.dt-destinations { padding: 10px 12px; border-radius: 12px; }
.dt-destinations .choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
.dt-destination {
  min-height: 44px; padding: 8px 10px; border-radius: 9px; border: 1px solid rgba(127,231,255,.42);
  background: rgba(127,231,255,.09); color: #e8ebf0; cursor: pointer; text-align: left;
  font: 700 11px/1.3 Inter, sans-serif; letter-spacing: .25px;
}
.dt-destination.current { border-color: #ffd24a; background: rgba(255,210,74,.12); }
.dt-destination span { display: block; margin-top: 2px; opacity: .7; font-size: 10px; font-weight: 600; }
.dt-destination:hover { filter: brightness(1.15); }

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
  .tp-control-sheet .tp-act, .tp-control-sheet button { min-height: 44px; }
  .dt-help { top: max(12px, env(safe-area-inset-top)); min-height: 44px; }
  .dt-map-button { min-height: 44px; }
}
`;

const RIGHT_W = 'min(36vw, 440px)';
// key cycle order matches the tower (gold -> brass -> silver -> gold, L2420)
const KEY_CYCLE: DtKey[] = ['brasskey', 'silverkey', 'goldkey'];
const KEY_LABEL: Record<DtKey, string> = { brasskey: 'Brass key', silverkey: 'Silver key', goldkey: 'Gold key' };
const ACTION_LABEL = {
  move: 'Move', tomb: 'Tomb / Ruin', bazaar: 'Bazaar', sanctuary: 'Sanctuary / Citadel',
  frontier: 'Frontier', tower: 'Dark Tower',
} as const;
const SPACE_LABEL = {
  empty: 'Empty trail', tomb: 'Tomb', ruin: 'Ruin', bazaar: 'Bazaar', sanctuary: 'Sanctuary',
  citadel: 'Citadel', darktower: 'Dark Tower', frontier: 'Frontier',
} as const;

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
      position: 'relative', width: '88%', margin: '0 auto', flexShrink: 0, borderRadius: 10, overflow: 'hidden',
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
  const [showRules, setShowRules] = useState(false); // movement-rules pop-up on first drag
  const [confirmTower, setConfirmTower] = useState(false); // guard the endgame Dark Tower press
  const rulesSeen = useRef(false); // shown once per turn
  const [keyIdx, setKeyIdx] = useState(0); // riddle: shown key (NO cycles, YES locks in)
  const [curseIdx, setCurseIdx] = useState(0); // cursePick: shown victim

  const phase = view.phase;
  useEffect(() => { if (phase === 'riddle') setKeyIdx(0); }, [phase, view.riddlePhase]);
  useEffect(() => { if (phase === 'cursePick') setCurseIdx(0); }, [phase]);
  useEffect(() => { rulesSeen.current = false; }, [view.turn]); // reset the drag hint each turn

  if (!scene || !me) return <div className="page center"><h2>Raising the tower</h2></div>;
  const mine = me;
  const myTurn = view.turn === mine.seat && phase !== 'ended';
  const victims = view.players.filter((p) => p.seat !== mine.seat);
  const victim = victims[curseIdx % victims.length];

  // what the readout shows: the riddle/curse cycling is local, like the toy
  const shownPic = myTurn && phase === 'riddle' ? KEY_CYCLE[keyIdx % 3] : display.pic;
  const shownLcd = myTurn && phase === 'riddle' ? `${view.riddlePhase} `
    : myTurn && phase === 'cursePick' ? `C${victim?.color[0] ?? ' '}` : display.lcd;

  // The occupied exact graph node authorizes one matching printed action button.
  const canAct = myTurn && phase === 'playing' && !display.active;
  const occupied = DT_NODE.get(mine.node);
  const currentAction = occupied ? dtActionForNode(occupied.id) : null;
  const canResolveOccupied = canAct && view.legalSteps.includes(mine.node);
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
    clear: null,
    move: canResolveOccupied && currentAction === 'move' ? () => act({ type: 'move' }) : null,
    tomb: canResolveOccupied && currentAction === 'tomb' ? () => act({ type: 'tomb' }) : null,
    bazaar: canResolveOccupied && currentAction === 'bazaar' ? () => act({ type: 'bazaar' }) : null,
    sanctuary: canResolveOccupied && currentAction === 'sanctuary' ? () => act({ type: 'sanctuary' }) : null,
    frontier: canResolveOccupied && currentAction === 'frontier' && mine.quad < 4 ? () => act({ type: 'frontier' }) : null,
    tower: canResolveOccupied && currentAction === 'tower' && mine.quad >= 4 && mine.brasskey === 1 && mine.silverkey === 1 && mine.goldkey === 1 ? () => setConfirmTower(true) : null,
    inventory: () => setShowInv(true),
  };

  // can the player launch the hidden pegasus extra action right now?
  const canFly = myTurn && phase === 'playing' && !display.active && mine.pegasus === 1;

  // plain-language caption for the glowing tower readout (the LCD codes alone
  // are undecodable to a newcomer).
  const readoutCaption = view.winner ? 'Tower readout'
    : myTurn && phase === 'riddle' ? `Tower readout · answer with the ${KEY_LABEL[KEY_CYCLE[keyIdx % 3]].toLowerCase()}`
    : myTurn && phase === 'cursePick' && victim ? `Tower readout · curse ${victim.name} of the ${KINGDOMS[victim.color]} kingdom?`
    : phase === 'battle' ? 'Tower readout · brigands are attacking'
    : phase === 'bazaar' ? 'Tower readout · the bazaar is trading'
    : 'Tower readout';

  // touch-friendly "why is that greyed?" hints for the gated action buttons,
  // shown only while it is your turn to act.
  const hints: { text: string; kind?: 'warn' | 'ready' }[] = [];
  if (myTurn && phase === 'playing' && !display.active) {
    hints.push({ text: 'Choose a glowing current or adjacent territory. Dragging also snaps to one of these legal spaces.' });
    if (canResolveOccupied && occupied && currentAction) hints.push({ text: `Pawn on ${SPACE_LABEL[occupied.kind]} · press ${ACTION_LABEL[currentAction]}.`, kind: currentAction === 'tower' ? 'ready' : undefined });
    else hints.push({ text: 'The frontier behind you is closed · choose a glowing space in the new kingdom.', kind: 'warn' });
    if (mine.quad < 4) hints.push({ text: 'Only the counter-clockwise frontier ahead is a legal destination.' });
    else if (!mine.brasskey || !mine.silverkey || !mine.goldkey) hints.push({ text: 'Dark Tower needs all three keys after returning home.', kind: 'warn' });
  }

  const P = ({ id, decor, children }: { id: keyof typeof PANEL_HEX & keyof typeof press; decor?: boolean; children: React.ReactNode }) => {
    const boardLabel = ACTION_LABEL[id as keyof typeof ACTION_LABEL];
    const match = !!boardLabel && canResolveOccupied && currentAction === id;
    const title = boardLabel && canAct
      ? match ? `${boardLabel}: matches your occupied ${occupied ? SPACE_LABEL[occupied.kind].toLowerCase() : 'space'}`
        : `${boardLabel} is unavailable because your pawn occupies ${occupied ? SPACE_LABEL[occupied.kind].toLowerCase() : 'another space'}`
      : undefined;
    return (
      <button className={[decor ? 'decor' : '', match ? 'match' : ''].filter(Boolean).join(' ') || undefined} title={title}
        style={{ background: PANEL_HEX[id] }} disabled={!press[id]} onClick={() => press[id]?.()}>{children}</button>
    );
  };

  const statusLine = view.winner ? `${view.players.find((p) => p.color === view.winner)?.name} conquered the tower`
    : !myTurn ? `Waiting — ${view.players[view.turn]?.name} is playing`
    : phase === 'playing' ? canResolveOccupied && currentAction && occupied ? `Your turn — on ${SPACE_LABEL[occupied.kind]}; press ${ACTION_LABEL[currentAction]}` : 'Your turn — choose a glowing legal space'
    : phase === 'battle' ? `${view.battle?.brigands} brigands — YES fights, NO retreats`
    : phase === 'bazaar' ? ((view.bazaar?.buying ?? 0) > 0
      ? `Buying ${view.bazaar!.buying} — YES adds one, NO pays`
      : `${view.bazaar?.offer} at ${view.bazaar?.offer === 'food' ? 1 : view.bazaar?.prices[view.bazaar.offer]} gold — YES buys, NO next, or HAGGLE`)
    : phase === 'riddle' ? `Key ${view.riddlePhase} of 2 — NO cycles, YES answers ${KEY_LABEL[KEY_CYCLE[keyIdx % 3]]}`
    : phase === 'cursePick' ? `NO cycles the victim, YES curses ${victim?.name}`
    : 'Turn complete — NO | END passes the tower';

  return (
    <div className="tp-responsive-shell" style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <style>{CSS}</style>

      {/* main area: the board */}
      <div className="tp-board-pane" role="region" aria-label="Dark Tower board" style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: RIGHT_W }}>
        <DtTable
          scene={scene}
          tokens={view.players.map((p) => ({ seat: p.seat, color: p.color, spot: p.spot }))}
          pic={shownPic}
          lcd={shownLcd}
          wedgeMaps={scene.wedge}
          aim={holdsTower(phase, display.active) ? TOWER_AIM
            : focusTower ? { x: 0, z: 1, h: 7, y: 6.5 }
            // your turn: zoom in on your own pawn so it is easy to pick up and move
            : (myTurn && phase === 'playing') ? (() => { const s = mine.spot ?? dtHomeSpot(mine.color); return { x: s.x, z: -s.z, h: 7, y: 1.6 }; })()
            : null}
          youSeat={mine.seat}
          canMove={myTurn && phase === 'playing' && !display.active}
          legalSteps={myTurn && phase === 'playing' && !display.active ? view.legalSteps : []}
          onMoveToken={(x, z) => act({ type: 'move_token', x, z })}
          onSelectNode={(node) => act({ type: 'move_token', node })}
          onDragChange={(d) => { if (d && !rulesSeen.current) { rulesSeen.current = true; setShowRules(true); } }}
        />
        <button className="ig-glass dt-map-button" onClick={() => setFocusTower((f) => !f)} style={{
          position: 'absolute', bottom: 14, left: 14, padding: '9px 13px', borderRadius: 11,
          font: '700 11px Inter, sans-serif', letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
        }}>{focusTower ? 'Show board' : 'Focus the tower'}</button>
        {myTurn && phase === 'playing' && !display.active && (
          <div className="ig-glass" style={{
            position: 'absolute', top: 14, left: 14, padding: '8px 12px', borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            font: '700 11px Inter, sans-serif', letterSpacing: 0.6, textTransform: 'uppercase',
          }}>
            <span style={{ opacity: 0.9 }}>Tap a glowing space or drag your pawn, then press its matching action</span>
            <button className="dt-map-button" onClick={() => setShowRules(true)} style={{
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, background: 'rgba(255,255,255,0.08)',
              color: '#e8ebf0', cursor: 'pointer', padding: '4px 9px', font: '700 10px Inter, sans-serif',
              letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>How to move</button>
          </div>
        )}
      </div>

      {/* right rail: readout, the tower panel, your scorecard */}
      <div className="tp-control-sheet" role="region" aria-label="Dark Tower status and controls" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: RIGHT_W, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
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
            <div className="ig-lab" style={{ paddingTop: 2 }}>{KINGDOMS[mine.color]} · kingdom {mine.quad}/4</div>
          </div>
        </div>

        {/* caption for the glowing readout, decoding the tower's LCD codes */}
        <div className="ig-lab" style={{ textAlign: 'center', marginTop: -4 }}>{readoutCaption}</div>

        <div className="ig-glass" style={{ padding: '9px 12px', borderRadius: 12, textAlign: 'center', font: '700 12px Inter, sans-serif', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {statusLine}
        </div>

        {/* Accessible movement controls mirror the glowing destinations on the 3D board. */}
        {canAct && view.legalSteps.length > 0 && (
          <div className="ig-glass dt-destinations" role="group" aria-label="Legal pawn destinations">
            <div className="ig-lab">Choose a legal territory</div>
            <div className="choices">
              {view.legalSteps.map((id, index) => {
                const n = DT_NODE.get(id);
                if (!n) return null;
                const action = dtActionForNode(id);
                const current = id === mine.node;
                return (
                  <button
                    key={id}
                    className={`dt-destination${current ? ' current' : ''}`}
                    aria-pressed={current}
                    aria-label={`${current ? 'Stay here' : `Adjacent territory ${index + 1}`}: ${SPACE_LABEL[n.kind]}; then press ${action ? ACTION_LABEL[action] : 'the matching action'}`}
                    onClick={() => act({ type: 'move_token', node: id })}
                  >
                    {current ? 'Stay here' : `Adjacent ${index + 1}`} · {SPACE_LABEL[n.kind]}
                    <span>Then press {action ? ACTION_LABEL[action] : 'matching action'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* the tower's control panel */}
        <div className="dtp">
          <P id="yes"><span>Yes</span><span className="split">Buy</span></P>
          <P id="repeat">Repeat</P>
          <P id="no"><span>No</span><span className="split">End</span></P>
          <P id="haggle">Haggle</P>
          <P id="bazaar">Bazaar</P>
          <P id="clear" decor>Clear</P>
          <P id="tomb"><span>Tomb</span><span className="split">Ruin</span></P>
          <P id="move">Move</P>
          <P id="sanctuary"><span>Sanctuary</span><span className="split">Citadel</span></P>
          <P id="tower"><span>Dark</span><span className="split">Tower</span></P>
          <P id="frontier">Frontier</P>
          <P id="inventory">Inventory</P>
        </div>

        {/* touch-friendly hints: what to do now and why buttons are greyed */}
        {hints.length > 0 && (
          <div className="ig-glass" style={{ padding: '9px 12px', borderRadius: 12 }}>
            {hints.map((h, i) => (
              <div key={i} className={`dt-hint${h.kind ? ' ' + h.kind : ''}`}>{h.text}</div>
            ))}
          </div>
        )}

        {/* the hidden pegasus extra action, now a visible affordance */}
        {canFly && (
          <button className="dt-fly" onClick={() => act({ type: 'pegasus' })}>
            Fly the pegasus · take another action
          </button>
        )}

        {/* panel key: the stacked second words and the stat abbreviations */}
        <div className="ig-glass dt-key" style={{ padding: '10px 12px', borderRadius: 12 }}>
          <div className="ig-lab" style={{ marginBottom: 4 }}>Panel key</div>
          <div className="k"><b>YES · BUY</b><span>say yes, or buy at the bazaar</span></div>
          <div className="k"><b>NO · END</b><span>say no, or end your turn</span></div>
          <div className="k"><b>TOMB · RUIN</b><span>search a tomb or ruin</span></div>
          <div className="k"><b>SANCTUARY · CITADEL</b><span>enter a sanctuary or citadel</span></div>
          <div className="k"><b>DARK · TOWER</b><span>storm the Dark Tower to win</span></div>
          <div className="k"><b>REPEAT</b><span>replay the tower's last readout</span></div>
          <div className="k"><b>MOVE</b><span>take your step with no other action</span></div>
          <div className="k"><b>FRONTIER</b><span>cross into the next kingdom</span></div>
          <div className="k"><b>CLEAR</b><span>tower reset key · not used in play</span></div>
          <div className="k" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: 4, paddingTop: 6 }}>
            <b>W · G · F</b><span>warriors · gold · food</span>
          </div>
          <div className="k"><b>· 4/4</b><span>kingdoms crossed · keys held</span></div>
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

      {/* movement rules — pops up the first time you pick up your piece each turn */}
      {showRules && (
        <div className="tp-overlay" onClick={() => setShowRules(false)}>
          <div className="ig-glass" style={{ maxWidth: 380, padding: '20px 22px', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ font: '800 16px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Moving your piece</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, opacity: 0.9 }}>
              <li>Each turn, tap a glowing territory or drag your pawn <b>one</b> space to an adjacent territory &mdash; or stay put.</li>
              <li>Travel <b>counter-clockwise</b> from kingdom to kingdom. Within a kingdom, move any direction you like.</li>
              <li>Cross into the next kingdom over its <b>Frontier</b>. You need that kingdom&rsquo;s key to leave, or the guard turns you back.</li>
              <li>Find a key in each of the three foreign kingdoms &mdash; brass, then silver, then gold. There is no key in your home kingdom.</li>
              <li>Never enter another kingdom&rsquo;s Citadel. Return home with all three keys, then storm your Dark Tower.</li>
              <li>The board snaps your pawn to a legal space. Then press its one matching action button (<b>Move</b>, <b>Tomb</b>, <b>Bazaar</b>, <b>Sanctuary</b>, <b>Frontier</b>, or <b>Tower</b>).</li>
            </ul>
            <button className="tp-act" style={{ marginTop: 16 }} onClick={() => setShowRules(false)}>Got it</button>
          </div>
        </div>
      )}

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
      <button onClick={() => setShowIntro(true)} className="ig-glass dt-help" aria-label="Open the Dark Tower help guide">
        <span className="q">?</span>Help
      </button>

      {/* guard the endgame Dark Tower press */}
      {confirmTower && (
        <div className="tp-overlay" onClick={() => setConfirmTower(false)}>
          <div className="ig-glass" style={{ maxWidth: 360, padding: '20px 22px', borderRadius: 16, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ font: '800 16px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Storm the Dark Tower</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, opacity: 0.9, marginBottom: 16 }}>
              Storm the tower, fight the full brigade. This is the final battle. Are you ready?
            </div>
            <button className="tp-act" style={{ background: PANEL_HEX.tower, color: '#fff', borderColor: 'rgba(0,0,0,0.3)' }}
              onClick={() => { setConfirmTower(false); act({ type: 'tower' }); }}>Storm the tower</button>
            <button className="tp-act" style={{ marginTop: 8 }} onClick={() => setConfirmTower(false)}>Not yet</button>
          </div>
        </div>
      )}

      {error && <div className="toast">{error}</div>}
    </div>
  );
}
