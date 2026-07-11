import type { SetiGoldTileDef } from './data.js';

/** The four printed computer-tech positions align with these top-row spaces. */
export const SETI_COMPUTER_TECH_TOP_SPACES = [0, 1, 3, 5] as const;

export type SetiComputerTechBoardSlot = 0 | 1 | 2 | 3;

export function setiComputerTechTopSpace(slot: SetiComputerTechBoardSlot): number {
  return SETI_COMPUTER_TECH_TOP_SPACES[slot];
}

/** The starting-player marker always passes one seat clockwise between rounds. */
export function setiNextStartingSeat(current: number, playerCount: number): number {
  if (!Number.isInteger(current) || !Number.isInteger(playerCount) || playerCount < 1 || current < 0 || current >= playerCount) {
    throw new Error('Invalid SETI starting-player rotation');
  }
  return (current + 1) % playerCount;
}

/** One/two-player setup has two markers at each neutral milestone; three has one. */
export function setiNeutralMarkersPerThreshold(playerCount: number): number {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 4) throw new Error('SETI is 1-4 players');
  if (playerCount <= 2) return 2;
  return playerCount === 3 ? 1 : 0;
}

/**
 * Gold-tile values are marker spaces, not escalating rewards for extra sets.
 * The first claimant gets values[0], the second values[1], and everyone later
 * gets values[2].
 */
export function setiGoldPointsPerSet(definition: SetiGoldTileDef, priorClaims: number): number {
  if (!Number.isInteger(priorClaims) || priorClaims < 0) throw new Error('Invalid SETI gold claim count');
  return definition.values[Math.min(priorClaims, 2)];
}

export function scoreSetiGoldClaim(units: number, pointsPerSet: number): number {
  if (!Number.isInteger(units) || units < 0 || !Number.isInteger(pointsPerSet) || pointsPerSet < 0) {
    throw new Error('Invalid SETI gold scoring values');
  }
  return units * pointsPerSet;
}

