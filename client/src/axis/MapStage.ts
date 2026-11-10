// The world map in 3D: the printed board, every unit as the mod's own sculpt, region highlights,
// order arrows and the camera. One stage serves both the big screen (a spectator camera that
// flies to the action) and the devices (pan, pinch, tap and drag units to give orders).
// The stage knows nothing about rules: it draws what it is given and reports what was touched.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { UNITS, type UnitKey, type UnitStack } from '@bge/shared';
import { Tweens, ease } from './tween';
import { UnitLibrary, unitScale, type UnitModel } from './units';
import { layoutSpace, mobilizationSpots, type PieceSpot } from './layout';
import {
  ART_H, ART_W, MAP_D, MAP_W, MOB_ID, SPACE_CENTER, TERR, ZONE, S, mapColor,
  holesOf, nearestSpace, powerBase, powerInk, powerShort, px2r, r2px, regionAt, regionBox, ringsOf, sideOf,
} from './world';

export type Tone = 'attack' | 'move' | 'special' | 'origin';
const TONE_HEX: Record<Tone, number> = { attack: 0xe5534b, move: 0xffffff, special: 0xe8b450, origin: 0xffffff };
const TONE_FILL: Record<Tone, number> = { attack: 0.24, move: 0.16, special: 0.2, origin: 0.07 };

export interface PieceHit {
  space: string;
  power: string;
  key: UnitKey;
  /** True when one sculpt stands for a whole group. */
  stacked: boolean;
  /** Order ordinals (among units that can still act) of the pieces under the finger. */
  ordinals: number[];
  /** How many pieces the sculpt stands for. */
  count: number;
}

export interface StageArrow { from: string[]; to: string; tone: Tone }

export interface StageHandlers {
  regionTap?: (id: string) => void;
  pieceTap?: (hit: PieceHit) => void;
  pieceHold?: (hit: PieceHit) => void;
  /** A finger started dragging a piece. Return the spaces the order leaves from to accept the drag. */
  dragStart?: (hit: PieceHit) => string[] | null;
  dragMove?: (space: string | null) => void;
  dragEnd?: (space: string | null) => void;
  viewChange?: () => void;
}

interface Sprite {
  id: string;
  space: string;
  power: string;
  unit: string;
  model: UnitModel;
  scale: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  grow: number;
  lift: number;
  spot: PieceSpot | null;
  selected: number;
  spent: boolean;
  damaged: boolean;
  badge: THREE.Sprite | null;
  badgeKey: string;
  hideUntil: number;
}

interface Batch {
  mesh: THREE.InstancedMesh;
  outline: THREE.InstancedMesh;
  capacity: number;
}

const SEA_UNITS = new Set(['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport']);
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const V3 = THREE.Vector3;

export class MapStage {
  readonly ready: Promise<void>;
  handlers: StageHandlers = {};
  /** 0..1 while assets load. */
  onProgress?: (k: number) => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.5, 600);
  private tweens = new Tweens();
  private units = new UnitLibrary();
  private raf = 0;
  private last = 0;
  private dirty = true;
  private disposed = false;
  private observer: ResizeObserver;

  // camera rig: a point on the board, a distance and a pitch
  private cam = { x: MAP_W / 2, z: -MAP_D / 2, dist: 60 };
  private pitch: number;
  private vel = { x: 0, z: 0 };
  private flying = 0;

  private batches = new Map<UnitModel, Batch>();
  private pieceMat: THREE.MeshStandardMaterial;
  private outlineMat: THREE.ShaderMaterial;
  private shadows: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private bases: THREE.InstancedMesh;
  private boardMats: THREE.ShaderMaterial[] = [];
  private politicalLayer = new THREE.Group();
  private political = new Map<string, { meshes: THREE.Mesh[]; power: string | null }>();
  private politicalMats = new Map<string, THREE.MeshBasicMaterial>();
  private borderMats: LineMaterial[] = [];
  private sprites = new Map<string, Sprite>();
  private movers = new Set<Sprite>();
  private badgeLayer = new THREE.Group();
  private badgeTex = new Map<string, THREE.Texture>();
  private instancesDirty = true;
  private syncedDist = 0;

  private board: Record<string, UnitStack[]> = {};
  private boardSig = new Map<string, string>();
  private counts = new Map<string, number>();
  private staged: UnitStack[] = [];
  private selection: Record<string, Set<number>> = {};
  private selPower = '';
  private dimSpent: string | null = null;

  private highlightLayer = new THREE.Group();
  private regionGeo = new Map<string, { fills: THREE.BufferGeometry[]; lines: LineGeometry[] }>();
  private fillMats = new Map<string, THREE.MeshBasicMaterial>();
  private lineMats = new Map<string, LineMaterial>();
  private targets: { id: string; tone: Tone }[] = [];
  private hover: string | null = null;
  private veil: THREE.Mesh;
  private veilTarget = 0;

  private arrowLayer = new THREE.Group();
  private arrows: StageArrow[] = [];
  private dragArrow: { from: string[]; to: [number, number]; tone: Tone } | null = null;


  private tileLayer = new THREE.Group();
  private tiles: { x: number; y: number; w: number; h: number; file: string; mesh?: THREE.Mesh; loading?: boolean; used: number }[] = [];
  private tileClock = 0;

  // pointer state
  private pointers = new Map<number, { x: number; y: number }>();
  private press: { x: number; y: number; t: number; hit: PieceHit | null; moved: boolean; drag: boolean; pan: boolean; hold: number } | null = null;
  private pinch: { d: number; cx: number; cy: number } | null = null;
  private ground = new THREE.Plane(new V3(0, 1, 0), 0);
  private ray = new THREE.Raycaster();

  constructor(private host: HTMLElement, private mode: 'device' | 'screen') {
    this.pitch = THREE.MathUtils.degToRad(mode === 'screen' ? 56 : 63);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mode === 'screen' ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.setClearColor(0x050607, 1);
    const el = this.renderer.domElement;
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
    host.appendChild(el);

    // Soft studio light: dark sculpts keep their form through reflections rather than flat fill.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2622, 0.32));
    const key = new THREE.DirectionalLight(0xfff4e2, 1.05);
    key.position.set(-30, 60, 40);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd0ff, 0.5);
    rim.position.set(40, 30, -50);
    this.scene.add(rim);

    this.pieceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.6, envMapIntensity: 0.75 });
    this.outlineMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      uniforms: { uWidth: { value: 0.035 }, uColor: { value: new THREE.Color(0xffffff) } },
      vertexShader: `
        uniform float uWidth;
        void main() {
          vec3 n = normalize(mat3(instanceMatrix) * normal);
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          world.xyz += n * uWidth;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    });

    // The board is an object on a dark table: a slab with a soft shadow, not a picture in a void.
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W * 5, MAP_D * 7),
      new THREE.MeshBasicMaterial({ map: this.makeTableTexture(), toneMapped: false }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.set(MAP_W / 2, -0.62, -MAP_D / 2);
    this.scene.add(table);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(MAP_W + 0.5, 0.6, MAP_D + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.55, metalness: 0.2 }),
    );
    slab.position.set(MAP_W / 2, -0.31, -MAP_D / 2);
    this.scene.add(slab);
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W * 1.24, MAP_D * 1.36),
      new THREE.MeshBasicMaterial({ map: this.makeShadowTexture(true), transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false }),
    );
    under.rotation.x = -Math.PI / 2;
    under.position.set(MAP_W / 2, -0.6, -MAP_D / 2 + 1.2);
    this.scene.add(under);
    this.scene.add(this.tileLayer);

    this.veil = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W, MAP_D),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    this.veil.rotation.x = -Math.PI / 2;
    this.veil.position.set(MAP_W / 2, 0.006, -MAP_D / 2);
    this.veil.renderOrder = 1;
    this.scene.add(this.veil);
    this.highlightLayer.renderOrder = 2;
    this.scene.add(this.politicalLayer, this.highlightLayer, this.arrowLayer, this.badgeLayer);
    this.buildBorders();

    const shadowTex = this.makeShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.62, toneMapped: false }), 1400);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 3;
    this.scene.add(this.shadows);
    // A white ring on the board under every piece in hand: readable from straight above.
    const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }), 400);
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 4;
    this.rings.count = 0;
    this.scene.add(this.rings);
    // Every land and air piece stands on a base in its nation's colour, like a painted miniature.
    // A stack rides on a taller base, the way chips pile under a piece on the cardboard.
    const baseGeo = new THREE.CylinderGeometry(1, 1.06, 1, 40);
    baseGeo.translate(0, 0.5, 0);
    this.bases = new THREE.InstancedMesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.25 }), 1400);
    this.bases.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1400 * 3), 3);
    this.bases.frustumCulled = false;
    this.bases.renderOrder = 5;
    this.bases.count = 0;
    this.scene.add(this.bases);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.home(true);
    if (mode === 'device') this.bindPointer(el);

    this.ready = this.load();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- loading ----------

  private async load(): Promise<void> {
    const loader = new THREE.TextureLoader();
    let unitsK = 0;
    let mapK = 0;
    const report = () => this.onProgress?.(unitsK * 0.7 + mapK * 0.3);
    const tilesInfo = await fetch('/axis/map/tiles.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) as
      { tiles: { x: number; y: number; w: number; h: number; file: string }[] } | null;
    const baseUrl = tilesInfo ? '/axis/map/base.jpg' : '/axis/map-4096.jpg';
    const mapJob = loader.loadAsync(baseUrl).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      const board = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_D), this.boardMaterial(tex));
      board.rotation.x = -Math.PI / 2;
      board.position.set(MAP_W / 2, 0, -MAP_D / 2);
      this.scene.add(board);
      mapK = 1;
      report();
    });
    const unitJob = this.units.load((done, total) => { unitsK = done / Math.max(1, total); report(); });
    await Promise.all([mapJob, unitJob]);
    if (tilesInfo) this.tiles = tilesInfo.tiles.map((t) => ({ ...t, used: 0 }));
    if (this.disposed) return;
    // Anything set before the sculpts arrived was drawn with stand-ins: rebuild it.
    const board = this.board;
    const staged = this.staged;
    this.clearSprites();
    this.board = {};
    this.boardSig.clear();
    this.counts.clear();
    this.staged = [];
    this.setBoard(board, staged, false);
    this.dirty = true;
  }

  // ---------- board ----------

  /** Draws the given position. With animate, units that changed space travel there. */
  setBoard(board: Record<string, UnitStack[]>, staged: UnitStack[], animate: boolean) {
    const next: Record<string, UnitStack[]> = { ...board };
    if (staged.length) next[MOB_ID] = staged;
    const now = performance.now();

    // unit counts per space, power and type, before and after
    const countOf = (b: Record<string, UnitStack[]>) => {
      const out = new Map<string, number>();
      for (const [space, stacks] of Object.entries(b)) {
        for (const st of stacks) {
          if (st.count <= 0) continue;
          const k = `${st.power}:${st.key}|${space}`;
          out.set(k, (out.get(k) ?? 0) + st.count);
        }
      }
      return out;
    };
    const after = countOf(next);
    const before = this.counts;

    // where each group stood before the change, for departures
    const oldPos = new Map<string, [number, number]>();
    for (const sp of this.sprites.values()) {
      const k = `${sp.power}:${sp.unit}|${sp.space}`;
      if (!oldPos.has(k)) oldPos.set(k, [sp.x, sp.z]);
    }

    const changed = new Set<string>();
    for (const space of new Set([...Object.keys(next), ...this.boardSig.keys()])) {
      const sig = JSON.stringify(next[space] ?? []);
      if (this.boardSig.get(space) !== sig) {
        changed.add(space);
        if (next[space]?.length) this.boardSig.set(space, sig);
        else this.boardSig.delete(space);
      }
    }

    // rebuild the sprites of every space that changed
    const arrivals = new Map<string, Sprite[]>();
    for (const space of changed) {
      const spots = this.spotsFor(space, next[space] ?? []);
      const keep = new Set<string>();
      for (const spot of spots) {
        const id = `${space}|${spot.id}`;
        keep.add(id);
        const [x, z] = px2r(spot.x, spot.y);
        let sp = this.sprites.get(id);
        if (!sp) {
          const model = this.units.get(spot.power, spot.key);
          sp = {
            id, space, power: spot.power, unit: spot.key, model,
            scale: unitScale(spot.key, model.size),
            x, y: 0, z,
            yaw: (sideOf(spot.power) === 'axis' ? 0 : Math.PI) + (hash(id) - 0.5) * 0.5,
            grow: animate ? 0 : 1, lift: 0, spot, selected: 0, spent: false, damaged: false,
            badge: null, badgeKey: '', hideUntil: 0,
          };
          this.sprites.set(id, sp);
          const k = `${spot.power}:${spot.key}|${space}`;
          const list = arrivals.get(k);
          if (list) list.push(sp);
          else arrivals.set(k, [sp]);
          if (animate) this.tweens.run(0.3, (t) => { sp!.grow = t; this.instancesDirty = true; }, ease.outBack);
        } else if (sp.x !== x || sp.z !== z) {
          const fx = sp.x;
          const fz = sp.z;
          if (animate) this.tweens.run(0.35, (t) => { sp!.x = fx + (x - fx) * t; sp!.z = fz + (z - fz) * t; this.instancesDirty = true; }, ease.out);
          else { sp.x = x; sp.z = z; }
        }
        sp.spot = spot;
      }
      for (const [id, sp] of this.sprites) {
        if (sp.space === space && !keep.has(id)) this.dropSprite(sp);
      }
    }

    if (animate) {
      // Match units that left one space with units that appeared in another.
      const groups = new Map<string, { from: { space: string; n: number }[]; to: { space: string; n: number }[] }>();
      for (const k of new Set([...before.keys(), ...after.keys()])) {
        const d = (after.get(k) ?? 0) - (before.get(k) ?? 0);
        if (!d) continue;
        const [unit, space] = k.split('|');
        const g = groups.get(unit) ?? { from: [], to: [] };
        if (d < 0) g.from.push({ space, n: -d });
        else g.to.push({ space, n: d });
        groups.set(unit, g);
      }
      let budget = 60;
      for (const [unit, g] of groups) {
        const [power, key] = unit.split(':');
        for (const to of g.to) {
          const landing = arrivals.get(`${unit}|${to.space}`) ?? [];
          let landed = 0;
          while (to.n > 0 && g.from.length) {
            const c = SPACE_CENTER[to.space] ?? [0, 0];
            g.from.sort((a, b) => dist2(SPACE_CENTER[a.space], c) - dist2(SPACE_CENTER[b.space], c));
            const from = g.from[0];
            const n = Math.min(from.n, to.n);
            from.n -= n;
            to.n -= n;
            if (!from.n) g.from.shift();
            const start = oldPos.get(`${unit}|${from.space}`) ?? px2r(...(SPACE_CENTER[from.space] ?? c));
            const shown = Math.min(n, 5, budget);
            budget -= shown;
            for (let i = 0; i < shown; i++) {
              const dest = landing[landed + i] ?? landing[landing.length - 1];
              const end: [number, number] = dest ? [dest.x, dest.z] : px2r(c[0], c[1]);
              const dur = this.march(power, key, start, end, i * 0.07);
              if (dest && landed + i < landing.length) dest.hideUntil = now + (dur + i * 0.07) * 1000;
            }
            landed += n;
          }
        }
      }
    }

    this.board = board;
    this.staged = staged;
    this.counts = after;
    this.refreshSprites();
    this.dirty = true;
  }

  private spotsFor(space: string, stacks: UnitStack[]): PieceSpot[] {
    if (space !== MOB_ID) return layoutSpace(space, stacks).spots;
    // Purchases stand in the printed mobilization chart, one sculpt per unit while there is room.
    const flat: UnitStack[] = [];
    for (const st of stacks) for (let i = 0; i < st.count; i++) flat.push({ ...st, count: 1 });
    const pts = mobilizationSpots(flat.length);
    return flat.map((st, i) => ({
      id: `${st.power}:${st.key}:${i}`, space, power: st.power, key: st.key,
      x: pts[i][0], y: pts[i][1], pieces: [], stacked: false,
    }));
  }

  /** A transient sculpt that travels from one spot to another. Returns the travel time. */
  private march(power: string, key: string, from: [number, number], to: [number, number], delay: number): number {
    const model = this.units.get(power, key);
    const id = `mover:${Math.random().toString(36).slice(2)}`;
    const air = UNITS[key as UnitKey]?.domain === 'air';
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const dur = clamp(0.45 + d * 0.035, 0.55, 1.5);
    const heading = Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
    const sp: Sprite = {
      id, space: '', power, unit: key, model, scale: unitScale(key, model.size),
      x: from[0], y: 0, z: from[1], yaw: heading, grow: 1, lift: 0, spot: null,
      selected: 0, spent: false, damaged: false, badge: null, badgeKey: '', hideUntil: performance.now() + delay * 1000,
    };
    this.movers.add(sp);
    const arc = air ? clamp(d * 0.16, 0.8, 4.5) : 0.22;
    void this.tweens.wait(delay).then(() => this.tweens.run(dur, (t) => {
      sp.x = from[0] + (to[0] - from[0]) * t;
      sp.z = from[1] + (to[1] - from[1]) * t;
      sp.y = Math.sin(t * Math.PI) * arc;
      this.instancesDirty = true;
    }, ease.inOut)).then(() => {
      this.movers.delete(sp);
      this.instancesDirty = true;
      this.dirty = true;
    });
    return dur;
  }

  /** The pieces the active player has picked up: keys are `space|unit`, values are order ordinals. */
  setSelection(power: string, selection: Record<string, Set<number>>) {
    this.selPower = power;
    this.selection = selection;
    this.refreshSprites();
  }

  /** Units of this power that have already acted are drawn subdued. */
  setSpentDim(power: string | null) {
    if (this.dimSpent === power) return;
    this.dimSpent = power;
    this.refreshSprites();
  }

  private refreshSprites() {
    for (const sp of this.sprites.values()) {
      const spot = sp.spot;
      if (!spot) continue;
      let selected = 0;
      let spent = spot.pieces.length > 0;
      let damaged = false;
      const picked = sp.power === this.selPower ? this.selection[`${sp.space}|${sp.unit}`] : undefined;
      for (const p of spot.pieces) {
        if (p.available) spent = false;
        if (p.damaged) damaged = true;
        if (picked && p.ordinal != null && picked.has(p.ordinal)) selected++;
      }
      const lift = selected ? 0.3 : 0;
      if (lift !== sp.lift) {
        sp.lift = lift;
        const y0 = sp.y;
        this.tweens.run(0.16, (t) => { sp.y = y0 + (lift - y0) * t; this.instancesDirty = true; }, ease.out);
      }
      sp.selected = selected;
      sp.spent = spent && sp.power === this.dimSpent;
      sp.damaged = damaged;
      const count = spot.pieces.length;
      const cargo = spot.pieces.reduce((n, p) => n + (p.cargo?.reduce((m, c) => m + c.count, 0) ?? 0), 0);
      const text = spot.stacked && count > 1 ? (selected ? `${selected}/${count}` : String(count)) : cargo ? `+${cargo}` : '';
      this.setBadge(sp, text, selected > 0 ? 'on' : cargo && !(spot.stacked && count > 1) ? 'cargo' : 'off');
    }
    this.instancesDirty = true;
    this.dirty = true;
  }

  private setBadge(sp: Sprite, text: string, tone: 'on' | 'off' | 'cargo') {
    const key = text ? `${text}|${tone}` : '';
    if (key === sp.badgeKey) return;
    sp.badgeKey = key;
    if (!text) {
      if (sp.badge) { this.badgeLayer.remove(sp.badge); sp.badge.material.dispose(); sp.badge = null; }
      return;
    }
    let tex = this.badgeTex.get(key);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 72;
      const g = c.getContext('2d')!;
      g.fillStyle = tone === 'on' ? '#ffffff' : tone === 'cargo' ? 'rgba(14,34,48,.94)' : 'rgba(8,9,11,.9)';
      g.strokeStyle = tone === 'on' ? '#ffffff' : 'rgba(255,255,255,.55)';
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(6, 6, 116, 60, 30);
      g.fill();
      g.stroke();
      g.fillStyle = tone === 'on' ? '#000000' : '#ffffff';
      g.font = `700 ${text.length > 3 ? 34 : 42}px Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 64, 39);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.badgeTex.set(key, tex);
    }
    if (!sp.badge) {
      sp.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
      sp.badge.renderOrder = 20;
      this.badgeLayer.add(sp.badge);
    } else {
      sp.badge.material.map = tex;
      sp.badge.material.needsUpdate = true;
    }
  }

  private dropSprite(sp: Sprite) {
    this.sprites.delete(sp.id);
    if (sp.badge) { this.badgeLayer.remove(sp.badge); sp.badge.material.dispose(); }
    this.instancesDirty = true;
  }

  private clearSprites() {
    for (const sp of [...this.sprites.values()]) this.dropSprite(sp);
    this.movers.clear();
  }

  private batchFor(model: UnitModel, need: number): Batch {
    let b = this.batches.get(model);
    if (b && b.capacity >= need) return b;
    if (b) { this.scene.remove(b.mesh, b.outline); b.mesh.dispose(); b.outline.dispose(); }
    const capacity = Math.max(32, Math.ceil(need * 1.5));
    const mesh = new THREE.InstancedMesh(model.geometry, this.pieceMat, capacity);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    const outline = new THREE.InstancedMesh(model.geometry, this.outlineMat, capacity);
    outline.frustumCulled = false;
    outline.renderOrder = 4;
    this.scene.add(outline, mesh);
    b = { mesh, outline, capacity };
    this.batches.set(model, b);
    return b;
  }

  private syncInstances() {
    this.instancesDirty = false;
    const now = performance.now();
    const all: Sprite[] = [];
    let waiting = false;
    for (const sp of this.sprites.values()) {
      if (sp.hideUntil > now) { waiting = true; continue; }
      all.push(sp);
    }
    for (const sp of this.movers) {
      if (sp.hideUntil > now) { waiting = true; continue; }
      all.push(sp);
    }
    if (waiting) this.instancesDirty = true;
    const need = new Map<UnitModel, number>();
    for (const sp of all) need.set(sp.model, (need.get(sp.model) ?? 0) + 1);
    for (const [model, b] of this.batches) if (!need.has(model)) { b.mesh.count = 0; b.outline.count = 0; }
    const cursor = new Map<UnitModel, [number, number]>();
    const m = new THREE.Matrix4();
    const ring = new THREE.Matrix4();
    const noTurn = new THREE.Quaternion();
    const q = new THREE.Quaternion();
    const up = new V3(0, 1, 0);
    const pos = new V3();
    const scl = new V3();
    const color = new THREE.Color();
    const badgeScale = clamp(this.cam.dist / 26, 0.62, 2.4);
    // From far away sculpts grow so armies stay readable, the way counters do on a wall map.
    const zoomScale = clamp(this.cam.dist / 30, 1, 1.85);
    this.syncedDist = this.cam.dist;
    let si = 0;
    let ri = 0;
    let bi = 0;
    const baseColor = new THREE.Color();
    for (const sp of all) {
      const b = this.batchFor(sp.model, need.get(sp.model)!);
      const c = cursor.get(sp.model) ?? [0, 0];
      const s = sp.scale * Math.max(0.001, sp.grow) * zoomScale;
      q.setFromAxisAngle(up, sp.yaw);
      // Every piece rides a base in its nation's colour: round under land and air units, a long
      // oval under a hull. A stack rides a taller one.
      const hull = SEA_UNITS.has(sp.unit);
      const stack = sp.spot?.stacked ? Math.min(6, sp.spot.pieces.length) : 1;
      const live = zoomScale * Math.max(0.001, sp.grow);
      const baseH = (0.055 + 0.04 * (stack - 1)) * live;
      if (bi < 1400) {
        const half = Math.max(sp.model.size.x, sp.model.size.z) * sp.scale * 0.5;
        const bx = (hull ? half + 0.08 : Math.max(0.3, Math.min(0.48, half * 0.92))) * live;
        const bz = (hull ? Math.max(0.2, Math.min(sp.model.size.x, sp.model.size.z) * sp.scale * 0.5 + 0.1) : bx / live) * (hull ? live : live);
        m.compose(pos.set(sp.x, sp.y, sp.z), hull ? q : noTurn, scl.set(bx, baseH, hull ? bz : bx));
        this.bases.setMatrixAt(bi, m);
        baseColor.set(mapColor(sp.power));
        if (sp.spent) baseColor.multiplyScalar(0.42);
        this.bases.setColorAt(bi, baseColor);
        bi++;
      }
      m.compose(pos.set(sp.x, sp.y + baseH, sp.z), q, scl.set(s, s, s));
      b.mesh.setMatrixAt(c[0], m);
      // sculpts are pewter for every nation; the base carries the colour
      // sculpts are metal washed in the nation's colour, so an army reads from across the room
      color.setRGB(0.66, 0.68, 0.72, THREE.SRGBColorSpace).lerp(baseColor.set(mapColor(sp.power)), 0.5);
      if (sp.damaged) color.lerp(new THREE.Color(0.75, 0.16, 0.1), 0.55);
      if (sp.spent) color.multiplyScalar(0.42);
      b.mesh.setColorAt(c[0], color);
      c[0]++;
      if (sp.selected) {
        b.outline.setMatrixAt(c[1], m);
        c[1]++;
        if (ri < 400) {
          const rr = Math.max(sp.model.size.x, sp.model.size.z) * s * 0.62 + 0.08;
          ring.compose(pos.set(sp.x, 0.02, sp.z), noTurn, scl.set(rr, 1, rr));
          this.rings.setMatrixAt(ri++, ring);
        }
      }
      cursor.set(sp.model, c);
      if (si < 1400) {
        const r = Math.max(sp.model.size.x, sp.model.size.z) * s;
        const fade = 1 / (1 + sp.y * 1.6);
        m.compose(pos.set(sp.x + sp.y * 0.25, 0.012, sp.z + sp.y * 0.2), q, scl.set(r * 1.5 * fade + sp.y * 0.3, 1, Math.max(sp.model.size.z * s * 2.3, r * 0.75) * fade + sp.y * 0.3));
        this.shadows.setMatrixAt(si++, m);
      }
      if (sp.badge) {
        const r = Math.max(sp.model.size.x, sp.model.size.z) * s * 0.5;
        sp.badge.position.set(sp.x + r * 0.8, sp.y + sp.model.size.y * s * 0.6 + 0.2, sp.z - r * 0.55);
        sp.badge.scale.set(0.64 * badgeScale, 0.36 * badgeScale, 1);
      }
    }
    for (const [model, b] of this.batches) {
      const c = cursor.get(model) ?? [0, 0];
      b.mesh.count = c[0];
      b.outline.count = c[1];
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      b.outline.instanceMatrix.needsUpdate = true;
    }
    this.shadows.count = si;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.rings.count = ri;
    this.rings.instanceMatrix.needsUpdate = true;
    this.bases.count = bi;
    this.bases.instanceMatrix.needsUpdate = true;
    if (this.bases.instanceColor) this.bases.instanceColor.needsUpdate = true;
  }

  // ---------- who holds what ----------

  /** Tints every territory in its holder's colour, so the front line reads at a glance. */
  setControl(control: Record<string, string | null>) {
    const first = this.political.size === 0;
    for (const id of Object.keys(TERR)) {
      const holder = control[id] ?? null;
      let entry = this.political.get(id);
      if (entry && entry.power === holder) continue;
      if (!entry) {
        entry = { meshes: [], power: null };
        for (const g of this.regionGeometry(id).fills) {
          const mesh = new THREE.Mesh(g, undefined);
          mesh.position.y = 0.004;
          mesh.renderOrder = 1;
          mesh.visible = false;
          this.politicalLayer.add(mesh);
          entry.meshes.push(mesh);
        }
        this.political.set(id, entry);
      }
      entry.power = holder;
      for (const mesh of entry.meshes) {
        mesh.visible = holder != null;
        if (holder) mesh.material = this.politicalMaterial(holder);
      }
      // a territory that changes hands flashes in its new colour
      if (!first && holder && entry.meshes.length) {
        const flash = new THREE.MeshBasicMaterial({ color: mapColor(holder), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
        const extra = entry.meshes.map((mesh) => {
          const copy = new THREE.Mesh(mesh.geometry, flash);
          copy.position.y = 0.008;
          copy.renderOrder = 2;
          this.politicalLayer.add(copy);
          return copy;
        });
        void this.tweens.run(1.1, (t) => { flash.opacity = 0.85 * (1 - t); this.dirty = true; }, ease.out).then(() => {
          for (const c of extra) this.politicalLayer.remove(c);
          flash.dispose();
        });
      }
    }
    this.dirty = true;
  }

  private politicalMaterial(power: string): THREE.MeshBasicMaterial {
    let m = this.politicalMats.get(power);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: mapColor(power), transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
      this.politicalMats.set(power, m);
    }
    return m;
  }

  /** Crisp borders over the print, drawn from the measured zones: dark on land, pale at sea. */
  private buildBorders() {
    const land: number[] = [];
    const sea: number[] = [];
    const add = (out: number[], ring: [number, number][]) => {
      for (let i = 0; i < ring.length; i++) {
        const p0 = px2r(ring[i][0], ring[i][1]);
        const p1 = px2r(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1]);
        out.push(p0[0], 0, p0[1], p1[0], 0, p1[1]);
      }
    };
    for (const id of [...Object.keys(TERR), ...Object.keys(ZONE)]) {
      const out = id.startsWith('sz-') ? sea : land;
      for (const ring of ringsOf(id) ?? []) add(out, ring);
    }
    const make = (pts: number[], color: number, opacity: number, width: number, y: number) => {
      const g = new LineSegmentsGeometry();
      g.setPositions(pts);
      const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false, toneMapped: false });
      mat.resolution.set(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight));
      this.borderMats.push(mat);
      const lines = new LineSegments2(g, mat);
      lines.position.y = y;
      lines.renderOrder = 1;
      lines.frustumCulled = false;
      this.scene.add(lines);
    };
    make(sea, 0xdfeaff, 0.34, 1.2, 0.0045);
    make(land, 0x05060a, 0.9, 1.8, 0.005);
  }

  // ---------- highlights ----------

  /** Lights the given spaces; with dim the rest of the board falls back. */
  setTargets(targets: { id: string; tone: Tone }[], dim: boolean) {
    this.targets = targets;
    this.veilTarget = dim && targets.length ? 0.42 : 0;
    this.rebuildHighlights();
  }

  setHover(id: string | null) {
    if (this.hover === id) return;
    this.hover = id;
    this.rebuildHighlights();
  }

  private regionGeometry(id: string) {
    let geo = this.regionGeo.get(id);
    if (geo) return geo;
    geo = { fills: [], lines: [] };
    const outline = (ring: [number, number][]) => {
      const pts: number[] = [];
      for (const [px, py] of ring) {
        const [x, z] = px2r(px, py);
        pts.push(x, 0, z);
      }
      const [x0, z0] = px2r(ring[0][0], ring[0][1]);
      pts.push(x0, 0, z0);
      const line = new LineGeometry();
      line.setPositions(pts);
      geo!.lines.push(line);
    };
    const path = <T extends THREE.Path>(target: T, ring: [number, number][]): T => {
      ring.forEach(([px, py], i) => {
        const [x, z] = px2r(px, py);
        if (i === 0) target.moveTo(x, -z);
        else target.lineTo(x, -z);
      });
      return target;
    };
    const holes = holesOf(id);
    for (const ring of ringsOf(id) ?? []) {
      const shape = path(new THREE.Shape(), ring);
      // an island inside a sea zone is a hole in its fill
      for (const hole of holes) if (pointInRing(hole[0], ring)) shape.holes.push(path(new THREE.Path(), hole));
      const fill = new THREE.ShapeGeometry(shape);
      fill.rotateX(-Math.PI / 2);
      geo.fills.push(fill);
      outline(ring);
    }
    for (const hole of holes) outline(hole);
    this.regionGeo.set(id, geo);
    return geo;
  }

  private rebuildHighlights() {
    this.highlightLayer.clear();
    const draw = (id: string, tone: Tone, hot: boolean) => {
      const geo = this.regionGeometry(id);
      const fk = `${tone}|${hot ? 1 : 0}`;
      let fill = this.fillMats.get(fk);
      if (!fill) {
        fill = new THREE.MeshBasicMaterial({ color: TONE_HEX[tone], transparent: true, opacity: TONE_FILL[tone] + (hot ? 0.22 : 0), depthWrite: false, toneMapped: false });
        this.fillMats.set(fk, fill);
      }
      let line = this.lineMats.get(fk);
      if (!line) {
        line = new LineMaterial({ color: TONE_HEX[tone], linewidth: hot ? 4 : tone === 'origin' ? 1.5 : 2.5, transparent: true, opacity: tone === 'origin' ? 0.5 : 0.95, depthWrite: false, toneMapped: false });
        line.resolution.set(this.host.clientWidth, this.host.clientHeight);
        this.lineMats.set(fk, line);
      }
      for (const g of geo.fills) {
        const mesh = new THREE.Mesh(g, fill);
        mesh.position.y = 0.01;
        mesh.renderOrder = 2;
        this.highlightLayer.add(mesh);
      }
      for (const g of geo.lines) {
        const l = new Line2(g, line);
        l.position.y = 0.016;
        l.renderOrder = 2;
        this.highlightLayer.add(l);
      }
    };
    const seen = new Set<string>();
    for (const t of this.targets) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      draw(t.id, t.tone, t.id === this.hover);
    }
    this.dirty = true;
  }

  // ---------- arrows ----------

  setArrows(arrows: StageArrow[]) {
    this.arrows = arrows;
    this.rebuildArrows();
  }

  private rebuildArrows() {
    for (const child of [...this.arrowLayer.children]) {
      this.arrowLayer.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
      ((child as THREE.Mesh).material as THREE.Material)?.dispose();
    }
    const anchor = (id: string): [number, number] => {
      const c = SPACE_CENTER[id] ?? [0, 0];
      return px2r(c[0], c[1] + 30);
    };
    for (const a of this.arrows) {
      if (!a.from.length) continue;
      this.addArrow(a.from.map(anchor), anchor(a.to), a.tone);
    }
    if (this.dragArrow) this.addArrow(this.dragArrow.from.map(anchor), this.dragArrow.to, this.dragArrow.tone);
    this.dirty = true;
  }

  /** A flat arrow drawn on the board. Several origins merge into one trunk. */
  private addArrow(from: [number, number][], to: [number, number], tone: Tone) {
    const strips: { pts: [number, number][]; w0: number; w1: number }[] = [];
    const curve = (a: [number, number], b: [number, number], bend: number, n = 28): [number, number][] => {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const cx = (a[0] + b[0]) / 2 - dz * bend;
      const cz = (a[1] + b[1]) / 2 + dx * bend;
      const out: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cz + t * t * b[1]]);
      }
      return out;
    };
    const cen: [number, number] = [from.reduce((s, p) => s + p[0], 0) / from.length, from.reduce((s, p) => s + p[1], 0) / from.length];
    const len = Math.hypot(to[0] - cen[0], to[1] - cen[1]);
    if (len < 0.3) return;
    const k = clamp(len / 7, 0.75, 1.9);
    const headL = 0.8 * k;
    const headW = 0.62 * k;
    const trunkW = (from.length > 1 ? 0.3 : 0.22) * k;
    let trunkStart = cen;
    if (from.length > 1) {
      trunkStart = [cen[0] + (to[0] - cen[0]) * 0.42, cen[1] + (to[1] - cen[1]) * 0.42];
      for (const o of from) strips.push({ pts: curve(o, trunkStart, 0.1), w0: 0.1 * k, w1: 0.18 * k });
    }
    const full = curve(trunkStart, to, from.length > 1 ? 0 : 0.12, 36);
    // stop the shaft where the head begins
    let cut = full.length - 1;
    let acc = 0;
    while (cut > 1 && acc < headL) { acc += Math.hypot(full[cut][0] - full[cut - 1][0], full[cut][1] - full[cut - 1][1]); cut--; }
    const shaft = full.slice(0, cut + 1);
    strips.push({ pts: shaft, w0: from.length > 1 ? trunkW * 0.8 : 0.08 * k, w1: trunkW });
    const base = shaft[shaft.length - 1];
    const tip = full[full.length - 1];
    const dir = norm([tip[0] - base[0], tip[1] - base[1]]);
    const side: [number, number] = [-dir[1], dir[0]];

    const build = (grow: number, y: number, color: number, opacity: number, order: number) => {
      const pos: number[] = [];
      for (const s of strips) {
        for (let i = 0; i < s.pts.length - 1; i++) {
          const a = s.pts[i];
          const b = s.pts[i + 1];
          const ta = norm([s.pts[Math.min(i + 1, s.pts.length - 1)][0] - s.pts[Math.max(i - 1, 0)][0], s.pts[Math.min(i + 1, s.pts.length - 1)][1] - s.pts[Math.max(i - 1, 0)][1]]);
          const tb = norm([s.pts[Math.min(i + 2, s.pts.length - 1)][0] - s.pts[i][0], s.pts[Math.min(i + 2, s.pts.length - 1)][1] - s.pts[i][1]]);
          const wa = (s.w0 + (s.w1 - s.w0) * (i / (s.pts.length - 1))) / 2 + grow;
          const wb = (s.w0 + (s.w1 - s.w0) * ((i + 1) / (s.pts.length - 1))) / 2 + grow;
          const al: [number, number] = [a[0] - ta[1] * wa, a[1] + ta[0] * wa];
          const ar: [number, number] = [a[0] + ta[1] * wa, a[1] - ta[0] * wa];
          const bl: [number, number] = [b[0] - tb[1] * wb, b[1] + tb[0] * wb];
          const br: [number, number] = [b[0] + tb[1] * wb, b[1] - tb[0] * wb];
          pos.push(al[0], y, al[1], bl[0], y, bl[1], ar[0], y, ar[1], ar[0], y, ar[1], bl[0], y, bl[1], br[0], y, br[1]);
        }
      }
      const hw = headW / 2 + grow * 1.6;
      const hb: [number, number] = [base[0] - dir[0] * grow, base[1] - dir[1] * grow];
      const ht: [number, number] = [tip[0] + dir[0] * grow * 1.6, tip[1] + dir[1] * grow * 1.6];
      pos.push(hb[0] + side[0] * hw, y, hb[1] + side[1] * hw, ht[0], y, ht[1], hb[0] - side[0] * hw, y, hb[1] - side[1] * hw);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      this.arrowLayer.add(mesh);
    };
    build(0.05 * k, 0.03, 0x000000, 0.7, 6);
    build(0, 0.036, TONE_HEX[tone], 0.96, 7);
  }

  // ---------- camera ----------

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const m of [...this.lineMats.values(), ...this.borderMats]) m.resolution.set(w, h);
    this.dirty = true;
  }

  /** Distance at which a ground area of this size fills the view. */
  private fitDist(width: number, depth: number): number {
    const v = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const h = v * this.camera.aspect;
    return Math.max(width / (2 * h), (depth * Math.sin(this.pitch)) / (2 * v));
  }

  private get maxDist() { return this.fitDist(MAP_W, MAP_D) * 1.04; }
  private get minDist() { return this.mode === 'screen' ? 9 : 6.5; }

  private applyCamera() {
    const c = this.cam;
    c.dist = clamp(c.dist, this.minDist, this.maxDist);
    // keep the board under the camera: the closer in, the further the centre may travel
    const k = 1 - c.dist / this.maxDist;
    const mx = (MAP_W / 2) * clamp(k * 1.25, 0, 1);
    const mz = (MAP_D / 2) * clamp(k * 1.35, 0, 1);
    c.x = clamp(c.x, MAP_W / 2 - mx, MAP_W / 2 + mx);
    c.z = clamp(c.z, -MAP_D / 2 - mz, -MAP_D / 2 + mz);
    this.camera.position.set(c.x, c.dist * Math.sin(this.pitch), c.z + c.dist * Math.cos(this.pitch));
    this.camera.lookAt(c.x, 0, c.z);
    this.camera.updateMatrixWorld();
  }

  /** The whole board. */
  home(instant = false) {
    return this.moveCamera(MAP_W / 2, -MAP_D / 2 + (this.mode === 'screen' ? 1.2 : 0), this.maxDist, instant ? 0 : 1.1);
  }

  /** Frames the given spaces. */
  flyTo(ids: string[], opts: { seconds?: number; pad?: number; maxDist?: number } = {}) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const b = id === MOB_ID ? null : regionBox(id);
      const c = SPACE_CENTER[id];
      // Regions that wrap the board edge have a box the width of the map: use their anchor.
      const box = b && b[2] - b[0] < ART_W * 0.5 ? b : c ? [c[0] - 260, c[1] - 220, c[0] + 260, c[1] + 220] : null;
      if (!box) continue;
      x0 = Math.min(x0, box[0]); y0 = Math.min(y0, box[1]); x1 = Math.max(x1, box[2]); y1 = Math.max(y1, box[3]);
    }
    if (!isFinite(x0)) return Promise.resolve();
    const pad = opts.pad ?? 1.9;
    const [cx, cz] = px2r((x0 + x1) / 2, (y0 + y1) / 2);
    const dist = Math.min(opts.maxDist ?? this.maxDist, Math.max(this.minDist * 1.6, this.fitDist((x1 - x0) * S * pad, (y1 - y0) * S * pad)));
    return this.moveCamera(cx, cz, dist, opts.seconds ?? 0.9);
  }

  private moveCamera(x: number, z: number, dist: number, seconds: number): Promise<void> {
    const c = this.cam;
    this.vel.x = this.vel.z = 0;
    if (seconds <= 0) {
      c.x = x; c.z = z; c.dist = dist;
      this.applyCamera();
      this.dirty = true;
      return Promise.resolve();
    }
    const from = { ...c };
    const token = ++this.flying;
    // Pull back a little on long hops so the move reads as travel, not a slide.
    const hop = Math.hypot(x - from.x, z - from.z);
    const lift = Math.min(this.maxDist - Math.max(from.dist, dist), hop * 0.35);
    return this.tweens.run(seconds, (t) => {
      if (token !== this.flying) return;
      c.x = from.x + (x - from.x) * t;
      c.z = from.z + (z - from.z) * t;
      c.dist = from.dist + (dist - from.dist) * t + Math.sin(t * Math.PI) * Math.max(0, lift);
      this.dirty = true;
    }, ease.inOut);
  }

  /** Screen position of a space, for interface anchored to the map. */
  screenOf(id: string): { x: number; y: number } | null {
    const c = SPACE_CENTER[id];
    if (!c) return null;
    const [x, z] = px2r(c[0], c[1]);
    const v = new V3(x, 0, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.host.clientWidth, y: (-v.y * 0.5 + 0.5) * this.host.clientHeight };
  }

  // ---------- pointer ----------

  private groundAt(clientX: number, clientY: number): [number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const p = new V3();
    return this.ray.ray.intersectPlane(this.ground, p) ? [p.x, p.z] : null;
  }

  private spaceAt(clientX: number, clientY: number): string | null {
    const g = this.groundAt(clientX, clientY);
    if (!g) return null;
    const [px, py] = r2px(g[0], g[1]);
    if (px < 0 || px > ART_W || py < 0 || py > ART_H) return null;
    return regionAt(px, py) ?? nearestSpace(px, py, 150);
  }

  private pieceAt(clientX: number, clientY: number): PieceHit | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    const v = new V3();
    const e = new V3();
    let best: Sprite | null = null;
    let bestScore = 1;
    for (const sp of this.sprites.values()) {
      if (!sp.spot || sp.space === MOB_ID) continue;
      const zs = clamp(this.cam.dist / 30, 1, 1.85);
      const h = sp.model.size.y * sp.scale * zs;
      v.set(sp.x, sp.y + h * 0.5, sp.z).project(this.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * r.width;
      const sy = (-v.y * 0.5 + 0.5) * r.height;
      const rad = Math.max(sp.model.size.x, sp.model.size.z) * sp.scale * zs * 0.5;
      e.set(sp.x + rad, sp.y + h * 0.5, sp.z).project(this.camera);
      const reach = Math.max(20, Math.abs((e.x * 0.5 + 0.5) * r.width - sx) * 1.15);
      const score = Math.hypot(mx - sx, my - sy) / reach;
      if (score < bestScore) { bestScore = score; best = sp; }
    }
    if (!best || !best.spot) return null;
    return {
      space: best.space, power: best.power, key: best.unit as UnitKey, stacked: best.spot.stacked,
      ordinals: best.spot.pieces.filter((p) => p.available && p.ordinal != null).map((p) => p.ordinal!),
      count: best.spot.pieces.length,
    };
  }

  private bindPointer(el: HTMLCanvasElement) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent) => {
    try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.flying++;
    this.vel.x = this.vel.z = 0;
    if (this.pointers.size === 2) {
      this.cancelPress();
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (this.pointers.size > 1) return;
    const hit = this.pieceAt(e.clientX, e.clientY);
    const press = { x: e.clientX, y: e.clientY, t: performance.now(), hit, moved: false, drag: false, pan: false, hold: 0 };
    if (hit && this.handlers.pieceHold) {
      press.hold = window.setTimeout(() => {
        if (this.press === press && !press.moved) {
          press.moved = true; // the hold was the gesture: no tap on release
          this.handlers.pieceHold?.(hit);
        }
      }, 430);
    }
    this.press = press;
  };

  private cancelPress() {
    if (!this.press) return;
    clearTimeout(this.press.hold);
    if (this.press.drag) {
      this.dragArrow = null;
      this.rebuildArrows();
      this.handlers.dragEnd?.(null);
    }
    this.press = null;
  }

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (this.pinch && this.pointers.size === 2) {
      this.pointers.set(e.pointerId, cur);
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const before = this.groundAt(this.pinch.cx, this.pinch.cy);
      this.cam.dist *= this.pinch.d / Math.max(1, d);
      this.applyCamera();
      const after = this.groundAt(cx, cy);
      if (before && after) { this.cam.x += before[0] - after[0]; this.cam.z += before[1] - after[1]; }
      this.pinch = { d, cx, cy };
      this.changed();
      return;
    }
    const p = this.press;
    if (!p) { this.pointers.set(e.pointerId, cur); return; }
    if (!p.drag && !p.pan && Math.hypot(cur.x - p.x, cur.y - p.y) > 9) {
      p.moved = true;
      clearTimeout(p.hold);
      const origins = p.hit ? this.handlers.dragStart?.(p.hit) ?? null : null;
      if (origins?.length) {
        p.drag = true;
        this.dragArrow = { from: origins, to: this.groundAt(cur.x, cur.y) ?? [0, 0], tone: 'move' };
      } else p.pan = true;
    }
    if (p.drag && this.dragArrow) {
      const g = this.groundAt(cur.x, cur.y);
      if (g) this.dragArrow.to = g;
      const space = this.spaceAt(cur.x, cur.y);
      const target = this.targets.find((t) => t.id === space && t.tone !== 'origin');
      this.dragArrow.tone = target ? target.tone : 'move';
      this.rebuildArrows();
      this.setHover(target ? space : null);
      this.handlers.dragMove?.(target ? space : null);
    } else if (p.pan) {
      const a = this.groundAt(prev.x, prev.y);
      const b = this.groundAt(cur.x, cur.y);
      if (a && b) {
        this.cam.x += a[0] - b[0];
        this.cam.z += a[1] - b[1];
        this.vel.x = (a[0] - b[0]) * 60;
        this.vel.z = (a[1] - b[1]) * 60;
        this.changed();
      }
    }
    this.pointers.set(e.pointerId, cur);
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size < 2) this.pinch = null;
    const p = this.press;
    if (!p || this.pointers.size > 0) return;
    clearTimeout(p.hold);
    this.press = null;
    if (p.drag) {
      const space = this.spaceAt(e.clientX, e.clientY);
      const ok = this.targets.some((t) => t.id === space && t.tone !== 'origin');
      this.dragArrow = null;
      this.rebuildArrows();
      this.setHover(null);
      this.handlers.dragEnd?.(ok ? space : null);
      return;
    }
    if (p.moved || e.type === 'pointercancel') return;
    if (p.hit) { this.handlers.pieceTap?.(p.hit); return; }
    const space = this.spaceAt(e.clientX, e.clientY);
    if (space) this.handlers.regionTap?.(space);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.flying++;
    const before = this.groundAt(e.clientX, e.clientY);
    this.cam.dist *= Math.exp(clamp(e.deltaY, -240, 240) * 0.0012);
    this.applyCamera();
    const after = this.groundAt(e.clientX, e.clientY);
    if (before && after) { this.cam.x += before[0] - after[0]; this.cam.z += before[1] - after[1]; }
    this.changed();
  };

  private changed() {
    this.dirty = true;
    this.instancesDirty = true; // badge size follows the zoom
    this.handlers.viewChange?.();
  }

  // ---------- hi-res tiles ----------

  private updateTiles() {
    if (!this.tiles.length) return;
    const close = this.cam.dist < this.maxDist * 0.5;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
      this.ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
      const p = new V3();
      return this.ray.ray.intersectPlane(this.ground, p) ? r2px(p.x, p.z) : null;
    });
    if (corners.some((c) => !c)) return;
    const xs = corners.map((c) => c![0]);
    const ys = corners.map((c) => c![1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const now = performance.now();
    let loading = this.tiles.filter((t) => t.loading).length;
    for (const t of this.tiles) {
      const visible = close && t.x < x1 && t.x + t.w > x0 && t.y < y1 && t.y + t.h > y0;
      if (visible) t.used = now;
      if (visible && !t.mesh && !t.loading && loading < 2) {
        t.loading = true;
        loading++;
        new THREE.TextureLoader().load(t.file, (tex) => {
          t.loading = false;
          if (this.disposed) { tex.dispose(); return; }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w * S, t.h * S), this.boardMaterial(tex));
          mesh.rotation.x = -Math.PI / 2;
          const [cx, cz] = px2r(t.x + t.w / 2, t.y + t.h / 2);
          mesh.position.set(cx, 0.002, cz);
          this.tileLayer.add(mesh);
          t.mesh = mesh;
          this.dirty = true;
        }, undefined, () => { t.loading = false; });
      }
    }
    // keep memory bounded on phones: drop the tiles looked at longest ago
    const live = this.tiles.filter((t) => t.mesh).sort((a, b) => a.used - b.used);
    const cap = this.mode === 'screen' ? 32 : 10;
    for (const t of live.slice(0, Math.max(0, live.length - cap))) {
      if (now - t.used < 4000) continue;
      this.tileLayer.remove(t.mesh!);
      ((t.mesh!.material as THREE.ShaderMaterial).uniforms.map.value as THREE.Texture).dispose();
      this.boardMats = this.boardMats.filter((bm) => bm !== t.mesh!.material);
      (t.mesh!.material as THREE.Material).dispose();
      t.mesh!.geometry.dispose();
      t.mesh = undefined;
    }
  }

  // ---------- frame ----------

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tweens.update(dt);
    if (this.tweens.busy) this.dirty = true;
    // glide after a flick
    if (!this.press && (Math.abs(this.vel.x) > 0.02 || Math.abs(this.vel.z) > 0.02)) {
      this.cam.x += this.vel.x * dt;
      this.cam.z += this.vel.z * dt;
      const damp = Math.exp(-dt * 6);
      this.vel.x *= damp;
      this.vel.z *= damp;
      this.changed();
    }
    const veil = this.veil.material as THREE.MeshBasicMaterial;
    if (Math.abs(veil.opacity - this.veilTarget) > 0.004) {
      veil.opacity += (this.veilTarget - veil.opacity) * Math.min(1, dt * 9);
      this.dirty = true;
    }
    if (!this.dirty && !this.instancesDirty) return;
    this.applyCamera();
    if (Math.abs(this.cam.dist - this.syncedDist) > this.syncedDist * 0.02) this.instancesDirty = true;
    this.outlineMat.uniforms.uWidth.value = clamp(this.cam.dist * 0.0015, 0.012, 0.08);
    if (this.instancesDirty) this.syncInstances();
    if (now - this.tileClock > 260) { this.tileClock = now; this.updateTiles(); }
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };

  /** The printed board, graded: a touch less saturated and a touch deeper, so pieces and colour
   *  overlays sit on it instead of fighting it. */
  private boardMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uSat: { value: 0.82 }, uGain: { value: 0.9 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D map; uniform float uSat; uniform float uGain; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(map, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat) * uGain;
          c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      toneMapped: false,
    });
    this.boardMats.push(mat);
    return mat;
  }

  private makeTableTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(256, 256, 20, 256, 256, 360);
    grad.addColorStop(0, '#15171c');
    grad.addColorStop(0.55, '#0a0b0e');
    grad.addColorStop(1, '#030304');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private makeShadowTexture(wide = false): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, wide ? 30 : 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,.85)');
    grad.addColorStop(wide ? 0.78 : 0.55, wide ? 'rgba(0,0,0,.8)' : 'rgba(0,0,0,.38)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.cancelPress();
    this.clearSprites();
    for (const b of this.batches.values()) { b.mesh.dispose(); b.outline.dispose(); }
    for (const g of this.regionGeo.values()) { g.fills.forEach((f) => f.dispose()); g.lines.forEach((l) => l.dispose()); }
    for (const t of this.badgeTex.values()) t.dispose();
    for (const m of [...this.fillMats.values(), ...this.lineMats.values(), ...this.politicalMats.values(), ...this.borderMats, ...this.boardMats]) m.dispose();
    this.bases.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) {
        m.geometry?.dispose();
        const mat = m.material as THREE.MeshBasicMaterial | THREE.Material[];
        for (const one of Array.isArray(mat) ? mat : [mat]) {
          (one as THREE.MeshBasicMaterial).map?.dispose();
          one?.dispose();
        }
      }
    });
    this.units.dispose();
    this.pieceMat.dispose();
    this.outlineMat.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function pointInRing(p: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function dist2(a: [number, number] | undefined, b: [number, number]): number {
  return a ? (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 : Infinity;
}
function norm(v: [number, number]): [number, number] {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}
