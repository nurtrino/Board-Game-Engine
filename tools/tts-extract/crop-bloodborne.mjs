// Crop Bloodborne card cells (full cache resolution) for transcription.
// Usage:
//   node tools/tts-extract/crop-bloodborne.mjs <sheetName> <cells|all> [--back] [--out dir]
// sheetName = golden/sheets.json name (e.g. core-tiles-5, the-long-hunt).
// Writes games/bloodborne/transcribe/<sheetName>/c<NN>[-back].png
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const sheets = JSON.parse(fs.readFileSync(path.join(ROOT, 'games/bloodborne/golden/sheets.json'), 'utf8'));
const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
const findImg = (url) => {
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    const p = path.join(MODS, 'Images', munge(url) + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

const [name, cellsArg, ...rest] = process.argv.slice(2);
const back = rest.includes('--back');
const outIx = rest.indexOf('--out');
const entry = Object.entries(sheets).find(([, s]) => s.name === name);
if (!entry) { console.error('unknown sheet', name, '— names:', Object.values(sheets).map((s) => s.name).join(', ')); process.exit(1); }
const [faceUrl, s] = entry;
const url = back ? s.backUrl : faceUrl;
const src = findImg(url);
if (!src) { console.error('cache miss', url); process.exit(1); }
const outDir = outIx >= 0 ? rest[outIx + 1] : path.join(ROOT, 'games/bloodborne/transcribe', name);
fs.mkdirSync(outDir, { recursive: true });

const meta = await sharp(src, { limitInputPixels: 1e9 }).metadata();
const cw = Math.floor(meta.width / s.w), ch = Math.floor(meta.height / s.h);
const cells = cellsArg === 'all' ? s.cells : cellsArg.split(',').map(Number);
for (const c of cells) {
  const x = (c % s.w) * cw, y = Math.floor(c / s.w) * ch;
  const dst = path.join(outDir, `c${String(c).padStart(2, '0')}${back ? '-back' : ''}.png`);
  await sharp(src, { limitInputPixels: 1e9 }).extract({ left: x, top: y, width: cw, height: ch }).png().toFile(dst);
  console.log(dst, `${cw}x${ch}`);
}
