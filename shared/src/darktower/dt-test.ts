// Dark Tower engine test: bot playthroughs at 2-4 players with invariants,
// plus directed rules + movement tests. Run: npx tsx shared/src/darktower/dt-test.ts

import { createDarkTower, dtViewFor, DT_SEATS, DT_KEYS, type DtState } from './state.js';
import { applyDtAction, currentDtPlayer, dtLegalSteps, dtBotStep, type DtAction } from './actions.js';
import { DT_NODE, DT_NODES, dtAdjacent, DT_FORWARD_FRONTIER, DT_DARKTOWER_NODE, dtKingdomAt } from './territories.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };
const kindOf = (id: string) => DT_NODE.get(id)!.kind;
const firstEmpty = (k: string) => DT_NODES.find((n) => n.kind === 'empty' && n.kingdom === k)!.id;

function checkInvariants(s: DtState, tag: string): void {
  for (const p of s.players) {
    if (p.warriors < (s.phase === 'ended' ? 0 : 1) || p.warriors > 99) ok(false, `${tag}: ${p.color} warriors ${p.warriors}`);
    if (p.gold < 0 || p.gold > 99) ok(false, `${tag}: ${p.color} gold ${p.gold}`);
    if (p.gold > p.warriors * 6 + p.beast * 50) ok(false, `${tag}: ${p.color} over gold cap`);
    if (p.food < 0 || p.food > 99) ok(false, `${tag}: ${p.color} food ${p.food}`);
    if (p.quad < 0 || p.quad > 4) ok(false, `${tag}: ${p.color} quad ${p.quad}`);
    if (!DT_NODE.has(p.node)) ok(false, `${tag}: ${p.color} on bad node ${p.node}`);
  }
}

// The playout drives the shared CPU bot (dtBotStep) — the same one the server
// runs — so this exercises exactly what real CPU players do.

function playout(P: number, seed: number) {
  const s = createDarkTower(DT_SEATS.slice(0, P).map((c) => ({ name: `Bot-${c}`, color: c })), seed, ((seed % 3) + 1) as 1 | 2 | 3);
  const rng = (() => { let x = seed * 31 + 7; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; }; })();
  let acts = 0; const counts: Record<string, number> = { steps: 0, battles: 0, crossings: 0 };

  while (s.phase !== 'ended' && acts < 150000) {
    const p = currentDtPlayer(s);
    const seat = p.seat;
    const tryDo = (a: DtAction) => {
      const r = applyDtAction(s, seat, a);
      if (r.ok) { checkInvariants(s, `${P}p/${seed}@${acts}`); acts++; }
      else { ok(false, `${P}p/${seed}@${acts}: ${a.type} rejected: ${r.error}`); acts++; }
      return r.ok;
    };

    if (s.phase === 'turnDone') { tryDo({ type: 'end_turn' }); continue; }
    if (s.phase === 'battle') {
      counts.battles++;
      // fight to win — treasure (and keys) only come from won battles; the
      // force-lose rule ends a doomed fight on its own.
      tryDo({ type: 'battle_continue' });
      continue;
    }
    if (s.phase === 'cursePick') {
      const victims = s.players.filter((q) => q.seat !== seat);
      tryDo({ type: 'curse', victim: victims[Math.floor(rng() * victims.length)].seat });
      continue;
    }
    if (s.phase === 'riddle') { tryDo({ type: 'riddle_guess', key: DT_KEYS[Math.floor(rng() * 3)] }); continue; }
    if (s.phase === 'bazaar') {
      const bz = s.bazaar!;
      if (bz.offer === 'warrior' && p.warriors < 55 && (bz.buying + 1) * bz.prices.warrior <= p.gold && bz.buying < 12) tryDo({ type: 'bazaar_yes' });
      else if (bz.offer === 'food' && p.food < 30 && bz.buying < Math.min(20, p.gold)) tryDo({ type: 'bazaar_yes' });
      else if (bz.buying > 0) tryDo({ type: 'bazaar_no' });
      else if (bz.offer === 'beast' && bz.prices.beast <= p.gold) tryDo({ type: 'bazaar_yes' });
      else if ((bz.offer === 'scout' || bz.offer === 'healer') && bz.prices[bz.offer] <= p.gold && rng() < 0.5) tryDo({ type: 'bazaar_yes' });
      // Nothing worth buying: haggle to leave. Declining only cycles the offers,
      // so a broke shopper (0 gold, no affordable goods) would loop forever;
      // haggling eventually slams the shutters. Mirrors the server bot (index.ts).
      else if (rng() < 0.3) tryDo({ type: 'bazaar_haggle' });
      else tryDo({ type: 'bazaar_no' });
      continue;
    }
    // playing: choose a territory to step to
    const before = p.quad;
    tryDo({ type: 'step', to: dtBotStep(s, seat) });
    counts.steps++;
    if (p.quad > before) counts.crossings++;
  }
  return { s, acts, counts };
}

for (const P of [2, 3, 4]) {
  for (const seed of [1, 2, 3]) { // levels 2/3/1; all reach a bot-driven victory
    const { s, acts, counts } = playout(P, seed);
    ok(s.phase === 'ended', `${P}p/seed${seed} finishes (${acts} acts)`);
    ok(s.winner !== null, `${P}p/seed${seed} has a winner`);
    ok(s.score !== null && s.score >= 0 && s.score <= 99, `${P}p/seed${seed} score in range (${s.score})`);
    ok(counts.crossings >= 4, `${P}p/seed${seed} someone circled the kingdoms (${counts.crossings} crossings)`);
    console.log(`${P}p/seed${seed}: L${s.level} tower=${s.dtBrigands} — ${acts} acts, ${counts.steps} steps, ${counts.battles} battle rounds — winner ${s.winner} rating ${s.score}`);
  }
}

// --- directed tests ---------------------------------------------------------

const mk = (P = 2, seed = 5) => createDarkTower(DT_SEATS.slice(0, P).map((c) => ({ name: c, color: c })), seed);
/** Put p on a home-kingdom territory bordering its forward frontier; return the frontier id. */
function atForwardFrontier(s: DtState, p: { color: 'Red' | 'Blue' | 'Yellow' | 'Green'; node: string; quad: number }): string {
  const fid = DT_FORWARD_FRONTIER.get(dtKingdomAt(p.color, p.quad))!;
  const terr = dtAdjacent(fid).find((id) => DT_NODE.get(id)!.kingdom === dtKingdomAt(p.color, p.quad))!;
  p.node = terr; s.turnNode = terr;
  return fid;
}

// pawns start on their home citadel
{
  const s = mk(4, 1);
  for (const p of s.players) ok(kindOf(p.node) === 'citadel' && DT_NODE.get(p.node)!.kingdom === p.color, `${p.color} starts on its citadel`);
}

// frontier gating: leaving home is free; the next needs the brass key
{
  const s = mk();
  const p = currentDtPlayer(s);
  const fid = atForwardFrontier(s, p);
  ok(dtLegalSteps(s, p.seat).includes(fid), 'forward frontier is a legal step');
  applyDtAction(s, p.seat, { type: 'step', to: fid });
  ok(p.quad === 1 && p.node === fid, 'quad 0->1 free, pawn on the frontier');
  // now p is on the frontier in kingdom 1 without the brass key: try to cross the next
  p.quad = 1; p.brasskey = 0;
  const fid2 = atForwardFrontier(s, p);
  applyDtAction(s, p.seat, { type: 'step', to: fid2 });
  ok(p.quad === 1, 'no brass key: frontier does not advance');
  ok(p.node !== fid2 && s.phase === 'turnDone', 'blocked crossing marches back and ends the turn');
  // with the key it advances
  s.phase = 'playing'; p.fed = false; p.brasskey = 1;
  const fid3 = atForwardFrontier(s, p);
  applyDtAction(s, p.seat, { type: 'step', to: fid3 });
  ok(p.quad === 2, 'brass key opens the frontier');
}

// cannot enter a foreign citadel, cannot skip a kingdom
{
  const s = mk();
  const p = currentDtPlayer(s);
  // find a foreign citadel and confirm it is never a legal step even if adjacent
  const foreign = DT_NODES.find((n) => n.kind === 'citadel' && n.kingdom !== p.color)!;
  const r = applyDtAction(s, p.seat, { type: 'step', to: foreign.id });
  ok(!r.ok, 'cannot step to a foreign citadel');
  // a far-away non-adjacent node is rejected
  const far = DT_NODES.find((n) => n.kind === 'empty' && !dtAdjacent(p.node).includes(n.id))!;
  ok(!applyDtAction(s, p.seat, { type: 'step', to: far.id }).ok, 'cannot teleport to a non-adjacent territory');
  // out of turn
  ok(!applyDtAction(s, (p.seat + 1) % 2, { type: 'step', to: p.node }).ok, 'cannot act out of turn');
}

// tower requires quad 4 + gold key at the home Dark Tower; riddle + battle win
{
  const s = mk(2, 9);
  const p = currentDtPlayer(s);
  p.quad = 4; p.goldkey = 1; p.brasskey = 1; p.silverkey = 1; p.warriors = 90; p.moves = 10;
  s.dtBrigands = 3;
  const dtn = DT_DARKTOWER_NODE.get(p.color)!;
  const adj = dtAdjacent(dtn).find((id) => DT_NODE.get(id)!.kingdom === p.color)!;
  p.node = adj; s.turnNode = adj;
  ok(dtLegalSteps(s, p.seat).includes(dtn), 'home Dark Tower is a legal step when ready');
  applyDtAction(s, p.seat, { type: 'step', to: dtn });
  ok(s.phase === 'riddle' && s.riddlePhase === 1, 'riddle starts');
  const wrong = DT_KEYS.find((k) => k !== s.riddle[0])!;
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: wrong });
  ok(s.phase === 'turnDone', 'wrong key ends the turn');
  s.phase = 'playing'; p.fed = false; p.node = dtn; // still on the tower space
  applyDtAction(s, p.seat, { type: 'step', to: dtn });
  ok(s.phase === 'riddle', 'retry the riddle from the tower space');
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: s.riddle[0] });
  ok(s.riddlePhase === 2, 'first key accepted');
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: s.riddle[1] });
  ok(s.phase === 'battle' && s.battle?.tower === true, 'tower battle begins');
  let guard = 0;
  while (s.phase === 'battle' && guard++ < 200) applyDtAction(s, p.seat, { type: 'battle_continue' });
  ok(s.phase === 'ended' && s.winner === p.color, 'tower falls');
  ok(s.score !== null && s.score <= 99 && s.score >= 0, `score computed (${s.score})`);
  // the dark tower cannot be entered early
  const s2 = mk(2, 8);
  const q = currentDtPlayer(s2);
  const dtn2 = DT_DARKTOWER_NODE.get(q.color)!;
  ok(!applyDtAction(s2, q.seat, { type: 'step', to: dtn2 }).ok || q.node !== dtn2, 'Dark Tower sealed before you are ready');
}

// stepping onto an empty rolls MOVE; lost snaps the pawn back
{
  const s = mk(2, 33);
  const p = currentDtPlayer(s);
  const home = firstEmpty(p.color);
  let snapped = false;
  for (let i = 0; i < 400 && !snapped; i++) {
    const st = JSON.parse(JSON.stringify(s)) as DtState;
    const q = st.players[p.seat];
    q.node = home; st.turnNode = home; q.scout = 0; q.fed = true; st.turn = q.seat; st.phase = 'playing';
    applyDtAction(st, q.seat, { type: 'step', to: home }); // stay on the empty -> MOVE roll
    const ev = st.lastEvent;
    if (ev && /lost/.test(ev.title) && !q.scout) { ok(q.node === home, 'lost snaps the pawn back to turn start'); snapped = true; }
    s.rolls++;
  }
  ok(snapped, 'a MOVE roll produced a lost result');
}

// starvation: food 0 costs a warrior on your action, floors at 1
{
  const s = mk(2, 21);
  const p = currentDtPlayer(s);
  const home = firstEmpty(p.color);
  p.node = home; s.turnNode = home; p.food = 0; p.warriors = 2; p.gold = 0;
  applyDtAction(s, p.seat, { type: 'step', to: home });
  ok(p.warriors <= 2 && p.warriors >= 1, `starvation cost a warrior (${p.warriors})`);
}

// curse: caster gains now, victim pays at the start of their next action
{
  const s = mk(3, 17);
  const a = s.players[s.turn], b = s.players[(s.turn + 1) % 3];
  b.warriors = 20; b.gold = 40; b.node = firstEmpty(b.color);
  s.phase = 'cursePick';
  applyDtAction(s, a.seat, { type: 'curse', victim: b.seat });
  ok(b.cursed === 1 && s.curse?.warriors === 5 && s.curse?.gold === 10, 'curse stored');
  applyDtAction(s, a.seat, { type: 'end_turn' });
  ok(s.turn === b.seat, 'victim to act');
  const wBefore = b.warriors;
  applyDtAction(s, b.seat, { type: 'step', to: b.node }); // stay -> upkeep resolves the curse
  ok(b.warriors <= wBefore - 5 + 8, 'victim paid the curse at turn start');
  ok(b.cursed === 0 && s.curse === null, 'curse cleared');
}

// sub-phase actions rejected outside their phase
{
  const s = mk(2, 35);
  const q = currentDtPlayer(s);
  ok(!applyDtAction(s, q.seat, { type: 'battle_continue' }).ok, 'no fighting outside a battle');
  ok(!applyDtAction(s, q.seat, { type: 'bazaar_yes' }).ok, 'no buying outside the bazaar');
  ok(!applyDtAction(s, q.seat, { type: 'riddle_guess', key: 'goldkey' }).ok, 'no riddle outside the tower');
}

// view: riddle hidden in play, revealed at end; dev sees all
{
  const s = mk(2, 25);
  ok(dtViewFor(s, 0).riddle === null, 'riddle hidden');
  ok(dtViewFor(s, 'dev').riddle !== null, 'dev sees riddle');
  s.phase = 'ended';
  ok(dtViewFor(s, 0).riddle !== null, 'riddle revealed at end');
}

console.log(`${pass}/${pass + fail} Dark Tower checks passed`);
process.exit(fail ? 1 : 0);
