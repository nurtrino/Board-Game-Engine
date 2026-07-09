// Dune: Imperium engine test: bot playthroughs at 2-4 players with
// conservation invariants, plus directed rules tests.
// Run: npx tsx shared/src/dune/dune-test.ts

import {
  createDune, duneViewFor, DUNE_SEATS, DUNE_RULES, FACTIONS, LEADERS,
  CARD_BY_ID, SPACE_BY_ID, SPACES, INTRIGUE_BY_ID,
  type DuneState, type DuneSeat, type Faction,
} from './state.js';
import { applyDuneAction, type DuneAction } from './actions.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

function checkInvariants(s: DuneState, tag: string): void {
  for (const p of s.players) {
    const troops = p.supply + p.garrison + p.inConflict;
    if (troops !== DUNE_RULES.troopsTotal) ok(false, `${tag}: ${p.color} troops ${troops} != 12`);
    if (p.solari < 0 || p.spice < 0 || p.water < 0) ok(false, `${tag}: ${p.color} negative resources`);
    if (p.persuasion < 0) ok(false, `${tag}: ${p.color} negative persuasion`);
    if (p.vp < 0) ok(false, `${tag}: ${p.color} negative vp`);
    for (const f of FACTIONS) {
      if (p.influence[f] < 0 || p.influence[f] > 6) ok(false, `${tag}: ${p.color} influence ${f}=${p.influence[f]}`);
    }
    // no duplicate physical cards beyond printed copies
  }
  // each alliance token held by at most one player
  for (const f of FACTIONS) {
    const holders = s.players.filter((p) => p.alliances.includes(f));
    if (holders.length > 1) ok(false, `${tag}: ${f} alliance held twice`);
  }
  // card conservation: every card id across all zones exists in the catalog
  for (const p of s.players) {
    for (const c of [...p.deck, ...p.hand, ...p.discard, ...p.inPlay]) {
      if (!CARD_BY_ID[c]) ok(false, `${tag}: unknown card ${c}`);
    }
  }
}

function mkRng(seed: number) {
  let x = seed * 31 + 7;
  return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; };
}

function playout(P: number, seed: number): DuneState {
  const s = createDune(DUNE_SEATS.slice(0, P).map((c) => ({ name: `Bot-${c}`, color: c })), seed);
  const rng = mkRng(seed);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  let acts = 0;
  let rejected = 0;

  const tryDo = (seat: number, a: DuneAction): boolean => {
    const r = applyDuneAction(s, seat, a);
    acts++;
    if (r.ok) checkInvariants(s, `${P}p/${seed}@${acts}`);
    return r.ok;
  };

  while (s.phase !== 'ended' && acts < 30000) {
    // pending decision?
    if (s.pending.length) {
      const head = s.pending[0];
      const seat = head.seat;
      const p = s.players[seat];
      const d = head.decision as { kind: string; pick?: number; options?: unknown[] };
      let done = false;
      switch (d.kind) {
        case 'influenceAny': done = tryDo(seat, { type: 'choose', faction: pick([...FACTIONS]) }); break;
        case 'influencePickTwo': case 'baronFactions': {
          const fs = [...FACTIONS].sort(() => rng() - 0.5).slice(0, 2) as Faction[];
          done = tryDo(seat, { type: 'choose', factions: fs });
          break;
        }
        case 'influenceWhereBehind': done = tryDo(seat, { type: 'choose', accept: false }); break;
        case 'influencePick': done = tryDo(seat, { type: 'choose', faction: (d as { options: Faction[] }).options[0] }); break;
        case 'voiceSpace': done = tryDo(seat, { type: 'choose', space: pick(SPACES).id }); break;
        case 'trash': {
          const cand = [...p.hand, ...p.discard];
          done = cand.length && rng() < 0.5
            ? tryDo(seat, { type: 'choose', card: pick(cand) })
            : tryDo(seat, { type: 'choose', accept: false });
          break;
        }
        case 'discardOrLoseTroop':
          done = p.hand.length && rng() < 0.5
            ? tryDo(seat, { type: 'choose', card: pick(p.hand) })
            : tryDo(seat, { type: 'choose' });
          if (!done && p.hand.length) done = tryDo(seat, { type: 'choose', card: p.hand[0] });
          break;
        case 'helenaRow': case 'freeAcquire': {
          const rows = s.imperiumRow.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
          done = rows.length ? tryDo(seat, { type: 'choose', option: pick(rows) }) : tryDo(seat, { type: 'choose', accept: false });
          if (!done) done = tryDo(seat, { type: 'choose', accept: false });
          break;
        }
        case 'recallAgent': {
          const mine = Object.entries(s.spaces).find(([, v]) => v.includes(seat));
          done = mine ? tryDo(seat, { type: 'choose', space: mine[0] }) : false;
          if (!done) { ok(false, `${P}p/${seed}: recallAgent stuck`); s.pending.shift(); done = true; }
          break;
        }
        case 'pickOpponentInConflict': {
          const t = s.players.find((q) => q.seat !== seat && q.inConflict > 0);
          done = t ? tryDo(seat, { type: 'choose', seat: t.seat }) : false;
          if (!done) { s.pending.shift(); done = true; }
          break;
        }
        case 'conflictChoice': {
          const n = (d.options ?? []).length;
          if ((d.pick ?? 1) === 1) {
            // try options in random order until one is affordable
            const order = Array.from({ length: n }, (_, i) => i).sort(() => rng() - 0.5);
            for (const o of order) { if (tryDo(seat, { type: 'choose', option: o })) { done = true; break; } }
          } else {
            const order = Array.from({ length: n }, (_, i) => i).sort(() => rng() - 0.5);
            done = tryDo(seat, { type: 'choose', options: order.slice(0, d.pick) });
            if (!done) done = tryDo(seat, { type: 'choose', options: [0, 1] });
          }
          break;
        }
      }
      if (!done) { ok(false, `${P}p/${seed}@${acts}: unresolved pending ${d.kind}`); break; }
      continue;
    }

    const seat = s.turn;
    const p = s.players[seat];

    if (s.phase === 'leaders') {
      tryDo(seat, { type: 'pick_leader', leader: pick(s.leaderPool) });
      continue;
    }

    if (s.phase === 'combat') {
      // sometimes play a combat intrigue
      const combatCards = p.intrigue.filter((c) => INTRIGUE_BY_ID[c]?.kind.includes('combat'));
      if (!s.postCombat && combatCards.length && rng() < 0.4 && p.inConflict > 0) {
        if (tryDo(seat, { type: 'intrigue', card: pick(combatCards) })) continue;
      }
      tryDo(seat, { type: 'combat_pass' });
      continue;
    }

    // round phase
    if (p.actedThisTurn === 'reveal') {
      // acquire while affordable
      const buys: DuneAction[] = [];
      s.imperiumRow.forEach((c, i) => {
        if (c && (CARD_BY_ID[c]?.cost ?? 99) <= p.persuasion) buys.push({ type: 'acquire', row: i });
      });
      if (p.persuasion >= 2) buys.push({ type: 'acquire', reserve: 'arrakisLiaison' });
      if (p.persuasion >= 9 - p.spiceMustFlowBonus) buys.push({ type: 'acquire', reserve: 'theSpiceMustFlow' });
      if (buys.length && rng() < 0.8) { if (tryDo(seat, pick(buys))) continue; }
      tryDo(seat, { type: 'end_turn' });
      continue;
    }
    if (p.actedThisTurn === 'agent') { tryDo(seat, { type: 'end_turn' }); continue; }

    // occasionally play a plot intrigue
    const plots = p.intrigue.filter((c) => INTRIGUE_BY_ID[c]?.kind === 'plot');
    if (plots.length && rng() < 0.25) {
      if (tryDo(seat, { type: 'intrigue', card: pick(plots) })) continue;
    }

    // try an agent turn: random card x random space until one sticks
    let acted = false;
    if (p.agentsLeft + (p.mentat ? 1 : 0) > 0 && p.hand.length && rng() < 0.9) {
      const tries = 14;
      for (let i = 0; i < tries && !acted; i++) {
        const card = pick(p.hand);
        const space = pick(SPACES);
        const a: DuneAction = { type: 'agent', card, space: space.id };
        if (space.id === 'sellMelange') a.sell = 2;
        if (space.combat) a.deploy = Math.floor(rng() * 3);
        const r = applyDuneAction(s, seat, a);
        acts++;
        if (r.ok) { acted = true; checkInvariants(s, `${P}p/${seed}@${acts}`); } else rejected++;
      }
    }
    if (acted) continue;
    if (!p.revealed) { tryDo(seat, { type: 'reveal' }); continue; }
    tryDo(seat, { type: 'end_turn' });
  }

  ok(s.phase === 'ended', `${P}p/${seed}: game ended (acts=${acts}, round=${s.round})`);
  ok(s.round <= DUNE_RULES.rounds, `${P}p/${seed}: rounds ${s.round} <= 10`);
  ok(s.winner !== null, `${P}p/${seed}: winner set`);
  const v = duneViewFor(s, 0);
  ok(v.players[1].hand === undefined, `${P}p/${seed}: opponent hand hidden`);
  ok(Array.isArray(v.players[0].hand), `${P}p/${seed}: own hand visible`);
  // serializable
  const json = JSON.stringify(s);
  ok(JSON.parse(json).players.length === s.players.length, `${P}p/${seed}: serializable`);
  return s;
}

// ---------- playthroughs ----------

for (const P of [2, 3, 4]) {
  for (const seed of [11, 22, 33, 44]) {
    playout(P, P * 1000 + seed);
  }
}

// ---------- directed tests ----------

function fresh(P = 2, seed = 7): DuneState {
  const s = createDune(DUNE_SEATS.slice(0, P).map((c) => ({ name: `T-${c}`, color: c })), seed);
  // deterministic leaders (skip Baron to avoid his pending pick)
  let seat = s.turn;
  const pool = ['paulAtreides', 'arianaThorvald', 'memnonThorvald', 'ilbanRichese'];
  for (let i = 0; i < P; i++) {
    applyDuneAction(s, seat, { type: 'pick_leader', leader: pool[i] });
    seat = s.turn;
  }
  return s;
}

{
  // setup facts
  const s = fresh(4, 5);
  ok(s.players.every((p) => p.vp === 1), '4p starts at 1 VP');
  ok(s.players.every((p) => p.hand.length === 5), 'opening hand of 5');
  ok(s.players.every((p) => p.garrison === 3 && p.supply === 9), '3 garrison troops');
  ok(s.players.every((p) => p.water === 1), '1 starting water');
  ok(s.conflictDeck.length === 9 && s.conflict !== null, '10-round conflict stack');
  ok(s.imperiumRow.length === 5, 'imperium row of 5');
  const s2 = fresh(2, 5);
  ok(s2.players.every((p) => p.vp === 0), '2p starts at 0 VP');
}

{
  // occupancy + icon rules
  const s = fresh(2, 9);
  const p = s.players[s.turn];
  // Dagger is landsraad-only
  const dagger = p.hand.find((c) => c === 'dagger');
  if (dagger) {
    const r = applyDuneAction(s, s.turn, { type: 'agent', card: 'dagger', space: 'secureContract' });
    ok(!r.ok, 'landsraad card rejected at spice-trade space');
  }
  const dune1 = p.hand.find((c) => c === 'duneDesertPlanet');
  if (dune1) {
    const r = applyDuneAction(s, s.turn, { type: 'agent', card: 'duneDesertPlanet', space: 'secureContract' });
    ok(r.ok, 'spice-trade card lands on Secure Contract');
    ok(p.solari === 3, 'Secure Contract pays 3 solari');
    const first = s.turn;
    applyDuneAction(s, first, { type: 'end_turn' });
    const q = s.players[s.turn];
    const dune2 = q.hand.find((c) => c === 'duneDesertPlanet');
    if (dune2) {
      const r2 = applyDuneAction(s, s.turn, { type: 'agent', card: 'duneDesertPlanet', space: 'secureContract' });
      ok(!r2.ok, 'occupied space rejected');
    }
  }
}

{
  // influence track: VP at 2, alliance + bonus at 4
  const s = fresh(2, 13);
  const p = s.players[0];
  const gain = (n: number) => {
    for (let i = 0; i < n; i++) {
      // use the reducer's internals through a real path: fabricate pending
      s.pending.push({ seat: 0, decision: { kind: 'influenceAny', amount: 1, label: 't' } });
      applyDuneAction(s, 0, { type: 'choose', faction: 'fremen' });
    }
  };
  gain(2);
  ok(p.influence.fremen === 2 && p.vp === 1, 'VP at 2 influence');
  const waterBefore = p.water;
  gain(2);
  ok(p.influence.fremen === 4, '4 influence reached');
  ok(p.alliances.includes('fremen'), 'alliance at 4');
  ok(p.water === waterBefore + 1, 'fremen 4-bonus: 1 water');
  // second player can take the alliance only by exceeding
  const q = s.players[1];
  for (let i = 0; i < 4; i++) {
    s.pending.push({ seat: 1, decision: { kind: 'influenceAny', amount: 1, label: 't' } });
    applyDuneAction(s, 1, { type: 'choose', faction: 'fremen' });
  }
  ok(q.influence.fremen === 4 && !q.alliances.includes('fremen') && p.alliances.includes('fremen'), 'tie does not steal alliance');
  s.pending.push({ seat: 1, decision: { kind: 'influenceAny', amount: 1, label: 't' } });
  applyDuneAction(s, 1, { type: 'choose', faction: 'fremen' });
  ok(q.influence.fremen === 5 && q.alliances.includes('fremen') && !p.alliances.includes('fremen'), 'higher influence steals alliance');
}

{
  // sell melange rates
  const s = fresh(2, 21);
  const p = s.players[s.turn];
  p.spice = 5;
  const card = p.hand.find((c) => CARD_BY_ID[c].agents.includes('spiceTrade'));
  if (card) {
    const r = applyDuneAction(s, s.turn, { type: 'agent', card, space: 'sellMelange', sell: 5 });
    ok(r.ok, 'sell melange 5 accepted');
    ok(p.spice === 0 && p.solari === 12, 'sell 5 spice -> 12 solari');
  } else ok(false, 'no spice trade card in opening hand');
}

{
  // reveal math: persuasion + acquire
  const s = fresh(2, 25);
  const p = s.players[s.turn];
  const seat = s.turn;
  applyDuneAction(s, seat, { type: 'reveal' });
  // starter hand: 5 of the 10 starters; count expected persuasion
  const expected = p.inPlay.reduce((a, c) => a + ((CARD_BY_ID[c].reveal?.persuasion as number) ?? 0), 0);
  ok(p.persuasion === expected, `reveal persuasion ${p.persuasion} == ${expected}`);
  if (p.persuasion >= 2) {
    const r = applyDuneAction(s, seat, { type: 'acquire', reserve: 'arrakisLiaison' });
    ok(r.ok && p.discard.includes('arrakisLiaison'), 'acquired Arrakis Liaison to discard');
  }
  const r2 = applyDuneAction(s, seat, { type: 'acquire', reserve: 'theSpiceMustFlow' });
  ok(!r2.ok, 'cannot afford The Spice Must Flow');
}

{
  // combat: strengths, rewards, tie for first
  const s = fresh(2, 31);
  // force a known conflict with vp on 1st
  s.players[0].inConflict = 3;
  s.players[1].inConflict = 3;
  s.players[0].swords = 1;
  // both reveal + end to reach combat
  for (const seat of [s.turn, (s.turn + 1) % 2]) {
    applyDuneAction(s, seat, { type: 'reveal' });
    // drain pendings conservatively
    while (s.pending.length) applyDuneAction(s, s.pending[0].seat, { type: 'choose', accept: false, option: 1, faction: 'emperor' });
    applyDuneAction(s, seat, { type: 'end_turn' });
  }
  ok(s.phase === 'combat', 'combat phase reached');
  const strengths = s.players.map((p) => p.inConflict * 2 + p.swords);
  const expectWinner = strengths[0] === strengths[1] ? null : strengths[0] > strengths[1] ? 0 : 1;
  while (s.phase === 'combat') {
    if (s.pending.length) { applyDuneAction(s, s.pending[0].seat, { type: 'choose', accept: false, option: 0, faction: 'emperor', options: [0, 1] }); continue; }
    applyDuneAction(s, s.turn, { type: 'combat_pass' });
  }
  ok(s.players.every((p) => p.inConflict === 0), 'troops returned after combat');
  ok(s.round === 2, 'round advanced');
  if (expectWinner !== null) {
    const name = s.players[expectWinner].name;
    ok(s.log.some((l) => l.startsWith(`${name}: 1st in`)), 'higher strength won the conflict');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
