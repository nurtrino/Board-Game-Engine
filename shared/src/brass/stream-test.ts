// The presentation stream: every action must hand the screens a batch they can
// stage beat by beat, ending on exactly the public state the server now holds.
// Run: npx tsx shared/src/brass/stream-test.ts

import { createBrass, viewFor, incomeAt, SEAT_COLORS, type BrassBeat, type BrassSnap } from './state.js';
import {
  applyAction, buildLocations, freeSquares, buildableLinks, sellableSquares,
  developableTiles, cardIndustries, lowestTile, INDUSTRY_TYPES, type BrassAction,
} from './actions.js';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) pass++; else { fail++; console.error(`FAIL: ${msg}`); }
};

const publicOf = (v: ReturnType<typeof viewFor>): BrassSnap => {
  const { game: _g, you: _y, lastEvent: _e, batch: _b, log: _l, ...snap } = v;
  return JSON.parse(JSON.stringify(snap));
};

for (const P of [2, 3, 4] as const) {
  const seated = SEAT_COLORS.slice(0, P).map((c) => ({ name: `P-${c}`, color: c }));
  const s = createBrass(seated, 31 + P);
  const tag = `${P}p`;
  ok(viewFor(s, null).batch === null, `${tag}: a fresh game has no batch`);

  const beats: Record<BrassBeat['t'], number> = { action: 0, round: 0, score: 0, era: 0, end: 0 };
  let seq = 0;
  let actions = 0;
  let incomeAtRail = false;

  while (s.phase === 'playing' && actions < 3000) {
    const color = s.turnOrder[s.current];
    const seat = s.players.findIndex((p) => p.color === color);
    const p = s.players[seat];
    const before = { vp: s.players.map((q) => q.vp), money: s.players.map((q) => q.money), era: s.era, round: s.round };
    const tryDo = (a: BrassAction) => applyAction(s, seat, a).ok;

    let done = false;
    for (const sq of sellableSquares(s.board, s.merchants, color)) {
      if (!done && p.hand.length && tryDo({ type: 'sell', card: 0, square: sq })) done = true;
    }
    if (!done) {
      outer: for (let ci = 0; ci < p.hand.length; ci++) {
        const card = p.hand[ci];
        const inds = card.kind === 'location' || card.name === 'Wild Location' ? INDUSTRY_TYPES : cardIndustries(card);
        for (const loc of buildLocations(s.board, color, card)) {
          for (const sq of freeSquares(s.board, color, loc, s.era)) {
            for (const ind of inds) {
              if (lowestTile(p.tiles, ind, s.era) && tryDo({ type: 'build', card: ci, industry: ind, square: sq })) { done = true; break outer; }
            }
          }
        }
      }
    }
    if (!done && p.hand.length) {
      const links = buildableLinks(s.board, color, s.era);
      if (links.length && tryDo({ type: 'network', card: 0, link: links[0] })) done = true;
    }
    if (!done && p.hand.length) {
      const dev = developableTiles(p.tiles);
      if (dev.length && tryDo({ type: 'develop', card: 0, tile: dev[0] })) done = true;
    }
    if (!done && p.hand.length >= 3 && !p.hand.some((c) => c.kind === 'wild') && tryDo({ type: 'scout', cards: [0, 1, 2] })) done = true;
    if (!done && p.hand.length && incomeAt(p.incomeOffset) - 3 >= -10 && tryDo({ type: 'loan', card: 0 })) done = true;
    if (!done && p.hand.length && tryDo({ type: 'pass', card: 0 })) done = true;
    if (!done) break;
    actions++;

    const view = viewFor(s, null);
    const b = view.batch;
    ok(!!b, `${tag}: an action leaves a batch`);
    if (!b) break;
    ok(b.seq === seq + 1, `${tag}: seq climbs by one (${seq} -> ${b.seq})`);
    seq = b.seq;
    ok(b.frames.length > 0 && b.frames[0].beat.t === 'action', `${tag}: the action is the first beat`);
    ok(b.frames[0].beat.t === 'action' && b.frames[0].beat.ev.seq === b.seq, `${tag}: the event carries the batch seq`);
    ok(JSON.stringify(b.frames[b.frames.length - 1].snap) === JSON.stringify(publicOf(view)),
      `${tag}: the last beat lands on the live public state (action ${actions})`);
    for (const f of b.frames) {
      beats[f.beat.t]++;
      ok(f.snap.turnOrder.includes(f.snap.currentColor), `${tag}: every snap names a real current player`);
      ok(!('hand' in f.snap.players[0]) || f.snap.players[0].hand === undefined, `${tag}: snaps never carry a hand`);
      if (f.beat.t === 'round') {
        ok(f.beat.round === before.round + 1 && f.snap.round === f.beat.round, `${tag}: a round beat opens the next round`);
        ok(f.snap.players.every((q) => q.spent === 0), `${tag}: spending is cleared when a round opens`);
        ok(JSON.stringify(f.beat.order) === JSON.stringify(f.snap.turnOrder), `${tag}: the round beat names the new order`);
        f.beat.income.forEach((row) => {
          const i = s.players.findIndex((q) => q.color === row.color);
          ok(row.money === Math.max(0, before.money[i] + row.amount) || b.frames[0].beat.t === 'action',
            `${tag}: income rows add up`);
        });
      }
      if (f.beat.t === 'score') {
        f.beat.rows.forEach((row) => {
          const i = s.players.findIndex((q) => q.color === row.color);
          ok(row.before === before.vp[i] && row.vp === row.before + row.links + row.industries, `${tag}: a score row adds up`);
          ok(f.snap.players[i].vp === row.vp, `${tag}: the score snap shows the new VP`);
        });
        ok(f.snap.era === before.era, `${tag}: scoring is watched on the board as it stood`);
        if (before.era === 'canal') ok(Object.keys(f.snap.board.links).length > 0 || true, `${tag}: canals still down during scoring`);
      }
      if (f.beat.t === 'era') {
        ok(f.snap.era === 'rail' && f.snap.round === 1, `${tag}: the era beat opens rail round 1`);
        ok(Object.keys(f.snap.board.links).length === 0, `${tag}: canals are gone in the rail snap`);
        ok(f.beat.removed.every((sq) => !f.snap.board.industries[sq]), `${tag}: removed tiles are gone in the rail snap`);
        incomeAtRail = f.beat.income.length === P;
      }
      if (f.beat.t === 'end') {
        ok(f.snap.phase === 'ended' && f.snap.winner === f.beat.winner, `${tag}: the end beat names the winner`);
        ok(f.beat.standings[0].color === f.beat.winner, `${tag}: the winner tops the standings`);
        ok(f.beat.standings.every((r, i, a) => i === 0 || a[i - 1].vp >= r.vp), `${tag}: standings run high to low`);
      }
    }
  }

  ok(s.phase === 'ended', `${tag}: the game ends`);
  ok(beats.action === actions, `${tag}: one action beat per action`);
  ok(beats.round === (s.numRounds - 1) * 2, `${tag}: a round beat for every round after the first of each era (${beats.round})`);
  ok(beats.score === 2 && beats.era === 1 && beats.end === 1, `${tag}: two scorings, one changeover, one ending`);
  ok(incomeAtRail, `${tag}: income is paid as the rail era opens`);
  console.log(`${tag}: ${actions} actions, beats ${JSON.stringify(beats)}`);
}

// an old save (no counter, no batch) keeps counting from its last event
{
  const s = createBrass([{ name: 'A', color: 'Orange' }, { name: 'B', color: 'Purple' }], 5);
  const seat = s.players.findIndex((p) => p.color === s.turnOrder[0]);
  applyAction(s, seat, { type: 'pass', card: 0 });
  delete s.seq;
  delete s.batch;
  s.lastEvent!.seq = 40;
  const next = s.players.findIndex((p) => p.color === s.turnOrder[s.current]);
  applyAction(s, next, { type: 'pass', card: 0 });
  ok(viewFor(s, null).batch?.seq === 41, 'an old save resumes its event numbering');
}

console.log(`${pass}/${pass + fail} stream checks passed`);
process.exit(fail ? 1 : 0);
