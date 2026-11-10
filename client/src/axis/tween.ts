// Frame-driven tweens with promises, so cutscenes read as plain async scripts.
export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  in: (t: number) => t * t * t,
  inQuint: (t: number) => t * t * t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  // Lands hard and settles: for cards and placards hitting the table.
  slam: (t: number) => (t < 0.82 ? Math.pow(t / 0.82, 3) : 1 + Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.035 * (1 - (t - 0.82) / 0.18)),
};

interface Active {
  t: number;
  dur: number;
  fn: (k: number) => void;
  ease: Ease;
  done: () => void;
}

export class Tweens {
  private active: Active[] = [];
  // When set, every tween and wait finishes at once. Used to skip a cutscene.
  fast = false;

  run(seconds: number, fn: (k: number) => void, e: Ease = ease.inOut): Promise<void> {
    if (this.fast || seconds <= 0) {
      fn(1);
      return Promise.resolve();
    }
    return new Promise((done) => {
      fn(e(0));
      this.active.push({ t: 0, dur: seconds, fn, ease: e, done });
    });
  }

  wait(seconds: number): Promise<void> {
    return this.run(seconds, () => {}, ease.linear);
  }

  /** True while anything is still animating. */
  get busy() {
    return this.active.length > 0;
  }

  update(dt: number) {
    if (!this.active.length) return;
    const list = this.active;
    this.active = [];
    for (const a of list) {
      a.t += this.fast ? Infinity : dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(a.ease(k));
      if (k >= 1) a.done();
      else this.active.push(a);
    }
  }

  flush() {
    const list = this.active;
    this.active = [];
    for (const a of list) {
      a.fn(1);
      a.done();
    }
  }
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
