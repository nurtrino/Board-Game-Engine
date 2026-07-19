// Container (2026) — stage assets from the TTS mod cache (workshop 3745603443,
// "Container (2026) [Scripted]") into client/public/container/ and write the
// golden rules data + scene layout.
//
// Base game only (gold containers / trucks / board expansions excluded).
//
// The water mat (Custom_Tile 49790f, scale 45) carries BOTH islands printed on
// it and is the whole TV table surface. Its art<->world affine is least-squares
// fitted from the 10 island hex rings (colored per seat) matched to the mod's
// 10 zone centers, with an iterative windowed centroid pass (global color
// matching is polluted: teal lagoon water, brown roads). Empirical axis signs:
// art px+ -> world x+, art py+ -> world z- (no flip despite the tile's Y=180).
//
// Player-board art<->local mapping is calibrated from two mod anchors:
// the FREE warehouse slot (starting warehouse at world (6.00,-17.81) on the
// brown board at (0,-21.42) rot180 => local (-6.00,-3.61)) and the $2 factory
// lot (starting container target (2.36,-25.06) => local (-2.36,3.64)).
// Slot art-pixel centers below were measured on grid overlays.
//
// Idempotent: re-runs overwrite staged outputs from the same cached inputs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/container');
const GOLDEN_DIR = path.join(ROOT, 'games/container/golden');

const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
const cached = (dir, url, exts) => {
  for (const ext of exts) {
    const f = path.join(MODS, dir, munge(url) + ext);
    if (fs.existsSync(f)) return f;
  }
  throw new Error(`not cached: ${url}`);
};
const img = (url) => cached('Images', url, ['.png', '.jpg', '.jpeg']);
const model = (url) => cached('Models', url, ['.obj']);

for (const d of [OUT, path.join(OUT, 'cards'), path.join(OUT, 'models'), GOLDEN_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const mod = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop/3745603443.json'), 'utf8'));
const byGuid = {};
{
  const walk = (o) => { byGuid[o.GUID] = o; for (const c of o.ContainedObjects ?? []) walk(c); };
  for (const o of mod.ObjectStates) walk(o);
}
const T = (guid) => {
  const t = byGuid[guid].Transform;
  return { pos: [t.posX, t.posY, t.posZ], rot: [t.rotX, t.rotY, t.rotZ], scale: [t.scaleX, t.scaleY, t.scaleZ] };
};

// ---------------- seats / colors ----------------
const SEATS = ['Brown', 'Pink', 'Teal', 'Purple', 'Orange'];
const SEAT_HEX = { Brown: '#713B17', Pink: '#F570CE', Teal: '#21B19B', Purple: '#A020F0', Orange: '#F4641D' };
const COLORS = ['Blue', 'White', 'Yellow', 'Red', 'Green']; // container/factory colors

// mod zone GUIDs per seat (from the score-token Lua)
const ZONES = {
  Brown:  { hand: 'a5c9bb', harbor: '9c3e2e', holding: '158b08', scoring: '7fa253', boat: 'f167b8' },
  Teal:   { hand: '627b20', harbor: '673cef', holding: '2472b7', scoring: 'ceceb7', boat: '4e4f5d' },
  Purple: { hand: 'fdbb78', harbor: 'e927b2', holding: '7097f3', scoring: '635699', boat: 'ab02d2' },
  Orange: { hand: '7b543c', harbor: '1e1f00', holding: '6462a5', scoring: 'a3e4bc', boat: 'd57a9c' },
  Pink:   { hand: 'b4bb24', harbor: '8f62c8', holding: 'c037b5', scoring: 'c84b75', boat: 'e90646' },
};
// player boards (Custom_Token scale 3) — world pos + yaw
const BOARDS = {
  Brown:  { guid: '0c4fd8', pos: [0, -21.42], yaw: 180 },
  Pink:   { guid: 'b0b952', pos: [-30.5, -12], yaw: 270 },
  Orange: { guid: '834927', pos: [-30.5, 12], yaw: 270 },
  Teal:   { guid: '4d3e6a', pos: [30.5, -12], yaw: 90 },
  Purple: { guid: '1d8531', pos: [30.5, 12], yaw: 90 },
};

// ---------------- stage flat art ----------------
const stageImg = async (name, url, width, opts = {}) => {
  const src = img(url);
  const meta = await sharp(src, { limitInputPixels: false }).metadata();
  let p = sharp(src, { limitInputPixels: false });
  if (width && meta.width > width) p = p.resize({ width });
  await p.webp({ quality: opts.q ?? 87 }).toFile(path.join(OUT, `${name}.webp`));
  return { img: `/container/${name}.webp`, px: [meta.width, meta.height] };
};

const MAT_URL = byGuid['49790f'].CustomImage.ImageURL;
const mat = await stageImg('mat', MAT_URL, 2800, { q: 88 });

const boardArt = {};
for (const [seat, b] of Object.entries(BOARDS)) {
  boardArt[seat] = await stageImg(`pboard-${seat.toLowerCase()}`, byGuid[b.guid].CustomImage.ImageURL, 2048);
}

// factory tokens (one img per color), warehouse, tokens
const FACTORY_IMG = { Green: 'cbef09', Blue: '8f7a38', Yellow: 'bac8d9', White: '54e472', Red: '5216fa' };
const factoryArt = {};
for (const [color, guid] of Object.entries(FACTORY_IMG)) {
  factoryArt[color] = await stageImg(`factory-${color.toLowerCase()}`, byGuid[guid].CustomImage.ImageURL, 512);
}
const warehouseArt = await stageImg('warehouse', byGuid['520b4a'].CustomImage.ImageURL, 512);
const auctionTokenArt = await stageImg('auction-token', byGuid['16f996'].CustomImage.ImageURL, 400);
const reserveTokenArt = await stageImg('reserve-token', byGuid['0f09cd'].CustomImage.ImageURL, 400);
const scoreDiscArt = await stageImg('score-disc', byGuid['5fc2dc'].CustomImage.ImageURL, 500);

// ---------------- models ----------------
const stageModel = async (name, meshUrl, texUrl) => {
  fs.copyFileSync(model(meshUrl), path.join(OUT, 'models', `${name}.obj`));
  if (texUrl) {
    await sharp(img(texUrl), { limitInputPixels: false })
      .resize({ width: 512, withoutEnlargement: true }).webp({ quality: 85 })
      .toFile(path.join(OUT, 'models', `${name}.webp`));
  }
  return { mesh: `/container/models/${name}.obj`, tex: texUrl ? `/container/models/${name}.webp` : null };
};
const shipMesh = byGuid['f167b8'].CustomMesh;
const models = { ship: await stageModel('ship', shipMesh.MeshURL, shipMesh.DiffuseURL) };
// container mesh once + a diffuse per color
const CONT_DIFFUSE = { Blue: '30026a', White: '64bc05', Yellow: '57bbdb', Green: '535dd2', Red: '8e90b4' };
const contMesh = byGuid['30026a'].CustomMesh;
fs.copyFileSync(model(contMesh.MeshURL), path.join(OUT, 'models', 'container.obj'));
models.container = { mesh: '/container/models/container.obj', tex: {} };
for (const [color, guid] of Object.entries(CONT_DIFFUSE)) {
  await sharp(img(byGuid[guid].CustomMesh.DiffuseURL), { limitInputPixels: false })
    .resize({ width: 512, withoutEnlargement: true }).webp({ quality: 85 })
    .toFile(path.join(OUT, 'models', `container-${color.toLowerCase()}.webp`));
  models.container.tex[color] = `/container/models/container-${color.toLowerCase()}.webp`;
}

// ---------------- cards (deck 6 = 6x2 sheet), aid, bid tiles ----------------
const deck6 = byGuid['7c6f85'].CustomDeck['6'];
const sheet6 = img(deck6.FaceURL);
const s6meta = await sharp(sheet6, { limitInputPixels: false }).metadata();
const cw = Math.floor(s6meta.width / 6), chh = Math.floor(s6meta.height / 2);
const CELLS = {
  600: 'bluff', 601: 'money-1', 602: 'money-2', 603: 'money-5', 604: 'money-10', 605: 'money-20',
  606: 'loan', 607: 'scoring-blue', 608: 'scoring-white', 609: 'scoring-green', 610: 'scoring-red', 611: 'scoring-yellow',
};
for (const [cell, name] of Object.entries(CELLS)) {
  const idx = cell % 100;
  const col = idx % 6, row = Math.floor(idx / 6);
  const buf = await sharp(sheet6, { limitInputPixels: false })
    .extract({ left: col * cw, top: row * chh, width: cw, height: chh }).toBuffer();
  await sharp(buf).resize({ width: 640 }).webp({ quality: 86 }).toFile(path.join(OUT, 'cards', `${name}.webp`));
}
// player aid (deck 3, 1x1), bid tiles (deck 8 / deck 10, 1x1)
await sharp(img(byGuid['752dad'].CustomDeck['3'].FaceURL), { limitInputPixels: false })
  .resize({ width: 1024 }).webp({ quality: 87 }).toFile(path.join(OUT, 'cards', 'aid.webp'));
// deck 10 (ships art) = CASH bid tile; deck 8 (districts art) = CONTAINER bid
// tile (rulebook p12 pictures).
await sharp(img(byGuid['9879a7'].CustomDeck['10'].FaceURL), { limitInputPixels: false })
  .resize({ width: 700 }).webp({ quality: 87 }).toFile(path.join(OUT, 'cards', 'bid-cash.webp'));
await sharp(img(byGuid['a0ca5e'].CustomDeck['8'].FaceURL), { limitInputPixels: false })
  .resize({ width: 700 }).webp({ quality: 87 }).toFile(path.join(OUT, 'cards', 'bid-containers.webp'));

// ---------------- rulebook ----------------
fs.copyFileSync(cached('PDF', byGuid['d8cb20'].CustomPDF.PDFUrl, ['.pdf', '.PDF']), path.join(OUT, 'rulebook.pdf'));

// ---------------- mat art <-> world affine fit ----------------
// anchors: 10 island hex rings (5 scoring on Container Island, 5 holding on
// the Off-Shore Bank) <-> zone centers from the mod.
const RING_RGB = { // sampled ring paint per seat
  Teal: [[60, 178, 170], [38, 166, 155]],
  Purple: [[150, 90, 190], [128, 60, 170]],
  Pink: [[240, 130, 200], [232, 127, 159]],
  Orange: [[243, 163, 89], [230, 140, 70]],
  Brown: [[90, 62, 42], [70, 48, 32]],
};
const matSrc = img(MAT_URL);
const { data: matData, info: matInfo } = await sharp(matSrc).raw().toBuffer({ resolveWithObject: true });
const MW = matInfo.width, MH = matInfo.height, MC = matInfo.channels;

const anchors = []; // {seat, kind, wx, wz, px, py}
for (const seat of SEATS) {
  for (const kind of ['scoring', 'holding']) {
    const t = T(ZONES[seat][kind]);
    anchors.push({ seat, kind, wx: t.pos[0], wz: t.pos[2], px: null, py: null });
  }
}
// initial affine guess from the prior manual measurement (purple/pink rings)
let fit = { ax: 0.0231, bx: -48.9, az: -0.0239, bz: 42.3 }; // wx=ax*px+bx, wz=az*py+bz
const proj = (px, py) => [fit.ax * px + fit.bx, fit.az * py + fit.bz];
const unproj = (wx, wz) => [(wx - fit.bx) / fit.ax, (wz - fit.bz) / fit.az];

const centroidNear = (cx, cy, rgbs, radius) => {
  let sx = 0, sy = 0, n = 0;
  const x0 = Math.max(0, Math.round(cx - radius)), x1 = Math.min(MW - 1, Math.round(cx + radius));
  const y0 = Math.max(0, Math.round(cy - radius)), y1 = Math.min(MH - 1, Math.round(cy + radius));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * MW + x) * MC;
    const r = matData[i], g = matData[i + 1], b = matData[i + 2];
    if (rgbs.some(([tr, tg, tb]) => Math.abs(r - tr) < 34 && Math.abs(g - tg) < 34 && Math.abs(b - tb) < 34)) {
      sx += x; sy += y; n++;
    }
  }
  return n > 300 ? [sx / n, sy / n, n] : null;
};

for (let iter = 0; iter < 4; iter++) {
  const good = [];
  for (const a of anchors) {
    const [gx, gy] = unproj(a.wx, a.wz);
    const c = centroidNear(gx, gy, RING_RGB[a.seat], iter === 0 ? 220 : 130);
    if (c) { a.px = c[0]; a.py = c[1]; good.push(a); }
  }
  // least squares wx = ax*px+bx over good anchors; same for z
  const ls = (xs, ys) => {
    const n = xs.length;
    const sx = xs.reduce((p, c) => p + c, 0), sy = ys.reduce((p, c) => p + c, 0);
    const sxx = xs.reduce((p, c) => p + c * c, 0), sxy = xs.reduce((p, c, i) => p + c * ys[i], 0);
    const a = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return [a, (sy - a * sx) / n];
  };
  if (good.length < 6) throw new Error(`mat fit: only ${good.length} anchors matched`);
  [fit.ax, fit.bx] = ls(good.map((a) => a.px), good.map((a) => a.wx));
  [fit.az, fit.bz] = ls(good.map((a) => a.py), good.map((a) => a.wz));
  const res = good.map((a) => {
    const [wx, wz] = proj(a.px, a.py);
    return Math.hypot(wx - a.wx, wz - a.wz);
  });
  console.log(`fit iter ${iter}: anchors ${good.length}, mean res ${(res.reduce((p, c) => p + c, 0) / res.length).toFixed(3)} max ${Math.max(...res).toFixed(3)} (world units)`);
}
console.log('mat affine:', JSON.stringify(fit));

// printed hex centers in art px (the fitted windowed centroids themselves)
const hexArt = {};
for (const a of anchors) {
  if (a.px == null) { const [gx, gy] = unproj(a.wx, a.wz); a.px = gx; a.py = gy; }
  hexArt[`${a.seat}:${a.kind}`] = [Math.round(a.px), Math.round(a.py)];
}

// bank lots: detect the printed pale slots near their expected spots.
// container lots (top squares) expected near world z 7.4; cash card slots near
// z -9.7 (mod setup objects). Spacing III extrapolated then refined.
const paleSlot = (cx, cy, radius) => {
  let sx = 0, sy = 0, n = 0;
  const x0 = Math.round(cx - radius), x1 = Math.round(cx + radius);
  const y0 = Math.round(cy - radius), y1 = Math.round(cy + radius);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * MW + x) * MC;
    const r = matData[i], g = matData[i + 1], b = matData[i + 2];
    if (r > 218 && g > 218 && b > 210 && Math.abs(r - g) < 14 && Math.abs(g - b) < 20) { sx += x; sy += y; n++; }
  }
  return n > 500 ? [sx / n, sy / n, n] : null;
};
const bankLots = { containers: [], cash: [] };
const CONT_LOT_WORLD = [[5.89, 7.41], [9.73, 7.41], [13.57, 7.41]];
const CASH_LOT_WORLD = [[6.12, -9.71], [9.70, -9.71], [13.32, -9.71]];
for (const [i, [wx, wz]] of CONT_LOT_WORLD.entries()) {
  const [gx, gy] = unproj(wx, wz);
  const c = paleSlot(gx, gy, 75);
  if (!c) throw new Error(`bank container lot ${i} not found in art`);
  bankLots.containers.push([Math.round(c[0]), Math.round(c[1])]);
}
// cash card slots are outlined water in the art (no pale fill to detect);
// the mod's own $1/$2/$3 card placements ARE the printed slots — project them.
for (const [wx, wz] of CASH_LOT_WORLD) {
  const [gx, gy] = unproj(wx, wz);
  bankLots.cash.push([Math.round(gx), Math.round(gy)]);
}
console.log('bank lots art px:', JSON.stringify(bankLots));

// overlay diagnostic: dots on every fitted spot
{
  const dots = [];
  const dot = ([x, y], color, r = 12) => dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="5"/>`);
  for (const a of anchors) dot([a.px, a.py], a.kind === 'scoring' ? '#00ffff' : '#ffff00');
  for (const p of bankLots.containers) dot(p, '#ff00ff', 16);
  for (const p of bankLots.cash) dot(p, '#00ff00', 16);
  const svg = Buffer.from(`<svg width="${MW}" height="${MH}" xmlns="http://www.w3.org/2000/svg">${dots.join('')}</svg>`);
  const base = await sharp(matSrc).png().toBuffer();
  const over = await sharp(base).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
  await sharp(over).resize(1600).png().toFile(path.join(GOLDEN_DIR, 'mat-overlay-diagnostic.png'));
}

// ---------------- player board art -> local mapping + slots ----------------
// art 2712x1702; local: localX = -(px-1356)*s, localZ = (py-851)*s, s from
// the two mod anchors (see header). world = boardCenter + yaw-rotation of local.
const PB = {
  px: [2712, 1702], s: 0.005246, cx: 1356, cy: 851,
  // measured slot centers (art px)
  factoryTrack: [[140, 787], [140, 1045], [140, 1300], [140, 1565]], // FREE,$6,$9,$12
  warehouseTrack: [[2495, 160], [2495, 370], [2495, 575], [2495, 785], [2495, 1000]], // FREE,$4,$5,$6,$7
  factoryLots: { 4: [520, 1430], 3: [1170, 1430], 2: [1740, 1430], 1: [2320, 1430] }, // price -> anchor
  harborLots: { 6: [455, 640], 5: [830, 640], 4: [1205, 640], 3: [1580, 640], 2: [2040, 640] },
  docks: [[470, 55], [895, 55], [1265, 55], [1680, 55], [2095, 55]],
};
// verification against the two anchors:
const pbLocal = ([px, py]) => [-(px - PB.cx) * PB.s, (py - PB.cy) * PB.s];
{
  const [fx, fz] = pbLocal([2495, 160]);
  const dev = Math.hypot(fx - -6.0, fz - -3.61);
  console.log(`pb FREE-warehouse check: local (${fx.toFixed(2)},${fz.toFixed(2)}) vs (-6.00,-3.61) dev ${dev.toFixed(3)}`);
  if (dev > 0.35) throw new Error('player board calibration drifted');
  const [c2x, c2z] = pbLocal([1806, 1545]);
  const dev2 = Math.hypot(c2x - -2.36, c2z - 3.64);
  console.log(`pb $2-lot check: local (${c2x.toFixed(2)},${c2z.toFixed(2)}) vs (-2.36,3.64) dev ${dev2.toFixed(3)}`);
  if (dev2 > 0.35) throw new Error('player board $2 lot calibration drifted');
}

// ---------------- ships / supply piles ----------------
const SHIP_STARTS = {
  Brown: [-4.22, -14.73], Pink: [-23.99, -7.93], Orange: [-23.99, 7.80],
  Teal: [23.81, -7.80], Purple: [24.00, 8.04],
};
const SHIP_TINT = Object.fromEntries(SEATS.map((s) => {
  const g = { Brown: 'f167b8', Pink: 'e90646', Orange: 'd57a9c', Teal: '4e4f5d', Purple: 'ab02d2' }[s];
  const c = byGuid[g].ColorDiffuse;
  return [s, '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')];
}));
// supply piles (world rows, on the mat's north band above the bank island)
const SUPPLY = {
  containers: { z: [27.4, 28.9], xByColor: { Blue: -9.8, White: -4.8, Yellow: 0.0, Red: 4.9, Green: 9.9 } },
  factories: { z: 31.3, xByColor: { Blue: -10.5, White: -5.2, Yellow: 0.0, Red: 4.9, Green: 10.2 } },
  warehouses: { z: 34.0, x: [-10.4, 10.5] },
  bankSide: { loans: [9.48, 17.05], bidCash: [3.07, 17.05], bidContainers: [-2.43, 17.04], auctionTokens: [[6.77, 16.46], [6.77, 17.63]], reserves: [6.77, 15.29] },
};

// ---------------- golden ----------------
const golden = {
  workshop: 3745603443,
  seats: SEATS,
  seatHex: SEAT_HEX,
  colors: COLORS,
  supplyByPlayers: {
    3: { auctionTokens: 1, warehouses: 12, factoriesPerColor: 2, containersPerColor: { short: 9, standard: 11, extended: 12 } },
    4: { auctionTokens: 1, warehouses: 16, factoriesPerColor: 3, containersPerColor: { short: 11, standard: 14, extended: 16 } },
    5: { auctionTokens: 2, warehouses: 20, factoriesPerColor: 4, containersPerColor: { short: 13, standard: 17, extended: 20 } },
  },
  tracks: {
    factoryCosts: [0, 6, 9, 12], factoryLotPrices: [1, 2, 3, 4], factoryLimitPer: 2,
    warehouseCosts: [0, 4, 5, 6, 7], harborLotPrices: [2, 3, 4, 5, 6], harborLimitPer: 1,
  },
  shipCapacity: 5,
  loans: { value: 10, interest: 1, max: 2, endPenalty: 11 },
  bankSetup: { cash: [1, 2, 3], containerLots: [2, 1, 0] },
  startingCash: 20,
  startingContainerLot: 2,
  scoringCards: { // color card -> two-value color + per-color values (mod Lua specialConfigs)
    White: { twoValue: 'White', values: { Yellow: 10, Green: 6, Red: 4, Blue: 2 } },
    Green: { twoValue: 'Green', values: { White: 10, Red: 6, Blue: 4, Yellow: 2 } },
    Yellow: { twoValue: 'Yellow', values: { Blue: 10, White: 6, Green: 4, Red: 2 } },
    Red: { twoValue: 'Red', values: { Green: 10, Blue: 6, Yellow: 4, White: 2 } },
    Blue: { twoValue: 'Blue', values: { Red: 10, Yellow: 6, White: 4, Green: 2 } },
  },
  twoValueHigh: 10, twoValueLow: 5,
  leftoverValues: { ship: 3, holding: 3, harbor: 2, factory: 0 },
  endColorsOut: 2,
  actions: { perTurn: 2, oncePerTurn: ['produce', 'call_bank'] },
};
fs.writeFileSync(path.join(GOLDEN_DIR, 'container-data.json'), JSON.stringify(golden, null, 1));

// ---------------- scene ----------------
const scene = {
  mat: { ...mat, transform: fit }, // wx = ax*px+bx, wz = az*py+bz (full-res art px)
  boards: Object.fromEntries(SEATS.map((s) => [s, { ...boardArt[s], pos: BOARDS[s].pos, yaw: BOARDS[s].yaw }])),
  pb: PB,
  models,
  shipTint: SHIP_TINT,
  shipStarts: SHIP_STARTS,
  factoryArt, warehouseArt, auctionTokenArt, reserveTokenArt, scoreDiscArt,
  hexArt, // `${seat}:${kind}` -> art px of printed hex center (scoring/holding)
  bankLots, // art px: containers[3], cash[3]
  supply: SUPPLY,
  zones: Object.fromEntries(SEATS.map((s) => [s, Object.fromEntries(Object.entries(ZONES[s]).filter(([k]) => k !== 'boat').map(([k, g]) => {
    const t = T(g);
    return [k, { pos: [t.pos[0], t.pos[2]], size: [t.scale[0], t.scale[2]] }];
  }))])),
  cards: {
    money: { 1: '/container/cards/money-1.webp', 2: '/container/cards/money-2.webp', 5: '/container/cards/money-5.webp', 10: '/container/cards/money-10.webp', 20: '/container/cards/money-20.webp' },
    bluff: '/container/cards/bluff.webp', loan: '/container/cards/loan.webp',
    scoring: Object.fromEntries(COLORS.map((c) => [c, `/container/cards/scoring-${c.toLowerCase()}.webp`])),
    aid: '/container/cards/aid.webp',
    bidCash: '/container/cards/bid-cash.webp', bidContainers: '/container/cards/bid-containers.webp',
  },
};
fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene, null, 1));
fs.writeFileSync(path.join(GOLDEN_DIR, 'scene.json'), JSON.stringify(scene, null, 1));

console.log('done: assets staged to client/public/container, golden to games/container/golden');
