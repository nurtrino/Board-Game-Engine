import { strict as assert } from 'node:assert';
import { SETI_GOLD_TILES, SETI_TECH_BY_ID } from './data.js';
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

// The technology the reducer grants must be the physical stack the player
// touched. Orange table stacks 05-08 are probes; magenta 09-12 are telescopes.
assert.equal(SETI_TECH_BY_ID.seti_tech_stack_probe_4.sourceGuid, '82eb24');
assert.equal(SETI_TECH_BY_ID.seti_tech_stack_probe_4.tiles[0].sourceCardId, 5200);
assert.equal(SETI_TECH_BY_ID.seti_tech_stack_probe_1.sourceGuid, '9b40d4');
assert.equal(SETI_TECH_BY_ID.seti_tech_stack_telescope_4.sourceGuid, '5065ac');
assert.equal(SETI_TECH_BY_ID.seti_tech_stack_telescope_3.tiles[0].sourceCardId, 6000);
assert.equal(SETI_TECH_BY_ID.seti_tech_stack_telescope_1.tiles[0].sourceCardId, 202800);

console.log('seti core rules: ok');
