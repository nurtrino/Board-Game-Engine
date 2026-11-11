// Runs the shipped unit models through the real rig builder under node and drives their parts.
// No GPU is involved: this proves every file follows the model rules, fits the field, stays within
// its triangle budget, and that its guns train, its wheels turn and its markers resolve. It cannot
// prove the result looks right.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const g = globalThis as Record<string, unknown>;
g.self ??= globalThis;

const here = path.dirname(fileURLToPath(import.meta.url));
const unitDir = path.resolve(here, '../../../../public/axis/sim/units');

const BUDGET: Record<string, number> = {
  infantry: 8000, artillery: 12000, aaGun: 12000, tank: 34000, fighter: 16000, bomber: 28000, factory: 24000,
  battleship: 55000, cruiser: 42000, destroyer: 30000, carrier: 50000, submarine: 14000, transport: 28000,
};
const ARMED: Record<string, string> = {
  infantry: 'rifle', artillery: 'cannon', aaGun: 'flak', tank: 'cannon', fighter: 'mg',
  battleship: 'naval', cruiser: 'naval', destroyer: 'naval', submarine: 'torpedo',
};
const AFLOAT = new Set(['battleship', 'cruiser', 'destroyer', 'carrier', 'submarine', 'transport']);

async function main() {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const { buildRig, newRigState, nodeWorld, poseRig, rigFromParts } = await import('./rig');
  const { standIn } = await import('./standins');
  const { DIMS } = await import('./layout');

  // a model that fails to load still becomes something drawable
  const s = standIn('tank');
  const fallback = rigFromParts('tank', s.parts, s.size);
  assert.equal(fallback.standIn, true);
  assert.ok(fallback.meshes.length > 0 && fallback.nodes.every((n) => n.anim === 'none'));
  poseRig(fallback, newRigState(fallback), new THREE.Matrix4(), 0.016, null, 0);

  if (!fs.existsSync(unitDir)) { console.log('battle rigs: models not staged, skipped'); return; }
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let total = 0, seen = 0;
  for (const key of Object.keys(BUDGET)) {
    const folder = path.join(unitDir, key);
    if (!fs.existsSync(path.join(folder, 'model.glb'))) { console.log(`  ${key.padEnd(11)} not built yet`); continue; }
    for (const f of ['albedo.webp', 'normal.webp', 'orm.webp', 'albedo-1k.webp', 'normal-1k.webp', 'orm-1k.webp']) {
      assert.ok(fs.existsSync(path.join(folder, f)), `${key} ships ${f}`);
    }
    const buf = fs.readFileSync(path.join(folder, 'model.glb'));
    const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
    const rig = buildRig(key, gltf);
    seen += 1;
    total += rig.triangles;
    const yaws = rig.nodes.filter((n) => n.anim === 'yaw').length;
    console.log(`  ${key.padEnd(11)} ${String(rig.triangles).padStart(6)} tris  ${String(rig.meshes.length).padStart(2)} meshes  ${String(rig.nodes.length).padStart(3)} nodes  ${yaws} mounts  ${rig.muzzles.length} muzzles  size ${rig.size.x.toFixed(1)} x ${rig.size.y.toFixed(1)} x ${rig.size.z.toFixed(1)}`);

    assert.equal(rig.standIn, false);
    assert.ok(rig.triangles <= BUDGET[key] * 1.1, `${key} meets its triangle budget (${rig.triangles})`);
    assert.ok(rig.meshes.length <= 20, `${key} keeps its draw calls down (${rig.meshes.length} meshes)`);
    const fit = key === 'infantry' ? rig.size.y : Math.max(rig.size.x, rig.size.y, rig.size.z);
    assert.ok(Math.abs(fit - DIMS[key].size) < DIMS[key].size * 0.02, `${key} fits its field size (${fit.toFixed(2)})`);
    // aircraft are wider than they are long, and a factory has no heading
    if (!['factory', 'infantry', 'fighter', 'bomber'].includes(key)) assert.ok(rig.size.z >= rig.size.x * 0.75, `${key} faces along z (${rig.size.x.toFixed(1)} wide, ${rig.size.z.toFixed(1)} long)`);
    for (const n of rig.nodes) {
      if (n.anim === 'pitch') assert.ok(n.parent >= 0, `${key}: gun "${n.name}" hangs from something`);
      if (n.anim === 'track') assert.ok(rig.meshes[n.mesh].geometry.getAttribute('aNext'), `${key}: track "${n.name}" carries its next-link data`);
      if (n.anim === 'spin') assert.ok(n.radius > 0.05, `${key}: wheel "${n.name}" has a radius`);
    }
    if (ARMED[key]) assert.ok(rig.muzzles.some((i) => rig.nodes[i].kind === ARMED[key]), `${key} has a ${ARMED[key]} muzzle marker`);
    if (AFLOAT.has(key)) {
      let minY = Infinity;
      const st0 = newRigState(rig);
      const p = new THREE.Vector3();
      rig.nodes.forEach((n, i) => {
        if (n.mesh < 0) return;
        const box = rig.meshes[n.mesh].geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(rig.meshes[n.mesh].geometry.getAttribute('position') as THREE.BufferAttribute);
        nodeWorld(rig, st0, new THREE.Matrix4(), i, p);
        minY = Math.min(minY, p.y + box.min.y * rig.scale);
      });
      assert.ok(minY < -0.2, `${key} has a hull below its waterline (lowest point ${minY.toFixed(2)})`);
    }

    // drive it: a target a little off the bow, ten seconds, then fire
    const st = newRigState(rig);
    const place = new THREE.Matrix4().makeTranslation(3, 0, -2);
    st.aim = new THREE.Vector3(-12, 4, 60);   // inside even a field gun's narrow traverse
    st.aimAir = new THREE.Vector3(-20, 45, 30);
    for (let i = 0; i < 600; i++) { st.travel += 0.05; poseRig(rig, st, place, 1 / 60, null, 0); }
    st.kick.fill(1);
    poseRig(rig, st, place, 1 / 60, null, 0);
    assert.ok([...st.angle].every(Number.isFinite), `${key}: every part angle is a number`);
    const mounts = rig.nodes.map((n, i) => (n.anim === 'yaw' ? i : -1)).filter((i) => i >= 0);
    if (mounts.length) {
      assert.ok(mounts.some((i) => Math.abs(st.angle[i]) > 0.05), `${key}: a mount turned toward the target`);
      assert.ok(mounts.some((i) => st.bears[i] === 1), `${key}: a mount bears on the target`);
    }
    const p = new THREE.Vector3(), dir = new THREE.Vector3();
    for (const i of rig.muzzles) {
      nodeWorld(rig, st, place, i, p, dir);
      assert.ok(Number.isFinite(p.x + p.y + p.z) && Math.abs(dir.length() - 1) < 1e-3, `${key}: muzzle "${rig.nodes[i].name}" resolves`);
      assert.ok(p.distanceTo(new THREE.Vector3(3, 0, -2)) < DIMS[key].size * 1.2, `${key}: muzzle "${rig.nodes[i].name}" is on the model`);
    }
    // a surface gun that bears points its muzzle roughly at the target
    const main = rig.muzzles.find((i) => {
      const gun = rig.nodes[i].parent;
      const mount = gun >= 0 ? (rig.nodes[gun].anim === 'yaw' ? gun : rig.nodes[gun].parent) : -1;
      return mount >= 0 && rig.nodes[mount].anim === 'yaw' && !rig.nodes[mount].air && st.bears[mount] === 1 && rig.nodes[gun].anim === 'pitch';
    });
    if (main != null) {
      nodeWorld(rig, st, place, main, p, dir);
      const want = st.aim.clone().sub(p).normalize();
      assert.ok(dir.dot(want) > 0.9, `${key}: its gun points at the target (${dir.dot(want).toFixed(2)})`);
    }
  }
  console.log(`  ${seen} of ${Object.keys(BUDGET).length} units built, one of each: ${total} triangles`);
}

main().then(() => console.log('battle rigs: ok')).catch((error) => { console.error(error); process.exit(1); });
