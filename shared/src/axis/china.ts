import { CHINA_RULES } from './config.js';

/** Kwangtung is outside China's printed border, but Chinese units may enter it. */
export const CHINA_SPECIAL_OCCUPATION = 'kwangtung';

export interface ChinaTerritoryLike {
  id: string;
  isChinese?: boolean;
  adj?: readonly string[];
}

export interface ChinaStackLike {
  power: string;
  count: number;
}

const AXIS_POWERS = new Set(['germany', 'italy', 'japan']);

export function isNonAxisChinaHolder(holder: string | null | undefined): boolean {
  return holder != null && !AXIS_POWERS.has(holder);
}

/** True when Chinese pieces may operate in the territory. */
export function isChinaOperatingTerritory(territory: ChinaTerritoryLike): boolean {
  return territory.isChinese === true || territory.id === CHINA_SPECIAL_OCCUPATION;
}

/**
 * Infantry raised at the beginning of China's Purchase Units phase.
 * Every printed Chinese territory not under Axis control counts, including
 * one held by another Allied power. Kwangtung is the special exception: it
 * contributes only while China itself controls it.
 */
export function chinaInfantryGrantFromControl(
  territories: readonly ChinaTerritoryLike[],
  control: Readonly<Record<string, string | null | undefined>>,
): number {
  const controlled = territories.reduce((total, territory) => {
    const holder = control[territory.id];
    if (territory.id === CHINA_SPECIAL_OCCUPATION) {
      return total + (holder === 'china' ? 1 : 0);
    }
    return total + (territory.isChinese === true && isNonAxisChinaHolder(holder) ? 1 : 0);
  }, 0);
  return Math.floor(controlled / CHINA_RULES.infantryPerTerritories);
}

/** Allied pieces do not count toward China's three-piece placement threshold. */
export function chineseUnitCount(stacks: readonly ChinaStackLike[]): number {
  return stacks.reduce((total, stack) =>
    total + (stack.power === 'china' ? Math.max(0, stack.count) : 0), 0);
}

/**
 * Capture the placement choices before placing any of the turn's free infantry.
 * Once a territory starts the phase below the threshold, any number of that
 * turn's Chinese infantry may be placed there.
 */
export function chinaPlacementSpaces(
  territories: readonly ChinaTerritoryLike[],
  control: Readonly<Record<string, string | null | undefined>>,
  board: Readonly<Record<string, readonly ChinaStackLike[] | undefined>>,
): string[] {
  return territories
    .filter((territory) =>
      isChinaOperatingTerritory(territory)
      && control[territory.id] === 'china'
      && chineseUnitCount(board[territory.id] ?? []) < CHINA_RULES.maxUnitsPerPlacement)
    .map((territory) => territory.id);
}

/**
 * Chinese captures normally receive a Chinese control marker. Kwangtung is
 * restored to the United Kingdom while the UK still controls its capital.
 */
export function controllerAfterChineseCapture(
  territoryId: string,
  ukCapitalHeldByUk: boolean,
): 'china' | 'uk' {
  return territoryId === CHINA_SPECIAL_OCCUPATION && ukCapitalHeldByUk ? 'uk' : 'china';
}

/** Region-restricted graph distances for Chinese land and Flying Tigers moves. */
export function chinaReachableDistances(
  territories: readonly ChinaTerritoryLike[],
  from: string,
  maxRange: number,
): Map<string, number> {
  const byId = new Map(territories.map((territory) => [territory.id, territory]));
  const origin = byId.get(from);
  if (!origin || !isChinaOperatingTerritory(origin)) return new Map();
  const distances = new Map<string, number>([[from, 0]]);
  let frontier = [from];
  for (let distance = 1; distance <= Math.max(0, Math.floor(maxRange)); distance++) {
    const next: string[] = [];
    for (const space of frontier) {
      for (const neighborId of byId.get(space)?.adj ?? []) {
        if (distances.has(neighborId)) continue;
        const neighbor = byId.get(neighborId);
        if (!neighbor || !isChinaOperatingTerritory(neighbor)) continue;
        distances.set(neighborId, distance);
        next.push(neighborId);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return distances;
}

export function chinaMoveDistance(
  territories: readonly ChinaTerritoryLike[],
  from: string,
  to: string,
  maxRange: number,
): number | null {
  return chinaReachableDistances(territories, from, maxRange).get(to) ?? null;
}

export function isChinaFriendlyLandingTerritory(
  territory: ChinaTerritoryLike | undefined,
  control: Readonly<Record<string, string | null | undefined>>,
  contested: readonly string[],
): boolean {
  return Boolean(territory
    && isChinaOperatingTerritory(territory)
    && isNonAxisChinaHolder(control[territory.id])
    && !contested.includes(territory.id));
}

/** No-suicide check for the Flying Tigers, including their restricted route. */
export function chinaFighterAttackHasLanding(args: {
  territories: readonly ChinaTerritoryLike[];
  control: Readonly<Record<string, string | null | undefined>>;
  contested: readonly string[];
  from: string;
  target: string;
  movementSpent?: number;
  range?: number;
}): boolean {
  const range = Math.max(0, (args.range ?? 4) - Math.max(0, args.movementSpent ?? 0));
  const attackDistance = chinaMoveDistance(args.territories, args.from, args.target, range);
  if (attackDistance == null) return false;
  const remaining = range - attackDistance;
  const fromTarget = chinaReachableDistances(args.territories, args.target, remaining);
  const byId = new Map(args.territories.map((territory) => [territory.id, territory]));
  return [...fromTarget.keys()].some((space) =>
    isChinaFriendlyLandingTerritory(byId.get(space), args.control, args.contested));
}
