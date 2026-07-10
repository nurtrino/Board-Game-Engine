// Region border polygons (traced from the printed map by the border pass;
// golden at games/axis-allies/golden/regions.json). Used for region-shaped
// tap targets and for laying units out INSIDE their borders without overlap.

import regionsJson from './regions-data.json';
import { SPACE_CENTER } from './AxisScene';

type Ring = [number, number][];
const REGIONS = (regionsJson as unknown as { regions: Record<string, Ring[]> }).regions;
const ART_W = (regionsJson as unknown as { art: { width: number } }).art.width;

function inRing(px: number, py: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringsOf(id: string): Ring[] | null {
  return REGIONS[id] ?? null;
}

export function inRegion(id: string, px: number, py: number): boolean {
  const rings = REGIONS[id];
  if (!rings) return false;
  for (const dx of [0, -ART_W, ART_W]) {
    for (const ring of rings) if (inRing(px + dx, py, ring)) return true;
  }
  return false;
}

/** Which region contains this art-pixel point (territories win over zones). */
export function regionAt(px: number, py: number): string | null {
  let seaHit: string | null = null;
  for (const id of Object.keys(REGIONS)) {
    if (!inRegion(id, px, py)) continue;
    if (id.startsWith('sz-')) { seaHit = seaHit ?? id; continue; }
    return id; // islands sit inside sea zones: prefer the land
  }
  return seaHit;
}

// Non-overlapping layout points inside a region: a spiral grid around the
// anchor, filtered to the polygon, cached per (region, spacing).
const layoutCache = new Map<string, [number, number][]>();

export function layoutPoints(id: string, n: number, spacing = 130): [number, number][] {
  const cacheKey = `${id}:${spacing}`;
  let pts = layoutCache.get(cacheKey);
  if (!pts) {
    pts = [];
    const anchor = SPACE_CENTER[id];
    const rings = REGIONS[id];
    if (!anchor || !rings) {
      layoutCache.set(cacheKey, pts);
      return pts;
    }
    // ring-by-ring spiral out from the anchor, row-major within each ring so
    // stacks read as ranks
    const MAX_R = 20;
    for (let r = 0; r < MAX_R && pts.length < 160; r++) {
      for (let gy = -r; gy <= r; gy++) {
        for (let gx = -r; gx <= r; gx++) {
          if (Math.max(Math.abs(gx), Math.abs(gy)) !== r) continue; // ring shell only
          const px = anchor[0] + gx * spacing;
          const py = anchor[1] + gy * spacing + 60; // bias below the printed label
          if (inRegion(id, px, py)) pts.push([px, py]);
        }
      }
    }
    if (pts.length === 0) pts.push([anchor[0], anchor[1] + 60]); // degenerate region: anchor only
    layoutCache.set(cacheKey, pts);
  }
  return pts.slice(0, Math.max(1, n));
}
