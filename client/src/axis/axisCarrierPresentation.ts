import {
  UNITS,
  airDistance,
  airUnitRange,
  axisControlledSinceTurnStart,
  axisEnemySurfaceWarshipAt,
  axisFactoryProductionCapacity,
  axisIncrementalNewCarriersNeeded,
  sameAxisSide,
  type AxisNewCarrierLandingOrder,
  type AxisCarrierObligationRow,
  type AxisPhysicalPiece,
  type AxisView,
  type MapIndex,
  type PowerKey,
} from '@bge/shared';

export interface AxisCarrierSelectedFighter {
  readonly from: string;
  readonly ordinal: number;
  readonly movementSpent: number;
  readonly carrierLanding?: { readonly ref: string; readonly seaZone: string };
}

export interface AxisCarrierFactoryChoice {
  readonly factory: string;
  readonly maximum: number;
  readonly used: number;
  readonly alreadyReserved: number;
  readonly availableForNewPromise: number;
}

export interface AxisCarrierLandingPlan {
  readonly key: string;
  readonly zone: string;
  readonly hostile: boolean;
  readonly fighterCount: number;
  readonly totalPromisedFighters: number;
  readonly reservedCarriers: number;
  readonly newCarriers: number;
  readonly carrierFactories: readonly string[];
  readonly factoryChoices: readonly AxisCarrierFactoryChoice[];
  readonly declaration: AxisNewCarrierLandingOrder;
  /** Noncombat sends one exact move per origin, so each gets its own delta. */
  readonly moveDeclarations: Readonly<Record<string, AxisNewCarrierLandingOrder>>;
}

export interface AxisCarrierObligationCard {
  readonly power: PowerKey;
  readonly seaZone: string;
  readonly fighterCount: number;
  readonly carrierCount: number;
  readonly carrierFactories: readonly string[];
}

export interface AxisCarrierRequiredPlacement {
  readonly seaZone: string;
  readonly factory: string;
  readonly count: number;
}

const positiveWhole = (value: number | undefined): number =>
  Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 0;

function coalitionFighterDeck(view: AxisView, power: PowerKey, zone: string): {
  slots: number;
  occupiedWithoutTagged: number;
  hostile: boolean;
} {
  const stacks = view.board[zone] ?? [];
  let slots = 0;
  let occupied = 0;
  let tagged = 0;
  for (const stack of stacks) {
    if (stack.key === 'carrier' && sameAxisSide(stack.power, power)) {
      slots += positiveWhole(stack.count) * 2;
      occupied += (stack.cargo ?? [])
        .filter((cargo) => cargo.key === 'fighter' && sameAxisSide(cargo.power, power))
        .reduce((total, cargo) => total + positiveWhole(cargo.count), 0);
    } else if (stack.key === 'fighter' && sameAxisSide(stack.power, power)) {
      occupied += positiveWhole(stack.count);
      if (stack.count === 1 && stack.carrierLanding) tagged += 1;
    }
  }
  return {
    slots,
    occupiedWithoutTagged: Math.max(0, occupied - tagged),
    hostile: axisEnemySurfaceWarshipAt(view, zone, power),
  };
}

function reservedFactoryCounts(obligations: readonly AxisCarrierObligationRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of obligations) {
    for (const factory of row.carrierFactories) {
      counts.set(factory, (counts.get(factory) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Mirror the reducer's pre-declaration trim: selected tagged fighters that
 * leave an older promised zone release any carrier and factory reservation no
 * longer needed there. A fighter staying in the same promised zone keeps it.
 */
function effectiveObligationsForPlan(
  view: AxisView,
  power: PowerKey,
  targetZone: string,
  fighters: readonly AxisCarrierSelectedFighter[],
): AxisCarrierObligationRow[] {
  const selectedRefs = new Set(fighters.flatMap((fighter) =>
    fighter.carrierLanding ? [fighter.carrierLanding.ref] : []));
  return view.newCarrierLandingObligations
    .filter((row) => row.power === power)
    .flatMap((row) => {
      const fighterRefs = row.fighterRefs.filter((ref) =>
        row.seaZone === targetZone || !selectedRefs.has(ref));
      const deck = coalitionFighterDeck(view, power, row.seaZone);
      const requiredCarriers = axisIncrementalNewCarriersNeeded(fighterRefs.length, {
        ownCarrierSlots: deck.hostile ? 0 : deck.slots,
        alliedCarrierSlots: 0,
        occupiedByOwnFighters: deck.occupiedWithoutTagged,
        occupiedByAlliedGuests: 0,
      });
      const carrierFactories = [...row.carrierFactories]
        .sort((a, b) => a.localeCompare(b))
        .slice(0, requiredCarriers);
      return fighterRefs.length > 0 || carrierFactories.length > 0 ? [{
        ...row,
        fighterRefs,
        carrierFactories,
      }] : [];
    });
}

function factoryChoicesForZone(
  view: AxisView,
  idx: MapIndex,
  power: PowerKey,
  zone: string,
  obligations: readonly AxisCarrierObligationRow[],
): AxisCarrierFactoryChoice[] {
  const reserved = reservedFactoryCounts(obligations);
  return (idx.seaZone[zone]?.coastTo ?? []).flatMap((factory) => {
    const territory = idx.territory[factory];
    if (!territory
      || !axisControlledSinceTurnStart(view, factory, power)
      || !(view.board[factory] ?? []).some((stack) =>
        stack.power === power && stack.key === 'factory' && stack.count > 0)) return [];
    const maximum = axisFactoryProductionCapacity(
      territory.ipc,
      view.powers[power].techs,
      view.factoryDamage[factory] ?? 0,
    );
    const used = positiveWhole(view.powers[power].factoriesUsed[factory]);
    const alreadyReserved = reserved.get(factory) ?? 0;
    return [{
      factory,
      maximum,
      used,
      alreadyReserved,
      availableForNewPromise: Math.max(0, maximum - used - alreadyReserved),
    }];
  }).sort((a, b) => a.factory.localeCompare(b.factory));
}

function factoryAllocations(
  choices: readonly AxisCarrierFactoryChoice[],
  needed: number,
  limit = 16,
): string[][] {
  if (needed === 0) return [[]];
  const allocations: string[][] = [];
  const walk = (index: number, left: number, current: string[]) => {
    if (allocations.length >= limit) return;
    if (left === 0) {
      allocations.push([...current]);
      return;
    }
    if (index >= choices.length) return;
    const choice = choices[index]!;
    const max = Math.min(left, choice.availableForNewPromise);
    for (let count = max; count >= 0; count--) {
      current.push(...Array.from({ length: count }, () => choice.factory));
      walk(index + 1, left - count, current);
      current.splice(current.length - count, count);
    }
  };
  walk(0, needed, []);
  return allocations;
}

function groupedExactFighters(
  fighters: readonly AxisCarrierSelectedFighter[],
): { from: string; ordinals: number[] }[] {
  const grouped = new Map<string, number[]>();
  for (const fighter of fighters) {
    const ordinals = grouped.get(fighter.from) ?? [];
    ordinals.push(fighter.ordinal);
    grouped.set(fighter.from, ordinals);
  }
  return [...grouped]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, ordinals]) => ({ from, ordinals: [...ordinals].sort((a, b) => a - b) }));
}

function fighterCanReachPlan(args: {
  fighter: AxisCarrierSelectedFighter;
  idx: MapIndex;
  range: number;
  mode: 'combat' | 'noncombat';
  target: string;
  zone: string;
}): boolean {
  const available = Math.max(0, args.range - args.fighter.movementSpent);
  if (args.mode === 'noncombat') {
    return args.target === args.zone
      && airDistance(args.idx, args.fighter.from, args.zone, available) != null;
  }
  const toBattle = airDistance(args.idx, args.fighter.from, args.target, available);
  if (toBattle == null) return false;
  return airDistance(args.idx, args.target, args.zone, available - toBattle) != null;
}

/**
 * Build every feasible purchased-carrier declaration for the selected exact
 * fighters. Ordinary landings remain the caller's first choice; these plans
 * are the amber fallback when the shared air validator rejects without one.
 */
export function axisCarrierLandingPlans(args: {
  readonly view: AxisView;
  readonly idx: MapIndex;
  readonly power: PowerKey;
  readonly fighters: readonly AxisCarrierSelectedFighter[];
  readonly mode: 'combat' | 'noncombat';
  readonly target: string;
}): AxisCarrierLandingPlan[] {
  const { view, idx, power, fighters, mode, target } = args;
  if (fighters.length === 0) return [];
  const range = airUnitRange('fighter', view.powers[power].techs);
  const zones = mode === 'noncombat'
    ? idx.seaZone[target] ? [target] : []
    : idx.map.seaZones.map((zone) => zone.id);
  const stagedCarriers = positiveWhole(view.powers[power].staging.carrier);
  const grouped = groupedExactFighters(fighters);
  const plans: AxisCarrierLandingPlan[] = [];

  for (const zone of zones) {
    if (!fighters.every((fighter) => fighterCanReachPlan({
      fighter, idx, range, mode, target, zone,
    }))) continue;
    const rows = effectiveObligationsForPlan(view, power, zone, fighters);
    const totalReserved = rows.reduce((total, row) => total + row.carrierFactories.length, 0);
    const unreservedStaged = Math.max(0, stagedCarriers - totalReserved);
    const row = rows.find((candidate) => candidate.seaZone === zone);
    const existingRefs = new Set(row?.fighterRefs ?? []);
    const newlyAdded = fighters.filter((fighter) =>
      !fighter.carrierLanding || !existingRefs.has(fighter.carrierLanding.ref)).length;
    const totalPromisedFighters = existingRefs.size + newlyAdded;
    const deck = coalitionFighterDeck(view, power, zone);
    const reservedCarriers = row?.carrierFactories.length ?? 0;
    const requiredCarriers = axisIncrementalNewCarriersNeeded(totalPromisedFighters, {
      ownCarrierSlots: deck.hostile ? 0 : deck.slots,
      alliedCarrierSlots: 0,
      occupiedByOwnFighters: deck.occupiedWithoutTagged,
      occupiedByAlliedGuests: 0,
    });
    const newCarriers = Math.max(0, requiredCarriers - reservedCarriers);
    // The authoritative reducer requires every declaration to be backed by at
    // least one purchased carrier. A physical-only landing is ordinary green.
    if (reservedCarriers + newCarriers === 0 || newCarriers > unreservedStaged) continue;
    const choices = factoryChoicesForZone(view, idx, power, zone, rows);
    for (const allocation of factoryAllocations(choices, newCarriers)) {
      const declaration: AxisNewCarrierLandingOrder = {
        zone,
        fighters: grouped,
        carrierFactories: allocation,
      };
      let runningCount = existingRefs.size;
      let runningReserved = reservedCarriers;
      let allocationOffset = 0;
      const moveDeclarations: Record<string, AxisNewCarrierLandingOrder> = {};
      for (const group of grouped) {
        const groupFighters = fighters.filter((fighter) => fighter.from === group.from);
        runningCount += groupFighters.filter((fighter) =>
          !fighter.carrierLanding || !existingRefs.has(fighter.carrierLanding.ref)).length;
        const neededNow = axisIncrementalNewCarriersNeeded(runningCount, {
          ownCarrierSlots: deck.hostile ? 0 : deck.slots,
          alliedCarrierSlots: 0,
          occupiedByOwnFighters: deck.occupiedWithoutTagged,
          occupiedByAlliedGuests: 0,
        });
        const factoryDelta = Math.max(0, neededNow - runningReserved);
        const factories = allocation.slice(allocationOffset, allocationOffset + factoryDelta);
        allocationOffset += factoryDelta;
        runningReserved += factoryDelta;
        moveDeclarations[group.from] = {
          zone,
          fighters: [{ from: group.from, ordinals: group.ordinals }],
          carrierFactories: factories,
        };
      }
      plans.push({
        key: `${zone}|${allocation.join('>') || 'shared'}`,
        zone,
        hostile: deck.hostile,
        fighterCount: fighters.length,
        totalPromisedFighters,
        reservedCarriers,
        newCarriers,
        carrierFactories: allocation,
        factoryChoices: choices,
        declaration,
        moveDeclarations,
      });
    }
  }
  return plans.sort((a, b) => a.zone.localeCompare(b.zone)
    || a.carrierFactories.join('\u0000').localeCompare(b.carrierFactories.join('\u0000')));
}

export function axisCarrierObligationCards(
  view: Pick<AxisView, 'newCarrierLandingObligations'>,
  power: PowerKey,
): AxisCarrierObligationCard[] {
  return view.newCarrierLandingObligations
    .filter((row) => row.power === power)
    .map((row) => ({
      power,
      seaZone: row.seaZone,
      fighterCount: row.fighterRefs.length,
      carrierCount: row.carrierFactories.length,
      carrierFactories: [...row.carrierFactories],
    }))
    .sort((a, b) => a.seaZone.localeCompare(b.seaZone));
}

export function axisCarrierRequiredPlacements(
  view: Pick<AxisView, 'newCarrierLandingObligations'>,
  power: PowerKey,
): AxisCarrierRequiredPlacement[] {
  const grouped = new Map<string, AxisCarrierRequiredPlacement>();
  for (const card of axisCarrierObligationCards(view, power)) {
    for (const factory of card.carrierFactories) {
      const key = `${card.seaZone}\u0000${factory}`;
      const current = grouped.get(key);
      grouped.set(key, {
        seaZone: card.seaZone,
        factory,
        count: (current?.count ?? 0) + 1,
      });
    }
  }
  return [...grouped.values()].sort((a, b) =>
    a.seaZone.localeCompare(b.seaZone) || a.factory.localeCompare(b.factory));
}

/** Adapter from the renderer's physical piece shape. */
export function axisCarrierSelectedFighters(
  pieces: readonly (AxisPhysicalPiece & { readonly space: string })[],
): AxisCarrierSelectedFighter[] {
  return pieces.flatMap((piece) => piece.key === 'fighter' && piece.ordinal != null ? [{
    from: piece.space,
    ordinal: piece.ordinal,
    movementSpent: piece.movementSpent,
    ...(piece.carrierLanding ? { carrierLanding: { ...piece.carrierLanding } } : {}),
  }] : []);
}

export function axisCarrierReservedFactoryCount(
  view: Pick<AxisView, 'newCarrierLandingObligations'>,
  power: PowerKey,
  factory: string,
): number {
  return view.newCarrierLandingObligations
    .filter((row) => row.power === power)
    .reduce((total, row) => total + row.carrierFactories.filter((entry) => entry === factory).length, 0);
}

export const axisCarrierUnitName = UNITS.carrier.name;
