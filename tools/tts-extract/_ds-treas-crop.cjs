// TEMP script: crop every Dark Souls TBG treasure/equipment card to solo PNGs.
// Run from repo root: node tools/tts-extract/_ds-treas-crop.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REPO = 'C:/Users/chase/Desktop/Board Game Engine';
const inv = require(REPO + '/games/dark-souls/scout/inventory.json');
const IMG = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Images/';
const OUT = 'C:/Users/chase/AppData/Local/Temp/claude/C--Users-chase-Desktop-Board-Game-Engine/83cf08bf-c658-49c6-bd83-6309f28971a2/scratchpad/ds-treas/cards';
fs.mkdirSync(OUT, { recursive: true });

const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
function fileFor(url) {
  const cands = [
    munge(url),
    munge(url.replace(/https?:\/\/cloud-3\.steamusercontent\.com/, 'http://steamusercontent-a.akamaihd.net')),
  ];
  for (const c of cands) for (const ext of ['.png', '.jpg']) {
    if (fs.existsSync(IMG + c + ext)) return IMG + c + ext;
  }
  throw new Error('no cache for ' + url);
}

// groups: deck-index based
const deckGroups = {
  'core-treasure': 27,
  'transmuted': 28,
  'darkroot': 32,
  'boss-winged-knight': 0,
  'boss-gargoyle': 2,
  'boss-old-dragonslayer': 4,
  'boss-smelter-demon': 10,
  'boss-dancer': 13,
  'boss-boreal-outrider': 16,
  'boss-ornstein-smough': 18,
  'boss-titanite-demon': 22,
  'boss-sif': 33,
  'boss-artorias': 35,
  'boss-four-kings': 38,
  'boss-old-iron-king': 46,
  'boss-kalameet': 49,
  'classdeck-51': 51, 'classdeck-52': 52, 'classdeck-53': 53, 'classdeck-54': 54,
  'classdeck-55': 55, 'classdeck-56': 56, 'classdeck-57': 57, 'classdeck-58': 58,
  'classdeck-59': 59, 'classdeck-60': 60,
  'classdeck-61': 61, 'classdeck-62': 62, 'classdeck-63': 63, 'classdeck-64': 64,
  'classdeck-65': 65, 'classdeck-66': 66, 'classdeck-67': 67, 'classdeck-68': 68,
  'classdeck-69': 69, 'classdeck-70': 70,
};
const looseGroups = {
  'start-core': [2030,2031,2032,2033,2034,2035,2036,2037,2038,2039,2040,2041,2042],
  'start-extra': [48105,48106,48107,48108,48119,48120,48121,48132,48133,48134,48135,48146,48147,48148,48149,48160,48161,48162,48163],
  'loose-s25': [2527,2528,2529,2530,2541,2542],
};

const jobs = []; // {group, cardID, sheet, back?}
for (const [g, di] of Object.entries(deckGroups)) {
  const d = inv.decks[di];
  for (const c of d.cards) {
    const sid = String(Math.floor(c.cardID / 100));
    const sh = d.sheets[sid];
    if (!sh) { console.error('MISSING sheet', g, c.cardID); continue; }
    jobs.push({ group: g, cardID: c.cardID, sh });
  }
  // one back crop per class deck (identify class/type)
  if (g.startsWith('classdeck-')) {
    const c = d.cards[0];
    const sid = String(Math.floor(c.cardID / 100));
    const sh = d.sheets[sid];
    if (sh && sh.uniqueBack) jobs.push({ group: g, cardID: c.cardID, sh, back: true });
  }
}
const looseByID = new Map();
for (const c of inv.looseCards) looseByID.set(c.cardID, c);
for (const [g, ids] of Object.entries(looseGroups)) {
  for (const id of ids) {
    const c = looseByID.get(id);
    if (!c) { console.error('MISSING loose', id); continue; }
    const sid = String(Math.floor(id / 100));
    const sh = c.sheets[sid];
    if (!sh) { console.error('MISSING loose sheet', id); continue; }
    jobs.push({ group: g, cardID: id, sh });
  }
}

(async () => {
  let n = 0;
  for (const j of jobs) {
    const url = j.back ? j.sh.backURL : j.sh.faceURL;
    const file = fileFor(url);
    const meta = await sharp(file).metadata();
    const nw = j.sh.numWidth, nh = j.sh.numHeight;
    const cell = j.cardID % 100;
    const col = cell % nw, row = Math.floor(cell / nw);
    const x0 = Math.round(col * meta.width / nw);
    const x1 = Math.round((col + 1) * meta.width / nw);
    const y0 = Math.round(row * meta.height / nh);
    const y1 = Math.round((row + 1) * meta.height / nh);
    const out = path.join(OUT, `${j.group}__${j.cardID}${j.back ? '__back' : ''}.png`);
    await sharp(file)
      .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
      .resize((x1 - x0) * 2, (y1 - y0) * 2, { kernel: 'lanczos3' })
      .png()
      .toFile(out);
    n++;
  }
  console.log('wrote', n, 'crops to', OUT);
})();
