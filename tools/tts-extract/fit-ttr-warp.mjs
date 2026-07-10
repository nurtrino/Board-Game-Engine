// Second-stage fit for the TTR map: the single homography (fit-ttr-map.mjs)
// leaves a smooth ~4-28px residual that grows toward the map edges — the table
// photo has lens/keystone distortion a projective map can't capture, so pieces
// (placed at world snaps) sit off their printed slots near the edges (worst in
// the Americas). This adds a regularized thin-plate-spline correction on top of
// the homography: for every strongly-coloured slot we find its blob centroid,
// and fit a smooth pixel->world displacement that lands each slot exactly on its
// piece. Client renders the map through homography-inverse + this correction.
//
// Writes mapTransform.warp = { ctrl:[[px,py]...], wx:[...], wz:[...], u0,v0,sc,lam }
// to the golden board.json and client scene.json. Run after fit-ttr-map.mjs.
//
// Run: node tools/tts-extract/fit-ttr-warp.mjs

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'games/ticket-to-ride-world/golden/board.json'), 'utf8'));
const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/public/ttr/scene.json'), 'utf8'));
const board = golden; // routes + snaps live here (mirror of shared board-data)

const MAP = path.join(ROOT, 'client/public', scene.map.image.slice(1));
const { data, info } = await sharp(MAP).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, CH = info.channels;
const px = (x, y) => { const i = (y * W + x) * CH; return [data[i], data[i + 1], data[i + 2]]; };

function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx !== mn) { if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6); else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2); else h = 60 * ((r - g) / (mx - mn) + 4); }
  if (h < 0) h += 360;
  if (s > 0.55 && v > 0.45) { if (h < 16 || h > 348) return 'Red'; if (h >= 40 && h < 68) return 'Yellow'; if (h >= 70 && h < 150) return 'Green'; if (h >= 275 && h < 348) return 'Purple'; }
  if (v < 0.28 && s < 0.5) return 'Black';
  return null;
}
const CLS = { Red: 'Red', Yellow: 'Yellow', Green: 'Green', Purple: 'Purple', Black: 'Black' };

const t = scene.mapTransform;
const Hm = [[t.h[0], t.h[1], t.h[2]], [t.h[3], t.h[4], t.h[5]], [t.h[6], t.h[7], 1]];
const applyH = (m, x, y) => { const w = m[2][0] * x + m[2][1] * y + m[2][2]; return [(m[0][0] * x + m[0][1] * y + m[0][2]) / w, (m[1][0] * x + m[1][1] * y + m[1][2]) / w]; };
function invMat(m) { const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2]; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g; const det = a * A + b * B + c * C; return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]]; }
const inv = invMat(Hm);
const toPx = (x, z) => applyH(Hm, x, z);

function centroidNear(cx, cy, cls, R) {
  let sx = 0, sy = 0, n = 0;
  const x0 = Math.max(0, cx - R | 0), x1 = Math.min(W - 1, cx + R | 0), y0 = Math.max(0, cy - R | 0), y1 = Math.min(H - 1, cy + R | 0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const [r, g, b] = px(x, y); if (classify(r, g, b) === cls) { sx += x; sy += y; n++; } }
  return n >= 15 ? [sx / n, sy / n] : null;
}

// anchors: printed slot blob pixel <-> the piece's world position, and the world
// displacement the map warp must add at that pixel (snap.world - invH(pixel)).
const ctrl = [], resWx = [], resWz = [];
for (const r of board.routes) {
  const cls = r.color && CLS[r.color]; if (!cls) continue;
  for (const si of r.snaps) {
    const s = board.snaps[si - 1];
    const [gx, gy] = toPx(s.pos[0], s.pos[2]);
    const c = centroidNear(gx, gy, cls, 30);
    if (!c || Math.hypot(c[0] - gx, c[1] - gy) > 45) continue;
    const bw = applyH(inv, c[0], c[1]);
    ctrl.push([c[0], c[1]]); resWx.push(s.pos[0] - bw[0]); resWz.push(s.pos[2] - bw[1]);
  }
}
console.log('warp anchors:', ctrl.length);

// thin-plate RBF fit with Tikhonov regularization (lam) — smooth enough to
// ignore centroid noise, exact enough to pin the slots (<1px residual).
const LAM = 600;
const U = (r) => (r < 1e-9 ? 0 : r * r * Math.log(r));
function rbfFit(pts, vals, lam) {
  const n = pts.length, N = n + 3;
  const M = Array.from({ length: N }, () => Array(N).fill(0)); const bx = Array(N).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) M[i][j] = U(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    M[i][i] += lam; M[i][n] = 1; M[i][n + 1] = pts[i][0]; M[i][n + 2] = pts[i][1]; bx[i] = vals[i];
  }
  for (let i = 0; i < n; i++) { M[n][i] = 1; M[n + 1][i] = pts[i][0]; M[n + 2][i] = pts[i][1]; }
  for (let c = 0; c < N; c++) {
    let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [bx[c], bx[p]] = [bx[p], bx[c]];
    for (let r = 0; r < N; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k < N; k++) M[r][k] -= f * M[c][k]; bx[r] -= f * bx[c]; }
  }
  return bx.map((v, i) => v / M[i][i]);
}
const wx = rbfFit(ctrl, resWx, LAM), wz = rbfFit(ctrl, resWz, LAM);
const rbfEval = (w, x, y) => { let s = w[ctrl.length] + w[ctrl.length + 1] * x + w[ctrl.length + 2] * y; for (let i = 0; i < ctrl.length; i++) s += w[i] * U(Math.hypot(x - ctrl[i][0], y - ctrl[i][1])); return s; };

// report residual after correction
const res = ctrl.map((c, i) => Math.hypot((rbfEval(wx, c[0], c[1]) - resWx[i]) * 33, (rbfEval(wz, c[0], c[1]) - resWz[i]) * 33));
const sorted = [...res].sort((a, b) => a - b);
console.log(`residual after warp: mean ${(res.reduce((a, b) => a + b, 0) / res.length).toFixed(2)}px  p90 ${sorted[Math.floor(res.length * 0.9)].toFixed(2)}px  max ${Math.max(...res).toFixed(2)}px`);

const warp = { ctrl: ctrl.map(([a, b]) => [+a.toFixed(1), +b.toFixed(1)]), wx: wx.map((v) => +v.toFixed(7)), wz: wz.map((v) => +v.toFixed(7)) };
golden.mapTransform = { ...golden.mapTransform, warp };
scene.mapTransform = { ...scene.mapTransform, warp };
fs.writeFileSync(path.join(ROOT, 'games/ticket-to-ride-world/golden/board.json'), JSON.stringify(golden, null, 1));
fs.writeFileSync(path.join(ROOT, 'client/public/ttr/scene.json'), JSON.stringify(scene));
console.log('saved mapTransform.warp to golden + scene');
