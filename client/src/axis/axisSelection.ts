import type { AxisUnitPick, UnitKey } from '@bge/shared';

/** Toggle one physical unit without disturbing other identical selections. */
export function toggleOrdinalSelection(
  current: ReadonlySet<number> | undefined,
  ordinal: number,
  max: number,
): Set<number> {
  const next = new Set([...(current ?? [])].filter((value) => value >= 0 && value < max));
  if (ordinal < 0 || ordinal >= max) return next;
  if (next.has(ordinal)) next.delete(ordinal);
  else next.add(ordinal);
  return next;
}

/** Resize a stepper selection while preserving the exact pieces tapped first. */
export function resizeOrdinalSelection(
  current: ReadonlySet<number> | undefined,
  requested: number,
  max: number,
): Set<number> {
  const target = Math.max(0, Math.min(max, requested));
  const preserved = [...(current ?? [])].filter((value) => value >= 0 && value < max);
  const next = new Set(preserved.slice(0, target));
  for (let ordinal = 0; next.size < target && ordinal < max; ordinal++) next.add(ordinal);
  return next;
}

/** Serialize the exact sculpts selected in one power/unit group. */
export function buildExactUnitPick(
  key: UnitKey,
  current: ReadonlySet<number>,
  selectionSig: string,
): AxisUnitPick {
  const ordinals = [...current]
    .filter((ordinal) => Number.isSafeInteger(ordinal) && ordinal >= 0)
    .sort((a, b) => a - b);
  return { key, count: ordinals.length, ordinals, selectionSig };
}
