// Trekking engine test: full bot playthroughs at 2-5 players with conservation
// invariants checked after every action, plus directed rules tests.
// Run: npx tsx shared/src/trek/trek-test.ts

import {
  createTrek, trekViewFor, TREK_SEATS, TREK_CATALOG, PARKS, MAJORS, TREK_RULES, SCORING,
  NEIGHBORS, START, STONE_COLORS, type TrekState, type TrekPlayer, type TrekSuit,
} from './state.js';
import {
  applyTrekAction, costMatches, currentTrekPlayer, distancesFrom, findPath, pathError,
  type TrekAction,
} from './actions.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

function checkInvariants(s: TrekState, tag: string): void {
  let trek = s.trekDeck.length + s.trekDiscard.length;
  trek += s.trekRiver.filter((c) => c !== null).length;
  for (const p of s.players) trek += p.hand.length;
  if (trek !== 96) ok(false, `${tag}: trek conservation ${trek} != 96`);

  let parks = s.parkDeck.length + s.parkRiver.filter((c) => c !== null).length;
  for (const p of s.players) parks += p.parks.length;
  if (parks !== 39) ok(false, `${tag}: park conservation ${parks} != 39`);

  let stones = Object.values(s.stones).filter((c) => c !== null).length;
  for (const p of s.players) stones += STONE_COLORS.reduce((t, c) => t + p.stones[c], 0);
  if (stones !== 45) ok(false, `${tag}: stone conservation ${stones} != 45`);

  for (const p of s.players) {
    if (p.campsites + p.majors.length !== TREK_RULES.campsites) ok(false, `${tag}: ${p.color} campsites`);
    if (p.stones && STONE_COLORS.some((c) => p.stones[c] < 0)) ok(false, `${tag}: ${p.color} negative stones`);
  }
  // one trekker per non-START node
  const at: Record<number, number> = {};
  for (const p of s.players) {
    if (p.node === START) continue;
    at[p.node] = (at[p.node] ?? 0) + 1;
    if (at[p.node] > 1) ok(false, `${tag}: two trekkers on node ${p.node}`);
  }
}

// pick hand indices paying a cost by suit (no wilds), or null
function payFor(p: TrekPlayer, cost: TrekSuit[]): number[] | null {
  const used = new Set<number>();
  for (const suit of cost) {
    const i = p.hand.findIndex((c, idx) => !used.has(idx) && TREK_CATALOG[c].suit === suit);
    if (i < 0) return null;
    used.add(i);
  }
  return [...used];
}

function playout(P: number, seed: number) {
  const seated = TREK_SEATS.slice(0, P).map((c) => ({ name: `Bot-${c}`, color: c }));
  const s = createTrek(seated, seed);
  const rng = (() => { let x = seed * 37 + 11; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; }; })();

  let acts = 0;
  const counts: Record<string, number> = { draw: 0, move: 0, claim: 0, occupy: 0 };
  while (s.phase === 'playing' && acts < 8000) {
    const p = currentTrekPlayer(s);
    const seat = p.seat;
    const tryDo = (a: TrekAction) => {
      const r = applyTrekAction(s, seat, a);
      if (r.ok) { checkInvariants(s, `${P}p/${seed}@${acts}`); acts++; }
      return r.ok;
    };

    if (s.actionsLeft <= 0) {
      while (p.hand.length > TREK_RULES.handLimit) {
        // dump lowest values
        const idx = p.hand.map((c, i) => ({ i, v: TREK_CATALOG[c].value })).sort((a, b) => a.v - b.v)
          .slice(0, p.hand.length - TREK_RULES.handLimit).map((x) => x.i);
        if (!tryDo({ type: 'discard', cards: idx })) break;
      }
      ok(applyTrekAction(s, seat, { type: 'end_turn' }).ok, `${P}p/${seed} end_turn`);
      continue;
    }

    let did = false;
    // 1) claim a river park under our feet
    for (let slot = 0; slot < s.parkRiver.length && !did; slot++) {
      const id = s.parkRiver[slot];
      if (id === null || PARKS[id].node !== p.node) continue;
      const cards = payFor(p, PARKS[id].cost);
      if (cards && tryDo({ type: 'claim', slot, cards })) { counts.claim++; did = true; }
    }
    // 2) occupy a major under our feet
    if (!did) {
      for (const majorId of s.majors) {
        const m = MAJORS[majorId];
        if (m.node !== p.node || p.majors.includes(majorId) || p.campsites <= 0) continue;
        const cards = payFor(p, m.cost);
        if (cards && tryDo({ type: 'occupy', major: majorId, cards })) { counts.occupy++; did = true; break; }
      }
    }
    // 3) goal: the cheapest payable river park — reserve its cost, walk there
    //    with the spare cards (exact subset-sum), collecting stones on the way
    if (!did && p.hand.length) {
      const dist = distancesFrom(p.node);
      // candidate goals: river parks whose cost we can already pay
      const goals = s.parkRiver
        .map((id, slot) => ({ id, slot }))
        .filter((g): g is { id: number; slot: number } => g.id !== null && PARKS[g.id].node !== p.node)
        .map((g) => ({ ...g, cost: payFor(p, PARKS[g.id].cost), d: dist[PARKS[g.id].node] }))
        .filter((g) => g.cost !== null)
        .sort((a, b) => a.d - b.d);
      const spareFor = (reserved: number[]) => p.hand.map((_, i) => i).filter((i) => !reserved.includes(i));
      const subsetSum = (idx: number[], target: number): number[] | null => {
        if (target === 0) return [];
        for (let k = 0; k < idx.length; k++) {
          const v = TREK_CATALOG[p.hand[idx[k]]].value;
          if (v > target) continue;
          const rest = subsetSum(idx.slice(k + 1), target - v);
          if (rest) return [idx[k], ...rest];
        }
        return null;
      };
      for (const g of goals) {
        const cards = subsetSum(spareFor(g.cost!), g.d);
        if (!cards) continue;
        const path = findPath(s, p, PARKS[g.id!].node, g.d);
        if (path && tryDo({ type: 'move', path, cards })) { counts.move++; did = true; break; }
      }
      // otherwise wander toward any stone with 1-2 random cards
      if (!did) {
        const stonesLeft = Object.entries(s.stones).filter(([, c]) => c).map(([n]) => Number(n));
        const tryMove = (cards: number[]): boolean => {
          const len = cards.reduce((t, i) => t + TREK_CATALOG[p.hand[i]].value, 0);
          const targets = stonesLeft.filter((n) => dist[n] === len);
          const all = Object.keys(dist).map(Number).filter((n) => dist[n] === len && n !== p.node);
          for (const dest of [...targets, ...all.sort(() => rng() - 0.5).slice(0, 4)]) {
            const path = findPath(s, p, dest, len);
            if (path && tryDo({ type: 'move', path, cards })) { counts.move++; return true; }
          }
          return false;
        };
        // hoard until we can afford a river park; wander only with a full-ish hand
        if (p.hand.length >= 6) {
          const one = Math.floor(rng() * p.hand.length);
          did = tryMove([one]);
          if (!did && p.hand.length >= 2) did = tryMove([one, (one + 1) % p.hand.length]);
        }
      }
    }
    // 4) draw (prefer a river card whose suit we still need for a river park)
    if (!did) {
      const neededSuits = new Set<string>();
      for (const id of s.parkRiver) {
        if (id === null) continue;
        const have = [...p.hand.map((c) => TREK_CATALOG[c].suit)];
        for (const suit of PARKS[id].cost) {
          const at = have.indexOf(suit);
          if (at >= 0) have.splice(at, 1); else neededSuits.add(suit);
        }
      }
      let slot = s.trekRiver.findIndex((c) => c !== null && neededSuits.has(TREK_CATALOG[c].suit));
      if (slot < 0) slot = Math.floor(rng() * 5);
      did = tryDo({ type: 'draw', source: s.trekRiver[slot] !== null ? slot : 'deck' });
      if (did) counts.draw++;
    }
    if (!did) {
      // truly stuck mid-turn: burn the action by drawing from deck, else end
      if (!tryDo({ type: 'draw', source: 'deck' })) {
        ok(applyTrekAction(s, seat, { type: 'end_turn' }).ok, `${P}p/${seed} stuck end_turn`);
      }
    }
  }
  return { s, acts, counts };
}

for (const P of [2, 3, 4, 5]) {
  for (const seed of [3, 11]) {
    const { s, acts, counts } = playout(P, seed);
    ok(s.phase === 'ended', `${P}p/seed${seed} finishes (${acts} acts, phase=${s.phase})`);
    ok((s.winners?.length ?? 0) >= 1, `${P}p/seed${seed} has winner(s)`);
    ok(counts.claim > 0, `${P}p/seed${seed} claims parks (${counts.claim})`);
    ok(counts.move > 0, `${P}p/seed${seed} moves (${counts.move})`);
    if (P === 2 && s.bonuses) {
      ok(Object.keys(s.bonuses.second).length === 0, `2p/seed${seed} no second-most awards`);
    }
    console.log(`${P}p/seed${seed}: ${s.phase} after ${acts} acts — moves ${counts.move}, draws ${counts.draw}, claims ${counts.claim}, occupies ${counts.occupy} — ${s.players.map((p) => `${p.color}:${p.score}`).join(' ')} — winners ${s.winners?.join('&')}`);
  }
}

// --- directed tests ---------------------------------------------------------

const mk = (P = 2, seed = 5) => createTrek(TREK_SEATS.slice(0, P).map((c) => ({ name: c, color: c })), seed);
const findCard = (suit: TrekSuit, value?: number) =>
  TREK_CATALOG.findIndex((c) => c.suit === suit && (value === undefined || c.value === value));

// movement legality
{
  const s = mk();
  const p = currentTrekPlayer(s);
  // sum mismatch
  const nb = NEIGHBORS[START][0];
  p.hand = [findCard('Blue', 3)];
  ok(!applyTrekAction(s, p.seat, { type: 'move', path: [nb], cards: [0] }).ok, 'sum mismatch rejected');
  p.hand = [findCard('Blue', 1)];
  ok(applyTrekAction(s, p.seat, { type: 'move', path: [nb], cards: [0] }).ok, 'exact move accepted');
  ok(p.node === nb, 'trekker moved');
  ok(STONE_COLORS.reduce((t, c) => t + p.stones[c], 0) === 1, 'destination stone collected');
  ok(s.stones[nb] === null, 'stone gone from map');
}

// blocking and bumping
{
  const s = mk(3, 7);
  const [a, b] = s.players;
  s.turn = a.seat; s.actionsLeft = 2;
  const nb = NEIGHBORS[START][0];
  const nb2 = NEIGHBORS[nb].find((n) => n !== START)!;
  b.node = nb;
  // cannot pass through b
  a.hand = [findCard('Red', 2)];
  ok(pathError(s, a, [nb, nb2]) === 'blocked by a trekker', 'blocked mid-path');
  // landing on b bumps
  a.hand = [findCard('Red', 1)];
  ok(applyTrekAction(s, a.seat, { type: 'move', path: [nb], cards: [0] }).ok, 'landing on trekker ok');
  ok(b.node === START, 'bumped to START');
}

// cost matching + Acadia wilds
{
  const s = mk();
  const p = currentTrekPlayer(s);
  p.hand = [findCard('Blue'), findCard('Purple'), findCard('Red')];
  ok(costMatches(p, [0, 1, 2], ['Blue', 'Purple', 'Red'], undefined, false) === null, 'exact cost ok');
  ok(costMatches(p, [0, 1], ['Blue', 'Purple', 'Red'], undefined, false) !== null, 'short cost rejected');
  ok(costMatches(p, [0, 1, 2], ['Blue', 'Purple'], undefined, false) !== null, 'overpay rejected');
  p.hand = [findCard('Blue'), findCard('Green'), findCard('Green')];
  ok(costMatches(p, [0, 1, 2], ['Blue', 'Red'], [[1, 2]], false) !== null, 'wilds without Acadia rejected');
  ok(costMatches(p, [0, 1, 2], ['Blue', 'Red'], [[1, 2]], true) === null, 'Acadia pair covers missing icon');
}

// claim: must stand on the park; river refills; Yellowstone draw; Hawaii hop
{
  const s = mk();
  const p = currentTrekPlayer(s);
  const parkId = s.parkRiver[0]!;
  const park = PARKS[parkId];
  p.hand = park.cost.map((suit) => findCard(suit));
  const idx = p.hand.map((_, i) => i);
  ok(!applyTrekAction(s, p.seat, { type: 'claim', slot: 0, cards: idx }).ok, 'claim away from park rejected');
  p.node = park.node;
  const deckBefore = s.parkDeck.length;
  ok(applyTrekAction(s, p.seat, { type: 'claim', slot: 0, cards: idx }).ok, 'claim at park ok');
  ok(p.parks.includes(parkId), 'park taken');
  ok(s.parkRiver[0] !== parkId && s.parkDeck.length === deckBefore - 1, 'river refilled');
}

// occupy + abilities
{
  const s = mk(3, 9);
  const p = currentTrekPlayer(s);
  const majorId = s.majors[0];
  const m = MAJORS[majorId];
  p.node = m.node;
  p.hand = m.cost.map((suit) => findCard(suit));
  const handBefore = 0;
  s.actionsLeft = 2;
  ok(applyTrekAction(s, p.seat, { type: 'occupy', major: majorId, cards: [0, 1] }).ok, `occupy ${m.name} ok`);
  ok(p.campsites === 2 && p.majors.includes(majorId), 'campsite placed');
  if (m.ability === 'drawTwo') ok(p.hand.length === handBefore + 2, 'Denali drew 2');
  p.hand = m.cost.map((suit) => findCard(suit));
  ok(!applyTrekAction(s, p.seat, { type: 'occupy', major: majorId, cards: [0, 1] }).ok, 'double occupy rejected');
}

// Grand Canyon +1
{
  const s = mk();
  const p = currentTrekPlayer(s);
  const gc = MAJORS.findIndex((m) => m.ability === 'plusOneMove');
  p.majors.push(gc);
  p.campsites--;
  const nb = NEIGHBORS[START][0];
  const nb2 = NEIGHBORS[nb].find((n) => n !== START && !NEIGHBORS[START].includes(n)) ?? NEIGHBORS[nb].find((n) => n !== START)!;
  p.hand = [findCard('Brown', 1)];
  ok(applyTrekAction(s, p.seat, { type: 'move', path: [nb, nb2], cards: [0] }).ok, 'GC: 1-card moves 2');
}

// hand limit + discard
{
  const s = mk();
  const p = currentTrekPlayer(s);
  p.hand = Array(14).fill(findCard('Blue', 1));
  s.actionsLeft = 0;
  ok(!applyTrekAction(s, p.seat, { type: 'end_turn' }).ok, 'end_turn over limit rejected');
  ok(!applyTrekAction(s, p.seat, { type: 'discard', cards: [0, 1, 2] }).ok, 'over-discard rejected');
  ok(applyTrekAction(s, p.seat, { type: 'discard', cards: [0, 1] }).ok, 'discard to limit ok');
  ok(applyTrekAction(s, p.seat, { type: 'end_turn' }).ok, 'end_turn after discard ok');
}

// trek river flush (4 of 5 same suit)
{
  const s = mk();
  const blue = [1, 2, 3, 4].map((v) => findCard('Blue', v as 1 | 2 | 3 | 4));
  s.trekRiver = [blue[0], blue[1], blue[2], blue[3], findCard('Red', 1)];
  const before = [...s.trekRiver];
  const dr = applyTrekAction(s, currentTrekPlayer(s).seat, { type: 'draw', source: 'deck' });
  ok(dr.ok, 'deck draw ok');
  // trigger settle via a river draw
  const s2 = mk(2, 13);
  s2.trekRiver = [blue[0], blue[1], blue[2], findCard('Red', 1), blue[3]];
  applyTrekAction(s2, currentTrekPlayer(s2).seat, { type: 'draw', source: 3 });
  const suits = s2.trekRiver.filter((c): c is number => c !== null).map((c) => TREK_CATALOG[c].suit);
  const maxSame = Math.max(...['Blue', 'Yellow', 'Purple', 'Red', 'Green', 'Brown'].map((x) => suits.filter((y) => y === x).length));
  ok(maxSame < 4, `river settled after flush (${suits.join(',')})`);
  void before;
}

// end trigger: 5th park finishes the round; scoring + tie-breaks
{
  const s = mk(3, 21);
  s.first = 0; s.turn = 0; s.actionsLeft = 0;
  s.players[0].parks = [0, 1, 2, 3, 4];
  applyTrekAction(s, 0, { type: 'end_turn' });
  ok(s.finalRound, 'final round triggered');
  ok(s.phase === 'playing', 'round continues');
  s.actionsLeft = 0;
  applyTrekAction(s, 1, { type: 'end_turn' });
  s.actionsLeft = 0;
  applyTrekAction(s, 2, { type: 'end_turn' });
  ok(s.phase === 'ended', 'game ends with the round');
  const p0 = s.players[0];
  const expect = [0, 1, 2, 3, 4].reduce((t, id) => t + PARKS[id].vp, 0);
  ok(p0.score >= expect, `parks scored (${p0.score} >= ${expect})`);
}

// stone bonuses: strict max, tie cancels, count>0 guard, 2nd-most excludes winner
{
  const s = mk(3, 31);
  const [a, b, c] = s.players;
  a.stones.Yellow = 3; b.stones.Yellow = 3; c.stones.Yellow = 1; // tie for most -> cancel; c takes 2nd
  a.stones.Red = 2; b.stones.Red = 1; // a most, b 2nd
  // Black all zero -> no award
  s.first = 0; s.turn = 2; s.actionsLeft = 0; s.finalRound = true;
  applyTrekAction(s, 2, { type: 'end_turn' });
  ok(s.phase === 'ended', 'scored');
  ok(s.bonuses!.most.Yellow === undefined, 'yellow most canceled by tie');
  // Lua semantics: with Most canceled, the tied players stay eligible for 2nd,
  // so the 3-3 tie cancels the 2nd-Most card as well.
  ok(s.bonuses!.second.Yellow === undefined, 'yellow 2nd also canceled (Lua tie semantics)');
  ok(s.bonuses!.most.Red === a.color && s.bonuses!.second.Red === b.color, 'red most/2nd');
  ok(s.bonuses!.most.Black === undefined && s.bonuses!.second.Black === undefined, 'zero-count no award');
  ok(c.score === 1, 'c = stone VP only');
}

// view redaction
{
  const s = mk(2, 41);
  const v0 = trekViewFor(s, 0);
  ok(v0.players[0].hand !== undefined, 'own hand visible');
  ok(v0.players[1].hand === undefined, 'other hand hidden');
  ok(v0.players[1].handCount === 2, 'hand count public');
  ok(trekViewFor(s, null).players[0].hand === undefined, 'TV sees no hands');
  ok(trekViewFor(s, 'dev').players[1].hand !== undefined, 'dev sees all');
}

console.log(`${pass}/${pass + fail} Trek checks passed`);
process.exit(fail ? 1 : 0);
