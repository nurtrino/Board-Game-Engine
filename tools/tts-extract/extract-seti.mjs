// SETI: Search for Extraterrestrial Intelligence (English base game) --
// authentic Tabletop Simulator asset and identity extractor.
//
// Authority:
//   * Workshop 3415673254 for object identity, transforms, snaps, CardID cells,
//     component art, and setup geometry.
//   * The three English PDFs embedded in that save for the staged rules files.
//
// Run from anywhere:
//   node tools/tts-extract/extract-seti.mjs
//
// Outputs are deterministic/idempotent and intentionally confined to:
//   games/seti/golden/{seti-data,cards,solo}.json
//   client/public/seti/**

// OCR from tmp/seti/cards-ocr.json is accepted only as a non-authoritative
// transcription aid. TTS CardID + deck definition remains the card identity.

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const WORKSHOP_ID = '3415673254';
const SAVE_FILE = path.join(MODS, 'Workshop', `${WORKSHOP_ID}.json`);
const OUT = path.join(ROOT, 'client/public/seti');
const GOLDEN = path.join(ROOT, 'games/seti/golden');
const OCR_FILE = path.join(ROOT, 'tmp/seti/cards-ocr.json');
const OFFICIAL_FAQ_URL = 'https://filemanager.czechgames.com/storage/files/seti-search-for-extraterrestrial-intelligence/other-downloads/additional-content/seti-faq.pdf';

for (const directory of [
  OUT,
  GOLDEN,
  path.join(OUT, 'aliens'),
  path.join(OUT, 'board'),
  path.join(OUT, 'cards'),
  path.join(OUT, 'models'),
  path.join(OUT, 'player'),
  path.join(OUT, 'sectors'),
  path.join(OUT, 'solar'),
  path.join(OUT, 'solo'),
  path.join(OUT, 'tokens'),
]) fs.mkdirSync(directory, { recursive: true });

const fail = (message) => { throw new Error(`SETI extractor: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const round = (value, places = 6) => typeof value === 'number'
  ? Number(value.toFixed(places))
  : value;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = (file, value) => fs.writeFileSync(file, json(value), 'utf8');
const sha256Buffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const sha256File = (file) => sha256Buffer(fs.readFileSync(file));
const sha256Json = (value) => sha256Buffer(Buffer.from(JSON.stringify(value)));
const munge = (url) => url.replace(/[^A-Za-z0-9]/g, '');
const normalizeHost = (url) => url.replace(
  /^https?:\/\/cloud-3\.steamusercontent\.com/i,
  'https://steamusercontent-a.akamaihd.net',
);
const publicPath = (relative) => `/seti/${relative.replaceAll('\\', '/')}`;
const slug = (value) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

assert(fs.existsSync(SAVE_FILE), `missing Workshop save ${SAVE_FILE}`);
const saveBytes = fs.readFileSync(SAVE_FILE);
const save = JSON.parse(saveBytes.toString('utf8'));
assert(save.SaveName === 'SETI: Search for Extraterrestrial Intelligence', `unexpected save ${save.SaveName}`);
assert(save.ObjectStates?.length === 259, `expected 259 top-level objects, got ${save.ObjectStates?.length}`);

// ---------------------------------------------------------------------------
// Complete object walk. Paths, rather than GUIDs, are the primary identity here:
// the mod intentionally duplicates templates (including duplicate GUIDs) in its
// solo backup bag. No recursive record is discarded.
// ---------------------------------------------------------------------------

const records = [];
const firstByGuid = new Map();
let containedEdges = 0;
let stateEdges = 0;

function walk(object, objectPath, parentPath = null, relation = 'top') {
  assert(object && typeof object === 'object', `invalid object at ${objectPath}`);
  assert(object.GUID, `object at ${objectPath} has no GUID`);
  const record = { object, objectPath, parentPath, relation };
  records.push(record);
  if (!firstByGuid.has(object.GUID)) firstByGuid.set(object.GUID, object);
  for (const [index, child] of (object.ContainedObjects ?? []).entries()) {
    containedEdges++;
    walk(child, `${objectPath}/contained/${index}`, objectPath, 'contained');
  }
  for (const [state, child] of Object.entries(object.States ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    stateEdges++;
    walk(child, `${objectPath}/state/${state}`, objectPath, `state:${state}`);
  }
  return record;
}

for (const [index, object] of save.ObjectStates.entries()) walk(object, `top/${index}`);
assert(records.length === 862, `expected 862 recursive records, got ${records.length}`);
assert(containedEdges === 591, `expected 591 contained records, got ${containedEdges}`);
assert(stateEdges === 12, `expected 12 state records, got ${stateEdges}`);

const object = (guid) => firstByGuid.get(guid) ?? fail(`missing object GUID ${guid}`);
const topObject = (guid) => save.ObjectStates.find((candidate) => candidate.GUID === guid)
  ?? fail(`missing top-level object GUID ${guid}`);

const vec3 = (value) => value
  ? [round(value.x), round(value.y), round(value.z)]
  : null;
const transform = (ttsObject) => {
  const t = ttsObject.Transform;
  assert(t, `${ttsObject.GUID} has no Transform`);
  return {
    pos: [t.posX, t.posY, t.posZ].map((value) => round(value)),
    rot: [t.rotX, t.rotY, t.rotZ].map((value) => round(value)),
    scale: [t.scaleX, t.scaleY, t.scaleZ].map((value) => round(value)),
  };
};
const color = (value) => value
  ? [value.r, value.g, value.b, value.a].filter((channel) => channel !== undefined).map((channel) => round(channel))
  : null;
const snapPoint = (snap, index, coordinateSpace = 'local') => ({
  index,
  coordinateSpace,
  position: vec3(snap.Position),
  ...(snap.Rotation ? { rotation: vec3(snap.Rotation) } : {}),
  ...(snap.RotationSnap !== undefined ? { rotationSnap: snap.RotationSnap } : {}),
  ...(snap.Tags?.length ? { tags: [...snap.Tags] } : {}),
});

// ---------------------------------------------------------------------------
// Source asset inventory. This deliberately scans the fields omitted by the
// generic old downloader: alternate States, AttachedDecals, the decal palette,
// and URLs embedded in Global/object Lua.
// ---------------------------------------------------------------------------

const assetOccurrences = new Map();
const objectAssetUrls = new Map();

function addAsset(url, kind, location, record = null) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
  const cleaned = url.trim().replace(/[),;]+$/, '');
  const canonicalUrl = normalizeHost(cleaned);
  const key = `${kind}\u0000${canonicalUrl}`;
  if (!assetOccurrences.has(key)) assetOccurrences.set(key, { kind, url: canonicalUrl, occurrences: [] });
  assetOccurrences.get(key).occurrences.push(location);
  if (record) {
    if (!objectAssetUrls.has(record.objectPath)) objectAssetUrls.set(record.objectPath, new Set());
    objectAssetUrls.get(record.objectPath).add(canonicalUrl);
  }
}

const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
function addLuaUrls(text, location, record = null) {
  for (const match of (text ?? '').matchAll(URL_RE)) addAsset(match[0], 'image', `${location}:lua`, record);
}

function scanObjectAssets(record) {
  const o = record.object;
  const base = record.objectPath;
  const image = o.CustomImage ?? o.CustomToken;
  addAsset(image?.ImageURL, 'image', `${base}.CustomImage.ImageURL`, record);
  addAsset(image?.ImageSecondaryURL, 'image', `${base}.CustomImage.ImageSecondaryURL`, record);

  for (const [field, kind] of [
    ['MeshURL', 'model'], ['ColliderURL', 'model'],
    ['DiffuseURL', 'image'], ['NormalURL', 'image'],
  ]) addAsset(o.CustomMesh?.[field], kind, `${base}.CustomMesh.${field}`, record);

  for (const [deckId, deck] of Object.entries(o.CustomDeck ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    addAsset(deck.FaceURL, 'image', `${base}.CustomDeck.${deckId}.FaceURL`, record);
    addAsset(deck.BackURL, 'image', `${base}.CustomDeck.${deckId}.BackURL`, record);
  }
  addAsset(o.CustomPDF?.PDFUrl, 'pdf', `${base}.CustomPDF.PDFUrl`, record);
  addAsset(o.CustomAssetbundle?.AssetbundleURL, 'bundle', `${base}.CustomAssetbundle.AssetbundleURL`, record);
  addAsset(o.CustomAssetbundle?.AssetbundleSecondaryURL, 'bundle', `${base}.CustomAssetbundle.AssetbundleSecondaryURL`, record);

  for (const [index, decal] of (o.AttachedDecals ?? []).entries()) {
    addAsset(decal.CustomDecal?.ImageURL, 'image', `${base}.AttachedDecals.${index}.CustomDecal.ImageURL`, record);
  }
  addLuaUrls(o.LuaScript, `${base}.LuaScript`, record);
  addLuaUrls(o.LuaScriptState, `${base}.LuaScriptState`, record);
}

for (const record of records) scanObjectAssets(record);
addLuaUrls(save.LuaScript, 'root.LuaScript');
addLuaUrls(save.LuaScriptState, 'root.LuaScriptState');
for (const [index, decal] of (save.DecalPallet ?? []).entries()) {
  addAsset(decal.CustomDecal?.ImageURL, 'image', `root.DecalPallet.${index}.CustomDecal.ImageURL`);
}

const CACHE_KINDS = {
  image: { directory: 'Images', extensions: ['.png', '.jpg', '.jpeg'] },
  model: { directory: 'Models', extensions: ['.obj'] },
  pdf: { directory: 'PDF', extensions: ['.PDF', '.pdf'] },
  bundle: { directory: 'Assetbundles', extensions: ['.unity3d'] },
};

function findCached(url, kind) {
  const config = CACHE_KINDS[kind] ?? fail(`unsupported asset kind ${kind}`);
  const candidates = [...new Set([url, normalizeHost(url)])];
  for (const candidateUrl of candidates) {
    const base = path.join(MODS, config.directory, munge(candidateUrl));
    for (const extension of config.extensions) {
      const candidate = base + extension;
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// All are source-mod defects/expired uploads. Four gameplay images have an
// authentic cached equivalent elsewhere in the same save; only the three solo
// objective backs have no surviving equivalent. Keep this list exact so a new,
// unexpected cache miss fails extraction.
const KNOWN_UNAVAILABLE = new Map([
  ['https://i.imgur.com/DbPelDi.jpg', 'Flex Table controller UI; furniture only, not a SETI component'],
  ['https://i.imgur.com/eHXDjyy.jpg', 'Flex Table controller UI; furniture only, not a SETI component'],
  ['https://i.imgur.com/N0O6aqj.jpg', 'Flex Table controller UI; furniture only, not a SETI component'],
  ['https://steamusercontent-a.akamaihd.net/ugc/44574410610099271/CA911E44A79E0B03C1704194B0750E009F663E35/', 'solo objective tier-1 back (Obj1_Back)'],
  ['https://steamusercontent-a.akamaihd.net/ugc/44574410610106460/37B086D089DB3BE1BA2386F82B69D6671CCF62E5/', 'solo objective tier-2 back (Obj2_Back)'],
  ['https://steamusercontent-a.akamaihd.net/ugc/44574410610114343/02F0BD1BF336FDC45BCB80F01760CD9486D45470/', 'solo objective tier-3 back (Obj3_Back)'],
  ['https://steamusercontent-a.akamaihd.net/ugc/44575044584095204/5A30B741552E2599C505AE3610AF4338150E68BF/', 'rotated player-aid spawn; use the complete English aid or PDF'],
  ['https://steamusercontent-a.akamaihd.net/ugc/44575044593670570/3CF429E0481E797564FB73AD4A1F031CA6EA470D/', 'obsolete rival board 1-2; superseded by bag 52427b'],
  ['https://steamusercontent-a.akamaihd.net/ugc/44575044593670789/FBC814817F1423E1F291BDE6F48760082C63CB07/', 'obsolete rival board 3; superseded by bag 52427b'],
  ['https://steamusercontent-a.akamaihd.net/ugc/44575044593670916/D3757B61A07AF8CA3385E0E372461BB7B171A4EB/', 'obsolete rival board 4-5; superseded by bag 52427b'],
]);

const sourceAssets = [...assetOccurrences.values()]
  .map((entry) => {
    const cacheFile = findCached(entry.url, entry.kind);
    return {
      kind: entry.kind,
      url: entry.url,
      occurrences: [...new Set(entry.occurrences)].sort(),
      status: cacheFile ? 'cached' : (KNOWN_UNAVAILABLE.has(entry.url) ? 'known-unavailable' : 'missing'),
      ...(cacheFile ? {
        cacheFile: path.relative(MODS, cacheFile).replaceAll('\\', '/'),
        bytes: fs.statSync(cacheFile).size,
        sha256: sha256File(cacheFile),
      } : {}),
      ...(!cacheFile && KNOWN_UNAVAILABLE.has(entry.url) ? { note: KNOWN_UNAVAILABLE.get(entry.url) } : {}),
    };
  })
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.url.localeCompare(b.url));

const unexpectedMissing = sourceAssets.filter((asset) => asset.status === 'missing');
assert(unexpectedMissing.length === 0, `unexpected cache misses:\n${unexpectedMissing.map((asset) => asset.url).join('\n')}`);

// ---------------------------------------------------------------------------
// Deterministic staging helpers.
// ---------------------------------------------------------------------------

const stagedAssets = [];

async function stageImage({ id, role, url, relative, guids = [], maxWidth = null, quality = 94, lossless = false }) {
  const sourceFile = findCached(url, 'image');
  assert(sourceFile, `uncached selected image ${id}: ${url}`);
  const targetFile = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const sourceMeta = await sharp(sourceFile, { failOn: 'error', limitInputPixels: false }).metadata();
  // TTS cache downloads receive a fresh mtime. Reuse a newer staged image on
  // an idempotent rerun; refresh automatically when its authentic source is
  // replaced or re-downloaded.
  const upToDate = fs.existsSync(targetFile)
    && fs.statSync(targetFile).mtimeMs >= fs.statSync(sourceFile).mtimeMs;
  if (!upToDate) {
    let pipeline = sharp(sourceFile, { failOn: 'error', limitInputPixels: false, sequentialRead: true });
    if (maxWidth && sourceMeta.width > maxWidth) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }
    await pipeline.webp(lossless
      ? { lossless: true, effort: 5 }
      : { quality, alphaQuality: 100, smartSubsample: true, effort: 5 }).toFile(targetFile);
  }
  const stagedMeta = await sharp(targetFile, { limitInputPixels: false }).metadata();
  const record = {
    id,
    role,
    path: publicPath(relative),
    guids: [...new Set(guids)],
    sourceUrl: normalizeHost(url),
    source: {
      cacheFile: path.relative(MODS, sourceFile).replaceAll('\\', '/'),
      sha256: sha256File(sourceFile),
      bytes: fs.statSync(sourceFile).size,
      imagePx: [sourceMeta.width, sourceMeta.height],
      format: sourceMeta.format,
      hasAlpha: Boolean(sourceMeta.hasAlpha),
    },
    staged: {
      sha256: sha256File(targetFile),
      bytes: fs.statSync(targetFile).size,
      imagePx: [stagedMeta.width, stagedMeta.height],
      format: stagedMeta.format,
      hasAlpha: Boolean(stagedMeta.hasAlpha),
    },
  };
  stagedAssets.push(record);
  return record;
}

function stageFile({ id, role, url, kind, relative, guids = [], transformText = null }) {
  const sourceFile = findCached(url, kind);
  assert(sourceFile, `uncached selected ${kind} ${id}: ${url}`);
  const targetFile = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  if (transformText) fs.writeFileSync(targetFile, transformText(fs.readFileSync(sourceFile, 'utf8')), 'utf8');
  else fs.copyFileSync(sourceFile, targetFile);
  const record = {
    id,
    role,
    path: publicPath(relative),
    guids: [...new Set(guids)],
    sourceUrl: normalizeHost(url),
    source: {
      cacheFile: path.relative(MODS, sourceFile).replaceAll('\\', '/'),
      sha256: sha256File(sourceFile),
      bytes: fs.statSync(sourceFile).size,
    },
    staged: { sha256: sha256File(targetFile), bytes: fs.statSync(targetFile).size },
  };
  stagedAssets.push(record);
  return record;
}

const stageModel = ({ id, role, url, relative, guids }) => stageFile({
  id,
  role,
  url,
  kind: 'model',
  relative,
  guids,
  // TTS tolerates a legacy lone `0` sentinel. Browsers do not need it.
  transformText: (text) => text.replace(/(?:\r?\n)0\s*$/, '\n'),
});
const stagePdf = ({ id, url, relative, guids }) => stageFile({
  id, role: 'rules-pdf', url, kind: 'pdf', relative, guids,
});

async function stageOfficialPdf({ id, url, relative }) {
  const targetFile = path.join(OUT, relative);
  let bytes = null;
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Board Game Engine SETI extractor' } });
    assert(response.ok, `${id}: official PDF returned HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.subarray(0, 5).toString('ascii') === '%PDF-', `${id}: official endpoint did not return a PDF`);
    fs.writeFileSync(targetFile, bytes);
  } catch (error) {
    // A checked, previously staged official file keeps offline re-extraction
    // useful. Online runs always refresh it from CGE first.
    assert(fs.existsSync(targetFile), `${id}: ${error.message}; no previously staged PDF exists`);
    bytes = fs.readFileSync(targetFile);
    assert(bytes.subarray(0, 5).toString('ascii') === '%PDF-', `${id}: staged fallback is not a PDF`);
  }
  const record = {
    id,
    role: 'rules-pdf',
    path: publicPath(relative),
    guids: [],
    sourceUrl: url,
    source: { authority: 'official-cge-current-download', sha256: sha256Buffer(bytes), bytes: bytes.length },
    staged: { sha256: sha256File(targetFile), bytes: fs.statSync(targetFile).size },
  };
  stagedAssets.push(record);
  return record;
}

async function stagePdfCover({ id, pdfFile, pdfSourceUrl, relative }) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'seti-cover-'));
  const prefix = path.join(tempDirectory, 'cover');
  try {
    const bundledPdftoppm = path.join(
      os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe',
    );
    const pdftoppm = fs.existsSync(bundledPdftoppm) ? bundledPdftoppm : 'pdftoppm';
    const result = spawnSync(
      pdftoppm,
      ['-png', '-f', '1', '-singlefile', '-r', '160', pdfFile, prefix],
      { encoding: 'utf8', shell: false, timeout: 120_000 },
    );
    assert(result.status === 0, `pdftoppm failed for box cover: ${result.stderr || result.stdout}`);
    const rendered = `${prefix}.png`;
    assert(fs.existsSync(rendered), 'pdftoppm did not emit the rulebook cover');
    const targetFile = path.join(OUT, relative);
    await sharp(rendered, { failOn: 'error', limitInputPixels: false })
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 96, alphaQuality: 100, smartSubsample: true, effort: 5 })
      .toFile(targetFile);
    const meta = await sharp(targetFile).metadata();
    const record = {
      id,
      role: 'game-box-cover',
      path: publicPath(relative),
      guids: ['e3d69c'],
      sourceUrl: pdfSourceUrl,
      source: {
        authority: 'bundled-official-english-rulebook-cover',
        cacheFile: path.relative(MODS, pdfFile).replaceAll('\\', '/'),
        sha256: sha256File(pdfFile),
        bytes: fs.statSync(pdfFile).size,
        page: 1,
        renderDpi: 160,
      },
      staged: {
        sha256: sha256File(targetFile),
        bytes: fs.statSync(targetFile).size,
        imagePx: [meta.width, meta.height],
        format: meta.format,
        hasAlpha: Boolean(meta.hasAlpha),
      },
    };
    stagedAssets.push(record);
    return record;
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

// TTS Custom Tokens use a 4.4-unit maximum side at scale 1. The normalized
// art mapping below was checked against the physical solar center:
// board art [~0.4965,~0.5499] -> world [-1.38,-0.06].
const TTS_TOKEN_BASE_SIZE = 4.4;

function planarArtMapping(ttsObject, imagePx) {
  const [pixelWidth, pixelHeight] = imagePx;
  const maxPixel = Math.max(pixelWidth, pixelHeight);
  const localWidth = TTS_TOKEN_BASE_SIZE * pixelWidth / maxPixel;
  const localHeight = TTS_TOKEN_BASE_SIZE * pixelHeight / maxPixel;
  const t = transform(ttsObject);
  const scaledWidth = localWidth * t.scale[0];
  const scaledHeight = localHeight * t.scale[2];
  const yaw = t.rot[1] * Math.PI / 180;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const a = cosine * scaledWidth;
  const b = sine * scaledHeight;
  const d = -sine * scaledWidth;
  const e = cosine * scaledHeight;
  const c = t.pos[0] - (a + b) / 2;
  const f = t.pos[2] - (d + e) / 2;
  const determinant = a * e - b * d;
  const ia = e / determinant;
  const ib = -b / determinant;
  const id = -d / determinant;
  const ie = a / determinant;
  return {
    tokenBaseSize: TTS_TOKEN_BASE_SIZE,
    localSize: [localWidth, localHeight].map((value) => round(value)),
    orientedSize: [scaledWidth, scaledHeight].map((value) => round(value)),
    worldAabbSize: [Math.abs(a) + Math.abs(b), Math.abs(d) + Math.abs(e)].map((value) => round(value)),
    artToWorld: {
      input: 'normalized-u-v',
      output: 'tts-world-x-z',
      imagePx,
      matrix: [
        [a, b, c].map((value) => round(value, 9)),
        [d, e, f].map((value) => round(value, 9)),
      ],
    },
    worldToArt: {
      input: 'tts-world-x-z',
      output: 'normalized-u-v',
      matrix: [
        [ia, ib, -(ia * c + ib * f)].map((value) => round(value, 9)),
        [id, ie, -(id * c + ie * f)].map((value) => round(value, 9)),
      ],
    },
  };
}

function attachedSnaps(ttsObject, mapping) {
  const [localWidth, localHeight] = mapping.localSize;
  return (ttsObject.AttachedSnapPoints ?? []).map((snap, index) => {
    const raw = snapPoint(snap, index, 'object-local');
    const [x, y, z] = raw.position;
    const art = [0.5 + x / localWidth, 0.5 + z / localHeight];
    const [[a, b, c], [d, e, f]] = mapping.artToWorld.matrix;
    return {
      ...raw,
      art: art.map((value) => round(value, 9)),
      worldYawProjected: [
        a * art[0] + b * art[1] + c,
        transform(ttsObject).pos[1] + y * transform(ttsObject).scale[1],
        d * art[0] + e * art[1] + f,
      ].map((value) => round(value, 9)),
    };
  });
}

async function stageTokenComponent({ id, role, guid, relative, url = null, maxWidth = 4096, quality = 95, lossless = false }) {
  const ttsObject = object(guid);
  const image = ttsObject.CustomImage ?? ttsObject.CustomToken;
  const sourceUrl = url ?? image?.ImageURL;
  assert(sourceUrl, `${guid} has no token image`);
  const staged = await stageImage({ id, role, url: sourceUrl, relative, guids: [guid], maxWidth, quality, lossless });
  const mapping = planarArtMapping(ttsObject, staged.source.imagePx);
  return {
    id,
    guid,
    image: staged.path,
    imagePx: staged.staged.imagePx,
    sourceImagePx: staged.source.imagePx,
    tts: transform(ttsObject),
    mapping,
    snapPoints: attachedSnaps(ttsObject, mapping),
  };
}

function deckCell(card, definition, sheetKey, sheetPath) {
  assert(Number.isInteger(card.CardID), `${card.GUID} has no integer CardID`);
  const deckId = Math.floor(card.CardID / 100);
  const index = card.CardID % 100;
  assert(definition, `${card.GUID}/${card.CardID}: missing CustomDeck definition`);
  assert(index < definition.NumWidth * definition.NumHeight,
    `${card.GUID}/${card.CardID}: cell ${index} outside ${definition.NumWidth}x${definition.NumHeight}`);
  return {
    cardId: card.CardID,
    deckId,
    sheetKey,
    sheet: sheetPath,
    cell: {
      index,
      column: index % definition.NumWidth,
      row: Math.floor(index / definition.NumWidth),
      columns: definition.NumWidth,
      rows: definition.NumHeight,
      zeroBased: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared board scene: main board, discs, sector boards, personal boards, and
// species boards. Species fronts come from AttachedDecals, not the identical
// starry CustomImage back.
// ---------------------------------------------------------------------------

const board = await stageTokenComponent({
  id: 'main-board', role: 'main-board', guid: '72f0d1', relative: 'board/main-board.webp', maxWidth: null,
});
assert(board.snapPoints.length === 102, `main board: expected 102 snaps, got ${board.snapPoints.length}`);

const discDefs = [
  ['disc-1', '9bdd5c'],
  ['disc-2', 'd2b92f'],
  ['disc-3', 'cb4843'],
];
const discs = [];
for (const [id, guid] of discDefs) {
  discs.push(await stageTokenComponent({
    id, role: 'solar-disc', guid, relative: `solar/${id}.webp`, maxWidth: null, lossless: true,
  }));
}
const solarCenter = [-1.38, -0.06];
const [[w2uA, w2uB, w2uC], [w2vA, w2vB, w2vC]] = board.mapping.worldToArt.matrix;
const solarCenterArt = [
  w2uA * solarCenter[0] + w2uB * solarCenter[1] + w2uC,
  w2vA * solarCenter[0] + w2vB * solarCenter[1] + w2vC,
].map((value) => round(value, 9));
assert(Math.abs(solarCenterArt[0] - 0.4965) < 0.01 && Math.abs(solarCenterArt[1] - 0.55) < 0.01,
  `board art mapping did not recover the solar center: ${solarCenterArt}`);

function extractLuaVectors(lua, variableName) {
  const marker = new RegExp(`(?:local\\s+)?${variableName}\\s*=\\s*\\{`, 'm').exec(lua);
  assert(marker, `missing Lua table ${variableName}`);
  const openIndex = marker.index + marker[0].lastIndexOf('{');
  let depth = 0;
  let closeIndex = -1;
  for (let index = openIndex; index < lua.length; index++) {
    if (lua[index] === '{') depth++;
    else if (lua[index] === '}') {
      depth--;
      if (depth === 0) { closeIndex = index; break; }
    }
  }
  assert(closeIndex > openIndex, `unterminated Lua table ${variableName}`);
  const body = lua.slice(openIndex + 1, closeIndex);
  return [...body.matchAll(/\{\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}/g)]
    .map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
}

const sectorDefs = [
  { id: 'kepler-proxima', name: 'Kepler-22 / Proxima Centauri', guid: '8c079b' },
  { id: 'sirius-barnard', name: "Sirius A / Barnard's Star", guid: '018bc4' },
  { id: 'procyon-vega', name: 'Procyon / Vega', guid: '737f28' },
  { id: 'virginis-beta-pictoris', name: '61 Virginis / Beta Pictoris', guid: 'b7f4d9' },
];
const sectors = [];
for (const definition of sectorDefs) {
  const component = await stageTokenComponent({
    ...definition,
    role: 'sector-board',
    relative: `sectors/${definition.id}.webp`,
    maxWidth: null,
  });
  const ttsObject = object(definition.guid);
  const left = extractLuaVectors(ttsObject.LuaScript, 'TOKEN_TARGETS_LEFT');
  const right = extractLuaVectors(ttsObject.LuaScript, 'TOKEN_TARGETS_RIGHT');
  const slots = [
    ...left.map((world, index) => ({ index, side: 'left', sideIndex: index, world })),
    ...right.map((world, index) => ({ index: left.length + index, side: 'right', sideIndex: index, world })),
  ];
  sectors.push({
    ...component,
    name: definition.name,
    capacity: slots.length,
    sides: { left: left.length, right: right.length },
    slots,
    attachedSnapPoints: (ttsObject.AttachedSnapPoints ?? []).map((snap, index) => snapPoint(snap, index, 'object-local')),
  });
}
assert(JSON.stringify(sectors.map((sector) => sector.capacity)) === JSON.stringify([11, 11, 9, 11]),
  `sector capacities changed: ${sectors.map((sector) => sector.capacity)}`);

const playerDefs = [
  { id: 'white', guid: '5593b2', expectedSnaps: 27 },
  { id: 'green', guid: 'f153aa', expectedSnaps: 59 },
  { id: 'purple', guid: '4c7c0e', expectedSnaps: 30 },
  { id: 'orange', guid: 'ec3a4b', expectedSnaps: 29 },
];
const playerBoards = [];
for (const definition of playerDefs) {
  const component = await stageTokenComponent({
    id: `player-${definition.id}`,
    role: 'player-board',
    guid: definition.guid,
    relative: `player/player-${definition.id}.webp`,
    maxWidth: 4096,
  });
  assert(component.snapPoints.length === definition.expectedSnaps,
    `${definition.id} board: expected ${definition.expectedSnaps} snaps, got ${component.snapPoints.length}`);
  playerBoards.push({ ...component, color: definition.id });
}

const playerAidUrl = [...(object('be0b8e').LuaScript.matchAll(URL_RE))][0]?.[0];
assert(playerAidUrl, 'English player-aid Lua URL not found');
const playerAidImage = await stageImage({
  id: 'player-aid-image', role: 'player-aid', url: playerAidUrl,
  relative: 'player/player-aid.webp', guids: ['be0b8e', '7b4150'], maxWidth: 4096, quality: 95,
});

const alienDefs = [
  { id: 'exertians', name: 'Exertians', guid: '29ac95', expectedSnaps: 15 },
  { id: 'oumuamua', name: "'Oumuamua", guid: 'a80427', expectedSnaps: 21 },
  { id: 'centaurians', name: 'Centaurians', guid: '999a3f', expectedSnaps: 16 },
  { id: 'anomalies', name: 'Anomalies', guid: '687855', expectedSnaps: 12 },
  { id: 'mascamites', name: 'Mascamites', guid: 'c1440c', expectedSnaps: 17 },
];
const alienBackObject = object(alienDefs[0].guid);
const alienBack = await stageImage({
  id: 'alien-board-back', role: 'alien-board-back', url: alienBackObject.CustomImage.ImageURL,
  relative: 'aliens/alien-back.webp', guids: alienDefs.map(({ guid }) => guid), maxWidth: 4096, quality: 95,
});
const alienBoards = [];
for (const definition of alienDefs) {
  const ttsObject = object(definition.guid);
  assert(ttsObject.AttachedDecals?.length === 1, `${definition.id} board must have one front decal`);
  const frontUrl = ttsObject.AttachedDecals[0].CustomDecal.ImageURL;
  const front = await stageImage({
    id: `alien-board-${definition.id}`, role: 'alien-board-front', url: frontUrl,
    relative: `aliens/${definition.id}.webp`, guids: [definition.guid], maxWidth: 4096, quality: 95,
  });
  const mapping = planarArtMapping(ttsObject, front.source.imagePx);
  const snaps = attachedSnaps(ttsObject, mapping);
  assert(snaps.length === definition.expectedSnaps,
    `${definition.id}: expected ${definition.expectedSnaps} snaps, got ${snaps.length}`);
  alienBoards.push({
    id: definition.id,
    name: definition.name,
    guid: definition.guid,
    front: front.path,
    back: alienBack.path,
    imagePx: front.staged.imagePx,
    sourceImagePx: front.source.imagePx,
    tts: transform(ttsObject),
    mapping,
    snapPoints: snaps,
    attachedDecal: {
      transform: transform({ GUID: `${definition.guid}:decal`, Transform: ttsObject.AttachedDecals[0].Transform }),
      size: ttsObject.AttachedDecals[0].CustomDecal.Size,
      sourceUrl: frontUrl,
    },
  });
}

// ---------------------------------------------------------------------------
// English project cards, alien cards, tech stacks, and income cards.
// ---------------------------------------------------------------------------

const cardSheets = {};

async function stageDeckDefinition({ namespace, deckId, definition, faceRelative, backRelative, role, guids, maxFaceWidth = 4096 }) {
  const face = await stageImage({
    id: `${namespace}-${deckId}-face`, role, url: definition.FaceURL,
    relative: faceRelative, guids, maxWidth: maxFaceWidth, quality: 95,
  });
  const back = await stageImage({
    id: `${namespace}-${deckId}-back`, role: `${role}-back`, url: definition.BackURL,
    relative: backRelative, guids, maxWidth: maxFaceWidth, quality: 94,
  });
  const key = `${namespace}:${deckId}`;
  cardSheets[key] = {
    key,
    namespace,
    deckId: Number(deckId),
    face: face.path,
    back: back.path,
    columns: definition.NumWidth,
    rows: definition.NumHeight,
    uniqueBack: Boolean(definition.UniqueBack),
    sourceImagePx: face.source.imagePx,
    imagePx: face.staged.imagePx,
  };
  return cardSheets[key];
}

const projectDeck = topObject('875db8');
const mainProjectBackUrl = projectDeck.CustomDeck['2045'].BackURL;
const mainProjectBack = await stageImage({
  id: 'project-back', role: 'project-card-back', url: mainProjectBackUrl,
  relative: 'cards/project-back.webp', guids: ['875db8'], maxWidth: 4096, quality: 95,
});
for (const [deckId, definition] of Object.entries(projectDeck.CustomDeck).sort(([a], [b]) => Number(a) - Number(b))) {
  const face = await stageImage({
    id: `project-${deckId}-face`, role: 'project-card-sheet', url: definition.FaceURL,
    relative: `cards/project-${deckId}.webp`, guids: ['875db8'], maxWidth: 4096, quality: 95,
  });
  let back = mainProjectBack;
  if (normalizeHost(definition.BackURL) !== normalizeHost(mainProjectBackUrl)) {
    back = await stageImage({
      id: `project-${deckId}-back`, role: 'project-card-back', url: definition.BackURL,
      relative: `cards/project-${deckId}-back.webp`, guids: ['875db8'], maxWidth: 4096, quality: 95,
    });
  }
  cardSheets[`project:${deckId}`] = {
    key: `project:${deckId}`,
    namespace: 'project',
    deckId: Number(deckId),
    face: face.path,
    back: back.path,
    columns: definition.NumWidth,
    rows: definition.NumHeight,
    uniqueBack: Boolean(definition.UniqueBack),
    sourceImagePx: face.source.imagePx,
    imagePx: face.staged.imagePx,
  };
}

const ocrRows = fs.existsSync(OCR_FILE) ? JSON.parse(fs.readFileSync(OCR_FILE, 'utf8')) : [];
if (ocrRows.length) assert(ocrRows.length === 140, `OCR aid expected 140 rows, got ${ocrRows.length}`);
const ocrByCardId = new Map(ocrRows.map((row) => [row.cardId, row]));

const projects = projectDeck.ContainedObjects.map((card) => {
  const deckId = Math.floor(card.CardID / 100);
  const definition = projectDeck.CustomDeck[String(deckId)];
  const sheet = cardSheets[`project:${deckId}`];
  const ocr = ocrByCardId.get(card.CardID);
  if (ocr) {
    assert(ocr.name === card.Nickname, `${card.CardID}: OCR name does not match TTS nickname`);
    assert(Number(ocr.deck) === deckId && ocr.cell === card.CardID % 100,
      `${card.CardID}: OCR deck/cell does not match CardID`);
  }
  return {
    id: `project-${card.CardID}`,
    name: card.Nickname,
    slug: slug(card.Nickname),
    guid: card.GUID,
    ...deckCell(card, definition, sheet.key, sheet.face),
    ...(card.Nickname === 'Lunar Gateway' ? { printedNumber: 117, replacementScan: true } : {}),
    ...(ocr ? {
      ocrHint: {
        authority: 'non-authoritative-ocr-hint',
        income: ocr.income,
        text: ocr.text,
        confidence: ocr.confidence,
      },
    } : {}),
  };
}).sort((a, b) => a.cardId - b.cardId);

const promoCardIds = new Set([41500, 204700]);
const projectPromos = projects.filter((card) => promoCardIds.has(card.cardId)).map((card) => ({
  ...card,
  canonicalName: card.cardId === 204700 ? 'Pluto: Not a planet since 2006' : card.name,
}));
const baseProjects = projects.filter((card) => !promoCardIds.has(card.cardId));
assert(baseProjects.length === 138, `expected 138 base projects, got ${baseProjects.length}`);
assert(projectPromos.length === 2, `expected two project promos, got ${projectPromos.length}`);
assert(projectPromos.some((card) => card.cardId === 41500 && card.name === 'Gateway to Mars'), 'Gateway to Mars promo not identified');
assert(projectPromos.some((card) => card.cardId === 204700 && card.name === 'Not a planet since 2006'), 'Pluto promo not identified');
assert(baseProjects.some((card) => card.cardId === 204400 && card.name === 'Lunar Gateway'), 'Lunar Gateway replacement missing');

const alienDeckDefs = [
  { id: 'exertians', guid: '6bceb3', expected: 15 },
  { id: 'mascamites', guid: '8840b7', expected: 10 },
  { id: 'anomalies', guid: '483f00', expected: 10 },
  { id: 'oumuamua', guid: '308a7d', expected: 10 },
  { id: 'centaurians', guid: '178f94', expected: 10 },
];
const alienDecks = [];
for (const deckDefinition of alienDeckDefs) {
  const ttsDeck = topObject(deckDefinition.guid);
  assert(ttsDeck.ContainedObjects.length === deckDefinition.expected,
    `${deckDefinition.id}: expected ${deckDefinition.expected} cards, got ${ttsDeck.ContainedObjects.length}`);
  const deckIds = Object.keys(ttsDeck.CustomDeck);
  assert(deckIds.length === 1, `${deckDefinition.id}: expected one sheet definition`);
  const deckId = deckIds[0];
  const definition = ttsDeck.CustomDeck[deckId];
  const sheet = await stageDeckDefinition({
    namespace: `alien-${deckDefinition.id}`,
    deckId,
    definition,
    faceRelative: `cards/alien-${deckDefinition.id}.webp`,
    backRelative: `cards/alien-${deckDefinition.id}-back.webp`,
    role: 'alien-card-sheet',
    guids: [deckDefinition.guid],
  });
  const cards = ttsDeck.ContainedObjects.map((card) => ({
    id: `${deckDefinition.id}-${card.CardID}`,
    guid: card.GUID,
    ...deckCell(card, definition, sheet.key, sheet.face),
  })).sort((a, b) => a.cardId - b.cardId);
  alienDecks.push({
    id: deckDefinition.id,
    guid: deckDefinition.guid,
    tts: transform(ttsDeck),
    sheetKey: sheet.key,
    count: cards.length,
    cards,
  });
}
assert(alienDecks.reduce((sum, deck) => sum + deck.count, 0) === 55, 'expected 55 English alien cards');

const TECH_STACK_GUIDS = [
  '00df2d', 'b26ea5', '84fb8c', '9dceb9',
  '82eb24', '93c0f5', '0fb79c', '9b40d4',
  '5065ac', 'b71fb9', '00d8a2', 'c0c391',
];
const technologyStacks = [];
for (const [stackIndex, guid] of TECH_STACK_GUIDS.entries()) {
  const ttsDeck = topObject(guid);
  assert(ttsDeck.ContainedObjects?.length === 4, `${guid}: technology stack must contain four tiles`);
  const sheets = {};
  for (const [deckId, definition] of Object.entries(ttsDeck.CustomDeck).sort(([a], [b]) => Number(a) - Number(b))) {
    sheets[deckId] = await stageDeckDefinition({
      namespace: `tech-${String(stackIndex + 1).padStart(2, '0')}`,
      deckId,
      definition,
      faceRelative: `cards/tech-${String(stackIndex + 1).padStart(2, '0')}-${deckId}.webp`,
      backRelative: `cards/tech-${String(stackIndex + 1).padStart(2, '0')}-${deckId}-back.webp`,
      role: 'technology-tile',
      guids: [guid],
      maxFaceWidth: 2048,
    });
  }
  const tiles = ttsDeck.ContainedObjects.map((card) => {
    const deckId = Math.floor(card.CardID / 100);
    const definition = ttsDeck.CustomDeck[String(deckId)];
    const sheet = sheets[String(deckId)];
    assert(sheet, `${guid}/${card.CardID}: no staged tech definition`);
    return {
      id: `tech-${String(stackIndex + 1).padStart(2, '0')}-${card.CardID}`,
      guid: card.GUID,
      ...deckCell(card, definition, sheet.key, sheet.face),
      back: sheet.back,
    };
  }).sort((a, b) => a.cardId - b.cardId);
  technologyStacks.push({
    id: `tech-stack-${String(stackIndex + 1).padStart(2, '0')}`,
    index: stackIndex,
    guid,
    tts: transform(ttsDeck),
    count: tiles.length,
    tiles,
  });
}
assert(technologyStacks.length === 12 && technologyStacks.every((stack) => stack.count === 4),
  'expected twelve four-tile technology stacks');

const incomeDefs = [
  { color: 'green', guid: '307c7b' },
  { color: 'orange', guid: '535021' },
  { color: 'purple', guid: '8184ba' },
  { color: 'white', guid: '77efb7' },
];
const incomeCards = [];
for (const definition of incomeDefs) {
  const card = topObject(definition.guid);
  const deckId = Math.floor(card.CardID / 100);
  const customDeck = card.CustomDeck[String(deckId)];
  assert(customDeck, `${definition.guid}: missing income CustomDeck ${deckId}`);
  // These four one-card TTS namespaces deliberately use cell suffixes 00-03
  // despite identical art. Preserve that CardID verbatim rather than forcing a
  // mathematically invalid 1x1 cell assumption.
  const face = await stageImage({
    id: `income-${definition.color}`, role: 'income-card', url: customDeck.FaceURL,
    relative: `cards/income-${definition.color}.webp`, guids: [definition.guid], maxWidth: 2048, quality: 95,
  });
  const back = await stageImage({
    id: `income-${definition.color}-back`, role: 'income-card-back', url: customDeck.BackURL,
    relative: `cards/income-${definition.color}-back.webp`, guids: [definition.guid], maxWidth: 2048, quality: 95,
  });
  incomeCards.push({
    id: `income-${definition.color}`,
    color: definition.color,
    guid: definition.guid,
    cardId: card.CardID,
    deckId,
    ttsCellSuffix: card.CardID % 100,
    face: face.path,
    back: back.path,
    tts: transform(card),
  });
}

// ---------------------------------------------------------------------------
// Solo: authentic four rival boards, one 19-cell action sheet, and every
// objective front. The three dead objective-back uploads are retained in the
// raw source inventory as explicit gaps; fronts and gameplay identity are safe.
// ---------------------------------------------------------------------------

const rivalBoardBag = topObject('52427b');
const rivalBoards = [];
for (const ttsObject of rivalBoardBag.ContainedObjects) {
  const difficulty = ttsObject.Nickname.match(/Difficulty (.+)$/)?.[1] ?? fail(`unknown rival board ${ttsObject.Nickname}`);
  const id = difficulty === '1+2' ? '1-2' : difficulty;
  const image = await stageImage({
    id: `rival-board-${id}`, role: 'solo-rival-board', url: ttsObject.CustomImage.ImageURL,
    relative: `solo/rival-board-${id}.webp`, guids: [ttsObject.GUID], maxWidth: 4096, quality: 95,
  });
  rivalBoards.push({
    id: `difficulty-${id}`,
    difficulty: id === '1-2' ? [1, 2] : [Number(id)],
    guid: ttsObject.GUID,
    image: image.path,
    imagePx: image.staged.imagePx,
    sourceImagePx: image.source.imagePx,
    tts: transform(ttsObject),
  });
}
rivalBoards.sort((a, b) => a.difficulty[0] - b.difficulty[0]);
assert(rivalBoards.length === 4, `expected four rival board assets, got ${rivalBoards.length}`);

const rivalDeckRoots = [topObject('104c3e'), topObject('ae7448'), topObject('f7efbc')];
const rivalActionCards = [];
let rivalActionDefinition = null;
for (const bag of rivalDeckRoots) {
  const deck = bag.ContainedObjects?.[0];
  assert(deck?.CustomDeck?.['425'], `${bag.GUID}: missing rival action sheet 425`);
  rivalActionDefinition ??= deck.CustomDeck['425'];
  assert(deck.CustomDeck['425'].FaceURL === rivalActionDefinition.FaceURL, 'rival action face sheet changed between bags');
  for (const card of deck.ContainedObjects) {
    rivalActionCards.push({ card, sourceBag: bag.Nickname, sourceBagGuid: bag.GUID, sourceDeckGuid: deck.GUID });
  }
}
const rivalActionSheet = await stageDeckDefinition({
  namespace: 'solo-rival', deckId: 425, definition: rivalActionDefinition,
  faceRelative: 'solo/rival-actions.webp', backRelative: 'solo/rival-actions-back.webp',
  role: 'solo-rival-action-card', guids: rivalDeckRoots.map((bag) => bag.GUID), maxFaceWidth: 4096,
});
const rivalActions = rivalActionCards.map(({ card, sourceBag, sourceBagGuid, sourceDeckGuid }) => ({
  id: `rival-action-${card.CardID}`,
  guid: card.GUID,
  group: sourceBag,
  sourceBagGuid,
  sourceDeckGuid,
  ...deckCell(card, rivalActionDefinition, rivalActionSheet.key, rivalActionSheet.face),
})).sort((a, b) => a.cardId - b.cardId);
assert(rivalActions.length === 19 && new Set(rivalActions.map((card) => card.cardId)).size === 19,
  `expected 19 unique rival actions, got ${rivalActions.length}`);

const objectiveBagDefs = [
  { tier: 1, guid: '6bcfd4', expected: 4 },
  { tier: 2, guid: '74f57d', expected: 11 },
  { tier: 3, guid: '837cfb', expected: 9 },
];
const objectives = [];
for (const bagDefinition of objectiveBagDefs) {
  const bag = topObject(bagDefinition.guid);
  assert(bag.ContainedObjects?.length === bagDefinition.expected,
    `objective tier ${bagDefinition.tier}: expected ${bagDefinition.expected}, got ${bag.ContainedObjects?.length}`);
  for (const [index, token] of bag.ContainedObjects.entries()) {
    const face = await stageImage({
      id: `objective-${bagDefinition.tier}-${String(index + 1).padStart(2, '0')}`,
      role: 'solo-objective-front',
      url: token.CustomImage.ImageURL,
      relative: `solo/objective-${bagDefinition.tier}-${String(index + 1).padStart(2, '0')}.webp`,
      guids: [token.GUID],
      maxWidth: 2048,
      quality: 95,
    });
    const backDecal = token.AttachedDecals?.[0]?.CustomDecal;
    objectives.push({
      id: `objective-${bagDefinition.tier}-${String(index + 1).padStart(2, '0')}`,
      tier: bagDefinition.tier,
      sourceIndex: index,
      guid: token.GUID,
      face: face.path,
      imagePx: face.staged.imagePx,
      sourceImagePx: face.source.imagePx,
      back: null,
      backSource: backDecal ? {
        name: backDecal.Name,
        sourceUrl: backDecal.ImageURL,
        status: findCached(backDecal.ImageURL, 'image') ? 'cached' : 'known-unavailable',
      } : null,
      tts: transform(token),
    });
  }
}
assert(objectives.length === 24, `expected 24 solo objectives, got ${objectives.length}`);

// ---------------------------------------------------------------------------
// Tokens and models needed by a tactile renderer.
// ---------------------------------------------------------------------------

const tokenDefs = [
  ['first-player', 'first-player-marker', '4314c9'],
  ['rotation-marker', 'solar-rotation-marker', '583d82'],
  ['oumuamua-tile', 'alien-token', '825de4'],
  ['anomaly-1', 'alien-token', '8f21f7'],
  ['anomaly-2', 'alien-token', '76cfff'],
  ['anomaly-3', 'alien-token', '173bfc'],
  ['message-orange', 'alien-token', 'af51e8'],
  ['message-white', 'alien-token', 'ce252f'],
  ['message-green', 'alien-token', 'b175fe'],
  ['message-purple', 'alien-token', 'cdec7a'],
  ['energy-white', 'resource-token', 'c8b88e'],
  ['energy-green', 'resource-token', 'eab074'],
  ['energy-purple', 'resource-token', '9d3cbe'],
  ['energy-orange', 'resource-token', '0d60d3'],
  ['credit-white', 'resource-token', 'e43984'],
  ['credit-green', 'resource-token', '9af1f7'],
  ['credit-purple', 'resource-token', '8aa475'],
  ['credit-orange', 'resource-token', '19df94'],
];
const tokens = [];
for (const [id, role, guid] of tokenDefs) {
  tokens.push(await stageTokenComponent({
    id, role, guid, relative: `tokens/${id}.webp`, maxWidth: 2048, quality: 95,
  }));
}

const sampleGuids = ['de89a6', '879c6f', '6a7064', 'e045f2', 'fe1f7c', '9d2913', 'c1983d'];
const samples = [];
let sampleBack = null;
for (const [index, guid] of sampleGuids.entries()) {
  const ttsObject = object(guid);
  const face = await stageImage({
    id: `mascamite-sample-${index + 1}`, role: 'mascamite-sample-front', url: ttsObject.CustomImage.ImageURL,
    relative: `tokens/mascamite-sample-${index + 1}.webp`, guids: [guid], maxWidth: 2048, quality: 95,
  });
  if (!sampleBack) sampleBack = await stageImage({
    id: 'mascamite-sample-back', role: 'mascamite-sample-back', url: ttsObject.CustomImage.ImageSecondaryURL,
    relative: 'tokens/mascamite-sample-back.webp', guids: sampleGuids, maxWidth: 2048, quality: 95,
  });
  samples.push({
    id: `mascamite-sample-${index + 1}`,
    guid,
    face: face.path,
    back: sampleBack.path,
    tts: transform(ttsObject),
  });
}

const exofossilDeck = topObject('3c6e45');
const exofossilDefinition = exofossilDeck.CustomDeck['13'];
const exofossilFace = await stageImage({
  id: 'exofossil', role: 'oumuamua-exofossil', url: exofossilDefinition.FaceURL,
  relative: 'tokens/exofossil.webp', guids: ['3c6e45'], maxWidth: 2048, quality: 95,
});

const exertianMilestones = [];
for (const [index, guid] of ['c1cca6', '576fe0'].entries()) {
  const card = topObject(guid);
  const deckId = String(Math.floor(card.CardID / 100));
  const definition = card.CustomDeck[deckId];
  const face = await stageImage({
    id: `exertian-milestone-${index + 1}`, role: 'exertian-milestone', url: definition.FaceURL,
    relative: `tokens/exertian-milestone-${index + 1}.webp`, guids: [guid], maxWidth: 2048, quality: 95,
  });
  const back = await stageImage({
    id: `exertian-milestone-${index + 1}-back`, role: 'exertian-milestone-back', url: definition.BackURL,
    relative: `tokens/exertian-milestone-${index + 1}-back.webp`, guids: [guid], maxWidth: 2048, quality: 95,
  });
  exertianMilestones.push({ id: `exertian-milestone-${index + 1}`, guid, face: face.path, back: back.path, cardId: card.CardID });
}

const goldTileDefs = [
  { id: 'tech', guid: 'b00f8d' },
  { id: 'mission', guid: '28aaeb' },
  { id: 'income', guid: '25bcad' },
  { id: 'other', guid: 'b748ce' },
];
const goldTiles = [];
for (const definition of goldTileDefs) {
  const sideAObject = topObject(definition.guid);
  const sideBObject = sideAObject.States?.['2'];
  assert(sideBObject?.CustomImage?.ImageURL, `${definition.id} gold tile has no second state`);
  const sideA = await stageImage({
    id: `gold-${definition.id}-a`, role: 'gold-milestone-tile', url: sideAObject.CustomImage.ImageURL,
    relative: `tokens/gold-${definition.id}-a.webp`, guids: [definition.guid], maxWidth: 2048, quality: 95,
  });
  const sideB = await stageImage({
    id: `gold-${definition.id}-b`, role: 'gold-milestone-tile', url: sideBObject.CustomImage.ImageURL,
    relative: `tokens/gold-${definition.id}-b.webp`, guids: [sideBObject.GUID], maxWidth: 2048, quality: 95,
  });
  goldTiles.push({
    id: definition.id,
    guid: definition.guid,
    sides: [{ state: 1, image: sideA.path }, { state: 2, image: sideB.path, guid: sideBObject.GUID }],
    tts: transform(sideAObject),
  });
}

const pieceSources = {
  probe: object('7dbcdb'),
  marker: object('36e356'),
  data: object('00526d'),
  score: object('abba2a'),
  publicity: object('e9e25f'),
  sun: object('eed942'),
};
const pieceModels = {};
for (const [id, source] of Object.entries(pieceSources)) {
  pieceModels[id] = stageModel({
    id: `${id}-model`, role: `${id}-piece-model`, url: source.CustomMesh.MeshURL,
    relative: `models/${id}.obj`, guids: [source.GUID],
  }).path;
}
const sunDiffuse = await stageImage({
  id: 'sun-diffuse', role: 'sun-diffuse', url: pieceSources.sun.CustomMesh.DiffuseURL,
  relative: 'models/sun.webp', guids: [pieceSources.sun.GUID], maxWidth: 2048, quality: 95,
});

const playerPieceGuids = {
  white: { probe: '7dbcdb', marker: '36e356' },
  green: { probe: '90db84', marker: '962a7a' },
  purple: { probe: 'ed7066', marker: '993659' },
  orange: { probe: '0de842', marker: '5c2a91' },
};
const playerTints = Object.fromEntries(Object.entries(playerPieceGuids).map(([seat, guids]) => [seat, {
  probe: color(object(guids.probe).ColorDiffuse),
  marker: color(object(guids.marker).ColorDiffuse),
  probeGuid: guids.probe,
  markerGuid: guids.marker,
}]));

const pieces = {
  models: {
    probe: pieceModels.probe,
    marker: pieceModels.marker,
    data: pieceModels.data,
    score: pieceModels.score,
    publicity: pieceModels.publicity,
    sun: pieceModels.sun,
  },
  sunDiffuse: sunDiffuse.path,
  playerTints,
  dataTint: color(pieceSources.data.ColorDiffuse),
  sourceTransforms: Object.fromEntries(Object.entries(pieceSources).map(([id, source]) => [id, transform(source)])),
};

// ---------------------------------------------------------------------------
// English PDFs from the save.
// ---------------------------------------------------------------------------

const pdfDefs = [
  { id: 'rulebook', guid: 'e3d69c', relative: 'rulebook.pdf' },
  { id: 'player-aid', guid: 'a36b4a', relative: 'player-aid.pdf' },
  { id: 'alien-species', guid: 'afba07', relative: 'alien-species.pdf' },
];
const pdfs = {};
for (const definition of pdfDefs) {
  const pdfObject = object(definition.guid);
  const asset = stagePdf({
    id: definition.id,
    url: pdfObject.CustomPDF.PDFUrl,
    relative: definition.relative,
    guids: [definition.guid],
  });
  pdfs[definition.id] = { guid: definition.guid, path: asset.path, sourceUrl: pdfObject.CustomPDF.PDFUrl };
}
const faqAsset = await stageOfficialPdf({ id: 'faq', url: OFFICIAL_FAQ_URL, relative: 'faq.pdf' });
pdfs.faq = { guid: null, path: faqAsset.path, sourceUrl: OFFICIAL_FAQ_URL, authority: 'official-cge-current-download' };
const rulebookPdfObject = object('e3d69c');
const boxAsset = await stagePdfCover({
  id: 'box',
  pdfFile: findCached(rulebookPdfObject.CustomPDF.PDFUrl, 'pdf'),
  pdfSourceUrl: rulebookPdfObject.CustomPDF.PDFUrl,
  relative: 'box.webp',
});

// ---------------------------------------------------------------------------
// Raw inventories and shared hashes.
// ---------------------------------------------------------------------------

const typeCounts = {};
const guidCounts = {};
for (const { object: ttsObject } of records) {
  typeCounts[ttsObject.Name] = (typeCounts[ttsObject.Name] ?? 0) + 1;
  guidCounts[ttsObject.GUID] = (guidCounts[ttsObject.GUID] ?? 0) + 1;
}

const rawObjects = records.map((record) => {
  const o = record.object;
  return {
    path: record.objectPath,
    parentPath: record.parentPath,
    relation: record.relation,
    guid: o.GUID,
    type: o.Name,
    nickname: o.Nickname ?? '',
    description: o.Description ?? '',
    tags: [...(o.Tags ?? [])],
    tts: transform(o),
    color: color(o.ColorDiffuse),
    containedCount: o.ContainedObjects?.length ?? 0,
    stateKeys: Object.keys(o.States ?? {}).sort((a, b) => Number(a) - Number(b)),
    ...(o.CardID !== undefined ? { cardId: o.CardID, deckId: Math.floor(o.CardID / 100), cell: o.CardID % 100 } : {}),
    customDeckIds: Object.keys(o.CustomDeck ?? {}).map(Number).sort((a, b) => a - b),
    attachedSnapPoints: (o.AttachedSnapPoints ?? []).map((snap, index) => snapPoint(snap, index, 'object-local')),
    attachedDecals: (o.AttachedDecals ?? []).map((decal, index) => ({
      index,
      name: decal.CustomDecal?.Name ?? '',
      imageUrl: decal.CustomDecal?.ImageURL ?? '',
      size: decal.CustomDecal?.Size ?? null,
      transform: decal.Transform ? {
        pos: [decal.Transform.posX, decal.Transform.posY, decal.Transform.posZ].map((value) => round(value)),
        rot: [decal.Transform.rotX, decal.Transform.rotY, decal.Transform.rotZ].map((value) => round(value)),
        scale: [decal.Transform.scaleX, decal.Transform.scaleY, decal.Transform.scaleZ].map((value) => round(value)),
      } : null,
    })),
    assetUrls: [...(objectAssetUrls.get(record.objectPath) ?? [])].sort(),
    lua: {
      bytes: Buffer.byteLength(o.LuaScript ?? '', 'utf8'),
      sha256: sha256Buffer(Buffer.from(o.LuaScript ?? '', 'utf8')),
      embeddedUrls: [...new Set([...(o.LuaScript ?? '').matchAll(URL_RE)].map((match) => normalizeHost(match[0].replace(/[),;]+$/, ''))))].sort(),
    },
  };
});

const rawDecks = records
  .filter(({ object: candidate }) => candidate.Name === 'Deck' || candidate.Name === 'DeckCustom')
  .map((record) => ({
    path: record.objectPath,
    guid: record.object.GUID,
    nickname: record.object.Nickname ?? '',
    topLevel: record.relation === 'top',
    tts: transform(record.object),
    customDeckIds: Object.keys(record.object.CustomDeck ?? {}).map(Number).sort((a, b) => a - b),
    cardCount: (record.object.ContainedObjects ?? []).filter((child) => Number.isInteger(child.CardID)).length,
    cardIds: (record.object.ContainedObjects ?? []).filter((child) => Number.isInteger(child.CardID)).map((child) => child.CardID),
  }));

const shared = {
  box: { image: boxAsset.path, imagePx: boxAsset.staged.imagePx, source: 'official English rulebook cover' },
  board,
  solarSystem: {
    center: solarCenter,
    centerArt: solarCenterArt,
    orientationSteps: 8,
    degreesPerStep: 45,
    rotationDegrees: -45,
    rotationOrder: ['disc-1', 'disc-2', 'disc-3'],
    discs,
  },
  sectors,
  playerBoards,
  alienBoards,
  pieces,
  pdfs,
};
const sharedHash = sha256Json(shared);

const counts = {
  topLevelObjects: save.ObjectStates.length,
  recursiveObjects: records.length,
  containedRecords: containedEdges,
  alternateStateRecords: stateEdges,
  uniqueGuids: Object.keys(guidCounts).length,
  duplicateGuidValues: Object.values(guidCounts).filter((count) => count > 1).length,
  rootSnapPoints: save.SnapPoints?.length ?? 0,
  topLevelDecks: save.ObjectStates.filter((candidate) => candidate.Name === 'Deck' || candidate.Name === 'DeckCustom').length,
  recursiveDecks: rawDecks.length,
  projectBase: baseProjects.length,
  projectPromos: projectPromos.length,
  alienCards: alienDecks.reduce((sum, deck) => sum + deck.count, 0),
  technologyStacks: technologyStacks.length,
  technologyTiles: technologyStacks.reduce((sum, stack) => sum + stack.count, 0),
  soloObjectives: objectives.length,
  rivalActions: rivalActions.length,
  sourceAssets: sourceAssets.length,
  sourceAssetsCached: sourceAssets.filter((asset) => asset.status === 'cached').length,
  sourceAssetsKnownUnavailable: sourceAssets.filter((asset) => asset.status === 'known-unavailable').length,
  stagedAssets: stagedAssets.length,
};
assert(counts.rootSnapPoints === 45, `expected 45 root snap points, got ${counts.rootSnapPoints}`);
assert(counts.topLevelDecks === 25, `expected 25 top-level decks, got ${counts.topLevelDecks}`);
assert(counts.uniqueGuids === 785, `expected 785 unique GUIDs, got ${counts.uniqueGuids}`);
assert(counts.duplicateGuidValues === 61, `expected 61 duplicate GUID values, got ${counts.duplicateGuidValues}`);

const cardsGolden = {
  schemaVersion: 1,
  source: {
    workshopId: WORKSHOP_ID,
    saveSha256: sha256Buffer(saveBytes),
    englishProjectDeckGuid: '875db8',
    identity: 'TTS CardID -> CustomDeck sheet + zero-based cell; never contained-object order',
  },
  ocrAid: {
    present: ocrRows.length > 0,
    source: ocrRows.length ? path.relative(ROOT, OCR_FILE).replaceAll('\\', '/') : null,
    rows: ocrRows.length,
    authority: 'non-authoritative hint only; authentic art and official rules win',
  },
  counts: {
    baseProjects: baseProjects.length,
    promoProjects: projectPromos.length,
    alienCards: alienDecks.reduce((sum, deck) => sum + deck.count, 0),
    technologyStacks: technologyStacks.length,
    technologyTiles: technologyStacks.reduce((sum, stack) => sum + stack.count, 0),
    incomeCards: incomeCards.length,
  },
  sheets: Object.fromEntries(Object.entries(cardSheets).sort(([a], [b]) => a.localeCompare(b))),
  projects: {
    base: baseProjects,
    promos: projectPromos,
  },
  alienDecks,
  technologyStacks,
  incomeCards,
  transcriptionGaps: [
    'Project costs, sector colors, free corners, card types, conditions, and typed effects require art/rules verification; OCR text is not legality data.',
    'All 55 alien card effects and all 48 technology tile fronts still require typed transcription from authentic art.',
    'Printed card numbers other than the confirmed Lunar Gateway replacement number 117 are not inferred from sheet order.',
  ],
};

const soloGolden = {
  schemaVersion: 1,
  source: {
    workshopId: WORKSHOP_ID,
    backupBagGuid: '382b8f',
    liveBoardBagGuid: '52427b',
  },
  counts: { rivalBoards: rivalBoards.length, objectives: objectives.length, rivalActions: rivalActions.length },
  rivalBoards,
  rivalActions,
  objectives,
  objectiveBacks: {
    status: 'unavailable-in-source-cache',
    names: ['Obj1_Back', 'Obj2_Back', 'Obj3_Back'],
    impact: 'hidden stack backs only; every objective front and stable GUID is preserved',
  },
  transcriptionGaps: [
    'Difficulty progress thresholds/rewards, objective composition, and preferred-tech cycles remain printed-board transcription.',
    'Rival action instructions and all 24 objective conditions remain printed-art transcription.',
  ],
};

const dataGolden = {
  schemaVersion: 1,
  source: {
    workshopId: WORKSHOP_ID,
    saveName: save.SaveName,
    gameMode: save.GameMode,
    saveDate: save.Date,
    versionNumber: save.VersionNumber,
    saveSha256: sha256Buffer(saveBytes),
    communityMod: true,
  },
  sharedHash,
  counts,
  typeCounts: Object.fromEntries(Object.entries(typeCounts).sort(([a], [b]) => a.localeCompare(b))),
  assertions: {
    projectCards: '138 base + 2 optional promos',
    technology: '12 stacks x 4 tiles',
    alienCards: 55,
    solo: '24 objectives + 19 rival actions',
    mainBoardSnaps: 102,
    playerBoardSnaps: Object.fromEntries(playerBoards.map((item) => [item.color, item.snapPoints.length])),
    alienBoardSnaps: Object.fromEntries(alienBoards.map((item) => [item.id, item.snapPoints.length])),
    sectorCapacities: Object.fromEntries(sectors.map((item) => [item.id, item.capacity])),
    unexpectedMissingAssets: 0,
  },
  rootSnapPoints: (save.SnapPoints ?? []).map((snap, index) => snapPoint(snap, index, 'tts-world')),
  shared,
  gameplayTokens: {
    tokens,
    samples,
    exofossil: { count: exofossilDeck.ContainedObjects.length, face: exofossilFace.path, guid: exofossilDeck.GUID },
    exertianMilestones,
    goldTiles,
  },
  inventories: {
    decks: rawDecks,
    objects: rawObjects,
    sourceAssets,
  },
  extractionGaps: [
    'The three dead solo objective-back decals have no equivalent in the local mod; all objective fronts are staged.',
    'A typed 24-cell solar support/bump lookup still needs to be sampled from the staged lossless alpha discs and verified against TTS rotation behavior.',
    'Printed planet/moon rewards, board snap semantics, technology effects, card effects, and alien/solo rules remain transcription tasks.',
  ],
};

const scene = {
  schemaVersion: 1,
  source: {
    workshopId: WORKSHOP_ID,
    saveSha256: sha256Buffer(saveBytes),
    extractor: 'tools/tts-extract/extract-seti.mjs',
  },
  sharedHash,
  assets: stagedAssets.sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id)),
  ...shared,
  decks: {
    sheets: cardsGolden.sheets,
    projects: {
      deckGuid: '875db8',
      baseCount: baseProjects.length,
      promoCount: projectPromos.length,
      base: baseProjects,
      promos: projectPromos,
    },
    aliens: alienDecks,
    technologyStacks,
    incomeCards,
  },
  tokens: dataGolden.gameplayTokens,
  solo: {
    rivalBoards,
    rivalActionSheet: rivalActionSheet.face,
    rivalActionBack: rivalActionSheet.back,
    rivalActions,
    objectives,
  },
  playerAidImage: {
    path: playerAidImage.path,
    imagePx: playerAidImage.staged.imagePx,
    sourceImagePx: playerAidImage.source.imagePx,
  },
  inventory: counts,
};

// `shared` contains only ids, coordinates, mappings, piece definitions, and
// rules-file references used by both golden and scene. Assert immediately before
// writing so a future refactor cannot silently make the hashes disagree.
assert(dataGolden.sharedHash === scene.sharedHash, 'golden/scene shared hash mismatch');
assert(sha256Json(dataGolden.shared) === scene.sharedHash, 'golden shared payload hash mismatch');

writeJson(path.join(GOLDEN, 'cards.json'), cardsGolden);
writeJson(path.join(GOLDEN, 'solo.json'), soloGolden);
writeJson(path.join(GOLDEN, 'seti-data.json'), dataGolden);
writeJson(path.join(OUT, 'scene.json'), scene);

console.log(JSON.stringify({
  workshopId: WORKSHOP_ID,
  saveSha256: sha256Buffer(saveBytes),
  sharedHash,
  counts,
  outputs: [
    path.relative(ROOT, path.join(GOLDEN, 'seti-data.json')).replaceAll('\\', '/'),
    path.relative(ROOT, path.join(GOLDEN, 'cards.json')).replaceAll('\\', '/'),
    path.relative(ROOT, path.join(GOLDEN, 'solo.json')).replaceAll('\\', '/'),
    path.relative(ROOT, path.join(OUT, 'scene.json')).replaceAll('\\', '/'),
  ],
}, null, 2));
