import { POWERS, UNITS, type PowerKey, type TechKey, type UnitKey } from './config.js';
import { isSeaZoneId, type MapIndex } from './map.js';
import type { UnitStack } from './state.js';
import { axisEnemySurfaceWarshipAt } from './movementRules.js';

export type AirUnitKey = Extract<UnitKey, 'fighter' | 'bomber'>;

export interface AirBoardSnapshot {
  board: Record<string, UnitStack[]>;
  control: Record<string, PowerKey | 'china' | null>;
  /** Spaces captured/contested this turn cannot be used as aircraft landings. */
  contested?: readonly string[];
}

export interface AirUnitGroup {
  from: string;
  key: AirUnitKey;
  count: number;
  /** Movement already spent by these physical aircraft earlier this turn. */
  movementSpent?: number;
  /** Purchased-carrier destination reserved for this exact fighter group. */
  futureCarrierZone?: string;
}

/** A carrier that is part of the same order. `cargoFighters` are allied guests
 * already occupying its deck and moving with it. */
export interface CarrierMoveProjection {
  from: string;
  to: string;
  count: number;
  cargoFighters?: number;
}

export interface CarrierDeckStatus {
  capacity: number;
  occupied: number;
  open: number;
  hostile: boolean;
}

export interface AirLandingResult {
  ok: boolean;
  error?: string;
}

export interface StrandedAircraftGroup {
  space: string;
  key: AirUnitKey;
  count: number;
  reason: 'hostile-territory' | 'no-carrier' | 'bomber-at-sea';
}

const coalitionOf = (power: PowerKey | 'china') => power === 'china' ? 'allies' : POWERS[power].coalition;
export const sameAxisSide = (a: PowerKey | 'china', b: PowerKey | 'china') => coalitionOf(a) === coalitionOf(b);

const isNeutralTerritory = (idx: MapIndex, space: string) => {
  const territory = idx.territory[space];
  return Boolean(territory && (territory.originalOwner === null || territory.isImpassable));
};

/** Air uses the unified map graph. Crossing between a coast and its sea zone
 * costs one movement point; strict neutrals are neither destinations nor
 * fly-over shortcuts. Canals do not restrict aircraft. */
export function airNeighbors(idx: MapIndex, space: string): string[] {
  const territory = idx.territory[space];
  const zone = idx.seaZone[space];
  const raw = territory
    ? [...territory.adj, ...(territory.coastTo ?? [])]
    : zone
      ? [...zone.adj, ...(zone.coastTo ?? [])]
      : [];
  return [...new Set(raw)].filter((next) => isSeaZoneId(next) || !isNeutralTerritory(idx, next));
}

export function airUnitRange(key: AirUnitKey, techs: readonly TechKey[] = []): number {
  return UNITS[key].move + (techs.includes('longRangeAircraft') ? 2 : 0);
}

/** Shortest air distances up to the supplied range. The origin is distance 0. */
export function airReachableDistances(idx: MapIndex, from: string, maxRange: number): Map<string, number> {
  const distances = new Map<string, number>([[from, 0]]);
  let frontier = [from];
  for (let distance = 1; distance <= Math.max(0, Math.floor(maxRange)); distance++) {
    const next: string[] = [];
    for (const space of frontier) {
      for (const neighbor of airNeighbors(idx, space)) {
        if (distances.has(neighbor)) continue;
        distances.set(neighbor, distance);
        next.push(neighbor);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return distances;
}

export function airDistance(idx: MapIndex, from: string, to: string, maxRange: number): number | null {
  return airReachableDistances(idx, from, maxRange).get(to) ?? null;
}

export function airReachableSpaces(
  idx: MapIndex,
  from: string,
  key: AirUnitKey,
  techs: readonly TechKey[] = [],
  movementSpent = 0,
): { space: string; distance: number }[] {
  return [...airReachableDistances(idx, from, Math.max(0, airUnitRange(key, techs) - movementSpent))]
    .filter(([space]) => space !== from)
    .map(([space, distance]) => ({ space, distance }));
}

function enemyPresent(snapshot: AirBoardSnapshot, power: PowerKey, space: string): boolean {
  return (snapshot.board[space] ?? []).some((stack) => !sameAxisSide(stack.power, power));
}

export function isFriendlyAirLandingTerritory(
  snapshot: AirBoardSnapshot,
  idx: MapIndex,
  power: PowerKey,
  space: string,
): boolean {
  const territory = idx.territory[space];
  if (!territory || isNeutralTerritory(idx, space)) return false;
  const holder = snapshot.control[space];
  return holder != null
    && sameAxisSide(holder, power)
    && !enemyPresent(snapshot, power, space)
    && !(snapshot.contested ?? []).includes(space);
}

/** Current physical deck capacity. Every same-side fighter in the zone or in
 * carrier cargo consumes a slot, regardless of which allied power owns it. */
export function carrierDeckStatus(
  snapshot: AirBoardSnapshot,
  power: PowerKey,
  zone: string,
): CarrierDeckStatus {
  if (!isSeaZoneId(zone)) return { capacity: 0, occupied: 0, open: 0, hostile: true };
  const stacks = snapshot.board[zone] ?? [];
  // Submarines and transports do not make a sea zone hostile. Fighters may
  // land on a friendly carrier sharing a zone with only those enemy units.
  const hostile = axisEnemySurfaceWarshipAt(snapshot, zone, power);
  const capacity = stacks
    .filter((stack) => stack.key === 'carrier' && sameAxisSide(stack.power, power))
    .reduce((total, stack) => total + stack.count * 2, 0);
  const looseFighters = stacks
    .filter((stack) => stack.key === 'fighter' && sameAxisSide(stack.power, power))
    .reduce((total, stack) => total + stack.count, 0);
  const cargoFighters = stacks
    .filter((stack) => stack.key === 'carrier' && sameAxisSide(stack.power, power))
    .flatMap((stack) => stack.cargo ?? [])
    .filter((cargo) => cargo.key === 'fighter' && sameAxisSide(cargo.power, power))
    .reduce((total, cargo) => total + cargo.count, 0);
  const occupied = looseFighters + cargoFighters;
  return { capacity, occupied, open: hostile ? 0 : Math.max(0, capacity - occupied), hostile };
}

function projectedCarrierDeckStatus(
  snapshot: AirBoardSnapshot,
  power: PowerKey,
  zone: string,
  air: readonly AirUnitGroup[],
  carrierMoves: readonly CarrierMoveProjection[],
  allowHostile: boolean,
): CarrierDeckStatus {
  const base = carrierDeckStatus(snapshot, power, zone);
  let capacity = base.capacity;
  let occupied = base.occupied;
  for (const move of carrierMoves) {
    const guests = Math.max(0, move.cargoFighters ?? 0);
    if (move.from === zone) {
      capacity -= Math.max(0, move.count) * 2;
      occupied -= guests;
    }
    if (move.to === zone) {
      capacity += Math.max(0, move.count) * 2;
      occupied += guests;
    }
  }
  // Selected fighters leave their current decks before evaluating where the
  // attacking/moving group can land.
  occupied -= air
    .filter((unit) => unit.key === 'fighter' && unit.from === zone)
    .reduce((total, unit) => total + Math.max(0, unit.count), 0);
  capacity = Math.max(0, capacity);
  occupied = Math.max(0, occupied);
  const hostile = base.hostile && !allowHostile;
  return { capacity, occupied, open: hostile ? 0 : Math.max(0, capacity - occupied), hostile };
}

/** Validate a noncombat endpoint for a complete selected air group. Carrier
 * projections allow a carrier and its fighters (even from different origins)
 * to arrive together without offering over-capacity water destinations. */
export function validateAirNoncombatLanding(args: {
  snapshot: AirBoardSnapshot;
  idx: MapIndex;
  power: PowerKey;
  techs?: readonly TechKey[];
  air: readonly AirUnitGroup[];
  destination: string;
  carrierMoves?: readonly CarrierMoveProjection[];
}): AirLandingResult {
  const { snapshot, idx, power, air, destination } = args;
  const techs = args.techs ?? [];
  const carrierMoves = args.carrierMoves ?? [];
  for (const unit of air) {
    if (unit.count <= 0) continue;
    const remaining = Math.max(0, airUnitRange(unit.key, techs) - Math.max(0, unit.movementSpent ?? 0));
    if (airDistance(idx, unit.from, destination, remaining) == null) {
      return { ok: false, error: `${UNITS[unit.key].name} cannot reach that landing space.` };
    }
  }
  if (!isSeaZoneId(destination)) {
    if (air.some((unit) => unit.futureCarrierZone !== undefined)) {
      return { ok: false, error: 'A purchased-carrier promise must name a sea zone.' };
    }
    return isFriendlyAirLandingTerritory(snapshot, idx, power, destination)
      ? { ok: true }
      : { ok: false, error: 'Aircraft must land in friendly territory held before this turn.' };
  }
  if (air.some((unit) => unit.key === 'bomber' && unit.count > 0)) {
    return { ok: false, error: 'Bombers cannot land at sea.' };
  }
  const futureFighters = air.filter((unit) => unit.futureCarrierZone !== undefined);
  if (futureFighters.some((unit) => unit.key !== 'fighter'
    || unit.futureCarrierZone !== destination
    || !idx.seaZone[unit.futureCarrierZone])) {
    return { ok: false, error: 'That purchased-carrier promise does not match this fighter landing.' };
  }
  const fighters = air.reduce((total, unit) => total + (
    unit.key === 'fighter' && unit.futureCarrierZone === undefined ? Math.max(0, unit.count) : 0
  ), 0);
  const deck = projectedCarrierDeckStatus(snapshot, power, destination, air, carrierMoves, false);
  if (deck.hostile && fighters > 0) return { ok: false, error: 'Aircraft cannot land in a hostile sea zone.' };
  return deck.open >= fighters
    ? { ok: true }
    : { ok: false, error: `Not enough carrier deck space (${fighters} fighter${fighters === 1 ? '' : 's'}, ${deck.open} open).` };
}

interface FighterLandingNeed { count: number; zones: string[] }

/** Maximum flow from fighter groups to finite carrier-zone capacities. */
function carrierAssignmentPossible(needs: FighterLandingNeed[], capacityByZone: Map<string, number>): boolean {
  const zones = [...capacityByZone].filter(([, capacity]) => capacity > 0).map(([zone]) => zone);
  const source = 0;
  const needStart = 1;
  const zoneStart = needStart + needs.length;
  const sink = zoneStart + zones.length;
  const size = sink + 1;
  const capacity = Array.from({ length: size }, () => Array<number>(size).fill(0));
  needs.forEach((need, index) => {
    capacity[source][needStart + index] = need.count;
    need.zones.forEach((zone) => {
      const zoneIndex = zones.indexOf(zone);
      if (zoneIndex >= 0) capacity[needStart + index][zoneStart + zoneIndex] = need.count;
    });
  });
  zones.forEach((zone, index) => { capacity[zoneStart + index][sink] = capacityByZone.get(zone) ?? 0; });

  let flow = 0;
  while (true) {
    const parent = Array<number>(size).fill(-1);
    parent[source] = source;
    const queue = [source];
    for (let q = 0; q < queue.length && parent[sink] < 0; q++) {
      const node = queue[q];
      for (let next = 0; next < size; next++) {
        if (parent[next] >= 0 || capacity[node][next] <= 0) continue;
        parent[next] = node;
        queue.push(next);
      }
    }
    if (parent[sink] < 0) break;
    let pushed = Number.POSITIVE_INFINITY;
    for (let node = sink; node !== source; node = parent[node]) {
      pushed = Math.min(pushed, capacity[parent[node]][node]);
    }
    for (let node = sink; node !== source; node = parent[node]) {
      capacity[parent[node]][node] -= pushed;
      capacity[node][parent[node]] += pushed;
    }
    flow += pushed;
  }
  return flow >= needs.reduce((total, need) => total + need.count, 0);
}

/** Validate the no-suicide rule for an entire attacking air group. Attackers
 * may fly their full range only when the unused movement can reach friendly
 * preexisting land or enough projected carrier slots after combat. */
export function validateAirAttackLanding(args: {
  snapshot: AirBoardSnapshot;
  idx: MapIndex;
  power: PowerKey;
  techs?: readonly TechKey[];
  air: readonly AirUnitGroup[];
  target: string;
  carrierMoves?: readonly CarrierMoveProjection[];
}): AirLandingResult {
  const { snapshot, idx, power, air, target } = args;
  const techs = args.techs ?? [];
  const carrierMoves = args.carrierMoves ?? [];
  if (air.length === 0) return { ok: true };

  const remainingByGroup: { unit: AirUnitGroup; remaining: number }[] = [];
  for (const unit of air) {
    if (unit.count <= 0) continue;
    const range = Math.max(0, airUnitRange(unit.key, techs) - Math.max(0, unit.movementSpent ?? 0));
    const distance = airDistance(idx, unit.from, target, range);
    if (distance == null) return { ok: false, error: `${UNITS[unit.key].name} cannot reach the battle.` };
    remainingByGroup.push({ unit, remaining: range - distance });
  }

  const maxRemaining = remainingByGroup.reduce((max, item) => Math.max(max, item.remaining), 0);
  const fromTarget = airReachableDistances(idx, target, maxRemaining);
  const friendlyLand = Object.keys(idx.territory).filter((space) =>
    isFriendlyAirLandingTerritory(snapshot, idx, power, space));
  const incomingCarrierZones = new Set(carrierMoves.filter((move) => move.count > 0).map((move) => move.to));
  const carrierCapacity = new Map<string, number>();
  for (const zone of Object.keys(idx.seaZone)) {
    const allowHostile = zone === target && incomingCarrierZones.has(zone);
    const deck = projectedCarrierDeckStatus(snapshot, power, zone, air, carrierMoves, allowHostile);
    if (deck.open > 0) carrierCapacity.set(zone, deck.open);
  }

  const fighterNeeds: FighterLandingNeed[] = [];
  for (const { unit, remaining } of remainingByGroup) {
    if (unit.futureCarrierZone !== undefined) {
      if (unit.key !== 'fighter' || !idx.seaZone[unit.futureCarrierZone]) {
        return { ok: false, error: 'Only an exact fighter may rely on a purchased carrier.' };
      }
      if ((fromTarget.get(unit.futureCarrierZone) ?? Number.POSITIVE_INFINITY) > remaining) {
        return { ok: false, error: 'The fighter cannot reach its declared purchased-carrier sea zone after combat.' };
      }
      // Reservation accounting is global and durable in the action reducer.
      // Excluding this group here prevents ordinary fighters from borrowing
      // its future deck while retaining the normal max-flow for every other
      // aircraft in the attack.
      continue;
    }
    const canLandOnLand = friendlyLand.some((space) => (fromTarget.get(space) ?? Number.POSITIVE_INFINITY) <= remaining);
    if (canLandOnLand) continue; // unlimited capacity
    if (unit.key === 'bomber') return { ok: false, error: 'The bomber has no legal landing territory after this attack.' };
    const zones = [...carrierCapacity.keys()].filter((zone) => (fromTarget.get(zone) ?? Number.POSITIVE_INFINITY) <= remaining);
    if (zones.length === 0) return { ok: false, error: 'The fighter has no legal carrier or territory after this attack.' };
    fighterNeeds.push({ count: unit.count, zones });
  }

  return carrierAssignmentPossible(fighterNeeds, carrierCapacity)
    ? { ok: true }
    : { ok: false, error: 'The attacking fighters would exceed the available carrier landing capacity.' };
}

/** Safety-net report used by both the engine and the player warning. Legal move
 * controls should prevent creating these groups, but restored/legacy states are
 * still resolved deterministically at the end of noncombat. */
export function strandedAircraftForPower(
  snapshot: AirBoardSnapshot,
  idx: MapIndex,
  power: PowerKey,
): StrandedAircraftGroup[] {
  const result: StrandedAircraftGroup[] = [];
  for (const [space, stacks] of Object.entries(snapshot.board)) {
    const ownFighters = stacks
      .filter((stack) => stack.power === power && stack.key === 'fighter')
      .reduce((total, stack) => total + Math.max(0, stack.count - (
        stack.count === 1 && stack.carrierLanding?.seaZone === space ? 1 : 0
      )), 0);
    const ownBombers = stacks
      .filter((stack) => stack.power === power && stack.key === 'bomber')
      .reduce((total, stack) => total + stack.count, 0);
    if (ownFighters === 0 && ownBombers === 0) continue;
    if (isSeaZoneId(space)) {
      if (ownBombers > 0) result.push({ space, key: 'bomber', count: ownBombers, reason: 'bomber-at-sea' });
      if (ownFighters > 0) {
        const deck = carrierDeckStatus(snapshot, power, space);
        const overflow = Math.min(ownFighters, Math.max(0, deck.occupied - deck.capacity));
        if (deck.hostile || overflow > 0) {
          result.push({ space, key: 'fighter', count: deck.hostile ? ownFighters : overflow, reason: 'no-carrier' });
        }
      }
    } else if (!isFriendlyAirLandingTerritory(snapshot, idx, power, space)) {
      if (ownFighters > 0) result.push({ space, key: 'fighter', count: ownFighters, reason: 'hostile-territory' });
      if (ownBombers > 0) result.push({ space, key: 'bomber', count: ownBombers, reason: 'hostile-territory' });
    }
  }
  return result;
}
