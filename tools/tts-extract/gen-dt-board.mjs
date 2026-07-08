// Compose a Dark Tower board face from the mod's own art: four kingdom
// quadrants in the mod's seat colors, each bearing its kingdom crest + name
// cropped from that kingdom's scorecard body. Output: client/public/darktower/board.png
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

// token i sits at angle (i/4)*2PI in the renderer (R=+x, B=+z, Y=-x, G=-z);
// circleGeometry UVs put +x at image right and +z at image BOTTOM (v flipped)
const QUADS = [
  { seat: 'Red', angle: 0, fill: '#3a1512' },
  { seat: 'Blue', angle: 90, fill: '#101c33' },
  { seat: 'Yellow', angle: 180, fill: '#332a10' },
  { seat: 'Green', angle: 270, fill: '#122912' },
];

const wedge = (a0, a1) => {
  const r = C - 10;
  const p = (a) => [C + r * Math.cos((a * Math.PI) / 180), C + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M ${C} ${C} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
};

let svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">`;
svg += `<circle cx="${C}" cy="${C}" r="${C - 6}" fill="#241f19"/>`;
for (const q of QUADS) {
  svg += `<path d="${wedge(q.angle - 45, q.angle + 45)}" fill="${q.fill}"/>`;
}
// faint radial texture rings
for (let r = 220; r < C - 40; r += 150) {
  svg += `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="3"/>`;
}
// quadrant dividers + rim
for (const a of [45, 135]) {
  const dx = Math.cos((a * Math.PI) / 180) * (C - 10), dy = Math.sin((a * Math.PI) / 180) * (C - 10);
  svg += `<line x1="${C - dx}" y1="${C - dy}" x2="${C + dx}" y2="${C + dy}" stroke="#57493a" stroke-width="10"/>`;
}
svg += `<circle cx="${C}" cy="${C}" r="${C - 12}" fill="none" stroke="#57493a" stroke-width="14"/>`;
svg += `<circle cx="${C}" cy="${C}" r="${C - 44}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="4"/>`;
// kingdom names arc along each quadrant's outer edge, reading from outside
for (const q of QUADS) {
  const name = (scene.scorecards[q.seat]?.kingdom ?? '').toUpperCase();
  const tx = C + Math.cos((q.angle * Math.PI) / 180) * (C - 120);
  const ty = C + Math.sin((q.angle * Math.PI) / 180) * (C - 120);
  svg += `<text x="${tx}" y="${ty}" font-family="Georgia, serif" font-size="84" font-weight="bold"
    fill="rgba(233,220,190,0.85)" text-anchor="middle" dominant-baseline="middle"
    letter-spacing="14" transform="rotate(${q.angle + 90} ${tx} ${ty})">${name}</text>`;
}
svg += '</svg>';

// crest crops from the scorecard bodies (crest block: x 25-75%, y 11-31%)
const composites = [];
for (const q of QUADS) {
  const body = scene.scorecards[q.seat]?.body;
  if (!body) continue;
  const file = path.join(ROOT, 'client/public', body.slice(1));
  const meta = await sharp(file).metadata();
  // sharp applies resize/rotate before composite within one pipeline — do
  // extract+resize, mask, and rotate as separate passes
  const cut = await sharp(file)
    .extract({
      left: Math.round(meta.width * 0.30), top: Math.round(meta.height * 0.115),
      width: Math.round(meta.width * 0.40), height: Math.round(meta.height * 0.20),
    })
    .resize(360).png().toBuffer();
  const cutMeta = await sharp(cut).metadata();
  const masked = await sharp(cut).composite([{
    input: Buffer.from(`<svg width="${cutMeta.width}" height="${cutMeta.height}"><rect width="100%" height="100%" rx="28" fill="#fff"/></svg>`),
    blend: 'dest-in',
  }]).png().toBuffer();
  const crest = await sharp(masked)
    .rotate(q.angle + 90, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const cm = await sharp(crest).metadata();
  const cx = C + Math.cos((q.angle * Math.PI) / 180) * (C - 420);
  const cy = C + Math.sin((q.angle * Math.PI) / 180) * (C - 420);
  composites.push({ input: crest, left: Math.round(cx - cm.width / 2), top: Math.round(cy - cm.height / 2) });
}

await sharp(Buffer.from(svg)).composite(composites).png().toFile(path.join(OUT, 'board.png'));
console.log('board.png written');
