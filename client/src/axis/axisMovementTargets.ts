import {
  axisEnemySurfaceWarshipAt,
  canAxisSeaUnitTransit,
  canAxisTraverseSeaEdge,
  classifyAxisLandRoute,
  validateAxisLandForceRoute,
  type AxisMovementSnapshot,
  type AxisMovementUnit,
  type AxisRulePower,
  type AxisSeaUnitKey,
  type MapIndex,
  type TechKey,
} from '@bge/shared';

export interface AxisRouteTarget {
  id: string;
  via?: string;
}

/** A map region cannot express which ingress was chosen when routes overlap. */
export function axisUniqueTargetForMapPick<T extends AxisRouteTarget>(
  targets: readonly T[],
  id: string,
): T | undefined {
  const matches = targets.filter((target) => target.id === id);
  return matches.length === 1 ? matches[0] : undefined;
}

export function axisLegalSeaNeighbors(
  snapshot: AxisMovementSnapshot,
  idx: MapIndex,
  power: AxisRulePower,
  from: string,
): string[] {
  return (idx.seaZone[from]?.adj ?? []).filter((to) =>
    canAxisTraverseSeaEdge(snapshot, idx.map, from, to, power));
}

export function axisSurfaceHostileSea(
  snapshot: Pick<AxisMovementSnapshot, 'board'>,
  power: AxisRulePower,
  zone: string,
): boolean {
  return axisEnemySurfaceWarshipAt(snapshot, zone, power);
}

/** Legal two-space land routes for the exact selected force at one origin. */
export function axisLandTwoStepTargets(args: {
  snapshot: AxisMovementSnapshot;
  idx: MapIndex;
  power: AxisRulePower;
  from: string;
  units: readonly AxisMovementUnit[];
  techs?: readonly TechKey[];
  phase: 'combatMove' | 'noncombat';
}): AxisRouteTarget[] {
  const { snapshot, idx, power, from, units, phase } = args;
  const origin = idx.territory[from];
  if (!origin || units.length === 0) return [];
  const direct = new Set(origin.adj);
  const targets = new Map<string, AxisRouteTarget>();
  for (const via of origin.adj) {
    const intermediate = idx.territory[via];
    if (!intermediate) continue;
    for (const id of intermediate.adj) {
      if (id === from || direct.has(id)) continue;
      const route = classifyAxisLandRoute({ snapshot, idx, power, from, to: id, via, phase });
      if (!validateAxisLandForceRoute(units, route, args.techs ?? []).ok) continue;
      targets.set(`${id}|${via}`, { id, via });
    }
  }
  return [...targets.values()];
}

function selectionCanTransit(
  snapshot: Pick<AxisMovementSnapshot, 'board'>,
  power: AxisRulePower,
  zone: string,
  units: readonly AxisSeaUnitKey[],
): boolean {
  return units.every((key) => canAxisSeaUnitTransit(snapshot, zone, power, key));
}

/**
 * One- and two-zone routes for an exact selected fleet. Combat routes may end
 * in a hostile zone; noncombat endpoints must also be transit-safe. Every
 * selected ship must be legal, so mixed fleets use their most restrictive rule.
 */
export function axisSeaRouteTargets(args: {
  snapshot: AxisMovementSnapshot;
  idx: MapIndex;
  power: AxisRulePower;
  from: string;
  units: readonly AxisSeaUnitKey[];
  phase: 'combatMove' | 'noncombat';
}): AxisRouteTarget[] {
  const { snapshot, idx, power, from, units, phase } = args;
  if (!idx.seaZone[from] || units.length === 0) return [];
  const endpointAllowed = (zone: string) => phase === 'combatMove'
    || selectionCanTransit(snapshot, power, zone, units);
  const direct = axisLegalSeaNeighbors(snapshot, idx, power, from);
  const routes = new Map<string, AxisRouteTarget>();
  for (const id of direct) {
    if (endpointAllowed(id)) routes.set(id, { id });
  }
  for (const via of direct) {
    if (!selectionCanTransit(snapshot, power, via, units)) continue;
    for (const id of axisLegalSeaNeighbors(snapshot, idx, power, via)) {
      if (id === from || !endpointAllowed(id)) continue;
      routes.set(`${id}|${via}`, { id, via });
    }
  }
  return [...routes.values()];
}
