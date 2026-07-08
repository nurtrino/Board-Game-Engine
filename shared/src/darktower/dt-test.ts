// Dark Tower engine test: bot playthroughs at 2-4 players with invariants,
// plus directed rules tests against the Lua semantics.
// Run: npx tsx shared/src/darktower/dt-test.ts

import { createDarkTower, dtViewFor, DT_SEATS, DT_KEYS, type DtState } from './state.js';
import { applyDtAction, currentDtPlayer, type DtAction } from './actions.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

function checkInvariants(s: DtState, tag: string): void {
  for (const p of s.players) {
    if (p.warriors < (s.phase === 'ended' ? 0 : 1) || p.warriors > 99) ok(false, `${tag}: ${p.color} warriors ${p.warriors}`);
    if (p.gold < 0 || p.gold > 99) ok(false, `${tag}: ${p.color} gold ${p.gold}`);
    if (p.gold > p.warriors * 6 + p.beast * 50) ok(false, `${tag}: ${p.color} over gold cap`);
    if (p.food < 0 || p.food > 99) ok(false, `${tag}: ${p.color} food ${p.food}`);
    if (p.quad < 0 || p.quad > 4) ok(false, `${tag}: ${p.color} quad ${p.quad}`);
  }
}

function playout(P: number, seed: number) {
  const s = createDarkTower(DT_SEATS.slice(0, P).map((c) => ({ name: `Bot-${c}`, color: c })), seed, ((seed % 3) + 1) as 1 | 2 | 3);
  const rng = (() => { let x = seed * 31 + 7; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x80000000; }; })();
  let acts = 0;
  const counts: Record<string, number> = { move: 0, tomb: 0, bazaar: 0, sanctuary: 0, frontier: 0, tower: 0, battles: 0 };

  while (s.phase !== 'ended' && acts < 30000) {
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
      // bail when weak in a non-tower fight; the tower is all-or-nothing
      if (!s.battle!.tower && p.warriors <= 3 && rng() < 0.7) tryDo({ type: 'battle_bail' });
      else tryDo({ type: 'battle_continue' });
      continue;
    }
    if (s.phase === 'cursePick') {
      const victims = s.players.filter((q) => q.seat !== seat);
      tryDo({ type: 'curse', victim: victims[Math.floor(rng() * victims.length)].seat });
      continue;
    }
    if (s.phase === 'riddle') {
      tryDo({ type: 'riddle_guess', key: DT_KEYS[Math.floor(rng() * 3)] });
      continue;
    }

    // playing: build an army big enough for the tower, then go
    const keyOfQuad = p.quad === 1 ? p.brasskey : p.quad === 2 ? p.silverkey : p.quad === 3 ? p.goldkey : 1;
    const armyReady = p.warriors >= Math.min(55, s.dtBrigands - 4);
    if (p.quad === 4 && p.goldkey && armyReady) { tryDo({ type: 'tower' }); counts.tower++; }
    else if (p.quad < 4 && keyOfQuad && p.quad > 0) { tryDo({ type: 'frontier' }); counts.frontier++; }
    else if (p.quad === 0) { tryDo({ type: 'frontier' }); counts.frontier++; }
    else if (p.warriors <= 4 || p.food <= 4) { tryDo({ type: 'sanctuary' }); counts.sanctuary++; }
    else if (p.gold >= 12 && (p.warriors < 55 || p.food < 20) && rng() < 0.8) { tryDo({ type: 'bazaar' }); counts.bazaar++; }
    else if (rng() < 0.65) { tryDo({ type: 'tomb' }); counts.tomb++; }
    else { tryDo({ type: 'move' }); counts.move++; }

    // resolve bazaar sub-phase inline
    let guard = 0;
    while (s.phase === 'bazaar' && guard++ < 60) {
      const bz = s.bazaar!;
      if (bz.offer === 'warrior' && p.warriors < 55 && (bz.buying + 1) * bz.prices.warrior <= p.gold && bz.buying < 10) tryDo({ type: 'bazaar_yes' });
      else if (bz.offer === 'food' && p.food < 30 && bz.buying < Math.min(20, p.gold)) tryDo({ type: 'bazaar_yes' });
      else if (bz.buying > 0) tryDo({ type: 'bazaar_no' });
      else if (bz.offer === 'beast' && bz.prices.beast <= p.gold) tryDo({ type: 'bazaar_yes' }) // beast lifts the gold cap
      else if ((bz.offer === 'scout' || bz.offer === 'healer') && bz.prices[bz.offer] <= p.gold && rng() < 0.4) tryDo({ type: 'bazaar_yes' });
      else if (rng() < 0.2) tryDo({ type: 'bazaar_haggle' });
      else tryDo({ type: 'bazaar_no' });
    }
    if (s.phase === 'bazaar') { // merchant patience ran out: walk away via haggle-until-closed
      let g2 = 0;
      while (s.phase === 'bazaar' && g2++ < 30) tryDo({ type: s.bazaar!.buying > 0 ? 'bazaar_no' : 'bazaar_haggle' });
    }
  }
  return { s, acts, counts };
}

for (const P of [2, 3, 4]) {
  for (const seed of [3, 11, 27]) {
    const { s, acts, counts } = playout(P, seed);
    ok(s.phase === 'ended', `${P}p/seed${seed} finishes (${acts} acts)`);
    ok(s.winner !== null, `${P}p/seed${seed} has a winner`);
    ok(s.score !== null && s.score >= 0 && s.score <= 99, `${P}p/seed${seed} score in range (${s.score})`);
    ok(counts.battles > 0, `${P}p/seed${seed} fought battles`);
    console.log(`${P}p/seed${seed}: L${s.level} tower=${s.dtBrigands} — ${acts} acts, ${counts.battles} battle rounds — winner ${s.winner} rating ${s.score}`);
  }
}

// --- directed tests ---------------------------------------------------------

const mk = (P = 2, seed = 5) => createDarkTower(DT_SEATS.slice(0, P).map((c) => ({ name: c, color: c })), seed);

// frontier gating
{
  const s = mk();
  const p = currentDtPlayer(s);
  applyDtAction(s, p.seat, { type: 'frontier' });
  ok(p.quad === 1, 'quad 0->1 free');
  applyDtAction(s, p.seat, { type: 'end_turn' });
  // wrap back to p (2p): other player ends too
  const q = currentDtPlayer(s);
  applyDtAction(s, q.seat, { type: 'move' });
  if (s.phase === 'battle') { applyDtAction(s, q.seat, { type: 'battle_bail' }); }
  if (s.phase === 'cursePick') { applyDtAction(s, q.seat, { type: 'curse', victim: p.seat }); }
  if ((s.phase as string) !== 'playing') applyDtAction(s, q.seat, { type: 'end_turn' });
  if (s.turn === q.seat && s.phase === 'playing') { applyDtAction(s, q.seat, { type: 'sanctuary' }); applyDtAction(s, q.seat, { type: 'end_turn' }); }
  ok(s.turn === p.seat, 'turn returned');
  applyDtAction(s, p.seat, { type: 'frontier' });
  ok(p.quad === 1, 'quad 1 blocked without brass key');
  ok(s.phase === 'turnDone', 'blocked frontier still ends the turn');
}

// tower requires quad 4 + gold key; riddle flow; tower battle win + score
{
  const s = mk(2, 9);
  const p = currentDtPlayer(s);
  p.quad = 4; p.goldkey = 1; p.warriors = 90; p.moves = 10;
  s.dtBrigands = 3;
  applyDtAction(s, p.seat, { type: 'tower' });
  ok(s.phase === 'riddle' && s.riddlePhase === 1, 'riddle starts');
  const wrong = DT_KEYS.find((k) => k !== s.riddle[0])!;
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: wrong });
  ok(s.phase === 'turnDone', 'wrong key ends the turn');
  s.phase = 'playing'; s.turn = p.seat; p.fed = false;
  applyDtAction(s, p.seat, { type: 'tower' });
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: s.riddle[0] });
  ok(s.riddlePhase === 2, 'first key accepted');
  applyDtAction(s, p.seat, { type: 'riddle_guess', key: s.riddle[1] });
  ok(s.phase === 'battle' && s.battle?.tower === true, 'tower battle begins');
  let guard = 0;
  while (s.phase === 'battle' && guard++ < 200) applyDtAction(s, p.seat, { type: 'battle_continue' });
  ok(s.phase === 'ended' && s.winner === p.color, 'tower falls');
  ok(s.score !== null && s.score <= 99 && s.score >= 0, `score computed (${s.score})`);
}

// dragon: hoard grows without sword, sword claims it
{
  const s = mk(2, 13);
  const p = currentDtPlayer(s);
  p.warriors = 40; p.gold = 80; p.beast = 1;
  s.dragon = { warriors: 10, gold: 20 };
  p.sword = 1;
  // force the dragon branch by monkey-running move until dragon or give up
  let hit = false;
  for (let i = 0; i < 200 && !hit; i++) {
    const before = p.sword;
    const st = JSON.parse(JSON.stringify(s)) as DtState;
    applyDtAction(st, p.seat, { type: 'move' });
    if (before === 1 && st.players[p.seat].sword === 0) {
      ok(st.players[p.seat].warriors === Math.min(99, 40 + 10), 'sword claims hoard warriors');
      ok(st.dragon.warriors === 2 && st.dragon.gold === 6, 'hoard resets');
      hit = true;
    }
    s.rolls++; // nudge the stream
  }
  ok(hit, 'dragon+sword scenario reachable');
}

// curse: caster gains now, victim loses at next turn start
{
  const s = mk(3, 17);
  const [a, b] = [s.players[s.turn], s.players[(s.turn + 1) % 3]];
  b.warriors = 20; b.gold = 40;
  s.phase = 'cursePick';
  applyDtAction(s, a.seat, { type: 'curse', victim: b.seat });
  ok(b.cursed === 1 && s.curse?.warriors === 5 && s.curse?.gold === 10, 'curse stored');
  const aGained = a.warriors;
  ok(aGained >= 10 + 5 || a.gold > 30, 'caster gained');
  applyDtAction(s, a.seat, { type: 'end_turn' });
  ok(s.turn === b.seat, 'victim to act');
  const wBefore = b.warriors;
  applyDtAction(s, b.seat, { type: 'sanctuary' });
  ok(b.warriors <= wBefore - 5 + 8, 'victim paid the curse at turn start');
  ok(b.cursed === 0 && s.curse === null, 'curse cleared');
}

// starvation: food 0 costs a warrior each turn, floors at 1
{
  const s = mk(2, 21);
  const p = currentDtPlayer(s);
  p.food = 0; p.warriors = 2; p.gold = 0;
  applyDtAction(s, p.seat, { type: 'move' });
  ok(p.warriors <= 2 && p.warriors >= 1, `starvation cost a warrior (${p.warriors})`);
}

// token spots: start at the citadel, free placement on your turn, lost snaps back
{
  const s = mk(2, 33);
  const p = currentDtPlayer(s);
  ok(Math.hypot(p.spot.x, p.spot.z) > 10, `token starts at the citadel (${p.spot.x},${p.spot.z})`);
  const other = s.players[(s.turn + 1) % 2];
  ok(!applyDtAction(s, other.seat, { type: 'move_token', x: 0, z: 0 }).ok, 'cannot move out of turn');
  ok(applyDtAction(s, p.seat, { type: 'move_token', x: 5, z: -3 }).ok, 'own token moves on your turn');
  ok(p.spot.x === 5 && p.spot.z === -3, 'spot updated');
  ok(applyDtAction(s, p.seat, { type: 'move_token', x: 99, z: 0 }).ok, 'clamped placement accepted');
  ok(Math.hypot(p.spot.x, p.spot.z) <= 12.5, 'spot clamped to the board');
  // force a scout-less lost result: run moves until one comes up lost
  let snapped = false;
  for (let i = 0; i < 300 && !snapped; i++) {
    const st = JSON.parse(JSON.stringify(s)) as DtState;
    st.turnSpot = { x: 1, z: 1 };
    st.players[p.seat].spot = { x: 8, z: 8 };
    applyDtAction(st, p.seat, { type: 'move' });
    const ev = st.lastEvent;
    if (ev && /lost/.test(ev.title) && !st.players[p.seat].scout) {
      ok(st.players[p.seat].spot.x === 1 && st.players[p.seat].spot.z === 1, 'lost snaps the token back');
      snapped = true;
    }
    s.rolls++;
  }
  ok(snapped, 'lost scenario reachable');
  // battle actions rejected outside battles
  const s2 = mk(2, 35);
  const q = currentDtPlayer(s2);
  ok(!applyDtAction(s2, q.seat, { type: 'battle_continue' }).ok, 'no fighting outside a battle');
  ok(!applyDtAction(s2, q.seat, { type: 'battle_bail' }).ok, 'no retreating outside a battle');
  ok(!applyDtAction(s2, q.seat, { type: 'bazaar_yes' }).ok, 'no buying outside the bazaar');
  ok(!applyDtAction(s2, q.seat, { type: 'riddle_guess', key: 'goldkey' }).ok, 'no riddle outside the tower');
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
