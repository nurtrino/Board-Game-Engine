// Stage Dune: Imperium assets + scene.json from the TTS cache (mod 2354919205).
// The main board is a giant Custom_Token (2da390, scale 6.64) — the Dark Tower
// pattern. Zones (agent spaces, influence tracks, rows) are ScriptingTriggers;
// we record every zone transform so the engine/client can use the mod's own
// geometry. Run: node tools/tts-extract/extract-dune.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/dune');
fs.mkdirSync(OUT, { recursive: true });
const save = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop', '2354919205.json'), 'utf8'));
const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');

const staged = new Map();
const stage = (url, kind = 'img') => {
  if (!url || !/^https?:/.test(url)) return null;
  if (staged.has(url)) return staged.get(url);
  const base = munge(url);
  const dir = kind === 'model' ? 'Models' : 'Images';
  const exts = kind === 'model' ? ['.obj'] : ['.png', '.jpg'];
  for (const ext of exts) {
    const src = path.join(MODS, dir, base + ext);
    if (fs.existsSync(src)) {
      const name = base.slice(-24) + ext;
      fs.copyFileSync(src, path.join(OUT, name));
      const rel = `/dune/${name}`;
      staged.set(url, rel);
      return rel;
    }
  }
  console.warn('MISSING', url.slice(-44));
  staged.set(url, null);
  return null;
};

const byGuid = {};
const zones = {}; // every ScriptingTrigger: guid -> {pos, scale}
const walk = (o) => {
  byGuid[o.GUID] = o;
  if (o.Name === 'ScriptingTrigger') {
    const t = o.Transform;
    zones[o.GUID] = {
      pos: [t.posX, t.posY, t.posZ].map((v) => +v.toFixed(2)),
      scale: [t.scaleX, t.scaleY, t.scaleZ].map((v) => +v.toFixed(2)),
    };
  }
  for (const c of o.ContainedObjects ?? []) walk(c);
  for (const st of Object.values(o.States ?? {})) walk(st);
};
for (const o of save.ObjectStates) walk(o);

// board art
const board = byGuid['2da390'];
const bt = board.Transform;
const boardOut = {
  image: stage(board.CustomImage.ImageURL),
  pos: [bt.posX, bt.posY, bt.posZ].map((v) => +v.toFixed(2)),
  rot: [bt.rotX, bt.rotY, bt.rotZ].map((v) => +v.toFixed(1)),
  scale: +bt.scaleX.toFixed(2),
};

// all deck sheets across the save (keyed by the mod's CustomDeck ids)
const sheets = {};
const walkDecks = (o) => {
  for (const [id, d] of Object.entries(o.CustomDeck ?? {})) {
    if (!sheets[id]) {
      sheets[id] = {
        face: stage(d.FaceURL), back: stage(d.BackURL),
        cols: d.NumWidth, rows: d.NumHeight, unique: !!d.UniqueBack,
      };
    }
  }
  for (const c of o.ContainedObjects ?? []) walkDecks(c);
  for (const st of Object.values(o.States ?? {})) walkDecks(st);
};
for (const o of save.ObjectStates) walkDecks(o);

// decks with card identities: name + CardID (sheet = floor(id/100), cell = id%100)
const DECK_TAGS = {
  cfedf4: 'imperium', f10b4e: 'intrigue', '84d4cb': 'conflict1', '6e3846': 'conflict2',
  '1afb58': 'conflict3', '972f9e': 'foldspace', '7e541b': 'liaison', c86928: 'spiceMustFlow',
  '154bb7': 'starterBlue', '967e50': 'starterRed', '96afed': 'starterGreen', '9af71c': 'starterOrange',
  '6419f4': 'ixImperium', '8222e0': 'ixIntrigue', d2fd10: 'immImperium', '6d939e': 'immIntrigue',
  '4d7670': 'tleilaxu', c29438: 'experimentation', '6b55a9': 'ixConflict1',
};
const decks = {};
for (const [guid, tag] of Object.entries(DECK_TAGS)) {
  const d = byGuid[guid];
  if (!d) { console.warn('missing deck', guid, tag); continue; }
  decks[tag] = {
    guid,
    cards: (d.ContainedObjects ?? []).map((c) => ({
      name: c.Nickname || '', desc: c.Description || '',
      sheet: Math.floor(c.CardID / 100), cell: c.CardID % 100,
    })),
  };
  walkDecks(d);
}

// leaders: script-carrying cards named in global leaderGUID
const leaderGuids = ['717776', '1a4dcc', 'ceee90', 'd9daed', '2df658', '5a8a9a', '4d862a', '98cae8', '9b6cdc', '78551e', '4cf050', '06b6eb', '1244ec', '952a13'];
const leaders = leaderGuids.map((g) => {
  const o = byGuid[g];
  if (!o) return null;
  return {
    guid: g, name: o.Nickname,
    sheet: o.CardID !== undefined ? Math.floor(o.CardID / 100) : null,
    cell: o.CardID !== undefined ? o.CardID % 100 : null,
    image: o.CustomImage?.ImageURL ? stage(o.CustomImage.ImageURL) : null,
  };
}).filter(Boolean);

// rulebooks
for (const [guid, name] of [['9ac7d6', 'rulebook'], ['9f549f', 'errata']]) {
  const o = byGuid[guid];
  const url = o?.CustomPDF?.PDFUrl;
  if (!url) continue;
  const src = path.join(MODS, 'PDF', munge(url) + '.PDF');
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, name + '.pdf'));
}

// Base-game overlay tiles: the mod's board is the Rise of Ix layout; setup
// (global.lua sendAgentSetup, riseIX == 0 branch) lays these tiles over it
// for base play. Positions are the Lua's exact setPositionSmooth targets.
const BASE_TILES = {
  highCouncil: { guid: '3d34e0', pos: [-2.19, 14.95] },
  mentat: { guid: '3d8ded', pos: [-2.78, 12.82] },
  rallyTroops: { guid: '0227ac', pos: [2.20, 12.78] },
  swordmaster: { guid: '278d1b', pos: [5.76, 12.82] },
  hallOfOratory: { guid: 'bceb8c', pos: [6.07, 14.95] },
  secureContract: { guid: '9375b7', pos: [10.27, 12.82] },
  sellMelange: { guid: '410533', pos: [9.84, 14.93] },
  imperialBasin: { guid: 'ca20ba', pos: [8.76, 5.55] },
  sietchTabr: { guid: 'ea0cff', pos: [-1.85, 3.94] },
  researchStation: { guid: '2a9190', pos: [1.09, 6.40] },
  carthag: { guid: '1fb1b0', pos: [4.19, 8.52] },
  arrakeen: { guid: '438a60', pos: [8.69, 9.37] },
  conspire: { guid: '45df71', pos: [-7.21, 14.10] },
  wealth: { guid: '70d8e5', pos: [-7.38, 11.59] },
  heighliner: { guid: 'c16d62', pos: [-7.06, 7.98] },
  foldspace: { guid: 'bddd6a', pos: [-7.08, 5.48] },
  selectiveBreeding: { guid: 'aab325', pos: [-6.17, 1.91] },
  secrets: { guid: '734fac', pos: [-7.38, -0.63] },
  hardyWarriors: { guid: '355820', pos: [-6.45, -4.21] },
  stillsuits: { guid: '5d0684', pos: [-7.17, -6.72] },
};
const overlays = {};
for (const [id, t] of Object.entries(BASE_TILES)) {
  const o = byGuid[t.guid];
  if (!o) { console.warn('missing tile', id, t.guid); continue; }
  overlays[id] = {
    image: stage(o.CustomImage?.ImageURL),
    pos: t.pos,
    scale: [+o.Transform.scaleX.toFixed(2), +o.Transform.scaleZ.toFixed(2)],
  };
}

// Agent spots per space: the mod's Hagal placement zones where it has them,
// otherwise the overlay tile centres / maker harvest points.
const spaceSpots = {
  stillsuits: [-7.73, -7.90], hardyWarriors: [-7.73, -5.28], secrets: [-7.73, -1.75],
  selectiveBreeding: [-7.73, 0.89], foldspace: [-7.73, 4.39], heighliner: [-7.72, 6.92],
  wealth: [-7.72, 10.60], conspire: [-7.72, 13.16], rallyTroops: [1.16, 11.93],
  hallOfOratory: [4.79, 14.06], carthag: [3.73, 7.56], arrakeen: [7.96, 8.36],
  researchStation: [-0.37, 5.38], sietchTabr: [-1.85, 3.94],
  greatFlat: [-3.62, 0.17], haggaBasin: [2.91, 3.04], imperialBasin: [7.64, 4.50],
  highCouncil: [-2.19, 14.95], mentat: [-2.78, 12.82], swordmaster: [5.76, 12.82],
  secureContract: [10.27, 12.82], sellMelange: [9.84, 14.93],
};

// agent pawns: one Custom_Model mesh, tinted per seat; troops are stock
// 0.35-scale BlockSquare cubes in the same tints
const agentObj = byGuid['7751c8'];
const pieces = {
  agentMesh: stage(agentObj.CustomMesh.MeshURL, 'model'),
  tints: {
    Red: [1, 0.008, 0], Blue: [0.12, 0.53, 1], Orange: [0.89, 0.52, 0.08], Green: [0.04, 1, 0],
  },
  troopScale: 0.35,
};

const scene = {
  source: 'TTS workshop 2354919205 — Dune Imperium (+Ix +Immortality) — extract-dune.mjs',
  board: boardOut,
  overlays,
  spaceSpots,
  pieces,
  sheets,
  decks,
  leaders,
  zones, // every ScriptingTrigger transform, by GUID (spaces, rows, tracks)
};
fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene, null, 1));
fs.writeFileSync(path.join(ROOT, 'games/dune-imperium/golden/zones.json'), JSON.stringify(zones, null, 1));
console.log('board', boardOut.image, 'sheets', Object.keys(sheets).length, 'decks', Object.keys(decks).length,
  'leaders', leaders.length, 'zones', Object.keys(zones).length, 'staged files', staged.size);
