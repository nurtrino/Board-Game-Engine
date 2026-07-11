// Dark Souls TV board — the 3D table. The active tile face (or boss arena, or
// the bonfire camp) is a plane carrying the mod's staged art; node positions
// come from the tiles golden (art-pixel space, situation B: exact by
// construction, verified by overlay). Minis are the mod's own OBJ sculpts and
// figurine standees, seated on the board by bounding box — nothing floats.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Sparkles, useProgress } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import {
  DS_TILE_FACES, DS_ENEMIES, DS_INVADERS, dsTileGraph,
  type DsView, type DsBossUnit, type DsTileFace, type DsLogEntry,
} from '@bge/shared';
import {
  DS_FACE_ART, DS_BONFIRE_TILE, DS_FOG_WALL, DS_TRAP_TOKEN, DS_AGGRO_TOKEN,
  DS_SOULS_TOKEN, DS_CONDITION_TOKENS, DS_TERRAIN_MINI, DS_K, DS_SEAT_HEX,
  dsFaceWorldWidth, dsClassMini, dsBossUnitMini, dsMiniForwardCorrection, dsMiniOf,
  type DsManifest, type DsMiniDef,
} from './ds-assets';
import { dsNearestPoint, dsYawToward, type DsBoardPoint } from './dsEncounterPresentation';

const BOARD_Y = 0;

// ---------- face geometry ----------

export interface DsFaceSpace {
  faceId: string;
  face: DsTileFace | null;
  ps: number;          // render units per golden art pixel
  renderW: number;
  renderH: number;
  toXZ: (px: number, py: number) => [number, number];
  nodeXZ: (nodeId: string) => [number, number];
}

export function dsFaceSpace(faceId: string): DsFaceSpace {
  const face = DS_TILE_FACES[faceId] ?? null;
  const sizeW = face ? face.sizePx[0] : DS_BONFIRE_TILE.w;
  const sizeH = face ? face.sizePx[1] : DS_BONFIRE_TILE.h;
  const worldW = faceId === 'bonfire' ? 14.5 : dsFaceWorldWidth(faceId);
  const renderW = worldW * DS_K;
  const ps = renderW / sizeW;
  const toXZ = (px: number, py: number): [number, number] => [(px - sizeW / 2) * ps, (py - sizeH / 2) * ps];
  return {
    faceId, face, ps, renderW, renderH: sizeH * ps, toXZ,
    nodeXZ: (nodeId: string) => {
      const n = face?.nodes.find((nn) => nn.id === nodeId);
      return n ? toXZ(n.x, n.y) : [0, 0];
    },
  };
}

function pointAt(space: DsFaceSpace, nodeId: string): DsBoardPoint {
  const [x, z] = space.nodeXZ(nodeId);
  return { x, z };
}

/** Loading gate: true once every pending loader has finished at least once. */
export function useDsSceneReady(): boolean {
  const { active, progress } = useProgress();
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!ready && !active && progress === 100) setReady(true); }, [active, progress, ready]);
  return ready;
}

// ---------- tile plane ----------

function TilePlane({ image, renderW, renderH }: { image: string; renderW: number; renderH: number }) {
  const { gl } = useThree();
  const tex = useLoader(THREE.TextureLoader, image);
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  }, [tex, gl]);
  return (
    <group>
      <mesh receiveShadow position={[0, BOARD_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[renderW, renderH]} />
        <meshStandardMaterial map={tex} roughness={0.94} />
      </mesh>
      <mesh receiveShadow position={[0, BOARD_Y - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[renderW * 2.4, renderH * 2.4]} />
        <meshStandardMaterial color="#04060a" roughness={1} />
      </mesh>
    </group>
  );
}

// ---------- node overlay markers ----------

function NodeMarkers({ space }: { space: DsFaceSpace }) {
  if (!space.face) return null;
  return (
    <group>
      {space.face.nodes.map((n) => {
        const [x, z] = space.toXZ(n.x, n.y);
        return (
          <mesh key={n.id} position={[x, BOARD_Y + 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.34, 0.4, 36]} />
            <meshBasicMaterial color="#e8c87a" transparent opacity={0.28} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------- OBJ minis ----------

const normalizedGeometry = new Map<string, THREE.BufferGeometry>();

function useDsObj(url: string, tint: number[] | null | undefined, textureUrl: string | null) {
  const obj = useLoader(OBJLoader, url);
  const tex = useLoader(THREE.TextureLoader, textureUrl ?? '/dark-souls/token-bonfire.png');
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; }, [tex]);
  return useMemo(() => {
    const c = obj.clone(true);
    // a zero tint on a textured mini means "no tint" (black would erase the map)
    const flat = !textureUrl;
    const tintOk = tint && (flat || tint.some((v) => v > 0.02));
    // untextured sculpts read as bare plastic: damp the mod tint so the
    // two-light rig doesn't blow them out to white
    const damp = flat ? 0.42 : 1;
    const color = tintOk
      ? new THREE.Color(tint[0] * damp, tint[1] * damp, tint[2] * damp)
      : new THREE.Color(flat ? '#5f5f64' : '#ffffff');
    const junk: THREE.Object3D[] = [];
    c.traverse((o) => {
      if ((o as THREE.Line).isLine || (o as THREE.Points).isPoints) { junk.push(o); return; }
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = false;
      if (m.geometry) {
        const source = m.geometry as THREE.BufferGeometry;
        let geometry = normalizedGeometry.get(source.uuid);
        if (!geometry) {
          const clean = source.clone();
          clean.deleteAttribute('normal');
          geometry = mergeVertices(clean);
          geometry.computeVertexNormals();
          normalizedGeometry.set(source.uuid, geometry);
        }
        m.geometry = geometry;
      }
      m.material = new THREE.MeshStandardMaterial({
        color, roughness: flat ? 0.78 : 0.62, metalness: 0.08,
        map: textureUrl ? tex : null,
      });
    });
    for (const o of junk) o.parent?.remove(o);
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    return {
      clone: c,
      minY: box.min.y,
      midX: (box.min.x + box.max.x) / 2,
      midZ: (box.min.z + box.max.z) / 2,
    };
  }, [obj, tex, tint, textureUrl]);
}

function MeshMini({ def, x, z, yaw = 0, highlight, beatKey }: {
  def: DsMiniDef; x: number; z: number; yaw?: number; highlight?: string | null; beatKey?: string | null;
}) {
  const { clone, minY, midX, midZ } = useDsObj(def.mesh!, def.tint, def.texture);
  const s = def.scale * DS_K; // authentic: OBJ bbox * mod scale = TTS world size
  const correction = dsMiniForwardCorrection(def.id);
  const group = useRef<THREE.Group>(null);
  const initial = useRef({ x, z, yaw });
  const beatClock = useRef(99);
  const y = BOARD_Y - minY * s;
  useEffect(() => { if (beatKey) beatClock.current = 0; }, [beatKey]);
  useFrame((_state, delta) => {
    const object = group.current;
    if (!object) return;
    const alpha = 1 - Math.exp(-8 * delta);
    object.position.x = THREE.MathUtils.lerp(object.position.x, x, alpha);
    object.position.z = THREE.MathUtils.lerp(object.position.z, z, alpha);
    beatClock.current += delta;
    const beat = beatClock.current < 0.62 ? Math.sin((beatClock.current / 0.62) * Math.PI) : 0;
    object.position.y = y + beat * 0.16;
    const turn = THREE.MathUtils.euclideanModulo(yaw - object.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    object.rotation.y += turn * alpha;
  });
  return (
    <group ref={group} position={[initial.current.x, y, initial.current.z]} rotation={[0, initial.current.yaw, 0]} scale={[s, s, s]}>
      {/* the primitive's offset applies after the group's yaw, so cancel the
          bbox centre in local space (playbook 4.2 centerXZ) */}
      <group rotation-y={correction}>
        <primitive object={clone} position-x={-midX} position-z={-midZ} />
      </group>
      {highlight && (
        <mesh position={[0, (0.02 - y) / s, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1 / s, 1 / s, 1 / s]}>
          <ringGeometry args={[0.42, 0.52, 32]} />
          <meshBasicMaterial color={highlight} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// ---------- flat figurine standees ----------

function Standee({ def, x, z, yaw = 0, highlight, beatKey }: {
  def: DsMiniDef; x: number; z: number; yaw?: number; highlight?: string | null; beatKey?: string | null;
}) {
  const tex = useLoader(THREE.TextureLoader, def.texture!);
  const backTex = useLoader(THREE.TextureLoader, def.textureBack ?? def.texture!);
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    backTex.colorSpace = THREE.SRGBColorSpace;
  }, [tex, backTex]);
  const img = tex.image as { width: number; height: number } | undefined;
  const worldH = def.scale * 1.8; // figurine height factor: megaboss standee (7) matches the kings' 12.8-unit sculpts
  const h = worldH * DS_K;
  const w = h * ((img?.width ?? 1) / (img?.height ?? 1));
  const group = useRef<THREE.Group>(null);
  const initial = useRef({ x, z, yaw });
  const beatClock = useRef(99);
  useEffect(() => { if (beatKey) beatClock.current = 0; }, [beatKey]);
  useFrame((_state, delta) => {
    const object = group.current;
    if (!object) return;
    const alpha = 1 - Math.exp(-8 * delta);
    object.position.x = THREE.MathUtils.lerp(object.position.x, x, alpha);
    object.position.z = THREE.MathUtils.lerp(object.position.z, z, alpha);
    beatClock.current += delta;
    const beat = beatClock.current < 0.62 ? Math.sin((beatClock.current / 0.62) * Math.PI) : 0;
    object.position.y = beat * 0.16;
    const turn = THREE.MathUtils.euclideanModulo(yaw - object.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    object.rotation.y += turn * alpha;
  });
  return (
    <group ref={group} position={[initial.current.x, 0, initial.current.z]} rotation={[0, initial.current.yaw, 0]}>
      <mesh castShadow position={[0, BOARD_Y + h / 2, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.35} side={THREE.FrontSide} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, BOARD_Y + h / 2, -0.002]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={backTex} transparent alphaTest={0.35} side={THREE.FrontSide} roughness={0.85} />
      </mesh>
      <mesh position={[0, BOARD_Y + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[w * 0.3, 24]} />
        <meshStandardMaterial color="#0c0d10" roughness={0.9} />
      </mesh>
      {highlight && (
        <mesh position={[0, BOARD_Y + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.52, 32]} />
          <meshBasicMaterial color={highlight} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function Mini({ def, x, z, yaw, highlight, beatKey }: {
  def: DsMiniDef | null; x: number; z: number; yaw?: number; highlight?: string | null; beatKey?: string | null;
}) {
  if (!def) return null;
  if (def.mesh) return <MeshMini def={def} x={x} z={z} yaw={yaw} highlight={highlight} beatKey={beatKey} />;
  if (def.texture) return <Standee def={def} x={x} z={z} yaw={yaw} highlight={highlight} beatKey={beatKey} />;
  return null;
}

// ---------- flat tokens ----------

function FlatToken({ image, x, z, r, lift = 0.02, opacity = 1 }: {
  image: string; x: number; z: number; r: number; lift?: number; opacity?: number;
}) {
  const tex = useLoader(THREE.TextureLoader, image);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; }, [tex]);
  return (
    <mesh position={[x, BOARD_Y + lift, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[r, 28]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} alphaTest={0.1} />
    </mesh>
  );
}

/** Face-down trap token: a plain dark disc (the art is the revealed face). */
function FaceDownDisc({ x, z, r }: { x: number; z: number; r: number }) {
  return (
    <group>
      <mesh position={[x, BOARD_Y + 0.016, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 24]} />
        <meshStandardMaterial color="#17181c" roughness={0.85} />
      </mesh>
      <mesh position={[x, BOARD_Y + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.78, r * 0.92, 24]} />
        <meshBasicMaterial color="#3c3e46" />
      </mesh>
    </group>
  );
}

// small red pip row: wounds already suffered by an enemy
function WoundPips({ x, z, wounds, health }: { x: number; z: number; wounds: number; health: number }) {
  if (wounds <= 0) return null;
  const pips = Math.min(health, 8);
  return (
    <group>
      {Array.from({ length: pips }, (_, i) => (
        <mesh key={i} position={[x - (pips - 1) * 0.11 / 2 + i * 0.11, BOARD_Y + 0.03, z + 0.52]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.045, 10]} />
          <meshBasicMaterial color={i < wounds ? '#e03535' : '#3a3c42'} />
        </mesh>
      ))}
    </group>
  );
}

function CombatBurst({ x, z, magic = false }: { x: number; z: number; magic?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const age = useRef(0);
  const color = magic ? '#78a9ff' : '#ff7b3d';
  useFrame((_state, delta) => {
    age.current += delta;
    const t = Math.min(1, age.current / 1.1);
    if (group.current) {
      group.current.scale.setScalar(0.7 + t * 3.8);
      group.current.rotation.y += delta * 1.8;
    }
    if (ring.current) ring.current.opacity = Math.max(0, (1 - t) * 0.9);
    if (core.current) core.current.opacity = Math.max(0, (1 - t) * 0.72);
    if (light.current) light.current.intensity = Math.max(0, (1 - t) * 8);
  });
  return (
    <group ref={group} position={[x, BOARD_Y + 0.08, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.32, 32]} />
        <meshBasicMaterial ref={ring} color={color} transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshBasicMaterial ref={core} color={color} transparent opacity={0.72} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => {
        const angle = index * Math.PI / 3;
        return (
          <mesh key={index} position={[Math.cos(angle) * 0.24, 0.13, Math.sin(angle) * 0.24]}
            rotation={[0, -angle, Math.PI / 4]}>
            <boxGeometry args={[0.035, 0.28, 0.035]} />
            <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        );
      })}
      <pointLight ref={light} color={color} intensity={8} distance={4.5} decay={2} />
    </group>
  );
}

function modelHealth(typeId: string, invader = false): number {
  return (invader ? DS_INVADERS[typeId]?.data.health : DS_ENEMIES[typeId]?.data.health) ?? 1;
}

// ---------- boss arc indicator ----------

function ArcIndicator({ x, z, facing, r }: { x: number; z: number; facing: [number, number] | null; r: number }) {
  if (!facing || (facing[0] === 0 && facing[1] === 0)) return null;
  // px-space facing (y down) -> render (x, z); ring local angle t maps to
  // world (cos t, -sin t), so the facing angle is atan2(-fz, fx)
  const a = Math.atan2(-facing[1], facing[0]);
  const arcs: { start: number; color: string; op: number }[] = [
    { start: a - Math.PI / 4, color: '#e05050', op: 0.85 },          // front
    { start: a + Math.PI / 4, color: '#c9a25a', op: 0.4 },           // left (render right of facing)
    { start: a - 3 * Math.PI / 4, color: '#c9a25a', op: 0.4 },       // right
    { start: a + 3 * Math.PI / 4, color: '#7a7d86', op: 0.3 },       // back
  ];
  return (
    <group>
      {arcs.map((arc, i) => (
        <mesh key={i} position={[x, BOARD_Y + 0.025, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r, r + 0.13, 24, 1, arc.start + 0.05, Math.PI / 2 - 0.1]} />
          <meshBasicMaterial color={arc.color} transparent opacity={arc.op} depthWrite={false} />
        </mesh>
      ))}
      {/* front arrow tick */}
      <mesh position={[x + Math.cos(a) * (r + 0.34), BOARD_Y + 0.03, z - Math.sin(a) * (r + 0.34)]} rotation={[-Math.PI / 2, 0, a - Math.PI / 2]}>
        <coneGeometry args={[0.12, 0.3, 3]} />
        <meshBasicMaterial color="#e05050" />
      </mesh>
    </group>
  );
}

// ---------- fog wall ----------

function FogWall({ space }: { space: DsFaceSpace }) {
  const tex = useLoader(THREE.TextureLoader, DS_FOG_WALL);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; }, [tex]);
  const placement = useMemo(() => {
    const face = space.face;
    if (!face || face.entrances.length === 0) return null;
    const edge = face.entrances[0].edge;
    const pts = face.entrances.filter((e) => e.edge === edge).map((e) => space.nodeXZ(e.nodeId));
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const mz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const off = space.renderW * 0.46;
    if (edge === 'N') return { x: mx, z: -space.renderH / 2 * 0.98, yaw: 0 };
    if (edge === 'S') return { x: mx, z: space.renderH / 2 * 0.98, yaw: 0 };
    if (edge === 'W') return { x: -off, z: mz, yaw: Math.PI / 2 };
    return { x: off, z: mz, yaw: Math.PI / 2 };
  }, [space]);
  if (!placement) return null;
  const w = 3.4, h = 1.35;
  return (
    <mesh position={[placement.x, BOARD_Y + h / 2, placement.z]} rotation={[0, placement.yaw, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent opacity={0.75} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ---------- camera rig ----------

export interface DsFocus { x: number; z: number; dist: number }

function Rig({ home, focus }: { home: DsFocus; focus: DsFocus | null }) {
  const ref = useRef<OrbitControlsImpl>(null);
  const goal = useRef<DsFocus | null>(null);
  const { camera } = useThree();
  useEffect(() => { goal.current = focus; }, [focus]);
  useEffect(() => {
    const host = window as unknown as { __setCam?: (azimuth: number, elevation: number, distance: number) => void };
    const setCam = (azimuth: number, elevation: number, distance: number) => {
      const controls = ref.current;
      if (!controls) return;
      const az = THREE.MathUtils.degToRad(azimuth);
      const el = THREE.MathUtils.degToRad(elevation);
      const flat = Math.cos(el) * distance;
      camera.position.set(
        controls.target.x + Math.sin(az) * flat,
        controls.target.y + Math.sin(el) * distance,
        controls.target.z + Math.cos(az) * flat,
      );
      camera.lookAt(controls.target);
      controls.update();
      goal.current = null;
    };
    host.__setCam = setCam;
    return () => { if (host.__setCam === setCam) delete host.__setCam; };
  }, [camera]);
  useFrame(() => {
    const g = goal.current;
    const ctl = ref.current;
    if (!g || !ctl) return;
    ctl.target.lerp(new THREE.Vector3(g.x, 0.28, g.z), 0.07);
    const targetPos = new THREE.Vector3(g.x + 0.0001, g.dist * 0.82, g.z + g.dist * 0.72);
    camera.position.lerp(targetPos, 0.055);
    ctl.update();
    if (camera.position.distanceTo(targetPos) < 0.35) goal.current = null;
  });
  return (
    <OrbitControls
      ref={ref}
      target={[home.x, 0.28, home.z]}
      enableDamping
      dampingFactor={0.08}
      minDistance={3}
      maxDistance={60}
      minPolarAngle={Math.PI * 0.12}
      maxPolarAngle={Math.PI * 0.44}
    />
  );
}

// ---------- character spots around the bonfire camp ----------

// the fire pit centre in the bonfire tile art (2048px space), party fans out
// on the paved ground around it
const BONFIRE_SPOTS: [number, number][] = [
  [1010, 1440], [1170, 960], [560, 1720], [1450, 1330],
];

// ---------- the table ----------

export function DsTable({ view, manifest, focus, combatBeat }: {
  view: DsView;
  manifest: DsManifest;
  focus: DsFocus | null;
  combatBeat?: DsLogEntry | null;
}) {
  const enc = view.encounter;
  const atBonfire = !enc && view.partyAt === 'bonfire';
  const faceId = enc ? enc.faceId
    : view.partyAt !== 'bonfire' ? (view.tiles.find((t) => t.id === view.partyAt)?.faceId ?? 'bonfire')
      : 'bonfire';
  const space = useMemo(() => dsFaceSpace(atBonfire ? 'bonfire' : faceId), [atBonfire, faceId]);
  const art = atBonfire ? DS_BONFIRE_TILE : DS_FACE_ART[faceId] ?? DS_BONFIRE_TILE;
  const tile = enc?.tileId ? view.tiles.find((t) => t.id === enc.tileId) : null;
  const aliveEnemies = enc?.enemies.filter((enemy) => enemy.wounds < modelHealth(enemy.typeId, enemy.invader)) ?? [];
  const isCombatBeat = Boolean(combatBeat && (combatBeat.kind === 'attack' || combatBeat.kind === 'dice' || combatBeat.kind === 'death'));
  const combatBeatKey = isCombatBeat && combatBeat ? `${combatBeat.kind}:${combatBeat.text}:${combatBeat.nodeId ?? ''}:${combatBeat.seat ?? ''}` : null;
  const beatAtNode = (nodeId: string | null) => combatBeatKey && nodeId && combatBeat?.nodeId === nodeId ? combatBeatKey : null;
  const beatAtSeat = (seat: number, nodeId: string | null) => combatBeatKey
    && (combatBeat?.seat === seat || (nodeId && combatBeat?.nodeId === nodeId)) ? combatBeatKey : null;

  // characters: on nodes during an encounter, around the fire at the bonfire
  const charSpots = useMemo(() => {
    return view.characters.map((ch, i) => {
      if (!atBonfire && ch.nodeId && space.face) return { ch, xz: space.nodeXZ(ch.nodeId) };
      const [px, py] = BONFIRE_SPOTS[i % BONFIRE_SPOTS.length];
      const s = 2048 / (DS_BONFIRE_TILE.w);
      return { ch, xz: space.toXZ(px * s, py * s) };
    });
  }, [view.characters, atBonfire, space]);

  // stack offsets when several models share a node (cap 3)
  const stackShift = (idx: number, count: number): [number, number] => {
    if (count <= 1) return [0, 0];
    const a = (idx / count) * Math.PI * 2 + 0.6;
    return [Math.cos(a) * 0.55, Math.sin(a) * 0.55];
  };
  const occupancy = new Map<string, number>();
  const takeSlot = (nodeId: string | null): number => {
    if (!nodeId) return 0;
    const n = occupancy.get(nodeId) ?? 0;
    occupancy.set(nodeId, n + 1);
    return n;
  };
  const nodeCount = new Map<string, number>();
  if (enc) {
    for (const ch of view.characters) if (ch.nodeId) nodeCount.set(ch.nodeId, (nodeCount.get(ch.nodeId) ?? 0) + 1);
    for (const e of aliveEnemies) nodeCount.set(e.nodeId, (nodeCount.get(e.nodeId) ?? 0) + 1);
    for (const u of view.boss?.units ?? []) if (u.inPlay && u.nodeId) nodeCount.set(u.nodeId, (nodeCount.get(u.nodeId) ?? 0) + 1);
    if (view.summon?.nodeId) nodeCount.set(view.summon.nodeId, (nodeCount.get(view.summon.nodeId) ?? 0) + 1);
  }

  const bossNodes = new Set((view.boss?.units ?? []).filter((u) => u.inPlay && u.nodeId).map((u) => u.nodeId as string));

  const characterPoints: DsBoardPoint[] = view.characters.flatMap((character) =>
    character.nodeId ? [pointAt(space, character.nodeId)] : []);
  const enemyPoints: DsBoardPoint[] = aliveEnemies.map((enemy) => pointAt(space, enemy.nodeId));
  const bossPoints: DsBoardPoint[] = (view.boss?.units ?? []).flatMap((unit) =>
    unit.inPlay && unit.nodeId ? [pointAt(space, unit.nodeId)] : []);
  const hostilePoints = [...enemyPoints, ...bossPoints];
  const faceNearest = (from: DsBoardPoint, targets: DsBoardPoint[]) =>
    dsYawToward(from, dsNearestPoint(from, targets) ?? { x: 0, z: 0 });

  const home: DsFocus = {
    x: 0,
    z: 0,
    // Boss sculpts project far above the arena plane; the wider establishing
    // shot keeps their silhouette in frame before combat close-ups begin.
    dist: Math.max(space.renderW, space.renderH) * (view.phase === 'bossEncounter' ? 1.24 : 1.02),
  };

  return (
    <Canvas
      shadows
      camera={{ position: [0, home.dist * 0.82, home.dist * 0.72], fov: 40 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      style={{ position: 'absolute', inset: 0, background: '#04060a' }}
    >
      <fog attach="fog" args={['#030509', 28, 62]} />
      <hemisphereLight args={['#8390ad', '#150d09', 0.5]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        castShadow color="#ffd4a3" position={[12, 24, 8]} intensity={2.05}
        shadow-mapSize-width={1536} shadow-mapSize-height={1536}
        shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18}
        shadow-camera-near={1} shadow-camera-far={52} shadow-bias={-0.00035}
      />
      <directionalLight color="#7896c8" position={[-14, 14, -12]} intensity={0.72} />
      <spotLight color="#db6f39" position={[-7, 11, 5]} intensity={atBonfire ? 28 : 13}
        distance={28} angle={0.62} penumbra={0.9} decay={2} />
      <pointLight color={atBonfire ? '#ff8a38' : '#9f3e27'} position={[0, 2.8, 0]}
        intensity={atBonfire ? 21 : 7} distance={17} decay={2} />
      <Suspense fallback={null}>
        <TilePlane key={atBonfire ? 'bonfire' : faceId} image={art.image} renderW={space.renderW} renderH={space.renderH} />
        {!atBonfire && <NodeMarkers space={space} />}
        {combatBeatKey && combatBeat?.nodeId && space.face && (
          <CombatBurst key={combatBeatKey} x={space.nodeXZ(combatBeat.nodeId)[0]} z={space.nodeXZ(combatBeat.nodeId)[1]}
            magic={/magic|spell|sorcer/i.test(combatBeat.text)} />
        )}
        <Sparkles count={atBonfire ? 34 : 16} scale={[space.renderW * 0.72, 4.5, space.renderH * 0.72]}
          position={[0, 2.1, 0]} size={0.72} speed={0.18} opacity={0.42} color={atBonfire ? '#ff9a4a' : '#bd6b46'} />

        {/* terrain pieces from the encounter card rows */}
        {enc?.terrain.map((t, i) => {
          if (t.destroyed) return null;
          const [x, z] = space.nodeXZ(t.nodeId);
          if ((t.piece === 'chest' || t.piece === 'mimic-chest') && bossNodes.has(t.nodeId)) return null; // the mimic replaced its chest
          const def = dsMiniOf(manifest, DS_TERRAIN_MINI[t.piece] ?? t.piece);
          const opened = tile?.chests[t.nodeId] === 'open';
          const yaw = dsYawToward({ x, z }, { x: 0, z: 0 });
          return (
            <group key={`ter${i}`}>
              <Mini def={def} x={x} z={z} yaw={yaw} highlight={opened ? '#c9a25a' : null} />
            </group>
          );
        })}

        {/* trap tokens: face down until sprung (they keep their nodes) */}
        {enc && tile?.traps && Object.entries(tile.traps).map(([nodeId]) => {
          const [x, z] = space.nodeXZ(nodeId);
          const shown = enc.trapsRevealed.includes(nodeId);
          return shown
            ? <FlatToken key={`trap${nodeId}`} image={DS_TRAP_TOKEN} x={x + 0.55} z={z + 0.55} r={0.33} />
            : <FaceDownDisc key={`trap${nodeId}`} x={x + 0.55} z={z + 0.55} r={0.3} />;
        })}

        {/* dropped soul cache on a wipe node */}
        {enc && view.droppedSouls && view.droppedSouls.tileId === enc.tileId && (
          <FlatToken image={DS_SOULS_TOKEN} x={space.nodeXZ(view.droppedSouls.nodeId)[0]} z={space.nodeXZ(view.droppedSouls.nodeId)[1] + 0.4} r={0.34} />
        )}

        {/* enemies */}
        {aliveEnemies.map((e) => {
          const [nx, nz] = space.nodeXZ(e.nodeId);
          const [ox, oz] = stackShift(takeSlot(e.nodeId), nodeCount.get(e.nodeId) ?? 1);
          const def = dsMiniOf(manifest, e.typeId);
          const health = modelHealth(e.typeId, e.invader);
          const x = nx + ox, z = nz + oz;
          const yaw = faceNearest({ x, z }, characterPoints);
          return (
            <group key={e.uid}>
              <Mini def={def} x={x} z={z} yaw={yaw} highlight={e.invader ? '#b06adf' : null} beatKey={beatAtNode(e.nodeId)} />
              <WoundPips x={x} z={z} wounds={e.wounds} health={health} />
              {e.conditions.map((c, k) => (
                <FlatToken key={c} image={DS_CONDITION_TOKENS[c]} x={x - 0.5 + k * 0.3} z={z - 0.6} r={0.15} lift={0.035} />
              ))}
            </group>
          );
        })}

        {/* boss units + arc indicator */}
        {(view.boss?.units ?? []).filter((u: DsBossUnit) => u.inPlay && u.nodeId).map((u: DsBossUnit) => {
          const [x, z] = space.nodeXZ(u.nodeId!);
          const def = view.boss ? dsBossUnitMini(manifest, view.boss.id, u.key) : null;
          const yaw = u.facing ? Math.atan2(u.facing[0], u.facing[1]) : 0;
          takeSlot(u.nodeId);
          return (
            <group key={u.key}>
              <Mini def={def} x={x} z={z} yaw={yaw} beatKey={beatAtNode(u.nodeId)} />
              <ArcIndicator x={x} z={z} facing={u.facing} r={1.05} />
            </group>
          );
        })}

        {/* characters, seat-ringed; aggro token beside the holder */}
        {charSpots.map(({ ch, xz }) => {
          const [ox, oz] = enc ? stackShift(takeSlot(ch.nodeId), nodeCount.get(ch.nodeId ?? '') ?? 1) : [0, 0];
          const def = dsClassMini(manifest, ch.classId);
          const x = xz[0] + ox, z = xz[1] + oz;
          const yaw = atBonfire ? dsYawToward({ x, z }, { x: 0, z: 0 }) : faceNearest({ x, z }, hostilePoints);
          return (
            <group key={ch.seat}>
              <Mini def={def} x={x} z={z} yaw={yaw} highlight={DS_SEAT_HEX[ch.seat % DS_SEAT_HEX.length]} beatKey={beatAtSeat(ch.seat, ch.nodeId)} />
              {view.aggroSeat === ch.seat && enc && (
                <FlatToken image={DS_AGGRO_TOKEN} x={x + 0.62} z={z + 0.5} r={0.26} lift={0.03} />
              )}
              {ch.conditions.map((c, k) => (
                <FlatToken key={c} image={DS_CONDITION_TOKENS[c]} x={x - 0.5 + k * 0.3} z={z - 0.62} r={0.15} lift={0.035} />
              ))}
            </group>
          );
        })}

        {/* the summoned white phantom */}
        {view.summon?.nodeId && (() => {
          const [nx, nz] = space.nodeXZ(view.summon.nodeId);
          const [ox, oz] = stackShift(takeSlot(view.summon.nodeId), nodeCount.get(view.summon.nodeId) ?? 1);
          const x = nx + ox, z = nz + oz;
          return <Mini def={dsMiniOf(manifest, view.summon.id)} x={x} z={z} yaw={faceNearest({ x, z }, hostilePoints)}
            highlight="#cfd8ff" beatKey={beatAtNode(view.summon.nodeId)} />;
        })()}

        {/* the fog gate wall on the boss arena entry */}
        {view.phase === 'bossEncounter' && enc && <FogWall space={space} />}
      </Suspense>
      <Rig home={home} focus={focus} />
    </Canvas>
  );
}
