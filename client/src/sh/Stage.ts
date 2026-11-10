// The Secret Hitler table in 3D, built from the Secret Hitler Original mod's own meshes and textures.
// World units are TTS units. Table top is y = 0. +x is right, +z is toward the home camera.
// The Stage owns the scene, the camera rig and the seat labels. Cutscenes (director.ts) drive it.
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { seatHex, seatSlots, type Bracket, type Policy, type ShPublicView, type Role } from '@bge/shared';
import { Tweens, ease, lerp, type Ease } from './tween';

const V3 = THREE.Vector3;
type Vec = THREE.Vector3;

// ---------- layout (measured from the mod save and the board textures) ----------
export const TABLE_W = 117.5;
export const TABLE_D = 69.5;
// The ten printed seats, clockwise from near-centre: [x, z, inX, inZ].
const SLOT_FRAMES: [number, number, number, number][] = [
  [0, 32, 0, -1], [-29.3, 32, 0, -1], [-55, 13, 1, 0], [-55, -13, 1, 0], [-29.3, -32, 0, 1],
  [0, -32, 0, 1], [29.3, -32, 0, 1], [55, -13, -1, 0], [55, 13, -1, 0], [29.3, 32, 0, -1],
];
const LIB_Z = 6;
const FAS_Z = -5.5;
const BOARD_TOP = 0.2;
const LIB_SLOT_X = (i: number) => -7.73 + i * 3.865;
const FAS_SLOT_X = (i: number) => -9.63 + i * 3.865;
const TRACKER_X = [-4.16, -1.55, 1.03, 3.64];
const TRACKER_Z = LIB_Z + 3.37;
const DRAW = new V3(-18, 0, LIB_Z);
const DISCARD = new V3(18, 0, LIB_Z);
const CARD_T = 0.05;
const POLICY = { w: 3.11, h: 4.5 };
const BIG = { w: 4.45, h: 6.2 };

export interface Shot {
  pos: Vec;
  look: Vec;
  fov?: number;
}
export const shot = (px: number, py: number, pz: number, lx: number, ly: number, lz: number, fov?: number): Shot => ({ pos: new V3(px, py, pz), look: new V3(lx, ly, lz), fov });

export class Card {
  mesh: THREE.Mesh;
  constructor(public w: number, public h: number, face: THREE.Material, back: THREE.Material, side: THREE.Material) {
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, CARD_T, h), [side, side, face, back, side, side]);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Flip (z) first, then tilt (x), then heading (y): lets a card stand up and face any direction.
    this.mesh.rotation.order = 'YXZ';
  }
  setFace(face: THREE.Material) {
    (this.mesh.material as THREE.Material[])[2] = face;
  }
  set faceUp(up: boolean) {
    this.mesh.rotation.z = up ? 0 : Math.PI;
  }
  get faceUp() {
    return Math.abs(this.mesh.rotation.z) < 0.01;
  }
}

interface SeatRig {
  index: number;
  slot: number;
  color: string;
  anchor: Vec;
  inDir: Vec;
  right: Vec;
  rotY: number;
  standee: THREE.Group;
  glow: THREE.MeshStandardMaterial;
  envelope: THREE.Object3D;
  role: Card;
  member: Card;
  ballot: Card;
  notHitler: Card;
  label: HTMLDivElement;
  tags: string[];
  chip: { text: string; tone: string } | null;
  dead: boolean;
  bubbleTimer?: number;
}

class Rig {
  pos = new V3(0, 74, 64);
  look = new V3(0, 0, 3);
  fov = 42;
  shake = 0;
  drift = 1;
  // When set and no move is running, the camera follows this path (attract orbit).
  auto: ((t: number) => Shot) | null = null;
  // When set, the look target tracks a moving object.
  follow: (() => Vec) | null = null;
  private moving = 0;
  constructor(private cam: THREE.PerspectiveCamera, private tw: Tweens) {}

  cut(s: Shot) {
    this.pos.copy(s.pos);
    this.look.copy(s.look);
    if (s.fov) this.fov = s.fov;
  }
  to(s: Shot, seconds: number, opts: { ease?: Ease; arc?: boolean } = {}): Promise<void> {
    const p0 = this.pos.clone();
    const l0 = this.look.clone();
    const f0 = this.fov;
    const f1 = s.fov ?? this.fov;
    // Arc moves swing around the table instead of cutting across it.
    const a0 = Math.atan2(p0.x, p0.z);
    let a1 = Math.atan2(s.pos.x, s.pos.z);
    while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
    const r0 = Math.hypot(p0.x, p0.z);
    const r1 = Math.hypot(s.pos.x, s.pos.z);
    this.moving++;
    this.follow = null;
    return this.tw.run(seconds, (k) => {
      if (opts.arc) {
        const a = lerp(a0, a1, k);
        const r = lerp(r0, r1, k);
        this.pos.set(Math.sin(a) * r, lerp(p0.y, s.pos.y, k), Math.cos(a) * r);
      } else this.pos.lerpVectors(p0, s.pos, k);
      this.look.lerpVectors(l0, s.look, k);
      this.fov = lerp(f0, f1, k);
    }, opts.ease ?? ease.inOut).then(() => {
      this.moving--;
    });
  }
  update(dt: number, t: number) {
    if (this.auto && !this.moving) {
      const s = this.auto(t);
      const k = 1 - Math.exp(-dt * 1.5);
      this.pos.lerp(s.pos, k);
      this.look.lerp(s.look, k);
      if (s.fov) this.fov = lerp(this.fov, s.fov, k);
    }
    if (this.follow) this.look.lerp(this.follow(), 1 - Math.exp(-dt * 6));
    const d = this.pos.distanceTo(this.look) * 0.006 * this.drift;
    const cam = this.cam;
    cam.position.set(
      this.pos.x + Math.sin(t * 0.23) * d + (Math.random() - 0.5) * this.shake,
      this.pos.y + Math.sin(t * 0.31 + 1.3) * d * 0.6 + (Math.random() - 0.5) * this.shake,
      this.pos.z + Math.cos(t * 0.19 + 0.4) * d + (Math.random() - 0.5) * this.shake,
    );
    this.shake *= Math.exp(-dt * 7);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(this.look.x, this.look.y, this.look.z);
  }
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.9 }, tint: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float vignette; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(q * vec2(1.0, 0.85)) );
      c.rgb *= mix(1.0, v, vignette);
      c.rgb *= tint;
      c.rgb += (hash(vUv * 900.0) - 0.5) * 0.035;
      gl_FragColor = c;
    }`,
};

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 900);
  tw = new Tweens();
  rig: Rig;
  seats: SeatRig[] = [];
  // Policy card pools. Index 0 of deck is the bottom card.
  deck: Card[] = [];
  discard: Card[] = [];
  hand: Card[] = [];
  lib: Card[] = [];
  fas: Card[] = [];
  presPlacard!: THREE.Object3D;
  chanPlacard!: THREE.Object3D;
  prevPres!: THREE.Object3D;
  prevChan!: THREE.Object3D;
  tracker!: THREE.Object3D;
  ballotBox!: THREE.Object3D;
  spot!: THREE.SpotLight;
  loaded = false;
  labelsVisible = true;
  view: ShPublicView | null = null;

  private composer: EffectComposer;
  private grade: ShaderPass;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private tex: Record<string, THREE.Texture> = {};
  private mats: Record<string, THREE.Material> = {};
  private obj: Record<string, THREE.Group> = {};
  private fasTrack!: THREE.Object3D;
  private fasTrackMat!: THREE.MeshStandardMaterial;
  private boxMat!: THREE.MeshStandardMaterial;
  private banners: THREE.Object3D[] = [];
  private bannerMat!: THREE.MeshBasicMaterial;
  private key!: THREE.SpotLight;
  private amb!: THREE.AmbientLight;
  private libLight!: THREE.PointLight;
  private fasLight!: THREE.PointLight;
  private flash!: THREE.PointLight;
  private seatGroup = new THREE.Group();
  private builtFor = '';
  private tension = 0;
  private disposed = false;

  constructor(private container: HTMLElement, private labelLayer: HTMLElement) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.2;
    container.appendChild(r.domElement);
    r.domElement.style.cssText = 'width:100%;height:100%;display:block';
    this.scene.background = new THREE.Color(0x040507);
    this.scene.fog = new THREE.FogExp2(0x040507, 0.0034);
    this.rig = new Rig(this.camera, this.tw);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.34, 0.7, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.scene.add(this.seatGroup);
    this.loop();
  }

  // ---------- loading ----------
  async load(onProgress?: (k: number) => void) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_u, done, total) => onProgress?.(done / total);
    const tl = new THREE.TextureLoader(manager);
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    const T = (name: string, file: string) =>
      new Promise<void>((res, rej) => {
        tl.load(`/sh/${file}`, (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = aniso;
          this.tex[name] = t;
          res();
        }, undefined, () => rej(new Error(`texture ${file}`)));
      });
    const objLoader = new OBJLoader(manager);
    const O = (name: string) =>
      new Promise<void>((res, rej) => {
        objLoader.load(`/sh/${name}.obj`, (g) => {
          this.obj[name] = g;
          res();
        }, undefined, () => rej(new Error(`mesh ${name}`)));
      });
    const cards = ['policy-liberal.png', 'policy-fascist.png', 'policy-back.png', 'ballot-ja.png', 'ballot-nein.png', 'ballot-back.png',
      'membership-liberal.png', 'membership-fascist.png', 'membership-back.png', 'nothitler.png', 'nothitler-back.png', 'role-back.jpg',
      'role-hitler.jpg', 'role-fascist-1.jpg', 'role-fascist-2.jpg', 'role-fascist-3.jpg',
      ...[1, 2, 3, 4, 5, 6].map((i) => `role-liberal-${i}.jpg`)];
    await Promise.all([
      T('table', 'table.jpg'), T('liberal', 'liberal-track.png'),
      T('fascist-56', 'fascist-track-56.png'), T('fascist-78', 'fascist-track-78.png'), T('fascist-910', 'fascist-track-910.png'),
      T('draw', 'draw-pile.png'), T('discard', 'discard-pile.png'),
      T('placard-president', 'placard-president.jpg'), T('placard-chancellor', 'placard-chancellor.jpg'),
      T('prev-president', 'prev-president.jpg'), T('prev-chancellor', 'prev-chancellor.jpg'),
      T('envelope', 'envelope.jpg'), T('banner', 'banner.jpg'),
      ...[5, 6, 7, 8, 9, 10].map((n) => T(`box-${n}`, `ballot-box-${n}.jpg`)),
      ...cards.map((f) => T(f.replace(/\.(png|jpg)$/, ''), `cards/${f}`)),
      ...['track', 'pile', 'placard-president', 'placard-chancellor', 'shim', 'tracker', 'ballot-box', 'envelope', 'banner'].map(O),
      document.fonts?.load('800 200px "Inter Variable"').catch(() => undefined),
    ]);
    if (this.disposed) return;
    this.build();
    this.loaded = true;
  }

  private std(map: THREE.Texture | null, opts: THREE.MeshStandardMaterialParameters = {}) {
    return new THREE.MeshStandardMaterial({ map: map ?? undefined, roughness: 0.78, metalness: 0.02, ...opts });
  }
  private inst(name: string, mat: THREE.Material, shadow = true): THREE.Group {
    const g = this.obj[name].clone();
    g.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.material = mat;
        m.castShadow = shadow;
        m.receiveShadow = true;
      }
    });
    return g;
  }
  // Card backs are stored upright; a face-down card is turned over its long axis, so pre-rotate the back.
  private backMat(name: string) {
    const t = this.tex[name].clone();
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
    t.needsUpdate = true;
    return this.std(t, { roughness: 0.6 });
  }

  private build() {
    const s = this.scene;
    // Lights. decay 0 keeps intensities in simple artistic units.
    this.amb = new THREE.AmbientLight(0x9aa3b5, 0.55);
    s.add(this.amb);
    const key = (this.key = new THREE.SpotLight(0xfff1dc, 2.6, 0, 0.62, 0.75, 0));
    key.position.set(8, 96, 34);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 20;
    key.shadow.camera.far = 220;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 5;
    s.add(key, key.target);
    this.libLight = new THREE.PointLight(0x4fb6d0, 0.5, 0, 0);
    this.libLight.position.set(-50, 30, 34);
    this.fasLight = new THREE.PointLight(0xe5573f, 0.35, 0, 0);
    this.fasLight.position.set(50, 30, -34);
    this.flash = new THREE.PointLight(0xffffff, 0, 0, 0);
    this.flash.position.set(0, 26, 0);
    this.spot = new THREE.SpotLight(0xffffff, 0, 0, 0.16, 0.6, 0);
    this.spot.position.set(0, 70, 10);
    s.add(this.libLight, this.fasLight, this.flash, this.spot, this.spot.target);

    // Room: a dark floor far below, the mod's banners hanging around the table.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(420, 64), new THREE.MeshStandardMaterial({ color: 0x08090c, roughness: 0.55, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -40;
    floor.receiveShadow = true;
    s.add(floor);
    this.bannerMat = new THREE.MeshBasicMaterial({ map: this.tex.banner, side: THREE.DoubleSide, fog: true });
    this.bannerMat.color.setScalar(0.42);
    const bannerAt: [number, number, number][] = [[0, -132, 0], [0, 132, Math.PI], [-152, 0, Math.PI / 2], [152, 0, -Math.PI / 2], [-118, -104, Math.PI / 4], [118, -104, -Math.PI / 4], [-118, 104, (Math.PI * 3) / 4], [118, 104, (-Math.PI * 3) / 4]];
    for (const [x, z, ry] of bannerAt) {
      const b = this.inst('banner', this.bannerMat, false);
      b.position.set(x, 4, z);
      b.rotation.y = ry;
      b.scale.setScalar(0.85);
      this.banners.push(b);
      s.add(b);
    }

    // Table: the mod's colour-coded felt on a dark slab.
    const top = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W, TABLE_D), this.std(this.tex.table, { roughness: 0.95 }));
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    s.add(top);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W + 3, 2.4, TABLE_D + 3), new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.35, metalness: 0.5 }));
    slab.position.y = -1.22;
    slab.receiveShadow = true;
    s.add(slab);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 38, 32), new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.5, metalness: 0.4 }));
    leg.position.y = -21;
    s.add(leg);

    // Tracks and piles.
    const libTrack = this.inst('track', this.std(this.tex.liberal));
    libTrack.position.set(0, 0.1, LIB_Z);
    s.add(libTrack);
    this.fasTrackMat = this.std(this.tex['fascist-56']);
    this.fasTrack = this.inst('track', this.fasTrackMat);
    this.fasTrack.position.set(0, 0.1, FAS_Z);
    s.add(this.fasTrack);
    const drawPile = this.inst('pile', this.std(this.tex.draw));
    drawPile.position.set(DRAW.x, 0.1, DRAW.z);
    s.add(drawPile);
    const discardPile = this.inst('pile', this.std(this.tex.discard));
    discardPile.position.set(DISCARD.x, 0.1, DISCARD.z);
    // The mod stores the discard board flipped: its underside carries the DISCARD art.
    discardPile.rotation.z = Math.PI;
    s.add(discardPile);

    // Election tracker token.
    this.tracker = this.inst('tracker', new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.3, metalness: 0.75 }));
    this.tracker.scale.setScalar(0.88);
    this.tracker.position.copy(this.trackerPos(0));
    s.add(this.tracker);

    // Placards and term-limit markers.
    this.presPlacard = this.inst('placard-president', this.std(this.tex['placard-president'], { roughness: 0.4 }));
    this.chanPlacard = this.inst('placard-chancellor', this.std(this.tex['placard-chancellor'], { roughness: 0.55 }));
    this.prevPres = this.inst('shim', this.std(this.tex['prev-president'], { roughness: 0.4 }));
    this.prevChan = this.inst('shim', this.std(this.tex['prev-chancellor'], { roughness: 0.55 }));
    s.add(this.presPlacard, this.chanPlacard, this.prevPres, this.prevChan);

    this.boxMat = this.std(this.tex['box-5'], { roughness: 0.7 });
    this.ballotBox = this.inst('ballot-box', this.boxMat);
    s.add(this.ballotBox);

    // Shared card materials.
    const side = (this.mats.side = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.8 }));
    for (const n of ['policy-liberal', 'policy-fascist', 'ballot-ja', 'ballot-nein', 'membership-liberal', 'membership-fascist', 'nothitler',
      'role-hitler', 'role-fascist-1', 'role-fascist-2', 'role-fascist-3', 'role-liberal-1', 'role-liberal-2', 'role-liberal-3', 'role-liberal-4', 'role-liberal-5', 'role-liberal-6']) {
      this.mats[n] = this.std(this.tex[n], { roughness: 0.6 });
    }
    for (const n of ['policy-back', 'ballot-back', 'membership-back', 'nothitler-back', 'role-back']) this.mats[n] = this.backMat(n);
    for (let i = 0; i < 17; i++) {
      const c = new Card(POLICY.w, POLICY.h, this.mats['policy-liberal'], this.mats['policy-back'], side);
      this.deck.push(c);
      s.add(c.mesh);
    }
    this.parkProps();
    this.layoutCards();
    this.setMood(0, 0);
  }

  // Resting places when nobody holds them (roughly the mod's opening layout).
  private parkProps() {
    this.place(this.presPlacard, new V3(-27, 1.12, -13), 0.5);
    this.place(this.chanPlacard, new V3(27, 1.12, -13), -0.5);
    this.prevPres.position.set(-27, -3, -20);
    this.prevChan.position.set(27, -3, -20);
    this.prevPres.visible = false;
    this.prevChan.visible = false;
    this.place(this.ballotBox, new V3(-51.5, 3, -29.5), 0.4);
  }
  private place(o: THREE.Object3D, p: Vec, rotY?: number) {
    o.position.copy(p);
    if (rotY !== undefined) o.rotation.y = rotY;
  }

  // ---------- geometry helpers ----------
  trackerPos(k: number): Vec {
    return new V3(TRACKER_X[Math.max(0, Math.min(3, k))], BOARD_TOP + 1.55 * 0.88, TRACKER_Z);
  }
  slotPos(policy: Policy, i: number): Vec {
    return policy === 'L' ? new V3(LIB_SLOT_X(i), BOARD_TOP + CARD_T / 2 + 0.01, LIB_Z) : new V3(FAS_SLOT_X(i), BOARD_TOP + CARD_T / 2 + 0.01, FAS_Z + 0.05);
  }
  deckPos(i: number): Vec {
    return new V3(DRAW.x, BOARD_TOP + CARD_T / 2 + 0.01 + i * (CARD_T + 0.005), DRAW.z);
  }
  discardPos(i: number): Vec {
    return new V3(DISCARD.x, BOARD_TOP + CARD_T / 2 + 0.01 + i * (CARD_T + 0.005), DISCARD.z);
  }
  seatPos(i: number, inD: number, rightD = 0, y = 0): Vec {
    const s = this.seats[i];
    return s.anchor.clone().addScaledVector(s.inDir, inD).addScaledVector(s.right, rightD).setY(y);
  }
  handPos(seat: number, i: number, count: number): Vec {
    return this.seatPos(seat, 13.5, (i - (count - 1) / 2) * (POLICY.w + 0.5), CARD_T / 2 + 0.01);
  }
  placardPos(seat: number, which: 'president' | 'chancellor', both: boolean): Vec {
    return this.seatPos(seat, both && which === 'chancellor' ? 15 : 9.5, 9, 1.12);
  }
  // Placard fronts face the centre of the table.
  placardRot(seat: number): number {
    return this.seats[seat].rotY + Math.PI;
  }
  seatLook(i: number, y = 5): Vec {
    return this.seats[i].anchor.clone().setY(y);
  }

  // ---------- shots ----------
  static HOME = shot(0, 84, 70, 0, 0, 3.5, 43);
  static BOARDS = shot(0, 40, 33, 0, 0, 0.5, 36);
  seatShot(i: number, kind: 'hero' | 'close' | 'wide' = 'hero'): Shot {
    const s = this.seats[i];
    const d = kind === 'close' ? 17 : kind === 'wide' ? 40 : 30;
    const h = kind === 'close' ? 9 : kind === 'wide' ? 22 : 13.5;
    const pos = s.anchor.clone().addScaledVector(s.inDir, d).addScaledVector(s.right, kind === 'close' ? -3 : -8).setY(h);
    const look = s.anchor.clone().addScaledVector(s.inDir, kind === 'wide' ? 9 : 5).setY(kind === 'close' ? 4.5 : 4.6);
    return { pos, look, fov: kind === 'close' ? 30 : 36 };
  }
  pairShot(a: number, b: number): Shot {
    const A = this.seats[a].anchor;
    const B = this.seats[b].anchor;
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const span = A.distanceTo(B);
    let n = mid.clone().multiplyScalar(-1).setY(0);
    if (n.length() < 6) n = new V3(-(B.z - A.z), 0, B.x - A.x);
    n.normalize();
    const pos = mid.clone().addScaledVector(n, 24 + span * 0.75).setY(20 + span * 0.28);
    return { pos, look: mid.clone().setY(2), fov: 40 };
  }
  slotShot(policy: Policy, i: number): Shot {
    const p = this.slotPos(policy, i);
    return { pos: new V3(p.x * 0.8, 15, p.z + 15), look: new V3(p.x, 0.5, p.z), fov: 32 };
  }
  orbitShot(angle: number, radius = 92, height = 46, lookY = 0): Shot {
    return { pos: new V3(Math.sin(angle) * radius, height, Math.cos(angle) * radius), look: new V3(0, lookY, 0), fov: 40 };
  }
  attract() {
    this.rig.auto = (t) => this.orbitShot(t * 0.045, 96 + Math.sin(t * 0.11) * 8, 40 + Math.sin(t * 0.07) * 8, 2);
  }

  // ---------- motion ----------
  // Moves an object along a lifted arc, optionally turning it on the way.
  fly(o: THREE.Object3D, to: Vec, opts: { dur?: number; lift?: number; rotY?: number; rotZ?: number; ease?: Ease; spin?: number } = {}): Promise<void> {
    const from = o.position.clone();
    const ry0 = o.rotation.y;
    let ry1 = opts.rotY ?? ry0;
    while (ry1 - ry0 > Math.PI) ry1 -= Math.PI * 2;
    while (ry1 - ry0 < -Math.PI) ry1 += Math.PI * 2;
    ry1 += (opts.spin ?? 0) * Math.PI * 2;
    const rz0 = o.rotation.z;
    const rz1 = opts.rotZ ?? rz0;
    const lift = opts.lift ?? Math.min(9, 2 + from.distanceTo(to) * 0.12);
    return this.tw.run(opts.dur ?? 0.8, (k) => {
      o.position.lerpVectors(from, to, k);
      o.position.y += Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * lift;
      o.rotation.y = lerp(ry0, ry1, k);
      o.rotation.z = lerp(rz0, rz1, k);
    }, opts.ease ?? ease.inOut);
  }
  // Turns a card over in place with a hop.
  flip(c: Card, up: boolean, dur = 0.55, hop = 2.2): Promise<void> {
    const z0 = c.mesh.rotation.z;
    const z1 = up ? 0 : Math.PI;
    const y0 = c.mesh.position.y;
    return this.tw.run(dur, (k) => {
      c.mesh.rotation.z = lerp(z0, z1, k);
      c.mesh.position.y = y0 + Math.sin(Math.min(1, k) * Math.PI) * hop;
    }, ease.inOut);
  }
  spotOn(target: Vec | null, intensity = 2.4, angle = 0.16, color = 0xffffff): Promise<void> {
    if (target) {
      this.spot.target.position.copy(target);
      this.spot.position.set(target.x * 0.5, 70, target.z * 0.5 + 6);
      this.spot.angle = angle;
      this.spot.color.set(color);
    }
    const i0 = this.spot.intensity;
    const i1 = target ? intensity : 0;
    return this.tw.run(0.6, (k) => { this.spot.intensity = lerp(i0, i1, k); }, ease.out);
  }
  // Dims or restores the room so a spotlit moment reads.
  dim(level: number, dur = 0.8): Promise<void> {
    const k0 = this.key.intensity;
    const a0 = this.amb.intensity;
    const k1 = 2.6 * level;
    const a1 = 0.55 * (0.35 + level * 0.65);
    return this.tw.run(dur, (k) => {
      this.key.intensity = lerp(k0, k1, k);
      this.amb.intensity = lerp(a0, a1, k);
    });
  }
  pulse(color: number, strength = 9, dur = 1.6) {
    this.flash.color.set(color);
    void this.tw.run(dur, (k) => { this.flash.intensity = strength * (1 - k); }, ease.out);
  }
  // tension 0..1 follows the fascist track; hope 0..1 follows the liberal track.
  setMood(tension: number, hope: number, dur = 2) {
    const t0 = this.tension;
    this.tension = tension;
    const lib0 = this.libLight.intensity;
    const fas0 = this.fasLight.intensity;
    const warm = new THREE.Color(0xfff1dc);
    const red = new THREE.Color(0xff9a80);
    void this.tw.run(dur, (k) => {
      const t = lerp(t0, tension, k);
      this.key.color.copy(warm).lerp(red, t * 0.75);
      this.fasLight.intensity = lerp(fas0, 0.3 + tension * 2.2, k);
      this.libLight.intensity = lerp(lib0, 0.45 + hope * 1.3 - tension * 0.25, k);
      this.bannerMat.color.setRGB(0.42 + t * 0.4, 0.42 - t * 0.14, 0.42 - t * 0.16);
      (this.grade.uniforms.tint.value as THREE.Color).setRGB(1 + t * 0.05, 1 - t * 0.04, 1 - t * 0.07);
      this.grade.uniforms.vignette.value = 0.85 + t * 0.15;
    });
  }

  // ---------- seats ----------
  private standeeTexture(name: string, color: string, ai: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 528;
    const g = c.getContext('2d')!;
    g.fillStyle = '#08090b';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = color;
    g.lineWidth = 10;
    g.strokeRect(17, 17, c.width - 34, c.height - 34);
    g.fillStyle = color;
    if (ai) {
      // A spark mark for AI seats.
      g.translate(c.width / 2, c.height / 2 - 10);
      for (let i = 0; i < 12; i++) {
        g.rotate(Math.PI / 6);
        g.beginPath();
        g.moveTo(-9, -34);
        g.lineTo(0, i % 2 ? -118 : -150);
        g.lineTo(9, -34);
        g.closePath();
        g.fill();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      g.font = '800 290px "Inter Variable", Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name.slice(0, 1).toUpperCase(), c.width / 2, c.height / 2 + 22);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  private buildSeats(v: ShPublicView) {
    for (const s of this.seats) {
      s.label.remove();
      this.seatGroup.remove(s.standee, s.envelope, s.role.mesh, s.member.mesh, s.ballot.mesh, s.notHitler.mesh);
    }
    this.seats = [];
    const side = this.mats.side;
    v.names.forEach((name, i) => {
      const slot = v.slots[i];
      const [x, z, ix, iz] = SLOT_FRAMES[slot];
      const inDir = new V3(ix, 0, iz);
      const right = new V3(-iz, 0, ix);
      const color = seatHex(slot);
      const rotY = Math.atan2(-ix, -iz);
      const standee = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(5.4, 7.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.3, metalness: 0.7 }));
      slab.position.y = 4;
      slab.castShadow = true;
      const tex = this.standeeTexture(name, color, v.ai[i]);
      const glow = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.35, roughness: 0.4 });
      for (const dir of [1, -1]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 6.8), glow);
        face.position.set(0, 4, 0.21 * dir);
        if (dir < 0) face.rotation.y = Math.PI;
        standee.add(face);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.3, metalness: 0.7 }));
      base.position.y = 0.2;
      base.castShadow = true;
      standee.add(slab, base);
      standee.position.set(x, 0, z).addScaledVector(inDir, 1.2);
      standee.rotation.y = Math.atan2(ix, iz);

      const envelope = this.inst('envelope', this.std(this.tex.envelope, { roughness: 0.85 }));
      const role = new Card(BIG.w, BIG.h, this.mats['role-back'], this.mats['role-back'], side);
      const member = new Card(BIG.w, BIG.h, this.mats['membership-back'], this.mats['membership-back'], side);
      const ballot = new Card(BIG.h, BIG.w, this.mats['ballot-ja'], this.mats['ballot-back'], side);
      const notHitler = new Card(4.0, BIG.h, this.mats.nothitler, this.mats['nothitler-back'], side);

      const label = document.createElement('div');
      label.className = 'sh-seat';
      label.style.opacity = '0';
      label.style.setProperty('--seat', color);
      this.labelLayer.appendChild(label);

      const rig: SeatRig = { index: i, slot, color, anchor: new V3(x, 0, z), inDir, right, rotY, standee, glow, envelope, role, member, ballot, notHitler, label, tags: [], chip: null, dead: false };
      this.seats.push(rig);
      this.seatGroup.add(standee, envelope, role.mesh, member.mesh, ballot.mesh, notHitler.mesh);
      this.restSeat(i);
      this.renderLabel(i);
    });
  }
  // Where a seat's role card stands when it is shown to the table.
  rolePresentPos(i: number): Vec {
    return this.seatPos(i, 8.5, 0, 3.7);
  }
  envelopePos(i: number): Vec {
    return this.seatPos(i, 5.5, -9, 0.12);
  }
  ballotPos(i: number): Vec {
    return this.seatPos(i, 7, 0, CARD_T / 2 + 0.01);
  }
  // Puts a seat's private cards back where they rest: tucked in the envelope, ballot in hand (hidden).
  restSeat(i: number) {
    const s = this.seats[i];
    this.place(s.envelope, this.envelopePos(i), s.rotY);
    s.envelope.visible = true;
    for (const c of [s.role, s.member]) {
      c.mesh.position.copy(this.envelopePos(i)).setY(0.06);
      c.mesh.rotation.set(0, s.rotY, Math.PI);
      c.mesh.visible = false;
    }
    s.ballot.mesh.visible = false;
    s.ballot.mesh.rotation.set(0, s.rotY, Math.PI);
    s.ballot.mesh.position.copy(this.ballotPos(i));
    s.notHitler.mesh.visible = false;
    s.notHitler.mesh.rotation.set(0, s.rotY, 0);
    s.notHitler.mesh.position.copy(this.seatPos(i, 12.5, -9, CARD_T / 2 + 0.01));
  }
  setBallot(i: number, state: 'hidden' | 'down' | 'ja' | 'nein') {
    const s = this.seats[i];
    s.ballot.mesh.visible = state !== 'hidden';
    if (state === 'ja' || state === 'nein') s.ballot.setFace(this.mats[`ballot-${state}`]);
    s.ballot.faceUp = state === 'ja' || state === 'nein';
    s.ballot.mesh.position.copy(this.ballotPos(i));
    s.ballot.mesh.rotation.y = s.rotY;
  }
  setPolicyFace(c: Card, policy: Policy) {
    c.setFace(this.mats[policy === 'L' ? 'policy-liberal' : 'policy-fascist']);
  }
  setRoleFace(i: number, role: Role, art: number) {
    const key = role === 'hitler' ? 'role-hitler' : `role-${role}-${art}`;
    this.seats[i].role.setFace(this.mats[key]);
    if (role === 'hitler') this.seats[i].glow.emissive.set(0xff5a3c);
    this.seats[i].member.setFace(this.mats[role === 'liberal' ? 'membership-liberal' : 'membership-fascist']);
  }
  setDead(i: number, dead: boolean, animate = false): Promise<void> {
    const s = this.seats[i];
    s.dead = dead;
    this.renderLabel(i);
    const slabTilt = dead ? 1.45 : 0;
    const x0 = s.standee.rotation.x;
    const e0 = s.glow.emissiveIntensity;
    const e1 = dead ? 0.06 : 1.35;
    s.standee.rotation.order = 'YXZ';
    return this.tw.run(animate ? 0.5 : 0, (k) => {
      s.standee.rotation.x = lerp(x0, slabTilt, k);
      s.glow.emissiveIntensity = lerp(e0, e1, k);
    }, ease.in);
  }
  setTags(i: number, tags: string[]) {
    this.seats[i].tags = tags;
    this.renderLabel(i);
  }
  setChip(i: number, chip: { text: string; tone: string } | null) {
    this.seats[i].chip = chip;
    this.renderLabel(i);
  }
  private renderLabel(i: number) {
    const s = this.seats[i];
    const v = this.view;
    const name = v?.names[i] ?? '';
    const tags = s.tags.map((t) => `<span class="sh-tag">${t}</span>`).join('');
    const chip = s.chip ? `<span class="sh-chip ${s.chip.tone}">${s.chip.text}</span>` : '';
    const bubble = s.label.querySelector('.sh-bubble');
    s.label.classList.toggle('dead', s.dead);
    s.label.innerHTML = `<div class="sh-name">${escapeHtml(name)}</div>${tags || chip ? `<div class="sh-tags">${tags}${chip}</div>` : ''}`;
    if (bubble) s.label.prepend(bubble);
  }
  say(i: number, text: string) {
    const s = this.seats[i];
    if (!s) return;
    s.label.querySelector('.sh-bubble')?.remove();
    const b = document.createElement('div');
    b.className = 'sh-bubble';
    b.textContent = text;
    s.label.prepend(b);
    window.clearTimeout(s.bubbleTimer);
    s.bubbleTimer = window.setTimeout(() => b.remove(), 3200 + text.length * 55);
    // A speaking seat flares.
    const e0 = s.glow.emissiveIntensity;
    void this.tw.run(0.9, (k) => { s.glow.emissiveIntensity = (s.dead ? 0.06 : 1.35) + Math.sin(k * Math.PI) * 2.2; }).then(() => { s.glow.emissiveIntensity = s.dead ? 0.06 : Math.max(e0, 1.35); });
  }

  showSeats(on: boolean) {
    this.seatGroup.visible = on;
  }

  // ---------- state sync ----------
  // Stacks every policy card where its pool says it belongs.
  layoutCards() {
    this.deck.forEach((c, i) => { this.place(c.mesh, this.deckPos(i), 0); c.faceUp = false; c.mesh.visible = true; });
    this.discard.forEach((c, i) => { this.place(c.mesh, this.discardPos(i), 0); c.faceUp = false; c.mesh.visible = true; });
    this.lib.forEach((c, i) => { c.setFace(this.mats['policy-liberal']); this.place(c.mesh, this.slotPos('L', i), 0); c.faceUp = true; });
    this.fas.forEach((c, i) => { c.setFace(this.mats['policy-fascist']); this.place(c.mesh, this.slotPos('F', i), 0); c.faceUp = true; });
  }

  // Snaps the whole table to a public game state. Cutscenes animate toward the same resting places,
  // so calling this after a cutscene changes nothing visible; calling it after a reload rebuilds the table.
  syncTo(v: ShPublicView) {
    if (!this.loaded) return;
    this.view = v;
    const key = `${v.n}:${v.names.join('|')}:${v.ai.join('')}`;
    if (key !== this.builtFor) {
      this.builtFor = key;
      this.buildSeats(v);
      this.fasTrackMat.map = this.tex[`fascist-${v.bracket}`];
      this.fasTrackMat.needsUpdate = true;
      this.boxMat.map = this.tex[`box-${v.n}`];
      this.boxMat.needsUpdate = true;
    }
    this.rig.auto = null;
    this.seatGroup.visible = true;

    // Policy cards.
    const handN = v.phase === 'president_discard' ? 3 : v.phase === 'chancellor_enact' || v.phase === 'veto_response' ? 2 : 0;
    const want: [Card[], number][] = [[this.lib, v.liberal], [this.fas, v.fascist], [this.hand, handN], [this.deck, v.deck], [this.discard, v.discard]];
    const spare: Card[] = [];
    for (const [pool, n] of want) while (pool.length > n) spare.push(pool.pop()!);
    for (const [pool, n] of want) while (pool.length < n && spare.length) pool.push(spare.pop()!);
    this.layoutCards();
    const holder = v.phase === 'president_discard' ? v.president : v.chancellor ?? v.president;
    this.hand.forEach((c, i) => {
      this.place(c.mesh, this.handPos(holder, i, this.hand.length), this.seats[holder].rotY);
      c.faceUp = false;
    });

    // Tracker, placards, term-limit markers.
    this.tracker.position.copy(this.trackerPos(v.tracker));
    if (v.phase === 'roles') this.parkProps();
    else {
      const both = v.chancellor === null;
      this.place(this.presPlacard, this.placardPos(v.president, 'president', both), this.placardRot(v.president));
      const cs = v.chancellor ?? v.president;
      this.place(this.chanPlacard, this.placardPos(cs, 'chancellor', both), this.placardRot(cs));
      this.place(this.ballotBox, new V3(-51.5, 3, -29.5), 0.4);
      this.syncTermLimits(v);
    }

    // Seats.
    const inOffice = ['president_discard', 'chancellor_enact', 'veto_response', 'power'].includes(v.phase);
    v.names.forEach((_, i) => {
      this.restSeat(i);
      this.seats[i].glow.emissive.set(v.phase === 'over' && v.roles?.[i] === 'hitler' ? 0xff5a3c : 0xffffff);
      void this.setDead(i, !v.alive[i]);
      if (v.phase === 'vote' && v.voted[i]) this.setBallot(i, 'down');
      if (v.notHitler[i] && v.alive[i]) this.seats[i].notHitler.mesh.visible = true;
      const tags: string[] = [];
      if (v.phase !== 'roles' && v.phase !== 'over') {
        if (i === v.president) tags.push(inOffice ? 'PRESIDENT' : 'CANDIDATE');
        if (i === v.chancellor) tags.push(inOffice ? 'CHANCELLOR' : 'NOMINEE');
      }
      let chip: SeatRig['chip'] = null;
      if (!v.alive[i]) chip = { text: 'EXECUTED', tone: 'dead' };
      else if (v.phase === 'roles') chip = v.ready[i] ? { text: 'READY', tone: 'ok' } : { text: 'READING ROLE', tone: 'wait' };
      else if (v.phase === 'vote') chip = v.voted[i] ? { text: 'VOTED', tone: 'ok' } : { text: 'VOTING', tone: 'wait' };
      if (v.phase === 'over' && v.roles) {
        const role = v.roles[i];
        chip = { text: role.toUpperCase(), tone: role === 'liberal' ? 'lib' : 'fas' };
        this.setRoleFace(i, role, v.roleArt![i]);
        const c = this.seats[i].role;
        c.mesh.visible = true;
        c.mesh.position.copy(this.rolePresentPos(i));
        c.mesh.rotation.set(1.1, this.seats[i].rotY + Math.PI, 0);
      }
      this.seats[i].tags = tags;
      this.seats[i].chip = chip;
      this.renderLabel(i);
    });
    this.setMood(v.fascist / 6, v.liberal / 5, 1.2);
  }
  syncTermLimits(v: Pick<ShPublicView, 'lastGov' | 'alive'>) {
    const g = v.lastGov;
    this.prevPres.visible = !!g;
    this.prevChan.visible = !!g;
    if (!g) return;
    this.place(this.prevPres, this.seatPos(g.president, 4.5, 9, 0.12), this.seats[g.president].rotY);
    this.place(this.prevChan, this.seatPos(g.chancellor, 4.5, 9, 0.12), this.seats[g.chancellor].rotY);
  }
  // Lobby: no seats, everything parked like the mod's opening layout.
  showLobby() {
    if (!this.loaded) return;
    this.view = null;
    this.builtFor = '';
    for (const s of this.seats) {
      s.label.remove();
      this.seatGroup.remove(s.standee, s.envelope, s.role.mesh, s.member.mesh, s.ballot.mesh, s.notHitler.mesh);
    }
    this.seats = [];
    for (const pool of [this.discard, this.hand, this.lib, this.fas]) while (pool.length) this.deck.push(pool.pop()!);
    this.layoutCards();
    this.parkProps();
    this.place(this.ballotBox, new V3(0, 3, -22), 0);
    this.tracker.position.copy(this.trackerPos(0));
    this.setMood(0.1, 0.3, 0.5);
    this.attract();
  }

  // ---------- frame loop ----------
  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.25, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.tw.update(dt);
    this.rig.update(dt, t);
    this.banners.forEach((b, i) => { b.rotation.z = Math.sin(t * 0.4 + i * 1.7) * 0.012; });
    this.grade.uniforms.time.value = t % 100;
    this.updateLabels();
    this.composer.render();
  };
  private tmp = new V3();
  private updateLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const s of this.seats) {
      const p = this.tmp.copy(s.anchor).addScaledVector(s.inDir, 1.2).setY(s.dead ? 3.2 : 9.2).project(this.camera);
      const visible = this.labelsVisible && p.z < 1 && p.x > -1.15 && p.x < 1.15 && p.y > -1.2 && p.y < 1.15;
      s.label.style.opacity = visible ? '1' : '0';
      if (visible) s.label.style.transform = `translate(-50%, -100%) translate(${((p.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    }
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.tw.flush();
    for (const s of this.seats) s.label.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
