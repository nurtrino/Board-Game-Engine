import { strict as assert } from 'node:assert';
import {
  axisFactoryProductionCapacity,
  axisIncreasedFactoryBonus,
  axisOwnCarrierPlacementStatus,
  canAxisPlaceFightersOnOwnCarriers,
  isAxisCarrierOwningPower,
} from './mobilizationRules.js';
import type { AxisMovementSnapshot } from './movementRules.js';

{
  assert.equal(axisIncreasedFactoryBonus(2, ['increasedFactory']), 0,
    'IPC 1-2 territories receive no Increased Factory bonus');
  assert.equal(axisFactoryProductionCapacity(2, ['increasedFactory']), 2);
  assert.equal(axisFactoryProductionCapacity(3, ['increasedFactory']), 5,
    'the corrected +2 begins at printed IPC 3');
  assert.equal(axisFactoryProductionCapacity(10, ['increasedFactory'], 3), 9);
  assert.equal(axisFactoryProductionCapacity(3, [], 1), 2);
  assert.equal(axisFactoryProductionCapacity(3, ['increasedFactory'], 99), 0,
    'damage cannot produce negative capacity');
}

{
  const game: AxisMovementSnapshot = {
    board: {
      'sz-1': [
        {
          power: 'germany', key: 'carrier', count: 1,
          cargo: [{ power: 'italy', key: 'fighter', count: 1 }],
        },
        { power: 'germany', key: 'fighter', count: 1 },
        {
          power: 'italy', key: 'carrier', count: 1,
          cargo: [{ power: 'italy', key: 'fighter', count: 1 }],
        },
        { power: 'italy', key: 'fighter', count: 1 },
      ],
    },
    control: {},
    contested: [],
  };
  const before = JSON.stringify(game);
  assert.deepEqual(axisOwnCarrierPlacementStatus(game, 'germany', 'sz-1'), {
    existingCarriers: 1,
    incomingCarriers: 0,
    capacity: 2,
    ownFighters: 1,
    alliedFighters: 1,
    guestFighters: 1,
    alliedCarrierOpen: 1,
    independentFightersUsingOwnCarriers: 1,
    occupied: 2,
    open: 0,
  }, 'allied guests and independent friendly fighter overflow consume physical own-carrier slots');
  assert.deepEqual(axisOwnCarrierPlacementStatus(game, 'germany', 'sz-1', 1), {
    existingCarriers: 1,
    incomingCarriers: 1,
    capacity: 4,
    ownFighters: 1,
    alliedFighters: 1,
    guestFighters: 1,
    alliedCarrierOpen: 1,
    independentFightersUsingOwnCarriers: 1,
    occupied: 2,
    open: 2,
  });
  assert.equal(canAxisPlaceFightersOnOwnCarriers(game, 'germany', 'sz-1', 2, 1), true);
  assert.equal(canAxisPlaceFightersOnOwnCarriers(game, 'germany', 'sz-1', 3, 1), false);
  assert.equal(JSON.stringify(game), before, 'readonly capacity helpers never mutate the snapshot');
}

{
  const alliedOnly: AxisMovementSnapshot = {
    board: { 'sz-2': [{ power: 'italy', key: 'carrier', count: 2 }] },
    control: {},
    contested: [],
  };
  assert.equal(axisOwnCarrierPlacementStatus(alliedOnly, 'germany', 'sz-2').capacity, 0,
    'allied carriers cannot receive Germany\'s newly mobilized fighters');
  assert.equal(canAxisPlaceFightersOnOwnCarriers(alliedOnly, 'germany', 'sz-2', 1), false);
  assert.equal(isAxisCarrierOwningPower('china'), false);
  assert.equal(isAxisCarrierOwningPower('usa'), true);
}

console.log('axis mobilization rules: all assertions passed');
