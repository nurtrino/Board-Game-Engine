// 3D renderer for Axis & Allies Anniversary. The world map is the mod's
// custom table texture (9500x4956) on a plane; pieces are the mod's own OBJ
// meshes (untextured, colored by the mod's per-nation tints). Render space
// is art-pixel space scaled by 0.01 with the usual mirrored z — at that
// scale one TTS world unit is ~1 render unit (worldFit |a|~108.6 px/unit),
// so the mod's mesh scales apply unchanged.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { useProgress } from '@react-three/drei';
import { AXIS_MAP, POWERS, CHINA_COLOR, type UnitStack, type PowerKey, type UnitKey } from '@bge/shared';
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
  useEffect(() => {
    if (cachedManifest) return;
    fetch('/axis/axis-manifest.json').then((r) => r.json()).then((j) => { cachedManifest = j; setM(j); });
  }, []);
  return m;
}

export function meshFor(manifest: AxisManifest, power: string | null, unit: string) {
  return manifest.units.find((u) => u.unit === unit && (u.nation === power || (u.nation == null && (unit === 'factory' || unit === 'aaGun'))))
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
export function tintFor(power: string | null | undefined, unit?: string): [number, number, number] {
  // AA guns and industrial complexes are light gray and change hands
  // (rulebook p9) — never nation-colored
  if (unit === 'aaGun' || unit === 'factory') return [0.76, 0.76, 0.76];
  return PIECE_TINT[power ?? ''] ?? [0.76, 0.76, 0.76];
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
  const tex = useLoader(THREE.TextureLoader, '/axis/map.jpg');
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; }, [tex]);
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
        m.geometry.deleteAttribute('normal');
        m.geometry = mergeVertices(m.geometry);
        m.geometry.computeVertexNormals();
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

function UnitMesh({ url, tint, x, z, scale, rotY = 0, selected = false, onTap }: {
  url: string; tint: number[] | null; x: number; z: number; scale: number; rotY?: number;
  selected?: boolean; onTap?: () => void;
}) {
  const { clone, minY, midX, midZ, span, broadside } = useAxisObj(url, tint);
  const ref = useRef<THREE.Group>(null);
  // selection glow: pulse the emissive channel of every material (HOI4 pick)
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const k = selected ? 0.45 + Math.sin(clock.elapsedTime * 5) * 0.25 : 0;
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.emissive) {
        m.emissive.setRGB(k, k * 0.82, k * 0.3);
      }
    });
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
  return (
    <mesh position={[x, BOARD_Y + lift, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.42, 24]} />
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

export function SpacePieces({ manifest, spaceId, stacks, selectedKeys, onStackTap }: {
  manifest: AxisManifest; spaceId: string; stacks: UnitStack[];
  // selection: set of `${power}:${key}` stack keys that glow
  selectedKeys?: Set<string>;
  onStackTap?: (spaceId: string, power: string, key: string) => void;
}) {
  const center = SPACE_CENTER[spaceId];
  if (!center) return null;
  const [cx, cz] = px2r(center[0], center[1]);
  const ordered = [...stacks].sort((a, b) => UNIT_ORDER.indexOf(a.key) - UNIT_ORDER.indexOf(b.key));
  const cols = Math.max(2, Math.ceil(Math.sqrt(ordered.length)));
  const step = 0.95;
  // polygon layout keeps every stack inside its printed borders, no overlap
  const polyPts = regionsMod ? regionsMod.layoutPoints(spaceId, ordered.length, 128) : [];
  return (
    <group>
      {ordered.map((st, i) => {
        const def = meshFor(manifest, st.power, st.key);
        if (!def?.mesh) return null;
        let x: number;
        let z: number;
        if (polyPts[i]) {
          [x, z] = px2r(polyPts[i][0], polyPts[i][1]);
        } else {
          const r = Math.floor(i / cols);
          const c = i % cols;
          x = cx + (c - (cols - 1) / 2) * step;
          z = cz + (r - Math.floor((ordered.length - 1) / cols) / 2) * step;
        }
        const shown = 1; // one sculpt per stack; the count chip carries the number
        const stackKey = `${st.power}:${st.key}`;
        return (
          <group key={`${st.power}-${st.key}-${i}`}>
            {Array.from({ length: shown }, (_, k) => (
              <UnitMesh
                key={k}
                url={def.mesh}
                tint={tintFor(st.power, st.key)}
                x={x + k * 0.42}
                z={z - k * 0.18}
                scale={def.scale ?? 1}
                selected={selectedKeys?.has(stackKey) ?? false}
                onTap={onStackTap ? () => onStackTap(spaceId, st.power, st.key) : undefined}
              />
            ))}
            {st.count > shown && <CountChip n={st.count} x={x + 0.62} z={z + 0.5} />}
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

export interface SpacePick { id: string; color?: string }

export interface StagedStack { power: PowerKey; key: UnitKey; count: number }

/** Purchased units standing in the printed mobilization zone. */
function StagingPieces({ manifest, staged }: { manifest: AxisManifest; staged: StagedStack[] }) {
  const cols = 4;
  const stepX = (MOB_ZONE.x1 - MOB_ZONE.x0) / cols;
  return (
    <group>
      {staged.map((st, i) => {
        const def = meshFor(manifest, st.power, st.key);
        if (!def?.mesh) return null;
        const c = i % cols;
        const r = Math.floor(i / cols);
        const px = MOB_ZONE.x0 + stepX * (c + 0.5);
        const py = MOB_ZONE.y0 + 150 + r * 160;
        const [x, z] = px2r(px, py);
        return (
          <group key={`${st.power}-${st.key}`}>
            <UnitMesh url={def.mesh} tint={tintFor(st.power, st.key)} x={x} z={z} scale={def.scale ?? 1} />
            {st.count > 1 && <CountChip n={st.count} x={x + 0.62} z={z + 0.4} />}
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
    const toR = (p: [number, number]) => { const [x, z] = px2r(p[0], p[1]); return new THREE.Vector3(x, 0.35, z); };
    const target = toR(arrow.to);
    const origins = arrow.from.map(toR);
    if (origins.length === 0) return null;
    const centroid = origins.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / origins.length);
    const joint = centroid.clone().lerp(target, 0.35).setY(0.55);
    const lift = (v: THREE.Vector3, h: number) => v.clone().setY(h);
    const tubes: THREE.TubeGeometry[] = [];
    for (const o of origins) {
      const mid = o.clone().lerp(joint, 0.5).setY(0.9);
      const curve = new THREE.CatmullRomCurve3([lift(o, 0.25), mid, joint]);
      tubes.push(new THREE.TubeGeometry(curve, 18, 0.16, 8, false));
    }
    const headBase = joint.clone().lerp(lift(target, 0.3), 0.86);
    const trunkMid = joint.clone().lerp(headBase, 0.5).setY(1.1);
    const trunk = new THREE.CatmullRomCurve3([joint, trunkMid, headBase]);
    tubes.push(new THREE.TubeGeometry(trunk, 22, origins.length > 1 ? 0.26 : 0.2, 8, false));
    const dir = lift(target, 0.3).clone().sub(headBase).normalize();
    return { tubes, headBase, dir };
  }, [JSON.stringify(arrow)]);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = 0.75 + Math.sin(clock.elapsedTime * 3.4) * 0.2;
  });
  if (!parts) return null;
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), parts.dir);
  return (
    <group renderOrder={5}>
      {parts.tubes.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial ref={i === 0 ? matRef : undefined} color={color} emissive={color} emissiveIntensity={0.55} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={parts.headBase} quaternion={quat}>
        <coneGeometry args={[0.55, 1.2, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.92} depthWrite={false} />
      </mesh>
    </group>
  );
}

export interface FocusTarget { x: number; z: number; dist: number }

/** Orbit camera with a drivable focus: set `focus` to fly the camera there. */
function Rig({ focus }: { focus: FocusTarget | null }) {
  const ref = useRef<OrbitControlsImpl>(null);
  const goal = useRef<FocusTarget | null>(null);
  useEffect(() => { goal.current = focus; }, [focus]);
  useFrame(({ camera }) => {
    const g = goal.current;
    const ctl = ref.current;
    if (!g || !ctl) return;
    const t = ctl.target;
    t.lerp(new THREE.Vector3(g.x, 0, g.z), 0.06);
    const dir = new THREE.Vector3().subVectors(camera.position, t);
    const targetPos = new THREE.Vector3(g.x + 0.0001, g.dist, g.z + g.dist * 0.55);
    camera.position.lerp(targetPos, 0.05);
    void dir;
    ctl.update();
    if (camera.position.distanceTo(targetPos) < 0.4) goal.current = null;
  });
  return (
    <OrbitControls
      ref={ref}
      target={[ART_W * S / 2, 0, -ART_H * S / 2]}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={110}
      maxPolarAngle={Math.PI * 0.46}
    />
  );
}

export function AxisTable({ manifest, board, control, focus, picks, onPick, staged, arrows, selectedKeys, onStackTap, onRegionTap, children }: {
  manifest: AxisManifest;
  board: Record<string, UnitStack[]>;
  control: Record<string, PowerKey | 'china' | null>;
  focus: FocusTarget | null;
  picks?: SpacePick[];
  onPick?: (id: string) => void;
  staged?: StagedStack[];
  arrows?: OrderArrow[];
  selectedKeys?: Record<string, Set<string>>; // spaceId -> stack keys glowing
  onStackTap?: (spaceId: string, power: string, key: string) => void;
  onRegionTap?: (id: string) => void; // tap anywhere inside a region
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
      camera={{ position: [ART_W * S / 2, 66, 12], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
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
              selectedKeys={selectedKeys?.[spaceId]}
              onStackTap={onStackTap}
            />
          ) : null,
        )}
        {(arrows ?? []).map((a, i) => <ArrowMesh key={i} arrow={a} />)}
        {staged && staged.length > 0 && <StagingPieces manifest={manifest} staged={staged} />}
        {(picks ?? []).map((p) => {
          const c = SPACE_CENTER[p.id];
          if (!c) return null;
          const [x, z] = px2r(c[0], c[1]);
          return <PickRing key={p.id} x={x} z={z} color={p.color} onTap={() => onPick?.(p.id)} />;
        })}
        {children}
      </Suspense>
      <Rig focus={focus} />
    </Canvas>
  );
}
