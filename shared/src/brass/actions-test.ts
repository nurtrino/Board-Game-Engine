// Playthrough smoke test for the action engine: drives full games with a
// greedy policy (sell > build > network > develop > scout > loan > pass),
// asserting invariants the whole way. Run: npx tsx shared/src/brass/actions-test.ts

import { createBrass, incomeAt, SEAT_COLORS } from './state.js';
import {
  applyAction, buildLocations, freeSquares, buildableLinks, sellableSquares,
  developableTiles, cardIndustries, lowestTile, INDUSTRY_TYPES,
  type BrassAction,
} from './actions.js';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) { pass++; } else { fail++; console.error(`FAIL: ${msg}`); }
};

for (const P of [2, 4] as const) {
  for (const seed of [11, 99]) {
    const seated = SEAT_COLORS.slice(0, P).map((c) => ({ name: `P-${c}`, color: c }));
    const s = createBrass(seated, seed);
    const tag = `${P}p/seed${seed}`;
    let actions = 0;
    let builds = 0, networks = 0, sells = 0, loans = 0, scouts = 0, develops = 0;

    while (s.phase === 'playing' && actions < 3000) {
      const color = s.turnOrder[s.current];
      const seat = s.players.findIndex((p) => p.color === color);
      const p = s.players[seat];
      ok(p.hand.length > 0 || s.drawDeck.length === 0, `${tag}: hand only empty when deck dry`);

      const tryDo = (a: BrassAction): boolean => applyAction(s, seat, a).ok;
      let done = false;

      // sell if possible
      for (const sq of sellableSquares(s.board, s.merchants, color)) {
        if (done) break;
        if (p.hand.length && tryDo({ type: 'sell', card: 0, square: sq })) { sells++; done = true; }
      }
      // build: first card that yields a legal square
      if (!done) {
        outer: for (let ci = 0; ci < p.hand.length; ci++) {
          const card = p.hand[ci];
          const industries = card.kind === 'location' || card.name === 'Wild Location'
            ? INDUSTRY_TYPES
            : cardIndustries(card);
          for (const loc of buildLocations(s.board, color, card)) {
            for (const sq of freeSquares(s.board, color, loc, s.era)) {
              for (const ind of industries) {
                if (!lowestTile(p.tiles, ind, s.era)) continue;
                if (tryDo({ type: 'build', card: ci, industry: ind, square: sq })) {
                  builds++; done = true; break outer;
                }
              }
            }
          }
        }
      }
      // network
      if (!done && p.hand.length) {
        const links = buildableLinks(s.board, color, s.era);
        if (links.length && tryDo({ type: 'network', card: 0, link: links[0] })) { networks++; done = true; }
      }
      // develop
      if (!done && p.hand.length) {
        const dev = developableTiles(p.tiles);
        if (dev.length && tryDo({ type: 'develop', card: 0, tile: dev[0] })) { develops++; done = true; }
      }
      // scout
      if (!done && p.hand.length >= 3 && !p.hand.some((c) => c.kind === 'wild')) {
        if (tryDo({ type: 'scout', cards: [0, 1, 2] })) { scouts++; done = true; }
      }
      // loan
      if (!done && p.hand.length && incomeAt(p.incomeOffset) - 3 >= -10) {
        if (tryDo({ type: 'loan', card: 0 })) { loans++; done = true; }
      }
      // pass
      if (!done && p.hand.length) {
        ok(tryDo({ type: 'pass', card: 0 }), `${tag}: pass always legal with a card`);
        done = true;
      }
      if (!done) break; // no cards, no actions — deck dry endgame edge
      actions++;

      ok(p.money >= 0, `${tag}: money never negative (${p.money})`);
      ok(p.hand.length <= 8, `${tag}: hand never exceeds 8`);
    }

    ok(s.phase === 'ended', `${tag}: game reaches the end (${actions} actions)`);
    ok(s.winner !== null, `${tag}: a winner is declared`);
    ok(builds > 0 && networks > 0 && loans + scouts + develops + sells > 0,
      `${tag}: variety of actions occurred (b${builds} n${networks} s${sells} d${develops} sc${scouts} l${loans})`);
    ok(Object.keys(s.board.links).length === 0 || s.era === 'rail', `${tag}: canal links cleared at era end`);
    ok(s.players.every((pl) => pl.vp >= 0), `${tag}: VP non-negative`);
    console.log(`${tag}: ${actions} actions — builds ${builds}, networks ${networks}, sells ${sells}, develops ${develops}, scouts ${scouts}, loans ${loans}; winner ${s.winner} (${s.players.map((pl) => `${pl.color}:${pl.vp}vp`).join(' ')})`);
  }
}

console.log(`${pass}/${pass + fail} action checks passed`);
process.exit(fail ? 1 : 0);
