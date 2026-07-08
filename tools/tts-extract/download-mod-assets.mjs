// Download every asset a TTS mod references into the local TTS cache, so the
// per-game extractors can run without ever opening TTS. Old mods reference the
// dead cloud-3.steamusercontent.com host; Valve migrated the same paths to
// steamusercontent-a.akamaihd.net, so we rewrite and fetch.
//
// Run: node tools/tts-extract/download-mod-assets.mjs <workshopId>

import fs from 'node:fs';
import path from 'node:path';

const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const id = process.argv[2];
if (!id) { console.error('usage: download-mod-assets.mjs <workshopId>'); process.exit(1); }
const save = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop', `${id}.json`), 'utf8'));

const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
const rewrite = (u) => u
  .replace('http://cloud-3.steamusercontent.com', 'https://steamusercontent-a.akamaihd.net')
  .replace('https://cloud-3.steamusercontent.com', 'https://steamusercontent-a.akamaihd.net');

const wanted = new Map(); // url -> kind
const add = (u, kind) => { if (u && /^https?:/.test(u)) wanted.set(u, kind); };
add(save.TableURL, 'img');
add(save.SkyURL, 'img');
const walk = (o) => {
  if (o.CustomMesh) { add(o.CustomMesh.MeshURL, 'model'); add(o.CustomMesh.DiffuseURL, 'img'); add(o.CustomMesh.NormalURL, 'img'); add(o.CustomMesh.ColliderURL, 'model'); }
  if (o.CustomImage?.ImageURL) add(o.CustomImage.ImageURL, 'img');
  if (o.CustomImage?.ImageSecondaryURL) add(o.CustomImage.ImageSecondaryURL, 'img');
  if (o.CustomDeck) for (const d of Object.values(o.CustomDeck)) { add(d.FaceURL, 'img'); add(d.BackURL, 'img'); }
  if (o.CustomPDF?.PDFUrl) add(o.CustomPDF.PDFUrl, 'pdf');
  if (o.CustomAssetbundle?.AssetbundleURL) add(o.CustomAssetbundle.AssetbundleURL, 'bundle');
  if (o.CustomAssetbundle?.AssetbundleSecondaryURL) add(o.CustomAssetbundle.AssetbundleSecondaryURL, 'bundle');
  for (const c of o.ContainedObjects ?? []) walk(c);
  for (const s of Object.values(o.States ?? {})) walk(s);
};
for (const o of save.ObjectStates) walk(o);

const dirOf = { model: 'Models', pdf: 'PDF', bundle: 'Assetbundles', img: 'Images' };
const extOf = { model: '.obj', pdf: '.PDF', bundle: '.unity3d' };

let done = 0, skipped = 0, failed = 0;
for (const [url, kind] of wanted) {
  const dir = path.join(MODS, dirOf[kind]);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, munge(url));
  // already cached under any plausible extension?
  const exts = kind === 'img' ? ['.png', '.jpg', '.jpeg'] : [extOf[kind]];
  if (exts.some((e) => fs.existsSync(base + e)) || fs.existsSync(base)) { skipped++; continue; }
  try {
    const res = await fetch(rewrite(url));
    if (!res.ok) { console.error('FAIL', res.status, url.slice(-60)); failed++; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    let ext = extOf[kind];
    if (kind === 'img') ext = buf[0] === 0x89 ? '.png' : '.jpg';
    fs.writeFileSync(base + ext, buf);
    done++;
    console.log('ok', kind, (buf.length / 1024).toFixed(0) + 'kb', url.slice(-52));
  } catch (err) {
    console.error('ERR', url.slice(-60), err.message);
    failed++;
  }
}
console.log(`\n${wanted.size} assets: ${done} downloaded, ${skipped} already cached, ${failed} failed`);
process.exit(failed ? 1 : 0);
