// TV view for Axis & Allies Anniversary · the full world map in 3D with the
// mod's unit meshes, camera flights onto every action, a battle panel while
// combats resolve, and the production screen after every nation's turn.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AXIS_MAP, POWERS, UNITS, WIN_CONDITIONS, CHINA_COLOR,
  type AxisView, type PowerKey, type UnitKey,
} from '@bge/shared';
import { AxisTable, useAxisManifest, useSceneReady, SPACE_CENTER, px2r, type FocusTarget, type StagedStack } from './AxisScene';
import { AxisBattleStage, AfterAction } from './AxisBattleStage';
import { playSfx } from '../sfx';

const PHASE_LABEL: Record<string, string> = {
  rnd: 'Research & Development',
  purchase: 'Purchase Units',
  combatMove: 'Combat Move',
  battle: 'Conduct Combat',
  noncombat: 'Noncombat Move',
  mobilize: 'Mobilize New Units',
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

// ---------- battle panel ----------

function BattlePanel({ view, art }: { view: AxisView; art?: string }) {
  const c = view.combat!;
  const b = c.battle;
  const count = (side: 'attacker' | 'defender') => {
    const units = b[side].filter((u) => u.hp > 0);
    const byKey = new Map<string, number>();
    for (const u of units) byKey.set(u.key, (byKey.get(u.key) ?? 0) + 1);
    return [...byKey.entries()];
  };
  const lastRolls = [...b.log].reverse().find((e) => e.rolls.length > 0);
  return (
    <div
      className="ig-glass"
      style={{
        position: 'absolute', right: '1rem', top: '4.6rem', width: 330, zIndex: 8, borderRadius: 14, padding: '0.9rem 1rem',
        backgroundImage: art
          ? `linear-gradient(rgba(6,8,12,.88), rgba(6,8,12,.94)), url(${art})`
          : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}
    >
      <div className="ig-lab">Battle · {spaceName(c.space)}{b.ctx.amphibious ? ' · amphibious' : ''}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '.55rem 0 .3rem' }}>
        <span style={{ color: powerHex(c.attacker), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{POWERS[c.attacker].short} attacks</span>
        <span className="ig-num" style={{ opacity: 0.7 }}>Round {b.round}</span>
      </div>
      {(['attacker', 'defender'] as const).map((side) => (
        <div key={side} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '.3rem 0', borderTop: side === 'defender' ? '1px solid var(--brd)' : 'none' }}>
          <span className="ig-lab" style={{ width: '100%' }}>{side}</span>
          {count(side).map(([k, n]) => (
            <span key={k} style={{ fontSize: 12.5, background: 'rgba(255,255,255,.06)', borderRadius: 6, padding: '2px 8px' }}>
              {n} {UNITS[k as UnitKey].name}
            </span>
          ))}
          {count(side).length === 0 && <span style={{ fontSize: 12.5, opacity: 0.6 }}>Wiped out</span>}
        </div>
      ))}
      {lastRolls && (
        <div style={{ borderTop: '1px solid var(--brd)', paddingTop: '.45rem', marginTop: '.2rem' }}>
          <div className="ig-lab">{lastRolls.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
            {lastRolls.rolls.map((r, i) => (
              <span key={i} style={{
                width: 26, height: 26, borderRadius: 6, display: 'grid', placeItems: 'center',
                fontWeight: 700, fontSize: 14,
                background: r.hit ? 'rgba(123,224,163,.18)' : 'rgba(255,255,255,.05)',
                border: `1px solid ${r.hit ? '#7be0a3' : 'var(--brd-2)'}`,
                color: r.hit ? '#7be0a3' : 'inherit',
              }}>{r.value}</span>
            ))}
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 5 }}>{lastRolls.text}</div>
        </div>
      )}
      {b.decision && (
        <div style={{ borderTop: '1px solid var(--brd)', paddingTop: '.45rem', marginTop: '.3rem', fontSize: 12.5, color: '#e8b450' }}>
          {b.decision.type === 'casualties' && 'Waiting on casualty picks.'}
          {b.decision.type === 'retreat' && 'Attacker decides: press on or retreat.'}
          {b.decision.type === 'submerge' && 'Submarines may submerge.'}
        </div>
      )}
    </div>
  );
}

// ---------- production screen (after every turn) ----------

function ProductionScreen({ view, art }: { view: AxisView; art?: string }) {
  const order = view.turnOrder;
  const active = view.active;
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
          <span style={{ color: powerHex(active), textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 13 }}>
            {POWERS[active].name} collected {view.powers[active].lastIncome} IPCs
          </span>
        </div>
        {order.map((p) => {
          const pw = view.powers[p];
          const max = Math.max(...order.map((q) => view.powers[q].production), 1);
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.4rem 0' }}>
              <span style={{ width: 110, textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 12.5, color: powerHex(p), fontWeight: 700 }}>
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
          The active player continues from their device.
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

export default function AxisBoard({ view }: { view: AxisView }) {
  const manifest = useAxisManifest();
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
  const lastSpaced = [...view.log].reverse().find((e) => e.space)?.space ?? null;
  const lastLen = view.log.length;
  useEffect(() => {
    if (camPin) return;
    const target = combatSpace ?? lastSpaced;
    if (target && SPACE_CENTER[target]) {
      const c = SPACE_CENTER[target];
      const [x, z] = px2r(c[0], c[1]);
      setFocus({ x, z, dist: combatSpace ? 14 : 20 });
      if (combatSpace) playSfx('link');
    }
  }, [combatSpace, lastSpaced, lastLen]);
  useEffect(() => {
    if (camPin) return;
    // new power's turn: pull back to the whole map
    setFocus({ x: (9500 / 2) * 0.01, z: -(4956 / 2) * 0.01, dist: 62 });
  }, [view.active, camPin]);

  // voice turn changes and the win
  const prevActive = useRef(view.active);
  useEffect(() => {
    if (prevActive.current !== view.active) { prevActive.current = view.active; playSfx('turn'); }
  }, [view.active]);
  const won = useRef(false);
  useEffect(() => { if (view.winner && !won.current) { won.current = true; playSfx('win'); } }, [view.winner]);

  const lastLog = view.log[view.log.length - 1];
  const active = POWERS[view.active];

  const vcLine = useMemo(
    () => `Axis ${view.vc.axis} · Allies ${view.vc.allies} of ${view.vc.goal}`,
    [view.vc.axis, view.vc.allies, view.vc.goal],
  );

  const staged: StagedStack[] = useMemo(() => {
    const out: StagedStack[] = [];
    for (const p of view.turnOrder) {
      for (const [key, count] of Object.entries(view.powers[p].staging)) {
        if (count) out.push({ power: p, key: key as never, count: count as number });
      }
    }
    return out;
  }, [view.powers]);

  if (!manifest) return <AxisLoading label="Reading the mod" />;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#04060a', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <AxisTable manifest={manifest} board={view.board} control={view.control} focus={focus} staged={staged} />
      </div>
      <LoadingCurtain />
      <Announcements view={view} />

      {/* top-left: scenario + phase */}
      <div className="ig-glass ig-era">
        <div className="ig-lab">Axis & Allies · {view.options.scenario} · Round {view.round}</div>
        <div className="ig-era-v" style={{ color: active.color }}>{active.name}</div>
        <div className="ig-era-rule" />
        <div style={{ fontSize: 12.5, marginTop: 5, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.8 }}>
          {PHASE_LABEL[view.phase]}
        </div>
      </div>

      {/* top-right: power chips */}
      <div className="ig-scores">
        {view.turnOrder.map((p) => (
          <div
            key={p}
            className={`ig-chip ig-glass${p === view.active ? ' on' : ''}`}
            style={{ ['--seat' as never]: powerHex(p) }}
          >
            <span className="nm" style={{ color: powerHex(p) }}>{POWERS[p].short}</span>
            <span className="mn ig-num">{view.powers[p].ipcs}</span>
          </div>
        ))}
      </div>

      {/* bottom banner: last event + VC race */}
      <div className="ig-glass ig-banner" style={{ minWidth: 420 }}>
        <div className="ig-banner-head">
          <b style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 13 }}>
            {lastLog?.text ?? `${active.name} is up.`}
          </b>
        </div>
        <div className="ig-banner-foot">
          <span className="ig-lab">{WIN_CONDITIONS[view.options.winCondition].label}</span>
          <span className="ig-num" style={{ fontSize: 12.5 }}>{vcLine}</span>
        </div>
      </div>

      {view.combat && <AxisBattleStage view={view} />}
      <AfterAction view={view} />
      {view.phase === 'income' && !view.winner && (
        <ProductionScreen view={view} art={(manifest as { boards?: { image?: string }[] }).boards?.[1]?.image ?? undefined} />
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


// full-screen loading screen until the map texture and unit meshes are in
export function AxisLoading({ label, overlay }: { label: string; overlay?: boolean }) {
  return (
    <div className="ax-loading" style={overlay ? { position: 'absolute', inset: 0, zIndex: 60 } : undefined}>
      <div className="ig-lab">Axis & Allies Anniversary</div>
      <h2>{label}</h2>
      <div className="ax-loading-bar"><span /></div>
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
