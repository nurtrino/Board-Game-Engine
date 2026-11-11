// The rifleman's movement. His model is rigid parts on pivots (rig.ts); this decides, every frame,
// how each part is turned: standing ready, running, aiming, firing, falling. Poses are plain tables
// of joint angles and the body eases from one to the next, so there are no clips to load.
//
// Angles are radians about the part's own axes, in the model's frame (y up, he faces +z, his left
// is +x). About x: positive tips a part's top forward, so a hanging limb swings back; a limb swings
// forward with negative x. About z: positive carries a hanging limb toward his left. About y:
// positive turns to his left.
import * as THREE from 'three';
import { euler, type BonePose, type RigState, type UnitRig } from './rig';

type Angles = readonly [number, number, number];
type Pose = Record<string, Angles>;

const HELMETS: Record<string, string> = { germany: 'a', china: 'a', italy: 'a', usa: 'b', ussr: 'b', japan: 'b', uk: 'c' };
export const helmetFor = (power: string): string => HELMETS[power] ?? 'b';

const BONES = ['pelvis', 'spine', 'head', 'upperarm.L', 'forearm.L', 'hand.L', 'upperarm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'] as const;

// rifle held across the chest, muzzle up to his left
const READY: Pose = {
  spine: [0.05, 0, 0], head: [0, 0, 0],
  'upperarm.R': [-0.25, 0, -0.18], 'forearm.R': [-1.75, 0, 0.55], 'hand.R': [0, 0, 0],
  'upperarm.L': [-0.85, 0, 0.1], 'forearm.L': [-1.35, 0, -0.75], 'hand.L': [0, 0, 0],
  'thigh.L': [-0.06, 0, 0.05], 'shin.L': [0.08, 0, 0], 'thigh.R': [0.05, 0, -0.05], 'shin.R': [0.06, 0, 0],
};
// standing, rifle in the shoulder
const AIM: Pose = {
  spine: [0.1, -0.32, 0], head: [0.08, 0.26, -0.12],
  'upperarm.R': [-1.0, 0, -0.75], 'forearm.R': [-1.9, 0, 0.5], 'hand.R': [0, 0, 0],
  'upperarm.L': [-1.32, 0, -0.42], 'forearm.L': [-0.5, 0, 0], 'hand.L': [0, 0, 0],
  'thigh.L': [-0.3, 0, 0.08], 'shin.L': [0.22, 0, 0], 'thigh.R': [0.24, 0, -0.1], 'shin.R': [0.2, 0, 0],
};
// down on the right knee
const KNEEL: Pose = {
  spine: [0.14, -0.3, 0], head: [0.04, 0.24, -0.12],
  'upperarm.R': [-1.0, 0, -0.75], 'forearm.R': [-1.9, 0, 0.5],
  'upperarm.L': [-1.05, 0, -0.4], 'forearm.L': [-0.85, 0, 0],
  'thigh.L': [-1.5, 0, 0.1], 'shin.L': [1.5, 0, 0], 'foot.L': [0, 0, 0],
  'thigh.R': [0.12, 0, -0.08], 'shin.R': [1.62, 0, 0], 'foot.R': [0.85, 0, 0],
};
// on his back, limbs where they fell
const DOWN_BACK: Pose = {
  pelvis: [-1.5, 0, 0], spine: [-0.08, 0.1, 0.06], head: [-0.2, 0.5, 0],
  'upperarm.R': [0.2, 0, -1.25], 'forearm.R': [-0.5, 0, 0], 'upperarm.L': [-0.25, 0, 0.85], 'forearm.L': [-0.9, 0, 0],
  'thigh.L': [-0.12, 0, 0.3], 'shin.L': [0.5, 0, 0], 'thigh.R': [0.02, 0, -0.16], 'shin.R': [0.1, 0, 0],
};
// on his face
const DOWN_FRONT: Pose = {
  pelvis: [1.5, 0, 0], spine: [0.1, -0.12, 0], head: [0.1, -0.7, 0],
  'upperarm.R': [-2.3, 0, -0.5], 'forearm.R': [-0.7, 0, 0], 'upperarm.L': [-0.3, 0, 0.7], 'forearm.L': [-1.0, 0, 0],
  'thigh.L': [0.1, 0, 0.22], 'shin.L': [0.15, 0, 0], 'thigh.R': [-0.25, 0, -0.2], 'shin.R': [0.7, 0, 0],
};

// The rifle is carried by the chest, not the hand: the hands are posed to meet it.
// [position in the chest's frame (metres), angles]
const RIFLE: Record<string, { t: readonly [number, number, number]; r: Angles }> = {
  ready: { t: [-0.1, 0.2, 0.2], r: [0.3, 0, -0.85] },
  aim: { t: [-0.17, 0.38, 0.17], r: [Math.PI / 2 - 0.02, 0.3, 0] },
  down: { t: [-0.55, -0.1, 0.3], r: [Math.PI / 2, 0, 1.2] },
};

const HIP_DROP_KNEEL = 0.44;
const HIP_DROP_DOWN = 0.8;

export interface SoldierInput {
  /** 0 standing still .. 1 at a run. */
  moving: number;
  /** 0 standing .. 1 fallen. */
  death: number;
  dying: boolean;
  seed: number;
}

export class Soldier {
  private pose = new Map<string, BonePose>();
  private want = new THREE.Quaternion();
  private aiming = false;
  private kick = 0;
  private stride = Math.random() * 6;
  private drop = 0;
  private rifle: BonePose = { q: new THREE.Quaternion(), t: new THREE.Vector3(), from: 'spine' };
  private rifleQ = new THREE.Quaternion();
  private rifleT = new THREE.Vector3();
  private kneels: boolean;
  private fallsBack: boolean;

  constructor(rig: UnitRig, rs: RigState) {
    for (const b of BONES) this.pose.set(b, { q: new THREE.Quaternion() });
    this.pose.get('pelvis')!.t = new THREE.Vector3();
    // the model's rest rifle is upright at his side: start it where "ready" holds it
    const r = RIFLE.ready;
    this.rifle.q.copy(euler(r.r[0], r.r[1], r.r[2]));
    this.rifle.t!.set(r.t[0], r.t[1], r.t[2]);
    if (rig.byName.has('spine')) this.pose.set('rifle', this.rifle);
    rs.bones = this.pose;
    this.kneels = Math.random() < 0.45;
    this.fallsBack = Math.random() < 0.6;
  }

  /** Bring the rifle up (a point to aim at) or lower it (null). */
  aim(to: THREE.Vector3 | null) { this.aiming = to != null; }
  shoot() { this.kick = 1; }

  update(dt: number, t: number, input: SoldierInput) {
    const down = input.dying ? Math.min(1, input.death * 1.15) : 0;
    const running = input.moving > 0.05 && down === 0;
    const base = down > 0 ? (this.fallsBack ? DOWN_BACK : DOWN_FRONT) : this.aiming && !running ? (this.kneels ? KNEEL : AIM) : READY;
    if (running) this.stride += dt * (7.5 + input.moving * 3.5);
    const ph = this.stride;
    const rate = down > 0 ? 7 : 9;
    const k = 1 - Math.exp(-dt * rate);
    this.kick = Math.max(0, this.kick - dt * 5);
    const breathe = Math.sin(t * 1.3 + input.seed) * 0.012;

    for (const b of BONES) {
      const a = base[b] ?? ZERO;
      let x = a[0], y = a[1], z = a[2];
      if (running) {
        const amp = 0.55 + input.moving * 0.35;
        if (b === 'thigh.L') x = -0.25 - Math.sin(ph) * amp;
        else if (b === 'thigh.R') x = -0.25 + Math.sin(ph) * amp;
        else if (b === 'shin.L') x = 0.35 + Math.max(0, Math.cos(ph)) * 1.15;
        else if (b === 'shin.R') x = 0.35 + Math.max(0, -Math.cos(ph)) * 1.15;
        else if (b === 'spine') { x = 0.22 + input.moving * 0.12; y = Math.sin(ph) * 0.1; }
        else if (b === 'head') x = -0.16;
        else if (b === 'pelvis') y = -Math.sin(ph) * 0.08;
      } else if (down === 0) {
        if (b === 'spine') x += breathe - this.kick * 0.05;
        if (b === 'upperarm.R') x += this.kick * 0.05;
      }
      if (down > 0 && b === 'pelvis') { x *= ease(down); }
      const bone = this.pose.get(b)!;
      euler(x, y, z, this.want);
      // the fall follows the stage's clock exactly; everything else eases
      if (down > 0 && b === 'pelvis') bone.q.copy(this.want);
      else bone.q.slerp(this.want, k);
    }

    // hips: down for a kneel, to the ground for the fallen, bobbing at a run
    const wantDrop = down > 0 ? HIP_DROP_DOWN * ease(down) : this.aiming && this.kneels && !running ? HIP_DROP_KNEEL : 0;
    this.drop = down > 0 ? wantDrop : this.drop + (wantDrop - this.drop) * k;
    const pelvis = this.pose.get('pelvis')!;
    pelvis.t!.set(0, -this.drop + (running ? Math.abs(Math.sin(ph)) * 0.05 : 0), 0);

    const r = down > 0.3 ? RIFLE.down : this.aiming && !running ? RIFLE.aim : RIFLE.ready;
    euler(r.r[0], r.r[1], r.r[2], this.rifleQ);
    this.rifleT.set(r.t[0], r.t[1], r.t[2] - (down > 0 ? 0 : this.kick * 0.05));
    this.rifle.q.slerp(this.rifleQ, k);
    this.rifle.t!.lerp(this.rifleT, k);
  }
}

const ZERO: Angles = [0, 0, 0];
const ease = (v: number) => v * v * (3 - 2 * v);
