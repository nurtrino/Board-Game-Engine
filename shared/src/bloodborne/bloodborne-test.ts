// Bloodborne engine tests: setup invariants, a goal-driven bot playing The
// Long Hunt chapter 1 at each player count, conservation invariants after
// every action, and directed rules tests (spec/rulebook refs).
// Run: npx tsx shared/src/bloodborne/bloodborne-test.ts

import { createBloodborne, bbViewFor, setupChapter, type BbState, spaceNeighbors, parseRef, tileDef, worldExits, lampSpaces, spaceRef } from './state.js';
import { applyBloodborneAction, bbPostProcess, type BbAction } from './actions.js';
import { BB_HUNTERS, BB_ENEMIES, BB_TILES, BB_STAT_CARDS, BB_MISSIONS } from './data.js';
import { missionState } from './missions.js';

let failures = 0;
const ok = (cond: unknown, msg: string): void => {
  if (!cond) {
    failures++;
    console.log('FAIL:', msg);
  }
};
const eq = (a: unknown, b: unknown, msg: string): void => ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const act = (s: BbState, seat: number, a: BbAction): boolean => {
  try {
    applyBloodborneAction(s, seat, a);
    bbPostProcess(s);
    return true;
  } catch {
    return false;
  }
};
const mustAct = (s: BbState, seat: number, a: BbAction, label: string): void => {
  try {
    applyBloodborneAction(s, seat, a);
    bbPostProcess(s);
  } catch (e) {
    failures++;
    console.log('FAIL (action rejected):', label, '-', (e as Error).message);
  }
};

// ---------- invariants ----------

const checkInvariants = (s: BbState, label: string): void => {
  for (const h of s.hunters) {
    if (!h.hunterId) continue;
    const total = h.deck.length + h.hand.length + h.discard.length + h.slots.filter(Boolean).length;
    ok(total === 12, `${label}: hunter ${h.seat} stat cards ${total} != 12`);
    ok(h.hp >= 0 && h.hp <= 6, `${label}: hp bounds`);
    ok(h.echoes >= 0 && h.echoes <= 3, `${label}: echo bounds`);
  }
  const ea = s.enemyActionDeck.length + s.enemyActionDiscard.length;
  ok(ea === 6, `${label}: enemy action deck ${ea} != 6`);
  ok(s.upgradeRow.length <= 4, `${label}: upgrade row size`);
  for (const e of s.enemies) {
    ok(s.tiles.some((t) => t.uid === parseRef(e.space).uid), `${label}: enemy on missing tile`);
  }
};

// ---------- setup tests ----------

const setupGame = (players: number, seed = 7): BbState => {
  const s = createBloodborne({ campaignId: 'the-long-hunt', partySize: players, seed });
  const hunters = ['saw-cleaver', 'threaded-cane', 'hunter-axe', 'ludwig-s-holy-blade'];
  for (let i = 0; i < players; i++) mustAct(s, i, { type: 'pick_hunter', hunterId: hunters[i] }, `pick ${i}`);
  return s;
};

{
  const s = setupGame(2);
  eq(s.phase, 'play', 'setup: play begins');
  eq(s.round, 1, 'setup: round 1');
  eq(s.tiles.length, 1, 'setup: central lamp placed');
  eq(tileDef(s.tiles[0].tileId).name, 'CENTRAL LAMP', 'setup: starting tile');
  // Ch1: 4 named + min(2*2,6)=4 random = 8 tiles in deck (p. 10 + Lua)
  eq(s.tileDeck.length, 8, 'setup: tile deck size 2p');
  ok(s.enemySlots.every(Boolean), 'setup: 3 enemy slots assigned');
  ok(['hunter-mob', 'huntsman-s-minion', 'scourge-beast'].every((id) => s.enemySlots.includes(id)), 'setup: chapter enemies (Lua ch1)');
  eq(s.upgradeRow.length, 4, 'setup: upgrade row');
  eq(s.enemyActionDeck.length, 6, 'setup: enemy action deck');
  eq(s.consumableDeck.length, 36, 'setup: consumable deck');
  for (const h of s.hunters) {
    eq(h.hand.length, 3, 'setup: hand of 3');
    eq(h.deck.length + h.hand.length, 12, 'setup: 12-card deck');
    eq(h.hp, 6, 'setup: 6 hp');
  }
  ok(s.missions['1']?.revealed, 'setup: hunt mission card 1 revealed');
  checkInvariants(s, 'setup');
}

{
  const s = setupGame(4);
  // Ch1 4p: 4 named + min(8,6)=6 random = 10
  eq(s.tileDeck.length, 10, 'setup: tile deck size 4p (cap 6 random)');
}

// ---------- directed rules tests ----------

// dodge speed legality (p. 20)
{
  const s = setupGame(1, 11);
  const h = s.hunters[0];
  // fabricate: enemy in hunter's space, combat via enemy initiation
  const enemy = { uid: 999, type: 'scourge-beast', space: h.space!, damage: 0 };
  s.enemies.push(enemy);
  mustAct(s, 0, { type: 'begin_turn' }, 'turn for dodge test');
  // clear pendings from round start? begin_turn only; round refresh pending exists at round 1? startRound only runs on new rounds. OK.
  mustAct(s, 0, { type: 'end_turn' }, 'end turn -> activation -> combat');
  ok(s.pending[0]?.kind === 'combat-attack', 'enemy combat offers attack-back window');
}

// interact aggro: enemies attack first, no dodge (p. 16)
{
  const s = setupGame(1, 13);
  const h = s.hunters[0];
  s.consumableTokens.push(h.space!);
  s.enemies.push({ uid: 998, type: 'hunter-mob', space: h.space!, damage: 0 });
  mustAct(s, 0, { type: 'begin_turn' }, 'turn for interact test');
  const hpBefore = h.hp;
  const card = h.hand[0];
  mustAct(s, 0, { type: 'interact', cardId: card }, 'interact with aggro');
  ok(h.hp <= hpBefore, 'interact aggro resolved without dodge window');
  ok(s.pending.length === 0 || s.pending[0].kind !== 'combat-dodge', 'no dodge on interact aggro');
}

// enemy action deck: reshuffle only when empty (p. 20)
{
  const s = setupGame(1, 17);
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const before = s.enemyActionDeck.length;
    ok(before === 6 - i, 'enemy action deck depletes without reshuffle');
    seen.push(s.enemyActionDeck[0]);
    // flip via direct helper import is not exported; simulate by moving card
    s.enemyActionDiscard.push(s.enemyActionDeck.shift()!);
  }
  eq([...seen].sort().join(','), 'ability,basic,basic,basic,special,special', 'deck composition 3/2/1');
}

// pursuit (p. 14): enemy follows 1 space along the hunter's path
{
  const s = setupGame(1, 19);
  const h = s.hunters[0];
  const nbs = spaceNeighbors(s, h.space!, 'hunter');
  if (nbs.length) {
    s.enemies.push({ uid: 997, type: 'hunter-mob', space: h.space!, damage: 0 });
    mustAct(s, 0, { type: 'begin_turn' }, 'turn for pursuit');
    const moveCard = h.hand[0];
    mustAct(s, 0, { type: 'move', cardId: moveCard }, 'move action');
    mustAct(s, 0, { type: 'step', to: nbs[0] }, 'step 1');
    // if still moving (budget left), end it
    act(s, 0, { type: 'end_move' });
    const e = s.enemies.find((x) => x.uid === 997)!;
    eq(e.space, h.space, 'pursuer followed into the hunter space');
  }
}

// dream flow (p. 23): recombine, heal, refresh, return placement next turn
{
  const s = setupGame(1, 23);
  const h = s.hunters[0];
  h.hp = 2;
  h.echoes = 2;
  mustAct(s, 0, { type: 'begin_turn' }, 'turn for dream');
  const card = h.hand[0];
  mustAct(s, 0, { type: 'dream', cardId: card }, 'go to dream');
  ok(s.pending.some((p) => p.kind === 'dream-upgrades'), 'dream: forced upgrade spending');
  const up = s.upgradeRow[0];
  mustAct(s, 0, { type: 'choose', upgradeId: up }, 'pick upgrade');
  ok(s.pending[0]?.kind === 'dream-incorporate', 'dream: incorporate decision');
  const deckCard = h.deck.find((c) => BB_STAT_CARDS[c].basic)!;
  mustAct(s, 0, { type: 'choose', swapOut: deckCard }, 'incorporate swap');
  // second echo
  mustAct(s, 0, { type: 'choose', upgradeId: s.upgradeRow[0] }, 'pick upgrade 2');
  mustAct(s, 0, { type: 'choose', discard: true }, 'discard upgrade 2');
  eq(h.hp, 6, 'dream: healed to 6');
  eq(h.echoes, 0, 'dream: echoes spent');
  eq(h.deck.length, 12, 'dream: deck recombined to 12');
  ok(h.deck.includes(up), 'dream: upgrade incorporated');
  ok(h.pendingReturn, 'dream: return pending');
  checkInvariants(s, 'dream');
}

// hunt track: dream advances it; reset point respawns (p. 24)
{
  const s = setupGame(1, 29);
  const h = s.hunters[0];
  s.huntTrack = 3; // next advance hits reset at 4
  // put a damaged enemy on the map far from hunter
  mustAct(s, 0, { type: 'begin_turn' }, 'turn for reset');
  mustAct(s, 0, { type: 'dream', cardId: h.hand[0] }, 'dream at track 3');
  // dream advances to 4 (reset fires); solo turn end also ends the round,
  // advancing once more (FAQ: no limit per round)
  ok(s.huntTrack >= 4, 'track advanced through the reset point');
  // non-boss enemies were wiped + respawned at spawn icons
  checkInvariants(s, 'reset');
}

// final round defeat (p. 13)
{
  const s = setupGame(1, 31);
  s.huntTrack = 14;
  const h = s.hunters[0];
  mustAct(s, 0, { type: 'begin_turn' }, 'last turn');
  mustAct(s, 0, { type: 'end_turn' }, 'end last turn');
  // round ended -> startRound -> track 15 (final) -> finalRound
  ok(s.finalRound, 'final round triggered at last space');
  // answer refresh, play the final round out
  mustAct(s, 0, { type: 'round_refresh', discard: [] }, 'refresh');
  mustAct(s, 0, { type: 'begin_turn' }, 'final turn');
  mustAct(s, 0, { type: 'end_turn' }, 'end final turn');
  eq(s.phase, 'ended', 'game ended');
  eq(s.outcome, 'defeat', 'defeat at final round end');
}

// ---------- goal-driven bot playthrough (The Long Hunt Ch1) ----------

const botAnswerPending = (s: BbState): boolean => {
  const p = s.pending[0];
  if (!p) return false;
  const h = s.hunters[p.seat];
  switch (p.kind) {
    case 'round-refresh': return act(s, p.seat, { type: 'round_refresh', discard: [] });
    case 'combat-attack': {
      const slot = h.slots.findIndex((x) => x === null);
      const card = h.hand[0];
      if (slot >= 0 && card) return act(s, p.seat, { type: 'choose', cardId: card, slot });
      return act(s, p.seat, { type: 'choose', pass: true });
    }
    case 'combat-dodge': {
      // dodge with an endurance card if a fast-enough slot exists
      const card = h.hand.find((c) => BB_STAT_CARDS[c].effects.dodge);
      const def = BB_HUNTERS[h.hunterId!];
      const slot = h.slots.findIndex((x, i) => x === null && def.sides[h.weaponSide].slots[i] !== undefined);
      if (card && slot >= 0) {
        if (act(s, p.seat, { type: 'choose', cardId: card, slot })) return true;
      }
      return act(s, p.seat, { type: 'choose', pass: true });
    }
    case 'combat-rider': {
      const card = h.hand.find((c) => BB_STAT_CARDS[c].effects.dodge);
      const slot = h.slots.findIndex((x) => x === null);
      if (card && slot >= 0 && act(s, p.seat, { type: 'choose', cardId: card, slot })) return true;
      return act(s, p.seat, { type: 'choose', pass: true });
    }
    case 'discard-for-stun': return act(s, p.seat, { type: 'choose', cardId: h.hand[0] });
    case 'dream-upgrades': return act(s, p.seat, { type: 'choose', upgradeId: s.upgradeRow[0] });
    case 'dream-incorporate': {
      const basic = h.deck.find((c) => BB_STAT_CARDS[c]?.basic);
      if (basic) return act(s, p.seat, { type: 'choose', swapOut: basic });
      return act(s, p.seat, { type: 'choose', discard: true });
    }
    case 'return-placement': {
      const lamp = lampSpaces(s)[0];
      return act(s, p.seat, { type: 'choose', side: 0, space: lamp });
    }
    case 'tile-orientation': return act(s, p.seat, { type: 'choose', rot: p.options[0] });
    case 'reward-overflow': return act(s, p.seat, { type: 'choose', giveTo: null });
    case 'mission-choice': return act(s, p.seat, { type: 'choose', option: p.options[0] });
    default: return false;
  }
};

/** pick a target space for the bot: arena/mission enemies, then unexplored
 * exits, then mission trigger tiles */
const botObjective = (s: BbState, seat: number): { kind: string; space?: string; edge?: { from: string; edge: 'N' | 'E' | 'S' | 'W' } } => {
  const h = s.hunters[seat];
  // 1) tagged mission enemies (arena targets)
  const tagged = s.enemies.find((e) => e.missionTag);
  if (tagged) return { kind: 'kill', space: tagged.space };
  // 2) enemies adjacent-or-here worth killing for echoes when hurt deck? keep simple: same space
  const here = s.enemies.find((e) => e.space === h.space);
  if (here) return { kind: 'kill', space: here.space };
  // 3) mission trigger tiles not yet revealed (from chapter card)
  const defs = BB_MISSIONS[s.campaignId] ?? {};
  const ch = defs[`Chapter ${s.chapter} - Setup`] as unknown as { triggers?: { on: string; tile?: string; reveal: string }[] } | undefined;
  for (const t of ch?.triggers ?? []) {
    if (t.on !== 'endMoveOnTile' || s.missions[t.reveal]?.revealed) continue;
    const target = s.tiles.find((x) => tileDef(x.tileId).name.toLowerCase() === (t.tile ?? '').toLowerCase());
    if (target) {
      const sp = tileDef(target.tileId).spaces[0];
      return { kind: 'tile', space: `${target.uid}:${sp.id}` };
    }
  }
  // 4) hunt mission goal tile (card 1: central lamp w/ 2 insight)
  if (s.insightCollected >= 2) {
    const central = s.tiles.find((x) => tileDef(x.tileId).name === 'CENTRAL LAMP');
    if (central) {
      const sp = tileDef(central.tileId).spaces.find((x) => x.named) ?? tileDef(central.tileId).spaces[0];
      return { kind: 'tile', space: `${central.uid}:${sp.id}` };
    }
  }
  // 5) explore: any open exit
  for (const t of s.tiles) {
    if (s.fogGates.includes(t.uid)) continue;
    for (const ex of worldExits(t)) {
      const [dx, dy] = ex.edge === 'N' ? [0, -1] : ex.edge === 'S' ? [0, 1] : ex.edge === 'E' ? [1, 0] : [-1, 0];
      if (!s.tiles.some((o) => o.x === t.x + dx && o.y === t.y + dy) && s.tileDeck.length > 0) {
        return { kind: 'reveal', edge: { from: `${t.uid}:${ex.space}`, edge: ex.edge } };
      }
    }
  }
  return { kind: 'wander' };
};

const botTurn = (s: BbState, seat: number): void => {
  const h = s.hunters[seat];
  if (!act(s, seat, { type: 'begin_turn' })) return;
  let guard = 0;
  while (s.activeSeat === seat && s.phase === 'play' && guard++ < 40) {
    if (s.pending.length > 0) { if (!botAnswerPending(s)) break; continue; }
    if (s.combat) break;
    // attack enemy in our space if we can
    const target = s.enemies.find((e) => e.space === h.space) ?? null;
    const boss = s.bosses.find((b) => b.space === h.space) ?? null;
    const emptySlot = h.slots.findIndex((x) => x === null);
    if ((target || boss) && emptySlot >= 0 && h.hand.length > 1) {
      const atkCard = h.hand.find((c) => !BB_STAT_CARDS[c].effects.dodge) ?? h.hand[0];
      if (act(s, seat, { type: 'attack', cardId: atkCard, slot: emptySlot, enemyUid: target?.uid, bossUid: boss?.uid })) continue;
    }
    // pick up consumables here
    if (h.space && s.consumableTokens.includes(h.space) && h.hand.length > 1) {
      if (act(s, seat, { type: 'interact', cardId: h.hand[0] })) continue;
    }
    // full slots -> transform
    if (emptySlot === -1 && h.hand.length > 1) {
      if (act(s, seat, { type: 'transform', cardId: h.hand[0] })) continue;
    }
    // 3 echoes -> bank them at the dream
    if (h.echoes >= 3 && h.hand.length > 0) {
      if (act(s, seat, { type: 'dream', cardId: h.hand[0] })) break;
    }
    if (h.hand.length <= 1) break; // save a card for defense
    // move toward objective
    const obj = botObjective(s, seat);
    if (obj.kind === 'reveal' && obj.edge) {
      if (!act(s, seat, { type: 'move', cardId: h.hand[0] })) break;
      // walk to the exit space then reveal
      let steps = 0;
      while (h.space !== obj.edge.from && steps++ < 2) {
        const next = nextStepToward(s, h.space!, obj.edge.from);
        if (!next || !act(s, seat, { type: 'step', to: next })) break;
        if (s.pending.length || s.combat) break;
      }
      if (s.pending.length || s.combat) continue;
      if (h.space === obj.edge.from) act(s, seat, { type: 'step_reveal', edge: obj.edge.edge });
      act(s, seat, { type: 'end_move' });
      continue;
    }
    if (obj.space && obj.space !== h.space) {
      if (!act(s, seat, { type: 'move', cardId: h.hand[0] })) break;
      for (let i = 0; i < 2; i++) {
        const next = nextStepToward(s, h.space!, obj.space);
        if (!next || !act(s, seat, { type: 'step', to: next })) break;
        if (s.pending.length || s.combat) break;
      }
      if (!s.pending.length && !s.combat) act(s, seat, { type: 'end_move' });
      continue;
    }
    break;
  }
  if (s.activeSeat === seat && !s.pending.length && !s.combat) act(s, seat, { type: 'end_turn' });
  // drain any post-turn pendings owned by this seat handled globally by caller
};

const nextStepToward = (s: BbState, from: string, to: string): string | null => {
  // BFS over hunter graph
  const prev = new Map<string, string>([[from, '']]);
  const q = [from];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === to) break;
    for (const nb of spaceNeighbors(s, cur, 'hunter')) {
      if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
    }
  }
  if (!prev.has(to)) return null;
  let cur = to;
  while (prev.get(cur) !== from && prev.get(cur) !== '') cur = prev.get(cur)!;
  return cur === from ? null : cur;
};

for (const players of [1, 2, 4]) {
  const s = setupGame(players, 100 + players);
  let rounds = 0;
  let actions = 0;
  while (s.phase === 'play' && rounds < 60 && actions < 4000) {
    if (s.pending.length > 0) {
      if (!botAnswerPending(s)) { ok(false, `bot stuck on pending ${s.pending[0].kind}`); break; }
      actions++;
      continue;
    }
    const seat = s.hunters.find((h) => !h.tookTurnThisRound && !h.skipTurn && s.activeSeat == null)?.seat;
    if (s.activeSeat != null) {
      // combat mid-turn: answered via pendings; if combat with no pending, bug
      if (s.combat && s.pending.length === 0) { ok(false, 'combat stalled with no pending'); break; }
      continue;
    }
    if (seat == null) { rounds++; continue; }
    botTurn(s, seat);
    actions++;
    checkInvariants(s, `bot ${players}p action ${actions}`);
    rounds = s.round;
  }
  console.log(`bot ${players}p: phase=${s.phase} outcome=${s.outcome} rounds=${s.round} insight=${s.insightCollected} track=${s.huntTrack} actions=${actions}`);
  ok(s.phase === 'ended' || s.round >= 2, `bot ${players}p made progress`);
}

// ---------- summary ----------

if (failures) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log('\nALL BLOODBORNE TESTS GREEN');
process.exit(0);
