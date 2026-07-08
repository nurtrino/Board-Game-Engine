// Fit the world->map-pixel transform for TTR Rails & Sails by matching each
// route snap to the centroid of its printed slot's colored blob. Eyeballed
// anchors drift (slot art has bevels/shadows); this is the computational fit.
//
// Model: px = ax*wx + bx*wz + cx ; py = ay*wx + by*wz + cy  (full affine, so
// a tiny rotation is absorbed too). Iterative: project with the current fit,
// find the local color centroid in a window, refit on the pairs, repeat.
// Robust: drops the worst residuals each round; only strongly-colored routes
// participate (white/gray/black are ambiguous against the parchment/sea art).
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
// Pink and Purple both land in the magenta band; treat them as one class.
const CLASS_OF = { Red: 'Red', Yellow: 'Yellow', Green: 'Green', Purple: 'Purple', Pink: 'Purple' };

// participating snaps: (worldX, worldZ, colorClass)
const samples = [];
for (const r of golden.routes) {
  const cls = r.color && CLASS_OF[r.color];
  if (!cls) continue;
  for (const i of r.snaps) {
    const s = golden.snaps[i - 1];
    samples.push({ wx: s.pos[0], wz: s.pos[2], cls, snap: i });
  }
}
console.log(`samples: ${samples.length} snaps on strongly-colored routes`);

// initial fit (from the city-anchor estimate; only needs to be within ~40px)
let T = { ax: 1 / 0.0304, bx: 0, cx: 45.75 / 0.0304, ay: 0, by: -1 / 0.0329, cy: 27.84 / 0.0329 };

const project = (wx, wz) => [T.ax * wx + T.bx * wz + T.cx, T.ay * wx + T.by * wz + T.cy];

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

// least squares for px row and py row separately: [wx wz 1] * beta = target
function lsq(rows, targets) {
  // normal equations 3x3
  let M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], V = [0, 0, 0];
  rows.forEach((row, k) => {
    for (let i = 0; i < 3; i++) {
      V[i] += row[i] * targets[k];
      for (let j = 0; j < 3; j++) M[i][j] += row[i] * row[j];
    }
  });
  // solve 3x3 (gaussian)
  const A = M.map((r, i) => [...r, V[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r2 = c + 1; r2 < 3; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[p][c])) p = r2;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r2 = 0; r2 < 3; r2++) {
      if (r2 === c) continue;
      const f = A[r2][c] / A[c][c];
      for (let c2 = c; c2 < 4; c2++) A[r2][c2] -= f * A[c][c2];
    }
  }
  return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

for (let iter = 0; iter < 4; iter++) {
  const R = iter === 0 ? 55 : 35;
  const pairs = [];
  for (const s of samples) {
    const [gx, gy] = project(s.wx, s.wz);
    if (gx < 0 || gx > W || gy < 0 || gy > H) continue;
    const c = centroidNear(gx, gy, s.cls, R);
    if (c) pairs.push({ s, tx: c[0], ty: c[1], d: Math.hypot(c[0] - gx, c[1] - gy) });
  }
  // robust: drop worst 20%
  pairs.sort((a, b) => a.d - b.d);
  const keep = pairs.slice(0, Math.floor(pairs.length * 0.8));
  const rows = keep.map(({ s }) => [s.wx, s.wz, 1]);
  const [ax, bx, cx] = lsq(rows, keep.map((p) => p.tx));
  const [ay, by, cy] = lsq(rows, keep.map((p) => p.ty));
  T = { ax, bx, cx, ay, by, cy };
  const res = keep.map((p) => {
    const [gx, gy] = project(p.s.wx, p.s.wz);
    return Math.hypot(gx - p.tx, gy - p.ty);
  });
  const mean = res.reduce((a, b) => a + b, 0) / res.length;
  const max = Math.max(...res);
  console.log(`iter ${iter}: ${pairs.length} matched, kept ${keep.length}, mean residual ${mean.toFixed(1)}px, max ${max.toFixed(1)}px`);
}

console.log('T =', JSON.stringify(T, (k, v) => typeof v === 'number' ? +v.toFixed(6) : v));

// persist: world -> pixel affine + the inverse plane placement for rendering.
// The 3D map plane: world rect covering the full image via the inverse affine.
const inv = (() => {
  const det = T.ax * T.by - T.bx * T.ay;
  return {
    wxOfPx: (x, y) => (T.by * (x - T.cx) - T.bx * (y - T.cy)) / det,
    wzOfPx: (x, y) => (-T.ay * (x - T.cx) + T.ax * (y - T.cy)) / det,
  };
})();
const corners = {
  tl: [inv.wxOfPx(0, 0), inv.wzOfPx(0, 0)],
  br: [inv.wxOfPx(W, H), inv.wzOfPx(W, H)],
};
console.log('map plane world corners:', JSON.stringify(corners, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));

golden.mapTransform = { ...T, px: [W, H] };
fs.writeFileSync(path.join(ROOT, 'games/ticket-to-ride-world/golden/board.json'), JSON.stringify(golden, null, 1));
scene.mapTransform = { ...T, px: [W, H] };
fs.writeFileSync(path.join(ROOT, 'client/public/ttr/scene.json'), JSON.stringify(scene));
console.log('saved mapTransform to golden + scene');
