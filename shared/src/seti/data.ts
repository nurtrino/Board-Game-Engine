// SETI: Search for Extraterrestrial Intelligence - immutable rules/catalog data.
//
// Identity and art coordinates come from the English TTS source deck in
// Workshop save 3415673254. The source exposes names and exact CardID cells but
// not machine-readable printed rules. Income icons below are the only printed
// card field promoted from the local OCR aid; every other unverified field is
// deliberately `null` so the reducer can never invent a card effect.

export type SetiSeatColor = 'White' | 'Green' | 'Purple' | 'Orange';
export const SETI_SEATS: readonly SetiSeatColor[] = ['White', 'Green', 'Purple', 'Orange'];

export type SetiIncomeKind = 'credit' | 'energy' | 'card';
export type SetiTraceColor = 'purple' | 'orange' | 'blue';
export type SetiSignalColor = 'red' | 'yellow' | 'blue' | 'black';
export type SetiRing = 0 | 1 | 2;
export type SetiSectorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type SetiCellId = `seti_cell_r${SetiRing}s${SetiSectorIndex}`;

export const SETI_CELL_IDS: readonly SetiCellId[] = Array.from({ length: 3 }, (_, ring) =>
  Array.from({ length: 8 }, (_, sector) => `seti_cell_r${ring}s${sector}` as SetiCellId),
).flat();

export function setiCellId(ring: SetiRing, sector: number): SetiCellId {
  const normalized = ((sector % 8) + 8) % 8 as SetiSectorIndex;
  return `seti_cell_r${ring}s${normalized}`;
}

export function parseSetiCell(cell: SetiCellId): { ring: SetiRing; sector: SetiSectorIndex } {
  const match = /^seti_cell_r([0-2])s([0-7])$/.exec(cell);
  if (!match) throw new Error(`Invalid SETI cell: ${cell}`);
  return { ring: Number(match[1]) as SetiRing, sector: Number(match[2]) as SetiSectorIndex };
}

export function adjacentSetiCells(cell: SetiCellId): SetiCellId[] {
  const { ring, sector } = parseSetiCell(cell);
  const cells = [setiCellId(ring, sector - 1), setiCellId(ring, sector + 1)];
  if (ring > 0) cells.push(setiCellId((ring - 1) as SetiRing, sector));
  if (ring < 2) cells.push(setiCellId((ring + 1) as SetiRing, sector));
  return cells;
}

export type SetiPrimaryBody =
  | 'Earth' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Oumuamua';
export type SetiMoon =
  | 'Phobos' | 'Deimos' | 'Callisto' | 'Ganymede' | 'Europa' | 'Enceladus' | 'Titan' | 'Titania' | 'Triton';
export type SetiBody = SetiPrimaryBody | SetiMoon;

export type SetiKnownRewardOp =
  | { kind: 'vp'; amount: number }
  | { kind: 'credit' | 'energy'; amount: number }
  | { kind: 'data'; amount: number }
  | { kind: 'publicity'; amount: number }
  | { kind: 'trace'; color: SetiTraceColor; amount: number }
  | { kind: 'signal'; color: SetiSignalColor; amount: number }
  | { kind: 'signal-at-body-sector'; body: SetiPrimaryBody; amount: number }
  | { kind: 'draw-project'; amount: number; source: 'row-or-deck' | 'deck' }
  | { kind: 'tuck-income'; amount: number };

export interface SetiBodyDef {
  id: SetiBody;
  parent: SetiPrimaryBody | null;
  moon: boolean;
  landingRewards: readonly SetiKnownRewardOp[];
  firstLandingData: number;
  firstLandingSpaces: number;
  orbitReward: { status: 'none' } | { status: 'typed'; ops: readonly SetiKnownRewardOp[] };
}

export const SETI_BODIES: Readonly<Record<SetiBody, SetiBodyDef>> = {
  Earth: { id: 'Earth', parent: null, moon: false, landingRewards: [], firstLandingData: 0, firstLandingSpaces: 0, orbitReward: { status: 'none' } },
  Mercury: { id: 'Mercury', parent: null, moon: false, landingRewards: [{ kind: 'vp', amount: 12 }, { kind: 'trace', color: 'orange', amount: 1 }], firstLandingData: 3, firstLandingSpaces: 1, orbitReward: { status: 'typed', ops: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }, { kind: 'signal-at-body-sector', body: 'Mercury', amount: 2 }, { kind: 'tuck-income', amount: 1 }] } },
  Venus: { id: 'Venus', parent: null, moon: false, landingRewards: [{ kind: 'vp', amount: 5 }, { kind: 'trace', color: 'orange', amount: 1 }], firstLandingData: 2, firstLandingSpaces: 1, orbitReward: { status: 'typed', ops: [{ kind: 'vp', amount: 6 }, { kind: 'tuck-income', amount: 1 }] } },
  Mars: { id: 'Mars', parent: null, moon: false, landingRewards: [{ kind: 'vp', amount: 6 }, { kind: 'trace', color: 'orange', amount: 1 }], firstLandingData: 0, firstLandingSpaces: 2, orbitReward: { status: 'typed', ops: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }, { kind: 'signal-at-body-sector', body: 'Mars', amount: 1 }, { kind: 'tuck-income', amount: 1 }] } },
  Jupiter: { id: 'Jupiter', parent: null, moon: false, landingRewards: [{ kind: 'vp', amount: 7 }, { kind: 'trace', color: 'orange', amount: 1 }], firstLandingData: 2, firstLandingSpaces: 1, orbitReward: { status: 'typed', ops: [{ kind: 'data', amount: 1 }, { kind: 'signal-at-body-sector', body: 'Jupiter', amount: 1 }, { kind: 'tuck-income', amount: 1 }] } },
  Saturn: { id: 'Saturn', parent: null, moon: false, landingRewards: [{ kind: 'vp', amount: 8 }, { kind: 'trace', color: 'orange', amount: 1 }], firstLandingData: 2, firstLandingSpaces: 1, orbitReward: { status: 'typed', ops: [{ kind: 'publicity', amount: 2 }, { kind: 'signal-at-body-sector', body: 'Saturn', amount: 1 }, { kind: 'tuck-income', amount: 1 }] } },
  Uranus: { id: 'Uranus', parent: null, moon: false, landingRewards: [{ kind: 'vp', amount: 9 }, { kind: 'trace', color: 'orange', amount: 1 }], firstLandingData: 3, firstLandingSpaces: 1, orbitReward: { status: 'typed', ops: [{ kind: 'vp', amount: 8 }, { kind: 'draw-project', amount: 3, source: 'deck' }, { kind: 'signal', color: 'black', amount: 1 }] } },
  Neptune: { id: 'Neptune', parent: null, moon: false, landingRewards: [{ kind: 'vp', amount: 10 }, { kind: 'trace', color: 'orange', amount: 1 }], firstLandingData: 3, firstLandingSpaces: 1, orbitReward: { status: 'typed', ops: [{ kind: 'vp', amount: 7 }, { kind: 'data', amount: 4 }, { kind: 'signal', color: 'black', amount: 1 }] } },
  Oumuamua: { id: 'Oumuamua', parent: null, moon: false, landingRewards: [], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Phobos: { id: 'Phobos', parent: 'Mars', moon: true, landingRewards: [{ kind: 'vp', amount: 8 }, { kind: 'tuck-income', amount: 1 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Deimos: { id: 'Deimos', parent: 'Mars', moon: true, landingRewards: [{ kind: 'vp', amount: 8 }, { kind: 'tuck-income', amount: 1 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Callisto: { id: 'Callisto', parent: 'Jupiter', moon: true, landingRewards: [{ kind: 'vp', amount: 13 }, { kind: 'data', amount: 4 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Ganymede: { id: 'Ganymede', parent: 'Jupiter', moon: true, landingRewards: [{ kind: 'vp', amount: 12 }, { kind: 'publicity', amount: 5 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Europa: { id: 'Europa', parent: 'Jupiter', moon: true, landingRewards: [{ kind: 'vp', amount: 7 }, { kind: 'trace', color: 'orange', amount: 2 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Enceladus: { id: 'Enceladus', parent: 'Saturn', moon: true, landingRewards: [{ kind: 'vp', amount: 12 }, { kind: 'signal', color: 'red', amount: 1 }, { kind: 'signal', color: 'blue', amount: 1 }, { kind: 'signal', color: 'yellow', amount: 1 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Titan: { id: 'Titan', parent: 'Saturn', moon: true, landingRewards: [{ kind: 'vp', amount: 7 }, { kind: 'trace', color: 'purple', amount: 1 }, { kind: 'trace', color: 'orange', amount: 1 }, { kind: 'trace', color: 'blue', amount: 1 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Titania: { id: 'Titania', parent: 'Uranus', moon: true, landingRewards: [{ kind: 'vp', amount: 25 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
  Triton: { id: 'Triton', parent: 'Neptune', moon: true, landingRewards: [{ kind: 'vp', amount: 26 }], firstLandingData: 0, firstLandingSpaces: 1, orbitReward: { status: 'none' } },
};

export interface SetiSolarLayerFeature {
  layer: 0 | 1 | 2 | 3;
  ring: SetiRing;
  sector: SetiSectorIndex;
  kind: 'planet' | 'asteroid' | 'publicity' | 'comet';
  body?: SetiPrimaryBody;
}

// Baselines are read from the authentic base/disc art. Orientations shift these
// sectors in state; they are kept separate from renderer coordinates so the
// alpha/support table can replace this adapter without changing actions.
export const SETI_SOLAR_LAYER_FEATURES: readonly SetiSolarLayerFeature[] = [
  { layer: 0, ring: 2, sector: 1, kind: 'planet', body: 'Uranus' },
  { layer: 0, ring: 2, sector: 4, kind: 'planet', body: 'Neptune' },
  { layer: 0, ring: 0, sector: 2, kind: 'asteroid' },
  { layer: 0, ring: 1, sector: 5, kind: 'asteroid' },
  { layer: 0, ring: 2, sector: 0, kind: 'publicity' },
  { layer: 1, ring: 0, sector: 5, kind: 'planet', body: 'Mercury' },
  { layer: 1, ring: 0, sector: 7, kind: 'planet', body: 'Venus' },
  { layer: 1, ring: 0, sector: 1, kind: 'planet', body: 'Earth' },
  { layer: 1, ring: 0, sector: 3, kind: 'publicity' },
  { layer: 2, ring: 1, sector: 7, kind: 'planet', body: 'Mars' },
  { layer: 2, ring: 1, sector: 0, kind: 'asteroid' },
  { layer: 2, ring: 1, sector: 2, kind: 'asteroid' },
  { layer: 2, ring: 1, sector: 4, kind: 'asteroid' },
  { layer: 3, ring: 2, sector: 3, kind: 'planet', body: 'Jupiter' },
  { layer: 3, ring: 2, sector: 7, kind: 'planet', body: 'Saturn' },
  { layer: 3, ring: 2, sector: 4, kind: 'asteroid' },
  { layer: 3, ring: 2, sector: 5, kind: 'asteroid' },
  { layer: 3, ring: 2, sector: 0, kind: 'comet' },
  { layer: 3, ring: 2, sector: 6, kind: 'publicity' },
];

// Lossless-alpha samples at the 24 canonical UI cell centers. Each string is
// s0..s7 with sector 0 at screen-right; rows are inner/middle/outer ring. A 1
// means that physical disc supports a piece at that baseline cell. Runtime
// rotates the lookup with the disc and checks physical top-to-bottom order.
export const SETI_SOLAR_ALPHA_MASKS = {
  1: ['11101111', '10001000', '00000000'],
  2: ['11110011', '01110011', '00000000'],
  3: ['11100111', '11101011', '01111011'],
} as const satisfies Record<1 | 2 | 3, readonly [string, string, string]>;

export const SETI_SOLAR_ART_ANCHORS = [
  { body: 'Mercury', layer: 1, image: { width: 396, height: 396, x: 68, y: 130 }, expectedSector: 5 },
  { body: 'Venus', layer: 1, image: { width: 396, height: 396, x: 270, y: 60 }, expectedSector: 7 },
  { body: 'Earth', layer: 1, image: { width: 396, height: 396, x: 335, y: 285 }, expectedSector: 1 },
  { body: 'Mars', layer: 2, image: { width: 608, height: 608, x: 470, y: 65 }, expectedSector: 7 },
  { body: 'Jupiter', layer: 3, image: { width: 1008, height: 1008, x: 327, y: 927 }, expectedSector: 3 },
  { body: 'Saturn', layer: 3, image: { width: 1008, height: 1008, x: 718, y: 102 }, expectedSector: 7 },
] as const;

for (const anchor of SETI_SOLAR_ART_ANCHORS) {
  const dx = anchor.image.x - anchor.image.width / 2;
  const dy = anchor.image.y - anchor.image.height / 2;
  const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  const feature = SETI_SOLAR_LAYER_FEATURES.find((candidate) => candidate.body === anchor.body && candidate.layer === anchor.layer);
  if (sector !== anchor.expectedSector || feature?.sector !== anchor.expectedSector) {
    throw new Error(`SETI solar-art anchor mismatch for ${anchor.body}`);
  }
}

export const SETI_SECTOR_IDS = [
  'seti_sector_kepler_22', 'seti_sector_proxima_centauri', 'seti_sector_sirius_a',
  'seti_sector_barnards_star', 'seti_sector_procyon', 'seti_sector_vega',
  'seti_sector_61_virginis', 'seti_sector_beta_pictoris',
] as const;
export type SetiSectorId = typeof SETI_SECTOR_IDS[number];

export interface SetiSectorDef {
  id: SetiSectorId;
  name: string;
  capacity: number;
  sourceBoardGuid: string;
  printedSignalColor: SetiSignalColor;
  printedWinReward: { status: 'typed'; first: readonly SetiKnownRewardOp[]; later: readonly SetiKnownRewardOp[] };
}

export const SETI_SECTORS: readonly SetiSectorDef[] = [
  ['seti_sector_kepler_22', 'Kepler-22', 5, '8c079b', 'yellow'],
  ['seti_sector_proxima_centauri', 'Proxima Centauri', 6, '8c079b', 'red'],
  ['seti_sector_sirius_a', 'Sirius A', 6, '018bc4', 'blue'],
  ['seti_sector_barnards_star', "Barnard's Star", 5, '018bc4', 'red'],
  ['seti_sector_procyon', 'Procyon', 5, '737f28', 'blue'],
  ['seti_sector_vega', 'Vega', 4, '737f28', 'black'],
  ['seti_sector_61_virginis', '61 Virginis', 6, 'b7f4d9', 'yellow'],
  ['seti_sector_beta_pictoris', 'Beta Pictoris', 5, 'b7f4d9', 'black'],
].map(([id, name, capacity, sourceBoardGuid, printedSignalColor]) => ({
  id: id as SetiSectorId,
  name: name as string,
  capacity: capacity as number,
  sourceBoardGuid: sourceBoardGuid as string,
  printedSignalColor: printedSignalColor as SetiSignalColor,
  printedWinReward: { status: 'typed' as const, first: [{ kind: 'trace' as const, color: 'purple' as const, amount: 1 }], later: [{ kind: 'vp' as const, amount: 3 }] },
}));

export type SetiCardType = 'ordinary' | 'conditional-mission' | 'triggerable-mission' | 'end-game';
export type SetiFreeCorner = 'move' | 'credit' | 'energy' | 'publicity' | 'data' | 'card';

export type SetiEffectOp =
  | SetiKnownRewardOp
  | { kind: 'launch'; amount: number; ignoreProbeLimit?: boolean }
  | { kind: 'move'; amount: number }
  | { kind: 'scan'; amount: number }
  | { kind: 'analyze'; amount: number }
  | { kind: 'research'; technologyType?: SetiTechnologyType }
  | { kind: 'choice'; choose: number; options: readonly (readonly SetiEffectOp[])[] }
  | { kind: 'conditional'; condition: string; ops: readonly SetiEffectOp[] };

export interface SetiPrintedCardFields {
  status: 'typed' | 'untranscribed';
  cost: number | null;
  sectorColors: readonly [SetiSignalColor, SetiSignalColor] | null;
  freeCorner: SetiFreeCorner | null;
  incomeCorner: SetiIncomeKind;
  incomeProvenance: 'non-authoritative-ocr-hint';
  cardType: SetiCardType | null;
  conditions: readonly string[] | null;
  effects: readonly SetiEffectOp[] | null;
}

export interface SetiCardArtRef {
  ref: string;
  sourceCardId: number;
  deckId: number;
  cell: number;
  column: number;
  row: number;
  sheetWidth: number;
  sheetHeight: number;
  faceUrl: string;
}

export interface SetiProjectCardDef {
  id: string;
  name: string;
  sourceGuid: string;
  promo: boolean;
  art: SetiCardArtRef;
  printed: SetiPrintedCardFields;
}

const SETI_PROJECT_SHEETS: Readonly<Record<number, { width: number; height: number; faceUrl: string }>> = {
  415: { width: 1, height: 1, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/44574410604008944/9387A6D9EC1B84397944A2627281B321B0530EA8/' },
  2044: { width: 1, height: 1, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/44574410604136972/9EEFA259742963E56427AA60A66ED2ADD4128948/' },
  2045: { width: 10, height: 7, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/44574410595908759/1C340283AC7D74D43962E3A5162DF73EF8F783B6/' },
  2046: { width: 10, height: 7, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/44574410595910617/5A9F80C4012DA1BA35F39C79F9FD26F8F35DDFEA/' },
  2047: { width: 1, height: 1, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/44574410604009581/45E24BD51EFE7BCCC1CAE37B6ABE4B2705A1094B/' },
};

type RawProject = readonly [cardId: number, name: string, guid: string, income: SetiIncomeKind];
const SETI_BASE_PROJECT_RAW: readonly RawProject[] = [
  [204400, 'Lunar Gateway', 'a907ce', 'card'],
  [204500, '61 Virginis Observation', '3e22fa', 'card'],
  [204501, 'Advanced Navigation System', 'f40e3f', 'card'],
  [204502, 'Algonquin Radio Observatory', 'f91e36', 'energy'],
  [204503, 'ALICE', '62efaa', 'credit'],
  [204504, 'Allen Telescope Array', 'ccdf45', 'card'],
  [204505, 'ALMA Observatory', '4be7f9', 'credit'],
  [204506, 'Amateur Astronomers', '799a09', 'energy'],
  [204507, 'Apollo 11 Mission', 'a76a81', 'energy'],
  [204508, 'Arecibo Observatory', '34a21c', 'card'],
  [204509, 'Asteroid Research', '16e344', 'energy'],
  [204510, 'Asteroid Flyby', '453fd4', 'card'],
  [204511, 'ATLAS', 'eb45d9', 'credit'],
  [204512, 'Atmospheric Entry', 'b74be1', 'credit'],
  [204513, "Barnard's Star Observation", '1e537b', 'energy'],
  [204514, 'Beta Pictoris Observation', '0dcb65', 'energy'],
  [204515, 'Breakthrough Listen', 'd776bc', 'credit'],
  [204516, 'Breakthrough Starship', '2da757', 'credit'],
  [204517, 'Breakthrough Watch', '486e20', 'credit'],
  [204518, 'Canadian Hydrogen Telescope', 'c26204', 'card'],
  [204519, 'Cape Canaveral SFS', 'c04526', 'card'],
  [204520, 'Cassini Probe', '467770', 'energy'],
  [204521, 'Chandra Space Observatory', '2e5869', 'energy'],
  [204522, 'Clean Space Initiative', 'bb9282', 'credit'],
  [204523, 'Cometary Encounter', 'cb0792', 'energy'],
  [204524, 'Control Center', '78cb87', 'card'],
  [204525, 'Cornell University', '9b35d3', 'card'],
  [204526, 'Coronal Spectrograph', 'e2572a', 'energy'],
  [204527, 'Deep Synoptic Array', '346979', 'energy'],
  [204528, 'Dragonfly', 'b4e4a2', 'credit'],
  [204529, 'DUNE', '8c4a26', 'credit'],
  [204530, 'Effelsberg Telescope Construction', '1eabe1', 'energy'],
  [204531, 'Electron Microscope', '9e5fc6', 'card'],
  [204532, 'Euclid Telescope Construction', '0fc337', 'card'],
  [204533, 'Europa Clipper', 'e182fc', 'credit'],
  [204534, 'Exascale Supercomputer', 'b6a26f', 'credit'],
  [204535, 'Extremophiles Study', '3c5276', 'credit'],
  [204536, 'Falcon Heavy', '1ea08d', 'credit'],
  [204537, 'FAST Telescope Construction', 'a206d8', 'credit'],
  [204538, 'First Black Hole Photo', 'a07ee3', 'energy'],
  [204539, 'Focused Research', 'd86098', 'credit'],
  [204540, 'Fuel Tanks Construction', '326ede', 'card'],
  [204541, 'Fusion Reactor', '602160', 'energy'],
  [204542, 'Future Circular Collider', 'cc5aa4', 'energy'],
  [204543, 'Galileo Mission', '73fd76', 'card'],
  [204544, 'Giant Magellan Telescope', '84064e', 'energy'],
  [204545, 'GMRT Telescope Construction', '384a5d', 'card'],
  [204546, 'Government Funding', '51294f', 'credit'],
  [204547, 'Grant', 'ace129', 'energy'],
  [204548, 'Gravitational Slingshot', '85c0de', 'credit'],
  [204549, 'Great Observatories Project', '7b1664', 'card'],
  [204550, 'Green Bank Telescope', '117b8b', 'credit'],
  [204551, 'Hayabusa', 'ea6d0b', 'card'],
  [204552, 'Herschel Space Observatory', 'bf22ce', 'card'],
  [204553, 'Hubble Space Telescope', '7c738e', 'card'],
  [204554, 'International Collaboration', '43415b', 'card'],
  [204555, 'Ion Propulsion System', '117e36', 'card'],
  [204556, 'ISS', 'b2b43f', 'credit'],
  [204557, 'James Webb Space Telescope', '4189e1', 'energy'],
  [204558, 'Johnson Space Center', '4c3c47', 'energy'],
  [204559, 'Juno Probe', 'c5d3ac', 'energy'],
  [204560, 'Jupiter Exploration Program', 'a3de78', 'credit'],
  [204561, 'Jupiter Flyby', '17320a', 'energy'],
  [204562, 'Kepler 22 Observation', '8c482d', 'credit'],
  [204563, 'Kepler Space Telescope', '78666e', 'credit'],
  [204564, 'Large Hadron Collider', '3f3603', 'energy'],
  [204565, 'Lightsail', '451a89', 'credit'],
  [204566, 'Linguistic Analysis', '1a78d6', 'credit'],
  [204567, 'Lovell Telescope', '166f34', 'energy'],
  [204568, 'Low-Cost Space Launch', '55639e', 'energy'],
  [204569, 'Low-Power Microprocessors', '7e1ea5', 'card'],
  [204600, 'Mariner 10 Mission', 'dda0ce', 'credit'],
  [204601, 'Mars Exploration Program', '50a94c', 'card'],
  [204602, 'Mars Flyby', '3bdeff', 'energy'],
  [204603, 'Mars Science Laboratory', '3acf9d', 'credit'],
  [204604, 'Mercury Exploration Program', 'd8b51c', 'credit'],
  [204605, 'Mercury Flyby', '6ace9a', 'energy'],
  [204606, 'MESSENGER Probe', '377f7b', 'card'],
  [204607, 'NASA Astrobiology Institute', '719701', 'card'],
  [204608, 'NASA Image of the Day', 'a5c5c6', 'card'],
  [204609, 'NASA Research Center', '063607', 'card'],
  [204610, 'Near-Earth Asteroids Survey', 'ef6a0e', 'energy'],
  [204611, 'NEAR Shoemaker', '6946d4', 'credit'],
  [204612, 'NIAC Program', 'a03d3a', 'credit'],
  [204613, 'Noto Radio Observatory', 'b7680a', 'energy'],
  [204614, 'ODINUS Mission', '6441a7', 'energy'],
  [204615, 'Onsala Telescope Construction', '0f1409', 'credit'],
  [204616, 'Optimal Launch Window', '715e40', 'card'],
  [204617, 'Orbiting Lagrange Point', '48b57d', 'credit'],
  [204618, 'OSIRIS-REx', 'a6ffff', 'energy'],
  [204619, 'Parkes Observatory', 'a70299', 'card'],
  [204620, 'Perseverance Rover', 'd9fe11', 'card'],
  [204621, 'Pioneer 11 Mission', '4e3ba5', 'energy'],
  [204622, 'PIXL', 'a26922', 'energy'],
  [204623, 'Planet Hunters', '5ee14c', 'energy'],
  [204624, 'Planetary Geologic Mapping', '25db89', 'energy'],
  [204625, 'PLATO', '4075ac', 'credit'],
  [204626, 'Popularization of Science', 'ba2503', 'credit'],
  [204627, 'Pre-launch Testing', 'fdf504', 'card'],
  [204628, 'Press Statement', '90c818', 'credit'],
  [204629, 'Procyon Observation', 'a4ef45', 'card'],
  [204630, 'Project Longshot', 'f473b3', 'card'],
  [204631, 'Proxima Centauri Observation', 'a5e89c', 'credit'],
  [204632, 'Quantum Computer', 'b6910e', 'card'],
  [204633, 'Roman Space Telescope', 'c47afb', 'energy'],
  [204634, 'Rosetta Probe', '2b66e2', 'energy'],
  [204635, 'Sample Return', '5e687b', 'energy'],
  [204636, 'Saturn Exploration Program', '540386', 'card'],
  [204637, 'Saturn Flyby', 'e1ddb8', 'card'],
  [204638, 'Scientific Cooperation', '124e14', 'energy'],
  [204639, 'SETI Data Archive', '4afdd2', 'energy'],
  [204640, 'SETI Institute', '1b87eb', 'energy'],
  [204641, 'Seti@Home', '27aa85', 'credit'],
  [204642, 'SHELROC', '459764', 'credit'],
  [204643, 'Sirius A Observation', '6b5698', 'energy'],
  [204644, 'Solvay Conference', 'b94ea4', 'card'],
  [204645, 'Space Launch System', '08cfbe', 'card'],
  [204646, 'Space Shuttle', '4d8944', 'card'],
  [204647, 'Square Kilometre Array', '7508b8', 'credit'],
  [204648, 'Starship', '2ed8ad', 'credit'],
  [204649, 'Strategic Planning', '3532c4', 'credit'],
  [204650, 'Tardigrade Study', '88017b', 'energy'],
  [204651, 'Telescope Modernization', '264777', 'credit'],
  [204652, 'Telescope Time Allocation', '8caa46', 'energy'],
  [204653, 'Through the Asteroid Belt', 'bc748f', 'card'],
  [204654, 'Trajectory Correction', '99a2c3', 'card'],
  [204655, 'Trident Probe', '271532', 'card'],
  [204656, 'Uranus Orbiter and Probe', 'b9b0de', 'credit'],
  [204657, 'Vega Observation', 'a86d8e', 'credit'],
  [204658, 'Venera Probe', '18b8cd', 'credit'],
  [204659, 'Venus Exploration Program', '07a5c8', 'energy'],
  [204660, 'Venus Flyby', '474a9c', 'credit'],
  [204661, 'VERITAS Telescope', '21996d', 'credit'],
  [204662, 'Very Large Array', 'fcb7bb', 'energy'],
  [204663, 'Voyager 2 Mission', '1db53b', 'card'],
  [204664, 'Westerbork Synthesis Radio Telescope', '575980', 'energy'],
  [204665, 'Wow! Signal', '8ca076', 'energy'],
  [204666, 'Yevpatoria Telescope Construction', '4ae210', 'card'],
];

const SETI_PROMO_PROJECT_RAW: readonly RawProject[] = [
  [41500, 'Gateway to Mars', '8adb22', 'credit'],
  [204700, 'Pluto: Not a planet since 2006', '5a62da', 'card'],
];

function setiProjectDef(raw: RawProject, promo: boolean): SetiProjectCardDef {
  const [sourceCardId, name, sourceGuid, incomeCorner] = raw;
  const deckId = Math.floor(sourceCardId / 100);
  const cell = sourceCardId % 100;
  const sheet = SETI_PROJECT_SHEETS[deckId];
  if (!sheet) throw new Error(`Missing SETI sheet ${deckId}`);
  return {
    id: promo ? `seti_promo_${sourceCardId}` : `seti_project_${sourceCardId}`,
    name,
    sourceGuid,
    promo,
    art: {
      ref: `seti:project:${sourceCardId}`,
      sourceCardId,
      deckId,
      cell,
      column: cell % sheet.width,
      row: Math.floor(cell / sheet.width),
      sheetWidth: sheet.width,
      sheetHeight: sheet.height,
      faceUrl: sheet.faceUrl,
    },
    printed: {
      status: 'untranscribed',
      cost: null,
      sectorColors: null,
      freeCorner: null,
      incomeCorner,
      incomeProvenance: 'non-authoritative-ocr-hint',
      cardType: null,
      conditions: null,
      effects: null,
    },
  };
}

export const SETI_BASE_PROJECT_CARDS: readonly SetiProjectCardDef[] = SETI_BASE_PROJECT_RAW.map((raw) => setiProjectDef(raw, false));
export const SETI_PROMO_PROJECT_CARDS: readonly SetiProjectCardDef[] = SETI_PROMO_PROJECT_RAW.map((raw) => setiProjectDef(raw, true));
export const SETI_PROJECT_CARDS: readonly SetiProjectCardDef[] = [...SETI_BASE_PROJECT_CARDS, ...SETI_PROMO_PROJECT_CARDS];
export const SETI_PROJECT_BY_ID: Readonly<Record<string, SetiProjectCardDef>> = Object.fromEntries(SETI_PROJECT_CARDS.map((card) => [card.id, card]));

export type SetiSpeciesId = 'mascamites' | 'anomalies' | 'oumuamua' | 'centaurians' | 'exertians';
export const SETI_SPECIES: readonly SetiSpeciesId[] = ['mascamites', 'anomalies', 'oumuamua', 'centaurians', 'exertians'];

export interface SetiAlienCardDef {
  id: string;
  species: SetiSpeciesId;
  art: SetiCardArtRef;
  printed: { status: 'untranscribed'; effects: null };
}

const SETI_ALIEN_SHEETS: Readonly<Record<SetiSpeciesId, { deckId: number; count: number; width: number; height: number; faceUrl: string }>> = {
  mascamites: { deckId: 2026, count: 10, width: 6, height: 2, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/11922044724117917/AD2E64802BC7776BE6CDA501225B824C9DD72C5B/' },
  anomalies: { deckId: 2025, count: 10, width: 10, height: 7, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/11922044723885400/A50CF23626498AC43B1E265926DE704897F0B91A/' },
  oumuamua: { deckId: 2058, count: 10, width: 8, height: 2, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/11922044724063545/D660CF69939547C660EC94B025B42D05994AFCC1/' },
  centaurians: { deckId: 3, count: 10, width: 6, height: 2, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/11921410605559466/C41850A3EA774D853075FC27E84AD0E922AAEF7E/' },
  exertians: { deckId: 2027, count: 15, width: 8, height: 2, faceUrl: 'https://steamusercontent-a.akamaihd.net/ugc/11922044724025616/05CB7EDA35DAB4640E24DB579DD695C1BF143651/' },
};

export const SETI_ALIEN_CARDS: readonly SetiAlienCardDef[] = SETI_SPECIES.flatMap((species) => {
  const sheet = SETI_ALIEN_SHEETS[species];
  return Array.from({ length: sheet.count }, (_, cell): SetiAlienCardDef => ({
    id: `seti_alien_${species}_${String(cell + 1).padStart(2, '0')}`,
    species,
    art: {
      ref: `seti:alien:${species}:${cell}`,
      sourceCardId: sheet.deckId * 100 + cell,
      deckId: sheet.deckId,
      cell,
      column: cell % sheet.width,
      row: Math.floor(cell / sheet.width),
      sheetWidth: sheet.width,
      sheetHeight: sheet.height,
      faceUrl: sheet.faceUrl,
    },
    printed: { status: 'untranscribed', effects: null },
  }));
});
export const SETI_ALIEN_BY_ID: Readonly<Record<string, SetiAlienCardDef>> = Object.fromEntries(SETI_ALIEN_CARDS.map((card) => [card.id, card]));

export type SetiTechnologyType = 'probe' | 'telescope' | 'computer';
export type SetiTechAbility =
  | 'probe-limit-and-launch'
  | 'asteroid-navigation'
  | 'landing-discount'
  | 'moon-landing'
  | 'earth-signal-adjacent'
  | 'discard-extra-signal'
  | 'mercury-publicity-signal'
  | 'energy-launch-or-move'
  | 'computer-bonus-slot';
export type SetiTechStackId = `seti_tech_stack_${string}`;

export interface SetiTechTileDef {
  id: string;
  sourceCardId: number;
  artRef: string;
  immediateReward: { status: 'typed'; ops: readonly SetiKnownRewardOp[] };
}

export interface SetiTechStackDef {
  id: SetiTechStackId;
  type: SetiTechnologyType;
  ability: SetiTechAbility;
  sourceGuid: string;
  tiles: readonly SetiTechTileDef[];
}

const SETI_TECH_RAW: readonly [string, SetiTechnologyType, SetiTechAbility, string, readonly number[]][] = [
  ['probe_1', 'probe', 'probe-limit-and-launch', '5065ac', [39600, 39700, 39800, 39900]],
  ['probe_2', 'probe', 'asteroid-navigation', 'b71fb9', [40000, 40100, 40200, 40300]],
  ['probe_3', 'probe', 'landing-discount', 'c0c391', [202800, 40400, 40500, 40600]],
  ['probe_4', 'probe', 'moon-landing', '00d8a2', [6000, 6100, 6200, 40700]],
  ['telescope_1', 'telescope', 'earth-signal-adjacent', '82eb24', [5200, 5300, 5400, 5500]],
  ['telescope_2', 'telescope', 'discard-extra-signal', '93c0f5', [40800, 40900, 41000, 41100]],
  ['telescope_3', 'telescope', 'mercury-publicity-signal', '0fb79c', [202900, 203000, 4400, 203100]],
  ['telescope_4', 'telescope', 'energy-launch-or-move', '9b40d4', [41200, 203200, 203300, 203400]],
  ['computer_1', 'computer', 'computer-bonus-slot', '00df2d', [205100, 2200, 2300, 205200]],
  ['computer_2', 'computer', 'computer-bonus-slot', 'b26ea5', [2900, 3000, 2600, 2700]],
  ['computer_3', 'computer', 'computer-bonus-slot', '84fb8c', [3500, 3300, 3100, 3400]],
  ['computer_4', 'computer', 'computer-bonus-slot', '9dceb9', [3800, 39400, 3900, 39500]],
];

const SETI_TECH_REWARD_BY_SOURCE: Readonly<Record<number, readonly SetiKnownRewardOp[]>> = {
  205100: [{ kind: 'publicity', amount: 1 }], 2200: [{ kind: 'energy', amount: 1 }],
  2300: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }], 205200: [{ kind: 'vp', amount: 3 }],
  2900: [{ kind: 'energy', amount: 1 }], 3000: [{ kind: 'publicity', amount: 1 }],
  2600: [{ kind: 'vp', amount: 3 }], 2700: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }],
  3500: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }], 3300: [{ kind: 'publicity', amount: 1 }],
  3100: [{ kind: 'energy', amount: 1 }], 3400: [{ kind: 'vp', amount: 3 }],
  3800: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }], 39400: [{ kind: 'energy', amount: 1 }],
  3900: [{ kind: 'vp', amount: 3 }], 39500: [{ kind: 'publicity', amount: 1 }],
  5200: [{ kind: 'publicity', amount: 1 }], 5300: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }],
  5400: [{ kind: 'vp', amount: 3 }], 5500: [{ kind: 'energy', amount: 1 }],
  40800: [{ kind: 'vp', amount: 3 }], 40900: [{ kind: 'publicity', amount: 1 }],
  41000: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }], 41100: [{ kind: 'energy', amount: 1 }],
  202900: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }], 203000: [{ kind: 'publicity', amount: 1 }],
  4400: [{ kind: 'vp', amount: 3 }], 203100: [{ kind: 'energy', amount: 1 }],
  41200: [{ kind: 'trace', color: 'orange', amount: 1 }, { kind: 'publicity', amount: 1 }],
  203200: [{ kind: 'trace', color: 'orange', amount: 1 }, { kind: 'vp', amount: 3 }],
  203300: [{ kind: 'trace', color: 'orange', amount: 1 }, { kind: 'energy', amount: 1 }],
  203400: [{ kind: 'trace', color: 'orange', amount: 1 }, { kind: 'draw-project', amount: 1, source: 'row-or-deck' }],
  39600: [{ kind: 'energy', amount: 1 }], 39700: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }],
  39800: [{ kind: 'publicity', amount: 1 }], 39900: [{ kind: 'vp', amount: 3 }],
  40000: [{ kind: 'vp', amount: 3 }], 40100: [{ kind: 'publicity', amount: 1 }],
  40200: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }], 40300: [{ kind: 'energy', amount: 1 }],
  6000: [{ kind: 'energy', amount: 1 }], 6100: [{ kind: 'vp', amount: 3 }],
  6200: [{ kind: 'draw-project', amount: 1, source: 'row-or-deck' }], 40700: [{ kind: 'publicity', amount: 1 }],
  202800: [{ kind: 'data', amount: 2 }, { kind: 'draw-project', amount: 1, source: 'row-or-deck' }],
  40400: [{ kind: 'data', amount: 2 }, { kind: 'energy', amount: 1 }],
  40500: [{ kind: 'data', amount: 2 }, { kind: 'vp', amount: 3 }],
  40600: [{ kind: 'data', amount: 2 }, { kind: 'publicity', amount: 1 }],
};

export const SETI_TECH_STACKS: readonly SetiTechStackDef[] = SETI_TECH_RAW.map(([suffix, type, ability, sourceGuid, ids]) => {
  const id = `seti_tech_stack_${suffix}` as SetiTechStackId;
  return {
    id,
    type,
    ability,
    sourceGuid,
    tiles: ids.map((sourceCardId, index) => ({
      id: `${id}_tile_${String(index + 1).padStart(2, '0')}`,
      sourceCardId,
      artRef: `seti:tech:${sourceCardId}`,
      immediateReward: { status: 'typed' as const, ops: SETI_TECH_REWARD_BY_SOURCE[sourceCardId] ?? [] },
    })),
  };
});
export const SETI_TECH_BY_ID: Readonly<Record<SetiTechStackId, SetiTechStackDef>> = Object.fromEntries(SETI_TECH_STACKS.map((stack) => [stack.id, stack])) as Record<SetiTechStackId, SetiTechStackDef>;

export type SetiGoldTileId = 'seti_gold_tech' | 'seti_gold_mission' | 'seti_gold_income' | 'seti_gold_other';
export type SetiGoldSide = 'A' | 'B';
export interface SetiGoldTileDef {
  id: SetiGoldTileId;
  side: SetiGoldSide;
  unit: 'tech-set' | 'any-two-techs' | 'completed-mission' | 'mission-pair' | 'income-trio' | 'income-large' | 'trace-trio' | 'sector-and-spacecraft';
  values: readonly [number, number, number];
}

export const SETI_GOLD_TILES: readonly SetiGoldTileDef[] = [
  { id: 'seti_gold_tech', side: 'A', unit: 'tech-set', values: [11, 8, 5] },
  { id: 'seti_gold_tech', side: 'B', unit: 'any-two-techs', values: [7, 5, 3] },
  { id: 'seti_gold_mission', side: 'A', unit: 'completed-mission', values: [4, 3, 2] },
  { id: 'seti_gold_mission', side: 'B', unit: 'mission-pair', values: [8, 6, 4] },
  { id: 'seti_gold_income', side: 'A', unit: 'income-trio', values: [11, 8, 5] },
  { id: 'seti_gold_income', side: 'B', unit: 'income-large', values: [5, 4, 3] },
  { id: 'seti_gold_other', side: 'A', unit: 'trace-trio', values: [8, 6, 4] },
  { id: 'seti_gold_other', side: 'B', unit: 'sector-and-spacecraft', values: [8, 6, 4] },
];

export const SETI_RULES = {
  rounds: 5,
  publicityMax: 10,
  dataMax: 6,
  handLimitAtPass: 4,
  startPublicity: 4,
  startCredits: 4,
  startEnergy: 3,
  startHand: 5,
  baseIncomeCredits: 3,
  baseIncomeEnergy: 2,
  baseIncomeCards: 1,
  projectRow: 3,
  launchCredits: 2,
  moveEnergy: 1,
  asteroidExitEnergy: 1,
  orbitCredits: 1,
  orbitEnergy: 1,
  landEnergy: 3,
  landWithOrbiterEnergy: 2,
  scanCredits: 1,
  scanEnergy: 2,
  analyzeEnergy: 1,
  researchPublicity: 6,
  buyPublicity: 3,
  computerTopSpaces: 6,
  probeLimit: 1,
  upgradedProbeLimit: 2,
  goldThresholds: [25, 50, 70] as readonly number[],
  neutralThresholds: [20, 30] as readonly number[],
} as const;

if (SETI_BASE_PROJECT_CARDS.length !== 138) throw new Error(`SETI base deck must contain 138 cards, got ${SETI_BASE_PROJECT_CARDS.length}`);
if (SETI_PROMO_PROJECT_CARDS.length !== 2) throw new Error('SETI promo inventory must contain 2 cards');
if (SETI_TECH_STACKS.length !== 12 || SETI_TECH_STACKS.some((stack) => stack.tiles.length !== 4)) throw new Error('SETI must contain twelve four-tile technology stacks');
if (SETI_ALIEN_CARDS.length !== 55) throw new Error(`SETI alien inventory must contain 55 cards, got ${SETI_ALIEN_CARDS.length}`);
