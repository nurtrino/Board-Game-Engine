// Ticket to Ride: Rails & Sails — The World. Extracts the golden board data
// from the TTS mod (workshop 3324777769) and stages its assets for the client.
//
// The mod's Global Lua is the source of truth: it places all 468 snap points
// (position + rotation per piece slot) and labels them — `roads`/`road_names`
// (rail routes), `ship_roads`/`ship_road_names` (sea routes), `double_roads`
// (parallel pairs), `harbors`/`harbor_names` (city harbor spots). The setup
// scripts give the deal: 3 train cards + 7 ship cards + 5 tickets each,
// market of 3 face-up ships + 3 face-up trains.
//
// Outputs:
//   games/ticket-to-ride-world/golden/board.json   (rules-facing golden)
//   client/public/ttr/*                            (map, meshes, sheets, pdf)
//   client/public/ttr/scene.json                   (render-facing scene)
//
// Run: node tools/tts-extract/extract-ttr.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const SAVE = path.join(MODS, 'Workshop/3324777769.json');
const OUT_GOLDEN = path.join(ROOT, 'games/ticket-to-ride-world/golden');
const OUT_ASSETS = path.join(ROOT, 'client/public/ttr');

const save = JSON.parse(fs.readFileSync(SAVE, 'utf8'));
const lua = save.LuaScript;
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };

// ---------------------------------------------------------------------------
// 1. Snap points from Global.setSnapPoints({...}) — order defines the 1-based
//    indices the roads/harbors tables refer to.
// ---------------------------------------------------------------------------

const snapBlockStart = lua.indexOf('setSnapPoints({');
const snapBlockEnd = lua.indexOf('})', snapBlockStart);
const snapBlock = lua.slice(snapBlockStart, snapBlockEnd);
const snaps = [];
for (const m of snapBlock.matchAll(/position=\{([-\d.,\s]+)\}\s*,\s*rotation=\{([-\d.,\s]+)\}/g)) {
  const [px, py, pz] = m[1].split(',').map(Number);
  const [rx, ry, rz] = m[2].split(',').map(Number);
  snaps.push({ pos: [px, py, pz], rot: [rx, ry, rz] });
}
console.log(`snaps: ${snaps.length}`);
if (snaps.length !== 452) fail(`expected 452 snaps, got ${snaps.length}`);

// ---------------------------------------------------------------------------
// 2. Lua tables: numeric index groups + name lists
// ---------------------------------------------------------------------------

/** Slice `name={...}` to its matching close brace (no strings inside contain braces we care about). */
function luaBlock(name) {
  const re = new RegExp(`(?<![\\w])${name}\\s*=\\s*\\{`);
  const m = re.exec(lua);
  if (!m) fail(`lua table ${name} not found`);
  let i = m.index + m[0].length, depth = 1, inStr = false;
  for (; i < lua.length && depth > 0; i++) {
    const c = lua[i];
    if (inStr) { if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return lua.slice(m.index + m[0].length, i - 1);
}

const parseNumGroups = (src) => {
  const groups = [];
  for (const g of src.matchAll(/\{([\d,\s]+)\}/g)) groups.push(g[1].split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)));
  return groups;
};
const parseNames = (src) => [...src.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
const parseFlat = (src) => src.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));

const roads = parseNumGroups(luaBlock('roads'));
const roadNames = parseNames(luaBlock('road_names'));
const shipRoads = parseNumGroups(luaBlock('ship_roads'));
const shipRoadNames = parseNames(luaBlock('ship_road_names'));
const harborSnaps = parseFlat(luaBlock('harbors'));
const harborNames = parseNames(luaBlock('harbor_names'));
// double_roads is nested one level deeper: {{a},{b}} pairs
const doubleSrc = luaBlock('double_roads');
const doublePairs = [];
for (const m of doubleSrc.matchAll(/\{\s*\{([\d,\s]+)\}\s*,\s*\{([\d,\s]+)\}\s*\}/g)) {
  doublePairs.push([m[1], m[2]].map((s) => s.split(',').map(Number)));
}

console.log(`rail routes: ${roads.length} (${roadNames.length} names) | sea routes: ${shipRoads.length} (${shipRoadNames.length} names)`);
console.log(`harbors: ${harborSnaps.length} (${harborNames.length} names) | double pairs: ${doublePairs.length}`);
if (roads.length !== roadNames.length) fail('rail route/name count mismatch');
if (shipRoads.length !== shipRoadNames.length) fail('sea route/name count mismatch');
if (harborSnaps.length !== harborNames.length) fail('harbor count mismatch');

// every snap index 1..468 must be used exactly once across roads/ships/harbors
{
  const used = new Map();
  const use = (i, what) => { used.set(i, (used.get(i) ?? 0) + 1); if (used.get(i) > 1) console.warn(`snap ${i} used twice (${what})`); };
  roads.forEach((g, gi) => g.forEach((i) => use(i, `road ${roadNames[gi]}`)));
  shipRoads.forEach((g, gi) => g.forEach((i) => use(i, `sea ${shipRoadNames[gi]}`)));
  harborSnaps.forEach((i) => use(i, 'harbor'));
  const missing = [];
  for (let i = 1; i <= snaps.length; i++) if (!used.has(i)) missing.push(i);
  console.log(`snap coverage: ${used.size}/${snaps.length} used, ${missing.length} unassigned${missing.length ? ' -> ' + missing.join(',') : ''}`);
}

// ---------------------------------------------------------------------------
// 3. Route names -> structured {a, b, color, pair} (colors printed on the map)
// ---------------------------------------------------------------------------

const COLORS = ['Red', 'Green', 'Blue', 'Yellow', 'White', 'Black', 'Purple', 'Pink'];

function parseRouteName(raw) {
  let name = raw.trim();
  let color = null, pair = 0, variant = null;
  const paren = name.match(/\(([^)]*)\)?\s*$/); // tolerate the mod's one unclosed paren
  if (paren) {
    const tag = paren[1].replace(/\(/g, '').trim();
    const px = tag.match(/^Pair x(\d)$/i);
    if (px) pair = Number(px[1]);
    else if (COLORS.includes(tag)) color = tag;
    else if (/^[AB]$/.test(tag)) variant = tag;
    else if (tag) variant = tag; // e.g. stray labels — keep visible for review
    name = name.slice(0, paren.index).trim();
  }
  const [a, b] = name.split(' - ').map((s) => s.trim());
  return { a, b, color, pair, variant };
}

const routes = [];
const addRoutes = (groups, names, kind) => {
  groups.forEach((snapIdxs, i) => {
    const { a, b, color, pair, variant } = parseRouteName(names[i]);
    routes.push({
      id: `${kind}${i}`,
      kind, // 'rail' | 'sea'
      a, b,
      color, // null = gray
      pair, // rail: spaces needing 2-card sets ("Pair xN"); 0 = normal
      variant,
      length: snapIdxs.length,
      snaps: snapIdxs,
    });
  });
};
addRoutes(roads, roadNames, 'rail');
addRoutes(shipRoads, shipRoadNames, 'sea');

// doubles: map each pair of snap groups back to route ids
// match by first snap index — tolerates the mod's one typo'd pair (a
// double_roads entry that accidentally includes a snap from the next route)
const routeByFirstSnap = new Map(routes.map((r) => [r.snaps[0], r.id]));
const doubles = [];
for (const [ga, gb] of doublePairs) {
  const ra = routeByFirstSnap.get(ga[0]);
  const rb = routeByFirstSnap.get(gb[0]);
  if (!ra || !rb) { console.warn(`double pair unmatched: {${ga.join(',')}} / {${gb.join(',')}}`); continue; }
  doubles.push([ra, rb]);
}
console.log(`doubles matched: ${doubles.length}/${doublePairs.length}`);

const harbors = harborNames.map((n, i) => ({
  city: n.replace(/\s*\(Harbor\)\s*$/, ''),
  snap: harborSnaps[i],
}));

const cities = [...new Set(routes.flatMap((r) => [r.a, r.b]))].sort();
console.log(`cities: ${cities.length}`);

// ---------------------------------------------------------------------------
// 4. Zones, hands, bags, counters from the save's objects
// ---------------------------------------------------------------------------

const obj = (guid) => save.ObjectStates.find((o) => o.GUID === guid) ?? fail(`object ${guid} missing`);
const posOf = (o) => [o.Transform.posX, o.Transform.posY, o.Transform.posZ];
const trs = (o) => ({
  pos: posOf(o),
  rot: [o.Transform.rotX, o.Transform.rotY, o.Transform.rotZ],
  scale: [o.Transform.scaleX, o.Transform.scaleY, o.Transform.scaleZ],
});

const zones = {
  shipDeck: posOf(obj('9ba120')),
  trainDeck: posOf(obj('376794')),
  ticketDeck: posOf(obj('50cece')),
  shipDiscard: posOf(obj('8d6622')),
  trainDiscard: posOf(obj('658752')),
  ticketDiscard: posOf(obj('8e63ad')),
  // pickups 1-3 are the ship row, 4-6 the train row (per the setup Lua)
  pickups: ['b2c323', '82d794', 'ae98ee', '5d446f', 'c83644', '1eda2b'].map((g) => posOf(obj(g))),
};

// per-color kit: the Lua's bag wiring, in mod color order Green,Red,Blue,Brown,Yellow
const SEATS = ['Green', 'Red', 'Blue', 'Brown', 'Yellow'];
const bagGuids = {
  ships: { Green: '7931d7', Red: '83c586', Blue: 'faa208', Brown: '8131c7', Yellow: 'a9f0d6' },
  trains: { Green: '2490e6', Red: 'dbb6e1', Blue: '80cb0b', Brown: 'ae14d8', Yellow: '9d3a87' },
};
// harbor bags from the Lua tail (green,red,blue,brown,yellow)
const harborBagGuids = { Green: 'd016da', Red: 'a03a51', Blue: '877941', Brown: '0cb6a8', Yellow: '78936c' };

// ---------------------------------------------------------------------------
// 5. Meshes + tints: the per-color sample train/ship models on the table, the
//    harbor model inside a bag, the scoring markers.
// ---------------------------------------------------------------------------

const models = save.ObjectStates.filter((o) => o.Name === 'Custom_Model');
const meshUrls = [...new Set(models.map((o) => o.CustomMesh?.MeshURL).filter(Boolean))];
console.log(`unique table meshes: ${meshUrls.length}`);
const harborModel = obj(harborBagGuids.Green).ContainedObjects[0];
const markerModel = models.find((o) => o.Nickname === 'scoring marker');

// classify remaining meshes: train vs ship via the sample pairs — ship models
// sit at z≈-35.5 (front row), trains at z≈-37.3 (back row) per the save layout
const samples = models.filter((o) => !o.Nickname && Math.abs(o.Transform.posZ + 36.3) < 1.6 && o.Transform.posX < -35);
const shipSample = samples.find((o) => o.Transform.posZ > -36.3) ?? fail('no ship sample');
const trainSample = samples.find((o) => o.Transform.posZ <= -36.3) ?? fail('no train sample');

// per-color tints from the sample models (5 of each)
const tintOf = (o) => o.ColorDiffuse ? [o.ColorDiffuse.r ?? 0, o.ColorDiffuse.g ?? 0, o.ColorDiffuse.b ?? 0] : [1, 1, 1];
const colorTints = {};
for (const s of models.filter((o) => !o.Nickname && o.Transform.posX < -35 && o.Transform.posZ < -34)) {
  // nearest bag column x → color, per the Lua bag GUID wiring: green@-51,
  // red@-48, blue@-45, yellow@-42 (9d3a87), brown@-39 (ae14d8)
  const cols = [[-51, 'Green'], [-48, 'Red'], [-45, 'Blue'], [-42, 'Yellow'], [-39, 'Brown']];
  const [, color] = cols.reduce((best, c) => Math.abs(s.Transform.posX - c[0]) < Math.abs(s.Transform.posX - best[0]) ? c : best);
  const kind = s.Transform.posZ > -36.3 ? 'ship' : 'train';
  (colorTints[color] ??= {})[kind] = tintOf(s);
}

// scoring marker per color: 5 markers at -42.8; tint tells the color
const markers = models.filter((o) => o.Nickname === 'scoring marker');
console.log(`scoring markers: ${markers.length}`);

// ---------------------------------------------------------------------------
// 6. Decks -> card cell maps
// ---------------------------------------------------------------------------

function deckInfo(guid) {
  const d = obj(guid);
  const sheets = {};
  for (const [id, s] of Object.entries(d.CustomDeck)) {
    sheets[id] = { face: s.FaceURL, back: s.BackURL, cols: s.NumWidth, rows: s.NumHeight };
  }
  const cards = (d.DeckIDs ?? []).map((cid) => ({ sheet: Math.floor(cid / 100), cell: cid % 100 }));
  return { sheets, cards };
}
const decks = {
  ticket: deckInfo('323e82'),
  ship: deckInfo('ca1978'),
  train: deckInfo('d57dc6'),
};
console.log(`decks: ticket ${decks.ticket.cards.length}, ship ${decks.ship.cards.length}, train ${decks.train.cards.length}`);

// ---------------------------------------------------------------------------
// 7. Stage assets: copy every referenced file from the TTS cache
// ---------------------------------------------------------------------------

fs.mkdirSync(OUT_ASSETS, { recursive: true });
fs.mkdirSync(OUT_GOLDEN, { recursive: true });

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
  let ext = path.extname(src).toLowerCase();
  if (!ext) { // sniff
    const b = fs.readFileSync(src);
    ext = b[0] === 0x89 ? '.png' : b[0] === 0xff ? '.jpg' : kind === 'model' ? '.obj' : '.bin';
  }
  const out = name + (kind === 'pdf' ? '.pdf' : ext);
  fs.copyFileSync(src, path.join(OUT_ASSETS, out));
  return `/ttr/${out}`;
}

const mapImage = stage(save.TableURL, 'img');
const rulesPdf = stage(save.ObjectStates.find((o) => o.Name === 'Custom_PDF').CustomPDF.PDFUrl, 'pdf');

const stageModel = (o) => ({
  mesh: stage(o.CustomMesh.MeshURL, 'model'),
  diffuse: o.CustomMesh.DiffuseURL ? stage(o.CustomMesh.DiffuseURL, 'img') : null,
  scale: [o.Transform.scaleX, o.Transform.scaleY, o.Transform.scaleZ],
});
const meshes = {
  train: stageModel(trainSample),
  ship: stageModel(shipSample),
  harbor: stageModel(harborModel),
  marker: stageModel(markerModel),
};

// deck sheets
for (const d of Object.values(decks)) {
  for (const s of Object.values(d.sheets)) {
    s.face = stage(s.face, 'img');
    s.back = stage(s.back, 'img');
  }
}

// image dims (png/jpg header) for aspect
function imgSize(rel) {
  const buf = fs.readFileSync(path.join(ROOT, 'client/public', rel.slice(1)));
  if (buf[0] === 0x89) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return [1, 1];
}
const [mapW, mapH] = imgSize(mapImage);
console.log(`map image: ${mapW}x${mapH}`);

// ---------------------------------------------------------------------------
// 8. Write outputs
// ---------------------------------------------------------------------------

const golden = {
  source: 'TTS workshop 3324777769 — Ticket to Ride: Rails and Sails - The World [Scripted]',
  seats: SEATS,
  setup: {
    dealTrainCards: 3, // train_deck.deal(3)
    dealShipCards: 7, // ship_deck.deal(7)
    dealTickets: 5, // route_deck.deal(5)
    marketShipSlots: 3, // pickups 1-3
    marketTrainSlots: 3, // pickups 4-6
  },
  cities,
  routes,
  doubles,
  harbors,
  snaps,
  zones,
};
fs.writeFileSync(path.join(OUT_GOLDEN, 'board.json'), JSON.stringify(golden, null, 1));

// NOTE: fit-ttr-map.mjs appends mapTransform to both outputs — run it after
// every re-extract, or carry the previous transform forward here.
let prevTransform = null;
try { prevTransform = JSON.parse(fs.readFileSync(path.join(OUT_ASSETS, 'scene.json'), 'utf8')).mapTransform ?? null; } catch { /* first run */ }

const scene = {
  mapTransform: prevTransform,
  map: { image: mapImage, px: [mapW, mapH] },
  rulesPdf,
  meshes,
  tints: colorTints,
  decks,
  zones,
  snaps,
};
fs.writeFileSync(path.join(OUT_ASSETS, 'scene.json'), JSON.stringify(scene));

// the engine's copies (golden board + hand-transcribed cards)
const SHARED = path.join(ROOT, 'shared/src/ttr');
fs.mkdirSync(SHARED, { recursive: true });
fs.copyFileSync(path.join(OUT_GOLDEN, 'board.json'), path.join(SHARED, 'board-data.json'));
if (fs.existsSync(path.join(OUT_GOLDEN, 'cards.json'))) {
  fs.copyFileSync(path.join(OUT_GOLDEN, 'cards.json'), path.join(SHARED, 'cards-data.json'));
}

console.log(`\nwrote ${path.relative(ROOT, path.join(OUT_GOLDEN, 'board.json'))}`);
console.log(`staged ${fs.readdirSync(OUT_ASSETS).length} files -> client/public/ttr/`);
