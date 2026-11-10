// Unit sculpts. The mod's own meshes, staged as compact models by tools/stage-axis-units.mjs
// (one mesh each, base on y = 0, long axis on x). If the staged set is missing the raw OBJ files
// from the mod are normalised in the browser instead, so the table still comes up.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface UnitModel {
  /** Shared geometry: base on y = 0, footprint centred, long axis on x. */
  geometry: THREE.BufferGeometry;
  size: THREE.Vector3;
}

interface StagedEntry { power: string | null; unit: string; file: string; size?: [number, number, number] }
interface RawEntry { nation: string | null; unit: string; mesh: string; scale: number }

// How long each sculpt stands on the board, in render units (the board is 95 wide).
// Land pieces fit the 1.04 spacing between spots; ships run a little longer over open water.
const FOOTPRINT: Record<string, number> = {
  infantry: 0.56, artillery: 0.98, tank: 1.0, aaGun: 0.84, factory: 0.74,
  fighter: 1.02, bomber: 1.3,
  battleship: 1.7, carrier: 1.7, cruiser: 1.46, destroyer: 1.26, submarine: 1.14, transport: 1.36,
};
// Standing figures are measured by height instead of footprint.
const HEIGHT: Record<string, number> = { infantry: 0.96 };

export function unitScale(key: string, size: THREE.Vector3): number {
  const h = HEIGHT[key];
  if (h) return h / Math.max(0.001, size.y);
  return (FOOTPRINT[key] ?? 0.9) / Math.max(0.001, size.x, size.z);
}

function normalise(source: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  let g = source.index ? source.toNonIndexed() : source.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  g = mergeVertices(g, 1e-4);
  g.scale(scale, scale, scale);
  g.computeBoundingBox();
  let box = g.boundingBox!;
  if (box.max.z - box.min.z > (box.max.x - box.min.x) * 1.4) {
    g.rotateY(Math.PI / 2);
    g.computeBoundingBox();
    box = g.boundingBox!;
  }
  g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function sized(geometry: THREE.BufferGeometry): UnitModel {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  return { geometry, size };
}

export class UnitLibrary {
  private models = new Map<string, UnitModel>();
  private byUnit = new Map<string, string>();
  private fallback: UnitModel;

  constructor() {
    const box = new THREE.BoxGeometry(0.7, 0.4, 0.4);
    box.translate(0, 0.2, 0);
    this.fallback = sized(box);
  }

  /** China flies American aircraft; antiaircraft guns and factories are shared sculpts. */
  get(power: string | null, key: string): UnitModel {
    const sculpt = power === 'china' && key === 'fighter' ? 'usa' : power;
    const file = this.byUnit.get(`${sculpt}:${key}`) ?? this.byUnit.get(`null:${key}`) ?? this.byUnit.get(`*:${key}`);
    return (file && this.models.get(file)) || this.fallback;
  }

  async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    const staged = await fetch('/axis/units/units.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) as { units: StagedEntry[] } | null;
    if (staged?.units?.length) await this.loadStaged(staged.units, onProgress);
    else await this.loadRaw(onProgress);
  }

  private index(power: string | null, unit: string, file: string) {
    this.byUnit.set(`${power}:${unit}`, file);
    if (!this.byUnit.has(`*:${unit}`)) this.byUnit.set(`*:${unit}`, file);
  }

  private async loadStaged(entries: StagedEntry[], onProgress?: (done: number, total: number) => void) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const files = [...new Set(entries.map((e) => e.file))];
    let done = 0;
    await Promise.all(files.map(async (file) => {
      try {
        const gltf = await loader.loadAsync(file);
        const parts: THREE.BufferGeometry[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
          for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
          parts.push(g);
        });
        const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
        if (merged) {
          if (!merged.attributes.normal) merged.computeVertexNormals();
          this.models.set(file, sized(merged));
        }
      } catch (err) {
        console.warn('unit model failed to load', file, err);
      }
      onProgress?.(++done, files.length);
    }));
    for (const e of entries) this.index(e.power, e.unit, e.file);
  }

  private async loadRaw(onProgress?: (done: number, total: number) => void) {
    const manifest = await fetch('/axis/axis-manifest.json').then((r) => r.json()) as { units: RawEntry[] };
    const loader = new OBJLoader();
    const jobs = new Map<string, number>();
    for (const u of manifest.units) if (!jobs.has(u.mesh)) jobs.set(u.mesh, u.scale ?? 1);
    let done = 0;
    await Promise.all([...jobs].map(async ([file, scale]) => {
      try {
        // The mod's sculpts carry thousands of stray line records that draw as white wire shells.
        const text = await fetch(file).then((r) => r.text());
        const clean = text.split('\n').filter((line) => !line.startsWith('l ') && !line.startsWith('p ')).join('\n');
        const obj = loader.parse(clean);
        const parts: THREE.BufferGeometry[] = [];
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const g = m.geometry.clone();
          for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
          parts.push(g);
        });
        const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
        if (merged) this.models.set(file, sized(normalise(merged, scale)));
      } catch (err) {
        console.warn('unit sculpt failed to load', file, err);
      }
      onProgress?.(++done, jobs.size);
    }));
    for (const u of manifest.units) this.index(u.nation, u.unit, u.mesh);
  }

  dispose() {
    for (const m of this.models.values()) m.geometry.dispose();
    this.fallback.geometry.dispose();
    this.models.clear();
  }
}
