// Bloodborne client assets: staged sheet/tile/token/mini paths + card-art CSS
// helpers. All art is the mod's own (staged by extract-bloodborne.mjs).

import { useEffect, useState } from 'react';
import { BB_TILES, BB_HUNTERS, BB_ENEMIES, BB_BOSSES, type BbView } from '@bge/shared';

export const BB_SEAT_HEX: Record<string, string> = {
  Crimson: '#b03434',
  Cobalt: '#3a62b8',
  Verdant: '#3f8a4e',
  Amber: '#c8952f',
};

// ---------- scene manifest (sheet grids for card-art crops) ----------

export interface BbSheetMeta {
  w: number;
  h: number;
  face: { rel: string; w: number; h: number } | null;
  back: { rel: string; w: number; h: number } | null;
  unique: boolean;
}
export interface BbSceneManifest {
  sheets: Record<string, BbSheetMeta>;
  tokens: Record<string, { name: string; img: { rel: string; w: number; h: number } | null }>;
  huntBoard: { face: { rel: string } | null };
  minis?: { manifest: string; models: number; standees: number };
}

let manifestCache: BbSceneManifest | null = null;
export function useBbManifest(): BbSceneManifest | null {
  const [m, setM] = useState<BbSceneManifest | null>(manifestCache);
  useEffect(() => {
    if (manifestCache) return;
    fetch('/bloodborne/scene.json')
      .then((r) => r.json())
      .then((j) => {
        manifestCache = j as BbSceneManifest;
        setM(manifestCache);
      })
      .catch(() => setM(null));
  }, []);
  return m;
}

/** CSS for one card cell out of a staged sheet (background crop). */
export function bbCellCss(m: BbSceneManifest | null, sheet: string, cell: number, back = false): React.CSSProperties {
  const s = m?.sheets[sheet];
  const img = back ? s?.back : s?.face;
  if (!s || !img) return { background: '#151517' };
  const col = cell % s.w;
  const row = Math.floor(cell / s.w);
  return {
    backgroundImage: `url(${img.rel})`,
    backgroundSize: `${s.w * 100}% ${s.h * 100}%`,
    backgroundPosition: `${s.w === 1 ? 0 : (col / (s.w - 1)) * 100}% ${s.h === 1 ? 0 : (row / (s.h - 1)) * 100}%`,
  };
}

// ---------- piece art ----------

export const bbTileArt = (tileId: string): string => BB_TILES[tileId]?.art ?? '';
export const bbTokenArt = (id: string): string => `/bloodborne/tokens/${id}.webp`;
/** Complete multipart miniature, Meshopt-compressed and lazy-loaded by the scene. */
export const bbMiniGlb = (slug: string): string => `/bloodborne/minis/${slug}.glb`;
export const bbMiniStandee = (slug: string): string => `/bloodborne/minis/${slug}-standee.webp`;

export const bbHunterMini = (hunterId: string | null): string | null =>
  hunterId ? ((BB_HUNTERS[hunterId]?.art as { mini?: string | null })?.mini ?? null) : null;
/** The golden pass missed core enemies because their models sit in a second
 * nested bag. Every runtime enemy except the source-mod Iosefka standee now
 * has a verified GLB under its data id. */
export const bbEnemyMini = (type: string): string | null =>
  BB_ENEMIES[type]?.mini ?? (type === 'iosefka' ? null : type);
export const bbEnemyStandee = (type: string): string | null =>
  type === 'iosefka' ? bbMiniStandee(type) : null;
/** Witch, Annalise, and Gehrman were omitted by the same shallow bag walk. */
export const bbBossMini = (type: string): string | null => BB_BOSSES[type]?.mini ?? type;

// ---------- names ----------

export const bbHunterName = (id: string | null): string => (id ? BB_HUNTERS[id]?.name ?? id : 'HUNTER');
export const bbEnemyName = (type: string): string => BB_ENEMIES[type]?.name ?? type;
export const bbBossName = (type: string): string => BB_BOSSES[type]?.name ?? type;

/** replace inline icon tokens with readable glyphs for HUD text */
export const bbIconText = (t: string | null | undefined): string =>
  (t ?? '')
    .replace(/\{dmg\}/g, '♦')
    .replace(/\{fast\}/g, '›››')
    .replace(/\{medium\}/g, '››')
    .replace(/\{slow\}/g, '›')
    .replace(/\{speed\}|\{arrow\}/g, '›+')
    .replace(/\{n\}/g, 'HUNTERS')
    .replace(/\{reset\}/g, 'RESET')
    .replace(/\{lamp\}/g, 'LAMP')
    .replace(/\{consumable\}/g, 'CONSUMABLE')
    .replace(/\{insight\}/g, 'INSIGHT')
    .replace(/\{poison\}/g, 'POISON')
    .replace(/\{frenzy\}/g, 'FRENZY')
    .replace(/\{enemy([123?])\}/g, 'ENEMY $1');

// ---------- geometry shared by TV scene + device map ----------

export const BB_TILE_W = 10; // world units per tile; tiles abut exactly

export type BbEdgeT = 'N' | 'E' | 'S' | 'W';
const EDGES: BbEdgeT[] = ['N', 'E', 'S', 'W'];
export const bbRotEdge = (e: BbEdgeT, rot: number): BbEdgeT => EDGES[(EDGES.indexOf(e) + rot) % 4];
export const bbFacing = (e: BbEdgeT): BbEdgeT => EDGES[(EDGES.indexOf(e) + 2) % 4];
export const bbEdgeDelta = (e: BbEdgeT): [number, number] => (e === 'N' ? [0, -1] : e === 'S' ? [0, 1] : e === 'E' ? [1, 0] : [-1, 0]);

/** rotate a local offset (art frame) clockwise by rot quarter-turns */
export const bbRotXZ = (lx: number, lz: number, rot: number): [number, number] => {
  let x = lx, z = lz;
  for (let i = 0; i < (rot % 4 + 4) % 4; i++) [x, z] = [-z, x];
  return [x, z];
};

/** world position of a space on a placed tile (x = east, z = south) */
export function bbSpaceWorld(view: BbView, ref: string): [number, number] | null {
  const i = ref.indexOf(':');
  const uid = +ref.slice(0, i);
  const spaceId = ref.slice(i + 1);
  const t = view.tiles.find((x) => x.uid === uid);
  if (!t) return null;
  const def = BB_TILES[t.tileId];
  const sp = def?.spaces.find((x) => x.id === spaceId);
  if (!sp) return null;
  const [lx, lz] = bbRotXZ((sp.center.x - 0.5) * BB_TILE_W, (sp.center.y - 0.5) * BB_TILE_W, t.rot);
  return [t.x * BB_TILE_W + lx, t.y * BB_TILE_W + lz];
}

/** device-map helpers: all spaces of a placed tile in world coords */
export function bbTileSpacesWorld(view: BbView, uid: number): { ref: string; x: number; z: number; icons: string[]; named: string | null }[] {
  const t = view.tiles.find((x) => x.uid === uid);
  if (!t) return [];
  const def = BB_TILES[t.tileId];
  return (def?.spaces ?? []).map((sp) => {
    const [lx, lz] = bbRotXZ((sp.center.x - 0.5) * BB_TILE_W, (sp.center.y - 0.5) * BB_TILE_W, t.rot);
    return { ref: `${uid}:${sp.id}`, x: t.x * BB_TILE_W + lx, z: t.y * BB_TILE_W + lz, icons: sp.icons, named: sp.named };
  });
}

/** open (unconnected) exits for reveal affordances */
export function bbOpenExits(view: BbView): { uid: number; space: string; edge: BbEdgeT; x: number; z: number }[] {
  const out: { uid: number; space: string; edge: BbEdgeT; x: number; z: number }[] = [];
  for (const t of view.tiles) {
    if (view.fogGates.includes(t.uid)) continue;
    const def = BB_TILES[t.tileId];
    for (const ex of def?.exits ?? []) {
      const worldEdge = bbRotEdge(ex.edge as BbEdgeT, t.rot);
      const [dx, dy] = bbEdgeDelta(worldEdge);
      if (view.tiles.some((o) => o.x === t.x + dx && o.y === t.y + dy)) continue;
      if (view.tileDeckCount <= 0) continue;
      const sp = def.spaces.find((s) => s.id === ex.space);
      if (!sp) continue;
      const [lx, lz] = bbRotXZ((sp.center.x - 0.5) * BB_TILE_W, (sp.center.y - 0.5) * BB_TILE_W, t.rot);
      out.push({
        uid: t.uid, space: ex.space, edge: worldEdge,
        x: t.x * BB_TILE_W + lx + dx * BB_TILE_W * 0.38,
        z: t.y * BB_TILE_W + lz + dy * BB_TILE_W * 0.38,
      });
    }
  }
  return out;
}

/** hunter-legal neighbours of a space (mirror of engine spaceNeighbors) */
export function bbNeighbors(view: BbView, ref: string): string[] {
  const i = ref.indexOf(':');
  const uid = +ref.slice(0, i);
  const space = ref.slice(i + 1);
  const t = view.tiles.find((x) => x.uid === uid);
  if (!t) return [];
  const def = BB_TILES[t.tileId];
  const out: string[] = [];
  for (const [a, b] of def?.adjacency ?? []) {
    if (a === space) out.push(`${uid}:${b}`);
    else if (b === space) out.push(`${uid}:${a}`);
  }
  for (const ex of def?.exits ?? []) {
    if (ex.space !== space) continue;
    const worldEdge = bbRotEdge(ex.edge as BbEdgeT, t.rot);
    const [dx, dy] = bbEdgeDelta(worldEdge);
    const nb = view.tiles.find((o) => o.x === t.x + dx && o.y === t.y + dy);
    if (!nb) continue;
    const nbDef = BB_TILES[nb.tileId];
    const match = (nbDef?.exits ?? []).find((e2) => bbRotEdge(e2.edge as BbEdgeT, nb.rot) === bbFacing(worldEdge));
    if (!match) continue;
    if (view.fogGates.includes(uid)) continue; // may not leave a fogged tile
    out.push(`${nb.uid}:${match.space}`);
  }
  return out;
}
