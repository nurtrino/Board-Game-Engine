// Axis & Allies Anniversary — general combat, one dice step at a time.
// Modeled on the owner's assistant-tool battle engine (scratchpad lift,
// battle.ts) but upgraded to the full rulebook: real casualty PICKS instead
// of cheapest-first (owner decision: the defender plays for real), per-source
// hit constraints (sub hits only sink ships; air can't hit subs without a
// friendly destroyer), transports chosen last + defenseless-transport sweep,
// battleship two-hit damage, sub submerge decisions, AA first round only,
// amphibious bombardment (casualties fire back), and tech modifiers (jets,
// super subs, radar, heavy bombers, advanced artillery).
//
// The module is pure and self-contained per BattleState: dice values are
// injected (the game engine draws them from its seeded stream), and every
// choice is surfaced as state.decision, which the caller routes to the right
// seat's pending queue. Deferred work (the other side's casualties, the end
// of the round) lives in state.queue/state.afterQueue — never module globals.

import { UNITS, type TechKey, type UnitKey } from './config.js';

export type Side = 'attacker' | 'defender';

export interface BattleUnit {
  uid: number;
  key: UnitKey;
  side: Side;
  power: string; // owning power (multinational defense; china)
  hp: number;
  maxHp: number;
  submerged?: boolean;
}

export type Stack = Partial<Record<UnitKey, number>>;

export interface SideSpec {
  units: { key: UnitKey; power: string; count: number }[];
  techs?: TechKey[];
}

export interface BattleContext {
  amphibious: boolean; // enables round-1 bombardment
  seaCombat: boolean; // sea-zone battle (sub/transport rules active)
}

export type StepKind =
  | 'aa_fire'
  | 'sub_strike'
  | 'bombardment'
  | 'attacker_fire'
  | 'defender_fire'
  | 'casualties';

export type BattleStatus =
  | 'ongoing'
  | 'attacker_captured'
  | 'attacker_cleared' // defender wiped, but no land unit to hold the space
  | 'defender_won'
  | 'mutual'
  | 'retreated'
  | 'standoff'; // neither side can score a hit (e.g. transports vs transports)

export interface RollDetail { key: UnitKey; value: number; hitOn: number; hit: boolean; uid: number }

// Hits are bucketed by what scored them, because assignment rules differ:
// AA hits only fell aircraft; sub hits only sink sea units; air hits can't
// touch subs unless the firing side has a destroyer present.
export type HitSource = 'sub' | 'air' | 'aa' | 'bombard' | 'other';
export interface HitBucket { source: HitSource; hits: number }

export interface BattleEvent {
  round: number;
  kind: StepKind | 'submerge' | 'transports' | 'retreat';
  side?: Side;
  title: string;
  text: string;
  rolls: RollDetail[];
  hits: number;
  casualties: { key: UnitKey; side: Side; power: string }[];
}

export interface CasualtyBucket { source: HitSource; hits: number; eligible: number[] }

// A queued lump of hits one side must absorb. `fireBack: false` = removed
// before they can fire (AA, surprise strike); round-fire casualties are
// applied simultaneously so fire-back is inherent in the step order.
export interface CasualtyTask { side: Side; buckets: HitBucket[]; }

export type BattleDecision =
  | { type: 'submerge'; side: Side; subs: number[] } // uids that may duck out
  | { type: 'casualties'; side: Side; picks: number; buckets: CasualtyBucket[] }
  | { type: 'retreat'; side: 'attacker' };

export interface BattleState {
  attacker: BattleUnit[];
  defender: BattleUnit[];
  round: number;
  ctx: BattleContext;
  atkTechs: TechKey[];
  defTechs: TechKey[];
  log: BattleEvent[];
  status: BattleStatus;
  steps: StepKind[];
  stepIndex: number;
  pendingOnDefender: HitBucket[]; // round-fire hits awaiting the casualties step
  pendingOnAttacker: HitBucket[];
  aaFired: boolean;
  bombarded: boolean;
  decision: BattleDecision | null;
  queue: CasualtyTask[]; // casualty tasks being worked through
  afterQueue: 'advance' | 'endRound' | null; // what happens when queue drains
}

const isAir = (k: UnitKey) => UNITS[k].domain === 'air';
const isSea = (k: UnitKey) => UNITS[k].domain === 'sea';
const isLand = (k: UnitKey) => UNITS[k].domain === 'land';
const alive = (us: BattleUnit[]) => us.filter((u) => u.hp > 0);
const fights = (u: BattleUnit) => u.hp > 0 && !u.submerged && u.key !== 'aaGun' && u.key !== 'factory' && u.key !== 'transport';

const sideUnits = (s: BattleState, side: Side) => (side === 'attacker' ? s.attacker : s.defender);
const hasDestroyer = (us: BattleUnit[]) => alive(us).some((u) => u.key === 'destroyer');
const hasTech = (s: BattleState, side: Side, t: TechKey) => (side === 'attacker' ? s.atkTechs : s.defTechs).includes(t);

export function createBattle(atk: SideSpec, def: SideSpec, ctx: BattleContext): BattleState {
  let uid = 1;
  const build = (spec: SideSpec, side: Side): BattleUnit[] => {
    const out: BattleUnit[] = [];
    for (const u of spec.units) {
      for (let i = 0; i < u.count; i++) {
        out.push({ uid: uid++, key: u.key, side, power: u.power, hp: UNITS[u.key].hits, maxHp: UNITS[u.key].hits });
      }
    }
    return out;
  };
  const s: BattleState = {
    attacker: build(atk, 'attacker'),
    defender: build(def, 'defender'),
    round: 1,
    ctx,
    atkTechs: atk.techs ?? [],
    defTechs: def.techs ?? [],
    log: [],
    status: 'ongoing',
    steps: [],
    stepIndex: 0,
    pendingOnDefender: [],
    pendingOnAttacker: [],
    aaFired: false,
    bombarded: false,
    decision: null,
    queue: [],
    afterQueue: null,
  };
  s.steps = roundSteps(s);
  sweepTransports(s);
  evaluateStatus(s);
  skipEmptySteps(s);
  return s;
}

function subsEligibleForSurprise(s: BattleState, side: Side): BattleUnit[] {
  const enemy = sideUnits(s, side === 'attacker' ? 'defender' : 'attacker');
  if (hasDestroyer(enemy)) return [];
  return alive(sideUnits(s, side)).filter((u) => u.key === 'submarine' && !u.submerged);
}

function roundSteps(s: BattleState): StepKind[] {
  const steps: StepKind[] = [];
  const defenderHasAA = alive(s.defender).some((u) => u.key === 'aaGun');
  const attackerHasAir = alive(s.attacker).some((u) => isAir(u.key));
  if (!s.aaFired && defenderHasAA && attackerHasAir && !s.ctx.seaCombat) steps.push('aa_fire');
  if (s.ctx.seaCombat && (subsEligibleForSurprise(s, 'attacker').length || subsEligibleForSurprise(s, 'defender').length)) {
    steps.push('sub_strike');
  }
  if (!s.bombarded && s.ctx.amphibious && alive(s.attacker).some((u) => u.key === 'battleship' || u.key === 'cruiser')) {
    steps.push('bombardment');
  }
  steps.push('attacker_fire', 'defender_fire', 'casualties');
  return steps;
}

// ---------- dice ----------

export interface DieSpec { uid: number; key: UnitKey; hitOn: number; source: HitSource }

function fireDice(s: BattleState, side: Side): DieSpec[] {
  const own = sideUnits(s, side);
  const surprise = s.ctx.seaCombat && subsEligibleForSurprise(s, side).length > 0;
  const firers = alive(own).filter((u) => {
    if (!fights(u)) return false;
    // In a land battle, accompanying ships only bombard — they never fire in
    // general combat and cannot be hit (they are offshore).
    if (!s.ctx.seaCombat && isSea(u.key)) return false;
    if (u.key === 'submarine' && surprise) return false; // fired in the surprise step
    return true;
  });
  const dice: DieSpec[] = [];
  if (side === 'attacker') {
    const perArt = hasTech(s, 'attacker', 'advancedArtillery') ? 2 : 1;
    let boosts = firers.filter((u) => u.key === 'artillery').length * perArt;
    for (const u of firers) {
      let hitOn = UNITS[u.key].attack;
      if (u.key === 'fighter' && hasTech(s, 'attacker', 'jetFighters')) hitOn = 4;
      if (u.key === 'submarine' && hasTech(s, 'attacker', 'superSubs')) hitOn = 3;
      if (u.key === 'infantry' && boosts > 0) { boosts -= 1; hitOn = 2; }
      if (hitOn <= 0) continue;
      const source: HitSource = isAir(u.key) ? 'air' : u.key === 'submarine' ? 'sub' : 'other';
      const n = u.key === 'bomber' && hasTech(s, 'attacker', 'heavyBombers') ? 2 : 1;
      for (let i = 0; i < n; i++) dice.push({ uid: u.uid, key: u.key, hitOn, source });
    }
  } else {
    for (const u of firers) {
      const hitOn = UNITS[u.key].defense;
      if (hitOn <= 0) continue;
      const source: HitSource = isAir(u.key) ? 'air' : u.key === 'submarine' ? 'sub' : 'other';
      dice.push({ uid: u.uid, key: u.key, hitOn, source });
    }
  }
  return dice;
}

function subStrikeDice(s: BattleState, side: Side): DieSpec[] {
  const hitOn = side === 'attacker' ? (hasTech(s, 'attacker', 'superSubs') ? 3 : 2) : 1;
  return subsEligibleForSurprise(s, side).map((u) => ({ uid: u.uid, key: u.key, hitOn, source: 'sub' as const }));
}

function aaDice(s: BattleState): DieSpec[] {
  const air = alive(s.attacker).filter((u) => isAir(u.key)).length;
  const hitOn = hasTech(s, 'defender', 'radar') ? 2 : 1;
  return Array.from({ length: air }, () => ({ uid: 0, key: 'aaGun' as UnitKey, hitOn, source: 'aa' as const }));
}

function bombardDice(s: BattleState): DieSpec[] {
  return alive(s.attacker)
    .filter((u) => u.key === 'battleship' || u.key === 'cruiser')
    .map((u) => ({ uid: u.uid, key: u.key, hitOn: UNITS[u.key].attack, source: 'bombard' as const }));
}

export function stepDice(s: BattleState, kind: StepKind): DieSpec[] {
  switch (kind) {
    case 'aa_fire': return aaDice(s);
    case 'sub_strike': return [...subStrikeDice(s, 'attacker'), ...subStrikeDice(s, 'defender')];
    case 'bombardment': return bombardDice(s);
    case 'attacker_fire': return fireDice(s, 'attacker');
    case 'defender_fire': return fireDice(s, 'defender');
    default: return [];
  }
}

export function currentStep(s: BattleState): StepKind | null {
  if (s.status !== 'ongoing' || s.decision) return null;
  return s.steps[s.stepIndex] ?? null;
}

// ---------- casualty eligibility ----------

// Which of `side`'s units may absorb a hit from `source`? A unit with hp>1
// (an undamaged battleship) is eligible even though picking it only damages it.
export function eligibleFor(s: BattleState, side: Side, source: HitSource): BattleUnit[] {
  const units = sideUnits(s, side);
  const firing = sideUnits(s, side === 'attacker' ? 'defender' : 'attacker');
  let pool = alive(units).filter((u) => (fights(u) || u.key === 'transport') && !u.submerged);
  if (!s.ctx.seaCombat) pool = pool.filter((u) => !isSea(u.key)); // ships stay offshore
  if (source === 'aa') pool = pool.filter((u) => isAir(u.key));
  if (source === 'sub') pool = pool.filter((u) => isSea(u.key));
  if (source === 'air' && !hasDestroyer(firing)) pool = pool.filter((u) => u.key !== 'submarine');
  if (source === 'bombard') pool = pool.filter((u) => !isSea(u.key));
  // transports are chosen last: eligible only when nothing else is
  const nonTp = pool.filter((u) => u.key !== 'transport');
  return nonTp.length > 0 ? nonTp : pool;
}

// A real choice exists when the eligible pool is mixed and not everything dies.
function needsChoice(s: BattleState, task: CasualtyTask): boolean {
  for (const b of task.buckets) {
    if (b.hits <= 0) continue;
    const pool = eligibleFor(s, task.side, b.source);
    if (b.hits >= pool.reduce((n, u) => n + u.hp, 0)) continue; // all dead anyway
    const kinds = new Set(pool.map((u) => `${u.key}:${u.hp}`));
    if (kinds.size > 1) return true;
  }
  return false;
}

// Cheapest-first (battleship damage soaks first) — bots and no-choice cases.
function autoAssign(s: BattleState, task: CasualtyTask): void {
  const removed: BattleEvent['casualties'] = [];
  for (const b of task.buckets) {
    for (let h = 0; h < b.hits; h++) {
      const pool = eligibleFor(s, task.side, b.source).sort((a, c) => {
        if ((a.hp > 1) !== (c.hp > 1)) return a.hp > 1 ? -1 : 1;
        return UNITS[a.key].cost - UNITS[c.key].cost;
      });
      const pick = pool[0];
      if (!pick) break;
      pick.hp -= 1;
      if (pick.hp <= 0) removed.push({ key: pick.key, side: task.side, power: pick.power });
    }
  }
  if (removed.length) {
    s.log.push({ round: s.round, kind: 'casualties', side: task.side, title: 'Casualties', text: `${removed.length} ${task.side} unit(s) removed.`, rolls: [], hits: removed.length, casualties: removed });
  }
}

// ---------- the pump: work the casualty queue, then the after-action ----------

function pump(s: BattleState): void {
  while (s.status === 'ongoing' && !s.decision) {
    const task = s.queue[0];
    if (task) {
      const total = task.buckets.reduce((n, b) => n + b.hits, 0);
      if (total === 0) { s.queue.shift(); continue; }
      if (needsChoice(s, task)) {
        s.decision = {
          type: 'casualties',
          side: task.side,
          picks: total,
          buckets: task.buckets.map((b) => ({ ...b, eligible: eligibleFor(s, task.side, b.source).map((u) => u.uid) })),
        };
        return;
      }
      autoAssign(s, task);
      s.queue.shift();
      sweepTransports(s);
      evaluateStatus(s);
      continue;
    }
    // queue drained
    const after = s.afterQueue;
    s.afterQueue = null;
    if (after === 'endRound') { endRound(s); return; }
    if (after === 'advance') { advanceStep(s); continue; }
    return;
  }
}

function advanceStep(s: BattleState): void {
  s.stepIndex += 1;
  skipEmptySteps(s);
  if (currentStep(s) === 'casualties') beginRoundCasualties(s);
}

function skipEmptySteps(s: BattleState): void {
  let guard = 0;
  while (s.status === 'ongoing' && !s.decision && guard++ < 20) {
    const kind = s.steps[s.stepIndex];
    if (!kind || kind === 'casualties') break;
    if (stepDice(s, kind).length > 0) break;
    s.stepIndex += 1;
  }
}

function beginRoundCasualties(s: BattleState): void {
  // Simultaneous fire: both sides' hits were accumulated; both sides now take
  // losses. Defender assigns first (rulebook step order), attacker second —
  // but removal is simultaneous because hits were already locked in.
  const def: CasualtyTask = { side: 'defender', buckets: s.pendingOnDefender };
  const atk: CasualtyTask = { side: 'attacker', buckets: s.pendingOnAttacker };
  s.pendingOnDefender = [];
  s.pendingOnAttacker = [];
  s.queue.push(def, atk);
  s.afterQueue = 'endRound';
  pump(s);
}

function endRound(s: BattleState): void {
  sweepTransports(s);
  evaluateStatus(s);
  if (s.status !== 'ongoing') return;
  // Standoff: both sides alive but neither can LAND a hit on the other —
  // transports vs transports, or bombers vs subs (air can't hit subs without
  // a destroyer, subs can't hit air). The rulebook lets the attacker remain
  // or leave; either way the battle is over.
  const canHurt = (side: Side): boolean => {
    const enemy: Side = side === 'attacker' ? 'defender' : 'attacker';
    const sources = new Set([...fireDice(s, side), ...subStrikeDice(s, side)].map((d) => d.source));
    for (const source of sources) {
      if (eligibleFor(s, enemy, source).length > 0) return true;
    }
    return false;
  };
  if (!canHurt('attacker') && !canHurt('defender')) {
    s.status = 'standoff';
    s.log.push({ round: s.round, kind: 'retreat', title: 'Standoff', text: 'Neither side can score a hit; the battle ends.', rolls: [], hits: 0, casualties: [] });
    return;
  }
  s.decision = { type: 'retreat', side: 'attacker' };
}

// ---------- public API ----------

/**
 * Resolve the current dice step with injected d6 values (one per stepDice()
 * die, in order). AA and surprise-strike hits remove casualties immediately;
 * fire-step hits accumulate and land simultaneously in the casualties step.
 */
export function resolveRoll(s: BattleState, values: number[]): void {
  const kind = currentStep(s);
  if (!kind || kind === 'casualties') return;
  const dice = stepDice(s, kind);
  const details: RollDetail[] = [];
  const bySource = new Map<HitSource, number>();
  let hits = 0;
  dice.forEach((d, i) => {
    const value = values[i];
    const hit = value <= d.hitOn;
    if (hit) { hits++; bySource.set(d.source, (bySource.get(d.source) ?? 0) + 1); }
    details.push({ key: d.key, value, hitOn: d.hitOn, hit, uid: d.uid });
  });
  const buckets = [...bySource.entries()].map(([source, n]) => ({ source, hits: n }));

  if (kind === 'aa_fire') {
    s.aaFired = true;
    s.log.push({ round: s.round, kind, title: 'Antiaircraft fire', text: hits ? `${hits} aircraft shot down before combat.` : 'All aircraft get through.', rolls: details, hits, casualties: [] });
    s.queue.push({ side: 'attacker', buckets });
    s.afterQueue = 'advance';
    pump(s);
    return;
  }
  if (kind === 'sub_strike') {
    const atkDice = subStrikeDice(s, 'attacker');
    let atkHits = 0;
    let defHits = 0;
    details.forEach((d, i) => { if (d.hit) { if (i < atkDice.length) atkHits++; else defHits++; } });
    s.log.push({ round: s.round, kind, title: 'Submarine surprise strike', text: `${atkHits} hit(s) on the defender, ${defHits} on the attacker — struck ships never fire.`, rolls: details, hits, casualties: [] });
    if (atkHits) s.queue.push({ side: 'defender', buckets: [{ source: 'sub', hits: atkHits }] });
    if (defHits) s.queue.push({ side: 'attacker', buckets: [{ source: 'sub', hits: defHits }] });
    s.afterQueue = 'advance';
    pump(s);
    return;
  }
  if (kind === 'bombardment') {
    s.bombarded = true;
    // bombardment casualties go to the casualty zone and fire back: fold them
    // into the round's pending hits
    s.pendingOnDefender.push(...buckets.map((b) => ({ source: 'bombard' as HitSource, hits: b.hits })));
    s.log.push({ round: s.round, kind, title: 'Offshore bombardment', text: `${hits} bombardment hit(s); those casualties still fire back this round.`, rolls: details, hits, casualties: [] });
    advanceStep(s);
    return;
  }
  if (kind === 'attacker_fire') {
    s.pendingOnDefender.push(...buckets);
    s.log.push({ round: s.round, kind, side: 'attacker', title: `Round ${s.round} — attacker fires`, text: `Attacker scores ${hits} hit(s).`, rolls: details, hits, casualties: [] });
    advanceStep(s);
    return;
  }
  if (kind === 'defender_fire') {
    s.pendingOnAttacker.push(...buckets);
    s.log.push({ round: s.round, kind, side: 'defender', title: `Round ${s.round} — defender fires`, text: `Defender scores ${hits} hit(s).`, rolls: details, hits, casualties: [] });
    advanceStep(s);
    return;
  }
}

/** Apply casualty picks for the pending decision: uids, one per hit, in
 * bucket order (an undamaged battleship's uid = damage it). Illegal picks
 * fall back to auto-assignment for that hit. */
export function applyCasualtyPicks(s: BattleState, uids: number[]): void {
  if (s.decision?.type !== 'casualties') return;
  const d = s.decision;
  const task = s.queue[0];
  s.decision = null;
  if (!task || task.side !== d.side) return; // defensive: queue must match
  const units = sideUnits(s, d.side);
  const removed: BattleEvent['casualties'] = [];
  let i = 0;
  for (const b of task.buckets) {
    for (let h = 0; h < b.hits; h++) {
      const legal = eligibleFor(s, d.side, b.source);
      if (legal.length === 0) { i++; continue; }
      const uid = uids[i++];
      const pick = legal.find((u) => u.uid === uid)
        ?? legal.sort((a, c) => {
          if ((a.hp > 1) !== (c.hp > 1)) return a.hp > 1 ? -1 : 1;
          return UNITS[a.key].cost - UNITS[c.key].cost;
        })[0];
      pick.hp -= 1;
      if (pick.hp <= 0) removed.push({ key: pick.key, side: d.side, power: pick.power });
    }
  }
  if (removed.length) {
    s.log.push({ round: s.round, kind: 'casualties', side: d.side, title: 'Casualties', text: `${removed.length} ${d.side} unit(s) removed.`, rolls: [], hits: removed.length, casualties: removed });
  }
  void units;
  s.queue.shift();
  sweepTransports(s);
  evaluateStatus(s);
  pump(s);
}

/** Before a sub-strike or fire step, the sub owner may submerge some subs.
 * The engine offers this as a decision only when subs could legally duck out:
 * we surface it at the start of the sub's fire opportunity. */
export function offerSubmerge(s: BattleState, side: Side): void {
  if (s.decision || s.status !== 'ongoing') return;
  const subs = alive(sideUnits(s, side)).filter((u) => u.key === 'submarine' && !u.submerged);
  const enemy = sideUnits(s, side === 'attacker' ? 'defender' : 'attacker');
  if (subs.length === 0 || hasDestroyer(enemy)) return; // destroyer cancels submersible
  s.decision = { type: 'submerge', side, subs: subs.map((u) => u.uid) };
}

export function applySubmerge(s: BattleState, uids: number[]): void {
  if (s.decision?.type !== 'submerge') return;
  const side = s.decision.side;
  s.decision = null;
  let n = 0;
  for (const u of sideUnits(s, side)) {
    if (u.key === 'submarine' && u.hp > 0 && !u.submerged && uids.includes(u.uid)) {
      u.submerged = true;
      n++;
    }
  }
  if (n) s.log.push({ round: s.round, kind: 'submerge', side, title: 'Submarines submerge', text: `${n} submarine(s) slip away.`, rolls: [], hits: 0, casualties: [] });
  sweepTransports(s);
  evaluateStatus(s);
  skipEmptySteps(s);
}

/** Retreat decision (attacker only, between rounds). */
export function applyRetreat(s: BattleState, retreat: boolean): void {
  if (s.decision?.type !== 'retreat') return;
  s.decision = null;
  if (retreat) {
    s.status = 'retreated';
    s.log.push({ round: s.round, kind: 'retreat', side: 'attacker', title: 'Attacker retreats', text: 'The attacker withdraws all surviving units.', rolls: [], hits: 0, casualties: [] });
    return;
  }
  s.round += 1;
  s.steps = roundSteps(s);
  s.stepIndex = 0;
  skipEmptySteps(s);
  if (currentStep(s) === 'casualties') beginRoundCasualties(s); // degenerate: no dice at all
}

// Defenseless transports: defender has only transports (and/or submerged
// subs) left and the attacker still has units able to hit them — all die.
function sweepTransports(s: BattleState): void {
  if (!s.ctx.seaCombat) return;
  const def = alive(s.defender);
  const fightingDef = def.filter(fights);
  const transports = def.filter((u) => u.key === 'transport');
  if (transports.length === 0 || fightingDef.length > 0) return;
  const atk = alive(s.attacker).filter((u) => fights(u));
  if (atk.length === 0) return; // nothing left to do the destroying
  const removed = transports.map((u) => {
    u.hp = 0;
    return { key: u.key, side: 'defender' as Side, power: u.power };
  });
  s.log.push({ round: s.round, kind: 'transports', title: 'Defenseless transports', text: `${removed.length} defenseless transport(s) destroyed with their cargo.`, rolls: [], hits: removed.length, casualties: removed });
}

function evaluateStatus(s: BattleState): void {
  // In a land battle, offshore ships neither fight nor hold the field.
  const engaged = (u: BattleUnit) => fights(u) && (s.ctx.seaCombat || !isSea(u.key));
  const atk = alive(s.attacker).filter(engaged);
  const defCombat = alive(s.defender).filter(engaged);
  const defTransports = alive(s.defender).filter((u) => u.key === 'transport');
  const atkTransports = alive(s.attacker).filter((u) => u.key === 'transport');
  const defAlive = defCombat.length > 0 || defTransports.length > 0;
  const atkAlive = atk.length > 0 || (s.ctx.seaCombat && atkTransports.length > 0 && defCombat.length === 0);
  if (!defAlive && !atkAlive) s.status = 'mutual';
  else if (!defAlive) {
    const canHold = alive(s.attacker).some((u) => isLand(u.key) && u.key !== 'aaGun');
    s.status = !s.ctx.seaCombat && canHold ? 'attacker_captured' : 'attacker_cleared';
  } else if (!atkAlive) s.status = 'defender_won';
  else s.status = 'ongoing';
}

export interface BattleSummary {
  status: BattleStatus;
  rounds: number;
  attackerSurvivors: Stack;
  defenderSurvivors: Stack;
  attackerIpcLost: number;
  defenderIpcLost: number;
}

const stackOf = (us: BattleUnit[]): Stack => {
  const st: Stack = {};
  for (const u of alive(us)) st[u.key] = (st[u.key] ?? 0) + 1;
  return st;
};

export function summarize(s: BattleState, startAtk: Stack, startDef: Stack): BattleSummary {
  const cost = (st: Stack) => Object.entries(st).reduce((n, [k, c]) => n + UNITS[k as UnitKey].cost * (c ?? 0), 0);
  return {
    status: s.status,
    rounds: s.round,
    attackerSurvivors: stackOf(s.attacker),
    defenderSurvivors: stackOf(s.defender),
    attackerIpcLost: cost(startAtk) - cost(stackOf(s.attacker)),
    defenderIpcLost: cost(startDef) - cost(stackOf(s.defender)),
  };
}
