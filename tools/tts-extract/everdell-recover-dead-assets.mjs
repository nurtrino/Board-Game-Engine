// Everdell [reworked] (1929354615): three of the mod's uploads are gone from
// Steam's CDN (404 on both mirrors, no Wayback copy). The same art exists in
// the mod's upstream sources, so recover it from there and install it into the
// TTS cache under the ORIGINAL dead URLs' munged names, where the extractors
// expect it:
//  - Newleaf "Inbound Ticket" face (deck 517, 3 copies)  <- Everdell Newleaf
//    Assets (2908989493), card 20400 (single-card sheet).
//  - Through The Seasons spring-rain Farm face (deck 356) <- Everdell: The
//    Complete Collection (3089480585), ToS Farms 3x3 sheet, cell row 0 col 1.
//  - Golden Occupied Tokens diffuse                       <- Everdell Newleaf
//    Assets (2908989493), same object GUID (c6dfd7), earlier upload.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const IMAGES = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Images';
const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
const SRC = process.argv[2]; // dir holding cand-station.png, cand-tos-sheet.png, cand-golden.png

const DEAD = {
  ticket: 'http://cloud-3.steamusercontent.com/ugc/2220899066148233725/F95D16CBF3D82BFCB2A309E41DA3E44857066607/',
  farm: 'http://cloud-3.steamusercontent.com/ugc/2170232209257585218/681A49CADF17917019BD7EF424D7A66C31C7A21B/',
  golden: 'http://cloud-3.steamusercontent.com/ugc/2220899340106768054/73F13D62430139331F5EF43BFC795188CE1985BD/',
};

const install = async (buf, url) => {
  const ext = buf[0] === 0x89 ? '.png' : '.jpg';
  const out = path.join(IMAGES, munge(url) + ext);
  fs.writeFileSync(out, buf);
  console.log('installed', path.basename(out), (buf.length / 1024).toFixed(0) + 'kb');
};

// 1) Inbound Ticket: use the source card as-is.
await install(fs.readFileSync(path.join(SRC, 'cand-station.png')), DEAD.ticket);

// 2) Spring-rain Farm: cut cell (row 0, col 1) out of the 3x3 sheet.
{
  const sheet = sharp(path.join(SRC, 'cand-tos-sheet.png'));
  const { width, height } = await sheet.metadata();
  const cw = Math.floor(width / 3), ch = Math.floor(height / 3);
  const buf = await sheet.extract({ left: cw, top: 0, width: cw, height: ch }).png().toBuffer();
  await install(buf, DEAD.farm);
}

// 3) Golden Occupied Tokens diffuse: use the upstream texture as-is.
await install(fs.readFileSync(path.join(SRC, 'cand-golden.png')), DEAD.golden);
