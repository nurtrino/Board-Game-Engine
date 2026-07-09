// Stage Axis & Allies Anniversary assets + setup goldens from the TTS cache
// (mod 1961347286). The mod is a dumb table: board art (2 Custom_Boards),
// per-nation infinite unit bags (untextured OBJ meshes colored by tint),
// transports/carriers as Custom_Model_Bags (they hold cargo), occupation
// marker bags, IPC money decks, and two "Packup" memory bags whose contents
// carry SAVED BOARD TRANSFORMS — the per-scenario setup goldens.
// Run: node tools/tts-extract/extract-axis.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/axis');
const GOLD = path.join(ROOT, 'games/axis-allies/golden');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(GOLD, { recursive: true });
const save = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop', '1961347286.json'), 'utf8'));
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
      if (ext === '.obj') {
        // the mod's sculpts carry thousands of stray line records ('l ...')
        // that render as white wireframe shells in three.js — strip them
        const txt = fs.readFileSync(src, 'utf8');
        const cleaned = txt.split('\n').filter((ln) => !ln.startsWith('l ') && !ln.startsWith('p ')).join('\n');
        fs.writeFileSync(path.join(OUT, name), cleaned);
      } else {
        fs.copyFileSync(src, path.join(OUT, name));
      }
      const rel = `/axis/${name}`;
      staged.set(url, rel);
      return rel;
    }
  }
  console.warn('MISSING', kind, url.slice(-44));
  staged.set(url, null);
  return null;
};

// The WORLD MAP is the mod's custom TABLE texture (9500x4956) — the two
// Custom_Boards are the battle board (be20f5) and the production/R&D chart
// (128d09). Stage the map at full size for transcription plus a lighter jpg
// for the TV.
const stageTable = async () => {
  const url = save.TableURL;
  const src = path.join(MODS, 'Images', munge(url) + '.png');
  if (!fs.existsSync(src)) { console.warn('MISSING table texture', url); return; }
  const sharp = (await import('sharp')).default;
  await sharp(src).jpeg({ quality: 86 }).toFile(path.join(OUT, 'map-full.jpg'));
  await sharp(src).resize(5000).jpeg({ quality: 82 }).toFile(path.join(OUT, 'map.jpg'));
  console.log('table map staged (map-full.jpg + map.jpg)');
};

const round = (v, p = 3) => +v.toFixed(p);
const xf = (t) => ({
  pos: [t.posX, t.posY, t.posZ].map((v) => round(v)),
  rotY: round(t.rotY, 1),
  scale: round(t.scaleX),
});
const tint = (c) => (c ? [c.r, c.g, c.b].map((v) => round(v)) : null);

// ---- canonical naming: bag nicknames use several nation spellings --------
const NATION = [
  ['GERMAN', 'germany'], ['Japanese', 'japan'], ['JPN', 'japan'], ['Japan', 'japan'],
  ['USSR', 'ussr'], ['ITALIAN', 'italy'], ['Italian', 'italy'], ['USA', 'usa'],
  ['UK', 'uk'], ['CHINESE', 'china'], ['Chinese', 'china'],
];
const UNIT = [
  ['Infantry', 'infantry'], ['Artillery', 'artillery'], ['Tank', 'tank'],
  ['Fighter', 'fighter'], ['Bomber', 'bomber'], ['Battleship', 'battleship'],
  ['Aircraft Carrier', 'carrier'], ['Carrier', 'carrier'], ['Cruiser', 'cruiser'],
  ['Destroyer', 'destroyer'], ['Sub', 'submarine'], ['Transport', 'transport'],
];
const parseUnitName = (nick) => {
  if (!nick) return null;
  if (/Industrial Complex/i.test(nick)) return { nation: null, unit: 'factory' };
  if (/Anti ?Air/i.test(nick)) return { nation: null, unit: 'aaGun' };
  let nation = null;
  for (const [pat, key] of NATION) if (nick.includes(pat)) { nation = key; break; }
  let unit = null;
  for (const [pat, key] of UNIT) if (nick.includes(pat)) { unit = key; break; }
  if (!unit) return null;
  return { nation, unit };
};

// ---- walk ------------------------------------------------------------------
const boards = [];
const unitBags = []; // infinite bags with one sample model
const vesselBags = []; // Custom_Model_Bag transports/carriers (mesh on the bag itself)
const occBags = []; // occupation marker infinite model bags
const packups = {}; // 1941/1942 memory bags
const decks = [];
const tableUnits = []; // loose deployed models on the table (cross-check state)
const tableChips = [];
let die = null;

const walkTable = (o) => {
  // top-level / on-table objects only (not inside any bag)
  if (o.Name === 'Custom_Board') {
    boards.push({ guid: o.GUID, image: stage(o.CustomImage?.ImageURL), ...xf(o.Transform) });
  } else if (o.Name === 'Infinite_Bag') {
    const item = (o.ContainedObjects ?? [])[0];
    if (item?.CustomMesh?.MeshURL) {
      unitBags.push({
        guid: o.GUID, nick: o.Nickname,
        mesh: stage(item.CustomMesh.MeshURL, 'model'),
        diffuse: stage(item.CustomMesh.DiffuseURL),
        tint: tint(item.ColorDiffuse), itemScale: round(item.Transform.scaleX),
        parsed: parseUnitName(o.Nickname || item.Nickname),
      });
    }
  } else if (o.Name === 'Custom_Model_Infinite_Bag') {
    occBags.push({
      guid: o.GUID, nick: o.Nickname,
      mesh: stage(o.CustomMesh?.MeshURL, 'model'),
      diffuse: stage(o.CustomMesh?.DiffuseURL),
      tint: tint(o.ColorDiffuse), scale: round(o.Transform.scaleX),
    });
  } else if (o.Name === 'Custom_Model_Bag') {
    // transports/carriers double as containers; dedupe by mesh URL later
    vesselBags.push({
      guid: o.GUID, nick: o.Nickname,
      meshUrl: o.CustomMesh?.MeshURL,
      tint: tint(o.ColorDiffuse), scale: round(o.Transform.scaleX),
    });
  } else if (o.Name === 'Bag' && /Packup/i.test(o.Nickname ?? '')) {
    const scen = /1941/.test(o.Nickname) ? '1941' : '1942';
    packups[scen] = o;
  } else if (o.Name === 'DeckCustom') {
    const cd = Object.values(o.CustomDeck ?? {})[0];
    decks.push({
      guid: o.GUID, nick: o.Nickname, cards: (o.ContainedObjects ?? []).length,
      face: stage(cd?.FaceURL), back: stage(cd?.BackURL),
      grid: cd ? [cd.NumWidth, cd.NumHeight] : null,
    });
  } else if (o.Name === 'Die_6') {
    die = { guid: o.GUID };
  } else if (o.Name === 'Custom_Model' && o.CustomMesh?.MeshURL) {
    const parsed = parseUnitName(o.Nickname);
    if (parsed) tableUnits.push({ nick: o.Nickname, ...parsed, ...xf(o.Transform), tint: tint(o.ColorDiffuse) });
  } else if (/^Checker|^CheckerStack$/.test(o.Name)) {
    const t = o.Transform;
    tableChips.push({
      nick: o.Nickname, pos: [round(t.posX), round(t.posZ)],
      count: o.Name === 'CheckerStack' ? Math.max(2, (o.ContainedObjects ?? []).length) : 1,
    });
  }
};
for (const o of save.ObjectStates) walkTable(o);

// ---- setup goldens from the packup memory bags -----------------------------
// Every contained object keeps the transform it had on the board when packed.
const dumpPackup = (bag) => {
  const units = [];
  const chips = [];
  const markers = []; // 1942 occupation/control overlays
  for (const c of bag.ContainedObjects ?? []) {
    const t = c.Transform;
    if (/Chip/i.test(c.Nickname ?? '')) {
      chips.push({
        nick: c.Nickname, pos: [round(t.posX), round(t.posZ)],
        count: c.Name === 'CheckerStack' ? (c.Number ?? 2) : 1,
      });
      continue;
    }
    if (/Occupation/i.test(c.Nickname ?? '')) {
      const OCC = { german: 'germany', japanese: 'japan', italian: 'italy', chinese: 'china', british: 'uk', american: 'usa', russian: 'ussr' };
      const nation = OCC[(c.Nickname.split(' ')[0] ?? '').toLowerCase()] ?? null;
      markers.push({ nick: c.Nickname, nation, pos: [round(t.posX), round(t.posZ)] });
      continue;
    }
    const parsed = parseUnitName(c.Nickname);
    if (!parsed) { console.warn('packup unparsed:', c.Name, c.Nickname); continue; }
    const entry = { nick: c.Nickname, ...parsed, pos: [round(t.posX), round(t.posZ)], rotY: round(t.rotY, 1) };
    // vessels are bags: cargo rides inside
    if (c.ContainedObjects?.length) {
      entry.cargo = c.ContainedObjects.map((k) => ({ nick: k.Nickname, ...parseUnitName(k.Nickname) }));
    }
    units.push(entry);
  }
  return { units, chips, markers };
};
for (const [scen, bag] of Object.entries(packups)) {
  const dump = dumpPackup(bag);
  fs.writeFileSync(
    path.join(GOLD, `setup-${scen}.raw.json`),
    JSON.stringify({ source: `TTS mod 1961347286 "${bag.Nickname}" memory bag (saved board transforms)`, ...dump }, null, 1),
  );
  console.log(`setup-${scen}: ${dump.units.length} units, ${dump.chips.length} chips, ${dump.markers.length} occupation markers`);
}

// ---- dedupe vessel meshes (many duplicate bags per nation) ------------------
const vessels = [];
const seen = new Set();
for (const v of vesselBags) {
  if (!v.meshUrl || !v.nick) continue;
  const parsed = parseUnitName(v.nick);
  if (!parsed) continue;
  const key = `${parsed.nation}:${parsed.unit}`;
  if (seen.has(key)) continue;
  seen.add(key);
  vessels.push({ ...parsed, guid: v.guid, mesh: stage(v.meshUrl, 'model'), tint: v.tint, scale: v.scale });
}

// ---- manifest ---------------------------------------------------------------
await stageTable();

const manifest = {
  source: 'TTS mod 1961347286 (Axis & Allies Anniversary Edition 1941 and 1942)',
  map: { image: '/axis/map.jpg', full: '/axis/map-full.jpg', artWidth: 9500, artHeight: 4956 },
  // boards[0] (be20f5) = the BATTLE BOARD art; boards[1] (128d09) = the
  // National Production / R&D chart. Neither is the world map.
  boards,
  units: unitBags.filter((b) => b.parsed).map((b) => ({
    ...b.parsed, guid: b.guid, mesh: b.mesh, diffuse: b.diffuse, tint: b.tint, scale: b.itemScale,
  })),
  vessels,
  occupation: occBags,
  ipcDecks: decks,
};
fs.writeFileSync(path.join(OUT, 'axis-manifest.json'), JSON.stringify(manifest, null, 1));

console.log(`boards: ${boards.length}, unit bags: ${manifest.units.length}, vessels: ${vessels.length}, occ: ${occBags.length}, decks: ${decks.length}`);
console.log(`staged files: ${[...staged.values()].filter(Boolean).length}, missing: ${[...staged.values()].filter((v) => !v).length}`);
