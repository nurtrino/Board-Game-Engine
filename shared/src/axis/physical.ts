import type { UnitKey } from './config.js';
import type { UnitStack } from './state.js';

export interface AxisPhysicalPiece {
  /** Index in the authoritative board-space stack array. */
  stackIndex: number;
  /** Canonical render position inside the aggregate stack. */
  sculptIndex: number;
  power: string;
  key: UnitKey;
  /** Available-piece ordinal within this power/unit type; spent pieces have none. */
  ordinal: number | null;
  /**
   * Durable board-order ordinal within this power/unit type. Unlike `ordinal`,
   * this also names spent pieces, so a moved transport remains addressable for
   * an allied cargo owner's later offload.
   */
  physicalOrdinal: number;
  available: boolean;
  damaged: boolean;
  movementSpent: number;
  cargo?: NonNullable<UnitStack['cargo']>;
  combatLoadedCargo?: NonNullable<UnitStack['combatLoadedCargo']>;
  loadedThisTurnCargo?: NonNullable<UnitStack['loadedThisTurnCargo']>;
  offloadedTo?: string;
  offloadBlocked: boolean;
  carrierLanding?: { ref: string; seaZone: string };
  carrierRef?: string;
  carrierBaseRef?: string;
}

const boundedCount = (value: number | undefined, max: number): number =>
  Math.min(max, Math.max(0, Number.isSafeInteger(value) ? value ?? 0 : 0));

const cloneCargo = (cargo: UnitStack['cargo']): UnitStack['cargo'] =>
  cargo?.filter((item) => Number.isSafeInteger(item.count) && item.count > 0).map((item) => ({ ...item }));

/**
 * Expand board stacks into the exact physical ordering used by both rendering
 * and action selection.
 *
 * Stack order is authoritative and survives JSON save/restore. Within an
 * aggregate, available healthy pieces come first, then available damaged
 * battleships, followed by spent healthy and spent damaged pieces. This is the
 * same moved/damaged overlap convention used by the reducer.
 */
export function enumerateAxisPhysicalPieces(stacks: readonly UnitStack[]): AxisPhysicalPiece[] {
  const nextOrdinal = new Map<string, number>();
  const nextPhysicalOrdinal = new Map<string, number>();
  const pieces: AxisPhysicalPiece[] = [];

  stacks.forEach((stack, stackIndex) => {
    const count = Math.max(0, Number.isSafeInteger(stack.count) ? stack.count : 0);
    const damaged = stack.key === 'battleship' ? boundedCount(stack.damaged, count) : 0;
    const healthy = count - damaged;
    const moved = boundedCount(stack.moved, count);
    const movedHealthy = Math.min(moved, healthy);
    const movedDamaged = Math.max(0, moved - movedHealthy);
    const availableHealthy = healthy - movedHealthy;
    const availableDamaged = damaged - movedDamaged;
    const stackKey = `${stack.power}:${stack.key}`;
    let sculptIndex = 0;

    const append = (amount: number, available: boolean, isDamaged: boolean) => {
      for (let i = 0; i < amount; i++) {
        const ordinal = available ? (nextOrdinal.get(stackKey) ?? 0) : null;
        if (ordinal != null) nextOrdinal.set(stackKey, ordinal + 1);
        const physicalOrdinal = nextPhysicalOrdinal.get(stackKey) ?? 0;
        nextPhysicalOrdinal.set(stackKey, physicalOrdinal + 1);
        pieces.push({
          stackIndex,
          sculptIndex: sculptIndex++,
          power: stack.power,
          key: stack.key,
          ordinal,
          physicalOrdinal,
          available,
          damaged: isDamaged,
          movementSpent: Math.max(0, stack.movementSpent ?? 0),
          // Cargo-bearing ships are normalized to one physical hull. Retain a
          // defensive marker for a just-loaded in-memory stack before its next
          // normalization pass, without pretending aggregate cargo has identity.
          ...(count === 1 && stack.cargo?.length ? { cargo: cloneCargo(stack.cargo)! } : {}),
          ...(count === 1 && stack.combatLoadedCargo?.length
            ? { combatLoadedCargo: cloneCargo(stack.combatLoadedCargo)! }
            : {}),
          ...(count === 1 && stack.loadedThisTurnCargo?.length
            ? { loadedThisTurnCargo: cloneCargo(stack.loadedThisTurnCargo)! }
            : {}),
          ...(stack.offloadedTo ? { offloadedTo: stack.offloadedTo } : {}),
          offloadBlocked: stack.offloadBlocked === true,
          ...(count === 1 && stack.carrierLanding
            ? { carrierLanding: { ...stack.carrierLanding } }
            : {}),
          ...(count === 1 && stack.carrierRef ? { carrierRef: stack.carrierRef } : {}),
          ...(count === 1 && stack.carrierBaseRef ? { carrierBaseRef: stack.carrierBaseRef } : {}),
        });
      }
    };

    append(availableHealthy, true, false);
    append(availableDamaged, true, true);
    append(movedHealthy, false, false);
    append(movedDamaged, false, true);
  });

  return pieces;
}

/** Available physical refs for one selectable power/unit group. */
export function availableAxisPhysicalPieces(
  stacks: readonly UnitStack[],
  power: string,
  key: UnitKey,
): AxisPhysicalPiece[] {
  return enumerateAxisPhysicalPieces(stacks)
    .filter((piece) => piece.available && piece.power === power && piece.key === key);
}

const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Stable freshness token for a selected power/unit group in one board space. */
export function axisPieceSelectionSignature(
  stacks: readonly UnitStack[],
  power: string,
  key: UnitKey,
): string {
  const matching = stacks
    .filter((stack) => stack.power === power && stack.key === key)
    .map((stack) => [
      stack.count,
      stack.moved ?? 0,
      stack.damaged ?? 0,
      stack.movementSpent ?? 0,
      stack.offloadedTo ?? null,
      stack.offloadBlocked === true,
      stack.carrierLanding
        ? [stack.carrierLanding.ref, stack.carrierLanding.seaZone]
        : null,
      stack.carrierRef ?? null,
      stack.carrierBaseRef ?? null,
      (stack.combatLoadedCargo ?? [])
        .filter((cargo) => cargo.count > 0)
        .map((cargo) => [cargo.power, cargo.key, cargo.count] as const)
        .sort((a, b) => compareText(a[0], b[0]) || compareText(a[1], b[1]) || a[2] - b[2]),
      (stack.loadedThisTurnCargo ?? [])
        .filter((cargo) => cargo.count > 0)
        .map((cargo) => [cargo.power, cargo.key, cargo.count] as const)
        .sort((a, b) => compareText(a[0], b[0]) || compareText(a[1], b[1]) || a[2] - b[2]),
      (stack.cargo ?? [])
        .filter((cargo) => cargo.count > 0)
        .map((cargo) => [cargo.power, cargo.key, cargo.count] as const)
        .sort((a, b) => compareText(a[0], b[0]) || compareText(a[1], b[1]) || a[2] - b[2]),
    ] as const);
  return JSON.stringify(matching);
}

function cargoSize(stack: UnitStack): number {
  return (stack.cargo ?? []).reduce((total, cargo) => total + cargo.count, 0);
}

function nonInfantryCargoSize(stack: UnitStack): number {
  return (stack.cargo ?? []).reduce((total, cargo) => total + (cargo.key === 'infantry' ? 0 : cargo.count), 0);
}

function addCargo(stack: UnitStack, item: NonNullable<UnitStack['cargo']>[number]): void {
  stack.cargo ??= [];
  const existing = stack.cargo.find((cargo) => cargo.power === item.power && cargo.key === item.key);
  if (existing) existing.count += 1;
  else stack.cargo.push({ ...item, count: 1 });
}

/**
 * Split a legacy aggregate loaded transport/carrier into physical one-hull
 * stacks. Cargo is balanced onto empty hulls first, matching the engine's
 * transport packing convention. Invalid legacy over-capacity cargo is retained
 * on the final hull rather than silently discarded.
 */
export function physicalizeAxisCargoStack(stack: UnitStack): UnitStack[] {
  const cargo = cloneCargo(stack.cargo);
  const splitTransport = stack.key === 'transport' && stack.count > 1;
  const splitLoadedCarrier = stack.key === 'carrier' && stack.count > 1 && Boolean(cargo?.length);
  if (!splitTransport && !splitLoadedCarrier) {
    const {
      cargo: _cargo,
      combatLoadedCargo: _combatLoadedCargo,
      loadedThisTurnCargo: _loadedThisTurnCargo,
      ...rest
    } = stack;
    void _cargo;
    void _combatLoadedCargo;
    void _loadedThisTurnCargo;
    return [{
      ...rest,
      ...(cargo?.length ? { cargo } : {}),
      ...(stack.combatLoadedCargo?.length
        ? { combatLoadedCargo: cloneCargo(stack.combatLoadedCargo) }
        : {}),
      ...(stack.loadedThisTurnCargo?.length
        ? { loadedThisTurnCargo: cloneCargo(stack.loadedThisTurnCargo) }
        : {}),
    }];
  }

  const count = Math.max(1, Number.isSafeInteger(stack.count) ? stack.count : 1);
  const moved = boundedCount(stack.moved, count);
  const hulls: UnitStack[] = Array.from({ length: count }, (_, index) => ({
    power: stack.power,
    key: stack.key,
    count: 1,
    ...(index < moved ? { moved: 1 } : {}),
    ...(stack.movementSpent != null ? { movementSpent: stack.movementSpent } : {}),
    ...(stack.offloadedTo ? { offloadedTo: stack.offloadedTo } : {}),
    ...(stack.combatLoadedCargo?.length
      ? { combatLoadedCargo: cloneCargo(stack.combatLoadedCargo) }
      : {}),
    ...(stack.loadedThisTurnCargo?.length
      ? { loadedThisTurnCargo: cloneCargo(stack.loadedThisTurnCargo) }
      : {}),
      ...(stack.offloadBlocked ? { offloadBlocked: true } : {}),
      ...(stack.carrierRef ? { carrierRef: stack.carrierRef } : {}),
      ...(stack.carrierBaseRef ? { carrierBaseRef: stack.carrierBaseRef } : {}),
  }));
  const units = (cargo ?? []).flatMap((item) =>
    Array.from({ length: item.count }, () => ({ ...item, count: 1 })));
  if (stack.key === 'transport') {
    // Non-infantry consumes a transport's primary slot, so place it before
    // infantry while still preferring an empty hull.
    units.sort((a, b) => Number(a.key === 'infantry') - Number(b.key === 'infantry'));
  }

  for (const unit of units) {
    const eligible = hulls
      .map((hull, index) => ({ hull, index }))
      .filter(({ hull }) => cargoSize(hull) < 2
        && (stack.key === 'carrier' || unit.key === 'infantry' || nonInfantryCargoSize(hull) === 0))
      .sort((a, b) => cargoSize(a.hull) - cargoSize(b.hull) || a.index - b.index);
    const target = eligible[0]?.hull ?? hulls[hulls.length - 1];
    addCargo(target, unit);
  }
  return hulls;
}

/** Idempotently enforce one physical hull for every transport and loaded carrier. */
export function physicalizeAxisCargoStacks(stacks: readonly UnitStack[]): UnitStack[] {
  return stacks.flatMap((stack) => physicalizeAxisCargoStack(stack));
}
