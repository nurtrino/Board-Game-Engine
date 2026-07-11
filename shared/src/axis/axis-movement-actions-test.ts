import { strict as assert } from 'node:assert';
import { applyAxisAction, type AxisAction } from './actions.js';
import { indexMap, type AxisMap } from './map.js';
import { createAxis, unitCount, type AxisState, type SetupData, type UnitStack } from './state.js';

const map: AxisMap = {
  territories: [
    { id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', isCapital: true, center: [0, 0], adj: ['friendly-mid', 'hostile-mid'] },
    { id: 'friendly-mid', name: 'Friendly Mid', ipc: 2, originalOwner: 'italy', center: [1, 0], adj: ['home', 'target'] },
    { id: 'hostile-mid', name: 'Hostile Mid', ipc: 2, originalOwner: 'ussr', center: [1, 1], adj: ['home', 'target'] },
    { id: 'target', name: 'Target', ipc: 3, originalOwner: 'ussr', center: [2, 0], adj: ['friendly-mid', 'hostile-mid'] },
    { id: 'canal-gate', name: 'Canal Gate', ipc: 1, originalOwner: 'italy', center: [0, 2], adj: [] },
    { id: 'airfield', name: 'Airfield', ipc: 2, originalOwner: 'germany', center: [3, 0], adj: [], coastTo: ['sz-2'] },
  ],
  seaZones: [
    { id: 'sz-0', n: 0, center: [0, 3], adj: ['sz-1'] },
    { id: 'sz-1', n: 1, center: [1, 3], adj: ['sz-0', 'sz-2'] },
    { id: 'sz-2', n: 2, center: [2, 3], adj: ['sz-1'], coastTo: ['airfield'] },
  ],
  canals: [{ id: 'test-canal', connects: ['sz-0', 'sz-1'], controlledBy: ['canal-gate'] }],
};
const idx = indexMap(map);
const baseControl: SetupData['control'] = {
  home: 'germany',
  'friendly-mid': 'italy',
  'hostile-mid': 'ussr',
  target: 'ussr',
  'canal-gate': 'italy',
  airfield: 'germany',
};

function game(
  phase: AxisState['phase'],
  units: Record<string, UnitStack[]>,
  control: SetupData['control'] = baseControl,
): AxisState {
  const state = createAxis(map, { control, units }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 31,
  });
  state.phase = phase;
  return state;
}

const act = (state: AxisState, action: AxisAction) => applyAxisAction(state, idx, 'germany', action);
const snapshot = (state: AxisState) => JSON.stringify(state);

{
  const state = game('combatMove', {
    home: [{ power: 'germany', key: 'tank', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  state.powers.germany.techs.push('mechanizedInfantry');
  const result = act(state, {
    type: 'attack', target: 'target',
    forces: [{ from: 'home', via: 'friendly-mid', units: [{ key: 'tank', count: 1 }, { key: 'infantry', count: 1 }] }],
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(state.combat?.battle.attacker.map((unit) => unit.key).sort(), ['infantry', 'tank']);
}

{
  const state = game('combatMove', {
    home: [{ power: 'germany', key: 'tank', count: 1 }, { power: 'germany', key: 'infantry', count: 2 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  state.powers.germany.techs.push('mechanizedInfantry');
  const before = snapshot(state);
  const result = act(state, {
    type: 'attack', target: 'target',
    forces: [{ from: 'home', via: 'friendly-mid', units: [{ key: 'tank', count: 1 }, { key: 'infantry', count: 2 }] }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /1 more unmoved tank/);
  assert.equal(snapshot(state), before, 'a short mechanized pairing rejects atomically');
}

{
  const state = game('combatMove', {
    home: [{ power: 'germany', key: 'tank', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  state.powers.germany.techs.push('mechanizedInfantry');
  const before = snapshot(state);
  const rejected = act(state, {
    type: 'attack', target: 'target',
    forces: [{ from: 'home', via: 'hostile-mid', units: [{ key: 'tank', count: 1 }, { key: 'infantry', count: 1 }] }],
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error ?? '', /cannot blitz/);
  assert.equal(snapshot(state), before, 'infantry never inherits a paired tank\'s blitz');

  const tankOnly = game('combatMove', {
    home: [{ power: 'germany', key: 'tank', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  const accepted = act(tankOnly, {
    type: 'attack', target: 'target',
    forces: [{ from: 'home', via: 'hostile-mid', units: [{ key: 'tank', count: 1 }] }],
  });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(tankOnly.control['hostile-mid'], 'germany', 'the exact same route remains a legal tank-only blitz');
}

{
  const state = game('noncombat', {
    home: [{ power: 'germany', key: 'tank', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
  }, { ...baseControl, target: 'germany' });
  state.powers.germany.techs.push('mechanizedInfantry');
  const result = act(state, {
    type: 'move', from: 'home', via: 'friendly-mid', to: 'target',
    units: [{ key: 'tank', count: 1 }, { key: 'infantry', count: 1 }],
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(unitCount(state, 'target', 'germany', 'tank'), 1);
  assert.equal(unitCount(state, 'target', 'germany', 'infantry'), 1);
}

{
  const open = game('noncombat', { 'sz-0': [{ power: 'germany', key: 'destroyer', count: 1 }] });
  assert.equal(act(open, {
    type: 'move', from: 'sz-0', to: 'sz-1', units: [{ key: 'destroyer', count: 1 }],
  }).ok, true, 'allied start-of-turn control opens the canal');

  const captured = game('noncombat', { 'sz-0': [{ power: 'germany', key: 'destroyer', count: 1 }] }, {
    ...baseControl, 'canal-gate': 'germany',
  });
  captured.contested.push('canal-gate');
  const before = snapshot(captured);
  assert.equal(act(captured, {
    type: 'move', from: 'sz-0', to: 'sz-1', units: [{ key: 'destroyer', count: 1 }],
  }).ok, false, 'a canal captured this turn remains closed');
  assert.equal(snapshot(captured), before);
}

{
  const throughSurface = game('combatMove', {
    'sz-0': [{ power: 'germany', key: 'submarine', count: 1 }],
    'sz-1': [{ power: 'ussr', key: 'cruiser', count: 1 }],
    'sz-2': [{ power: 'ussr', key: 'destroyer', count: 1 }],
  });
  const accepted = act(throughSurface, {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-0', via: 'sz-1', units: [{ key: 'submarine', count: 1 }] }],
  });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(throughSurface.phase, 'battle', 'the enemy destroyer is legal as the final combat destination');

  const detected = game('combatMove', {
    'sz-0': [{ power: 'germany', key: 'submarine', count: 1 }],
    'sz-1': [{ power: 'ussr', key: 'destroyer', count: 1 }],
    'sz-2': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  const before = snapshot(detected);
  assert.equal(act(detected, {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-0', via: 'sz-1', units: [{ key: 'submarine', count: 1 }] }],
  }).ok, false, 'a submarine cannot pass through an enemy destroyer');
  assert.equal(snapshot(detected), before);
}

{
  const state = game('noncombat', {
    'sz-0': [{ power: 'germany', key: 'battleship', count: 1 }],
    'sz-1': [
      { power: 'ussr', key: 'submarine', count: 1 },
      { power: 'ussr', key: 'transport', count: 1 },
    ],
  });
  const result = act(state, {
    type: 'move', from: 'sz-0', via: 'sz-1', to: 'sz-2', units: [{ key: 'battleship', count: 1 }],
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(unitCount(state, 'sz-2', 'germany', 'battleship'), 1,
    'enemy submarines and transports do not block an ordinary warship route');
}

{
  const state = game('noncombat', {
    airfield: [{ power: 'germany', key: 'fighter', count: 1 }],
    'sz-2': [
      { power: 'germany', key: 'carrier', count: 1 },
      { power: 'ussr', key: 'submarine', count: 1 },
    ],
  });
  assert.equal(act(state, {
    type: 'move', from: 'airfield', to: 'sz-2', units: [{ key: 'fighter', count: 1 }],
  }).ok, true, 'an enemy submarine alone does not make a carrier landing zone hostile');

  const hostile = game('noncombat', {
    airfield: [{ power: 'germany', key: 'fighter', count: 1 }],
    'sz-2': [
      { power: 'germany', key: 'carrier', count: 1 },
      { power: 'ussr', key: 'cruiser', count: 1 },
    ],
  });
  const before = snapshot(hostile);
  assert.equal(act(hostile, {
    type: 'move', from: 'airfield', to: 'sz-2', units: [{ key: 'fighter', count: 1 }],
  }).ok, false, 'an enemy surface warship still blocks a carrier landing');
  assert.equal(snapshot(hostile), before);
}

console.log('axis movement actions: all assertions passed');

