// Shared 3D pieces for Container: used by the TV board and the 3D personal
// mat so both render the same physical objects (containers, extruded
// factory/warehouse tiles, ships, flat cards).

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import type { ContColor } from '@bge/shared';
import { CONT_COLORS } from '@bge/shared';
import { CONT_SCENE, CONT_PIECE_HEX } from './cont-scene';

const S = CONT_SCENE;

export function ContFlatImage({ url, w, h, pos, ry = 0, opacity = 1, alphaTest = 0.05 }: {
  url: string; w: number; h: number; pos: [number, number, number]; ry?: number; opacity?: number; alphaTest?: number;
}) {
  const tex = useLoader(THREE.TextureLoader, url);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, ry]} position={pos}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.88} metalness={0.02} transparent opacity={opacity} alphaTest={alphaTest} side={THREE.DoubleSide} />
    </mesh>
  );
}

export interface ContainerProto {
  geom: THREE.BufferGeometry;
  mats: Partial<Record<ContColor, THREE.Material>>;
  scale: THREE.Vector3;
  lift: number;
  height: number;
  alongX: boolean;
}

/** cached OBJ + per-color materials for the container pieces */
export function useContainerProto(): ContainerProto {
  const obj = useLoader(OBJLoader, S.models.container.mesh);
  const texes = useLoader(THREE.TextureLoader, CONT_COLORS.map((c) => S.models.container.tex[c]));
  return useMemo(() => {
    const geoms: THREE.BufferGeometry[] = [];
    obj.traverse((m) => { if ((m as THREE.Mesh).isMesh) geoms.push((m as THREE.Mesh).geometry); });
    // canonicalize the mesh axes: length -> X, height -> Y, width -> Z
    // (the OBJ is authored with its long axis vertical, so raw per-axis
    // scaling stood the pieces on end)
    const geom = geoms[0].clone();
    const measure = () => {
      geom.computeBoundingBox();
      const s = new THREE.Vector3();
      geom.boundingBox!.getSize(s);
      return s;
    };
    let size = measure();
    const dims = [size.x, size.y, size.z];
    const longIdx = dims.indexOf(Math.max(...dims));
    if (longIdx === 1) geom.rotateZ(Math.PI / 2);
    else if (longIdx === 2) geom.rotateY(Math.PI / 2);
    size = measure();
    // a container is wider than it is tall: keep the smaller of the two
    // remaining dimensions as the height
    if (size.y > size.z) geom.rotateX(Math.PI / 2);
    geom.center();
    size = measure();
    // authentic piece size = mesh bbox x the mod's own scale (0.225/0.36/0.081):
    // 1.125 long x 0.567 wide x 0.54 high — small enough to clip onto the ship
    const scale = new THREE.Vector3(
      1.125 / (size.x || 1),
      0.54 / (size.y || 1),
      0.567 / (size.z || 1),
    );
    const mats: Partial<Record<ContColor, THREE.Material>> = {};
    CONT_COLORS.forEach((c, i) => {
      const t = texes[i];
      t.colorSpace = THREE.SRGBColorSpace;
      mats[c] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide });
    });
    const lift = 0.27; // centered geometry: half the piece height
    const height = 0.54;
    return { geom, mats, scale, lift, height, alongX: true };
  }, [obj, texes]);
}

export function ContainerPiece({ color, x, z, y = 0, yaw = 0, proto }: {
  color: ContColor; x: number; z: number; y?: number; yaw?: number; proto: ContainerProto;
}) {
  return (
    <mesh geometry={proto.geom} material={proto.mats[color]}
      position={[x, proto.lift + y + 0.03, z]}
      rotation={[0, yaw + (proto.alongX ? 0 : Math.PI / 2), 0]}
      scale={[proto.scale.x, proto.scale.y, proto.scale.z]} castShadow />
  );
}

/** grid layout for n containers around an anchor: rows x cols, then layers */
export function packGrid(n: number, cols: number, dx: number, dz: number, perLayer: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(i / perLayer);
    const j = i % perLayer;
    const row = Math.floor(j / cols), col = j % cols;
    out.push([(col - (cols - 1) / 2) * dx, (row - (Math.ceil(perLayer / cols) - 1) / 2) * dz, layer]);
  }
  return out;
}

/** yaw = direction of the ship's LONG axis in render space (0 = along X);
 *  the ship glides between spots so every sail reads on the table. */
export function Ship({ seatColor, x, z, yaw, children }: {
  seatColor: string; x: number; z: number; yaw: number; children?: React.ReactNode;
}) {
  const obj = useLoader(OBJLoader, S.models.ship.mesh);
  const tex = useLoader(THREE.TextureLoader, S.models.ship.tex ?? '');
  const group = useRef<THREE.Group>(null);
  const { clone, scale, lift, alongX, mid } = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const c = obj.clone(true);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, color: S.shipTint[seatColor] ?? '#888', roughness: 0.55, metalness: 0.1,
    });
    c.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) { (m as THREE.Mesh).material = mat; (m as THREE.Mesh).castShadow = true; }
    });
    const bb = new THREE.Box3().setFromObject(c);
    const sz = new THREE.Vector3();
    bb.getSize(sz);
    // authentic hull = mesh bbox x the mod's own scale (1.1, 1.2, 1.2):
    // 5.91 long, 1.27 beam, 1.73 high — the containers clip onto its deck
    const alongX = sz.x >= sz.z;
    const scale = new THREE.Vector3(
      (alongX ? 5.909 : 1.265) / (sz.x || 1),
      1.728 / (sz.y || 1),
      (alongX ? 1.265 : 5.909) / (sz.z || 1),
    );
    // the OBJ's origin is off-center: recentre by the bbox midpoint or the
    // hull lands beside its target, in a direction that rotates with the yaw
    const mid = new THREE.Vector3((bb.min.x + bb.max.x) / 2, 0, (bb.min.z + bb.max.z) / 2);
    return { clone: c, scale, lift: -bb.min.y * scale.y, alongX, mid };
  }, [obj, tex, seatColor]);
  // glide to the target spot instead of teleporting (visual placement)
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const k = Math.min(1, dt * 2.2);
    g.position.x += (x - g.position.x) * k;
    g.position.z += (z - g.position.z) * k;
  });
  return (
    <group ref={group} position={[x, 0, z]}>
      <group rotation={[0, yaw + (alongX ? 0 : Math.PI / 2), 0]}>
        <primitive object={clone}
          position={[-mid.x * scale.x, lift + 0.02, -mid.z * scale.z]}
          scale={[scale.x, scale.y, scale.z]} />
      </group>
      {children}
    </group>
  );
}

/** extrude a 2D outline (XY, meters) into a depth-D solid centered on Z */
function useExtruded(points: [number, number][], depth: number): THREE.ExtrudeGeometry {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (const [px, py] of points.slice(1)) shape.lineTo(px, py);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
    // the outlines are static per piece type
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** a real little factory: hall in the piece's bright color, dark sawtooth
 *  roof with white skylight ridges, brick smokestack — the 2026 edition's
 *  molded building, not a flat die-cut */
export function FactoryPiece({ color, x, z, ry = 0, scale = 1 }: {
  color: ContColor; x: number; z: number; ry?: number; scale?: number;
}) {
  const W = 0.92, D = 0.6, BH = 0.3, TH = 0.18; // hall height + roof tooth height
  const roof = useExtruded([
    [-W / 2, BH], [W / 2, BH], [W / 2, BH + TH], [0.02, BH + 0.02],
    [0.02, BH + TH], [-W / 2 + 0.02, BH + 0.02],
  ], D);
  const hex = CONT_PIECE_HEX[color];
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.05 }),
    roof: new THREE.MeshStandardMaterial({ color: '#565e68', roughness: 0.62, metalness: 0.08 }),
    glass: new THREE.MeshStandardMaterial({ color: '#eef2f6', roughness: 0.3, metalness: 0.1 }),
    stack: new THREE.MeshStandardMaterial({ color: '#6b5a4e', roughness: 0.72 }),
  }), [hex]);
  return (
    <group position={[x, 0.03, z]} rotation={[0, ry, 0]} scale={[scale, scale, scale]}>
      <mesh material={mats.body} position={[0, BH / 2, 0]} castShadow>
        <boxGeometry args={[W, BH, D]} />
      </mesh>
      <mesh geometry={roof} material={mats.roof} castShadow />
      {/* skylight ridges proud of each roof tooth, so the glass reads from
       *  the TV's high camera as the classic white sawtooth stripes */}
      <mesh material={mats.glass} position={[W / 2 - 0.02, BH + TH / 2 + 0.02, 0]}>
        <boxGeometry args={[0.055, TH, D - 0.1]} />
      </mesh>
      <mesh material={mats.glass} position={[0.02, BH + TH / 2 + 0.02, 0]}>
        <boxGeometry args={[0.055, TH, D - 0.1]} />
      </mesh>
      <mesh position={[-W / 2 + 0.12, BH + 0.2, D / 2 - 0.14]} material={mats.stack} castShadow>
        <cylinderGeometry args={[0.06, 0.075, 0.44, 10]} />
      </mesh>
    </group>
  );
}

/** a gabled warehouse shed: cream corrugated walls, slate roof with a ridge */
export function WarehousePiece({ x, z, ry = 0, scale = 1 }: {
  x: number; z: number; ry?: number; scale?: number;
}) {
  const W = 0.86, D = 0.58, BH = 0.3, RH = 0.16;
  const roof = useExtruded([
    [-W / 2 - 0.05, BH], [W / 2 + 0.05, BH], [0, BH + RH],
  ], D + 0.08);
  const mats = useMemo(() => ({
    wall: new THREE.MeshStandardMaterial({ color: '#e3dccb', roughness: 0.75, metalness: 0.02 }),
    door: new THREE.MeshStandardMaterial({ color: '#8a94a0', roughness: 0.55, metalness: 0.12 }),
    roof: new THREE.MeshStandardMaterial({ color: '#6f7780', roughness: 0.58, metalness: 0.08 }),
  }), []);
  return (
    <group position={[x, 0.03, z]} rotation={[0, ry, 0]} scale={[scale, scale, scale]}>
      <mesh material={mats.wall} position={[0, BH / 2, 0]} castShadow>
        <boxGeometry args={[W, BH, D]} />
      </mesh>
      {/* roller door on the long face */}
      <mesh material={mats.door} position={[0, 0.11, D / 2 + 0.005]}>
        <boxGeometry args={[0.34, 0.22, 0.02]} />
      </mesh>
      <mesh geometry={roof} material={mats.roof} castShadow />
    </group>
  );
}

/** the round bank auction token as the physical piece: a chunky cylinder with
 *  the printed face up, seated on a lot's printed circle */
export function AuctionToken({ x, z, y = 0 }: { x: number; z: number; y?: number }) {
  const tex = useLoader(THREE.TextureLoader, S.auctionTokenArt.img);
  const mats = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.center.set(0.5, 0.5);
    const side = new THREE.MeshStandardMaterial({ color: '#a3937a', roughness: 0.6, metalness: 0.05 });
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.03 });
    const bottom = new THREE.MeshStandardMaterial({ color: '#8d7f69', roughness: 0.7 });
    return [side, top, bottom]; // cylinder faces: side, top, bottom
  }, [tex]);
  const R = 0.55, H = 0.15;
  return (
    <mesh position={[x, y + H / 2 + 0.03, z]} material={mats} castShadow>
      <cylinderGeometry args={[R, R, H, 36]} />
    </mesh>
  );
}
