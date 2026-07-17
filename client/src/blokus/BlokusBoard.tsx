// Blokus TV board: the mod's 20x20 board art on a 3D table under an orbit
// camera, placed pieces rebuilt at the mod's authentic proportions (cell
// 0.775, height 0.284 — measured from its cached meshes), with the universal
// ig-* HUD: color chips, turn banner, end overlay.

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { BlokusView } from '@bge/shared';
import { BLOKUS_COLORS, BLOKUS_SIZE } from '@bge/shared';
import { playSfx } from '../sfx';
import './blokus.css';

// Grid placement inside the board art (fractions), measured from the printed
// corner squares: origin (0.1162, 0.1079), cell 0.03882.
const ART_ORIGIN = 0.1162;
const ART_CELL = 0.03882;
const BOARD_W = 20; // world units for the whole board art
const CELL_W = BOARD_W * ART_CELL;
const GRID0 = -BOARD_W / 2 + BOARD_W * ART_ORIGIN;
const PIECE_H = CELL_W * (0.284 / 0.775); // authentic height:cell ratio

function cellWorld(x: number, y: number): [number, number] {
  return [GRID0 + (x + 0.5) * CELL_W, GRID0 + (y + 0.5) * CELL_W];
}

function BoardPlate() {
  const texture = useLoader(THREE.TextureLoader, '/blokus/board.webp');
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <group>
      <mesh position={[0, -0.14, 0]} receiveShadow castShadow>
        <boxGeometry args={[BOARD_W + 0.3, 0.26, BOARD_W + 0.3]} />
        <meshStandardMaterial color="#15161a" roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[BOARD_W, BOARD_W]} />
        <meshStandardMaterial map={texture} roughness={0.88} metalness={0.02} />
      </mesh>
    </group>
  );
}

function Cells({ view }: { view: BlokusView }) {
  const groups = useMemo(() => {
    const bySeat = new Map<number, { x: number; y: number; hot: boolean }[]>();
    const hot = new Set(view.lastPlaced?.cells ?? []);
    view.board.forEach((seat, i) => {
      if (seat === null) return;
      if (!bySeat.has(seat)) bySeat.set(seat, []);
      bySeat.get(seat)!.push({ x: i % BLOKUS_SIZE, y: Math.floor(i / BLOKUS_SIZE), hot: hot.has(i) });
    });
    return bySeat;
  }, [view.board, view.lastPlaced]);

  return (
    <group>
      {[...groups.entries()].map(([seat, cells]) => {
        const color = BLOKUS_COLORS[view.players[seat].color];
        return cells.map(({ x, y, hot }) => {
          const [wx, wz] = cellWorld(x, y);
          return (
            <mesh key={`${seat}:${x},${y}`} position={[wx, PIECE_H / 2 + 0.002, wz]} castShadow receiveShadow>
              <boxGeometry args={[CELL_W * 0.94, PIECE_H, CELL_W * 0.94]} />
              <meshStandardMaterial color={color} roughness={0.38} metalness={0.06}
                emissive={color} emissiveIntensity={hot ? 0.42 : 0.06} />
            </mesh>
          );
        });
      })}
    </group>
  );
}

const SFX_FOR_KIND: Record<string, Parameters<typeof playSfx>[0]> = {
  place: 'build', pass: 'click', turn: 'turn', win: 'win',
};

export function BlokusBoard({ view }: { view: BlokusView }) {
  const lastSeq = useRef(view.lastEvent.seq);
  useEffect(() => {
    if (view.lastEvent.seq === lastSeq.current) return;
    lastSeq.current = view.lastEvent.seq;
    const name = SFX_FOR_KIND[view.lastEvent.kind ?? ''];
    if (name) playSfx(name);
  }, [view.lastEvent.seq, view.lastEvent.kind]);

  const ordered = view.order.map((seat) => view.players[seat]);

  return (
    <div className="bk-board" data-testid="bk-board" aria-label="Blokus shared board">
      <Canvas shadows="soft" frameloop="demand" dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ fov: 40, near: 0.1, far: 120, position: [0, 21, 16] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        style={{ background: '#060709' }}>
        <color attach="background" args={['#060709']} />
        <hemisphereLight intensity={0.5} color="#c7d2e2" groundColor="#14100e" />
        <directionalLight position={[10, 22, 12]} intensity={2.2} color="#f2e8d8" castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-14} shadow-camera-right={14}
          shadow-camera-top={14} shadow-camera-bottom={-14}
          shadow-bias={-0.0002} />
        <pointLight position={[-12, 9, -8]} intensity={26} distance={50} decay={2} color="#7f96bd" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.28, 0]} receiveShadow>
          <circleGeometry args={[46, 72]} />
          <meshStandardMaterial color="#0a0b0d" roughness={0.96} />
        </mesh>
        <BoardPlate />
        <Cells view={view} />
        <OrbitControls makeDefault enablePan={false} minDistance={12} maxDistance={48}
          maxPolarAngle={Math.PI * 0.42} enableDamping dampingFactor={0.08} />
      </Canvas>

      <div className="bk-hud-top">
        {ordered.map((p) => {
          const active = view.phase === 'playing' && view.turn === p.seat;
          const done = p.passed || p.remaining.length === 0;
          return (
            <div key={p.seat}
              className={'ig-glass bk-seat' + (active ? ' active' : '') + (done ? ' done' : '')}
              style={{ borderColor: BLOKUS_COLORS[p.color] }}>
              {active && <span className="bk-seat-turn">PLACING</span>}
              <span className="bk-seat-name">{p.name.toUpperCase()}</span>
              <span className="bk-seat-color">{p.color.toUpperCase()}</span>
              <span className="bk-seat-stat">
                {view.phase === 'ended'
                  ? `${p.score} PTS`
                  : done ? 'DONE' : `${view.squaresLeft[p.seat]} SQUARES LEFT`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="bk-banner ig-glass" key={view.lastEvent.seq} role="status" aria-live="polite">
        <span className="ig-banner-head">{view.lastEvent.text}</span>
      </div>

      {view.phase === 'ended' && (
        <div className="bk-end" role="alert">
          <div className="bk-end-title">
            {view.winners.map((w) => view.players[w].color.toUpperCase()).join(' · ')} WINS
          </div>
          <div className="bk-end-scores">
            {[...view.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((p) => (
              <span key={p.seat} className="bk-end-row" style={{ borderColor: BLOKUS_COLORS[p.color] }}>
                {p.color.toUpperCase()} · {p.name.toUpperCase()} · {p.score}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
