// 3D renderer for Trekking the National Parks. The board is the mod's map art
// rendered as a plane through the exact OBJ-UV mapping (top face of the board
// box: x in [-12,12], z in [-6,6] local, rotY 180, scale 4 — so art pixel
// (px,py) sits at world x=((px/9000)*24-12)*4, z=(((1-py/4500)*12)-6)*4).
// Trekkers, stones and campsites use the mod's real meshes with its tints.
//
// Same coordinate conventions as the other renderers: mirror world Z, negate
// Y rotations.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { NODES, START, type StoneColor, type TrekSeat } from '@bge/shared';

export interface TrekSceneDef {
  board: { mesh: string; diffuse: string; transform: { pos: number[]; rot: number[]; scale: number[] } };
  meshes: Record<'hiker' | 'campsite' | 'stone', { mesh: string; diffuse: string | null; scale: number[] }>;
  tints: { players: Record<string, number[]>; stones: Record<string, number[]> };
  decks: Record<'trek' | 'parks' | 'majors', {
    sheets: Record<string, { face: string; back: string; cols: number; rows: number }>;
    cards: { sheet: number; cell: number }[];
    names: string[];
  }>;
  bonusCards: Record<'most' | 'second', Record<string, { face: string; cols: number; rows: number; cell: number }>>;
  rulesPdf: string;
  snaps: { pos: number[]; rot: number[] }[];
}

let cached: TrekSceneDef | null = null;
export function useTrekScene(): TrekSceneDef | null {
  const [scene, setScene] = useState<TrekSceneDef | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetch('/trek/scene.json').then((r) => r.json()).then((s) => { cached = s; setScene(s); });
  }, []);
  return scene;
}

// art px -> TTS world (x, z); render mirrors z
const ART_W = 9000, ART_H = 4500;
export const pxToWorld = (px: number[]): [number, number] => [
  ((px[0] / ART_W) * 24 - 12) * 4,
  (((1 - px[1] / ART_H) * 12) - 6) * 4,
];

/** Render-space position of a board node (three.js x, z). */
export function nodePos(id: number): [number, number] {
  const [wx, wz] = pxToWorld(NODES[id].px);
  return [wx, -wz];
}

const BOARD_Y = 0.96;
const FOV = 38;
const FOV_TAN = Math.tan((FOV * Math.PI) / 360);

function MapPlane({ scene }: { scene: TrekSceneDef }) {
  const tex = useLoader(THREE.TextureLoader, scene.board.diffuse);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; }, [tex]);
  // corners: px (0,0) -> world (-48, +24) [render z -24], px (9000,4500) -> (48, -24)
  return (
    <group>
      <mesh position={[0, BOARD_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[96, 48]} />
        <meshStandardMaterial map={tex} roughness={0.92} />
      </mesh>
      {/* black table around the board */}
      <mesh position={[0, BOARD_Y - 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[96 * 1.8, 48 * 2.2]} />
        <meshStandardMaterial color="#000000" roughness={1} />
      </mesh>
    </group>
  );
}

/** A tinted piece mesh seated on the board at a render-space (x,z). */
function PieceMesh({ scene, kind, tint, x, z, yaw = 0, scaleMul = 1, lift = 0 }: {
  scene: TrekSceneDef; kind: 'hiker' | 'campsite' | 'stone';
  tint: number[] | null; x: number; z: number; yaw?: number; scaleMul?: number; lift?: number;
}) {
  const def = scene.meshes[kind];
  const obj = useLoader(OBJLoader, def.mesh);
  const { clone, minY, midX, midZ } = useMemo(() => {
    const c = obj.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry) {
        m.geometry.deleteAttribute('normal');
        m.geometry = mergeVertices(m.geometry);
        m.geometry.computeVertexNormals();
      }
      m.material = new THREE.MeshStandardMaterial({
        color: tint ? new THREE.Color(tint[0], tint[1], tint[2]) : new THREE.Color('#c8c2b6'),
        roughness: 0.55,
        metalness: 0.08,
      });
    });
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    return { clone: c, minY: box.min.y, midX: (box.min.x + box.max.x) / 2, midZ: (box.min.z + box.max.z) / 2 };
  }, [obj, tint]);
  const s = def.scale.map((v) => v * scaleMul) as [number, number, number];
  return (
    <group position={[x, BOARD_Y - minY * s[1] + lift, z]} rotation={[0, yaw, 0]} scale={s}>
      <primitive object={clone} position-x={-midX} position-z={-midZ} />
    </group>
  );
}

/** All board pieces: stones on parks, trekkers, campsites ringing occupied majors. */
export function TrekPieces({ scene, stones, trekkers, majorTents }: {
  scene: TrekSceneDef;
  stones: Record<number, StoneColor | null>;
  trekkers: { color: TrekSeat; node: number }[];
  majorTents: { node: number; colors: TrekSeat[] }[];
}) {
  const atStart = trekkers.filter((t) => t.node === START);
  return (
    <group>
      {Object.entries(stones).map(([id, color]) => {
        if (!color) return null;
        const [x, z] = nodePos(Number(id));
        return (
          <Suspense key={`s:${id}`} fallback={null}>
            <PieceMesh scene={scene} kind="stone" tint={scene.tints.stones[color]} x={x} z={z} scaleMul={0.62} />
          </Suspense>
        );
      })}
      {trekkers.map((t) => {
        const [x, z] = nodePos(t.node);
        // fan trekkers sharing START in a small ring
        const i = t.node === START ? atStart.findIndex((q) => q.color === t.color) : 0;
        const n = t.node === START ? atStart.length : 1;
        const a = (i / Math.max(1, n)) * Math.PI * 2;
        const r = n > 1 ? 1.5 : 0;
        return (
          <Suspense key={`t:${t.color}`} fallback={null}>
            <PieceMesh
              scene={scene} kind="hiker" tint={scene.tints.players[t.color]}
              x={x + Math.cos(a) * r} z={z + Math.sin(a) * r} yaw={Math.PI} scaleMul={0.8}
            />
          </Suspense>
        );
      })}
      {majorTents.map(({ node, colors }) => {
        const [x, z] = nodePos(node);
        return colors.map((c, i) => {
          const a = Math.PI * 0.25 + (i / Math.max(1, colors.length)) * Math.PI * 1.1;
          return (
            <Suspense key={`m:${node}:${c}`} fallback={null}>
              <PieceMesh
                scene={scene} kind="campsite" tint={scene.tints.players[c]}
                x={x + Math.cos(a) * 1.7} z={z - Math.sin(a) * 1.3} yaw={Math.PI} scaleMul={0.8}
              />
            </Suspense>
          );
        });
      })}
    </group>
  );
}

// Pick targets: a pulsing diamond glow over given nodes.
function NodeGlow({ id, onPick }: { id: number; onPick?: (id: number) => void }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.4);
    if (mat.current) mat.current.opacity = 0.25 + 0.25 * k;
  });
  const [x, z] = nodePos(id);
  return (
    <mesh
      position={[x, BOARD_Y + 0.3, z]}
      rotation={[-Math.PI / 2, 0, Math.PI / 4]}
      onClick={(e) => { e.stopPropagation(); onPick?.(id); }}
      onPointerOver={(e) => { document.body.style.cursor = 'pointer'; e.stopPropagation(); }}
      onPointerOut={() => { document.body.style.cursor = 'auto'; }}
    >
      <planeGeometry args={[3.4, 3.4]} />
      <meshBasicMaterial ref={mat} color="#7fe7ff" transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Cameras (same behavior as the TTR renderer)
// ---------------------------------------------------------------------------

function AimCamera({ cx, cz, hx, hz, controls }: {
  cx: number; cz: number; hx: number; hz: number;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const a = size.width / Math.max(1, size.height);
    let h = Math.max(hz / FOV_TAN, hx / (FOV_TAN * a)) * 1.04;
    let x = cx, z = cz;
    // dev harness: ?cam=x,z,h aims the camera for zoomed screenshots
    const q = new URLSearchParams(location.search).get('cam');
    if (q) { const [qx, qz, qh] = q.split(',').map(Number); x = qx; z = qz; h = qh; }
    camera.position.set(x, 1 + h, z + h * 0.012);
    camera.lookAt(x, 1, z);
    const c = controls.current;
    if (c) {
      c.target.set(x, 1, z);
      c.maxDistance = Math.max(h * 1.02, 90);
      c.update();
    }
  }, [camera, size, cx, cz, hx, hz, controls]);
  return null;
}

export interface TrekFocus { seq: number; x: number; z: number }
function FocusFly({ focus, controls }: { focus?: TrekFocus; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera);
  const anim = useRef<{ start: number; seq: number } | null>(null);
  const home = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const doneSeq = useRef(-1);
  useFrame(({ clock }) => {
    if (!focus || focus.seq === doneSeq.current) return;
    if (anim.current?.seq !== focus.seq) {
      home.current ??= { pos: camera.position.clone(), target: controls.current!.target.clone() };
      anim.current = { start: clock.elapsedTime, seq: focus.seq };
    }
    const t = clock.elapsedTime - anim.current.start;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const target = new THREE.Vector3(focus.x, 1, focus.z);
    const pose = new THREE.Vector3(focus.x, 13, focus.z + 3.2);
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

export function TrekTable({ scene, stones, trekkers, majorTents, pickNodes, onPickNode, focus, interactive = true, children }: {
  scene: TrekSceneDef;
  stones: Record<number, StoneColor | null>;
  trekkers: { color: TrekSeat; node: number }[];
  majorTents: { node: number; colors: TrekSeat[] }[];
  pickNodes?: number[];
  onPickNode?: (id: number) => void;
  focus?: TrekFocus;
  interactive?: boolean;
  children?: React.ReactNode;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  // frame the masked map region (the rest of the board art is black)
  const cx = -1.25, cz = -3.41, hx = 29.66, hz = 19.58;
  return (
    <Canvas camera={{ fov: FOV, position: [cx, 40, cz], near: 0.5, far: 400 }} gl={{ antialias: true }}>
      <ambientLight intensity={0.95} />
      <directionalLight position={[12, 30, 8]} intensity={1.25} />
      <directionalLight position={[-14, 22, -12]} intensity={0.45} />
      <Suspense fallback={null}>
        <MapPlane scene={scene} />
        <TrekPieces scene={scene} stones={stones} trekkers={trekkers} majorTents={majorTents} />
      </Suspense>
      {pickNodes?.map((id) => <NodeGlow key={id} id={id} onPick={onPickNode} />)}
      {children}
      <OrbitControls
        ref={controlsRef}
        enabled={interactive}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={2.5}
        maxDistance={90}
      />
      <AimCamera cx={cx} cz={cz} hx={hx} hz={hz} controls={controlsRef} />
      <FocusFly focus={focus} controls={controlsRef} />
    </Canvas>
  );
}
