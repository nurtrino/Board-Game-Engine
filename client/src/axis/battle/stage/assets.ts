// Loads the battle assets and caches the processed result for the life of the page. GPU copies are
// released when a stage is disposed; the parsed data stays, so the next battle starts at once.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoJsUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?url';
import { buildFoliage, type FoliageKind, type FoliageModel } from './bake';
import { buildRig, rigFromParts, type UnitRig, type UnitTextures } from './rig';
import { standIn } from './standins';

export type { FoliageKind, FoliageModel } from './bake';

const BASE = '/axis/sim';

/** A unit ready to draw: its part tree and its textures (none for a built stand-in). */
export interface UnitAsset { rig: UnitRig; textures: UnitTextures | null }

// ---------- loaders ----------

function makeLoader(): { gltf: GLTFLoader; draco: DRACOLoader } {
  const draco = new DRACOLoader();
  // Serve the decoder from the bundle instead of a CDN: map the fixed file names DRACOLoader asks
  // for onto the hashed asset urls.
  const urls: Record<string, string> = {
    'draco_wasm_wrapper.js': dracoWrapperUrl,
    'draco_decoder.wasm': dracoWasmUrl,
    'draco_decoder.js': dracoJsUrl,
  };
  (draco as unknown as { _loadLibrary: (url: string, type: string) => Promise<unknown> })._loadLibrary = (url, type) =>
    fetch(urls[url] ?? url).then((r): Promise<unknown> => {
      if (!r.ok) throw new Error(`draco ${url} ${r.status}`);
      return type === 'arraybuffer' ? r.arrayBuffer() : r.text();
    });
  const gltf = new GLTFLoader();
  gltf.setDRACOLoader(draco);
  gltf.setMeshoptDecoder(MeshoptDecoder);
  return { gltf, draco };
}

// ---------- the cache ----------

const unitCache = new Map<string, Promise<UnitAsset>>();
const foliageCache = new Map<FoliageKind, Promise<FoliageModel | null>>();
const textureCache = new Map<string, Promise<THREE.Texture | null>>();
let skyCache: Promise<THREE.DataTexture | null> | null = null;
let loaders: ReturnType<typeof makeLoader> | null = null;

function loadGltf(url: string): Promise<GLTF> {
  loaders ??= makeLoader();
  return loaders.gltf.loadAsync(url);
}

function unitTexture(url: string, srgb: boolean): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = false;   // glTF texture coordinates
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
}

/** Half-size textures for screens that are short of memory. Decided once per page. */
export function liteTextures(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const q = new URLSearchParams(window.location.search);
  if (q.get('hq') === '1') return false;
  return q.get('lite') === '1' || (nav.deviceMemory != null && nav.deviceMemory <= 4) || /Android|iPhone|iPad|SmartTV|Tizen|Web0S|CrKey|AFT/i.test(nav.userAgent);
}

/** A unit by engine key. Never rejects: a model that fails to load becomes a built stand-in. */
export function loadUnit(key: string): Promise<UnitAsset> {
  let hit = unitCache.get(key);
  if (!hit) {
    const dir = `${BASE}/units/${key}`;
    const tag = liteTextures() ? '-1k' : '';
    hit = Promise.all([
      loadGltf(`${dir}/model.glb`),
      unitTexture(`${dir}/albedo${tag}.webp`, true),
      unitTexture(`${dir}/normal${tag}.webp`, false),
      unitTexture(`${dir}/orm${tag}.webp`, false),
    ]).then(([gltf, map, normalMap, orm]): UnitAsset => ({ rig: buildRig(key, gltf), textures: { map, normalMap, orm } }))
      .catch((error): UnitAsset => {
        console.warn(`[battle] ${key} model unavailable, using a stand-in`, error);
        const s = standIn(key);
        return { rig: rigFromParts(key, s.parts, s.size), textures: null };
      });
    unitCache.set(key, hit);
  }
  return hit;
}

export function loadFoliage(kind: FoliageKind): Promise<FoliageModel | null> {
  let hit = foliageCache.get(kind);
  if (!hit) {
    hit = loadGltf(`${BASE}/models/${kind}.glb`).then((gltf) => buildFoliage(gltf, kind)).catch((error) => {
      console.warn(`[battle] ${kind} unavailable`, error);
      return null;
    });
    foliageCache.set(kind, hit);
  }
  return hit;
}

export function loadTexture(file: string, opts: { srgb?: boolean; repeat?: boolean } = {}): Promise<THREE.Texture | null> {
  let hit = textureCache.get(file);
  if (!hit) {
    hit = new THREE.TextureLoader().loadAsync(`${BASE}/${file}`).then((t) => {
      t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    }).catch((error) => {
      console.warn(`[battle] ${file} unavailable`, error);
      return null;
    });
    textureCache.set(file, hit);
  }
  return hit;
}

export function loadSky(): Promise<THREE.DataTexture | null> {
  skyCache ??= new RGBELoader().loadAsync(`${BASE}/sky-overcast.hdr`).then((t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  }).catch((error) => {
    console.warn('[battle] sky unavailable', error);
    return null;
  });
  return skyCache;
}

/**
 * Release the GPU copies held for a renderer that is going away. The parsed data stays cached,
 * so the next battle starts without downloading anything again.
 */
export async function releaseGpu(): Promise<void> {
  const settle = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  for (const p of unitCache.values()) {
    const a = await settle(p);
    if (!a) continue;
    for (const m of a.rig.meshes) { m.geometry.dispose(); m.material?.dispose(); }
    a.textures?.map.dispose();
    a.textures?.normalMap.dispose();
    a.textures?.orm.dispose();
  }
  for (const p of foliageCache.values()) {
    const m = await settle(p);
    for (const part of m?.parts ?? []) { part.geometry.dispose(); part.material.map?.dispose(); part.material.dispose(); }
  }
  for (const p of textureCache.values()) (await settle(p))?.dispose();
  (await settle(skyCache ?? Promise.resolve(null)))?.dispose();
}
