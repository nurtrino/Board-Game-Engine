// Bloodborne: The Board Game — state shape, setup, seeded RNG, map graph,
// and the public view. Rules per docs/specs/bloodborne.md (Core Rulebook v1.1
// page refs; FAQ rulings baked in). The reducer, combat resolver, and the
// automatic enemy activation live in actions.ts; mission logic in missions.ts.
//
// OWNER DIRECTIVE: Enemy Activation is fully automatic — the engine moves
// enemies and starts their combats itself (Intelligent & Cruel tie-breaks are
// deterministic). Players only answer the decisions that are theirs.

import { mulberry32 } from '../brass/rng.js';
import { BB_SEATS, BB_MAX_HP, BB_HAND_SIZE, BB_UPGRADE_ROW, BB_ENEMY_ACTION_DECK, type BbSeat, type BbSpeed, type BbStat, type BbEnemyActionKind } from './config.js';
import {
  BB_TILES, BB_CAMPAIGNS, BB_HUNTERS, BB_UPGRADE_CARDS, BB_BASIC_CARDS,
  BB_CONSUMABLES, BB_ENEMIES, BB_HUNT_TRACK, BB_MISSIONS,
  type BbTileDef, type BbCampaignDef, type BbChapterDef, type BbHunterDef, type BbStatCardDef,
} from './data.js';

export { BB_SEATS };
export type { BbSeat };

// ---------- options ----------

export interface BbCreateOptions {
  campaignId: string; // 'the-long-hunt' | 'growing-madness' | 'secrets-of-the-church' | 'fall-of-old-yharnam'
  chapter?: number;   // 1-3 (resume support); default 1
  partySize: number;  // 1-4
  seed?: number;
}

// ---------- map ----------

export type BbEdge = 'N' | 'E' | 'S' | 'W';
export const BB_EDGES: BbEdge[] = ['N', 'E', 'S', 'W'];

/** A placed tile instance on the grid. rot = quarter-turns clockwise applied
 * to the printed art (0-3). Grid coords: +x east, +y south, start tile 0,0. */
export interface BbPlacedTile {
  uid: number;
  tileId: string;
  rot: 0 | 1 | 2 | 3;
  x: number;
  y: number;
}

/** Global space address: `${tileUid}:${spaceId}` */
export type BbSpaceRef = string;

// ---------- pieces ----------

export interface BbEnemyOnMap {
  uid: number;
  type: string;        // enemy id (data BB_ENEMIES key)
  space: BbSpaceRef;
  damage: number;      // accumulated damage tokens (>= hp -> slain)
  missionTag?: string; // spawned by mission card N (survives fog gates etc.)
  npc?: boolean;
}

export interface BbBossOnMap {
  uid: number;
  type: string; // boss id
  space: BbSpaceRef;
  phase: 1 | 2;
  damage: number;
  actionDeck: number[]; // indices into the boss phase deck, top first
  actionDiscard: number[];
  missionTag?: string;
}

// ---------- hunters ----------

export interface BbHunterState {
  seat: number;
  hunterId: string | null; // picked during setup phase
  hp: number;
  echoes: number;
  space: BbSpaceRef | null; // null = in the Hunter's Dream
  weaponSide: 0 | 1;
  /** stat card ids occupying attack slots, per slot index of the current side */
  slots: (string | null)[];
  deck: string[];      // stat card ids, top first
  hand: string[];
  discard: string[];
  firearmId: string;
  firearmExhausted: boolean;
  rewards: { id: string; exhausted: boolean }[]; // tools + runes
  consumables: string[];
  poison: boolean;
  frenzy: boolean;
  /** Blood Stone Shard: attack slot carrying the gem (+1 dmg) */
  gemSlot: number | null;
  /** slain before taking this round's turn -> skip it (p. 21) */
  skipTurn: boolean;
  /** returned from the Dream: must pick weapon side + lamp space on turn start */
  pendingReturn: boolean;
  /** turn bookkeeping */
  tookTurnThisRound: boolean;
}

// ---------- pending decisions ----------
// The queue drives every branching choice (playbook §6.4). Only the head's
// seat may act; the reducer rejects other actions while it is non-empty
// (except always-legal informational ones).

export type BbPending =
  | { seat: number; kind: 'combat-attack' } // may attack back: pick card+slot or pass
  | { seat: number; kind: 'combat-modifiers' } // On Attack gear, before the enemy card is flipped
  | { seat: number; kind: 'combat-reaction' } // revealed-action review + eligible firearm reactions
  | { seat: number; kind: 'combat-dodge'; speed: BbSpeed | number } // may dodge: pick dodge card+slot or pass
  | { seat: number; kind: 'combat-rider'; rider: string; speed?: BbSpeed; damage?: number; stun?: boolean; poison?: boolean; frenzy?: boolean; push?: number; source?: BbSpaceRef } // curated rider/AoE Dodge prompts
  | { seat: number; kind: 'dream-upgrades'; picks: number } // echoes to spend, pick from row
  | { seat: number; kind: 'dream-incorporate'; upgradeId: string } // swap 1-for-1 or discard
  | { seat: number; kind: 'return-placement' } // pick weapon side + lamp space
  | { seat: number; kind: 'tile-orientation'; tileId: string; options: number[] } // choose rotation
  | { seat: number; kind: 'reward-overflow'; rewardId: string } // 3rd tool/rune: give away or set aside
  | { seat: number; kind: 'mission-choice'; card: string; options: string[] } // mission-card decisions
  | { seat: number; kind: 'discard-for-stun' }
  | { seat: number; kind: 'round-refresh' } // discard any, draw to 3 (p. 18)
  | { seat: number; kind: 'onkill-reward'; rewardIx: number }; // optional On Kill reward window

// ---------- combat ----------

export interface BbCombat {
  seat: number;
  enemyUid: number | null; // null when fighting a boss
  bossUid: number | null;
  /** Space occupied by the attacker when combat began; retained for AoE even
   * if the piece is slain simultaneously before collateral resolves. */
  sourceSpace: BbSpaceRef | null;
  /** hunter's committed attack, if any */
  attack: { cardId: string; slot: number } | null;
  /** flipped enemy action */
  enemyAction: {
    kind: BbEnemyActionKind;
    bossCardIx?: number;
    /** Server-authoritative printed/effective row snapshot. Keeping this on
     * the combat prevents the client from explaining a base row when a
     * mission replaced it, or a new Boss phase has already begun. */
    action?: {
      name: string;
      text: string;
      speed: BbSpeed | null;
      damage: number;
      isAbility: boolean;
      cannotDodge: boolean;
      cannotStagger: boolean;
      exactDodgeSpeed: BbSpeed | null;
      stagger: boolean;
    };
  } | null;
  dodge: { cardId: string; slot: number } | null;
  /** interact-aggro combats: no attack, no dodge (p. 16) */
  noResponse: boolean;
  /** speed adjustments from abilities this combat */
  enemySpeedBonus: number;
  hunterSpeedBonus: number;
  enemyDmgBonus: number;
  hunterDmgBonus: number;
  /** immediate Block accumulated from stat cards/items in this combat */
  blockPending: number;
  enemyStagger: boolean;
  resolved: boolean;
}

/** Persisted long enough for clients to explain what the last exchange did.
 * Combat itself is intentionally transient, but its outcome must not vanish in
 * the same reducer tick that applies damage. */
export interface BbCombatResult {
  seq: number;
  seat: number;
  foeKind: 'enemy' | 'boss';
  foeType: string;
  foeName: string;
  bossPhaseBefore: number | null;
  bossPhaseAfter: number | null;
  hunterAttack: {
    name: string;
    speed: number | null;
    damage: number;
    resolved: boolean;
    cancelled: boolean;
  } | null;
  enemyAction: {
    name: string;
    speed: number | null;
    damage: number;
    resolved: boolean;
    cancelled: boolean;
    text: string;
  } | null;
  hunterHpBefore: number;
  hunterHpAfter: number;
  foeHpBefore: number;
  foeHpAfter: number;
  hunterDamageTaken: number;
  foeDamageTaken: number;
  blocked: number;
  dodged: boolean;
  noResponse: boolean;
  hunterSlain: boolean;
  foeSlain: boolean;
  phaseChanged: boolean;
  outcome: 'foe-slain' | 'hunter-slain' | 'mutual' | 'phase-change' | 'hunter-advantage' | 'foe-advantage' | 'even';
}

// ---------- missions ----------

export interface BbMissionInstance {
  number: string;       // card number within the campaign deck
  revealed: boolean;
  completed: boolean;
  tokens: number;       // insight tokens on the card
  /** free-form per-card counters keyed by the mission DSL */
  vars: Record<string, number>;
}

// ---------- events ----------

export interface BbEvent {
  seq: number;
  text: string;
  seat?: number;
  kind?: string;
}

// ---------- state ----------

export interface BbState {
  game: 'bloodborne';
  phase: 'setup' | 'play' | 'ended';
  outcome: 'victory' | 'defeat' | null; // chapter outcome when ended
  seats: { name: string; color: BbSeat }[];
  partySize: number;

  campaignId: string;
  chapter: number; // 1-3

  // ----- setup picks -----
  hunters: BbHunterState[];
  pickedHunters: string[]; // hunter ids already taken

  // ----- hunt board -----
  huntTrack: number; // 0-based position on the track
  finalRound: boolean;
  enemySlots: [string, string, string]; // enemy type per spawn icon 1/2/3
  enemySides: Record<string, 0 | 1>;    // chosen card side per enemy type
  enemyActionDeck: BbEnemyActionKind[];
  enemyActionDiscard: BbEnemyActionKind[];
  upgradeRow: string[];
  upgradeDeck: string[];
  consumableDeck: string[];
  consumableDiscard: string[];

  // ----- map -----
  tiles: BbPlacedTile[];
  tileDeck: string[]; // tile ids, top first
  nextUid: number;
  consumableTokens: BbSpaceRef[];
  insightTokens: Record<BbSpaceRef, number>;
  corpseTokens: BbSpaceRef[];
  survivorTokens: BbSpaceRef[];
  npcTokens: { space: BbSpaceRef; enemyType: string; uid: number }[];
  fogGates: number[]; // tile uids currently fog-gated
  brokenLamps: BbSpaceRef[];

  enemies: BbEnemyOnMap[];
  bosses: BbBossOnMap[];

  // ----- missions -----
  missions: Record<string, BbMissionInstance>;
  insightCollected: number;
  insightCards: string[]; // reward card numbers kept
  specialRules: string[]; // active special-rule card numbers

  // ----- turn structure -----
  round: number;
  activeSeat: number | null; // whose Hunter Turn is running
  /** enemy activation in progress after activeSeat's turn (auto-driven) */
  activationQueue: number[]; // enemy uids yet to activate
  pending: BbPending[];
  combat: BbCombat | null;
  lastCombatResult: BbCombatResult | null;

  // ----- meta -----
  lastEvent: BbEvent;
  seed: number;
  rolls: number;
  /** cross-chapter campaign persistence: filled at chapter end */
  campaignStore: {
    hunterDecks: Record<number, string[]>;
    firearms: Record<number, string>;
    rewards: Record<number, string[]>;
    consumables: Record<number, string[]>;
    insightCards: string[];
  } | null;
}

// ---------- seeded rng ----------

export const bbRnd = (s: BbState): number => mulberry32(s.seed ^ (s.rolls++ * 0x9e3779b9))();
export const bbShuffle = <T>(s: BbState, arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(bbRnd(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- map graph helpers ----------

/** rotate a printed edge by rot quarter-turns clockwise */
export const rotEdge = (e: BbEdge, rot: number): BbEdge => BB_EDGES[(BB_EDGES.indexOf(e) + rot) % 4];
/** the edge of the neighbouring cell that faces edge e */
export const facing = (e: BbEdge): BbEdge => BB_EDGES[(BB_EDGES.indexOf(e) + 2) % 4];
export const edgeDelta = (e: BbEdge): [number, number] => (e === 'N' ? [0, -1] : e === 'S' ? [0, 1] : e === 'E' ? [1, 0] : [-1, 0]);

export const tileDef = (id: string): BbTileDef => {
  const t = BB_TILES[id];
  if (!t) throw new Error(`unknown tile ${id}`);
  return t;
};

export const tileAt = (s: BbState, x: number, y: number): BbPlacedTile | undefined =>
  s.tiles.find((t) => t.x === x && t.y === y);

export const spaceRef = (tileUid: number, spaceId: string): BbSpaceRef => `${tileUid}:${spaceId}`;
export const parseRef = (ref: BbSpaceRef): { uid: number; space: string } => {
  const i = ref.indexOf(':');
  return { uid: +ref.slice(0, i), space: ref.slice(i + 1) };
};

/** exits of a placed tile in world orientation: map of world edge -> spaceId */
export const worldExits = (t: BbPlacedTile): { edge: BbEdge; space: string }[] =>
  tileDef(t.tileId).exits.map((x) => ({ edge: rotEdge(x.edge, t.rot), space: x.space }));

/** All space adjacencies (within-tile grey lines + cross-tile facing exits).
 * Fog gates cut cross-tile adjacency for enemies; hunters may still enter
 * (one-way) — callers pass a mode. */
export const spaceNeighbors = (s: BbState, ref: BbSpaceRef, mode: 'hunter' | 'enemy' = 'hunter'): BbSpaceRef[] => {
  const { uid, space } = parseRef(ref);
  const t = s.tiles.find((x) => x.uid === uid);
  if (!t) return [];
  const def = tileDef(t.tileId);
  const out: BbSpaceRef[] = [];
  for (const [a, b] of def.adjacency) {
    if (a === space) out.push(spaceRef(uid, b));
    else if (b === space) out.push(spaceRef(uid, a));
  }
  // cross-tile: this space's exits vs facing exits of grid neighbours
  for (const ex of worldExits(t)) {
    if (ex.space !== space) continue;
    const [dx, dy] = edgeDelta(ex.edge);
    const nb = tileAt(s, t.x + dx, t.y + dy);
    if (!nb) continue;
    const need = facing(ex.edge);
    const match = worldExits(nb).find((e) => e.edge === need);
    if (!match) continue; // exit vs blank wall: not adjacent (p. 14)
    const gatedHere = s.fogGates.includes(t.uid);
    const gatedThere = s.fogGates.includes(nb.uid);
    if (mode === 'enemy' && (gatedHere || gatedThere)) continue; // enemies never cross (p. 24)
    if (mode === 'hunter' && gatedHere) continue; // hunters may enter, never leave (p. 24)
    out.push(spaceRef(nb.uid, match.space));
  }
  return out;
};

/** BFS distance map from a space (enemy pathing / activation range). */
export const bfsFrom = (s: BbState, from: BbSpaceRef, mode: 'hunter' | 'enemy'): Map<BbSpaceRef, number> => {
  const dist = new Map<BbSpaceRef, number>([[from, 0]]);
  const q = [from];
  // Indexing instead of shifting keeps traversal linear as campaign maps grow.
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    for (const nb of spaceNeighbors(s, cur, mode)) {
      if (!dist.has(nb)) {
        dist.set(nb, dist.get(cur)! + 1);
        q.push(nb);
      }
    }
  }
  return dist;
};

/** tiles connected to a tile (adjacency via matching exits) — activation range */
export const connectedTiles = (s: BbState, uid: number): number[] => {
  const t = s.tiles.find((x) => x.uid === uid);
  if (!t) return [];
  const out: number[] = [];
  for (const ex of worldExits(t)) {
    const [dx, dy] = edgeDelta(ex.edge);
    const nb = tileAt(s, t.x + dx, t.y + dy);
    if (!nb) continue;
    if (worldExits(nb).some((e) => e.edge === facing(ex.edge))) out.push(nb.uid);
  }
  return [...new Set(out)];
};

/** all lamp spaces on the map (excluding broken lamps) */
export const lampSpaces = (s: BbState): BbSpaceRef[] => {
  const out: BbSpaceRef[] = [];
  for (const t of s.tiles) {
    for (const sp of tileDef(t.tileId).spaces) {
      if (sp.icons.includes('lamp')) {
        const ref = spaceRef(t.uid, sp.id);
        if (!s.brokenLamps.includes(ref)) out.push(ref);
      }
    }
  }
  return out;
};

// ---------- deck helpers ----------

export const drawStat = (s: BbState, h: BbHunterState): string | null => {
  if (h.deck.length === 0) {
    if (h.discard.length === 0) return null;
    h.deck = bbShuffle(s, h.discard);
    h.discard = [];
  }
  return h.deck.shift() ?? null;
};

export const drawConsumable = (s: BbState): string | null => {
  if (s.consumableDeck.length === 0) {
    if (s.consumableDiscard.length === 0) return null;
    s.consumableDeck = bbShuffle(s, s.consumableDiscard);
    s.consumableDiscard = [];
  }
  return s.consumableDeck.shift() ?? null;
};

export const flipEnemyAction = (s: BbState): BbEnemyActionKind => {
  if (s.enemyActionDeck.length === 0) {
    if (s.enemyActionDiscard.length === 0) throw new Error('enemy action deck is empty');
    s.enemyActionDeck = bbShuffle(s, s.enemyActionDiscard);
    s.enemyActionDiscard = [];
  }
  const k = s.enemyActionDeck.shift()!;
  s.enemyActionDiscard.push(k);
  return k;
};

export const refillUpgradeRow = (s: BbState): void => {
  while (s.upgradeRow.length < BB_UPGRADE_ROW && s.upgradeDeck.length > 0) {
    s.upgradeRow.push(s.upgradeDeck.shift()!);
  }
};

// ---------- setup ----------

export const bbChapterDef = (s: BbState): BbChapterDef => {
  const c = BB_CAMPAIGNS[s.campaignId];
  if (!c) throw new Error(`unknown campaign ${s.campaignId}`);
  const ch = c.chapters[s.chapter - 1];
  if (!ch) throw new Error(`campaign ${s.campaignId} has no chapter ${s.chapter}`);
  return ch;
};

export const createBloodborne = (opts: BbCreateOptions): BbState => {
  const campaign = BB_CAMPAIGNS[opts.campaignId];
  if (!campaign) throw new Error(`unknown campaign ${opts.campaignId}`);
  if (!Number.isInteger(opts.partySize) || opts.partySize < 1 || opts.partySize > 4) {
    throw new Error('partySize must be an integer from 1 to 4');
  }
  const chapter = opts.chapter ?? 1;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > campaign.chapters.length) {
    throw new Error(`chapter must be an integer from 1 to ${campaign.chapters.length}`);
  }
  const seed = opts.seed ?? 1;
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) throw new Error('seed must be a finite integer');
  const partySize = opts.partySize;
  const s: BbState = {
    game: 'bloodborne',
    phase: 'setup',
    outcome: null,
    seats: BB_SEATS.slice(0, partySize).map((color, i) => ({ name: `Hunter ${i + 1}`, color })),
    partySize,
    campaignId: opts.campaignId,
    chapter,
    hunters: [],
    pickedHunters: [],
    huntTrack: 0,
    finalRound: false,
    enemySlots: ['', '', ''],
    enemySides: {},
    enemyActionDeck: [],
    enemyActionDiscard: [],
    upgradeRow: [],
    upgradeDeck: [],
    consumableDeck: [],
    consumableDiscard: [],
    tiles: [],
    tileDeck: [],
    nextUid: 1,
    consumableTokens: [],
    insightTokens: {},
    corpseTokens: [],
    survivorTokens: [],
    npcTokens: [],
    fogGates: [],
    brokenLamps: [],
    enemies: [],
    bosses: [],
    missions: {},
    insightCollected: 0,
    insightCards: [],
    specialRules: [],
    round: 0,
    activeSeat: null,
    activationQueue: [],
    pending: [],
    combat: null,
    lastCombatResult: null,
    lastEvent: { seq: 0, text: 'CHOOSE YOUR HUNTERS' },
    seed,
    rolls: 0,
    campaignStore: null,
  };
  for (let i = 0; i < partySize; i++) {
    s.hunters.push({
      seat: i, hunterId: null, hp: BB_MAX_HP, echoes: 0, space: null,
      weaponSide: 0, slots: [], deck: [], hand: [], discard: [],
      firearmId: '', firearmExhausted: false, rewards: [], consumables: [],
      poison: false, frenzy: false, gemSlot: null, skipTurn: false, pendingReturn: false,
      tookTurnThisRound: false,
    });
  }
  return s;
};

/** Chapter setup once all hunters are picked (called by the reducer). */
export const setupChapter = (s: BbState): void => {
  const ch = bbChapterDef(s);
  // --- enemy roster: chapter enemies (fixed + random from pool, exclusions) ---
  const norm = (x: string): string => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const excludedNames = (ch.excludedEnemies ?? []).map(norm);
  const pool = Object.keys(BB_ENEMIES).filter((id) => !BB_ENEMIES[id].npc && !excludedNames.includes(norm(BB_ENEMIES[id].name)));
  const fixed = (ch.enemies ?? []).map((name) => {
    const id = Object.keys(BB_ENEMIES).find((k) => norm(BB_ENEMIES[k].name) === norm(name));
    if (!id) throw new Error(`unknown chapter enemy ${name}`);
    return id;
  });
  const chosen = [...fixed];
  const randomPool = bbShuffle(s, pool.filter((id) => !chosen.includes(id) && (BB_ENEMIES[id].core ?? false)));
  const requestedRandom = Math.min(Math.max(ch.enemiesRandom ?? 0, 0), Math.max(0, 3 - chosen.length));
  for (let i = 0; i < requestedRandom && randomPool.length; i++) chosen.push(randomPool.shift()!);
  // Some legacy campaign transcriptions omit their printed fixed roster. Keep
  // the three hunt-board slots playable, while tests surface those omissions.
  while (chosen.length < 3 && randomPool.length) chosen.push(randomPool.shift()!);
  if (chosen.length !== 3) throw new Error(`campaign ${s.campaignId} chapter ${s.chapter} does not define three enemies`);
  const order = bbShuffle(s, chosen);
  s.enemySlots = [order[0], order[1], order[2]] as [string, string, string];
  s.enemySides = {};
  for (const id of order) s.enemySides[id] = bbRnd(s) < 0.5 ? 0 : 1; // random side (p. 10)

  // --- enemy action deck ---
  s.enemyActionDeck = bbShuffle(s, [...BB_ENEMY_ACTION_DECK]);
  s.enemyActionDiscard = [];

  // --- upgrade deck + row ---
  const carriedDecks = s.campaignStore?.hunterDecks ?? {};
  const upgradePool = Object.keys(BB_UPGRADE_CARDS).flatMap((id) => [id, id, id]);
  for (const deck of Object.values(carriedDecks)) {
    for (const id of deck) {
      if (!BB_UPGRADE_CARDS[id]) continue;
      const ix = upgradePool.indexOf(id);
      if (ix !== -1) upgradePool.splice(ix, 1);
    }
  }
  s.upgradeDeck = bbShuffle(s, upgradePool);
  s.upgradeRow = [];
  refillUpgradeRow(s);

  // --- consumables ---
  if (s.campaignStore) {
    s.insightCards = [...s.campaignStore.insightCards];
    for (const h of s.hunters) {
      h.firearmId = s.campaignStore.firearms[h.seat] ?? h.firearmId;
      h.rewards = (s.campaignStore.rewards[h.seat] ?? h.rewards.map((r) => r.id)).map((id) => ({ id, exhausted: false }));
      h.consumables = [...(s.campaignStore.consumables[h.seat] ?? h.consumables)];
    }
  }
  const consumablePool = [...BB_CONSUMABLES.deck];
  for (const h of s.hunters) {
    for (const id of h.consumables) {
      const ix = consumablePool.indexOf(id);
      if (ix !== -1) consumablePool.splice(ix, 1);
    }
  }
  s.consumableDeck = bbShuffle(s, consumablePool);
  s.consumableDiscard = [];

  // --- tile deck + printed setup layouts ---
  const tileByName = (n: string): string | undefined => Object.keys(BB_TILES).find((k) => norm(BB_TILES[k].name) === norm(n));
  const setupCard = BB_MISSIONS[s.campaignId]?.[`Chapter ${s.chapter} - Setup`];
  const prePlace = setupCard?.prePlace;
  const named = ch.startingTiles.filter((n) => n).map((n) => {
    const id = tileByName(n);
    if (!id) throw new Error(`unknown starting tile ${n}`);
    return id;
  });
  const startId = tileByName(ch.startingTile);
  if (!startId) throw new Error(`unknown starting tile ${ch.startingTile}`);
  const excluded = (ch.excludedTiles ?? []).map(tileByName).filter(Boolean) as string[];
  const prePlacedByToken = new Map<string, string>();
  const reserveNamed = (name: string): void => {
    if (name === 'random2exit') return;
    const id = tileByName(name);
    if (!id) throw new Error(`unknown pre-placed tile ${name}`);
    prePlacedByToken.set(name, id);
  };
  for (const token of prePlace?.chain ?? []) reserveNamed(token);
  for (const spec of prePlace?.attach ?? []) reserveNamed(spec.tile);
  const reservedNamed = new Set(prePlacedByToken.values());
  const pool2 = Object.keys(BB_TILES).filter((id) => BB_TILES[id].set === 'core' && id !== startId && !named.includes(id) && !excluded.includes(id) && !reservedNamed.has(id));
  if (prePlace?.chain?.includes('random2exit')) {
    const eligible = bbShuffle(s, pool2.filter((id) => BB_TILES[id].exits.length >= 2));
    const id = eligible[0];
    if (!id) throw new Error(`campaign ${s.campaignId} chapter ${s.chapter} has no unused tile with at least two exits`);
    prePlacedByToken.set('random2exit', id);
  }
  const prePlacedIds = new Set(prePlacedByToken.values());
  const deckNamed = named.filter((id) => !prePlacedIds.has(id));
  const tileRandomPool = pool2.filter((id) => !prePlacedIds.has(id));
  const nRandom = Math.min(ch.randomTiles.perHunter * s.partySize + (ch.randomTiles.plus ?? 0), ch.randomTiles.cap ?? 99);
  const randoms = bbShuffle(s, tileRandomPool).slice(0, nRandom);
  s.tileDeck = bbShuffle(s, [...deckNamed, ...randoms]);

  // --- starting tile and setup-card tiles on the grid ---
  const start: BbPlacedTile = { uid: s.nextUid++, tileId: startId, rot: 0, x: 0, y: 0 };
  s.tiles = [start];
  populateTile(s, start);
  const placedByToken = new Map<string, BbPlacedTile>([[ch.startingTile, start], ['Central Lamp', start]]);
  const placeAttached = (token: string, parent: BbPlacedTile, preferredEdge?: 'N' | 'E' | 'S' | 'W'): { tile: BbPlacedTile; parentEdge: 'N' | 'E' | 'S' | 'W' } => {
    const tileId = prePlacedByToken.get(token);
    if (!tileId) throw new Error(`missing pre-placed tile ${token}`);
    const edgeOrder: ('N' | 'E' | 'S' | 'W')[] = ['N', 'E', 'S', 'W'];
    const parentEdges = worldExits(parent).map((e) => e.edge);
    const ordered = preferredEdge
      ? [preferredEdge, ...edgeOrder.filter((edge) => edge !== preferredEdge)]
      : edgeOrder;
    for (const edge of ordered) {
      if (!parentEdges.includes(edge)) continue;
      const [dx, dy] = edgeDelta(edge);
      const x = parent.x + dx, y = parent.y + dy;
      if (tileAt(s, x, y)) continue;
      for (let rot = 0 as 0 | 1 | 2 | 3; rot < 4; rot = (rot + 1) as 0 | 1 | 2 | 3) {
        if (!BB_TILES[tileId].exits.some((exit) => rotEdge(exit.edge, rot) === facing(edge))) continue;
        const tile: BbPlacedTile = { uid: s.nextUid++, tileId, rot, x, y };
        s.tiles.push(tile);
        populateTile(s, tile);
        placedByToken.set(token, tile);
        placedByToken.set(BB_TILES[tileId].name, tile);
        return { tile, parentEdge: edge };
      }
    }
    throw new Error(`cannot connect pre-placed tile ${BB_TILES[tileId].name} to ${BB_TILES[parent.tileId].name}`);
  };
  const chain = prePlace?.chain ?? [];
  if (chain.length > 0) {
    if (chain.includes('random2exit') && chain.length === 3) {
      // Long Hunt card 17: Graveyard touches one side of Central Lamp; the
      // random tile touches the opposite side, with Tomb beyond it.
      const first = placeAttached(chain[0], start);
      const middle = placeAttached(chain[1], start, facing(first.parentEdge));
      placeAttached(chain[2], middle.tile);
    } else {
      let parent = start;
      for (const token of chain) parent = placeAttached(token, parent).tile;
    }
  }
  for (const spec of prePlace?.attach ?? []) {
    const parent = placedByToken.get(spec.to)
      ?? [...placedByToken.entries()].find(([name]) => norm(name) === norm(spec.to))?.[1];
    if (!parent) throw new Error(`pre-place parent ${spec.to} is not on the map`);
    placeAttached(spec.tile, parent);
  }
  const lampSpace = tileDef(startId).spaces.find((sp) => sp.icons.includes('lamp')) ?? tileDef(startId).spaces[0];
  for (const h of s.hunters) h.space = spaceRef(start.uid, lampSpace.id);

  // --- hunter decks: starting 12 or campaign-carried ---
  for (const h of s.hunters) {
    if (s.campaignStore?.hunterDecks?.[h.seat]?.length) h.deck = bbShuffle(s, s.campaignStore.hunterDecks[h.seat]);
    else h.deck = bbShuffle(s, [...BB_BASIC_CARDS.startingDeck]);
    h.hand = [];
    for (let i = 0; i < BB_HAND_SIZE; i++) {
      const c = drawStat(s, h);
      if (c) h.hand.push(c);
    }
    h.hp = BB_MAX_HP;
    h.echoes = 0;
    h.firearmExhausted = false;
    for (const r of h.rewards) r.exhausted = false;
    h.poison = false;
    h.frenzy = false;
    h.gemSlot = null;
    h.skipTurn = false;
    h.pendingReturn = false;
    h.tookTurnThisRound = false;
    h.slots = new Array(hunterSlotCount(h)).fill(null);
  }

  // --- hunt track ---
  s.huntTrack = 0;
  s.finalRound = false;
  s.insightCollected = 0;
  s.round = 1;
  s.phase = 'play';
  s.lastEvent = { seq: s.lastEvent.seq + 1, text: `CHAPTER ${s.chapter} · THE HUNT BEGINS` };
};

export const hunterSlotCount = (h: BbHunterState): number => {
  if (!h.hunterId) return 0;
  const def = BB_HUNTERS[h.hunterId];
  return def.sides[h.weaponSide].slots.length;
};

/** populate a tile's icons: consumable tokens + enemy spawns (p. 15) */
export const populateTile = (s: BbState, t: BbPlacedTile): void => {
  const def = tileDef(t.tileId);
  for (const sp of def.spaces) {
    const ref = spaceRef(t.uid, sp.id);
    for (const icon of sp.icons) {
      if (icon === 'consumable') {
        if (!s.consumableTokens.includes(ref)) s.consumableTokens.push(ref);
      } else if (icon === 'enemy1' || icon === 'enemy2' || icon === 'enemy3') {
        if (s.fogGates.includes(t.uid)) continue; // no spawns inside fog gates (p. 24)
        const type = s.enemySlots['enemy1' === icon ? 0 : icon === 'enemy2' ? 1 : 2];
        if (type) s.enemies.push({ uid: s.nextUid++, type, space: ref, damage: 0 });
      }
    }
  }
};

// ---------- spawning / hunt track / reset (shared by reducer + missions) ----------

/** spawn with the 4-mini pool rule (p. 15): beyond 4 on the map, relocate the
 * farthest-from-any-hunter mini of that type instead */
export const spawnEnemy = (s: BbState, type: string, space: BbSpaceRef, missionTag?: string): void => {
  if (!BB_ENEMIES[type]) throw new Error(`unknown enemy ${type}`);
  const at = parseRef(space);
  const placed = s.tiles.find((t) => t.uid === at.uid);
  if (!placed || !tileDef(placed.tileId).spaces.some((sp) => sp.id === at.space)) throw new Error(`unknown map space ${space}`);
  const onMap = s.enemies.filter((e) => e.type === type);
  if (onMap.length >= 4) {
    let best: BbEnemyOnMap | null = null, bestD = -1;
    // Ordinary spawn icons never steal a mission-critical miniature. If all
    // four copies are mission pieces, that ordinary spawn is skipped.
    // A mission batch asking for multiple copies must consume distinct spare
    // minis. Relocating a copy already carrying this tag would merely move the
    // first requested piece again and silently reduce the requested count.
    const movable = onMap.filter((e) => !e.missionTag);
    for (const e of movable) {
      const d = Math.min(...s.hunters.filter((h) => h.space).map((h) => bfsFrom(s, e.space, 'enemy').get(h.space!) ?? 999), 999);
      if (d > bestD || (d === bestD && best != null && e.uid < best.uid)) { bestD = d; best = e; }
    }
    if (best) { best.space = space; best.damage = 0; best.missionTag = missionTag; }
    return;
  }
  s.enemies.push({ uid: s.nextUid++, type, space, damage: 0, missionTag });
};

export const resetMap = (s: BbState): void => {
  s.lastEvent = { seq: s.lastEvent.seq + 1, text: 'THE BLOOD MOON RISES · THE MAP RESETS', kind: 'reset' };
  const missionEnemies = s.enemies.filter((e) => e.missionTag);
  s.enemies = [];
  for (const t of s.tiles) {
    for (const sp of tileDef(t.tileId).spaces) {
      const ref = spaceRef(t.uid, sp.id);
      if (sp.icons.includes('consumable') && !s.consumableTokens.includes(ref)) s.consumableTokens.push(ref);
    }
  }
  // Mission rules decide whether surviving special enemies heal/respawn; the
  // mission reset hook runs immediately after this base population pass.
  for (const e of missionEnemies) s.enemies.push({ ...e });
  const spawns: { ref: BbSpaceRef; type: string; d: number }[] = [];
  for (const t of s.tiles) {
    if (s.fogGates.includes(t.uid)) continue;
    for (const sp of tileDef(t.tileId).spaces) {
      for (const icon of sp.icons) {
        if (icon === 'enemy1' || icon === 'enemy2' || icon === 'enemy3') {
          const type = s.enemySlots[icon === 'enemy1' ? 0 : icon === 'enemy2' ? 1 : 2];
          if (!type) continue;
          const ref = spaceRef(t.uid, sp.id);
          const d = Math.min(...s.hunters.filter((h) => h.space).map((h) => bfsFrom(s, ref, 'enemy').get(h.space!) ?? 999), 999);
          spawns.push({ ref, type, d });
        }
      }
    }
  }
  spawns.sort((a, b) => a.d - b.d);
  for (const sp of spawns) spawnEnemy(s, sp.type, sp.ref);
  for (const b of s.bosses) b.damage = 0; // heal fully, keep phase (p. 24)
};

export const advanceTrack = (s: BbState): void => {
  if (s.huntTrack >= BB_HUNT_TRACK.length - 1) {
    resetMap(s); // final-space resetting (p. 24)
    return;
  }
  s.huntTrack++;
  if (BB_HUNT_TRACK.resets.includes(s.huntTrack)) resetMap(s);
};

// ---------- view ----------

export interface BbView {
  game: 'bloodborne';
  phase: BbState['phase'];
  outcome: BbState['outcome'];
  seats: BbState['seats'];
  you: number | null;
  campaignId: string;
  chapter: number;
  round: number;
  activeSeat: number | null;
  huntTrack: number;
  huntTrackLength: number;
  huntTrackResets: number[];
  finalRound: boolean;
  enemySlots: BbState['enemySlots'];
  enemySides: BbState['enemySides'];
  enemyActionsLeft: { basic: number; special: number; ability: number };
  upgradeRow: string[];
  upgradeDeckCount: number;
  consumableDeckCount: number;
  tiles: BbPlacedTile[];
  consumableTokens: BbSpaceRef[];
  insightTokens: Record<BbSpaceRef, number>;
  corpseTokens: BbSpaceRef[];
  survivorTokens: BbSpaceRef[];
  npcTokens: BbState['npcTokens'];
  fogGates: number[];
  brokenLamps: BbSpaceRef[];
  enemies: BbEnemyOnMap[];
  bosses: (Omit<BbBossOnMap, 'actionDeck' | 'actionDiscard'> & { actionsLeft: number })[];
  hunters: (Omit<BbHunterState, 'deck'> & { deckCount: number; hand: string[] })[];
  missions: Record<string, BbMissionInstance & { title?: string }>;
  insightCollected: number;
  insightCards: string[];
  specialRules: string[];
  pending: BbPending[];
  combat: BbCombat | null;
  lastCombatResult: BbCombatResult | null;
  lastEvent: BbEvent;
  pickedHunters: string[];
  tileDeckCount: number;
  /** movement in progress (device shows remaining steps) */
  moving: { seat: number; left: number } | null;
  /** active mission hooks (device surfaces bait / offering buttons) */
  missionHooks: Record<string, Record<string, unknown>>;
}

export const bbViewFor = (s: BbState, viewer: number | null | 'dev'): BbView => {
  const you = viewer === 'dev' ? 0 : viewer;
  const left = { basic: 0, special: 0, ability: 0 };
  for (const k of s.enemyActionDeck) left[k]++;
  return {
    game: 'bloodborne',
    phase: s.phase,
    outcome: s.outcome,
    seats: s.seats,
    you,
    campaignId: s.campaignId,
    chapter: s.chapter,
    round: s.round,
    activeSeat: s.activeSeat,
    huntTrack: s.huntTrack,
    huntTrackLength: BB_HUNT_TRACK.length,
    huntTrackResets: BB_HUNT_TRACK.resets,
    finalRound: s.finalRound,
    enemySlots: s.enemySlots,
    enemySides: s.enemySides,
    enemyActionsLeft: left,
    upgradeRow: s.upgradeRow,
    upgradeDeckCount: s.upgradeDeck.length,
    consumableDeckCount: s.consumableDeck.length,
    tiles: s.tiles,
    consumableTokens: s.consumableTokens,
    insightTokens: s.insightTokens,
    corpseTokens: s.corpseTokens,
    survivorTokens: s.survivorTokens,
    npcTokens: s.npcTokens,
    fogGates: s.fogGates,
    brokenLamps: s.brokenLamps,
    enemies: s.enemies,
    bosses: s.bosses.map((b) => ({ uid: b.uid, type: b.type, space: b.space, phase: b.phase, damage: b.damage, missionTag: b.missionTag, actionsLeft: b.actionDeck.length })),
    // The game is fully co-op (p. 14: hands MAY be hidden but showing them is
    // normal) — hands are public to all seats and the TV.
    hunters: s.hunters.map((h) => ({ ...h, deck: undefined, deckCount: h.deck.length } as unknown as BbView['hunters'][number])),
    missions: s.missions,
    insightCollected: s.insightCollected,
    insightCards: s.insightCards,
    specialRules: s.specialRules,
    pending: s.pending,
    combat: s.combat,
    lastCombatResult: s.lastCombatResult ?? null,
    lastEvent: s.lastEvent,
    pickedHunters: s.pickedHunters,
    tileDeckCount: s.tileDeck.length,
    moving: (() => {
      const m = (s as unknown as { moving?: { seat: number; left: number } | null }).moving;
      return m ? { seat: m.seat, left: m.left } : null;
    })(),
    missionHooks: ((s as unknown as { missionState?: { hooks?: Record<string, Record<string, unknown>> } }).missionState?.hooks) ?? {},
  };
};
