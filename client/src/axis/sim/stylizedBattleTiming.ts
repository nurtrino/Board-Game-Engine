import type { Domain } from './battlescene';

export const STYLIZED_DEATH_MS = {
  land: 1_150,
  sea: 1_350,
} as const satisfies Record<Domain, number>;

export const STYLIZED_SUBMERGE_MS = 1_200;
export const STYLIZED_RETREAT_MS = 1_450;
export const STYLIZED_HEALTH_PULSE_MS = 480;
export const STYLIZED_PARATROOPER_DROP_MS = 2_000;
export const STYLIZED_SHOT_MS = 620;
export const STYLIZED_EMPTY_VOLLEY_MS = 120;

export interface StylizedPresentationSnapshot {
  readonly destroyedIds?: readonly string[];
  readonly submergedIds?: readonly string[];
  readonly retreatingIds?: readonly string[];
  readonly aboardParatrooperIds?: readonly string[];
  readonly deployedParatrooperIds?: readonly string[];
  readonly healthById?: Readonly<Record<string, number>>;
}

function gainedId(previous: readonly string[] | undefined, next: readonly string[] | undefined): boolean {
  if (!next?.length) return false;
  const before = new Set(previous ?? []);
  return next.some((id) => !before.has(id));
}

function lostId(previous: readonly string[] | undefined, next: readonly string[] | undefined): boolean {
  if (!previous?.length) return false;
  const after = new Set(next ?? []);
  return previous.some((id) => !after.has(id));
}

function healthDropped(
  previous: Readonly<Record<string, number>> | undefined,
  next: Readonly<Record<string, number>> | undefined,
): boolean {
  if (!next) return false;
  return Object.entries(next).some(([id, health]) => health < (previous?.[id] ?? 1));
}

/**
 * Longest transition introduced by one authoritative visual generation.
 * The host-supplied duration remains a floor, never a ceiling, so the renderer
 * cannot acknowledge a generation while one of its own transitions is visible.
 */
export function stylizedPresentationDurationMs(args: {
  readonly domain: Domain;
  readonly previous: StylizedPresentationSnapshot;
  readonly next: StylizedPresentationSnapshot;
  readonly requestedMs?: number;
}): number {
  const { domain, previous, next } = args;
  let duration = Math.max(0, args.requestedMs ?? 0);
  if (gainedId(previous.destroyedIds, next.destroyedIds)) {
    duration = Math.max(duration, STYLIZED_DEATH_MS[domain]);
  }
  if (gainedId(previous.submergedIds, next.submergedIds)) {
    duration = Math.max(duration, STYLIZED_SUBMERGE_MS);
  }
  if (gainedId(previous.retreatingIds, next.retreatingIds)) {
    duration = Math.max(duration, STYLIZED_RETREAT_MS);
  }
  if (healthDropped(previous.healthById, next.healthById)) {
    duration = Math.max(duration, STYLIZED_HEALTH_PULSE_MS);
  }
  if (lostId(previous.aboardParatrooperIds, next.aboardParatrooperIds)
    || gainedId(previous.deployedParatrooperIds, next.deployedParatrooperIds)) {
    duration = Math.max(duration, STYLIZED_PARATROOPER_DROP_MS);
  }
  return duration;
}

/** Duration of a staggered deterministic volley, including its impact tail. */
export function stylizedVolleyDurationMs(delaysMs: readonly number[]): number {
  if (delaysMs.length === 0) return STYLIZED_EMPTY_VOLLEY_MS;
  return Math.max(...delaysMs) + STYLIZED_SHOT_MS;
}
