// Turns a loaded glTF into a handful of light, static, instanceable parts. No loaders and no bundler
// imports live here, so this module also runs under node for the bake test.
//
// The source GLBs are 30k to 290k triangles with up to 135 textures apiece, and the soldier is a
// skinned rig. Drawn as shipped, thirty units would be several million triangles. So every model is
// baked once (world transforms and, for the soldier, a firing pose), merged per material, decimated
// to a per-type budget (decimate.ts), oriented nose-to-+z, stood on y = 0 and scaled to its field
// size. Only base colour maps are kept, capped in resolution.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { decimateModel, type RawMesh } from './decimate';
import { DIMS } from './layout';

export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

export interface UnitModel {
  parts: ModelPart[];
  /** Size after fitting: x across, y up, z along the facing. */
  size: THREE.Vector3;
  triangles: number;
  /** True when the real mesh could not be loaded and a built shape stands in. */
  standIn: boolean;
}

export interface Spec {
  file: string;
  budget: number;
  /** Turn the long horizontal axis onto z before applying yaw. */
  autoOrient: boolean;
  yaw: number;
  /** Fit this dimension to DIMS[key].size. */
  fit: 'largest' | 'height';
  doubleSide?: boolean;
  /** Multiply the base colour, for models whose textures are too bright or too dark. */
  dim?: number;
  /** How far the nation's paint replaces the model's own colours (0..1). */
  paint?: number;
  /** Bake this animation clip (first match) at a fraction of its length. Skinned models only. */
  pose?: { clips: string[]; at: number };
}

// Orientation values are carried over from the previous simulator, which was tuned against these files.
export const SPECS: Record<string, Spec> = {
  infantry: { file: 'infantry', budget: 2400, autoOrient: false, yaw: 0, fit: 'height', pose: { clips: ['fire', 'idle'], at: 0.3 } },
  tank: { file: 'tank', budget: 6000, autoOrient: true, yaw: 0, fit: 'largest' },
  artillery: { file: 'artillery', budget: 4500, autoOrient: true, yaw: Math.PI, fit: 'largest' },
  fighter: { file: 'fighter', budget: 5600, autoOrient: false, yaw: 0, fit: 'largest' },
  bomber: { file: 'bomber', budget: 6000, autoOrient: false, yaw: 0, fit: 'largest' },
  battleship: { file: 'warship', budget: 9000, autoOrient: true, yaw: Math.PI, fit: 'largest' },
  cruiser: { file: 'cruiser', budget: 8000, autoOrient: true, yaw: 0, fit: 'largest' },
  destroyer: { file: 'destroyer', budget: 7000, autoOrient: true, yaw: 0, fit: 'largest' },
  carrier: { file: 'carrier', budget: 9000, autoOrient: true, yaw: Math.PI, fit: 'largest', doubleSide: true, dim: 0.7 },
  submarine: { file: 'submarine', budget: 3500, autoOrient: true, yaw: Math.PI, fit: 'largest', dim: 0.7, paint: 0.94 },
};
const FOLIAGE_FILES = ['tree1', 'tree2', 'bush'] as const;
export type FoliageKind = (typeof FOLIAGE_FILES)[number];

const TEXTURE_CAP = 512;

// ---------- baking ----------

interface Baked { raw: RawMesh; source: THREE.Material }

function posedScene(gltf: GLTF, pose: Spec['pose']): THREE.Object3D {
  const scene = gltf.scene;
  if (pose) {
    const clip = pose.clips.map((name) => gltf.animations.find((a) => a.name.toLowerCase() === name)).find(Boolean)
      ?? gltf.animations[0];
    if (clip) {
      const mixer = new THREE.AnimationMixer(scene);
      mixer.clipAction(clip).play();
      mixer.setTime(clip.duration * pose.at);
    }
  }
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const s = o as THREE.SkinnedMesh;
    if (s.isSkinnedMesh) s.skeleton.update();
  });
  return scene;
}

/** Every mesh of a scene as world-space triangles, merged per material. */
function bake(scene: THREE.Object3D): Baked[] {
  const byMaterial = new Map<string, { positions: number[]; uvs: number[]; index: number[]; hasUv: boolean; source: THREE.Material }>();
  const v = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!source || source.visible === false) return;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
    let entry = byMaterial.get(source.uuid);
    if (!entry) {
      entry = { positions: [], uvs: [], index: [], hasUv: true, source };
      byMaterial.set(source.uuid, entry);
    }
    if (!uv) entry.hasUv = false;
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const copies = instanced ? instanced.count : 1;
    for (let c = 0; c < copies; c++) {
      if (instanced) {
        instanced.getMatrixAt(c, m4);
        m4.premultiply(mesh.matrixWorld);
      } else m4.copy(mesh.matrixWorld);
      const base = entry.positions.length / 3;
      for (let i = 0; i < pos.count; i++) {
        // getVertexPosition applies skinning and morph targets, and denormalises quantised attributes
        mesh.getVertexPosition(i, v).applyMatrix4(m4);
        entry.positions.push(v.x, v.y, v.z);
        if (uv) entry.uvs.push(uv.getX(i), uv.getY(i));
        else entry.uvs.push(0, 0);
      }
      if (geo.index) {
        const idx = geo.index;
        for (let i = 0; i < idx.count; i++) entry.index.push(base + idx.getX(i));
      } else {
        for (let i = 0; i < pos.count; i++) entry.index.push(base + i);
      }
    }
  });
  return [...byMaterial.values()].map((e) => ({
    raw: {
      positions: Float32Array.from(e.positions),
      uvs: e.hasUv ? Float32Array.from(e.uvs) : null,
      index: Uint32Array.from(e.index),
    },
    source: e.source,
  }));
}

function capTexture(tex: THREE.Texture | null, cache: Map<string, THREE.Texture>): THREE.Texture | null {
  if (!tex?.image) return tex ?? null;
  const hit = cache.get(tex.uuid);
  if (hit) return hit;
  const img = tex.image as { width: number; height: number };
  const largest = Math.max(img.width, img.height);
  let out = tex;
  if (largest > TEXTURE_CAP) {
    const k = TEXTURE_CAP / largest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * k));
    canvas.height = Math.max(1, Math.round(img.height * k));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      out = new THREE.CanvasTexture(canvas);
      out.flipY = tex.flipY;
      out.wrapS = tex.wrapS;
      out.wrapT = tex.wrapT;
      out.repeat.copy(tex.repeat);
      out.offset.copy(tex.offset);
      out.colorSpace = tex.colorSpace;
    }
  }
  out.anisotropy = 4;
  out.generateMipmaps = true;
  out.minFilter = THREE.LinearMipmapLinearFilter;
  out.needsUpdate = true;
  cache.set(tex.uuid, out);
  return out;
}

function lightMaterial(source: THREE.Material, spec: Pick<Spec, 'doubleSide' | 'dim' | 'paint'>, textures: Map<string, THREE.Texture>): THREE.MeshStandardMaterial {
  const src = source as THREE.MeshStandardMaterial;
  const cutout = (src.alphaTest ?? 0) > 0;
  const glass = src.transparent === true && !cutout && (src.opacity ?? 1) < 0.95;
  const color = src.color ? src.color.clone() : new THREE.Color(0xffffff);
  if (glass) color.multiplyScalar(0.35);
  if (spec.dim != null) color.multiplyScalar(spec.dim);
  const material = new THREE.MeshStandardMaterial({
    map: capTexture(src.map ?? null, textures),
    color,
    roughness: 0.72,
    metalness: 0.14,
    alphaTest: cutout ? Math.max(0.35, src.alphaTest) : 0,
    side: spec.doubleSide || cutout || src.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const paint = spec.paint ?? 0.6;
  // The instance colour is the nation's paint. It takes over most of the texture's own hue and
  // keeps its light and dark, so every model wears its side's colour instead of one shared livery.
  material.onBeforeCompile = (shader) => {
    // A decimated mesh can carry a zero normal. Normalised, that is not a number, and one such
    // pixel spreads through the bloom as a black square: give those fragments a normal that works.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
      if (!(dot(normal, normal) > 0.25)) normal = vec3(0.0, 0.0, 1.0);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
      #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
        float paintLum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
        vec3 painted = vColor * (0.3 + paintLum * 1.75);
        diffuseColor.rgb = mix(diffuseColor.rgb, painted, ${paint.toFixed(2)});
      #endif`);
  };
  material.customProgramCacheKey = () => `axb-paint-${paint.toFixed(2)}`;
  return material;
}

function releaseSource(gltf: GLTF, keep: Set<THREE.Texture>) {
  // two texture objects can share one decoded image; never close one a kept texture still shows
  const keepImages = new Set([...keep].map((t) => t.image as unknown));
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!mat) continue;
      for (const value of Object.values(mat as unknown as Record<string, unknown>)) {
        const t = value as THREE.Texture | null;
        if (t && t.isTexture && !keep.has(t)) {
          t.dispose();
          if (!keepImages.has(t.image as unknown)) (t.image as { close?: () => void } | undefined)?.close?.();
        }
      }
      mat.dispose();
    }
  });
}

function fitMatrix(bounds: THREE.Box3, spec: Pick<Spec, 'autoOrient' | 'yaw' | 'fit'>, target: number): THREE.Matrix4 {
  const size = bounds.getSize(new THREE.Vector3());
  let turn = spec.yaw;
  if (spec.autoOrient && size.x > size.z) turn += Math.PI / 2;
  const rot = new THREE.Matrix4().makeRotationY(turn);
  const turned = bounds.clone().applyMatrix4(rot);
  const tSize = turned.getSize(new THREE.Vector3());
  const centre = turned.getCenter(new THREE.Vector3());
  const fit = spec.fit === 'height' ? tSize.y : Math.max(tSize.x, tSize.y, tSize.z);
  const k = target / (fit || 1);
  return new THREE.Matrix4()
    .makeScale(k, k, k)
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -turned.min.y, -centre.z))
    .multiply(rot);
}

export function buildUnit(key: string, gltf: GLTF, spec: Spec): UnitModel {
  const baked = bake(posedScene(gltf, spec.pose)).filter((b) => b.raw.index!.length >= 3);
  if (baked.length === 0) throw new Error(`${key}: no geometry`);
  const { parts: light } = decimateModel(baked.map((b) => b.raw), spec.budget);
  const bounds = new THREE.Box3();
  const geometries: THREE.BufferGeometry[] = [];
  light.forEach((part) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
    if (part.uvs) g.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(part.index, 1));
    g.computeBoundingBox();
    if (part.triangles > 0) bounds.union(g.boundingBox!);
    geometries.push(g);
  });
  const matrix = fitMatrix(bounds, spec, DIMS[key]?.size ?? 6);
  const textures = new Map<string, THREE.Texture>();
  const parts: ModelPart[] = [];
  let triangles = 0;
  geometries.forEach((g, i) => {
    const tris = light[i].triangles;
    if (tris < 4) { g.dispose(); return; }
    g.applyMatrix4(matrix);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    triangles += tris;
    parts.push({ geometry: g, material: lightMaterial(baked[i].source, spec, textures) });
  });
  releaseSource(gltf, new Set(textures.values()));
  const size = bounds.clone().applyMatrix4(matrix).getSize(new THREE.Vector3());
  return { parts, size, triangles, standIn: false };
}

export interface FoliageModel { parts: ModelPart[]; triangles: number }

/** Foliage is leaf cards with cut-out alpha: never decimated, just normalised to height 1 on y = 0. */
export function buildFoliage(gltf: GLTF, kind: FoliageKind): FoliageModel {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  // The bush ships two detail levels in one file. Keep only the lightest.
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const lod = meshes.filter((m) => /lod[1-9]/i.test(m.name));
  const use = kind === 'bush' && lod.length > 0 ? lod : meshes;
  const bounds = new THREE.Box3();
  const textures = new Map<string, THREE.Texture>();
  const built = use.map((m) => {
    const g = m.geometry.clone();
    // quantised attributes become plain floats so the fit transform can be baked in
    const p = g.attributes.position;
    const flat = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { flat[i * 3] = p.getX(i); flat[i * 3 + 1] = p.getY(i); flat[i * 3 + 2] = p.getZ(i); }
    g.setAttribute('position', new THREE.BufferAttribute(flat, 3));
    const uv = g.attributes.uv;
    if (uv) {
      const f = new Float32Array(uv.count * 2);
      for (let i = 0; i < uv.count; i++) { f[i * 2] = uv.getX(i); f[i * 2 + 1] = uv.getY(i); }
      g.setAttribute('uv', new THREE.BufferAttribute(f, 2));
    }
    for (const name of Object.keys(g.attributes)) if (!['position', 'uv'].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(m.matrixWorld);
    g.computeVertexNormals();
    g.computeBoundingBox();
    bounds.union(g.boundingBox!);
    const source = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const material = lightMaterial(source, { doubleSide: true }, textures);
    if (source.transparent || (source.alphaTest ?? 0) > 0 || source.map?.format === THREE.RGBAFormat) material.alphaTest = Math.max(material.alphaTest, 0.45);
    material.roughness = 0.9;
    material.metalness = 0;
    return { geometry: g, material };
  });
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const k = 1 / (size.y || 1);
  const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -bounds.min.y, -centre.z));
  let triangles = 0;
  for (const part of built) {
    part.geometry.applyMatrix4(fit);
    part.geometry.computeBoundingSphere();
    triangles += (part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count) / 3;
  }
  releaseSource(gltf, new Set(textures.values()));
  return { parts: built, triangles };
}

