// Procedural sound design. Everything is synthesised with WebAudio, so there are no files to load.
// The big screen voices the drama; devices only click.

type Tone = 'liberal' | 'fascist' | 'neutral';

class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  private verbGain!: GainNode;
  private drone: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private noiseBuf!: AudioBuffer;
  muted = false;
  voice = true;

  constructor() {
    try {
      this.muted = localStorage.getItem('bge2.mute') === '1';
      this.voice = localStorage.getItem('bge2.voice') !== '0';
    } catch {
      // storage unavailable
    }
  }

  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // Must be called from a user gesture at least once.
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      // Generated hall impulse for tails.
      const len = Math.floor(this.ctx.sampleRate * 2.6);
      const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = ir;
      this.verbGain = this.ctx.createGain();
      this.verbGain.gain.value = 0.32;
      this.verb.connect(this.verbGain).connect(this.master);
      const nlen = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, nlen, this.ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('bge2.mute', m ? '1' : '0');
    } catch {
      // ignore
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    if (m) window.speechSynthesis?.cancel();
  }
  setVoice(v: boolean) {
    this.voice = v;
    try {
      localStorage.setItem('bge2.voice', v ? '1' : '0');
    } catch {
      // ignore
    }
    if (!v) window.speechSynthesis?.cancel();
  }

  private out(wet = 0.25): GainNode | null {
    if (!this.ctx || this.ctx.state !== 'running') return null;
    const g = this.ctx.createGain();
    g.connect(this.master);
    if (wet > 0) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      g.connect(send).connect(this.verb);
    }
    return g;
  }

  private osc(type: OscillatorType, freq: number, t0: number, dur: number, peak: number, dest: AudioNode, opts: { to?: number; attack?: number; detune?: number } = {}) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
    if (opts.detune) o.detune.value = opts.detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(t0: number, dur: number, peak: number, dest: AudioNode, opts: { type?: BiquadFilterType; from?: number; to?: number; q?: number; attack?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'lowpass';
    f.Q.value = opts.q ?? 0.8;
    f.frequency.setValueAtTime(opts.from ?? 2000, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  // ----- small sounds -----
  click() {
    const d = this.out(0);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.osc('triangle', 1400, t, 0.05, 0.12, d, { to: 700 });
  }
  error() {
    const d = this.out(0);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.osc('square', 160, t, 0.16, 0.08, d, { to: 110 });
  }
  whoosh(dur = 0.5, gain = 0.16) {
    const d = this.out(0.2);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.noise(t, dur, gain, d, { type: 'bandpass', from: 300, to: 2600, q: 1.4, attack: dur * 0.45 });
  }
  card() {
    const d = this.out(0.1);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.09, 0.2, d, { type: 'highpass', from: 2500, attack: 0.003 });
    this.osc('sine', 220, t, 0.06, 0.06, d, { to: 120 });
  }
  thump(gain = 0.5) {
    const d = this.out(0.3);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.osc('sine', 120, t, 0.35, gain, d, { to: 38 });
    this.noise(t, 0.08, gain * 0.35, d, { from: 900, to: 200 });
  }
  tick() {
    const d = this.out(0.15);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.osc('square', 2100, t, 0.03, 0.05, d);
  }
  // Stamp or placard hitting the table.
  slam() {
    const d = this.out(0.45);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.osc('sine', 90, t, 0.7, 0.8, d, { to: 30 });
    this.noise(t, 0.25, 0.5, d, { from: 3000, to: 150 });
  }
  heartbeat() {
    const d = this.out(0.2);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.osc('sine', 62, t, 0.22, 0.6, d, { to: 40 });
    this.osc('sine', 54, t + 0.26, 0.26, 0.42, d, { to: 36 });
  }
  riser(dur = 2.2) {
    const d = this.out(0.4);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.noise(t, dur, 0.2, d, { type: 'bandpass', from: 200, to: 6000, q: 2.5, attack: dur * 0.95 });
    this.osc('sawtooth', 55, t, dur, 0.1, d, { to: 220, attack: dur * 0.9 });
  }
  drumroll(dur = 1.8) {
    const d = this.out(0.25);
    if (!d) return;
    const t = this.ctx!.currentTime;
    const hits = Math.floor(dur * 22);
    for (let i = 0; i < hits; i++) {
      const k = i / hits;
      this.noise(t + (i / 22), 0.05, 0.05 + k * 0.16, d, { type: 'bandpass', from: 240 + Math.random() * 60, q: 1.2 });
    }
  }
  ja() {
    const d = this.out(0.3);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.osc('triangle', 392, t, 0.28, 0.2, d);
    this.osc('triangle', 587, t + 0.02, 0.3, 0.14, d);
    this.noise(t, 0.05, 0.12, d, { type: 'highpass', from: 3000 });
  }
  nein() {
    const d = this.out(0.3);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.osc('sawtooth', 98, t, 0.32, 0.2, d, { to: 82 });
    this.osc('square', 147, t, 0.22, 0.07, d);
    this.noise(t, 0.05, 0.12, d, { from: 800 });
  }
  gunshot() {
    const d = this.out(0.9);
    if (!d) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.5, 1.2, d, { from: 9000, to: 300, attack: 0.001 });
    this.osc('sine', 150, t, 0.5, 1.0, d, { to: 28, attack: 0.001 });
    this.noise(t + 0.03, 1.4, 0.25, d, { type: 'bandpass', from: 1200, to: 200, q: 0.6 });
  }

  // ----- stingers -----
  private chord(freqs: number[], type: OscillatorType, dur: number, gain: number, stagger = 0) {
    const d = this.out(0.6);
    if (!d) return;
    const t = this.ctx!.currentTime;
    const f = this.ctx!.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    f.connect(d);
    freqs.forEach((hz, i) => {
      this.osc(type, hz, t + i * stagger, dur, gain, f, { attack: 0.02, detune: -6 });
      this.osc(type, hz, t + i * stagger, dur, gain * 0.8, f, { attack: 0.02, detune: 7 });
    });
  }
  sting(tone: Tone) {
    if (tone === 'liberal') {
      // Open major voicing: relief.
      this.chord([196, 293.66, 392, 493.88, 587.33], 'triangle', 2.6, 0.13, 0.05);
      this.thump(0.35);
    } else if (tone === 'fascist') {
      // Low minor cluster with a tritone: dread.
      this.chord([65.41, 98, 138.59, 155.56, 233.08], 'sawtooth', 3.0, 0.1);
      this.slam();
    } else {
      this.chord([146.83, 220, 293.66], 'triangle', 1.6, 0.1);
    }
  }
  fanfare(tone: Tone) {
    const d = this.out(0.6);
    if (!d) return;
    const t = this.ctx!.currentTime;
    const seq = tone === 'liberal'
      ? [[392, 0], [493.88, 0.22], [587.33, 0.44], [783.99, 0.7], [783.99, 1.3], [987.77, 1.3], [587.33, 1.3]]
      : [[110, 0], [103.83, 0.5], [82.41, 1.0], [61.74, 1.6], [123.47, 1.6], [174.61, 1.6]];
    for (const [hz, at] of seq) {
      const last = at >= 1.3;
      this.osc(tone === 'liberal' ? 'triangle' : 'sawtooth', hz, t + at, last ? 3.2 : 0.5, tone === 'liberal' ? 0.16 : 0.12, d, { attack: 0.02 });
      this.osc('sine', hz / 2, t + at, last ? 3.2 : 0.5, 0.1, d, { attack: 0.02 });
    }
    if (tone === 'fascist') {
      setTimeout(() => this.slam(), 1600);
    }
  }

  // ----- ambience -----
  // A low bed that darkens as the fascist track fills. tension 0..1.
  ambience(tension: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    if (!this.drone) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      filter.Q.value = 3;
      const osc = [55, 55.4, 82.5, 110.3].map((hz, i) => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = hz;
        o.connect(filter);
        o.start();
        return o;
      });
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 60;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      filter.connect(gain).connect(this.master);
      const send = ctx.createGain();
      send.gain.value = 0.5;
      gain.connect(send).connect(this.verb);
      this.drone = { osc, gain, filter };
    }
    const t = ctx.currentTime;
    this.drone.gain.gain.setTargetAtTime(0.05 + tension * 0.07, t, 2);
    this.drone.filter.frequency.setTargetAtTime(170 + tension * 260, t, 2);
    // The third voice slides from a fifth to a tritone as things get worse.
    this.drone.osc[2].frequency.setTargetAtTime(82.5 - tension * 4.7, t, 3);
  }
  stopAmbience() {
    if (!this.ctx || !this.drone) return;
    this.drone.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
  }

  // ----- voice -----
  // Speaks a line of table talk with the browser's built-in voice. Each seat gets a steady pitch.
  speak(text: string, seat: number) {
    if (this.muted || !this.voice || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    const preferred = voices.filter((v) => /natural|neural|online|google|aria|guy|jenny|daniel|samantha/i.test(v.name));
    const pool = preferred.length ? preferred : voices;
    if (pool.length) u.voice = pool[seat % pool.length];
    u.rate = 1.04;
    u.pitch = 0.8 + ((seat * 37) % 5) * 0.08;
    u.volume = 0.95;
    window.speechSynthesis.speak(u);
  }
}

export const sfx = new Sfx();
