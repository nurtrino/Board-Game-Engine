import type { PowerKey, TechKey } from './config.js';
import {
  type AxisMovementSnapshot,
  type AxisRulePower,
  sameAxisRuleSide,
} from './movementRules.js';

function wholeNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Anniversary errata: the +2 applies only in territories worth 3+ IPCs. */
export function axisIncreasedFactoryBonus(
  printedIpc: number,
  techs: readonly TechKey[] = [],
): number {
  const ipc = wholeNonNegative(printedIpc);
  return ipc >= 3 && techs.includes('increasedFactory') ? 2 : 0;
}

export function axisFactoryProductionCapacity(
  printedIpc: number,
  techs: readonly TechKey[] = [],
  damage = 0,
): number {
  const ipc = wholeNonNegative(printedIpc);
  return Math.max(0, ipc + axisIncreasedFactoryBonus(ipc, techs) - wholeNonNegative(damage));
}

export interface AxisOwnCarrierPlacementStatus {
  /** Carriers owned by the placing power already in the zone. */
  readonly existingCarriers: number;
  /** New carriers included in the proposed placement batch. */
  readonly incomingCarriers: number;
  /** Two slots per existing or incoming own carrier. */
  readonly capacity: number;
  /** Independent fighters belonging to the carrier owner already in the zone. */
  readonly ownFighters: number;
  /** Independent fighters belonging to friendly powers already in the zone. */
  readonly alliedFighters: number;
  /** Fighters physically nested on own carriers, including allied guests. */
  readonly guestFighters: number;
  /** Open slots on friendly carriers not owned by the placing power. */
  readonly alliedCarrierOpen: number;
  /** Independent friendly fighters that cannot fit on those allied carriers. */
  readonly independentFightersUsingOwnCarriers: number;
  readonly occupied: number;
  readonly open: number;
}

/**
 * Compute deck space that may receive newly mobilized fighters. Only carriers
 * owned by the placing power count; an allied carrier can receive fighters
 * during movement but cannot receive that power's newly purchased fighters.
 * Allied guest fighters nested on an own carrier consume its physical slots.
 */
export function axisOwnCarrierPlacementStatus(
  snapshot: Pick<AxisMovementSnapshot, 'board'>,
  power: PowerKey,
  zone: string,
  incomingCarriers = 0,
): AxisOwnCarrierPlacementStatus {
  const stacks = snapshot.board[zone] ?? [];
  const existingCarriers = stacks
    .filter((stack) => stack.power === power && stack.key === 'carrier')
    .reduce((total, stack) => total + wholeNonNegative(stack.count), 0);
  const incoming = wholeNonNegative(incomingCarriers);
  const ownFighters = stacks
    .filter((stack) => stack.power === power && stack.key === 'fighter')
    .reduce((total, stack) => total + wholeNonNegative(stack.count), 0);
  const alliedFighters = stacks
    .filter((stack) => stack.key === 'fighter'
      && stack.power !== power
      && sameAxisRuleSide(stack.power, power))
    .reduce((total, stack) => total + wholeNonNegative(stack.count), 0);
  const guestFighters = stacks
    .filter((stack) => stack.power === power && stack.key === 'carrier')
    .flatMap((stack) => stack.cargo ?? [])
    .filter((cargo) => cargo.key === 'fighter' && sameAxisRuleSide(cargo.power, power))
    .reduce((total, cargo) => total + wholeNonNegative(cargo.count), 0);
  const alliedCarrierCapacity = stacks
    .filter((stack) => stack.key === 'carrier'
      && stack.power !== power
      && sameAxisRuleSide(stack.power, power))
    .reduce((total, stack) => total + wholeNonNegative(stack.count) * 2, 0);
  const alliedCarrierCargo = stacks
    .filter((stack) => stack.key === 'carrier'
      && stack.power !== power
      && sameAxisRuleSide(stack.power, power))
    .flatMap((stack) => stack.cargo ?? [])
    .filter((cargo) => cargo.key === 'fighter' && sameAxisRuleSide(cargo.power, power))
    .reduce((total, cargo) => total + wholeNonNegative(cargo.count), 0);
  const alliedCarrierOpen = Math.max(0, alliedCarrierCapacity - alliedCarrierCargo);
  // Independent fighters have no durable host identity. Allocate them to open
  // allied decks first, maximizing the own-carrier space that can legally
  // receive newly mobilized fighters. Any unavoidable overflow consumes an own
  // slot, regardless of which friendly power owns that independent fighter.
  const independentFightersUsingOwnCarriers = Math.max(
    0,
    ownFighters + alliedFighters - alliedCarrierOpen,
  );
  const capacity = (existingCarriers + incoming) * 2;
  const occupied = guestFighters + independentFightersUsingOwnCarriers;
  return {
    existingCarriers,
    incomingCarriers: incoming,
    capacity,
    ownFighters,
    alliedFighters,
    guestFighters,
    alliedCarrierOpen,
    independentFightersUsingOwnCarriers,
    occupied,
    open: Math.max(0, capacity - occupied),
  };
}

export function canAxisPlaceFightersOnOwnCarriers(
  snapshot: Pick<AxisMovementSnapshot, 'board'>,
  power: PowerKey,
  zone: string,
  incomingFighters: number,
  incomingCarriers = 0,
): boolean {
  return axisOwnCarrierPlacementStatus(snapshot, power, zone, incomingCarriers).open
    >= wholeNonNegative(incomingFighters);
}

/** Useful to callers that accept China-shaped snapshots but require a true power. */
export function isAxisCarrierOwningPower(power: AxisRulePower): power is PowerKey {
  return power !== 'china';
}
