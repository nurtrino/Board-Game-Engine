import {
  FEAST_GOOD_BY_ID, FEAST_GOOD_IDS, FEAST_SPECIAL_BY_ID,
} from './data.js';
import {
  feastOccupationRule,
  type FeastOccupationItemId,
  type FeastOccupationOperation,
  type FeastRuleRecord,
  type FeastRuleValue,
} from './occupationRules.js';
import {
  type FeastOccupationChoiceOptionPlan,
  type FeastOccupationPlan,
  type FeastOccupationPlannedOperation,
  type FeastOccupationResolvedItem,
  type FeastOccupationSelection,
  type FeastOccupationUsageRecord,
} from './occupationRuntime.js';
import {
  feastDrawWeapon, feastId, feastTakeWeapon,
} from './state.js';
import type {
  FeastBoardState, FeastBuildingResource, FeastBuildingType, FeastGood,
  FeastPlayer, FeastShip, FeastShipType, FeastState, FeastWeapon,
} from './types.js';

/**
 * Applies a server-produced occupation plan without accepting client-authored
 * inventory deltas. The input state is never mutated. A successful result
 * contains a cloned state plus typed commands for work which the main reducer
 * must serialize through its normal action/placement/phase machinery.
 *
 * Target-key conventions (all keys are planned-operation `path` values):
 *
 * - `path`: the canonical runtime key for a move/worker target, destination
 *   board, or the sole generic item in an operation. A scalar denotes one id
 *   (and may select that type for every unit); an array denotes several.
 * - `path.items[n]`, `path.from[n]`, `path.to[n]`: disambiguation aliases when
 *   an operation contains more than one selectable item. Concrete ship
 *   payments use the matching `from[n]` key for physical ship ids.
 * - Move targets are physical ids: ship ids for ore removal, a placement or
 *   containing board for player-board moves, destination house board ids for
 *   Banquet moves, board ids for placement destinations, and the
 *   literal `new-longship` for Sponsor's just-created ship.
 * - Worker targets are action-space ids. One id may hold several returned
 *   Vikings when the card requires a same-space return.
 *
 * Unknown, inactive-branch, duplicate, and surplus choice/repeat/target keys
 * are rejected. This makes the selection a capability for the declared plan,
 * not a second operation language.
 */

export type FeastOccupationExecutionErrorCode =
  | 'plan' | 'ownership' | 'selection' | 'target' | 'inventory' | 'supply'
  | 'capacity' | 'orchestration';

export interface FeastOccupationExecutionError {
  code: FeastOccupationExecutionErrorCode;
  path: string;
  message: string;
}

export interface FeastOccupationAppliedMutation {
  /** Global operation order across applied/deferred/modifier/replacement output. */
  order: number;
  path: string;
  kind: 'inventory' | 'weapon-supply' | 'special-supply' | 'building-supply'
    | 'exploration-supply' | 'ship' | 'occupation-supply';
  item: FeastOccupationItemId;
  id?: string;
  amount: number;
  mode: 'gain' | 'pay' | 'discard' | 'return' | 'draw';
  detail?: string;
}

export type FeastOccupationDeferredCommand = { order: number } & (
  | {
    kind: 'grant-action'; path: string;
    action: Extract<FeastOccupationOperation, { kind: 'grant-action' }>['action'];
    parameters?: FeastRuleRecord;
  }
  | {
    kind: 'phase'; path: string;
    phase: Extract<FeastOccupationOperation, { kind: 'phase' }>['phase'];
    scope: Extract<FeastOccupationOperation, { kind: 'phase' }>['scope'];
  }
  | {
    kind: 'placement'; path: string; mode: 'gain-direct';
    destination: string; target: string | number | readonly string[];
    items: readonly FeastOccupationConcreteItem[];
  }
  | {
    kind: 'move'; path: string;
    subject: FeastOccupationConcreteItem; from: string; to: string;
    target: string | number | readonly string[]; parameters?: FeastRuleRecord;
  }
  | {
    kind: 'return-workers'; path: string; quantity: number;
    actionSpaceIds: readonly string[]; parameters: FeastRuleRecord;
  });

export type FeastOccupationModifierRegistration = { order: number } & (
  | {
    kind: 'discount'; path: string;
    target: Extract<FeastOccupationOperation, { kind: 'discount' }>['target'];
    amount: number; floor: number; exclusions?: readonly string[];
    parameters?: FeastRuleRecord;
  }
  | {
    kind: 'modify-die'; path: string;
    actions: Extract<FeastOccupationOperation, { kind: 'modify-die' }>['actions'];
    delta: number; per?: FeastOccupationResolvedItem; parameters?: FeastRuleRecord;
  }
  | {
    kind: 'modify-rule'; path: string;
    rule: Extract<FeastOccupationOperation, { kind: 'modify-rule' }>['rule'];
    value: FeastRuleValue; parameters?: FeastRuleRecord;
  }
  | {
    kind: 'score'; path: string; currency: 'points' | 'silver';
    amount: number; parameters?: FeastRuleRecord;
  });

export interface FeastOccupationReplacementRegistration {
  order: number;
  path: string;
  target: Extract<FeastOccupationOperation, { kind: 'replace' }>['target'];
  parameters?: FeastRuleRecord;
  /** Paths executed in place of the original reducer operation. */
  replacementPaths: readonly string[];
}

export interface FeastOccupationConcreteItem {
  item: FeastOccupationItemId;
  /** Concrete catalog id, or the concrete item id itself for goods/resources. */
  id: string;
  quantity: number;
  state?: FeastRuleRecord;
  /** Physical state ids when a concrete ship/board/card must be selected. */
  physicalIds?: readonly string[];
}

export interface FeastOccupationPromptOption {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  reason?: string;
}

export interface FeastOccupationPromptDependency {
  choicePath: string;
  optionId: string;
}

export type FeastOccupationPromptRequest =
  | {
    kind: 'confirmation'; key: 'accepted'; label: string; mandatory: boolean;
    dependencies: readonly FeastOccupationPromptDependency[];
  }
  | {
    kind: 'choice'; key: string; label: string; min: number; max: number;
    options: readonly FeastOccupationPromptOption[];
    dependencies: readonly FeastOccupationPromptDependency[];
  }
  | {
    kind: 'repeat'; key: string; label: string; min: 0; max: number;
    dependencies: readonly FeastOccupationPromptDependency[];
  }
  | {
    kind: 'target'; key: string; label: string;
    targetKind: 'good' | 'resource' | 'weapon' | 'ship' | 'special' | 'exploration'
      | 'occupation' | 'board' | 'placement' | 'action-space';
    min: number; max: number; perRepeat?: number;
    options: readonly FeastOccupationPromptOption[];
    dependencies: readonly FeastOccupationPromptDependency[];
  };

export interface FeastOccupationPromptModel {
  /** Stable server key; persist this rather than accepting a plan from the client. */
  planKey: string;
  cardId: FeastOccupationPlan['cardId'];
  cardNumber: number;
  cardName: string;
  sourceText: string;
  clauseId: string;
  requirement: FeastOccupationPlan['requirement'];
  acceptedByDefault: boolean;
  requests: readonly FeastOccupationPromptRequest[];
}

export interface FeastOccupationExecutionSuccess {
  ok: true;
  accepted: boolean;
  nextState: FeastState;
  applied: readonly FeastOccupationAppliedMutation[];
  deferred: readonly FeastOccupationDeferredCommand[];
  modifiers: readonly FeastOccupationModifierRegistration[];
  replacements: readonly FeastOccupationReplacementRegistration[];
  /** Null when an optional effect was declined. */
  usage: FeastOccupationUsageRecord | null;
}

export interface FeastOccupationExecutionFailure {
  ok: false;
  accepted: false;
  errors: readonly FeastOccupationExecutionError[];
}

export type FeastOccupationExecutionResult =
  | FeastOccupationExecutionSuccess | FeastOccupationExecutionFailure;

const RESOURCE_IDS = new Set<FeastBuildingResource>(['wood', 'stone', 'ore']);
const WEAPON_IDS = new Set<FeastWeapon>(['bow', 'snare', 'spear', 'long-sword']);
const SHIP_IDS = new Set<FeastShipType>(['whaling-boat', 'knarr', 'longship']);
const BUILDING_IDS = new Set<FeastBuildingType>(['shed', 'stone-house', 'long-house']);
const HOUSE_IDS = new Set<FeastBuildingType>(['stone-house', 'long-house']);
const GOOD_IDS = new Set<FeastGood>(FEAST_GOOD_IDS);
const FARM_ANIMALS = new Set<FeastGood>(['sheep', 'pregnant-sheep', 'cattle', 'pregnant-cattle']);
const SUPPLY_DESTINATIONS = new Set(['supply', 'general-supply', 'owner-supply', 'stable']);

class ExecutionAbort extends Error {
  constructor(readonly issue: FeastOccupationExecutionError) {
    super(issue.message);
  }
}

interface ExecutionContext {
  state: FeastState;
  seat: number;
  player: FeastPlayer;
  plan: FeastOccupationPlan;
  selection: FeastOccupationSelection;
  applied: FeastOccupationAppliedMutation[];
  deferred: FeastOccupationDeferredCommand[];
  modifiers: FeastOccupationModifierRegistration[];
  replacements: FeastOccupationReplacementRegistration[];
  usedChoices: Set<string>;
  usedRepeats: Set<string>;
  usedTargets: Set<string>;
  topChoiceUsed: boolean;
  latestGainedShipId: string | null;
  vacatedPlacement: { pieceId: string; placementId: string; boardId: string } | null;
  nextOrder: number;
}

function fail(code: FeastOccupationExecutionErrorCode, path: string, message: string): never {
  throw new ExecutionAbort({ code, path, message });
}

const jsonEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

function canonicalPlanError(plan: FeastOccupationPlan): string | null {
  const rule = feastOccupationRule(plan.cardId);
  if (!rule) return `Unknown occupation rule ${plan.cardId}`;
  const clause = rule.clauses.find((entry) => entry.id === plan.clauseId);
  if (!clause) return `Unknown clause ${plan.cardId}:${plan.clauseId}`;
  if (plan.cardNumber !== rule.number || plan.cardName !== rule.name
    || plan.requirement !== clause.requirement || plan.limit !== clause.limit) {
    return 'Occupation plan metadata does not match the rule registry';
  }
  if (!clause.triggers.some((trigger) => jsonEqual(trigger, plan.trigger))) {
    return 'Occupation plan trigger does not match the rule registry';
  }
  if (plan.operations.length !== clause.operations.length) return 'Occupation plan operation count is not canonical';

  const seen = new Set<string>();
  const walk = (
    planned: readonly FeastOccupationPlannedOperation[],
    canonical: readonly FeastOccupationOperation[], prefix: string,
  ): string | null => {
    if (planned.length !== canonical.length) return `Operation count mismatch at ${prefix}`;
    for (let index = 0; index < canonical.length; index++) {
      const expectedPath = `${prefix}.operations[${index}]`;
      const actual = planned[index];
      const source = canonical[index];
      if (!actual || actual.path !== expectedPath || actual.kind !== source.kind
        || !jsonEqual(actual.operation, source)) return `Non-canonical operation at ${expectedPath}`;
      if (seen.has(actual.path)) return `Duplicate operation path ${actual.path}`;
      seen.add(actual.path);
      if (source.kind === 'choice' && actual.kind === 'choice') {
        if (actual.options.length !== source.options.length) return `Choice option mismatch at ${actual.path}`;
        for (const option of source.options) {
          const plannedOption = actual.options.find((entry) => entry.id === option.id);
          if (!plannedOption) return `Missing option ${option.id} at ${actual.path}`;
          const nested = walk(plannedOption.operations, option.operations, `${actual.path}.options.${option.id}`);
          if (nested) return nested;
        }
      }
      if (source.kind === 'replace' && actual.kind === 'replace') {
        const nested = walk(actual.replacement, source.replacement, `${actual.path}.replacement`);
        if (nested) return nested;
      }
    }
    return null;
  };
  const tree = walk(plan.operations, clause.operations, `${plan.cardId}.${plan.clauseId}`);
  if (tree) return tree;
  const sharedThresholdTier = plan.limit === 'once-per-card'
    && (plan.cardId === 'occupation-180' || plan.cardId === 'occupation-181');
  const usagePrefix = sharedThresholdTier
    ? `${plan.cardId}:threshold-tier:` : `${plan.cardId}:${plan.clauseId}:`;
  if (plan.usage.cardId !== plan.cardId || plan.usage.clauseId !== plan.clauseId
    || plan.usage.limit !== plan.limit || !plan.usage.key.startsWith(usagePrefix)) {
    return 'Occupation usage provenance does not match the plan';
  }
  return null;
}

function targetValue(ctx: ExecutionContext, key: string, required: boolean): string | number | readonly string[] | undefined {
  const value = ctx.selection.targets?.[key];
  if (value !== undefined) ctx.usedTargets.add(key);
  if (required && value === undefined) fail('target', key, `Choose a target for ${key}`);
  return value;
}

function targetStrings(value: string | number | readonly string[] | undefined, path: string): string[] {
  if (typeof value === 'string') {
    if (!value) fail('target', path, 'Target ids cannot be empty');
    return [value];
  }
  if (Array.isArray(value)) {
    if (!value.length || value.some((entry) => typeof entry !== 'string' || !entry)) {
      fail('target', path, 'Target arrays must contain non-empty string ids');
    }
    return [...value];
  }
  fail('target', path, 'This target must be a string id or string-id array');
}

function concreteKind(item: FeastOccupationResolvedItem, selected: string, ctx: ExecutionContext, path: string): FeastOccupationItemId {
  const state = item.state;
  switch (item.item) {
    case 'good': case 'bonus-good': {
      if (!GOOD_IDS.has(selected as FeastGood)) fail('target', path, `${selected} is not a Feast good`);
      if (state?.excludeAnimals === true && FARM_ANIMALS.has(selected as FeastGood)) fail('target', path, 'Farm animals are excluded');
      if (typeof state?.mustHaveExactly === 'number' && ctx.player.goods[selected as FeastGood] !== state.mustHaveExactly) {
        fail('target', path, `${selected} must be owned exactly ${state.mustHaveExactly} times`);
      }
      return selected as FeastGood;
    }
    case 'building-resource':
      if (!RESOURCE_IDS.has(selected as FeastBuildingResource)) fail('target', path, `${selected} is not a building resource`);
      return selected as FeastBuildingResource;
    case 'weapon-card':
      if (!WEAPON_IDS.has(selected as FeastWeapon)) fail('target', path, `${selected} is not a weapon card`);
      return selected as FeastWeapon;
    case 'ship':
      if (!SHIP_IDS.has(selected as FeastShipType)) fail('target', path, `${selected} is not a ship type`);
      return selected as FeastShipType;
    case 'house':
      if (!HOUSE_IDS.has(selected as FeastBuildingType)) fail('target', path, `${selected} is not a house type`);
      return selected as FeastBuildingType;
    case 'farm-animal': {
      if (!FARM_ANIMALS.has(selected as FeastGood)) fail('target', path, `${selected} is not a farm animal`);
      if (item.id === 'sheep' && !['sheep', 'pregnant-sheep'].includes(selected)) fail('target', path, 'Choose a sheep pregnancy state');
      if (item.id === 'cattle' && !['cattle', 'pregnant-cattle'].includes(selected)) fail('target', path, 'Choose a cattle pregnancy state');
      return selected as FeastGood;
    }
    case 'special-tile':
      if (!FEAST_SPECIAL_BY_ID[selected]) fail('target', path, `${selected} is not a special tile`);
      return 'special-tile';
    case 'exploration-board': {
      const supply = ctx.state.explorations.find((entry) => entry.boardId === selected || entry.face === selected);
      if (!supply) fail('target', path, `${selected} is not an exploration board`);
      return 'exploration-board';
    }
    case 'occupation-card':
      if (!/^occupation-(?:[1-9]|[1-9][0-9]|1[0-8][0-9]|190)$/.test(selected)) fail('target', path, `${selected} is not an occupation card`);
      return 'occupation-card';
    default:
      fail('target', path, `${item.item} does not accept a concrete catalog target`);
  }
}

function expandItem(
  ctx: ExecutionContext, item: FeastOccupationResolvedItem, path: string,
  multiplier: number, conveniencePath?: string,
): FeastOccupationConcreteItem[] {
  const quantity = item.quantity * multiplier;
  if (!Number.isSafeInteger(quantity) || quantity < 0) fail('plan', path, 'Resolved item quantity must be a non-negative safe integer');
  if (quantity === 0) return [];

  const needsCatalogSelection = item.needsSelection || item.id?.startsWith('$') === true;
  if (!needsCatalogSelection) {
    return [{ item: item.item, id: item.id ?? item.item, quantity, ...(item.state ? { state: item.state } : {}) }];
  }
  let value = targetValue(ctx, path, false);
  if (value === undefined && conveniencePath) value = targetValue(ctx, conveniencePath, false);
  if (value === undefined) fail('target', path, `Choose concrete item id(s) for ${path}`);
  const selected = targetStrings(value, path);
  const ids = selected.length === 1 ? Array.from({ length: quantity }, () => selected[0]) : selected;
  if (ids.length !== quantity) fail('target', path, `Choose exactly ${quantity} concrete item id(s)`);
  const grouped = new Map<string, { item: FeastOccupationItemId; count: number }>();
  for (const id of ids) {
    const kind = concreteKind(item, id, ctx, path);
    const key = `${kind}:${id}`;
    const prior = grouped.get(key);
    grouped.set(key, { item: kind, count: (prior?.count ?? 0) + 1 });
  }
  return [...grouped.entries()].map(([key, value]) => ({
    item: value.item, id: key.slice(key.indexOf(':') + 1), quantity: value.count,
    ...(item.state ? { state: item.state } : {}),
  }));
}

function activeShips(player: FeastPlayer, type?: FeastShipType): FeastShip[] {
  return player.ships.filter((ship) => !ship.emigrated && (!type || ship.type === type));
}

function recordMutation(
  ctx: ExecutionContext, path: string, kind: FeastOccupationAppliedMutation['kind'],
  concrete: FeastOccupationConcreteItem, amount: number,
  mode: FeastOccupationAppliedMutation['mode'], detail?: string,
): void {
  ctx.applied.push({
    order: ctx.nextOrder++, path, kind, item: concrete.item, id: concrete.id, amount, mode,
    ...(detail ? { detail } : {}),
  });
}

function awardNamedWeapon(ctx: ExecutionContext, path: string, weapon: FeastWeapon, mode: FeastOccupationAppliedMutation['mode'] = 'gain'): void {
  const physical = feastTakeWeapon(ctx.state, weapon);
  if (!physical) ctx.state.weaponSubstitutes[weapon]++;
  ctx.player.weapons[weapon]++;
  recordMutation(ctx, path, 'weapon-supply', { item: weapon, id: weapon, quantity: 1 }, 1, mode,
    physical ? 'physical card searched from finite supply' : 'official replacement token issued');
}

function spendWeapon(ctx: ExecutionContext, path: string, weapon: FeastWeapon, quantity: number, mode: 'pay' | 'discard' | 'return'): void {
  if (ctx.player.weapons[weapon] < quantity) fail('inventory', path, `Needs ${quantity} ${weapon}; only ${ctx.player.weapons[weapon]} owned`);
  ctx.player.weapons[weapon] -= quantity;
  for (let count = 0; count < quantity; count++) {
    if (ctx.state.weaponSubstitutes[weapon] > 0) ctx.state.weaponSubstitutes[weapon]--;
    else ctx.state.weaponDiscard.push(weapon);
  }
  recordMutation(ctx, path, 'weapon-supply', { item: weapon, id: weapon, quantity }, -quantity, mode,
    'physical cards returned to discard before replacement tokens');
}

function gainShip(ctx: ExecutionContext, path: string, type: FeastShipType, count: number, mode: FeastOccupationAppliedMutation['mode']): void {
  for (let index = 0; index < count; index++) {
    const small = activeShips(ctx.player, 'whaling-boat').length;
    const large = activeShips(ctx.player).filter((ship) => ship.type !== 'whaling-boat').length;
    if ((type === 'whaling-boat' && small >= 3) || (type !== 'whaling-boat' && large >= 4)) {
      fail('capacity', path, type === 'whaling-boat' ? 'All three small-ship berths are full' : 'All four large-ship berths are full');
    }
    const id = feastId(ctx.state, type);
    ctx.player.ships.push({ id, type, ore: 0, emigrated: false, emigratedRound: null });
    ctx.latestGainedShipId = id;
    recordMutation(ctx, path, 'ship', { item: type, id: type, quantity: 1, physicalIds: [id] }, 1, mode, id);
  }
}

function shipPaymentIds(ctx: ExecutionContext, item: FeastOccupationConcreteItem, path: string): string[] {
  const candidates = activeShips(ctx.player, item.item as FeastShipType);
  const selectedValue = targetValue(ctx, path, false);
  if (selectedValue === undefined) {
    if (candidates.length < item.quantity) fail('inventory', path, `Needs ${item.quantity} active ${item.item}`);
    if (candidates.length > item.quantity) fail('target', path, `Choose ${item.quantity} physical ${item.item} ship id(s)`);
    return candidates.map((ship) => ship.id);
  }
  const ids = targetStrings(selectedValue, path);
  if (ids.length !== item.quantity || new Set(ids).size !== ids.length) fail('target', path, `Choose ${item.quantity} distinct ship id(s)`);
  for (const id of ids) if (!candidates.some((ship) => ship.id === id)) fail('target', path, `${id} is not an active ${item.item}`);
  return ids;
}

function applyConcrete(
  ctx: ExecutionContext, path: string, item: FeastOccupationConcreteItem,
  mode: 'gain' | 'pay' | 'discard' | 'return', physicalTargetPath?: string,
): void {
  const gain = mode === 'gain';
  const quantity = item.quantity;
  if (quantity === 0) return;
  const id = item.id;
  if (item.item === 'silver') {
    if (!gain && ctx.player.silver < quantity) fail('inventory', path, `Needs ${quantity} silver; only ${ctx.player.silver} owned`);
    ctx.player.silver += gain ? quantity : -quantity;
    recordMutation(ctx, path, 'inventory', item, gain ? quantity : -quantity, mode);
    return;
  }
  if (RESOURCE_IDS.has(item.item as FeastBuildingResource)) {
    const resource = item.item as FeastBuildingResource;
    if (!gain && ctx.player.resources[resource] < quantity) fail('inventory', path, `Needs ${quantity} ${resource}; only ${ctx.player.resources[resource]} owned`);
    ctx.player.resources[resource] += gain ? quantity : -quantity;
    recordMutation(ctx, path, 'inventory', item, gain ? quantity : -quantity, mode);
    return;
  }
  if (GOOD_IDS.has(item.item as FeastGood)) {
    const good = item.item as FeastGood;
    if (!gain && ctx.player.goods[good] < quantity) fail('inventory', path, `Needs ${quantity} ${good}; only ${ctx.player.goods[good]} owned`);
    ctx.player.goods[good] += gain ? quantity : -quantity;
    recordMutation(ctx, path, 'inventory', item, gain ? quantity : -quantity, mode);
    return;
  }
  if (WEAPON_IDS.has(item.item as FeastWeapon)) {
    const weapon = item.item as FeastWeapon;
    if (gain) for (let count = 0; count < quantity; count++) awardNamedWeapon(ctx, path, weapon);
    else spendWeapon(ctx, path, weapon, quantity, mode);
    return;
  }
  if (SHIP_IDS.has(item.item as FeastShipType)) {
    const type = item.item as FeastShipType;
    if (gain) gainShip(ctx, path, type, quantity, mode);
    else {
      const ids = shipPaymentIds(ctx, item, physicalTargetPath ?? path);
      for (const shipId of ids) {
        const ship = ctx.player.ships.find((entry) => entry.id === shipId)!;
        ctx.player.ships.splice(ctx.player.ships.indexOf(ship), 1);
        recordMutation(ctx, path, 'ship', { ...item, quantity: 1, physicalIds: [shipId] }, -1, mode,
          ship.ore ? `${ship.ore} added ore returned to supply` : shipId);
      }
    }
    return;
  }
  if (BUILDING_IDS.has(item.item as FeastBuildingType)) {
    const building = item.item as FeastBuildingType;
    if (gain) {
      if (ctx.state.buildingSupply[building] < quantity) fail('supply', path, `Only ${ctx.state.buildingSupply[building]} ${building} board(s) remain`);
      for (let count = 0; count < quantity; count++) {
        ctx.state.buildingSupply[building]--;
        const boardId = feastId(ctx.state, building);
        ctx.player.boards.push({ id: boardId, definitionId: building, kind: 'building', owner: ctx.seat, placements: [] });
        recordMutation(ctx, path, 'building-supply', { ...item, quantity: 1, physicalIds: [boardId] }, 1, mode, boardId);
      }
    } else {
      const boards = ctx.player.boards.filter((board) => board.kind === 'building' && board.definitionId === building && board.placements.length === 0);
      if (boards.length < quantity) fail('inventory', path, `Needs ${quantity} empty owned ${building} board(s)`);
      for (const board of boards.slice(0, quantity)) {
        ctx.player.boards.splice(ctx.player.boards.indexOf(board), 1);
        ctx.state.buildingSupply[building]++;
        recordMutation(ctx, path, 'building-supply', { ...item, quantity: 1, physicalIds: [board.id] }, -1, mode, board.id);
      }
    }
    return;
  }
  if (item.item === 'special-tile') {
    if (!FEAST_SPECIAL_BY_ID[id]) fail('target', path, `${id} is not a special tile`);
    if (quantity !== 1) fail('plan', path, 'A unique special tile quantity must be one');
    if (gain) {
      const at = ctx.state.specialSupply.indexOf(id);
      if (at < 0) fail('supply', path, `${id} is not in the special-tile supply`);
      ctx.state.specialSupply.splice(at, 1); ctx.player.specials.push(id);
    } else {
      const at = ctx.player.specials.indexOf(id);
      if (at < 0) fail('inventory', path, `${id} is not owned`);
      if (ctx.player.boards.some((board) => board.placements.some((placement) => placement.pieceKind === 'special' && placement.pieceId === id))) {
        fail('orchestration', path, `${id} is committed to a board and must be moved with a move operation`);
      }
      ctx.player.specials.splice(at, 1); ctx.state.specialSupply.push(id);
    }
    recordMutation(ctx, path, 'special-supply', item, gain ? 1 : -1, mode);
    return;
  }
  if (item.item === 'exploration-board') {
    const supply = ctx.state.explorations.find((entry) => entry.boardId === id || entry.face === id);
    if (!supply) fail('target', path, `Unknown exploration board ${id}`);
    if (quantity !== 1) fail('plan', path, 'Exploration boards must be resolved one at a time');
    if (gain) {
      if (supply.claimedBy !== null) fail('supply', path, `${supply.face} is already claimed`);
      supply.claimedBy = ctx.seat;
      const silver = supply.silver; supply.silver = 0; ctx.player.silver += silver;
      ctx.player.boards.push({ id: supply.boardId, definitionId: supply.face, kind: 'exploration', owner: ctx.seat, placements: [] });
      recordMutation(ctx, path, 'exploration-supply', { ...item, id: supply.boardId }, 1, mode,
        silver ? `claimed with ${silver} accumulated silver` : supply.face);
    } else {
      if (supply.claimedBy !== ctx.seat) fail('inventory', path, `${supply.face} is not owned`);
      const board = ctx.player.boards.find((entry) => entry.id === supply.boardId);
      if (!board || board.placements.length) fail('orchestration', path, 'Only an empty owned exploration board can return directly');
      ctx.player.boards.splice(ctx.player.boards.indexOf(board), 1); supply.claimedBy = null;
      recordMutation(ctx, path, 'exploration-supply', { ...item, id: supply.boardId }, -1, mode, supply.face);
    }
    return;
  }
  if (item.item === 'occupation-card') {
    for (let count = 0; count < quantity; count++) {
      if (gain) {
        let at = ctx.state.occupationDeck.indexOf(id);
        if (at >= 0) ctx.state.occupationDeck.splice(at, 1);
        else {
          at = ctx.state.occupationDiscard.indexOf(id);
          if (at < 0) fail('supply', path, `${id} is not available to draw`);
          ctx.state.occupationDiscard.splice(at, 1);
        }
        ctx.player.occupationHand.push(id);
      } else {
        const at = ctx.player.occupationHand.indexOf(id);
        if (at < 0) fail('inventory', path, `${id} is not in hand`);
        ctx.player.occupationHand.splice(at, 1); ctx.state.occupationDiscard.push(id);
      }
    }
    recordMutation(ctx, path, 'occupation-supply', item, gain ? quantity : -quantity, mode);
    return;
  }
  if (item.item === 'viking') {
    if (!gain && ctx.player.workersAvailable < quantity) fail('inventory', path, `Only ${ctx.player.workersAvailable} Vikings are available`);
    ctx.player.workersAvailable += gain ? quantity : -quantity;
    if (gain) { ctx.player.workersTotal += quantity; ctx.player.workersByColor[ctx.player.activeWorkerColor] = (ctx.player.workersByColor[ctx.player.activeWorkerColor] ?? 0) + quantity; }
    recordMutation(ctx, path, 'inventory', item, gain ? quantity : -quantity, mode);
    return;
  }
  fail('plan', path, `Unresolved inventory item ${item.item}`);
}

function placementTargetValid(
  ctx: ExecutionContext, destination: string, target: string | number | readonly string[],
  path: string, pieceCount: number,
): void {
  const ids = targetStrings(target, path);
  if (destination === 'immediate-home-or-exploration-placement') {
    if (ids.length < 1 || ids.length > Math.max(1, pieceCount)
      || new Set(ids).size !== ids.length
      || ids.some((id) => !ctx.player.boards.some((board) => board.id === id
        && (board.kind === 'home' || board.kind === 'exploration')))) {
      fail('target', path, `Choose 1-${Math.max(1, pieceCount)} distinct owned home or exploration boards`);
    }
    return;
  }
  if (destination.startsWith('vacated-')) {
    const vacated = ctx.vacatedPlacement;
    if (ids.length !== 1 || !vacated || (ids[0] !== vacated.placementId && ids[0] !== vacated.boardId)) {
      fail('target', path, 'Choose the exact board or placement vacated by the preceding special-tile move');
    }
  }
}

function executeTransfer(ctx: ExecutionContext, planned: Extract<FeastOccupationPlannedOperation, { kind: 'transfer' }>): void {
  const specialDestination = planned.operation.destination && !SUPPLY_DESTINATIONS.has(planned.operation.destination);
  const concrete = planned.items.flatMap((item, index) => expandItem(
    ctx, item, `${planned.path}.items[${index}]`, 1,
    planned.items.length === 1 && !specialDestination ? planned.path : undefined,
  ));
  if (specialDestination) {
    const target = targetValue(ctx, planned.path, true)!;
    placementTargetValid(ctx, planned.operation.destination!, target, planned.path,
      concrete.reduce((sum, item) => sum + item.quantity, 0));
    ctx.deferred.push({
      order: ctx.nextOrder++, kind: 'placement', path: planned.path, mode: 'gain-direct',
      destination: planned.operation.destination!, target, items: concrete,
    });
    return;
  }
  for (const item of concrete) applyConcrete(ctx, planned.path, item, planned.operation.mode,
    `${planned.path}.items[${planned.items.findIndex((entry) => (entry.id ?? entry.item) === item.id)}]`);
}

function repeatCount(ctx: ExecutionContext, planned: Extract<FeastOccupationPlannedOperation, { kind: 'exchange' }>): number {
  if (planned.operation.repeat === 'once') return 1;
  const value = ctx.selection.repeats?.[planned.path];
  ctx.usedRepeats.add(planned.path);
  if (!Number.isSafeInteger(value) || value! < 0 || value! > planned.maximumRepeats) {
    fail('selection', planned.path, `Choose 0-${planned.maximumRepeats} repetitions for ${planned.path}`);
  }
  return value!;
}

function executeExchange(ctx: ExecutionContext, planned: Extract<FeastOccupationPlannedOperation, { kind: 'exchange' }>): void {
  const repeats = repeatCount(ctx, planned);
  const selectable = [...planned.from, ...planned.to].filter((item) => item.needsSelection || item.id?.startsWith('$')).length;
  const from = planned.from.flatMap((item, index) => expandItem(ctx, item, `${planned.path}.from[${index}]`, repeats,
    selectable === 1 ? planned.path : undefined));
  const to = planned.to.flatMap((item, index) => expandItem(ctx, item, `${planned.path}.to[${index}]`, repeats,
    selectable === 1 ? planned.path : undefined));
  for (let index = 0; index < from.length; index++) applyConcrete(ctx, planned.path, from[index], 'pay', `${planned.path}.from[${index}]`);
  for (const item of to) applyConcrete(ctx, planned.path, item, 'gain');
}

function choiceIds(ctx: ExecutionContext, planned: Extract<FeastOccupationPlannedOperation, { kind: 'choice' }>): readonly string[] {
  const keyed = ctx.selection.choices?.[planned.path];
  if (keyed !== undefined) ctx.usedChoices.add(planned.path);
  if (keyed !== undefined && !ctx.topChoiceUsed && ctx.selection.optionIds !== undefined) {
    fail('selection', planned.path, 'Do not provide both optionIds and a keyed choice for the same choice');
  }
  let selected = keyed;
  if (selected === undefined && !ctx.topChoiceUsed) {
    selected = ctx.selection.optionIds ?? [];
    ctx.topChoiceUsed = true;
  }
  selected ??= [];
  if (selected.length < planned.min || selected.length > planned.max) fail('selection', planned.path, `Choose ${planned.min}-${planned.max} option(s)`);
  if (new Set(selected).size !== selected.length) fail('selection', planned.path, 'Duplicate choice option selected');
  for (const id of selected) {
    const option = planned.options.find((entry) => entry.id === id);
    if (!option) fail('selection', planned.path, `Unknown option ${id}`);
    if (!option.valid) fail('selection', planned.path, option.issues[0]?.message ?? `${id} is not legal`);
  }
  return selected;
}

function executeChoice(ctx: ExecutionContext, planned: Extract<FeastOccupationPlannedOperation, { kind: 'choice' }>): void {
  for (const id of choiceIds(ctx, planned)) {
    const option = planned.options.find((entry: FeastOccupationChoiceOptionPlan) => entry.id === id)!;
    executeOperations(ctx, option.operations);
  }
}

function moveTarget(ctx: ExecutionContext, planned: Extract<FeastOccupationPlannedOperation, { kind: 'move' }>): string | number | readonly string[] {
  if (planned.subject.quantity === 0) return targetValue(ctx, planned.path, false) ?? [];
  const target = planned.boundTarget ?? targetValue(ctx, planned.path, true)!;
  const ids = targetStrings(target, planned.path);
  const { from, to } = planned.operation;
  if (from === 'whaling-boat-or-longship' || from === 'selected-raiding-longship' || from === 'selected-pillaging-longship') {
    if (new Set(ids).size !== ids.length) fail('target', planned.path, 'Ship targets must be distinct');
    const ships = ids.map((id) => ctx.player.ships.find((ship) => ship.id === id && !ship.emigrated));
    if (ships.some((ship) => !ship || ship.type === 'knarr')) fail('target', planned.path, 'Choose owned active whaling boats or longships');
    if (from.startsWith('selected-') && (ships.length !== 1 || ships[0]!.type !== 'longship'
      || (planned.boundTarget !== undefined && ids[0] !== planned.boundTarget))) {
      fail('target', planned.path, 'Use the exact resolving longship');
    }
    if (ships.reduce((sum, ship) => sum + ship!.ore, 0) < planned.subject.quantity) fail('inventory', planned.path, 'Selected ships do not hold enough removable ore');
  } else if (from === 'supply' && to === 'empty-shed-cell') {
    if (ids.length !== 1 || !ctx.player.boards.some((board) => board.id === ids[0] && board.definitionId === 'shed')) fail('target', planned.path, 'Choose one owned shed');
  } else if (from === 'any-player-board') {
    let match: { pieceId: string; placementId: string; boardId: string } | null = null;
    for (const player of ctx.state.players) for (const board of player.boards) {
      const placement = board.placements.find((entry) => (entry.id === ids[0] || board.id === ids[0]) && entry.pieceId === planned.subject.id);
      if (placement) match = { pieceId: placement.pieceId, placementId: placement.id, boardId: board.id };
    }
    if (ids.length !== 1 || !match) fail('target', planned.path, 'Choose the matching committed special-tile placement');
    ctx.vacatedPlacement = match;
  } else if (from === 'banquet-table') {
    const matching = ctx.player.feastPlacements.filter((placement) => placement.pieceId === planned.subject.item);
    if (matching.length < planned.subject.quantity) fail('inventory', planned.path, `Only ${matching.length} matching Banquet tile(s) can move`);
    if (new Set(ids).size !== ids.length || ids.some((id) => !ctx.player.boards.some((board) => board.id === id
      && (board.definitionId === 'stone-house' || board.definitionId === 'long-house')))) {
      fail('target', planned.path, 'Choose owned stone-house or long-house destination board(s)');
    }
  } else if (from === 'supply' && to === 'new-longship') {
    if (ids.length !== 1 || (ids[0] !== 'new-longship' && ids[0] !== ctx.latestGainedShipId)) fail('target', planned.path, 'Target the just-created longship with new-longship');
  }
  return target;
}

function executeReturnWorkers(ctx: ExecutionContext, planned: Extract<FeastOccupationPlannedOperation, { kind: 'return-workers' }>): void {
  if (planned.quantity === 0) {
    ctx.deferred.push({ order: ctx.nextOrder++, kind: 'return-workers', path: planned.path, quantity: 0, actionSpaceIds: [], parameters: planned.operation.parameters });
    return;
  }
  const target = planned.actionSpaceIds ?? targetValue(ctx, planned.path, true)!;
  const ids = targetStrings(target, planned.path);
  const activeOnly = planned.operation.parameters.soloActiveColorOnly === true && ctx.state.players.length === 1;
  if (new Set(ids).size !== ids.length) fail('target', planned.path, 'Worker action-space targets must be distinct');
  const capacities = ids.map((id) => {
    const space = ctx.state.actionSpaces.find((entry) => entry.id === id);
    if (!space) fail('target', planned.path, `Unknown action space ${id}`);
    const workers = space.occupants.filter((entry) => entry.seat === ctx.seat
      && (!activeOnly || entry.workerColor === ctx.player.activeWorkerColor))
      .reduce((sum, entry) => sum + entry.workers, 0);
    if (!workers) fail('target', planned.path, `No owned Vikings occupy ${id}`);
    const maximum = planned.operation.parameters.maximumPerSpace;
    return typeof maximum === 'number' ? Math.min(maximum, workers) : workers;
  });
  if (planned.operation.parameters.sameSpace === true && ids.length !== 1) fail('target', planned.path, 'These Vikings must return from one action space');
  if (capacities.reduce((sum, value) => sum + value, 0) < planned.quantity) fail('inventory', planned.path, 'Selected spaces do not contain enough returnable Vikings');
  ctx.deferred.push({
    order: ctx.nextOrder++, kind: 'return-workers', path: planned.path,
    quantity: planned.quantity, actionSpaceIds: ids,
    parameters: {
      ...planned.operation.parameters,
      ...(planned.operation.parameters.from === 'resolving-action-space' && ids[0]
        ? { resolvedActionSpaceId: ids[0] } : {}),
    },
  });
}

function executeOperation(ctx: ExecutionContext, planned: FeastOccupationPlannedOperation): void {
  if (!planned.valid) fail('plan', planned.path, planned.issues[0]?.message ?? 'Planned operation is invalid');
  switch (planned.kind) {
    case 'transfer': executeTransfer(ctx, planned); return;
    case 'exchange': executeExchange(ctx, planned); return;
    case 'choice': executeChoice(ctx, planned); return;
    case 'discount':
      ctx.modifiers.push({ order: ctx.nextOrder++, kind: 'discount', path: planned.path, target: planned.operation.target, amount: planned.amount,
        floor: planned.operation.floor, ...(planned.operation.exclusions ? { exclusions: planned.operation.exclusions } : {}),
        ...(planned.operation.parameters ? { parameters: planned.operation.parameters } : {}) });
      return;
    case 'modify-die':
      ctx.modifiers.push({ order: ctx.nextOrder++, kind: 'modify-die', path: planned.path, actions: planned.operation.actions,
        delta: planned.operation.delta, ...(planned.per ? { per: planned.per } : {}),
        ...(planned.operation.parameters ? { parameters: planned.operation.parameters } : {}) });
      return;
    case 'draw-weapons': {
      if (planned.operation.selection === 'random') {
        for (let count = 0; count < planned.quantity; count++) {
          const weapon = feastDrawWeapon(ctx.state);
          if (!weapon) fail('supply', planned.path, `Only ${count} of ${planned.quantity} random weapon card(s) could be drawn`);
          ctx.player.weapons[weapon]++;
          recordMutation(ctx, planned.path, 'weapon-supply', { item: weapon, id: weapon, quantity: 1 }, 1, 'draw');
        }
      } else if (planned.operation.selection === 'named') {
        const named = planned.operation.named ?? [];
        if (!named.length && planned.quantity > 0) fail('plan', planned.path, 'Named weapon draw has no named weapon');
        for (let count = 0; count < planned.quantity; count++) awardNamedWeapon(ctx, planned.path, named[count % named.length], 'draw');
      } else {
        const targetCount = planned.quantity;
        const named = planned.operation.named ?? [];
        if (!named.length && targetCount > 0) fail('plan', planned.path, 'Fill-to-count weapon draw has no weapon list');
        for (const weapon of named) for (let count = ctx.player.weapons[weapon]; count < targetCount; count++) awardNamedWeapon(ctx, planned.path, weapon, 'draw');
      }
      return;
    }
    case 'grant-action':
      ctx.deferred.push({ order: ctx.nextOrder++, kind: 'grant-action', path: planned.path, action: planned.operation.action,
        ...(planned.operation.parameters ? { parameters: planned.operation.parameters } : {}) });
      return;
    case 'replace': {
      const before = ctx.deferred.length + ctx.applied.length + ctx.modifiers.length;
      const registration: FeastOccupationReplacementRegistration = {
        order: ctx.nextOrder++, path: planned.path, target: planned.operation.target,
        ...(planned.operation.parameters ? { parameters: planned.operation.parameters } : {}),
        replacementPaths: planned.replacement.map((operation) => operation.path),
      };
      ctx.replacements.push(registration);
      executeOperations(ctx, planned.replacement);
      if (before === ctx.deferred.length + ctx.applied.length + ctx.modifiers.length && planned.replacement.length) {
        fail('orchestration', planned.path, 'Replacement produced no executable registration or mutation');
      }
      return;
    }
    case 'modify-rule':
      ctx.modifiers.push({ order: ctx.nextOrder++, kind: 'modify-rule', path: planned.path, rule: planned.operation.rule,
        value: planned.value, ...(planned.operation.parameters ? { parameters: planned.operation.parameters } : {}) });
      return;
    case 'move': {
      const target = moveTarget(ctx, planned);
      ctx.deferred.push({ order: ctx.nextOrder++, kind: 'move', path: planned.path,
        subject: { item: planned.subject.item, id: planned.subject.id ?? planned.subject.item, quantity: planned.subject.quantity,
          ...(planned.subject.state ? { state: planned.subject.state } : {}) },
        from: planned.operation.from, to: planned.operation.to, target,
        ...(planned.operation.parameters ? { parameters: planned.operation.parameters } : {}) });
      return;
    }
    case 'return-workers': executeReturnWorkers(ctx, planned); return;
    case 'phase':
      ctx.deferred.push({ order: ctx.nextOrder++, kind: 'phase', path: planned.path, phase: planned.operation.phase, scope: planned.operation.scope });
      return;
    case 'score':
      ctx.modifiers.push({ order: ctx.nextOrder++, kind: 'score', path: planned.path, currency: planned.operation.currency,
        amount: planned.amount, ...(planned.operation.parameters ? { parameters: planned.operation.parameters } : {}) });
      return;
  }
}

function executeOperations(ctx: ExecutionContext, operations: readonly FeastOccupationPlannedOperation[]): void {
  for (const operation of operations) executeOperation(ctx, operation);
}

function rejectSurplusSelection(ctx: ExecutionContext): void {
  for (const key of Object.keys(ctx.selection.choices ?? {})) if (!ctx.usedChoices.has(key)) fail('selection', key, `Choice key ${key} is not active in the selected plan branch`);
  for (const key of Object.keys(ctx.selection.repeats ?? {})) if (!ctx.usedRepeats.has(key)) fail('selection', key, `Repeat key ${key} is not active in the selected plan branch`);
  for (const key of Object.keys(ctx.selection.targets ?? {})) if (!ctx.usedTargets.has(key)) fail('selection', key, `Target key ${key} is not used by the selected plan branch`);
  if (ctx.selection.optionIds !== undefined && !ctx.topChoiceUsed && ctx.selection.optionIds.length) fail('selection', 'optionIds', 'This plan has no active convenience choice');
}

const friendly = (id: string): string => id.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
const promptOption = (id: string, detail?: string): FeastOccupationPromptOption => ({ id, label: friendly(id), ...(detail ? { detail } : {}) });

function promptTargetKind(item: FeastOccupationResolvedItem): Extract<FeastOccupationPromptRequest, { kind: 'target' }>['targetKind'] {
  if (item.item === 'good' || item.item === 'bonus-good' || item.item === 'farm-animal' || GOOD_IDS.has(item.item as FeastGood)) return 'good';
  if (item.item === 'building-resource' || RESOURCE_IDS.has(item.item as FeastBuildingResource)) return 'resource';
  if (item.item === 'weapon-card' || WEAPON_IDS.has(item.item as FeastWeapon)) return 'weapon';
  if (item.item === 'ship' || SHIP_IDS.has(item.item as FeastShipType)) return 'ship';
  if (item.item === 'special-tile') return 'special';
  if (item.item === 'exploration-board') return 'exploration';
  if (item.item === 'occupation-card') return 'occupation';
  return 'board';
}

function promptOptionsForItem(
  state: FeastState, seat: number, item: FeastOccupationResolvedItem, source: boolean,
): FeastOccupationPromptOption[] {
  const player = state.players[seat];
  if (!player) return [];
  if (item.item === 'good' || item.item === 'bonus-good') {
    return FEAST_GOOD_IDS.filter((id) =>
      (!source || player.goods[id] > 0)
      && !(item.state?.excludeAnimals === true && FARM_ANIMALS.has(id))
      && !(typeof item.state?.mustHaveExactly === 'number' && player.goods[id] !== item.state.mustHaveExactly)
    ).map((id) => promptOption(id, source ? `${player.goods[id]} owned` : FEAST_GOOD_BY_ID[id].color));
  }
  if (item.item === 'farm-animal') {
    const ids = item.id === 'sheep' ? ['sheep', 'pregnant-sheep'] as const
      : item.id === 'cattle' ? ['cattle', 'pregnant-cattle'] as const
        : ['sheep', 'pregnant-sheep', 'cattle', 'pregnant-cattle'] as const;
    return ids.filter((id) => !source || player.goods[id] > 0).map((id) => promptOption(id, `${player.goods[id]} owned`));
  }
  if (item.item === 'building-resource') return [...RESOURCE_IDS].filter((id) => !source || player.resources[id] > 0).map((id) => promptOption(id, `${player.resources[id]} owned`));
  if (item.item === 'weapon-card') return [...WEAPON_IDS].filter((id) => !source || player.weapons[id] > 0).map((id) => promptOption(id, `${player.weapons[id]} owned`));
  if (item.item === 'ship') return [...SHIP_IDS].filter((id) => !source || activeShips(player, id).length > 0).map((id) => promptOption(id, `${activeShips(player, id).length} active`));
  if (item.item === 'house') return [...HOUSE_IDS].filter((id) => !source || player.boards.some((board) => board.definitionId === id)).map((id) => promptOption(id));
  if (item.item === 'special-tile') return (source ? player.specials : state.specialSupply).map((id) => promptOption(id));
  if (item.item === 'exploration-board') {
    const excluded = Array.isArray(item.state?.excludeFaces)
      ? item.state.excludeFaces.filter((face): face is string => typeof face === 'string') : [];
    return state.explorations.filter((entry) => (source ? entry.claimedBy === seat : entry.claimedBy === null)
      && !excluded.includes(entry.face)).map((entry) => promptOption(entry.boardId, entry.face));
  }
  if (item.item === 'occupation-card') {
    const ids = source ? player.occupationHand : [...state.occupationDeck, ...state.occupationDiscard];
    return [...new Set(ids)].map((id) => promptOption(id));
  }
  return [];
}

function destinationPromptOptions(state: FeastState, seat: number, destination: string): FeastOccupationPromptOption[] {
  const player = state.players[seat];
  if (!player) return [];
  if (destination === 'immediate-home-or-exploration-placement') {
    return player.boards.filter((board) => board.kind === 'home' || board.kind === 'exploration')
      .map((board) => promptOption(board.id, friendly(board.definitionId)));
  }
  if (destination.startsWith('vacated-')) {
    const specialId = destination.includes('cloakpin') ? 'cloakpin'
      : destination.includes('drinking-horn') ? 'drinking-horn' : null;
    return state.players.flatMap((owner) => owner.boards.flatMap((board) =>
      board.placements.filter((placement) => !specialId || placement.pieceId === specialId)
        .map((placement) => promptOption(placement.id, `${owner.name} - ${friendly(board.definitionId)}`))));
  }
  return player.boards.map((board) => promptOption(board.id, friendly(board.definitionId)));
}

function movePromptOptions(
  state: FeastState, seat: number, planned: Extract<FeastOccupationPlannedOperation, { kind: 'move' }>,
): { kind: Extract<FeastOccupationPromptRequest, { kind: 'target' }>['targetKind']; options: FeastOccupationPromptOption[]; min: number; max: number } {
  const player = state.players[seat];
  if (!player) return { kind: 'placement', options: [], min: 0, max: 0 };
  const { from, to } = planned.operation;
  if (from === 'whaling-boat-or-longship' || from === 'selected-raiding-longship' || from === 'selected-pillaging-longship') {
    const ships = activeShips(player).filter((ship) => ship.type !== 'knarr' && ship.ore > 0);
    return { kind: 'ship', options: ships.map((ship) => promptOption(ship.id, `${friendly(ship.type)} - ${ship.ore} removable ore`)), min: 1, max: Math.max(1, Math.min(planned.subject.quantity, ships.length)) };
  }
  if (from === 'supply' && to === 'empty-shed-cell') {
    const boards = player.boards.filter((board) => board.definitionId === 'shed');
    return { kind: 'board', options: boards.map((board) => promptOption(board.id, 'Shed')), min: 1, max: 1 };
  }
  if (from === 'any-player-board') {
    const placements = state.players.flatMap((owner) => owner.boards.flatMap((board) => board.placements
      .filter((placement) => placement.pieceId === planned.subject.id)
      .map((placement) => promptOption(placement.id, `${owner.name} - ${friendly(board.definitionId)}`))));
    return { kind: 'placement', options: placements, min: 1, max: 1 };
  }
  if (from === 'banquet-table') {
    const boards = player.boards.filter((board) => board.definitionId === 'stone-house' || board.definitionId === 'long-house')
      .map((board) => promptOption(board.id, friendly(board.definitionId)));
    return { kind: 'board', options: boards, min: 1, max: Math.max(1, Math.min(planned.subject.quantity, boards.length)) };
  }
  if (from === 'supply' && to === 'new-longship') return { kind: 'ship', options: [promptOption('new-longship', 'The longship created by this card')], min: 1, max: 1 };
  return { kind: 'placement', options: [], min: 1, max: Math.max(1, planned.subject.quantity) };
}

function workerPromptOptions(state: FeastState, seat: number, soloActiveColorOnly: boolean): FeastOccupationPromptOption[] {
  const activeOnly = soloActiveColorOnly && state.players.length === 1;
  const activeColor = state.players[seat].activeWorkerColor;
  return state.actionSpaces.flatMap((space) => {
    const workers = space.occupants.filter((occupant) => occupant.seat === seat
      && (!activeOnly || occupant.workerColor === activeColor))
      .reduce((sum, occupant) => sum + occupant.workers, 0);
    return workers > 0 ? [promptOption(space.id, `${workers} Viking${workers === 1 ? '' : 's'} available to return`)] : [];
  });
}

function buildPromptRequests(
  state: FeastState, seat: number, operations: readonly FeastOccupationPlannedOperation[],
  dependencies: readonly FeastOccupationPromptDependency[], out: FeastOccupationPromptRequest[],
): void {
  for (const planned of operations) {
    switch (planned.kind) {
      case 'transfer': {
        const specialDestination = planned.operation.destination && !SUPPLY_DESTINATIONS.has(planned.operation.destination);
        const selectable = planned.items.filter((item) => item.needsSelection || item.id?.startsWith('$')).length;
        planned.items.forEach((item, index) => {
          if (!item.needsSelection && !item.id?.startsWith('$')) return;
          const key = selectable === 1 && !specialDestination ? planned.path : `${planned.path}.items[${index}]`;
          out.push({ kind: 'target', key, label: `Choose ${item.id?.startsWith('$') ? item.item : item.id ?? item.item}`,
            targetKind: promptTargetKind(item), min: 1, max: Math.max(1, item.quantity),
            options: promptOptionsForItem(state, seat, item, planned.operation.mode !== 'gain'), dependencies });
        });
        if (specialDestination) {
          const pieceCount = planned.items.reduce((sum, item) => sum + item.quantity, 0);
          const splitAcrossBoards = planned.operation.destination === 'immediate-home-or-exploration-placement';
          out.push({ kind: 'target', key: planned.path, label: `Choose destination for ${planned.operation.destination}`,
            targetKind: 'board', min: 1, max: splitAcrossBoards ? Math.max(1, pieceCount) : 1,
            options: destinationPromptOptions(state, seat, planned.operation.destination!), dependencies });
        }
        break;
      }
      case 'exchange': {
        if (planned.operation.repeat !== 'once') out.push({ kind: 'repeat', key: planned.path, label: 'Choose number of exchanges', min: 0, max: planned.maximumRepeats, dependencies });
        const selectable = [...planned.from, ...planned.to].filter((item) => item.needsSelection || item.id?.startsWith('$')).length;
        planned.from.forEach((item, index) => {
          const concreteShip = SHIP_IDS.has(item.item as FeastShipType) && activeShips(state.players[seat], item.item as FeastShipType).length > item.quantity;
          if (!item.needsSelection && !item.id?.startsWith('$') && !concreteShip) return;
          const key = !concreteShip && selectable === 1 ? planned.path : `${planned.path}.from[${index}]`;
          const options = concreteShip
            ? activeShips(state.players[seat], item.item as FeastShipType).map((ship) => promptOption(ship.id, `${ship.ore} added ore`))
            : promptOptionsForItem(state, seat, item, true);
          out.push({ kind: 'target', key, label: `Choose payment ${item.id ?? item.item}`,
            targetKind: concreteShip ? 'ship' : promptTargetKind(item), min: 1,
            max: Math.max(1, item.quantity * (planned.operation.repeat === 'once' ? 1 : planned.maximumRepeats)),
            ...(planned.operation.repeat === 'once' ? {} : { perRepeat: item.quantity }), options, dependencies });
        });
        planned.to.forEach((item, index) => {
          if (!item.needsSelection && !item.id?.startsWith('$')) return;
          out.push({ kind: 'target', key: selectable === 1 ? planned.path : `${planned.path}.to[${index}]`, label: `Choose received ${item.item}`,
            targetKind: promptTargetKind(item), min: 1,
            max: Math.max(1, item.quantity * (planned.operation.repeat === 'once' ? 1 : planned.maximumRepeats)),
            ...(planned.operation.repeat === 'once' ? {} : { perRepeat: item.quantity }),
            options: promptOptionsForItem(state, seat, item, false), dependencies });
        });
        break;
      }
      case 'choice':
        out.push({ kind: 'choice', key: planned.path, label: 'Choose occupation option', min: planned.min, max: planned.max,
          options: planned.options.map((option) => ({ id: option.id, label: friendly(option.id),
            ...(option.valid ? {} : { disabled: true, reason: option.issues[0]?.message ?? 'Not currently legal' }) })), dependencies });
        for (const option of planned.options) buildPromptRequests(state, seat, option.operations,
          [...dependencies, { choicePath: planned.path, optionId: option.id }], out);
        break;
      case 'replace':
        buildPromptRequests(state, seat, planned.replacement, dependencies, out);
        break;
      case 'move': {
        if (planned.subject.quantity === 0) break;
        if (planned.boundTarget !== undefined) break;
        const request = movePromptOptions(state, seat, planned);
        out.push({ kind: 'target', key: planned.path, label: `Choose ${friendly(planned.operation.from)} target`,
          targetKind: request.kind, min: request.min, max: request.max, options: request.options, dependencies });
        break;
      }
      case 'return-workers':
        if (planned.quantity > 0 && !planned.actionSpaceIds?.length) out.push({ kind: 'target', key: planned.path, label: 'Choose action space(s) to return Vikings from',
          targetKind: 'action-space', min: 1, max: Math.max(1, planned.quantity),
          options: workerPromptOptions(state, seat, planned.operation.parameters.soloActiveColorOnly === true), dependencies });
        break;
      default: break;
    }
  }
}

/**
 * Describe every field needed to render one structured `card-effect` decision.
 * Requests in nested choice branches carry explicit dependencies; the client
 * submits only the active branch, matching executor surplus-key validation.
 */
export function feastOccupationPromptModel(
  state: FeastState, seat: number, plan: FeastOccupationPlan,
): FeastOccupationPromptModel {
  const requests: FeastOccupationPromptRequest[] = [];
  if (!plan.automatic || plan.requiresConfirmation) requests.push({
    kind: 'confirmation', key: 'accepted',
    label: plan.requirement === 'mandatory' ? 'Resolve mandatory effect' : 'Use this occupation effect?',
    mandatory: plan.requirement === 'mandatory', dependencies: [],
  });
  buildPromptRequests(state, seat, plan.operations, [], requests);
  const rule = feastOccupationRule(plan.cardId);
  return {
    planKey: plan.usage.key, cardId: plan.cardId, cardNumber: plan.cardNumber,
    cardName: plan.cardName, sourceText: rule?.sourceText ?? '', clauseId: plan.clauseId,
    requirement: plan.requirement, acceptedByDefault: plan.requirement === 'mandatory', requests,
  };
}

/** Execute one already-planned occupation clause atomically. */
export function feastExecuteOccupationPlan(
  state: FeastState, seat: number, plan: FeastOccupationPlan,
  selection: FeastOccupationSelection,
): FeastOccupationExecutionResult {
  const planProblem = canonicalPlanError(plan);
  if (planProblem) return { ok: false, accepted: false, errors: [{ code: 'plan', path: `${plan.cardId}.${plan.clauseId}`, message: planProblem }] };
  if (!plan.valid) return { ok: false, accepted: false, errors: plan.issues.map((entry) => ({ code: entry.code === 'context' || entry.code === 'limit' ? 'plan' : entry.code, path: entry.path, message: entry.message })) };
  const player = state.players[seat];
  if (!player) return { ok: false, accepted: false, errors: [{ code: 'ownership', path: 'seat', message: `Unknown Feast seat ${seat}` }] };
  const cardOwned = player.playedOccupations.includes(plan.cardId)
    || (plan.trigger.hook === 'card-played' && player.occupationHand.includes(plan.cardId));
  if (!cardOwned) return { ok: false, accepted: false, errors: [{ code: 'ownership', path: plan.cardId, message: 'The player does not own this played occupation' }] };
  if (typeof selection.accepted !== 'boolean') return { ok: false, accepted: false, errors: [{ code: 'selection', path: 'accepted', message: 'Occupation selection must explicitly accept or decline' }] };
  if (!selection.accepted) {
    if (plan.requirement === 'mandatory') return { ok: false, accepted: false, errors: [{ code: 'selection', path: plan.clauseId, message: 'This occupation effect is mandatory' }] };
    const hasPayload = (selection.optionIds?.length ?? 0) > 0 || Object.keys(selection.choices ?? {}).length > 0
      || Object.keys(selection.repeats ?? {}).length > 0 || Object.keys(selection.targets ?? {}).length > 0;
    if (hasPayload) return { ok: false, accepted: false, errors: [{ code: 'selection', path: plan.clauseId, message: 'A declined occupation effect cannot include choices, repeats, or targets' }] };
    return { ok: true, accepted: false, nextState: structuredClone(state), applied: [], deferred: [], modifiers: [], replacements: [], usage: null };
  }

  const nextState = structuredClone(state);
  const ctx: ExecutionContext = {
    state: nextState, seat, player: nextState.players[seat], plan, selection,
    applied: [], deferred: [], modifiers: [], replacements: [],
    usedChoices: new Set(), usedRepeats: new Set(), usedTargets: new Set(),
    topChoiceUsed: false, latestGainedShipId: null, vacatedPlacement: null, nextOrder: 0,
  };
  try {
    executeOperations(ctx, plan.operations);
    rejectSurplusSelection(ctx);
    return {
      ok: true, accepted: true, nextState, applied: ctx.applied,
      deferred: ctx.deferred, modifiers: ctx.modifiers,
      replacements: ctx.replacements, usage: { ...plan.usage },
    };
  } catch (error) {
    if (error instanceof ExecutionAbort) return { ok: false, accepted: false, errors: [error.issue] };
    throw error;
  }
}
