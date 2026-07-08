// Rails & Sails engine test: full greedy-bot playthroughs at 2-5 players with
// conservation invariants (cards, pieces, routes) checked every action.
// Run: npx tsx shared/src/ttr/ttr-test.ts

import { createTtr, ttrViewFor, TTR_COLORS, CATALOG, CATALOG_COUNT, ROUTES, RULES, type TtrState, type CardColor } from './state.js';
import {
  applyTtrAction, currentPlayer, claimableRoutes, bestCardsFor, harborCities, harborCardsFor,
  scoreTicket, type TtrAction,
} from './actions.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

const TOTAL_CARDS = CATALOG_COUNT.reduce((a, b) => a + b, 0);

function checkInvariants(s: TtrState, tag: string): void {
  // travel-card conservation
  let cards = s.trainDeck.length + s.shipDeck.length + s.trainDiscard.length + s.shipDiscard.length;
  cards += s.market.filter((c) => c !== null).length;
  for (const p of s.players) cards += p.hand.length;
  if (cards !== TOTAL_CARDS) { ok(false, `${tag}: card conservation ${cards} != ${TOTAL_CARDS}`); }
  // piece conservation per player
  for (const p of s.players) {
    const placed = Object.entries(s.routeOwners).filter(([, o]) => o === p.color)
      .reduce((a, [id]) => a + ROUTES.find((r) => r.id === id)!.length, 0);
    const total = p.trains + p.ships + p.boxTrains + p.boxShips + placed;
    if (s.phase !== 'setup' && total !== RULES.maxTrains + RULES.maxShips) {
      ok(false, `${tag}: ${p.color} piece conservation ${total}`);
    }
  }
  // routes owned once
  for (const id of Object.keys(s.routeOwners)) {
    if (!ROUTES.some((r) => r.id === id)) ok(false, `${tag}: unknown route ${id}`);
  }
}

function playout(P: number, seed: number) {
  const seated = TTR_COLORS.slice(0, P).map((c) => ({ name: `Bot-${c}`, color: c }));
  const s = createTtr(seated, seed);

  // setup: everyone keeps the 3 highest tickets, 20 trains / 40 ships
  for (let seat = 0; seat < P; seat++) {
    const p = s.players[seat];
    const byValue = p.pendingTickets.map((t, i) => ({ i, v: t.points })).sort((a, b) => b.v - a.v);
    const r = applyTtrAction(s, seat, { type: 'setup_ready', tickets: byValue.slice(0, 3).map((x) => x.i), trains: 20, ships: 40 });
    ok(r.ok, `${P}p/${seed} setup seat ${seat}: ${r.error ?? ''}`);
  }
  ok(s.phase === 'playing', `${P}p/${seed} enters play`);

  let acts = 0;
  const counts: Record<string, number> = { claim: 0, draw: 0, tickets: 0, harbor: 0, exchange: 0 };
  while (s.phase === 'playing' && acts < 3000) {
    const p = currentPlayer(s);
    const seat = p.seat;
    const tryDo = (a: TtrAction) => {
      const r = applyTtrAction(s, seat, a);
      if (r.ok) checkInvariants(s, `${P}p/${seed}@${acts}`);
      return r.ok;
    };

    let did = false;
    if (p.pendingTickets.length) {
      // keep tickets we can still hope to finish (greedy: keep 1 best)
      const scored = p.pendingTickets.map((t, i) => ({ i, v: scoreTicket(s, p.color, t) > 0 ? 100 + t.points : t.points }));
      scored.sort((a, b) => b.v - a.v);
      did = tryDo({ type: 'keep_tickets', keep: [scored[0].i] });
      ok(did, `${P}p/${seed} keep_tickets`);
      acts++; continue;
    }

    // 1) claim the longest claimable route
    const claimable = claimableRoutes(s, p)
      .map((id) => ROUTES.find((r) => r.id === id)!)
      .sort((a, b) => b.length - a.length);
    for (const r of claimable) {
      const cards = bestCardsFor(s, p, r.id);
      if (cards && tryDo({ type: 'claim', route: r.id, cards })) { counts.claim++; did = true; break; }
    }
    // 2) harbor if possible
    if (!did && harborCities(s, p).length) {
      const cards = harborCardsFor(p);
      if (cards) {
        const city = harborCities(s, p)[0];
        if (tryDo({ type: 'build_harbor', city, cards })) { counts.harbor++; did = true; }
      }
    }
    // 3) draw travel cards (prefer faceup non-wilds, else blind), then end turn
    if (!did) {
      let drew = 0;
      for (let k = 0; k < 2 && s.phase === 'playing' && currentPlayer(s) === p && s.turnDraws < 2; k++) {
        const slot = s.market.findIndex((c) => c !== null && !CATALOG[c].wild);
        const action: TtrAction = slot >= 0 && k === 0
          ? { type: 'draw_card', source: slot }
          : { type: 'draw_card', source: (acts % 2 === 0 ? 'train' : 'ship') };
        if (tryDo(action)) { drew++; did = true; }
        else break;
      }
      if (drew) { counts.draw++; if (s.turnDraws > 0) tryDo({ type: 'end_turn' }); }
    }
    // 4) fall back to tickets
    if (!did && s.ticketDeck.length) {
      if (tryDo({ type: 'draw_tickets' })) { counts.tickets++; did = true; continue; }
    }
    // 5) exchange as a last resort
    if (!did && p.boxShips > 0) {
      if (tryDo({ type: 'exchange', trains: 0, ships: Math.min(3, p.boxShips) })) { counts.exchange++; did = true; }
    }
    if (!did) break; // stuck
    acts++;
  }

  return { s, acts, counts };
}

for (const P of [2, 3, 4, 5]) {
  for (const seed of [3, 11]) {
    const { s, acts, counts } = playout(P, seed);
    ok(s.phase === 'ended', `${P}p/seed${seed} finishes (${acts} acts, phase=${s.phase})`);
    ok(s.winner !== null, `${P}p/seed${seed} has a winner`);
    ok(counts.claim > 0, `${P}p/seed${seed} claims routes (${counts.claim})`);
    const routes = Object.keys(s.routeOwners).length;
    console.log(`${P}p/seed${seed}: ${s.phase} after ${acts} acts — claims ${counts.claim}, draws ${counts.draw}, tickets ${counts.tickets}, harbors ${counts.harbor}, exch ${counts.exchange}, routes ${routes} — ${s.players.map((p) => `${p.color}:${p.score}`).join(' ')}`);
  }
}

// color enforcement: a colored route rejects the wrong color
{
  const s = createTtr([{ name: 'A', color: 'Green' }, { name: 'B', color: 'Red' }], 5);
  s.players.forEach((p) => { p.ready = true; p.trains = 20; p.ships = 40; p.pendingTickets = []; });
  s.phase = 'playing';
  const colored = ROUTES.find((r) => r.kind === 'rail' && r.color && r.pair === 0 && r.length >= 2)!;
  const wrong: CardColor = colored.color === 'Red' ? 'Green' : 'Red';
  // hand of the wrong solid color
  const wrongId = CATALOG.findIndex((c) => c.type === 'train' && !c.wild && c.color === wrong);
  const rightId = CATALOG.findIndex((c) => c.type === 'train' && !c.wild && c.color === colored.color);
  const p0 = s.players[(s.first) % 2];
  p0.hand = Array(colored.length).fill(wrongId);
  const seat0 = p0.seat;
  ok(!applyTtrAction(s, seat0, { type: 'claim', route: colored.id, cards: p0.hand.map((_, i) => i) }).ok,
    `wrong colour rejected on ${colored.a}-${colored.b} (${colored.color})`);
  p0.hand = Array(colored.length).fill(rightId);
  ok(applyTtrAction(s, seat0, { type: 'claim', route: colored.id, cards: p0.hand.map((_, i) => i) }).ok,
    `right colour accepted on ${colored.a}-${colored.b}`);
}

// end_turn: take a single card then end
{
  const s = createTtr([{ name: 'A', color: 'Green' }, { name: 'B', color: 'Red' }], 9);
  s.players.forEach((p) => { p.ready = true; p.pendingTickets = []; });
  s.phase = 'playing';
  const seat = s.players[s.first % 2].seat;
  ok(applyTtrAction(s, seat, { type: 'draw_card', source: 'train' }).ok, 'first draw ok');
  ok(s.turnDraws === 1, 'turnDraws is 1 after one card');
  ok(applyTtrAction(s, seat, { type: 'end_turn' }).ok, 'can end turn after one draw');
  ok(s.turnDraws === 0 && (s.first + s.turn) % 2 !== s.first % 2, 'turn advanced');
}

// view redaction
{
  const s = createTtr([{ name: 'A', color: 'Green' }, { name: 'B', color: 'Red' }], 1);
  const v0 = ttrViewFor(s, 0);
  ok(v0.players[0].hand !== undefined, 'own hand visible');
  ok(v0.players[1].hand === undefined, 'other hand hidden');
  ok(ttrViewFor(s, null).players[0].hand === undefined, 'TV sees no hands');
  ok(ttrViewFor(s, 'dev').players[1].hand !== undefined, 'dev sees all');
}

console.log(`${pass}/${pass + fail} TTR checks passed`);
process.exit(fail ? 1 : 0);
