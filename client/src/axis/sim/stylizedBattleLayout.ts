import { type Domain, type SimUnit, type Side, type UnitVisual, visualFor } from './battlescene';

export type StylizedRole = 'frontline' | 'armor' | 'support' | 'air' | 'structure' | 'naval';

export interface StylizedPlacement {
  readonly unit: SimUnit;
  readonly x: number;
  readonly z: number;
  readonly rotationY: number;
  readonly scale: number;
  readonly role: StylizedRole;
  readonly row: number;
  readonly column: number;
}

export interface StylizedVolleyLink {
  readonly firingId: string;
  readonly targetId: string;
  readonly delayMs: number;
}

export interface StylizedCameraPlan {
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly unitScale: number;
  readonly fov: number;
}

/**
 * Frame sparse engagements like a tabletop vignette while retaining the wide,
 * GPU-safe overview required for large formations. The thresholds are shared
 * by the intro camera, orbit controls, and sculpt scale so they cannot drift.
 */
export function stylizedCameraPlan(unitCount: number, domain: Domain): StylizedCameraPlan {
  const sparse = unitCount <= 4;
  const standard = unitCount <= 10;
  if (domain === 'sea') {
    if (sparse) return { start: [-34, 29, -42], end: [21, 25, 33], minDistance: 28, maxDistance: 68, unitScale: 1.25, fov: 40 };
    if (standard) return { start: [-38, 32, -45], end: [24, 28, 37], minDistance: 30, maxDistance: 74, unitScale: 1.12, fov: 41 };
    return { start: [-41, 35, -48], end: [28, 32, 42], minDistance: 32, maxDistance: 78, unitScale: 1, fov: 42 };
  }
  if (sparse) return { start: [-27, 23, -34], end: [17, 18, 25], minDistance: 22, maxDistance: 58, unitScale: 1.5, fov: 40 };
  if (standard) return { start: [-31, 26, -39], end: [20, 22, 30], minDistance: 27, maxDistance: 68, unitScale: 1.25, fov: 42 };
  return { start: [-34, 28, -43], end: [24, 25, 35], minDistance: 32, maxDistance: 78, unitScale: 1, fov: 44 };
}

const scaleByType: Readonly<Record<string, number>> = {
  infantry: 0.88,
  artillery: 0.94,
  aaGun: 0.94,
  tank: 1.04,
  mechInfantry: 1,
  fighter: 0.92,
  tacticalBomber: 1,
  bomber: 1.12,
  submarine: 1,
  destroyer: 1,
  cruiser: 1.08,
  transport: 1.08,
  carrier: 1.24,
  battleship: 1.2,
  factory: 1.04,
};

export function stylizedRole(type: string, visual: UnitVisual = visualFor(type)): StylizedRole {
  if (type === 'factory') return 'structure';
  if (visual.air) return 'air';
  if (visual.shape === 'warship' || visual.shape === 'carrier' || visual.shape === 'sub') return 'naval';
  if (type === 'tank' || type === 'mechInfantry') return 'armor';
  if (type === 'artillery' || type === 'aaGun') return 'support';
  return 'frontline';
}

const roleOrder: Readonly<Record<StylizedRole, number>> = {
  frontline: 0,
  armor: 1,
  support: 2,
  naval: 1,
  air: 3,
  structure: 4,
};

/**
 * Compact command-diorama formation. Rows advance toward the center and unit
 * roles stay stable, so casualties never turn the battlefield into a jumble.
 */
export function stylizedFormation(
  units: readonly SimUnit[],
  side: Side,
  domain: Domain,
): StylizedPlacement[] {
  const direction = side === 'attacker' ? -1 : 1;
  const ordered = units
    .map((unit, index) => ({ unit, index, role: stylizedRole(unit.type) }))
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.index - b.index);
  const perRow = Math.max(3, Math.min(domain === 'sea' ? 5 : 6, Math.ceil(Math.sqrt(Math.max(1, units.length) * 1.45))));
  const spacingX = domain === 'sea' ? 6.5 : 4.7;
  const spacingZ = domain === 'sea' ? 6.3 : 4.8;
  const front = domain === 'sea' ? 5.2 : 4.2;

  return ordered.map(({ unit, role }, index) => {
    const row = Math.floor(index / perRow);
    const column = index % perRow;
    const rowCount = Math.min(perRow, ordered.length - row * perRow);
    return {
      unit,
      x: (column - (rowCount - 1) / 2) * spacingX + (row % 2 ? spacingX * 0.22 : 0),
      z: direction * (front + row * spacingZ),
      rotationY: side === 'attacker' ? 0 : Math.PI,
      scale: scaleByType[unit.type] ?? 1,
      role,
      row,
      column,
    };
  });
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministically pair every firing sculpt with a visible opposing target. */
export function stylizedVolleyLinks(args: {
  readonly units: readonly SimUnit[];
  readonly firingIds: readonly string[];
  readonly preferredTargetIds?: readonly string[];
  readonly destroyedIds?: readonly string[];
}): StylizedVolleyLink[] {
  const { units, firingIds } = args;
  const destroyed = new Set(args.destroyedIds ?? []);
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const preferred = (args.preferredTargetIds ?? [])
    .filter((id) => byId.has(id) && !destroyed.has(id));

  return firingIds.flatMap((firingId, index) => {
    const firing = byId.get(firingId);
    if (!firing || destroyed.has(firingId)) return [];
    const ordinary = units
      .filter((unit) => unit.side !== firing.side && !destroyed.has(unit.id))
      .map((unit) => unit.id);
    const candidates = preferred.filter((id) => byId.get(id)?.side !== firing.side);
    const pool = candidates.length > 0 ? candidates : ordinary;
    if (pool.length === 0) return [];
    const targetId = pool[stableHash(firingId) % pool.length]!;
    return [{ firingId, targetId, delayMs: index * 85 }];
  });
}
