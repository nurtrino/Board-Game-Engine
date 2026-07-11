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

export interface BattleCargo {
  power: string;
  key: UnitKey;
  count: number;
}

export interface BattleUnit {
  uid: number;
  key: UnitKey;
  side: Side;
  power: string; // owning power (multinational defense; china)
  hp: number;
  maxHp: number;
  submerged?: boolean;
  // Land units unloaded from transports are committed to the beachhead. They
  // cannot join a between-round retreat while any of them remain alive.
  amphibious?: boolean;
  // Cargo remains bound to a carrier/transport while its owner fights. Allied
  // fighters defending from a carrier are expanded as ordinary battle units
  // before createBattle is called, so they can roll and take casualties.
  cargo?: BattleCargo[];
  // A defending allied fighter temporarily launched from another power's
  // carrier. Surviving guests re-board that carrier after the battle.
  carrierGuest?: boolean;
  carrierHostPower?: string;
  /** Durable exact carrier hull identity, present only on one physical hull. */
  carrierRef?: string;
  /** Exact launched defending fighter and the deck it occupied before combat. */
  defendingCarrierFighterRef?: string;
  homeCarrierRef?: string;
  /** Attacking aircraft movement spent reaching this battle. */
  movementSpent?: number;
  /**
   * Exact Paratroopers linkage. Pair ids are reducer-assigned before battle
   * creation; `counterpartUid` is resolved once physical battle units exist.
   * The carried infantry remains aboard (and cannot fight or hold territory)
   * until the complete opening AA queue has resolved.
   */
  pairId?: string;
  role?: 'bomber' | 'infantry';
  counterpartUid?: number;
  aboard?: boolean;
  /** Exact purchased-carrier promise carried through casualties and retreat. */
  carrierLanding?: { ref: string; seaZone: string };
  /**
   * Adjacent space crossed immediately before this attacking land or sea
   * unit entered the contested space.  Combat casualties deliberately retain
   * this provenance: a unit establishes a retreat route when it moves into
   * battle, even if that unit is later destroyed.
   */
  ingressFrom?: string;
  /** Technologies owned by this unit's power. Defender-local metadata keeps
   * multinational AA/Radar resolution from sharing one ally's breakthrough. */
  techs?: TechKey[];
}

export type Stack = Partial<Record<UnitKey, number>>;

export interface SideSpec {
  units: {
    key: UnitKey;
    power: string;
    count: number;
    damaged?: number;
    cargo?: BattleCargo[];
    carrierGuest?: boolean;
    carrierHostPower?: string;
    carrierRef?: string;
    defendingCarrierFighterRef?: string;
    homeCarrierRef?: string;
    movementSpent?: number;
    pairId?: string;
    role?: 'bomber' | 'infantry';
    aboard?: boolean;
    carrierLanding?: { ref: string; seaZone: string };
    /** Final adjacent ingress space for authoritative retreat legality. */
    ingressFrom?: string;
    /** Technologies owned by this specific unit's power. Optional so battles
     * restored from older saves can fall back to the side-level tech list. */
    techs?: TechKey[];
  }[];
  techs?: TechKey[];
}

export interface BattleContext {
  amphibious: boolean; // enables round-1 bombardment
  seaCombat: boolean; // sea-zone battle (sub/transport rules active)
  /** Specialized AA-then-damage sequence; never resolves as territory combat. */
  strategicRaid?: boolean;
  /** Specialized one-die economic strike; the launcher is virtual and safe. */
  rocketStrike?: boolean;
  // Exact land-unit counts unloaded from transports. This both identifies the
  // non-retreating beach force and caps shore bombardment at one ship per
  // unloaded unit. Older saved battles omit it and conservatively treat every
  // attacking land unit as amphibious.
  amphibiousLand?: Partial<Record<UnitKey, number>>;
}

export type StepKind =
  | 'aa_fire'
  | 'paratrooper_drop'
  | 'sub_strike'
  | 'bombardment'
  | 'raid_damage'
  | 'rocket_damage'
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
  | 'raid_resolved'
  | 'rocket_resolved'
  | 'standoff'; // neither side can score a hit (e.g. transports vs transports)

export interface RollDetail {
  key: UnitKey;
  value: number;
  hitOn: number;
  hit: boolean;
  uid: number;
  /** Exact aircraft this AA die was assigned to, per the rulebook. */
  targetUid?: number;
  /** Heavy Bombers show both dice but only their best die is authoritative. */
  selected?: boolean;
}

// Hits are bucketed by what scored them, because assignment rules differ:
// AA hits only fell aircraft; sub hits only sink sea units; air hits can't
// touch subs unless the firing side has a destroyer present.
export type HitSource = 'sub' | 'air' | 'aa' | 'bombard' | 'other';
export interface HitBucket {
  source: HitSource;
  hits: number;
  // Air/sub eligibility is fixed when the volley is rolled. A destroyer lost
  // to simultaneous return fire cannot retroactively invalidate those hits.
  airCanHitSubs?: boolean;
  /** Restrict this hit bucket to the exact units targeted when dice were
   * rolled. Used by AA fire; omitted by legacy saves and ordinary volleys. */
  eligibleUids?: number[];
}

export interface BattleEvent {
  round: number;
  kind: StepKind | 'submerge' | 'transports' | 'retreat';
  side?: Side;
  title: string;
  text: string;
  rolls: RollDetail[];
  hits: number;
  /** Damage dice score their face values rather than threshold hits. */
  metric?: 'hits' | 'damage';
  casualties: { key: UnitKey; side: Side; power: string }[];
}

export interface CasualtyBucket extends HitBucket { eligible: number[] }

// A queued lump of hits one side must absorb. `fireBack: false` = removed
// before they can fire (AA, surprise strike); round-fire casualties are
// applied simultaneously so fire-back is inherent in the step order.
export interface CasualtyTask { side: Side; buckets: HitBucket[]; }

export type BattleDecision =
  | { type: 'submerge'; side: Side; subs: number[] } // uids that may duck out
  | { type: 'casualties'; side: Side; picks: number; buckets: CasualtyBucket[] }
  | { type: 'retreat'; side: 'attacker'; partial?: boolean; terminalStandoff?: true };

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
  // Round numbers already offered a submarine choice, persisted for save/resume.
  submergeOffered: Partial<Record<Side, number>>;
  // Non-amphibious land and air withdrawn from a mixed beach assault. They no
  // longer participate, but return to the board when the beach battle ends.
  withdrawnAttacker?: BattleUnit[];
  /** Raw strategic bombing damage before the factory cap is applied. */
  raidDamage?: number;
  /** One physical rocket die, before the factory cap is applied. */
  rocketDamage?: number;
  /**
   * Monotonic, persisted count of airborne-to-ground transitions. The action
   * reducer folds each transition into the combat visual generation so the
   * next roll cannot borrow readiness from the AA presentation.
   */
  paratrooperDropSeq: number;
}

const isAir = (k: UnitKey) => UNITS[k].domain === 'air';
const isSea = (k: UnitKey) => UNITS[k].domain === 'sea';
const isLand = (k: UnitKey) => UNITS[k].domain === 'land';
const alive = (us: BattleUnit[]) => us.filter((u) => u.hp > 0);
const fights = (u: BattleUnit) => u.hp > 0 && !u.submerged && !u.aboard
  && u.key !== 'aaGun' && u.key !== 'factory' && u.key !== 'transport';

const sideUnits = (s: BattleState, side: Side) => (side === 'attacker' ? s.attacker : s.defender);
const hasDestroyer = (us: BattleUnit[]) => alive(us).some((u) => u.key === 'destroyer');
const hasTech = (s: BattleState, side: Side, t: TechKey) => (side === 'attacker' ? s.atkTechs : s.defTechs).includes(t);
const isCommittedBeachUnit = (s: BattleState, u: BattleUnit) => isLand(u.key)
  && (u.amphibious === true || (s.ctx.amphibious && s.ctx.amphibiousLand === undefined));

function linkParatrooperPairs(units: BattleUnit[]): void {
  const pairs = new Map<string, BattleUnit[]>();
  for (const unit of units) {
    const hasPairMetadata = unit.pairId !== undefined
      || unit.role !== undefined
      || unit.aboard !== undefined;
    if (!hasPairMetadata) continue;
    if (!unit.pairId || !unit.role || unit.side !== 'attacker') {
      throw new Error('Paratrooper metadata must describe an attacking exact pair.');
    }
    const group = pairs.get(unit.pairId) ?? [];
    group.push(unit);
    pairs.set(unit.pairId, group);
  }
  for (const [pairId, pair] of pairs) {
    const bomber = pair.find((unit) => unit.role === 'bomber');
    const infantry = pair.find((unit) => unit.role === 'infantry');
    if (pair.length !== 2
      || !bomber || bomber.key !== 'bomber'
      || !infantry || infantry.key !== 'infantry') {
      throw new Error(`Paratrooper pair ${pairId} must contain one bomber and one infantry.`);
    }
    bomber.counterpartUid = infantry.uid;
    bomber.aboard = false;
    infantry.counterpartUid = bomber.uid;
    infantry.aboard = true;
  }
}

/** Resolve every still-airborne pair as one presentation transition. */
function resolveParatrooperDrop(s: BattleState): boolean {
  const airborne = s.attacker.filter((unit) => unit.role === 'infantry' && unit.aboard === true);
  if (airborne.length === 0) return false;
  let landed = 0;
  let lost = 0;
  for (const infantry of airborne) {
    const bomber = s.attacker.find((unit) => unit.uid === infantry.counterpartUid);
    infantry.aboard = false;
    if (infantry.hp > 0 && bomber && bomber.hp > 0) {
      landed += 1;
    } else {
      if (infantry.hp > 0) infantry.hp = 0;
      lost += 1;
    }
  }
  s.paratrooperDropSeq = (s.paratrooperDropSeq ?? 0) + 1;
  s.log.push({
    round: s.round,
    kind: 'paratrooper_drop',
    side: 'attacker',
    title: landed > 0 ? 'Paratroopers deploy' : 'Airborne force lost',
    text: landed > 0
      ? `${landed} paratrooper unit${landed === 1 ? ' deploys' : 's deploy'} ${s.aaFired ? 'after antiaircraft fire' : 'before combat'}${lost > 0 ? `; ${lost} carried unit${lost === 1 ? ' was' : 's were'} lost` : ''}.`
      : `${lost} carried infantry unit${lost === 1 ? ' never reaches' : 's never reach'} the battlefield.`,
    rolls: [],
    hits: 0,
    casualties: [],
  });
  return true;
}

export function createBattle(atk: SideSpec, def: SideSpec, ctx: BattleContext): BattleState {
  let uid = 1;
  const amphibiousLeft: Partial<Record<UnitKey, number>> = { ...(ctx.amphibiousLand ?? {}) };
  const build = (spec: SideSpec, side: Side): BattleUnit[] => {
    const out: BattleUnit[] = [];
    const remainingByKey = spec.units.reduce<Partial<Record<UnitKey, number>>>((counts, u) => {
      counts[u.key] = (counts[u.key] ?? 0) + u.count;
      return counts;
    }, {});
    for (const u of spec.units) {
      if (u.carrierRef && (u.key !== 'carrier' || u.count !== 1)) {
        throw new Error('A carrier ref must name one exact carrier hull.');
      }
      const hasDefendingCarrierFighterRef = u.defendingCarrierFighterRef !== undefined
        || u.homeCarrierRef !== undefined;
      if (hasDefendingCarrierFighterRef
        && (u.key !== 'fighter' || u.count !== 1
          || !u.defendingCarrierFighterRef || !u.homeCarrierRef)) {
        throw new Error('A launched defending fighter must retain one exact fighter and home-carrier ref.');
      }
      if ((u.pairId !== undefined || u.role !== undefined || u.aboard !== undefined) && u.count !== 1) {
        throw new Error('Paratrooper metadata must name one exact physical unit.');
      }
      if (u.carrierLanding && (u.key !== 'fighter' || u.count !== 1)) {
        throw new Error('A carrier landing promise must name one exact fighter.');
      }
      // Board stacks persist battleship damage between combats. Keep the
      // physical damaged count when expanding an aggregate stack into battle
      // units instead of silently restoring every ship to full health.
      const maxHp = UNITS[u.key].hits;
      const damaged = u.key === 'battleship'
        ? Math.min(u.count, Math.max(0, u.damaged ?? 0))
        : 0;
      const cargoLeft = (u.cargo ?? []).map((cargo) => ({ ...cargo }));
      for (let i = 0; i < u.count; i++) {
        const hp = i < damaged ? Math.max(1, maxHp - 1) : maxHp;
        const remaining = remainingByKey[u.key] ?? 0;
        const amphibious = side === 'attacker'
          && ctx.amphibious
          && isLand(u.key)
          // actAttack appends transported units after overland forces. Tag the
          // final declared count for each type so same-type units retain their
          // correct retreat provenance.
          && (ctx.amphibiousLand === undefined || (amphibiousLeft[u.key] ?? 0) >= remaining);
        remainingByKey[u.key] = Math.max(0, remaining - 1);
        if (amphibious && ctx.amphibiousLand !== undefined) {
          amphibiousLeft[u.key] = Math.max(0, (amphibiousLeft[u.key] ?? 0) - 1);
        }
        // Board stacks may aggregate multiple loaded carriers/transports. Give
        // each physical ship up to two cargo units; the final ship retains any
        // excess from an old/malformed save rather than silently deleting it.
        let slots = i === u.count - 1 ? Number.POSITIVE_INFINITY : 2;
        const cargo: BattleCargo[] = [];
        for (const item of cargoLeft) {
          if (item.count <= 0 || slots <= 0) continue;
          const take = Math.min(item.count, slots);
          cargo.push({ ...item, count: take });
          item.count -= take;
          slots -= take;
        }
        out.push({
          uid: uid++, key: u.key, side, power: u.power, hp, maxHp,
          ...(amphibious ? { amphibious: true } : {}),
          ...(cargo.length ? { cargo } : {}),
          ...(u.carrierGuest ? { carrierGuest: true } : {}),
          ...(u.carrierHostPower ? { carrierHostPower: u.carrierHostPower } : {}),
          ...(u.carrierRef ? { carrierRef: u.carrierRef } : {}),
          ...(u.defendingCarrierFighterRef
            ? { defendingCarrierFighterRef: u.defendingCarrierFighterRef }
            : {}),
          ...(u.homeCarrierRef ? { homeCarrierRef: u.homeCarrierRef } : {}),
          ...(u.movementSpent != null ? { movementSpent: u.movementSpent } : {}),
          ...(u.pairId !== undefined ? { pairId: u.pairId } : {}),
          ...(u.role !== undefined ? { role: u.role } : {}),
          ...(u.aboard !== undefined ? { aboard: u.aboard } : {}),
          ...(u.carrierLanding ? { carrierLanding: { ...u.carrierLanding } } : {}),
          ...(u.ingressFrom ? { ingressFrom: u.ingressFrom } : {}),
          ...(u.techs !== undefined ? { techs: [...u.techs] } : {}),
        });
      }
    }
    return out;
  };
  const attacker = build(atk, 'attacker');
  const defender = build(def, 'defender');
  linkParatrooperPairs([...attacker, ...defender]);
  const s: BattleState = {
    attacker,
    defender,
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
    submergeOffered: {},
    withdrawnAttacker: [],
    paratrooperDropSeq: 0,
  };
  s.steps = roundSteps(s);
  // Without AA, deployment is the opening presentation state and must happen
  // before any general-combat die can be exposed.
  if (s.steps[0] !== 'aa_fire') {
    resolveParatrooperDrop(s);
    s.steps = roundSteps(s);
  }
  sweepTransports(s);
  // A lone AA gun/industrial complex is passive during general combat, but
  // its AA shot still happens before an otherwise unopposed capture. Defer
  // terminal evaluation until the AA queue drains in that case.
  if (s.steps[0] !== 'aa_fire') evaluateStatus(s);
  skipEmptySteps(s);
  offerCurrentSubmerge(s);
  if (!s.decision && currentStep(s) === 'casualties') beginRoundCasualties(s);
  return s;
}

function subsEligibleForSurprise(s: BattleState, side: Side): BattleUnit[] {
  const enemy = sideUnits(s, side === 'attacker' ? 'defender' : 'attacker');
  if (hasDestroyer(enemy)) return [];
  return alive(sideUnits(s, side)).filter((u) => u.key === 'submarine' && !u.submerged);
}

function roundSteps(s: BattleState): StepKind[] {
  const steps: StepKind[] = [];
  if (s.ctx.rocketStrike) {
    steps.push('rocket_damage');
    return steps;
  }
  const defenderHasAA = alive(s.defender).some((u) => u.key === 'aaGun');
  const attackerHasAir = alive(s.attacker).some((u) => isAir(u.key));
  if (!s.aaFired && defenderHasAA && attackerHasAir && !s.ctx.seaCombat) steps.push('aa_fire');
  if (s.ctx.strategicRaid) {
    steps.push('raid_damage');
    return steps;
  }
  if (s.ctx.seaCombat && (subsEligibleForSurprise(s, 'attacker').length || subsEligibleForSurprise(s, 'defender').length)) {
    steps.push('sub_strike');
  }
  if (s.round === 1 && !s.bombarded && s.ctx.amphibious && alive(s.attacker).some((u) => u.key === 'battleship' || u.key === 'cruiser')) {
    steps.push('bombardment');
  }
  steps.push('attacker_fire', 'defender_fire', 'casualties');
  return steps;
}

// ---------- dice ----------

export interface DieSpec {
  uid: number;
  key: UnitKey;
  hitOn: number;
  source: HitSource;
  /** Exact aircraft assigned to this AA die. */
  targetUid?: number;
  /** Choose one die per uid: low for threshold combat, high for SBR damage. */
  chooseBest?: 'low' | 'high';
}

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
      for (let i = 0; i < n; i++) dice.push({
        uid: u.uid,
        key: u.key,
        hitOn,
        source,
        ...(n > 1 ? { chooseBest: 'low' as const } : {}),
      });
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
  const air = alive(s.attacker).filter((u) => isAir(u.key));
  const guns = alive(s.defender).filter((unit) => unit.key === 'aaGun');
  const radarGun = guns.find((gun) => gun.techs?.includes('radar'));
  // Older battle saves and callers only persisted one side-level tech list.
  // Once any gun has owner-local metadata, that precise ownership wins and a
  // side-level Radar advance must not leak onto an allied non-Radar gun.
  const hasPerUnitTechs = guns.some((gun) => gun.techs !== undefined);
  const legacyRadar = !hasPerUnitTechs && hasTech(s, 'defender', 'radar');
  const gun = radarGun ?? guns[0];
  const hitOn = radarGun !== undefined || legacyRadar ? 2 : 1;
  return air.map((target) => ({
    uid: gun?.uid ?? 0,
    key: 'aaGun' as UnitKey,
    hitOn,
    source: 'aa' as const,
    targetUid: target.uid,
  }));
}

function raidDamageDice(s: BattleState): DieSpec[] {
  const dice: DieSpec[] = [];
  const heavy = hasTech(s, 'attacker', 'heavyBombers');
  for (const bomber of alive(s.attacker).filter((unit) => unit.key === 'bomber')) {
    const count = heavy ? 2 : 1;
    for (let i = 0; i < count; i++) {
      // Strategic damage scores the face value. hitOn=0 deliberately keeps the
      // ordinary threshold-hit metric false; the event is marked as damage.
      dice.push({
        uid: bomber.uid,
        key: 'bomber',
        hitOn: 0,
        source: 'other',
        ...(heavy ? { chooseBest: 'high' as const } : {}),
      });
    }
  }
  return dice;
}

function rocketDamageDice(s: BattleState): DieSpec[] {
  const launcher = alive(s.attacker).find((unit) => unit.key === 'aaGun');
  return launcher ? [{
    uid: launcher.uid,
    key: 'aaGun',
    hitOn: 0,
    source: 'other',
  }] : [];
}

function bombardDice(s: BattleState): DieSpec[] {
  // A maximum of one battleship or cruiser may support each land unit that
  // actually unloaded. The action layer prevents committing excess ships;
  // this cap keeps restored/directly-created battles rules-safe as well.
  const declared = s.ctx.amphibiousLand;
  const limit = declared === undefined
    ? alive(s.attacker).filter((u) => isCommittedBeachUnit(s, u)).length
    : Object.values(declared).reduce((n, count) => n + Math.max(0, count ?? 0), 0);
  return alive(s.attacker)
    .filter((u) => u.key === 'battleship' || u.key === 'cruiser')
    .slice(0, limit)
    .map((u) => ({ uid: u.uid, key: u.key, hitOn: UNITS[u.key].attack, source: 'bombard' as const }));
}

export function stepDice(s: BattleState, kind: StepKind): DieSpec[] {
  switch (kind) {
    case 'aa_fire': return aaDice(s);
    case 'sub_strike': return [...subStrikeDice(s, 'attacker'), ...subStrikeDice(s, 'defender')];
    case 'bombardment': return bombardDice(s);
    case 'raid_damage': return raidDamageDice(s);
    case 'rocket_damage': return rocketDamageDice(s);
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
export function eligibleFor(s: BattleState, side: Side, source: HitSource, airCanHitSubs?: boolean): BattleUnit[] {
  const units = sideUnits(s, side);
  const firing = sideUnits(s, side === 'attacker' ? 'defender' : 'attacker');
  let pool = alive(units).filter((u) => (fights(u) || u.key === 'transport') && !u.submerged);
  if (!s.ctx.seaCombat) pool = pool.filter((u) => !isSea(u.key)); // ships stay offshore
  if (source === 'aa') pool = pool.filter((u) => isAir(u.key));
  if (source === 'sub') pool = pool.filter((u) => isSea(u.key));
  if (source === 'air' && !(airCanHitSubs ?? hasDestroyer(firing))) pool = pool.filter((u) => u.key !== 'submarine');
  if (source === 'bombard') pool = pool.filter((u) => !isSea(u.key));
  // transports are chosen last: eligible only when nothing else is
  const nonTp = pool.filter((u) => u.key !== 'transport');
  return nonTp.length > 0 ? nonTp : pool;
}

/** Eligibility frozen into a hit bucket at roll time takes precedence over
 * later casualty preferences. This makes each AA hit destroy the aircraft its
 * die targeted while preserving generic behavior for old saves/other fire. */
function eligibleForBucket(s: BattleState, side: Side, bucket: HitBucket): BattleUnit[] {
  const pool = eligibleFor(s, side, bucket.source, bucket.airCanHitSubs);
  if (bucket.eligibleUids === undefined) return pool;
  const allowed = new Set(bucket.eligibleUids);
  return pool.filter((unit) => allowed.has(unit.uid));
}

// A real choice exists when the eligible pool is mixed and not everything dies.
function needsChoice(s: BattleState, task: CasualtyTask): boolean {
  for (const b of task.buckets) {
    if (b.hits <= 0) continue;
    const pool = eligibleForBucket(s, task.side, b);
    if (b.hits >= pool.reduce((n, u) => n + u.hp, 0)) continue; // all dead anyway
    const kinds = new Set(pool.map((u) => `${u.key}:${u.hp}`));
    if (kinds.size > 1) return true;
  }
  return false;
}

// Cheapest-first (battleship damage soaks first) — bots and no-choice cases.
function applyBattleHit(
  s: BattleState,
  side: Side,
  source: HitSource,
  pick: BattleUnit,
  removed: BattleEvent['casualties'],
): void {
  pick.hp -= 1;
  if (pick.hp > 0) return;
  removed.push({ key: pick.key, side, power: pick.power });
  // The carried infantry is cargo aboard this exact bomber. Its loss is a
  // consequence of the one AA hit, never another assignable hit. Once the
  // infantry has deployed, ordinary bomber casualties no longer affect it.
  if (source !== 'aa' || side !== 'attacker'
    || pick.role !== 'bomber' || pick.key !== 'bomber') return;
  const infantry = s.attacker.find((unit) => unit.uid === pick.counterpartUid
    && unit.role === 'infantry' && unit.aboard === true && unit.hp > 0);
  if (!infantry) return;
  infantry.hp = 0;
  removed.push({ key: infantry.key, side, power: infantry.power });
}

function autoAssign(s: BattleState, task: CasualtyTask): void {
  const removed: BattleEvent['casualties'] = [];
  for (const b of task.buckets) {
    for (let h = 0; h < b.hits; h++) {
      const pool = eligibleForBucket(s, task.side, b).sort((a, c) => {
        if ((a.hp > 1) !== (c.hp > 1)) return a.hp > 1 ? -1 : 1;
        return UNITS[a.key].cost - UNITS[c.key].cost;
      });
      const pick = pool[0];
      if (!pick) break;
      applyBattleHit(s, task.side, b.source, pick, removed);
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
          buckets: task.buckets.map((b) => ({ ...b, eligible: eligibleForBucket(s, task.side, b).map((u) => u.uid) })),
        };
        return;
      }
      autoAssign(s, task);
      s.queue.shift();
      continue;
    }
    // The casualty batch has drained. Reciprocal surprise strikes and normal
    // round fire are simultaneous, so do not decide the battle between tasks.
    const after = s.afterQueue;
    s.afterQueue = null;
    if (after === 'advance' && s.steps[s.stepIndex] === 'aa_fire') {
      // All exact AA casualty buckets have drained. Deployment is a distinct,
      // non-random presentation transition before the first combat volley.
      resolveParatrooperDrop(s);
    }
    sweepTransports(s);
    evaluateStatus(s);
    if (s.status !== 'ongoing') {
      assertTerminalQueueInvariant(s);
      return;
    }
    if (after === 'endRound') { endRound(s); return; }
    if (after === 'advance') { advanceStep(s); continue; }
    return;
  }
}

function advanceStep(s: BattleState): void {
  s.stepIndex += 1;
  skipEmptySteps(s);
  offerCurrentSubmerge(s);
  if (!s.decision && currentStep(s) === 'casualties') beginRoundCasualties(s);
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

function hasCommittedBeachForce(s: BattleState): boolean {
  return s.ctx.amphibious
    && !s.ctx.seaCombat
    && alive(s.attacker).some((u) => isCommittedBeachUnit(s, u));
}

function retreatableFromBeach(s: BattleState): BattleUnit[] {
  return alive(s.attacker).filter((u) => !isCommittedBeachUnit(s, u)
    && (isAir(u.key) || (isLand(u.key) && u.key !== 'aaGun')));
}

function continueAmphibiousAssault(s: BattleState): void {
  s.log.push({
    round: s.round,
    kind: 'retreat',
    side: 'attacker',
    title: 'Amphibious assault continues',
    text: 'Land units unloaded onto the beach cannot retreat; combat continues.',
    rolls: [],
    hits: 0,
    casualties: [],
  });
  beginNextRound(s);
}

function beginNextRound(s: BattleState): void {
  s.round += 1;
  s.steps = roundSteps(s);
  s.stepIndex = 0;
  skipEmptySteps(s);
  offerCurrentSubmerge(s);
  if (!s.decision && currentStep(s) === 'casualties') beginRoundCasualties(s); // degenerate: no dice at all
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
    const visibleAttacker = alive(s.attacker).filter((unit) => !unit.submerged);
    const visibleDefender = alive(s.defender).filter((unit) => !unit.submerged);
    if (s.ctx.seaCombat
      && visibleAttacker.length > 0
      && visibleDefender.length > 0
      && visibleAttacker.every((unit) => unit.key === 'transport')
      && visibleDefender.every((unit) => unit.key === 'transport')) {
      s.decision = { type: 'retreat', side: 'attacker', terminalStandoff: true };
      return;
    }
    s.status = 'standoff';
    s.log.push({ round: s.round, kind: 'retreat', title: 'Standoff', text: 'Neither side can score a hit; the battle ends.', rolls: [], hits: 0, casualties: [] });
    return;
  }
  if (hasCommittedBeachForce(s)) {
    if (retreatableFromBeach(s).length > 0) {
      s.decision = { type: 'retreat', side: 'attacker', partial: true };
      return;
    }
    continueAmphibiousAssault(s);
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
  const selectedDice = new Set<number>();
  const choiceGroups = new Map<string, number[]>();
  dice.forEach((die, index) => {
    if (!die.chooseBest) {
      selectedDice.add(index);
      return;
    }
    const key = `${die.uid}:${die.chooseBest}`;
    const group = choiceGroups.get(key) ?? [];
    group.push(index);
    choiceGroups.set(key, group);
  });
  for (const [key, indices] of choiceGroups) {
    const high = key.endsWith(':high');
    let best = indices[0];
    for (const index of indices.slice(1)) {
      if (high ? values[index] > values[best] : values[index] < values[best]) best = index;
    }
    selectedDice.add(best);
  }
  dice.forEach((d, i) => {
    const value = values[i];
    const selected = selectedDice.has(i);
    const hit = selected && value <= d.hitOn;
    if (hit) { hits++; bySource.set(d.source, (bySource.get(d.source) ?? 0) + 1); }
    details.push({
      key: d.key,
      value,
      hitOn: d.hitOn,
      hit,
      uid: d.uid,
      ...(d.targetUid !== undefined ? { targetUid: d.targetUid } : {}),
      ...(d.chooseBest ? { selected } : {}),
    });
  });
  const firingSide: Side | null = kind === 'attacker_fire' ? 'attacker' : kind === 'defender_fire' ? 'defender' : null;
  const airCanHitSubs = firingSide ? hasDestroyer(sideUnits(s, firingSide)) : false;
  let buckets: HitBucket[];
  if (kind === 'aa_fire') {
    // AA dice are declared against specific aircraft. Keep each successful die
    // in its own frozen bucket so neither automatic assignment nor a restored
    // casualty prompt can redirect the hit to another fighter/bomber.
    buckets = details
      .filter((detail) => detail.hit && detail.targetUid !== undefined)
      .map((detail) => ({ source: 'aa', hits: 1, eligibleUids: [detail.targetUid!] }));
    // Defensive compatibility for malformed/legacy dice without target data.
    const untargetedHits = hits - buckets.length;
    if (untargetedHits > 0) buckets.push({ source: 'aa', hits: untargetedHits });
  } else {
    buckets = [...bySource.entries()].map(([source, n]) => ({
      source,
      hits: n,
      ...(source === 'air' ? { airCanHitSubs } : {}),
    }));
  }

  if (kind === 'raid_damage') {
    const damage = details.reduce((sum, die) => sum + (die.selected === false ? 0 : die.value), 0);
    s.raidDamage = damage;
    s.log.push({
      round: s.round,
      kind,
      side: 'attacker',
      title: 'Strategic bombing damage',
      text: `${details.length} damage dice score ${damage}.`,
      rolls: details,
      hits: 0,
      metric: 'damage',
      casualties: [],
    });
    s.status = 'raid_resolved';
    s.stepIndex = s.steps.length;
    assertTerminalQueueInvariant(s);
    return;
  }

  if (kind === 'rocket_damage') {
    const damage = details[0]?.value ?? 0;
    s.rocketDamage = damage;
    s.log.push({
      round: s.round,
      kind,
      side: 'attacker',
      title: 'Rocket strike damage',
      text: `The rocket damage die scores ${damage}.`,
      rolls: details,
      hits: 0,
      metric: 'damage',
      casualties: [],
    });
    s.status = 'rocket_resolved';
    s.stepIndex = s.steps.length;
    assertTerminalQueueInvariant(s);
    return;
  }

  if (kind === 'aa_fire') {
    s.aaFired = true;
    s.log.push({ round: s.round, kind, title: 'Antiaircraft fire', text: hits ? `${hits} aircraft shot down before ${s.ctx.strategicRaid ? 'the bombing run' : 'combat'}.` : 'All aircraft get through.', rolls: details, hits, casualties: [] });
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
      const legal = eligibleForBucket(s, d.side, b);
      // Picks are a compact list of assignable hits. Empty eligibility must
      // not consume a UID or the next bucket's explicit choice shifts.
      if (legal.length === 0) continue;
      const uid = uids[i++];
      const pick = legal.find((u) => u.uid === uid)
        ?? legal.sort((a, c) => {
          if ((a.hp > 1) !== (c.hp > 1)) return a.hp > 1 ? -1 : 1;
          return UNITS[a.key].cost - UNITS[c.key].cost;
        })[0];
      applyBattleHit(s, d.side, b.source, pick, removed);
    }
  }
  if (removed.length) {
    s.log.push({ round: s.round, kind: 'casualties', side: d.side, title: 'Casualties', text: `${removed.length} ${d.side} unit(s) removed.`, rolls: [], hits: removed.length, casualties: removed });
  }
  void units;
  s.queue.shift();
  pump(s);
}

/** Before a sub-strike or fire step, the sub owner may submerge some subs.
 * The engine offers this as a decision only when subs could legally duck out:
 * we surface it at the start of the sub's fire opportunity. */
export function offerSubmerge(s: BattleState, side: Side): void {
  if (s.decision || s.status !== 'ongoing') return;
  s.submergeOffered ??= {}; // hydrate battles saved before this field existed
  if (s.submergeOffered[side] === s.round) return;
  const subs = alive(sideUnits(s, side)).filter((u) => u.key === 'submarine' && !u.submerged);
  const enemy = sideUnits(s, side === 'attacker' ? 'defender' : 'attacker');
  if (subs.length === 0 || hasDestroyer(enemy)) return; // destroyer cancels submersible
  s.submergeOffered[side] = s.round;
  s.decision = { type: 'submerge', side, subs: subs.map((u) => u.uid) };
}

/** Offer submarine choices in a stable order before surprise-strike dice are
 * exposed. A declined choice remains recorded for the rest of the round. */
function offerCurrentSubmerge(s: BattleState): void {
  if (s.decision || s.status !== 'ongoing' || !s.ctx.seaCombat) return;
  if (s.steps[s.stepIndex] !== 'sub_strike') return;
  offerSubmerge(s, 'attacker');
  if (!s.decision) offerSubmerge(s, 'defender');
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
  if (s.status !== 'ongoing') {
    assertTerminalQueueInvariant(s);
    return;
  }
  skipEmptySteps(s);
  offerCurrentSubmerge(s);
  if (!s.decision && currentStep(s) === 'casualties') beginRoundCasualties(s);
}

/** Retreat decision (attacker only, between rounds). */
export function applyRetreat(s: BattleState, retreat: boolean): void {
  if (s.decision?.type !== 'retreat') return;
  const terminalStandoff = s.decision.terminalStandoff === true;
  s.decision = null;
  if (retreat) {
    // Old saves may contain a retreat decision created before amphibious
    // commitment was enforced. Never allow that stale choice to withdraw a
    // surviving beach force.
    if (hasCommittedBeachForce(s)) {
      const withdrawing = retreatableFromBeach(s);
      if (withdrawing.length > 0) {
        const ids = new Set(withdrawing.map((u) => u.uid));
        s.attacker = s.attacker.filter((u) => !ids.has(u.uid));
        (s.withdrawnAttacker ??= []).push(...withdrawing);
        s.log.push({
          round: s.round,
          kind: 'retreat',
          side: 'attacker',
          title: 'Overland force retreats',
          text: `${withdrawing.length} overland/air unit(s) withdraw; the amphibious beach force must continue.`,
          rolls: [],
          hits: 0,
          casualties: [],
        });
        beginNextRound(s);
        return;
      }
      continueAmphibiousAssault(s);
      return;
    }
    s.status = 'retreated';
    s.log.push({ round: s.round, kind: 'retreat', side: 'attacker', title: 'Attacker retreats', text: 'The attacker withdraws all surviving units.', rolls: [], hits: 0, casualties: [] });
    return;
  }
  if (terminalStandoff) {
    s.status = 'standoff';
    s.log.push({
      round: s.round,
      kind: 'retreat',
      side: 'attacker',
      title: 'Transports remain',
      text: 'Both transport groups remain in the contested sea zone.',
      rolls: [],
      hits: 0,
      casualties: [],
    });
    return;
  }
  beginNextRound(s);
}

// Defenseless transports: defender has only transports (and/or submerged
// subs) left and the attacker still has units able to hit them — all die.
function sweepTransports(s: BattleState): void {
  if (!s.ctx.seaCombat) return;
  const def = alive(s.defender);
  const fightingDef = def.filter(fights);
  const transports = def.filter((u) => u.key === 'transport');
  const atk = alive(s.attacker).filter((u) => fights(u));
  if (transports.length > 0 && fightingDef.length === 0 && atk.length > 0) {
    const removed = transports.map((u) => {
      u.hp = 0;
      return { key: u.key, side: 'defender' as Side, power: u.power };
    });
    s.log.push({ round: s.round, kind: 'transports', title: 'Defenseless transports', text: `${removed.length} defenseless transport(s) destroyed with their cargo.`, rolls: [], hits: removed.length, casualties: removed });
  }

  // A transport already trapped in a surface-hostile zone must enter that
  // mandatory zero-move battle. If it has no attacking combatant and no ship
  // ever established an ingress route, the defending fleet sweeps it now.
  const attackingTransports = alive(s.attacker).filter((u) => u.key === 'transport');
  const fightingAttackers = alive(s.attacker).filter(fights);
  const fightingDefenders = alive(s.defender).filter(fights);
  const establishedIngress = s.attacker.some((u) => isSea(u.key) && Boolean(u.ingressFrom));
  if (attackingTransports.length > 0
    && fightingAttackers.length === 0
    && fightingDefenders.length > 0
    && !establishedIngress) {
    const removed = attackingTransports.map((u) => {
      u.hp = 0;
      return { key: u.key, side: 'attacker' as Side, power: u.power };
    });
    s.log.push({ round: s.round, kind: 'transports', title: 'Defenseless transports', text: `${removed.length} trapped attacking transport(s) destroyed with their cargo.`, rolls: [], hits: removed.length, casualties: removed });
  }
}

function evaluateStatus(s: BattleState): void {
  if (s.ctx.rocketStrike) {
    s.status = s.rocketDamage === undefined ? 'ongoing' : 'rocket_resolved';
    return;
  }
  if (s.ctx.strategicRaid) {
    if (alive(s.attacker).some((unit) => unit.key === 'bomber')) {
      s.status = 'ongoing';
    } else {
      s.raidDamage = 0;
      s.status = 'raid_resolved';
    }
    return;
  }
  // In a land battle, offshore ships neither fight nor hold the field.
  const engaged = (u: BattleUnit) => fights(u) && (s.ctx.seaCombat || !isSea(u.key));
  const atk = alive(s.attacker).filter(engaged);
  const defCombat = alive(s.defender).filter(engaged);
  const defInfrastructure = alive(s.defender).filter((u) => u.key === 'aaGun' || u.key === 'factory');
  const defTransports = alive(s.defender).filter((u) => u.key === 'transport');
  const atkTransports = alive(s.attacker).filter((u) => u.key === 'transport');
  const defAlive = defCombat.length > 0 || defTransports.length > 0;
  const atkAlive = atk.length > 0 || (s.ctx.seaCombat && atkTransports.length > 0 && defCombat.length === 0);
  const submergedRemain = alive(s.attacker).some((u) => u.submerged) || alive(s.defender).some((u) => u.submerged);
  if (!defAlive && !atkAlive) s.status = defInfrastructure.length > 0 ? 'defender_won' : submergedRemain ? 'standoff' : 'mutual';
  else if (!defAlive) {
    const canHold = alive(s.attacker).some((u) => isLand(u.key) && u.key !== 'aaGun');
    s.status = !s.ctx.seaCombat && canHold ? 'attacker_captured' : 'attacker_cleared';
  } else if (!atkAlive) s.status = 'defender_won';
  else s.status = 'ongoing';
}

/** A terminal result may never retain unapplied hits or a live choice. */
function assertTerminalQueueInvariant(s: BattleState): void {
  if (s.status === 'ongoing') return;
  if (s.queue.length || s.pendingOnAttacker.length || s.pendingOnDefender.length || s.decision) {
    throw new Error(`Terminal battle ${s.status} retained unresolved casualty state.`);
  }
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
    attackerSurvivors: stackOf([...s.attacker, ...(s.withdrawnAttacker ?? [])]),
    defenderSurvivors: stackOf(s.defender),
    attackerIpcLost: cost(startAtk) - cost(stackOf([...s.attacker, ...(s.withdrawnAttacker ?? [])])),
    defenderIpcLost: cost(startDef) - cost(stackOf(s.defender)),
  };
}
