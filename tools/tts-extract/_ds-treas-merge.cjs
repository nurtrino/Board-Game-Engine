// TEMP script: merge ds-treas transcription batches into games/dark-souls/golden-draft/treasures.json
// Run from repo root: node tools/tts-extract/_ds-treas-merge.cjs
const fs = require('fs');
const path = require('path');

const BASE = 'C:/Users/chase/AppData/Local/Temp/claude/C--Users-chase-Desktop-Board-Game-Engine/83cf08bf-c658-49c6-bd83-6309f28971a2/scratchpad/ds-treas';
const REPO = 'C:/Users/chase/Desktop/Board Game Engine';
const OUTFILE = path.join(REPO, 'games/dark-souls/golden-draft/treasures.json');

// ---- load batches ----
const records = [];
for (let i = 1; i <= 8; i++) {
  const arr = JSON.parse(fs.readFileSync(path.join(BASE, 'out', `batch-${i}.json`), 'utf8'));
  for (const r of arr) records.push(r);
}

// ---- validate against manifests ----
const expected = new Map();
for (let i = 1; i <= 8; i++) {
  const man = JSON.parse(fs.readFileSync(path.join(BASE, `manifest-${i}.json`), 'utf8'));
  for (const fn of man) {
    const m = fn.match(/^(.+)__(\d+)\.png$/);
    expected.set(Number(m[2]), m[1]);
  }
}
const got = new Set(records.map((r) => r.cardID));
const missing = [...expected.keys()].filter((id) => !got.has(id));
const extra = [...got].filter((id) => !expected.has(id));
const dupes = records.map((r) => r.cardID).filter((id, i, a) => a.indexOf(id) !== i);
if (missing.length || extra.length || dupes.length) {
  console.error('MISSING:', missing.join(',') || 'none');
  console.error('EXTRA:', extra.join(',') || 'none');
  console.error('DUPES:', [...new Set(dupes)].join(',') || 'none');
  process.exit(1);
}

// ---- deck naming ----
// Class identity of the 5-card decks is inferred from card contents + type-icon pairing
// (chest overlay variant; blue-orb glow = transposed). Flagged as inferred in meta.
const DECK_NAMES = {
  'core-treasure': ['core-treasure', '3d2c27'],
  'transmuted': ['transmuted-treasure', '8f98ec'],
  'darkroot': ['darkroot-treasure', '706129'],
  'boss-winged-knight': ['boss-winged-knight', '421eb7'],
  'boss-gargoyle': ['boss-gargoyle', '268086'],
  'boss-old-dragonslayer': ['boss-old-dragonslayer', '4be97c'],
  'boss-smelter-demon': ['boss-smelter-demon', 'b34452'],
  'boss-dancer': ['boss-dancer-of-the-boreal-valley', '5c6480'],
  'boss-boreal-outrider': ['boss-boreal-outrider-knight', '1edf62'],
  'boss-ornstein-smough': ['boss-ornstein-and-smough', '5c02ba'],
  'boss-titanite-demon': ['boss-titanite-demon', '044d7a'],
  'boss-sif': ['boss-great-grey-wolf-sif', '41525b'],
  'boss-artorias': ['boss-artorias', 'f881da'],
  'boss-four-kings': ['boss-four-kings', '3f0f26'],
  'boss-old-iron-king': ['boss-old-iron-king', 'bfd1de'],
  'boss-kalameet': ['boss-black-dragon-kalameet', '3ad29c'],
  'classdeck-51': ['warrior-class-treasure', '51403d'],
  'classdeck-52': ['warrior-transposed', '2b842c'],
  'classdeck-53': ['knight-class-treasure', 'bebdf4'],
  'classdeck-54': ['knight-transposed', '585ba3'],
  'classdeck-55': ['herald-class-treasure', 'a861d0'],
  'classdeck-56': ['herald-transposed', '541756'],
  'classdeck-57': ['assassin-class-treasure', '8ee2a5'],
  'classdeck-58': ['assassin-transposed', '551cc9'],
  'classdeck-59': ['sorcerer-class-treasure', 'fc31ac'],
  'classdeck-60': ['sorcerer-transposed', '3fde62'],
  'classdeck-61': ['cleric-class-treasure', '6b7e64'],
  'classdeck-62': ['cleric-transposed', '12bd1c'],
  'classdeck-63': ['deprived-class-treasure', '01ea3e'],
  'classdeck-64': ['deprived-transposed', '57a3b1'],
  'classdeck-65': ['mercenary-class-treasure', 'f914d8'],
  'classdeck-66': ['mercenary-transposed', '391ba0'],
  'classdeck-67': ['pyromancer-class-treasure', 'b29f64'],
  'classdeck-68': ['pyromancer-transposed', '135ab4'],
  'classdeck-69': ['thief-class-treasure', 'cd5f1c'],
  'classdeck-70': ['thief-transposed', '9a8d72'],
};
function deckFor(group, cardID) {
  if (DECK_NAMES[group]) return DECK_NAMES[group][0];
  if (group === 'start-core') {
    if (cardID <= 2033) return 'starting-herald';
    if (cardID <= 2036) return 'starting-warrior';
    if (cardID <= 2039) return 'starting-knight';
    return 'starting-assassin';
  }
  if (group === 'start-extra') {
    if (cardID <= 48108) return 'starting-cleric';
    if (cardID <= 48121) return 'starting-deprived';
    if (cardID <= 48135) return 'starting-mercenary';
    if (cardID <= 48149) return 'starting-pyromancer';
    return 'starting-thief';
  }
  if (group === 'loose-s25') {
    if (cardID >= 2527 && cardID <= 2530) return 'starting-sorcerer';
    if (cardID === 2541) return 'invader-kirk-knight-of-thorns';
    if (cardID === 2542) return 'invader-longfinger-kirk';
  }
  return group;
}

// ---- slot classification (visual pass over zoomed slot-icon strips; authoritative) ----
const TWO_HANDED = new Set([
  2325, 2357, 2361, 2363, 2365, 2367, 2400, 2326, 2327, 2328, 2329, 2330, 2405, 2427,
  47000, 47002, 47003, 47005, 47009, 46715, 46716, 46619,
  2026, 2027, 2023, 2024, 2018, 2015, 2029, 2600, 2601, 48022,
  2403, 2404, 2401, 2317, 2418, 2422, 48112, 48126, 48129, 48138, 48139, 48145, 48164, 48162,
]);
// cards whose agent slotIcon was hand-like/null but which are actually armour upgrades
// (verified: top-left circle shows the armour-figure-with-arrow upgrade icon)
const ARMOUR_UPGRADE_OVERRIDE = new Set([48111, 48114, 48125, 48130, 48136, 48142]);

// ---- per-card patches (icons the batch-4 agent flagged UNREADABLE, resolved by my own solo reads) ----
const PATCHES = {
  48115: (r) => { r.special = 'You can equip this [one-handed] in one hand while you have a [two-handed] in your other hand'; r.flags = ['special text resolved by second reader from zoomed crop; same pairing rule as Effigy Shield / Small Leather Shield']; },
  47005: (r) => { r.actions[1].icons = ['node']; r.flags = (r.flags || []).filter((f) => !/UNREADABLE/.test(f)); r.flags.push('row-2 icon resolved as node (solid disc in broken ring) by second reader'); },
  2533: (r) => { r.actions[0].icons = ['stagger', 'node']; r.flags = (r.flags || []).filter((f) => !/UNREADABLE/.test(f)); r.flags.push('row icons resolved as stagger + node by second reader (shield-with-figure glyph read as stagger; interpretive)'); },
};

const slug = (s) => String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function normDice(d) {
  const o = {};
  if (!d) return o;
  for (const k of ['black', 'blue', 'orange']) if (d[k]) o[k] = d[k];
  if (d.flat) o.flat = d.flat;
  return o;
}

function deriveKind(r, slot) {
  const art = (r.artSubject || '').toLowerCase();
  const name = (r.name || '').toLowerCase();
  if (slot === 'weapon-upgrade' || slot === 'armour-upgrade') return 'upgrade';
  if (slot === 'armour') return 'armour';
  if (name === 'ember') return 'item';
  if (/scroll|spell/.test(art)) return 'spell';
  if (/shield|parma|buckler/.test(name) || /shield|buckler/.test(art)) return 'shield';
  return 'weapon';
}

const out = [];
const seenIds = new Map();
const flagged = [];
for (const r of records) {
  if (PATCHES[r.cardID]) PATCHES[r.cardID](r);
  const group = r.group;
  const deck = deckFor(group, r.cardID);

  // slot
  let slot, twoHanded;
  const agentSlot = (r.slotIcon || '').toLowerCase();
  if (ARMOUR_UPGRADE_OVERRIDE.has(r.cardID)) slot = 'armour-upgrade';
  else if (agentSlot === 'upgrade-weapon') slot = 'weapon-upgrade';
  else if (agentSlot === 'upgrade-armour') slot = 'armour-upgrade';
  else if (agentSlot === 'armour' || agentSlot === 'armor') slot = 'armour';
  else if (agentSlot.startsWith('none') || r.slotIcon === null) slot = 'none';
  else { slot = 'hand'; twoHanded = TWO_HANDED.has(r.cardID); }

  const kind = deriveKind(r, slot);

  let id = slug(r.name || `unreadable-${r.cardID}`);
  if (seenIds.has(id)) {
    const n = seenIds.get(id) + 1;
    seenIds.set(id, n);
    id = `${id}-${n}`;
  } else seenIds.set(id, 1);

  const card = { id, deck, name: r.name, kind };
  if (slot !== 'none') card.slot = slot;
  if (slot === 'hand') card.twoHanded = !!twoHanded;

  const req = r.requirements || {};
  card.requirements = { str: req.str || 0, dex: req.dex || 0, int: req.int || 0, fai: req.fai || 0 };
  if (typeof r.range === 'number') card.range = r.range;
  else if (r.range === 'infinity') card.range = 'infinity';

  if (Array.isArray(r.actions) && r.actions.length) {
    card.actions = r.actions.map((a) => {
      const act = { staminaCost: a.stamina ?? 0 };
      const dice = normDice(a.dice);
      if (Object.keys(dice).length) act.dice = dice;
      if (a.flat) act.flatModifier = a.flat;
      if (a.icons && a.icons.length) act.icons = a.icons;
      if (a.text) act.text = a.text;
      return act;
    });
  }
  if (r.defence) {
    const block = normDice(r.defence.block), resist = normDice(r.defence.resist);
    if (r.defence.blockFlat) block.flat = r.defence.blockFlat;
    if (r.defence.resistFlat) resist.flat = r.defence.resistFlat;
    card.defence = { block, resist, dodge: r.defence.dodge || 0 };
  }
  if (typeof r.upgradeSlots === 'number') card.upgradeSlots = r.upgradeSlots;
  if (r.special) card.special = r.special;
  if (group === 'transmuted') card.embered = true;
  card.icons = { type: r.typeIcon, set: r.setIcon };
  if (r.artSubject) card.art = r.artSubject;
  card.tts = { cardID: r.cardID, group, deckGuid: DECK_NAMES[group] ? DECK_NAMES[group][1] : undefined };
  if (r.flags && r.flags.length) card.flags = r.flags;

  const unreadable = JSON.stringify(r).includes('UNREADABLE');
  if (unreadable) flagged.push({ cardID: r.cardID, id, deck, flags: r.flags || [] });
  out.push(card);
}

// ---- report ----
const counts = {};
for (const c of out) counts[c.deck] = (counts[c.deck] || 0) + 1;
console.log('total cards:', out.length);
console.log('counts per deck:');
for (const [d, n] of Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${d}: ${n}`);
console.log('UNREADABLE cards:', flagged.length);
for (const f of flagged) console.log('  ', f.cardID, f.id, JSON.stringify(f.flags));
const kinds = {};
for (const c of out) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
console.log('kinds:', kinds);
console.log('twoHanded:', out.filter((c) => c.twoHanded).length);

fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });
fs.writeFileSync(OUTFILE, JSON.stringify({
  source: 'TTS Dark Souls TBG mod save — CustomDeck sheet images (scout/inventory.json); transcribed card-by-card from cached sheet crops',
  notes: [
    'Class assignment of the 5-card class/transposed decks is inferred from card contents and type-icon pairing (chest overlay variant; blue-orb glow = transposed); TTS deck GUID in tts.deckGuid is the ground truth identity.',
    'twoHanded was classified visually from zoomed slot-icon crops: single-fist-with-bird glyph = one-handed, two-fists-on-shaft glyph = two-handed.',
    'defence.block/resist values are dice counts by colour; "flat" is a printed +/- modifier to the roll.',
    'actions[].staminaCost is the bracketed cost; dice counts by colour; flatModifier is printed +/-N; icons per core rulebook p.40 (magic/node/shaft/shift/repeat/push/range overrides/conditions).',
    'special is verbatim rules text with inline icons in square brackets.',
    'embered=true marks the Transmuted Treasure deck (ember-glow chest type icon).',
  ],
  generatedAt: '2026-07-10',
  cards: out,
}, null, 2));
console.log('wrote', OUTFILE);
