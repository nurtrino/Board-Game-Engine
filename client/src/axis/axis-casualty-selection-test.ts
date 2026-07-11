import assert from 'node:assert/strict';
import type { AxisView } from '@bge/shared';
import { planCasualties, removeLastCasualtyPick } from './axisCasualtySelection.js';

type Battle = NonNullable<AxisView['combat']>['battle'];
type Decision = Extract<NonNullable<Battle['decision']>, { type: 'casualties' }>;
type Unit = Battle['attacker'][number];

const battleship = { uid: 10, key: 'battleship', side: 'defender', power: 'uk', hp: 2, maxHp: 2 } as Unit;
const infantry = { uid: 11, key: 'infantry', side: 'defender', power: 'uk', hp: 1, maxHp: 1 } as Unit;
const mixed: Decision = { type: 'casualties', side: 'defender', picks: 2, buckets: [{ source: 'other', hits: 2, eligible: [10, 11] }] };

const firstHit = planCasualties(mixed, [battleship, infantry], [10]);
assert.equal(firstHit.complete, false);
assert.deepEqual(firstHit.nextEligible, [10, 11], 'a damaged battleship remains eligible for the second hit');

const sunk = planCasualties(mixed, [battleship, infantry], [10, 10]);
assert.equal(sunk.complete, true);
assert.deepEqual(sunk.payload, [10, 10], 'one physical battleship can receive both damage and sinking hits');
assert.deepEqual(removeLastCasualtyPick([11, 10, 10], 10), [11, 10], 'tapping a highlighted unit removes one exact assigned hit');
assert.deepEqual(removeLastCasualtyPick([20, 21], 20), [], 'undoing an earlier bucket also clears choices that depended on it');

const fighter = { uid: 20, key: 'fighter', side: 'attacker', power: 'usa', hp: 1, maxHp: 1 } as Unit;
const tank = { uid: 21, key: 'tank', side: 'attacker', power: 'usa', hp: 1, maxHp: 1 } as Unit;
const bucketed: Decision = {
  type: 'casualties', side: 'attacker', picks: 3,
  buckets: [
    { source: 'aa', hits: 2, eligible: [20] },
    { source: 'other', hits: 1, eligible: [21] },
  ],
};
assert.deepEqual(
  planCasualties(bucketed, [fighter, tank], [20, 21]).payload,
  [20, 21],
  'an exhausted bucket does not shift the following bucket selection',
);

console.log('axis casualty selection: all checks passed');
