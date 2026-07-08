// Fit the world->map-pixel transform for TTR Rails & Sails by matching each
// route snap to the centroid of its printed slot's colored blob. Eyeballed
// anchors drift (slot art has bevels/shadows); this is the computational fit.
//
// Model: a HOMOGRAPHY (projective), which absorbs the map art's slight
// perspective/keystone that a plain affine leaves as a few px of residual near
// the edges. Stored as h[8] (px = (h0 wx + h1 wz + h2)/(h6 wx + h7 wz + 1),
// py likewise with h3..h5). A best-fit affine (ax..cy) is stored alongside for
// legacy tools; the client renders through the homography.
// Iterative: project with the current fit, find the local color centroid in a
// window, refit on the pairs, drop the worst residuals, repeat. Only strongly-
// coloured routes participate (white/gray/black are ambiguous on the parchment).
//
// Run: node tools/tts-extract/fit-ttr-map.mjs

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'games/ticket-to-ride-world/golden/board.json'), 'utf8'));
const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/public/ttr/scene.json'), 'utf8'));

const MAP = path.join(ROOT, 'client/public', scene.map.image.slice(1));
const { data, info } = await sharp(MAP).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, CH = info.channels;

const px = (x, y) => {
  const i = (y * W + x) * CH;
  return [data[i], data[i + 1], data[i + 2]];
};

// hue/sat/val classifiers for the strongly-colored slot paints
function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx !== mn) {
    if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6);
    else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
    else h = 60 * ((r - g) / (mx - mn) + 4);
  }
  if (h < 0) h += 360;
  if (s > 0.55 && v > 0.45) {
    if (h < 16 || h > 348) return 'Red';
    if (h >= 40 && h < 68) return 'Yellow';
    if (h >= 70 && h < 150) return 'Green';
    if (h >= 275 && h < 348) return 'Purple';
  }
  return null;
}
const CLASS_OF = { Red: 'Red', Yellow: 'Yellow', Green: 'Green', Purple: 'Purple', Pink: 'Purple' };

// participating snaps: (worldX, worldZ, colorClass)
const samples = [];
for (const r of golden.routes) {
  const cls = r.color && CLASS_OF[r.color];
  if (!cls) continue;
  for (const i of r.snaps) {
    const s = golden.snaps[i - 1];
    samples.push({ wx: s.pos[0], wz: s.pos[2], cls });
  }
}
console.log(`samples: ${samples.length} snaps on strongly-colored routes`);

// homography as h[8]; initial = the affine city-anchor estimate (h6=h7=0)
let h = [1 / 0.0304, 0, 45.75 / 0.0304, 0, -1 / 0.0329, 27.84 / 0.0329, 0, 0];
const project = (wx, wz) => {
  const d = h[6] * wx + h[7] * wz + 1;
  return [(h[0] * wx + h[1] * wz + h[2]) / d, (h[3] * wx + h[4] * wz + h[5]) / d];
};

function centroidNear(cx, cy, cls, R) {
  let sx = 0, sy = 0, n = 0;
  const x0 = Math.max(0, Math.round(cx - R)), x1 = Math.min(W - 1, Math.round(cx + R));
  const y0 = Math.max(0, Math.round(cy - R)), y1 = Math.min(H - 1, Math.round(cy + R));
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const [r, g, b] = px(x, y);
      if (classify(r, g, b) === cls) { sx += x; sy += y; n++; }
    }
  }
  return n >= 30 ? [sx / n, sy / n, n] : null;
}

// solve a linear least-squares system A beta = b via normal equations
function solveNormal(A, b) {
  const n = A[0].length;
  const M = Array.from({ length: n }, () => Array(n + 1).fill(0));
  for (let r = 0; r < A.length; r++) {
    for (let i = 0; i < n; i++) {
      M[i][n] += A[r][i] * b[r];
      for (let j = 0; j < n; j++) M[i][j] += A[r][i] * A[r][j];
    }
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// homography DLT (8 params) from world->pixel pairs
function fitHomography(pairs) {
  const A = [], b = [];
  for (const p of pairs) {
    A.push([p.wx, p.wz, 1, 0, 0, 0, -p.wx * p.tx, -p.wz * p.tx]); b.push(p.tx);
    A.push([0, 0, 0, p.wx, p.wz, 1, -p.wx * p.ty, -p.wz * p.ty]); b.push(p.ty);
  }
  return solveNormal(A, b);
}
// best-fit affine (for legacy tools + fallback)
function fitAffine(pairs) {
  const rows = pairs.map((p) => [p.wx, p.wz, 1]);
  const [ax, bx, cx] = solveNormal(rows, pairs.map((p) => p.tx));
  const [ay, by, cy] = solveNormal(rows, pairs.map((p) => p.ty));
  return { ax, bx, cx, ay, by, cy };
}

let kept = [];
for (let iter = 0; iter < 5; iter++) {
  const R = iter === 0 ? 55 : 32;
  const pairs = [];
  for (const s of samples) {
    const [gx, gy] = project(s.wx, s.wz);
    if (gx < 0 || gx > W || gy < 0 || gy > H) continue;
    const c = centroidNear(gx, gy, s.cls, R);
    if (c) pairs.push({ wx: s.wx, wz: s.wz, tx: c[0], ty: c[1], d: Math.hypot(c[0] - gx, c[1] - gy) });
  }
  pairs.sort((a, b) => a.d - b.d);
  kept = pairs.slice(0, Math.floor(pairs.length * 0.85)); // drop worst 15%
  h = fitHomography(kept);
  const res = kept.map((p) => { const [gx, gy] = project(p.wx, p.wz); return Math.hypot(gx - p.tx, gy - p.ty); });
  const mean = res.reduce((a, b) => a + b, 0) / res.length;
  const sorted = [...res].sort((a, b) => a - b);
  console.log(`iter ${iter}: ${pairs.length} matched, kept ${kept.length}, mean ${mean.toFixed(1)}px, p90 ${sorted[Math.floor(res.length * 0.9)].toFixed(1)}px, max ${Math.max(...res).toFixed(1)}px`);
}

const affine = fitAffine(kept);
const T = { ...affine, h: h.map((v) => +v.toFixed(9)), px: [W, H] };
console.log('homography h =', JSON.stringify(T.h));

golden.mapTransform = T;
fs.writeFileSync(path.join(ROOT, 'games/ticket-to-ride-world/golden/board.json'), JSON.stringify(golden, null, 1));
scene.mapTransform = T;
fs.writeFileSync(path.join(ROOT, 'client/public/ttr/scene.json'), JSON.stringify(scene));
console.log('saved mapTransform (homography + affine) to golden + scene');
