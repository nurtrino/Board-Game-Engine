// Feeds engine snapshots to the stage as an ordered queue of beats.
// The director never blocks anything: the interface renders from state on its own, and every beat
// is raced against a clock, so a slow GPU, a hidden tab or a lost frame can delay the picture but
// never the game. After the queue drains the stage is snapped to the engine's exact state.
import { pendingHits, planBeats, snapshotOf, type Beat, type Snapshot } from './timeline';
import type { Combat, Side } from './model';

type Of<T extends Beat['type']> = Extract<Beat, { type: T }>;

/** The part of the 3D stage the director drives. A fake stands in for it in tests. */
export interface StagePort {
  build(combat: Combat): Promise<boolean>;
  sync(combat: Combat): void;
  setPending(side: Side, hits: number): void;
  skip(): void;
  playOpen(): Promise<void>;
  playVolley(beat: Of<'volley'>): Promise<void>;
  playCasualties(beat: Of<'casualties'>): Promise<void>;
  playSubmerge(beat: Of<'submerge'>): Promise<void>;
  playRetreat(beat: Of<'retreat'>): Promise<void>;
  playDrop(beat: Of<'drop'>): Promise<void>;
  playResult(): Promise<void>;
}

export interface DirectorOptions {
  /** Longest a single beat may hold the queue. */
  beatTimeoutMs?: number;
  /** Queue length beyond which the stage stops replaying and jumps to the present. */
  maxQueue?: number;
  onPhase?: (phase: 'loading' | 'ready' | 'failed') => void;
  /** Called as each beat starts, for captions. */
  onBeat?: (beat: Beat | null) => void;
}

export class Director {
  private prev: Snapshot | null = null;
  private latest: Combat | null = null;
  private queue: Beat[] = [];
  private running = false;
  private gen = 0;
  private built: number | null = null;
  private dead = false;
  private readonly timeout: number;
  private readonly maxQueue: number;

  constructor(private stage: StagePort, private opts: DirectorOptions = {}) {
    this.timeout = opts.beatTimeoutMs ?? 7000;
    this.maxQueue = opts.maxQueue ?? 10;
  }

  /** Give the director the newest view.combat. Call it for every snapshot, in arrival order. */
  ingest(combat: Combat) {
    if (this.dead) return;
    const plan = planBeats(this.prev, combat);
    this.prev = snapshotOf(combat);
    this.latest = combat;
    if (plan.reason === 'first' || plan.reason === 'new-combat') {
      void this.open(combat);
      return;
    }
    // Still loading this battle: the build ends by snapping to the latest state, nothing to queue.
    if (this.built !== combat.id) return;
    if (plan.snap) {
      this.queue = [...plan.beats];
      this.stage.skip();
      this.stage.sync(combat);
      this.markPending();
    } else {
      this.queue.push(...plan.beats);
    }
    if (this.queue.length > this.maxQueue) this.collapse();
    void this.run();
  }

  /** Drop everything in flight and show the present. For a tab that was hidden, or a manual skip. */
  catchUp() {
    if (this.dead) return;
    this.queue = [];
    this.stage.skip();
    if (this.latest && this.built === this.latest.id) {
      this.stage.sync(this.latest);
      this.markPending();
    }
    this.opts.onBeat?.(null);
  }

  dispose() {
    this.dead = true;
    this.gen += 1;
    this.queue = [];
  }

  private collapse() {
    const kept: Beat[] = [];
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].type === 'volley') { kept.push(this.queue[i]); break; }
    }
    const last = this.queue[this.queue.length - 1];
    if (last?.type === 'result') kept.push(last);
    this.queue = kept;
    this.stage.skip();
    if (this.latest) this.stage.sync(this.latest);
    this.markPending();
  }

  private async open(combat: Combat) {
    const gen = ++this.gen;
    this.queue = [];
    this.built = null;
    this.stage.skip();
    this.opts.onPhase?.('loading');
    let ok = false;
    try {
      ok = await this.stage.build(combat);
    } catch (error) {
      console.error('[battle] the battlefield could not be built', error);
      if (gen === this.gen && !this.dead) this.opts.onPhase?.('failed');
      return;
    }
    if (gen !== this.gen || this.dead || !ok) return;
    this.built = combat.id;
    if (this.latest && this.latest.id === combat.id) this.stage.sync(this.latest);
    this.markPending();
    this.opts.onPhase?.('ready');
    this.queue.unshift({ type: 'open' });
    void this.run();
  }

  private markPending() {
    const hits = this.latest ? pendingHits(this.latest.battle) : [];
    for (const side of ['attacker', 'defender'] as Side[]) {
      this.stage.setPending(side, hits.find((h) => h.side === side)?.hits ?? 0);
    }
  }

  private play(beat: Beat): Promise<void> {
    switch (beat.type) {
      case 'open': return this.stage.playOpen();
      case 'volley': return this.stage.playVolley(beat);
      case 'casualties': return this.stage.playCasualties(beat);
      case 'submerge': return this.stage.playSubmerge(beat);
      case 'retreat': return this.stage.playRetreat(beat);
      case 'drop': return this.stage.playDrop(beat);
      case 'result': return this.stage.playResult();
      default: return Promise.resolve();
    }
  }

  /** A beat may take as long as it likes up to the limit; past that the stage is told to finish it. */
  private guard(work: Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (late: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (late && !this.dead) this.stage.skip();
        resolve();
      };
      const timer = setTimeout(() => finish(true), this.timeout);
      work.then(() => finish(false), (error) => {
        console.error('[battle] a beat failed', error);
        finish(false);
      });
    });
  }

  private async run() {
    if (this.running || this.dead) return;
    this.running = true;
    const gen = this.gen;
    try {
      while (this.queue.length > 0 && gen === this.gen && !this.dead) {
        const beat = this.queue.shift()!;
        this.opts.onBeat?.(beat);
        let work: Promise<void>;
        try { work = this.play(beat); } catch (error) { console.error('[battle] a beat failed', error); continue; }
        await this.guard(work);
      }
    } finally {
      this.running = false;
    }
    if (this.dead) return;
    if (gen !== this.gen) {
      // a new battle opened mid-run; its own beats may already be waiting
      if (this.queue.length > 0) void this.run();
      return;
    }
    this.opts.onBeat?.(null);
    if (this.latest && this.built === this.latest.id) {
      this.stage.sync(this.latest);
      this.markPending();
    }
  }
}
