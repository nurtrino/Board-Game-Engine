// Vertex-clustering decimation. The staged models are film-grade (130k to 290k triangles each), far
// too heavy to draw thirty times on an integrated GPU. Snapping vertices to a coarse grid and
// dropping the triangles that collapse is linear time, needs no adjacency, and keeps the silhouette,
// which is all a unit seen from across a battlefield needs. No three imports: plain typed arrays.

export interface RawMesh {
  /** xyz per vertex, already in the model's final space. */
  positions: Float32Array;
  /** uv per vertex, or null. */
  uvs: Float32Array | null;
  /** Triangle list, or null for non-indexed triangles. */
  index: Uint32Array | Uint16Array | null;
}

export interface DecimatedMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array | null;
  index: Uint32Array;
  triangles: number;
}

export interface Bounds { min: [number, number, number]; max: [number, number, number] }

export function boundsOf(meshes: readonly RawMesh[]): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = p[i + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
  }
  return { min, max };
}

export const triangleCount = (m: RawMesh) => (m.index ? m.index.length : m.positions.length / 3) / 3;

/**
 * Cluster `mesh` on a grid of `cell`-sized cubes anchored at `origin`. Meshes of one model must share
 * origin and cell so that parts with different materials still meet without cracks.
 * Vertices in one cell share a position and normal; they stay separate only where their uvs are far
 * apart, so texture islands do not smear across a seam.
 */
export function decimate(mesh: RawMesh, origin: readonly [number, number, number], cell: number): DecimatedMesh {
  const { positions, uvs, index } = mesh;
  const vertexCount = positions.length / 3;
  const inv = 1 / cell;
  const SPAN = 2048; // cells per axis before keys collide; callers use far fewer

  // pass 1: vertex -> cell, and the mean position of each cell
  const cellOfVertex = new Int32Array(vertexCount);
  const cellIds = new Map<number, number>();
  const sum: number[] = [];
  const count: number[] = [];
  for (let v = 0; v < vertexCount; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const cx = Math.min(SPAN - 1, Math.max(0, Math.floor((x - origin[0]) * inv)));
    const cy = Math.min(SPAN - 1, Math.max(0, Math.floor((y - origin[1]) * inv)));
    const cz = Math.min(SPAN - 1, Math.max(0, Math.floor((z - origin[2]) * inv)));
    const key = cx + cy * SPAN + cz * SPAN * SPAN;
    let id = cellIds.get(key);
    if (id === undefined) {
      id = count.length;
      cellIds.set(key, id);
      sum.push(0, 0, 0);
      count.push(0);
    }
    cellOfVertex[v] = id;
    sum[id * 3] += x; sum[id * 3 + 1] += y; sum[id * 3 + 2] += z;
    count[id] += 1;
  }
  const cellCount = count.length;

  // pass 2: surviving triangles, face normals accumulated per cell
  const cellNormal = new Float64Array(cellCount * 3);
  const outIds = new Map<number, number>();
  const outCell: number[] = [];
  const outUvSum: number[] = [];
  const outUvN: number[] = [];
  const outIndex: number[] = [];
  const seen = new Set<string>();
  const outVertex = (v: number): number => {
    const c = cellOfVertex[v];
    let bucket = 0;
    if (uvs) {
      const bu = ((Math.floor(uvs[v * 2] * 4) % 8) + 8) % 8;
      const bv = ((Math.floor(uvs[v * 2 + 1] * 4) % 8) + 8) % 8;
      bucket = bu + bv * 8;
    }
    const key = c * 64 + bucket;
    let id = outIds.get(key);
    if (id === undefined) {
      id = outCell.length;
      outIds.set(key, id);
      outCell.push(c);
      outUvSum.push(0, 0);
      outUvN.push(0);
    }
    if (uvs) {
      outUvSum[id * 2] += uvs[v * 2];
      outUvSum[id * 2 + 1] += uvs[v * 2 + 1];
      outUvN[id] += 1;
    }
    return id;
  };
  const triCount = triangleCount(mesh);
  for (let t = 0; t < triCount; t++) {
    const a = index ? index[t * 3] : t * 3;
    const b = index ? index[t * 3 + 1] : t * 3 + 1;
    const c = index ? index[t * 3 + 2] : t * 3 + 2;
    const ca = cellOfVertex[a], cb = cellOfVertex[b], cc = cellOfVertex[c];
    if (ca === cb || cb === cc || ca === cc) continue;
    const lo = Math.min(ca, cb, cc), hi = Math.max(ca, cb, cc), mid = ca + cb + cc - lo - hi;
    const tri = `${lo},${mid},${hi}`;
    if (seen.has(tri)) continue;
    seen.add(tri);
    const ax = sum[ca * 3] / count[ca], ay = sum[ca * 3 + 1] / count[ca], az = sum[ca * 3 + 2] / count[ca];
    const bx = sum[cb * 3] / count[cb], by = sum[cb * 3 + 1] / count[cb], bz = sum[cb * 3 + 2] / count[cb];
    const cx = sum[cc * 3] / count[cc], cy = sum[cc * 3 + 1] / count[cc], cz = sum[cc * 3 + 2] / count[cc];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const cellId of [ca, cb, cc]) {
      cellNormal[cellId * 3] += nx; cellNormal[cellId * 3 + 1] += ny; cellNormal[cellId * 3 + 2] += nz;
    }
    outIndex.push(outVertex(a), outVertex(b), outVertex(c));
  }

  const n = outCell.length;
  const outPositions = new Float32Array(n * 3);
  const outNormals = new Float32Array(n * 3);
  const outUvs = uvs ? new Float32Array(n * 2) : null;
  for (let i = 0; i < n; i++) {
    const c = outCell[i];
    outPositions[i * 3] = sum[c * 3] / count[c];
    outPositions[i * 3 + 1] = sum[c * 3 + 1] / count[c];
    outPositions[i * 3 + 2] = sum[c * 3 + 2] / count[c];
    const nx = cellNormal[c * 3], ny = cellNormal[c * 3 + 1], nz = cellNormal[c * 3 + 2];
    const len = Math.hypot(nx, ny, nz) || 1;
    outNormals[i * 3] = nx / len; outNormals[i * 3 + 1] = ny / len; outNormals[i * 3 + 2] = nz / len;
    if (outUvs) {
      const k = outUvN[i] || 1;
      outUvs[i * 2] = outUvSum[i * 2] / k;
      outUvs[i * 2 + 1] = outUvSum[i * 2 + 1] / k;
    }
  }
  return { positions: outPositions, normals: outNormals, uvs: outUvs, index: Uint32Array.from(outIndex), triangles: outIndex.length / 3 };
}

/**
 * Decimate every part of a model to roughly `budget` triangles in total. Starts from a grid sized to
 * the model's surface and coarsens until the budget is met, so one call adapts to any source density.
 */
export function decimateModel(meshes: readonly RawMesh[], budget: number): { parts: DecimatedMesh[]; triangles: number; cell: number } {
  const source = meshes.reduce((n, m) => n + triangleCount(m), 0);
  const b = boundsOf(meshes);
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const longest = Math.max(size[0], size[1], size[2], 1e-6);
  if (source <= budget) {
    // Already light: weld on a very fine grid only, which keeps every triangle that matters.
    const cell = longest / 1024;
    const parts = meshes.map((m) => decimate(m, b.min, cell));
    return { parts, triangles: parts.reduce((n, p) => n + p.triangles, 0), cell };
  }
  // A closed surface crossing a grid of n cells per axis yields on the order of n^2 triangles.
  const area = 2 * (size[0] * size[1] + size[1] * size[2] + size[0] * size[2]) || longest * longest;
  let cell = Math.sqrt((area * 2.2) / budget);
  let best: { parts: DecimatedMesh[]; triangles: number; cell: number } | null = null;
  // Search the cell size in both directions: hollow or spindly models (a field gun) have far less
  // surface than their bounding box suggests, dense ones (a warship's rigging) far more.
  for (let attempt = 0; attempt < 9; attempt++) {
    const parts = meshes.map((m) => decimate(m, b.min, cell));
    const triangles = parts.reduce((n, p) => n + p.triangles, 0);
    const fits = triangles <= budget * 1.15;
    if (fits && (!best || best.triangles > budget * 1.15 || triangles > best.triangles)) best = { parts, triangles, cell };
    else if (!best || (!fits && best.triangles > budget * 1.15 && triangles < best.triangles)) best = { parts, triangles, cell };
    if (fits && triangles >= budget * 0.7) break;
    const ratio = Math.sqrt(Math.max(triangles, 1) / budget);
    cell *= fits ? Math.max(0.6, Math.min(0.92, ratio)) : Math.min(1.7, Math.max(1.08, ratio));
  }
  return best!;
}
