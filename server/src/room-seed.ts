import type { GameOptions } from '@bge/shared';

const MAX_UNSIGNED_SEED = 0xffff_ffff;

/**
 * Use a caller-supplied setup seed only on development-controlled servers.
 * Production always evaluates the random fallback, even if a room payload
 * contains a seed, so clients cannot influence a live game's hidden setup.
 */
export function resolveRoomSeed(
  options: GameOptions | undefined,
  allowDevelopmentControl: boolean,
  randomSeed: () => number,
): number {
  const requested = options?.seed;
  if (allowDevelopmentControl
    && typeof requested === 'number'
    && Number.isInteger(requested)
    && requested >= 0
    && requested <= MAX_UNSIGNED_SEED) {
    return requested;
  }
  return randomSeed();
}
