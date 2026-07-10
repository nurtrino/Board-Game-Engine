// Stage Dark Souls: The Board Game assets from the TTS cache (mod 1210887127,
// a true dumb table — no Lua anywhere). Everything is spatial + printed art:
//  - dungeon room tiles hidden in States chains on six scale-16.5 tiles
//    (incl. one nested States object) + bagged double-sided rooms/arenas,
//  - 54 minis: Custom_Model (OBJ mesh + diffuse; class minis are pastebin-raw
//    OBJs with deviantart diffuses; some sculpts are untextured + tinted) and
//    Figurine_Custom flat standees,
//  - 71 decks + 71 loose cards on shared 10xN sheet images (cell = CardID%100;
//    sheet ids are PER-DECK namespaces — key sheets by URL, never by id),
//  - 4 d6 face-sheet images (12 dice each), health-dial art (10 class
//    healthbars + the boss-dial contraption), tokens/markers/conditions.
// Manifest ids match games/dark-souls/golden-draft/*.json where those exist
// (enemies/invaders by id, treasure cards by (deckGuid,cardID), loose golden
// cards by cardID, encounter cards by (deck nickname, cardId), dice by colour).
// Idempotent: re-runs skip already-staged files; names derive from nicknames/
// golden ids (deduped), not URL hashes. Fails loudly on any cache miss.
// Run: node tools/tts-extract/extract-dark-souls.mjs

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MODS = 'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods';
const OUT = path.join(ROOT, 'client/public/dark-souls');
const GOLD = path.join(ROOT, 'games/dark-souls/golden-draft');
fs.mkdirSync(OUT, { recursive: true });

const save = JSON.parse(fs.readFileSync(path.join(MODS, 'Workshop', '1210887127.json'), 'utf8'));

// ---- staging ----------------------------------------------------------------
const munge = (u) => u.replace(/[^A-Za-z0-9]/g, '');
const akamai = (u) => u.replace(/^https?:\/\/cloud-3\.steamusercontent\.com/, 'https://steamusercontent-a.akamaihd.net');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// the mod misspells a couple of nicknames — canonicalise to the golden ids
const ALIAS = { 'eyegon-of-carim': 'eygon-of-carim', 'kirk-knight-of-thornes': 'kirk-knight-of-thorns' };
const canon = (s) => ALIAS[s] ?? s;

const findSrc = (url, kind) => {
  const dir = kind === 'model' ? 'Models' : 'Images';
  const exts = kind === 'model' ? ['.obj'] : ['.png', '.jpg', '.jpeg'];
  for (const base of [munge(akamai(url)), munge(url)]) {
    for (const ext of exts) {
      const p = path.join(MODS, dir, base + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
};

const stagedByUrl = new Map(); // url -> { rel, w, h } | null
const nameOwner = new Map(); // basename (sans ext) -> url, for slug dedupe
const missing = [];
let converted = 0, copied = 0, skipped = 0;

const claimName = (base, url) => {
  let name = base, n = 2;
  while (nameOwner.has(name) && nameOwner.get(name) !== url) name = `${base}-${n++}`;
  nameOwner.set(name, url);
  return name;
};

/** Stage a cached asset under a stable nickname-based slug. Images >= 2 MB are
 * recompressed to webp capped at maxPx (playbook §4); models get stray line/point
 * records stripped (they render as white wireframe shells in three.js). */
const stage = async (url, kind, baseSlug, { maxPx = 2048 } = {}) => {
  if (!url || !/^https?:/.test(url)) return null;
  if (stagedByUrl.has(url)) return stagedByUrl.get(url);
  const src = findSrc(url, kind);
  if (!src) {
    missing.push(`${kind} ${baseSlug} ${url}`);
    stagedByUrl.set(url, null);
    return null;
  }
  let entry;
  if (kind === 'model') {
    const name = claimName(baseSlug, url) + '.obj';
    const dst = path.join(OUT, name);
    if (!fs.existsSync(dst)) {
      const txt = fs.readFileSync(src, 'utf8');
      fs.writeFileSync(dst, txt.split('\n').filter((l) => !l.startsWith('l ') && !l.startsWith('p ')).join('\n'));
      copied++;
    } else skipped++;
    entry = { rel: `/dark-souls/${name}` };
  } else {
    // recompress anything heavy OR oversized; small token/icon art copies verbatim
    const srcMeta = await sharp(src).metadata();
    const big = fs.statSync(src).size >= 600 * 1024 || Math.max(srcMeta.width, srcMeta.height) > maxPx;
    const ext = big ? '.webp' : path.extname(src).replace('.jpeg', '.jpg');
    const name = claimName(baseSlug, url) + ext;
    const dst = path.join(OUT, name);
    if (!fs.existsSync(dst)) {
      if (big) {
        await sharp(src).resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(dst);
        converted++;
      } else {
        fs.copyFileSync(src, dst);
        copied++;
      }
    } else skipped++;
    const meta = await sharp(dst).metadata();
    entry = { rel: `/dark-souls/${name}`, w: meta.width, h: meta.height };
  }
  stagedByUrl.set(url, entry);
  return entry;
};

// ---- flatten the save (ContainedObjects + States, tracking containers) ------
const flat = [];
const walk = (o, parent, viaState) => {
  const rec = { o, parent, viaState };
  flat.push(rec);
  for (const c of o.ContainedObjects ?? []) walk(c, rec, false);
  for (const [k, s] of Object.entries(o.States ?? {})) walk(s, rec, true);
  return rec;
};
const tops = save.ObjectStates.map((o) => walk(o, null, false));

const bagOf = (rec) => {
  for (let p = rec.parent; p; p = p.parent) if (/Bag/.test(p.o.Name)) return p.o;
  return null;
};
const inDeck = (rec) => {
  for (let p = rec.parent; p; p = p.parent) if (p.o.Name === 'Deck' || p.o.Name === 'DeckCustom') return true;
  return false;
};
const round = (v, p = 3) => (typeof v === 'number' ? +v.toFixed(p) : v);
const tint = (c) => (c && !(c.r === 1 && c.g === 1 && c.b === 1) ? [c.r, c.g, c.b].map((v) => round(v)) : null);

// ---- goldens -----------------------------------------------------------------
const goldT = JSON.parse(fs.readFileSync(path.join(GOLD, 'treasures.json'), 'utf8'));
const goldE = JSON.parse(fs.readFileSync(path.join(GOLD, 'encounters.json'), 'utf8'));
const goldEn = JSON.parse(fs.readFileSync(path.join(GOLD, 'enemies.json'), 'utf8'));

const deckIdByGuid = new Map(); // tts deck guid -> golden group id
const cardIdByDeckCard = new Map(); // `${deckGuid}:${cardID}` -> golden card id
const looseGolden = new Map(); // cardID -> { id, group } for golden cards with no deckGuid
for (const c of goldT.cards) {
  if (c.tts.deckGuid) {
    deckIdByGuid.set(c.tts.deckGuid, c.tts.group);
    cardIdByDeckCard.set(`${c.tts.deckGuid}:${c.tts.cardID}`, c.id);
  } else {
    if (looseGolden.has(c.tts.cardID)) throw new Error(`golden loose cardID collision: ${c.tts.cardID}`);
    looseGolden.set(c.tts.cardID, { id: c.id, group: c.tts.group });
  }
}
const encByDeckCard = new Map(); // `${deck nickname}:${cardId}` -> encounter id
for (const e of goldE) encByDeckCard.set(`${e.deck}:${e.cardId}`, e.id);

// dice colour by die GUID, per golden-draft/dice.json provenance comment
const DIE_COLOR = { f82a35: 'black', '25a9ad': 'blue', '217a7d': 'orange', '3e4967': 'dodge' };

// ---- tiles: dungeon rooms (States chains + bagged double-sided) --------------
// six scale-16.5 tiles at z≈84 hold the room library as States (one nested)
const tiles = [];
const ROOM_ROOTS = ['f94a58', '3baa0d', 'e18678', 'f6dbf7', '4e3624', '0a76c7'];
const collectChainImages = (rec, acc) => {
  // depth-first: the tile itself, then its States in numeric key order
  const url = rec.o.CustomImage?.ImageURL;
  if (rec.o.Name === 'Custom_Tile' && url && !acc.some((r) => r.url === url)) acc.push({ url, guid: rec.o.GUID });
  const kids = flat.filter((r) => r.parent === rec && r.viaState);
  kids.sort((a, b) => +Object.entries(rec.o.States).find(([, s]) => s === a.o)[0] - +Object.entries(rec.o.States).find(([, s]) => s === b.o)[0]);
  for (const k of kids) collectChainImages(k, acc);
  // non-state children too (nothing expected, but be safe)
  for (const k of flat.filter((r) => r.parent === rec && !r.viaState)) collectChainImages(k, acc);
};
const roomChainCounts = {};
const seenRoomRoots = new Set();
for (const top of tops) {
  if (top.o.Name !== 'Custom_Tile' || !ROOM_ROOTS.includes(top.o.GUID) || seenRoomRoots.has(top.o.GUID)) continue;
  seenRoomRoots.add(top.o.GUID); // e18678 exists twice at top level with identical chains
  const acc = [];
  collectChainImages(top, acc);
  roomChainCounts[top.o.GUID] = acc.length;
  const variants = [];
  for (const { url, guid } of acc) {
    const img = await stage(url, 'img', `room-${guid}`);
    variants.push({ id: `room-${guid}`, image: img?.rel, w: img?.w, h: img?.h });
  }
  tiles.push({
    id: `rooms-${top.o.GUID}`, kind: 'room-library', guid: top.o.GUID,
    scale: round(top.o.Transform.scaleX), image: variants[0]?.image, w: variants[0]?.w, h: variants[0]?.h,
    variants,
  });
}

// bagged rooms ("Tiles": 6 double-sided scale-12.78) + boss/mega-boss arenas
for (const rec of flat) {
  const o = rec.o;
  if (o.Name !== 'Custom_Tile') continue;
  const bag = bagOf(rec);
  const bagNick = bag?.Nickname ?? '';
  if (bagNick === 'Tiles' || bagNick === 'Boss Tiles') {
    const base = bagNick === 'Tiles' ? `room-${o.GUID}` : `boss-tile-${o.GUID}`;
    const img = await stage(o.CustomImage.ImageURL, 'img', base);
    const back = await stage(o.CustomImage.ImageSecondaryURL, 'img', `${base}-back`);
    tiles.push({
      id: base, kind: bagNick === 'Tiles' ? 'room-double' : 'boss-tile', guid: o.GUID,
      scale: round(o.Transform.scaleX), image: img?.rel, w: img?.w, h: img?.h,
      back: back?.rel, variants: [],
    });
  } else if (bagNick === 'Mega Boss Tiles') {
    const id = slug(o.Nickname); // Four Kings / Old Iron King / Black Dragon Kalameet
    if (tiles.some((t) => t.id === `arena-${id}`)) continue; // OIK + Kalameet share a duplicated GUID; ids come from nicknames
    const img = await stage(o.CustomImage.ImageURL, 'img', `arena-${id}`);
    const back = await stage(o.CustomImage.ImageSecondaryURL, 'img', `arena-${id}-back`);
    tiles.push({
      id: `arena-${id}`, kind: 'mega-boss-arena', guid: o.GUID,
      scale: round(o.Transform.scaleX), image: img?.rel, w: img?.w, h: img?.h,
      back: back?.rel, variants: [],
    });
  }
}

// ---- boards: backdrop, class boards (unique face + shared back), blank mats --
const boards = [];
for (const top of tops) {
  if (top.o.Name === 'Custom_Board') {
    const img = await stage(top.o.CustomImage.ImageURL, 'img', 'board-backdrop', { maxPx: 4096 });
    boards.push({ id: 'backdrop', guid: top.o.GUID, image: img?.rel, w: img?.w, h: img?.h, scale: round(top.o.Transform.scaleX) });
  }
}
const classBoardRecs = tops
  .filter((r) => r.o.Name === 'Custom_Tile' && r.o.Transform.scaleX === 9.25)
  .sort((a, b) => a.o.Transform.posZ - b.o.Transform.posZ || b.o.Transform.posX - a.o.Transform.posX);
let cbIdx = 0;
for (const rec of classBoardRecs) {
  cbIdx++;
  const id = `class-board-${String(cbIdx).padStart(2, '0')}`; // faces unnamed in the mod; class identification is a later vision pass
  const img = await stage(rec.o.CustomImage.ImageURL, 'img', id);
  const back = await stage(rec.o.CustomImage.ImageSecondaryURL, 'img', 'class-board-back');
  boards.push({ id, guid: rec.o.GUID, image: img?.rel, w: img?.w, h: img?.h, back: back?.rel, scale: 9.25 });
}
// many mats share one blank Drive image (layout slots for kits/play areas)
const matRec = tops.find((r) => r.o.Name === 'Custom_Tile' && r.o.Transform.scaleX === 5.82);
if (matRec) {
  const img = await stage(matRec.o.CustomImage.ImageURL, 'img', 'mat-blank');
  boards.push({ id: 'mat-blank', guid: matRec.o.GUID, image: img?.rel, w: img?.w, h: img?.h, scale: 5.82 });
}
// the scale-4 three-state reference tile (#a4fdec) — keep its variants
const refTile = tops.find((r) => r.o.GUID === 'a4fdec');
if (refTile) {
  const acc = [];
  collectChainImages(refTile, acc);
  const variants = [];
  for (const { url, guid } of acc) {
    const img = await stage(url, 'img', `ref-board-${guid}`);
    variants.push({ id: `ref-board-${guid}`, image: img?.rel, w: img?.w, h: img?.h });
  }
  boards.push({ id: 'ref-board-a4fdec', guid: 'a4fdec', image: variants[0]?.image, w: variants[0]?.w, h: variants[0]?.h, variants });
}

// ---- health dials: 10 class healthbars + the boss-dial contraption -----------
const healthDials = [];
for (const rec of flat) {
  const m = /^(.+) Moveable Healthbar$/.exec(rec.o.Nickname ?? '');
  if (!m || rec.o.Name !== 'Custom_Tile') continue;
  const id = slug(m[1]);
  const img = await stage(rec.o.CustomImage.ImageURL, 'img', `healthbar-${id}`);
  healthDials.push({ id, guid: rec.o.GUID, image: img?.rel, w: img?.w, h: img?.h });
}
const dialTile = tops.find((r) => r.o.GUID === '7cb5fc');
const dialKnob = tops.find((r) => r.o.GUID === 'ede278');
const dialNote = flat.find((r) => r.o.Name === 'Notecard' && r.o.Nickname === 'Dial Instructions');
const bossDial = {
  face: (await stage(dialTile?.o.CustomImage.ImageURL, 'img', 'boss-dial'))?.rel,
  back: (await stage(dialTile?.o.CustomImage.ImageSecondaryURL, 'img', 'boss-dial-back'))?.rel,
  knobMesh: (await stage(dialKnob?.o.CustomMesh?.MeshURL, 'model', 'dial-knob'))?.rel,
  instructions: dialNote?.o.Description ?? null,
};

// ---- minis --------------------------------------------------------------------
// explicit ids/kinds for the unnamed, uncontained sculpts (identified in SCOUT.md
// / by deviantart diffuse filenames); everything else derives from nicknames.
const MINI_OVERRIDE = {
  ede278: null, // boss-dial knob — staged above, not a mini
  505795: { id: 'four-kings-1', kind: 'boss' },
  '57fa21': { id: 'four-kings-2', kind: 'boss' },
  '4303e5': { id: 'four-kings-3', kind: 'boss' },
  '090d53': { id: 'four-kings-4', kind: 'boss' },
  '8bfa5b': { id: 'megaboss-standee', kind: 'boss' }, // scale-7 standee, likely Old Iron King
  '3319b8': { id: 'black-dragon-kalameet', kind: 'boss' }, // diffuse: kalameet_idle_by_itchydani3l
  b38e43: { id: 'class-unknown-1', kind: 'character' }, // scale-0.875 pastebin sculpt, z=-80 class row
  '045693': { id: 'class-unknown-2', kind: 'character' }, // diffuse: bandit_by_itchydani3l
  '5d013e': { id: 'barrel-2', kind: 'scenery' }, // nested alt barrel sculpt
};
const CLASS_MINIS = new Set(['warrior', 'knight', 'herald', 'assassin', 'sorcerer', 'class-unknown-1', 'class-unknown-2']);
const NPC_MINIS = new Set(['blacksmith-andre', 'firekeeper']);
const SUMMONS = new Set(['eygon-of-carim', 'witch-beatrice']);
const enemyIds = new Set(goldEn.enemies.map((e) => e.data.id));
const invaderIds = new Set(goldEn.invaders.map((e) => e.data.id));
const SCENERY = new Set(['barrel', 'barrel-2', 'tombstone', 'tombstone-alt', 'chest-mimic', 'fog-wall']);

const minis = [];
const miniIds = new Set();
for (const rec of flat) {
  const o = rec.o;
  if (o.Name !== 'Custom_Model' && o.Name !== 'Figurine_Custom') continue;
  const over = MINI_OVERRIDE[o.GUID];
  if (over === null) continue;
  const bag = bagOf(rec);
  let id = over?.id;
  if (!id) {
    // prefer whichever of (own nickname, dispenser-bag nickname) is a golden id
    // — the Plow Scarecrow bag's mini is nicknamed just "Scarecrow"
    const cands = [o.Nickname, bag?.Nickname]
      .filter(Boolean)
      .map((s) => canon(slug(s.replace(/\?/g, '').replace('Chest - Mimic', 'Chest Mimic'))));
    if (!cands.length) throw new Error(`unidentifiable mini ${o.GUID}`);
    id = cands.find((c) => enemyIds.has(c) || invaderIds.has(c)) ?? cands[0];
  }
  if (miniIds.has(id)) {
    if (id === 'mushroom-parent' && o.Transform.scaleX === 1) id = 'mushroom-child'; // dispenser sample carries the parent's nickname
    else continue; // duplicate sculpt (voracious mimic = hungry mimic mesh, second dispenser copy, ...)
  }
  miniIds.add(id);
  const kind =
    over?.kind ??
    (CLASS_MINIS.has(id) ? 'character'
      : NPC_MINIS.has(id) ? 'npc'
      : SUMMONS.has(id) ? 'summon'
      : invaderIds.has(id) ? 'invader'
      : SCENERY.has(id) ? 'scenery'
      : enemyIds.has(id) || enemyIds.has(id.replace(/-alt$/, '')) ? 'enemy'
      : 'boss');
  const entry = {
    id, guid: o.GUID, name: o.Nickname || bag?.Nickname || null, kind,
    scale: round(o.Transform.scaleX),
  };
  if (o.Name === 'Custom_Model') {
    entry.mesh = (await stage(o.CustomMesh.MeshURL, 'model', `mini-${id}`))?.rel;
    entry.texture = (await stage(o.CustomMesh.DiffuseURL, 'img', `mini-${id}-diffuse`))?.rel ?? null;
  } else {
    entry.mesh = null; // flat standee
    entry.flat = true;
    entry.texture = (await stage(o.CustomImage.ImageURL, 'img', `mini-${id}`))?.rel;
    if (o.CustomImage.ImageSecondaryURL) {
      entry.textureBack = (await stage(o.CustomImage.ImageSecondaryURL, 'img', `mini-${id}-back`))?.rel;
    }
  }
  const t = tint(o.ColorDiffuse);
  if (t) entry.tint = t;
  minis.push(entry);
}

// ---- decks --------------------------------------------------------------------
const deckRecs = flat.filter((r) => r.o.Name === 'Deck' || r.o.Name === 'DeckCustom');
const deckIdCounts = new Map();
const decks = [];
let goldenTreasureHits = 0, goldenEncounterHits = 0;

const stageSheets = async (deckId, customDeck) => {
  const sheets = {};
  for (const [key, s] of Object.entries(customDeck ?? {})) {
    const face = await stage(s.FaceURL, 'img', `cards-${deckId}-s${key}`, { maxPx: 4096 });
    const back = await stage(s.BackURL, 'img', `cards-${deckId}-s${key}-back`, { maxPx: 4096 });
    sheets[key] = {
      image: face?.rel, w: face?.w, h: face?.h,
      cols: s.NumWidth, rows: s.NumHeight,
      back: back?.rel, uniqueBack: !!s.UniqueBack,
    };
  }
  return sheets;
};

for (const rec of deckRecs) {
  const o = rec.o;
  const bag = bagOf(rec);
  let id = deckIdByGuid.get(o.GUID) ?? (o.Nickname ? slug(o.Nickname) : null);
  if (!id) {
    if (!bag?.Nickname) throw new Error(`unidentifiable deck ${o.GUID}`);
    id = `${canon(slug(bag.Nickname.replace(/\?/g, '')))}-behaviour`;
  }
  const n = (deckIdCounts.get(id) ?? 0) + 1;
  deckIdCounts.set(id, n);
  if (n > 1) id = `${id}-${n}`; // Smough & Ornstein has three unnamed behaviour decks
  const sheets = await stageSheets(id, o.CustomDeck);
  const cards = (o.ContainedObjects ?? []).map((c) => {
    let cardId = cardIdByDeckCard.get(`${o.GUID}:${c.CardID}`);
    if (cardId) goldenTreasureHits++;
    if (!cardId) {
      cardId = encByDeckCard.get(`${o.Nickname}:${c.CardID}`);
      if (cardId) goldenEncounterHits++;
    }
    if (!cardId) cardId = c.Nickname ? slug(c.Nickname) : `c${c.CardID}`;
    return { id: cardId, cardID: c.CardID, sheet: String(Math.floor(c.CardID / 100)), cell: c.CardID % 100 };
  });
  decks.push({ id, guid: o.GUID, name: o.Nickname || null, container: bag?.Nickname || null, sheets, cards });
}

// loose cards (incl. cards sitting inside bags but not in any deck) grouped into
// pseudo-decks: golden groups (start-core / start-extra / loose-s25), the named
// data reference cards, and the unnamed per-expansion reference singles
const looseRecs = flat.filter((r) => (r.o.Name === 'Card' || r.o.Name === 'CardCustom') && !inDeck(r));
const pseudo = new Map(); // group id -> { sheetsRaw, cards }
let goldenLooseHits = 0;
for (const rec of looseRecs) {
  const o = rec.o;
  const g = looseGolden.get(o.CardID);
  let group, cardId;
  if (g) {
    group = g.group;
    cardId = g.id;
    goldenLooseHits++;
  } else if (o.Nickname) {
    group = 'loose-data';
    cardId = slug(o.Nickname);
  } else {
    group = 'reference';
    cardId = `c${o.CardID}`;
  }
  const p = pseudo.get(group) ?? { sheetsRaw: {}, cards: [] };
  for (const [key, s] of Object.entries(o.CustomDeck ?? {})) p.sheetsRaw[key] = s;
  if (!p.cards.some((c) => c.cardID === o.CardID && c.id === cardId)) {
    p.cards.push({ id: cardId, cardID: o.CardID, sheet: String(Math.floor(o.CardID / 100)), cell: o.CardID % 100 });
  }
  pseudo.set(group, p);
}
for (const [group, p] of pseudo) {
  decks.push({ id: group, guid: null, name: null, container: 'loose', sheets: await stageSheets(group, p.sheetsRaw), cards: p.cards });
}

// ---- dice ---------------------------------------------------------------------
const dice = {};
const diceCounts = {};
for (const rec of flat) {
  if (rec.o.Name !== 'Custom_Dice') continue;
  const url = rec.o.CustomImage?.ImageURL;
  const color = Object.entries(DIE_COLOR).find(([g]) => rec.o.GUID === g)?.[1]
    ?? Object.values(dice).find((d) => d.url === url)?.color;
  // resolve colour by sheet URL for the other 44 dice
  let c = color;
  if (!c) for (const [col, d] of Object.entries(dice)) if (d.url === url) c = col;
  if (!c) throw new Error(`die ${rec.o.GUID} has an unknown face sheet ${url}`);
  diceCounts[c] = (diceCounts[c] ?? 0) + 1;
  if (!dice[c]) {
    const img = await stage(url, 'img', `dice-${c}`);
    dice[c] = { color: c, url, image: img?.rel, w: img?.w, h: img?.h, grid: { cols: 3, rows: 3 }, count: 0 };
  }
}
for (const [c, n] of Object.entries(diceCounts)) dice[c].count = n;
for (const d of Object.values(dice)) delete d.url;

// ---- tokens / markers / conditions ---------------------------------------------
const tokens = [];
const tokenByImage = new Map(); // face url -> token entry
// tokens dedupe by face art, but copies can carry DIFFERENT backs (trap tiles:
// one face, six trap types on the backs; invasion tokens / mimic chests too) —
// collect every distinct back per face
const addToken = async (id, o, extra = {}) => {
  const url = o.CustomImage?.ImageURL;
  if (!url) return;
  let entry = tokenByImage.get(url);
  if (!entry) {
    const img = await stage(url, 'img', `token-${id}`);
    entry = {
      id, guid: o.GUID, name: o.Nickname || null, image: img?.rel, w: img?.w, h: img?.h,
      backs: [], scale: round(o.Transform.scaleX), ...extra,
    };
    entry._backUrls = new Set();
    tokenByImage.set(url, entry);
    tokens.push(entry);
  }
  const burl = o.CustomImage?.ImageSecondaryURL;
  if (burl && !entry._backUrls.has(burl)) {
    entry._backUrls.add(burl);
    const back = await stage(burl, 'img', `token-${entry.id}-back${entry.backs.length ? `-${entry.backs.length + 1}` : ''}`);
    if (back) entry.backs.push(back.rel);
  }
};

for (const rec of flat) {
  const o = rec.o;
  const nick = o.Nickname ?? '';
  if (/^Custom_Token/.test(o.Name)) {
    if (nick) await addToken(canon(slug(nick.replace(/[()]/g, ''))), o);
    else await addToken(`ref-${o.GUID}`, o, { note: 'unnamed reference/condition chart piece' });
  } else if (o.Name === 'Custom_Tile' || o.Name === 'Custom_Tile_Stack') {
    const bag = bagOf(rec);
    const s = o.Transform.scaleX;
    if (bag?.Nickname === 'Traps') {
      await addToken('trap', o);
    } else if (nick && s < 4) {
      await addToken(canon(slug(nick.replace(/\?/g, ''))), o);
    } else if (!nick && (s === 1.32 || s === 0.65 || s === 0.5 || s === 1)) {
      await addToken(`token-${o.GUID}`, o); // per-player token trios (double-sided) + small unnamed markers
    }
  }
}
for (const t of tokens) delete t._backUrls;

// ---- manifest -------------------------------------------------------------------
const manifest = {
  source: 'TTS mod 1210887127 (Dark Souls TBG + official add-ons, Darkroot, Four Kings, Old Iron King, Black Dragon Kalameet)',
  generatedBy: 'tools/tts-extract/extract-dark-souls.mjs',
  tiles, boards, minis, decks, dice, tokens, healthDials, bossDial,
};
fs.writeFileSync(path.join(OUT, 'ds-manifest.json'), JSON.stringify(manifest, null, 1));

// ---- prune files no longer referenced (keeps renames idempotent) ------------------
const referenced = new Set([...stagedByUrl.values()].filter(Boolean).map((e) => path.basename(e.rel)));
const KEEP = /^(ds-manifest\.json|rulebook.*\.pdf|.*-logo\..*)$/;
for (const f of fs.readdirSync(OUT)) {
  if (!referenced.has(f) && !KEEP.test(f)) {
    fs.unlinkSync(path.join(OUT, f));
    console.log('pruned stale file:', f);
  }
}

// ---- assertions (fail loudly) -----------------------------------------------------
const fail = [];
const expect = (cond, msg) => { if (!cond) fail.push(msg); };

expect(missing.length === 0, `missing from cache (${missing.length}):\n  ${missing.join('\n  ')}`);
// every art URL in the save must have gone through stage() (colliders/normals
// are physics/shader-only and intentionally skipped)
const allArtUrls = new Map();
for (const { o } of flat) {
  const note = (u, why) => { if (u && /^https?:/.test(u) && !allArtUrls.has(u)) allArtUrls.set(u, why); };
  const tag = `${o.Name} "${o.Nickname ?? ''}" ${o.GUID}`;
  note(o.CustomMesh?.MeshURL, `mesh ${tag}`);
  note(o.CustomMesh?.DiffuseURL, `diffuse ${tag}`);
  note(o.CustomImage?.ImageURL, `image ${tag}`);
  note(o.CustomImage?.ImageSecondaryURL, `imageBack ${tag}`);
  for (const s of Object.values(o.CustomDeck ?? {})) { note(s.FaceURL, `sheet face ${tag}`); note(s.BackURL, `sheet back ${tag}`); }
}
const unstaged = [...allArtUrls].filter(([u]) => !stagedByUrl.has(u));
expect(unstaged.length === 0, `art URLs never staged (${unstaged.length}):\n  ${unstaged.map(([u, w]) => `${w} -> ${u.slice(-44)}`).join('\n  ')}`);
for (const m of minis) expect(m.texture || m.tint || m.flat, `mini ${m.id} has neither texture nor tint`);
const EXPECTED_ROOMS = { f94a58: 21, '3baa0d': 9, e18678: 9, f6dbf7: 9, '4e3624': 8, '0a76c7': 7 };
for (const [g, n] of Object.entries(EXPECTED_ROOMS)) {
  expect(roomChainCounts[g] === n, `room chain ${g}: expected ${n} unique faces, got ${roomChainCounts[g]}`);
}
expect(tiles.filter((t) => t.kind === 'room-library').length === 6, 'expected 6 States-based room libraries');
expect(tiles.filter((t) => t.kind === 'room-double').length === 6, 'expected 6 double-sided bag rooms');
expect(tiles.filter((t) => t.kind === 'mega-boss-arena').length === 3, 'expected 3 mega-boss arenas');
expect(deckRecs.length === 71, `expected 71 decks, got ${deckRecs.length}`);
const deckCardCount = decks.filter((d) => d.guid).reduce((a, d) => a + d.cards.length, 0);
expect(deckCardCount === 504, `expected 504 deck cards, got ${deckCardCount}`);
expect(looseRecs.length === 71, `expected 71 loose cards, got ${looseRecs.length}`);
const goldenTreasureInDecks = goldT.cards.filter((c) => c.tts.deckGuid).length;
expect(goldenTreasureHits === goldenTreasureInDecks, `golden treasure cards matched ${goldenTreasureHits}/${goldenTreasureInDecks}`);
expect(goldenLooseHits === looseGolden.size, `golden loose cards matched ${goldenLooseHits}/${looseGolden.size}`);
expect(goldenEncounterHits === goldE.length, `golden encounter cards matched ${goldenEncounterHits}/${goldE.length}`);
for (const g of deckIdByGuid.keys()) {
  expect(decks.some((d) => d.guid === g), `golden deck guid ${g} (${deckIdByGuid.get(g)}) not found in save`);
}
expect(Object.keys(dice).length === 4, `expected 4 dice colours, got ${Object.keys(dice).join(',')}`);
expect(Object.values(diceCounts).every((n) => n === 12), `expected 12 dice per colour: ${JSON.stringify(diceCounts)}`);
expect(minis.length >= 40, `expected 40+ distinct minis, got ${minis.length}`);
for (const id of [...enemyIds]) expect(miniIds.has(id), `golden enemy ${id} has no mini`);
for (const id of [...invaderIds]) expect(miniIds.has(id), `golden invader ${id} has no mini`);
expect(healthDials.length === 10, `expected 10 class healthbars, got ${healthDials.length}`);
expect(boards.filter((b) => b.id.startsWith('class-board-')).length === 10, 'expected 10 class boards');
expect(!!bossDial.face && !!bossDial.back && !!bossDial.knobMesh, 'boss dial art incomplete');
for (const m of minis) expect(m.mesh || m.texture, `mini ${m.id} staged neither mesh nor texture`);

// ---- summary ------------------------------------------------------------------
const staged = [...stagedByUrl.values()].filter(Boolean);
const files = fs.readdirSync(OUT).filter((f) => f !== 'ds-manifest.json');
const totalBytes = files.reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
const roomFaces = tiles.filter((t) => t.kind === 'room-library').reduce((a, t) => a + t.variants.length, 0);

console.log('--- Dark Souls TBG extract summary -------------------------------');
console.log(`tiles:       ${tiles.length} entries (${roomFaces} room faces in 6 States libraries + 6 bag rooms + 2 boss + 3 arenas)`);
console.log(`boards:      ${boards.length} (backdrop, 10 class boards + shared back, mats, ref)`);
console.log(`minis:       ${minis.length} (${['character', 'enemy', 'boss', 'invader', 'summon', 'npc', 'scenery'].map((k) => `${minis.filter((m) => m.kind === k).length} ${k}`).join(', ')})`);
console.log(`decks:       ${decks.length} (${decks.filter((d) => d.guid).length} real + ${pseudo.size} loose groups), ${decks.reduce((a, d) => a + d.cards.length, 0)} cards`);
console.log(`dice:        ${Object.keys(dice).length} face sheets (${Object.entries(diceCounts).map(([c, n]) => `${c} x${n}`).join(', ')})`);
console.log(`tokens:      ${tokens.length} distinct art pieces`);
console.log(`healthbars:  ${healthDials.length} + boss dial (face/back/knob)`);
console.log(`golden:      treasures ${goldenTreasureHits}+${goldenLooseHits} loose, encounters ${goldenEncounterHits}, enemies/invaders ${[...enemyIds, ...invaderIds].filter((id) => miniIds.has(id)).length}/${enemyIds.size + invaderIds.size} minis`);
console.log(`staged:      ${staged.length} unique assets -> ${files.length} files, ${mb(totalBytes)} (${converted} webp-recompressed, ${copied} copied, ${skipped} already present)`);
if (fail.length) {
  console.error('\nFAILED CHECKS:');
  for (const f of fail) console.error(' - ' + f);
  process.exit(1);
}
console.log('all checks green');
