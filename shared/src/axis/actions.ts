// Axis & Allies Anniversary — the turn/phase machine and every player action.
// Phase order (rulebook p6): RND (optional) -> Purchase -> Combat Move ->
// Conduct Combat -> Noncombat Move -> Mobilize -> Collect Income.
// Owner decision: a combat move resolves IMMEDIATELY — declaring an attack
// assembles the battle right away (phase 'battle'), then play returns to
// 'combatMove' for the next attack.

import {
  POWERS, TURN_ORDER, UNITS, TECHS, TECH_BY_KEY, SHIPYARD_COSTS, RESEARCH_DIE_COST,
  OBJECTIVES, CAN_CAPTURE, SURFACE_WARSHIPS,
  type PowerKey, type UnitKey, type TechKey,
} from './config.js';
import {
  activePower, operatingPower, addUnits, addAxisCarrierHull,
  allocateAxisCarrierHullRef, allocateAxisDefendingCarrierFighterRef,
  coalitionOf, d6, enemyUnitsAt, productionOf, removeUnits,
  sameSide, seaZoneHostile, snapshotAxisTurnStartSea, stacksAt, unitCount, checkVictory, isSeaZoneId,
  type AxisState, type UnitStack, type ActiveCombat, type AxisCombatant, type UsaOperationFirst,
  type AxisCarrierLandingTag,
} from './state.js';
import type { MapIndex, TerritoryDef } from './map.js';
import {
  createBattle, resolveRoll, applyCasualtyPicks, applySubmerge, applyRetreat,
  currentStep, stepDice, type SideSpec, type BattleState,
} from './battle.js';
import {
  airDistance, airUnitRange, strandedAircraftForPower,
  isFriendlyAirLandingTerritory, validateAirAttackLanding, validateAirNoncombatLanding,
  type AirUnitGroup, type AirUnitKey, type CarrierMoveProjection,
} from './airMovement.js';
import {
  availableAxisPhysicalPieces,
  axisPieceSelectionSignature,
  enumerateAxisPhysicalPieces,
} from './physical.js';
import {
  chinaFighterAttackHasLanding,
  chinaInfantryGrantFromControl,
  chinaMoveDistance,
  chinaPlacementSpaces as eligibleChinaPlacementSpaces,
  controllerAfterChineseCapture,
  isChinaFriendlyLandingTerritory,
  isChinaOperatingTerritory,
} from './china.js';
import {
  axisControlledSinceTurnStart,
  axisEnemySurfaceWarshipAt,
  canAxisSeaUnitTransit,
  canAxisTraverseSeaEdge,
  classifyAxisLandRoute,
  validateAxisLandForceRoute,
  type AxisLandForceRouteResult,
  type AxisSeaUnitKey,
} from './movementRules.js';
import {
  axisFactoryProductionCapacity,
  canAxisPlaceFightersOnOwnCarriers,
} from './mobilizationRules.js';
import { validateAxisRetreatDestination } from './retreat.js';
import {
  axisCarrierDeckRequirement,
  fulfillAxisCarrierPlacement,
  normalizeAxisCarrierObligations,
  summarizeAxisCarrierOutstanding,
  trimAxisCarrierObligations,
  validateAxisCarrierReservations,
  type AxisCarrierFactoryAvailability,
  type AxisCarrierObligationRow,
  type AxisCarrierTaggedFighter,
  type AxisCarrierZoneDeckSnapshot,
  type AxisCarrierZoneRequirementSnapshot,
} from './carrierCommitments.js';
import {
  axisRocketDamage,
  validateAxisParatrooperRoute,
  validateAxisRocketStrike,
} from './specialTechnologyRules.js';
import {
  applyAxisDefendingCarrierLandingChoice,
  deriveAxisDefendingCarrierLandingProgress,
  type AxisDefendingCarrierFighter,
  type AxisDefendingCarrierLandingChoice,
  type AxisDefendingCarrierLandingSnapshot,
} from './defendingCarrierLandings.js';

/** A count-only pick remains valid for old clients and bots. New interactive
 * clients include exact board ordinals plus the snapshot signature they saw. */
export interface AxisUnitPick {
  key: UnitKey;
  count: number;
  ordinals?: number[];
  selectionSig?: string;
}

/** Exact reference to one durable transport hull in a single sea zone. */
export interface AxisTransportRef {
  owner: PowerKey;
  physicalOrdinal: number;
  selectionSig: string;
}

/** Cargo assigned to or removed from one exact transport hull. */
export interface AxisTransportCargoOrder extends AxisTransportRef {
  units: { key: UnitKey; count: number }[];
}

/** One exact amphibious hull plus its complete zero/two-zone route. */
export interface AxisTransportRouteOrder extends AxisTransportCargoOrder {
  from: string;
  via?: string;
}

export interface AxisAmphibiousOrder {
  /** Final sea zone from which every selected hull unloads. */
  zone: string;
  hulls: AxisTransportRouteOrder[];
}

export interface AxisBomberForce {
  from: string;
  bombers: number;
  ordinals?: number[];
  selectionSig?: string;
}

export interface AxisBattleTarget {
  combatId?: number;
  visualSeq?: number;
}

/** Exact available AA sculpt acknowledged for one Rockets launch. */
export interface AxisRocketLauncher {
  ordinal: number;
  selectionSig: string;
}

/** One exact available sculpt used by a Paratroopers pair declaration. */
export interface AxisParatrooperPieceRef {
  readonly ordinal: number;
  readonly selectionSig: string;
}

/** One bomber carries one infantry; both begin at the group's origin. */
export interface AxisParatrooperPairOrder {
  readonly bomber: AxisParatrooperPieceRef;
  readonly infantry: AxisParatrooperPieceRef;
}

/** Exact pairs sharing one explicit origin-to-first-hostile flight route. */
export interface AxisParatrooperGroupOrder {
  readonly from: string;
  readonly route: readonly string[];
  readonly pairs: readonly AxisParatrooperPairOrder[];
}

/** Exact fighters assigned to one purchased-carrier landing destination. */
export interface AxisNewCarrierLandingOrder {
  readonly zone: string;
  readonly fighters: readonly {
    readonly from: string;
    readonly ordinals: readonly number[];
  }[];
  /** One entry per newly required staged carrier/factory production slot. */
  readonly carrierFactories: readonly string[];
}

export type AxisAction =
  // rnd
  | { type: 'buyResearch'; dice: number }
  | { type: 'chooseChart'; chart: 1 | 2 }
  // purchase
  | { type: 'buy'; key: UnitKey; count: number }
  | { type: 'unbuy'; key: UnitKey; count: number }
  | { type: 'repair'; territory: string; count: number }
  // USA chooses which separate national force completes combat first.
  | { type: 'chooseUsOperationOrder'; first: UsaOperationFirst }
  // combat move: assemble one attack (possibly from several origins) and
  // resolve it immediately. Amphibious attacks name the offload zone.
  | {
      type: 'attack';
      target: string;
      forces: { from: string; via?: string; units: AxisUnitPick[] }[];
      // amphibious: land units offloading from transports in this zone
      offloadFrom?: string;
      offloadUnits?: { key: UnitKey; count: number }[];
      /** Exact per-hull order used by current clients. */
      amphibious?: AxisAmphibiousOrder;
      /** Exact same-origin bomber/infantry pairs using the Paratroopers advance. */
      paratroopers?: AxisParatrooperGroupOrder[];
      newCarrierLandings?: AxisNewCarrierLandingOrder[];
    }
  // strategic bombing raid: bombers strike an enemy industrial complex;
  // AA fires first; survivors deal 1d6 damage (Heavy Bombers roll 2, keep best)
  | { type: 'sbr'; target: string; forces: AxisBomberForce[] }
  // Rockets: one exact AA gun stays on the board while its strike resolves
  // through the same readiness-gated cinematic battle channel.
  | { type: 'rocketStrike'; source: string; target: string; launcher: AxisRocketLauncher }
  // Exact emergency landing for a fighter launched from a defending carrier.
  | ({ type: 'defendingCarrierLanding' } & AxisDefendingCarrierLandingChoice)
  // battle interaction (routed by pending decisions)
  | ({ type: 'battleRoll' } & AxisBattleTarget)
  | ({ type: 'battleCasualties'; uids: number[] } & AxisBattleTarget)
  | ({ type: 'battleSubmerge'; uids: number[] } & AxisBattleTarget)
  | ({ type: 'battleRetreat'; retreat: false; destination?: never } & AxisBattleTarget)
  | ({ type: 'battleRetreat'; retreat: true; destination: string | null } & AxisBattleTarget)
  // battle over: each commander confirms the after-action report; the board
  // only updates once both have pressed continue
  | ({ type: 'battleContinue' } & AxisBattleTarget)
  // movement (combatMove phase for repositioning INTO friendly spaces is not
  // a thing — all non-attack moves happen in noncombat; loading transports is)
  | {
      type: 'move';
      from: string;
      to: string;
      units: AxisUnitPick[];
      via?: string;
      newCarrierLandings?: AxisNewCarrierLandingOrder[];
    }
  | { type: 'load'; zone: string; territory: string; units: AxisUnitPick[]; hulls?: AxisTransportCargoOrder[] }
  | {
      type: 'offload';
      zone: string;
      territory: string;
      /** Legacy count-only request. Exact clients send `hulls`. */
      units?: { key: UnitKey; count: number }[];
      hulls?: AxisTransportCargoOrder[];
    }
  // mobilize
  | { type: 'place'; space: string; key: UnitKey; count: number }
  | { type: 'placeChina'; space: string } // US turn: China's infantry grant
  | {
      type: 'placeBatch';
      space: string;
      units: { key: UnitKey; count: number }[];
      china?: number;
      /** Governing coastal factory for sea placement when a zone has several. */
      factory?: string;
    }
  // phase control
  | { type: 'endPhase' };

export interface ActionResult { ok: boolean; error?: string }

const err = (error: string): ActionResult => ({ ok: false, error });
const OK: ActionResult = { ok: true };

const isPositiveInt = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;
const isNonNegativeInt = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const isUnitKey = (key: unknown): key is UnitKey =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(UNITS, key);
const isPowerKey = (power: unknown): power is PowerKey =>
  typeof power === 'string' && Object.prototype.hasOwnProperty.call(POWERS, power);
const isSpaceName = (space: unknown): space is string => typeof space === 'string' && space.length > 0;

type RawUnitPick = { key: UnitKey; count: number; ordinals?: number[]; selectionSig?: string };

function validExactSelection(value: object, count: number, allowExact: boolean): boolean {
  const raw = value as { ordinals?: unknown; selectionSig?: unknown };
  const hasOrdinals = raw.ordinals !== undefined;
  const hasSignature = raw.selectionSig !== undefined;
  if (!hasOrdinals && !hasSignature) return true; // legacy count-only action
  if (!allowExact || !hasOrdinals || !hasSignature) return false;
  if (!Array.isArray(raw.ordinals) || raw.ordinals.length !== count) return false;
  if (!raw.ordinals.every(isNonNegativeInt) || new Set(raw.ordinals).size !== raw.ordinals.length) return false;
  return typeof raw.selectionSig === 'string' && raw.selectionSig.length > 0 && raw.selectionSig.length <= 8192;
}

function validUnitPicks(value: unknown, allowEmpty = false, allowExact = false): value is RawUnitPick[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return false;
  return value.every((u) => u != null && typeof u === 'object'
    && isUnitKey((u as { key?: unknown }).key)
    && isPositiveInt((u as { count?: unknown }).count)
    && validExactSelection(u, (u as { count: number }).count, allowExact));
}

function hasDuplicateUnitPicks(groups: { scope: string; units: RawUnitPick[] }[]): boolean {
  const seen = new Set<string>();
  for (const group of groups) {
    for (const unit of group.units) {
      const id = `${group.scope}\u0000${unit.key}`;
      if (seen.has(id)) return true;
      seen.add(id);
    }
  }
  return false;
}

function validTransportRef(value: object): boolean {
  const ref = value as { owner?: unknown; physicalOrdinal?: unknown; selectionSig?: unknown };
  return isPowerKey(ref.owner)
    && isNonNegativeInt(ref.physicalOrdinal)
    && typeof ref.selectionSig === 'string'
    && ref.selectionSig.length > 0
    && ref.selectionSig.length <= 8192;
}

function validTransportOrders(value: unknown, routed: boolean): value is AxisTransportRouteOrder[] | AxisTransportCargoOrder[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || !validTransportRef(raw)) return false;
    const order = raw as AxisTransportRouteOrder;
    if (!validUnitPicks(order.units) || hasDuplicateUnitPicks([{ scope: 'hull', units: order.units }])) return false;
    if (routed) {
      if (!isSpaceName(order.from) || (order.via !== undefined && !isSpaceName(order.via))) return false;
    } else if ('from' in order || 'via' in order) {
      return false;
    }
    const scope = routed ? order.from : '';
    const id = `${scope}\u0000${order.owner}\u0000${order.physicalOrdinal}`;
    if (seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

function validBattleTarget(value: AxisBattleTarget): boolean {
  return (value.combatId === undefined || isNonNegativeInt(value.combatId))
    && (value.visualSeq === undefined || isNonNegativeInt(value.visualSeq));
}

function validNewCarrierLandings(value: unknown): value is AxisNewCarrierLandingOrder[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const zones = new Set<string>();
  const fighterRefs = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return false;
    const order = candidate as {
      zone?: unknown;
      fighters?: unknown;
      carrierFactories?: unknown;
    };
    if (!isSpaceName(order.zone) || zones.has(order.zone)) return false;
    zones.add(order.zone);
    if (!Array.isArray(order.carrierFactories)
      || !order.carrierFactories.every(isSpaceName)) return false;
    if (!Array.isArray(order.fighters) || order.fighters.length === 0) return false;
    const origins = new Set<string>();
    for (const candidateGroup of order.fighters) {
      if (!candidateGroup || typeof candidateGroup !== 'object') return false;
      const group = candidateGroup as { from?: unknown; ordinals?: unknown };
      if (!isSpaceName(group.from) || origins.has(group.from)
        || !Array.isArray(group.ordinals) || group.ordinals.length === 0
        || !group.ordinals.every(isNonNegativeInt)
        || new Set(group.ordinals).size !== group.ordinals.length) return false;
      origins.add(group.from);
      for (const ordinal of group.ordinals) {
        const ref = `${group.from}\u0000${ordinal}`;
        if (fighterRefs.has(ref)) return false;
        fighterRefs.add(ref);
      }
    }
  }
  return true;
}

function validParatrooperPieceRef(value: unknown): value is AxisParatrooperPieceRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as { ordinal?: unknown; selectionSig?: unknown };
  return isNonNegativeInt(ref.ordinal)
    && typeof ref.selectionSig === 'string'
    && ref.selectionSig.length > 0
    && ref.selectionSig.length <= 8192;
}

function validParatrooperGroups(
  value: unknown,
  target: string,
): value is AxisParatrooperGroupOrder[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const declarations = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return false;
    const group = candidate as {
      from?: unknown;
      route?: unknown;
      pairs?: unknown;
    };
    if (!isSpaceName(group.from)
      || !Array.isArray(group.route)
      || group.route.length < 2
      || !group.route.every(isSpaceName)
      || group.route[0] !== group.from
      || group.route[group.route.length - 1] !== target
      || !Array.isArray(group.pairs)
      || group.pairs.length === 0) return false;
    const declaration = `${group.from}\u0000${group.route.join('\u0000')}`;
    if (declarations.has(declaration)) return false;
    declarations.add(declaration);
    for (const candidatePair of group.pairs) {
      if (!candidatePair || typeof candidatePair !== 'object') return false;
      const pair = candidatePair as { bomber?: unknown; infantry?: unknown };
      if (!validParatrooperPieceRef(pair.bomber)
        || !validParatrooperPieceRef(pair.infantry)) return false;
    }
  }
  return true;
}

function validDefendingCarrierLandingChoice(
  action: Extract<AxisAction, { type: 'defendingCarrierLanding' }>,
): boolean {
  if (!isSpaceName(action.fighterRef)) return false;
  if (action.kind === 'carrier') return isSpaceName(action.carrierRef);
  if (action.kind === 'territory') return isSpaceName(action.territory);
  return action.kind === 'destroy';
}

/** WebSocket payloads are untrusted at runtime even though callers compile
 * against AxisAction. Validate all numeric demands before any rule code can
 * index UNITS or mutate the durable room state. */
function validateAxisAction(action: AxisAction): ActionResult | null {
  if (action == null || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') {
    return err('Malformed action.');
  }
  switch (action.type) {
    case 'buyResearch':
      return isNonNegativeInt(action.dice) ? null : err('New research dice must be a non-negative whole number.');
    case 'chooseChart':
      return action.chart === 1 || action.chart === 2 ? null : err('Unknown research chart.');
    case 'buy':
    case 'unbuy':
      return isUnitKey(action.key) && isPositiveInt(action.count) ? null : err('Unit count must be a positive whole number.');
    case 'repair':
      return isSpaceName(action.territory) && isPositiveInt(action.count) ? null : err('Repair count must be a positive whole number.');
    case 'chooseUsOperationOrder':
      return action.first === 'usa' || action.first === 'china' ? null : err('Unknown USA/China operation order.');
    case 'attack': {
      if (!isSpaceName(action.target) || !Array.isArray(action.forces)) return err('Malformed attack order.');
      const groups: { scope: string; units: RawUnitPick[] }[] = [];
      const exactRefs = new Set<string>();
      const countOnlyGroups = new Set<string>();
      for (const force of action.forces) {
        if (!force || !isSpaceName(force.from) || !validUnitPicks(force.units, false, true)) return err('Malformed attacking force.');
        if (force.via !== undefined && !isSpaceName(force.via)) return err('Malformed attacking route.');
        groups.push({ scope: force.from, units: force.units });
        for (const unit of force.units) {
          const group = `${force.from}\u0000${unit.key}`;
          if (!unit.ordinals) countOnlyGroups.add(group);
          for (const ordinal of unit.ordinals ?? []) {
            const ref = `${group}\u0000${ordinal}`;
            if (exactRefs.has(ref)) return err('List each exact attacking piece only once.');
            exactRefs.add(ref);
          }
        }
      }
      if (hasDuplicateUnitPicks(groups)) return err('List each unit type from an origin only once.');
      if (action.paratroopers !== undefined) {
        if (!validParatrooperGroups(action.paratroopers, action.target)) {
          return err('Malformed exact Paratroopers declaration.');
        }
        for (const group of action.paratroopers) {
          for (const pair of group.pairs) {
            for (const [key, ref] of [
              ['bomber', pair.bomber],
              ['infantry', pair.infantry],
            ] as const) {
              const selectionGroup = `${group.from}\u0000${key}`;
              if (countOnlyGroups.has(selectionGroup)) {
                return err('Use exact ordinary picks when Paratroopers share that origin and unit type.');
              }
              const selectionRef = `${selectionGroup}\u0000${ref.ordinal}`;
              if (exactRefs.has(selectionRef)) {
                return err('An exact bomber or infantry cannot be selected both ordinarily and as a Paratrooper.');
              }
              exactRefs.add(selectionRef);
            }
          }
        }
      }
      const hasOffloadFrom = action.offloadFrom !== undefined;
      const hasOffloadUnits = action.offloadUnits !== undefined;
      if (hasOffloadFrom !== hasOffloadUnits) return err('Amphibious orders need both an offload zone and units.');
      if (action.amphibious !== undefined && (hasOffloadFrom || hasOffloadUnits)) {
        return err('Use either exact or legacy amphibious orders, not both.');
      }
      if (action.amphibious !== undefined) {
        if (!action.amphibious || !isSpaceName(action.amphibious.zone)
          || !validTransportOrders(action.amphibious.hulls, true)) return err('Malformed exact amphibious force.');
      }
      if (hasOffloadFrom) {
        if (!isSpaceName(action.offloadFrom) || !validUnitPicks(action.offloadUnits)) return err('Malformed amphibious force.');
        if (hasDuplicateUnitPicks([{ scope: action.offloadFrom, units: action.offloadUnits }])) return err('List each offloaded unit type once.');
      }
      if (action.newCarrierLandings !== undefined
        && !validNewCarrierLandings(action.newCarrierLandings)) {
        return err('Malformed purchased-carrier landing declaration.');
      }
      return null;
    }
    case 'sbr': {
      if (!isSpaceName(action.target) || !Array.isArray(action.forces) || action.forces.length === 0) return err('Malformed bombing raid.');
      const seen = new Set<string>();
      for (const force of action.forces) {
        if (!force || !isSpaceName(force.from) || !isPositiveInt(force.bombers)
          || !validExactSelection(force, force.bombers, true)) return err('Bomber count or physical selection is malformed.');
        if (seen.has(force.from)) return err('List each bomber origin only once.');
        seen.add(force.from);
      }
      return null;
    }
    case 'rocketStrike':
      return isSpaceName(action.source)
        && isSpaceName(action.target)
        && action.launcher != null
        && typeof action.launcher === 'object'
        && isNonNegativeInt(action.launcher.ordinal)
        && typeof action.launcher.selectionSig === 'string'
        && action.launcher.selectionSig.length > 0
        && action.launcher.selectionSig.length <= 8192
        ? null
        : err('Rocket source, target, and exact AA launcher are malformed.');
    case 'defendingCarrierLanding':
      return validDefendingCarrierLandingChoice(action)
        ? null
        : err('Choose one exact defending carrier fighter destination.');
    case 'battleRoll':
      return validBattleTarget(action) ? null : err('Malformed battle visual target.');
    case 'endPhase':
      return null;
    case 'battleContinue':
      return validBattleTarget(action) ? null : err('Malformed battle continuation.');
    case 'battleCasualties':
    case 'battleSubmerge':
      return Array.isArray(action.uids) && action.uids.every(isPositiveInt) && validBattleTarget(action)
        ? null : err('Unit ids and battle target must be valid.');
    case 'battleRetreat': {
      if (typeof action.retreat !== 'boolean' || !validBattleTarget(action)) return err('Malformed retreat decision.');
      const hasDestination = Object.prototype.hasOwnProperty.call(action, 'destination');
      const destination = (action as { destination?: unknown }).destination;
      if (!action.retreat) return hasDestination ? err('Pressing the attack must not include a retreat destination.') : null;
      return hasDestination && (destination === null || isSpaceName(destination))
        ? null
        : err('A retreat must name its exact destination, or null for aircraft only.');
    }
    case 'move':
      if (!isSpaceName(action.from) || !isSpaceName(action.to) || !validUnitPicks(action.units, false, true)) return err('Malformed movement order.');
      if (action.via !== undefined && !isSpaceName(action.via)) return err('Malformed movement route.');
      if (action.newCarrierLandings !== undefined
        && !validNewCarrierLandings(action.newCarrierLandings)) {
        return err('Malformed purchased-carrier landing declaration.');
      }
      return hasDuplicateUnitPicks([{ scope: action.from, units: action.units }]) ? err('List each moved unit type once.') : null;
    case 'load':
      if (!isSpaceName(action.zone) || !isSpaceName(action.territory) || !validUnitPicks(action.units, false, true)) return err('Malformed transport order.');
      if (action.hulls !== undefined && !validTransportOrders(action.hulls, false)) return err('Malformed exact transport allocation.');
      return hasDuplicateUnitPicks([{ scope: action.territory, units: action.units }]) ? err('List each cargo unit type once.') : null;
    case 'offload': {
      if (!isSpaceName(action.zone) || !isSpaceName(action.territory)) return err('Malformed transport order.');
      const legacy = action.units !== undefined;
      const exact = action.hulls !== undefined;
      if (legacy === exact) return err('Use either exact hulls or legacy cargo counts for an offload.');
      if (legacy && (!validUnitPicks(action.units)
        || hasDuplicateUnitPicks([{ scope: action.territory, units: action.units }]))) {
        return err('Malformed transport order.');
      }
      if (exact && !validTransportOrders(action.hulls, false)) return err('Malformed exact transport offload.');
      return null;
    }
    case 'place':
      return isSpaceName(action.space) && isUnitKey(action.key) && isPositiveInt(action.count) ? null : err('Placement count must be a positive whole number.');
    case 'placeChina':
      return isSpaceName(action.space) ? null : err('Malformed China placement.');
    case 'placeBatch': {
      if (!isSpaceName(action.space) || !validUnitPicks(action.units, true)) return err('Malformed placement order.');
      if (hasDuplicateUnitPicks([{ scope: action.space, units: action.units }])) return err('List each placed unit type once.');
      const china = action.china ?? 0;
      if (!isNonNegativeInt(china)) return err('China placement count must be a non-negative whole number.');
      if (action.units.length === 0 && china === 0) return err('Place at least one unit.');
      if (action.factory !== undefined && !isSpaceName(action.factory)) return err('Malformed governing factory.');
      return null;
    }
    default:
      return err('Unknown action.');
  }
}

// ---------- shared movement helpers ----------

const isNeutral = (t: TerritoryDef) => t.originalOwner === null || t.isImpassable;

const combatantController = (power: AxisCombatant): PowerKey => power === 'china' ? 'usa' : power;
const combatantName = (power: AxisCombatant): string => power === 'china' ? 'China' : POWERS[power].name;

function unmovedUnitCount(s: AxisState, space: string, power: AxisCombatant, key: UnitKey): number {
  return stacksAt(s, space).reduce((n, st) => {
    if (st.power !== power || st.key !== key) return n;
    return n + Math.max(0, st.count - (st.moved ?? 0));
  }, 0);
}

function removeUnmovedUnitsWithDamage(
  s: AxisState,
  space: string,
  power: AxisCombatant,
  key: UnitKey,
  count: number,
): { ok: boolean; damaged: number } {
  const candidates = stacksAt(s, space).filter((st) => st.power === power && st.key === key);
  const plan = new Map<UnitStack, { count: number; damaged: number }>();
  let left = count;

  // Choose healthy physical units before damaged battleships, consistently
  // with ordinary movement. Plan first so a rejected request is atomic.
  for (const pass of ['healthy', 'damaged'] as const) {
    for (const st of candidates) {
      if (left === 0) break;
      const damaged = Math.min(st.count, Math.max(0, st.damaged ?? 0));
      const healthy = st.count - damaged;
      const moved = Math.min(st.count, Math.max(0, st.moved ?? 0));
      const spentHealthy = Math.min(moved, healthy);
      const spentDamaged = Math.max(0, moved - spentHealthy);
      const available = pass === 'healthy'
        ? Math.max(0, healthy - spentHealthy)
        : Math.max(0, damaged - spentDamaged);
      const take = Math.min(available, left);
      if (take <= 0) continue;
      const prior = plan.get(st) ?? { count: 0, damaged: 0 };
      prior.count += take;
      if (pass === 'damaged') prior.damaged += take;
      plan.set(st, prior);
      left -= take;
    }
  }
  if (left > 0) return { ok: false, damaged: 0 };

  let removedDamaged = 0;
  for (const [st, take] of plan) {
    st.count -= take.count;
    if (take.damaged > 0) {
      st.damaged = Math.max(0, (st.damaged ?? 0) - take.damaged);
      if (st.damaged === 0) delete st.damaged;
      removedDamaged += take.damaged;
    }
  }
  s.board[space] = stacksAt(s, space).filter((st) => st.count > 0);
  return { ok: true, damaged: removedDamaged };
}

function removeUnmovedUnits(s: AxisState, space: string, power: AxisCombatant, key: UnitKey, count: number): boolean {
  return removeUnmovedUnitsWithDamage(s, space, power, key, count).ok;
}

function addSpentCombatUnit(
  s: AxisState,
  space: string,
  power: AxisCombatant,
  key: UnitKey,
  cargo?: UnitStack['cargo'],
  movementSpent?: number,
  transportState?: Pick<UnitStack, 'combatLoadedCargo' | 'loadedThisTurnCargo' | 'offloadBlocked'>,
  carrierLanding?: AxisCarrierLandingTag,
  carrierRef?: string,
): void {
  const stacks = (s.board[space] ??= []);
  if (key === 'carrier') {
    if (carrierRef) addAxisCarrierHull(s, space, power, carrierRef, cargo, 1);
    else {
      addUnits(s, space, power, 'carrier', 1, cargo);
      const restored = stacksAt(s, space).filter((stack) => stack.power === power && stack.key === 'carrier').at(-1);
      if (restored) restored.moved = 1;
    }
    return;
  }
  if (carrierLanding && key === 'fighter') {
    stacks.push({
      power,
      key,
      count: 1,
      moved: 1,
      ...(movementSpent != null ? { movementSpent } : {}),
      carrierLanding: { ...carrierLanding },
    });
    return;
  }
  if (key === 'transport' || cargo?.length) {
    stacks.push({
      power, key, count: 1, moved: 1,
      ...(cargo?.length ? { cargo: cargo.map((item) => ({ ...item })) } : {}),
      ...(movementSpent != null ? { movementSpent } : {}),
      ...(transportState?.combatLoadedCargo?.length
        ? { combatLoadedCargo: transportState.combatLoadedCargo.map((item) => ({ ...item })) }
        : {}),
      ...(transportState?.loadedThisTurnCargo?.length
        ? { loadedThisTurnCargo: transportState.loadedThisTurnCargo.map((item) => ({ ...item })) }
        : {}),
      ...(transportState?.offloadBlocked ? { offloadBlocked: true } : {}),
    });
    return;
  }
  const existing = stacks.find((st) => st.power === power
    && st.key === key
    && !st.cargo?.length
    && !st.carrierLanding
    && (st.moved ?? 0) === st.count
    && (st.movementSpent ?? 0) === (movementSpent ?? 0));
  if (existing) {
    existing.count += 1;
    existing.moved = (existing.moved ?? 0) + 1;
  } else {
    stacks.push({ power, key, count: 1, moved: 1, ...(movementSpent != null ? { movementSpent } : {}) });
  }
}

function neighborsFor(s: AxisState, idx: MapIndex, space: string, domain: 'land' | 'sea' | 'air', power: PowerKey | 'china'): string[] {
  const out: string[] = [];
  if (isSeaZoneId(space)) {
    const z = idx.seaZone[space];
    if (!z) return out;
    if (domain !== 'land') {
      for (const a of z.adj) {
        if (domain === 'sea' && !canAxisTraverseSeaEdge(s, idx.map, space, a, power)) continue;
        out.push(a);
      }
      if (domain === 'air') for (const t of z.coastTo ?? []) out.push(t);
    }
    return out;
  }
  const t = idx.territory[space];
  if (!t) return out;
  if (domain !== 'sea') {
    for (const a of t.adj) {
      const other = idx.territory[a];
      if (!other) continue;
      if (domain === 'land' && isNeutral(other)) continue; // never into neutrals
      out.push(a);
    }
  }
  if (domain !== 'land') for (const z of t.coastTo ?? []) out.push(z);
  return out;
}

// Can `key` legally attack `target` starting from `from`? Returns a blitzed
// intermediate (empty hostile territory) when a tank passes through one.
function landRouteError(result: AxisLandForceRouteResult): string {
  switch (result.reason) {
    case 'two-space-unit':
      return 'Only tanks and properly paired mechanized infantry can use a two-space land route.';
    case 'mechanized-infantry-required':
      return 'Mechanized Infantry research is required for infantry to move two spaces.';
    case 'mechanized-tank-required':
      return `Select ${result.missingTanks} more unmoved tank${result.missingTanks === 1 ? '' : 's'} from the same origin to pair one-for-one with the infantry.`;
    case 'infantry-cannot-blitz':
      return 'Mechanized infantry cannot blitz through a hostile territory; only tanks may use that route.';
    default:
      return 'No legal land route reaches that destination.';
  }
}

function attackReach(
  s: AxisState, idx: MapIndex, power: AxisCombatant, key: UnitKey, from: string, target: string, via?: string,
): { ok: boolean; blitz?: string; error?: string } {
  const prof = UNITS[key];
  const domain = prof.domain;
  if (domain === 'structure') return { ok: false, error: 'Industrial complexes cannot attack.' };

  if (power === 'china') {
    const fromTerritory = idx.territory[from];
    const targetTerritory = idx.territory[target];
    if (!fromTerritory || !targetTerritory
      || !isChinaOperatingTerritory(fromTerritory)
      || !isChinaOperatingTerritory(targetTerritory)) {
      return { ok: false, error: 'Chinese forces remain inside China and Kwangtung.' };
    }
    if (key === 'infantry') {
      return via === undefined && fromTerritory.adj.includes(target)
        ? { ok: true }
        : { ok: false, error: 'Chinese infantry move one territory.' };
    }
    if (key === 'fighter') {
      return chinaMoveDistance(idx.map.territories, from, target, UNITS.fighter.move) != null
        ? { ok: true }
        : { ok: false, error: 'The Flying Tigers cannot reach that battle without leaving their operating region.' };
    }
    return { ok: false, error: 'China may operate only its infantry and Flying Tigers fighter.' };
  }

  if (domain === 'land') {
    const route = classifyAxisLandRoute({
      snapshot: s, idx, power, from, to: target, via, phase: 'combatMove',
    });
    const validation = validateAxisLandForceRoute([{ key, count: 1 }], route, techsOf(s, power));
    if (!validation.ok) return { ok: false, error: landRouteError(validation) };
    return route === 'tank-blitz' && via ? { ok: true, blitz: via } : { ok: true };
  }

  if (domain === 'sea') {
    // Sea units that begin the turn co-occupied with enemy surface warships
    // may remain in place and conduct the mandatory battle without spending
    // movement. Supplying `via` still means leave and return, establishing an
    // exact retreat ingress.
    if (from === target && via === undefined) return { ok: true };
    if (via !== undefined) {
      const legalRoute = prof.move >= 2
        && neighborsFor(s, idx, from, 'sea', power).includes(via)
        && neighborsFor(s, idx, via, 'sea', power).includes(target)
        && canAxisSeaUnitTransit(s, via, power, key as AxisSeaUnitKey);
      return legalRoute
        ? { ok: true }
        : { ok: false, error: `The ${prof.name} cannot use that sea route.` };
    }
    if (neighborsFor(s, idx, from, 'sea', power).includes(target)) return { ok: true };
    return {
      ok: false,
      error: `Choose the exact intermediate sea zone for this two-zone ${prof.name} attack.`,
    };
  }

  // Aircraft may spend their printed range reaching combat. The complete air
  // group is checked below for a legal post-combat landing before anything is
  // removed from the board.
  const range = airUnitRange(key as AirUnitKey, techsOf(s, power));
  return airDistance(idx, from, target, range) != null
    ? { ok: true }
    : { ok: false, error: `Out of range for the ${prof.name}.` };
}

function activeSharedSeaPieceCounts(
  s: AxisState,
  power: AxisCombatant,
  zone: string,
): Map<UnitKey, number> {
  const counts = new Map<UnitKey, number>();
  for (const stack of stacksAt(s, zone)) {
    if (stack.power !== power) continue;
    const domain = UNITS[stack.key].domain;
    if (domain !== 'sea' && domain !== 'air') continue;
    const available = Math.max(0, stack.count - (stack.moved ?? 0));
    if (available > 0) counts.set(stack.key, (counts.get(stack.key) ?? 0) + available);
  }
  return counts;
}

/**
 * Once the player elects to attack enemies already sharing a sea zone, every
 * still-available active-power hull and loose aircraft there must be addressed
 * explicitly: join this battle or move away in a separate Combat Move order.
 * This also applies when the co-located enemies are only submarines/transports;
 * allied units and bound guest cargo never enter the selection. This is a count
 * comparison only; exact signatures/ordinals are still validated by
 * `planUnmovedSlices` before any mutation.
 */
function validateMandatorySameZoneForce(
  s: AxisState,
  power: AxisCombatant,
  target: string,
  forces: readonly { from: string; units: readonly AxisUnitPick[] }[],
): ActionResult {
  if (!isSeaZoneId(target)) return OK;
  const required = activeSharedSeaPieceCounts(s, power, target);
  if (required.size === 0) return OK;
  const selected = new Map<UnitKey, number>();
  for (const force of forces) {
    if (force.from !== target) continue;
    for (const unit of force.units) {
      const domain = UNITS[unit.key].domain;
      if (domain !== 'sea' && domain !== 'air') continue;
      selected.set(unit.key, (selected.get(unit.key) ?? 0) + unit.count);
    }
  }
  const keys = new Set([...required.keys(), ...selected.keys()]);
  const complete = [...keys].every((key) =>
    (selected.get(key) ?? 0) === (required.get(key) ?? 0));
  return complete
    ? OK
    : err('Every active hull and loose aircraft already in this shared enemy sea zone must be selected for the battle or moved away first. Select each exact piece; allied units and bound guest cargo remain out.');
}

function forceHasPositiveAttackCapability(
  forces: readonly { units: readonly { key: UnitKey; count: number }[] }[],
  amphibiousUnits: readonly { key: UnitKey; count: number }[],
): boolean {
  return [...forces.flatMap((force) => force.units), ...amphibiousUnits]
    .some((unit) => unit.count > 0 && UNITS[unit.key].attack > 0);
}

// ---------- rnd ----------

function actBuyResearch(s: AxisState, idx: MapIndex, dice: number): ActionResult {
  const power = activePower(s);
  const p = s.powers[power];
  if (s.phase !== 'rnd') return err('Not the research phase.');
  if (s.turnStartedCapitalOccupied) return err(`${POWERS[power].name} cannot research after beginning the turn without its capital.`);
  if (TECHS.every((tech) => p.techs.includes(tech.key))) return err('Every research advance is already developed.');
  const cost = dice * RESEARCH_DIE_COST;
  if (dice === 0 && p.researchTokens === 0) return err('No standing researchers to roll.');
  if (p.ipcs < cost) return err(`Research costs ${RESEARCH_DIE_COST} per die.`);
  p.ipcs -= cost;
  p.researchTokens += dice;
  // roll all tokens now (tokens persist on failure)
  const rolls = Array.from({ length: p.researchTokens }, () => d6(s));
  const success = rolls.includes(6);
  s.log.push({ round: s.round, power, text: `${POWERS[power].name} rolls research: ${rolls.join(', ')}${success ? ' — breakthrough!' : ' — no breakthrough (researchers stay).'}` });
  if (success) {
    p.researchTokens = 0;
    s.awaitingChart = true;
  } else {
    s.phase = 'purchase';
  }
  void idx;
  return OK;
}

function actChooseChart(s: AxisState, chart: 1 | 2): ActionResult {
  const power = activePower(s);
  const p = s.powers[power];
  if (s.phase !== 'rnd' || !s.awaitingChart) return err('No breakthrough waiting.');
  if (s.turnStartedCapitalOccupied) return err(`${POWERS[power].name} cannot complete research after beginning the turn without its capital.`);
  const chartTechs = TECHS.filter((t) => t.chart === chart);
  const remaining = chartTechs.filter((t) => !p.techs.includes(t.key));
  if (remaining.length === 0) return err('Every advance on that chart is already yours.');
  let tech = null;
  let guard = 0;
  while (!tech && guard++ < 100) {
    const roll = d6(s);
    const hit = chartTechs.find((t) => t.roll === roll)!;
    if (!p.techs.includes(hit.key)) tech = hit;
  }
  tech ??= remaining[0];
  p.techs.push(tech.key);
  s.awaitingChart = false;
  s.phase = 'purchase';
  s.log.push({ round: s.round, power, text: `${POWERS[power].name} develops ${tech.name}.` });
  return OK;
}

// ---------- purchase ----------

function unitCost(p: { techs: TechKey[] }, key: UnitKey): number {
  if (p.techs.includes('improvedShipyards') && SHIPYARD_COSTS[key]) return SHIPYARD_COSTS[key]!;
  return UNITS[key].cost;
}

function actBuy(s: AxisState, key: UnitKey, count: number): ActionResult {
  if (s.phase !== 'purchase') return err('Not the purchase phase.');
  const power = activePower(s);
  if (s.turnStartedCapitalOccupied) return err(`${POWERS[power].name} cannot purchase units after beginning the turn without its capital.`);
  const p = s.powers[power];
  const paidUnitCost = unitCost(p, key);
  const cost = paidUnitCost * count;
  const prior = p.purchasedThisTurn[key];
  if (prior && prior.paidUnitCost !== paidUnitCost) {
    // Technology cannot normally change during Purchase, but retaining exact
    // paid lots is safer than issuing a guessed refund from malformed state.
    return err('That unit price changed during Purchase. Finish the existing order before buying more.');
  }
  if (count < 1) return err('Buy at least one.');
  if (p.ipcs < cost) return err(`Not enough IPCs (${cost} needed).`);
  p.ipcs -= cost;
  p.staging[key] = (p.staging[key] ?? 0) + count;
  p.purchasedThisTurn[key] = {
    count: (prior?.count ?? 0) + count,
    paidUnitCost,
  };
  return OK;
}

function actUnbuy(s: AxisState, key: UnitKey, count: number): ActionResult {
  if (s.phase !== 'purchase') return err('Not the purchase phase.');
  const power = activePower(s);
  if (s.turnStartedCapitalOccupied) return err(`${POWERS[power].name} has no purchase phase while its capital is occupied.`);
  const p = s.powers[power];
  const have = p.staging[key] ?? 0;
  const purchased = p.purchasedThisTurn[key];
  if (!purchased || purchased.count < count) {
    return err('Only units purchased during this Purchase phase can be returned. Older staged units are committed carryover.');
  }
  if (have < count) return err('The current purchase ledger no longer matches staging.');
  p.staging[key] = have - count;
  if (p.staging[key] === 0) delete p.staging[key];
  purchased.count -= count;
  p.ipcs += purchased.paidUnitCost * count;
  if (purchased.count === 0) delete p.purchasedThisTurn[key];
  return OK;
}

function actRepair(s: AxisState, idx: MapIndex, territory: string, count: number): ActionResult {
  if (s.phase !== 'purchase') return err('Not the purchase phase.');
  const power = activePower(s);
  if (s.turnStartedCapitalOccupied) return err(`${POWERS[power].name} cannot repair complexes after beginning the turn without its capital.`);
  const p = s.powers[power];
  const dmg = s.factoryDamage[territory] ?? 0;
  if (s.control[territory] !== power) return err('Not your industrial complex.');
  if (unitCount(s, territory, power, 'factory') === 0 && unitCount(s, territory, null, 'factory') === 0) return err('No industrial complex there.');
  if (dmg < count) return err('Not that much damage.');
  const per = p.techs.includes('increasedFactory') ? 0.5 : 1;
  const cost = Math.ceil(count * per);
  if (p.ipcs < cost) return err(`Repairs cost ${cost} IPCs.`);
  p.ipcs -= cost;
  s.factoryDamage[territory] = dmg - count;
  void idx;
  return OK;
}

// ---------- combat move: assemble and immediately resolve an attack ----------

function techsOf(s: AxisState, power: AxisCombatant): TechKey[] {
  return power === 'china' ? [] : s.powers[power].techs;
}

interface LocatedCarrierTag extends AxisCarrierTaggedFighter {
  /** Present only while the exact fighter is on the board. */
  space?: string;
}

function collectLiveCarrierTags(s: AxisState): LocatedCarrierTag[] {
  const tags: LocatedCarrierTag[] = [];
  const seen = new Set<string>();
  for (const [space, stacks] of Object.entries(s.board)) {
    for (const stack of stacks) {
      const tag = stack.carrierLanding;
      if (stack.key !== 'fighter' || stack.count !== 1 || !tag || seen.has(tag.ref)) continue;
      seen.add(tag.ref);
      tags.push({ ref: tag.ref, power: stack.power, seaZone: tag.seaZone, space });
    }
  }
  if (s.combat) {
    const battleUnits = [
      ...s.combat.battle.attacker.filter((unit) => unit.hp > 0),
      ...(s.combat.battle.withdrawnAttacker ?? []).filter((unit) => unit.hp > 0),
    ];
    for (const unit of battleUnits) {
      const tag = unit.carrierLanding;
      if (unit.key !== 'fighter' || !tag || seen.has(tag.ref)) continue;
      seen.add(tag.ref);
      tags.push({ ref: tag.ref, power: unit.power, seaZone: tag.seaZone });
    }
  }
  return tags.sort((a, b) => a.power.localeCompare(b.power)
    || a.seaZone.localeCompare(b.seaZone)
    || a.ref.localeCompare(b.ref));
}

function clearCarrierLandingRefs(s: AxisState, refs: ReadonlySet<string>): void {
  if (refs.size === 0) return;
  for (const stacks of Object.values(s.board)) {
    for (const stack of stacks) {
      if (stack.carrierLanding && refs.has(stack.carrierLanding.ref)) delete stack.carrierLanding;
    }
  }
  if (!s.combat) return;
  for (const unit of [
    ...s.combat.battle.attacker,
    ...s.combat.battle.defender,
    ...(s.combat.battle.withdrawnAttacker ?? []),
  ]) {
    if (unit.carrierLanding && refs.has(unit.carrierLanding.ref)) delete unit.carrierLanding;
  }
  for (const unit of s.combat.attackerCommitted) {
    if (unit.carrierLanding && refs.has(unit.carrierLanding.ref)) delete unit.carrierLanding;
  }
}

function carrierDeckSnapshotAt(
  s: AxisState,
  power: PowerKey,
  seaZone: string,
): AxisCarrierZoneDeckSnapshot {
  const stacks = stacksAt(s, seaZone);
  let ownCarrierSlots = 0;
  let alliedCarrierSlots = 0;
  let occupiedByOwnFighters = 0;
  let occupiedByAlliedGuests = 0;
  for (const stack of stacks) {
    if (stack.key === 'carrier' && sameSide(stack.power, power)) {
      if (stack.power === power) ownCarrierSlots += Math.max(0, stack.count) * 2;
      else alliedCarrierSlots += Math.max(0, stack.count) * 2;
      for (const cargo of stack.cargo ?? []) {
        if (cargo.key !== 'fighter' || !sameSide(cargo.power, power)) continue;
        if (cargo.power === power) occupiedByOwnFighters += Math.max(0, cargo.count);
        else occupiedByAlliedGuests += Math.max(0, cargo.count);
      }
      continue;
    }
    if (stack.key !== 'fighter' || !sameSide(stack.power, power)) continue;
    // Tagged fighters are the demand being measured, not pre-existing deck
    // occupants. New code keeps every tag on a count-one stack.
    const count = Math.max(0, stack.count - (stack.count === 1 && stack.carrierLanding ? 1 : 0));
    if (stack.power === power) occupiedByOwnFighters += count;
    else occupiedByAlliedGuests += count;
  }
  return {
    power,
    seaZone,
    ownCarrierSlots,
    alliedCarrierSlots,
    occupiedByOwnFighters,
    occupiedByAlliedGuests,
  };
}

function carrierDeckSnapshotsForRows(
  s: AxisState,
  rows: readonly AxisCarrierObligationRow[],
): AxisCarrierZoneDeckSnapshot[] {
  const seen = new Set<string>();
  const result: AxisCarrierZoneDeckSnapshot[] = [];
  for (const row of rows) {
    if (!isPowerKey(row.power)) continue;
    const key = `${row.power}\u0000${row.seaZone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(carrierDeckSnapshotAt(s, row.power, row.seaZone));
  }
  return result;
}

function carrierRequirements(
  s: AxisState,
  rows: readonly AxisCarrierObligationRow[],
  deckOverrides: readonly AxisCarrierZoneDeckSnapshot[] = [],
  ignoreHostilePhysical = false,
): AxisCarrierZoneRequirementSnapshot[] {
  return rows.flatMap((row) => {
    if (!isPowerKey(row.power)) return [];
    const deck = deckOverrides.find((candidate) =>
      candidate.power === row.power && candidate.seaZone === row.seaZone)
      ?? carrierDeckSnapshotAt(s, row.power, row.seaZone);
    const effectiveDeck = ignoreHostilePhysical && seaZoneHostile(s, row.seaZone, row.power)
      ? { ...deck, ownCarrierSlots: 0, alliedCarrierSlots: 0 }
      : deck;
    const requirement = axisCarrierDeckRequirement(
      row.fighterRefs.length,
      effectiveDeck,
    );
    return [{
      power: row.power,
      seaZone: row.seaZone,
      requiredNewCarriers: requirement.newCarriersNeeded,
    }];
  });
}

function carrierFactoryAvailability(
  s: AxisState,
  idx: MapIndex,
  power: PowerKey,
  usedOverride: Readonly<Record<string, number>> = s.powers[power].factoriesUsed,
): AxisCarrierFactoryAvailability[] {
  return idx.map.territories.flatMap((territory) => {
    if (!axisControlledSinceTurnStart(s, territory.id, power)
      || !stacksAt(s, territory.id).some((stack) =>
        stack.power === power && stack.key === 'factory' && stack.count > 0)) return [];
    const capacity = axisFactoryProductionCapacity(
      territory.ipc,
      s.powers[power].techs,
      s.factoryDamage[territory.id] ?? 0,
    );
    return [{
      power,
      factory: territory.id,
      availableCapacity: Math.max(0, capacity - (usedOverride[territory.id] ?? 0)),
      eligibleSeaZones: [...(territory.coastTo ?? [])],
    }];
  });
}

function validateCarrierObligationRows(args: {
  s: AxisState;
  idx: MapIndex;
  power: PowerKey;
  rows: readonly AxisCarrierObligationRow[];
  stagedCarriers?: number;
  factoriesUsed?: Readonly<Record<string, number>>;
  deckOverrides?: readonly AxisCarrierZoneDeckSnapshot[];
  ignoreHostilePhysical?: boolean;
}): ActionResult {
  const validation = validateAxisCarrierReservations({
    obligations: args.rows,
    requirements: carrierRequirements(
      args.s,
      args.rows,
      args.deckOverrides,
      args.ignoreHostilePhysical,
    ),
    staged: [{
      power: args.power,
      availableCarriers: args.stagedCarriers ?? (args.s.powers[args.power].staging.carrier ?? 0),
    }],
    factories: carrierFactoryAvailability(
      args.s,
      args.idx,
      args.power,
      args.factoriesUsed ?? args.s.powers[args.power].factoriesUsed,
    ),
  });
  return validation.ok
    ? OK
    : err(validation.issues[0]?.message ?? 'The purchased-carrier promise cannot be reserved.');
}

/** A based fighter's exact deck hint is meaningful only while that physical
 * friendly carrier remains in the same sea zone. Carrier and fighter moves
 * are separate actions, so clear a departed deck immediately instead of
 * leaving a stale identity until the next save hydration or turn boundary. */
function reconcileCarrierBaseRefs(s: AxisState): void {
  for (const [space, stacks] of Object.entries(s.board)) {
    for (const stack of stacks) {
      if (stack.key !== 'fighter' || !stack.carrierBaseRef) continue;
      const home = isSeaZoneId(space) && stack.count === 1
        ? stacks.find((candidate) => candidate.key === 'carrier'
          && candidate.count === 1
          && candidate.carrierRef === stack.carrierBaseRef
          && sameSide(candidate.power, stack.power))
        : undefined;
      if (!home) delete stack.carrierBaseRef;
    }
  }
}

/** Release casualties and safe physical landings after each successful action. */
function reconcileCarrierLandingObligations(s: AxisState, idx: MapIndex): void {
  reconcileCarrierBaseRefs(s);
  const power = activePower(s);
  s.newCarrierLandingObligations = normalizeAxisCarrierObligations(
    s.newCarrierLandingObligations,
  ).filter((row) => row.power === power && Boolean(idx.seaZone[row.seaZone]));
  let located = collectLiveCarrierTags(s);
  const safelyLanded = new Set<string>();
  for (const tag of located) {
    if (!tag.space || !isPowerKey(tag.power)) continue;
    if (idx.territory[tag.space]
      && isFriendlyAirLandingTerritory(s, idx, tag.power, tag.space)) {
      safelyLanded.add(tag.ref);
    }
  }
  const seaGroups = new Map<string, LocatedCarrierTag[]>();
  for (const tag of located) {
    if (!tag.space || !idx.seaZone[tag.space] || !isPowerKey(tag.power)) continue;
    const key = `${tag.power}\u0000${tag.space}`;
    const group = seaGroups.get(key) ?? [];
    group.push(tag);
    seaGroups.set(key, group);
  }
  for (const group of seaGroups.values()) {
    const sample = group[0]!;
    if (seaZoneHostile(s, sample.space!, sample.power as PowerKey)) continue;
    const deck = carrierDeckSnapshotAt(s, sample.power as PowerKey, sample.space!);
    const open = Math.max(
      0,
      deck.ownCarrierSlots + deck.alliedCarrierSlots
        - deck.occupiedByOwnFighters - deck.occupiedByAlliedGuests,
    );
    for (const tag of [...group].sort((a, b) => a.ref.localeCompare(b.ref)).slice(0, open)) {
      safelyLanded.add(tag.ref);
    }
  }
  clearCarrierLandingRefs(s, safelyLanded);
  located = collectLiveCarrierTags(s);
  const trimmed = trimAxisCarrierObligations({
    obligations: s.newCarrierLandingObligations,
    liveTags: located,
    decks: carrierDeckSnapshotsForRows(s, s.newCarrierLandingObligations),
  });
  const invalidRefs = new Set([
    ...trimmed.releasedFighters.map((fighter) => fighter.ref),
    ...trimmed.orphanTags.map((tag) => tag.ref),
  ]);
  clearCarrierLandingRefs(s, invalidRefs);
  s.newCarrierLandingObligations = trimmed.obligations.map((row) => ({
    ...row,
    fighterRefs: [...row.fighterRefs],
    carrierFactories: [...row.carrierFactories],
  }));
}

interface CarrierDeclarationDraft {
  obligations: AxisCarrierObligationRow[];
  nextSequence: number;
}

function planNewCarrierDeclarations(args: {
  s: AxisState;
  idx: MapIndex;
  power: AxisCombatant;
  declarations: readonly AxisNewCarrierLandingOrder[];
  plans: readonly { space: string; slices: PlannedMoveSlice[] }[];
  move?: { from: string; to: string };
}): { draft?: CarrierDeclarationDraft; error?: string } {
  if (args.power === 'china') return { error: 'China cannot promise or mobilize an aircraft carrier.' };
  const power = args.power;
  const exactSlices = new Map<string, PlannedMoveSlice>();
  for (const plan of args.plans) {
    for (const slice of plan.slices) {
      if (slice.source.key !== 'fighter' || slice.count !== 1 || slice.selectedOrdinal == null) continue;
      exactSlices.set(`${plan.space}\u0000${slice.selectedOrdinal}`, slice);
    }
  }
  const currentTags = collectLiveCarrierTags(args.s);
  const draftTags = new Map(currentTags.map((tag) => [tag.ref, { ...tag }] as const));
  const usedRefs = new Set([
    ...draftTags.keys(),
    ...args.s.newCarrierLandingObligations.flatMap((row) => row.fighterRefs),
  ]);
  let nextSequence = args.s.carrierLandingSeq;
  const plannedByZone = new Map<string, { refs: string[]; factories: string[] }>();

  for (const declaration of args.declarations) {
    if (!args.idx.seaZone[declaration.zone]) return { error: 'A purchased carrier must be promised to a sea zone.' };
    if (args.move && (declaration.zone !== args.move.to
      || declaration.fighters.some((group) => group.from !== args.move!.from))) {
      return { error: 'A noncombat purchased-carrier declaration must match this exact move destination and origin.' };
    }
    const planned = { refs: [] as string[], factories: [...declaration.carrierFactories] };
    for (const group of declaration.fighters) {
      for (const ordinal of group.ordinals) {
        const slice = exactSlices.get(`${group.from}\u0000${ordinal}`);
        if (!slice) {
          return { error: 'Every purchased-carrier promise must name an exact selected fighter ordinal.' };
        }
        let ref = slice.carrierLanding?.ref;
        if (!ref) {
          do {
            ref = `carrier:${args.s.seed}:${nextSequence++}`;
          } while (usedRefs.has(ref));
          usedRefs.add(ref);
        }
        slice.carrierLanding = { ref, seaZone: declaration.zone };
        draftTags.set(ref, { ref, power, seaZone: declaration.zone });
        planned.refs.push(ref);
      }
    }
    plannedByZone.set(declaration.zone, planned);
  }

  const baseRows = normalizeAxisCarrierObligations(args.s.newCarrierLandingObligations);
  const trimmedBase = trimAxisCarrierObligations({
    obligations: baseRows,
    liveTags: [...draftTags.values()],
    decks: carrierDeckSnapshotsForRows(args.s, baseRows),
  }).obligations.map((row) => ({
    ...row,
    fighterRefs: [...row.fighterRefs],
    carrierFactories: [...row.carrierFactories],
  }));
  const rows = new Map<string, AxisCarrierObligationRow>(trimmedBase.map((row) => [
    `${row.power}\u0000${row.seaZone}`,
    row,
  ] as const));
  for (const [zone, planned] of plannedByZone) {
    const key = `${power}\u0000${zone}`;
    const existing = rows.get(key) ?? {
      power,
      seaZone: zone,
      fighterRefs: [],
      carrierFactories: [],
    };
    rows.set(key, {
      power,
      seaZone: zone,
      fighterRefs: [...existing.fighterRefs, ...planned.refs],
      carrierFactories: [...existing.carrierFactories, ...planned.factories],
    });
  }
  const obligations = normalizeAxisCarrierObligations([...rows.values()]);
  for (const zone of plannedByZone.keys()) {
    const row = obligations.find((candidate) => candidate.power === power && candidate.seaZone === zone);
    if (!row || row.carrierFactories.length === 0) {
      return { error: 'That fighter already has an ordinary landing; a purchased-carrier promise needs a reserved staged carrier.' };
    }
  }
  const validation = validateCarrierObligationRows({
    s: args.s,
    idx: args.idx,
    power,
    rows: obligations,
    ignoreHostilePhysical: true,
  });
  if (!validation.ok) return { error: validation.error };
  return { draft: { obligations, nextSequence } };
}

interface DefendingCarrierDeckDraft {
  stack: UnitStack;
  ref: string;
  occupied: number;
}

/** Expand a defending fleet without pooling carrier decks. Every valid loose
 * sea fighter is deterministically associated with one exact friendly hull;
 * allied cargo already retains its physical host directly. */
function buildDefenderBattleUnits(
  s: AxisState,
  enemies: readonly UnitStack[],
  targetSea: boolean,
): SideSpec['units'] {
  if (!targetSea) return enemies.map((stack) => ({
    key: stack.key,
    power: stack.power,
    count: stack.count,
    techs: techsOf(s, stack.power),
    ...(stack.damaged ? { damaged: stack.damaged } : {}),
    ...(stack.cargo?.length ? { cargo: stack.cargo.map((cargo) => ({ ...cargo })) } : {}),
  }));

  const units: SideSpec['units'] = [];
  const decks: DefendingCarrierDeckDraft[] = [];
  const looseFighters: { power: PowerKey; preferredHome?: string }[] = [];

  for (const stack of enemies) {
    if (stack.key === 'fighter') {
      if (!isPowerKey(stack.power)) continue;
      for (let physical = 0; physical < stack.count; physical++) {
        looseFighters.push({
          power: stack.power,
          ...(stack.count === 1 && stack.carrierBaseRef
            ? { preferredHome: stack.carrierBaseRef }
            : {}),
        });
      }
      continue;
    }
    if (stack.key !== 'carrier') {
      units.push({
        key: stack.key,
        power: stack.power,
        count: stack.count,
        techs: techsOf(s, stack.power),
        ...(stack.damaged ? { damaged: stack.damaged } : {}),
        ...(stack.cargo?.length ? { cargo: stack.cargo.map((cargo) => ({ ...cargo })) } : {}),
      });
      continue;
    }
    if (stack.count !== 1 || !stack.carrierRef) {
      if (stack.count !== 1) throw new Error('A defending carrier must be one physical hull.');
      stack.carrierRef = allocateAxisCarrierHullRef(s);
    }
    const deckFighters = (stack.cargo ?? []).filter((cargo) => cargo.key === 'fighter');
    const boundCargo = (stack.cargo ?? []).filter((cargo) => cargo.key !== 'fighter');
    units.push({
      key: 'carrier',
      power: stack.power,
      count: 1,
      techs: techsOf(s, stack.power),
      carrierRef: stack.carrierRef,
      ...(boundCargo.length ? { cargo: boundCargo.map((cargo) => ({ ...cargo })) } : {}),
    });
    const deck: DefendingCarrierDeckDraft = {
      stack,
      ref: stack.carrierRef,
      occupied: deckFighters.reduce((total, cargo) => total + Math.max(0, cargo.count), 0),
    };
    decks.push(deck);
    for (const fighter of deckFighters) {
      if (!isPowerKey(fighter.power)) continue;
      for (let physical = 0; physical < fighter.count; physical++) {
        units.push({
          key: 'fighter',
          power: fighter.power,
          count: 1,
          techs: techsOf(s, fighter.power),
          carrierGuest: fighter.power !== stack.power,
          carrierHostPower: stack.power,
          defendingCarrierFighterRef: allocateAxisDefendingCarrierFighterRef(s),
          homeCarrierRef: stack.carrierRef,
        });
      }
    }
  }

  decks.sort((left, right) => left.ref.localeCompare(right.ref));
  for (const fighter of looseFighters) {
    const preferred = fighter.preferredHome
      ? decks.find((deck) => deck.ref === fighter.preferredHome
        && sameSide(deck.stack.power, fighter.power)
        && deck.occupied < 2)
      : undefined;
    const home = preferred ?? decks.find((deck) => sameSide(deck.stack.power, fighter.power)
      && deck.occupied < 2);
    const fighterRef = allocateAxisDefendingCarrierFighterRef(s);
    if (home) home.occupied += 1;
    units.push({
      key: 'fighter',
      power: fighter.power,
      count: 1,
      techs: techsOf(s, fighter.power),
      ...(home ? {
        carrierGuest: fighter.power !== home.stack.power,
        carrierHostPower: home.stack.power,
      } : {}),
      defendingCarrierFighterRef: fighterRef,
      // A malformed over-capacity legacy zone still receives a unique missing
      // home identity; it is never pooled onto a real carrier silently.
      homeCarrierRef: home?.ref ?? `missing-carrier:${fighterRef}`,
    });
  }
  return units;
}

function actAttack(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'attack' }>): ActionResult {
  if (s.phase !== 'combatMove') return err('Not the combat move phase.');
  if (s.combat) return err('Resolve the current battle first.');
  const power = operatingPower(s);
  if (!power) return err('Choose whether USA or China conducts combat first.');
  const targetSea = isSeaZoneId(a.target);
  const amphibiousZone = a.amphibious?.zone ?? a.offloadFrom;
  if (power === 'china' && a.paratroopers?.length) {
    return err('China cannot use national technology advances or Paratroopers.');
  }
  if (power === 'china' && (targetSea || amphibiousZone || a.offloadUnits?.length)) {
    return err('Chinese forces cannot use sea zones or transports.');
  }
  const enemies = enemyUnitsAt(s, a.target, power);
  const targetTerr = idx.territory[a.target];
  if (!targetSea && !targetTerr) return err('Unknown target.');
  if (!targetSea && isNeutral(targetTerr!) && !s.control[a.target]) return err('Neutral territories are impassable.');
  if (s.contested.includes(a.target)) {
    return err('That space has already resolved an ordinary battle this turn. Fresh units cannot reinforce or attack it again.');
  }
  const hostileControl = !targetSea && s.control[a.target] != null && !sameSide(s.control[a.target]!, power);
  if (enemies.length === 0 && !hostileControl) return err('Nothing to attack there.');
  const sameZoneForce = validateMandatorySameZoneForce(s, power, a.target, a.forces);
  if (!sameZoneForce.ok) return sameZoneForce;
  const totalForce = a.forces.reduce((n, f) => n + f.units.reduce((m, u) => m + u.count, 0), 0)
    + (a.offloadUnits?.reduce((n, u) => n + u.count, 0) ?? 0)
    + (a.amphibious?.hulls.reduce((n, hull) => n + hull.units.reduce((m, unit) => m + unit.count, 0), 0) ?? 0)
    + (a.paratroopers?.reduce((n, group) => n + group.pairs.length * 2, 0) ?? 0);
  if (totalForce < 1) return err('Send at least one unit.');

  // Every exact ordinary and airborne pick resolves against one unchanged
  // action snapshot. No later validation pass may silently reinterpret an
  // ordinal after another group has been inspected.
  const selectionSnapshot = createAttackSelectionSnapshot(s, [
    ...a.forces.map((force) => force.from),
    ...(a.paratroopers ?? []).map((group) => group.from),
  ]);
  const staleOrdinarySelection = validateOrdinaryAttackSelections(
    selectionSnapshot,
    power,
    a.forces,
  );
  if (staleOrdinarySelection) return err(staleOrdinarySelection);
  const paratrooperPlan = a.paratroopers?.length
    ? planParatrooperPairs({
        s,
        idx,
        power,
        target: a.target,
        groups: a.paratroopers,
        snapshot: selectionSnapshot,
      })
    : { pairs: [] as PlannedParatrooperPair[] };
  if (paratrooperPlan.error) return err(paratrooperPlan.error);

  // collect and validate forces: each unit must genuinely reach the target
  // (land 1, tanks 2 with blitz, ships 2 through friendly water, air by
  // range with one move reserved to land)
  const committed: ActiveCombat['attackerCommitted'] = [];
  const from: ActiveCombat['from'] = [];
  const blitzThrough = new Set<string>(); // empty hostile intermediates tanks pass
  for (const f of a.forces) {
    const landForce = f.units.filter((unit) => UNITS[unit.key].domain === 'land');
    if (power !== 'china' && landForce.length > 0 && !targetSea) {
      const route = classifyAxisLandRoute({
        snapshot: s,
        idx,
        power,
        from: f.from,
        to: a.target,
        via: f.via,
        phase: 'combatMove',
      });
      const validation = validateAxisLandForceRoute(landForce, route, techsOf(s, power));
      if (!validation.ok) return err(landRouteError(validation));
      if (route === 'tank-blitz' && f.via) blitzThrough.add(f.via);
    }
    for (const u of f.units) {
      if (unmovedUnitCount(s, f.from, power, u.key) < u.count) return err(`Not enough unmoved ${UNITS[u.key].name} in ${f.from}.`);
      const dom = UNITS[u.key].domain;
      if (u.key === 'aaGun') {
        return err('Antiaircraft guns cannot move overland during Combat Move. Only a gun loaded on a transport in a prior turn may travel with an amphibious force.');
      }
      if (!targetSea && dom === 'sea') {
        // accompanying warships may only bombard an amphibious assault from
        // the offload zone itself
        const bombardier = u.key === 'battleship' || u.key === 'cruiser';
        if (!(bombardier && amphibiousZone && f.from === amphibiousZone)) {
          return err('Ships cannot enter territories.');
        }
        continue;
      }
      if (targetSea && dom === 'land') return err('Land units cannot attack sea zones.');
      // Non-Chinese land forces were validated atomically above so one tank
      // can pair with only one mechanized infantry from this exact origin.
      if (power !== 'china' && dom === 'land') continue;
      const reach = attackReach(s, idx, power, u.key, f.from, a.target, f.via);
      if (!reach.ok) return err(reach.error ?? `${UNITS[u.key].name} cannot reach ${a.target} from ${f.from}.`);
      if (reach.blitz) blitzThrough.add(reach.blitz);
    }
  }
  // amphibious offload
  let amphibious = false;
  let exactAmphibious: ExactAmphibiousPlan | null = null;
  let amphibiousUnits: { key: UnitKey; count: number }[] = [];
  if (a.amphibious) {
    if (targetSea) return err('Amphibious assaults target territories.');
    const planned = planExactAmphibious(s, idx, power, a.target, a.amphibious);
    if (planned.error) return err(planned.error);
    exactAmphibious = planned.plan;
    amphibiousUnits = planned.plan!.unloaded;
    amphibious = true;
  } else if (a.offloadFrom && a.offloadUnits?.length) {
    if (targetSea) return err('Amphibious assaults target territories.');
    amphibious = true;
    amphibiousUnits = a.offloadUnits.map((unit) => ({ ...unit }));
    const offloadZone = idx.seaZone[a.offloadFrom];
    if (!offloadZone) return err('Unknown amphibious offload zone.');
    if (!(offloadZone.coastTo ?? []).includes(a.target)) return err('That sea zone does not border the target territory.');
    if (seaZoneHostile(s, a.offloadFrom, power)) return err('Clear the sea zone before offloading (attack it first).');
    if (stacksAt(s, a.offloadFrom).some((stack) => stack.power === power
      && stack.key === 'transport' && stack.combatLoadedCargo?.length)) {
      return err('Combat-loaded cargo requires an exact per-transport amphibious order.');
    }
    // verify cargo exists aboard own transports in that zone
    const aboard: Partial<Record<UnitKey, number>> = {};
    for (const st of stacksAt(s, a.offloadFrom)) {
      if (st.power !== power || st.key !== 'transport') continue;
      if (st.offloadedTo || st.offloadBlocked) continue;
      for (const c of st.cargo ?? []) {
        if (c.power === power) aboard[c.key] = (aboard[c.key] ?? 0) + c.count;
      }
    }
    for (const u of a.offloadUnits) {
      if (UNITS[u.key].domain !== 'land') return err('Transports can offload land units only.');
      if ((aboard[u.key] ?? 0) < u.count) return err(`Not enough ${UNITS[u.key].name} aboard transports in ${a.offloadFrom}.`);
    }
  }
  if (amphibious && amphibiousZone) {
    const unloadedLand = amphibiousUnits.reduce((n, u) => n + u.count, 0);
    const bombardiers = a.forces.reduce((n, force) => n + force.units.reduce((m, u) =>
      m + (u.key === 'battleship' || u.key === 'cruiser' ? u.count : 0), 0), 0);
    if (bombardiers > 0 && s.contested.includes(amphibiousZone)) {
      return err('Shore bombardment is unavailable after sea combat in the offload zone.');
    }
    if (bombardiers > unloadedLand) {
      return err('Shore bombardment is limited to one battleship or cruiser per offloaded land unit.');
    }
  }

  const mandatoryPassiveSameZone = targetSea
    && !amphibious
    && a.forces.length > 0
    && a.forces.every((force) => force.from === a.target)
    && axisEnemySurfaceWarshipAt(s, a.target, power);
  if (!forceHasPositiveAttackCapability(a.forces, amphibiousUnits)
    && paratrooperPlan.pairs.length === 0
    && !mandatoryPassiveSameZone) {
    return err('A new battle needs at least one participating unit with a positive attack value. Passive units may accompany a real attacker, but cannot initiate combat alone.');
  }

  // Plan every source before mutating the board. Loaded carriers/transports
  // travel as whole physical stacks so their guest/cargo units cannot vanish
  // when combat is assembled, and a rejected partial loaded-stack order stays
  // atomic (including any pending blitz captures).
  const combatPlans: { space: string; slices: PlannedMoveSlice[] }[] = [];
  for (const f of a.forces) {
    const plan = planUnmovedSlices(s, f.from, power, f.units);
    if (plan.error) return err(plan.error);
    combatPlans.push({ space: f.from, slices: plan.slices });
  }

  let carrierDraft: CarrierDeclarationDraft | undefined;
  if (a.newCarrierLandings) {
    const declaration = planNewCarrierDeclarations({
      s,
      idx,
      power,
      declarations: a.newCarrierLandings,
      plans: combatPlans,
    });
    if (!declaration.draft) return err(declaration.error ?? 'The purchased-carrier landing declaration is invalid.');
    carrierDraft = declaration.draft;
  }

  const air: AirUnitGroup[] = [
    ...combatPlans.flatMap((plan) => plan.slices
      .filter((slice): slice is PlannedMoveSlice & { source: UnitStack & { key: AirUnitKey } } =>
        slice.source.key === 'fighter' || slice.source.key === 'bomber')
      .map((slice) => ({
        from: plan.space,
        key: slice.source.key,
        count: slice.count,
        ...(slice.movementSpent != null ? { movementSpent: slice.movementSpent } : {}),
        ...(slice.carrierLanding ? { futureCarrierZone: slice.carrierLanding.seaZone } : {}),
      }))),
    // The explicit flight route is already spent. Starting the landing check
    // at the battle space prevents a shorter graph path from refunding range.
    ...paratrooperPlan.pairs.map((pair) => ({
      from: a.target,
      key: 'bomber' as const,
      count: 1,
      movementSpent: pair.bomberMovementSpent,
    })),
  ];
  const carrierMoves: CarrierMoveProjection[] = combatPlans.flatMap((plan) => plan.slices
    .filter((slice) => slice.source.key === 'carrier')
    .map((slice) => ({
      from: plan.space,
      to: a.target,
      count: slice.count,
      cargoFighters: (slice.cargo ?? [])
        .filter((cargo) => cargo.key === 'fighter' && sameSide(cargo.power, power))
        .reduce((total, cargo) => total + cargo.count, 0),
    })));
  if (power === 'china') {
    const contested = [...new Set([...s.contested, a.target])];
    const canLand = air.every((unit) => unit.key === 'fighter' && chinaFighterAttackHasLanding({
      territories: idx.map.territories,
      control: s.control,
      contested,
      from: unit.from,
      target: a.target,
      movementSpent: unit.movementSpent,
      range: UNITS.fighter.move,
    }));
    if (!canLand) return err('The Flying Tigers have no legal in-region landing after this attack.');
  } else {
    const airLanding = validateAirAttackLanding({
      snapshot: s,
      idx,
      power,
      techs: techsOf(s, power),
      air,
      target: a.target,
      carrierMoves,
    });
    if (!airLanding.ok) return err(airLanding.error ?? 'The attacking aircraft have no legal landing plan.');
  }

  if (carrierDraft) {
    s.newCarrierLandingObligations = carrierDraft.obligations;
    s.carrierLandingSeq = carrierDraft.nextSequence;
  }

  // blitzed intermediates flip to the attacker as the tanks roll through
  for (const mid of blitzThrough) {
    captureTerritory(s, mid, power);
    if (!s.contested.includes(mid)) s.contested.push(mid);
    s.log.push({ round: s.round, power: combatantController(power), space: mid, text: `${combatantName(power)} blitzes through ${idx.territory[mid]?.name ?? mid}.` });
  }

  // move the units out of their origins into the battle
  for (let i = 0; i < a.forces.length; i++) {
    const f = a.forces[i];
    const plan = combatPlans[i];
    removePlannedSlices(s, plan.space, plan.slices);
    for (const slice of plan.slices) {
      const domain = UNITS[slice.source.key].domain;
      const ingressFrom = domain === 'land' && !targetSea
        ? f.via ?? f.from
        : domain === 'sea' && targetSea
          ? (f.from === a.target && f.via === undefined ? undefined : f.via ?? f.from)
          : undefined;
      const airDistanceSpent = slice.source.key === 'fighter' || slice.source.key === 'bomber'
        ? power === 'china'
          ? chinaMoveDistance(
              idx.map.territories,
              plan.space,
              a.target,
              Math.max(0, UNITS.fighter.move - (slice.movementSpent ?? 0)),
            )
          : airDistance(
              idx,
              plan.space,
              a.target,
              Math.max(0, airUnitRange(slice.source.key, techsOf(s, power)) - (slice.movementSpent ?? 0)),
            )
        : null;
      committed.push({
        key: slice.source.key,
        count: slice.count,
        ...(slice.damaged ? { damaged: slice.damaged } : {}),
        ...(slice.cargo?.length ? { cargo: slice.cargo.map((item) => ({ ...item })) } : {}),
        ...(slice.combatLoadedCargo?.length
          ? { combatLoadedCargo: slice.combatLoadedCargo.map((item) => ({ ...item })) }
          : {}),
        ...(slice.loadedThisTurnCargo?.length
          ? { loadedThisTurnCargo: slice.loadedThisTurnCargo.map((item) => ({ ...item })) }
          : {}),
        ...(slice.offloadBlocked ? { offloadBlocked: true } : {}),
        ...(slice.carrierLanding ? { carrierLanding: { ...slice.carrierLanding } } : {}),
        ...(slice.carrierRef ? { carrierRef: slice.carrierRef } : {}),
        ...(ingressFrom ? { ingressFrom } : {}),
        ...(airDistanceSpent != null
          ? { movementSpent: (slice.movementSpent ?? 0) + airDistanceSpent }
          : {}),
      });
    }
    // Ordinals/signatures are command freshness data, not durable battle
    // state. Retreat provenance needs only the committed type/count snapshot.
    from.push({ space: f.from, units: f.units.map(({ key, count }) => ({ key, count })) });
  }
  for (const pair of paratrooperPlan.pairs) {
    removePlannedSlices(s, pair.from, [pair.bomber, pair.infantry]);
    committed.push(
      {
        key: 'bomber',
        count: 1,
        movementSpent: pair.bomberMovementSpent,
        pairId: pair.pairId,
        role: 'bomber',
        aboard: false,
      },
      {
        key: 'infantry',
        count: 1,
        pairId: pair.pairId,
        role: 'infantry',
        aboard: true,
        // Deliberately no ingressFrom: airborne infantry cannot manufacture a
        // retreat route. An ordinary adjacent overland attacker may supply it.
      },
    );
  }
  for (const group of a.paratroopers ?? []) {
    from.push({
      space: group.from,
      units: [
        { key: 'bomber', count: group.pairs.length },
        { key: 'infantry', count: group.pairs.length },
      ],
    });
  }
  if (exactAmphibious) {
    commitExactAmphibious(s, exactAmphibious);
    committed.push(...amphibiousUnits.map((unit) => ({ ...unit })));
    const byOrigin = new Map<string, { key: UnitKey; count: number }[]>();
    for (const hull of exactAmphibious.hulls) {
      const units = byOrigin.get(hull.hull.sourceSpace) ?? [];
      units.push(...hull.order.units.map((unit) => ({ ...unit })));
      byOrigin.set(hull.hull.sourceSpace, units);
    }
    for (const [space, units] of byOrigin) from.push({ space, units });
  } else if (amphibious && a.offloadUnits) {
    for (const u of a.offloadUnits) {
      let left = u.count;
      for (const st of stacksAt(s, a.offloadFrom!)) {
        if (st.power !== power || st.key !== 'transport' || !st.cargo) continue;
        if (st.offloadedTo || st.offloadBlocked) continue;
        const beforeHull = left;
        for (const c of st.cargo) {
          if (c.power !== power || c.key !== u.key || left === 0) continue;
          const take = Math.min(c.count, left);
          c.count -= take;
          left -= take;
        }
        st.cargo = st.cargo.filter((c) => c.count > 0);
        if (left < beforeHull) {
          st.moved = 1;
          st.offloadedTo = a.target;
        }
      }
      committed.push(u);
    }
    from.push({ space: a.offloadFrom!, units: a.offloadUnits });
  }

  // build defender spec: every enemy unit in the space defends together
  // (multinational defense); AA guns and factories ride along in territories
  const defUnits = buildDefenderBattleUnits(s, enemies, targetSea);
  const defPowers = [...new Set(enemies.map((e) => e.power))];
  const defTechs = defPowers.length === 1 && defPowers[0] !== 'china' ? techsOf(s, defPowers[0] as PowerKey) : [];

  const amphibiousLand = amphibiousUnits.reduce<Partial<Record<UnitKey, number>>>((counts, u) => {
    counts[u.key] = (counts[u.key] ?? 0) + u.count;
    return counts;
  }, {});
  const battle = createBattle(
    { units: committed.map((u) => ({ ...u, power })), techs: techsOf(s, power) },
    { units: defUnits, techs: defTechs },
    { amphibious, seaCombat: targetSea, ...(amphibious ? { amphibiousLand } : {}) },
  );
  const committedTransportStates = committed.flatMap((unit) => unit.key === 'transport'
    ? Array.from({ length: unit.count }, () => ({
        ...(unit.combatLoadedCargo?.length
          ? { combatLoadedCargo: unit.combatLoadedCargo.map((cargo) => ({ ...cargo })) }
          : {}),
        ...(unit.loadedThisTurnCargo?.length
          ? { loadedThisTurnCargo: unit.loadedThisTurnCargo.map((cargo) => ({ ...cargo })) }
          : {}),
        ...(unit.offloadBlocked ? { offloadBlocked: true } : {}),
      }))
    : []);
  const transportLedger = battle.attacker
    .filter((unit) => unit.key === 'transport')
    .map((unit, index) => ({ uid: unit.uid, ...committedTransportStates[index] }));
  // enemy units leave the board while the battle runs
  s.board[a.target] = stacksAt(s, a.target).filter((st) => sameSide(st.power, power));

  s.combat = {
    id: s.combatSeq++,
    visualSeq: 0,
    kind: 'battle',
    retreatRulesVersion: 1,
    space: a.target,
    attacker: power,
    from,
    amphibious,
    offloadFrom: amphibiousZone,
    battle,
    attackerCommitted: committed,
    ...(transportLedger.length ? { transportLedger } : {}),
  };
  if (!s.contested.includes(a.target)) s.contested.push(a.target);
  s.phase = 'battle';
  s.log.push({ round: s.round, power: combatantController(power), space: a.target, text: `${combatantName(power)} attacks ${targetSea ? `sea zone ${idx.seaZone[a.target]?.n ?? ''}` : targetTerr!.name}.` });
  syncBattle(s);
  return OK;
}

// ---------- strategic bombing raids ----------

function actSbr(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'sbr' }>): ActionResult {
  if (s.phase !== 'combatMove') return err('Raids launch during the combat move.');
  if (s.combat) return err('Resolve the current battle first.');
  const actor = operatingPower(s);
  if (!actor) return err('Choose whether USA or China conducts combat first.');
  if (actor === 'china') return err('China cannot conduct strategic bombing raids.');
  const power = actor;
  const t = idx.territory[a.target];
  if (!t) return err('Raids target territories.');
  const holder = s.control[a.target];
  if (holder == null || sameSide(holder, power)) return err('Raid an enemy industrial complex.');
  if (unitCount(s, a.target, null, 'factory') === 0) return err('No industrial complex there.');
  if (s.economicRaidLedger.targetedFactories.includes(a.target)) {
    return err('That industrial complex has already been assigned its strategic bombing raid this turn.');
  }

  let bombers = 0;
  for (const f of a.forces) {
    if (f.bombers < 1) continue;
    if (unmovedUnitCount(s, f.from, power, 'bomber') < f.bombers) return err(`Not enough unmoved bombers in ${f.from}.`);
    const reach = attackReach(s, idx, power, 'bomber', f.from, a.target);
    if (!reach.ok) return err(reach.error ?? 'Bombers out of range.');
    bombers += f.bombers;
  }
  if (bombers === 0) return err('Send at least one bomber.');

  const raidPlans: { space: string; slices: PlannedMoveSlice[] }[] = [];
  for (const force of a.forces) {
    const plan = planUnmovedSlices(s, force.from, power, [{
      key: 'bomber',
      count: force.bombers,
      ...(force.ordinals ? { ordinals: force.ordinals, selectionSig: force.selectionSig } : {}),
    }]);
    if (plan.error) return err(plan.error);
    raidPlans.push({ space: force.from, slices: plan.slices });
  }
  const airLanding = validateAirAttackLanding({
    snapshot: s,
    idx,
    power,
    techs: techsOf(s, power),
    air: raidPlans.flatMap((plan) => plan.slices.map((slice) => ({
      from: plan.space,
      key: 'bomber' as const,
      count: slice.count,
      ...(slice.movementSpent != null ? { movementSpent: slice.movementSpent } : {}),
    }))),
    target: a.target,
  });
  if (!airLanding.ok) return err(airLanding.error ?? 'The raiding bombers have no legal landing plan.');

  // Compute every exact attack distance before mutating the board. Launching a
  // raid commits aircraft and opens the cinematic, but deliberately draws no
  // RNG and applies no damage until the gated battleRoll actions arrive.
  const committed: ActiveCombat['attackerCommitted'] = [];
  const from: ActiveCombat['from'] = [];
  for (const plan of raidPlans) {
    let declared = 0;
    for (const slice of plan.slices) {
      const distance = airDistance(
        idx,
        plan.space,
        a.target,
        Math.max(0, airUnitRange('bomber', techsOf(s, power)) - (slice.movementSpent ?? 0)),
      );
      if (distance == null) return err(`Bombers from ${plan.space} cannot reach the target.`);
      committed.push({
        key: 'bomber',
        count: slice.count,
        movementSpent: (slice.movementSpent ?? 0) + distance,
      });
      declared += slice.count;
    }
    from.push({ space: plan.space, units: [{ key: 'bomber', count: declared }] });
  }

  for (const plan of raidPlans) removePlannedSlices(s, plan.space, plan.slices);

  const targetStacks = stacksAt(s, a.target);
  const factoryPower = targetStacks.find((stack) => stack.key === 'factory')?.power ?? holder;
  const aaStacks = targetStacks.filter((stack) => stack.key === 'aaGun' && stack.count > 0);
  const defPowers = [...new Set([...aaStacks.map((stack) => stack.power), factoryPower])];
  const defTechs = defPowers.length === 1 ? techsOf(s, defPowers[0]) : [];
  const defenderUnits: SideSpec['units'] = [
    ...aaStacks.map((stack) => ({
      key: 'aaGun' as const,
      power: stack.power,
      count: stack.count,
      techs: techsOf(s, stack.power),
    })),
    { key: 'factory', power: factoryPower, count: 1, techs: techsOf(s, factoryPower) },
  ];
  const battle = createBattle(
    { units: committed.map((unit) => ({ ...unit, power })), techs: techsOf(s, power) },
    { units: defenderUnits, techs: defTechs },
    { amphibious: false, seaCombat: false, strategicRaid: true },
  );
  const cap = t.ipc * 2;
  const damageBefore = s.factoryDamage[a.target] ?? 0;
  s.combat = {
    id: s.combatSeq++,
    visualSeq: 0,
    kind: 'strategicRaid',
    retreatRulesVersion: 1,
    space: a.target,
    attacker: power,
    from,
    amphibious: false,
    battle,
    attackerCommitted: committed,
    raid: { cap, damageBefore },
  };
  s.economicRaidLedger.targetedFactories.push(a.target);
  s.phase = 'battle';
  s.log.push({
    round: s.round,
    power,
    space: a.target,
    text: `${POWERS[power].name} launches a strategic bombing raid against the ${t.name} industrial complex.`,
  });
  syncBattle(s);
  return OK;
}

function rocketValidationError(reason: string | undefined): string {
  switch (reason) {
    case 'china-has-no-technology': return 'China cannot use national technology advances.';
    case 'source-not-territory': return 'Rockets must launch from a land territory.';
    case 'source-has-no-own-aa-gun': return 'The source has no available AA gun owned by this power.';
    case 'source-already-launched': return 'That territory has already supplied a rocket launch this turn.';
    case 'target-not-territory': return 'Rockets target land territories.';
    case 'target-has-no-enemy-factory': return 'Rockets must target an enemy industrial complex.';
    case 'target-already-struck': return 'That industrial complex has already suffered a rocket strike this turn.';
    case 'target-out-of-range': return 'That industrial complex is outside the rocket range of three spaces.';
    default: return 'That rocket strike is not legal.';
  }
}

function actRocketStrike(
  s: AxisState,
  idx: MapIndex,
  a: Extract<AxisAction, { type: 'rocketStrike' }>,
): ActionResult {
  if (s.phase !== 'combatMove') return err('Rockets launch during the combat move.');
  if (s.combat) return err('Resolve the current battle first.');
  const actor = operatingPower(s);
  if (!actor) return err('Choose whether USA or China conducts combat first.');
  if (actor === 'china') return err('China cannot use national technology advances.');
  const power = actor;
  if (!techsOf(s, power).includes('rockets')) return err(`${POWERS[power].name} has not developed Rockets.`);

  const sourceStacks = stacksAt(s, a.source);
  if (axisPieceSelectionSignature(sourceStacks, power, 'aaGun') !== a.launcher.selectionSig) {
    return err('Those exact AA gun pieces changed. Select the launcher again.');
  }
  const launcher = availableAxisPhysicalPieces(sourceStacks, power, 'aaGun')
    .find((piece) => piece.ordinal === a.launcher.ordinal);
  if (!launcher) return err('That exact AA gun is no longer available to launch.');

  const validation = validateAxisRocketStrike({
    snapshot: s,
    idx,
    power,
    source: a.source,
    target: a.target,
    ledger: {
      launchedFrom: s.rocketLedger.launchedFrom,
      targetedFactories: s.rocketLedger.targetedFactories,
    },
  });
  if (!validation.ok || validation.distance === null) {
    return err(rocketValidationError(validation.reason));
  }

  const target = idx.territory[a.target]!;
  const targetStacks = stacksAt(s, a.target);
  const holder = s.control[a.target];
  const factoryPower = targetStacks.find((stack) => stack.key === 'factory'
    && stack.count > 0 && !sameSide(stack.power, power))?.power ?? holder;
  if (!factoryPower || sameSide(factoryPower, power)) {
    return err('Rockets must target an enemy industrial complex.');
  }
  const battle = createBattle(
    {
      units: [{ key: 'aaGun', power, count: 1, techs: techsOf(s, power) }],
      techs: techsOf(s, power),
    },
    {
      units: [{ key: 'factory', power: factoryPower, count: 1, techs: techsOf(s, factoryPower) }],
      techs: techsOf(s, factoryPower),
    },
    { amphibious: false, seaCombat: false, rocketStrike: true },
  );
  const cap = target.ipc * 2;
  const damageBefore = s.factoryDamage[a.target] ?? 0;

  // Commit both limits and open the visual engagement as one accepted action.
  // The real AA sculpt stays untouched on the board; the battle uses a virtual
  // launcher solely to drive one physical d6 through the readiness gate.
  s.combat = {
    id: s.combatSeq++,
    visualSeq: 0,
    kind: 'rocketStrike',
    retreatRulesVersion: 1,
    space: a.target,
    attacker: power,
    from: [{ space: a.source, units: [{ key: 'aaGun', count: 1 }] }],
    amphibious: false,
    battle,
    attackerCommitted: [],
    rocket: {
      source: a.source,
      path: [...validation.path],
      distance: validation.distance,
      launcherOrdinal: a.launcher.ordinal,
      cap,
      damageBefore,
    },
  };
  s.rocketLedger.launchedFrom.push(a.source);
  s.rocketLedger.targetedFactories.push(a.target);
  s.phase = 'battle';
  s.log.push({
    round: s.round,
    power,
    space: a.target,
    text: `${POWERS[power].name} launches a rocket from ${idx.territory[a.source]!.name} at the ${target.name} industrial complex.`,
  });
  syncBattle(s);
  return OK;
}

// ---------- battle progression ----------

function syncStrategicRaidResult(s: AxisState, c: ActiveCombat): void {
  if (c.kind !== 'strategicRaid' || !c.raid || c.battle.status !== 'raid_resolved') return;
  if (c.raid.appliedDamage !== undefined) return;
  const rawDamage = Math.max(0, c.battle.raidDamage ?? 0);
  const appliedDamage = Math.min(rawDamage, Math.max(0, c.raid.cap - c.raid.damageBefore));
  c.raid.rawDamage = rawDamage;
  c.raid.appliedDamage = appliedDamage;
  // The launch snapshot is authoritative for this otherwise-blocking raid;
  // applying from it once makes save/reconnect replay idempotent.
  s.factoryDamage[c.space] = c.raid.damageBefore + appliedDamage;
}

function syncRocketStrikeResult(s: AxisState, c: ActiveCombat): void {
  if (c.kind !== 'rocketStrike' || !c.rocket || c.battle.status !== 'rocket_resolved') return;
  if (c.rocket.appliedDamage !== undefined) return;
  const target = c.rocket;
  const result = axisRocketDamage(
    c.battle.rocketDamage ?? 1,
    target.damageBefore,
    Math.floor(target.cap / 2),
  );
  target.roll = result.roll;
  target.appliedDamage = result.appliedDamage;
  // The launch snapshot is authoritative and the populated result makes this
  // idempotent across report acknowledgements and save/reconnect replays.
  s.factoryDamage[c.space] = result.damageAfter;
}

function syncBattle(s: AxisState): void {
  const c = s.combat;
  if (!c) return;
  syncStrategicRaidResult(s, c);
  syncRocketStrikeResult(s, c);
  s.pendings = s.pendings.filter((p) => !p.kind.startsWith('battle-'));
  const b = c.battle;
  if (b.status !== 'ongoing') {
    // a walk-in (no defenders ever) applies immediately; a fought battle
    // holds its report on screen until BOTH commanders press continue
    if (b.defender.length === 0) {
      finishBattle(s);
      return;
    }
    c.confirmed ??= { attacker: false, defender: false };
    if (!c.confirmed.attacker) {
      s.pendings.push({ id: s.pendingSeq++, power: c.attacker, kind: 'battle-continue', data: { side: 'attacker' } });
    }
    if (!c.confirmed.defender) {
      s.pendings.push({ id: s.pendingSeq++, power: defenderPowerOf(s, c), kind: 'battle-continue', data: { side: 'defender' } });
    }
    if (c.confirmed.attacker && c.confirmed.defender) finishBattle(s);
    return;
  }
  if (b.decision) {
    const seatPower = b.decision.type === 'retreat'
      ? c.attacker
      : b.decision.side === 'attacker' ? c.attacker : defenderPowerOf(s, c);
    s.pendings.push({
      id: s.pendingSeq++,
      power: seatPower,
      kind: b.decision.type === 'casualties' ? 'battle-casualties' : b.decision.type === 'submerge' ? 'battle-submerge' : 'battle-retreat',
      data: { decision: b.decision },
    });
  }
}

function defenderPowerOf(s: AxisState, c: ActiveCombat): PowerKey | 'china' {
  const alive = [...new Set(c.battle.defender.filter((u) => u.hp > 0).map((u) => u.power))];
  const any = [...new Set(c.battle.defender.map((u) => u.power))];
  return (alive[0] ?? any[0] ?? 'china') as PowerKey | 'china';
}

function validateCurrentBattleTarget(c: ActiveCombat, target: AxisBattleTarget): ActionResult | null {
  if (target.combatId !== undefined && target.combatId !== c.id) return err('That battle is no longer current.');
  if (target.visualSeq !== undefined && target.visualSeq !== c.visualSeq) return err('That battle moment is no longer current.');
  return null;
}

function advanceBattleVisual(c: ActiveCombat): void {
  c.visualSeq = (c.visualSeq ?? 0) + 1;
}

function actBattleContinue(s: AxisState, power: PowerKey | 'china', target: AxisBattleTarget): ActionResult {
  const c = s.combat;
  if (!c || !c.confirmed) return err('No battle report waiting.');
  const stale = validateCurrentBattleTarget(c, target);
  if (stale) return stale;
  const mine = s.pendings.find((p) => p.kind === 'battle-continue'
    && (p.power === power || (p.power === 'china' && power === 'usa')));
  if (!mine) return err('You have already continued.');
  if (mine.data.side === 'attacker') c.confirmed.attacker = true;
  else c.confirmed.defender = true;
  syncBattle(s);
  return OK;
}

function actBattleRoll(s: AxisState, target: AxisBattleTarget): ActionResult {
  const c = s.combat;
  if (!c || s.phase !== 'battle') return err('No battle running.');
  const stale = validateCurrentBattleTarget(c, target);
  if (stale) return stale;
  if (c.battle.decision) return err('A decision is pending.');
  const kind = currentStep(c.battle);
  if (!kind || kind === 'casualties') return err('Nothing to roll.');
  const dice = stepDice(c.battle, kind);
  resolveRoll(c.battle, dice.map(() => d6(s)));
  advanceBattleVisual(c);
  syncBattle(s);
  return OK;
}

function actBattleCasualties(s: AxisState, uids: number[], target: AxisBattleTarget): ActionResult {
  const c = s.combat;
  if (!c || c.battle.decision?.type !== 'casualties') return err('No casualty pick pending.');
  const stale = validateCurrentBattleTarget(c, target);
  if (stale) return stale;
  applyCasualtyPicks(c.battle, uids);
  advanceBattleVisual(c);
  syncBattle(s);
  return OK;
}

function actBattleSubmerge(s: AxisState, uids: number[], target: AxisBattleTarget): ActionResult {
  const c = s.combat;
  if (!c || c.battle.decision?.type !== 'submerge') return err('No submerge pending.');
  const stale = validateCurrentBattleTarget(c, target);
  if (stale) return stale;
  applySubmerge(c.battle, uids);
  advanceBattleVisual(c);
  syncBattle(s);
  return OK;
}

function actBattleRetreat(
  s: AxisState,
  idx: MapIndex,
  action: Extract<AxisAction, { type: 'battleRetreat' }>,
): ActionResult {
  const c = s.combat;
  if (!c || c.battle.decision?.type !== 'retreat') return err('No retreat pending.');
  const stale = validateCurrentBattleTarget(c, action);
  if (stale) return stale;
  if (action.retreat) {
    const validation = validateAxisRetreatDestination({
      battle: c.battle,
      battleSpace: c.space,
      attacker: c.attacker,
      board: s.board,
      control: s.control,
      index: idx,
      turnStartHostileSeaZones: s.turnStartSea.hostile,
    }, action.destination);
    if (!validation.ok) return err(validation.error);
    c.retreatTo = validation.destination;
  }
  applyRetreat(c.battle, action.retreat);
  advanceBattleVisual(c);
  syncBattle(s);
  return OK;
}

function finishBattle(s: AxisState): void {
  const c = s.combat!;
  if (c.kind === 'strategicRaid') {
    finishStrategicRaid(s, c);
    return;
  }
  if (c.kind === 'rocketStrike') {
    finishRocketStrike(s, c);
    return;
  }
  const b = c.battle;
  const power = c.attacker;
  const survivorsAtk = b.attacker.filter((u) => u.hp > 0);
  const withdrawnAtk = (b.withdrawnAttacker ?? []).filter((u) => u.hp > 0);
  const survivorsDef = b.defender.filter((u) => u.hp > 0);

  // in a land battle, accompanying warships (bombardiers) go back to the
  // offload zone whatever happens — they were never IN the territory
  const shipHome = c.offloadFrom ?? c.space;
  const landBattle = !isSeaZoneId(c.space);
  const exactRetreatSpace = (): string => {
    if (typeof c.retreatTo === 'string') return c.retreatTo;
    throw new Error(`Battle ${c.id} ended with retreating land/sea units but no exact adjacent destination.`);
  };
  const boardCargo = (cargo?: { power: string; key: UnitKey; count: number }[]): UnitStack['cargo'] =>
    cargo?.map((item) => ({ ...item, power: item.power as PowerKey | 'china' }));
  const placeAtk = (
    u: {
      uid: number;
      key: UnitKey;
      hp: number;
      maxHp: number;
      cargo?: { power: string; key: UnitKey; count: number }[];
      movementSpent?: number;
      carrierLanding?: AxisCarrierLandingTag;
      carrierRef?: string;
    },
    space: string,
    retreated = false,
  ) => {
    const ledger = u.key === 'transport' ? c.transportLedger?.find((entry) => entry.uid === u.uid) : undefined;
    const transportState = ledger ? {
      ...(ledger.combatLoadedCargo?.length && !retreated
        ? { combatLoadedCargo: ledger.combatLoadedCargo.map((item) => ({ ...item })) }
        : {}),
      ...(ledger.loadedThisTurnCargo?.length
        ? { loadedThisTurnCargo: ledger.loadedThisTurnCargo.map((item) => ({ ...item })) }
        : {}),
      ...((ledger.offloadBlocked || retreated) ? { offloadBlocked: true } : {}),
    } : retreated && u.key === 'transport' ? { offloadBlocked: true } : undefined;
    // Anniversary battleships repair for free when combat concludes.
    if (landBattle && UNITS[u.key].domain === 'sea') {
      addSpentCombatUnit(s, shipHome, power, u.key, boardCargo(u.cargo), u.movementSpent, transportState, u.carrierLanding, u.carrierRef);
    } else {
      addSpentCombatUnit(s, space, power, u.key, boardCargo(u.cargo), u.movementSpent, transportState, u.carrierLanding, u.carrierRef);
    }
  };
  const returnDefenders = (captureInfrastructure: boolean) => {
    // Restore exact carrier hulls before recording their launched fighters.
    // Fighters themselves remain off-board in the durable emergency queue
    // until every acting-player combat has concluded.
    for (const u of survivorsDef.filter((unit) => unit.key === 'carrier')) {
      if (u.carrierRef) {
        addAxisCarrierHull(
          s,
          c.space,
          u.power as PowerKey | 'china',
          u.carrierRef,
          boardCargo(u.cargo),
        );
      } else {
        // Legacy in-progress battles predate exact hull refs. Allocate a fresh
        // physical identity rather than pooling the survivor.
        addUnits(s, c.space, u.power as PowerKey | 'china', 'carrier', 1, boardCargo(u.cargo));
      }
    }
    for (const u of survivorsDef.filter((unit) => unit.key !== 'carrier'
      && !unit.defendingCarrierFighterRef)) {
      const infrastructure = u.key === 'aaGun' || u.key === 'factory';
      if (captureInfrastructure && infrastructure && landBattle) {
        const holder = s.control[c.space];
        if (holder) {
          // Captured AA guns change hands, but cannot move again during the
          // captor's Noncombat Move in this same turn.
          if (u.key === 'aaGun') addSpentCombatUnit(s, c.space, holder, u.key, boardCargo(u.cargo));
          else addUnits(s, c.space, holder, u.key, 1, boardCargo(u.cargo));
        }
      } else {
        addUnits(s, c.space, u.power as PowerKey | 'china', u.key, 1, boardCargo(u.cargo));
      }
    }
    for (const u of survivorsDef.filter((unit) => unit.defendingCarrierFighterRef)) {
      if (landBattle || u.key !== 'fighter' || !isPowerKey(u.power) || !u.homeCarrierRef) {
        throw new Error('A launched defending carrier fighter lost its exact landing metadata.');
      }
      const fighter: AxisDefendingCarrierFighter = {
        ref: u.defendingCarrierFighterRef!,
        power: u.power,
        originSeaZone: c.space,
        homeCarrierRef: u.homeCarrierRef,
      };
      if (!s.pendingDefendingCarrierFighters.some((candidate) => candidate.ref === fighter.ref)) {
        s.pendingDefendingCarrierFighters.push(fighter);
      }
    }
  };

  for (const u of withdrawnAtk) {
    if (UNITS[u.key].domain === 'air') placeAtk(u, c.space);
    else placeAtk(u, exactRetreatSpace(), true);
  }

  if (b.status === 'retreated') {
    for (const u of survivorsAtk) {
      const domain = UNITS[u.key].domain;
      if (domain === 'air' || (domain === 'sea' && u.submerged)) {
        placeAtk(u, c.space);
      } else if (landBattle && domain === 'sea') {
        placeAtk(u, shipHome);
      } else {
        placeAtk(u, exactRetreatSpace(), true);
      }
    }
    returnDefenders(false);
  } else if (b.status === 'defender_won' || b.status === 'standoff' || b.status === 'mutual') {
    // A loss or standoff is not an undeclared retreat. Aircraft and already
    // submerged submarines remain in the contested space for their normal
    // post-combat handling; offshore bombardiers still return through placeAtk.
    for (const u of survivorsAtk) placeAtk(u, c.space);
    returnDefenders(false);
  } else {
    // attacker cleared or captured the space
    for (const u of survivorsAtk) placeAtk(u, c.space);
    if (b.status === 'attacker_captured' && !isSeaZoneId(c.space)) {
      captureTerritory(s, c.space, power);
    }
    // AA guns and industrial complexes never become casualties. If land is
    // captured they change hands; after an air-only clear they stay with the
    // defender. Submerged defenders likewise remain in the sea zone.
    returnDefenders(b.status === 'attacker_captured');
  }
  // after-action report for the TV: losses per side from the battle log
  const atkLost: Partial<Record<UnitKey, number>> = {};
  const defLost: Partial<Record<UnitKey, number>> = {};
  for (const e of b.log) {
    for (const cas of e.casualties) {
      const tgt = cas.side === 'attacker' ? atkLost : defLost;
      tgt[cas.key] = (tgt[cas.key] ?? 0) + 1;
    }
  }
  const defPowers = [...new Set(b.defender.map((u) => u.power))];
  s.lastBattle = {
    seq: c.id,
    space: c.space,
    attacker: power,
    defender: (defPowers[0] ?? null) as PowerKey | 'china' | null,
    status: b.status,
    ...(c.retreatTo !== undefined ? { retreatTo: c.retreatTo } : {}),
    atkLost,
    defLost,
  };
  s.log.push({ round: s.round, power: combatantController(power), space: c.space, text: battleOutcomeText(s, c) });
  s.combat = null;
  s.phase = 'combatMove';
}

function finishStrategicRaid(s: AxisState, c: ActiveCombat): void {
  const raid = c.raid;
  if (!raid) throw new Error('Strategic raid is missing its report state.');
  const survivors = c.battle.attacker.filter((unit) => unit.key === 'bomber' && unit.hp > 0);
  const losses = c.battle.attacker.filter((unit) => unit.key === 'bomber' && unit.hp <= 0).length;
  for (const bomber of survivors) {
    addSpentCombatUnit(s, c.space, c.attacker, 'bomber', undefined, bomber.movementSpent);
  }
  const rawDamage = raid.rawDamage ?? 0;
  const appliedDamage = raid.appliedDamage ?? 0;
  const saturated = appliedDamage < rawDamage ? ' (complex saturated)' : '';
  s.log.push({
    round: s.round,
    power: combatantController(c.attacker),
    space: c.space,
    text: `${combatantName(c.attacker)} completes the strategic raid: ${losses} bomber${losses === 1 ? '' : 's'} lost, ${survivors.length} through, ${appliedDamage} damage${saturated}. Damage now ${s.factoryDamage[c.space] ?? raid.damageBefore}/${raid.cap}.`,
  });
  // The live raid report already held the complete cinematic result. Avoid
  // replaying an unrelated prior territory-battle AfterAction card.
  s.lastBattle = null;
  s.combat = null;
  s.phase = 'combatMove';
}

function finishRocketStrike(s: AxisState, c: ActiveCombat): void {
  const rocket = c.rocket;
  if (!rocket) throw new Error('Rocket strike is missing its report state.');
  const roll = rocket.roll ?? c.battle.rocketDamage ?? 0;
  const appliedDamage = rocket.appliedDamage ?? 0;
  const saturated = appliedDamage < roll ? ' (complex saturated)' : '';
  s.log.push({
    round: s.round,
    power: combatantController(c.attacker),
    space: c.space,
    text: `${combatantName(c.attacker)} completes the rocket strike from ${rocket.source}: die ${roll}, ${appliedDamage} damage${saturated}. Damage now ${s.factoryDamage[c.space] ?? rocket.damageBefore}/${rocket.cap}.`,
  });
  // The launcher never left its board stack. The live combat already showed
  // the full economic result, so do not replay an unrelated territory report.
  s.lastBattle = null;
  s.combat = null;
  s.phase = 'combatMove';
}

function battleOutcomeText(s: AxisState, c: ActiveCombat): string {
  const name = c.space;
  switch (c.battle.status) {
    case 'attacker_captured': return `${combatantName(c.attacker)} takes ${name}.`;
    case 'attacker_cleared': return `${combatantName(c.attacker)} clears ${name} but cannot hold it.`;
    case 'defender_won': return `The attack on ${name} is repelled.`;
    case 'retreated': return typeof c.retreatTo === 'string'
      ? `${combatantName(c.attacker)} retreats from ${name} to ${c.retreatTo}.`
      : `${combatantName(c.attacker)} aircraft disengage over ${name}.`;
    case 'mutual': return `Mutual destruction at ${name}.`;
    case 'standoff': return `Standoff at ${name}.`;
    default: return `Battle at ${name} ends.`;
  }
}

/**
 * Restoring a capital also restores every originally owned territory that is
 * currently held by a friendly power. Industrial complexes follow control;
 * AA guns are the rulebook exception and transfer only in the capital itself.
 * Ordinary units never change nationality.
 */
function liberateCapital(s: AxisState, power: PowerKey, liberatedBy: PowerKey): void {
  const capital = POWERS[power].capital;
  s.powers[power].capitalHeldBy = null;

  for (const [territory, originalOwner] of Object.entries(s.originalOwner)) {
    if (originalOwner !== power) continue;
    const holder = s.control[territory];
    if (holder == null || !sameSide(holder, power)) continue;

    const changedControl = holder !== power;
    s.control[territory] = power;
    for (const stack of stacksAt(s, territory)) {
      if (stack.key === 'factory' || (territory === capital && stack.key === 'aaGun')) {
        stack.power = power;
      }
    }

    if (changedControl) {
      s.log.push({
        round: s.round,
        power,
        space: territory,
        text: territory === 'kwangtung' && power === 'uk'
          ? 'Kwangtung returns to United Kingdom control after London is liberated.'
          : `${territory} returns to ${POWERS[power].name} control after its capital is liberated.`,
      });
    }
  }

  s.log.push({ round: s.round, power: liberatedBy, text: `${POWERS[power].name}'s capital is liberated.` });
}

function captureTerritory(s: AxisState, territory: string, by: AxisCombatant): void {
  const orig = s.originalOwner[territory] ?? null;

  if (by === 'china') {
    const controller = controllerAfterChineseCapture(territory, s.powers.uk.capitalHeldBy == null);
    s.control[territory] = controller;
    s.log.push({
      round: s.round,
      power: 'usa',
      space: territory,
      text: controller === 'uk'
        ? `China occupies ${territory}; control and income return to the United Kingdom.`
        : `China takes control of ${territory}.`,
    });
    return;
  }

  // liberation: a territory originally owned by a FRIENDLY power (or China,
  // for the Allies) reverts to its original owner — unless that owner's
  // capital is in enemy hands, in which case the capturer keeps it for now
  if (orig && orig !== by && sameSide(orig, by)) {
    const origHeld = orig !== 'china' && s.powers[orig as PowerKey].capitalHeldBy != null;
    const liberatesCapital = orig !== 'china' && POWERS[orig as PowerKey].capital === territory;
    if (!origHeld || liberatesCapital) {
      s.control[territory] = orig;
      const name = orig === 'china' ? 'China' : POWERS[orig as PowerKey].name;
      s.log.push({ round: s.round, power: by, space: territory, text: `${POWERS[by].name} liberates ${territory} for ${name}.` });
      // liberating a capital brings its owner back into the game
      if (orig !== 'china' && POWERS[orig as PowerKey].capital === territory) {
        liberateCapital(s, orig as PowerKey, by);
      }
      return;
    }
  }

  s.control[territory] = by;
  // recapturing your OWN capital frees your economy again
  if (POWERS[by].capital === territory) {
    liberateCapital(s, by, by);
  }
  // Capital capture: loot only unspent IPCs. Purchased units awaiting
  // mobilization and standing researchers are lost immediately; developed
  // technologies, board units, and China's separate forces are untouched.
  for (const pk of Object.keys(POWERS) as PowerKey[]) {
    if (POWERS[pk].capital === territory && !sameSide(pk, by)) {
      const victim = s.powers[pk];
      const looted = victim.ipcs;
      const stagedLost = Object.values(victim.staging)
        .reduce((total, count) => total + (count ?? 0), 0);
      const researchersLost = victim.researchTokens;
      victim.ipcs = 0;
      victim.staging = {};
      victim.purchasedThisTurn = {};
      victim.researchTokens = 0;
      victim.factoriesUsed = {};
      s.powers[by].ipcs += looted;
      victim.capitalHeldBy = by;
      s.log.push({ round: s.round, power: by, text: `${POWERS[by].name} captures ${POWERS[pk].name}'s capital and loots ${looted} IPCs.` });
      if (stagedLost > 0 || researchersLost > 0) {
        const losses = [
          ...(stagedLost > 0 ? [`${stagedLost} unmobilized unit${stagedLost === 1 ? '' : 's'}`] : []),
          ...(researchersLost > 0 ? [`${researchersLost} researcher${researchersLost === 1 ? '' : 's'}`] : []),
        ];
        s.log.push({
          round: s.round,
          power: pk,
          text: `${POWERS[pk].name} loses ${losses.join(' and ')} when its capital falls.`,
        });
      }
    }
  }
}

// ---------- noncombat movement (also transport load/offload) ----------

interface PlannedMoveSlice {
  source: UnitStack;
  count: number;
  damaged?: number;
  cargo?: NonNullable<UnitStack['cargo']>;
  movementSpent?: number;
  offloadedTo?: string;
  combatLoadedCargo?: NonNullable<UnitStack['combatLoadedCargo']>;
  loadedThisTurnCargo?: NonNullable<UnitStack['loadedThisTurnCargo']>;
  offloadBlocked?: boolean;
  /** Existing or newly drafted promise; valid only on a count-one fighter. */
  carrierLanding?: AxisCarrierLandingTag;
  carrierRef?: string;
  /** Exact available ordinal retained only while validating an action. */
  selectedOrdinal?: number;
}

interface AttackSelectionSpaceSnapshot {
  /** Original stacks retained solely to resolve validated stack indexes. */
  live: readonly UnitStack[];
  /** Deep-enough immutable command snapshot used by every exact pick. */
  frozen: readonly UnitStack[];
}

type AttackSelectionSnapshot = ReadonlyMap<string, AttackSelectionSpaceSnapshot>;

interface PlannedParatrooperPair {
  from: string;
  route: readonly string[];
  pairId: string;
  bomber: PlannedMoveSlice;
  infantry: PlannedMoveSlice;
  bomberMovementSpent: number;
}

function cloneSelectionStack(stack: UnitStack): UnitStack {
  return {
    ...stack,
    ...(stack.cargo ? { cargo: stack.cargo.map((item) => ({ ...item })) } : {}),
    ...(stack.combatLoadedCargo
      ? { combatLoadedCargo: stack.combatLoadedCargo.map((item) => ({ ...item })) }
      : {}),
    ...(stack.loadedThisTurnCargo
      ? { loadedThisTurnCargo: stack.loadedThisTurnCargo.map((item) => ({ ...item })) }
      : {}),
    ...(stack.carrierLanding ? { carrierLanding: { ...stack.carrierLanding } } : {}),
  };
}

function createAttackSelectionSnapshot(
  s: AxisState,
  origins: readonly string[],
): AttackSelectionSnapshot {
  const result = new Map<string, AttackSelectionSpaceSnapshot>();
  for (const origin of new Set(origins)) {
    const live = stacksAt(s, origin);
    result.set(origin, {
      live,
      frozen: live.map(cloneSelectionStack),
    });
  }
  return result;
}

function validateOrdinaryAttackSelections(
  snapshot: AttackSelectionSnapshot,
  power: AxisCombatant,
  forces: readonly { from: string; units: readonly AxisUnitPick[] }[],
): string | null {
  for (const force of forces) {
    const space = snapshot.get(force.from);
    if (!space) return `The force origin ${force.from} changed. Select it again.`;
    for (const unit of force.units) {
      if (!unit.ordinals) continue;
      const stale = `Those exact ${UNITS[unit.key].name} pieces changed. Select them again.`;
      if (unit.selectionSig !== axisPieceSelectionSignature(space.frozen, power, unit.key)) return stale;
      const available = new Set(availableAxisPhysicalPieces(space.frozen, power, unit.key)
        .map((piece) => piece.ordinal));
      if (unit.ordinals.length !== unit.count
        || unit.ordinals.some((ordinal) => !available.has(ordinal))) return stale;
    }
  }
  return null;
}

function exactParatrooperSlice(
  snapshot: AttackSelectionSnapshot,
  from: string,
  power: AxisCombatant,
  key: Extract<UnitKey, 'bomber' | 'infantry'>,
  ref: AxisParatrooperPieceRef,
): { slice?: PlannedMoveSlice; error?: string } {
  const space = snapshot.get(from);
  const stale = `That exact ${UNITS[key].name} changed. Select it again.`;
  if (!space || ref.selectionSig !== axisPieceSelectionSignature(space.frozen, power, key)) {
    return { error: stale };
  }
  const piece = availableAxisPhysicalPieces(space.frozen, power, key)
    .find((candidate) => candidate.ordinal === ref.ordinal);
  const source = piece ? space.live[piece.stackIndex] : undefined;
  if (!piece || !source || source.power !== power || source.key !== key
    || source.cargo?.length) return { error: stale };
  return {
    slice: {
      source,
      count: 1,
      selectedOrdinal: ref.ordinal,
      ...(source.movementSpent != null ? { movementSpent: source.movementSpent } : {}),
    },
  };
}

function planParatrooperPairs(args: {
  s: AxisState;
  idx: MapIndex;
  power: AxisCombatant;
  target: string;
  groups: readonly AxisParatrooperGroupOrder[];
  snapshot: AttackSelectionSnapshot;
}): { pairs: PlannedParatrooperPair[]; error?: string } {
  const { s, idx, power, target, groups, snapshot } = args;
  if (power === 'china') return { pairs: [], error: 'China cannot use national technology advances.' };
  if (!techsOf(s, power).includes('paratroopers')) {
    return { pairs: [], error: `${POWERS[power].name} has not developed Paratroopers.` };
  }
  if (isSeaZoneId(target) || !idx.territory[target]) {
    return { pairs: [], error: 'Paratroopers must deploy into a hostile land territory.' };
  }
  const pairs: PlannedParatrooperPair[] = [];
  let pairSequence = 1;
  for (const group of groups) {
    for (const pair of group.pairs) {
      const bomber = exactParatrooperSlice(snapshot, group.from, power, 'bomber', pair.bomber);
      if (!bomber.slice) return { pairs: [], error: bomber.error ?? 'The exact bomber changed.' };
      const infantry = exactParatrooperSlice(snapshot, group.from, power, 'infantry', pair.infantry);
      if (!infantry.slice) return { pairs: [], error: infantry.error ?? 'The exact infantry changed.' };
      const priorMovement = Math.max(0, bomber.slice.movementSpent ?? 0);
      const validation = validateAxisParatrooperRoute({
        snapshot: s,
        idx,
        power,
        route: group.route,
        maxMovement: Math.max(0, airUnitRange('bomber', techsOf(s, power)) - priorMovement),
      });
      if (!validation.ok) {
        const reason = validation.reason === 'hostile-territory-entered-before-target'
          ? `The bomber must stop in ${validation.firstHostile}; it was hostile when Combat Move began.`
          : validation.reason === 'target-not-hostile-at-turn-start'
            ? 'The Paratroopers target was not hostile when Combat Move began.'
            : validation.reason === 'movement-exceeded'
              ? 'That Paratroopers route exceeds the exact bomber\'s remaining range.'
              : 'That explicit Paratroopers route is not legal.';
        return { pairs: [], error: reason };
      }
      pairs.push({
        from: group.from,
        route: [...group.route],
        pairId: `paratrooper:${s.combatSeq}:${pairSequence++}`,
        bomber: bomber.slice,
        infantry: infantry.slice,
        bomberMovementSpent: priorMovement + validation.movementSpent,
      });
    }
  }
  return { pairs };
}

function cargoSize(st: UnitStack): number {
  return (st.cargo ?? []).reduce((n, c) => n + c.count, 0);
}

function nonInfantryCargoSize(st: UnitStack): number {
  return (st.cargo ?? []).reduce((n, c) => n + (c.key === 'infantry' ? 0 : c.count), 0);
}

function addCargoUnit(st: UnitStack, cargo: NonNullable<UnitStack['cargo']>[number]): void {
  st.cargo ??= [];
  const existing = st.cargo.find((c) => c.power === cargo.power && c.key === cargo.key);
  if (existing) existing.count += 1;
  else st.cargo.push({ ...cargo, count: 1 });
}

/** Pack cargo onto physical transports. Prefer an empty ship before using a
 * second infantry slot so equal cargo is independently movable when possible. */
function packTransportCargo(
  transports: UnitStack[],
  cargo: NonNullable<UnitStack['cargo']>,
): boolean {
  const units = cargo.flatMap((c) => Array.from({ length: c.count }, () => ({ ...c, count: 1 })));
  units.sort((a, b) => Number(a.key === 'infantry') - Number(b.key === 'infantry'));
  for (const unit of units) {
    const eligible = transports
      .map((st, index) => ({ st, index }))
      .filter(({ st }) => cargoSize(st) < 2 && (unit.key === 'infantry' || nonInfantryCargoSize(st) === 0))
      .sort((a, b) => cargoSize(a.st) - cargoSize(b.st) || a.index - b.index);
    const target = eligible[0]?.st;
    if (!target) return false;
    addCargoUnit(target, unit);
  }
  return true;
}

/** Convert an aggregate transport counter into physical one-ship stacks while
 * retaining cargo, movement state, and capacity. This also upgrades rooms
 * saved by versions that attached cargo to a multi-count transport stack. */
function expandTransportStack(st: UnitStack): UnitStack[] | null {
  if (st.key !== 'transport' || st.count <= 1) {
    return [{
      ...st,
      ...(st.cargo ? { cargo: st.cargo.map((c) => ({ ...c })) } : {}),
    }];
  }
  const moved = Math.min(st.count, Math.max(0, st.moved ?? 0));
  const physical: UnitStack[] = Array.from({ length: st.count }, (_, i) => ({
    power: st.power,
    key: 'transport',
    count: 1,
    ...(i < moved ? { moved: 1 } : {}),
    ...(st.movementSpent != null ? { movementSpent: st.movementSpent } : {}),
    ...(st.offloadedTo ? { offloadedTo: st.offloadedTo } : {}),
    ...(st.combatLoadedCargo?.length
      ? { combatLoadedCargo: st.combatLoadedCargo.map((cargo) => ({ ...cargo })) }
      : {}),
    ...(st.loadedThisTurnCargo?.length
      ? { loadedThisTurnCargo: st.loadedThisTurnCargo.map((cargo) => ({ ...cargo })) }
      : {}),
    ...(st.offloadBlocked ? { offloadBlocked: true } : {}),
  }));
  if (!packTransportCargo(physical, st.cargo ?? [])) return null;
  return physical;
}

function physicalTransportDrafts(tps: UnitStack[]): { stacks: UnitStack[]; error?: string } {
  const stacks: UnitStack[] = [];
  for (const st of tps) {
    const expanded = expandTransportStack(st);
    if (!expanded) return { stacks: [], error: 'Existing transport cargo exceeds physical capacity.' };
    stacks.push(...expanded);
  }
  return { stacks };
}

function replaceTransportStacks(
  s: AxisState,
  space: string,
  originals: UnitStack[],
  replacements: UnitStack[],
): void {
  const replacing = new Set(originals);
  const next: UnitStack[] = [];
  let inserted = false;
  for (const st of stacksAt(s, space)) {
    if (!replacing.has(st)) {
      next.push(st);
      continue;
    }
    if (!inserted) {
      next.push(...replacements);
      inserted = true;
    }
  }
  s.board[space] = next;
}

function splitLoadedTransportAggregates(s: AxisState, space: string, power: AxisCombatant): string | null {
  const originals = stacksAt(s, space).filter((st) => st.power === power && st.key === 'transport' && st.count > 1 && st.cargo?.length);
  if (!originals.length) return null;
  const draft = physicalTransportDrafts(originals);
  if (draft.error) return draft.error;
  replaceTransportStacks(s, space, originals, draft.stacks);
  return null;
}

interface TransportHullPlan {
  sourceSpace: string;
  order: AxisTransportCargoOrder;
  source: UnitStack;
  draft: UnitStack;
}

/** Resolve exact transport references against one immutable board snapshot. */
function planExactTransportHulls(
  s: AxisState,
  requests: { sourceSpace: string; order: AxisTransportCargoOrder }[],
): { hulls: TransportHullPlan[]; error?: string } {
  const hulls: TransportHullPlan[] = [];
  const seen = new Set<UnitStack>();
  for (const request of requests) {
    const { sourceSpace, order } = request;
    const stacks = stacksAt(s, sourceSpace);
    const stale = `That exact ${POWERS[order.owner].name} transport changed. Select it again.`;
    if (axisPieceSelectionSignature(stacks, order.owner, 'transport') !== order.selectionSig) {
      return { hulls: [], error: stale };
    }
    const piece = enumerateAxisPhysicalPieces(stacks).find((candidate) =>
      candidate.power === order.owner
      && candidate.key === 'transport'
      && candidate.physicalOrdinal === order.physicalOrdinal);
    const source = piece ? stacks[piece.stackIndex] : undefined;
    if (!piece || !source || source.key !== 'transport' || source.power !== order.owner || source.count !== 1) {
      return { hulls: [], error: stale };
    }
    if (seen.has(source)) return { hulls: [], error: 'List each physical transport only once.' };
    seen.add(source);
    hulls.push({
      sourceSpace,
      order,
      source,
      draft: {
        ...source,
        ...(source.cargo?.length ? { cargo: source.cargo.map((cargo) => ({ ...cargo })) } : {}),
        ...(source.combatLoadedCargo?.length
          ? { combatLoadedCargo: source.combatLoadedCargo.map((cargo) => ({ ...cargo })) }
          : {}),
        ...(source.loadedThisTurnCargo?.length
          ? { loadedThisTurnCargo: source.loadedThisTurnCargo.map((cargo) => ({ ...cargo })) }
          : {}),
      },
    });
  }
  return { hulls };
}

function validTransportCapacity(hull: UnitStack): boolean {
  return cargoSize(hull) <= 2 && nonInfantryCargoSize(hull) <= 1;
}

function addExactCargo(
  hull: UnitStack,
  power: AxisCombatant,
  units: readonly { key: UnitKey; count: number }[],
): boolean {
  hull.cargo ??= [];
  for (const unit of units) {
    const existing = hull.cargo.find((cargo) => cargo.power === power && cargo.key === unit.key);
    if (existing) existing.count += unit.count;
    else hull.cargo.push({ power, key: unit.key, count: unit.count });
  }
  return validTransportCapacity(hull);
}

function removeExactCargo(
  hull: UnitStack,
  power: AxisCombatant,
  units: readonly { key: UnitKey; count: number }[],
): boolean {
  const cargo = (hull.cargo ?? []).map((item) => ({ ...item }));
  for (const unit of units) {
    const existing = cargo.find((item) => item.power === power && item.key === unit.key);
    if (!existing || existing.count < unit.count) return false;
    existing.count -= unit.count;
  }
  const remaining = cargo.filter((item) => item.count > 0);
  if (remaining.length) hull.cargo = remaining;
  else delete hull.cargo;
  return true;
}

function addCombatLoadedCargo(
  hull: UnitStack,
  power: AxisCombatant,
  units: readonly { key: UnitKey; count: number }[],
): void {
  hull.combatLoadedCargo ??= [];
  for (const unit of units) {
    const existing = hull.combatLoadedCargo.find((item) => item.power === power && item.key === unit.key);
    if (existing) existing.count += unit.count;
    else hull.combatLoadedCargo.push({ power, key: unit.key, count: unit.count });
  }
}

function addLoadedThisTurnCargo(
  hull: UnitStack,
  power: AxisCombatant,
  units: readonly { key: UnitKey; count: number }[],
): void {
  hull.loadedThisTurnCargo ??= [];
  for (const unit of units) {
    const existing = hull.loadedThisTurnCargo.find((item) => item.power === power && item.key === unit.key);
    if (existing) existing.count += unit.count;
    else hull.loadedThisTurnCargo.push({ power, key: unit.key, count: unit.count });
  }
}

function alliedOffloadUsesNewCargo(
  hull: UnitStack,
  power: AxisCombatant,
  units: readonly { key: UnitKey; count: number }[],
): boolean {
  const loaded = cargoCounts((hull.loadedThisTurnCargo ?? []).filter((item) => item.power === power));
  const aboard = cargoCounts((hull.cargo ?? []).filter((item) => item.power === power));
  return units.some((unit) => unit.count > Math.max(0, (aboard.get(unit.key) ?? 0) - (loaded.get(unit.key) ?? 0)));
}

function coversCombatLoadedCargo(
  hull: UnitStack,
  power: AxisCombatant,
  units: readonly { key: UnitKey; count: number }[],
): boolean {
  const selected = cargoCounts(units);
  return (hull.combatLoadedCargo ?? [])
    .filter((item) => item.power === power && item.count > 0)
    .every((item) => (selected.get(item.key) ?? 0) >= item.count);
}

function hasCombatLoadCommitment(s: AxisState, power: AxisCombatant): boolean {
  return Object.values(s.board).some((stacks) => stacks.some((stack) =>
    stack.key === 'transport'
    && (stack.combatLoadedCargo ?? []).some((cargo) => cargo.power === power && cargo.count > 0)));
}

function cargoCounts(units: readonly { key: UnitKey; count: number }[]): Map<UnitKey, number> {
  const counts = new Map<UnitKey, number>();
  for (const unit of units) counts.set(unit.key, (counts.get(unit.key) ?? 0) + unit.count);
  return counts;
}

function sameCargoCounts(
  left: readonly { key: UnitKey; count: number }[],
  right: readonly { key: UnitKey; count: number }[],
): boolean {
  const a = cargoCounts(left);
  const b = cargoCounts(right);
  if (a.size !== b.size) return false;
  return [...a].every(([key, count]) => b.get(key) === count);
}

function commitTransportDrafts(hulls: readonly TransportHullPlan[]): void {
  for (const hull of hulls) {
    const cargo = hull.draft.cargo?.filter((item) => item.count > 0).map((item) => ({ ...item }));
    if (cargo?.length) hull.source.cargo = cargo;
    else delete hull.source.cargo;
    if (hull.draft.moved) hull.source.moved = 1;
    else delete hull.source.moved;
    if (hull.draft.offloadedTo) hull.source.offloadedTo = hull.draft.offloadedTo;
    else delete hull.source.offloadedTo;
    if (hull.draft.combatLoadedCargo?.length) {
      hull.source.combatLoadedCargo = hull.draft.combatLoadedCargo.map((item) => ({ ...item }));
    } else delete hull.source.combatLoadedCargo;
    if (hull.draft.loadedThisTurnCargo?.length) {
      hull.source.loadedThisTurnCargo = hull.draft.loadedThisTurnCargo.map((item) => ({ ...item }));
    } else delete hull.source.loadedThisTurnCargo;
    if (hull.draft.offloadBlocked) hull.source.offloadBlocked = true;
    else delete hull.source.offloadBlocked;
  }
}

interface ExactAmphibiousHullPlan {
  hull: TransportHullPlan;
  order: AxisTransportRouteOrder;
}

interface ExactAmphibiousPlan {
  finalZone: string;
  hulls: ExactAmphibiousHullPlan[];
  unloaded: { key: UnitKey; count: number }[];
}

function planExactAmphibious(
  s: AxisState,
  idx: MapIndex,
  power: AxisCombatant,
  target: string,
  amphibious: AxisAmphibiousOrder,
): { plan: ExactAmphibiousPlan | null; error?: string } {
  if (power === 'china') return { plan: null, error: 'Chinese forces cannot use transports.' };
  const finalZone = idx.seaZone[amphibious.zone];
  if (!finalZone) return { plan: null, error: 'Unknown amphibious offload zone.' };
  if (!(finalZone.coastTo ?? []).includes(target)) {
    return { plan: null, error: 'The final sea zone does not border the target territory.' };
  }
  if (seaZoneHostile(s, amphibious.zone, power)) {
    return { plan: null, error: 'Clear the final sea zone before offloading (attack it first).' };
  }

  const resolved = planExactTransportHulls(s, amphibious.hulls.map((order) => ({
    sourceSpace: order.from,
    order,
  })));
  if (resolved.error) return { plan: null, error: resolved.error };

  const hulls: ExactAmphibiousHullPlan[] = [];
  const unloaded = new Map<UnitKey, number>();
  for (let index = 0; index < amphibious.hulls.length; index++) {
    const order = amphibious.hulls[index];
    const hull = resolved.hulls[index];
    if (!sameSide(order.owner, power)) {
      return { plan: null, error: 'Cargo may offload only from a friendly transport.' };
    }
    if (!validTransportCapacity(hull.source)) {
      return { plan: null, error: 'Existing transport cargo exceeds physical capacity.' };
    }
    if (hull.source.offloadedTo) return { plan: null, error: 'That transport already unloaded this turn.' };
    if (hull.source.offloadBlocked) {
      return { plan: null, error: 'A transport that retreated from sea combat cannot offload this turn.' };
    }
    if (order.owner !== power && alliedOffloadUsesNewCargo(hull.source, power, order.units)) {
      return { plan: null, error: 'Cargo loaded onto an allied transport this turn must wait for a later turn to offload.' };
    }
    if (!coversCombatLoadedCargo(hull.source, power, order.units)) {
      return { plan: null, error: 'Every unit loaded during Combat Move must join this amphibious assault.' };
    }
    if (order.units.some((unit) => UNITS[unit.key].domain !== 'land')) {
      return { plan: null, error: 'Transports can offload land units only.' };
    }

    let distance = 0;
    if (order.from === amphibious.zone) {
      if (order.via !== undefined) {
        return { plan: null, error: 'A transport already in the offload zone does not need a route.' };
      }
    } else if (order.via === undefined) {
      if (!neighborsFor(s, idx, order.from, 'sea', power).includes(amphibious.zone)) {
        return { plan: null, error: 'That transport cannot reach the offload zone in one sea move.' };
      }
      distance = 1;
    } else {
      if (order.via === order.from || order.via === amphibious.zone
        || !neighborsFor(s, idx, order.from, 'sea', power).includes(order.via)
        || !neighborsFor(s, idx, order.via, 'sea', power).includes(amphibious.zone)) {
        return { plan: null, error: 'That transport route is not a legal two-zone sea move.' };
      }
      if (seaZoneHostile(s, order.via, power)) {
        return { plan: null, error: 'Transports cannot pass through a surface-hostile sea zone.' };
      }
      distance = 2;
    }
    if (distance > 0) {
      if (order.owner !== power) {
        return { plan: null, error: 'Only the transport owner may move that hull.' };
      }
      if ((hull.source.moved ?? 0) > 0) {
        return { plan: null, error: 'That transport has already moved this turn.' };
      }
    }
    if (!removeExactCargo(hull.draft, power, order.units)) {
      return { plan: null, error: `That exact transport does not hold the requested ${combatantName(power)} cargo.` };
    }
    hull.draft.moved = 1;
    hull.draft.offloadedTo = target;
    const otherCommitments = (hull.draft.combatLoadedCargo ?? [])
      .filter((cargo) => cargo.power !== power && cargo.count > 0);
    if (otherCommitments.length) hull.draft.combatLoadedCargo = otherCommitments;
    else delete hull.draft.combatLoadedCargo;
    for (const unit of order.units) unloaded.set(unit.key, (unloaded.get(unit.key) ?? 0) + unit.count);
    hulls.push({ hull, order });
  }

  return {
    plan: {
      finalZone: amphibious.zone,
      hulls,
      unloaded: [...unloaded].map(([key, count]) => ({ key, count })),
    },
  };
}

function commitExactAmphibious(s: AxisState, plan: ExactAmphibiousPlan): void {
  for (const item of plan.hulls) {
    const { hull } = item;
    if (hull.sourceSpace === plan.finalZone) {
      commitTransportDrafts([hull]);
      continue;
    }
    s.board[hull.sourceSpace] = stacksAt(s, hull.sourceSpace).filter((stack) => stack !== hull.source);
    (s.board[plan.finalZone] ??= []).push({
      ...hull.draft,
      count: 1,
      ...(hull.draft.cargo?.length ? { cargo: hull.draft.cargo.map((cargo) => ({ ...cargo })) } : {}),
    });
  }
}

function planUnmovedSlices(
  s: AxisState,
  space: string,
  power: AxisCombatant,
  units: AxisUnitPick[],
): { slices: PlannedMoveSlice[]; error?: string } {
  const slices: PlannedMoveSlice[] = [];
  for (const unit of units) {
    if (unit.ordinals) {
      const stacks = stacksAt(s, space);
      const stale = () => ({
        slices: [] as PlannedMoveSlice[],
        error: `Those exact ${UNITS[unit.key].name} pieces changed. Select them again.`,
      });
      if (unit.selectionSig !== axisPieceSelectionSignature(stacks, power, unit.key)) return stale();
      const byOrdinal = new Map(availableAxisPhysicalPieces(stacks, power, unit.key)
        .map((piece) => [piece.ordinal, piece] as const));
      const selected = [...unit.ordinals]
        .sort((a, b) => a - b)
        .map((ordinal) => byOrdinal.get(ordinal));
      if (selected.length !== unit.count || selected.some((piece) => !piece)) return stale();

      const grouped = new Map<UnitStack, PlannedMoveSlice>();
      for (const piece of selected) {
        if (!piece) return stale();
        const source = stacks[piece.stackIndex];
        if (!source || source.power !== power || source.key !== unit.key) return stale();
        // Aggregate cargo has no durable per-hull manifest. Normalized rooms
        // never contain it; reject a stale legacy view instead of guessing.
        if (source.cargo?.length && source.count !== 1) return stale();
        if (unit.key === 'fighter') {
          slices.push({
            source,
            count: 1,
            selectedOrdinal: piece.ordinal!,
            ...(source.movementSpent != null ? { movementSpent: source.movementSpent } : {}),
            ...(source.carrierLanding ? { carrierLanding: { ...source.carrierLanding } } : {}),
          });
          continue;
        }
        const slice = grouped.get(source) ?? {
          source,
          count: 0,
          ...(source.cargo?.length ? { cargo: source.cargo.map((cargo) => ({ ...cargo })) } : {}),
          ...(source.movementSpent != null ? { movementSpent: source.movementSpent } : {}),
          ...(source.offloadedTo ? { offloadedTo: source.offloadedTo } : {}),
          ...(source.combatLoadedCargo?.length
            ? { combatLoadedCargo: source.combatLoadedCargo.map((cargo) => ({ ...cargo })) }
            : {}),
          ...(source.loadedThisTurnCargo?.length
            ? { loadedThisTurnCargo: source.loadedThisTurnCargo.map((cargo) => ({ ...cargo })) }
            : {}),
          ...(source.offloadBlocked ? { offloadBlocked: true } : {}),
          ...(source.carrierRef ? { carrierRef: source.carrierRef } : {}),
        };
        slice.count += 1;
        if (piece.damaged) slice.damaged = (slice.damaged ?? 0) + 1;
        grouped.set(source, slice);
      }
      slices.push(...grouped.values());
      continue;
    }

    let left = unit.count;
    // Prefer loose units. Loaded carrier/transport stacks can be preserved
    // safely only when the whole aggregate stack travels together.
    const candidates = stacksAt(s, space)
      .filter((st) => st.power === power && st.key === unit.key && st.count - (st.moved ?? 0) > 0)
      .sort((a, b) => Number(Boolean(a.cargo?.length)) - Number(Boolean(b.cargo?.length)));
    for (const st of candidates) {
      if (left === 0) break;
      const available = st.count - (st.moved ?? 0);
      if (st.cargo?.length) {
        if ((st.moved ?? 0) > 0 || available !== st.count || left < st.count) continue;
        slices.push({
          source: st,
          count: st.count,
          cargo: st.cargo.map((c) => ({ ...c })),
          ...(st.movementSpent != null ? { movementSpent: st.movementSpent } : {}),
          ...(st.offloadedTo ? { offloadedTo: st.offloadedTo } : {}),
          ...(st.combatLoadedCargo?.length
            ? { combatLoadedCargo: st.combatLoadedCargo.map((cargo) => ({ ...cargo })) }
            : {}),
          ...(st.loadedThisTurnCargo?.length
            ? { loadedThisTurnCargo: st.loadedThisTurnCargo.map((cargo) => ({ ...cargo })) }
            : {}),
          ...(st.offloadBlocked ? { offloadBlocked: true } : {}),
          ...(st.carrierRef ? { carrierRef: st.carrierRef } : {}),
        });
        left -= st.count;
      } else {
        const take = Math.min(available, left);
        const healthy = Math.max(0, st.count - (st.damaged ?? 0));
        const spentHealthy = Math.min(st.moved ?? 0, healthy);
        const availableHealthy = Math.max(0, healthy - spentHealthy);
        const damaged = Math.max(0, take - availableHealthy);
        slices.push({
          source: st,
          count: take,
          ...(damaged > 0 ? { damaged } : {}),
          ...(st.movementSpent != null ? { movementSpent: st.movementSpent } : {}),
          ...(st.offloadedTo ? { offloadedTo: st.offloadedTo } : {}),
          ...(st.combatLoadedCargo?.length
            ? { combatLoadedCargo: st.combatLoadedCargo.map((cargo) => ({ ...cargo })) }
            : {}),
          ...(st.loadedThisTurnCargo?.length
            ? { loadedThisTurnCargo: st.loadedThisTurnCargo.map((cargo) => ({ ...cargo })) }
            : {}),
          ...(st.offloadBlocked ? { offloadBlocked: true } : {}),
          ...(st.carrierLanding ? { carrierLanding: { ...st.carrierLanding } } : {}),
          ...(st.carrierRef ? { carrierRef: st.carrierRef } : {}),
        });
        left -= take;
      }
    }
    if (left > 0) {
      const loaded = candidates.some((st) => st.cargo?.length);
      return {
        slices: [],
        error: loaded
          ? `Move the entire loaded ${UNITS[unit.key].name} stack together.`
          : `Not enough unmoved ${UNITS[unit.key].name} in ${space}.`,
      };
    }
  }
  return { slices };
}

function removePlannedSlices(s: AxisState, space: string, slices: PlannedMoveSlice[]): void {
  for (const slice of slices) {
    slice.source.count -= slice.count;
    if (slice.damaged) {
      slice.source.damaged = Math.max(0, (slice.source.damaged ?? 0) - slice.damaged);
      if (slice.source.damaged === 0) delete slice.source.damaged;
    }
  }
  s.board[space] = stacksAt(s, space).filter((st) => st.count > 0);
}

function addMovedSlices(s: AxisState, space: string, power: AxisCombatant, slices: PlannedMoveSlice[]): void {
  const dest = (s.board[space] ??= []);
  for (const slice of slices) {
    const key = slice.source.key;
    if (slice.carrierLanding && key === 'fighter') {
      dest.push({
        power,
        key,
        count: 1,
        moved: 1,
        ...(slice.movementSpent != null ? { movementSpent: slice.movementSpent } : {}),
        carrierLanding: { ...slice.carrierLanding },
      });
      continue;
    }
    if (key === 'carrier') {
      if (slice.count !== 1) throw new Error('A moved carrier must remain one exact hull.');
      const carrierRef = slice.carrierRef ?? allocateAxisCarrierHullRef(s);
      dest.push({
        power,
        key,
        count: 1,
        moved: 1,
        carrierRef,
        ...(slice.cargo?.length ? { cargo: slice.cargo.map((item) => ({ ...item })) } : {}),
        ...(slice.movementSpent != null ? { movementSpent: slice.movementSpent } : {}),
      });
      continue;
    }
    if (key === 'transport' || slice.cargo?.length) {
      for (let physical = 0; physical < slice.count; physical++) {
        dest.push({
          power, key, count: 1, moved: 1,
          ...(slice.cargo?.length ? { cargo: slice.cargo.map((c) => ({ ...c })) } : {}),
          ...(slice.movementSpent != null ? { movementSpent: slice.movementSpent } : {}),
          ...(slice.offloadedTo ? { offloadedTo: slice.offloadedTo } : {}),
          ...(slice.combatLoadedCargo?.length
            ? { combatLoadedCargo: slice.combatLoadedCargo.map((cargo) => ({ ...cargo })) }
            : {}),
          ...(slice.loadedThisTurnCargo?.length
            ? { loadedThisTurnCargo: slice.loadedThisTurnCargo.map((cargo) => ({ ...cargo })) }
            : {}),
          ...(slice.offloadBlocked ? { offloadBlocked: true } : {}),
        });
      }
      continue;
    }
    const existing = dest.find((st) => st.power === power
      && st.key === key
      && !st.cargo?.length
      && !st.carrierLanding
      && !st.carrierRef
      && !st.carrierBaseRef
      && (st.moved ?? 0) === st.count
      && (st.movementSpent ?? 0) === (slice.movementSpent ?? 0));
    if (existing) {
      existing.count += slice.count;
      existing.moved = (existing.moved ?? 0) + slice.count;
      if (slice.damaged) existing.damaged = (existing.damaged ?? 0) + slice.damaged;
    } else {
      dest.push({
        power, key, count: slice.count, moved: slice.count,
        ...(slice.damaged ? { damaged: slice.damaged } : {}),
        ...(slice.movementSpent != null ? { movementSpent: slice.movementSpent } : {}),
      });
    }
  }
}

function actMove(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'move' }>): ActionResult {
  const combatMove = s.phase === 'combatMove';
  if (!combatMove && s.phase !== 'noncombat') return err('Not a movement phase.');
  const power = operatingPower(s);
  if (!power) return err('Choose the USA/China operation order first.');
  for (const u of a.units) {
    if (unmovedUnitCount(s, a.from, power, u.key) < u.count) return err(`Not enough unmoved ${UNITS[u.key].name} in ${a.from}.`);
  }

  const landForce = power === 'china'
    ? []
    : a.units.filter((unit) => UNITS[unit.key].domain === 'land');
  let blitzThrough: string | null = null;
  let sharedSeaEscape = false;

  if (combatMove) {
    if (power === 'china') {
      return err('Chinese friendly repositioning happens during Noncombat Move.');
    }
    const everyUnitIsLand = landForce.length === a.units.length;
    if (everyUnitIsLand) {
      const route = classifyAxisLandRoute({
        snapshot: s,
        idx,
        power,
        from: a.from,
        to: a.to,
        via: a.via,
        phase: 'combatMove',
      });
      const validation = validateAxisLandForceRoute(landForce, route, techsOf(s, power));
      if (!validation.ok) return err(landRouteError(validation));
      if (route !== 'tank-blitz' || !a.via) {
        return err('A friendly Combat Move order is legal only to finish a tank blitz through an empty hostile territory.');
      }
      const holder = s.control[a.to];
      if (holder == null || !sameSide(holder, power) || enemyUnitsAt(s, a.to, power).length > 0) {
        return err('A tank blitz reposition must end in a presently friendly, enemy-free territory.');
      }
      blitzThrough = a.via;
    } else {
      sharedSeaEscape = Boolean(idx.seaZone[a.from])
        && axisEnemySurfaceWarshipAt(s, a.from, power);
      if (!sharedSeaEscape) {
        return err('Combat Move repositioning is limited to a tank blitz or escaping a sea zone shared with enemy surface warships.');
      }
      if (a.to === a.from) return err('Choose a legal destination outside the shared hostile sea zone.');
      if (a.units.some((unit) => {
        const domain = UNITS[unit.key].domain;
        return domain !== 'sea' && domain !== 'air';
      })) {
        return err('Only active ships and loose aircraft may escape a shared hostile sea zone.');
      }
      if (a.newCarrierLandings) {
        return err('A Combat Move escape needs a presently legal landing; it cannot rely on a carrier purchased for later mobilization.');
      }
    }
  } else if (landForce.length > 0) {
    const route = classifyAxisLandRoute({
      snapshot: s,
      idx,
      power,
      from: a.from,
      to: a.to,
      via: a.via,
      phase: 'noncombat',
    });
    const validation = validateAxisLandForceRoute(landForce, route, techsOf(s, power));
    if (!validation.ok) return err(landRouteError(validation));
  }
  // Per-unit endpoint rules are layered on the shared route validation above.
  for (const u of a.units) {
    const prof = UNITS[u.key];
    const domain = prof.domain === 'structure' ? 'land' : prof.domain;
    if (prof.domain === 'structure') return err('Industrial complexes cannot move.');
    if (power === 'china') {
      const origin = idx.territory[a.from];
      const destination = idx.territory[a.to];
      if (!origin || !destination
        || !isChinaOperatingTerritory(origin)
        || !isChinaOperatingTerritory(destination)) {
        return err('Chinese forces remain inside China and Kwangtung.');
      }
      if (u.key !== 'infantry' && u.key !== 'fighter') {
        return err('China may operate only its infantry and Flying Tigers fighter.');
      }
      const holder = s.control[a.to];
      if (holder == null || !sameSide(holder, power) || enemyUnitsAt(s, a.to, power).length > 0) {
        return err('Chinese noncombat moves must end in a friendly territory.');
      }
      if (u.key === 'infantry' && (!origin.adj.includes(a.to) || a.via)) {
        return err('Chinese infantry move one territory.');
      }
      continue;
    }
    // Air uses full-range graph reachability and an atomic landing/capacity
    // check after the exact physical move slices are planned below.
    if (prof.domain === 'air') continue;
    if (domain === 'land') {
      if (combatMove) continue; // the complete tank-blitz force was validated above
      const t = idx.territory[a.to];
      if (!t) return err('Land units need a territory.');
      const holder = s.control[a.to];
      if (holder == null || !sameSide(holder, power)) return err('Noncombat moves must end in friendly territory.');
      if (enemyUnitsAt(s, a.to, power).length > 0) return err('Enemy units there — that is a combat move.');
      continue;
    }
    if (domain === 'sea') {
      if (!isSeaZoneId(a.to)) return err('Ships stay at sea.');
      const routeOk = a.via === undefined
        ? neighborsFor(s, idx, a.from, 'sea', power).includes(a.to)
        : prof.move >= 2
          && neighborsFor(s, idx, a.from, 'sea', power).includes(a.via)
          && neighborsFor(s, idx, a.via, 'sea', power).includes(a.to)
          && canAxisSeaUnitTransit(s, a.via, power, u.key as AxisSeaUnitKey);
      if (!routeOk) return err(`${UNITS[u.key].name} cannot reach ${a.to} by that sea route.`);
      if (!canAxisSeaUnitTransit(s, a.to, power, u.key as AxisSeaUnitKey)) {
        return err(u.key === 'submarine'
          ? 'An enemy destroyer blocks that submarine move.'
          : 'Hostile surface warships block that move.');
      }
    }
  }
  // Old saves may contain several loaded transports in one aggregate. Split
  // only after all movement validation succeeds, keeping rejected orders
  // atomic while allowing one physical transport to move independently.
  const originalOriginStacks = s.board[a.from];
  const restoreOrigin = () => {
    if (originalOriginStacks) s.board[a.from] = originalOriginStacks;
    else delete s.board[a.from];
  };
  const failAfterSplit = (message: string): ActionResult => {
    restoreOrigin();
    return err(message);
  };
  const hasExactSelection = a.units.some((unit) => unit.ordinals !== undefined);
  if (!hasExactSelection && a.units.some((u) => u.key === 'transport')) {
    const splitError = splitLoadedTransportAggregates(s, a.from, power);
    if (splitError) return err(splitError);
  }
  const plan = planUnmovedSlices(s, a.from, power, a.units);
  if (plan.error) return failAfterSplit(plan.error);
  if (plan.slices.some((slice) => slice.source.key === 'transport'
    && (slice.source.combatLoadedCargo?.length || slice.source.offloadedTo || slice.source.offloadBlocked))) {
    return failAfterSplit('That transport is committed or spent and cannot move again this turn.');
  }
  let carrierDraft: CarrierDeclarationDraft | undefined;
  if (a.newCarrierLandings) {
    const declaration = planNewCarrierDeclarations({
      s,
      idx,
      power,
      declarations: a.newCarrierLandings,
      plans: [{ space: a.from, slices: plan.slices }],
      move: { from: a.from, to: a.to },
    });
    if (!declaration.draft) {
      return failAfterSplit(declaration.error ?? 'The purchased-carrier landing declaration is invalid.');
    }
    carrierDraft = declaration.draft;
  }
  const air: AirUnitGroup[] = plan.slices
    .filter((slice) => slice.source.key === 'fighter' || slice.source.key === 'bomber')
    .map((slice) => ({
      from: a.from,
      key: slice.source.key as AirUnitKey,
      count: slice.count,
      ...(slice.movementSpent != null ? { movementSpent: slice.movementSpent } : {}),
      ...(slice.carrierLanding?.seaZone === a.to && isSeaZoneId(a.to)
        ? { futureCarrierZone: slice.carrierLanding.seaZone }
        : {}),
    }));
  if (air.length > 0) {
    const carrierMoves: CarrierMoveProjection[] = plan.slices
      .filter((slice) => slice.source.key === 'carrier')
      .map((slice) => ({
        from: a.from,
        to: a.to,
        count: slice.count,
        cargoFighters: (slice.cargo ?? [])
          .filter((cargo) => cargo.key === 'fighter' && sameSide(cargo.power, power))
          .reduce((total, cargo) => total + cargo.count, 0),
      }));
    if (power === 'china') {
      if (!isChinaFriendlyLandingTerritory(idx.territory[a.to], s.control, s.contested)) {
        return failAfterSplit('The Flying Tigers must land in a friendly in-region territory held before this turn.');
      }
    } else {
      const landing = validateAirNoncombatLanding({
        snapshot: s,
        idx,
        power,
        techs: techsOf(s, power),
        air,
        destination: a.to,
        carrierMoves,
      });
      if (!landing.ok) {
        return failAfterSplit(landing.error ?? 'The aircraft cannot legally land there.');
      }
    }
  }
  for (const slice of plan.slices) {
    if (slice.source.key !== 'fighter' && slice.source.key !== 'bomber') continue;
    const remaining = Math.max(0, (power === 'china'
      ? UNITS.fighter.move
      : airUnitRange(slice.source.key, techsOf(s, power))) - (slice.movementSpent ?? 0));
    const distance = power === 'china'
      ? chinaMoveDistance(idx.map.territories, a.from, a.to, remaining)
      : airDistance(idx, a.from, a.to, remaining);
    if (distance == null) return failAfterSplit(`${UNITS[slice.source.key].name} cannot reach ${a.to}.`);
    slice.movementSpent = (slice.movementSpent ?? 0) + distance;
  }
  if (carrierDraft) {
    s.newCarrierLandingObligations = carrierDraft.obligations;
    s.carrierLandingSeq = carrierDraft.nextSequence;
  }
  if (blitzThrough) {
    captureTerritory(s, blitzThrough, power);
    if (!s.contested.includes(blitzThrough)) s.contested.push(blitzThrough);
    s.log.push({
      round: s.round,
      power: combatantController(power),
      space: blitzThrough,
      text: `${combatantName(power)} blitzes through ${idx.territory[blitzThrough]?.name ?? blitzThrough}.`,
    });
  }
  removePlannedSlices(s, a.from, plan.slices);
  addMovedSlices(s, a.to, power, plan.slices);
  const what = a.units.map((u) => `${u.count} ${UNITS[u.key].name}${u.count === 1 ? '' : 's'}`).join(', ');
  const destination = idx.territory[a.to]?.name ?? (idx.seaZone[a.to] ? `sea zone ${idx.seaZone[a.to].n}` : a.to);
  const verb = sharedSeaEscape ? 'escapes with' : blitzThrough ? 'completes the blitz with' : 'moves';
  s.log.push({ round: s.round, power: combatantController(power), space: a.to, text: `${combatantName(power)} ${verb} ${what} to ${destination}.` });
  return OK;
}

function actLoad(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'load' }>): ActionResult {
  if (s.phase !== 'combatMove' && s.phase !== 'noncombat') return err('Not a movement phase.');
  const actor = operatingPower(s);
  if (!actor) return err('Choose the USA/China operation order first.');
  if (actor === 'china') return err('Chinese units cannot load onto transports.');
  const power = actor;
  const zone = idx.seaZone[a.zone];
  if (!zone) return err('Unknown sea zone.');
  if (!(zone.coastTo ?? []).includes(a.territory)) return err('That territory does not border the zone.');
  if (seaZoneHostile(s, a.zone, power)) return err('Clear hostile surface warships before loading transports.');
  for (const u of a.units) {
    if (UNITS[u.key].domain !== 'land') return err('Transports carry land units.');
    if (s.phase === 'combatMove' && u.key === 'aaGun') {
      return err('Antiaircraft guns cannot load during Combat Move. Only a gun loaded in a prior turn may accompany an amphibious assault.');
    }
    if (s.phase === 'combatMove' && unmovedUnitCount(s, a.territory, power, u.key) < u.count) return err(`Not enough unmoved ${UNITS[u.key].name} there.`);
  }
  const loadPlan = planUnmovedSlices(s, a.territory, power, a.units);
  if (loadPlan.error) return err(loadPlan.error);

  if (a.hulls) {
    if (!sameCargoCounts(a.units, a.hulls.flatMap((hull) => hull.units))) {
      return err('Every selected land unit must be assigned to one exact transport.');
    }
    const planned = planExactTransportHulls(s, a.hulls.map((order) => ({ sourceSpace: a.zone, order })));
    if (planned.error) return err(planned.error);
    for (const hull of planned.hulls) {
      if (!sameSide(hull.order.owner, power)) return err('Cargo may load only onto a friendly transport.');
      if (s.phase === 'combatMove' && hull.order.owner !== power) {
        return err('Combat-loaded cargo cannot assault from an allied transport in the same turn.');
      }
      if (hull.source.offloadedTo) return err('A transport cannot load again after unloading this turn.');
      if (s.phase === 'combatMove' && (hull.source.moved ?? 0) > 0) {
        return err('A transport that already moved cannot load during combat movement.');
      }
      if (hull.order.units.some((unit) => UNITS[unit.key].domain !== 'land')) {
        return err('Transports carry land units only.');
      }
      if (!addExactCargo(hull.draft, power, hull.order.units)) {
        return err(`The selected ${POWERS[hull.order.owner].name} transport is over capacity.`);
      }
      addLoadedThisTurnCargo(hull.draft, power, hull.order.units);
      if (s.phase === 'combatMove') addCombatLoadedCargo(hull.draft, power, hull.order.units);
    }
    removePlannedSlices(s, a.territory, loadPlan.slices);
    commitTransportDrafts(planned.hulls);
    return OK;
  }

  // capacity: 1 land unit + 1 extra infantry per transport
  const tps = stacksAt(s, a.zone).filter((st) => st.power === power
    && st.key === 'transport'
    && !st.offloadedTo
    && (s.phase !== 'combatMove' || (st.moved ?? 0) === 0));
  if (!tps.length) return err('No transport in that zone.');
  // flatten capacity check across transports
  const cargoNow = tps.flatMap((st) => st.cargo ?? []);
  const nonInfNow = cargoNow.filter((c) => c.key !== 'infantry').reduce((n, c) => n + c.count, 0);
  const infNow = cargoNow.filter((c) => c.key === 'infantry').reduce((n, c) => n + c.count, 0);
  const tpCount = tps.reduce((n, st) => n + st.count, 0);
  const nonInfNew = a.units.filter((u) => u.key !== 'infantry').reduce((n, u) => n + u.count, 0);
  const infNew = a.units.filter((u) => u.key === 'infantry').reduce((n, u) => n + u.count, 0);
  if (nonInfNow + nonInfNew > tpCount) return err('Each transport carries one land unit plus one infantry.');
  if (infNow + infNew > tpCount * 2 - (nonInfNow + nonInfNew)) return err('Not enough transport capacity.');
  const transportDraft = physicalTransportDrafts(tps);
  if (transportDraft.error) return err(transportDraft.error);
  const cargoBefore = transportDraft.stacks.map((stack) => (stack.cargo ?? []).map((item) => ({ ...item })));
  const newCargo = a.units.map((u) => ({ power, key: u.key, count: u.count }));
  if (!packTransportCargo(transportDraft.stacks, newCargo)) return err('Not enough transport capacity.');
  for (let index = 0; index < transportDraft.stacks.length; index++) {
    const stack = transportDraft.stacks[index];
    const before = cargoCounts(cargoBefore[index].filter((item) => item.power === power));
    const after = cargoCounts((stack.cargo ?? []).filter((item) => item.power === power));
    const loaded = [...after].flatMap(([key, count]) => {
      const added = count - (before.get(key) ?? 0);
      return added > 0 ? [{ key, count: added }] : [];
    });
    if (loaded.length) {
      addLoadedThisTurnCargo(stack, power, loaded);
      if (s.phase === 'combatMove') addCombatLoadedCargo(stack, power, loaded);
    }
  }
  // Commit land removal and the independently packed physical transports only
  // after the entire order has passed availability and capacity validation.
  removePlannedSlices(s, a.territory, loadPlan.slices);
  replaceTransportStacks(s, a.zone, tps, transportDraft.stacks);
  return OK;
}

function actOffload(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'offload' }>): ActionResult {
  if (s.phase !== 'noncombat') return err('Peacetime offloads happen in noncombat (amphibious assaults use attack).');
  const actor = operatingPower(s);
  if (!actor) return err('Choose the USA/China operation order first.');
  if (actor === 'china') return err('Chinese units cannot use transports.');
  const power = actor;
  const zone = idx.seaZone[a.zone];
  if (!zone) return err('Unknown sea zone.');
  if (!(zone.coastTo ?? []).includes(a.territory)) return err('That territory does not border the zone.');
  if (seaZoneHostile(s, a.zone, power)) return err('Clear hostile surface warships before offloading transports.');
  const holder = s.control[a.territory];
  if (holder == null || !sameSide(holder, power)) return err('Offload into friendly territory only.');

  if (a.hulls) {
    const planned = planExactTransportHulls(s, a.hulls.map((order) => ({ sourceSpace: a.zone, order })));
    if (planned.error) return err(planned.error);
    const unloaded: { key: UnitKey; count: number }[] = [];
    for (const hull of planned.hulls) {
      if (!sameSide(hull.order.owner, power)) return err('Cargo may offload only from a friendly transport.');
      if (hull.source.offloadedTo) return err('That transport already unloaded this turn.');
      if (hull.source.offloadBlocked) return err('A transport that retreated from sea combat cannot offload this turn.');
      if (hull.source.combatLoadedCargo?.some((cargo) => cargo.power === power && cargo.count > 0)) {
        return err('Cargo loaded during Combat Move must join an amphibious assault, not a noncombat offload.');
      }
      if (hull.order.owner !== power && alliedOffloadUsesNewCargo(hull.source, power, hull.order.units)) {
        return err('Cargo loaded onto an allied transport this turn must wait for a later turn to offload.');
      }
      if (hull.order.units.some((unit) => UNITS[unit.key].domain !== 'land')) {
        return err('Transports carry land units only.');
      }
      if (!removeExactCargo(hull.draft, power, hull.order.units)) {
        return err(`The selected transport does not hold that exact ${combatantName(power)} cargo.`);
      }
      hull.draft.moved = 1;
      hull.draft.offloadedTo = a.territory;
      unloaded.push(...hull.order.units);
    }
    commitTransportDrafts(planned.hulls);
    for (const unit of unloaded) {
      for (let i = 0; i < unit.count; i++) addSpentCombatUnit(s, a.territory, power, unit.key);
    }
    return OK;
  }

  const legacyUnits = a.units!;
  const tps = stacksAt(s, a.zone).filter((st) => st.power === power && st.key === 'transport');
  const transportDraft = physicalTransportDrafts(tps);
  if (transportDraft.error) return err(transportDraft.error);
  const draft = transportDraft.stacks.map((st) => ({ st, cargo: (st.cargo ?? []).map((c) => ({ ...c })) }));
  const touched = new Set<UnitStack>();
  for (const u of legacyUnits) {
    if (UNITS[u.key].domain !== 'land') return err('Transports carry land units only.');
    let left = u.count;
    for (const item of draft) {
      if (item.st.offloadedTo || item.st.offloadBlocked || item.st.combatLoadedCargo?.length) continue;
      for (const c of item.cargo) {
        if (c.key !== u.key || c.power !== power || left === 0) continue;
        const take = Math.min(c.count, left);
        c.count -= take;
        left -= take;
        if (take > 0) touched.add(item.st);
      }
      item.cargo = item.cargo.filter((c) => c.count > 0);
    }
    if (left > 0) return err(`Not enough ${UNITS[u.key].name} aboard.`);
  }
  // Commit only after every requested cargo type has been proven available.
  for (const item of draft) {
    if (item.cargo.length) item.st.cargo = item.cargo;
    else delete item.st.cargo;
    if (touched.has(item.st)) {
      item.st.moved = 1;
      item.st.offloadedTo = a.territory;
    }
  }
  replaceTransportStacks(s, a.zone, tps, transportDraft.stacks);
  for (const u of legacyUnits) {
    for (let i = 0; i < u.count; i++) addSpentCombatUnit(s, a.territory, power, u.key);
  }
  return OK;
}

// ---------- mobilize ----------

function actPlaceBatch(
  s: AxisState,
  idx: MapIndex,
  a: Extract<AxisAction, { type: 'placeBatch' }>,
  commit = true,
): ActionResult {
  if (s.phase !== 'mobilize') return err('Not the mobilize phase.');
  const power = activePower(s);
  const p = s.powers[power];
  const china = a.china ?? 0;
  if (s.turnStartedCapitalOccupied && a.units.length > 0) {
    return err(`${POWERS[power].name} cannot mobilize regular units after beginning the turn without its capital.`);
  }
  const destinationSea = Boolean(idx.seaZone[a.space]);
  const seaUnits = a.units.filter((unit) => UNITS[unit.key].domain === 'sea');
  const fighterUnits = a.units.filter((unit) => unit.key === 'fighter');
  const incomingFighters = fighterUnits.reduce((total, unit) => total + unit.count, 0);
  const incomingCarriers = seaUnits
    .filter((unit) => unit.key === 'carrier')
    .reduce((total, unit) => total + unit.count, 0);
  const currentCarrierObligations = normalizeAxisCarrierObligations(
    s.newCarrierLandingObligations,
  ).filter((row) => row.power === power);
  const reservedAtFactory = (factory: string): number => currentCarrierObligations.reduce(
    (total, row) => total + row.carrierFactories.filter((entry) => entry === factory).length,
    0,
  );
  const matchingPlacementReservations = (factory: string): number => {
    if (!destinationSea || incomingCarriers === 0) return 0;
    const row = currentCarrierObligations.find((candidate) =>
      candidate.seaZone === a.space && candidate.power === power);
    return Math.min(
      incomingCarriers,
      row?.carrierFactories.filter((entry) => entry === factory).length ?? 0,
    );
  };
  const nonSeaPlacementUnits = a.units.filter((unit) =>
    UNITS[unit.key].domain !== 'sea' && unit.key !== 'fighter');
  if (destinationSea && (nonSeaPlacementUnits.length > 0 || china > 0)) {
    return err('Only sea units and fighters may mobilize into a sea zone.');
  }
  if (!destinationSea && seaUnits.length > 0) {
    return err('Sea units must mobilize into an adjacent sea zone.');
  }

  // Validate every staged demand before touching capacity, staging, grant, or
  // board state. The whole multi-type order either lands or is a no-op.
  for (const unit of a.units) {
    if ((p.staging[unit.key] ?? 0) < unit.count) return err(`Not that many ${UNITS[unit.key].name} staged.`);
  }

  const factoryOrder = a.units.find((unit) => unit.key === 'factory');
  if (factoryOrder && (factoryOrder.count !== 1 || a.units.length !== 1 || china > 0)) {
    return err('Place one new industrial complex as its own order.');
  }

  const productionCount = a.units
    .filter((unit) => unit.key !== 'factory')
    .reduce((sum, unit) => sum + unit.count, 0);
  let factoryTerr: string | null = null;

  if (destinationSea && a.units.length > 0) {
    const zone = idx.seaZone[a.space];
    if (!zone) return err('Sea units must enter an adjacent sea zone.');
    const candidates = (zone.coastTo ?? []).filter((territory) =>
      axisControlledSinceTurnStart(s, territory, power)
      && unitCount(s, territory, null, 'factory') > 0);
    if (a.factory !== undefined && !candidates.includes(a.factory)) {
      return err('That industrial complex cannot mobilize into this sea zone.');
    }
    const ordered = a.factory ? [a.factory] : candidates;
    factoryTerr = ordered.find((territory) => {
      const t = idx.territory[territory];
      if (!t) return false;
      const cap = axisFactoryProductionCapacity(t.ipc, p.techs, s.factoryDamage[territory] ?? 0);
      const protectedReservations = Math.max(
        0,
        reservedAtFactory(territory) - matchingPlacementReservations(territory),
      );
      return (p.factoriesUsed[territory] ?? 0) + productionCount + protectedReservations <= cap;
    }) ?? null;
    if (!factoryTerr) {
      if (candidates.length === 0) return err('No friendly industrial complex adjacent to that zone.');
      return err('No adjacent industrial complex has enough capacity for that placement.');
    }
    if (incomingFighters > 0
      && !canAxisPlaceFightersOnOwnCarriers(s, power, a.space, incomingFighters, incomingCarriers)) {
      return err('New fighters need open deck slots on your own existing or newly mobilized carriers.');
    }
  } else if (a.units.length > 0) {
    if (a.factory !== undefined && a.factory !== a.space) return err('Land units use the industrial complex in their destination.');
    factoryTerr = a.space;
    if (!axisControlledSinceTurnStart(s, a.space, power)) {
      return err('Place only in a territory you have controlled since the start of your turn.');
    }
    if (factoryOrder) {
      const t = idx.territory[a.space];
      if (!t || t.ipc < 1) return err('New complexes need a territory worth at least 1 IPC.');
      if (unitCount(s, a.space, null, 'factory') > 0) return err('One complex per territory.');
    } else if (unitCount(s, a.space, null, 'factory') === 0) {
      return err('Units enter play at industrial complexes.');
    }
  }

  if (productionCount > 0) {
    if (!factoryTerr) return err('No industrial complex can govern that placement.');
    const t = idx.territory[factoryTerr]!;
    const cap = axisFactoryProductionCapacity(t.ipc, p.techs, s.factoryDamage[factoryTerr] ?? 0);
    const used = p.factoriesUsed[factoryTerr] ?? 0;
    const protectedReservations = Math.max(
      0,
      reservedAtFactory(factoryTerr) - matchingPlacementReservations(factoryTerr),
    );
    if (used + productionCount + protectedReservations > cap) {
      return err(`That complex can mobilize ${Math.max(0, cap - used - protectedReservations)} more unreserved unit(s) this turn.`);
    }
  }

  if (china > 0) {
    if (power !== 'usa') return err('China places during the US turn.');
    if (s.chinaGrant < china) return err('Not that many Chinese infantry left to place.');
    if (!s.chinaPlacementSpaces.includes(a.space)) {
      return err('Chinese infantry may use only a Chinese-controlled territory that began mobilization below three Chinese units.');
    }
  }

  let obligationsAfterPlacement = currentCarrierObligations;
  let resolvedCarrierFighterRefs: readonly string[] = [];
  const deckOverrides: AxisCarrierZoneDeckSnapshot[] = [];
  if (destinationSea && factoryTerr && incomingCarriers > 0
    && currentCarrierObligations.length > 0) {
    const before = carrierDeckSnapshotAt(s, power, a.space);
    const fulfillment = fulfillAxisCarrierPlacement({
      obligations: currentCarrierObligations,
      placement: {
        power,
        seaZone: a.space,
        factory: factoryTerr,
        carriers: incomingCarriers,
      },
      deckBefore: {
        ...before,
        occupiedByOwnFighters: before.occupiedByOwnFighters + incomingFighters,
      },
    });
    obligationsAfterPlacement = [...fulfillment.obligations];
    resolvedCarrierFighterRefs = fulfillment.resolvedFighterRefs;
    deckOverrides.push({
      ...before,
      ownCarrierSlots: before.ownCarrierSlots + incomingCarriers * 2,
      occupiedByOwnFighters: before.occupiedByOwnFighters
        + incomingFighters + resolvedCarrierFighterRefs.length,
    });
  }
  if (currentCarrierObligations.length > 0) {
    const stagedAfter = Math.max(0, (p.staging.carrier ?? 0) - incomingCarriers);
    const usedAfter = { ...p.factoriesUsed };
    if (productionCount > 0 && factoryTerr) {
      usedAfter[factoryTerr] = (usedAfter[factoryTerr] ?? 0) + productionCount;
    }
    const reservationsRemain = validateCarrierObligationRows({
      s,
      idx,
      power,
      rows: obligationsAfterPlacement,
      stagedCarriers: stagedAfter,
      factoriesUsed: usedAfter,
      deckOverrides,
    });
    if (!reservationsRemain.ok) {
      return err(`That placement would break a required carrier landing. ${reservationsRemain.error ?? ''}`.trim());
    }
  }

  // The end-of-Mobilize gate calls the exact same validator without
  // committing, so it can distinguish genuine carryover from a unit that the
  // player is still legally able to place.
  if (!commit) return OK;

  // Commit only after every regular and Chinese rule has passed.
  if (productionCount > 0 && factoryTerr) {
    p.factoriesUsed[factoryTerr] = (p.factoriesUsed[factoryTerr] ?? 0) + productionCount;
  }
  for (const unit of a.units) {
    p.staging[unit.key]! -= unit.count;
    if (p.staging[unit.key] === 0) delete p.staging[unit.key];
    addUnits(s, a.space, power, unit.key, unit.count);
  }
  if (currentCarrierObligations.length > 0) {
    s.newCarrierLandingObligations = obligationsAfterPlacement.map((row) => ({
      ...row,
      fighterRefs: [...row.fighterRefs],
      carrierFactories: [...row.carrierFactories],
    }));
    clearCarrierLandingRefs(s, new Set(resolvedCarrierFighterRefs));
  }
  if (china > 0) {
    s.chinaGrant -= china;
    addUnits(s, a.space, 'china', 'infantry', china);
  }
  const what = [
    ...a.units.map((unit) => `${unit.count} ${UNITS[unit.key].name}${unit.count === 1 ? '' : 's'}`),
    ...(china > 0 ? [`${china} Chinese infantry`] : []),
  ].join(', ');
  s.log.push({
    round: s.round,
    power,
    space: a.space,
    text: `${POWERS[power].name} mobilizes ${what} to ${idx.territory[a.space]?.name ?? `sea zone ${idx.seaZone[a.space]?.n ?? ''}`}.`,
  });
  return OK;
}

function actPlace(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'place' }>): ActionResult {
  return actPlaceBatch(s, idx, { type: 'placeBatch', space: a.space, units: [{ key: a.key, count: a.count }] });
}

function actPlaceChina(s: AxisState, idx: MapIndex, space: string): ActionResult {
  return actPlaceBatch(s, idx, { type: 'placeBatch', space, units: [], china: 1 });
}

type MobilizationWitness = 'regular' | 'china' | null;

function firstLegalPendingMobilization(s: AxisState, idx: MapIndex): MobilizationWitness {
  const power = activePower(s);

  if (power === 'usa' && s.chinaGrant > 0) {
    for (const space of s.chinaPlacementSpaces) {
      if (actPlaceBatch(s, idx, { type: 'placeBatch', space, units: [], china: 1 }, false).ok) {
        return 'china';
      }
    }
  }

  if (s.turnStartedCapitalOccupied) return null;
  const staged = Object.entries(s.powers[power].staging) as [string, number | undefined][];
  for (const [rawKey, count] of staged) {
    if (!(rawKey in UNITS) || !count || count < 1) continue;
    const key = rawKey as UnitKey;
    const unit = { key, count: 1 };
    const domain = UNITS[key].domain;

    if (domain !== 'sea') {
      for (const territory of idx.map.territories) {
        if (actPlaceBatch(s, idx, {
          type: 'placeBatch',
          space: territory.id,
          units: [unit],
        }, false).ok) return 'regular';
      }
    }

    if (domain === 'sea' || key === 'fighter') {
      for (const zone of idx.map.seaZones) {
        // Name every governing factory explicitly. Auto-selecting only the
        // first locally-capable factory can hide a later carrier-reserved path.
        for (const factory of zone.coastTo ?? []) {
          if (actPlaceBatch(s, idx, {
            type: 'placeBatch',
            space: zone.id,
            units: [unit],
            factory,
          }, false).ok) return 'regular';
        }
      }
    }
  }
  return null;
}

// ---------- income + turn advance ----------

function objectiveMet(s: AxisState, idx: MapIndex, o: (typeof OBJECTIVES)[number]): boolean {
  const side = POWERS[o.power].coalition;
  const holds = (t: string) => {
    const h = s.control[t];
    return h != null && coalitionOf(h) === side;
  };
  if (o.special === 'anyOriginallyJapanese') {
    return idx.map.territories.some((t) => t.originalOwner === 'japan' && holds(t.id));
  }
  if (o.special === 'sovietsOnlyAndArchangel') {
    if (s.control['archangel'] !== 'ussr') return false;
    for (const t of idx.map.territories) {
      if (s.control[t.id] !== 'ussr') continue;
      const foreign = stacksAt(s, t.id).some((st) => st.power !== 'ussr' && coalitionOf(st.power) === 'allies');
      if (foreign) return false;
    }
    return true;
  }
  let met: boolean;
  if (o.kind === 'all') met = o.territories.every(holds);
  else if (o.kind === 'atLeast') met = o.territories.filter(holds).length >= (o.n ?? 1);
  else met = o.territories.some(holds);
  if (met && o.special === 'noEnemySurfaceWarshipsSz131415') {
    for (const sz of ['sz-13', 'sz-14', 'sz-15']) {
      const enemyShips = stacksAt(s, sz).some((st) => coalitionOf(st.power) !== side && SURFACE_WARSHIPS.includes(st.key));
      if (enemyShips) return false;
    }
  }
  return met;
}

function collectIncome(s: AxisState, idx: MapIndex): void {
  const power = activePower(s);
  const p = s.powers[power];
  let income = 0;
  if (!p.capitalHeldBy) {
    income = productionOf(s, idx, power);
    if (s.options.nationalObjectives) {
      for (const o of OBJECTIVES) {
        if (o.power === power && objectiveMet(s, idx, o)) {
          income += o.bonus;
          s.log.push({ round: s.round, power, text: `National objective met: +${o.bonus} IPCs.` });
        }
      }
    }
    if (p.techs.includes('warBonds')) {
      const bond = d6(s);
      income += bond;
      s.log.push({ round: s.round, power, text: `War bonds: +${bond} IPCs.` });
    }
  }
  p.ipcs += income;
  p.lastIncome = income;
  s.log.push({ round: s.round, power, text: `${POWERS[power].name} collects ${income} IPCs.` });
}

export function chinaInfantryGrant(s: AxisState, idx: MapIndex): number {
  return chinaInfantryGrantFromControl(idx.map.territories, s.control);
}

function prepareChinaGrant(s: AxisState, idx: MapIndex, atTurnStart = false): void {
  if (activePower(s) !== 'usa'
    || (!atTurnStart && s.phase !== 'rnd' && s.phase !== 'purchase')
    || s.chinaGrantPreparedRound === s.round) return;
  s.chinaGrant = chinaInfantryGrant(s, idx);
  s.chinaGrantPreparedRound = s.round;
  s.chinaPlacementSpaces = [];
  if (s.chinaGrant > 0) {
    s.log.push({ round: s.round, power: 'usa', text: `China raises ${s.chinaGrant} new infantry for later mobilization.` });
  }
}

function removeUnprotectedStrandedAircraft(
  s: AxisState,
  space: string,
  power: PowerKey,
  key: Extract<UnitKey, 'fighter' | 'bomber'>,
  count: number,
): void {
  let left = count;
  for (const stack of stacksAt(s, space)) {
    if (left === 0 || stack.power !== power || stack.key !== key) continue;
    if (key === 'fighter' && stack.count === 1 && stack.carrierLanding?.seaZone === space) continue;
    const take = Math.min(left, stack.count);
    stack.count -= take;
    left -= take;
  }
  s.board[space] = stacksAt(s, space).filter((stack) => stack.count > 0);
}

function destroyStrandedAircraft(s: AxisState, idx: MapIndex, power: AxisCombatant): void {
  // At the end of noncombat: any fighter/bomber in a space where it cannot be
  // (hostile territory, or sea zone without a friendly carrier slot) dies.
  if (power === 'china') {
    for (const [space, stacks] of Object.entries(s.board)) {
      const fighters = stacks
        .filter((stack) => stack.power === 'china' && stack.key === 'fighter')
        .reduce((total, stack) => total + stack.count, 0);
      if (fighters === 0 || isChinaFriendlyLandingTerritory(idx.territory[space], s.control, s.contested)) continue;
      removeUnits(s, space, 'china', 'fighter', fighters);
      const location = idx.territory[space]?.name ?? space;
      s.log.push({
        round: s.round,
        power: 'usa',
        space,
        text: `${fighters} Flying Tigers fighter${fighters === 1 ? '' : 's'} stranded over ${location} are lost.`,
      });
    }
    return;
  }
  for (const group of strandedAircraftForPower(s, idx, power)) {
    removeUnprotectedStrandedAircraft(s, group.space, power, group.key, group.count);
    const location = idx.territory[group.space]?.name ?? `sea zone ${idx.seaZone[group.space]?.n ?? group.space}`;
    s.log.push({
      round: s.round,
      power,
      space: group.space,
      text: group.reason === 'no-carrier'
        ? `${group.count} fighter${group.count === 1 ? '' : 's'} ditch at sea — no carrier deck.`
        : group.reason === 'bomber-at-sea'
          ? `${group.count} bomber${group.count === 1 ? '' : 's'} lost at sea.`
          : `${group.count} aircraft stranded over ${location} are lost.`,
    });
  }
}

function buildDefendingCarrierLandingSnapshot(
  s: AxisState,
  idx: MapIndex,
): AxisDefendingCarrierLandingSnapshot {
  const carriers = Object.entries(s.board).flatMap(([seaZone, stacks]) =>
    !idx.seaZone[seaZone] ? [] : stacks.flatMap((stack) => {
      if (stack.key !== 'carrier' || stack.count !== 1 || !stack.carrierRef
        || !isPowerKey(stack.power)) return [];
      const cargoOccupied = (stack.cargo ?? [])
        .filter((cargo) => cargo.key === 'fighter' && sameSide(cargo.power, stack.power))
        .reduce((total, cargo) => total + Math.max(0, cargo.count), 0);
      return [{
        ref: stack.carrierRef,
        power: stack.power,
        seaZone,
        occupied: cargoOccupied,
      }];
    }));
  carriers.sort((left, right) => left.seaZone.localeCompare(right.seaZone)
    || left.ref.localeCompare(right.ref));

  // Own fighters remain loose so their owner can move them independently.
  // Associate them with exact decks deterministically for this immutable
  // snapshot, honoring a durable base ref when it is still physically valid.
  const occupied = new Map(carriers.map((carrier) => [carrier.ref, carrier.occupied]));
  for (const [seaZone, stacks] of Object.entries(s.board)) {
    if (!idx.seaZone[seaZone]) continue;
    const local = carriers.filter((carrier) => carrier.seaZone === seaZone);
    const loose = stacks.flatMap((stack) => {
      if (stack.key !== 'fighter' || !isPowerKey(stack.power)) return [];
      return Array.from({ length: Math.max(0, stack.count) }, (_, index) => ({
        power: stack.power,
        preferred: stack.count === 1 && index === 0 ? stack.carrierBaseRef : undefined,
      }));
    });
    for (const fighter of loose) {
      const canUse = (carrier: (typeof carriers)[number]) =>
        sameSide(carrier.power, fighter.power)
        && (occupied.get(carrier.ref) ?? carrier.occupied) < 2;
      const deck = fighter.preferred
        ? local.find((carrier) => carrier.ref === fighter.preferred && canUse(carrier))
          ?? local.find(canUse)
        : local.find(canUse);
      if (deck) occupied.set(deck.ref, (occupied.get(deck.ref) ?? deck.occupied) + 1);
    }
  }

  const seaZones = idx.map.seaZones.map((zone) => {
    const stacks = stacksAt(s, zone.id);
    const hostileTo = (['axis', 'allies'] as const).filter((side) => stacks.some((stack) =>
      stack.count > 0
      && SURFACE_WARSHIPS.includes(stack.key)
      && coalitionOf(stack.power) !== side));
    return {
      id: zone.id,
      adjacentSeaZones: [...zone.adj],
      adjacentTerritories: [...(zone.coastTo ?? [])],
      ...(hostileTo.length ? { hostileTo } : {}),
    };
  });
  const territories = idx.map.territories.map((territory) => {
    const stacks = stacksAt(s, territory.id);
    const hostileTo = (['axis', 'allies'] as const).filter((side) => stacks.some((stack) =>
      stack.count > 0 && coalitionOf(stack.power) !== side));
    return {
      id: territory.id,
      controller: s.control[territory.id] ?? null,
      ...(hostileTo.length ? { hostileTo } : {}),
    };
  });
  return {
    timing: { allCombatsResolved: true, ordinaryNoncombatStarted: false },
    fighters: s.pendingDefendingCarrierFighters.map((fighter) => ({ ...fighter })),
    carriers: carriers.map((carrier) => ({
      ...carrier,
      occupied: occupied.get(carrier.ref) ?? carrier.occupied,
    })),
    seaZones,
    territories,
  };
}

function activateDefendingCarrierLandingQueue(
  s: AxisState,
  idx: MapIndex,
  resumeCombatant: AxisCombatant,
): ActionResult | null {
  if (s.pendingDefendingCarrierFighters.length === 0) return null;
  const snapshot = buildDefendingCarrierLandingSnapshot(s, idx);
  const progress = deriveAxisDefendingCarrierLandingProgress(snapshot);
  if (!progress.ok) return err(`Defending carrier landing state is invalid: ${progress.error}`);
  if (progress.status !== 'decision') {
    return err('Defending carrier fighters did not produce an exact landing decision.');
  }
  s.defendingCarrierLanding = { snapshot, choices: [], resumeCombatant };
  s.pendingDefendingCarrierFighters = [];
  s.log.push({
    round: s.round,
    power: activePower(s),
    text: `${snapshot.fighters.length} defending carrier fighter${snapshot.fighters.length === 1 ? '' : 's'} must land before ordinary noncombat movement.`,
  });
  return OK;
}

function actualCarrierDeckOccupancy(s: AxisState, space: string, carrierRef: string): number {
  const carrier = stacksAt(s, space).find((stack) => stack.key === 'carrier'
    && stack.count === 1 && stack.carrierRef === carrierRef);
  if (!carrier) return Number.POSITIVE_INFINITY;
  const cargo = (carrier.cargo ?? [])
    .filter((item) => item.key === 'fighter')
    .reduce((total, item) => total + Math.max(0, item.count), 0);
  const loose = stacksAt(s, space)
    .filter((stack) => stack.key === 'fighter' && stack.carrierBaseRef === carrierRef)
    .reduce((total, stack) => total + Math.max(0, stack.count), 0);
  return cargo + loose;
}

function completeDefendingCarrierLandingQueue(
  s: AxisState,
  resumeCombatant: AxisCombatant,
): void {
  s.defendingCarrierLanding = null;
  clearCombatAircraftForNoncombat(s, resumeCombatant);
  s.phase = 'noncombat';
  if (activePower(s) === 'usa') s.usaOperationIndex = 0;
  s.log.push({
    round: s.round,
    power: activePower(s),
    text: `${combatantName(resumeCombatant)} begins ordinary noncombat movement after every defending carrier fighter lands.`,
  });
}

function actDefendingCarrierLanding(
  s: AxisState,
  action: Extract<AxisAction, { type: 'defendingCarrierLanding' }>,
): ActionResult {
  const queue = s.defendingCarrierLanding;
  if (!queue || s.phase !== 'combatMove') return err('No defending carrier fighter is waiting to land.');
  const requested: AxisDefendingCarrierLandingChoice = action.kind === 'carrier'
    ? { fighterRef: action.fighterRef, kind: 'carrier', carrierRef: action.carrierRef }
    : action.kind === 'territory'
      ? { fighterRef: action.fighterRef, kind: 'territory', territory: action.territory }
      : { fighterRef: action.fighterRef, kind: 'destroy' };
  const result = applyAxisDefendingCarrierLandingChoice(queue.snapshot, queue.choices, requested);
  if (!result.ok) return err(result.error);
  const applied = result.applied;
  const fighter = queue.snapshot.fighters.find((candidate) => candidate.ref === applied.fighterRef);
  if (!fighter) return err('That exact defending fighter is no longer in the landing snapshot.');

  let carrier: UnitStack | undefined;
  if (applied.kind === 'carrier') {
    carrier = stacksAt(s, applied.space).find((stack) => stack.key === 'carrier'
      && stack.count === 1
      && stack.carrierRef === applied.carrierRef
      && stack.power === applied.carrierPower);
    if (!carrier || actualCarrierDeckOccupancy(s, applied.space, applied.carrierRef) >= 2) {
      return err('That exact carrier deck changed before the fighter could land.');
    }
  } else if (applied.kind === 'territory') {
    if (s.control[applied.territory] !== applied.controller
      || !sameSide(applied.controller, fighter.power)
      || stacksAt(s, applied.territory).some((stack) => !sameSide(stack.power, fighter.power))) {
      return err('That exact territory landing changed before the fighter could land.');
    }
  }

  // All validation above is non-mutating. Apply the exact physical landing and
  // ledger append together so stale clients cannot consume a fighter or slot.
  if (applied.kind === 'carrier') {
    if (carrier!.power === fighter.power) {
      (s.board[applied.space] ??= []).push({
        power: fighter.power,
        key: 'fighter',
        count: 1,
        carrierBaseRef: applied.carrierRef,
      });
    } else {
      carrier!.cargo ??= [];
      const guest = carrier!.cargo.find((item) => item.power === fighter.power && item.key === 'fighter');
      if (guest) guest.count += 1;
      else carrier!.cargo.push({ power: fighter.power, key: 'fighter', count: 1 });
    }
  } else if (applied.kind === 'territory') {
    addUnits(s, applied.territory, fighter.power, 'fighter', 1);
  }
  queue.choices = result.choices.map((choice) => ({ ...choice }));
  s.log.push({
    round: s.round,
    power: fighter.power,
    ...(applied.space ? { space: applied.space } : {}),
    text: applied.kind === 'carrier'
      ? `${POWERS[fighter.power].name}'s exact carrier fighter lands on ${applied.carrierRef} in ${applied.space}.`
      : applied.kind === 'territory'
        ? `${POWERS[fighter.power].name}'s exact carrier fighter lands in ${applied.territory}.`
        : `${POWERS[fighter.power].name}'s carrier fighter is destroyed because no legal landing exists.`,
  });
  if (result.progress.ok && result.progress.status === 'complete') {
    completeDefendingCarrierLandingQueue(s, queue.resumeCombatant);
  }
  return OK;
}

function clearCombatAircraftForNoncombat(s: AxisState, power: AxisCombatant): void {
  for (const stacks of Object.values(s.board)) {
    for (const stack of stacks) {
      if (stack.power === power && (stack.key === 'fighter' || stack.key === 'bomber')) delete stack.moved;
    }
  }
}

function unresolvedSharedHostileSeaZones(
  s: AxisState,
  idx: MapIndex,
  power: AxisCombatant,
): string[] {
  // Only pieces that can still be addressed in Combat Move are unresolved.
  // Spent aircraft that already fought/withdrew must be allowed to advance to
  // their Noncombat landing move instead of deadlocking the phase.
  return Object.entries(s.board)
    .filter(([space, stacks]) => Boolean(idx.seaZone[space])
      && axisEnemySurfaceWarshipAt(s, space, power)
      && (stacks ?? []).some((stack) => {
        if (stack.power !== power || stack.count - (stack.moved ?? 0) <= 0) return false;
        const domain = UNITS[stack.key].domain;
        return domain === 'sea' || domain === 'air';
      }))
    .map(([space]) => space);
}

function enterMobilize(s: AxisState, idx: MapIndex): void {
  s.phase = 'mobilize';
  s.chinaPlacementSpaces = activePower(s) === 'usa'
    ? eligibleChinaPlacementSpaces(idx.map.territories, s.control, s.board)
    : [];
  if (activePower(s) === 'usa' && s.chinaGrant > 0 && s.chinaPlacementSpaces.length === 0) {
    const undeployable = s.chinaGrant;
    s.chinaGrant = 0;
    s.log.push({
      round: s.round,
      power: 'usa',
      text: `${undeployable} Chinese infantry cannot deploy because no eligible Chinese-controlled territory was available when mobilization began.`,
    });
  }
}

function actChooseUsOperationOrder(s: AxisState, first: UsaOperationFirst): ActionResult {
  if (activePower(s) !== 'usa' || s.phase !== 'combatMove' || s.combat) {
    return err('Choose the USA/China order before combat begins.');
  }
  if (s.usaOperationFirst) return err('The USA/China operation order is already locked for this turn.');
  s.usaOperationFirst = first;
  s.usaOperationIndex = 0;
  const second = first === 'usa' ? 'China' : 'United States';
  s.log.push({ round: s.round, power: 'usa', text: `${combatantName(first)} conducts combat first; ${second} follows.` });
  return OK;
}

function recordOccupiedCapitalIncomeSkip(s: AxisState, power: PowerKey): void {
  s.powers[power].lastIncome = 0;
  s.log.push({
    round: s.round,
    power,
    text: `${POWERS[power].name} collects no income while its capital is occupied.`,
  });
}

function clearCompletedTurn(s: AxisState, power: PowerKey): void {
  s.powers[power].factoriesUsed = {};
  s.powers[power].purchasedThisTurn = {};
  s.contested = [];
  s.chinaPlacementSpaces = [];
  s.usaOperationFirst = null;
  s.usaOperationIndex = 0;
  s.chinaGrantPreparedRound = null;
  if (power === 'usa') s.chinaGrant = 0;
  s.newCarrierLandingObligations = [];
  s.pendingDefendingCarrierFighters = [];
  s.defendingCarrierLanding = null;
  // Clear per-turn movement marks without disturbing physical transport
  // identity or any owner-local technology annotations.
  for (const stacks of Object.values(s.board)) {
    for (const st of stacks) {
      delete st.moved;
      delete st.movementSpent;
      delete st.offloadedTo;
      delete st.combatLoadedCargo;
      delete st.loadedThisTurnCargo;
      delete st.offloadBlocked;
      delete st.carrierLanding;
    }
  }
}

/**
 * Friendly-power fighters ride as bound cargo while the carrier owner acts,
 * but the rulebook lets them take off and move independently on their own
 * turn. Release only the now-active owner's guests and retain the exact deck
 * ref so an unchanged fighter can re-board the same physical hull later.
 */
function releaseActiveCarrierGuestFighters(s: AxisState, power: PowerKey): void {
  for (const [space, stacks] of Object.entries(s.board)) {
    if (!isSeaZoneId(space)) continue;
    const released: UnitStack[] = [];
    for (const carrier of stacks) {
      if (carrier.key !== 'carrier'
        || carrier.count !== 1
        || !carrier.carrierRef
        || carrier.power === power
        || !sameSide(carrier.power, power)
        || !carrier.cargo?.length) continue;
      const remaining: NonNullable<UnitStack['cargo']> = [];
      for (const cargo of carrier.cargo) {
        if (cargo.key !== 'fighter' || cargo.power !== power || cargo.count <= 0) {
          if (cargo.count > 0) remaining.push({ ...cargo });
          continue;
        }
        for (let physical = 0; physical < cargo.count; physical++) {
          released.push({
            power,
            key: 'fighter',
            count: 1,
            carrierBaseRef: carrier.carrierRef,
          });
        }
      }
      if (remaining.length > 0) carrier.cargo = remaining;
      else delete carrier.cargo;
    }
    stacks.push(...released);
  }
}

interface TurnBoundaryCarrierDeck {
  stack: UnitStack;
  ref: string;
  occupied: number;
}

interface TurnBoundaryLooseFighter {
  stack: UnitStack;
  power: PowerKey;
  preferred?: string;
  assigned?: TurnBoundaryCarrierDeck;
}

/**
 * At the end of a fighter owner's turn, bind any fighter using an allied deck
 * back to that exact carrier. It will then travel as cargo during the carrier
 * owner's turn, while fighters on their own carriers remain loose and
 * independently selectable. Preferred base refs win; every other allocation
 * is deterministic and capacity exact.
 */
function stowActiveCarrierGuestFighters(s: AxisState, power: PowerKey): void {
  for (const [space, stacks] of Object.entries(s.board)) {
    if (!isSeaZoneId(space)) continue;
    const decks: TurnBoundaryCarrierDeck[] = stacks.flatMap((stack) => {
      if (stack.key !== 'carrier' || stack.count !== 1 || !stack.carrierRef || !isPowerKey(stack.power)) return [];
      const occupied = (stack.cargo ?? [])
        .filter((cargo) => cargo.key === 'fighter')
        .reduce((total, cargo) => total + Math.max(0, cargo.count), 0);
      return [{ stack, ref: stack.carrierRef, occupied }];
    }).sort((left, right) => left.ref.localeCompare(right.ref));
    if (decks.length === 0) continue;

    const loose: TurnBoundaryLooseFighter[] = stacks.flatMap((stack) => {
      if (stack.key !== 'fighter' || !isPowerKey(stack.power) || stack.count <= 0) return [];
      const fighterPower = stack.power;
      return Array.from({ length: stack.count }, () => ({
        stack,
        power: fighterPower,
        ...(stack.count === 1 && stack.carrierBaseRef
          ? { preferred: stack.carrierBaseRef }
          : {}),
      }));
    });

    const canUse = (deck: TurnBoundaryCarrierDeck, fighter: TurnBoundaryLooseFighter): boolean =>
      sameSide(deck.stack.power, fighter.power) && deck.occupied < 2;
    const assign = (fighter: TurnBoundaryLooseFighter, preferredOnly: boolean): void => {
      const deck = fighter.preferred
        ? decks.find((candidate) => candidate.ref === fighter.preferred && canUse(candidate, fighter))
        : undefined;
      const selected = deck ?? (preferredOnly ? undefined : decks.find((candidate) => canUse(candidate, fighter)));
      if (!selected) return;
      selected.occupied += 1;
      fighter.assigned = selected;
    };
    // Reserve every still-valid exact home deck before filling unbased slots.
    for (const fighter of loose) if (fighter.preferred) assign(fighter, true);
    for (const fighter of loose) if (!fighter.assigned) assign(fighter, false);

    const activeStacks = new Set(loose
      .filter((fighter) => fighter.power === power)
      .map((fighter) => fighter.stack));
    if (activeStacks.size === 0) continue;
    const rebuilt: UnitStack[] = [];
    for (const fighter of loose.filter((candidate) => candidate.power === power)) {
      const deck = fighter.assigned;
      if (deck && deck.stack.power !== power) {
        deck.stack.cargo ??= [];
        const cargo = deck.stack.cargo.find((item) => item.power === power && item.key === 'fighter');
        if (cargo) cargo.count += 1;
        else deck.stack.cargo.push({ power, key: 'fighter', count: 1 });
        continue;
      }
      rebuilt.push({
        power,
        key: 'fighter',
        count: 1,
        ...(deck ? { carrierBaseRef: deck.ref } : {}),
      });
    }
    s.board[space] = [
      ...stacks.filter((stack) => !activeStacks.has(stack)),
      ...rebuilt,
    ];
  }
}

function beginTurn(s: AxisState, idx: MapIndex): void {
  const power = activePower(s);
  releaseActiveCarrierGuestFighters(s, power);
  // Defensive reset for occupied-capital turns that skip Purchase entirely.
  s.powers[power].purchasedThisTurn = {};
  s.economicRaidLedger = { power, targetedFactories: [] };
  s.rocketLedger = { power, launchedFrom: [], targetedFactories: [] };
  s.pendingDefendingCarrierFighters = [];
  s.defendingCarrierLanding = null;
  s.turnStartedCapitalOccupied = s.powers[power].capitalHeldBy != null;
  snapshotAxisTurnStartSea(s, idx);
  s.awaitingChart = false;
  s.usaOperationFirst = null;
  s.usaOperationIndex = 0;
  s.phase = s.turnStartedCapitalOccupied
    ? 'combatMove'
    : s.options.rnd ? 'rnd' : 'purchase';
  // China remains a separate economy/force operating inside the USA turn.
  // Its grant is snapshotted even when Washington's economic phases skip.
  if (power === 'usa') prepareChinaGrant(s, idx, true);
}

/** Finish the active turn, clean every exact per-turn ledger, and initialize
 * the next power through one path so occupied-capital skips cannot diverge. */
function advanceTurn(s: AxisState, idx: MapIndex): void {
  const power = activePower(s);
  const order = TURN_ORDER[s.options.scenario];
  stowActiveCarrierGuestFighters(s, power);
  clearCompletedTurn(s, power);

  if (s.turnIdx === order.length - 1) {
    checkVictory(s, idx);
    if (s.winner) return;
    s.round += 1;
    s.turnIdx = 0;
  } else {
    s.turnIdx += 1;
  }

  beginTurn(s, idx);
  const next = activePower(s);
  s.log.push({
    round: s.round,
    power: next,
    text: s.turnStartedCapitalOccupied
      ? `${POWERS[next].name} is up. Its capital is occupied, so it proceeds directly to combat operations.`
      : `${POWERS[next].name} is up.`,
  });
}

function actEndPhase(s: AxisState, idx: MapIndex): ActionResult {
  const power = activePower(s);
  switch (s.phase) {
    case 'rnd':
      if (s.awaitingChart) return err('Choose a breakthrough chart first.');
      s.phase = 'purchase';
      return OK;
    case 'purchase': {
      const purchases = Object.entries(s.powers[power].purchasedThisTurn)
        .filter((entry): entry is [UnitKey, { count: number; paidUnitCost: number }] => Boolean(entry[1]));
      if (purchases.length) {
        const list = purchases.map(([k, entry]) => `${entry.count} ${UNITS[k].name}${entry.count === 1 ? '' : 's'}`).join(', ');
        s.log.push({ round: s.round, power, space: 'mobilization', text: `${POWERS[power].name} purchases ${list} — staged in the mobilization zone.` });
      }
      s.powers[power].purchasedThisTurn = {};
      if (power === 'usa') {
        s.usaOperationFirst = null;
        s.usaOperationIndex = 0;
      }
      s.phase = 'combatMove';
      return OK;
    }
    case 'combatMove':
      if (s.combat) return err('Resolve the battle first.');
      // Combat aircraft are spent for further attacks, but receive their one
      // noncombat landing move when the phase changes. Land and sea survivors
      // remain spent for the rest of the turn.
      if (power === 'usa') {
        const actor = operatingPower(s);
        if (!actor) return err('Choose whether USA or China conducts combat first.');
        if (hasCombatLoadCommitment(s, actor)) {
          return err('Every unit loaded during Combat Move must complete its amphibious assault before combat ends.');
        }
        const unresolved = unresolvedSharedHostileSeaZones(s, idx, actor);
        if (unresolved.length > 0) {
          return err(`Resolve battle or explicitly move every still-available active-power hull and loose aircraft out of shared hostile sea zone${unresolved.length === 1 ? '' : 's'} ${unresolved.join(', ')}.`);
        }
        clearCombatAircraftForNoncombat(s, actor);
        if (s.usaOperationIndex === 0) {
          s.usaOperationIndex = 1;
          s.log.push({ round: s.round, power: 'usa', text: `${combatantName(actor)} completes combat. ${combatantName(operatingPower(s)!)} now conducts combat.` });
          return OK;
        }
        const emergencyLandings = activateDefendingCarrierLandingQueue(
          s,
          idx,
          s.usaOperationFirst ?? actor,
        );
        if (emergencyLandings) return emergencyLandings;
        s.phase = 'noncombat';
        s.usaOperationIndex = 0;
        s.log.push({ round: s.round, power: 'usa', text: `${combatantName(operatingPower(s)!)} begins its separate noncombat movement.` });
        return OK;
      }
      if (hasCombatLoadCommitment(s, power)) {
        return err('Every unit loaded during Combat Move must complete its amphibious assault before combat ends.');
      }
      {
        const unresolved = unresolvedSharedHostileSeaZones(s, idx, power);
        if (unresolved.length > 0) {
          return err(`Resolve battle or explicitly move every still-available active-power hull and loose aircraft out of shared hostile sea zone${unresolved.length === 1 ? '' : 's'} ${unresolved.join(', ')}.`);
        }
      }
      {
        const emergencyLandings = activateDefendingCarrierLandingQueue(s, idx, power);
        if (emergencyLandings) return emergencyLandings;
      }
      clearCombatAircraftForNoncombat(s, power);
      s.phase = 'noncombat';
      return OK;
    case 'battle':
      return err('Resolve the battle first.');
    case 'noncombat':
      if (power === 'usa') {
        const actor = operatingPower(s);
        if (!actor) return err('The USA/China operation order is missing.');
        destroyStrandedAircraft(s, idx, actor);
        if (s.usaOperationIndex === 0) {
          s.usaOperationIndex = 1;
          s.log.push({ round: s.round, power: 'usa', text: `${combatantName(actor)} completes noncombat movement. ${combatantName(operatingPower(s)!)} now repositions.` });
          return OK;
        }
        enterMobilize(s, idx);
        return OK;
      }
      destroyStrandedAircraft(s, idx, power);
      if (s.powers[power].capitalHeldBy != null) {
        // A non-USA power without its capital has no Mobilize or Collect
        // Income phase. (USA still enters a China-only mobilization below.)
        recordOccupiedCapitalIncomeSkip(s, power);
        advanceTurn(s, idx);
        return OK;
      }
      enterMobilize(s, idx);
      return OK;
    case 'mobilize': {
      const outstanding = summarizeAxisCarrierOutstanding({
        obligations: s.newCarrierLandingObligations,
        liveTags: collectLiveCarrierTags(s),
        decks: carrierDeckSnapshotsForRows(s, s.newCarrierLandingObligations),
      });
      if (outstanding.hasOutstanding) {
        const first = outstanding.summaries[0];
        if (first) {
          const factories = first.carrierFactories.length > 0
            ? ` from ${first.carrierFactories.join(', ')}`
            : '';
          return err(`Mobilize ${first.requiredNewCarriers} required carrier${first.requiredNewCarriers === 1 ? '' : 's'} in ${first.seaZone}${factories} before ending the turn.`);
        }
        return err('Resolve the orphaned fighter carrier landing before ending the turn.');
      }
      const placement = firstLegalPendingMobilization(s, idx);
      if (placement === 'china') {
        return err(`Place China's ${s.chinaGrant} remaining infantry before ending the turn.`);
      }
      if (placement === 'regular') {
        return err('Place every staged unit that still has a legal mobilization destination before ending the turn. Units with no legal capacity may carry over.');
      }
      // mobilize and collect income are ONE stage (owner directive): ending
      // the turn collects income and hands play to the next power. The TV
      // shows the production screen as a timed overlay.
      if (s.powers[power].capitalHeldBy != null) recordOccupiedCapitalIncomeSkip(s, power);
      else collectIncome(s, idx);
      advanceTurn(s, idx);
      return OK;
    }
    case 'income': // legacy: mobilize now collects income itself
      return err('Income is collected when mobilization ends.');
    default:
      return err('Game over.');
  }
}

// ---------- dispatcher ----------

export function applyAxisAction(s: AxisState, idx: MapIndex, seat: PowerKey, action: AxisAction): ActionResult {
  if (s.phase === 'gameOver') return err('The game is over.');
  const invalid = validateAxisAction(action);
  if (invalid) return invalid;
  if (s.defendingCarrierLanding && action.type !== 'defendingCarrierLanding') {
    return err('Resolve every defending carrier fighter before ordinary noncombat movement.');
  }
  if (action.type === 'defendingCarrierLanding') {
    const queue = s.defendingCarrierLanding;
    if (!queue) return err('No defending carrier fighter is waiting to land.');
    const progress = deriveAxisDefendingCarrierLandingProgress(queue.snapshot, queue.choices);
    if (!progress.ok || progress.status !== 'decision' || !progress.decision) {
      return err(progress.ok ? 'The defending carrier landing queue is complete.' : progress.error);
    }
    if (seat !== progress.decision.owner) return err('Only the exact fighter owner may choose its landing.');
    const result = actDefendingCarrierLanding(s, action);
    if (result.ok) reconcileCarrierLandingObligations(s, idx);
    return result;
  }
  prepareChinaGrant(s, idx);
  const active = activePower(s);
  // battle decisions may belong to the defender; everything else to the active power
  const battleDecisionSeat = s.pendings.find((p) => p.kind.startsWith('battle-') && p.kind !== 'battle-continue')?.power;
  const battleDecisionController = battleDecisionSeat === 'china' ? 'usa' : battleDecisionSeat;
  const isBattleDecision = action.type === 'battleCasualties' || action.type === 'battleSubmerge' || action.type === 'battleRetreat';
  if (action.type === 'battleContinue') {
    const result = actBattleContinue(s, seat, action);
    if (result.ok) reconcileCarrierLandingObligations(s, idx);
    return result;
  }
  if (isBattleDecision) {
    if (seat !== battleDecisionController) return err('Not your decision.');
  } else if (seat !== active) {
    return err(`It is ${POWERS[active].name}'s turn.`);
  }

  let result: ActionResult;
  switch (action.type) {
    case 'buyResearch': result = actBuyResearch(s, idx, action.dice); break;
    case 'chooseChart': result = actChooseChart(s, action.chart); break;
    case 'buy': result = actBuy(s, action.key, action.count); break;
    case 'unbuy': result = actUnbuy(s, action.key, action.count); break;
    case 'repair': result = actRepair(s, idx, action.territory, action.count); break;
    case 'chooseUsOperationOrder': result = actChooseUsOperationOrder(s, action.first); break;
    case 'attack': result = actAttack(s, idx, action); break;
    case 'sbr': result = actSbr(s, idx, action); break;
    case 'rocketStrike': result = actRocketStrike(s, idx, action); break;
    case 'battleRoll': result = actBattleRoll(s, action); break;
    case 'battleCasualties': result = actBattleCasualties(s, action.uids, action); break;
    case 'battleSubmerge': result = actBattleSubmerge(s, action.uids, action); break;
    case 'battleRetreat': result = actBattleRetreat(s, idx, action); break;
    case 'move': result = actMove(s, idx, action); break;
    case 'load': result = actLoad(s, idx, action); break;
    case 'offload': result = actOffload(s, idx, action); break;
    case 'place': result = actPlace(s, idx, action); break;
    case 'placeChina': result = actPlaceChina(s, idx, action.space); break;
    case 'placeBatch': result = actPlaceBatch(s, idx, action); break;
    case 'endPhase': result = actEndPhase(s, idx); break;
    default: result = err('Unknown action.');
  }
  if (result.ok) reconcileCarrierLandingObligations(s, idx);
  return result;
}

export { CAN_CAPTURE, TECH_BY_KEY };
