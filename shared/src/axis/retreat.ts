import {
  POWERS,
  SURFACE_WARSHIPS,
  UNITS,
  type Coalition,
  type PowerKey,
  type UnitKey,
} from './config.js';
import type { BattleState, BattleUnit } from './battle.js';
import type { MapIndex } from './map.js';

/** China is a separate combatant controlled by the USA, but belongs to the
 * Allied coalition for friendliness checks. */
export type AxisRetreatPower = PowerKey | 'china';

/** Only public board facts used by retreat legality.  Axis UnitStack is
 * structurally assignable to this smaller interface. */
export interface AxisRetreatBoardStack {
  power: AxisRetreatPower;
  key: UnitKey;
  count: number;
}

export interface AxisRetreatInputs {
  battle: BattleState;
  battleSpace: string;
  attacker: AxisRetreatPower;
  board: Readonly<Record<string, readonly AxisRetreatBoardStack[] | undefined>>;
  control: Readonly<Record<string, AxisRetreatPower | null | undefined>>;
  index: MapIndex;
  /** Sea zones containing enemy surface warships at the start of this power's
   * turn.  A naval retreat may not use one even if an earlier battle cleared
   * it during the current turn. */
  turnStartHostileSeaZones: readonly string[];
}

/** Authoritative, derived retreat state.  It intentionally contains no local
 * UI selection and therefore remains safe to recompute after reconnecting. */
export interface AxisRetreatPolicy {
  mode: 'full' | 'partial-amphibious';
  /** Exact adjacent spaces the moving land/sea group may choose. */
  destinations: string[];
  /** True when surviving land/sea units must physically move to a space. */
  destinationRequired: boolean;
  /** False when a retreat decision exists but no legal withdrawal is possible. */
  canRetreat: boolean;
  /** Surviving land/sea battle units that move together to the destination. */
  movingUnitUids: number[];
  /** Surviving aircraft that disengage but remain over the battle space. */
  aircraftUnitUids: number[];
  airDisengages: boolean;
  /** Seaborne land units that must remain in a mixed beach assault. */
  committedBeachUnitUids: number[];
  /** Submarines already removed from combat; they remain in the sea zone. */
  submergedUnitUids: number[];
}

export type AxisRetreatDestinationValidation =
  | { ok: true; destination: string | null; policy: AxisRetreatPolicy }
  | { ok: false; error: string; policy: AxisRetreatPolicy | null };

const coalitionOf = (power: AxisRetreatPower): Coalition =>
  power === 'china' ? 'allies' : POWERS[power].coalition;

const sameSide = (a: AxisRetreatPower, b: AxisRetreatPower): boolean =>
  coalitionOf(a) === coalitionOf(b);

const alive = (unit: BattleUnit): boolean => unit.hp > 0;
const isAir = (unit: BattleUnit): boolean => UNITS[unit.key].domain === 'air';

function isRouteEstablisher(unit: BattleUnit, seaCombat: boolean): boolean {
  const domain = UNITS[unit.key].domain;
  if (seaCombat) return domain === 'sea';
  // Land units unloaded from transports never establish an overland retreat
  // route. Airborne infantry likewise has no adjacent overland ingress of its
  // own; it may withdraw only when an ordinary land attacker established one.
  // This applies both to a live force and to its casualties.
  return domain === 'land'
    && unit.amphibious !== true
    && unit.role !== 'infantry';
}

function isCurrentMover(unit: BattleUnit, seaCombat: boolean): boolean {
  if (!alive(unit)) return false;
  const domain = UNITS[unit.key].domain;
  const moves = seaCombat
    ? domain === 'sea'
    : domain === 'land' && unit.amphibious !== true;
  if (!moves) return false;
  // A submerged submarine has already left the battle board and stays in the
  // contested sea zone rather than joining a later surface withdrawal.
  return !(seaCombat && unit.submerged === true);
}

function currentlyFriendlyLand(inputs: AxisRetreatInputs, space: string): boolean {
  const holder = inputs.control[space];
  return holder != null && sameSide(holder, inputs.attacker);
}

function currentlyFriendlySea(inputs: AxisRetreatInputs, space: string): boolean {
  return !(inputs.board[space] ?? []).some((stack) =>
    stack.count > 0
    && SURFACE_WARSHIPS.includes(stack.key)
    && !sameSide(stack.power, inputs.attacker));
}

function isAdjacentInDomain(inputs: AxisRetreatInputs, space: string, seaCombat: boolean): boolean {
  if (space === inputs.battleSpace) return false;
  if (seaCombat) {
    const battleZone = inputs.index.seaZone[inputs.battleSpace];
    return Boolean(battleZone && inputs.index.seaZone[space] && battleZone.adj.includes(space));
  }
  const battleTerritory = inputs.index.territory[inputs.battleSpace];
  return Boolean(battleTerritory && inputs.index.territory[space] && battleTerritory.adj.includes(space));
}

function legalEstablishedDestinations(
  inputs: AxisRetreatInputs,
  establishers: readonly BattleUnit[],
  seaCombat: boolean,
): string[] {
  const hostileAtTurnStart = new Set(inputs.turnStartHostileSeaZones);
  const seen = new Set<string>();
  const destinations: string[] = [];

  // Do not filter establishers by hp.  Entering the battle establishes the
  // route permanently; later casualty choices cannot erase it.
  for (const unit of establishers) {
    const space = unit.ingressFrom;
    if (!space || seen.has(space) || !isAdjacentInDomain(inputs, space, seaCombat)) continue;
    const friendly = seaCombat
      ? !hostileAtTurnStart.has(space) && currentlyFriendlySea(inputs, space)
      : currentlyFriendlyLand(inputs, space);
    if (!friendly) continue;
    seen.add(space);
    destinations.push(space);
  }
  return destinations;
}

/**
 * Derive the exact legal withdrawal group and destinations for the current
 * between-round retreat decision.  This function is deliberately pure: it
 * never annotates the battle, board, control map, or input arrays.
 */
export function deriveAxisRetreatPolicy(inputs: AxisRetreatInputs): AxisRetreatPolicy | null {
  const decision = inputs.battle.decision;
  if (decision?.type !== 'retreat') return null;

  const seaCombat = inputs.battle.ctx.seaCombat;
  const partial = decision.partial === true;
  const establishers = inputs.battle.attacker.filter((unit) => isRouteEstablisher(unit, seaCombat));
  const movers = inputs.battle.attacker.filter((unit) => isCurrentMover(unit, seaCombat));
  const aircraft = inputs.battle.attacker.filter((unit) => alive(unit) && isAir(unit));
  const committedBeach = partial
    ? inputs.battle.attacker.filter((unit) => alive(unit) && unit.amphibious === true)
    : [];
  const submerged = seaCombat
    ? inputs.battle.attacker.filter((unit) => alive(unit) && unit.submerged === true)
    : [];

  const destinationRequired = movers.length > 0;
  const destinations = destinationRequired
    ? legalEstablishedDestinations(inputs, establishers, seaCombat)
    : [];
  const canRetreat = destinationRequired
    ? destinations.length > 0
    : aircraft.length > 0;

  return {
    mode: partial ? 'partial-amphibious' : 'full',
    destinations,
    destinationRequired,
    canRetreat,
    movingUnitUids: movers.map((unit) => unit.uid),
    aircraftUnitUids: aircraft.map((unit) => unit.uid),
    airDisengages: aircraft.length > 0,
    committedBeachUnitUids: committedBeach.map((unit) => unit.uid),
    submergedUnitUids: submerged.map((unit) => unit.uid),
  };
}

/** Validate an exact retreat destination without mutating authoritative state. */
export function validateAxisRetreatDestination(
  inputs: AxisRetreatInputs,
  destination: unknown,
): AxisRetreatDestinationValidation {
  const policy = deriveAxisRetreatPolicy(inputs);
  if (!policy) return { ok: false, error: 'No retreat decision is pending.', policy: null };
  if (!policy.canRetreat) {
    return {
      ok: false,
      error: policy.destinationRequired
        ? 'No adjacent friendly ingress route is available for this force.'
        : 'No attacking units can retreat.',
      policy,
    };
  }
  if (policy.destinationRequired) {
    if (typeof destination !== 'string' || !policy.destinations.includes(destination)) {
      return { ok: false, error: 'Choose one of the exact legal retreat destinations.', policy };
    }
    return { ok: true, destination, policy };
  }
  if (destination !== null) {
    return { ok: false, error: 'Aircraft disengage over the battle space; their retreat destination must be null.', policy };
  }
  return { ok: true, destination: null, policy };
}
