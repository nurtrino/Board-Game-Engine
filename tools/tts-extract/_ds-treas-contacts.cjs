// TEMP: build labeled 6-card contact sheets per batch manifest from solo crops.
// Run from repo root: node tools/tts-extract/_ds-treas-contacts.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/chase/AppData/Local/Temp/claude/C--Users-chase-Desktop-Board-Game-Engine/83cf08bf-c658-49c6-bd83-6309f28971a2/scratchpad/ds-treas';
const CARDS = path.join(BASE, 'cards');
const OUT = path.join(BASE, 'contacts');
fs.mkdirSync(OUT, { recursive: true });

const CW = 390, CH = 585, LBL = 26, GAP = 6;
const COLS = 3, ROWS = 2;
const W = COLS * CW + (COLS + 1) * GAP;
const H = ROWS * (CH + LBL) + (ROWS + 1) * GAP;

async function contact(files, outFile) {
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = GAP + col * (CW + GAP);
    const y = GAP + row * (CH + LBL + GAP);
    const label = files[i].replace('.png', '');
    const svg = Buffer.from(
      `<svg width="${CW}" height="${LBL}"><rect width="100%" height="100%" fill="white"/><text x="4" y="19" font-size="17" font-family="Arial" fill="black">${label}</text></svg>`
    );
    comps.push({ input: svg, left: x, top: y });
    const img = await sharp(path.join(CARDS, files[i])).resize(CW, CH).png().toBuffer();
    comps.push({ input: img, left: x, top: y + LBL });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 40, g: 40, b: 40 } } })
    .composite(comps).png().toFile(outFile);
}

(async () => {
  for (let b = 1; b <= 8; b++) {
    const man = JSON.parse(fs.readFileSync(path.join(BASE, `manifest-${b}.json`), 'utf8'));
    for (let s = 0; s * 6 < man.length; s++) {
      const chunk = man.slice(s * 6, s * 6 + 6);
      const out = path.join(OUT, `b${b}-s${String(s).padStart(2, '0')}.png`);
      await contact(chunk, out);
    }
    console.log('batch', b, 'sheets', Math.ceil(man.length / 6));
  }
})();
