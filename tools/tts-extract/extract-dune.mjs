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

const scene = {
  source: 'TTS workshop 2354919205 — Dune Imperium (+Ix +Immortality) — extract-dune.mjs',
  board: boardOut,
  sheets,
  decks,
  leaders,
  zones, // every ScriptingTrigger transform, by GUID (spaces, rows, tracks)
};
fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene, null, 1));
fs.writeFileSync(path.join(ROOT, 'games/dune-imperium/golden/zones.json'), JSON.stringify(zones, null, 1));
console.log('board', boardOut.image, 'sheets', Object.keys(sheets).length, 'decks', Object.keys(decks).length,
  'leaders', leaders.length, 'zones', Object.keys(zones).length, 'staged files', staged.size);
