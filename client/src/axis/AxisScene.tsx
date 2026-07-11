// 3D renderer for Axis & Allies Anniversary. The world map is the mod's
// custom table texture (9500x4956) on a plane; pieces are the mod's own OBJ
// meshes (untextured, colored by the mod's per-nation tints). Render space
// is art-pixel space scaled by 0.01 with the usual mirrored z — at that
// scale one TTS world unit is ~1 render unit (worldFit |a|~108.6 px/unit),
// so the mod's mesh scales apply unchanged.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { useProgress } from '@react-three/drei';
import {
  AXIS_MAP, POWERS, CHINA_COLOR, enumerateAxisPhysicalPieces,
  type UnitStack, type PowerKey, type UnitKey,
} from '@bge/shared';
// region polygon helpers are imported lazily inside components (regions.ts
// imports SPACE_CENTER from this module — a static import would be a cycle)
type RegionsMod = typeof import('./regions');
let regionsMod: RegionsMod | null = null;
import('./regions').then((m) => { regionsMod = m; });

const S = 0.01;
export const ART_W = 9500;
export const ART_H = 4956;
// art px -> render x,z. The board plane's texture keeps the art upright with
// north away from the default camera; that puts the art's TOP row at z=-H*S
// and the BOTTOM row at z=0, so py maps to (py - ART_H) * S (not -py).
export const px2r = (px: number, py: number): [number, number] => [px * S, (py - 4956) * S];

const BOARD_Y = 0;

export interface AxisManifest {
  map: { image: string; full: string; artWidth: number; artHeight: number };
  units: { nation: string | null; unit: string; mesh: string; tint: number[] | null; scale: number }[];
  occupation: { nick: string; mesh: string; tint: number[] | null; scale: number }[];
}

let cachedManifest: AxisManifest | null = null;
export function useAxisManifest(): AxisManifest | null {
  const [m, setM] = useState<AxisManifest | null>(cachedManifest);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (cachedManifest) return;
    const controller = new AbortController();
    let retry: number | undefined;
    fetch('/axis/axis-manifest.json', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Axis manifest failed (${r.status})`);
        return r.json();
      })
      .then((j: AxisManifest) => {
        cachedManifest = j;
        setM(j);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('Axis assets did not load; retrying.', error);
        retry = window.setTimeout(() => setAttempt((n) => n + 1), 2500);
      });
    return () => {
      controller.abort();
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [attempt]);
  return m;
}

export function meshFor(manifest: AxisManifest, power: string | null, unit: string) {
  // China has no dedicated fighter OBJ in the source mod. The Flying Tigers
  // used American aircraft, so use the USA sculpt and keep the caller's China
  // tint instead of falling through to whichever nation's fighter loads first.
  const sculptPower = power === 'china' && unit === 'fighter' ? 'usa' : power;
  return manifest.units.find((u) => u.unit === unit && (u.nation === sculptPower || (u.nation == null && (unit === 'factory' || unit === 'aaGun'))))
    ?? manifest.units.find((u) => u.unit === unit);
}

// Piece colors follow the RULEBOOK (p9), not the mod's tints — the mod paints
// Italy and China the same white as the shared pieces, which is unreadable on
// the board (owner call). USA green, Germany gray, UK tan, Japan orange,
// USSR maroon, Italy brown, China light green; AA guns + ICs light gray.
const PIECE_TINT: Record<string, [number, number, number]> = {
  germany: [0.016, 0.016, 0.02], // black (charcoal so the shape still shades)
  ussr: [0.3, 0.055, 0.075], // maroon (deep, not pink)
  japan: [0.38, 0.08, 0.012], // dark ruddy orange
  uk: [0.79, 0.70, 0.49],
  italy: [0.08, 0.04, 0.02], // dark chocolate brown
  usa: [0.03, 0.085, 0.028], // dark forest green
  china: [0.66, 0.79, 0.50],
};
const NEUTRAL_PIECE_TINT: [number, number, number] = [0.76, 0.76, 0.76];
export function tintFor(power: string | null | undefined, unit?: string): [number, number, number] {
  // AA guns and industrial complexes are light gray and change hands
  // (rulebook p9) — never nation-colored
  if (unit === 'aaGun' || unit === 'factory') return NEUTRAL_PIECE_TINT;
  return PIECE_TINT[power ?? ''] ?? NEUTRAL_PIECE_TINT;
}

const SPACE_CENTER: Record<string, [number, number]> = {};
for (const t of AXIS_MAP.territories) SPACE_CENTER[t.id] = t.center as [number, number];
for (const z of AXIS_MAP.seaZones) SPACE_CENTER[z.id] = z.center as [number, number];
// printed-roundel anchors sit better than centroids for piece placement on
// the two long archipelagos (same values as the extraction tool)
SPACE_CENTER['new-guinea'] = [7500, 4050];
SPACE_CENTER['solomon-islands'] = [8290, 4230];
// the printed MOBILIZATION ZONE chart: purchases stage here for all to see
export const MOB_ZONE = { x0: 930, y0: 4160, x1: 1570, y1: 4790 };
SPACE_CENTER['mobilization'] = [(MOB_ZONE.x0 + MOB_ZONE.x1) / 2, (MOB_ZONE.y0 + MOB_ZONE.y1) / 2];
export { SPACE_CENTER };

/** Loading gate: true until every pending loader (map texture, unit meshes)
 * has finished at least once — the game waits behind a loading screen. */
export function useSceneReady(): boolean {
  const { active, progress } = useProgress();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready && !active && progress === 100) setReady(true);
  }, [active, progress, ready]);
  return ready;
}

function MapPlane({ onRegionTap }: { onRegionTap?: (id: string) => void }) {
  const { gl } = useThree();
  // The source scan is 9500×4956, which expands to roughly 180 MB in GPU
  // memory. The 4096px derivative still exceeds the rendered detail of a 4K
  // display while keeping the board responsive on integrated/mobile GPUs.
  const tex = useLoader(THREE.TextureLoader, '/axis/map-4096.jpg');
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  }, [tex, gl]);
  const w = ART_W * S, h = ART_H * S;
  return (
    <group>
      <mesh
        position={[w / 2, BOARD_Y, -h / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={onRegionTap ? (e) => {
          // world -> art px (inverse of px2r)
          const px = e.point.x / S;
          const py = e.point.z / S + ART_H;
          const id = regionsMod?.regionAt(px, py);
          if (id) { e.stopPropagation(); onRegionTap(id); }
        } : undefined}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.92} />
      </mesh>
      <mesh position={[w / 2, BOARD_Y - 0.06, -h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 1.8, h * 1.8]} />
        <meshStandardMaterial color="#04060a" roughness={1} />
      </mesh>
    </group>
  );
}

// Geometry normalization is expensive, so do it once per source mesh and share
// the immutable result across every on-board piece. Materials remain per piece
// so selection glow never leaks to another stack.
const normalizedGeometry = new Map<string, THREE.BufferGeometry>();

// One OBJ per (mesh URL, tint) — geometry cached by useLoader, materials per tint.
export function useAxisObj(url: string, tint: number[] | null) {
  const obj = useLoader(OBJLoader, url);
  return useMemo(() => {
    const c = obj.clone(true);
    const color = tint ? new THREE.Color(tint[0], tint[1], tint[2]) : new THREE.Color('#b9b9b9');
    const junk: THREE.Object3D[] = [];
    c.traverse((o) => {
      // stray line/point primitives in the sculpt OBJs render as white
      // wireframe shells — drop them
      if ((o as THREE.Line).isLine || (o as THREE.Points).isPoints) { junk.push(o); return; }
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry) {
        const source = m.geometry as THREE.BufferGeometry;
        let geometry = normalizedGeometry.get(source.uuid);
        if (!geometry) {
          const clean = source.clone();
          clean.deleteAttribute('normal');
          geometry = mergeVertices(clean);
          geometry.computeVertexNormals();
          normalizedGeometry.set(source.uuid, geometry);
        }
        m.geometry = geometry;
      }
      m.material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.12 });
    });
    for (const o of junk) o.parent?.remove(o);
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    const xSpan = box.max.x - box.min.x;
    const zSpan = box.max.z - box.min.z;
    return {
      clone: c,
      minY: box.min.y,
      midX: (box.min.x + box.max.x) / 2,
      midZ: (box.min.z + box.max.z) / 2,
      span: Math.max(xSpan, zSpan),
      // long-hulled sculpts (ships) are authored bow-along-Z; presenting them
      // broadside reads correctly from the high board camera
      broadside: zSpan > xSpan * 1.4,
    };
  }, [obj, tint]);
}

function UnitMesh({ url, tint, x, z, scale, rotY = 0, selected = false, damaged = false, onTap }: {
  url: string; tint: number[] | null; x: number; z: number; scale: number; rotY?: number;
  selected?: boolean; damaged?: boolean; onTap?: () => void;
}) {
  const { clone, minY, midX, midZ, span, broadside } = useAxisObj(url, tint);
  const ref = useRef<THREE.Group>(null);
  const materials = useMemo(() => {
    const out: THREE.MeshStandardMaterial[] = [];
    clone.traverse((o) => {
      const material = (o as THREE.Mesh).material;
      const list = Array.isArray(material) ? material : material ? [material] : [];
      for (const item of list) if ((item as THREE.MeshStandardMaterial).emissive) out.push(item as THREE.MeshStandardMaterial);
    });
    return out;
  }, [clone]);
  useEffect(() => () => {
    // This clone is mounted through <primitive>, so R3F does not own its
    // per-piece materials. Geometry is shared separately and stays cached.
    for (const material of materials) material.dispose();
  }, [materials]);
  useEffect(() => {
    if (selected) return;
    for (const material of materials) {
      if (damaged) material.emissive.setRGB(0.24, 0.035, 0.008);
      else material.emissive.setRGB(0, 0, 0);
    }
  }, [selected, damaged, materials]);
  // selection glow: pulse the emissive channel of every material (HOI4 pick)
  useFrame(({ clock }) => {
    if (!selected || !ref.current) return;
    const k = 0.45 + Math.sin(clock.elapsedTime * 5) * 0.25;
    for (const material of materials) material.emissive.setRGB(k, k * 0.82, k * 0.3);
  });
  // clamp footprint so stacks stay inside their territories at close zoom
  const s = Math.min(scale, span > 0 ? 1.7 / span : scale);
  return (
    <group
      ref={ref}
      position={[x, BOARD_Y - minY * s, z]}
      rotation={[0, rotY + (broadside ? Math.PI / 2 : 0), 0]}
      scale={[s, s, s]}
      onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
    >
      <primitive object={clone} position-x={-midX} position-z={-midZ} />
    </group>
  );
}

// count chip: a small canvas-rendered number on a disc
function CountChip({ n, x, z, lift = 0.02 }: { n: number; x: number; z: number; lift?: number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(10,12,16,0.92)';
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = '#f2eee2';
    g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [n]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[x, BOARD_Y + lift, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.42, 24]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

/** Small per-sculpt badge: damage and carried units must remain visually tied
 * to the same physical hull whose ordinal the controller taps. */
function PieceStatusChip({ label, tone, x, z, onTap }: {
  label: string;
  tone: 'damage' | 'cargo';
  x: number;
  z: number;
  onTap?: () => void;
}) {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = tone === 'damage' ? 'rgba(111,18,8,0.96)' : 'rgba(15,54,78,0.96)';
    g.beginPath();
    g.arc(64, 64, 59, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = tone === 'damage' ? '#ff9a65' : '#82d9ff';
    g.lineWidth = 8;
    g.stroke();
    g.fillStyle = '#fff8e8';
    g.font = 'bold 54px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 64, 67);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [label, tone]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh
      position={[x, BOARD_Y + 0.075, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={onTap ? (event) => { event.stopPropagation(); onTap(); } : undefined}
    >
      <circleGeometry args={[0.25, 20]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

// control roundel for territories held away from their printed owner
function ControlDisc({ power, x, z }: { power: string; x: number; z: number }) {
  const color = power === 'china' ? CHINA_COLOR : POWERS[power as PowerKey]?.color ?? '#888';
  return (
    <group>
      <mesh position={[x, BOARD_Y + 0.015, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 28]} />
        <meshStandardMaterial color="#101216" roughness={0.8} />
      </mesh>
      <mesh position={[x, BOARD_Y + 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 28]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
    </group>
  );
}

// layout: stacks in a space fan around the center; up to 3 meshes shown per
// stack with a count chip beside them when count > shown
const UNIT_ORDER = ['factory', 'aaGun', 'infantry', 'artillery', 'tank', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport'];
const pieceLayoutCache = new Map<string, [number, number][]>();

function pieceLayout(spaceId: string, count: number): [number, number][] {
  if (!regionsMod || count <= 0) return [];
  const key = `${spaceId}:${count}`;
  const cached = pieceLayoutCache.get(key);
  if (cached) return cached;
  const points = regionsMod.layoutPoints(spaceId, count, 118) as [number, number][];
  pieceLayoutCache.set(key, points);
  return points;
}

export function SpacePieces({ manifest, spaceId, stacks, selectedPieces, onUnitTap }: {
  manifest: AxisManifest; spaceId: string; stacks: UnitStack[];
  // Selection uses an available-piece ordinal within each power/unit type.
  selectedPieces?: Set<string>;
  onUnitTap?: (spaceId: string, power: string, key: string, ordinal: number) => void;
}) {
  const center = SPACE_CENTER[spaceId];
  if (!center) return null;
  const [cx, cz] = px2r(center[0], center[1]);
  const physical = enumerateAxisPhysicalPieces(stacks);
  const piecesByStack = new Map<number, typeof physical>();
  for (const piece of physical) {
    const group = piecesByStack.get(piece.stackIndex) ?? [];
    group.push(piece);
    piecesByStack.set(piece.stackIndex, group);
  }
  const ordered = stacks
    .map((stack, stackIndex) => ({ stack, stackIndex }))
    .sort((a, b) => UNIT_ORDER.indexOf(a.stack.key) - UNIT_ORDER.indexOf(b.stack.key));
  const total = ordered.reduce((n, item) => n + item.stack.count, 0);
  // every unit stands on the board (owner: no stacking unless the region
  // truly cannot fit them); the polygon layout keeps them inside the borders
  const MAX_PHYSICAL = 40;
  const want = Math.min(total, MAX_PHYSICAL);
  const polyPts = pieceLayout(spaceId, want);
  const roomFor = polyPts.length; // how many the printed borders can hold
  const cols = Math.max(2, Math.ceil(Math.sqrt(ordered.length)));
  const step = 0.95;
  let cursor = 0;
  return (
    <group>
      {ordered.map(({ stack: st, stackIndex }, i) => {
        const def = meshFor(manifest, st.power, st.key);
        if (!def?.mesh) return null;
        const stackKey = `${st.power}:${st.key}`;
        const stackPieces = piecesByStack.get(stackIndex) ?? [];
        // place each unit of the stack on its own point while room remains;
        // overflow collapses back to one sculpt + a count chip
        const slots: [number, number][] = [];
        while (slots.length < st.count && cursor < roomFor && cursor < MAX_PHYSICAL) {
          slots.push(px2r(polyPts[cursor][0], polyPts[cursor][1]));
          cursor++;
        }
        if (slots.length === 0) {
          const r = Math.floor(i / cols);
          const c = i % cols;
          slots.push([cx + (c - (cols - 1) / 2) * step, cz + (r - Math.floor((ordered.length - 1) / cols) / 2) * step]);
        }
        const overflow = st.count - slots.length;
        const [lx, lz] = slots[slots.length - 1];
        return (
          <group key={`${st.power}-${st.key}-${stackIndex}`}>
            {slots.map(([x, z], k) => {
              const piece = stackPieces[k];
              const ordinal = piece?.ordinal ?? null;
              const pieceKey = ordinal == null ? null : `${stackKey}:${ordinal}`;
              const tap = ordinal != null && onUnitTap
                ? () => onUnitTap(spaceId, st.power, st.key, ordinal)
                : undefined;
              const cargoCount = piece?.cargo?.reduce((sum, cargo) => sum + cargo.count, 0) ?? 0;
              return (
                <group key={k}>
                  <UnitMesh
                    url={def.mesh}
                    tint={tintFor(st.power, st.key)}
                    x={x}
                    z={z}
                    scale={def.scale ?? 1}
                    selected={pieceKey != null && (selectedPieces?.has(pieceKey) ?? false)}
                    damaged={piece?.damaged ?? false}
                    onTap={tap}
                  />
                  {piece?.damaged && <PieceStatusChip label="!" tone="damage" x={x - 0.38} z={z - 0.32} onTap={tap} />}
                  {cargoCount > 0 && (
                    <PieceStatusChip
                      label={`${st.key === 'carrier' ? 'F' : 'C'}${cargoCount}`}
                      tone="cargo"
                      x={x + 0.38}
                      z={z - 0.32}
                      onTap={tap}
                    />
                  )}
                </group>
              );
            })}
            {overflow > 0 && <CountChip n={overflow + 1} x={lx + 0.62} z={lz + 0.5} />}
          </group>
        );
      })}
    </group>
  );
}

// pulsing tap ring (Brass PickMark pattern): every legal tap is visible
function PickRing({ x, z, color = '#e8b450', onTap }: { x: number; z: number; color?: string; onTap?: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime * 2.2;
    const s = 1 + Math.sin(t) * 0.12;
    m.scale.set(s, s, s);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t) * 0.25;
  });
  return (
    <group>
      <mesh
        ref={ref}
        position={[x, BOARD_Y + 0.05, z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onTap?.(); }}
      >
        <ringGeometry args={[0.72, 1.02, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* generous invisible tap target */}
      <mesh
        position={[x, BOARD_Y + 0.04, z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onTap?.(); }}
        visible={false}
      >
        <circleGeometry args={[1.6, 16]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

// Elegant region highlight (owner: no blaring circles, no glowing pulse):
// a whisper of fill over the whole region plus a crisp traced border that
// breathes gently. Clicking anywhere inside picks the region.
function RegionFill({ id, color = '#e8b450', onTap }: { id: string; color?: string; onTap?: () => void }) {
  const parts = useMemo(() => {
    const rings = regionsMod?.ringsOf(id);
    if (!rings || rings.length === 0) return null;
    const fills: THREE.ShapeGeometry[] = [];
    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
    const outlines: THREE.Line[] = [];
    for (const ring of rings) {
      const shape = new THREE.Shape();
      const pts: THREE.Vector3[] = [];
      ring.forEach(([px, py]: [number, number], i: number) => {
        const [x, z] = px2r(px, py);
        // ShapeGeometry lives in XY; we rotate -90 about X so shape Y maps to -Z
        if (i === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
        pts.push(new THREE.Vector3(x, 0, z));
      });
      shape.closePath();
      fills.push(new THREE.ShapeGeometry(shape));
      pts.push(pts[0].clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      line.position.y = BOARD_Y + 0.04;
      outlines.push(line);
    }
    return { fills, outlines, lineMat };
  }, [id, color]);
  useFrame(({ clock }) => {
    if (parts) parts.lineMat.opacity = 0.72 + Math.sin(clock.elapsedTime * 1.6) * 0.18;
  });
  if (!parts) return null;
  return (
    <group>
      {parts.fills.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, BOARD_Y + 0.03, 0]}
          onClick={onTap ? (e) => { e.stopPropagation(); onTap(); } : undefined}
        >
          <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {parts.outlines.map((l, i) => <primitive key={`o${i}`} object={l} />)}
    </group>
  );
}

export interface SpacePick { id: string; color?: string }

export interface StagedStack { power: PowerKey; key: UnitKey; count: number }

/** Purchased units standing in the printed mobilization zone — every piece
 * physically present until the box runs out of room. */
function StagingPieces({ manifest, staged }: { manifest: AxisManifest; staged: StagedStack[] }) {
  const cols = 5;
  const rows = 4;
  const stepX = (MOB_ZONE.x1 - MOB_ZONE.x0) / cols;
  const stepY = (MOB_ZONE.y1 - MOB_ZONE.y0 - 160) / rows;
  const capacity = cols * rows;
  let slot = 0;
  return (
    <group>
      {staged.map((st) => {
        const def = meshFor(manifest, st.power, st.key);
        if (!def?.mesh) return null;
        const n = Math.min(st.count, Math.max(1, capacity - slot));
        const first = slot;
        slot += n;
        const overflow = st.count - n;
        const pos = (k: number): [number, number] => {
          const idx = Math.min(first + k, capacity - 1);
          const c = idx % cols;
          const r = Math.floor(idx / cols);
          return px2r(MOB_ZONE.x0 + stepX * (c + 0.5), MOB_ZONE.y0 + 130 + stepY * (r + 0.5));
        };
        const [lx, lz] = pos(n - 1);
        return (
          <group key={`${st.power}-${st.key}`}>
            {Array.from({ length: n }, (_, k) => {
              const [x, z] = pos(k);
              return <UnitMesh key={k} url={def.mesh} tint={tintFor(st.power, st.key)} x={x} z={z} scale={def.scale ?? 1} />;
            })}
            {overflow > 0 && <CountChip n={overflow + 1} x={lx + 0.62} z={lz + 0.4} />}
          </group>
        );
      })}
    </group>
  );
}

// HOI4-style order arrows: one per (origins -> target); branches from each
// origin merge into a trunk that flies to the target and ends in a head.
export interface OrderArrow { from: [number, number][]; to: [number, number]; color?: string } // art px points

function ArrowMesh({ arrow }: { arrow: OrderArrow }) {
  const color = arrow.color ?? '#e05555';
  const parts = useMemo(() => {
    const toR = (p: [number, number]) => { const [x, z] = px2r(p[0], p[1]); return new THREE.Vector3(x, 0.3, z); };
    const target = toR(arrow.to);
    const origins = arrow.from.map(toR);
    if (origins.length === 0) return null;
    const centroid = origins.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / origins.length);
    const span = centroid.distanceTo(target);
    const arc = Math.min(1.4, 0.45 + span * 0.05); // long throws arc higher
    const joint = centroid.clone().lerp(target, 0.4).setY(arc);
    const lift = (v: THREE.Vector3, h: number) => v.clone().setY(h);
    // smooth branch curves from each origin into the joint, then one trunk
    // that dives onto the target; each drawn twice (dark under-stroke +
    // bright core) so the arrow reads crisply over any map color
    const branches: THREE.CatmullRomCurve3[] = [];
    for (const o of origins) {
      const mid = o.clone().lerp(joint, 0.55).setY(arc * 0.85 + 0.2);
      branches.push(new THREE.CatmullRomCurve3([lift(o, 0.22), mid, joint], false, 'centripetal'));
    }
    const headTip = lift(target, 0.26);
    const headBase = joint.clone().lerp(headTip, 0.82);
    const trunkMid = joint.clone().lerp(headBase, 0.5).setY(arc + 0.25);
    const trunk = new THREE.CatmullRomCurve3([joint, trunkMid, headBase], false, 'centripetal');
    const trunkR = origins.length > 1 ? 0.24 : 0.18;
    const geo = (c: THREE.CatmullRomCurve3, r: number) => new THREE.TubeGeometry(c, 48, r, 12, false);
    const core: THREE.TubeGeometry[] = [...branches.map((b) => geo(b, 0.13)), geo(trunk, trunkR)];
    const under: THREE.TubeGeometry[] = [...branches.map((b) => geo(b, 0.19)), geo(trunk, trunkR + 0.06)];
    const dir = headTip.clone().sub(headBase).normalize();
    return { core, under, headBase, dir, headR: trunkR + 0.26 };
  }, [JSON.stringify(arrow)]);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 2.4) * 0.18;
  });
  if (!parts) return null;
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), parts.dir);
  return (
    <group renderOrder={5}>
      {parts.under.map((g, i) => (
        <mesh key={`u${i}`} geometry={g} renderOrder={4}>
          <meshBasicMaterial color="#0a0c10" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
      {parts.core.map((g, i) => (
        <mesh key={i} geometry={g} renderOrder={5}>
          <meshStandardMaterial ref={i === 0 ? matRef : undefined} color={color} emissive={color} emissiveIntensity={0.55} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={parts.headBase} quaternion={quat} renderOrder={4}>
        <coneGeometry args={[parts.headR + 0.08, 1.16, 20]} />
        <meshBasicMaterial color="#0a0c10" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh position={parts.headBase} quaternion={quat} renderOrder={5}>
        <coneGeometry args={[parts.headR, 1.1, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  );
}

export interface FocusTarget { x: number; z: number; dist: number }

/** Orbit camera with a drivable focus: set `focus` to fly the camera there. */
function Rig({ focus, fixedFrame = false }: { focus: FocusTarget | null; fixedFrame?: boolean }) {
  const ref = useRef<OrbitControlsImpl>(null);
  const goal = useRef<FocusTarget | null>(null);
  const destination = useRef(new THREE.Vector3());
  useEffect(() => { goal.current = focus; }, [focus]);
  useFrame(({ camera }) => {
    const g = goal.current;
    const ctl = ref.current;
    if (!g || !ctl) return;
    const t = ctl.target;
    const target = destination.current;
    target.set(g.x, 0, g.z);
    t.lerp(target, 0.06);
    target.set(g.x + 0.0001, g.dist, g.z + g.dist * 0.55);
    camera.position.lerp(target, 0.05);
    ctl.update();
    if (camera.position.distanceTo(target) < 0.4) goal.current = null;
  });
  return (
    <OrbitControls
      ref={ref}
      target={[ART_W * S / 2, 0, -ART_H * S / 2]}
      enableDamping
      enableRotate={!fixedFrame}
      enablePan={!fixedFrame}
      enableZoom={!fixedFrame}
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={110}
      maxPolarAngle={Math.PI * 0.46}
    />
  );
}

export function AxisTable({ manifest, board, control, focus, picks, onPick, staged, arrows, selectedPieces, onUnitTap, onRegionTap, paused, fixedFrame, children }: {
  manifest: AxisManifest;
  board: Record<string, UnitStack[]>;
  control: Record<string, PowerKey | 'china' | null>;
  focus: FocusTarget | null;
  picks?: SpacePick[];
  onPick?: (id: string) => void;
  staged?: StagedStack[];
  arrows?: OrderArrow[];
  selectedPieces?: Record<string, Set<string>>; // spaceId -> individual piece ids glowing
  onUnitTap?: (spaceId: string, power: string, key: string, ordinal: number) => void;
  onRegionTap?: (id: string) => void; // tap anywhere inside a region
  paused?: boolean;
  /** Personal devices use guided camera flights with no manual orbit. */
  fixedFrame?: boolean;
  children?: React.ReactNode;
}) {
  const occupied = useMemo(() => {
    const out: { id: string; power: string }[] = [];
    for (const t of AXIS_MAP.territories) {
      const holder = control[t.id];
      if (holder && holder !== (t.originalOwner ?? null)) out.push({ id: t.id, power: holder });
    }
    return out;
  }, [control]);
  return (
    <Canvas
      frameloop={paused ? 'never' : 'always'}
      camera={{ position: [ART_W * S / 2, 66, 12], fov: 40 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, background: '#04060a' }}
      onCreated={({ scene }) => { (window as unknown as { __scene?: unknown }).__scene = scene; }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[30, 70, 25]} intensity={1.4} />
      <directionalLight position={[-25, 50, -30]} intensity={0.45} />
      <Suspense fallback={null}>
        <MapPlane onRegionTap={onRegionTap} />
        {occupied.map(({ id, power }) => {
          const c = SPACE_CENTER[id];
          if (!c) return null;
          const [x, z] = px2r(c[0], c[1] - 130);
          return <ControlDisc key={id} power={power} x={x} z={z} />;
        })}
        {Object.entries(board).map(([spaceId, stacks]) =>
          stacks.length ? (
            <SpacePieces
              key={spaceId}
              manifest={manifest}
              spaceId={spaceId}
              stacks={stacks}
              selectedPieces={selectedPieces?.[spaceId]}
              onUnitTap={onUnitTap}
            />
          ) : null,
        )}
        {(arrows ?? []).map((a, i) => <ArrowMesh key={i} arrow={a} />)}
        {staged && staged.length > 0 && <StagingPieces manifest={manifest} staged={staged} />}
        {(picks ?? []).map((p) => {
          if (regionsMod?.ringsOf(p.id)?.length) {
            return <RegionFill key={p.id} id={p.id} color={p.color} onTap={() => onPick?.(p.id)} />;
          }
          const c = SPACE_CENTER[p.id];
          if (!c) return null;
          const [x, z] = px2r(c[0], c[1]);
          return <PickRing key={p.id} x={x} z={z} color={p.color} onTap={() => onPick?.(p.id)} />;
        })}
        {children}
      </Suspense>
      <Rig focus={focus} fixedFrame={fixedFrame} />
    </Canvas>
  );
}
