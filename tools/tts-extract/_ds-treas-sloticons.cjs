const sharp = require('sharp');
const path = require('path');
const BASE = 'C:/Users/chase/AppData/Local/Temp/claude/C--Users-chase-Desktop-Board-Game-Engine/83cf08bf-c658-49c6-bd83-6309f28971a2/scratchpad/ds-treas';
const picks = ['core-treasure__2305', 'core-treasure__2306', 'core-treasure__2361', 'core-treasure__2325', 'classdeck-55__1813', 'core-treasure__2308'];
(async () => {
  const comps = []; const CW = 260, CH = 280, LBL = 24;
  for (let i = 0; i < picks.length; i++) {
    const img = await sharp(path.join(BASE, 'cards', picks[i] + '.png'))
      .extract({ left: 560, top: 180, width: 220, height: 320 })
      .resize(CW, CH, { fit: 'inside' }).png().toBuffer();
    const x = (i % 6) * (CW + 6) + 6, y = 6;
    const svg = `<svg width="${CW}" height="${LBL}"><rect width="100%" height="100%" fill="white"/><text x="3" y="17" font-size="13" font-family="Arial" fill="black">${picks[i].slice(0, 30)}</text></svg>`;
    comps.push({ input: Buffer.from(svg), left: x, top: y });
    comps.push({ input: img, left: x, top: y + LBL });
  }
  await sharp({ create: { width: 6 * (CW + 6) + 6, height: 330, channels: 3, background: { r: 40, g: 40, b: 40 } } })
    .composite(comps).png().toFile(path.join(BASE, 'contacts', 'slot-icons2.png'));
  console.log('ok');
})();
