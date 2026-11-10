import { type PowerKey, type UnitKey } from './config.js';
import { airNeighbors } from './airMovement.js';
import { type MapIndex } from './map.js';
import { sameAxisRuleSide } from './movementRules.js';

export type AxisSpecialTechnologyPower = PowerKey | 'china';

export interface AxisSpecialTechnologyStack {
  readonly power: AxisSpecialTechnologyPower;
  readonly key: UnitKey;
  readonly count: number;
}

/** Minimal public board shape needed by Rockets and Paratroopers. */
export interface AxisSpecialTechnologySnapshot {
  readonly board: Readonly<Record<string, readonly AxisSpecialTechnologyStack[] | undefined>>;
  readonly control: Readonly<Record<string, AxisSpecialTechnologyPower | null | undefined>>;
  /** Spaces fought over or captured during the active power's current turn. */
  readonly contested: readonly string[];
}

export interface AxisRocketLedger {
  /** A territory can supply at most one rocket launch per turn. */
  readonly launchedFrom: readonly string[];
  /** An industrial complex can suffer at most one rocket strike per turn. */
  readonly targetedFactories: readonly string[];
}

export type AxisRocketFailure =
  | 'china-has-no-technology'
  | 'source-not-territory'
  | 'source-has-no-own-aa-gun'
  | 'source-already-launched'
  | 'target-not-territory'
  | 'target-has-no-enemy-factory'
  | 'target-already-struck'
  | 'target-out-of-range';

export interface AxisRocketValidation {
  readonly ok: boolean;
  readonly distance: number | null;
  readonly path: readonly string[];
  readonly reason?: AxisRocketFailure;
}

export interface AxisRocketDamageResult {
  readonly roll: number;
  readonly cap: number;
  readonly damageBefore: number;
  readonly appliedDamage: number;
  readonly damageAfter: number;
}

export interface AxisRocketTargetOption {
  readonly target: string;
  readonly distance: number;
  readonly path: readonly string[];
}

export type AxisParatrooperRouteFailure =
  | 'china-has-no-technology'
  | 'route-too-short'
  | 'origin-not-territory'
  | 'target-not-territory'
  | 'route-not-adjacent'
  | 'movement-exceeded'
  | 'hostile-territory-entered-before-target'
  | 'target-not-hostile-at-turn-start';

export interface AxisParatrooperRouteValidation {
  readonly ok: boolean;
  readonly movementSpent: number;
  readonly firstHostile: string | null;
  readonly reason?: AxisParatrooperRouteFailure;
}

export interface AxisParatrooperTargetOption {
  readonly target: string;
  readonly distance: number;
  /** One shortest legal route whose first hostile territory is `target`. */
  readonly route: readonly string[];
}

function positiveCount(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function hasOwnUnit(
  snapshot: Pick<AxisSpecialTechnologySnapshot, 'board'>,
  space: string,
  power: AxisSpecialTechnologyPower,
  key: UnitKey,
): boolean {
  return (snapshot.board[space] ?? []).some((stack) =>
    stack.power === power && stack.key === key && positiveCount(stack.count) > 0);
}

function hasEnemyUnit(
  snapshot: Pick<AxisSpecialTechnologySnapshot, 'board'>,
  space: string,
  power: AxisSpecialTechnologyPower,
  key: UnitKey,
): boolean {
  return (snapshot.board[space] ?? []).some((stack) =>
    stack.key === key
    && positiveCount(stack.count) > 0
    && !sameAxisRuleSide(stack.power, power));
}

/**
 * Hostility is frozen at the beginning of Combat Move for Paratroopers.
 * `contested` preserves that fact after this immediate-resolution engine has
 * already blitzed or captured a territory earlier in the same turn.
 */
export function axisTerritoryWasHostileAtTurnStart(
  snapshot: Pick<AxisSpecialTechnologySnapshot, 'control' | 'contested'>,
  idx: MapIndex,
  power: AxisSpecialTechnologyPower,
  territory: string,
): boolean {
  if (!idx.territory[territory]) return false;
  const holder = snapshot.control[territory];
  return snapshot.contested.includes(territory)
    || (holder != null && !sameAxisRuleSide(holder, power));
}

/** One deterministic shortest path on the aircraft/unified map graph. */
export function axisSpecialTechnologyShortestPath(
  idx: MapIndex,
  from: string,
  to: string,
  maxDistance: number,
  mayEnter: (space: string, distance: number) => boolean = () => true,
): string[] | null {
  const limit = Math.max(0, Math.floor(maxDistance));
  if (!idx.space[from] || !idx.space[to]) return null;
  if (from === to) return [from];

  const parent = new Map<string, string | null>([[from, null]]);
  let frontier = [from];
  for (let step = 1; step <= limit && frontier.length > 0; step++) {
    const next: string[] = [];
    for (const space of frontier) {
      for (const neighbor of airNeighbors(idx, space)) {
        if (parent.has(neighbor) || !mayEnter(neighbor, step)) continue;
        parent.set(neighbor, space);
        if (neighbor === to) {
          const path = [to];
          let cursor: string | null = space;
          while (cursor !== null) {
            path.push(cursor);
            cursor = parent.get(cursor) ?? null;
          }
          return path.reverse();
        }
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Validate one rocket strike. Neutral fly-over is rejected by `airNeighbors`,
 * which treats neutral/impassable territories as absent from the graph.
 */
export function validateAxisRocketStrike(args: {
  readonly snapshot: AxisSpecialTechnologySnapshot;
  readonly idx: MapIndex;
  readonly power: AxisSpecialTechnologyPower;
  readonly source: string;
  readonly target: string;
  readonly ledger?: AxisRocketLedger;
}): AxisRocketValidation {
  const { snapshot, idx, power, source, target } = args;
  const ledger = args.ledger ?? { launchedFrom: [], targetedFactories: [] };
  const fail = (reason: AxisRocketFailure): AxisRocketValidation => ({
    ok: false,
    distance: null,
    path: [],
    reason,
  });

  if (power === 'china') return fail('china-has-no-technology');
  if (!idx.territory[source]) return fail('source-not-territory');
  if (!hasOwnUnit(snapshot, source, power, 'aaGun')) return fail('source-has-no-own-aa-gun');
  if (ledger.launchedFrom.includes(source)) return fail('source-already-launched');
  if (!idx.territory[target]) return fail('target-not-territory');
  if (!hasEnemyUnit(snapshot, target, power, 'factory')) return fail('target-has-no-enemy-factory');
  if (ledger.targetedFactories.includes(target)) return fail('target-already-struck');

  const path = axisSpecialTechnologyShortestPath(idx, source, target, 3);
  if (!path || path.length < 2) return fail('target-out-of-range');
  return { ok: true, distance: path.length - 1, path };
}

export function axisRocketTargetOptions(args: {
  readonly snapshot: AxisSpecialTechnologySnapshot;
  readonly idx: MapIndex;
  readonly power: AxisSpecialTechnologyPower;
  readonly source: string;
  readonly ledger?: AxisRocketLedger;
}): AxisRocketTargetOption[] {
  const { snapshot, idx, power, source, ledger } = args;
  return idx.map.territories
    .map((territory) => {
      const validation = validateAxisRocketStrike({
        snapshot,
        idx,
        power,
        source,
        target: territory.id,
        ...(ledger ? { ledger } : {}),
      });
      return validation.ok && validation.distance !== null
        ? { target: territory.id, distance: validation.distance, path: validation.path }
        : null;
    })
    .filter((option): option is AxisRocketTargetOption => option !== null)
    .sort((a, b) => a.distance - b.distance || a.target.localeCompare(b.target));
}

/** Factory damage remains capped at twice the territory's printed IPC value. */
export function axisRocketDamage(
  roll: number,
  damageBefore: number,
  printedIpc: number,
): AxisRocketDamageResult {
  const safeRoll = Math.min(6, Math.max(1, Math.floor(Number.isFinite(roll) ? roll : 1)));
  const cap = Math.max(0, Math.floor(Number.isFinite(printedIpc) ? printedIpc : 0) * 2);
  const before = Math.min(cap, Math.max(0, Math.floor(Number.isFinite(damageBefore) ? damageBefore : 0)));
  const appliedDamage = Math.min(safeRoll, Math.max(0, cap - before));
  return {
    roll: safeRoll,
    cap,
    damageBefore: before,
    appliedDamage,
    damageAfter: before + appliedDamage,
  };
}

/**
 * Validate an explicit bomber route. Hostile sea zones do not stop the
 * bomber: only a land territory that was hostile at turn start does.
 */
export function validateAxisParatrooperRoute(args: {
  readonly snapshot: AxisSpecialTechnologySnapshot;
  readonly idx: MapIndex;
  readonly power: AxisSpecialTechnologyPower;
  readonly route: readonly string[];
  readonly maxMovement: number;
}): AxisParatrooperRouteValidation {
  const { snapshot, idx, power, route } = args;
  const spent = Math.max(0, route.length - 1);
  const fail = (
    reason: AxisParatrooperRouteFailure,
    firstHostile: string | null = null,
  ): AxisParatrooperRouteValidation => ({ ok: false, movementSpent: spent, firstHostile, reason });

  if (power === 'china') return fail('china-has-no-technology');
  if (route.length < 2) return fail('route-too-short');
  const origin = route[0]!;
  const target = route[route.length - 1]!;
  if (!idx.territory[origin]) return fail('origin-not-territory');
  if (!idx.territory[target]) return fail('target-not-territory');
  if (spent > Math.max(0, Math.floor(args.maxMovement))) return fail('movement-exceeded');

  for (let i = 1; i < route.length; i++) {
    if (!airNeighbors(idx, route[i - 1]!).includes(route[i]!)) return fail('route-not-adjacent');
  }

  for (let i = 1; i < route.length - 1; i++) {
    const space = route[i]!;
    if (axisTerritoryWasHostileAtTurnStart(snapshot, idx, power, space)) {
      return fail('hostile-territory-entered-before-target', space);
    }
  }
  if (!axisTerritoryWasHostileAtTurnStart(snapshot, idx, power, target)) {
    return fail('target-not-hostile-at-turn-start');
  }
  return { ok: true, movementSpent: spent, firstHostile: target };
}

/**
 * Enumerate shortest legal first-hostile destinations. Search never expands
 * through a hostile territory, so a farther enemy cannot silently be chosen.
 */
export function axisParatrooperTargetOptions(args: {
  readonly snapshot: AxisSpecialTechnologySnapshot;
  readonly idx: MapIndex;
  readonly power: AxisSpecialTechnologyPower;
  readonly origin: string;
  readonly maxMovement: number;
}): AxisParatrooperTargetOption[] {
  const { snapshot, idx, power, origin } = args;
  if (power === 'china' || !idx.territory[origin]) return [];
  const limit = Math.max(0, Math.floor(args.maxMovement));
  const seen = new Set<string>([origin]);
  const paths = new Map<string, string[]>([[origin, [origin]]]);
  const options: AxisParatrooperTargetOption[] = [];
  let frontier = [origin];

  for (let distance = 1; distance <= limit && frontier.length > 0; distance++) {
    const next: string[] = [];
    for (const space of frontier) {
      const basePath = paths.get(space)!;
      for (const neighbor of airNeighbors(idx, space)) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        const route = [...basePath, neighbor];
        paths.set(neighbor, route);
        if (axisTerritoryWasHostileAtTurnStart(snapshot, idx, power, neighbor)) {
          options.push({ target: neighbor, distance, route });
          continue;
        }
        next.push(neighbor);
      }
    }
    frontier = next;
  }

  return options.sort((a, b) => a.distance - b.distance || a.target.localeCompare(b.target));
}
