// Render Politik board interaction coordinates over the authentic source art.
// This is the playbook's geometry diagnostic: every State/station/Seat/price
// marker must land on its printed slot before the runtime renderer is trusted.
// Run: node tools/tts-extract/verify-politik-board.mjs

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const save = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop/3460664356.json'), 'utf8'));
const boardObject = save.ObjectStates.find((object) => object.GUID === '3a55e6');
const munge = (url) => url.replace(/[^A-Za-z0-9]/g, '');
const stem = path.join(MODS, 'Images', munge(boardObject.CustomImage.ImageURL));
const source = ['.jpg', '.png'].map((extension) => stem + extension).find(fs.existsSync);
const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'games/politik/golden/board.json'), 'utf8'));

const circles = [];
const locations = Object.fromEntries([...board.states, ...board.stations].map((location) => [location.id, location]));
for (const [from, to] of board.adjacency ?? []) {
  const a = locations[from]?.px;
  const b = locations[to]?.px;
  if (!a || !b) throw new Error(`Unknown Politik adjacency ${from}-${to}`);
  circles.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ff00ff" stroke-opacity=".32" stroke-width="12"/>`);
}
const mark = (point, label, color, radius = 35, small = false) => {
  const [x, y] = point;
  circles.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" fill-opacity=".18" stroke="${color}" stroke-width="${small ? 6 : 10}"/>`);
  if (label) circles.push(`<text x="${x + radius + 8}" y="${y + 12}" font-family="Arial" font-size="${small ? 24 : 42}" font-weight="700" fill="${color}" stroke="#000" stroke-width="5" paint-order="stroke">${label}</text>`);
};

for (const state of board.states) mark(state.px, state.id, '#00e7ff');
for (const station of board.stations) mark(station.px, station.id, '#ff3bd5', 48);
for (const seat of board.council) mark(seat.px, seat.name, '#5aa7ff', 38);
for (const industry of board.industries) mark(industry.px, industry.name, '#ffb347', 30, true);
for (const base of board.bases) mark(base.px, base.name, '#63ff9c', 30, true);
for (const row of board.priceRows) {
  row.slots.forEach((slot, index) => mark(slot, index === row.start - 1 ? `${row.id} ${index + 1}` : '', '#ffffff', 14, true));
}
for (const [arena, point] of Object.entries(board.powerGrabs)) mark(point, `${arena} Power Grab`, '#ffe45e', 46);
for (const [action, point] of Object.entries(board.nationalActions)) mark(point, action, '#ff8b5e', 34, true);

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="5760" height="3840">${circles.join('')}</svg>`);
const output = path.join(ROOT, 'games/politik/golden/board-overlay.webp');
// sharp reorders resize ahead of composite in one pipeline. Composite at the
// source dimensions first, then resize the completed diagnostic in pass two.
const composed = await sharp(source).composite([{ input: svg }]).png().toBuffer();
await sharp(composed).resize({ width: 2880 }).webp({ quality: 90 }).toFile(output);
console.log(output);
