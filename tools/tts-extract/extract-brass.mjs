// Extract the golden setup spec for Brass: Birmingham from the TTS mod itself.
//
// Two linked sources, joined by GUID:
//   - the mod's Lua (lib/App/Birmingham.ttslua + lib/App.ttslua): the logical
//     setup — tile catalog, board graph, market structure, key object GUIDs,
//     starting funds, and rules constants.
//   - the save JSON: the physical initial state — deck compositions, pre-filled
//     markets, marker start spaces, per-color tile sets, and every transform.
//
// Emits:
//   games/brass-birmingham/golden/mod-setup.json    (logical golden)
//   games/brass-birmingham/golden/board-layout.json (spatial layout)
//
// The extractor cross-checks the two sources against each other (tile stack
// totals vs the Lua catalog, market fills, deck sizes, location square counts)
// so a parse bug in either side fails loudly instead of producing a bad golden.
//
// Usage: node tools/tts-extract/extract-brass.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mod = join(root, 'tts-mods', 'brass_birmingham');
const outDir = join(root, 'games', 'brass-birmingham', 'golden');
mkdirSync(outDir, { recursive: true });

const birminghamLua = readFileSync(join(mod, 'lib', 'App', 'Birmingham.ttslua'), 'utf8');
const appLua = readFileSync(join(mod, 'lib', 'App.ttslua'), 'utf8');
const stateLua = readFileSync(join(mod, 'lib', 'State.ttslua'), 'utf8');
const save = JSON.parse(readFileSync(join(mod, 'Brass -- Birmingham -- Kini.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Minimal Lua literal parser: parses table constructors made of literals.
// Wrapper calls like lock({...}), rconst(rlock({...})) are unwrapped.
// ---------------------------------------------------------------------------

function parseLuaValue(src, pos) {
  const ws = () => {
    for (;;) {
      while (pos < src.length && /\s/.test(src[pos])) pos++;
      if (src.startsWith('--', pos)) { while (pos < src.length && src[pos] !== '\n') pos++; }
      else return;
    }
  };
  const err = (msg) => { throw new Error(`Lua parse: ${msg} at ...${src.slice(Math.max(0, pos - 40), pos + 40)}...`); };

  function value() {
    ws();
    const c = src[pos];
    if (c === '{') return table();
    if (c === '"' || c === "'") return str();
    if (c === '-' || /\d/.test(c)) return num();
    const id = ident();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'nil') return null;
    ws();
    if (src[pos] === '(') { // wrapper call: lock(...), const(...), rconst(rlock(...))
      pos++;
      const v = value();
      ws();
      if (src[pos] !== ')') err(`expected ) after ${id}(...`);
      pos++;
      return v;
    }
    err(`unsupported identifier '${id}'`);
  }

  function str() {
    const q = src[pos++];
    let out = '';
    while (pos < src.length && src[pos] !== q) {
      if (src[pos] === '\\') { out += src[pos + 1]; pos += 2; }
      else out += src[pos++];
    }
    pos++;
    return out;
  }

  function num() {
    const m = /^-?\d+(\.\d+)?/.exec(src.slice(pos));
    if (!m) err('bad number');
    pos += m[0].length;
    return Number(m[0]);
  }

  function ident() {
    const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(pos));
    if (!m) err('expected identifier');
    pos += m[0].length;
    return m[0];
  }

  function table() {
    pos++; // {
    const arr = [];
    const obj = {};
    let hasKeys = false;
    for (;;) {
      ws();
      if (src[pos] === '}') { pos++; break; }
      if (src[pos] === '[') {
        pos++;
        const k = value();
        ws();
        if (src[pos] !== ']') err('expected ]');
        pos++;
        ws();
        if (src[pos] !== '=') err('expected = after [key]');
        pos++;
        obj[k] = value();
        hasKeys = true;
      } else {
        // could be `name = value` or a positional value
        const save = pos;
        if (/[A-Za-z_]/.test(src[pos])) {
          const id = ident();
          ws();
          if (src[pos] === '=' && src[pos + 1] !== '=') {
            pos++;
            obj[id] = value();
            hasKeys = true;
          } else {
            pos = save;
            arr.push(value());
          }
        } else {
          arr.push(value());
        }
      }
      ws();
      if (src[pos] === ',' || src[pos] === ';') pos++;
    }
    if (hasKeys && arr.length) { obj.__array = arr; return obj; }
    return hasKeys ? obj : arr;
  }

  const v = value();
  return { value: v, end: pos };
}

/** Find `marker` in src and parse the Lua value that follows the next '='. */
function extractAssigned(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error(`marker not found: ${marker}`);
  const eq = src.indexOf('=', i + marker.length - 1);
  return parseLuaValue(src, eq + 1).value;
}

function extractNumber(src, name) {
  const m = new RegExp(`self\\.${name}\\s*=\\s*(-?[\\d.]+|true|false)`).exec(src);
  if (!m) throw new Error(`scalar not found: ${name}`);
  return m[1] === 'true' ? true : m[1] === 'false' ? false : Number(m[1]);
}

// ---------------------------------------------------------------------------
// Parse the Lua sources
// ---------------------------------------------------------------------------

const industryTiles = extractAssigned(birminghamLua, 'self.industry_tile_data =');
const locations = extractAssigned(birminghamLua, 'self.locations =');
const links = extractAssigned(birminghamLua, 'self.links =');
const externalBonuses = extractAssigned(birminghamLua, 'self.bonuses_by_external_location =');
const bhamGuids = extractAssigned(birminghamLua, 'local guids =');
const appGuids = extractAssigned(appLua, 'local guids =');

const constants = {
  initialFunds: extractNumber(birminghamLua, 'initial_funds'),
  loanAmount: extractNumber(birminghamLua, 'loan_amount'),
  hasImmediateVps: extractNumber(birminghamLua, 'has_immediate_vps'),
  moneyValue: extractNumber(birminghamLua, 'money_value'),
  handSize: 8, // App:refill_hands — `local needs = 8 - self:get_hand_card_count(...)`
  roundsPerEra: { 2: 10, 3: 9, 4: 8 }, // State:update_derived — `num_rounds = 12 - num_players`
  maxLinkValue: 12, // App.MAX_LINK_VALUE
  playersDrawDeadCardAtStart: true, // App:deal_dead_card_to_players (face down into discard 1)
  linksPerPlayerPerEra: 14, // App:provide_links — spawns 14 copies into each link bag
};
if (!/needs = 8 -/.test(appLua)) throw new Error('hand size 8 no longer matches App.ttslua');
if (!/num_rounds\s+= opts\.short and 1 or 12 - derived\.num_players/.test(stateLua)) throw new Error('rounds formula changed');
if (!/App\.MAX_LINK_VALUE = 12/.test(appLua)) throw new Error('MAX_LINK_VALUE changed');

// Income track: App:income_by_track_offset, offsets 0..99 (verbatim formula).
function incomeByTrackOffset(ofs) {
  if (ofs <= 10) return Math.trunc((ofs - 0) / 1) + -10;
  if (ofs <= 30) return Math.trunc((ofs - 11) / 2) + 1;
  if (ofs <= 60) return Math.trunc((ofs - 31) / 3) + 11;
  if (ofs <= 100) return Math.trunc((ofs - 61) / 4) + 21;
  return 30;
}
const incomeTrack = Array.from({ length: 100 }, (_, i) => incomeByTrackOffset(i));

// Merchant slot -> external location + player counts. The merchants array in
// Birmingham.ttslua is ordered and annotated with comments; recover the labels
// by scanning the block's comment lines.
const merchantsBlock = birminghamLua.slice(
  birminghamLua.indexOf('merchants = {'),
  birminghamLua.indexOf('location_squares'),
);
const merchantMeta = [];
{
  let current = null;
  for (const line of merchantsBlock.split('\n')) {
    const cm = /--\s*([A-Za-z]+)\s+((?:\d,?\s*(?:and)?\s*)+)players/.exec(line);
    if (cm) current = { location: cm[1], players: (cm[2].match(/\d/g) || []).map(Number) };
    if (/merchant_zone\s*=/.test(line)) merchantMeta.push(current);
  }
}
if (merchantMeta.length !== bhamGuids.merchants.length || merchantMeta.some((m) => !m)) {
  throw new Error('merchant slot annotations did not line up with the merchants array');
}

// ---------------------------------------------------------------------------
// Index the save
// ---------------------------------------------------------------------------

const byGuid = new Map();
const allObjs = [];
(function walk(list) {
  for (const o of list || []) {
    byGuid.set(o.GUID, o);
    allObjs.push(o);
    if (o.ContainedObjects) walk(o.ContainedObjects);
    if (o.States) walk(Object.values(o.States));
  }
})(save.ObjectStates);

const need = (guid, why) => {
  const o = byGuid.get(guid);
  if (!o) throw new Error(`guid ${guid} (${why}) not in save`);
  return o;
};
const xz = (o) => [o.Transform.posX, o.Transform.posZ];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Decks per player count: card cell ids from the bagged decks.
const COLORS = ['Orange', 'Purple', 'Teal', 'Yellow'];
const decks = {};
appGuids.card_deck_bags.forEach((bagGuid, i) => {
  const players = i + 2;
  const bag = need(bagGuid, `card deck bag ${players}p`);
  const deck = bag.ContainedObjects[0];
  const sheets = {};
  for (const [id, cd] of Object.entries(deck.CustomDeck)) {
    sheets[id] = { faceUrl: cd.FaceURL, backUrl: cd.BackURL, cols: cd.NumWidth, rows: cd.NumHeight };
  }
  const cells = {};
  for (const cardId of deck.DeckIDs) cells[cardId] = (cells[cardId] || 0) + 1;
  decks[players] = { size: deck.DeckIDs.length, cells, sheets };
});

// Merchant tile decks per player count: identity is in each tile's GMNotes.
const merchantTiles = {};
bhamGuids.merchant_tile_decks.forEach((deckGuid, i) => {
  const players = i + 2;
  const deck = need(deckGuid, `merchant deck ${players}p`);
  merchantTiles[players] = deck.ContainedObjects.map((c) => c.GMNotes || 'Blank');
});

// Market fill state: cubes with GMNotes Coal/Iron sitting on the market zones.
function marketFill(zoneGuids, resource) {
  return zoneGuids.map((zg) => {
    const z = need(zg, `${resource} market zone`);
    return allObjs.some((o) => o.GMNotes === resource && dist(xz(o), xz(z)) < 0.5) ? 1 : 0;
  });
}
const coalFill = marketFill(bhamGuids.coal_market_zones, 'Coal');
const ironFill = marketFill(bhamGuids.iron_market_zones, 'Iron');

// Marker starting offsets: nearest track zone to each color's markers.
const trackPos = appGuids.track_zones.map((g) => xz(need(g, 'track zone')));
function trackOffset(obj) {
  let best = 0, bestD = Infinity;
  trackPos.forEach((p, i) => {
    const d = dist(xz(obj), p);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (bestD > 1.5) throw new Error(`marker ${obj.GMNotes} is not on the track (nearest ${bestD})`);
  return best;
}
const markerStarts = {};
for (const color of COLORS) {
  const p = appGuids.players[color];
  markerStarts[color] = {
    income: trackOffset(need(p.income_marker, `${color} income marker`)),
    score: trackOffset(need(p.score_marker, `${color} score marker`)),
  };
}

// Per-color industry tile sets: singles (Custom_Tile) + stacks (Number copies).
const tileSets = Object.fromEntries(COLORS.map((c) => [c, {}]));
for (const o of allObjs) {
  if (o.Name !== 'Custom_Tile' && o.Name !== 'Custom_Tile_Stack') continue;
  const m = /^(Orange|Purple|Teal|Yellow) (.+)$/.exec(o.GMNotes || '');
  if (!m || !industryTiles[m[2]]) continue;
  tileSets[m[1]][m[2]] = (tileSets[m[1]][m[2]] || 0) + (o.Name === 'Custom_Tile_Stack' ? o.Number : 1);
}

// Wild cards: they live inside Deck containers at the wild deck zones, and
// contained objects don't carry world transforms — but their GMNotes are
// unique to those decks, so a global count is exact.
need(bhamGuids.wild_location_deck_zone, 'wild location zone');
need(bhamGuids.wild_industry_deck_zone, 'wild industry zone');
const wilds = {
  location: allObjs.filter((o) => o.GMNotes === 'Wild Location Card').length,
  industry: allObjs.filter((o) => o.GMNotes === 'Wild Industry Card').length,
};

// ---------------------------------------------------------------------------
// Cross-checks: the two sources must agree
// ---------------------------------------------------------------------------

const checks = [];
const check = (ok, msg) => { checks.push({ ok, msg }); if (!ok) console.error(`CHECK FAILED: ${msg}`); };

// Every color's physical tile set matches the Lua catalog counts exactly.
for (const color of COLORS) {
  for (const [name, data] of Object.entries(industryTiles)) {
    const have = tileSets[color][name] || 0;
    check(have === data.count, `${color} ${name}: save has ${have}, Lua catalog says ${data.count}`);
  }
  const extras = Object.keys(tileSets[color]).filter((n) => !industryTiles[n]);
  check(extras.length === 0, `${color} has unknown tiles: ${extras}`);
}

// Location squares in the Lua GUID table == flattened locations lists.
const squareNames = Object.keys(bhamGuids.location_squares).sort();
const flatLocs = Object.values(locations).flat().sort();
check(JSON.stringify(squareNames) === JSON.stringify(flatLocs), 'location squares == flattened locations');
for (const g of Object.values(bhamGuids.location_squares)) need(g, 'location square');

// Link zones == links.
check(
  JSON.stringify(Object.keys(bhamGuids.link_zones).sort()) === JSON.stringify(Object.keys(links).sort()),
  'link zones == links',
);
for (const g of Object.values(bhamGuids.link_zones)) need(g, 'link zone');

// Deck sizes: canonical Brass Birmingham deck sizes by player count.
check(decks[2].size === 40 && decks[3].size === 54 && decks[4].size === 64, `deck sizes ${decks[2].size}/${decks[3].size}/${decks[4].size}`);

// Markets: coal 13/14 filled, iron 8/10 filled (empties come first in "order emptied").
check(coalFill.reduce((a, b) => a + b, 0) === 13 && coalFill[0] === 0, `coal market fill ${coalFill.join('')}`);
check(ironFill.reduce((a, b) => a + b, 0) === 8 && ironFill[0] === 0 && ironFill[1] === 0, `iron market fill ${ironFill.join('')}`);

// All markers start on the same offsets across colors.
const inc0 = markerStarts.Orange.income, sc0 = markerStarts.Orange.score;
check(COLORS.every((c) => markerStarts[c].income === inc0 && markerStarts[c].score === sc0), 'marker starts uniform across colors');

// Merchant deck sizes match the number of active merchant slots per player count.
for (const players of [2, 3, 4]) {
  const slots = merchantMeta.filter((m) => m.players.includes(players)).length;
  check(merchantTiles[players].length === slots, `${players}p merchant deck ${merchantTiles[players].length} == ${slots} slots`);
}

check(wilds.location === 4 && wilds.industry === 4, `wild cards ${wilds.location}/${wilds.industry}`);

// Card map (cell index -> card identity), authored from the deck sheet art.
const cardMapPath = join(dirname(fileURLToPath(import.meta.url)), 'brass-birmingham-cardmap.json');
let cardMap = null;
if (existsSync(cardMapPath)) {
  cardMap = JSON.parse(readFileSync(cardMapPath, 'utf8'));
  for (const players of [2, 3, 4]) {
    const named = {};
    const list = []; // the full deck expanded to individual cards, for dealing
    for (const [cardId, n] of Object.entries(decks[players].cells)) {
      // all decks share one 7x5 sheet; cell index = CardID % 100
      const cell = Number(cardId) % 100;
      const entry = cardMap.cells[String(cell)];
      if (!entry) throw new Error(`cardmap missing cell for CardID ${cardId}`);
      named[entry.name] = (named[entry.name] || 0) + n;
      for (let k = 0; k < n; k++) list.push({ cell, name: entry.name, kind: entry.kind });
      // location cards must reference a real board location
      check(entry.kind !== 'location' || !!locations[entry.name], `card '${entry.name}' is a board location`);
    }
    decks[players].cards = named;
    decks[players].list = list;
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`cross-checks: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error('EXTRACTION INVALID — golden not written.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Emit the goldens
// ---------------------------------------------------------------------------

const modSetup = {
  game: 'brass-birmingham',
  source: {
    repo: 'https://github.com/ikegami/tts_brass',
    save: 'Brass -- Birmingham -- Kini.json',
    lua: ['lib/App/Birmingham.ttslua', 'lib/App.ttslua', 'lib/State.ttslua'],
  },
  constants,
  incomeTrack,
  industryTiles,
  locations,
  links,
  externalBonuses,
  merchants: merchantMeta.map((m, i) => ({
    location: m.location,
    players: m.players,
    merchantZone: bhamGuids.merchants[i].merchant_zone,
    beerZone: bhamGuids.merchants[i].beer_zone,
  })),
  merchantTiles,
  decks,
  wildCards: wilds,
  markets: {
    coal: { slots: bhamGuids.coal_market_zones.length, fill: coalFill },
    iron: { slots: bhamGuids.iron_market_zones.length, fill: ironFill },
  },
  markerStarts: { income: inc0, score: sc0 },
  playerColors: COLORS,
  playerTileSets: tileSets,
};

writeFileSync(join(outDir, 'mod-setup.json'), JSON.stringify(modSetup, null, 2));

// Also drop a copy where the shared engine imports it (createBrass consumes it
// directly, so the setup logic and the golden can never drift apart).
const sharedData = join(root, 'shared', 'src', 'brass', 'setup-data.json');
mkdirSync(dirname(sharedData), { recursive: true });
writeFileSync(sharedData, JSON.stringify(modSetup));

// Spatial layout: board-relative positions for everything the table renders.
const board = need(appGuids.game_board, 'game board');
const bt = board.Transform;
function layoutEntry(guid, kind, name) {
  const o = byGuid.get(guid);
  if (!o) return null;
  const t = o.Transform;
  return {
    guid, kind, name,
    world: { pos: [t.posX, t.posY, t.posZ], rot: [t.rotX, t.rotY, t.rotZ], scale: [t.scaleX, t.scaleY, t.scaleZ] },
    boardRel: [(t.posX - bt.posX), (t.posY - bt.posY), (t.posZ - bt.posZ)],
  };
}
const layout = {
  board: { guid: appGuids.game_board, transform: bt },
  entries: [
    ...Object.entries(bhamGuids.location_squares).map(([n, g]) => layoutEntry(g, 'locationSquare', n)),
    ...Object.entries(bhamGuids.link_zones).map(([n, g]) => layoutEntry(g, 'linkZone', n)),
    ...bhamGuids.coal_market_zones.map((g, i) => layoutEntry(g, 'coalMarket', `coal ${i}`)),
    ...bhamGuids.iron_market_zones.map((g, i) => layoutEntry(g, 'ironMarket', `iron ${i}`)),
    ...appGuids.track_zones.map((g, i) => layoutEntry(g, 'track', `track ${i}`)),
    ...bhamGuids.merchants.flatMap((m, i) => [
      layoutEntry(m.merchant_zone, 'merchantZone', `${merchantMeta[i].location} merchant ${i}`),
      layoutEntry(m.beer_zone, 'merchantBeer', `${merchantMeta[i].location} beer ${i}`),
    ]),
    ...COLORS.flatMap((c) => {
      const p = appGuids.players[c];
      return [
        layoutEntry(p.mat, 'playerMat', `${c} mat`),
        layoutEntry(p.income_marker, 'incomeMarker', c),
        layoutEntry(p.score_marker, 'scoreMarker', c),
        layoutEntry(p.turn_order_token, 'turnToken', c),
        layoutEntry(p.wallet_bowl, 'walletBowl', c),
      ];
    }),
    ...appGuids.player_turns.flatMap((pt, i) => [
      layoutEntry(pt.turn_order_token_zone, 'turnZone', `turn ${i + 1}`),
      layoutEntry(pt.bowl, 'spentBowl', `spent ${i + 1}`),
    ]),
    layoutEntry(appGuids.play_deck_zone, 'deckZone', 'draw deck'),
    layoutEntry(bhamGuids.wild_location_deck_zone, 'deckZone', 'wild location'),
    layoutEntry(bhamGuids.wild_industry_deck_zone, 'deckZone', 'wild industry'),
    layoutEntry(bhamGuids.coal_bag, 'resourceBag', 'coal'),
    layoutEntry(bhamGuids.iron_bag, 'resourceBag', 'iron'),
    layoutEntry(bhamGuids.beer_bag, 'resourceBag', 'beer'),
    layoutEntry(appGuids.game_table, 'table', 'game table'),
  ].filter(Boolean),
};
writeFileSync(join(outDir, 'board-layout.json'), JSON.stringify(layout, null, 2));

console.log(`mod-setup.json: ${Object.keys(industryTiles).length} tile types, ${Object.keys(locations).length} locations, ${Object.keys(links).length} links, decks ${[2, 3, 4].map((p) => decks[p].size).join('/')}${cardMap ? ' (named)' : ' (cells only — no cardmap yet)'}`);
console.log(`board-layout.json: ${layout.entries.length} placed entries`);
