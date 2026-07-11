import {
  FEAST_ACTION_BY_ID, FEAST_ACTION_SPACES, FEAST_GOOD_BY_ID, FEAST_GOOD_IDS,
  FEAST_OCCUPATION_BY_ID,
} from './data.js';
import {
  feastBoardDefinition, feastBonusesForBoard, feastIncomeForBoard,
  feastMakePlacement, feastPieceSpec, feastPlacementPreviewError,
} from './placement.js';
import {
  feastActionReason, feastBreedPlayer, feastEvent, feastId,
  feastResolveBonusScope,
} from './state.js';
import type { FeastOccupationDeferredCommand, FeastOccupationConcreteItem } from './occupationExecutor.js';
import type {
  FeastOccupationAction, FeastOccupationQuantity, FeastRuleRecord, FeastRuleValue,
} from './occupationRules.js';
import { feastOccupationQuantity } from './occupationRuntime.js';
import type {
  FeastBoardState, FeastBuildingResource, FeastBuildingType, FeastGood,
  FeastPlacement, FeastPlayer, FeastShip, FeastShipType, FeastState,
} from './types.js';

/**
 * Reducer-neutral interpreter for the concrete commands emitted by the
 * occupation executor. It deliberately has no dependency on actions.ts.
 * Every mutation is made on a clone and is returned only after the complete
 * command validates, so a stale target can never leave a partial mutation.
 */

export type FeastOccupationDeferredErrorCode =
  | 'seat' | 'target' | 'inventory' | 'supply' | 'capacity' | 'geometry'
  | 'parameters' | 'unsupported';

export interface FeastOccupationDeferredError {
  code: FeastOccupationDeferredErrorCode;
  path: string;
  message: string;
}

export interface FeastOccupationDeferredAudit {
  order: number;
  path: string;
  kind: 'phase' | 'workers' | 'ore' | 'special' | 'ship' | 'board' | 'banquet' | 'placement';
  message: string;
  amount?: number;
  subjectId?: string;
  sourceId?: string;
  destinationId?: string;
  placementIds?: readonly string[];
}

export interface FeastOccupationDeferredOption {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  reason?: string;
  meta?: FeastRuleRecord;
}

export type FeastOccupationDeferredTargetKind =
  | 'confirmation' | 'good' | 'ship' | 'board' | 'mountain-strip'
  | 'occupation' | 'action-space' | 'placement';

export interface FeastOccupationGrantActionIntent {
  kind: 'grant-action';
  path: string;
  order: number;
  action: FeastOccupationAction;
  label: string;
  prompt: string;
  targetKind: FeastOccupationDeferredTargetKind;
  min: number;
  max: number;
  options: readonly FeastOccupationDeferredOption[];
  /** Exact registry-authored input, retained for reducer validation/audit. */
  parameters: FeastRuleRecord;
  /** State-relative quantities (round/count/tier) resolved at this boundary. */
  resolvedParameters: FeastRuleRecord;
}

export interface FeastOccupationFeastIntent {
  kind: 'feast';
  path: string;
  order: number;
  scope: 'self';
  label: string;
  prompt: string;
  targetKind: 'confirmation';
  min: 1;
  max: 1;
  options: readonly FeastOccupationDeferredOption[];
}

export interface FeastOccupationPlacementIntent {
  kind: 'placement';
  path: string;
  order: number;
  source: 'gain-direct' | 'supply-to-shed' | 'banquet-to-house';
  label: string;
  prompt: string;
  targetKind: 'placement';
  min: number;
  max: number;
  options: readonly FeastOccupationDeferredOption[];
  pieces: readonly string[];
  destinationBoardIds: readonly string[];
  /** When present, the selected placements must cover this footprint exactly. */
  requiredCells?: readonly { x: number; y: number }[];
  /** Sequential choices are revalidated after every placement; configurations choose one complete packing. */
  selectionMode: 'sequential' | 'configuration';
}

export type FeastOccupationDeferredIntent =
  | FeastOccupationGrantActionIntent
  | FeastOccupationFeastIntent
  | FeastOccupationPlacementIntent;

/** Transient, server-owned provenance needed only while an ordered command list runs. */
export interface FeastOccupationDeferredContext {
  latestShipId?: string;
  vacated?: {
    placement: FeastPlacement;
    boardId: string;
    ownerSeat: number;
  };
  /** Optional action/event facts used to narrow parameterized action grants. */
  eventFields?: FeastRuleRecord;
}

export interface FeastOccupationDeferredSuccess {
  ok: true;
  nextState: FeastState;
  audit: readonly FeastOccupationDeferredAudit[];
  intent: FeastOccupationDeferredIntent | null;
  context: FeastOccupationDeferredContext;
}

export interface FeastOccupationDeferredFailure {
  ok: false;
  error: FeastOccupationDeferredError;
}

export type FeastOccupationDeferredResult =
  | FeastOccupationDeferredSuccess | FeastOccupationDeferredFailure;

export interface FeastOccupationDeferredBatchSuccess extends FeastOccupationDeferredSuccess {
  /** Commands actually mutated; excludes the command represented by intent. */
  consumed: number;
  /** Index of the command represented by intent, when resolution paused. */
  intentIndex: number | null;
}

export type FeastOccupationDeferredBatchResult =
  | FeastOccupationDeferredBatchSuccess | FeastOccupationDeferredFailure;

class DeferredAbort extends Error {
  constructor(readonly issue: FeastOccupationDeferredError) {
    super(issue.message);
  }
}

function abort(
  code: FeastOccupationDeferredErrorCode, path: string, message: string,
): never {
  throw new DeferredAbort({ code, path, message });
}

const rotations = [0, 90, 180, 270] as const;
const activeShips = (player: FeastPlayer, type?: FeastShipType): FeastShip[] =>
  player.ships.filter((ship) => !ship.emigrated && (!type || ship.type === type));
const title = (id: string): string => id.split('-').map((part) =>
  part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');

/** Stable encoding accepted by direct-placement commands and emitted by intents. */
export function feastEncodeOccupationPlacementTarget(
  boardId: string, x: number, y: number, rotation: 0 | 90 | 180 | 270,
): string {
  return `${boardId}@${x},${y},${rotation}`;
}

export interface FeastOccupationEncodedPlacement {
  boardId: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

/** Decode the canonical form and a JSON-object form useful to saved tooling. */
export function feastDecodeOccupationPlacementTarget(
  raw: string,
): FeastOccupationEncodedPlacement | null {
  const canonical = /^(.*)@(-?\d+),(-?\d+),(0|90|180|270)$/.exec(raw);
  if (canonical && canonical[1]) return {
    boardId: canonical[1], x: Number(canonical[2]), y: Number(canonical[3]),
    rotation: Number(canonical[4]) as FeastOccupationEncodedPlacement['rotation'],
  };
  if (raw.startsWith('{')) {
    try {
      const value = JSON.parse(raw) as Partial<FeastOccupationEncodedPlacement>;
      if (typeof value.boardId === 'string' && value.boardId
        && Number.isSafeInteger(value.x) && Number.isSafeInteger(value.y)
        && rotations.includes(value.rotation as typeof rotations[number])) {
        return value as FeastOccupationEncodedPlacement;
      }
    } catch { /* malformed JSON is simply not an encoded placement */ }
  }
  return null;
}

function targetIds(
  target: string | number | readonly string[], path: string, allowEmpty = false,
): string[] {
  if (typeof target === 'string') {
    if (!target) abort('target', path, 'Target id cannot be empty');
    return [target];
  }
  if (Array.isArray(target)) {
    if ((!allowEmpty && !target.length) || target.some((id) => typeof id !== 'string' || !id)) {
      abort('target', path, 'Targets must be non-empty string ids');
    }
    return [...target];
  }
  abort('target', path, 'This command requires string target ids');
}

function placementTargets(
  target: string | number | readonly string[], path: string,
): { encoded: FeastOccupationEncodedPlacement[]; plain: string[] } {
  const ids = targetIds(target, path);
  const decoded = ids.map(feastDecodeOccupationPlacementTarget);
  if (decoded.some(Boolean) && decoded.some((entry) => !entry)) {
    abort('target', path, 'Do not mix encoded placement targets with plain board ids');
  }
  return decoded[0]
    ? { encoded: decoded as FeastOccupationEncodedPlacement[], plain: [] }
    : { encoded: [], plain: ids };
}

function numericSuffix(id: string): number {
  const match = /-(\d+)$/.exec(id);
  return match ? Number(match[1]) : -1;
}

function harvestGoods(state: FeastState): FeastGood[] {
  const level = state.options.length === 'long'
    ? ([1, 2, 0, 3, 0, 4, 0] as const)[state.round - 1] ?? 0
    : ([1, 0, 2, 0, 3, 0] as const)[state.round - 1] ?? 0;
  return level === 0 ? [] : [
    'peas', 'beans', 'flax', ...(level >= 2 ? ['grain' as const] : []),
    ...(level >= 3 ? ['cabbage' as const] : []),
    ...(level >= 4 ? ['fruits' as const] : []),
  ];
}

function interpretPhase(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'phase' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  if (command.scope !== 'self' && command.phase !== 'bonus') {
    abort('parameters', command.path, `${command.phase} supports only the self scope`);
  }
  if (command.phase === 'feast') {
    if (command.scope !== 'self') abort('parameters', command.path, 'A private Feast must use self scope');
    return {
      ok: true, nextState: state, audit: [], context,
      intent: {
        kind: 'feast', path: command.path, order: command.order, scope: 'self',
        label: 'Occupation Feast',
        prompt: 'Resolve one complete private Feast using the ordinary Banquet Table rules.',
        targetKind: 'confirmation', min: 1, max: 1,
        options: [{ id: 'begin-feast', label: 'Begin Private Feast' }],
      },
    };
  }
  const player = state.players[seat];
  const audit: FeastOccupationDeferredAudit[] = [];
  if (command.phase === 'breeding') {
    const before = player.goods.sheep + player.goods['pregnant-sheep']
      + player.goods.cattle + player.goods['pregnant-cattle'];
    feastBreedPlayer(player);
    const after = player.goods.sheep + player.goods['pregnant-sheep']
      + player.goods.cattle + player.goods['pregnant-cattle'];
    feastEvent(state, seat, 'Occupation breeding resolved', 'Sheep and cattle resolved independently');
    audit.push({ order: command.order, path: command.path, kind: 'phase', amount: after - before,
      message: 'Resolved a private breeding phase' });
  } else if (command.phase === 'income') {
    const amount = player.boards.reduce((sum, board) => sum + feastIncomeForBoard(board), 0);
    player.silver += amount;
    feastEvent(state, seat, 'Occupation income resolved', `${amount} silver`);
    audit.push({ order: command.order, path: command.path, kind: 'phase', amount,
      message: `Paid ${amount} private income` });
  } else if (command.phase === 'harvest') {
    const goods = harvestGoods(state);
    for (const good of goods) player.goods[good]++;
    feastEvent(state, seat, 'Occupation harvest resolved', goods.length ? goods.join(', ') : 'No harvest this round');
    audit.push({ order: command.order, path: command.path, kind: 'phase', amount: goods.length,
      message: goods.length ? `Gained ${goods.join(', ')}` : 'This round has no harvest' });
  } else if (command.phase === 'bonus') {
    const amount = feastResolveBonusScope(state, seat, command.scope);
    audit.push({ order: command.order, path: command.path, kind: 'phase', amount,
      message: `Resolved ${command.scope} board bonuses` });
  }
  return { ok: true, nextState: state, audit, intent: null, context };
}

function interpretReturnWorkers(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'return-workers' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  if (!Number.isSafeInteger(command.quantity) || command.quantity < 0) {
    abort('parameters', command.path, 'Returned Viking quantity must be a non-negative safe integer');
  }
  const ids = [...command.actionSpaceIds];
  if (new Set(ids).size !== ids.length) abort('target', command.path, 'Action-space targets must be distinct');
  if (command.parameters.from === 'each-fourth-column-space'
    && ids.some((id) => FEAST_ACTION_BY_ID[id]?.column !== 4)) {
    abort('target', command.path, 'Homecomer can return Vikings only from fourth-column spaces');
  }
  if (command.parameters.from === 'resolving-action-space') {
    const resolving = command.parameters.resolvedActionSpaceId;
    if (typeof resolving !== 'string' || ids.length !== 1 || ids[0] !== resolving) {
      abort('target', command.path, 'Return the Viking from the action space that just resolved');
    }
  }
  if (command.parameters.sameSpace === true && ids.length > 1) {
    abort('target', command.path, 'These Vikings must return from one action space');
  }
  const player = state.players[seat];
  const activeOnly = command.parameters.soloActiveColorOnly === true && state.players.length === 1;
  const capacities = ids.map((id) => {
    const space = state.actionSpaces.find((candidate) => candidate.id === id);
    if (!space) abort('target', command.path, `Unknown action space ${id}`);
    const maximum = typeof command.parameters.maximumPerSpace === 'number'
      ? command.parameters.maximumPerSpace : Number.POSITIVE_INFINITY;
    const owned = space.occupants.filter((occupant) => occupant.seat === seat
      && (!activeOnly || occupant.workerColor === player.activeWorkerColor))
      .reduce((sum, occupant) => sum + occupant.workers, 0);
    if (!owned && command.quantity > 0) abort('target', command.path, `No owned Vikings remain on ${id}`);
    return Math.min(owned, maximum);
  });
  if (capacities.reduce((sum, amount) => sum + amount, 0) < command.quantity) {
    abort('inventory', command.path, 'The selected action spaces no longer contain enough Vikings');
  }
  let remaining = command.quantity;
  for (let index = 0; index < ids.length && remaining > 0; index++) {
    const space = state.actionSpaces.find((candidate) => candidate.id === ids[index])!;
    let fromSpace = Math.min(remaining, capacities[index]);
    for (const occupant of [...space.occupants]) {
      if (occupant.seat !== seat || (activeOnly && occupant.workerColor !== player.activeWorkerColor) || fromSpace <= 0) continue;
      const amount = Math.min(fromSpace, occupant.workers);
      occupant.workers -= amount;
      fromSpace -= amount;
      remaining -= amount;
      if (occupant.workerColor === player.activeWorkerColor) player.workersAvailable += amount;
      else player.workersWaiting += amount;
      if (occupant.workers === 0) space.occupants.splice(space.occupants.indexOf(occupant), 1);
    }
  }
  if (remaining) abort('inventory', command.path, 'Viking targets became stale during resolution');
  const activeTotal = player.workersByColor[player.activeWorkerColor] ?? player.workersTotal;
  if (player.workersAvailable > activeTotal) abort('capacity', command.path, 'Returned active Vikings exceed their color total');
  feastEvent(state, seat, 'Occupation returned Vikings', `${command.quantity} returned to the Thing Square`);
  return {
    ok: true, nextState: state, intent: null, context,
    audit: [{ order: command.order, path: command.path, kind: 'workers', amount: command.quantity,
      message: `Returned ${command.quantity} Viking${command.quantity === 1 ? '' : 's'}` }],
  };
}

function shadowWithPiece(player: FeastPlayer, pieceId: string): FeastPlayer {
  const shadow = structuredClone(player);
  const spec = feastPieceSpec(pieceId);
  if (!spec) return shadow;
  if (spec.pieceKind === 'good') shadow.goods[spec.pieceId as FeastGood]++;
  else if (spec.pieceKind === 'silver') shadow.silver++;
  else if (spec.pieceKind === 'ore' || spec.pieceKind === 'wood' || spec.pieceKind === 'stone') {
    shadow.resources[spec.pieceKind]++;
  } else if (spec.pieceKind === 'special' && !shadow.specials.includes(spec.pieceId)) shadow.specials.push(spec.pieceId);
  return shadow;
}

function placementOptions(
  state: FeastState, seat: number, boardIds: readonly string[], pieceId: string,
  allowDesignatedResource = false,
): FeastOccupationDeferredOption[] {
  const player = state.players[seat];
  const out: FeastOccupationDeferredOption[] = [];
  const seen = new Set<string>();
  for (const boardId of boardIds) {
    const board = player.boards.find((candidate) => candidate.id === boardId);
    const def = board ? feastBoardDefinition(board.definitionId) : null;
    if (!board || !def) continue;
    const shadow = shadowWithPiece(player, pieceId);
    for (const rotation of rotations) for (let y = 0; y < def.rows; y++) for (let x = 0; x < def.cols; x++) {
      if (feastPlacementPreviewError(shadow, board.id, pieceId, x, y, rotation, allowDesignatedResource)) continue;
      const placement = feastMakePlacement('preview', pieceId, x, y, rotation);
      const shape = placement.covered.map((cell) => `${cell.x},${cell.y}`).sort().join(';');
      const key = `${board.id}:${shape}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: feastEncodeOccupationPlacementTarget(board.id, x, y, rotation),
        label: `${title(board.definitionId)} (${x + 1}, ${y + 1})`,
        detail: rotation ? `${rotation} degree rotation` : 'Unrotated',
        meta: { boardId: board.id, x, y, rotation, pieceId },
      });
    }
  }
  return out;
}

function incrementPieceInventory(state: FeastState, seat: number, pieceId: string, path: string): void {
  const player = state.players[seat];
  const spec = feastPieceSpec(pieceId);
  if (!spec) abort('target', path, `Unknown placement piece ${pieceId}`);
  if (spec.pieceKind === 'good') player.goods[spec.pieceId as FeastGood]++;
  else if (spec.pieceKind === 'silver') player.silver++;
  else if (spec.pieceKind === 'ore' || spec.pieceKind === 'wood' || spec.pieceKind === 'stone') {
    player.resources[spec.pieceKind]++;
  } else if (spec.pieceKind === 'special') {
    if (player.specials.includes(spec.pieceId)) return;
    const supplyAt = state.specialSupply.indexOf(spec.pieceId);
    if (supplyAt < 0) abort('supply', path, `${spec.pieceId} is not available in the finite special-tile supply`);
    state.specialSupply.splice(supplyAt, 1);
    player.specials.push(spec.pieceId);
  }
}

function consumePlacedPiece(player: FeastPlayer, placement: FeastPlacement): void {
  if (placement.pieceKind === 'good') player.goods[placement.pieceId as FeastGood]--;
  else if (placement.pieceKind === 'silver') player.silver--;
  else if (placement.pieceKind === 'ore' || placement.pieceKind === 'wood' || placement.pieceKind === 'stone') {
    player.resources[placement.pieceKind]--;
  }
}

function placeGainedPieces(
  state: FeastState, seat: number, path: string, pieceIds: readonly string[],
  targets: readonly FeastOccupationEncodedPlacement[],
  requiredCells?: readonly { x: number; y: number }[],
): string[] {
  if (pieceIds.length !== targets.length) {
    abort('target', path, `Choose exactly ${pieceIds.length} encoded placement target${pieceIds.length === 1 ? '' : 's'}`);
  }
  const player = state.players[seat];
  const placementIds: string[] = [];
  const covered: { x: number; y: number }[] = [];
  for (let index = 0; index < pieceIds.length; index++) {
    const pieceId = pieceIds[index];
    const target = targets[index];
    incrementPieceInventory(state, seat, pieceId, path);
    const error = feastPlacementPreviewError(player, target.boardId, pieceId, target.x, target.y, target.rotation, false);
    if (error) abort('geometry', path, `${pieceId}: ${error}`);
    const board = player.boards.find((candidate) => candidate.id === target.boardId)!;
    const placement = feastMakePlacement(feastId(state, 'placement'), pieceId, target.x, target.y, target.rotation);
    consumePlacedPiece(player, placement);
    board.placements.push(placement);
    placementIds.push(placement.id);
    covered.push(...placement.covered);
  }
  if (requiredCells) {
    const wanted = [...requiredCells].map((cell) => `${cell.x},${cell.y}`).sort();
    const actual = covered.map((cell) => `${cell.x},${cell.y}`).sort();
    if (JSON.stringify(wanted) !== JSON.stringify(actual)) {
      abort('geometry', path, 'The gained tiles must cover exactly the cells vacated by the reclaimed special tile');
    }
  }
  return placementIds;
}

function placeOwnedPiece(
  state: FeastState, seat: number, path: string, pieceId: string,
  target: FeastOccupationEncodedPlacement, allowDesignatedResource = false,
): string {
  const player = state.players[seat];
  const error = feastPlacementPreviewError(player, target.boardId, pieceId, target.x, target.y, target.rotation, allowDesignatedResource);
  if (error) abort('geometry', path, `${pieceId}: ${error}`);
  const board = player.boards.find((candidate) => candidate.id === target.boardId)!;
  const placement = feastMakePlacement(feastId(state, 'placement'), pieceId, target.x, target.y, target.rotation);
  consumePlacedPiece(player, placement);
  board.placements.push(placement);
  return placement.id;
}

function concretePieces(items: readonly FeastOccupationConcreteItem[], path: string): string[] {
  const pieces: string[] = [];
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 0) abort('parameters', path, 'Placement quantities must be non-negative safe integers');
    if (!feastPieceSpec(item.id)) abort('target', path, `${item.id} is not a placeable Feast piece`);
    for (let count = 0; count < item.quantity; count++) pieces.push(item.id);
  }
  return pieces;
}

function requiredPlacementConfigurations(
  state: FeastState, seat: number, path: string, boardId: string,
  pieces: readonly string[], requiredCells: readonly { x: number; y: number }[],
): FeastOccupationDeferredOption[] {
  const required = new Set(requiredCells.map((cell) => `${cell.x},${cell.y}`));
  const configurations: string[][] = [];
  const seen = new Set<string>();
  const walk = (
    current: FeastState, index: number, targets: string[], covered: Set<string>,
  ): void => {
    if (configurations.length >= 256) return;
    if (index >= pieces.length) {
      if (covered.size !== required.size || [...required].some((cell) => !covered.has(cell))) return;
      const key = targets.join('|');
      if (!seen.has(key)) { seen.add(key); configurations.push(targets); }
      return;
    }
    for (const option of placementOptions(current, seat, [boardId], pieces[index])) {
      const target = feastDecodeOccupationPlacementTarget(option.id);
      if (!target) continue;
      const placement = feastMakePlacement('configuration-preview', pieces[index], target.x, target.y, target.rotation);
      const cells = placement.covered.map((cell) => `${cell.x},${cell.y}`);
      if (cells.some((cell) => !required.has(cell) || covered.has(cell))) continue;
      const next = structuredClone(current);
      placeGainedPieces(next, seat, path, [pieces[index]], [target]);
      walk(next, index + 1, [...targets, option.id], new Set([...covered, ...cells]));
    }
  };
  walk(state, 0, [], new Set());
  return configurations.map((targets, index) => ({
    id: `configuration-${index + 1}`,
    label: `Exact packing ${index + 1}`,
    detail: targets.map((target, piece) => `${title(pieces[piece])}: ${target}`).join('; '),
    meta: { targets, pieces: [...pieces], boardId },
  }));
}

function placementIntent(
  state: FeastState, seat: number, command: Pick<FeastOccupationDeferredCommand, 'path' | 'order'>,
  source: FeastOccupationPlacementIntent['source'], pieces: readonly string[], boardIds: readonly string[],
  requiredCells?: readonly { x: number; y: number }[],
): FeastOccupationPlacementIntent {
  const configurations = requiredCells && boardIds.length === 1
    ? requiredPlacementConfigurations(state, seat, command.path, boardIds[0], pieces, requiredCells)
    : null;
  const options = configurations ?? (pieces.length
    ? placementOptions(state, seat, boardIds, pieces[0], source === 'supply-to-shed') : []);
  return {
    kind: 'placement', path: command.path, order: command.order, source,
    label: source === 'banquet-to-house' ? 'Move Banquet Food to a House' : 'Place Occupation Gain',
    prompt: requiredCells
      ? 'Place every gained tile so their union exactly fills the reclaimed special tile footprint.'
      : `Choose legal board cells for ${pieces.length} gained piece${pieces.length === 1 ? '' : 's'}.`,
    targetKind: 'placement', min: configurations ? 1 : pieces.length,
    max: configurations ? 1 : pieces.length, options,
    pieces: [...pieces], destinationBoardIds: [...boardIds],
    ...(requiredCells ? { requiredCells: [...requiredCells] } : {}),
    selectionMode: configurations ? 'configuration' : 'sequential',
  };
}

function interpretPlacement(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'placement' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  const pieces = concretePieces(command.items, command.path);
  const parsed = placementTargets(command.target, command.path);
  const player = state.players[seat];
  let boardIds: string[];
  let placementSeat = seat;
  let requiredCells: readonly { x: number; y: number }[] | undefined;
  if (command.destination === 'immediate-home-or-exploration-placement') {
    const requested = parsed.plain.length ? parsed.plain : parsed.encoded.map((entry) => entry.boardId);
    boardIds = [...new Set(requested)];
    if (boardIds.some((id) => !player.boards.some((board) => board.id === id
      && (board.kind === 'home' || board.kind === 'exploration')))) {
      abort('target', command.path, 'Immediate gain must target an owned home or exploration board');
    }
  } else if (command.destination.startsWith('vacated-')) {
    const vacated = context.vacated;
    if (!vacated) abort('target', command.path, 'The reclaimed special-tile footprint is no longer available');
    const requested = parsed.plain.length ? parsed.plain : parsed.encoded.map((entry) => entry.boardId);
    if (requested.some((id) => id !== vacated.boardId && id !== vacated.placement.id)) {
      abort('target', command.path, 'Target must be the board or placement vacated by the preceding move');
    }
    placementSeat = vacated.ownerSeat;
    boardIds = [vacated.boardId];
    requiredCells = vacated.placement.covered;
  } else {
    abort('unsupported', command.path, `Unsupported direct-placement destination ${command.destination}`);
  }
  if (!parsed.encoded.length) {
    return { ok: true, nextState: state, audit: [], context,
      intent: placementIntent(state, placementSeat, command, 'gain-direct', pieces, boardIds, requiredCells) };
  }
  const ids = placeGainedPieces(state, placementSeat, command.path, pieces, parsed.encoded, requiredCells);
  feastEvent(state, seat, 'Occupation gains placed', `${pieces.join(', ')} placed directly`);
  return {
    ok: true, nextState: state, intent: null, context,
    audit: [{ order: command.order, path: command.path, kind: 'placement', amount: pieces.length,
      message: `Placed ${pieces.length} gained piece${pieces.length === 1 ? '' : 's'}`,
      placementIds: ids }],
  };
}

function removeShipOre(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'move' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  const ids = targetIds(command.target, command.path);
  if (new Set(ids).size !== ids.length) abort('target', command.path, 'Ship targets must be distinct');
  const player = state.players[seat];
  const selected = ids.map((id) => player.ships.find((ship) => ship.id === id && !ship.emigrated));
  if (selected.some((ship) => !ship || ship.type === 'knarr')) {
    abort('target', command.path, 'Choose owned active whaling boats or longships');
  }
  if (command.from.startsWith('selected-') && (selected.length !== 1 || selected[0]!.type !== 'longship')) {
    abort('target', command.path, 'Choose the resolving active longship');
  }
  if (command.from.startsWith('selected-')) {
    const resolvingShipId = context.eventFields?.shipId;
    if (typeof resolvingShipId !== 'string' || ids.length !== 1 || ids[0] !== resolvingShipId) {
      abort('target', command.path, 'Ore must come from the exact longship resolving this action');
    }
  }
  const amount = command.subject.quantity;
  if (!Number.isSafeInteger(amount) || amount < 0) abort('parameters', command.path, 'Ore quantity must be a non-negative safe integer');
  if (selected.reduce((sum, ship) => sum + ship!.ore, 0) < amount) {
    abort('inventory', command.path, 'Selected ships no longer hold enough removable ore');
  }
  let remaining = amount;
  for (const ship of selected) {
    const take = Math.min(remaining, ship!.ore);
    ship!.ore -= take;
    remaining -= take;
  }
  feastEvent(state, seat, 'Occupation removed ship ore', `${amount} ore returned to supply`);
  return {
    ok: true, nextState: state, intent: null, context,
    audit: [{ order: command.order, path: command.path, kind: 'ore', amount: -amount,
      subjectId: 'ore', sourceId: ids.join(','), destinationId: command.to,
      message: `Returned ${amount} added ore from ship${ids.length === 1 ? '' : 's'}` }],
  };
}

function addOreToNewLongship(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'move' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  const ids = targetIds(command.target, command.path);
  if (ids.length !== 1) abort('target', command.path, 'Choose the just-created longship');
  const player = state.players[seat];
  let shipId = ids[0];
  if (shipId === 'new-longship') {
    shipId = context.latestShipId ?? [...activeShips(player, 'longship')]
      .sort((left, right) => numericSuffix(right.id) - numericSuffix(left.id))[0]?.id ?? '';
  }
  const ship = player.ships.find((candidate) => candidate.id === shipId && !candidate.emigrated && candidate.type === 'longship');
  if (!ship) abort('target', command.path, 'The just-created longship is no longer active');
  const amount = command.subject.quantity;
  if (!Number.isSafeInteger(amount) || amount < 0) abort('parameters', command.path, 'Ore quantity must be a non-negative safe integer');
  if (ship.ore + amount > 3) abort('capacity', command.path, 'A longship has only three added-ore spaces');
  if (player.resources.ore < amount) abort('inventory', command.path, `Only ${player.resources.ore} ore remains in supply`);
  player.resources.ore -= amount;
  ship.ore += amount;
  const nextContext = { ...context, latestShipId: ship.id };
  feastEvent(state, seat, 'Occupation armed a new longship', `${amount} ore placed on ${ship.id}`);
  return {
    ok: true, nextState: state, intent: null, context: nextContext,
    audit: [{ order: command.order, path: command.path, kind: 'ship', amount,
      subjectId: 'ore', destinationId: ship.id, message: `Placed ${amount} ore on the new longship` }],
  };
}

function moveSpecialToOwner(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'move' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  const ids = targetIds(command.target, command.path);
  if (ids.length !== 1 || command.subject.quantity !== 1) {
    abort('target', command.path, 'Choose one committed unique special tile');
  }
  const specialId = command.subject.id;
  if (state.specialSupply.includes(specialId)) abort('supply', command.path, `${specialId} is already in general supply`);
  const candidates: { owner: FeastPlayer; board: FeastBoardState; placement: FeastPlacement }[] = [];
  for (const owner of state.players) for (const board of owner.boards) for (const placement of board.placements) {
    if (placement.pieceKind === 'special' && placement.pieceId === specialId
      && (placement.id === ids[0] || board.id === ids[0])) candidates.push({ owner, board, placement });
  }
  if (candidates.length !== 1) abort('target', command.path, `The selected ${specialId} placement is stale or ambiguous`);
  const { owner, board, placement } = candidates[0];
  if (!owner.specials.includes(specialId)) abort('inventory', command.path, `${specialId} ownership record is missing`);
  board.placements.splice(board.placements.indexOf(placement), 1);
  if (owner.seat !== seat) owner.specials.splice(owner.specials.indexOf(specialId), 1);
  const targetPlayer = state.players[seat];
  if (!targetPlayer.specials.includes(specialId)) targetPlayer.specials.push(specialId);
  const nextContext: FeastOccupationDeferredContext = {
    ...context, vacated: { placement: structuredClone(placement), boardId: board.id, ownerSeat: owner.seat },
  };
  feastEvent(state, seat, `Reclaimed ${specialId}`, `Removed from ${board.definitionId}`, { boardId: board.id });
  return {
    ok: true, nextState: state, intent: null, context: nextContext,
    audit: [{ order: command.order, path: command.path, kind: 'special', amount: 1,
      subjectId: specialId, sourceId: board.id, destinationId: `player-${seat}-supply`,
      message: `Reclaimed ${specialId} from ${board.id}` }],
  };
}

function moveSupplyResourceToShed(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'move' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  if (command.subject.quantity !== 1 || !['wood', 'stone'].includes(command.subject.id)) {
    abort('parameters', command.path, 'A shed move places exactly one wood or stone token');
  }
  const parsed = placementTargets(command.target, command.path);
  const resource = command.subject.id as 'wood' | 'stone';
  if (state.players[seat].resources[resource] < 1) {
    abort('inventory', command.path, `No ${resource} remains in the player's supply`);
  }
  const requested = parsed.plain.length ? parsed.plain : parsed.encoded.map((target) => target.boardId);
  const boardIds = [...new Set(requested)];
  if (boardIds.some((id) => !state.players[seat].boards.some((board) => board.id === id && board.definitionId === 'shed'))) {
    abort('target', command.path, 'Choose an owned shed');
  }
  if (!parsed.encoded.length) {
    return { ok: true, nextState: state, audit: [], context,
      intent: placementIntent(state, seat, command, 'supply-to-shed', [command.subject.id], boardIds) };
  }
  const placements = [placeOwnedPiece(state, seat, command.path, command.subject.id, parsed.encoded[0], true)];
  feastEvent(state, seat, 'Occupation filled a shed cell', command.subject.id, { boardId: parsed.encoded[0].boardId });
  return {
    ok: true, nextState: state, intent: null, context,
    audit: [{ order: command.order, path: command.path, kind: 'board', amount: 1,
      subjectId: command.subject.id, destinationId: parsed.encoded[0].boardId,
      placementIds: placements, message: `Placed ${command.subject.id} from supply in a shed` }],
  };
}

function moveBanquetToHouse(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'move' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  const maximum = command.subject.quantity;
  if (!Number.isSafeInteger(maximum) || maximum < 0) abort('parameters', command.path, 'Banquet move quantity must be a non-negative safe integer');
  const parsed = placementTargets(command.target, command.path);
  const amount = parsed.encoded.length || maximum;
  const player = state.players[seat];
  const source = player.feastPlacements.filter((placement) => placement.pieceKind === 'good'
    && placement.pieceId === command.subject.id).slice(0, amount);
  if (source.length !== amount) abort('inventory', command.path, `Only ${source.length} matching Banquet tile(s) remain`);
  if (amount === 0) return { ok: true, nextState: state, audit: [], intent: null, context };
  const requested = parsed.plain.length ? parsed.plain : parsed.encoded.map((target) => target.boardId);
  const boardIds = [...new Set(requested)];
  if (boardIds.some((id) => !player.boards.some((board) => board.id === id
    && (board.definitionId === 'stone-house' || board.definitionId === 'long-house')))) {
    abort('target', command.path, 'Choose owned stone-house or long-house destinations');
  }
  if (!parsed.encoded.length) {
    const intent = placementIntent(state, seat, command, 'banquet-to-house',
      Array.from({ length: maximum }, () => command.subject.id), boardIds);
    return { ok: true, nextState: state, audit: [], context,
      intent: { ...intent, min: maximum > 0 ? 1 : 0, max: maximum } };
  }
  for (const placement of source) player.feastPlacements.splice(player.feastPlacements.indexOf(placement), 1);
  const placementIds = placeGainedPieces(state, seat, command.path,
    Array.from({ length: amount }, () => command.subject.id), parsed.encoded);
  feastEvent(state, seat, 'Occupation moved Banquet food', `${amount} ${command.subject.id} moved to houses`);
  return {
    ok: true, nextState: state, intent: null, context,
    audit: [{ order: command.order, path: command.path, kind: 'banquet', amount,
      subjectId: command.subject.id, sourceId: 'banquet-table', destinationId: boardIds.join(','),
      placementIds, message: `Moved ${amount} ${command.subject.id} from the Banquet Table` }],
  };
}

function interpretMove(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'move' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  if ((command.from === 'whaling-boat-or-longship'
      || command.from === 'selected-raiding-longship'
      || command.from === 'selected-pillaging-longship')
    && (command.to === 'supply' || command.to === 'general-supply')) {
    return removeShipOre(state, seat, command, context);
  }
  if (command.from === 'supply' && command.to === 'new-longship') {
    return addOreToNewLongship(state, seat, command, context);
  }
  if (command.from === 'any-player-board' && command.to === 'owner-supply'
    && command.subject.item === 'special-tile') {
    return moveSpecialToOwner(state, seat, command, context);
  }
  if (command.from === 'supply' && command.to === 'empty-shed-cell') {
    return moveSupplyResourceToShed(state, seat, command, context);
  }
  if (command.from === 'banquet-table' && command.to === 'stone-or-long-houses') {
    return moveBanquetToHouse(state, seat, command, context);
  }
  abort('unsupported', command.path, `Unsupported occupation move ${command.from} -> ${command.to}`);
}

function isQuantity(value: FeastRuleValue): value is FeastOccupationQuantity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'count' || kind === 'tier' || kind === 'event'
    || kind === 'round' || kind === 'player-count';
}

function resolveRuleValue(
  state: FeastState, seat: number, value: FeastRuleValue,
): FeastRuleValue {
  if (isQuantity(value)) return feastOccupationQuantity(state, seat, value);
  if (Array.isArray(value)) return value.map((entry) => resolveRuleValue(state, seat, entry));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, entry]) => [key, resolveRuleValue(state, seat, entry)]));
  return value;
}

function resolveParameters(state: FeastState, seat: number, parameters: FeastRuleRecord = {}): FeastRuleRecord {
  return Object.fromEntries(Object.entries(parameters).map(([key, value]) =>
    [key, resolveRuleValue(state, seat, value)]));
}

function ruleNumber(record: FeastRuleRecord, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function ruleStrings(record: FeastRuleRecord, key: string): string[] | null {
  const value = record[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : null;
}

function actionOption(id: string, label: string, detail?: string, meta?: FeastRuleRecord): FeastOccupationDeferredOption {
  return { id, label, ...(detail ? { detail } : {}), ...(meta ? { meta } : {}) };
}

/**
 * Physical goods-box coordinates. Rows rise orange -> red -> green -> blue;
 * columns follow the printed boxes from Peas at the left to Cattle/Clothing at
 * the right. Pregnant animals share their normal animal's printed position.
 */
const GOOD_BOX_POSITION: Partial<Record<FeastGood, readonly [row: number, column: number]>> = {
  peas: [0, 0], flax: [0, 1], beans: [0, 2], grain: [0, 3], cabbage: [0, 4], fruits: [0, 6],
  mead: [1, 0], stockfish: [1, 1], milk: [1, 2], 'salt-meat': [1, 3], 'game-meat': [1, 4],
  sheep: [1, 5], 'pregnant-sheep': [1, 5], 'whale-meat': [1, 6], cattle: [1, 7], 'pregnant-cattle': [1, 7],
  oil: [2, 0], hide: [2, 1], wool: [2, 2], linen: [2, 3], 'skin-and-bones': [2, 4], fur: [2, 5], robe: [2, 6], clothing: [2, 7],
  'rune-stone': [3, 0], silverware: [3, 1], chest: [3, 2], silk: [3, 3], spices: [3, 4], jewelry: [3, 5], 'treasure-chest': [3, 6], 'silver-hoard': [3, 7],
};

const GOOD_AT_BOX_POSITION = new Map<string, FeastGood>();
for (const id of FEAST_GOOD_IDS) {
  const position = GOOD_BOX_POSITION[id];
  if (!position) continue;
  const key = `${position[0]}:${position[1]}`;
  // The printed normal face is the canonical destination for an animal box.
  if (!GOOD_AT_BOX_POSITION.has(key) || !id.startsWith('pregnant-')) GOOD_AT_BOX_POSITION.set(key, id);
}

function upgradableDestinations(
  source: FeastGood, parameters: FeastRuleRecord,
): { destination: FeastGood; steps: number }[] {
  if (parameters.mode === 'flip-to-other-side') {
    const reverse = FEAST_GOOD_BY_ID[source].reverse;
    return reverse ? [{ destination: reverse, steps: 0 }] : [];
  }
  if (parameters.geometry === 'diagonal-up-right' || parameters.geometry === 'diagonal-up-left') {
    const start = GOOD_BOX_POSITION[source];
    if (!start) return [];
    const exact = ruleNumber(parameters, 'steps', 0);
    const minimum = exact || Math.max(1, ruleNumber(parameters, 'stepsMin', 1));
    const maximum = exact || Math.max(minimum, ruleNumber(parameters, 'stepsMax', minimum));
    const horizontal = parameters.geometry === 'diagonal-up-right' ? 1 : -1;
    const result: { destination: FeastGood; steps: number }[] = [];
    for (let step = 1; step <= maximum; step++) {
      const destination = GOOD_AT_BOX_POSITION.get(`${start[0] + step}:${start[1] + horizontal * step}`);
      if (!destination) break;
      if (step >= minimum) result.push({ destination, steps: step });
    }
    return result;
  }
  const exact = ruleNumber(parameters, 'steps', 0);
  const blueCeiling = exact > 0 && parameters.destinationColor === 'blue' && parameters.sameDimensions === true;
  const min = blueCeiling ? 1 : exact || Math.max(1, ruleNumber(parameters, 'stepsMin', 1));
  const max = exact || Math.max(min, ruleNumber(parameters, 'stepsMax', min));
  const result: { destination: FeastGood; steps: number }[] = [];
  let at: FeastGood | null = source;
  for (let step = 1; step <= max; step++) {
    at = at ? FEAST_GOOD_BY_ID[at].upgrade : null;
    if (!at) break;
    if (step >= min) result.push({ destination: at, steps: step });
  }
  return result;
}

function upgradeIntentOptions(
  state: FeastState, seat: number, parameters: FeastRuleRecord,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredOption[] {
  const player = state.players[seat];
  const allowed = ruleStrings(parameters, 'allowedGoods');
  const eventOrigins = ruleStrings(context.eventFields ?? {}, 'upgradedGoods')
    ?? ruleStrings(context.eventFields ?? {}, 'goodsExchanged')
    ?? ruleStrings(context.eventFields ?? {}, 'goodIds');
  return FEAST_GOOD_IDS.flatMap((source) => {
    if (player.goods[source] < 1) return [];
    if ((source === 'pregnant-sheep' || source === 'pregnant-cattle')
      && parameters.pregnancyStatesSameType !== true
      && parameters.mode !== 'flip-to-other-side') return [];
    if (allowed && !allowed.includes(source)) return [];
    if (typeof parameters.originColor === 'string' && FEAST_GOOD_BY_ID[source].color !== parameters.originColor) return [];
    if (parameters.originMustBeOneOfGoodsExchangedThisAction === true
      && (!eventOrigins || !eventOrigins.includes(source))) return [];
    return upgradableDestinations(source, parameters).flatMap(({ destination, steps }) => {
      const from = FEAST_GOOD_BY_ID[source];
      const to = FEAST_GOOD_BY_ID[destination];
      if (typeof parameters.destinationColor === 'string' && to.color !== parameters.destinationColor) return [];
      if (parameters.sameDimensions === true && (from.width !== to.width || from.height !== to.height)) return [];
      return [actionOption(`${source}->${destination}`, `${from.name} -> ${to.name}`,
        `${player.goods[source]} available`, { source, destination, steps, available: player.goods[source] })];
    });
  });
}

function previewActionSpaceReason(state: FeastState, seat: number, actionSpaceId: string): string | null {
  const preview = structuredClone(state);
  preview.phase = 'actions'; preview.pending = []; preview.turn = seat;
  const player = preview.players[seat];
  player.passed = false; player.turnActionTaken = false; player.workersAvailable = 99;
  const space = preview.actionSpaces.find((candidate) => candidate.id === actionSpaceId);
  if (space) space.occupants = [];
  const def = FEAST_ACTION_BY_ID[actionSpaceId];
  return def ? feastActionReason(preview, seat, def, false) : 'Unknown action space';
}

function actionSpaceIntentOptions(
  state: FeastState, seat: number, parameters: FeastRuleRecord,
): FeastOccupationDeferredOption[] {
  const column = typeof parameters.column === 'number' ? parameters.column : null;
  const player = state.players[seat];
  const columnDefs = FEAST_ACTION_SPACES.filter((def) => column === null || def.column === column)
    .sort((left, right) => left.bounds.y - right.bounds.y);
  const ownOccupied = columnDefs.filter((def) => state.actionSpaces.find((space) => space.id === def.id)?.occupants
    .some((occupant) => occupant.seat === seat
      && (parameters.soloActiveColorOnly !== true || occupant.workerColor === player.activeWorkerColor)));
  return columnDefs.flatMap((def, index) => {
    const space = state.actionSpaces.find((candidate) => candidate.id === def.id)!;
    const occupied = space.occupants.length > 0;
    if (parameters.occupied === true && !occupied) return [];
    if (parameters.occupied === false && occupied) return [];
    if (parameters.adjacentVerticalToOwnWorkerInColumn1 === true) {
      const adjacent = [columnDefs[index - 1], columnDefs[index + 1]].filter(Boolean);
      if (!adjacent.some((candidate) => ownOccupied.some((own) => own.id === candidate.id))) return [];
    }
    const reason = previewActionSpaceReason(state, seat, def.id);
    return [{
      id: def.id, label: def.name, detail: `Column ${def.column}; no Vikings placed`,
      ...(reason ? { disabled: true, reason } : {}),
      meta: { actionSpaceId: def.id, column: def.column, placeWorkers: false },
    }];
  });
}

function mountainIntentOptions(
  state: FeastState, parameters: FeastRuleRecord,
): FeastOccupationDeferredOption[] {
  const allowed = ruleStrings(parameters, 'allowedItems');
  const allowances = ruleStrings(parameters, 'allowances'); // never numeric; retained for exhaustive branching below
  void allowances;
  const raw = parameters.allowances;
  const caps = Array.isArray(raw) ? raw.filter((value): value is number => typeof value === 'number') : [1];
  const max = Math.max(0, ...caps, 0);
  return state.mountains.map((strip) => {
    let prefix = 0;
    while (prefix < Math.min(max, strip.items.length)) {
      const item = strip.items[prefix];
      // The appendix explicitly treats the printed 2-silver token as one
      // legal item for "building resource" occupation actions.
      if (allowed && !allowed.includes(item)) break;
      prefix++;
    }
    return {
      id: strip.id, label: title(strip.id), detail: strip.items.join(', '),
      ...(prefix ? {} : { disabled: true, reason: 'No allowed item is currently at this strip\'s arrow end' }),
      meta: { stripId: strip.id, availablePrefix: prefix, items: strip.items.slice(0, prefix) },
    };
  });
}

function emigrationCost(state: FeastState, seat: number, parameters: FeastRuleRecord): number {
  let cost = parameters.normalRulesAndCost === true
    ? state.round : ruleNumber(parameters, 'baseSilverCost', state.round);
  const discount = ruleNumber(parameters, 'discountPerLargeShipBeforeEmigration', 0);
  if (discount) cost -= discount * activeShips(state.players[seat]).filter((ship) => ship.type !== 'whaling-boat').length;
  // This discount applies to Emigration actions granted by occupations too.
  if (state.players[seat].playedOccupations.includes('occupation-170')) cost -= 2;
  return Math.max(ruleNumber(parameters, 'floor', 0), cost);
}

function grantActionShape(
  state: FeastState, seat: number, action: FeastOccupationAction,
  parameters: FeastRuleRecord, context: FeastOccupationDeferredContext,
): Omit<FeastOccupationGrantActionIntent, 'kind' | 'path' | 'order' | 'action' | 'parameters' | 'resolvedParameters'> {
  const player = state.players[seat];
  const confirm = (label: string, prompt: string, meta?: FeastRuleRecord) => ({
    label, prompt, targetKind: 'confirmation' as const, min: 1, max: 1,
    options: [actionOption('begin', label, undefined, meta)],
  });
  if (action === 'upgrade-good') {
    const options = upgradeIntentOptions(state, seat, parameters, context);
    const maximum = ruleNumber(parameters, 'count', ruleNumber(parameters, 'max', 1));
    const min = Math.min(maximum, ruleNumber(parameters, 'min', maximum ? 1 : 0));
    return { label: 'Upgrade Goods', prompt: 'Choose the exact legal source and destination goods.',
      targetKind: 'good', min: options.length ? min : 0, max: maximum, options };
  }
  if (action === 'mountain-take') {
    const options = mountainIntentOptions(state, parameters);
    const raw = parameters.allowances;
    const allowances = Array.isArray(raw) ? raw.filter((value): value is number => typeof value === 'number') : [1];
    const maximum = allowances.reduce((sum, value) => sum + value, 0);
    return { label: 'Take Mountain Items', prompt: 'Take allowed items from the arrow end of legal strips.',
      targetKind: 'mountain-strip', min: options.some((option) => !option.disabled) ? 1 : 0, max: maximum, options };
  }
  if (action === 'play-occupation') {
    const options = player.occupationHand.map((id) => actionOption(id, FEAST_OCCUPATION_BY_ID[id]?.name ?? id,
      `${FEAST_OCCUPATION_BY_ID[id]?.points ?? 0} VP`));
    const maximum = Math.min(ruleNumber(parameters, 'count', 1), options.length);
    return { label: 'Play an Occupation', prompt: 'Choose occupation cards from your current hand.',
      targetKind: 'occupation', min: maximum ? 1 : 0, max: maximum, options };
  }
  if (action === 'action-space') {
    const options = actionSpaceIntentOptions(state, seat, parameters);
    return { label: 'Resolve an Extra Action Space', prompt: 'Choose a server-verified printed action; place no Vikings.',
      targetKind: 'action-space', min: options.some((option) => !option.disabled) ? 1 : 0, max: 1, options };
  }
  if (action === 'buy-ship') {
    const requested = typeof parameters.ship === 'string' ? [parameters.ship as FeastShipType]
      : ['whaling-boat', 'knarr', 'longship'] as FeastShipType[];
    const options = requested.filter((type): type is FeastShipType => ['whaling-boat', 'knarr', 'longship'].includes(type))
      .map((type) => {
        const full = type === 'whaling-boat' ? activeShips(player, type).length >= 3
          : activeShips(player).filter((ship) => ship.type !== 'whaling-boat').length >= 4;
        const standard = { 'whaling-boat': 3, knarr: 5, longship: 8 }[type];
        const cost = ruleNumber(parameters, 'silverCost', ruleNumber(parameters, 'baseSilverCost', standard));
        return { id: type, label: `Buy ${title(type)}`, detail: `${cost} silver before declared discounts`,
          ...(full ? { disabled: true, reason: 'No matching ship berth remains' } : {}), meta: { ship: type, silverCost: cost } };
      });
    return { label: 'Buy a Ship', prompt: 'Choose the legal ship and resolve the card-specific payment.',
      targetKind: 'ship', min: options.some((option) => !option.disabled) ? 1 : 0, max: 1, options };
  }
  if (action === 'build-house') {
    const requested = typeof parameters.house === 'string' ? [parameters.house as FeastBuildingType]
      : ['shed', 'stone-house', 'long-house'] as FeastBuildingType[];
    const options = requested.filter((type): type is FeastBuildingType => ['shed', 'stone-house', 'long-house'].includes(type))
      .map((type) => ({ id: type, label: `Build ${title(type)}`, detail: `${state.buildingSupply[type]} remain`,
        ...(state.buildingSupply[type] > 0 ? {} : { disabled: true, reason: 'No board remains in the finite supply' }),
        meta: { building: type, available: state.buildingSupply[type] } }));
    return { label: 'Build a House', prompt: 'Choose an available building board.', targetKind: 'board',
      min: options.some((option) => !option.disabled) ? 1 : 0, max: 1, options };
  }
  if (action === 'emigration') {
    const cost = emigrationCost(state, seat, parameters);
    const options = activeShips(player).filter((ship) => ship.type === 'knarr' || ship.type === 'longship')
      .map((ship) => ({ id: ship.id, label: `Emigrate ${title(ship.type)}`, detail: `${cost} silver`,
        ...(player.silver >= cost ? {} : { disabled: true, reason: `Needs ${cost} silver` }),
        meta: { shipId: ship.id, shipType: ship.type, silverCost: cost } }));
    return { label: 'Emigrate', prompt: 'Choose an active large ship and pay the resolved occupation cost.',
      targetKind: 'ship', min: options.some((option) => !option.disabled) ? 1 : 0, max: 1, options };
  }
  if (action === 'overseas-trading') {
    const options = FEAST_GOOD_IDS.filter((id) => FEAST_GOOD_BY_ID[id].color === 'green' && player.goods[id] > 0)
      .map((id) => actionOption(id, `${FEAST_GOOD_BY_ID[id].name} -> ${FEAST_GOOD_BY_ID[FEAST_GOOD_BY_ID[id].upgrade!].name}`,
        `${player.goods[id]} available`));
    return { label: 'Overseas Trading', prompt: 'Turn any number of different green goods to their blue side.',
      targetKind: 'good', min: 0, max: options.length, options };
  }
  if (action === 'exploration') {
    const faces = ruleStrings(parameters, 'faces');
    const options = state.explorations.filter((board) => board.claimedBy === null && (!faces || faces.includes(board.face)))
      .map((board) => actionOption(board.boardId, title(board.face), board.silver ? `${board.silver} accumulated silver` : 'No accumulated silver',
        { boardId: board.boardId, face: board.face, silver: board.silver }));
    return { label: 'Explore', prompt: 'Choose an unclaimed face-up exploration board.', targetKind: 'board',
      min: options.length ? 1 : 0, max: 1, options };
  }
  if (action === 'whaling') {
    const options = activeShips(player, 'whaling-boat').map((ship) => actionOption(ship.id, 'Whaling Boat',
      `${ship.ore + 1} roll reduction`, { shipId: ship.id, ore: ship.ore }));
    const minimum = ruleNumber(parameters, 'boatsMin', 1);
    const maximum = Math.min(ruleNumber(parameters, 'boatsMax', 3), options.length);
    return { label: 'Whaling', prompt: 'Choose the whaling boats, then resolve the ordinary d12 action.',
      targetKind: 'ship', min: options.length >= minimum ? minimum : 0, max: maximum, options };
  }
  if (action === 'raiding' || action === 'pillaging' || action === 'plundering') {
    const options = activeShips(player, 'longship').map((ship) => actionOption(ship.id, title(ship.type),
      `${ship.ore} added ore`, { shipId: ship.id, ore: ship.ore }));
    const required = action === 'plundering' ? 2 : 1;
    return { label: title(action), prompt: `Choose ${required} active longship${required === 1 ? '' : 's'} and resolve the ordinary action.`,
      targetKind: 'ship', min: options.length >= required ? required : 0, max: Math.min(required, options.length), options };
  }
  if (action === 'hunting-game' || action === 'laying-snare') {
    const label = action === 'hunting-game' ? 'Hunting Game' : 'Laying a Snare';
    return confirm(label, `Resolve the ordinary ${label} die action without placing Vikings.`,
      { actionSpaceId: action === 'hunting-game' ? 'hunt-game-1' : 'lay-snare', placeWorkers: false });
  }
  if (action === 'bonus') {
    const options = player.boards.filter((board) => feastBonusesForBoard(board).length > 0)
      .map((board) => actionOption(board.id, title(board.definitionId),
        `${feastBonusesForBoard(board).length} produced bonus group(s)`, { boardId: board.id }));
    return { label: 'Board Bonus', prompt: 'Resolve the ordinary bonus production for the selected scope.',
      targetKind: 'board', min: options.length ? 1 : 0, max: options.length, options };
  }
  if (action === 'breeding') return confirm('Animal Breeding', 'Resolve one ordinary private breeding phase.');
  if (action === 'harvest') return confirm('Harvest', parameters.rewardsAlreadyApplied === true
    ? 'Record this effect as a Harvest action; its printed rewards were already applied.'
    : 'Resolve the current round\'s ordinary Harvest rewards.');
  if (action === 'feast') return confirm('Private Feast', 'Resolve one complete private Feast.');
  // Exhaustive guard: adding a registry action requires a new typed branch.
  const neverAction: never = action;
  return neverAction;
}

function interpretGrantAction(
  state: FeastState, seat: number,
  command: Extract<FeastOccupationDeferredCommand, { kind: 'grant-action' }>,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  const parameters = structuredClone(command.parameters ?? {}) as FeastRuleRecord;
  const resolvedParameters = resolveParameters(state, seat, parameters);
  return {
    ok: true, nextState: state, audit: [], context,
    intent: {
      kind: 'grant-action', path: command.path, order: command.order, action: command.action,
      parameters, resolvedParameters,
      ...grantActionShape(state, seat, command.action, resolvedParameters, context),
    },
  };
}

function interpretOnClone(
  state: FeastState, seat: number, command: FeastOccupationDeferredCommand,
  context: FeastOccupationDeferredContext,
): FeastOccupationDeferredSuccess {
  if (!state.players[seat]) abort('seat', command.path, `Unknown Feast seat ${seat}`);
  if (!Number.isSafeInteger(command.order) || command.order < 0) abort('parameters', command.path, 'Command order must be a non-negative safe integer');
  switch (command.kind) {
    case 'phase': return interpretPhase(state, seat, command, context);
    case 'return-workers': return interpretReturnWorkers(state, seat, command, context);
    case 'placement': return interpretPlacement(state, seat, command, context);
    case 'move': return interpretMove(state, seat, command, context);
    case 'grant-action': return interpretGrantAction(state, seat, command, context);
  }
}

export function feastInterpretOccupationDeferred(
  source: FeastState, seat: number, command: FeastOccupationDeferredCommand,
  initialContext: FeastOccupationDeferredContext = {},
): FeastOccupationDeferredResult {
  try {
    const state = structuredClone(source);
    const context = structuredClone(initialContext);
    return interpretOnClone(state, seat, command, context);
  } catch (error) {
    if (error instanceof DeferredAbort) return { ok: false, error: error.issue };
    throw error;
  }
}

/**
 * Interpret an ordered list atomically until it completes or reaches the first
 * reducer decision. A failure rolls back the entire list; an intent returns all
 * prior validated mutations plus its command index.
 */
export function feastInterpretOccupationDeferredCommands(
  source: FeastState, seat: number, commands: readonly FeastOccupationDeferredCommand[],
  initialContext: FeastOccupationDeferredContext = {},
): FeastOccupationDeferredBatchResult {
  try {
    let state = structuredClone(source);
    let context = structuredClone(initialContext);
    const audit: FeastOccupationDeferredAudit[] = [];
    for (let index = 0; index < commands.length; index++) {
      const result = interpretOnClone(state, seat, commands[index], context);
      state = result.nextState;
      context = result.context;
      audit.push(...result.audit);
      if (result.intent) return { ...result, audit, consumed: index, intentIndex: index };
    }
    return { ok: true, nextState: state, audit, intent: null, context,
      consumed: commands.length, intentIndex: null };
  } catch (error) {
    if (error instanceof DeferredAbort) return { ok: false, error: error.issue };
    throw error;
  }
}
