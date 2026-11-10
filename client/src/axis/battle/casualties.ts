// Casualty picking, replayed exactly the way the engine applies it (battle.ts applyCasualtyPicks):
// hits are worked bucket by bucket, each pick must be in that bucket's eligible list and still have
// hit points left, and a hit with no legal target consumes no pick.
import { orderOf, plural, unitDomain, unitName, type BattleUnit, type CasualtyDecision } from './model';

type Source = CasualtyDecision['buckets'][number]['source'];

export interface CasualtyPlan {
  /** Exact compact payload for battleCasualties. */
  payload: number[];
  /** Units that may take the next hit. Empty when every hit is assigned. */
  nextEligible: number[];
  nextSource: Source | null;
  /** Index of the bucket the next hit belongs to, or -1. */
  nextBucket: number;
  assigned: number;
  /** Hits that can actually be assigned (hits with no legal target are skipped by the engine). */
  assignable: number;
  totalHits: number;
  complete: boolean;
  /** Hit points left on each unit after the picks so far. */
  hpLeft: Map<number, number>;
}

export function planCasualties(
  decision: CasualtyDecision,
  units: readonly BattleUnit[],
  selections: readonly number[],
): CasualtyPlan {
  const hp = new Map(units.map((u) => [u.uid, Math.max(0, u.hp)]));
  const payload: number[] = [];
  const totalHits = decision.buckets.reduce((n, b) => n + b.hits, 0);
  let cursor = 0;
  let stop: { eligible: number[]; source: Source; bucket: number } | null = null;
  let skipped = 0;

  decision.buckets.forEach((bucket, bucketIndex) => {
    const eligible = [...new Set(bucket.eligible)];
    for (let h = 0; h < bucket.hits; h++) {
      const legal = eligible.filter((uid) => (hp.get(uid) ?? 0) > 0);
      if (legal.length === 0) { skipped += 1; continue; }
      if (stop) continue; // keep counting assignable hits behind the first open one
      const pick = selections[cursor];
      if (pick == null || !legal.includes(pick)) {
        stop = { eligible: legal, source: bucket.source, bucket: bucketIndex };
        continue;
      }
      payload.push(pick);
      hp.set(pick, (hp.get(pick) ?? 0) - 1);
      cursor += 1;
    }
  });

  // Hits behind an open one were not simulated against reduced hit points, so the assignable
  // count is an upper bound until the picks reach them. It is exact once the plan is complete.
  const open = stop as { eligible: number[]; source: Source; bucket: number } | null;
  return {
    payload,
    nextEligible: open?.eligible ?? [],
    nextSource: open?.source ?? null,
    nextBucket: open?.bucket ?? -1,
    assigned: payload.length,
    assignable: totalHits - skipped,
    totalHits,
    complete: open === null,
    hpLeft: hp,
  };
}

/** Undo the most recent hit on a unit, and every pick made after it (later picks depend on it). */
export function undoPick(selections: readonly number[], uid: number): number[] {
  const index = selections.lastIndexOf(uid);
  return index < 0 ? [...selections] : selections.slice(0, index);
}

/** Drop any stale picks so the list is always a legal prefix. */
export function legalPrefix(decision: CasualtyDecision, units: readonly BattleUnit[], selections: readonly number[]): number[] {
  return planCasualties(decision, units, selections).payload;
}

const SOURCE_RULE: Record<Source, string> = {
  aa: 'Antiaircraft fire only hits aircraft',
  sub: 'Submarine hits only sink ships',
  air: 'Aircraft cannot hit submarines without a destroyer',
  bombard: 'Bombardment only hits land units',
  other: 'Not a legal target for this hit',
};

/** What the next hit is, in plain words. */
export function sourcePrompt(source: Source | null): string {
  switch (source) {
    case 'aa': return 'Antiaircraft hit. It was aimed at one aircraft.';
    case 'sub': return 'Submarine hit. Choose a ship.';
    case 'air': return 'Hit from aircraft. Choose any unit they can reach.';
    case 'bombard': return 'Bombardment hit. Choose a land unit.';
    case 'other': return 'Choose a unit to take this hit.';
    default: return 'Every hit is assigned.';
  }
}

/**
 * Why a unit cannot take the next hit, or null when it can.
 * `seaCombat` is battle.ctx.seaCombat.
 */
export function whyNot(
  unit: BattleUnit,
  decision: CasualtyDecision,
  plan: CasualtyPlan,
  seaCombat: boolean,
  sideUnits: readonly BattleUnit[],
): string | null {
  if (plan.complete) return 'Every hit is assigned';
  if (plan.nextEligible.includes(unit.uid)) return null;
  if (unit.hp <= 0) return 'Already destroyed';
  if ((plan.hpLeft.get(unit.uid) ?? 0) <= 0) return 'Already chosen';
  if (unit.submerged) return 'Submerged, out of the fight';
  if (unit.aboard) return 'Still aboard its bomber';
  if (unit.key === 'aaGun' || unit.key === 'factory') return 'Never taken as a casualty';
  const domain = unitDomain(unit.key);
  if (!seaCombat && domain === 'sea') return 'Offshore, cannot be hit';
  const source = plan.nextSource ?? 'other';
  const bucket = decision.buckets[plan.nextBucket];
  if (source === 'aa') {
    if (domain !== 'air') return SOURCE_RULE.aa;
    return 'This shot was aimed at another aircraft';
  }
  if (source === 'sub' && domain !== 'sea') return SOURCE_RULE.sub;
  if (source === 'bombard' && domain === 'sea') return SOURCE_RULE.bombard;
  if (source === 'air' && unit.key === 'submarine' && bucket?.airCanHitSubs !== true) return SOURCE_RULE.air;
  if (unit.key === 'transport') {
    const othersLeft = sideUnits.some((u) => u.key !== 'transport' && plan.nextEligible.includes(u.uid));
    if (othersLeft) return 'Transports are taken last';
  }
  return SOURCE_RULE.other;
}

export interface CasualtyCard {
  id: string;
  key: string;
  power: string;
  /** Hit points each unit in this card had when the decision opened. */
  hp: number;
  maxHp: number;
  uids: number[];
  /** Hits assigned to this card so far. */
  picked: number;
  /** Uid the next tap would assign, or null when the card cannot take the next hit. */
  nextUid: number | null;
  reason: string | null;
  note: string;
}

/**
 * One card per group of interchangeable units (same type, owner, hit points and eligibility), so a
 * stack of forty infantry is one large target, not forty. A tap assigns the next hit to the unit in
 * the group with the most hit points left, which damages a fresh battleship before sinking a hurt one.
 */
export function casualtyCards(
  decision: CasualtyDecision,
  sideUnits: readonly BattleUnit[],
  selections: readonly number[],
  seaCombat: boolean,
): { cards: CasualtyCard[]; plan: CasualtyPlan } {
  const plan = planCasualties(decision, sideUnits, selections);
  const signature = (uid: number) => decision.buckets.map((b) => (b.eligible.includes(uid) ? '1' : '0')).join('');
  const groups = new Map<string, BattleUnit[]>();
  for (const u of sideUnits) {
    if (u.hp <= 0) continue;
    const id = `${u.key}:${u.power}:${u.hp}:${u.submerged ? 's' : ''}${u.aboard ? 'a' : ''}:${signature(u.uid)}`;
    const list = groups.get(id) ?? [];
    list.push(u);
    groups.set(id, list);
  }
  const cards: CasualtyCard[] = [];
  for (const [id, list] of groups) {
    const first = list[0];
    const uids = list.map((u) => u.uid);
    const picked = plan.payload.filter((uid) => uids.includes(uid)).length;
    const open = uids
      .filter((uid) => plan.nextEligible.includes(uid))
      .sort((a, b) => (plan.hpLeft.get(b) ?? 0) - (plan.hpLeft.get(a) ?? 0) || a - b);
    const nextUid = open[0] ?? null;
    let reason: string | null = null;
    if (nextUid === null) {
      const live = list.find((u) => (plan.hpLeft.get(u.uid) ?? 0) > 0) ?? first;
      reason = whyNot(live, decision, plan, seaCombat, sideUnits);
    }
    const note = first.maxHp > 1
      ? (first.hp > 1 ? 'Takes two hits. The first only damages it.' : 'Damaged. One more hit sinks it.')
      : '';
    cards.push({ id, key: first.key, power: first.power, hp: first.hp, maxHp: first.maxHp, uids, picked, nextUid, reason, note });
  }
  cards.sort((a, b) => orderOf(a.key) - orderOf(b.key) || b.hp - a.hp || a.power.localeCompare(b.power));
  return { cards, plan };
}

/** Remove the latest hit assigned to a card. */
export function undoCard(card: CasualtyCard, selections: readonly number[]): number[] {
  for (let i = selections.length - 1; i >= 0; i--) {
    if (card.uids.includes(selections[i])) return selections.slice(0, i);
  }
  return [...selections];
}

export function confirmLabel(plan: CasualtyPlan): string {
  if (!plan.complete) {
    const left = Math.max(1, plan.assignable - plan.assigned);
    return `Choose ${left} more`;
  }
  return plan.assigned === 1 ? 'Confirm 1 casualty' : `Confirm ${plan.assigned} casualties`;
}

export const cardTitle = (card: CasualtyCard) =>
  card.uids.length > 1 ? `${card.uids.length} ${plural(card.key, card.uids.length)}` : unitName(card.key);
