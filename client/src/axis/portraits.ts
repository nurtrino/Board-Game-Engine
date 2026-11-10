// Small renders of the unit sculpts in a nation's colour, for the buy and deploy menus.
// One throwaway renderer draws every sculpt once; the results are plain images after that.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { UnitLibrary } from './units';
import { pieceTint } from './world';

const cache = new Map<string, Record<string, string>>();
const KEYS = ['infantry', 'artillery', 'tank', 'aaGun', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport', 'factory'];
const SIZE = 256;

export function renderPortraits(units: UnitLibrary, power: string): Record<string, string> {
  const hit = cache.get(power);
  if (hit) return hit;
  const out: Record<string, string> = {};
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xe8eeff, 0x20222a, 0.5));
  const key = new THREE.DirectionalLight(0xfff3e0, 1.6);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd0ff, 0.9);
  rim.position.set(4, 3, -5);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.25, envMapIntensity: 0.9 });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  scene.add(mesh);

  for (const k of KEYS) {
    const model = units.get(power, k);
    const tint = pieceTint(power, k);
    // the menu sits on black glass, so the darkest plastics are lifted to keep their shape
    material.color.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace).lerp(new THREE.Color(0xffffff), 0.22);
    mesh.geometry = model.geometry;
    const sphere = model.geometry.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 1);
    const r = Math.max(0.001, sphere.radius);
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(13))) * 1.04;
    const dir = new THREE.Vector3(-0.62, 0.52, 0.86).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.near = dist * 0.05;
    camera.far = dist * 4;
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    out[k] = renderer.domElement.toDataURL('image/png');
  }

  mesh.geometry = new THREE.BufferGeometry();
  material.dispose();
  env.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  cache.set(power, out);
  return out;
}
