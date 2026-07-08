// Assign each route its PRINTED color by sampling the map art at its snap
// centers. The mod's road_names only tag colors to disambiguate double
// routes, so 65 genuinely-colored routes came through as gray. Reads the
// fitted world->pixel transform (games/.../board.json) to find each snap's
// pixel, classifies the slot color, and takes the route's majority vote.
//
// Slot colors: the 6 travel-card colors (Red/Yellow/Green/Purple/Black/White)
// or gray (null = wild). Ship (oval) and rail (rectangle) slots both apply.
//
// Run: node tools/tts-extract/detect-route-colors.mjs   (writes into golden + shared)

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const GOLDEN = path.join(ROOT, 'games/ticket-to-ride-world/golden/board.json');
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/public/ttr/scene.json'), 'utf8'));
const T = golden.mapTransform;

const MAP = path.join(ROOT, 'client/public', scene.map.image.slice(1));
const { data, info } = await sharp(MAP).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, CH = info.channels;
const px = (x, y) => { const i = (y * W + x) * CH; return [data[i], data[i + 1], data[i + 2]]; };
const project = (wx, wz) => [T.ax * wx + T.bx * wz + T.cx, T.ay * wx + T.by * wz + T.cy];

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx ? d / mx : 0, mx];
}

/** Classify one pixel into a slot color, or null if it's board (sea/land) or a
 *  gray (wild) route — those two look alike (warm parchment) and are handled
 *  by the route-level fallback, not here. */
function classifyPixel(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  // strong colors
  if (s > 0.45 && v > 0.4) {
    if (h < 18 || h >= 345) return 'Red';
    if (h >= 40 && h < 70) return 'Yellow';
    if (h >= 75 && h < 165) return 'Green';
    if (h >= 265 && h < 345) return 'Purple';
    if (h >= 175 && h < 260) return 'sea'; // blue water — ignore
    return null;
  }
  // black slot: dark + low saturation
  if (v < 0.30 && s < 0.55) return 'Black';
  // Neutral (low-sat, not-warm) slots split by brightness: white slots are
  // bright (~0.88), gray/wild routes are dim neutral (~0.70). Warm pixels are
  // tan land — excluded so they don't pollute either bucket.
  const warm = r - b;
  if (s < 0.16 && warm < 24) {
    if (v > 0.82) return 'White';
    if (v > 0.58) return 'Gray';
  }
  return null; // tan land / edges -> undecided
}

const votesFor = (cx, cy, R) => {
  const tally = {};
  const x0 = Math.max(0, Math.round(cx - R)), x1 = Math.min(W - 1, Math.round(cx + R));
  const y0 = Math.max(0, Math.round(cy - R)), y1 = Math.min(H - 1, Math.round(cy + R));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = classifyPixel(...px(x, y));
    if (c && c !== 'sea') tally[c] = (tally[c] ?? 0) + 1;
  }
  return tally;
};

let changed = 0;
const summary = {};
for (const r of golden.routes) {
  // sample each snap; merge votes across the route
  const merged = {};
  let total = 0;
  for (const si of r.snaps) {
    const s = golden.snaps[si - 1];
    const [gx, gy] = project(s.pos[0], s.pos[2]);
    const t = votesFor(gx, gy, 9);
    for (const [k, v] of Object.entries(t)) { merged[k] = (merged[k] ?? 0) + v; total += v; }
  }
  const ranked = Object.entries(merged).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  // Require a clear winner covering a decent share of the slot; else gray.
  // 'Gray' wins map to null (a wild route claimable with any single color).
  let detected = top && top[1] >= 12 && top[1] / Math.max(1, total) > 0.45 ? top[0] : null;
  if (detected === 'Gray') detected = null;

  // Trust the mod's explicit color tag when present (double-route disambig);
  // 'Pink' in the mod == Purple art.
  const tagged = r.color === 'Pink' ? 'Purple' : r.color;
  const final = tagged ?? detected;
  if (final !== r.color) changed++;
  r.color = final ?? null;
  summary[r.color ?? 'gray'] = (summary[r.color ?? 'gray'] ?? 0) + 1;
}

console.log('route colors after detection:', JSON.stringify(summary, null, 1));
console.log(`updated ${changed} routes`);

fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 1));
// mirror to the engine copy
fs.writeFileSync(path.join(ROOT, 'shared/src/ttr/board-data.json'), JSON.stringify(golden, null, 1));
console.log('wrote golden + shared/src/ttr/board-data.json');
