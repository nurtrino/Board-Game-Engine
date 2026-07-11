import {
  FEAST_ACTION_BY_ID, FEAST_GOOD_BY_ID, FEAST_GOOD_IDS,
} from './data.js';
import {
  FEAST_OCCUPATION_RULE_LIST,
  type FeastOccupationAction,
  type FeastOccupationClause,
  type FeastOccupationEvent,
  type FeastOccupationHook,
  type FeastOccupationItem,
  type FeastOccupationItemId,
  type FeastOccupationLimit,
  type FeastOccupationOperation,
  type FeastOccupationPredicate,
  type FeastOccupationQuantity,
  type FeastOccupationRule,
  type FeastOccupationRuleId,
  type FeastOccupationTrigger,
  type FeastRuleComparator,
  type FeastRuleMetric,
  type FeastRuleRecord,
  type FeastRuleValue,
} from './occupationRules.js';
import { feastIncomeForBoard } from './placement.js';
import type {
  FeastBuildingResource, FeastBuildingType, FeastGood, FeastPlayer,
  FeastShipType, FeastState, FeastWeapon,
} from './types.js';

/**
 * Pure occupation execution/planning for the classic 190-card registry.
 *
 * This module deliberately does not mutate FeastState and never accepts a
 * free-form operation. The reducer owns randomness, ids and state changes;
 * this runtime decides which typed clause applies, resolves quantities,
 * validates inventory/supply targets and describes the bounded next step.
 */

export type FeastOccupationEventFields = Readonly<Record<string, FeastRuleValue | undefined>>;

export interface FeastOccupationEventContext {
  /** Seat whose played cards are evaluated. `fields.seat` remains supported. */
  seat?: number;
  hook: FeastOccupationHook;
  event: FeastOccupationEvent;
  window: FeastOccupationTrigger['window'];
  /** Typed registry event facts: printedCost, action, success, pieceId, etc. */
  fields: FeastOccupationEventFields;
  /** Defaults to state.round while planning; exposed for standalone limit keys. */
  round?: number;
  /** Stable reducer ids are required to enforce once-per-action/event limits. */
  actionId?: string;
  eventId?: string;
  /** For card-played, limits evaluation to the card which was just played. */
  cardId?: string;
  /** Named immutable player snapshots, currently used by phase-start metrics. */
  snapshots?: Readonly<Record<string, FeastPlayer>>;
  /** Supply facts not represented in FeastState can be injected explicitly. */
  available?: Readonly<Record<string, number | boolean>>;
  /** Item quantities explicitly committed to an optional die modifier. */
  payments?: Readonly<Record<string, number>>;
  /** Optional clauses only affect aggregate modifier values after activation. */
  activatedClauseIds?: readonly string[];
}

export interface FeastOccupationUsageRecord {
  key: string;
  cardId: FeastOccupationRuleId;
  clauseId: string;
  limit: FeastOccupationLimit;
  round: number;
  actionId?: string;
  eventId?: string;
}

export interface FeastOccupationUsageProvenance {
  records: readonly FeastOccupationUsageRecord[];
}

export const EMPTY_FEAST_OCCUPATION_USAGE: FeastOccupationUsageProvenance = Object.freeze({ records: [] });

export interface FeastOccupationPlanIssue {
  code: 'inventory' | 'supply' | 'target' | 'selection' | 'limit' | 'context';
  path: string;
  message: string;
}

export interface FeastOccupationResolvedItem {
  item: FeastOccupationItemId;
  id?: string;
  quantity: number;
  state?: FeastRuleRecord;
  /** Number currently owned when this item is used as a payment/source. */
  owned: number;
  /** Number currently available when this item is gained from a finite supply. */
  available: number | null;
  needsSelection: boolean;
}

export interface FeastOccupationInventoryDelta {
  item: FeastOccupationItemId;
  id?: string;
  amount: number;
  mode: 'gain' | 'pay' | 'discard' | 'return';
  source?: string;
  destination?: string;
}

export type FeastOccupationOperationDisposition =
  | 'automatic' | 'prompt' | 'deferred' | 'modifier' | 'replacement';

interface FeastOccupationPlannedOperationBase {
  path: string;
  disposition: FeastOccupationOperationDisposition;
  valid: boolean;
  issues: readonly FeastOccupationPlanIssue[];
  automaticDeltas: readonly FeastOccupationInventoryDelta[];
}

export interface FeastOccupationChoiceOptionPlan {
  id: string;
  operations: readonly FeastOccupationPlannedOperation[];
  valid: boolean;
  issues: readonly FeastOccupationPlanIssue[];
}

export type FeastOccupationPlannedOperation =
  | (FeastOccupationPlannedOperationBase & {
    kind: 'transfer'; operation: Extract<FeastOccupationOperation, { kind: 'transfer' }>;
    items: readonly FeastOccupationResolvedItem[];
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'exchange'; operation: Extract<FeastOccupationOperation, { kind: 'exchange' }>;
    from: readonly FeastOccupationResolvedItem[];
    to: readonly FeastOccupationResolvedItem[];
    maximumRepeats: number;
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'choice'; operation: Extract<FeastOccupationOperation, { kind: 'choice' }>;
    min: number; max: number; options: readonly FeastOccupationChoiceOptionPlan[];
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'discount'; operation: Extract<FeastOccupationOperation, { kind: 'discount' }>;
    amount: number;
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'modify-die'; operation: Extract<FeastOccupationOperation, { kind: 'modify-die' }>;
    per?: FeastOccupationResolvedItem;
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'draw-weapons'; operation: Extract<FeastOccupationOperation, { kind: 'draw-weapons' }>;
    quantity: number;
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'grant-action'; operation: Extract<FeastOccupationOperation, { kind: 'grant-action' }>;
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'replace'; operation: Extract<FeastOccupationOperation, { kind: 'replace' }>;
    replacement: readonly FeastOccupationPlannedOperation[];
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'modify-rule'; operation: Extract<FeastOccupationOperation, { kind: 'modify-rule' }>;
    value: FeastRuleValue;
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'move'; operation: Extract<FeastOccupationOperation, { kind: 'move' }>;
    subject: FeastOccupationResolvedItem;
    /** Reducer-derived physical target for moves tied to the resolving ship. */
    boundTarget?: string;
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'return-workers'; operation: Extract<FeastOccupationOperation, { kind: 'return-workers' }>;
    quantity: number; actionSpaceIds?: readonly string[];
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'phase'; operation: Extract<FeastOccupationOperation, { kind: 'phase' }>;
  })
  | (FeastOccupationPlannedOperationBase & {
    kind: 'score'; operation: Extract<FeastOccupationOperation, { kind: 'score' }>;
    amount: number;
  });

export interface FeastOccupationPlan {
  cardId: FeastOccupationRuleId;
  cardNumber: number;
  cardName: string;
  clauseId: string;
  trigger: FeastOccupationTrigger;
  requirement: FeastOccupationClause['requirement'];
  limit: FeastOccupationLimit;
  usage: FeastOccupationUsageRecord;
  kind: 'automatic' | 'choice' | 'action' | 'replacement' | 'modifier' | 'compound';
  /** True only when the reducer may apply all deltas without user input/RNG. */
  automatic: boolean;
  requiresConfirmation: boolean;
  valid: boolean;
  issues: readonly FeastOccupationPlanIssue[];
  operations: readonly FeastOccupationPlannedOperation[];
  automaticDeltas: readonly FeastOccupationInventoryDelta[];
}

export interface FeastOccupationPlanningResult {
  context: FeastOccupationEventContext;
  plans: readonly FeastOccupationPlan[];
  automatic: readonly FeastOccupationPlan[];
  prompts: readonly FeastOccupationPlan[];
  modifiers: readonly FeastOccupationPlan[];
  replacements: readonly FeastOccupationPlan[];
}

export interface FeastOccupationSelection {
  accepted: boolean;
  /** Choice ids keyed by planned operation path. `optionIds` is a top-level convenience. */
  choices?: Readonly<Record<string, readonly string[]>>;
  optionIds?: readonly string[];
  repeats?: Readonly<Record<string, number>>;
  /** Concrete board/ship/space/etc. ids keyed by planned operation path. */
  targets?: Readonly<Record<string, string | number | readonly string[]>>;
}

export interface FeastOccupationActionModifiers {
  candidates: readonly FeastOccupationPlan[];
  silverDiscount: number;
  silverFloor: number;
  stoneDiscount: number;
  stoneFloor: number;
  effectiveSilverCost: number | null;
  effectiveStoneCost: number | null;
  workerCost: number | null;
  eligibility: readonly FeastRuleValue[];
}

export interface FeastOccupationDiePaymentModifier {
  cardId: FeastOccupationRuleId;
  clauseId: string;
  item: FeastOccupationItemId;
  value: number;
  available: number;
  replacesNormalSpendValue: boolean;
  replacesNormalWeaponValue: boolean;
  active: boolean;
}

export interface FeastOccupationDieModifiers {
  candidates: readonly FeastOccupationPlan[];
  delta: number;
  rollLimit: number | null;
  payments: readonly FeastOccupationDiePaymentModifier[];
  everyRollClauseIds: readonly string[];
}

export interface FeastOccupationLootRuleEffect {
  cardId: FeastOccupationRuleId;
  clauseId: string;
  rule: Extract<FeastOccupationOperation, { kind: 'modify-rule' }>['rule'];
  value: FeastRuleValue;
  parameters?: FeastRuleRecord;
  active: boolean;
}

export interface FeastOccupationLootModifiers {
  candidates: readonly FeastOccupationPlan[];
  maxTiles: number;
  lootColor: FeastRuleValue | null;
  weaponSubstitutions: readonly FeastRuleValue[];
  swordValueDelta: number;
  effects: readonly FeastOccupationLootRuleEffect[];
}

export interface FeastOccupationScoringModifier {
  cardId: FeastOccupationRuleId;
  clauseId: string;
  currency: 'points' | 'silver';
  amount: number;
}

const RESOURCE_IDS = new Set<FeastBuildingResource>(['wood', 'stone', 'ore']);
const WEAPON_IDS = new Set<FeastWeapon>(['bow', 'snare', 'spear', 'long-sword']);
const SHIP_IDS = new Set<FeastShipType>(['whaling-boat', 'knarr', 'longship']);
const BUILDING_IDS = new Set<FeastBuildingType>(['shed', 'stone-house', 'long-house']);
const GOOD_IDS = new Set<FeastGood>(FEAST_GOOD_IDS);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function compareRuleValues(left: unknown, comparator: FeastRuleComparator, right: FeastRuleValue): boolean {
  switch (comparator) {
    case 'eq': return deepEqual(left, right);
    case 'neq': return !deepEqual(left, right);
    case 'lt': return typeof left === 'number' && typeof right === 'number' && left < right;
    case 'lte': return typeof left === 'number' && typeof right === 'number' && left <= right;
    case 'gt': return typeof left === 'number' && typeof right === 'number' && left > right;
    case 'gte': return typeof left === 'number' && typeof right === 'number' && left >= right;
    case 'in': return Array.isArray(right) && right.some((entry) => deepEqual(entry, left));
    case 'contains':
      if (Array.isArray(left)) return left.some((entry) => deepEqual(entry, right));
      if (typeof left === 'string' && typeof right === 'string') return left.includes(right);
      // Registry card 31 uses a numeric metric with `contains 3` to mean a
      // matching type exists at exactly three; metric resolution returns 3.
      return deepEqual(left, right);
  }
}

function filterValueMatches(actual: unknown, expected: FeastRuleValue): boolean {
  if (Array.isArray(expected)) {
    if (Array.isArray(actual)) return expected.every((entry) => actual.some((candidate) => deepEqual(candidate, entry)));
    return expected.some((entry) => deepEqual(entry, actual));
  }
  return deepEqual(actual, expected);
}

function recordMatches(filter: FeastRuleRecord | undefined, context: FeastOccupationEventContext): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, expected]) => filterValueMatches(context.fields[key], expected));
}

export function feastOccupationMatchesTrigger(
  trigger: FeastOccupationTrigger, context: FeastOccupationEventContext,
): boolean {
  return trigger.hook === context.hook
    && trigger.event === context.event
    && trigger.window === context.window
    && recordMatches(trigger.filter, context);
}

function snapshotPlayer(player: FeastPlayer, filter: FeastRuleRecord | undefined, context?: FeastOccupationEventContext): FeastPlayer {
  const snapshot = typeof filter?.snapshot === 'string' ? filter.snapshot : null;
  return (snapshot && context?.snapshots?.[snapshot]) || player;
}

function goodIdsForFilter(filter: FeastRuleRecord | undefined): FeastGood[] {
  const withoutAnimals = (ids: FeastGood[]): FeastGood[] => filter?.excludeAnimals === true ? ids.filter((id) => !FEAST_GOOD_BY_ID[id].animal) : ids;
  if (typeof filter?.id === 'string' && GOOD_IDS.has(filter.id as FeastGood)) return withoutAnimals([filter.id as FeastGood]);
  if (Array.isArray(filter?.ids)) return withoutAnimals(filter.ids.filter((id): id is FeastGood => typeof id === 'string' && GOOD_IDS.has(id as FeastGood)));
  if (typeof filter?.animal === 'string') {
    const normal = filter.animal as 'sheep' | 'cattle';
    const ids: FeastGood[] = [normal];
    if (filter.includePregnant === true) ids.push(`pregnant-${normal}` as FeastGood);
    return withoutAnimals(ids);
  }
  if (typeof filter?.color === 'string') return withoutAnimals(FEAST_GOOD_IDS.filter((id) => FEAST_GOOD_BY_ID[id].color === filter.color));
  return withoutAnimals([...FEAST_GOOD_IDS]);
}

function goodsOnBoards(player: FeastPlayer, ids: readonly FeastGood[]): number {
  return player.boards.reduce((total, board) => total + board.placements.reduce((n, placement) =>
    n + (placement.pieceKind === 'good' && ids.includes(placement.pieceId as FeastGood) ? 1 : 0), 0), 0);
}

function goodsMetric(player: FeastPlayer, filter: FeastRuleRecord | undefined): number {
  const ids = goodIdsForFilter(filter);
  if (filter?.someTypeExactly !== undefined && typeof filter.someTypeExactly === 'number') {
    return ids.some((id) => player.goods[id] === filter.someTypeExactly) ? filter.someTypeExactly : 0;
  }
  if (Array.isArray(filter?.pairedIds)) {
    const paired = filter.pairedIds.filter((id): id is FeastGood => typeof id === 'string' && GOOD_IDS.has(id as FeastGood));
    return paired.length ? Math.min(...paired.map((id) => player.goods[id])) : 0;
  }
  const locations = Array.isArray(filter?.locations) ? filter.locations : filter?.location ? [filter.location] : ['supply', 'stable'];
  const inventory = ids.map((id) => ({ id, count: player.goods[id] }));
  if (filter?.distinctAnimalTypes === true) {
    const sheep = player.goods.sheep + player.goods['pregnant-sheep'];
    const cattle = player.goods.cattle + player.goods['pregnant-cattle'];
    return Number(sheep > 0) + Number(cattle > 0);
  }
  if (filter?.distinctTypes === true) {
    if (filter.mergePregnancy === true) {
      const merged = new Map<string, number>();
      for (const entry of inventory) {
        const id = entry.id === 'pregnant-sheep' ? 'sheep' : entry.id === 'pregnant-cattle' ? 'cattle' : entry.id;
        merged.set(id, (merged.get(id) ?? 0) + entry.count);
      }
      return [...merged.values()].filter((count) => count > 0).length;
    }
    return inventory.filter((entry) => entry.count > 0).length;
  }
  let total = locations.some((location) => location === 'supply' || location === 'stable')
    ? inventory.reduce((sum, entry) => sum + entry.count, 0) : 0;
  if (locations.includes('boards')) total += goodsOnBoards(player, ids);
  return total;
}

function activeShips(player: FeastPlayer): FeastPlayer['ships'] {
  return player.ships.filter((ship) => !ship.emigrated);
}

function shipsMetric(player: FeastPlayer, filter: FeastRuleRecord | undefined): number {
  const ships = activeShips(player);
  if (Array.isArray(filter?.completeSets)) {
    const types = filter.completeSets.filter((type): type is FeastShipType => typeof type === 'string' && SHIP_IDS.has(type as FeastShipType));
    return types.length ? Math.min(...types.map((type) => ships.filter((ship) => ship.type === type).length)) : 0;
  }
  return ships.filter((ship) =>
    (typeof filter?.type !== 'string' || ship.type === filter.type)
    && (typeof filter?.oreAtLeast !== 'number' || ship.ore >= filter.oreAtLeast)
  ).length;
}

function workersOnSpaces(state: FeastState, seat: number, filter: FeastRuleRecord | undefined): number {
  const player = state.players[seat];
  const currentSoloColor = filter?.countCurrentWorkers === true && state.players.length === 1
    ? player.activeWorkerColor : null;
  return state.actionSpaces.reduce((total, space) => {
    const def = FEAST_ACTION_BY_ID[space.id];
    if (typeof filter?.actionSpaceId === 'string' && space.id !== filter.actionSpaceId) return total;
    if (typeof filter?.column === 'number' && def?.column !== filter.column) return total;
    if (typeof filter?.group === 'string' && def?.group !== filter.group) return total;
    const occupants = space.occupants.filter((occupant) => occupant.seat === seat
      && (currentSoloColor === null || occupant.workerColor === currentSoloColor));
    return total + occupants.reduce((sum, occupant) => sum + (filter?.onePerOccupiedSpace === true ? 1 : occupant.workers), 0);
  }, 0);
}

function eventMetric(metric: FeastRuleMetric, context?: FeastOccupationEventContext): number {
  const fields = context?.fields ?? {};
  const aliases: Partial<Record<FeastRuleMetric, string[]>> = {
    'event-amount': ['amount', 'batchAmount', 'selectedAmount'],
    'event-cost': ['cost', 'printedCost', 'printedSilverCost'],
    'event-roll': ['roll', 'result'],
    'event-workers': ['workers'],
    'event-distinct-types': ['distinctTypes', 'distinctBuildingResourceTypesPaid', 'distinctMountainItemTypes'],
    'event-items': ['items', 'itemCount'],
  };
  for (const key of aliases[metric] ?? []) {
    const value = fields[key];
    if (typeof value === 'number') return value;
    if (Array.isArray(value)) return metric === 'event-distinct-types' ? new Set(value.map(String)).size : value.length;
  }
  return 0;
}

export function feastOccupationMetric(
  state: FeastState, seat: number, metric: FeastRuleMetric,
  filter?: FeastRuleRecord, context?: FeastOccupationEventContext,
): number {
  const current = state.players[seat];
  if (!current) return 0;
  const player = snapshotPlayer(current, filter, context);
  switch (metric) {
    case 'silver': return player.silver;
    case 'round': return state.round;
    case 'player-count': return state.players.length;
    case 'income': return player.boards.reduce((sum, board) => sum + feastIncomeForBoard(board), 0);
    case 'goods': return goodsMetric(player, filter);
    case 'resources':
      return typeof filter?.id === 'string' && RESOURCE_IDS.has(filter.id as FeastBuildingResource)
        ? player.resources[filter.id as FeastBuildingResource]
        : Object.values(player.resources).reduce((sum, value) => sum + value, 0);
    case 'weapons':
      return typeof filter?.id === 'string' && WEAPON_IDS.has(filter.id as FeastWeapon)
        ? player.weapons[filter.id as FeastWeapon]
        : Object.values(player.weapons).reduce((sum, value) => sum + value, 0);
    case 'ships': return shipsMetric(player, filter);
    case 'large-ships': return activeShips(player).filter((ship) => ship.type === 'knarr' || ship.type === 'longship').length;
    case 'houses': {
      const types = Array.isArray(filter?.types) ? filter.types.filter((type): type is FeastBuildingType => typeof type === 'string' && BUILDING_IDS.has(type as FeastBuildingType)) : null;
      return player.boards.filter((board) => board.kind === 'building' && (!types || types.includes(board.definitionId as FeastBuildingType))).length;
    }
    case 'special-tiles': return player.specials.length;
    case 'exploration-boards': return player.boards.filter((board) => board.kind === 'exploration').length;
    case 'workers-on-spaces': return workersOnSpaces(state, seat, filter);
    case 'workers-in-thing': return player.workersAvailable;
    case 'ore-on-ships': {
      const types = Array.isArray(filter?.shipTypes) ? filter.shipTypes.filter((type): type is FeastShipType => typeof type === 'string' && SHIP_IDS.has(type as FeastShipType)) : null;
      return activeShips(player).filter((ship) => !types || types.includes(ship.type)).reduce((sum, ship) => sum + ship.ore, 0);
    }
    case 'empty-berths': {
      const small = activeShips(player).filter((ship) => ship.type === 'whaling-boat').length;
      const large = activeShips(player).filter((ship) => ship.type !== 'whaling-boat').length;
      if (filter?.berth === 'small') return Math.max(0, 3 - small);
      if (filter?.berth === 'large') return Math.max(0, 4 - large);
      return Math.max(0, 3 - small) + Math.max(0, 4 - large);
    }
    case 'event-amount': case 'event-cost': case 'event-roll': case 'event-workers':
    case 'event-distinct-types': case 'event-items': return eventMetric(metric, context);
  }
}

function availableCount(state: FeastState, subject: string, context?: FeastOccupationEventContext): number {
  const supplied = context?.available?.[subject];
  if (typeof supplied === 'number') return supplied;
  if (typeof supplied === 'boolean') return supplied ? 1 : 0;
  if (BUILDING_IDS.has(subject as FeastBuildingType)) return state.buildingSupply[subject as FeastBuildingType];
  if (state.specialSupply.includes(subject)) return 1;
  const exploration = state.explorations.filter((entry) => entry.claimedBy === null && (entry.face === subject || entry.boardId === subject)).length;
  if (exploration) return exploration;
  return 0;
}

export function feastOccupationPredicateMatches(
  state: FeastState, seat: number, predicate: FeastOccupationPredicate,
  context?: FeastOccupationEventContext,
): boolean {
  switch (predicate.kind) {
    case 'metric': return compareRuleValues(feastOccupationMetric(state, seat, predicate.metric, predicate.filter, context), predicate.comparator, predicate.value);
    case 'event': return compareRuleValues(context?.fields[predicate.field], predicate.comparator, predicate.value);
    case 'available': {
      const count = availableCount(state, predicate.subject, context);
      const value = predicate.value ?? 1;
      return predicate.comparator === 'eq' ? count === value : count >= value;
    }
    case 'all': return predicate.terms.every((term) => feastOccupationPredicateMatches(state, seat, term, context));
    case 'any': return predicate.terms.some((term) => feastOccupationPredicateMatches(state, seat, term, context));
    case 'not': return !feastOccupationPredicateMatches(state, seat, predicate.term, context);
  }
}

export function feastOccupationQuantity(
  state: FeastState, seat: number, quantity: FeastOccupationQuantity,
  context?: FeastOccupationEventContext,
): number {
  if (typeof quantity === 'number') return Math.max(0, Math.floor(quantity));
  let value = 0;
  switch (quantity.kind) {
    case 'count':
      value = feastOccupationMetric(state, seat, quantity.metric, quantity.filter, context) * (quantity.multiplier ?? 1);
      if (typeof quantity.filter?.cap === 'number') value = Math.min(value, quantity.filter.cap);
      if (quantity.cap !== undefined) value = Math.min(value, quantity.cap);
      break;
    case 'tier': {
      const metric = feastOccupationMetric(state, seat, quantity.metric, quantity.filter, context);
      value = quantity.default;
      for (const tier of quantity.tiers) {
        const match = (tier.exactly === undefined || metric === tier.exactly)
          && (tier.atLeast === undefined || metric >= tier.atLeast)
          && (tier.atMost === undefined || metric <= tier.atMost);
        if (match) value = tier.value;
      }
      break;
    }
    case 'event': {
      const raw = context?.fields[quantity.field];
      value = (typeof raw === 'number' ? raw : 0) * (quantity.multiplier ?? 1);
      if (quantity.cap !== undefined) value = Math.min(value, quantity.cap);
      break;
    }
    case 'round': value = Math.max(quantity.floor ?? 0, state.round + (quantity.offset ?? 0)); break;
    case 'player-count': value = state.players.length + quantity.offset; break;
  }
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function feastOccupationUsageKey(
  cardId: FeastOccupationRuleId, clause: FeastOccupationClause,
  context: FeastOccupationEventContext,
): string {
  const sharedCardLatch = clause.limit === 'once-per-card'
    && (cardId === 'occupation-180' || cardId === 'occupation-181');
  const base = sharedCardLatch ? `${cardId}:threshold-tier` : `${cardId}:${clause.id}`;
  switch (clause.limit) {
    case 'once-per-card': return `${base}:card`;
    case 'once-per-round': return `${base}:round:${context.round ?? context.fields.round ?? 'missing'}`;
    case 'once-per-action': return `${base}:action:${context.actionId ?? context.eventId ?? 'missing'}`;
    case 'once-per-event': return `${base}:event:${context.eventId ?? context.actionId ?? 'missing'}`;
    case 'unlimited': return `${base}:unlimited`;
  }
}

function usageRecord(
  state: FeastState, rule: FeastOccupationRule, clause: FeastOccupationClause,
  context: FeastOccupationEventContext,
): FeastOccupationUsageRecord {
  return {
    key: feastOccupationUsageKey(rule.id, clause, context), cardId: rule.id,
    clauseId: clause.id, limit: clause.limit, round: state.round,
    ...(context.actionId ? { actionId: context.actionId } : {}),
    ...(context.eventId ? { eventId: context.eventId } : {}),
  };
}

export function feastOccupationLimitAvailable(
  clause: FeastOccupationClause, context: FeastOccupationEventContext,
  usage: FeastOccupationUsageProvenance = EMPTY_FEAST_OCCUPATION_USAGE,
  cardId?: FeastOccupationRuleId,
): boolean {
  if (clause.limit === 'unlimited') return true;
  if (cardId) {
    const key = feastOccupationUsageKey(cardId, clause, context);
    return !usage.records.some((record) => record.key === key);
  }
  const round = context.round ?? (typeof context.fields.round === 'number' ? context.fields.round : undefined);
  return !usage.records.some((record) => {
    if (record.clauseId !== clause.id) return false;
    if (clause.limit === 'once-per-card') return true;
    if (clause.limit === 'once-per-round') return round !== undefined && record.round === round;
    if (clause.limit === 'once-per-action') return !!(context.actionId || context.eventId)
      && (record.actionId ?? record.eventId) === (context.actionId ?? context.eventId);
    return !!(context.eventId || context.actionId) && (record.eventId ?? record.actionId) === (context.eventId ?? context.actionId);
  });
}

function ownedItemCount(player: FeastPlayer, item: FeastOccupationItem): number {
  const id = item.id;
  if (item.item === 'silver') return player.silver;
  if (RESOURCE_IDS.has(item.item as FeastBuildingResource)) return player.resources[item.item as FeastBuildingResource];
  if (GOOD_IDS.has(item.item as FeastGood)) return player.goods[item.item as FeastGood];
  if (WEAPON_IDS.has(item.item as FeastWeapon)) return player.weapons[item.item as FeastWeapon];
  if (SHIP_IDS.has(item.item as FeastShipType)) return activeShips(player).filter((ship) => ship.type === item.item).length;
  if (BUILDING_IDS.has(item.item as FeastBuildingType)) return player.boards.filter((board) => board.definitionId === item.item).length;
  switch (item.item) {
    case 'weapon-card': return Object.values(player.weapons).reduce((sum, value) => sum + value, 0);
    case 'occupation-card': return player.occupationHand.length;
    case 'viking': return player.workersAvailable;
    case 'special-tile': return id ? Number(player.specials.includes(id)) : player.specials.length;
    case 'exploration-board': return id
      ? player.boards.filter((board) => board.kind === 'exploration' && board.definitionId === id).length
      : player.boards.filter((board) => board.kind === 'exploration').length;
    case 'good': return id && GOOD_IDS.has(id as FeastGood) ? player.goods[id as FeastGood] : Object.values(player.goods).reduce((sum, value) => sum + value, 0);
    case 'building-resource': return Object.values(player.resources).reduce((sum, value) => sum + value, 0);
    case 'ship': return activeShips(player).length;
    case 'house': return player.boards.filter((board) => board.kind === 'building').length;
    case 'farm-animal': {
      const animal = id === 'cattle' ? ['cattle', 'pregnant-cattle'] as const : id === 'sheep' ? ['sheep', 'pregnant-sheep'] as const : ['sheep', 'pregnant-sheep', 'cattle', 'pregnant-cattle'] as const;
      return animal.reduce((sum, good) => sum + player.goods[good], 0);
    }
    case 'bonus-good': return 0;
    default: return 0;
  }
}

function finiteGainAvailability(state: FeastState, player: FeastPlayer, item: FeastOccupationItem): number | null {
  if (item.item === 'special-tile') return item.id ? Number(state.specialSupply.includes(item.id)) : state.specialSupply.length;
  if (BUILDING_IDS.has(item.item as FeastBuildingType)) return state.buildingSupply[item.item as FeastBuildingType];
  if (item.item === 'exploration-board') return state.explorations.filter((entry) => entry.claimedBy === null && (!item.id || item.id === '$any-face-up' || entry.face === item.id || entry.boardId === item.id)).length;
  if (SHIP_IDS.has(item.item as FeastShipType)) {
    const small = activeShips(player).filter((ship) => ship.type === 'whaling-boat').length;
    const large = activeShips(player).filter((ship) => ship.type !== 'whaling-boat').length;
    return item.item === 'whaling-boat' ? Math.max(0, 3 - small) : Math.max(0, 4 - large);
  }
  if (item.item === 'occupation-card') return state.occupationDeck.length + state.occupationDiscard.length;
  return null;
}

function itemNeedsSelection(item: FeastOccupationItem): boolean {
  return item.item === 'good' || item.item === 'building-resource' || item.item === 'weapon-card'
    || item.item === 'occupation-card' || item.item === 'ship' || item.item === 'house'
    || item.item === 'farm-animal' || item.item === 'bonus-good'
    || item.id?.startsWith('$') === true || item.state?.anyTypes === true
    || item.state?.pregnancy === 'either';
}

function resolveItem(
  state: FeastState, seat: number, item: FeastOccupationItem,
  context?: FeastOccupationEventContext,
): FeastOccupationResolvedItem {
  const player = state.players[seat];
  return {
    item: item.item, ...(item.id ? { id: item.id } : {}),
    quantity: feastOccupationQuantity(state, seat, item.quantity, context),
    ...(item.state ? { state: item.state } : {}),
    owned: player ? ownedItemCount(player, item) : 0,
    available: player ? finiteGainAvailability(state, player, item) : 0,
    needsSelection: itemNeedsSelection(item),
  };
}

function issue(code: FeastOccupationPlanIssue['code'], path: string, message: string): FeastOccupationPlanIssue {
  return { code, path, message };
}

function sourceIssues(items: readonly FeastOccupationResolvedItem[], path: string): FeastOccupationPlanIssue[] {
  const issues: FeastOccupationPlanIssue[] = [];
  for (const [index, item] of items.entries()) {
    if (item.owned < item.quantity) issues.push(issue('inventory', `${path}.items[${index}]`, `Needs ${item.quantity} ${item.id ?? item.item}; only ${item.owned} available`));
  }
  return issues;
}

function gainIssues(items: readonly FeastOccupationResolvedItem[], path: string): FeastOccupationPlanIssue[] {
  const issues: FeastOccupationPlanIssue[] = [];
  for (const [index, item] of items.entries()) {
    if (item.available !== null && item.available < item.quantity) issues.push(issue('supply', `${path}.items[${index}]`, `Needs ${item.quantity} ${item.id ?? item.item}; only ${item.available} remains`));
  }
  return issues;
}

function deltasForTransfer(
  operation: Extract<FeastOccupationOperation, { kind: 'transfer' }>,
  items: readonly FeastOccupationResolvedItem[],
): FeastOccupationInventoryDelta[] {
  return items.filter((item) => !item.needsSelection && item.quantity > 0).map((item) => ({
    item: item.item, ...(item.id ? { id: item.id } : {}), amount: item.quantity,
    mode: operation.mode, ...(operation.source ? { source: operation.source } : {}),
    ...(operation.destination ? { destination: operation.destination } : {}),
  }));
}

function operationBase(
  path: string, disposition: FeastOccupationOperationDisposition,
  issues: readonly FeastOccupationPlanIssue[], automaticDeltas: readonly FeastOccupationInventoryDelta[] = [],
): FeastOccupationPlannedOperationBase {
  return { path, disposition, valid: issues.length === 0, issues, automaticDeltas };
}

function planOperations(
  state: FeastState, seat: number, operations: readonly FeastOccupationOperation[],
  context: FeastOccupationEventContext, prefix: string,
): FeastOccupationPlannedOperation[] {
  return operations.map((operation, index) => planOperation(state, seat, operation, context, `${prefix}.operations[${index}]`));
}

function aggregateIssues(operations: readonly FeastOccupationPlannedOperation[]): FeastOccupationPlanIssue[] {
  return operations.flatMap((operation) => operation.issues);
}

function planOperation(
  state: FeastState, seat: number, operation: FeastOccupationOperation,
  context: FeastOccupationEventContext, path: string,
): FeastOccupationPlannedOperation {
  switch (operation.kind) {
    case 'transfer': {
      const items = operation.items.map((item) => resolveItem(state, seat, item, context));
      const isGain = operation.mode === 'gain';
      const issues = isGain ? gainIssues(items, path) : sourceIssues(items, path);
      const destinationNeedsTarget = operation.destination === 'immediate-home-or-exploration-placement';
      const destinationIsDeferred = operation.destination === 'vacated-cloakpin-cells' || operation.destination === 'vacated-drinking-horn-cells';
      const prompt = destinationNeedsTarget || items.some((item) => item.needsSelection);
      const disposition: FeastOccupationOperationDisposition = prompt ? 'prompt' : destinationIsDeferred ? 'deferred' : 'automatic';
      const deltas = disposition === 'automatic' ? deltasForTransfer(operation, items) : [];
      return { kind: 'transfer', operation, items, ...operationBase(path, disposition, issues, deltas) };
    }
    case 'exchange': {
      const from = operation.from.map((item) => resolveItem(state, seat, item, context));
      const to = operation.to.map((item) => resolveItem(state, seat, item, context));
      const issues = [...sourceIssues(from, `${path}.from`), ...gainIssues(to, `${path}.to`)];
      const sourceRepeats = from.map((item) => item.quantity > 0 ? Math.floor(item.owned / item.quantity) : Number.MAX_SAFE_INTEGER);
      const targetRepeats = to.map((item) => item.available === null || item.quantity <= 0 ? Number.MAX_SAFE_INTEGER : Math.floor(item.available / item.quantity));
      const eventMax = typeof context.fields.amount === 'number' ? context.fields.amount : typeof context.fields.batchAmount === 'number' ? context.fields.batchAmount : Number.MAX_SAFE_INTEGER;
      const maximumRepeats = Math.max(0, Math.min(...sourceRepeats, ...targetRepeats, operation.repeat === 'up-to-event-amount' ? eventMax : Number.MAX_SAFE_INTEGER));
      const prompt = operation.repeat !== 'once' || from.some((item) => item.needsSelection) || to.some((item) => item.needsSelection);
      const disposition: FeastOccupationOperationDisposition = prompt ? 'prompt' : 'automatic';
      const automaticDeltas: FeastOccupationInventoryDelta[] = disposition === 'automatic' ? [
        ...from.map((item) => ({ item: item.item, ...(item.id ? { id: item.id } : {}), amount: item.quantity, mode: 'pay' as const })),
        ...to.map((item) => ({ item: item.item, ...(item.id ? { id: item.id } : {}), amount: item.quantity, mode: 'gain' as const })),
      ] : [];
      return { kind: 'exchange', operation, from, to, maximumRepeats, ...operationBase(path, disposition, issues, automaticDeltas) };
    }
    case 'choice': {
      const options = operation.options.map((option) => {
        const planned = planOperations(state, seat, option.operations, context, `${path}.options.${option.id}`);
        const issues = aggregateIssues(planned);
        return { id: option.id, operations: planned, valid: issues.length === 0, issues };
      });
      const validCount = options.filter((option) => option.valid).length;
      const issues = validCount < operation.min
        ? [issue('selection', path, `Choice requires ${operation.min}, but only ${validCount} option(s) are legal`)] : [];
      return { kind: 'choice', operation, min: operation.min, max: operation.max, options, ...operationBase(path, 'prompt', issues) };
    }
    case 'discount': {
      const amount = feastOccupationQuantity(state, seat, operation.amount, context);
      return { kind: 'discount', operation, amount, ...operationBase(path, 'modifier', []) };
    }
    case 'modify-die': {
      const per = operation.per ? resolveItem(state, seat, operation.per, context) : undefined;
      return { kind: 'modify-die', operation, ...(per ? { per } : {}), ...operationBase(path, 'modifier', []) };
    }
    case 'draw-weapons': {
      const quantity = feastOccupationQuantity(state, seat, operation.quantity, context);
      return { kind: 'draw-weapons', operation, quantity, ...operationBase(path, 'deferred', []) };
    }
    case 'grant-action':
      return { kind: 'grant-action', operation, ...operationBase(path, 'deferred', []) };
    case 'replace': {
      const replacement = planOperations(state, seat, operation.replacement, context, `${path}.replacement`);
      return { kind: 'replace', operation, replacement, ...operationBase(path, 'replacement', aggregateIssues(replacement)) };
    }
    case 'modify-rule':
      return { kind: 'modify-rule', operation, value: operation.value, ...operationBase(path, 'modifier', []) };
    case 'move': {
      const subject = resolveItem(state, seat, operation.subject, context);
      const issues: FeastOccupationPlanIssue[] = [];
      if (operation.from === 'supply') issues.push(...sourceIssues([subject], path));
      if (operation.from === 'whaling-boat-or-longship' && activeShips(state.players[seat]).filter((ship) => ship.type !== 'knarr').reduce((sum, ship) => sum + ship.ore, 0) < subject.quantity) {
        issues.push(issue('inventory', path, 'Not enough removable ore on a whaling boat or longship'));
      }
      if (operation.from === 'selected-raiding-longship' || operation.from === 'selected-pillaging-longship') {
        const shipId = context.fields.shipId;
        const ship = typeof shipId === 'string' ? state.players[seat].ships.find((candidate) => candidate.id === shipId) : null;
        if (typeof shipId !== 'string') issues.push(issue('context', path, 'The resolving longship is missing from the authoritative action context'));
        else if (!ship || ship.emigrated || ship.type !== 'longship' || ship.ore < subject.quantity) issues.push(issue('target', path, 'Selected longship cannot supply the required ore'));
      }
      if (operation.from === 'banquet-table') {
        const count = state.players[seat].feastPlacements.filter((placement) => placement.pieceId === operation.subject.item).length;
        if (count < subject.quantity) issues.push(issue('inventory', path, `Only ${count} matching Banquet Table tile(s) can move`));
      }
      if (operation.from === 'any-player-board' && operation.subject.id) {
        const exists = state.players.some((player) => player.boards.some((board) => board.placements.some((placement) => placement.pieceId === operation.subject.id)));
        if (!exists) issues.push(issue('target', path, `${operation.subject.id} is not on a player board`));
      }
      const targetBound = (operation.from === 'selected-raiding-longship' || operation.from === 'selected-pillaging-longship')
        && typeof context.fields.shipId === 'string';
      const deterministic = targetBound || (operation.from === 'supply' && operation.to === 'new-longship');
      const automaticDeltas: FeastOccupationInventoryDelta[] = operation.from === 'supply' && !subject.needsSelection && subject.quantity > 0
        ? [{ item: subject.item, ...(subject.id ? { id: subject.id } : {}), amount: subject.quantity, mode: 'pay', source: operation.from, destination: operation.to }]
        : [];
      return {
        kind: 'move', operation, subject,
        ...(targetBound ? { boundTarget: context.fields.shipId as string } : {}),
        ...operationBase(path, deterministic ? 'deferred' : 'prompt', issues, automaticDeltas),
      };
    }
    case 'return-workers': {
      const quantity = feastOccupationQuantity(state, seat, operation.quantity, context);
      const soloActiveColorOnly = operation.parameters.soloActiveColorOnly === true;
      const player = state.players[seat];
      const resolvedActionSpaceIds = operation.parameters.from === 'resolving-action-space'
        ? (typeof context.fields.actionSpaceId === 'string' ? [context.fields.actionSpaceId] : [])
        : operation.parameters.from === 'each-fourth-column-space'
          ? state.actionSpaces.filter((space) => FEAST_ACTION_BY_ID[space.id]?.column === 4
            && space.occupants.some((occupant) => occupant.seat === seat
              && (!soloActiveColorOnly || state.players.length !== 1
                || occupant.workerColor === player.activeWorkerColor))).map((space) => space.id)
          : undefined;
      const available = resolvedActionSpaceIds
        ? resolvedActionSpaceIds.reduce((sum, id) => sum + workersOnSpaces(state, seat, {
          actionSpaceId: id, ...(soloActiveColorOnly ? { countCurrentWorkers: true } : {}),
        }), 0)
        : workersOnSpaces(state, seat, soloActiveColorOnly ? { countCurrentWorkers: true } : undefined);
      const issues = available < quantity ? [issue('inventory', path, `Only ${available} worker(s) are on action spaces`)] : [];
      const deterministic = operation.parameters.from === 'resolving-action-space' || operation.parameters.from === 'each-fourth-column-space';
      return {
        kind: 'return-workers', operation, quantity,
        ...(resolvedActionSpaceIds ? { actionSpaceIds: resolvedActionSpaceIds } : {}),
        ...operationBase(path, deterministic ? 'deferred' : 'prompt', issues),
      };
    }
    case 'phase':
      return { kind: 'phase', operation, ...operationBase(path, 'deferred', []) };
    case 'score': {
      const amount = feastOccupationQuantity(state, seat, operation.amount, context);
      return { kind: 'score', operation, amount, ...operationBase(path, 'modifier', []) };
    }
  }
}

function planKind(operations: readonly FeastOccupationPlannedOperation[]): FeastOccupationPlan['kind'] {
  const dispositions = new Set(operations.map((operation) => operation.disposition));
  if (dispositions.size > 1) return 'compound';
  if (dispositions.has('prompt')) return 'choice';
  if (dispositions.has('deferred')) return 'action';
  if (dispositions.has('replacement')) return 'replacement';
  if (dispositions.has('modifier')) return 'modifier';
  return 'automatic';
}

export function feastPlanOccupationClause(
  state: FeastState, seat: number, rule: FeastOccupationRule, clause: FeastOccupationClause,
  context: FeastOccupationEventContext,
  usage: FeastOccupationUsageProvenance = EMPTY_FEAST_OCCUPATION_USAGE,
): FeastOccupationPlan | null {
  const scoped = context.round === undefined ? { ...context, round: state.round } : context;
  const trigger = clause.triggers.find((candidate) => feastOccupationMatchesTrigger(candidate, scoped));
  if (!trigger) return null;
  if (clause.condition && !feastOccupationPredicateMatches(state, seat, clause.condition, scoped)) return null;
  if (!feastOccupationLimitAvailable(clause, scoped, usage, rule.id)) return null;
  const operations = planOperations(state, seat, clause.operations, scoped, `${rule.id}.${clause.id}`);
  const issues = aggregateIssues(operations);
  const kind = planKind(operations);
  const requiresConfirmation = clause.requirement !== 'mandatory' || kind === 'choice' || kind === 'replacement';
  const automatic = !requiresConfirmation && kind === 'automatic' && issues.length === 0;
  return {
    cardId: rule.id, cardNumber: rule.number, cardName: rule.name,
    clauseId: clause.id, trigger, requirement: clause.requirement, limit: clause.limit,
    usage: usageRecord(state, rule, clause, scoped), kind, automatic,
    requiresConfirmation, valid: issues.length === 0, issues, operations,
    automaticDeltas: automatic ? operations.flatMap((operation) => operation.automaticDeltas) : [],
  };
}

export function feastPlanOccupationEvent(
  state: FeastState, context: FeastOccupationEventContext,
  usage: FeastOccupationUsageProvenance = EMPTY_FEAST_OCCUPATION_USAGE,
): FeastOccupationPlanningResult {
  const seatValue = context.fields.seat;
  const seat = context.seat ?? (typeof seatValue === 'number' ? seatValue : typeof context.fields.playerSeat === 'number' ? context.fields.playerSeat : state.turn);
  const player = state.players[seat];
  const owned = new Set(player?.playedOccupations ?? []);
  if (context.hook === 'card-played' && context.cardId) owned.add(context.cardId);
  const plans: FeastOccupationPlan[] = [];
  for (const rule of FEAST_OCCUPATION_RULE_LIST) {
    if (!owned.has(rule.id)) continue;
    if (context.hook === 'card-played' && context.cardId && rule.id !== context.cardId) continue;
    for (const clause of rule.clauses) {
      const plan = feastPlanOccupationClause(state, seat, rule, clause, context, usage);
      if (plan) plans.push(plan);
    }
  }
  return {
    context, plans,
    automatic: plans.filter((plan) => plan.automatic),
    prompts: plans.filter((plan) => plan.requiresConfirmation || plan.kind === 'choice' || plan.kind === 'action' || plan.kind === 'compound'),
    modifiers: plans.filter((plan) => plan.kind === 'modifier' || plan.operations.some((operation) => operation.disposition === 'modifier')),
    replacements: plans.filter((plan) => plan.kind === 'replacement' || plan.operations.some((operation) => operation.disposition === 'replacement')),
  };
}

interface SelectionBudgetEntry { owned: number; required: number; label: string }

function addSelectionBudget(
  budget: Map<string, SelectionBudgetEntry>, item: FeastOccupationResolvedItem,
  multiplier = 1,
): void {
  if (item.needsSelection || item.quantity <= 0 || multiplier <= 0) return;
  const key = `${item.item}:${item.id ?? ''}`;
  const current = budget.get(key) ?? { owned: item.owned, required: 0, label: item.id ?? item.item };
  current.required += item.quantity * multiplier;
  current.owned = Math.min(current.owned, item.owned);
  budget.set(key, current);
}

function selectionTargetNeeded(operation: FeastOccupationPlannedOperation, repeats = 1): boolean {
  if (repeats <= 0) return false;
  if (operation.kind === 'move' || operation.kind === 'return-workers') return operation.disposition === 'prompt'
    && (operation.kind === 'return-workers' ? operation.quantity > 0 : operation.subject.quantity > 0);
  if (operation.kind === 'transfer') return operation.items.some((item) => item.quantity > 0 && item.needsSelection)
    || (!!operation.operation.destination && !['supply', 'owner-supply', 'general-supply'].includes(operation.operation.destination));
  if (operation.kind === 'exchange') return [...operation.from, ...operation.to].some((item) => item.quantity > 0 && item.needsSelection);
  return false;
}

function targetIds(target: string | number | readonly string[] | undefined): string[] {
  if (typeof target === 'string') return [target];
  return Array.isArray(target) ? target.filter((entry): entry is string => typeof entry === 'string') : [];
}

function validateResolvedItemTargets(
  state: FeastState, seat: number, items: readonly FeastOccupationResolvedItem[],
  target: string | number | readonly string[] | undefined,
  source: boolean,
): string | null {
  const ids = targetIds(target);
  const player = state.players[seat];
  for (const item of items) {
    if (!item.needsSelection || item.quantity <= 0) continue;
    if (item.item === 'good') {
      const id = ids[0];
      if (!id || !GOOD_IDS.has(id as FeastGood)) return 'Choose a specific good type';
      const good = id as FeastGood;
      if (item.state?.excludeAnimals === true && FEAST_GOOD_BY_ID[good].animal) return 'Choose a non-animal good';
      if (typeof item.state?.mustHaveExactly === 'number' && player.goods[good] !== item.state.mustHaveExactly) return `You must have exactly ${item.state.mustHaveExactly} ${good}`;
      if (source && player.goods[good] < item.quantity) return `Only ${player.goods[good]} ${good} available`;
    } else if (item.item === 'farm-animal') {
      const normal = item.id === 'cattle' ? 'cattle' : 'sheep';
      const allowed = new Set([normal, `pregnant-${normal}`]);
      if (!ids[0] || !allowed.has(ids[0])) return `Choose a ${normal} pregnancy state`;
      if (source && player.goods[ids[0] as FeastGood] < item.quantity) return `No ${ids[0]} available`;
    } else if (item.item === 'weapon-card') {
      if (ids.length !== item.quantity || ids.some((id) => !WEAPON_IDS.has(id as FeastWeapon))) return `Choose exactly ${item.quantity} weapon card(s)`;
      for (const weapon of WEAPON_IDS) {
        const selected = ids.filter((id) => id === weapon).length;
        if (source && selected > player.weapons[weapon]) return `Only ${player.weapons[weapon]} ${weapon} card(s) available`;
      }
    } else if (item.item === 'exploration-board') {
      const id = ids[0];
      if (!id || !state.explorations.some((entry) => entry.claimedBy === null && (entry.face === id || entry.boardId === id))) return 'Choose a face-up exploration board';
    }
  }
  return null;
}

function validateOperationTarget(
  state: FeastState, seat: number, operation: FeastOccupationPlannedOperation,
  target: string | number | readonly string[] | undefined,
): string | null {
  if (target === undefined) return `Choose a target for ${operation.path}`;
  if (operation.kind === 'transfer') {
    const generic = validateResolvedItemTargets(state, seat, operation.items, target, operation.operation.mode !== 'gain');
    if (generic) return generic;
    if (operation.operation.destination === 'immediate-home-or-exploration-placement') {
      const boardId = targetIds(target)[0];
      if (!boardId || !state.players[seat].boards.some((board) => board.id === boardId && (board.kind === 'home' || board.kind === 'exploration'))) return 'Choose your home or exploration board';
    }
  } else if (operation.kind === 'exchange') {
    const from = validateResolvedItemTargets(state, seat, operation.from, target, true);
    if (from) return from;
    const to = validateResolvedItemTargets(state, seat, operation.to, target, false);
    if (to) return to;
  } else if (operation.kind === 'return-workers') {
    const spaces = targetIds(target);
    const activeOnly = operation.operation.parameters.soloActiveColorOnly === true && state.players.length === 1;
    const activeColor = state.players[seat].activeWorkerColor;
    if (!spaces.length || spaces.some((id) => !state.actionSpaces.some((space) => space.id === id
      && space.occupants.some((occupant) => occupant.seat === seat
        && (!activeOnly || occupant.workerColor === activeColor))))) return 'Choose an occupied action space';
  } else if (operation.kind === 'move') {
    const ids = targetIds(target);
    if (!ids.length) return `Choose a source/target for ${operation.path}`;
    if (operation.operation.from === 'whaling-boat-or-longship' && !ids.some((id) => state.players[seat].ships.some((ship) => ship.id === id && !ship.emigrated && ship.type !== 'knarr' && ship.ore > 0))) return 'Choose a whaling boat or longship with removable ore';
    if (operation.operation.from === 'any-player-board' && !ids.some((id) => state.players.some((player) => player.boards.some((board) => board.id === id || board.placements.some((placement) => placement.id === id))))) return 'Choose a board containing that special tile';
    if (operation.operation.to === 'stone-or-long-houses' && !ids.some((id) => state.players[seat].boards.some((board) => board.id === id && (board.definitionId === 'stone-house' || board.definitionId === 'long-house')))) return 'Choose one of your stone or long houses';
    if (operation.operation.to === 'empty-shed-cell' && !ids.some((id) => state.players[seat].boards.some((board) => board.id === id && board.definitionId === 'shed'))) return 'Choose one of your sheds';
  }
  return null;
}

function validateSelectedOperations(
  state: FeastState, seat: number,
  operations: readonly FeastOccupationPlannedOperation[], selection: FeastOccupationSelection,
  budget: Map<string, SelectionBudgetEntry>, firstChoice: { used: boolean },
): string | null {
  for (const operation of operations) {
    if (!operation.valid) return operation.issues[0]?.message ?? `${operation.path} is not currently legal`;
    if (operation.kind === 'choice') {
      const convenience = !firstChoice.used ? selection.optionIds : undefined;
      firstChoice.used = true;
      const selected = selection.choices?.[operation.path] ?? convenience ?? [];
      if (selected.length < operation.min || selected.length > operation.max) return `Choose ${operation.min}-${operation.max} option(s) for ${operation.path}`;
      if (new Set(selected).size !== selected.length) return `Duplicate option selected for ${operation.path}`;
      for (const id of selected) {
        const option = operation.options.find((candidate) => candidate.id === id);
        if (!option) return `Unknown option ${id} for ${operation.path}`;
        if (!option.valid) return option.issues[0]?.message ?? `${id} is not currently legal`;
        const nested = validateSelectedOperations(state, seat, option.operations, selection, budget, firstChoice);
        if (nested) return nested;
      }
      continue;
    }
    if (operation.kind === 'replace') {
      const nested = validateSelectedOperations(state, seat, operation.replacement, selection, budget, firstChoice);
      if (nested) return nested;
      continue;
    }
    let repeats = 1;
    if (operation.kind === 'exchange' && operation.operation.repeat !== 'once') {
      const requested = selection.repeats?.[operation.path];
      if (!Number.isInteger(requested) || requested! < 0 || requested! > operation.maximumRepeats) return `Choose 0-${operation.maximumRepeats} repetitions for ${operation.path}`;
      repeats = requested!;
    }
    if (selectionTargetNeeded(operation, repeats)) {
      const targetError = validateOperationTarget(state, seat, operation, selection.targets?.[operation.path]);
      if (targetError) return targetError;
    }
    if (operation.kind === 'transfer' && operation.operation.mode !== 'gain') {
      for (const item of operation.items) addSelectionBudget(budget, item);
    } else if (operation.kind === 'exchange') {
      for (const item of operation.from) addSelectionBudget(budget, item, repeats);
    }
  }
  return null;
}

export function feastValidateOccupationSelection(
  state: FeastState, seat: number, plan: FeastOccupationPlan,
  selection: FeastOccupationSelection,
): string | null {
  if (!plan.valid) return plan.issues[0]?.message ?? 'Occupation plan is not legal';
  if (!selection.accepted) return plan.requirement === 'mandatory' ? 'This occupation effect is mandatory' : null;
  const budget = new Map<string, SelectionBudgetEntry>();
  const error = validateSelectedOperations(state, seat, plan.operations, selection, budget, { used: false });
  if (error) return error;
  for (const entry of budget.values()) if (entry.required > entry.owned) return `Needs ${entry.required} ${entry.label}; only ${entry.owned} available across the selected options`;
  return null;
}

function clauseReference(plan: FeastOccupationPlan): string {
  return `${plan.cardId}:${plan.clauseId}`;
}

function modifierActive(plan: FeastOccupationPlan, context: FeastOccupationEventContext): boolean {
  return plan.requirement === 'mandatory' || context.activatedClauseIds?.includes(clauseReference(plan)) === true;
}

function walkPlannedOperations(operations: readonly FeastOccupationPlannedOperation[]): FeastOccupationPlannedOperation[] {
  const out: FeastOccupationPlannedOperation[] = [];
  for (const operation of operations) {
    out.push(operation);
    if (operation.kind === 'replace') out.push(...walkPlannedOperations(operation.replacement));
    if (operation.kind === 'choice') for (const option of operation.options) out.push(...walkPlannedOperations(option.operations));
  }
  return out;
}

export function feastOccupationActionModifiers(
  state: FeastState, seat: number, context: FeastOccupationEventContext,
  usage: FeastOccupationUsageProvenance = EMPTY_FEAST_OCCUPATION_USAGE,
): FeastOccupationActionModifiers {
  const scoped: FeastOccupationEventContext = { ...context, fields: { ...context.fields, seat } };
  const candidates = feastPlanOccupationEvent(state, scoped, usage).plans;
  let silverDiscount = 0;
  let stoneDiscount = 0;
  let silverFloor = 0;
  let stoneFloor = 0;
  let workerCost: number | null = null;
  const eligibility: FeastRuleValue[] = [];
  for (const plan of candidates) {
    if (!modifierActive(plan, scoped)) continue;
    for (const planned of walkPlannedOperations(plan.operations)) {
      if (planned.kind === 'discount') {
        const excluded = planned.operation.exclusions?.some((entry) =>
          context.fields.actionKind === entry || context.fields.costKind === entry
          || (Array.isArray(context.fields.classifications) && context.fields.classifications.includes(entry))) ?? false;
        if (excluded) continue;
        if (planned.operation.parameters?.currency === 'stone') {
          stoneDiscount += planned.amount; stoneFloor = Math.max(stoneFloor, planned.operation.floor);
        } else {
          silverDiscount += planned.amount; silverFloor = Math.max(silverFloor, planned.operation.floor);
        }
      }
      if (planned.kind === 'modify-rule' && planned.operation.rule === 'worker-cost') {
        if (typeof planned.value === 'number') workerCost = planned.value;
        else if (isRecord(planned.value) && typeof planned.value.kind === 'string') workerCost = feastOccupationQuantity(state, seat, planned.value as FeastOccupationQuantity, scoped);
      }
      if (planned.kind === 'modify-rule' && planned.operation.rule === 'action-eligibility') eligibility.push(planned.value);
    }
  }
  const printedSilver = typeof context.fields.printedSilverCost === 'number' ? context.fields.printedSilverCost
    : typeof context.fields.printedCost === 'number' ? context.fields.printedCost : null;
  const printedStone = typeof context.fields.printedStoneCost === 'number' ? context.fields.printedStoneCost : null;
  return {
    candidates, silverDiscount, silverFloor, stoneDiscount, stoneFloor,
    effectiveSilverCost: printedSilver === null ? null : Math.max(silverFloor, printedSilver - silverDiscount),
    effectiveStoneCost: printedStone === null ? null : Math.max(stoneFloor, printedStone - stoneDiscount),
    workerCost, eligibility,
  };
}

function actionFromContext(context: FeastOccupationEventContext): FeastOccupationAction | null {
  const value = context.fields.action ?? context.event;
  return typeof value === 'string' ? value as FeastOccupationAction : null;
}

export function feastOccupationDieModifiers(
  state: FeastState, seat: number, context: FeastOccupationEventContext,
  usage: FeastOccupationUsageProvenance = EMPTY_FEAST_OCCUPATION_USAGE,
): FeastOccupationDieModifiers {
  const scoped: FeastOccupationEventContext = { ...context, fields: { ...context.fields, seat } };
  const candidates = feastPlanOccupationEvent(state, scoped, usage).plans;
  const action = actionFromContext(scoped);
  let delta = 0;
  let rollLimit: number | null = null;
  const payments: FeastOccupationDiePaymentModifier[] = [];
  const everyRollClauseIds: string[] = [];
  for (const plan of candidates) {
    const active = modifierActive(plan, scoped);
    for (const planned of walkPlannedOperations(plan.operations)) {
      if (planned.kind === 'modify-die' && (!action || planned.operation.actions.includes(action))) {
        if (planned.operation.parameters?.appliesToEveryRollThisAction === true) everyRollClauseIds.push(clauseReference(plan));
        if (planned.per) {
          const paid = scoped.payments?.[planned.per.item] ?? 0;
          if (active) delta += paid * planned.operation.delta;
          payments.push({
            cardId: plan.cardId, clauseId: plan.clauseId, item: planned.per.item,
            value: planned.operation.delta, available: planned.per.owned,
            replacesNormalSpendValue: planned.operation.parameters?.replacesNormalSpendValue === true,
            replacesNormalWeaponValue: planned.operation.parameters?.replacesNormalWeaponValue === true,
            active,
          });
        } else if (active) delta += planned.operation.delta;
      }
      if (planned.kind === 'modify-rule' && planned.operation.rule === 'roll-limit' && active && typeof planned.value === 'number') rollLimit = Math.max(rollLimit ?? 0, planned.value);
      if (planned.kind === 'move' && (planned.operation.from === 'selected-raiding-longship' || planned.operation.from === 'selected-pillaging-longship')) {
        payments.push({ cardId: plan.cardId, clauseId: plan.clauseId, item: planned.subject.item, value: 0,
          available: planned.subject.owned, replacesNormalSpendValue: false, replacesNormalWeaponValue: false, active });
      }
    }
  }
  return { candidates, delta, rollLimit, payments, everyRollClauseIds };
}

export function feastOccupationLootModifiers(
  state: FeastState, seat: number, context: FeastOccupationEventContext,
  usage: FeastOccupationUsageProvenance = EMPTY_FEAST_OCCUPATION_USAGE,
): FeastOccupationLootModifiers {
  const scoped: FeastOccupationEventContext = { ...context, fields: { ...context.fields, seat } };
  const candidates = feastPlanOccupationEvent(state, scoped, usage).plans;
  const effects: FeastOccupationLootRuleEffect[] = [];
  let maxTiles = 1;
  let lootColor: FeastRuleValue | null = null;
  const weaponSubstitutions: FeastRuleValue[] = [];
  let swordValueDelta = 0;
  for (const plan of candidates) for (const planned of walkPlannedOperations(plan.operations)) {
    if (planned.kind !== 'modify-rule' || !['loot-split', 'loot-color', 'weapon-substitution', 'sword-value'].includes(planned.operation.rule)) continue;
    const active = modifierActive(plan, scoped);
    effects.push({ cardId: plan.cardId, clauseId: plan.clauseId, rule: planned.operation.rule, value: planned.value,
      ...(planned.operation.parameters ? { parameters: planned.operation.parameters } : {}), active });
    if (!active) continue;
    if (planned.operation.rule === 'loot-split' && typeof planned.value === 'number') maxTiles = Math.max(maxTiles, planned.value);
    if (planned.operation.rule === 'loot-color') lootColor = planned.value;
    if (planned.operation.rule === 'weapon-substitution') weaponSubstitutions.push(planned.value);
    if (planned.operation.rule === 'sword-value' && typeof planned.value === 'number') swordValueDelta += planned.value;
  }
  return { candidates, maxTiles, lootColor, weaponSubstitutions, swordValueDelta, effects };
}

/** Maximum horizontal copies of a Feast tile type currently legal. */
export function feastOccupationFeastHorizontalLimit(
  state: FeastState, seat: number, pieceId: string,
  context?: FeastOccupationEventContext,
  usage: FeastOccupationUsageProvenance = EMPTY_FEAST_OCCUPATION_USAGE,
): number {
  const player = state.players[seat];
  if (!player?.playedOccupations.includes('occupation-186')) return 1;
  const baseContext: FeastOccupationEventContext = context ?? {
    hook: 'phase-started', event: 'feast', window: 'during', fields: { seat, phase: 'feast' },
  };
  const rule = FEAST_OCCUPATION_RULE_LIST[185];
  const clause = rule?.clauses.find((entry) => entry.id === 'second-horizontal-peas');
  if (!rule || !clause || !feastPlanOccupationClause(state, seat, rule, clause, baseContext, usage)) return 1;
  for (const operation of clause.operations) {
    if (operation.kind === 'modify-rule' && operation.rule === 'placement-limit'
      && operation.parameters?.pieceId === pieceId && typeof operation.value === 'number') return operation.value;
  }
  return 1;
}

export function feastOccupationScoringModifiers(
  state: FeastState, seat: number,
  context?: FeastOccupationEventContext,
  usage: FeastOccupationUsageProvenance = EMPTY_FEAST_OCCUPATION_USAGE,
): readonly FeastOccupationScoringModifier[] {
  const scoped: FeastOccupationEventContext = context
    ? { ...context, fields: { ...context.fields, seat } }
    : { hook: 'scoring', event: 'score', window: 'during', fields: { seat } };
  const plans = feastPlanOccupationEvent(state, scoped, usage).plans;
  const result: FeastOccupationScoringModifier[] = [];
  for (const plan of plans) for (const operation of walkPlannedOperations(plan.operations)) {
    if (operation.kind === 'score') result.push({
      cardId: plan.cardId, clauseId: plan.clauseId,
      currency: operation.operation.currency, amount: operation.amount,
    });
  }
  return result;
}
