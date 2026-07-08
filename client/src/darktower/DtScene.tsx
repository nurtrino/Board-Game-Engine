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

function Model({ def, tint, liftToSurface = false }: { def: DtModel; tint: number[] | null; liftToSurface?: boolean }) {
  const obj = useLoader(OBJLoader, def.mesh!);
  const tex = def.diffuse ? useLoader(THREE.TextureLoader, def.diffuse) : null;
  useMemo(() => { if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; } }, [tex]);
  const clone = useMemo(() => {
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
    return c;
  }, [obj, tex, tint]);
  // OBJ meshes get the standard local 180-degree Y turn
  return (
    <group position={pos3(def.pos)} rotation={rot3(def.rot)} scale={def.scale as [number, number, number]}>
      <primitive object={clone} rotation={[0, Math.PI, 0]} position-y={liftToSurface ? 0.02 : 0} />
    </group>
  );
}

/** The tower's wedge picture + LCD as camera-facing sprites above the tower. */
function TowerDisplay({ scene, pic, lcd, reelOf, rowOf }: {
  scene: DtSceneDef; pic: string; lcd: string;
  reelOf: Record<string, number>; rowOf: Record<string, number>;
}) {
  const reel = pic && reelOf[pic] !== undefined ? reelOf[pic] : null;
  const tex = useLoader(THREE.TextureLoader, reel !== null ? scene.reelTextures[String(reel)] : scene.reelTextures['1']);
  const mat = useMemo(() => {
    const t = tex.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    // each reel texture is a strip of pictures; show the row for this pic.
    // The mod's reels carry several frames; the lit row selects vertically.
    const row = pic ? rowOf[pic] ?? 0 : 0;
    t.repeat.set(1, 1 / 3);
    t.offset.set(0, (2 - row) / 3);
    t.needsUpdate = true;
    return t;
  }, [tex, pic, rowOf]);
  if (reel === null) return null;
  return (
    <sprite position={[-0.4, 13.2, 0.6]} scale={[4.6, 2.3, 1]}>
      <spriteMaterial map={mat} />
    </sprite>
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
    let h = Math.max(16 / FOV_TAN, 16 / (FOV_TAN * a)) * 1.05;
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
        {/* circular play surface with the four kingdom quadrants */}
        <mesh position={[0, 0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[20, 96]} />
          <meshStandardMaterial color="#26221c" roughness={0.95} />
        </mesh>
        {[0, Math.PI / 2].map((a) => (
          <mesh key={a} position={[0, 0.98, 0]} rotation={[-Math.PI / 2, 0, a + Math.PI / 4]}>
            <planeGeometry args={[40, 0.18]} />
            <meshStandardMaterial color="#4a4238" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0, 0.97, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[19.7, 20, 96]} />
          <meshStandardMaterial color="#4a4238" roughness={1} />
        </mesh>
        {scene.board.mesh && <Model def={scene.board} tint={scene.colorCodes.tan} />}
        {scene.tower.mesh && <Model def={scene.tower} tint={null} />}
        {scene.buildings.map((b, i) => b.mesh && (
          <Model key={i} def={b} tint={b.tint ?? null} />
        ))}
        {tokens.map((t, i) => {
          const def = scene.tokens[i];
          if (!def?.mesh) return null;
          // tokens sit in their kingdom quadrant; nudge outward by quad so
          // progress reads at a glance (cosmetic — the game has no spaces)
          const a = (i / 4) * Math.PI * 2 + (t.quad * 0.35);
          const r = 13.5;
          const d = { ...def, pos: [Math.cos(a) * r, 1.4, Math.sin(a) * r] };
          return <Model key={`t${i}`} def={d} tint={scene.tokenTints[t.color] ?? null} />;
        })}
        <TowerDisplay scene={scene} pic={pic} lcd={lcd} reelOf={wedgeMaps.reelOf} rowOf={wedgeMaps.rowOf} />
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
