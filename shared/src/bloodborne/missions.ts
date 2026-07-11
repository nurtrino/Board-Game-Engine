// Bloodborne — mission engine: interprets the per-campaign DSL overlays
// (games/bloodborne/golden/dsl/*, compiled into data/missions.json).
// Covers the recurring physical patterns: fog-gate arenas with insight-token
// HP pools and attack replacement, survivor escorts (static + fleeing),
// collection counters with decrement hooks, conditional branches on owned
// insight cards, choices, boss behaviour overrides, and tile locks.
// Anything unexpressible surfaces as a special-rule chip, never dropped.

import type { BbState, BbSpaceRef, BbHunterState } from './state.js';
import {
  spaceRef, tileDef, parseRef, bbShuffle, lampSpaces, spawnEnemy, bfsFrom,
  spaceNeighbors,
} from './state.js';
import { BB_MISSIONS, BB_CAMPAIGNS, BB_ENEMIES, BB_BOSSES, BB_ITEMS, type BbMissionDef } from './data.js';

// ---------- mission-side state (attached to BbState.missionState) ----------

export interface BbEnemyMod {
  tag: string;
  hpPool: number;        // "instead of slain" tokens remaining
  hpPoolMax: number;     // refilled on reset
  replace: Partial<Record<'basic' | 'special' | 'ability', unknown>>;
  immuneTileText?: boolean;
}

export interface BbBossMod {
  invulnerable?: boolean;
  bonusActivationRoundEnd?: 'towardLowestHp' | 'moveFourTowardLowestHpAndAttack';
  respawnTo?: string;
  healOnReset?: boolean;
  clearPoolOnReset?: boolean;
  onFlip?: { card: string; spawn: string; noRespawn?: boolean };
}

export interface BbMissionToken {
  id: string;            // mission card number that owns it
  space: BbSpaceRef | null;
  carriedBy: number | null;
  fleeing: boolean;
  movesAwayPerTurn: number;
  pickup: 'moveOut' | 'interact';
  onLose: 'return' | 'drop' | 'lost';
  homeSpace: BbSpaceRef | null;
}

export interface BbMissionState {
  enemyMods: BbEnemyMod[];
  bossMods: Record<string, BbBossMod>;
  tokens: BbMissionToken[];
  lockedTiles: string[];   // tile names hunters may not enter
  lockedMissions: string[]; // card numbers that may no longer be completed
  insightThisChapter: number;
  hooks: Record<string, Record<string, unknown>>; // card -> hooks block
}

export const missionState = (s: BbState): BbMissionState => {
  const box = s as unknown as { missionState?: BbMissionState };
  if (!box.missionState) {
    box.missionState = { enemyMods: [], bossMods: {}, tokens: [], lockedTiles: [], lockedMissions: [], insightThisChapter: 0, hooks: {} };
  }
  return box.missionState;
};

export const resetMissionState = (s: BbState): void => {
  (s as unknown as { missionState?: BbMissionState }).missionState =
    { enemyMods: [], bossMods: {}, tokens: [], lockedTiles: [], lockedMissions: [], insightThisChapter: 0, hooks: {} };
};

export type BbMissionEventArg =
  | { type: 'endMove'; seat: number; tileId: string; tileUid: number; space: BbSpaceRef }
  | { type: 'moveOut'; seat: number; from: BbSpaceRef }
  | { type: 'interact'; seat: number; space: BbSpaceRef }
  | { type: 'enemySlain'; enemyType: string; missionTag?: string; bySeat: number | null; space?: BbSpaceRef }
  | { type: 'bossSlain'; boss: string; bySeat: number | null }
  | { type: 'bossPhase2'; boss: string }
  | { type: 'bossMoved'; boss: string; tileUid: number }
  | { type: 'combatEnd'; seat: number }
  | { type: 'tileRevealed'; tileId: string; tileUid: number }
  | { type: 'roundEnd' }
  | { type: 'trackAdvanced'; space: number }
  | { type: 'consumablePickup'; seat: number; space: BbSpaceRef }
  | { type: 'choice'; seat: number; card: string; option: string }
  | { type: 'missionDiscard'; seat: number; tile: string; count: number };

const defsFor = (s: BbState): Record<string, BbMissionDef & Record<string, unknown>> =>
  (BB_MISSIONS[s.campaignId] ?? {}) as Record<string, BbMissionDef & Record<string, unknown>>;

const evt = (s: BbState, text: string, kind = 'mission'): void => {
  s.lastEvent = { seq: s.lastEvent.seq + 1, text, kind };
};

const nTokens = (s: BbState, spec: unknown): number => {
  if (typeof spec === 'number') return spec;
  if (typeof spec === 'string' && /^\d+$/.test(spec)) return +spec;
  switch (spec) {
    case 'n': return s.partySize;
    case 'nPlus1': return s.partySize + 1;
    case 'nPlus2': return s.partySize + 2;
    case '1or2at3plus': return s.partySize >= 3 ? 2 : 1;
    case '2or3at3plus': return s.partySize >= 3 ? 3 : 2;
    default: return 1;
  }
};

/** resolve 'space:NAME' | 'tile:NAME' | 'enemyN:TILE' | 'anySpawn:TILE' | 'self' */
export const findSpace = (s: BbState, spec: string, selfSeat?: number): BbSpaceRef | null => {
  if (spec === 'self' && selfSeat != null) return s.hunters[selfSeat]?.space ?? null;
  const i = spec.indexOf(':');
  const [kind, name] = i === -1 ? ['tile', spec] : [spec.slice(0, i), spec.slice(i + 1)];
  for (const t of s.tiles) {
    const def = tileDef(t.tileId);
    if (kind === 'space') {
      const sp = def.spaces.find((x) => (x.named ?? '').toLowerCase() === name.toLowerCase());
      if (sp) return spaceRef(t.uid, sp.id);
    } else if (def.name.toLowerCase() === name.toLowerCase()) {
      if (kind === 'tile') {
        const sp = def.spaces.find((x) => x.named) ?? def.spaces[0];
        return spaceRef(t.uid, sp.id);
      }
      if (kind === 'anySpawn') {
        const sp = def.spaces.find((x) => x.icons.some((ic) => ic.startsWith('enemy')));
        if (sp) return spaceRef(t.uid, sp.id);
      }
      if (kind.startsWith('enemy')) {
        const sp = def.spaces.find((x) => x.icons.includes(kind))
          ?? def.spaces.find((x) => x.icons.some((ic) => ic.startsWith('enemy')));
        if (sp) return spaceRef(t.uid, sp.id);
      }
    }
  }
  return null;
};

const enemyIdByName = (name: string): string | null =>
  Object.keys(BB_ENEMIES).find((k) => BB_ENEMIES[k].name.toLowerCase() === name.toLowerCase()) ?? null;
const bossIdByName = (name: string): string | null =>
  Object.keys(BB_BOSSES).find((k) => BB_BOSSES[k].name.toLowerCase() === name.toLowerCase()) ?? null;
const tileUidByName = (s: BbState, name: string): number | null =>
  s.tiles.find((t) => tileDef(t.tileId).name.toLowerCase() === name.toLowerCase())?.uid ?? null;

// ---------- effects ----------

type Fx = Record<string, unknown>;

export const applyMissionEffects = (s: BbState, card: string, effects: Fx[]): void => {
  const ms = missionState(s);
  for (const fx of effects) {
    switch (fx.do) {
      case 'reveal': revealMission(s, String(fx.card)); break;
      case 'completeHunt': completeHunt(s); break;
      case 'insight': collectInsight(s, card); break;
      case 'reward': grantReward(s, fx); break;
      case 'specialRule': if (!s.specialRules.includes(String(fx.rule))) s.specialRules.push(String(fx.rule)); break;
      case 'lockMission': {
        if (!ms.lockedMissions.includes(String(fx.card))) ms.lockedMissions.push(String(fx.card));
        break;
      }
      case 'arena': {
        const tile = String(fx.tile);
        const uid = tileUidByName(s, tile);
        const enemyId = enemyIdByName(String(fx.enemy));
        if (uid == null || !enemyId) { surface(s, card, `arena ${tile}`); break; }
        // fog gates + clear + spawn 1 tagged enemy on the tile's spawn space
        fogGate(s, uid, card);
        const space = findSpace(s, `anySpawn:${tile}`) ?? findSpace(s, `tile:${tile}`);
        if (space) spawnEnemy(s, enemyId, space, card);
        const e = s.enemies.find((x) => x.missionTag === card);
        if (e && fx.immuneToTileText) {
          ms.enemyMods.push({ tag: card, hpPool: 0, hpPoolMax: 0, replace: {}, immuneTileText: true });
        }
        evt(s, `${BB_ENEMIES[enemyId].name.toUpperCase()} AWAITS BEHIND THE FOG`, 'arena');
        break;
      }
      case 'hpPool': {
        const n = nTokens(s, fx.tokens);
        let mod = ms.enemyMods.find((m) => m.tag === fx.tag);
        if (!mod) { mod = { tag: String(fx.tag), hpPool: 0, hpPoolMax: 0, replace: {} }; ms.enemyMods.push(mod); }
        mod.hpPool = n;
        mod.hpPoolMax = n;
        break;
      }
      case 'clearHpPool': {
        const mod = ms.enemyMods.find((m) => m.tag === fx.tag);
        if (mod) { mod.hpPool = 0; mod.hpPoolMax = 0; }
        break;
      }
      case 'replaceAttack': {
        let mod = ms.enemyMods.find((m) => m.tag === fx.tag);
        if (!mod) { mod = { tag: String(fx.tag), hpPool: 0, hpPoolMax: 0, replace: {} }; ms.enemyMods.push(mod); }
        mod.replace[String(fx.slot) as 'basic' | 'special' | 'ability'] = fx.attack;
        break;
      }
      case 'fogGates': {
        const uid = tileUidByName(s, String(fx.tile));
        if (uid != null) fogGate(s, uid, card);
        break;
      }
      case 'removeFogGates': {
        const uids = fx.tile != null ? [tileUidByName(s, String(fx.tile))].filter((x): x is number => x != null) : [...s.fogGates];
        s.fogGates = s.fogGates.filter((u) => !uids.includes(u));
        s.brokenLamps = s.brokenLamps.filter((r) => !uids.includes(parseRef(r).uid));
        break;
      }
      case 'spawnBoss': {
        const id = bossIdByName(String(fx.boss)) ?? String(fx.boss);
        const def = BB_BOSSES[id];
        const space = findSpace(s, String(fx.space)) ?? s.hunters.find((h) => h.space)?.space;
        if (!def || !space) { surface(s, card, `spawnBoss ${fx.boss}`); break; }
        s.bosses.push({
          uid: s.nextUid++, type: id, space, phase: 1, damage: 0,
          actionDeck: bbShuffle(s, def.phases[0].map((_, i) => i)), actionDiscard: [], missionTag: card,
        });
        evt(s, `${def.name.toUpperCase()} APPEARS`, 'boss');
        break;
      }
      case 'spawnEnemy': {
        const id = enemyIdByName(String(fx.enemy)) ?? String(fx.enemy);
        const space = findSpace(s, String(fx.space));
        if (!BB_ENEMIES[id] || !space) { surface(s, card, `spawnEnemy ${fx.enemy}`); break; }
        const n = Number(fx.count ?? 1) * (fx.perHunter ? s.partySize : 1);
        // mission tag makes it survive/respawn on reset (resetMap keeps tagged)
        for (let i = 0; i < n; i++) spawnEnemy(s, id, space, fx.respawnOnReset === false ? undefined : card);
        break;
      }
      case 'spawnNpc': {
        const id = enemyIdByName(String(fx.enemy)) ?? String(fx.enemy);
        const space = findSpace(s, String(fx.space));
        if (!BB_ENEMIES[id] || !space) { surface(s, card, `spawnNpc ${fx.enemy}`); break; }
        s.enemies.push({ uid: s.nextUid++, type: id, space, damage: 0, missionTag: card, npc: true });
        evt(s, `${BB_ENEMIES[id].name.toUpperCase()} STANDS IN YOUR WAY`, 'npc');
        break;
      }
      case 'bossOverride': {
        const id = bossIdByName(String(fx.boss)) ?? String(fx.boss);
        ms.bossMods[id] = { ...(ms.bossMods[id] ?? {}), ...(fx.set as BbBossMod) };
        break;
      }
      case 'survivor': {
        const space = fx.space === 'self' ? (s.hunters[s.activeSeat ?? 0]?.space ?? null) : findSpace(s, String(fx.space));
        ms.tokens.push({
          id: String(fx.id), space, carriedBy: null, fleeing: false, movesAwayPerTurn: 0,
          pickup: (fx.pickup as 'moveOut' | 'interact') ?? 'moveOut',
          onLose: (fx.onLose as 'return' | 'drop' | 'lost') ?? 'lost',
          homeSpace: space,
        });
        break;
      }
      case 'tokenFlee': {
        const tok = ms.tokens.find((t) => t.id === fx.id);
        if (!tok || !tok.space) break;
        tok.fleeing = true;
        tok.movesAwayPerTurn = Number(fx.movesAwayPerTurn ?? 1);
        // initial dash: move `distance` spaces away from the nearest hunter
        for (let i = 0; i < Number(fx.distance ?? 4); i++) fleeStep(s, tok);
        break;
      }
      case 'npcFollower': {
        const space = findSpace(s, String(fx.space));
        ms.tokens.push({ id: String(fx.id), space, carriedBy: null, fleeing: false, movesAwayPerTurn: 0, pickup: 'moveOut', onLose: 'drop', homeSpace: space });
        break;
      }
      case 'counter': {
        const inst = s.missions[card];
        if (inst) inst.tokens = nTokens(s, fx.tokens);
        break;
      }
      case 'tileLock': {
        if (!ms.lockedTiles.includes(String(fx.tile))) ms.lockedTiles.push(String(fx.tile));
        break;
      }
      case 'tileUnlock': {
        ms.lockedTiles = ms.lockedTiles.filter((t) => t !== String(fx.tile));
        break;
      }
      case 'discardIfInsightCard': {
        if (s.insightCards.includes(String(fx.card))) {
          const inst = s.missions[String(fx.discard)];
          if (inst) inst.completed = true;
        }
        break;
      }
      case 'placeTokens': {
        const inst = s.missions[card];
        const count = nTokens(s, fx.count);
        if (fx.where === 'card' && inst) inst.tokens += count;
        else {
          const space = findSpace(s, String(fx.where));
          if (space) {
            if (fx.token === 'insight') s.insightTokens[space] = (s.insightTokens[space] ?? 0) + count;
            else if (fx.token === 'corpse') for (let i = 0; i < count; i++) s.corpseTokens.push(space);
            else for (let i = 0; i < count; i++) s.survivorTokens.push(space);
          }
        }
        break;
      }
      case 'custom':
        surface(s, card, String(fx.id));
        break;
      default:
        surface(s, card, String(fx.do));
        break;
    }
  }
};

const surface = (s: BbState, card: string, what: string): void => {
  const key = `${card}:${what}`;
  if (!s.specialRules.includes(key)) s.specialRules.push(key);
};

const fogGate = (s: BbState, uid: number, card: string): void => {
  if (!s.fogGates.includes(uid)) s.fogGates.push(uid);
  const t = s.tiles.find((x) => x.uid === uid)!;
  for (const sp of tileDef(t.tileId).spaces) {
    if (sp.icons.includes('lamp')) {
      const ref = spaceRef(uid, sp.id);
      if (!s.brokenLamps.includes(ref)) s.brokenLamps.push(ref);
    }
  }
  s.enemies = s.enemies.filter((e) => parseRef(e.space).uid !== uid || e.missionTag === card);
};

const fleeStep = (s: BbState, tok: BbMissionToken): void => {
  if (!tok.space) return;
  const hunters = s.hunters.filter((h) => h.space);
  if (!hunters.length) return;
  const options = spaceNeighbors(s, tok.space, 'hunter');
  if (!options.length) return;
  const score = (ref: BbSpaceRef): number =>
    Math.min(...hunters.map((h) => bfsFrom(s, ref, 'hunter').get(h.space!) ?? 0));
  // flee = maximize distance to the nearest hunter (Intelligent & Cruel:
  // deterministic highest-score, lowest-ref tiebreak)
  const best = [...options].sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1))[0];
  if (score(best) >= score(tok.space)) tok.space = best;
};

const collectInsight = (s: BbState, card: string): void => {
  s.insightCollected++;
  missionState(s).insightThisChapter++;
  if (!s.insightCards.includes(card)) s.insightCards.push(card);
  evt(s, `INSIGHT COLLECTED (${s.insightCollected})`, 'insight');
};

const completeHunt = (s: BbState): void => {
  if (s.phase === 'ended') return;
  s.phase = 'ended';
  s.outcome = 'victory';
  s.campaignStore = {
    hunterDecks: Object.fromEntries(s.hunters.map((h) => [h.seat, [...h.deck, ...h.discard, ...h.hand, ...h.slots.filter(Boolean) as string[]]])),
    firearms: Object.fromEntries(s.hunters.map((h) => [h.seat, h.firearmId])),
    rewards: Object.fromEntries(s.hunters.map((h) => [h.seat, h.rewards.map((r) => r.id)])),
    consumables: Object.fromEntries(s.hunters.map((h) => [h.seat, [...h.consumables]])),
    insightCards: [...s.insightCards],
  };
  evt(s, 'THE HUNT IS COMPLETE · VICTORY', 'victory');
};

const grantReward = (s: BbState, fx: Fx): void => {
  const seat = s.activeSeat ?? 0;
  const h = s.hunters[seat];
  if (fx.item) {
    const want = String(fx.item).toLowerCase().replace(/^caryll rune:\s*/, 'caryll rune: ');
    const id = Object.keys(BB_ITEMS).find((k) => BB_ITEMS[k].name.toLowerCase() === want)
      ?? Object.keys(BB_ITEMS).find((k) => BB_ITEMS[k].name.toLowerCase().includes(String(fx.item).toLowerCase().replace(/^caryll rune:\s*/, '')));
    if (!id) { surface(s, 'reward', String(fx.item)); return; }
    const it = BB_ITEMS[id];
    if (it.kind === 'firearm') h.firearmId = id;
    else if (it.kind === 'tool' || it.kind === 'rune') h.rewards.push({ id, exhausted: false });
    else h.consumables.push(id);
    evt(s, `REWARD · ${it.name.toUpperCase()}`, 'reward');
  }
  if (fx.consumables) {
    for (let i = 0; i < Number(fx.consumables); i++) {
      const c = s.consumableDeck.shift();
      if (c) h.consumables.push(c);
    }
  }
  if (fx.echoes) h.echoes = Math.min(3, h.echoes + Number(fx.echoes));
};

// ---------- reveal ----------

export const revealMission = (s: BbState, number: string): void => {
  const def = defsFor(s)[number];
  if (!def || s.missions[number]?.revealed) return;
  s.missions[number] = { number, revealed: true, completed: false, tokens: 0, vars: {} };
  const kindLabel = def.kind === 'hunt' ? 'HUNT MISSION' : def.kind === 'insight' ? 'INSIGHT MISSION' : def.kind === 'insight-reward' ? 'INSIGHT' : 'CARD';
  evt(s, `${kindLabel} ${number} · ${(def.title || '').toUpperCase()}`, 'reveal-mission');
  const hooks = (def as { hooks?: Record<string, unknown> }).hooks;
  if (hooks) missionState(s).hooks[number] = hooks;
  if (def.onReveal) applyMissionEffects(s, number, def.onReveal as unknown as Fx[]);
  if (def.kind === 'insight-reward') {
    applyMissionEffects(s, number, [{ do: 'insight' }]);
    s.missions[number].completed = true;
  }
  // choice goals prompt immediately on reveal
  const goal = def.goal as { type?: string; params?: { options?: { label: string }[]; cases?: unknown[] } } | undefined;
  if (goal?.type === 'choice') {
    s.pending.push({ seat: s.activeSeat ?? 0, kind: 'mission-choice', card: number, options: (goal.params?.options ?? []).map((o) => o.label) });
  }
  if (goal?.type === 'branch') {
    resolveBranch(s, number);
  }
};

const resolveBranch = (s: BbState, number: string): void => {
  const def = defsFor(s)[number];
  const goal = def?.goal as { params?: { cases?: Record<string, unknown>[] } } | undefined;
  const inst = s.missions[number];
  if (!goal || !inst || inst.completed) return;
  for (const c of goal.params?.cases ?? []) {
    const has = (n: unknown): boolean => s.insightCards.includes(String(n));
    let match = false;
    if (c.ifInsightCardsAll) match = (c.ifInsightCardsAll as unknown[]).every(has);
    else if (c.ifInsightCardAny) match = (c.ifInsightCardAny as unknown[]).some(has);
    else if (c.ifInsightCard) match = has(c.ifInsightCard);
    else if (c.else) match = true;
    if (match && c.notInsightCard && has(c.notInsightCard)) match = false;
    if (match) {
      inst.completed = true;
      revealMission(s, String(c.reveal));
      return;
    }
  }
};

// ---------- chapter start ----------

interface BbTrigger {
  on: string;
  tile?: string;
  reveal?: string;
  space?: number;
  cases?: { ifInsightCard?: string; notInsightCard?: string; else?: boolean; reveal: string }[];
}

export const bbMissionOnReveal = (s: BbState, hook: 'chapter-start'): void => {
  if (hook !== 'chapter-start') return;
  resetMissionState(s);
  const defs = defsFor(s);
  const chKey = `Chapter ${s.chapter} - Setup`;
  const ch = defs[chKey] as (BbMissionDef & { triggers?: BbTrigger[] }) | undefined;
  const chDef = BB_CAMPAIGNS[s.campaignId].chapters[s.chapter - 1];
  // special-rules cards flip faceup at setup (p. 10)
  for (const n of chDef.extraCards ?? []) revealMission(s, n);
  for (const t of ch?.triggers ?? []) {
    if (t.on === 'startOfHunt' && t.reveal) revealMission(s, t.reveal);
    if (t.on === 'startOfHuntBranch') {
      for (const c of t.cases ?? []) {
        const has = (n?: string): boolean => (n ? s.insightCards.includes(n) : false);
        let match = c.else ? true : has(c.ifInsightCard);
        if (match && c.notInsightCard && has(c.notInsightCard)) match = false;
        if (match) { revealMission(s, c.reveal); break; }
      }
    }
  }
};

// ---------- events / goal checks ----------

export const bbMissionEvent = (s: BbState, ev: BbMissionEventArg): void => {
  const defs = defsFor(s);
  const ms = missionState(s);

  // --- token behaviours ---
  if (ev.type === 'moveOut') {
    for (const tok of ms.tokens) {
      if (tok.space === ev.from && tok.pickup === 'moveOut' && tok.carriedBy == null && !tok.fleeing) {
        tok.carriedBy = ev.seat;
        tok.space = null;
        evt(s, 'SURVIVOR IN TOW', 'token');
      }
    }
  }
  if (ev.type === 'consumablePickup') {
    for (const [card, hooks] of Object.entries(ms.hooks)) {
      if (hooks.survivorOnConsumablePickup && !s.missions[card]?.completed && !ms.lockedMissions.includes(card)) {
        const h = s.hunters[ev.seat];
        const carried = ((h as unknown as { carriedSurvivors?: number }).carriedSurvivors ?? 0) + 1;
        (h as unknown as { carriedSurvivors?: number }).carriedSurvivors = carried;
        evt(s, 'A SURVIVOR FOLLOWS YOU', 'token');
      }
    }
  }
  if (ev.type === 'endMove') {
    const tileName = tileDef(ev.tileId).name;
    // drop carried survivors onto counter cards
    for (const [card, hooks] of Object.entries(ms.hooks)) {
      const inst = s.missions[card];
      if (!inst || inst.completed || ms.lockedMissions.includes(card)) continue;
      if (hooks.dropSurvivorsOnTile && String(hooks.dropSurvivorsOnTile).toLowerCase() === tileName.toLowerCase()) {
        const h = s.hunters[ev.seat] as unknown as { carriedSurvivors?: number };
        const n = h.carriedSurvivors ?? 0;
        if (n > 0) {
          h.carriedSurvivors = 0;
          inst.vars.delivered = (inst.vars.delivered ?? 0) + n;
          evt(s, `${n} SURVIVOR${n > 1 ? 'S' : ''} DELIVERED`, 'token');
        }
      }
      if (hooks.dropCorpsesOnTile && String(hooks.dropCorpsesOnTile).toLowerCase() === tileName.toLowerCase()) {
        const h = s.hunters[ev.seat] as unknown as { carriedCorpses?: number };
        const n = h.carriedCorpses ?? 0;
        if (n > 0) {
          h.carriedCorpses = 0;
          inst.vars.delivered = (inst.vars.delivered ?? 0) + n;
          evt(s, `${n} CORPSE TOKEN${n > 1 ? 'S' : ''} PLACED`, 'token');
        }
      }
    }
  }
  if (ev.type === 'enemySlain') {
    for (const [card, hooks] of Object.entries(ms.hooks)) {
      const inst = s.missions[card];
      if (!inst || inst.completed) continue;
      if (hooks.corpseOnSlay && enemyIdByName(String(hooks.corpseOnSlay)) === ev.enemyType && ev.bySeat != null) {
        const h = s.hunters[ev.bySeat] as unknown as { carriedCorpses?: number };
        h.carriedCorpses = (h.carriedCorpses ?? 0) + 1;
      }
      if (hooks.decrementOnSlay && enemyIdByName(String(hooks.decrementOnSlay)) === ev.enemyType) {
        inst.tokens = Math.max(0, inst.tokens - 1);
      }
      if (hooks.decrementOnSlayTypesAtNpc) {
        const types = (hooks.decrementOnSlayTypesAtNpc as string[]).map((n) => enemyIdByName(n));
        const npcTok = ms.tokens.find((t) => t.id === card);
        const npcSpace = npcTok?.carriedBy != null ? s.hunters[npcTok.carriedBy].space : npcTok?.space;
        if (types.includes(ev.enemyType) && ev.space && npcSpace === ev.space) {
          inst.tokens = Math.max(0, inst.tokens - 1);
        }
      }
    }
  }
  if (ev.type === 'missionDiscard') {
    for (const [card, hooks] of Object.entries(ms.hooks)) {
      const inst = s.missions[card];
      if (!inst || inst.completed) continue;
      if (hooks.discardConsumablesOnTileDecrements && String(hooks.discardConsumablesOnTileDecrements).toLowerCase() === ev.tile.toLowerCase()) {
        inst.tokens = Math.max(0, inst.tokens - ev.count);
      }
    }
  }
  if (ev.type === 'roundEnd') {
    // fleeing tokens creep away; boss bonus activations handled in actions.ts
    for (const tok of ms.tokens) {
      if (tok.fleeing && tok.space) for (let i = 0; i < tok.movesAwayPerTurn; i++) fleeStep(s, tok);
    }
  }

  // --- goal checks on revealed cards ---
  for (const [number, inst] of Object.entries(s.missions)) {
    if (!inst.revealed || inst.completed || ms.lockedMissions.includes(number)) continue;
    const def = defs[number];
    const goal = def?.goal as { type: string; params?: Record<string, unknown>; completesMission: boolean; onComplete: Fx[] } | undefined;
    if (!goal) continue;
    let done = false;
    const P = goal.params ?? {};
    switch (goal.type) {
      case 'endMoveOnTile':
        done = ev.type === 'endMove'
          && tileDef(ev.tileId).name.toLowerCase() === String(P.tile ?? '').toLowerCase()
          && s.insightCollected >= Number(P.insight ?? 0);
        break;
      case 'slayTagged':
        done = ev.type === 'enemySlain' && ev.missionTag === String(P.tag)
          && !s.enemies.some((e) => e.missionTag === String(P.tag));
        break;
      case 'slayTypeOnTile': {
        if (ev.type !== 'enemySlain' || !ev.space) break;
        const types = (P.enemies as string[]).map((n) => enemyIdByName(n));
        const uid = tileUidByName(s, String(P.tile));
        done = types.includes(ev.enemyType) && uid != null && parseRef(ev.space).uid === uid;
        break;
      }
      case 'slayBoss':
        done = ev.type === 'bossSlain' && (bossIdByName(String(P.boss ?? '')) === ev.boss || !P.boss);
        break;
      case 'bossPhase2':
        done = ev.type === 'bossPhase2' && bossIdByName(String(P.boss ?? '')) === ev.boss;
        break;
      case 'bossEntersTile': {
        if (ev.type !== 'bossMoved') break;
        const uid = tileUidByName(s, String(P.tile));
        done = bossIdByName(String(P.boss ?? '')) === ev.boss && uid != null && ev.tileUid === uid;
        break;
      }
      case 'escortTokenTo': {
        if (ev.type !== 'endMove') break;
        const tok = ms.tokens.find((t) => t.id === String(P.id));
        if (!tok || tok.carriedBy !== ev.seat) break;
        const tileName = tileDef(ev.tileId).name.toLowerCase();
        if (P.tiles) {
          const hit = (P.tiles as { tile: string; reveal: string }[]).find((t) => t.tile.toLowerCase() === tileName);
          if (hit) {
            done = true;
            inst.vars.branchReveal = Number(hit.reveal);
            tok.carriedBy = null;
          }
        } else if (String(P.tile ?? '').toLowerCase() === tileName) {
          done = true;
          tok.carriedBy = null;
        }
        break;
      }
      case 'interactToken': {
        if (ev.type !== 'interact') break;
        const tok = ms.tokens.find((t) => t.id === String(P.id));
        done = !!tok && tok.space === ev.space;
        break;
      }
      case 'endMoveOnToken': {
        if (ev.type !== 'endMove') break;
        const tok = ms.tokens.find((t) => t.id === String(P.id));
        if (!tok || tok.space !== ev.space) break;
        // "no Enemies Pursue into that space" — reducer records pursuit
        done = !(s as unknown as { pursuedIntoLastMove?: boolean }).pursuedIntoLastMove;
        if (done) { tok.fleeing = false; tok.carriedBy = ev.seat; tok.space = null; }
        break;
      }
      case 'counterAtLeast':
        done = (inst.vars.delivered ?? 0) >= nTokens(s, P.count);
        break;
      case 'counterExhausted':
        done = inst.tokens <= 0;
        break;
      case 'insightThisChapter':
        done = ms.insightThisChapter >= nTokens(s, P.count ?? 0);
        break;
      case 'insightThisChapterOrTrack':
        done = ms.insightThisChapter >= nTokens(s, P.count ?? 0)
          || (ev.type === 'trackAdvanced' && ev.space >= Number(P.trackSpace ?? 99))
          || s.huntTrack >= Number(P.trackSpace ?? 99);
        break;
      case 'choice':
        done = ev.type === 'choice' && ev.card === number;
        if (done) {
          const opt = (P.options as { label: string; reveal: string }[]).find((o) => o.label === (ev as { option: string }).option);
          if (opt) inst.vars.branchReveal = Number(opt.reveal);
        }
        break;
      case 'branch':
        // resolved at reveal
        break;
      default:
        break;
    }
    if (done) {
      inst.completed = true;
      evt(s, `${(def.title || '').toUpperCase()} ${goal.completesMission ? 'COMPLETE' : 'ADVANCES'}`, 'mission-done');
      if (inst.vars.branchReveal) revealMission(s, String(inst.vars.branchReveal));
      applyMissionEffects(s, number, goal.onComplete);
    }
  }

  // --- unrevealed trigger cards (chapter card table) ---
  const chKey = `Chapter ${s.chapter} - Setup`;
  const ch = defs[chKey] as (BbMissionDef & { triggers?: BbTrigger[] }) | undefined;
  for (const t of ch?.triggers ?? []) {
    if (!t.reveal || s.missions[t.reveal]?.revealed) continue;
    if (t.on === 'endMoveOnTile' && ev.type === 'endMove'
      && tileDef(ev.tileId).name.toLowerCase() === (t.tile ?? '').toLowerCase()) {
      revealMission(s, t.reveal);
    }
    // Hunt Track reaching a given space (e.g. the 1st reset at 4)
    if ((t.on === 'huntTrackSpace' || t.on === 'huntTrackFirstReset')
      && ((ev.type === 'trackAdvanced' && ev.space >= (t.space ?? 4)) || s.huntTrack >= (t.space ?? 4))) {
      revealMission(s, t.reveal);
    }
    if (t.on === 'tileRevealed' && ev.type === 'tileRevealed'
      && tileDef(ev.tileId).name.toLowerCase() === (t.tile ?? '').toLowerCase()) {
      revealMission(s, t.reveal);
    }
  }
};

/** mission interactables on a space (Interact legality + resolution) */
export const bbMissionInteractables = (s: BbState, seat: number, space: BbSpaceRef): string[] => {
  const out: string[] = [];
  const ms = missionState(s);
  for (const tok of ms.tokens) {
    if (tok.space === space && tok.pickup === 'interact') out.push(`token:${tok.id}`);
  }
  const defs = defsFor(s);
  for (const [number, inst] of Object.entries(s.missions)) {
    if (!inst.revealed || inst.completed || ms.lockedMissions.includes(number)) continue;
    const goal = defs[number]?.goal as { type?: string; params?: Record<string, unknown> } | undefined;
    if (goal?.type === 'interactOnSpace') {
      const target = findSpace(s, String(goal.params?.space ?? ''));
      if (target === space) out.push(number);
    }
  }
  return out;
};
