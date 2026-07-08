// Verify full games finish at 2, 3 and 4 players (greedy policy).
// Run: npx tsx shared/src/brass/playercount-test.ts

import { createBrass, incomeAt, SEAT_COLORS } from './state.js';
import {
  applyAction, buildLocations, freeSquares, buildableLinks, sellableSquares,
  developableTiles, cardIndustries, lowestTile, INDUSTRY_TYPES, type BrassAction,
} from './actions.js';

function playout(P: 2 | 3 | 4, seed: number) {
  const seated = SEAT_COLORS.slice(0, P).map((c) => ({ name: `P-${c}`, color: c }));
  const s = createBrass(seated, seed);
  let acts = 0;
  const counts: Record<string, number> = { build: 0, network: 0, sell: 0, develop: 0, scout: 0, loan: 0, pass: 0 };
  while (s.phase === 'playing' && acts < 4000) {
    const color = s.turnOrder[s.current];
    const seat = s.players.findIndex((p) => p.color === color);
    const p = s.players[seat];
    if (!p.hand.length && s.drawDeck.length === 0) break;
    let done = false;
    const tryDo = (a: BrassAction, k: string) => { if (applyAction(s, seat, a).ok) { counts[k]++; return true; } return false; };
    for (const sq of sellableSquares(s.board, s.merchants, color)) { if (done) break; if (p.hand.length && tryDo({ type: 'sell', card: 0, square: sq }, 'sell')) done = true; }
    if (!done) outer: for (let ci = 0; ci < p.hand.length; ci++) {
      const card = p.hand[ci];
      const inds = card.kind === 'location' || card.name === 'Wild Location' ? INDUSTRY_TYPES : cardIndustries(card);
      for (const loc of buildLocations(s.board, color, card)) for (const sq of freeSquares(s.board, color, loc, s.era)) for (const ind of inds) {
        if (!lowestTile(p.tiles, ind, s.era)) continue;
        if (tryDo({ type: 'build', card: ci, industry: ind, square: sq }, 'build')) { done = true; break outer; }
      }
    }
    if (!done && p.hand.length) { const l = buildableLinks(s.board, color, s.era); if (l.length && tryDo({ type: 'network', card: 0, link: l[0] }, 'network')) done = true; }
    if (!done && p.hand.length) { const d = developableTiles(p.tiles); if (d.length && tryDo({ type: 'develop', card: 0, tile: d[0] }, 'develop')) done = true; }
    if (!done && p.hand.length >= 3 && !p.hand.some((c) => c.kind === 'wild')) { if (tryDo({ type: 'scout', cards: [0, 1, 2] }, 'scout')) done = true; }
    if (!done && p.hand.length && incomeAt(p.incomeOffset) - 3 >= -10) { if (tryDo({ type: 'loan', card: 0 }, 'loan')) done = true; }
    if (!done && p.hand.length) { tryDo({ type: 'pass', card: 0 }, 'pass'); done = true; }
    if (!done) break;
    acts++;
  }
  return { ended: s.phase === 'ended', winner: s.winner, acts, counts, scores: s.players.map((p) => `${p.color}:${p.vp}`) };
}

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

for (const P of [2, 3, 4] as const) {
  for (const seed of [1, 7, 55]) {
    const r = playout(P, seed);
    ok(r.ended, `${P}p/seed${seed} finishes (${r.acts} actions)`);
    ok(r.winner !== null, `${P}p/seed${seed} declares a winner`);
    ok(r.counts.build > 0 && r.counts.network > 0, `${P}p/seed${seed} sees builds + networks`);
    // per-count structural facts
    const expectedRounds = 12 - P; // per era
    console.log(`${P}p/seed${seed}: ${r.ended ? 'FINISHED' : 'STALLED'} ${r.acts} acts, winner ${r.winner} — ${Object.entries(r.counts).map(([k, v]) => k[0] + v).join(' ')} — ${r.scores.join(' ')} (rounds/era ${expectedRounds})`);
  }
}

console.log(`${pass}/${pass + fail} player-count checks passed`);
process.exit(fail ? 1 : 0);
