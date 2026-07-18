// Ad-hoc: contact sheets of the alive Newleaf + Through The Seasons card faces
// so the two dead sheets (517 / 356) can be identified by elimination.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const IMAGES = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Images';
const OUT = process.argv[2];
const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');

const save = JSON.parse(fs.readFileSync('C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Workshop/1929354615.json', 'utf8'));
const find = (guid) => {
  let hit = null;
  const walk = (o) => {
    if (o.GUID === guid) hit = o;
    for (const c of o.ContainedObjects ?? []) walk(c);
    for (const s of Object.values(o.States ?? {})) walk(s);
  };
  for (const o of save.ObjectStates) walk(o);
  return hit;
};

const sheetsOf = (guid) => {
  const d = find(guid);
  const seen = new Map(); // faceURL -> first deckId
  for (const [k, v] of Object.entries(d.CustomDeck)) {
    if (!seen.has(v.FaceURL)) seen.set(v.FaceURL, k);
  }
  return [...seen.entries()].map(([url, deckId]) => ({ url, deckId }));
};

const cachedFile = (url) => {
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    const p = path.join(IMAGES, munge(url) + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

const CELL_W = 300, CELL_H = 420, PER_ROW = 5, CAP = 28;
const makeSheet = async (name, entries) => {
  const cells = [];
  for (const { url, deckId } of entries) {
    const f = cachedFile(url);
    if (!f) { console.log('MISSING CACHE', deckId, url.slice(-46)); continue; }
    const img = await sharp(f).resize(CELL_W, CELL_H - CAP, { fit: 'contain', background: '#222' }).toBuffer();
    cells.push({ deckId, img });
  }
  const rows = Math.ceil(cells.length / PER_ROW);
  const W = PER_ROW * CELL_W, H = rows * CELL_H;
  const composites = [];
  const svgText = [];
  cells.forEach((c, i) => {
    const x = (i % PER_ROW) * CELL_W, y = Math.floor(i / PER_ROW) * CELL_H;
    composites.push({ input: c.img, left: x, top: y + CAP });
    svgText.push(`<text x="${x + 8}" y="${y + 20}" font-size="18" fill="#fff" font-family="monospace">deck ${c.deckId}</text>`);
  });
  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgText.join('')}</svg>`);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#111' } })
    .composite([...composites, { input: svg, left: 0, top: 0 }])
    .png()
    .toFile(path.join(OUT, name));
  console.log('wrote', name, cells.length, 'cells');
};

await makeSheet('newleaf-alive.png', sheetsOf('f52f98'));
await makeSheet('tts-farms-alive.png', sheetsOf('473f2f'));
