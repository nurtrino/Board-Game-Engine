// Where pieces stand inside a space. Every unit gets its own spot while the printed borders have
// room; a crowded space collapses each unit type to one sculpt carrying a count, the way chips
// work on the physical board. Pure functions over art pixels so they can be tested without a renderer.
import { enumerateAxisPhysicalPieces, type AxisPhysicalPiece, type UnitStack } from '@bge/shared';
import { MOB_ZONE, SPACE_CENTER, inRegion, isSea, regionAt, ringsOf, unitRank, type Px } from './world';

/** Centre-to-centre distance between neighbouring pieces, in art pixels. */
export const SLOT_SPACING = 104;
const EDGE_INSET = 34;
const MAX_SLOTS = 36;
/** A space never shows more than this many separate sculpts. */
export const MAX_EACH = 28;

const slotCache = new Map<string, Px[]>();

/** Candidate standing spots inside a region, nearest the printed anchor first. */
export function regionSlots(id: string): Px[] {
  const hit = slotCache.get(id);
  if (hit) return hit;
  const anchor = SPACE_CENTER[id];
  const out: Px[] = [];
  if (anchor && ringsOf(id)) {
    const sea = isSea(id);
    const ox = anchor[0];
    const oy = anchor[1] + 46; // just under the printed name
    const inside = (x: number, y: number, inset: number) =>
      inRegion(id, x, y)
      && (inset === 0 || (inRegion(id, x - inset, y) && inRegion(id, x + inset, y) && inRegion(id, x, y - inset) && inRegion(id, x, y + inset)))
      && (!sea || regionAt(x, y) === id);
    for (const inset of [EDGE_INSET, 14, 0]) {
      const found: { p: Px; d: number }[] = [];
      for (let gy = -9; gy <= 9; gy++) {
        for (let gx = -9; gx <= 9; gx++) {
          // Offset alternate rows so ranks interlock instead of forming a rigid grid.
          const x = ox + (gx + (gy & 1 ? 0.5 : 0)) * SLOT_SPACING;
          const y = oy + gy * SLOT_SPACING * 0.86;
          if (inside(x, y, inset)) found.push({ p: [x, y], d: (x - ox) ** 2 + ((y - oy) * 1.15) ** 2 });
        }
      }
      if (found.length >= 3 || inset === 0) {
        found.sort((a, b) => a.d - b.d);
        for (const f of found.slice(0, MAX_SLOTS)) out.push(f.p);
        break;
      }
    }
    // An island too small for the grid: stand on its printed anchor.
    if (out.length === 0) out.push([anchor[0], anchor[1]]);
  } else if (anchor) {
    out.push([anchor[0], anchor[1] + 46]);
  }
  slotCache.set(id, out);
  return out;
}

export interface PieceSpot {
  /** Stable identity inside the space: power, unit and index. */
  id: string;
  space: string;
  power: string;
  key: string;
  x: number;
  y: number;
  /** The physical pieces this sculpt stands for: one in open ground, the whole group when stacked. */
  pieces: AxisPhysicalPiece[];
  stacked: boolean;
}

export interface SpaceLayout {
  space: string;
  stacked: boolean;
  spots: PieceSpot[];
}

const byReadingOrder = (a: Px, b: Px) => (Math.abs(a[1] - b[1]) > 8 ? a[1] - b[1] : a[0] - b[0]);

/** Extra spots on a tight ring around the anchor for a space with more unit types than room. */
function overflowSlots(id: string, need: number, have: Px[]): Px[] {
  const anchor = SPACE_CENTER[id] ?? [0, 0];
  const out = [...have];
  for (let ring = 1; out.length < need && ring < 6; ring++) {
    const n = ring * 6;
    for (let i = 0; i < n && out.length < need; i++) {
      const a = (i / n) * Math.PI * 2;
      const p: Px = [anchor[0] + Math.cos(a) * ring * SLOT_SPACING * 0.8, anchor[1] + 46 + Math.sin(a) * ring * SLOT_SPACING * 0.7];
      if (!out.some((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < (SLOT_SPACING * 0.7) ** 2)) out.push(p);
    }
  }
  return out;
}

export function layoutSpace(space: string, stacks: readonly UnitStack[]): SpaceLayout {
  const pieces = enumerateAxisPhysicalPieces(stacks)
    .slice()
    .sort((a, b) => unitRank(a.key) - unitRank(b.key) || a.power.localeCompare(b.power) || a.physicalOrdinal - b.physicalOrdinal);
  if (pieces.length === 0) return { space, stacked: false, spots: [] };
  const slots = regionSlots(space);

  if (pieces.length <= slots.length && pieces.length <= MAX_EACH) {
    const chosen = slots.slice(0, pieces.length).sort(byReadingOrder);
    return {
      space,
      stacked: false,
      spots: pieces.map((piece, i) => ({
        id: `${piece.power}:${piece.key}:${piece.physicalOrdinal}`,
        space, power: piece.power, key: piece.key,
        x: chosen[i][0], y: chosen[i][1],
        pieces: [piece], stacked: false,
      })),
    };
  }

  const groups = new Map<string, AxisPhysicalPiece[]>();
  for (const piece of pieces) {
    const k = `${piece.power}:${piece.key}`;
    const list = groups.get(k);
    if (list) list.push(piece);
    else groups.set(k, [piece]);
  }
  const list = [...groups.values()];
  const room = list.length <= slots.length ? slots.slice(0, list.length) : overflowSlots(space, list.length, slots);
  const chosen = room.slice(0, list.length).sort(byReadingOrder);
  return {
    space,
    stacked: true,
    spots: list.map((group, i) => ({
      id: `${group[0].power}:${group[0].key}:stack`,
      space, power: group[0].power, key: group[0].key,
      x: chosen[i][0], y: chosen[i][1],
      pieces: group, stacked: true,
    })),
  };
}

/** Spots for purchased units waiting in the printed mobilization zone. */
export function mobilizationSpots(count: number): Px[] {
  const cols = 5;
  const rows = 4;
  const stepX = (MOB_ZONE.x1 - MOB_ZONE.x0) / cols;
  const stepY = (MOB_ZONE.y1 - MOB_ZONE.y0 - 150) / rows;
  const out: Px[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(i, cols * rows - 1);
    out.push([MOB_ZONE.x0 + stepX * ((idx % cols) + 0.5), MOB_ZONE.y0 + 125 + stepY * (Math.floor(idx / cols) + 0.5)]);
  }
  return out;
}
