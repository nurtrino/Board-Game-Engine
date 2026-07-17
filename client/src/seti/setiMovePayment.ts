import { SETI_RULES } from '@bge/shared';

export type SetiMovePayment = { energy: number } | { cardId: string };

function boundedMoveCost(cost: number | undefined): number {
  return Number.isFinite(cost) ? Math.max(SETI_RULES.moveEnergy, Number(cost)) : SETI_RULES.moveEnergy;
}

/**
 * Resolve the payment the UI may safely send for one physical destination.
 * A movement-corner card replaces only the printed base movement energy; any
 * asteroid-exit surcharge still has to be affordable in energy.
 */
export function setiMovePaymentForCost(
  cost: number | undefined,
  availableEnergy: number,
  selectedCardId: string | null,
  eligibleCardIds: readonly string[],
): SetiMovePayment | null {
  const exactCost = boundedMoveCost(cost);
  if (selectedCardId !== null) {
    if (!eligibleCardIds.includes(selectedCardId)) return null;
    const surcharge = Math.max(0, exactCost - SETI_RULES.moveEnergy);
    return availableEnergy >= surcharge ? { cardId: selectedCardId } : null;
  }
  return availableEnergy >= exactCost ? { energy: exactCost } : null;
}

export function setiAffordableMoveCells(
  cells: readonly string[],
  costs: Readonly<Record<string, number>>,
  availableEnergy: number,
  selectedCardId: string | null,
  eligibleCardIds: readonly string[],
): string[] {
  return cells.filter((cell) => setiMovePaymentForCost(
    costs[cell],
    availableEnergy,
    selectedCardId,
    eligibleCardIds,
  ) !== null);
}
