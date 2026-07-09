// 3D renderer for Dark Tower: the mod's circular board (plain disc, four
// kingdom quadrants) with its building models, player tokens, and the real
// 13.6k-vert tower at center. The tower's wedge display (reel picture) and
// 2-digit LCD render as billboards on the tower so the TV reads like the
// original toy. Same conventions as the other renderers: mirror world Z,
// negate Y rotation.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { dtHomeSpot, type DtSeat } from '@bge/shared';

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

const BOARD_Y = 0.96; // the painted board plane

// A pawn's board position is honor-system: on your turn you drag it wherever you
// like, then press an action button on the panel. move_token syncs the position.

function Model({ def, tint, centerXZ = false, seatY, lift = 0 }: {
  def: DtModel; tint: number[] | null; centerXZ?: boolean;
  seatY?: number; // seat the mesh's lowest point on this height (no floating)
  lift?: number;
}) {
  const obj = useLoader(OBJLoader, def.mesh!);
  const tex = def.diffuse ? useLoader(THREE.TextureLoader, def.diffuse) : null;
  useMemo(() => { if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; } }, [tex]);
  const { clone, midX, midZ, minY } = useMemo(() => {
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
    return { clone: c, midX: (box.min.x + box.max.x) / 2, midZ: (box.min.z + box.max.z) / 2, minY: box.min.y };
  }, [obj, tex, tint]);
  // OBJ meshes get the standard local 180-degree Y turn; centerXZ pins the
  // mesh's footprint on the world origin (the tower must sit dead center)
  const base = centerXZ ? [0, def.pos[1], 0] as [number, number, number] : pos3(def.pos);
  const y = seatY !== undefined ? seatY - minY * def.scale[1] + lift : base[1];
  // note: the primitive's position applies AFTER its own 180-degree rotation,
  // which maps the mesh mid (mx,mz) to (-mx,-mz) — cancel with +mid
  return (
    <group position={[base[0], y, base[2]]} rotation={rot3(def.rot)} scale={def.scale as [number, number, number]}>
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
  // the tower's upper body front face sits at z ~= 1.85 (see mesh bands); place
  // the reel window just proud of it so it is never occluded by the body
  // y tracks the tower body: the tower base is seated on the board (dropped
  // ~0.46 from its raw mesh origin), so the window drops the same amount
  return (
    <group>
      <mesh position={[0, 5.94, 1.92]}>
        <planeGeometry args={[1.75, 1.95]} />
        <meshBasicMaterial color="#050505" />
      </mesh>
      {reel !== null && (
        <mesh position={[0, 5.94, 1.95]}>
          <planeGeometry args={[1.55, 1.75]} />
          <meshBasicMaterial map={mat} toneMapped={false} transparent />
        </mesh>
      )}
    </group>
  );
}

/** The tower's 2-digit LCD, drawn on a canvas texture so it reads like the
 *  real toy (glowing red 7-seg digits). Sits above the control panel. */
function TowerLcd({ lcd }: { lcd: string }) {
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => {
    const cv = tex.image as HTMLCanvasElement;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#0a0402';
    c.fillRect(0, 0, 256, 128);
    const chars = (lcd || '  ').padEnd(2, ' ').slice(0, 2);
    c.font = 'bold 92px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ff5a3c';
    c.shadowColor = '#ff5a3c';
    c.shadowBlur = 22;
    c.fillText(chars, 128, 70);
    tex.needsUpdate = true;
  }, [lcd, tex]);
  // just above the reel window on the tower body front (dropped with the tower)
  return (
    <mesh position={[0, 7.54, 1.9]} rotation={[-0.05, 0, 0]}>
      <planeGeometry args={[1.4, 0.7]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

/** A player's token: rendered at its board `spot`, seated on the board, and —
 *  for the local player on their turn — free to pick up and drop anywhere
 *  (honor-system movement). A drag calls onPlace with the world position. */
function Token({ def, tint, spot, draggable, onPlace, onDragChange }: {
  def: DtModel; tint: number[] | null;
  spot: { x: number; z: number };
  draggable: boolean;
  onPlace?: (x: number, z: number) => void;
  onDragChange?: (dragging: boolean) => void;
}) {
  const [drag, setDrag] = useState<{ x: number; z: number } | null>(null);
  const { gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BOARD_Y + 0.02)), []);
  const active = useRef(false);
  // render position: mirror world z (render z = -world z). Guard a missing spot
  // (e.g. a stale server still sending the old node-based state) so a schema
  // mismatch degrades to a centred pawn instead of crashing the whole canvas.
  const sx = spot?.x ?? 0, sz = spot?.z ?? 0;
  const rx = drag ? drag.x : sx;
  const rz = drag ? -drag.z : -sz;
  const lift = drag ? 1.6 : 0;
  const toBoard = (e: ThreeEvent<PointerEvent>): { x: number; z: number } | null => {
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, z: -hit.z }; // back to world z
  };
  return (
    <group
      position={[rx, BOARD_Y + lift, rz]}
      onPointerDown={draggable ? (e) => {
        e.stopPropagation();
        active.current = true;
        onDragChange?.(true);
        (e.target as Element).setPointerCapture?.(e.pointerId);
        gl.domElement.style.cursor = 'grabbing';
        const b = toBoard(e); if (b) setDrag(b);
      } : undefined}
      onPointerMove={draggable ? (e) => {
        if (!active.current) return;
        e.stopPropagation();
        const b = toBoard(e); if (b) setDrag(b);
      } : undefined}
      onPointerUp={draggable ? (e) => {
        if (!active.current) return;
        active.current = false;
        onDragChange?.(false);
        gl.domElement.style.cursor = 'auto';
        const b = toBoard(e) ?? drag;
        setDrag(null);
        if (b) onPlace?.(+b.x.toFixed(2), +b.z.toFixed(2));
      } : undefined}
      onPointerOver={draggable ? () => { gl.domElement.style.cursor = 'grab'; } : undefined}
      onPointerOut={draggable ? () => { if (!active.current) gl.domElement.style.cursor = 'auto'; } : undefined}
    >
      {/* a slightly larger invisible grab pad so tokens are easy to pick up */}
      {draggable && (
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[1.1, 1.1, 2.4, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      <Model def={{ ...def, pos: [0, 0, 0], rot: [0, 0, 0] }} tint={tint} seatY={0} />
      {drag && (
        <mesh position={[0, -lift + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.0, 1.3, 28]} />
          <meshBasicMaterial color="#7fe7ff" transparent opacity={0.85} />
        </mesh>
      )}
    </group>
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
    if (q) { const [qx, qz, qh, qy] = q.split(',').map(Number); x = qx; z = qz; h = qh; if (qy !== undefined) y = qy; }
    camera.position.set(x, y + 1 + h, z + h * 0.85);
    camera.lookAt(x, y, z);
    const c = controls.current;
    if (c) { c.target.set(x, y, z); c.update(); }
  }, [camera, size, controls, aim?.x, aim?.z, aim?.h]);
  return null;
}

export interface DtTokenView { seat: number; color: DtSeat; spot: { x: number; z: number } }

export function DtTable({ scene, tokens, pic, lcd, wedgeMaps, aim, youSeat, canMove, onMoveToken, onDragChange, interactive = true, children }: {
  scene: DtSceneDef;
  tokens: DtTokenView[];
  pic: string;
  lcd: string;
  wedgeMaps: { reelOf: Record<string, number>; rowOf: Record<string, number> };
  aim?: { x: number; z: number; h: number; y?: number } | null;
  youSeat?: number | null; // the local player's seat (their pawn is draggable)
  canMove?: boolean; // is it the local player's turn (may they drag their pawn)
  onMoveToken?: (x: number, z: number) => void;
  onDragChange?: (dragging: boolean) => void;
  interactive?: boolean;
  children?: React.ReactNode;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <Canvas camera={{ fov: FOV, position: [0, 30, 26], near: 0.5, far: 400 }} gl={{ antialias: true }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[14, 30, 10]} intensity={1.3} />
      <directionalLight position={[-12, 20, -14]} intensity={0.5} />
      <Suspense fallback={null}>
        {/* the mod's painted board */}
        <BoardFace />
        {/* the tower sits dead center, base seated flush on the board (no float) */}
        {scene.tower.mesh && <Model def={scene.tower} tint={null} centerXZ seatY={BOARD_Y} />}
        {/* buildings seated on the board surface (no floating) */}
        {scene.buildings.map((b, i) => b.mesh && (
          <Model key={i} def={b} tint={b.tint ?? null} seatY={BOARD_Y} />
        ))}
        {/* player pawns at their board spots; your own is free to drag on your turn */}
        {tokens.map((t) => {
          const def = scene.tokens[t.seat];
          if (!def?.mesh) return null;
          const you = youSeat === t.seat;
          return (
            <Token
              key={`tok${t.seat}`}
              def={def}
              tint={scene.tokenTints[t.color] ?? null}
              spot={t.spot ?? dtHomeSpot(t.color)}
              draggable={!!(you && canMove && interactive)}
              onPlace={(x, z) => onMoveToken?.(x, z)}
              onDragChange={(d) => { setDragging(d); onDragChange?.(d); }}
            />
          );
        })}
        <TowerDisplay scene={scene} pic={pic} reelOf={wedgeMaps.reelOf} rowOf={wedgeMaps.rowOf} />
        <TowerLcd lcd={lcd} />
        {/* dark felt */}
        <mesh position={[0, 0.88, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[130, 90]} />
          <meshStandardMaterial color="#0b1218" roughness={1} />
        </mesh>
      </Suspense>
      {children}
      <OrbitControls
        ref={controlsRef}
        enabled={interactive && !dragging}
        makeDefault
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
