// Interface pieces shared by the TV theater and the device command screen: dice, force cards,
// the loss feed and the result card. All of them render straight from engine state, so they are
// always current even when the 3D stage is behind, loading, or not available at all.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { UnitKey } from '@bge/shared';
import UnitIcon from '../UnitIcon';
import { PIPS, volleyResultLine, type DiceGroup, type Volley } from './dice';
import {
  combatantInk, combatantName, defenderOf, forceRows, orderOf, outcomeLine, plural, spaceName, unitName,
  type Battle, type BattleEvent, type Combat, type LastBattle, type Side,
} from './model';
import type { PendingHits } from './timeline';

export const seat = (power: string | null | undefined) => ({ '--seat': combatantInk(power) } as CSSProperties);

// ---------- dice ----------

const TUMBLE_MS = 620;
const STAGGER_MS = 34;
const SETTLE_CAP_MS = 1500;

/**
 * Milliseconds since this volley appeared, advancing only while dice are still tumbling.
 * Purely a function of time since the volley key changed, so it cannot stall: a volley that arrives
 * late, twice, or while the tab is hidden simply reports itself settled.
 */
function useTumble(key: string | null, dice: number, animate: boolean): number {
  const [elapsed, setElapsed] = useState<number>(Infinity);
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // The volley already on the table when the screen opens is history: show it settled.
    const fresh = seen.current !== undefined && seen.current !== key;
    seen.current = key;
    if (!key || !animate || !fresh || typeof document === 'undefined' || document.hidden) { setElapsed(Infinity); return; }
    const total = Math.min(SETTLE_CAP_MS, TUMBLE_MS + dice * STAGGER_MS) + 60;
    const start = performance.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      const now = performance.now() - start;
      if (now >= total || document.hidden) { setElapsed(Infinity); window.clearInterval(id); } else setElapsed(now);
    }, 70);
    return () => window.clearInterval(id);
  }, [key, dice, animate]);
  return elapsed;
}

function DieFace({ value, tone, rolling }: { value: number; tone: 'hit' | 'miss' | 'damage' | 'discarded' | 'rolling'; rolling: boolean }) {
  const pips = PIPS[value] ?? PIPS[1];
  return (
    <span className={`axb-die ${tone}${rolling ? ' tumble' : ''}`} role="img" aria-label={`${value}${tone === 'hit' ? ', hit' : tone === 'discarded' ? ', not kept' : ''}`}>
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={pips.includes(i) ? 'on' : ''} />)}
    </span>
  );
}

function DiceGroupView({ group, metric, elapsed, offset, total }: { group: DiceGroup; metric: Volley['metric']; elapsed: number; offset: number; total: number }) {
  const stagger = Math.min(STAGGER_MS, (SETTLE_CAP_MS - TUMBLE_MS) / Math.max(1, total));
  const settledAll = elapsed >= TUMBLE_MS + (offset + group.dice.length) * stagger;
  return (
    <div className="axb-dgroup">
      <div className="axb-dgroup-head">
        <UnitIcon unitKey={group.key} size={22} title={unitName(group.key)} />
        <span>{group.label}</span>
        {metric === 'hits' && <b className={`ig-num${settledAll && group.hits > 0 ? ' lit' : ''}`}>{settledAll ? group.hits : ''}</b>}
      </div>
      <div className="axb-dice">
        {group.dice.map((die, i) => {
          const rolling = elapsed < TUMBLE_MS + (offset + i) * stagger;
          // while tumbling, show a face that changes with time; then the engine's exact value
          const face = rolling ? 1 + ((Math.floor(elapsed / 70) * 7 + (offset + i) * 5) % 6) : die.value;
          const tone = rolling ? 'rolling' : die.discarded ? 'discarded' : metric === 'damage' ? 'damage' : die.hit ? 'hit' : 'miss';
          return <DieFace key={i} value={face} tone={tone} rolling={rolling} />;
        })}
      </div>
    </div>
  );
}

/** The latest roll, grouped by unit type with the number each needed. */
export function DiceStrip({ volley, combatId, animate = true, onRoll }: { volley: Volley | null; combatId: number; animate?: boolean; onRoll?: () => void }) {
  const key = volley ? `${combatId}:${volley.logIndex}` : null;
  const elapsed = useTumble(key, volley?.dice ?? 0, animate);
  const rolled = useRef<string | null>(null);
  useEffect(() => {
    if (key && elapsed === 0 && rolled.current !== key) { rolled.current = key; onRoll?.(); }
  }, [key, elapsed, onRoll]);
  const offsets = useMemo(() => {
    let n = 0;
    return (volley?.groups ?? []).map((g) => { const at = n; n += g.dice.length; return at; });
  }, [volley]);
  if (!volley) return null;
  const settled = elapsed === Infinity;
  const sides: Side[] = ['attacker', 'defender'];
  return (
    <div className="axb-volley" aria-live="polite">
      <div className="axb-volley-head">
        <span className="ig-lab">{volley.title}</span>
        <b className={`ig-num${settled ? ' lit' : ''}`}>{settled ? volleyResultLine(volley) : 'Rolling'}</b>
      </div>
      <div className="axb-volley-groups">
        {sides.map((side) => {
          const groups = volley.groups.filter((g) => g.side === side);
          if (groups.length === 0) return null;
          return groups.map((g) => (
            <DiceGroupView key={g.id} group={g} metric={volley.metric} elapsed={elapsed} offset={offsets[volley.groups.indexOf(g)]} total={volley.dice} />
          ));
        })}
      </div>
    </div>
  );
}

// ---------- forces ----------

export function ForceCard({ side, power, units, pending, compact = false }: {
  side: Side;
  power: string | null;
  units: Battle['attacker'];
  pending?: PendingHits | null;
  compact?: boolean;
}) {
  const rows = forceRows(units);
  const standing = rows.reduce((n, r) => n + r.alive, 0);
  const lost = rows.reduce((n, r) => n + r.lost, 0);
  const powers = [...new Set(units.map((u) => u.power))];
  return (
    <section className={`axb-force ig-glass ${side}${compact ? ' compact' : ''}`} style={seat(power)} aria-label={`${side} force`}>
      <header>
        <span className="axb-ring" />
        <div>
          <small className="ig-lab">{side === 'attacker' ? 'Attacker' : 'Defender'}</small>
          <b>{powers.length > 1 ? powers.map((p) => combatantName(p)).join(' and ') : combatantName(power)}</b>
        </div>
        <div className="axb-force-count">
          <b className="ig-num">{standing}</b>
          {lost > 0 && <small className="ig-num">{lost} lost</small>}
        </div>
      </header>
      <ul>
        {rows.map((r) => (
          <li key={r.key} className={r.alive === 0 ? 'out' : ''}>
            <UnitIcon unitKey={r.key} size={compact ? 22 : 26} title={unitName(r.key)} />
            <b className="ig-num">{r.alive}</b>
            <span>
              {plural(r.key, r.alive)}
              {r.damaged > 0 && <em>{r.damaged} damaged</em>}
              {r.submerged > 0 && <em>{r.submerged} submerged</em>}
            </span>
            {r.lost > 0 && <i className="ig-num">{`−${r.lost}`}</i>}
          </li>
        ))}
        {rows.length === 0 && <li className="out"><span>No units</span></li>}
      </ul>
      {pending && pending.hits > 0 && (
        <footer>
          {pending.hits} {pending.hits === 1 ? 'hit' : 'hits'}, {pending.choosing ? 'choosing casualties' : 'casualties come after the return fire'}
        </footer>
      )}
    </section>
  );
}

// ---------- loss feed ----------

export interface FeedLine { id: string; side: Side; power: string; text: string }

/** The last few losses, newest last, read from the battle log. */
export function feedLines(log: readonly BattleEvent[], max = 4): FeedLine[] {
  const out: FeedLine[] = [];
  for (let i = log.length - 1; i >= 0 && out.length < max; i--) {
    const e = log[i];
    if (e.casualties.length === 0) {
      if (e.kind === 'submerge' || e.kind === 'retreat' || e.kind === 'paratrooper_drop') {
        out.unshift({ id: `${i}`, side: (e.side ?? 'attacker') as Side, power: '', text: e.title });
      }
      continue;
    }
    const counts = new Map<string, number>();
    for (const c of e.casualties) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
    const list = [...counts.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0])).map(([k, n]) => `${n} ${plural(k, n)}`).join(', ');
    const first = e.casualties[0];
    out.unshift({ id: `${i}`, side: first.side, power: first.power, text: `${combatantName(first.power)} loses ${list}` });
  }
  return out;
}

export function LossFeed({ log }: { log: readonly BattleEvent[] }) {
  const lines = feedLines(log);
  if (lines.length === 0) return null;
  return (
    <ol className="axb-feed" aria-label="Losses">
      {lines.map((l) => <li key={l.id} className="ig-glass" style={seat(l.power || null)}>{l.text}</li>)}
    </ol>
  );
}

// ---------- result ----------

export interface ResultModel {
  kicker: string;
  headline: string;
  note: string | null;
  attacker: string;
  defender: string | null;
  atkLost: [UnitKey, number][];
  defLost: [UnitKey, number][];
  /** Powers that still have to press continue. */
  owed: string[];
}

const lostOf = (units: Battle['attacker']): [UnitKey, number][] =>
  forceRows(units).filter((r) => r.lost > 0).map((r) => [r.key, r.lost]);
const sortLost = (lost: Partial<Record<UnitKey, number>>): [UnitKey, number][] =>
  (Object.entries(lost) as [UnitKey, number][]).filter(([, n]) => n > 0).sort((a, b) => orderOf(a[0]) - orderOf(b[0]));

export function resultFromCombat(combat: Combat): ResultModel {
  const b = combat.battle;
  const defender = defenderOf(b);
  const owed: string[] = [];
  if (combat.confirmed && !combat.confirmed.attacker) owed.push(combatantName(combat.attacker));
  if (combat.confirmed && !combat.confirmed.defender) owed.push(combatantName(defender));
  if (combat.kind === 'strategicRaid') {
    const through = b.attacker.filter((u) => u.key === 'bomber' && u.hp > 0).length;
    const down = b.attacker.filter((u) => u.key === 'bomber' && u.hp <= 0).length;
    const applied = combat.raid?.appliedDamage ?? 0;
    const raw = combat.raid?.rawDamage ?? applied;
    return {
      kicker: 'Strategic bombing raid',
      headline: `${applied} damage to ${spaceName(combat.space)}`,
      note: `${through} ${plural('bomber', through)} through, ${down} shot down. ${raw > applied ? `Rolled ${raw}, the complex can take no more. ` : ''}Damage now ${(combat.raid?.damageBefore ?? 0) + applied} of ${combat.raid?.cap ?? 0}.`,
      attacker: combat.attacker, defender, atkLost: lostOf(b.attacker), defLost: [], owed,
    };
  }
  if (combat.kind === 'rocketStrike') {
    const applied = combat.rocket?.appliedDamage ?? 0;
    const roll = combat.rocket?.roll ?? applied;
    return {
      kicker: 'Rocket strike',
      headline: `${applied} damage to ${spaceName(combat.space)}`,
      note: `Launched from ${spaceName(combat.rocket?.source)}. ${roll > applied ? `Rolled ${roll}, the complex can take no more. ` : ''}Damage now ${(combat.rocket?.damageBefore ?? 0) + applied} of ${combat.rocket?.cap ?? 0}.`,
      attacker: combat.attacker, defender, atkLost: [], defLost: [], owed,
    };
  }
  const withdrew = combat.retreatTo !== undefined && b.status !== 'retreated'
    ? (typeof combat.retreatTo === 'string' ? `The overland force withdrew to ${spaceName(combat.retreatTo)}.` : 'The aircraft broke off.')
    : null;
  return {
    kicker: `Battle of ${spaceName(combat.space)}`,
    headline: outcomeLine(b.status, combat.attacker, combat.space, combat.retreatTo),
    note: withdrew,
    attacker: combat.attacker, defender, atkLost: lostOf(b.attacker), defLost: lostOf(b.defender), owed,
  };
}

export function resultFromLast(last: LastBattle): ResultModel {
  return {
    kicker: `Battle of ${spaceName(last.space)}`,
    headline: outcomeLine(last.status, last.attacker, last.space, last.retreatTo),
    note: null,
    attacker: last.attacker,
    defender: last.defender,
    atkLost: sortLost(last.atkLost),
    defLost: sortLost(last.defLost),
    owed: [],
  };
}

function LostList({ power, lost }: { power: string | null; lost: [UnitKey, number][] }) {
  return (
    <div className="axb-lost" style={seat(power)}>
      <header><span className="axb-ring" /><b>{combatantName(power)}</b></header>
      {lost.length === 0 ? <p>No losses</p> : (
        <ul>
          {lost.map(([key, n]) => (
            <li key={key}><UnitIcon unitKey={key} size={24} title={unitName(key)} /><b className="ig-num">{n}</b><span>{plural(key, n)}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ResultCard({ result, children }: { result: ResultModel; children?: ReactNode }) {
  return (
    <section className="axb-result ig-glass" aria-live="polite">
      <small className="ig-lab">{result.kicker}</small>
      <h2>{result.headline}</h2>
      {result.note && <p className="axb-result-note">{result.note}</p>}
      {(result.atkLost.length > 0 || result.defLost.length > 0 || result.defender) && (
        <div className="axb-result-losses">
          <LostList power={result.attacker} lost={result.atkLost} />
          {result.defender && <LostList power={result.defender} lost={result.defLost} />}
        </div>
      )}
      {children}
      {!children && result.owed.length > 0 && <p className="axb-result-wait">Waiting for {result.owed.join(' and ')} to continue</p>}
    </section>
  );
}

export function battleKicker(combat: Combat): string {
  if (combat.kind === 'strategicRaid') return 'Strategic bombing raid';
  if (combat.kind === 'rocketStrike') return 'Rocket strike';
  if (combat.battle.ctx.seaCombat) return 'Naval battle';
  if (combat.amphibious || combat.battle.ctx.amphibious) return 'Amphibious assault';
  return 'Battle';
}
