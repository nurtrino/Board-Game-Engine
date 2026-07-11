import { strict as assert } from 'node:assert';
import { indexMap, type AxisMap } from './map.js';
import {
  axisControlledSinceTurnStart,
  axisEnemyDestroyerAt,
  axisEnemySurfaceWarshipAt,
  canAxisSeaUnitTransit,
  canAxisTraverseSeaEdge,
  classifyAxisLandRoute,
  validateAxisLandForceRoute,
  type AxisMovementSnapshot,
} from './movementRules.js';

const map: AxisMap = {
  territories: [
    { id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', center: [0, 0], adj: ['friendly-mid', 'hostile-mid'] },
    { id: 'friendly-mid', name: 'Friendly Mid', ipc: 2, originalOwner: 'italy', center: [1, 0], adj: ['home', 'far'] },
    { id: 'hostile-mid', name: 'Hostile Mid', ipc: 2, originalOwner: 'ussr', center: [1, 1], adj: ['home', 'far'] },
    { id: 'far', name: 'Far', ipc: 3, originalOwner: 'ussr', center: [2, 0], adj: ['friendly-mid', 'hostile-mid'] },
    { id: 'panama', name: 'Panama', ipc: 2, originalOwner: 'usa', center: [0, 2], adj: [] },
    { id: 'egypt', name: 'Egypt', ipc: 2, originalOwner: 'uk', center: [1, 2], adj: [] },
  ],
  seaZones: [
    { id: 'sz-1', n: 1, center: [0, 3], adj: ['sz-2'] },
    { id: 'sz-2', n: 2, center: [1, 3], adj: ['sz-1', 'sz-3'] },
    { id: 'sz-3', n: 3, center: [2, 3], adj: ['sz-2'] },
  ],
  canals: [{ id: 'test-canal', connects: ['sz-1', 'sz-2'], controlledBy: ['panama', 'egypt'] }],
};
const idx = indexMap(map);

function snapshot(overrides: Partial<AxisMovementSnapshot> = {}): AxisMovementSnapshot {
  return {
    board: {},
    control: {
      home: 'germany',
      'friendly-mid': 'italy',
      'hostile-mid': 'ussr',
      far: 'ussr',
      panama: 'usa',
      egypt: 'uk',
    },
    contested: [],
    ...overrides,
  };
}

{
  const game = snapshot();
  const friendly = classifyAxisLandRoute({
    snapshot: game, idx, power: 'germany', from: 'home', via: 'friendly-mid', to: 'far', phase: 'combatMove',
  });
  assert.equal(friendly, 'friendly-two-space');
  assert.deepEqual(
    validateAxisLandForceRoute([{ key: 'tank', count: 1 }, { key: 'infantry', count: 1 }], friendly, ['mechanizedInfantry']),
    { ok: true, route: 'friendly-two-space', infantry: 1, tanks: 1, missingTanks: 0, ineligible: [] },
    'one selected tank carries one mechanized infantry along the same friendly two-space route',
  );

  const shortPair = validateAxisLandForceRoute(
    [{ key: 'tank', count: 1 }, { key: 'infantry', count: 2 }], friendly, ['mechanizedInfantry'],
  );
  assert.equal(shortPair.ok, false);
  assert.equal(shortPair.reason, 'mechanized-tank-required');
  assert.equal(shortPair.missingTanks, 1);
  assert.equal(
    validateAxisLandForceRoute([{ key: 'tank', count: 1 }, { key: 'infantry', count: 1 }], friendly).reason,
    'mechanized-infantry-required',
  );

  const blitz = classifyAxisLandRoute({
    snapshot: game, idx, power: 'germany', from: 'home', via: 'hostile-mid', to: 'far', phase: 'combatMove',
  });
  assert.equal(blitz, 'tank-blitz');
  assert.equal(validateAxisLandForceRoute([{ key: 'tank', count: 1 }], blitz, ['mechanizedInfantry']).ok, true);
  assert.equal(
    validateAxisLandForceRoute([{ key: 'tank', count: 1 }, { key: 'infantry', count: 1 }], blitz, ['mechanizedInfantry']).reason,
    'infantry-cannot-blitz',
    'mechanized infantry never inherits the tank-only blitz ability',
  );
  assert.equal(classifyAxisLandRoute({
    snapshot: game, idx, power: 'germany', from: 'home', via: 'hostile-mid', to: 'far', phase: 'noncombat',
  }), null, 'noncombat cannot route through empty hostile territory');
  assert.equal(classifyAxisLandRoute({
    snapshot: snapshot({
      control: { ...game.control, 'friendly-mid': 'germany' },
      contested: ['friendly-mid'],
    }),
    idx,
    power: 'germany',
    from: 'home',
    via: 'friendly-mid',
    to: 'far',
    phase: 'combatMove',
  }), null, 'an immediately resolved capture cannot become a route for a later combat order');
}

{
  const held = snapshot();
  assert.equal(axisControlledSinceTurnStart(held, 'panama', 'usa'), true);
  assert.equal(axisControlledSinceTurnStart(held, 'egypt', 'usa'), false, 'exact-power control does not use allied ownership');
  assert.equal(axisControlledSinceTurnStart(held, 'egypt', 'usa', 'side'), true, 'canals use side control');
  assert.equal(canAxisTraverseSeaEdge(held, map, 'sz-1', 'sz-2', 'usa'), true);
  assert.equal(canAxisTraverseSeaEdge(held, map, 'sz-2', 'sz-3', 'usa'), true, 'ordinary adjacency needs no canal control');
  assert.equal(canAxisTraverseSeaEdge(held, map, 'sz-1', 'sz-3', 'usa'), false,
    'the canal helper never turns a nonadjacent pair into an edge');

  const capturedThisTurn = snapshot({ contested: ['panama'] });
  assert.equal(canAxisTraverseSeaEdge(capturedThisTurn, map, 'sz-1', 'sz-2', 'usa'), false,
    'current control cannot open a canal captured this turn');
  const splitControl = snapshot({ control: { ...held.control, egypt: 'germany' } });
  assert.equal(canAxisTraverseSeaEdge(splitControl, map, 'sz-1', 'sz-2', 'usa'), false,
    'every canal territory must be controlled by the moving side');
}

{
  const cruiserZone = snapshot({
    board: { 'sz-2': [{ power: 'ussr', key: 'cruiser', count: 1 }] },
  });
  assert.equal(axisEnemySurfaceWarshipAt(cruiserZone, 'sz-2', 'germany'), true);
  assert.equal(axisEnemyDestroyerAt(cruiserZone, 'sz-2', 'germany'), false);
  assert.equal(canAxisSeaUnitTransit(cruiserZone, 'sz-2', 'germany', 'submarine'), true,
    'a submarine passes hostile surface ships when no enemy destroyer detects it');
  assert.equal(canAxisSeaUnitTransit(cruiserZone, 'sz-2', 'germany', 'carrier'), false,
    'ordinary sea units stop at enemy surface warships');

  const destroyerZone = snapshot({
    board: { 'sz-2': [{ power: 'ussr', key: 'destroyer', count: 1 }] },
  });
  assert.equal(axisEnemyDestroyerAt(destroyerZone, 'sz-2', 'germany'), true);
  assert.equal(canAxisSeaUnitTransit(destroyerZone, 'sz-2', 'germany', 'submarine'), false,
    'an enemy destroyer cancels submarine transit');

  const stealthOnly = snapshot({
    board: { 'sz-2': [
      { power: 'ussr', key: 'submarine', count: 1 },
      { power: 'ussr', key: 'transport', count: 1 },
      { power: 'italy', key: 'destroyer', count: 1 },
    ] },
  });
  assert.equal(axisEnemySurfaceWarshipAt(stealthOnly, 'sz-2', 'germany'), false,
    'enemy submarines/transports and allied destroyers do not make the zone hostile');
  assert.equal(canAxisSeaUnitTransit(stealthOnly, 'sz-2', 'germany', 'battleship'), true);
  assert.equal(canAxisSeaUnitTransit(stealthOnly, 'sz-2', 'germany', 'submarine'), true);
}

console.log('axis movement rules: all assertions passed');
