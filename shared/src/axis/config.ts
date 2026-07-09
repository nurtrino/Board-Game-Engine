// Axis & Allies Anniversary Edition (1941 + 1942) — powers, units, scenarios,
// research, national objectives, win conditions. Sources: the official
// Anniversary rulebook (digested in docs/specs/axis-allies-anniversary.md;
// NO bonuses read from a render of p23) and the owner's assistant tool
// (anniversary.config.ts) for cross-checking unit profiles. Where the two
// disagree (turn order is per-scenario in the rulebook), the rulebook wins.

export type PowerKey = 'germany' | 'ussr' | 'japan' | 'uk' | 'italy' | 'usa';
export type Coalition = 'axis' | 'allies';

export interface PowerDef {
  key: PowerKey;
  name: string;
  short: string;
  coalition: Coalition;
  color: string; // UI color, from the rulebook's printed piece colors
  capital: string; // territory id in map.json
}

export const POWERS: Record<PowerKey, PowerDef> = {
  germany: { key: 'germany', name: 'Germany', short: 'GER', coalition: 'axis', color: '#5a5a5a', capital: 'germany' },
  ussr: { key: 'ussr', name: 'Soviet Union', short: 'USSR', coalition: 'allies', color: '#7a1f1f', capital: 'russia' },
  japan: { key: 'japan', name: 'Japan', short: 'JPN', coalition: 'axis', color: '#d07c28', capital: 'japan' },
  uk: { key: 'uk', name: 'United Kingdom', short: 'UK', coalition: 'allies', color: '#b5894e', capital: 'united-kingdom' },
  italy: { key: 'italy', name: 'Italy', short: 'ITA', coalition: 'axis', color: '#6b4a2b', capital: 'italy' },
  usa: { key: 'usa', name: 'United States', short: 'USA', coalition: 'allies', color: '#2e7d32', capital: 'eastern-united-states' },
};

// China is a US-controlled separate force, not a power: no income, no
// purchases, its own placement/movement restrictions (see spec + rulebook p11).
export const CHINA_COLOR = '#8fbf6f';

export type Scenario = '1941' | '1942';

// Rulebook p6: the turn order differs between scenarios.
export const TURN_ORDER: Record<Scenario, PowerKey[]> = {
  '1941': ['germany', 'ussr', 'japan', 'uk', 'italy', 'usa'],
  '1942': ['japan', 'ussr', 'germany', 'uk', 'italy', 'usa'],
};

// Starting IPCs (rulebook pp3-4 scenario charts).
export const STARTING_IPCS: Record<Scenario, Record<PowerKey, number>> = {
  '1941': { germany: 31, japan: 17, italy: 10, usa: 40, uk: 43, ussr: 30 },
  '1942': { germany: 31, japan: 31, italy: 10, usa: 38, uk: 31, ussr: 24 },
};

export type UnitKey =
  | 'infantry' | 'artillery' | 'tank' | 'aaGun' | 'factory'
  | 'fighter' | 'bomber'
  | 'battleship' | 'carrier' | 'cruiser' | 'destroyer' | 'submarine' | 'transport';

export type Domain = 'land' | 'air' | 'sea' | 'structure';

export interface UnitProfile {
  key: UnitKey;
  name: string;
  cost: number;
  attack: number;
  defense: number;
  move: number;
  hits: number;
  domain: Domain;
}

// Rulebook Unit Profiles pp24-31.
export const UNITS: Record<UnitKey, UnitProfile> = {
  infantry: { key: 'infantry', name: 'Infantry', cost: 3, attack: 1, defense: 2, move: 1, hits: 1, domain: 'land' },
  artillery: { key: 'artillery', name: 'Artillery', cost: 4, attack: 2, defense: 2, move: 1, hits: 1, domain: 'land' },
  tank: { key: 'tank', name: 'Tank', cost: 5, attack: 3, defense: 3, move: 2, hits: 1, domain: 'land' },
  aaGun: { key: 'aaGun', name: 'Antiaircraft Gun', cost: 6, attack: 0, defense: 1, move: 1, hits: 1, domain: 'land' },
  factory: { key: 'factory', name: 'Industrial Complex', cost: 15, attack: 0, defense: 0, move: 0, hits: 1, domain: 'structure' },
  fighter: { key: 'fighter', name: 'Fighter', cost: 10, attack: 3, defense: 4, move: 4, hits: 1, domain: 'air' },
  bomber: { key: 'bomber', name: 'Bomber', cost: 12, attack: 4, defense: 1, move: 6, hits: 1, domain: 'air' },
  battleship: { key: 'battleship', name: 'Battleship', cost: 20, attack: 4, defense: 4, move: 2, hits: 2, domain: 'sea' },
  carrier: { key: 'carrier', name: 'Aircraft Carrier', cost: 14, attack: 1, defense: 2, move: 2, hits: 1, domain: 'sea' },
  cruiser: { key: 'cruiser', name: 'Cruiser', cost: 12, attack: 3, defense: 3, move: 2, hits: 1, domain: 'sea' },
  destroyer: { key: 'destroyer', name: 'Destroyer', cost: 8, attack: 2, defense: 2, move: 2, hits: 1, domain: 'sea' },
  submarine: { key: 'submarine', name: 'Submarine', cost: 6, attack: 2, defense: 1, move: 2, hits: 1, domain: 'sea' },
  transport: { key: 'transport', name: 'Transport', cost: 7, attack: 0, defense: 0, move: 2, hits: 1, domain: 'sea' },
};

export const SURFACE_WARSHIPS: UnitKey[] = ['battleship', 'carrier', 'cruiser', 'destroyer'];
export const CAN_CAPTURE: UnitKey[] = ['infantry', 'artillery', 'tank'];

// ---------- Research & Development (optional rule) ----------

export const RESEARCH_DIE_COST = 5;

export type TechKey =
  // chart 1
  | 'advancedArtillery' | 'rockets' | 'paratroopers' | 'increasedFactory' | 'warBonds' | 'mechanizedInfantry'
  // chart 2
  | 'superSubs' | 'jetFighters' | 'improvedShipyards' | 'radar' | 'longRangeAircraft' | 'heavyBombers';

export interface TechDef { key: TechKey; chart: 1 | 2; roll: number; name: string; text: string }

export const TECHS: TechDef[] = [
  { key: 'advancedArtillery', chart: 1, roll: 1, name: 'Advanced Artillery', text: 'Each artillery supports two infantry per attack.' },
  { key: 'rockets', chart: 1, roll: 2, name: 'Rockets', text: 'Each AA gun may make one rocket attack per turn against an enemy industrial complex within 3 spaces (1d6 damage).' },
  { key: 'paratroopers', chart: 1, roll: 3, name: 'Paratroopers', text: 'Each bomber may carry one infantry into the first hostile territory it enters.' },
  { key: 'increasedFactory', chart: 1, roll: 4, name: 'Increased Factory Production', text: 'Each complex produces 2 units over its territory value; repairs cost half.' },
  { key: 'warBonds', chart: 1, roll: 5, name: 'War Bonds', text: 'Collect 1d6 bonus IPCs during Collect Income.' },
  { key: 'mechanizedInfantry', chart: 1, roll: 6, name: 'Mechanized Infantry', text: 'Each infantry matched with a tank may move 2 spaces with it.' },
  { key: 'superSubs', chart: 2, roll: 1, name: 'Super Submarines', text: 'Submarines attack at 3.' },
  { key: 'jetFighters', chart: 2, roll: 2, name: 'Jet Fighters', text: 'Fighters attack at 4.' },
  { key: 'improvedShipyards', chart: 2, roll: 3, name: 'Improved Shipyards', text: 'Cheaper sea units: BB 17, CV 11, CA 10, DD 7, TP 6, SS 5.' },
  { key: 'radar', chart: 2, roll: 4, name: 'Radar', text: 'AA guns hit on 1 or 2.' },
  { key: 'longRangeAircraft', chart: 2, roll: 5, name: 'Long-Range Aircraft', text: 'Fighters move 6, bombers move 8.' },
  { key: 'heavyBombers', chart: 2, roll: 6, name: 'Heavy Bombers', text: 'Bombers roll two dice on attack and strategic bombing (defense still one).' },
];
export const TECH_BY_KEY: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.key, t]));

export const SHIPYARD_COSTS: Partial<Record<UnitKey, number>> = {
  battleship: 17, carrier: 11, cruiser: 10, destroyer: 7, transport: 6, submarine: 5,
};

// ---------- Win conditions ----------

export const TOTAL_VICTORY_CITIES = 18;
export type WinCondition = 'short' | 'standard' | 'total';
export const WIN_CONDITIONS: Record<WinCondition, { label: string; cities: number }> = {
  short: { label: 'Short Game', cities: 13 },
  standard: { label: 'Standard Game', cities: 15 },
  total: { label: 'Total Domination', cities: 18 },
};

// ---------- National Objectives (optional rule; every bonus is 5 IPC except
// the USSR buffer objective which is 10 — read from rulebook p23) ----------

export interface ObjectiveDef {
  id: string;
  power: PowerKey;
  bonus: number;
  text: string;
  // side-control check: 'all' territories, 'atLeast' n of them, or 'any'
  kind: 'all' | 'atLeast' | 'any';
  n?: number;
  territories: string[]; // map.json territory ids
  // extra predicates handled by the engine:
  special?: 'noEnemySurfaceWarshipsSz131415' | 'sovietsOnlyAndArchangel' | 'anyOriginallyJapanese';
}

// Territory id lists use map.json ids; validated by axis-test against the map
// golden once it lands.
export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'usa-homeland', power: 'usa', bonus: 5, kind: 'all', text: 'Allied powers control Western, Central, and Eastern United States.', territories: ['western-united-states', 'central-united-states', 'eastern-united-states'] },
  { id: 'usa-philippines', power: 'usa', bonus: 5, kind: 'all', text: 'Allied powers control the Philippine Islands.', territories: ['philippine-islands'] },
  { id: 'usa-france', power: 'usa', bonus: 5, kind: 'all', text: 'Allied powers control France.', territories: ['france'] },
  { id: 'usa-pacific', power: 'usa', bonus: 5, kind: 'atLeast', n: 3, text: 'Allied powers control at least three of Midway, Wake Island, Hawaiian Islands, Solomon Islands.', territories: ['midway', 'wake-island', 'hawaiian-islands', 'solomon-islands'] },
  { id: 'uk-empire', power: 'uk', bonus: 5, kind: 'all', text: 'Allied powers control Eastern Canada, Western Canada, Gibraltar, Egypt, Australia, and Union of South Africa.', territories: ['eastern-canada', 'western-canada', 'gibraltar', 'egypt', 'australia', 'union-of-south-africa'] },
  { id: 'uk-pacific', power: 'uk', bonus: 5, kind: 'any', text: 'Allied powers control any territory originally under Japanese control.', territories: [], special: 'anyOriginallyJapanese' },
  { id: 'uk-europe', power: 'uk', bonus: 5, kind: 'atLeast', n: 1, text: 'Allied powers control France and/or Balkans.', territories: ['france', 'balkans'] },
  { id: 'ussr-buffer', power: 'ussr', bonus: 10, kind: 'atLeast', n: 3, text: 'Allied powers control at least three of Norway, Finland, Poland, Bulgaria/Romania, Czechoslovakia/Hungary, Balkans.', territories: ['norway', 'finland', 'poland', 'bulgaria-romania', 'czechoslovakia-hungary', 'balkans'] },
  { id: 'ussr-solidarity', power: 'ussr', bonus: 5, kind: 'all', text: 'No other Allied forces in Soviet-controlled territory and the Soviets control Archangel.', territories: ['archangel'], special: 'sovietsOnlyAndArchangel' },
  { id: 'germany-europe', power: 'germany', bonus: 5, kind: 'all', text: 'Axis powers control France, Northwestern Europe, Germany, Czechoslovakia/Hungary, Bulgaria/Romania, and Poland.', territories: ['france', 'northwestern-europe', 'germany', 'czechoslovakia-hungary', 'bulgaria-romania', 'poland'] },
  { id: 'germany-east', power: 'germany', bonus: 5, kind: 'atLeast', n: 3, text: 'Axis powers control at least three of Baltic States, East Poland, Ukraine, Eastern Ukraine, Belorussia.', territories: ['baltic-states', 'east-poland', 'ukraine', 'eastern-ukraine', 'belorussia'] },
  { id: 'germany-flank', power: 'germany', bonus: 5, kind: 'atLeast', n: 1, text: 'Axis powers control Karelia S.S.R. and/or Caucasus.', territories: ['karelia', 'caucasus'] },
  { id: 'japan-core', power: 'japan', bonus: 5, kind: 'all', text: 'Axis powers control Manchuria, Kiangsu, and French Indo-China/Thailand.', territories: ['manchuria', 'kiangsu', 'french-indo-china-thailand'] },
  { id: 'japan-perimeter', power: 'japan', bonus: 5, kind: 'atLeast', n: 4, text: 'Axis powers control at least four of Kwangtung, East Indies, Borneo, Philippine Islands, New Guinea, Solomon Islands.', territories: ['kwangtung', 'east-indies', 'borneo', 'philippine-islands', 'new-guinea', 'solomon-islands'] },
  { id: 'japan-reach', power: 'japan', bonus: 5, kind: 'atLeast', n: 1, text: 'Axis powers control Hawaiian Islands, Australia, and/or India.', territories: ['hawaiian-islands', 'australia', 'india'] },
  { id: 'italy-marenostrum', power: 'italy', bonus: 5, kind: 'all', text: 'Axis powers control Italy, Balkans, Morocco/Algeria, and Libya, with no enemy surface warships in sea zones 13, 14, 15.', territories: ['italy', 'balkans', 'morocco-algeria', 'libya'], special: 'noEnemySurfaceWarshipsSz131415' },
  { id: 'italy-expansion', power: 'italy', bonus: 5, kind: 'atLeast', n: 3, text: 'Axis powers control at least three of Egypt, Trans-Jordan, France, Gibraltar.', territories: ['egypt', 'trans-jordan', 'france', 'gibraltar'] },
];

// ---------- China (rulebook p11) ----------

export const CHINA_RULES = {
  infantryPerTerritories: 2, // 1 new infantry per 2 non-Axis Chinese territories
  maxUnitsPerPlacement: 3, // placed on Chinese territories with fewer than 3 units
} as const;
