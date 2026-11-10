// Turns successive view.combat snapshots into an ordered list of presentation beats.
//
// Authoritative inputs, in this order:
//   1. battle.log      append-only. Every roll, casualty batch, submerge, drop and retreat is one entry,
//                      and roll entries carry per-die attribution (uid, hitOn, hit, targetUid).
//   2. unit hp / submerged / aboard, diffed between snapshots. The log names casualty types but not
//                      uids, so the exact units that fell come from the diff.
//   3. battle.status   for the result.
// The planner never waits on anything: if a snapshot is missed, arrives out of order, or the gap is
// too large to replay, it asks the stage to snap to the latest state and shows only the last roll.
import { volleyOf, type Volley } from './dice';
import {
  combatantName, controllerOf, defenderOf, other, plural, unitDomain,
  type Battle, type BattleEvent, type BattleUnit, type Combat, type Side,
} from './model';
import type { PowerKey } from '@bge/shared';

export interface UnitSnap {
  uid: number;
  key: string;
  side: Side;
  power: string;
  hp: number;
  maxHp: number;
  submerged: boolean;
  aboard: boolean;
}

export interface Snapshot {
  combatId: number;
  visualSeq: number;
  logLen: number;
  round: number;
  status: string;
  units: UnitSnap[];
}

export function snapshotOf(combat: Combat): Snapshot {
  const b = combat.battle;
  return {
    combatId: combat.id,
    visualSeq: combat.visualSeq ?? 0,
    logLen: b.log.length,
    round: b.round,
    status: b.status,
    units: [...b.attacker, ...b.defender].map((u) => ({
      uid: u.uid, key: u.key, side: u.side, power: u.power, hp: u.hp, maxHp: u.maxHp,
      submerged: u.submerged === true, aboard: u.aboard === true,
    })),
  };
}

export type Beat =
  | { type: 'open' }
  | { type: 'volley'; volley: Volley; firing: number[]; firingSide: Side | 'both'; targets: number[] }
  | { type: 'casualties'; side: Side; destroyed: number[]; damaged: number[]; text: string }
  | { type: 'submerge'; side: Side; uids: number[]; text: string }
  | { type: 'drop'; landed: number[]; text: string }
  | { type: 'retreat'; uids: number[]; partial: boolean; text: string }
  | { type: 'note'; text: string }
  | { type: 'result'; status: string };

export interface Plan {
  beats: Beat[];
  /** The stage must rebuild from the current state before (or instead of) playing beats. */
  snap: boolean;
  reason: 'first' | 'new-combat' | 'rewind' | 'overflow' | 'advance' | 'same';
}

const ROLL_KINDS = new Set(['aa_fire', 'sub_strike', 'bombardment', 'raid_damage', 'rocket_damage', 'attacker_fire', 'defender_fire']);

function countByKey(keys: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => `${n} ${plural(k, n)}`).join(', ');
}

function firingSideOf(event: BattleEvent, volley: Volley): Side | 'both' {
  if (event.kind === 'sub_strike') {
    const sides = new Set(volley.groups.map((g) => g.side));
    return sides.size > 1 ? 'both' : ([...sides][0] ?? 'attacker');
  }
  return volley.groups[0]?.side ?? event.side ?? 'attacker';
}

export function planBeats(prev: Snapshot | null, combat: Combat, opts: { maxBeats?: number } = {}): Plan {
  const maxBeats = opts.maxBeats ?? 8;
  const battle = combat.battle;
  const units = [...battle.attacker, ...battle.defender];
  if (!prev) return { beats: [{ type: 'open' }], snap: true, reason: 'first' };
  if (prev.combatId !== combat.id) return { beats: [{ type: 'open' }], snap: true, reason: 'new-combat' };
  if (battle.log.length < prev.logLen || (combat.visualSeq ?? 0) < prev.visualSeq) {
    return { beats: [], snap: true, reason: 'rewind' };
  }

  // ---- unit diff ----
  const before = new Map(prev.units.map((u) => [u.uid, u]));
  const nowIds = new Set(units.map((u) => u.uid));
  const destroyed: BattleUnit[] = [];
  const damaged: BattleUnit[] = [];
  const submerged: BattleUnit[] = [];
  const landed: BattleUnit[] = [];
  for (const u of units) {
    const was = before.get(u.uid);
    if (!was) continue;
    if (was.hp > 0 && u.hp <= 0) destroyed.push(u);
    else if (u.hp > 0 && u.hp < was.hp) damaged.push(u);
    if (!was.submerged && u.submerged === true && u.hp > 0) submerged.push(u);
    if (was.aboard && u.aboard !== true && u.hp > 0) landed.push(u);
  }
  const withdrawn = prev.units.filter((u) => u.hp > 0 && !nowIds.has(u.uid)).map((u) => u.uid);

  const takeDestroyed = (side: Side, keys: readonly string[]): number[] => {
    const out: number[] = [];
    for (const key of keys) {
      const i = destroyed.findIndex((u) => u.side === side && u.key === key);
      if (i >= 0) out.push(destroyed.splice(i, 1)[0].uid);
    }
    return out;
  };
  const takeSide = <T extends { side: Side; uid: number }>(pool: T[], side: Side): number[] => {
    const out: number[] = [];
    for (let i = pool.length - 1; i >= 0; i--) {
      if (pool[i].side === side) out.unshift(pool.splice(i, 1)[0].uid);
    }
    return out;
  };

  // ---- one beat per new log entry ----
  const beats: Beat[] = [];
  const events = battle.log.slice(prev.logLen);
  events.forEach((event, offset) => {
    const logIndex = prev.logLen + offset;
    if (event.rolls.length > 0 && ROLL_KINDS.has(event.kind)) {
      const volley = volleyOf(event, logIndex, units);
      const firing = [...new Set(event.rolls.map((r) => r.uid))].filter((uid) => uid > 0);
      const targets = event.rolls.filter((r) => r.hit && r.targetUid !== undefined).map((r) => r.targetUid!);
      beats.push({ type: 'volley', volley, firing, firingSide: firingSideOf(event, volley), targets });
      return;
    }
    if (event.kind === 'casualties' || event.kind === 'transports') {
      const side = (event.side ?? event.casualties[0]?.side ?? 'defender') as Side;
      const uids = takeDestroyed(side, event.casualties.map((c) => c.key));
      const text = event.kind === 'transports'
        ? `${countByKey(event.casualties.map((c) => c.key))} sunk undefended`
        : `${combatantName(event.casualties[0]?.power)} loses ${countByKey(event.casualties.map((c) => c.key))}`;
      beats.push({ type: 'casualties', side, destroyed: uids, damaged: [], text });
      return;
    }
    if (event.kind === 'submerge') {
      const side = (event.side ?? 'attacker') as Side;
      const uids = takeSide(submerged, side);
      beats.push({ type: 'submerge', side, uids, text: `${uids.length || ''} ${plural('submarine', uids.length || 2)} submerge`.trim() });
      return;
    }
    if (event.kind === 'paratrooper_drop') {
      beats.push({ type: 'drop', landed: landed.splice(0).map((u) => u.uid), text: event.title });
      return;
    }
    if (event.kind === 'retreat') {
      if (battle.status === 'retreated' && prev.status !== 'retreated' && offset === events.length - 1) {
        const uids = battle.attacker.filter((u) => u.hp > 0 && !u.submerged).map((u) => u.uid);
        beats.push({ type: 'retreat', uids, partial: false, text: `${combatantName(combat.attacker)} retreats` });
      } else if (withdrawn.length > 0 && /retreats/i.test(event.title)) {
        beats.push({ type: 'retreat', uids: withdrawn.splice(0), partial: true, text: 'Overland force withdraws' });
      } else {
        beats.push({ type: 'note', text: event.title });
      }
      return;
    }
    beats.push({ type: 'note', text: event.title });
  });

  // ---- anything the log did not name (battleship damage, skipped snapshots) ----
  for (const side of ['defender', 'attacker'] as Side[]) {
    const dead = takeSide(destroyed, side);
    const hurt = takeSide(damaged, side);
    if (dead.length === 0 && hurt.length === 0) continue;
    let target: Extract<Beat, { type: 'casualties' }> | null = null;
    for (let i = beats.length - 1; i >= 0; i--) {
      const b = beats[i];
      if (b.type === 'casualties' && b.side === side) { target = b; break; }
    }
    if (target) {
      target.destroyed.push(...dead);
      target.damaged.push(...hurt);
    } else {
      const text = dead.length > 0 ? `${dead.length} ${side} unit${dead.length === 1 ? '' : 's'} lost` : 'Battleship damaged';
      beats.push({ type: 'casualties', side, destroyed: dead, damaged: hurt, text });
    }
  }
  for (const side of ['attacker', 'defender'] as Side[]) {
    const uids = takeSide(submerged, side);
    if (uids.length > 0) beats.push({ type: 'submerge', side, uids, text: `${plural('submarine', uids.length)} submerge` });
  }
  if (landed.length > 0) beats.push({ type: 'drop', landed: landed.map((u) => u.uid), text: 'Paratroopers deploy' });
  if (withdrawn.length > 0) beats.push({ type: 'retreat', uids: withdrawn, partial: true, text: 'Overland force withdraws' });

  if (battle.status !== 'ongoing' && prev.status === 'ongoing') beats.push({ type: 'result', status: battle.status });

  if (beats.length === 0) return { beats, snap: false, reason: 'same' };
  if (beats.length > maxBeats) {
    // Too far behind to replay. Keep the latest roll so the dice are current, then the result.
    const kept: Beat[] = [];
    for (let i = beats.length - 1; i >= 0; i--) {
      if (beats[i].type === 'volley') { kept.push(beats[i]); break; }
    }
    const last = beats[beats.length - 1];
    if (last.type === 'result') kept.push(last);
    return { beats: kept, snap: true, reason: 'overflow' };
  }
  return { beats, snap: false, reason: 'advance' };
}

// ---------- hits waiting on a casualty choice ----------

export interface PendingHits {
  /** The side that must take the hits. */
  side: Side;
  hits: number;
  /** True when a player is choosing right now; false when the hits land at the end of the round. */
  choosing: boolean;
}

/** Hits that have been rolled but whose casualties are not yet removed. */
export function pendingHits(battle: Battle): PendingHits[] {
  if (battle.status !== 'ongoing') return [];
  const out: PendingHits[] = [];
  const decision = battle.decision;
  if (decision?.type === 'casualties') out.push({ side: decision.side, hits: decision.picks, choosing: true });
  const tally: Record<Side, number> = { attacker: 0, defender: 0 };
  for (let i = battle.log.length - 1; i >= 0; i--) {
    const e = battle.log[i];
    if (e.round !== battle.round) break;
    if (e.kind === 'attacker_fire' || e.kind === 'bombardment') tally.defender += e.hits;
    else if (e.kind === 'defender_fire') tally.attacker += e.hits;
    else break;
  }
  for (const side of ['defender', 'attacker'] as Side[]) {
    if (tally[side] > 0 && !out.some((p) => p.side === side)) out.push({ side, hits: tally[side], choosing: false });
  }
  return out;
}

// ---------- one line of status ----------

const STEP_LABEL: Record<string, string> = {
  aa_fire: 'antiaircraft fire',
  sub_strike: 'the submarine strike',
  bombardment: 'the shore bombardment',
  raid_damage: 'bombing damage',
  rocket_damage: 'rocket damage',
  attacker_fire: 'the attack',
  defender_fire: 'the defence',
};

export interface StageStatus {
  /** Whose move it is, or null when the battle is over and nobody is owed anything. */
  waitingOn: PowerKey | null;
  line: string;
  step: string | null;
}

export function stageStatus(combat: Combat, active: PowerKey | null): StageStatus {
  const b = combat.battle;
  const nameOf = (p: PowerKey | null) => (p ? combatantName(p) : 'the commander');
  if (b.status !== 'ongoing') {
    const owed: string[] = [];
    if (combat.confirmed && !combat.confirmed.attacker) owed.push(combatantName(combat.attacker));
    if (combat.confirmed && !combat.confirmed.defender) owed.push(combatantName(defenderOf(b)));
    return {
      waitingOn: null,
      step: null,
      line: owed.length ? `Waiting for ${owed.join(' and ')} to continue` : 'Battle over',
    };
  }
  const d = b.decision;
  if (d) {
    const sidePower = d.type === 'retreat' || d.side === 'attacker' ? combat.attacker : defenderOf(b);
    const who = controllerOf(sidePower);
    const label = combatantName(sidePower);
    if (d.type === 'casualties') {
      return { waitingOn: who, step: 'casualties', line: `${label} is choosing ${d.picks} ${d.picks === 1 ? 'casualty' : 'casualties'}` };
    }
    if (d.type === 'submerge') return { waitingOn: who, step: 'submerge', line: `${label} decides whether to submerge` };
    return { waitingOn: who, step: 'retreat', line: `${label} decides whether to press the attack` };
  }
  const step = b.steps[b.stepIndex] ?? null;
  const roller = active ?? controllerOf(combat.attacker);
  return {
    waitingOn: roller,
    step,
    line: `Waiting for ${nameOf(roller)} to roll ${STEP_LABEL[step ?? ''] ?? 'the next volley'}`,
  };
}

/** Heading for the device roll card, from the engine's current step. */
export function nextRollTitle(combat: Combat): string {
  const step = combat.battle.steps[combat.battle.stepIndex];
  switch (step) {
    case 'aa_fire': return 'Roll antiaircraft fire';
    case 'sub_strike': return 'Roll the submarine strike';
    case 'bombardment': return 'Roll the shore bombardment';
    case 'raid_damage': return 'Roll bombing damage';
    case 'rocket_damage': return 'Roll rocket damage';
    case 'defender_fire': return 'Roll the defending fire';
    default: return 'Roll the attack';
  }
}

export type Terrain = 'sea' | 'land' | 'shore';
export function terrainOf(combat: Combat): Terrain {
  if (combat.battle.ctx.seaCombat || combat.space.startsWith('sz-')) return 'sea';
  if (combat.amphibious || combat.battle.ctx.amphibious) return 'shore';
  return 'land';
}

export const isAirKey = (key: string) => unitDomain(key) === 'air';
export { other };
