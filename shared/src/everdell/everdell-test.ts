// Everdell engine tests: bot playthroughs at 2-4 players, the 128-card
// conservation invariant after every action, and directed rules tests
// cross-checked against docs/specs/everdell.md (Gilded Book + Archive refs).
// Run: npx tsx shared/src/everdell/everdell-test.ts

import { EV_CARD_BY_ID } from './catalog.js';
import {
  createEverdell, everdellViewFor, EVERDELL_SEATS, evCitySpaces,
  type EverdellState, type EverdellSeat,
} from './state.js';
import {
  applyEverdellAction, everdellBotAction, everdellPlayCost, everdellScore,
  type EverdellAction,
} from './actions.js';

let failures = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function seats(n: number): { name: string; color: EverdellSeat }[] {
  return EVERDELL_SEATS.slice(0, n).map((c, i) => ({ name: i === 0 ? 'Human' : `CPU ${c}`, color: c }));
}

/** Total cards across every zone must always equal 128. */
function conservation(s: EverdellState): number {
  let n = s.deck.length + s.discard.length;
  n += s.meadow.filter((m) => m).length;
  for (const p of s.players) {
    n += p.hand.length;
    for (const cc of p.city) {
      n += 1;
      if (cc.sharedWith) n += 1;
      n += cc.prisoners.length;
    }
  }
  for (const st of s.specialEvents) n += st.beneath.length;
  for (const pd of s.pending) {
    if (pd.kind === 'pigeon-play' || pd.kind === 'cemetery-play') n += pd.revealed.length;
    if (pd.kind === 'ancient-scrolls') n += pd.revealed.length;
    if (pd.kind === 'teacher-give') n += pd.cards.length;
  }
  return n;
}

// ---------- 1. bot playthroughs ----------

for (const n of [2, 3, 4]) {
  for (const seed of [11, 22, 33]) {
    const s = createEverdell(seats(n), seed);
    check(`setup ${n}p: conservation`, conservation(s) === 128, `${conservation(s)}`);
    let stall = 0;
    let steps = 0;
    let lastSeq = -1;
    while (s.phase === 'playing' && steps < 20000) {
      steps++;
      let acted = false;
      for (let seat = 0; seat < n; seat++) {
        const a = everdellBotAction(s, seat);
        if (!a) continue;
        const r = applyEverdellAction(s, seat, a);
        if (!r.ok) {
          check(`bot ${n}p seed ${seed}: action accepted`, false, `${JSON.stringify(a).slice(0, 200)} -> ${r.error}`);
          stall++;
          if (stall > 5) break;
          continue;
        }
        acted = true;
        const c = conservation(s);
        if (c !== 128) {
          check(`bot ${n}p seed ${seed}: conservation`, false, `${c} after ${JSON.stringify(a).slice(0, 120)}`);
          stall = 99;
        }
        break;
      }
      if (!acted) {
        stall++;
        if (stall > 5) {
          check(`bot ${n}p seed ${seed}: no stall`, false,
            `turn ${s.turn} turnDone ${s.turnDone} pending ${JSON.stringify(s.pending[0] ?? null).slice(0, 160)}`);
          break;
        }
      } else if (s.lastEvent.seq !== lastSeq) {
        stall = 0;
        lastSeq = s.lastEvent.seq;
      }
      if (stall > 90) break;
    }
    check(`bot ${n}p seed ${seed}: game ends`, s.phase === 'ended', `steps ${steps}`);
    if (s.phase === 'ended') {
      check(`bot ${n}p seed ${seed}: winners`, s.winners.length >= 1);
      for (const p of s.players) {
        check(`bot ${n}p seed ${seed}: scored`, p.score !== null && p.scoreParts !== null);
        check(`bot ${n}p seed ${seed}: passed`, p.passed);
        check(`bot ${n}p seed ${seed}: autumn`, p.season === 'autumn');
      }
    }
  }
}

// ---------- 2. determinism ----------
{
  const a = createEverdell(seats(3), 777);
  const b = createEverdell(seats(3), 777);
  check('determinism: same seed same setup', JSON.stringify(a) === JSON.stringify(b));
}

// ---------- 3. directed rules ----------

// setup facts (Lua 2173-2185, 1038-1047)
{
  const s2 = createEverdell(seats(2), 1);
  check('2p hands 5/6', s2.players[0].hand.length === 5 && s2.players[1].hand.length === 6);
  check('2p forest 3', s2.forest.length === 3);
  const s4 = createEverdell(seats(4), 1);
  check('4p hands 5/6/7/8', s4.players.map((p) => p.hand.length).join(',') === '5,6,7,8');
  check('4p forest 4', s4.forest.length === 4);
  check('meadow 8', s4.meadow.filter((m) => m).length === 8);
  check('4 special events', s4.specialEvents.length === 4);
  check('4 basic events', s4.basicEvents.length === 4);
  check('2 workers in winter', s4.players.every((p) => p.workersTotal === 2));
}

// helper: a controlled 2p state
function fresh(seed = 5): EverdellState {
  return createEverdell(seats(2), seed);
}

/** Drive seat 1 with the bot until the turn comes back to seat 0. */
function runSeat1(s: EverdellState): void {
  for (let i = 0; i < 60; i++) {
    if (s.phase !== 'playing') return;
    const pendingSeat = s.pending[0]?.seat ?? null;
    const actor = pendingSeat ?? s.turn;
    if (actor !== 1) return;
    const a = everdellBotAction(s, 1);
    if (!a) return;
    const r = applyEverdellAction(s, 1, a);
    check('seat-1 filler action accepted', r.ok, r.error);
    if (!r.ok) return;
  }
}

function expectOk(name: string, s: EverdellState, seat: number, a: EverdellAction): void {
  const r = applyEverdellAction(s, seat, a);
  check(name, r.ok, r.error);
}

function expectErr(name: string, s: EverdellState, seat: number, a: EverdellAction): void {
  const r = applyEverdellAction(s, seat, a);
  check(name, !r.ok);
}

// affordability + uniqueness + city limit
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['king', 'theater', 'theater', 'farm'];
  p.res = { twig: 0, resin: 0, pebble: 0, berry: 0 };
  expectErr('cannot play unaffordable King', s, 0, { type: 'play_card', source: 'hand', card: 'king' });
  p.res = { twig: 6, resin: 2, pebble: 2, berry: 6 };
  expectOk('play Theater', s, 0, { type: 'play_card', source: 'hand', card: 'theater' });
  expectOk('end turn', s, 0, { type: 'end_turn' });
  // opponent turn: pass through quickly by preparing
  expectOk('p1 prepare', s, 1, { type: 'prepare' });
  expectOk('p1 end', s, 1, { type: 'end_turn' });
  expectErr('unique Theater rejected', s, 0, { type: 'play_card', source: 'hand', card: 'theater' });
}

// turnDone gating: second action in one turn is rejected
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['farm', 'farm'];
  p.res = { twig: 4, resin: 2, pebble: 0, berry: 0 };
  expectOk('play first Farm', s, 0, { type: 'play_card', source: 'hand', card: 'farm' });
  expectErr('second action same turn rejected', s, 0, { type: 'play_card', source: 'hand', card: 'farm' });
  expectOk('end turn after action', s, 0, { type: 'end_turn' });
  check('turn moved on', s.turn === 1);
}

// farm production + general store
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['farm', 'general-store'];
  p.res = { twig: 2, resin: 2, pebble: 1, berry: 0 };
  expectOk('play Farm', s, 0, { type: 'play_card', source: 'hand', card: 'farm' });
  check('farm gave 1 berry', p.res.berry === 1);
  expectOk('end', s, 0, { type: 'end_turn' });
  expectOk('p1 prepare', s, 1, { type: 'prepare' });
  expectOk('p1 end', s, 1, { type: 'end_turn' });
  expectOk('play General Store', s, 0, { type: 'play_card', source: 'hand', card: 'general-store' });
  check('general store gave 2 berries with farm', p.res.berry === 3);
}

// free critter via occupied token
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['farm', 'harvester'];
  p.res = { twig: 2, resin: 1, pebble: 0, berry: 0 };
  expectOk('play Farm for cost', s, 0, { type: 'play_card', source: 'hand', card: 'farm' });
  expectOk('end', s, 0, { type: 'end_turn' });
  expectOk('p1 prep', s, 1, { type: 'prepare' });
  expectOk('p1 end', s, 1, { type: 'end_turn' });
  const farmUid = p.city.find((c) => c.card === 'farm')!.uid;
  expectOk('play Harvester free via Farm', s, 0, { type: 'play_card', source: 'hand', card: 'harvester', ability: { kind: 'occupied', uid: farmUid } });
  check('no berries paid', p.res.berry === 1); // the 1 berry is from the Farm's own production

  check('occupied token set', p.city.find((c) => c.uid === farmUid)!.occupiedUsed);
}

// gatherer/harvester share one space + pair scoring
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['harvester', 'gatherer'];
  p.res = { twig: 0, resin: 0, pebble: 0, berry: 9 };
  expectOk('play Harvester', s, 0, { type: 'play_card', source: 'hand', card: 'harvester' });
  expectOk('end', s, 0, { type: 'end_turn' });
  expectOk('p1 prep', s, 1, { type: 'prepare' });
  expectOk('p1 end', s, 1, { type: 'end_turn' });
  const spacesBefore = evCitySpaces(p.city);
  expectOk('play Gatherer shares the space', s, 0, { type: 'play_card', source: 'hand', card: 'gatherer' });
  check('shared space', evCitySpaces(p.city) === spacesBefore);
  const r = everdellScore(s, 0);
  // harvester 2 + gatherer 2 base, +3 pair bonus
  check('pair scores 7', r.parts.cards + r.parts.prosperity === 7, `${JSON.stringify(r.parts)}`);
}

// judge swap ability
{
  const s = fresh();
  const p = s.players[0];
  p.city.push({ uid: 900, card: 'judge', sharedWith: null, sharedUid: null, occupiedUsed: false, storedPoints: 0, storedRes: { twig: 0, resin: 0, pebble: 0, berry: 0 }, prisoners: [] });
  p.hand = ['mine'];
  p.res = { twig: 1, resin: 1, pebble: 0, berry: 1 }; // mine costs 1T 1R 1P — swap pebble for berry
  const cost = everdellPlayCost(p, EV_CARD_BY_ID.mine, { kind: 'judge', from: 'pebble', to: 'berry' });
  check('judge cost swaps', !!cost && cost.pebble === 0 && cost.berry === 1);
  expectOk('play Mine with Judge swap', s, 0, { type: 'play_card', source: 'hand', card: 'mine', ability: { kind: 'judge', from: 'pebble', to: 'berry' } });
  check('paid swapped cost', p.res.twig === 0 && p.res.resin === 0 && p.res.berry === 0 && p.res.pebble === 1);
}

// worker on basic location + exclusivity
{
  const s = fresh();
  expectOk('place on 3-twig', s, 0, { type: 'place_worker', loc: { t: 'basic', id: 'loc-3twig' } });
  check('gained 3 twigs', s.players[0].res.twig === 3);
  expectOk('end', s, 0, { type: 'end_turn' });
  expectErr('exclusive location blocked', s, 1, { type: 'place_worker', loc: { t: 'basic', id: 'loc-3twig' } });
  expectOk('shared berry location open', s, 1, { type: 'place_worker', loc: { t: 'basic', id: 'loc-berry' } });
  expectOk('p1 end', s, 1, { type: 'end_turn' });
  expectOk('p0 also on shared berry', s, 0, { type: 'place_worker', loc: { t: 'basic', id: 'loc-berry' } });
}

// journey requires autumn + discards; permanent worker
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['farm', 'mine', 'king', 'queen', 'judge'];
  expectErr('journey closed before autumn', s, 0, { type: 'place_worker', loc: { t: 'journey', id: 'journey-4' } });
  p.season = 'autumn';
  p.workersTotal = 6;
  expectOk('journey in autumn', s, 0, { type: 'place_worker', loc: { t: 'journey', id: 'journey-4' } });
  const r = applyEverdellAction(s, 0, { type: 'choose', cards: ['farm', 'mine', 'king', 'queen'] });
  check('journey discard accepted', r.ok, r.error);
  check('journey worker permanent', s.players[0].workers.some((w) => w.permanent && w.loc.t === 'journey'));
  check('journey scores 4', everdellScore(s, 0).parts.journey === 4);
}

// haven: discard 2 gain 1
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['farm', 'mine', 'king'];
  expectOk('haven placement', s, 0, { type: 'place_worker', loc: { t: 'haven' } });
  expectErr('haven wrong gains rejected', s, 0, { type: 'choose', cards: ['farm', 'mine'], gains: { berry: 2 } });
  expectOk('haven 2-for-1', s, 0, { type: 'choose', cards: ['farm', 'mine'], gains: { berry: 1 } });
  check('haven gained berry', p.res.berry === 1);
}

// basic event claim
{
  const s = fresh();
  const p = s.players[0];
  for (let i = 0; i < 4; i++) {
    p.city.push({ uid: 700 + i, card: 'farm', sharedWith: null, sharedUid: null, occupiedUsed: false, storedPoints: 0, storedRes: { twig: 0, resin: 0, pebble: 0, berry: 0 }, prisoners: [] });
  }
  expectOk('harvest festival with 4 production', s, 0, { type: 'place_worker', loc: { t: 'basicEvent', id: 'harvest-festival' } });
  check('event claimed', s.basicEvents.find((e) => e.id === 'harvest-festival')!.claimedBy === 0);
  expectOk('end', s, 0, { type: 'end_turn' });
  expectErr('claimed event rejected', s, 1, { type: 'place_worker', loc: { t: 'basicEvent', id: 'harvest-festival' } });
  check('event scores 3', everdellScore(s, 0).parts.events === 3);
}

// storehouse: production stores, visit takes
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['storehouse'];
  p.res = { twig: 1, resin: 1, pebble: 1, berry: 0 };
  expectOk('play Storehouse', s, 0, { type: 'play_card', source: 'hand', card: 'storehouse' });
  expectOk('store 3 twigs', s, 0, { type: 'choose', pick: 'twig' });
  const cc = p.city.find((c) => c.card === 'storehouse')!;
  check('stored 3 twigs on card', cc.storedRes.twig === 3);
  expectOk('end', s, 0, { type: 'end_turn' });
  expectOk('p1 prep', s, 1, { type: 'prepare' });
  expectOk('p1 end', s, 1, { type: 'end_turn' });
  expectOk('visit own storehouse', s, 0, { type: 'place_worker', loc: { t: 'city', seat: 0, uid: cc.uid } });
  check('took stored twigs', p.res.twig === 3 && cc.storedRes.twig === 0);
}

// fool goes to the opponent's city
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['fool'];
  p.res = { twig: 0, resin: 0, pebble: 0, berry: 3 };
  expectOk('play Fool at opponent', s, 0, { type: 'play_card', source: 'hand', card: 'fool', foolTarget: 1 });
  check('fool in their city', s.players[1].city.some((c) => c.card === 'fool'));
  check('fool scores -2 for them', everdellScore(s, 1).parts.cards === -2);
}

// wanderer takes no space
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['wanderer'];
  p.res = { twig: 0, resin: 0, pebble: 0, berry: 2 };
  const spaces = evCitySpaces(p.city);
  expectOk('play Wanderer', s, 0, { type: 'play_card', source: 'hand', card: 'wanderer' });
  check('wanderer takes no space', evCitySpaces(p.city) === spaces);
}

// shepherd pays an opponent
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['shepherd'];
  p.res = { twig: 0, resin: 0, pebble: 0, berry: 3 };
  expectOk('play Shepherd paying opponent', s, 0, { type: 'play_card', source: 'hand', card: 'shepherd', payTo: 1 });
  check('opponent got the berries', s.players[1].res.berry === 3);
  check('shepherd gained 3 berries', p.res.berry === 3);
}

// prepare-for-season: worker recall + production + summer meadow
{
  const s = fresh();
  const p = s.players[0];
  p.hand = [];
  expectOk('place a worker', s, 0, { type: 'place_worker', loc: { t: 'basic', id: 'loc-2resin' } });
  expectOk('end', s, 0, { type: 'end_turn' });
  expectOk('p1 prep', s, 1, { type: 'prepare' });
  expectOk('p1 end', s, 1, { type: 'end_turn' });
  expectOk('prepare to spring', s, 0, { type: 'prepare' });
  check('worker returned', p.workers.length === 0);
  check('3 workers in spring', p.workersTotal === 3);
  check('season spring', p.season === 'spring');
  expectOk('end', s, 0, { type: 'end_turn' });
  runSeat1(s);
  expectOk('prepare to summer', s, 0, { type: 'prepare' });
  check('summer meadow decision offered', s.pending[0]?.kind === 'summer-meadow');
  const firstMeadow = s.meadow.findIndex((m) => m);
  expectOk('draw meadow card 1', s, 0, { type: 'choose', index: firstMeadow });
  expectOk('draw meadow card 2', s, 0, { type: 'choose', index: s.meadow.findIndex((m) => m) });
  check('4 workers in summer', p.workersTotal === 4);
  expectOk('end after summer', s, 0, { type: 'end_turn' });
  runSeat1(s);
  expectOk('prepare to autumn', s, 0, { type: 'prepare' });
  check('6 workers in autumn', p.workersTotal === 6);
  expectOk('end after autumn', s, 0, { type: 'end_turn' });
  runSeat1(s);
  // both pass -> game ends
  expectOk('p0 passes', s, 0, { type: 'pass' });
  runSeat1(s); // seat 1 keeps acting until it passes too
  check('game ended after all passed', s.phase === 'ended');
}

// hand limit is strict on draws
{
  const s = fresh();
  const p = s.players[0];
  p.hand = ['farm', 'farm', 'farm', 'farm', 'farm', 'farm', 'farm'];
  s.discard.push('mine');
  expectOk('place on 2card+point', s, 0, { type: 'place_worker', loc: { t: 'basic', id: 'loc-2card-point' } });
  check('drew only to the 8 limit', p.hand.length === 8);
  check('gained the point', p.points === 1);
}

// dungeon: imprison to discount, prisoner scores nothing
{
  const s = fresh();
  const p = s.players[0];
  p.city.push({ uid: 800, card: 'dungeon', sharedWith: null, sharedUid: null, occupiedUsed: false, storedPoints: 0, storedRes: { twig: 0, resin: 0, pebble: 0, berry: 0 }, prisoners: [] });
  p.city.push({ uid: 801, card: 'wanderer', sharedWith: null, sharedUid: null, occupiedUsed: false, storedPoints: 0, storedRes: { twig: 0, resin: 0, pebble: 0, berry: 0 }, prisoners: [] });
  p.hand = ['mine'];
  p.res = { twig: 0, resin: 0, pebble: 0, berry: 0 };
  expectOk('dungeon pays the Mine', s, 0, {
    type: 'play_card', source: 'hand', card: 'mine',
    ability: { kind: 'dungeon', uid: 800, prisonerUid: 801, discount: { twig: 1, resin: 1, pebble: 1 } },
  });
  check('prisoner beneath dungeon', p.city.find((c) => c.uid === 800)!.prisoners.length === 1);
  check('prisoner not in city', !p.city.some((c) => c.uid === 801));
}

// scoring example: prosperity + king
{
  const s = fresh();
  const p = s.players[0];
  const put = (card: string, uid: number) => p.city.push({ uid, card, sharedWith: null, sharedUid: null, occupiedUsed: false, storedPoints: 0, storedRes: { twig: 0, resin: 0, pebble: 0, berry: 0 }, prisoners: [] });
  put('theater', 901); // 3 base, 1 per unique critter
  put('king', 902);    // 4 base, unique critter; 1/basic 2/special achieved
  put('queen', 903);   // 4 base, unique critter
  p.achievedBasic = ['grand-tour'];
  const r = everdellScore(s, 0);
  // Theater: 1 per unique critter (King, Queen) = 2; King: 1 per basic event = 1
  check('prosperity math', r.parts.cards === 11 && r.parts.prosperity === 3, JSON.stringify(r.parts));
  // events part includes the tour's 3
  check('events math', r.parts.events === 3, JSON.stringify(r.parts));
}

// view redaction: opponent hands hidden
{
  const s = fresh();
  const v = everdellViewFor(s, 0);
  check('own hand visible', v.players[0].hand.length === 5);
  check('opponent hand hidden', v.players[1].hand.length === 0 && v.players[1].handCount === 6);
  const tv = everdellViewFor(s, null);
  check('tv sees no hands', tv.players.every((p) => p.hand.length === 0));
}

console.log(failures === 0 ? 'ALL EVERDELL TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures ? 1 : 0);
