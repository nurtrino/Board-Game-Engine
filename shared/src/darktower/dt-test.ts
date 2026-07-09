// Dark Tower engine test: bot playthroughs at 2-4 players with invariants,
// plus directed rules tests. Movement is honor-system (players drag their pawn
// freely); each turn a player presses ONE action button. Run:
//   npx tsx shared/src/darktower/dt-test.ts

import { createDarkTower, dtViewFor, DT_SEATS, DT_KEYS, dtHomeSpot, type DtState } from './state.js';
import { applyDtAction, currentDtPlayer, dtBotAction, type DtAction } from './actions.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

function checkInvariants(s: DtState, tag: string): void {
  for (const p of s.players) {
    if (p.warriors < (s.phase === 'ended' ? 0 : 1) || p.warriors > 99) ok(false, `${tag}: ${p.color} warriors ${p.warriors}`);
    if (p.gold < 0 || p.gold > 99) ok(false, `${tag}: ${p.color} gold ${p.gold}`);
    if (p.gold > p.warriors * 6 + p.beast * 50) ok(false, `${tag}: ${p.color} over gold cap`);
    if (p.food < 0 || p.food > 99) ok(false, `${tag}: ${p.color} food ${p.food}`);
    if (p.quad < 0 || p.quad > 4) ok(false, `${tag}: ${p.color} quad ${p.quad}`);
    if (Math.hypot(p.spot.x, p.spot.z) > 13) ok(false, `${tag}: ${p.color} pawn off the board`);
  }
}

// The playout drives the shared CPU bot (dtBotAction) — the same one the server
// runs — so this exercises exactly what real CPU players do.
function playout(P: number, seed: number) {
  const s = createDarkTower(DT_SEATS.slice(0, P).map((c) => ({ name: `Bot-${c}`, color: c })), seed, ((seed % 3) + 1) as 1 | 2 | 3);
  const rng = (() => { let x = seed * 31 + 7; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; }; })();
  let acts = 0; const counts: Record<string, number> = { actions: 0, battles: 0, crossings: 0 };

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
    // playing: press an action button
    const before = p.quad;
    tryDo(dtBotAction(s, seat));
    counts.actions++;
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
    console.log(`${P}p/seed${seed}: L${s.level} tower=${s.dtBrigands} — ${acts} acts, ${counts.actions} actions, ${counts.battles} battle rounds — winner ${s.winner} rating ${s.score}`);
  }
}

// --- directed tests ---------------------------------------------------------

const mk = (P = 2, seed = 5) => createDarkTower(DT_SEATS.slice(0, P).map((c) => ({ name: c, color: c })), seed);

// pawns start on their home citadel
{
  const s = mk(4, 1);
  for (const p of s.players) {
    const h = dtHomeSpot(p.color);
    ok(p.quad === 0 && p.spot.x === h.x && p.spot.z === h.z, `${p.color} starts on its citadel`);
  }
}

// frontier gating: leaving home is free; the next needs the brass key
{
  const s = mk();
  const p = currentDtPlayer(s);
  applyDtAction(s, p.seat, { type: 'frontier' });
  ok(p.quad === 1 && s.phase === 'turnDone', 'quad 0->1 free');
  // kingdom 1 without the brass key: the guard turns you back
  s.phase = 'playing'; p.fed = true; p.brasskey = 0;
  applyDtAction(s, p.seat, { type: 'frontier' });
  ok(p.quad === 1 && s.phase === 'turnDone', 'no brass key: frontier does not advance');
  // with the key it advances
  s.phase = 'playing'; p.fed = true; p.brasskey = 1;
  applyDtAction(s, p.seat, { type: 'frontier' });
  ok(p.quad === 2, 'brass key opens the frontier');
  // cannot advance past home (quad 4)
  s.phase = 'playing'; p.fed = true; p.quad = 4;
  ok(!applyDtAction(s, p.seat, { type: 'frontier' }).ok, 'cannot cross a frontier past home');
}

// acting out of turn, and the tower gate
{
  const s = mk();
  const p = currentDtPlayer(s);
  ok(!applyDtAction(s, (p.seat + 1) % 2, { type: 'move' }).ok, 'cannot act out of turn');
  ok(!applyDtAction(s, p.seat, { type: 'tower' }).ok, 'Dark Tower sealed before you are ready');
}

// free pawn placement: move_token repositions your own pawn, clamped to the board
{
  const s = mk();
  const p = currentDtPlayer(s);
  ok(applyDtAction(s, p.seat, { type: 'move_token', x: 3, z: -4 }).ok && p.spot.x === 3 && p.spot.z === -4, 'pawn drags freely');
  applyDtAction(s, p.seat, { type: 'move_token', x: 40, z: 0 });
  ok(Math.abs(p.spot.x - 12.4) < 0.01, 'placement clamps inside the board disc');
  ok(!applyDtAction(s, (p.seat + 1) % 2, { type: 'move_token', x: 0, z: 0 }).ok, 'cannot drag another player\'s pawn');
}

// tower requires quad 4 + gold key; riddle + battle win
{
  const s = mk(2, 9);
  const p = currentDtPlayer(s);
  p.quad = 4; p.goldkey = 1; p.brasskey = 1; p.silverkey = 1; p.warriors = 90; p.moves = 10; p.fed = true;
  s.dtBrigands = 3;
  applyDtAction(s, p.seat, { type: 'tower' });
  ok(s.phase === 'riddle' && s.riddlePhase === 1, 'riddle starts');
  const wrong = DT_KEYS.find((k) => k !== s.riddle[0])!;
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: wrong });
  ok(s.phase === 'turnDone', 'wrong key ends the turn');
  s.phase = 'playing'; p.fed = true;
  applyDtAction(s, p.seat, { type: 'tower' });
  ok(s.phase === 'riddle', 'retry the riddle');
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: s.riddle[0] });
  ok(s.riddlePhase === 2, 'first key accepted');
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: s.riddle[1] });
  ok(s.phase === 'battle' && s.battle?.tower === true, 'tower battle begins');
  let guard = 0;
  while (s.phase === 'battle' && guard++ < 200) applyDtAction(s, p.seat, { type: 'battle_continue' });
  ok(s.phase === 'ended' && s.winner === p.color, 'tower falls');
  ok(s.score !== null && s.score <= 99 && s.score >= 0, `score computed (${s.score})`);
}

// a MOVE roll can get you lost; lost snaps the pawn back to its turn-start spot
{
  const s = mk(2, 33);
  const p = currentDtPlayer(s);
  let snapped = false;
  for (let i = 0; i < 400 && !snapped; i++) {
    const st = JSON.parse(JSON.stringify(s)) as DtState;
    const q = st.players[p.seat];
    st.turnSpot = { x: 1, z: 2 }; q.spot = { x: 9, z: -9 }; // dragged away from turn start
    q.scout = 0; q.fed = true; st.turn = q.seat; st.phase = 'playing';
    applyDtAction(st, q.seat, { type: 'move' });
    const ev = st.lastEvent;
    if (ev && /lost/.test(ev.title) && !q.scout) { ok(q.spot.x === 1 && q.spot.z === 2, 'lost snaps the pawn back to turn start'); snapped = true; }
    s.rolls++;
  }
  ok(snapped, 'a MOVE roll produced a lost result');
}

// starvation: food 0 costs a warrior on your action, floors at 1
{
  const s = mk(2, 21);
  const p = currentDtPlayer(s);
  p.food = 0; p.warriors = 2; p.gold = 0; p.fed = false;
  applyDtAction(s, p.seat, { type: 'move' });
  ok(p.warriors <= 2 && p.warriors >= 1, `starvation cost a warrior (${p.warriors})`);
}

// curse: caster gains now, victim pays at the start of their next action
{
  const s = mk(3, 17);
  const a = s.players[s.turn], b = s.players[(s.turn + 1) % 3];
  b.warriors = 20; b.gold = 40;
  s.phase = 'cursePick';
  applyDtAction(s, a.seat, { type: 'curse', victim: b.seat });
  ok(b.cursed === 1 && s.curse?.warriors === 5 && s.curse?.gold === 10, 'curse stored');
  applyDtAction(s, a.seat, { type: 'end_turn' });
  ok(s.turn === b.seat, 'victim to act');
  const wBefore = b.warriors;
  applyDtAction(s, b.seat, { type: 'move' }); // any action runs upkeep → curse pays
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
