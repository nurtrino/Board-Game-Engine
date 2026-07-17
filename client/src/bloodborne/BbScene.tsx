// Bloodborne TV scene — a physically grounded, lazy-loaded 3D table. Tile art
// comes from the staged TTS source; complete multipart sculpts retain their
// original transforms and materials in Meshopt/WebP GLBs. Camera framing scales
// with the revealed map while preserving orbit controls and ?cam=x,z,h[,y].

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { BbView } from '@bge/shared';
import {
  BB_TILE_W, BB_SEAT_HEX, bbSpaceWorld, bbTileArt, bbTokenArt,
  bbHunterMini, bbEnemyMini, bbEnemyStandee, bbBossMini, bbMiniGlb,
} from './bb-assets';

const BOARD_Y = 0;

type OccupantKind = 'hunter' | 'enemy' | 'boss';

// These match the maximum horizontal dimensions passed to Mini below. Layout
// reserves that footprint even while a model is suspended and showing a pawn,
// so resolving a wide boss cannot suddenly interpenetrate its neighbors.
const OCCUPANT_FOOTPRINT: Record<OccupantKind, number> = {
  hunter: 1.55,
  enemy: 2.05,
  boss: 4.2,
};

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

function prepareTexture(texture: THREE.Texture, maxAnisotropy: number) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
}

function usePreparedColorTexture(texture: THREE.Texture, maxAnisotropy: number) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    prepareTexture(texture, maxAnisotropy);
    // Texture color-space/anisotropy changes happen after Suspense resolves;
    // explicitly wake the demand renderer for the corrected upload.
    invalidate();
  }, [texture, maxAnisotropy, invalidate]);
}

let softContactTexture: THREE.CanvasTexture | null = null;
function getSoftContactTexture() {
  if (softContactTexture) return softContactTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(0,0,0,0.72)');
  gradient.addColorStop(0.42, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  softContactTexture = new THREE.CanvasTexture(canvas);
  softContactTexture.colorSpace = THREE.NoColorSpace;
  softContactTexture.minFilter = THREE.LinearFilter;
  softContactTexture.magFilter = THREE.LinearFilter;
  softContactTexture.generateMipmaps = false;
  softContactTexture.needsUpdate = true;
  return softContactTexture;
}

function SoftContactShadow({ size, opacity = 0.42 }: { size: number; opacity?: number }) {
  const texture = useMemo(() => getSoftContactTexture(), []);
  return (
    <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false}
        toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

// ---------- tile plate ----------

function TilePlate({ art, x, z, rot, fogged }: { art: string; x: number; z: number; rot: number; fogged: boolean }) {
  const texture = useLoader(THREE.TextureLoader, art);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  usePreparedColorTexture(texture, maxAnisotropy);
  return (
    <group position={[x, BOARD_Y, z]} rotation={[0, -rot * Math.PI / 2, 0]}>
      <mesh position={[0, -0.09, 0]} castShadow receiveShadow>
        <boxGeometry args={[BB_TILE_W, 0.16, BB_TILE_W]} />
        <meshStandardMaterial color="#171318" roughness={0.84} metalness={0.045} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BB_TILE_W - 0.06, BB_TILE_W - 0.06]} />
        <meshStandardMaterial map={texture} roughness={0.86} metalness={0.005}
          emissive="#241f25" emissiveMap={texture} emissiveIntensity={0.13} />
      </mesh>
      {fogged && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
          <planeGeometry args={[BB_TILE_W - 0.08, BB_TILE_W - 0.08]} />
          <meshStandardMaterial color="#617793" emissive="#1d2a40" emissiveIntensity={0.22}
            transparent opacity={0.2} depthWrite={false} roughness={0.78}
            polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      )}
    </group>
  );
}

function TileFallback({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, BOARD_Y, z]} rotation={[0, -rot * Math.PI / 2, 0]}>
      <mesh position={[0, -0.09, 0]} castShadow receiveShadow>
        <boxGeometry args={[BB_TILE_W, 0.16, BB_TILE_W]} />
        <meshStandardMaterial color="#171318" roughness={0.84} metalness={0.045} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BB_TILE_W - 0.06, BB_TILE_W - 0.06]} />
        <meshStandardMaterial color="#282229" roughness={0.9} metalness={0.005} />
      </mesh>
    </group>
  );
}

// ---------- minis ----------

function tuneMiniMaterial(material: THREE.Material, maxAnisotropy: number) {
  const pbr = material as THREE.MeshStandardMaterial;
  const textures = [
    pbr.map, pbr.normalMap, pbr.roughnessMap, pbr.metalnessMap,
    pbr.emissiveMap, pbr.aoMap, pbr.alphaMap,
  ];
  for (const texture of textures) {
    if (!texture) continue;
    texture.anisotropy = Math.min(4, maxAnisotropy);
    texture.needsUpdate = true;
  }
}

/**
 * Find the center of the geometry that actually meets the board. Full-model
 * bounds are a poor anchor for minis: a long weapon or trailing coat can move
 * their center far away from the molded base. Averaging a thin slice at the
 * bottom keeps the table marker locked to the contact footprint instead.
 */
function miniContactCenter(root: THREE.Object3D, bounds: THREE.Box3): THREE.Vector2 {
  root.updateMatrixWorld(true);
  const height = Math.max(bounds.max.y - bounds.min.y, 1e-6);
  const contactCeiling = bounds.min.y + Math.max(0.065, height * 0.035);
  const point = new THREE.Vector3();
  let sumX = 0;
  let sumZ = 0;
  let count = 0;

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.getAttribute('position');
    if (!positions) return;
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
      if (point.y > contactCeiling) continue;
      sumX += point.x;
      sumZ += point.z;
      count += 1;
    }
  });

  return count > 0
    ? new THREE.Vector2(sumX / count, sumZ / count)
    : new THREE.Vector2(
        (bounds.min.x + bounds.max.x) / 2,
        (bounds.min.z + bounds.max.z) / 2,
      );
}

// The staged sculpts face +Z while the table camera sits at +Z looking in:
// without the half-turn every model shows the camera its back.
function Mini({ slug, x, z, tint, targetH = 1.15, maxFootprint = 2, yaw = Math.PI }: {
  slug: string; x: number; z: number; tint?: string; targetH?: number; maxFootprint?: number; yaw?: number;
}) {
  // useGLTF caches by URL and only requests models that are actually on board.
  // The cache is intentionally retained: live clones share the source geometry,
  // materials, and textures, including with the personal hunter viewer. Clearing
  // a departing piece can invalidate another live clone. Growth is bounded by
  // the staged 49-model manifest, while Canvas teardown releases its GPU context.
  // The third argument enables the bundled Meshopt decoder; no CDN is needed.
  const { scene: source } = useGLTF(bbMiniGlb(slug), false, true);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const { scene, scale, offset } = useMemo(() => {
    const clone = source.clone(true);
    clone.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => tuneMiniMaterial(material, maxAnisotropy));
    });
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const contactCenter = miniContactCenter(clone, box);
    const heightScale = targetH / Math.max(size.y, 1e-6);
    const footprintScale = maxFootprint / Math.max(size.x, size.z, 1e-6);
    const modelScale = Math.min(heightScale, footprintScale);
    return {
      scene: clone,
      scale: modelScale,
      offset: new THREE.Vector3(
        -contactCenter.x * modelScale,
        -box.min.y * modelScale + 0.018,
        -contactCenter.y * modelScale,
      ),
    };
  }, [source, targetH, maxFootprint, maxAnisotropy]);

  return (
    <group position={[x, BOARD_Y, z]} rotation={[0, yaw, 0]}>
      <SoftContactShadow size={Math.min(maxFootprint * 0.72, Math.max(0.82, targetH * 0.82))} />
      {tint && (
        <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[targetH * 0.36, targetH * 0.44, 40]} />
          <meshBasicMaterial color={tint} transparent opacity={0.88} depthWrite={false}
            toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      )}
      <primitive object={scene} position={offset} scale={scale} dispose={null} />
    </group>
  );
}

function Standee({ img, x, z, tint, h = 1.25 }: { img: string; x: number; z: number; tint?: string; h?: number }) {
  const texture = useLoader(THREE.TextureLoader, img);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  usePreparedColorTexture(texture, maxAnisotropy);
  const aspect = texture.image?.width && texture.image?.height ? texture.image.width / texture.image.height : 0.72;
  return (
    <group position={[x, BOARD_Y, z]}>
      <SoftContactShadow size={1.08} opacity={0.4} />
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.43, 0.47, 0.08, 32]} />
        <meshStandardMaterial color="#171419" roughness={0.65} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.09 + h / 2, 0]} castShadow>
        <planeGeometry args={[h * aspect, h]} />
        <meshStandardMaterial map={texture} transparent alphaTest={0.18} side={THREE.DoubleSide}
          roughness={0.72} metalness={0} />
      </mesh>
      {tint && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.55, 36]} />
          <meshBasicMaterial color={tint} transparent opacity={0.82} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Last-resort pawn for future content without a staged source model. */
function Pawn({ x, z, color, h = 1.0 }: { x: number; z: number; color: string; h?: number }) {
  return (
    <group position={[x, BOARD_Y, z]}>
      <SoftContactShadow size={Math.max(0.72, h * 0.78)} opacity={0.4} />
      <mesh position={[0, 0.045, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[h * 0.3, h * 0.34, 0.09, 28]} />
        <meshStandardMaterial color="#151419" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, h * 0.51, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[h * 0.22, h * 0.55, 6, 14]} />
        <meshStandardMaterial color={color} roughness={0.58} />
      </mesh>
    </group>
  );
}

// ---------- tokens ----------

function TokenDisc({ img, x, z, r = 0.55, y = 0.03 }: { img: string; x: number; z: number; r?: number; y?: number }) {
  const texture = useLoader(THREE.TextureLoader, img);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  usePreparedColorTexture(texture, maxAnisotropy);
  return (
    <group position={[x, BOARD_Y + y, z]}>
      <group position={[0, -y, 0]}><SoftContactShadow size={r * 1.65} opacity={0.32} /></group>
      <mesh position={[0, 0.025, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, 0.07, 32]} />
        <meshStandardMaterial color="#201c21" roughness={0.72} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.064, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[r * 0.94, 32]} />
        <meshStandardMaterial map={texture} transparent alphaTest={0.22} roughness={0.82} />
      </mesh>
    </group>
  );
}

function TokenFallback({ x, z, r = 0.55, y = 0.03 }: { x: number; z: number; r?: number; y?: number }) {
  return (
    <group position={[x, BOARD_Y + y, z]}>
      <group position={[0, -y, 0]}><SoftContactShadow size={r * 1.65} opacity={0.32} /></group>
      <mesh position={[0, 0.025, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, 0.07, 32]} />
        <meshStandardMaterial color="#302a32" roughness={0.78} metalness={0.06} />
      </mesh>
    </group>
  );
}

function AsyncToken(props: Parameters<typeof TokenDisc>[0]) {
  return (
    <Suspense fallback={<TokenFallback x={props.x} z={props.z} r={props.r} y={props.y} />}>
      <TokenDisc {...props} />
    </Suspense>
  );
}

// ---------- camera ----------

function CameraRig({ view }: { view: BbView }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, invalidate } = useThree();
  const initialized = useRef(false);
  const cameraOverride = useRef(false);
  const interacting = useRef(false);
  const reducedMotion = useReducedMotion();
  const transition = useRef({
    active: false,
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
  });
  const tileFrameKey = view.tiles
    .map((tile) => `${tile.x},${tile.y}`)
    .sort()
    .join('|');
  // Follow the hunter whose turn it is, zoomed in tight; fall back to the
  // whole-map frame between turns.
  const activeHunter = view.activeSeat != null ? view.hunters[view.activeSeat] : null;
  const activeSpace = activeHunter?.space ?? null;
  const focusKey = `${view.activeSeat ?? ''}:${activeSpace ?? ''}`;
  const frame = useMemo(() => {
    if (!view.tiles.length) return { center: new THREE.Vector3(), distance: 16 };
    const focus = activeSpace ? bbSpaceWorld(view, activeSpace) : null;
    if (focus) {
      return { center: new THREE.Vector3(focus[0], 0.55, focus[1]), distance: 13, follow: true };
    }
    const xs = view.tiles.map((tile) => tile.x * BB_TILE_W);
    const zs = view.tiles.map((tile) => tile.y * BB_TILE_W);
    const minX = Math.min(...xs) - BB_TILE_W / 2;
    const maxX = Math.max(...xs) + BB_TILE_W / 2;
    const minZ = Math.min(...zs) - BB_TILE_W / 2;
    const maxZ = Math.max(...zs) + BB_TILE_W / 2;
    const aspect = Math.max(size.width / Math.max(size.height, 1), 1);
    const fittedSpan = Math.max(maxZ - minZ, (maxX - minX) / (aspect * 0.88));
    return {
      center: new THREE.Vector3((minX + maxX) / 2, 0.42, (minZ + maxZ) / 2),
      distance: THREE.MathUtils.clamp(fittedSpan * 1.28, 15, 68),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileFrameKey, focusKey, size.width, size.height]);

  useEffect(() => {
    const orbit = controls.current;
    // Do not lock in the placeholder lobby camera before the first tile arrives.
    if (!orbit || !view.tiles.length) return;
    const rawCamera = new URLSearchParams(window.location.search).get('cam');
    if (!initialized.current && rawCamera) {
      initialized.current = true;
      cameraOverride.current = true;
      const values = rawCamera.split(',').map(Number);
      const cx = Number.isFinite(values[0]) ? values[0] : frame.center.x;
      const cz = Number.isFinite(values[1]) ? values[1] : frame.center.z + 10;
      const height = Number.isFinite(values[2]) ? values[2] : 18;
      const targetY = Number.isFinite(values[3]) ? values[3] : 0;
      camera.position.set(cx, height, cz);
      orbit.target.set(cx, targetY, cz - 6);
      orbit.update();
      invalidate();
      return;
    }
    if (cameraOverride.current) return;

    if (!initialized.current) {
      initialized.current = true;
      camera.position.set(
        frame.center.x + frame.distance * 0.12,
        frame.center.y + frame.distance * 0.72,
        frame.center.z + frame.distance * 0.69,
      );
      orbit.target.copy(frame.center);
      orbit.update();
      invalidate();
      return;
    }

    // Preserve the player's viewing angle. While following the active hunter,
    // commit to the tight follow distance; otherwise only expand the orbit
    // enough to fit newly revealed tiles.
    const direction = camera.position.clone().sub(orbit.target);
    if (direction.lengthSq() < 1e-6) direction.set(0.12, 0.72, 0.69);
    direction.normalize();
    const distance = (frame as { follow?: boolean }).follow
      ? frame.distance
      : Math.max(frame.distance, camera.position.distanceTo(orbit.target));
    transition.current.position.copy(frame.center).addScaledVector(direction, distance);
    transition.current.target.copy(frame.center);
    if (reducedMotion) {
      camera.position.copy(transition.current.position);
      orbit.target.copy(transition.current.target);
      orbit.update();
      transition.current.active = false;
    } else {
      transition.current.active = true;
    }
    invalidate();
  }, [camera, frame, invalidate, reducedMotion, view.tiles.length]);

  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit || interacting.current || !transition.current.active) return;
    const blend = 1 - Math.exp(-delta * 3.4);
    camera.position.lerp(transition.current.position, blend);
    orbit.target.lerp(transition.current.target, blend);
    orbit.update();
    if (
      camera.position.distanceToSquared(transition.current.position) < 0.0004
      && orbit.target.distanceToSquared(transition.current.target) < 0.0004
    ) {
      camera.position.copy(transition.current.position);
      orbit.target.copy(transition.current.target);
      orbit.update();
      transition.current.active = false;
      return;
    }
    invalidate();
  });

  return (
    <OrbitControls ref={controls} makeDefault enableDamping={!reducedMotion} dampingFactor={0.075}
      enablePan enableRotate enableZoom minDistance={5} maxDistance={110}
      maxPolarAngle={Math.PI * 0.44}
      onStart={() => {
        interacting.current = true;
        transition.current.active = false;
      }}
      onEnd={() => {
        interacting.current = false;
        // A reveal/resize may have queued a transition while the demand loop's
        // only frame was suppressed by an active pointer gesture.
        if (transition.current.active) invalidate();
      }} />
  );
}

// ---------- table lighting / atmosphere ----------

function TableStage({ view }: { view: BbView }) {
  const keyLight = useRef<THREE.DirectionalLight>(null);
  const fillLight = useRef<THREE.SpotLight>(null);
  const lightTarget = useRef<THREE.Object3D>(null);
  const invalidate = useThree((state) => state.invalidate);
  const frameKey = view.tiles
    .map((tile) => `${tile.uid}:${tile.x},${tile.y}`)
    .sort()
    .join('|');
  const frame = useMemo(() => {
    if (!view.tiles.length) {
      return { cx: 0, cz: 0, span: 24, shadowHalf: 22, groundRadius: 62, keyHeight: 32 };
    }
    const xs = view.tiles.map((tile) => tile.x * BB_TILE_W);
    const zs = view.tiles.map((tile) => tile.y * BB_TILE_W);
    const minX = Math.min(...xs) - BB_TILE_W / 2;
    const maxX = Math.max(...xs) + BB_TILE_W / 2;
    const minZ = Math.min(...zs) - BB_TILE_W / 2;
    const maxZ = Math.max(...zs) + BB_TILE_W / 2;
    const span = Math.max(maxX - minX, maxZ - minZ);
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      span,
      shadowHalf: THREE.MathUtils.clamp(span * 0.68 + 7, 18, 58),
      groundRadius: THREE.MathUtils.clamp(span * 1.7, 62, 118),
      keyHeight: THREE.MathUtils.clamp(span * 0.42 + 25, 30, 50),
    };
  }, [frameKey, view.tiles.length]);
  const lightOffset = THREE.MathUtils.clamp(frame.span * 0.38, 15, 28);

  useEffect(() => {
    const target = lightTarget.current;
    const key = keyLight.current;
    const fill = fillLight.current;
    if (!target || !key || !fill) return;
    key.target = target;
    fill.target = target;
    target.updateMatrixWorld(true);
    const camera = key.shadow.camera as THREE.OrthographicCamera;
    camera.left = -frame.shadowHalf;
    camera.right = frame.shadowHalf;
    camera.top = frame.shadowHalf;
    camera.bottom = -frame.shadowHalf;
    camera.near = 1;
    camera.far = Math.max(100, frame.keyHeight * 3.2);
    camera.updateProjectionMatrix();
    key.shadow.needsUpdate = true;
    invalidate();
  }, [frame.cx, frame.cz, frame.shadowHalf, frame.keyHeight, invalidate]);

  return (
    <>
      <object3D ref={lightTarget} position={[frame.cx, 0.25, frame.cz]} />

      {/* Low global fill preserves black values; the warm key does the visual
          modeling, with cool and blood-red separation from the backdrop. */}
      <hemisphereLight intensity={0.42} color="#a7b9d0" groundColor="#17080d" />
      <ambientLight intensity={0.075} color="#9aaac0" />
      <directionalLight ref={keyLight}
        position={[frame.cx + lightOffset, frame.keyHeight, frame.cz + lightOffset * 0.68]}
        intensity={3.1} color="#efd4bd" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-frame.shadowHalf} shadow-camera-right={frame.shadowHalf}
        shadow-camera-top={frame.shadowHalf} shadow-camera-bottom={-frame.shadowHalf}
        shadow-camera-near={1} shadow-camera-far={Math.max(100, frame.keyHeight * 3.2)}
        shadow-bias={-0.0001} shadow-normalBias={0.022} shadow-radius={2.5} />
      <spotLight ref={fillLight}
        position={[frame.cx - lightOffset * 1.12, frame.keyHeight * 0.72, frame.cz - lightOffset * 0.8]}
        intensity={112} color="#7088bd" angle={0.78} penumbra={0.94}
        distance={Math.max(72, frame.span * 2.25)} decay={2} />
      <pointLight position={[frame.cx + lightOffset * 0.82, 7.5, frame.cz + lightOffset]}
        intensity={46} distance={Math.max(48, frame.span * 1.3)} decay={2} color="#8e302d" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[frame.cx, -0.19, frame.cz]} receiveShadow>
        <circleGeometry args={[frame.groundRadius, 96]} />
        <meshBasicMaterial color="#000000" toneMapped={false} />
      </mesh>

    </>
  );
}

// ---------- piece layout ----------

function spread(items: { key: string; kind: OccupantKind }[], x: number, z: number): Map<string, [number, number]> {
  const output = new Map<string, [number, number]>();
  const count = items.length;
  if (count === 0) return output;
  if (count === 1) {
    output.set(items[0].key, [x, z]);
    return output;
  }

  // Place centers on the smallest common orbit whose pairwise chords clear the
  // reserved footprint discs. Considering every pair also handles mixed groups
  // (for example a wide boss with several hunters) without order-dependent gaps.
  const gap = 0.14;
  let radius = 0;
  for (let left = 0; left < count; left++) {
    for (let right = left + 1; right < count; right++) {
      const steps = Math.min(right - left, count - (right - left));
      const chordAtUnitRadius = 2 * Math.sin((Math.PI * steps) / count);
      const clearance = (
        OCCUPANT_FOOTPRINT[items[left].kind] / 2
        + OCCUPANT_FOOTPRINT[items[right].kind] / 2
        + gap
      );
      radius = Math.max(radius, clearance / chordAtUnitRadius);
    }
  }

  items.forEach((item, index) => {
    const angle = (index / count) * Math.PI * 2;
    output.set(item.key, [x + Math.cos(angle) * radius, z + Math.sin(angle) * radius]);
  });
  return output;
}

// ---------- the scene ----------

export function BbScene({ view }: { view: BbView }) {
  const occupants = useMemo(() => {
    const grouped = new Map<string, { key: string; kind: OccupantKind }[]>();
    const push = (space: string | null, key: string, kind: OccupantKind) => {
      if (!space) return;
      if (!grouped.has(space)) grouped.set(space, []);
      grouped.get(space)!.push({ key, kind });
    };
    for (const hunter of view.hunters) push(hunter.space, `h${hunter.seat}`, 'hunter');
    for (const enemy of view.enemies) push(enemy.space, `e${enemy.uid}`, 'enemy');
    for (const boss of view.bosses) push(boss.space, `b${boss.uid}`, 'boss');
    const positions = new Map<string, [number, number]>();
    for (const [space, items] of grouped) {
      const world = bbSpaceWorld(view, space);
      if (!world) continue;
      for (const [key, value] of spread(items, world[0], world[1])) positions.set(key, value);
    }
    return positions;
  }, [view.hunters, view.enemies, view.bosses, view.tiles]);

  return (
    <Canvas
      shadows="soft"
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.94;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      style={{ background: '#000000' }}
      camera={{ fov: 44, near: 0.15, far: 320, position: [0, 14, 11] }}
    >
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 58, 158]} />
      <TableStage view={view} />

      {view.tiles.map((tile) => (
        <Suspense key={tile.uid} fallback={
          <TileFallback x={tile.x * BB_TILE_W} z={tile.y * BB_TILE_W} rot={tile.rot} />
        }>
          <TilePlate key={tile.uid} art={bbTileArt(tile.tileId)} x={tile.x * BB_TILE_W} z={tile.y * BB_TILE_W}
            rot={tile.rot} fogged={view.fogGates.includes(tile.uid)} />
        </Suspense>
      ))}

      {view.consumableTokens.map((ref) => {
        const world = bbSpaceWorld(view, ref);
        return world ? <AsyncToken key={`c${ref}`} img={bbTokenArt('treasure-token')} x={world[0] + 1.6} z={world[1] + 1.4} r={0.5} /> : null;
      })}
      {view.brokenLamps.map((ref) => {
        const world = bbSpaceWorld(view, ref);
        return world ? <AsyncToken key={`bl${ref}`} img={bbTokenArt('broken-lamp-token')} x={world[0]} z={world[1] - 1.4} r={0.55} y={0.05} /> : null;
      })}
      {Object.entries(view.insightTokens).map(([ref, count]) => {
        const world = bbSpaceWorld(view, ref);
        return world && count > 0 ? <AsyncToken key={`i${ref}`} img={bbTokenArt('insight')} x={world[0] - 1.6} z={world[1] + 1.4} r={0.45} /> : null;
      })}
      {view.survivorTokens.map((ref, index) => {
        const world = bbSpaceWorld(view, ref);
        return world ? <AsyncToken key={`s${ref}${index}`} img={bbTokenArt('survivor-token')} x={world[0] - 1.2} z={world[1] - 1.2} r={0.5} /> : null;
      })}
      {view.corpseTokens.map((ref, index) => {
        const world = bbSpaceWorld(view, ref);
        return world ? <AsyncToken key={`k${ref}${index}`} img={bbTokenArt('corpse-token')} x={world[0] + 1.2} z={world[1] - 1.2} r={0.5} /> : null;
      })}

      {view.hunters.map((hunter) => {
        const position = occupants.get(`h${hunter.seat}`);
        if (!position || !hunter.space) return null;
        const mini = bbHunterMini(hunter.hunterId);
        const tint = BB_SEAT_HEX[String(view.seats[hunter.seat]?.color)] ?? '#999';
        return mini
          ? <Suspense key={`h${hunter.seat}`} fallback={<Pawn x={position[0]} z={position[1]} color={tint} h={1.3} />}>
              <Mini slug={mini} x={position[0]} z={position[1]} tint={tint} targetH={1.32} maxFootprint={1.55} />
            </Suspense>
          : <Pawn key={`h${hunter.seat}`} x={position[0]} z={position[1]} color={tint} h={1.3} />;
      })}

      {view.enemies.map((enemy) => {
        const position = occupants.get(`e${enemy.uid}`);
        if (!position) return null;
        const mini = bbEnemyMini(enemy.type);
        const standee = bbEnemyStandee(enemy.type);
        return mini
          ? <Suspense key={`e${enemy.uid}`} fallback={<Pawn x={position[0]} z={position[1]} color="#6a6f7a" h={1.0} />}>
              <Mini slug={mini} x={position[0]} z={position[1]} targetH={1.18} maxFootprint={2.05} />
            </Suspense>
          : standee
            ? <Suspense key={`e${enemy.uid}`} fallback={<Pawn x={position[0]} z={position[1]} color="#6a6f7a" h={1.0} />}>
                <Standee img={standee} x={position[0]} z={position[1]} />
              </Suspense>
            : <Pawn key={`e${enemy.uid}`} x={position[0]} z={position[1]} color="#6a6f7a" h={1.0} />;
      })}

      {view.bosses.map((boss) => {
        const position = occupants.get(`b${boss.uid}`);
        if (!position) return null;
        const mini = bbBossMini(boss.type);
        return mini
          ? <Suspense key={`b${boss.uid}`} fallback={<Pawn x={position[0]} z={position[1]} color="#8a3038" h={2.2} />}>
              <Mini slug={mini} x={position[0]} z={position[1]} targetH={2.35} maxFootprint={4.2} />
            </Suspense>
          : <Pawn key={`b${boss.uid}`} x={position[0]} z={position[1]} color="#8a3038" h={2.2} />;
      })}
      <CameraRig view={view} />
    </Canvas>
  );
}
