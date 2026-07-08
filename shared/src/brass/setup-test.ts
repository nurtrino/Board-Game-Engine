// Golden test: createBrass() must reproduce the extracted golden setup.
// Randomized parts (shuffles, deals) are checked as multisets/invariants, never
// as order. Run: npx tsx shared/src/brass/setup-test.ts

import data from './setup-data.json';
import { createBrass, viewFor, incomeAt, SEAT_COLORS, type Card } from './state.js';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) pass++; else { fail++; console.error(`FAIL: ${msg}`); } };
const multiset = (xs: string[]) => xs.slice().sort().join('|');

for (const P of [2, 3, 4] as const) {
  // deliberately NOT in default order — colors are the players' own picks
  const picked = [...SEAT_COLORS].reverse().slice(0, P);
  const seated = picked.map((c) => ({ name: `P-${c}`, color: c }));
  // two seeds, to make sure invariants hold regardless of shuffle
  for (const seed of [1, 424242]) {
    const s = createBrass(seated, seed);
    const tag = `${P}p/seed${seed}`;

    ok(s.players.length === P, `${tag}: ${P} players`);
    ok(s.players.every((p, i) => p.color === picked[i]), `${tag}: players keep their chosen colors`);
    ok(s.merchants.every((m) => typeof m.slot === 'number'), `${tag}: merchants carry golden slot indices`);

    // starting resources
    ok(s.players.every((p) => p.money === data.constants.initialFunds), `${tag}: everyone has £${data.constants.initialFunds}`);
    ok(s.players.every((p) => p.vp === 0), `${tag}: everyone at 0 VP`);
    ok(s.players.every((p) => p.incomeOffset === data.markerStarts.income), `${tag}: income markers at start offset`);
    ok(incomeAt(data.markerStarts.income) === 0, `${tag}: starting income is £0`);
    ok(s.players.every((p) => p.links === data.constants.linksPerPlayerPerEra), `${tag}: 14 links each`);

    // hands: 8 each
    ok(s.players.every((p) => p.hand.length === data.constants.handSize), `${tag}: 8-card hands`);

    // card conservation: hands + draw + dead == the full deck multiset
    const dealt = s.players.flatMap((p) => p.hand);
    const all = [...dealt, ...s.drawDeck, ...s.deadCards];
    ok(all.length === data.decks[P].size, `${tag}: ${all.length} cards accounted == deck ${data.decks[P].size}`);
    ok(multiset(all.map((c: Card) => c.name)) === multiset((data.decks[P].list as Card[]).map((c) => c.name)),
      `${tag}: cards in play are exactly the ${P}p deck`);
    ok(s.deadCards.length === P, `${tag}: ${P} dead cards removed`);
    ok(s.drawDeck.length === data.decks[P].size - P - P * data.constants.handSize,
      `${tag}: draw deck ${s.drawDeck.length} == ${data.decks[P].size} - ${P} dead - ${P * data.constants.handSize} dealt`);

    // tile pools match the catalog
    for (const p of s.players) {
      for (const [name, d] of Object.entries(data.industryTiles)) {
        ok(p.tiles[name] === (d as { count: number }).count, `${tag}: ${p.color} ${name} pool == catalog`);
      }
    }

    // markets untouched from the golden fill
    ok(JSON.stringify(s.markets.coal) === JSON.stringify(data.markets.coal.fill), `${tag}: coal market fill`);
    ok(JSON.stringify(s.markets.iron) === JSON.stringify(data.markets.iron.fill), `${tag}: iron market fill`);

    // merchants: right count for player count, golden multiset, beer on Buys tiles
    const activeSlots = data.merchants.filter((m) => m.players.includes(P)).length;
    ok(s.merchants.length === activeSlots, `${tag}: ${s.merchants.length} merchant slots == ${activeSlots}`);
    ok(multiset(s.merchants.map((m) => m.tile)) === multiset(data.merchantTiles[String(P) as '2' | '3' | '4']),
      `${tag}: merchant tiles == golden multiset`);
    ok(s.merchants.every((m) => m.beer === m.tile.startsWith('Buys ')), `${tag}: beer on every Buys tile`);

    // turn order is a permutation of the seated colors
    ok(multiset(s.turnOrder) === multiset(picked), `${tag}: turn order is the seated colors`);
    ok(s.numRounds === data.constants.roundsPerEra[String(P) as '2' | '3' | '4'], `${tag}: ${s.numRounds} rounds`);

    // view redaction: TV sees no hands; a seat sees only its own; dev sees all
    const tv = viewFor(s, null);
    ok(tv.players.every((p) => p.hand === undefined) && tv.players.every((p) => p.handCount === 8), `${tag}: TV sees hand counts, not cards`);
    const seat0 = viewFor(s, 0);
    ok(seat0.players[0].hand?.length === 8 && seat0.players[1].hand === undefined, `${tag}: seat 0 sees only its own hand`);
    const dev = viewFor(s, 'dev');
    ok(dev.players.every((p) => p.hand?.length === 8), `${tag}: dev sees all hands`);
  }

  // determinism: same seed -> identical state
  const a = JSON.stringify(createBrass(seated, 7));
  const b = JSON.stringify(createBrass(seated, 7));
  ok(a === b, `${P}p: same seed is deterministic`);
}

console.log(`${pass}/${pass + fail} setup checks passed`);
process.exit(fail ? 1 : 0);
