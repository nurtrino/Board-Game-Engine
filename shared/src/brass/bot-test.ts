// The computer seats play whole games against each other: every first choice
// must be a move the engine accepts, every game must finish, and the play must
// look like Brass (sales, links, both eras scored).
// Run: npx tsx shared/src/brass/bot-test.ts

import { createBrass, viewFor, SEAT_COLORS } from './state.js';
import { applyAction } from './actions.js';
import { brassBotMoves } from './bot.js';
import { mulberry32 } from './rng.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

for (const P of [2, 3, 4] as const) {
  for (const seed of [3, 11, 42, 77, 2026]) {
    const s = createBrass(SEAT_COLORS.slice(0, P).map((c) => ({ name: `CPU ${c}`, color: c })), seed);
    const rnd = mulberry32(seed * 31 + P);
    const counts: Record<string, number> = { build: 0, network: 0, sell: 0, develop: 0, scout: 0, loan: 0, pass: 0 };
    let acts = 0, refused = 0, stuck = false;
    while (s.phase === 'playing' && acts < 2000) {
      const seat = s.players.findIndex((p) => p.color === s.turnOrder[s.current]);
      const view = viewFor(s, seat);
      const moves = brassBotMoves(view, rnd);
      // the bot may only read its own hand
      if (view.players.some((p, i) => i !== seat && p.hand)) { ok(false, 'view leaks another hand'); break; }
      let done = false;
      for (let i = 0; i < moves.length; i++) {
        const r = applyAction(s, seat, moves[i]);
        if (r.ok) { counts[moves[i].type]++; done = true; break; }
        refused++;
        console.error(`refused (${P}p seed ${seed}): ${JSON.stringify(moves[i])} -> ${r.error}`);
      }
      if (!done) { stuck = true; break; }
      acts++;
    }
    const vps = s.players.map((p) => p.vp);
    const label = `${P}p/seed${seed}`;
    ok(!stuck, `${label} always has a move`);
    ok(s.phase === 'ended' && s.winner !== null, `${label} finishes with a winner`);
    ok(refused === 0, `${label} first choice is always legal (${refused} refused)`);
    ok(counts.sell > 0 && counts.network > 0 && counts.build > 0, `${label} builds, links and sells`);
    ok(counts.pass <= acts * 0.15, `${label} rarely passes (${counts.pass} of ${acts})`);
    ok(Math.max(...vps) >= 60, `${label} winner scores like a player (${Math.max(...vps)})`);
    console.log(`${label}: ${acts} acts, ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')} | VP ${vps.join(' ')}`);
  }
}

console.log(`${pass}/${pass + fail} bot checks passed`);
process.exit(fail ? 1 : 0);
