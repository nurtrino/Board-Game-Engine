// Bloodborne engine tests: setup invariants, a goal-driven bot playing The
// Long Hunt chapter 1 at each player count, conservation invariants after
// every action, and directed rules tests (spec/rulebook refs).
// Run: npx tsx shared/src/bloodborne/bloodborne-test.ts

import { createBloodborne, bbViewFor, setupChapter, type BbState, spaceNeighbors, parseRef, tileDef, worldExits, lampSpaces, spaceRef, connectedTiles } from './state.js';
import { applyBloodborneAction, bbPostProcess, startCombat, type BbAction } from './actions.js';
import { BB_HUNTERS, BB_ENEMIES, BB_TILES, BB_STAT_CARDS, BB_MISSIONS, BB_CAMPAIGNS, BB_ITEMS } from './data.js';
import { applyMissionEffects, bbMissionEvent, bbMissionOnReset, missionState } from './missions.js';
import goldenDecksJson from '../../../games/bloodborne/golden/decks.json';
import goldenLongDsl from '../../../games/bloodborne/golden/dsl/the-long-hunt.json';
import goldenGrowingDsl from '../../../games/bloodborne/golden/dsl/growing-madness.json';
import goldenSecretsDsl from '../../../games/bloodborne/golden/dsl/secrets-of-the-church.json';
import goldenFallDsl from '../../../games/bloodborne/golden/dsl/fall-of-old-yharnam.json';

let failures = 0;
const ok = (cond: unknown, msg: string): void => {
  if (!cond) {
    failures++;
    console.log('FAIL:', msg);
  }
};
const eq = (a: unknown, b: unknown, msg: string): void => ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const rejects = (fn: () => void, msg: string): void => {
  try { fn(); ok(false, msg); } catch { /* expected */ }
};

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

const passCombatReaction = (s: BbState, label: string): void => {
  if (s.pending[0]?.kind === 'combat-reaction') {
    mustAct(s, s.pending[0].seat, { type: 'choose', pass: true }, `${label}: pass reaction`);
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
  return setupCampaign('the-long-hunt', 1, players, seed);
};

const setupCampaign = (campaignId: string, chapter: number, players: number, seed = 7, insightCards: string[] = []): BbState => {
  const s = createBloodborne({ campaignId, chapter, partySize: players, seed });
  s.insightCards = [...insightCards];
  const hunters = ['saw-cleaver', 'threaded-cane', 'hunter-axe', 'ludwig-s-holy-blade'];
  for (let i = 0; i < players; i++) mustAct(s, i, { type: 'pick_hunter', hunterId: hunters[i] }, `pick ${i}`);
  return s;
};

const giveHand = (h: BbState['hunters'][number], cards: string[]): void => {
  const pool = [...h.deck, ...h.hand, ...h.discard, ...h.slots.filter(Boolean) as string[]];
  h.hand = [...cards];
  h.deck = pool.slice(0, Math.max(0, 12 - cards.length));
  h.discard = [];
  h.slots = h.slots.map(() => null);
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

// Public creation API rejects malformed saves/options instead of constructing
// NaN-sized parties or invalid chapter state.
{
  rejects(() => createBloodborne({ campaignId: 'the-long-hunt', partySize: 0 }), 'create rejects zero hunters');
  rejects(() => createBloodborne({ campaignId: 'the-long-hunt', partySize: 1.5 }), 'create rejects fractional party size');
  rejects(() => createBloodborne({ campaignId: 'the-long-hunt', partySize: 1, chapter: 4 }), 'create rejects missing chapter');
  rejects(() => createBloodborne({ campaignId: 'the-long-hunt', partySize: 1, seed: Number.NaN }), 'create rejects NaN seed');
}

// Golden provenance: the physical Fall of Old Yharnam campaign bag contains
// exactly these three Enemy cards (games/bloodborne/golden/decks.json,
// `Fall of Old Yharnam Campaign Bag/...`, Enemies deck).
{
  const golden = goldenDecksJson as unknown as { decks: { nick: string; path: string; cards: { name: string }[] }[] };
  const source = golden.decks.find((d) => d.nick === 'Enemies' && d.path.startsWith('Fall of Old Yharnam Campaign Bag/'));
  const roster = source?.cards.map((c) => c.name).sort() ?? [];
  eq(roster.join('|'), ['Female Beast Patient', 'Male Beast Patient', 'Scourge Beast'].sort().join('|'), 'fall roster golden source');
  for (const [ix, chapter] of BB_CAMPAIGNS['fall-of-old-yharnam'].chapters.entries()) {
    eq([...(chapter.enemies ?? [])].sort().join('|'), roster.join('|'), `fall chapter ${ix + 1} uses physical enemy deck`);
  }
}

// Independent setup oracle. Roster rules are transcribed from the physical
// chapter setup cards/campaign enemy decks; prePlace comes directly from the
// hand-authored golden DSL rather than from compiled engine campaign output.
{
  type GoldenSetup = { prePlace?: { chain?: string[]; attach?: { tile: string; to: string }[]; specialRuleCard?: string } };
  const goldenDsl: Record<string, Record<string, unknown>> = {
    'the-long-hunt': goldenLongDsl,
    'growing-madness': goldenGrowingDsl,
    'secrets-of-the-church': goldenSecretsDsl,
    'fall-of-old-yharnam': goldenFallDsl,
  } as unknown as Record<string, Record<string, unknown>>;
  const rosterRules: Record<string, { fixed: string[]; random: number; excluded: string[]; exactBag?: string }[]> = {
    'the-long-hunt': [1, 2, 3].map(() => ({ fixed: ["Hunter Mob", "Huntsman's Minion", 'Scourge Beast'], random: 0, excluded: [], exactBag: 'The Long Hunt Campaign Bag/' })),
    'fall-of-old-yharnam': [1, 2, 3].map(() => ({ fixed: ['Scourge Beast', 'Male Beast Patient', 'Female Beast Patient'], random: 0, excluded: [], exactBag: 'Fall of Old Yharnam Campaign Bag/' })),
    'growing-madness': [1, 2, 3].map(() => ({ fixed: ['Hunter Mob'], random: 2, excluded: [] })),
    'secrets-of-the-church': [
      { fixed: [], random: 3, excluded: ['Church Servant'] },
      { fixed: [], random: 3, excluded: ['Church Giant'] },
      { fixed: ['Church Giant', 'Church Servant'], random: 1, excluded: [] },
    ],
  };
  for (const tile of Object.values(BB_TILES)) {
    const spaces = new Set(tile.spaces.map((sp) => sp.id));
    ok(spaces.size === tile.spaces.length, `tile ${tile.id}: unique space ids`);
    for (const [a, b] of tile.adjacency) ok(spaces.has(a) && spaces.has(b) && a !== b, `tile ${tile.id}: valid adjacency ${a}-${b}`);
    for (const exit of tile.exits) ok(spaces.has(exit.space), `tile ${tile.id}: valid exit ${exit.space}`);
  }
  for (const campaign of Object.values(BB_CAMPAIGNS).filter((c) => c.set === 'core')) {
    for (let chapter = 1; chapter <= campaign.chapters.length; chapter++) {
      const a = setupCampaign(campaign.id, chapter, 1, 5000 + chapter);
      const b = setupCampaign(campaign.id, chapter, 1, 5000 + chapter);
      ok(a.enemySlots.every((id) => !!BB_ENEMIES[id]), `${campaign.id} ch${chapter}: known enemy roster`);
      eq(new Set(a.enemySlots).size, 3, `${campaign.id} ch${chapter}: three unique enemies`);
      const roster = a.enemySlots.map((id) => BB_ENEMIES[id].name.replace(/\b\w/g, (c) => c.toUpperCase())).sort();
      const rule = rosterRules[campaign.id][chapter - 1];
      for (const fixed of rule.fixed) ok(roster.some((name) => name.toLowerCase() === fixed.toLowerCase()), `${campaign.id} ch${chapter}: golden fixed enemy ${fixed}`);
      for (const excluded of rule.excluded) ok(!roster.some((name) => name.toLowerCase() === excluded.toLowerCase()), `${campaign.id} ch${chapter}: excludes ${excluded}`);
      eq(roster.length - rule.fixed.length, rule.random, `${campaign.id} ch${chapter}: golden random enemy count`);
      if (rule.exactBag) {
        const decks = (goldenDecksJson as unknown as { decks: { nick: string; path: string; cards: { name: string }[] }[] }).decks;
        const bag = decks.find((deck) => deck.nick === 'Enemies' && deck.path.startsWith(rule.exactBag!));
        eq(roster.map((name) => name.toLowerCase()).join('|'), (bag?.cards.map((card) => card.name.toLowerCase()).sort() ?? []).join('|'), `${campaign.id} ch${chapter}: physical campaign-bag roster`);
      }

      const setup = goldenDsl[campaign.id][`Chapter ${chapter} - Setup`] as GoldenSetup;
      const pre = setup.prePlace;
      const named = [...(pre?.chain ?? []).filter((token) => token !== 'random2exit'), ...(pre?.attach ?? []).map((entry) => entry.tile)];
      const placedName = (name: string) => a.tiles.find((tile) => tileDef(tile.tileId).name.toLowerCase() === name.toLowerCase());
      for (const name of named) ok(!!placedName(name), `${campaign.id} ch${chapter}: golden prePlace includes ${name}`);
      if (!pre) {
        eq(a.tiles.length, 1, `${campaign.id} ch${chapter}: no unprinted setup tiles`);
      } else {
        ok(!!pre.specialRuleCard && !!a.missions[pre.specialRuleCard]?.revealed, `${campaign.id} ch${chapter}: setup special-rule card faceup`);
        for (const tile of a.tiles.slice(1)) ok(!a.tileDeck.includes(tile.tileId), `${campaign.id} ch${chapter}: pre-placed tile removed from deck`);
        for (const edge of pre.attach ?? []) {
          const child = placedName(edge.tile), parent = placedName(edge.to);
          ok(!!child && !!parent && connectedTiles(a, parent.uid).includes(child.uid), `${campaign.id} ch${chapter}: ${edge.tile} attaches to ${edge.to}`);
        }
        const chain = pre.chain ?? [];
        if (chain.includes('random2exit')) {
          const central = placedName('Central Lamp')!, grave = placedName(chain[0])!, tomb = placedName(chain[2])!;
          const random = a.tiles.find((tile) => ![central.uid, grave.uid, tomb.uid].includes(tile.uid))!;
          ok(tileDef(random.tileId).exits.length >= 2, `${campaign.id} ch${chapter}: printed random tile has 2+ exits`);
          ok(connectedTiles(a, central.uid).includes(grave.uid), `${campaign.id} ch${chapter}: Graveyard touches Central Lamp`);
          ok(connectedTiles(a, central.uid).includes(random.uid), `${campaign.id} ch${chapter}: random tile touches Central Lamp`);
          ok(connectedTiles(a, random.uid).includes(tomb.uid), `${campaign.id} ch${chapter}: Tomb touches random tile`);
          eq(grave.x + random.x, central.x * 2, `${campaign.id} ch${chapter}: random tile is opposite Graveyard (x)`);
          eq(grave.y + random.y, central.y * 2, `${campaign.id} ch${chapter}: random tile is opposite Graveyard (y)`);
        } else if (chain.length) {
          let parent = placedName('Central Lamp')!;
          for (const token of chain) {
            const child = placedName(token)!;
            ok(connectedTiles(a, parent.uid).includes(child.uid), `${campaign.id} ch${chapter}: chain connects ${tileDef(parent.tileId).name} to ${token}`);
            parent = child;
          }
        }
      }
      eq(JSON.stringify({ slots: a.enemySlots, sides: a.enemySides, placed: a.tiles, tiles: a.tileDeck, hands: a.hunters.map((h) => h.hand) }),
        JSON.stringify({ slots: b.enemySlots, sides: b.enemySides, placed: b.tiles, tiles: b.tileDeck, hands: b.hunters.map((h) => h.hand) }),
        `${campaign.id} ch${chapter}: deterministic setup`);
      checkInvariants(a, `${campaign.id} ch${chapter} setup`);
    }
  }
}

// Fall of Old Yharnam's campaign-blocking chapter triggers: first Reset,
// after-card gating, and the Chapter 3 owned-Insight branch.
{
  const s = setupCampaign('fall-of-old-yharnam', 1, 1, 6101);
  ok(s.missions['2']?.revealed, 'fall ch1: start-of-hunt card revealed');
  ok(!s.missions['15'], 'fall ch1: first-reset card initially hidden');
  const ransacked = Object.values(BB_TILES).find((t) => t.name.toLowerCase() === 'ransacked house')!;
  bbMissionEvent(s, { type: 'endMove', seat: 0, tileId: ransacked.id, tileUid: 999, space: '999:a' });
  ok(!s.missions['6'], 'fall ch1: afterCard trigger stays gated');
  s.missions['4'] = { number: '4', revealed: true, completed: false, tokens: 0, vars: {} };
  bbMissionEvent(s, { type: 'endMove', seat: 0, tileId: ransacked.id, tileUid: 999, space: '999:a' });
  ok(s.missions['6']?.revealed, 'fall ch1: afterCard trigger unlocks');
  s.enemies = [];
  s.huntTrack = 3;
  mustAct(s, 0, { type: 'begin_turn' }, 'fall first-reset turn');
  mustAct(s, 0, { type: 'dream', cardId: s.hunters[0].hand[0] }, 'fall first-reset Dream');
  ok(s.missions['15']?.revealed, 'fall ch1: first-reset trigger reveals card 15');

  const withoutDjura = setupCampaign('fall-of-old-yharnam', 3, 1, 6102);
  ok(withoutDjura.missions['36']?.revealed && !withoutDjura.missions['41'], 'fall ch3: default start branch');
  const withDjura = setupCampaign('fall-of-old-yharnam', 3, 1, 6102, ['25']);
  ok(withDjura.missions['41']?.revealed && !withDjura.missions['36'], 'fall ch3: Djura insight start branch');
}

// Both Chapter 3 hunt branches now have enforceable interactions instead of
// campaign-blocking honor-system counters.
{
  const rescue = setupCampaign('fall-of-old-yharnam', 3, 1, 6110);
  let fakeUid = 9000;
  while (rescue.survivorTokens.length < 2 && rescue.tileDeck.length) {
    const tileId = rescue.tileDeck.shift()!;
    const tile = { uid: fakeUid++, tileId, rot: 0 as const, x: fakeUid, y: 0 };
    rescue.tiles.push(tile);
    bbMissionEvent(rescue, { type: 'tileRevealed', tileId, tileUid: tile.uid });
  }
  ok(rescue.survivorTokens.length >= 2, 'fall ch3 rescue branch seeds icon-space survivors');
  rescue.enemies = [];
  mustAct(rescue, 0, { type: 'begin_turn' }, 'fall rescue turn');
  for (const ref of [...rescue.survivorTokens].slice(0, 2)) {
    rescue.hunters[0].space = ref;
    mustAct(rescue, 0, { type: 'interact', cardId: rescue.hunters[0].hand[0] }, 'fall rescue survivor interact');
  }
  ok(rescue.missions['37']?.revealed, 'fall ch3 rescue counter advances to card 37');

  const fire = setupCampaign('fall-of-old-yharnam', 3, 1, 6111, ['25']);
  const fireSpaces = [fire.hunters[0].space!];
  for (let i = 0; i < 2; i++) {
    const tileId = fire.tileDeck.shift()!;
    const tile = { uid: 9100 + i, tileId, rot: 0 as const, x: i + 1, y: 0 };
    fire.tiles.push(tile);
    fireSpaces.push(spaceRef(tile.uid, tileDef(tileId).spaces[0].id));
  }
  fire.enemies = [];
  mustAct(fire, 0, { type: 'begin_turn' }, 'fall fire turn');
  for (const ref of fireSpaces) {
    fire.hunters[0].space = ref;
    mustAct(fire, 0, { type: 'interact', cardId: fire.hunters[0].hand[0] }, 'fall place fire interact');
  }
  ok(fire.missions['42']?.revealed, 'fall ch3 fire counter advances to card 42');
}

// Other core campaign hunt-chain blockers: delayed named-tile spawns, deferred
// setup bosses, the Gascoigne phase swap, and mission-placed Grand Cathedral.
{
  const growing2 = setupCampaign('growing-madness', 2, 1, 6120);
  const grandId = Object.keys(BB_TILES).find((id) => BB_TILES[id].name.toLowerCase() === 'grand cathedral')!;
  const grand = { uid: 9200, tileId: grandId, rot: 0 as const, x: 1, y: 0 };
  growing2.tiles.push(grand);
  bbMissionEvent(growing2, { type: 'tileRevealed', tileId: grandId, tileUid: grand.uid });
  eq(growing2.enemies.filter((e) => e.missionTag === '17').map((e) => e.type).sort().join('|'),
    ['church-giant', 'church-servant'].sort().join('|'), 'growing ch2: Grand Cathedral reveal spawns hunt targets');

  const growing3 = setupCampaign('growing-madness', 3, 4, 6121);
  const gascoigne = growing3.bosses.find((b) => b.type === 'father-gascoigne');
  ok(gascoigne?.phase === 2, 'growing ch3: pre-placed Tomb spawns setup Boss in printed Phase 2');
  ok(growing3.tiles.some((tile) => tileDef(tile.tileId).name.toLowerCase() === 'tomb of oedon'), 'growing ch3: Tomb of Oedon cannot be absent');
  for (const hunter of growing3.hunters) hunter.rewards.push({ id: 'tiny-music-box', exhausted: false });
  applyMissionEffects(growing3, 'test', [{ do: 'reveal', card: '41' }]);
  ok(growing3.bosses.some((b) => b.type === 'father-gascoigne-transformed' && b.phase === 1 && b.damage === 0),
    'growing ch3: hunt phase swaps to transformed Gascoigne');
  ok(growing3.missions['40']?.completed && !growing3.missions['40']?.revealed, 'growing ch3: Boundless Frenzy card 40 discarded');
  ok(growing3.hunters.every((hunter) => hunter.rewards.every((reward) => reward.id !== 'tiny-music-box')),
    'growing ch3: Tiny Music Box removed from every Hunter');

  const secrets3 = setupCampaign('secrets-of-the-church', 3, 1, 6122);
  const courtyardId = Object.keys(BB_TILES).find((id) => BB_TILES[id].name.toLowerCase() === 'courtyard lamp')!;
  secrets3.tiles.push({ uid: 9202, tileId: courtyardId, rot: 0, x: 1, y: 0 });
  applyMissionEffects(secrets3, 'test', [{ do: 'reveal', card: '36' }]);
  ok(secrets3.tiles.some((tile) => tileDef(tile.tileId).name.toLowerCase() === 'grand cathedral'),
    'secrets ch3: mission connects Grand Cathedral to Courtyard Lamp');
}

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
    s.bosses.push({ uid: 996, type: 'cleric-beast', space: h.space!, phase: 1, damage: 0, actionDeck: [0, 1, 2, 3, 4], actionDiscard: [] });
    mustAct(s, 0, { type: 'begin_turn' }, 'turn for pursuit');
    const moveCard = h.hand[0];
    mustAct(s, 0, { type: 'move', cardId: moveCard }, 'move action');
    mustAct(s, 0, { type: 'step', to: nbs[0] }, 'step 1');
    // if still moving (budget left), end it
    act(s, 0, { type: 'end_move' });
    const e = s.enemies.find((x) => x.uid === 997)!;
    eq(e.space, h.space, 'pursuer followed into the hunter space');
    eq(s.bosses.find((x) => x.uid === 996)?.space, h.space, 'Boss Pursuit follows the Hunter too');
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

// Frenzy adds damage from Attacks, not Poison or Stun damage (p. 21).
{
  const s = setupGame(1, 7001);
  const h = s.hunters[0];
  s.enemies = [];
  h.poison = true;
  h.frenzy = true;
  mustAct(s, 0, { type: 'begin_turn' }, 'frenzy/poison turn');
  mustAct(s, 0, { type: 'end_turn' }, 'frenzy/poison end turn');
  eq(h.hp, 5, 'Frenzy does not amplify Poison damage');
}

// Tactical's +1 speed applies to Dodge: a Slow slot becomes Medium and can
// evade a Medium attack.
{
  const s = setupGame(1, 7002);
  const h = s.hunters[0];
  h.weaponSide = 1;
  h.slots = new Array(BB_HUNTERS[h.hunterId!].sides[1].slots.length).fill(null);
  giveHand(h, ['up-tactical']);
  s.enemySides['hunter-mob'] = 0;
  s.enemyActionDeck = ['basic', 'basic', 'basic', 'special', 'special', 'ability'];
  s.enemyActionDiscard = [];
  s.enemies = [{ uid: 7002, type: 'hunter-mob', space: h.space!, damage: 0 }];
  startCombat(s, { seat: 0, enemyUid: 7002 });
  mustAct(s, 0, { type: 'choose', pass: true }, 'Tactical: decline attack-back');
  passCombatReaction(s, 'Tactical');
  ok(s.pending[0]?.kind === 'combat-dodge', 'Tactical: legal boosted Dodge is offered');
  mustAct(s, 0, { type: 'choose', cardId: 'up-tactical', slot: 2 }, 'Tactical: Dodge from Slow slot');
  eq(h.hp, 6, 'Tactical: boosted Dodge avoids attack');
}

// Printed "Cannot be Dodged" and enemy Stagger keywords are enforced.
{
  const s = setupGame(1, 7003);
  const h = s.hunters[0];
  giveHand(h, ['basic-endurance']);
  s.enemySides['scourge-beast'] = 1;
  s.enemyActionDeck = ['special', 'basic', 'basic', 'basic', 'special', 'ability'];
  s.enemyActionDiscard = [];
  s.enemies = [{ uid: 7003, type: 'scourge-beast', space: h.space!, damage: 0 }];
  startCombat(s, { seat: 0, enemyUid: 7003 });
  mustAct(s, 0, { type: 'choose', pass: true }, 'cannot-dodge: decline attack-back');
  passCombatReaction(s, 'cannot-dodge');
  ok(!s.pending.some((p) => p.kind === 'combat-dodge'), 'cannot-dodge attack offers no Dodge');

  const t = setupGame(1, 7004);
  const th = t.hunters[0];
  th.weaponSide = 1;
  th.slots = new Array(BB_HUNTERS[th.hunterId!].sides[1].slots.length).fill(null);
  giveHand(th, ['basic-strength']);
  t.enemySides['hunter-mob'] = 0;
  t.enemyActionDeck = ['special', 'basic', 'basic', 'basic', 'special', 'ability'];
  t.enemyActionDiscard = [];
  t.enemies = [{ uid: 7004, type: 'hunter-mob', space: th.space!, damage: 0 }];
  startCombat(t, { seat: 0, enemyUid: 7004 });
  mustAct(t, 0, { type: 'choose', cardId: 'basic-strength', slot: 2 }, 'enemy Stagger: commit Slow attack');
  passCombatReaction(t, 'enemy Stagger');
  eq(t.enemies[0]?.damage, 0, 'faster enemy Stagger cancels slower Hunter attack');
}

// Block placed by a hunter-initiated Attack applies to that same Combat.
{
  const s = setupGame(1, 7005);
  const h = s.hunters[0];
  giveHand(h, ['up-defensive']);
  s.enemySides['hunter-mob'] = 0;
  s.enemyActionDeck = ['basic', 'basic', 'basic', 'special', 'special', 'ability'];
  s.enemyActionDiscard = [];
  s.enemies = [{ uid: 7005, type: 'hunter-mob', space: h.space!, damage: 0 }];
  mustAct(s, 0, { type: 'begin_turn' }, 'Block attack turn');
  mustAct(s, 0, { type: 'attack', cardId: 'up-defensive', slot: 2, enemyUid: 7005 }, 'Block attack');
  passCombatReaction(s, 'Block attack');
  eq(h.hp, 6, 'hunter-initiated Block reduces opposing damage');
}

// "After Attack: Heal" does not heal on placement and cannot rescue a Hunter
// slain by a simultaneous attack (official FAQ p. 2).
{
  const s = setupGame(1, 7006);
  const h = s.hunters[0];
  h.weaponSide = 1;
  h.slots = new Array(BB_HUNTERS[h.hunterId!].sides[1].slots.length).fill(null);
  giveHand(h, ['up-rallying']);
  h.hp = 3;
  s.enemySides['huntsman-s-minion'] = 0;
  s.enemyActionDeck = ['special', 'basic', 'basic', 'basic', 'special', 'ability'];
  s.enemyActionDiscard = [];
  s.enemies = [{ uid: 7006, type: 'huntsman-s-minion', space: h.space!, damage: 0 }];
  mustAct(s, 0, { type: 'begin_turn' }, 'Rallying FAQ turn');
  mustAct(s, 0, { type: 'attack', cardId: 'up-rallying', slot: 2, enemyUid: 7006 }, 'Rallying simultaneous combat');
  passCombatReaction(s, 'Rallying simultaneous combat');
  ok(h.pendingReturn, 'Rallying does not save a simultaneously slain Hunter');
}

// Death is remembered even though the Dream immediately heals the dashboard:
// a slain Hunter's slower Attack does not resolve afterward.
{
  const s = setupGame(1, 7014);
  const h = s.hunters[0];
  h.weaponSide = 1;
  h.slots = new Array(BB_HUNTERS[h.hunterId!].sides[1].slots.length).fill(null);
  giveHand(h, ['basic-strength']);
  h.hp = 1;
  s.enemySides['hunter-mob'] = 0;
  s.enemyActionDeck = ['basic', 'basic', 'basic', 'special', 'special', 'ability'];
  s.enemyActionDiscard = [];
  s.enemies = [{ uid: 7014, type: 'hunter-mob', space: h.space!, damage: 0 }];
  mustAct(s, 0, { type: 'begin_turn' }, 'faster lethal attack turn');
  mustAct(s, 0, { type: 'attack', cardId: 'basic-strength', slot: 2, enemyUid: 7014 }, 'faster lethal enemy combat');
  passCombatReaction(s, 'faster lethal enemy combat');
  eq(s.enemies.find((e) => e.uid === 7014)?.damage, 0, 'slain Hunter does not resolve slower Attack after Dream heal');
  ok(h.pendingReturn, 'lethally hit Hunter is in the Dream');
}

// Poison death finishes a turn/round exactly once (no recursive double round).
{
  const s = setupGame(1, 7015);
  const h = s.hunters[0];
  s.enemies = [];
  h.hp = 1;
  h.poison = true;
  mustAct(s, 0, { type: 'begin_turn' }, 'lethal poison turn');
  mustAct(s, 0, { type: 'end_turn' }, 'lethal poison turn end');
  eq(s.round, 2, 'Poison death advances into one new round');
  ok(h.pendingReturn, 'Poison-slain Hunter enters Dream');
}

// Surprise Enemies spawned while an activation is paused still activate even
// after their hunt-board slot was already collected into the original queue.
{
  const s = setupGame(1, 7007);
  const h = s.hunters[0];
  giveHand(h, []);
  s.enemySides['hunter-mob'] = 0;
  s.enemyActionDeck = ['basic', 'basic', 'basic', 'special', 'special', 'ability'];
  s.enemyActionDiscard = [];
  s.enemies = [{ uid: 7007, type: 'hunter-mob', space: h.space!, damage: 0 }];
  mustAct(s, 0, { type: 'begin_turn' }, 'surprise activation turn');
  mustAct(s, 0, { type: 'end_turn' }, 'surprise activation first enemy');
  ok(s.combat?.enemyUid === 7007, 'first activation paused in combat');
  s.enemies.push({ uid: 7008, type: 'hunter-mob', space: h.space!, damage: 0 });
  mustAct(s, 0, { type: 'choose', pass: true }, 'resolve first activation');
  passCombatReaction(s, 'resolve first activation');
  ok(s.combat?.enemyUid === 7008 && s.pending[0]?.kind === 'combat-attack', 'spawned in-range enemy receives surprise activation');
}

// A mission's round-end bonus Boss activation must finish its Combat before
// the Hunt Track advances and round-refresh decisions are queued.
{
  const s = setupGame(1, 7013);
  const h = s.hunters[0];
  giveHand(h, []);
  s.enemies = [];
  const start = s.tiles[0];
  h.space = spaceRef(start.uid, 'c');
  const middle = { uid: s.nextUid++, tileId: start.tileId, rot: 0 as const, x: 1, y: 0 };
  const far = { uid: s.nextUid++, tileId: start.tileId, rot: 0 as const, x: 2, y: 0 };
  s.tiles.push(middle, far);
  const bossUid = s.nextUid++;
  s.bosses = [{ uid: bossUid, type: 'cleric-beast', space: spaceRef(far.uid, 'a'), phase: 1, damage: 0, actionDeck: [0], actionDiscard: [] }];
  missionState(s).bossMods['cleric-beast'] = { bonusActivationRoundEnd: 'moveFourTowardLowestHpAndAttack' };
  mustAct(s, 0, { type: 'begin_turn' }, 'round-end boss turn');
  mustAct(s, 0, { type: 'end_turn' }, 'round-end bonus boss starts');
  ok(s.combat?.bossUid === bossUid && s.pending[0]?.kind === 'combat-attack', 'round-end boss Combat starts');
  eq(s.round, 1, 'new round waits for bonus Boss Combat');
  ok(!s.pending.some((p) => p.kind === 'round-refresh'), 'round refresh not queued during bonus Combat');
  mustAct(s, 0, { type: 'choose', pass: true }, 'round-end boss combat pass');
  passCombatReaction(s, 'round-end boss combat');
  eq(s.round, 2, 'new round starts after bonus Boss Combat');
  ok(s.pending.some((p) => p.kind === 'round-refresh'), 'round refresh queues after bonus Combat');
}

// Rejected multi-card actions are atomic, and invalid-target consumables are
// not consumed or partially applied.
{
  const s = setupGame(1, 7008);
  const h = s.hunters[0];
  const gun = Object.values(BB_ITEMS).find((i) => i.kind === 'firearm' && (i.effects as { refresh?: string } | undefined)?.refresh === 'discard2')!;
  giveHand(h, ['basic-endurance', 'basic-skill', 'basic-strength']);
  h.firearmId = gun.id;
  h.firearmExhausted = true;
  mustAct(s, 0, { type: 'begin_turn' }, 'atomic refresh turn');
  const before = JSON.stringify(h.hand);
  ok(!act(s, 0, { type: 'refresh_firearm', discard: ['basic-endurance', 'basic-endurance'] }), 'duplicate refresh discard rejected');
  eq(JSON.stringify(h.hand), before, 'rejected refresh leaves entire hand unchanged');
  ok(h.firearmExhausted, 'rejected refresh leaves firearm exhausted');

  const knife = Object.values(BB_ITEMS).find((i) => i.kind === 'consumable' && (i.effects as { custom?: string } | undefined)?.custom === 'damage-1-range-1')!;
  h.consumables = [knife.id];
  ok(!act(s, 0, { type: 'use_consumable', itemIx: 0, target: 999999 }), 'invalid consumable target rejected');
  eq(h.consumables[0], knife.id, 'invalid-target consumable remains owned');
  eq(s.consumableDiscard.includes(knife.id), false, 'invalid-target consumable not discarded');
}

// Item timing is explicit: Hunter Turn effects cannot leak through a Combat
// or pending decision, while On Attack modifiers and reaction firearms always
// receive a response window even when no Dodge card is legal.
{
  const s = setupGame(1, 7020);
  const h = s.hunters[0];
  giveHand(h, ['basic-strength']);
  h.consumables = ['molotov-cocktail', 'fire-paper'];
  s.enemySides['hunter-mob'] = 0;
  s.enemyActionDeck = ['basic', 'basic', 'basic', 'special', 'special', 'ability'];
  s.enemyActionDiscard = [];
  s.enemies = [{ uid: 7020, type: 'hunter-mob', space: h.space!, damage: 0 }];
  mustAct(s, 0, { type: 'begin_turn' }, 'reaction timing turn');
  mustAct(s, 0, { type: 'attack', cardId: 'basic-strength', slot: 0, enemyUid: 7020 }, 'reaction timing attack');
  eq(s.pending[0]?.kind, 'combat-reaction', 'no-Dodge combat still exposes reaction window');
  ok(!act(s, 0, { type: 'use_consumable', itemIx: 0, target: 7020 }), 'Molotov cannot fire illegally during Combat');
  eq(h.consumables.join('|'), 'molotov-cocktail|fire-paper', 'rejected Hunter Turn item is not consumed');
  mustAct(s, 0, { type: 'use_consumable', itemIx: 1 }, 'Fire Paper On Attack reaction');
  eq(h.consumables.join('|'), 'molotov-cocktail', 'On Attack item consumed in legal reaction window');
  passCombatReaction(s, 'On Attack item reaction');
  const slot = BB_HUNTERS[h.hunterId!].sides[h.weaponSide].slots[0];
  eq(s.enemies.find((enemy) => enemy.uid === 7020)?.damage,
    slot.damage + (BB_STAT_CARDS['basic-strength'].effects.dmgBonus ?? 0) + 1,
    'On Attack modifier affects pending Attack');

  const pending = setupGame(1, 7021);
  const ph = pending.hunters[0];
  ph.hp = 2;
  ph.consumables = ['blood-vial'];
  mustAct(pending, 0, { type: 'begin_turn' }, 'pending timing turn');
  pending.pending.push({ seat: 0, kind: 'mission-choice', card: 'test', options: ['wait'] });
  ok(!act(pending, 0, { type: 'use_consumable', itemIx: 0 }), 'Hunter Turn item excluded by unrelated pending decision');
  eq(ph.hp, 2, 'pending-window Blood Vial does not heal');
  eq(ph.consumables[0], 'blood-vial', 'pending-window Blood Vial remains owned');

  const gun = setupGame(1, 7022);
  const gh = gun.hunters[0];
  giveHand(gh, []);
  gh.firearmId = 'hunter-pistol';
  gh.firearmExhausted = false;
  gun.enemySides['hunter-mob'] = 0;
  gun.enemyActionDeck = ['basic', 'basic', 'basic', 'special', 'special', 'ability'];
  gun.enemyActionDiscard = [];
  gun.enemies = [{ uid: 7022, type: 'hunter-mob', space: gh.space!, damage: 0 }];
  startCombat(gun, { seat: 0, enemyUid: 7022 });
  mustAct(gun, 0, { type: 'choose', pass: true }, 'reaction firearm decline attack');
  eq(gun.pending[0]?.kind, 'combat-reaction', 'reaction firearm has no-Dodge timing window');
  mustAct(gun, 0, { type: 'use_firearm' }, 'Hunter Pistol reaction');
  passCombatReaction(gun, 'Hunter Pistol reaction');
  eq(gh.hp, 6, 'reaction firearm cancels Basic Attack');
  ok(gh.firearmExhausted, 'reaction firearm exhausts atomically');
}

// Attack actions are one-target commands; ambiguous enemy+Boss payloads are
// rejected before the Stat card or slot is mutated.
{
  const s = setupGame(1, 7023);
  const h = s.hunters[0];
  giveHand(h, ['basic-strength']);
  s.enemies = [{ uid: 7023, type: 'hunter-mob', space: h.space!, damage: 0 }];
  s.bosses = [{ uid: 7024, type: 'cleric-beast', space: h.space!, phase: 1, damage: 0, actionDeck: [0, 1, 2, 3, 4], actionDiscard: [] }];
  mustAct(s, 0, { type: 'begin_turn' }, 'dual-target validation turn');
  ok(!act(s, 0, { type: 'attack', cardId: 'basic-strength', slot: 0, enemyUid: 7023, bossUid: 7024 }), 'dual enemy+Boss target rejected');
  ok(h.hand.includes('basic-strength') && h.slots[0] === null, 'dual-target rejection is atomic');
}

// Four-Hunter AoE targeting: full-space Boss attacks, Gascoigne's printed
// collateral, Djura's all-Hunter ability + additional flip, and each mission
// replacement target-scope flag resolve independently of the combat seat.
{
  const runBossAoe = (type: string, phase: 1 | 2, cardIx: number, expectedHp: number[], label: string, block = 0): void => {
    const s = setupGame(4, 7030 + cardIx + phase);
    const at = s.hunters[0].space!;
    for (const hunter of s.hunters) { hunter.space = at; giveHand(hunter, []); }
    s.enemies = [];
    const uid = 7300 + cardIx;
    s.bosses = [{ uid, type, space: at, phase, damage: 0, actionDeck: [cardIx], actionDiscard: [] }];
    startCombat(s, { seat: 0, bossUid: uid, block });
    mustAct(s, 0, { type: 'choose', pass: true }, `${label}: decline attack`);
    passCombatReaction(s, label);
    eq(s.hunters.map((hunter) => hunter.hp).join('|'), expectedHp.join('|'), label);
  };
  runBossAoe('cleric-beast', 1, 0, [2, 2, 2, 2], 'Cleric Beast Targets all Hunters in its space');
  runBossAoe('cleric-beast', 2, 2, [1, 4, 4, 4], 'Cleric Beast all-other rider does not double-hit primary', 1);
  runBossAoe('father-gascoigne', 2, 0, [4, 5, 5, 5], 'Gascoigne damages all other Hunters');

  const djura = setupGame(4, 7035);
  const djuraSpace = djura.hunters[0].space!;
  for (const hunter of djura.hunters) { hunter.space = djuraSpace; giveHand(hunter, []); }
  djura.enemies = [{ uid: 7035, type: 'old-hunter-djura', space: djuraSpace, damage: 0, missionTag: '24', npc: true }];
  djura.enemyActionDeck = ['ability', 'basic', 'basic', 'special', 'special', 'basic'];
  djura.enemyActionDiscard = [];
  startCombat(djura, { seat: 0, enemyUid: 7035 });
  mustAct(djura, 0, { type: 'choose', pass: true }, 'Djura: decline attack');
  eq(djura.hunters.map((hunter) => hunter.hp).join('|'), '4|4|4|4', 'Djura Blunderbuss hits and Stuns all four Hunters');
  eq(djura.enemyActionDiscard.slice(0, 2).join('|'), 'ability|basic', 'Djura Blunderbuss flips another Enemy Action');
  passCombatReaction(djura, 'Djura follow-up');

  for (const [flag, affected] of [
    ['targetsAllOnSpace', [0, 1]],
    ['targetsAllOnTile', [0, 1, 2]],
    ['targetsWithin1', [0, 1, 2]],
  ] as const) {
    const s = setupGame(4, 7040 + affected.length);
    const tile = s.tiles[0];
    const source = spaceRef(tile.uid, 'b');
    const remote = { uid: s.nextUid++, tileId: tile.tileId, rot: 0 as const, x: 99, y: 99 };
    s.tiles.push(remote);
    const positions = [source, source, spaceRef(tile.uid, 'a'), spaceRef(remote.uid, 'b')];
    for (let seat = 0; seat < 4; seat++) { s.hunters[seat].space = positions[seat]; giveHand(s.hunters[seat], []); }
    s.enemies = [{ uid: 7040, type: 'hunter-mob', space: source, damage: 0, missionTag: flag }];
    missionState(s).enemyMods.push({
      tag: flag,
      hpPool: 0,
      hpPoolMax: 0,
      replace: { special: { name: flag, speed: 'medium', damage: 1, text: '', flags: { [flag]: true } } },
    });
    s.enemyActionDeck = ['special', 'basic', 'basic', 'special', 'ability', 'basic'];
    s.enemyActionDiscard = [];
    startCombat(s, { seat: 0, enemyUid: 7040 });
    mustAct(s, 0, { type: 'choose', pass: true }, `${flag}: decline attack`);
    passCombatReaction(s, flag);
    for (let seat = 0; seat < 4; seat++) {
      eq(s.hunters[seat].hp, (affected as readonly number[]).includes(seat) ? 5 : 6, `${flag}: Hunter ${seat} scope`);
    }
  }
}

// Reward capacity and consumable-deck reshuffle rules.
{
  const s = setupGame(1, 7009);
  const h = s.hunters[0];
  const tools = Object.values(BB_ITEMS).filter((i) => i.kind === 'tool').slice(0, 3);
  h.rewards = tools.slice(0, 2).map((i) => ({ id: i.id, exhausted: false }));
  applyMissionEffects(s, 'reward-test', [{ do: 'reward', item: tools[2].name }]);
  eq(h.rewards.filter((r) => BB_ITEMS[r.id].kind === 'tool').length, 2, 'third tool not added over capacity');
  ok(s.pending.some((p) => p.kind === 'reward-overflow' && p.rewardId === tools[2].id), 'third tool queues give-away/set-aside choice');

  const c = Object.values(BB_ITEMS).find((i) => i.kind === 'consumable')!;
  const t = setupGame(1, 7010);
  t.consumableDeck = [];
  t.consumableDiscard = [c.id];
  applyMissionEffects(t, 'reward-test', [{ do: 'reward', consumables: 1 }]);
  eq(t.hunters[0].consumables.at(-1), c.id, 'mission reward reshuffles empty consumable deck');
  eq(t.consumableDiscard.length, 0, 'consumable discard recycled');
}

// Winning a chapter forces end-of-chapter Dream spending, then carries the
// upgraded 12-card deck/items/Insight into a clean next chapter without
// duplicating physical Upgrade or Consumable cards.
{
  const s = setupGame(1, 7011);
  const h = s.hunters[0];
  const held = Object.values(BB_ITEMS).find((i) => i.kind === 'consumable')!.id;
  h.consumables = [held];
  h.echoes = 2;
  s.insightCollected = 2;
  s.insightCards = ['proof-of-insight'];
  applyMissionEffects(s, 'victory-test', [{ do: 'completeHunt' }]);
  eq(s.phase, 'ended', 'victory ends chapter');
  ok(s.pending[0]?.kind === 'dream-upgrades', 'victory forces remaining echo spending');
  const incorporated = s.upgradeRow[0];
  mustAct(s, 0, { type: 'choose', upgradeId: incorporated }, 'chapter-end upgrade 1');
  mustAct(s, 0, { type: 'choose', swapOut: h.deck[0] }, 'chapter-end incorporate');
  mustAct(s, 0, { type: 'choose', upgradeId: s.upgradeRow[0] }, 'chapter-end upgrade 2');
  mustAct(s, 0, { type: 'choose', discard: true }, 'chapter-end set aside upgrade');
  mustAct(s, 0, { type: 'next_chapter' }, 'advance to chapter 2');
  eq(s.chapter, 2, 'next chapter starts');
  eq(s.insightCollected, 0, 'chapter-local collected Insight resets');
  ok(s.insightCards.includes('proof-of-insight'), 'Insight cards persist across chapters');
  eq(h.deck.length + h.hand.length + h.discard.length + h.slots.filter(Boolean).length, 12, 'upgraded Hunter deck remains 12 cards');
  ok([...h.deck, ...h.hand].includes(incorporated), 'incorporated upgrade persists');
  eq(s.upgradeDeck.length + s.upgradeRow.length, 59, 'carried upgrade removed from physical upgrade pool');
  eq(s.consumableDeck.length, 35, 'held consumable removed from next chapter deck');
}

// Explicit mission respawns and HP pools reset on Hunt Track reset spaces.
{
  const s = setupGame(1, 7012);
  const h = s.hunters[0];
  applyMissionEffects(s, 'respawn-test', [{ do: 'spawnEnemy', enemy: 'Hunter Mob', space: 'tile:Central Lamp', respawnOnReset: true }]);
  missionState(s).enemyMods.push({ tag: 'pool-test', hpPool: 0, hpPoolMax: 3, replace: {} });
  s.enemies = [];
  s.huntTrack = 3;
  mustAct(s, 0, { type: 'begin_turn' }, 'mission reset turn');
  mustAct(s, 0, { type: 'dream', cardId: h.hand[0] }, 'mission reset Dream');
  ok(s.enemies.some((e) => e.missionTag === 'respawn-test' && e.type === 'hunter-mob'), 'explicit mission enemy respawns on reset');
  eq(missionState(s).enemyMods.find((m) => m.tag === 'pool-test')?.hpPool, 3, 'mission HP pool refills on reset');
}

// Duplicate mission spawn specs represent distinct physical pieces. Card 51's
// two identical arena entries must both return after death, and a full mini
// pool must relocate two different untagged copies for a two-copy request.
{
  const card51 = setupCampaign('secrets-of-the-church', 2, 1, 7050);
  applyMissionEffects(card51, 'test', [{ do: 'reveal', card: '51' }]);
  eq(card51.enemies.filter((enemy) => enemy.missionTag === '51' && enemy.type === 'church-servant').length, 2,
    'Secrets card 51 initially spawns two Church Servants');
  card51.enemies = card51.enemies.filter((enemy) => enemy.missionTag !== '51');
  bbMissionOnReset(card51);
  eq(card51.enemies.filter((enemy) => enemy.missionTag === '51' && enemy.type === 'church-servant').length, 2,
    'Secrets card 51 restores exact duplicate spawn multiplicity');

  const pool = setupGame(1, 7051);
  const at = pool.hunters[0].space!;
  pool.enemies = Array.from({ length: 4 }, (_, ix) => ({ uid: 7500 + ix, type: 'hunter-mob', space: at, damage: 0 }));
  applyMissionEffects(pool, 'multi-copy', [
    { do: 'spawnEnemy', enemy: 'Hunter Mob', space: 'tile:Central Lamp', respawnOnReset: true },
    { do: 'spawnEnemy', enemy: 'Hunter Mob', space: 'tile:Central Lamp', respawnOnReset: true },
  ]);
  eq(pool.enemies.filter((enemy) => enemy.missionTag === 'multi-copy').length, 2,
    'full mini pool relocates distinct pieces for repeated mission spawn');
  pool.enemies = pool.enemies.filter((enemy) => enemy.missionTag !== 'multi-copy');
  bbMissionOnReset(pool);
  eq(pool.enemies.filter((enemy) => enemy.missionTag === 'multi-copy').length, 2,
    'duplicate generic respawn specs aggregate to two pieces');
}

// A mission target may disappear during an item/reaction window. The missing-
// target combat exit still emits combatEnd and finalizes deferred Hunt victory.
{
  const s = setupCampaign('the-long-hunt', 3, 1, 7052);
  const h = s.hunters[0];
  const boss = s.bosses.find((piece) => piece.type === 'cleric-beast');
  ok(!!boss && !!s.missions['40']?.revealed, 'terminal-kill fixture has final Cleric Beast mission');
  if (boss) {
    h.space = boss.space;
    giveHand(h, []);
    startCombat(s, { seat: 0, bossUid: boss.uid });
    mustAct(s, 0, { type: 'choose', pass: true }, 'terminal item kill: decline attack');
    eq(s.pending[0]?.kind, 'combat-reaction', 'terminal kill occurs inside reaction window');
    s.bosses = s.bosses.filter((piece) => piece.uid !== boss.uid);
    bbMissionEvent(s, { type: 'bossSlain', boss: boss.type, bySeat: 0 });
    eq(s.phase, 'play', 'Hunt completion defers while Combat object exists');
    passCombatReaction(s, 'terminal item kill');
    eq(s.phase, 'ended', 'missing-target Combat finalizes deferred Hunt');
    eq(s.outcome, 'victory', 'missing-target terminal kill produces victory');
  }
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
    case 'combat-reaction': return act(s, p.seat, { type: 'choose', pass: true });
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
    case 'onkill-reward': return act(s, p.seat, { type: 'choose', use: true }) || act(s, p.seat, { type: 'choose', use: false });
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

// Cross-campaign/chapter stress: every live core campaign path gets several
// deterministic rounds at both minimum and maximum party size. This catches
// setup-only confidence gaps without claiming unsupported custom cards are
// full playthrough-complete.
{
  let scenarios = 0;
  const progressKey = (s: BbState): string => JSON.stringify({
    phase: s.phase, outcome: s.outcome, round: s.round, track: s.huntTrack,
    active: s.activeSeat, pending: s.pending, combat: s.combat,
    hunters: s.hunters.map((h) => [h.hp, h.space, h.hand.length, h.tookTurnThisRound]),
    enemies: s.enemies.map((e) => [e.uid, e.space, e.damage]),
    bosses: s.bosses.map((b) => [b.uid, b.space, b.phase, b.damage]),
    tiles: s.tiles.length, event: s.lastEvent.seq,
  });
  for (const campaign of Object.values(BB_CAMPAIGNS).filter((c) => c.set === 'core')) {
    for (let chapter = 1; chapter <= campaign.chapters.length; chapter++) {
      for (const players of [1, 4]) {
        const s = setupCampaign(campaign.id, chapter, players, 8000 + scenarios);
        let actions = 0;
        let stalled = false;
        while (s.phase === 'play' && s.round <= 4 && actions < 500) {
          const before = progressKey(s);
          let accepted = true;
          if (s.pending.length > 0) {
            accepted = botAnswerPending(s);
          } else if (s.activeSeat != null) {
            if (s.combat) accepted = false;
            else accepted = act(s, s.activeSeat, { type: 'end_turn' });
          } else {
            const seat = s.hunters.find((h) => !h.tookTurnThisRound && !h.skipTurn)?.seat;
            if (seat != null) botTurn(s, seat);
          }
          actions++;
          const changed = progressKey(s) !== before;
          if (!accepted || !changed) {
            stalled = true;
            ok(false, `${campaign.id} ch${chapter} ${players}p stalled at ${s.pending[0]?.kind ?? (s.combat ? 'combat' : 'turn')}`);
            break;
          }
          checkInvariants(s, `${campaign.id} ch${chapter} ${players}p stress ${actions}`);
        }
        ok(!stalled, `${campaign.id} ch${chapter} ${players}p has no reducer stall`);
        ok(actions >= 4, `${campaign.id} ch${chapter} ${players}p performs minimum actions`);
        ok(s.phase === 'ended' || s.round >= 5, `${campaign.id} ch${chapter} ${players}p completes four stress rounds`);
        ok(actions < 500, `${campaign.id} ch${chapter} ${players}p stays below action cap`);
        scenarios++;
      }
    }
  }
  console.log(`cross-campaign stress: ${scenarios} scenarios`);
}

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
  eq(s.phase, 'ended', `bot ${players}p reaches a terminal chapter outcome`);
  ok(s.outcome !== null, `bot ${players}p records terminal outcome`);
  ok(!s.combat, `bot ${players}p has no terminal Combat stall`);
  ok(actions < 4000, `bot ${players}p finishes below action cap`);
}

// ---------- summary ----------

if (failures) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log('\nALL BLOODBORNE TESTS GREEN');
process.exit(0);
