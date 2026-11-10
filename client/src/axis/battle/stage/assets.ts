// Loads the staged battle assets and caches the processed result for the life of the page.
// The heavy lifting (bake, decimate, fit) is in bake.ts. GPU copies are released when a stage is
// disposed; the processed data stays, so the next battle starts without downloading or decimating
// anything again.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoJsUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?url';
import { SPECS, buildFoliage, buildUnit, type FoliageKind, type FoliageModel, type UnitModel } from './bake';
import { standIn } from './standins';

export type { FoliageKind, FoliageModel, ModelPart, UnitModel } from './bake';

const BASE = '/axis/sim';

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
  return { gltf, draco };
}


// ---------- the cache ----------

const unitCache = new Map<string, Promise<UnitModel>>();
const foliageCache = new Map<FoliageKind, Promise<FoliageModel | null>>();
const textureCache = new Map<string, Promise<THREE.Texture | null>>();
let skyCache: Promise<THREE.DataTexture | null> | null = null;
let loaders: ReturnType<typeof makeLoader> | null = null;

function loadGltf(file: string): Promise<GLTF> {
  loaders ??= makeLoader();
  return loaders.gltf.loadAsync(`${BASE}/models/${file}.glb`);
}

/** A unit model by engine unit key. Never rejects: a model that fails to load becomes a built stand-in. */
export function loadUnit(key: string): Promise<UnitModel> {
  let hit = unitCache.get(key);
  if (!hit) {
    const spec = SPECS[key];
    hit = spec
      ? loadGltf(spec.file).then((gltf) => buildUnit(key, gltf, spec)).catch((error) => {
          console.warn(`[battle] ${key} model unavailable, using a stand-in`, error);
          return standIn(key);
        })
      : Promise.resolve(standIn(key));
    unitCache.set(key, hit);
  }
  return hit;
}

export function loadFoliage(kind: FoliageKind): Promise<FoliageModel | null> {
  let hit = foliageCache.get(kind);
  if (!hit) {
    hit = loadGltf(kind).then((gltf) => buildFoliage(gltf, kind)).catch((error) => {
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
 * Release the GPU copies held for a renderer that is going away. The processed data stays cached,
 * so the next battle starts without downloading or decimating anything again.
 */
export async function releaseGpu(): Promise<void> {
  const settle = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  for (const p of unitCache.values()) {
    const m = await settle(p);
    for (const part of m?.parts ?? []) { part.geometry.dispose(); part.material.map?.dispose(); part.material.dispose(); }
  }
  for (const p of foliageCache.values()) {
    const m = await settle(p);
    for (const part of m?.parts ?? []) { part.geometry.dispose(); part.material.map?.dispose(); part.material.dispose(); }
  }
  for (const p of textureCache.values()) (await settle(p))?.dispose();
  (await settle(skyCache ?? Promise.resolve(null)))?.dispose();
}
