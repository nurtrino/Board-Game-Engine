// Validate the extractor against a real TTS runtime dump.
//
// After running tools/tts-extract/tts-dump-setup.lua inside Tabletop Simulator
// (see its header), save the JSON between DUMP-BEGIN/END as
// games/brass-birmingham/golden/tts-dump.json and run:
//   node tools/tts-extract/validate-dump.mjs
//
// Setup is randomized (shuffles, deals), so randomized parts compare as
// multisets and invariants, never as order.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const golden = JSON.parse(readFileSync(join(root, 'games', 'brass-birmingham', 'golden', 'mod-setup.json'), 'utf8'));
const dump = JSON.parse(readFileSync(join(root, 'games', 'brass-birmingham', 'golden', 'tts-dump.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error(`FAIL: ${msg}`); } };

// The merchant zones overlap the game board object itself, and blank merchant
// tiles carry empty GMNotes — so a reported tile of "Game Board" means the
// zone holds no named tile (i.e. blank or empty). Normalize it away.
for (const m of Object.values(dump.merchants ?? {})) {
  if (m && m.tile === 'Game Board') m.tile = null;
}

const activeColors = Object.keys(dump.hands ?? {});
const numPlayers = activeColors.length;
ok(numPlayers >= 2 && numPlayers <= 4, `player count ${numPlayers}`);

// Markets are untouched by setup: must equal the golden fill exactly.
ok(JSON.stringify(dump.coal_fill) === JSON.stringify(golden.markets.coal.fill), `coal market ${dump.coal_fill?.join('')} == ${golden.markets.coal.fill.join('')}`);
ok(JSON.stringify(dump.iron_fill) === JSON.stringify(golden.markets.iron.fill), `iron market ${dump.iron_fill?.join('')} == ${golden.markets.iron.fill.join('')}`);

// Hands: exactly handSize cards each.
for (const c of activeColors) {
  ok(dump.hands[c].length === golden.constants.handSize, `${c} hand size ${dump.hands[c].length} == ${golden.constants.handSize}`);
}

// Card conservation: hand cells + remaining deck cells must be a sub-multiset
// of the full per-player-count deck, short exactly one dead card per player
// (dealt face down to each discard area during setup).
const goldenCells = { ...golden.decks[numPlayers].cells };
const seen = {};
for (const c of activeColors) for (const id of dump.hands[c]) seen[id] = (seen[id] || 0) + 1;
for (const id of dump.deck.cells ?? []) seen[id] = (seen[id] || 0) + 1;
let overdrawn = [];
let missing = 0;
for (const [id, n] of Object.entries(goldenCells)) {
  const s = seen[id] || 0;
  if (s > n) overdrawn.push(id);
  missing += Math.max(0, n - s);
}
for (const id of Object.keys(seen)) if (!goldenCells[id]) overdrawn.push(id);
ok(overdrawn.length === 0, `cards in play all come from the ${numPlayers}p deck (bad: ${overdrawn})`);
ok(missing === numPlayers, `unaccounted cards ${missing} == ${numPlayers} dead cards`);
ok(dump.deck.size === golden.decks[numPlayers].size - numPlayers - numPlayers * golden.constants.handSize,
  `deck size ${dump.deck.size} == ${golden.decks[numPlayers].size} - ${numPlayers} dead - ${numPlayers * golden.constants.handSize} dealt`);

// Merchants: the active slots for this player count hold exactly the golden
// merchant tile multiset; beer sits on every "Buys ..." tile and nowhere else.
const activeSlots = golden.merchants
  .map((m, i) => ({ ...m, i }))
  .filter((m) => m.players.includes(numPlayers));
const placedTiles = activeSlots.map((m) => dump.merchants[m.i]?.tile ?? 'Blank').map((t) => t || 'Blank');
const sortedPlaced = [...placedTiles].sort();
const sortedGolden = [...golden.merchantTiles[numPlayers]].sort();
ok(JSON.stringify(sortedPlaced) === JSON.stringify(sortedGolden),
  `merchant tiles [${sortedPlaced}] == golden [${sortedGolden}]`);
for (const m of activeSlots) {
  const d = dump.merchants[m.i];
  const buys = (d.tile ?? '').startsWith('Buys ');
  ok(d.beer === buys, `${m.location} slot ${m.i}: beer ${d.beer} matches tile '${d.tile}'`);
}
for (const m of golden.merchants.map((mm, i) => ({ ...mm, i })).filter((mm) => !mm.players.includes(numPlayers))) {
  const d = dump.merchants[m.i];
  ok(!d?.tile, `inactive ${m.location} slot ${m.i} is empty`);
}

// Markers: every active color on the golden start offsets.
for (const c of activeColors) {
  ok(dump.markers[c]?.income === golden.markerStarts.income, `${c} income marker at ${dump.markers[c]?.income} == ${golden.markerStarts.income}`);
  ok(dump.markers[c]?.score === golden.markerStarts.score, `${c} score marker at ${dump.markers[c]?.score} == ${golden.markerStarts.score}`);
}

console.log(`${pass}/${pass + fail} dump checks passed`);
process.exit(fail ? 1 : 0);
