// Render a scenario's zone-assigned setup onto the full map art: one label
// block per space listing its starting units, colored per power, anchored at
// the zone center. The reviewable proof that every zone's setup is right.
// Run: node tools/verify/render-axis-setup.mjs [1941|1942]
// Output: client/public/axis/setup-<scen>.png (full 9500px, browser-zoomable)

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const scen = process.argv[2] ?? '1941';
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'games/axis-allies/golden/map.json'), 'utf8'));
const setup = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/src/axis/setup-data.json'), 'utf8'))[scen];
if (!setup) { console.error('no setup for', scen); process.exit(1); }

const CENTER = {};
for (const t of map.territories) CENTER[t.id] = [t.center.px, t.center.py];
for (const z of map.seaZones) CENTER[z.id] = [z.center.px, z.center.py];
// same archipelago anchors the renderer/extractor use
CENTER['new-guinea'] = [7500, 4050];
CENTER['solomon-islands'] = [8290, 4230];

const POWER_HEX = {
  germany: '#1c1c20', ussr: '#8c2f3a', japan: '#b35a22', uk: '#a8905c',
  italy: '#5a3d22', usa: '#2f5e2a', china: '#7da85a', null: '#7d7d7d',
};
const POWER_TEXT = { germany: '#e8e8e8', italy: '#f2e3cf', usa: '#e4f2dc', ussr: '#ffe3e3', japan: '#ffe9d2', uk: '#141210', china: '#15200f', null: '#111' };
const ABBR = {
  infantry: 'inf', artillery: 'art', tank: 'tnk', aaGun: 'AA', factory: 'IC',
  fighter: 'ftr', bomber: 'bmr', battleship: 'BB', carrier: 'CV', cruiser: 'CA',
  destroyer: 'DD', submarine: 'SS', transport: 'TP',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let svgParts = [];

for (const [space, stacks] of Object.entries(setup.units)) {
  const c = CENTER[space];
  if (!c) { console.warn('no center for', space); continue; }
  // group lines by power
  const byPower = new Map();
  for (const st of stacks) {
    const key = st.power ?? 'null';
    if (!byPower.has(key)) byPower.set(key, []);
    let line = `${st.count} ${ABBR[st.key] ?? st.key}`;
    if (st.cargo?.length) line += `(${st.cargo.map((k) => `${k.count} ${ABBR[k.key] ?? k.key}`).join('+')})`;
    byPower.get(key).push(line);
  }
  const rows = [...byPower.entries()].map(([p, lines]) => ({ p, text: lines.join(' · ') }));
  const w = Math.max(...rows.map((r) => r.text.length)) * 13 + 16;
  const rowH = 26;
  const h = rows.length * rowH + 6;
  const x = Math.round(c[0] - w / 2);
  const y = Math.round(c[1] + 26); // below the roundel/label
  let block = `<g>`;
  block += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="rgba(255,255,255,0.88)" stroke="#222" stroke-width="2"/>`;
  rows.forEach((r, i) => {
    const ry = y + 4 + i * rowH;
    block += `<rect x="${x + 3}" y="${ry}" width="${w - 6}" height="${rowH - 3}" rx="4" fill="${POWER_HEX[r.p]}"/>`;
    block += `<text x="${x + w / 2}" y="${ry + rowH - 10}" font-family="Arial" font-size="19" font-weight="bold" fill="${POWER_TEXT[r.p]}" text-anchor="middle">${esc(r.text)}</text>`;
  });
  block += `</g>`;
  svgParts.push(block);
  // a marker dot on the exact center
  svgParts.push(`<circle cx="${c[0]}" cy="${c[1]}" r="7" fill="#ff3333" stroke="#fff" stroke-width="2"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${map.art.width}" height="${map.art.height}">${svgParts.join('')}</svg>`;
const out = path.join(ROOT, `client/public/axis/setup-${scen}.png`);
await sharp(path.join(ROOT, 'client/public/axis/map-full.jpg'))
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log('written', out);

// text listing for the terminal
const ids = Object.keys(setup.units).sort();
for (const space of ids) {
  const line = setup.units[space]
    .map((st) => `${st.power ?? '—'} ${st.count}x${st.key}${st.cargo?.length ? `[${st.cargo.map((k) => `${k.count}x${k.key}`).join(',')}]` : ''}`)
    .join(', ');
  console.log(space.padEnd(28), line);
}
