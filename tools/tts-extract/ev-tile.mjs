// Everdell lobby tile: composed from the mod's own art (main-deck card back
// crop + SVG title bar), per the playbook's no-stock-images rule.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PUB = path.join(ROOT, 'client/public/everdell');

// board art center (the Ever Tree roots + river) as the backdrop
const bg = await sharp(path.join(PUB, 'board.webp'))
  .extract({ left: 320, top: 60, width: 1500, height: 1500 })
  .resize(640, 640)
  .modulate({ brightness: 0.62, saturation: 1.05 })
  .flatten({ background: '#0a0d10' }) // board alpha corners go dark, not grey
  .toBuffer();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640">
  <rect width="640" height="640" fill="rgba(4,7,5,0.35)"/>
  <text x="320" y="352" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
    font-size="92" font-weight="700" letter-spacing="6" fill="#f2ead2"
    stroke="rgba(20,26,14,0.85)" stroke-width="10" paint-order="stroke">EVERDELL</text>
</svg>`;

await sharp(bg)
  .composite([{ input: Buffer.from(svg) }])
  .webp({ quality: 88 })
  .toFile(path.join(PUB, 'box.webp'));
console.log('wrote everdell/box.webp');
