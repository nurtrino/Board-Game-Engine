import {
  POWERS,
  SURFACE_WARSHIPS,
  UNITS,
  type PowerKey,
  type TechKey,
  type UnitKey,
} from './config.js';
import type { AxisMap, CanalDef, MapIndex, TerritoryDef } from './map.js';

export type AxisRulePower = PowerKey | 'china';

export interface AxisMovementCargo {
  readonly power: AxisRulePower;
  readonly key: UnitKey;
  readonly count: number;
}

/** The smallest board shape required by movement and placement rule helpers. */
export interface AxisMovementStack {
  readonly power: AxisRulePower;
  readonly key: UnitKey;
  readonly count: number;
  readonly cargo?: readonly AxisMovementCargo[];
}

export interface AxisMovementSnapshot {
  readonly board: Readonly<Record<string, readonly AxisMovementStack[] | undefined>>;
  readonly control: Readonly<Record<string, AxisRulePower | null | undefined>>;
  /** Spaces fought over or captured during the active power's current turn. */
  readonly contested: readonly string[];
}

export interface AxisMovementUnit {
  readonly key: UnitKey;
  readonly count: number;
}

export type AxisLandRouteKind = 'one-space' | 'friendly-two-space' | 'tank-blitz';

export type AxisLandForceRouteFailure =
  | 'no-route'
  | 'two-space-unit'
  | 'mechanized-infantry-required'
  | 'mechanized-tank-required'
  | 'infantry-cannot-blitz';

export interface AxisLandForceRouteResult {
  readonly ok: boolean;
  readonly route: AxisLandRouteKind | null;
  readonly reason?: AxisLandForceRouteFailure;
  readonly infantry: number;
  readonly tanks: number;
  readonly missingTanks: number;
  readonly ineligible: readonly UnitKey[];
}

export type AxisControlScope = 'power' | 'side';

export type AxisSeaUnitKey = Extract<
  UnitKey,
  'battleship' | 'carrier' | 'cruiser' | 'destroyer' | 'submarine' | 'transport'
>;

function coalitionOf(power: AxisRulePower): 'axis' | 'allies' {
  return power === 'china' ? 'allies' : POWERS[power].coalition;
}

export function sameAxisRuleSide(a: AxisRulePower, b: AxisRulePower): boolean {
  return coalitionOf(a) === coalitionOf(b);
}

function positiveCount(count: number): number {
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function isPassableTerritory(territory: TerritoryDef | undefined): territory is TerritoryDef {
  return Boolean(territory && territory.originalOwner !== null && !territory.isImpassable);
}

function enemyUnitAt(snapshot: AxisMovementSnapshot, space: string, power: AxisRulePower): boolean {
  return (snapshot.board[space] ?? []).some((stack) =>
    positiveCount(stack.count) > 0 && !sameAxisRuleSide(stack.power, power));
}

/**
 * Classify an explicit land route without deciding whether the selected force
 * has the required movement abilities. A missing `via` always means a direct
 * one-space route. A hostile empty intermediate is a tank blitz only during
 * Combat Move; mechanized infantry validation remains a separate step.
 */
export function classifyAxisLandRoute(args: {
  readonly snapshot: AxisMovementSnapshot;
  readonly idx: MapIndex;
  readonly power: AxisRulePower;
  readonly from: string;
  readonly to: string;
  readonly via?: string;
  readonly phase: 'combatMove' | 'noncombat';
}): AxisLandRouteKind | null {
  const { snapshot, idx, power, from, to, via, phase } = args;
  const origin = idx.territory[from];
  const destination = idx.territory[to];
  if (!isPassableTerritory(origin) || !isPassableTerritory(destination)) return null;

  if (via === undefined) return origin.adj.includes(to) ? 'one-space' : null;

  const intermediate = idx.territory[via];
  if (!isPassableTerritory(intermediate)
    || !origin.adj.includes(via)
    || !intermediate.adj.includes(to)
    || enemyUnitAt(snapshot, via, power)) return null;

  const holder = snapshot.control[via];
  if (holder != null && sameAxisRuleSide(holder, power)) {
    // Combat movement is simultaneous. A territory captured by an earlier
    // immediately-resolved order is not a new route for later combat orders.
    if (phase === 'combatMove' && snapshot.contested.includes(via)) return null;
    return 'friendly-two-space';
  }
  if (phase === 'combatMove' && holder != null) return 'tank-blitz';
  return null;
}

/**
 * Validate the selected land force against a classified route. On a friendly
 * two-space route, each infantry needs both Mechanized Infantry and one tank
 * selected from the same origin. Only tanks may use a hostile blitz route.
 */
export function validateAxisLandForceRoute(
  units: readonly AxisMovementUnit[],
  route: AxisLandRouteKind | null,
  techs: readonly TechKey[] = [],
): AxisLandForceRouteResult {
  const infantry = units
    .filter((unit) => unit.key === 'infantry')
    .reduce((total, unit) => total + positiveCount(unit.count), 0);
  const tanks = units
    .filter((unit) => unit.key === 'tank')
    .reduce((total, unit) => total + positiveCount(unit.count), 0);
  const missingTanks = Math.max(0, infantry - tanks);

  if (route === null) {
    return { ok: false, route, reason: 'no-route', infantry, tanks, missingTanks, ineligible: [] };
  }
  if (route === 'one-space') {
    return { ok: true, route, infantry, tanks, missingTanks: 0, ineligible: [] };
  }

  const ineligible = [...new Set(units
    .filter((unit) => positiveCount(unit.count) > 0 && unit.key !== 'tank' && unit.key !== 'infantry')
    .map((unit) => unit.key))];
  if (ineligible.length > 0) {
    return { ok: false, route, reason: 'two-space-unit', infantry, tanks, missingTanks, ineligible };
  }

  if (route === 'tank-blitz') {
    return infantry > 0
      ? { ok: false, route, reason: 'infantry-cannot-blitz', infantry, tanks, missingTanks, ineligible: [] }
      : { ok: true, route, infantry, tanks, missingTanks: 0, ineligible: [] };
  }

  if (infantry > 0 && !techs.includes('mechanizedInfantry')) {
    return { ok: false, route, reason: 'mechanized-infantry-required', infantry, tanks, missingTanks, ineligible: [] };
  }
  if (missingTanks > 0) {
    return { ok: false, route, reason: 'mechanized-tank-required', infantry, tanks, missingTanks, ineligible: [] };
  }
  return { ok: true, route, infantry, tanks, missingTanks: 0, ineligible: [] };
}

/** Current control plus `contested` is the authoritative start-of-turn test. */
export function axisControlledSinceTurnStart(
  snapshot: Pick<AxisMovementSnapshot, 'control' | 'contested'>,
  territory: string,
  power: AxisRulePower,
  scope: AxisControlScope = 'power',
): boolean {
  const holder = snapshot.control[territory];
  if (holder == null || snapshot.contested.includes(territory)) return false;
  return scope === 'side' ? sameAxisRuleSide(holder, power) : holder === power;
}

export function axisCanalBetween(map: AxisMap, from: string, to: string): CanalDef | undefined {
  return map.canals.find((canal) =>
    (canal.connects[0] === from && canal.connects[1] === to)
    || (canal.connects[1] === from && canal.connects[0] === to));
}

/** Ordinary sea adjacency is open; canal edges require side control all turn. */
export function canAxisTraverseSeaEdge(
  snapshot: Pick<AxisMovementSnapshot, 'control' | 'contested'>,
  map: AxisMap,
  from: string,
  to: string,
  power: AxisRulePower,
): boolean {
  const origin = map.seaZones.find((zone) => zone.id === from);
  if (!origin || !origin.adj.includes(to)) return false;
  const canal = axisCanalBetween(map, from, to);
  return canal === undefined || canal.controlledBy.every((territory) =>
    axisControlledSinceTurnStart(snapshot, territory, power, 'side'));
}

export function axisEnemySurfaceWarshipAt(
  snapshot: Pick<AxisMovementSnapshot, 'board'>,
  zone: string,
  power: AxisRulePower,
): boolean {
  return (snapshot.board[zone] ?? []).some((stack) =>
    positiveCount(stack.count) > 0
    && !sameAxisRuleSide(stack.power, power)
    && SURFACE_WARSHIPS.includes(stack.key));
}

export function axisEnemyDestroyerAt(
  snapshot: Pick<AxisMovementSnapshot, 'board'>,
  zone: string,
  power: AxisRulePower,
): boolean {
  return (snapshot.board[zone] ?? []).some((stack) =>
    positiveCount(stack.count) > 0
    && stack.key === 'destroyer'
    && !sameAxisRuleSide(stack.power, power));
}

/**
 * Whether a sea unit may pass through a zone (and, equivalently, end there in
 * Noncombat Move). Submarines ignore surface hostility unless an enemy
 * destroyer detects them; every other sea unit is stopped by surface warships.
 * Enemy submarines and transports block neither case.
 */
export function canAxisSeaUnitTransit(
  snapshot: Pick<AxisMovementSnapshot, 'board'>,
  zone: string,
  power: AxisRulePower,
  key: AxisSeaUnitKey,
): boolean {
  if (UNITS[key].domain !== 'sea') return false;
  return key === 'submarine'
    ? !axisEnemyDestroyerAt(snapshot, zone, power)
    : !axisEnemySurfaceWarshipAt(snapshot, zone, power);
}
