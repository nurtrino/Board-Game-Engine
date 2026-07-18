// Everdell TV board: the mod's reworked board art on a 3D table under an
// orbit camera — meadow cards, forest locations, the event row (basic tiles +
// special event cards), deck/discard at the Ever Tree roots, and the mod's
// critter-meeple workers tinted per seat — plus the universal ig-* HUD.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import type { EverdellView, EvLocRef } from '@bge/shared';
import {
  EV_BASIC_EVENT_BY_ID, EV_BASIC_LOCATIONS, EV_HAVEN_PX, EV_JOURNEY,
  EV_SPECIAL_BY_ID, EVERDELL_SEAT_HEX,
} from '@bge/shared';
import { playSfx } from '../sfx';
import { cardImg, forestImg, specialEventImg, BACK_MAIN } from './ev-assets';
import './everdell.css';

// board art 2111x2064 -> world (art y-down maps to +z, same as Blokus)
const ART_W = 2111, ART_H = 2064;
const BW = 24;
const BH = BW * (ART_H / ART_W);
const px2w = (px: number, py: number): [number, number] => [
  (px / ART_W - 0.5) * BW,
  (py / ART_H - 0.5) * BH,
];

// meadow slots (art px): two rows of four across the printed Meadow
const MEADOW_PX: [number, number][] = [
  [450, 1155], [850, 1155], [1250, 1155], [1650, 1155],
  [450, 1560], [850, 1560], [1250, 1560], [1650, 1560],
];
const MEADOW_W_PX = 265;

// forest card anchors (art px): the bush shelves left + right, clear of the
// meadow columns (cards may overhang the board edge like a real table)
const FOREST_PX: [number, number][] = [[150, 1030], [170, 1345], [2000, 1030], [1980, 1345]];

// printed supply piles on the board art: the mod's resource models sit here
const PILES: { kind: 'twig' | 'resin' | 'pebble' | 'berry' | 'point'; px: [number, number]; n: number }[] = [
  { kind: 'twig', px: [335, 700], n: 4 },
  { kind: 'point', px: [760, 712], n: 5 },
  { kind: 'resin', px: [975, 690], n: 4 },
  { kind: 'pebble', px: [1180, 780], n: 4 },
  { kind: 'berry', px: [1895, 640], n: 4 },
];

// deck + discard at the Ever Tree roots (top center of the art)
const DECK_PX: [number, number] = [880, 190];
const DISCARD_PX: [number, number] = [1090, 190];

// event row floats on the table above the board's top edge
const EVENT_Z = -(BH / 2) - 1.7;
const BASIC_EVENT_X = [-10.4, -7.8, -5.2, -2.6];
const SPECIAL_EVENT_X = [1.6, 4.3, 7.0, 9.7];

function FlatImage({ url, w, h, pos, ry = 0, opacity = 1 }: {
  url: string; w: number; h: number; pos: [number, number, number]; ry?: number; opacity?: number;
}) {
  const tex = useLoader(THREE.TextureLoader, url);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, ry]} position={pos}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.85} metalness={0.02} transparent opacity={opacity} alphaTest={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

function BoardPlate() {
  const tex = useLoader(THREE.TextureLoader, '/everdell/board.webp');
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex]);
  return (
    <group>
      {/* the board art itself (transparent outside the shape) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[BW, BH]} />
        <meshStandardMaterial map={tex} roughness={0.9} metalness={0.02} transparent alphaTest={0.35} />
      </mesh>
    </group>
  );
}

/** The Ever Tree: the mod's two standee pieces (event canopy below, season
 * crown above) standing at the board's painted root mass. */
function EverTree() {
  const canopy = useLoader(THREE.TextureLoader, '/everdell/tree-events.webp');   // 1635x1104, trunk at top
  const crown = useLoader(THREE.TextureLoader, '/everdell/tree-meeples.webp');   // 1257x808, trunk at bottom
  useEffect(() => {
    for (const t of [canopy, crown]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
  }, [canopy, crown]);
  const X = -1.1;                       // painted root mass center (art x ~950)
  const Z = -(BH / 2) - 1.1;
  const canopyW = 6.6, canopyH = canopyW * (1104 / 1635);
  const crownW = 4.3, crownH = crownW * (808 / 1257);
  return (
    <group>
      <mesh position={[X, canopyH / 2 + 0.02, Z]}>
        <planeGeometry args={[canopyW, canopyH]} />
        <meshStandardMaterial map={canopy} roughness={0.9} transparent alphaTest={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[X, canopyH + crownH / 2 - 0.9, Z - 0.06]}>
        <planeGeometry args={[crownW, crownH]} />
        <meshStandardMaterial map={crown} roughness={0.9} transparent alphaTest={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** A small pile of the mod's actual resource models on a printed supply spot. */
function ResourcePile({ kind, px, n }: { kind: string; px: [number, number]; n: number }) {
  const obj = useLoader(OBJLoader, `/everdell/models/${kind}.obj`);
  const tex = useLoader(THREE.TextureLoader, `/everdell/models/${kind}.webp`);
  const { instances, scale, lift } = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const base = obj.clone(true);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.05 });
    base.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        (m as THREE.Mesh).material = mat;
        (m as THREE.Mesh).castShadow = true;
      }
    });
    const bb = new THREE.Box3().setFromObject(base);
    const size = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, bb.max.y - bb.min.y) || 1;
    const s = 0.52 / size;
    const out = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + i * 1.7;
      const r = i === 0 ? 0 : 0.34;
      return { obj: i === 0 ? base : base.clone(true), dx: Math.cos(a) * r, dz: Math.sin(a) * r, yaw: a * 1.3 };
    });
    return { instances: out, scale: s, lift: -bb.min.y * s };
  }, [obj, tex, n]);
  const [x, z] = px2w(px[0], px[1]);
  return (
    <group>
      {instances.map((s, i) => (
        <primitive key={i} object={s.obj}
          position={[x + s.dx, lift + 0.03, z + s.dz]}
          scale={[scale, scale, scale]} rotation={[0, s.yaw, 0]} />
      ))}
    </group>
  );
}

/** The mod's critter meeple, tinted per seat, seated on the table. */
function Worker({ x, z, hex, y = 0 }: { x: number; z: number; hex: string; y?: number }) {
  const obj = useLoader(OBJLoader, '/everdell/models/worker.obj');
  const { clone, scale, lift } = useMemo(() => {
    const c = obj.clone(true);
    const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.05 });
    c.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        (m as THREE.Mesh).material = mat;
        (m as THREE.Mesh).castShadow = true;
      }
    });
    const bb = new THREE.Box3().setFromObject(c);
    const height = bb.max.y - bb.min.y || 1;
    // keep the meeple modest: tall pieces parallax off their printed spots
    const s = 0.78 / height;
    return { clone: c, scale: s, lift: -bb.min.y * s };
  }, [obj, hex]);
  return (
    <group position={[x, y, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <circleGeometry args={[0.34, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.42} />
      </mesh>
      <primitive object={clone} position={[0, lift + 0.03, 0]} scale={[scale, scale, scale]} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

/** Spread n workers around a spot so stacked visits stay readable. */
function spread(i: number, n: number): [number, number] {
  if (n <= 1) return [0, 0];
  const a = (i / n) * Math.PI * 2;
  return [Math.cos(a) * 0.45, Math.sin(a) * 0.45];
}

function locKey(loc: EvLocRef): string {
  switch (loc.t) {
    case 'basic': return `b:${loc.id}`;
    case 'forest': return `f:${loc.id}`;
    case 'haven': return 'haven';
    case 'journey': return `j:${loc.id}`;
    case 'city': return `c:${loc.seat}:${loc.uid}`;
    case 'basicEvent': return `be:${loc.id}`;
    case 'specialEvent': return `se:${loc.id}`;
  }
}

/** World anchor for a worker location (city cards render on the owner chip). */
function locWorld(view: EverdellView, loc: EvLocRef): [number, number] | null {
  switch (loc.t) {
    case 'basic': {
      const def = EV_BASIC_LOCATIONS.find((l) => l.id === loc.id);
      return def ? px2w(def.px[0], def.px[1]) : null;
    }
    case 'forest': {
      const i = view.forest.findIndex((f) => f.id === loc.id);
      if (i < 0) return null;
      const [px, py] = FOREST_PX[i] ?? FOREST_PX[0];
      return px2w(px, py + 60);
    }
    case 'haven': return px2w(EV_HAVEN_PX[0], EV_HAVEN_PX[1]);
    case 'journey': {
      const def = EV_JOURNEY.find((j) => j.id === loc.id);
      return def ? px2w(def.px[0], def.px[1]) : null;
    }
    case 'basicEvent': {
      const i = view.basicEvents.findIndex((e) => e.id === loc.id);
      return i >= 0 ? [BASIC_EVENT_X[i], EVENT_Z] : null;
    }
    case 'specialEvent': {
      const i = view.specialEvents.findIndex((e) => e.id === loc.id);
      return i >= 0 ? [SPECIAL_EVENT_X[i], EVENT_Z] : null;
    }
    case 'city': return null;
  }
}

function Workers({ view }: { view: EverdellView }) {
  const placed = useMemo(() => {
    const byLoc = new Map<string, { seat: number; loc: EvLocRef }[]>();
    for (const p of view.players) {
      for (const w of p.workers) {
        const k = locKey(w.loc);
        if (!byLoc.has(k)) byLoc.set(k, []);
        byLoc.get(k)!.push({ seat: p.seat, loc: w.loc });
      }
    }
    return byLoc;
  }, [view.players]);

  return (
    <group>
      {[...placed.values()].flatMap((group) =>
        group.map((g, i) => {
          const at = locWorld(view, g.loc);
          if (!at) return null;
          const [dx, dz] = spread(i, group.length);
          const hex = EVERDELL_SEAT_HEX[view.players[g.seat].color];
          return <Worker key={`${locKey(g.loc)}:${g.seat}:${i}`} x={at[0] + dx} z={at[1] + dz} hex={hex} />;
        }),
      )}
    </group>
  );
}

/** Dev harness: ?cam=x,z,h[,y] pins the camera for zoomed verification shots. */
function CamOverride() {
  const camera = useThree((st) => st.camera);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('cam');
    if (!q) return;
    const [x, z, h, y] = q.split(',').map(Number);
    camera.position.set(x, y ?? h, z + h * 0.4);
    camera.lookAt(x, 0, z);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

const SFX_FOR_KIND: Record<string, Parameters<typeof playSfx>[0]> = {
  play: 'build', place: 'build', gain: 'click', event: 'win', season: 'turn',
  pass: 'click', turn: 'turn', win: 'win',
};

export function EverdellBoard({ view }: { view: EverdellView }) {
  const lastSeq = useRef(view.lastEvent.seq);
  useEffect(() => {
    if (view.lastEvent.seq === lastSeq.current) return;
    lastSeq.current = view.lastEvent.seq;
    const name = SFX_FOR_KIND[view.lastEvent.kind ?? ''];
    if (name) playSfx(name);
  }, [view.lastEvent.seq, view.lastEvent.kind]);

  const [statsSeat, setStatsSeat] = useState<number | null>(null);
  const meadowW = (MEADOW_W_PX / ART_W) * BW;
  const meadowH = meadowW * (1664 / 1179);
  const forestW = (300 / ART_W) * BW;
  const forestH = forestW * (1034 / 1478);
  const deckW = (210 / ART_W) * BW;
  const deckH = deckW * (1664 / 1179);

  return (
    <div className="ev-board" data-testid="ev-board" aria-label="Everdell shared board">
      <Canvas shadows="soft" frameloop="demand" dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 160, position: [0, 22, 23] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        style={{ background: '#060709' }}>
        <color attach="background" args={['#060709']} />
        <hemisphereLight intensity={0.55} color="#cfd8e4" groundColor="#141110" />
        <directionalLight position={[12, 26, 14]} intensity={2.1} color="#f2e9d8" castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-18} shadow-camera-right={18}
          shadow-camera-top={18} shadow-camera-bottom={-18}
          shadow-bias={-0.0002} />
        <pointLight position={[-14, 10, -10]} intensity={30} distance={60} decay={2} color="#89a0c4" />
        {/* the table */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -1]} receiveShadow>
          <circleGeometry args={[34, 72]} />
          <meshStandardMaterial color="#0b0c0e" roughness={0.96} />
        </mesh>
        <BoardPlate />
        <EverTree />
        {PILES.map((p) => <ResourcePile key={p.kind} kind={p.kind} px={p.px} n={p.n} />)}

        {/* meadow: 8 face-up cards */}
        {view.meadow.map((m, i) => {
          if (!m) return null;
          const [x, z] = px2w(MEADOW_PX[i][0], MEADOW_PX[i][1]);
          return <FlatImage key={`meadow-${i}-${m}`} url={cardImg(m)} w={meadowW} h={meadowH} pos={[x, 0.05, z]} />;
        })}

        {/* forest locations on the bush shelves */}
        {view.forest.map((f, i) => {
          const [px, py] = FOREST_PX[i] ?? FOREST_PX[0];
          const [x, z] = px2w(px, py);
          return <FlatImage key={f.id} url={forestImg(f.id)} w={forestW} h={forestH} pos={[x, 0.05, z]} />;
        })}

        {/* deck + discard at the roots */}
        {view.deckCount > 0 && (() => {
          const [x, z] = px2w(DECK_PX[0], DECK_PX[1]);
          return <FlatImage url={BACK_MAIN} w={deckW} h={deckH} pos={[x, 0.08, z]} />;
        })()}
        {view.discardCount > 0 && (() => {
          const [x, z] = px2w(DISCARD_PX[0], DISCARD_PX[1]);
          return <FlatImage url={BACK_MAIN} w={deckW} h={deckH} pos={[x, 0.06, z]} opacity={0.55} />;
        })()}

        {/* event row above the board: 4 basic tiles + 4 special event cards */}
        {view.basicEvents.map((e, i) => {
          const def = EV_BASIC_EVENT_BY_ID[e.id];
          return (
            <group key={e.id}>
              <FlatImage url={def.img} w={2.3} h={2.3} pos={[BASIC_EVENT_X[i], 0.03, EVENT_Z]} />
              {e.claimedBy !== null && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[BASIC_EVENT_X[i], 0.045, EVENT_Z]}>
                  <ringGeometry args={[1.18, 1.34, 40]} />
                  <meshBasicMaterial color={EVERDELL_SEAT_HEX[view.players[e.claimedBy].color]} />
                </mesh>
              )}
            </group>
          );
        })}
        {view.specialEvents.map((e, i) => (
          <group key={e.id}>
            <FlatImage url={specialEventImg(e.id)} w={2.1} h={2.1 * (1478 / 1032)} pos={[SPECIAL_EVENT_X[i], 0.03, EVENT_Z]} />
            {e.claimedBy !== null && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[SPECIAL_EVENT_X[i], 0.045, EVENT_Z]}>
                <ringGeometry args={[1.28, 1.44, 40]} />
                <meshBasicMaterial color={EVERDELL_SEAT_HEX[view.players[e.claimedBy].color]} />
              </mesh>
            )}
          </group>
        ))}

        <Workers view={view} />

        {new URLSearchParams(location.search).get('cam') ? (
          <CamOverride />
        ) : (
          <OrbitControls makeDefault enablePan={false} minDistance={13} maxDistance={52}
            maxPolarAngle={Math.PI * 0.42} enableDamping dampingFactor={0.08}
            target={[0, 1.2, -2.5]} />

        )}
      </Canvas>

      {/* seat chips: name · season · workers · city · hand · points */}
      <div className="ev-hud-top">
        {view.players.map((p) => {
          const hex = EVERDELL_SEAT_HEX[p.color];
          const active = view.phase === 'playing' && view.turn === p.seat;
          return (
            <button key={p.seat}
              className={'ig-glass ev-seat' + (active ? ' active' : '') + (p.passed ? ' done' : '')}
              style={{ borderColor: hex }}
              onClick={() => setStatsSeat(p.seat)}>
              {active && <span className="ev-seat-turn">{view.pendingCount > 0 ? 'DECIDING' : 'ACTING'}</span>}
              <span className="ev-seat-name">{p.name.toUpperCase()}</span>
              <span className="ev-seat-sub">
                {view.phase === 'ended'
                  ? `${p.score} PTS`
                  : p.passed ? 'PASSED' : `${p.season.toUpperCase()} · ${p.workersTotal - p.workers.length}/${p.workersTotal} WORKERS`}
              </span>
              <span className="ev-seat-sub dim2">
                CITY {p.city.length} · HAND {p.handCount} · TOKENS {p.points}
              </span>
            </button>
          );
        })}
      </div>

      {/* deck counter */}
      <div className="ev-deck ig-glass">
        <span>DECK {view.deckCount}</span>
        <span>DISCARD {view.discardCount}</span>
      </div>

      {/* turn narration banner */}
      <div className="ev-banner ig-glass" key={view.lastEvent.seq} role="status" aria-live="polite">
        <span>{view.lastEvent.text}</span>
      </div>

      {/* city summary modal (tap a chip) */}
      {statsSeat !== null && view.players[statsSeat] && (() => {
        const p = view.players[statsSeat];
        return (
          <div className="ig-modal" onClick={() => setStatsSeat(null)}>
            <div className="ig-modal-card ig-glass ev-city-modal" onClick={(e) => e.stopPropagation()}
              style={{ borderColor: EVERDELL_SEAT_HEX[p.color] }}>
              <div className="ig-modal-head">
                <span className="ig-prompt-ring" style={{ borderColor: EVERDELL_SEAT_HEX[p.color] }} />
                <b>{p.name.toUpperCase()} · CITY {p.city.length}/15</b>
                <button className="ig-modal-x" onClick={() => setStatsSeat(null)}>✕</button>
              </div>
              <div className="ev-city-grid">
                {p.city.length === 0 && <span className="dim">NO CARDS YET</span>}
                {p.city.map((cc) => (
                  <div key={cc.uid} className="ev-city-cell">
                    <img src={cardImg(cc.card)} alt={cc.card} />
                    {cc.sharedWith && <img className="ev-city-shared" src={cardImg(cc.sharedWith)} alt={cc.sharedWith} />}
                    {cc.storedPoints > 0 && <span className="ev-badge pts">{cc.storedPoints}</span>}
                    {cc.prisoners.length > 0 && <span className="ev-badge pri">{cc.prisoners.length}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* end overlay */}
      {view.phase === 'ended' && (
        <div className="ev-end" role="alert">
          <div className="ev-end-title">
            {view.winners.map((w) => view.players[w].name.toUpperCase()).join(' · ')} WINS
          </div>
          <div className="ev-end-scores">
            {[...view.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((p) => (
              <div key={p.seat} className="ev-end-row ig-glass" style={{ borderColor: EVERDELL_SEAT_HEX[p.color] }}>
                <b>{p.name.toUpperCase()}</b>
                <span>{p.score} PTS</span>
                {p.scoreParts && (
                  <small>
                    CARDS {p.scoreParts.cards} · TOKENS {p.scoreParts.tokens} · PROSPERITY {p.scoreParts.prosperity} · JOURNEY {p.scoreParts.journey} · EVENTS {p.scoreParts.events}
                  </small>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
