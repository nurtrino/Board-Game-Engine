// Dark Souls: The Board Game — rulebook constants and shared enums.
// Sources: docs/specs/dark-souls.md (the binding parity spec) and the digests
// at docs/specs/dark-souls/*.md; page refs cite the printed rulebooks.
// Card DATA lives in ./data/*.json (mirrored goldens; sync-data.mjs).

import diceJson from './data/dice.json';

export type DsStat = 'str' | 'dex' | 'int' | 'fai';
export const DS_STATS: DsStat[] = ['str', 'dex', 'int', 'fai'];

export type DsDieColor = 'black' | 'blue' | 'orange';

/** Attack-die face values, pixel-transcribed golden (dice.json; spec correction 6). */
export const DS_DICE: Record<DsDieColor, number[]> = {
  black: (diceJson as { black: { symbols: number }[] }).black.map((f) => f.symbols),
  blue: (diceJson as { blue: { symbols: number }[] }).blue.map((f) => f.symbols),
  orange: (diceJson as { orange: { symbols: number }[] }).orange.map((f) => f.symbols),
};
/** Dodge die: 3 faces with one dodge icon, 3 blank — 50% per die (dice.json). */
export const DS_DODGE_DIE: number[] = (diceJson as { dodge: { symbols: number }[] }).dodge.map((f) => f.symbols);

/** Sparks by party size (core p.8). */
export const DS_SPARKS: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 2 };

/** Solo game: the soul cache starts at 16 (core p.13). */
export const DS_SOLO_STARTING_SOULS = 16;

/** Level-up soul costs per tier step (core p.15 standard, core p.33 campaign). */
export const DS_LEVEL_COSTS_STANDARD = [2, 4, 8];
export const DS_LEVEL_COSTS_CAMPAIGN = [4, 8, 16, 20];
/** Any stat at campaign Tier 4 has value 40 (core p.33). */
export const DS_TIER4_VALUE = 40;

/** Soul rewards (core p.19; mega insert p.8). */
export const DS_SOULS_PER_ENCOUNTER = 2; // per character, L1-3 victory
export const DS_SOULS_PER_L4 = 8; // per character, L4 victory
// boss victory: +1 soul per character per remaining spark (core p.19)

/** Andre treasure purchase cost (core p.14 standard; core p.33 campaign). */
export const DS_TREASURE_COST_STANDARD = 1;
export const DS_TREASURE_COST_CAMPAIGN = 2;
/** Campaign sellback: 1 soul, card discarded forever (core p.33). */
export const DS_SELLBACK_SOULS = 1;
/** Firekeeper luck restore (core p.15). */
export const DS_LUCK_RESTORE_COST = 1;
/** Campaign spark purchase: 2 souls per character in the group (core p.33). */
export const DS_SPARK_COST_PER_CHARACTER = 2;
/** Invader kill: immediate +3 souls plus its treasure card (add-ons p.15). */
export const DS_INVADER_KILL_SOULS = 3;

/** Endurance bar boxes; black stamina fills from the left, red damage from the
 * right; all 10 covered = dead (core p.20; classes.json verifies 10 for all). */
export const DS_ENDURANCE_BOXES = 10;

/** Stamina gained at the start of a character activation (core p.22). */
export const DS_ACTIVATION_STAMINA = 2;

/** Node capacity (core p.10). */
export const DS_NODE_MODEL_CAP = 3;

/** Legendary injection after the mini boss: 5 random cards of the pool
 * (core p.9). This mod's legendary pool = the 20-card Transmuted Treasure
 * deck (spec open question 4, proposal adopted). */
export const DS_LEGENDARY_INJECT_COUNT = 5;

export type DsCondition = 'bleed' | 'poison' | 'frostbite' | 'stagger' | 'calamity';

export interface DsConditionDef {
  key: DsCondition;
  /** cleared at the bearer's own activation end (core p.21) */
  clearsAtActivationEnd: boolean;
  /** cleared when the bearer next suffers damage (bleed/calamity style) */
  clearsOnDamage: boolean;
  text: string;
}

/** Condition definitions (core p.21; calamity kal p.13). One token of each
 * type per model; everything clears at encounter end. */
export const DS_CONDITIONS: Record<DsCondition, DsConditionDef> = {
  bleed: {
    key: 'bleed', clearsAtActivationEnd: false, clearsOnDamage: true,
    text: '+2 damage the next time this model suffers damage, then clear.',
  },
  poison: {
    key: 'poison', clearsAtActivationEnd: true, clearsOnDamage: false,
    text: '1 damage at the end of this model\'s own activation.',
  },
  frostbite: {
    key: 'frostbite', clearsAtActivationEnd: true, clearsOnDamage: false,
    text: 'Characters: +1 stamina per walk, run, or dodge. Enemies: move value -1.',
  },
  stagger: {
    key: 'stagger', clearsAtActivationEnd: true, clearsOnDamage: false,
    text: 'Characters: +1 stamina per weapon action. Enemies: attack damage -1.',
  },
  calamity: {
    key: 'calamity', clearsAtActivationEnd: false, clearsOnDamage: true,
    text: 'Kalameet only: -1 success on block, resist, and dodge rolls; cleared when the bearer suffers attack damage.',
  },
};

/** Calamity token supply cap (kal p.13). */
export const DS_CALAMITY_SUPPLY = 4;

/** Trap token distribution. The physical values are printed on the 20 tokens
 * and appear in NO golden or rulebook (core digest section 8/19); this is an
 * engine-invented distribution documented as a spec judgment call: 6 blanks,
 * 8x (2 damage, dodge 1), 4x (3 damage, dodge 1), 2x (4 damage, dodge 2).
 * Trap damage cannot be blocked (core p.18). */
export const DS_TRAP_TOKENS: ({ damage: number; dodge: number } | null)[] = [
  null, null, null, null, null, null,
  { damage: 2, dodge: 1 }, { damage: 2, dodge: 1 }, { damage: 2, dodge: 1 }, { damage: 2, dodge: 1 },
  { damage: 2, dodge: 1 }, { damage: 2, dodge: 1 }, { damage: 2, dodge: 1 }, { damage: 2, dodge: 1 },
  { damage: 3, dodge: 1 }, { damage: 3, dodge: 1 }, { damage: 3, dodge: 1 }, { damage: 3, dodge: 1 },
  { damage: 4, dodge: 2 }, { damage: 4, dodge: 2 },
];

/** Ember: -1 damage when the embered character suffers 3+ from one attack
 * (core p.12). Discarded only on a forced rest. */
export const DS_EMBER_THRESHOLD = 3;
export const DS_EMBER_REDUCTION = 1;

/** Standard-game boss menus (spec create options). */
export const DS_MINI_BOSSES = ['gargoyle', 'titanite-demon', 'winged-knight', 'boreal-outrider-knight', 'old-dragonslayer'] as const;
export const DS_MAIN_BOSSES = ['dancer-of-the-boreal-valley', 'ornstein-and-smough', 'great-grey-wolf-sif', 'artorias', 'smelter-demon'] as const;
export const DS_MEGA_BOSSES = ['four-kings', 'old-iron-king', 'black-dragon-kalameet'] as const;

export type DsMiniBossId = typeof DS_MINI_BOSSES[number];
export type DsMainBossId = typeof DS_MAIN_BOSSES[number];
export type DsMegaBossId = typeof DS_MEGA_BOSSES[number];
