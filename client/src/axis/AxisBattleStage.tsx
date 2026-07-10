// TV battle stage: the assistant repo's cinematic 3D battle sim, driven by
// OUR battle engine's state. Expands across the middle of the screen while a
// combat resolves: the battlefield on the left, dice tray + scoreboard on
// the right, and an after-action report with the losses when it ends.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';
import {
  AXIS_MAP, POWERS, UNITS, CHINA_COLOR,
  type AxisView, type PowerKey, type UnitKey,
} from '@bge/shared';

function spaceName(id: string): string {
  const t = AXIS_MAP.territories.find((x) => x.id === id);
  if (t) return t.name;
  const z = AXIS_MAP.seaZones.find((x) => x.id === id);
  return z ? `Sea Zone ${z.n}` : id;
}
import BattleSim from './sim/BattleSim';
import { useAxisManifest } from './AxisScene';
import DiceBox from '@3d-dice/dice-box';
import type { SimUnit } from './sim/battlescene';

const powerHex = (p: PowerKey | 'china' | null) => (p == null ? '#888' : p === 'china' ? CHINA_COLOR : POWERS[p].color);
const powerName = (p: PowerKey | 'china' | null) => (p == null ? 'Neutral' : p === 'china' ? 'China' : POWERS[p].name);

type Battle = NonNullable<AxisView['combat']>['battle'];

// physical WASM dice (the assistant sim's dice-box), forced to the engine's
// exact values; the chip readout beneath stays the authoritative record
let diceBoxSingleton: { box: unknown; el: HTMLDivElement; ready: boolean } | null = null;
function makeDiceBox(): NonNullable<typeof diceBoxSingleton> {
  if (diceBoxSingleton) return diceBoxSingleton;
  const el = document.createElement('div');
  el.style.width = '100%';
  el.style.height = '100%';
  el.id = 'ax-dice-box';
  document.body.appendChild(el); // must be in the DOM for init
  const box = new DiceBox('#ax-dice-box', {
    assetPath: '/axis/dice-box/',
    theme: 'default',
    themeColor: '#c9a227',
    scale: 7,
    gravity: 1.4,
    throwForce: 6,
    lightIntensity: 1,
  });
  const single = { box, el, ready: false };
  diceBoxSingleton = single;
  (box as { init: () => Promise<void> }).init().then(() => { single.ready = true; }).catch(() => {});
  return single;
}

/** Warm the dice physics + WASM at TV boot so the first battle opens hot. */
export function warmDiceBox(): void {
  try {
    const s = makeDiceBox();
    s.el.style.visibility = 'hidden';
  } catch { /* dice are decoration */ }
}

export function diceBoxReady(): boolean {
  return diceBoxSingleton?.ready ?? false;
}

function DiceTray({ battle, salvo }: { battle: Battle; salvo: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const lastRolls = [...battle.log].reverse().find((e) => e.rolls.length > 0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const single = makeDiceBox();
    single.el.style.visibility = '';
    host.appendChild(single.el);
    return () => { document.body.appendChild(single.el); single.el.style.visibility = 'hidden'; };
  }, []);

  useEffect(() => {
    if (!lastRolls || salvo === 0 || !diceBoxSingleton) return;
    const values = lastRolls.rolls.map((r) => r.value);
    if (!values.length) return;
    const notation = `${values.length}d6@${values.join(',')}`;
    try {
      (diceBoxSingleton.box as { roll: (n: string) => void }).roll(notation);
    } catch { /* dice are decoration; the chips carry the result */ }
  }, [salvo]);

  return (
    <div className="ax-dice-tray">
      <div className="ig-lab">{lastRolls ? lastRolls.title : 'Waiting for the first roll'}</div>
      <div className="ax-dice-felt" ref={hostRef} />
      {lastRolls && (
        <div className="ax-dice-row">
          {lastRolls.rolls.map((r, i) => (
            <span key={i} className={`ax-die${r.hit ? ' hit' : ''}`} style={{ animationDelay: `${i * 0.06}s` }} title={`${UNITS[r.key].name}, hits on ${r.hitOn} or less`}>
              {r.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Running record of the fight: every volley and who it killed. */
function KillLog({ battle }: { battle: Battle }) {
  const events = battle.log.filter((e) => e.rolls.length > 0 || e.casualties.length > 0).slice(-6);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [battle.log.length]);
  if (events.length === 0) return null;
  return (
    <div className="ax-kill-log" ref={ref}>
      <div className="ig-lab">Battle record</div>
      {events.map((e, i) => {
        const hits = e.rolls.filter((r) => r.hit).length;
        const byKey = new Map<string, number>();
        for (const cas of e.casualties) byKey.set(`${cas.side}:${cas.key}`, (byKey.get(`${cas.side}:${cas.key}`) ?? 0) + 1);
        return (
          <div key={`${battle.log.indexOf(e)}-${i}`} className="ax-kill-row">
            <span className="ax-kill-title">
              {e.title}
              {e.rolls.length > 0 && <em>{hits}/{e.rolls.length} hit</em>}
            </span>
            {byKey.size > 0 && (
              <span className="ax-kill-cas">
                {[...byKey.entries()].map(([sk, n]) => {
                  const [side, key] = sk.split(':');
                  return <b key={sk} data-side={side}>{n} {UNITS[key as UnitKey].name}</b>;
                })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SideBoard({ battle, side, name, color }: { battle: Battle; side: 'attacker' | 'defender'; name: string; color: string }) {
  const units = battle[side];
  const alive = units.filter((u) => u.hp > 0);
  const dead = units.filter((u) => u.hp <= 0);
  const byKey = (list: typeof units) => {
    const m = new Map<UnitKey, number>();
    for (const u of list) m.set(u.key, (m.get(u.key) ?? 0) + 1);
    return [...m.entries()];
  };
  return (
    <div className="ax-sideboard">
      <div className="ax-sideboard-head" style={{ color }}>{name}</div>
      <div className="ax-sideboard-bar"><span style={{ width: `${(alive.length / Math.max(1, units.length)) * 100}%`, background: color }} /></div>
      <div className="ax-sideboard-units">
        {byKey(alive).map(([k, n]) => <span key={k}>{n} {UNITS[k].name}</span>)}
        {alive.length === 0 && <span style={{ opacity: 0.6 }}>Wiped out</span>}
      </div>
      {dead.length > 0 && (
        <div className="ax-sideboard-units lost">
          {byKey(dead).map(([k, n]) => <span key={k}>✕ {n} {UNITS[k].name}</span>)}
        </div>
      )}
    </div>
  );
}

export function AxisBattleStage({ view }: { view: AxisView }) {
  const c = view.combat!;
  const b = c.battle;
  const manifest = useAxisManifest();
  const railArt = (manifest as unknown as { boards?: { image?: string }[] } | null)?.boards?.[0]?.image ?? null;

  const simUnits: SimUnit[] = useMemo(
    () => [...b.attacker, ...b.defender].map((u) => ({ id: String(u.uid), type: u.key, side: u.side })),
    [c.id],
  );
  const destroyedIds = useMemo(
    () => [...b.attacker, ...b.defender].filter((u) => u.hp <= 0).map((u) => String(u.uid)),
    [b.attacker, b.defender, b.log.length],
  );
  const healthById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const u of [...b.attacker, ...b.defender]) out[String(u.uid)] = Math.max(0, u.hp / u.maxHp);
    return out;
  }, [b.attacker, b.defender, b.log.length]);

  // volleys: each roll event in the log advances the salvo; hitters fire
  const rollEvents = b.log.filter((e) => e.rolls.length > 0);
  const salvo = rollEvents.length;
  const firingIds = useMemo(() => {
    const last = rollEvents[rollEvents.length - 1];
    if (!last) return [];
    return last.rolls.filter((r) => r.hit && r.uid > 0).map((r) => String(r.uid));
  }, [salvo]);

  const domain = b.ctx.seaCombat ? 'sea' : 'land';
  const defenderPower = (b.defender[0]?.power ?? null) as PowerKey | 'china' | null;

  // the dice clatter on every new roll
  const diceAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (salvo === 0) return;
    if (!diceAudio.current) diceAudio.current = new Audio('/axis/sim/sounds/dice-roll.mp3');
    diceAudio.current.currentTime = 0;
    diceAudio.current.volume = 0.6;
    void diceAudio.current.play().catch(() => {});
  }, [salvo]);

  // the stage waits for its assets: battle models still streaming in (drei
  // loading manager) or the dice physics not yet initialized
  const { active: loadingModels } = useProgress();
  const [stageReady, setStageReady] = useState(false);
  useEffect(() => {
    if (stageReady) return;
    const t = setInterval(() => {
      if (!loadingModels && diceBoxReady()) { setStageReady(true); clearInterval(t); }
    }, 120);
    return () => clearInterval(t);
  }, [stageReady, loadingModels]);

  const over = Boolean(c.confirmed);
  const verdict =
    b.status === 'attacker_captured' ? `${powerName(c.attacker)} takes the field` :
    b.status === 'attacker_cleared' ? `${powerName(c.attacker)} clears the field` :
    b.status === 'defender_won' ? `${powerName(defenderPower)} holds` :
    b.status === 'retreated' ? `${powerName(c.attacker)} retreats` :
    b.status === 'standoff' ? 'Standoff' : 'Mutual destruction';
  const remaining = (side: 'attacker' | 'defender') => {
    const m = new Map<UnitKey, number>();
    for (const u of b[side]) if (u.hp > 0) m.set(u.key, (m.get(u.key) ?? 0) + 1);
    return [...m.entries()];
  };

  return (
    <div className="ax-stage">
      <div className="ax-stage-sim">
        <BattleSim
          units={simUnits}
          domain={domain}
          destroyedIds={destroyedIds}
          salvo={salvo}
          firingIds={firingIds}
          healthById={healthById}
          playSounds
          attackerName={POWERS[c.attacker].name}
          defenderName={powerName(defenderPower)}
        />
      </div>
      <div
        className="ax-stage-rail"
        style={railArt ? {
          backgroundImage: `linear-gradient(rgba(6,8,11,.9), rgba(6,8,11,.95)), url(${railArt})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        } : undefined}
      >
        <div className="ax-stage-title">
          <span className="ax-vs-name" style={{ color: powerHex(c.attacker) }}>{POWERS[c.attacker].name}</span>
          <span className="ax-vs-word">ATTACKS</span>
          <span className="ax-vs-name" style={{ color: powerHex(defenderPower) }}>{powerName(defenderPower)}</span>
        </div>
        <DiceTray battle={b} salvo={salvo} />
        <KillLog battle={b} />
        <SideBoard battle={b} side="attacker" name={POWERS[c.attacker].name} color={powerHex(c.attacker)} />
        <SideBoard battle={b} side="defender" name={powerName(defenderPower)} color={powerHex(defenderPower)} />
        {!over && b.decision && (
          <div className="ax-stage-waiting ig-glass">
            {b.decision.type === 'casualties' && `${b.decision.side === 'defender' ? powerName(defenderPower) : POWERS[c.attacker].name} is choosing casualties`}
            {b.decision.type === 'retreat' && `${POWERS[c.attacker].name} decides: press on or retreat`}
            {b.decision.type === 'submerge' && 'Submarines may submerge or strike'}
          </div>
        )}
      </div>
      {over && c.confirmed && (
        <div className="ax-battle-end">
          <div className="ax-battle-end-card">
            <div className="ig-lab">Battle over · {spaceName(c.space)}</div>
            <div className="ax-battle-end-verdict">{verdict}</div>
            {(['attacker', 'defender'] as const).map((side) => {
              const p = side === 'attacker' ? c.attacker : defenderPower;
              const units = remaining(side);
              return (
                <div key={side} className="ax-battle-end-side">
                  <span style={{ color: powerHex(p) }}>{powerName(p)}</span>
                  <span>{units.length ? units.map(([k, n]) => `${n} ${UNITS[k].name}`).join(', ') : 'wiped out'}</span>
                </div>
              );
            })}
            <div className="ax-battle-end-wait">
              {c.confirmed.attacker && c.confirmed.defender ? 'Continuing' : 'Both commanders press continue on their devices'}
            </div>
          </div>
        </div>
      )}
      {!stageReady && (
        <div className="ax-stage-curtain">
          <div className="ig-lab">Conduct combat</div>
          <h2>Preparing the battlefield</h2>
          <div className="ax-loading-bar"><span /></div>
        </div>
      )}
    </div>
  );
}

/** After a battle clears, hold the losses on screen for a beat. */
export function AfterAction({ view }: { view: AxisView }) {
  const last = view.lastBattle;
  const [shown, setShown] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!last || view.combat) return;
    setShown(last.seq);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), 7000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [last?.seq, view.combat]);
  if (!last || view.combat || shown !== last.seq) return null;

  const statusLine =
    last.status === 'attacker_captured' ? `${powerName(last.attacker)} takes the territory` :
    last.status === 'attacker_cleared' ? `${powerName(last.attacker)} clears the field but cannot hold it` :
    last.status === 'defender_won' ? `${powerName(last.defender)} holds` :
    last.status === 'retreated' ? `${powerName(last.attacker)} retreats` :
    last.status === 'standoff' ? 'Standoff' : 'Mutual destruction';

  const lossList = (losses: Partial<Record<UnitKey, number>>) =>
    Object.entries(losses).map(([k, n]) => `${n} ${UNITS[k as UnitKey].name}`).join(', ') || 'no losses';

  return (
    <div className="ax-afteraction ig-glass">
      <div className="ig-lab">Battle over</div>
      <div className="ax-afteraction-status">{statusLine}</div>
      <div className="ax-afteraction-row">
        <span style={{ color: powerHex(last.attacker) }}>{powerName(last.attacker)}</span>
        <span>lost {lossList(last.atkLost)}</span>
      </div>
      <div className="ax-afteraction-row">
        <span style={{ color: powerHex(last.defender) }}>{powerName(last.defender)}</span>
        <span>lost {lossList(last.defLost)}</span>
      </div>
    </div>
  );
}
