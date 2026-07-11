// Dark Souls device: client-side legality mirrors. Every button greys out with
// an inline reason instead of bouncing an engine error (playbook §5). Each
// mirror follows the reducer in shared/src/darksouls/actions.ts exactly; a
// disagreement between a mirror and the engine is a bug.

import {
  DS_TREASURE_BY_ID, DS_ENEMIES, DS_INVADERS, DS_BOSSES, DS_CLASSES,
  DS_LEVEL_COSTS_CAMPAIGN, DS_LEVEL_COSTS_STANDARD,
  dsTileGraph, dsNodeDistance,
  type DsView, type DsCharacter, type DsArc, type DsStat,
  type DsTreasureCard, type DsEnemyModel, type DsBossUnit, type DsSpellEffect,
} from '@bge/shared';

// view characters carry resolved stats + names
export type DsVChar = DsCharacter & { stats: Record<DsStat, number>; taunt: number; className: string };

// rulebook constants not exported from shared/config (mirrored; see config.ts)
export const ENDURANCE_BOXES = 10;
export const TREASURE_COST = (v: DsView): number => (v.campaign ? 2 : 1);
export const LUCK_RESTORE_COST = 1;
export const SELLBACK_SOULS = 1;
export const SPARK_COST = (v: DsView): number => 2 * v.options.partySize;

export const levelCosts = (v: DsView): number[] => (v.campaign ? DS_LEVEL_COSTS_CAMPAIGN : DS_LEVEL_COSTS_STANDARD);

export const freeBoxes = (ch: DsCharacter): number => ENDURANCE_BOXES - ch.stamina - ch.damage;
export const canSpend = (ch: DsCharacter, n: number): boolean => freeBoxes(ch) >= n;
export const dodgeStamina = (ch: DsCharacter): number => 1 + (ch.conditions.includes('frostbite') ? 1 : 0);

export const enemyDef = (e: DsEnemyModel) => (e.invader ? DS_INVADERS[e.typeId].data : DS_ENEMIES[e.typeId].data);
export const enemyAlive = (e: DsEnemyModel): boolean => e.wounds < enemyDef(e).health;

export function meetsReqs(ch: DsVChar, card: DsTreasureCard): boolean {
  const req = card.requirements ?? { str: 0, dex: 0, int: 0, fai: 0 };
  return (['str', 'dex', 'int', 'fai'] as DsStat[]).every((st) => ch.stats[st] >= (req[st] ?? 0));
}

export function meetsReqsEquipped(ch: DsVChar, eq: { cardId: string; upgrades: string[] }): boolean {
  if (!meetsReqs(ch, DS_TREASURE_BY_ID[eq.cardId])) return false;
  return eq.upgrades.every((u) => meetsReqs(ch, DS_TREASURE_BY_ID[u]));
}

// ---------- occupancy / terrain (mirror of state.ts helpers over the view) ----------

export function occupancy(v: DsView, nodeId: string): number {
  const chars = v.characters.filter((c) => c.nodeId === nodeId).length;
  const enemies = (v.encounter?.enemies ?? []).filter((e) => e.nodeId === nodeId).length;
  const units = (v.boss?.units ?? []).filter((u) => u.inPlay && u.nodeId === nodeId).length;
  return chars + enemies + units;
}

export function nodeBlocked(v: DsView, nodeId: string): boolean {
  const enc = v.encounter;
  if (!enc) return false;
  for (const t of enc.terrain) {
    if (t.nodeId !== nodeId) continue;
    if (t.piece === 'gravestone') return true;
    if (t.piece === 'barrel' && !t.destroyed) return true;
    if (t.piece === 'chest' || t.piece === 'mimic-chest') {
      const tile = enc.tileId ? v.tiles.find((x) => x.id === enc.tileId) : null;
      return tile?.chests[nodeId] !== 'open';
    }
  }
  return false;
}

export const bossUnitAt = (v: DsView, nodeId: string): DsBossUnit | null =>
  v.boss?.units.find((u) => u.inPlay && u.nodeId === nodeId) ?? null;

// ---------- global action gate ----------

/** Why no board action is possible at all right now (null = actions open). */
export function globalGate(v: DsView, seat: number): string | null {
  if (v.winner !== null) return 'THE GAME IS OVER';
  if (v.pendings.length > 0) {
    const head = v.pendings[0];
    return head.seat === seat ? 'DECISION PENDING' : `WAITING · ${v.characters[head.seat]?.className?.toUpperCase() ?? `SEAT ${head.seat + 1}`} DECIDES`;
  }
  if (v.busy) return 'ENEMIES ACT · WATCH THE TABLE';
  return null;
}

export function activationGate(v: DsView, seat: number): string | null {
  const g = globalGate(v, seat);
  if (g) return g;
  if (v.phase !== 'encounter' && v.phase !== 'bossEncounter') return 'NO ENCOUNTER RUNNING';
  const enc = v.encounter;
  if (!enc || enc.turn !== 'characters') return 'ENEMY ACTIVATION';
  if (enc.activeSeat !== seat) return `${v.characters[enc.activeSeat]?.className?.toUpperCase() ?? 'ANOTHER HERO'} IS ACTING`;
  if (!v.characters[seat].act) return 'ACTIVATION NOT STARTED';
  return null;
}

// ---------- movement (mirror of doMove) ----------

export interface MoveTarget { nodeId: string; cost: number; overflow: boolean }

export interface MovePlan {
  reason: string | null; // button-level disable reason
  targets: MoveTarget[];
  arcSteps: DsArc[]; // rotate around the boss (on a boss node)
  cost: number; // base cost shown on the button
}

const ARC_ADJ: Record<DsArc, DsArc[]> = {
  front: ['left', 'right'], back: ['left', 'right'],
  left: ['front', 'back'], right: ['front', 'back'],
};

export function movePlan(v: DsView, seat: number, run: boolean): MovePlan {
  const empty: MovePlan = { reason: null, targets: [], arcSteps: [], cost: run ? 1 : 0 };
  const gate = activationGate(v, seat);
  if (gate) return { ...empty, reason: gate };
  const ch = v.characters[seat];
  const act = ch.act!;
  const free = act.freeMoves > 0;
  const baseCost = free ? 0 : (run ? 1 : 0) + (ch.conditions.includes('frostbite') ? 1 : 0);
  if (!free && (act.stage === 'attack' || act.stage === 'post') && act.movedBefore) {
    return { ...empty, cost: baseCost, reason: 'MOVES GROUP BEFORE OR AFTER ATTACKS' };
  }
  if (!run && !free && act.walkUsed) return { ...empty, cost: baseCost, reason: 'WALK ALREADY USED' };

  const enc = v.encounter!;
  const g = dsTileGraph(enc.faceId);
  const unit = bossUnitAt(v, ch.nodeId!);
  const targets: MoveTarget[] = [];
  for (const n of g.adj[ch.nodeId!] ?? []) {
    if (unit && ch.arc && unit.facing) {
      // leaving a boss node keeps the arc (core p.28)
      const a = g.nodeById[unit.nodeId!];
      const b = g.nodeById[n];
      const arcs = arcsOf(unit.facing, b.x - a.x, b.y - a.y);
      if (!arcs.includes(ch.arc)) continue;
    }
    const barrel = enc.terrain.some((t) => t.nodeId === n && t.piece === 'barrel' && !t.destroyed);
    if (nodeBlocked(v, n) && !barrel) continue;
    const cost = free ? (barrel ? 1 : 0) : baseCost + (barrel ? 1 : 0);
    if (!canSpend(ch, cost)) continue;
    targets.push({ nodeId: n, cost, overflow: occupancy(v, n) >= 3 });
  }
  const arcSteps: DsArc[] = unit && ch.arc && canSpend(ch, baseCost) ? ARC_ADJ[ch.arc] : [];
  if (targets.length === 0 && arcSteps.length === 0) {
    return {
      ...empty, cost: baseCost,
      reason: !canSpend(ch, baseCost) ? 'NOT ENOUGH STAMINA' : 'NO LEGAL NODE',
    };
  }
  return { reason: null, targets, arcSteps, cost: baseCost };
}

/** Mirror of state.ts dsArcsOf (front/left/right/back with 45° boundaries). */
export function arcsOf(f: [number, number], dx: number, dy: number): DsArc[] {
  if (dx === 0 && dy === 0) return [];
  const fw = f[0] * dx + f[1] * dy;
  const side = f[0] * dy - f[1] * dx;
  const arcs: DsArc[] = [];
  const eps = 1e-6 * (Math.abs(fw) + Math.abs(side));
  if (fw > Math.abs(side) - eps && fw > 0) arcs.push('front');
  if (-fw > Math.abs(side) - eps && fw < 0) arcs.push('back');
  if (side > Math.abs(fw) - eps && side > 0) arcs.push('right');
  if (-side > Math.abs(fw) - eps && side < 0) arcs.push('left');
  return arcs;
}

// ---------- attacks (mirror of doAttack + parseIcons) ----------

export interface ParsedIcons {
  magic: boolean; node: boolean; shaft: boolean; push: boolean;
  range: number | null; repeat: number; shift: number;
  conditions: string[];
}

export function parseIcons(action: { icons?: string[] }): ParsedIcons {
  const p: ParsedIcons = { magic: false, node: false, shaft: false, push: false, range: null, repeat: 1, shift: 0, conditions: [] };
  for (const icon of action.icons ?? []) {
    if (icon === 'magic') p.magic = true;
    else if (icon === 'node') p.node = true;
    else if (icon === 'shaft') p.shaft = true;
    else if (icon === 'push') p.push = true;
    else if (icon.startsWith('range:')) p.range = Number(icon.slice(6));
    else if (icon.startsWith('repeat:')) p.repeat = Number(icon.slice(7));
    else if (icon.startsWith('shift:')) p.shift += Number(icon.split(':')[1]);
    else if (['bleed', 'poison', 'frostbite', 'stagger'].includes(icon)) p.conditions.push(icon);
    // glyph aliases (sheet-crop verified, mirrors the reducer's parseIcons):
    // shield-bash IS the stagger icon; dot-in-arc IS the node icon
    else if (icon === 'shield-bash') p.conditions.push('stagger');
    else if (icon === 'dot-in-arc') p.node = true;
  }
  return p;
}

export interface AttackTarget {
  kind: 'enemy' | 'boss';
  uid?: number;
  unitKey?: string;
  nodeId: string;
  label: string;
}

export interface AttackChoice {
  hand: 'L' | 'R';
  option: number;
  card: DsTreasureCard;
  name: string;
  dice: Partial<Record<'black' | 'blue' | 'orange', number>>;
  flat: number;
  cost: number;
  range: number;
  icons: ParsedIcons;
  reason: string | null;
  targets: AttackTarget[];
  /** spell DSL cast (no dice): the summary shown instead of dice chips; the
   * engine resolves targets via a spellTarget pending, so no pick mode */
  cast?: string;
}

/** Plain-words summary for a cast option (printed text when the card has it,
 * otherwise derived from the verified icon reading). */
function castSummary(action: { text?: string; effect?: DsSpellEffect }, icons: ParsedIcons): string {
  if (action.text) return action.text;
  const fx = action.effect!;
  if (fx.kind === 'afflict') {
    const what = [...icons.conditions, ...(icons.push ? ['push'] : [])].join(' + ') || 'afflict';
    if (fx.node) return `${what} every enemy on one node within range`;
    if ((fx.targets ?? 1) > 1) return `${what} up to ${fx.targets} enemies within range`;
    return `${what} one target within range`;
  }
  if (fx.kind === 'shift') return `Shift ${fx.nodes}: free movement`;
  if (fx.kind === 'rapport') return `An enemy sharing a node with another enemy suffers ${fx.damage}`;
  return 'See the card';
}

/** Mirror of doCastSpell's pre-payment target validation. */
function castTargetReason(v: DsView, ch: DsVChar, fx: DsSpellEffect, icons: ParsedIcons, range: number): string | null {
  const enc = v.encounter;
  if (!enc || !ch.nodeId) return null; // covered by the activation gate
  const inRange = (nodeId: string) => dsNodeDistance(enc.faceId, ch.nodeId!, nodeId) <= range;
  const charsInRange = v.characters.filter((c) => c.nodeId && inRange(c.nodeId));
  switch (fx.kind) {
    case 'grant':
      if (fx.who === 'self') return null;
      if (charsInRange.length === 0) return 'NO CHARACTER IN RANGE';
      if (fx.who === 'allOthers' && charsInRange.every((c) => c.seat === ch.seat)) return 'NO OTHER CHARACTER IN RANGE';
      return null;
    case 'afflict': {
      const enemies = enc.enemies.filter((e) => enemyAlive(e) && inRange(e.nodeId));
      if (fx.node) return enemies.length > 0 ? null : 'NO ENEMY IN RANGE';
      if (enemies.length > 0) return null;
      const bossConds = v.boss
        ? icons.conditions.filter((c) => v.boss!.id !== 'boreal-outrider-knight' || (c !== 'stagger' && c !== 'frostbite'))
        : [];
      if (bossConds.length > 0 && v.boss!.units.some((u) => u.inPlay && u.nodeId && inRange(u.nodeId))) return null;
      return 'NO TARGET IN RANGE';
    }
    case 'rapport': {
      const alive = enc.enemies.filter(enemyAlive);
      const legal = alive.some((e) => inRange(e.nodeId) && alive.filter((o) => o.nodeId === e.nodeId).length >= 2);
      return legal ? null : 'NEEDS AN ENEMY SHARING A NODE WITH ANOTHER';
    }
    default:
      return null; // buff / defenceBuff / shift always land
  }
}

export function attackChoices(v: DsView, seat: number): AttackChoice[] {
  const out: AttackChoice[] = [];
  const gate = activationGate(v, seat);
  const ch = v.characters[seat];
  const enc = v.encounter;
  for (const hand of ['L', 'R'] as const) {
    const eq = hand === 'L' ? ch.handL : ch.handR;
    if (!eq) continue;
    const card = DS_TREASURE_BY_ID[eq.cardId];
    (card.actions ?? []).forEach((action, idx) => {
      const icons = parseIcons(action);
      const act = ch.act;
      const usingMerc = Boolean(act?.mercExtra);
      let range = icons.range ?? card.range ?? 0;
      if (act?.buff === 'sorcerer' && icons.magic) range = 9999;
      let cost = action.staminaCost;
      if (act?.buff === 'warrior' && range === 0) cost = 0;
      if (act?.buff === 'sorcerer' && icons.magic) cost = Math.max(0, cost - 3);
      if (usingMerc) cost = 0;
      if (ch.conditions.includes('stagger')) cost += 1;
      if (v.boss?.id === 'gargoyle' && v.boss.heatedUp && ch.nodeId && bossUnitAt(v, ch.nodeId)) cost += 1;
      const flat = (action.flatModifier ?? 0)
        + eq.upgrades.reduce((n, u) => n + upgradeDamageBonus(DS_TREASURE_BY_ID[u]), 0);

      const choice: AttackChoice = {
        hand, option: idx, card, name: card.name,
        dice: action.dice ?? {}, flat, cost, range, icons,
        reason: null, targets: [],
      };
      const diceCount = Object.values(action.dice ?? {}).reduce((n, x) => n + (x ?? 0), 0);
      const fx = action.effect;
      if (diceCount === 0 && !fx) { choice.reason = 'NOT ENCODED · REPORT THIS CARD'; out.push(choice); return; }
      if (fx) choice.cast = castSummary(action, icons);
      if (gate) { choice.reason = gate; out.push(choice); return; }
      if (act!.stage === 'post') { choice.reason = 'ATTACK WINDOW CLOSED'; out.push(choice); return; }
      if (act!.attacked.includes(hand) && !usingMerc) { choice.reason = 'HAND ALREADY ATTACKED'; out.push(choice); return; }
      if (!meetsReqsEquipped(ch, eq)) { choice.reason = 'STAT REQUIREMENT NOT MET'; out.push(choice); return; }
      if (!canSpend(ch, cost)) { choice.reason = `NOT ENOUGH STAMINA · NEEDS ${cost}`; out.push(choice); return; }
      if (fx) {
        // spell DSL cast: mirror doCastSpell's target validation; the engine
        // resolves the actual pick via a spellTarget pending
        choice.reason = castTargetReason(v, ch, fx, icons, range);
        out.push(choice);
        return;
      }

      // legal targets
      if (enc && ch.nodeId) {
        for (const e of enc.enemies) {
          if (!enemyAlive(e)) continue;
          const d = dsNodeDistance(enc.faceId, ch.nodeId, e.nodeId);
          if (d > range || (icons.shaft && d === 0)) continue;
          choice.targets.push({ kind: 'enemy', uid: e.uid, nodeId: e.nodeId, label: enemyDef(e).name });
        }
        for (const u of v.boss?.units ?? []) {
          if (!u.inPlay || !u.nodeId) continue;
          const d = dsNodeDistance(enc.faceId, ch.nodeId, u.nodeId);
          if (d > range || (icons.shaft && d === 0)) continue;
          choice.targets.push({ kind: 'boss', unitKey: u.key, nodeId: u.nodeId, label: bossUnitLabel(v, u.key) });
        }
      }
      if (choice.targets.length === 0) choice.reason = 'NO TARGET IN RANGE';
      out.push(choice);
    });
  }
  return out;
}

export function bossUnitLabel(v: DsView, key: string): string {
  if (!v.boss) return key.toUpperCase();
  const def = DS_BOSSES[v.boss.id];
  if (key === 'ornstein') return 'Ornstein';
  if (key === 'smough') return 'Smough';
  if (key.startsWith('king')) return `King ${key.slice(4)}`;
  return def?.name ?? key;
}

const upgradeDamageBonus = (card: DsTreasureCard): number => {
  const m = /\+(\d+) damage/.exec(card.special ?? '');
  return m ? Number(m[1]) : 0;
};

// ---------- estus / heroic / swap / end (mirrors) ----------

export function estusReason(v: DsView, seat: number): string | null {
  const gate = activationGate(v, seat);
  if (gate) return gate;
  if (!v.characters[seat].estus) return 'FLASK EMPTY · REFILLS ON REST';
  return null;
}

export function heroicReason(v: DsView, seat: number): string | null {
  const gate = activationGate(v, seat);
  if (gate) return gate;
  const ch = v.characters[seat];
  if (!ch.heroic) return 'USED · READY AFTER A REST';
  if (ch.classId === 'knight' || ch.classId === 'assassin') return 'TRIGGERS FROM A ROLL PROMPT';
  if (ch.classId === 'deprived' && !ch.act!.swapWindow) return 'ONLY AT ACTIVATION START';
  return null;
}

export function swapReason(v: DsView, seat: number): string | null {
  const gate = activationGate(v, seat);
  if (gate) return gate;
  const ch = v.characters[seat];
  if (!ch.act!.swapWindow && !ch.act!.deprivedSwap) return 'ONLY AT ACTIVATION START';
  if (ch.backup.length === 0 && !ch.handL && !ch.handR) return 'NOTHING TO SWAP';
  if (ch.backup.length === 0) return 'NO BACKUP WEAPONS';
  return null;
}

export const endReason = (v: DsView, seat: number): string | null => activationGate(v, seat);

// ---------- backup swap combos (mirror of doSwapBackup) ----------

export interface SwapOption {
  label: string;
  handCardId?: string;
  backupCardId?: string;
  reason: string | null;
}

/** Every legal swap_backup payload as an explicit option: bring a backup
 * weapon into a free hand, trade it for a named hand card, or stow a hand
 * card. Mirrors doSwapBackup exactly (two-handed + stat checks). */
export function swapOptions(v: DsView, seat: number): SwapOption[] {
  const ch = v.characters[seat];
  const out: SwapOption[] = [];
  const bothFull = ch.handL != null && ch.handR != null;
  for (const b of ch.backup) {
    const inCard = DS_TREASURE_BY_ID[b.cardId];
    const statFail = !meetsReqsEquipped(ch, b) ? 'STAT REQUIREMENT NOT MET' : null;
    if (!bothFull) {
      // engine fills the free hand when no hand card is named
      const other = ch.handL ?? ch.handR;
      let reason = statFail;
      if (!reason && inCard.twoHanded && other) reason = 'TWO-HANDED · OTHER HAND MUST BE EMPTY';
      if (!reason && other && DS_TREASURE_BY_ID[other.cardId].twoHanded) reason = 'OTHER HAND HOLDS A TWO-HANDER';
      out.push({ label: `BRING IN ${inCard.name.toUpperCase()}`, backupCardId: b.cardId, reason });
    } else {
      for (const slot of ['handL', 'handR'] as const) {
        const h = ch[slot]!;
        const staying = slot === 'handL' ? ch.handR : ch.handL;
        let reason = statFail;
        if (!reason && inCard.twoHanded && staying) reason = 'TWO-HANDED · OTHER HAND MUST BE EMPTY';
        if (!reason && staying && DS_TREASURE_BY_ID[staying.cardId].twoHanded) reason = 'OTHER HAND HOLDS A TWO-HANDER';
        out.push({
          label: `${inCard.name.toUpperCase()} FOR ${DS_TREASURE_BY_ID[h.cardId].name.toUpperCase()}`,
          handCardId: h.cardId, backupCardId: b.cardId, reason,
        });
      }
    }
  }
  for (const slot of ['handL', 'handR'] as const) {
    const h = ch[slot];
    if (!h) continue;
    out.push({ label: `STOW ${DS_TREASURE_BY_ID[h.cardId].name.toUpperCase()}`, handCardId: h.cardId, reason: null });
  }
  return out;
}

// ---------- dash through (campaign, mirror of doDash) ----------

export interface DashPlan {
  reason: string | null;
  targets: { id: string | 'bonfire'; label: string }[];
}

export function dashPlan(v: DsView, seat: number): DashPlan {
  if (!v.campaign) return { reason: 'CAMPAIGN ONLY', targets: [] };
  const gate = activationGate(v, seat);
  if (gate) return { reason: gate, targets: [] };
  if (v.boss) return { reason: 'NO DASHING FROM A BOSS FIGHT', targets: [] };
  const enc = v.encounter!;
  if (!enc.tileId) return { reason: 'NOWHERE TO DASH FROM', targets: [] };
  if (enc.enemyPhases < 1) return { reason: 'THE ENEMIES ACT ONCE FIRST', targets: [] };
  const i = v.tiles.findIndex((t) => t.id === enc.tileId);
  if (i < 0) return { reason: 'NOWHERE TO DASH FROM', targets: [] };
  const targets: DashPlan['targets'] = [];
  if (i === 0) targets.push({ id: 'bonfire', label: 'BACK TO THE BONFIRE' });
  else targets.push({ id: v.tiles[i - 1].id, label: `BACK · LEVEL ${v.tiles[i - 1].level} TILE` });
  if (i + 1 < v.tiles.length) targets.push({ id: v.tiles[i + 1].id, label: `ONWARD · LEVEL ${v.tiles[i + 1].level} TILE` });
  return { reason: null, targets };
}

// ---------- upgrade removal (mirror of doRemoveUpgrade) ----------

export function removeUpgradeReason(v: DsView, seat: number, upgradeId: string): string | null {
  const g = globalGate(v, seat);
  if (g) return g;
  if (!atBonfire(v)) return 'ONLY AT BLACKSMITH ANDRE';
  const up = DS_TREASURE_BY_ID[upgradeId];
  if (up?.slot === 'weapon-upgrade') return 'WEAPON UPGRADES ARE PERMANENT';
  return null;
}

// ---------- bonfire mirrors ----------

export const atBonfire = (v: DsView): boolean => v.phase === 'bonfire' && v.partyAt === 'bonfire';

export function buyReason(v: DsView, seat: number): string | null {
  const g = globalGate(v, seat);
  if (g) return g;
  if (!atBonfire(v)) return 'ONLY AT THE BONFIRE';
  const cost = TREASURE_COST(v);
  if (v.treasureDeckCount === 0) return 'TREASURE DECK EMPTY';
  if (v.soulCache < cost) return `COSTS ${cost} SOUL${cost > 1 ? 'S' : ''}`;
  return null;
}

export interface LevelInfo {
  stat: DsStat; tier: number; maxed: boolean; cost: number | null;
  now: number; next: number | null; reason: string | null;
}

export function levelInfo(v: DsView, seat: number, stat: DsStat): LevelInfo {
  const ch = v.characters[seat];
  const costs = levelCosts(v);
  const tier = ch.tiers[stat];
  const maxed = tier >= costs.length;
  const cls = DS_CLASSES[ch.classId];
  const now = ch.stats[stat];
  const next = maxed ? null : (tier + 1 >= 4 ? 40 : cls.statTiers[stat][tier + 1]);
  const cost = maxed ? null : costs[tier];
  let reason: string | null = globalGate(v, seat);
  if (!reason && !atBonfire(v)) reason = 'ONLY AT THE BONFIRE';
  if (!reason && maxed) reason = v.campaign ? 'TIER 4 · MAXED' : 'TIER 3 · MAXED';
  if (!reason && cost != null && v.soulCache < cost) reason = `COSTS ${cost} SOULS`;
  return { stat, tier, maxed, cost, now, next, reason };
}

export function restoreLuckReason(v: DsView, seat: number): string | null {
  const g = globalGate(v, seat);
  if (g) return g;
  if (!atBonfire(v)) return 'ONLY AT THE BONFIRE';
  if (v.characters[seat].luck) return 'LUCK TOKEN READY';
  if (v.soulCache < LUCK_RESTORE_COST) return 'COSTS 1 SOUL';
  return null;
}

export function buySparkReason(v: DsView, seat: number): string | null {
  const g = globalGate(v, seat);
  if (g) return g;
  if (!v.campaign) return 'CAMPAIGN ONLY';
  if (!atBonfire(v)) return 'ONLY AT THE BONFIRE';
  if (v.sparks >= v.sparksMax) return 'SPARKS AT MAXIMUM';
  if (v.soulCache < SPARK_COST(v)) return `COSTS ${SPARK_COST(v)} SOULS`;
  return null;
}

export function restReason(v: DsView, seat: number): string | null {
  const g = globalGate(v, seat);
  if (g) return g;
  if (seat !== 0) return 'PARTY DECISION · HOST CONFIRMS';
  if (!atBonfire(v)) return 'ONLY AT THE BONFIRE';
  if (v.sparks <= 0) return 'NO SPARKS REMAIN';
  return null;
}

export function sellReason(v: DsView, seat: number): string | null {
  const g = globalGate(v, seat);
  if (g) return g;
  if (!v.campaign) return 'CAMPAIGN ONLY';
  if (!atBonfire(v)) return 'ONLY AT THE BONFIRE';
  return null;
}

/** Mirror of adjacentPlaces: the tile chain is linear (state.ts judgment). */
export function travelTargets(v: DsView): (string | 'bonfire')[] {
  if (v.phase !== 'bonfire') return [];
  const at = v.partyAt;
  if (v.stage === 'megaBoss' && at !== 'bonfire') return ['bonfire'];
  if (at === 'bonfire') return v.tiles.length > 0 && v.stage !== 'megaBoss' ? [v.tiles[0].id] : [];
  const i = v.tiles.findIndex((t) => t.id === at);
  const out: (string | 'bonfire')[] = [i === 0 ? 'bonfire' : v.tiles[i - 1].id];
  if (i + 1 < v.tiles.length) out.push(v.tiles[i + 1].id);
  return out;
}

export function fogGateReason(v: DsView, seat: number): string | null {
  const g = globalGate(v, seat);
  if (g) return g;
  if (v.phase !== 'bonfire') return 'BETWEEN ENCOUNTERS ONLY';
  if (v.stage === 'megaBoss') {
    return v.partyAt === 'bonfire' ? null : 'THE GATE OPENS FROM THE BONFIRE';
  }
  if (v.partyAt !== v.fogGateTileId) return 'THE GATE IS ON THE FARTHEST TILE';
  const tile = v.tiles.find((t) => t.id === v.partyAt);
  if (tile && !tile.cleared && !tile.completed) return 'CLEAR THIS TILE FIRST';
  return null;
}

/** Closed chests (and a waiting revealed mimic) openable right now. */
export function openableChests(v: DsView): { nodeId: string; mimic: boolean }[] {
  if (v.phase !== 'bonfire' || v.partyAt === 'bonfire') return [];
  const tile = v.tiles.find((t) => t.id === v.partyAt);
  if (!tile || (!tile.cleared && !tile.completed)) return [];
  const out: { nodeId: string; mimic: boolean }[] = [];
  for (const [nodeId, state] of Object.entries(tile.chests)) {
    if (state === 'closed') out.push({ nodeId, mimic: false });
  }
  if (tile.mimicAmbush === 'mimic' && tile.mimicNode) out.push({ nodeId: tile.mimicNode, mimic: true });
  return out;
}

// ---------- equip management (mirror of doEquipMove / doInstallUpgrade) ----------

export type EquipSlotKey = 'armour' | 'handL' | 'handR' | 'backup' | 'inventory';

export function equipWindowOpen(v: DsView, seat: number): boolean {
  if (globalGate(v, seat)) return false;
  if (atBonfire(v)) return true;
  const ch = v.characters[seat];
  return (v.phase === 'encounter' || v.phase === 'bossEncounter') && Boolean(ch.act?.deprivedSwap);
}

const weaponCount = (ch: DsCharacter): number =>
  (ch.handL ? 1 : 0) + (ch.handR ? 1 : 0) + ch.backup.length;

/** Reason equip_move{cardId, to} would fail; null = legal. */
export function equipMoveReason(v: DsView, seat: number, cardId: string, to: EquipSlotKey): string | null {
  if (!equipWindowOpen(v, seat)) return 'ONLY AT BLACKSMITH ANDRE';
  const ch = v.characters[seat];
  const card = DS_TREASURE_BY_ID[cardId];
  if (!card) return 'UNKNOWN CARD';
  const equippedAt: EquipSlotKey | null =
    ch.armour?.cardId === cardId ? 'armour'
    : ch.handL?.cardId === cardId ? 'handL'
    : ch.handR?.cardId === cardId ? 'handR'
    : ch.backup.some((e) => e.cardId === cardId) ? 'backup'
    : v.inventory.includes(cardId) ? 'inventory' : null;
  if (equippedAt == null) return 'NOT YOURS TO MOVE';
  if (to === equippedAt && to !== 'inventory') return 'ALREADY THERE';
  if (to === 'inventory') return equippedAt === 'inventory' ? 'ALREADY STASHED' : null;
  const eq = equippedAt === 'inventory'
    ? { cardId, upgrades: [] as string[] }
    : equippedAt === 'backup' ? ch.backup.find((e) => e.cardId === cardId)!
    : ch[equippedAt]!;
  if (!meetsReqsEquipped(ch, eq)) return 'STAT REQUIREMENT NOT MET';
  if (to === 'armour') {
    if (card.kind !== 'armour') return 'ARMOUR SLOT · ARMOUR ONLY';
    return null;
  }
  if (card.kind === 'armour' || card.slot !== 'hand') return 'DOES NOT FIT A HAND SLOT';
  const fromHand = equippedAt === 'handL' || equippedAt === 'handR';
  if (to === 'handL' || to === 'handR') {
    const dest = to === 'handL' ? ch.handL : ch.handR;
    if (dest && dest.cardId !== cardId) return 'HAND FULL · MOVE THAT CARD FIRST';
    const other = to === 'handL' ? ch.handR : ch.handL;
    const otherLeft = fromHand && other?.cardId === cardId ? null : other;
    if (card.twoHanded && otherLeft) return 'TWO-HANDED · OTHER HAND MUST BE EMPTY';
    if (otherLeft && DS_TREASURE_BY_ID[otherLeft.cardId].twoHanded) return 'OTHER HAND HOLDS A TWO-HANDER';
    if (equippedAt === 'inventory' && weaponCount(ch) >= 3) return 'THREE WEAPONS MAXIMUM';
    return null;
  }
  // backup
  if (equippedAt === 'inventory' && weaponCount(ch) >= 3) return 'THREE WEAPONS MAXIMUM';
  return null;
}

export interface UpgradeTarget { targetCardId: string; targetName: string; reason: string | null }

export function upgradeTargets(v: DsView, seat: number, upgradeId: string): UpgradeTarget[] {
  const up = DS_TREASURE_BY_ID[upgradeId];
  if (!up || up.kind !== 'upgrade') return [];
  const ch = v.characters[seat];
  const isWeaponUp = up.slot === 'weapon-upgrade';
  const out: UpgradeTarget[] = [];
  const consider = (eq: { cardId: string; upgrades: string[] } | null): void => {
    if (!eq) return;
    const target = DS_TREASURE_BY_ID[eq.cardId];
    let reason: string | null = null;
    if (!atBonfire(v)) reason = 'ONLY AT BLACKSMITH ANDRE';
    else if (isWeaponUp && target.kind === 'armour') reason = 'WEAPON UPGRADES FIT WEAPONS';
    else if (!isWeaponUp && target.kind !== 'armour') reason = 'ARMOUR UPGRADES FIT ARMOUR';
    else if (eq.upgrades.length >= (target.upgradeSlots ?? 0)) reason = 'NO FREE UPGRADE SLOT';
    else if (!meetsReqs(ch, up)) reason = 'STAT REQUIREMENT NOT MET';
    out.push({ targetCardId: eq.cardId, targetName: target.name, reason });
  };
  consider(ch.armour);
  consider(ch.handL);
  consider(ch.handR);
  for (const b of ch.backup) consider(b);
  return out;
}

// ---------- copy hygiene ----------

/** Engine strings carry em dashes; device copy bans them (playbook §5). */
export const cleanCopy = (text: string): string =>
  text.replace(/\s+—\s+/g, ' · ').replace(/—/g, '·');
