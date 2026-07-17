// Runtime miniature portraits for the 2D hunt map: each GLB is rendered once
// to a transparent PNG data URL by a shared offscreen renderer, then cached
// for the session. Falls back to null (callers keep their disc tokens) when
// WebGL or the model is unavailable.

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { bbMiniGlb } from './bb-assets';

const SIZE = 224;

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  loader: GLTFLoader;
}

let rig: Rig | null | undefined; // undefined = untried, null = unavailable
const cache = new Map<string, Promise<string | null>>();

function getRig(): Rig | null {
  if (rig !== undefined) return rig;
  try {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#cfe0f2', '#1a1012', 1.15));
    const key = new THREE.DirectionalLight('#f2e6d2', 2.2);
    key.position.set(-2.4, 4.2, 3.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#9db8d8', 1.1);
    rim.position.set(2.6, 2.2, -2.8);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    rig = { renderer, scene, camera, loader };
  } catch {
    rig = null;
  }
  return rig;
}

async function renderThumb(slug: string): Promise<string | null> {
  const r = getRig();
  if (!r) return null;
  const gltf = await r.loader.loadAsync(bbMiniGlb(slug));
  const obj = gltf.scene;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 2 / Math.max(size.x, size.y, size.z, 1e-6);
  obj.scale.setScalar(s);
  // Sculpt fronts are +Z-flipped: half-turn so portraits face the viewer.
  // The rotation maps local (x, z) to (-x, -z), so the centering offset flips too.
  obj.rotation.y = Math.PI;
  obj.position.set(center.x * s, -box.min.y * s, center.z * s);
  r.scene.add(obj);
  const h = size.y * s;
  r.camera.position.set(0.36, h * 0.6 + 0.3, 4.6);
  r.camera.lookAt(0, h * 0.48, 0);
  r.renderer.render(r.scene, r.camera);
  const url = r.renderer.domElement.toDataURL('image/png');
  r.scene.remove(obj);
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m?.dispose());
  });
  return url;
}

export function bbMiniThumb(slug: string | null): Promise<string | null> {
  if (!slug || typeof document === 'undefined') return Promise.resolve(null);
  let p = cache.get(slug);
  if (!p) {
    p = renderThumb(slug).catch(() => null);
    cache.set(slug, p);
  }
  return p;
}

/** Resolved miniature portrait for a slug, or null while loading/unavailable. */
export function useBbMiniThumb(slug: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (slug) bbMiniThumb(slug).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [slug]);
  return url;
}
