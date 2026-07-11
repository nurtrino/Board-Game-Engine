import { strict as assert } from 'node:assert';
import { SETI_GOLD_TILES } from './data.js';
import {
  SETI_COMPUTER_TECH_TOP_SPACES,
  scoreSetiGoldClaim,
  setiComputerTechTopSpace,
  setiGoldPointsPerSet,
  setiNeutralMarkersPerThreshold,
  setiNextStartingSeat,
} from './coreRules.js';

assert.deepEqual(SETI_COMPUTER_TECH_TOP_SPACES, [0, 1, 3, 5]);
assert.equal(setiComputerTechTopSpace(2), 3);
assert.equal(setiNextStartingSeat(0, 4), 1);
assert.equal(setiNextStartingSeat(3, 4), 0);
assert.deepEqual([1, 2, 3, 4].map(setiNeutralMarkersPerThreshold), [2, 2, 1, 0]);

const techA = SETI_GOLD_TILES.find((tile) => tile.id === 'seti_gold_tech' && tile.side === 'A')!;
assert.equal(setiGoldPointsPerSet(techA, 0), 11);
assert.equal(setiGoldPointsPerSet(techA, 1), 8);
assert.equal(setiGoldPointsPerSet(techA, 2), 5);
assert.equal(setiGoldPointsPerSet(techA, 3), 5);
assert.equal(scoreSetiGoldClaim(3, 8), 24);
assert.equal(scoreSetiGoldClaim(0, 11), 0);

console.log('seti core rules: ok');
