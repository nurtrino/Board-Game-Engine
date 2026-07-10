// 3D renderer for Ticket to Ride: Rails & Sails — The World. The map is the
// mod's table art rendered as a plane sized by the computationally-fitted
// world<->pixel transform (games/ticket-to-ride-world/golden); claimed routes
// place the mod's real train/ship meshes on the route's snap points (position
// AND rotation, so pieces align along the printed slots), harbors + scoring
// markers use the mod's models with its per-color tints.
//
// Same coordinate conventions as the Brass renderer: mirror world Z, negate
// Y/Z rotations, and give OBJ meshes a local 180-degree Y turn.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { ROUTES, ROUTE_BY_ID, type TtrColor } from '@bge/shared';

export interface TtrSceneDef {
  map: { image: string; px: [number, number] };
  mapTransform: { ax: number; bx: number; cx: number; ay: number; by: number; cy: number; h?: number[]; px: [number, number];
    // second-stage warp: a locally-supported correction (fit-ttr-warp.mjs) that
    // removes the homography's edge residual so printed slots deform onto their
    // pieces. Gaussian-weighted average of nearby anchors' displacements —
    // bounded, and 0 far from any anchor (falls back to the homography).
    warp?: { kind: 'shepard'; sigma: number; bias: number; ctrl: number[][]; dwx: number[]; dwz: number[] } };
  rulesPdf: string;
  meshes: Record<'train' | 'ship' | 'harbor' | 'marker', { mesh: string; diffuse: string | null; scale: number[] }>;
  tints: Record<string, { train?: number[]; ship?: number[] }>;
  decks: Record<'ticket' | 'ship' | 'train', {
    sheets: Record<string, { face: string; back: string; cols: number; rows: number }>;
    cards: { sheet: number; cell: number }[];
  }>;
  zones: { pickups: number[][]; trainDeck: number[]; shipDeck: number[]; ticketDeck: number[] };
  snaps: { pos: number[]; rot: number[] }[];
}

let cached: TtrSceneDef | null = null;
export function useTtrScene(): TtrSceneDef | null {
  const [scene, setScene] = useState<TtrSceneDef | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetch('/ttr/scene.json').then((r) => r.json()).then((s) => { cached = s; setScene(s); });
  }, []);
  return scene;
}

const pos3 = (p: number[]): [number, number, number] => [p[0], p[1], -p[2]];
const deg = THREE.MathUtils.degToRad;
const rot3 = (r: number[]): THREE.Euler => new THREE.Euler(deg(r[0]), -deg(r[1]), -deg(r[2]), 'YXZ');

const FOV = 38;
const FOV_TAN = Math.tan((FOV * Math.PI) / 360);

/** World rectangle covered by the map image (from the fitted affine). */
// world(x,z) -> pixel as a 3x3 homogeneous matrix (homography if h present,
// else the stored affine). The client renders the map through its inverse, so
// pieces (placed at world snaps) and the map art ride the exact same transform.
function hmat(t: TtrSceneDef['mapTransform']): number[][] {
  if (t.h) return [[t.h[0], t.h[1], t.h[2]], [t.h[3], t.h[4], t.h[5]], [t.h[6], t.h[7], 1]];
  return [[t.ax, t.bx, t.cx], [t.ay, t.by, t.cy], [0, 0, 1]];
}
function inv3(m: number[][]): number[][] {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const applyH = (m: number[][], x: number, y: number): [number, number] => {
  const w = m[2][0] * x + m[2][1] * y + m[2][2];
  return [(m[0][0] * x + m[0][1] * y + m[0][2]) / w, (m[1][0] * x + m[1][1] * y + m[1][2]) / w];
};

// Gaussian-weighted average of the anchors' world displacements at a map pixel.
// Bounded by the anchors' own displacements and decays to 0 far from any anchor.
function warpCorrection(warp: NonNullable<TtrSceneDef['mapTransform']['warp']>, x: number, y: number): [number, number] {
  const { ctrl, dwx, dwz, sigma, bias } = warp;
  const inv2s2 = 1 / (2 * sigma * sigma);
  let sw = 0, sx = 0, sz = 0;
  for (let i = 0; i < ctrl.length; i++) {
    const dx = x - ctrl[i][0], dy = y - ctrl[i][1];
    const wgt = Math.exp(-(dx * dx + dy * dy) * inv2s2);
    sw += wgt; sx += wgt * dwx[i]; sz += wgt * dwz[i];
  }
  const denom = sw + bias;
  return [sx / denom, sz / denom];
}
/** A snap with its world position nudged onto its printed slot. The homography
 *  leaves a smooth residual that grows toward the map edges, so a piece placed
 *  at the raw world snap sits slightly off its slot there; subtract the fitted
 *  correction (evaluated at the snap's projected pixel) to seat it on the slot.
 *  The map itself is left un-warped, so only the pieces move — not the board. */
function warpedSnap(t: TtrSceneDef['mapTransform'], snap: { pos: number[]; rot: number[] }): { pos: number[]; rot: number[] } {
  if (!t.warp) return snap;
  const [px, py] = applyH(hmat(t), snap.pos[0], snap.pos[2]);
  const [dx, dz] = warpCorrection(t.warp, px, py);
  return { pos: [snap.pos[0] - dx, snap.pos[1], snap.pos[2] - dz], rot: snap.rot };
}

export function mapRect(t: TtrSceneDef['mapTransform']) {
  const inv = inv3(hmat(t));
  const [W, H] = t.px;
  return { tl: applyH(inv, 0, 0), br: applyH(inv, W, H) };
}

// The map is a subdivided mesh whose vertices are the image pixels mapped to
// world through the inverse transform — so the printed art follows the exact
// (possibly-perspective) fit instead of a flat rectangle that drops the shear.
function MapPlane({ scene }: { scene: TtrSceneDef }) {
  const tex = useLoader(THREE.TextureLoader, scene.map.image);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; }, [tex]);
  const geom = useMemo(() => {
    const t = scene.mapTransform;
    const [W, H] = t.px;
    const inv = inv3(hmat(t));
    // The map renders through the plain homography-inverse so the printed art
    // stays pristine (no warping of the board). Piece positions are corrected
    // instead (warpedSnap) so they land on their slots.
    const NX = 48, NZ = 28;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const [wx, wz] = applyH(inv, (i / NX) * W, (j / NZ) * H);
      pos.push(wx, 0.98, -wz);
      uv.push(i / NX, 1 - j / NZ);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [scene]);
  const { tl, br } = mapRect(scene.mapTransform);
  const w = br[0] - tl[0], d = tl[1] - br[1];
  const cx = (tl[0] + br[0]) / 2, cz = (tl[1] + br[1]) / 2;
  return (
    <group>
      <mesh geometry={geom}>
        <meshStandardMaterial map={tex} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      {/* dark felt under/around the map */}
      <mesh position={[cx, 0.9, -cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 1.6, d * 1.9]} />
        <meshStandardMaterial color="#0b1218" roughness={1} />
      </mesh>
    </group>
  );
}

/** A tinted piece mesh at a snap. */
function PieceMesh({ scene, kind, tint, snap, lift = 0, scaleMul = 1 }: {
  scene: TtrSceneDef; kind: 'train' | 'ship' | 'harbor' | 'marker';
  tint: number[] | null; snap: { pos: number[]; rot: number[] }; lift?: number; scaleMul?: number;
}) {
  const def = scene.meshes[kind];
  const obj = useLoader(OBJLoader, def.mesh);
  // The OBJs are Y-up (Z is the symmetric width, Y is the height), but they are
  // authored inconsistently — the train sits roof-down, the ship roof-up. Decide
  // per mesh: the detailed side (train body / ship hull) carries more vertices,
  // so if most vertices sit BELOW the vertical mid the piece is upside down and
  // gets a 180 roll about Z. Then read the bounding box to seat its lowest point
  // exactly on the board.
  const { clone, midY, midX } = useMemo(() => {
    const c = obj.clone(true);
    let yMin = Infinity, yMax = -Infinity;
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
    });
    const mid = (yMin + yMax) / 2;
    let lo = 0, hi = 0;
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) (p.getY(i) < mid ? lo++ : hi++);
    });
    if (lo > hi) c.rotation.set(0, 0, Math.PI); // detailed side is down -> right it
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry) {
        m.geometry.deleteAttribute('normal');
        m.geometry = mergeVertices(m.geometry);
        m.geometry.computeVertexNormals();
      }
      m.material = new THREE.MeshStandardMaterial({
        color: tint ? new THREE.Color(tint[0], tint[1], tint[2]) : new THREE.Color('#cccccc'),
        roughness: 0.55,
        metalness: 0.08,
      });
    });
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    return { clone: c, midY: (box.min.y + box.max.y) / 2, midX: (box.min.x + box.max.x) / 2 };
  }, [obj, tint]);
  // The mod's meshes are chunky and tall; keep a slightly-trimmed footprint so
  // they nestle inside the printed slots, but flatten the height a lot so the
  // low pieces don't parallax off their slots when the camera tilts.
  const FOOT = 0.9, TALL = 0.34;
  const sx = def.scale[0] * scaleMul * FOOT;
  const sy = def.scale[1] * scaleMul * TALL;
  const sz = def.scale[2] * scaleMul * FOOT;
  // Seat the piece's vertical CENTRE on the map surface (the printed slots sit
  // at y=0.98). Resting a piece on top of the board makes its body float above
  // the slot when the camera tilts and the device zooms in — a parallax offset
  // that reads as "the piece is off its slot". Centering on the surface cancels
  // it: the mid-height sits on the slot at any angle, the lower half nestles in.
  const MAP_Y = 0.98;
  const yaw = -((snap.rot[1] ?? 0) * Math.PI) / 180;
  return (
    <group position={[snap.pos[0], MAP_Y - midY * sy + lift, -snap.pos[2]]} rotation={[0, yaw, 0]} scale={[sx, sy, sz]}>
      <primitive object={clone} position-x={-midX} />
    </group>
  );
}

// Insets from the map-image edge to the printed score cells (world units).
const TRACK_PAD_X = 2.6; // in from the left/right edge to score 0 / score 50
const TRACK_PAD_Z = 2.45; // down from the top/bottom edge onto the number row

/** A point on the printed perimeter scoring track for a given score (world x,z).
 *  The printed track runs 0-50 along the TOP edge (left to right) and 50-100
 *  along the BOTTOM edge (right to left); the left and right edges are just
 *  corners with no numbered cells. Scores wrap every 100 (a second lap). */
export function scoreTrackPos(rect: { tl: number[]; br: number[] }, score: number): [number, number] {
  const xL = rect.tl[0] + TRACK_PAD_X, xR = rect.br[0] - TRACK_PAD_X;
  const zTop = rect.tl[1] - TRACK_PAD_Z, zBot = rect.br[1] + TRACK_PAD_Z; // tl.z is the top edge
  const s = ((score % 100) + 100) % 100;
  if (s <= 50) return [xL + (s / 50) * (xR - xL), zTop];   // top edge, left to right
  return [xR - ((s - 50) / 50) * (xR - xL), zBot];         // bottom edge, right to left
}

/** Player scoring markers riding the perimeter track. */
export function ScoreMarkers({ scene, markers }: {
  scene: TtrSceneDef; markers: { color: TtrColor; score: number }[];
}) {
  const rect = mapRect(scene.mapTransform);
  const cz = (rect.tl[1] + rect.br[1]) / 2;
  // group markers that share a score so ONLY tied players fan out (distinct
  // scores each sit on their own printed cell), and stack ties perpendicular to
  // the track (outward from the board centre), never along it.
  const byScore = new Map<number, typeof markers>();
  for (const m of markers) {
    const k = ((m.score % 100) + 100) % 100;
    if (!byScore.has(k)) byScore.set(k, []);
    byScore.get(k)!.push(m);
  }
  return (
    <group>
      {[...byScore.values()].flatMap((group) => {
        const [x, z] = scoreTrackPos(rect, group[0].score);
        const outward = z >= cz ? 1 : -1;
        return group.map((m, j) => {
          const off = (j - (group.length - 1) / 2) * 0.95 * outward;
          const tint = scene.tints[m.color]?.train ?? null;
          return (
            <Suspense key={m.color} fallback={null}>
              <PieceMesh scene={scene} kind="marker" tint={tint} snap={{ pos: [x, 1.05, z + off], rot: [0, 0, 0] }} lift={0.4} scaleMul={1.8} />
            </Suspense>
          );
        });
      })}
    </group>
  );
}

/** All placed pieces: claimed routes + harbors. */
export function PlacedPieces({ scene, routeOwners, harborOwners, harborSnapOf }: {
  scene: TtrSceneDef;
  routeOwners: Record<string, TtrColor>;
  harborOwners: Record<string, TtrColor>;
  harborSnapOf: Record<string, number>;
}) {
  return (
    <group>
      {Object.entries(routeOwners).map(([id, color]) => {
        const r = ROUTE_BY_ID[id];
        if (!r) return null;
        const kind = r.kind === 'rail' ? 'train' : 'ship';
        const tint = scene.tints[color]?.[kind] ?? null;
        return r.snaps.map((si) => (
          <Suspense key={`${id}:${si}`} fallback={null}>
            <PieceMesh scene={scene} kind={kind} tint={tint} snap={warpedSnap(scene.mapTransform, scene.snaps[si - 1])} />
          </Suspense>
        ));
      })}
      {Object.entries(harborOwners).map(([city, color]) => {
        const si = harborSnapOf[city];
        if (!si) return null;
        const tint = scene.tints[color]?.train ?? null;
        return (
          <Suspense key={`h:${city}`} fallback={null}>
            <PieceMesh scene={scene} kind="harbor" tint={tint} snap={warpedSnap(scene.mapTransform, scene.snaps[si - 1])} />
          </Suspense>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Route pick targets: a pulsing capsule over each snap of pickable routes.
// ---------------------------------------------------------------------------

export interface RoutePick { id: string; }

function RouteGlow({ scene, routeId, onPick, dim }: {
  scene: TtrSceneDef; routeId: string; onPick?: (id: string) => void; dim?: boolean;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.4);
    if (mat.current) mat.current.opacity = (dim ? 0.1 : 0.22) + (dim ? 0.08 : 0.22) * k;
  });
  const r = ROUTE_BY_ID[routeId];
  if (!r) return null;
  const material = <meshBasicMaterial ref={mat} color="#7fe7ff" transparent opacity={0.3} depthWrite={false} />;
  return (
    <group>
      {r.snaps.map((si) => {
        const s = warpedSnap(scene.mapTransform, scene.snaps[si - 1]);
        return (
          <mesh
            key={si}
            position={[s.pos[0], s.pos[1] + 0.28, -s.pos[2]]}
            rotation={rot3(s.rot)}
            onClick={(e) => { e.stopPropagation(); onPick?.(routeId); }}
            onPointerOver={(e) => { document.body.style.cursor = 'pointer'; e.stopPropagation(); }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
          >
            <boxGeometry args={[2.6, 0.3, 1.15]} />
            {material}
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------

function AimCamera({ cx, cz, hx, hz, controls }: {
  cx: number; cz: number; hx: number; hz: number;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const a = size.width / Math.max(1, size.height);
    const h = Math.max(hz / FOV_TAN, hx / (FOV_TAN * a)) * 1.04;
    camera.position.set(cx, 1 + h, cz + h * 0.012);
    camera.lookAt(cx, 1, cz);
    const c = controls.current;
    if (c) {
      c.target.set(cx, 1, cz);
      c.maxDistance = h * 1.02; // fit view = widest zoom
      c.update();
    }
  }, [camera, size, cx, cz, hx, hz, controls]);
  return null;
}

/** Glide to a focused route/city and back (TV captions). */
export interface TtrFocus { seq: number; x: number; z: number; }
function FocusFly({ focus, controls }: { focus?: TtrFocus; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera);
  const anim = useRef<{ start: number; from: THREE.Vector3; fromT: THREE.Vector3; seq: number } | null>(null);
  const home = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const doneSeq = useRef(-1); // a finished flight must not re-trigger
  useFrame(({ clock }) => {
    if (!focus || focus.seq === doneSeq.current) return;
    if (anim.current?.seq !== focus.seq) {
      home.current ??= { pos: camera.position.clone(), target: controls.current!.target.clone() };
      anim.current = { start: clock.elapsedTime, from: camera.position.clone(), fromT: controls.current!.target.clone(), seq: focus.seq };
    }
    const t = clock.elapsedTime - anim.current.start;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const target = new THREE.Vector3(focus.x, 1, -focus.z);
    const pose = new THREE.Vector3(focus.x, 14, -focus.z + 3.5);
    const h = home.current!;
    let k: number;
    if (t < 1.1) k = ease(Math.min(1, t / 1.1));
    else if (t < 3.4) k = 1;
    else if (t < 4.5) k = 1 - ease((t - 3.4) / 1.1);
    else {
      doneSeq.current = focus.seq;
      anim.current = null;
      camera.position.copy(h.pos); controls.current!.target.copy(h.target); controls.current!.update();
      home.current = null;
      return;
    }
    camera.position.lerpVectors(h.pos, pose, k);
    controls.current!.target.lerpVectors(h.target, target, k);
    controls.current!.update();
  });
  return null;
}

// ---------------------------------------------------------------------------

export function TtrTable({ scene, routeOwners, harborOwners, harborSnapOf, markers, pickRoutes, onPickRoute, focus, interactive = true, children }: {
  scene: TtrSceneDef;
  routeOwners: Record<string, TtrColor>;
  harborOwners: Record<string, TtrColor>;
  harborSnapOf: Record<string, number>;
  markers?: { color: TtrColor; score: number }[];
  pickRoutes?: string[];
  onPickRoute?: (id: string) => void;
  focus?: TtrFocus;
  interactive?: boolean;
  children?: React.ReactNode;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { tl, br } = mapRect(scene.mapTransform);
  const cx = (tl[0] + br[0]) / 2, cz = -((tl[1] + br[1]) / 2);
  const hx = (br[0] - tl[0]) / 2, hz = (tl[1] - br[1]) / 2;
  return (
    <Canvas camera={{ fov: FOV, position: [cx, 40, cz], near: 0.5, far: 400 }} gl={{ antialias: true }}>
      <ambientLight intensity={0.95} />
      <directionalLight position={[12, 30, 8]} intensity={1.25} />
      <directionalLight position={[-14, 22, -12]} intensity={0.45} />
      <Suspense fallback={null}>
        <MapPlane scene={scene} />
        <PlacedPieces scene={scene} routeOwners={routeOwners} harborOwners={harborOwners} harborSnapOf={harborSnapOf} />
        {markers && <ScoreMarkers scene={scene} markers={markers} />}
      </Suspense>
      {pickRoutes?.map((id) => <RouteGlow key={id} scene={scene} routeId={id} onPick={onPickRoute} />)}
      {children}
      <OrbitControls
        ref={controlsRef}
        enabled={interactive}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
        maxPolarAngle={Math.PI / 5}
        minDistance={2.5}
        maxDistance={90}
      />
      <AimCamera cx={cx} cz={cz} hx={hx} hz={hz} controls={controlsRef} />
      <FocusFly focus={focus} controls={controlsRef} />
    </Canvas>
  );
}

/** Midpoint of a route in render coordinates (for captions/focus). */
export function routeCenter(scene: TtrSceneDef, routeId: string): { x: number; z: number } {
  const r = ROUTE_BY_ID[routeId];
  const mid = scene.snaps[r.snaps[Math.floor(r.snaps.length / 2)] - 1];
  return { x: mid.pos[0], z: mid.pos[2] };
}

export { ROUTES, ROUTE_BY_ID };
