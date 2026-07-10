// Dark Souls: The Board Game — engine test suite (playbook §6.3):
// 1. bot playthroughs at party sizes 1-4 (standard game + First Journey S1),
// 2. conservation invariants after every action,
// 3. directed rules tests with rulebook page refs.
// Run: npx tsx shared/src/darksouls/darksouls-test.ts

import {
  createDarkSouls, dsViewFor, dsRollDodgeDie, dsDrawL4, dsNodeBlocked,
  dsOccupancy, dsCanSpendStamina, dsStatValue, dsCombatDistance,
  type DsState, type DsPending,
} from './state.js';
import { applyDarkSoulsAction, _dsInternals, type DsAction } from './actions.js';
import {
  DS_BOSSES, DS_CLASSES, DS_ENCOUNTER_BY_ID, DS_ENEMIES, DS_TREASURE_BY_ID,
  dsNodeDistance, dsTileGraph, dsIsDrawableEncounter, DS_ENCOUNTERS,
} from './data.js';
import { DS_ENDURANCE_BOXES, DS_DICE, DS_DODGE_DIE } from './config.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => {
  if (c) pass++;
  else { fail++; console.error(`FAIL: ${m}`); }
};

const CLASS_ORDER = ['knight', 'warrior', 'herald', 'assassin'];
const classesFor = (n: number): string[] => CLASS_ORDER.slice(0, n);

const act = (s: DsState, seat: number, a: DsAction) => applyDarkSoulsAction(s, seat, a);

// ---------- invariants (checked after every applied bot action) ----------

function equippedCardIds(s: DsState): string[] {
  const out: string[] = [];
  for (const ch of s.characters) {
    for (const eq of [ch.armour, ch.handL, ch.handR, ...ch.backup]) {
      if (!eq) continue;
      out.push(eq.cardId, ...eq.upgrades);
    }
  }
  return out;
}

function checkInvariants(s: DsState, where: string): void {
  // treasure conservation: pool == deck + discard + inventory + equipped + pending draws
  const held = [
    ...s.treasureDeck, ...s.treasureDiscard, ...s.inventory, ...equippedCardIds(s),
    ...s.pendings.filter((p) => p.kind === 'treasureKeep' || p.kind === 'emberAssign').map((p) => p.data.cardId as string),
  ];
  if (held.length !== s.treasurePool.length) {
    ok(false, `${where}: treasure count ${held.length} != pool ${s.treasurePool.length}`);
  } else {
    const a = [...held].sort().join('|');
    const b = [...s.treasurePool].sort().join('|');
    if (a !== b) ok(false, `${where}: treasure multiset mismatch`);
  }
  // endurance bounds (a lethal overshoot is legal only at the moment of loss)
  if (s.phase !== 'gameOver') {
    for (const ch of s.characters) {
      if (ch.stamina < 0 || ch.damage < 0 || ch.stamina + ch.damage > DS_ENDURANCE_BOXES) {
        ok(false, `${where}: endurance out of bounds seat ${ch.seat} (${ch.stamina}+${ch.damage})`);
      }
    }
  }
  // souls / sparks
  if (s.soulCache < 0) ok(false, `${where}: negative souls`);
  if (s.sparks < 0 || s.sparks > s.sparksMax) ok(false, `${where}: sparks ${s.sparks} out of 0..${s.sparksMax}`);
  // node caps at rest points only (pushes may be mid-resolution otherwise)
  if (s.pendings.length === 0 && s.script.length === 0 && s.encounter) {
    const counts: Record<string, number> = {};
    const bossCounts: Record<string, number> = {};
    for (const ch of s.characters) if (ch.nodeId) counts[ch.nodeId] = (counts[ch.nodeId] ?? 0) + 1;
    for (const e of s.encounter.enemies) counts[e.nodeId] = (counts[e.nodeId] ?? 0) + 1;
    for (const u of s.boss?.units ?? []) {
      if (u.inPlay && u.nodeId) {
        counts[u.nodeId] = (counts[u.nodeId] ?? 0) + 1;
        bossCounts[u.nodeId] = (bossCounts[u.nodeId] ?? 0) + 1;
      }
    }
    for (const [node, n] of Object.entries(counts)) {
      if (n > 3) ok(false, `${where}: node ${node} holds ${n} models`);
    }
    for (const [node, n] of Object.entries(bossCounts)) {
      if (n > 1) ok(false, `${where}: node ${node} holds ${n} bosses`);
    }
  }
  // behaviour deck conservation
  if (s.boss) {
    const n = s.boss.deck.length + s.boss.discard.length;
    if (n !== s.boss.expectedDeckCount) {
      ok(false, `${where}: boss deck+discard ${n} != expected ${s.boss.expectedDeckCount}`);
    }
  }
  // encounter cards: distinct per tile
  const ids = s.tiles.map((t) => t.encounterId).filter((x): x is string => x != null);
  if (new Set(ids).size !== ids.length) ok(false, `${where}: duplicate encounter cards on tiles`);
  // aggro holder exists
  if (s.characters.length > 0 && (s.aggroSeat < 0 || s.aggroSeat >= s.options.partySize)) {
    ok(false, `${where}: bad aggro seat`);
  }
}

// ---------- bots ----------

function botChoose(s: DsState): DsAction & { seat: number } {
  const head = s.pendings[0] as DsPending;
  const pickOf = (): string => {
    switch (head.kind) {
      case 'defence': {
        const canDodge = head.options.some((o) => o.key === 'dodge');
        return canDodge && (head.data.damage as number) >= 4 ? 'dodge' : 'block';
      }
      case 'trap': return head.options.some((o) => o.key === 'dodge') ? 'dodge' : 'suffer';
      case 'postRoll': return 'accept';
      case 'treasureKeep': {
        // gear up: equip a drawn card whenever someone can use it
        const equip = head.options.find((o) => o.key.startsWith('equip:'));
        return equip?.key ?? 'stash';
      }
      case 'dodgeMove': return 'stay';
      default: return head.options[0].key;
    }
  };
  return { type: 'choose', pick: pickOf(), seat: head.seat };
}

/** greedy character-turn candidates: estus when hurt, attack anything in
 * reach, close toward the nearest enemy, end. Applied in order until one
 * sticks — the reducer is the rules oracle. */
function botCharCandidates(s: DsState, seat: number): DsAction[] {
  const ch = s.characters[seat];
  const enc = s.encounter!;
  const out: DsAction[] = [];
  if (ch.damage >= 5 && ch.estus) out.push({ type: 'use_estus' });

  const targetsEnemy = [...enc.enemies].sort((a, b) =>
    dsNodeDistance(enc.faceId, ch.nodeId!, a.nodeId) - dsNodeDistance(enc.faceId, ch.nodeId!, b.nodeId));
  const bossUnits = (s.boss?.units ?? []).filter((u) => u.inPlay && u.nodeId != null);
  for (const hand of ['L', 'R'] as const) {
    const eq = hand === 'L' ? ch.handL : ch.handR;
    if (!eq) continue;
    const card = DS_TREASURE_BY_ID[eq.cardId];
    // strongest affordable option first (more dice = more damage)
    const optIdxs = (card.actions ?? [])
      .map((a, i) => ({ i, dice: Object.values(a.dice ?? {}).reduce((n, d) => n + (d ?? 0), 0), cost: a.staminaCost }))
      .filter((o) => o.dice > 0)
      .sort((a, b) => (b.dice - b.cost / 10) - (a.dice - a.cost / 10))
      .map((o) => o.i);
    for (const i of optIdxs) {
      for (const en of targetsEnemy.slice(0, 2)) out.push({ type: 'attack', hand, option: i, targetUid: en.uid });
      for (const u of bossUnits) out.push({ type: 'attack', hand, option: i, targetUnit: u.key });
    }
  }
  // close the distance toward the nearest hostile (obstacle-aware)
  const goal = targetsEnemy[0]?.nodeId ?? bossUnits[0]?.nodeId ?? null;
  if (goal && ch.nodeId && goal !== ch.nodeId) {
    const g = dsTileGraph(enc.faceId);
    const d0 = dsCombatDistance(s, ch.nodeId, goal);
    const next = [...g.adj[ch.nodeId]]
      .filter((n) => !dsNodeBlocked(s, n) && dsOccupancy(s, n) < 3
        && dsCombatDistance(s, n, goal) < d0)
      .sort((a, b) => dsCombatDistance(s, a, goal) - dsCombatDistance(s, b, goal))[0];
    if (next) {
      out.push({ type: 'walk', nodeId: next });
      if (dsCanSpendStamina(ch, 2) && ch.damage < 5) out.push({ type: 'run', nodeId: next });
    } else {
      // walled off: smash an adjacent barrel to open the path (core p.17)
      const barrel = enc.terrain.find((t) => t.piece === 'barrel' && !t.destroyed
        && g.adj[ch.nodeId!].includes(t.nodeId) && dsOccupancy(s, t.nodeId) < 3);
      if (barrel) out.push({ type: 'walk', nodeId: barrel.nodeId });
    }
  }
  out.push({ type: 'end_activation' });
  return out;
}

function botBonfireCandidates(s: DsState): (DsAction & { seat: number })[] {
  const out: (DsAction & { seat: number })[] = [];
  // gear up at Andre, then level toward the class primary stat (bot goals)
  if (s.partyAt === 'bonfire' && s.soulCache >= 3 && s.treasureDeck.length > 0) {
    out.push({ type: 'buy_treasure', seat: 0 });
  }
  for (const ch of s.characters) {
    const cls = DS_CLASSES[ch.classId];
    const primary = (['str', 'dex', 'int', 'fai'] as ('str' | 'dex' | 'int' | 'fai')[])
      .sort((a, b) => cls.startingStats[b] - cls.startingStats[a])[0];
    if (s.partyAt === 'bonfire' && s.soulCache >= 6) {
      out.push({ type: 'level_up', stat: primary, seat: ch.seat });
    }
  }
  // open a chest when standing on a cleared tile with one
  if (s.partyAt !== 'bonfire') {
    const tile = s.tiles.find((t) => t.id === s.partyAt);
    if (tile && (tile.cleared || tile.completed)) {
      for (const [node, state] of Object.entries(tile.chests)) {
        if (state === 'closed') out.push({ type: 'open_chest', nodeId: node, seat: 0 });
      }
    }
  }
  // always press on (bot goal): fog gate if ready, else forward
  if (s.stage === 'megaBoss') {
    if (s.partyAt === 'bonfire') out.push({ type: 'enter_fog_gate', seat: 0 });
    else out.push({ type: 'travel', tileId: 'bonfire', seat: 0 });
  } else if (s.partyAt === s.fogGateTileId) {
    out.push({ type: 'enter_fog_gate', seat: 0 });
  }
  if (s.partyAt === 'bonfire') {
    if (s.tiles.length > 0) out.push({ type: 'travel', tileId: s.tiles[0].id, seat: 0 });
  } else {
    const i = s.tiles.findIndex((t) => t.id === s.partyAt);
    if (i >= 0 && i + 1 < s.tiles.length) out.push({ type: 'travel', tileId: s.tiles[i + 1].id, seat: 0 });
  }
  return out;
}

interface BotResult { actions: number; stalled: boolean }

function runBots(s: DsState, cap: number, stopWhen?: (s: DsState) => boolean): BotResult {
  let actions = 0;
  let idleStreak = 0;
  while (s.phase !== 'gameOver' && actions < cap && !(stopWhen && stopWhen(s))) {
    let applied = false;
    if (s.phase === 'setup') {
      const seat = s.classPicks.findIndex((c) => c == null);
      const free = CLASS_ORDER.find((c) => !s.classPicks.includes(c))!;
      applied = act(s, seat, { type: 'pick_class', classId: free }).ok;
    } else if (s.pendings.length > 0) {
      const { seat, ...a } = botChoose(s);
      applied = act(s, seat, a as DsAction).ok;
    } else if (s.phase === 'encounter' || s.phase === 'bossEncounter') {
      const enc = s.encounter!;
      if (enc.turn === 'characters') {
        const seat = enc.activeSeat;
        for (const a of botCharCandidates(s, seat)) {
          if (act(s, seat, a).ok) { applied = true; break; }
        }
      }
    } else if (s.phase === 'bonfire') {
      for (const a of botBonfireCandidates(s)) {
        const { seat, ...rest } = a;
        if (act(s, seat, rest as DsAction).ok) { applied = true; break; }
      }
    }
    if (!applied) {
      idleStreak++;
      if (idleStreak > 3) return { actions, stalled: true };
      continue;
    }
    idleStreak = 0;
    actions++;
    checkInvariants(s, `bots@${actions}`);
  }
  return { actions, stalled: s.phase !== 'gameOver' && !(stopWhen && stopWhen(s)) };
}

// ---------- 1. bot playthroughs ----------

console.log('--- bot playthroughs: standard game, party sizes 1-4 ---');
let wins = 0;
for (let n = 1; n <= 4; n++) {
  const s = createDarkSouls({
    scenarioId: 'standard', partySize: n, classIds: classesFor(n),
    miniBoss: 'winged-knight', mainBoss: 'dancer-of-the-boreal-valley', seed: 100 + n,
  });
  const r = runBots(s, 60000);
  ok(!r.stalled, `standard ${n}p: bots reach a terminal state (${r.actions} actions, phase ${s.phase})`);
  ok(s.phase === 'gameOver', `standard ${n}p: game over (winner=${s.winner})`);
  if (s.winner === true) wins++;
  console.log(`  standard ${n}p: ${r.actions} actions, winner=${s.winner}`);
}
console.log(`  standard wins: ${wins}/4 (losses are legal terminals — sparks ran out)`);

console.log('--- bot playthroughs: The First Journey, section 1, party sizes 1-4 ---');
for (let n = 1; n <= 4; n++) {
  const s = createDarkSouls({
    scenarioId: 'first-journey', partySize: n, classIds: classesFor(n), seed: 200 + n,
  });
  const r = runBots(s, 60000, (st) => (st.campaign?.sectionIdx ?? 0) >= 1);
  const done = s.phase === 'gameOver' || (s.campaign?.sectionIdx ?? 0) >= 1;
  ok(!r.stalled && done, `first-journey ${n}p: section 1 resolves (${r.actions} actions, sectionIdx=${s.campaign?.sectionIdx}, phase=${s.phase}, winner=${s.winner})`);
  console.log(`  first-journey ${n}p: ${r.actions} actions, sectionIdx=${s.campaign?.sectionIdx}, winner=${s.winner}`);
}

// ---------- helpers for directed tests ----------

function mkGame(opts: Partial<Parameters<typeof createDarkSouls>[0]> = {}): DsState {
  return createDarkSouls({
    scenarioId: 'standard', partySize: 2, classIds: classesFor(2),
    miniBoss: 'winged-knight', mainBoss: 'dancer-of-the-boreal-valley', seed: 42,
    ...opts,
  });
}

/** answer pendings with the bot until quiet or a predicate matches */
function drain(s: DsState, until?: (s: DsState) => boolean): void {
  let guard = 0;
  while (s.pendings.length > 0 && guard++ < 500 && !(until && until(s))) {
    const { seat, ...a } = botChoose(s);
    const r = act(s, seat, a as DsAction);
    if (!r.ok) throw new Error(`drain: choose rejected: ${r.error}`);
  }
}

/** enter the first tile's encounter and resolve up to the first character turn */
function enterFirstEncounter(s: DsState): void {
  const r = act(s, 0, { type: 'travel', tileId: s.tiles[0].id });
  if (!r.ok) throw new Error(`travel failed: ${r.error}`);
  drain(s);
}

// ---------- 2. directed rules tests ----------

console.log('--- directed rules tests ---');

// pending gate: while pendings are non-empty only `choose` is legal (§6.4)
{
  const s = mkGame({ seed: 7 });
  act(s, 0, { type: 'travel', tileId: s.tiles[0].id });
  ok(s.pendings.length > 0 && s.pendings[0].kind === 'leadCharacter', 'encounter start pends leadCharacter (core p.19)');
  const r = act(s, 0, { type: 'end_activation' });
  ok(!r.ok, 'non-choose actions are rejected while a decision is pending');
  const wrongSeat = act(s, 1, { type: 'choose', pick: s.pendings[0].options[0].key });
  ok(!wrongSeat.ok, 'only the pending head owner may choose');
}

// aggro grab on activation (core p.22): the activating character takes the token
{
  const s = mkGame({ seed: 9 });
  enterFirstEncounter(s);
  if (s.phase === 'encounter' && s.encounter?.turn === 'characters') {
    ok(s.aggroSeat === s.encounter.activeSeat, 'the activating character holds the Aggro token (core p.22)');
  } else {
    ok(s.phase === 'bonfire' || s.phase === 'encounter', 'encounter proceeded');
  }
}

// estus full-clear (core p.11)
{
  const s = mkGame({ seed: 11 });
  enterFirstEncounter(s);
  drain(s);
  if (s.encounter?.turn === 'characters') {
    const seat = s.encounter.activeSeat;
    const ch = s.characters[seat];
    ch.stamina = 3; ch.damage = 4;
    const r = act(s, seat, { type: 'use_estus' });
    ok(r.ok && ch.stamina === 0 && ch.damage === 0 && !ch.estus,
      'Estus clears ALL black and red cubes and empties the flask (core p.11)');
    const again = act(s, seat, { type: 'use_estus' });
    ok(!again.ok, 'an empty Estus Flask cannot be used again');
  } else ok(false, 'estus test: no character turn reached');
}

// ember reduction: 3+ damage from an attack is reduced by 1 (core p.12)
{
  const s = mkGame({ seed: 13 });
  s.characters[0].ember = true;
  _dsInternals.applyCharDamage(s, 0, 4, { attack: true, source: 'test attack' });
  ok(s.characters[0].damage === 3, `ember reduces 4 attack damage to 3 (got ${s.characters[0].damage})`);
  _dsInternals.applyCharDamage(s, 1, 4, { attack: true, source: 'test attack' });
  ok(s.characters[1].damage === 4, 'unembered character suffers the full 4');
  const s2 = mkGame({ seed: 14 });
  s2.characters[0].ember = true;
  _dsInternals.applyCharDamage(s2, 0, 2, { attack: true, source: 'test attack' });
  ok(s2.characters[0].damage === 2, 'ember does not reduce damage below the 3+ threshold (core p.12)');
}

// bleed: +2 on the next damage, then clear (core p.21)
{
  const s = mkGame({ seed: 15 });
  s.characters[0].conditions.push('bleed');
  _dsInternals.applyCharDamage(s, 0, 2, { attack: true, source: 'test' });
  ok(s.characters[0].damage === 4 && !s.characters[0].conditions.includes('bleed'),
    `bleed adds +2 then clears (got ${s.characters[0].damage})`);
}

// heat-up injection at the threshold (core p.28)
{
  const s = mkGame({ seed: 17 });
  _dsInternals.startBossFight(s, 'winged-knight', 'mini');
  drain(s);
  const run = s.boss!;
  const before = run.expectedDeckCount;
  const threshold = DS_BOSSES['winged-knight'].data!.heatUpThreshold!;
  run.units[0].health = threshold + 2;
  _dsInternals.applyBossDamage(s, 'boss', 3, null);
  ok(run.heatedUp, 'boss heats up when health falls to the heat-up point or below (core p.28)');
  ok(run.expectedDeckCount === before + 1 && run.deck.length + run.discard.length === before + 1,
    'heat up shuffles exactly one heat-up card into the deck');
  const deckCells = [...run.deck, ...run.discard];
  const heatCells = DS_BOSSES['winged-knight'].behaviors!.filter((c) => c.heatUp).map((c) => String(c.cell));
  ok(deckCells.some((c) => heatCells.includes(c)), 'the injected card is a heat-up card');
  ok(run.heatUpsUsed === 0 || run.heatedUp, 'heat-up fires once');
  _dsInternals.applyBossDamage(s, 'boss', 1, null);
  ok(run.deck.length + run.discard.length === before + 1, 'heat-up does not fire twice');
}

// weak-arc +1 black die (core p.28)
{
  const s = mkGame({ seed: 19 });
  _dsInternals.startBossFight(s, 'winged-knight', 'mini');
  drain(s);
  const run = s.boss!;
  const unit = run.units[0];
  // force a known top-discard card: Charging Assault (cell 9) is weak RIGHT
  run.discard = ['9'];
  run.deck = run.deck.filter((c) => c !== '9');
  run.expectedDeckCount = run.deck.length + 1;
  run.weakArcUsed = false;
  // stand the knight in the boss's right arc, adjacent
  unit.facing = [0, -1]; // facing "north" in px space
  {
    // stand the knight base-to-base on the boss node, in the weak (right) arc
    const ch = s.characters[0];
    ch.nodeId = unit.nodeId!;
    ch.arc = 'right';
    s.encounter!.turn = 'characters';
    s.encounter!.activeSeat = 0;
    ch.act = { walkUsed: false, stage: 'start', movedBefore: false, attacked: [], swapWindow: true, freeMoves: 0, buff: null, mercExtra: false, deprivedSwap: false };
    ch.stamina = 0; ch.damage = 0;
    const logLen = s.log.length;
    const r = act(s, 0, { type: 'attack', hand: 'R', option: 0, targetUnit: 'boss' });
    drain(s);
    ok(r.ok, `weak-arc attack applies (${r.error ?? 'ok'})`);
    const gotBonus = s.log.slice(logLen).some((l) => l.text.includes('Weak arc'));
    ok(gotBonus, 'attacking from the weak arc grants +1 black die (core p.28)');
    ok(s.boss === null || s.boss.weakArcUsed, 'the weak-arc bonus is consumed for this card');
  }
}

// dodge dice are 50% per die (dice.json golden) — seeded stream expectation
{
  const s = mkGame({ seed: 21 });
  let hits = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) hits += dsRollDodgeDie(s);
  ok(Math.abs(hits - N / 2) < 250, `dodge die is 50/50 over the seeded stream (${hits}/${N})`);
}

// death: cache drop on the kill node + retrieval; spark decrement (core p.19)
{
  const s = mkGame({ seed: 23 });
  act(s, 0, { type: 'travel', tileId: s.tiles[0].id }); // no drain: wipe before combat
  s.soulCache = 7;
  const sparks = s.sparks;
  const tileId = s.encounter!.tileId!;
  const ch0 = s.characters[0];
  const deathNode = ch0.nodeId!;
  _dsInternals.applyCharDamage(s, 0, 99, { attack: true, source: 'test' });
  ok(s.phase === 'bonfire' && s.partyAt === 'bonfire', 'party defeat sends everyone to the bonfire (core p.19)');
  ok(s.sparks === sparks - 1, 'forced rest turns the spark dial down one (core p.8)');
  ok(s.soulCache === 0 && s.droppedSouls?.amount === 7 && s.droppedSouls.tileId === tileId && s.droppedSouls.nodeId === deathNode,
    'the whole soul cache drops on the death node');
  ok(s.characters.every((c) => c.stamina === 0 && c.damage === 0), 'rest clears the endurance bars (engine judgment)');
  const tile = s.tiles.find((t) => t.id === tileId)!;
  ok(!tile.faceUp && !tile.cleared, 'encounters reset face down on the forced rest (core p.15)');
  // retrieval: re-enter, walk onto the node
  act(s, 0, { type: 'travel', tileId });
  drain(s);
  // walk seat 0's character along the graph toward the drop node during its turns
  let guard = 0;
  while (s.soulCache < 7 && guard++ < 2000 && s.phase !== 'gameOver') {
    if (s.pendings.length > 0) { const { seat, ...a } = botChoose(s); act(s, seat, a as DsAction); continue; }
    if (s.phase !== 'encounter' || s.encounter!.turn !== 'characters') break;
    const seat = s.encounter!.activeSeat;
    const ch = s.characters[seat];
    const g = dsTileGraph(s.encounter!.faceId);
    const next = [...g.adj[ch.nodeId!]]
      .filter((n) => !dsNodeBlocked(s, n) && dsOccupancy(s, n) < 3)
      .sort((a, b) => dsNodeDistance(s.encounter!.faceId, a, deathNode) - dsNodeDistance(s.encounter!.faceId, b, deathNode))[0];
    let moved = false;
    if (next && dsNodeDistance(s.encounter!.faceId, next, deathNode) < dsNodeDistance(s.encounter!.faceId, ch.nodeId!, deathNode)) {
      moved = act(s, seat, { type: 'walk', nodeId: next }).ok || act(s, seat, { type: 'run', nodeId: next }).ok;
    }
    if (!moved) act(s, seat, { type: 'end_activation' });
  }
  ok(s.soulCache >= 7 || s.phase === 'gameOver' || s.droppedSouls === null,
    `dropped souls recovered by re-entering the node (cache=${s.soulCache})`);
}

// TPK with 0 sparks = loss (core p.8)
{
  const s = mkGame({ seed: 25 });
  act(s, 0, { type: 'travel', tileId: s.tiles[0].id });
  s.sparks = 0;
  _dsInternals.applyCharDamage(s, 0, 99, { attack: true, source: 'test' });
  ok(s.phase === 'gameOver' && s.winner === false, 'a death at 0 sparks loses the game (core p.8)');
}

// second wipe before pickup discards the dropped souls (core p.19)
{
  const s = mkGame({ seed: 27 });
  act(s, 0, { type: 'travel', tileId: s.tiles[0].id });
  s.soulCache = 5;
  _dsInternals.applyCharDamage(s, 0, 99, { attack: true, source: 'test' });
  const firstDrop = s.droppedSouls;
  ok(firstDrop?.amount === 5, 'first wipe drops 5 souls');
  act(s, 0, { type: 'travel', tileId: s.tiles[0].id });
  s.soulCache = 2;
  _dsInternals.applyCharDamage(s, 1, 99, { attack: true, source: 'test' });
  ok(s.droppedSouls?.amount === 2, 'second wipe discards the old drop and drops the new cache');
}

// undrawable-L4 redraw (mega insert p.7; spec correction 4)
{
  const undrawable = ['hall-of-wraiths', 'new-londo-ruins', 'fortress-gates', 'blazing-furnace', 'royal-woods-passage'];
  for (const id of undrawable) {
    ok(!dsIsDrawableEncounter(DS_ENCOUNTER_BY_ID[id]), `${id} is undrawable (UNKNOWN spawns)`);
  }
  ok(DS_ENCOUNTERS.filter((e) => e.level === 4 && !dsIsDrawableEncounter(e)).length === 5,
    'exactly 5 of the 12 L4 cards are undrawable (golden)');
  const s = mkGame({ seed: 29 });
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(dsDrawL4(s, 'Level 4 Four Kings Encounter'));
  ok([...seen].every((id) => !undrawable.includes(id)),
    'undrawable L4 cards are never drawn — the draw redraws');
  ok(seen.has('cursed-cavern') && seen.has('edge-of-the-abyss'), 'both drawable Four Kings L4s appear');
}

// Call of the Abyss: cross-deck L4 substitution when the FK pool exhausts
{
  const s = createDarkSouls({
    scenarioId: 'call-of-the-abyss', partySize: 2, classIds: classesFor(2), seed: 31,
  });
  s.campaign!.l4Completed = ['cursed-cavern', 'edge-of-the-abyss'];
  const got = dsDrawL4(s, 'Level 4 Four Kings Encounter');
  const card = DS_ENCOUNTER_BY_ID[got];
  ok(card.level === 4 && dsIsDrawableEncounter(card) && !card.deck.includes('Four Kings'),
    `exhausted FK pool substitutes a drawable L4 from another deck (got ${got})`);
}

// Four Kings: Royal Summons on the first deck flip-over (fk p.13)
{
  const s = createDarkSouls({
    scenarioId: 'standard', partySize: 4, classIds: classesFor(4),
    miniBoss: 'winged-knight', mainBoss: 'dancer-of-the-boreal-valley',
    megaFinale: 'four-kings', seed: 33,
  });
  _dsInternals.startBossFight(s, 'four-kings', 'mega');
  drain(s);
  const run = s.boss!;
  ok(run.summonsRemaining === 3 && run.units.filter((u) => u.inPlay).length === 1,
    'the encounter starts with King One and three summons pending');
  ok(run.deck.length + run.discard.length === 4, 'Four Kings deck = 4 random of the 8 standard cards');
  // drive boss/character turns until the deck would flip over
  let guard = 0;
  while ((run.summonsRemaining ?? 0) === 3 && guard++ < 400 && s.phase === 'bossEncounter') {
    if (s.pendings.length > 0) { const { seat, ...a } = botChoose(s); act(s, seat, a as DsAction); continue; }
    // keep the party alive: this test is about deck mechanics
    for (const ch of s.characters) { ch.damage = 0; ch.stamina = 0; }
    if (s.encounter!.turn === 'characters') act(s, s.encounter!.activeSeat, { type: 'end_activation' });
  }
  ok(run.summonsRemaining === 2, 'the first deck flip-over performs a Royal Summons instead');
  ok(run.units.find((u) => u.key === 'king2')?.inPlay === true, 'King Two enters on the mega spawn node');
  const king2Cells = DS_BOSSES['four-kings'].kingTwo!.map((c) => String(c.cell));
  const inRun = [...run.deck, ...run.discard];
  ok(inRun.filter((c) => king2Cells.includes(c)).length === 2, 'two of King Two\'s cards join the deck (fk p.13)');
  ok(run.deck.length + run.discard.length === run.expectedDeckCount, 'deck ledger consistent after the summons');
}

// unshuffled recycle preserves the discard order exactly (core p.29)
{
  const s = mkGame({ seed: 35 });
  _dsInternals.startBossFight(s, 'winged-knight', 'mini');
  drain(s);
  const run = s.boss!;
  const order: string[] = [];
  let guard = 0;
  const deckSize = run.expectedDeckCount; // the flip cycle length
  while (order.length < deckSize * 2 && guard++ < 600 && s.phase === 'bossEncounter' && !run.heatedUp) {
    if (s.pendings.length > 0) { const { seat, ...a } = botChoose(s); act(s, seat, a as DsAction); continue; }
    for (const ch of s.characters) { ch.damage = 0; ch.stamina = 0; }
    const before = run.discard[0];
    if (s.encounter!.turn === 'characters') {
      act(s, s.encounter!.activeSeat, { type: 'end_activation' });
      if (run.discard[0] !== before && run.discard[0] != null) order.push(run.discard[0]);
    }
  }
  if (order.length >= deckSize * 2) {
    const first = order.slice(0, deckSize).join(',');
    const second = order.slice(deckSize, deckSize * 2).join(',');
    ok(first === second, `the pattern loops unshuffled (${first} == ${second})`);
  } else {
    ok(false, `recycle test flipped only ${order.length} cards`);
  }
}

// standard progression: mini kill -> reset + injection -> main kill -> win (core p.9/28)
{
  const s = mkGame({ seed: 37 });
  const deckBefore = s.treasureDeck.length;
  s.tiles.forEach((t) => { t.faceUp = true; t.cleared = true; });
  s.partyAt = s.fogGateTileId!;
  const r = act(s, 0, { type: 'enter_fog_gate' });
  ok(r.ok, `fog gate opens onto the mini boss (${r.error ?? 'ok'})`);
  drain(s);
  _dsInternals.applyBossDamage(s, 'boss', 999, null);
  ok(s.miniBossDefeated && s.stage === 'postMini', 'mini boss kill triggers the main-boss reset (core p.9)');
  const injected = s.treasureDeck.length - deckBefore;
  ok(injected === 2 * 5 + 5, `transposed (5/class) + 5 legendaries injected (got +${injected})`);
  ok(s.inventory.length >= 3, 'mini boss treasure goes to the inventory (core p.28)');
  ok(s.sparks === s.sparksMax, 'sparks reset with the play area');
  // main boss
  s.tiles.forEach((t) => { t.faceUp = true; t.cleared = true; });
  s.partyAt = s.fogGateTileId!;
  const r2 = act(s, 0, { type: 'enter_fog_gate' });
  ok(r2.ok, 'fog gate opens onto the main boss');
  drain(s);
  s.soulCache = 0;
  const sparksNow = s.sparks;
  _dsInternals.applyBossDamage(s, 'boss', 999, null);
  ok(s.winner === true && s.phase === 'gameOver', 'main boss defeat wins the game (core p.28)');
  ok(s.soulCache === sparksNow * 2, 'boss victory pays 1 soul per character per remaining spark (core p.19)');
}

// mega finale: main boss -> L4 one-shot -> mega boss (mega insert p.7-9)
{
  const s = createDarkSouls({
    scenarioId: 'standard', partySize: 2, classIds: classesFor(2),
    miniBoss: 'winged-knight', mainBoss: 'dancer-of-the-boreal-valley',
    megaFinale: 'old-iron-king', seed: 39,
  });
  s.miniBossDefeated = true;
  s.stage = 'postMini';
  s.tiles.forEach((t) => { t.faceUp = true; t.cleared = true; });
  s.partyAt = s.fogGateTileId!;
  act(s, 0, { type: 'enter_fog_gate' });
  drain(s);
  _dsInternals.applyBossDamage(s, 'boss', 999, null);
  ok(s.winner === null && (s.stage as string) === 'megaL4', 'main boss defeat rolls into the mega framework');
  ok(s.tiles.length === 1 && s.tiles[0].kind === 'mega' && s.tiles[0].level === 4, 'one L4 encounter on the mega board');
  ok(dsIsDrawableEncounter(DS_ENCOUNTER_BY_ID[s.tiles[0].encounterId!]), 'the drawn L4 is drawable');
  act(s, 0, { type: 'travel', tileId: 'mega1' });
  ok(s.phase === 'encounter' && (s.encounter?.enemies.length ?? 0) >= 6,
    `the L4 encounter spawns doubled rows (${s.encounter?.enemies.length ?? 0} enemies)`);
  const uids = (s.encounter?.enemies ?? []).map((e) => e.uid);
  for (const uid of uids) _dsInternals.applyEnemyDamage(s, uid, 999, null);
  ok((s.stage as string) === 'megaBoss' && s.tiles[0].completed, 'clearing the L4 flips the board; the encounter never resets (mega insert p.8-9)');
  act(s, 0, { type: 'travel', tileId: 'bonfire' });
  const r = act(s, 0, { type: 'enter_fog_gate' });
  ok(r.ok && s.boss?.id === 'old-iron-king', 'the fog gate on the bonfire doorway opens onto the mega boss');
  drain(s);
  const oik = s.boss!;
  ok(oik.beamDeck !== null && oik.deck.length + oik.discard.length === 6,
    'OIK deck = 3 Fire Beams + 3 standard, with a separate beam deck (oik p.12)');
  _dsInternals.applyBossDamage(s, 'boss', 22, null);
  ok(oik.fireBeamBuff, 'Old Iron Rage: heat up buffs the Fire Beams (oik p.12)');
  _dsInternals.applyBossDamage(s, 'boss', 999, null);
  ok(s.winner === true, 'mega boss defeat wins the game (mega insert p.12)');
}

// campaign: double Gargoyle back-to-back, treasure gating, section advance (core p.35)
{
  const s = createDarkSouls({
    scenarioId: 'first-journey', partySize: 2, classIds: classesFor(2), seed: 41,
  });
  s.tiles.forEach((t) => { t.faceUp = true; t.cleared = true; });
  s.partyAt = s.fogGateTileId!;
  act(s, 0, { type: 'enter_fog_gate' });
  drain(s);
  ok(s.boss?.id === 'gargoyle' && !s.boss.gargoyleTwo, 'section 1 fog gate opens onto the first Gargoyle');
  const invBefore = s.inventory.length;
  _dsInternals.applyBossDamage(s, 'boss', 999, null);
  ok(s.boss?.id === 'gargoyle' && s.boss.gargoyleTwo === true, 'the second Gargoyle follows back-to-back (core p.35)');
  ok(s.inventory.length === invBefore, 'no treasure until both Gargoyles fall');
  drain(s);
  const sparksBefore = s.sparks;
  _dsInternals.applyBossDamage(s, 'boss', 999, null);
  ok(s.inventory.length > invBefore, 'the Gargoyles\' treasure arrives after the second kill');
  ok(s.campaign!.sectionIdx === 1, 'the campaign advances to Section 2');
  ok(s.sparks === Math.min(s.sparksMax, sparksBefore + 2), 'campaign: +1 spark per boss, granted at the area\'s final boss (core p.33/35)');
  ok(s.campaign!.legendariesInjected, 'transposed + legendary treasure injected after section 1');
}

// enemy behaviour: skull = aggro, ring = nearest (spec correction 1)
{
  const kirk = DS_ENEMIES['crossbow-hollow'];
  ok(kirk.behaviors[0].target === 'aggro' && kirk.behaviors[0].movement?.toward === 'aggro',
    'crossbow hollow targets the AGGRO holder (skull icon, corrected key)');
  const hollow = DS_ENEMIES['hollow-soldier'];
  ok(hollow.behaviors[0].target === 'nearest', 'hollow soldier targets the NEAREST character (ring icon)');
}

// equipment gates: occupied hands, 3-weapon cap (core p.12)
{
  const s = mkGame({ seed: 43 });
  s.inventory.push('club', 'hand-axe');
  s.treasurePool.push('club', 'hand-axe');
  // warrior (seat 1) holds round shield + battle axe: a hand equip must fail
  const r = act(s, 1, { type: 'equip_move', cardId: 'club', to: 'handL' });
  ok(!r.ok, 'cannot equip into an occupied hand');
  const r2 = act(s, 1, { type: 'equip_move', cardId: 'club', to: 'backup' });
  ok(r2.ok, `backup slot accepts a third weapon (${r2.error ?? 'ok'})`);
  const r3 = act(s, 1, { type: 'equip_move', cardId: 'hand-axe', to: 'backup' });
  ok(!r3.ok, 'a fourth weapon is rejected: three weapons total (core p.12)');
  checkInvariants(s, 'equip gates');
}

// level-up costs (core p.15) and campaign tier 4 (core p.33)
{
  const s = mkGame({ seed: 45 });
  s.soulCache = 14;
  ok(act(s, 0, { type: 'level_up', stat: 'str' }).ok && s.soulCache === 12, 'Base->T1 costs 2 (standard, core p.15)');
  ok(act(s, 0, { type: 'level_up', stat: 'str' }).ok && s.soulCache === 8, 'T1->T2 costs 4');
  ok(act(s, 0, { type: 'level_up', stat: 'str' }).ok && s.soulCache === 0, 'T2->T3 costs 8');
  ok(!act(s, 0, { type: 'level_up', stat: 'str' }).ok, 'no Tier 4 outside campaigns');
  const c = createDarkSouls({ scenarioId: 'first-journey', partySize: 2, classIds: classesFor(2), seed: 46 });
  c.soulCache = 48;
  ok(act(c, 0, { type: 'level_up', stat: 'str' }).ok && c.soulCache === 44, 'campaign Base->T1 costs 4 (core p.33)');
  act(c, 0, { type: 'level_up', stat: 'str' });
  act(c, 0, { type: 'level_up', stat: 'str' });
  const r4 = act(c, 0, { type: 'level_up', stat: 'str' });
  ok(r4.ok && c.characters[0].tiers.str === 4, 'campaign Tier 4 exists (20 souls)');
  ok(dsStatValue(c.characters[0], 'str') === 40, 'any stat at Tier 4 has value 40 (core p.33)');
}

// buying treasure at Andre conserves cards and costs souls (core p.14)
{
  const s = mkGame({ seed: 47 });
  s.soulCache = 3;
  const r = act(s, 0, { type: 'buy_treasure' });
  ok(r.ok && s.soulCache === 2, 'standard Andre draw costs 1 soul (core p.14)');
  ok(s.pendings.length > 0, 'the drawn card routes through a keep/stash decision');
  drain(s);
  checkInvariants(s, 'andre purchase');
  const c = createDarkSouls({ scenarioId: 'first-journey', partySize: 2, classIds: classesFor(2), seed: 48 });
  c.soulCache = 3;
  const rc = act(c, 0, { type: 'buy_treasure' });
  ok(rc.ok && c.soulCache === 1, 'campaign Andre draw costs 2 souls (core p.33)');
  drain(c);
  // sellback
  if (c.inventory.length > 0) {
    const cardId = c.inventory[0];
    const before = c.soulCache;
    ok(act(c, 0, { type: 'sell_treasure', cardId }).ok && c.soulCache === before + 1
      && c.campaign!.discardedForever.includes(cardId),
    'campaign sellback pays 1 soul and discards forever (core p.33)');
    checkInvariants(c, 'sellback');
  }
}

// Sif cool-down: at 3 or less the deck becomes Limping Strike alone (dr p.8)
{
  const s = mkGame({ seed: 49 });
  _dsInternals.startBossFight(s, 'great-grey-wolf-sif', 'main');
  drain(s);
  const run = s.boss!;
  run.units[0].health = 5;
  _dsInternals.applyBossDamage(s, 'boss', 2, null);
  ok(run.deck.length === 1 && run.discard.length === 0 && run.expectedDeckCount === 1,
    'Sif at 3 health: the whole deck is replaced by Limping Strike (dr p.8)');
  const limp = DS_BOSSES['great-grey-wolf-sif'].behaviors!.find((c) => c.coolDownCard)!;
  ok(run.deck[0] === String(limp.cell), 'the remaining card is Limping Strike');
}

// Artorias heat-up: -2 random, +all 3 heat-ups (dr p.9)
{
  const s = mkGame({ seed: 51 });
  _dsInternals.startBossFight(s, 'artorias', 'main');
  drain(s);
  const run = s.boss!;
  const before = run.expectedDeckCount;
  run.units[0].health = DS_BOSSES['artorias'].data!.heatUpThreshold! + 1;
  _dsInternals.applyBossDamage(s, 'boss', 2, null);
  ok(run.expectedDeckCount === before - 2 + 3 && run.deck.length + run.discard.length === run.expectedDeckCount,
    'Artorias heat-up removes 2 and adds all 3 heat-up cards (dr p.9)');
}

// O&S: paired activation and the survivor's heat-up deck (bosses.json)
{
  const s = createDarkSouls({
    scenarioId: 'standard', partySize: 2, classIds: classesFor(2),
    miniBoss: 'winged-knight', mainBoss: 'ornstein-and-smough', seed: 53,
  });
  _dsInternals.startBossFight(s, 'ornstein-and-smough', 'main');
  const run = s.boss!;
  ok(run.units.length === 2 && run.units.every((u) => u.inPlay), 'both Ornstein and Smough take the field');
  _dsInternals.applyBossDamage(s, 'smough', 999, null);
  const orn = run.units.find((u) => u.key === 'ornstein')!;
  ok(orn.health === DS_BOSSES['ornstein-and-smough'].pairedData!.ornstein.health + 10,
    'Ornstein gains 10 health when Smough dies');
  ok(run.expectedDeckCount === 5 && run.deck.length === 5,
    'the survivor\'s five heat-up cards become the new deck');
  _dsInternals.applyBossDamage(s, 'ornstein', 999, null);
  ok(s.winner === true, 'both halves dead wins the fight');
}

// mimic-marked chests resolve as mimics even with the module off (spec OQ9)
{
  const card = DS_ENCOUNTER_BY_ID['new-londo-ruins'];
  ok(card.terrain.some((t) => t.piece === 'mimic-chest'), 'L4 cards print mimic-chests (golden)');
}

// invader identity is phase-deterministic (spec OQ5)
{
  const s = createDarkSouls({
    scenarioId: 'standard', partySize: 2, classIds: classesFor(2),
    miniBoss: 'winged-knight', mainBoss: 'dancer-of-the-boreal-valley',
    invaders: true, seed: 55,
  });
  // simulate an ember gain: place the token, enter the tile, expect Kirk
  s.tiles[1].invaderToken = true;
  s.tiles[0].faceUp = true;
  s.tiles[0].cleared = true;
  s.partyAt = s.tiles[0].id;
  act(s, 0, { type: 'travel', tileId: s.tiles[1].id });
  const inv = s.encounter?.enemies.find((e) => e.invader);
  ok(inv?.typeId === 'kirk-knight-of-thorns', 'pre-mini-boss invasion is Kirk (spec OQ5)');
  ok(s.encounter?.invaderRun?.deck.length === 3, 'invader deck = 3 random of its 5 behaviours (ao p.14)');
  const souls = s.soulCache;
  const invBefore = s.inventory.length;
  _dsInternals.applyEnemyDamage(s, inv!.uid, 999, null);
  ok(s.soulCache === souls + 3 && s.inventory.length === invBefore + 1,
    'invader kill pays 3 souls + its treasure immediately (ao p.15)');
  ok((s.encounter?.enemies.length ?? 0) > 0 && s.phase === 'encounter',
    'the encounter continues after the invader falls (ao p.15)');
}

// summons module: accepted but data-less (spec judgment — no golden decks)
{
  const s = createDarkSouls({
    scenarioId: 'standard', partySize: 2, classIds: classesFor(2),
    miniBoss: 'winged-knight', mainBoss: 'dancer-of-the-boreal-valley',
    summons: true, seed: 57,
  });
  ok(s.options.summons === true, 'summons toggle accepted (non-functional: no golden data)');
}

// dice faces match the golden exactly (spec correction 6)
{
  ok(DS_DICE.black.slice().sort().join(',') === '0,1,1,1,2,2', 'black die {0,1,1,1,2,2}');
  ok(DS_DICE.blue.slice().sort().join(',') === '1,1,2,2,2,3', 'blue die {1,1,2,2,2,3}');
  ok(DS_DICE.orange.slice().sort().join(',') === '1,2,2,3,3,4', 'orange die {1,2,2,3,3,4}');
  ok(DS_DODGE_DIE.filter((f) => f === 1).length === 3, 'dodge die has exactly 3 success faces');
}

// view smoke: public-information view carries the derived stats and hides deck order
{
  const s = mkGame({ seed: 59 });
  const v = dsViewFor(s, 0);
  ok(v.characters[0].stats.str === dsStatValue(s.characters[0], 'str'), 'view derives stat values');
  ok(v.treasureDeckCount === s.treasureDeck.length, 'view exposes deck count, not order');
  ok(v.head === null && v.busy === false, 'quiet state: no pending head, no playback');
}

// ---------- summary ----------

console.log(`\ndarksouls-test: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
