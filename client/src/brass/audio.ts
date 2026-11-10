// Brass: Birmingham sound. Everything is synthesised with WebAudio, so there
// are no files to load and nothing depends on a codec (iPad Safari will not
// decode the Ogg clips the hub uses). The palette is the game's own world:
// anvils, coal, steam, canal water, coins, paper, a works bell.
//
// The big screen is the table and voices what happens on it. Devices only make
// the small sounds of their own player's hands. Mute is shared with the hub.

import { sfxEnabled, setSfxEnabled } from '../sfx';

/** [frequency ratio, relative gain, decay seconds] */
type Partial3 = [number, number, number];

const ANVIL: Partial3[] = [[1, 1, 0.9], [2.76, 0.55, 0.6], [5.4, 0.32, 0.34], [8.93, 0.16, 0.2]];
const CHIME: Partial3[] = [[1, 1, 0.8], [2.76, 0.32, 0.34], [5.4, 0.1, 0.16]];
const COIN: Partial3[] = [[1, 1, 0.12], [1.48, 0.7, 0.1], [2.31, 0.45, 0.07]];
const CERAMIC: Partial3[] = [[1, 1, 0.24], [2.3, 0.5, 0.16], [3.9, 0.25, 0.1]];
const BELL: Partial3[] = [
  [0.5, 0.5, 3.2], [1, 1, 2.6], [1.19, 0.7, 2.1], [1.5, 0.4, 1.7], [2, 0.5, 1.4],
  [2.51, 0.3, 1.0], [2.66, 0.25, 0.9], [3.01, 0.2, 0.7], [4.1, 0.12, 0.5],
];
const REGISTER: Partial3[] = [[1, 1, 1.0], [1.5, 0.5, 0.75], [2.01, 0.6, 0.6], [2.76, 0.3, 0.4]];

// One two-note call per seat, so the table learns whose turn it is by ear.
const SEAT_CALL: [number, number][] = [[392, 523.25], [440, 587.33], [493.88, 659.25], [523.25, 783.99]];

class BrassAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  private bed: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private armed = false;

  get muted() { return !sfxEnabled(); }

  /** Listen for the first gestures and start the audio clock on them. */
  arm() {
    if (this.armed || typeof window === 'undefined') return;
    this.armed = true;
    const go = () => this.unlock();
    window.addEventListener('pointerdown', go, { passive: true });
    window.addEventListener('keydown', go);
    window.addEventListener('touchend', go, { passive: true });
  }

  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      this.master.connect(comp).connect(ctx.destination);
      // A brick workshop: short, dense tail.
      const len = Math.floor(ctx.sampleRate * 1.7);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
      }
      this.verb = ctx.createConvolver();
      this.verb.buffer = ir;
      const verbGain = ctx.createGain();
      verbGain.gain.value = 0.3;
      this.verb.connect(verbGain).connect(this.master);
      const nlen = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => { /* needs a gesture */ });
  }

  setMuted(m: boolean) {
    setSfxEnabled(!m);
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.04);
  }

  // ---------- primitives ----------

  private get live() { return !!this.ctx && this.ctx.state === 'running' && !this.muted; }

  /** A voice bus: dry to the master, with an optional send to the room. */
  private bus(wet = 0.2, gain = 1): GainNode | null {
    if (!this.live) return null;
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      g.connect(send).connect(this.verb);
    }
    return g;
  }

  private tone(type: OscillatorType, freq: number, t0: number, dur: number, peak: number, dest: AudioNode,
    o: { to?: number; attack?: number; detune?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (o.attack ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(t0: number, dur: number, peak: number, dest: AudioNode,
    o: { type?: BiquadFilterType; from?: number; to?: number; q?: number; attack?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.from ?? 2000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  /** Struck metal, glass or clay: a set of inharmonic partials ringing down. */
  private struck(t0: number, base: number, partials: Partial3[], peak: number, dest: AudioNode, stretch = 1) {
    for (const [ratio, gain, decay] of partials) {
      this.tone('sine', base * ratio, t0, decay * stretch, peak * gain, dest, { attack: 0.002 });
    }
  }

  private now() { return this.ctx!.currentTime; }

  // ---------- hands (devices) ----------

  tap() {
    const d = this.bus(0, 0.9); if (!d) return;
    this.tone('triangle', 1150, this.now(), 0.045, 0.09, d, { to: 760 });
  }
  back() {
    const d = this.bus(0, 0.9); if (!d) return;
    this.tone('triangle', 720, this.now(), 0.06, 0.07, d, { to: 480 });
  }
  deny() {
    const d = this.bus(0); if (!d) return;
    const t = this.now();
    this.tone('square', 168, t, 0.09, 0.06, d, { to: 150 });
    this.tone('square', 140, t + 0.1, 0.14, 0.06, d, { to: 112 });
  }
  /** A card leaving or landing: paper, not a beep. */
  card(delay = 0) {
    const d = this.bus(0.08); if (!d) return;
    const t = this.now() + delay;
    this.noise(t, 0.075, 0.16, d, { type: 'bandpass', from: 1800, to: 5200, q: 0.9, attack: 0.012 });
    this.tone('sine', 240, t + 0.05, 0.05, 0.05, d, { to: 150 });
  }
  /** Commit: something set down firmly. */
  confirm() {
    const d = this.bus(0.12); if (!d) return;
    const t = this.now();
    this.tone('sine', 190, t, 0.16, 0.3, d, { to: 82 });
    this.noise(t, 0.04, 0.12, d, { from: 2400, to: 500 });
    this.tone('triangle', 880, t + 0.02, 0.07, 0.04, d);
  }
  /** A legal spot tapped on the map. */
  target() {
    const d = this.bus(0.1); if (!d) return;
    const t = this.now();
    this.tone('sine', 660, t, 0.06, 0.08, d);
    this.tone('sine', 990, t + 0.055, 0.09, 0.07, d);
  }
  yourTurn(seat = 0) {
    const d = this.bus(0.35); if (!d) return;
    const t = this.now();
    const [a, b] = SEAT_CALL[seat % SEAT_CALL.length];
    this.struck(t, a, CHIME, 0.16, d);
    this.struck(t + 0.16, b, CHIME, 0.18, d);
    this.struck(t + 0.34, b * 1.5, CHIME, 0.1, d);
  }

  // ---------- the table (big screen) ----------

  whoosh(dur = 0.6, gain = 0.12) {
    const d = this.bus(0.2); if (!d) return;
    this.noise(this.now(), dur, gain, d, { type: 'bandpass', from: 260, to: 2400, q: 1.3, attack: dur * 0.5 });
  }

  /** A tile hitting the board, then the sound of what it is. */
  slam(industry = '') {
    const d = this.bus(0.3); if (!d) return;
    const t = this.now();
    this.tone('sine', 118, t, 0.42, 0.62, d, { to: 38, attack: 0.002 });
    this.noise(t, 0.11, 0.3, d, { from: 2600, to: 240 });
    const at = t + 0.09;
    if (industry.startsWith('Coal')) {
      // loose coal settling
      for (let i = 0; i < 7; i++) {
        this.noise(at + i * 0.05 + Math.random() * 0.03, 0.07, 0.1 - i * 0.01, d, { type: 'bandpass', from: 500 + Math.random() * 600, q: 1.6 });
      }
      this.tone('sine', 58, at, 0.5, 0.2, d, { to: 40 });
    } else if (industry.startsWith('Iron')) {
      this.struck(at, 640, ANVIL, 0.2, d);
      this.struck(at + 0.21, 655, ANVIL, 0.09, d, 0.7);
    } else if (industry.startsWith('Brewery')) {
      this.barrel(0.09);
    } else if (industry.startsWith('Cotton')) {
      // shuttle and frame
      for (let i = 0; i < 6; i++) {
        this.noise(at + i * 0.065, 0.028, 0.12, d, { type: 'bandpass', from: i % 2 ? 1900 : 1350, q: 5 });
      }
    } else if (industry.startsWith('Pottery')) {
      this.struck(at, 1850, CERAMIC, 0.14, d);
      this.struck(at + 0.12, 2250, CERAMIC, 0.08, d);
    } else if (industry.startsWith('Manufacturer')) {
      this.struck(at, 340, ANVIL, 0.12, d, 0.6);
      this.noise(at + 0.05, 0.5, 0.07, d, { type: 'highpass', from: 3200, attack: 0.03 });
    }
  }

  /** A resource cube set down or picked up. */
  cube(kind: 'coal' | 'iron' = 'coal', delay = 0) {
    const d = this.bus(0.12); if (!d) return;
    const t = this.now() + delay;
    if (kind === 'iron') {
      this.struck(t, 2300 + Math.random() * 300, [[1, 1, 0.16], [2.7, 0.4, 0.09]], 0.07, d);
    } else {
      this.tone('sine', 430, t, 0.05, 0.13, d, { to: 250 });
      this.noise(t, 0.03, 0.06, d, { from: 1300 });
    }
  }

  barrel(delay = 0) {
    const d = this.bus(0.2); if (!d) return;
    const t = this.now() + delay;
    this.tone('sine', 196, t, 0.14, 0.26, d, { to: 132 });
    this.noise(t, 0.05, 0.08, d, { type: 'bandpass', from: 320, q: 2 });
    this.tone('sine', 176, t + 0.12, 0.16, 0.16, d, { to: 120 });
  }

  /** A tile turning over, then the till. */
  flip() {
    const d = this.bus(0.2); if (!d) return;
    const t = this.now();
    // the tile takes 0.72s to turn: air on the way over, wood when it lands
    this.noise(t, 0.55, 0.1, d, { type: 'bandpass', from: 500, to: 3000, q: 1.2, attack: 0.3 });
    this.tone('sine', 150, t + 0.7, 0.2, 0.3, d, { to: 60 });
    this.noise(t + 0.7, 0.05, 0.14, d, { from: 2000, to: 400 });
  }
  register(delay = 0) {
    const d = this.bus(0.4); if (!d) return;
    const t = this.now() + delay;
    this.noise(t, 0.03, 0.12, d, { type: 'bandpass', from: 950, q: 3 });
    this.noise(t + 0.07, 0.03, 0.1, d, { type: 'bandpass', from: 1300, q: 3 });
    this.struck(t + 0.13, 2090, REGISTER, 0.13, d);
  }

  coins(n = 4, delay = 0) {
    const d = this.bus(0.18); if (!d) return;
    let t = this.now() + delay;
    const count = Math.max(1, Math.min(10, n));
    for (let i = 0; i < count; i++) {
      this.struck(t, 3700 + Math.random() * 1600, COIN, 0.075, d);
      t += 0.045 + Math.random() * 0.04;
    }
  }

  canal() {
    const d = this.bus(0.3); if (!d) return;
    const t = this.now();
    this.noise(t, 0.6, 0.2, d, { type: 'bandpass', from: 1100, to: 280, q: 0.9, attack: 0.02 });
    for (let i = 0; i < 5; i++) {
      const at = t + 0.08 + Math.random() * 0.4;
      this.tone('sine', 380 + Math.random() * 300, at, 0.05, 0.05, d, { to: 800 + Math.random() * 500 });
    }
    this.tone('sine', 150, t + 0.02, 0.14, 0.2, d, { to: 90 });
  }

  rail() {
    const d = this.bus(0.25); if (!d) return;
    const t = this.now();
    for (const at of [0, 0.14]) {
      this.struck(t + at, 880, [[1, 1, 0.12], [2.4, 0.6, 0.08], [4.2, 0.3, 0.05]], 0.14, d);
      this.tone('sine', 120, t + at, 0.09, 0.2, d, { to: 70 });
    }
    this.whistle(0.62, 0.3);
  }

  whistle(dur = 0.9, delay = 0, gain = 0.07) {
    const d = this.bus(0.55); if (!d) return;
    const ctx = this.ctx!;
    const t = this.now() + delay;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 0.7;
    f.connect(d);
    for (const hz of [587.33, 698.46, 880]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz * 0.94, t);
      osc.frequency.exponentialRampToValueAtTime(hz, t + 0.12);
      osc.frequency.setValueAtTime(hz, t + dur - 0.14);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.97, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.07);
      g.gain.setValueAtTime(gain, t + dur - 0.16);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(f);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
    this.noise(t, dur, gain * 0.9, d, { type: 'bandpass', from: 2600, q: 0.8, attack: 0.05 });
  }

  steam(dur = 0.9, delay = 0, gain = 0.1) {
    const d = this.bus(0.3); if (!d) return;
    this.noise(this.now() + delay, dur, gain, d, { type: 'highpass', from: 2400, to: 5000, attack: 0.04 });
  }

  loan() {
    const d = this.bus(0.15); if (!d) return;
    const t = this.now();
    this.noise(t, 0.22, 0.1, d, { type: 'bandpass', from: 2400, to: 4200, q: 0.8, attack: 0.1 });
    this.tone('sine', 170, t + 0.24, 0.18, 0.34, d, { to: 70 });
    this.noise(t + 0.24, 0.05, 0.14, d, { from: 1800, to: 300 });
    this.coins(7, 0.42);
  }

  scout() {
    if (!this.live) return;
    this.card(0); this.card(0.11); this.card(0.22);
    const d = this.bus(0.1); if (!d) return;
    let t = this.now() + 0.42;
    for (let i = 0; i < 12; i++) {
      this.noise(t, 0.018, 0.07, d, { type: 'highpass', from: 3000 });
      t += 0.03 - i * 0.0012;
    }
  }

  pass() {
    const d = this.bus(0.3); if (!d) return;
    const t = this.now();
    this.tone('sine', 329.63, t, 0.22, 0.06, d);
    this.tone('sine', 261.63, t + 0.17, 0.32, 0.06, d);
  }

  /** A marker moving one space along the track. */
  step(n = 0) {
    const d = this.bus(0.08); if (!d) return;
    const t = this.now();
    this.tone('sine', 820 + (n % 7) * 26, t, 0.03, 0.045, d, { to: 560 });
    this.noise(t, 0.012, 0.025, d, { type: 'highpass', from: 2600 });
  }

  /** A wooden piece set on the board. */
  knock(delay = 0, gain = 0.2) {
    const d = this.bus(0.2); if (!d) return;
    const t = this.now() + delay;
    this.tone('sine', 300, t, 0.07, gain, d, { to: 150 });
    this.noise(t, 0.025, gain * 0.4, d, { from: 1600 });
  }

  turn(seat = 0) {
    const d = this.bus(0.4); if (!d) return;
    const t = this.now();
    const [a, b] = SEAT_CALL[seat % SEAT_CALL.length];
    this.struck(t, a, CHIME, 0.13, d);
    this.struck(t + 0.17, b, CHIME, 0.15, d);
  }

  /** The works bell: a round begins. */
  bell(delay = 0, gain = 0.15) {
    const d = this.bus(0.55); if (!d) return;
    const t = this.now() + delay;
    this.noise(t, 0.03, gain * 0.6, d, { type: 'bandpass', from: 1800, q: 1.5 });
    this.struck(t, 233.08, BELL, gain, d);
  }

  /** One count of a tally, climbing as it goes. */
  tally(i = 0) {
    const d = this.bus(0.1); if (!d) return;
    const t = this.now();
    this.tone('triangle', 520 + Math.min(i, 40) * 14, t, 0.04, 0.05, d);
  }
  tallyDone() {
    const d = this.bus(0.35); if (!d) return;
    this.struck(this.now(), 1046.5, CHIME, 0.12, d);
  }

  private pad(t: number, freqs: number[], dur: number, gain: number, dest: AudioNode, bright = 1800) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(bright, t + Math.min(0.5, dur * 0.3));
    f.frequency.exponentialRampToValueAtTime(380, t + dur);
    f.connect(dest);
    for (const hz of freqs) {
      this.tone('sawtooth', hz, t, dur, gain, f, { attack: 0.05, detune: -7 });
      this.tone('sawtooth', hz, t, dur, gain * 0.85, f, { attack: 0.05, detune: 8 });
    }
  }

  /** An era closes: weight, then the bell. */
  eraEnd() {
    const d = this.bus(0.6); if (!d) return;
    const t = this.now();
    this.tone('sine', 74, t, 1.4, 0.7, d, { to: 27, attack: 0.003 });
    this.noise(t, 0.4, 0.35, d, { from: 3200, to: 140 });
    this.pad(t + 0.05, [73.42, 110, 146.83, 174.61], 3.4, 0.05, d, 1200);
    this.bell(0.5, 0.17);
  }

  /** Steam up: the railways arrive. */
  eraRail() {
    const d = this.bus(0.4); if (!d) return;
    const t = this.now();
    this.steam(1.3, 0, 0.12);
    this.whistle(0.5, 0.5, 0.075);
    this.whistle(1.2, 1.12, 0.085);
    let at = 2.5;
    let gap = 0.42;
    for (let i = 0; i < 9; i++) {
      this.noise(t + at, 0.16, 0.16 - i * 0.008, d, { type: 'bandpass', from: 420, q: 0.9, attack: 0.02 });
      this.tone('sine', 62, t + at, 0.12, 0.2, d, { to: 44 });
      at += gap;
      gap = Math.max(0.16, gap * 0.86);
    }
  }

  /** Pieces lifting off the board together. */
  sweep() {
    const d = this.bus(0.4); if (!d) return;
    this.noise(this.now(), 1.1, 0.16, d, { type: 'bandpass', from: 240, to: 3600, q: 1.1, attack: 0.8 });
  }

  /** A town band, for the winner. */
  fanfare() {
    const d = this.bus(0.5); if (!d) return;
    const t = this.now();
    const run: [number, number, number][] = [[392, 0, 0.26], [523.25, 0.2, 0.26], [659.25, 0.4, 0.26], [783.99, 0.6, 0.5]];
    for (const [hz, at, dur] of run) {
      this.pad(t + at, [hz], dur, 0.075, d, 3000);
      this.pad(t + at, [hz / 2], dur, 0.05, d, 1400);
    }
    this.pad(t + 1.15, [261.63, 329.63, 392, 523.25, 659.25, 783.99], 3.2, 0.045, d, 2600);
    this.tone('sine', 65.41, t + 1.15, 2.6, 0.3, d, { attack: 0.02 });
    this.bell(1.15, 0.12);
    this.coins(9, 1.5);
  }

  /** The table being set: a held breath, then the bell. */
  intro() {
    const d = this.bus(0.5); if (!d) return;
    const t = this.now();
    this.pad(t, [55, 82.41, 110], 4.6, 0.05, d, 700);
    this.noise(t, 4.2, 0.05, d, { type: 'bandpass', from: 220, to: 1500, q: 0.8, attack: 3.4 });
    this.bell(2.9, 0.16);
  }

  // ---------- room tone ----------
  // Barely there: a furnace somewhere in the building. It lifts while the
  // table is watching something and settles while people think.
  ambience(level = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    if (!this.bed) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 190;
      filter.Q.value = 0.6;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.connect(filter);
      src.start();
      for (const hz of [55, 55.35, 82.6]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = hz;
        g.gain.value = 0.22;
        osc.connect(g).connect(filter);
        osc.start();
      }
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.06;
      lfoGain.gain.value = 45;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      filter.connect(gain).connect(this.master);
      this.bed = { gain, filter };
    }
    this.bed.gain.gain.setTargetAtTime(0.028 * level, ctx.currentTime, 1.6);
  }
  stopAmbience() {
    if (this.ctx && this.bed) this.bed.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
  }
}

export const audio = new BrassAudio();
