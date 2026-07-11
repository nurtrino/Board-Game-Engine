import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

export interface PolitikSheetDef {
  face: string;
  back: string;
  cols: number;
  rows: number;
  uniqueBack?: boolean;
}

export interface PolitikBoardPoint {
  id: string;
  name?: string;
  px: [number, number];
  color?: string;
  region?: string;
  benefit?: string;
}

export interface PolitikSceneDef {
  source: string;
  board: {
    image: string;
    imagePx: [number, number];
    world: { width: number; height: number };
    tts?: { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number] };
    worldToPixel?: { sx: number; tx: number; sz: number; tz: number };
  };
  mat: {
    board: string;
    resources: string;
    companyBoard?: string;
    margin?: string;
    corporateLeader?: string;
    politicalLeader?: string;
    markets?: Record<string, string>;
  };
  logo: string;
  rulebook: string;
  sheets: Record<string, PolitikSheetDef>;
  boardData: {
    imagePx: [number, number];
    world: { width: number; height: number };
    states: (PolitikBoardPoint & { region: string; benefit: string })[];
    stations: (PolitikBoardPoint & { regions: string[]; card: number })[];
    council: PolitikBoardPoint[];
    industries: (PolitikBoardPoint & { color: string })[];
    bases: (PolitikBoardPoint & { color: string })[];
    prices: Record<string, number>;
    priceRows: { id: string; px: [number, number]; slots: [number, number][]; start: number; min: number; max: number }[];
    powerGrabs: Record<string, [number, number]>;
    nationalActions: Record<string, [number, number]>;
  };
}

export interface PolitikCardRef {
  sheet: number | string;
  cell: number;
}

export interface PolitikBoardToken {
  id: string;
  px: [number, number];
  color: string;
  shape?: 'disc' | 'cube' | 'marker';
  count?: number;
  label?: string;
  lift?: number;
  scale?: number;
}

export interface PolitikBoardHotspot {
  id: string;
  px: [number, number];
  label: string;
  detail?: string;
  disabled?: boolean;
  selected?: boolean;
  color?: string;
}

let cachedScene: PolitikSceneDef | null = null;

export function usePolitikScene(): PolitikSceneDef | null {
  const [scene, setScene] = useState<PolitikSceneDef | null>(cachedScene);
  useEffect(() => {
    if (cachedScene) return;
    let live = true;
    fetch('/politik/scene.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Politik scene failed to load (${r.status})`);
        return r.json() as Promise<PolitikSceneDef>;
      })
      .then((next) => {
        cachedScene = next;
        if (live) setScene(next);
      })
      .catch(() => { if (live) setScene(null); });
    return () => { live = false; };
  }, []);
  return scene;
}

/** Convert coordinates measured on the 5760 x 3840 art to the board plane. */
export function politikPxToWorld(scene: PolitikSceneDef, px: [number, number]): [number, number] {
  const affine = scene.board.worldToPixel;
  const table = scene.board.tts;
  if (affine && table) {
    const ttsX = (px[0] - affine.tx) / affine.sx;
    const ttsZ = (px[1] - affine.tz) / affine.sz;
    // Recenter the extracted TTS board, then mirror its Z into the renderer.
    return [ttsX - table.pos[0], -(ttsZ - table.pos[2])];
  }
  const [iw, ih] = scene.boardData.imagePx;
  const { width, height } = scene.boardData.world;
  return [(px[0] / iw - 0.5) * width, (px[1] / ih - 0.5) * height];
}

/** Resolve any printed board id to its calibrated art coordinate. */
export function politikBoardPoint(scene: PolitikSceneDef, id: string): [number, number] | null {
  const clean = id.replace(/^(state|station|council|industry|base|power|national|price):/, '');
  const groups: PolitikBoardPoint[][] = [
    scene.boardData.states,
    scene.boardData.stations,
    scene.boardData.council,
    scene.boardData.industries,
    scene.boardData.bases,
  ];
  for (const group of groups) {
    const found = group.find((point) => point.id === clean);
    if (found) return found.px;
  }
  if (scene.boardData.powerGrabs[clean]) return scene.boardData.powerGrabs[clean];
  if (scene.boardData.nationalActions[clean]) return scene.boardData.nationalActions[clean];
  const price = scene.boardData.priceRows.find((row) => row.id === clean);
  return price?.px ?? null;
}

function BoardPlane({ scene }: { scene: PolitikSceneDef }) {
  const texture = useLoader(THREE.TextureLoader, scene.board.image);
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
  }, [texture]);
  const { width, height } = scene.boardData.world;
  return (
    <group>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} roughness={0.9} metalness={0.02} />
      </mesh>
      <mesh position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <boxGeometry args={[width + 0.34, height + 0.34, 0.14]} />
        <meshStandardMaterial color="#15191a" roughness={0.74} metalness={0.08} />
      </mesh>
      <mesh position={[0, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width * 1.75, height * 1.75]} />
        <meshStandardMaterial color="#030707" roughness={1} />
      </mesh>
    </group>
  );
}

function TokenPiece({ scene, token, index }: { scene: PolitikSceneDef; token: PolitikBoardToken; index: number }) {
  const [x, z] = politikPxToWorld(scene, token.px);
  const y = 0.13 + (token.lift ?? 0) + index * 0.12;
  const color = new THREE.Color(token.color);
  if (token.shape === 'cube') {
    return (
      <mesh position={[x + index * 0.11, y + 0.09, z - index * 0.08]} rotation={[0, index * 0.42, 0]} scale={token.scale ?? 1} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.34]} />
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
      </mesh>
    );
  }
  if (token.shape === 'marker') {
    return (
      <mesh position={[x, y + 0.12, z]} rotation={[0, index * 0.26, 0]} scale={token.scale ?? 1} castShadow>
        <cylinderGeometry args={[0.18, 0.23, 0.42, 24]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.12} />
      </mesh>
    );
  }
  return (
    <mesh position={[x + index * 0.08, y, z - index * 0.06]} scale={token.scale ?? 1} castShadow>
      <cylinderGeometry args={[0.25, 0.25, 0.12, 32]} />
      <meshStandardMaterial color={color} roughness={0.42} metalness={0.1} />
    </mesh>
  );
}

function BoardToken({ scene, token }: { scene: PolitikSceneDef; token: PolitikBoardToken }) {
  const count = Math.max(1, Math.min(token.count ?? 1, 4));
  const [x, z] = politikPxToWorld(scene, token.px);
  return (
    <group>
      {Array.from({ length: count }, (_, index) => <TokenPiece key={index} scene={scene} token={token} index={index} />)}
      {token.label && (
        <Html position={[x, 0.72 + count * 0.08, z]} center distanceFactor={18} style={{ pointerEvents: 'none' }}>
          <span className="pk-piece-label">{token.label}</span>
        </Html>
      )}
    </group>
  );
}

function Hotspot({ scene, spot, onPick }: {
  scene: PolitikSceneDef;
  spot: PolitikBoardHotspot;
  onPick?: (id: string) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [x, z] = politikPxToWorld(scene, spot.px);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const wave = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.06;
    ref.current.scale.setScalar(wave);
  });
  const active = hovered || spot.selected;
  return (
    <group position={[x, 0.08, z]}>
      <mesh
        ref={ref}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          if (!spot.disabled) onPick?.(spot.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = spot.disabled ? 'not-allowed' : 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = '';
        }}
      >
        <ringGeometry args={[0.32, 0.5, 40]} />
        <meshBasicMaterial
          color={spot.disabled ? '#6e7474' : spot.color ?? '#f4efe4'}
          transparent
          opacity={spot.disabled ? 0.24 : active ? 0.94 : 0.64}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {active && (
        <Html position={[0, 0.76, 0]} center distanceFactor={17} style={{ pointerEvents: 'none' }}>
          <div className={`pk-hotspot-label${spot.disabled ? ' disabled' : ''}`}>
            <b>{spot.label}</b>
            {spot.detail && <small>{spot.detail}</small>}
          </div>
        </Html>
      )}
    </group>
  );
}

function CameraRig({ controls, compact, focus }: { controls: React.RefObject<OrbitControlsImpl | null>; compact: boolean; focus?: [number, number] | null }) {
  useEffect(() => {
    if (compact) return;
    const apply = (x: number, z: number, h = 24, y = 0) => {
      const ctl = controls.current;
      if (!ctl || ![x, z, h, y].every(Number.isFinite)) return;
      ctl.object.position.set(x, h, z);
      ctl.target.set(0, y, 0);
      ctl.update();
    };
    const win = window as Window & { __setCam?: (x: number, z: number, h?: number, y?: number) => void };
    win.__setCam = apply;
    const query = new URLSearchParams(window.location.search).get('cam');
    if (query) {
      const [x, z, h, y] = query.split(',').map(Number);
      window.setTimeout(() => apply(x, z, h || 24, Number.isFinite(y) ? y : 0), 0);
    }
    return () => { if (win.__setCam === apply) delete win.__setCam; };
  }, [compact, controls]);
  useEffect(() => {
    if (compact || !focus || !controls.current) return;
    const ctl = controls.current;
    ctl.target.set(focus[0], 0, focus[1]);
    ctl.object.position.set(focus[0], 15.5, focus[1] + 9.5);
    ctl.update();
  }, [compact, focus?.[0], focus?.[1]]);
  useFrame(() => {
    if (!controls.current) return;
    const p = controls.current.object.position;
    p.x = THREE.MathUtils.clamp(p.x, -18, 18);
    p.z = THREE.MathUtils.clamp(p.z, -14, 18);
    controls.current.target.x = THREE.MathUtils.clamp(controls.current.target.x, -13.5, 13.5);
    controls.current.target.z = THREE.MathUtils.clamp(controls.current.target.z, -8.5, 8.5);
    if (compact) controls.current.target.set(0, 0, 0);
  });
  return null;
}

export function PolitikTable({
  scene,
  tokens = [],
  hotspots = [],
  onPick,
  camera = 'device',
  className,
  focus,
}: {
  scene: PolitikSceneDef;
  tokens?: PolitikBoardToken[];
  hotspots?: PolitikBoardHotspot[];
  onPick?: (id: string) => void;
  camera?: 'tv' | 'device' | 'mini';
  className?: string;
  focus?: [number, number] | null;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const compact = camera === 'mini';
  return (
    <div className={className ?? 'pk-table'}>
      <Canvas
        key={camera}
        shadows={!compact}
        dpr={compact ? 1 : [1, 1.7]}
        camera={{ position: compact ? [0, 29, 0.01] : camera === 'tv' ? [0, 24, 16] : [0, 27, 12], fov: compact ? 38 : 39, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#030707']} />
        <ambientLight intensity={1.45} />
        <directionalLight position={[-9, 18, 8]} intensity={2.1} castShadow={!compact} shadow-mapSize={[1024, 1024]} />
        <Suspense fallback={null}>
          <BoardPlane scene={scene} />
          {tokens.map((token) => <BoardToken key={token.id} scene={scene} token={token} />)}
          {!compact && hotspots.map((spot) => <Hotspot key={spot.id} scene={scene} spot={spot} onPick={onPick} />)}
        </Suspense>
        <OrbitControls
          ref={controls}
          makeDefault
          enabled={!compact}
          enablePan={camera === 'tv'}
          enableRotate
          enableZoom
          minDistance={camera === 'tv' ? 18 : 21}
          maxDistance={camera === 'tv' ? 37 : 33}
          minPolarAngle={0.08}
          maxPolarAngle={camera === 'tv' ? 1.03 : 0.78}
          target={[0, 0, 0]}
        />
        <CameraRig controls={controls} compact={compact} focus={focus} />
      </Canvas>
    </div>
  );
}

export function PolitikCardPlane({
  scene,
  card,
  position,
  size = [1.22, 1.72],
  rotation = [-Math.PI / 2, 0, 0],
  back = false,
  lift = 0,
}: {
  scene: PolitikSceneDef;
  card: PolitikCardRef;
  position: [number, number, number];
  size?: [number, number];
  rotation?: [number, number, number];
  back?: boolean;
  lift?: number;
}) {
  const sheet = scene.sheets[String(card.sheet)];
  const source = useLoader(THREE.TextureLoader, back ? sheet?.back ?? scene.logo : sheet?.face ?? scene.logo);
  const texture = useMemo(() => {
    const clone = source.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = 8;
    clone.wrapS = THREE.ClampToEdgeWrapping;
    clone.wrapT = THREE.ClampToEdgeWrapping;
    if (!back && sheet) {
      const col = card.cell % sheet.cols;
      const row = Math.floor(card.cell / sheet.cols);
      clone.repeat.set(1 / sheet.cols, 1 / sheet.rows);
      clone.offset.set(col / sheet.cols, 1 - (row + 1) / sheet.rows);
    }
    clone.needsUpdate = true;
    return clone;
  }, [source, sheet, card.cell, back]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[position[0], position[1] + lift, position[2]]} rotation={rotation} castShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial map={texture} roughness={0.82} side={THREE.DoubleSide} />
    </mesh>
  );
}
