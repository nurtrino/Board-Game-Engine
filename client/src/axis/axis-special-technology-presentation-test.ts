import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  indexMap,
  type AxisMap,
  type AxisView,
} from '@bge/shared';
import {
  axisRocketLauncherCards,
  axisStrategicRaidTargetAvailable,
  buildAxisRocketStrikeAction,
} from './axisSpecialTechnologyPresentation.js';

const map: AxisMap = {
  territories: [
    { id: 'source', name: 'Launch Site', ipc: 3, originalOwner: 'germany', center: [0, 0], adj: ['middle'] },
    { id: 'middle', name: 'Middle', ipc: 1, originalOwner: 'germany', center: [1, 0], adj: ['source', 'target'] },
    { id: 'target', name: 'Target', ipc: 4, originalOwner: 'ussr', center: [2, 0], adj: ['middle'] },
  ],
  seaZones: [], canals: [],
};
const idx = indexMap(map);

const view = {
  powers: {
    germany: { techs: ['rockets'] },
  },
  board: {
    source: [{ power: 'germany', key: 'aaGun', count: 2 }],
    target: [{ power: 'ussr', key: 'factory', count: 1 }],
  },
  control: { source: 'germany', middle: 'germany', target: 'ussr' },
  contested: [],
  rocketLedger: { power: 'germany', launchedFrom: [], targetedFactories: [] },
  economicRaidLedger: { power: 'germany', targetedFactories: [] },
} as unknown as AxisView;

const launchers = axisRocketLauncherCards({ view, idx, power: 'germany' });
assert.equal(launchers.length, 2, 'identical AA guns remain separate physical launcher choices');
assert.deepEqual(launchers.map((launcher) => launcher.ordinal), [0, 1]);
assert.deepEqual(launchers[0]?.targets, [{ target: 'target', distance: 2, path: ['source', 'middle', 'target'] }]);
assert.deepEqual(
  buildAxisRocketStrikeAction(launchers[1]!, 'target'),
  {
    type: 'rocketStrike', source: 'source', target: 'target',
    launcher: { ordinal: 1, selectionSig: launchers[1]!.selectionSig },
  },
  'the action preserves the exact launcher ordinal and freshness signature',
);

assert.equal(axisStrategicRaidTargetAvailable(view, 'germany', 'target'), true);
assert.equal(axisStrategicRaidTargetAvailable({
  economicRaidLedger: { power: 'germany', targetedFactories: ['target'] },
}, 'germany', 'target'), false, 'a second SBR wave at the same factory is hidden');
assert.equal(axisStrategicRaidTargetAvailable({
  economicRaidLedger: { power: 'germany', targetedFactories: ['target'] },
}, 'germany', 'another-factory'), true, 'another factory remains eligible for an SBR');

const spentSource = axisRocketLauncherCards({
  view: {
    ...view,
    rocketLedger: { power: 'germany', launchedFrom: ['source'], targetedFactories: [] },
  },
  idx,
  power: 'germany',
});
assert.equal(spentSource.length, 0, 'one launch consumes the source territory, not merely one gun');

const playSource = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
assert.match(playSource, /buildAxisRocketStrikeAction\(selectedRocketLauncher, selectedRocketTarget\.target\)/,
  'the exact launcher confirmation enters the shared battle action');
assert.match(playSource, /axisStrategicRaidTargetAvailable/,
  'repeat SBR targets are explained and suppressed before submission');
assert.match(playSource, /SBR already used/,
  'bombers see why only ordinary combat remains at a previously raided factory');
assert.match(playSource, /Identical AA guns remain separate choices/,
  'the Rockets panel never pools identical launcher sculpts');

console.log('axis special technology presentation: all checks passed');
