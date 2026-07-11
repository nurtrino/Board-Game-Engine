// Structural and cross-manifest audit for Bloodborne's staged visual assets.
// This deliberately reads GLB JSON chunks directly, so corrupt compression,
// placeholder meshes, stale counts, aliases, and missing runtime assignments
// fail in CI without needing WebGL or the TTS cache.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = path.join(ROOT, 'client/public');
const defaultMiniDir = path.join(PUBLIC, 'bloodborne/minis');
const defaultSceneFile = path.join(PUBLIC, 'bloodborne/scene.json');

function parseArgs(args) {
  const options = { miniDir: defaultMiniDir, sceneFile: defaultSceneFile };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag !== '--mini-dir' && flag !== '--scene') {
      throw new Error(`unknown argument ${flag}; expected --mini-dir <absolute path> or --scene <absolute path>`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires an absolute path`);
    if (!path.isAbsolute(value)) throw new Error(`${flag} must be an absolute path: ${value}`);
    if (flag === '--mini-dir') options.miniDir = path.normalize(value);
    else options.sceneFile = path.normalize(value);
    index += 1;
  }
  return options;
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Bloodborne asset verification could not start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const MINI_DIR = options.miniDir;
const SCENE_FILE = options.sceneFile;
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = readJsonFile(path.join(MINI_DIR, 'minis-manifest.json'));
const sceneManifest = readJsonFile(SCENE_FILE);
const goldenMinis = readJson('games/bloodborne/golden/minis.json');
const components = readJson('games/bloodborne/golden/components.json');
const hunters = readJson('shared/src/bloodborne/data/hunters.json');
const enemies = readJson('shared/src/bloodborne/data/enemies.json');
const bosses = readJson('shared/src/bloodborne/data/bosses.json');

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const errorMessage = (error) => error instanceof Error ? error.message : String(error);
const publicPath = (urlPath) => {
  const relative = urlPath.replaceAll('\\', '/').replace(/^\/+/, '');
  const miniPrefix = 'bloodborne/minis/';
  if (relative.startsWith(miniPrefix)) return path.join(MINI_DIR, relative.slice(miniPrefix.length).replaceAll('/', path.sep));
  return path.join(PUBLIC, relative.replaceAll('/', path.sep));
};
const resolveModel = (modelSlug) => manifest.aliases[modelSlug] ?? modelSlug;

let meshoptReady = false;
try {
  if (!MeshoptDecoder.supported) throw new Error('WebAssembly is not supported by this Node.js runtime');
  await MeshoptDecoder.ready;
  meshoptReady = true;
} catch (error) {
  check(false, `Meshopt decoder is unavailable: ${errorMessage(error)}`);
}

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch (error) {
  check(false, `WebP decoder is unavailable: ${errorMessage(error)}`);
}

function readGlb(file) {
  const payload = fs.readFileSync(file);
  if (payload.length < 12) throw new Error('truncated GLB header');
  if (payload.subarray(0, 4).toString() !== 'glTF') throw new Error('invalid GLB magic');
  if (payload.readUInt32LE(4) !== 2) throw new Error(`unsupported GLB version ${payload.readUInt32LE(4)}`);
  check(payload.readUInt32LE(8) === payload.length, `${path.basename(file)}: GLB length header is stale`);
  let json;
  let binary;
  let offset = 12;
  while (offset + 8 <= payload.length) {
    const length = payload.readUInt32LE(offset);
    const type = payload.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + length;
    if (chunkEnd > payload.length) throw new Error(`chunk at byte ${offset} extends past end of file`);
    if (type === 0x4e4f534a) {
      if (json) throw new Error('multiple GLB JSON chunks');
      json = JSON.parse(payload.subarray(offset + 8, chunkEnd).toString().trim());
    } else if (type === 0x004e4942) {
      if (binary) throw new Error('multiple GLB BIN chunks');
      binary = payload.subarray(offset + 8, chunkEnd);
    }
    offset = chunkEnd;
  }
  if (offset !== payload.length) throw new Error(`truncated GLB chunk header at byte ${offset}`);
  if (!json) throw new Error('missing GLB JSON chunk');
  if (!binary) throw new Error('missing GLB BIN chunk');
  return { payload, json, binary };
}

function bufferSlice(json, binary, bufferIndex, byteOffset, byteLength, label) {
  if (!Number.isSafeInteger(bufferIndex) || bufferIndex < 0) throw new Error(`${label} has an invalid buffer index`);
  const buffer = json.buffers?.[bufferIndex];
  if (!buffer) throw new Error(`${label} references missing buffer ${bufferIndex}`);
  if (buffer.uri !== undefined) throw new Error(`${label} references external buffer ${bufferIndex}`);
  if (bufferIndex !== 0) throw new Error(`${label} references buffer ${bufferIndex}, but a GLB has only one embedded BIN chunk`);
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0) throw new Error(`${label} has invalid byteOffset ${byteOffset}`);
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) throw new Error(`${label} has invalid byteLength ${byteLength}`);
  const end = byteOffset + byteLength;
  if (!Number.isSafeInteger(end) || end > buffer.byteLength || end > binary.length) {
    throw new Error(`${label} byte range ${byteOffset}..${end} exceeds buffer length ${buffer.byteLength}`);
  }
  return binary.subarray(byteOffset, end);
}

async function decodeWebp(payload, label) {
  const pipeline = sharp(payload, { failOn: 'warning' });
  const metadata = await pipeline.metadata();
  if (metadata.format !== 'webp') throw new Error(`${label} contains ${metadata.format ?? 'unknown'} data instead of WebP`);
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  if (!Number.isSafeInteger(info.width) || info.width <= 0 || !Number.isSafeInteger(info.height) || info.height <= 0) {
    throw new Error(`${label} decoded to invalid dimensions ${info.width}x${info.height}`);
  }
  const expectedBytes = info.width * info.height * info.channels;
  if (!Number.isSafeInteger(expectedBytes) || data.length !== expectedBytes) {
    throw new Error(`${label} decoded byte count ${data.length} != ${expectedBytes}`);
  }
  const channelMin = Array(info.channels).fill(255);
  const channelMax = Array(info.channels).fill(0);
  for (let offset = 0; offset < data.length; offset += info.channels) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      channelMin[channel] = Math.min(channelMin[channel], data[offset + channel]);
      channelMax[channel] = Math.max(channelMax[channel], data[offset + channel]);
    }
  }
  const hasAlpha = info.channels === 2 || info.channels === 4;
  let alphaMin = 255;
  let alphaMax = 255;
  if (hasAlpha) {
    alphaMin = channelMin[info.channels - 1];
    alphaMax = channelMax[info.channels - 1];
  }
  return { ...info, hasAlpha, alphaMin, alphaMax, channelMin, channelMax };
}

function textureImageIndex(json, textureInfo, label) {
  const textureIndex = textureInfo?.index;
  if (!Number.isSafeInteger(textureIndex) || textureIndex < 0) {
    throw new Error(`${label} has no valid texture index`);
  }
  const texture = json.textures?.[textureIndex];
  if (!texture) throw new Error(`${label} references missing texture ${textureIndex}`);
  const imageIndex = texture.extensions?.EXT_texture_webp?.source ?? texture.source;
  if (!Number.isSafeInteger(imageIndex) || imageIndex < 0 || !json.images?.[imageIndex]) {
    throw new Error(`${label} texture ${textureIndex} references missing image ${imageIndex}`);
  }
  return imageIndex;
}

check(manifest.version === 2, 'mini manifest must be version 2');
check(manifest.format === 'glb', 'mini manifest must declare GLB format');
check(sceneManifest.minis?.manifest === '/bloodborne/minis/minis-manifest.json', 'scene manifest does not reference mini manifest');
check(sceneManifest.minis?.models === Object.keys(manifest.models).length, 'scene manifest model count is stale');
check(sceneManifest.minis?.standees === Object.keys(manifest.standees).length, 'scene manifest standee count is stale');

const modelHashes = new Map();
let totalBytes = 0;
let totalVertices = 0;
let totalTriangles = 0;
let totalMaterials = 0;
let totalAlphaMaterials = 0;
let totalNormalMaterials = 0;
let totalMetalRoughMaterials = 0;
let totalEmissiveMaterials = 0;
let meshoptBufferViews = 0;
let decodedMeshoptBufferViews = 0;
let embeddedWebpImages = 0;
let decodedEmbeddedWebpImages = 0;
let decodedStandeeWebpImages = 0;
let decodedAlphaMasks = 0;
let verifiedAlphaCutouts = 0;
let verifiedNormalMaps = 0;
for (const [modelSlug, entry] of Object.entries(manifest.models)) {
  const file = publicPath(entry.file);
  check(fs.existsSync(file), `${modelSlug}: missing ${entry.file}`);
  if (!fs.existsSync(file)) continue;
  let glb;
  try {
    glb = readGlb(file);
  } catch (error) {
    check(false, `${modelSlug}: GLB parse failed: ${errorMessage(error)}`);
    continue;
  }
  const { payload, json, binary } = glb;
  const digest = sha256(payload);
  check(payload.length === entry.bytes, `${modelSlug}: byte count ${entry.bytes} != ${payload.length}`);
  check(digest === entry.sha256, `${modelSlug}: SHA-256 mismatch`);
  check(entry.vertices >= 1_000, `${modelSlug}: suspicious placeholder vertex count ${entry.vertices}`);
  check(entry.triangles >= 1_000, `${modelSlug}: suspicious placeholder triangle count ${entry.triangles}`);
  check(entry.parts >= 2, `${modelSlug}: incomplete multipart export (${entry.parts} part)`);
  check(entry.bounds?.size?.length === 3 && entry.bounds.size.every((n) => Number.isFinite(n) && n > 0), `${modelSlug}: invalid bounds`);
  check(json.extensionsRequired?.includes('EXT_meshopt_compression'), `${modelSlug}: Meshopt is not required`);
  check(json.extensionsUsed?.includes('EXT_texture_webp'), `${modelSlug}: WebP textures are not used`);
  check((json.images ?? []).every((image) => image.mimeType === 'image/webp'), `${modelSlug}: contains a non-WebP texture`);
  check(!(json.nodes ?? []).some((node) => {
    const leaf = (node.name ?? '').replace(/^\d+-/, '').replace(/\.obj$/i, '').toLowerCase();
    return ['default', 'collider', 'colider'].includes(leaf);
  }), `${modelSlug}: collider/default mesh leaked into GLB`);

  for (const [bufferViewIndex, bufferView] of (json.bufferViews ?? []).entries()) {
    const extension = bufferView.extensions?.EXT_meshopt_compression;
    if (!extension) continue;
    meshoptBufferViews += 1;
    if (!meshoptReady) continue;
    try {
      if (!Number.isSafeInteger(extension.count) || extension.count <= 0) throw new Error(`invalid count ${extension.count}`);
      if (!Number.isSafeInteger(extension.byteStride) || extension.byteStride <= 0) throw new Error(`invalid byteStride ${extension.byteStride}`);
      const decodedLength = extension.count * extension.byteStride;
      if (!Number.isSafeInteger(decodedLength) || decodedLength !== bufferView.byteLength) {
        throw new Error(`decoded byte count ${decodedLength} != bufferView byteLength ${bufferView.byteLength}`);
      }
      const source = bufferSlice(
        json,
        binary,
        extension.buffer,
        extension.byteOffset ?? 0,
        extension.byteLength,
        `Meshopt bufferView ${bufferViewIndex}`,
      );
      const target = new Uint8Array(decodedLength);
      MeshoptDecoder.decodeGltfBuffer(
        target,
        extension.count,
        extension.byteStride,
        source,
        extension.mode,
        extension.filter ?? 'NONE',
      );
      decodedMeshoptBufferViews += 1;
    } catch (error) {
      check(false, `${modelSlug}: Meshopt bufferView ${bufferViewIndex} failed to decode: ${errorMessage(error)}`);
    }
  }

  const decodedImages = new Map();
  for (const [imageIndex, image] of (json.images ?? []).entries()) {
    if (!Number.isSafeInteger(image.bufferView)) {
      check(false, `${modelSlug}: image ${imageIndex} is not embedded in a bufferView`);
      continue;
    }
    embeddedWebpImages += 1;
    if (!sharp) continue;
    try {
      const bufferView = json.bufferViews?.[image.bufferView];
      if (!bufferView) throw new Error(`references missing bufferView ${image.bufferView}`);
      if (bufferView.extensions?.EXT_meshopt_compression) throw new Error('image bufferView is unexpectedly Meshopt-compressed');
      const source = bufferSlice(
        json,
        binary,
        bufferView.buffer,
        bufferView.byteOffset ?? 0,
        bufferView.byteLength,
        `image ${imageIndex}`,
      );
      const decoded = await decodeWebp(source, `image ${imageIndex}`);
      decodedImages.set(imageIndex, decoded);
      decodedEmbeddedWebpImages += 1;
    } catch (error) {
      check(false, `${modelSlug}: embedded WebP image ${imageIndex} failed to decode: ${errorMessage(error)}`);
    }
  }

  const materials = json.materials ?? [];
  const materialCounts = {
    materials: materials.length,
    alphaMaterials: materials.filter((material) => material.alphaMode === 'MASK').length,
    normalMaterials: materials.filter((material) => material.normalTexture).length,
    metalRoughMaterials: materials.filter((material) => material.pbrMetallicRoughness?.metallicRoughnessTexture).length,
    emissiveMaterials: materials.filter((material) => (
      material.emissiveTexture || material.emissiveFactor?.some((value) => value > 0)
    )).length,
  };
  for (const [field, actual] of Object.entries(materialCounts)) {
    check(entry[field] === actual, `${modelSlug}: manifest ${field} ${entry[field]} != GLB ${actual}`);
    const sourceField = `source${field[0].toUpperCase()}${field.slice(1)}`;
    check(Number.isSafeInteger(entry[sourceField]) && entry[sourceField] >= actual,
      `${modelSlug}: source ${field} ${entry[sourceField]} cannot account for GLB ${actual}`);
    if (entry[sourceField] > 0) {
      check(actual > 0, `${modelSlug}: optimizer dropped every source ${field}`);
    }
  }

  for (const [materialIndex, material] of materials.entries()) {
    if (material.alphaMode !== 'MASK') continue;
    const cutoff = material.alphaCutoff ?? 0.5;
    check(Number.isFinite(cutoff) && cutoff >= 0 && cutoff <= 1,
      `${modelSlug}: MASK material ${materialIndex} has invalid alpha cutoff ${cutoff}`);
    try {
      const imageIndex = textureImageIndex(
        json,
        material.pbrMetallicRoughness?.baseColorTexture,
        `MASK material ${materialIndex} base color`,
      );
      if (sharp) {
        const decoded = decodedImages.get(imageIndex);
        if (!decoded) throw new Error(`base color image ${imageIndex} was not decoded`);
        decodedAlphaMasks += 1;
        // WebP encoders may omit a provably opaque alpha plane. Whenever a
        // source actually contains non-opaque pixels, both sides of the MASK
        // threshold must survive compression so silhouettes and cast shadows
        // use the same cutout.
        if (decoded.hasAlpha && decoded.alphaMin < 255) {
          const threshold = cutoff * 255;
          if (!(decoded.alphaMin < threshold && decoded.alphaMax >= threshold)) {
            throw new Error(
              `base color image ${imageIndex} alpha ${decoded.alphaMin}..${decoded.alphaMax} does not cross cutoff ${cutoff}`,
            );
          }
          verifiedAlphaCutouts += 1;
        }
      }
    } catch (error) {
      check(false, `${modelSlug}: MASK material ${materialIndex} cannot render a cutout: ${errorMessage(error)}`);
    }
  }

  for (const [materialIndex, material] of materials.entries()) {
    if (!material.normalTexture) continue;
    try {
      const imageIndex = textureImageIndex(json, material.normalTexture, `normal material ${materialIndex}`);
      if (sharp) {
        const decoded = decodedImages.get(imageIndex);
        if (!decoded) throw new Error(`normal image ${imageIndex} was not decoded`);
        if (decoded.channels < 3) throw new Error(`normal image ${imageIndex} has ${decoded.channels} channels`);
        const ranges = decoded.channelMax.slice(0, 3).map((value, channel) => value - decoded.channelMin[channel]);
        const xyRange = Math.max(ranges[0], ranges[1]);
        // A zero bump scale intentionally produces a flat (constant) normal,
        // and very shallow maps can quantize to constant Z. Reject the legacy
        // Unity layouts only when detail exists but X or reconstructed Z is
        // absent.
        if ((ranges[0] <= 2 && ranges[1] > 16) || (ranges[2] <= 0 && xyRange > 16)) {
          throw new Error(
            `normal image ${imageIndex} channel ranges ${ranges.join('/')} look like packed Unity data instead of reconstructed RGB`,
          );
        }
        if (decoded.channelMin[2] < 112) {
          throw new Error(`normal image ${imageIndex} contains invalid negative-Z texels (${decoded.channelMin[2]})`);
        }
        verifiedNormalMaps += 1;
      }
    } catch (error) {
      check(false, `${modelSlug}: normal material ${materialIndex} is invalid: ${errorMessage(error)}`);
    }
  }

  let vertices = 0;
  let triangles = 0;
  let primitives = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitives += 1;
      vertices += json.accessors[primitive.attributes.POSITION].count;
      if (primitive.indices !== undefined) triangles += json.accessors[primitive.indices].count / 3;
    }
  }
  check(vertices === entry.vertices, `${modelSlug}: manifest vertices ${entry.vertices} != GLB ${vertices}`);
  check(triangles === entry.triangles, `${modelSlug}: manifest triangles ${entry.triangles} != GLB ${triangles}`);
  check(primitives === entry.primitives, `${modelSlug}: manifest primitives ${entry.primitives} != GLB ${primitives}`);
  check((json.images ?? []).length === entry.textures, `${modelSlug}: manifest textures ${entry.textures} != GLB ${(json.images ?? []).length}`);

  if (!modelHashes.has(digest)) modelHashes.set(digest, []);
  modelHashes.get(digest).push(modelSlug);
  totalBytes += payload.length;
  totalVertices += vertices;
  totalTriangles += triangles;
  totalMaterials += materialCounts.materials;
  totalAlphaMaterials += materialCounts.alphaMaterials;
  totalNormalMaterials += materialCounts.normalMaterials;
  totalMetalRoughMaterials += materialCounts.metalRoughMaterials;
  totalEmissiveMaterials += materialCounts.emissiveMaterials;
}

for (const [digest, modelSlugs] of modelHashes) {
  check(modelSlugs.length === 1, `duplicate GLBs should be aliases (${digest.slice(0, 12)}: ${modelSlugs.join(', ')})`);
}

for (const [alias, canonical] of Object.entries(manifest.aliases)) {
  check(Boolean(manifest.models[canonical]), `${alias}: alias target ${canonical} does not exist`);
  check(!manifest.models[alias], `${alias}: alias also has a duplicate model file`);
}
for (const modelSlug of Object.keys(goldenMinis)) {
  check(Boolean(manifest.models[resolveModel(modelSlug)]), `${modelSlug}: golden mini is not represented by a model or alias`);
}
const byBundle = new Map();
for (const [modelSlug, source] of Object.entries(goldenMinis)) {
  if (!byBundle.has(source.bundle)) byBundle.set(source.bundle, []);
  byBundle.get(source.bundle).push(modelSlug);
}
for (const modelSlugs of byBundle.values()) {
  const targets = new Set(modelSlugs.map(resolveModel));
  check(targets.size === 1, `same source bundle maps to multiple GLBs: ${modelSlugs.join(', ')}`);
}

for (const [standeeSlug, entry] of Object.entries(manifest.standees)) {
  const file = publicPath(entry.file);
  check(fs.existsSync(file), `${standeeSlug}: standee is missing`);
  if (!fs.existsSync(file)) continue;
  const payload = fs.readFileSync(file);
  check(payload.length === entry.bytes, `${standeeSlug}: standee byte count is stale`);
  check(sha256(payload) === entry.sha256, `${standeeSlug}: standee SHA-256 mismatch`);
  check(entry.width > 0 && entry.height > 0, `${standeeSlug}: invalid standee dimensions`);
  if (sharp) {
    try {
      const info = await decodeWebp(payload, `${standeeSlug} standee`);
      check(info.width === entry.width && info.height === entry.height, `${standeeSlug}: standee dimensions ${entry.width}x${entry.height} != decoded ${info.width}x${info.height}`);
      decodedStandeeWebpImages += 1;
    } catch (error) {
      check(false, `${standeeSlug}: standee WebP failed to decode: ${errorMessage(error)}`);
    }
  }
  totalBytes += payload.length;
}

const expectedRuntime = {
  hunters: Object.fromEntries(Object.entries(hunters).map(([id, value]) => [id, resolveModel(value.art.mini)])),
  enemies: Object.fromEntries(Object.entries(enemies).map(([id, value]) => [id, value.mini ? resolveModel(value.mini) : id === 'iosefka' ? null : id])),
  bosses: Object.fromEntries(Object.entries(bosses).map(([id, value]) => [id, resolveModel(value.mini ?? id)])),
};
for (const [kind, expected] of Object.entries(expectedRuntime)) {
  const actual = manifest.runtime[kind];
  check(JSON.stringify(actual) === JSON.stringify(expected), `${kind}: runtime mini assignments are stale`);
  for (const [id, modelSlug] of Object.entries(actual)) {
    if (modelSlug) check(Boolean(manifest.models[modelSlug]), `${kind}.${id}: model ${modelSlug} is missing`);
    else check(Boolean(manifest.standees[id]), `${kind}.${id}: needs a model or standee`);
  }
}

for (const [id, component] of Object.entries(components.hunters)) {
  const expected = resolveModel(component.hunterMini);
  check(Object.values(expectedRuntime.hunters).includes(expected), `${id}: hunter golden/shared mini mismatch`);
}
for (const [id, component] of Object.entries(components.enemies)) {
  if (component.mini && enemies[id]) check(resolveModel(component.mini) === expectedRuntime.enemies[id], `${id}: enemy golden/shared mini mismatch`);
}
for (const [id, component] of Object.entries(components.bosses)) {
  if (component.mini && bosses[id]) check(resolveModel(component.mini) === expectedRuntime.bosses[id], `${id}: boss golden/shared mini mismatch`);
}

function collectRelPaths(value, output = []) {
  if (Array.isArray(value)) value.forEach((item) => collectRelPaths(item, output));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'rel' && typeof child === 'string') output.push(child);
      else collectRelPaths(child, output);
    }
  }
  return output;
}
for (const rel of new Set(collectRelPaths(sceneManifest))) {
  check(fs.existsSync(publicPath(rel)), `scene manifest asset is missing: ${rel}`);
}

const legacy = fs.readdirSync(MINI_DIR).filter((file) => /\.(obj|jpg)$/i.test(file));
check(legacy.length === 0, `obsolete mini OBJ/JPG files remain: ${legacy.join(', ')}`);
const glbs = fs.readdirSync(MINI_DIR).filter((file) => file.endsWith('.glb'));
check(glbs.length === Object.keys(manifest.models).length, `orphan/missing GLB files: directory=${glbs.length}, manifest=${Object.keys(manifest.models).length}`);

check(manifest.totals.models === Object.keys(manifest.models).length, 'manifest total model count is stale');
check(manifest.totals.aliases === Object.keys(manifest.aliases).length, 'manifest total alias count is stale');
check(manifest.totals.standees === Object.keys(manifest.standees).length, 'manifest total standee count is stale');
check(manifest.totals.bytes === totalBytes, `manifest total bytes ${manifest.totals.bytes} != ${totalBytes}`);
check(manifest.totals.vertices === totalVertices, `manifest total vertices ${manifest.totals.vertices} != ${totalVertices}`);
check(manifest.totals.triangles === totalTriangles, `manifest total triangles ${manifest.totals.triangles} != ${totalTriangles}`);
check(manifest.totals.materials === totalMaterials, `manifest total materials ${manifest.totals.materials} != ${totalMaterials}`);
check(manifest.totals.alphaMaterials === totalAlphaMaterials, `manifest total alpha materials ${manifest.totals.alphaMaterials} != ${totalAlphaMaterials}`);
check(manifest.totals.normalMaterials === totalNormalMaterials, `manifest total normal materials ${manifest.totals.normalMaterials} != ${totalNormalMaterials}`);
check(manifest.totals.metalRoughMaterials === totalMetalRoughMaterials, `manifest total metallic/roughness materials ${manifest.totals.metalRoughMaterials} != ${totalMetalRoughMaterials}`);
check(manifest.totals.emissiveMaterials === totalEmissiveMaterials, `manifest total emissive materials ${manifest.totals.emissiveMaterials} != ${totalEmissiveMaterials}`);
if (sharp) {
  check(decodedAlphaMasks === totalAlphaMaterials, `decoded MASK base colors ${decodedAlphaMasks} != ${totalAlphaMaterials}`);
  check(verifiedAlphaCutouts > 0, 'no non-opaque alpha cutout survived WebP compression');
  check(verifiedNormalMaps === totalNormalMaterials, `verified RGB normal maps ${verifiedNormalMaps} != ${totalNormalMaterials}`);
}

if (errors.length) {
  console.error(`Bloodborne asset verification failed (${errors.length}):`);
  errors.forEach((error) => console.error(` - ${error}`));
  process.exit(1);
}

const mib = (totalBytes / 1024 / 1024).toFixed(1);
console.log(`Bloodborne assets OK: ${manifest.totals.models} GLBs + ${manifest.totals.aliases} aliases + ${manifest.totals.standees} standee (${mib} MiB)`);
console.log(`Geometry: ${totalVertices.toLocaleString()} vertices, ${totalTriangles.toLocaleString()} triangles; no placeholders, duplicate GLBs, or legacy OBJ/JPG payloads`);
console.log(`Decoded payloads: ${decodedMeshoptBufferViews.toLocaleString()}/${meshoptBufferViews.toLocaleString()} Meshopt bufferViews, ${decodedEmbeddedWebpImages.toLocaleString()}/${embeddedWebpImages.toLocaleString()} embedded WebP images, ${decodedStandeeWebpImages.toLocaleString()} standee WebP image`);
console.log(`PBR materials: ${totalMaterials.toLocaleString()} total, ${verifiedNormalMaps.toLocaleString()}/${totalNormalMaterials.toLocaleString()} reconstructed RGB normal maps, ${totalMetalRoughMaterials.toLocaleString()} metallic/roughness, ${totalEmissiveMaterials.toLocaleString()} emissive; ${decodedAlphaMasks.toLocaleString()}/${totalAlphaMaterials.toLocaleString()} MASK base colors decoded and ${verifiedAlphaCutouts.toLocaleString()} non-opaque cutouts cross their thresholds`);
console.log(`Runtime coverage: ${Object.keys(hunters).length} hunters, ${Object.keys(enemies).length} enemies, ${Object.keys(bosses).length} bosses`);
