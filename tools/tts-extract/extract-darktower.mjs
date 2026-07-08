// Stage Dark Tower scene assets from the TTS cache: tower/board/building OBJs,
// positions + tints, and the display/sound maps derived from the mod's Lua.
// Run AFTER extract-darktower.py (which exports bundle textures + sounds).
// Run: node tools/tts-extract/extract-darktower.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/darktower');
fs.mkdirSync(OUT, { recursive: true });

const save = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop', '873019835.json'), 'utf8'));
const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');

const stage = (url, kind) => {
  if (!url) return null;
  const base = munge(url);
  const dir = kind === 'model' ? 'Models' : 'Images';
  const exts = kind === 'model' ? ['.obj'] : ['.png', '.jpg'];
  for (const ext of exts) {
    const src = path.join(MODS, dir, base + ext);
    if (fs.existsSync(src)) {
      const name = base.slice(-24) + ext;
      fs.copyFileSync(src, path.join(OUT, name));
      return `/darktower/${name}`;
    }
  }
  console.warn('MISSING', kind, url.slice(-40));
  return null;
};

const byGuid = {};
const walk = (o) => {
  byGuid[o.GUID] = o;
  for (const c of o.ContainedObjects ?? []) walk(c);
  for (const s of Object.values(o.States ?? {})) walk(s);
};
for (const o of save.ObjectStates) walk(o);

const model = (guid) => {
  const o = byGuid[guid];
  if (!o) { console.warn('no object', guid); return null; }
  const t = o.Transform;
  return {
    mesh: stage(o.CustomMesh?.MeshURL, 'model'),
    diffuse: stage(o.CustomMesh?.DiffuseURL, 'img'),
    pos: [t.posX, t.posY, t.posZ].map((v) => +v.toFixed(3)),
    rot: [t.rotX, t.rotY, t.rotZ].map((v) => +v.toFixed(2)),
    scale: [t.scaleX, t.scaleY, t.scaleZ].map((v) => +v.toFixed(3)),
  };
};

// Lua colorCodes (global.lua L232) — building tints in 'real' mode
const colorCodes = {
  red: [0.835, 0, 0], blue: [0, 0.1725, 1], yellow: [0.98, 0.71, 0.075], green: [0, 0.7, 0.01],
  brown: [0.26, 0.1725, 0.14], gray: [0.31, 0.3, 0.28], gold: [0.86, 0.49, 0], tan: [0.635, 0.57, 0.49],
};

// buildings by GUID with their 'real' tints (tomb=brown, bazaar=gray via L1093
// ...actually L1093: tombs a2efd5/7f55b9/fc0d02/8bf590 brown? Those four guids
// are one-per-type in the NORTH kingdom; the Lua colors tomb-types brown,
// bazaar/ruin/sanctuary sets gray/tan. Keep type tints: tomb+bazaar sets from
// the Lua 'real' branch: first four brown, next four gray, next four tan.
const buildings = [];
const add = (guids, kind, tint) => {
  for (const g of guids) {
    const m = model(g);
    if (m) buildings.push({ kind, tint, ...m });
  }
};
add(['b1a7d2', 'cffbfe', '7ddda5', 'a2efd5'], 'tomb', colorCodes.gray);
add(['7ee674', '024e76', '98b270', '7f55b9'], 'bazaar', colorCodes.brown);
add(['582c69', '197a06', 'ef158a', 'fc0d02'], 'ruin', colorCodes.tan);
add(['e5ad46', 'a0c7c2', 'bcf3d7', '8bf590'], 'sanctuary', colorCodes.tan);
add(['d4a57e', 'e1ae0b', '3749e1', '2ee535'], 'citadel', null); // has diffuse per kingdom

const scene = {
  source: 'TTS workshop 873019835 — Dark Tower (extract-darktower.mjs)',
  colorCodes,
  tower: model('5388d1'),
  board: model('7abb9b'),
  buildings,
  // player tokens in Lua order R,B,Y,G (global.lua L242: 435f7c,64a286,fc68f8,8c047a)
  tokens: [model('435f7c'), model('64a286'), model('fc68f8'), model('8c047a')],
  tokenTints: { Red: colorCodes.red, Blue: colorCodes.blue, Yellow: colorCodes.yellow, Green: colorCodes.green },
  // wedge display: reel textures (bundle) — pic -> reel texture + row
  // (wedgeReels/wedgeLights, global.lua L158; reels trigger 4..10 = reel1..7)
  wedge: {
    reelOf: {
      cursed: 1, lost: 1, plague: 1, victory: 2, warriors: 2, brigands: 2,
      wizard: 3, closed: 3, missing: 3, dragon: 4, sword: 4, pegasus: 4,
      brasskey: 5, silverkey: 5, goldkey: 5, scout: 6, healer: 6, gold: 6,
      warrior: 7, food: 7, beast: 7,
    },
    rowOf: {
      cursed: 0, lost: 1, plague: 2, victory: 0, warriors: 1, brigands: 2,
      dragon: 0, sword: 1, pegasus: 2, brasskey: 0, silverkey: 1, goldkey: 2,
      wizard: 0, closed: 1, missing: 2, scout: 0, healer: 1, gold: 2,
      warrior: 0, food: 1, beast: 2,
    },
    texture: (n) => `/darktower/reels-reel${n}.png`,
  },
  reelTextures: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [n, `/darktower/reels-reel${n}.png`])),
  // sounds: engine sfx name -> staged wav (extracted by extract-darktower.py)
  sounds: Object.fromEntries([
    'beep', '1812', 'battle', 'battlelose', 'battlewin', 'bazaar', 'citadel', 'clear',
    'die', 'done', 'dragon', 'dragondie', 'failure', 'frontier', 'intro', 'pegasus',
    'rotate1', 'rotate2', 'starving', 'tick', 'tomb', 'tombbattle', 'tombempty',
  ].map((n) => [n, `/darktower/sfx-${n}.wav`])),
};
// functions don't serialize — drop helper
delete scene.wedge.texture;

fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene, null, 1));
fs.mkdirSync(path.join(ROOT, 'games/dark-tower/golden'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'games/dark-tower/golden/board.json'), JSON.stringify({
  tower: scene.tower, board: scene.board,
  buildings: buildings.map(({ kind, pos, rot, scale }) => ({ kind, pos, rot, scale })),
  tokens: scene.tokens.map((t) => t && { pos: t.pos }),
}, null, 1));
console.log('staged', buildings.length, 'buildings; tower', !!scene.tower?.mesh, '; board', !!scene.board?.mesh);
