// Stage Bloodborne: The Board Game assets + golden data from the TTS cache
// (mod 3572706204, "Upscaled & Scripted").
//
// Outputs:
//  - games/bloodborne/golden/sheets.json    card sheets keyed by face URL
//  - games/bloodborne/golden/decks.json     every deck instance (path, cards)
//  - games/bloodborne/golden/campaigns.json chapter setups parsed from global.lua
//  - games/bloodborne/golden/components.json hunters/weapons/enemies/bosses/tokens
//  - client/public/bloodborne/sheets/*      staged sheet images (webp, keyed slug)
//  - client/public/bloodborne/tiles/*       per-tile face crops (webp)
//  - client/public/bloodborne/tokens/*      token art
//  - client/public/bloodborne/scene.json    render manifest (sheets, tiles, minis)
//
// Card identity is ALWAYS (face URL, cell) — TTS CustomDeck ids collide across
// decks (e.g. three different physical sheets all use id 72). CardID%100 = cell,
// cell -> sheet grid position is row-major (x = cell % NumWidth, y = floor/W).
//
// Minis (.unity3d bundles) are extracted by extract-bloodborne.py (UnityPy);
// this script writes the bundle manifest it consumes (minis.json).
//
// Idempotent: keeps previously staged files, carries prior transcription
// blocks in golden files forward (never overwrites *-transcribed.json).
// Run: node tools/tts-extract/extract-bloodborne.mjs

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/bloodborne');
const GOLD = path.join(ROOT, 'games/bloodborne/golden');
for (const d of [OUT, GOLD, path.join(OUT, 'sheets'), path.join(OUT, 'tiles'), path.join(OUT, 'tokens')]) fs.mkdirSync(d, { recursive: true });

const save = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop', '3572706204.json'), 'utf8'));

const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const findImg = (url) => {
  for (const ext of ['.png', '.jpg', '.jpeg']) {
    const p = path.join(MODS, 'Images', munge(url) + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// ---- flatten -----------------------------------------------------------------
const flat = [];
const walk = (o, parents) => {
  flat.push({ o, parents });
  for (const c of o.ContainedObjects ?? []) walk(c, [...parents, o]);
  for (const s of Object.values(o.States ?? {})) walk(s, [...parents, o]);
};
save.ObjectStates.forEach((o) => walk(o, []));
const byGuid = new Map(flat.map((r) => [r.o.GUID, r]));
const pathOf = (r) => r.parents.map((p) => p.Nickname || p.Name).filter(Boolean).join('/');

// ---- 1. sheet inventory (by URL) ----------------------------------------------
// sheets[faceUrl] = { back, w, h, unique, cells:Set, decks:Set }
const sheets = new Map();
for (const { o } of flat) {
  if (!/^Card/.test(o.Name) && !/^Deck/.test(o.Name)) continue;
  for (const cd of Object.values(o.CustomDeck ?? {})) {
    const key = cd.FaceURL;
    if (!sheets.has(key)) sheets.set(key, { back: cd.BackURL, w: cd.NumWidth, h: cd.NumHeight, unique: !!cd.UniqueBack, cells: new Set(), decks: new Set() });
  }
}
// record which cells are used per sheet (from cards)
// resolve a card's CustomDeck entry: by CardID prefix, else the card's only
// entry, else inherit from a parent deck's CustomDeck (some decks strip the
// per-card entries — the Upgrade Stat Deck does).
const deckEntryOf = (card, parents = []) => {
  const cds = card.CustomDeck ?? {};
  const own = cds[String(Math.floor(card.CardID / 100))] ?? Object.values(cds)[0];
  if (own) return own;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i].CustomDeck ?? {};
    const hit = p[String(Math.floor(card.CardID / 100))];
    if (hit) return hit;
  }
  return null;
};
for (const r of flat) {
  const { o } = r;
  const addCard = (card) => {
    const cd = deckEntryOf(card);
    if (!cd) return;
    const s = sheets.get(cd.FaceURL);
    if (s) { s.cells.add(card.CardID % 100); s.decks.add(pathOf(r) || '(top)'); }
  };
  if (/^Card/.test(o.Name)) addCard(o);
}

// name sheets by their most descriptive deck usage
const sheetName = new Map();
{
  const used = new Set();
  let i = 0;
  for (const [url, s] of sheets) {
    // pick a stable, readable slug: nickname of a deck containing it, else index
    let base = 'sheet';
    outer: for (const r of flat) {
      if (!/^Deck/.test(r.o.Name)) continue;
      for (const cd of Object.values(r.o.CustomDeck ?? {})) {
        if (cd.FaceURL === url && r.o.Nickname) { base = slug(r.o.Nickname); break outer; }
      }
    }
    let name = base, n = 2;
    while (used.has(name)) name = `${base}-${n++}`;
    used.add(name);
    sheetName.set(url, name);
    i++;
  }
}

// ---- 2. stage sheet images -----------------------------------------------------
const staged = {}; // url -> {rel,w,h} for faces AND backs
const stageImage = async (url, destDir, base, { maxPx = 4096, quality = 80 } = {}) => {
  if (!url || staged[url]) return staged[url] ?? null;
  const src = findImg(url);
  if (!src) { console.log('MISSING image', base, url.slice(-60)); staged[url] = null; return null; }
  const name = base + '.webp';
  const dst = path.join(destDir, name);
  if (!fs.existsSync(dst)) {
    await sharp(src, { limitInputPixels: 1e9 }).resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toFile(dst);
  }
  const meta = await sharp(dst).metadata();
  staged[url] = { rel: `/bloodborne/${path.basename(destDir)}/${name}`, w: meta.width, h: meta.height };
  return staged[url];
};

const sheetsOut = {};
for (const [url, s] of sheets) {
  const name = sheetName.get(url);
  const face = await stageImage(url, path.join(OUT, 'sheets'), name);
  let back = null;
  if (s.back && s.back !== url) back = await stageImage(s.back, path.join(OUT, 'sheets'), name + '-back');
  sheetsOut[url] = { name, w: s.w, h: s.h, unique: s.unique, backUrl: s.back, face, back, cells: [...s.cells].sort((a, b) => a - b), decks: [...s.decks].slice(0, 8) };
}

// ---- 3. deck manifests ----------------------------------------------------------
const decksOut = [];
for (const r of flat) {
  const { o } = r;
  if (!/^Deck/.test(o.Name)) continue;
  const cards = (o.ContainedObjects ?? []).map((c) => {
    const cd = deckEntryOf(c, [o]) ?? {};
    return { name: c.Nickname || '', cell: c.CardID % 100, sheet: sheetName.get(cd.FaceURL) ?? null, desc: c.Description || undefined };
  });
  decksOut.push({ nick: o.Nickname || '', guid: o.GUID, path: pathOf(r), cards });
}
// loose CardCustoms (hunt board, player aids)
const looseOut = [];
for (const r of flat) {
  const { o } = r;
  if (o.Name !== 'CardCustom' && o.Name !== 'Card') continue;
  if (r.parents.some((p) => /^Deck/.test(p.Name))) continue;
  const cd = deckEntryOf(o) ?? {};
  looseOut.push({ nick: o.Nickname || '', guid: o.GUID, cell: o.CardID % 100, sheet: sheetName.get(cd.FaceURL) ?? null, path: pathOf(r) });
}

// ---- 4. campaigns from global.lua ------------------------------------------------
const lua = save.LuaScript;
const campaigns = {};
{
  const start = lua.indexOf('campaigns = {');
  // brace-match the whole table
  let depth = 0, end = start;
  for (let i = lua.indexOf('{', start); i < lua.length; i++) {
    if (lua[i] === '{') depth++;
    else if (lua[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const body = lua.slice(lua.indexOf('{', start), end);
  // campaign blocks: ["Name"] = { ...chapters... }
  const nameRe = /\[\s*"((?:[^"\\]|\\.)*)"\s*\]\s*=\s*\{/g;
  let m;
  const blocks = [];
  while ((m = nameRe.exec(body))) blocks.push({ name: m[1], open: nameRe.lastIndex - 1 });
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    let depth2 = 0, end2 = b.open;
    for (let i = b.open; i < body.length; i++) {
      if (body[i] === '{') depth2++;
      else if (body[i] === '}') { depth2--; if (depth2 === 0) { end2 = i + 1; break; } }
    }
    const cbody = body.slice(b.open + 1, end2 - 1);
    // chapter blocks: top-level {...} groups
    const chapters = [];
    let d = 0, cs = -1;
    for (let i = 0; i < cbody.length; i++) {
      if (cbody[i] === '{') { if (d === 0) cs = i; d++; }
      else if (cbody[i] === '}') { d--; if (d === 0) chapters.push(cbody.slice(cs + 1, i)); }
    }
    const parseList = (src) => {
      const out = [];
      const re = /"((?:[^"\\]|\\.)*)"/g;
      let mm; while ((mm = re.exec(src))) out.push(mm[1]);
      return out;
    };
    const field = (ch, key) => {
      const re = new RegExp(key + '\\s*=\\s*');
      const mm = re.exec(ch);
      if (!mm) return null;
      let i = mm.index + mm[0].length;
      if (ch[i] === '{') {
        let dd = 0, st = i;
        for (; i < ch.length; i++) {
          if (ch[i] === '{') dd++;
          else if (ch[i] === '}') { dd--; if (dd === 0) return ch.slice(st, i + 1); }
        }
      }
      return ch.slice(i, ch.indexOf('\n', i)).replace(/,\s*$/, '').trim();
    };
    campaigns[b.name] = chapters.map((ch) => {
      const rndRaw = field(ch, 'random_tiles') ?? '';
      let randomTiles;
      let mm;
      if ((mm = /math\.min\(#getSeatedPlayers\(\)\s*\*\s*(\d+)\s*,\s*(\d+)\)/.exec(rndRaw))) randomTiles = { perHunter: +mm[1], cap: +mm[2] };
      else if (/#getSeatedPlayers\(\)\s*\+\s*(\d+)/.test(rndRaw)) randomTiles = { perHunter: 1, plus: +/#getSeatedPlayers\(\)\s*\+\s*(\d+)/.exec(rndRaw)[1] };
      else randomTiles = { raw: rndRaw };
      const insight = [];
      const insRaw = field(ch, 'insight_missions');
      if (insRaw) {
        // parse nested lists of strings
        let d3 = 0, cur = null;
        for (let i = 1; i < insRaw.length - 1; i++) {
          if (insRaw[i] === '{') { d3++; cur = []; let j = i; let dd = 0;
            for (; j < insRaw.length; j++) { if (insRaw[j] === '{') dd++; else if (insRaw[j] === '}') { dd--; if (dd === 0) break; } }
            insight.push(parseList(insRaw.slice(i, j + 1)));
            i = j;
          }
        }
      }
      return {
        huntMission: parseList(field(ch, 'hunt_mission') ?? ''),
        insightMissions: insight,
        introduction: (field(ch, 'introduction') ?? '').replace(/^"|"$/g, ''),
        startingTile: (field(ch, 'starting_tile') ?? '').replace(/^"|",?$/g, '').replace(/"$/, ''),
        startingTiles: parseList(field(ch, 'starting_tiles') ?? ''),
        excludedTiles: parseList(field(ch, 'excluded_tiles') ?? ''),
        extraCards: parseList(field(ch, 'extra_cards') ?? ''),
        enemies: parseList(field(ch, 'enemies') ?? ''),
        enemiesRandom: +(field(ch, 'enemies_random') ?? 0) || 0,
        excludedEnemies: parseList(field(ch, 'excluded_enemies') ?? ''),
        randomTiles,
      };
    });
  }
}

// ---- 5. components: hunters / weapons / enemies / bosses / tokens ---------------
const bagsAt = (guid) => {
  const r = byGuid.get(guid);
  if (!r) return null;
  // Custom_Model_Infinite_Bag -> inner Bag -> contents
  let inner = r.o;
  while (inner.ContainedObjects?.length === 1 && /Bag/.test(inner.ContainedObjects[0].Name)) inner = inner.ContainedObjects[0];
  return inner;
};

const WEAPON_BAGS = {
  'saw-cleaver': '588674', 'threaded-cane': 'b52cf1', 'hunter-axe': '298f54', 'ludwigs-holy-blade': '4c1899',
  'kirkhammer': 'e5cefa', 'blade-of-mercy': 'bcc5d3', 'logarius-wheel': '829389', 'tonitrus': 'd2a837',
  'beast-claw': '37336d', 'stake-driver': '9d733a', 'rifle-spear': 'f0e72d', 'chikage': '7e31e9',
  'ludwigs-uncanny-holy-blade': '7b29fa', 'burial-blade': 'd328f9', 'reiterpallasch': '048a44', 'boom-hammer': null,
};
const HUNTER_BAGS = {
  'saw-cleaver': 'cfb7b3', 'threaded-cane': 'f88ee8', 'hunter-axe': '896430', 'ludwigs-holy-blade': '1f6d39',
  'kirkhammer': 'aa85a0', 'blade-of-mercy': '693eee', 'logarius-wheel': '927ea8', 'tonitrus': 'd6dc7e',
  'beast-claw': '258780', 'stake-driver': '52038f', 'rifle-spear': '69b5c8', 'chikage': 'edc81d',
  'ludwigs-uncanny-holy-blade': 'feca59', 'burial-blade': '653985', 'reiterpallasch': '97ddd5',
};

const cardRef = (c) => {
  if (!c) return null;
  const cd = deckEntryOf(c) ?? {};
  return { name: c.Nickname || '', cell: c.CardID % 100, sheet: sheetName.get(cd.FaceURL) ?? null };
};

const minisManifest = {}; // slug -> bundle munged filename
const addMini = (name, o) => {
  const url = o.CustomAssetbundle?.AssetbundleURL;
  if (!url) return null;
  const key = slug(name);
  minisManifest[key] = { bundle: munge(url) + '.unity3d', url };
  return key;
};

const componentsOut = { hunters: {}, enemies: {}, bosses: {}, npcs: {}, tokens: {}, tiles: {} };

for (const [id, wg] of Object.entries(WEAPON_BAGS)) {
  if (!wg) continue;
  const w = bagsAt(wg), h = bagsAt(HUNTER_BAGS[id]);
  if (!w || !h) { console.log('MISSING hunter/weapon bag', id); continue; }
  const cardsW = (w.ContainedObjects ?? []).filter((c) => /^Card/.test(c.Name));
  const cardsH = (h.ContainedObjects ?? []).filter((c) => /^Card/.test(c.Name));
  const weaponDash = cardsW.find((c) => !/pistol|firearm|blunderbuss|rifle|cannon|evelyn|torch/i.test(c.Nickname || '')) ?? cardsW[0];
  const firearm = cardsW.find((c) => c !== weaponDash);
  const hunterCard = cardsH.find((c) => !/caryll/i.test(c.Nickname || ''));
  const rune = cardsH.find((c) => /caryll/i.test(c.Nickname || ''));
  const wm = (w.ContainedObjects ?? []).find((c) => c.Name === 'Custom_Assetbundle');
  const hm = (h.ContainedObjects ?? []).find((c) => c.Name === 'Custom_Assetbundle');
  componentsOut.hunters[id] = {
    weaponDashboard: cardRef(weaponDash), firearm: cardRef(firearm),
    hunterCard: cardRef(hunterCard), startingRune: cardRef(rune),
    weaponMini: wm ? addMini(id + '-weapon', wm) : null,
    hunterMini: hm ? addMini(id + '-hunter', hm) : null,
  };
}

// enemies + npcs + bosses: walk all top-level Custom_Model_Infinite_Bag
for (const top of save.ObjectStates) {
  if (top.Name !== 'Custom_Model_Infinite_Bag') continue;
  const nick = top.Nickname || '';
  if (/Deck$|Tiles?$|Campaign|Bag$|Player Aid|Hunter$/.test(nick)) continue;
  if (Object.values(WEAPON_BAGS).includes(top.GUID)) continue;
  const inner = bagsAt(top.GUID);
  if (!inner) continue;
  const kids = inner.ContainedObjects ?? [];
  const decks = kids.filter((c) => /^Deck/.test(c.Name));
  const cards = kids.filter((c) => /^Card/.test(c.Name));
  const minis = kids.filter((c) => c.Name === 'Custom_Assetbundle' || c.Name === 'Figurine_Custom');
  const id = slug(nick);
  if (decks.length >= 2) {
    // boss: phase decks + HP card
    componentsOut.bosses[id] = {
      name: nick,
      hpCard: cardRef(cards[0]),
      phaseDecks: decks.map((d) => ({ nick: d.Nickname, guid: d.GUID, cards: (d.ContainedObjects ?? []).map(cardRef) })),
      mini: minis[0] ? addMini(id, minis[0]) : null,
    };
  } else {
    componentsOut.enemies[id] = {
      name: nick,
      card: cardRef(cards[0]),
      extraCards: cards.slice(1).map(cardRef),
      mini: minis[0] ? addMini(id, minis[0]) : null,
      miniCount: minis.length,
    };
  }
}

// tokens (infinite bags at top level + custom tokens)
for (const top of save.ObjectStates) {
  if (top.Name === 'Infinite_Bag') {
    const kid = (top.ContainedObjects ?? [])[0];
    if (kid?.CustomImage?.ImageURL) {
      const id = slug(top.Nickname || kid.Nickname || 'token');
      const img = await stageImage(kid.CustomImage.ImageURL, path.join(OUT, 'tokens'), id, { maxPx: 512 });
      componentsOut.tokens[id] = { name: top.Nickname, img };
    }
  }
}
// hunt board + hunt tracker + dashboards
{
  const hb = byGuid.get('66b398')?.o;
  const cd = (hb.CustomDeck ?? {})[String(Math.floor(hb.CardID / 100))];
  componentsOut.huntBoard = { face: await stageImage(cd.FaceURL, path.join(OUT, 'sheets'), 'hunt-board', { maxPx: 4096, quality: 85 }), back: await stageImage(cd.BackURL, path.join(OUT, 'sheets'), 'hunt-board-back') };
  const ht = byGuid.get('b567a0')?.o;
  componentsOut.huntTracker = { img: await stageImage(ht.CustomImage.ImageURL, path.join(OUT, 'tokens'), 'hunt-tracker', { maxPx: 512 }) };
  componentsOut.hunterDashboards = [];
  for (const g of ['06cae7', '999b81', 'b22b5b', '9d4af3']) {
    const o = byGuid.get(g)?.o;
    componentsOut.hunterDashboards.push({ guid: g, img: await stageImage(o.CustomImage.ImageURL, path.join(OUT, 'sheets'), 'dashboard-' + g, { maxPx: 2048 }) });
  }
}

// ---- 6. tile crops (all tile decks: core / chalice / cainhurst / woods + big singles)
// Walk every tile deck instance; emit each distinct tile once. Named tiles
// dedupe by name (the per-campaign sheet copies are identical art); unnamed
// cells dedupe by (deck nickname, cell) and get ids like core-tiles-c05 —
// they'll be named during tile transcription. Backs carry the reverse art
// (tiles are double-sided in the physical game).
const TILE_DECKS = decksOut.filter((d) => /Tiles/.test(d.nick));
const tilesOut = [];
{
  const emitted = new Set();
  const sheetByName = new Map([...sheets.entries()].map(([u, s]) => [sheetName.get(u), { url: u, ...s }]));
  const cropFrom = async (sheetSlug, cell, outName, back = false) => {
    const s = sheetByName.get(sheetSlug);
    if (!s) return null;
    const url = back ? s.back : s.url;
    const src = findImg(url);
    if (!src) return null;
    const meta = await sharp(src, { limitInputPixels: 1e9 }).metadata();
    const cw = Math.floor(meta.width / s.w), chh = Math.floor(meta.height / s.h);
    const x = (cell % s.w) * cw, y = Math.floor(cell / s.w) * chh;
    const name = outName + (back ? '-back' : '') + '.webp';
    const dst = path.join(OUT, 'tiles', name);
    if (!fs.existsSync(dst)) {
      await sharp(src, { limitInputPixels: 1e9 }).extract({ left: x, top: y, width: cw, height: chh }).resize({ width: 1024, height: 1024, fit: 'inside' }).webp({ quality: 84 }).toFile(dst);
    }
    return `/bloodborne/tiles/${name}`;
  };
  for (const d of TILE_DECKS) {
    for (const c of d.cards) {
      if (!c.sheet) continue;
      const id = c.name ? slug(c.name) : `${slug(d.nick)}-c${String(c.cell).padStart(2, '0')}`;
      if (emitted.has(id)) continue;
      const rel = await cropFrom(c.sheet, c.cell, id);
      if (!rel) continue;
      emitted.add(id);
      const s = sheetByName.get(c.sheet);
      const backRel = s?.unique && s.back ? await cropFrom(c.sheet, c.cell, id, true) : null;
      tilesOut.push({ id, name: c.name || '', deck: d.nick, sheet: c.sheet, cell: c.cell, rel, back: backRel });
    }
  }
}
componentsOut.tiles = tilesOut;

// ---- write --------------------------------------------------------------------
const write = (f, data) => fs.writeFileSync(path.join(GOLD, f), JSON.stringify(data, null, 1));
write('sheets.json', sheetsOut);
write('decks.json', { decks: decksOut, loose: looseOut });
write('campaigns.json', campaigns);
write('components.json', componentsOut);
fs.writeFileSync(path.join(GOLD, 'minis.json'), JSON.stringify(minisManifest, null, 1));

// scene manifest for the client
const scene = {
  game: 'bloodborne',
  sheets: Object.fromEntries(Object.values(sheetsOut).map((s) => [s.name, { w: s.w, h: s.h, face: s.face, back: s.back, unique: s.unique }])),
  tiles: tilesOut,
  tokens: componentsOut.tokens,
  huntBoard: componentsOut.huntBoard,
  huntTracker: componentsOut.huntTracker,
  hunterDashboards: componentsOut.hunterDashboards,
};
fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(scene, null, 1));

console.log('sheets:', Object.keys(sheetsOut).length, 'decks:', decksOut.length, 'loose:', looseOut.length);
console.log('campaigns:', Object.keys(campaigns).map((k) => `${k}(${campaigns[k].length})`).join(', '));
console.log('hunters:', Object.keys(componentsOut.hunters).length, 'enemies:', Object.keys(componentsOut.enemies).length, 'bosses:', Object.keys(componentsOut.bosses).length, 'tiles:', tilesOut.length, 'tokens:', Object.keys(componentsOut.tokens).length, 'minis:', Object.keys(minisManifest).length);
