// Kanban EV board fit diagnostic (playbook §3D/§6): project every world
// spot from the mod's Lua tables through the candidate affine onto the
// board art and draw labelled dots. Eyeball the overlay: dots must sit on
// the printed slots. Run: node tools/tts-extract/fit-kanban-map.mjs
// Refine AX/BX/AY/BY until they do; the client then uses these constants.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '../..');
const sharp = createRequire(path.join(ROOT, 'client/package.json'))('sharp');
const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'games/kanban-ev/golden/layout.json'), 'utf8'));

// art px from world (x, z) — fitted on the shift-bank dividers (z axis)
// and the shift-bank row vs warehouse panels (x axis)
export const AX = -52.7, BX = 2024.2; // px = BX + AX * z
export const AY = -52.7, BY = 1910.7; // py = BY + AY * x
const px = (x, z) => [Math.round(BX + AX * z), Math.round(BY + AY * x)];

const dots = [];
const add = (x, z, color, label) => {
  const [ax, ay] = px(x, z);
  if (ax < 0 || ay < 0 || ax > 4000 || ay > 2234) { console.warn('OFF-BOARD', label, ax, ay); return; }
  dots.push({ ax, ay, color, label });
};

// department workstations
layout.SPOTS.Departments.forEach((row, i) => row.forEach((p, j) => add(p.x, p.z, '#ff2222', `D${i + 1}.${j}`)));
// training tracks
layout.SPOTS.Trainings.forEach((row, i) => row.forEach((p, j) => add(p.x, p.z, '#22ff22', `T${i + 1}.${j}`)));
// shift bank + week + meeting + pace + calendar
layout.SPOTS.Shifts.Positions.forEach((p, j) => add(p.x, p.z, '#2299ff', `S${j}`));
layout.SPOTS.Week.Positions.forEach((p, j) => add(p.x, p.z, '#ffff00', `W${j}`));
layout.SPOTS.Meeting.Positions.forEach((p, j) => add(p.x, p.z, '#ff22ff', `M${j}`));
layout.SPOTS.Pace.Positions.forEach((p, j) => add(p.x, p.z, '#ffffff', `P${j}`));
// warehouses (first spot of each) + recycling
layout.PARTS.Positions.Logistics.forEach((grid, i) => add(grid[2].x, grid[2].z, '#ff8800', `WH${i + 1}`));
layout.PARTS.Positions.Recycling.forEach((p, j) => add(p.x, p.z, '#00ffcc', `R${j}`));
// conveyor nodes + stocks
layout.CARS.Zones.Assembly.forEach((n) => add(n.Position.x, n.Position.z, '#ffaaff', `C${n.Number}`));
// design row zones + upgrades value spots
layout.DESIGNS.Zones.forEach((zn, j) => add(zn.Position.x, zn.Position.z, '#88ff88', `G${j}`));
for (const [name, u] of Object.entries(layout.SPOTS.Upgrades)) add(u.Positions[0].x, u.Positions[0].z, '#8888ff', name.slice(0, 3));
// goals/demands/awards/final
layout.GOALS.Cards.Positions.forEach((p, j) => add(p.x, p.z, '#ffcc00', `PG${j}`));
layout.GOALS.Certifications.Elements.forEach((e, j) => add(e.Position.x, e.Position.z, '#cc00ff', `CG${j}`));
layout.SPOTS.Demands.Positions.forEach((p, j) => add(p.x, p.z, '#00ff00', `DM${j}`));
layout.AWARDS.Positions.forEach((p, j) => add(p.x, p.z, '#ff0088', `AW${j}`));

const svg = `<svg width="4000" height="2234" xmlns="http://www.w3.org/2000/svg">${dots.map((d) =>
  `<circle cx="${d.ax}" cy="${d.ay}" r="14" fill="${d.color}" fill-opacity="0.75" stroke="#000"/>` +
  `<text x="${d.ax + 16}" y="${d.ay + 6}" font-size="26" font-family="monospace" fill="#000" stroke="#fff" stroke-width="0.6">${d.label}</text>`).join('')}</svg>`;

const dst = 'C:/Users/chase/AppData/Local/Temp/claude/C--Users-chase-Desktop-Board-Game-Engine/83cf08bf-c658-49c6-bd83-6309f28971a2/scratchpad/kanban-fit.png';
const overlay = await sharp(Buffer.from(svg)).resize(4000, 2234, { fit: 'fill' }).png().toBuffer();
const full = await sharp(path.join(ROOT, 'client/public/kanban/32CAD5FB0B7ED097F89B4512.jpg'))
  .composite([{ input: overlay, left: 0, top: 0 }])
  .png().toBuffer();
await sharp(full).resize(2000).toFile(dst);
console.log('overlay ->', dst, `(${dots.length} dots)`);
