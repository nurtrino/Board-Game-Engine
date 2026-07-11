import {
  UNITS,
  axisControlledSinceTurnStart,
  axisFactoryProductionCapacity,
  axisOwnCarrierPlacementStatus,
  canAxisPlaceFightersOnOwnCarriers,
  type AxisAction,
  type AxisCarrierObligationRow,
  type AxisMovementSnapshot,
  type AxisOwnCarrierPlacementStatus,
  type MapIndex,
  type PowerKey,
  type TechKey,
  type UnitKey,
} from '@bge/shared';

export type AxisPlacementSelection = Record<string, number>;
export type AxisPlaceBatchAction = Extract<AxisAction, { type: 'placeBatch' }>;

/** Build the single authoritative command used for a multi-type placement. */
export function buildPlaceBatchAction(
  space: string,
  selection: AxisPlacementSelection,
  factory?: string,
): AxisPlaceBatchAction {
  const units = Object.entries(selection)
    .filter(([key, count]) => key !== 'china' && Number.isSafeInteger(count) && count > 0)
    .map(([key, count]) => ({ key: key as UnitKey, count }));
  const china = Number.isSafeInteger(selection.china) && selection.china > 0 ? selection.china : 0;
  return {
    type: 'placeBatch',
    space,
    units,
    ...(china > 0 ? { china } : {}),
    ...(factory ? { factory } : {}),
  };
}

/** Remaining slots come only from the serialized authoritative usage map. */
export function remainingFactoryCapacity(
  maximum: number,
  factoriesUsed: Readonly<Record<string, number | undefined>>,
  factory: string,
): number {
  return Math.max(0, maximum - (factoriesUsed[factory] ?? 0));
}

export interface AxisMobilizationPlanningState extends AxisMovementSnapshot {
  readonly factoryDamage: Readonly<Record<string, number | undefined>>;
  readonly factoriesUsed: Readonly<Record<string, number | undefined>>;
  readonly techs: readonly TechKey[];
  readonly chinaPlacementSpaces: readonly string[];
  readonly newCarrierLandingObligations?: readonly AxisCarrierObligationRow[];
  readonly stagedCarriers?: number;
}

export interface AxisMobilizationDestinationPlan {
  readonly space: string;
  /** The exact industrial complex serialized with a production placement. */
  readonly factory?: string;
  readonly productionCount: number;
  readonly factoryMaximum?: number;
  /** Open production slots before this proposed batch is placed. */
  readonly factoryRemaining?: number;
  /** Production slots protected for promises after this exact batch. */
  readonly factoryReserved?: number;
  /** Promised carriers this exact zone+factory batch will fulfill. */
  readonly matchingReservedCarriers?: number;
  readonly unreservedStagedCarriers?: number;
  readonly fighterCount: number;
  /** Own-carrier deck state before the selected new fighters consume slots. */
  readonly deck?: AxisOwnCarrierPlacementStatus;
}

export interface AxisStagedPlacementWitness {
  /** A single staged sculpt that the server would still require to be placed. */
  readonly key: UnitKey;
  readonly plan: AxisMobilizationDestinationPlan;
}

function selectedCount(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 0;
}

function hasFactoryAt(state: Pick<AxisMovementSnapshot, 'board'>, territory: string): boolean {
  return (state.board[territory] ?? []).some((stack) => stack.key === 'factory' && stack.count > 0);
}

/**
 * Legal whole-batch destinations shown by the mobilization UI. The planner is
 * intentionally pure and mirrors the authoritative placement checks: exact
 * start-of-turn control, damaged factory capacity, and own-carrier deck space.
 */
export function axisMobilizationDestinationPlans(args: {
  readonly state: AxisMobilizationPlanningState;
  readonly idx: MapIndex;
  readonly power: PowerKey;
  readonly selection: AxisPlacementSelection;
}): AxisMobilizationDestinationPlan[] {
  const { state, idx, power, selection } = args;
  const regular = Object.entries(selection).flatMap(([candidate, value]) => {
    if (!(candidate in UNITS)) return [];
    const count = selectedCount(value);
    return count > 0 ? [{ key: candidate as UnitKey, count }] : [];
  });
  const china = selectedCount(selection.china);
  if (regular.length === 0 && china === 0) return [];
  if (china > 0 && power !== 'usa') return [];

  const factoryOrder = regular.find((unit) => unit.key === 'factory');
  if (factoryOrder && (factoryOrder.count !== 1 || regular.length !== 1 || china > 0)) return [];

  const productionCount = regular
    .filter((unit) => unit.key !== 'factory')
    .reduce((total, unit) => total + unit.count, 0);
  const fighterCount = regular
    .filter((unit) => unit.key === 'fighter')
    .reduce((total, unit) => total + unit.count, 0);
  const incomingCarriers = regular
    .filter((unit) => unit.key === 'carrier')
    .reduce((total, unit) => total + unit.count, 0);
  const hasSeaUnit = regular.some((unit) => UNITS[unit.key].domain === 'sea');
  const hasLandOnlyUnit = regular.some((unit) => UNITS[unit.key].domain !== 'sea' && unit.key !== 'fighter');
  if (hasSeaUnit && (hasLandOnlyUnit || china > 0)) return [];

  const plans: AxisMobilizationDestinationPlan[] = [];
  const obligations = (state.newCarrierLandingObligations ?? [])
    .filter((row) => row.power === power);
  const totalReservedCarriers = obligations.reduce(
    (total, row) => total + row.carrierFactories.length,
    0,
  );
  const stagedCarriers = state.stagedCarriers ?? Number.POSITIVE_INFINITY;
  const unreservedStagedCarriers = Math.max(0, stagedCarriers - totalReservedCarriers);
  const reservedAtFactory = (factory: string): number => obligations.reduce(
    (total, row) => total + row.carrierFactories.filter((entry) => entry === factory).length,
    0,
  );
  const matchingAt = (space: string, factory: string): number => Math.min(
    incomingCarriers,
    obligations
      .filter((row) => row.seaZone === space)
      .reduce(
        (total, row) => total + row.carrierFactories.filter((entry) => entry === factory).length,
        0,
      ),
  );
  const allowLand = !hasSeaUnit;
  const allowSea = regular.length > 0 && !hasLandOnlyUnit && china === 0;

  if (allowLand) {
    for (const territory of idx.map.territories) {
      if (china > 0 && !state.chinaPlacementSpaces.includes(territory.id)) continue;
      if (regular.length === 0) {
        plans.push({ space: territory.id, productionCount: 0, fighterCount: 0 });
        continue;
      }
      if (!axisControlledSinceTurnStart(state, territory.id, power)) continue;
      if (factoryOrder) {
        if (territory.ipc < 1 || hasFactoryAt(state, territory.id)) continue;
        plans.push({ space: territory.id, productionCount: 0, fighterCount: 0 });
        continue;
      }
      if (!hasFactoryAt(state, territory.id)) continue;
      const factoryMaximum = axisFactoryProductionCapacity(
        territory.ipc,
        state.techs,
        state.factoryDamage[territory.id] ?? 0,
      );
      const factoryReserved = reservedAtFactory(territory.id);
      const factoryRemaining = Math.max(
        0,
        remainingFactoryCapacity(factoryMaximum, state.factoriesUsed, territory.id) - factoryReserved,
      );
      if (productionCount > factoryRemaining) continue;
      plans.push({
        space: territory.id,
        factory: territory.id,
        productionCount,
        factoryMaximum,
        factoryRemaining,
        ...(factoryReserved > 0 ? { factoryReserved } : {}),
        fighterCount,
      });
    }
  }

  if (allowSea) {
    for (const zone of idx.map.seaZones) {
      const capacities = (zone.coastTo ?? []).flatMap((territoryId) => {
        const territory = idx.territory[territoryId];
        if (!territory
          || !axisControlledSinceTurnStart(state, territoryId, power)
          || !hasFactoryAt(state, territoryId)) return [];
        const factoryMaximum = axisFactoryProductionCapacity(
          territory.ipc,
          state.techs,
          state.factoryDamage[territoryId] ?? 0,
        );
        const matchingReservedCarriers = matchingAt(zone.id, territoryId);
        const factoryReserved = Math.max(
          0,
          reservedAtFactory(territoryId) - matchingReservedCarriers,
        );
        return [{
          factory: territoryId,
          factoryMaximum,
          factoryRemaining: Math.max(
            0,
            remainingFactoryCapacity(factoryMaximum, state.factoriesUsed, territoryId) - factoryReserved,
          ),
          factoryReserved,
          matchingReservedCarriers,
        }];
      });
      const deck = fighterCount > 0
        ? axisOwnCarrierPlacementStatus(state, power, zone.id, incomingCarriers)
        : undefined;
      if (fighterCount > 0
        && !canAxisPlaceFightersOnOwnCarriers(state, power, zone.id, fighterCount, incomingCarriers)) continue;
      for (const capacity of capacities) {
        if (capacity.factoryRemaining < productionCount) continue;
        if (incomingCarriers > unreservedStagedCarriers + capacity.matchingReservedCarriers) continue;
        plans.push({
          space: zone.id,
          ...capacity,
          productionCount,
          fighterCount,
          unreservedStagedCarriers,
          ...(deck ? { deck } : {}),
        });
      }
    }
  }

  return plans;
}

/**
 * Find the first exact singleton placement that is still legal. The server
 * uses the same singleton-witness rule before it permits staging carryover,
 * so the UI can focus a real destination instead of offering an end-turn
 * confirmation that the authoritative reducer must reject.
 */
export function axisFirstLegalStagedPlacement(args: {
  readonly state: AxisMobilizationPlanningState;
  readonly idx: MapIndex;
  readonly power: PowerKey;
  readonly staging: Readonly<Partial<Record<UnitKey, number>>>;
}): AxisStagedPlacementWitness | null {
  const { state, idx, power, staging } = args;
  for (const [candidate, value] of Object.entries(staging)) {
    if (!(candidate in UNITS) || selectedCount(value) === 0) continue;
    const key = candidate as UnitKey;
    const plan = axisMobilizationDestinationPlans({
      state,
      idx,
      power,
      selection: { [key]: 1 },
    })[0];
    if (plan) return { key, plan };
  }
  return null;
}
