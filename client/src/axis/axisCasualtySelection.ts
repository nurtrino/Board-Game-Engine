import type { AxisView } from '@bge/shared';

type Battle = NonNullable<AxisView['combat']>['battle'];
type BattleUnit = Battle['attacker'][number];
type CasualtyDecision = Extract<NonNullable<Battle['decision']>, { type: 'casualties' }>;

export interface CasualtyPlan {
  /** Exact compact engine payload for assignable hits. */
  payload: number[];
  nextEligible: number[];
  nextSource: CasualtyDecision['buckets'][number]['source'] | null;
  assigned: number;
  processedHits: number;
  totalHits: number;
  complete: boolean;
}

/**
 * Replay bucketed hits in engine order. This preserves source restrictions and
 * permits the same two-hit battleship UID to be selected twice. Hits with no
 * legal target advance the presentation without consuming a payload entry.
 */
export function planCasualties(
  decision: CasualtyDecision,
  units: readonly BattleUnit[],
  selections: readonly number[],
): CasualtyPlan {
  const hp = new Map(units.map((unit) => [unit.uid, Math.max(0, unit.hp)]));
  const payload: number[] = [];
  let selectionIndex = 0;
  let assigned = 0;
  let processedHits = 0;
  const totalHits = decision.buckets.reduce((sum, bucket) => sum + bucket.hits, 0);

  for (const bucket of decision.buckets) {
    const eligibleIds = [...new Set(bucket.eligible)];
    for (let hit = 0; hit < bucket.hits; hit++) {
      const legal = eligibleIds.filter((uid) => (hp.get(uid) ?? 0) > 0);
      processedHits += 1;
      if (legal.length === 0) {
        continue;
      }
      const selected = selections[selectionIndex];
      if (selected == null || !legal.includes(selected)) {
        return {
          payload,
          nextEligible: legal,
          nextSource: bucket.source,
          assigned,
          processedHits: processedHits - 1,
          totalHits,
          complete: false,
        };
      }
      payload.push(selected);
      hp.set(selected, (hp.get(selected) ?? 0) - 1);
      selectionIndex += 1;
      assigned += 1;
    }
  }

  return {
    payload,
    nextEligible: [],
    nextSource: null,
    assigned,
    processedHits,
    totalHits,
    complete: selectionIndex === selections.length,
  };
}

/** Remove one explicit hit and dependent later choices, preserving earlier choices. */
export function removeLastCasualtyPick(selections: readonly number[], uid: number): number[] {
  const index = selections.lastIndexOf(uid);
  if (index < 0) return [...selections];
  return selections.slice(0, index);
}
