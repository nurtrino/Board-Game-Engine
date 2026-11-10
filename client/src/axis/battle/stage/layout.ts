// Where everything stands. Pure and deterministic: the same battle always draws the same field.
// World units are metres-ish. +x is the defender's side, -x the attacker's; the armies face each
// other across x = 0 and their frontage runs along z. y is up; open water sits at y = 0.
import { AXIS_INDEX } from '@bge/shared';
import { orderOf, unitDomain, type BattleUnit, type Side } from '../model';
import type { Terrain } from '../timeline';

// ---------- climate ----------

export type Climate = 'temperate' | 'desert' | 'snow' | 'jungle';

const SNOW = new Set(['alaska', 'greenland', 'iceland', 'norway', 'sweden', 'finland', 'karelia', 'archangel', 'urals',
  'evenki-national-okrug', 'yakut', 'stanovoj-chrebet', 'buryatia', 'soviet-far-east', 'novosibirsk']);
const DESERT = new Set(['morocco-algeria', 'libya', 'egypt', 'sahara', 'anglo-egypt-sudan', 'trans-jordan', 'saudi-arabia',
  'persia', 'afganistan', 'french-west-africa', 'italian-africa', 'kazakh', 'mongolia', 'australia']);
const JUNGLE = new Set(['burma', 'french-indo-china-thailand', 'kwangtung', 'fukien', 'yunnan', 'india', 'philippine-islands',
  'borneo', 'east-indies', 'new-guinea', 'solomon-islands', 'caroline-islands', 'okinawa', 'iwo-jima', 'formosa',
  'hawaiian-islands', 'midway', 'wake-island', 'west-indies', 'panama', 'brazil', 'northern-south-america',
  'french-equatorial-africa', 'belgian-congo', 'french-madagascar', 'new-zealand']);

/** Fraction of the way down the printed map (0 = top edge, 1 = bottom edge). */
function latitudeOf(space: string): number {
  const height = AXIS_INDEX.map.art?.height ?? 4956;
  const def = AXIS_INDEX.space[space];
  return def ? Math.min(1, Math.max(0, def.center[1] / height)) : 0.4;
}

export function climateOf(space: string): Climate {
  if (SNOW.has(space)) return 'snow';
  if (DESERT.has(space)) return 'desert';
  if (JUNGLE.has(space)) return 'jungle';
  const t = AXIS_INDEX.territory[space];
  const lat = latitudeOf(space);
  if (!t) return lat < 0.2 ? 'snow' : lat > 0.5 && lat < 0.85 ? 'jungle' : 'temperate';
  if (lat < 0.12) return 'snow';
  if (t.isIsland && lat > 0.42 && lat < 0.86) return 'jungle';
  return 'temperate';
}

// ---------- ground ----------

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const fbm = (x: number, z: number, seed: number) =>
  valueNoise(x, z, seed) * 0.6 + valueNoise(x * 2.1, z * 2.1, seed + 7) * 0.28 + valueNoise(x * 4.3, z * 4.3, seed + 13) * 0.12;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The shoreline of an amphibious battle: ground is dry for x above this, sea below. */
export const SHORE_X = -47;
export const GROUND_SIZE = 520;

/**
 * Ground height. The middle, where the lines stand, is gently uneven; hills rise toward the edges
 * so the horizon is never a flat line. On a shore the attacker's side falls away under the sea.
 */
export function heightAt(x: number, z: number, terrain: Terrain, seed = 1): number {
  if (terrain === 'sea') return -30;
  const n = fbm(x * 0.017 + 31, z * 0.017 + 17, seed);
  const fine = valueNoise(x * 0.09, z * 0.09, seed + 3);
  const d = Math.max(Math.abs(x) / 78, Math.abs(z) / 58);
  const rim = smoothstep(0.8, 2.4, d);
  let h = 0.9 + (n - 0.5) * 1.5 + (fine - 0.5) * 0.35 + rim * (5 + n * 22);
  if (terrain === 'shore') {
    const wet = smoothstep(SHORE_X + 13, SHORE_X - 16, x);
    h = h * (1 - wet) + (-7 - (n - 0.5) * 2) * wet;
    // keep the dunes on the seaward flanks low so the fleet is visible
    if (x < SHORE_X) h = Math.min(h, -0.2 - (SHORE_X - x) * 0.25);
  }
  return h;
}

// ---------- formations ----------

export interface UnitDims {
  /** Largest dimension of the drawn model. */
  size: number;
  /** Spacing along the frontage. */
  file: number;
  /** Spacing between ranks. */
  rank: number;
  /** Most figures drawn for one group; the rest are carried by the count label. */
  cap: number;
}

export const DIMS: Record<string, UnitDims> = {
  infantry: { size: 3.3, file: 3.7, rank: 4.2, cap: 30 },
  artillery: { size: 6, file: 7, rank: 8, cap: 10 },
  tank: { size: 8, file: 6.4, rank: 10.5, cap: 12 },
  aaGun: { size: 5, file: 7, rank: 7, cap: 3 },
  factory: { size: 20, file: 24, rank: 20, cap: 1 },
  fighter: { size: 8, file: 12, rank: 12, cap: 8 },
  bomber: { size: 14, file: 18, rank: 16, cap: 6 },
  destroyer: { size: 24, file: 15, rank: 30, cap: 6 },
  cruiser: { size: 30, file: 17, rank: 36, cap: 5 },
  battleship: { size: 38, file: 20, rank: 44, cap: 5 },
  carrier: { size: 42, file: 22, rank: 48, cap: 4 },
  submarine: { size: 18, file: 13, rank: 24, cap: 6 },
  transport: { size: 28, file: 17, rank: 34, cap: 5 },
};
const dimsOf = (key: string): UnitDims => DIMS[key] ?? DIMS.infantry;

export interface Figure {
  id: string;
  groupId: string;
  key: string;
  side: Side;
  power: string;
  x: number;
  z: number;
  yaw: number;
  air: boolean;
  /** A ship standing off a land battle: it bombards but is never hit. */
  offshore: boolean;
}

export interface GroupLayout {
  id: string;
  key: string;
  side: Side;
  power: string;
  uids: number[];
  figures: Figure[];
  /** Where the count label hangs, on the ground plane. */
  anchor: { x: number; z: number };
}

export interface FieldLayout {
  terrain: Terrain;
  groups: GroupLayout[];
  /** Half extents of everything standing on the ground or water, for the camera. */
  extentX: number;
  extentZ: number;
}

const LAND_RANK = ['infantry', 'tank', 'artillery', 'aaGun', 'factory'];
const SEA_RANK = ['destroyer', 'submarine', 'cruiser', 'battleship', 'carrier', 'transport'];
const rankIndex = (key: string, order: string[]) => {
  const i = order.indexOf(key);
  return i < 0 ? order.length + orderOf(key) : i;
};

/** Total figures a side may draw. Keeps sixty-unit battles inside the frame and the frame rate. */
export const SIDE_FIGURE_BUDGET = 40;

export function groupId(side: Side, key: string, power: string): string {
  return `${side}:${key}:${power}`;
}

interface Bucket { id: string; key: string; side: Side; power: string; uids: number[]; shown: number }

function bucketsFor(units: readonly BattleUnit[], side: Side): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const u of units) {
    if (u.side !== side) continue;
    const id = groupId(side, u.key, u.power);
    const b = map.get(id) ?? { id, key: u.key, side, power: u.power, uids: [], shown: 0 };
    b.uids.push(u.uid);
    map.set(id, b);
  }
  const list = [...map.values()];
  for (const b of list) b.shown = Math.min(b.uids.length, dimsOf(b.key).cap);
  // Over budget: shave the largest groups first, never below one figure.
  let total = list.reduce((n, b) => n + b.shown, 0);
  while (total > SIDE_FIGURE_BUDGET) {
    const big = list.reduce((a, b) => (b.shown > a.shown ? b : a), list[0]);
    if (big.shown <= 1) break;
    big.shown -= 1;
    total -= 1;
  }
  return list;
}

const jitter = (id: string, salt: number): number => {
  let h = salt * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (((h >>> 0) % 2001) / 1000) - 1;
};

/**
 * Draw up both sides. Ground units stand in ranks by type with the infantry in front; ships form a
 * battle line; aircraft get a holding point over their own lines that the stage flies them around.
 * Units that existed at the start keep their place for the whole battle, so pass every unit, dead
 * or alive, and the layout stays stable from snapshot to snapshot.
 */
export function layoutField(units: readonly BattleUnit[], terrain: Terrain): FieldLayout {
  const sea = terrain === 'sea';
  const groups: GroupLayout[] = [];
  let extentX = 30, extentZ = 24;

  for (const side of ['attacker', 'defender'] as Side[]) {
    const s = side === 'attacker' ? -1 : 1;
    const facing = side === 'attacker' ? Math.PI / 2 : -Math.PI / 2;
    const buckets = bucketsFor(units, side);
    const ground = buckets.filter((b) => {
      const d = unitDomain(b.key);
      return sea ? d === 'sea' : d === 'land' || d === 'structure';
    }).sort((a, b) => rankIndex(a.key, sea ? SEA_RANK : LAND_RANK) - rankIndex(b.key, sea ? SEA_RANK : LAND_RANK) || a.power.localeCompare(b.power));
    const offshore = sea ? [] : buckets.filter((b) => unitDomain(b.key) === 'sea');
    const air = buckets.filter((b) => unitDomain(b.key) === 'air');

    // a landing spreads along the beach: there is no depth to stack ranks in
    const frontage = sea ? 104 : terrain === 'shore' && side === 'attacker' ? 84 : 62;
    let cursor = sea ? 21 : 10.5;
    // On a beach the attackers are squeezed between the surf and the defenders.
    const depthLimit = terrain === 'shore' && side === 'attacker' ? Math.abs(SHORE_X) - 6 : Infinity;

    // A fleet sails as one body: every hull in a few close lines abreast, escorts in front and
    // the capital ships and transports behind, instead of one long column per type.
    if (sea) {
      const perRow = 4, file = 27, rank = 46;
      const total = ground.reduce((n, b) => n + b.shown, 0);
      let n = 0;
      for (const b of ground) {
        const dims = dimsOf(b.key);
        const figures: Figure[] = [];
        let ax = 0;
        for (let i = 0; i < b.shown; i++, n++) {
          const row = Math.floor(n / perRow);
          const col = n % perRow;
          const inRow = Math.min(perRow, total - row * perRow);
          const id = `${b.id}#${i}`;
          const x = s * (26 + row * rank + jitter(id, 1) * 1.6);
          const z = (col - (inRow - 1) / 2) * file + (row % 2 ? file * 0.3 : 0) + jitter(id, 2) * 1.6;
          figures.push({ id, groupId: b.id, key: b.key, side, power: b.power, x, z, yaw: facing + s * -0.42 + jitter(id, 3) * 0.06, air: false, offshore: false });
          extentX = Math.max(extentX, Math.abs(x) + dims.size * 0.55);
          extentZ = Math.max(extentZ, Math.abs(z) + dims.size * 0.4);
          ax += x;
        }
        groups.push({ id: b.id, key: b.key, side, power: b.power, uids: b.uids, figures, anchor: { x: figures.length ? ax / figures.length : s * 26, z: 0 } });
      }
    }

    for (const b of sea ? [] : ground) {
      const dims = dimsOf(b.key);
      let file = dims.file;
      let rank = dims.rank;
      let cols = Math.max(1, Math.min(b.shown, Math.floor(frontage / file)));
      let rows = Math.ceil(b.shown / cols);
      if (cursor + rows * rank > depthLimit) {
        // close the ranks up rather than march into the sea
        rank = Math.max(dims.size * 0.75, (depthLimit - cursor) / rows);
        file = Math.max(dims.size * 0.9, file * 0.9);
        cols = Math.max(1, Math.min(b.shown, Math.floor(frontage / file)));
        rows = Math.ceil(b.shown / cols);
      }
      const figures: Figure[] = [];
      for (let i = 0; i < b.shown; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const inRow = Math.min(cols, b.shown - row * cols);
        const id = `${b.id}#${i}`;
        const loose = sea ? 1.6 : b.key === 'infantry' ? 0.45 : 0.7;
        const x = s * (cursor + row * rank + dims.size * 0.5 + jitter(id, 1) * loose);
        const z = (col - (inRow - 1) / 2) * file + (row % 2 ? file * 0.28 : 0) + jitter(id, 2) * loose;
        const yaw = facing + (sea ? s * -0.42 + jitter(id, 3) * 0.06 : jitter(id, 3) * 0.07);
        figures.push({ id, groupId: b.id, key: b.key, side, power: b.power, x, z, yaw, air: false, offshore: false });
        extentX = Math.max(extentX, Math.abs(x) + dims.size * 0.6);
        extentZ = Math.max(extentZ, Math.abs(z) + dims.size * 0.6);
      }
      const depth = rows * rank;
      groups.push({
        id: b.id, key: b.key, side, power: b.power, uids: b.uids, figures,
        anchor: { x: s * (cursor + depth * 0.5), z: 0 },
      });
      cursor += depth + (sea ? 4 : 2.2);
    }

    // Bombarding ships ride at anchor beyond the surf. Only a shore has water to put them in.
    offshore.forEach((b, gi) => {
      const dims = dimsOf(b.key);
      const figures: Figure[] = [];
      const shown = terrain === 'shore' && side === 'attacker' ? Math.min(b.shown, 4) : 0;
      for (let i = 0; i < shown; i++) {
        const id = `${b.id}#${i}`;
        const x = SHORE_X - 34 - gi * 20 - (i % 2) * 14;
        const z = (i - (shown - 1) / 2) * 30 + (gi % 2 ? 15 : 0);
        figures.push({ id, groupId: b.id, key: b.key, side, power: b.power, x, z, yaw: facing - 0.5, air: false, offshore: true });
        extentX = Math.max(extentX, Math.abs(x) + dims.size * 0.4);
      }
      groups.push({ id: b.id, key: b.key, side, power: b.power, uids: b.uids, figures, anchor: { x: SHORE_X - 34 - gi * 20, z: 0 } });
    });

    // Aircraft hold over their own lines.
    let slot = 0;
    const airTotal = air.reduce((n, b) => n + b.shown, 0);
    for (const b of air.sort((x, y) => orderOf(x.key) - orderOf(y.key))) {
      const figures: Figure[] = [];
      for (let i = 0; i < b.shown; i++) {
        const id = `${b.id}#${i}`;
        const t = airTotal > 1 ? slot / (airTotal - 1) - 0.5 : 0;
        figures.push({
          id, groupId: b.id, key: b.key, side, power: b.power,
          x: s * (sea ? 46 : 30), z: t * (sea ? 70 : 44), yaw: facing, air: true, offshore: false,
        });
        slot += 1;
      }
      groups.push({ id: b.id, key: b.key, side, power: b.power, uids: b.uids, figures, anchor: { x: s * (sea ? 46 : 30), z: 0 } });
    }
  }
  return { terrain, groups, extentX, extentZ };
}

// ---------- scenery ----------

export interface Scatter { kind: 'tree1' | 'tree2' | 'bush'; x: number; z: number; scale: number; yaw: number }

const FOLIAGE: Record<Climate, { trees: number; bushes: number }> = {
  temperate: { trees: 26, bushes: 60 },
  jungle: { trees: 34, bushes: 80 },
  snow: { trees: 16, bushes: 8 },
  desert: { trees: 0, bushes: 16 },
};

/** Trees ring the field and thicken toward the hills; nothing grows where the armies stand or under water. */
export function scatterFoliage(climate: Climate, terrain: Terrain, extentX: number, extentZ: number, seed = 1): Scatter[] {
  if (terrain === 'sea') return [];
  const want = FOLIAGE[climate];
  const out: Scatter[] = [];
  const clearX = extentX + 7;
  const clearZ = Math.max(extentZ + 6, 34);
  const place = (kind: Scatter['kind'], n: number, reach: number, salt: number) => {
    let placed = 0;
    for (let attempt = 0; placed < n && attempt < n * 30; attempt++) {
      const x = (hash2(attempt, salt, seed) * 2 - 1) * reach * 1.25;
      const z = (hash2(attempt, salt + 101, seed) * 2 - 1) * reach;
      if (Math.abs(x) < clearX && Math.abs(z) < clearZ) continue;
      // never between the camera and the field: the camera lives on +z
      if (z > clearZ * 0.6 && Math.abs(x) < clearX + 30 && kind !== 'bush') continue;
      if (heightAt(x, z, terrain, seed) < 0.6) continue;
      const scale = (kind === 'bush' ? 1.5 : 9) * (0.75 + hash2(attempt, salt + 211, seed) * 0.6);
      out.push({ kind, x, z, scale, yaw: hash2(attempt, salt + 307, seed) * Math.PI * 2 });
      placed += 1;
    }
  };
  place('tree1', Math.ceil(want.trees / 2), 150, 11);
  place('tree2', Math.floor(want.trees / 2), 150, 23);
  place('bush', want.bushes, 120, 37);
  return out;
}
