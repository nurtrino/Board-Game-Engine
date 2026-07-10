// Synthesize a calming, non-harsh CC0 UI sound set for the board-game engine.
// Design: soft raised-cosine attacks (no click transients), low-pass warmth,
// consonant/pentatonic intervals, marimba/bell/felt timbres, gentle levels.
// Writes 16-bit mono WAV @ 44.1k to the output dir (ffmpeg -> .ogg after).
import fs from 'node:fs';
const SR = 44100;
const OUT = process.argv[2];

const clamp = (v) => Math.max(-1, Math.min(1, v));
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));

// soft raised-cosine attack (ms) then exponential decay (tau in sec)
function env(n, i, attackMs, tau) {
  const a = (attackMs / 1000) * SR;
  const atk = i < a ? 0.5 * (1 - Math.cos((Math.PI * i) / a)) : 1;
  return atk * Math.exp(-(i / SR) / tau);
}
// a struck-bar/bell voice: fundamental + gently decaying partials, soft attack.
// `bell` adds a faint inharmonic shimmer; higher partials decay quicker.
function voice(out, freq, start, dur, { gain = 0.5, attackMs = 8, tau = 0.18, parts = [[1, 1], [2, 0.28], [3, 0.12]], bell = 0 } = {}) {
  const s0 = Math.floor(start * SR), N = Math.floor(dur * SR);
  for (let i = 0; i < N && s0 + i < out.length; i++) {
    let s = 0;
    for (const [mult, amp] of parts) s += amp * Math.sin((2 * Math.PI * freq * mult * i) / SR) * Math.exp(-(i / SR) / (tau / Math.sqrt(mult)));
    if (bell) s += bell * Math.sin((2 * Math.PI * freq * 2.76 * i) / SR) * Math.exp(-(i / SR) / (tau * 0.6));
    out[s0 + i] += gain * env(N, i, attackMs, tau) * s;
  }
}
// filtered-noise "felt/paper" — soft, no high fizz. cut = lowpass cutoff Hz.
function noise(out, start, dur, { gain = 0.3, attackMs = 4, tau = 0.05, cut = 1800, rise = 0 } = {}) {
  const s0 = Math.floor(start * SR), N = Math.floor(dur * SR);
  let lp = 0;
  for (let i = 0; i < N && s0 + i < out.length; i++) {
    const fc = cut * (1 + rise * (i / N));
    const a = (2 * Math.PI * fc) / SR; const x = Math.random() * 2 - 1;
    lp += Math.min(1, a) * (x - lp);
    out[s0 + i] += gain * env(N, i, attackMs, tau) * lp;
  }
}
// gentle body low-pass over the whole buffer for warmth
function warm(out, cut = 5200) {
  const a = (2 * Math.PI * cut) / SR; let lp = 0;
  for (let i = 0; i < out.length; i++) { lp += Math.min(1, a) * (out[i] - lp); out[i] = lp; }
}
// light air/echo for spaciousness on chimes
function echo(out, ms, g) {
  const d = Math.floor((ms / 1000) * SR);
  for (let i = out.length - 1; i >= d; i--) out[i] += g * out[i - d];
}
function norm(out, peak = 0.62) {
  let m = 0; for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] = clamp((out[i] / m) * peak);
  // 5ms fade-out tail to guarantee no end click
  const f = Math.floor(0.005 * SR);
  for (let i = 0; i < f; i++) out[out.length - 1 - i] *= i / f;
}
function writeWav(name, out) {
  const n = out.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(clamp(out[i]) * 32767), 44 + i * 2);
  fs.writeFileSync(`${OUT}/${name}.wav`, b);
  console.log('wrote', name, (out.length / SR).toFixed(2) + 's');
}

// pentatonic-ish note table (Hz)
const N = { C4: 261.6, D4: 293.7, E4: 329.6, G4: 392.0, A4: 440.0, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784.0, A5: 880.0, C6: 1046.5 };

// --- click: a soft rounded "tok" -----------------------------------------
{ const o = buf(0.14); voice(o, 470, 0, 0.13, { gain: 0.5, attackMs: 6, tau: 0.04, parts: [[1, 1], [2, 0.18]] }); warm(o, 3200); norm(o, 0.5); writeWav('click', o); }

// --- cardPlay: a soft-but-present wooden tap (a piece set on the board) ----
{ const o = buf(0.17); voice(o, 300, 0, 0.09, { gain: 0.5, attackMs: 3, tau: 0.035, parts: [[1, 1], [2, 0.3], [3, 0.12]] }); voice(o, 140, 0, 0.06, { gain: 0.3, attackMs: 3, tau: 0.03, parts: [[1, 1]] }); noise(o, 0.001, 0.04, { gain: 0.3, cut: 2400, tau: 0.028, attackMs: 2 }); warm(o, 4400); norm(o, 0.66); writeWav('card-play', o); }

// --- cardDraw: a soft card slide "fwip" (clear, falling noise sweep) -------
{ const o = buf(0.2); noise(o, 0, 0.16, { gain: 0.55, cut: 2900, rise: -0.55, tau: 0.08, attackMs: 8 }); warm(o, 5200); norm(o, 0.6); writeWav('card-draw', o); }

// --- shuffle: soft riffle of muffled ticks -------------------------------
{ const o = buf(0.62); for (let i = 0; i < 7; i++) noise(o, 0.02 + i * 0.075 + Math.random() * 0.012, 0.05, { gain: 0.34 - i * 0.02, cut: 1300, tau: 0.03, attackMs: 3 }); warm(o, 2600); norm(o, 0.5); writeWav('shuffle', o); }

// --- build: warm woodblock/marimba "chunk" -------------------------------
{ const o = buf(0.3); voice(o, 150, 0, 0.1, { gain: 0.55, attackMs: 4, tau: 0.05, parts: [[1, 1], [2, 0.2]] }); voice(o, N.E4, 0.006, 0.26, { gain: 0.4, attackMs: 5, tau: 0.14, parts: [[1, 1], [2, 0.3], [3, 0.14]] }); warm(o, 4200); norm(o, 0.62); writeWav('build', o); }

// --- link: gentle two-note connect (rising fifth), bell-ish --------------
{ const o = buf(0.4); voice(o, N.G4, 0, 0.3, { gain: 0.42, tau: 0.16, bell: 0.05 }); voice(o, N.D5, 0.09, 0.32, { gain: 0.42, tau: 0.18, bell: 0.05 }); echo(o, 70, 0.16); warm(o, 4800); norm(o, 0.6); writeWav('link', o); }

// --- coins: mellow chime cluster (pentatonic), soft ----------------------
{ const o = buf(0.5); const seq = [N.C5, N.E5, N.G5]; seq.forEach((f, i) => voice(o, f, i * 0.05, 0.4, { gain: 0.4, tau: 0.2, bell: 0.06, parts: [[1, 1], [2, 0.22], [3, 0.1]] })); echo(o, 90, 0.2); warm(o, 5200); norm(o, 0.6); writeWav('coins', o); }

// --- turn: a clear, calm two-note rising bell ("it's your turn") ----------
{ const o = buf(0.6); const p = [[1, 1], [2, 0.3], [3, 0.13]]; voice(o, N.A4, 0, 0.32, { gain: 0.5, attackMs: 5, tau: 0.15, bell: 0.05, parts: p }); voice(o, N.E5, 0.11, 0.4, { gain: 0.54, attackMs: 5, tau: 0.2, bell: 0.06, parts: p }); echo(o, 85, 0.13); warm(o, 6000); norm(o, 0.68); writeWav('turn', o); }

// --- error: soft low descending pair (gentle "no", not buzzy) ------------
{ const o = buf(0.4); voice(o, N.E4, 0, 0.24, { gain: 0.45, attackMs: 8, tau: 0.13, parts: [[1, 1], [2, 0.12]] }); voice(o, N.C4, 0.13, 0.28, { gain: 0.45, attackMs: 8, tau: 0.16, parts: [[1, 1], [2, 0.12]] }); warm(o, 2600); norm(o, 0.55); writeWav('error', o); }

// --- win: calm ascending pentatonic arpeggio, soft bells + air -----------
{ const o = buf(1.5); const arp = [N.C5, N.E5, N.G5, N.A5, N.C6]; arp.forEach((f, i) => voice(o, f, i * 0.11, 1.1 - i * 0.05, { gain: 0.42, attackMs: 8, tau: 0.34 - i * 0.02, bell: 0.06, parts: [[1, 1], [2, 0.24], [3, 0.11]] })); voice(o, N.C4, 0.02, 0.7, { gain: 0.18, tau: 0.4, parts: [[1, 1], [2, 0.2]] }); echo(o, 130, 0.26); echo(o, 260, 0.14); warm(o, 5600); norm(o, 0.64); writeWav('win', o); }

console.log('done');
