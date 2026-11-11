// A unit model as the stage draws it: a tree of rigid parts, each with a pivot and a way of moving,
// built from the glTF that tools/axis-models writes. Nothing is skinned. Every part of every figure
// is one instance in a batch, so thirty tanks with their turrets, guns, wheels and tracks are still
// a handful of draw calls.
//
// Model space is the file's: metres, y up, the unit faces +z. `fit` takes that to the field.
// No loaders and no DOM here, so this module also runs under node for the rig test.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DIMS } from './layout';

export type Anim = 'none' | 'yaw' | 'pitch' | 'spin' | 'track' | 'prop' | 'propdisc' | 'radar' | 'bone' | 'decal';
const ANIMS = new Set<string>(['none', 'yaw', 'pitch', 'spin', 'track', 'prop', 'propdisc', 'radar', 'bone', 'decal']);
export type MeshKind = 'body' | 'track' | 'decal' | 'propdisc';
export const MARKERS = ['muzzle', 'exhaust', 'smoke', 'bomb', 'launch', 'land', 'hatch'] as const;

export interface RigNode {
  name: string;
  parent: number;
  anim: Anim;
  /** Index into the rig's meshes, or -1 for a marker. */
  mesh: number;
  /** Which of that mesh's per-figure instances this node drives. */
  slot: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Limits in radians (yaw and pitch), or NaN for none. */
  min: number;
  max: number;
  speed: number;
  recoil: number;
  radius: number;
  rpm: number;
  /** Track link pitch in metres. */
  link: number;
  /** Aims at aircraft instead of surface targets. */
  air: boolean;
  marker: (typeof MARKERS)[number] | null;
  /** Marker or decal kind: cannon, mg, flak, naval, rifle, torpedo; insignia, fin, flag. */
  kind: string;
  variant: string | null;
  bone: string | null;
}

export interface RigMesh {
  geometry: THREE.BufferGeometry;
  kind: MeshKind;
  perFigure: number;
  triangles: number;
  /** Stand-ins bring their own material; real models share the unit's. */
  material?: THREE.Material;
}

export interface UnitRig {
  key: string;
  nodes: RigNode[];
  meshes: RigMesh[];
  byName: Map<string, number>;
  fit: THREE.Matrix4;
  /** Field units per model metre. */
  scale: number;
  /** Size on the field: x across, y up, z along the facing. */
  size: THREE.Vector3;
  triangles: number;
  standIn: boolean;
  muzzles: number[];
  smokes: number[];
  exhausts: number[];
  /** True when any yaw part aims at aircraft. */
  hasFlak: boolean;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const rad = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? (v * Math.PI) / 180 : NaN);

function meshKind(anim: Anim): MeshKind {
  return anim === 'track' ? 'track' : anim === 'decal' ? 'decal' : anim === 'propdisc' ? 'propdisc' : 'body';
}

/** Read a loaded glTF into a rig. Throws when the file does not follow the model rules. */
export function buildRig(key: string, gltf: GLTF): UnitRig {
  const nodes: RigNode[] = [];
  const meshes: RigMesh[] = [];
  const meshOf = new Map<string, number>();
  const bounds = new THREE.Box3();
  gltf.scene.updateMatrixWorld(true);

  const visit = (o: THREE.Object3D, parent: number) => {
    const raw = String((o.userData as { name?: string }).name ?? o.name ?? '');
    const extras = o.userData as Record<string, unknown>;
    const mesh = o as THREE.Mesh;
    const isMesh = mesh.isMesh === true && !!mesh.geometry?.attributes.position;
    const marker = !isMesh ? MARKERS.find((m) => raw.startsWith(m)) ?? null : null;
    let index = parent;
    if (isMesh || marker || o.children.length > 0) {
      const tag = String(extras.anim ?? 'none');
      if (isMesh && !ANIMS.has(tag)) throw new Error(`${key}: part "${raw}" has an unknown anim tag "${tag}"`);
      if (Math.abs(o.scale.x - 1) > 1e-3 || Math.abs(o.scale.y - 1) > 1e-3 || Math.abs(o.scale.z - 1) > 1e-3) throw new Error(`${key}: part "${raw}" is scaled`);
      const anim = (isMesh ? tag : 'none') as Anim;
      let mi = -1, slot = 0;
      if (isMesh) {
        const g = mesh.geometry;
        const hit = meshOf.get(g.uuid);
        if (hit == null) {
          const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
          const next = g.getAttribute('_next');
          if (next) { g.setAttribute('aNext', next); g.deleteAttribute('_next'); }
          if (anim === 'track' && !g.getAttribute('aNext')) throw new Error(`${key}: track "${raw}" has no _next data`);
          for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aNext'].includes(name)) g.deleteAttribute(name);
          mi = meshes.length;
          meshes.push({ geometry: g, kind: meshKind(anim), perFigure: 1, triangles: tris });
          meshOf.set(g.uuid, mi);
        } else {
          mi = hit;
          slot = meshes[mi].perFigure;
          meshes[mi].perFigure += 1;
        }
        if (anim !== 'decal' && anim !== 'propdisc') {
          g.computeBoundingBox();
          bounds.union(g.boundingBox!.clone().applyMatrix4(o.matrixWorld));
        }
      }
      index = nodes.length;
      nodes.push({
        name: raw, parent, anim, mesh: mi, slot,
        pos: o.position.clone(), quat: o.quaternion.clone(),
        min: rad(extras.min), max: rad(extras.max),
        speed: num(extras.speed, anim === 'pitch' ? 0.9 : 0.7),
        recoil: num(extras.recoil, 0), radius: num(extras.radius, 0.3), rpm: num(extras.rpm, anim === 'radar' ? 6 : 1200),
        link: num(extras.pitch, 0.15),
        air: extras.aims === 'air',
        marker, kind: String(extras.kind ?? ''),
        variant: typeof extras.variant === 'string' ? extras.variant : null,
        bone: typeof extras.bone === 'string' ? extras.bone : null,
      });
    }
    for (const c of o.children) visit(c, index);
  };
  for (const c of gltf.scene.children) visit(c, -1);
  if (meshes.length === 0 || bounds.isEmpty()) throw new Error(`${key}: no geometry`);

  const dims = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const target = DIMS[key]?.size ?? 6;
  const scale = target / ((key === 'infantry' ? dims.y : Math.max(dims.x, dims.y, dims.z)) || 1);
  // the soldier stands on his own origin; everything else is centred on its footprint
  const cx = key === 'infantry' ? 0 : centre.x, cz = key === 'infantry' ? 0 : centre.z;
  const fit = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
  return finishRig(key, nodes, meshes, fit, scale, dims.multiplyScalar(scale), false);
}

function finishRig(key: string, nodes: RigNode[], meshes: RigMesh[], fit: THREE.Matrix4, scale: number, size: THREE.Vector3, standIn: boolean): UnitRig {
  const byName = new Map<string, number>();
  nodes.forEach((n, i) => { if (!byName.has(n.name)) byName.set(n.name, i); });
  const list = (m: string) => nodes.map((n, i) => (n.marker === m ? i : -1)).filter((i) => i >= 0);
  for (const n of nodes) {
    if (n.anim === 'pitch' && (n.parent < 0 || nodes[n.parent].anim !== 'yaw')) {
      // a gun that elevates without a mount that turns still works; it just cannot traverse
    }
  }
  return {
    key, nodes, meshes, byName, fit, scale, size, standIn,
    triangles: meshes.reduce((n, m) => n + m.triangles * m.perFigure, 0),
    muzzles: list('muzzle'), smokes: list('smoke'), exhausts: list('exhaust'),
    hasFlak: nodes.some((n) => n.anim === 'yaw' && n.air),
  };
}

/** A rig with one fixed part per given geometry: what a built stand-in shape becomes. */
export function rigFromParts(key: string, parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[], size: THREE.Vector3): UnitRig {
  const nodes: RigNode[] = [];
  const meshes: RigMesh[] = [];
  parts.forEach((p, i) => {
    const tris = (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count) / 3;
    meshes.push({ geometry: p.geometry, kind: 'body', perFigure: 1, triangles: tris, material: p.material });
    nodes.push({
      name: `part${i}`, parent: -1, anim: 'none', mesh: i, slot: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
      min: NaN, max: NaN, speed: 0, recoil: 0, radius: 0.3, rpm: 0, link: 0.15, air: false, marker: null, kind: '', variant: null, bone: null,
    });
  });
  return finishRig(key, nodes, meshes, new THREE.Matrix4(), 1, size.clone(), true);
}

// ---------- materials ----------

export interface UnitTextures { map: THREE.Texture; normalMap: THREE.Texture; orm: THREE.Texture }

/**
 * The unit's one surface. The albedo's alpha is the paint mask: where it is high the nation's
 * colour (the instance colour) replaces the baked neutral paint, keeping its light and dark, so
 * chips, rust, dust, rubber and wood keep their own colour. aFx.x burns a figure black; aFx.y runs
 * a track by blending every vertex toward where it will be one link on.
 */
export function unitMaterial(tex: UnitTextures | null, track: boolean): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: tex?.map ?? null, normalMap: tex?.normalMap ?? null,
    aoMap: tex?.orm ?? null, roughnessMap: tex?.orm ?? null, metalnessMap: tex?.orm ?? null,
    roughness: 1, metalness: 1, aoMapIntensity: 0.9, color: 0xffffff,
  });
  if (!tex) { material.roughness = 0.7; material.metalness = 0.15; material.color.set(0x80838a); }
  material.normalScale.set(1, 1);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aFx;\nvarying float vBurn;${track ? '\nattribute vec3 aNext;' : ''}`)
      .replace('#include <begin_vertex>', track
        ? 'vec3 transformed = mix(position, aNext, aFx.y);\nvBurn = aFx.x;'
        : '#include <begin_vertex>\nvBurn = aFx.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBurn;')
      .replace('#include <map_fragment>', /* glsl */`
        float paintMask = 0.0;
        #ifdef USE_MAP
          vec4 texel = texture2D(map, vMapUv);
          // stored from 16/255 up so the file format keeps the colour of unpainted surfaces (pack.mjs)
          paintMask = clamp((texel.a - 0.062745) / 0.937255, 0.0, 1.0);
          diffuseColor.rgb *= texel.rgb;
        #endif`)
      .replace('#include <color_fragment>', /* glsl */`
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
          float paintLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb * (paintLum * 1.8), ${tex ? 'paintMask' : '0.85'});
        #endif
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.014, 0.012, 0.011), vBurn * 0.9);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.96, vBurn);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - vBurn * 0.8;')
      // a zero normal, normalised, is not a number, and one such pixel spreads through the bloom
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nif (!(dot(normal, normal) > 0.25)) normal = vec3(0.0, 0.0, 1.0);');
  };
  material.customProgramCacheKey = () => `axb-unit-${track ? 't' : 'b'}-${tex ? 'x' : 'p'}`;
  return material;
}

/** National markings: one sheet, a column per nation, a row per kind. aCell picks the cell. */
export function decalMaterial(sheet: THREE.Texture, cols: number, rows: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: sheet, transparent: true, alphaTest: 0.04, depthWrite: false, roughness: 0.62, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFx;\nattribute vec2 aCell;\nvarying float vBurn;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (uv + aCell) * vec2(${(1 / cols).toFixed(6)}, ${(1 / rows).toFixed(6)});\n#endif\nvBurn = aFx.x;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBurn;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.014, 0.012, 0.011), vBurn * 0.9);\ndiffuseColor.a *= 0.92;');
  };
  material.customProgramCacheKey = () => `axb-decal-${cols}-${rows}`;
  return material;
}

// ---------- drawing ----------

export interface RigMaterials { body: THREE.Material; track: THREE.Material; decal: THREE.Material; propdisc: THREE.Material }

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Every figure of one unit type, drawn as one instanced mesh per distinct part shape. */
export class RigBatch {
  readonly meshes: THREE.InstancedMesh[] = [];
  private fx: THREE.InstancedBufferAttribute[] = [];
  private cell: (THREE.InstancedBufferAttribute | null)[] = [];
  private dirtyM = false;
  private dirtyC = false;
  private dirtyF = false;

  constructor(readonly rig: UnitRig, readonly capacity: number, parent: THREE.Object3D, mats: RigMaterials, shadows: boolean) {
    for (const m of rig.meshes) {
      const n = capacity * m.perFigure;
      // its own geometry object (the attributes are shared), so it can carry per-instance data
      const g = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(m.geometry.attributes)) g.setAttribute(name, attr);
      g.setIndex(m.geometry.index);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
      fx.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aFx', fx);
      let cell: THREE.InstancedBufferAttribute | null = null;
      if (m.kind === 'decal') {
        cell = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
        g.setAttribute('aCell', cell);
      }
      const mesh = new THREE.InstancedMesh(g, m.material ?? mats[m.kind], n);
      mesh.frustumCulled = false;
      const solid = m.kind === 'body' || m.kind === 'track';
      mesh.castShadow = shadows && solid;
      mesh.receiveShadow = solid;
      if (m.kind === 'propdisc') mesh.renderOrder = 4;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.sharedGeometry = true;
      mesh.userData.sharedMaterial = true;
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, ZERO);
      parent.add(mesh);
      this.meshes.push(mesh);
      this.fx.push(fx);
      this.cell.push(cell);
    }
  }

  setNode(fig: number, node: RigNode, m: THREE.Matrix4 | null) {
    if (node.mesh < 0) return;
    this.meshes[node.mesh].setMatrixAt(fig * this.rig.meshes[node.mesh].perFigure + node.slot, m ?? ZERO);
    this.dirtyM = true;
  }

  setTint(fig: number, c: THREE.Color) {
    this.rig.meshes.forEach((m, i) => {
      if (m.kind === 'decal' || m.kind === 'propdisc') return;
      for (let s = 0; s < m.perFigure; s++) this.meshes[i].setColorAt(fig * m.perFigure + s, c);
    });
    this.dirtyC = true;
  }

  setFx(fig: number, burn: number, phase: number) {
    this.rig.meshes.forEach((m, i) => {
      const a = this.fx[i].array as Float32Array;
      for (let s = 0; s < m.perFigure; s++) {
        const k = (fig * m.perFigure + s) * 2;
        a[k] = burn;
        a[k + 1] = phase;
      }
    });
    this.dirtyF = true;
  }

  /** Which marking each decal of this figure shows. */
  setCells(fig: number, col: number, rowOf: (kind: string) => number) {
    for (const node of this.rig.nodes) {
      if (node.anim !== 'decal' || node.mesh < 0) continue;
      const attr = this.cell[node.mesh];
      if (!attr) continue;
      const k = (fig * this.rig.meshes[node.mesh].perFigure + node.slot) * 2;
      (attr.array as Float32Array)[k] = col;
      (attr.array as Float32Array)[k + 1] = rowOf(node.kind);
      attr.needsUpdate = true;
    }
  }

  commit() {
    if (this.dirtyM) for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    if (this.dirtyC) for (const mesh of this.meshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (this.dirtyF) for (const fx of this.fx) fx.needsUpdate = true;
    this.dirtyM = this.dirtyC = this.dirtyF = false;
  }

  dispose(parent: THREE.Object3D) {
    for (const mesh of this.meshes) {
      parent.remove(mesh);
      mesh.geometry.dispose();   // the wrapper only: its attributes belong to the cached rig
      mesh.dispose();
    }
  }
}

// ---------- posing ----------

export interface BonePose {
  q: THREE.Quaternion;
  /** Added to the bone's rest position (model metres). */
  t?: THREE.Vector3;
  /** Hang from this part instead of the authored parent, at `t` exactly. */
  from?: string;
}

/** Everything about one figure that moves its parts. */
export interface RigState {
  /** Per node: the current turn, elevation, spin or sweep, in radians. */
  angle: Float32Array;
  /** Per node: recoil, 1 just fired .. 0 back in battery. */
  kick: Float32Array;
  /** Per node: 1 when a mount can bear on its target. */
  bears: Uint8Array;
  /** What surface guns point at, in the world; null rests them fore and aft. */
  aim: THREE.Vector3 | null;
  aimAir: THREE.Vector3 | null;
  /** Extra elevation for lobbed fire, radians. */
  loft: number;
  /** Metres rolled so far, in model space: turns wheels and runs tracks. */
  travel: number;
  /** Propellers at speed: blades hidden, discs shown. */
  flying: boolean;
  /** 0 fighting .. 1 wrecked: guns droop, things stop. */
  wreck: number;
  variant: string;
  bones: Map<string, BonePose> | null;
}

export function newRigState(rig: UnitRig, variant = 'a'): RigState {
  const n = rig.nodes.length;
  return { angle: new Float32Array(n), kick: new Float32Array(n), bears: new Uint8Array(n), aim: null, aimAir: null, loft: 0, travel: 0, flying: false, wreck: 0, variant, bones: null };
}

const W: THREE.Matrix4[] = [];
const REST = new THREE.Matrix4();
const INV = new THREE.Matrix4();
const LOCAL = new THREE.Matrix4();
const ROOT = new THREE.Matrix4();
const P = new THREE.Vector3();
const QA = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;

const wrap = (a: number) => a - Math.round(a / TAU) * TAU;
const approach = (cur: number, want: number, step: number) => cur + Math.max(-step, Math.min(step, want - cur));

function world(i: number): THREE.Matrix4 {
  while (W.length <= i) W.push(new THREE.Matrix4());
  return W[i];
}

/**
 * Advance one figure's moving parts by dt and write every part's matrix into the batch.
 * `figure` places the figure on the field (position, heading, roll, scale).
 */
export function poseRig(rig: UnitRig, st: RigState, figure: THREE.Matrix4, dt: number, batch: RigBatch | null, slot: number, visible = true): void {
  ROOT.multiplyMatrices(figure, rig.fit);
  const live = st.wreck < 0.5;
  for (let i = 0; i < rig.nodes.length; i++) {
    const n = rig.nodes[i];
    let parent = n.parent < 0 ? ROOT : world(n.parent);
    const out = world(i);
    const bone = n.bone && st.bones ? st.bones.get(n.bone) : undefined;
    if (bone?.from) {
      const pi = rig.byName.get(bone.from);
      if (pi != null && pi < i) parent = world(pi);
      REST.compose(bone.t ?? n.pos, bone.q, ONE);
      out.multiplyMatrices(parent, REST);
    } else {
      if (bone?.t) REST.compose(P.copy(n.pos).add(bone.t), n.quat, ONE);
      else REST.compose(n.pos, n.quat, ONE);
      REST.premultiply(parent);   // this part at rest, in the world
      switch (n.anim) {
        case 'yaw': {
          const target = n.air ? st.aimAir : st.aim;
          let want = 0;
          st.bears[i] = 0;
          if (target && live) {
            P.copy(target).applyMatrix4(INV.copy(REST).invert());
            want = Math.atan2(P.x, P.z);
            const free = Number.isNaN(n.min) || Number.isNaN(n.max);
            const held = free ? want : Math.max(n.min, Math.min(n.max, want));
            st.bears[i] = Math.abs(held - want) < 0.02 ? 1 : 0;
            want = held;
            if (free) want = st.angle[i] + wrap(want - st.angle[i]);
          }
          // a wreck's turret stays where it was when it died
          if (live) st.angle[i] = approach(st.angle[i], want, n.speed * dt * (target ? 1 : 0.5));
          if (st.bears[i] && Math.abs(wrap(st.angle[i] - want)) > 0.2) st.bears[i] = 0;
          out.multiplyMatrices(REST, LOCAL.makeRotationY(st.angle[i]));
          break;
        }
        case 'pitch': {
          const yawNode = n.parent >= 0 ? rig.nodes[n.parent] : null;
          const target = yawNode?.air ? st.aimAir : st.aim;
          const lo = Number.isNaN(n.min) ? -0.1 : n.min, hi = Number.isNaN(n.max) ? 1.2 : n.max;
          let want = live ? 0 : lo * 0.8;
          if (target && live) {
            P.copy(target).applyMatrix4(INV.copy(REST).invert());
            want = Math.atan2(P.y, Math.hypot(P.x, P.z)) + (yawNode?.air ? 0 : st.loft);
          }
          want = Math.max(lo, Math.min(hi, want));
          st.angle[i] = approach(st.angle[i], want, n.speed * dt);
          st.kick[i] = Math.max(0, st.kick[i] - dt * 2.4);
          const k = st.kick[i];
          // out fast, back slow
          const back = n.recoil * (k > 0.8 ? (1 - k) * 5 : k * 1.25);
          LOCAL.makeRotationX(-st.angle[i]);
          out.multiplyMatrices(REST, LOCAL);
          if (back > 0) out.multiply(LOCAL.makeTranslation(0, 0, -back));
          break;
        }
        case 'spin':
          out.multiplyMatrices(REST, LOCAL.makeRotationX(st.travel / Math.max(0.05, n.radius)));
          break;
        case 'prop':
          if (live) st.angle[i] = (st.angle[i] + (n.rpm / 60) * TAU * dt * (st.flying ? 0.07 : 0.02)) % TAU;
          out.multiplyMatrices(REST, LOCAL.makeRotationZ(st.angle[i]));
          break;
        case 'radar':
          if (live) st.angle[i] = (st.angle[i] + (n.rpm / 60) * TAU * dt) % TAU;
          out.multiplyMatrices(REST, LOCAL.makeRotationY(st.angle[i]));
          break;
        case 'bone':
          if (bone) out.multiplyMatrices(REST, LOCAL.makeRotationFromQuaternion(bone.q));
          else out.copy(REST);
          break;
        default:
          out.copy(REST);
      }
    }
    if (!batch || n.mesh < 0) continue;
    let show = visible;
    if (n.variant && n.variant !== st.variant) show = false;
    if (n.anim === 'prop' && st.flying && live) show = false;
    if (n.anim === 'propdisc' && !(st.flying && live)) show = false;
    batch.setNode(slot, n, show ? out : null);
  }
}

/** Where a part or marker is in the world right now (no time passes). Pose the figure first. */
export function nodeWorld(rig: UnitRig, st: RigState, figure: THREE.Matrix4, index: number, out: THREE.Vector3, forward?: THREE.Vector3): THREE.Vector3 {
  poseRig(rig, st, figure, 0, null, 0);
  const m = world(index);
  out.setFromMatrixPosition(m);
  if (forward) forward.set(m.elements[8], m.elements[9], m.elements[10]).normalize();
  return out;
}

/** The quaternion for a rotation of x, then y, then z radians about the part's own axes. */
export function euler(x: number, y: number, z: number, out = new THREE.Quaternion()): THREE.Quaternion {
  out.setFromAxisAngle(AX, x);
  if (y) out.multiply(QA.setFromAxisAngle(AY, y));
  if (z) out.multiply(QA.setFromAxisAngle(AZ, z));
  return out;
}
