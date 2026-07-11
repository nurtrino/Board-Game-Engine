import assert from 'node:assert/strict';
import { stylizedCameraPlan, stylizedFormation, stylizedRole, stylizedVolleyLinks } from './stylizedBattleLayout.js';
import type { SimUnit } from './battlescene.js';

const units: SimUnit[] = [
  { id: 'a-inf', type: 'infantry', side: 'attacker' },
  { id: 'a-tank', type: 'tank', side: 'attacker' },
  { id: 'a-fighter', type: 'fighter', side: 'attacker' },
  { id: 'd-inf', type: 'infantry', side: 'defender' },
  { id: 'd-factory', type: 'factory', side: 'defender' },
];

assert.equal(stylizedRole('fighter'), 'air');
assert.equal(stylizedRole('carrier'), 'naval');
assert.equal(stylizedRole('aaGun'), 'support');

const attackers = stylizedFormation(units.filter((unit) => unit.side === 'attacker'), 'attacker', 'land');
assert.deepEqual(attackers.map((placement) => placement.unit.id), ['a-inf', 'a-tank', 'a-fighter'],
  'frontline, armor, and aircraft read in stable command rows');
assert.ok(attackers.every((placement) => placement.z < 0 && placement.rotationY === 0));
assert.equal(new Set(attackers.map((placement) => `${placement.x}:${placement.z}`)).size, attackers.length,
  'every exact sculpt receives a separate non-overlapping placement');

const defenders = stylizedFormation(units.filter((unit) => unit.side === 'defender'), 'defender', 'land');
assert.ok(defenders.every((placement) => placement.z > 0 && placement.rotationY === Math.PI));

const sparseLand = stylizedCameraPlan(3, 'land');
const standardLand = stylizedCameraPlan(8, 'land');
const denseLand = stylizedCameraPlan(36, 'land');
assert.equal(sparseLand.unitScale, 1.5, 'sparse land battles read as close tabletop vignettes');
assert.ok(sparseLand.end[2] < standardLand.end[2] && standardLand.end[2] < denseLand.end[2]);
assert.equal(denseLand.unitScale, 1, 'dense land battles preserve the safe overview scale');
assert.deepEqual(denseLand.end, [24, 25, 35]);

const sparseSea = stylizedCameraPlan(4, 'sea');
const denseSea = stylizedCameraPlan(20, 'sea');
assert.equal(sparseSea.unitScale, 1.25, 'sparse ships gain a restrained naval scale boost');
assert.deepEqual(denseSea.end, [28, 32, 42]);
assert.ok(sparseSea.fov < denseSea.fov);

assert.deepEqual(stylizedVolleyLinks({
  units,
  firingIds: ['a-inf', 'a-tank'],
  preferredTargetIds: ['d-factory'],
}), [
  { firingId: 'a-inf', targetId: 'd-factory', delayMs: 0 },
  { firingId: 'a-tank', targetId: 'd-factory', delayMs: 85 },
], 'economic strikes and AA volleys can pin every tracer to the authoritative preferred target');

const fallback = stylizedVolleyLinks({
  units,
  firingIds: ['a-inf'],
  preferredTargetIds: ['missing'],
  destroyedIds: ['d-factory'],
});
assert.equal(fallback[0]?.targetId, 'd-inf', 'destroyed or missing preferred targets never receive new fire');

console.log('stylized battle layout: all checks passed');
