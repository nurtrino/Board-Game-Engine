// Axis & Allies Anniversary engine test: phase machine, purchases, attacks
// resolved immediately through the battle module, captures/loot, mobilize
// limits, income, and round advance — run on a synthetic mini-map until the
// transcribed board golden lands (the schema is identical).
// Run: npx tsx shared/src/axis/axis-test.ts

import { createAxis, activePower, unitCount, type SetupData, type AxisState } from './state.js';
import { applyAxisAction, type AxisAction } from './actions.js';
import { indexMap, validateMap, type AxisMap } from './map.js';
import type { PowerKey } from './config.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

// ---------- synthetic mini-map ----------
// germany - poland - russia (capitals at the ends), each coastal to sz-1;
// sz-1 adj sz-2; uk-island in sz-2. VCs on the three land capitals + island.

const MAP: AxisMap = {
  territories: [
    { id: 'germany', name: 'Germany', ipc: 10, originalOwner: 'germany', isVictoryCity: true, isCapital: true, center: [0, 0], adj: ['poland'], coastTo: ['sz-1'] },
    { id: 'poland', name: 'Poland', ipc: 2, originalOwner: 'germany', center: [1, 0], adj: ['germany', 'russia'], coastTo: ['sz-1'] },
    { id: 'russia', name: 'Russia', ipc: 8, originalOwner: 'ussr', isVictoryCity: true, isCapital: true, center: [2, 0], adj: ['poland'], coastTo: ['sz-1'] },
    { id: 'uk-island', name: 'UK Island', ipc: 6, originalOwner: 'uk', isVictoryCity: true, isCapital: true, isIsland: true, seaZone: 'sz-2', center: [0, 2], adj: [], coastTo: ['sz-2'] },
  ],
  seaZones: [
    { id: 'sz-1', n: 1, center: [1, 1], adj: ['sz-2'], coastTo: ['germany', 'poland', 'russia'] },
    { id: 'sz-2', n: 2, center: [1, 2], adj: ['sz-1'], coastTo: ['uk-island'] },
  ],
  canals: [],
};
// quiet the 18-VC / 6-capital validation for the mini-map: only check symmetry
const problems = validateMap(MAP).filter((p) => !p.startsWith('victory cities') && !p.startsWith('capitals'));
ok(problems.length === 0, `mini-map valid: ${problems.join('; ')}`);
const idx = indexMap(MAP);

const SETUP: SetupData = {
  units: {
    germany: [
      { power: 'germany', key: 'infantry', count: 4 },
      { power: 'germany', key: 'tank', count: 2 },
      { power: 'germany', key: 'factory', count: 1 },
    ],
    poland: [{ power: 'germany', key: 'infantry', count: 1 }],
    russia: [
      { power: 'ussr', key: 'infantry', count: 3 },
      { power: 'ussr', key: 'factory', count: 1 },
      { power: 'ussr', key: 'aaGun', count: 1 },
    ],
    'uk-island': [
      { power: 'uk', key: 'infantry', count: 2 },
      { power: 'uk', key: 'factory', count: 1 },
      { power: 'uk', key: 'fighter', count: 1 },
    ],
    'sz-1': [{ power: 'germany', key: 'submarine', count: 1 }],
    'sz-2': [
      { power: 'uk', key: 'destroyer', count: 1 },
      { power: 'uk', key: 'transport', count: 1 },
    ],
  },
  control: { germany: 'germany', poland: 'germany', russia: 'ussr', 'uk-island': 'uk' },
};

const mkState = (seed = 7): AxisState =>
  createAxis(MAP, SETUP, { scenario: '1941', rnd: true, nationalObjectives: false, winCondition: 'standard', seed });

const act = (s: AxisState, seat: PowerKey, a: AxisAction) => applyAxisAction(s, idx, seat, a);

// drive any running battle to the end with auto decisions
function driveBattle(s: AxisState, seat: PowerKey, defenderSeat: PowerKey): void {
  let guard = 0;
  while (s.phase === 'battle' && guard++ < 200) {
    const pend = s.pendings.find((p) => p.kind.startsWith('battle-'));
    if (pend) {
      const seatFor = (pend.power === 'china' ? defenderSeat : pend.power) as PowerKey;
      if (pend.kind === 'battle-retreat') {
        ok(act(s, seatFor, { type: 'battleRetreat', retreat: false }).ok, 'retreat decision applies');
      } else if (pend.kind === 'battle-casualties') {
        const dec = s.combat!.battle.decision;
        const uids = dec?.type === 'casualties' ? dec.buckets.flatMap((b) => b.eligible.slice(0, b.hits)) : [];
        ok(act(s, seatFor, { type: 'battleCasualties', uids }).ok, 'casualty picks apply');
      } else {
        ok(act(s, seatFor, { type: 'battleSubmerge', uids: [] }).ok, 'submerge applies');
      }
      continue;
    }
    const r = act(s, seat, { type: 'battleRoll' });
    ok(r.ok, `battle roll (${r.error ?? ''})`);
    if (!r.ok) break;
  }
  ok(s.phase !== 'battle' || guard < 200, 'battle terminated');
}

// ---------- turn order per scenario ----------
{
  const s = mkState();
  ok(activePower(s) === 'germany', '1941 starts with Germany');
  const s42 = createAxis(MAP, SETUP, { scenario: '1942', rnd: false, nationalObjectives: false, winCondition: 'short', seed: 1 });
  ok(activePower(s42) === 'japan', '1942 starts with Japan');
  ok(s42.phase === 'purchase', 'no-RND game skips straight to purchase');
}

// ---------- research ----------
{
  const s = mkState(3);
  ok(s.phase === 'rnd', 'RND phase first when enabled');
  const ipcs0 = s.powers.germany.ipcs;
  const r = act(s, 'germany', { type: 'buyResearch', dice: 2 });
  ok(r.ok, 'buy research');
  ok(s.powers.germany.ipcs === ipcs0 - 10, 'research dice cost 5 each');
  // seed 3: whatever the outcome, the machine must be in a legal follow-up
  const flag = s as AxisState & { awaitingChart?: boolean };
  if (flag.awaitingChart) {
    ok(s.phase === 'rnd', 'breakthrough waits for chart choice');
    ok(act(s, 'germany', { type: 'chooseChart', chart: 2 }).ok, 'choose chart');
    ok(s.powers.germany.techs.length === 1, 'tech granted');
    ok(s.phase === 'purchase', 'to purchase after tech');
  } else {
    ok(s.phase === 'purchase', 'failed research falls through to purchase');
    ok(s.powers.germany.researchTokens === 2, 'failed tokens persist');
  }
}

// ---------- purchase ----------
{
  const s = mkState();
  act(s, 'germany', { type: 'endPhase' }); // skip rnd
  ok(s.phase === 'purchase', 'purchase phase');
  const bad = act(s, 'germany', { type: 'buy', key: 'battleship', count: 2 });
  ok(!bad.ok, 'cannot overspend');
  ok(act(s, 'germany', { type: 'buy', key: 'infantry', count: 4 }).ok, 'buy infantry');
  ok(s.powers.germany.ipcs === 31 - 12, 'IPCs deducted');
  ok(act(s, 'germany', { type: 'unbuy', key: 'infantry', count: 1 }).ok, 'unbuy');
  ok(s.powers.germany.ipcs === 31 - 9, 'refund');
  ok((s.powers.germany.staging.infantry ?? 0) === 3, 'staging holds pieces');
  ok(!act(s, 'ussr', { type: 'buy', key: 'infantry', count: 1 }).ok, 'only the active power acts');
}

// ---------- attack resolved immediately + capture ----------
{
  const s = mkState(11);
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  ok(s.phase === 'combatMove', 'combat move phase');
  // overwhelm Russia from Poland+Germany? poland only borders russia; germany doesn't.
  const bad = act(s, 'germany', { type: 'attack', target: 'russia', forces: [{ from: 'germany', units: [{ key: 'tank', count: 2 }] }] });
  ok(!bad.ok, 'non-adjacent attack rejected');
  // move tanks up is not allowed in combatMove (move is for noncombat) except loading; attack from poland
  const r = act(s, 'germany', { type: 'attack', target: 'russia', forces: [{ from: 'poland', units: [{ key: 'infantry', count: 1 }] }] });
  ok(r.ok, `attack declared (${r.error ?? ''})`);
  ok(s.phase === 'battle', 'battle phase entered immediately');
  driveBattle(s, 'germany', 'ussr');
  ok(s.phase === 'combatMove', 'back to combat move after battle');
}

// ---------- overwhelming attack captures + capital loot ----------
{
  const s = mkState(13);
  // beef up the attacker for a (nearly) sure capture
  s.board.poland.push({ power: 'germany', key: 'tank', count: 6 }, { power: 'germany', key: 'artillery', count: 4 }, { power: 'germany', key: 'infantry', count: 6 });
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  const ussrIpcs = s.powers.ussr.ipcs;
  const r = act(s, 'germany', {
    type: 'attack', target: 'russia',
    forces: [{ from: 'poland', units: [{ key: 'tank', count: 6 }, { key: 'artillery', count: 4 }, { key: 'infantry', count: 6 }] }],
  });
  ok(r.ok, 'big attack declared');
  driveBattle(s, 'germany', 'ussr');
  if (s.control.russia === 'germany') {
    ok(s.powers.ussr.ipcs === 0, 'capital loot empties the owner');
    ok(s.powers.germany.ipcs === 31 + ussrIpcs, 'looter gains the IPCs');
    ok(s.powers.ussr.capitalHeldBy === 'germany', 'capital marked held');
    ok(unitCount(s, 'russia', 'ussr', 'aaGun') + unitCount(s, 'russia', 'germany', 'aaGun') >= 0, 'aa handling does not crash');
  } else {
    ok(s.control.russia === 'ussr', 'defense held: control unchanged');
  }
}

// ---------- sea battle via attack on a sea zone ----------
{
  const s = mkState(17);
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  const r = act(s, 'germany', { type: 'attack', target: 'sz-2', forces: [{ from: 'sz-1', units: [{ key: 'submarine', count: 1 }] }] });
  ok(r.ok, `sea attack (${r.error ?? ''})`);
  driveBattle(s, 'germany', 'uk');
  ok(['combatMove'].includes(s.phase), 'sea battle resolves');
}

// ---------- noncombat + mobilize + income ----------
{
  const s = mkState(19);
  act(s, 'germany', { type: 'endPhase' });
  ok(act(s, 'germany', { type: 'buy', key: 'infantry', count: 3 }).ok, 'buy for mobilize');
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' }); // no attacks
  ok(s.phase === 'noncombat', 'noncombat');
  const mv = act(s, 'germany', { type: 'move', from: 'germany', to: 'poland', units: [{ key: 'infantry', count: 2 }] });
  ok(mv.ok, `noncombat move (${mv.error ?? ''})`);
  ok(unitCount(s, 'poland', 'germany', 'infantry') === 3, 'units arrived');
  const badMv = act(s, 'germany', { type: 'move', from: 'poland', to: 'russia', units: [{ key: 'infantry', count: 1 }] });
  ok(!badMv.ok, 'noncombat into enemy territory rejected');
  act(s, 'germany', { type: 'endPhase' });
  ok(s.phase === 'mobilize', 'mobilize');
  const overCap = act(s, 'germany', { type: 'place', space: 'poland', key: 'infantry', count: 1 });
  ok(!overCap.ok, 'placement needs a factory');
  ok(act(s, 'germany', { type: 'place', space: 'germany', key: 'infantry', count: 3 }).ok, 'place at factory');
  ok(unitCount(s, 'germany', 'germany', 'infantry') === 4 + 3 - 2, 'placed units on board');
  const ipcsBefore = s.powers.germany.ipcs;
  act(s, 'germany', { type: 'endPhase' });
  ok(s.powers.germany.ipcs === ipcsBefore + 12, 'income = production (10 + 2)');
  ok(s.powers.germany.lastIncome === 12, 'income recorded for production screen');
  ok(activePower(s) === 'ussr', 'next power is USSR (1941 order)');
}

// ---------- factory mobilize cap ----------
{
  const s = mkState(23);
  s.powers.germany.ipcs = 100;
  act(s, 'germany', { type: 'endPhase' });
  ok(act(s, 'germany', { type: 'buy', key: 'infantry', count: 12 }).ok, 'buy 12');
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  ok(s.phase === 'mobilize', 'mobilize phase');
  ok(act(s, 'germany', { type: 'place', space: 'germany', key: 'infantry', count: 10 }).ok, 'place up to IPC value');
  const over = act(s, 'germany', { type: 'place', space: 'germany', key: 'infantry', count: 1 });
  ok(!over.ok, 'cap enforced at territory IPC value');
  act(s, 'germany', { type: 'endPhase' });
  ok((s.powers.germany.staging.infantry ?? 0) === 2, 'unplaced units stay staged');
}

// ---------- full seeded round: all six powers complete a turn ----------
{
  const s = mkState(31);
  let guard = 0;
  const order: PowerKey[] = [];
  while (s.round === 1 && guard++ < 200 && !s.winner) {
    const p = activePower(s);
    if (order[order.length - 1] !== p) order.push(p);
    if (s.phase === 'battle') { driveBattle(s, p, 'uk'); continue; }
    const r = act(s, p, { type: 'endPhase' });
    if (!r.ok) {
      // rnd chart pending etc.
      act(s, p, { type: 'chooseChart', chart: 1 });
    }
  }
  ok(s.round === 2, 'round advances after the last power');
  ok(order.join(',') === 'germany,ussr,japan,uk,italy,usa', `1941 turn order (${order.join(',')})`);
}

console.log(`\naxis-test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
