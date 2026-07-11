// TV view for Axis & Allies Anniversary · the full world map in 3D with the
// mod's unit meshes, camera flights onto every action, a battle panel while
// combats resolve, and the production screen after every nation's turn.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AXIS_MAP, POWERS, WIN_CONDITIONS, CHINA_COLOR,
  type AxisView, type PowerKey,
} from '@bge/shared';
import { AxisTable, useAxisManifest, useSceneReady, SPACE_CENTER, px2r, type FocusTarget, type StagedStack } from './AxisScene';
import { AxisBattleStage, AfterAction, releaseDiceBox, warmDiceBox, warmPreferredBattleRenderer } from './AxisBattleStage';
import { warmBattleAssets } from './sim/BattleSim';
import { AxisLoading } from './AxisLoading';
import { powerTextColor } from './axisColors';
import { axisCapitalTurnPresentation } from './axisCapitalPresentation';
import { playSfx } from '../sfx';

const PHASE_LABEL: Record<string, string> = {
  rnd: 'Research & Development',
  purchase: 'Purchase Units',
  combatMove: 'Combat Move',
  battle: 'Conduct Combat',
  noncombat: 'Noncombat Move',
  mobilize: 'Mobilize & Collect Income',
  income: 'Collect Income',
  gameOver: 'Game Over',
};
const powerHex = (p: PowerKey | 'china') => (p === 'china' ? CHINA_COLOR : POWERS[p].color);

function spaceName(id: string): string {
  const t = AXIS_MAP.territories.find((x) => x.id === id);
  if (t) return t.name;
  const z = AXIS_MAP.seaZones.find((x) => x.id === id);
  return z ? `Sea Zone ${z.n}` : id;
}

// ---------- production screen (after every turn) ----------

function ProductionScreen({ view, art, collected }: { view: AxisView; art?: string; collected: PowerKey }) {
  const order = view.turnOrder;
  const active = collected;
  return (
    <div className="ig-modal" style={{ zIndex: 25 }}>
      <div
        className="ig-glass ig-modal-card"
        style={{
          width: 'min(640px, 94vw)',
          backgroundImage: art ? `linear-gradient(rgba(6,8,12,.9), rgba(6,8,12,.95)), url(${art})` : undefined,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }}
      >
        <div className="ig-modal-head">
          <b>National Production</b>
          <span style={{ color: powerTextColor(active), textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 13 }}>
            {POWERS[active].name} collected {view.powers[active].lastIncome} IPCs
          </span>
        </div>
        {order.map((p) => {
          const pw = view.powers[p];
          const max = Math.max(...order.map((q) => view.powers[q].production), 1);
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.4rem 0' }}>
              <span style={{ width: 110, textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 12.5, color: powerTextColor(p), fontWeight: 700 }}>
                {POWERS[p].name}
              </span>
              <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
                <div style={{ width: `${(pw.production / max) * 100}%`, height: '100%', background: powerHex(p), opacity: 0.85 }} />
              </div>
              <span className="ig-num" style={{ width: 42, textAlign: 'right' }}>{pw.production}</span>
              <span className="ig-num" style={{ width: 72, textAlign: 'right', opacity: 0.7 }}>{pw.ipcs} IPC</span>
            </div>
          );
        })}
        <div style={{ marginTop: '.9rem', fontSize: 12.5, opacity: 0.65 }}>
          {POWERS[view.active].name} is up next.
        </div>
      </div>
    </div>
  );
}

// ---------- center-screen announcements ----------

function Announcements({ view }: { view: AxisView }) {
  const [current, setCurrent] = useState<{ text: string; power: PowerKey | null } | null>(null);
  const queue = useRef<{ text: string; power: PowerKey | null }[]>([]);
  const seen = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fresh = view.log.slice(seen.current === 0 ? -1 : Math.max(0, view.log.length - (view.log.length - seen.current)));
    if (seen.current === 0) { seen.current = view.log.length; return; } // skip history on join
    if (view.log.length > seen.current) {
      for (const e of view.log.slice(view.log.length - (view.log.length - seen.current))) {
        queue.current.push({ text: e.text, power: e.power });
      }
      seen.current = view.log.length;
    }
    void fresh;
    const pump = () => {
      if (timer.current || queue.current.length === 0) return;
      const next = queue.current.shift()!;
      setCurrent(next);
      timer.current = setTimeout(() => {
        timer.current = null;
        setCurrent(null);
        setTimeout(pump, 250);
      }, 3800);
    };
    pump();
  }, [view.log.length]);

  if (!current) return null;
  const tint = current.power ? powerHex(current.power) : '#e8b450';
  return (
    <div className="ax-announce">
      <div className="ax-announce-card" style={{ ['--tint' as never]: tint }}>
        <span className="ax-announce-rule" />
        {current.power && <div className="ax-announce-power">{POWERS[current.power].name}</div>}
        <div className="ax-announce-text">{current.text}</div>
        <span className="ax-announce-rule" />
      </div>
    </div>
  );
}

// ---------- main board ----------

export default function AxisBoard({
  view,
  onBattleVisualReady,
}: {
  view: AxisView;
  onBattleVisualReady: (combatId: number, ready: boolean, visualSeq: number) => void;
}) {
  const manifest = useAxisManifest();
  const mapSceneReady = useSceneReady();
  const [focus, setFocus] = useState<FocusTarget | null>(null);

  // ?cam=px,py,dist pins the camera to an art-pixel spot (verification shots)
  const camPin = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get('cam');
    if (!q) return null;
    const [px, py, dist] = q.split(',').map(Number);
    const [x, z] = px2r(px, py);
    return { x, z, dist: dist || 20 } as FocusTarget;
  }, []);
  useEffect(() => { if (camPin) setFocus(camPin); }, [camPin]);

  // fly to battles as they open; otherwise follow the latest logged action
  // (attack declarations, blitzes, captures); widen out on turn changes
  const combatSpace = view.combat?.space ?? null;
  const emergencyLandingSpace = view.defendingCarrierLanding?.progress.ok
    && view.defendingCarrierLanding.progress.status === 'decision'
    ? view.defendingCarrierLanding.progress.decision.fighter.originSeaZone
    : null;
  const emergencyLandingOwner = view.defendingCarrierLanding?.progress.ok
    && view.defendingCarrierLanding.progress.status === 'decision'
    ? view.defendingCarrierLanding.progress.decision.owner
    : null;
  const lastSpaced = [...view.log].reverse().find((e) => e.space)?.space ?? null;
  const lastLen = view.log.length;
  useEffect(() => {
    if (camPin) return;
    const target = combatSpace ?? emergencyLandingSpace ?? lastSpaced;
    if (target && SPACE_CENTER[target]) {
      const c = SPACE_CENTER[target];
      const [x, z] = px2r(c[0], c[1]);
      setFocus({ x, z, dist: combatSpace ? 14 : emergencyLandingSpace ? 18 : 20 });
      if (combatSpace) playSfx('link');
    }
  }, [combatSpace, emergencyLandingSpace, lastSpaced, lastLen]);
  useEffect(() => {
    if (camPin) return;
    // new power's turn: pull back to the whole map
    setFocus({ x: (9500 / 2) * 0.01, z: -(4956 / 2) * 0.01, dist: 62 });
  }, [view.active, camPin]);

  // The TV has one WebGL budget. In either direction, unmount the outgoing
  // renderer and wait briefly before mounting the next so its GPU resources
  // have been released. A timer is intentional: TV tabs may be backgrounded,
  // where requestAnimationFrame is suspended and would strand the battle UI.
  const combatId = view.combat?.id ?? null;
  const [battleStageVisible, setBattleStageVisible] = useState(false);
  const [mapVisible, setMapVisible] = useState(combatId == null);
  useEffect(() => {
    setMapVisible(false);
    setBattleStageVisible(false);
    const settleTimer = setTimeout(() => {
      if (combatId == null) setMapVisible(true);
      else setBattleStageVisible(true);
    }, 160);
    return () => clearTimeout(settleTimer);
  }, [combatId]);

  // The cinematic dice initialize while the map is being played so the first
  // battle normally arrives hot. A failed warm-up remains recoverable from the
  // battle's blocking retry curtain.
  useEffect(() => {
    void warmDiceBox().catch(() => {});
    void warmPreferredBattleRenderer().catch(() => {});
    return releaseDiceBox;
  }, []);
  useEffect(() => {
    if (!mapSceneReady) return;
    const timer = window.setTimeout(warmBattleAssets, 1500);
    return () => window.clearTimeout(timer);
  }, [mapSceneReady]);

  // voice turn changes and the win; hold the production screen on screen for
  // a beat after every turn (mobilize + income are one merged stage now)
  const prevActive = useRef(view.active);
  const [prodShow, setProdShow] = useState<PowerKey | null>(null);
  useEffect(() => {
    if (prevActive.current !== view.active) {
      const finished = prevActive.current;
      prevActive.current = view.active;
      playSfx('turn');
      setProdShow(finished);
      const t = setTimeout(() => setProdShow(null), 8000);
      return () => clearTimeout(t);
    }
  }, [view.active]);
  const won = useRef(false);
  useEffect(() => { if (view.winner && !won.current) { won.current = true; playSfx('win'); } }, [view.winner]);

  const lastLog = view.log[view.log.length - 1];
  const active = POWERS[view.active];
  const capital = axisCapitalTurnPresentation(view);

  const vcLine = useMemo(
    () => `Axis ${view.vc.axis} · Allies ${view.vc.allies} of ${view.vc.goal}`,
    [view.vc.axis, view.vc.allies, view.vc.goal],
  );

  const staged: StagedStack[] = useMemo(() => {
    const out: StagedStack[] = [];
    for (const p of view.turnOrder) {
      if (p === view.active && view.turnStartedCapitalOccupied) continue;
      for (const [key, count] of Object.entries(view.powers[p].staging)) {
        if (count) out.push({ power: p, key: key as never, count: count as number });
      }
    }
    return out;
  }, [view.powers, view.active, view.turnStartedCapitalOccupied]);

  const phaseOrder = view.options.rnd
    ? ['rnd', 'purchase', 'combatMove', 'noncombat', 'mobilize']
    : ['purchase', 'combatMove', 'noncombat', 'mobilize'];
  const phaseIndex = phaseOrder.indexOf(view.phase === 'battle' ? 'combatMove' : view.phase);
  const phaseProgress = phaseIndex >= 0 ? `Phase ${phaseIndex + 1} / ${phaseOrder.length}` : 'Campaign';
  const nestedOperation = emergencyLandingOwner
    ? `${POWERS[emergencyLandingOwner].name} fighter decision`
    : view.active === 'usa'
      && (view.phase === 'combatMove' || view.phase === 'battle' || view.phase === 'noncombat')
      ? view.operatingPower
        ? `${view.operatingPower === 'china' ? 'China' : 'United States'} operations · ${view.usaOperationIndex + 1}/2`
        : 'USA + China · choosing operation order'
      : null;
  const displayedPhase = view.defendingCarrierLanding
    ? 'Emergency Carrier Landing'
    : view.phase === 'mobilize' && capital.mobilize
    ? capital.mobilize.title
    : PHASE_LABEL[view.phase];

  if (!manifest) return <AxisLoading label="Reading the mod" />;

  return (
    <div className={`ax-tv${capital.banner ? ' capital-turn' : ''}`}>
      <div className={`ax-tv-scene${view.combat ? ' suspended' : ''}`}>
        {!view.combat && mapVisible && <AxisTable manifest={manifest} board={view.board} control={view.control} focus={focus} staged={staged} />}
        {view.combat && (
          <div className="ax-tv-battle-backdrop" aria-hidden>
            <span>Combat operations</span>
          </div>
        )}
      </div>
      {!view.combat && <LoadingCurtain />}
      <Announcements view={view} />

      <header className="ax-tv-hud" aria-label="Game status">
        <section className="ax-tv-turn">
          <div className="ax-tv-kicker">Axis & Allies · {view.options.scenario} · Round {view.round}</div>
          <div className="ax-tv-turn-row">
            <span className="ax-power-dot" style={{ background: active.color }} aria-hidden />
            <div>
              <b style={{ color: powerTextColor(view.active) }}>{active.name} turn</b>
              <span>{displayedPhase}{nestedOperation ? ` · ${nestedOperation}` : ''}</span>
            </div>
            <em>{phaseProgress}</em>
          </div>
          {capital.banner && (
            <div className={`ax-capital-alert tv ${capital.banner.tone}`} role="status" aria-live="polite">
              <b>{capital.banner.title}</b>
              <span>{capital.banner.detail}</span>
            </div>
          )}
        </section>
        <section className="ax-tv-powers" aria-label="Power treasuries">
          {view.turnOrder.map((p) => (
            <div key={p} className={`ax-tv-power${p === view.active ? ' active' : ''}`} style={{ ['--seat' as never]: powerHex(p) }} aria-label={`${POWERS[p].name}: ${view.powers[p].ipcs} IPCs`}>
              <span style={{ color: powerTextColor(p) }}>{POWERS[p].short}</span>
              <b className="ig-num">{view.powers[p].ipcs}</b>
              <small>IPC</small>
            </div>
          ))}
        </section>
      </header>

      <footer className="ax-tv-feed" aria-live="polite">
        <div className="ax-tv-event"><small>Latest order</small><b>{lastLog?.text ?? `${active.name} is up.`}</b></div>
        <div className="ax-tv-victory">
          <span><small>Axis cities</small><b className="ig-num">{view.vc.axis}</b></span>
          <div><small>{WIN_CONDITIONS[view.options.winCondition].label}</small><strong>{view.vc.goal} to win</strong></div>
          <span><small>Allied cities</small><b className="ig-num">{view.vc.allies}</b></span>
        </div>
      </footer>

      {view.combat && battleStageVisible && (
        <AxisBattleStage
          key={String(view.combat.id)}
          view={view}
          onBattleVisualReady={onBattleVisualReady}
        />
      )}
      <AfterAction view={view} />
      {prodShow && !view.winner && !view.combat && (
        <ProductionScreen view={view} collected={prodShow} art={(manifest as { boards?: { image?: string }[] }).boards?.[1]?.image ?? undefined} />
      )}

      {view.winner && (
        <div className="ig-modal" style={{ zIndex: 30 }}>
          <div className="ig-glass ig-modal-card" style={{ textAlign: 'center' }}>
            <div className="ig-lab">Victory</div>
            <h2 style={{ margin: '.5rem 0' }}>{view.winner === 'axis' ? 'The Axis' : 'The Allies'} win</h2>
            <div style={{ opacity: 0.75, fontSize: 13 }}>{vcLine}</div>
          </div>
        </div>
      )}
    </div>
  );
}


function LoadingCurtain() {
  const ready = useSceneReady();
  if (ready) return null;
  return (
    <div className="ax-loading" style={{ position: 'absolute', inset: 0, zIndex: 60 }}>
      <div className="ig-lab">Axis & Allies Anniversary</div>
      <h2>Setting up the table</h2>
      <div className="ax-loading-bar"><span /></div>
    </div>
  );
}
