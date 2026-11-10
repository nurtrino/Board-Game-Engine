import assert from 'node:assert/strict';
import { indexMap, type AxisMap } from './map.js';
import {
  axisParatrooperTargetOptions,
  axisRocketDamage,
  axisRocketTargetOptions,
  axisTerritoryWasHostileAtTurnStart,
  validateAxisParatrooperRoute,
  validateAxisRocketStrike,
  type AxisSpecialTechnologySnapshot,
} from './specialTechnologyRules.js';

const territory = (
  id: string,
  adj: string[],
  coastTo: string[] = [],
  originalOwner: string | null = 'germany',
) => ({
  id,
  name: id,
  ipc: id.includes('factory') ? 3 : 1,
  originalOwner,
  center: [0, 0] as [number, number],
  adj,
  coastTo,
});

const map: AxisMap = {
  territories: [
    territory('home', ['friendly', 'hostile-a', 'neutral'], ['sz-1']),
    territory('friendly', ['home', 'enemy-factory']),
    territory('hostile-a', ['home', 'hostile-b'], [], 'ussr'),
    territory('hostile-b', ['hostile-a'], [], 'ussr'),
    territory('enemy-factory', ['friendly'], ['sz-2'], 'ussr'),
    territory('allied-factory', [], [], 'italy'),
    territory('neutral', ['home', 'neutral-locked-factory'], [], null),
    territory('neutral-locked-factory', ['neutral'], [], 'ussr'),
  ],
  seaZones: [
    { id: 'sz-1', n: 1, center: [0, 0], adj: ['sz-2'], coastTo: ['home'] },
    { id: 'sz-2', n: 2, center: [0, 0], adj: ['sz-1'], coastTo: ['enemy-factory'] },
  ],
  canals: [],
};
const idx = indexMap(map);

const snapshot = (overrides: Partial<AxisSpecialTechnologySnapshot> = {}): AxisSpecialTechnologySnapshot => ({
  board: {
    home: [{ power: 'germany', key: 'aaGun', count: 2 }],
    'enemy-factory': [{ power: 'ussr', key: 'factory', count: 1 }],
    'allied-factory': [{ power: 'italy', key: 'factory', count: 1 }],
    'neutral-locked-factory': [{ power: 'ussr', key: 'factory', count: 1 }],
  },
  control: {
    home: 'germany',
    friendly: 'germany',
    'hostile-a': 'ussr',
    'hostile-b': 'ussr',
    'enemy-factory': 'ussr',
    'allied-factory': 'italy',
    neutral: null,
    'neutral-locked-factory': 'ussr',
  },
  contested: [],
  ...overrides,
});

const rocket = validateAxisRocketStrike({
  snapshot: snapshot(), idx, power: 'germany', source: 'home', target: 'enemy-factory',
});
assert.equal(rocket.ok, true);
assert.equal(rocket.distance, 2, 'the shortest non-neutral land route wins over the sea route');
assert.deepEqual(rocket.path, ['home', 'friendly', 'enemy-factory']);

assert.equal(validateAxisRocketStrike({
  snapshot: snapshot(), idx, power: 'germany', source: 'home', target: 'allied-factory',
}).reason, 'target-has-no-enemy-factory', 'technology is never shared or fired at allies');

assert.equal(validateAxisRocketStrike({
  snapshot: snapshot(), idx, power: 'germany', source: 'home', target: 'neutral-locked-factory',
}).reason, 'target-out-of-range', 'a neutral territory cannot be used as a rocket fly-over shortcut');

assert.equal(validateAxisRocketStrike({
  snapshot: snapshot(), idx, power: 'germany', source: 'home', target: 'enemy-factory',
  ledger: { launchedFrom: ['home'], targetedFactories: [] },
}).reason, 'source-already-launched', 'two AA guns in one territory still supply only one launch');

assert.equal(validateAxisRocketStrike({
  snapshot: snapshot(), idx, power: 'germany', source: 'home', target: 'enemy-factory',
  ledger: { launchedFrom: [], targetedFactories: ['enemy-factory'] },
}).reason, 'target-already-struck', 'a factory can be selected by only one launcher per turn');

assert.equal(validateAxisRocketStrike({
  snapshot: snapshot({ board: { home: [{ power: 'italy', key: 'aaGun', count: 1 }] } }),
  idx, power: 'germany', source: 'home', target: 'enemy-factory',
}).reason, 'source-has-no-own-aa-gun', 'an allied AA gun cannot borrow German Rockets');

assert.deepEqual(axisRocketTargetOptions({
  snapshot: snapshot(), idx, power: 'germany', source: 'home',
}).map((option) => option.target), ['enemy-factory']);

assert.deepEqual(axisRocketDamage(6, 4, 3), {
  roll: 6, cap: 6, damageBefore: 4, appliedDamage: 2, damageAfter: 6,
}, 'rocket damage is capped at twice printed IPC value');

const directDrop = validateAxisParatrooperRoute({
  snapshot: snapshot(), idx, power: 'germany', route: ['home', 'hostile-a'], maxMovement: 6,
});
assert.equal(directDrop.ok, true);
assert.equal(directDrop.firstHostile, 'hostile-a');

assert.equal(validateAxisParatrooperRoute({
  snapshot: snapshot(), idx, power: 'germany', route: ['home', 'hostile-a', 'hostile-b'], maxMovement: 6,
}).reason, 'hostile-territory-entered-before-target', 'a bomber stops at the first hostile land territory');

assert.equal(validateAxisParatrooperRoute({
  snapshot: snapshot(), idx, power: 'germany', route: ['home', 'friendly'], maxMovement: 6,
}).reason, 'target-not-hostile-at-turn-start');

assert.equal(validateAxisParatrooperRoute({
  snapshot: snapshot(), idx, power: 'germany', route: ['home', 'sz-1', 'sz-2', 'enemy-factory'], maxMovement: 3,
}).ok, true, 'hostile sea zones do not stop a paratrooper bomber');

assert.equal(validateAxisParatrooperRoute({
  snapshot: snapshot(), idx, power: 'germany', route: ['home', 'sz-1', 'sz-2', 'enemy-factory'], maxMovement: 2,
}).reason, 'movement-exceeded');

const afterBlitz = snapshot({
  control: { ...snapshot().control, 'hostile-a': 'germany' },
  contested: ['hostile-a'],
});
assert.equal(axisTerritoryWasHostileAtTurnStart(afterBlitz, idx, 'germany', 'hostile-a'), true);
assert.equal(validateAxisParatrooperRoute({
  snapshot: afterBlitz, idx, power: 'germany', route: ['home', 'hostile-a', 'hostile-b'], maxMovement: 6,
}).reason, 'hostile-territory-entered-before-target', 'a same-turn blitz does not erase start-of-turn hostility');

const paraTargets = axisParatrooperTargetOptions({
  snapshot: snapshot(), idx, power: 'germany', origin: 'home', maxMovement: 6,
});
assert.equal(paraTargets.some((option) => option.target === 'hostile-a'), true);
assert.equal(paraTargets.some((option) => option.target === 'hostile-b'), false, 'search never expands through the first hostile territory');
assert.equal(paraTargets.some((option) => option.target === 'enemy-factory'), true);
assert.equal(paraTargets.some((option) => option.target === 'neutral-locked-factory'), false);

console.log('axis special technology rules: all checks passed');
