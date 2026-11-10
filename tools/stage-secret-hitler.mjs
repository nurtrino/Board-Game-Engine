// Stages the Secret Hitler Original mod (Workshop 3322335081) for the web client.
// Source: games/secret-hitler/mod-assets (raw files copied from the TTS cache and the mod's CDN).
// Output: client/public/sh (meshes as-is, textures resized, card sheets sliced per the save's CustomDeck grids).
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'games/secret-hitler/mod-assets');
const out = path.join(root, 'client/public/sh');
fs.mkdirSync(path.join(out, 'cards'), { recursive: true });

const S = (f) => path.join(src, f);
const O = (f) => path.join(out, f);

// Meshes are used untouched.
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.obj'))) fs.copyFileSync(S(f), O(f));

// Textures. Flat-colour PNG boards stay lossless; photos go to JPEG.
const tex = [
  ['table.jpg', 'table.jpg', 4096, 'jpg'],
  ['liberal-track.png', 'liberal-track.png', 4096, 'png'],
  ['fascist-track-56.png', 'fascist-track-56.png', 4096, 'png'],
  ['fascist-track-78.png', 'fascist-track-78.png', 4096, 'png'],
  ['fascist-track-910.png', 'fascist-track-910.png', 4096, 'png'],
  ['draw-pile.png', 'draw-pile.png', 1024, 'png'],
  ['discard-pile.png', 'discard-pile.png', 1024, 'png'],
  ['placard-president.jpg', 'placard-president.jpg', 1024, 'jpg'],
  ['placard-chancellor.jpg', 'placard-chancellor.jpg', 1024, 'jpg'],
  ['prev-president.jpg', 'prev-president.jpg', 1024, 'jpg'],
  ['prev-chancellor.jpg', 'prev-chancellor.jpg', 1024, 'jpg'],
  ['envelope.jpg', 'envelope.jpg', 1536, 'jpg'],
  ['banner.jpg', 'banner.jpg', 1024, 'jpg'],
  ...[5, 6, 7, 8, 9, 10].map((n) => [`ballot-box-${n}.jpg`, `ballot-box-${n}.jpg`, 1024, 'jpg']),
];
for (const [from, to, width, fmt] of tex) {
  let p = sharp(S(from)).resize({ width, withoutEnlargement: true });
  p = fmt === 'jpg' ? p.jpeg({ quality: 86 }) : p.png({ compressionLevel: 9 });
  await p.toFile(O(to));
}

// Card sheets. Grid sizes come from the save's CustomDeck entries (NumWidth x NumHeight).
// Cell index = CardID % 100, row-major.
async function slice(sheet, cols, rows, cells, fmt = 'png') {
  const meta = await sharp(S(sheet)).metadata();
  const cw = Math.floor(meta.width / cols);
  const ch = Math.floor(meta.height / rows);
  for (const [idx, name, rotate] of cells) {
    let p = sharp(S(sheet)).extract({ left: (idx % cols) * cw, top: Math.floor(idx / cols) * ch, width: cw, height: ch });
    if (rotate) p = p.rotate(rotate);
    p = fmt === 'jpg' ? p.jpeg({ quality: 88 }) : p.png({ compressionLevel: 9 });
    await p.toFile(O(`cards/${name}.${fmt}`));
  }
}
// Deck 43: role cards, 4x3. Save scripts: 4300 Hitler, 4301-4303 Fascist, 4304-4309 Liberal.
await slice('role-cards.jpg', 4, 3, [
  [0, 'role-hitler'], [1, 'role-fascist-1'], [2, 'role-fascist-2'], [3, 'role-fascist-3'],
  [4, 'role-liberal-1'], [5, 'role-liberal-2'], [6, 'role-liberal-3'], [7, 'role-liberal-4'],
  [8, 'role-liberal-5'], [9, 'role-liberal-6'],
], 'jpg');
// Deck 42: membership, 2x2. 4200 Liberal, 4201 Fascist.
await slice('membership-cards.png', 2, 2, [[0, 'membership-liberal'], [1, 'membership-fascist']]);
// Deck 41: ballots, 2x2. 4100 ja, 4101 nein. Art is drawn sideways in the cell, so stage it upright (landscape).
await slice('ballot-cards.png', 2, 2, [[0, 'ballot-ja', 270], [1, 'ballot-nein', 270]]);
// Decks 46/67/68: policies, 2x2. xx00 Liberal, xx01 Fascist.
await slice('policy-cards.png', 2, 2, [[0, 'policy-liberal'], [1, 'policy-fascist']]);
// Deck 47: Not Hitler (confirmed), 2x2. 4700.
await slice('nothitler-cards.png', 2, 2, [[0, 'nothitler']]);

const backs = [
  ['role-back.jpg', 'cards/role-back.jpg', 0],
  ['membership-back.png', 'cards/membership-back.png', 0],
  ['ballot-back.png', 'cards/ballot-back.png', 270],
  ['policy-back.png', 'cards/policy-back.png', 0],
  ['nothitler-back.png', 'cards/nothitler-back.png', 0],
];
for (const [from, to, rot] of backs) {
  let p = sharp(S(from));
  if (rot) p = p.rotate(rot);
  await p.toFile(O(to));
}

// Cover art for the library tile: the underside of the fascist track carries the game logo.
{
  const meta = await sharp(S('fascist-track-56.png')).metadata();
  const half = Math.floor(meta.height / 2);
  await sharp(S('fascist-track-56.png')).extract({ left: 0, top: half, width: meta.width, height: meta.height - half })
    .resize({ width: 1400 }).jpeg({ quality: 88 }).toFile(O('cover.jpg'));
}

// Square tile art for the game picker: the logo from the underside of the mod's track board,
// centred on its own orange so nothing is cropped.
{
  const meta = await sharp(S('fascist-track-56.png')).metadata();
  const half = Math.floor(meta.height / 2);
  const w = 2200;
  const h = 1100;
  const left = Math.floor((meta.width - w) / 2);
  const top = half + Math.floor((meta.height - half - h) / 2);
  const logo = sharp(S('fascist-track-56.png')).extract({ left, top, width: w, height: h });
  const { data } = await logo.clone().extract({ left: 20, top: 20, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const background = { r: data[0], g: data[1], b: data[2] };
  await logo.resize({ width: 1024, height: 1024, fit: 'contain', background }).jpeg({ quality: 90 }).toFile(O('box.jpg'));
}

const files = fs.readdirSync(out, { recursive: true }).filter((f) => fs.statSync(path.join(out, f)).isFile());
const bytes = files.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log(`staged ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB -> client/public/sh`);
