// Dark Souls: The Board Game — typed accessors over the mirrored goldens.
// The JSON under ./data/ is copied verbatim from games/dark-souls/golden-draft
// (sync-data.mjs). Precedence: goldens > digests > rulebook photos (spec §0).

import enemiesJson from './data/enemies.json';
import encountersJson from './data/encounters.json';
import treasuresJson from './data/treasures.json';
import bossesJson from './data/bosses.json';
import classesJson from './data/classes.json';
import tilesJson from './data/tiles.json';
import scenariosJson from './data/scenarios.json';

// ---------- enemies ----------

export interface DsEnemyMove {
  nodes?: number;
  toward?: 'nearest' | 'aggro';
  leap?: boolean;
  push?: boolean;
  pushDamage?: number;
  when: 'beforeAttack' | 'afterAttack' | 'only';
}

export interface DsEnemyBehavior {
  name: string;
  movement: DsEnemyMove | null;
  attackType: 'physical' | 'magic' | null;
  range: number | 'infinite' | null;
  damage: number | null;
  dodgeDifficulty: number;
  nodeAoE: boolean;
  target: 'nearest' | 'aggro' | null;
  push: boolean;
  repeat: number | null;
  conditions: string[];
  special: string | null;
}

export interface DsEnemyDef {
  id: string;
  name: string;
  expansion: string;
  health: number;
  block: number;
  resist: number;
  threat: number;
  attackRange: number | 'infinite' | null;
  dodgeDifficulty: number;
  special: string | null;
}

interface RawEnemyEntry { data: DsEnemyDef; behaviors: DsEnemyBehavior[] }
interface RawInvaderData extends DsEnemyDef {
  class: 'standard' | 'advanced';
  behaviourDeckSize: number;
  heatUpPoint: number;
  soulsValue: number;
  treasureCard: string;
}
interface RawInvaderEntry { data: RawInvaderData; behaviors: DsEnemyBehavior[] }

const enemiesFile = enemiesJson as unknown as { enemies: RawEnemyEntry[]; invaders: RawInvaderEntry[] };

export const DS_ENEMIES: Record<string, RawEnemyEntry> =
  Object.fromEntries(enemiesFile.enemies.map((e) => [e.data.id, e]));
export const DS_INVADERS: Record<string, RawInvaderEntry> =
  Object.fromEntries(enemiesFile.invaders.map((e) => [e.data.id, e]));
export type DsInvaderDef = RawInvaderEntry;

/** Invader identity is deterministic in this mod: Kirk pre-mini-boss,
 * Longfinger Kirk post-mini-boss (spec open question 5, proposal adopted). */
export const DS_INVADER_STANDARD = 'kirk-knight-of-thorns';
export const DS_INVADER_ADVANCED = 'longfinger-kirk';

// ---------- encounters ----------

export interface DsEncounterCard {
  id: string;
  deck: string;
  level: number;
  name: string;
  cardId: number;
  trapped: boolean;
  spawns: { enemy: string; node: string }[];
  terrain: { piece: string; node: string }[];
  rewards: { soulsPerCharacter: number; oneShot?: boolean };
}

export const DS_ENCOUNTERS: DsEncounterCard[] = encountersJson as unknown as DsEncounterCard[];
export const DS_ENCOUNTER_BY_ID: Record<string, DsEncounterCard> =
  Object.fromEntries(DS_ENCOUNTERS.map((e) => [e.id, e]));

/** An L4 card that spawns UNKNOWN enemies (sets absent from the mod) is
 * undrawable and must be redrawn (mega insert p.7; spec correction 4). */
export const dsIsDrawableEncounter = (card: DsEncounterCard): boolean =>
  card.spawns.every((sp) => sp.enemy !== 'UNKNOWN');

export const dsEncounterPool = (level: number, opts: { darkroot: 'off' | 'append' | 'replaceSix' }): DsEncounterCard[] => {
  const core = DS_ENCOUNTERS.filter((e) => e.level === level && e.deck === `Level ${level} Encounter`);
  const dark = DS_ENCOUNTERS.filter((e) => e.level === level && e.deck === `Level ${level} Darkroot Encounter`);
  if (level === 4 || opts.darkroot === 'off') return core;
  if (opts.darkroot === 'append') return [...core, ...dark];
  // replaceSix: six random core cards are replaced by the six darkroot cards
  // of that level (darkroot p.6) — the random removal happens at deck build.
  return [...core, ...dark];
};

export const dsL4Pool = (deckName: string): DsEncounterCard[] =>
  DS_ENCOUNTERS.filter((e) => e.level === 4 && e.deck === deckName);

export const DS_L4_DECKS: Record<string, string> = {
  'four-kings': 'Level 4 Four Kings Encounter',
  'old-iron-king': 'Level 4 Old Iron King Encounter',
  'black-dragon-kalameet': 'Level 4 Black Dragon Kalameet Encounter',
};

// ---------- treasures ----------

/** Structured encoding of a printed text/icon-only card action (the "spell
 * DSL", decision log 11). Every field mirrors the printed card; the ambiguous
 * glyphs were re-verified against sheet crops (Force's twin stagger icons,
 * Atonement's node dot, Sacred Oath shield-frame = block vs Magic Barrier
 * hexagon-frame = resist, shield-bash = the stagger glyph). */
export type DsSpellEffect =
  | { kind: 'grant'; who: 'one' | 'self' | 'all' | 'allOthers' | 'upTo2' | 'oneNode'; stamina?: number; health?: number }
  | { kind: 'buff'; magical: true; damage?: number } // caster's attacks this activation
  | {
    kind: 'defenceBuff'; who: 'self' | 'allInRange' | 'party';
    block?: Partial<Record<'black' | 'blue' | 'orange', number>>;
    resist?: Partial<Record<'black' | 'blue' | 'orange', number>>;
    until: 'enemyPhaseEnd' | 'charActivationStart';
  }
  | { kind: 'afflict'; targets?: number; node?: boolean } // conditions/push come from the action's icons
  | { kind: 'shift'; nodes: number }
  | { kind: 'rapport'; damage: number }; // enemy sharing a node with another enemy suffers N

export interface DsTreasureAction {
  staminaCost: number;
  dice?: Partial<Record<'black' | 'blue' | 'orange', number>>;
  flatModifier?: number;
  icons?: string[];
  text?: string;
  effect?: DsSpellEffect;
}

export interface DsTreasureCard {
  id: string;
  deck: string;
  name: string;
  kind: 'weapon' | 'shield' | 'armour' | 'spell' | 'upgrade' | 'item';
  slot: string;
  twoHanded?: boolean;
  requirements: Record<'str' | 'dex' | 'int' | 'fai', number>;
  range?: number;
  actions?: DsTreasureAction[];
  defence?: {
    block: Partial<Record<'black' | 'blue' | 'orange', number>>;
    resist: Partial<Record<'black' | 'blue' | 'orange', number>>;
    dodge: number;
  };
  upgradeSlots?: number;
  special?: string;
  embered?: boolean;
}

export const DS_TREASURES: DsTreasureCard[] = (treasuresJson as unknown as { cards: DsTreasureCard[] }).cards;
export const DS_TREASURE_BY_ID: Record<string, DsTreasureCard> =
  Object.fromEntries(DS_TREASURES.map((c) => [c.id, c]));

export const dsTreasureDeckCards = (deck: string): DsTreasureCard[] =>
  DS_TREASURES.filter((c) => c.deck === deck);

/** Upgrade card effect hooks parsed from verbatim special text. Only the
 * two mechanical patterns present in the golden's upgrade pool are executed
 * (+N damage, gain Bleed); other upgrade texts are carried for display. */
export const dsUpgradeDamageBonus = (card: DsTreasureCard): number => {
  const m = /\+(\d+) damage/.exec(card.special ?? '');
  return m ? Number(m[1]) : 0;
};
export const dsUpgradeGrantsBleed = (card: DsTreasureCard): boolean =>
  /gain Bleed/i.test(card.special ?? '');

// ---------- bosses ----------

export type DsBossOp =
  | { op: 'move'; distance: number; toward?: 'nearest' | 'aggro' | 'awayFromNearest' | 'awayFromAggro'; push?: boolean; pushDamage?: number }
  | { op: 'shift'; distance: number; direction: 'forward' | 'backward' | 'left' | 'right'; push?: boolean; pushDamage?: number }
  | { op: 'turn'; degrees: 90 | 180; direction?: 'left' | 'right' }
  | { op: 'leap'; to: 'nearest' | 'aggro'; push?: boolean; pushDamage?: number }
  | {
      op: 'attack'; type: 'physical' | 'magical'; damage: number;
      style: 'area' | 'node' | 'target' | 'template';
      target?: 'nearest' | 'aggro'; push?: boolean; stagger?: boolean; frostbite?: boolean;
      arcs?: { attack: string[]; weak: string[] };
    }
  | { op: 'stagger' }
  | { op: 'flight' }
  | { op: 'fireBeamTemplate' }
  | { op: 'special'; icon: string };

export interface DsBossCard {
  cell: number | string;
  name: string;
  heatUp?: boolean;
  coolDownCard?: boolean;
  range: number | 'infinite' | 'special' | null;
  dodge: number;
  repeat?: number;
  arcs: { attack: string[]; weak: string[] } | null;
  ops: DsBossOp[];
}

export interface DsBossData {
  threat: number | null;
  health: number;
  deckSize: number;
  heatUpThreshold: number | null;
  block: number;
  resist: number;
  encounterIcons: number[] | null;
  specialName: string;
  special: string;
}

export interface DsBossDef {
  id: string;
  name: string;
  tier: 'mini' | 'main' | 'mega';
  expansion: string;
  paired?: boolean;
  data?: DsBossData;
  behaviors?: DsBossCard[];
  // Ornstein & Smough
  pairedData?: { ornstein: DsBossData; smough: DsBossData };
  pairedBehaviors?: { cell: number; ornstein: Omit<DsBossCard, 'cell'>; smough: Omit<DsBossCard, 'cell'> }[];
  ornsteinHeatUps?: DsBossCard[];
  smoughHeatUps?: DsBossCard[];
  // Four Kings
  kingOne?: DsBossCard[]; kingTwo?: DsBossCard[]; kingThree?: DsBossCard[]; kingFour?: DsBossCard[];
  // Old Iron King
  fireBeam?: DsBossCard[];
  blastedNodes?: DsNodePatternCard[];
  // Kalameet
  fieryRuin?: DsNodePatternCard[];
}

/** Decoded beam/strafe card: `nodes` are the flame-burst node ids on the
 * printed mini-map of `tile` (the arena back face); `dpadNode` is the d-pad
 * marker node — for OIK the eye he surfaces at (always itself blasted), for
 * Kalameet the landing node (never itself aflame). Golden `_meta.resolved`. */
export interface DsNodePatternCard {
  cell: number;
  name: string;
  tile: string;
  nodes: string[];
  dpadNode: string;
}

interface RawBossEntry {
  id: string; name: string; tier: string; expansion: string; paired?: boolean;
  data: unknown; behaviors?: unknown; pairedBehaviors?: unknown;
  ornsteinHeatUps?: unknown; smoughHeatUps?: unknown;
  kingOne?: unknown; kingTwo?: unknown; kingThree?: unknown; kingFour?: unknown;
  fireBeam?: unknown; blastedNodes?: unknown; fieryRuin?: unknown;
}

const rawBosses = (bossesJson as unknown as { bosses: RawBossEntry[] }).bosses;

export const DS_BOSSES: Record<string, DsBossDef> = Object.fromEntries(rawBosses.map((b) => {
  const def: DsBossDef = {
    id: b.id, name: b.name, tier: b.tier as DsBossDef['tier'], expansion: b.expansion,
    paired: b.paired,
    behaviors: b.behaviors as DsBossCard[] | undefined,
    pairedBehaviors: b.pairedBehaviors as DsBossDef['pairedBehaviors'],
    ornsteinHeatUps: b.ornsteinHeatUps as DsBossCard[] | undefined,
    smoughHeatUps: b.smoughHeatUps as DsBossCard[] | undefined,
    kingOne: b.kingOne as DsBossCard[] | undefined,
    kingTwo: b.kingTwo as DsBossCard[] | undefined,
    kingThree: b.kingThree as DsBossCard[] | undefined,
    kingFour: b.kingFour as DsBossCard[] | undefined,
    fireBeam: b.fireBeam as DsBossCard[] | undefined,
    blastedNodes: b.blastedNodes as DsBossDef['blastedNodes'],
    fieryRuin: b.fieryRuin as DsBossDef['fieryRuin'],
  };
  if (b.paired) def.pairedData = b.data as DsBossDef['pairedData'];
  else def.data = b.data as DsBossData;
  return [b.id, def];
}));

// ---------- summons (add-ons p.6-9; golden `summons` section) ----------

export type DsSummonOp =
  | { op: 'shift'; distance: number } // d-pad cross: the players move the summon up to N nodes
  | { op: 'attack'; type: 'physical' | 'magical'; dice: Partial<Record<'black' | 'blue' | 'orange', number>>; stagger?: boolean }
  | { op: 'distract' }  // flaming skull: virtual Aggro for the next boss activation
  | { op: 'dodgeBuff'; value: number }; // Run for Cover text box

export interface DsSummonCard {
  cell: number;
  name: string;
  range: number | 'infinite' | null; // null = no attack this behaviour
  ops: DsSummonOp[];
}

export interface DsSummonDef {
  id: string;
  name: string;
  bossTier: 'mini' | 'main'; // summon icon: black starburst = mini, orange = main
  cell: number;
  data: {
    taunt: number;
    health: number;
    block: Partial<Record<'black' | 'blue' | 'orange', number>>;
    resist: Partial<Record<'black' | 'blue' | 'orange', number>>;
    dodge: number;
    specialName: string;
    special: string;
    battleReadyShift?: number;      // Eygon: free shift before the first enemy activation
    weakArcBonusDie?: 'blue';       // Beatrice: weak-arc bonus die is blue, not black
  };
  behaviors: DsSummonCard[];
}

export const DS_SUMMONS: Record<string, DsSummonDef> = Object.fromEntries(
  (((bossesJson as unknown as { summons?: DsSummonDef[] }).summons) ?? []).map((d) => [d.id, d]),
);

export const dsSummonPool = (tier: 'mini' | 'main'): DsSummonDef[] =>
  Object.values(DS_SUMMONS).filter((d) => d.bossTier === tier);

// ---------- classes ----------

export interface DsClassDef {
  id: string;
  name: string;
  taunt: number;
  statTiers: Record<'str' | 'dex' | 'int' | 'fai', number[]>; // [Base, T1, T2, T3]
  startingStats: Record<'str' | 'dex' | 'int' | 'fai', number>;
  enduranceBoxes: number;
  heroicAction: { name: string; text: string };
  startingEquipment: string[];
}

export const DS_CLASSES: Record<string, DsClassDef> = Object.fromEntries(
  ((classesJson as unknown as { classes: DsClassDef[] }).classes).map((c) => [c.id, c]),
);
export const DS_CLASS_IDS = Object.keys(DS_CLASSES);

// ---------- tiles ----------

export interface DsTileNode { id: string; x: number; y: number; terrain?: string }
export interface DsTileFace {
  id: string;
  sizePx: [number, number];
  nodes: DsTileNode[];
  edges: [string, string][];
  entrances: { edge: string; nodeId: string }[];
  special?: string;
}

export const DS_TILE_FACES: Record<string, DsTileFace> = Object.fromEntries(
  ((tilesJson as unknown as { faces: DsTileFace[] }).faces).map((f) => [f.id, f]),
);

export const DS_ROOM_FACES = Object.keys(DS_TILE_FACES).filter((id) => id.startsWith('room'));
/** The six physical exploration tiles; each has an a/b face. */
export const DS_ROOM_TILES = ['room1', 'room2', 'room3', 'room4', 'room5', 'room6'];

export interface DsTileGraph {
  face: DsTileFace;
  adj: Record<string, string[]>;
  nodeById: Record<string, DsTileNode>;
  entranceEdges: string[]; // distinct edges carrying entrances, in file order
}

const graphCache: Record<string, DsTileGraph> = {};

export function dsTileGraph(faceId: string): DsTileGraph {
  const hit = graphCache[faceId];
  if (hit) return hit;
  const face = DS_TILE_FACES[faceId];
  if (!face) throw new Error(`unknown tile face ${faceId}`);
  const adj: Record<string, string[]> = {};
  for (const n of face.nodes) adj[n.id] = [];
  for (const [a, b] of face.edges) { adj[a].push(b); adj[b].push(a); }
  for (const k of Object.keys(adj)) adj[k].sort();
  const entranceEdges: string[] = [];
  for (const e of face.entrances) if (!entranceEdges.includes(e.edge)) entranceEdges.push(e.edge);
  const g: DsTileGraph = {
    face, adj,
    nodeById: Object.fromEntries(face.nodes.map((n) => [n.id, n])),
    entranceEdges,
  };
  graphCache[faceId] = g;
  return g;
}

/** BFS node distance on a tile face (range is model-to-model, core p.10). */
export function dsNodeDistance(faceId: string, from: string, to: string): number {
  if (from === to) return 0;
  const g = dsTileGraph(faceId);
  const seen = new Set<string>([from]);
  let frontier = [from];
  let d = 0;
  while (frontier.length > 0) {
    d++;
    const next: string[] = [];
    for (const n of frontier) {
      for (const m of g.adj[n]) {
        if (seen.has(m)) continue;
        if (m === to) return d;
        seen.add(m);
        next.push(m);
      }
    }
    frontier = next;
  }
  return Infinity;
}

export const dsEntryNodes = (faceId: string, edge: string): string[] =>
  dsTileGraph(faceId).face.entrances.filter((e) => e.edge === edge).map((e) => e.nodeId);

export const dsNodesOfTerrain = (faceId: string, terrain: string): string[] =>
  dsTileGraph(faceId).face.nodes.filter((n) => n.terrain === terrain).map((n) => n.id);

// ---------- scenarios ----------

export interface DsScenarioSection {
  id: string;
  name: string;
  optional?: boolean;
  encounters: {
    perBossEncounterLevels?: boolean;
    tiles?: number;
    levels?: { level: number; count: number }[];
    named?: { encounterId: string; level: number; position: string }[];
    l4Pool?: string;
  };
  miniBoss?: string | { choice: string[]; randomAllowed: boolean };
  miniBossCount?: number;
  mainBoss?: string | { choice: string[]; randomAllowed: boolean };
  megaBoss?: string | { choice: string[]; randomAllowed: boolean };
  specialRules?: string[];
}

export interface DsScenarioDef {
  id: string;
  name: string;
  mode: 'oneshot' | 'campaign';
  excluded?: boolean;
  extendsScenario?: string;
  encounterDeck?: string;
  sections: DsScenarioSection[];
  sparkTable: Record<string, number>;
  levelTable?: { costs: Record<string, number>; tier4Value?: number };
  requiredContent: string[];
}

export const DS_SCENARIOS: Record<string, DsScenarioDef> = Object.fromEntries(
  ((scenariosJson as unknown as { scenarios: DsScenarioDef[] }).scenarios).map((s) => [s.id, s]),
);
