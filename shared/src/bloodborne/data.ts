// Bloodborne — typed accessors over the engine data. The JSON under ./data/
// is COMPILED from games/bloodborne/golden/transcribed/* by
// tools/tts-extract/compile-bloodborne.mjs (curated effects; verbatim card
// text kept for display). Re-run the compiler after any transcription edit.

import huntersJson from './data/hunters.json';
import statsJson from './data/stats.json';
import enemiesJson from './data/enemies.json';
import bossesJson from './data/bosses.json';
import tilesJson from './data/tiles.json';
import campaignsJson from './data/campaigns.json';
import itemsJson from './data/items.json';
import missionsJson from './data/missions.json';
import huntBoardJson from './data/hunt-board.json';

import type { BbSpeed, BbStat } from './config.js';

// ---------- attacks & effects ----------

/** Machine-usable effect keywords curated from printed text. Anything a card
 * does is expressed here; `text` stays verbatim for display. */
export interface BbEffects {
  dodge?: boolean;          // card may be used to Dodge
  stagger?: boolean;        // attack-linked: cancels slower opposing attacks
  block?: number;           // immediate: reduce damage suffered (FAQ)
  draw?: number;            // immediate on slot placement
  heal?: number;            // immediate on slot placement
  clearSlots?: number;      // immediate: clear N slots (own choice)
  dmgBonus?: number;        // adds to the attack's damage
  speedBonus?: number;      // adds to the attack's speed rank
  leaping?: boolean;        // may initiate an attack from up to 2 spaces (FAQ)
  onKillDraw?: number;      // weapon-side abilities
  onKillHeal?: number;
  staggerBonusDmg?: number; // "Attacks with Stagger also deal +N" (Saw Cleaver)
  custom?: string;          // curated id handled in code (rare)
}

export interface BbAttackDef {
  name: string;
  speed: BbSpeed | null; // null for pure abilities
  damage: number;
  text?: string;
  effects?: BbEffects;
  /** curated rider resolved after the attack lands (e.g. dodge-or-suffer) */
  rider?: { kind: string; speed?: BbSpeed; damage?: number; text?: string };
  isAbility?: boolean;
}

// ---------- hunters / weapons ----------

export interface BbWeaponSideDef {
  label: string;
  ability: string;      // verbatim
  effects?: BbEffects;  // curated weapon-side ability
  slots: { name: string; speed: BbSpeed; damage: number; text?: string; effects?: BbEffects }[];
}

export interface BbHunterDef {
  id: string;
  name: string;         // weapon name = hunter identity (p. 8)
  set: 'core' | 'expansion';
  firearmId: string;    // starting firearm (locked to this hunter, p. 17)
  sides: [BbWeaponSideDef, BbWeaponSideDef];
  /** staged art refs */
  art: { dashboard?: string; mini?: string; weaponCell?: number };
}

// ---------- stat cards ----------

export interface BbStatCardDef {
  id: string;
  name: string;
  stat: BbStat | 'other';
  basic: boolean;
  text: string;
  effects: BbEffects;
  art: { sheet: string; cell: number };
}

// ---------- enemies ----------

export interface BbEnemySideDef {
  hp: number;
  basic: BbAttackDef;
  special: BbAttackDef;
  ability: BbAttackDef;
  passive?: string;      // verbatim footer
  passiveEffects?: { moveBonus?: number; custom?: string };
}

export interface BbEnemyDef {
  id: string;
  name: string;
  core: boolean;
  npc: boolean;          // NPC enemies: sides are 1-2 / 3+ scaling (p. 23)
  sides: [BbEnemySideDef, BbEnemySideDef];
  mini: string | null;
  art: { sheet: string; cell: number };
}

// ---------- bosses ----------

export interface BbBossDef {
  id: string;
  name: string;
  core: boolean;
  hp: { 1: number; 2: number; 3: number; 4: number }[]; // [phase1, phase2]
  phases: [BbAttackDef[], BbAttackDef[]];
  text?: string;
  mini: string | null;
  art: { hpSheet: string; hpCell: number };
}

// ---------- items ----------

export interface BbItemDef {
  id: string;
  name: string;
  kind: 'consumable' | 'firearm' | 'tool' | 'rune';
  timing?: string;       // 'Hunter Turn' | 'On Attack' | printed timing
  text: string;
  effects?: BbEffects & { refresh?: string };
  art: { sheet: string; cell: number };
}

// ---------- tiles ----------

export interface BbTileDef {
  id: string;
  name: string;          // printed name ('' for unnamed)
  set: 'core' | 'chalice' | 'cainhurst' | 'woods' | 'single';
  spaces: { id: string; center: { x: number; y: number }; named: string | null; icons: string[] }[];
  adjacency: [string, string][];
  exits: { space: string; edge: 'N' | 'E' | 'S' | 'W' }[];
  specialText?: string | null;
  art: string;           // staged tile face rel path
}

// ---------- campaigns ----------

export interface BbChapterDef {
  huntMission: string[];
  insightMissions: string[][];
  introduction: string;
  startingTile: string;
  startingTiles: string[];
  excludedTiles?: string[];
  extraCards?: string[];
  enemies?: string[];
  enemiesRandom: number;
  excludedEnemies?: string[];
  randomTiles: { perHunter: number; cap?: number; plus?: number };
}

export interface BbCampaignDef {
  id: string;
  name: string;
  set: 'core' | 'expansion';
  chapters: BbChapterDef[];
}

// ---------- missions (DSL) ----------

export type BbMissionTrigger =
  | { type: 'auto' }                                  // revealed by chapter setup
  | { type: 'endMoveOnTile'; tile: string }
  | { type: 'endMoveOnSpace'; space: string }         // named space
  | { type: 'interactOnSpace'; space: string }
  | { type: 'insightAtLeast'; count: number }
  | { type: 'reveal' };                               // revealed only by another card

export type BbMissionEffect =
  | { do: 'spawnBoss'; boss: string; space: string }
  | { do: 'spawnEnemy'; enemy: string; space: string; count?: number; perHunter?: boolean }
  | { do: 'spawnNpc'; enemy: string; space: string }
  | { do: 'fogGates'; tile: string }
  | { do: 'removeFogGates'; tile?: string }
  | { do: 'placeTokens'; token: 'insight' | 'corpse' | 'survivor'; where: 'card' | string; count: number | 'nPlus1' }
  | { do: 'reveal'; card: string }
  | { do: 'insight' }                                  // collect 1 insight (reward card)
  | { do: 'reward'; item?: string; consumables?: number; echoes?: number }
  | { do: 'completeHunt' }
  | { do: 'specialRule'; rule: string }
  | { do: 'custom'; id: string };

export interface BbMissionGoal {
  /** interpreted by missions.ts */
  type: string;
  params?: Record<string, unknown>;
  onComplete: BbMissionEffect[];
  completesMission: boolean;
}

export interface BbMissionDef {
  campaign: string;
  number: string;
  kind: 'hunt' | 'insight' | 'chapter' | 'intro' | 'special' | 'insight-reward' | 'other';
  title: string;
  story: string | null;
  body: string;
  goalText: string | null;
  onReveal?: BbMissionEffect[];
  goal?: BbMissionGoal;
}

// ---------- exports ----------

export const BB_HUNTERS = huntersJson as unknown as Record<string, BbHunterDef>;
export const BB_BASIC_CARDS = statsJson as unknown as {
  cards: Record<string, BbStatCardDef>;
  /** the 12-card starting deck (3 of each basic stat), by card id */
  startingDeck: string[];
};
export const BB_UPGRADE_CARDS = (statsJson as unknown as { upgrades: Record<string, BbStatCardDef> }).upgrades;
export const BB_STAT_CARDS: Record<string, BbStatCardDef> = {
  ...(statsJson as unknown as { cards: Record<string, BbStatCardDef> }).cards,
  ...(statsJson as unknown as { upgrades: Record<string, BbStatCardDef> }).upgrades,
};
export const BB_ENEMIES = enemiesJson as unknown as Record<string, BbEnemyDef>;
export const BB_BOSSES = bossesJson as unknown as Record<string, BbBossDef>;
export const BB_TILES = tilesJson as unknown as Record<string, BbTileDef>;
export const BB_CAMPAIGNS = campaignsJson as unknown as Record<string, BbCampaignDef>;
export const BB_ITEMS = itemsJson as unknown as Record<string, BbItemDef>;
export const BB_CONSUMABLES = {
  deck: Object.values(BB_ITEMS).filter((i) => i.kind === 'consumable').flatMap((i) => new Array((i as unknown as { count?: number }).count ?? 1).fill(i.id)) as string[],
};
export const BB_MISSIONS = missionsJson as unknown as Record<string, Record<string, BbMissionDef>>; // campaign -> number -> def
export const BB_HUNT_TRACK = huntBoardJson as unknown as { length: number; resets: number[] };

export const bbStatCard = (id: string): BbStatCardDef => {
  const c = BB_STAT_CARDS[id];
  if (!c) throw new Error(`unknown stat card ${id}`);
  return c;
};
export const bbItem = (id: string): BbItemDef => {
  const i = BB_ITEMS[id];
  if (!i) throw new Error(`unknown item ${id}`);
  return i;
};
