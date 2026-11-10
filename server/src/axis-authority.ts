import {
  AXIS_SEATS,
  type AxisAction,
  type AxisSeat,
  type SeatColor,
} from '@bge/shared';

interface AxisAuthorityPlayer {
  color: SeatColor;
}

type AuthorizedAxisAction = AxisAction & { asPower: AxisSeat };

export type AxisAuthorization =
  | { ok: true; action: AuthorizedAxisAction }
  | { ok: false; error: string };

const AXIS_POWERS = new Set<string>(AXIS_SEATS);

function isAxisSeat(value: unknown): value is AxisSeat {
  return typeof value === 'string' && AXIS_POWERS.has(value);
}

/**
 * Powers a real room recipient may command.
 *
 * Authority deliberately follows the real player slot, never a dev-view
 * override. The host covers every currently unseated power so partial and
 * one-device tables keep moving, but can never take a power claimed by
 * another player.
 */
export function controlledAxisPowers(
  players: readonly AxisAuthorityPlayer[],
  playerIdx: number | null,
): AxisSeat[] {
  if (playerIdx === null) return [];
  const player = players[playerIdx];
  if (!player || !isAxisSeat(player.color)) return [];

  if (playerIdx !== 0) return [player.color];
  const seated = new Set(players.map((seat) => seat.color).filter(isAxisSeat));
  return AXIS_SEATS.filter((power) => power === player.color || !seated.has(power));
}

/**
 * Bind an Axis action to the power owned by this real room seat.
 *
 * A player may act for the power they selected in the lobby. Seat zero is
 * also the table host, so it may cover powers that nobody selected; this is
 * the intentional fallback that keeps partial tables and one-device games
 * moving. It never overrides a power assigned to another player.
 */
export function authorizeAxisAction(
  players: readonly AxisAuthorityPlayer[],
  playerIdx: number,
  action: unknown,
): AxisAuthorization {
  const player = players[playerIdx];
  if (!player || !isAxisSeat(player.color)) {
    return { ok: false, error: 'This player is not assigned an Axis power.' };
  }
  if (action === null || typeof action !== 'object' || Array.isArray(action)) {
    return { ok: false, error: 'Malformed action.' };
  }

  const requested = (action as { asPower?: unknown }).asPower ?? player.color;
  if (!isAxisSeat(requested)) {
    return { ok: false, error: 'Unknown Axis power.' };
  }

  if (!controlledAxisPowers(players, playerIdx).includes(requested)) {
    return { ok: false, error: `Only the player assigned to ${requested} may act for that power.` };
  }

  return {
    ok: true,
    action: { ...(action as AxisAction), asPower: requested },
  };
}

/** View impersonation is never action authority in production. */
export function resolveActionSeat(
  realSeat: number | null,
  viewAs: number | null | undefined,
  allowDevelopmentControl: boolean,
): number | null {
  return allowDevelopmentControl && viewAs !== undefined ? viewAs : realSeat;
}

/** Runtime-safe check used before an Axis action reaches the reducer. */
export function isAxisBattleRoll(action: unknown): boolean {
  return action !== null
    && typeof action === 'object'
    && !Array.isArray(action)
    && (action as { type?: unknown }).type === 'battleRoll';
}

/** Runtime-safe check for the terminal action that can unmount a battle. */
export function isAxisBattleContinue(action: unknown): boolean {
  return action !== null
    && typeof action === 'object'
    && !Array.isArray(action)
    && (action as { type?: unknown }).type === 'battleContinue';
}

const AXIS_BATTLE_MUTATIONS = new Set([
  'battleRoll',
  'battleCasualties',
  'battleSubmerge',
  'battleRetreat',
]);

/** Any battle mutation whose resulting animation must settle before advancing. */
export function isAxisBattleVisualMutation(action: unknown): boolean {
  return action !== null
    && typeof action === 'object'
    && !Array.isArray(action)
    && AXIS_BATTLE_MUTATIONS.has(String((action as { type?: unknown }).type));
}

/** Every action that is allowed to cross the cinematic readiness boundary. */
export function isAxisBattleVisualGateAction(action: unknown): boolean {
  return isAxisBattleVisualMutation(action) || isAxisBattleContinue(action);
}

/** Return a valid finite integer target only for a battle-roll action. */
export function axisBattleRollCombatId(action: unknown): number | null {
  if (!isAxisBattleRoll(action)) return null;
  const combatId = (action as { combatId?: unknown }).combatId;
  return typeof combatId === 'number' && Number.isSafeInteger(combatId) ? combatId : null;
}

export function axisBattleContinueCombatId(action: unknown): number | null {
  if (!isAxisBattleContinue(action)) return null;
  const combatId = (action as { combatId?: unknown }).combatId;
  return typeof combatId === 'number' && Number.isSafeInteger(combatId) ? combatId : null;
}

/** Exact combat + battlefield generation named by a gated battle action. */
export function axisBattleActionGeneration(action: unknown): AxisBattleVisualGeneration | null {
  if (!isAxisBattleVisualGateAction(action)) return null;
  const target = action as { combatId?: unknown; visualSeq?: unknown };
  if (typeof target.combatId !== 'number' || !Number.isSafeInteger(target.combatId) || target.combatId < 0) return null;
  if (typeof target.visualSeq !== 'number' || !Number.isSafeInteger(target.visualSeq) || target.visualSeq < 0) return null;
  return { combatId: target.combatId, visualSeq: target.visualSeq };
}

export interface AxisBattleVisualGeneration { combatId: number; visualSeq: number }

/** Readiness is an exact battle-and-authoritative-state generation match. */
export function hasReadyAxisBattleWatcher(
  current: AxisBattleVisualGeneration | null | undefined,
  watcherGenerations: Iterable<AxisBattleVisualGeneration | null | undefined>,
): boolean {
  if (!current) return false;
  for (const ready of watcherGenerations) {
    if (ready?.combatId === current.combatId && ready.visualSeq === current.visualSeq) return true;
  }
  return false;
}
