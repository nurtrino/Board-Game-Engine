// Stages the Axis & Allies Anniversary unit sculpts for the web client.
// Source: client/public/axis/axis-manifest.json units[] + the raw TTS OBJ meshes beside it.
// Output: client/public/axis/units/<name>.glb (one per distinct mesh) + units.json.
//
// Each model is a single mesh / single primitive with POSITION + NORMAL only:
//   - OBJ line/point records dropped, source normals/UVs/materials ignored
//   - vertices welded, degenerate and duplicate triangles removed
//   - simplified with meshoptimizer towards TARGET_TRIS, never past MAX_ERROR (relative)
//   - smooth normals recomputed with a crease angle so hard edges stay crisp
//   - manifest scale baked in (1 model unit = 1 board unit), footprint centred on the
//     origin in X/Z, lowest point at y = 0, long horizontal axis on +X
//   - GLB with EXT_meshopt_compression. Positions stay float32 in board units (mantissa
//     rounded to POSITION_BITS so they compress), so the geometry needs no node transform;
//     normals are octahedral-filtered to 8 bit normalized ints.
//
// Re-runnable and deterministic: node tools/stage-axis-units.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Logger, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'client/public');
const manifestPath = path.join(pub, 'axis/axis-manifest.json');
const outDir = path.join(pub, 'axis/units');

const BUDGET_TRIS = 8000; // meshes at or under this are left alone
const TARGET_TRIS = 6000; // simplification target for meshes over the budget
const MAX_ERROR = 0.01; // meshoptimizer relative error bound (fraction of mesh extent)
const SIZE_TOLERANCE = 0.01; // output bounds must match the welded source within this
const CREASE_DEG = 40;
const BROADSIDE_RATIO = 1.4; // rotate 90 degrees about Y when the Z span exceeds this times X
const WELD_EPS = 1e-5; // weld grid, as a fraction of the bounding diagonal
const POSITION_BITS = 16; // float32 mantissa bits kept on positions (of 24)

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);

// ---------------------------------------------------------------- OBJ -> triangles

/** Reads positions and faces only. Lines (l), points (p), normals, UVs and materials are dropped. */
function parseObj(text) {
  const pos = [];
  const tris = [];
  let lines = 0;
  let points = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    let e = text.indexOf('\n', i);
    if (e < 0) e = n;
    const c0 = text.charCodeAt(i);
    const c1 = text.charCodeAt(i + 1);
    if (c0 === 118 /* v */ && (c1 === 32 || c1 === 9)) {
      const p = text.slice(i + 2, e).trim().split(/\s+/);
      pos.push(+p[0], +p[1], +p[2]);
    } else if (c0 === 102 /* f */ && (c1 === 32 || c1 === 9)) {
      const p = text.slice(i + 2, e).trim().split(/\s+/);
      const count = pos.length / 3;
      const idx = [];
      for (const tok of p) {
        if (!tok) continue;
        const v = parseInt(tok, 10); // "v", "v/vt", "v//vn", "v/vt/vn"
        idx.push(v < 0 ? count + v : v - 1);
      }
      for (let k = 1; k + 1 < idx.length; k++) tris.push(idx[0], idx[k], idx[k + 1]); // fan
    } else if (c0 === 108 /* l */ && (c1 === 32 || c1 === 9)) lines++;
    else if (c0 === 112 /* p */ && (c1 === 32 || c1 === 9)) points++;
    i = e + 1;
  }
  return { pos: Float64Array.from(pos), tris: Uint32Array.from(tris), lines, points };
}

/** Bounds of the vertices the triangles actually reference. */
function bounds(pos, tris) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < tris.length; t++) {
    const o = tris[t] * 3;
    for (let a = 0; a < 3; a++) {
      const v = pos[o + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Welds coincident vertices, drops unreferenced ones, degenerate and duplicate triangles. */
function weld(pos, tris) {
  for (let t = 0; t < tris.length; t++) {
    if (!(tris[t] * 3 + 2 < pos.length)) throw new Error('face references a missing vertex');
  }
  const b = bounds(pos, tris);
  const eps = Math.hypot(...b.size) * WELD_EPS || 1e-9;
  const map = new Map();
  const remap = new Int32Array(pos.length / 3).fill(-1);
  const outPos = [];
  const outTris = [];
  const seen = new Set();
  let degenerate = 0;
  let duplicate = 0;
  const vid = (v) => {
    if (remap[v] >= 0) return remap[v];
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const key = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = outPos.length / 3;
      outPos.push(x, y, z);
      map.set(key, id);
    }
    remap[v] = id;
    return id;
  };
  for (let t = 0; t < tris.length; t += 3) {
    const a = vid(tris[t]);
    const b2 = vid(tris[t + 1]);
    const c = vid(tris[t + 2]);
    if (a === b2 || b2 === c || a === c) {
      degenerate++;
      continue;
    }
    // Same triangle with the same winding (any rotation) is a duplicate.
    const m = Math.min(a, b2, c);
    const key = m === a ? `${a},${b2},${c}` : m === b2 ? `${b2},${c},${a}` : `${c},${a},${b2}`;
    if (seen.has(key)) {
      duplicate++;
      continue;
    }
    seen.add(key);
    outTris.push(a, b2, c);
  }
  return { pos: Float64Array.from(outPos), tris: Uint32Array.from(outTris), degenerate, duplicate };
}

/** Drops vertices no triangle uses, keeping first-use order. */
function compact(pos, tris) {
  const remap = new Int32Array(pos.length / 3).fill(-1);
  const outPos = [];
  const outTris = new Uint32Array(tris.length);
  for (let t = 0; t < tris.length; t++) {
    const v = tris[t];
    if (remap[v] < 0) {
      remap[v] = outPos.length / 3;
      outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    }
    outTris[t] = remap[v];
  }
  return { pos: Float64Array.from(outPos), tris: outTris };
}

// ---------------------------------------------------------------- frame

/** Scale, broadside rotation, centre the footprint, sit on y = 0. Returns whether it rotated. */
function normaliseFrame(pos, tris, scale) {
  for (let i = 0; i < pos.length; i++) pos[i] *= scale;
  let b = bounds(pos, tris);
  const rotated = b.size[2] > BROADSIDE_RATIO * b.size[0];
  if (rotated) {
    // +90 degrees about Y: (x, y, z) -> (z, y, -x). A proper rotation, so winding is kept.
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      pos[i] = pos[i + 2];
      pos[i + 2] = -x;
    }
    b = bounds(pos, tris);
  }
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= cx;
    pos[i + 1] -= b.min[1];
    pos[i + 2] -= cz;
  }
  return rotated;
}

/** Re-seats a mesh after simplification so the footprint is centred and y-min is exactly 0. */
function reseat(pos, tris) {
  const b = bounds(pos, tris);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= cx;
    pos[i + 1] -= b.min[1];
    pos[i + 2] -= cz;
  }
}

// ---------------------------------------------------------------- simplify

function sizeDrift(a, b) {
  let worst = 0;
  for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(a[k] - b[k]) / Math.max(b[k], 1e-12));
  return worst;
}

/**
 * Simplifies towards TARGET_TRIS inside the MAX_ERROR bound, then audits the result against the
 * source instead of trusting the simplifier's own error figure (which under-reports thin parts
 * that collapse away entirely: masts, barrels, struts).
 *
 * A result is accepted when no source vertex is further than MAX_ERROR of the extent from the
 * simplified surface and the bounding size is within SIZE_TOLERANCE. Otherwise the source
 * vertices that were left stranded, plus their neighbours, are locked so that part survives
 * verbatim, and it runs again. If locking stops helping, the error bound is halved.
 */
function simplify(pos, tris) {
  const srcTris = tris.length / 3;
  const src = bounds(pos, tris);
  if (srcTris <= BUDGET_TRIS) return { pos, tris, error: 0, locked: 0, rounds: 0, note: 'under budget, untouched' };
  const vCount = pos.length / 3;
  const extent = Math.max(...src.size);
  const limit = MAX_ERROR * extent;
  const f32 = Float32Array.from(pos);
  const lock = new Uint8Array(vCount);
  const noAttributes = new Float32Array(0);
  let bound = MAX_ERROR;
  let locked = 0;
  let halvings = 0;
  for (let round = 1; round <= 16; round++) {
    const [out, error] = MeshoptSimplifier.simplifyWithAttributes(tris, f32, 3, noAttributes, 0, [], lock, TARGET_TRIS * 3, bound);
    const dev = deviations(pos, pos, out);
    const ob = bounds(pos, out);
    let maxDev = 0;
    for (let v = 0; v < vCount; v++) if (dev[v] > maxDev) maxDev = dev[v];
    if (maxDev <= limit * 0.95 && sizeDrift(ob.size, src.size) <= SIZE_TOLERANCE * 0.9) {
      const outTris = out.length / 3;
      const notes = [];
      if (locked) notes.push(`${locked} vertices locked (${round - 1} audit retries) to keep thin parts`);
      if (halvings) notes.push(`error bound tightened to ${bound}`);
      if (outTris > TARGET_TRIS * 1.02) notes.push(`stopped early at ${outTris} tris (target ${TARGET_TRIS})`);
      const c = compact(pos, Uint32Array.from(out));
      return { ...c, error, locked, rounds: round, note: notes.join('; ') };
    }
    // Stranded: far from the simplified surface, or outside its bounding box.
    const stranded = new Uint8Array(vCount);
    for (let v = 0; v < vCount; v++) {
      if (dev[v] > limit * 0.3) stranded[v] = 1;
      for (let k = 0; k < 3; k++) {
        const slack = SIZE_TOLERANCE * 0.25 * src.size[k];
        if (pos[v * 3 + k] < ob.min[k] - slack || pos[v * 3 + k] > ob.max[k] + slack) stranded[v] = 1;
      }
    }
    // Lock them with their one-ring, so every triangle touching a stranded vertex is kept.
    let added = 0;
    for (let t = 0; t < tris.length; t += 3) {
      if (!stranded[tris[t]] && !stranded[tris[t + 1]] && !stranded[tris[t + 2]]) continue;
      for (let k = 0; k < 3; k++) {
        if (!lock[tris[t + k]]) {
          lock[tris[t + k]] = 1;
          added++;
        }
      }
    }
    locked += added;
    if (!added) {
      bound /= 2;
      halvings++;
    }
  }
  return { pos, tris, error: 0, locked: 0, rounds: 16, note: 'no simplification passed the audit; welded source kept' };
}

// ---------------------------------------------------------------- deviation audit

function pointTriDist2(px, py, pz, P, a, b, c) {
  // Closest point on a triangle (Ericson, Real-Time Collision Detection 5.1.5).
  const ax = P[a], ay = P[a + 1], az = P[a + 2];
  const abx = P[b] - ax, aby = P[b + 1] - ay, abz = P[b + 2] - az;
  const acx = P[c] - ax, acy = P[c + 1] - ay, acz = P[c + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) [qx, qy, qz] = [ax, ay, az];
  else {
    const bpx = px - P[b], bpy = py - P[b + 1], bpz = pz - P[b + 2];
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = px - P[c], cpy = py - P[c + 1], cpz = pz - P[c + 2];
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) [qx, qy, qz] = [P[b], P[b + 1], P[b + 2]];
    else if (d6 >= 0 && d5 <= d6) [qx, qy, qz] = [P[c], P[c + 1], P[c + 2]];
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3 || 1);
      [qx, qy, qz] = [ax + abx * v, ay + aby * v, az + abz * v];
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6 || 1);
      [qx, qy, qz] = [ax + acx * w, ay + acy * w, az + acz * w];
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6) || 1);
      [qx, qy, qz] = [P[b] + (P[c] - P[b]) * w, P[b + 1] + (P[c + 1] - P[b + 1]) * w, P[b + 2] + (P[c + 2] - P[b + 2]) * w];
    } else {
      const denom = 1 / (va + vb + vc || 1);
      const v = vb * denom;
      const w = vc * denom;
      [qx, qy, qz] = [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
    }
  }
  return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}

/**
 * Distance from every source vertex to the output surface (the max is the one-sided Hausdorff
 * distance). A collapsed barrel, mast or wing tip shows up here even when the bounding box is intact.
 */
function deviations(srcPos, outPos, outIdx) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < srcPos.length; i++) {
    const a = i % 3;
    if (srcPos[i] < min[a]) min[a] = srcPos[i];
    if (srcPos[i] > max[a]) max[a] = srcPos[i];
  }
  const cell = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 48;
  const dim = [0, 1, 2].map((a) => Math.floor((max[a] - min[a]) / cell) + 1);
  const cellOf = (v, a) => Math.max(0, Math.min(dim[a] - 1, Math.floor((v - min[a]) / cell)));
  const grid = new Map();
  for (let t = 0; t < outIdx.length; t += 3) {
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const v0 = outPos[outIdx[t] * 3 + a];
      const v1 = outPos[outIdx[t + 1] * 3 + a];
      const v2 = outPos[outIdx[t + 2] * 3 + a];
      lo[a] = cellOf(Math.min(v0, v1, v2), a);
      hi[a] = cellOf(Math.max(v0, v1, v2), a);
    }
    for (let x = lo[0]; x <= hi[0]; x++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let z = lo[2]; z <= hi[2]; z++) {
          const k = (x * dim[1] + y) * dim[2] + z;
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(t);
        }
  }
  const maxRing = Math.max(...dim);
  const result = new Float64Array(srcPos.length / 3);
  for (let i = 0; i < srcPos.length; i += 3) {
    const px = srcPos[i];
    const py = srcPos[i + 1];
    const pz = srcPos[i + 2];
    const c = [cellOf(px, 0), cellOf(py, 1), cellOf(pz, 2)];
    let best = Infinity;
    // Grow a cube of cells until the best hit is closer than anything outside the cube could be.
    for (let r = 0; r <= maxRing; r++) {
      for (let x = Math.max(0, c[0] - r); x <= Math.min(dim[0] - 1, c[0] + r); x++)
        for (let y = Math.max(0, c[1] - r); y <= Math.min(dim[1] - 1, c[1] + r); y++)
          for (let z = Math.max(0, c[2] - r); z <= Math.min(dim[2] - 1, c[2] + r); z++) {
            if (Math.max(Math.abs(x - c[0]), Math.abs(y - c[1]), Math.abs(z - c[2])) !== r) continue; // shell only
            const list = grid.get((x * dim[1] + y) * dim[2] + z);
            if (!list) continue;
            for (const t of list) {
              const d = pointTriDist2(px, py, pz, outPos, outIdx[t] * 3, outIdx[t + 1] * 3, outIdx[t + 2] * 3);
              if (d < best) best = d;
            }
          }
      if (best <= (r * cell) ** 2) break;
    }
    result[i / 3] = Math.sqrt(best);
  }
  return result;
}

// ---------------------------------------------------------------- normals

/** Smooth normals with a crease angle. Splits vertices where adjacent faces meet too sharply. */
function creasedNormals(pos, tris) {
  const triCount = tris.length / 3;
  const vCount = pos.length / 3;
  const fn = new Float64Array(triCount * 3); // unit face normals
  const ang = new Float64Array(triCount * 3); // corner angles (weights)
  const valid = new Uint8Array(triCount);
  const sub = (a, b) => [pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]];
  const angle = (u, v) => {
    const lu = Math.hypot(u[0], u[1], u[2]);
    const lv = Math.hypot(v[0], v[1], v[2]);
    if (!(lu > 0) || !(lv > 0)) return 0;
    const d = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv);
    return Math.acos(Math.max(-1, Math.min(1, d)));
  };
  for (let t = 0; t < triCount; t++) {
    const a = tris[t * 3];
    const b = tris[t * 3 + 1];
    const c = tris[t * 3 + 2];
    const ab = sub(b, a);
    const ac = sub(c, a);
    const bc = sub(c, b);
    const nx = ab[1] * ac[2] - ab[2] * ac[1];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    const nz = ab[0] * ac[1] - ab[1] * ac[0];
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 0)) continue; // zero-area sliver: dropped below
    valid[t] = 1;
    fn[t * 3] = nx / len;
    fn[t * 3 + 1] = ny / len;
    fn[t * 3 + 2] = nz / len;
    ang[t * 3] = angle(ab, ac);
    ang[t * 3 + 1] = angle(bc, [-ab[0], -ab[1], -ab[2]]);
    ang[t * 3 + 2] = Math.PI - ang[t * 3] - ang[t * 3 + 1];
  }
  // Corners incident on each vertex (CSR layout).
  const start = new Uint32Array(vCount + 1);
  for (let t = 0; t < triCount; t++) if (valid[t]) for (let k = 0; k < 3; k++) start[tris[t * 3 + k] + 1]++;
  for (let v = 0; v < vCount; v++) start[v + 1] += start[v];
  const fill = start.slice(0, vCount);
  const corners = new Uint32Array(start[vCount]);
  for (let t = 0; t < triCount; t++) if (valid[t]) for (let k = 0; k < 3; k++) corners[fill[tris[t * 3 + k]]++] = t * 3 + k;

  const cosCrease = Math.cos((CREASE_DEG * Math.PI) / 180);
  const outPos = [];
  const outNrm = [];
  const outIdx = [];
  const keyToIndex = new Map();
  for (let t = 0; t < triCount; t++) {
    if (!valid[t]) continue;
    for (let k = 0; k < 3; k++) {
      const v = tris[t * 3 + k];
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let c = start[v]; c < start[v + 1]; c++) {
        const g = (corners[c] / 3) | 0;
        const d = fn[t * 3] * fn[g * 3] + fn[t * 3 + 1] * fn[g * 3 + 1] + fn[t * 3 + 2] * fn[g * 3 + 2];
        if (g !== t && d < cosCrease) continue;
        const w = Math.max(ang[corners[c]], 1e-6);
        nx += fn[g * 3] * w;
        ny += fn[g * 3 + 1] * w;
        nz += fn[g * 3 + 2] * w;
      }
      let len = Math.hypot(nx, ny, nz);
      if (!(len > 1e-9)) {
        nx = fn[t * 3];
        ny = fn[t * 3 + 1];
        nz = fn[t * 3 + 2];
        len = 1;
      }
      nx /= len;
      ny /= len;
      nz /= len;
      // Corners of one vertex whose normals agree to about a quarter degree share a vertex.
      const key = `${v}|${Math.round(nx * 256)},${Math.round(ny * 256)},${Math.round(nz * 256)}`;
      let id = keyToIndex.get(key);
      if (id === undefined) {
        id = outPos.length / 3;
        outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        outNrm.push(nx, ny, nz);
        keyToIndex.set(key, id);
      }
      outIdx.push(id);
    }
  }
  return { pos: outPos, nrm: outNrm, idx: outIdx };
}

// ---------------------------------------------------------------- encode

const mantissaScratch = new DataView(new ArrayBuffer(4));
/** Rounds a float32 to POSITION_BITS of mantissa so the low bytes are zero and compress away. */
function roundMantissa(v) {
  if (v === 0) return 0;
  mantissaScratch.setFloat32(0, v);
  const drop = 24 - POSITION_BITS;
  let u = mantissaScratch.getUint32(0);
  u = ((u + (1 << (drop - 1))) >>> drop) << drop; // carry into the exponent is still a valid float
  mantissaScratch.setUint32(0, u >>> 0);
  return mantissaScratch.getFloat32(0);
}

function makeIO() {
  return new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

async function writeGlb(file, name, mesh) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const vCount = mesh.pos.length / 3;
  const indices = vCount > 65535 ? Uint32Array.from(mesh.idx) : Uint16Array.from(mesh.idx);
  const prim = doc
    .createPrimitive()
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(mesh.pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(mesh.nrm)).setBuffer(buffer));
  const m = doc.createMesh(name).addPrimitive(prim);
  doc.createScene(name).addChild(doc.createNode(name).setMesh(m));
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
  // Octahedral-filtered normals are normalized int8, which glTF only allows with KHR_mesh_quantization.
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const glb = await makeIO().writeBinary(doc);
  fs.writeFileSync(file, glb);
  return glb.byteLength;
}

// ---------------------------------------------------------------- stage

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const rows = manifest.units;

// One model per distinct (mesh, scale). The most-used mesh of a unit type is "<unit>.glb";
// any other is "<unit>-<power of its first manifest row>.glb".
const groups = new Map();
for (const r of rows) {
  const key = `${r.mesh}@${r.scale}`;
  if (!groups.has(key)) groups.set(key, { key, mesh: r.mesh, scale: r.scale, unit: r.unit, rows: [] });
  const g = groups.get(key);
  if (g.unit !== r.unit) throw new Error(`${r.mesh} is used by both ${g.unit} and ${r.unit}`);
  g.rows.push(r);
}
const byUnit = new Map();
for (const g of groups.values()) {
  if (!byUnit.has(g.unit)) byUnit.set(g.unit, []);
  byUnit.get(g.unit).push(g);
}
const names = new Set();
for (const list of byUnit.values()) {
  const primary = list.reduce((a, b) => (b.rows.length > a.rows.length ? b : a)); // ties keep manifest order
  for (const g of list) {
    g.name = g === primary ? g.unit : `${g.unit}-${g.rows[0].nation ?? 'shared'}`;
    if (names.has(g.name)) throw new Error(`duplicate model name ${g.name}`);
    names.add(g.name);
  }
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) {
  if (f.endsWith('.glb') || f === 'units.json') fs.unlinkSync(path.join(outDir, f));
}

const fmt = (s) => s.map((v) => +v.toFixed(4));
const report = [];
for (const g of groups.values()) {
  const text = fs.readFileSync(path.join(pub, g.mesh), 'latin1');
  const obj = parseObj(text);
  const welded = weld(obj.pos, obj.tris);
  const rotated = normaliseFrame(welded.pos, welded.tris, g.scale);
  const sourceSize = bounds(welded.pos, welded.tris).size;
  const sourcePos = Float64Array.from(welded.pos); // simplify may hand the same array back
  const simp = simplify(welded.pos, welded.tris);
  reseat(simp.pos, simp.tris);
  for (let i = 0; i < simp.pos.length; i++) simp.pos[i] = roundMantissa(simp.pos[i]);
  const mesh = creasedNormals(simp.pos, simp.tris);
  g.file = `/axis/units/${g.name}.glb`;
  g.tris = mesh.idx.length / 3;
  g.size = fmt(bounds(mesh.pos, mesh.idx).size);
  g.bytes = await writeGlb(path.join(outDir, `${g.name}.glb`), g.name, mesh);
  report.push({
    g,
    objVerts: obj.pos.length / 3,
    objTris: obj.tris.length / 3,
    lines: obj.lines,
    points: obj.points,
    weldedVerts: welded.pos.length / 3,
    weldedTris: welded.tris.length / 3,
    degenerate: welded.degenerate,
    duplicate: welded.duplicate,
    rotated,
    sourceSize,
    sourcePos,
    error: simp.error,
    note: simp.note,
    outVerts: mesh.pos.length / 3,
  });
}

const unitsJson = {
  version: 1,
  units: rows.map((r) => {
    const g = groups.get(`${r.mesh}@${r.scale}`);
    return { power: r.nation ?? null, unit: r.unit, file: g.file, tris: g.tris, size: g.size };
  }),
};
fs.writeFileSync(path.join(outDir, 'units.json'), JSON.stringify(unitsJson, null, 2) + '\n');

// ---------------------------------------------------------------- verify (reads the files back)

const failures = [];
const io = makeIO();
const written = JSON.parse(fs.readFileSync(path.join(outDir, 'units.json'), 'utf8'));
const checked = new Map();
for (const u of written.units) {
  const fail = (m) => failures.push(`${u.file} (${u.power ?? 'shared'} ${u.unit}): ${m}`);
  if (!checked.has(u.file)) {
    const file = path.join(pub, u.file);
    const doc = await io.read(file);
    const r = doc.getRoot();
    const res = { ok: true, problems: [] };
    const bad = (m) => res.problems.push(m);
    const meshes = r.listMeshes();
    if (meshes.length !== 1) bad(`${meshes.length} meshes`);
    const prims = meshes[0]?.listPrimitives() ?? [];
    if (prims.length !== 1) bad(`${prims.length} primitives`);
    const prim = prims[0];
    if (prim) {
      const sem = prim.listSemantics().sort().join(',');
      if (sem !== 'NORMAL,POSITION') bad(`attributes are ${sem}`);
      if (prim.getMaterial()) bad('has a material');
      if (prim.getMode() !== 4) bad(`mode ${prim.getMode()}`);
      const nodes = r.listNodes();
      if (nodes.length !== 1) bad(`${nodes.length} nodes`);
      const mtx = nodes[0].getWorldMatrix();
      const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      if (mtx.some((v, i) => Math.abs(v - identity[i]) > 1e-9)) bad('node transform is not identity');
      const used = r.listExtensionsUsed().map((e) => e.extensionName);
      if (!used.includes('EXT_meshopt_compression')) bad('EXT_meshopt_compression missing');
      const P = prim.getAttribute('POSITION');
      const N = prim.getAttribute('NORMAL');
      const I = prim.getIndices();
      if (P.getComponentType() !== 5126) bad('POSITION is not float32');
      if (N.getCount() !== P.getCount()) bad('NORMAL count differs from POSITION');
      const idx = I.getArray();
      const tris = idx.length / 3;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      let finite = true;
      let worstNormal = 0;
      const el = [0, 0, 0];
      for (let i = 0; i < idx.length; i++) {
        if (idx[i] >= P.getCount()) bad('index out of range');
        P.getElement(idx[i], el);
        for (let a = 0; a < 3; a++) {
          if (!Number.isFinite(el[a])) finite = false;
          if (el[a] < min[a]) min[a] = el[a];
          if (el[a] > max[a]) max[a] = el[a];
        }
      }
      for (let i = 0; i < N.getCount(); i++) {
        N.getElement(i, el);
        worstNormal = Math.max(worstNormal, Math.abs(Math.hypot(el[0], el[1], el[2]) - 1));
      }
      const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      const tol = 1e-3 * Math.max(...size);
      if (!finite) bad('non-finite bounds');
      if (Math.abs(min[1]) > tol) bad(`y-min ${min[1]}`);
      if (Math.abs((min[0] + max[0]) / 2) > tol) bad(`x centre ${(min[0] + max[0]) / 2}`);
      if (Math.abs((min[2] + max[2]) / 2) > tol) bad(`z centre ${(min[2] + max[2]) / 2}`);
      if (size[2] > BROADSIDE_RATIO * size[0]) bad(`z span ${size[2]} exceeds ${BROADSIDE_RATIO} x the x span ${size[0]}`);
      if (worstNormal > 0.05) bad(`normal length off by ${worstNormal}`);
      const rep = report.find((x) => x.g.file === u.file);
      const drift = sizeDrift(size, rep.sourceSize);
      if (drift > SIZE_TOLERANCE) bad(`bounding size drifts ${(drift * 100).toFixed(2)}% from the welded source`);
      const json = JSON.parse(
        fs.readFileSync(file).subarray(20, 20 + fs.readFileSync(file).readUInt32LE(12)).toString('utf8'),
      );
      if (!json.extensionsRequired?.includes('EXT_meshopt_compression')) bad('EXT_meshopt_compression not required');
      // Furthest any welded source vertex sits from the decoded output surface.
      const deviation = deviations(rep.sourcePos, P.getArray(), idx).reduce((m, d) => Math.max(m, d), 0);
      const relDeviation = deviation / Math.max(...rep.sourceSize);
      if (relDeviation > MAX_ERROR) bad(`a source vertex is ${(relDeviation * 100).toFixed(2)}% of the extent from the output surface`);
      Object.assign(res, { tris, size, min, max, drift, deviation, relDeviation, worstNormal, verts: P.getCount(), bytes: fs.statSync(file).size });
    }
    checked.set(u.file, res);
  }
  const res = checked.get(u.file);
  for (const p of res.problems) fail(p);
  if (res.tris !== u.tris) fail(`manifest tris ${u.tris} != file tris ${res.tris}`);
  if (res.size && sizeDrift(res.size, u.size) > 1e-3) fail(`manifest size ${u.size} != file size ${fmt(res.size)}`);
}
if (written.units.length !== rows.length) failures.push(`units.json has ${written.units.length} rows, manifest has ${rows.length}`);

// ---------------------------------------------------------------- report

let totalBytes = 0;
const table = report.map((x) => {
  const res = checked.get(x.g.file);
  totalBytes += res.bytes;
  const powers = [...new Set(x.g.rows.map((r) => r.nation ?? 'shared'))].join(' ');
  return {
    file: `${x.g.name}.glb`,
    unit: x.g.unit,
    power: powers,
    scale: x.g.scale,
    'obj tris': x.objTris,
    'welded tris': x.weldedTris,
    'out tris': res.tris,
    'out verts': res.verts,
    bytes: res.bytes,
    size: fmt(res.size).join(' x '),
    'size drift %': +(res.drift * 100).toFixed(3),
    'simp err %': +(x.error * 100).toFixed(3),
    'max dev': +res.deviation.toFixed(4),
    'max dev %': +(res.relDeviation * 100).toFixed(3),
    rot: x.rotated ? 'Y+90' : '',
  };
});
console.table(table);
console.table(
  report.map((x) => ({
    file: `${x.g.name}.glb`,
    'obj verts': x.objVerts,
    'welded verts': x.weldedVerts,
    'l recs': x.lines,
    'p recs': x.points,
    degenerate: x.degenerate,
    duplicate: x.duplicate,
    'z/x span': +(checked.get(x.g.file).size[2] / checked.get(x.g.file).size[0]).toFixed(3),
    note: x.note,
  })),
);
console.log(`${report.length} models for ${rows.length} manifest rows`);
console.log(`total GLB bytes ${totalBytes} (${(totalBytes / 1048576).toFixed(2)} MiB)`);
if (failures.length) {
  for (const f of failures) console.error(`VERIFY FAILED: ${f}`);
  console.log('VERIFY: FAILED');
  process.exitCode = 1;
} else console.log('VERIFY: OK');
