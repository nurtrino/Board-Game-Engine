import assert from 'node:assert/strict';
import { applyAxisAction, type AxisAction } from './actions.js';
import { indexMap, type AxisMap } from './map.js';
import { axisPieceSelectionSignature } from './physical.js';
import {
  activePower,
  axisViewFor,
  createAxis,
  normalizeAxisState,
  unitCount,
  type AxisState,
  type SetupData,
  type UnitStack,
} from './state.js';

const map: AxisMap = {
  territories: [
    { id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', center: [0, 0], adj: ['mid', 'enemy-a'] },
    { id: 'mid', name: 'Middle', ipc: 2, originalOwner: 'germany', center: [1, 0], adj: ['home', 'source-2', 'enemy-b'] },
    { id: 'source-2', name: 'Second Source', ipc: 1, originalOwner: 'germany', center: [2, 0], adj: ['mid'] },
    { id: 'enemy-a', name: 'Enemy A', ipc: 3, originalOwner: 'ussr', center: [0, 1], adj: ['home'] },
    { id: 'enemy-b', name: 'Enemy B', ipc: 2, originalOwner: 'ussr', center: [2, 1], adj: ['mid'] },
  ],
  seaZones: [],
  canals: [],
};
const idx = indexMap(map);
const control: SetupData['control'] = {
  home: 'germany',
  mid: 'germany',
  'source-2': 'germany',
  'enemy-a': 'ussr',
  'enemy-b': 'ussr',
};

function game(units: Record<string, UnitStack[]>, seed = 31): AxisState {
  const state = createAxis(map, { control, units }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed,
  });
  state.phase = 'combatMove';
  return state;
}

const act = (state: AxisState, action: AxisAction, seat: 'germany' | 'ussr' = 'germany') =>
  applyAxisAction(state, idx, seat, action);
const snapshot = (state: AxisState): string => JSON.stringify(state);
const launcher = (state: AxisState, source: string, ordinal = 0) => ({
  ordinal,
  selectionSig: axisPieceSelectionSignature(state.board[source] ?? [], 'germany', 'aaGun'),
});

function closeEconomicCombat(state: AxisState): void {
  const combatId = state.combat!.id;
  const visualSeq = state.combat!.visualSeq;
  assert.equal(act(state, { type: 'battleRoll', combatId, visualSeq }).ok, true);
  assert.equal(act(state, {
    type: 'battleContinue', combatId, visualSeq: visualSeq + 1,
  }).ok, true);
  assert.equal(act(state, {
    type: 'battleContinue', combatId, visualSeq: visualSeq + 1,
  }, 'ussr').ok, true);
}

// One accepted multi-origin SBR consumes its target exactly once. A second
// raid at that factory rejects atomically, while another factory remains legal.
{
  const state = game({
    home: [{ power: 'germany', key: 'bomber', count: 2 }],
    'source-2': [{ power: 'germany', key: 'bomber', count: 1 }],
    'enemy-a': [{ power: 'ussr', key: 'factory', count: 1 }],
    'enemy-b': [{ power: 'ussr', key: 'factory', count: 1 }],
  });
  const rollsBefore = state.rolls;
  assert.equal(act(state, {
    type: 'sbr',
    target: 'enemy-a',
    forces: [{ from: 'home', bombers: 1 }, { from: 'source-2', bombers: 1 }],
  }).ok, true, 'one action aggregates every bomber origin assigned to the complex');
  assert.deepEqual(state.economicRaidLedger.targetedFactories, ['enemy-a']);
  assert.equal(state.rolls, rollsBefore, 'accepted SBR launch draws no RNG');
  closeEconomicCombat(state);

  const beforeDuplicate = snapshot(state);
  const duplicate = act(state, {
    type: 'sbr', target: 'enemy-a', forces: [{ from: 'home', bombers: 1 }],
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error ?? '', /already been assigned/i);
  assert.equal(snapshot(state), beforeDuplicate, 'duplicate SBR validation is fully atomic');

  assert.equal(act(state, {
    type: 'sbr', target: 'enemy-b', forces: [{ from: 'home', bombers: 1 }],
  }).ok, true, 'a distinct enemy complex remains an independent SBR target');
  assert.deepEqual(state.economicRaidLedger.targetedFactories, ['enemy-a', 'enemy-b']);
}

// A rejected raid never reserves its target, and ordinary combat does not read
// the economic ledger or lose access to a previously bombed territory.
{
  const rejected = game({
    'enemy-a': [{ power: 'ussr', key: 'factory', count: 1 }],
  });
  const before = snapshot(rejected);
  assert.equal(act(rejected, {
    type: 'sbr', target: 'enemy-a', forces: [{ from: 'home', bombers: 1 }],
  }).ok, false);
  assert.equal(snapshot(rejected), before);
  assert.deepEqual(rejected.economicRaidLedger.targetedFactories, []);

  const ordinary = game({
    home: [{ power: 'germany', key: 'infantry', count: 1 }],
    'enemy-a': [
      { power: 'ussr', key: 'infantry', count: 1 },
      { power: 'ussr', key: 'factory', count: 1 },
    ],
  });
  ordinary.economicRaidLedger.targetedFactories.push('enemy-a');
  ordinary.rocketLedger.targetedFactories.push('enemy-a');
  assert.equal(act(ordinary, {
    type: 'attack', target: 'enemy-a', forces: [{ from: 'home', units: [{ key: 'infantry', count: 1 }] }],
  }).ok, true, 'ordinary combat is independent of both economic target ledgers');
}

// Rockets use one exact available AA sculpt, keep the real launcher untouched,
// and resolve exactly one physical d6 through the normal cinematic generation.
{
  const state = game({
    home: [{ power: 'germany', key: 'aaGun', count: 2 }],
    'source-2': [{ power: 'germany', key: 'aaGun', count: 1 }],
    'enemy-a': [{ power: 'ussr', key: 'factory', count: 1 }],
    'enemy-b': [{ power: 'ussr', key: 'factory', count: 1 }],
  });
  state.powers.germany.techs.push('rockets');
  state.factoryDamage['enemy-a'] = 5;

  const staleBefore = snapshot(state);
  const stale = act(state, {
    type: 'rocketStrike', source: 'home', target: 'enemy-a',
    launcher: { ordinal: 1, selectionSig: 'stale' },
  });
  assert.equal(stale.ok, false);
  assert.equal(snapshot(state), staleBefore, 'stale exact-launcher validation mutates nothing');

  const rollsBefore = state.rolls;
  const launch = act(state, {
    type: 'rocketStrike', source: 'home', target: 'enemy-a', launcher: launcher(state, 'home', 1),
  });
  assert.equal(launch.ok, true);
  assert.equal(state.combat?.kind, 'rocketStrike');
  assert.equal(state.combat?.battle.steps[0], 'rocket_damage');
  assert.equal(state.combat?.battle.status, 'ongoing');
  assert.deepEqual(state.combat?.rocket, {
    source: 'home', path: ['home', 'enemy-a'], distance: 1, launcherOrdinal: 1,
    cap: 6, damageBefore: 5,
  });
  assert.equal(state.rolls, rollsBefore, 'rocket launch draws no RNG before visual readiness');
  assert.equal(state.factoryDamage['enemy-a'], 5, 'rocket launch applies no premature damage');
  assert.equal(unitCount(state, 'home', 'germany', 'aaGun'), 2);
  assert.equal(state.board.home?.find((stack) => stack.key === 'aaGun')?.moved, undefined,
    'the real launcher remains present and unspent');
  assert.deepEqual(state.rocketLedger, {
    power: 'germany', launchedFrom: ['home'], targetedFactories: ['enemy-a'],
  });

  const combatId = state.combat!.id;
  const beforeFutureGeneration = snapshot(state);
  assert.equal(act(state, { type: 'battleRoll', combatId, visualSeq: 1 }).ok, false);
  assert.equal(snapshot(state), beforeFutureGeneration, 'future visual generation cannot roll early');

  assert.equal(act(state, { type: 'battleRoll', combatId, visualSeq: 0 }).ok, true);
  assert.equal(state.rolls, rollsBefore + 1, 'one and only one d6 is drawn');
  assert.equal(state.combat?.visualSeq, 1);
  assert.equal(state.combat?.battle.status, 'rocket_resolved');
  assert.ok((state.combat?.rocket?.roll ?? 0) >= 1 && (state.combat?.rocket?.roll ?? 0) <= 6);
  assert.equal(state.combat?.rocket?.appliedDamage, 1, 'near-cap complex accepts only one remaining damage');
  assert.equal(state.factoryDamage['enemy-a'], 6, 'damage is capped at twice printed IPC');

  const afterDamage = snapshot(state);
  assert.equal(act(state, { type: 'battleRoll', combatId, visualSeq: 0 }).ok, false);
  assert.equal(snapshot(state), afterDamage, 'stale replay neither draws RNG nor reapplies damage');
  assert.equal(act(state, { type: 'battleContinue', combatId, visualSeq: 1 }).ok, true);
  assert.equal(act(state, { type: 'battleContinue', combatId, visualSeq: 1 }, 'ussr').ok, true);
  assert.equal(state.phase, 'combatMove');
  assert.equal(unitCount(state, 'home', 'germany', 'aaGun'), 2, 'launcher remains after report close');

  const sameSourceBefore = snapshot(state);
  assert.equal(act(state, {
    type: 'rocketStrike', source: 'home', target: 'enemy-b', launcher: launcher(state, 'home'),
  }).ok, false, 'one territory supplies at most one launcher despite multiple AA guns');
  assert.equal(snapshot(state), sameSourceBefore);

  const sameTargetBefore = snapshot(state);
  assert.equal(act(state, {
    type: 'rocketStrike', source: 'source-2', target: 'enemy-a', launcher: launcher(state, 'source-2'),
  }).ok, false, 'one factory suffers at most one rocket strike per turn');
  assert.equal(snapshot(state), sameTargetBefore);

  assert.equal(act(state, {
    type: 'rocketStrike', source: 'source-2', target: 'enemy-b', launcher: launcher(state, 'source-2'),
  }).ok, true, 'a distinct source may strike a distinct in-range factory');
}

// The SBR and Rockets ledgers are independent, normalize safely for old saves,
// expose cloned arrays, and reset together at the next power's begin-turn gate.
{
  const independent = game({
    home: [
      { power: 'germany', key: 'aaGun', count: 1 },
      { power: 'germany', key: 'bomber', count: 1 },
    ],
    'enemy-a': [{ power: 'ussr', key: 'factory', count: 1 }],
  });
  independent.powers.germany.techs.push('rockets');
  independent.economicRaidLedger.targetedFactories.push('enemy-a');
  assert.equal(act(independent, {
    type: 'rocketStrike', source: 'home', target: 'enemy-a', launcher: launcher(independent, 'home'),
  }).ok, true, 'an SBR target does not consume the independent Rockets target limit');

  const legacy = game({});
  delete (legacy as Partial<AxisState>).economicRaidLedger;
  delete (legacy as Partial<AxisState>).rocketLedger;
  normalizeAxisState(legacy);
  assert.deepEqual(legacy.economicRaidLedger, { power: 'germany', targetedFactories: [] });
  assert.deepEqual(legacy.rocketLedger, { power: 'germany', launchedFrom: [], targetedFactories: [] });

  legacy.economicRaidLedger.targetedFactories.push('enemy-a');
  legacy.rocketLedger.launchedFrom.push('home');
  legacy.rocketLedger.targetedFactories.push('enemy-b');
  const view = axisViewFor(legacy, idx);
  view.economicRaidLedger.targetedFactories.push('view-only');
  view.rocketLedger.launchedFrom.push('view-only');
  assert.deepEqual(legacy.economicRaidLedger.targetedFactories, ['enemy-a'], 'view clones SBR ledger arrays');
  assert.deepEqual(legacy.rocketLedger.launchedFrom, ['home'], 'view clones Rockets ledger arrays');

  legacy.phase = 'mobilize';
  assert.equal(act(legacy, { type: 'endPhase' }).ok, true);
  assert.equal(activePower(legacy), 'ussr');
  assert.deepEqual(legacy.economicRaidLedger, { power: 'ussr', targetedFactories: [] });
  assert.deepEqual(legacy.rocketLedger, { power: 'ussr', launchedFrom: [], targetedFactories: [] });
}

console.log('axis economic strikes: all assertions passed');
