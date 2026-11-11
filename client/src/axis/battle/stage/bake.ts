// Turns the bush model into light, static, instanceable leaf cards. (Units are not baked here any
// more: they arrive ready-made from tools/axis-models and are read by rig.ts.) No loaders and no
// bundler imports live here.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

interface Spec { doubleSide?: boolean; dim?: number }

const FOLIAGE_FILES = ['tree1', 'tree2', 'bush'] as const;
export type FoliageKind = (typeof FOLIAGE_FILES)[number];

const TEXTURE_CAP = 512;

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

function lightMaterial(source: THREE.Material, spec: Spec, textures: Map<string, THREE.Texture>): THREE.MeshStandardMaterial {
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
  material.onBeforeCompile = (shader) => {
    // A zero normal, normalised, is not a number, and one such pixel spreads through the bloom.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
      if (!(dot(normal, normal) > 0.25)) normal = vec3(0.0, 0.0, 1.0);`);
  };
  material.customProgramCacheKey = () => 'axb-foliage';
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

