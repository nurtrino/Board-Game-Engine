// Built shapes for the unit types that have no staged model (antiaircraft gun, transport, industrial
// complex), and a plain fallback for any model that fails to load. Same conventions as the loaded
// models: facing +z, standing on y = 0, fitted to DIMS[key].size.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DIMS } from './layout';
export interface ModelPart { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }
export interface UnitModel { parts: ModelPart[]; size: THREE.Vector3; triangles: number; standIn: boolean }
import { unitDomain } from '../model';

type Tone = 'hull' | 'dark' | 'deck' | 'light';
type Piece = { g: THREE.BufferGeometry; mat: Tone };

const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: Tone, rx = 0, ry = 0): Piece => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0)));
  g.translate(x, y, z);
  return { g, mat };
};
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, mat: Tone, rx = 0, seg = 10): Piece => {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return { g, mat };
};

/** A hull outline seen from above (bow at +z), extruded up from the keel. */
function hull(length: number, beam: number, depth: number, mat: Tone): Piece {
  const L = length / 2, B = beam / 2;
  // Drawn in the shape's xy plane with -y as the bow, so that rotating the extrusion upright
  // (x by +90 degrees) puts the bow at +z and the extrusion along +y without mirroring.
  const shape = new THREE.Shape();
  shape.moveTo(0, -L);
  shape.quadraticCurveTo(B * 1.05, -L * 0.55, B, -L * 0.1);
  shape.lineTo(B * 0.92, L * 0.82);
  shape.quadraticCurveTo(B * 0.6, L, 0, L);
  shape.quadraticCurveTo(-B * 0.6, L, -B * 0.92, L * 0.82);
  shape.lineTo(-B, -L * 0.1);
  shape.quadraticCurveTo(-B * 1.05, -L * 0.55, 0, -L);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  // rotateX(-90deg): (x, y, z) -> (x, z, -y). Shape -y (bow) becomes +z, extrusion z becomes +y.
  g.rotateX(-Math.PI / 2);
  return { g, mat };
}

function aaGun(): Piece[] {
  const up = Math.PI / 2 - 0.95; // barrels raised about 55 degrees, pointing toward +z
  return [
    box(3.2, 0.3, 0.7, 0, 0.15, 0, 'dark', 0, Math.PI / 4),
    box(3.2, 0.3, 0.7, 0, 0.15, 0, 'dark', 0, -Math.PI / 4),
    cyl(0.75, 0.95, 0.5, 0, 0.5, 0, 'hull'),
    cyl(0.35, 0.45, 1.1, 0, 1.2, 0, 'hull'),
    box(1.5, 0.9, 1.3, 0, 1.9, -0.1, 'hull'),
    box(1.9, 1.3, 0.12, 0, 2.05, 0.55, 'hull', -0.35),
    cyl(0.09, 0.11, 3.6, -0.32, 3.1, 1.25, 'dark', up, 8),
    cyl(0.09, 0.11, 3.6, 0.32, 3.1, 1.25, 'dark', up, 8),
    cyl(0.16, 0.16, 0.5, -0.32, 2.25, 0.3, 'dark', up, 8),
    cyl(0.16, 0.16, 0.5, 0.32, 2.25, 0.3, 'dark', up, 8),
    box(0.5, 0.5, 0.9, 0.95, 1.5, -0.5, 'dark'),
  ];
}

function transport(): Piece[] {
  const pieces: Piece[] = [hull(28, 5.2, 2.6, 'hull')];
  pieces.push(box(4.6, 0.25, 22, 0, 2.7, 0.5, 'deck'));
  // bridge aft, funnel, three holds with cargo and two derricks forward
  pieces.push(box(4.2, 2.6, 4.2, 0, 4.1, -8.5, 'light'));
  pieces.push(box(3.4, 1.2, 3, 0, 6, -8.5, 'light'));
  pieces.push(cyl(0.7, 0.8, 2.6, 0, 7.6, -9.6, 'dark'));
  for (const z of [-2.5, 3.5, 8.5]) {
    pieces.push(box(3.4, 0.7, 3.6, 0, 3.15, z, 'dark'));
    pieces.push(box(1.5, 1.2, 2.2, -0.9, 4.1, z, 'deck'));
    pieces.push(box(1.5, 1.0, 2.2, 0.9, 4.0, z + 0.3, 'light'));
  }
  for (const z of [0.5, 6]) {
    pieces.push(cyl(0.14, 0.18, 5.2, 0, 5.4, z, 'dark', 0, 6));
    pieces.push(cyl(0.07, 0.07, 4.2, 0, 6.4, z + 1.5, 'dark', Math.PI / 2 - 0.75, 6));
  }
  pieces.push(box(0.5, 1.1, 0.5, 0, 3.4, 12.3, 'dark'));
  return pieces;
}

function factory(): Piece[] {
  const pieces: Piece[] = [box(16, 5, 10, 0, 2.5, 0, 'hull')];
  // sawtooth roof
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Shape();
    tooth.moveTo(-2, 0); tooth.lineTo(2, 0); tooth.lineTo(-2, 1.9); tooth.lineTo(-2, 0);
    const g = new THREE.ExtrudeGeometry(tooth, { depth: 10, bevelEnabled: false });
    g.translate(-6 + i * 4, 5, -5);
    pieces.push({ g, mat: 'deck' });
  }
  pieces.push(box(6, 3.2, 6, 10.5, 1.6, -1, 'light'));
  pieces.push(cyl(0.8, 1.05, 12, -5, 6, -6.2, 'dark', 0, 12));
  pieces.push(cyl(0.7, 0.95, 9.5, -1.5, 4.75, -6.4, 'dark', 0, 12));
  pieces.push(box(3, 2.4, 0.2, 2, 1.2, 5.05, 'dark'));
  for (let i = 0; i < 5; i++) pieces.push(box(1.4, 1, 0.12, -6.4 + i * 2.6, 3.4, 5.02, 'light'));
  return pieces;
}

function plainShape(key: string): Piece[] {
  const d = unitDomain(key);
  if (d === 'sea') {
    return [hull(24, 3.6, 2, 'hull'), box(2.6, 1.8, 7, 0, 3, -1, 'light'), cyl(0.5, 0.6, 2, 0, 4.8, -2, 'dark'), box(1.2, 0.8, 2.4, 0, 2.5, 6, 'dark'), box(1.2, 0.8, 2.4, 0, 2.5, -7, 'dark')];
  }
  if (d === 'air') {
    return [cyl(0.2, 0.5, 7, 0, 0.6, 0, 'hull', Math.PI / 2, 8), box(9, 0.16, 1.7, 0, 0.6, 0.6, 'hull'), box(3.2, 0.12, 1, 0, 0.7, -3, 'hull'), box(0.12, 1.2, 1, 0, 1.2, -3, 'hull')];
  }
  if (key === 'infantry') {
    return [cyl(0.28, 0.24, 0.9, 0, 1.25, 0, 'hull', 0, 8), cyl(0.2, 0.2, 0.8, -0.13, 0.4, 0, 'dark', 0, 6), cyl(0.2, 0.2, 0.8, 0.13, 0.4, 0, 'dark', 0, 6), cyl(0.17, 0.17, 0.3, 0, 1.85, 0, 'light', 0, 8), box(0.07, 0.07, 1.2, 0.2, 1.35, 0.45, 'dark')];
  }
  return [box(3, 1.2, 6, 0, 1, 0, 'hull'), box(2, 0.9, 2.6, 0, 2, -0.3, 'hull'), cyl(0.14, 0.14, 4, 0, 2.1, 2.6, 'dark', Math.PI / 2, 8), box(3.4, 0.7, 6.4, 0, 0.45, 0, 'dark')];
}

const PALETTE: Record<Tone, number> = { hull: 0x6c7076, dark: 0x2c2f33, deck: 0x56524a, light: 0x8d9094 };
const DESIGNED = new Set(['aaGun', 'transport', 'factory']);

export function standIn(key: string): UnitModel {
  const pieces = key === 'aaGun' ? aaGun() : key === 'transport' ? transport() : key === 'factory' ? factory() : plainShape(key);
  const byMat = new Map<Tone, THREE.BufferGeometry[]>();
  for (const p of pieces) {
    const flat = p.g.index ? p.g.toNonIndexed() : p.g;
    if (flat !== p.g) p.g.dispose();
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
    const list = byMat.get(p.mat) ?? [];
    list.push(flat);
    byMat.set(p.mat, list);
  }
  const bounds = new THREE.Box3();
  const merged: { g: THREE.BufferGeometry; mat: Tone }[] = [];
  for (const [mat, list] of byMat) {
    const g = mergeGeometries(list, false);
    for (const item of list) item.dispose();
    if (!g) continue;
    g.computeBoundingBox();
    bounds.union(g.boundingBox!);
    merged.push({ g, mat });
  }
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const k = (DIMS[key]?.size ?? 6) / (Math.max(size.x, size.y, size.z) || 1);
  const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -bounds.min.y, -centre.z));
  let triangles = 0;
  const parts: ModelPart[] = merged.map(({ g, mat }) => {
    g.applyMatrix4(fit);
    g.computeBoundingSphere();
    triangles += g.attributes.position.count / 3;
    return { geometry: g, material: new THREE.MeshStandardMaterial({ color: PALETTE[mat], roughness: 0.82, metalness: 0.1, flatShading: true }) };
  });
  return { parts, size: size.multiplyScalar(k), triangles, standIn: !DESIGNED.has(key) };
}
