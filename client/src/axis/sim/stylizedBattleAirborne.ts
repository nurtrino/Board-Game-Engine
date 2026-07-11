import type { SimUnit } from './battlescene';

export function isAboardParatrooper(unit: SimUnit): boolean {
  return unit.paratrooper?.role === 'infantry' && unit.paratrooper.aboard;
}

export function isDeployedParatrooper(unit: SimUnit): boolean {
  return unit.paratrooper?.role === 'infantry' && !unit.paratrooper.aboard;
}

export function beginsParatrooperDrop(previousAboard: boolean, unit: SimUnit): boolean {
  return previousAboard && isDeployedParatrooper(unit);
}

/** A carried infantry loss is visually attributed to its exact bomber pair. */
export function isLinkedAboardLoss(
  unit: SimUnit,
  units: readonly SimUnit[],
  destroyedIds: ReadonlySet<string>,
): boolean {
  if (!isAboardParatrooper(unit) || !destroyedIds.has(unit.id)) return false;
  const counterpartId = unit.paratrooper?.counterpartId;
  if (!counterpartId || !destroyedIds.has(counterpartId)) return false;
  const counterpart = units.find((candidate) => candidate.id === counterpartId);
  return counterpart?.paratrooper?.role === 'bomber'
    && counterpart.paratrooper.pairId === unit.paratrooper?.pairId;
}
