// 3D renderer for Kanban EV. The factory board is the mod's Custom_Board
// art on a plane; every piece position comes from the mod's own Lua spot
// tables (layout golden) through the verified affine fit
// (fit-kanban-map.mjs): art px = 2024.2 - 52.7z, py = 1910.7 - 52.7x.
// Pieces are the mod's meshes (cars, meeples, part octagons, pace car),
// same conventions as the other renderers: mirror world Z, orbit camera.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import {
  DEPTS, ENTRY_NODE, KANBAN_RULES,
  type CarModel, type Dept, type KanbanSeat, type KanbanView, type Part,
} from '@bge/shared';
import layout from '../../../games/kanban-ev/golden/layout.json';

export interface KanbanSceneDef {
  objects: Record<string, {
    name: string; nick?: string;
    pos: number[]; rot: number[]; scale: number[];
    color?: number[]; mesh?: string; tex?: string; img?: string;
    sheet?: number; cell?: number;
  }>;
  sheets: Record<string, { face: string; back: string; cols: number; rows: number }>;
}

let cached: KanbanSceneDef | null = null;
export function useKanbanScene(): KanbanSceneDef | null {
  const [scene, setScene] = useState<KanbanSceneDef | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetch('/kanban/scene.json').then((r) => r.json()).then((s) => { cached = s; setScene(s); });
  }, []);
  return scene;
}

const BOARD_Y = 0.96;
// art px <-> world, from the fit overlay (all 119 dots verified)
const AX = -52.7, BX = 2024.2; // px = BX + AX * z
const AY = -52.7, BY = 1910.7; // py = BY + AY * x
const ART_W = 4000, ART_H = 2234;

/** world (x,z) -> render position [x, y, -z] */
const rp = (x: number, z: number, y = BOARD_Y): [number, number, number] => [x, y, -z];

// board plane extents in world coords (inverse affine)
const zAt = (px: number) => (px - BX) / AX;
const xAt = (py: number) => (py - BY) / AY;

const LAYOUT = layout as unknown as {
  SPOTS: {
    Departments: { x: number; y: number; z: number }[][];
    Trainings: { x: number; y: number; z: number }[][];
    Shifts: { Positions: { x: number; z: number }[] };
    Week: { Positions: { x: number; z: number }[] };
    Meeting: { Positions: { x: number; z: number }[] };
    Demands: { Positions: { x: number; z: number }[] };
    Upgrades: Record<string, { Positions: { x: number; z: number }[] }>;
  };
  PARTS: { Positions: { Logistics: { x: number; z: number }[][]; Recycling: { x: number; z: number }[] } };
  CARS: { Zones: { Assembly: { Number: number; Position: { x: number; z: number } }[] } };
  DESIGNS: { Zones: { Guid: string; Position: { x: number; z: number } }[] };
  GOALS: { Cards: { Positions: { x: number; z: number }[] }; Certifications: { Elements: { Position: { x: number; z: number } }[] } };
  AWARDS: { Elements: string[]; Positions: { x: number; z: number }[] };
  PLAYERS: Record<string, { Meeple: string; Markers: { Training: string[]; Certification: string } }>;
  ELEMENTS: { Sandra: { Meeple: string; Reference: string }; Markers: { Week: string; Meeting: string; Calendar: string } };
  PACE: { Element: string };
};

const NODE_POS: Record<number, { x: number; z: number }> = Object.fromEntries(
  LAYOUT.CARS.Zones.Assembly.map((n) => [n.Number, n.Position]));
const NODE_ROT: Record<number, number> = Object.fromEntries(
  (LAYOUT.CARS.Zones.Assembly as unknown as { Number: number; Rotation?: { y: number } }[])
    .map((n) => [n.Number, n.Rotation?.y ?? 270]));

// representative mesh guids (first of each family in the layout tables)
const CAR_GUID: Record<CarModel, string> = { City: 'a833f7', Concept: 'd50ba1', Sport: '440298', SUV: '727265', Truck: '089407' };
const PART_GUID: Record<Part, string> = {
  Autopilots: '8f7f5d', Batteries: '8479e3', Bodies: '217c79', Drivetrains: '436be4', Electronics: 'f51a6c', Motors: '6e1af6',
};

function BoardPlane({ scene }: { scene: KanbanSceneDef }) {
  const img = scene.objects.b0e080?.img ?? '/kanban/32CAD5FB0B7ED097F89B4512.jpg';
  const tex = useLoader(THREE.TextureLoader, img);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; }, [tex]);
  const zl = zAt(0), zr = zAt(ART_W); // art left/right -> world z
  const xt = xAt(0), xb = xAt(ART_H); // art top/bottom -> world x
  const w = Math.abs(zl - zr), h = Math.abs(xt - xb);
  const cx = (xt + xb) / 2, cz = (zl + zr) / 2;
  // art u runs along world -z (render +z), art v along world -x
  return (
    <group>
      <mesh position={rp(cx, cz)} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh position={rp(cx, cz, BOARD_Y - 0.05)} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 1.6, h * 2.2]} />
        <meshStandardMaterial color="#000000" roughness={1} />
      </mesh>
    </group>
  );
}

/** any mod OBJ, textured or tinted, seated on the board at world (x,z) */
export function ModObj({ scene, guid, x, z, s = 1, yaw = 0, tint }: {
  scene: KanbanSceneDef; guid: string; x: number; z: number; s?: number; yaw?: number; tint?: number[];
}) {
  const def = scene.objects[guid] ?? { pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], name: 'missing' };
  const obj = useLoader(OBJLoader, def.mesh ?? '/kanban/missing.obj');
  const tex = useLoader(THREE.TextureLoader, def.tex ?? '/kanban/EA5B540BE2C2867BD679A01A.png');
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
        map: def.tex ? tex : undefined,
        color: tint ? new THREE.Color(tint[0], tint[1], tint[2]) : undefined,
        roughness: 0.55, metalness: 0.08,
      });
    });
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    return { clone: c, minY: box.min.y, midX: (box.min.x + box.max.x) / 2, midZ: (box.min.z + box.max.z) / 2 };
  }, [obj, tex, tint, def.tex]);
  const sc = s * (def.scale?.[0] ?? 1);
  return (
    <group position={rp(x, z, BOARD_Y - minY * sc)} scale={[sc, sc, sc]} rotation={[0, yaw, 0]}>
      <primitive object={clone} position-x={-midX} position-z={-midZ} />
    </group>
  );
}

export const SEAT_TINT: Record<KanbanSeat, number[]> = {
  Orange: [0.96, 0.39, 0.09], Yellow: [0.9, 0.9, 0.11], Purple: [0.63, 0.12, 0.94], Blue: [0.12, 0.53, 0.9],
};

function Disc({ x, z, tint, lift = 0, r = 0.55 }: { x: number; z: number; tint: number[]; lift?: number; r?: number }) {
  return (
    <mesh position={rp(x, z, BOARD_Y + 0.12 + lift)}>
      <cylinderGeometry args={[r, r, 0.22, 24]} />
      <meshStandardMaterial color={new THREE.Color(tint[0], tint[1], tint[2])} roughness={0.5} metalness={0.1} />
    </mesh>
  );
}

function Pieces({ scene, view }: { scene: KanbanSceneDef; view: KanbanView }) {
  const S = LAYOUT.SPOTS;
  const deptIdx = (d: Dept) => DEPTS.indexOf(d);
  return (
    <group>
      {/* worker meeples: at workstations, or parked at the alley top (save: 29.25..32.25, -3.55) */}
      {view.players.map((p) => {
        const spot = p.workstation
          ? S.Departments[deptIdx(p.workstation.dept)][Math.min(p.workstation.slot, S.Departments[deptIdx(p.workstation.dept)].length - 1)]
          : { x: 29.25 + p.seat, z: -3.55 };
        return <ModObj key={`m-${p.seat}`} scene={scene} guid={LAYOUT.PLAYERS[p.color].Meeple} x={spot.x} z={spot.z}
          yaw={p.done ? Math.PI / 2 : 0} />;
      })}
      {/* Sandra */}
      {(() => {
        const spot = view.sandra.desk
          ? S.Departments[4][2]
          : S.Departments[deptIdx(view.sandra.dept!)][Math.min(view.sandra.slot, 1)];
        return <ModObj scene={scene} guid={LAYOUT.ELEMENTS.Sandra.Meeple} x={spot.x} z={spot.z} />;
      })()}
      {/* training discs: space 0 is the printed start (setup save) */}
      {view.players.map((p) => DEPTS.map((d) => {
        const lvl = Math.min(p.training[d], 5);
        const spot = S.Trainings[deptIdx(d)][lvl];
        const stack = view.players.filter((q) => q.seat < p.seat && Math.min(q.training[d], 5) === lvl).length;
        return <Disc key={`t-${p.seat}-${d}`} x={spot.x} z={spot.z} tint={SEAT_TINT[p.color]} lift={stack * 0.24} r={0.5} />;
      }))}
      {/* certification track markers (sections measured on the art) */}
      {view.players.map((p) => {
        if (p.cert.space < 0) return null;
        const px = 210 + 304 * p.cert.section + 63.5 * (3 - p.cert.space);
        const x = xAt(1855), z = zAt(px);
        return <Disc key={`cert-${p.seat}`} x={x} z={z} tint={SEAT_TINT[p.color]} r={0.45} />;
      })}
      {/* score markers on the PP border track */}
      {view.players.map((p) => {
        const pp = Math.min(p.pp, 99);
        let px: number, py: number;
        if (pp <= 30) { px = 160 + pp * 124.4; py = 44; }
        else if (pp <= 50) { px = 3955; py = 44 + (pp - 30) * 107; }
        else if (pp <= 80) { px = 3955 - (pp - 50) * 124.4; py = 2188; }
        else { px = 160; py = 2188 - (pp - 80) * 107; }
        const stack = view.players.filter((q) => q.seat < p.seat && Math.min(q.pp, 99) === pp).length;
        return <Disc key={`pp-${p.seat}`} x={xAt(py)} z={zAt(px)} tint={SEAT_TINT[p.color]} lift={stack * 0.24} r={0.5} />;
      })}
      {/* shift bank + week markers */}
      {view.players.map((p) => (
        <Disc key={`sb-${p.seat}`} x={S.Shifts.Positions[Math.min(p.bankedShifts, 10)].x}
          z={S.Shifts.Positions[Math.min(p.bankedShifts, 10)].z} tint={SEAT_TINT[p.color]} lift={p.seat * 0.24} r={0.42} />
      ))}
      <Disc x={S.Week.Positions[Math.min(view.week, 3)].x} z={S.Week.Positions[Math.min(view.week, 3)].z} tint={[0.9, 0.2, 0.15]} r={0.5} />
      {(() => { // production cycle marker: calendar cell at 0, strip cells 1-3
        const cal = (S as unknown as { Calendar: { Positions: { x: number; z: number }[] } }).Calendar.Positions;
        const spot = view.cycle === 0 ? cal[0] : S.Meeting.Positions[Math.min(view.cycle, 3)];
        return <Disc x={spot.x} z={spot.z} tint={[0.15, 0.5, 0.9]} r={0.5} />;
      })()}
      {(() => { // meeting marker: reload cell, or the admin spot when triggered
        const cal = (S as unknown as { Calendar: { Positions: { x: number; z: number }[] } }).Calendar.Positions;
        const spot = view.meetingTriggered ? cal[1] : S.Meeting.Positions[0];
        return <Disc x={spot.x} z={spot.z} tint={[0.95, 0.55, 0.1]} r={0.5} lift={0.26} />;
      })()}
      {/* conveyor cars: the setup save shows rotY 270 along the belts,
          turntable nodes deviate (210/240/300/330) */}
      {Object.entries(view.conveyor).map(([n, car]) => {
        if (!car) return null;
        const pos = NODE_POS[+n];
        const yaw = Math.PI / 2 - (NODE_ROT[+n] - 270) * Math.PI / 180;
        return <ModObj key={`c-${n}`} scene={scene} guid={CAR_GUID[car]} x={pos.x} z={pos.z} yaw={yaw} />;
      })}
      {/* test track queue behind the pace car (pace oval drawn on the art; park the queue along the top straight) */}
      {view.testTrack.map((car, i) => car && (
        <ModObj key={`q-${i}`} scene={scene} guid={CAR_GUID[car]} x={35.2} z={26 - i * 3.1} yaw={Math.PI} />
      ))}
      {/* warehouses: one octagon per stored part, gridded on the panel */}
      {(Object.keys(view.warehouses) as Part[]).map((part, wi) => {
        const grid = LAYOUT.PARTS.Positions.Logistics[wi];
        return Array.from({ length: Math.min(view.warehouses[part], 6) }, (_, i) => (
          <ModObj key={`w-${part}-${i}`} scene={scene} guid={PART_GUID[part]} x={grid[i].x} z={grid[i].z} />
        ));
      })}
      {/* recycling */}
      {view.recycling.map((part, i) => (
        <ModObj key={`r-${i}`} scene={scene} guid={PART_GUID[part]} x={LAYOUT.PARTS.Positions.Recycling[i].x} z={LAYOUT.PARTS.Positions.Recycling[i].z} />
      ))}
      {/* upgrade value markers */}
      {(Object.keys(view.partValues) as Part[]).map((part) => {
        const key = part === 'Autopilots' ? 'Autopilot' : part === 'Batteries' ? 'Battery' : part === 'Bodies' ? 'Body'
          : part === 'Drivetrains' ? 'Drivetrain' : part === 'Electronics' ? 'Electronics' : 'Motor';
        const base = S.Upgrades[key].Positions[0];
        const step = (view.partValues[part] - 2) * 5.03; // value columns 2..6, one column per step (art fit)
        return <ModObj key={`v-${part}`} scene={scene} guid={PART_GUID[part]} x={base.x} z={base.z - step} s={0.8} />;
      })}
      {/* assembly parts provided per model, beside the model's entry node */}
      {(Object.keys(view.assemblyParts) as CarModel[]).map((m) => {
        const entry = NODE_POS[ENTRY_NODE[m]];
        return view.assemblyParts[m].map((part, i) => (
          <ModObj key={`ap-${m}-${i}`} scene={scene} guid={PART_GUID[part]} x={entry.x + 2.2} z={entry.z + 2.0 - i * 1.15} s={0.75} />
        ));
      })}
      {/* pace car */}
      {(() => {
        const t = view.pace / KANBAN_RULES.testTrackSpaces * Math.PI * 2;
        const cx = 30.6, cz = 22.9, rx = 4.4, rz = 6.4; // oval centre from the art through the fit
        return <ModObj scene={scene} guid={LAYOUT.PACE.Element} x={cx + Math.sin(t) * rx} z={cz + Math.cos(t) * rz} yaw={t + Math.PI / 2} />;
      })()}
      {/* demand tiles */}
      {view.demands.map((d, i) => {
        const spot = S.Demands.Positions[i];
        return <group key={`d-${i}`}>
          <ModObj scene={scene} guid={DEMAND_GUID[d.model]} x={spot.x} z={spot.z} />
          {Array.from({ length: d.speech }, (_, j) => (
            <Disc key={j} x={spot.x} z={spot.z - 2.9} tint={[0.92, 0.92, 0.9]} lift={j * 0.24} r={0.55} />
          ))}
        </group>;
      })}
    </group>
  );
}

export const DESIGN_SPOT = (i: number): { x: number; z: number } => ({ x: DESIGN_ROWS[Math.floor(i / 4)], z: DESIGN_COLS[i % 4] });
export const STACK_SPOT = (k: 'central' | 'officeTop' | 'officeBottom'): { x: number; z: number } =>
  k === 'central' ? CENTRAL_SPOT : k === 'officeTop' ? OFFICE_TOP_SPOT : OFFICE_BOTTOM_SPOT;
export const LAYOUT_TABLES = LAYOUT;
export const NODE_SPOT = (n: number): { x: number; z: number } => NODE_POS[n];
export const CERT_SPOT = (section: number, space: number): { x: number; z: number } => ({
  x: xAt(1855), z: zAt(210 + 304 * section + 63.5 * (3 - space)),
});
/** model bay centres in the R&D upgrade area, left to right on the art */
export const BAY_SPOT = (m: CarModel): { x: number; z: number } => {
  const i = ['City', 'SUV', 'Truck', 'Sport', 'Concept'].indexOf(m);
  return { x: xAt(1050), z: zAt(700 + 285 * i) };
};
/** test-track queue spot for index i (matches the Pieces layout) */
export const QUEUE_SPOT = (i: number): { x: number; z: number } => ({ x: 35.2, z: 26 - i * 3.1 });
export const KANBAN_DECK_PICK = { x: 12.4, z: -33.0 };

const DEMAND_GUID: Record<CarModel, string> = { City: '810ce7', Concept: 'daf296', Sport: 'ff09d4', SUV: 'aab3a8', Truck: '85ca8c' };

// design display geometry from DESIGNS.Zones: central stack, two office
// stacks, then a 2x4 row (top row x=10.46, columns z 24.98..11.49)
const DESIGN_COLS = [24.98, 20.47, 16.05, 11.49];
const DESIGN_ROWS = [10.46, 4.55];
const CENTRAL_SPOT = { x: 7.45, z: 33.75 };
const OFFICE_TOP_SPOT = { x: 10.46, z: 29.46 };
const OFFICE_BOTTOM_SPOT = { x: 4.55, z: 29.46 };

/** design tiles + stacks as flat textured tiles (face = lower-left quadrant) */
function Tiles({ scene, view }: { scene: KanbanSceneDef; view: KanbanView }) {
  return (
    <group>
      {view.designRow.map((g, i) => g && (
        <FlatTex key={`dr-${i}`} scene={scene} guid={g}
          spot={{ x: DESIGN_ROWS[Math.floor(i / 4)], z: DESIGN_COLS[i % 4] }} />
      ))}
      {view.centralTop && <FlatTex scene={scene} guid={view.centralTop} spot={CENTRAL_SPOT} />}
      {view.officeTopTop && <FlatTex scene={scene} guid={view.officeTopTop} spot={OFFICE_TOP_SPOT} />}
      {view.officeBottomTop && <FlatTex scene={scene} guid={view.officeBottomTop} spot={OFFICE_BOTTOM_SPOT} />}
    </group>
  );
}

function FlatTex({ scene, guid, spot, back = false }: { scene: KanbanSceneDef; guid: string; spot: { x: number; z: number }; back?: boolean }) {
  const def = scene.objects[guid];
  const tex = useLoader(THREE.TextureLoader, def?.tex ?? def?.img ?? '/kanban/EA5B540BE2C2867BD679A01A.png');
  const t = useMemo(() => {
    const c = tex.clone();
    c.colorSpace = THREE.SRGBColorSpace;
    c.repeat.set(0.5, 0.5);
    c.offset.set(back ? 0.5 : 0, 0);
    c.needsUpdate = true;
    return c;
  }, [tex, back]);
  if (!def) return null;
  return (
    <mesh position={rp(spot.x, spot.z, BOARD_Y + 0.06)} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
      <planeGeometry args={[3.6, 3.6]} />
      <meshStandardMaterial map={t} roughness={0.85} />
    </mesh>
  );
}

/** a card drawn from a sheet cell, lying flat on the board */
function SheetCard({ scene, guid, x, z, w = 3.4, h = 5.2, back = false }: {
  scene: KanbanSceneDef; guid: string; x: number; z: number; w?: number; h?: number; back?: boolean;
}) {
  const def = scene.objects[guid];
  const sheet = (def?.sheet !== undefined ? scene.sheets[String(def.sheet)] : undefined) ?? scene.sheets['118'];
  const tex = useLoader(THREE.TextureLoader, back ? sheet.back : sheet.face);
  const t = useMemo(() => {
    const c = tex.clone();
    c.colorSpace = THREE.SRGBColorSpace;
    if (!back && def?.cell !== undefined) {
      c.repeat.set(1 / sheet.cols, 1 / sheet.rows);
      c.offset.set((def.cell % sheet.cols) / sheet.cols, 1 - (Math.floor(def.cell / sheet.cols) + 1) / sheet.rows);
    }
    c.needsUpdate = true;
    return c;
  }, [tex, back, def?.cell, sheet]);
  return (
    <mesh position={rp(x, z, BOARD_Y + 0.05)} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={t} roughness={0.85} />
    </mesh>
  );
}

const FACTORY_TILE_GUID: Record<string, string> = {
  'cars-2': '2d636f', 'cars-3': 'c2437f', 'cars-4': '0d4747', 'cars-5': 'b2df96',
  'certifications-2': 'ca07ca', 'certifications-3': 'b5dac4', 'certifications-4': '4f885f', 'certifications-5': 'e9dc50',
  'upgrades-2': '3d9bc1', 'upgrades-3': 'fe311b', 'upgrades-4': '120d18', 'upgrades-5': '0e2a76',
};
const KANBAN_DECK_SPOT = { x: 12.4, z: -33.0 };

/** award stacks, factory + final goal tiles, kanban deck, meeting cards */
function BoardTiles({ scene, view }: { scene: KanbanSceneDef; view: KanbanView }) {
  const G = LAYOUT.GOALS as unknown as {
    Certifications: { Elements: { Position: { x: number; z: number } }[] };
    Cars: { Positions: { x: number; z: number }[] };
    Upgrades: { Elements: string[]; Positions: { x: number; z: number }[] };
    Cards: { Positions: { x: number; z: number }[] };
    Final: { Position: { x: number; z: number } };
  };
  const byKindIdx: Record<string, number> = {};
  return (
    <group>
      {view.factoryGoals.map((g) => {
        const guid = FACTORY_TILE_GUID[g.id];
        if (!guid) return null;
        const idx = byKindIdx[g.kind] ?? 0;
        byKindIdx[g.kind] = idx + 1;
        const spot = g.kind === 'certifications' ? G.Certifications.Elements[g.need - 2].Position
          : g.kind === 'cars' ? G.Cars.Positions[Math.min(idx, 1)] : G.Upgrades.Positions[Math.min(idx, 1)];
        return (
          <group key={g.id}>
            <FlatTex scene={scene} guid={guid} spot={spot} />
            {Array.from({ length: g.speech }, (_, j) => (
              <Disc key={j} x={spot.x} z={spot.z} tint={[0.92, 0.92, 0.9]} lift={0.1 + j * 0.24} r={0.5} />
            ))}
          </group>
        );
      })}
      <FlatTex scene={scene} guid={view.finalGoal.guid} spot={G.Final.Position} />
      {DEPTS.map((d, i) => {
        const left = view.awardsLeft[d];
        if (left <= 0) return null;
        const spot = LAYOUT.AWARDS.Positions[[0, 1, 2, 4, 3][i]];
        return (
          <group key={d}>
            <FlatTex scene={scene} guid={LAYOUT.AWARDS.Elements[0]} spot={spot} back />
            {view.awardSpeech[d] > 0 && <Disc x={spot.x} z={spot.z} tint={[0.92, 0.92, 0.9]} lift={0.12} r={0.5} />}
          </group>
        );
      })}
      <ModObj scene={scene} guid={LAYOUT.ELEMENTS.Sandra.Reference} x={30.97} z={-10.22} />
      <SheetCard scene={scene} guid={'1c4dfd'} x={KANBAN_DECK_SPOT.x} z={KANBAN_DECK_SPOT.z} w={3.2} h={4.9} back />
      {view.meetingGoals.map((g, i) => {
        const spot = G.Cards.Positions[Math.min(i, 3)];
        return <SheetCard key={g.guid + i} scene={scene} guid={g.guid} x={spot.x} z={spot.z} />;
      })}
    </group>
  );
}

function AimCamera() {
  const ref = useRef<OrbitControlsImpl>(null);
  const applied = useRef(false);
  useFrame(({ camera }) => {
    if (applied.current) return;
    applied.current = true;
    const q = new URLSearchParams(window.location.search).get('cam');
    if (q) {
      const [x, z, h, y] = q.split(',').map(Number);
      camera.position.set(x, h ?? 30, z);
      ref.current?.target.set(0, y ?? 0, 0);
    }
    ref.current?.update();
  });
  return <OrbitControls ref={ref} target={[15, 0, -0.5]} enableDamping dampingFactor={0.08} minDistance={8} maxDistance={110} maxPolarAngle={Math.PI * 0.47} />;
}

// ---------- pick targets (device tap-to-act, Brass pattern) ----------

export interface KanbanPick { id: string; x: number; z: number; r?: number; w?: number; d?: number; label?: string }

const PICK_FRAME_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, 0.5); s.lineTo(-0.5, 0.5); s.lineTo(-0.5, -0.5);
  const hole = new THREE.Path();
  const i = 0.38;
  hole.moveTo(-i, -i); hole.lineTo(-i, i); hole.lineTo(i, i); hole.lineTo(i, -i); hole.lineTo(-i, -i);
  s.holes.push(hole);
  return new THREE.ShapeGeometry(s);
})();

function PickMark({ t, onPick }: { t: KanbanPick; onPick?: (id: string) => void }) {
  const fill = useRef<THREE.MeshBasicMaterial>(null);
  const frame = useRef<THREE.MeshBasicMaterial>(null);
  const grp = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.6);
    if (fill.current) fill.current.opacity = 0.14 + 0.1 * k;
    if (frame.current) frame.current.opacity = 0.85 + 0.15 * k;
    if (grp.current) grp.current.scale.setScalar(1 + 0.03 * k);
  });
  const w = t.w ?? (t.r ?? 1.6) * 2;
  const d = t.d ?? (t.r ?? 1.6) * 2;
  return (
    <group ref={grp} position={rp(t.x, t.z, BOARD_Y + 0.12)}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[w, d, 1]}
        onClick={(e) => { e.stopPropagation(); onPick?.(t.id); }}
        onPointerOver={(e) => { document.body.style.cursor = 'pointer'; e.stopPropagation(); }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <planeGeometry />
        <meshBasicMaterial ref={fill} color="#aef7ff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[w * 1.16, d * 1.16, 1]} geometry={PICK_FRAME_GEO}>
        <meshBasicMaterial ref={frame} color="#d8fbff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function KanbanTable({ scene, view, pickTargets, onPick, embed = false }: {
  scene: KanbanSceneDef; view: KanbanView;
  pickTargets?: KanbanPick[]; onPick?: (id: string) => void; embed?: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [86, 62, -0.5], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={embed ? { width: '100%', height: '100%', background: '#05070a' } : { position: 'absolute', inset: 0, background: '#05070a' }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[30, 55, 25]} intensity={1.4} />
      <directionalLight position={[-25, 40, -30]} intensity={0.45} />
      <Suspense fallback={null}>
        <BoardPlane scene={scene} />
        <Pieces scene={scene} view={view} />
        <Tiles scene={scene} view={view} />
        <BoardTiles scene={scene} view={view} />
        {pickTargets?.map((pt) => <PickMark key={pt.id} t={pt} onPick={onPick} />)}
      </Suspense>
      <AimCamera />
    </Canvas>
  );
}
