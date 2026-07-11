// Dark Souls: The Board Game — the reducer: every player action, the pending
// decision queue, and the enemy/boss step executor (auto-resolved AI whose
// steps land in the log for TV playback). Rules per docs/specs/dark-souls.md.
//
// Resolution model (playbook §6.4): enemy and boss activations expand into a
// serializable micro-step `script`; `pump` executes steps until a pending
// decision blocks. While pendings are non-empty only `choose` is legal, and
// only for the head's owner. Choose handlers apply the pick, then pump.

import {
  DS_ACTIVATION_STAMINA, DS_CALAMITY_SUPPLY, DS_CONDITIONS, DS_EMBER_REDUCTION,
  DS_EMBER_THRESHOLD, DS_INVADER_KILL_SOULS, DS_LEVEL_COSTS_CAMPAIGN,
  DS_LEVEL_COSTS_STANDARD, DS_LUCK_RESTORE_COST, DS_NODE_MODEL_CAP,
  DS_SELLBACK_SOULS, DS_SOULS_PER_ENCOUNTER, DS_SOULS_PER_L4,
  DS_SPARK_COST_PER_CHARACTER, DS_TRAP_TOKENS, DS_TREASURE_COST_CAMPAIGN,
  DS_TREASURE_COST_STANDARD,
  type DsCondition, type DsStat,
} from './config.js';
import {
  DS_BOSSES, DS_CLASSES, DS_ENCOUNTER_BY_ID, DS_ENEMIES, DS_INVADERS,
  DS_INVADER_ADVANCED, DS_INVADER_STANDARD, DS_SUMMONS, DS_TREASURE_BY_ID,
  dsEntryNodes, dsNodeDistance, dsNodesOfTerrain, dsSummonPool, dsTileGraph,
  dsTreasureDeckCards, dsUpgradeDamageBonus, dsUpgradeGrantsBleed,
  type DsBossCard, type DsBossOp, type DsEnemyBehavior, type DsSpellEffect, type DsSummonOp,
  type DsTreasureAction,
} from './data.js';
import {
  dsArcsOf, dsCanSpendStamina, dsCombatDistance, dsCurrentSection, dsDefenceDice, dsDodgeDiceCount,
  dsDrawL4, dsEquippedList, dsFinishSetup, dsGainStamina, dsHandCards,
  dsHealDamage, dsInjectTransposedAndLegendaries, dsMakeCharacter, dsMeetsReqs,
  dsMeetsReqsEquipped, dsModelsAt, dsNodeArcs, dsNodeBlocked, dsOccupancy,
  dsPushPending, dsRandInt, dsRollDie, dsRollDodgeDie, dsScenarioOf,
  dsSectionBossIds, dsSetupSection, dsSetupStandardStage, dsShuffle,
  dsSpendStamina, dsStatValue, dsWeaponCount,
  type DsArc, type DsBossRun, type DsBossUnit, type DsCharacter, type DsEnemyModel,
  type DsPending, type DsPendingOption, type DsState, type DsStep, type DsSummon,
  type DsTile,
} from './state.js';

// ---------- action union ----------

export type DsAction =
  // setup
  | { type: 'pick_class'; classId: string }
  // bonfire (Andre / Firekeeper / party management, core p.13-15)
  | { type: 'buy_treasure' }
  | { type: 'sell_treasure'; cardId: string } // campaign (core p.33)
  | { type: 'equip_move'; cardId: string; to: 'armour' | 'handL' | 'handR' | 'backup' | 'inventory' }
  | { type: 'install_upgrade'; upgradeId: string; targetCardId: string }
  | { type: 'remove_upgrade'; upgradeId: string; targetCardId: string } // armour upgrades only
  | { type: 'level_up'; stat: DsStat }
  | { type: 'restore_luck' }
  | { type: 'buy_spark' } // campaign
  | { type: 'rest' } // party decision: host (seat 0) confirms
  | { type: 'travel'; tileId: string | 'bonfire' }
  | { type: 'enter_fog_gate' }
  | { type: 'open_chest'; nodeId: string } // after victory, party on the tile
  // encounter — own activation
  | { type: 'walk'; nodeId?: string; arcStep?: DsArc }
  | { type: 'run'; nodeId?: string; arcStep?: DsArc }
  | { type: 'swap_backup'; handCardId?: string; backupCardId?: string }
  | { type: 'attack'; hand: 'L' | 'R'; option: number; targetUid?: number; targetUnit?: string; nodeId?: string }
  | { type: 'use_estus' }
  | { type: 'heroic_action' }
  | { type: 'end_activation' }
  | { type: 'dash_through'; tileId: string | 'bonfire' } // campaign (core p.33)
  // decisions
  | { type: 'choose'; pick: string }
  | { type: 'continue' }; // display pacing ack; no state effect

export interface DsActionResult { ok: boolean; error?: string }

const err = (error: string): DsActionResult => ({ ok: false, error });
const OK: DsActionResult = { ok: true };

const log = (s: DsState, text: string, kind?: string, nodeId?: string, seat?: number): void => {
  s.log.push({ text, ...(kind ? { kind } : {}), ...(nodeId ? { nodeId } : {}), ...(seat != null ? { seat } : {}) });
};

// ---------- entry ----------

export function applyDarkSoulsAction(s: DsState, seat: number, action: DsAction): DsActionResult {
  if (action == null || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') {
    return err('Malformed action.');
  }
  if (!Number.isInteger(seat) || seat < 0 || seat >= s.options.partySize) return err('Bad seat.');
  if (s.phase === 'gameOver') return err('The game is over.');
  if (action.type === 'continue') return OK;

  // playbook §6.4: while pendings are non-empty only `choose` is legal
  if (s.pendings.length > 0 && action.type !== 'choose') {
    return err('A decision is pending.');
  }
  if (action.type === 'choose') {
    const r = doChoose(s, seat, action.pick);
    if (r.ok) pump(s);
    return r;
  }
  if (s.script.length > 0) return err('Enemy activation in progress.');

  let r: DsActionResult;
  switch (action.type) {
    case 'pick_class': r = doPickClass(s, seat, action.classId); break;
    case 'buy_treasure': r = doBuyTreasure(s, seat); break;
    case 'sell_treasure': r = doSellTreasure(s, seat, action.cardId); break;
    case 'equip_move': r = doEquipMove(s, seat, action.cardId, action.to); break;
    case 'install_upgrade': r = doInstallUpgrade(s, seat, action.upgradeId, action.targetCardId); break;
    case 'remove_upgrade': r = doRemoveUpgrade(s, seat, action.upgradeId, action.targetCardId); break;
    case 'level_up': r = doLevelUp(s, seat, action.stat); break;
    case 'restore_luck': r = doRestoreLuck(s, seat); break;
    case 'buy_spark': r = doBuySpark(s, seat); break;
    case 'rest': r = doRest(s, seat); break;
    case 'travel': r = doTravel(s, seat, action.tileId); break;
    case 'enter_fog_gate': r = doEnterFogGate(s, seat); break;
    case 'open_chest': r = doOpenChest(s, seat, action.nodeId); break;
    case 'walk': r = doMove(s, seat, action.nodeId, action.arcStep, false); break;
    case 'run': r = doMove(s, seat, action.nodeId, action.arcStep, true); break;
    case 'swap_backup': r = doSwapBackup(s, seat, action.handCardId, action.backupCardId); break;
    case 'attack': r = doAttack(s, seat, action); break;
    case 'use_estus': r = doEstus(s, seat); break;
    case 'heroic_action': r = doHeroic(s, seat); break;
    case 'end_activation': r = doEndActivation(s, seat); break;
    case 'dash_through': r = doDash(s, seat, action.tileId); break;
    default: r = err('Unknown action.');
  }
  if (r.ok) pump(s);
  return r;
}

// ---------- setup ----------

function doPickClass(s: DsState, seat: number, classId: string): DsActionResult {
  if (s.phase !== 'setup') return err('Classes are picked during setup.');
  if (!DS_CLASSES[classId]) return err('Unknown class.');
  if (s.classPicks.some((c, i) => c === classId && i !== seat)) return err('Class already taken.');
  s.classPicks[seat] = classId;
  log(s, `Seat ${seat + 1} picks the ${DS_CLASSES[classId].name}.`, 'phase', undefined, seat);
  if (s.classPicks.every((c) => c != null)) dsFinishSetup(s);
  return OK;
}

// ---------- bonfire ----------

const atBonfire = (s: DsState): boolean => s.phase === 'bonfire' && s.partyAt === 'bonfire';

function treasureCost(s: DsState): number {
  return s.campaign ? DS_TREASURE_COST_CAMPAIGN : DS_TREASURE_COST_STANDARD;
}

function doBuyTreasure(s: DsState, seat: number): DsActionResult {
  if (!atBonfire(s)) return err('Blacksmith Andre is only available at the bonfire.');
  const cost = treasureCost(s);
  if (s.soulCache < cost) return err(`Purchasing treasure costs ${cost} soul${cost > 1 ? 's' : ''}.`);
  if (s.treasureDeck.length === 0) return err('The treasure deck is empty.');
  s.soulCache -= cost;
  drawTreasure(s, seat, 'purchase');
  return OK;
}

/** Draw + reveal the top treasure card; Ember cards resolve immediately
 * (core p.12); everything else routes through a treasureKeep pending. */
function drawTreasure(s: DsState, seat: number, why: string): void {
  const cardId = s.treasureDeck.shift();
  if (cardId == null) { log(s, 'The treasure deck is empty.'); return; }
  const card = DS_TREASURE_BY_ID[cardId];
  log(s, `Treasure drawn (${why}): ${card.name}.`, 'flip', undefined, seat);
  if (card.kind === 'item' && /gain an Ember token/i.test(card.special ?? '')) {
    const unembered = s.characters.filter((c) => !c.ember);
    if (unembered.length === 0) {
      // everyone embered: shuffle back, draw a replacement free (core p.12)
      s.treasureDeck = dsShuffle(s, [...s.treasureDeck, cardId]);
      log(s, 'Everyone already carries an Ember: reshuffled, drawing again.');
      drawTreasure(s, seat, why);
      return;
    }
    dsPushPending(s, seat, 'emberAssign', 'Choose who takes the Ember token.',
      unembered.map((c) => ({ key: `seat:${c.seat}`, label: DS_CLASSES[c.classId].name })),
      { cardId });
    return;
  }
  const options: DsPendingOption[] = [{ key: 'stash', label: 'Send to the inventory' }];
  for (const ch of s.characters) {
    if (card.kind === 'upgrade' || card.kind === 'item') break;
    if (dsMeetsReqs(ch, card)) options.push({ key: `equip:${ch.seat}`, label: `Equip on ${DS_CLASSES[ch.classId].name}` });
  }
  dsPushPending(s, seat, 'treasureKeep', `Keep ${card.name}?`, options, { cardId });
}

function doSellTreasure(s: DsState, seat: number, cardId: string): DsActionResult {
  if (!s.campaign) return err('Selling treasure is a campaign rule.');
  if (!atBonfire(s)) return err('Sell treasure at the bonfire.');
  const idx = s.inventory.indexOf(cardId);
  if (idx < 0) return err('That card is not in the inventory.');
  s.inventory.splice(idx, 1);
  s.treasurePool.splice(s.treasurePool.indexOf(cardId), 1);
  s.campaign.discardedForever.push(cardId);
  s.soulCache += DS_SELLBACK_SOULS;
  log(s, `${DS_TREASURE_BY_ID[cardId].name} sold for ${DS_SELLBACK_SOULS} soul (discarded forever).`, undefined, undefined, seat);
  return OK;
}

function findEquipped(ch: DsCharacter, cardId: string): { slot: 'armour' | 'handL' | 'handR' | 'backup'; idx: number } | null {
  if (ch.armour?.cardId === cardId) return { slot: 'armour', idx: 0 };
  if (ch.handL?.cardId === cardId) return { slot: 'handL', idx: 0 };
  if (ch.handR?.cardId === cardId) return { slot: 'handR', idx: 0 };
  const bi = ch.backup.findIndex((e) => e.cardId === cardId);
  if (bi >= 0) return { slot: 'backup', idx: bi };
  return null;
}

function doEquipMove(s: DsState, seat: number, cardId: string, to: 'armour' | 'handL' | 'handR' | 'backup' | 'inventory'): DsActionResult {
  const ch = s.characters[seat];
  const deprivedWindow = s.phase === 'encounter' || s.phase === 'bossEncounter'
    ? Boolean(ch.act?.deprivedSwap)
    : false;
  if (!atBonfire(s) && !deprivedWindow) return err('Equipment changes happen at Blacksmith Andre (core p.14).');
  const card = DS_TREASURE_BY_ID[cardId];
  if (!card) return err('Unknown card.');
  const where = findEquipped(ch, cardId);
  const fromInventory = !where && s.inventory.includes(cardId);
  if (!where && !fromInventory) return err('Card is neither equipped by you nor in the inventory.');

  // detach from current place (upgrades ride along)
  let eq = where
    ? (where.slot === 'backup' ? ch.backup.splice(where.idx, 1)[0]
      : (() => { const e = ch[where.slot]!; ch[where.slot] = null; return e; })())
    : { cardId, upgrades: [] as string[] };
  if (fromInventory) s.inventory.splice(s.inventory.indexOf(cardId), 1);

  const putBack = (): void => {
    if (where) {
      if (where.slot === 'backup') ch.backup.splice(where.idx, 0, eq);
      else ch[where.slot] = eq;
    } else {
      s.inventory.push(cardId);
    }
  };

  if (to === 'inventory') {
    s.inventory.push(cardId);
    log(s, `${card.name} moved to the inventory.`, undefined, undefined, seat);
    return OK;
  }
  if (!dsMeetsReqsEquipped(ch, eq)) { putBack(); return err('Stat requirements not met (upgrades count, core p.14).'); }
  if (to === 'armour') {
    if (card.kind !== 'armour') { putBack(); return err('Only armour fits the armour slot.'); }
    if (ch.armour) s.inventory.push(...detachToInventoryIds(ch.armour)), ch.armour = null;
    ch.armour = eq;
  } else if (to === 'handL' || to === 'handR') {
    if (card.slot !== 'hand') { putBack(); return err('That card does not fit a hand slot.'); }
    if (ch[to]) { putBack(); return err('That hand is full — move the held card first.'); }
    const other = to === 'handL' ? ch.handR : ch.handL;
    if (card.twoHanded && other) { putBack(); return err('Two-handed weapons need the other hand empty (core p.12).'); }
    if (other && DS_TREASURE_BY_ID[other.cardId].twoHanded) { putBack(); return err('The other hand holds a two-handed weapon.'); }
    if (!where && dsWeaponCount(ch) >= 3) { putBack(); return err('Three weapons total (core p.12).'); }
    ch[to] = eq;
  } else { // backup
    if (card.slot !== 'hand') { putBack(); return err('Only weapons go in the backup slot.'); }
    if (!where && dsWeaponCount(ch) >= 3) { putBack(); return err('Three weapons total (core p.12).'); }
    ch.backup.push(eq);
  }
  log(s, `${card.name} equipped (${to}).`, undefined, undefined, seat);
  return OK;
}

const detachToInventoryIds = (eq: { cardId: string; upgrades: string[] }): string[] => [eq.cardId];
// upgrades stay attached to their card wherever it goes; the id list is the card itself

function doInstallUpgrade(s: DsState, seat: number, upgradeId: string, targetCardId: string): DsActionResult {
  if (!atBonfire(s)) return err('Upgrades are installed at Blacksmith Andre (free, core p.14).');
  const ch = s.characters[seat];
  const up = DS_TREASURE_BY_ID[upgradeId];
  if (!up || up.kind !== 'upgrade') return err('Not an upgrade card.');
  if (!s.inventory.includes(upgradeId)) return err('Upgrade must be in the inventory.');
  const where = findEquipped(ch, targetCardId);
  if (!where) return err('Upgrade targets one of your equipped cards.');
  const target = where.slot === 'backup' ? ch.backup[where.idx] : ch[where.slot]!;
  const targetCard = DS_TREASURE_BY_ID[target.cardId];
  const isWeaponUp = up.slot === 'weapon-upgrade';
  if (isWeaponUp && targetCard.kind === 'armour') return err('Weapon upgrades attach to weapons.');
  if (!isWeaponUp && targetCard.kind !== 'armour') return err('Armour upgrades attach to armour.');
  if (target.upgrades.length >= (targetCard.upgradeSlots ?? 0)) return err('No free upgrade slot.');
  if (!dsMeetsReqs(ch, up)) return err('Upgrade stat requirements not met.');
  s.inventory.splice(s.inventory.indexOf(upgradeId), 1);
  target.upgrades.push(upgradeId);
  log(s, `${up.name} installed on ${targetCard.name}.`, undefined, undefined, seat);
  return OK;
}

function doRemoveUpgrade(s: DsState, seat: number, upgradeId: string, targetCardId: string): DsActionResult {
  if (!atBonfire(s)) return err('Upgrades change at Blacksmith Andre.');
  const ch = s.characters[seat];
  const where = findEquipped(ch, targetCardId);
  if (!where) return err('Target card is not equipped by you.');
  const target = where.slot === 'backup' ? ch.backup[where.idx] : ch[where.slot]!;
  const idx = target.upgrades.indexOf(upgradeId);
  if (idx < 0) return err('That upgrade is not installed there.');
  const up = DS_TREASURE_BY_ID[upgradeId];
  if (up.slot === 'weapon-upgrade') return err('Weapon upgrades are permanent (core p.14).');
  target.upgrades.splice(idx, 1);
  s.inventory.push(upgradeId);
  log(s, `${up.name} removed.`, undefined, undefined, seat);
  return OK;
}

function levelCosts(s: DsState): number[] {
  return s.campaign ? DS_LEVEL_COSTS_CAMPAIGN : DS_LEVEL_COSTS_STANDARD;
}

function doLevelUp(s: DsState, seat: number, stat: DsStat): DsActionResult {
  if (!atBonfire(s)) return err('The Firekeeper is only available at the bonfire.');
  if (!['str', 'dex', 'int', 'fai'].includes(stat)) return err('Unknown stat.');
  const ch = s.characters[seat];
  const costs = levelCosts(s);
  const tier = ch.tiers[stat];
  if (tier >= costs.length) return err(s.campaign ? 'Stat already at Tier 4.' : 'Stat already at Tier 3.');
  const cost = costs[tier];
  if (s.soulCache < cost) return err(`Tier ${tier + 1} costs ${cost} souls.`);
  s.soulCache -= cost;
  ch.tiers[stat] += 1;
  log(s, `${DS_CLASSES[ch.classId].name} raises ${stat.toUpperCase()} to Tier ${tier + 1} (${dsStatValue(ch, stat)}).`, undefined, undefined, seat);
  return OK;
}

function doRestoreLuck(s: DsState, seat: number): DsActionResult {
  if (!atBonfire(s)) return err('The Firekeeper is only available at the bonfire.');
  const ch = s.characters[seat];
  if (ch.luck) return err('Luck token is already ready.');
  if (s.soulCache < DS_LUCK_RESTORE_COST) return err('Restoring luck costs 1 soul.');
  s.soulCache -= DS_LUCK_RESTORE_COST;
  ch.luck = true;
  log(s, `${DS_CLASSES[ch.classId].name}'s luck is restored.`, undefined, undefined, seat);
  return OK;
}

function doBuySpark(s: DsState, seat: number): DsActionResult {
  if (!s.campaign) return err('Spark purchase is a campaign rule (core p.33).');
  if (!atBonfire(s)) return err('The Firekeeper is only available at the bonfire.');
  if (s.sparks >= s.sparksMax) return err('Sparks are at the starting maximum.');
  const cost = DS_SPARK_COST_PER_CHARACTER * s.options.partySize;
  if (s.soulCache < cost) return err(`A spark costs ${cost} souls.`);
  s.soulCache -= cost;
  s.sparks += 1;
  log(s, `The party buys a spark (${s.sparks}/${s.sparksMax}).`, undefined, undefined, seat);
  return OK;
}

function doRest(s: DsState, seat: number): DsActionResult {
  if (seat !== 0) return err('Resting is a party decision — the host confirms.');
  if (!atBonfire(s)) return err('Rest at the bonfire.');
  if (s.sparks <= 0) return err('No sparks remain — the party can no longer rest (core p.8).');
  s.sparks -= 1;
  applyRest(s, false);
  log(s, `The party rests. Sparks: ${s.sparks}/${s.sparksMax}.`, 'phase');
  return OK;
}

/** Rest effects (core p.15). Forced rests (defeat) also discard Embers
 * (core p.12). Engine judgment: resting clears the endurance bar. */
function applyRest(s: DsState, forced: boolean): void {
  for (const ch of s.characters) {
    ch.estus = true;
    ch.heroic = true;
    ch.luck = true;
    ch.stamina = 0;
    ch.damage = 0;
    ch.conditions = []; ch.defBuffs = [];
    if (forced) ch.ember = false;
  }
  for (const tile of s.tiles) {
    if (tile.completed) continue; // L4 one-shots never reset (mega insert p.8)
    tile.faceUp = false;
    tile.cleared = false;
    // chests stay open forever; traps keep their nodes; dead mimics stay dead
  }
}

// ---------- travel / exploration ----------

function tileIndex(s: DsState, tileId: string): number {
  return s.tiles.findIndex((t) => t.id === tileId);
}

function adjacentPlaces(s: DsState, at: 'bonfire' | string): (string | 'bonfire')[] {
  // Engine judgment: the tile layout is a linear chain — bonfire, then tiles
  // in encounter-level order (lower levels nearer the bonfire, core p.9),
  // fog gate past the last tile.
  if (at === 'bonfire') return s.tiles.length > 0 ? [s.tiles[0].id] : [];
  const i = tileIndex(s, at);
  const out: (string | 'bonfire')[] = [];
  out.push(i === 0 ? 'bonfire' : s.tiles[i - 1].id);
  if (i + 1 < s.tiles.length) out.push(s.tiles[i + 1].id);
  return out;
}

function doTravel(s: DsState, seat: number, tileId: string | 'bonfire'): DsActionResult {
  void seat;
  if (s.phase !== 'bonfire') return err('The party travels between encounters.');
  if (s.stage === 'megaBoss' && tileId !== 'bonfire') {
    return err('No further exploration before the mega boss (mega insert p.9).');
  }
  if (!adjacentPlaces(s, s.partyAt).includes(tileId)) return err('Tiles connect through doorways — one tile at a time.');
  if (tileId === 'bonfire') {
    s.partyAt = 'bonfire';
    log(s, 'The party returns to the bonfire.', 'move');
    return OK;
  }
  const tile = s.tiles[tileIndex(s, tileId)];
  const fromIdx = s.partyAt === 'bonfire' ? -1 : tileIndex(s, s.partyAt);
  const backward = fromIdx > tileIndex(s, tileId);
  s.partyAt = tileId;
  if (!tile.faceUp && !tile.completed) {
    startEncounter(s, tile, backward);
  } else {
    log(s, `The party crosses ${tile.id} freely.`, 'move');
  }
  return OK;
}

function doEnterFogGate(s: DsState, seat: number): DsActionResult {
  void seat;
  if (s.phase !== 'bonfire') return err('Enter the fog gate between encounters.');
  if (s.stage === 'megaBoss') {
    if (s.partyAt !== 'bonfire') return err('The mega boss fog gate is on the bonfire doorway.');
    startBossFight(s, s.megaBossId ?? campaignBossId(s), 'mega');
    return OK;
  }
  if (s.partyAt !== s.fogGateTileId) return err('The fog gate is on the farthest tile.');
  const tile = s.tiles[tileIndex(s, s.partyAt)];
  if (!tile.cleared && !tile.completed) return err('Clear the fog gate tile first (core p.16).');
  const next = nextBoss(s);
  if (!next) return err('No boss awaits beyond the fog gate.');
  startBossFight(s, next.boss, next.tier);
  return OK;
}

function campaignBossId(s: DsState): string {
  const section = dsCurrentSection(s);
  const bosses = dsSectionBossIds(section);
  return bosses[bosses.length - 1].boss;
}

function nextBoss(s: DsState): { boss: string; tier: 'mini' | 'main' | 'mega' } | null {
  if (s.campaign) {
    const bosses = dsSectionBossIds(dsCurrentSection(s));
    const idx = s.campaign.sectionBossKills;
    return bosses[Math.min(idx, bosses.length - 1)] ?? null;
  }
  if (s.stage === 'oneshot') {
    const bossId = s.options.oneshot!.boss;
    return { boss: bossId, tier: DS_BOSSES[bossId].tier };
  }
  if (s.stage === 'preMini') return { boss: s.miniBossId!, tier: 'mini' };
  if (s.stage === 'postMini') return { boss: s.mainBossId!, tier: 'main' };
  if (s.stage === 'megaBoss') return { boss: s.megaBossId!, tier: 'mega' };
  return null;
}

// ---------- encounter setup ----------

function startEncounter(s: DsState, tile: DsTile, backward: boolean): void {
  const card = DS_ENCOUNTER_BY_ID[tile.encounterId!];
  tile.faceUp = true;
  const g = dsTileGraph(tile.faceId);
  const edges = g.entranceEdges;
  const entryEdge = backward ? edges[edges.length - 1] : edges[0];
  log(s, `Encounter: ${card.name} (level ${card.level}).`, 'flip');

  const enemies: DsEnemyModel[] = [];
  let uid = 1;
  for (const sp of card.spawns) {
    if (sp.enemy === 'UNKNOWN') continue; // undrawable cards are filtered earlier
    const nodes = dsNodesOfTerrain(tile.faceId, sp.node);
    const nodeId = nodes[0] ?? g.face.nodes[0].id;
    enemies.push({ uid: uid++, typeId: sp.enemy, nodeId, wounds: 0, conditions: [] });
  }
  const terrain: { piece: string; nodeId: string; destroyed?: boolean }[] = [];
  for (const t of card.terrain) {
    const nodes = dsNodesOfTerrain(tile.faceId, t.node);
    const nodeId = nodes[0];
    if (!nodeId) continue;
    terrain.push({ piece: t.piece, nodeId });
    if (t.piece === 'chest' || t.piece === 'mimic-chest') {
      if (!tile.chests[nodeId]) tile.chests[nodeId] = 'closed';
      if (t.piece === 'mimic-chest' && !tile.mimicChests.includes(nodeId)) tile.mimicChests.push(nodeId);
    }
  }
  // a revealed, undefeated mimic waits on its node (add-ons p.13)
  if (tile.mimicAmbush === 'mimic' && tile.mimicNode) {
    terrain.push({ piece: 'mimic-chest', nodeId: tile.mimicNode });
  }

  // traps: assigned once, tokens keep their nodes across resets (core p.18)
  if (card.trapped && tile.traps == null) {
    const entryNodes = new Set(g.face.entrances.map((e) => e.nodeId));
    const eligible = g.face.nodes.filter((n) => !n.terrain && !entryNodes.has(n.id)).map((n) => n.id);
    const tokens = dsShuffle(s, DS_TRAP_TOKENS.map((_, i) => i)).slice(0, eligible.length);
    tile.traps = Object.fromEntries(eligible.map((nodeId, i) => [nodeId, tokens[i]]));
  }

  s.encounter = {
    tileId: tile.id,
    faceId: tile.faceId,
    encounterId: card.id,
    entryEdge,
    enemies,
    terrain,
    trapsRevealed: [],
    turn: 'enemies',
    activeSeat: s.firstActivationSeat,
    enemyPhases: 0,
    invaderRun: null,
    uidSeq: uid,
    orderOverride: null,
  };
  s.phase = 'encounter';

  // invasion reveal: after normal setup (add-ons p.14)
  if (tile.invaderToken) {
    tile.invaderToken = false;
    const invId = s.miniBossDefeated ? DS_INVADER_ADVANCED : DS_INVADER_STANDARD;
    if (!s.invadersDone.includes(invId)) spawnInvader(s, invId);
  }

  placePartyAtEntry(s, entryEdge);
  // Aggro: the players choose who led the way (core p.19)
  dsPushPending(s, 0, 'leadCharacter', 'Who led the way? (takes the Aggro token)',
    s.characters.map((c) => ({ key: `seat:${c.seat}`, label: DS_CLASSES[c.classId].name })), {});
  s.script.push({ t: 'enemyPhase' });
}

/** The players place their own models on the entry nodes (core p.19/p.28,
 * 3-model cap). One pending per character, queued upfront in seat order so
 * every placement resolves before the leadCharacter pending; a node that
 * fills mid-sequence re-pends with fresh options. A one-node doorway places
 * everyone silently. */
function placePartyAtEntry(s: DsState, entryEdge: string): void {
  const enc = s.encounter!;
  for (const ch of s.characters) { ch.nodeId = null; ch.arc = null; }
  const all = dsEntryNodes(enc.faceId, entryEdge);
  if (all.length <= 1) {
    for (const ch of s.characters) {
      ch.nodeId = all[0];
      afterCharEnters(s, ch, { viaDodge: false });
    }
    return;
  }
  for (const ch of s.characters) {
    dsPushPending(s, ch.seat, 'entryPlace',
      `${DS_CLASSES[ch.classId].name}: choose your entry node (core p.19).`,
      all.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })), { entryEdge });
  }
}

function spawnInvader(s: DsState, invId: string): void {
  const enc = s.encounter!;
  const g = dsTileGraph(enc.faceId);
  const inv = DS_INVADERS[invId];
  // centre node if unoccupied, else any free node 2+ from the entry nodes (add-ons p.14)
  const cx = g.face.sizePx[0] / 2, cy = g.face.sizePx[1] / 2;
  const byCentre = [...g.face.nodes].sort((a, b) =>
    (Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)));
  const entries = dsEntryNodes(enc.faceId, enc.entryEdge);
  const free = (id: string): boolean => dsOccupancy(s, id) === 0 && !dsNodeBlocked(s, id);
  let node = free(byCentre[0].id) ? byCentre[0].id : null;
  if (!node) {
    node = byCentre.slice(1).find((n) => free(n.id) && entries.every((e) => dsNodeDistance(enc.faceId, n.id, e) >= 2))?.id
      ?? byCentre.find((n) => free(n.id))?.id ?? byCentre[0].id;
  }
  enc.enemies.push({ uid: enc.uidSeq++, typeId: invId, nodeId: node, wounds: 0, conditions: [], invader: true });
  const deckSize = inv.data.behaviourDeckSize;
  const all = inv.behaviors.map((_, i) => i);
  enc.invaderRun = { typeId: invId, deck: dsShuffle(s, all).slice(0, deckSize), discard: [], heatedUp: false };
  log(s, `${inv.data.name} invades!`, 'flip', node);
}

// ---------- character movement ----------

const ARC_ADJ: Record<DsArc, DsArc[]> = {
  front: ['left', 'right'], back: ['left', 'right'],
  left: ['front', 'back'], right: ['front', 'back'],
};

function activeChar(s: DsState, seat: number): DsCharacter | null {
  if (s.phase !== 'encounter' && s.phase !== 'bossEncounter') return null;
  const enc = s.encounter;
  if (!enc || enc.turn !== 'characters' || enc.activeSeat !== seat) return null;
  return s.characters[seat];
}

function moveCost(s: DsState, ch: DsCharacter, run: boolean, destBlockedByBarrel: boolean): number {
  let cost = run ? 1 : 0;
  if (ch.conditions.includes('frostbite')) cost += 1; // core p.21
  if (destBlockedByBarrel) cost += 1; // destroy the barrel (core p.17)
  return cost;
}

function doMove(s: DsState, seat: number, nodeId: string | undefined, arcStep: DsArc | undefined, run: boolean): DsActionResult {
  const ch = activeChar(s, seat);
  if (!ch) return err('Not your activation.');
  const act = ch.act!;
  const free = act.freeMoves > 0;
  // shift/heroic free moves ignore the grouping restriction (core p.23)
  if (!free && act.stage === 'attack' && act.movedBefore) {
    return err('Movement groups entirely before or after your attacks (core p.22).');
  }
  if (!free && act.stage === 'post' && act.movedBefore) {
    return err('Movement groups entirely before or after your attacks (core p.22).');
  }
  if (!run && !free && act.walkUsed) return err('You already walked this activation (walk once, core p.22).');

  const enc = s.encounter!;
  const bossUnit = bossUnitAt(s, ch.nodeId!);

  if (arcStep) {
    // rotate around the boss: a 1-node step moves to an adjacent arc (core p.28)
    if (!bossUnit || !ch.arc) return err('Arc steps happen on a boss node.');
    if (!ARC_ADJ[ch.arc].includes(arcStep)) return err('Only adjacent arcs.');
    const cost = free ? 0 : moveCost(s, ch, run, false);
    if (!dsCanSpendStamina(ch, cost)) return err('Not enough stamina.');
    dsSpendStamina(ch, cost);
    consumeMoveEconomy(ch, run, free);
    ch.arc = arcStep;
    log(s, `${DS_CLASSES[ch.classId].name} circles to the boss's ${arcStep} arc.`, 'move', ch.nodeId!, seat);
    return OK;
  }

  if (!nodeId) return err('Pick a destination node.');
  const g = dsTileGraph(enc.faceId);
  if (!g.adj[ch.nodeId!]?.includes(nodeId)) return err('Move one adjacent node at a time (core p.10).');

  // leaving a boss node: stay in the same arc (core p.28)
  if (bossUnit && ch.arc) {
    const arcs = dsNodeArcs(enc.faceId, bossUnit.nodeId!, bossUnit.facing!, nodeId);
    if (!arcs.includes(ch.arc)) return err(`Leaving the boss keeps your arc (${ch.arc}).`);
  }

  const barrel = enc.terrain.find((t) => t.nodeId === nodeId && t.piece === 'barrel' && !t.destroyed);
  if (dsNodeBlocked(s, nodeId) && !barrel) return err('Terrain blocks that node (core p.17).');
  const cost = free ? (barrel ? 1 : 0) : moveCost(s, ch, run, Boolean(barrel));
  if (!dsCanSpendStamina(ch, cost)) return err('Not enough stamina.');

  const occ = dsOccupancy(s, nodeId);
  if (occ >= DS_NODE_MODEL_CAP) {
    // 4th model forces a player-chosen push of one of the three (core p.10/21)
    dsSpendStamina(ch, cost);
    consumeMoveEconomy(ch, run, free);
    if (barrel) barrel.destroyed = true;
    queueNodeOverflow(s, seat, nodeId, { kind: 'charMove', seat, nodeId });
    return OK;
  }

  dsSpendStamina(ch, cost);
  consumeMoveEconomy(ch, run, free);
  if (barrel) { barrel.destroyed = true; log(s, 'A barrel is smashed apart.', 'move', nodeId); }
  finishCharMove(s, ch, nodeId);
  return OK;
}

function consumeMoveEconomy(ch: DsCharacter, run: boolean, free: boolean): void {
  const act = ch.act!;
  if (free) { act.freeMoves -= 1; return; } // shift moves are outside the walk/run economy
  if (!run) act.walkUsed = true;
  act.swapWindow = false;
  act.deprivedSwap = false;
  if (act.stage === 'start') act.stage = 'pre';
  else if (act.stage === 'attack') act.stage = 'post';
}

function finishCharMove(s: DsState, ch: DsCharacter, nodeId: string): void {
  prevNode.set(ch, ch.nodeId!);
  ch.nodeId = nodeId;
  log(s, `${DS_CLASSES[ch.classId].name} moves.`, 'move', nodeId, ch.seat);
  afterCharEnters(s, ch, { viaDodge: false });
}

/** Node-entry consequences: boss arcs, dropped souls, traps. */
function afterCharEnters(s: DsState, ch: DsCharacter, opts: { viaDodge: boolean }): void {
  const enc = s.encounter;
  if (!enc) return;
  const unit = bossUnitAt(s, ch.nodeId!);
  if (unit && unit.nodeId !== null) {
    const arcs = dsNodeArcs(enc.faceId, unit.nodeId, unit.facing ?? [0, -1], previousNodeOf(ch) ?? ch.nodeId!);
    if (opts.viaDodge || arcs.length === 0) ch.arc = arcs[0] ?? 'front';
    else if (arcs.length === 1) ch.arc = arcs[0];
    else {
      dsPushPending(s, ch.seat, 'arcChoice', 'You approach along an arc boundary — pick your arc.',
        arcs.map((a) => ({ key: a, label: `${a} arc` })), { seat: ch.seat });
    }
  } else {
    ch.arc = null;
  }
  // dropped soul retrieval (core p.19)
  const drop = s.droppedSouls;
  if (drop && drop.nodeId === ch.nodeId
    && ((enc.tileId && drop.tileId === enc.tileId) || (!enc.tileId && drop.tileId === `arena:${s.boss?.id}`))) {
    s.soulCache += drop.amount;
    s.droppedSouls = null;
    log(s, `${DS_CLASSES[ch.classId].name} recovers ${drop.amount} dropped souls.`, undefined, ch.nodeId!, ch.seat);
  }
  // traps: characters only, first entry flips (core p.18)
  const tile = enc.tileId ? s.tiles[tileIndex(s, enc.tileId)] : null;
  if (tile?.traps && ch.nodeId! in tile.traps && !enc.trapsRevealed.includes(ch.nodeId!)) {
    enc.trapsRevealed.push(ch.nodeId!);
    const token = DS_TRAP_TOKENS[tile.traps[ch.nodeId!]];
    if (!token) {
      log(s, 'A trap token flips — blank.', 'flip', ch.nodeId!);
    } else {
      log(s, `A trap springs (${token.damage} damage)!`, 'flip', ch.nodeId!);
      queueUnblockableDamage(s, ch.seat, token.damage, token.dodge, 'trap');
    }
  }
}

// crude single-step memory: used only to derive the approach arc
const prevNode = new WeakMap<DsCharacter, string>();
function previousNodeOf(ch: DsCharacter): string | null { return prevNode.get(ch) ?? null; }

// ---------- swap / estus / heroic ----------

function doSwapBackup(s: DsState, seat: number, handCardId?: string, backupCardId?: string): DsActionResult {
  const ch = activeChar(s, seat);
  if (!ch) return err('Not your activation.');
  if (!ch.act!.swapWindow) return err('Backup swaps happen at the start of your activation (core p.22).');
  if (!handCardId && !backupCardId) return err('Nothing to swap.');
  let handSlot: 'handL' | 'handR' | null = null;
  if (handCardId) {
    if (ch.handL?.cardId === handCardId) handSlot = 'handL';
    else if (ch.handR?.cardId === handCardId) handSlot = 'handR';
    else return err('That card is not in a hand slot.');
  }
  let incoming = null;
  if (backupCardId) {
    const bi = ch.backup.findIndex((e) => e.cardId === backupCardId);
    if (bi < 0) return err('That card is not in your backup slot.');
    incoming = ch.backup[bi];
    const inCard = DS_TREASURE_BY_ID[incoming.cardId];
    const slot = handSlot ?? (ch.handL == null ? 'handL' : ch.handR == null ? 'handR' : null);
    if (!slot) return err('Both hands are full — name the card to swap out.');
    const other = slot === 'handL' ? ch.handR : ch.handL;
    const otherAfter = handSlot && other?.cardId === handCardId ? null : other;
    if (inCard.twoHanded && otherAfter) return err('Two-handed weapons need the other hand empty.');
    if (otherAfter && DS_TREASURE_BY_ID[otherAfter.cardId].twoHanded) return err('The other hand holds a two-handed weapon.');
    if (!dsMeetsReqsEquipped(ch, incoming)) return err('Stat requirements not met.');
    ch.backup.splice(bi, 1);
    if (handSlot && ch[handSlot]) ch.backup.push(ch[handSlot]!);
    ch[slot] = incoming;
  } else if (handSlot) {
    ch.backup.push(ch[handSlot]!);
    ch[handSlot] = null;
  }
  log(s, `${DS_CLASSES[ch.classId].name} swaps equipment.`, undefined, undefined, seat);
  return OK;
}

function doEstus(s: DsState, seat: number): DsActionResult {
  const ch = activeChar(s, seat);
  if (!ch) return err('Estus is used during your own activation (core p.11).');
  if (!ch.estus) return err('Your Estus Flask is empty.');
  ch.estus = false;
  ch.stamina = 0;
  ch.damage = 0;
  log(s, `${DS_CLASSES[ch.classId].name} drinks Estus — endurance bar cleared.`, undefined, undefined, seat);
  return OK;
}

function doHeroic(s: DsState, seat: number): DsActionResult {
  const ch = activeChar(s, seat);
  if (!ch) return err('Heroic actions happen during your activation.');
  if (!ch.heroic) return err('Heroic action already used (ready again after a rest).');
  const act = ch.act!;
  switch (ch.classId) {
    case 'herald': // Perseverance
      for (const c of s.characters) dsGainStamina(c, 2);
      break;
    case 'thief': // Lucky Break
      dsGainStamina(ch, 2);
      dsHealDamage(ch, 2);
      ch.luck = true;
      break;
    case 'cleric': { // Keep the Faith
      for (const c of s.characters) {
        if (c.nodeId && ch.nodeId && dsNodeDistance(s.encounter!.faceId, ch.nodeId, c.nodeId) <= 1) dsHealDamage(c, 2);
      }
      break;
    }
    case 'warrior': // Berserk Charge
      act.freeMoves += 1;
      act.buff = 'warrior';
      break;
    case 'sorcerer': act.buff = 'sorcerer'; break; // Spell Fury
    case 'pyromancer': act.buff = 'pyromancer'; break; // Explosive Firepower
    case 'mercenary': act.mercExtra = true; break; // Rapid Strike
    case 'deprived': // Combat Versatility
      if (!act.swapWindow) return err('Combat Versatility happens at the start of your activation.');
      act.deprivedSwap = true;
      break;
    case 'knight':
    case 'assassin':
      return err('This heroic action triggers from a roll prompt (block / successful dodge).');
    default:
      return err('Unknown class heroic.');
  }
  ch.heroic = false;
  log(s, `${DS_CLASSES[ch.classId].name} uses ${DS_CLASSES[ch.classId].heroicAction.name}!`, undefined, undefined, seat);
  return OK;
}

// ---------- attacks (character) ----------

interface ParsedIcons {
  magic: boolean; node: boolean; shaft: boolean; push: boolean;
  range: number | null; repeat: number; shiftBefore: number; shiftAfter: number;
  conditions: DsCondition[];
}

function parseIcons(action: DsTreasureAction): ParsedIcons {
  const p: ParsedIcons = { magic: false, node: false, shaft: false, push: false, range: null, repeat: 1, shiftBefore: 0, shiftAfter: 0, conditions: [] };
  for (const icon of action.icons ?? []) {
    if (icon === 'magic') p.magic = true;
    else if (icon === 'node') p.node = true;
    else if (icon === 'shaft') p.shaft = true;
    else if (icon === 'push') p.push = true;
    else if (icon.startsWith('range:')) p.range = Number(icon.slice(6));
    else if (icon.startsWith('repeat:')) p.repeat = Number(icon.slice(7));
    else if (icon.startsWith('shift:')) {
      const parts = icon.split(':');
      if (parts[2] === 'after') p.shiftAfter += Number(parts[1]);
      else p.shiftBefore += Number(parts[1]);
    } else if (['bleed', 'poison', 'frostbite', 'stagger'].includes(icon)) p.conditions.push(icon as DsCondition);
    // sheet-crop verified glyph aliases: the shield-bash glyph IS the stagger
    // icon (crest/large-leather shield) and the dot-in-arc glyph IS the node
    // icon (Atonement's node-wide push)
    else if (icon === 'shield-bash') p.conditions.push('stagger');
    else if (icon === 'dot-in-arc') p.node = true;
  }
  return p;
}

function bossUnitAt(s: DsState, nodeId: string): DsBossUnit | null {
  return s.boss?.units.find((u) => u.inPlay && u.nodeId === nodeId) ?? null;
}

function doAttack(s: DsState, seat: number, a: { hand: 'L' | 'R'; option: number; targetUid?: number; targetUnit?: string; nodeId?: string }): DsActionResult {
  const ch = activeChar(s, seat);
  if (!ch) return err('Not your activation.');
  const act = ch.act!;
  if (act.stage === 'post') return err('Movement groups entirely before or after attacks (core p.22).');
  const eq = a.hand === 'L' ? ch.handL : ch.handR;
  if (!eq) return err('That hand is empty.');
  if (act.attacked.includes(a.hand) && !act.mercExtra) return err('One attack per hand weapon per activation (core p.22).');
  const card = DS_TREASURE_BY_ID[eq.cardId];
  const option = card.actions?.[a.option];
  if (!option) return err('No such attack option.');
  if (option.effect) return doCastSpell(s, seat, a.hand, option); // spell DSL (decision log 11)
  if (!option.dice || Object.keys(option.dice).length === 0) {
    return err('This printed action has no encoded effect (report it — every card should).');
  }
  if (!dsMeetsReqsEquipped(ch, eq)) return err('Stat requirements not met.');

  const icons = parseIcons(option);
  const usingMerc = act.mercExtra;
  const isMagic = icons.magic || (act.magicWeapon ?? 0) > 0; // (Great) Magic Weapon makes every attack magical

  // range
  let range = icons.range ?? card.range ?? 0;
  if (act.buff === 'sorcerer' && isMagic) range = 9999;
  const enc = s.encounter!;

  // stamina cost
  let cost = option.staminaCost;
  if (act.buff === 'warrior' && range === 0) cost = 0;
  if (act.buff === 'sorcerer' && isMagic) cost = Math.max(0, cost - 3);
  if (usingMerc) cost = 0;
  if (ch.conditions.includes('stagger')) cost += 1; // core p.21
  if (s.boss?.id === 'gargoyle' && s.boss.heatedUp && bossUnitAt(s, ch.nodeId!)) cost += 1; // Flying High
  if (!dsCanSpendStamina(ch, cost)) return err('Not enough stamina.');

  // target resolution
  interface Target { kind: 'enemy' | 'boss'; uid?: number; unitKey?: string; nodeId: string }
  const targets: Target[] = [];
  const nodeAoE = icons.node || (act.buff === 'warrior' && range === 0);
  if (a.targetUnit != null) {
    const unit = s.boss?.units.find((u) => u.key === a.targetUnit && u.inPlay && u.nodeId != null);
    if (!unit) return err('No such boss target.');
    targets.push({ kind: 'boss', unitKey: unit.key, nodeId: unit.nodeId! });
  } else if (a.targetUid != null) {
    const en = enc.enemies.find((e) => e.uid === a.targetUid && e.wounds < enemyHealth(e));
    if (!en) return err('No such enemy.');
    if (nodeAoE) {
      for (const other of enc.enemies) {
        if (other.nodeId === en.nodeId && other.wounds < enemyHealth(other)) {
          targets.push({ kind: 'enemy', uid: other.uid, nodeId: other.nodeId });
        }
      }
    } else {
      targets.push({ kind: 'enemy', uid: en.uid, nodeId: en.nodeId });
    }
  } else if (a.nodeId != null && nodeAoE) {
    for (const other of enc.enemies) {
      if (other.nodeId === a.nodeId && other.wounds < enemyHealth(other)) {
        targets.push({ kind: 'enemy', uid: other.uid, nodeId: other.nodeId });
      }
    }
    const unit = bossUnitAt(s, a.nodeId);
    if (unit) targets.push({ kind: 'boss', unitKey: unit.key, nodeId: a.nodeId });
    if (targets.length === 0) return err('No enemies on that node.');
  } else {
    return err('Name a target.');
  }
  const dist = dsNodeDistance(enc.faceId, ch.nodeId!, targets[0].nodeId);
  if (dist > range) return err('Target out of range.');
  if (icons.shaft && dist === 0) return err('Shaft weapons cannot attack at range 0 (core p.23).');

  // pay & bookkeeping
  dsSpendStamina(ch, cost);
  if (usingMerc) act.mercExtra = false;
  else act.attacked.push(a.hand);
  if (act.stage === 'pre') { act.stage = 'attack'; act.movedBefore = true; }
  else if (act.stage === 'start') { act.stage = 'attack'; act.movedBefore = false; }
  act.swapWindow = false;
  act.deprivedSwap = false;
  const buffUsed = act.buff;
  if ((buffUsed === 'warrior' && range === 0) || ((buffUsed === 'sorcerer' || buffUsed === 'pyromancer') && isMagic)) act.buff = null;

  // dice pool
  const dice: { color: 'black' | 'blue' | 'orange' }[] = [];
  for (const [color, n] of Object.entries(option.dice)) {
    for (let i = 0; i < (n ?? 0); i++) dice.push({ color: color as 'black' | 'blue' | 'orange' });
  }
  if (buffUsed === 'pyromancer' && isMagic) dice.push({ color: 'black' });
  // weak-arc bonus vs boss (core p.28): once per flipped card
  if (targets[0].kind === 'boss' && s.boss && !s.boss.weakArcUsed && inWeakArc(s, ch, targets[0].unitKey!)) {
    dice.push({ color: 'black' });
    s.boss.weakArcUsed = true;
    log(s, 'Weak arc! One extra black die.', 'dice', undefined, seat);
  }

  const flat = (option.flatModifier ?? 0)
    + eq.upgrades.reduce((n, u) => n + dsUpgradeDamageBonus(DS_TREASURE_BY_ID[u]), 0)
    + ((act.magicWeapon ?? 0) === 2 ? 1 : 0); // Great Magic Weapon: +1 damage
  const conditions = [...icons.conditions];
  if (eq.upgrades.some((u) => dsUpgradeGrantsBleed(DS_TREASURE_BY_ID[u]))) conditions.push('bleed');

  // Thorns: attacking Longfinger Kirk from his node inflicts Bleed (enemies.json)
  const thorny = targets.some((t) => t.kind === 'enemy'
    && enc.enemies.find((e) => e.uid === t.uid)?.typeId === DS_INVADER_ADVANCED
    && t.nodeId === ch.nodeId);
  if (thorny) addCondition(s, charConditions(ch), 'bleed', `${DS_CLASSES[ch.classId].name} is torn by thorns`);

  // shift icons: free movement around the attack (core p.23), modelled as
  // free move credits that ignore walk/run economy and grouping
  act.freeMoves += icons.shiftBefore + icons.shiftAfter;

  // repeat xN: the entire option repeats (core p.23); each repetition rolls anew
  for (let rep = 0; rep < icons.repeat; rep++) {
    s.script.push({
      t: 'charAttackRoll', seat, dice, flat,
      magical: isMagic, push: icons.push, conditions,
      targets: targets.map((tg) => ({ ...tg })),
    });
  }
  return OK;
}

// ---------- spell DSL (decision log 11, reconciled) ----------

/** Boreal Outrider never gains frostbite/stagger (its data card note). */
function bossConditionFilter(bossId: string, conds: DsCondition[]): DsCondition[] {
  return bossId === 'boreal-outrider-knight'
    ? conds.filter((c) => c !== 'frostbite' && c !== 'stagger')
    : conds;
}

function applySpellGrant(s: DsState, target: DsCharacter, fx: Extract<DsSpellEffect, { kind: 'grant' }>, casterSeat: number): void {
  if (fx.stamina) dsGainStamina(target, fx.stamina);
  if (fx.health) dsHealDamage(target, fx.health);
  const parts: string[] = [];
  if (fx.stamina) parts.push(`${fx.stamina} stamina`);
  if (fx.health) parts.push(`${fx.health} health`);
  log(s, `${DS_CLASSES[target.classId].name} gains ${parts.join(' and ')}.`, undefined, target.nodeId ?? undefined, casterSeat);
}

function applySpellAfflictEnemy(s: DsState, casterSeat: number, uid: number, conditions: DsCondition[], push: boolean): void {
  const enc = s.encounter!;
  const en = enc.enemies.find((e) => e.uid === uid);
  if (!en) return;
  for (const c of conditions) addCondition(s, en.conditions, c, enemyName(en));
  if (push) {
    const caster = s.characters[casterSeat];
    queuePushEnemy(s, en.uid, { mode: 'awayFrom', fromNodeId: caster.nodeId ?? en.nodeId, chooserSeat: casterSeat });
  }
}

function applySpellAfflictBoss(s: DsState, unitKey: string, conditions: DsCondition[]): void {
  const run = s.boss;
  if (!run) return;
  const unit = run.units.find((u) => u.key === unitKey);
  if (!unit?.inPlay) return;
  for (const c of bossConditionFilter(run.id, conditions)) {
    addCondition(s, (unit.conditions ??= []), c, DS_BOSSES[run.id].name);
  }
}

/** Resolve one spell target pick; shared by the auto-resolve path (a unique
 * target never pends) and the `spellTarget` pending. Chains the second pick
 * for Force's twin stagger and Bountiful Light's "up to two". */
function resolveSpellPick(s: DsState, data: Record<string, unknown>, pick: string): void {
  const fx = data.fx as DsSpellEffect;
  const casterSeat = data.casterSeat as number;
  const conditions = (data.conditions as DsCondition[] | undefined) ?? [];
  const push = Boolean(data.push);
  const cardName = (data.cardName as string | undefined) ?? 'The spell';
  if (pick === 'skip') return;
  if (pick.startsWith('seat:') && fx.kind === 'grant') {
    applySpellGrant(s, s.characters[Number(pick.slice(5))], fx, casterSeat);
  } else if (pick.startsWith('node:')) {
    const node = pick.slice(5);
    if (fx.kind === 'grant') {
      for (const c of s.characters) if (c.nodeId === node) applySpellGrant(s, c, fx, casterSeat);
    } else {
      // node afflicts hit enemies only (decision log 10)
      const uids = (s.encounter?.enemies ?? []).filter((e) => e.nodeId === node).map((e) => e.uid);
      for (const uid of uids) applySpellAfflictEnemy(s, casterSeat, uid, conditions, push);
    }
  } else if (pick.startsWith('uid:')) {
    const uid = Number(pick.slice(4));
    if (fx.kind === 'rapport') applyEnemyDamage(s, uid, fx.damage, casterSeat);
    else applySpellAfflictEnemy(s, casterSeat, uid, conditions, push);
  } else if (pick.startsWith('unit:')) {
    applySpellAfflictBoss(s, pick.slice(5), conditions);
  }
  const remaining = (data.remaining as number | undefined) ?? 1;
  if (remaining > 1) {
    const opts = ((data.options as DsPendingOption[] | undefined) ?? []).filter((o) => o.key !== pick);
    if (opts.length > 0) {
      dsPushPending(s, casterSeat, 'spellTarget', `${cardName}: a second target?`,
        [...opts, { key: 'skip', label: 'No second target' }],
        { ...data, options: opts, remaining: remaining - 1 });
    }
  }
}

/** Cast a text/icon-only card action through its structured effect. Same
 * action economy as an attack: one use per hand item per activation, grouped
 * movement, stamina cost with the same modifiers. An impossible cast (no
 * legal target) is rejected before anything is paid. */
function doCastSpell(s: DsState, seat: number, hand: 'L' | 'R', option: DsTreasureAction): DsActionResult {
  const fx = option.effect!;
  const ch = activeChar(s, seat);
  if (!ch) return err('Not your activation.');
  const act = ch.act!;
  if (act.stage === 'post') return err('Movement groups entirely before or after attacks (core p.22).');
  const eq = hand === 'L' ? ch.handL : ch.handR;
  if (!eq) return err('That hand is empty.');
  if (act.attacked.includes(hand) && !act.mercExtra) return err('One attack per hand weapon per activation (core p.22).');
  const card = DS_TREASURE_BY_ID[eq.cardId];
  if (!dsMeetsReqsEquipped(ch, eq)) return err('Stat requirements not met.');
  const icons = parseIcons(option);
  const usingMerc = act.mercExtra;
  const range = icons.range ?? card.range ?? 0;
  let cost = option.staminaCost;
  if (act.buff === 'sorcerer' && icons.magic) cost = Math.max(0, cost - 3);
  if (usingMerc) cost = 0;
  if (ch.conditions.includes('stagger')) cost += 1; // core p.21
  if (s.boss?.id === 'gargoyle' && s.boss.heatedUp && bossUnitAt(s, ch.nodeId!)) cost += 1; // Flying High
  if (!dsCanSpendStamina(ch, cost)) return err('Not enough stamina.');

  const enc = s.encounter!;
  const inRange = (nodeId: string) => dsNodeDistance(enc.faceId, ch.nodeId!, nodeId) <= range;
  const charsInRange = s.characters.filter((c) => c.nodeId && inRange(c.nodeId));
  const aliveEnemies = enc.enemies.filter((e) => e.wounds < enemyHealth(e));

  // pre-validate the target space: reject before paying, auto-resolve a
  // unique target, pend a real choice
  let pend: { prompt: string; options: DsPendingOption[]; remaining: number } | null = null;
  let autoPick: string | null = null;
  switch (fx.kind) {
    case 'grant': {
      if (fx.who === 'self') break;
      if (charsInRange.length === 0) return err('No character within range.');
      if (fx.who === 'oneNode') {
        const nodes = [...new Set(charsInRange.map((c) => c.nodeId!))].sort();
        if (nodes.length === 1) autoPick = `node:${nodes[0]}`;
        else {
          pend = {
            prompt: `${card.name}: choose the node.`,
            options: nodes.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })), remaining: 1,
          };
        }
        break;
      }
      if (fx.who === 'allOthers' && charsInRange.every((c) => c.seat === seat)) return err('No other character within range.');
      if (fx.who === 'one' || fx.who === 'upTo2') {
        if (charsInRange.length === 1) autoPick = `seat:${charsInRange[0].seat}`;
        else {
          pend = {
            prompt: `${card.name}: choose who receives it.`,
            options: charsInRange.map((c) => ({ key: `seat:${c.seat}`, label: DS_CLASSES[c.classId].name })),
            remaining: fx.who === 'upTo2' ? 2 : 1,
          };
        }
      }
      break;
    }
    case 'afflict': {
      if (fx.node) {
        const nodes = [...new Set(aliveEnemies.filter((e) => inRange(e.nodeId)).map((e) => e.nodeId))].sort();
        if (nodes.length === 0) return err('No enemy within range.');
        if (nodes.length === 1) autoPick = `node:${nodes[0]}`;
        else {
          pend = {
            prompt: `${card.name}: choose the node.`,
            options: nodes.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })), remaining: 1,
          };
        }
        break;
      }
      const opts: DsPendingOption[] = aliveEnemies.filter((e) => inRange(e.nodeId))
        .map((e) => ({ key: `uid:${e.uid}`, label: `${enemyName(e)} (${e.nodeId})` }));
      if (icons.conditions.length > 0 && s.boss && bossConditionFilter(s.boss.id, icons.conditions).length > 0) {
        for (const u of s.boss.units) {
          if (u.inPlay && u.nodeId && inRange(u.nodeId)) opts.push({ key: `unit:${u.key}`, label: bossUnitName(s, u.key) });
        }
      }
      if (opts.length === 0) return err('No target within range.');
      if (opts.length === 1) autoPick = opts[0].key;
      else pend = { prompt: `${card.name}: choose the target.`, options: opts, remaining: fx.targets ?? 1 };
      break;
    }
    case 'rapport': {
      const opts: DsPendingOption[] = aliveEnemies
        .filter((e) => inRange(e.nodeId) && aliveEnemies.filter((o) => o.nodeId === e.nodeId).length >= 2)
        .map((e) => ({ key: `uid:${e.uid}`, label: `${enemyName(e)} (${e.nodeId})` }));
      if (opts.length === 0) return err('Rapport needs an enemy sharing a node with another enemy.');
      if (opts.length === 1) autoPick = opts[0].key;
      else pend = { prompt: 'Rapport: choose the enemy.', options: opts, remaining: 1 };
      break;
    }
    default: break; // buff / defenceBuff / shift always land
  }

  // pay & bookkeeping (mirrors doAttack)
  dsSpendStamina(ch, cost);
  if (usingMerc) act.mercExtra = false;
  else act.attacked.push(hand);
  if (act.stage === 'pre') { act.stage = 'attack'; act.movedBefore = true; }
  else if (act.stage === 'start') { act.stage = 'attack'; act.movedBefore = false; }
  act.swapWindow = false;
  act.deprivedSwap = false;
  log(s, `${DS_CLASSES[ch.classId].name} uses ${card.name}.`, 'attack', ch.nodeId ?? undefined, seat);

  const data = {
    fx, casterSeat: seat, conditions: icons.conditions, push: icons.push, cardName: card.name,
  } as Record<string, unknown>;
  if (pend) {
    dsPushPending(s, seat, 'spellTarget', pend.prompt, pend.options,
      { ...data, options: pend.options, remaining: pend.remaining });
    return OK;
  }
  if (autoPick) { resolveSpellPick(s, data, autoPick); return OK; }

  switch (fx.kind) {
    case 'buff':
      act.magicWeapon = Math.max(act.magicWeapon ?? 0, fx.damage ? 2 : 1) as 0 | 1 | 2;
      log(s, `${card.name}: attacks are magical${fx.damage ? ` and gain +${fx.damage} damage` : ''} this activation.`, undefined, undefined, seat);
      break;
    case 'defenceBuff': {
      const targets = fx.who === 'self' ? [ch] : fx.who === 'party' ? s.characters : charsInRange;
      for (const c of targets) {
        (c.defBuffs ??= []).push({ block: fx.block, resist: fx.resist, expires: fx.until, label: card.name });
      }
      log(s, `${card.name}: bonus defence dice ${fx.until === 'enemyPhaseEnd' ? 'during the next enemy activation' : 'until the next character activation'}.`, undefined, undefined, seat);
      break;
    }
    case 'shift':
      act.freeMoves += fx.nodes;
      log(s, `${card.name}: ${fx.nodes} free moves.`, 'move', ch.nodeId ?? undefined, seat);
      break;
    case 'grant': {
      const targets = fx.who === 'all' ? charsInRange
        : fx.who === 'allOthers' ? charsInRange.filter((c) => c.seat !== seat)
          : [ch]; // 'self'
      for (const t of targets) applySpellGrant(s, t, fx, seat);
      break;
    }
    default: break;
  }
  return OK;
}

function bossUnitName(s: DsState, unitKey: string): string {
  const def = DS_BOSSES[s.boss!.id];
  if (unitKey === 'boss' || unitKey === 'mimic') return def.name;
  return `${def.name} (${unitKey})`;
}

function charConditions(ch: DsCharacter): DsCondition[] { return ch.conditions; }

function topDiscardCardFor(run: DsBossRun, unitKey: string): DsBossCard | null {
  const cell = run.discard[0];
  if (cell == null) return null;
  return lookupBossCard(run, cell, unitKey);
}

function inWeakArc(s: DsState, ch: DsCharacter, unitKey: string): boolean {
  return weakArcAt(s, ch.nodeId!, ch.arc, unitKey);
}

/** Is the model at `nodeId` (with `arc` when base-to-base) in the weak arc of
 * the unit's current top-of-discard card? Shared by characters and summons. */
function weakArcAt(s: DsState, nodeId: string, arc: DsArc | null, unitKey: string): boolean {
  const run = s.boss!;
  const unit = run.units.find((u) => u.key === unitKey)!;
  const card = topDiscardCardFor(run, unitKey);
  if (!card) return false;
  const lastAttack = [...card.ops].reverse().find((op) => op.op === 'attack') as Extract<DsBossOp, { op: 'attack' }> | undefined;
  const weak = lastAttack?.arcs?.weak ?? card.arcs?.weak ?? [];
  if (weak.length === 0) return false;
  const arcs = nodeId === unit.nodeId
    ? (arc ? [arc] : [])
    : dsNodeArcs(s.encounter!.faceId, unit.nodeId!, unit.facing ?? [0, -1], nodeId);
  return arcs.some((a) => weak.includes(a));
}

// ---------- end activation ----------

function doEndActivation(s: DsState, seat: number): DsActionResult {
  const ch = activeChar(s, seat);
  if (!ch) return err('Not your activation.');
  endOfModelActivation(s, ch);
  if (s.phase === 'gameOver' || !s.encounter) return OK;
  ch.act = null;
  s.firstActivationSeat = (seat + 1) % s.options.partySize;
  s.encounter.turn = 'enemies';
  if (s.boss) {
    // the summon activates after EVERY character activation (add-ons p.8):
    // boss, character, summon, boss, character, summon, ...
    if (activeSummon(s)) s.script.push({ t: 'summonTurn' });
    s.script.push({ t: 'bossPhase' });
  } else {
    s.script.push({ t: 'enemyPhase' });
  }
  return OK;
}

/** Poison ticks, then poison/frostbite/stagger clear (core p.21). */
function endOfModelActivation(s: DsState, ch: DsCharacter): void {
  if (ch.conditions.includes('poison')) {
    applyCharDamage(s, ch.seat, 1, { attack: false, source: 'poison' });
  }
  ch.conditions = ch.conditions.filter((c) => !DS_CONDITIONS[c].clearsAtActivationEnd);
}

// ---------- dash through (campaign, core p.33) ----------

function doDash(s: DsState, seat: number, tileId: string | 'bonfire'): DsActionResult {
  if (!s.campaign) return err('Dashing through is a campaign rule (core p.33).');
  const ch = activeChar(s, seat);
  if (!ch) return err('Dash during a character activation.');
  const enc = s.encounter!;
  if (s.boss) return err('No dashing through a boss encounter.');
  if (enc.enemyPhases < 1) return err('The enemies activate once before the party may dash (core p.33).');
  if (!enc.tileId) return err('Nowhere to dash from.');
  if (!adjacentPlaces(s, enc.tileId).includes(tileId)) return err('Dash to a connected tile.');
  const tile = s.tiles[tileIndex(s, enc.tileId)];
  // enemies removed, the card flips back face down; red AND black cubes kept
  // (locked decision, core digest section 19)
  tile.faceUp = false;
  tile.cleared = false;
  if (enc.invaderRun) tile.invaderToken = true; // the invader lies in wait again
  for (const c of s.characters) { c.nodeId = null; c.arc = null; c.act = null; c.conditions = []; c.defBuffs = []; }
  s.encounter = null;
  s.phase = 'bonfire';
  s.pendings = [];
  s.script = [];
  log(s, 'The party dashes through!', 'move');
  s.partyAt = tileId === 'bonfire' ? 'bonfire' : tileId;
  if (tileId !== 'bonfire') {
    const dest = s.tiles[tileIndex(s, tileId)];
    const backward = tileIndex(s, tileId) < tileIndex(s, tile.id);
    if (!dest.faceUp && !dest.completed) startEncounter(s, dest, backward);
  }
  return OK;
}

// ---------- chests / mimics ----------

function doOpenChest(s: DsState, seat: number, nodeId: string): DsActionResult {
  if (s.phase !== 'bonfire') return err('Chests open after the encounter is defeated (core p.17).');
  if (s.partyAt === 'bonfire') return err('The party is not on a tile.');
  const tile = s.tiles[tileIndex(s, s.partyAt)];
  if (!tile.cleared && !tile.completed) return err('Defeat the encounter first.');
  if (tile.mimicAmbush === 'mimic' && tile.mimicNode === nodeId) {
    startMimicFight(s, tile, nodeId); // re-engage a waiting mimic (add-ons p.13)
    return OK;
  }
  if (tile.chests[nodeId] !== 'closed') return err('No closed chest there.');
  // mimic check: printed mimic-chests always ambush (spec OQ9); the mimics
  // module adds one face-down ambush card per tile (add-ons p.10)
  const printedMimic = tile.mimicChests.includes(nodeId);
  let isMimic = printedMimic;
  if (!isMimic && s.options.mimics && tile.mimicAmbush === 'pending') {
    // ambush deck composition is not in any golden; engine judgment: 1-in-3
    tile.mimicAmbush = dsRandInt(s, 3) === 0 ? 'mimic' : 'treasure';
    isMimic = tile.mimicAmbush === 'mimic';
  }
  if (isMimic) {
    delete tile.chests[nodeId];
    tile.mimicAmbush = 'mimic';
    tile.mimicNode = nodeId;
    startMimicFight(s, tile, nodeId);
    return OK;
  }
  tile.chests[nodeId] = 'open';
  log(s, 'The chest creaks open — two treasures inside.', 'flip', nodeId, seat);
  drawTreasure(s, seat, 'chest');
  drawTreasure(s, seat, 'chest');
  return OK;
}

function startMimicFight(s: DsState, tile: DsTile, nodeId: string): void {
  const mimicId = s.miniBossDefeated ? 'voracious-mimic' : 'hungry-mimic';
  const def = DS_BOSSES[mimicId];
  log(s, `The chest is a ${def.name}!`, 'flip', nodeId);
  // characters keep their end-of-encounter positions (add-ons p.12); cubes
  // were already cleared by the encounter victory
  s.encounter = {
    tileId: tile.id, faceId: tile.faceId, encounterId: null,
    entryEdge: dsTileGraph(tile.faceId).entranceEdges[0],
    enemies: [], terrain: [], trapsRevealed: [],
    turn: 'enemies', activeSeat: s.firstActivationSeat, enemyPhases: 0,
    invaderRun: null, uidSeq: 1, orderOverride: null,
  };
  for (const ch of s.characters) {
    if (!ch.nodeId) ch.nodeId = dsEntryNodes(tile.faceId, s.encounter.entryEdge)[0];
  }
  const cards = def.behaviors!;
  const deck = dsShuffle(s, cards.map((c) => String(c.cell))).slice(0, def.data!.deckSize);
  s.boss = makeBossRun(mimicId, 'mimic', deck, [
    { key: 'boss', health: def.data!.health, maxHealth: def.data!.health, nodeId, facing: [0, -1], inPlay: true },
  ]);
  s.phase = 'bossEncounter';
  dsPushPending(s, 0, 'leadCharacter', 'The mimic lunges — who holds its attention?',
    s.characters.map((c) => ({ key: `seat:${c.seat}`, label: DS_CLASSES[c.classId].name })), {});
  s.script.push({ t: 'bossPhase' });
}

// ---------- boss fights ----------

function makeBossRun(id: string, kind: DsBossRun['kind'], deck: string[], units: DsBossUnit[]): DsBossRun {
  return {
    id, kind, units, deck, discard: [],
    heatedUp: false, heatUpsUsed: 0, revealed: [],
    summonsRemaining: null, fireBeamBuff: false,
    beamDeck: null, beamDiscard: null, strafeDeck: null, strafeDiscard: null,
    weakArcUsed: false, expectedDeckCount: deck.length, gargoyleTwo: false,
    lastHitSeats: [], templateNodes: null, pendingLanding: null,
  };
}

function arenaFace(s: DsState, bossId: string, tier: 'mini' | 'main' | 'mega'): string {
  if (tier === 'mega') {
    return bossId === 'old-iron-king' ? 'mega-old-iron-king-back'
      : bossId === 'black-dragon-kalameet' ? 'mega-black-dragon-kalameet-back'
        : 'mega-four-kings-back';
  }
  // Engine judgment: the main-boss room uses the main tile face alone; the
  // rulebook's combined mini+main room needs a merged graph the tiles golden
  // does not carry yet (flagged for the spec decision log).
  const base = tier === 'mini' ? 'boss1' : 'boss2';
  return `${base}${dsRandInt(s, 2) === 0 ? 'a' : 'b'}`;
}

function startBossFight(s: DsState, bossId: string, tier: 'mini' | 'main' | 'mega', gargoyleTwo = false): void {
  const def = DS_BOSSES[bossId];
  const faceId = arenaFace(s, bossId, tier);
  const g = dsTileGraph(faceId);
  const entryEdge = g.entranceEdges[0];
  const entries = dsEntryNodes(faceId, entryEdge);
  const centroid = (): [number, number] => {
    let x = 0, y = 0;
    for (const e of entries) { x += g.nodeById[e].x; y += g.nodeById[e].y; }
    return [x / entries.length, y / entries.length];
  };
  const facingToward = (from: string, to: [number, number]): [number, number] => {
    const n = g.nodeById[from];
    return [to[0] - n.x, to[1] - n.y];
  };

  s.encounter = {
    tileId: null, faceId, encounterId: null, entryEdge,
    enemies: [], terrain: [], trapsRevealed: [],
    turn: 'enemies', activeSeat: s.firstActivationSeat, enemyPhases: 0,
    invaderRun: null, uidSeq: 1, orderOverride: null,
  };
  s.phase = 'bossEncounter';

  const units: DsBossUnit[] = [];
  let deck: string[] = [];
  let run: DsBossRun;
  if (bossId === 'ornstein-and-smough') {
    const spawn = dsNodesOfTerrain(faceId, 'mainBossSpawn')[0] ?? g.face.nodes[0].id;
    // Smough spawns on the mini-boss node of the combined room; with the
    // single-face arena the engine seats him on the free adjacent node with
    // the most connections (judgment, flagged).
    const smoughNode = [...g.adj[spawn]].sort((a, b) => g.adj[b].length - g.adj[a].length)[0];
    const od = def.pairedData!;
    units.push({ key: 'ornstein', health: od.ornstein.health, maxHealth: od.ornstein.health, nodeId: spawn, facing: facingToward(spawn, centroid()), inPlay: true });
    units.push({ key: 'smough', health: od.smough.health, maxHealth: od.smough.health, nodeId: smoughNode, facing: facingToward(smoughNode, centroid()), inPlay: true });
    deck = dsShuffle(s, def.pairedBehaviors!.map((c) => String(c.cell))).slice(0, od.ornstein.deckSize);
    run = makeBossRun(bossId, tier, deck, units);
  } else if (bossId === 'four-kings') {
    const spawn = dsNodesOfTerrain(faceId, 'megaBossSpawn')[0];
    for (let k = 1; k <= 4; k++) {
      units.push({
        key: `king${k}`, health: def.data!.health, maxHealth: def.data!.health,
        nodeId: k === 1 ? spawn : null, facing: k === 1 ? facingToward(spawn, [g.face.sizePx[0] / 2, g.face.sizePx[1] / 2]) : null,
        inPlay: k === 1,
      });
    }
    deck = dsShuffle(s, def.kingOne!.map((c) => String(c.cell))).slice(0, def.data!.deckSize);
    run = makeBossRun(bossId, tier, deck, units);
    run.summonsRemaining = 3;
  } else {
    let spawn: string;
    if (bossId === 'old-iron-king') {
      // OIK starts on the ironKing node opposite the doorway (tiles golden)
      const kings = dsNodesOfTerrain(faceId, 'ironKing');
      spawn = [...kings].sort((a, b) =>
        Math.min(...entries.map((e) => dsNodeDistance(faceId, b, e)))
        - Math.min(...entries.map((e) => dsNodeDistance(faceId, a, e))))[0];
    } else if (tier === 'mega') {
      spawn = dsNodesOfTerrain(faceId, 'megaBossSpawn')[0];
    } else {
      spawn = dsNodesOfTerrain(faceId, tier === 'mini' ? 'miniBossSpawn' : 'mainBossSpawn')[0];
    }
    units.push({ key: 'boss', health: def.data!.health, maxHealth: def.data!.health, nodeId: spawn, facing: facingToward(spawn, centroid()), inPlay: true });
    let standardPool = def.behaviors!.filter((c) => !c.heatUp && !c.coolDownCard);
    if (bossId === 'old-iron-king') {
      // deck = 3 fixed Fire Beam signatures + 3 random of the 6 standard (oik p.12)
      const std = dsShuffle(s, standardPool.map((c) => String(c.cell))).slice(0, 3);
      deck = dsShuffle(s, [...def.fireBeam!.map((c) => `beam:${c.cell}`), ...std]);
      run = makeBossRun(bossId, tier, deck, units);
      run.beamDeck = dsShuffle(s, def.blastedNodes!.map((c) => c.cell));
      run.beamDiscard = [];
    } else if (bossId === 'black-dragon-kalameet') {
      // deck = 2 fixed signatures (Mark of Calamity, Hellfire Blast) + 4 of 10 (kal)
      const signatures = def.behaviors!.filter((c) => c.name === 'Mark of Calamity' || c.name === 'Hellfire Blast').map((c) => String(c.cell));
      standardPool = standardPool.filter((c) => !signatures.includes(String(c.cell)));
      const std = dsShuffle(s, standardPool.map((c) => String(c.cell))).slice(0, def.data!.deckSize - signatures.length);
      deck = dsShuffle(s, [...signatures, ...std]);
      run = makeBossRun(bossId, tier, deck, units);
      run.strafeDeck = dsShuffle(s, def.fieryRuin!.map((c) => c.cell));
      run.strafeDiscard = [];
    } else {
      deck = dsShuffle(s, standardPool.map((c) => String(c.cell))).slice(0, def.data!.deckSize);
      run = makeBossRun(bossId, tier, deck, units);
    }
  }
  run.gargoyleTwo = gargoyleTwo;
  s.boss = run;

  // gravestone intel: one revealed card per gravestone in cleared encounters (core p.28)
  let gravestones = 0;
  for (const tile of s.tiles) {
    if (!tile.faceUp || !tile.encounterId) continue;
    gravestones += DS_ENCOUNTER_BY_ID[tile.encounterId].terrain.filter((t) => t.piece === 'gravestone').length;
  }
  if (gravestones > 0) {
    const reveal = dsShuffle(s, run.deck).slice(0, Math.min(gravestones, run.deck.length));
    run.revealed = reveal;
    log(s, `Gravestone intel: ${reveal.length} behaviour card(s) revealed.`, 'flip');
  }
  run.deck = dsShuffle(s, run.deck);

  placePartyAtEntry(s, entryEdge);
  log(s, `${def.name} awaits beyond the fog gate${gargoyleTwo ? ' — the second Gargoyle descends!' : '.'}`, 'phase');
  dsPushPending(s, 0, 'leadCharacter', 'Place the Aggro token.',
    s.characters.map((c) => ({ key: `seat:${c.seat}`, label: DS_CLASSES[c.classId].name })), {});

  // white phantom: shuffle the earned tier's data cards, draw one, place the
  // ally on an entry node like a character (add-ons p.8)
  s.summon = null;
  if (s.options.summons && s.summonEarned === tier) {
    s.summonEarned = null;
    const pool = dsSummonPool(tier as 'mini' | 'main');
    const sdef = pool[dsRandInt(s, pool.length)];
    s.summon = {
      id: sdef.id, health: sdef.data.health, maxHealth: sdef.data.health,
      nodeId: null, arc: null,
      deck: dsShuffle(s, sdef.behaviors.map((c) => c.cell)), discard: [],
      dodgeBuff: 0,
    };
    log(s, `${sdef.name} answers the summons!`, 'phase');
    // the phantom is placed on an entry node like a character, by the party
    // (add-ons p.8; host decides, decision log 22)
    dsPushPending(s, 0, 'entryPlace', `Place ${sdef.name} on an entry node (add-ons p.8).`,
      entries.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })), { unit: 'summon', entryEdge });
  }
  s.script.push({ t: 'bossPhase' });
}

// ---------- choose: pending resolution ----------

function doChoose(s: DsState, seat: number, pick: string): DsActionResult {
  const head = s.pendings[0];
  if (!head) return err('Nothing to decide.');
  if (head.seat !== seat) return err('Not your decision.');
  if (!head.options.some((o) => o.key === pick)) return err('Not one of the options.');
  s.pendings.shift();
  resolveChoice(s, head, pick);
  return OK;
}

function pushPendingFront(s: DsState, seat: number, kind: DsPending['kind'], prompt: string, options: DsPendingOption[], data: Record<string, unknown>): void {
  s.pendings.unshift({ id: s.pendingSeq++, seat, kind, prompt, options, data });
}

function resolveChoice(s: DsState, p: DsPending, pick: string): void {
  switch (p.kind) {
    case 'spellTarget': {
      resolveSpellPick(s, p.data, pick);
      return;
    }
    case 'entryPlace': {
      const node = pick.slice(5);
      if (p.data.unit === 'summon') {
        const su = s.summon;
        if (!su || !s.encounter) return;
        const sdef = DS_SUMMONS[su.id];
        if (dsOccupancy(s, node) >= DS_NODE_MODEL_CAP) {
          const open = dsEntryNodes(s.encounter.faceId, p.data.entryEdge as string)
            .filter((n) => dsOccupancy(s, n) < DS_NODE_MODEL_CAP);
          if (open.length === 0) { su.nodeId = node; return; } // cap unreachable with 4+1 models on 2+ nodes
          dsPushPending(s, 0, 'entryPlace', `Place ${sdef.name} on an entry node (add-ons p.8).`,
            open.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })), p.data);
          return;
        }
        su.nodeId = node;
        log(s, `${sdef.name} takes the field.`, 'move', node);
        if (sdef.data.battleReadyShift) {
          queueSummonMove(s, sdef.data.battleReadyShift,
            `${sdef.data.specialName}: ${sdef.name} may move before the first enemy activation.`);
        }
        return;
      }
      const ch = s.characters[p.seat];
      // the node may have filled since the options were computed (earlier
      // placements) — re-pend at the FRONT with the still-open nodes
      if (dsOccupancy(s, node) >= DS_NODE_MODEL_CAP) {
        const open = dsEntryNodes(s.encounter!.faceId, p.data.entryEdge as string)
          .filter((n) => dsOccupancy(s, n) < DS_NODE_MODEL_CAP);
        if (open.length === 0) return; // unreachable: 4 chars never fill 2+ entry nodes
        if (open.length === 1) {
          ch.nodeId = open[0];
          ch.arc = null;
          afterCharEnters(s, ch, { viaDodge: false });
          return;
        }
        pushPendingFront(s, p.seat, 'entryPlace', p.prompt,
          open.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })), p.data);
        return;
      }
      ch.nodeId = node;
      ch.arc = null;
      log(s, `${DS_CLASSES[ch.classId].name} steps in.`, 'move', node, ch.seat);
      afterCharEnters(s, ch, { viaDodge: false });
      return;
    }
    case 'leadCharacter': {
      s.aggroSeat = Number(pick.slice(5));
      log(s, `${DS_CLASSES[s.characters[s.aggroSeat].classId].name} holds the Aggro token.`, undefined, undefined, s.aggroSeat);
      return;
    }
    case 'treasureKeep': {
      const cardId = p.data.cardId as string;
      if (pick === 'stash') {
        s.inventory.push(cardId);
      } else {
        const seat = Number(pick.slice(6));
        autoEquip(s, s.characters[seat], cardId);
      }
      return;
    }
    case 'emberAssign': {
      const seat = Number(pick.slice(5));
      s.characters[seat].ember = true;
      const cardId = p.data.cardId as string;
      s.treasureDiscard.push(cardId);
      s.embersGainedEver += 1;
      log(s, `${DS_CLASSES[s.characters[seat].classId].name} is kindled with an Ember.`, undefined, undefined, seat);
      maybeTriggerInvasion(s);
      return;
    }
    case 'arcChoice': {
      s.characters[p.data.seat as number].arc = pick as DsArc;
      return;
    }
    case 'enemyTieOrder': {
      const enc = s.encounter!;
      enc.orderOverride = [...(enc.orderOverride ?? []), Number(pick.slice(4))];
      return; // the enemyPhase step re-evaluates on pump
    }
    case 'enemyMoveTie': {
      const step = s.script[0];
      if (step && (step.t === 'eMove' || step.t === 'bOp')) step.chosenNode = pick.slice(5);
      return;
    }
    case 'nodeOverflow': {
      const data = p.data as { nodeId: string; after?: { kind: 'charMove'; seat: number; nodeId: string } | null };
      // push the chosen occupant to any adjacent node (players' choice next)
      if (pick.startsWith('char:')) {
        queuePushChar(s, Number(pick.slice(5)), { mode: 'any', fromNodeId: data.nodeId });
      } else {
        queuePushEnemy(s, Number(pick.slice(6)), { mode: 'any', fromNodeId: data.nodeId, chooserSeat: p.seat });
      }
      if (data.after?.kind === 'charMove') {
        finishCharMove(s, s.characters[data.after.seat], data.after.nodeId);
      }
      return;
    }
    case 'pushDest': {
      applyPushDest(s, p.data, pick.slice(5));
      return;
    }
    case 'defence': {
      resolveDefenceChoice(s, p, pick);
      return;
    }
    case 'dodgeMove': {
      const seat = p.data.seat as number;
      const ch = s.characters[seat];
      if (pick !== 'stay') {
        prevNode.set(ch, ch.nodeId!);
        ch.nodeId = pick.slice(5);
        log(s, `${DS_CLASSES[ch.classId].name} rolls aside.`, 'move', ch.nodeId, seat);
        afterCharEnters(s, ch, { viaDodge: true });
      }
      rollDodge(s, p.data);
      return;
    }
    case 'postRoll': {
      resolvePostRoll(s, p, pick);
      return;
    }
    case 'trap': {
      const data = p.data as { seat: number; damage: number; dodge: number; source: string };
      if (pick === 'dodge' && !dsCanSpendStamina(s.characters[data.seat], dodgeStamina(s.characters[data.seat]))) {
        pick = 'suffer';
      }
      if (pick === 'suffer') {
        applyCharDamage(s, data.seat, data.damage, { attack: data.source !== 'trap', source: data.source });
      } else {
        // dodge: 1 stamina, roll vs difficulty, no move (already displaced)
        const ch = s.characters[data.seat];
        dsSpendStamina(ch, dodgeStamina(ch));
        rollDodge(s, { ...data, noMove: true, damage: data.damage, dodge: data.dodge, unreduced: true });
      }
      return;
    }
    case 'summonOffer': {
      const souls = p.data.souls as number;
      if (pick === 'summon') {
        s.summonEarned = p.data.tier as 'mini' | 'main';
        log(s, 'The party takes no souls — a summon sign glows beside the fog gate (add-ons p.7).', 'phase');
      } else {
        s.soulCache += souls;
        log(s, `The party claims the ${souls} souls.`, 'win');
      }
      return;
    }
    case 'summonMove': {
      const su = s.summon;
      if (!su || pick === 'stay') return;
      const [, node, arc] = pick.split(':');
      su.nodeId = node;
      su.arc = (arc as DsArc | undefined) ?? null;
      log(s, `${DS_SUMMONS[su.id].name} moves.`, 'move', node);
      return;
    }
    default:
      throw new Error(`unhandled pending kind ${p.kind}`);
  }
}

function autoEquip(s: DsState, ch: DsCharacter, cardId: string): void {
  const card = DS_TREASURE_BY_ID[cardId];
  const eq = { cardId, upgrades: [] as string[] };
  if (card.kind === 'armour') {
    if (ch.armour) s.inventory.push(ch.armour.cardId);
    ch.armour = eq;
  } else if (card.slot === 'hand') {
    const twoH = Boolean(card.twoHanded);
    if (dsWeaponCount(ch) >= 3) { s.inventory.push(cardId); return; }
    if (!ch.handL && (!twoH || !ch.handR)) ch.handL = eq;
    else if (!ch.handR && !twoH && !(ch.handL && DS_TREASURE_BY_ID[ch.handL.cardId].twoHanded)) ch.handR = eq;
    else ch.backup.push(eq);
  } else {
    s.inventory.push(cardId);
    return;
  }
  log(s, `${DS_CLASSES[ch.classId].name} equips ${card.name}.`, undefined, undefined, ch.seat);
}

// ---------- invasion trigger (add-ons p.11) ----------

function maybeTriggerInvasion(s: DsState): void {
  if (!s.options.invaders) return;
  const invId = s.miniBossDefeated ? DS_INVADER_ADVANCED : DS_INVADER_STANDARD;
  if (s.invadersDone.includes(invId)) return;
  if (s.tiles.some((t) => t.invaderToken)) return; // tokens already in play
  if (s.encounter?.invaderRun) return;
  const unexplored = s.tiles.filter((t) => !t.faceUp && !t.completed && t.kind === 'explore');
  if (unexplored.length === 0) return;
  const tile = unexplored[dsRandInt(s, unexplored.length)];
  tile.invaderToken = true;
  log(s, 'A dark spirit stirs — invasion tokens are dealt.', 'flip');
}

// ---------- pushes ----------

interface PushCharCtx {
  mode: 'awayFrom' | 'any' | 'sameArc';
  fromNodeId: string;
  pushDamage?: number;
  dodge?: number;
  bleedOnPush?: boolean;
  source?: string;
}

function pushCharDestinations(s: DsState, ch: DsCharacter, ctx: PushCharCtx): string[] {
  const enc = s.encounter!;
  const g = dsTileGraph(enc.faceId);
  const cur = ch.nodeId!;
  let cands = g.adj[cur].filter((n) =>
    !dsNodeBlocked(s, n) && dsOccupancy(s, n) < DS_NODE_MODEL_CAP);
  if (ctx.mode === 'awayFrom') {
    const d0 = dsNodeDistance(enc.faceId, cur, ctx.fromNodeId);
    cands = cands.filter((n) => dsNodeDistance(enc.faceId, n, ctx.fromNodeId) > d0);
  }
  const unit = bossUnitAt(s, cur);
  if (unit && ch.arc && ctx.mode !== 'any') {
    // pushed off a boss node: stay in the same arc; wall-blocked falls back to
    // any adjacent node (core p.28, simplified)
    const inArc = cands.filter((n) => dsNodeArcs(enc.faceId, cur, unit.facing ?? [0, -1], n).includes(ch.arc!));
    if (inArc.length > 0) cands = inArc;
  }
  return cands;
}

function queuePushChar(s: DsState, seat: number, ctx: PushCharCtx): void {
  const ch = s.characters[seat];
  const cands = pushCharDestinations(s, ch, ctx);
  const finish = (): void => {
    if (ctx.bleedOnPush) addCondition(s, ch.conditions, 'bleed', `${DS_CLASSES[ch.classId].name} bleeds`);
    if (ctx.pushDamage) {
      const options: DsPendingOption[] = [{ key: 'suffer', label: `Suffer ${ctx.pushDamage} damage` }];
      if (dsCanSpendStamina(ch, dodgeStamina(ch)) && dsDodgeDiceCount(ch) >= 0) {
        options.push({ key: 'dodge', label: 'Dodge (1 stamina)' });
      }
      pushPendingFront(s, seat, 'trap', `${ctx.source ?? 'The push'} deals ${ctx.pushDamage} damage — dodge or suffer (unblockable).`,
        options, { seat, damage: ctx.pushDamage, dodge: ctx.dodge ?? 1, source: ctx.source ?? 'push' });
    }
  };
  if (cands.length === 0) {
    // Engine judgment: with no legal destination the model stays put (still
    // suffers any push damage).
    log(s, `${DS_CLASSES[ch.classId].name} is cornered — nowhere to be pushed.`, 'move', ch.nodeId!, seat);
    finish();
    return;
  }
  if (cands.length === 1) {
    movePushedChar(s, ch, cands[0]);
    finish();
    return;
  }
  pushPendingFront(s, seat, 'pushDest', 'You are pushed — choose the node.',
    cands.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })),
    { kind: 'char', seat, finishCtx: ctx });
}

function movePushedChar(s: DsState, ch: DsCharacter, nodeId: string): void {
  prevNode.set(ch, ch.nodeId!);
  ch.nodeId = nodeId;
  log(s, `${DS_CLASSES[ch.classId].name} is shoved.`, 'move', nodeId, ch.seat);
  afterCharEnters(s, ch, { viaDodge: false });
}

interface PushEnemyCtx { mode: 'awayFrom' | 'any'; fromNodeId: string; chooserSeat: number }

function queuePushEnemy(s: DsState, uid: number, ctx: PushEnemyCtx): void {
  const enc = s.encounter!;
  const en = enc.enemies.find((e) => e.uid === uid);
  if (!en) return;
  const g = dsTileGraph(enc.faceId);
  let cands = g.adj[en.nodeId].filter((n) => !dsNodeBlocked(s, n) && dsOccupancy(s, n) < DS_NODE_MODEL_CAP);
  if (ctx.mode === 'awayFrom') {
    const d0 = dsNodeDistance(enc.faceId, en.nodeId, ctx.fromNodeId);
    cands = cands.filter((n) => dsNodeDistance(enc.faceId, n, ctx.fromNodeId) > d0);
  }
  if (cands.length === 0) return;
  if (cands.length === 1) { en.nodeId = cands[0]; return; }
  pushPendingFront(s, ctx.chooserSeat, 'pushDest', 'Push the enemy — choose the node.',
    cands.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })),
    { kind: 'enemy', uid });
}

function applyPushDest(s: DsState, data: Record<string, unknown>, nodeId: string): void {
  if (data.kind === 'char') {
    const ch = s.characters[data.seat as number];
    movePushedChar(s, ch, nodeId);
    const ctx = data.finishCtx as PushCharCtx | undefined;
    if (ctx?.bleedOnPush) addCondition(s, ch.conditions, 'bleed', `${DS_CLASSES[ch.classId].name} bleeds`);
    if (ctx?.pushDamage) {
      const options: DsPendingOption[] = [{ key: 'suffer', label: `Suffer ${ctx.pushDamage} damage` }];
      if (dsCanSpendStamina(ch, dodgeStamina(ch))) options.push({ key: 'dodge', label: 'Dodge (1 stamina)' });
      pushPendingFront(s, ch.seat, 'trap', `The push deals ${ctx.pushDamage} damage — dodge or suffer.`,
        options, { seat: ch.seat, damage: ctx.pushDamage, dodge: ctx.dodge ?? 1, source: ctx.source ?? 'push' });
    }
  } else {
    const enc = s.encounter!;
    const en = enc.enemies.find((e) => e.uid === data.uid);
    if (en) en.nodeId = nodeId;
  }
}

function queueNodeOverflow(
  s: DsState, chooserSeat: number, nodeId: string,
  after: { kind: 'charMove'; seat: number; nodeId: string } | null,
): void {
  const m = dsModelsAt(s, nodeId);
  const options: DsPendingOption[] = [];
  for (const c of m.chars) options.push({ key: `char:${c.seat}`, label: DS_CLASSES[c.classId].name });
  for (const e of m.enemies) options.push({ key: `enemy:${e.uid}`, label: enemyName(e) });
  // bosses are only displaced by bosses (core p.10) — not offered
  if (options.length === 0) {
    if (after?.kind === 'charMove') finishCharMove(s, s.characters[after.seat], after.nodeId);
    return;
  }
  pushPendingFront(s, chooserSeat, 'nodeOverflow', 'The node is full — push one model off.',
    options, { nodeId, after });
}

// ---------- damage ----------

const enemyDef = (e: DsEnemyModel) => (e.invader ? DS_INVADERS[e.typeId].data : DS_ENEMIES[e.typeId].data);
const enemyHealth = (e: DsEnemyModel): number => enemyDef(e).health;
const enemyName = (e: DsEnemyModel): string => enemyDef(e).name;

function addCondition(s: DsState, list: DsCondition[], cond: DsCondition, note: string): void {
  if (cond === 'calamity') {
    // 4-token supply cap (kal p.13)
    const inPlay = s.characters.filter((c) => c.conditions.includes('calamity')).length;
    if (inPlay >= DS_CALAMITY_SUPPLY) return;
  }
  if (list.includes(cond)) return; // one token of each type per model (core p.21)
  list.push(cond);
  log(s, `${note} (${cond}).`);
}

interface CharDamageOpts { attack: boolean; source: string; conditions?: DsCondition[]; pushAfter?: { fromNodeId: string } }

function applyCharDamage(s: DsState, seat: number, dmg: number, opts: CharDamageOpts): void {
  const ch = s.characters[seat];
  let total = dmg;
  if (ch.conditions.includes('bleed') && total > 0) {
    total += 2;
    ch.conditions = ch.conditions.filter((c) => c !== 'bleed');
    log(s, `${DS_CLASSES[ch.classId].name} bleeds for +2.`);
  }
  if (opts.attack && ch.ember && total >= DS_EMBER_THRESHOLD) total -= DS_EMBER_REDUCTION; // core p.12
  if (opts.attack && total > 0 && ch.conditions.includes('calamity')) {
    ch.conditions = ch.conditions.filter((c) => c !== 'calamity'); // kal p.13
  }
  if (total > 0) {
    ch.damage += total;
    log(s, `${DS_CLASSES[ch.classId].name} suffers ${total} damage (${opts.source}).`, 'attack', ch.nodeId ?? undefined, seat);
  }
  // hit effects (conditions/push) apply even at 0 damage (core p.20)
  for (const c of opts.conditions ?? []) addCondition(s, ch.conditions, c, DS_CLASSES[ch.classId].name);
  if (ch.stamina + ch.damage >= 10) {
    partyWipe(s, seat);
    return;
  }
  if (opts.pushAfter) queuePushChar(s, seat, { mode: 'awayFrom', fromNodeId: opts.pushAfter.fromNodeId });
}

function applyEnemyDamage(s: DsState, uid: number, dmg: number, bySeat: number | null): void {
  const enc = s.encounter!;
  const en = enc.enemies.find((e) => e.uid === uid);
  if (!en) return;
  let total = dmg;
  if (en.conditions.includes('bleed') && total > 0) {
    total += 2;
    en.conditions = en.conditions.filter((c) => c !== 'bleed');
  }
  if (total <= 0) { log(s, `${enemyName(en)} shrugs it off.`, 'attack', en.nodeId); return; }
  en.wounds += total;
  log(s, `${enemyName(en)} takes ${total} damage (${en.wounds}/${enemyHealth(en)}).`, 'attack', en.nodeId, bySeat ?? undefined);
  if (en.invader && enc.invaderRun && !enc.invaderRun.heatedUp) {
    const inv = DS_INVADERS[en.typeId];
    if (enemyHealth(en) - en.wounds <= inv.data.heatUpPoint) {
      enc.invaderRun.heatedUp = true;
      const unused = inv.behaviors.map((_, i) => i).filter((i) => !enc.invaderRun!.deck.includes(i) && !enc.invaderRun!.discard.includes(i));
      if (unused.length > 0) {
        enc.invaderRun.deck = dsShuffle(s, [...enc.invaderRun.deck, unused[dsRandInt(s, unused.length)]]);
        log(s, `${inv.data.name} heats up!`, 'flip');
      }
    }
  }
  if (en.wounds >= enemyHealth(en)) {
    enc.enemies = enc.enemies.filter((e) => e.uid !== uid);
    log(s, `${enemyName(en)} is destroyed.`, 'attack', en.nodeId, bySeat ?? undefined);
    if (en.invader) {
      // immediate rewards even mid-encounter (add-ons p.15)
      s.soulCache += DS_INVADER_KILL_SOULS;
      const treasure = dsTreasureDeckCards(`invader-${en.typeId}`)[0];
      if (treasure) { s.inventory.push(treasure.id); s.treasurePool.push(treasure.id); }
      s.invadersDone.push(en.typeId);
      enc.invaderRun = null;
      log(s, `The invader falls: +${DS_INVADER_KILL_SOULS} souls and ${treasure?.name ?? 'its treasure'}.`);
    }
    if (enc.enemies.length === 0 && !s.boss) encounterVictory(s);
  }
}

function applyBossDamage(s: DsState, unitKey: string, dmg: number, bySeat: number | null): void {
  const run = s.boss!;
  const unit = run.units.find((u) => u.key === unitKey)!;
  const def = DS_BOSSES[run.id];
  let total = dmg;
  if (run.id === 'titanite-demon' && total >= 3) total -= 1; // Titanite Construct
  if (unit.conditions?.includes('bleed') && total > 0) {
    total += 2; // bleed bursts on the next wound, then clears (core p.21)
    unit.conditions = unit.conditions.filter((c) => c !== 'bleed');
    log(s, `${def.name} bleeds for +2.`);
  }
  if (total <= 0) { log(s, `${def.name} shrugs it off.`, 'attack', unit.nodeId ?? undefined); return; }
  unit.health = Math.max(0, unit.health - total);
  log(s, `${def.name}${run.units.length > 1 ? ` (${unitKey})` : ''} takes ${total} damage (${unit.health}/${unit.maxHealth}).`, 'attack', unit.nodeId ?? undefined, bySeat ?? undefined);

  // Old Dragonslayer: first three 4+ damage hits stack heat-up cards on top
  if (run.id === 'old-dragonslayer' && total >= 4 && run.heatUpsUsed < 3) {
    run.heatUpsUsed += 1;
    const unused = unusedHeatUps(run);
    if (unused.length > 0) {
      run.deck.unshift(unused[dsRandInt(s, unused.length)]);
      run.expectedDeckCount += 1;
      log(s, 'The Old Dragonslayer grows corrupted — a heat-up card tops the deck.', 'flip');
    }
  }

  if (unit.health <= 0) {
    unit.inPlay = false;
    unit.nodeId = null;
    log(s, `${def.name}${run.units.length > 1 ? ` — ${unitKey} —` : ''} is slain!`, 'win');
    onBossUnitDeath(s, unitKey);
    return;
  }
  maybeHeatUp(s, unitKey);
}

function unusedHeatUps(run: DsBossRun): string[] {
  const def = DS_BOSSES[run.id];
  const pool = run.kind === 'mimic'
    ? def.behaviors!.map((c) => String(c.cell)) // mimics: any unused behaviour card (ao p.11)
    : def.behaviors?.filter((c) => c.heatUp).map((c) => String(c.cell)) ?? [];
  return pool.filter((cell) => !run.deck.includes(cell) && !run.discard.includes(cell));
}

function maybeHeatUp(s: DsState, unitKey: string): void {
  const run = s.boss!;
  if (run.heatedUp) return;
  const def = DS_BOSSES[run.id];
  const unit = run.units.find((u) => u.key === unitKey)!;
  const data = def.paired ? def.pairedData![unitKey as 'ornstein' | 'smough'] : def.data!;
  const threshold = data.heatUpThreshold;
  if (threshold == null || threshold <= 0) return; // O&S/Four Kings/Old Dragonslayer never heat up normally
  if (unit.health > threshold) return;

  // Sif override: at 3 or less the whole deck becomes Limping Strike (dr p.8)
  if (run.id === 'great-grey-wolf-sif' && unit.health <= 3) return heatSif(s);
  run.heatedUp = true;
  if (run.id === 'artorias') {
    // remove 2 random deck cards, add all 3 heat-ups, shuffle (dr p.9)
    const removed = Math.min(2, run.deck.length);
    run.deck = dsShuffle(s, run.deck).slice(removed);
    const ups = def.behaviors!.filter((c) => c.heatUp).map((c) => String(c.cell));
    run.deck = dsShuffle(s, [...run.deck, ...ups]);
    run.expectedDeckCount += ups.length - removed;
    log(s, 'Artorias walks the Abyss — the deck is corrupted.', 'flip');
    return;
  }
  if (run.id === 'smelter-demon') {
    const ups = dsShuffle(s, def.behaviors!.filter((c) => c.heatUp).map((c) => String(c.cell))).slice(0, 5);
    run.deck = dsShuffle(s, ups);
    run.discard = [];
    run.expectedDeckCount = ups.length;
    log(s, 'The Smelter Demon ignites its blade!', 'flip');
    return;
  }
  if (run.id === 'old-iron-king') {
    run.fireBeamBuff = true; // Old Iron Rage: Fire Beams +1 damage/+1 dodge (oik p.12)
    log(s, 'Old Iron Rage: the fire beams burn hotter.', 'flip');
  }
  const unused = unusedHeatUps(run);
  if (unused.length > 0) {
    run.deck = dsShuffle(s, [...run.deck, unused[dsRandInt(s, unused.length)]]);
    run.expectedDeckCount += 1;
    log(s, `${def.name} heats up — a new behaviour joins the deck.`, 'flip');
  }
}

function heatSif(s: DsState): void {
  const run = s.boss!;
  const def = DS_BOSSES[run.id];
  const limp = def.behaviors!.find((c) => c.coolDownCard)!;
  run.deck = [String(limp.cell)];
  run.discard = [];
  run.expectedDeckCount = 1;
  run.heatedUp = true;
  log(s, 'Sif limps — only the Limping Strike remains.', 'flip');
}

function onBossUnitDeath(s: DsState, unitKey: string): void {
  const run = s.boss!;
  const def = DS_BOSSES[run.id];
  if (def.paired) {
    const survivorKey = unitKey === 'ornstein' ? 'smough' : 'ornstein';
    const survivor = run.units.find((u) => u.key === survivorKey)!;
    if (survivor.inPlay) {
      const bonus = survivorKey === 'ornstein' ? 10 : 15;
      survivor.health += bonus;
      survivor.maxHealth += bonus;
      const ups = (survivorKey === 'ornstein' ? def.ornsteinHeatUps! : def.smoughHeatUps!).map((c) => String(c.cell));
      run.deck = dsShuffle(s, ups);
      run.discard = [];
      run.expectedDeckCount = ups.length;
      log(s, `${survivorKey === 'ornstein' ? 'Ornstein absorbs Smough\'s power' : 'Smough crushes Ornstein\'s soul'} (+${bonus} health)!`, 'flip');
      return;
    }
  }
  if (run.units.some((u) => u.inPlay || u.health > 0)) return; // Four Kings partial
  bossDefeated(s);
}

// ---------- encounter / boss endings ----------

function encounterVictory(s: DsState): void {
  const enc = s.encounter!;
  const tile = enc.tileId ? s.tiles[tileIndex(s, enc.tileId)] : null;
  const card = enc.encounterId ? DS_ENCOUNTER_BY_ID[enc.encounterId] : null;
  // clear ALL black and red cubes for everyone (core p.19)
  for (const ch of s.characters) {
    ch.stamina = 0; ch.damage = 0; ch.conditions = []; ch.defBuffs = [];
    ch.act = null; ch.arc = null;
  }
  const souls = (card?.level === 4 ? DS_SOULS_PER_L4 : DS_SOULS_PER_ENCOUNTER) * s.options.partySize;
  // fog-gate tile + summons module: the party may trade the whole souls
  // reward for a summon sign (add-ons p.7) — the fork pends below
  const summonTier = summonOfferTier(s, tile);
  if (summonTier == null) {
    s.soulCache += souls;
    log(s, `Encounter defeated! +${souls} souls.`, 'win');
  } else {
    log(s, 'Encounter defeated!', 'win');
  }
  if (tile) {
    tile.cleared = true;
    if (card?.level === 4) {
      tile.completed = true; // one-shot, never resets (mega insert p.8)
      if (s.campaign && card && !s.campaign.l4Completed.includes(card.id)) s.campaign.l4Completed.push(card.id);
    }
    // unretrieved dropped souls on a cleared tile are picked up in passing
    if (s.droppedSouls && s.droppedSouls.tileId === tile.id) {
      s.soulCache += s.droppedSouls.amount;
      log(s, `The party recovers ${s.droppedSouls.amount} dropped souls.`);
      s.droppedSouls = null;
    }
  }
  s.script = [];
  // combat decisions die with the encounter; in-flight treasure draws survive
  s.pendings = s.pendings.filter((p) => p.kind === 'treasureKeep' || p.kind === 'emberAssign');
  s.encounter = null;
  s.phase = 'bonfire';
  if (summonTier != null) {
    const name = dsSummonPool(summonTier).map((d) => d.name).join(' / ');
    dsPushPending(s, 0, 'summonOffer',
      `The fog gate stands ahead: take the ${souls} souls, or take nothing and place a summon sign (${name})?`,
      [
        { key: 'souls', label: `Take ${souls} souls` },
        { key: 'summon', label: 'Take nothing — summon an ally for the boss' },
      ], { souls, tier: summonTier });
  }
  // standard mega framework: clearing the L4 flips the board (mega insert p.9);
  // the party may open chests first, then returns to the bonfire
  if (s.stage === 'megaL4' && tile?.kind === 'mega') {
    s.stage = 'megaBoss';
    log(s, 'The mega board flips — the fog gate seals the bonfire doorway. No free rest.', 'phase');
  }
}

/** The summons fork applies on the fog-gate tile when the module is on and
 * the upcoming boss tier has a summon pool in the mod (add-ons p.7). */
function summonOfferTier(s: DsState, tile: DsTile | null): 'mini' | 'main' | null {
  if (!s.options.summons || !tile || tile.id !== s.fogGateTileId) return null;
  const next = nextBoss(s);
  if (!next || (next.tier !== 'mini' && next.tier !== 'main')) return null;
  return dsSummonPool(next.tier).length > 0 ? next.tier : null;
}

function bossDefeated(s: DsState): void {
  const run = s.boss!;
  const def = DS_BOSSES[run.id];
  if (s.summon) {
    log(s, `${DS_SUMMONS[s.summon.id].name} bows and fades into the light.`, 'phase');
    s.summon = null; // the phantom departs when the fight ends (add-ons p.8)
  }
  s.script = [];
  s.pendings = s.pendings.filter((p) => p.kind === 'treasureKeep' || p.kind === 'emberAssign');
  if (run.kind === 'mimic') {
    // Loot the Body: treasure as if two chests were opened (ao p.13)
    const tile = s.tiles[tileIndex(s, s.encounter!.tileId!)];
    tile.mimicAmbush = 'dead';
    tile.mimicNode = null;
    for (const ch of s.characters) { ch.stamina = 0; ch.damage = 0; ch.conditions = []; ch.defBuffs = []; ch.act = null; ch.arc = null; }
    s.boss = null;
    s.encounter = null;
    s.phase = 'bonfire';
    log(s, `${def.name} collapses — loot the body!`, 'win');
    for (let i = 0; i < 4; i++) drawTreasure(s, 0, 'mimic');
    return;
  }
  // boss victory: cubes clear; +1 soul per character per remaining spark (core p.19)
  for (const ch of s.characters) {
    ch.stamina = 0; ch.damage = 0; ch.conditions = []; ch.defBuffs = []; ch.act = null; ch.arc = null; ch.nodeId = null;
  }
  const souls = s.sparks * s.options.partySize;
  s.soulCache += souls;
  log(s, `${def.name} is defeated! +${souls} souls.`, 'win');
  s.boss = null;
  s.encounter = null;
  s.phase = 'bonfire';
  s.partyAt = 'bonfire';
  if (s.droppedSouls?.tileId === `arena:${run.id}`) {
    s.soulCache += s.droppedSouls.amount;
    log(s, `The party recovers ${s.droppedSouls.amount} dropped souls from the arena.`);
    s.droppedSouls = null;
  }

  if (run.kind === 'mini') {
    s.miniBossDefeated = true;
    const treasure = dsTreasureDeckCards(`boss-${run.id}`).map((c) => c.id);
    // campaign double Gargoyle: treasure only after both die back-to-back (core p.35)
    const doubleGargoyle = s.campaign && dsCurrentSection(s).miniBossCount === 2 && run.id === 'gargoyle';
    if (!doubleGargoyle || run.gargoyleTwo) {
      s.inventory.push(...treasure);
      s.treasurePool.push(...treasure);
      log(s, `${def.name}'s treasure goes to the inventory.`);
    }
    if (doubleGargoyle && !run.gargoyleTwo) {
      s.campaign!.sectionBossKills += 1;
      startBossFight(s, 'gargoyle', 'mini', true);
      return;
    }
  } else {
    const treasure = dsTreasureDeckCards(`boss-${run.id}`).map((c) => c.id);
    s.inventory.push(...treasure);
    s.treasurePool.push(...treasure);
  }

  if (s.campaign) {
    campaignBossKilled(s);
    return;
  }
  if (s.stage === 'oneshot') { winGame(s); return; }
  if (run.kind === 'mini') {
    // reset for main-boss exploration: tiles, sparks, treasure injection, free rest (core p.9/15)
    s.stage = 'postMini';
    dsInjectTransposedAndLegendaries(s);
    dsSetupStandardStage(s);
    applyRest(s, false); // rest without spending a spark
    log(s, 'The party rests without spending a spark.', 'phase');
    return;
  }
  if (run.kind === 'main') {
    if (s.megaBossId) {
      s.stage = 'megaL4';
      setupMegaL4(s);
      return;
    }
    winGame(s);
    return;
  }
  winGame(s); // mega
}

function setupMegaL4(s: DsState): void {
  // box the exploration tiles; mega board encounter side up off the bonfire;
  // one random drawable L4; reset sparks (mega insert p.7)
  const megaId = s.megaBossId!;
  const deckName = megaId === 'old-iron-king' ? 'Level 4 Old Iron King Encounter'
    : megaId === 'black-dragon-kalameet' ? 'Level 4 Black Dragon Kalameet Encounter'
      : 'Level 4 Four Kings Encounter';
  const cardId = dsDrawL4(s, deckName);
  const faceId = megaId === 'old-iron-king' ? 'mega-old-iron-king-front'
    : megaId === 'black-dragon-kalameet' ? 'mega-black-dragon-kalameet-front'
      : 'mega-four-kings-front';
  s.tiles = [{
    id: 'mega1', kind: 'mega', faceId, level: 4, encounterId: cardId,
    faceUp: false, cleared: false, completed: false,
    chests: {}, mimicChests: [], mimicAmbush: null, mimicNode: null,
    invaderToken: false, traps: null,
  }];
  s.fogGateTileId = 'mega1';
  s.sparks = s.sparksMax;
  s.partyAt = 'bonfire';
  log(s, `The Mega Boss board is placed — one Level 4 encounter guards ${DS_BOSSES[megaId].name}.`, 'phase');
}

function campaignBossKilled(s: DsState): void {
  const camp = s.campaign!;
  camp.sectionBossKills += 1;
  const section = dsCurrentSection(s);
  const bosses = dsSectionBossIds(section);
  if (camp.sectionBossKills < bosses.length) {
    log(s, 'The area is not finished — more bosses guard this section.', 'phase');
    return;
  }
  // area complete: +1 spark per boss defeated in the area, capped at max
  // (core p.33 multi-boss areas; engine judgment on the deferred grant)
  s.sparks = Math.min(s.sparksMax, s.sparks + bosses.length);
  const scen = dsScenarioOf(s);
  if (camp.sectionIdx + 1 >= scen.sections.length) { winGame(s); return; }
  camp.sectionIdx += 1;
  if (!camp.legendariesInjected) {
    camp.legendariesInjected = true;
    dsInjectTransposedAndLegendaries(s);
  }
  dsSetupSection(s);
  applyRest(s, false); // free rest on section transition (core p.9/15)
  s.partyAt = 'bonfire';
  log(s, 'The party rests without spending a spark and presses on.', 'phase');
}

function winGame(s: DsState): void {
  s.winner = true;
  s.phase = 'gameOver';
  s.script = [];
  s.pendings = [];
  log(s, 'VICTORY! The party prevails.', 'win');
}

/** Any character killed = party defeat (core p.19-20). */
function partyWipe(s: DsState, deadSeat: number): void {
  const dead = s.characters[deadSeat];
  log(s, `${DS_CLASSES[dead.classId].name} dies — the party is defeated.`, 'phase', dead.nodeId ?? undefined, deadSeat);
  if (s.sparks <= 0) {
    s.winner = false;
    s.phase = 'gameOver';
    s.script = [];
    s.pendings = [];
    log(s, 'No sparks remain. The flame gutters out — the game is lost.', 'phase');
    return;
  }
  // drop the whole soul cache on the death node; a second wipe before pickup
  // discards the earlier drop (core p.19)
  if (s.droppedSouls) log(s, `${s.droppedSouls.amount} previously dropped souls are lost forever.`);
  const enc = s.encounter;
  const place = enc?.tileId ?? (s.boss ? `arena:${s.boss.id}` : null);
  s.droppedSouls = s.soulCache > 0 && place && dead.nodeId
    ? { amount: s.soulCache, tileId: place, nodeId: dead.nodeId }
    : null;
  s.soulCache = 0;

  // a revealed mimic returns to its node (ao p.13); an invader never returns (ao p.15)
  if (enc?.tileId) {
    const tile = s.tiles[tileIndex(s, enc.tileId)];
    if (s.boss?.kind === 'mimic') tile.mimicNode = s.boss.units[0].nodeId ?? tile.mimicNode;
    if (enc.invaderRun) {
      s.invadersDone.push(enc.invaderRun.typeId);
      log(s, 'The invader claims its victory and departs for good.');
    }
  }
  if (s.campaign && s.boss && dsCurrentSection(s).miniBossCount === 2) {
    s.campaign.sectionBossKills = 0; // both Gargoyles must fall back-to-back (core p.35)
  }

  for (const ch of s.characters) { ch.nodeId = null; ch.arc = null; ch.act = null; }
  s.encounter = null;
  s.boss = null;
  s.summon = null; // a consumed summon is lost with the wipe (engine judgment)
  s.pendings = s.pendings.filter((p) => p.kind === 'treasureKeep' || p.kind === 'emberAssign');
  s.script = [];
  s.sparks -= 1;
  applyRest(s, true); // forced rest: embers discarded (core p.12)
  s.phase = 'bonfire';
  s.partyAt = 'bonfire';
  log(s, `The party awakens at the bonfire. Sparks: ${s.sparks}/${s.sparksMax}.`, 'phase');
}

// ---------- the pump ----------

function pump(s: DsState): void {
  let guard = 0;
  while (s.pendings.length === 0 && s.script.length > 0 && s.phase !== 'gameOver' && guard++ < 100000) {
    const step = s.script.shift()!;
    const r = execStep(s, step);
    if (r === 'retry') {
      s.script.unshift(step);
      if (s.pendings.length === 0) throw new Error(`step ${step.t} stalled without a pending`);
    }
  }
  if (guard >= 100000) throw new Error('script pump runaway');
}

function execStep(s: DsState, step: DsStep): 'done' | 'retry' {
  if (!s.encounter && step.t !== 'noop') return 'done'; // encounter ended mid-script
  switch (step.t) {
    case 'enemyPhase': return stepEnemyPhase(s, step);
    case 'enemyAct': return stepEnemyAct(s, step);
    case 'eMove': return stepEnemyMove(s, step);
    case 'eLeap': return stepEnemyLeap(s, step);
    case 'eAttack': return stepEnemyAttack(s, step);
    case 'eEndAct': return stepEnemyEndAct(s, step);
    case 'endEnemyPhase': return stepEndEnemyPhase(s);
    case 'charTurn': return stepCharTurn(s);
    case 'charAttackRoll': return stepCharAttackRoll(s, step);
    case 'bossPhase': return stepBossPhase(s);
    case 'bossUnitCard': return stepBossUnitCard(s, step);
    case 'bOp': return stepBossOp(s, step);
    case 'afterBossCard': return stepAfterBossCard(s, step);
    case 'summonTurn': return stepSummonTurn(s);
    case 'sOp': return stepSummonOp(s, step);
    default: throw new Error(`unknown step ${step.t}`);
  }
}

// ---------- enemy phase ----------

function stepEnemyPhase(s: DsState, step: DsStep): 'done' | 'retry' {
  void step;
  const enc = s.encounter!;
  const alive = enc.enemies;
  if (alive.length === 0) { s.script.unshift({ t: 'endEnemyPhase' }); return 'done'; }
  // highest threat first; equal-threat ties are ordered by the players
  // (core p.24). Identical types are interchangeable — silently kept in
  // uid order; different-type ties pend.
  const override = enc.orderOverride ?? [];
  const sorted = [...alive].sort((a, b) => {
    const t = enemyDef(b).threat - enemyDef(a).threat;
    if (t !== 0) return t;
    const oa = override.indexOf(a.uid), ob = override.indexOf(b.uid);
    if (oa >= 0 && ob >= 0) return oa - ob;
    if (oa >= 0) return -1;
    if (ob >= 0) return 1;
    return a.uid - b.uid;
  });
  // detect unresolved different-type ties
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (enemyDef(a).threat !== enemyDef(b).threat) continue;
    if (a.typeId === b.typeId) continue;
    if (override.includes(a.uid)) continue;
    const tied = sorted.filter((e) => enemyDef(e).threat === enemyDef(a).threat && !override.includes(e.uid));
    dsPushPending(s, s.aggroSeat, 'enemyTieOrder', 'Equal threat — choose which enemy activates first.',
      tied.map((e) => ({ key: `uid:${e.uid}`, label: enemyName(e) })), {});
    return 'retry';
  }
  s.script.unshift(...sorted.map((e) => ({ t: 'enemyAct', uid: e.uid } as DsStep)), { t: 'endEnemyPhase' });
  enc.orderOverride = null;
  return 'done';
}

function invaderFlip(s: DsState): DsEnemyBehavior | null {
  const enc = s.encounter!;
  const run = enc.invaderRun;
  if (!run) return null;
  if (run.deck.length === 0) {
    run.deck = [...run.discard].reverse(); // recycle unshuffled (ao p.13)
    run.discard = [];
  }
  const idx = run.deck.shift()!;
  run.discard.unshift(idx);
  const beh = DS_INVADERS[run.typeId].behaviors[idx];
  log(s, `${DS_INVADERS[run.typeId].data.name}: ${beh.name}.`, 'flip');
  return beh;
}

function stepEnemyAct(s: DsState, step: DsStep): 'done' | 'retry' {
  const enc = s.encounter!;
  const uid = step.uid as number;
  const en = enc.enemies.find((e) => e.uid === uid);
  if (!en) return 'done';
  const behavior = en.invader ? invaderFlip(s) : DS_ENEMIES[en.typeId].behaviors[0];
  if (!behavior) return 'done';
  const reps = behavior.repeat ?? 1; // repeat = the ENTIRE behaviour (spec OQ10)
  const steps: DsStep[] = [];
  for (let r = 0; r < reps; r++) {
    const mv = behavior.movement;
    const moveStep = (): DsStep => mv!.leap
      ? { t: 'eLeap', uid, toward: mv!.toward ?? 'aggro', push: Boolean(mv!.push), pushDamage: mv!.pushDamage, dodge: behavior.dodgeDifficulty, conditions: behavior.conditions }
      : {
        t: 'eMove', uid,
        left: Math.max(0, (mv!.nodes ?? 0) - (en.conditions.includes('frostbite') ? 1 : 0)),
        toward: mv!.toward ?? 'nearest', push: Boolean(mv!.push), pushDamage: mv!.pushDamage,
        dodge: behavior.dodgeDifficulty, conditions: behavior.conditions,
      };
    const atk = (): DsStep => ({
      t: 'eAttack', uid,
      atkType: behavior.attackType, range: behavior.range, damage: behavior.damage,
      dodge: behavior.dodgeDifficulty, nodeAoE: behavior.nodeAoE, target: behavior.target,
      push: behavior.push, conditions: behavior.conditions,
    });
    if (mv && (mv.when === 'beforeAttack' || mv.when === 'only')) steps.push(moveStep());
    if (behavior.attackType) steps.push(atk());
    if (mv && mv.when === 'afterAttack') steps.push(moveStep());
  }
  steps.push({ t: 'eEndAct', uid });
  s.script.unshift(...steps);
  return 'done';
}

/** nearest character with rule tie-breaks: aggro holder if tied, else the
 * tied character with the higher taunt (core p.24). Taunt levels form a
 * 1..10 permutation across classes, so ties fully resolve. */
function nearestSeat(s: DsState, fromNode: string): number | null {
  const enc = s.encounter!;
  let best: number | null = null;
  let bestDist = Infinity;
  let tied: number[] = [];
  for (const ch of s.characters) {
    if (!ch.nodeId) continue;
    const d = dsNodeDistance(enc.faceId, fromNode, ch.nodeId);
    if (d < bestDist) { bestDist = d; tied = [ch.seat]; }
    else if (d === bestDist) tied.push(ch.seat);
  }
  if (tied.length === 0) return null;
  if (tied.includes(s.aggroSeat)) best = s.aggroSeat;
  else best = tied.sort((a, b) => DS_CLASSES[s.characters[b].classId].taunt - DS_CLASSES[s.characters[a].classId].taunt)[0];
  return best;
}

function targetSeatFor(s: DsState, fromNode: string, mode: string): number | null {
  if (mode === 'aggro' || mode === 'awayFromAggro') return s.aggroSeat;
  return nearestSeat(s, fromNode);
}

// ---------- boss targeting with a summon on the field (add-ons p.6-9) ----------

/** a boss target: a character seat, or the white phantom */
type DsAllyTok = number | 'summon';

function activeSummon(s: DsState): DsSummon | null {
  return s.summon && s.summon.health > 0 && s.summon.nodeId ? s.summon : null;
}

/** Boss-eye "nearest": characters and the summon compete by node distance;
 * ties go to the (possibly virtual, Distract) Aggro holder, then the highest
 * taunt — summon taunt levels work like characters' (add-ons p.6). */
function nearestTok(s: DsState, fromNode: string): DsAllyTok | null {
  const enc = s.encounter!;
  const su = activeSummon(s);
  const cands: { tok: DsAllyTok; d: number; taunt: number; aggro: boolean }[] = [];
  for (const ch of s.characters) {
    if (!ch.nodeId) continue;
    cands.push({
      tok: ch.seat, d: dsNodeDistance(enc.faceId, fromNode, ch.nodeId),
      taunt: DS_CLASSES[ch.classId].taunt, aggro: !s.distract && ch.seat === s.aggroSeat,
    });
  }
  if (su) {
    cands.push({
      tok: 'summon', d: dsNodeDistance(enc.faceId, fromNode, su.nodeId!),
      taunt: DS_SUMMONS[su.id].data.taunt, aggro: s.distract,
    });
  }
  if (cands.length === 0) return null;
  const best = Math.min(...cands.map((c) => c.d));
  const tied = cands.filter((c) => c.d === best);
  return (tied.find((c) => c.aggro) ?? tied.sort((a, b) => b.taunt - a.taunt)[0]).tok;
}

/** Distract: the boss treats the summon as the Aggro holder for this
 * activation (add-ons p.9). */
function bossTargetTok(s: DsState, fromNode: string, mode: string): DsAllyTok | null {
  if (mode === 'aggro' || mode === 'awayFromAggro') {
    return s.distract && activeSummon(s) ? 'summon' : s.aggroSeat;
  }
  return nearestTok(s, fromNode);
}

/** resolve a target token to its model (both carry nodeId + arc) */
function tokModel(s: DsState, tok: DsAllyTok | null): { nodeId: string | null; arc: DsArc | null } | null {
  if (tok == null) return null;
  if (tok === 'summon') return activeSummon(s);
  return s.characters[tok] ?? null;
}

// ---------- summon activation (add-ons p.8-9) ----------

function stepSummonTurn(s: DsState): 'done' | 'retry' {
  const su = activeSummon(s);
  if (!su || !s.boss) return 'done';
  // empty deck at activation start: recycle face down without shuffling (add-ons p.8)
  if (su.deck.length === 0) {
    su.deck = [...su.discard].reverse();
    su.discard = [];
  }
  const cell = su.deck.shift()!;
  su.discard.unshift(cell);
  const sdef = DS_SUMMONS[su.id];
  const card = sdef.behaviors.find((c) => c.cell === cell)!;
  log(s, `${sdef.name}: ${card.name}.`, 'flip', su.nodeId ?? undefined);
  s.script.unshift(...card.ops.map((op) => ({ t: 'sOp', op, range: card.range } as DsStep)));
  return 'done';
}

function stepSummonOp(s: DsState, step: DsStep): 'done' | 'retry' {
  const su = activeSummon(s);
  const run = s.boss;
  if (!su || !run) return 'done';
  const sdef = DS_SUMMONS[su.id];
  const op = step.op as DsSummonOp;
  const enc = s.encounter!;
  switch (op.op) {
    case 'shift': {
      // the players position the summon: up to N nodes (add-ons p.9)
      queueSummonMove(s, op.distance, `${sdef.name} may move up to ${op.distance} node${op.distance > 1 ? 's' : ''}.`);
      return 'done';
    }
    case 'attack': {
      const range = step.range === 'infinite' ? Infinity : (step.range as number | null);
      if (range == null || !su.nodeId) return 'done';
      const units = run.units
        .filter((u) => u.inPlay && u.nodeId != null
          && dsNodeDistance(enc.faceId, su.nodeId!, u.nodeId!) <= range)
        .sort((a, b) => dsNodeDistance(enc.faceId, su.nodeId!, a.nodeId!)
          - dsNodeDistance(enc.faceId, su.nodeId!, b.nodeId!));
      const unit = units[0];
      if (!unit) {
        log(s, `${sdef.name}'s attack finds no one.`, 'attack', su.nodeId);
        return 'done';
      }
      const rolled: { color: 'black' | 'blue' | 'orange'; value: number }[] = [];
      for (const [color, n] of Object.entries(op.dice)) {
        for (let i = 0; i < (n ?? 0); i++) {
          rolled.push({ color: color as 'black' | 'blue' | 'orange', value: dsRollDie(s, color as 'black' | 'blue' | 'orange') });
        }
      }
      // weak-arc bonus die, shared once per flipped boss card (core p.28);
      // Beatrice's Curse upgrades hers to a blue die (data card)
      if (!run.weakArcUsed && weakArcAt(s, su.nodeId, su.arc, unit.key)) {
        const color = sdef.data.weakArcBonusDie ?? 'black';
        rolled.push({ color, value: dsRollDie(s, color) });
        run.weakArcUsed = true;
        log(s, `Weak arc! ${sdef.name} adds a ${color} die.`, 'dice');
      }
      let total = rolled.reduce((n, d) => n + d.value, 0);
      if (su.conditions?.includes('stagger')) total = Math.max(0, total - 1); // core p.21
      const bdef = DS_BOSSES[run.id];
      const data = bdef.paired ? bdef.pairedData![unit.key as 'ornstein' | 'smough'] : bdef.data!;
      const dmg = Math.max(0, total - (op.type === 'magical' ? data.resist : data.block));
      log(s, `${sdef.name} attacks ${bdef.name}: ${total} ${op.type} — ${dmg} through.`, 'dice', unit.nodeId ?? undefined);
      applyBossDamage(s, unit.key, dmg, null);
      // printed conditions stick to the boss (decision log 13, reconciled)
      if ((op as { stagger?: boolean }).stagger && unit.inPlay) {
        for (const c of bossConditionFilter(run.id, ['stagger'])) {
          addCondition(s, (unit.conditions ??= []), c, bdef.name);
        }
      }
      return 'done';
    }
    case 'distract': {
      s.distract = true;
      log(s, `Distract: ${sdef.name} draws the boss's fury for its next activation.`, 'phase', su.nodeId ?? undefined);
      return 'done';
    }
    case 'dodgeBuff': {
      su.dodgeBuff = op.value;
      log(s, `${sdef.name} takes cover: ${op.value} dodge dice against the next activation.`, 'phase', su.nodeId ?? undefined);
      return 'done';
    }
    default:
      return 'done';
  }
}

/** Offer the party (host seat, decision log 22) the summon's move: nodes
 * reachable within `distance` unblocked steps; boss nodes list one option per
 * arc (base-to-base like characters, core p.28). */
function queueSummonMove(s: DsState, distance: number, prompt: string): void {
  const su = activeSummon(s);
  if (!su || !su.nodeId) return;
  if (su.conditions?.includes('frostbite')) distance = Math.max(0, distance - 1); // core p.21
  if (distance === 0) return;
  const g = dsTileGraph(s.encounter!.faceId);
  const seen = new Set<string>([su.nodeId]);
  const reachable: string[] = [];
  let frontier = [su.nodeId];
  for (let d = 0; d < distance; d++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const m of g.adj[n]) {
        if (seen.has(m) || dsNodeBlocked(s, m)) continue;
        seen.add(m);
        if (dsOccupancy(s, m) >= DS_NODE_MODEL_CAP) continue; // full: no entry, no pass-through
        reachable.push(m);
        // boss nodes are destinations, not corridors
        if (dsModelsAt(s, m).bossUnits.length === 0) next.push(m);
      }
    }
    frontier = next;
  }
  const options: DsPendingOption[] = [{ key: 'stay', label: 'Hold position' }];
  for (const n of reachable.sort()) {
    const boss = dsModelsAt(s, n).bossUnits[0];
    if (boss) {
      for (const arc of ['front', 'left', 'right', 'back'] as DsArc[]) {
        options.push({ key: `node:${n}:${arc}`, label: `Engage ${boss.key} on ${n} (${arc} arc)` });
      }
    } else {
      options.push({ key: `node:${n}`, label: `Move to ${n}` });
    }
  }
  if (options.length === 1) return; // cornered: nothing to decide
  dsPushPending(s, 0, 'summonMove', prompt, options, {});
}

/** Engine judgment: a pushed phantom is repositioned automatically to the
 * first free adjacent node (the players position it on its own activation);
 * cornered, it stays put. Push damage is not applied to summons in v1. */
function pushSummonFrom(s: DsState, fromNodeId: string, source: string): void {
  const su = activeSummon(s);
  if (!su || su.nodeId !== fromNodeId) return;
  const g = dsTileGraph(s.encounter!.faceId);
  const dest = [...g.adj[fromNodeId]].sort().find((n) =>
    !dsNodeBlocked(s, n) && dsOccupancy(s, n) < DS_NODE_MODEL_CAP
    && dsModelsAt(s, n).bossUnits.length === 0);
  if (!dest) return;
  su.nodeId = dest;
  su.arc = null;
  log(s, `${DS_SUMMONS[su.id].name} is shoved aside by ${source}.`, 'move', dest);
}

/** Summons roll their printed defence dice against boss damage (add-ons p.6).
 * Auto-played: dodge when dodging is the summon's defence, else block/resist. */
function summonDefend(s: DsState, ctx: { damage: number; magical: boolean; dodge: number; push: boolean; source: string; conditions?: DsCondition[] }): void {
  const su = activeSummon(s);
  if (!su) return;
  const sdef = DS_SUMMONS[su.id];
  const defDice = ctx.magical ? sdef.data.resist : sdef.data.block;
  const defCount = Object.values(defDice).reduce((n, x) => n + (x ?? 0), 0);
  const dodgeDice = sdef.data.dodge + su.dodgeBuff;
  let taken = ctx.damage;
  if (dodgeDice > 0 && defCount === 0) {
    let icons = 0;
    for (let i = 0; i < dodgeDice; i++) icons += dsRollDodgeDie(s);
    if (ctx.dodge <= 0 || icons >= ctx.dodge) {
      log(s, `${sdef.name} dodges (${icons} vs ${ctx.dodge}).`, 'dice', su.nodeId ?? undefined);
      return;
    }
    log(s, `${sdef.name}'s dodge fails (${icons} vs ${ctx.dodge}).`, 'dice', su.nodeId ?? undefined);
  } else if (defCount > 0) {
    let blocked = 0;
    for (const [color, n] of Object.entries(defDice)) {
      for (let i = 0; i < (n ?? 0); i++) blocked += dsRollDie(s, color as 'black' | 'blue' | 'orange');
    }
    taken = Math.max(0, taken - blocked);
    log(s, `${sdef.name} ${ctx.magical ? 'resists' : 'blocks'} ${Math.min(blocked, ctx.damage)}.`, 'dice', su.nodeId ?? undefined);
  }
  if (taken > 0 && su.conditions?.includes('bleed')) {
    taken += 2; // bleed bursts on the next wound, then clears (core p.21)
    su.conditions = su.conditions.filter((c) => c !== 'bleed');
    log(s, `${sdef.name} bleeds for +2.`);
  }
  if (taken > 0) {
    su.health -= taken;
    log(s, `${sdef.name} suffers ${taken}.`, 'attack', su.nodeId ?? undefined);
  }
  if (su.health <= 0) {
    log(s, `${sdef.name} falls — the phantom fades, the party fights on (add-ons p.9).`, 'phase', su.nodeId ?? undefined);
    s.summon = null;
    return;
  }
  // hit effects apply even at 0 damage (core p.20); decision log 17 reconciled
  for (const c of ctx.conditions ?? []) addCondition(s, (su.conditions ??= []), c, sdef.name);
  if (ctx.push && su.nodeId) pushSummonFrom(s, su.nodeId, ctx.source);
}

function stepEnemyMove(s: DsState, step: DsStep): 'done' | 'retry' {
  const enc = s.encounter!;
  const en = enc.enemies.find((e) => e.uid === step.uid);
  if (!en) return 'done';
  let left = step.left as number;
  if (left <= 0) return 'done';
  // nearest is locked at movement start (core p.24)
  if (step.lockSeat == null) step.lockSeat = targetSeatFor(s, en.nodeId, step.toward as string);
  const targetSeat = step.lockSeat as number | null;
  if (targetSeat == null) return 'done';
  const target = s.characters[targetSeat];
  if (!target.nodeId) return 'done';
  if (en.nodeId === target.nodeId) return 'done'; // stops on the target's node

  const g = dsTileGraph(enc.faceId);
  const tNode = target.nodeId;
  const d0 = dsCombatDistance(s, en.nodeId, tNode);
  if (!Number.isFinite(d0)) return 'done'; // fully walled off
  const push = Boolean(step.push);
  const cands = g.adj[en.nodeId].filter((n) => {
    if (dsNodeBlocked(s, n)) return false;
    const m = dsModelsAt(s, n);
    if (m.bossUnits.length > 0) return false;
    const staying = m.enemies.length + (push ? 0 : m.chars.length);
    if (staying + 1 > DS_NODE_MODEL_CAP) return false;
    const d = dsCombatDistance(s, n, tNode);
    return d < d0;
  });
  if (cands.length === 0) return 'done'; // cornered

  let dest: string;
  if (step.chosenNode && cands.includes(step.chosenNode as string)) {
    dest = step.chosenNode as string;
    delete step.chosenNode;
  } else if (cands.length === 1) {
    dest = cands[0];
  } else {
    // equally good nodes are the players' choice (core p.24). Engine
    // judgment: only pend when the choice can matter — the final node, or a
    // node with characters to shove; silent lowest-id otherwise.
    const meaningful = left === 1 || cands.some((n) => dsModelsAt(s, n).chars.length > 0);
    if (meaningful) {
      dsPushPending(s, s.aggroSeat, 'enemyMoveTie', `${enemyName(en)} can advance two ways — choose.`,
        cands.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })), {});
      return 'retry';
    }
    dest = cands.sort()[0];
  }
  en.nodeId = dest;
  log(s, `${enemyName(en)} advances.`, 'move', dest);
  step.left = left - 1;
  if (push) {
    const chars = dsModelsAt(s, dest).chars;
    for (const ch of chars) {
      queuePushChar(s, ch.seat, {
        mode: 'any', fromNodeId: dest,
        pushDamage: step.pushDamage as number | undefined,
        dodge: step.dodge as number | undefined,
        bleedOnPush: en.typeId === DS_INVADER_STANDARD || (step.conditions as string[] | undefined)?.includes('bleed'),
        source: enemyName(en),
      });
    }
  }
  s.script.unshift({ ...step });
  return 'done';
}

function stepEnemyLeap(s: DsState, step: DsStep): 'done' | 'retry' {
  const enc = s.encounter!;
  const en = enc.enemies.find((e) => e.uid === step.uid);
  if (!en) return 'done';
  const seatNo = targetSeatFor(s, en.nodeId, step.toward as string);
  if (seatNo == null) return 'done';
  const target = s.characters[seatNo];
  if (!target.nodeId) return 'done';
  en.nodeId = target.nodeId;
  log(s, `${enemyName(en)} leaps!`, 'move', en.nodeId);
  for (const ch of dsModelsAt(s, en.nodeId).chars) {
    queuePushChar(s, ch.seat, {
      mode: 'any', fromNodeId: en.nodeId,
      pushDamage: step.pushDamage as number | undefined,
      dodge: step.dodge as number | undefined,
      bleedOnPush: en.typeId === DS_INVADER_STANDARD,
      source: enemyName(en),
    });
  }
  return 'done';
}

function stepEnemyAttack(s: DsState, step: DsStep): 'done' | 'retry' {
  const enc = s.encounter!;
  const en = enc.enemies.find((e) => e.uid === step.uid);
  if (!en) return 'done';
  const mode = step.target as string;
  const seatNo = targetSeatFor(s, en.nodeId, mode);
  if (seatNo == null) return 'done';
  const target = s.characters[seatNo];
  if (!target.nodeId) return 'done';
  const range = step.range as number | 'infinite' | null;
  const dist = dsNodeDistance(enc.faceId, en.nodeId, target.nodeId);
  if (range !== 'infinite' && (range == null || dist > range)) {
    log(s, `${enemyName(en)} attacks — out of range, it misses.`, 'attack', en.nodeId);
    return 'done'; // aggro/nearest attacks with no target in range miss (core p.25)
  }
  let damage = step.damage as number;
  if (en.conditions.includes('stagger')) damage = Math.max(0, damage - 1); // core p.21
  const targets = step.nodeAoE
    ? s.characters.filter((c) => c.nodeId === target.nodeId)
    : [target];
  for (const ch of targets) {
    queueDefence(s, ch.seat, {
      damage,
      magical: step.atkType === 'magic',
      dodge: step.dodge as number,
      push: Boolean(step.push),
      conditions: (step.conditions as DsCondition[] | undefined) ?? [],
      sourceLabel: enemyName(en),
      sourceNode: en.nodeId,
    });
    s.pendings[s.pendings.length - 1].data.sourceUid = en.uid; // backstab hook
  }
  return 'done';
}

function stepEnemyEndAct(s: DsState, step: DsStep): 'done' | 'retry' {
  const enc = s.encounter!;
  const en = enc.enemies.find((e) => e.uid === step.uid);
  if (!en) return 'done';
  if (en.conditions.includes('poison')) applyEnemyDamage(s, en.uid, 1, null);
  const still = enc.enemies.find((e) => e.uid === step.uid);
  if (still) still.conditions = still.conditions.filter((c) => !DS_CONDITIONS[c].clearsAtActivationEnd);
  return 'done';
}

function stepEndEnemyPhase(s: DsState): 'done' | 'retry' {
  const enc = s.encounter!;
  enc.enemyPhases += 1;
  // "during the next enemy activation" defence buffs expire here
  for (const c of s.characters) {
    if (c.defBuffs?.length) c.defBuffs = c.defBuffs.filter((b) => b.expires !== 'enemyPhaseEnd');
  }
  if (enc.enemies.length === 0 && !s.boss) { encounterVictory(s); return 'done'; }
  s.script.unshift({ t: 'charTurn' });
  return 'done';
}

function stepCharTurn(s: DsState): 'done' | 'retry' {
  const enc = s.encounter!;
  enc.turn = 'characters';
  enc.activeSeat = s.firstActivationSeat;
  const ch = s.characters[enc.activeSeat];
  // activation start: +2 stamina, take the Aggro token (core p.22)
  dsGainStamina(ch, DS_ACTIVATION_STAMINA);
  s.aggroSeat = ch.seat;
  // "until the next character activation" defence buffs expire now
  for (const c of s.characters) {
    if (c.defBuffs?.length) c.defBuffs = c.defBuffs.filter((b) => b.expires !== 'charActivationStart');
  }
  ch.act = {
    walkUsed: false, stage: 'start', movedBefore: false, attacked: [],
    swapWindow: true, freeMoves: 0, buff: null, mercExtra: false, deprivedSwap: false,
    magicWeapon: 0,
  };
  log(s, `${DS_CLASSES[ch.classId].name}'s activation.`, 'phase', ch.nodeId ?? undefined, ch.seat);
  return 'done';
}

// ---------- defence resolution ----------

const dodgeStamina = (ch: DsCharacter): number => 1 + (ch.conditions.includes('frostbite') ? 1 : 0);

/** Traps and push damage: suffer or dodge, never blockable (core p.18/p.21). */
function queueUnblockableDamage(s: DsState, seat: number, damage: number, dodge: number, source: string): void {
  const ch = s.characters[seat];
  const options: DsPendingOption[] = [{ key: 'suffer', label: `Suffer ${damage} damage` }];
  if (dsCanSpendStamina(ch, dodgeStamina(ch))) options.push({ key: 'dodge', label: `Dodge (difficulty ${dodge}, 1 stamina)` });
  pushPendingFront(s, seat, 'trap', `${source === 'trap' ? 'A trap' : source} deals ${damage} damage — dodge or suffer.`,
    options, { seat, damage, dodge, source });
}

interface DefenceCtx {
  damage: number;
  magical: boolean;
  dodge: number;
  push: boolean;
  conditions: DsCondition[];
  sourceLabel: string;
  sourceNode: string;
}

function queueDefence(s: DsState, seat: number, ctx: DefenceCtx): void {
  const ch = s.characters[seat];
  const kind = ctx.magical ? 'Resist' : 'Block';
  const options: DsPendingOption[] = [{ key: 'block', label: `${kind} (roll defence dice)` }];
  if (dsCanSpendStamina(ch, dodgeStamina(ch))) {
    options.push({ key: 'dodge', label: `Dodge (difficulty ${ctx.dodge}, 1 stamina)` });
  }
  dsPushPending(s, seat, 'defence',
    `${ctx.sourceLabel} attacks for ${ctx.damage} ${ctx.magical ? 'magical' : 'physical'} damage.`,
    options, { seat, ...ctx });
}

function resolveDefenceChoice(s: DsState, p: DsPending, pick: string): void {
  const data = p.data as unknown as DefenceCtx & { seat: number };
  const ch = s.characters[data.seat];
  // affordability may have changed since the offer (chained decisions)
  if (pick === 'dodge' && !dsCanSpendStamina(ch, dodgeStamina(ch))) pick = 'block';
  if (pick === 'dodge') {
    dsSpendStamina(ch, dodgeStamina(ch));
    // dodge: optional 1-node move BEFORE the roll (locked decision); target
    // lock at declaration — the move never causes a miss
    const g = dsTileGraph(s.encounter!.faceId);
    const unit = bossUnitAt(s, ch.nodeId!);
    const cands = g.adj[ch.nodeId!].filter((n) => {
      const barrel = s.encounter!.terrain.find((t) => t.nodeId === n && t.piece === 'barrel' && !t.destroyed);
      if (barrel) return false; // dodging onto a barrel costs +1; skipped for simplicity of the option list
      return !dsNodeBlocked(s, n) && dsOccupancy(s, n) < DS_NODE_MODEL_CAP;
    });
    void unit; // dodging ignores arc rules (core p.28)
    const options: DsPendingOption[] = [{ key: 'stay', label: 'Hold position' },
      ...cands.map((n) => ({ key: `node:${n}`, label: `Move to ${n}` }))];
    pushPendingFront(s, ch.seat, 'dodgeMove', 'Dodge: you may move one node before the roll.',
      options, { ...data, seat: ch.seat });
    return;
  }
  // block / resist
  const dice = dsDefenceDice(ch, data.magical ? 'resist' : 'block');
  const rolled: { color: 'black' | 'blue' | 'orange'; value: number }[] = [];
  for (const [color, n] of Object.entries(dice)) {
    for (let i = 0; i < (n ?? 0); i++) {
      rolled.push({ color: color as 'black' | 'blue' | 'orange', value: dsRollDie(s, color as 'black' | 'blue' | 'orange') });
    }
  }
  finishOrOfferPostRoll(s, ch, 'block', rolled, data as unknown as Record<string, unknown>);
}

function rollDodge(s: DsState, data: Record<string, unknown>): void {
  const ch = s.characters[data.seat as number];
  const difficulty = data.dodge as number;
  if (difficulty <= 0) {
    // dodge difficulty 0: auto-success for the stamina (dr p.7)
    log(s, `${DS_CLASSES[ch.classId].name} dodges effortlessly.`, 'dice', ch.nodeId ?? undefined, ch.seat);
    return;
  }
  const n = dsDodgeDiceCount(ch);
  const rolled: { color: 'dodge'; value: number }[] = [];
  for (let i = 0; i < n; i++) rolled.push({ color: 'dodge', value: dsRollDodgeDie(s) });
  finishOrOfferPostRoll(s, ch, 'dodge', rolled, data as never);
}

type Rolled = { color: 'black' | 'blue' | 'orange' | 'dodge'; value: number }[];

function finishOrOfferPostRoll(
  s: DsState, ch: DsCharacter, rollKind: 'block' | 'dodge' | 'attack',
  rolled: Rolled, ctx: Record<string, unknown>,
): void {
  const options: DsPendingOption[] = [];
  if (ch.luck && rolled.length > 0) options.push({ key: 'luck', label: 'Luck: reroll your lowest die' });
  if (rollKind === 'block' && ch.classId === 'knight' && ch.heroic) {
    options.push({ key: 'heroic', label: 'Stand Fast: add a blue die' });
  }
  if (options.length === 0) {
    finalizeRoll(s, ch, rollKind, rolled, ctx);
    return;
  }
  options.unshift({ key: 'accept', label: 'Keep the roll' });
  const total = rolled.reduce((n, d) => n + d.value, 0);
  pushPendingFront(s, ch.seat, 'postRoll',
    `${rollKind} roll: ${rolled.map((d) => d.value).join(' + ') || '0'} = ${total}.`,
    options, { seat: ch.seat, rollKind, rolled, ctx });
}

function resolvePostRoll(s: DsState, p: DsPending, pick: string): void {
  const data = p.data as { seat: number; rollKind: 'block' | 'dodge' | 'attack' | 'backstabOffer'; rolled: Rolled; ctx: Record<string, unknown> };
  const ch = s.characters[data.seat];
  if (data.rollKind === 'backstabOffer') {
    if (pick === 'backstab') performBackstab(s, ch, data.ctx);
    return;
  }
  if (pick === 'luck') {
    ch.luck = false;
    // engine judgment: luck rerolls the LOWEST die of the roll
    let low = 0;
    for (let i = 1; i < data.rolled.length; i++) if (data.rolled[i].value < data.rolled[low].value) low = i;
    const die = data.rolled[low];
    die.value = die.color === 'dodge' ? dsRollDodgeDie(s) : dsRollDie(s, die.color);
    log(s, `Luck! The reroll shows ${die.value}.`, 'dice', undefined, ch.seat);
    finishOrOfferPostRoll(s, ch, data.rollKind, data.rolled, data.ctx);
    return;
  }
  if (pick === 'heroic') {
    ch.heroic = false;
    const v = dsRollDie(s, 'blue');
    data.rolled.push({ color: 'blue', value: v });
    log(s, `Stand Fast! +${v} on the block.`, 'dice', undefined, ch.seat);
    // Winged Knight Heavy Blows: a 3+ block roll vs it costs 1 stamina
    finishOrOfferPostRoll(s, ch, data.rollKind, data.rolled, data.ctx);
    return;
  }
  finalizeRoll(s, ch, data.rollKind, data.rolled, data.ctx);
}

function finalizeRoll(s: DsState, ch: DsCharacter, rollKind: string, rolled: Rolled, ctx: Record<string, unknown>): void {
  const total = rolled.reduce((n, d) => n + d.value, 0);
  if (rollKind === 'block') {
    const dmgIn = ctx.damage as number;
    const dmg = Math.max(0, dmgIn - total);
    log(s, `${DS_CLASSES[ch.classId].name} ${ctx.magical ? 'resists' : 'blocks'} ${Math.min(total, dmgIn)}.`, 'dice', ch.nodeId ?? undefined, ch.seat);
    // Winged Knight Heavy Blows (bosses.json): blocking its attack with a 3+
    // roll costs the character 1 stamina
    if (s.boss?.id === 'winged-knight' && (ctx.bossAttack as boolean) && total >= 3) {
      ch.stamina += 1;
      log(s, 'Heavy Blows: the block costs 1 stamina.');
    }
    noteBossHit(s, ch.seat, ctx);
    applyCharDamage(s, ch.seat, dmg, {
      attack: true, source: ctx.sourceLabel as string,
      conditions: (ctx.conditions as DsCondition[] | undefined) ?? [],
      pushAfter: ctx.push ? { fromNodeId: ctx.sourceNode as string } : undefined,
    });
    return;
  }
  if (rollKind === 'dodge') {
    let icons = total;
    if (ch.conditions.includes('calamity')) icons -= 1; // kal p.13
    const difficulty = ctx.dodge as number;
    if (icons >= difficulty) {
      log(s, `${DS_CLASSES[ch.classId].name} dodges! (${total} vs ${difficulty})`, 'dice', ch.nodeId ?? undefined, ch.seat);
      offerBackstab(s, ch, ctx);
      return; // not hit at all: no damage, push, or conditions (core p.25)
    }
    log(s, `The dodge fails (${total} vs ${difficulty}) — full damage.`, 'dice', ch.nodeId ?? undefined, ch.seat);
    noteBossHit(s, ch.seat, ctx);
    applyCharDamage(s, ch.seat, ctx.damage as number, {
      attack: (ctx.source as string) !== 'trap',
      source: (ctx.sourceLabel as string) ?? (ctx.source as string) ?? 'attack',
      conditions: ctx.unreduced ? [] : ((ctx.conditions as DsCondition[] | undefined) ?? []),
      pushAfter: ctx.push ? { fromNodeId: ctx.sourceNode as string } : undefined,
    });
    return;
  }
  // attack (character): resolve vs each target
  finishCharAttack(s, ch, rolled, ctx);
}

function noteBossHit(s: DsState, seat: number, ctx: Record<string, unknown>): void {
  if (s.boss && ctx.bossAttack) s.boss.lastHitSeats.push(seat);
}

function offerBackstab(s: DsState, ch: DsCharacter, ctx: Record<string, unknown>): void {
  if (ch.classId !== 'assassin' || !ch.heroic) return;
  // Backstab: a free attack on the enemy just dodged, if in range (classes.json)
  const enemyUid = ctx.sourceUid as number | undefined;
  const unitKey = ctx.sourceUnit as string | undefined;
  const targetNode = enemyUid != null
    ? s.encounter?.enemies.find((e) => e.uid === enemyUid)?.nodeId
    : unitKey != null ? s.boss?.units.find((u) => u.key === unitKey)?.nodeId : undefined;
  if (!targetNode || !ch.nodeId) return;
  const attack = pickBackstabOption(s, ch, targetNode);
  if (!attack) return;
  pushPendingFront(s, ch.seat, 'postRoll', 'Backstab? A free attack on the enemy you dodged.',
    [{ key: 'accept', label: 'Let it go' }, { key: 'backstab', label: `Backstab with ${attack.name}` }],
    { seat: ch.seat, rollKind: 'backstabOffer', rolled: [], ctx: { enemyUid, unitKey, hand: attack.hand, option: attack.option } });
}

function pickBackstabOption(s: DsState, ch: DsCharacter, targetNode: string): { hand: 'L' | 'R'; option: number; name: string } | null {
  for (const { hand, eq } of dsHandCards(ch)) {
    const card = DS_TREASURE_BY_ID[eq.cardId];
    for (let i = 0; i < (card.actions?.length ?? 0); i++) {
      const act = card.actions![i];
      if (!act.dice || Object.keys(act.dice).length === 0) continue;
      const icons = parseIcons(act);
      const range = icons.range ?? card.range ?? 0;
      const dist = dsNodeDistance(s.encounter!.faceId, ch.nodeId!, targetNode);
      if (dist > range || (icons.shaft && dist === 0)) continue;
      return { hand, option: i, name: card.name };
    }
  }
  return null;
}

// ---------- character attack rolls (scripted for luck interleaving) ----------

function stepCharAttackRoll(s: DsState, step: DsStep): 'done' | 'retry' {
  const seat = step.seat as number;
  const ch = s.characters[seat];
  const dice = step.dice as { color: 'black' | 'blue' | 'orange' }[];
  const rolled: Rolled = dice.map((d) => ({ color: d.color, value: dsRollDie(s, d.color) }));
  finishOrOfferPostRoll(s, ch, 'attack', rolled, {
    seat,
    flat: step.flat,
    magical: step.magical,
    push: step.push,
    conditions: step.conditions,
    targets: step.targets,
  });
  return 'done';
}

function finishCharAttack(s: DsState, ch: DsCharacter, rolled: Rolled, ctx: Record<string, unknown>): void {
  if ((ctx as { rollKind?: string }).rollKind === 'backstabOffer') return; // declined
  const total = rolled.reduce((n, d) => n + d.value, 0) + ((ctx.flat as number) ?? 0);
  const magical = Boolean(ctx.magical);
  const push = Boolean(ctx.push);
  const conditions = (ctx.conditions as DsCondition[] | undefined) ?? [];
  const targets = ctx.targets as { kind: string; uid?: number; unitKey?: string; nodeId: string }[];
  log(s, `${DS_CLASSES[ch.classId].name} attacks: ${total} ${magical ? 'magical' : 'physical'}.`, 'dice', undefined, ch.seat);
  for (const tg of targets) {
    if (tg.kind === 'enemy') {
      const en = s.encounter?.enemies.find((e) => e.uid === tg.uid);
      if (!en) continue;
      const def = enemyDef(en);
      const dmg = Math.max(0, total - (magical ? def.resist : def.block));
      applyEnemyDamage(s, en.uid, dmg, ch.seat);
      const still = s.encounter?.enemies.find((e) => e.uid === tg.uid);
      if (still) {
        for (const c of conditions) addCondition(s, still.conditions, c, enemyName(still));
        if (push) queuePushEnemy(s, still.uid, { mode: 'awayFrom', fromNodeId: ch.nodeId!, chooserSeat: ch.seat });
      }
    } else if (s.boss) {
      const def = DS_BOSSES[s.boss.id];
      const unit = s.boss.units.find((u) => u.key === tg.unitKey);
      if (!unit || !unit.inPlay) continue;
      const data = def.paired ? def.pairedData![tg.unitKey as 'ornstein' | 'smough'] : def.data!;
      const dmg = Math.max(0, total - (magical ? data.resist : data.block));
      // bosses never pushed by characters; condition tokens DO stick
      // (decision log 13, reconciled) except Boreal's frostbite/stagger immunity
      applyBossDamage(s, tg.unitKey!, dmg, ch.seat);
      if (conditions.length > 0 && s.boss) {
        const still = s.boss.units.find((u) => u.key === tg.unitKey);
        if (still?.inPlay) {
          for (const c of bossConditionFilter(s.boss.id, conditions)) {
            addCondition(s, (still.conditions ??= []), c, bossUnitName(s, still.key));
          }
        }
      }
    }
  }
}

// ---------- backstab execution ----------

function performBackstab(s: DsState, ch: DsCharacter, ctx: Record<string, unknown>): void {
  ch.heroic = false;
  const hand = ctx.hand as 'L' | 'R';
  const optIdx = ctx.option as number;
  const eq = hand === 'L' ? ch.handL : ch.handR;
  if (!eq) return;
  const card = DS_TREASURE_BY_ID[eq.cardId];
  const option = card.actions![optIdx];
  const icons = parseIcons(option);
  const rolled: Rolled = [];
  for (const [color, n] of Object.entries(option.dice ?? {})) {
    for (let i = 0; i < (n ?? 0); i++) rolled.push({ color: color as 'black', value: dsRollDie(s, color as 'black') });
  }
  const targets = ctx.enemyUid != null
    ? [{ kind: 'enemy', uid: ctx.enemyUid as number, nodeId: '' }]
    : [{ kind: 'boss', unitKey: ctx.unitKey as string, nodeId: '' }];
  log(s, `${DS_CLASSES[ch.classId].name} backstabs!`, 'attack', ch.nodeId ?? undefined, ch.seat);
  finishCharAttack(s, ch, rolled, {
    flat: option.flatModifier ?? 0, magical: icons.magic, push: icons.push,
    conditions: icons.conditions, targets,
  });
}

// ---------- boss phase ----------

function stepBossPhase(s: DsState): 'done' | 'retry' {
  const run = s.boss;
  if (!run) return 'done';
  const def = DS_BOSSES[run.id];

  // deck empty at activation start: Royal Summons or unshuffled recycle (core p.29, fk p.13)
  if (run.deck.length === 0) {
    if (run.id === 'four-kings' && (run.summonsRemaining ?? 0) > 0) {
      royalSummons(s);
    } else {
      run.deck = [...run.discard].reverse(); // pattern loops, order preserved
      run.discard = [];
      log(s, 'The behaviour deck loops — the pattern repeats.', 'flip');
    }
  }
  const cell = run.deck.shift()!;
  run.discard.unshift(cell);
  run.weakArcUsed = false;
  const cardName = bossCardName(run, cell);
  log(s, `${def.name}: ${cardName}.`, 'flip');

  // Take a Breather (fk p.13): no kings in play — heal 1 each, done
  const alive = run.units.filter((u) => u.inPlay && u.health > 0);
  if (run.id === 'four-kings' && alive.length === 0) {
    for (const ch of s.characters) dsHealDamage(ch, 1);
    log(s, 'Take a Breather: each character heals 1.', 'phase');
    s.script.unshift({ t: 'afterBossCard', cell });
    return 'done';
  }
  const steps: DsStep[] = alive.map((u) => ({ t: 'bossUnitCard', unitKey: u.key, cell }));
  steps.push({ t: 'afterBossCard', cell });
  s.script.unshift(...steps);
  return 'done';
}

function royalSummons(s: DsState): void {
  const run = s.boss!;
  const def = DS_BOSSES[run.id];
  const nextKing = run.units.find((u) => !u.inPlay && u.health > 0);
  if (!nextKing) { run.summonsRemaining = 0; return; }
  const enc = s.encounter!;
  const spawn = dsNodesOfTerrain(enc.faceId, 'megaBossSpawn')[0];
  nextKing.inPlay = true;
  nextKing.nodeId = spawn;
  const g = dsTileGraph(enc.faceId);
  nextKing.facing = [g.face.sizePx[0] / 2 - g.nodeById[spawn].x, g.face.sizePx[1] / 2 - g.nodeById[spawn].y];
  log(s, `Royal Summons! ${nextKing.key} descends.`, 'flip', spawn);
  for (const ch of dsModelsAt(s, spawn).chars) {
    queuePushChar(s, ch.seat, { mode: 'any', fromNodeId: spawn, source: 'Royal Summons' });
  }
  // discard becomes the working pile: remove 1 unseen, add 2 of the king's pool, shuffle
  let pool = [...run.discard];
  run.discard = [];
  if (pool.length > 0) pool.splice(dsRandInt(s, pool.length), 1);
  const kingPools: Record<string, DsBossCard[] | undefined> = {
    king2: def.kingTwo, king3: def.kingThree, king4: def.kingFour,
  };
  const kingCards = kingPools[nextKing.key] ?? [];
  const adds = dsShuffle(s, kingCards.map((c) => String(c.cell))).slice(0, 2);
  run.deck = dsShuffle(s, [...pool, ...adds]);
  run.expectedDeckCount = run.deck.length + run.discard.length;
  run.summonsRemaining = (run.summonsRemaining ?? 1) - 1;
}

function bossCardName(run: DsBossRun, cell: string): string {
  const card = lookupBossCard(run, cell, run.units[0].key);
  return card?.name ?? cell;
}

function lookupBossCard(run: DsBossRun, cell: string, unitKey: string): DsBossCard | null {
  const def = DS_BOSSES[run.id];
  if (cell.startsWith('beam:')) {
    return def.fireBeam!.find((c) => String(c.cell) === cell.slice(5)) ?? null;
  }
  if (def.paired) {
    const paired = def.pairedBehaviors!.find((c) => String(c.cell) === cell);
    if (paired) {
      const half = paired[unitKey as 'ornstein' | 'smough'];
      return { cell, ...half } as DsBossCard;
    }
    const heat = [...(def.ornsteinHeatUps ?? []), ...(def.smoughHeatUps ?? [])].find((c) => String(c.cell) === cell);
    return heat ?? null;
  }
  if (run.id === 'four-kings') {
    for (const pool of [def.kingOne, def.kingTwo, def.kingThree, def.kingFour]) {
      const hit = pool?.find((c) => String(c.cell) === cell);
      if (hit) return hit;
    }
    return null;
  }
  return def.behaviors?.find((c) => String(c.cell) === cell) ?? null;
}

function stepBossUnitCard(s: DsState, step: DsStep): 'done' | 'retry' {
  const run = s.boss;
  if (!run) return 'done';
  const unit = run.units.find((u) => u.key === step.unitKey);
  if (!unit || !unit.inPlay) return 'done';
  const card = lookupBossCard(run, step.cell as string, unit.key);
  if (!card) return 'done';
  const reps = card.repeat ?? 1;
  const steps: DsStep[] = [];
  for (let r = 0; r < reps; r++) {
    for (const op of card.ops) {
      steps.push({ t: 'bOp', unitKey: unit.key, cell: step.cell, op, dodge: card.dodge, range: card.range, cardArcs: card.arcs });
    }
  }
  s.script.unshift(...steps);
  return 'done';
}

function rotate(f: [number, number], deg: 90 | 180, dir?: 'left' | 'right'): [number, number] {
  if (deg === 180) return [-f[0], -f[1]];
  // px space, y grows downward: right (clockwise) = (-y, x)
  return dir === 'left' ? [f[1], -f[0]] : [-f[1], f[0]];
}

function stepBossOp(s: DsState, step: DsStep): 'done' | 'retry' {
  const run = s.boss;
  if (!run) return 'done';
  const unit = run.units.find((u) => u.key === step.unitKey);
  if (!unit || !unit.inPlay) return 'done';
  const op = step.op as DsBossOp;
  const enc = s.encounter!;
  const g = dsTileGraph(enc.faceId);
  const def = DS_BOSSES[run.id];

  switch (op.op) {
    case 'turn': {
      if (unit.facing) unit.facing = rotate(unit.facing, op.degrees, op.direction);
      log(s, `${def.name} turns.`, 'move', unit.nodeId ?? undefined);
      return 'done';
    }
    case 'move': return bossMove(s, step, unit, op);
    case 'shift': return bossShift(s, step, unit, op);
    case 'leap': {
      const target = tokModel(s, bossTargetTok(s, unit.nodeId ?? g.face.nodes[0].id, op.to));
      if (!target?.nodeId) return 'done';
      const dest = target.nodeId;
      const otherBoss = bossUnitAt(s, dest);
      if (otherBoss && otherBoss.key !== unit.key) return 'done'; // 1 boss per node
      unit.nodeId = dest; // facing unchanged (core p.29)
      log(s, `${def.name} leaps!`, 'move', dest);
      for (const ch of dsModelsAt(s, dest).chars) {
        ch.arc = null; // leap pushes: any adjacent node, no arc (core p.29)
        queuePushChar(s, ch.seat, {
          mode: 'any', fromNodeId: dest,
          pushDamage: op.pushDamage, dodge: step.dodge as number, source: def.name,
        });
      }
      pushSummonFrom(s, dest, def.name);
      return 'done';
    }
    case 'attack': return bossAttack(s, step, unit, op);
    case 'stagger': {
      for (const seat of run.lastHitSeats) addCondition(s, s.characters[seat].conditions, 'stagger', DS_CLASSES[s.characters[seat].classId].name);
      return 'done';
    }
    case 'special': {
      if (op.icon === 'calamityMark') {
        for (const seat of run.lastHitSeats) addCondition(s, s.characters[seat].conditions, 'calamity', DS_CLASSES[s.characters[seat].classId].name);
      }
      return 'done';
    }
    case 'flight': {
      // Kalameet strafe (kal): despawn, template attack, land with the move op
      if (!run.strafeDeck || run.strafeDeck.length === 0) {
        run.strafeDeck = [...(run.strafeDiscard ?? [])].reverse();
        run.strafeDiscard = [];
      }
      const cardIdx = run.strafeDeck.shift()!;
      (run.strafeDiscard ??= []).unshift(cardIdx);
      const card = strafePattern(s, cardIdx);
      run.templateNodes = card.nodes;
      run.pendingLanding = card.landing;
      unit.nodeId = null;
      log(s, `${def.name} takes wing — fiery ruin rakes the field!`, 'move');
      return 'done';
    }
    case 'fireBeamTemplate': {
      // OIK beam (oik): teleport to the beam card's node with leap-push,
      // template attack on its blasted nodes
      if (!run.beamDeck || run.beamDeck.length === 0) {
        run.beamDeck = [...(run.beamDiscard ?? [])].reverse(); // recycle unshuffled
        run.beamDiscard = [];
      }
      const cardIdx = run.beamDeck.shift()!;
      (run.beamDiscard ??= []).unshift(cardIdx);
      const beam = beamPattern(s, cardIdx);
      if (beam.node !== unit.nodeId) {
        unit.nodeId = beam.node;
        log(s, `${def.name} looms over a new furnace mouth.`, 'move', beam.node);
        for (const ch of dsModelsAt(s, beam.node).chars) {
          ch.arc = null;
          queuePushChar(s, ch.seat, { mode: 'any', fromNodeId: beam.node, source: def.name });
        }
        pushSummonFrom(s, beam.node, def.name);
      }
      run.templateNodes = beam.nodes;
      return 'done';
    }
    default:
      return 'done';
  }
}

/** Blasted Nodes card (bosses.json decoded per-card node lists): the d-pad
 * node is the eye OIK surfaces at (oik p.13, always itself blasted); `nodes`
 * are the flame-burst targets of the magical template attack. */
function beamPattern(s: DsState, cardIdx: number): { node: string; nodes: string[] } {
  const card = DS_BOSSES['old-iron-king'].blastedNodes!.find((c) => c.cell === cardIdx);
  if (!card) throw new Error(`unknown Blasted Nodes cell ${cardIdx}`);
  void s;
  return { node: card.dpadNode, nodes: [...card.nodes] };
}

/** Fiery Ruin card (bosses.json decoded per-card node lists): `nodes` are the
 * strafe targets, the d-pad node is where Kalameet lands (kal p.13; the
 * landing node is never itself aflame — golden `_meta.resolved`). */
function strafePattern(s: DsState, cardIdx: number): { nodes: string[]; landing: string } {
  const card = DS_BOSSES['black-dragon-kalameet'].fieryRuin!.find((c) => c.cell === cardIdx);
  if (!card) throw new Error(`unknown Fiery Ruin cell ${cardIdx}`);
  void s;
  return { nodes: [...card.nodes], landing: card.dpadNode };
}

function bossMove(s: DsState, step: DsStep, unit: DsBossUnit, op: Extract<DsBossOp, { op: 'move' }>): 'done' | 'retry' {
  const run = s.boss!;
  const def = DS_BOSSES[run.id];
  const enc = s.encounter!;
  const g = dsTileGraph(enc.faceId);

  // landing after flight: the move op places the despawned dragon
  if (unit.nodeId == null && run.pendingLanding) {
    unit.nodeId = run.pendingLanding;
    run.pendingLanding = null;
    log(s, `${def.name} crashes down!`, 'move', unit.nodeId);
    for (const ch of dsModelsAt(s, unit.nodeId).chars) {
      ch.arc = null;
      queuePushChar(s, ch.seat, { mode: 'any', fromNodeId: unit.nodeId, source: def.name });
    }
    pushSummonFrom(s, unit.nodeId, def.name);
    const faceTarget = tokModel(s, bossTargetTok(s, unit.nodeId, op.toward ?? 'nearest'));
    if (faceTarget?.nodeId) {
      const t = g.nodeById[faceTarget.nodeId];
      const b = g.nodeById[unit.nodeId];
      unit.facing = [t.x - b.x, t.y - b.y];
    }
    return 'done';
  }
  if (unit.nodeId == null) return 'done';

  // some decoded cards (OIK Fire Beam move-0) print no target ring: nearest
  const mode = op.toward ?? 'nearest';
  if (step.leftMove == null) {
    // frostbite: one fewer node of movement (core p.21)
    step.leftMove = Math.max(0, op.distance - (unit.conditions?.includes('frostbite') ? 1 : 0));
    step.lockTok = bossTargetTok(s, unit.nodeId, mode);
  }
  const target = tokModel(s, (step.lockTok ?? null) as DsAllyTok | null);
  if (!target || !target.nodeId) return 'done';
  const away = mode.startsWith('awayFrom');

  // distance 0 or target on own node: turn in place to face the target (core p.29)
  if ((op.distance === 0 || target.nodeId === unit.nodeId) && !away) {
    const t = g.nodeById[target.nodeId];
    const b = g.nodeById[unit.nodeId];
    if (target.nodeId !== unit.nodeId) unit.facing = [t.x - b.x, t.y - b.y];
    else if (target.arc) unit.facing = facingForArc(unit.facing ?? [0, -1], target.arc);
    if (op.distance === 0) return 'done';
  }
  let left = step.leftMove as number;
  if (left <= 0) return 'done';
  if (!away && unit.nodeId === target.nodeId) return 'done';

  const tNode = target.nodeId;
  const d0 = dsCombatDistance(s, unit.nodeId, tNode);
  if (!away && !Number.isFinite(d0)) return 'done';
  const cands = g.adj[unit.nodeId].filter((n) => {
    if (dsNodeBlocked(s, n)) return false;
    if (run.id === 'old-iron-king') return false; // OIK never walks (lava wall; beams move him)
    const m = dsModelsAt(s, n);
    if (m.bossUnits.length > 0) return false; // only a boss displaces a boss; engine keeps them apart
    const d = dsCombatDistance(s, n, tNode);
    return away ? d > d0 : d < d0;
  });
  if (cands.length === 0) return 'done';
  let dest: string;
  if (step.chosenNode && cands.includes(step.chosenNode as string)) {
    dest = step.chosenNode as string;
    delete step.chosenNode;
  } else if (cands.length === 1) dest = cands[0];
  else {
    const meaningful = left === 1 || cands.some((n) => dsModelsAt(s, n).chars.length > 0);
    if (meaningful) {
      dsPushPending(s, s.aggroSeat, 'enemyMoveTie', `${def.name} can advance two ways — choose.`,
        cands.map((n) => ({ key: `node:${n}`, label: `Node ${n}` })), {});
      return 'retry';
    }
    dest = cands.sort()[0];
  }

  const from = g.nodeById[unit.nodeId];
  const to = g.nodeById[dest];
  // rotate front (toward) / back (away, facing net unchanged relative to travel) — core p.29
  unit.facing = away ? [from.x - to.x, from.y - to.y] : [to.x - from.x, to.y - from.y];

  // occupants: with push, shove them; otherwise they go base-to-base (arc set below)
  const occupants = dsModelsAt(s, dest);
  if (occupants.chars.length + occupants.enemies.length >= DS_NODE_MODEL_CAP) {
    // overflow: players push one model off (core p.10)
    queueNodeOverflow(s, s.aggroSeat, dest, null);
  }
  const arcFor = (chNode: string): DsArc => {
    const arcs = dsArcsOf(unit.facing!, g.nodeById[chNode].x - to.x, g.nodeById[chNode].y - to.y);
    return arcs[0] ?? 'front';
  };
  unit.nodeId = dest;
  log(s, `${def.name} ${away ? 'backs away' : 'advances'}.`, 'move', dest);
  for (const ch of occupants.chars) {
    if (op.push) {
      queuePushChar(s, ch.seat, {
        mode: 'any', fromNodeId: dest,
        pushDamage: op.pushDamage, dodge: step.dodge as number, source: def.name,
      });
    } else {
      ch.arc = arcFor(ch.nodeId!); // base-to-base in the arc that faced them (core p.29)
    }
  }
  for (const su of occupants.summons) {
    if (op.push) pushSummonFrom(s, dest, def.name);
    else su.arc = arcFor(su.nodeId!);
  }
  step.leftMove = left - 1;
  s.script.unshift({ ...step });
  return 'done';
}

function facingForArc(facing: [number, number], arc: DsArc): [number, number] {
  switch (arc) {
    case 'front': return facing;
    case 'back': return [-facing[0], -facing[1]];
    case 'right': return [-facing[1], facing[0]];
    case 'left': return [facing[1], -facing[0]];
  }
}

function bossShift(s: DsState, step: DsStep, unit: DsBossUnit, op: Extract<DsBossOp, { op: 'shift' }>): 'done' | 'retry' {
  const run = s.boss!;
  const def = DS_BOSSES[run.id];
  const enc = s.encounter!;
  const g = dsTileGraph(enc.faceId);
  if (!unit.nodeId || !unit.facing) return 'done';
  let left = (step.leftShift as number | undefined) ?? op.distance;
  const dirVec = op.direction === 'forward' ? unit.facing
    : op.direction === 'backward' ? rotate(unit.facing, 180)
      : op.direction === 'right' ? rotate(unit.facing, 90, 'right')
        : rotate(unit.facing, 90, 'left');
  while (left > 0) {
    const from = g.nodeById[unit.nodeId];
    const mag = Math.hypot(dirVec[0], dirVec[1]) || 1;
    let best: string | null = null;
    let bestCos = 0.5; // within ~60 degrees of the shift direction
    for (const n of g.adj[unit.nodeId]) {
      if (dsNodeBlocked(s, n)) continue;
      if (run.id === 'old-iron-king') continue;
      const m = dsModelsAt(s, n);
      if (m.bossUnits.length > 0) continue;
      const to = g.nodeById[n];
      const v: [number, number] = [to.x - from.x, to.y - from.y];
      const cos = (v[0] * dirVec[0] + v[1] * dirVec[1]) / ((Math.hypot(v[0], v[1]) || 1) * mag);
      if (cos > bestCos) { bestCos = cos; best = n; }
    }
    if (!best) break;
    unit.nodeId = best; // shifts do not rotate (core p.29)
    log(s, `${def.name} shifts ${op.direction}.`, 'move', best);
    const entered = dsModelsAt(s, best);
    for (const ch of entered.chars) {
      if (op.push) {
        queuePushChar(s, ch.seat, {
          mode: 'any', fromNodeId: best,
          pushDamage: op.pushDamage, dodge: step.dodge as number, source: def.name,
        });
      } else {
        const arcs = dsArcsOf(unit.facing, g.nodeById[ch.nodeId!].x - g.nodeById[best].x, g.nodeById[ch.nodeId!].y - g.nodeById[best].y);
        ch.arc = arcs[0] ?? 'front';
      }
    }
    for (const su of entered.summons) {
      if (op.push) pushSummonFrom(s, best, def.name);
      else su.arc = 'front';
    }
    left -= 1;
    if (s.pendings.length > 0) { step.leftShift = left; s.script.unshift({ ...step }); return 'done'; }
  }
  return 'done';
}

function bossAttack(s: DsState, step: DsStep, unit: DsBossUnit, op: Extract<DsBossOp, { op: 'attack' }>): 'done' | 'retry' {
  const run = s.boss!;
  const def = DS_BOSSES[run.id];
  const enc = s.encounter!;
  run.lastHitSeats = [];
  let damage = op.damage;
  let dodge = step.dodge as number;
  if (run.id === 'old-iron-king' && run.fireBeamBuff && op.style === 'template') {
    damage += 1; dodge += 1; // Old Iron Rage (oik p.12)
  }
  if (unit.conditions?.includes('stagger')) damage = Math.max(0, damage - 1); // core p.21
  const range = step.range as number | 'infinite' | 'special' | null;
  const inRange = (nodeId: string): boolean => {
    if (unit.nodeId == null) return true; // template attacks from flight
    if (range === 'infinite' || range === 'special' || range == null) return true;
    return dsNodeDistance(enc.faceId, unit.nodeId, nodeId) <= range;
  };
  const conds: DsCondition[] = [];
  if (op.stagger) conds.push('stagger');
  if (op.frostbite) conds.push('frostbite');

  const su = activeSummon(s);
  let targets: DsCharacter[] = [];
  let hitSummon = false;
  if (op.style === 'template') {
    const nodes = run.templateNodes ?? [];
    targets = s.characters.filter((c) => c.nodeId && nodes.includes(c.nodeId));
    hitSummon = su != null && nodes.includes(su.nodeId!);
    run.templateNodes = null;
  } else if (op.style === 'target') {
    const tok = bossTargetTok(s, unit.nodeId!, op.target ?? 'nearest');
    if (tok === 'summon') {
      hitSummon = su != null && inRange(su.nodeId!);
    } else if (tok != null) {
      const ch = s.characters[tok];
      if (ch.nodeId && inRange(ch.nodeId)) targets = [ch];
    }
  } else if (op.style === 'node') {
    const node = tokModel(s, bossTargetTok(s, unit.nodeId!, op.target ?? 'nearest'))?.nodeId ?? null;
    if (node && inRange(node)) {
      targets = s.characters.filter((c) => c.nodeId === node);
      hitSummon = su != null && su.nodeId === node;
    }
  } else { // area: all models on nodes in the attack arcs within range (core p.29)
    const arcs = op.arcs ?? (step.cardArcs as { attack: string[] } | null) ?? null;
    const attackArcs = arcs?.attack ?? [];
    const inAttackArcs = (nodeId: string, arc: DsArc | null): boolean => {
      if (!inRange(nodeId)) return false;
      if (run.kind === 'mimic' || attackArcs.length === 0 || !unit.facing || unit.nodeId == null) {
        // mimics ignore facing (ao p.11); arc-less area cards hit all in range
        return true;
      }
      const inArcs = nodeId === unit.nodeId
        ? (arc ? [arc] : [])
        : dsNodeArcs(enc.faceId, unit.nodeId, unit.facing, nodeId);
      return inArcs.some((a) => attackArcs.includes(a));
    };
    targets = s.characters.filter((c) => c.nodeId != null && inAttackArcs(c.nodeId, c.arc));
    hitSummon = su != null && inAttackArcs(su.nodeId!, su.arc);
  }
  if (targets.length === 0 && !hitSummon) {
    log(s, `${def.name}'s attack finds no one.`, 'attack', unit.nodeId ?? undefined);
    return 'done';
  }
  if (hitSummon) {
    summonDefend(s, {
      damage, magical: op.type === 'magical', dodge,
      push: Boolean(op.push), source: def.name, conditions: conds,
    });
  }
  for (const ch of targets) {
    queueDefence(s, ch.seat, {
      damage,
      magical: op.type === 'magical',
      dodge,
      push: Boolean(op.push),
      conditions: conds,
      sourceLabel: def.name,
      sourceNode: unit.nodeId ?? ch.nodeId!,
    });
    const head = s.pendings[s.pendings.length - 1];
    head.data.bossAttack = true;
    head.data.sourceUnit = unit.key;
  }
  return 'done';
}

function stepAfterBossCard(s: DsState, step: DsStep): 'done' | 'retry' {
  const run = s.boss;
  if (!run) return 'done';
  const def = DS_BOSSES[run.id];
  const cell = step.cell as string;
  // Dancer: after a heat-up card resolves, shuffle the behaviour deck (core p.26)
  if (run.id === 'dancer-of-the-boreal-valley') {
    const card = lookupBossCard(run, cell, 'boss');
    if (card?.heatUp && run.heatedUp) {
      run.deck = dsShuffle(s, run.deck);
      log(s, 'Unpredictable Onslaught: the Dancer\'s deck is shuffled.', 'flip');
    }
  }
  void def;
  run.lastHitSeats = [];
  // summon one-activation effects expire with the boss activation (add-ons p.9)
  s.distract = false;
  if (s.summon) s.summon.dodgeBuff = 0;
  // condition tokens on the boss tick like an enemy's: poison deals 1 at the
  // end of its activation, then poison/frostbite/stagger clear (core p.21)
  for (const u of run.units) {
    if (!u.inPlay || !u.conditions?.length) continue;
    if (u.conditions.includes('poison')) applyBossDamage(s, u.key, 1, null);
    u.conditions = u.conditions.filter((c) => !DS_CONDITIONS[c].clearsAtActivationEnd);
  }
  if (s.summon?.conditions?.length) {
    const su = s.summon;
    if (su.conditions!.includes('poison')) {
      su.health -= 1;
      log(s, `${DS_SUMMONS[su.id].name} suffers 1 (poison).`, 'attack', su.nodeId ?? undefined);
      if (su.health <= 0) {
        log(s, `${DS_SUMMONS[su.id].name} falls — the phantom fades, the party fights on (add-ons p.9).`, 'phase', su.nodeId ?? undefined);
        s.summon = null;
      }
    }
    if (s.summon) s.summon.conditions = s.summon.conditions!.filter((c) => !DS_CONDITIONS[c].clearsAtActivationEnd);
  }
  // "during the next enemy activation" defence buffs expire with the boss
  // activation (the boss IS the enemy activation of a boss fight)
  for (const c of s.characters) {
    if (c.defBuffs?.length) c.defBuffs = c.defBuffs.filter((b) => b.expires !== 'enemyPhaseEnd');
  }
  s.script.unshift({ t: 'charTurn' });
  return 'done';
}

/** Test-only surgical hooks (darksouls-test.ts directed rules tests). Not part
 * of the public engine surface — the server must never call these. */
export const _dsInternals = {
  applyBossDamage, applyCharDamage, applyEnemyDamage, startBossFight, pump,
  encounterVictory, partyWipe,
};

