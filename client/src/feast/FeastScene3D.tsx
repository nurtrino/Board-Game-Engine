import {
  Component, Suspense, useMemo, useState,
  type CSSProperties, type ErrorInfo, type ReactNode,
} from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useTexture } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { Box3, Color, Mesh, MeshStandardMaterial, Object3D, SRGBColorSpace, Vector3 } from 'three';
import type { FeastActionSpaceView, FeastSeatColor } from '@bge/shared';
import type { FeastScene } from './FeastScene';

const SEAT_COLOR: Record<FeastSeatColor, string> = {
  Red: '#a94136',
  Blue: '#2c6684',
  Purple: '#604a78',
  Green: '#4f7656',
};

function webGl2Available(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', {
      alpha: false, antialias: true, depth: true, stencil: true,
      premultipliedAlpha: true, preserveDrawingBuffer: false,
      powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false,
    });
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

function ActionBoard2D({ scene, spaces }: { scene: FeastScene; spaces: readonly FeastActionSpaceView[] }) {
  return <div className="ft-action-board-2d" data-testid="feast-action-board-2d">
    <img src={scene.actionBoard.image} alt="Authentic A Feast for Odin action board" />
    <div className="ft-action-board-2d-workers" aria-label="Workers placed on action spaces">
      {spaces.flatMap((space) => space.occupants.filter((occupant) => occupant.copiedFrom === null)
        .map((occupant, index) => <span key={`${space.id}-${occupant.seat}-${index}`} style={{
          '--worker': SEAT_COLOR[occupant.workerColor],
          left: `${(space.bounds.x + space.bounds.width / 2) * 100}%`,
          top: `${(space.bounds.y + space.bounds.height / 2) * 100}%`,
        } as CSSProperties} title={`${occupant.workers} Viking${occupant.workers === 1 ? '' : 's'} · ${space.name}`}>
          <i />{occupant.workers > 1 && <b>{occupant.workers}</b>}
        </span>))}
    </div>
    <em>ILLUSTRATED TABLE MODE</em>
  </div>;
}

class FeastWebGlBoundary extends Component<{
  fallback: ReactNode; children: ReactNode;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* illustrated fallback remains fully usable */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function BoardSurface({ image }: { image: string }) {
  const texture = useTexture(image);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} receiveShadow>
        <planeGeometry args={[7, 14]} />
        <meshStandardMaterial map={texture} roughness={0.74} metalness={0.02} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
        <planeGeometry args={[7.18, 14.18]} />
        <meshStandardMaterial color="#5c3b20" roughness={0.88} />
      </mesh>
    </group>
  );
}

function preparePawn(source: Object3D, color: string): { object: Object3D; scale: number; seatY: number } {
  const object = source.clone(true);
  const material = new MeshStandardMaterial({ color: new Color(color), roughness: 0.58, metalness: 0.02 });
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const scale = 0.33 / Math.max(size.x, size.z, 0.001);
  return { object, scale, seatY: 0.08 - box.min.y * scale };
}

function VikingPawn({ source, color, position, yaw = 0 }: {
  source: Object3D;
  color: string;
  position: [number, number];
  yaw?: number;
}) {
  const prepared = useMemo(() => preparePawn(source, color), [source, color]);
  return (
    <primitive
      object={prepared.object}
      scale={prepared.scale}
      rotation={[0, Math.PI + yaw, 0]}
      position={[position[0], prepared.seatY, position[1]]}
    />
  );
}

function FirstPlayerMoose({ scene }: { scene: FeastScene }) {
  const modelUrl = scene.models?.firstPlayer?.model;
  if (!modelUrl) return null;
  return <FirstPlayerMooseModel modelUrl={modelUrl} />;
}

function FirstPlayerMooseModel({ modelUrl }: { modelUrl: string }) {
  const source = useLoader(OBJLoader, modelUrl);
  const prepared = useMemo(() => {
    const object = source.clone(true);
    const material = new MeshStandardMaterial({ color: new Color('#d5a64c'), roughness: 0.48, metalness: 0.08 });
    object.traverse((child) => { if (child instanceof Mesh) { child.material = material; child.castShadow = true; } });
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const scale = 0.78 / Math.max(size.x, size.z, 0.001);
    return { object, scale, seatY: 0.08 - box.min.y * scale };
  }, [source]);
  return <primitive object={prepared.object} scale={prepared.scale} rotation={[0, -0.4, 0]} position={[4.15, prepared.seatY, -5.45]} />;
}

function Workers({ scene, spaces }: { scene: FeastScene; spaces: readonly FeastActionSpaceView[] }) {
  const modelUrl = scene.models?.viking?.model ?? '/feast/models/viking.obj';
  const source = useLoader(OBJLoader, modelUrl);
  const workers = spaces.flatMap((space) => space.occupants.filter((occupant) => occupant.copiedFrom === null).flatMap((occupant, occupancyIndex) => {
    const centerX = (space.bounds.x + space.bounds.width / 2 - 0.5) * 7;
    const centerZ = (space.bounds.y + space.bounds.height / 2 - 0.5) * 14;
    const count = Math.max(1, occupant.workers);
    return Array.from({ length: count }, (_, workerIndex) => {
      const column = workerIndex % 2;
      const row = Math.floor(workerIndex / 2);
      const widthOffset = count === 1 ? 0 : (column - 0.5) * 0.28;
      const depthOffset = count <= 2 ? 0 : (row - 0.5) * 0.28;
      return {
        key: `${space.id}-${occupancyIndex}-${workerIndex}`,
        color: SEAT_COLOR[occupant.workerColor],
        x: centerX + widthOffset,
        z: centerZ + depthOffset,
        yaw: (workerIndex - count / 2) * 0.12,
      };
    });
  }));
  return <>{workers.map((worker) => <VikingPawn key={worker.key} source={source} color={worker.color} position={[worker.x, worker.z]} yaw={worker.yaw} />)}</>;
}

function Table({ scene, spaces }: { scene: FeastScene; spaces: readonly FeastActionSpaceView[] }) {
  return (
    <>
      <color attach="background" args={['#050b0d']} />
      <ambientLight intensity={0.58} />
      <directionalLight position={[-5, 11, 5]} intensity={1.55} color="#fff2d2" castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[6, 5, -6]} intensity={0.75} color="#78aeb7" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <planeGeometry args={[28, 28]} />
        <meshStandardMaterial color="#101c1d" roughness={0.94} />
      </mesh>
      <BoardSurface image={scene.actionBoard.image} />
      <Workers scene={scene} spaces={spaces} />
      <FirstPlayerMoose scene={scene} />
      <PerspectiveCamera makeDefault position={[0, 12.8, 10.6]} fov={42} near={0.1} far={70} />
      <OrbitControls target={[0, 0, 0]} enablePan minDistance={8.2} maxDistance={23} minPolarAngle={0.25} maxPolarAngle={1.1} />
    </>
  );
}

export function FeastScene3D({ scene, spaces }: { scene: FeastScene; spaces: readonly FeastActionSpaceView[] }) {
  const [useWebGl] = useState(webGl2Available);
  const fallback = <ActionBoard2D scene={scene} spaces={spaces} />;
  if (!useWebGl) return fallback;
  return (
    <FeastWebGlBoundary fallback={fallback}>
      <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }}>
        <Suspense fallback={null}><Table scene={scene} spaces={spaces} /></Suspense>
      </Canvas>
    </FeastWebGlBoundary>
  );
}
