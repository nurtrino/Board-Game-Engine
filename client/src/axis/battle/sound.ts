// The sound of the battle. Everything is made here, in the browser, from noise and oscillators: no
// two shots are quite alike, each sound sits where it happens on the field (left and right, near and
// far, late if it is distant), and there is a bed under it all: wind or sea, engines, burning wrecks.
// The six recorded clips from the old simulator are kept as one layer under the opening of a volley.
// Silent when the hub's sound switch is off.
import { sfxEnabled } from '../../sfx';

export interface P3 { x: number; y: number; z: number }
export type ShotKind = 'rifle' | 'mg' | 'cannon' | 'howitzer' | 'flak' | 'naval' | 'heavy' | 'torpedo' | 'rocket';
export type Bed = 'land' | 'shore' | 'sea';

const CLIPS = ['artillery-fire', 'infantry-fire', 'naval-fire', 'plane-fire', 'tank-fire', 'dice-roll'] as const;
export type BattleSoundName = (typeof CLIPS)[number];
const CLIP_GAIN: Record<BattleSoundName, number> = {
  'artillery-fire': 0.3, 'infantry-fire': 0.22, 'naval-fire': 0.32, 'plane-fire': 0.26, 'tank-fire': 0.3, 'dice-roll': 0.6,
};

interface Place { pan: number; gain: number; tone: number; delay: number }
const HERE: Place = { pan: 0, gain: 1, tone: 18000, delay: 0 };

interface Burst { dur: number; gain: number; f0: number; f1?: number; q?: number; attack?: number; at?: number }
type NoiseKind = 'white' | 'brown' | 'crackle';
type FilterKind = 'lowpass' | 'bandpass' | 'highpass';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** The instrument. Works on any audio context, so it can also be rendered offline and measured. */
export class Synth {
  readonly out: GainNode;
  private dry: GainNode;
  private verb: ConvolverNode;
  private buffers: Record<NoiseKind, AudioBuffer>;

  constructor(readonly ctx: BaseAudioContext, destination: AudioNode, tail = 2.2) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    this.out = ctx.createGain();
    this.out.gain.value = 0.85;
    this.out.connect(comp).connect(destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.out);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(tail);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    this.verb.connect(wet).connect(this.out);
    this.buffers = { white: this.noise('white'), brown: this.noise('brown'), crackle: this.noise('crackle') };
  }

  /** Open country: a short slap, then a long dull roll. */
  private impulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate, n = Math.floor(rate * seconds);
    const b = this.ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let low = 0;
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        const env = Math.exp(-t * 2.6) * (t < 0.03 ? t / 0.03 : 1);
        // the tail darkens as it goes
        const k = 0.5 * Math.exp(-t * 1.8) + 0.04;
        low += ((Math.random() * 2 - 1) - low) * k;
        d[i] = low * env * 1.6;
      }
      // a few distinct early reflections
      for (const [at, g] of [[0.047, 0.5], [0.083, 0.35], [0.131, 0.28], [0.21, 0.2]] as const) {
        const i = Math.floor((at + c * 0.004) * rate);
        if (i < n) d[i] += g * (c === 0 ? 1 : -1);
      }
    }
    return b;
  }

  private noise(kind: NoiseKind): AudioBuffer {
    const rate = this.ctx.sampleRate, n = Math.floor(rate * (kind === 'crackle' ? 4 : 2.5));
    const b = this.ctx.createBuffer(1, n, rate);
    const d = b.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'brown') {
      let v = 0;
      for (let i = 0; i < n; i++) { v = (v + (Math.random() * 2 - 1) * 0.045) / 1.012; d[i] = v * 4.2; }
    } else {
      // a fire: clicks and small pops at random, each a few milliseconds long
      for (let k = 0; k < 150; k++) {
        const at = Math.floor(Math.random() * (n - 800));
        const len = 40 + Math.floor(Math.random() * 500);
        const g = Math.random() ** 2 * 0.9 + 0.08;
        for (let i = 0; i < len; i++) d[at + i] += (Math.random() * 2 - 1) * g * Math.exp(-i / (len * 0.25));
      }
    }
    return b;
  }

  /** A place for one sound to go: gain, distance filter, pan, and a send to the reverb. */
  voice(place: Place, send: number, volume = 1): { input: GainNode; t: number; end: (after: number) => void } {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = place.gain * volume;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = place.tone;
    const pan = ctx.createStereoPanner();
    pan.pan.value = place.pan;
    const wet = ctx.createGain();
    // distant sounds are mostly their echo
    wet.gain.value = Math.min(1, send * (1.4 - place.gain * 0.6));
    input.connect(tone).connect(pan);
    pan.connect(this.dry);
    pan.connect(wet).connect(this.verb);
    const t = ctx.currentTime + 0.012 + place.delay;
    return {
      input, t,
      end: (after) => {
        const stop = ctx.createConstantSource();
        stop.onended = () => { input.disconnect(); tone.disconnect(); pan.disconnect(); wet.disconnect(); };
        stop.start(t);
        stop.stop(t + after + 0.15);
      },
    };
  }

  private env(g: AudioParam, t: number, peak: number, attack: number, dur: number) {
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
  }

  noiseBurst(dest: AudioNode, t0: number, kind: NoiseKind, filter: FilterKind, b: Burst) {
    const ctx = this.ctx, t = t0 + (b.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[kind];
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = b.q ?? 0.8;
    f.frequency.setValueAtTime(b.f0, t);
    if (b.f1) f.frequency.exponentialRampToValueAtTime(b.f1, t + b.dur);
    const g = ctx.createGain();
    this.env(g.gain, t, b.gain, b.attack ?? 0.002, b.dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 2);
    src.stop(t + b.dur + 0.05);
  }

  tone(dest: AudioNode, t0: number, type: OscillatorType, b: Burst, vibrato = 0) {
    const ctx = this.ctx, t = t0 + (b.at ?? 0);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(b.f0, t);
    if (b.f1) o.frequency.exponentialRampToValueAtTime(b.f1, t + b.dur);
    if (vibrato > 0) {
      const l = ctx.createOscillator();
      l.frequency.value = vibrato;
      const lg = ctx.createGain();
      lg.gain.value = b.f0 * 0.03;
      l.connect(lg).connect(o.frequency);
      l.start(t); l.stop(t + b.dur + 0.05);
    }
    const g = ctx.createGain();
    this.env(g.gain, t, b.gain, b.attack ?? 0.003, b.dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + b.dur + 0.05);
  }

  // ---------- the sounds ----------

  shot(kind: ShotKind, place: Place = HERE, volume = 1): number {
    const k = rnd(0.92, 1.09);   // no two alike
    switch (kind) {
      case 'rifle': {
        const v = this.voice(place, 0.5, volume);
        this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 0.1, gain: 0.55, f0: 2400 * k, q: 0.7 });
        this.noiseBurst(v.input, v.t, 'white', 'highpass', { dur: 0.03, gain: 0.3, f0: 5200 });
        this.tone(v.input, v.t, 'sine', { dur: 0.11, gain: 0.4, f0: 170 * k, f1: 62 });
        v.end(0.3);
        return 0.3;
      }
      case 'mg': {
        const v = this.voice(place, 0.4, volume);
        const n = 6 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const at = i * 0.082 + rnd(0, 0.008);
          this.noiseBurst(v.input, v.t, 'white', 'bandpass', { at, dur: 0.06, gain: 0.42, f0: 2000 * k, q: 0.8 });
          this.tone(v.input, v.t, 'square', { at, dur: 0.05, gain: 0.14, f0: 140 * k, f1: 80 });
        }
        v.end(n * 0.082 + 0.3);
        return n * 0.082;
      }
      case 'flak': {
        const v = this.voice(place, 0.5, volume);
        for (let i = 0; i < 5; i++) {
          const at = i * 0.118;
          this.tone(v.input, v.t, 'sine', { at, dur: 0.14, gain: 0.6, f0: 150 * k, f1: 62 });
          this.noiseBurst(v.input, v.t, 'white', 'bandpass', { at, dur: 0.08, gain: 0.45, f0: 1500 * k, q: 0.7 });
        }
        v.end(1.1);
        return 0.6;
      }
      case 'cannon': {
        const v = this.voice(place, 0.6, volume);
        this.tone(v.input, v.t, 'sine', { dur: 0.48, gain: 0.95, f0: 98 * k, f1: 36 });
        this.noiseBurst(v.input, v.t, 'brown', 'lowpass', { dur: 0.6, gain: 0.85, f0: 800, f1: 150 });
        this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 0.07, gain: 0.55, f0: 1900 * k, q: 0.6 });
        v.end(1);
        return 0.6;
      }
      case 'howitzer': {
        const v = this.voice(place, 0.7, volume);
        this.tone(v.input, v.t, 'sine', { dur: 0.75, gain: 1, f0: 82 * k, f1: 29 });
        this.noiseBurst(v.input, v.t, 'brown', 'lowpass', { dur: 0.95, gain: 0.95, f0: 560, f1: 100 });
        this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 0.09, gain: 0.5, f0: 1300 * k, q: 0.6 });
        v.end(1.4);
        return 0.9;
      }
      case 'naval': {
        const v = this.voice(place, 0.75, volume);
        this.tone(v.input, v.t, 'sine', { dur: 0.85, gain: 1, f0: 72 * k, f1: 28 });
        this.noiseBurst(v.input, v.t, 'brown', 'lowpass', { dur: 1.15, gain: 1, f0: 620, f1: 85 });
        this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 0.09, gain: 0.5, f0: 1150 * k, q: 0.6 });
        v.end(1.7);
        return 1.1;
      }
      case 'heavy': {
        const v = this.voice(place, 0.85, volume);
        this.tone(v.input, v.t, 'sine', { dur: 1.35, gain: 1.15, f0: 56 * k, f1: 23 });
        this.noiseBurst(v.input, v.t, 'brown', 'lowpass', { dur: 1.8, gain: 1.1, f0: 470, f1: 58 });
        this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 0.11, gain: 0.5, f0: 900 * k, q: 0.6 });
        // the roll that follows a big gun
        this.noiseBurst(v.input, v.t, 'brown', 'lowpass', { at: 0.22, dur: 1.6, gain: 0.55, f0: 300, f1: 70, attack: 0.25 });
        v.end(2.6);
        return 1.8;
      }
      case 'torpedo': {
        const v = this.voice(place, 0.3, volume);
        this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 1.4, gain: 0.38, f0: 520, f1: 260, q: 1.2, attack: 0.15 });
        this.tone(v.input, v.t, 'sine', { dur: 0.5, gain: 0.3, f0: 64, f1: 44 });
        v.end(1.7);
        return 1.4;
      }
      case 'rocket': {
        const v = this.voice(place, 0.5, volume);
        this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 2.1, gain: 0.55, f0: 1100, f1: 280, q: 0.7, attack: 0.08 });
        this.tone(v.input, v.t, 'sawtooth', { dur: 1.8, gain: 0.22, f0: 140, f1: 60, attack: 0.05 });
        v.end(2.4);
        return 2.1;
      }
    }
  }

  explosion(scale: number, water: boolean, place: Place = HERE) {
    const s = Math.max(0.3, Math.min(2.2, scale / 5));
    const k = rnd(0.9, 1.1);
    const v = this.voice(place, water ? 0.5 : 0.75, 0.55 + s * 0.4);
    if (water) {
      this.tone(v.input, v.t, 'sine', { dur: 0.5 + s * 0.2, gain: 0.7, f0: 62 * k, f1: 30 });
      this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 1.1 + s * 0.4, gain: 0.6, f0: 1500, f1: 420, q: 0.6, attack: 0.05 });
      // the column coming back down
      this.noiseBurst(v.input, v.t, 'white', 'highpass', { at: 0.55 + s * 0.2, dur: 0.9, gain: 0.14, f0: 2800, attack: 0.12 });
      v.end(2.4);
      return;
    }
    this.tone(v.input, v.t, 'sine', { dur: 0.55 + s * 0.45, gain: 1, f0: 78 * k, f1: 25 });
    this.noiseBurst(v.input, v.t, 'brown', 'lowpass', { dur: 0.9 + s * 0.8, gain: 1, f0: 560, f1: 70 });
    this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 0.13, gain: 0.55, f0: 950 * k, q: 0.5 });
    // earth and metal coming down
    const bits = 5 + Math.floor(s * 6);
    for (let i = 0; i < bits; i++) {
      this.noiseBurst(v.input, v.t, 'white', 'highpass', { at: rnd(0.2, 0.5 + s * 0.7), dur: rnd(0.02, 0.05), gain: rnd(0.05, 0.14), f0: rnd(2200, 4200) });
    }
    v.end(2.2 + s);
  }

  /** A shell or a bomb coming in: falls in pitch and swells until it lands. */
  whistle(seconds: number, place: Place = HERE, bomb = false) {
    const v = this.voice(place, 0.3, 1);
    const dur = Math.max(0.3, seconds);
    this.tone(v.input, v.t, 'sine', { dur, gain: bomb ? 0.16 : 0.1, f0: bomb ? 1900 : 2400, f1: bomb ? 520 : 800, attack: dur * 0.75 }, 6);
    this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur, gain: 0.05, f0: bomb ? 2400 : 3200, f1: 900, q: 6, attack: dur * 0.75 });
    v.end(dur + 0.1);
  }

  tick(place: Place = HERE) {
    const v = this.voice(place, 0.2, 1);
    this.noiseBurst(v.input, v.t, 'white', 'bandpass', { dur: 0.035, gain: 0.45, f0: rnd(2200, 3800), q: 1.5 });
    v.end(0.1);
  }

  thud(place: Place = HERE) {
    const v = this.voice(place, 0.2, 1);
    this.tone(v.input, v.t, 'sine', { dur: 0.14, gain: 0.35, f0: 120, f1: 48 });
    this.noiseBurst(v.input, v.t, 'brown', 'lowpass', { dur: 0.12, gain: 0.3, f0: 400 });
    v.end(0.3);
  }

  /** An aircraft going down: the engine winds up as it falls. */
  planeDown(seconds: number, place: Place = HERE) {
    const v = this.voice(place, 0.35, 1);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    f.connect(v.input);
    this.tone(f, v.t, 'sawtooth', { dur: seconds, gain: 0.26, f0: 150, f1: 470, attack: 0.15 }, 9);
    this.tone(f, v.t, 'sawtooth', { dur: seconds, gain: 0.16, f0: 226, f1: 705, attack: 0.15 });
    v.end(seconds + 0.2);
  }

  /** A ship going under: steel groaning, air coming up. */
  sink(place: Place = HERE) {
    const v = this.voice(place, 0.6, 1);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(260, v.t);
    f.frequency.exponentialRampToValueAtTime(85, v.t + 4.2);
    f.connect(v.input);
    this.tone(f, v.t, 'sawtooth', { dur: 4.4, gain: 0.5, f0: 58, f1: 41, attack: 0.5 }, 0.7);
    this.tone(f, v.t, 'sawtooth', { dur: 4.4, gain: 0.4, f0: 61.5, f1: 44, attack: 0.7 });
    for (let i = 0; i < 16; i++) {
      this.noiseBurst(v.input, v.t, 'white', 'bandpass', { at: rnd(0.4, 4.4), dur: rnd(0.08, 0.2), gain: rnd(0.04, 0.12), f0: rnd(350, 900), q: 4, attack: 0.02 });
    }
    v.end(5);
  }

  dive(place: Place = HERE) {
    const v = this.voice(place, 0.3, 1);
    this.noiseBurst(v.input, v.t, 'white', 'highpass', { dur: 1.7, gain: 0.2, f0: 2200, attack: 0.2 });
    for (let i = 0; i < 10; i++) {
      this.noiseBurst(v.input, v.t, 'white', 'bandpass', { at: rnd(0.3, 2), dur: rnd(0.08, 0.18), gain: rnd(0.05, 0.12), f0: rnd(400, 900), q: 4, attack: 0.02 });
    }
    v.end(2.4);
  }

  // ---------- things that run on ----------

  /** A looping source through a filter, silent until its gain is raised. */
  loopNoise(kind: NoiseKind, filter: FilterKind, freq: number, q = 0.7): { gain: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode; stop: () => void } {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[kind];
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(f).connect(gain).connect(pan).connect(this.dry);
    src.start(ctx.currentTime, Math.random() * 2);
    return { gain, filter: f, pan, stop: () => { try { src.stop(); } catch { /* already stopped */ } pan.disconnect(); } };
  }

  /** Oscillators beating against each other through a filter and a tremolo: an engine. */
  loopEngine(freqs: readonly number[], type: OscillatorType, cutoff: number, throb: number, depth: number): { gain: GainNode; pan: StereoPannerNode; pitch: (cents: number) => void; stop: () => void } {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const trem = ctx.createGain();
    trem.gain.value = 1 - depth;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = throb;
    const lg = ctx.createGain();
    lg.gain.value = depth;
    lfo.connect(lg).connect(trem.gain);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const oscs = freqs.map((hz) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(trem).connect(gain).connect(pan).connect(this.dry);
    lfo.start();
    return {
      gain, pan,
      pitch: (cents) => { for (const o of oscs) o.detune.setTargetAtTime(cents, ctx.currentTime, 0.2); },
      stop: () => { for (const o of [...oscs, lfo]) { try { o.stop(); } catch { /* already stopped */ } } pan.disconnect(); },
    };
  }

  clip(buffer: AudioBuffer, place: Place, volume: number, rate = 1) {
    const v = this.voice(place, 0.35, volume);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(v.input);
    src.start(v.t);
    v.end(buffer.duration / rate + 0.1);
  }
}

// ---------- the live engine: one audio context for the page ----------

interface Loops {
  wind: ReturnType<Synth['loopNoise']>;
  sea: ReturnType<Synth['loopNoise']>;
  fire: ReturnType<Synth['loopNoise']>;
  squeal: ReturnType<Synth['loopNoise']>;
  rumble: ReturnType<Synth['loopNoise']>;
  planes: ReturnType<Synth['loopEngine']>;
  tanks: ReturnType<Synth['loopEngine']>;
  ships: ReturnType<Synth['loopEngine']>;
}

/** What is making continuous noise this frame. Levels are 0..1; places are where it is loudest. */
export interface Scene {
  planes: number; planeAt: P3 | null; planeApproach: number;
  tanks: number; tankAt: P3 | null;
  ships: number; shipAt: P3 | null;
  fires: number; fireAt: P3 | null;
}

let live: { ctx: AudioContext; synth: Synth; loops: Loops | null; clips: Map<BattleSoundName, AudioBuffer>; users: number } | null = null;

function engine(): typeof live {
  if (live) return live;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    live = { ctx, synth: new Synth(ctx, ctx.destination), loops: null, clips: new Map(), users: 0 };
    const wake = () => { if (ctx.state !== 'running') void ctx.resume().catch(() => { /* needs a tap first */ }); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    wake();
    for (const name of CLIPS) {
      void fetch(`/axis/sim/sounds/${name}.mp3`).then((r) => r.arrayBuffer()).then((data) => ctx.decodeAudioData(data))
        .then((buffer) => { live?.clips.set(name, buffer); }).catch(() => { /* the synth carries on without it */ });
    }
  } catch { live = null; }
  return live;
}

export function fireSoundFor(key: string): BattleSoundName {
  if (key === 'battleship' || key === 'cruiser' || key === 'destroyer' || key === 'carrier' || key === 'transport' || key === 'submarine') return 'naval-fire';
  if (key === 'fighter' || key === 'bomber') return 'plane-fire';
  if (key === 'tank') return 'tank-fire';
  if (key === 'artillery' || key === 'aaGun') return 'artillery-fire';
  return 'infantry-fire';
}

export function shotKindFor(key: string, flak: boolean): ShotKind {
  if (flak || key === 'aaGun') return 'flak';
  switch (key) {
    case 'infantry': return 'rifle';
    case 'fighter': case 'bomber': return 'mg';
    case 'artillery': return 'howitzer';
    case 'battleship': return 'heavy';
    case 'cruiser': case 'destroyer': case 'carrier': case 'transport': return 'naval';
    case 'submarine': return 'torpedo';
    default: return 'cannon';
  }
}

const MIN_GAP: Record<ShotKind, number> = { rifle: 0.035, mg: 0.12, flak: 0.2, cannon: 0.06, howitzer: 0.08, naval: 0.07, heavy: 0.1, torpedo: 0.2, rocket: 0.3 };

/** A battle's handle on the sound. Cheap to make; the audio context behind it is shared. */
export class BattleSound {
  private dead = false;
  private ear = { x: 0, y: 30, z: 80 };
  private right = { x: 1, z: 0 };
  private last = new Map<string, number>();
  private bed: Bed | null = null;
  private farAcc = 3;
  private whistles = 0;

  constructor() {
    if (sfxEnabled()) { const e = engine(); if (e) e.users += 1; }
  }

  private get on(): NonNullable<typeof live> | null {
    if (this.dead || !sfxEnabled()) return null;
    const e = engine();
    return e && e.ctx.state === 'running' ? e : null;
  }

  /** Where the camera is and which way is right, so sounds can sit in the picture. */
  listen(pos: P3, rightX: number, rightZ: number) {
    this.ear.x = pos.x; this.ear.y = pos.y; this.ear.z = pos.z;
    const len = Math.hypot(rightX, rightZ) || 1;
    this.right.x = rightX / len; this.right.z = rightZ / len;
  }

  private place(at: P3 | null | undefined): Place {
    if (!at) return HERE;
    const dx = at.x - this.ear.x, dy = at.y - this.ear.y, dz = at.z - this.ear.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    return {
      pan: Math.max(-0.9, Math.min(0.9, ((dx * this.right.x + dz * this.right.z) / d) * 1.15)),
      gain: 1 / (1 + (d / 85) ** 1.25),
      tone: 1400 + 17000 / (1 + d / 110),
      delay: Math.min(0.4, d / 900),
    };
  }

  /** No more often than this kind of sound can usefully repeat. */
  private clear(key: string, gap: number, now: number): boolean {
    if (now - (this.last.get(key) ?? -9) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  shot(kind: ShotKind, at?: P3 | null, volume = 1) {
    const e = this.on;
    if (!e || !this.clear(kind, MIN_GAP[kind], e.ctx.currentTime)) return;
    e.synth.shot(kind, this.place(at), volume);
  }

  /** The recorded layer under the first shots of a volley. */
  play(name: BattleSoundName, opts: { volume?: number; rate?: number; delay?: number; at?: P3 | null } = {}) {
    const e = this.on;
    if (!e) return;
    const buffer = e.clips.get(name);
    if (!buffer) return;
    const place = this.place(opts.at);
    e.synth.clip(buffer, { ...place, delay: place.delay + (opts.delay ?? 0) }, CLIP_GAIN[name] * (opts.volume ?? 1), opts.rate ?? 1);
  }

  explosion(scale: number, at: P3 | null, water: boolean) {
    const e = this.on;
    if (!e || !this.clear(water ? 'splash' : 'boom', 0.05, e.ctx.currentTime)) return;
    e.synth.explosion(scale, water, this.place(at));
  }

  /** Kept for callers that only know "something blew up". */
  boom(scale = 1, delay = 0) {
    const e = this.on;
    if (!e) return;
    e.synth.explosion(scale * 5, false, { ...HERE, gain: 0.7, delay });
  }

  whistle(seconds: number, at: P3 | null, bomb = false) {
    const e = this.on;
    if (!e || seconds < 0.5 || this.whistles >= 3) return;
    this.whistles += 1;
    window.setTimeout(() => { this.whistles -= 1; }, seconds * 1000);
    e.synth.whistle(seconds, this.place(at), bomb);
  }

  tick(at: P3 | null) {
    const e = this.on;
    if (e && this.clear('tick', 0.05, e.ctx.currentTime)) e.synth.tick(this.place(at));
  }

  thud(at: P3 | null) {
    const e = this.on;
    if (e && this.clear('thud', 0.08, e.ctx.currentTime)) e.synth.thud(this.place(at));
  }

  planeDown(seconds: number, at: P3 | null) { const e = this.on; if (e) e.synth.planeDown(seconds, this.place(at)); }
  sink(at: P3 | null) { const e = this.on; if (e && this.clear('sink', 1.2, e.ctx.currentTime)) e.synth.sink(this.place(at)); }
  dive(at: P3 | null) { const e = this.on; if (e && this.clear('dive', 0.6, e.ctx.currentTime)) e.synth.dive(this.place(at)); }

  /** Which bed lies under the battle: wind over land, the sea, or both on a beach. */
  setBed(bed: Bed | null) { this.bed = bed; }

  /** Once a frame: engines, fires, the wind and the sea follow what is on the field. */
  frame(dt: number, scene: Scene) {
    const e = this.on;
    if (!e) { if (live?.loops) this.hush(); return; }
    const s = e.synth;
    e.loops ??= {
      wind: s.loopNoise('brown', 'bandpass', 420, 0.5),
      sea: s.loopNoise('white', 'lowpass', 750, 0.5),
      fire: s.loopNoise('crackle', 'highpass', 1500, 0.5),
      squeal: s.loopNoise('white', 'bandpass', 2600, 9),
      rumble: s.loopNoise('brown', 'lowpass', 190, 0.6),
      planes: s.loopEngine([92, 95.5, 46.4], 'sawtooth', 1150, 23, 0.32),
      tanks: s.loopEngine([38, 57.4], 'sawtooth', 320, 8.5, 0.4),
      ships: s.loopEngine([44, 66.3], 'triangle', 240, 3.2, 0.2),
    };
    const L = e.loops, now = e.ctx.currentTime;
    const set = (g: GainNode, v: number, tc = 0.25) => g.gain.setTargetAtTime(v, now, tc);
    const at = (pan: StereoPannerNode, p: P3 | null) => { const pl = this.place(p); pan.pan.setTargetAtTime(pl.pan, now, 0.2); return pl.gain; };
    // the weather breathes
    const swell = 0.75 + 0.25 * Math.sin(now * 0.31) * Math.sin(now * 0.13 + 1);
    set(L.wind.gain, this.bed === 'land' ? 0.09 * swell : this.bed === 'shore' ? 0.05 * swell : this.bed === 'sea' ? 0.04 * swell : 0, 0.8);
    L.wind.filter.frequency.setTargetAtTime(360 + 180 * swell, now, 1.2);
    const wave = 0.6 + 0.4 * Math.sin(now * 0.52);
    set(L.sea.gain, this.bed === 'sea' ? 0.085 * wave : this.bed === 'shore' ? 0.06 * wave : 0, 0.6);
    set(L.planes.gain, Math.min(1, scene.planes) * 0.11 * at(L.planes.pan, scene.planeAt) * 2.2);
    L.planes.pitch(scene.planeApproach * 140);
    const tk = Math.min(1, scene.tanks) * at(L.tanks.pan, scene.tankAt) * 2;
    set(L.tanks.gain, 0.16 * tk);
    set(L.rumble.gain, 0.2 * tk);
    L.rumble.pan.pan.value = L.tanks.pan.pan.value;
    set(L.squeal.gain, 0.012 * tk * (0.5 + 0.5 * Math.sin(now * 5.3)), 0.05);
    L.squeal.pan.pan.value = L.tanks.pan.pan.value;
    set(L.ships.gain, Math.min(1, scene.ships) * 0.07 * at(L.ships.pan, scene.shipAt) * 2);
    set(L.fire.gain, Math.min(1, scene.fires) * 0.3 * at(L.fire.pan, scene.fireAt) * 1.8, 0.5);
    // a war going on beyond the horizon
    if (this.bed !== 'sea') {
      this.farAcc -= dt;
      if (this.farAcc <= 0) {
        this.farAcc = rnd(2.5, 8);
        s.explosion(rnd(2, 6), false, { pan: rnd(-0.8, 0.8), gain: rnd(0.035, 0.08), tone: 420, delay: 0 });
      }
    }
  }

  private hush() {
    const L = live?.loops;
    if (!L || !live) return;
    const now = live.ctx.currentTime;
    for (const l of Object.values(L)) l.gain.gain.setTargetAtTime(0, now, 0.15);
  }

  dispose() {
    if (this.dead) return;
    this.hush();
    this.dead = true;
  }
}
