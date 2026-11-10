import { strict as assert } from 'node:assert';
import { applyAxisAction, type AxisAction } from './actions.js';
import { indexMap, type AxisMap } from './map.js';
import { createAxis, unitCount, type AxisState, type SetupData, type UnitStack } from './state.js';

const map: AxisMap = {
  territories: [
    { id: 'factory-2', name: 'Factory 2', ipc: 2, originalOwner: 'germany', center: [0, 0], adj: [], coastTo: ['sz-2'] },
    { id: 'factory-3', name: 'Factory 3', ipc: 3, originalOwner: 'germany', isCapital: true, center: [1, 0], adj: [], coastTo: ['sz-3'] },
    { id: 'factory-5', name: 'Factory 5', ipc: 5, originalOwner: 'germany', center: [2, 0], adj: [], coastTo: ['sz-5'] },
    { id: 'captured', name: 'Captured Factory', ipc: 4, originalOwner: 'ussr', center: [3, 0], adj: [], coastTo: ['sz-4'] },
  ],
  seaZones: [
    { id: 'sz-2', n: 2, center: [0, 1], adj: [], coastTo: ['factory-2'] },
    { id: 'sz-3', n: 3, center: [1, 1], adj: [], coastTo: ['factory-3'] },
    { id: 'sz-5', n: 5, center: [2, 1], adj: [], coastTo: ['factory-5'] },
    { id: 'sz-4', n: 4, center: [3, 1], adj: [], coastTo: ['captured'] },
  ],
  canals: [],
};
const idx = indexMap(map);
const control: SetupData['control'] = {
  'factory-2': 'germany',
  'factory-3': 'germany',
  'factory-5': 'germany',
  captured: 'germany',
};

function game(extra: Record<string, UnitStack[]> = {}, phase: AxisState['phase'] = 'mobilize'): AxisState {
  const state = createAxis(map, {
    control,
    units: {
      'factory-2': [{ power: 'germany', key: 'factory', count: 1 }],
      'factory-3': [{ power: 'germany', key: 'factory', count: 1 }],
      'factory-5': [{ power: 'germany', key: 'factory', count: 1 }],
      captured: [{ power: 'germany', key: 'factory', count: 1 }],
      ...extra,
    },
  }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 47,
  });
  state.phase = phase;
  return state;
}

const act = (state: AxisState, action: AxisAction) => applyAxisAction(state, idx, 'germany', action);
const snapshot = (state: AxisState) => JSON.stringify(state);

{
  const state = game({
    'sz-3': [{
      power: 'germany', key: 'carrier', count: 1,
      cargo: [{ power: 'italy', key: 'fighter', count: 1 }],
    }],
  });
  state.powers.germany.staging.fighter = 1;
  const result = act(state, {
    type: 'placeBatch', space: 'sz-3', factory: 'factory-3', units: [{ key: 'fighter', count: 1 }],
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(unitCount(state, 'sz-3', 'germany', 'fighter'), 1);
  assert.equal(state.powers.germany.factoriesUsed['factory-3'], 1);
}

{
  const state = game({ 'sz-3': [{ power: 'italy', key: 'carrier', count: 1 }] });
  state.powers.germany.staging.fighter = 1;
  const before = snapshot(state);
  const result = act(state, {
    type: 'placeBatch', space: 'sz-3', factory: 'factory-3', units: [{ key: 'fighter', count: 1 }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /your own/);
  assert.equal(snapshot(state), before, 'an allied-only deck rejection is atomic');
}

{
  const state = game();
  state.powers.germany.staging.carrier = 1;
  state.powers.germany.staging.fighter = 2;
  const result = act(state, {
    type: 'placeBatch', space: 'sz-3', factory: 'factory-3',
    units: [{ key: 'carrier', count: 1 }, { key: 'fighter', count: 2 }],
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(unitCount(state, 'sz-3', 'germany', 'carrier'), 1);
  assert.equal(unitCount(state, 'sz-3', 'germany', 'fighter'), 2);
  assert.equal(state.powers.germany.factoriesUsed['factory-3'], 3,
    'carrier and fighters consume exact factory slots as well as deck slots');
}

{
  const state = game();
  state.powers.germany.staging.carrier = 1;
  state.powers.germany.staging.fighter = 3;
  const before = snapshot(state);
  const result = act(state, {
    type: 'placeBatch', space: 'sz-5', factory: 'factory-5',
    units: [{ key: 'carrier', count: 1 }, { key: 'fighter', count: 3 }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /deck slots/);
  assert.equal(snapshot(state), before, 'deck overflow rejects before staging or factory capacity mutates');
}

{
  const state = game({ 'sz-5': [{ power: 'ussr', key: 'cruiser', count: 1 }] });
  state.powers.germany.staging.carrier = 1;
  state.powers.germany.staging.fighter = 2;
  const result = act(state, {
    type: 'placeBatch', space: 'sz-5', factory: 'factory-5',
    units: [{ key: 'carrier', count: 1 }, { key: 'fighter', count: 2 }],
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(unitCount(state, 'sz-5', 'ussr', 'cruiser'), 1, 'hostile placement starts no post-combat battle');
  assert.equal(unitCount(state, 'sz-5', 'germany', 'fighter'), 2);
}

{
  const state = game();
  state.contested.push('captured');
  state.powers.germany.staging.destroyer = 1;
  const before = snapshot(state);
  const result = act(state, {
    type: 'placeBatch', space: 'sz-4', factory: 'captured', units: [{ key: 'destroyer', count: 1 }],
  });
  assert.equal(result.ok, false, 'a factory captured this turn is ineligible for sea placement');
  assert.equal(snapshot(state), before);
}

{
  const state = game();
  state.powers.germany.techs.push('increasedFactory');
  state.powers.germany.staging.infantry = 3;
  const before = snapshot(state);
  assert.equal(act(state, {
    type: 'placeBatch', space: 'factory-2', units: [{ key: 'infantry', count: 3 }],
  }).ok, false, 'an IPC 2 factory receives no +2 production bonus');
  assert.equal(snapshot(state), before);
  assert.equal(act(state, {
    type: 'placeBatch', space: 'factory-2', units: [{ key: 'infantry', count: 2 }],
  }).ok, true);

  const high = game();
  high.powers.germany.techs.push('increasedFactory');
  high.powers.germany.staging.infantry = 5;
  assert.equal(act(high, {
    type: 'placeBatch', space: 'factory-3', units: [{ key: 'infantry', count: 5 }],
  }).ok, true, 'the +2 production bonus begins at IPC 3');
}

{
  const state = game({}, 'purchase');
  state.powers.germany.techs.push('increasedFactory');
  state.factoryDamage['factory-2'] = 2;
  const ipcs = state.powers.germany.ipcs;
  assert.equal(act(state, { type: 'repair', territory: 'factory-2', count: 2 }).ok, true);
  assert.equal(state.powers.germany.ipcs, ipcs - 1, 'half-price repair remains available at an IPC 2 factory');
  assert.equal(state.factoryDamage['factory-2'], 0);
}

console.log('axis mobilization actions: all assertions passed');

