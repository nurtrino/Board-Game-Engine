// Axis & Allies Anniversary engine test: phase machine, purchases, attacks
// resolved immediately through the battle module, captures/loot, mobilize
// limits, income, and round advance — run on a synthetic mini-map until the
// transcribed board golden lands (the schema is identical).
// Run: npx tsx shared/src/axis/axis-test.ts

import { createAxis, activePower, addUnits, axisViewFor, normalizeAxisState, unitCount, type SetupData, type AxisState, type UnitStack } from './state.js';
import { applyAxisAction, chinaInfantryGrant, type AxisAction, type AxisUnitPick } from './actions.js';
import { indexMap, validateMap, type AxisMap } from './map.js';
import type { PowerKey, UnitKey } from './config.js';
import {
  axisPieceSelectionSignature, enumerateAxisPhysicalPieces,
  physicalizeAxisCargoStacks,
} from './physical.js';

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
const exactPick = (
  s: AxisState,
  space: string,
  power: PowerKey,
  key: UnitKey,
  ordinals: number[],
): AxisUnitPick => ({
  key,
  count: ordinals.length,
  ordinals,
  selectionSig: axisPieceSelectionSignature(s.board[space] ?? [], power, key),
});

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

{
  const s = mkState(5);
  const before = s.powers.germany.ipcs;
  s.powers.germany.researchTokens = 2;
  const rolled = act(s, 'germany', { type: 'buyResearch', dice: 0 });
  ok(rolled.ok, 'standing researchers roll without buying another die');
  ok(s.powers.germany.ipcs === before, 'rolling standing researchers costs no IPCs');
  ok(s.log.some((entry) => entry.text.includes('rolls research:')), 'standing-researcher roll is recorded');
}

{
  const s = mkState(5);
  const before = JSON.stringify(s);
  const empty = act(s, 'germany', { type: 'buyResearch', dice: 0 });
  ok(!empty.ok && empty.error === 'No standing researchers to roll.', 'zero new dice requires a standing researcher');
  ok(JSON.stringify(s) === before, 'rejected empty research roll does not mutate state');
}

{
  const s = mkState(5);
  s.powers.germany.techs = TECHS.map((tech) => tech.key);
  s.powers.germany.researchTokens = 2;
  const before = JSON.stringify(s);
  const complete = act(s, 'germany', { type: 'buyResearch', dice: 0 });
  ok(!complete.ok && complete.error === 'Every research advance is already developed.', 'a fully developed power cannot create an impossible breakthrough');
  ok(JSON.stringify(s) === before, 'completed research rejects without trapping the phase or spending tokens');
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

// ---------- runtime demand validation is non-mutating ----------
{
  const s = mkState();
  act(s, 'germany', { type: 'endPhase' });
  s.powers.germany.staging.infantry = 1;
  s.factoryDamage.germany = 1;
  const before = JSON.stringify(s);
  ok(!act(s, 'germany', { type: 'unbuy', key: 'infantry', count: -1 }).ok, 'negative unbuy rejected');
  ok(!act(s, 'germany', { type: 'repair', territory: 'germany', count: -2 }).ok, 'negative repair rejected');
  ok(!act(s, 'germany', { type: 'buy', key: 'infantry', count: 1.5 }).ok, 'fractional count rejected');
  ok(JSON.stringify(s) === before, 'rejected numeric demands leave state unchanged');
}

// ---------- China battle authority routes only through the USA ----------
{
  const s = mkState();
  s.phase = 'battle';
  s.pendings = [{ id: 1, power: 'china', kind: 'battle-casualties', data: {} }];
  const wrong = act(s, 'uk', { type: 'battleCasualties', uids: [] });
  ok(!wrong.ok && wrong.error === 'Not your decision.', 'another Allied power cannot make China battle decisions');
  const usa = act(s, 'usa', { type: 'battleCasualties', uids: [] });
  ok(!usa.ok && usa.error !== 'Not your decision.', 'USA passes the China decision authority check');
}
{
  const s = mkState();
  s.phase = 'battle';
  s.combat = {
    id: 99,
    space: 'poland',
    attacker: 'germany',
    from: [],
    amphibious: false,
    attackerCommitted: [],
    confirmed: { attacker: false, defender: false },
    battle: {
      status: 'defender_won',
      attacker: [],
      defender: [{ power: 'china', hp: 1 }],
      log: [],
    } as never,
  };
  s.pendings = [{ id: 2, power: 'china', kind: 'battle-continue', data: { side: 'defender' } }];
  ok(!act(s, 'uk', { type: 'battleContinue' }).ok, 'another Allied power cannot continue for China');
  ok(act(s, 'usa', { type: 'battleContinue' }).ok, 'USA continues for a Chinese defender');
  ok(s.combat?.confirmed?.defender === true, 'Chinese defender acknowledgement is recorded');
}

// ---------- setup cargo is isolated across game states ----------
{
  const cargoSetup: SetupData = {
    ...SETUP,
    units: {
      ...SETUP.units,
      'sz-2': [{ power: 'germany', key: 'transport', count: 1, cargo: [{ power: 'germany', key: 'infantry', count: 1 }] }],
    },
  };
  const a = createAxis(MAP, cargoSetup, { scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 1 });
  const b = createAxis(MAP, cargoSetup, { scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 2 });
  a.board['sz-2'][0].cargo![0].count = 9;
  ok(b.board['sz-2'][0].cargo![0].count === 1, 'cargo objects are not shared between rooms');
  ok(cargoSetup.units['sz-2'][0].cargo![0].count === 1, 'game mutation does not alter setup data');
}

// ---------- carrier fighters are independent units ----------
{
  const s = mkState(73);
  s.board['sz-1'] = [
    { power: 'germany', key: 'carrier', count: 1, moved: 1, cargo: [{ power: 'germany', key: 'fighter', count: 2 }] },
    { power: 'germany', key: 'transport', count: 1, cargo: [{ power: 'germany', key: 'infantry', count: 1 }] },
  ];
  normalizeAxisState(s);
  const carrier = s.board['sz-1'].find((stack) => stack.key === 'carrier');
  const fighters = s.board['sz-1'].find((stack) => stack.key === 'fighter');
  const transport = s.board['sz-1'].find((stack) => stack.key === 'transport');
  ok(!carrier?.cargo?.length, 'legacy carrier cargo is removed');
  ok(fighters?.count === 2 && fighters.moved === 2, 'carrier fighters become independent and retain spent movement');
  ok(transport?.cargo?.[0]?.key === 'infantry', 'transport cargo remains attached');
}
{
  const s = mkState(74);
  s.board['sz-1'] = [{
    power: 'uk', key: 'carrier', count: 1,
    cargo: [{ power: 'usa', key: 'fighter', count: 1 }],
  }];
  normalizeAxisState(s);
  const carrier = s.board['sz-1'].find((stack) => stack.key === 'carrier');
  const looseGuest = s.board['sz-1'].find((stack) => stack.power === 'usa' && stack.key === 'fighter');
  ok(carrier?.cargo?.[0]?.power === 'usa' && carrier.cargo[0].key === 'fighter', 'allied guest fighter remains carrier cargo');
  ok(!looseGuest, 'normalization does not strand an allied guest on the carrier owner\'s turn');
}

// ---------- physical piece ordering is canonical and save-safe ----------
{
  const stacks: UnitStack[] = [
    { power: 'germany', key: 'carrier', count: 1, cargo: [{ power: 'italy', key: 'fighter', count: 1 }] },
    { power: 'germany', key: 'carrier', count: 1 },
    { power: 'germany', key: 'battleship', count: 3, moved: 1, damaged: 1 },
  ];
  const pieces = enumerateAxisPhysicalPieces(stacks);
  const carriers = pieces.filter((piece) => piece.key === 'carrier');
  const battleships = pieces.filter((piece) => piece.key === 'battleship');
  ok(carriers[0]?.ordinal === 0 && carriers[0].stackIndex === 0 && carriers[0].cargo?.[0]?.power === 'italy', 'loaded carrier owns the first board-order ordinal and cargo manifest');
  ok(carriers[1]?.ordinal === 1 && carriers[1].stackIndex === 1 && !carriers[1].cargo, 'loose carrier keeps the next distinct ordinal');
  ok(battleships[0]?.ordinal === 0 && !battleships[0].damaged, 'available healthy battleship is the first canonical sculpt');
  ok(battleships[1]?.ordinal === 1 && battleships[1].damaged, 'available damaged battleship receives its own canonical ordinal');
  ok(battleships[2]?.ordinal === null && !battleships[2].available, 'spent battleship remains visible but has no selectable ordinal');

  const signature = axisPieceSelectionSignature(stacks, 'germany', 'carrier');
  const roundTrip = JSON.parse(JSON.stringify(stacks)) as UnitStack[];
  ok(axisPieceSelectionSignature(roundTrip, 'germany', 'carrier') === signature, 'piece signature survives JSON save and restore');
  roundTrip[0].cargo![0].count = 2;
  ok(axisPieceSelectionSignature(roundTrip, 'germany', 'carrier') !== signature, 'piece signature changes when a cargo manifest changes');
  roundTrip[0].cargo![0].count = 1;
  roundTrip[0].movementSpent = 1;
  ok(axisPieceSelectionSignature(roundTrip, 'germany', 'carrier') !== signature, 'piece signature changes when remaining movement changes');
}
{
  const legacy: UnitStack[] = [{
    power: 'germany', key: 'transport', count: 2, moved: 1, movementSpent: 2,
    cargo: [{ power: 'germany', key: 'infantry', count: 2 }],
  }, {
    power: 'uk', key: 'carrier', count: 2,
    cargo: [{ power: 'usa', key: 'fighter', count: 3 }],
  }];
  const physical = physicalizeAxisCargoStacks(legacy);
  const transports = physical.filter((stack) => stack.key === 'transport');
  const carriers = physical.filter((stack) => stack.key === 'carrier');
  ok(transports.length === 2 && transports.every((stack) => stack.count === 1 && stack.cargo?.[0]?.count === 1), 'legacy transport cargo is balanced onto physical one-hull stacks');
  ok(transports[0].moved === 1 && !transports[1].moved, 'legacy aggregate movement is retained conservatively on one physical hull');
  ok(transports.every((stack) => stack.movementSpent === 2), 'cargo physicalization preserves every hull\'s remaining-movement ledger');
  ok(carriers.length === 2 && carriers.every((stack) => stack.count === 1), 'legacy loaded carriers become independently addressable hulls');
  ok((carriers[0].cargo?.[0]?.count ?? 0) === 2 && (carriers[1].cargo?.[0]?.count ?? 0) === 1, 'guest fighters are deterministically balanced without loss');
  ok(JSON.stringify(physicalizeAxisCargoStacks(physical)) === JSON.stringify(physical), 'cargo physicalization is idempotent across repeated restore passes');
}
{
  const s = mkState(76);
  s.board['sz-1'] = [{
    power: 'uk', key: 'carrier', count: 2,
    cargo: [{ power: 'usa', key: 'fighter', count: 2 }],
  }];
  normalizeAxisState(s);
  const once = JSON.stringify(s.board['sz-1']);
  normalizeAxisState(s);
  ok(JSON.stringify(s.board['sz-1']) === once, 'Axis save normalization remains idempotent after physical carrier migration');
  ok(s.board['sz-1'].length === 2 && s.board['sz-1'].every((stack) => stack.count === 1 && stack.cargo?.[0]?.count === 1), 'restored allied carrier guests retain one durable host each');

  s.board['sz-2'] = [];
  addUnits(s, 'sz-2', 'uk', 'carrier', 2, [{ power: 'usa', key: 'fighter', count: 2 }]);
  ok(s.board['sz-2'].length === 2 && s.board['sz-2'].every((stack) => stack.count === 1 && stack.cargo?.[0]?.count === 1), 'state helper never creates an aggregate loaded carrier');
}

// ---------- exact ordinal actions move the sculpt the player tapped ----------
{
  const s = mkState(77);
  s.phase = 'noncombat';
  s.board['sz-1'] = [{
    power: 'germany', key: 'carrier', count: 1,
    cargo: [{ power: 'italy', key: 'fighter', count: 1 }],
  }, { power: 'germany', key: 'carrier', count: 1 }];
  s.board['sz-2'] = [];
  const moved = act(s, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2',
    units: [exactPick(s, 'sz-1', 'germany', 'carrier', [0])],
  });
  ok(moved.ok, `the tapped loaded carrier moves (${moved.error ?? ''})`);
  const destination = s.board['sz-2'].find((stack) => stack.key === 'carrier');
  const source = s.board['sz-1'].find((stack) => stack.key === 'carrier');
  ok(destination?.cargo?.[0]?.power === 'italy', 'ordinal zero retains the loaded carrier cargo despite legacy loose-first planning');
  ok(source?.count === 1 && !source.cargo?.length, 'the distinct loose carrier remains at the source');
}
{
  const s = mkState(78);
  s.phase = 'noncombat';
  s.board['sz-1'] = [{
    power: 'germany', key: 'transport', count: 1,
    cargo: [{ power: 'germany', key: 'infantry', count: 1 }],
  }, {
    power: 'germany', key: 'transport', count: 1,
    cargo: [{ power: 'germany', key: 'tank', count: 1 }],
  }];
  s.board['sz-2'] = [];
  const moved = act(s, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2',
    units: [exactPick(s, 'sz-1', 'germany', 'transport', [1])],
  });
  ok(moved.ok, `the second loaded transport moves (${moved.error ?? ''})`);
  ok(s.board['sz-2'][0]?.cargo?.[0]?.key === 'tank', 'ordinal one moves the second transport and its tank');
  ok(s.board['sz-1'][0]?.cargo?.[0]?.key === 'infantry', 'the first transport and infantry remain behind');
}
{
  const s = mkState(79);
  s.phase = 'noncombat';
  s.board['sz-1'] = [{ power: 'germany', key: 'battleship', count: 2, damaged: 1 }];
  s.board['sz-2'] = [];
  const moved = act(s, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2',
    units: [exactPick(s, 'sz-1', 'germany', 'battleship', [1])],
  });
  ok(moved.ok, `the tapped damaged battleship moves (${moved.error ?? ''})`);
  ok(s.board['sz-2'][0]?.damaged === 1, 'damaged ordinal writes its wound to the destination sculpt');
  ok(s.board['sz-1'][0]?.count === 1 && !s.board['sz-1'][0].damaged, 'healthy battleship remains at the source');
}
{
  const s = mkState(80);
  s.phase = 'noncombat';
  s.board.poland = [
    { power: 'germany', key: 'fighter', count: 1 },
    { power: 'germany', key: 'fighter', count: 1, movementSpent: 2 },
  ];
  const moved = act(s, 'germany', {
    type: 'move', from: 'poland', to: 'germany',
    units: [exactPick(s, 'poland', 'germany', 'fighter', [1])],
  });
  ok(moved.ok, `the fighter with less remaining range moves (${moved.error ?? ''})`);
  const arrived = s.board.germany.find((stack) => stack.key === 'fighter');
  ok(arrived?.movementSpent === 3, 'exact fighter preserves prior movement and adds the flown distance');
  ok(s.board.poland[0]?.key === 'fighter' && !s.board.poland[0].movementSpent, 'the fresh fighter remains at the source');
}
{
  const s = mkState(801);
  s.phase = 'combatMove';
  s.board.poland = [
    { power: 'germany', key: 'bomber', count: 1 },
    { power: 'germany', key: 'bomber', count: 1, movementSpent: 2 },
  ];
  s.board.russia = [{ power: 'ussr', key: 'factory', count: 1 }]; // no AA: selected bomber survives
  const pick = exactPick(s, 'poland', 'germany', 'bomber', [1]);
  const raided = act(s, 'germany', {
    type: 'sbr', target: 'russia',
    forces: [{ from: 'poland', bombers: 1, ordinals: pick.ordinals, selectionSig: pick.selectionSig }],
  });
  ok(raided.ok, `exact bomber launches the raid (${raided.error ?? ''})`);
  ok(s.combat?.battle.attacker[0]?.movementSpent === 3, 'committed exact bomber preserves its prior movement ledger inside the cinematic');
  driveBattle(s, 'germany', 'ussr');
  const raider = s.board.russia.find((stack) => stack.power === 'germany' && stack.key === 'bomber');
  ok(raider?.movementSpent === 3, 'strategic raid preserves the tapped bomber\'s prior movement ledger');
  ok(s.board.poland[0]?.key === 'bomber' && !s.board.poland[0].movementSpent, 'other bomber remains at the raid origin');
}
{
  const s = mkState(81);
  s.phase = 'noncombat';
  s.board.poland = [{ power: 'germany', key: 'fighter', count: 1 }];
  const stalePick = exactPick(s, 'poland', 'germany', 'fighter', [0]);
  s.board.poland[0].movementSpent = 1; // another controller changed this sculpt
  const before = JSON.stringify(s);
  const stale = act(s, 'germany', {
    type: 'move', from: 'poland', to: 'germany', units: [stalePick],
  });
  ok(!stale.ok && stale.error?.includes('exact Fighter pieces changed') === true, 'stale exact signature is rejected with an actionable reselect message');
  ok(JSON.stringify(s) === before, 'stale exact selection rejection is byte-for-byte atomic');
}
{
  const malformedOrders: AxisAction[] = [
    { type: 'move', from: 'sz-1', to: 'sz-2', units: [{ key: 'carrier', count: 2, ordinals: [0, 0], selectionSig: '[]' }] },
    { type: 'move', from: 'sz-1', to: 'sz-2', units: [{ key: 'carrier', count: 1, ordinals: [-1], selectionSig: '[]' }] },
    { type: 'move', from: 'sz-1', to: 'sz-2', units: [{ key: 'carrier', count: 2, ordinals: [0], selectionSig: '[]' }] },
  ];
  for (const order of malformedOrders) {
    const s = mkState(82);
    s.phase = 'noncombat';
    const before = JSON.stringify(s);
    ok(!act(s, 'germany', order).ok, 'malformed exact ordinal payload is rejected');
    ok(JSON.stringify(s) === before, 'malformed exact ordinal payload cannot mutate state');
  }
}
{
  const s = mkState(83);
  s.phase = 'combatMove';
  s.board['sz-1'] = [{ power: 'germany', key: 'battleship', count: 2, damaged: 1 }];
  s.board['sz-2'] = [{ power: 'uk', key: 'transport', count: 1 }];
  const attacked = act(s, 'germany', {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-1', units: [exactPick(s, 'sz-1', 'germany', 'battleship', [1])] }],
  });
  ok(attacked.ok, `the exact damaged battleship enters combat (${attacked.error ?? ''})`);
  ok(s.combat?.battle.attacker[0]?.hp === 1, 'selected damaged battleship enters battle on one HP');
  ok(s.combat?.visualSeq === 0, 'new battle starts at cinematic sequence zero');
  const savedFrom = s.combat?.from[0]?.units[0] as { ordinals?: number[]; selectionSig?: string } | undefined;
  ok(savedFrom?.ordinals === undefined && savedFrom?.selectionSig === undefined, 'transient exact-selection data is not persisted in active combat saves');
}
{
  const s = mkState(3); // deterministic miss, miss produces a retreat choice
  s.phase = 'combatMove';
  s.board['sz-1'] = [{ power: 'germany', key: 'battleship', count: 1 }];
  s.board['sz-2'] = [{ power: 'uk', key: 'battleship', count: 1 }];
  ok(act(s, 'germany', {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-1', units: [{ key: 'battleship', count: 1 }] }],
  }).ok, 'cinematic sequence battle begins');
  const combatId = s.combat!.id;
  const beforeWrong = JSON.stringify(s);
  ok(!act(s, 'germany', { type: 'battleRoll', combatId, visualSeq: 1 }).ok, 'future cinematic sequence cannot roll early');
  ok(JSON.stringify(s) === beforeWrong, 'wrong cinematic target is non-mutating');
  ok(act(s, 'germany', { type: 'battleRoll', combatId, visualSeq: 0 }).ok, 'current attacker volley rolls');
  ok(s.combat?.visualSeq === 1, 'successful attacker volley advances cinematic sequence');
  const afterFirst = JSON.stringify(s);
  ok(!act(s, 'germany', { type: 'battleRoll', combatId, visualSeq: 0 }).ok, 'replayed same-sequence volley is rejected');
  ok(JSON.stringify(s) === afterFirst, 'replayed volley cannot draw dice or mutate battle state');
  ok(act(s, 'germany', { type: 'battleRoll', combatId, visualSeq: 1 }).ok, 'current defender volley rolls');
  ok(s.combat?.visualSeq === 2 && s.combat.battle.decision?.type === 'retreat', 'defender volley advances sequence and exposes retreat');
  ok(act(s, 'germany', { type: 'battleRetreat', retreat: false, combatId, visualSeq: 2 }).ok, 'pressing the attack targets the exact retreat moment');
  ok(s.combat?.visualSeq === 3, 'declining retreat advances cinematic sequence before the next round');
  const malformed = JSON.stringify(s);
  ok(!act(s, 'germany', { type: 'battleRoll', combatId: -1, visualSeq: 3 }).ok, 'negative cinematic target is rejected at runtime validation');
  ok(JSON.stringify(s) === malformed, 'malformed cinematic target is non-mutating');
}

// ---------- allied carrier guests persist through combat ----------
{
  const s = mkState(75);
  s.phase = 'combatMove';
  s.board['sz-1'] = [{
    power: 'germany', key: 'carrier', count: 1,
    cargo: [{ power: 'italy', key: 'fighter', count: 1 }],
  }];
  s.board['sz-2'] = [{ power: 'uk', key: 'transport', count: 1 }];
  const declared = act(s, 'germany', {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-1', units: [{ key: 'carrier', count: 1 }] }],
  });
  ok(declared.ok, `carrier with an allied guest enters combat (${declared.error ?? ''})`);
  const fightingCarrier = s.combat?.battle.attacker.find((unit) => unit.key === 'carrier');
  ok(fightingCarrier?.cargo?.[0]?.power === 'italy', 'attacking carrier keeps its allied guest bound as cargo');
  ok(!s.combat?.battle.attacker.some((unit) => unit.key === 'fighter'), 'guest fighter does not join the carrier owner\'s attack');
  ok(act(s, 'germany', { type: 'battleContinue' }).ok, 'carrier attacker confirms the transport sweep');
  ok(act(s, 'uk', { type: 'battleContinue' }).ok, 'transport defender confirms the transport sweep');
  const returned = s.board['sz-2'].find((stack) => stack.power === 'germany' && stack.key === 'carrier');
  ok(returned?.cargo?.[0]?.power === 'italy' && returned.cargo[0].key === 'fighter', 'surviving attacking carrier returns with its allied guest');
}
{
  const s = mkState(3); // carrier and both defending aircraft dice miss
  s.phase = 'combatMove';
  s.board['sz-1'] = [{ power: 'germany', key: 'carrier', count: 1 }];
  s.board['sz-2'] = [{
    power: 'uk', key: 'carrier', count: 1,
    cargo: [{ power: 'usa', key: 'fighter', count: 1 }],
  }];
  const declared = act(s, 'germany', {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-1', units: [{ key: 'carrier', count: 1 }] }],
  });
  ok(declared.ok, `carrier guest launches on defense (${declared.error ?? ''})`);
  ok(s.combat?.battle.defender.some((unit) => unit.key === 'fighter' && unit.power === 'usa'), 'allied guest fighter is a real defending unit');
  ok(!s.combat?.battle.defender.find((unit) => unit.key === 'carrier')?.cargo?.length, 'launched guest is not duplicated on the defending carrier');
  ok(act(s, 'germany', { type: 'battleRoll' }).ok, 'attacking carrier misses');
  ok(act(s, 'germany', { type: 'battleRoll' }).ok, 'defending carrier and guest miss');
  ok(s.combat?.battle.decision?.type === 'retreat', 'carrier attacker may retreat after the miss volley');
  ok(act(s, 'germany', { type: 'battleRetreat', retreat: true, destination: 'sz-1' }).ok, 'carrier attacker retreats');
  ok(act(s, 'germany', { type: 'battleContinue' }).ok, 'carrier attacker confirms the report');
  ok(act(s, 'uk', { type: 'battleContinue' }).ok, 'carrier defender confirms the report');
  const carrier = s.board['sz-2'].find((stack) => stack.power === 'uk' && stack.key === 'carrier');
  ok(!carrier?.cargo?.some((cargo) => cargo.power === 'usa' && cargo.key === 'fighter'), 'launched guest remains off-deck until the post-combat landing queue');
  ok(s.pendingDefendingCarrierFighters.length === 1
    && s.pendingDefendingCarrierFighters[0]?.power === 'usa'
    && s.pendingDefendingCarrierFighters[0]?.homeCarrierRef === carrier?.carrierRef,
  'surviving defending guest retains exact fighter and home-carrier identity');
  ok(unitCount(s, 'sz-2', 'usa', 'fighter') === 0, 'queued guest is not duplicated as a loose fighter');
}

// ---------- duplicate demands cannot clone units ----------
{
  const s = mkState();
  s.phase = 'combatMove';
  s.board.poland = [{ power: 'germany', key: 'infantry', count: 1 }];
  const before = JSON.stringify(s.board);
  const r = act(s, 'germany', {
    type: 'attack', target: 'russia',
    forces: [{ from: 'poland', units: [{ key: 'infantry', count: 1 }, { key: 'infantry', count: 1 }] }],
  });
  ok(!r.ok, 'duplicate origin/unit demand rejected');
  ok(JSON.stringify(s.board) === before && s.combat === null, 'overcommit rejection preserves board and battle state');
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
    const r2 = act(s2, 'germany', { type: 'attack', target: 'russia', forces: [{ from: 'germany', via: 'poland', units: [{ key: 'tank', count: 1 }] }] });
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

// ---------- combat survivors are spent; aircraft still receive a landing move ----------
{
  const s = mkState(101);
  s.phase = 'combatMove';
  s.board.germany = [{ power: 'germany', key: 'infantry', count: 1 }];
  s.board.poland = [];
  s.control.poland = 'ussr';
  const first = act(s, 'germany', {
    type: 'attack', target: 'poland',
    forces: [{ from: 'germany', units: [{ key: 'infantry', count: 1 }] }],
  });
  ok(first.ok && s.phase === 'combatMove' && s.control.poland === 'germany', 'walk-in capture resolves immediately');
  const repeat = act(s, 'germany', {
    type: 'attack', target: 'russia',
    forces: [{ from: 'poland', units: [{ key: 'infantry', count: 1 }] }],
  });
  ok(!repeat.ok, 'surviving infantry cannot attack again from captured territory');
  act(s, 'germany', { type: 'endPhase' });
  ok(!act(s, 'germany', { type: 'move', from: 'poland', to: 'germany', units: [{ key: 'infantry', count: 1 }] }).ok, 'combat-spent land unit cannot move again in noncombat');
}
{
  const s = mkState(103);
  s.phase = 'combatMove';
  s.board.germany = [{ power: 'germany', key: 'fighter', count: 1 }];
  s.board.poland = [];
  s.control.poland = 'ussr';
  ok(act(s, 'germany', {
    type: 'attack', target: 'poland',
    forces: [{ from: 'germany', units: [{ key: 'fighter', count: 1 }] }],
  }).ok, 'air-only combat move resolves');
  ok(!act(s, 'germany', {
    type: 'attack', target: 'russia',
    forces: [{ from: 'poland', units: [{ key: 'fighter', count: 1 }] }],
  }).ok, 'fighter cannot attack twice in combat');
  ok(act(s, 'germany', { type: 'endPhase' }).ok, 'combat phase ends');
  ok(act(s, 'germany', { type: 'move', from: 'poland', to: 'germany', units: [{ key: 'fighter', count: 1 }] }).ok, 'combat fighter receives its noncombat landing move');
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

// ---------- captured infrastructure changes hands instead of vanishing ----------
{
  const s = mkState(71);
  s.phase = 'combatMove';
  s.board.russia = [
    { power: 'ussr', key: 'factory', count: 1 },
    { power: 'ussr', key: 'aaGun', count: 1 },
  ];
  s.factoryDamage.russia = 3;
  const r = act(s, 'germany', {
    type: 'attack', target: 'russia',
    forces: [{ from: 'poland', units: [{ key: 'infantry', count: 1 }] }],
  });
  ok(r.ok, 'walk-in against infrastructure begins');
  driveBattle(s, 'germany', 'ussr');
  ok(s.control.russia === 'germany', 'infrastructure territory captured');
  ok(unitCount(s, 'russia', 'germany', 'factory') === 1, 'industrial complex retagged to capturer');
  ok(unitCount(s, 'russia', 'germany', 'aaGun') === 1, 'AA gun retagged to capturer');
  ok(s.factoryDamage.russia === 3, 'captured factory keeps its damage');
}

// ---------- blitz flips an empty hostile intermediate ----------
{
  const s = mkState(29);
  // empty Poland, hand it to the USSR: tanks must blitz through
  s.board.poland = [];
  s.control.poland = 'ussr';
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  const r = act(s, 'germany', { type: 'attack', target: 'russia', forces: [{ from: 'germany', via: 'poland', units: [{ key: 'tank', count: 2 }] }] });
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
  ok(s.combat?.battle.ctx.amphibiousLand?.infantry === 2, 'battle records the exact offloaded beach force');
  driveBattle(s, 'germany', 'uk');
  ok(unitCount(s, 'uk-island', 'germany', 'battleship') === 0, 'battleship never stands in the territory');
  const bbAtSea = unitCount(s, 'sz-2', 'germany', 'battleship');
  ok(bbAtSea === 1, `battleship returned to the offload zone (${bbAtSea})`);
}

// ---------- shore bombardment is capped before any units move ----------
{
  const s = mkState(38);
  s.phase = 'combatMove';
  s.board['sz-2'] = [
    { power: 'germany', key: 'battleship', count: 2 },
    { power: 'germany', key: 'transport', count: 1, cargo: [{ power: 'germany', key: 'infantry', count: 1 }] },
  ];
  const before = JSON.stringify(s.board['sz-2']);
  const r = act(s, 'germany', {
    type: 'attack', target: 'uk-island',
    forces: [{ from: 'sz-2', units: [{ key: 'battleship', count: 2 }] }],
    offloadFrom: 'sz-2',
    offloadUnits: [{ key: 'infantry', count: 1 }],
  });
  ok(!r.ok && r.error?.includes('one battleship or cruiser') === true, 'one offloaded land unit cannot call in two bombardment ships');
  ok(JSON.stringify(s.board['sz-2']) === before && s.combat === null, 'rejected excess bombardment leaves ships and cargo untouched');
}
{
  const s = mkState(39);
  s.phase = 'combatMove';
  s.contested = ['sz-2']; // a sea battle already resolved here this turn
  s.board['sz-2'] = [
    { power: 'germany', key: 'battleship', count: 1 },
    { power: 'germany', key: 'transport', count: 1, cargo: [{ power: 'germany', key: 'infantry', count: 1 }] },
  ];
  const before = JSON.stringify(s.board['sz-2']);
  const r = act(s, 'germany', {
    type: 'attack', target: 'uk-island',
    forces: [{ from: 'sz-2', units: [{ key: 'battleship', count: 1 }] }],
    offloadFrom: 'sz-2', offloadUnits: [{ key: 'infantry', count: 1 }],
  });
  ok(!r.ok && r.error?.includes('after sea combat') === true, 'shore bombardment is forbidden after prior combat in the offload zone');
  ok(JSON.stringify(s.board['sz-2']) === before && s.combat === null, 'rejected post-sea-combat bombardment is atomic');
}

// ---------- mixed amphibious retreat returns overland/air, beach stays ----------
{
  const s = mkState(5504); // first-round attack/defense dice are all misses
  s.phase = 'combatMove';
  s.board.poland = [
    { power: 'germany', key: 'infantry', count: 1 },
    { power: 'germany', key: 'fighter', count: 1 },
  ];
  s.board['sz-1'] = [{
    power: 'germany', key: 'transport', count: 1,
    cargo: [{ power: 'germany', key: 'infantry', count: 1 }],
  }];
  s.board.russia = [{ power: 'ussr', key: 'infantry', count: 1 }];
  const declared = act(s, 'germany', {
    type: 'attack', target: 'russia',
    forces: [{ from: 'poland', units: [{ key: 'infantry', count: 1 }, { key: 'fighter', count: 1 }] }],
    offloadFrom: 'sz-1', offloadUnits: [{ key: 'infantry', count: 1 }],
  });
  ok(declared.ok, `mixed amphibious attack begins (${declared.error ?? ''})`);
  ok(act(s, 'germany', { type: 'battleRoll' }).ok, 'mixed force first volley misses');
  ok(act(s, 'germany', { type: 'battleRoll' }).ok, 'defender first volley misses');
  ok(s.combat?.battle.decision?.type === 'retreat' && s.combat.battle.decision.partial === true, 'mixed force receives a partial retreat decision');
  ok(act(s, 'germany', { type: 'battleRetreat', retreat: true, destination: 'poland' }).ok, 'overland and air withdraw while beach combat continues');
  ok(s.combat?.battle.attacker.length === 1 && s.combat.battle.attacker[0].amphibious === true, 'offloaded infantry remains on the battle board');
  driveBattle(s, 'germany', 'ussr');
  ok(unitCount(s, 'poland', 'germany', 'infantry') === 1, 'withdrawn overland infantry returns to its land origin');
  ok(unitCount(s, 'russia', 'germany', 'fighter') === 1, 'withdrawn fighter remains over the battle space for noncombat landing');
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

// ---------- amphibious orders require an actually bordering sea zone ----------
{
  const s = mkState(73);
  s.phase = 'combatMove';
  s.board['sz-2'] = [{
    power: 'germany', key: 'transport', count: 1,
    cargo: [{ power: 'germany', key: 'infantry', count: 1 }],
  }];
  const before = JSON.stringify(s.board['sz-2']);
  const r = act(s, 'germany', {
    type: 'attack', target: 'russia', forces: [],
    offloadFrom: 'sz-2', offloadUnits: [{ key: 'infantry', count: 1 }],
  });
  ok(!r.ok, 'remote amphibious assault rejected');
  ok(JSON.stringify(s.board['sz-2']) === before && s.combat === null, 'invalid amphibious order leaves cargo untouched');
}

// ---------- rejected offload is atomic ----------
{
  const s = mkState(79);
  s.phase = 'noncombat';
  s.control['uk-island'] = 'germany';
  s.board['uk-island'] = [];
  s.board['sz-2'] = [{
    power: 'germany', key: 'transport', count: 1,
    cargo: [{ power: 'germany', key: 'infantry', count: 1 }],
  }];
  const r = act(s, 'germany', {
    type: 'offload', zone: 'sz-2', territory: 'uk-island',
    units: [{ key: 'infantry', count: 1 }, { key: 'tank', count: 1 }],
  });
  ok(!r.ok, 'mixed unavailable cargo order rejected');
  ok(unitCount(s, 'uk-island', 'germany', 'infantry') === 0, 'rejected offload puts nothing ashore');
  ok(s.board['sz-2'][0].cargo?.[0]?.count === 1, 'rejected offload retains all cargo');
}

// ---------- strategic bombing raid ----------
{
  const s = mkState(47);
  s.board.poland.push({ power: 'germany', key: 'bomber', count: 2 });
  act(s, 'germany', { type: 'endPhase' });
  act(s, 'germany', { type: 'endPhase' });
  const bad = act(s, 'germany', { type: 'sbr', target: 'poland', forces: [{ from: 'poland', bombers: 1 }] });
  ok(!bad.ok, 'no raiding your own complex');
  const rollsBefore = s.rolls;
  const damageBefore = s.factoryDamage.russia ?? 0;
  const factoryBefore = unitCount(s, 'russia', 'ussr', 'factory');
  const aaBefore = unitCount(s, 'russia', 'ussr', 'aaGun');
  const r = act(s, 'germany', { type: 'sbr', target: 'russia', forces: [{ from: 'poland', bombers: 2 }] });
  ok(r.ok, `raid launched (${r.error ?? ''})`);
  ok(s.phase === 'battle' && s.combat?.kind === 'strategicRaid' && s.combat.visualSeq === 0, 'raid opens the cinematic battle path at generation zero');
  ok(s.rolls === rollsBefore && (s.factoryDamage.russia ?? 0) === damageBefore, 'raid launch draws no dice and applies no damage');
  ok(unitCount(s, 'poland', 'germany', 'bomber') === 0 && unitCount(s, 'russia', 'germany', 'bomber') === 0, 'committed bombers remain inside the live raid until its report closes');
  driveBattle(s, 'germany', 'ussr');
  const dmg = s.factoryDamage.russia ?? 0;
  const shot = 2 - unitCount(s, 'russia', 'germany', 'bomber');
  ok(dmg >= 0 && dmg <= 16, `damage within cap (${dmg}, cap 16)`);
  ok(shot >= 0 && shot <= 2, 'AA losses sane');
  ok(s.phase === 'combatMove', 'raid returns to combat move after both report acknowledgements');
  ok(unitCount(s, 'russia', 'ussr', 'factory') === factoryBefore && unitCount(s, 'russia', 'ussr', 'aaGun') === aaBefore, 'raid never duplicates or removes target infrastructure');
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

// ---------- strategic bombers are spent after one raid ----------
{
  const s = mkState(107);
  s.phase = 'combatMove';
  s.board.poland = [{ power: 'germany', key: 'bomber', count: 1 }];
  s.board.russia = [{ power: 'ussr', key: 'factory', count: 1 }]; // no AA: bomber survives
  const raid = { type: 'sbr' as const, target: 'russia', forces: [{ from: 'poland', bombers: 1 }] };
  ok(act(s, 'germany', raid).ok, 'first strategic bombing raid succeeds');
  driveBattle(s, 'germany', 'ussr');
  ok(!act(s, 'germany', raid).ok, 'same bomber cannot raid twice in one combat phase');
}

// ---------- strategic raid cap applies exactly once ----------
{
  const s = mkState(109);
  s.phase = 'combatMove';
  s.factoryDamage.russia = 15;
  s.board.poland = [{ power: 'germany', key: 'bomber', count: 1 }];
  s.board.russia = [{ power: 'ussr', key: 'factory', count: 1 }];
  ok(act(s, 'germany', { type: 'sbr', target: 'russia', forces: [{ from: 'poland', bombers: 1 }] }).ok, 'near-saturated complex can still be raided');
  const combatId = s.combat!.id;
  ok(act(s, 'germany', { type: 'battleRoll', combatId, visualSeq: 0 }).ok, 'damage volley resolves against near-saturated complex');
  ok(s.factoryDamage.russia === 16 && s.combat?.raid?.appliedDamage === 1, 'factory cap admits exactly one remaining damage');
  const rollsAfterDamage = s.rolls;
  ok(!act(s, 'germany', { type: 'battleRoll', combatId, visualSeq: 0 }).ok, 'stale raid volley cannot be replayed');
  ok(s.factoryDamage.russia === 16 && s.rolls === rollsAfterDamage, 'replayed raid neither reapplies damage nor draws RNG');
  ok(act(s, 'germany', { type: 'battleContinue', combatId, visualSeq: 1 }).ok, 'attacker confirms capped raid');
  ok(act(s, 'ussr', { type: 'battleContinue', combatId, visualSeq: 1 }).ok, 'defender confirms capped raid');
  ok(s.factoryDamage.russia === 16, 'report acknowledgements do not apply strategic damage again');
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

// ---------- multi-type mobilization is atomic and capacity is public ----------
{
  const s = mkState(127);
  s.phase = 'mobilize';
  s.powers.germany.staging = { infantry: 2, tank: 1 };
  s.powers.germany.factoriesUsed.germany = 9;
  const before = JSON.stringify(s);
  const rejected = act(s, 'germany', {
    type: 'placeBatch', space: 'germany',
    units: [{ key: 'infantry', count: 1 }, { key: 'tank', count: 1 }],
  });
  ok(!rejected.ok, 'a multi-type batch over remaining factory capacity is rejected');
  ok(JSON.stringify(s) === before, 'rejected multi-type placement is fully atomic');

  s.powers.germany.factoriesUsed.germany = 8;
  const placed = act(s, 'germany', {
    type: 'placeBatch', space: 'germany',
    units: [{ key: 'infantry', count: 1 }, { key: 'tank', count: 1 }],
  });
  ok(placed.ok, `multi-type batch commits once (${placed.error ?? ''})`);
  ok(s.powers.germany.factoriesUsed.germany === 10, 'one authoritative capacity counter absorbs the whole batch');
  ok((s.powers.germany.staging.infantry ?? 0) === 1 && !s.powers.germany.staging.tank, 'all staged types decrement together');
  const view = axisViewFor(s, idx);
  ok(view.powers.germany.factoriesUsed.germany === 10, 'Axis view exposes authoritative factory usage');
  const reconnected = JSON.parse(JSON.stringify(view)) as typeof view;
  ok(reconnected.powers.germany.factoriesUsed.germany === 10, 'serialized reconnect view preserves used capacity');
}

// ---------- combat move bypass is closed; noncombat units move once ----------
{
  const s = mkState(83);
  s.phase = 'combatMove';
  const bypass = act(s, 'germany', { type: 'move', from: 'poland', to: 'russia', units: [{ key: 'infantry', count: 1 }] });
  ok(!bypass.ok, 'generic move cannot bypass battle during combat move');

  s.phase = 'noncombat';
  s.control.russia = 'germany';
  s.board.germany = [{ power: 'germany', key: 'infantry', count: 1 }];
  s.board.poland = [];
  s.board.russia = [];
  ok(act(s, 'germany', { type: 'move', from: 'germany', to: 'poland', units: [{ key: 'infantry', count: 1 }] }).ok, 'first noncombat move succeeds');
  const twice = act(s, 'germany', { type: 'move', from: 'poland', to: 'russia', units: [{ key: 'infantry', count: 1 }] });
  ok(!twice.ok, 'same infantry cannot move twice in one noncombat phase');
  ok(unitCount(s, 'poland', 'germany', 'infantry') === 1 && unitCount(s, 'russia', 'germany', 'infantry') === 0, 'spent unit stays at first destination');
}

// ---------- loaded ship movement preserves its cargo ----------
{
  const s = mkState(89);
  s.phase = 'noncombat';
  s.board['sz-1'] = [{
    power: 'germany', key: 'carrier', count: 1,
    cargo: [{ power: 'germany', key: 'fighter', count: 2 }],
  }];
  s.board['sz-2'] = [];
  const r = act(s, 'germany', { type: 'move', from: 'sz-1', to: 'sz-2', units: [{ key: 'carrier', count: 1 }] });
  ok(r.ok, `loaded carrier moves (${r.error ?? ''})`);
  const carrier = s.board['sz-2'].find((st) => st.power === 'germany' && st.key === 'carrier');
  ok(carrier?.cargo?.[0]?.key === 'fighter' && carrier.cargo[0].count === 2, 'carrier fighters move with their deck');
  const again = act(s, 'germany', { type: 'move', from: 'sz-2', to: 'sz-1', units: [{ key: 'carrier', count: 1 }] });
  ok(!again.ok, 'loaded carrier cannot move twice in the phase');
}

// ---------- physical transports load, move, and offload independently ----------
{
  const s = mkState(109);
  s.phase = 'noncombat';
  s.control['uk-island'] = 'germany';
  s.board.germany = [{ power: 'germany', key: 'infantry', count: 5 }];
  s.board['uk-island'] = [];
  s.board['sz-1'] = [{ power: 'germany', key: 'transport', count: 2 }];
  s.board['sz-2'] = [];

  const beforeOverload = JSON.stringify(s.board);
  ok(!act(s, 'germany', {
    type: 'load', zone: 'sz-1', territory: 'germany', units: [{ key: 'infantry', count: 5 }],
  }).ok, 'transport overload is rejected');
  ok(JSON.stringify(s.board) === beforeOverload, 'rejected transport overload is atomic');

  ok(act(s, 'germany', {
    type: 'load', zone: 'sz-1', territory: 'germany', units: [{ key: 'infantry', count: 2 }],
  }).ok, 'two transports load together');
  const loaded = s.board['sz-1'].filter((st) => st.power === 'germany' && st.key === 'transport');
  ok(loaded.length === 2 && loaded.every((st) => st.count === 1), 'loaded transports become separate physical stacks');
  ok(loaded.every((st) => st.cargo?.[0]?.key === 'infantry' && st.cargo[0].count === 1), 'cargo is spread across the physical transports');

  ok(act(s, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2', units: [{ key: 'transport', count: 1 }],
  }).ok, 'one loaded transport moves independently');
  const stayed = s.board['sz-1'].find((st) => st.power === 'germany' && st.key === 'transport');
  const moved = s.board['sz-2'].find((st) => st.power === 'germany' && st.key === 'transport');
  ok(stayed?.count === 1 && stayed.cargo?.[0]?.count === 1, 'other loaded transport stays behind with its cargo');
  ok(moved?.count === 1 && moved.cargo?.[0]?.count === 1, 'moving transport retains only its own cargo');

  ok(act(s, 'germany', {
    type: 'offload', zone: 'sz-2', territory: 'uk-island', units: [{ key: 'infantry', count: 1 }],
  }).ok, 'moved transport offloads independently');
  ok(unitCount(s, 'uk-island', 'germany', 'infantry') === 1, 'only the moved transport cargo lands');
  const emptied = s.board['sz-2'].find((st) => st.power === 'germany' && st.key === 'transport');
  ok(!emptied?.cargo?.length && stayed?.cargo?.[0]?.count === 1, 'offload leaves the other transport cargo untouched');
}

// ---------- legacy loaded aggregates split when one transport moves ----------
{
  const s = mkState(111);
  s.phase = 'noncombat';
  s.board['sz-1'] = [{
    power: 'germany', key: 'transport', count: 2,
    cargo: [{ power: 'germany', key: 'infantry', count: 2 }],
  }, {
    power: 'germany', key: 'carrier', count: 2,
    cargo: [{ power: 'germany', key: 'fighter', count: 2 }],
  }];
  s.board['sz-2'] = [];
  const beforeMixedMove = JSON.stringify(s.board);
  ok(!act(s, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2',
    units: [{ key: 'transport', count: 1 }, { key: 'carrier', count: 1 }],
  }).ok, 'an unsplittable companion stack rejects the whole move');
  ok(JSON.stringify(s.board) === beforeMixedMove, 'rejected mixed ship move does not split transports');
  s.board['sz-1'] = s.board['sz-1'].filter((st) => st.key === 'transport');
  ok(act(s, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2', units: [{ key: 'transport', count: 1 }],
  }).ok, 'one transport can move from a legacy loaded aggregate');
  const source = s.board['sz-1'].find((st) => st.key === 'transport');
  const destination = s.board['sz-2'].find((st) => st.key === 'transport');
  ok(source?.count === 1 && source.cargo?.[0]?.count === 1, 'legacy source keeps one physical transport and cargo');
  ok(destination?.count === 1 && destination.cargo?.[0]?.count === 1, 'legacy moved transport carries its independent cargo');
}

// ---------- battleship damage follows the physical unit that moves ----------
{
  const s = mkState(113);
  s.phase = 'noncombat';
  s.board['sz-1'] = [{ power: 'germany', key: 'battleship', count: 2, damaged: 1 }];
  s.board['sz-2'] = [];
  ok(act(s, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2', units: [{ key: 'battleship', count: 1 }],
  }).ok, 'one battleship moves from a mixed-damage stack');
  const left = s.board['sz-1'].find((st) => st.key === 'battleship');
  const first = s.board['sz-2'].find((st) => st.key === 'battleship');
  ok(left?.count === 1 && left.damaged === 1, 'healthy battleship moves first and damaged battleship stays deterministically');
  ok(first?.count === 1 && !first.damaged, 'healthy moved battleship does not inherit damage');
  ok(act(s, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2', units: [{ key: 'battleship', count: 1 }],
  }).ok, 'remaining damaged battleship moves independently');
  const together = s.board['sz-2'].find((st) => st.key === 'battleship');
  ok(together?.count === 2 && together.damaged === 1, 'moving all battleships preserves the exact damaged count');
}

// ---------- battleship damage lasts through combat and repairs afterward ----------
{
  // Seed 3 produces four misses (5, 6, 5, 6), leaving both mixed-damage
  // fleets intact for a deterministic retreat after round one.
  const s = mkState(3);
  s.phase = 'combatMove';
  s.board['sz-1'] = [{ power: 'germany', key: 'battleship', count: 2, damaged: 1 }];
  s.board['sz-2'] = [{ power: 'uk', key: 'battleship', count: 2, damaged: 1 }];
  const declared = act(s, 'germany', {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-1', units: [{ key: 'battleship', count: 2 }] }],
  });
  ok(declared.ok, `mixed-damage battleships enter combat (${declared.error ?? ''})`);
  ok(s.combat?.battle.attacker.filter((u) => u.key === 'battleship' && u.hp === 1).length === 1, 'exact attacker damage enters combat');
  ok(s.combat?.battle.defender.filter((u) => u.key === 'battleship' && u.hp === 1).length === 1, 'exact defender damage enters combat');
  ok(act(s, 'germany', { type: 'battleRoll' }).ok, 'attacker miss volley resolves');
  ok(act(s, 'germany', { type: 'battleRoll' }).ok, 'defender miss volley resolves');
  ok(s.combat?.battle.decision?.type === 'retreat', 'attacker receives the between-round retreat decision');
  ok(act(s, 'germany', { type: 'battleRetreat', retreat: true, destination: 'sz-1' }).ok, 'attacker retreats with surviving damaged fleet');
  ok(act(s, 'germany', { type: 'battleContinue' }).ok, 'attacker confirms damage report');
  ok(act(s, 'uk', { type: 'battleContinue' }).ok, 'defender confirms damage report');
  const attackerFleet = s.board['sz-1'].find((st) => st.power === 'germany' && st.key === 'battleship');
  const defenderFleet = s.board['sz-2'].find((st) => st.power === 'uk' && st.key === 'battleship');
  ok(attackerFleet?.count === 2 && !attackerFleet.damaged, 'attacking battleships repair free when combat concludes');
  ok(defenderFleet?.count === 2 && !defenderFleet.damaged, 'defending battleships repair free when combat concludes');
}
{
  // Seed 2 makes the attacker miss (5) and defender hit (4), proving a new
  // in-battle wound is written back rather than only preserving old markers.
  const s = mkState(2);
  s.phase = 'combatMove';
  s.board['sz-1'] = [{ power: 'germany', key: 'battleship', count: 1 }];
  s.board['sz-2'] = [{ power: 'uk', key: 'battleship', count: 1 }];
  ok(act(s, 'germany', {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-1', units: [{ key: 'battleship', count: 1 }] }],
  }).ok, 'healthy battleships enter damage write-back combat');
  ok(act(s, 'germany', { type: 'battleRoll' }).ok, 'healthy attacker misses');
  ok(act(s, 'germany', { type: 'battleRoll' }).ok, 'defender damages the attacking battleship');
  ok(s.combat?.battle.attacker[0]?.hp === 1, 'attacking battleship survives its first combat hit at 1 HP');
  ok(act(s, 'germany', { type: 'battleRetreat', retreat: true, destination: 'sz-1' }).ok, 'newly damaged attacker retreats');
  ok(act(s, 'germany', { type: 'battleContinue' }).ok, 'damaged attacker confirms report');
  ok(act(s, 'uk', { type: 'battleContinue' }).ok, 'healthy defender confirms report');
  const attacker = s.board['sz-1'].find((st) => st.power === 'germany' && st.key === 'battleship');
  const defender = s.board['sz-2'].find((st) => st.power === 'uk' && st.key === 'battleship');
  ok(attacker?.count === 1 && !attacker.damaged, 'new combat damage remains through the battle but repairs on return');
  ok(defender?.count === 1 && !defender.damaged, 'unhit defender returns healthy');
}

// ---------- US must place its full China grant before ending ----------
{
  const s = mkState(97);
  s.turnIdx = 5; // USA
  s.phase = 'mobilize';
  s.chinaGrant = 1;
  s.control.yunnan = 'china';
  s.board.yunnan = [{ power: 'china', key: 'infantry', count: 1 }];
  s.chinaPlacementSpaces = ['yunnan'];
  const r = act(s, 'usa', { type: 'endPhase' });
  ok(!r.ok, 'US cannot end mobilization with Chinese infantry unplaced');
  ok(s.phase === 'mobilize' && activePower(s) === 'usa' && s.chinaGrant === 1, 'blocked China placement keeps the turn in place');
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
    if (p === 'usa' && s.phase === 'combatMove' && !s.usaOperationFirst) {
      ok(act(s, 'usa', { type: 'chooseUsOperationOrder', first: 'usa' }).ok, 'USA chooses its separate operation order');
      continue;
    }
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
import { vcCount, productionOf } from './state.js';
import { STARTING_IPCS, TECHS, TURN_ORDER } from './config.js';

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
    let fieldedFighters = 0;
    let carrierCargoFighters = 0;
    for (const stacks of Object.values(st.board)) {
      for (const u of stacks) {
        byPower[u.power] = (byPower[u.power] ?? 0) + u.count;
        if (u.key === 'carrier') carrierCargoFighters += (u.cargo ?? []).filter((cargo) => cargo.key === 'fighter').reduce((sum, cargo) => sum + cargo.count, 0);
        if (u.key === 'fighter') fieldedFighters += u.count;
      }
    }
    for (const p of TURN_ORDER[st.options.scenario]) {
      ok((byPower[p] ?? 0) >= 10, `${st.options.scenario} ${p} fields units (${byPower[p] ?? 0})`);
    }
    ok((byPower.china ?? 0) >= 4, `${st.options.scenario} china fields infantry (${byPower.china ?? 0})`);
    ok(carrierCargoFighters === 0, `${st.options.scenario} carriers do not hide fighter units as cargo`);
    ok(fieldedFighters > 0, `${st.options.scenario} fighters are independent fielded units`);
  }

  // China placement during the US mobilize (real map: isChinese flags)
  {
    const s = createAxisGame([], 55, { scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard' });
    s.turnIdx = TURN_ORDER['1941'].indexOf('usa');
    s.phase = 'noncombat';
    s.usaOperationFirst = 'usa';
    s.usaOperationIndex = 1;
    s.chinaGrant = chinaInfantryGrant(s, AXIS_INDEX);
    s.chinaGrantPreparedRound = s.round;
    ok(applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'endPhase' }).ok, 'US noncombat ends');
    ok(s.phase === 'mobilize', 'US mobilize');
    ok(s.chinaGrant >= 3, `China grant from 7+ free territories (${s.chinaGrant})`);
    const before = s.chinaGrant;
    const spot = s.chinaPlacementSpaces[0];
    ok(!!spot, 'a Chinese territory has room');
    ok(applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'placeChina', space: spot }).ok, 'china infantry placed');
    ok(s.chinaGrant === before - 1, 'grant decrements');
    const bad = applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'placeChina', space: 'manchuria' });
    ok(!bad.ok, 'no placement on Japanese-held Manchuria');
    const badTerr = applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'placeChina', space: 'india' });
    ok(!badTerr.ok, 'china stays inside China');
  }

  // China placement uses its mobilization-start snapshot and is unlimited.
  {
    const s = createAxisGame([], 56, { scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard' });
    s.turnIdx = TURN_ORDER['1941'].indexOf('usa');
    s.phase = 'mobilize';
    s.control.yunnan = 'usa';
    s.board.yunnan = [
      { power: 'usa', key: 'factory', count: 1 },
      { power: 'china', key: 'infantry', count: 1 },
    ];
    s.powers.usa.staging = { infantry: 1 };
    s.powers.usa.factoriesUsed = {};
    s.chinaGrant = 1;
    s.chinaPlacementSpaces = [];
    const before = JSON.stringify(s);
    const crowded = applyAxisAction(s, AXIS_INDEX, 'usa', {
      type: 'placeBatch', space: 'yunnan', units: [{ key: 'infantry', count: 1 }], china: 1,
    });
    ok(!crowded.ok, 'a non-eligible China destination rejects a combined order');
    ok(JSON.stringify(s) === before, 'failed China rule cannot leave the regular unit partially placed');

    s.control.yunnan = 'china';
    s.board.yunnan = [
      { power: 'china', key: 'infantry', count: 2 },
      { power: 'uk', key: 'infantry', count: 8 },
    ];
    s.powers.usa.staging = {};
    s.chinaGrant = 4;
    s.chinaPlacementSpaces = ['yunnan'];
    const combined = applyAxisAction(s, AXIS_INDEX, 'usa', {
      type: 'placeBatch', space: 'yunnan', units: [], china: 4,
    });
    ok(combined.ok, `all awarded Chinese infantry may use one eligible territory (${combined.error ?? ''})`);
    ok(s.chinaGrant === 0, 'full China grant decrements together');
    ok(unitCount(s, 'yunnan', 'china', 'infantry') === 6, 'phase-start two-piece territory may exceed three after placement');
    ok(unitCount(s, 'yunnan', 'uk', 'infantry') === 8, 'Allied pieces neither block nor change China placement');
  }

  // a full seeded round on the real map completes and reaches round 2
  const s = createAxisGame([], 777, { scenario: '1941', rnd: false, nationalObjectives: true, winCondition: 'standard' });
  // This phase-machine smoke intentionally declares no battles. Remove the
  // opening US transport trapped with Japan in sz-50; ordinary play must
  // explicitly resolve that mandatory same-zone battle.
  s.board['sz-50'] = (s.board['sz-50'] ?? []).filter((stack) => stack.power !== 'usa');
  let guard = 0;
  while (s.round === 1 && guard++ < 100 && !s.winner) {
    const p = activePower(s);
    if (p === 'usa' && s.phase === 'combatMove' && !s.usaOperationFirst) {
      const chosen = applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'chooseUsOperationOrder', first: 'china' });
      ok(chosen.ok, `USA/China order chosen (${chosen.error ?? ''})`);
      continue;
    }
    if (p === 'usa' && s.phase === 'mobilize' && s.chinaGrant > 0) {
      while (s.chinaGrant > 0) {
        const spot = s.chinaPlacementSpaces[0];
        ok(!!spot, 'real-map China grant has an eligible placement');
        if (!spot) break;
        const placed = applyAxisAction(s, AXIS_INDEX, 'usa', { type: 'placeChina', space: spot });
        ok(placed.ok, `real-map China grant placed (${placed.error ?? ''})`);
        if (!placed.ok) break;
      }
    }
    const r = applyAxisAction(s, AXIS_INDEX, p, { type: 'endPhase' });
    ok(r.ok, `real-map endPhase ${p}/${s.phase} (${r.error ?? ''})`);
    if (!r.ok) break;
  }
  ok(s.round === 2, 'real-map full round completes');
}

console.log(`\naxis-test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
