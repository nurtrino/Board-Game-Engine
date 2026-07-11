// Bloodborne TV scene — the 3D table. Map tiles are the mod's own tile art
// laid on black as the hunters reveal them; hunters/enemies/bosses are the
// mod's UnityPy-extracted sculpts with their UV textures, seated on the board
// by bounding box (nothing floats). Orbit camera with capped tilt; honours the
// ?cam=x,z,h[,y] query override for close-up verification shots.

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';
import type { BbView } from '@bge/shared';
import {
  BB_TILE_W, BB_SEAT_HEX, bbSpaceWorld, bbTileArt, bbTokenArt,
  bbHunterMini, bbEnemyMini, bbBossMini, bbMiniObj, bbMiniTex,
} from './bb-assets';

const BOARD_Y = 0;

// ---------- tile plate ----------

function TilePlate({ art, x, z, rot, fogged }: { art: string; x: number; z: number; rot: number; fogged: boolean }) {
  const tex = useLoader(THREE.TextureLoader, art);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <group position={[x, BOARD_Y, z]} rotation={[0, -rot * Math.PI / 2, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BB_TILE_W, BB_TILE_W]} />
        <meshStandardMaterial map={tex} roughness={0.92} metalness={0} />
      </mesh>
      {fogged && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
          <planeGeometry args={[BB_TILE_W, BB_TILE_W]} />
          <meshBasicMaterial color="#7f95b8" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// ---------- minis ----------

function Mini({ slug, x, z, tint, targetH = 1.15, yaw = 0 }: { slug: string; x: number; z: number; tint?: string; targetH?: number; yaw?: number }) {
  const obj = useLoader(OBJLoader, bbMiniObj(slug));
  const tex = useLoader(THREE.TextureLoader, bbMiniTex(slug));
  tex.colorSpace = THREE.SRGBColorSpace;
  const { scene, scale, yOff, mid } = useMemo(() => {
    const s = obj.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const sc = targetH / Math.max(size.y, 1e-6);
    const center = box.getCenter(new THREE.Vector3());
    s.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        const m = c as THREE.Mesh;
        m.castShadow = true;
        m.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.05 });
      }
    });
    return { scene: s, scale: sc, yOff: -box.min.y * sc, mid: [center.x * sc, center.z * sc] as [number, number] };
  }, [obj, tex, targetH]);
  return (
    <group position={[x - mid[0], BOARD_Y + yOff, z - mid[1]]} rotation={[0, yaw, 0]} scale={scale}>
      <primitive object={scene} />
      {tint && (
        <mesh position={[mid[0] / scale, 0.02 / scale, mid[1] / scale]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[(0.42 / scale) * targetH, (0.5 / scale) * targetH, 32]} />
          <meshBasicMaterial color={tint} />
        </mesh>
      )}
    </group>
  );
}

/** fallback pawn when a mini mesh is missing */
function Pawn({ x, z, color, h = 1.0 }: { x: number; z: number; color: string; h?: number }) {
  return (
    <mesh position={[x, BOARD_Y + h / 2, z]} castShadow>
      <capsuleGeometry args={[h * 0.22, h * 0.55, 6, 12]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

// ---------- tokens ----------

function TokenDisc({ img, x, z, r = 0.55, y = 0.03 }: { img: string; x: number; z: number; r?: number; y?: number }) {
  const tex = useLoader(THREE.TextureLoader, img);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={[x, BOARD_Y + y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[r, 28]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.25} roughness={0.9} />
    </mesh>
  );
}

// ---------- camera ----------

function CameraRig({ view }: { view: BbView }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const applied = useRef(false);
  const center = useMemo(() => {
    if (!view.tiles.length) return new THREE.Vector3(0, 0, 0);
    const xs = view.tiles.map((t) => t.x * BB_TILE_W);
    const zs = view.tiles.map((t) => t.y * BB_TILE_W);
    return new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
  }, [view.tiles]);
  useFrame(() => {
    if (applied.current || !controls.current) return;
    applied.current = true;
    const q = new URLSearchParams(window.location.search).get('cam');
    if (q) {
      const [cx, cz, h, cy] = q.split(',').map(Number);
      camera.position.set(cx, h ?? 18, cz);
      controls.current.target.set(cx, cy ?? 0, cz - 6);
    } else {
      camera.position.set(center.x, 26, center.z + 20);
      controls.current.target.copy(center);
    }
    controls.current.update();
  });
  return (
    <OrbitControls
      ref={controls}
      enablePan
      enableRotate
      enableZoom
      minDistance={6}
      maxDistance={70}
      maxPolarAngle={Math.PI * 0.42}
    />
  );
}

// ---------- piece layout: spread multiple occupants of one space ----------

function spread(items: { key: string; kind: string }[], x: number, z: number): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const n = items.length;
  items.forEach((it, i) => {
    if (n === 1) { out.set(it.key, [x, z]); return; }
    const a = (i / n) * Math.PI * 2;
    out.set(it.key, [x + Math.cos(a) * 0.85, z + Math.sin(a) * 0.85]);
  });
  return out;
}

// ---------- the scene ----------

export function BbScene({ view }: { view: BbView }) {
  // group pieces by space for spreading
  const occupants = useMemo(() => {
    const by = new Map<string, { key: string; kind: string }[]>();
    const push = (space: string | null, key: string, kind: string) => {
      if (!space) return;
      if (!by.has(space)) by.set(space, []);
      by.get(space)!.push({ key, kind });
    };
    for (const h of view.hunters) push(h.space, `h${h.seat}`, 'hunter');
    for (const e of view.enemies) push(e.space, `e${e.uid}`, 'enemy');
    for (const b of view.bosses) push(b.space, `b${b.uid}`, 'boss');
    const pos = new Map<string, [number, number]>();
    for (const [space, items] of by) {
      const w = bbSpaceWorld(view, space);
      if (!w) continue;
      for (const [k, v] of spread(items, w[0], w[1])) pos.set(k, v);
    }
    return pos;
  }, [view.hunters, view.enemies, view.bosses, view.tiles]);

  return (
    <Canvas shadows dpr={[1, 1.6]} gl={{ antialias: true }} style={{ background: '#000' }}
      camera={{ fov: 44, near: 0.5, far: 300, position: [0, 26, 20] }}>
      <ambientLight intensity={0.55} color="#cdd6ea" />
      <directionalLight position={[18, 30, 8]} intensity={1.25} color="#e8ecff" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <pointLight position={[-14, 16, -10]} intensity={140} color="#7788cc" />
      <Suspense fallback={null}>
        {/* black ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#050507" roughness={1} />
        </mesh>

        {view.tiles.map((t) => (
          <TilePlate key={t.uid} art={bbTileArt(t.tileId)} x={t.x * BB_TILE_W} z={t.y * BB_TILE_W} rot={t.rot} fogged={view.fogGates.includes(t.uid)} />
        ))}

        {/* consumable + status tokens */}
        {view.consumableTokens.map((ref) => {
          const w = bbSpaceWorld(view, ref);
          return w ? <TokenDisc key={`c${ref}`} img={bbTokenArt('treasure-token')} x={w[0] + 1.6} z={w[1] + 1.4} r={0.5} /> : null;
        })}
        {view.brokenLamps.map((ref) => {
          const w = bbSpaceWorld(view, ref);
          return w ? <TokenDisc key={`bl${ref}`} img={bbTokenArt('broken-lamp-token')} x={w[0]} z={w[1] - 1.4} r={0.55} y={0.05} /> : null;
        })}
        {Object.entries(view.insightTokens).map(([ref, n]) => {
          const w = bbSpaceWorld(view, ref);
          return w && n > 0 ? <TokenDisc key={`i${ref}`} img={bbTokenArt('insight')} x={w[0] - 1.6} z={w[1] + 1.4} r={0.45} /> : null;
        })}
        {view.survivorTokens.map((ref, i) => {
          const w = bbSpaceWorld(view, ref);
          return w ? <TokenDisc key={`s${ref}${i}`} img={bbTokenArt('survivor-token')} x={w[0] - 1.2} z={w[1] - 1.2} r={0.5} /> : null;
        })}
        {view.corpseTokens.map((ref, i) => {
          const w = bbSpaceWorld(view, ref);
          return w ? <TokenDisc key={`k${ref}${i}`} img={bbTokenArt('corpse-token')} x={w[0] + 1.2} z={w[1] - 1.2} r={0.5} /> : null;
        })}

        {/* hunters */}
        {view.hunters.map((h) => {
          const p = occupants.get(`h${h.seat}`);
          if (!p || !h.space) return null;
          const mini = bbHunterMini(h.hunterId);
          const tint = BB_SEAT_HEX[String(view.seats[h.seat]?.color)] ?? '#999';
          return mini
            ? <Mini key={`h${h.seat}`} slug={mini} x={p[0]} z={p[1]} tint={tint} targetH={1.3} />
            : <Pawn key={`h${h.seat}`} x={p[0]} z={p[1]} color={tint} h={1.3} />;
        })}

        {/* enemies */}
        {view.enemies.map((e) => {
          const p = occupants.get(`e${e.uid}`);
          if (!p) return null;
          const mini = bbEnemyMini(e.type);
          return mini
            ? <Mini key={`e${e.uid}`} slug={mini} x={p[0]} z={p[1]} targetH={1.15} />
            : <Pawn key={`e${e.uid}`} x={p[0]} z={p[1]} color="#6a6f7a" h={1.0} />;
        })}

        {/* bosses */}
        {view.bosses.map((b) => {
          const p = occupants.get(`b${b.uid}`);
          if (!p) return null;
          const mini = bbBossMini(b.type);
          return mini
            ? <Mini key={`b${b.uid}`} slug={mini} x={p[0]} z={p[1]} targetH={2.4} />
            : <Pawn key={`b${b.uid}`} x={p[0]} z={p[1]} color="#8a3038" h={2.2} />;
        })}
      </Suspense>
      <CameraRig view={view} />
    </Canvas>
  );
}
