// The Axis & Allies world: one coordinate frame for everything on the map.
// Art space is the printed board in pixels (9500 x 4956, measured from the mod's table texture).
// Render space is art space * 0.01 with north away from the camera, so one render unit is about
// one Tabletop Simulator unit and the mod's sculpts sit at their own scale.
import { AXIS_MAP, CHINA_COLOR, POWERS, UNITS, type PowerKey, type UnitKey } from '@bge/shared';
import regionsJson from './regions-data.json';

export const ART_W = 9500;
export const ART_H = 4956;
export const S = 0.01;
export const MAP_W = ART_W * S;
export const MAP_D = ART_H * S;

export type Px = [number, number];

/** Art pixel to render x,z. */
export const px2r = (px: number, py: number): [number, number] => [px * S, (py - ART_H) * S];
/** Render x,z to art pixel. */
export const r2px = (x: number, z: number): Px => [x / S, z / S + ART_H];

export const TERR = Object.fromEntries(AXIS_MAP.territories.map((t) => [t.id, t]));
export const ZONE = Object.fromEntries(AXIS_MAP.seaZones.map((z) => [z.id, z]));
export const isSea = (id: string) => id.startsWith('sz-');
export const spaceName = (id: string): string => TERR[id]?.name ?? (ZONE[id] ? `Sea Zone ${ZONE[id].n}` : id);

export const SPACE_CENTER: Record<string, Px> = {};
for (const t of AXIS_MAP.territories) SPACE_CENTER[t.id] = t.center as Px;
for (const z of AXIS_MAP.seaZones) SPACE_CENTER[z.id] = z.center as Px;
// The printed roundels sit better than centroids on the two long archipelagos.
SPACE_CENTER['new-guinea'] = [7500, 4050];
SPACE_CENTER['solomon-islands'] = [8290, 4230];

/** The printed mobilization chart: purchases wait here until they are placed. */
export const MOB_ZONE = { x0: 930, y0: 4160, x1: 1570, y1: 4790 };
export const MOB_ID = 'mobilization';
SPACE_CENTER[MOB_ID] = [(MOB_ZONE.x0 + MOB_ZONE.x1) / 2, (MOB_ZONE.y0 + MOB_ZONE.y1) / 2];

// ---------- colours ----------

// Sculpt colours follow the rulebook: Germany black, Soviet maroon, Japan orange, UK tan,
// Italy brown, USA green, China light green. Antiaircraft guns and factories are grey for
// everyone because they change hands. Values are linear-ish albedo tuned to read under the
// stage lighting: dark nations are lifted just enough to keep their form.
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
// sRGB values.
const PIECE_TINT: Record<string, [number, number, number]> = {
  germany: hex('#474c56'),
  ussr: hex('#6e1219'),
  japan: hex('#b85212'),
  uk: hex('#b89a64'),
  italy: hex('#6a4426'),
  usa: hex('#2c6a30'),
  china: hex('#6f9a48'),
};
const NEUTRAL_TINT: [number, number, number] = hex('#70747a');
export function pieceTint(power: string | null | undefined, unit?: string): [number, number, number] {
  if (unit === 'aaGun' || unit === 'factory') return NEUTRAL_TINT;
  return PIECE_TINT[power ?? ''] ?? NEUTRAL_TINT;
}

/** The colour a nation paints the map and the bases of its pieces. Clear, distinct hues that
 *  read on the printed board from across a room. */
const MAP_COLOR: Record<string, string> = {
  germany: '#4f5d6e',
  ussr: '#b3261e',
  japan: '#d97a0f',
  uk: '#c7a44a',
  italy: '#8a5a2c',
  usa: '#3d8a34',
  china: '#8fc468',
};
export const mapColor = (power: string | null | undefined): string => MAP_COLOR[power ?? ''] ?? '#8d9196';

/** Bright companion colour for outlines and text over the dark interface. */
const POWER_INK: Record<string, string> = {
  germany: '#c9ccd1',
  ussr: '#e2706f',
  japan: '#f0a44e',
  uk: '#e0c08a',
  italy: '#c99363',
  usa: '#6fca78',
  china: '#b9dc8c',
};
export const powerInk = (power: string | null | undefined): string => POWER_INK[power ?? ''] ?? '#c9ccd1';
export const powerName = (power: string | null | undefined): string =>
  power === 'china' ? 'China' : power && POWERS[power as PowerKey] ? POWERS[power as PowerKey].name : 'Neutral';
export const powerShort = (power: string | null | undefined): string =>
  power === 'china' ? 'CHN' : power && POWERS[power as PowerKey] ? POWERS[power as PowerKey].short : '';
export const powerBase = (power: string | null | undefined): string =>
  power === 'china' ? CHINA_COLOR : power && POWERS[power as PowerKey] ? POWERS[power as PowerKey].color : '#777';
export const sideOf = (power: string): 'axis' | 'allies' => (power === 'china' ? 'allies' : POWERS[power as PowerKey].coalition);

/** Display order of unit types inside a space and in every list. */
export const UNIT_ORDER: UnitKey[] = [
  'factory', 'aaGun', 'infantry', 'artillery', 'tank', 'fighter', 'bomber',
  'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport',
];
export const unitRank = (key: string) => {
  const i = UNIT_ORDER.indexOf(key as UnitKey);
  return i < 0 ? 99 : i;
};

// ---------- region borders (traced from the printed map) ----------

type Ring = Px[];
// Measured from the printed map by tools/axis-zones.py: every pixel of the board belongs to exactly
// one space. `holes` are the islands inside a sea zone and the like.
const REGIONS = (regionsJson as unknown as { regions: Record<string, Ring[]> }).regions;
const HOLES = (regionsJson as unknown as { holes?: Record<string, Ring[]> }).holes ?? {};

function inRing(px: number, py: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const ISLAND_BOXES = new Set<string>((regionsJson as unknown as { islands?: string[] }).islands ?? []);
/** An island territory whose region is its box of water, not only the specks of land in it. */
export const isIslandBox = (id: string) => ISLAND_BOXES.has(id);

export const ringsOf = (id: string): Ring[] | null => REGIONS[id] ?? null;
export const holesOf = (id: string): Ring[] => HOLES[id] ?? [];

export function inRegion(id: string, px: number, py: number): boolean {
  const rings = REGIONS[id];
  if (!rings) return false;
  for (const ring of rings) {
    if (!inRing(px, py, ring)) continue;
    for (const hole of HOLES[id] ?? []) if (inRing(px, py, hole)) return false;
    return true;
  }
  return false;
}

const REGION_BOX: Record<string, [number, number, number, number]> = {};
for (const [id, rings] of Object.entries(REGIONS)) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  REGION_BOX[id] = [x0, y0, x1, y1];
}
export const regionBox = (id: string) => REGION_BOX[id] ?? null;

const REGION_IDS = Object.keys(REGIONS);
const LAND_IDS = REGION_IDS.filter((id) => !isSea(id));
const SEA_IDS = REGION_IDS.filter(isSea);

/** Which space contains this art point. */
export function regionAt(px: number, py: number): string | null {
  const hit = (ids: string[]) => {
    for (const id of ids) {
      const b = REGION_BOX[id];
      if (px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3] && inRegion(id, px, py)) return id;
    }
    return null;
  };
  return hit(LAND_IDS) ?? hit(SEA_IDS);
}

/** The space whose printed anchor is nearest, for taps that land on a border. */
export function nearestSpace(px: number, py: number, maxDist = 260): string | null {
  let best: string | null = null;
  let bestD = maxDist * maxDist;
  for (const id of REGION_IDS) {
    const c = SPACE_CENTER[id];
    if (!c) continue;
    const d = (c[0] - px) ** 2 + (c[1] - py) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

/** "3 infantry", "1 tank", "2 aircraft carriers". */
export function unitCount(n: number, key: string): string {
  const name = (UNITS[key as UnitKey]?.name ?? key).toLowerCase();
  return `${n} ${name}${n === 1 || key === 'infantry' ? '' : 's'}`;
}

/** "Poland", "Poland and Ukraine", "Poland, Ukraine and Karelia". */
export function listNames(ids: string[]): string {
  const names = ids.map(spaceName);
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
