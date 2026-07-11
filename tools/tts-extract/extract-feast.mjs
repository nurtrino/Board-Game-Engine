// A Feast for Odin (classic base, 2016) - authentic TTS asset and golden-data extractor.
//
// Authority:
//   * Workshop save 790490875 for component art, GUIDs, counts, card cells, and transforms.
//   * Official Feuerland English appendix for occupation text and special-tile values.
//   * Printed component art for board grids, bonuses, forbidden cells, and polyomino masks.
//
// Run from anywhere:
//   node tools/tts-extract/extract-feast.mjs

// Outputs are deterministic and idempotent:
//   games/feast/golden/*.json
//   client/public/feast/**/*

// No placeholder or synthetic game art is emitted. logo.webp is a crop of the authentic
// mod box cover and remains linked to that source asset in manifest.json.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const SAVE_FILE = path.join(MODS, 'Workshop', '790490875.json');
const OUT = path.join(ROOT, 'client/public/feast');
const GOLDEN = path.join(ROOT, 'games/feast/golden');
const PDF_TMP = path.join(ROOT, 'tmp/pdfs');
const APPENDIX_SOURCE = path.join(PDF_TMP, 'odin-appendix.pdf');
const RULEBOOK_SOURCE = path.join(PDF_TMP, 'odin-rulebook.pdf');

for (const directory of [
  OUT, GOLDEN,
  path.join(OUT, 'buildings'), path.join(OUT, 'cards'), path.join(OUT, 'exploration'),
  path.join(OUT, 'extensions'), path.join(OUT, 'goods'), path.join(OUT, 'models'),
  path.join(OUT, 'mountains'), path.join(OUT, 'resources'), path.join(OUT, 'ships'),
  path.join(OUT, 'special'),
]) fs.mkdirSync(directory, { recursive: true });

const fail = (message) => { throw new Error(`Feast extractor: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const round = (value, places = 6) => Number(Number(value).toFixed(places));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = (file, value) => fs.writeFileSync(file, json(value), 'utf8');
const munge = (url) => url.replace(/[^A-Za-z0-9]/g, '');
const publicPath = (relative) => `/feast/${relative.replaceAll('\\', '/')}`;

assert(fs.existsSync(SAVE_FILE), `missing workshop save ${SAVE_FILE}`);
assert(fs.existsSync(APPENDIX_SOURCE), `missing official appendix ${APPENDIX_SOURCE}`);
assert(fs.existsSync(RULEBOOK_SOURCE), `missing official rulebook ${RULEBOOK_SOURCE}`);

const save = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
assert(save.SaveName === 'A Feast For Odin', `unexpected save name ${save.SaveName}`);
assert(save.ObjectStates.length === 208, `expected 208 top-level objects, got ${save.ObjectStates.length}`);

const byGuid = new Map();
const recursiveObjects = [];
function walk(object, parentGuid = null, objectPath = '') {
  assert(object.GUID, `object at ${objectPath} has no GUID`);
  // Duplicate GUIDs exist inside old TTS bags/decks. Keep the first as a representative,
  // and preserve every occurrence in recursiveObjects instead of silently dropping them.
  if (!byGuid.has(object.GUID)) byGuid.set(object.GUID, object);
  recursiveObjects.push({ object, parentGuid, objectPath });
  for (const [index, child] of (object.ContainedObjects ?? []).entries()) {
    walk(child, object.GUID, `${objectPath}/contained/${index}`);
  }
  for (const [state, child] of Object.entries(object.States ?? {})) {
    walk(child, object.GUID, `${objectPath}/state/${state}`);
  }
}
for (const [index, object] of save.ObjectStates.entries()) walk(object, null, `top/${index}`);
assert(recursiveObjects.length === 1061, `expected 1,061 recursive objects, got ${recursiveObjects.length}`);
const object = (guid) => byGuid.get(guid) ?? fail(`missing TTS object ${guid}`);

function cached(url, kind = 'image') {
  assert(url && /^https?:/i.test(url), `invalid ${kind} URL ${url}`);
  const config = {
    image: ['Images', ['.png', '.jpg', '.jpeg']],
    model: ['Models', ['.obj']],
    pdf: ['PDF', ['.PDF', '.pdf']],
  }[kind];
  assert(config, `unsupported cache kind ${kind}`);
  const [directory, extensions] = config;
  const base = path.join(MODS, directory, munge(url));
  const found = extensions.map((extension) => base + extension).find((candidate) => fs.existsSync(candidate));
  return found ?? fail(`uncached ${kind}: ${url}`);
}

const assetRecords = [];
async function stageImage({ id, url, relative, guids = [], quality = 93, width = null, lossless = false, role = null }) {
  const sourceFile = cached(url, 'image');
  const targetFile = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const pipeline = sharp(sourceFile, { failOn: 'error' });
  const sourceMeta = await pipeline.metadata();
  if (width) pipeline.resize({ width, withoutEnlargement: true });
  await pipeline.webp(lossless
    ? { lossless: true, effort: 5 }
    : { quality, alphaQuality: 100, smartSubsample: true, effort: 5 }).toFile(targetFile);
  const outputMeta = await sharp(targetFile).metadata();
  const record = {
    id, role, publicPath: publicPath(relative), guids, sourceUrl: url,
    source: {
      cacheFile: path.relative(MODS, sourceFile).replaceAll('\\', '/'),
      sha256: sha256(sourceFile), bytes: fs.statSync(sourceFile).size,
      imagePx: [sourceMeta.width, sourceMeta.height], format: sourceMeta.format,
      hasAlpha: Boolean(sourceMeta.hasAlpha),
    },
    staged: {
      sha256: sha256(targetFile), bytes: fs.statSync(targetFile).size,
      imagePx: [outputMeta.width, outputMeta.height], format: outputMeta.format,
      hasAlpha: Boolean(outputMeta.hasAlpha),
    },
  };
  assetRecords.push(record);
  return record.publicPath;
}

function stageFile({ id, sourceFile, relative, guids = [], sourceUrl = null, role = null, transformText = null }) {
  assert(fs.existsSync(sourceFile), `missing source file ${sourceFile}`);
  const targetFile = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  if (transformText) fs.writeFileSync(targetFile, transformText(fs.readFileSync(sourceFile, 'utf8')), 'utf8');
  else fs.copyFileSync(sourceFile, targetFile);
  const record = {
    id, role, publicPath: publicPath(relative), guids, sourceUrl,
    source: {
      cacheFile: path.relative(ROOT, sourceFile).replaceAll('\\', '/'),
      sha256: sha256(sourceFile), bytes: fs.statSync(sourceFile).size,
    },
    staged: { sha256: sha256(targetFile), bytes: fs.statSync(targetFile).size },
  };
  assetRecords.push(record);
  return record.publicPath;
}

function stageModel({ id, url, relative, guids, role }) {
  return stageFile({
    id, sourceFile: cached(url, 'model'), relative, guids, sourceUrl: url, role,
    // A few legacy TTS Pastebin OBJs end in a lone `0` sentinel. TTS ignores
    // it; three.js warns. Preserve the authenticated source hash while staging
    // standards-compliant OBJ text for the browser.
    transformText: (text) => text.replace(/(?:\r?\n)0\s*$/, '\n'),
  });
}

const transform = (ttsObject) => {
  const t = ttsObject.Transform;
  return {
    pos: [t.posX, t.posY, t.posZ].map((value) => round(value)),
    rot: [t.rotX, t.rotY, t.rotZ].map((value) => round(value)),
    scale: [t.scaleX, t.scaleY, t.scaleZ].map((value) => round(value)),
  };
};

const imageSide = (ttsObject, side = 'primary') => {
  const data = ttsObject.CustomImage ?? ttsObject.CustomToken;
  assert(data, `${ttsObject.GUID} has no image data`);
  const url = side === 'secondary' ? data.ImageSecondaryURL : data.ImageURL;
  assert(url, `${ttsObject.GUID} has no ${side} image`);
  return url;
};

// ---------------------------------------------------------------------------
// Component definitions and authentic art staging
// ---------------------------------------------------------------------------

const ACTION_GUID = '996bfd';
const HOME_GUIDS = ['037bf4', 'c52e5a', '85c969', '74941a'];
const SPECIAL_DISPLAY_GUID = '9c35fb';
const SHIP_DISPLAY_GUID = '8cabca';
const ROUND_OVERVIEW_GUID = 'c89f80';
const BOX_GUID = 'e2d3ea';

const actionObject = object(ACTION_GUID);
const homeObject = object(HOME_GUIDS[0]);
const actionBoardImage = await stageImage({
  id: 'action-board', role: 'action-board', url: imageSide(actionObject), relative: 'action-board.webp',
  guids: [ACTION_GUID], quality: 95,
});
const homeShortImage = await stageImage({
  id: 'home-short', role: 'home-board', url: imageSide(homeObject), relative: 'home-short.webp',
  guids: HOME_GUIDS, quality: 94,
});
const homeLongImage = await stageImage({
  id: 'home-long', role: 'home-board', url: imageSide(homeObject, 'secondary'), relative: 'home-long.webp',
  guids: HOME_GUIDS, quality: 94,
});

// Source-derived crops retain the authentic printed Feast track while allowing
// the player screen to frame it independently of the rest of the home board.
// The short and long faces differ in their printed round/worker positions, so
// preserve both rather than silently using one crop for both game lengths.
const banquetCropPx = [1230, 15, 1080, 390];
const banquetTables = {};
for (const [length, url] of [['short', imageSide(homeObject)], ['long', imageSide(homeObject, 'secondary')]]) {
  const sourceFile = cached(url, 'image');
  const relative = `banquet-table-${length}.webp`;
  const targetFile = path.join(OUT, relative);
  const [left, top, width, height] = banquetCropPx;
  await sharp(sourceFile)
    .extract({ left, top, width, height })
    .resize({ width: 1620 })
    .webp({ quality: 95, alphaQuality: 100, effort: 5 })
    .toFile(targetFile);
  const image = publicPath(relative);
  banquetTables[length] = { image, sourceUrl: url, sourceGuid: HOME_GUIDS[0], cropPx: banquetCropPx };
  assetRecords.push({
    id: `banquet-table-${length}`, role: 'banquet-table-crop', publicPath: image,
    guids: HOME_GUIDS, sourceUrl: url, cropPx: banquetCropPx,
    source: {
      cacheFile: path.relative(MODS, sourceFile).replaceAll('\\', '/'), sha256: sha256(sourceFile),
      bytes: fs.statSync(sourceFile).size, imagePx: [2354, 1500],
    },
    staged: {
      sha256: sha256(targetFile), bytes: fs.statSync(targetFile).size,
      imagePx: [1620, 585], format: 'webp', hasAlpha: false,
    },
  });
}
// Backward-compatible singular path points to the long-game crop; callers that
// know game length should use scene.banquetTables instead.
fs.copyFileSync(path.join(OUT, 'banquet-table-long.webp'), path.join(OUT, 'banquet-table.webp'));
banquetTables.default = { ...banquetTables.long, image: '/feast/banquet-table.webp' };
assetRecords.push({
  id: 'banquet-table', role: 'banquet-table-default-alias', publicPath: '/feast/banquet-table.webp',
  guids: HOME_GUIDS, sourceUrl: imageSide(homeObject, 'secondary'), cropPx: banquetCropPx,
  source: {
    cacheFile: path.relative(MODS, cached(imageSide(homeObject, 'secondary'), 'image')).replaceAll('\\', '/'),
    sha256: sha256(cached(imageSide(homeObject, 'secondary'), 'image')),
    bytes: fs.statSync(cached(imageSide(homeObject, 'secondary'), 'image')).size, imagePx: [2354, 1500],
  },
  staged: {
    sha256: sha256(path.join(OUT, 'banquet-table.webp')),
    bytes: fs.statSync(path.join(OUT, 'banquet-table.webp')).size,
    imagePx: [1620, 585], format: 'webp', hasAlpha: false,
  },
});

const specialDisplay = object(SPECIAL_DISPLAY_GUID);
const specialDisplayFront = await stageImage({
  id: 'special-display-front', role: 'supply-board', url: imageSide(specialDisplay),
  relative: 'special-display.webp', guids: [SPECIAL_DISPLAY_GUID], quality: 94,
});
const specialDisplayBack = await stageImage({
  id: 'special-display-back', role: 'supply-board-back', url: imageSide(specialDisplay, 'secondary'),
  relative: 'special-display-back.webp', guids: [SPECIAL_DISPLAY_GUID], quality: 92,
});
const shipDisplay = object(SHIP_DISPLAY_GUID);
const shipDisplayFront = await stageImage({
  id: 'ship-display-front', role: 'supply-board', url: imageSide(shipDisplay),
  relative: 'ship-display.webp', guids: [SHIP_DISPLAY_GUID], quality: 94,
});
const shipDisplayBack = await stageImage({
  id: 'ship-display-back', role: 'supply-board-back', url: imageSide(shipDisplay, 'secondary'),
  relative: 'ship-display-back.webp', guids: [SHIP_DISPLAY_GUID], quality: 92,
});

const roundObject = object(ROUND_OVERVIEW_GUID);
const roundOverviewImage = await stageImage({
  id: 'round-overview', role: 'round-overview', url: imageSide(roundObject), relative: 'round-overview.webp',
  guids: [ROUND_OVERVIEW_GUID], quality: 95,
});
const roundOverviewBack = await stageImage({
  id: 'round-overview-back', role: 'component-back', url: imageSide(roundObject, 'secondary'),
  relative: 'round-overview-back.webp', guids: [ROUND_OVERVIEW_GUID], quality: 91,
});

const boxObject = object(BOX_GUID);
const boxSource = cached(imageSide(boxObject), 'image');
const boxImage = await stageImage({
  id: 'box', role: 'box-cover', url: imageSide(boxObject), relative: 'box.webp', guids: [BOX_GUID], quality: 95,
});
const boxMeta = await sharp(boxSource).metadata();
assert(boxMeta.width === 527 && boxMeta.height === 738, `box art changed: ${boxMeta.width}x${boxMeta.height}`);
const logoTarget = path.join(OUT, 'logo.webp');
await sharp(boxSource)
  .extract({ left: 35, top: 8, width: 458, height: 210 })
  .resize({ width: 916 })
  .webp({ quality: 95, alphaQuality: 100, effort: 5 })
  .toFile(logoTarget);
assetRecords.push({
  id: 'logo', role: 'logo-crop', publicPath: '/feast/logo.webp', guids: [BOX_GUID],
  sourceUrl: imageSide(boxObject), cropPx: [35, 8, 458, 210],
  source: { cacheFile: path.relative(MODS, boxSource).replaceAll('\\', '/'), sha256: sha256(boxSource), bytes: fs.statSync(boxSource).size, imagePx: [527, 738] },
  staged: { sha256: sha256(logoTarget), bytes: fs.statSync(logoTarget).size, imagePx: [916, 420], format: 'webp', hasAlpha: false },
});
const logoImage = '/feast/logo.webp';

const extensions = {};
for (const definition of [
  { id: 'columns-1-2', guid: 'ea6dee', a: 'columns-1', b: 'columns-2' },
  { id: 'columns-3-4', guid: '2dd414', a: 'columns-3', b: 'columns-4' },
]) {
  const source = object(definition.guid);
  const faceA = await stageImage({
    id: `extension-${definition.a}`, role: 'imitation-extension', url: imageSide(source),
    relative: `extensions/${definition.a}.webp`, guids: [definition.guid], quality: 94,
  });
  const faceB = await stageImage({
    id: `extension-${definition.b}`, role: 'imitation-extension', url: imageSide(source, 'secondary'),
    relative: `extensions/${definition.b}.webp`, guids: [definition.guid], quality: 94,
  });
  extensions[definition.id] = {
    guid: definition.guid, tts: transform(source),
    faces: [
      { id: definition.a, column: Number(definition.a.at(-1)), image: faceA, sourceUrl: imageSide(source) },
      { id: definition.b, column: Number(definition.b.at(-1)), image: faceB, sourceUrl: imageSide(source, 'secondary') },
    ],
  };
}

const explorationPairs = [
  { pairId: 'A', guid: '15d0ed', primary: 'shetland', secondary: 'bear-island' },
  { pairId: 'B', guid: 'd62e9b', primary: 'faroe-islands', secondary: 'baffin-island' },
  { pairId: 'C', guid: 'e2186a', primary: 'iceland', secondary: 'labrador' },
  { pairId: 'D', guid: '2c7a52', primary: 'greenland', secondary: 'newfoundland' },
];
const explorationScene = {};
for (const pair of explorationPairs) {
  const source = object(pair.guid);
  for (const [side, id] of [['primary', pair.primary], ['secondary', pair.secondary]]) {
    const url = imageSide(source, side);
    explorationScene[id] = {
      id, pair: pair.pairId, reverse: id === pair.primary ? pair.secondary : pair.primary,
      guid: pair.guid, side, sourceUrl: url,
      image: await stageImage({
        id: `exploration-${id}`, role: 'exploration-board', url,
        relative: `exploration/${id}.webp`, guids: [pair.guid], quality: 95,
      }),
      tts: transform(source),
    };
  }
}
assert(Object.keys(explorationScene).length === 8, 'expected eight exploration faces');

const buildingDefs = [
  { id: 'shed', guid: '5bcac9', bagCount: 3, altGuid: null },
  { id: 'stone-house', guid: '993898', bagCount: 3, altGuid: null },
  { id: 'long-house', guid: '8b9cf7', bagCount: 5, altGuid: 'd79e74' },
];
const buildings = {};
for (const definition of buildingDefs) {
  const source = object(definition.guid);
  const matching = recursiveObjects.filter(({ object: candidate }) => candidate.Nickname === source.Nickname && candidate.Name === 'Custom_Tile');
  assert(matching.length === definition.bagCount, `${definition.id}: expected ${definition.bagCount}, found ${matching.length}`);
  buildings[definition.id] = {
    id: definition.id, guid: definition.guid, guids: matching.map(({ object: candidate }) => candidate.GUID),
    count: matching.length, sourceUrl: imageSide(source),
    front: await stageImage({
      id: `building-${definition.id}`, role: 'building', url: imageSide(source),
      relative: `buildings/${definition.id}.webp`, guids: matching.map(({ object: candidate }) => candidate.GUID), quality: 95,
    }),
    back: await stageImage({
      id: `building-${definition.id}-back`, role: 'building-back', url: imageSide(source, 'secondary'),
      relative: `buildings/${definition.id}-back.webp`, guids: matching.map(({ object: candidate }) => candidate.GUID), quality: 92,
    }),
    alternateFront: null,
  };
  if (definition.altGuid) {
    const alternate = object(definition.altGuid);
    buildings[definition.id].alternateFront = await stageImage({
      id: `building-${definition.id}-alternate`, role: 'building', url: imageSide(alternate),
      relative: `buildings/${definition.id}-alternate.webp`, guids: [definition.altGuid], quality: 95,
    });
  }
}

const shipDefs = [
  { id: 'whaling-boat', name: 'Whaling Boat', bagGuid: 'b88bb1', sampleGuid: '661d6a', cost: 3, points: 3, bay: 'small' },
  { id: 'knarr', name: 'Knarr', bagGuid: 'd3d565', sampleGuid: 'e4aaee', cost: 5, points: 5, bay: 'large', emigrationPoints: 18 },
  { id: 'longship', name: 'Longship', bagGuid: '57dbed', sampleGuid: '39ba83', cost: 8, points: 8, bay: 'large', emigrationPoints: 21 },
];
const ships = {};
for (const definition of shipDefs) {
  const bag = object(definition.bagGuid);
  const source = object(definition.sampleGuid);
  const pieces = bag.ContainedObjects ?? [];
  assert(pieces.length > 0, `${definition.id} bag is empty`);
  assert(pieces.every((piece) => piece.Nickname === definition.name), `${definition.id} bag has mismatched pieces`);
  ships[definition.id] = {
    ...definition, count: pieces.length, guids: pieces.map((piece) => piece.GUID), sourceUrl: imageSide(source),
    front: await stageImage({
      id: `ship-${definition.id}`, role: 'ship', url: imageSide(source),
      relative: `ships/${definition.id}-front.webp`, guids: [definition.sampleGuid, ...pieces.map((piece) => piece.GUID)], quality: 95,
    }),
    back: null,
  };
  if ((source.CustomImage?.ImageSecondaryURL ?? '').startsWith('http')) {
    ships[definition.id].back = await stageImage({
      id: `ship-${definition.id}-back`, role: 'ship-back', url: imageSide(source, 'secondary'),
      relative: `ships/${definition.id}-back.webp`, guids: [definition.sampleGuid, ...pieces.map((piece) => piece.GUID)], quality: 95,
    });
  }
}
assert(ships['whaling-boat'].count === 10, `expected 10 whaling boats, got ${ships['whaling-boat'].count}`);
assert(ships.knarr.count === 12, `expected 12 knarrs, got ${ships.knarr.count}`);
assert(ships.longship.count === 10, `expected 10 longships, got ${ships.longship.count}`);

const goodsSource = [
  ['peas', 'mead', '8d4e28', 25, 2, 1, 'orange', 'red'],
  ['flax', 'stockfish', '95013a', 20, 3, 1, 'orange', 'red'],
  ['beans', 'milk', '75db21', 20, 2, 2, 'orange', 'red'],
  ['grain', 'salt-meat', 'ae9d40', 20, 4, 1, 'orange', 'red'],
  ['cabbage', 'game-meat', 'dc7256', 17, 3, 2, 'orange', 'red'],
  ['fruits', 'whale-meat', 'f670ab', 15, 3, 3, 'orange', 'red'],
  ['sheep', 'pregnant-sheep', '21c530', 18, 4, 2, 'red', 'red'],
  ['cattle', 'pregnant-cattle', 'd54da5', 15, 4, 3, 'red', 'red'],
  ['oil', 'rune-stone', 'fd16dc', 43, 2, 1, 'green', 'blue'],
  ['hide', 'silverware', '019662', 30, 3, 1, 'green', 'blue'],
  ['wool', 'chest', '15a9d8', 30, 2, 2, 'green', 'blue'],
  ['linen', 'silk', 'de4431', 20, 4, 1, 'green', 'blue'],
  ['skin-and-bones', 'spices', 'd76828', 20, 3, 2, 'green', 'blue'],
  ['fur', 'jewelry', 'b35e74', 20, 4, 2, 'green', 'blue'],
  ['robe', 'treasure-chest', 'e2034f', 18, 3, 3, 'green', 'blue'],
  ['clothing', 'silver-hoard', 'bb5010', 15, 4, 3, 'green', 'blue'],
];
const goods = {};
for (const [frontId, backId, bagGuid, expectedCount, width, height, frontColor, backColor] of goodsSource) {
  const bag = object(bagGuid);
  const pieces = bag.ContainedObjects ?? [];
  assert(pieces.length === expectedCount, `${frontId}/${backId}: expected ${expectedCount}, got ${pieces.length}`);
  const source = pieces[0];
  const guids = pieces.map((piece) => piece.GUID);
  const front = await stageImage({
    id: `good-${frontId}`, role: 'good', url: imageSide(source), relative: `goods/${frontId}.webp`, guids, quality: 95,
  });
  const back = await stageImage({
    id: `good-${backId}`, role: 'good', url: imageSide(source, 'secondary'), relative: `goods/${backId}.webp`, guids, quality: 95,
  });
  goods[frontId] = {
    id: frontId, name: frontId.replaceAll('-', ' '), color: frontColor, reverse: backId,
    shape: { width, height, mask: Array.from({ length: height }, () => '#'.repeat(width)) },
    count: expectedCount, bagGuid, guids, image: front, sourceUrl: imageSide(source),
  };
  goods[backId] = {
    id: backId, name: backId.replaceAll('-', ' '), color: backColor, reverse: frontId,
    shape: { width, height, mask: Array.from({ length: height }, () => '#'.repeat(width)) },
    count: expectedCount, bagGuid, guids, image: back, sourceUrl: imageSide(source, 'secondary'),
  };
}
assert(Object.keys(goods).length === 32, `expected 32 good faces, got ${Object.keys(goods).length}`);

const resourceDefs = [
  { id: 'wood', sampleGuid: '1c9f75', bagGuid: '11fedc', expected: 32, kind: 'token' },
  { id: 'stone', sampleGuid: '508e9c', bagGuid: '410571', expected: 24, kind: 'token' },
];
const resources = {};
for (const definition of resourceDefs) {
  const source = object(definition.sampleGuid);
  const pieces = object(definition.bagGuid).ContainedObjects ?? [];
  assert(pieces.length === definition.expected, `${definition.id}: expected ${definition.expected}, got ${pieces.length}`);
  resources[definition.id] = {
    ...definition, count: pieces.length, guids: pieces.map((piece) => piece.GUID), sourceUrl: imageSide(source),
    image: await stageImage({
      id: `resource-${definition.id}`, role: 'resource', url: imageSide(source),
      relative: `resources/${definition.id}.webp`, guids: [definition.sampleGuid, ...pieces.map((piece) => piece.GUID)],
      quality: 95, lossless: true,
    }),
  };
}

const oreSource = object('feb814');
const orePieces = object('594862').ContainedObjects ?? [];
assert(orePieces.length === 40, `expected 40 ore, got ${orePieces.length}`);
resources.ore = {
  id: 'ore', sampleGuid: 'feb814', bagGuid: '594862', expected: 40, count: 40,
  guids: orePieces.map((piece) => piece.GUID), sourceUrl: oreSource.CustomMesh.DiffuseURL,
  image: await stageImage({
    id: 'resource-ore-texture', role: 'resource-texture', url: oreSource.CustomMesh.DiffuseURL,
    relative: 'resources/ore.webp', guids: ['feb814', ...orePieces.map((piece) => piece.GUID)], quality: 95,
  }),
};

const silverDefs = [
  ['silver-1', 'd3f3c1', 'fa6941', 80], ['silver-2', '64f4ba', '23f013', 22],
  ['silver-4', '61a832', 'ac39a2', 18], ['silver-10', 'f09402', 'faeacc', 5],
];
const silver = {};
for (const [id, bagGuid, sampleGuid, expected] of silverDefs) {
  const pieces = object(bagGuid).ContainedObjects ?? [];
  assert(pieces.length === expected, `${id}: expected ${expected}, got ${pieces.length}`);
  const source = object(sampleGuid);
  silver[id] = {
    id, count: expected, bagGuid, guids: pieces.map((piece) => piece.GUID), sourceUrl: imageSide(source),
    image: await stageImage({
      id, role: 'silver', url: imageSide(source), relative: `resources/${id}.webp`,
      guids: [sampleGuid, ...pieces.map((piece) => piece.GUID)], quality: 95,
    }),
  };
}

const penaltyBag = object('073e86');
const penaltyPieces = penaltyBag.ContainedObjects ?? [];
assert(penaltyPieces.length === 7, `expected seven bagged penalties, got ${penaltyPieces.length}`);
const penaltyLoose = object('a840dc');
const penaltyImage = await stageImage({
  id: 'thing-penalty', role: 'penalty', url: imageSide(penaltyLoose), relative: 'resources/thing-penalty.webp',
  guids: ['a840dc', ...penaltyPieces.map((piece) => piece.GUID)], quality: 95, lossless: true,
});

// ---------------------------------------------------------------------------
// Special tiles: values from the official appendix; masks from alpha geometry.
// ---------------------------------------------------------------------------

const specialSource = [
  ['amber-figure', 'Amber Figure', '06eb43', 7, 9, 2, false, 0],
  ['round-shield', 'Round Shield', '9e68f5', 12, 13, 6, false, 0],
  ['english-crown', 'English Crown', '4a47a8', 13, 16, null, false, 2],
  ['horseshoe', 'Horseshoe', '36ea09', 7, 9, 2, true, 0],
  ['gold-brooch', 'Gold Brooch', '06780d', 8, 9, 3, false, 0],
  ['throwing-axe', 'Throwing Axe', 'e29cff', 9, 11, 4, true, 0],
  ['chalice', 'Chalice', '54573b', 10, 12, 5, false, 0],
  ['belt', 'Belt', '1c4ceb', 5, 8, 2, false, 0],
  ['cloakpin', 'Cloakpin', '4479b9', 5, 8, 1, true, 0],
  ['drinking-horn', 'Drinking Horn', '50db66', 6, 8, 2, false, 0],
  ['fibula', 'Fibula', '9a1b1d', 9, 10, 4, true, 0],
  ['crucifix', 'Crucifix', '0b4301', 6, 8, 2, true, 0],
  ['forge-hammer', 'Forge Hammer', '8d48fc', 9, 10, 4, true, 0],
  ['glass-beads', 'Glass Beads', 'e847df', 5, 7, 0, false, 0],
  ['helmet', 'Helmet', 'b9bfbd', 5, 8, 1, true, 0],
];

async function alphaMask(url, expectedArea) {
  const sourceFile = cached(url, 'image');
  const image = sharp(sourceFile, { failOn: 'error' });
  const metadata = await image.metadata();
  if (!metadata.hasAlpha) {
    // Belt is the official 1000x200 JPEG and is exactly five cells in one row.
    assert(metadata.width % 200 === 0 && metadata.height % 200 === 0,
      `opaque special art has non-cell dimensions ${metadata.width}x${metadata.height}`);
    const mask = Array.from({ length: metadata.height / 200 }, () => '#'.repeat(metadata.width / 200));
    assert(mask.join('').replaceAll('.', '').length === expectedArea, 'opaque special area mismatch');
    return { mask, cellPx: 200, sampleOffsetPx: [0, 0], method: 'opaque-rectangular-200px-cells' };
  }
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert((info.width - 100) % 200 === 0 && (info.height - 100) % 200 === 0,
    `transparent special art changed dimensions: ${info.width}x${info.height}`);
  const cols = (info.width - 100) / 200;
  const rows = (info.height - 100) / 200;
  const mask = [];
  for (let row = 0; row < rows; row += 1) {
    let line = '';
    for (let column = 0; column < cols; column += 1) {
      const x = 50 + column * 200 + 100;
      const y = 50 + row * 200 + 100;
      const alpha = data[(y * info.width + x) * 4 + 3];
      line += alpha >= 128 ? '#' : '.';
    }
    mask.push(line);
  }
  const area = mask.join('').split('').filter((cell) => cell === '#').length;
  assert(area === expectedArea, `alpha-derived special area expected ${expectedArea}, got ${area}: ${mask}`);
  return { mask, cellPx: 200, sampleOffsetPx: [50, 50], method: 'alpha-center-sample-200px-cells' };
}

const specials = [];
for (const [id, name, guid, expectedArea, swordValue, silverCost, forge, points] of specialSource) {
  const source = object(guid);
  const url = imageSide(source);
  const geometry = await alphaMask(url, expectedArea);
  const staged = await stageImage({
    id: `special-${id}`, role: 'special-tile', url, relative: `special/${id}.webp`,
    guids: [guid], quality: 96, lossless: true,
  });
  specials.push({
    id, name, guid, sourceUrl: url, image: staged, area: expectedArea, ...geometry,
    swordValue, silverCost, forge, points,
  });
}
assert(specials.length === 15, `expected 15 specials, got ${specials.length}`);
assert(new Set(specials.map((tile) => tile.id)).size === 15, 'duplicate special id');
assert(specials.filter((tile) => tile.forge).length === 7, 'expected seven forgeable special tiles');

// ---------------------------------------------------------------------------
// Mountains: each printed item is read from the authentic strip, arrow end first.
// ---------------------------------------------------------------------------

const mountainItems = [
  ['wood', 'wood', 'stone', 'stone', 'stone', 'ore', 'silver-2'],
  ['wood', 'wood', 'wood', 'stone', 'stone', 'stone', 'silver-2'],
  ['wood', 'wood', 'wood', 'wood', 'stone', 'ore', 'silver-2'],
  ['wood', 'wood', 'stone', 'stone', 'ore', 'ore', 'silver-2'],
  ['wood', 'wood', 'wood', 'wood', 'stone', 'stone', 'silver-2'],
  ['wood', 'wood', 'wood', 'stone', 'stone', 'ore', 'silver-2'],
  ['wood', 'wood', 'stone', 'ore', 'ore', 'silver-2', 'silver-2'],
  ['wood', 'wood', 'wood', 'stone', 'ore', 'ore', 'silver-2'],
];
const mountainBag = object('750771');
const mountainObjects = mountainBag.ContainedObjects ?? [];
assert(mountainObjects.length === 8, `expected eight mountain strips, got ${mountainObjects.length}`);
const mountains = [];
for (const [index, source] of mountainObjects.entries()) {
  assert(source.Nickname === 'Mountain', `unexpected object in mountain bag: ${source.Nickname}`);
  const id = `strip-${String(index + 1).padStart(2, '0')}`;
  const items = mountainItems[index];
  assert(items.length === 7, `${id} does not contain seven printed items`);
  mountains.push({
    id, order: index + 1, guid: source.GUID, sourceUrl: imageSide(source), direction: 'arrow-end-first', items,
    image: await stageImage({
      id: `mountain-${id}`, role: 'mountain-strip', url: imageSide(source),
      relative: `mountains/${id}.webp`, guids: [source.GUID], quality: 95,
    }),
  });
}

// ---------------------------------------------------------------------------
// Card sheets, exact cells/counts, occupation appendix parse, and weapon deck.
// ---------------------------------------------------------------------------

const sheetObjects = {
  occupationB: object('8d76cb'), occupationC: object('deaab0'), occupationA: object('fa2877'),
  occupationStarting: object('8fd527'), weapons: object('b5a15d'),
};
const sheetDefs = [
  ['occupation-b', sheetObjects.occupationB, '3'],
  ['occupation-c', sheetObjects.occupationC, '4'],
  ['occupation-a', sheetObjects.occupationA, '5'],
  ['occupation-starting', sheetObjects.occupationStarting, '6'],
  ['weapons', sheetObjects.weapons, '2'],
];
const sheets = {};
for (const [id, deck, sheetId] of sheetDefs) {
  const data = deck.CustomDeck?.[sheetId];
  assert(data, `${id} missing CustomDeck ${sheetId}`);
  sheets[id] = {
    id, sheetId: Number(sheetId), cols: Number(data.NumWidth), rows: Number(data.NumHeight),
    uniqueBack: Boolean(data.UniqueBack), faceSourceUrl: data.FaceURL, backSourceUrl: data.BackURL,
    face: await stageImage({
      id: `card-sheet-${id}`, role: 'card-sheet', url: data.FaceURL,
      relative: `cards/${id}.webp`, guids: [deck.GUID], quality: 96,
    }),
    back: await stageImage({
      id: `card-back-${id}`, role: 'card-back', url: data.BackURL,
      relative: `cards/${id}-back.webp`, guids: [deck.GUID], quality: 95,
    }),
  };
  // `image` is a compatibility alias for renderers whose generic sprite-sheet
  // loader predates the explicit face/back naming.
  sheets[id].image = sheets[id].face;
}
assert(sheets['occupation-a'].cols === 10 && sheets['occupation-a'].rows === 7, 'occupation A sheet grid changed');
assert(sheets.weapons.cols === 10 && sheets.weapons.rows === 7, 'weapon sheet grid changed');

const occupationDecks = [
  { id: 'A-dark', guid: 'fa2877', deck: 'A', starting: false, expected: 57, sheet: 5, cells: [0, 56] },
  { id: 'B-dark', guid: '8d76cb', deck: 'B', starting: false, expected: 44, sheet: 3, cells: [0, 43] },
  { id: 'C-dark', guid: 'deaab0', deck: 'C', starting: false, expected: 44, sheet: 4, cells: [0, 43] },
  { id: 'a-starting', guid: '8fd527', deck: 'A', starting: true, expected: 15, sheet: 6, cells: [0, 14] },
  { id: 'b-starting', guid: '114b22', deck: 'B', starting: true, expected: 15, sheet: 6, cells: [15, 29] },
  { id: 'c-starting', guid: 'aa2575', deck: 'C', starting: true, expected: 15, sheet: 6, cells: [30, 44] },
].map((definition) => {
  const deck = object(definition.guid);
  const cards = (deck.ContainedObjects ?? []).map((card) => ({
    guid: card.GUID, cardId: Number(card.CardID), sheet: Math.floor(Number(card.CardID) / 100), cell: Number(card.CardID) % 100,
  })).sort((a, b) => a.cell - b.cell);
  assert(cards.length === definition.expected, `${definition.id}: expected ${definition.expected}, got ${cards.length}`);
  assert(cards.every((card) => card.sheet === definition.sheet), `${definition.id}: wrong sheet`);
  assert(cards[0].cell === definition.cells[0] && cards.at(-1).cell === definition.cells[1], `${definition.id}: wrong cells`);
  return { ...definition, cards };
});

const occupationOutput = path.join(GOLDEN, 'occupations.json');
const occupationHelper = path.join(import.meta.dirname, 'extract-feast-occupations.py');
assert(fs.existsSync(occupationHelper), `missing occupation helper ${occupationHelper}`);
const occupationRun = spawnSync('python', [occupationHelper, '--pdf', APPENDIX_SOURCE, '--output', occupationOutput], {
  cwd: ROOT, encoding: 'utf8', windowsHide: true,
});
if (occupationRun.status !== 0) fail(`occupation parser failed:\n${occupationRun.stdout}\n${occupationRun.stderr}`);
const occupations = JSON.parse(fs.readFileSync(occupationOutput, 'utf8'));
assert(occupations.length === 190, `expected 190 occupations, got ${occupations.length}`);
for (const occupation of occupations) {
  assert(occupation.tts.cardId === occupation.tts.sheet * 100 + occupation.tts.cell,
    `occupation ${occupation.number} has inconsistent TTS mapping`);
}

const weaponDeckSource = [
  ['bow', 'e37910', 0, 12], ['spear', 'b5a15d', 1, 12],
  ['long-sword', 'e65482', 2, 11], ['snare', '397e8e', 3, 12],
];
const weapons = weaponDeckSource.map(([id, guid, cell, expected]) => {
  const deck = object(guid);
  const cards = deck.ContainedObjects ?? [];
  assert(cards.length === expected, `${id}: expected ${expected} cards, got ${cards.length}`);
  assert(cards.every((card) => Number(card.CardID) === 200 + cell), `${id}: unexpected weapon cell`);
  return { id, guid, sheet: 2, cell, count: expected, guids: cards.map((card) => card.GUID) };
});
assert(weapons.reduce((sum, entry) => sum + entry.count, 0) === 47, 'expected 47 weapon cards in the four draw piles');

const decks = { sheets, occupationDecks, weapons };

// ---------------------------------------------------------------------------
// Exact logical board masks and art-grid calibration.
//
// Layout legend:
//   space = not part of the printed placement area
//   .     = valid open cell
//   N     = printed -1 cell
//   I     = income cell (value recorded in incomeTracks)
//   B     = printed bonus cell (reward recorded in bonuses)
//   X     = forbidden printed terrain/pillar
// ---------------------------------------------------------------------------

const GRID_LEGEND = {
  ' ': 'outside', '.': 'open', N: 'negative-1', I: 'income', B: 'bonus', X: 'forbidden',
};
const cell = (row, col) => ({ row, col });
const reward = (kind, id, amount = 1) => ({ kind, id, amount });
const income = (value, row, col) => ({ value, cell: row === null ? null : cell(row, col) });

function board(definition) {
  const { layout, expectedNegativeCount, expectedPoints, artGrid, imagePx } = definition;
  assert(layout.length === artGrid.rows, `${definition.id}: layout rows ${layout.length} != ${artGrid.rows}`);
  assert(layout.every((row) => row.length === artGrid.cols), `${definition.id}: inconsistent row width`);
  assert(layout.every((row) => [...row].every((character) => character in GRID_LEGEND)), `${definition.id}: unknown layout character`);
  const cells = [];
  for (const [row, line] of layout.entries()) for (const [col, character] of [...line].entries()) {
    if (character !== ' ') cells.push({ row, col, type: GRID_LEGEND[character] });
  }
  const negativeCells = cells.filter((entry) => entry.type === 'negative-1').map(({ row, col }) => cell(row, col));
  const forbiddenCells = cells.filter((entry) => entry.type === 'forbidden').map(({ row, col }) => cell(row, col));
  const bonusCells = cells.filter((entry) => entry.type === 'bonus').map(({ row, col }) => `${row},${col}`);
  const incomeCells = cells.filter((entry) => entry.type === 'income').map(({ row, col }) => `${row},${col}`);
  assert(negativeCells.length === expectedNegativeCount,
    `${definition.id}: expected ${expectedNegativeCount} negatives, got ${negativeCells.length}`);
  assert(definition.bonuses.length === bonusCells.length, `${definition.id}: bonus count differs from art`);
  assert(definition.bonuses.every((bonus) => bonusCells.includes(`${bonus.cell.row},${bonus.cell.col}`)),
    `${definition.id}: bonus metadata references a non-bonus cell`);
  const metadataIncomeCells = definition.incomeTracks.flatMap((track) => track.entries)
    .filter((entry) => entry.cell).map((entry) => `${entry.cell.row},${entry.cell.col}`);
  assert(new Set(metadataIncomeCells).size === incomeCells.length && incomeCells.every((entry) => metadataIncomeCells.includes(entry)),
    `${definition.id}: income metadata differs from printed income cells`);
  const uniform = artGrid.uniform !== false;
  const normalizedOrigin = uniform
    ? [artGrid.originPx[0] / imagePx[0], artGrid.originPx[1] / imagePx[1]].map((v) => round(v))
    : null;
  const normalizedCell = uniform
    ? [artGrid.cellPx[0] / imagePx[0], artGrid.cellPx[1] / imagePx[1]].map((v) => round(v))
    : null;
  const cellCentersPx = artGrid.cellCentersPx ?? null;
  if (!uniform) {
    assert(cellCentersPx?.length === artGrid.rows * artGrid.cols,
      `${definition.id}: non-uniform grid needs one explicit center per logical cell`);
  }
  const normalizedCellCenters = cellCentersPx?.map(([x, y]) => [round(x / imagePx[0]), round(y / imagePx[1])]) ?? null;
  const resourceNegativeCount = (definition.designatedResources ?? [])
    .reduce((total, entry) => total + (entry.negativeValue ? entry.count ?? 1 : 0), 0);
  const printedNegativeCount = definition.totalNegativeCountIncludingResources ?? expectedNegativeCount;
  assert(expectedNegativeCount + resourceNegativeCount === printedNegativeCount,
    `${definition.id}: grid/resource negatives do not add up to printed total ${printedNegativeCount}`);
  return {
    ...definition, points: expectedPoints, negativeCount: expectedNegativeCount,
    gridNegativeCount: expectedNegativeCount, printedNegativeCount,
    grid: { rows: artGrid.rows, cols: artGrid.cols, layout, legend: GRID_LEGEND, cells, negativeCells, forbiddenCells },
    artGrid: {
      ...artGrid, uniform, normalizedOrigin, normalizedCell, normalizedCellCenters,
      logicalBounds: { rowMin: 0, rowMax: artGrid.rows - 1, colMin: 0, colMax: artGrid.cols - 1 },
    },
  };
}

const homeLayout = [
  'NNNNNNNNNNNI.',
  'NNNNNNNNNNIN.',
  'NNNNNNNNNINN.',
  'NNNNNNNNINNN ',
  'NNNNNNNINNNN ',
  'B.....INNNNN ',
  '.....I.NNNNN ',
  '..B.I.BNNNNN ',
  '...I...NNNNN ',
  '.BI....NNNNN ',
  '.I...B.NNNNN ',
  'I......N     ',
];
const homeIncome = [{ id: 'home-income', entries: [
  income(0, 11, 0), income(1, 10, 1), income(2, 9, 2), income(2, 8, 3),
  income(3, 7, 4), income(4, 6, 5), income(5, 5, 6), income(6, 4, 7),
  income(7, 3, 8), income(9, 2, 9), income(12, 1, 10), income(15, 0, 11), income(18, null, null),
] }];
const homeBonuses = [
  { cell: cell(5, 0), rewards: [reward('resource', 'ore')] },
  { cell: cell(7, 2), rewards: [reward('resource', 'wood')] },
  { cell: cell(7, 6), rewards: [reward('good', 'rune-stone')] },
  { cell: cell(9, 1), rewards: [reward('good', 'mead')] },
  { cell: cell(10, 5), rewards: [reward('resource', 'stone')] },
];

const boardDefinitions = [
  board({
    id: 'home-short', name: 'Home Board - Short Game', kind: 'home', faceCode: 'short', image: homeShortImage,
    imagePx: [2354, 1500], artGrid: { originPx: [26, 106], cellPx: [87.08, 87.08], rows: 12, cols: 13 },
    layout: homeLayout, expectedNegativeCount: 86, expectedPoints: 0,
    incomeTracks: homeIncome, bonuses: homeBonuses, sourceGuid: HOME_GUIDS[0], sourceSide: 'primary',
  }),
  board({
    id: 'home-long', name: 'Home Board - Long Game', kind: 'home', faceCode: 'long', image: homeLongImage,
    imagePx: [2354, 1500], artGrid: { originPx: [26, 106], cellPx: [87.08, 87.08], rows: 12, cols: 13 },
    layout: homeLayout, expectedNegativeCount: 86, expectedPoints: 0,
    incomeTracks: homeIncome, bonuses: homeBonuses, sourceGuid: HOME_GUIDS[0], sourceSide: 'secondary',
  }),
  board({
    id: 'shetland', name: 'Shetland', kind: 'exploration', faceCode: 'A', image: explorationScene.shetland.image,
    imagePx: [1000, 1000], artGrid: { originPx: [109, 136], cellPx: [85, 85], rows: 9, cols: 9 },
    layout: ['    ...  ', 'NNNN.B.  ', 'NBNN..NN.', 'NNNN...B.', '    NN...', '..I NN.B.', '.I. .NN..', 'I.B   NNN', ' ..   NN.'],
    expectedNegativeCount: 24, expectedPoints: 6,
    incomeTracks: [{ id: 'income', entries: [income(0, 7, 0), income(1, 6, 1), income(2, 5, 2), income(3, null, null)] }],
    bonuses: [
      { cell: cell(1, 5), rewards: [reward('good', 'silverware')] },
      { cell: cell(2, 1), rewards: [reward('good', 'game-meat')] },
      { cell: cell(3, 7), rewards: [reward('good', 'oil')] },
      { cell: cell(5, 7), rewards: [reward('good', 'cabbage')] },
      { cell: cell(7, 2), rewards: [reward('good', 'beans')] },
    ], sourceGuid: explorationScene.shetland.guid, sourceSide: 'primary',
  }),
  board({
    id: 'bear-island', name: 'Bear Island', kind: 'exploration', faceCode: 'A-reverse', image: explorationScene['bear-island'].image,
    imagePx: [1003, 1000], artGrid: { originPx: [203, 139], cellPx: [85.7, 85.7], rows: 9, cols: 8 },
    layout: ['   NNNN ', ' NNNINNN', 'NNNI.N.N', '..I.B.N.', ' IX..N.B', ' .....NN', ' .....B ', '   .N.. ', '    NN  '],
    expectedNegativeCount: 22, expectedPoints: 12,
    incomeTracks: [{ id: 'income', entries: [income(1, 4, 1), income(3, 3, 2), income(4, 2, 3), income(5, 1, 4)] }],
    bonuses: [
      { cell: cell(3, 4), rewards: [reward('good', 'game-meat')] },
      { cell: cell(4, 7), rewards: [reward('good', 'stockfish')] },
      { cell: cell(6, 6), rewards: [reward('good', 'rune-stone'), reward('resource', 'ore')] },
    ], sourceGuid: explorationScene['bear-island'].guid, sourceSide: 'secondary',
  }),
  board({
    id: 'faroe-islands', name: 'Faroe Islands', kind: 'exploration', faceCode: 'B', image: explorationScene['faroe-islands'].image,
    imagePx: [1000, 1000], artGrid: { originPx: [96, 154], cellPx: [85, 85], rows: 9, cols: 9 },
    layout: ['     NBIN', '  NN  I.N', ' NB..IX.B', ' ...INNNN', '   I..NX.', '..IX BNN ', 'BI.. ..N ', 'I... .BN ', '     ..N '],
    expectedNegativeCount: 16, expectedPoints: 4,
    incomeTracks: [{ id: 'income', entries: [
      income(0, 7, 0), income(1, 6, 1), income(1, 5, 2), income(1, 4, 3),
      income(2, 3, 4), income(2, 2, 5), income(2, 1, 6), income(3, 0, 7), income(4, null, null),
    ] }],
    bonuses: [
      { cell: cell(0, 6), rewards: [reward('good', 'sheep')] },
      { cell: cell(2, 2), rewards: [reward('good', 'oil')] },
      { cell: cell(2, 8), rewards: [reward('good', 'milk')] },
      { cell: cell(5, 5), rewards: [reward('good', 'flax')] },
      { cell: cell(6, 0), rewards: [reward('good', 'peas')] },
      { cell: cell(7, 6), rewards: [reward('good', 'hide')] },
    ], sourceGuid: explorationScene['faroe-islands'].guid, sourceSide: 'primary',
  }),
  board({
    id: 'baffin-island', name: 'Baffin Island', kind: 'exploration', faceCode: 'B-reverse', image: explorationScene['baffin-island'].image,
    imagePx: [1000, 1000], artGrid: { originPx: [117, 137], cellPx: [85.3, 85.3], rows: 9, cols: 9 },
    layout: ['N.NNB    ', 'NN.NNN...', ' .N.NN.B.', ' NXN.I  .', ' ...INN  ', '...INNNBN', ' .I.NN   ', '.I..N..  ', 'I.. N.B.N'],
    expectedNegativeCount: 24, expectedPoints: 12,
    incomeTracks: [{ id: 'income', entries: [income(0, 8, 0), income(1, 7, 1), income(2, 6, 2), income(2, 5, 3), income(4, 4, 4), income(6, 3, 5)] }],
    bonuses: [
      { cell: cell(0, 4), rewards: [reward('resource', 'ore')] },
      { cell: cell(2, 7), rewards: [reward('good', 'whale-meat')] },
      { cell: cell(5, 7), rewards: [reward('good', 'oil')] },
      { cell: cell(8, 6), rewards: [reward('good', 'skin-and-bones')] },
    ], sourceGuid: explorationScene['baffin-island'].guid, sourceSide: 'secondary',
  }),
  board({
    id: 'iceland', name: 'Iceland', kind: 'exploration', faceCode: 'C', image: explorationScene.iceland.image,
    imagePx: [1000, 1000], artGrid: { originPx: [190, 227], cellPx: [85.6, 85.6], rows: 8, cols: 8 },
    layout: ['.N N NNI', 'N. .NNIN', ' .B.NINN', '....INNN', 'B..INNNN', '..IN...N', '.INN.B. ', '  NN.   '],
    expectedNegativeCount: 24, expectedPoints: 16,
    incomeTracks: [{ id: 'income', entries: [
      income(1, 6, 1), income(2, 5, 2), income(3, 4, 3), income(4, 3, 4),
      income(5, 2, 5), income(6, 1, 6), income(7, 0, 7), income(8, null, null),
    ] }],
    bonuses: [
      { cell: cell(2, 2), rewards: [reward('good', 'stockfish')] },
      { cell: cell(4, 0), rewards: [reward('good', 'oil')] },
      { cell: cell(6, 5), rewards: [reward('resource', 'ore'), reward('resource', 'stone')] },
    ], sourceGuid: explorationScene.iceland.guid, sourceSide: 'primary',
  }),
  board({
    id: 'labrador', name: 'Labrador', kind: 'exploration', faceCode: 'C-reverse', image: explorationScene.labrador.image,
    imagePx: [1000, 1000], artGrid: { originPx: [114, 140], cellPx: [85.5, 85.5], rows: 9, cols: 9 },
    layout: ['   NN    ', '   NNN   ', '   N.N   ', '   BNN.N ', '  NNNNNNN', 'NNN.NNNNN', '.N.NBNXN ', 'NBN.N.NNN', ' N N.NBNN'],
    expectedNegativeCount: 40, expectedPoints: 36, incomeTracks: [],
    bonuses: [
      { cell: cell(3, 3), rewards: [reward('good', 'game-meat')] },
      { cell: cell(6, 4), rewards: [reward('good', 'chest')] },
      { cell: cell(7, 1), rewards: [reward('good', 'linen')] },
      { cell: cell(8, 6), rewards: [reward('good', 'stockfish')] },
    ], sourceGuid: explorationScene.labrador.guid, sourceSide: 'secondary',
  }),
  board({
    id: 'greenland', name: 'Greenland', kind: 'exploration', faceCode: 'D', image: explorationScene.greenland.image,
    imagePx: [1000, 1000], artGrid: { originPx: [110, 211], cellPx: [86, 86], rows: 8, cols: 8 },
    layout: ['NNN..INN', '...XINNN', ' B.INNNI', ' ..NNNI ', '.N.NNI..', ' NNNIX.B', '  .I... ', '    ... '],
    expectedNegativeCount: 20, expectedPoints: 12,
    incomeTracks: [
      { id: 'upper-income', entries: [income(0, 2, 3), income(1, 1, 4), income(2, 0, 5), income(3, null, null)] },
      { id: 'lower-income', entries: [income(0, 6, 3), income(1, 5, 4), income(2, 4, 5), income(3, 3, 6), income(4, 2, 7), income(5, null, null)] },
    ],
    bonuses: [
      { cell: cell(2, 1), rewards: [reward('good', 'whale-meat')] },
      { cell: cell(5, 7), rewards: [reward('good', 'stockfish')] },
    ], sourceGuid: explorationScene.greenland.guid, sourceSide: 'primary',
  }),
  board({
    id: 'newfoundland', name: 'Newfoundland', kind: 'exploration', faceCode: 'D-reverse', image: explorationScene.newfoundland.image,
    imagePx: [1000, 1000], artGrid: { originPx: [114, 138], cellPx: [85.5, 85.5], rows: 9, cols: 9 },
    layout: ['  NNN    ', '  NN     ', ' NBN NN  ', ' .N.NNN  ', '.N.N.NNN ', 'NBN.N.NNN', '.N.NNNBN ', 'NNN.NNNNN', '     N NN'],
    expectedNegativeCount: 40, expectedPoints: 38, incomeTracks: [],
    bonuses: [
      { cell: cell(2, 2), rewards: [reward('good', 'skin-and-bones')] },
      { cell: cell(5, 1), rewards: [reward('special', 'cloakpin')], finite: true },
      { cell: cell(6, 6), rewards: [reward('building', 'stone-house')], finite: true },
    ], sourceGuid: explorationScene.newfoundland.guid, sourceSide: 'secondary',
  }),
  board({
    id: 'shed', name: 'Shed', kind: 'building', faceCode: null, image: buildings.shed.front,
    imagePx: [1531, 600], artGrid: {
      rows: 2, cols: 3, uniform: false, calibrationKind: 'six-explicit-resource-centers',
      cellCentersPx: [[208, 315], [360, 315], [513, 315], [1004, 315], [1175, 315], [1342, 315]],
    },
    layout: ['NNN', 'NNN'], expectedNegativeCount: 6, expectedPoints: 8, incomeTracks: [], bonuses: [],
    designatedResources: [
      { cell: cell(0, 0), allowed: ['wood'] }, { cell: cell(0, 1), allowed: ['wood'] }, { cell: cell(0, 2), allowed: ['wood'] },
      { cell: cell(1, 0), allowed: ['stone'] }, { cell: cell(1, 1), allowed: ['stone'] }, { cell: cell(1, 2), allowed: ['stone'] },
    ], sourceGuid: buildings.shed.guid, sourceSide: 'primary',
  }),
  board({
    id: 'stone-house', name: 'Stone House', kind: 'building', faceCode: null, image: buildings['stone-house'].front,
    imagePx: [1531, 600], artGrid: { originPx: [895, 89], cellPx: [121.3, 122.2], rows: 4, cols: 5 },
    layout: [' N.  ', 'N.BN ', ' N..N', '  N.N'], expectedNegativeCount: 7, expectedPoints: 10, incomeTracks: [],
    bonuses: [{ cell: cell(1, 2), rewards: [reward('good', 'hide')] }],
    designatedResources: [
      { area: 'resource-pasture', allowed: ['wood'], negativeValue: -1, count: 1, artCenterPx: [270, 305] },
      { area: 'resource-pasture', allowed: ['stone'], negativeValue: -1, count: 1, artCenterPx: [455, 305] },
    ], totalNegativeCountIncludingResources: 9, sourceGuid: buildings['stone-house'].guid, sourceSide: 'primary',
  }),
  board({
    id: 'long-house', name: 'Long House', kind: 'building', faceCode: null, image: buildings['long-house'].front,
    imagePx: [1920, 750], artGrid: { originPx: [108, 263], cellPx: [151.6, 151.5], rows: 3, cols: 11 },
    layout: ['.N.N.N.N.NB', 'NBNXN.NXN.N', '.N.N.B.N.N.'], expectedNegativeCount: 15, expectedPoints: 17, incomeTracks: [],
    bonuses: [
      { cell: cell(0, 10), rewards: [reward('good', 'peas')] },
      { cell: cell(1, 1), rewards: [reward('good', 'oil')] },
      { cell: cell(2, 5), rewards: [reward('good', 'beans')] },
    ], sourceGuid: buildings['long-house'].guid, sourceSide: 'primary',
  }),
];

assert(boardDefinitions.length === 13, `expected 13 board definitions, got ${boardDefinitions.length}`);
assert(boardDefinitions.filter((entry) => entry.kind === 'exploration').length === 8, 'expected eight exploration definitions');
assert(boardDefinitions.filter((entry) => entry.kind === 'home').length === 2, 'expected two home faces');
const boardById = Object.fromEntries(boardDefinitions.map((entry) => [entry.id, entry]));

// Art-bound golden keyed to the engine's stable 61 action ids. The values are
// independently normalized against the 2500x5000 authentic action-board sheet.
const sharedDataFile = path.join(ROOT, 'shared/src/feast/data.ts');
assert(fs.existsSync(sharedDataFile), `missing shared action definition source ${sharedDataFile}`);
const sharedDataText = fs.readFileSync(sharedDataFile, 'utf8');
const actionPattern = /action\('([^']+)', '([^']+)', '([^']+)', ([1-4]), (\d+), (\d+),/g;
const columnBounds = { 1: [335, 835], 2: [860, 1370], 3: [1390, 1900], 4: [1915, 2480] };
const actionSpaces = [...sharedDataText.matchAll(actionPattern)].map((match, index) => {
  const [, id, name, group, columnText, yText, heightText] = match;
  const column = Number(columnText);
  const y = Number(yText);
  const height = Number(heightText);
  const [x0, x1] = columnBounds[column];
  return {
    id, order: index + 1, name, group, column, workers: column,
    artBoundsPx: { x: x0, y, width: x1 - x0, height },
    artBounds: { x: x0 / 2500, y: y / 5000, width: (x1 - x0) / 2500, height: height / 5000 },
  };
});
assert(actionSpaces.length === 61, `expected 61 action spaces, got ${actionSpaces.length}`);
assert(new Set(actionSpaces.map((entry) => entry.id)).size === 61, 'duplicate action-space id');

// ---------------------------------------------------------------------------
// Authentic models and official PDFs
// ---------------------------------------------------------------------------

const vikingSource = object('a7334e');
const vikingModel = stageModel({
  id: 'model-viking', role: 'viking-worker', url: vikingSource.CustomMesh.MeshURL,
  relative: 'models/viking.obj', guids: recursiveObjects.filter(({ object: candidate }) => candidate.CustomMesh?.MeshURL === vikingSource.CustomMesh.MeshURL).map(({ object: candidate }) => candidate.GUID),
});
const oreModel = stageModel({
  id: 'model-ore', role: 'ore', url: oreSource.CustomMesh.MeshURL,
  relative: 'models/ore.obj', guids: ['feb814', ...orePieces.map((piece) => piece.GUID)],
});
const firstPlayerSource = object('20778c');
const firstPlayerModel = stageModel({
  id: 'model-first-player-moose', role: 'first-player-token', url: firstPlayerSource.CustomMesh.MeshURL,
  relative: 'models/first-player-moose.obj', guids: ['20778c'],
});
const modelScene = {
  viking: {
    model: vikingModel, sourceUrl: vikingSource.CustomMesh.MeshURL, material: 'tts-tinted',
    tints: {
      purple: [0.627, 0.124998, 0.941], green: [0.191998, 0.701, 0.167998],
      red: [0.856, 0.099998, 0.093998], blue: [0, 0.38967, 0.837071], solo: [0.249998, 0.249998, 0.249998],
    },
  },
  ore: { model: oreModel, texture: resources.ore.image, sourceUrl: oreSource.CustomMesh.MeshURL },
  firstPlayer: { model: firstPlayerModel, sourceUrl: firstPlayerSource.CustomMesh.MeshURL },
};

const RULEBOOK_URL = 'https://www.feuerland-spiele.de/fileadmin/game/Ein_Fest_fuer_Odin/ODIN_EN_rules_2nd_Web.pdf';
const APPENDIX_URL = 'https://www.feuerland-spiele.de/fileadmin/game/Ein_Fest_fuer_Odin/ODIN_EN_Appendix_Web.pdf';
const rulebook = stageFile({ id: 'rulebook', role: 'official-rules', sourceFile: RULEBOOK_SOURCE, relative: 'rulebook.pdf', sourceUrl: RULEBOOK_URL });
const appendix = stageFile({ id: 'appendix', role: 'official-appendix', sourceFile: APPENDIX_SOURCE, relative: 'appendix.pdf', sourceUrl: APPENDIX_URL });

// ---------------------------------------------------------------------------
// Golden, exhaustive provenance manifest, and render-facing scene
// ---------------------------------------------------------------------------

const components = {
  edition: 'classic-base-2016',
  actionBoard: { guid: ACTION_GUID, image: actionBoardImage, sourceUrl: imageSide(actionObject), tts: transform(actionObject), imagePx: [2500, 5000] },
  homeBoards: {
    short: { guids: HOME_GUIDS, image: homeShortImage, sourceUrl: imageSide(homeObject), side: 'primary', boardId: 'home-short' },
    long: { guids: HOME_GUIDS, image: homeLongImage, sourceUrl: imageSide(homeObject, 'secondary'), side: 'secondary', boardId: 'home-long' },
  },
  banquetTables,
  extensions, exploration: explorationScene, buildings, ships, goods, resources, silver,
  penalty: { count: 8, bagGuid: '073e86', guids: ['a840dc', ...penaltyPieces.map((piece) => piece.GUID)], image: penaltyImage },
  specials, mountains,
  roundOverview: { guid: ROUND_OVERVIEW_GUID, image: roundOverviewImage, back: roundOverviewBack, sourceUrl: imageSide(roundObject) },
  supplyBoards: {
    specials: { guid: SPECIAL_DISPLAY_GUID, front: specialDisplayFront, back: specialDisplayBack },
    ships: { guid: SHIP_DISPLAY_GUID, front: shipDisplayFront, back: shipDisplayBack },
  },
  box: { guid: BOX_GUID, image: boxImage, sourceUrl: imageSide(boxObject) }, logo: logoImage,
  models: modelScene,
};

const sourceObjectInventory = recursiveObjects.map(({ object: candidate, parentGuid, objectPath }) => {
  const urls = {};
  for (const [key, value] of Object.entries(candidate.CustomImage ?? {})) if (typeof value === 'string' && /^https?:/.test(value)) urls[key] = value;
  for (const [key, value] of Object.entries(candidate.CustomToken ?? {})) if (typeof value === 'string' && /^https?:/.test(value)) urls[key] = value;
  for (const [key, value] of Object.entries(candidate.CustomMesh ?? {})) if (typeof value === 'string' && /^https?:/.test(value)) urls[key] = value;
  for (const [sheet, value] of Object.entries(candidate.CustomDeck ?? {})) {
    urls[`deck-${sheet}-face`] = value.FaceURL;
    urls[`deck-${sheet}-back`] = value.BackURL;
  }
  return {
    path: objectPath, parentGuid, guid: candidate.GUID, type: candidate.Name,
    name: candidate.Nickname || '', description: candidate.Description || '',
    containedCount: candidate.ContainedObjects?.length ?? 0,
    cardId: Number.isFinite(Number(candidate.CardID)) ? Number(candidate.CardID) : null,
    color: candidate.ColorDiffuse ?? null, transform: candidate.Transform ? transform(candidate) : null,
    urls,
  };
});

const counts = {
  topLevelObjects: save.ObjectStates.length, recursiveObjects: recursiveObjects.length,
  actionSpaces: actionSpaces.length, occupations: occupations.length, specials: specials.length,
  explorationFaces: Object.keys(explorationScene).length, homeFaces: 2, extensionFaces: 4,
  mountainStrips: mountains.length, buildingTypes: Object.keys(buildings).length,
  shipTypes: Object.keys(ships).length, goodFaces: Object.keys(goods).length,
  weaponCards: weapons.reduce((sum, entry) => sum + entry.count, 0),
};
const expectedCounts = {
  topLevelObjects: 208, recursiveObjects: 1061, actionSpaces: 61, occupations: 190, specials: 15,
  explorationFaces: 8, homeFaces: 2, extensionFaces: 4, mountainStrips: 8,
  buildingTypes: 3, shipTypes: 3, goodFaces: 32, weaponCards: 47,
};
assert(JSON.stringify(counts) === JSON.stringify(expectedCounts), `component counts differ:\n${json(counts)}`);

const manifest = {
  formatVersion: 1,
  game: 'feast', edition: 'classic-base-2016', workshopId: '790490875',
  source: {
    saveName: save.SaveName, gameMode: save.GameMode, saveDate: save.Date,
    saveFile: SAVE_FILE.replaceAll('\\', '/'), saveSha256: sha256(SAVE_FILE), saveBytes: fs.statSync(SAVE_FILE).size,
    officialRulebook: { url: RULEBOOK_URL, sha256: sha256(RULEBOOK_SOURCE), bytes: fs.statSync(RULEBOOK_SOURCE).size },
    officialAppendix: { url: APPENDIX_URL, sha256: sha256(APPENDIX_SOURCE), bytes: fs.statSync(APPENDIX_SOURCE).size },
  },
  counts, expectedCounts,
  assets: assetRecords.sort((a, b) => a.publicPath.localeCompare(b.publicPath)),
  sourceGuids: {
    actionBoard: ACTION_GUID, homeBoards: HOME_GUIDS, extensions: ['ea6dee', '2dd414'],
    exploration: Object.fromEntries(explorationPairs.map((pair) => [pair.pairId, pair.guid])),
    buildings: Object.fromEntries(Object.entries(buildings).map(([id, value]) => [id, value.guids])),
    ships: Object.fromEntries(Object.entries(ships).map(([id, value]) => [id, value.guids])),
    goods: Object.fromEntries(goodsSource.map(([frontId, backId, bagGuid]) => [`${frontId}/${backId}`, { bagGuid, guids: goods[frontId].guids }])),
    specials: Object.fromEntries(specials.map((tile) => [tile.id, tile.guid])),
    mountains: mountains.map((strip) => strip.guid), occupationDecks: occupationDecks.map((deck) => deck.guid),
    weaponDecks: weapons.map((deck) => deck.guid), roundOverview: ROUND_OVERVIEW_GUID, box: BOX_GUID,
  },
};

const scene = {
  source: {
    workshopId: '790490875', saveSha256: manifest.source.saveSha256,
    edition: 'CLASSIC BASE · 2016', manifest: '/feast/manifest.json',
  },
  actionBoard: components.actionBoard,
  homeBoards: {
    short: { ...components.homeBoards.short, imagePx: boardById['home-short'].imagePx, grid: boardById['home-short'].artGrid, layout: boardById['home-short'].grid.layout },
    long: { ...components.homeBoards.long, imagePx: boardById['home-long'].imagePx, grid: boardById['home-long'].artGrid, layout: boardById['home-long'].grid.layout },
  },
  banquetTables,
  extensions, exploration: Object.fromEntries(Object.entries(explorationScene).map(([id, value]) => [id, {
    ...value, imagePx: boardById[id].imagePx, grid: boardById[id].artGrid, layout: boardById[id].grid.layout,
  }])),
  buildings: Object.fromEntries(Object.entries(buildings).map(([id, value]) => [id, {
    ...value, imagePx: boardById[id].imagePx, grid: boardById[id].artGrid, layout: boardById[id].grid.layout,
  }])),
  ships, goods, resources, silver, specials, mountains, decks,
  roundOverview: components.roundOverview, supplyBoards: components.supplyBoards,
  box: components.box, logo: logoImage, models: modelScene,
  actionSpaces,
  rules: { rulebook, appendix },
};

writeJson(path.join(GOLDEN, 'manifest.json'), manifest);
writeJson(path.join(GOLDEN, 'components.json'), components);
writeJson(path.join(GOLDEN, 'boards.json'), { formatVersion: 1, legend: GRID_LEGEND, boards: boardDefinitions });
writeJson(path.join(GOLDEN, 'special-tiles.json'), specials);
writeJson(path.join(GOLDEN, 'mountains.json'), mountains);
writeJson(path.join(GOLDEN, 'decks.json'), decks);
writeJson(path.join(GOLDEN, 'action-spaces.json'), actionSpaces);
writeJson(path.join(GOLDEN, 'source-objects.json'), sourceObjectInventory);
writeJson(path.join(OUT, 'scene.json'), scene);
writeJson(path.join(OUT, 'manifest.json'), manifest);

console.log('A Feast for Odin classic-base extraction complete');
console.log(`  save SHA-256: ${manifest.source.saveSha256}`);
console.log(`  ${counts.recursiveObjects} objects; ${counts.actionSpaces} actions; ${counts.occupations} occupations`);
console.log(`  ${counts.specials} alpha-derived specials; ${counts.mountainStrips} ordered mountains; ${counts.explorationFaces} exploration faces`);
console.log(`  ${assetRecords.length} staged authentic assets -> ${OUT}`);
console.log(`  goldens -> ${GOLDEN}`);
