// Shared 3D renderer for the Brass Birmingham table. Three consumers:
//   - the TV main board  (filter: group === 'board')
//   - a player's personal board (filter: group === 'mat:<Color>')
//   - the dev viewer /dev/brass (everything + zone overlay)
// The static pieces live in ./pieces, everything that moves in ./stage3d.

import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { Model, Piece, pos3, type SceneDef, type GameSceneState, type TileDef } from './pieces';
import { SetupPieces, Effects, Rig, MatTile, StageCtx, FxBus, type RigApi, type Shot, type Spot } from './stage3d';

export * from './pieces';
export { FxBus, type Fx, type RigApi, type Shot, type Spot } from './stage3d';

export function useBrassScene(): SceneDef | null {
  const [scene, setScene] = useState<SceneDef | null>(null);
  useEffect(() => {
    fetch('/bb/scene.json').then((r) => r.json()).then(setScene);
  }, []);
  return scene;
}

/** A clickable tap-target on the board or mat (legal move highlight).
 *  Renders as a glowing square matching the printed slot: w/d/rotY from the
 *  zone footprint (r is a legacy fallback -> w = d = 2r). */
export interface PickTarget { id: string; x: number; z: number; r: number; y?: number; w?: number; d?: number; rotY?: number; label?: string; }

const FOV = 45;
const FOV_TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

// Deterministically frame the content: straight top-down, centered, at the
// height where it exactly fills the canvas (aspect-aware, so minis fill their
// quadrant and off-origin content like the mats is always in view).
function AimCamera({ cx, cy, cz, hx, hz, controls, home }: {
  cx: number; cy: number; cz: number; hx: number; hz: number;
  controls: React.RefObject<OrbitControlsImpl | null>;
  home: MutableRefObject<Shot>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const a = size.width / Math.max(1, size.height);
    const h = Math.max(hz / FOV_TAN, hx / (FOV_TAN * a)) * 1.04;
    camera.position.set(cx, cy + h, cz + h * 0.012);
    camera.lookAt(cx, cy, cz);
    home.current = { pos: [cx, cy + h, cz + h * 0.012], tgt: [cx, cy, cz] };
    const c = controls.current;
    if (c) {
      c.target.set(cx, cy, cz);
      // Lock max zoom-out to the fit framing: this top-down view IS the widest
      // the camera can go (you can only zoom in / pan from here).
      c.maxDistance = h * 1.02;
      c.update();
    }
  }, [camera, size, cx, cy, cz, hx, hz, controls, home]);
  return null;
}

// Pulsing legal-move square, shaped and rotated like the printed slot.
// A thick square frame (outer 1x1 minus an inner hole): WebGL line width is
// capped at 1px, so a real border needs geometry, not lineSegments.
const FRAME_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, 0.5); s.lineTo(-0.5, 0.5); s.lineTo(-0.5, -0.5);
  const hole = new THREE.Path();
  const i = 0.4; // inner half -> border band is 0.1 of the unit each side
  hole.moveTo(-i, -i); hole.lineTo(-i, i); hole.lineTo(i, i); hole.lineTo(i, -i); hole.lineTo(-i, -i);
  s.holes.push(hole);
  return new THREE.ShapeGeometry(s);
})();

function PickDisc({ t, index, onPick }: { t: PickTarget; index: number; onPick?: (id: string) => void }) {
  const fill = useRef<THREE.MeshBasicMaterial>(null);
  const frame = useRef<THREE.MeshBasicMaterial>(null);
  const grp = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (born.current === null) born.current = clock.elapsedTime;
    // targets surface one after another, then breathe together
    const age = clock.elapsedTime - born.current - Math.min(index, 14) * 0.035;
    const appear = Math.max(0, Math.min(1, age / 0.22));
    const pop = appear < 1 ? 1 + 0.35 * Math.sin(appear * Math.PI) : 1;
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.6);
    // subtle fill (doesn't flood when many tiles are legal); the bright thick
    // frame is what makes each target clearly readable
    if (fill.current) fill.current.opacity = (0.12 + 0.1 * k) * appear;
    if (frame.current) frame.current.opacity = (0.85 + 0.15 * k) * appear;
    if (grp.current) grp.current.scale.setScalar(Math.max(0.001, appear) * pop * (1 + 0.025 * k));
  });
  const w = t.w ?? t.r * 2;
  const d = t.d ?? t.r * 2;
  const yaw = -((t.rotY ?? 0) * Math.PI) / 180;
  return (
    <group ref={grp} position={[t.x, (t.y ?? 1.72) + 0.06, t.z]} rotation={[0, yaw, 0]} scale={0.001}>
      {/* clickable, lightly tinted fill */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[w, d, 1]}
        onClick={(e) => { e.stopPropagation(); onPick?.(t.id); }}
        onPointerOver={(e) => { document.body.style.cursor = 'pointer'; e.stopPropagation(); }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <planeGeometry />
        <meshBasicMaterial ref={fill} color="#aef7ff" transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* thick near-white/cyan frame, ringed OUTSIDE the tile so it separates
          from the mat's printed gold borders: high contrast on both the dark
          map and the gold-and-purple mat */}
      <mesh geometry={FRAME_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[w * 1.18, d * 1.18, 1]}>
        <meshBasicMaterial ref={frame} color="#eaffff" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export interface TableSceneProps {
  scene: SceneDef;
  /** which object groups to render */
  filter: (group: string) => boolean;
  /** render the board + table meshes (default true) */
  showBoard?: boolean;
  /** initial camera: 'board' frames the main board; 'fit' frames the filtered pieces */
  frame?: 'board' | 'fit';
  /** live game state: renders the setup pieces and hides absent colors */
  game?: GameSceneState;
  /** false = static preview (no controls) for picture-in-picture minis */
  interactive?: boolean;
  /** legal-move tap targets + handler */
  pickTargets?: PickTarget[];
  onPick?: (id: string) => void;
  /** pieces animate between states (drops, flights, flips). Default true. */
  animate?: boolean;
  /** where the current action is, in scene x/z: cubes fly to and from it */
  hint?: { x: number; z: number } | null;
  /** a ring held on the board while the table looks at something */
  spot?: Spot | null;
  /** everything the pieces do is announced here (sound, overlays) */
  fx?: FxBus;
  /** scripted camera for the big screen */
  rig?: MutableRefObject<RigApi | null>;
  /** player mat: tiles left per tile name, so the stacks run down */
  matTiles?: { color: string; left: Record<string, number> };
  /** extra 3D children (zone markers etc.) */
  children?: ReactNode;
}

export function TableScene({
  scene, filter, showBoard = true, frame = 'board', game, interactive = true,
  pickTargets, onPick, animate = true, hint = null, spot = null, fx, rig, matTiles, children,
}: TableSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const homeRef = useRef<Shot>({ pos: [0, 40, 0.4], tgt: [0, 1.3, 0] });
  const objects = useMemo(() => {
    let objs = scene.objects.filter((o) => filter(o.group ?? 'board'));
    if (game) {
      // in-game: markers walk the track and the markets change hands, so the
      // static markers and static market cubes are all rendered dynamically
      objs = objs.filter((o) =>
        !/(Income Marker|Victory Points)$/.test(o.name ?? '')
        && !(o.t === 'model' && (o.name === 'Coal' || o.name === 'Iron')));
    }
    return objs;
  }, [scene, filter, game]);

  // Content bounds: the printed board for 'board' frame, the filtered pieces
  // (plus padding) for 'fit'.
  const bounds = useMemo(() => {
    if (frame === 'fit' && objects.length) {
      const box = new THREE.Box3();
      for (const o of objects) box.expandByPoint(new THREE.Vector3(...pos3(o.place.pos)));
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      return { cx: c.x, cy: c.y, cz: c.z, hx: size.x / 2 + 1.4, hz: size.z / 2 + 1.4 };
    }
    return { cx: 0, cy: 1.3, cz: 0, hx: 12.0, hz: 12.0 };
  }, [frame, objects]);

  // The first state a scene is handed is simply shown: nothing drops in while
  // the table is still loading. After that, pieces move.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), 1800);
    return () => window.clearTimeout(id);
  }, []);
  const ownBus = useMemo(() => new FxBus(), []);
  const hintRef = useRef(hint);
  hintRef.current = hint;
  const stage = useMemo(
    () => ({ bus: fx ?? ownBus, hint: hintRef, animate: animate && settled }),
    [fx, ownBus, animate, settled],
  );
  const matPrefix = matTiles ? `${matTiles.color} ` : null;

  return (
    // near 0.5 (not the 0.1 default): the painted board floats only 0.03 above
    // the dark table slab, and with the camera 30-90 units out the default near
    // plane leaves too little depth precision to separate them: the table
    // z-fights through the board as black flicker while zooming.
    <Canvas camera={{ fov: FOV, position: [bounds.cx, 40, bounds.cz], near: 0.5, far: 400 }} gl={{ antialias: true }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[10, 30, 10]} intensity={1.4} />
      <directionalLight position={[-15, 20, -10]} intensity={0.5} />
      <StageCtx.Provider value={stage}>
        <Suspense fallback={null}>
          {showBoard && <Model def={scene.table} />}
          {showBoard && <Model def={scene.board} />}
          {objects.map((o, i) => {
            const left = matPrefix && o.t === 'tile' && o.name.startsWith(matPrefix)
              ? matTiles!.left[o.name.slice(matPrefix.length)]
              : undefined;
            return (
              <Suspense key={i} fallback={null}>
                {left !== undefined ? <MatTile def={o as TileDef} left={left} /> : <Piece def={o} />}
              </Suspense>
            );
          })}
          {game && showBoard && <SetupPieces scene={scene} game={game} />}
        </Suspense>
        <Effects spot={spot} />
        {pickTargets?.map((t, i) => <PickDisc key={t.id} t={t} index={i} onPick={onPick} />)}
        {children}
        {/* Interaction: click-drag pans, wheel/pinch zooms, right-drag orbits. */}
        <OrbitControls
          ref={controlsRef}
          enabled={interactive}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
          touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={3}
          maxDistance={90}
        />
        <AimCamera {...bounds} controls={controlsRef} home={homeRef} />
        {rig && <Rig api={rig} controls={controlsRef} home={homeRef} interactive={interactive} />}
      </StageCtx.Provider>
    </Canvas>
  );
}
