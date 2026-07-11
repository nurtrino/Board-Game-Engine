import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExactUnitPick, resizeOrdinalSelection, toggleOrdinalSelection } from './axisSelection.js';

let selected = toggleOrdinalSelection(undefined, 0, 3);
selected = toggleOrdinalSelection(selected, 1, 3);
assert.deepEqual([...selected], [0, 1], 'identical pieces select one at a time');

selected = toggleOrdinalSelection(selected, 0, 3);
assert.deepEqual([...selected], [1], 'tapping the exact highlighted piece deselects that piece only');

selected = resizeOrdinalSelection(new Set([2]), 2, 4);
assert.deepEqual([...selected], [2, 0], 'stepper growth preserves explicitly tapped pieces');
selected = resizeOrdinalSelection(selected, 1, 4);
assert.deepEqual([...selected], [2], 'stepper reduction removes the most recently filled piece');

assert.deepEqual(
  [...toggleOrdinalSelection(new Set([0, 7]), 7, 2)],
  [0],
  'stale and out-of-range ordinals are discarded',
);

assert.deepEqual(
  buildExactUnitPick('carrier', new Set([2, 0]), 'durable-signature'),
  { key: 'carrier', count: 2, ordinals: [0, 2], selectionSig: 'durable-signature' },
  'action payload preserves and canonically orders the exact tapped sculpts',
);

const sceneSource = readFileSync(new URL('./AxisScene.tsx', import.meta.url), 'utf8');
assert.match(sceneSource, /enumerateAxisPhysicalPieces\(stacks\)/, 'board sculpts use the shared canonical physical ordering');
assert.match(sceneSource, /damaged=\{piece\?\.damaged/, 'the exact damaged battleship sculpt receives a visible state');
assert.match(sceneSource, /cargoCount > 0/, 'loaded carrier and transport sculpts receive a cargo marker');
assert.match(sceneSource, /power === 'china' && unit === 'fighter' \? 'usa' : power/, 'Flying Tigers use the USA fighter sculpt with China tint');

console.log('axis piece selection: all checks passed');
