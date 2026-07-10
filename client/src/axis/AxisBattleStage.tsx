// TV battle stage: the assistant repo's cinematic 3D battle sim, driven by
// OUR battle engine's state. Expands across the middle of the screen while a
// combat resolves: the battlefield on the left, dice tray + scoreboard on
// the right, and an after-action report with the losses when it ends.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  POWERS, UNITS, CHINA_COLOR,
  type AxisView, type PowerKey, type UnitKey,
} from '@bge/shared';
import BattleSim from './sim/BattleSim';
import type { SimUnit } from './sim/battlescene';

const powerHex = (p: PowerKey | 'china' | null) => (p == null ? '#888' : p === 'china' ? CHINA_COLOR : POWERS[p].color);
const powerName = (p: PowerKey | 'china' | null) => (p == null ? 'Neutral' : p === 'china' ? 'China' : POWERS[p].name);

type Battle = NonNullable<AxisView['combat']>['battle'];

function DiceTray({ battle }: { battle: Battle }) {
  const lastRolls = [...battle.log].reverse().find((e) => e.rolls.length > 0);
  if (!lastRolls) {
    return <div className="ax-dice-tray"><span className="ig-lab">Waiting for the first roll</span></div>;
  }
  return (
    <div className="ax-dice-tray">
      <div className="ig-lab">{lastRolls.title}</div>
      <div className="ax-dice-row">
        {lastRolls.rolls.map((r, i) => (
          <span key={i} className={`ax-die${r.hit ? ' hit' : ''}`} style={{ animationDelay: `${i * 0.06}s` }}>
            <b>{r.value}</b>
            <em>{UNITS[r.key].name.slice(0, 3)}·{r.hitOn}</em>
          </span>
        ))}
      </div>
      <div className="ax-dice-text">{lastRolls.text}</div>
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
      <div className="ax-stage-rail">
        <div className="ax-stage-title">
          <span style={{ color: powerHex(c.attacker) }}>{POWERS[c.attacker].name}</span>
          <em>attacks</em>
          <span style={{ color: powerHex(defenderPower) }}>{powerName(defenderPower)}</span>
        </div>
        <DiceTray battle={b} />
        <SideBoard battle={b} side="attacker" name={POWERS[c.attacker].name} color={powerHex(c.attacker)} />
        <SideBoard battle={b} side="defender" name={powerName(defenderPower)} color={powerHex(defenderPower)} />
        {b.decision && (
          <div className="ax-stage-waiting ig-glass">
            {b.decision.type === 'casualties' && `${b.decision.side === 'defender' ? powerName(defenderPower) : POWERS[c.attacker].name} is choosing casualties`}
            {b.decision.type === 'retreat' && `${POWERS[c.attacker].name} decides: press on or retreat`}
            {b.decision.type === 'submerge' && 'Submarines may submerge or strike'}
          </div>
        )}
      </div>
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
