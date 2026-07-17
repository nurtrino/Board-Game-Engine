// 3D player mat for the Dune device: the mod's own player board with the
// leader card, agent pawns, troop cubes, resource tokens, control flags,
// councilor disc and combat marker laid out like the physical table (no
// storage bowls). Same OBJ + tint pipeline as the main board renderer.

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { LEADER_BY_ID, type DunePlayerView, type DuneView } from '@bge/shared';
import type { DuneSceneDef } from './DuneScene';

const MAT_W = 10; // the Custom_Board art is square

/** A token lying flat on the mat (transparent art, optionally tinted). */
function Tok({ url, x, z, w, h, tint, lift = 0 }: {
  url: string; x: number; z: number; w: number; h: number; tint?: number[]; lift?: number;
}) {
  const tex = useLoader(THREE.TextureLoader, url);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; }, [tex]);
  return (
    <mesh position={[x, 0.03 + lift, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial
        map={tex} roughness={0.85} transparent alphaTest={0.4}
        color={tint ? new THREE.Color(tint[0], tint[1], tint[2]) : undefined}
      />
    </mesh>
  );
}

/** The mod's agent pawn, tinted, standing on the mat. */
function Pawn({ scene, tint, x, z }: { scene: DuneSceneDef; tint: number[]; x: number; z: number }) {
  const obj = useLoader(OBJLoader, scene.pieces.agentMesh);
  const { clone, minY, midX, midZ } = useMemo(() => {
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
        color: new THREE.Color(tint[0], tint[1], tint[2]), roughness: 0.5, metalness: 0.1,
      });
    });
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    return { clone: c, minY: box.min.y, midX: (box.min.x + box.max.x) / 2, midZ: (box.min.z + box.max.z) / 2 };
  }, [obj, tint]);
  return (
    <group position={[x, -minY, z]}>
      <primitive object={clone} position-x={-midX} position-z={-midZ} />
    </group>
  );
}

function Cube({ tint, x, z, s = 0.42 }: { tint: number[]; x: number; z: number; s?: number }) {
  return (
    <mesh position={[x, s / 2 + 0.02, z]} rotation={[0, (x * 7 + z * 13) % 1, 0]}>
      <boxGeometry args={[s, s, s]} />
      <meshStandardMaterial color={new THREE.Color(tint[0], tint[1], tint[2])} roughness={0.5} metalness={0.1} />
    </mesh>
  );
}

function MatBoard({ scene }: { scene: DuneSceneDef }) {
  const tex = useLoader(THREE.TextureLoader, scene.mat.board);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; }, [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[MAT_W, MAT_W]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
}

function LeaderCard({ me }: { me: DunePlayerView }) {
  const image = me.leader ? LEADER_BY_ID[me.leader]?.image : null;
  const tex = useLoader(THREE.TextureLoader, image ?? '/dune-logo.jpg');
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; }, [tex]);
  if (!image) return null;
  // leader cards are landscape (boards, really): keep the mod's ~1.45 ratio
  return (
    <mesh position={[-2.35, 0.04, -2.9]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[4.6, 3.17]} />
      <meshStandardMaterial map={tex} roughness={0.85} />
    </mesh>
  );
}

/** denominated pile positions: fives first, then ones, overlapping like a spread */
function spread(cx: number, cz: number, n: number, stepX: number, perRow = 5): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    out.push([cx + (i % perRow) * stepX, cz + Math.floor(i / perRow) * 0.75]);
  }
  return out;
}

export function DuneMat({ scene, view, me, height }: {
  scene: DuneSceneDef; view: DuneView; me: DunePlayerView; height: number | string;
}) {
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  ));
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const tint = scene.pieces.tints[me.color];
  const m = scene.mat;
  const flagsLeft = 3 - Object.values(view.control).filter((s) => s === me.seat).length;
  const spice5 = Math.floor(me.spice / 5), spice1 = me.spice % 5;
  const sol5 = Math.floor(me.solari / 5), sol1 = me.solari % 5;

  // Phones get a light, high-contrast summary instead of initializing a full
  // WebGL scene for a decorative player mat. All decisions already live in
  // the DOM controls around this panel, and the summary keeps the same game
  // information visible without the heat and input lag of software WebGL.
  if (compact) {
    const leaderImage = me.leader ? LEADER_BY_ID[me.leader]?.image : null;
    const summary = [
      ['Agents', me.agentsLeft + (me.mentat ? 1 : 0)],
      ['Garrison', me.garrison],
      ['Water', me.water],
      ['Spice', me.spice],
      ['Solari', me.solari],
      ['Flags', Math.max(0, flagsLeft)],
    ] as const;
    return (
      <div
        role="img"
        aria-label={`Your board: ${summary.map(([label, value]) => `${value} ${label.toLowerCase()}`).join(', ')}`}
        style={{
          width: '100%', height, borderRadius: 14, overflow: 'hidden', position: 'relative',
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 126px', gap: 10, padding: 12,
          background: `linear-gradient(90deg, rgba(5,8,11,.25), rgba(5,8,11,.82)), url(${scene.mat.board}) center/cover no-repeat`,
        }}
      >
        <div style={{ alignSelf: 'end', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
          {summary.map(([label, value]) => (
            <div key={label} style={{ padding: '8px 9px', borderRadius: 10, background: 'rgba(5,8,11,.84)', border: '1px solid rgba(255,255,255,.16)' }}>
              <div style={{ font: '800 20px/1 Inter, sans-serif', color: '#fff' }}>{value}</div>
              <div style={{ marginTop: 4, font: '700 10px/1 Inter, sans-serif', letterSpacing: '.7px', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)' }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ alignSelf: 'stretch', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
          {leaderImage ? (
            <img src={leaderImage} alt={`${LEADER_BY_ID[me.leader!]?.name ?? 'House'} leader`} style={{ width: '100%', maxHeight: '56%', objectFit: 'contain', borderRadius: 8, background: 'rgba(5,8,11,.72)' }} />
          ) : <div />}
          <div style={{ padding: '9px 8px', borderRadius: 10, textAlign: 'center', background: 'rgba(5,8,11,.86)', border: '1px solid rgba(255,255,255,.16)' }}>
            <div style={{ font: '800 13px/1.1 Inter, sans-serif', textTransform: 'uppercase' }}>{me.color}</div>
            <div style={{ marginTop: 5, font: '600 10px/1.2 Inter, sans-serif', color: 'rgba(255,255,255,.7)' }}>
              {me.hasHighCouncil ? 'High Council' : 'No council seat'}<br />
              {me.hasSwordmaster ? 'Swordmaster ready' : '2 agents'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height, borderRadius: 14, overflow: 'hidden' }}>
      <Canvas
        camera={{ position: [0, 13.9, 4.4], fov: 44 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, powerPreference: 'low-power' }}
        style={{ background: '#05080b' }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 14, 6]} intensity={1.35} />
        <directionalLight position={[-8, 10, -6]} intensity={0.4} />
        <Suspense fallback={null}>
          <MatBoard scene={scene} />
          <LeaderCard me={me} />

          {/* agents ready to send (the mod pawn, seat tint) */}
          {Array.from({ length: Math.max(0, me.agentsLeft) }, (_, i) => (
            <Pawn key={`a-${i}`} scene={scene} tint={tint} x={1.4 + i * 1.15} z={-2.4} />
          ))}
          {me.mentat && <Pawn scene={scene} tint={[0.82, 0.8, 0.74]} x={1.4 + Math.max(0, me.agentsLeft) * 1.15} z={-2.4} />}

          {/* garrison troops */}
          {Array.from({ length: Math.min(me.garrison, 12) }, (_, i) => (
            <Cube key={`t-${i}`} tint={tint} x={-4.2 + (i % 4) * 0.55} z={-0.6 + Math.floor(i / 4) * 0.55} />
          ))}

          {/* unplaced control flags */}
          {Array.from({ length: Math.max(0, flagsLeft) }, (_, i) => (
            <Tok key={`f-${i}`} url={m.control[me.color]} x={4.3} z={-2.6 + i * 1.25} w={0.92} h={1.15} lift={i * 0.005} />
          ))}

          {/* councilor disc until it is seated; combat marker while not in a conflict */}
          {!me.hasHighCouncil && <Tok url={m.councilor} x={4.3} z={1.6} w={0.7} h={0.7} tint={tint} />}
          {me.inConflict === 0 && <Tok url={m.combat[me.color]} x={4.3} z={2.7} w={0.85} h={0.85} tint={m.tokenTints.combat[me.color]} />}

          {/* resources: water | spice | solari, denominated fives + ones */}
          {spread(-4.3, 3.4, Math.min(me.water, 10), 0.5).map(([x, z], i) => (
            <Tok key={`w-${i}`} url={m.water} x={x} z={z} w={0.55} h={0.92} tint={m.tokenTints.water} lift={i * 0.004} />
          ))}
          {spread(-1.6, 3.5, spice5, 0.55).map(([x, z], i) => (
            <Tok key={`s5-${i}`} url={m.spice5} x={x} z={z} w={0.9} h={0.78} tint={m.tokenTints.spice} lift={i * 0.004} />
          ))}
          {spread(-1.6 + spice5 * 0.55 + 0.35, 3.5, spice1, 0.5).map(([x, z], i) => (
            <Tok key={`s1-${i}`} url={m.spice1} x={x} z={z} w={0.78} h={0.68} tint={m.tokenTints.spice} lift={0.02 + i * 0.004} />
          ))}
          {spread(1.9, 3.5, sol5, 0.5).map(([x, z], i) => (
            <Tok key={`o5-${i}`} url={m.solari5} x={x} z={z} w={0.72} h={0.72} tint={m.tokenTints.solari} lift={i * 0.004} />
          ))}
          {spread(1.9 + sol5 * 0.5 + 0.35, 3.5, sol1, 0.45).map(([x, z], i) => (
            <Tok key={`o1-${i}`} url={m.solari1} x={x} z={z} w={0.62} h={0.62} tint={m.tokenTints.solari} lift={0.02 + i * 0.004} />
          ))}
        </Suspense>
        {/* fixed frame: the mat is a display, not something to fly around */}
        <OrbitControls target={[0, 0, 0.3]} enableRotate={false} enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}
