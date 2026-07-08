// 3D renderer for Dark Tower: the mod's circular board (plain disc, four
// kingdom quadrants) with its building models, player tokens, and the real
// 13.6k-vert tower at center. The tower's wedge display (reel picture) and
// 2-digit LCD render as billboards on the tower so the TV reads like the
// original toy. Same conventions as the other renderers: mirror world Z,
// negate Y rotation.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import type { DtSeat } from '@bge/shared';

export interface DtModel { mesh: string | null; diffuse: string | null; pos: number[]; rot: number[]; scale: number[] }
export interface DtSceneDef {
  colorCodes: Record<string, number[]>;
  tower: DtModel;
  board: DtModel;
  buildings: ({ kind: string; tint: number[] | null } & DtModel)[];
  tokens: DtModel[];
  tokenTints: Record<string, number[]>;
  wedge: { reelOf: Record<string, number>; rowOf: Record<string, number> };
  reelTextures: Record<string, string>;
  sounds: Record<string, string>;
  scorecards: Record<string, { kingdom: string; body: string | null; tiles: Record<string, string> }>;
}

let cached: DtSceneDef | null = null;
export function useDtScene(): DtSceneDef | null {
  const [scene, setScene] = useState<DtSceneDef | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetch('/darktower/scene.json').then((r) => r.json()).then((s) => { cached = s; setScene(s); });
  }, []);
  return scene;
}

const pos3 = (p: number[]): [number, number, number] => [p[0], p[1], -p[2]];
const rot3 = (r: number[]): THREE.Euler =>
  new THREE.Euler(THREE.MathUtils.degToRad(r[0]), -THREE.MathUtils.degToRad(r[1]), -THREE.MathUtils.degToRad(r[2]), 'YXZ');
const FOV = 38;
const FOV_TAN = Math.tan((FOV * Math.PI) / 360);

function Model({ def, tint, centerXZ = false }: { def: DtModel; tint: number[] | null; centerXZ?: boolean }) {
  const obj = useLoader(OBJLoader, def.mesh!);
  const tex = def.diffuse ? useLoader(THREE.TextureLoader, def.diffuse) : null;
  useMemo(() => { if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; } }, [tex]);
  const { clone, midX, midZ } = useMemo(() => {
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
        map: tex ?? undefined,
        // with a texture, tint multiplies — stay white unless explicitly set
        color: tint ? new THREE.Color(tint[0], tint[1], tint[2]) : tex ? new THREE.Color('#ffffff') : new THREE.Color('#d8d2c6'),
        roughness: 0.62, metalness: 0.06,
      });
    });
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    return { clone: c, midX: (box.min.x + box.max.x) / 2, midZ: (box.min.z + box.max.z) / 2 };
  }, [obj, tex, tint]);
  // OBJ meshes get the standard local 180-degree Y turn; centerXZ pins the
  // mesh's footprint on the world origin (the tower must sit dead center)
  const pos = centerXZ ? [0, def.pos[1], 0] as [number, number, number] : pos3(def.pos);
  // note: the primitive's position applies AFTER its own 180-degree rotation,
  // which maps the mesh mid (mx,mz) to (-mx,-mz) — cancel with +mid
  return (
    <group position={pos} rotation={rot3(def.rot)} scale={def.scale as [number, number, number]}>
      <primitive object={clone} rotation={[0, Math.PI, 0]} position-x={centerXZ ? midX : 0} position-z={centerXZ ? midZ : 0} />
    </group>
  );
}

/** The mod's painted board: a giant Custom_Token (GUID 706f42, scale 7) at
 *  the table center. Sized so the printed citadel badges land under the
 *  citadel models the mod placed on them (badge at 90.5% of the half-size,
 *  red citadel at world r 11.51 -> half-size 12.72). */
function BoardFace() {
  const tex = useLoader(THREE.TextureLoader, '/darktower/boardart.webp');
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; }, [tex]);
  const HALF = 12.72;
  return (
    <mesh position={[-0.04, 0.96, -0.06]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[HALF * 2, HALF * 2]} />
      <meshStandardMaterial map={tex} roughness={0.94} transparent alphaTest={0.4} />
    </mesh>
  );
}

/** The tower's wedge picture, set into the tower's window opening (the mod's
 *  rotating reel sits inside the tower at this height — global.lua wedge). */
function TowerDisplay({ scene, pic, reelOf, rowOf }: {
  scene: DtSceneDef; pic: string;
  reelOf: Record<string, number>; rowOf: Record<string, number>;
}) {
  const reel = pic && reelOf[pic] !== undefined ? reelOf[pic] : null;
  const tex = useLoader(THREE.TextureLoader, reel !== null ? scene.reelTextures[String(reel)] : scene.reelTextures['1']);
  const mat = useMemo(() => {
    const t = tex.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    // each reel texture is a strip of 3 pictures; the lit row selects one
    const row = pic ? rowOf[pic] ?? 0 : 0;
    t.repeat.set(1, 1 / 3);
    t.offset.set(0, (2 - row) / 3);
    t.needsUpdate = true;
    return t;
  }, [tex, pic, rowOf]);
  if (reel === null) return null;
  // window face: same side as the printed control panel (+Z in render space);
  // the opening sits at ~62% of the tower's height
  return (
    <mesh position={[0, 5.2, 1.55]}>
      <planeGeometry args={[1.55, 1.75]} />
      <meshBasicMaterial map={mat} toneMapped={false} />
    </mesh>
  );
}

function AimCamera({ controls, aim }: {
  controls: React.RefObject<OrbitControlsImpl | null>;
  aim?: { x: number; z: number; h: number; y?: number } | null;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const a = size.width / Math.max(1, size.height);
    let h = Math.max(13.4 / FOV_TAN, 13.4 / (FOV_TAN * a)) * 1.05;
    let x = 0, z = 0, y = 3;
    if (aim) { x = aim.x; z = aim.z; h = aim.h; y = aim.y ?? 3; }
    const q = new URLSearchParams(location.search).get('cam');
    if (q) { const [qx, qz, qh] = q.split(',').map(Number); x = qx; z = qz; h = qh; }
    camera.position.set(x, y + 1 + h, z + h * 0.85);
    camera.lookAt(x, y, z);
    const c = controls.current;
    if (c) { c.target.set(x, y, z); c.update(); }
  }, [camera, size, controls, aim?.x, aim?.z, aim?.h]);
  return null;
}

export function DtTable({ scene, tokens, pic, lcd, wedgeMaps, aim, interactive = true, children }: {
  scene: DtSceneDef;
  tokens: { color: DtSeat; quad: number }[];
  pic: string;
  lcd: string;
  wedgeMaps: { reelOf: Record<string, number>; rowOf: Record<string, number> };
  aim?: { x: number; z: number; h: number; y?: number } | null;
  interactive?: boolean;
  children?: React.ReactNode;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  return (
    <Canvas camera={{ fov: FOV, position: [0, 30, 26], near: 0.5, far: 400 }} gl={{ antialias: true }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[14, 30, 10]} intensity={1.3} />
      <directionalLight position={[-12, 20, -14]} intensity={0.5} />
      <Suspense fallback={null}>
        {/* circular play surface: kingdom quadrants + crests composed from
            the mod's scorecard art (gen-dt-board.mjs) */}
        <BoardFace />
        {scene.tower.mesh && <Model def={scene.tower} tint={null} centerXZ />}
        {scene.buildings.map((b, i) => b.mesh && (
          <Model key={i} def={b} tint={b.tint ?? null} />
        ))}
        {tokens.map((t, i) => {
          const def = scene.tokens[i];
          if (!def?.mesh) return null;
          // each token starts on its printed citadel badge (R bottom, B right,
          // Y top, G left on the art) and walks counterclockwise around the
          // board as kingdoms are crossed (cosmetic — the game has no spaces)
          const home = { Red: 90, Blue: 0, Yellow: 270, Green: 180 }[t.color] ?? 0;
          const a = ((home + t.quad * 90 + (t.quad ? -18 : 0)) * Math.PI) / 180;
          const r = t.quad ? 10.6 : 11.5;
          const d = { ...def, pos: [Math.cos(a) * r, 1.4, Math.sin(a) * r] };
          return <Model key={`t${i}`} def={d} tint={scene.tokenTints[t.color] ?? null} />;
        })}
        <TowerDisplay scene={scene} pic={pic} reelOf={wedgeMaps.reelOf} rowOf={wedgeMaps.rowOf} />
        {/* dark felt */}
        <mesh position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[130, 90]} />
          <meshStandardMaterial color="#0b1218" roughness={1} />
        </mesh>
      </Suspense>
      {children}
      <OrbitControls
        ref={controlsRef}
        enabled={interactive}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={6}
        maxDistance={80}
      />
      <AimCamera controls={controlsRef} aim={aim} />
    </Canvas>
  );
}
