// Blokus 20x20 — stage assets from the TTS mod cache (workshop 295656883,
// "Blokus 20x20") into client/public/blokus/ and write the golden.
//
// The mod is scriptless: 1 Custom_Board (the 20x20 grid art, imgur, cached)
// + 84 Custom_Models (21 pieces x 4 colors; flat 64x64 color diffuse per
// color, cached). 19 of 21 piece meshes live on dead pastebin links (never
// cached — even TTS could not fetch them), so the client rebuilds piece
// geometry procedurally at the authentic proportions measured from the two
// cached meshes (cell 0.775, height 0.284). The rulebook PDF is staged from
// the scripted Blokus mod (3063151698), whose assets download via the
// akamai host rewrite.
//
// Idempotent: re-runs overwrite staged outputs from the same cached inputs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/blokus');
const GOLDEN_DIR = path.join(ROOT, 'games/blokus/golden');

const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
const cached = (dir, url, exts) => {
  for (const ext of exts) {
    const f = path.join(MODS, dir, munge(url) + ext);
    if (fs.existsSync(f)) return f;
  }
  throw new Error(`not cached: ${url}`);
};

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(GOLDEN_DIR, { recursive: true });

const mod = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop/295656883.json'), 'utf8'));

// ---------- board art ----------
const board = mod.ObjectStates.find((o) => o.Name === 'Custom_Board');
const boardSrc = cached('Images', board.CustomImage.ImageURL, ['.png', '.jpg']);
await sharp(boardSrc).resize(2048, 2048).webp({ quality: 88 }).toFile(path.join(OUT, 'board.webp'));

// ---------- seat colors sampled from the mod's own piece diffuse maps ----------
// Board art (image space): Red top-left, Green top-right, Yellow bottom-left,
// Blue bottom-right. Official turn order: Blue, Yellow, Red, Green.
const DIFFUSE = {
  Blue: 'http://i.imgur.com/9L0xgba.jpg',
  Yellow: 'http://i.imgur.com/JpmAAA2.jpg',
  Red: 'http://i.imgur.com/7LNvZar.jpg',
  Green: 'http://i.imgur.com/A3uMF6r.jpg',
};
const colors = {};
for (const [seat, url] of Object.entries(DIFFUSE)) {
  const file = cached('Images', url, ['.png', '.jpg']);
  const { data } = await sharp(file).resize(1, 1, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
  colors[seat] = '#' + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------- rulebook (scripted mod 3063151698, akamai-downloadable) ----------
const RULEBOOK = 'http://cloud-3.steamusercontent.com/ugc/2122943287077844008/6437792799753219213D7341B5541919369223AC/';
try {
  const pdf = cached('PDF', RULEBOOK, ['.PDF', '.pdf']);
  fs.copyFileSync(pdf, path.join(OUT, 'rulebook.pdf'));
} catch {
  console.warn('rulebook PDF not cached; run download-mod-assets.mjs 3063151698');
}

// ---------- lobby tile composed from the mod's own board art + colors ----------
const tileSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640">
  <rect width="640" height="640" fill="rgba(5,6,9,0.55)"/>
  <g>
    ${[[70, 70, colors.Red, [[0, 0], [1, 0], [1, 1], [1, 2]]],
       [420, 70, colors.Green, [[0, 0], [1, 0], [2, 0], [1, 1]]],
       [70, 430, colors.Yellow, [[0, 0], [0, 1], [1, 1], [2, 1]]],
       [430, 420, colors.Blue, [[1, 0], [0, 1], [1, 1], [1, 2]]]]
      .map(([ox, oy, c, cells]) => cells
        .map(([x, y]) => `<rect x="${ox + x * 50}" y="${oy + y * 50}" width="46" height="46" rx="5" fill="${c}" stroke="rgba(0,0,0,0.35)" stroke-width="2"/>`)
        .join('')).join('')}
  </g>
  <text x="320" y="342" text-anchor="middle" font-family="Arial, sans-serif" font-size="86" font-weight="800" letter-spacing="14" fill="#e8ebf0">BLOKUS</text>
  <text x="320" y="392" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="10" fill="#9aa0ab">20 X 20</text>
</svg>`;
const boardBg = await sharp(boardSrc).resize(640, 640).modulate({ brightness: 0.55, saturation: 1.05 }).toBuffer();
await sharp(boardBg)
  .composite([{ input: Buffer.from(tileSvg) }])
  .webp({ quality: 88 })
  .toFile(path.join(OUT, 'box.webp'));

// ---------- golden ----------
// Piece proportions measured from the two cached authentic meshes:
//   .../14: 52 verts, 1.550 x 2.325 footprint (2x3 cells) · .../21: 0.775 x 3.098 (1x4)
//   => cell 0.775 world units, piece height 0.284, beveled edges.
const golden = {
  workshop: 295656883,
  size: 20,
  cellWorld: 0.775,
  pieceHeight: 0.284,
  boardArt: '/blokus/board.webp',
  // grid (x right, y down in art space) -> printed corner squares
  corners: { Blue: [19, 19], Yellow: [0, 19], Red: [0, 0], Green: [19, 0] },
  turnOrder: ['Blue', 'Yellow', 'Red', 'Green'],
  colors,
  // scoring per the official rulebook (staged rulebook.pdf): -1 per unplaced
  // square; +15 for placing all 21; +5 more when the monomino was placed last.
  scoring: { perSquare: -1, allPlaced: 15, monominoLast: 5 },
};
fs.writeFileSync(path.join(GOLDEN_DIR, 'blokus-data.json'), JSON.stringify(golden, null, 1));
fs.writeFileSync(path.join(ROOT, 'shared/src/blokus/data.json'), JSON.stringify(golden, null, 1));

console.log('staged board.webp, box.webp, rulebook.pdf; colors:', JSON.stringify(colors));
