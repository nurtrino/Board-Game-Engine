import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundsOf, decimate, decimateModel, triangleCount, type RawMesh } from './decimate';

// ---------- a dense sphere keeps its shape and loses most of its triangles ----------
function sphere(rings: number, radius: number): RawMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    for (let j = 0; j <= rings * 2; j++) {
      const u = j / (rings * 2);
      const th = u * Math.PI * 2, ph = v * Math.PI;
      positions.push(radius * Math.sin(ph) * Math.cos(th), radius * Math.cos(ph), radius * Math.sin(ph) * Math.sin(th));
      uvs.push(u, v);
    }
  }
  const row = rings * 2 + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < rings * 2; j++) {
    const a = i * row + j, b = a + row;
    index.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), index: Uint32Array.from(index) };
}

{
  const src = sphere(120, 5);
  const before = triangleCount(src);
  const { parts, triangles } = decimateModel([src], 2000);
  const out = parts[0];
  assert.ok(triangles <= 2000 * 1.15, `budget respected (${triangles})`);
  assert.ok(triangles > 500, `not collapsed to nothing (${triangles})`);
  assert.ok(triangles < before / 10);
  const b = boundsOf([{ positions: out.positions, uvs: null, index: null }]);
  for (let a = 0; a < 3; a++) {
    assert.ok(b.max[a] > 4.2 && b.max[a] <= 5.001, 'the silhouette survives');
    assert.ok(b.min[a] < -4.2 && b.min[a] >= -5.001);
  }
  // no degenerate or out-of-range triangles, unit normals pointing outward
  const n = out.positions.length / 3;
  let outward = 0;
  for (let t = 0; t < out.index.length; t += 3) {
    const [i, j, k] = [out.index[t], out.index[t + 1], out.index[t + 2]];
    assert.ok(i < n && j < n && k < n);
    assert.ok(i !== j && j !== k && i !== k);
  }
  for (let v = 0; v < n; v++) {
    const [x, y, z] = [out.positions[v * 3], out.positions[v * 3 + 1], out.positions[v * 3 + 2]];
    const [nx, ny, nz] = [out.normals[v * 3], out.normals[v * 3 + 1], out.normals[v * 3 + 2]];
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-3);
    if (x * nx + y * ny + z * nz > 0) outward += 1;
  }
  assert.ok(outward / n > 0.97, 'winding is preserved');
  assert.equal(out.uvs!.length / 2, n);
}

// a light mesh is welded, not simplified
{
  const src = sphere(12, 5);
  const { triangles } = decimateModel([src], 5000);
  assert.ok(triangles >= triangleCount(src) * 0.85, 'small models keep their triangles');
}

// non-indexed input, and two parts sharing one grid
{
  const s = sphere(40, 2);
  const flat: number[] = [];
  for (const i of s.index!) flat.push(s.positions[i * 3], s.positions[i * 3 + 1], s.positions[i * 3 + 2]);
  const a = decimate({ positions: Float32Array.from(flat), uvs: null, index: null }, [-2, -2, -2], 0.4);
  const b = decimate({ positions: s.positions, uvs: null, index: s.index }, [-2, -2, -2], 0.4);
  assert.equal(a.triangles, b.triangles, 'indexed and non-indexed input agree');
  assert.equal(a.uvs, null);
}

// ---------- the real staged models: report what the budgets produce ----------
const COMPONENTS: Record<number, [new (b: ArrayBuffer, o: number, n: number) => ArrayLike<number>, number, number]> = {
  5120: [Int8Array, 1, 127], 5121: [Uint8Array, 1, 255], 5122: [Int16Array, 2, 32767],
  5123: [Uint16Array, 2, 65535], 5125: [Uint32Array, 4, 1], 5126: [Float32Array, 4, 1],
};
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function mul(a: number[], b: number[]): number[] {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n: { matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }): number[] {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function readGlb(file: string): RawMesh[] | null {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  if ((json.extensionsUsed ?? []).includes('KHR_draco_mesh_compression')) return null;
  const binStart = 20 + jsonLen + 8;
  const bin = buf.buffer.slice(buf.byteOffset + binStart, buf.byteOffset + buf.length);
  const read = (accessorIndex: number): { data: Float32Array; width: number } => {
    const acc = json.accessors[accessorIndex];
    const view = json.bufferViews[acc.bufferView];
    const [Ctor, bytes, norm] = COMPONENTS[acc.componentType];
    const width = WIDTH[acc.type];
    const stride = view.byteStride ?? bytes * width;
    const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const out = new Float32Array(acc.count * width);
    const dv = new DataView(bin);
    void Ctor;
    for (let i = 0; i < acc.count; i++) for (let k = 0; k < width; k++) {
      const o = base + i * stride + k * bytes;
      let v: number;
      switch (acc.componentType) {
        case 5120: v = dv.getInt8(o); break;
        case 5121: v = dv.getUint8(o); break;
        case 5122: v = dv.getInt16(o, true); break;
        case 5123: v = dv.getUint16(o, true); break;
        case 5125: v = dv.getUint32(o, true); break;
        default: v = dv.getFloat32(o, true);
      }
      out[i * width + k] = acc.normalized ? Math.max(v / norm, -1) : v;
    }
    return { data: out, width };
  };
  const meshes: RawMesh[] = [];
  const walk = (nodeIndex: number, parent: number[]) => {
    const node = json.nodes[nodeIndex];
    const world = mul(parent, trs(node));
    if (node.mesh !== undefined && node.skin === undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const p = read(prim.attributes.POSITION).data;
        const positions = new Float32Array(p.length);
        for (let i = 0; i < p.length; i += 3) {
          const [x, y, z] = [p[i], p[i + 1], p[i + 2]];
          positions[i] = world[0] * x + world[4] * y + world[8] * z + world[12];
          positions[i + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
          positions[i + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
        }
        const uvs = prim.attributes.TEXCOORD_0 !== undefined ? read(prim.attributes.TEXCOORD_0).data : null;
        const index = prim.indices !== undefined ? Uint32Array.from(read(prim.indices).data) : null;
        meshes.push({ positions, uvs, index });
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of json.scenes[json.scene ?? 0].nodes) walk(root, identity);
  return meshes;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const modelDir = path.resolve(here, '../../../../public/axis/sim/models');
const BUDGETS: Record<string, number> = {
  tank: 7000, artillery: 5000, warship: 9000, cruiser: 8000, destroyer: 7000, submarine: 3500, bomber: 6000, fighter: 5500,
};
if (fs.existsSync(modelDir)) {
  for (const [name, budget] of Object.entries(BUDGETS)) {
    const file = path.join(modelDir, `${name}.glb`);
    if (!fs.existsSync(file)) continue;
    const meshes = readGlb(file);
    if (!meshes || meshes.length === 0) continue;
    const before = meshes.reduce((n, m) => n + triangleCount(m), 0);
    const b = boundsOf(meshes);
    const t0 = performance.now();
    const out = decimateModel(meshes, budget);
    const ms = performance.now() - t0;
    const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(1));
    console.log(`  ${name.padEnd(10)} ${String(Math.round(before)).padStart(7)} -> ${String(out.triangles).padStart(6)} tris  size ${size.join(' x ')}  parts ${meshes.length}  ${ms.toFixed(0)}ms`);
    assert.ok(out.triangles <= budget * 1.15, `${name} meets its budget`);
    assert.ok(out.triangles >= Math.min(before, budget) * 0.3, `${name} is not gutted (${out.triangles})`);
  }
}

console.log('decimate: ok');
