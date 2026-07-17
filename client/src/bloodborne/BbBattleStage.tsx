import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';

interface Props {
  hunterSlug: string | null;
  foeSlug: string | null;
  foeIsBoss: boolean;
  phase: string;
  hunterAttacking: boolean;
  accent: string;
}

type ActorSide = 'hunter' | 'foe';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function tuneMaterial(material: THREE.Material, maxAnisotropy: number) {
  const pbr = material as THREE.MeshStandardMaterial;
  for (const texture of [pbr.map, pbr.normalMap, pbr.roughnessMap, pbr.metalnessMap, pbr.emissiveMap, pbr.aoMap, pbr.alphaMap]) {
    if (!texture) continue;
    texture.anisotropy = Math.min(4, maxAnisotropy);
    texture.needsUpdate = true;
  }
}

function BattleMini({ slug, side, boss, active, reduced }: {
  slug: string;
  side: ActorSide;
  boss?: boolean;
  active: boolean;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const { scene: source } = useGLTF(`/bloodborne/minis/${slug}.glb`, false, true);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const fitted = useMemo(() => {
    const scene = source.clone(true);
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => tuneMaterial(material, maxAnisotropy));
    });
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const targetHeight = boss ? 3.35 : side === 'foe' ? 2.7 : 2.62;
    const targetWidth = boss ? 3.4 : 2.2;
    const scale = Math.min(
      targetHeight / Math.max(size.y, 1e-6),
      targetWidth / Math.max(size.x, size.z, 1e-6),
    );
    return {
      scene,
      scale,
      offset: new THREE.Vector3(-center.x * scale, 0.12 - bounds.min.y * scale, -center.z * scale),
    };
  }, [source, maxAnisotropy, boss, side]);

  const baseX = side === 'hunter' ? -2.15 : 2.15;
  const direction = side === 'hunter' ? 1 : -1;
  const strikeStartedAt = useRef<number | null>(null);
  const wasActive = useRef(active);
  useEffect(() => {
    if (!active || (active && !wasActive.current)) strikeStartedAt.current = null;
    wasActive.current = active;
  }, [active]);
  useFrame((state) => {
    const actor = group.current;
    if (!actor) return;
    let strike = 0;
    if (active && !reduced) {
      strikeStartedAt.current ??= state.clock.elapsedTime;
      const progress = Math.min((state.clock.elapsedTime - strikeStartedAt.current) / 0.48, 1);
      strike = Math.sin(progress * Math.PI) * 0.42;
    }
    actor.position.x = baseX + direction * strike;
    actor.position.y = 0;
    actor.rotation.z = direction * strike * -0.025;
  });

  // Sculpt fronts are +Z-flipped, so the half-turn keeps both actors facing the camera.
  return (
    <group ref={group} position={[baseX, 0, side === 'hunter' ? 0.12 : -0.04]}
      rotation={[0, side === 'hunter' ? Math.PI - 0.2 : 0.18, 0]}>
      <primitive object={fitted.scene} position={fitted.offset} scale={fitted.scale} dispose={null} />
    </group>
  );
}

function BattlePawn({ side, accent, boss }: { side: ActorSide; accent: string; boss?: boolean }) {
  const x = side === 'hunter' ? -2.15 : 2.15;
  const color = side === 'hunter' ? '#4b4d49' : '#54413d';
  const height = boss ? 2.8 : 2.25;
  return (
    <group position={[x, 0.12, 0]}>
      <mesh position={[0, height * 0.47, 0]} castShadow>
        <capsuleGeometry args={[height * 0.2, height * 0.58, 7, 16]} />
        <meshStandardMaterial color={color} roughness={0.82} metalness={0.06} />
      </mesh>
    </group>
  );
}

function ArenaFloor() {
  const texture = useTexture('/bloodborne/tiles/arena.webp');
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, maxAnisotropy);
    texture.needsUpdate = true;
  }, [texture, maxAnisotropy]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]} receiveShadow>
        <circleGeometry args={[7.7, 96]} />
        <meshStandardMaterial color="#050504" roughness={0.98} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[11.4, 11.4]} />
        <meshStandardMaterial map={texture} color="#aaa69b" roughness={0.94} metalness={0.01} />
      </mesh>
    </>
  );
}

function StageContents({ hunterSlug, foeSlug, foeIsBoss, phase, hunterAttacking, accent, reduced }: Props & { reduced: boolean }) {
  const enemyActive = phase === 'combat-dodge' || phase === 'combat-reaction' || phase === 'resolving';
  return (
    <>
      <color attach="background" args={['#030302']} />
      <fog attach="fog" args={['#050504', 8, 18]} />
      <hemisphereLight intensity={0.34} color="#c5c2b7" groundColor="#100d0a" />
      <ambientLight intensity={0.08} color="#a8a397" />
      <directionalLight position={[-4, 6.5, 4]} intensity={2.45} color="#d5d1c7" castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-0.0001}
        shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={5} shadow-camera-bottom={-1} />
      <spotLight position={[4.8, 4.5, 3.5]} intensity={34} color="#bca47d" angle={0.72} penumbra={0.94} distance={15} decay={2} />

      <ArenaFloor />

      <Suspense fallback={<BattlePawn side="hunter" accent={accent} />}>
        {hunterSlug ? <BattleMini slug={hunterSlug} side="hunter" active={hunterAttacking} reduced={reduced} />
          : <BattlePawn side="hunter" accent={accent} />}
      </Suspense>
      <Suspense fallback={<BattlePawn side="foe" accent="#8e332f" boss={foeIsBoss} />}>
        {foeSlug ? <BattleMini slug={foeSlug} side="foe" boss={foeIsBoss} active={enemyActive} reduced={reduced} />
          : <BattlePawn side="foe" accent="#8e332f" boss={foeIsBoss} />}
      </Suspense>

      <ContactShadows position={[0, 0.025, 0]} opacity={0.76} scale={11} blur={2.7} far={5}
        resolution={256} frames={reduced ? 1 : 20} color="#010102" />
    </>
  );
}

export default function BbBattleStage(props: Props) {
  const reduced = useReducedMotion();
  return (
    <Canvas className="bb-battle-canvas" shadows="soft" dpr={[1, 1.35]}
      frameloop={reduced ? 'demand' : 'always'}
      gl={{ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      camera={{ fov: 34, near: 0.1, far: 40, position: [0, 2.25, 9.1] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}>
      <StageContents {...props} reduced={reduced} />
    </Canvas>
  );
}
