// TEMP: classify the equipment-slot glyph on every solo card crop by template matching.
// Templates: bird (two-handed), fist (one-handed), twofists (two-handed weapon), armour (torso).
// Run from repo root: node tools/tts-extract/_ds-treas-slotclassify.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/chase/AppData/Local/Temp/claude/C--Users-chase-Desktop-Board-Game-Engine/83cf08bf-c658-49c6-bd83-6309f28971a2/scratchpad/ds-treas';
const CARDS = path.join(BASE, 'cards');

// slot icon circle in the 780x1170 solo crops
const REGION = { left: 585, top: 215, width: 180, height: 180 };
const SIZE = 48;

const TEMPLATES = {
  bird: 'core-treasure__2305.png',       // Great Magic Weapon — spread bird = two-handed
  fist: 'classdeck-59__2531.png',        // Torch — hand gripping = one-handed
  twofists: 'core-treasure__2361.png',   // Halberd — two fists on shaft = two-handed weapon
  armour: 'core-treasure__2343.png',     // Firelink Armour — torso
};

async function vec(file) {
  const buf = await sharp(path.join(CARDS, file))
    .extract(REGION).resize(SIZE, SIZE).grayscale().normalise().raw().toBuffer();
  return buf;
}
function rmse(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s / a.length);
}

(async () => {
  const t = {};
  for (const [k, f] of Object.entries(TEMPLATES)) t[k] = await vec(f);
  const files = fs.readdirSync(CARDS).filter((f) => f.endsWith('.png') && !f.includes('__back'));
  const out = {};
  for (const f of files) {
    const v = await vec(f);
    let best = null, bestD = Infinity, second = Infinity;
    for (const [k, tv] of Object.entries(t)) {
      const d = rmse(v, tv);
      if (d < bestD) { second = bestD; bestD = d; best = k; }
      else if (d < second) second = d;
    }
    const id = f.replace('.png', '');
    out[id] = { cls: best, d: Math.round(bestD), margin: Math.round(second - bestD) };
  }
  fs.writeFileSync(path.join(BASE, 'slot-classes.json'), JSON.stringify(out, null, 1));
  // summary
  const counts = {};
  for (const v of Object.values(out)) counts[v.cls] = (counts[v.cls] || 0) + 1;
  console.log(counts);
  // low-margin (ambiguous) cases
  const low = Object.entries(out).filter(([, v]) => v.margin < 8).map(([k, v]) => `${k} ${v.cls} m${v.margin}`);
  console.log('low margin:', low.length);
  low.forEach((l) => console.log(' ', l));
})();
