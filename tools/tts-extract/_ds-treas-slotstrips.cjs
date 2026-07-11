// TEMP: zoomed slot-icon strips for all hand-slot candidate cards.
// Run from repo root: node tools/tts-extract/_ds-treas-slotstrips.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/chase/AppData/Local/Temp/claude/C--Users-chase-Desktop-Board-Game-Engine/83cf08bf-c658-49c6-bd83-6309f28971a2/scratchpad/ds-treas';
const CARDS = path.join(BASE, 'cards');
const OUT = path.join(BASE, 'contacts');

(async () => {
  const cand = [];
  for (let i = 1; i <= 8; i++) {
    const arr = JSON.parse(fs.readFileSync(path.join(BASE, 'out', `batch-${i}.json`), 'utf8'));
    for (const r of arr) {
      const s = (r.slotIcon || '').toLowerCase();
      if (s.startsWith('upgrade') || s === 'armour' || s === 'armor' || s.includes('none')) continue;
      cand.push({ id: `${r.group}__${r.cardID}`, name: r.name, rec: s });
    }
  }
  console.log('candidates:', cand.length);
  const PER = 12, CW = 200, CH = 240, LBL = 22;
  for (let s = 0; s * PER < cand.length; s++) {
    const chunk = cand.slice(s * PER, s * PER + PER);
    const comps = [];
    for (let i = 0; i < chunk.length; i++) {
      const col = i % 6, row = Math.floor(i / 6);
      const x = 4 + col * (CW + 4), y = 4 + row * (CH + LBL + 4);
      const label = chunk[i].id.replace(/^.*__/, '') + ' ' + (chunk[i].name || '').slice(0, 16);
      const svg = `<svg width="${CW}" height="${LBL}"><rect width="100%" height="100%" fill="white"/><text x="2" y="16" font-size="13" font-family="Arial" fill="black">${label.replace(/&/g, '+')}</text></svg>`;
      comps.push({ input: Buffer.from(svg), left: x, top: y });
      const src = sharp(path.join(CARDS, chunk[i].id + '.png'));
      const meta = await src.metadata();
      const ex = {
        left: Math.round(meta.width * 0.72),
        top: Math.round(meta.height * 0.155),
        width: Math.round(meta.width * 0.27),
        height: Math.round(meta.height * 0.215),
      };
      const img = await src.extract(ex).resize(CW, CH).png().toBuffer();
      comps.push({ input: img, left: x, top: y + LBL });
    }
    const W = 4 + 6 * (CW + 4), H = 4 + 2 * (CH + LBL + 4);
    await sharp({ create: { width: W, height: H, channels: 3, background: { r: 40, g: 40, b: 40 } } })
      .composite(comps).png().toFile(path.join(OUT, `slots-${String(s).padStart(2, '0')}.png`));
  }
  fs.writeFileSync(path.join(BASE, 'slot-candidates.json'), JSON.stringify(cand, null, 1));
  console.log('strips:', Math.ceil(cand.length / PER));
})();
