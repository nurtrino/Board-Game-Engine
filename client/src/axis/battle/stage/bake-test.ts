// Runs the real staged GLBs through the real bake under node: parse, pose the skinned soldier,
// expand instanced parts, merge, decimate, orient and fit. No GPU is involved, so this proves the
// pipeline holds together and the numbers are sane. It cannot prove the result looks right.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The loader only needs enough of a browser to believe textures exist.
const g = globalThis as Record<string, unknown>;
g.self ??= globalThis;
g.createImageBitmap ??= async () => ({ width: 4, height: 4, close() {} });
g.Image ??= class {
  height = 0; width = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) { setTimeout(() => { this.height = 1; this.width = 1; this.onload?.(); }, 0); }
};

const here = path.dirname(fileURLToPath(import.meta.url));
const modelDir = path.resolve(here, '../../../../public/axis/sim/models');

async function main() {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { SPECS, buildUnit, buildFoliage } = await import('./bake');
  const { standIn } = await import('./standins');
  const { DIMS } = await import('./layout');

  // built stand-ins: right size, standing on the ground, facing along z
  for (const key of ['aaGun', 'transport', 'factory']) {
    const m = standIn(key);
    assert.equal(m.standIn, false, `${key} is a designed shape, not a failure fallback`);
    assert.ok(m.parts.length >= 2 && m.triangles > 40);
    const largest = Math.max(m.size.x, m.size.y, m.size.z);
    assert.ok(Math.abs(largest - DIMS[key].size) < 0.01, `${key} fits its field size`);
    let minY = Infinity;
    for (const p of m.parts) { p.geometry.computeBoundingBox(); minY = Math.min(minY, p.geometry.boundingBox!.min.y); }
    assert.ok(Math.abs(minY) < 1e-3, `${key} stands on y = 0`);
    console.log(`  ${key.padEnd(10)} built    ${String(m.triangles).padStart(6)} tris  size ${m.size.x.toFixed(1)} x ${m.size.y.toFixed(1)} x ${m.size.z.toFixed(1)}  parts ${m.parts.length}`);
  }
  assert.ok(standIn('transport').size.z > standIn('transport').size.x * 3, 'the transport is long along its heading');
  assert.equal(standIn('tank').standIn, true, 'a missing model is flagged as a fallback');

  if (!fs.existsSync(modelDir)) { console.log('battle bake: models not staged, skipped'); return; }
  const loader = new GLTFLoader();
  const parse = (file: string) => {
    const buf = fs.readFileSync(path.join(modelDir, `${file}.glb`));
    return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  };

  let total = 0;
  for (const [key, spec] of Object.entries(SPECS)) {
    if (!fs.existsSync(path.join(modelDir, `${spec.file}.glb`))) continue;
    let gltf;
    try {
      gltf = await parse(spec.file);
    } catch (error) {
      // the carrier is Draco compressed and its decoder needs a browser worker
      console.log(`  ${key.padEnd(10)} not parsed under node (${String((error as Error).message).slice(0, 60)})`);
      continue;
    }
    const t0 = performance.now();
    const m = buildUnit(key, gltf, spec);
    const ms = performance.now() - t0;
    total += m.triangles;
    console.log(`  ${key.padEnd(10)} baked    ${String(m.triangles).padStart(6)} tris  size ${m.size.x.toFixed(1)} x ${m.size.y.toFixed(1)} x ${m.size.z.toFixed(1)}  parts ${m.parts.length}  ${ms.toFixed(0)}ms`);
    assert.equal(m.standIn, false);
    assert.ok(m.parts.length > 0, `${key} has geometry`);
    assert.ok(m.triangles <= spec.budget * 1.15, `${key} meets its triangle budget (${m.triangles})`);
    assert.ok(m.triangles >= Math.min(1200, spec.budget * 0.3), `${key} is not gutted (${m.triangles})`);
    const fit = spec.fit === 'height' ? m.size.y : Math.max(m.size.x, m.size.y, m.size.z);
    assert.ok(Math.abs(fit - DIMS[key].size) < DIMS[key].size * 0.02, `${key} fits its field size (${fit.toFixed(2)})`);
    let minY = Infinity, cx = 0, n = 0;
    for (const p of m.parts) {
      const b = p.geometry.boundingBox!;
      minY = Math.min(minY, b.min.y);
      cx += (b.min.x + b.max.x) / 2; n += 1;
      const pos = p.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 97) assert.ok(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), `${key} has finite vertices`);
      assert.ok(p.geometry.attributes.normal, `${key} has normals`);
    }
    assert.ok(Math.abs(minY) < DIMS[key].size * 0.02, `${key} stands on y = 0 (${minY.toFixed(3)})`);
    if (spec.autoOrient) assert.ok(m.size.z >= m.size.x, `${key} lies along its heading`);
    if (key === 'infantry') {
      assert.ok(m.size.y > m.size.x && m.size.y > m.size.z * 0.9, 'the soldier is upright after the pose bake');
    }
    void cx; void n;
  }

  for (const kind of ['tree1', 'tree2', 'bush'] as const) {
    if (!fs.existsSync(path.join(modelDir, `${kind}.glb`))) continue;
    const f = buildFoliage(await parse(kind), kind);
    console.log(`  ${kind.padEnd(10)} foliage  ${String(Math.round(f.triangles)).padStart(6)} tris  parts ${f.parts.length}`);
    assert.ok(f.parts.length > 0);
    let minY = Infinity, maxY = -Infinity;
    for (const p of f.parts) { p.geometry.computeBoundingBox(); minY = Math.min(minY, p.geometry.boundingBox!.min.y); maxY = Math.max(maxY, p.geometry.boundingBox!.max.y); }
    assert.ok(Math.abs(minY) < 0.02 && Math.abs(maxY - 1) < 0.02, `${kind} is normalised to height 1`);
  }
  console.log(`  one of each unit: ${total} triangles`);
  console.log('battle bake: ok');
}

main().catch((error) => { console.error(error); process.exit(1); });
