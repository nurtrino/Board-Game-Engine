import assert from 'node:assert/strict';
import type { SimUnit } from './battlescene.js';
import {
  beginsParatrooperDrop,
  isAboardParatrooper,
  isDeployedParatrooper,
  isLinkedAboardLoss,
} from './stylizedBattleAirborne.js';

const bomber: SimUnit = {
  id: 'bomber',
  type: 'bomber',
  side: 'attacker',
  paratrooper: { pairId: 'pair', role: 'bomber', counterpartId: 'infantry', aboard: false },
};
const aboard: SimUnit = {
  id: 'infantry',
  type: 'infantry',
  side: 'attacker',
  paratrooper: { pairId: 'pair', role: 'infantry', counterpartId: 'bomber', aboard: true },
};
const deployed: SimUnit = { ...aboard, paratrooper: { ...aboard.paratrooper!, aboard: false } };

assert.equal(isAboardParatrooper(aboard), true);
assert.equal(isDeployedParatrooper(aboard), false);
assert.equal(isDeployedParatrooper(deployed), true);
assert.equal(beginsParatrooperDrop(true, deployed), true);
assert.equal(beginsParatrooperDrop(false, deployed), false, 'ordinary deployed infantry does not replay a metadata transition');
assert.equal(isLinkedAboardLoss(aboard, [bomber, aboard], new Set(['bomber', 'infantry'])), true);
assert.equal(isLinkedAboardLoss(aboard, [bomber, aboard], new Set(['infantry'])), false,
  'an unrelated infantry casualty is never presented as a bomber-linked loss');

console.log('stylized battle airborne: all checks passed');
