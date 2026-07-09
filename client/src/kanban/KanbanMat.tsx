// 3D player mat for the Kanban EV device: the mod's own player board mesh
// with your designs, parts, books, vouchers, speech tokens and garaged
// cars laid out on the mod's slot positions (PLAYERS.<color>.Positions,
// world offsets from the board's own transform). Same pipeline as the
// main renderer.

import { Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { DESIGN_BY_GUID, type KanbanPlayerView } from '@bge/shared';
import layout from '../../../games/kanban-ev/golden/layout.json';
import { SEAT_TINT, type KanbanSceneDef } from './KanbanScene';

const L = layout as unknown as {
  PLAYERS: Record<string, {
    Boards: { Main: string };
    Meeple: string;
    Speechs: string[];
    Positions: Record<'Books' | 'Designs' | 'Parts' | 'Vouchers', { x: number; y: number; z: number }[]>;
  }>;
  BOOKS: { Elements: string[] };
  VOUCHERS: { Elements: string[] };
  SPEECHS: { Elements: string[] };
  PARTS: { Elements: { Guid: string; Part: number }[] };
};

const PART_GUID = ['8f7f5d', '8479e3', '217c79', '436be4', 'f51a6c', '6e1af6']; // by part index
const PART_INDEX: Record<string, number> = { Autopilots: 0, Batteries: 1, Bodies: 2, Drivetrains: 3, Electronics: 4, Motors: 5 };
const CAR_GUID: Record<string, string> = { City: 'a833f7', Concept: 'd50ba1', Sport: '440298', SUV: '727265', Truck: '089407' };

function Obj({ scene, guid, x, z, s = 1, yaw = 0, tint }: {
  scene: KanbanSceneDef; guid: string; x: number; z: number; s?: number; yaw?: number; tint?: number[];
}) {
  const def = scene.objects[guid];
  const obj = useLoader(OBJLoader, def?.mesh ?? '/kanban/missing.obj');
  const tex = useLoader(THREE.TextureLoader, def?.tex ?? '/kanban/EA5B540BE2C2867BD679A01A.png');
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; }, [tex]);
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
        map: def?.tex ? tex : undefined,
        color: tint ? new THREE.Color(tint[0], tint[1], tint[2]) : undefined,
        roughness: 0.6, metalness: 0.08,
      });
    });
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    return { clone: c, minY: box.min.y, midX: (box.min.x + box.max.x) / 2, midZ: (box.min.z + box.max.z) / 2 };
  }, [obj, tex, tint, def?.tex]);
  const sc = s * (def?.scale?.[0] ?? 1);
  return (
    <group position={[x, -minY * sc, z]} scale={[sc, sc, sc]} rotation={[0, yaw, 0]}>
      <primitive object={clone} position-x={-midX} position-z={-midZ} />
    </group>
  );
}

/** design tile lying flat (face = lower-left quadrant of its texture) */
function DesignTile({ scene, guid, x, z, upgraded }: { scene: KanbanSceneDef; guid: string; x: number; z: number; upgraded?: boolean }) {
  const def = scene.objects[guid];
  const tex = useLoader(THREE.TextureLoader, def?.tex ?? '/kanban/EA5B540BE2C2867BD679A01A.png');
  const t = useMemo(() => {
    const c = tex.clone();
    c.colorSpace = THREE.SRGBColorSpace;
    c.repeat.set(0.5, 0.5);
    c.offset.set(upgraded ? 0.5 : 0, 0);
    c.needsUpdate = true;
    return c;
  }, [tex, upgraded]);
  return (
    <mesh position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
      <planeGeometry args={[3.4, 3.4]} />
      <meshStandardMaterial map={t} roughness={0.85} />
    </mesh>
  );
}

export function KanbanMat({ scene, me, height }: {
  scene: KanbanSceneDef; me: KanbanPlayerView; height: number | string;
}) {
  const P = L.PLAYERS[me.color] ?? L.PLAYERS.Blue;
  const board = scene.objects[P.Boards.Main];
  // every color's board shares rot Y=270 and identical slot offsets; the
  // mat scene lays the long axis along screen X: rotate the world frame
  // an extra 90 degrees (mesh yaw + matching offset swizzle)
  const b = { x: board.pos[0], z: board.pos[2], yaw: -(board.rot?.[1] ?? 0) * Math.PI / 180 + Math.PI / 2 };
  const local = (p: { x: number; z: number }): [number, number] => [-(p.z - b.z), -(p.x - b.x)];
  const tint = SEAT_TINT[me.color];

  return (
    <div style={{ width: '100%', height, borderRadius: 14, overflow: 'hidden' }}>
      <Canvas camera={{ position: [0, 16, 13], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true }} style={{ background: '#05080b' }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[8, 18, 8]} intensity={1.3} />
        <directionalLight position={[-10, 12, -8]} intensity={0.4} />
        <Suspense fallback={null}>
          {/* the player board itself */}
          <Obj scene={scene} guid={P.Boards.Main} x={0} z={0} yaw={b.yaw} />
          {/* designs on the desk slots */}
          {me.designs.map((g, i) => {
            const spot = P.Positions.Designs[Math.min(i, P.Positions.Designs.length - 1)];
            const [x, z] = local(spot);
            return <DesignTile key={`d-${g}-${i}`} scene={scene} guid={g} x={x} z={z} />;
          })}
          {/* upgraded designs above the board (tested row on top) */}
          {me.upgraded.map((u, i) => {
            const guid = Object.keys(DESIGN_BY_GUID).find((g) => DESIGN_BY_GUID[g].model === u.model && DESIGN_BY_GUID[g].part === u.part);
            const tested = me.tested.some((t) => t.model === u.model && t.part === u.part);
            return guid && <DesignTile key={`u-${i}`} scene={scene} guid={guid} x={-10 + i * 3.8} z={tested ? -9.5 : -7} upgraded />;
          })}
          {/* parts in storage */}
          {me.parts.map((p, i) => {
            const spot = P.Positions.Parts[Math.min(i, P.Positions.Parts.length - 1)];
            const [x, z] = local(spot);
            return <Obj key={`p-${p}-${i}`} scene={scene} guid={PART_GUID[PART_INDEX[p]]} x={x} z={z} />;
          })}
          {/* books + vouchers */}
          {Array.from({ length: Math.min(me.books, 6) }, (_, i) => {
            const [x, z] = local(P.Positions.Books[i]);
            return <Obj key={`b-${i}`} scene={scene} guid={L.BOOKS.Elements[0]} x={x} z={z} />;
          })}
          {Array.from({ length: Math.min(me.vouchers, 6) }, (_, i) => {
            const [x, z] = local(P.Positions.Vouchers[i]);
            return <Obj key={`v-${i}`} scene={scene} guid={L.VOUCHERS.Elements[0]} x={x} z={z} />;
          })}
          {/* speech tokens on the board */}
          {Array.from({ length: me.speechOnBoard }, (_, i) => (
            <Obj key={`s-${i}`} scene={scene} guid={P.Speechs[0]} x={-8.5 + i * 1.6} z={4.4} tint={tint} />
          ))}
          {/* garaged cars along the garage strip */}
          {me.garages.map((car, i) => car && (
            <Obj key={`g-${i}`} scene={scene} guid={CAR_GUID[car]} x={-8 + i * 4} z={1.4} yaw={Math.PI} s={0.9} />
          ))}
        </Suspense>
        <OrbitControls target={[0, 0, 0]} enablePan={false} enableDamping dampingFactor={0.09} minDistance={6} maxDistance={34} maxPolarAngle={Math.PI * 0.46} />
      </Canvas>
    </div>
  );
}
