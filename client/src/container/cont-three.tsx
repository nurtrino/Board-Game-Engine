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

/** An extruded building tile: the printed token art on the top face of a
 * chunky colored slab (the 2026 edition's factories and warehouses are real
 * 3D pieces; the mod only carried the flat die-cut art). */
export function TokenPiece({ url, w, h, x, z, y = 0, thickness, side, ry = 0 }: {
  url: string; w: number; h: number; x: number; z: number; y?: number;
  thickness: number; side: string; ry?: number;
}) {
  const tex = useLoader(THREE.TextureLoader, url);
  const mats = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const sideMat = new THREE.MeshStandardMaterial({ color: side, roughness: 0.7, metalness: 0.05 });
    const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.02, transparent: true, alphaTest: 0.25 });
    const underTop = new THREE.MeshStandardMaterial({ color: side, roughness: 0.75 });
    // box faces: +x, -x, +y (top), -y, +z, -z
    return { order: [sideMat, sideMat, topMat, sideMat, sideMat, sideMat], underTop };
  }, [tex, side]);
  return (
    <group position={[x, y + thickness / 2 + 0.03, z]} rotation={[0, ry, 0]}>
      {/* slab slightly inset so the die-cut art edge reads as a beveled top */}
      <mesh material={mats.order}>
        <boxGeometry args={[w, thickness, h]} />
      </mesh>
    </group>
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
    // authentic piece footprint measured from the mod's supply stacks:
    // 1.38 long x 0.62 wide x 0.54 high
    const scale = new THREE.Vector3(
      1.38 / (size.x || 1),
      0.54 / (size.y || 1),
      0.62 / (size.z || 1),
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
export function Ship({ seatColor, x, z, yaw, size = 4.6, children }: {
  seatColor: string; x: number; z: number; yaw: number; size?: number; children?: React.ReactNode;
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
    const long = Math.max(sz.x, sz.z) || 1;
    const s = size / long; // the mod ship footprint (scale 1.1/1.2 ~ 4.6 long)
    // the OBJ's origin is off-center: recentre by the bbox midpoint or the
    // hull lands beside its target, in a direction that rotates with the yaw
    const mid = new THREE.Vector3((bb.min.x + bb.max.x) / 2, 0, (bb.min.z + bb.max.z) / 2);
    return { clone: c, scale: s, lift: -bb.min.y * s, alongX: sz.x >= sz.z, mid };
  }, [obj, tex, seatColor, size]);
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
        <primitive object={clone} position={[-mid.x * scale, lift + 0.02, -mid.z * scale]}
          scale={[scale, scale, scale]} />
      </group>
      {children}
    </group>
  );
}

/** the mod's per-color factory art with a chunky slab body */
export function FactoryPiece({ color, x, z, ry = 0, scale = 1 }: {
  color: ContColor; x: number; z: number; ry?: number; scale?: number;
}) {
  const fa = S.factoryArt[color];
  const w = 1.15 * scale;
  return (
    <TokenPiece url={fa.img} w={w} h={w * (fa.px[1] / fa.px[0])} x={x} z={z}
      thickness={0.34 * scale} side={CONT_PIECE_HEX[color]} ry={ry} />
  );
}

export function WarehousePiece({ x, z, ry = 0, scale = 1 }: {
  x: number; z: number; ry?: number; scale?: number;
}) {
  const w = 0.92 * scale;
  return (
    <TokenPiece url={S.warehouseArt.img} w={w} h={w * (S.warehouseArt.px[1] / S.warehouseArt.px[0])} x={x} z={z}
      thickness={0.3 * scale} side="#b7b0a3" ry={ry} />
  );
}
