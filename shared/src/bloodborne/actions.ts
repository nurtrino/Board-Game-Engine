// Bloodborne — the reducer: hunter actions, combat resolution, the automatic
// enemy activation (owner directive: players never drive enemies), the
// Hunter's Dream, hunt-track resets, and round flow. Page refs = Core
// Rulebook v1.1 via docs/specs/bloodborne.md. Mission behaviour (arenas,
// escorts, counters, boss overrides) hooks in via missions.ts.

import { BB_MAX_HP, BB_MAX_ECHOES, BB_HAND_SIZE, BB_MOVE_SPACES, BB_MAX_TOOLS, BB_MAX_RUNES, BB_SPEED_RANK, type BbSpeed } from './config.js';
import {
  type BbState, type BbHunterState, type BbEnemyOnMap, type BbBossOnMap, type BbSpaceRef, type BbPending,
  bbRnd, bbShuffle, drawStat, drawConsumable, flipEnemyAction, refillUpgradeRow, setupChapter,
  spaceNeighbors, bfsFrom, connectedTiles, parseRef, spaceRef, tileDef, tileAt, worldExits, facing, edgeDelta, rotEdge,
  lampSpaces, hunterSlotCount, populateTile, spawnEnemy, resetMap, advanceTrack as advanceTrackBase,
} from './state.js';
import { BB_HUNTERS, BB_ENEMIES, BB_BOSSES, BB_TILES, BB_STAT_CARDS, BB_ITEMS, bbStatCard, bbItem, BB_HUNT_TRACK, type BbAttackDef, type BbEffects } from './data.js';
import { bbMissionOnReveal, bbMissionOnReset, bbMissionFinalizeHunt, bbMissionEvent, bbMissionInteractables, missionState, type BbBossMod } from './missions.js';

// ---------- actions ----------

export type BbAction =
  | { type: 'pick_hunter'; hunterId: string; side?: 0 | 1 }
  | { type: 'begin_turn' }
  | { type: 'move'; cardId: string }
  | { type: 'step'; to: BbSpaceRef }
  | { type: 'step_reveal'; edge: 'N' | 'E' | 'S' | 'W' }
  | { type: 'end_move' }
  | { type: 'interact'; cardId: string }
  | { type: 'transform'; cardId: string }
  | { type: 'dream'; cardId: string }
  | { type: 'attack'; cardId: string; slot: number; enemyUid?: number; bossUid?: number }
  | { type: 'use_consumable'; itemIx: number; target?: BbSpaceRef | number }
  | { type: 'use_firearm'; target?: number }
  | { type: 'use_reward'; rewardIx: number; target?: number | string }
  | { type: 'refresh_firearm'; discard: string[]; echo?: boolean }
  | { type: 'mission_discard'; cards: string[] } // discard consumables on a tile (mission hooks)
  | { type: 'mission_spawn' } // discard 1 consumable to spawn (Long Hunt 18)
  | { type: 'end_turn' }
  | { type: 'round_refresh'; discard: string[] }
  | { type: 'choose'; [k: string]: unknown }
  | { type: 'next_chapter' };

// Function declaration (not arrow) so TypeScript narrows after never-returning
// guard calls like `if (!x) err(...)`.
function err(m: string): never {
  throw new Error(m.replace(/\s+—\s+/g, ', ').replace(/^\p{Ll}/u, (c) => c.toUpperCase()));
}

const evt = (s: BbState, text: string, seat?: number, kind?: string): void => {
  s.lastEvent = { seq: s.lastEvent.seq + 1, text, seat, kind };
};

const hunterOf = (s: BbState, seat: number): BbHunterState => s.hunters[seat] ?? err('No such seat');

// ---------- side-channel state (kept off the interface) ----------

interface Moving { seat: number; left: number; path: BbSpaceRef[]; exitedEnemies: number[] }
interface Side {
  moving?: Moving | null;
  placing?: { tileId: string; x: number; y: number; edge: 'N' | 'E' | 'S' | 'W'; from: BbSpaceRef } | null;
  turnEnding?: boolean;
  pursuedIntoLastMove?: boolean;
  activatedThisTurn?: number[];
  roundEnding?: boolean;
  bossBonusQueue?: number[];
}
const side = (s: BbState): Side => s as unknown as Side;

// ---------- track (wrap: emit mission event) ----------

const advanceTrack = (s: BbState): void => {
  const before = s.huntTrack;
  const resets = before >= BB_HUNT_TRACK.length - 1 || BB_HUNT_TRACK.resets.includes(before + 1);
  advanceTrackBase(s);
  if (resets) bbMissionOnReset(s);
  if (s.huntTrack !== before) bbMissionEvent(s, { type: 'trackAdvanced', space: s.huntTrack });
};

// ---------- enemy defs with mission overrides ----------

const enemySideDef = (s: BbState, e: BbEnemyOnMap) => {
  const def = BB_ENEMIES[e.type];
  if (def.npc) {
    const small = def.sides[0].hp <= def.sides[1].hp ? 0 : 1;
    return def.sides[s.partySize <= 2 ? small : (1 - small)];
  }
  return def.sides[s.enemySides[e.type] ?? 0];
};

const enemyAttackOf = (s: BbState, e: BbEnemyOnMap, kind: 'basic' | 'special' | 'ability'): BbAttackDef => {
  const mod = e.missionTag ? missionState(s).enemyMods.find((m) => m.tag === e.missionTag) : undefined;
  const replaced = mod?.replace[kind] as BbAttackDef | undefined;
  return replaced ?? enemySideDef(s, e)[kind];
};

const enemyHp = (s: BbState, e: BbEnemyOnMap): number => enemySideDef(s, e).hp;

// ---------- damage / slaying ----------

const hunterSuffer = (s: BbState, h: BbHunterState, dmg: number, opts: { block?: number; attack?: boolean } = {}): boolean => {
  let d = dmg;
  if (h.frenzy && opts.attack) d += 1; // Frenzy applies to Attacks only (p. 21)
  d -= opts.block ?? 0;
  if (d <= 0) return false;
  h.hp = Math.max(0, h.hp - d);
  if (h.hp === 0) {
    slayHunter(s, h);
    return true;
  }
  return false;
};

const slayHunter = (s: BbState, h: BbHunterState): void => {
  evt(s, `${BB_HUNTERS[h.hunterId!]?.name ?? 'HUNTER'} SLAIN`, h.seat, 'death');
  // Caryll Rune: Moon — keep 1 echo, spent immediately in the Dream
  const moon = h.rewards.find((r) => !r.exhausted && ((bbItem(r.id).effects ?? {}) as { custom?: string }).custom === 'moon-keep-echo');
  const moonEcho = !!moon && h.echoes > 0;
  if (moon && moonEcho) moon.exhausted = true;
  h.echoes = 0; // lost BEFORE upgrades (p. 23)
  if (moonEcho) s.pending.push({ seat: h.seat, kind: 'dream-upgrades', picks: 1 });
  const wasActive = s.activeSeat === h.seat;
  if (wasActive) s.activationQueue = []; // sudden death (p. 17)
  s.combat = null;
  s.pending = s.pending.filter((p) => !(p.seat === h.seat && ['combat-attack', 'combat-dodge', 'combat-rider', 'discard-for-stun'].includes(p.kind)));
  if (!h.tookTurnThisRound && !wasActive) h.skipTurn = true;
  // carried mission tokens return / drop
  const ms = missionState(s);
  for (const tok of ms.tokens) {
    if (tok.carriedBy === h.seat) {
      tok.carriedBy = null;
      tok.space = tok.onLose === 'return' ? tok.homeSpace : h.space;
    }
  }
  (h as unknown as { carriedSurvivors?: number }).carriedSurvivors = 0;
  (h as unknown as { carriedCorpses?: number }).carriedCorpses = 0;
  goToDream(s, h, true);
  if (wasActive) {
    side(s).moving = null;
    finishTurn(s, true);
  }
};

const gainEcho = (s: BbState, h: BbHunterState, n = 1): void => {
  h.echoes = Math.min(BB_MAX_ECHOES, h.echoes + n);
};

const slayEnemy = (s: BbState, uid: number, bySeat: number | null): void => {
  const e = s.enemies.find((x) => x.uid === uid);
  if (!e) return;
  // mission hp pool: "instead of being slain, remove 1 token and heal" —
  // NOT slain for any purpose (FAQ)
  const mod = e.missionTag ? missionState(s).enemyMods.find((m) => m.tag === e.missionTag) : undefined;
  if (mod && mod.hpPool > 0) {
    mod.hpPool--;
    e.damage = 0;
    evt(s, `${BB_ENEMIES[e.type].name.toUpperCase()} SHRUGS OFF THE BLOW (${mod.hpPool} LEFT)`, bySeat ?? undefined, 'hp-pool');
    return;
  }
  const space = e.space;
  s.enemies = s.enemies.filter((x) => x.uid !== uid);
  s.activationQueue = s.activationQueue.filter((q) => q !== uid);
  if (bySeat != null) {
    const h = s.hunters[bySeat];
    gainEcho(s, h);
    evt(s, `${BB_ENEMIES[e.type].name.toUpperCase()} SLAIN`, bySeat, 'kill');
    const def = BB_HUNTERS[h.hunterId!];
    const fx = def.sides[h.weaponSide].effects;
    const rewardIxs = h.rewards.flatMap((r, ix) => {
      const rfx = (bbItem(r.id).effects ?? {}) as { onKill?: boolean };
      return !r.exhausted && rfx.onKill ? [ix] : [];
    });
    // On-Kill healing/draws cannot rescue a hunter slain simultaneously. Keep
    // them on the combat record and resolve only if the hunter survives.
    if (s.combat?.seat === bySeat) {
      const c = s.combat as unknown as { deferredOnKillDraw?: number; deferredOnKillHeal?: number; deferredOnKillRewards?: number[] };
      c.deferredOnKillDraw = (c.deferredOnKillDraw ?? 0) + (fx?.onKillDraw ?? 0);
      c.deferredOnKillHeal = (c.deferredOnKillHeal ?? 0) + (fx?.onKillHeal ?? 0);
      c.deferredOnKillRewards = [...(c.deferredOnKillRewards ?? []), ...rewardIxs];
    } else {
      if (fx?.onKillDraw) for (let i = 0; i < fx.onKillDraw; i++) { const card = drawStat(s, h); if (card) h.hand.push(card); }
      if (fx?.onKillHeal) h.hp = Math.min(BB_MAX_HP, h.hp + fx.onKillHeal);
      for (const rewardIx of rewardIxs) s.pending.push({ seat: bySeat, kind: 'onkill-reward', rewardIx });
    }
  }
  bbMissionEvent(s, { type: 'enemySlain', enemyType: e.type, missionTag: e.missionTag, bySeat, space });
};

// ---------- the Hunter's Dream (p. 23-24) ----------

const goToDream = (s: BbState, h: BbHunterState, slain: boolean): void => {
  h.space = null;
  advanceTrack(s);
  h.deck = [...h.deck, ...h.discard, ...h.hand, ...h.slots.filter(Boolean) as string[]];
  h.discard = [];
  h.hand = [];
  h.slots = h.slots.map(() => null);
  if (!slain && h.echoes > 0) {
    s.pending.push({ seat: h.seat, kind: 'dream-upgrades', picks: h.echoes });
    h.echoes = 0;
  }
  h.deck = bbShuffle(s, h.deck);
  h.firearmExhausted = false;
  for (const r of h.rewards) r.exhausted = false;
  h.poison = false;
  h.frenzy = false;
  h.hp = BB_MAX_HP;
  h.pendingReturn = true;
  evt(s, "TO THE HUNTER'S DREAM", h.seat, 'dream');
};

// ---------- combat ----------

interface CombatStart {
  seat: number;
  enemyUid?: number;
  bossUid?: number;
  hunterAttack?: { cardId: string; slot: number } | null;
  noResponse?: boolean;
  block?: number;
}

export const startCombat = (s: BbState, c: CombatStart): void => {
  const source = c.enemyUid != null
    ? s.enemies.find((enemy) => enemy.uid === c.enemyUid)?.space
    : s.bosses.find((boss) => boss.uid === c.bossUid)?.space;
  s.combat = {
    seat: c.seat,
    enemyUid: c.enemyUid ?? null,
    bossUid: c.bossUid ?? null,
    sourceSpace: source ?? null,
    attack: c.hunterAttack ?? null,
    enemyAction: null,
    dodge: null,
    noResponse: c.noResponse ?? false,
    enemySpeedBonus: 0, hunterSpeedBonus: 0, enemyDmgBonus: 0, hunterDmgBonus: 0,
    blockPending: c.block ?? 0,
    enemyStagger: false,
    resolved: false,
  };
  if (c.noResponse) {
    combatFlip(s);
    if (s.combat) combatResolve(s);
    return;
  }
  if (!c.hunterAttack) {
    s.pending.unshift({ seat: c.seat, kind: 'combat-attack' }); // step 1 (p. 19)
  } else {
    combatFlip(s);
    if (s.combat) queueCombatReaction(s);
  }
};

/** step 2: flip the enemy/boss action (p. 20) */
const combatFlip = (s: BbState): void => {
  const c = s.combat!;
  if (c.bossUid != null) {
    const b = s.bosses.find((x) => x.uid === c.bossUid)!;
    if (b.actionDeck.length === 0) {
      b.actionDeck = bbShuffle(s, b.actionDiscard);
      b.actionDiscard = [];
    }
    const ix = b.actionDeck.shift()!;
    b.actionDiscard.push(ix);
    c.enemyAction = { kind: 'basic', bossCardIx: ix };
    // boss onFlip hooks (Summon the Pack)
    const bmod = missionState(s).bossMods[b.type];
    const act = BB_BOSSES[b.type].phases[b.phase - 1][ix];
    if (bmod?.onFlip && act.name.toLowerCase() === bmod.onFlip.card.toLowerCase()) {
      const eid = Object.keys(BB_ENEMIES).find((k) => BB_ENEMIES[k].name.toLowerCase() === bmod.onFlip!.spawn.toLowerCase());
      if (eid) s.enemies.push({ uid: s.nextUid++, type: eid, space: b.space, damage: 0 });
    }
  } else {
    c.enemyAction = { kind: flipEnemyAction(s) };
  }
  applyImmediateAbility(s);
};

const enemyActionDef = (s: BbState): BbAttackDef => {
  const c = s.combat!;
  if (c.bossUid != null) {
    const b = s.bosses.find((x) => x.uid === c.bossUid)!;
    return BB_BOSSES[b.type].phases[b.phase - 1][c.enemyAction!.bossCardIx!];
  }
  const e = s.enemies.find((x) => x.uid === c.enemyUid)!;
  return enemyAttackOf(s, e, c.enemyAction!.kind === 'basic' ? 'basic' : c.enemyAction!.kind === 'special' ? 'special' : 'ability');
};

const isAbilityAction = (act: BbAttackDef, kind: string): boolean =>
  kind === 'ability' || !!act.isAbility || act.speed == null;

/** abilities with no printed speed resolve immediately when flipped (p. 20) */
const applyImmediateAbility = (s: BbState): void => {
  const c = s.combat!;
  const act = enemyActionDef(s);
  if (!isAbilityAction(act, c.enemyAction!.kind) || act.speed != null) return;
  resolveRider(s, act, 'ability');
};

const resolveRider = (s: BbState, act: BbAttackDef, phase: 'ability' | 'attack'): void => {
  const c = s.combat;
  if (!c) return;
  const h = s.hunters[c.seat];
  const r = act.rider as (BbAttackDef['rider'] & { kind: string }) | undefined;
  const flags = (act as unknown as { flags?: Record<string, unknown> }).flags ?? {};
  const traits = enemyAttackTraits(act, h);
  const riderDodge = r?.kind === 'dodge-or-suffer' || flags.dodgeOrSuffer === true;
  const alreadyPoisoned = h.poison;
  const alreadyFrenzied = h.frenzy;
  // Dodge-or-suffer statuses apply only on a failed Dodge, not when the card
  // flips. Other attack riders have already hit the combat Hunter here.
  if (!riderDodge) {
    if (flags.stun) queueStun(s, h);
    if (flags.poison) h.poison = true;
    if (flags.frenzy) h.frenzy = true;
    if (traits.poison) h.poison = true;
    if (traits.frenzy) h.frenzy = true;
    if (traits.stun) queueStun(s, h);
  }
  if (!r && flags.dodgeOrSuffer !== true) return;
  if (!r && flags.dodgeOrSuffer === true) {
    queueRiderDodge(s, h, (act.speed ?? 'slow') as BbSpeed, act.damage, riderHitOptions(act, combatSourceSpace(s)));
    if (act.speed == null) queueSecondaryAttackTargets(s, act);
    return;
  }
  if (!r) return;
  switch (r.kind) {
    case 'flip-another': {
      // The bonus belongs to the printed card that caused the additional
      // flip; it is not a universal +damage/Stagger rider.
      if (act.name.toUpperCase() === 'MOB FRENZY') { c.enemySpeedBonus += 1; c.enemyDmgBonus += 1; }
      if (act.name.toUpperCase() === 'FERAL RAGE') { c.enemyDmgBonus += 1; c.enemyStagger = true; }
      combatFlip(s);
      break;
    }
    case 'poison':
      h.poison = true;
      break;
    case 'frenzy':
      // Horrific Visions replaces Frenzy with Stun if already Frenzied.
      if (alreadyFrenzied) queueStun(s, h);
      else h.frenzy = true;
      if (/Flip another Enemy Action/i.test(r.text ?? '')) combatFlip(s);
      break;
    case 'stun':
      // Ashen Toxin only Stuns a hunter who was already Poisoned.
      if (act.name.toUpperCase() === 'ASHEN TOXIN') {
        h.poison = true;
        if (alreadyPoisoned) queueStun(s, h);
      } else if (!traits.stun) queueStun(s, h);
      break;
    case 'dodge-or-suffer': {
      const need = (r.speed ?? 'slow') as BbSpeed;
      // These Boss riders explicitly hit only the other Hunters; applying the
      // rider to the combat Hunter would double-damage the primary target.
      if (!/all other Hunters/i.test(r.text ?? act.text ?? '')) {
        queueRiderDodge(s, h, need, r.damage ?? 2, riderHitOptions(act, combatSourceSpace(s)));
      }
      if (act.speed == null) queueSecondaryAttackTargets(s, act);
      if (/Flip another (?:Enemy|Boss) Action/i.test(r.text ?? act.text ?? '')) combatFlip(s);
      break;
    }
    case 'on-slain-dodge-or-suffer':
      break; // handled at slaying time via combat context
    default:
      break; // display-only
  }
  void phase;
};

const queueStun = (s: BbState, h: BbHunterState): void => {
  if (h.hand.length === 0) hunterSuffer(s, h, 1);
  else s.pending.unshift({ seat: h.seat, kind: 'discard-for-stun' });
};

interface RiderHitOptions {
  stun?: boolean;
  poison?: boolean;
  frenzy?: boolean;
  push?: number;
  source?: BbSpaceRef;
}

const pushHunterAway = (s: BbState, h: BbHunterState, from: BbSpaceRef, steps: number): void => {
  if (!h.space) return;
  for (let i = 0; i < steps; i++) {
    const options = spaceNeighbors(s, h.space, 'hunter');
    if (!options.length) break;
    const distance = bfsFrom(s, from, 'hunter');
    const best = [...options].sort((a, b) => (distance.get(b) ?? 0) - (distance.get(a) ?? 0) || (a < b ? -1 : 1))[0];
    if ((distance.get(best) ?? 0) < (distance.get(h.space) ?? 0)) break;
    h.space = best;
  }
};

const applyRiderHit = (s: BbState, h: BbHunterState, damage: number, opts: RiderHitOptions): void => {
  const slain = hunterSuffer(s, h, damage, { attack: true });
  if (slain || !h.space) return;
  if (opts.poison) h.poison = true;
  if (opts.frenzy) h.frenzy = true;
  if (opts.push && opts.source) pushHunterAway(s, h, opts.source, opts.push);
  if (opts.stun) queueStun(s, h);
};

const queueRiderDodge = (s: BbState, h: BbHunterState, speed: BbSpeed, damage: number, opts: RiderHitOptions = {}): void => {
  if (s.combat?.noResponse) {
    applyRiderHit(s, h, damage, opts);
    return;
  }
  const need = BB_SPEED_RANK[speed];
  const canDodge = h.hand.some((id) => {
    const card = BB_STAT_CARDS[id];
    if (!card?.effects.dodge || !h.hunterId) return false;
    return h.slots.some((filled, slot) => filled == null
      && BB_SPEED_RANK[BB_HUNTERS[h.hunterId!].sides[h.weaponSide].slots[slot].speed] + (card.effects.speedBonus ?? 0) >= need);
  });
  if (canDodge) {
    s.pending.unshift({ seat: h.seat, kind: 'combat-rider', rider: 'dodge-or-suffer', speed, damage, ...opts });
  } else {
    applyRiderHit(s, h, damage, opts);
  }
};

interface EnemyAttackTraits {
  stagger: boolean;
  staggerTies: boolean;
  stun: boolean;
  poison: boolean;
  frenzy: boolean;
  cannotDodge: boolean;
  cannotStagger: boolean;
  exactDodgeSpeed: BbSpeed | null;
}

/** High-frequency printed keywords shared by Enemy and Boss actions. Keeping
 * the verbatim text as the source also covers transcribed expansion cards. */
const enemyAttackTraits = (act: BbAttackDef, h?: BbHunterState): EnemyAttackTraits => {
  const text = act.text ?? act.rider?.text ?? '';
  const lines = text.split(/\r?\n/).map((line) => line.trim().replace(/[.!]$/, ''));
  const line = (keyword: string): boolean => lines.some((x) => x.toLowerCase() === keyword.toLowerCase());
  const exact = /Can only be Dodged with \{(fast|medium|slow)\} slots/i.exec(text)?.[1] as BbSpeed | undefined;
  return {
    stagger: line('Stagger'),
    staggerTies: /Staggers Attacks of the same Speed/i.test(text),
    stun: line('Stun'),
    poison: line('Poison'),
    frenzy: line('Frenzy'),
    cannotDodge: /Cannot be Dodged/i.test(text) || (!!h?.poison && /already Poisoned[^.]*cannot Dodge/is.test(text)),
    cannotStagger: /Cannot be Staggered/i.test(text),
    exactDodgeSpeed: exact ?? null,
  };
};

const combatSourceSpace = (s: BbState): BbSpaceRef | undefined => {
  const c = s.combat;
  if (!c) return undefined;
  return c.sourceSpace
    ?? (c.enemyUid != null ? s.enemies.find((e) => e.uid === c.enemyUid) : s.bosses.find((b) => b.uid === c.bossUid))?.space;
};

const riderHitOptions = (act: BbAttackDef, source?: BbSpaceRef, secondary = false): RiderHitOptions => {
  const flags = (act as unknown as { flags?: Record<string, unknown> }).flags ?? {};
  const text = act.text ?? act.rider?.text ?? '';
  const otherIx = secondary ? text.search(/all other Hunters/i) : -1;
  const effectText = otherIx >= 0 ? text.slice(otherIx) : text;
  const traits = enemyAttackTraits(act);
  const allOtherClause = otherIx >= 0;
  const pushMatch = /moved?\s+(\d+)\s+spaces?\s+away/i.exec(effectText);
  return {
    stun: flags.stun === true || /(?:and|suffer)\s+Stun/i.test(effectText) || (!allOtherClause && traits.stun),
    poison: flags.poison === true || /(?:and|suffer)\s+Poison/i.test(effectText) || (!allOtherClause && traits.poison),
    frenzy: flags.frenzy === true || /(?:and|suffer)\s+Frenzy/i.test(effectText) || (!allOtherClause && traits.frenzy),
    push: Number(flags.pushOneSpace ? 1 : flags.pushTwoSpaces ? 2 : pushMatch?.[1] ?? 0) || undefined,
    source,
  };
};

/** Queue the independent Dodge/hit resolution for every non-primary Hunter
 * covered by printed AoE targeting or a mission replacement's structured
 * target flags. */
const queueSecondaryAttackTargets = (s: BbState, act: BbAttackDef): void => {
  const c = s.combat;
  const source = combatSourceSpace(s);
  if (!c || !source) return;
  const text = act.text ?? act.rider?.text ?? '';
  const flags = (act as unknown as { flags?: Record<string, unknown> }).flags ?? {};
  const allOther = /all other Hunters/i.test(text);
  const allInSpace = /(?:Targets|All) all Hunters in this space/i.test(text)
    || /All Hunters in this space/i.test(text)
    || flags.targetsAllOnSpace === true;
  const allOnTile = flags.targetsAllOnTile === true;
  const withinOne = flags.targetsWithin1 === true;
  if (!allOther && !allInSpace && !allOnTile && !withinOne) return;

  const sourceTile = parseRef(source).uid;
  const distance = withinOne ? bfsFrom(s, source, 'hunter') : null;
  const targets = s.hunters.filter((hunter) => {
    if (hunter.seat === c.seat || !hunter.space) return false;
    if (withinOne) return (distance?.get(hunter.space) ?? 99) <= 1;
    if (allOnTile) return parseRef(hunter.space).uid === sourceTile;
    return hunter.space === source;
  }).sort((a, b) => b.seat - a.seat); // unshift below leaves lowest seat first

  const rider = act.rider as { kind?: string; speed?: BbSpeed; damage?: number } | undefined;
  const directOther = /(?:Deals?\s+)(\d+)\s+\{dmg\}\s+to all other Hunters/i.exec(text)?.[1];
  const sufferOther = /all other Hunters[^.]*?(?:or\s+)?suffer\s+(\d+)\s+\{dmg\}/is.exec(text)?.[1];
  const sufferAll = /All Hunters[^.]*?(?:or\s+)?suffer\s+(\d+)\s+\{dmg\}/is.exec(text)?.[1];
  const damage = Number(directOther ?? sufferOther ?? sufferAll
    ?? ((rider?.kind === 'dodge-or-suffer' && rider.damage != null) ? rider.damage : act.damage));
  const speedMatch = /Dodge\s*\(\{(fast|medium|slow)\}\)/i.exec(text)?.[1] as BbSpeed | undefined;
  const speed = speedMatch ?? rider?.speed ?? act.speed ?? 'slow';
  const offersDodge = !!speedMatch || act.speed != null || flags.dodgeOrSuffer === true;
  const opts = riderHitOptions(act, source, true);
  for (const hunter of targets) {
    if (offersDodge) queueRiderDodge(s, hunter, speed, damage, opts);
    else applyRiderHit(s, hunter, damage, opts);
  }
};

/** The enemy card is now public, but attacks have not resolved. Keeping this
 * explicit even when no Dodge is legal gives reaction firearms and On Attack
 * consumables/rewards their printed timing window. */
const queueCombatReaction = (s: BbState): void => {
  const c = s.combat;
  if (!c || c.noResponse || c.resolved) return;
  s.pending.push({ seat: c.seat, kind: 'combat-reaction' });
};

/** step 3: dodge window (p. 20) */
const maybeQueueDodge = (s: BbState): void => {
  const c = s.combat!;
  const targetExists = c.enemyUid != null
    ? s.enemies.some((enemy) => enemy.uid === c.enemyUid)
    : s.bosses.some((boss) => boss.uid === c.bossUid);
  if (!targetExists) {
    combatResolve(s);
    return;
  }
  const act = enemyActionDef(s);
  const isAttack = !isAbilityAction(act, c.enemyAction!.kind);
  const h = s.hunters[c.seat];
  const traits = enemyAttackTraits(act, h);
  const needRank = speedRank(act.speed, c.enemySpeedBonus);
  const canDodge = h.hand.some((id) => {
    const card = BB_STAT_CARDS[id];
    if (!card?.effects.dodge) return false;
    return h.slots.some((filled, slot) => {
      if (filled !== null) return false;
      const printed = BB_HUNTERS[h.hunterId!].sides[h.weaponSide].slots[slot]?.speed;
      if (!printed) return false;
      const rank = BB_SPEED_RANK[printed] + (card.effects.speedBonus ?? 0);
      return traits.exactDodgeSpeed ? rank === BB_SPEED_RANK[traits.exactDodgeSpeed] : rank >= needRank;
    });
  });
  if (isAttack && canDodge && !traits.cannotDodge && !c.noResponse) {
    s.pending.unshift({ seat: c.seat, kind: 'combat-dodge', speed: needRank });
  } else {
    combatResolve(s);
  }
};

const speedRank = (sp: BbSpeed | null, bonus: number): number => (sp == null ? 99 : Math.max(0, BB_SPEED_RANK[sp] + bonus));

/** step 4: resolve both attacks by speed (p. 20-21) */
const combatResolve = (s: BbState): void => {
  const c = s.combat!;
  if (c.resolved) return;
  c.resolved = true;
  const h = s.hunters[c.seat];
  const enemy = c.enemyUid != null ? s.enemies.find((x) => x.uid === c.enemyUid) : null;
  const boss = c.bossUid != null ? s.bosses.find((x) => x.uid === c.bossUid) : null;
  if (!enemy && !boss) {
    finishCombat(s, c);
    return;
  }
  const act = enemyActionDef(s);
  const stripped = !!(c as unknown as { stripEffects?: boolean }).stripEffects;
  const firearmCancel = !!(c as unknown as { firearmCancel?: boolean }).firearmCancel;
  const flags = stripped ? {} : (act as unknown as { flags?: Record<string, unknown> }).flags ?? {};
  const enemyIsAbility = isAbilityAction(act, c.enemyAction!.kind);
  const blockPending = c.blockPending;

  // hunter attack numbers (a stat card in a slot, or a firearm attack)
  let hAtk: { rank: number; dmg: number; stagger: boolean; splash?: number } | null = null;
  const gunAttack = (c as unknown as { firearmAttack?: { speed: BbSpeed; damage: number; stagger?: boolean; splash?: number } }).firearmAttack;
  if (gunAttack) {
    hAtk = { rank: speedRank(gunAttack.speed, c.hunterSpeedBonus), dmg: gunAttack.damage + c.hunterDmgBonus, stagger: !!gunAttack.stagger, splash: gunAttack.splash };
  } else if (c.attack) {
    const def = BB_HUNTERS[h.hunterId!];
    const slotDef = def.sides[h.weaponSide].slots[c.attack.slot];
    const card = bbStatCard(c.attack.cardId);
    const fx: BbEffects = card.effects ?? {};
    const slotFx = slotDef.effects ?? {};
    let dmg = slotDef.damage + (fx.dmgBonus ?? 0) + c.hunterDmgBonus;
    if (h.gemSlot === c.attack.slot) dmg += 1; // Blood Stone Shard
    const stagger = !!fx.stagger || !!slotFx.stagger || !!(c as unknown as { hunterStagger?: boolean }).hunterStagger;
    if (stagger && def.sides[h.weaponSide].effects?.staggerBonusDmg) dmg += def.sides[h.weaponSide].effects!.staggerBonusDmg!;
    if (flags.blockFromHunter) dmg = Math.max(0, dmg - Number(flags.blockFromHunter));
    hAtk = { rank: speedRank(slotDef.speed, (fx.speedBonus ?? 0) + c.hunterSpeedBonus), dmg, stagger };
  }
  // enemy attack numbers
  let eAtk: { rank: number; dmg: number } | null = null;
  if (!enemyIsAbility && !firearmCancel) {
    let dmg = act.damage + c.enemyDmgBonus;
    if (flags.bonusIfSelfDamaged && (enemy?.damage ?? boss?.damage ?? 0) > 0) dmg += Number(flags.bonusIfSelfDamaged);
    eAtk = { rank: speedRank(act.speed, c.enemySpeedBonus), dmg };
  } else if (enemyIsAbility && act.speed != null && !firearmCancel) {
    eAtk = { rank: speedRank(act.speed, c.enemySpeedBonus) + 0.25, dmg: 0 }; // before hunter's attack on tie (FAQ)
  }

  const dodged = !!c.dodge;
  const events: { who: 'hunter' | 'enemy'; rank: number }[] = [];
  if (hAtk) events.push({ who: 'hunter', rank: hAtk.rank });
  if (eAtk) events.push({ who: 'enemy', rank: eAtk!.rank });
  events.sort((a, b) => b.rank - a.rank);
  const groups: { rank: number; whos: ('hunter' | 'enemy')[] }[] = [];
  for (const e of events) {
    const g = groups.find((x) => x.rank === e.rank);
    if (g) g.whos.push(e.who);
    else groups.push({ rank: e.rank, whos: [e.who] });
  }

  let enemyGone = false;
  let enemyCancelled = false;
  let hunterCancelled = false;
  let hunterAttackResolved = false;
  let hunterDied = false;
  const traits = enemyAttackTraits(act, h);
  for (const g of groups) {
    const enemyExecutes = g.whos.includes('enemy') && !enemyCancelled && !enemyGone && eAtk;
    const enemyActs = enemyExecutes && !dodged;
    if (enemyActs && !stripped && traits.staggerTies && hAtk && hAtk.rank === eAtk!.rank) hunterCancelled = true;
    const hunterActs = g.whos.includes('hunter') && !hunterCancelled && !hunterDied && hAtk;
    // hunter side
    if (hunterActs) {
      hunterAttackResolved = true;
      const target = enemy ?? boss;
      if (target && !missionInvulnerable(s, boss)) {
        applyDamageToEnemy(s, target, hAtk!.dmg, c.seat, act);
        // Flamesprayer splash: 1 dmg to all OTHER enemies in the space
        if (hAtk!.splash && h.space) {
          for (const other of [...s.enemies]) {
            if (other.space === h.space && other.uid !== enemy?.uid) applyDamageToEnemy(s, other, hAtk!.splash!, c.seat);
          }
        }
        enemyGone = enemy ? !s.enemies.some((x) => x.uid === enemy.uid) : !s.bosses.some((x) => x.uid === boss!.uid);
        // stagger cancels SLOWER opposing attacks (p. 21); Oedon Writhe also ties
        const tiesToo = !!(c as unknown as { staggerTies?: boolean }).staggerTies;
        if (hAtk!.stagger && eAtk && (stripped || !traits.cannotStagger) && !flags.noStagger && (eAtk.rank < g.rank || (tiesToo && eAtk.rank === g.rank))) enemyCancelled = true;
        if (enemyGone && eAtk && eAtk.rank < g.rank) enemyCancelled = true; // dead before acting
      } else if (target && missionInvulnerable(s, boss)) {
        evt(s, `${BB_BOSSES[boss!.type].name.toUpperCase()} CANNOT BE HARMED`, c.seat, 'invulnerable');
      }
    }
    // enemy side (same rank = simultaneous: both apply, p. 20)
    if (enemyExecutes) {
      if (enemyActs && !enemyIsAbility) {
        hunterDied = hunterSuffer(s, h, eAtk!.dmg, { block: blockPending, attack: true });
        if (!hunterDied && !stripped && (traits.stagger || c.enemyStagger) && hAtk && (hAtk.rank < eAtk!.rank || (traits.staggerTies && hAtk.rank === eAtk!.rank))) {
          hunterCancelled = true;
        }
        if (!hunterDied && !stripped) {
          resolveRider(s, act, 'attack');
          hunterDied = h.space == null;
        }
      } else if (enemyActs && !stripped) {
        resolveRider(s, act, 'ability'); // speed-listed ability fires now
        hunterDied = h.space == null;
      }
      if (!stripped) queueSecondaryAttackTargets(s, act);
      if (hunterDied) break;
    }
  }
  const finalRider = act.rider as { kind?: string } | undefined;
  if (!hunterDied && !stripped && finalRider?.kind === 'dodge-or-suffer' && (dodged || enemyCancelled)) {
    resolveRider(s, act, 'attack');
    hunterDied = h.space == null;
  }
  if (!hunterDied) {
    const deferred = c as unknown as { deferredOnKillDraw?: number; deferredOnKillHeal?: number; deferredOnKillRewards?: number[] };
    for (let i = 0; i < (deferred.deferredOnKillDraw ?? 0); i++) { const card = drawStat(s, h); if (card) h.hand.push(card); }
    if (deferred.deferredOnKillHeal) h.hp = Math.min(BB_MAX_HP, h.hp + deferred.deferredOnKillHeal);
    for (const rewardIx of deferred.deferredOnKillRewards ?? []) s.pending.push({ seat: h.seat, kind: 'onkill-reward', rewardIx });
    if (hunterAttackResolved && c.attack) {
      const match = /After Attack:?\s*Heal\s+(\d+)/i.exec(bbStatCard(c.attack.cardId).text);
      if (match) h.hp = Math.min(BB_MAX_HP, h.hp + Number(match[1]));
    }
  }
  // Caryll Rune: Hunter — free transform after the attack
  if ((c as unknown as { freeTransformAfter?: boolean }).freeTransformAfter && !hunterDied) {
    for (const cardIx of h.slots) if (cardIx) h.discard.push(cardIx);
    h.weaponSide = h.weaponSide === 0 ? 1 : 0;
    h.slots = new Array(hunterSlotCount(h)).fill(null);
    h.gemSlot = null;
    evt(s, 'TRICK WEAPON TRANSFORMED FREELY', c.seat, 'transform');
  }
  finishCombat(s, c);
};

/** Every terminal combat path emits combatEnd and flushes deferred Hunt
 * completion, including targets killed by an item/reaction before resolution. */
const finishCombat = (s: BbState, c: BbState['combat'] & {}): void => {
  if (s.combat === c) s.combat = null;
  bbMissionEvent(s, { type: 'combatEnd', seat: c.seat });
  bbMissionFinalizeHunt(s);
};

const missionInvulnerable = (s: BbState, boss: BbBossOnMap | null | undefined): boolean =>
  !!boss && !!missionState(s).bossMods[boss.type]?.invulnerable;

const applyDamageToEnemy = (s: BbState, target: BbEnemyOnMap | BbBossOnMap, dmg: number, bySeat: number, sourceAct?: BbAttackDef): void => {
  if (dmg <= 0) return;
  if ('phase' in target) {
    const def = BB_BOSSES[target.type];
    const cap = def.hp[target.phase - 1][String(s.partySize) as '1' | '2' | '3' | '4'];
    target.damage += dmg;
    if (target.damage >= cap) {
      if (target.phase === 1) {
        target.phase = 2;
        target.damage = 0; // excess doesn't carry (p. 23)
        target.actionDeck = bbShuffle(s, def.phases[1].map((_, i) => i));
        target.actionDiscard = [];
        evt(s, `${def.name.toUpperCase()} · PHASE 2`, undefined, 'boss-phase');
        bbMissionEvent(s, { type: 'bossPhase2', boss: target.type });
      } else {
        s.bosses = s.bosses.filter((b) => b.uid !== target.uid);
        gainEcho(s, s.hunters[bySeat]);
        evt(s, `${def.name.toUpperCase()} SLAIN`, bySeat, 'boss-kill');
        bbMissionEvent(s, { type: 'bossSlain', boss: target.type, bySeat });
      }
    }
  } else {
    target.damage += dmg;
    if (target.damage >= enemyHp(s, target)) {
      // on-slain riders (Blood Frenzy / Ravage): dodge or suffer, THEN slay
      const r = sourceAct ? undefined : undefined;
      void r;
      const pendingRider = currentOnSlainRider(s, target);
      slayEnemy(s, target.uid, bySeat);
      if (pendingRider && s.hunters[bySeat].hp > 0 && !s.enemies.some((x) => x.uid === target.uid)) {
        queueRiderDodge(s, s.hunters[bySeat], (pendingRider.speed ?? 'slow') as BbSpeed, pendingRider.damage ?? 3);
      }
    }
  }
};

/** an enemy whose replaced special has an on-slain rider punishes its killer */
const currentOnSlainRider = (s: BbState, e: BbEnemyOnMap): { speed?: string; damage?: number } | null => {
  const c = s.combat;
  if (!c || c.enemyUid !== e.uid || !c.enemyAction) return null;
  const act = enemyAttackOf(s, e, c.enemyAction.kind === 'basic' ? 'basic' : c.enemyAction.kind === 'special' ? 'special' : 'ability');
  const r = act.rider as { kind?: string; speed?: string; damage?: number } | undefined;
  return r?.kind === 'on-slain-dodge-or-suffer' ? r : null;
};

// ---------- automatic enemy activation (owner directive) ----------

const activationCandidates = (s: BbState, seat: number): number[] => {
  const h = s.hunters[seat];
  if (!h.space) return [];
  const { uid } = parseRef(h.space);
  const range = new Set([uid, ...connectedTiles(s, uid)]);
  const inRange = (ref: BbSpaceRef) => range.has(parseRef(ref).uid);
  const slotOrder = (type: string): number => {
    const ix = s.enemySlots.indexOf(type);
    return ix === -1 ? 3 : ix;
  };
  // Messenger's Gift: non-boss enemies skip the activation after this turn
  const suppressedTurn = !!(h as unknown as { suppressActivation?: boolean }).suppressActivation;
  const list = s.enemies
    .filter((e) => inRange(e.space))
    .filter((e) => !suppressedTurn && !(e as unknown as { suppressed?: boolean }).suppressed)
    .sort((a, b) => slotOrder(a.type) - slotOrder(b.type) || a.uid - b.uid);
  const bosses = s.bosses.filter((b) => inRange(b.space));
  return [...list.map((e) => e.uid), ...bosses.map((b) => b.uid)];
};

const buildActivationQueue = (s: BbState, seat: number): void => {
  side(s).activatedThisTurn = [];
  s.activationQueue = activationCandidates(s, seat);
};

/** Rulebook p. 17 "Surprise Enemies": pieces spawned or moved into range
 * during the activation are appended even if their normal slot has passed. */
const appendSurpriseActivations = (s: BbState): void => {
  if (s.activeSeat == null) return;
  const seen = new Set(side(s).activatedThisTurn ?? []);
  const queued = new Set(s.activationQueue);
  for (const uid of activationCandidates(s, s.activeSeat)) {
    if (!seen.has(uid) && !queued.has(uid)) {
      s.activationQueue.push(uid);
      queued.add(uid);
    }
  }
};

const pumpActivation = (s: BbState): void => {
  if (!side(s).turnEnding) return;
  let guard = 0;
  while (!s.combat && s.pending.length === 0 && s.activeSeat != null && s.phase === 'play' && guard++ < 200) {
    appendSurpriseActivations(s);
    if (s.activationQueue.length === 0) break;
    const uid = s.activationQueue.shift()!;
    const activated = side(s).activatedThisTurn ?? (side(s).activatedThisTurn = []);
    if (!activated.includes(uid)) activated.push(uid);
    const h = s.hunters[s.activeSeat];
    if (!h.space) { s.activationQueue = []; break; } // sudden death (p. 17)
    const enemy = s.enemies.find((e) => e.uid === uid);
    const boss = s.bosses.find((b) => b.uid === uid);
    if (!enemy && !boss) continue;
    const piece = (enemy ?? boss)!;
    if (piece.space !== h.space) {
      const moves = enemy ? 1 + (enemySideDef(s, enemy).passiveEffects?.moveBonus ?? 0) : 1;
      for (let i = 0; i < moves && piece.space !== h.space; i++) {
        const step = stepToward(s, piece.space, h.space);
        if (!step) break;
        const sharing = s.hunters.some((x) => x.seat !== h.seat && x.space === piece.space);
        if (sharing && step !== h.space) break; // p. 16
        if (enemy && s.hunters.some((x) => x.space === step) && torchSentry(s, enemy, step)) break;
        if (!s.enemies.some((x) => x.uid === uid) && !s.bosses.some((x) => x.uid === uid)) break; // torch killed it
        piece.space = step;
        if (boss) bbMissionEvent(s, { type: 'bossMoved', boss: boss.type, tileUid: parseRef(boss.space).uid });
      }
    }
    if (piece.space === h.space) {
      rifleSentry(s, piece);
      const stillHere = enemy ? s.enemies.some((x) => x.uid === enemy.uid) : s.bosses.some((x) => x.uid === boss!.uid);
      if (stillHere && piece.space === h.space) startCombat(s, { seat: h.seat, enemyUid: enemy?.uid, bossUid: boss?.uid });
    }
  }
  if (s.activationQueue.length === 0 && !s.combat && s.pending.length === 0 && side(s).turnEnding && s.phase === 'play') {
    side(s).turnEnding = false;
    finishTurn(s, false);
  }
};

/** push a piece N steps away from a space (deterministic farthest) */
const pushAway = (s: BbState, e: BbEnemyOnMap, from: BbSpaceRef, steps: number): void => {
  for (let i = 0; i < steps; i++) {
    const opts = spaceNeighbors(s, e.space, 'enemy');
    if (!opts.length) break;
    const score = (ref: BbSpaceRef): number => bfsFrom(s, from, 'enemy').get(ref) ?? 0;
    const best = [...opts].sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1))[0];
    if (score(best) <= score(e.space)) break;
    e.space = best;
  }
};

/** Ludwig's Rifle: when an enemy moves into a hunter's space, a ready rifle
 * fires automatically for 2 damage (card back), then exhausts. */
const rifleSentry = (s: BbState, piece: BbEnemyOnMap | BbBossOnMap): void => {
  for (const h of s.hunters) {
    if (h.space !== piece.space || h.firearmExhausted) continue;
    const fx = (bbItem(h.firearmId).effects ?? {}) as { custom?: string };
    if (fx.custom !== 'rifle-sentry') continue;
    h.firearmExhausted = true;
    evt(s, "LUDWIG'S RIFLE FIRES", h.seat, 'firearm');
    applyDamageToEnemy(s, piece, 2, h.seat);
    return;
  }
};

/** Hunter Torch: a ready torch stops a non-boss enemy 1 space short of the
 * hunter and deals 1 damage (card back), then exhausts. Returns true when the
 * enemy's entry was prevented. */
const torchSentry = (s: BbState, e: BbEnemyOnMap, to: BbSpaceRef): boolean => {
  for (const h of s.hunters) {
    if (h.space !== to) continue;
    const tool = h.rewards.find((r) => !r.exhausted && ((bbItem(r.id).effects ?? {}) as { custom?: string }).custom === 'torch-sentry');
    if (!tool) continue;
    tool.exhausted = true;
    evt(s, 'THE HUNTER TORCH FLARES', h.seat, 'reward');
    applyDamageToEnemy(s, e, 1, h.seat);
    return true;
  }
  return false;
};

const stepToward = (s: BbState, from: BbSpaceRef, to: BbSpaceRef): BbSpaceRef | null => {
  const dist = bfsFrom(s, to, 'enemy');
  const cur = dist.get(from);
  const options = spaceNeighbors(s, from, 'enemy')
    .filter((nb) => dist.has(nb))
    .sort((a, b) => (dist.get(a)! - dist.get(b)!) || (a < b ? -1 : 1));
  if (!options.length || cur == null) return null;
  return dist.get(options[0])! < cur ? options[0] : null;
};

const shortestPath = (s: BbState, from: BbSpaceRef, to: BbSpaceRef, mode: 'hunter' | 'enemy'): BbSpaceRef[] | null => {
  const prev = new Map<BbSpaceRef, BbSpaceRef | null>([[from, null]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === to) break;
    for (const next of spaceNeighbors(s, cur, mode)) {
      if (!prev.has(next)) { prev.set(next, cur); queue.push(next); }
    }
  }
  if (!prev.has(to)) return null;
  const path: BbSpaceRef[] = [];
  for (let cur: BbSpaceRef | null = to; cur != null; cur = prev.get(cur) ?? null) path.push(cur);
  return path.reverse();
};

// ---------- pursuit (p. 14) ----------

const runPursuit = (s: BbState, m: Moving): void => {
  const h = s.hunters[m.seat];
  if (!h.space) return;
  side(s).pursuedIntoLastMove = false;
  for (const uid of m.exitedEnemies) {
    const e = s.enemies.find((x) => x.uid === uid);
    const boss = s.bosses.find((x) => x.uid === uid);
    const piece = e ?? boss;
    if (!piece) continue;
    const steps = e ? 1 + (enemySideDef(s, e).passiveEffects?.moveBonus ?? 0) : 1;
    for (let i = 0; i < steps && piece.space !== h.space; i++) {
      const ix = m.path.indexOf(piece.space);
      const next = ix >= 0 && ix + 1 < m.path.length ? m.path[ix + 1] : stepToward(s, piece.space, h.space);
      if (!next) break;
      piece.space = next;
      if (boss) bbMissionEvent(s, { type: 'bossMoved', boss: boss.type, tileUid: parseRef(boss.space).uid });
    }
    if (piece.space === h.space) side(s).pursuedIntoLastMove = true;
  }
};

// ---------- turns & rounds ----------

const startRound = (s: BbState): void => {
  s.round++;
  advanceTrack(s);
  if (s.phase !== 'play') return;
  if (s.huntTrack >= BB_HUNT_TRACK.length - 1 && !s.finalRound) {
    s.finalRound = true;
    evt(s, 'THE FINAL ROUND BEGINS', undefined, 'final-round');
  }
  for (const h of s.hunters) h.tookTurnThisRound = false;
  for (const h of s.hunters) s.pending.push({ seat: h.seat, kind: 'round-refresh' });
};

const endRound = (s: BbState): void => {
  for (const e of s.enemies) delete (e as unknown as { suppressed?: boolean }).suppressed;
  bbMissionEvent(s, { type: 'roundEnd' });
  if (s.phase !== 'play') return;
  side(s).roundEnding = true;
  const ms = missionState(s);
  side(s).bossBonusQueue = s.bosses.filter((b) => ms.bossMods[b.type]?.bonusActivationRoundEnd).map((b) => b.uid);
  pumpBossBonusActivations(s);
};

const finishRoundAfterBonuses = (s: BbState): void => {
  if (!side(s).roundEnding || s.combat || s.pending.length > 0 || s.phase !== 'play') return;
  side(s).roundEnding = false;
  side(s).bossBonusQueue = [];
  if (s.finalRound) {
    s.phase = 'ended';
    s.outcome = 'defeat';
    evt(s, 'THE NIGHT CONSUMES YHARNAM · DEFEAT', undefined, 'defeat');
    return;
  }
  startRound(s);
};

/** mission boss overrides: bonus activation at round end (Long Hunt 22/42) */
const pumpBossBonusActivations = (s: BbState): void => {
  const ms = missionState(s);
  const queue = side(s).bossBonusQueue ?? (side(s).bossBonusQueue = []);
  while (queue.length > 0 && !s.combat && s.pending.length === 0 && s.phase === 'play') {
    const b = s.bosses.find((boss) => boss.uid === queue.shift()!);
    if (!b) continue;
    const mod: BbBossMod | undefined = ms.bossMods[b.type];
    if (!mod?.bonusActivationRoundEnd) continue;
    const alive = s.hunters.filter((h) => h.space);
    if (!alive.length) continue;
    const target = alive.sort((a, c) => a.hp - c.hp || a.seat - c.seat)[0]; // lowest HP (worst case)
    const spec = mod.bonusActivationRoundEnd as unknown;
    const steps = typeof spec === 'object' && spec != null && 'steps' in (spec as Record<string, unknown>)
      ? Number((spec as { steps: number }).steps)
      : spec === 'moveFourTowardLowestHpAndAttack' ? 4 : 1;
    for (let i = 0; i < steps && b.space !== target.space; i++) {
      const st = stepToward(s, b.space, target.space!);
      if (!st) break;
      b.space = st;
    }
    bbMissionEvent(s, { type: 'bossMoved', boss: b.type, tileUid: parseRef(b.space).uid });
    if (b.space === target.space && s.phase === 'play') {
      startCombat(s, { seat: target.seat, bossUid: b.uid });
    }
  }
  finishRoundAfterBonuses(s);
};

const finishTurn = (s: BbState, died: boolean): void => {
  const seat = s.activeSeat;
  if (seat == null) return;
  const h = s.hunters[seat];
  if (!died && h.poison && h.space && hunterSuffer(s, h, 1)) return; // p. 21
  (h as unknown as { suppressActivation?: boolean }).suppressActivation = false;
  h.tookTurnThisRound = true;
  s.activeSeat = null;
  side(s).moving = null;
  side(s).activatedThisTurn = [];
  if (s.hunters.every((x) => x.tookTurnThisRound || x.skipTurn)) {
    for (const x of s.hunters) x.skipTurn = false;
    endRound(s);
  }
};

const endTurnInternal = (s: BbState): void => {
  if (s.activeSeat == null) return;
  buildActivationQueue(s, s.activeSeat);
  side(s).turnEnding = true;
  pumpActivation(s);
};

// ---------- action helpers ----------

const requireTurn = (s: BbState, seat: number): BbHunterState => {
  if (s.phase !== 'play') err('The game is not in play');
  if (s.pending.length > 0) err('Resolve the pending decision first');
  if (s.combat) err('Resolve the combat first');
  if (s.activeSeat !== seat) err('Not your turn');
  return hunterOf(s, seat);
};

const inHunterTurnWindow = (s: BbState, seat: number): boolean =>
  s.phase === 'play' && s.activeSeat === seat && !side(s).turnEnding
  && !s.combat && s.pending.length === 0;

const inCombatReactionWindow = (s: BbState, seat: number): boolean => {
  const c = s.combat;
  const head = s.pending[0];
  return !!c && c.seat === seat && !c.resolved && !!c.enemyAction
    && !!head && head.seat === seat
    && (head.kind === 'combat-reaction' || head.kind === 'combat-dodge');
};

const requireOwnedCopies = (owned: string[], selected: string[], what: string): void => {
  const left = new Map<string, number>();
  for (const id of owned) left.set(id, (left.get(id) ?? 0) + 1);
  for (const id of selected) {
    const n = left.get(id) ?? 0;
    if (n <= 0) err(`You do not hold that ${what}`);
    left.set(id, n - 1);
  }
};

/** Validate target/window-sensitive item effects before any card, HP, deck, or
 * exhaust state is mutated. Rejected network actions must be atomic. */
const validateItemEffect = (s: BbState, h: BbHunterState, id: string, target?: BbSpaceRef | number): void => {
  const fx = (bbItem(id).effects ?? {}) as BbEffects & { custom?: string };
  switch (fx.custom) {
    case 'move-2':
      if (!inHunterTurnWindow(s, h.seat) || !h.space) err('Usable only on your turn');
      if (side(s).moving) err('Finish the current move first');
      break;
    case 'teleport-lamp':
      if (typeof target !== 'string' || !lampSpaces(s).includes(target)) err('Pick a Lamp space');
      break;
    case 'damage-1-range-1':
    case 'damage-2-same-space': {
      if (!h.space) err("You are in the Hunter's Dream");
      const piece = s.enemies.find((x) => x.uid === Number(target)) ?? s.bosses.find((x) => x.uid === Number(target));
      if (!piece) err('Pick an enemy');
      const range = fx.custom === 'damage-1-range-1' ? 1 : 0;
      if ((bfsFrom(s, h.space, 'hunter').get(piece.space) ?? 99) > range) err('Out of range');
      break;
    }
    case 'move-enemy-2':
    case 'suppress-activation': {
      if (!h.space) err("You are in the Hunter's Dream");
      const e = s.enemies.find((x) => x.uid === Number(target));
      if (!e) err('Pick an enemy');
      if ((bfsFrom(s, h.space, 'hunter').get(e.space) ?? 99) > 2) err('Out of range');
      break;
    }
    case 'summon-ally': {
      const other = s.hunters[Number(target)];
      if (!other || other.seat === h.seat || !other.space || !h.space) err('Pick another hunter');
      break;
    }
    default:
      break;
  }
};

const discardStat = (s: BbState, h: BbHunterState, cardId: string): void => {
  const ix = h.hand.indexOf(cardId);
  if (ix === -1) err('Card not in hand');
  h.hand.splice(ix, 1);
  h.discard.push(cardId);
};

const applyNonAttackCardEffects = (h: BbHunterState, cardId: string): void => {
  const card = bbStatCard(cardId);
  const heal = /When used for non-Attack action:\s*Heal\s+(\d+)/i.exec(card.text)?.[1];
  if (heal) h.hp = Math.min(BB_MAX_HP, h.hp + Number(heal));
};

const applyPlacementEffects = (s: BbState, h: BbHunterState, cardId: string, placedSlot: number): void => {
  const card = bbStatCard(cardId);
  const fx = card.effects ?? {};
  const delayed = /\b(?:On Kill|After Attack)\b/i.test(card.text);
  if (fx.draw && !delayed) for (let i = 0; i < fx.draw; i++) { const c = drawStat(s, h); if (c) h.hand.push(c); }
  if (fx.heal && !delayed) h.hp = Math.min(BB_MAX_HP, h.hp + fx.heal);
  if (fx.clearSlots === 0) {
    if (h.slots[placedSlot] === cardId) {
      h.discard.push(cardId);
      h.slots[placedSlot] = null;
    }
  } else {
    let left = fx.clearSlots ?? (/Clear this or any other slot/i.test(card.text) ? 1 : 0);
    for (let i = 0; i < h.slots.length && left > 0; i++) {
      if (i !== placedSlot && h.slots[i]) {
        h.discard.push(h.slots[i]!);
        h.slots[i] = null;
        left--;
      }
    }
    if (left > 0 && h.slots[placedSlot] === cardId) {
      h.discard.push(cardId);
      h.slots[placedSlot] = null;
    }
  }
  if (fx.block && s.combat && s.combat.seat === h.seat) {
    const c = s.combat as unknown as { blockPending?: number };
    c.blockPending = (c.blockPending ?? 0) + fx.block;
  }
};

const tileLockedFor = (s: BbState, ref: BbSpaceRef): boolean => {
  const t = s.tiles.find((x) => x.uid === parseRef(ref).uid);
  return !!t && missionState(s).lockedTiles.some((n) => n.toLowerCase() === tileDef(t.tileId).name.toLowerCase());
};

// ---------- the reducer ----------

export const applyBloodborneAction = (s: BbState, seat: number, action: BbAction): BbState => {
  switch (action.type) {
    case 'pick_hunter': {
      if (s.phase !== 'setup') err('Not in setup');
      const h = hunterOf(s, seat);
      if (h.hunterId) err('Hunter already picked');
      const def = BB_HUNTERS[action.hunterId];
      if (!def) err('Unknown hunter');
      if (s.pickedHunters.includes(action.hunterId)) err('Hunter already taken');
      h.hunterId = action.hunterId;
      h.firearmId = def.firearmId;
      h.weaponSide = action.side === 1 ? 1 : 0; // free choice of start side (p. 8)
      s.pickedHunters.push(action.hunterId);
      evt(s, `${def.name.toUpperCase()} JOINS THE HUNT`, seat, 'pick');
      if (s.hunters.every((x) => x.hunterId)) {
        setupChapter(s);
        bbMissionOnReveal(s, 'chapter-start');
      }
      return s;
    }

    case 'begin_turn': {
      if (s.phase !== 'play') err('The game is not in play');
      if (s.pending.length > 0) err('Resolve the pending decision first');
      if (s.combat) err('A combat is being resolved');
      if (s.activeSeat != null) err('Another hunter is taking their turn');
      const h = hunterOf(s, seat);
      if (h.tookTurnThisRound) err('You already acted this round');
      if (h.skipTurn) err('Slain this round, your turn is skipped');
      if (h.pendingReturn && lampSpaces(s).length === 0) {
        // every lamp is broken: the hunter cannot return this round (p. 24)
        h.tookTurnThisRound = true;
        evt(s, 'NO LAMP BURNS · THE DREAM HOLDS YOU', seat, 'dream');
        if (s.hunters.every((x) => x.tookTurnThisRound || x.skipTurn)) {
          for (const x of s.hunters) x.skipTurn = false;
          endRound(s);
        }
        return s;
      }
      s.activeSeat = seat;
      if (h.pendingReturn) s.pending.push({ seat, kind: 'return-placement' });
      evt(s, `${BB_HUNTERS[h.hunterId!]?.name.toUpperCase() ?? 'HUNTER'} TAKES THE HUNT`, seat, 'turn');
      return s;
    }

    case 'move': {
      const h = requireTurn(s, seat);
      if (side(s).moving) err('Finish the current move first');
      if (!h.space) err("You are in the Hunter's Dream");
      discardStat(s, h, action.cardId);
      applyNonAttackCardEffects(h, action.cardId);
      const move = /When used to Move:\s*Move\s+(\d+)\s+spaces?/i.exec(bbStatCard(action.cardId).text)?.[1];
      side(s).moving = { seat, left: move ? Number(move) : BB_MOVE_SPACES, path: [h.space], exitedEnemies: [] };
      return s;
    }
    case 'step': {
      const h = requireTurn(s, seat);
      const m = side(s).moving;
      if (!m || m.left <= 0) err('No movement left');
      if (!spaceNeighbors(s, h.space!, 'hunter').includes(action.to)) err('Not adjacent');
      if (tileLockedFor(s, action.to)) err('You may not enter there yet');
      const from = h.space!;
      for (const e of s.enemies) {
        if (e.space === from && !m.exitedEnemies.includes(e.uid)) m.exitedEnemies.push(e.uid);
      }
      for (const b of s.bosses) {
        if (b.space === from && !m.exitedEnemies.includes(b.uid)) m.exitedEnemies.push(b.uid);
      }
      h.space = action.to;
      m.path.push(action.to);
      m.left--;
      bbMissionEvent(s, { type: 'moveOut', seat, from });
      if (m.left === 0) return applyBloodborneAction(s, seat, { type: 'end_move' });
      return s;
    }
    case 'step_reveal': {
      const h = requireTurn(s, seat);
      const m = side(s).moving;
      if (!m || m.left <= 0) err('No movement left');
      const { uid, space } = parseRef(h.space!);
      const t = s.tiles.find((x) => x.uid === uid)!;
      const ex = worldExits(t).find((e) => e.space === space && e.edge === action.edge);
      if (!ex) err('No exit that way');
      if (s.fogGates.includes(uid)) err('The fog gates hold you');
      const [dx, dy] = edgeDelta(action.edge);
      if (tileAt(s, t.x + dx, t.y + dy)) err('A tile is already there');
      if (s.tileDeck.length === 0) err('The tile deck is empty');
      let guard = 0;
      while (guard++ < 30) {
        const tileId = s.tileDeck.shift()!;
        const need = facing(action.edge);
        const def = BB_TILES[tileId];
        const rotOptions: number[] = [];
        for (let rot = 0; rot < 4; rot++) {
          if (def.exits.some((e2) => rotEdge(e2.edge, rot as 0 | 1 | 2 | 3) === need)) rotOptions.push(rot);
        }
        if (rotOptions.length === 0) {
          s.tileDeck = bbShuffle(s, [...s.tileDeck, tileId]); // p. 15 safeguard
          if (s.tileDeck.length <= 1) err('No tile fits here');
          continue;
        }
        side(s).placing = { tileId, x: t.x + dx, y: t.y + dy, edge: action.edge, from: h.space! };
        if (rotOptions.length === 1) placeRevealedTile(s, rotOptions[0] as 0 | 1 | 2 | 3);
        else s.pending.push({ seat, kind: 'tile-orientation', tileId, options: rotOptions });
        break;
      }
      return s;
    }
    case 'end_move': {
      const h = requireTurn(s, seat);
      const m = side(s).moving;
      if (!m) err('Not moving');
      side(s).moving = null;
      runPursuit(s, m);
      const { uid } = parseRef(h.space!);
      const tile = s.tiles.find((x) => x.uid === uid)!;
      bbMissionEvent(s, { type: 'endMove', seat, tileId: tile.tileId, tileUid: uid, space: h.space! });
      return s;
    }

    case 'interact': {
      const h = requireTurn(s, seat);
      if (side(s).moving) err('Finish the current move first');
      if (!h.space) err("You are in the Hunter's Dream");
      const hasConsumable = s.consumableTokens.includes(h.space);
      const missionables = bbMissionInteractables(s, seat, h.space);
      if (!hasConsumable && missionables.length === 0) err('Nothing to interact with here');
      discardStat(s, h, action.cardId);
      applyNonAttackCardEffects(h, action.cardId);
      const aggro = [
        ...s.enemies.filter((e) => e.space === h.space).map((e) => ({ enemyUid: e.uid })),
        ...s.bosses.filter((b) => b.space === h.space).map((b) => ({ bossUid: b.uid })),
      ];
      for (const target of aggro) {
        if (h.hp === 0 || !h.space) break;
        startCombat(s, { seat, ...target, noResponse: true }); // p. 16
      }
      if (h.hp === 0 || !h.space) return s; // slain: no interact
      if (hasConsumable) {
        s.consumableTokens = s.consumableTokens.filter((r) => r !== h.space);
        const c = drawConsumable(s);
        if (c) {
          h.consumables.push(c);
          evt(s, `FOUND ${bbItem(c).name.toUpperCase()}`, seat, 'loot');
        }
        bbMissionEvent(s, { type: 'consumablePickup', seat, space: h.space });
      }
      bbMissionEvent(s, { type: 'interact', seat, space: h.space });
      return s;
    }

    case 'transform': {
      const h = requireTurn(s, seat);
      if (side(s).moving) err('Finish the current move first');
      discardStat(s, h, action.cardId);
      applyNonAttackCardEffects(h, action.cardId);
      for (const c of h.slots) if (c) h.discard.push(c);
      h.weaponSide = h.weaponSide === 0 ? 1 : 0;
      h.slots = new Array(hunterSlotCount(h)).fill(null);
      h.gemSlot = null; // the Blood Stone Shard may be re-seated freely
      // Repeating Pistol refreshes for free on Transform (card back)
      const gfx = (bbItem(h.firearmId).effects ?? {}) as { freeOnTransform?: boolean };
      if (gfx.freeOnTransform && h.firearmExhausted) h.firearmExhausted = false;
      evt(s, 'TRICK WEAPON TRANSFORMED', seat, 'transform');
      return s;
    }

    case 'dream': {
      const h = requireTurn(s, seat);
      if (side(s).moving) err('Finish the current move first');
      discardStat(s, h, action.cardId);
      applyNonAttackCardEffects(h, action.cardId);
      // carried mission tokens return home (survivor rules)
      for (const tok of missionState(s).tokens) {
        if (tok.carriedBy === seat) { tok.carriedBy = null; tok.space = tok.onLose === 'return' ? tok.homeSpace : h.space; }
      }
      (h as unknown as { carriedSurvivors?: number }).carriedSurvivors = 0;
      goToDream(s, h, false);
      endTurnInternal(s);
      return s;
    }

    case 'attack': {
      const h = requireTurn(s, seat);
      if (side(s).moving) err('Finish the current move first');
      if (!h.space) err("You are in the Hunter's Dream");
      const card = bbStatCard(action.cardId);
      if (!h.hand.includes(action.cardId)) err('Card not in hand');
      if (action.slot < 0 || action.slot >= h.slots.length) err('No such attack slot');
      if (h.slots[action.slot] !== null) err('That attack slot is filled');
      if ((action.enemyUid != null) === (action.bossUid != null)) err('Pick exactly one enemy or Boss');
      const enemy = action.enemyUid != null ? s.enemies.find((e) => e.uid === action.enemyUid) : null;
      const boss = action.bossUid != null ? s.bosses.find((b) => b.uid === action.bossUid) : null;
      if (!enemy && !boss) err('No such enemy');
      const targetSpace = (enemy ?? boss)!.space;
      const inSpace = targetSpace === h.space;
      const leaping = !!card.effects.leaping || /May make a Move action before using this card to Attack/i.test(card.text);
      if (!inSpace && !leaping) err('The enemy is not in your space');
      if (!inSpace && leaping) {
        const path = shortestPath(s, h.space, targetSpace, 'hunter');
        if (!path || path.length - 1 > BB_MOVE_SPACES) err('Too far to leap');
        if (path.slice(1).some((ref) => tileLockedFor(s, ref))) err('You may not enter there yet');
        const moving: Moving = { seat, left: 0, path, exitedEnemies: [] };
        for (const from of path.slice(0, -1)) {
          for (const e of s.enemies) if (e.space === from && !moving.exitedEnemies.includes(e.uid)) moving.exitedEnemies.push(e.uid);
          for (const b of s.bosses) if (b.space === from && !moving.exitedEnemies.includes(b.uid)) moving.exitedEnemies.push(b.uid);
          bbMissionEvent(s, { type: 'moveOut', seat, from });
        }
        h.space = targetSpace;
        runPursuit(s, moving);
        const tile = s.tiles.find((placed) => placed.uid === parseRef(targetSpace).uid)!;
        bbMissionEvent(s, { type: 'endMove', seat, tileId: tile.tileId, tileUid: tile.uid, space: targetSpace });
      }
      h.hand.splice(h.hand.indexOf(action.cardId), 1);
      h.slots[action.slot] = action.cardId;
      applyPlacementEffects(s, h, action.cardId, action.slot);
      startCombat(s, {
        seat,
        enemyUid: enemy?.uid,
        bossUid: boss?.uid,
        hunterAttack: { cardId: action.cardId, slot: action.slot },
        block: card.effects.block ?? 0,
      });
      return s;
    }

    case 'use_consumable': {
      const h = hunterOf(s, seat);
      if (s.phase !== 'play') err('The game is not in play');
      const id = h.consumables[action.itemIx];
      if (!id) err('No such consumable');
      const item = bbItem(id);
      const inCombatWindow = inCombatReactionWindow(s, seat);
      const hunterAttacking = inCombatWindow && (!!s.combat?.attack || !!(s.combat as unknown as { firearmAttack?: unknown })?.firearmAttack);
      if (item.timing === 'On Attack' && !hunterAttacking) err('Usable only when you Attack');
      if (item.timing === 'Hunter Turn' && !inHunterTurnWindow(s, seat)) err('Usable only on your turn');
      validateItemEffect(s, h, id, action.target);
      h.consumables.splice(action.itemIx, 1);
      s.consumableDiscard.push(id);
      applyItemEffect(s, h, id, action.target);
      evt(s, `${item.name.toUpperCase()} USED`, seat, 'item');
      return s;
    }
    case 'use_firearm': {
      const h = hunterOf(s, seat);
      if (s.phase !== 'play') err('The game is not in play');
      if (h.firearmExhausted) err('Firearm exhausted');
      const gunFx = (bbItem(h.firearmId).effects ?? {}) as BbEffects & { custom?: string; attack?: { speed: BbSpeed; damage: number; stagger?: boolean; splash?: number } };
      const c = s.combat;
      switch (gunFx.custom) {
        case 'stagger-basic': {
          // reaction: cancels an enemy Basic Attack outright
          if (!inCombatReactionWindow(s, seat) || !c?.enemyAction) err('Fire when an enemy makes a Basic Attack');
          if (c.bossUid != null) err('Bosses do not make Basic Attacks');
          if (c.enemyAction.kind !== 'basic') err('That is not a Basic Attack');
          (c as unknown as { firearmCancel?: boolean }).firearmCancel = true;
          break;
        }
        case 'degrade-attack': {
          if (!inCombatReactionWindow(s, seat) || !c?.enemyAction) err('Fire when a non-boss enemy attacks');
          if (c.bossUid != null) err('Bosses shrug off the mist');
          c.enemySpeedBonus -= 1;
          (c as unknown as { stripEffects?: boolean }).stripEffects = true;
          break;
        }
        case 'firearm-attack':
          err('Use it as your attack when a combat starts');
          break;
        case 'blunderbuss': {
          if (!inHunterTurnWindow(s, seat)) err('Usable only on your turn');
          if (!h.space) err("You are in the Hunter's Dream");
          const uid = Number(action.target);
          const e = s.enemies.find((x) => x.uid === uid && x.space === h.space);
          if (!e) err('Pick a non-boss enemy in your space');
          applyDamageToEnemy(s, e, 1, seat);
          const still = s.enemies.find((x) => x.uid === uid);
          if (still) {
            const away = spaceNeighbors(s, still.space, 'enemy')
              .sort((a, b) => (bfsFrom(s, h.space!, 'enemy').get(b) ?? 0) - (bfsFrom(s, h.space!, 'enemy').get(a) ?? 0));
            if (away.length) still.space = away[0];
          }
          break;
        }
        case 'rifle-sentry':
          err('It fires on its own when an enemy enters your space');
          break;
        default:
          validateItemEffect(s, h, h.firearmId, action.target);
          applyItemEffect(s, h, h.firearmId, action.target);
          break;
      }
      h.firearmExhausted = true;
      evt(s, `${bbItem(h.firearmId).name.toUpperCase()} FIRED`, seat, 'firearm');
      return s;
    }
    case 'refresh_firearm': {
      const h = requireTurn(s, seat);
      if (!h.firearmExhausted) err('Firearm is ready');
      const fx = (bbItem(h.firearmId).effects ?? {}) as { refresh?: string; echoRefresh?: boolean };
      if (action.echo) {
        if (!fx.echoRefresh) err('That firearm does not refresh with echoes');
        if (h.echoes < 1) err('No blood echo to spend');
        h.echoes -= 1;
      } else {
        const cost = fx.refresh === 'discard2' ? 2 : 1;
        if (action.discard.length !== cost) err(`Discard ${cost} card${cost > 1 ? 's' : ''} to refresh`);
        requireOwnedCopies(h.hand, action.discard, 'Stat card');
        for (const c of action.discard) discardStat(s, h, c);
      }
      h.firearmExhausted = false;
      return s;
    }
    case 'use_reward': {
      const h = hunterOf(s, seat);
      if (s.phase !== 'play') err('The game is not in play');
      const r = h.rewards[action.rewardIx];
      if (!r) err('No such reward');
      if (r.exhausted) err('Reward exhausted');
      const rfx = (bbItem(r.id).effects ?? {}) as BbEffects & { custom?: string; onKill?: boolean; neverExhaust?: boolean };
      const timing = bbItem(r.id).timing;
      if (timing === 'Hunter Turn' && !inHunterTurnWindow(s, seat)) err('Usable only on your turn');
      if (timing === 'On Attack' && (!inCombatReactionWindow(s, seat)
        || (!s.combat?.attack && !(s.combat as unknown as { firearmAttack?: unknown })?.firearmAttack))) {
        err('Usable only when you Attack');
      }
      if (rfx.onKill) err('It answers only a kill, wait for the moment');
      switch (rfx.custom) {
        case 'damage-2-all-in-space': {
          if (!h.space) err("You are in the Hunter's Dream");
          const here = s.enemies.filter((e) => e.space === h.space);
          if (!here.length) err('No enemy in your space');
          for (const e of [...here]) applyDamageToEnemy(s, e, 2, seat);
          break;
        }
        case 'damage-2-push-2': {
          const e = s.enemies.find((x) => x.uid === Number(action.target) && x.space === h.space);
          if (!e) err('Pick an enemy in your space');
          applyDamageToEnemy(s, e, 2, seat);
          const still = s.enemies.find((x) => x.uid === e.uid);
          if (still) pushAway(s, still, h.space!, 2);
          break;
        }
        case 'push-all-2': {
          if (!h.space) err("You are in the Hunter's Dream");
          for (const e of s.enemies.filter((x) => x.space === h.space)) pushAway(s, e, h.space!, 2);
          break;
        }
        case 'echo-heal-2-more': {
          if (action.target === 'echo' && h.echoes < 1) err('No blood echo to spend');
          h.hp = Math.min(BB_MAX_HP, h.hp + 1);
          if (action.target === 'echo') {
            h.echoes -= 1;
            h.hp = Math.min(BB_MAX_HP, h.hp + 2);
          }
          break;
        }
        case 'gem-slot': {
          const slot = Number(action.target);
          if (!(slot >= 0 && slot < h.slots.length)) err('Pick an attack slot for the gem');
          h.gemSlot = slot;
          break;
        }
        case 'combat-dmg1-stagger': {
          if (s.combat?.seat !== seat || !s.combat.attack) err('Usable when you attack');
          s.combat.hunterDmgBonus += 1;
          (s.combat as unknown as { hunterStagger?: boolean }).hunterStagger = true;
          break;
        }
        case 'combat-speed1-dmg1': {
          if (s.combat?.seat !== seat) err('Usable during your combat');
          s.combat.hunterSpeedBonus += 1;
          s.combat.hunterDmgBonus += 1;
          break;
        }
        case 'combat-speed1-free-transform': {
          if (s.combat?.seat !== seat) err('Usable during your combat');
          s.combat.hunterSpeedBonus += 1;
          (s.combat as unknown as { freeTransformAfter?: boolean }).freeTransformAfter = true;
          break;
        }
        case 'combat-stagger-ties': {
          if (s.combat?.seat !== seat || !s.combat.attack) err('Usable when you attack');
          (s.combat as unknown as { hunterStagger?: boolean; staggerTies?: boolean }).hunterStagger = true;
          (s.combat as unknown as { staggerTies?: boolean }).staggerTies = true;
          break;
        }
        case 'execute-2hp-range-2': {
          const e = s.enemies.find((x) => x.uid === Number(action.target));
          if (!e || !h.space) err('Pick an enemy within 2 spaces');
          const d = bfsFrom(s, h.space, 'hunter').get(e.space) ?? 99;
          if (d > 2) err('Out of range');
          if (enemyHp(s, e) - e.damage > 2) err('It is not weak enough to execute');
          slayEnemy(s, e.uid, seat);
          break;
        }
        case 'swap-discard': {
          const [discardId, retrieveId] = String(action.target ?? '').split('|');
          if (!h.hand.includes(discardId)) err('Pick a hand card to discard');
          if (!h.discard.includes(retrieveId)) err('Pick a discard card to return');
          h.hand.splice(h.hand.indexOf(discardId), 1);
          h.discard.push(discardId);
          h.discard.splice(h.discard.indexOf(retrieveId), 1);
          h.hand.push(retrieveId);
          break;
        }
        case 'suppress-all-activation': {
          if (s.activeSeat !== seat) err('Usable only on your turn');
          (h as unknown as { suppressActivation?: boolean }).suppressActivation = true;
          break;
        }
        case 'moon-keep-echo':
          err('It answers only death itself');
          break;
        case 'auto-dodge': {
          const head = s.pending[0];
          if (!head || head.seat !== seat || (head.kind !== 'combat-dodge' && head.kind !== 'combat-rider')) err('Usable when you are attacked');
          if (head.kind === 'combat-dodge' && s.combat
            && !(s.combat as unknown as { stripEffects?: boolean }).stripEffects
            && enemyAttackTraits(enemyActionDef(s), h).cannotDodge) err('That attack cannot be Dodged');
          s.pending.shift();
          if (head.kind === 'combat-dodge' && s.combat) {
            s.combat.dodge = { cardId: '', slot: -1 };
            r.exhausted = true;
            evt(s, `${bbItem(r.id).name.toUpperCase()} · DODGED`, seat, 'reward');
            combatResolve(s);
            return s;
          }
          break;
        }
        case 'damage-2-suppress-within-1': {
          const e = s.enemies.find((x) => x.uid === Number(action.target));
          if (!e || !h.space) err('Pick a non-boss enemy within 1 space');
          const d = bfsFrom(s, h.space, 'hunter').get(e.space) ?? 99;
          if (d > 1) err('Out of range');
          applyDamageToEnemy(s, e, 2, seat);
          const still = s.enemies.find((x) => x.uid === e.uid);
          if (still) (still as unknown as { suppressed?: boolean }).suppressed = true;
          break;
        }
        case 'torch-sentry':
          err('It burns on its own when an enemy closes in');
          break;
        default:
          validateItemEffect(s, h, r.id, action.target as BbSpaceRef | number | undefined);
          applyItemEffect(s, h, r.id, action.target);
          break;
      }
      if (!rfx.neverExhaust) r.exhausted = true;
      evt(s, `${bbItem(r.id).name.toUpperCase()} USED`, seat, 'reward');
      return s;
    }

    case 'mission_discard': {
      const h = requireTurn(s, seat);
      if (!h.space) err("You are in the Hunter's Dream");
      if (action.cards.length === 0) err('Pick consumables to discard');
      requireOwnedCopies(h.consumables, action.cards, 'consumable');
      for (const id of action.cards) {
        const ix = h.consumables.indexOf(id);
        if (ix === -1) err('You do not hold that consumable');
        h.consumables.splice(ix, 1);
        s.consumableDiscard.push(id);
      }
      const t = s.tiles.find((x) => x.uid === parseRef(h.space!).uid)!;
      bbMissionEvent(s, { type: 'missionDiscard', seat, tile: tileDef(t.tileId).name, count: action.cards.length });
      evt(s, `${action.cards.length} CONSUMABLE${action.cards.length > 1 ? 'S' : ''} OFFERED`, seat, 'mission');
      return s;
    }
    case 'mission_spawn': {
      const h = requireTurn(s, seat);
      if (!h.space) err("You are in the Hunter's Dream");
      const ms = missionState(s);
      const hook = Object.entries(ms.hooks).find(([card, hk]) => hk.discardConsumableSpawns && s.missions[card]?.revealed && !s.missions[card]?.completed);
      if (!hook) err('No mission allows that');
      if (h.consumables.length === 0) err('No consumable to discard');
      const id = h.consumables.shift()!;
      s.consumableDiscard.push(id);
      const enemyName = String(hook[1].discardConsumableSpawns);
      const eid = Object.keys(BB_ENEMIES).find((k) => BB_ENEMIES[k].name.toLowerCase() === enemyName.toLowerCase());
      if (eid) spawnEnemy(s, eid, h.space);
      evt(s, `BAIT SET · ${enemyName.toUpperCase()} DRAWN OUT`, seat, 'mission');
      return s;
    }

    case 'end_turn': {
      requireTurn(s, seat);
      const m = side(s).moving;
      if (m) { side(s).moving = null; runPursuit(s, m); }
      endTurnInternal(s);
      return s;
    }

    case 'round_refresh': {
      const head = s.pending[0];
      if (!head || head.kind !== 'round-refresh' || head.seat !== seat) err('Not your decision');
      const h = hunterOf(s, seat);
      requireOwnedCopies(h.hand, action.discard, 'Stat card');
      for (const c of action.discard) discardStat(s, h, c);
      while (h.hand.length < BB_HAND_SIZE) {
        const c = drawStat(s, h);
        if (!c) break;
        h.hand.push(c);
      }
      s.pending.shift();
      return s;
    }

    case 'choose':
      return applyChoose(s, seat, action as unknown as Record<string, unknown>);

    case 'next_chapter': {
      if (s.phase !== 'ended' || s.outcome !== 'victory') err('The chapter is not won');
      if (s.chapter >= 3) err('The campaign is complete');
      if (s.pending.length > 0) err('Spend every remaining Blood Echo first');
      s.campaignStore = {
        hunterDecks: Object.fromEntries(s.hunters.map((h) => [h.seat, [...h.deck, ...h.discard, ...h.hand, ...h.slots.filter(Boolean) as string[]]])),
        firearms: Object.fromEntries(s.hunters.map((h) => [h.seat, h.firearmId])),
        rewards: Object.fromEntries(s.hunters.map((h) => [h.seat, h.rewards.map((r) => r.id)])),
        consumables: Object.fromEntries(s.hunters.map((h) => [h.seat, [...h.consumables]])),
        insightCards: [...s.insightCards],
      };
      s.chapter++;
      s.phase = 'play';
      s.outcome = null;
      s.tiles = []; s.enemies = []; s.bosses = []; s.consumableTokens = [];
      s.insightTokens = {}; s.corpseTokens = []; s.survivorTokens = []; s.npcTokens = [];
      s.fogGates = []; s.brokenLamps = []; s.missions = {}; s.specialRules = [];
      s.pending = []; s.combat = null; s.activeSeat = null; s.activationQueue = [];
      side(s).moving = null; side(s).placing = null; side(s).turnEnding = false; side(s).activatedThisTurn = [];
      side(s).roundEnding = false; side(s).bossBonusQueue = [];
      setupChapter(s);
      bbMissionOnReveal(s, 'chapter-start');
      return s;
    }

    default:
      err('Unknown action');
  }
  return s;
};

// ---------- choose (pending head answers) ----------

const applyChoose = (s: BbState, seat: number, a: Record<string, unknown>): BbState => {
  const head = s.pending[0];
  if (!head) err('Nothing to decide');
  if (head.seat !== seat) err('Not your decision');
  switch (head.kind) {
    case 'combat-attack': {
      const h = hunterOf(s, seat);
      if (a.pass) {
        s.pending.shift();
        combatFlip(s);
        if (s.combat) queueCombatReaction(s);
        return s;
      }
      if (a.firearm) {
        // Cannon / Flamesprayer: the firearm IS the attack (card backs)
        const gunFx = (bbItem(h.firearmId).effects ?? {}) as { custom?: string; attack?: { speed: BbSpeed; damage: number; stagger?: boolean; splash?: number } };
        if (h.firearmExhausted) err('Firearm exhausted');
        if (gunFx.custom !== 'firearm-attack' || !gunFx.attack) err('That firearm cannot make an attack');
        h.firearmExhausted = true;
        if (s.combat) (s.combat as unknown as { firearmAttack?: typeof gunFx.attack }).firearmAttack = gunFx.attack;
        s.pending.shift();
        combatFlip(s);
        if (s.combat) queueCombatReaction(s);
        return s;
      }
      const cardId = String(a.cardId ?? '');
      const slot = Number(a.slot);
      if (!h.hand.includes(cardId)) err('Card not in hand');
      if (!(slot >= 0 && slot < h.slots.length) || h.slots[slot] !== null) err('Pick an empty attack slot');
      h.hand.splice(h.hand.indexOf(cardId), 1);
      h.slots[slot] = cardId;
      applyPlacementEffects(s, h, cardId, slot);
      if (s.combat) s.combat.attack = { cardId, slot };
      s.pending.shift();
      combatFlip(s);
      if (s.combat) queueCombatReaction(s);
      return s;
    }
    case 'combat-reaction': {
      if (!a.pass) err('Use an item or firearm, or pass the reaction window');
      s.pending.shift();
      if (s.combat) maybeQueueDodge(s);
      return s;
    }
    case 'combat-dodge': {
      const h = hunterOf(s, seat);
      if (a.pass) {
        s.pending.shift();
        combatResolve(s);
        return s;
      }
      const cardId = String(a.cardId ?? '');
      const slot = Number(a.slot);
      const card = bbStatCard(cardId);
      if (!h.hand.includes(cardId)) err('Card not in hand');
      if (!card.effects.dodge) err('That card cannot Dodge');
      if (!(slot >= 0 && slot < h.slots.length) || h.slots[slot] !== null) err('Pick an empty attack slot');
      const def = BB_HUNTERS[h.hunterId!];
      const slotSpeed = def.sides[h.weaponSide].slots[slot].speed;
      const need = head.speed;
      const needRank = typeof need === 'number' ? need : BB_SPEED_RANK[need];
      const dodgeRank = BB_SPEED_RANK[slotSpeed] + (card.effects.speedBonus ?? 0);
      const traits = s.combat && !(s.combat as unknown as { stripEffects?: boolean }).stripEffects
        ? enemyAttackTraits(enemyActionDef(s), h)
        : null;
      if (traits?.cannotDodge) err('That attack cannot be Dodged');
      if (traits?.exactDodgeSpeed ? dodgeRank !== BB_SPEED_RANK[traits.exactDodgeSpeed] : dodgeRank < needRank) {
        err('The slot is too slow to dodge that attack');
      }
      h.hand.splice(h.hand.indexOf(cardId), 1);
      h.slots[slot] = cardId;
      applyPlacementEffects(s, h, cardId, slot);
      if (s.combat) s.combat.dodge = { cardId, slot };
      s.pending.shift();
      combatResolve(s);
      return s;
    }
    case 'combat-rider': {
      const h = hunterOf(s, seat);
      const dmg = head.damage ?? 2;
      if (a.pass) {
        s.pending.shift();
        applyRiderHit(s, h, dmg, {
          stun: head.stun,
          poison: head.poison,
          frenzy: head.frenzy,
          push: head.push,
          source: head.source,
        });
        return s;
      }
      const cardId = String(a.cardId ?? '');
      const slot = Number(a.slot);
      const card = bbStatCard(cardId);
      if (!h.hand.includes(cardId) || !card.effects.dodge) err('Pick a Dodge card or pass');
      if (!(slot >= 0 && slot < h.slots.length) || h.slots[slot] !== null) err('Pick an empty attack slot');
      const def = BB_HUNTERS[h.hunterId!];
      const slotSpeed = def.sides[h.weaponSide].slots[slot].speed;
      const needRank = BB_SPEED_RANK[(head.speed ?? 'slow') as BbSpeed];
      if (BB_SPEED_RANK[slotSpeed] + (card.effects.speedBonus ?? 0) < needRank) err('The slot is too slow to dodge that attack');
      h.hand.splice(h.hand.indexOf(cardId), 1);
      h.slots[slot] = cardId;
      applyPlacementEffects(s, h, cardId, slot);
      s.pending.shift();
      return s;
    }
    case 'discard-for-stun': {
      const h = hunterOf(s, seat);
      const cardId = String(a.cardId ?? '');
      if (h.hand.length === 0) {
        s.pending.shift();
        hunterSuffer(s, h, 1);
        return s;
      }
      if (!h.hand.includes(cardId)) err('Pick a card to discard');
      discardStat(s, h, cardId);
      s.pending.shift();
      return s;
    }
    case 'onkill-reward': {
      const h = hunterOf(s, seat);
      s.pending.shift();
      if (!a.use) return s;
      const r = h.rewards[head.rewardIx];
      if (!r || r.exhausted) return s;
      const rfx = (bbItem(r.id).effects ?? {}) as BbEffects & { custom?: string };
      if (rfx.draw) for (let i = 0; i < rfx.draw; i++) { const c = drawStat(s, h); if (c) h.hand.push(c); }
      if (rfx.heal) h.hp = Math.min(BB_MAX_HP, h.hp + rfx.heal);
      if (rfx.custom === 'kill-damage-2-within-1' && h.space) {
        // deal 2 to another enemy within 1 (deterministic: closest to death)
        const near = s.enemies
          .filter((e) => (bfsFrom(s, h.space!, 'hunter').get(e.space) ?? 99) <= 1)
          .sort((x, y) => (enemyHp(s, x) - x.damage) - (enemyHp(s, y) - y.damage));
        if (near.length) applyDamageToEnemy(s, near[0], 2, seat);
      }
      r.exhausted = true;
      evt(s, `${bbItem(r.id).name.toUpperCase()} INVOKED`, seat, 'reward');
      return s;
    }
    case 'dream-upgrades': {
      const pick = String(a.upgradeId ?? '');
      const ix = s.upgradeRow.indexOf(pick);
      if (ix === -1) err('Pick an upgrade from the row');
      s.upgradeRow.splice(ix, 1);
      refillUpgradeRow(s);
      const picksLeft = head.picks - 1;
      s.pending.shift();
      if (picksLeft > 0) s.pending.unshift({ seat, kind: 'dream-upgrades', picks: picksLeft });
      s.pending.unshift({ seat, kind: 'dream-incorporate', upgradeId: pick });
      return s;
    }
    case 'dream-incorporate': {
      const h = hunterOf(s, seat);
      if (a.discard) {
        s.pending.shift();
        return s;
      }
      const swapOut = String(a.swapOut ?? '');
      const ix = h.deck.indexOf(swapOut);
      if (ix === -1) err('Pick a card in your deck to swap out');
      h.deck.splice(ix, 1, head.upgradeId);
      s.pending.shift();
      return s;
    }
    case 'return-placement': {
      const h = hunterOf(s, seat);
      const sideN = Number(a.side);
      const lamp = String(a.space ?? '');
      if (sideN !== 0 && sideN !== 1) err('Pick a weapon side');
      if (!lampSpaces(s).includes(lamp)) err('Pick a Lamp space');
      h.weaponSide = sideN as 0 | 1;
      h.slots = new Array(hunterSlotCount(h)).fill(null);
      h.space = lamp;
      h.pendingReturn = false;
      s.pending.shift();
      evt(s, 'BACK TO THE WAKING WORLD', seat, 'return');
      return s;
    }
    case 'tile-orientation': {
      const rot = Number(a.rot);
      if (!head.options.includes(rot)) err('Pick a legal orientation');
      s.pending.shift();
      placeRevealedTile(s, rot as 0 | 1 | 2 | 3);
      return s;
    }
    case 'reward-overflow': {
      const give = a.giveTo;
      if (give == null) {
        s.pending.shift();
        return s;
      }
      const other = s.hunters[Number(give)];
      if (!other || other.seat === seat) err('Pick another hunter');
      const kind = bbItem(head.rewardId).kind;
      const cap = kind === 'tool' ? BB_MAX_TOOLS : BB_MAX_RUNES;
      if (other.rewards.filter((r) => bbItem(r.id).kind === kind).length >= cap) err('They cannot carry another');
      other.rewards.push({ id: head.rewardId, exhausted: false });
      s.pending.shift();
      return s;
    }
    case 'mission-choice': {
      const option = String(a.option ?? '');
      if (!head.options.includes(option)) err('Pick one of the printed options');
      s.pending.shift();
      bbMissionEvent(s, { type: 'choice', seat, card: head.card, option });
      return s;
    }
    default:
      err('Unknown decision');
  }
  return s;
};

// ---------- tile placement completion ----------

const placeRevealedTile = (s: BbState, rot: 0 | 1 | 2 | 3): void => {
  const p = side(s).placing;
  if (!p) return;
  side(s).placing = null;
  const placed = { uid: s.nextUid++, tileId: p.tileId, rot, x: p.x, y: p.y };
  s.tiles.push(placed);
  populateTile(s, placed);
  const need = facing(p.edge);
  const entry = worldExits(placed).find((e) => e.edge === need)!;
  const h = s.hunters[s.activeSeat!];
  const m = side(s).moving;
  const to = spaceRef(placed.uid, entry.space);
  if (m && h) {
    const from = h.space!;
    for (const e of s.enemies) {
      if (e.space === from && !m.exitedEnemies.includes(e.uid)) m.exitedEnemies.push(e.uid);
    }
    for (const b of s.bosses) {
      if (b.space === from && !m.exitedEnemies.includes(b.uid)) m.exitedEnemies.push(b.uid);
    }
    h.space = to;
    m.path.push(to);
    m.left--;
    evt(s, `${(BB_TILES[p.tileId].name || 'A NEW AREA').toUpperCase()} REVEALED`, s.activeSeat!, 'reveal');
    bbMissionEvent(s, { type: 'tileRevealed', tileId: p.tileId, tileUid: placed.uid });
    bbMissionEvent(s, { type: 'moveOut', seat: h.seat, from });
    if (m.left === 0 && s.pending.length === 0 && !s.combat) applyBloodborneAction(s, s.activeSeat!, { type: 'end_move' });
  }
};

// ---------- item effects (curated) ----------

const applyItemEffect = (s: BbState, h: BbHunterState, id: string, target?: BbSpaceRef | number): void => {
  const fx = (bbItem(id).effects ?? {}) as BbEffects & { custom?: string };
  if (fx.heal) h.hp = Math.min(BB_MAX_HP, h.hp + fx.heal);
  if (fx.draw) for (let i = 0; i < fx.draw; i++) { const c = drawStat(s, h); if (c) h.hand.push(c); }
  if (fx.dmgBonus && s.combat?.seat === h.seat) s.combat.hunterDmgBonus += fx.dmgBonus;
  if (fx.speedBonus && s.combat?.seat === h.seat) s.combat.hunterSpeedBonus += fx.speedBonus;
  if (fx.block && s.combat?.seat === h.seat) {
    const c = s.combat as unknown as { blockPending?: number };
    c.blockPending = (c.blockPending ?? 0) + fx.block;
  }
  if (fx.clearSlots) {
    let left = fx.clearSlots;
    for (let i = 0; i < h.slots.length && left > 0; i++) {
      if (h.slots[i]) { h.discard.push(h.slots[i]!); h.slots[i] = null; left--; }
    }
  }
  switch (fx.custom) {
    case 'gain-echo': gainEcho(s, h); break;
    case 'move-2': {
      if (s.activeSeat !== h.seat || !h.space) err('Usable only on your turn');
      if (side(s).moving) err('Finish the current move first');
      side(s).moving = { seat: h.seat, left: 2, path: [h.space], exitedEnemies: [] };
      break;
    }
    case 'teleport-lamp': {
      if (typeof target === 'string' && lampSpaces(s).includes(target)) h.space = target;
      else err('Pick a Lamp space');
      break;
    }
    case 'refresh-firearm': h.firearmExhausted = false; break;
    case 'refresh-reward': {
      const r = h.rewards.find((x) => x.exhausted);
      if (r) r.exhausted = false;
      break;
    }
    case 'cure-poison': h.poison = false; break;
    case 'cure-frenzy': h.frenzy = false; break;
    case 'damage-1-range-1':
    case 'damage-2-same-space': {
      const uid = Number(target);
      const e = s.enemies.find((x) => x.uid === uid);
      const b = s.bosses.find((x) => x.uid === uid);
      const piece = e ?? b;
      if (!piece) err('Pick an enemy');
      const range = fx.custom === 'damage-1-range-1' ? 1 : 0;
      const d = bfsFrom(s, h.space!, 'hunter').get(piece.space) ?? 99;
      if (d > range) err('Out of range');
      applyDamageToEnemy(s, piece, fx.custom === 'damage-1-range-1' ? 1 : 2, h.seat);
      break;
    }
    case 'move-enemy-2': {
      const uid = Number(target);
      const e = s.enemies.find((x) => x.uid === uid);
      if (!e) err('Pick an enemy');
      const d = bfsFrom(s, h.space!, 'hunter').get(e.space) ?? 99;
      if (d > 2) err('Out of range');
      // Intelligent & Cruel doesn't apply: the HUNTER chooses — move it 2
      // away from all hunters (the only sane use); deterministic farthest
      for (let i = 0; i < 2; i++) {
        const opts = spaceNeighbors(s, e.space, 'enemy');
        if (!opts.length) break;
        const score = (ref: BbSpaceRef): number => Math.min(...s.hunters.filter((x) => x.space).map((x) => bfsFrom(s, ref, 'enemy').get(x.space!) ?? 0));
        e.space = [...opts].sort((x, y) => score(y) - score(x) || (x < y ? -1 : 1))[0];
      }
      break;
    }
    case 'summon-ally': {
      const other = s.hunters[Number(target)];
      if (!other || other.seat === h.seat || !other.space || !h.space) err('Pick another hunter');
      other.space = h.space;
      break;
    }
    case 'suppress-activation': {
      const uid = Number(target);
      const e = s.enemies.find((x) => x.uid === uid);
      if (!e) err('Pick an enemy');
      const d = bfsFrom(s, h.space!, 'hunter').get(e.space) ?? 99;
      if (d > 2) err('Out of range');
      (e as unknown as { suppressed?: boolean }).suppressed = true;
      break;
    }
    case 'strip-enemy-effects': {
      if (s.combat?.seat === h.seat) (s.combat as unknown as { stripEffects?: boolean }).stripEffects = true;
      break;
    }
    default: break;
  }
};

/** resume a stalled activation pump after pending decisions resolve */
export const bbPostProcess = (s: BbState): void => {
  if (s.pending.length === 0 && !s.combat && s.phase === 'play') {
    if (side(s).roundEnding) pumpBossBonusActivations(s);
    else pumpActivation(s);
  }
};
