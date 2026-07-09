// 3D renderer for Dune: Imperium. The main board is the mod's giant
// Custom_Token art on a plane (centre and scale from the save: pos
// (0.5, 3.09), scale 6.64 — half-extent scale*1.817, the Custom_Token
// ratio measured on Dark Tower). The mod ships the Rise of Ix board; base
// games lay the mod's own overlay tiles over it exactly where the Lua
// setup puts them. Agents are the mod's pawn mesh in the mod's seat
// tints; troops are its 0.35 BlockSquare cubes.
//
// Same conventions as the other renderers: mirror world Z, negate yaw.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import type { DuneSeat } from '@bge/shared';

export interface DuneSceneDef {
  board: { image: string; pos: number[]; rot: number[]; scale: number };
  mat: {
    board: string;
    water: string; spice1: string; spice5: string; solari1: string; solari5: string;
    councilor: string;
    control: Record<DuneSeat, string>;
    combat: Record<DuneSeat, string>;
    tokenTints: { water: number[]; spice: number[]; solari: number[]; combat: Record<DuneSeat, number[]> };
  };
  overlays: Record<string, { image: string; pos: number[]; scale: number[] }>;
  spaceSpots: Record<string, number[]>;
  pieces: { agentMesh: string; tints: Record<DuneSeat, number[]>; troopScale: number };
  sheets: Record<string, { face: string; back: string; cols: number; rows: number }>;
  decks: Record<string, { guid: string; cards: { name: string; desc: string; sheet: number; cell: number }[] }>;
  leaders: { guid: string; name: string; image: string | null }[];
}

let cached: DuneSceneDef | null = null;
export function useDuneScene(): DuneSceneDef | null {
  const [scene, setScene] = useState<DuneSceneDef | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetch('/dune/scene.json').then((r) => r.json()).then((s) => { cached = s; setScene(s); });
  }, []);
  return scene;
}

const BOARD_Y = 0.96;

// Art px -> world affine, fitted on three labelled anchors (the Lua overlay
// tile positions for Conspire / Stillsuits / Sell Melange measured against
// their printed slots in the 5000x4996 board art). Never eyeball.
const AX = 0.005015, BX = -12.07; // world x = AX*px + BX
const AZ = -0.004993, BZ = 16.57; // world z = AZ*py + BZ
const ART_W = 5000, ART_H = 4996;

/** World (x,z) -> render (x,z): mirror z. */
export const rz = (xz: number[]): [number, number] => [xz[0], -xz[1]];

function BoardPlane({ scene }: { scene: DuneSceneDef }) {
  const tex = useLoader(THREE.TextureLoader, scene.board.image);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; }, [tex]);
  const w = ART_W * AX, h = ART_H * -AZ;
  const cx = AX * (ART_W / 2) + BX;
  const cz = AZ * (ART_H / 2) + BZ;
  return (
    <group>
      <mesh position={[cx, BOARD_Y, -cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh position={[cx, BOARD_Y - 0.05, -cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 2.5, h * 2]} />
        <meshStandardMaterial color="#000000" roughness={1} />
      </mesh>
    </group>
  );
}

function OverlayTile({ def }: { def: { image: string; pos: number[]; scale: number[] } }) {
  const tex = useLoader(THREE.TextureLoader, def.image);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; }, [tex]);
  const [x, z] = rz(def.pos);
  // Custom_Tile footprint: 2 units per unit of scale
  return (
    <mesh position={[x, BOARD_Y + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[def.scale[0] * 2, def.scale[1] * 2]} />
      <meshStandardMaterial map={tex} roughness={0.9} transparent alphaTest={0.4} />
    </mesh>
  );
}

/** The mod's agent pawn, tinted, seated on the board. */
function AgentPawn({ scene, color, x, z, small = false }: {
  scene: DuneSceneDef; color: DuneSeat; x: number; z: number; small?: boolean;
}) {
  const obj = useLoader(OBJLoader, scene.pieces.agentMesh);
  const tint = scene.pieces.tints[color];
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
        color: new THREE.Color(tint[0], tint[1], tint[2]), roughness: 0.5, metalness: 0.1,
      });
    });
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    return { clone: c, minY: box.min.y, midX: (box.min.x + box.max.x) / 2, midZ: (box.min.z + box.max.z) / 2 };
  }, [obj, tint]);
  const s = small ? 0.8 : 1;
  return (
    <group position={[x, BOARD_Y - minY * s, z]} scale={[s, s, s]}>
      <primitive object={clone} position-x={-midX} position-z={-midZ} />
    </group>
  );
}

/** A player's troop cube. */
function Troop({ scene, color, x, z, lift = 0 }: { scene: DuneSceneDef; color: DuneSeat; x: number; z: number; lift?: number }) {
  const tint = scene.pieces.tints[color];
  const s = scene.pieces.troopScale;
  return (
    <mesh position={[x, BOARD_Y + s / 2 + lift, z]}>
      <boxGeometry args={[s, s, s]} />
      <meshStandardMaterial color={new THREE.Color(tint[0], tint[1], tint[2])} roughness={0.5} metalness={0.1} />
    </mesh>
  );
}

// Combat arena (the crossed-blades X) + the four printed garrison circles,
// measured from the board art through the same affine fit.
export const COMBAT_CENTER: [number, number] = [5.83, -2.10]; // world x,z
const GARRISON_SPOTS: Record<DuneSeat, [number, number]> = {
  Red: [1.62, -0.08], Blue: [9.52, 0.07], Orange: [2.07, -2.85], Green: [9.44, -2.63],
};

function troopGrid(cx: number, cz: number, n: number, step = 0.42): [number, number][] {
  const out: [number, number][] = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    out.push([cx + (c - (cols - 1) / 2) * step, cz + (r - Math.floor((n - 1) / cols) / 2) * step]);
  }
  return out;
}

export interface DunePieces {
  agents: { color: DuneSeat; space: string }[];
  garrisons: { color: DuneSeat; n: number }[];
  conflict: { color: DuneSeat; n: number }[];
  makers: Record<string, number>; // bonus spice waiting on maker spaces
  control: { space: string; color: DuneSeat }[]; // flags below Arrakeen/Carthag/Imperial Basin
}

/** A flat token on the main board (spice piles, control flags). */
function BoardTok({ url, x, z, w, h, tint, lift = 0 }: {
  url: string; x: number; z: number; w: number; h: number; tint?: number[]; lift?: number;
}) {
  const tex = useLoader(THREE.TextureLoader, url);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; }, [tex]);
  return (
    <mesh position={[x, BOARD_Y + 0.04 + lift, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial
        map={tex} roughness={0.85} transparent alphaTest={0.4}
        color={tint ? new THREE.Color(tint[0], tint[1], tint[2]) : undefined}
      />
    </mesh>
  );
}

// printed flag slots under the three controllable spaces (world x,z —
// "below" on the art is smaller world z through the affine fit)
const CONTROL_SPOTS: Record<string, [number, number]> = {
  arrakeen: [7.41, 7.83], carthag: [3.18, 7.03], imperialBasin: [7.09, 4.08],
};

function Pieces({ scene, pieces }: { scene: DuneSceneDef; pieces: DunePieces }) {
  // multiple agents on one space (High Council / Swordmaster) fan out
  const bySpace = new Map<string, { color: DuneSeat }[]>();
  for (const a of pieces.agents) {
    if (!bySpace.has(a.space)) bySpace.set(a.space, []);
    bySpace.get(a.space)!.push(a);
  }
  return (
    <group>
      {[...bySpace.entries()].map(([space, list]) => {
        const spot = scene.spaceSpots[space];
        if (!spot) return null;
        const [x, z] = rz(spot);
        return list.map((a, i) => (
          <AgentPawn key={`${space}-${i}`} scene={scene} color={a.color} x={x + (i - (list.length - 1) / 2) * 0.9} z={z} />
        ));
      })}
      {pieces.garrisons.map(({ color, n }) => {
        const [gx, gz] = rz(GARRISON_SPOTS[color]);
        return troopGrid(gx, gz, n).map(([x, z], i) => (
          <Troop key={`g-${color}-${i}`} scene={scene} color={color} x={x} z={z} />
        ));
      })}
      {(() => {
        const [cx, cz] = rz(COMBAT_CENTER);
        let angle = -Math.PI / 2;
        return pieces.conflict.map(({ color, n }) => {
          angle += Math.PI / 2;
          const ox = cx + Math.cos(angle) * 0.9, oz = cz + Math.sin(angle) * 0.9;
          return troopGrid(ox, oz, n).map(([x, z], i) => (
            <Troop key={`c-${color}-${i}`} scene={scene} color={color} x={x} z={z} lift={0.02} />
          ));
        });
      })()}
      {Object.entries(pieces.makers).map(([space, n]) => {
        const spot = scene.spaceSpots[space];
        if (!spot || n <= 0) return null;
        const [x, z] = rz([spot[0] - 1.1, spot[1] - 0.9]);
        return Array.from({ length: Math.min(n, 6) }, (_, i) => (
          <BoardTok key={`m-${space}-${i}`} url={scene.mat.spice1} x={x + (i % 3) * 0.5} z={z + Math.floor(i / 3) * 0.5}
            w={0.62} h={0.54} tint={scene.mat.tokenTints.spice} lift={i * 0.005} />
        ));
      })}
      {pieces.control.map(({ space, color }) => {
        const spot = CONTROL_SPOTS[space];
        if (!spot) return null;
        const [x, z] = rz(spot);
        return <BoardTok key={`ctl-${space}`} url={scene.mat.control[color]} x={x} z={z} w={0.85} h={1.06} />;
      })}
    </group>
  );
}

/** Slow settle onto a sensible view; ?cam=x,z,h,y overrides for screenshots. */
function AimCamera() {
  const ref = useRef<OrbitControlsImpl>(null);
  const applied = useRef(false);
  useFrame(({ camera }) => {
    if (applied.current) return;
    applied.current = true;
    const q = new URLSearchParams(window.location.search).get('cam');
    if (q) {
      const [x, z, h, y] = q.split(',').map(Number);
      camera.position.set(x, h ?? 24, z);
      ref.current?.target.set(0, y ?? 0, -3);
    }
    ref.current?.update();
  });
  return <OrbitControls ref={ref} target={[0.5, 0, -3.1]} enableDamping dampingFactor={0.08} minDistance={6} maxDistance={70} maxPolarAngle={Math.PI * 0.47} />;
}

export function DuneTable({ scene, pieces }: { scene: DuneSceneDef; pieces: DunePieces }) {
  return (
    <Canvas
      camera={{ position: [0.5, 30, 18], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ position: 'absolute', inset: 0, background: '#05070a' }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[14, 30, 10]} intensity={1.5} />
      <directionalLight position={[-18, 22, -14]} intensity={0.5} />
      <Suspense fallback={null}>
        <BoardPlane scene={scene} />
        {Object.values(scene.overlays).map((o, i) => <OverlayTile key={i} def={o} />)}
        <Pieces scene={scene} pieces={pieces} />
      </Suspense>
      <AimCamera />
    </Canvas>
  );
}
