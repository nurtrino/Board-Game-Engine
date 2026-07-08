// Stage the assets the Brass board viewer needs into client/public/bb/ and
// emit scene.json describing the physical table exactly as the TTS save has
// it: board + table meshes, then EVERY top-level physical object (tiles, tile
// stacks, models/cubes/markers, decks, tokens, bowls, bags) at its transform.
// Contained objects (cards inside decks, tiles inside bags) are intentionally
// not rendered — they are hidden in TTS too.
//
// Skipped (with a note): Custom_Assetbundle (Unity bundles need extraction),
// Custom_PDF, sound cubes, hand/scripting triggers (zones come from the
// golden board-layout.json instead).
//
// Usage: node tools/tts-extract/prep-viewer-assets.mjs

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mod = join(root, 'tts-mods', 'brass_birmingham');
const outDir = join(root, 'client', 'public', 'bb');
mkdirSync(outDir, { recursive: true });

const save = JSON.parse(readFileSync(join(mod, 'Brass -- Birmingham -- Kini.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(mod, 'assets', 'manifest.json'), 'utf8'));
const layout = JSON.parse(readFileSync(join(root, 'games', 'brass-birmingham', 'golden', 'board-layout.json'), 'utf8'));

const byUrl = new Map(manifest.map((e) => [e.url, e.file]));

const staged = new Set();
function stage(url, why) {
  if (!url) return null;
  const file = byUrl.get(url);
  if (!file) throw new Error(`asset not downloaded for ${why}: ${url}`);
  if (!staged.has(file)) {
    copyFileSync(join(mod, 'assets', file), join(outDir, file));
    staged.add(file);
  }
  return `/bb/${file}`;
}

// Image dimensions from PNG IHDR / JPEG SOF markers. TTS sizes Custom_Tiles
// area-preserving by image aspect (w = 2*scale*sqrt(A), d = 2*scale/sqrt(A)),
// so the renderer needs each face image's aspect ratio.
function imageDims(file) {
  const buf = readFileSync(join(mod, 'assets', file));
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  throw new Error(`cannot read dimensions of ${file}`);
}
const aspectCache = new Map();
function aspectOf(url) {
  const file = byUrl.get(url);
  if (!aspectCache.has(file)) {
    const { w, h } = imageDims(file);
    aspectCache.set(file, w / h);
  }
  return aspectCache.get(file);
}

function placement(o) {
  const t = o.Transform;
  return {
    pos: [t.posX, t.posY, t.posZ],
    rot: [t.rotX, t.rotY, t.rotZ],
    scale: [t.scaleX, t.scaleY, t.scaleZ],
  };
}
const tint = (o) => (o.ColorDiffuse ? [o.ColorDiffuse.r, o.ColorDiffuse.g, o.ColorDiffuse.b] : null);
// GMNotes is the mod's own identity channel (e.g. "Teal Brewery I"); Nicknames
// are display fluff ("Points"). Identity first.
const name = (o) => o.GMNotes || o.Nickname || o.Name;

const BOARD = '4ee1f2', TABLE = '02b512';
const SKIP_GUIDS = new Set([BOARD, TABLE, '44828f', 'be6906']); // sound cubes
const SKIP_TYPES = new Set(['ScriptingTrigger', 'HandTrigger', 'Custom_PDF', 'BlockSquare']);

// Per-color component GUIDs (from App.ttslua init_objects — same table the
// golden extractor parses). Used to group the scene: the TV renders group
// 'board'; each player's device renders 'mat:<Color>'; 'side' is staging and
// reference clutter only the dev viewer shows.
const PLAYER_GUIDS = {
  Orange: { mat: '535035', wallet: 'f4d107', linkBag: '3fd996', canal: 'd319a0', rail: '5cd3b7' },
  Purple: { mat: '9f5d4d', wallet: '6e1823', linkBag: '0354b2', canal: '3026c3', rail: '2b73b5' },
  Teal: { mat: 'c924e1', wallet: 'ab3868', linkBag: '02fb12', canal: 'b8d1b6', rail: 'ea9667' },
  Yellow: { mat: '918d17', wallet: '820239', linkBag: '219821', canal: 'e808b2', rail: '80c4b1' },
};
// Only the mat board itself is pinned to its color group; the wallet bowl and
// link bag are money/link staging (tracked as numbers) and go to 'side'.
const MAT_GROUP_BY_GUID = new Map();
for (const [color, g] of Object.entries(PLAYER_GUIDS)) {
  MAT_GROUP_BY_GUID.set(g.mat, `mat:${color}`);
}

function groupOf(o) {
  const byGuid = MAT_GROUP_BY_GUID.get(o.GUID); // the four player mats
  if (byGuid) return byGuid;
  const label = o.Nickname || o.GMNotes || '';
  // pre-game staging that setup consumes: merchant decks get distributed, the
  // card-distribution reference tile is setup-only
  if (/^Merchants for /.test(label)) return 'side';
  if (o.GUID === '0e72f9') return 'side'; // card distribution reference tile
  if (o.GUID === 'a40e5c') return 'side'; // "Removed from Game" holder — empty reference spot, a dark disc on the board's right
  // Off-board money/resource staging is clutter on the shared views (the game
  // tracks money/resources as numbers, not physical piles): the Gold/Silver/
  // Bronze money coins, the coal/iron/beer resource bags, and the black
  // spent-money bowls. Send them to 'side' so only the dev viewer shows them.
  if (o.Name.startsWith('Custom_Model') && ['Gold', 'Silver', 'Bronze'].includes(label)) return 'side';
  if ((o.Name === 'Infinite_Bag' || o.Name === 'Bag') && ['Coal', 'Iron', 'Beer'].includes(label)) return 'side';
  if (/ Links$/.test(label)) return 'side'; // per-color link bags (links tracked as a number)
  if (o.Name === 'Bowl') return 'side'; // wallet + spent-money bowls
  const { posX: x, posZ: z } = o.Transform;
  // staging rows (link source tiles, deck bags) and table-edge reference cards
  if (Math.abs(z) > 24 || Math.abs(x) > 24) return 'side';
  // a color's industry tile pool lives on its mat, well off the board
  const m = /^(Orange|Purple|Teal|Yellow) /.exec(o.GMNotes || '');
  if (m && Math.abs(x) > 13) return `mat:${m[1]}`;
  return 'board';
}

function customModel(o, why) {
  return {
    t: 'model',
    mesh: stage(o.CustomMesh.MeshURL, why),
    diffuse: o.CustomMesh.DiffuseURL ? stage(o.CustomMesh.DiffuseURL, why) : null,
    tint: tint(o),
    place: placement(o),
    name: name(o),
  };
}

const objects = [];
const skipped = {};
for (const o of save.ObjectStates) {
  if (SKIP_GUIDS.has(o.GUID) || SKIP_TYPES.has(o.Name)) continue;
  const why = `${o.Name} ${name(o)} (${o.GUID})`;
  const before = objects.length;
  switch (o.Name) {
    case 'Custom_Model':
    case 'Custom_Model_Bag':
    case 'Custom_Model_Infinite_Bag':
      objects.push(customModel(o, why));
      break;
    case 'Custom_Tile':
    case 'Custom_Tile_Stack': {
      const ci = o.CustomImage;
      objects.push({
        t: 'tile',
        image: stage(ci.ImageURL, why),
        back: ci.ImageSecondaryURL ? stage(ci.ImageSecondaryURL, why) : null,
        aspect: aspectOf(ci.ImageURL),
        thickness: ci.CustomTile?.Thickness ?? 0.1,
        count: o.Name === 'Custom_Tile_Stack' ? o.Number : 1,
        place: placement(o),
        name: name(o),
      });
      break;
    }
    case 'Custom_Token': {
      const ci = o.CustomImage;
      objects.push({
        t: 'token',
        image: stage(ci.ImageURL, why),
        aspect: aspectOf(ci.ImageURL),
        thickness: ci.CustomToken?.Thickness ?? 0.2,
        place: placement(o),
        name: name(o),
      });
      break;
    }
    case 'Deck': {
      const cd = Object.values(o.CustomDeck ?? {})[0];
      // Wild piles (Wild Location / Wild Industry) sit face up on the board;
      // tag them so the post-pass below turns them into face-up card stacks.
      const wildNote = (o.ContainedObjects ?? [])
        .map((c) => c.GMNotes || '')
        .find((n) => /Wild (Location|Industry) Card/.test(n));
      objects.push({
        t: 'deck',
        back: cd ? stage(cd.BackURL, why) : null,
        count: o.DeckIDs?.length ?? 1,
        place: placement(o),
        name: name(o),
        ...(wildNote ? { _wild: /Location/.test(wildNote) ? 'location' : 'industry' } : {}),
      });
      break;
    }
    case 'Bowl':
      objects.push({ t: 'bowl', tint: tint(o), place: placement(o), name: name(o) });
      break;
    case 'Bag':
    case 'Infinite_Bag':
      objects.push({ t: 'bag', tint: tint(o), place: placement(o), name: name(o) });
      break;
    default:
      skipped[o.Name] = (skipped[o.Name] || 0) + 1;
  }
  for (let i = before; i < objects.length; i++) objects[i].group = groupOf(o);
}

const boardObj = save.ObjectStates.find((o) => o.GUID === BOARD);
const tableObj = save.ObjectStates.find((o) => o.GUID === TABLE);

const scene = {
  board: customModel(boardObj, 'game board'),
  table: customModel(tableObj, 'game table'),
  objects,
  // playerMat/table zones are real rendered objects now — drawing their zone
  // quads too made coplanar surfaces fight (the flashing mats).
  zones: layout.entries
    .filter((e) => e.kind !== 'playerMat' && e.kind !== 'table')
    .map((e) => ({ kind: e.kind, name: e.name, pos: e.world.pos, rot: e.world.rot, scale: e.world.scale })),
};

// Card face sheet (7x5 grid) so personal screens can crop each hand card's art.
// All three per-count decks share one face image; cell index = CardID % 100.
const cardDeckBag = save.ObjectStates.find((o) => o.GUID === '959e1a');
const playDeckDef = Object.values(cardDeckBag.ContainedObjects[0].CustomDeck)[0];
scene.cardSheet = { image: stage(playDeckDef.FaceURL, 'card face sheet'), cols: 7, rows: 5 };
scene.cardBack = stage(playDeckDef.BackURL, 'card back');

// Turn the tagged wild piles into face-up card stacks. The wild faces live on
// the shared play-deck sheet (cell 1 = Wild Location, cell 2 = Wild Industry),
// so a face-up stack just crops that cell onto its top.
const WILD_CELL = { location: 1, industry: 2 };
for (const obj of objects) {
  if (!obj._wild) continue;
  const cell = WILD_CELL[obj._wild];
  obj.t = 'cardpile';
  obj.face = scene.cardSheet.image;
  obj.cols = scene.cardSheet.cols;
  obj.rows = scene.cardSheet.rows;
  obj.cell = cell;
  obj.name = obj._wild === 'location' ? 'Wild Location' : 'Wild Industry';
  delete obj._wild;
}

// ---- setup pieces: what the start script places dynamically ----

// Turn order tokens: each color's portrait tile (the player's "profile piece"),
// placed onto the turn-order track at game start.
const TOKEN_GUIDS = { Orange: '749e60', Purple: 'e19c38', Teal: '1d7a31', Yellow: 'dd63fc' };
scene.turnTokens = {};
for (const [color, g] of Object.entries(TOKEN_GUIDS)) {
  const o = save.ObjectStates.find((x) => x.GUID === g);
  scene.turnTokens[color] = {
    image: stage(o.CustomImage.ImageURL, `${color} token`),
    back: o.CustomImage.ImageSecondaryURL ? stage(o.CustomImage.ImageSecondaryURL, `${color} token back`) : null,
    aspect: aspectOf(o.CustomImage.ImageURL),
    scale: o.Transform.scaleX,
    tint: tint(o),
  };
}

// The mod author's card-distribution cheat sheet (reference tile 0e72f9).
{
  const ref = save.ObjectStates.find((o) => o.GUID === '0e72f9');
  scene.cheatSheet = { image: stage(ref.CustomImage.ImageURL, 'cheat sheet'), aspect: aspectOf(ref.CustomImage.ImageURL) };
}

// The mod author's ACTION reference sheet (the table-edge reference tokens):
// explains Build/Sell/Loan/Scout/Develop/Network + the consume rules. This is
// what the "?" button opens.
{
  const tok = save.ObjectStates.find((o) => o.Name === 'Custom_Token');
  scene.actionsSheet = { image: stage(tok.CustomImage.ImageURL, 'actions sheet'), aspect: aspectOf(tok.CustomImage.ImageURL) };
}

// Beer barrel: the mod's beer pieces are TTS's built-in Tileset_Barrel, whose
// model ships inside Tabletop Simulator itself. Extracted from the user's own
// install via UnityPy (rpg_barrel mesh + barrel_diff texture) into the assets
// dir as tts_rpg_barrel.obj / tts_barrel_diff.png. Rendered with its natural
// brown wood texture — the red look in TTS came from the mod's tint, dropped
// here on request.
for (const f of ['tts_rpg_barrel.obj', 'tts_barrel_diff.png']) {
  copyFileSync(join(mod, 'assets', f), join(outDir, f));
  staged.add(f);
}
scene.beerBarrel = { mesh: '/bb/tts_rpg_barrel.obj', diffuse: '/bb/tts_barrel_diff.png' };

// Coins (money spent display): the Gold/Silver/Bronze bags all share one coin
// OBJ with per-denomination diffuse textures. £15 gold, £5 silver, £1 bronze.
const COIN_BAGS = { gold: '3e9524', silver: '85f55a', bronze: 'e5d759' };
scene.coins = {};
for (const [denom, g] of Object.entries(COIN_BAGS)) {
  const bag = save.ObjectStates.find((x) => x.GUID === g);
  const piece = bag.CustomMesh ? bag : bag.ContainedObjects[0];
  scene.coins[denom] = {
    mesh: stage(piece.CustomMesh.MeshURL, `${denom} coin`),
    diffuse: piece.CustomMesh.DiffuseURL ? stage(piece.CustomMesh.DiffuseURL, `${denom} coin diffuse`) : null,
    aspect: piece.CustomMesh.DiffuseURL ? aspectOf(piece.CustomMesh.DiffuseURL) : 1,
    scale: piece.Transform.scaleX,
  };
}

// Merchant tiles: a 3x2 card sheet; identity is per-card GMNotes. Collect one
// cell per label across all three merchant decks (Blank = empty GMNotes).
scene.merchantTiles = { cells: {}, sheet: null };
for (const g of ['856fbc', '02cf54', 'ce01c4']) {
  const deck = save.ObjectStates.find((x) => x.GUID === g);
  const cd = Object.values(deck.CustomDeck)[0];
  if (!scene.merchantTiles.sheet) {
    scene.merchantTiles.sheet = {
      image: stage(cd.FaceURL, 'merchant sheet'),
      back: stage(cd.BackURL, 'merchant back'),
      cols: cd.NumWidth,
      rows: cd.NumHeight,
    };
  }
  for (const card of deck.ContainedObjects) {
    const label = card.GMNotes || 'Blank';
    if (!(label in scene.merchantTiles.cells)) scene.merchantTiles.cells[label] = card.CardID % 100;
  }
}

writeFileSync(join(outDir, 'scene.json'), JSON.stringify(scene, null, 2));
const byType = {};
for (const o of objects) byType[o.t] = (byType[o.t] || 0) + 1;
console.log(`staged ${staged.size} assets; ${objects.length} objects ${JSON.stringify(byType)}; ${scene.zones.length} zones`);
console.log('skipped types:', JSON.stringify(skipped), '+ assetbundles/PDF/sound/triggers by design');

// Mask the board diffuse margins: the framed map fills the centre, but the
// margins carry off-board staging outlines (BEER/BARRELS/MONEY on one side,
// STRAW/COAL/IRON on the other) we don't use. The board is a UV-mapped plane,
// so we can't crop (that would shift the map out from under the pieces) —
// instead blacken everything outside the framed map. Keep-region as fractions
// of image size (measured on the 6144^2 diffuse: frame content x[1174,5052]
// y[1089,5071]; buffered), so it survives a future higher-res board swap.
const boardDiffuse = join(outDir, scene.board.diffuse.replace('/bb/', ''));
const KEEP = { xL: 0.176, xR: 0.833, yT: 0.163, yB: 0.838 };
{
  const meta = await sharp(boardDiffuse).metadata();
  const { width: W, height: H } = meta;
  const keep = {
    left: Math.round(W * KEEP.xL),
    top: Math.round(H * KEEP.yT),
    width: Math.round(W * (KEEP.xR - KEEP.xL)),
    height: Math.round(H * (KEEP.yB - KEEP.yT)),
  };
  const region = await sharp(boardDiffuse).extract(keep).toBuffer();
  const tmp = boardDiffuse + '.tmp.jpg';
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: region, left: keep.left, top: keep.top }])
    .jpeg({ quality: 92 })
    .toFile(tmp);
  renameSync(tmp, boardDiffuse);
  console.log(`masked board margins -> kept ${keep.width}x${keep.height} of ${W}x${H}`);
}
