// Dice presentation. The battle log is the only source of dice: every roll event carries one
// RollDetail per die with the unit that rolled it, the number it needed and the engine's verdict.
// (view.combat.dice is never filled by the reducer view, so it is ignored.)
import { orderOf, plural, type BattleEvent, type BattleUnit, type RollDetail, type Side } from './model';

export interface Die {
  value: number;
  hit: boolean;
  /** A heavy bomber die that was rolled but not kept. */
  discarded: boolean;
  uid: number;
  targetUid?: number;
}

export interface DiceGroup {
  id: string;
  side: Side;
  key: string;
  hitOn: number;
  /** "Tanks hit on 3 or less" */
  label: string;
  dice: Die[];
  hits: number;
}

export interface Volley {
  /** Index of the roll event in the battle log; stable for the life of the combat. */
  logIndex: number;
  kind: BattleEvent['kind'];
  round: number;
  title: string;
  metric: 'hits' | 'damage';
  groups: DiceGroup[];
  /** Hits, or the damage total when the metric is damage. */
  total: number;
  hitsBySide: Record<Side, number>;
  dice: number;
}

const TITLES: Partial<Record<BattleEvent['kind'], string>> = {
  aa_fire: 'Antiaircraft fire',
  sub_strike: 'Submarine surprise strike',
  bombardment: 'Shore bombardment',
  raid_damage: 'Bombing damage',
  rocket_damage: 'Rocket damage',
  attacker_fire: 'Attacker fires',
  defender_fire: 'Defender fires',
};

export function hitLabel(key: string, count: number, hitOn: number, metric: 'hits' | 'damage'): string {
  const name = plural(key, count);
  if (metric === 'damage') return `${name}, damage is the number rolled`;
  if (hitOn <= 0) return `${name} cannot hit`;
  if (hitOn >= 6) return `${name} always hit`;
  const verb = count === 1 && name !== 'Infantry' && name !== 'Artillery' ? 'hits' : 'hit';
  return hitOn === 1 ? `${name} ${verb} on 1` : `${name} ${verb} on ${hitOn} or less`;
}

function sideOfRoll(event: BattleEvent, roll: RollDetail, sides: ReadonlyMap<number, Side>): Side {
  if (event.kind === 'aa_fire') return 'defender';
  if (event.kind === 'attacker_fire' || event.kind === 'bombardment'
    || event.kind === 'raid_damage' || event.kind === 'rocket_damage') return 'attacker';
  if (event.kind === 'defender_fire') return 'defender';
  return sides.get(roll.uid) ?? event.side ?? 'attacker';
}

/** Group one roll event's dice by side, unit type and the number needed. */
export function volleyOf(event: BattleEvent, logIndex: number, units: readonly BattleUnit[]): Volley {
  const sides = new Map<number, Side>(units.map((u) => [u.uid, u.side]));
  const metric = event.metric === 'damage' ? 'damage' : 'hits';
  const groups = new Map<string, DiceGroup>();
  const hitsBySide: Record<Side, number> = { attacker: 0, defender: 0 };
  let damage = 0;
  for (const roll of event.rolls) {
    const side = sideOfRoll(event, roll, sides);
    const id = `${side}:${roll.key}:${roll.hitOn}`;
    let group = groups.get(id);
    if (!group) {
      group = { id, side, key: roll.key, hitOn: roll.hitOn, label: '', dice: [], hits: 0 };
      groups.set(id, group);
    }
    const discarded = roll.selected === false;
    const value = Math.min(6, Math.max(1, Math.round(roll.value) || 1));
    group.dice.push({
      value, hit: roll.hit, discarded, uid: roll.uid,
      ...(roll.targetUid !== undefined ? { targetUid: roll.targetUid } : {}),
    });
    if (roll.hit) { group.hits += 1; hitsBySide[side] += 1; }
    if (metric === 'damage' && !discarded) damage += value;
  }
  const list = [...groups.values()].sort((a, b) =>
    (a.side === b.side ? 0 : a.side === 'attacker' ? -1 : 1) || orderOf(a.key) - orderOf(b.key) || a.hitOn - b.hitOn);
  for (const g of list) {
    // Count shooters, not dice: a heavy bomber rolls two dice for one aircraft.
    const shooters = g.key === 'aaGun' ? 1 : new Set(g.dice.map((d) => d.uid)).size;
    g.label = hitLabel(g.key, Math.max(1, shooters), g.hitOn, metric);
  }
  return {
    logIndex,
    kind: event.kind,
    round: event.round,
    title: TITLES[event.kind] ?? event.title,
    metric,
    groups: list,
    total: metric === 'damage' ? damage : hitsBySide.attacker + hitsBySide.defender,
    hitsBySide,
    dice: event.rolls.length,
  };
}

/** The most recent roll in the log, or null before the first roll. */
export function lastVolley(log: readonly BattleEvent[], units: readonly BattleUnit[]): Volley | null {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].rolls.length > 0) return volleyOf(log[i], i, units);
  }
  return null;
}

export function volleyResultLine(v: Volley): string {
  if (v.metric === 'damage') return `${v.total} damage`;
  if (v.kind === 'sub_strike' && v.hitsBySide.attacker > 0 && v.hitsBySide.defender > 0) {
    return `${v.hitsBySide.attacker} and ${v.hitsBySide.defender} hits`;
  }
  if (v.total === 0) return 'No hits';
  return v.total === 1 ? '1 hit' : `${v.total} hits`;
}

/** Pip positions on a 3x3 grid (0..8) for a die face. */
export const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
