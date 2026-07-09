// Dev lineup of every A&A model: one row per nation, one column per unit
// type, each piece on a name plate. Used to verify all ~70 meshes render at
// sane scale, grounded and upright, in the mod's tints.
// Route: /dev/axis-models  (?row=germany isolates a row, ?scale=raw disables
// the footprint clamp to reveal the mod's raw sizes)

import { Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { useAxisManifest, useAxisObj, tintFor, type AxisManifest } from './AxisScene';

const NATIONS = ['germany', 'ussr', 'japan', 'uk', 'italy', 'usa', 'china', null] as const; // null = shared AA/IC row
const UNITS_ORDER = ['infantry', 'artillery', 'tank', 'aaGun', 'factory', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport'];

const CELL = 4; // world units per grid cell

function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,14,0.85)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 508, 124);
  g.fillStyle = '#e8e4da';
  g.font = '600 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66, 490);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Plate({ text, x, z, w = 3.6 }: { text: string; x: number; z: number; w?: number }) {
  const tex = useMemo(() => labelTexture(text), [text]);
  return (
    <mesh position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, w / 4]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

function LineupMesh({ url, tint, x, z, scale, clamp }: {
  url: string; tint: number[] | null; x: number; z: number; scale: number; clamp: boolean;
}) {
  const { clone, minY, midX, midZ, span, broadside } = useAxisObj(url, tint);
  const s = clamp ? Math.min(scale, span > 0 ? 2.4 / span : scale) : scale;
  return (
    <group position={[x, -minY * s, z]} rotation={[0, broadside ? Math.PI / 2 : 0, 0]} scale={[s, s, s]}>
      <primitive object={clone} position-x={-midX} position-z={-midZ} />
    </group>
  );
}

function Grid({ manifest, only, clamp }: { manifest: AxisManifest; only: string | null; clamp: boolean }) {
  const rows = NATIONS.filter((n) => !only || n === only || (only === 'shared' && n === null));
  return (
    <group>
      {rows.map((nation, r) => {
        const z = r * CELL * 1.6;
        const rowUnits = manifest.units.filter((u) => u.nation === nation);
        return (
          <group key={nation ?? 'shared'}>
            <Plate text={(nation ?? 'shared').toUpperCase()} x={-CELL * 1.6} z={-z} w={4.4} />
            {UNITS_ORDER.map((unit, c) => {
              const def = rowUnits.find((u) => u.unit === unit);
              if (!def?.mesh) return null;
              const x = c * CELL;
              return (
                <group key={unit}>
                  <LineupMesh url={def.mesh} tint={tintFor(nation, unit)} x={x} z={-z} scale={def.scale ?? 1} clamp={clamp} />
                  <Plate text={unit} x={x} z={-z + 1.7} w={3.2} />
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

export default function AxisModels() {
  const manifest = useAxisManifest();
  const params = new URLSearchParams(window.location.search);
  const only = params.get('row');
  const clamp = params.get('scale') !== 'raw';
  if (!manifest) return <div className="page center"><h2>Loading manifest</h2></div>;
  const w = UNITS_ORDER.length * CELL;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0d12' }}>
      <Canvas
        camera={{ position: [w / 2 - CELL, 34, 16], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ scene }) => { (window as unknown as { __scene?: unknown }).__scene = scene; }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[18, 40, 20]} intensity={1.5} />
        <directionalLight position={[-15, 25, -20]} intensity={0.5} />
        <mesh position={[w / 2 - CELL, -0.01, -18]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w * 2.2, 90]} />
          <meshStandardMaterial color="#141920" roughness={1} />
        </mesh>
        <Suspense fallback={null}>
          <Grid manifest={manifest} only={only} clamp={clamp} />
        </Suspense>
        <OrbitControls target={[w / 2 - CELL, 0, -18]} enableDamping dampingFactor={0.1} />
      </Canvas>
      <div style={{ position: 'absolute', top: 10, left: 12, color: '#9aa3ad', font: '12px Inter, sans-serif' }}>
        Axis & Allies model lineup · ?row=germany isolates a nation · ?scale=raw shows unclamped sizes
      </div>
    </div>
  );
}
