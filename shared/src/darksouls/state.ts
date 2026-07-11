// Dark Souls: The Board Game — state shape, setup, seeded RNG, shared helpers,
// and the public view. Rules per docs/specs/dark-souls.md (binding spec with
// locked corrections) and docs/specs/dark-souls/*.md digests (page refs).
// The reducer and the enemy/boss executor live in actions.ts.

import { mulberry32 } from '../brass/rng.js';
import {
  DS_DICE, DS_DODGE_DIE, DS_SPARKS, DS_SOLO_STARTING_SOULS, DS_ENDURANCE_BOXES,
  DS_TRAP_TOKENS, DS_TIER4_VALUE, DS_MINI_BOSSES, DS_MAIN_BOSSES, DS_MEGA_BOSSES,
  type DsStat, type DsCondition, type DsDieColor,
} from './config.js';
import {
  DS_CLASSES, DS_TREASURE_BY_ID, DS_ENCOUNTER_BY_ID, DS_BOSSES, DS_SCENARIOS,
  DS_ENCOUNTERS, dsIsDrawableEncounter,
  dsTileGraph, dsEncounterPool, dsTreasureDeckCards,
  type DsTreasureCard, type DsScenarioDef, type DsScenarioSection, type DsBossCard,
} from './data.js';

// ---------- seats ----------
// Lobby seat colors only (join order = seat index). Class-agnostic on purpose:
// players pick one of the 10 classes during the in-game setup phase.
export const DS_SEATS = ['Ember', 'Ash', 'Moss', 'Slate'] as const;
export type DsSeat = (typeof DS_SEATS)[number];

// ---------- options ----------

export interface DsCreateOptions {
  /** 'standard' | campaign ids | 'custom-oneshot' (short session). */
  scenarioId: string;
  partySize: number; // 1-4
  /** Optional pre-picked classes (seat order). Missing picks happen in the
   * setup phase via the pick_class action. */
  classIds?: string[];
  miniBoss?: string; // id or 'random' (standard mode)
  mainBoss?: string;
  /** Standard mode: mega-boss finale toggle (id or 'random'); null = off. */
  megaFinale?: string | null;
  darkrootMix?: 'off' | 'append' | 'replaceSix';
  darkrootTreasure?: boolean;
  mimics?: boolean;
  invaders?: boolean;
  /** Summons module (add-ons p.6-9): fog-gate zero-souls trade for a white
   * phantom ally (Eygon before a mini boss, Beatrice before a main boss —
   * the mod's two summon decks; golden `summons` section). */
  summons?: boolean;
  /** custom-oneshot: 1-3 encounter levels plus one boss. */
  oneshot?: { levels: number[]; boss: string };
  seed?: number;
}

export type DsResolvedOptions = Required<Omit<DsCreateOptions, 'classIds' | 'oneshot'>> &
  { classIds: string[] | null; oneshot: { levels: number[]; boss: string } | null };

// ---------- characters ----------

export interface DsEquipped { cardId: string; upgrades: string[] }

export interface DsActFlags {
  walkUsed: boolean;
  /** movement grouped entirely before or after the attack (core p.22) */
  stage: 'start' | 'pre' | 'attack' | 'post';
  movedBefore: boolean; // movement happened before the first attack
  attacked: ('L' | 'R')[];   // hands that attacked
  swapWindow: boolean;       // backup swap only before anything else (core p.22)
  freeMoves: number;         // Warrior heroic
  buff: 'warrior' | 'sorcerer' | 'pyromancer' | null; // next-attack heroics
  mercExtra: boolean;        // Mercenary heroic: one extra free attack
  deprivedSwap: boolean;     // Deprived heroic: Andre-style swap window
  /** (Great) Magic Weapon: attacks are magical this activation; 2 = +1 damage too */
  magicWeapon?: 0 | 1 | 2;
}

/** A cast defence bonus (Sacred Oath, Magic Barrier, Stone Greatshield,
 * Sunlight Straight Sword): extra defence dice until the printed expiry. */
export interface DsDefBuff {
  block?: Partial<Record<DsDieColor, number>>;
  resist?: Partial<Record<DsDieColor, number>>;
  /** enemyPhaseEnd = "during the next enemy activation" (the boss activation
   * in a boss fight); charActivationStart = "until the next character activation" */
  expires: 'enemyPhaseEnd' | 'charActivationStart';
  label: string;
}

export interface DsCharacter {
  seat: number;
  classId: string;
  tiers: Record<DsStat, number>; // 0=Base .. 3 (4 campaign)
  stamina: number; // black cubes
  damage: number;  // red cubes
  estus: boolean;
  luck: boolean;
  heroic: boolean;
  ember: boolean;
  armour: DsEquipped | null;
  handL: DsEquipped | null;
  handR: DsEquipped | null;
  backup: DsEquipped[];
  conditions: DsCondition[];
  /** cast defence bonuses (spell DSL); optional so pre-DSL saves rehydrate */
  defBuffs?: DsDefBuff[];
  nodeId: string | null; // only while in an encounter
  arc: 'front' | 'left' | 'right' | 'back' | null; // only while on a boss node
  act: DsActFlags | null; // set during own activation
}

// ---------- board ----------

export interface DsTile {
  id: string;
  kind: 'explore' | 'mega';
  faceId: string;
  level: number;
  encounterId: string | null;
  faceUp: boolean;
  cleared: boolean;
  completed: boolean; // L4 one-shot: never resets, never replayed (mega insert p.8)
  chests: Record<string, 'closed' | 'open'>; // nodeId -> state, never re-closes (core p.17)
  mimicChests: string[]; // nodeIds printed as mimic-chest on the card
  mimicAmbush: 'pending' | 'treasure' | 'mimic' | 'dead' | null;
  mimicNode: string | null; // where a revealed mimic waits after a party wipe
  invaderToken: boolean; // virtual invasion token (spec open question 5)
  /** Trap token index per node (into DS_TRAP_TOKENS); assigned once, tokens
   * keep their nodes across encounter resets (core p.18). */
  traps: Record<string, number> | null;
}

// ---------- encounter runtime ----------

export interface DsEnemyModel {
  uid: number;
  typeId: string;
  nodeId: string;
  wounds: number;
  conditions: DsCondition[];
  invader?: boolean;
}

export interface DsInvaderRun {
  typeId: string;
  deck: number[]; // behavior indices into DS_INVADERS[id].behaviors
  discard: number[];
  heatedUp: boolean;
}

export interface DsEncounterRun {
  tileId: string | null; // null = boss arena
  faceId: string;
  encounterId: string | null;
  entryEdge: string;
  enemies: DsEnemyModel[];
  terrain: { piece: string; nodeId: string; destroyed?: boolean }[];
  trapsRevealed: string[]; // this encounter only; reset face down at end (core p.18)
  turn: 'enemies' | 'characters';
  activeSeat: number;
  enemyPhases: number; // completed full enemy activations (campaign dash gate)
  invaderRun: DsInvaderRun | null;
  uidSeq: number;
  /** enemy activation order override picked via enemyTieOrder pendings */
  orderOverride: number[] | null;
}

// ---------- boss runtime ----------

export interface DsBossUnit {
  key: string; // 'boss' | 'ornstein' | 'smough' | 'king1'..'king4' | 'mimic'
  health: number;
  maxHealth: number;
  nodeId: string | null;
  facing: [number, number] | null; // direction vector in tile px space
  inPlay: boolean;
  /** character-inflicted condition tokens (decision log 13, reconciled);
   * optional so pre-DSL saves rehydrate */
  conditions?: DsCondition[];
}

export interface DsBossRun {
  id: string; // boss id (or mimic id)
  kind: 'mini' | 'main' | 'mega' | 'mimic';
  units: DsBossUnit[];
  deck: string[]; // card cell keys, index 0 = top
  discard: string[]; // index 0 = most recent flip
  heatedUp: boolean;
  heatUpsUsed: number; // Old Dragonslayer counts to 3
  revealed: string[]; // gravestone intel: cell keys revealed at setup (core p.28)
  summonsRemaining: number | null; // Four Kings
  fireBeamBuff: boolean; // OIK Old Iron Rage
  beamDeck: number[] | null; beamDiscard: number[] | null;
  strafeDeck: number[] | null; strafeDiscard: number[] | null;
  /** weak-arc bonus consumed for the current top-of-discard card (core p.28) */
  weakArcUsed: boolean;
  /** invariant ledger: deck+discard must always equal this */
  expectedDeckCount: number;
  /** campaign double Gargoyle: fighting the second one back-to-back */
  gargoyleTwo: boolean;
  /** seats hit by the most recent attack op (standalone stagger/calamity ops) */
  lastHitSeats: number[];
  /** beam/strafe template resolution scratch */
  templateNodes: string[] | null;
  pendingLanding: string | null;
}

// ---------- summon runtime (add-ons p.6-9) ----------

export interface DsSummon {
  id: string; // DS_SUMMONS key
  health: number;
  maxHealth: number;
  nodeId: string | null;
  arc: 'front' | 'left' | 'right' | 'back' | null; // while on a boss node
  deck: number[];    // behaviour cells, index 0 = top; always all four cards
  discard: number[]; // index 0 = most recent flip
  /** Run for Cover: extra dodge dice during the next boss activation */
  dodgeBuff: number;
  /** boss-inflicted condition tokens (decision log 17, reconciled);
   * optional so pre-DSL saves rehydrate */
  conditions?: DsCondition[];
}

// ---------- pendings & script ----------

export type DsPendingKind =
  | 'leadCharacter'   // aggro at encounter start (core p.19/p.28)
  | 'defence'         // block/resist vs dodge (vs suffer for unblockables)
  | 'dodgeMove'       // optional 1-node move before the dodge roll (locked: before)
  | 'postRoll'        // luck reroll / reactive heroic window after a roll
  | 'pushDest'        // push destination pick
  | 'nodeOverflow'    // which of the three models leaves a full node
  | 'enemyTieOrder'   // equal-threat activation order (core p.24)
  | 'enemyMoveTie'    // equally good enemy move nodes (core p.24)
  | 'arcChoice'       // boundary-arc pick when stepping onto a boss node
  | 'treasureKeep'    // drawn treasure: stash or equip
  | 'emberAssign'     // Ember card: whose board gets the token
  | 'trap'            // suffer or dodge (traps / push damage; never blockable)
  | 'summonOffer'     // fog-gate victory: normal souls XOR a summon (add-ons p.7)
  | 'summonMove'      // shift icon: the players position the summon (add-ons p.9)
  | 'spellTarget'     // spell DSL: pick the character/enemy/node a cast affects
  | 'entryPlace';     // encounter start: each player picks their entry node (core p.19/p.28)

export interface DsPendingOption { key: string; label: string }

export interface DsPending {
  id: number;
  seat: number;
  kind: DsPendingKind;
  prompt: string;
  options: DsPendingOption[];
  data: Record<string, unknown>;
}

/** Serializable continuation queue for enemy/boss resolution: the executor in
 * actions.ts pumps these micro-steps until a pending blocks (playbook §6.4). */
export type DsStep = { t: string } & Record<string, unknown>;

// ---------- log ----------

export interface DsLogEntry {
  text: string;
  seat?: number;
  nodeId?: string; // space ref for the TV
  kind?: string;   // 'move'|'attack'|'dice'|'flip'|'phase'|'win'...
}

// ---------- the state ----------

export type DsPhase = 'setup' | 'bonfire' | 'encounter' | 'bossEncounter' | 'gameOver';
export type DsStage = 'preMini' | 'postMini' | 'megaL4' | 'megaBoss' | 'campaign' | 'oneshot';

export interface DsState {
  game: 'darksouls';
  options: DsResolvedOptions;
  seed: number;
  rolls: number;
  phase: DsPhase;
  stage: DsStage;
  campaign: {
    scenarioId: string;
    sectionIdx: number;
    /** bosses defeated in the current section (double-Gargoyle etc.) */
    sectionBossKills: number;
    legendariesInjected: boolean;
    discardedForever: string[];
    l4Completed: string[]; // encounter ids, never replayable (fk p.8)
  } | null;
  /** standard mode boss picks resolved at creation */
  miniBossId: string | null;
  mainBossId: string | null;
  megaBossId: string | null;
  miniBossDefeated: boolean;

  sparks: number;
  sparksMax: number;
  soulCache: number;
  droppedSouls: { amount: number; tileId: string; nodeId: string } | null;

  characters: DsCharacter[];
  classPicks: (string | null)[]; // setup phase

  inventory: string[];
  treasureDeck: string[];
  treasureDiscard: string[]; // used Ember cards
  /** every card id currently part of the treasure economy (conservation) */
  treasurePool: string[];

  tiles: DsTile[]; // chain order: index 0 nearest the bonfire
  partyAt: 'bonfire' | string; // tileId while exploring
  fogGateTileId: string | null;

  encounter: DsEncounterRun | null;
  boss: DsBossRun | null;
  /** the earned white sign by the fog gate (mini/main), consumed at boss setup */
  summonEarned: 'mini' | 'main' | null;
  /** the active white phantom during a boss encounter */
  summon: DsSummon | null;

  aggroSeat: number;
  /** summon Distract: the boss treats the summon as the Aggro holder for the
   * next boss activation (add-ons p.9); cleared when that activation ends. */
  distract: boolean;
  firstActivationSeat: number;

  pendings: DsPending[];
  pendingSeq: number;
  script: DsStep[];

  embersGainedEver: number; // invader trigger bookkeeping
  /** invader identities already used up (killed, or lost to a party wipe) */
  invadersDone: string[];
  winner: boolean | null; // true = party wins, false = party loses
  log: DsLogEntry[];
}

// ---------- seeded rng ----------

const rnd = (s: DsState): number => mulberry32(s.seed ^ (s.rolls++ * 0x9e3779b9))();

export const dsRandInt = (s: DsState, n: number): number => Math.floor(rnd(s) * n);

export function dsRollDie(s: DsState, color: DsDieColor): number {
  return DS_DICE[color][dsRandInt(s, 6)];
}

/** returns dodge icons rolled (0 or 1 per die). */
export const dsRollDodgeDie = (s: DsState): number => DS_DODGE_DIE[dsRandInt(s, 6)];

export function dsShuffle<T>(s: DsState, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = dsRandInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- character helpers ----------

export function dsStatValue(ch: DsCharacter, stat: DsStat): number {
  const tier = ch.tiers[stat];
  if (tier >= 4) return DS_TIER4_VALUE;
  return DS_CLASSES[ch.classId].statTiers[stat][tier];
}

export function dsMeetsReqs(ch: DsCharacter, card: DsTreasureCard): boolean {
  const req = card.requirements ?? { str: 0, dex: 0, int: 0, fai: 0 };
  return (['str', 'dex', 'int', 'fai'] as DsStat[]).every((st) => dsStatValue(ch, st) >= (req[st] ?? 0));
}

/** A character must meet an upgraded weapon's AND its upgrades' requirements
 * (core p.14). */
export function dsMeetsReqsEquipped(ch: DsCharacter, eq: DsEquipped): boolean {
  if (!dsMeetsReqs(ch, DS_TREASURE_BY_ID[eq.cardId])) return false;
  return eq.upgrades.every((u) => dsMeetsReqs(ch, DS_TREASURE_BY_ID[u]));
}

export const dsHandCards = (ch: DsCharacter): { hand: 'L' | 'R'; eq: DsEquipped }[] => {
  const out: { hand: 'L' | 'R'; eq: DsEquipped }[] = [];
  if (ch.handL) out.push({ hand: 'L', eq: ch.handL });
  if (ch.handR) out.push({ hand: 'R', eq: ch.handR });
  return out;
};

export const dsEquippedList = (ch: DsCharacter): DsEquipped[] =>
  [ch.armour, ch.handL, ch.handR, ...ch.backup].filter((e): e is DsEquipped => e != null);

/** Defence dice come from armour + hand slots only (core p.25). */
export function dsDefenceDice(ch: DsCharacter, kind: 'block' | 'resist'): Partial<Record<DsDieColor, number>> {
  const pool: Partial<Record<DsDieColor, number>> = {};
  for (const eq of [ch.armour, ch.handL, ch.handR]) {
    if (!eq) continue;
    const card = DS_TREASURE_BY_ID[eq.cardId];
    const dice = card.defence?.[kind] ?? {};
    for (const [c, n] of Object.entries(dice)) {
      if (n) pool[c as DsDieColor] = (pool[c as DsDieColor] ?? 0) + n;
    }
  }
  // cast defence bonuses (spell DSL: Sacred Oath / Magic Barrier / Stone
  // Greatshield / Sunlight Straight Sword) add dice until they expire
  for (const buff of ch.defBuffs ?? []) {
    for (const [c, n] of Object.entries(buff[kind] ?? {})) {
      if (n) pool[c as DsDieColor] = (pool[c as DsDieColor] ?? 0) + n;
    }
  }
  return pool;
}

export function dsDodgeDiceCount(ch: DsCharacter): number {
  let n = 0;
  for (const eq of [ch.armour, ch.handL, ch.handR]) {
    if (!eq) continue;
    n += DS_TREASURE_BY_ID[eq.cardId].defence?.dodge ?? 0;
  }
  return n;
}

/** Non-armour, non-upgrade cards count toward the 3-weapon total (core p.12). */
export function dsWeaponCount(ch: DsCharacter): number {
  return dsHandCards(ch).length + ch.backup.length;
}

export const dsFreeBoxes = (ch: DsCharacter): number =>
  DS_ENDURANCE_BOXES - ch.stamina - ch.damage;

/** Voluntary stamina spends need room: a character cannot kill themself with
 * black cubes (engine judgment; core p.20 makes a full bar lethal). */
export function dsCanSpendStamina(ch: DsCharacter, n: number): boolean {
  return dsFreeBoxes(ch) >= n;
}

export function dsSpendStamina(ch: DsCharacter, n: number): void {
  ch.stamina += n;
}

export function dsGainStamina(ch: DsCharacter, n: number): void {
  ch.stamina = Math.max(0, ch.stamina - n);
}

export function dsHealDamage(ch: DsCharacter, n: number): void {
  ch.damage = Math.max(0, ch.damage - n);
}

// ---------- geometry / arcs ----------

export type DsArc = 'front' | 'left' | 'right' | 'back';

/** Which arc(s) of a unit facing `f` contain the vector unit->node. Boundary
 * (exact 45 degrees) nodes are in both adjacent arcs (core p.27). */
export function dsArcsOf(f: [number, number], dx: number, dy: number): DsArc[] {
  if (dx === 0 && dy === 0) return [];
  const dot = f[0] * dx + f[1] * dy;
  const cross = f[0] * dy - f[1] * dx;
  const fw = dot; // forward component
  const side = cross; // + = right (px space, y down)
  const arcs: DsArc[] = [];
  const eps = 1e-6 * (Math.abs(fw) + Math.abs(side));
  if (fw > Math.abs(side) - eps && fw > 0) arcs.push('front');
  if (-fw > Math.abs(side) - eps && fw < 0) arcs.push('back');
  if (side > Math.abs(fw) - eps && side > 0) arcs.push('right');
  if (-side > Math.abs(fw) - eps && side < 0) arcs.push('left');
  return arcs;
}

export function dsNodeArcs(faceId: string, unitNode: string, facing: [number, number], nodeId: string): DsArc[] {
  const g = dsTileGraph(faceId);
  const a = g.nodeById[unitNode];
  const b = g.nodeById[nodeId];
  return dsArcsOf(facing, b.x - a.x, b.y - a.y);
}

// ---------- creation ----------

const DEFAULTS = {
  miniBoss: 'random', mainBoss: 'random', megaFinale: null as string | null,
  darkrootMix: 'off' as const, darkrootTreasure: false,
  mimics: false, invaders: false, summons: false,
};

export function createDarkSouls(options: DsCreateOptions): DsState {
  const scenario = DS_SCENARIOS[options.scenarioId] ?? (options.scenarioId === 'custom-oneshot' ? null : undefined);
  if (scenario === undefined && options.scenarioId !== 'custom-oneshot') {
    throw new Error(`unknown scenario ${options.scenarioId}`);
  }
  if (scenario?.excluded) throw new Error(`scenario ${options.scenarioId} is excluded (unshippable with this mod)`);
  const partySize = options.partySize;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 4) throw new Error('party size must be 1-4');
  if (options.scenarioId === 'custom-oneshot') {
    if (!options.oneshot || options.oneshot.levels.length < 1 || options.oneshot.levels.length > 3) {
      throw new Error('custom-oneshot needs 1-3 encounter levels and a boss');
    }
    if (!DS_BOSSES[options.oneshot.boss]) throw new Error(`unknown boss ${options.oneshot.boss}`);
  }
  let darkrootMix = options.darkrootMix ?? DEFAULTS.darkrootMix;
  if (scenario && scenario.requiredContent.includes('darkroot') && darkrootMix === 'off') {
    darkrootMix = 'append'; // scenario prescribes Darkroot encounters
  }
  const resolved: DsResolvedOptions = {
    scenarioId: options.scenarioId,
    partySize,
    classIds: options.classIds ?? null,
    miniBoss: options.miniBoss ?? DEFAULTS.miniBoss,
    mainBoss: options.mainBoss ?? DEFAULTS.mainBoss,
    megaFinale: options.megaFinale ?? DEFAULTS.megaFinale,
    darkrootMix,
    darkrootTreasure: options.darkrootTreasure ?? DEFAULTS.darkrootTreasure,
    mimics: options.mimics ?? DEFAULTS.mimics,
    invaders: options.invaders ?? DEFAULTS.invaders,
    summons: options.summons ?? DEFAULTS.summons,
    oneshot: options.oneshot ?? null,
    seed: options.seed ?? 1,
  };

  const s: DsState = {
    game: 'darksouls',
    options: resolved,
    seed: resolved.seed,
    rolls: 0,
    phase: 'setup',
    stage: scenario?.mode === 'campaign' ? 'campaign' : (options.scenarioId === 'standard' ? 'preMini' : 'oneshot'),
    campaign: scenario?.mode === 'campaign'
      ? { scenarioId: scenario.id, sectionIdx: 0, sectionBossKills: 0, legendariesInjected: false, discardedForever: [], l4Completed: [] }
      : null,
    miniBossId: null,
    mainBossId: null,
    megaBossId: null,
    miniBossDefeated: false,
    sparks: DS_SPARKS[partySize],
    sparksMax: DS_SPARKS[partySize],
    soulCache: partySize === 1 ? DS_SOLO_STARTING_SOULS : 0,
    droppedSouls: null,
    characters: [],
    classPicks: Array.from({ length: partySize }, () => null),
    inventory: [],
    treasureDeck: [],
    treasureDiscard: [],
    treasurePool: [],
    tiles: [],
    partyAt: 'bonfire',
    fogGateTileId: null,
    encounter: null,
    boss: null,
    summonEarned: null,
    summon: null,
    aggroSeat: 0,
    distract: false,
    firstActivationSeat: 0,
    pendings: [],
    pendingSeq: 1,
    script: [],
    embersGainedEver: 0,
    invadersDone: [],
    winner: null,
    log: [{ text: `Dark Souls begins: ${scenario?.name ?? 'custom one-shot'}, party of ${partySize}.`, kind: 'phase' }],
  };

  // standard-mode boss picks resolve now (seeded) so the encounter levels are known
  if (s.stage === 'preMini' || s.stage === 'oneshot') {
    const pick = (choice: string, pool: readonly string[]): string =>
      choice === 'random' ? pool[dsRandInt(s, pool.length)] : choice;
    if (options.scenarioId === 'standard') {
      s.miniBossId = pick(resolved.miniBoss, DS_MINI_BOSSES);
      s.mainBossId = pick(resolved.mainBoss, DS_MAIN_BOSSES);
      if (!DS_BOSSES[s.miniBossId] || DS_BOSSES[s.miniBossId].tier !== 'mini') throw new Error(`bad mini boss ${s.miniBossId}`);
      if (!DS_BOSSES[s.mainBossId] || DS_BOSSES[s.mainBossId].tier !== 'main') throw new Error(`bad main boss ${s.mainBossId}`);
      if (resolved.megaFinale) {
        s.megaBossId = resolved.megaFinale === 'random'
          ? DS_MEGA_BOSSES[dsRandInt(s, DS_MEGA_BOSSES.length)]
          : resolved.megaFinale;
        if (DS_BOSSES[s.megaBossId]?.tier !== 'mega') throw new Error(`bad mega boss ${s.megaBossId}`);
      }
    }
  }

  // pre-picked classes short-circuit the setup phase
  if (resolved.classIds) {
    if (resolved.classIds.length !== partySize) throw new Error('classIds must match party size');
    const seen = new Set<string>();
    for (const id of resolved.classIds) {
      if (!DS_CLASSES[id]) throw new Error(`unknown class ${id}`);
      if (seen.has(id)) throw new Error('duplicate class picks');
      seen.add(id);
    }
    s.classPicks = [...resolved.classIds];
    dsFinishSetup(s);
  }
  return s;
}

// ---------- setup internals (shared with the pick_class action) ----------

export function dsMakeCharacter(seat: number, classId: string): DsCharacter {
  const cls = DS_CLASSES[classId];
  const ch: DsCharacter = {
    seat, classId,
    tiers: { str: 0, dex: 0, int: 0, fai: 0 },
    stamina: 0, damage: 0,
    estus: true, luck: true, heroic: true, ember: false,
    armour: null, handL: null, handR: null, backup: [],
    conditions: [], defBuffs: [],
    nodeId: null, arc: null, act: null,
  };
  // auto-equip starting gear: armour -> armour slot; the rest fills hands then backup
  for (const id of cls.startingEquipment) {
    const card = DS_TREASURE_BY_ID[id];
    if (!card) throw new Error(`class ${classId}: unknown starting card ${id}`);
    const eq: DsEquipped = { cardId: id, upgrades: [] };
    if (card.kind === 'armour') { ch.armour = eq; continue; }
    if (card.twoHanded) {
      if (!ch.handL && !ch.handR) { ch.handL = eq; continue; }
      ch.backup.push(eq); continue;
    }
    if (!ch.handL) ch.handL = eq;
    else if (!ch.handR && !(ch.handL && DS_TREASURE_BY_ID[ch.handL.cardId].twoHanded)) ch.handR = eq;
    else ch.backup.push(eq);
  }
  return ch;
}

export function dsFinishSetup(s: DsState): void {
  s.characters = s.classPicks.map((id, seat) => {
    if (!id) throw new Error('setup incomplete');
    return dsMakeCharacter(seat, id);
  });
  buildTreasureDeck(s);
  if (s.campaign) {
    dsSetupSection(s);
  } else if (s.stage === 'oneshot') {
    setupOneshot(s);
  } else {
    dsSetupStandardStage(s);
  }
  s.phase = 'bonfire';
  s.partyAt = 'bonfire';
  s.log.push({ text: 'The party gathers at the bonfire.', kind: 'phase' });
}

function buildTreasureDeck(s: DsState): void {
  // Core commons (70) plus each chosen class's five class-treasure cards
  // (core p.9). Darkroot treasure toggle replaces 15 random core commons with
  // the 15 Darkroot cards (darkroot p.6).
  let core = dsTreasureDeckCards('core-treasure').map((c) => c.id);
  if (s.options.darkrootTreasure) {
    const removed = new Set(dsShuffle(s, core).slice(0, 15));
    core = core.filter((id) => !removed.has(id));
    core.push(...dsTreasureDeckCards('darkroot-treasure').map((c) => c.id));
  }
  const pool = [...core];
  for (const ch of s.characters) pool.push(...dsTreasureDeckCards(`${ch.classId}-class-treasure`).map((c) => c.id));
  s.treasureDeck = dsShuffle(s, pool);
  // ledger: deck + starting equipment already on boards
  s.treasurePool = [...pool];
  for (const ch of s.characters) for (const eq of dsEquippedList(ch)) s.treasurePool.push(eq.cardId);
}

/** Post-mini-boss injection: five transposed cards per chosen class plus five
 * random legendary (= Transmuted) cards; shuffle (core p.9; spec OQ4). */
export function dsInjectTransposedAndLegendaries(s: DsState): void {
  const add: string[] = [];
  for (const ch of s.characters) add.push(...dsTreasureDeckCards(`${ch.classId}-transposed`).map((c) => c.id));
  const transmuted = dsShuffle(s, dsTreasureDeckCards('transmuted-treasure').map((c) => c.id)).slice(0, 5);
  add.push(...transmuted);
  s.treasureDeck = dsShuffle(s, [...s.treasureDeck, ...add]);
  s.treasurePool.push(...add);
  s.log.push({ text: 'Transposed and legendary treasure shuffled into the deck.', kind: 'phase' });
}

// ----- tiles -----

let tileSeq = 0;

function makeExploreTiles(s: DsState, levels: number[], named?: { encounterId: string; level: number; position: string }[]): void {
  // Random exploration tiles (of 6 physical tiles, random face each), lower
  // levels nearer the bonfire (core p.8-9). Engine judgment: the chain is
  // linear — bonfire -> t1 .. tn -> fog gate on the last tile.
  const sorted = [...levels].sort((a, b) => a - b);
  const tileNames = dsShuffle(s, ['room1', 'room2', 'room3', 'room4', 'room5', 'room6']).slice(0, sorted.length);
  const used = new Set<string>();
  s.tiles = sorted.map((level, i) => {
    const faceId = `${tileNames[i]}${dsRandInt(s, 2) === 0 ? 'a' : 'b'}`;
    const cardId = drawEncounterCard(s, level, used, named);
    used.add(cardId);
    return makeTile(s, `t${++tileSeq}`, 'explore', faceId, level, cardId);
  });
  // named final encounters pin to the farthest slot of their level
  if (named) {
    for (const nm of named) {
      if (nm.position !== 'final') continue;
      const idx = s.tiles.map((t) => t.level).lastIndexOf(nm.level);
      if (idx >= 0 && s.tiles[idx].encounterId !== nm.encounterId) {
        s.tiles[idx].encounterId = nm.encounterId;
      }
    }
  }
  s.fogGateTileId = s.tiles.length > 0 ? s.tiles[s.tiles.length - 1].id : null;
}

function makeTile(s: DsState, id: string, kind: 'explore' | 'mega', faceId: string, level: number, encounterId: string | null): DsTile {
  const card = encounterId ? DS_ENCOUNTER_BY_ID[encounterId] : null;
  const tile: DsTile = {
    id, kind, faceId, level, encounterId,
    faceUp: false, cleared: false, completed: false,
    chests: {}, mimicChests: [], mimicAmbush: s.options.mimics || (card?.terrain.some((t) => t.piece === 'mimic-chest') ?? false) ? 'pending' : null,
    mimicNode: null,
    invaderToken: false,
    traps: null,
  };
  return tile;
}

function drawEncounterCard(
  s: DsState, level: number, used: Set<string>,
  named?: { encounterId: string; level: number; position: string }[],
): string {
  if (level === 4) throw new Error('L4 cards are drawn by the mega framework');
  let pool = dsEncounterPool(level, { darkroot: s.options.darkrootMix }).map((c) => c.id)
    .filter((id) => !used.has(id) && !(s.campaign?.l4Completed.includes(id)));
  if (s.options.darkrootMix === 'replaceSix') {
    // replace six random core cards per level with the six Darkroot cards
    const core = pool.filter((id) => DS_ENCOUNTER_BY_ID[id].deck === `Level ${level} Encounter`);
    const dark = pool.filter((id) => DS_ENCOUNTER_BY_ID[id].deck !== `Level ${level} Encounter`);
    const keptCore = dsShuffle(s, core).slice(0, Math.max(0, core.length - 6));
    pool = [...keptCore, ...dark];
  }
  // named cards are pinned separately; avoid random-drawing them into other slots
  if (named) pool = pool.filter((id) => !named.some((nm) => nm.encounterId === id));
  if (pool.length === 0) throw new Error(`no level ${level} encounter available`);
  return pool[dsRandInt(s, pool.length)];
}

/** Draw one drawable L4 card of a pool; undrawable cards (UNKNOWN spawns) are
 * redrawn (mega insert p.7; spec correction 4). Call-of-the-Abyss may exhaust
 * its own pool: substitute from all other drawable, uncompleted L4s
 * (scenarios.json open issue; spec judgment adopted). */
export function dsDrawL4(s: DsState, deckName: string): string {
  const completed = new Set(s.campaign?.l4Completed ?? []);
  const drawable = (name: string) =>
    DS_ENCOUNTERS.filter((e) => e.deck === name && dsIsDrawableEncounter(e))
      .map((e) => e.id)
      .filter((id) => !completed.has(id));
  let pool = drawable(deckName);
  if (pool.length === 0) {
    const all = ['Level 4 Four Kings Encounter', 'Level 4 Old Iron King Encounter', 'Level 4 Black Dragon Kalameet Encounter']
      .filter((n) => n !== deckName)
      .flatMap((n) => drawable(n));
    if (all.length === 0) throw new Error('no drawable L4 encounter remains');
    pool = all;
    s.log.push({ text: 'Level 4 deck exhausted: substituting a card from another mega deck.', kind: 'phase' });
  }
  return pool[dsRandInt(s, pool.length)];
}

export function dsSetupStandardStage(s: DsState): void {
  tileSeq = 0;
  const bossId = s.stage === 'preMini' ? s.miniBossId! : s.mainBossId!;
  const icons = DS_BOSSES[bossId].paired
    ? DS_BOSSES[bossId].pairedData!.ornstein.encounterIcons!
    : DS_BOSSES[bossId].data!.encounterIcons!;
  const levels: number[] = [];
  icons.forEach((count, i) => { for (let k = 0; k < count; k++) levels.push(i + 1); });
  makeExploreTiles(s, levels);
  s.sparks = s.sparksMax;
  s.log.push({
    text: s.stage === 'preMini'
      ? `Exploration toward the mini boss: ${DS_BOSSES[bossId].name}.`
      : `The road resets. Exploration toward the main boss: ${DS_BOSSES[bossId].name}.`,
    kind: 'phase',
  });
}

function setupOneshot(s: DsState): void {
  tileSeq = 0;
  makeExploreTiles(s, s.options.oneshot!.levels);
  s.log.push({ text: `One-shot: ${s.tiles.length} encounter(s), then ${DS_BOSSES[s.options.oneshot!.boss].name}.`, kind: 'phase' });
}

export function dsCurrentSection(s: DsState): DsScenarioSection {
  const scen = dsScenarioOf(s);
  return scen.sections[s.campaign!.sectionIdx];
}

export function dsScenarioOf(s: DsState): DsScenarioDef {
  const scen = DS_SCENARIOS[s.campaign!.scenarioId];
  if (scen.extendsScenario) {
    const base = DS_SCENARIOS[scen.extendsScenario];
    return { ...scen, sections: [...base.sections, ...scen.sections] };
  }
  return scen;
}

export function dsSectionBossIds(section: DsScenarioSection): { boss: string; tier: 'mini' | 'main' | 'mega' }[] {
  const out: { boss: string; tier: 'mini' | 'main' | 'mega' }[] = [];
  const get = (v: string | { choice: string[] } | undefined): string | null =>
    v == null ? null : typeof v === 'string' ? v : null;
  const mini = get(section.miniBoss);
  if (mini) {
    const n = section.miniBossCount ?? 1;
    for (let i = 0; i < n; i++) out.push({ boss: mini, tier: 'mini' });
  }
  const main = get(section.mainBoss);
  if (main) out.push({ boss: main, tier: 'main' });
  const mega = get(section.megaBoss);
  if (mega) out.push({ boss: mega, tier: 'mega' });
  return out;
}

export function dsSetupSection(s: DsState): void {
  tileSeq = 0;
  const section = dsCurrentSection(s);
  const levels: number[] = [];
  for (const lv of section.encounters.levels ?? []) {
    for (let k = 0; k < lv.count; k++) if (lv.level < 4) levels.push(lv.level);
  }
  makeExploreTiles(s, levels, section.encounters.named);
  // named non-final (e.g. hydra-lake is final; others handled at their level slot)
  // L4 slot: mega board placed off the last L3 tile (fk p.14)
  const l4Count = (section.encounters.levels ?? []).filter((lv) => lv.level === 4).reduce((n, lv) => n + lv.count, 0);
  if (l4Count > 0) {
    const pool = section.encounters.l4Pool ?? 'Level 4 Four Kings Encounter';
    for (let k = 0; k < l4Count; k++) {
      const cardId = dsDrawL4(s, pool);
      const tile = makeTile(s, `t${++tileSeq}`, 'mega', 'mega-four-kings-front', 4, cardId);
      tile.faceId = megaEncounterFace(section);
      s.tiles.push(tile);
      s.campaign!.l4Completed.push(cardId); // reserve: never drawn twice (fk p.8)
    }
    s.fogGateTileId = s.tiles[s.tiles.length - 1].id;
  }
  s.campaign!.sectionBossKills = 0;
  s.log.push({ text: `${section.name} begins.`, kind: 'phase' });
}

function megaEncounterFace(section: DsScenarioSection): string {
  const mega = typeof section.megaBoss === 'string' ? section.megaBoss : null;
  const pool = section.encounters.l4Pool ?? '';
  if (mega === 'old-iron-king' || pool.includes('Old Iron King')) return 'mega-old-iron-king-front';
  if (mega === 'black-dragon-kalameet' || pool.includes('Kalameet')) return 'mega-black-dragon-kalameet-front';
  return 'mega-four-kings-front';
}

// ---------- pendings ----------

export function dsPushPending(
  s: DsState, seat: number, kind: DsPendingKind, prompt: string,
  options: DsPendingOption[], data: Record<string, unknown> = {},
): void {
  s.pendings.push({ id: s.pendingSeq++, seat, kind, prompt, options, data });
}

// ---------- occupancy ----------

export function dsModelsAt(s: DsState, nodeId: string): { chars: DsCharacter[]; enemies: DsEnemyModel[]; bossUnits: DsBossUnit[]; summons: DsSummon[] } {
  const chars = s.characters.filter((c) => c.nodeId === nodeId);
  const enemies = (s.encounter?.enemies ?? []).filter((e) => e.nodeId === nodeId);
  const bossUnits = (s.boss?.units ?? []).filter((u) => u.inPlay && u.nodeId === nodeId);
  const summons = s.summon && s.summon.nodeId === nodeId ? [s.summon] : [];
  return { chars, enemies, bossUnits, summons };
}

export function dsOccupancy(s: DsState, nodeId: string): number {
  const m = dsModelsAt(s, nodeId);
  return m.chars.length + m.enemies.length + m.bossUnits.length + m.summons.length;
}

export function dsActiveFaceId(s: DsState): string | null {
  return s.encounter?.faceId ?? null;
}

/** Terrain blocking for character/enemy movement (core p.17). */
export function dsNodeBlocked(s: DsState, nodeId: string, opts: { forPush?: boolean } = {}): boolean {
  const enc = s.encounter;
  if (!enc) return false;
  for (const t of enc.terrain) {
    if (t.nodeId !== nodeId) continue;
    if (t.piece === 'gravestone') return true;
    if (t.piece === 'barrel' && !t.destroyed) return true; // pushes too
    if ((t.piece === 'chest' || t.piece === 'mimic-chest')) {
      const tile = enc.tileId ? s.tiles.find((x) => x.id === enc.tileId) : null;
      const open = tile?.chests[nodeId] === 'open';
      if (!open) return true;
      return false;
    }
  }
  void opts;
  return false;
}

/** BFS distance for MOVEMENT decisions: blocked nodes (gravestones, intact
 * barrels, closed chests) are impassable. Range checks stay pure node
 * distance (core p.10 — terrain blocks movement, not attacks). */
export function dsCombatDistance(s: DsState, from: string, to: string): number {
  const enc = s.encounter;
  if (!enc) return Infinity;
  if (from === to) return 0;
  const g = dsTileGraph(enc.faceId);
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
        if (dsNodeBlocked(s, m)) continue;
        next.push(m);
      }
    }
    frontier = next;
  }
  return Infinity;
}

// ---------- view ----------

export interface DsView {
  game: 'darksouls';
  options: DsResolvedOptions;
  phase: DsPhase;
  stage: DsStage;
  campaign: DsState['campaign'];
  sparks: number;
  sparksMax: number;
  soulCache: number;
  droppedSouls: DsState['droppedSouls'];
  characters: (DsCharacter & { stats: Record<DsStat, number>; taunt: number; className: string })[];
  classPicks: (string | null)[];
  inventory: string[];
  treasureDeckCount: number;
  tiles: DsTile[];
  partyAt: DsState['partyAt'];
  fogGateTileId: string | null;
  encounter: DsEncounterRun | null;
  boss: (Omit<DsBossRun, 'deck'> & { deckCount: number }) | null;
  summonEarned: 'mini' | 'main' | null;
  summon: DsSummon | null;
  miniBossId: string | null;
  mainBossId: string | null;
  megaBossId: string | null;
  miniBossDefeated: boolean;
  aggroSeat: number;
  firstActivationSeat: number;
  head: DsPending | null;
  pendings: DsPending[];
  busy: boolean; // script pending: enemy/boss playback in flight
  winner: boolean | null;
  log: DsLogEntry[];
}

/** Dark Souls is a fully cooperative, public-information game: every seat sees
 * everything; per-seat affordances are client-side. The behaviour DECK order
 * is the one hidden element (players learn the pattern from the discard), so
 * the view exposes only its count plus the gravestone-revealed cards. */
export function dsViewFor(s: DsState, viewer: number | null | 'dev'): DsView {
  void viewer;
  return {
    game: 'darksouls',
    options: s.options,
    phase: s.phase,
    stage: s.stage,
    campaign: s.campaign,
    sparks: s.sparks,
    sparksMax: s.sparksMax,
    soulCache: s.soulCache,
    droppedSouls: s.droppedSouls,
    characters: s.characters.map((c) => ({
      ...c,
      stats: {
        str: dsStatValue(c, 'str'), dex: dsStatValue(c, 'dex'),
        int: dsStatValue(c, 'int'), fai: dsStatValue(c, 'fai'),
      },
      taunt: DS_CLASSES[c.classId].taunt,
      className: DS_CLASSES[c.classId].name,
    })),
    classPicks: s.classPicks,
    inventory: s.inventory,
    treasureDeckCount: s.treasureDeck.length,
    tiles: s.tiles,
    partyAt: s.partyAt,
    fogGateTileId: s.fogGateTileId,
    encounter: s.encounter,
    boss: s.boss
      ? (() => { const { deck, ...rest } = s.boss!; return { ...rest, deckCount: deck.length }; })()
      : null,
    summonEarned: s.summonEarned,
    summon: s.summon,
    miniBossId: s.miniBossId,
    mainBossId: s.mainBossId,
    megaBossId: s.megaBossId,
    miniBossDefeated: s.miniBossDefeated,
    aggroSeat: s.aggroSeat,
    firstActivationSeat: s.firstActivationSeat,
    head: s.pendings[0] ?? null,
    pendings: s.pendings,
    busy: s.script.length > 0,
    winner: s.winner,
    log: s.log.slice(-120),
  };
}

// re-export a couple of frequently used card helpers for the reducer
export { DS_TREASURE_BY_ID, DS_CLASSES, DS_BOSSES, DS_ENCOUNTER_BY_ID };
export type { DsBossCard };
export { DS_TRAP_TOKENS };
