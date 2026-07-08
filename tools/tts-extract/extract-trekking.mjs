// Trekking the National Parks — extracts the golden from the TTS mod
// (workshop 2102536379) and stages its assets for the client.
//
// The mod's global Lua carries the scoring golden (stone-majority bonus
// values, river zones); the save carries exact components (96 trek cards as
// 24 faces x4, 39 park + 6 major park cards, 45 stones in 5 colors, hikers +
// campsites per player color); the bundled PDF is the official rulebook.
//
// Outputs:
//   games/trekking/golden/board.json          (rules-facing golden)
//   client/public/trek/*                      (board, meshes, sheets, pdf)
//   client/public/trek/scene.json             (render-facing scene)
//   shared/src/trek/board-data.json           (engine copy)
//
// Run: node tools/tts-extract/extract-trekking.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const SAVE = path.join(MODS, 'Workshop/2102536379.json');
const OUT_GOLDEN = path.join(ROOT, 'games/trekking/golden');
const OUT_ASSETS = path.join(ROOT, 'client/public/trek');

const save = JSON.parse(fs.readFileSync(SAVE, 'utf8'));
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const obj = (guid) => save.ObjectStates.find((o) => o.GUID === guid) ?? fail(`object ${guid} missing`);

fs.mkdirSync(OUT_ASSETS, { recursive: true });
fs.mkdirSync(OUT_GOLDEN, { recursive: true });

// ---------------------------------------------------------------------------
// asset staging (from the local TTS cache; download-mod-assets.mjs fills it)
// ---------------------------------------------------------------------------

const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
function stage(url, kind) {
  if (!url) return null;
  const dir = kind === 'model' ? 'Models' : kind === 'pdf' ? 'PDF' : 'Images';
  const exts = kind === 'model' ? ['.obj'] : kind === 'pdf' ? ['.PDF', '.pdf'] : ['.png', '.jpg', '.jpeg'];
  const base = path.join(MODS, dir, munge(url));
  const src = exts.map((e) => base + e).find((p) => fs.existsSync(p)) ?? (fs.existsSync(base) ? base : null);
  if (!src) fail(`asset not cached: ${url}`);
  const idm = url.match(/ugc\/(\d+)\/([0-9A-F]+)/i);
  const name = idm ? `${idm[1]}_${idm[2].slice(0, 8)}` : munge(url).slice(-24);
  const ext = path.extname(src).toLowerCase() || extsFromMagic(src);
  const out = name + (kind === 'pdf' ? '.pdf' : ext);
  fs.copyFileSync(src, path.join(OUT_ASSETS, out));
  return `/trek/${out}`;
}
function extsFromMagic(p) {
  const b = fs.readFileSync(p);
  return b[0] === 0x89 ? '.png' : b[0] === 0xff ? '.jpg' : '.bin';
}

const trs = (o) => ({
  pos: [o.Transform.posX, o.Transform.posY, o.Transform.posZ],
  rot: [o.Transform.rotX, o.Transform.rotY, o.Transform.rotZ],
  scale: [o.Transform.scaleX, o.Transform.scaleY, o.Transform.scaleZ],
});
const tintOf = (o) => o.ColorDiffuse ? [o.ColorDiffuse.r ?? 0, o.ColorDiffuse.g ?? 0, o.ColorDiffuse.b ?? 0] : null;

// ---------------------------------------------------------------------------
// 1. Snaps (board spaces) — global
// ---------------------------------------------------------------------------

const snaps = (save.SnapPoints ?? []).map((s) => ({
  pos: [s.Position.x, s.Position.y, s.Position.z],
}));
console.log(`snaps: ${snaps.length}`);

// ---------------------------------------------------------------------------
// 2. Board model
// ---------------------------------------------------------------------------

const board = obj('437cd7');
const boardOut = {
  mesh: stage(board.CustomMesh.MeshURL, 'model'),
  diffuse: stage(board.CustomMesh.DiffuseURL, 'img'),
  transform: trs(board),
};

// ---------------------------------------------------------------------------
// 3. Player pieces: hikers + campsites, grouped by tint color
// ---------------------------------------------------------------------------

const named = (n) => save.ObjectStates.filter((o) => o.Nickname === n);
const hikers = named('Hiker');
const campsites = named('Campsite');
console.log(`hikers: ${hikers.length}, campsites: ${campsites.length}`);

// classify tints against the mod's player colors
const PLAYER_HUES = {
  Green: [0.19, 0.7, 0.17], Yellow: [0.9, 0.9, 0.17], Orange: [0.96, 0.39, 0.11],
  Red: [0.86, 0.1, 0.09], White: [1, 1, 1], Blue: [0.12, 0.53, 1],
};
function nearestColor(tint) {
  if (!tint) return null;
  let best = null, bd = 1e9;
  for (const [name, c] of Object.entries(PLAYER_HUES)) {
    const d = (c[0] - tint[0]) ** 2 + (c[1] - tint[1]) ** 2 + (c[2] - tint[2]) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

const hikerByColor = {};
for (const h of hikers) {
  const c = nearestColor(tintOf(h));
  hikerByColor[c] = { tint: tintOf(h), transform: trs(h) };
}
const campsiteTintByColor = {};
for (const c of campsites) {
  const col = nearestColor(tintOf(c));
  (campsiteTintByColor[col] ??= []).push(tintOf(c));
}
const seats = Object.keys(hikerByColor);
console.log('seat colors found:', seats.join(', '));

const meshes = {
  hiker: { mesh: stage(hikers[0].CustomMesh.MeshURL, 'model'), diffuse: hikers[0].CustomMesh.DiffuseURL ? stage(hikers[0].CustomMesh.DiffuseURL, 'img') : null, scale: trs(hikers[0]).scale },
  campsite: { mesh: stage(campsites[0].CustomMesh.MeshURL, 'model'), diffuse: campsites[0].CustomMesh.DiffuseURL ? stage(campsites[0].CustomMesh.DiffuseURL, 'img') : null, scale: trs(campsites[0]).scale },
};

// ---------------------------------------------------------------------------
// 4. Stones — bag contents by color
// ---------------------------------------------------------------------------

const bag = obj('09eb81');
const stones = bag.ContainedObjects ?? [];
const stoneCount = {};
for (const s of stones) {
  const m = (s.Nickname ?? '').match(/Yellow|Red|Black|Green|Blue/i);
  const color = m ? m[0][0].toUpperCase() + m[0].slice(1).toLowerCase() : nearestColor(tintOf(s));
  stoneCount[color] = (stoneCount[color] ?? 0) + 1;
}
console.log('stones:', JSON.stringify(stoneCount), 'total', stones.length);
const stoneMesh = stones[0]?.CustomMesh
  ? { mesh: stage(stones[0].CustomMesh.MeshURL, 'model'), diffuse: stones[0].CustomMesh.DiffuseURL ? stage(stones[0].CustomMesh.DiffuseURL, 'img') : null, scale: trs(stones[0]).scale }
  : null;
const stoneTints = {};
for (const s of stones) {
  const m = (s.Nickname ?? '').match(/Yellow|Red|Black|Green|Blue/i);
  const color = m ? m[0][0].toUpperCase() + m[0].slice(1).toLowerCase() : nearestColor(tintOf(s));
  stoneTints[color] ??= tintOf(s);
}

// ---------------------------------------------------------------------------
// 5. Decks
// ---------------------------------------------------------------------------

function deckInfo(guid) {
  const d = obj(guid);
  const sheets = {};
  for (const [id, s] of Object.entries(d.CustomDeck ?? {})) {
    sheets[id] = { face: stage(s.FaceURL, 'img'), back: stage(s.BackURL, 'img'), cols: s.NumWidth, rows: s.NumHeight };
  }
  const cards = (d.DeckIDs ?? []).map((cid) => ({ sheet: Math.floor(cid / 100), cell: cid % 100 }));
  const names = (d.ContainedObjects ?? []).map((c) => c.Nickname ?? '');
  return { sheets, cards, names };
}
const decks = {
  trek: deckInfo('8dd1d5'),
  parks: deckInfo('afe1ac'),
  majors: deckInfo('5cc9ef'),
};
console.log(`decks: trek ${decks.trek.cards.length}, parks ${decks.parks.cards.length}, majors ${decks.majors.cards.length}`);
console.log('park names sample:', decks.parks.names.slice(0, 5).join(' | '));

// bonus cards (from the Lua's guid tables)
const BONUS = {
  most: { Yellow: 'f250ec', Red: 'e71497', Black: '7688fc', Green: 'a72d69', Blue: 'bd37d2' },
  second: { Yellow: 'c0f4aa', Red: '60c839', Black: 'c2d4e8', Green: '876a81', Blue: '7355f8' },
};
const bonusCards = {};
for (const [tier, m] of Object.entries(BONUS)) {
  bonusCards[tier] = {};
  for (const [color, guid] of Object.entries(m)) {
    const c = obj(guid);
    const [id, sheet] = Object.entries(c.CustomDeck)[0];
    bonusCards[tier][color] = {
      face: stage(sheet.FaceURL, 'img'), back: stage(sheet.BackURL, 'img'),
      cols: sheet.NumWidth, rows: sheet.NumHeight, cell: (c.CardID ?? 0) % 100,
    };
  }
}

// player aid tile + bear + rulebook
const aid = obj('5bcf31');
const playerAid = { image: stage(aid.CustomImage.ImageURL, 'img') };
const bear = obj('f4697a');
const bearToken = { image: stage(bear.CustomImage.ImageURL, 'img'), transform: trs(bear) };
const pdf = save.ObjectStates.find((o) => o.Name === 'Custom_PDF');
const rulesPdf = stage(pdf.CustomPDF.PDFUrl, 'pdf');
fs.copyFileSync(path.join(ROOT, 'client/public', rulesPdf.slice(1)), path.join(OUT_ASSETS, 'rulebook.pdf'));

// ---------------------------------------------------------------------------
// 6. Zones (trek deck + 5-card river from the Lua; parks deck position)
// ---------------------------------------------------------------------------

const zpos = (g) => trs(obj(g)).pos;
const zones = {
  trekDeck: zpos('13f75f'),
  trekRiver: ['fb92d3', '157486', '91fd28', '2e5cc5', '7c9482'].map(zpos),
  parksDeck: trs(obj('afe1ac')).pos,
  majorsDeck: trs(obj('5cc9ef')).pos,
};

// ---------------------------------------------------------------------------
// 7. Scoring golden (from the global Lua tables)
// ---------------------------------------------------------------------------

const scoring = {
  stoneVp: 1,
  campsiteVp: 5,
  mostStones: { Yellow: 7, Red: 6, Black: 5, Green: 4, Blue: 3 },
  secondMostStones: { Yellow: 5, Red: 4, Black: 3, Green: 2, Blue: 1 },
};

// ---------------------------------------------------------------------------
// write outputs
// ---------------------------------------------------------------------------

const golden = {
  source: 'TTS workshop 2102536379 — Trekking the National Parks',
  seats,
  stoneCount,
  scoring,
  snaps,
  board: boardOut.transform,
  zones,
  decks: { trek: decks.trek.cards.length, parks: decks.parks.cards.length, majors: decks.majors.cards.length },
  parkNames: decks.parks.names,
  majorNames: decks.majors.names,
};
fs.writeFileSync(path.join(OUT_GOLDEN, 'board.json'), JSON.stringify(golden, null, 1));

const scene = {
  board: boardOut,
  meshes: { ...meshes, stone: stoneMesh },
  tints: {
    players: Object.fromEntries(seats.map((s) => [s, hikerByColor[s].tint])),
    stones: stoneTints,
  },
  decks,
  bonusCards,
  playerAid,
  bearToken,
  rulesPdf: '/trek/rulebook.pdf',
  zones,
  snaps,
};
fs.writeFileSync(path.join(OUT_ASSETS, 'scene.json'), JSON.stringify(scene));

const SHARED = path.join(ROOT, 'shared/src/trek');
fs.mkdirSync(SHARED, { recursive: true });
fs.copyFileSync(path.join(OUT_GOLDEN, 'board.json'), path.join(SHARED, 'board-data.json'));

console.log(`\nwrote golden + scene; staged ${fs.readdirSync(OUT_ASSETS).length} files -> client/public/trek/`);
