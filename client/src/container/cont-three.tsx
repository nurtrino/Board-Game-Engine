// Shared 3D pieces for Container: used by the TV board and the 3D personal
// mat so both render the same physical objects (containers, extruded
// factory/warehouse tiles, ships, flat cards).

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import type { ContColor } from '@bge/shared';
import { CONT_COLORS } from '@bge/shared';
import { CONT_SCENE, CONT_PIECE_HEX, px2r, moneyDenoms, MAT_RW, MAT_RH } from './cont-scene';

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

/** container spots inside a printed board lot: art-px offsets from the lot's
 * open-area center plus a stack layer. Pieces lie lengthwise along the board
 * art's Y axis in a centered grid sized to the printed bays (factory slots fit
 * 3 x 2 per layer, the narrower harbor bays 2 x 2), then stack upward. */
export function lotSpots(kind: 'factory' | 'harbor', n: number): [number, number, number][] {
  return kind === 'factory' ? packGrid(n, 3, 130, 225, 6) : packGrid(n, 2, 150, 225, 4);
}

/** open-area center of a printed lot (art px): right of the illustrated label
 * column, below the harbor bays' label band (measured on the board art) */
export const lotCenter = (kind: 'factory' | 'harbor', at: [number, number]): [number, number] =>
  kind === 'factory' ? [at[0] + 105, 1448] : [at[0] + 100, 900];

/** yaw = direction of the ship's LONG axis in render space (0 = along X);
 *  the ship glides between spots so every sail reads on the table. */
/** the mod's own snap points on every boat: the 5 cargo slots, in mesh-local
 * coordinates (x across, z along the hull, deck at y = 0.1) */
const SHIP_SNAPS: { x: number; z: number }[] = [
  { x: 0.010, z: 1.021 }, { x: -0.007, z: 0.513 }, { x: -0.011, z: -0.010 },
  { x: -0.002, z: -0.525 }, { x: 0.000, z: -1.047 },
];
const SHIP_SNAP_Y = 0.1;

export function Ship({ seatColor, x, z, yaw, cargo = [], proto, children }: {
  seatColor: string; x: number; z: number; yaw: number;
  cargo?: ContColor[]; proto?: ContainerProto; children?: React.ReactNode;
}) {
  const obj = useLoader(OBJLoader, S.models.ship.mesh);
  const tex = useLoader(THREE.TextureLoader, S.models.ship.tex ?? '');
  const group = useRef<THREE.Group>(null);
  const { clone, scale, lift, alongX, mid, slots } = useMemo(() => {
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
    const lift = -bb.min.y * scale.y;
    // cargo slots = the mod's snap points, recentred like the hull; a snapped
    // container's CENTER lands on the snap (it sinks into the deck recess)
    const slots = SHIP_SNAPS.map((s) => new THREE.Vector3(
      (s.x - mid.x) * scale.x,
      (SHIP_SNAP_Y - bb.min.y) * scale.y + 0.02,
      (s.z - mid.z) * scale.z,
    ));
    return { clone: c, scale, lift, alongX, mid, slots };
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
        {proto && cargo.slice(0, SHIP_SNAPS.length).map((color, i) => (
          // crosswise in the recess: length across the beam (mesh x axis)
          <ContainerPiece key={i} color={color}
            x={slots[i].x} z={slots[i].z} y={slots[i].y - 0.3}
            yaw={0} proto={proto} />
        ))}
      </group>
      {children}
    </group>
  );
}

/** trace the largest opaque blob in a die-cut art image: returns the outline
 *  as [0..1]x[0..1] image coordinates (y down), simplified for extrusion */
function traceAlphaOutline(img: HTMLImageElement | ImageBitmap): [number, number][] | null {
  const MAX = 96;
  const k = MAX / Math.max(img.width, img.height);
  const W = Math.max(2, Math.round(img.width * k));
  const H = Math.max(2, Math.round(img.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, W, H);
  const a = ctx.getImageData(0, 0, W, H).data;
  const solid = (px: number, py: number) =>
    px >= 0 && py >= 0 && px < W && py < H && a[(py * W + px) * 4 + 3] > 48;
  // start at the topmost-left solid pixel, then walk the boundary
  // (Moore-neighbor tracing, clockwise)
  let sx = -1, sy = -1;
  outer: for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) if (solid(px, py)) { sx = px; sy = py; break outer; }
  }
  if (sx < 0) return null;
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const pts: [number, number][] = [];
  let cx = sx, cy = sy, dir = 6; // came from below-ish; start scanning upward
  for (let step = 0; step < W * H * 4; step++) {
    pts.push([cx, cy]);
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (dir + 6 + i) % 8; // turn right of the entry direction first
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (solid(nx, ny)) { cx = nx; cy = ny; dir = d; found = true; break; }
    }
    if (!found) break; // isolated pixel
    if (cx === sx && cy === sy && pts.length > 2) break;
  }
  if (pts.length < 8) return null;
  // simplify: drop points that barely bend (keeps the die-cut read, ~30 verts)
  const keep: [number, number][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i += 2) {
    const p = pts[i], prev = keep[keep.length - 1];
    if (!prev || Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) >= 2) keep.push(p);
  }
  return keep.map(([px, py]) => [px / W, py / H]);
}

/** the original flat die-cut art, extended down into a solid piece: the
 *  printed art on the top face, its silhouette extruded to the table with
 *  solid-colored sides (what the flat tokens looked like, with thickness) */
function DieCutPiece({ url, w, h, thickness, side, x, z, ry = 0, scale = 1 }: {
  url: string; w: number; h: number; thickness: number; side: string;
  x: number; z: number; ry?: number; scale?: number;
}) {
  const tex = useLoader(THREE.TextureLoader, url);
  const built = useMemo(() => {
    const outline = tex.image ? traceAlphaOutline(tex.image as HTMLImageElement) : null;
    const shape = new THREE.Shape();
    if (outline) {
      // image coords -> piece-local XY (art top = +y)
      outline.forEach(([u, v], i) => {
        const px = (u - 0.5) * w, py = (0.5 - v) * h;
        if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
      });
      shape.closePath();
    } else {
      // fallback: the full art rectangle
      shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2, -h / 2);
      shape.lineTo(w / 2, h / 2); shape.lineTo(-w / 2, h / 2);
      shape.closePath();
    }
    const geom = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    // lay it flat: shape plane -> table, extrusion -> up, art cap on top
    geom.rotateX(-Math.PI / 2);
    // the art texture UV-mapped over the caps (extrude UVs are shape coords)
    const capTex = tex.clone();
    capTex.colorSpace = THREE.SRGBColorSpace;
    capTex.anisotropy = 8;
    capTex.wrapS = capTex.wrapT = THREE.ClampToEdgeWrapping;
    capTex.repeat.set(1 / w, 1 / h);
    capTex.offset.set(0.5, 0.5);
    capTex.needsUpdate = true;
    const mats = [
      new THREE.MeshStandardMaterial({ map: capTex, roughness: 0.72, metalness: 0.03 }),
      new THREE.MeshStandardMaterial({ color: side, roughness: 0.7, metalness: 0.04 }),
    ]; // extrude groups: 0 = caps, 1 = swept sides
    return { geom, mats };
  }, [tex, url, w, h, thickness, side]);
  return (
    <group position={[x, 0.03, z]} rotation={[0, ry, 0]} scale={[scale, scale, scale]}>
      <mesh geometry={built.geom} material={built.mats} castShadow />
    </group>
  );
}

/** the mod's die-cut factory art, extended down into a 3D piece */
export function FactoryPiece({ color, x, z, ry = 0, scale = 1 }: {
  color: ContColor; x: number; z: number; ry?: number; scale?: number;
}) {
  const fa = S.factoryArt[color];
  const w = 1.15;
  return (
    <DieCutPiece url={fa.img} w={w} h={w * (fa.px[1] / fa.px[0])} thickness={0.3}
      side={CONT_PIECE_HEX[color]} x={x} z={z} ry={ry} scale={scale} />
  );
}

/** the mod's die-cut warehouse art, extended down into a 3D piece */
export function WarehousePiece({ x, z, ry = 0, scale = 1 }: {
  x: number; z: number; ry?: number; scale?: number;
}) {
  const w = 0.92;
  return (
    <DieCutPiece url={S.warehouseArt.img} w={w} h={w * (S.warehouseArt.px[1] / S.warehouseArt.px[0])}
      thickness={0.26} side="#b7b0a3" x={x} z={z} ry={ry} scale={scale} />
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

/** The water mat — the whole table surface, owner directive. */
export function ContWaterMat() {
  const tex = useLoader(THREE.TextureLoader, S.mat.img);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[MAT_RW, MAT_RH]} />
      <meshStandardMaterial map={tex} roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

/** money card stack for a bank cash lot amount; the top card fills the
 * printed card slot, the rest fan out slightly underneath */
export function ContCashStack({ amount, at }: { amount: number; at: [number, number] }) {
  const cards = useMemo(() => moneyDenoms(amount), [amount]);
  const [x, z] = px2r(at[0], at[1]);
  const W = 2.35, H = W * 1.4; // sized to the printed slot (~3.4 x 3.6 world)
  return (
    <group>
      {cards.map((d, i) => (
        <ContFlatImage key={i} url={S.cards.money[String(d)]} w={W} h={H}
          pos={[x + (i % 3) * 0.14 - 0.07, 0.04 + i * 0.012, z + Math.floor(i / 3) * 0.16 - 0.08]} ry={0} />
      ))}
    </group>
  );
}
