import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexMap, type AxisMap, type AxisMovementSnapshot } from '@bge/shared';
import {
  axisLandTwoStepTargets,
  axisLegalSeaNeighbors,
  axisSeaRouteTargets,
  axisUniqueTargetForMapPick,
} from './axisMovementTargets.js';

const map: AxisMap = {
  territories: [
    { id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', center: [0, 0], adj: ['friendly-a', 'friendly-b', 'hostile-mid'] },
    { id: 'friendly-a', name: 'Friendly A', ipc: 2, originalOwner: 'germany', center: [1, 0], adj: ['home', 'far'] },
    { id: 'friendly-b', name: 'Friendly B', ipc: 2, originalOwner: 'italy', center: [1, 1], adj: ['home', 'far'] },
    { id: 'hostile-mid', name: 'Hostile Mid', ipc: 1, originalOwner: 'ussr', center: [1, 2], adj: ['home', 'far'] },
    { id: 'far', name: 'Far', ipc: 3, originalOwner: 'ussr', center: [2, 0], adj: ['friendly-a', 'friendly-b', 'hostile-mid'] },
    { id: 'panama', name: 'Panama', ipc: 2, originalOwner: 'usa', center: [0, 3], adj: [] },
  ],
  seaZones: [
    { id: 'sz-0', n: 0, center: [0, 4], adj: ['sz-a', 'sz-b', 'sz-target'] },
    { id: 'sz-a', n: 1, center: [1, 4], adj: ['sz-0', 'sz-target'] },
    { id: 'sz-b', n: 2, center: [1, 5], adj: ['sz-0', 'sz-target'] },
    { id: 'sz-target', n: 3, center: [2, 4], adj: ['sz-0', 'sz-a', 'sz-b'] },
    { id: 'sz-canal-a', n: 4, center: [0, 6], adj: ['sz-canal-b'] },
    { id: 'sz-canal-b', n: 5, center: [1, 6], adj: ['sz-canal-a'] },
  ],
  canals: [{ id: 'panama-canal', connects: ['sz-canal-a', 'sz-canal-b'], controlledBy: ['panama'] }],
};
const idx = indexMap(map);

function snapshot(overrides: Partial<AxisMovementSnapshot> = {}): AxisMovementSnapshot {
  return {
    board: {},
    control: {
      home: 'germany',
      'friendly-a': 'germany',
      'friendly-b': 'italy',
      'hostile-mid': 'ussr',
      far: 'ussr',
      panama: 'usa',
    },
    contested: [],
    ...overrides,
  };
}

{
  const game = snapshot();
  const pair = axisLandTwoStepTargets({
    snapshot: game,
    idx,
    power: 'germany',
    from: 'home',
    units: [{ key: 'tank', count: 1 }, { key: 'infantry', count: 1 }],
    techs: ['mechanizedInfantry'],
    phase: 'combatMove',
  });
  assert.deepEqual(
    pair.filter((route) => route.id === 'far').map((route) => route.via).sort(),
    ['friendly-a', 'friendly-b'],
    'every legal ingress to the same destination remains an explicit route choice',
  );
  assert.equal(axisLandTwoStepTargets({
    snapshot: game,
    idx,
    power: 'germany',
    from: 'home',
    units: [{ key: 'tank', count: 1 }, { key: 'infantry', count: 2 }],
    techs: ['mechanizedInfantry'],
    phase: 'combatMove',
  }).some((route) => route.via?.startsWith('friendly-')), false, 'a short tank/infantry pairing exposes no two-space highlight');
  assert.equal(axisLandTwoStepTargets({
    snapshot: game,
    idx,
    power: 'germany',
    from: 'home',
    units: [{ key: 'infantry', count: 1 }],
    techs: ['mechanizedInfantry'],
    phase: 'combatMove',
  }).length, 0, 'infantry never inherits tank blitz movement');
  assert.deepEqual(axisLandTwoStepTargets({
    snapshot: game,
    idx,
    power: 'germany',
    from: 'home',
    units: [{ key: 'tank', count: 1 }],
    phase: 'combatMove',
  }).find((route) => route.via === 'hostile-mid'), { id: 'far', via: 'hostile-mid' }, 'a tank retains its legal empty-hostile blitz route');
}

{
  assert.deepEqual(axisLegalSeaNeighbors(snapshot(), idx, 'usa', 'sz-canal-a'), ['sz-canal-b']);
  assert.deepEqual(axisLegalSeaNeighbors(snapshot({ contested: ['panama'] }), idx, 'usa', 'sz-canal-a'), [],
    'a canal captured this turn is never highlighted as traversable');

  const variants = axisSeaRouteTargets({
    snapshot: snapshot(), idx, power: 'germany', from: 'sz-0', units: ['battleship'], phase: 'combatMove',
  }).filter((route) => route.id === 'sz-target');
  assert.deepEqual(variants.map((route) => route.via ?? 'direct').sort(), ['direct', 'sz-a', 'sz-b'],
    'direct and alternate two-zone naval ingresses stay separately selectable');
  assert.equal(axisUniqueTargetForMapPick(variants, 'sz-target'), undefined,
    'an ambiguous map destination waits for an explicit route chip instead of choosing the first ingress');
  assert.deepEqual(axisUniqueTargetForMapPick([{ id: 'sz-a' }], 'sz-a'), { id: 'sz-a' },
    'an unambiguous map destination may still advance directly to confirmation');

  const cruiser = snapshot({ board: { 'sz-a': [{ power: 'ussr', key: 'cruiser', count: 1 }] } });
  const subRoutes = axisSeaRouteTargets({
    snapshot: cruiser, idx, power: 'germany', from: 'sz-0', units: ['submarine'], phase: 'noncombat',
  });
  assert.ok(subRoutes.some((route) => route.id === 'sz-target' && route.via === 'sz-a'),
    'a submarine may pass a hostile surface fleet without a destroyer');
  assert.ok(!axisSeaRouteTargets({
    snapshot: cruiser, idx, power: 'germany', from: 'sz-0', units: ['submarine', 'battleship'], phase: 'noncombat',
  }).some((route) => route.via === 'sz-a'), 'a mixed fleet obeys its most restrictive selected hull');

  const destroyer = snapshot({ board: { 'sz-a': [{ power: 'ussr', key: 'destroyer', count: 1 }] } });
  assert.ok(!axisSeaRouteTargets({
    snapshot: destroyer, idx, power: 'germany', from: 'sz-0', units: ['submarine'], phase: 'noncombat',
  }).some((route) => route.via === 'sz-a'), 'an enemy destroyer blocks submarine transit');

  const stealth = snapshot({ board: { 'sz-a': [
    { power: 'ussr', key: 'submarine', count: 1 },
    { power: 'ussr', key: 'transport', count: 1 },
  ] } });
  assert.ok(axisSeaRouteTargets({
    snapshot: stealth, idx, power: 'germany', from: 'sz-0', units: ['battleship'], phase: 'noncombat',
  }).some((route) => route.via === 'sz-a'), 'ordinary ships ignore lone hostile submarines and transports');

  const hostileEndpoint = snapshot({ board: { 'sz-target': [{ power: 'ussr', key: 'cruiser', count: 1 }] } });
  assert.ok(axisSeaRouteTargets({
    snapshot: hostileEndpoint, idx, power: 'germany', from: 'sz-0', units: ['submarine'], phase: 'noncombat',
  }).some((route) => route.id === 'sz-target'), 'a submarine may end noncombat movement with an undetected hostile surface fleet');
  assert.ok(!axisSeaRouteTargets({
    snapshot: hostileEndpoint, idx, power: 'germany', from: 'sz-0', units: ['battleship'], phase: 'noncombat',
  }).some((route) => route.id === 'sz-target'), 'ordinary ships cannot end noncombat movement with hostile surface warships');
}

const playSource = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
assert.match(playSource, /axisLandTwoStepTargets/, 'movement UI is wired to exact-force land routing');
assert.match(playSource, /axisSeaRouteTargets/, 'movement UI is wired to canal and submarine-aware naval routing');
assert.match(playSource, /routeByOrigin/, 'the selected ingress is retained independently for every origin');
assert.match(playSource, /const bombardmentGroup = seaUnits\.length > 0[\s\S]*AIR_KEYS\.includes\(key\)/,
  'battleship/cruiser bombardment targets remain available when aircraft join the selected group');

console.log('axis movement targets: all checks passed');
