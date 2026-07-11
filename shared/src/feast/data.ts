import type {
  FeastActionGroup, FeastActionSpaceDefinition, FeastAmount,
  FeastBoardDefinition, FeastBounds, FeastGood, FeastGoodDefinition,
  FeastOccupationDefinition, FeastPrintedEffect, FeastSpecialDefinition,
  FeastWeapon,
} from './types.js';
import actionSpaceGolden from './golden/action-spaces.json';
import boardGolden from './golden/boards.json';
import mountainGolden from './golden/mountains.json';
import occupationGolden from './golden/occupations.json';
import specialGolden from './golden/special-tiles.json';

// ---------------------------------------------------------------------------
// Standard goods
// ---------------------------------------------------------------------------

const good = (
  id: FeastGood, name: string, color: FeastGoodDefinition['color'],
  width: number, height: number, reverse: FeastGood | null,
  upgrade: FeastGood | null, animal = false,
): FeastGoodDefinition => ({ id, name, color, width, height, reverse, upgrade, animal });

export const FEAST_GOODS: readonly FeastGoodDefinition[] = [
  good('peas', 'Peas', 'orange', 2, 1, 'mead', 'mead'),
  good('flax', 'Flax', 'orange', 3, 1, 'stockfish', 'stockfish'),
  good('beans', 'Beans', 'orange', 2, 2, 'milk', 'milk'),
  good('grain', 'Grain', 'orange', 4, 1, 'salt-meat', 'salt-meat'),
  good('cabbage', 'Cabbage', 'orange', 3, 2, 'game-meat', 'game-meat'),
  good('fruits', 'Fruits', 'orange', 3, 3, 'whale-meat', 'whale-meat'),

  good('mead', 'Mead', 'red', 2, 1, 'peas', 'oil'),
  good('stockfish', 'Stockfish', 'red', 3, 1, 'flax', 'hide'),
  good('milk', 'Milk', 'red', 2, 2, 'beans', 'wool'),
  good('salt-meat', 'Salt Meat', 'red', 4, 1, 'grain', 'linen'),
  good('game-meat', 'Game Meat', 'red', 3, 2, 'cabbage', 'skin-and-bones'),
  good('whale-meat', 'Whale Meat', 'red', 3, 3, 'fruits', 'robe'),
  good('sheep', 'Sheep', 'red', 4, 2, 'pregnant-sheep', 'fur', true),
  good('pregnant-sheep', 'Pregnant Sheep', 'red', 4, 2, 'sheep', 'fur', true),
  good('cattle', 'Cattle', 'red', 4, 3, 'pregnant-cattle', 'clothing', true),
  good('pregnant-cattle', 'Pregnant Cattle', 'red', 4, 3, 'cattle', 'clothing', true),

  good('oil', 'Oil', 'green', 2, 1, 'rune-stone', 'rune-stone'),
  good('hide', 'Hide', 'green', 3, 1, 'silverware', 'silverware'),
  good('wool', 'Wool', 'green', 2, 2, 'chest', 'chest'),
  good('linen', 'Linen', 'green', 4, 1, 'silk', 'silk'),
  good('skin-and-bones', 'Skin and Bones', 'green', 3, 2, 'spices', 'spices'),
  good('fur', 'Fur', 'green', 4, 2, 'jewelry', 'jewelry'),
  good('robe', 'Robe', 'green', 3, 3, 'treasure-chest', 'treasure-chest'),
  good('clothing', 'Clothing', 'green', 4, 3, 'silver-hoard', 'silver-hoard'),

  good('rune-stone', 'Rune Stone', 'blue', 2, 1, 'oil', null),
  good('silverware', 'Silverware', 'blue', 3, 1, 'hide', null),
  good('chest', 'Chest', 'blue', 2, 2, 'wool', null),
  good('silk', 'Silk', 'blue', 4, 1, 'linen', null),
  good('spices', 'Spices', 'blue', 3, 2, 'skin-and-bones', null),
  good('jewelry', 'Jewelry', 'blue', 4, 2, 'fur', null),
  good('treasure-chest', 'Treasure Chest', 'blue', 3, 3, 'robe', null),
  good('silver-hoard', 'Silver Hoard', 'blue', 4, 3, 'clothing', null),
] as const;

export const FEAST_GOOD_BY_ID: Record<FeastGood, FeastGoodDefinition> = Object.fromEntries(
  FEAST_GOODS.map((x) => [x.id, x]),
) as Record<FeastGood, FeastGoodDefinition>;

export const FEAST_GOOD_IDS = FEAST_GOODS.map((x) => x.id);

// ---------------------------------------------------------------------------
// Special tiles (official appendix p.14 list; masks are the exact transparent
// silhouettes in cell units, transcribed from the classic mod art).
// ---------------------------------------------------------------------------

const special = (
  id: string, name: string, mask: string[], swordValue: number,
  silverCost: number | null, forge: boolean, points = 0,
): FeastSpecialDefinition => ({
  id, name, mask, area: mask.join('').split('').filter((x) => x === '#').length,
  swordValue, silverCost, forge, points,
});

const FEAST_SPECIAL_FALLBACK: readonly FeastSpecialDefinition[] = [
  special('glass-beads', 'Glass Beads', ['.#.', '###', '.#.'], 7, 0, false),
  special('helmet', 'Helmet', ['##', '##', '.#'], 8, 1, true),
  special('cloakpin', 'Cloakpin', ['#...', '####'], 8, 1, true),
  special('belt', 'Belt', ['#####'], 8, 2, false),
  special('crucifix', 'Crucifix', ['.#.', '###', '.#.', '.#.'], 8, 2, true),
  special('drinking-horn', 'Drinking Horn', ['.##', '###', '#..'], 8, 2, false),
  special('amber-figure', 'Amber Figure', ['.#.', '###', '###'], 9, 2, false),
  special('horseshoe', 'Horseshoe', ['#.#', '#.#', '###'], 9, 2, true),
  special('gold-brooch', 'Gold Brooch', ['.#.', '###', '###', '.#.'], 9, 3, false),
  special('forge-hammer', 'Forge Hammer', ['###', '###', '.#.', '.#.', '.#.'], 10, 4, true),
  special('fibula', 'Fibula', ['##.', '#..', '###', '#..', '##.'], 10, 4, true),
  special('throwing-axe', 'Throwing Axe', ['#####', '.###.', '..#..'], 11, 4, true),
  special('chalice', 'Chalice', ['###', '###', '.#.', '###'], 12, 5, false),
  special('round-shield', 'Round Shield', ['.##.', '####', '####', '.##.'], 13, 6, false),
  special('english-crown', 'English Crown', ['#.#.#', '#####', '#####'], 16, null, false, 2),
] as const;

export const FEAST_SPECIALS: readonly FeastSpecialDefinition[] = (specialGolden as unknown as Array<{
  id: string; name: string; area: number; mask: string[]; swordValue: number;
  silverCost: number | null; forge: boolean; points: number;
}>).map((x) => ({
  id: x.id, name: x.name, area: x.area, mask: [...x.mask], swordValue: x.swordValue,
  silverCost: x.silverCost, forge: x.forge, points: x.points,
}));

if (FEAST_SPECIALS.length !== 15 || FEAST_SPECIALS.some((x) => x.area !== x.mask.join('').split('').filter((c) => c === '#').length)) {
  throw new Error('Feast special-tile golden must contain 15 exact masks');
}

export const FEAST_SPECIAL_BY_ID: Record<string, FeastSpecialDefinition> = Object.fromEntries(
  FEAST_SPECIALS.map((x) => [x.id, x]),
);

// ---------------------------------------------------------------------------
// Exact board masks and printed facts from the authenticated mod art.
// ---------------------------------------------------------------------------

interface FeastGoldenBoard {
  id: string;
  name: string;
  kind: 'home' | 'exploration' | 'building';
  faceCode: string | null;
  artGrid: { rows: number; cols: number };
  layout: string[];
  expectedNegativeCount: number;
  expectedPoints: number;
  incomeTracks: { id: string; entries: { value: number; cell: { row: number; col: number } | null }[] }[] | null;
  bonuses: { cell: { row: number; col: number }; rewards: { kind: 'good' | 'resource' | 'special' | 'building'; id: string; amount: number }[]; finite?: boolean }[] | null;
  designatedResources: { cell?: { row: number; col: number }; area?: string; allowed: ('wood' | 'stone')[]; negativeValue?: number }[] | null;
}

const exactBoards = (boardGolden as unknown as { boards: FeastGoldenBoard[] }).boards;
export const FEAST_BOARD_DEFINITIONS: readonly FeastBoardDefinition[] = exactBoards.map((raw) => {
  const layout = raw.layout.map((row) => [...row].map((cell) => cell === ' ' ? '.' : cell === 'X' ? 'X' : '#').join(''));
  const negativeCells = raw.layout.flatMap((row, y) => [...row].flatMap((cell, x) => cell === 'N' ? [{ cell: { x, y }, value: -1 }] : []));
  const designatedResources = (raw.designatedResources ?? []).flatMap((entry, i) => entry.allowed.map((resource) => ({
    // Resource pastures printed outside the logical stone-house grid use
    // stable synthetic cells immediately to the right of the mask.
    cell: entry.cell ? { x: entry.cell.col, y: entry.cell.row } : { x: raw.artGrid.cols + i, y: 0 },
    resource,
    ...(entry.negativeValue ? { negativeValue: Math.abs(entry.negativeValue) } : {}),
  })));
  const board: FeastBoardDefinition = {
    id: raw.id, name: raw.name, kind: raw.kind, faceCode: raw.faceCode,
    rows: raw.artGrid.rows, cols: raw.artGrid.cols, layout,
    points: raw.expectedPoints, negativeCells,
    incomeTracks: (raw.incomeTracks ?? []).map((track) => ({
      id: track.id,
      entries: track.entries.map((entry) => ({ value: entry.value, cell: entry.cell ? { x: entry.cell.col, y: entry.cell.row } : null })),
    })),
    bonuses: (raw.bonuses ?? []).map((bonus) => ({
      cell: { x: bonus.cell.col, y: bonus.cell.row }, rewards: bonus.rewards.map((x) => ({ ...x })),
      ...(bonus.finite ? { finite: true } : {}),
    })),
    designatedResources,
  };
  if (negativeCells.length !== raw.expectedNegativeCount) throw new Error(`${raw.id}: expected ${raw.expectedNegativeCount} negative cells, got ${negativeCells.length}`);
  if (layout.length !== raw.artGrid.rows || layout.some((row) => row.length !== raw.artGrid.cols)) throw new Error(`${raw.id}: invalid extracted grid dimensions`);
  return board;
});

if (FEAST_BOARD_DEFINITIONS.length !== 13) throw new Error(`Feast board golden must contain 13 faces/tiles, got ${FEAST_BOARD_DEFINITIONS.length}`);

export const FEAST_BOARD_BY_ID: Record<string, FeastBoardDefinition> = Object.fromEntries(
  FEAST_BOARD_DEFINITIONS.map((x) => [x.id, x]),
);

// ---------------------------------------------------------------------------
// Occupation fallback.  The extractor-produced golden contains the official
// name/VP/timing/category/clarification for all 190 cards.  Keeping a complete
// numbered catalog here makes old saves and development builds deterministic
// even before the golden is staged; normalizeFeastOccupations accepts the
// extractor schema without weakening the owned-card resolver.
// ---------------------------------------------------------------------------

export interface FeastGoldenOccupationLike {
  id?: string;
  number: number;
  deck: string;
  starting?: boolean;
  name?: string;
  points?: number;
  type?: string;
  category?: string;
  clarification?: string;
  cell?: number;
  sheet?: string | number;
  back?: string;
}

const occupationType = (x: string | undefined): FeastOccupationDefinition['type'] => {
  const v = (x ?? '').toLowerCase().replace(/\s+/g, '-');
  if (v.includes('any')) return 'anytime';
  if (v.includes('each')) return 'each-time';
  if (v.includes('soon')) return 'as-soon-as';
  return 'immediate';
};

export function normalizeFeastOccupations(rows: readonly FeastGoldenOccupationLike[]): FeastOccupationDefinition[] {
  const byNumber = new Map(rows.map((x) => [x.number, x]));
  return Array.from({ length: 190 }, (_, i) => {
    const number = i + 1;
    const row = byNumber.get(number);
    const rawDeck = (row?.deck ?? (number <= 72 ? 'A' : number <= 131 ? 'B' : 'C')).toUpperCase();
    const deck = (rawDeck === 'B' || rawDeck === 'C' ? rawDeck : 'A') as 'A' | 'B' | 'C';
    const fallbackStarting = number <= 15 || (number >= 73 && number <= 87) || (number >= 132 && number <= 146);
    const starting = row?.starting ?? (row ? row.deck === row.deck.toLowerCase() : fallbackStarting);
    return {
      id: row?.id ?? `occupation-${number}`,
      number, deck, starting,
      name: row?.name?.trim() || `Occupation ${number}`,
      points: Number.isFinite(row?.points) ? Number(row?.points) : 0,
      type: occupationType(row?.type),
      category: row?.category?.trim() || 'card-specific',
      clarification: row?.clarification?.trim() || `Official appendix entry ${number}.`,
      cell: Number.isInteger(row?.cell) ? Number(row?.cell) : number,
      sheet: String(row?.sheet ?? deck),
      back: row?.back ?? (starting ? deck.toLowerCase() : deck),
    };
  });
}

export const FEAST_OCCUPATIONS = normalizeFeastOccupations(occupationGolden as unknown as FeastGoldenOccupationLike[]);
if (FEAST_OCCUPATIONS.length !== 190 || new Set(FEAST_OCCUPATIONS.map((x) => x.number)).size !== 190
  || FEAST_OCCUPATIONS.some((x) => x.name.startsWith('Occupation ') || !x.clarification.trim())) {
  throw new Error('Feast occupation golden must contain all 190 named, clarified cards');
}
for (const [deck, starting, dark] of [['A', 15, 57], ['B', 15, 44], ['C', 15, 44]] as const) {
  const cards = FEAST_OCCUPATIONS.filter((x) => x.deck === deck);
  if (cards.filter((x) => x.starting).length !== starting || cards.filter((x) => !x.starting).length !== dark) {
    throw new Error(`${deck} occupation deck count mismatch`);
  }
}
export const FEAST_OCCUPATION_BY_ID: Record<string, FeastOccupationDefinition> = Object.fromEntries(
  FEAST_OCCUPATIONS.map((x) => [x.id, x]),
);

// ---------------------------------------------------------------------------
// The 61 printed classic action spaces. Art coordinates are normalized from
// the authentic 2500 x 5000 mod texture (TrPuk2F.jpg). Exact choices are kept
// in printed order; third/fourth-column card bonuses are reducer-level rules.
// ---------------------------------------------------------------------------

const COLUMN_X: Record<1 | 2 | 3 | 4, [number, number]> = {
  1: [335, 835], 2: [860, 1370], 3: [1390, 1900], 4: [1915, 2480],
};
const bounds = (column: 1 | 2 | 3 | 4, y: number, h: number): FeastBounds => {
  const [x0, x1] = COLUMN_X[column];
  return { x: x0 / 2500, y: y / 5000, width: (x1 - x0) / 2500, height: h / 5000 };
};
const amount = (kind: FeastAmount['kind'], id: FeastAmount['id'], n = 1): FeastAmount => ({ kind, ...(id ? { id } : {}), amount: n });
const silver = (n: number): FeastAmount => ({ kind: 'silver', amount: n });
const resource = (id: 'wood' | 'stone' | 'ore', n = 1): FeastAmount => amount('resource', id, n);
const goods = (id: FeastGood, n = 1): FeastAmount => amount('good', id, n);
const weapon = (id: FeastWeapon, n = 1): FeastAmount => amount('weapon', id, n);
const gain = (...items: FeastAmount[]): FeastPrintedEffect => ({ kind: 'gain', items });
const pay = (...items: FeastAmount[]): FeastPrintedEffect => ({ kind: 'pay', items });

let actionOrder = 0;
const action = (
  id: string, name: string, group: FeastActionGroup,
  column: 1 | 2 | 3 | 4, y: number, h: number,
  effects: FeastPrintedEffect[], requirements: string[] = [],
): FeastActionSpaceDefinition => ({
  id, order: ++actionOrder, name, group, column, workers: column,
  effects, requirements, bounds: bounds(column, y, h),
});

const FEAST_ACTION_EFFECT_DEFINITIONS: readonly FeastActionSpaceDefinition[] = [
  // Build Houses / Ships (one combined fourth-column space spans both rows).
  action('build-shed', 'Build a Shed', 'Build Houses', 1, 365, 170,
    [pay(resource('wood', 2)), { kind: 'build', building: 'shed' }], ['2 wood', 'shed available']),
  action('build-stone-house', 'Build a Stone House', 'Build Houses', 2, 365, 170,
    [pay(resource('stone')), { kind: 'build', building: 'stone-house' }], ['1 stone', 'stone house available']),
  action('build-long-house', 'Build a Long House', 'Build Houses', 3, 365, 170,
    [pay(resource('stone', 2)), { kind: 'build', building: 'long-house' }], ['2 stone', 'long house available']),
  action('build-house-and-ship', 'Build a House and Ship', 'Build Houses', 4, 360, 430, [
    pay(resource('stone', 2), resource('wood', 2)),
    { kind: 'choose', min: 1, max: 1, options: [
      { id: 'stone-house-longship', label: 'Stone House + Longship', effects: [{ kind: 'build', building: 'stone-house' }, { kind: 'ship', ship: 'longship', mode: 'gain' }] },
      { id: 'long-house-knarr', label: 'Long House + Knarr', effects: [{ kind: 'build', building: 'long-house' }, { kind: 'ship', ship: 'knarr', mode: 'gain' }] },
    ] },
  ], ['2 stone and 2 wood', 'matching house available', 'large-ship berth']),
  action('build-whaling-boat', 'Build a Whaling Boat', 'Build Ships', 1, 580, 160,
    [pay(resource('wood')), { kind: 'ship', ship: 'whaling-boat', mode: 'gain' }], ['1 wood', 'small-ship berth']),
  action('build-knarr', 'Build a Knarr', 'Build Ships', 2, 580, 160,
    [pay(resource('wood', 2)), { kind: 'ship', ship: 'knarr', mode: 'gain' }], ['2 wood', 'large-ship berth']),
  action('build-longship', 'Build a Longship', 'Build Ships', 3, 580, 160,
    [pay(resource('wood', 2)), { kind: 'ship', ship: 'longship', mode: 'gain' }], ['2 wood', 'large-ship berth']),

  // Hunting (the stockfish production space is printed in this group).
  action('hunt-game-1', 'Hunting Game', 'Hunting', 1, 785, 200,
    [{ kind: 'die', rule: { kind: 'hunt', sides: 8, direction: 'low', maxRolls: 3, returnedVikingsOnFailure: 0 } }]),
  action('take-stockfish', 'Take 1 Stockfish', 'Hunting', 1, 1010, 135, [gain(goods('stockfish'))]),
  action('hunt-game-2', 'Hunting Game', 'Hunting', 2, 785, 200,
    [{ kind: 'die', rule: { kind: 'hunt', sides: 8, direction: 'low', maxRolls: 3, returnedVikingsOnFailure: 0 } }]),
  action('lay-snare', 'Laying a Snare', 'Hunting', 2, 1010, 210,
    [{ kind: 'die', rule: { kind: 'snare', sides: 8, direction: 'low', maxRolls: 3, returnedVikingsOnFailure: 1 } }]),
  action('whaling-major', 'Whaling (1-3 Boats)', 'Hunting', 3, 785, 425,
    [{ kind: 'die', rule: { kind: 'whale', sides: 12, direction: 'low', maxRolls: 3, boatsMin: 1, boatsMax: 3, returnedVikingsOnFailure: 2 } }], ['1-3 whaling boats']),
  action('whaling-minor', 'Whaling (1 Boat)', 'Hunting', 4, 785, 425,
    [{ kind: 'die', rule: { kind: 'whale', sides: 12, direction: 'low', maxRolls: 3, boatsMin: 1, boatsMax: 1, returnedVikingsOnFailure: 2 } }], ['1 whaling boat']),

  // Livestock Market.
  action('buy-stockfish', 'Buy 2 Stockfish', 'Livestock Market', 1, 1250, 150,
    [pay(silver(1)), gain(goods('stockfish', 2))], ['1 silver']),
  action('buy-salt-meat', 'Buy 2 Salt Meat', 'Livestock Market', 1, 1420, 150,
    [pay(silver(2)), gain(goods('salt-meat', 2))], ['2 silver']),
  action('buy-sheep', 'Buy a Sheep', 'Livestock Market', 2, 1250, 150,
    [pay(silver(1)), gain(goods('sheep'))], ['1 silver']),
  action('buy-cattle-milk', 'Buy Cattle and Milk', 'Livestock Market', 2, 1420, 150,
    [pay(silver(3)), gain(goods('cattle'), goods('milk'))], ['3 silver']),
  action('livestock-choice', 'Sheep or Cattle', 'Livestock Market', 3, 1245, 325, [
    { kind: 'choose', min: 1, max: 1, options: [
      { id: 'sheep', label: 'Take 1 Sheep', effects: [gain(goods('sheep'))] },
      { id: 'cattle', label: 'Pay 1 Silver for 1 Cattle', effects: [pay(silver(1)), gain(goods('cattle'))] },
    ] },
  ]),
  action('buy-cattle-sheep', 'Buy Cattle and Sheep', 'Livestock Market', 4, 1245, 325,
    [pay(silver(3)), gain(goods('cattle'), goods('sheep'))], ['3 silver']),

  // Weekly Market.
  action('weekly-beans', 'Beans and Silver', 'Weekly Market', 1, 1610, 155,
    [gain(goods('beans'), silver(1))]),
  action('weekly-flax-stockfish', 'Flax, Stockfish, and Silver', 'Weekly Market', 2, 1610, 155,
    [gain(goods('flax'), goods('stockfish'), silver(1))]),
  action('weekly-feast', 'Fruit, Oil, Salt Meat, and Silver', 'Weekly Market', 3, 1610, 155,
    [gain(goods('fruits'), goods('oil'), goods('salt-meat'), silver(1))]),
  action('weekly-livestock', 'Spices and Livestock Produce', 'Weekly Market', 4, 1600, 350,
    [{ kind: 'weekly-four' }]),

  // Products (no fourth-column product space on the classic board).
  action('produce-milk', 'Produce Milk', 'Products', 1, 1790, 175,
    [{ kind: 'conditional-production', animal: 'cattle', good: 'milk', max: 3 }], ['at least 1 cattle']),
  action('produce-mead', 'Mead and Silver', 'Products', 2, 1790, 175,
    [gain(goods('mead', 2), silver(2))]),
  action('produce-wool', 'Produce Wool', 'Products', 3, 1790, 175,
    [{ kind: 'conditional-production', animal: 'sheep', good: 'wool', max: 3 }], ['at least 1 sheep']),

  // Crafting.
  action('craft-linen', 'Craft Linen', 'Crafting', 1, 2010, 150,
    [pay(goods('flax')), gain(goods('linen'))], ['1 flax']),
  action('craft-rune-stone', 'Craft Rune Stone', 'Crafting', 1, 2190, 150,
    [pay(resource('stone')), gain(silver(1), goods('rune-stone'))], ['1 stone']),
  action('craft-clothing', 'Craft Clothing', 'Crafting', 2, 2010, 150,
    [pay(goods('hide'), goods('linen')), gain(silver(2), goods('clothing'))], ['1 hide and 1 linen']),
  action('craft-chest', 'Craft a Chest', 'Crafting', 2, 2190, 150, [
    { kind: 'choose', min: 1, max: 1, options: [
      { id: 'wood', label: 'Pay 1 Wood', effects: [pay(resource('wood'))] },
      { id: 'ore', label: 'Pay 1 Ore', effects: [pay(resource('ore'))] },
    ] }, gain(silver(1), goods('chest')),
  ], ['1 wood or 1 ore']),
  action('forge', 'Forge a Special Tile or Jewelry', 'Crafting', 3, 2010, 150,
    [pay(resource('ore')), { kind: 'forge' }], ['1 ore', 'forge tile or jewelry available']),
  action('craft-runes-and-chests', 'Craft 2 Rune Stones and 2 Chests', 'Crafting', 3, 2190, 165,
    [pay(resource('stone', 2), resource('wood', 2)), gain(goods('rune-stone', 2), goods('chest', 2))], ['2 stone and 2 wood']),
  action('master-crafting', 'Master Crafting', 'Crafting', 4, 2000, 360, [
    gain(silver(4)),
    { kind: 'choose', min: 0, max: 2, options: [
      { id: 'wool-robe', label: 'Wool to Robe', effects: [pay(goods('wool')), gain(goods('robe'))] },
      { id: 'silverware-jewelry', label: 'Silverware to Jewelry', effects: [pay(goods('silverware')), gain(goods('jewelry'))] },
    ] },
  ]),

  // Mountains and Trade: 3/3/3/2 spaces by column.
  action('mountain-2', 'Take up to 2 Mountain Items', 'Mountains and Trade', 1, 2410, 170,
    [{ kind: 'mountain', allowances: [2] }], ['face-up mountain item']),
  action('mountain-1-upgrade-1', 'Take 1 Mountain Item and Upgrade 1 Good', 'Mountains and Trade', 1, 2610, 170,
    [{ kind: 'mountain', allowances: [1] }, { kind: 'upgrade', count: 1, steps: 1 }]),
  action('upgrade-2', 'Upgrade up to 2 Goods', 'Mountains and Trade', 1, 2820, 140,
    [{ kind: 'upgrade', count: 2, steps: 1 }]),
  action('wood-per-player', 'Wood per Player and 1 Ore', 'Mountains and Trade', 2, 2410, 170,
    [gain(resource('ore')), { kind: 'gain', items: [resource('wood')], optional: false }]),
  action('mountain-3-upgrade-1', 'Take 3 Mountain Items and Upgrade 1 Good', 'Mountains and Trade', 2, 2610, 170,
    [{ kind: 'mountain', allowances: [3] }, { kind: 'upgrade', count: 1, steps: 1 }]),
  action('upgrade-3', 'Upgrade up to 3 Goods', 'Mountains and Trade', 2, 2820, 140,
    [{ kind: 'upgrade', count: 3, steps: 1 }]),
  action('mountain-3-plus-2', 'Take 3 + 2 Mountain Items', 'Mountains and Trade', 3, 2410, 170,
    [{ kind: 'mountain', allowances: [3, 2] }]),
  action('upgrade-3-weapons-4', 'Upgrade 3 Goods and Draw 4 Weapons', 'Mountains and Trade', 3, 2610, 170,
    [{ kind: 'upgrade', count: 3, steps: 1 }, { kind: 'draw-weapons', amount: 4 }]),
  action('upgrade-4', 'Upgrade up to 4 Goods', 'Mountains and Trade', 3, 2820, 140,
    [{ kind: 'upgrade', count: 4, steps: 1 }]),
  action('mountain-4-double-2', 'Take 4 Mountain Items and Double-Upgrade 2 Goods', 'Mountains and Trade', 4, 2390, 380,
    [{ kind: 'mountain', allowances: [4] }, { kind: 'upgrade', count: 2, steps: 2 }]),
  action('mountain-2x4-or-double-3', 'Take 2 from up to 4 Strips or Double-Upgrade 3 Goods', 'Mountains and Trade', 4, 2800, 445, [
    { kind: 'choose', min: 1, max: 1, options: [
      { id: 'mountains', label: 'Take 2 + 2 + 2 + 2', effects: [{ kind: 'mountain', allowances: [2, 2, 2, 2] }] },
      { id: 'upgrades', label: 'Double-Upgrade up to 3 Goods', effects: [{ kind: 'upgrade', count: 3, steps: 2 }] },
    ] },
  ]),

  // Sailing / Knarr spaces.
  action('overseas-trade-1', 'Overseas Trading', 'Sailing', 1, 3260, 170,
    [pay(silver(1)), { kind: 'overseas-trade' }], ['1 silver', 'knarr']),
  action('overseas-trade-2', 'Overseas Trading', 'Sailing', 2, 3260, 170,
    [pay(silver(1)), { kind: 'overseas-trade' }], ['1 silver', 'knarr']),
  action('special-sale', 'Special Sale', 'Sailing', 3, 3260, 170,
    [{ kind: 'special-sale', max: 2 }], ['knarr', 'available purchasable special tile']),

  // Raiding / Pillaging / Plundering.
  action('raid', 'Raiding', 'Raiding, Pillaging, and Plundering', 1, 3490, 205,
    [{ kind: 'die', rule: { kind: 'raid', sides: 8, direction: 'high', maxRolls: 3, returnedVikingsOnFailure: 0 } }], ['longship']),
  action('pillage-2', 'Pillaging', 'Raiding, Pillaging, and Plundering', 2, 3490, 205,
    [{ kind: 'die', rule: { kind: 'pillage', sides: 12, direction: 'high', maxRolls: 3, returnedVikingsOnFailure: 1 } }], ['longship']),
  action('pillage-3', 'Pillaging', 'Raiding, Pillaging, and Plundering', 3, 3490, 205,
    [{ kind: 'die', rule: { kind: 'pillage', sides: 12, direction: 'high', maxRolls: 3, returnedVikingsOnFailure: 1 } }], ['longship']),
  action('plunder', 'Plundering', 'Raiding, Pillaging, and Plundering', 4, 3475, 410,
    [{ kind: 'plunder' }], ['2 longships']),

  // Exploration.
  action('explore-short', 'Explore Shetland or Faroe Islands', 'Exploration', 1, 3740, 170,
    [{ kind: 'explore', faces: ['shetland', 'faroe-islands'], ship: 'any' }], ['any ship', 'available named face']),
  action('explore-medium', 'Explore Iceland, Greenland, or Bear Island', 'Exploration', 2, 3740, 170,
    [{ kind: 'explore', faces: ['iceland', 'greenland', 'bear-island'], ship: 'large' }], ['knarr or longship', 'available named face']),
  action('explore-long', 'Explore Baffin Island, Labrador, or Newfoundland', 'Exploration', 3, 3740, 170,
    [{ kind: 'explore', faces: ['baffin-island', 'labrador', 'newfoundland'], ship: 'longship' }], ['longship', 'available named face']),

  // Emigration and occupations.
  action('draw-occupation', 'Draw an Occupation and Take 1 Silver', 'Emigration and Occupation', 1, 4030, 170,
    [{ kind: 'occupation', mode: 'draw', min: 1, max: 1 }, gain(silver(1))]),
  action('play-occupation-paid', 'Play 1 Occupation for Stone or Ore', 'Emigration and Occupation', 1, 4230, 180, [
    { kind: 'occupation', mode: 'play', min: 0, max: 1, payment: ['stone', 'ore'] }, gain(silver(1)),
  ], ['1 stone or 1 ore if playing']),
  action('emigrate-2', 'Emigrate', 'Emigration and Occupation', 2, 4030, 170,
    [{ kind: 'emigrate' }], ['knarr or longship', 'silver equal to round', 'open feast position']),
  action('play-occupations-2', 'Play up to 2 Occupations', 'Emigration and Occupation', 2, 4230, 180,
    [{ kind: 'occupation', mode: 'play', min: 0, max: 2 }]),
  action('emigrate-3', 'Emigrate', 'Emigration and Occupation', 3, 4030, 170,
    [{ kind: 'emigrate' }], ['knarr or longship', 'silver equal to round', 'open feast position']),
  action('play-occupations-4', 'Play up to 4 Occupations', 'Emigration and Occupation', 3, 4230, 180,
    [{ kind: 'occupation', mode: 'play', min: 0, max: 4 }]),
  action('upgrade-boat-and-emigrate', 'Upgrade a Whaling Boat and Emigrate', 'Emigration and Occupation', 4, 4020, 390,
    [{ kind: 'emigrate', exchangeWhaling: true }], ['knarr or longship after optional exchange', 'silver equal to round', 'open feast position']),
] as const;

const actionGoldenById = Object.fromEntries((actionSpaceGolden as unknown as Array<{
  id: string; order: number; name: string; group: FeastActionGroup;
  column: 1 | 2 | 3 | 4; workers: 1 | 2 | 3 | 4; artBounds: FeastBounds;
}>).map((x) => [x.id, x]));

export const FEAST_ACTION_SPACES: readonly FeastActionSpaceDefinition[] = FEAST_ACTION_EFFECT_DEFINITIONS.map((def) => {
  const golden = actionGoldenById[def.id];
  if (!golden) throw new Error(`Missing action-board golden bounds for ${def.id}`);
  if (golden.order !== def.order || golden.column !== def.column || golden.workers !== def.workers || golden.group !== def.group) {
    throw new Error(`Action-board golden mismatch for ${def.id}`);
  }
  return { ...def, name: golden.name, bounds: { ...golden.artBounds } };
});

if (FEAST_ACTION_SPACES.length !== 61) {
  throw new Error(`Classic Feast action board must contain 61 spaces, got ${FEAST_ACTION_SPACES.length}`);
}

export const FEAST_ACTION_BY_ID: Record<string, FeastActionSpaceDefinition> = Object.fromEntries(
  FEAST_ACTION_SPACES.map((x) => [x.id, x]),
);

export const FEAST_WEAPON_DECK_COUNTS: Record<FeastWeapon, number> = {
  bow: 12, snare: 12, spear: 12, 'long-sword': 11,
};

/** Eight classic strips, arrow end first. The extracted golden replaces this
 * fallback order, but the seven-item invariant and deterministic mechanics are
 * identical. */
export const FEAST_MOUNTAINS: readonly ('wood' | 'stone' | 'ore' | 'silver-2')[][] =
  (mountainGolden as unknown as Array<{ items: ('wood' | 'stone' | 'ore' | 'silver-2')[] }>).map((x) => [...x.items]);
if (FEAST_MOUNTAINS.length !== 8 || FEAST_MOUNTAINS.some((x) => x.length !== 7)) {
  throw new Error('Feast mountain golden must contain eight seven-item strips');
}

export const FEAST_EXPLORATION_PAIRS = [
  { boardId: 'exploration-1', face: 'shetland', reverseFace: 'bear-island', faceCode: 'A' as const },
  { boardId: 'exploration-2', face: 'faroe-islands', reverseFace: 'baffin-island', faceCode: 'B' as const },
  { boardId: 'exploration-3', face: 'iceland', reverseFace: 'labrador', faceCode: 'C' as const },
  { boardId: 'exploration-4', face: 'greenland', reverseFace: 'newfoundland', faceCode: 'D' as const },
] as const;

export const FEAST_EXPLORATION_POINTS: Record<string, number> = {
  shetland: 6, 'bear-island': 12, 'faroe-islands': 4, 'baffin-island': 12,
  iceland: 16, labrador: 36, greenland: 12, newfoundland: 38,
};

export const FEAST_EXPLORATION_NEGATIVES: Record<string, number> = {
  shetland: 24, 'bear-island': 22, 'faroe-islands': 16, 'baffin-island': 24,
  iceland: 24, labrador: 40, greenland: 20, newfoundland: 40,
};
