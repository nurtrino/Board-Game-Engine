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
      if (pend.kind === 'battle-continue') {
        ok(act(s, seatFor, { type: 'battleContinue' }).ok, 'battle report confirmed');
      } else if (pend.kind === 'battle-retreat') {
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
  if (s.awaitingChart) {
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
  // infantry cannot reach Russia from Germany (one-space movers)
  const bad = act(s, 'germany', { type: 'attack', target: 'russia', forces: [{ from: 'germany', units: [{ key: 'infantry', count: 2 }] }] });
  ok(!bad.ok, 'out-of-reach attack rejected');
  // tanks CAN: two spaces through friendly Poland
  {
    const s2 = mkState(11);
    act(s2, 'germany', { type: 'endPhase' });
    act(s2, 'germany', { type: 'endPhase' });
    const r2 = act(s2, 'germany', { type: 'attack', target: 'russia', forces: [{ from: 'germany', units: [{ key: 'tank', count: 1 }] }] });
    ok(r2.ok, `tank attacks at distance 2 (${r2.error ?? ''})`);
  }
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

// ---------- blitz flips an empty hostile intermediate ----------
{
  const s = mkState(29);
  // empty Poland, hand it to the USSR: tanks must blitz through
  s.board.poland = [];
  s.control.poland = 'ussr';
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  const r = act(s, 'germany', { type: 'attack', target: 'russia', forces: [{ from: 'germany', units: [{ key: 'tank', count: 2 }] }] });
  ok(r.ok, `blitz attack declared (${r.error ?? ''})`);
  ok(s.control.poland === 'germany', 'blitzed territory flips to the attacker');
  driveBattle(s, 'germany', 'ussr');
}

// ---------- amphibious assault: bombard ships never enter the territory ----------
{
  const s = mkState(37);
  // clear sz-2 of UK ships; German assault fleet sits there
  s.board['sz-2'] = [
    { power: 'germany', key: 'battleship', count: 1 },
    { power: 'germany', key: 'transport', count: 1, cargo: [{ power: 'germany', key: 'infantry', count: 2 }] },
  ];
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  const r = act(s, 'germany', {
    type: 'attack', target: 'uk-island',
    forces: [{ from: 'sz-2', units: [{ key: 'battleship', count: 1 }] }],
    offloadFrom: 'sz-2',
    offloadUnits: [{ key: 'infantry', count: 2 }],
  });
  ok(r.ok, `amphibious assault declared (${r.error ?? ''})`);
  ok(s.combat?.battle.ctx.amphibious === true, 'battle is amphibious');
  driveBattle(s, 'germany', 'uk');
  ok(unitCount(s, 'uk-island', 'germany', 'battleship') === 0, 'battleship never stands in the territory');
  const bbAtSea = unitCount(s, 'sz-2', 'germany', 'battleship');
  ok(bbAtSea === 1, `battleship returned to the offload zone (${bbAtSea})`);
}

// ---------- liberation: friendly originals revert ----------
{
  const s = mkState(41);
  // Russia holds uk-island (originally UK): a German... no — liberation is
  // same-side. Set up: Germany holds poland (its own), USSR captured it, and
  // now Germany retakes russia-held UK ground? Use the real semantics:
  // pretend the USSR took uk-island earlier; Germany can't liberate.
  // Friendly case: give POLAND originalOwner ussr via state, USSR attacks it.
  s.originalOwner['uk-island'] = 'ussr'; // synthetic: originally Soviet
  s.control['uk-island'] = 'germany'; // now German-held
  s.board['uk-island'] = [{ power: 'germany', key: 'infantry', count: 1 }];
  // UK (USSR's ally) attacks with overwhelming force from sz-2 cargo? UK has
  // fighter on uk-island... simplest: UK infantry can't reach. Use USSR? The
  // point is SAME-SIDE NON-OWNER captures -> reverts. Attack as UK from the
  // island? Units are gone. Set a UK stack adjacent via sz — instead just
  // call through an engine attack: give UK a big stack on uk-island's only
  // neighbor... uk-island has no land adj. Test via direct board setup:
  s.board['sz-2'] = [
    { power: 'uk', key: 'transport', count: 1, cargo: [{ power: 'uk', key: 'tank', count: 3 }] },
    { power: 'uk', key: 'battleship', count: 1 },
  ];
  s.turnIdx = 3; // UK's turn (1941 order)
  s.phase = 'combatMove';
  const r = act(s, 'uk', {
    type: 'attack', target: 'uk-island',
    forces: [{ from: 'sz-2', units: [{ key: 'battleship', count: 1 }] }],
    offloadFrom: 'sz-2', offloadUnits: [{ key: 'tank', count: 3 }],
  });
  ok(r.ok, `liberation assault declared (${r.error ?? ''})`);
  driveBattle(s, 'uk', 'germany');
  if (unitCount(s, 'uk-island', 'uk', 'tank') > 0) {
    ok(s.control['uk-island'] === 'ussr', `capture by an ally reverts to the original owner (${s.control['uk-island']})`);
  }
}

// ---------- strategic bombing raid ----------
{
  const s = mkState(47);
  s.board.poland.push({ power: 'germany', key: 'bomber', count: 2 });
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  const bad = act(s, 'germany', { type: 'sbr', target: 'poland', forces: [{ from: 'poland', bombers: 1 }] });
  ok(!bad.ok, 'no raiding your own complex');
  const r = act(s, 'germany', { type: 'sbr', target: 'russia', forces: [{ from: 'poland', bombers: 2 }] });
  ok(r.ok, `raid launched (${r.error ?? ''})`);
  const dmg = s.factoryDamage.russia ?? 0;
  const shot = 2 - unitCount(s, 'poland', 'germany', 'bomber');
  ok(dmg >= 0 && dmg <= 16, `damage within cap (${dmg}, cap 16)`);
  ok(shot >= 0 && shot <= 2, 'AA losses sane');
  ok(s.phase === 'combatMove', 'raid resolves inline');
  // damaged complex mobilizes less
  s.factoryDamage.russia = 7;
  s.turnIdx = 1; // ussr turn
  s.phase = 'mobilize';
  s.powers.ussr.staging.infantry = 8;
  ok(act(s, 'ussr', { type: 'place', space: 'russia', key: 'infantry', count: 1 }).ok, 'can still place 1 (8 ipc - 7 dmg)');
  const over = act(s, 'ussr', { type: 'place', space: 'russia', key: 'infantry', count: 1 });
  ok(!over.ok, 'damage caps mobilization');
  // repairs restore capacity
  s.phase = 'purchase';
  ok(act(s, 'ussr', { type: 'repair', territory: 'russia', count: 4 }).ok, 'repair 4 damage');
  ok((s.factoryDamage.russia ?? 0) === 3, 'damage reduced');
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
  ok(activePower(s) === 'ussr', 'mobilize end collects income AND advances (merged stage)');
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

// ---------- real goldens: the transcribed map + packup setups ----------
import { AXIS_MAP, AXIS_INDEX, createAxisGame } from './game.js';
import { validateMap } from './map.js';
import { vcCount, productionOf } from './state.js';
import { STARTING_IPCS, TURN_ORDER } from './config.js';

{
  const problems = validateMap(AXIS_MAP);
  ok(problems.length === 0, `real map validates (${problems.slice(0, 3).join('; ')})`);
  ok(AXIS_MAP.territories.length === 97 && AXIS_MAP.seaZones.length === 65, 'real map dimensions');

  // 1941: production equals printed starting cash for every power
  const s41 = createAxisGame([], 41, { scenario: '1941', rnd: true, nationalObjectives: true, winCondition: 'standard' });
  for (const p of TURN_ORDER['1941']) {
    ok(productionOf(s41, AXIS_INDEX, p) === STARTING_IPCS['1941'][p], `1941 ${p} production == printed cash`);
    ok(s41.powers[p].ipcs === STARTING_IPCS['1941'][p], `1941 ${p} starting cash`);
  }
  // rulebook p3: 1941 starts Axis 6 VC / Allies 12
  ok(vcCount(s41, AXIS_INDEX, 'axis') === 6, `1941 axis VCs = 6 (${vcCount(s41, AXIS_INDEX, 'axis')})`);
  ok(vcCount(s41, AXIS_INDEX, 'allies') === 12, '1941 allies VCs = 12');

  // 1942: Axis 8 VC (p4)
  const s42 = createAxisGame([], 42, { scenario: '1942', rnd: false, nationalObjectives: true, winCondition: 'short' });
  ok(vcCount(s42, AXIS_INDEX, 'axis') === 8, `1942 axis VCs = 8 (${vcCount(s42, AXIS_INDEX, 'axis')})`);
  ok(vcCount(s42, AXIS_INDEX, 'allies') === 10, '1942 allies VCs = 10');

  // boards are populated: every power fields units in both scenarios
  for (const st of [s41, s42]) {
    const byPower: Record<string, number> = {};
    for (const stacks of Object.values(st.board)) {
      for (const u of stacks) byPower[u.power] = (byPower[u.power] ?? 0) + u.count;
    }
    for (const p of TURN_ORDER[st.options.scenario]) {
      ok((byPower[p] ?? 0) >= 10, `${st.options.scenario} ${p} fields units (${byPower[p] ?? 0})`);
    }
    ok((byPower.china ?? 0) >= 4, `${st.options.scenario} china fields infantry (${byPower.china ?? 0})`);
  }

  // China placement during the US mobilize (real map: isChinese flags)
  {
    const s = createAxisGame([], 55, { scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard' });
    s.turnIdx = TURN_ORDER['1941'].indexOf('usa');
    s.phase = 'noncombat';
    ok(applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'endPhase' }).ok, 'US noncombat ends');
    ok(s.phase === 'mobilize', 'US mobilize');
    ok(s.chinaGrant >= 3, `China grant from 7+ free territories (${s.chinaGrant})`);
    const before = s.chinaGrant;
    // yunnan is Chinese, allies-held; find one with room
    const spot = ['yunnan', 'sikang', 'chinghai', 'ningxia', 'suiyuan', 'hupeh', 'fukien'].find((t) => {
      const n = (s.board[t] ?? []).reduce((m, st) => m + st.count, 0);
      return n < 3;
    })!;
    ok(!!spot, 'a Chinese territory has room');
    ok(applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'placeChina', space: spot }).ok, 'china infantry placed');
    ok(s.chinaGrant === before - 1, 'grant decrements');
    const bad = applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'placeChina', space: 'manchuria' });
    ok(!bad.ok, 'no placement on Japanese-held Manchuria');
    const badTerr = applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'placeChina', space: 'india' });
    ok(!badTerr.ok, 'china stays inside China');
  }

  // a full seeded round on the real map completes and reaches round 2
  const s = createAxisGame([], 777, { scenario: '1941', rnd: false, nationalObjectives: true, winCondition: 'standard' });
  let guard = 0;
  while (s.round === 1 && guard++ < 100 && !s.winner) {
    const p = activePower(s);
    const r = applyAxisAction(s, AXIS_INDEX, p, { type: 'endPhase' });
    ok(r.ok, `real-map endPhase ${p}/${s.phase} (${r.error ?? ''})`);
    if (!r.ok) break;
  }
  ok(s.round === 2, 'real-map full round completes');
}

console.log(`\naxis-test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
