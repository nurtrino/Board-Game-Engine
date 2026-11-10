// Stages the Axis & Allies Anniversary world map for the web client.
// Source: client/public/axis/map-full.jpg (9500x4956 map art).
// Output: client/public/axis/map/base.jpg (whole map, 4096 wide),
//         client/public/axis/map/t-<col>-<row>.jpg (8x4 full-resolution tiles),
//         client/public/axis/map/tiles.json (tile rectangles in source pixels).
// Re-runnable: node tools/stage-axis-map.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'client/public/axis/map-full.jpg');
const out = path.join(root, 'client/public/axis/map');

const COLS = 8;
const ROWS = 4;
const BASE_WIDTH = 4096;
const BASE_QUALITY = 86;
const TILE_QUALITY = 88;

sharp.cache(false);

const meta = await sharp(src).metadata();
const W = meta.width;
const H = meta.height;
if (!W || !H) throw new Error(`cannot read dimensions of ${src}`);

// Clear previous outputs so a changed grid never leaves stale tiles behind.
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) {
  if (f === 'base.jpg' || f === 'tiles.json' || /^t-\d+-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(out, f));
}

// Even split; the last column/row absorb the remainder.
const tw = Math.floor(W / COLS);
const th = Math.floor(H / ROWS);
const tiles = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const x = col * tw;
    const y = row * th;
    const w = col === COLS - 1 ? W - x : tw;
    const h = row === ROWS - 1 ? H - y : th;
    tiles.push({ col, row, x, y, w, h, file: `/axis/map/t-${col}-${row}.jpg` });
  }
}

// Decode the source once, then cut every tile from the raw pixels.
const { data: raw, info } = await sharp(src, { limitInputPixels: false })
  .removeAlpha()
  .toColourspace('srgb')
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== W || info.height !== H) throw new Error('decoded size differs from metadata');
const rawOpts = { raw: { width: W, height: H, channels: info.channels }, limitInputPixels: false };

await sharp(raw, rawOpts)
  .resize({ width: BASE_WIDTH, kernel: 'lanczos3' })
  .jpeg({ quality: BASE_QUALITY, mozjpeg: true })
  .toFile(path.join(out, 'base.jpg'));

for (const t of tiles) {
  await sharp(raw, rawOpts)
    .extract({ left: t.x, top: t.y, width: t.w, height: t.h })
    .jpeg({ quality: TILE_QUALITY, mozjpeg: true })
    .toFile(path.join(out, path.basename(t.file)));
}

fs.writeFileSync(
  path.join(out, 'tiles.json'),
  JSON.stringify({ width: W, height: H, cols: COLS, rows: ROWS, tiles }, null, 2) + '\n',
);

// ---- Verify: rectangles tile the image exactly, and the files on disk have those sizes. ----
const fail = (m) => {
  console.error(`VERIFY FAILED: ${m}`);
  process.exitCode = 1;
};
const written = JSON.parse(fs.readFileSync(path.join(out, 'tiles.json'), 'utf8'));
if (written.tiles.length !== COLS * ROWS) fail(`expected ${COLS * ROWS} tiles, got ${written.tiles.length}`);
let area = 0;
for (const t of written.tiles) {
  area += t.w * t.h;
  // Each tile must start exactly where its left/upper neighbour ends.
  const left = written.tiles.find((o) => o.row === t.row && o.col === t.col - 1);
  const up = written.tiles.find((o) => o.col === t.col && o.row === t.row - 1);
  if (t.x !== (left ? left.x + left.w : 0)) fail(`t-${t.col}-${t.row} x gap/overlap`);
  if (t.y !== (up ? up.y + up.h : 0)) fail(`t-${t.col}-${t.row} y gap/overlap`);
  if (t.col === COLS - 1 && t.x + t.w !== W) fail(`t-${t.col}-${t.row} does not reach the right edge`);
  if (t.row === ROWS - 1 && t.y + t.h !== H) fail(`t-${t.col}-${t.row} does not reach the bottom edge`);
  if (t.w <= 0 || t.h <= 0) fail(`t-${t.col}-${t.row} is empty`);
}
if (area !== W * H) fail(`tile area ${area} != image area ${W * H}`);

let total = 0;
const rowsOut = [];
for (const t of written.tiles) {
  const p = path.join(out, path.basename(t.file));
  const m = await sharp(p).metadata();
  if (m.width !== t.w || m.height !== t.h) fail(`${t.file} is ${m.width}x${m.height}, expected ${t.w}x${t.h}`);
  const bytes = fs.statSync(p).size;
  total += bytes;
  rowsOut.push({ file: path.basename(t.file), x: t.x, y: t.y, w: t.w, h: t.h, bytes });
}
const baseMeta = await sharp(path.join(out, 'base.jpg')).metadata();
const baseBytes = fs.statSync(path.join(out, 'base.jpg')).size;
if (baseMeta.width !== BASE_WIDTH) fail(`base.jpg is ${baseMeta.width} wide`);

console.table(rowsOut);
console.log(`source ${W}x${H}; grid ${COLS}x${ROWS}; tile area sum ${area} (image ${W * H})`);
console.log(`base.jpg ${baseMeta.width}x${baseMeta.height} ${baseBytes} bytes`);
console.log(`tiles ${total} bytes; base + tiles ${total + baseBytes} bytes (${((total + baseBytes) / 1048576).toFixed(2)} MiB)`);
console.log(process.exitCode ? 'VERIFY: FAILED' : 'VERIFY: OK');
