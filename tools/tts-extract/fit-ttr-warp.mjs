// Second-stage placement fix for TTR. The single homography (fit-ttr-map.mjs)
// leaves a smooth residual that grows toward the map edges (the table photo has
// lens/keystone distortion a projective map can't capture), so a piece placed at
// its raw world snap sits up to ~28px off its printed slot near the edges (worst
// in the Americas). Warping the MAP to compensate visibly bends the board, so
// instead we correct the PIECES: for every strongly-coloured (or black) slot we
// find its printed blob centroid and move that piece exactly onto it; the few
// white/grey slots we can't colour-match get a smooth, bounded estimate.
//
// Bakes the corrected render positions into client scene.json's `snaps` (the
// golden board.json snaps stay the original mod values, so re-running is
// idempotent). The map keeps rendering through the plain homography — un-warped.
//
// Run after fit-ttr-map.mjs: node tools/tts-extract/fit-ttr-warp.mjs

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

// Locate each slot's printed blob with a two-pass centroid (coarse find, then
// re-centre a tight window so an adjacent same-colour slot can't bias it).
function blobCentre(gx, gy, cls) {
  const c1 = centroidNear(gx, gy, cls, 45);
  if (!c1 || Math.hypot(c1[0] - gx, c1[1] - gy) > 55) return null;
  const c2 = centroidNear(c1[0], c1[1], cls, 22) || c1;
  return c2;
}

// For each snap on a strongly-coloured (or black) route, find its slot centroid
// and record: the exact centroid (to place that piece dead-on its slot) plus a
// world displacement (snap.world - invH(centroid)) that seeds a smooth estimate
// for the white/grey routes whose colour can't be matched on the parchment.
const snapBlob = new Map();      // 1-based snap index -> [px,py]
const ctrl = [], resWx = [], resWz = [];
for (const r of board.routes) {
  const cls = r.color && CLS[r.color]; if (!cls) continue;
  for (const si of r.snaps) {
    const s = board.snaps[si - 1];
    const [gx, gy] = toPx(s.pos[0], s.pos[2]);
    const c = blobCentre(gx, gy, cls);
    if (!c) continue;
    snapBlob.set(si, c);
    const bw = applyH(inv, c[0], c[1]);
    ctrl.push([c[0], c[1]]); resWx.push(s.pos[0] - bw[0]); resWz.push(s.pos[2] - bw[1]);
  }
}
console.log(`slot anchors: ${ctrl.length} (of ${board.snaps.length} snaps)`);

// smooth fallback for un-matched snaps: Gaussian-weighted average of nearby
// anchor displacements — bounded, and 0 far from any anchor (so an isolated
// snap keeps its original position rather than being flung).
const SIGMA = 100, BIAS = 0.05, inv2s2 = 1 / (2 * SIGMA * SIGMA);
function shepard(x, y) {
  let sw = 0, sdx = 0, sdz = 0;
  for (let i = 0; i < ctrl.length; i++) {
    const dx = x - ctrl[i][0], dy = y - ctrl[i][1];
    const wgt = Math.exp(-(dx * dx + dy * dy) * inv2s2);
    sw += wgt; sdx += wgt * resWx[i]; sdz += wgt * resWz[i];
  }
  const denom = sw + BIAS;
  return [sdx / denom, sdz / denom];
}

// bake corrected render positions into scene.snaps; golden snaps stay the
// original mod values so this stays idempotent on re-run.
let exact = 0, smooth = 0, maxMove = 0;
const outSnaps = board.snaps.map((s, idx) => {
  const si = idx + 1, blob = snapBlob.get(si);
  let wx, wz;
  if (blob) { const bw = applyH(inv, blob[0], blob[1]); wx = bw[0]; wz = bw[1]; exact++; }
  else { const [gx, gy] = toPx(s.pos[0], s.pos[2]); const [dx, dz] = shepard(gx, gy); wx = s.pos[0] - dx; wz = s.pos[2] - dz; smooth++; }
  maxMove = Math.max(maxMove, Math.hypot((wx - s.pos[0]) * 33, (wz - s.pos[2]) * 33));
  return { pos: [+wx.toFixed(3), s.pos[1], +wz.toFixed(3)], rot: s.rot };
});
// verify: matched pieces should now project onto their centroids (~0px)
const chk = [...snapBlob].map(([si, blob]) => { const p = outSnaps[si - 1].pos; const [px, py] = toPx(p[0], p[2]); return Math.hypot(px - blob[0], py - blob[1]); });
console.log(`baked: ${exact} exact + ${smooth} smoothed; matched-piece residual max ${Math.max(...chk).toFixed(2)}px; max piece move ${maxMove.toFixed(0)}px`);

if (golden.mapTransform.warp) delete golden.mapTransform.warp;
if (scene.mapTransform.warp) delete scene.mapTransform.warp;
scene.snaps = outSnaps;
fs.writeFileSync(path.join(ROOT, 'games/ticket-to-ride-world/golden/board.json'), JSON.stringify(golden, null, 1));
fs.writeFileSync(path.join(ROOT, 'client/public/ttr/scene.json'), JSON.stringify(scene));
console.log('baked corrected snaps into client scene.json (map + golden snaps left pristine)');
