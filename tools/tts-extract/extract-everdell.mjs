// Everdell (base game) — stage assets from the TTS mod cache (workshop
// 1929354615, "Everdell [reworked] (All Expansions)") into
// client/public/everdell/ and write the golden deck tallies + scene data.
//
// Base game only. The mod's three dead assets (Newleaf sheet 517, Through The
// Seasons sheet 356, Golden Occupied tokens diffuse) are all expansion-only —
// nothing base-game is missing.
//
// Card identity is (CustomDeck sheet, CardID cell); cards are unnamed in the
// mod. cards.json (rules data) is transcribed separately and keyed by CardID.
//
// Idempotent: re-runs overwrite staged outputs from the same cached inputs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/everdell');
const GOLDEN_DIR = path.join(ROOT, 'games/everdell/golden');
const TMP = path.join(ROOT, 'tmp/everdell-cells');

const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
const cached = (dir, url, exts) => {
  for (const ext of exts) {
    const f = path.join(MODS, dir, munge(url) + ext);
    if (fs.existsSync(f)) return f;
  }
  throw new Error(`not cached: ${url}`);
};
const img = (url) => cached('Images', url, ['.png', '.jpg', '.jpeg']);
const model = (url) => cached('Models', url, ['.obj']);

for (const d of [OUT, path.join(OUT, 'cards'), path.join(OUT, 'models'), GOLDEN_DIR, TMP]) {
  fs.mkdirSync(d, { recursive: true });
}

const mod = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop/1929354615.json'), 'utf8'));
const byGuid = {};
{
  const walk = (o) => { byGuid[o.GUID] = o; for (const c of o.ContainedObjects ?? []) walk(c); for (const s of Object.values(o.States ?? {})) walk(s); };
  for (const o of mod.ObjectStates) walk(o);
}

// ---------- deck tallies (golden; the engine's copy counts) ----------
// base deck 4d3c01 (120) + Base Farms da6ee5 (8) merged at setup (Lua 1928-34).
// forest 751d69 (11). events 60cfda (15) + separate Everdell Games card 6c0a05
// (cell 14900) = 16 special events.
const tally = (guid) => {
  const d = byGuid[guid];
  const t = {};
  for (const c of d.ContainedObjects) t[c.CardID] = (t[c.CardID] || 0) + 1;
  return t;
};
const decks = {
  main: tally('4d3c01'),
  farms: tally('da6ee5'),
  forest: tally('751d69'),
  events: { ...tally('60cfda'), 14900: 1 }, // + Everdell Games single card
};
// merged main deck (128): main + farms
const mainMerged = { ...decks.main };
for (const [id, n] of Object.entries(decks.farms)) mainMerged[id] = (mainMerged[id] || 0) + n;
// The four 1x1 duplicate sheets are the same printed card:
//   36400+41800 = Husband/Wife A (4 copies), 36600+41700 = B (4), 36500+42700 = Farm (8)
const CANON = { 41800: 36400, 41700: 36600, 42700: 36500 };
const mainCanon = {};
for (const [id, n] of Object.entries(mainMerged)) {
  const c = CANON[id] ?? id;
  mainCanon[c] = (mainCanon[c] || 0) + n;
}
const totalMain = Object.values(mainCanon).reduce((a, b) => a + b, 0);
if (totalMain !== 128) throw new Error(`main deck total ${totalMain} != 128`);
if (Object.keys(mainCanon).length !== 48) throw new Error(`unique main cards ${Object.keys(mainCanon).length} != 48`);
if (Object.keys(decks.forest).length !== 11) throw new Error('forest != 11');
if (Object.keys(decks.events).length !== 16) throw new Error('events != 16');

// ---------- sheets ----------
const SHEETS = {
  109: { url: 'http://cloud-3.steamusercontent.com/ugc/1007062572072285555/92352E32B91C96718DF34A174CFD4FCD91DCBD29/', w: 5, h: 6 },
  127: { url: 'http://cloud-3.steamusercontent.com/ugc/1007062919471674449/C18CD1D7099C0ACEBECA07172668F60EC0F11984/', w: 4, h: 7 },
  149: { url: 'http://cloud-3.steamusercontent.com/ugc/1007063757512009534/F126EC237B2352AE1504727680D1877D4AE5F409/', w: 6, h: 3 },
  150: { url: 'http://cloud-3.steamusercontent.com/ugc/1007063757512013383/0834117B7D2C0B156F1566C942AA8C2DA20F7453/', w: 2, h: 6 },
  364: { url: 'http://cloud-3.steamusercontent.com/ugc/2027216378733379933/B5F784A298A4689E43DDCE647431F6F1348C28EF/', w: 1, h: 1 },
  365: { url: 'http://cloud-3.steamusercontent.com/ugc/2027216378733379302/9BE53E14625FCAEB5DA5308FCD9D27F95FD0E845/', w: 1, h: 1 },
  366: { url: 'http://cloud-3.steamusercontent.com/ugc/2027216378733380407/917655E9292113B11A74FC058910638CBAB7D493/', w: 1, h: 1 },
  430: { url: 'http://cloud-3.steamusercontent.com/ugc/2027216378733394570/A61C2F38879884FEB870C161058AEE9F50188D45/', w: 1, h: 1 },
};
const BACKS = { // exact BackURLs from the mod decks (never invent the tail)
  main: byGuid['4d3c01'].CustomDeck['109'].BackURL,
  forest: byGuid['751d69'].CustomDeck['150'].BackURL,
  event: byGuid['60cfda'].CustomDeck['149'].BackURL,
};

// unique cells to stage (canonical only)
const cells = [
  ...Object.keys(mainCanon),
  ...Object.keys(decks.forest),
  ...Object.keys(decks.events),
].map(Number).sort((a, b) => a - b);

const sheetBuf = {};
for (const cell of cells) {
  const sheetId = Math.floor(cell / 100);
  const s = SHEETS[sheetId];
  if (!s) throw new Error(`no sheet for cell ${cell}`);
  if (!sheetBuf[sheetId]) {
    sheetBuf[sheetId] = sharp(img(s.url), { limitInputPixels: false });
    sheetBuf[sheetId].meta = await sheetBuf[sheetId].metadata();
  }
  const m = sheetBuf[sheetId].meta;
  const cw = Math.floor(m.width / s.w), ch = Math.floor(m.height / s.h);
  const idx = cell % 100;
  const col = idx % s.w, row = Math.floor(idx / s.w);
  const buf = await sharp(img(s.url), { limitInputPixels: false })
    .extract({ left: col * cw, top: row * ch, width: cw, height: ch })
    .toBuffer();
  // staged card face (device close-up ~ 640w) and transcription copy (900w)
  await sharp(buf).resize({ width: 640 }).webp({ quality: 86 }).toFile(path.join(OUT, 'cards', `card-${cell}.webp`));
  await sharp(buf).resize({ width: 900 }).png().toFile(path.join(TMP, `cell-${cell}.png`));
}
console.log('staged', cells.length, 'unique card faces');

for (const [k, u] of Object.entries(BACKS)) {
  await sharp(img(u), { limitInputPixels: false }).resize({ width: 640 }).webp({ quality: 86 }).toFile(path.join(OUT, `back-${k}.webp`));
}

// ---------- boards ----------
await sharp(img('http://cloud-3.steamusercontent.com/ugc/2170232209282356276/D28184D3FF935FF86DAB89C1219796ADACC5CB45/'), { limitInputPixels: false })
  .webp({ quality: 90 }).toFile(path.join(OUT, 'board.webp')); // 2111x2064, keep alpha + native res
await sharp(img('http://cloud-3.steamusercontent.com/ugc/1019445328402096111/C5EFF40C8CB14E1E1DA5AAE9043DE6E28BC90525/'), { limitInputPixels: false })
  .resize({ width: 2048 }).webp({ quality: 88 }).toFile(path.join(OUT, 'pboard.webp'));

// ---------- basic event tiles ----------
const EVENT_TILES = {
  harvest: '276261', tour: 'defbce', monument: '51d24a', expedition: '2b321b',
};
for (const [name, guid] of Object.entries(EVENT_TILES)) {
  const o = byGuid[guid];
  await sharp(img(o.CustomImage.ImageURL), { limitInputPixels: false })
    .resize({ width: 512 }).webp({ quality: 86 }).toFile(path.join(OUT, `event-${name}.webp`));
}

// ---------- models (worker meeple + resources + point token + occupied) ----------
const stageModel = async (name, guid, { useState } = {}) => {
  let o = byGuid[guid];
  if (useState && o.States) o = Object.values(o.States)[0] ?? o;
  const cm = o.CustomMesh;
  fs.copyFileSync(model(cm.MeshURL), path.join(OUT, 'models', `${name}.obj`));
  if (cm.DiffuseURL) {
    await sharp(img(cm.DiffuseURL), { limitInputPixels: false })
      .resize({ width: 512, withoutEnlargement: true }).webp({ quality: 85 })
      .toFile(path.join(OUT, 'models', `${name}.webp`));
  }
  return { mesh: `/everdell/models/${name}.obj`, tex: cm.DiffuseURL ? `/everdell/models/${name}.webp` : null };
};
const models = {};
models.worker = await stageModel('worker', '224423'); // default critter meeple (tint per seat)
models.twig = await stageModel('twig', 'c29f70');
models.resin = await stageModel('resin', 'bba7e8');
models.pebble = await stageModel('pebble', 'be11b7');
models.berry = await stageModel('berry', '7832d1');
models.point = await stageModel('point', 'f0bf84');
models.occupied = await stageModel('occupied', 'dcccf7');

// ---------- rulebook ----------
fs.copyFileSync(cached('PDF', 'http://cloud-3.steamusercontent.com/ugc/1999066343691032328/61548569F476C990D96D3701FAC1EEF5D904F7EF/', ['.PDF', '.pdf']), path.join(OUT, 'rulebook.pdf'));
fs.copyFileSync(cached('PDF', 'http://cloud-3.steamusercontent.com/ugc/1999066343691033266/2540478D477E3DBB60AD4DFCF6EA2443A22239D0/', ['.PDF', '.pdf']), path.join(OUT, 'appendix.pdf'));

// ---------- scene / golden ----------
const zonePos = (guid) => {
  const o = byGuid[guid];
  return o ? [+o.Transform.posX.toFixed(2), +o.Transform.posY.toFixed(2), +o.Transform.posZ.toFixed(2)] : null;
};
const golden = {
  workshop: 1929354615,
  totals: { mainDeck: 128, uniqueMain: 48, forest: 11, specialEvents: 16 },
  copies: mainCanon,          // CardID -> copies in the 128 deck
  forestCells: Object.keys(decks.forest).map(Number),
  eventCells: Object.keys(decks.events).map(Number),
  canonDupes: CANON,
  deal: { 2: [5, 6], 3: [5, 6, 7], 4: [5, 6, 7, 8] },   // Lua 2173-2185
  forestCount: { 2: 3, 3: 4, 4: 4 },                    // Lua 1038-1047
  meadow: 8, specialEventsDealt: 4, handLimit: 8, cityLimit: 15,
  workers: { winter: 2, spring: 1, summer: 1, autumn: 2 }, // cumulative +
  seats: ['White', 'Brown', 'Teal', 'Orange'],          // Lua PlayerColors
};
fs.writeFileSync(path.join(GOLDEN_DIR, 'everdell-data.json'), JSON.stringify(golden, null, 1));

const scene = {
  board: { img: '/everdell/board.webp', px: [2111, 2064] },
  pboard: { img: '/everdell/pboard.webp', px: [5572, 3183] },
  models,
  backs: { main: '/everdell/back-main.webp', forest: '/everdell/back-forest.webp', event: '/everdell/back-event.webp' },
  eventTiles: Object.fromEntries(Object.entries(EVENT_TILES).map(([k]) => [k, `/everdell/event-${k}.webp`])),
  // world positions from the mod (reference only; TV lays out in art-pixel space)
  world: {
    boardCenter: zonePos('24b026'),
    forest: [[-20.28, 1.11, 2.17], [-19.19, 1.11, -3.51], [19.93, 1.11, 1.91], [18.51, 1.11, -4.05]], // Lua 403-410
    meadowZones: ['4d80c7', 'f6f489', '16d112', 'e6951d', 'db9cea', '60f3eb', '628451', '0e3257'].map(zonePos),
    eventTreeCenter: zonePos('a61672'),
  },
};
fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene, null, 1));
fs.writeFileSync(path.join(GOLDEN_DIR, 'scene.json'), JSON.stringify(scene, null, 1));

console.log('golden totals ok: 128 main /', Object.keys(mainCanon).length, 'unique; forest', Object.keys(decks.forest).length, '; events', Object.keys(decks.events).length);
console.log('done');
