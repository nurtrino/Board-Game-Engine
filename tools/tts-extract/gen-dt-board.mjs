// Compose a Dark Tower board face from the mod's own art: four kingdom
// quadrants of territory spaces (three arcs of cells, like the physical
// board), kingdom-tinted terrain, a colored rim band with the kingdom name,
// and each kingdom's crest cropped from its scorecard body.
// Output: client/public/darktower/board.png
// Run: node tools/tts-extract/gen-dt-board.mjs

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '../..');
const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
const OUT = path.join(ROOT, 'client/public/darktower');
const scene = JSON.parse(fs.readFileSync(path.join(OUT, 'scene.json'), 'utf8'));

const SIZE = 2048;
const C = SIZE / 2;
const rad = (a) => (a * Math.PI) / 180;
const px = (r, a) => [C + r * Math.cos(rad(a)), C + r * Math.sin(rad(a))];

// token i sits at angle (i/4)*2PI in the renderer (R=+x, B=+z, Y=-x, G=-z);
// +x = image right, +z = image bottom
const QUADS = [
  { seat: 'Red', angle: 0, cell: '#6b5140', rim: '#671f16', line: '#2a201a' },
  { seat: 'Blue', angle: 90, cell: '#4f5a68', rim: '#1c3a63', line: '#1c2129' },
  { seat: 'Yellow', angle: 180, cell: '#6b6344', rim: '#69581a', line: '#292518' },
  { seat: 'Green', angle: 270, cell: '#52604a', rim: '#1e4d20', line: '#1e2419' },
];

/** annular sector path between radii r1..r2 and angles a0..a1 */
const sector = (r1, r2, a0, a1) => {
  const [x0, y0] = px(r2, a0), [x1, y1] = px(r2, a1);
  const [x2, y2] = px(r1, a1), [x3, y3] = px(r1, a0);
  return `M ${x0} ${y0} A ${r2} ${r2} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r1} ${r1} 0 0 0 ${x3} ${y3} Z`;
};

// vary cell lightness a touch so the terrain doesn't read flat
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

let svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">`;
svg += `<circle cx="${C}" cy="${C}" r="${C - 6}" fill="#17130f"/>`;

// territory cells: three arcs per quadrant (3 / 4 / 5 spaces)
const ARCS = [
  { r1: 300, r2: 505, n: 3 },
  { r1: 545, r2: 760, n: 4 },
  { r1: 800, r2: 945, n: 5 },
];
for (const q of QUADS) {
  const span = 78; // degrees of cells within the 90-degree quadrant
  for (const [ai, arc] of ARCS.entries()) {
    const gap = 2.4;
    const step = span / arc.n;
    for (let i = 0; i < arc.n; i++) {
      const a0 = q.angle - span / 2 + i * step + gap / 2;
      const a1 = a0 + step - gap;
      const k = 0.9 + 0.16 * (((i + ai * 2 + (q.angle / 90)) % 3) / 2); // 0.9 - 1.06
      svg += `<path d="${sector(arc.r1, arc.r2, a0, a1)}" fill="${shade(q.cell, k)}" stroke="${q.line}" stroke-width="7" stroke-linejoin="round"/>`;
    }
  }
  // rim band + name
  svg += `<path d="${sector(962, 1022, q.angle - 44.4, q.angle + 44.4)}" fill="${q.rim}"/>`;
  const name = (scene.scorecards[q.seat]?.kingdom ?? '').toUpperCase();
  const [tx, ty] = px(990, q.angle);
  svg += `<text x="${tx}" y="${ty}" font-family="Georgia, serif" font-size="72" font-weight="bold"
    fill="rgba(236,224,196,0.92)" text-anchor="middle" dominant-baseline="middle"
    letter-spacing="12" transform="rotate(${q.angle + 90} ${tx} ${ty})">${name}</text>`;
}
// quadrant dividers (frontiers) + rims + tower base plate
for (const a of [45, 135]) {
  const [x0, y0] = px(C - 12, a), [x1, y1] = px(C - 12, a + 180);
  svg += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#5a4c3c" stroke-width="12"/>`;
  svg += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#17130f" stroke-width="4" stroke-dasharray="26 22"/>`;
}
svg += `<circle cx="${C}" cy="${C}" r="${C - 10}" fill="none" stroke="#5a4c3c" stroke-width="12"/>`;
svg += `<circle cx="${C}" cy="${C}" r="955" fill="none" stroke="#17130f" stroke-width="10"/>`;
svg += `<circle cx="${C}" cy="${C}" r="268" fill="#141110" stroke="#5a4c3c" stroke-width="8"/>`;
svg += '</svg>';

// crest emblems over the middle arc, reading from each kingdom's edge
const composites = [];
for (const q of QUADS) {
  const body = scene.scorecards[q.seat]?.body;
  if (!body) continue;
  const file = path.join(ROOT, 'client/public', body.slice(1));
  const meta = await sharp(file).metadata();
  const cut = await sharp(file)
    .extract({
      left: Math.round(meta.width * 0.33), top: Math.round(meta.height * 0.12),
      width: Math.round(meta.width * 0.34), height: Math.round(meta.height * 0.185),
    })
    .resize(230).png().toBuffer();
  const cm0 = await sharp(cut).metadata();
  const masked = await sharp(cut).composite([{
    input: Buffer.from(`<svg width="${cm0.width}" height="${cm0.height}"><rect width="100%" height="100%" rx="34" fill="#fff"/></svg>`),
    blend: 'dest-in',
  }]).png().toBuffer();
  const crest = await sharp(masked)
    .rotate(q.angle + 90, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const cm = await sharp(crest).metadata();
  const [cx, cy] = px(652, q.angle);
  composites.push({ input: crest, left: Math.round(cx - cm.width / 2), top: Math.round(cy - cm.height / 2) });
}

await sharp(Buffer.from(svg)).composite(composites).png().toFile(path.join(OUT, 'board.png'));
console.log('board.png written');
