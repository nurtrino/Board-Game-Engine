// The battlefield. One imperative three.js stage that owns the renderer, the set, both armies, the
// camera and every effect. The React theater mounts it, feeds it engine state and asks it to play
// beats; nothing here knows about React or the network.
//
// +x is the defender's side, -x the attacker's. The camera lives on +z looking across the field.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Beat } from '../timeline';
import { terrainOf, type Terrain } from '../timeline';
import { combatantInk, combatantPaint, other, plural, unitDomain, type Combat, type Side } from '../model';
import { BattleSound, fireSoundFor, type BattleSoundName } from '../sound';
import { loadFoliage, loadSky, loadTexture, loadUnit, releaseGpu, type FoliageModel, type UnitModel } from './assets';
import { climateOf, heightAt, layoutField, scatterFoliage, DIMS, SHORE_X, type FieldLayout, type Figure, type GroupLayout } from './layout';
import { Particles } from './particles';
import { figureCounts, truthFor } from './roster';
import { buildFlag, buildFoliage, buildGround, buildSky, buildTrees, buildWater, disposeObject, lookFor, waveFlag, waveHeight, type Flag, type Look } from './scenery';
import { Tweens, ease, lerp, type Ease } from './tween';

const V3 = THREE.Vector3;
type Vec = THREE.Vector3;
type VolleyBeat = Extract<Beat, { type: 'volley' }>;

interface Shot { pos: Vec; look: Vec; fov?: number }

class Rig {
  pos = new V3(0, 60, 110);
  look = new V3(0, 0, 0);
  fov = 38;
  shake = 0;
  /** While no move is running, the camera eases toward this (the idle drift). */
  auto: ((t: number) => Shot) | null = null;
  private moving = 0;
  constructor(private cam: THREE.PerspectiveCamera, private tw: Tweens) {}

  cut(s: Shot) {
    this.pos.copy(s.pos);
    this.look.copy(s.look);
    if (s.fov) this.fov = s.fov;
  }
  to(s: Shot, seconds: number, e: Ease = ease.inOut): Promise<void> {
    const p0 = this.pos.clone(), l0 = this.look.clone(), f0 = this.fov, f1 = s.fov ?? this.fov;
    this.moving += 1;
    return this.tw.run(seconds, (k) => {
      this.pos.lerpVectors(p0, s.pos, k);
      this.look.lerpVectors(l0, s.look, k);
      this.fov = lerp(f0, f1, k);
    }, e).then(() => { this.moving -= 1; });
  }
  update(dt: number, t: number) {
    if (this.auto && this.moving <= 0) {
      const s = this.auto(t);
      const k = 1 - Math.exp(-dt * 0.9);
      this.pos.lerp(s.pos, k);
      this.look.lerp(s.look, k);
      if (s.fov) this.fov = lerp(this.fov, s.fov, k);
    }
    const sh = this.shake;
    this.cam.position.set(
      this.pos.x + (Math.random() - 0.5) * sh,
      this.pos.y + (Math.random() - 0.5) * sh * 0.7,
      this.pos.z + (Math.random() - 0.5) * sh,
    );
    this.shake *= Math.exp(-dt * 6);
    if (this.shake < 0.004) this.shake = 0;
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
    this.cam.lookAt(this.look);
  }
}

/** One instanced draw per material part, shared by every figure of a unit type. */
class Batch {
  meshes: THREE.InstancedMesh[] = [];
  private dirtyM = false;
  private dirtyC = false;
  constructor(readonly model: UnitModel, capacity: number, parent: THREE.Object3D, shadows: boolean) {
    for (const part of model.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.frustumCulled = false;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.sharedGeometry = true;
      mesh.userData.sharedMaterial = true;
      parent.add(mesh);
      this.meshes.push(mesh);
    }
  }
  setMatrix(i: number, m: THREE.Matrix4) {
    for (const mesh of this.meshes) mesh.setMatrixAt(i, m);
    this.dirtyM = true;
  }
  setColor(i: number, c: THREE.Color) {
    for (const mesh of this.meshes) mesh.setColorAt(i, c);
    this.dirtyC = true;
  }
  commit() {
    if (this.dirtyM) for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    if (this.dirtyC) for (const mesh of this.meshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.dirtyM = this.dirtyC = false;
  }
}

type FigState = 'alive' | 'dead' | 'gone';

interface Orbit { cx: number; cz: number; rx: number; rz: number; alt: number; w: number; phase: number }

interface Fig {
  f: Figure;
  batch: Batch;
  slot: number;
  size: Vec;
  domain: string;
  state: FigState;
  submerged: boolean;
  aboard: boolean;
  /** Current world position, for effects and targeting. */
  at: Vec;
  yaw: number;
  y0: number;
  recoil: number;
  /** 0 standing .. 1 wreck. */
  death: number;
  dying: boolean;
  /** 0 present .. 1 departed (retreat) */
  leave: number;
  leaving: boolean;
  /** 0 hidden .. 1 fully under (submerge) */
  dive: number;
  /** 1 hidden in the sky .. 0 landed (paratroopers) */
  drop: number;
  /** Position in the stage's figure list. */
  index: number;
  /** 1 still off the field .. 0 in the line (the attackers' advance) */
  enter: number;
  enterDist: number;
  burn: number;
  smokeAcc: number;
  damaged: boolean;
  orbit: Orbit | null;
  fall: { from: Vec; to: Vec; t: number } | null;
  tint: THREE.Color;
  static: boolean;
  dirty: boolean;
  rollSeed: number;
}

interface GroupRt { layout: GroupLayout; figs: Fig[]; label: HTMLDivElement | null; alive: number }

interface Projectile {
  from: Vec; to: Vec; t: number; dur: number; arc: number;
  kind: 'bullet' | 'shell' | 'bomb' | 'rocket' | 'torpedo';
  impact: number;
  water: boolean;
  trail: number;
}

interface Boom { sprite: THREE.Sprite; t: number; active: boolean }

const EXPL = { cols: 5, rows: 5, frames: 25, fps: 30 };
const DRAFT: Record<string, number> = { battleship: 0.7, cruiser: 0.58, destroyer: 0.44, carrier: 1.7, submarine: 2.6, transport: 1.0 };
const WRECK = new THREE.Color(0x1c1a18);
const SCORCH_MAX = 96;

/** Nothing that is not a number, and nothing absurdly bright, may reach the bloom. */
const SANITIZE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (!(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1.0e4 && c.g < 1.0e4 && c.b < 1.0e4)) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(min(c.rgb, vec3(48.0)), 1.0);
    }`,
};

/** The last pass before output: darker corners and a little more contrast. */
const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uVignette: { value: 0.42 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 1.08);
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.86);
      c.rgb *= 1.0 - uVignette * smoothstep(0.32, 0.86, length(q) * 1.35);
      gl_FragColor = c;
    }`,
};

function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(0,0,0,.85)');
  grad.addColorStop(0.55, 'rgba(0,0,0,.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function scorchTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(10,8,6,.92)');
  grad.addColorStop(0.4, 'rgba(18,14,10,.7)');
  grad.addColorStop(0.75, 'rgba(26,20,14,.28)');
  grad.addColorStop(1, 'rgba(30,24,16,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // thrown earth: streaks out from the middle
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, r0 = 10 + Math.random() * 18, r1 = r0 + 12 + Math.random() * 26;
    g.strokeStyle = `rgba(14,11,8,${(0.18 + Math.random() * 0.3).toFixed(2)})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0);
    g.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: readonly T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

export class BattleStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 3200);
  readonly tw = new Tweens();
  /** Called if the GPU context is lost and the 2D presentation has to take over. */
  onLost: (() => void) | null = null;
  ready = false;

  private rig: Rig;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private buildId = 0;
  private sound = new BattleSound();

  private set = new THREE.Group();
  private army = new THREE.Group();
  private smoke = new Particles(1400, false);
  private glow = new Particles(1100, true);
  private booms: Boom[] = [];
  private boomTex: THREE.Texture[] = [];
  private projectiles: Projectile[] = [];
  private figs: Fig[] = [];
  private groups = new Map<string, GroupRt>();
  private groupOfUid = new Map<number, GroupRt>();
  private batches = new Map<string, Batch>();
  private flags: { flag: Flag; follow: Fig | null }[] = [];
  private water: THREE.Mesh | null = null;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scorch: THREE.InstancedMesh;
  private scorchN = 0;
  private blobs: THREE.InstancedMesh | null = null;
  private blobTex = blobTexture();
  /** Set to keep full quality whatever the frame rate (the dev bench, where the pane is throttled). */
  lockQuality = false;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fogColor = new THREE.Color(0x8d959c);
  private look: Look = lookFor('temperate', 'land', false);
  private terrain: Terrain = 'land';
  private layout: FieldLayout | null = null;
  private seed = 1;
  private calm = 1;
  private kind: Combat['kind'] = 'battle';
  private pending: Record<Side, number> = { attacker: 0, defender: 0 };
  private pendingAcc = 0;
  private ambientAcc = 0;
  private wrecks = 0;
  /** 0 full quality .. 3 lowest. Steps down when frames run long, never back up mid-battle. */
  private quality = 0;
  private slowFrames = 0;
  private frames = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private s3 = new V3();
  private p3 = new V3();

  constructor(private container: HTMLElement, private labelLayer: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.addEventListener('webglcontextlost', this.handleLost, false);
    // Throws when WebGL is unavailable; the theater catches it and shows the 2D presentation.
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.02;
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    container.appendChild(canvas);
    this.scene.background = this.fogColor.clone();
    this.scene.fog = new THREE.FogExp2(this.fogColor.getHex(), 0.004);
    this.rig = new Rig(this.camera, this.tw);

    this.hemi = new THREE.HemisphereLight(0xdfe8f2, 0x4a4438, 0.85);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff2dd, 2.4));
    sun.position.set(-90, 125, 128);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.06;
    this.scene.add(sun, sun.target);

    this.scene.add(this.set, this.army, this.smoke.points, this.glow.points);

    // craters and burnt ground left where shells land
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    this.scorch = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({
      map: scorchTexture(), transparent: true, depthWrite: false, opacity: 0.9,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), SCORCH_MAX);
    this.scorch.count = 0;
    this.scorch.frustumCulled = false;
    this.scorch.renderOrder = 1;
    this.scene.add(this.scorch);

    // The picture goes through a short film chain: bloom on anything hotter than white, then a grade.
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new ShaderPass(SANITIZE));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.5, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(GRADE));
    this.composer.addPass(new OutputPass());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  private handleLost = (event: Event) => {
    event.preventDefault();
    if (this.disposed) return;
    this.onLost?.();
  };

  // ---------- building a battle ----------

  /** Build the set and both armies for a combat, from its current state. Safe to call again for a new combat. */
  async build(combat: Combat): Promise<boolean> {
    const id = ++this.buildId;
    this.ready = false;
    const terrain = terrainOf(combat);
    const climate = climateOf(combat.space);
    const coldSea = terrain === 'sea' && climate === 'snow';
    const look = lookFor(climate, terrain, coldSea);
    const units = [...combat.battle.attacker, ...combat.battle.defender];
    const layout = layoutField(units, terrain);
    const keys = [...new Set(layout.groups.filter((g) => g.figures.length > 0).map((g) => g.key))];
    const needsFactory = combat.kind !== 'battle' && !keys.includes('factory');
    if (needsFactory) keys.push('factory');
    const scatter = scatterFoliage(climate, terrain, layout.extentX, layout.extentZ, this.seedFor(combat));

    const [models, foliage, grass, normals, boom, sky] = await Promise.all([
      Promise.all(keys.map((k) => loadUnit(k).then((m) => [k, m] as const))),
      Promise.all((['bush'] as const).map((k) =>
        (scatter.some((s) => s.kind === k) ? loadFoliage(k) : Promise.resolve(null)).then((m) => [k, m] as const))),
      terrain === 'sea' ? Promise.resolve(null) : loadTexture('ground-grass.jpg'),
      terrain === 'land' ? Promise.resolve(null) : loadTexture('waternormals.jpg', { srgb: false }),
      loadTexture('explosion.png', { repeat: false }),
      loadSky(),
    ]);
    if (this.disposed || id !== this.buildId) return false;

    this.clearBattle();
    this.terrain = terrain;
    this.look = look;
    this.layout = layout;
    this.kind = combat.kind;
    this.seed = this.seedFor(combat);
    this.calm = terrain === 'sea' ? 1 : 0.38;

    // sky, fog and light: a painted dome with a low sun; the photographed sky only lights the models
    this.fogColor.copy(look.horizon);
    this.scene.background = this.fogColor.clone();
    this.scene.environment = sky;
    this.scene.environmentIntensity = 0.3;
    this.set.add(buildSky(look));
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.fogColor);
    fog.density = look.fogDensity;
    this.sun.color.copy(look.sun);
    this.sun.intensity = look.sunIntensity;
    this.sun.position.copy(look.sunDir).multiplyScalar(230);
    this.hemi.color.copy(look.zenith).lerp(new THREE.Color(0xffffff), 0.5);
    this.hemi.groundColor.copy(look.dirt).multiplyScalar(0.7);
    this.hemi.intensity = 0.5;
    // snow is already near white: only real fire should bloom on it
    this.bloom.threshold = climate === 'snow' ? 2.4 : climate === 'desert' ? 1.7 : 1.15;
    const reach = Math.max(70, layout.extentX + 24);
    const cam = this.sun.shadow.camera;
    cam.left = -reach; cam.right = reach; cam.top = reach * 0.8; cam.bottom = -reach * 0.8;
    cam.near = 20; cam.far = 460;
    cam.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;

    // the set
    if (terrain !== 'sea') {
      this.set.add(buildGround(terrain, look, grass, this.seed));
      const fol = buildFoliage(Object.fromEntries(foliage) as Record<string, FoliageModel | null>, scatter, terrain, look, this.seed);
      fol.traverse((o) => { o.userData.sharedGeometry = true; o.userData.sharedMaps = true; });
      this.set.add(fol);
      this.set.add(buildTrees(scatter, terrain, climate, this.seed));
    }
    if (terrain !== 'land') {
      this.water = buildWater(terrain, look, normals, this.fogColor);
      this.set.add(this.water);
    }

    // explosion sprites
    if (boom && this.booms.length === 0) {
      for (let i = 0; i < 12; i++) {
        const tex = boom.clone();
        tex.repeat.set(1 / EXPL.cols, 1 / EXPL.rows);
        tex.needsUpdate = true;
        this.boomTex.push(tex);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
        sprite.visible = false;
        sprite.renderOrder = 7;
        this.scene.add(sprite);
        this.booms.push({ sprite, t: 0, active: false });
      }
    }

    // the armies
    const modelOf = new Map(models);
    const counts = new Map<string, number>();
    for (const g of layout.groups) counts.set(g.key, (counts.get(g.key) ?? 0) + g.figures.length);
    if (needsFactory) counts.set('factory', (counts.get('factory') ?? 0) + 1);
    for (const [key, n] of counts) {
      const model = modelOf.get(key);
      if (!model || n === 0) continue;
      this.batches.set(key, new Batch(model, n, this.army, true));
    }
    const used = new Map<string, number>();
    const airIndex: Record<Side, number> = { attacker: 0, defender: 0 };
    const addFig = (f: Figure): Fig | null => {
      const batch = this.batches.get(f.key);
      if (!batch) return null;
      const slot = used.get(f.key) ?? 0;
      used.set(f.key, slot + 1);
      const domain = unitDomain(f.key);
      const afloat = domain === 'sea';
      // a unit crowded off the beach wades; it never stands under water
      const y0 = afloat ? -(DRAFT[f.key] ?? 0.5) : Math.max(-0.35, heightAt(f.x, f.z, terrain, this.seed));
      const tint = new THREE.Color(combatantPaint(f.power));
      const fig: Fig = {
        f, batch, slot, size: batch.model.size, domain, state: 'alive', submerged: false, aboard: false,
        at: new V3(f.x, y0, f.z), yaw: f.yaw, y0, recoil: 0, death: 0, dying: false, leave: 0, leaving: false,
        dive: 0, drop: 0, index: this.figs.length, enter: 0, enterDist: (afloat ? 70 : 38) + Math.abs(f.x) * 0.35,
        burn: 0, smokeAcc: Math.random(), damaged: false, orbit: null, fall: null, tint,
        static: !afloat && !f.air, dirty: true, rollSeed: Math.random() * 100,
      };
      if (f.air) {
        const s = f.side === 'attacker' ? -1 : 1;
        const i = airIndex[f.side]++;
        const raid = combat.kind === 'strategicRaid';
        fig.orbit = {
          cx: raid ? layout.extentX * 0.25 : s * layout.extentX * 0.22,
          cz: 0,
          rx: layout.extentX * (raid ? 0.9 : 0.72) + 14 + i * 3,
          rz: layout.extentZ * 0.55 + 10 + i * 2.5,
          alt: (terrain === 'sea' ? 20 : 15) + (f.key === 'bomber' ? 7 : 0) + (i % 3) * 2.4,
          w: (0.2 + (i % 2) * 0.035) * (s < 0 ? 1 : -1),
          phase: i * 1.37 + (s < 0 ? 0 : Math.PI),
        };
      }
      this.figs.push(fig);
      return fig;
    };
    for (const g of layout.groups) {
      const rt: GroupRt = { layout: g, figs: [], label: null, alive: g.uids.length };
      for (const f of g.figures) {
        const fig = addFig(f);
        if (fig) rt.figs.push(fig);
      }
      this.groups.set(g.id, rt);
      for (const uid of g.uids) this.groupOfUid.set(uid, rt);
      if (g.uids.length > g.figures.length && g.figures.length > 0) {
        const label = document.createElement('div');
        label.className = 'axb-tag ig-glass';
        label.style.setProperty('--seat', combatantInk(g.power));
        this.labelLayer.appendChild(label);
        rt.label = label;
      }
    }
    if (needsFactory) {
      // a raid or rocket with no factory in the battle state still needs something to aim at
      const fig = addFig({ id: 'target-factory', groupId: '', key: 'factory', side: 'defender', power: String(combat.battle.defender[0]?.power ?? ''), x: layout.extentX * 0.45 + 10, z: -4, yaw: -Math.PI / 2, air: false, offshore: false });
      if (fig) fig.tint.set(0xd8d8d8);
    }

    // one flag per side: behind the line on land, over the lead ship at sea
    for (const side of ['attacker', 'defender'] as Side[]) {
      const power = side === 'attacker' ? combat.attacker : (combat.battle.defender.find((u) => u.hp > 0) ?? combat.battle.defender[0])?.power;
      if (!power) continue;
      const s = side === 'attacker' ? -1 : 1;
      const flag = buildFlag(String(power), terrain === 'sea' ? 15 : 12);
      let follow: Fig | null = null;
      if (terrain === 'sea') {
        follow = this.figs.find((f) => f.f.side === side && f.domain === 'sea' && f.f.key !== 'submarine') ?? null;
        if (!follow) { disposeObject(flag.group); continue; }
      } else {
        const lineX = Math.min(layout.extentX - 2, Math.max(16, ...this.figs.filter((f) => f.f.side === side && !f.f.air && !f.f.offshore).map((f) => Math.abs(f.f.x) + 5)));
        const x = terrain === 'shore' && side === 'attacker' ? Math.max(SHORE_X + 3, -lineX) : s * lineX;
        const z = -layout.extentZ * 0.72;
        flag.group.position.set(x, heightAt(x, z, terrain, this.seed), z);
      }
      this.set.add(flag.group);
      this.flags.push({ flag, follow });
    }

    if (terrain !== 'sea' && this.figs.length > 0) {
      const bg = new THREE.PlaneGeometry(1, 1);
      bg.rotateX(-Math.PI / 2);
      const blobs = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), this.figs.length);
      blobs.frustumCulled = false;
      blobs.renderOrder = 2;
      blobs.userData.sharedMaps = true;
      blobs.visible = !this.renderer.shadowMap.enabled;
      this.set.add(blobs);
      this.blobs = blobs;
    }
    for (const p of [this.smoke, this.glow]) p.setView(this.renderer.domElement.height, this.camera.fov, this.fogColor, look.fogDensity);
    this.sync(combat);
    this.rig.cut(this.shot('wide'));
    this.rig.auto = (t) => this.shot('wide', t);
    this.ready = true;
    return true;
  }

  private seedFor(combat: Combat): number {
    let h = combat.id * 7919;
    for (let i = 0; i < combat.space.length; i++) h = Math.imul(h ^ combat.space.charCodeAt(i), 16777619);
    return ((h >>> 0) % 9973) + 1;
  }

  private clearBattle() {
    this.tw.flush();
    for (const g of this.groups.values()) g.label?.remove();
    this.groups.clear();
    this.groupOfUid.clear();
    this.figs = [];
    this.projectiles = [];
    this.wrecks = 0;
    this.scorchN = 0;
    this.scorch.count = 0;
    this.pending = { attacker: 0, defender: 0 };
    for (const batch of this.batches.values()) for (const mesh of batch.meshes) { this.army.remove(mesh); mesh.dispose(); }
    this.batches.clear();
    for (const child of [...this.set.children]) { this.set.remove(child); disposeObject(child); }
    this.flags = [];
    this.water = null;
    this.blobs = null;
    this.smoke.clear();
    this.glow.clear();
    for (const b of this.booms) { b.active = false; b.sprite.visible = false; }
  }

  // ---------- truth ----------

  /** Snap every figure to the engine's current state. No animation; idempotent. */
  sync(combat: Combat) {
    const byUid = new Map([...combat.battle.attacker, ...combat.battle.defender].map((u) => [u.uid, u]));
    const retreated = combat.battle.status === 'retreated';
    for (const g of this.groups.values()) {
      const truth = truthFor(g.layout.uids, byUid, retreated && g.layout.side === 'attacker');
      g.alive = truth.alive;
      const want = figureCounts(g.figs.length, truth);
      // order of preference when thinning: already-dead stay dead, then the rear ranks go first for
      // withdrawals, and living figures fill from the front
      // a figure still playing its death counts as dead, so a sinking ship is not snapped under
      const dead = g.figs.filter((f) => f.state === 'dead' || f.dying);
      const others = g.figs.filter((f) => f.state !== 'dead' && !f.dying);
      let needDead = want.dead - dead.length;
      const living: Fig[] = [];
      for (const f of others) {
        if (needDead > 0 && f.state === 'alive') { this.wreckNow(f); needDead -= 1; } else living.push(f);
      }
      // too many wrecks (state moved backwards): stand some back up
      for (let i = 0; needDead < 0 && i < dead.length; i++) { this.revive(dead[i]); living.push(dead[i]); needDead += 1; }
      let gone = want.gone;
      for (let i = living.length - 1; i >= 0; i--) {
        const f = living[i];
        const shouldGo = gone > 0;
        if (shouldGo) gone -= 1;
        if (shouldGo && f.state !== 'gone') { f.state = 'gone'; f.leave = 1; f.leaving = false; f.dirty = true; }
        if (!shouldGo && f.state === 'gone') this.revive(f);
      }
      const present = living.filter((f) => f.state === 'alive');
      present.forEach((f, i) => {
        const sub = i >= present.length - want.submerged;
        const ab = !sub && i >= present.length - want.submerged - want.aboard;
        if (f.submerged !== sub) { f.submerged = sub; f.dive = sub ? 1 : 0; f.dirty = true; }
        if (f.aboard !== ab) { f.aboard = ab; f.drop = ab ? 1 : 0; f.dirty = true; }
      });
      this.label(g);
    }
  }

  private label(g: GroupRt) {
    if (!g.label) return;
    g.label.textContent = `${g.alive} ${plural(g.layout.key, g.alive)}`;
    g.label.dataset.empty = g.alive === 0 ? '1' : '0';
  }

  private wreckNow(f: Fig) {
    f.state = 'dead';
    f.death = 1;
    f.dying = false;
    f.fall = null;
    f.submerged = false;
    f.aboard = false;
    f.burn = f.domain === 'air' && this.terrain === 'sea' ? 0 : 0.35;
    f.dirty = true;
    this.wrecks += 1;
  }
  private revive(f: Fig) {
    if (f.state === 'dead') this.wrecks = Math.max(0, this.wrecks - 1);
    f.state = 'alive';
    f.death = 0; f.dying = false; f.leave = 0; f.leaving = false; f.burn = 0; f.fall = null; f.damaged = false;
    f.dirty = true;
  }

  /** Hits that are rolled but not yet taken: the side under fire smoulders until the casualties land. */
  setPending(side: Side, hits: number) {
    this.pending[side] = hits;
  }

  // ---------- camera ----------

  /** A camera standing `dist` out from a point at a compass angle (0 looks straight across the field from the near side). */
  private orbitShot(az: number, dist: number, height: number, look: Vec, fov = 34): Shot {
    return { pos: new V3(look.x + Math.sin(az) * dist, height, look.z + Math.cos(az) * dist), look, fov };
  }

  private shot(name: 'wide' | 'open' | 'attacker' | 'defender' | 'hit-attacker' | 'hit-defender' | 'result', t = 0): Shot {
    const ex = this.layout?.extentX ?? 45;
    const ez = this.layout?.extentZ ?? 30;
    // ships are big and stand far apart: every shot backs off and climbs
    const m = this.terrain === 'sea' ? 1.3 : 1;
    const narrow = Math.max(1, 1.5 / Math.max(0.7, this.camera.aspect));
    const reach = (ex + ez * 0.35) * narrow;
    switch (name) {
      case 'open': return this.orbitShot(-1.2, (reach * 1.5 + 44) * m, (reach * 0.62 + 18) * m, new V3(0, 2, 0), 36);
      // over one side's shoulders toward the enemy: its guns fire in the foreground, the shells land beyond
      case 'attacker': return this.orbitShot(-1.02, (ex * 0.78 + 26) * m * narrow, (6.5 + ex * 0.08) * m, new V3(ex * 0.18, 2.4, -ez * 0.08), 34);
      case 'defender': return this.orbitShot(1.02, (ex * 0.78 + 26) * m * narrow, (6.5 + ex * 0.08) * m, new V3(-ex * 0.18, 2.4, -ez * 0.08), 34);
      // close on the side taking the hits
      case 'hit-attacker': return this.orbitShot(0.46, (ex * 0.42 + 24) * m * narrow, (7 + ex * 0.06) * m, new V3(-ex * 0.42, 1.8, -ez * 0.05), 31);
      case 'hit-defender': return this.orbitShot(-0.46, (ex * 0.42 + 24) * m * narrow, (7 + ex * 0.06) * m, new V3(ex * 0.42, 1.8, -ez * 0.05), 31);
      case 'result': return this.orbitShot(0, (reach * 1.12 + 34) * m, (reach * 0.5 + 14) * m, new V3(0, 1, -ez * 0.1), 36);
      default: {
        // between beats the camera walks slowly along the near side of the field, low enough that
        // the nearer army stands tall against the far one
        const az = Math.sin(t * 0.05 - 1.1) * 0.92;
        const side = Math.abs(az) / 0.92;
        return this.orbitShot(az, (reach * (0.92 - side * 0.14) + 28) * m, (reach * 0.14 + 8.5) * m + Math.sin(t * 0.04) * 1.1, new V3(-Math.sin(az) * ex * 0.14, 2.2, -ez * 0.1), 34);
      }
    }
  }

  // ---------- beats ----------

  /** Establishing sweep. */
  async playOpen(): Promise<void> {
    if (!this.ready) return;
    // the attackers come onto the field while the camera comes down to it
    const movers = this.figs.filter((f) => f.f.side === 'attacker' && !f.orbit && !f.f.offshore && f.state === 'alive' && !f.aboard);
    for (const f of movers) { f.enter = 1; f.static = false; }
    this.rig.cut(this.shot('open'));
    const advance = this.tw.run(3.6, (k) => { for (const f of movers) f.enter = 1 - k; }, ease.out);
    await Promise.all([this.rig.to(this.shot('wide'), 3.9, ease.inOut), advance]);
    for (const f of movers) { f.enter = 0; f.dirty = true; }
  }

  async playVolley(beat: VolleyBeat): Promise<void> {
    if (!this.ready) return;
    const kind = beat.volley.kind;
    const shooters: Fig[] = [];
    const seen = new Set<GroupRt>();
    for (const uid of beat.firing) {
      const g = this.groupOfUid.get(uid);
      if (!g || seen.has(g)) continue;
      seen.add(g);
      for (const f of g.figs) if (f.state === 'alive' && !f.submerged && !f.aboard) shooters.push(f);
    }
    const focus: Side = beat.firingSide === 'both' ? 'attacker' : beat.firingSide;
    void this.rig.to(this.shot(beat.firingSide === 'both' ? 'wide' : focus), 0.85);
    if (shooters.length === 0) { await this.tw.wait(0.7); return; }

    const span = Math.min(1.15, 0.2 + shooters.length * 0.045);
    const sounds = new Map<BattleSoundName, number>();
    shooters.forEach((f, i) => {
      const delay = (i / shooters.length) * span + Math.random() * 0.07;
      void this.tw.wait(delay).then(() => this.fire(f, kind, beat));
      const name: BattleSoundName = kind === 'rocket_damage' ? 'artillery-fire' : fireSoundFor(f.f.key);
      sounds.set(name, (sounds.get(name) ?? 0) + 1);
    });
    for (const [name, n] of sounds) {
      this.sound.play(name, { delay: 0.05 });
      if (n > 2) this.sound.play(name, { delay: 0.34, volume: 0.8 });
      if (n > 6) this.sound.play(name, { delay: 0.7, volume: 0.7 });
    }
    const flight = kind === 'rocket_damage' ? 2.3 : kind === 'raid_damage' ? 1.5 : kind === 'bombardment' ? 1.4 : 0.95;
    await this.tw.wait(span + flight);
  }

  async playCasualties(beat: Extract<Beat, { type: 'casualties' }>): Promise<void> {
    if (!this.ready) return;
    const total = beat.destroyed.length + beat.damaged.length;
    if (total === 0) return;
    void this.rig.to(this.shot(beat.side === 'attacker' ? 'hit-attacker' : 'hit-defender'), 0.7);
    const step = Math.min(0.26, 1.9 / total);
    let i = 0;
    for (const uid of beat.destroyed) {
      const g = this.groupOfUid.get(uid);
      if (!g) continue;
      g.alive = Math.max(0, g.alive - 1);
      const delay = 0.25 + i++ * step;
      void this.tw.wait(delay).then(() => this.loseOne(g));
    }
    for (const uid of beat.damaged) {
      const g = this.groupOfUid.get(uid);
      const f = g?.figs.find((x) => x.state === 'alive' && !x.damaged) ?? g?.figs.find((x) => x.state === 'alive');
      if (!f) continue;
      const delay = 0.25 + i++ * step;
      void this.tw.wait(delay).then(() => {
        f.damaged = true;
        this.burst(f.at.clone().setY(f.at.y + f.size.y * 0.5), Math.max(3, f.size.z * 0.22), f.domain === 'sea');
      });
    }
    this.pending[beat.side] = 0;
    await this.tw.wait(0.25 + total * step + 1.25);
  }

  /** One unit of this group has fallen. Kill a figure if the group now shows too many. */
  private loseOne(g: GroupRt) {
    this.label(g);
    const standing = g.figs.filter((f) => f.state === 'alive' && !f.dying);
    if (standing.length === 0) return;
    const total = g.layout.uids.length;
    const want = figureCounts(g.figs.length, { total, alive: g.alive, submerged: 0, aboard: 0, withdrawn: 0 }).live;
    // prefer figures the enemy can actually see: the front of the line, surfaced, landed
    const candidates = standing.filter((f) => !f.submerged && !f.aboard);
    const victim = (candidates.length ? candidates : standing)[Math.floor(Math.random() * Math.min(candidates.length || standing.length, 5))];
    if (standing.length > want) this.kill(victim);
    else this.burst(victim.at.clone().setY(victim.at.y + victim.size.y * 0.4), Math.max(2.4, victim.size.z * 0.35), victim.domain === 'sea');
  }

  private kill(f: Fig) {
    if (f.state !== 'alive' || f.dying) return;
    f.dying = true;
    f.static = false;
    f.submerged = false;
    f.dive = 0;
    const big = Math.max(f.size.x, f.size.y, f.size.z);
    if (f.orbit) {
      // shot down: fall away trailing smoke, then hit the ground or the sea
      const to = f.at.clone();
      to.x += Math.sin(f.yaw) * 26;
      to.z += Math.cos(f.yaw) * 26;
      to.y = this.terrain === 'sea' || (this.terrain === 'shore' && to.x < SHORE_X) ? 0 : heightAt(to.x, to.z, this.terrain, this.seed);
      f.fall = { from: f.at.clone(), to, t: 0 };
      f.burn = 1;
      this.burst(f.at.clone(), 5, false, 0.4);
      return;
    }
    this.burst(f.at.clone().setY(f.at.y + f.size.y * 0.45), Math.max(3.2, big * 0.5), f.domain === 'sea');
    f.burn = 1;
  }

  async playSubmerge(beat: Extract<Beat, { type: 'submerge' }>): Promise<void> {
    if (!this.ready) return;
    const done = new Set<GroupRt>();
    let n = 0;
    for (const uid of beat.uids) {
      const g = this.groupOfUid.get(uid);
      if (!g) continue;
      done.add(g);
      const f = g.figs.find((x) => x.state === 'alive' && !x.submerged);
      if (!f) continue;
      f.submerged = true;
      n += 1;
      void this.tw.run(1.9, (k) => { f.dive = k; }, ease.in);
      for (let i = 0; i < 14; i++) {
        this.smoke.emit({ x: f.at.x + rand(-4, 4), y: 0.3, z: f.at.z + rand(-4, 4), vy: rand(0.5, 2), life: rand(1, 2), size: rand(1.5, 3.5), grow: 1.6, r: 0.9, g: 0.95, b: 0.97, alpha: 0.5 });
      }
    }
    await this.tw.wait(n > 0 ? 2 : 0.4);
  }

  async playRetreat(beat: Extract<Beat, { type: 'retreat' }>): Promise<void> {
    if (!this.ready) return;
    const groups = new Set<GroupRt>();
    for (const uid of beat.uids) { const g = this.groupOfUid.get(uid); if (g) groups.add(g); }
    const leaving: Fig[] = [];
    for (const g of groups) {
      // a partial withdrawal takes the rear of the group first, to match sync()
      const alive = g.figs.filter((f) => f.state === 'alive');
      const share = beat.partial ? Math.max(1, Math.round((beat.uids.filter((u) => this.groupOfUid.get(u) === g).length / g.layout.uids.length) * g.figs.length)) : alive.length;
      leaving.push(...alive.slice(Math.max(0, alive.length - share)));
    }
    if (leaving.length === 0) { await this.tw.wait(0.4); return; }
    void this.rig.to(this.shot('attacker'), 0.9);
    for (const f of leaving) { f.leaving = true; f.static = false; }
    await this.tw.run(3, (k) => { for (const f of leaving) f.leave = k; }, ease.in);
    for (const f of leaving) { f.state = 'gone'; f.leaving = false; f.leave = 1; f.dirty = true; }
  }

  async playDrop(beat: Extract<Beat, { type: 'drop' }>): Promise<void> {
    if (!this.ready) return;
    const landing = this.figs.filter((f) => f.aboard && f.state === 'alive');
    if (landing.length === 0 || beat.landed.length === 0) { await this.tw.wait(0.3); return; }
    void this.rig.to(this.shot('attacker'), 0.9);
    for (const f of landing) { f.aboard = false; f.drop = 1; f.static = false; }
    await this.tw.run(2.2, (k) => { for (const f of landing) f.drop = 1 - k; }, ease.out);
    for (const f of landing) { f.drop = 0; f.static = true; f.dirty = true; }
  }

  async playResult(): Promise<void> {
    if (!this.ready) return;
    this.pending = { attacker: 0, defender: 0 };
    await this.rig.to(this.shot('result'), 1.6);
  }

  /** Finish every running animation now. Used when the tab comes back or the state jumps. */
  skip() {
    this.tw.fast = true;
    this.tw.flush();
    this.tw.fast = false;
    this.projectiles = [];
  }

  // ---------- fire ----------

  private targetFor(f: Fig, kind: string, beat: VolleyBeat): Vec {
    const enemy = other(f.f.side);
    const live = this.figs.filter((x) => x.f.side === enemy && x.state === 'alive' && !x.submerged && !x.aboard && !x.dying);
    let pool = live;
    if (kind === 'aa_fire') {
      const aimed = beat.targets.map((uid) => this.groupOfUid.get(uid)).filter(Boolean) as GroupRt[];
      const fromGroups = aimed.flatMap((g) => g.figs.filter((x) => x.state === 'alive'));
      pool = fromGroups.length ? fromGroups : live.filter((x) => x.orbit);
    } else if (kind === 'raid_damage' || kind === 'rocket_damage') {
      const factory = this.figs.find((x) => x.f.key === 'factory');
      if (factory) return factory.at.clone().add(new V3(rand(-5, 5), 3, rand(-3, 3)));
    } else if (kind === 'sub_strike' || f.f.key === 'submarine') pool = live.filter((x) => x.domain === 'sea');
    else if (kind === 'bombardment') pool = live.filter((x) => x.domain !== 'sea' && !x.orbit);
    else if (!f.orbit && f.f.key !== 'aaGun') {
      const ground = live.filter((x) => !x.orbit && !x.f.offshore);
      if (ground.length) pool = ground;
    }
    const t = pick(pool);
    if (t) return t.at.clone().add(new V3(rand(-2, 2), t.orbit ? 0 : t.size.y * 0.4, rand(-2, 2)));
    const s = enemy === 'attacker' ? -1 : 1;
    const ex = this.layout?.extentX ?? 40;
    const x = s * rand(12, ex * 0.7), z = rand(-20, 20);
    return new V3(x, Math.max(0, heightAt(x, z, this.terrain, this.seed)) + 1, z);
  }

  private muzzle(f: Fig): Vec {
    const fwd = f.size.z * 0.48;
    const h = f.orbit ? 0 : f.f.key === 'infantry' ? f.size.y * 0.72 : f.f.key === 'aaGun' ? f.size.y * 0.9 : f.size.y * 0.62;
    return new V3(f.at.x + Math.sin(f.yaw) * fwd, f.at.y + h, f.at.z + Math.cos(f.yaw) * fwd);
  }

  private fire(f: Fig, kind: string, beat: VolleyBeat) {
    if (this.disposed || f.state !== 'alive' || this.tw.fast) return;
    const key = f.f.key;
    const from = this.muzzle(f);
    const to = this.targetFor(f, kind, beat);
    const dist = from.distanceTo(to);
    const water = this.terrain === 'sea' || (this.terrain === 'shore' && to.x < SHORE_X);
    f.recoil = 1;
    if (f.static) { f.static = false; }
    const flash = (size: number) => {
      this.glow.emit({ x: from.x, y: from.y, z: from.z, life: 0.12, size, r: 1, g: 0.82, b: 0.45, alpha: 1 });
      this.glow.emit({ x: from.x, y: from.y, z: from.z, life: 0.22, size: size * 1.8, r: 1, g: 0.5, b: 0.15, alpha: 0.45 });
    };
    const puff = (size: number, n: number) => {
      for (let i = 0; i < n; i++) {
        this.smoke.emit({ x: from.x, y: from.y, z: from.z, vx: Math.sin(f.yaw) * rand(1, 5) + rand(-1, 1), vy: rand(0.4, 1.8), vz: Math.cos(f.yaw) * rand(1, 5) + rand(-1, 1), life: rand(0.9, 1.8), size: size * rand(0.7, 1.3), grow: 2.4, r: 0.78, g: 0.76, b: 0.72, alpha: 0.35, drag: 0.25 });
      }
    };
    const shoot = (p: Partial<Projectile> & Pick<Projectile, 'kind' | 'dur'>) =>
      this.projectiles.push({ from: from.clone(), to: to.clone(), t: 0, arc: 0, impact: 1.6, water, trail: 0, ...p });

    if (kind === 'rocket_damage') {
      flash(6); puff(4, 12);
      shoot({ kind: 'rocket', dur: 2.1, arc: Math.max(26, dist * 0.34), impact: 11 });
      return;
    }
    if (kind === 'raid_damage' || (key === 'bomber' && kind !== 'aa_fire')) {
      for (let i = 0; i < 3; i++) {
        this.projectiles.push({ from: f.at.clone().add(new V3(rand(-1, 1), -0.6, rand(-1, 1))), to: to.clone().add(new V3(rand(-6, 6), 0, rand(-5, 5))), t: -i * 0.14, dur: 1.15, arc: 0, kind: 'bomb', impact: kind === 'raid_damage' ? 7 : 4.2, water, trail: 0 });
      }
      return;
    }
    if (kind === 'aa_fire' || key === 'aaGun') {
      flash(2.4);
      for (let i = 0; i < 6; i++) this.projectiles.push({ from: from.clone(), to: to.clone().add(new V3(rand(-4, 4), rand(-3, 3), rand(-4, 4))), t: -i * 0.07, dur: 0.42, arc: 0, kind: 'bullet', impact: 0, water: false, trail: 0 });
      void this.tw.wait(0.45).then(() => {
        for (let i = 0; i < 4; i++) {
          const p = to.clone().add(new V3(rand(-6, 6), rand(-3, 3), rand(-6, 6)));
          this.smoke.emit({ x: p.x, y: p.y, z: p.z, life: rand(1.6, 2.6), size: rand(2.2, 3.6), grow: 1.8, r: 0.12, g: 0.12, b: 0.13, alpha: 0.7 });
          this.glow.emit({ x: p.x, y: p.y, z: p.z, life: 0.14, size: 3.2, r: 1, g: 0.75, b: 0.4 });
        }
      });
      return;
    }
    if (key === 'submarine') {
      shoot({ kind: 'torpedo', dur: Math.min(2, 0.7 + dist / 60), impact: 6 });
      return;
    }
    if (key === 'infantry') {
      flash(0.9);
      for (let i = 0; i < 2; i++) this.projectiles.push({ from: from.clone(), to: to.clone().add(new V3(rand(-1.5, 1.5), rand(-0.6, 0.6), rand(-1.5, 1.5))), t: -i * 0.09, dur: Math.max(0.16, dist / 190), arc: 0, kind: 'bullet', impact: 0.6, water, trail: 0 });
      return;
    }
    if (key === 'fighter') {
      flash(1.2);
      for (let i = 0; i < 5; i++) this.projectiles.push({ from: from.clone(), to: to.clone().add(new V3(rand(-3, 3), 0, rand(-3, 3))), t: -i * 0.06, dur: Math.max(0.2, dist / 170), arc: 0, kind: 'bullet', impact: 0.9, water, trail: 0 });
      return;
    }
    const naval = f.domain === 'sea';
    if (naval) {
      flash(key === 'battleship' ? 7 : 4.5); puff(key === 'battleship' ? 5 : 3.2, 9);
      shoot({ kind: 'shell', dur: kind === 'bombardment' ? 1.25 : Math.min(1.1, 0.5 + dist / 150), arc: dist * (kind === 'bombardment' ? 0.2 : 0.07), impact: key === 'battleship' ? 6.5 : 4.5 });
      return;
    }
    if (key === 'artillery') {
      flash(3.6); puff(2.6, 7);
      shoot({ kind: 'shell', dur: 0.85, arc: dist * 0.16, impact: 4.2 });
      return;
    }
    flash(3); puff(2, 5); // tank and anything else that carries a gun
    shoot({ kind: 'shell', dur: Math.max(0.24, dist / 150), arc: dist * 0.02, impact: 3.2 });
  }

  /** Explosion: sprite, flash, sparks, smoke or a column of water. */
  private burst(at: Vec, scale: number, water: boolean, shake = 1) {
    if (this.disposed || this.tw.fast) return;
    const boom = this.booms.find((b) => !b.active);
    if (boom && !water) {
      boom.active = true;
      boom.t = 0;
      boom.sprite.position.copy(at).setY(at.y + scale * 0.35);
      boom.sprite.scale.setScalar(scale * 2.4);
      boom.sprite.visible = true;
    }
    this.glow.emit({ x: at.x, y: at.y + scale * 0.2, z: at.z, life: 0.2, size: scale * 3.4, r: 1, g: 0.78, b: 0.42, alpha: water ? 0.5 : 1 });
    const n = Math.round(Math.min(18, 6 + scale * 2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(2, 7) * Math.sqrt(scale);
      if (water) {
        this.smoke.emit({ x: at.x + rand(-1, 1) * scale * 0.2, y: 0.2, z: at.z + rand(-1, 1) * scale * 0.2, vx: Math.cos(a) * sp * 0.25, vy: rand(6, 13) * Math.sqrt(scale * 0.5), vz: Math.sin(a) * sp * 0.25, life: rand(1, 1.9), size: scale * rand(0.5, 1), grow: 1.8, r: 0.92, g: 0.96, b: 0.98, alpha: 0.75, gravity: 11 });
      } else {
        this.glow.emit({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * sp, vy: rand(3, 10), vz: Math.sin(a) * sp, life: rand(0.4, 0.9), size: rand(0.3, 0.7), r: 1, g: 0.6, b: 0.2, gravity: 14, drag: 0.5 });
        const grey = rand(0.2, 0.36);
        this.smoke.emit({ x: at.x + rand(-1, 1) * scale * 0.3, y: at.y + rand(0, scale * 0.4), z: at.z + rand(-1, 1) * scale * 0.3, vx: Math.cos(a) * sp * 0.3 + 0.8, vy: rand(1.2, 3.8), vz: Math.sin(a) * sp * 0.3, life: rand(2, 4.2), size: scale * rand(0.7, 1.3), grow: 3, r: grey * 1.06, g: grey, b: grey * 0.93, alpha: 0.5, drag: 0.4 });
      }
    }
    if (!water && this.terrain !== 'sea' && scale >= 2.4) {
      const gy = heightAt(at.x, at.z, this.terrain, this.seed);
      if (gy > 0.15 && at.y - gy < 4.5) this.addScorch(at.x, gy, at.z, scale * rand(1.5, 2.3));
    }
    this.rig.shake = Math.min(1.6, this.rig.shake + scale * 0.07 * shake);
    if (scale >= 2.6) this.sound.boom(Math.min(2, scale / 5));
  }

  private addScorch(x: number, y: number, z: number, size: number) {
    const i = this.scorchN % SCORCH_MAX;
    this.scorchN += 1;
    this.e.set(0, Math.random() * Math.PI * 2, 0);
    this.q.setFromEuler(this.e);
    this.m4.compose(this.p3.set(x, y + 0.07, z), this.q, this.s3.set(size, 1, size));
    this.scorch.setMatrixAt(i, this.m4);
    this.scorch.count = Math.min(SCORCH_MAX, this.scorchN);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  private impact(p: Projectile) {
    if (p.impact <= 0) return;
    if (p.impact >= 2.4) { this.burst(p.to, p.impact, p.water); return; }
    // small arms: a spit of dust or spray
    for (let i = 0; i < 3; i++) {
      const c = p.water ? [0.92, 0.96, 0.98] : [this.look.dust.r, this.look.dust.g, this.look.dust.b];
      this.smoke.emit({ x: p.to.x, y: Math.max(0.1, p.to.y - 0.6), z: p.to.z, vx: rand(-1, 1), vy: rand(1.5, 4), vz: rand(-1, 1), life: rand(0.5, 1), size: p.impact * rand(0.8, 1.4), grow: 2.2, r: c[0], g: c[1], b: c[2], alpha: 0.5, gravity: 4 });
    }
  }

  // ---------- frame ----------

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    // Cap the drawing buffer by pixel count, not just by ratio: a 4K TV at ratio 1 is four times
    // the fill of 1080p, which an integrated GPU cannot shade at 60 frames a second.
    const budget = [2.4e6, 1.7e6, 1.7e6, 1.15e6][this.quality];
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(budget / (w * h)));
    this.renderer.setPixelRatio(Math.max(0.4, ratio));
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(Math.max(0.4, ratio));
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.FogExp2;
    for (const p of [this.smoke, this.glow]) p.setView(this.renderer.domElement.height, this.camera.fov, this.fogColor, fog.density);
  }

  private pose(f: Fig, dt: number, t: number) {
    let x = f.f.x, y = f.y0, z = f.f.z, yaw = f.yaw, pitch = 0, roll = 0, scale = 1;
    const wreck = f.death;
    if (f.orbit && !f.fall && f.state === 'alive') {
      const o = f.orbit;
      const th = o.phase + t * o.w;
      x = o.cx + Math.cos(th) * o.rx;
      z = o.cz + Math.sin(th) * o.rz;
      y = o.alt + Math.sin(th * 2 + o.phase) * 1.4;
      const vx = -Math.sin(th) * o.rx * o.w, vz = Math.cos(th) * o.rz * o.w;
      yaw = Math.atan2(vx, vz);
      roll = -Math.sign(o.w) * 0.42;
      f.yaw = yaw;
    } else if (f.fall) {
      f.fall.t = Math.min(1, f.fall.t + dt / 1.9);
      const k = f.fall.t;
      x = lerp(f.fall.from.x, f.fall.to.x, k);
      z = lerp(f.fall.from.z, f.fall.to.z, k);
      y = lerp(f.fall.from.y, f.fall.to.y, k * k);
      pitch = k * 0.9;
      roll = k * 5 + f.rollSeed;
      if (k >= 1) {
        const sea = this.terrain === 'sea' || (this.terrain === 'shore' && x < SHORE_X);
        this.burst(new V3(x, y, z), 5.5, sea);
        f.fall = null;
        f.dying = false;
        f.state = 'dead';
        f.death = 1;
        f.y0 = y;
        f.f = { ...f.f, x, z };
        f.burn = sea ? 0 : 1;
        this.wrecks += 1;
        if (sea) scale = 0.0001;
      }
    } else if (f.domain === 'sea') {
      y = f.y0 + waveHeight(x, z, t, this.calm) * 0.7;
      roll = Math.sin(t * 0.7 + f.rollSeed) * 0.035 * this.calm + wreck * 0.5;
      pitch = Math.sin(t * 0.52 + f.rollSeed * 1.7) * 0.022 * this.calm + wreck * 0.12;
      y -= wreck * f.size.y * 0.42 + f.dive * (f.size.y * 1.4 + 2);
      if (f.dive >= 0.999) scale = 0.0001;
    } else if (f.domain === 'air') {
      // a wrecked aircraft on the ground
      roll = 0.5; pitch = 0.2;
      if (this.terrain === 'sea') scale = 0.0001;
    } else if (wreck > 0) {
      if (f.f.key === 'infantry') { pitch = -wreck * 1.45; y += wreck * 0.12; }
      else { roll = wreck * 0.09 * (f.rollSeed > 50 ? 1 : -1); pitch = wreck * 0.05; y -= wreck * 0.12; }
    }
    if (f.recoil > 0) {
      const back = f.recoil * f.recoil * Math.min(1.1, f.size.z * 0.1);
      x -= Math.sin(yaw) * back;
      z -= Math.cos(yaw) * back;
      if (f.domain !== 'air') pitch -= f.recoil * 0.035;
      f.recoil = Math.max(0, f.recoil - dt * 3.2);
    }
    if (f.leave > 0) {
      // turn about and pull back out of the fight
      const s = f.f.side === 'attacker' ? -1 : 1;
      yaw += Math.min(1, f.leave * 4) * Math.PI;
      x += s * f.leave * 70;
      if (f.leave > 0.8) scale = Math.max(0.0001, 1 - (f.leave - 0.8) * 5);
    }
    if (f.enter > 0) {
      x += (f.f.side === 'attacker' ? -1 : 1) * f.enter * f.enterDist;
      if (f.domain !== 'sea') y = Math.max(-0.35, heightAt(x, z, this.terrain, this.seed));
    }
    if (f.drop > 0) {
      y += f.drop * 34;
      if (f.aboard || f.drop > 0.97) scale = 0.0001;
    }
    if (f.aboard || f.state === 'gone') scale = 0.0001;
    if (f.dying && !f.fall) {
      f.death = Math.min(1, f.death + dt / (f.domain === 'sea' ? 5.5 : 0.9));
      if (f.death >= 1) { f.dying = false; f.state = 'dead'; this.wrecks += 1; }
    }
    f.at.set(x, y, z);
    if (this.blobs?.visible) {
      const air = f.domain === 'air' && f.state === 'alive';
      const gone = scale < 0.01 || f.domain === 'sea';
      const gy = gone ? 0 : Math.max(0, heightAt(x, z, this.terrain, this.seed));
      const k = gone ? 0 : air ? 0.55 : 1;
      this.e.set(0, yaw, 0);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.p3.set(x, gy + 0.06, z), this.q, this.s3.set(Math.max(1.6, f.size.x * 1.5) * k, 1, Math.max(1.6, f.size.z * 1.25) * k));
      this.blobs.setMatrixAt(f.index, this.m4);
      this.blobs.instanceMatrix.needsUpdate = true;
    }
    this.e.set(pitch, yaw, roll);
    this.q.setFromEuler(this.e);
    this.m4.compose(this.p3.set(x, y, z), this.q, this.s3.setScalar(scale));
    f.batch.setMatrix(f.slot, this.m4);
    const burnt = f.state === 'dead' || f.dying ? Math.max(f.death, f.fall ? 0.6 : 0) : f.damaged ? 0.3 : 0;
    f.batch.setColor(f.slot, TMP_COLOR.copy(f.tint).lerp(WRECK, burnt * 0.86));
    // settled ground units stop being recomputed until something happens to them
    if (!f.orbit && f.domain !== 'sea' && f.recoil === 0 && !f.dying && !f.leaving && f.drop === 0 && f.enter === 0) f.static = true;
    f.dirty = false;
  }

  private smokeFrom(f: Fig, dt: number) {
    if (f.f.key === 'infantry') return; // the fallen do not smoke
    const burning = f.burn > 0 || f.damaged || (f.f.key === 'factory' && f.state === 'alive');
    if (!burning || f.state === 'gone' || f.dive > 0.5) return;
    // more wrecks, thinner smoke each: the field stays readable and the particle budget holds
    const thin = Math.min(1, 9 / Math.max(1, this.wrecks));
    const rate = (f.fall ? 40 : f.f.key === 'factory' && f.state === 'alive' ? 3 : f.damaged && f.state === 'alive' ? 5 : 3 + f.burn * 9 * thin) * (f.f.key === 'infantry' ? 0.25 : 1);
    f.smokeAcc += dt * rate;
    const big = Math.max(1.2, Math.min(7, Math.max(f.size.x, f.size.z) * 0.22));
    const top = f.f.key === 'factory' && f.state === 'alive' ? f.size.y : f.size.y * 0.5;
    while (f.smokeAcc >= 1) {
      f.smokeAcc -= 1;
      const dark = f.f.key === 'factory' && f.state === 'alive' ? 0.42 : rand(0.1, 0.24);
      this.smoke.emit({ x: f.at.x + rand(-0.3, 0.3) * big, y: f.at.y + top, z: f.at.z + rand(-0.3, 0.3) * big, vx: rand(2, 4.5), vy: rand(2.2, 4.6), vz: rand(-0.8, 0.4), life: rand(2.6, 4.8), size: big * rand(0.7, 1.2), grow: 3.2, r: dark, g: dark, b: dark, alpha: f.fall ? 0.75 : 0.42, drag: 0.7 });
      if (f.burn > 0.3 && f.f.key !== 'infantry' && Math.random() < 0.8) {
        this.glow.emit({ x: f.at.x + rand(-0.25, 0.25) * big, y: f.at.y + f.size.y * 0.35, z: f.at.z + rand(-0.25, 0.25) * big, vy: rand(1.5, 3.5), life: rand(0.35, 0.7), size: big * rand(0.5, 0.9), r: 1, g: rand(0.4, 0.62), b: 0.12, alpha: 0.55 * f.burn });
      }
    }
    // fires die down to a thin smoulder but never go out
    if (f.state === 'dead' && f.burn > 0.22) f.burn = Math.max(0.22, f.burn - dt * 0.03);
  }

  private stepProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.t < 0) continue;
      const k = Math.min(1, p.t / p.dur);
      const kk = p.kind === 'bomb' ? k * k : k;
      const x = lerp(p.from.x, p.to.x, k), z = lerp(p.from.z, p.to.z, k);
      let y = lerp(p.from.y, p.to.y, kk) + Math.sin(Math.PI * k) * p.arc;
      if (p.kind === 'torpedo') y = 0.25;
      p.trail += dt;
      if (p.kind === 'bullet') {
        this.glow.emit({ x, y, z, life: 0.07, size: 0.55, r: 1, g: 0.86, b: 0.5 });
      } else if (p.kind === 'torpedo') {
        if (p.trail > 0.035) { p.trail = 0; this.smoke.emit({ x, y, z, life: 1.4, size: 1.3, grow: 2.4, r: 0.9, g: 0.96, b: 0.98, alpha: 0.55 }); }
      } else {
        this.glow.emit({ x, y, z, life: 0.09, size: p.kind === 'rocket' ? 2.6 : p.kind === 'bomb' ? 0.7 : 1.2, r: 1, g: 0.7, b: 0.35 });
        if (p.kind === 'rocket' && p.trail > 0.02) { p.trail = 0; this.smoke.emit({ x, y, z, life: 2.4, size: 1.8, grow: 3, r: 0.86, g: 0.86, b: 0.84, alpha: 0.6 }); }
        else if (p.kind === 'shell' && p.trail > 0.06) { p.trail = 0; this.smoke.emit({ x, y, z, life: 0.6, size: 0.6, grow: 2, r: 0.7, g: 0.7, b: 0.7, alpha: 0.25 }); }
      }
      if (k >= 1) {
        this.impact(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta();
    const dt = Math.min(0.1, raw);
    const t = this.clock.elapsedTime;
    this.govern(raw);
    this.tw.update(dt);
    this.rig.update(dt, t);
    if (this.water) (this.water.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

    for (const f of this.figs) {
      if (!f.static || f.dirty) this.pose(f, dt, t);
      this.smokeFrom(f, dt);
      // vehicles on the move kick up the ground behind them
      if (f.enter > 0.04 && f.enter < 0.98 && f.domain === 'land' && f.f.key !== 'infantry' && Math.random() < dt * 9) {
        this.smoke.emit({ x: f.at.x - Math.sin(f.yaw) * f.size.z * 0.4, y: f.at.y + 0.3, z: f.at.z + rand(-1, 1), vx: rand(-1, 1), vy: rand(0.6, 1.6), vz: rand(-0.6, 0.6), life: rand(1.4, 2.4), size: rand(1.6, 2.8), grow: 2.6, r: this.look.dust.r, g: this.look.dust.g, b: this.look.dust.b, alpha: 0.3, drag: 0.5 });
      }
    }
    for (const b of this.batches.values()) b.commit();
    this.stepProjectiles(dt);

    // hits waiting on a choice: the side under fire keeps taking small strikes
    this.pendingAcc += dt;
    if (this.pendingAcc > 0.55) {
      this.pendingAcc = 0;
      for (const side of ['attacker', 'defender'] as Side[]) {
        if (this.pending[side] <= 0) continue;
        const f = pick(this.figs.filter((x) => x.f.side === side && x.state === 'alive' && !x.submerged && !x.aboard && !x.f.offshore));
        if (!f) continue;
        const p = f.at.clone().add(new V3(rand(-3, 3), f.orbit ? 0 : 0.5, rand(-3, 3)));
        this.glow.emit({ x: p.x, y: p.y + 0.6, z: p.z, life: 0.16, size: 2.2, r: 1, g: 0.7, b: 0.35, alpha: 0.8 });
        this.smoke.emit({ x: p.x, y: p.y, z: p.z, vy: rand(1, 2.4), life: rand(1.2, 2), size: rand(1.2, 2.2), grow: 2.4, r: 0.3, g: 0.29, b: 0.28, alpha: 0.4 });
      }
    }
    // drifting haze over land keeps the air alive between volleys
    if (this.terrain !== 'sea' && this.layout) {
      this.ambientAcc += dt;
      if (this.ambientAcc > 0.5) {
        this.ambientAcc = 0;
        const x = rand(-1, 1) * this.layout.extentX, z = rand(-1, 1) * this.layout.extentZ;
        if (heightAt(x, z, this.terrain, this.seed) > 0.3) {
          this.smoke.emit({ x, y: heightAt(x, z, this.terrain, this.seed) + 0.6, z, vx: rand(1.5, 3), vy: 0.15, life: rand(5, 8), size: rand(5, 9), grow: 1.6, r: this.look.dust.r, g: this.look.dust.g, b: this.look.dust.b, alpha: 0.07 });
        }
      }
    }

    for (const b of this.booms) {
      if (!b.active) continue;
      b.t += dt;
      const frame = Math.floor(b.t * EXPL.fps);
      if (frame >= EXPL.frames) { b.active = false; b.sprite.visible = false; continue; }
      const map = (b.sprite.material as THREE.SpriteMaterial).map!;
      map.offset.set((frame % EXPL.cols) / EXPL.cols, 1 - (Math.floor(frame / EXPL.cols) + 1) / EXPL.rows);
    }
    for (const { flag, follow } of this.flags) {
      waveFlag(flag, t);
      if (follow) {
        flag.group.visible = follow.state !== 'gone' && follow.dive < 0.5;
        flag.group.position.set(follow.at.x, follow.at.y + follow.size.y * 0.55, follow.at.z);
      }
    }
    this.smoke.update(dt);
    this.glow.update(dt);
    this.updateLabels();
    this.composer.render(dt);
  };

  /** Watch the frame time and shed cost (resolution, then shadows) if the GPU cannot keep up. */
  private govern(dt: number) {
    if (!this.ready || this.lockQuality || this.quality >= 3 || document.hidden || dt > 0.5) return;
    this.frames += 1;
    if (dt > 1 / 42) this.slowFrames += 1;
    if (this.frames < 150) return;
    const slow = this.slowFrames / this.frames;
    this.frames = 0;
    this.slowFrames = 0;
    if (slow < 0.4) return;
    this.quality += 1;
    if (this.quality >= 2) this.bloom.enabled = false;
    if (this.quality === 2) {
      this.sun.castShadow = false;
      this.renderer.shadowMap.enabled = false;
      if (this.blobs) { this.blobs.visible = true; for (const f of this.figs) f.dirty = true; }
      this.scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) m.needsUpdate = true;
      });
    }
    this.resize();
  }

  private updateLabels() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    for (const g of this.groups.values()) {
      if (!g.label) continue;
      const lead = g.figs[0];
      const a = g.layout.anchor;
      const air = lead?.orbit != null;
      const y = air ? lead.at.y + 3 : Math.max(0, heightAt(a.x, a.z, this.terrain, this.seed)) + (DIMS[g.layout.key]?.size ?? 4) * 0.6 + 3.5;
      const p = this.p3.set(air ? lead.at.x : a.x, y, air ? lead.at.z : a.z).project(this.camera);
      const visible = p.z < 1 && Math.abs(p.x) < 1.05 && p.y > -1 && p.y < 1;
      g.label.style.opacity = visible ? '' : '0';
      if (visible) g.label.style.transform = `translate(-50%, -100%) translate(${((p.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.buildId += 1;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.tw.flush();
    this.sound.dispose();
    this.clearBattle();
    for (const b of this.booms) { this.scene.remove(b.sprite); b.sprite.material.dispose(); }
    for (const t of this.boomTex) t.dispose();
    this.smoke.dispose();
    this.glow.dispose();
    this.scene.remove(this.scorch);
    this.scorch.geometry.dispose();
    (this.scorch.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.scorch.material as THREE.Material).dispose();
    this.scorch.dispose();
    this.blobTex.dispose();
    this.composer.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.environment = null;
    this.scene.background = null;
    void releaseGpu();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleLost, false);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}

const TMP_COLOR = new THREE.Color();
