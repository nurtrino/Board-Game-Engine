import {
  POWERS,
  UNITS,
  axisPieceSelectionSignature,
  enumerateAxisPhysicalPieces,
  sameAxisSide,
  type AxisPhysicalPiece,
  type AxisUnitPick,
  type PowerKey,
  type UnitKey,
  type UnitStack,
} from '@bge/shared';

/** Structurally matches the durable reducer reference carried over the wire. */
export interface AxisTransportRef {
  owner: PowerKey;
  physicalOrdinal: number;
  selectionSig: string;
}

export interface AxisTransportManifestItem {
  key: UnitKey;
  count: number;
}

export interface AxisTransportPublicCargoItem extends AxisTransportManifestItem {
  power: PowerKey | 'china';
}

/** Cargo is assigned to a specific hull; it is never pooled by sea zone. */
export interface AxisTransportCargoOrder extends AxisTransportRef {
  units: AxisTransportManifestItem[];
}

export interface AxisTransportRouteOrder extends AxisTransportCargoOrder {
  from: string;
  via?: string;
}

export type AxisTransportHullStatus = 'ready' | 'moved' | 'unloading' | 'committed' | 'retreated';

export interface AxisTransportCapacity {
  total: 2;
  /** Includes every publicly listed occupant. */
  occupied: number;
  remaining: number;
  canLoadInfantry: boolean;
  canLoadNonInfantry: boolean;
}

export interface AxisTransportHullCard extends AxisTransportRef {
  zone: string;
  /** Only cargo belonging to the power currently operating is exposed. */
  cargo: AxisTransportManifestItem[];
  /** Public tabletop manifest, including every occupant and its owner. */
  manifest: AxisTransportPublicCargoItem[];
  capacity: AxisTransportCapacity;
  status: AxisTransportHullStatus;
  offloadedTo?: string;
  /** Allied hulls can carry cargo, but only their owner can move them. */
  movable: boolean;
  canLoad: boolean;
  canOffload: boolean;
  /** Concise reason cargo controls are disabled for this hull. */
  disabledReason?: string;
}

export interface AxisTransportLoadAction {
  type: 'load';
  zone: string;
  territory: string;
  units: AxisUnitPick[];
  hulls: AxisTransportCargoOrder[];
}

export interface AxisTransportOffloadAction {
  type: 'offload';
  zone: string;
  territory: string;
  hulls: AxisTransportCargoOrder[];
}

export interface AxisTransportRouteSummary {
  path: string[];
  distance: 0 | 1 | 2;
  label: string;
  cargoCount: number;
}

type PhysicalTransportPiece = AxisPhysicalPiece & { physicalOrdinal?: number };
type TransportStack = UnitStack & { offloadedTo?: string };

const unitOrder = Object.keys(UNITS) as UnitKey[];
const unitRank = new Map(unitOrder.map((key, index) => [key, index]));

const isPositiveInt = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

const isPower = (power: string): power is PowerKey =>
  Object.prototype.hasOwnProperty.call(POWERS, power);

const isTransportable = (key: UnitKey): boolean => UNITS[key].domain === 'land';

/** Combine duplicate unit rows while retaining a stable unit-profile order. */
export function canonicalAxisTransportManifest(
  units: readonly AxisTransportManifestItem[],
): AxisTransportManifestItem[] {
  const totals = new Map<UnitKey, number>();
  for (const unit of units) {
    if (!isPositiveInt(unit.count)) continue;
    totals.set(unit.key, (totals.get(unit.key) ?? 0) + unit.count);
  }
  return [...totals]
    .sort(([left], [right]) => (unitRank.get(left) ?? 99) - (unitRank.get(right) ?? 99))
    .map(([key, count]) => ({ key, count }));
}

const cargoForPower = (
  cargo: UnitStack['cargo'],
  operatingPower: PowerKey,
): AxisTransportManifestItem[] => canonicalAxisTransportManifest(
  (cargo ?? [])
    .filter((unit) => unit.power === operatingPower)
    .map(({ key, count }) => ({ key, count })),
);

const publicCargo = (cargo: UnitStack['cargo']): AxisTransportPublicCargoItem[] => {
  const totals = new Map<string, AxisTransportPublicCargoItem>();
  for (const item of cargo ?? []) {
    if (!isPositiveInt(item.count) || !isPower(item.power)) continue;
    const id = `${item.power}:${item.key}`;
    const existing = totals.get(id);
    if (existing) existing.count += item.count;
    else totals.set(id, { power: item.power, key: item.key, count: item.count });
  }
  return [...totals.values()].sort((left, right) =>
    left.power.localeCompare(right.power)
    || (unitRank.get(left.key) ?? 99) - (unitRank.get(right.key) ?? 99));
};

const subtractManifest = (
  cargo: readonly AxisTransportManifestItem[],
  blocked: UnitStack['loadedThisTurnCargo'],
  operatingPower: PowerKey,
): AxisTransportManifestItem[] => {
  const blockedCounts = new Map<UnitKey, number>();
  for (const item of blocked ?? []) {
    if (item.power === operatingPower) blockedCounts.set(item.key, (blockedCounts.get(item.key) ?? 0) + item.count);
  }
  return cargo.flatMap((item) => {
    const count = Math.max(0, item.count - (blockedCounts.get(item.key) ?? 0));
    return count > 0 ? [{ ...item, count }] : [];
  });
};

const cargoCapacity = (cargo: UnitStack['cargo']): AxisTransportCapacity => {
  const valid = (cargo ?? []).filter((unit) => isPositiveInt(unit.count));
  const occupied = valid.reduce((total, unit) => total + unit.count, 0);
  const nonInfantry = valid.reduce(
    (total, unit) => total + (unit.key === 'infantry' ? 0 : unit.count),
    0,
  );
  const remaining = Math.max(0, 2 - occupied);
  return {
    total: 2,
    occupied,
    remaining,
    canLoadInfantry: remaining > 0,
    canLoadNonInfantry: remaining > 0 && nonInfantry === 0,
  };
};

/**
 * List every same-side physical transport in one zone, including spent hulls.
 * The shared enumerator supplies canonical stack/sculpt ordering; the fallback
 * ordinal can be removed once older clients no longer lack `physicalOrdinal`.
 */
export function listAxisTransportHullCards(
  zone: string,
  stacks: readonly UnitStack[],
  operatingPower: PowerKey,
  mode: 'combat' | 'noncombat' = 'noncombat',
): AxisTransportHullCard[] {
  const nextPhysicalOrdinal = new Map<string, number>();
  const signatures = new Map<PowerKey, string>();
  const cards: AxisTransportHullCard[] = [];

  for (const rawPiece of enumerateAxisPhysicalPieces(stacks)) {
    const piece = rawPiece as PhysicalTransportPiece;
    const group = `${piece.power}:${piece.key}`;
    const fallbackOrdinal = nextPhysicalOrdinal.get(group) ?? 0;
    nextPhysicalOrdinal.set(group, fallbackOrdinal + 1);
    if (piece.key !== 'transport' || !isPower(piece.power)) continue;
    if (!sameAxisSide(piece.power, operatingPower)) continue;

    const stack = stacks[piece.stackIndex] as TransportStack | undefined;
    if (!stack) continue;
    const physicalOrdinal = Number.isSafeInteger(piece.physicalOrdinal)
      ? piece.physicalOrdinal!
      : fallbackOrdinal;
    let selectionSig = signatures.get(piece.power);
    if (selectionSig === undefined) {
      selectionSig = axisPieceSelectionSignature(stacks, piece.power, 'transport');
      signatures.set(piece.power, selectionSig);
    }

    // Cargo-bearing hulls are normalized to count one. The piece cargo marker
    // protects the brief pre-normalization client state without pooling cargo.
    const cargo = piece.cargo ?? (stack.count === 1 ? stack.cargo : undefined);
    const operatingCargo = cargoForPower(cargo, operatingPower);
    const alliedNewCargo = piece.power !== operatingPower
      ? subtractManifest(operatingCargo, stack.loadedThisTurnCargo, operatingPower)
      : operatingCargo;
    const committed = (stack.combatLoadedCargo ?? []).some((item) => item.power === operatingPower && item.count > 0);
    const visibleCargo = mode === 'noncombat' && committed ? [] : alliedNewCargo;
    const capacity = cargoCapacity(cargo);
    const offloadedTo = stack.offloadedTo;
    const status: AxisTransportHullStatus = offloadedTo
      ? 'unloading'
      : stack.offloadBlocked ? 'retreated'
      : committed ? 'committed'
      : piece.available ? 'ready' : 'moved';
    const disabledReason = offloadedTo
      ? `Already unloaded to ${offloadedTo}`
      : stack.offloadBlocked
        ? 'Retreated from sea combat'
        : mode === 'noncombat' && committed
          ? 'Committed to an amphibious assault'
          : operatingCargo.reduce((total, item) => total + item.count, 0)
              > visibleCargo.reduce((total, item) => total + item.count, 0)
              && piece.power !== operatingPower
            ? visibleCargo.length > 0
              ? 'New allied cargo waits; older cargo may offload'
              : 'Allied cargo loaded this turn must wait'
            : undefined;

    cards.push({
      zone,
      owner: piece.power,
      physicalOrdinal,
      selectionSig,
      cargo: visibleCargo,
      manifest: publicCargo(cargo),
      capacity,
      status,
      ...(offloadedTo ? { offloadedTo } : {}),
      movable: piece.power === operatingPower
        && piece.available
        && !offloadedTo
        && !stack.offloadBlocked
        && (mode === 'combat' || !committed),
      canLoad: !offloadedTo && !stack.offloadBlocked && capacity.remaining > 0,
      canOffload: visibleCargo.length > 0 && !offloadedTo && !stack.offloadBlocked,
      ...(disabledReason ? { disabledReason } : {}),
    });
  }

  return cards;
}

export function sameAxisTransportRef(
  left: Pick<AxisTransportRef, 'owner' | 'physicalOrdinal'>,
  right: Pick<AxisTransportRef, 'owner' | 'physicalOrdinal'>,
): boolean {
  return left.owner === right.owner && left.physicalOrdinal === right.physicalOrdinal;
}

/** Toggle only the named hull and capture the card's already-observed token. */
export function toggleAxisTransportHull(
  current: readonly AxisTransportCargoOrder[],
  card: AxisTransportHullCard,
  units: readonly AxisTransportManifestItem[] = card.cargo,
): AxisTransportCargoOrder[] {
  const selected = current.some((order) => sameAxisTransportRef(order, card));
  if (selected) return current.filter((order) => !sameAxisTransportRef(order, card));
  return [
    ...current,
    {
      owner: card.owner,
      physicalOrdinal: card.physicalOrdinal,
      selectionSig: card.selectionSig,
      units: canonicalAxisTransportManifest(units),
    },
  ];
}

/** Reassign one selected hull without changing the freshness token it captured. */
export function setAxisTransportHullUnits(
  current: readonly AxisTransportCargoOrder[],
  ref: Pick<AxisTransportRef, 'owner' | 'physicalOrdinal'>,
  units: readonly AxisTransportManifestItem[],
): AxisTransportCargoOrder[] {
  const manifest = canonicalAxisTransportManifest(units);
  return current.map((order) => sameAxisTransportRef(order, ref)
    ? { ...order, units: manifest.map((unit) => ({ ...unit })) }
    : order);
}

const cloneOrders = (orders: readonly AxisTransportCargoOrder[]): AxisTransportCargoOrder[] =>
  orders.map((order) => ({
    owner: order.owner,
    physicalOrdinal: order.physicalOrdinal,
    selectionSig: order.selectionSig,
    units: canonicalAxisTransportManifest(order.units),
  }));

const manifestIsValid = (units: readonly AxisTransportManifestItem[]): boolean => {
  if (units.length === 0 || units.some((unit) => !isPositiveInt(unit.count) || !isTransportable(unit.key))) {
    return false;
  }
  const canonical = canonicalAxisTransportManifest(units);
  const total = canonical.reduce((sum, unit) => sum + unit.count, 0);
  const nonInfantry = canonical.reduce(
    (sum, unit) => sum + (unit.key === 'infantry' ? 0 : unit.count),
    0,
  );
  return total <= 2 && nonInfantry <= 1;
};

const ordersAreValid = (orders: readonly AxisTransportCargoOrder[]): boolean => {
  const ids = new Set<string>();
  for (const order of orders) {
    const id = `${order.owner}:${order.physicalOrdinal}`;
    if (ids.has(id)
      || !Number.isSafeInteger(order.physicalOrdinal)
      || order.physicalOrdinal < 0
      || order.selectionSig.length === 0
      || !manifestIsValid(order.units)) return false;
    ids.add(id);
  }
  return orders.length > 0;
};

const exactPicksAreValid = (units: readonly AxisUnitPick[]): boolean => {
  const keys = new Set<UnitKey>();
  for (const unit of units) {
    if (keys.has(unit.key)
      || !isTransportable(unit.key)
      || !isPositiveInt(unit.count)
      || !Array.isArray(unit.ordinals)
      || unit.ordinals.length !== unit.count
      || new Set(unit.ordinals).size !== unit.ordinals.length
      || unit.ordinals.some((ordinal) => !Number.isSafeInteger(ordinal) || ordinal < 0)
      || typeof unit.selectionSig !== 'string'
      || unit.selectionSig.length === 0) return false;
    keys.add(unit.key);
  }
  return units.length > 0;
};

const manifestTotals = (orders: readonly AxisTransportCargoOrder[]): Map<UnitKey, number> => {
  const totals = new Map<UnitKey, number>();
  for (const order of orders) {
    for (const unit of order.units) totals.set(unit.key, (totals.get(unit.key) ?? 0) + unit.count);
  }
  return totals;
};

const pickTotalsMatch = (
  units: readonly AxisUnitPick[],
  orders: readonly AxisTransportCargoOrder[],
): boolean => {
  const assigned = manifestTotals(orders);
  if (assigned.size !== units.length) return false;
  return units.every((unit) => assigned.get(unit.key) === unit.count);
};

/** Return null until every exact land pick has one exact per-hull assignment. */
export function buildAxisTransportLoadAction(
  zone: string,
  territory: string,
  units: readonly AxisUnitPick[],
  hulls: readonly AxisTransportCargoOrder[],
): AxisTransportLoadAction | null {
  if (!zone || !territory || !exactPicksAreValid(units) || !ordersAreValid(hulls)) return null;
  if (!pickTotalsMatch(units, hulls)) return null;
  return {
    type: 'load',
    zone,
    territory,
    units: units.map((unit) => ({
      ...unit,
      ordinals: [...unit.ordinals!].sort((left, right) => left - right),
    })),
    hulls: cloneOrders(hulls),
  };
}

/** Build an offload command without flattening cargo across selected hulls. */
export function buildAxisTransportOffloadAction(
  zone: string,
  territory: string,
  hulls: readonly AxisTransportCargoOrder[],
): AxisTransportOffloadAction | null {
  if (!zone || !territory || !ordersAreValid(hulls)) return null;
  return { type: 'offload', zone, territory, hulls: cloneOrders(hulls) };
}

/**
 * Format an already-projected route. Adjacency, canals, and hostile stops stay
 * authoritative in the shared engine; this helper deliberately does not infer
 * or duplicate those rules.
 */
export function summarizeAxisTransportRoute(
  order: AxisTransportRouteOrder,
  destination: string,
): AxisTransportRouteSummary {
  const path = order.via
    ? [order.from, order.via, destination]
    : order.from === destination ? [order.from] : [order.from, destination];
  const distance = (path.length - 1) as 0 | 1 | 2;
  return {
    path,
    distance,
    label: path.join(' → '),
    cargoCount: order.units.reduce((total, unit) => total + unit.count, 0),
  };
}
