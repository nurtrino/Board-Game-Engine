import {
  Component, Suspense, useCallback, useEffect, useId, useMemo, useState,
  type CSSProperties, type KeyboardEvent, type ReactNode,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { bbHunterMini, bbMiniGlb } from './bb-assets';

interface Props {
  hunterId: string | null;
  hunterName: string;
  accent: string;
  /** Panel kicker, e.g. "HUNTER'S DREAM" on the stage view. */
  title?: string;
}

interface BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: () => void;
}

class WebGlBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function supportsWebGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    const options: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      failIfMajorPerformanceCaveat: true,
    };
    // three r169's WebGLRenderer is WebGL2-only. Treating a WebGL1 context as
    // sufficient just mounts a Canvas that is guaranteed to fail moments later.
    const context = probe.getContext('webgl2', options);
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function ContextLossGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLoss = () => onLost();
    canvas.addEventListener('webglcontextlost', handleLoss, { once: true });
    return () => canvas.removeEventListener('webglcontextlost', handleLoss);
  }, [gl, onLost]);

  return null;
}

function tuneMaterial(material: THREE.Material, maxAnisotropy: number): THREE.Material {
  const clone = material.clone();
  const pbr = clone as THREE.MeshStandardMaterial;
  const textures = [
    pbr.map, pbr.normalMap, pbr.roughnessMap, pbr.metalnessMap,
    pbr.emissiveMap, pbr.aoMap, pbr.alphaMap,
  ];
  for (const texture of textures) {
    if (!texture) continue;
    texture.anisotropy = Math.min(4, maxAnisotropy);
    texture.needsUpdate = true;
  }
  return clone;
}

function HunterMini({ slug, yaw }: { slug: string; yaw: number }) {
  // The third argument selects drei's bundled Meshopt decoder, matching the TV scene.
  const { scene: source } = useGLTF(bbMiniGlb(slug), false, true);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const { scene, scale, offset } = useMemo(() => {
    const clone = source.clone(true);
    clone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => tuneMaterial(material, maxAnisotropy))
        : tuneMaterial(mesh.material, maxAnisotropy);
    });

    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    // Anchor on the miniature's molded base, not the full silhouette — a
    // weapon held out to one side otherwise drags the figure off the ring.
    const baseCeiling = bounds.min.y + size.y * 0.12;
    const base = new THREE.Box3();
    const probe = new THREE.Vector3();
    clone.updateWorldMatrix(true, true);
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry?.attributes?.position;
      if (!position) return;
      const stride = Math.max(1, Math.floor(position.count / 4000));
      for (let i = 0; i < position.count; i += stride) {
        probe.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        if (probe.y <= baseCeiling) base.expandByPoint(probe);
      }
    });
    const anchor = base.isEmpty() ? center : base.getCenter(new THREE.Vector3());
    const heightScale = 2.48 / Math.max(size.y, 1e-6);
    const footprintScale = 2.18 / Math.max(size.x, size.z, 1e-6);
    const fittedScale = Math.min(heightScale, footprintScale);
    return {
      scene: clone,
      scale: fittedScale,
      offset: new THREE.Vector3(
        -anchor.x * fittedScale,
        0.15 - bounds.min.y * fittedScale,
        -anchor.z * fittedScale,
      ),
    };
  }, [source, maxAnisotropy]);

  useEffect(() => () => {
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const material = (child as THREE.Mesh).material;
      (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose());
    });
  }, [scene]);

  return (
    <group rotation={[0, yaw, 0]}>
      <primitive object={scene} position={offset} scale={scale} dispose={null} />
    </group>
  );
}

function Pedestal({ accent }: { accent: string }) {
  return (
    <group>
      <mesh position={[0, 0.065, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.06, 1.16, 0.13, 64]} />
        <meshStandardMaterial color="#16171b" roughness={0.66} metalness={0.34} />
      </mesh>
      <mesh position={[0, 0.135, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.87, 1.03, 64]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.28}
          roughness={0.5} metalness={0.44} />
      </mesh>
    </group>
  );
}

function LoadingMini({ accent }: { accent: string }) {
  return (
    <group position={[0, 0.14, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.23, 0.38, 1.18, 12]} />
        <meshStandardMaterial color="#20252b" emissive={accent} emissiveIntensity={0.08}
          roughness={0.92} transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, 1.47, 0]} castShadow>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial color="#20252b" roughness={0.92} transparent opacity={0.72} />
      </mesh>
    </group>
  );
}

function StaticFallback({ label }: { label: string }) {
  return (
    <div className="bb-hunter-viewer-fallback" role="img" aria-label={label}>
      <span className="bb-hunter-viewer-silhouette" aria-hidden="true" />
    </div>
  );
}

export default function BbHunterViewer({ hunterId, hunterName, accent, title = "HUNTER'S PRESENCE" }: Props) {
  const slug = bbHunterMini(hunterId);
  const webGlAvailable = useMemo(supportsWebGl, []);
  const reducedMotion = useReducedMotion();
  const [contextLost, setContextLost] = useState(false);
  // Sculpts face +Z-flipped; start half-turned so the hunter faces the camera.
  const [yaw, setYaw] = useState(Math.PI - 0.18);
  const labelId = useId();
  const hintId = useId();
  const markContextLost = useCallback(() => setContextLost(true), []);
  const style = { '--bb-hunter-accent': accent } as CSSProperties;
  const canRender = !!slug && webGlAvailable && !contextLost;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    setYaw((current) => current + direction * Math.PI / 12);
  };

  return (
    <section className="bb-hunter-viewer ig-glass" data-testid="bb-hunter-viewer"
      style={style} aria-labelledby={labelId}>
      <div className="bb-hunter-viewer-head">
        <span id={labelId}>{title}</span>
        <span id={hintId}>{canRender ? 'DRAG TO TURN / ARROW KEYS' : 'MINIATURE UNAVAILABLE'}</span>
      </div>
      {canRender ? (
        <div className="bb-hunter-viewer-stage" role="group" tabIndex={0}
          aria-label={`Interactive 3D miniature of ${hunterName}`}
          aria-describedby={hintId} onKeyDown={handleKeyDown}>
          <WebGlBoundary key={slug} onError={markContextLost}
            fallback={<StaticFallback label={`${hunterName} miniature unavailable`} />}>
            <Canvas
              aria-hidden="true"
              shadows="soft"
              frameloop="demand"
              dpr={[1, 1.5]}
              gl={{ antialias: true, alpha: true, stencil: false, powerPreference: 'high-performance' }}
              camera={{ fov: 30, near: 0.1, far: 30, position: [0, 1.42, 5.2] }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.04;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.setClearColor('#05070a', 0);
              }}
            >
              <ContextLossGuard onLost={markContextLost} />
              <hemisphereLight intensity={0.48} color="#a9c5e6" groundColor="#170b0d" />
              <ambientLight intensity={0.2} color="#8295ac" />
              <directionalLight position={[-3.2, 5.4, 3.5]} intensity={2.5} color="#bed8f7"
                castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}
                shadow-camera-left={-2.7} shadow-camera-right={2.7}
                shadow-camera-top={3.2} shadow-camera-bottom={-0.5}
                shadow-camera-near={1} shadow-camera-far={12}
                shadow-bias={-0.0001} shadow-normalBias={0.025} />
              <spotLight position={[3.4, 3.1, 4.1]} intensity={42} distance={12} decay={2}
                angle={0.58} penumbra={0.86} color="#e3c08d" />
              <pointLight position={[-2.8, 2.1, -2.4]} intensity={18} distance={8} decay={2}
                color="#7598c7" />
              <pointLight position={[2.1, 0.8, -1.8]} intensity={8} distance={6} decay={2}
                color="#a13d38" />

              <Pedestal accent={accent} />
              <Suspense fallback={<LoadingMini accent={accent} />}>
                <HunterMini slug={slug} yaw={yaw} />
                <ContactShadows position={[0, 0.14, 0]} opacity={0.72} scale={4.2}
                  blur={2.4} far={3.4} resolution={256} frames={1} color="#020204" />
              </Suspense>
              <OrbitControls makeDefault target={[0, 1.3, 0]} enablePan={false} enableZoom={false}
                minPolarAngle={1.08} maxPolarAngle={1.48} rotateSpeed={0.58}
                enableDamping={!reducedMotion} dampingFactor={0.08} />
            </Canvas>
          </WebGlBoundary>
        </div>
      ) : (
        <StaticFallback label={`${hunterName} miniature unavailable`} />
      )}
      <span className="bb-hunter-viewer-name" aria-hidden="true">{hunterName.toUpperCase()}</span>
    </section>
  );
}
