// Turns tools/axis-models/build/<unit>/ into what the client ships: client/public/axis/sim/units/<unit>/
//   model.glb            geometry, part tree and tags, meshopt-compressed (positions stay float: the
//                        stage animates parts about their own pivots, so node transforms must not change)
//   albedo.webp          colour, with the paint mask in alpha (the stage tints where alpha is high)
//   normal.webp
//   orm.webp             r = ambient occlusion, g = roughness, b = metal
//   *-1k.webp            the same at half size, for weak screens
//   info.json            size and triangle count
//
//   node tools/axis-models/pack.mjs            every built unit
//   node tools/axis-models/pack.mjs tank       just these
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = join(HERE, 'build');
const OUT = join(HERE, '..', '..', 'client', 'public', 'axis', 'sim', 'units');
const FULL = 2048;
// WebP throws away the colour under fully transparent pixels, and mask 0 (rubber, skin, wood) must
// keep its colour. So the mask is stored from 16 up, never 0; the stage's shader undoes it.
const MASK_FLOOR = 16;

const want = process.argv.slice(2);
const units = readdirSync(BUILD).filter((d) => existsSync(join(BUILD, d, 'model.glb')) && (want.length === 0 || want.includes(d)));

async function grey(file, size) {
  return sharp(file).resize(size, size, { kernel: 'lanczos3' }).greyscale().raw().toBuffer();
}

async function textures(src, out) {
  for (const [size, tag] of [[FULL, ''], [FULL / 2, '-1k']]) {
    const px = size * size;
    const rgb = await sharp(join(src, 'albedo.png')).resize(size, size, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
    const mask = await grey(join(src, 'mask.png'), size);
    const rgba = Buffer.alloc(px * 4);
    for (let i = 0; i < px; i++) {
      rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = MASK_FLOOR + Math.round((mask[i] * (255 - MASK_FLOOR)) / 255);
    }
    await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).webp({ quality: 88, alphaQuality: 90, effort: 5 }).toFile(join(out, `albedo${tag}.webp`));
    const [ao, rough, metal] = await Promise.all(['ao', 'rough', 'metal'].map((c) => grey(join(src, `${c}.png`), size)));
    const orm = Buffer.alloc(px * 3);
    for (let i = 0; i < px; i++) { orm[i * 3] = ao[i]; orm[i * 3 + 1] = rough[i]; orm[i * 3 + 2] = metal[i]; }
    await sharp(orm, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: 86, effort: 5 }).toFile(join(out, `orm${tag}.webp`));
    await sharp(join(src, 'normal.png')).resize(size, size, { kernel: 'lanczos3' }).removeAlpha().webp({ quality: 92, effort: 5 }).toFile(join(out, `normal${tag}.webp`));
  }
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

for (const unit of units) {
  const src = join(BUILD, unit);
  const out = join(OUT, unit);
  mkdirSync(out, { recursive: true });
  const doc = await io.read(join(src, 'model.glb'));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(join(out, 'model.glb'), doc);
  await textures(src, out);
  const info = JSON.parse(readFileSync(join(src, 'info.json'), 'utf8'));
  writeFileSync(join(out, 'info.json'), JSON.stringify({ triangles: info.triangles, size: info.size, min: info.min, max: info.max }));
  const kb = (f) => Math.round(statSync(join(out, f)).size / 1024);
  console.log(`${unit.padEnd(11)} ${String(info.triangles).padStart(6)} tris  glb ${kb('model.glb')} kB  albedo ${kb('albedo.webp')}  normal ${kb('normal.webp')}  orm ${kb('orm.webp')} kB`);
}
