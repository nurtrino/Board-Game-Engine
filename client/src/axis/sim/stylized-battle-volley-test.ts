import assert from 'node:assert/strict';
import type { SimUnit } from './battlescene.js';
import { stylizedAuthoritativeVolleyLinks } from './stylizedBattleVolley.js';

const units: SimUnit[] = [
  { id: 'a-live', side: 'attacker', type: 'infantry' },
  { id: 'a-casualty', side: 'attacker', type: 'tank' },
  { id: 'd-live', side: 'defender', type: 'infantry' },
  { id: 'd-casualty', side: 'defender', type: 'artillery' },
  { id: 'd-submerged', side: 'defender', type: 'submarine' },
];

const simultaneous = stylizedAuthoritativeVolleyLinks({
  units,
  firingIds: ['a-casualty', 'd-casualty', 'd-submerged'],
  destroyedIds: ['a-casualty', 'd-casualty'],
  submergedIds: ['d-submerged'],
});
assert.deepEqual(simultaneous.map((link) => link.firingId), ['a-casualty', 'd-casualty'],
  'simultaneous casualties finish firing while submerged units stay out of the volley');
assert.ok(simultaneous.every((link) => !['a-casualty', 'd-casualty'].includes(link.targetId)),
  'already-selected casualties cannot become a fresh target');
assert.deepEqual(simultaneous.map((link) => link.delayMs), [0, 85],
  'only visible shots consume a cinematic stagger slot');

const preferred = stylizedAuthoritativeVolleyLinks({
  units,
  firingIds: ['a-live'],
  preferredTargetIds: ['d-live'],
});
assert.equal(preferred[0]?.targetId, 'd-live');

const exactDestroyedTargets = stylizedAuthoritativeVolleyLinks({
  units,
  firingIds: ['a-live'],
  destroyedIds: ['d-casualty'],
  shotLinks: [
    { firingId: 'a-live', targetId: 'd-casualty' },
    { firingId: 'a-live', targetId: 'd-live' },
  ],
});
assert.deepEqual(exactDestroyedTargets, [
  { firingId: 'a-live', targetId: 'd-casualty', delayMs: 0 },
  { firingId: 'a-live', targetId: 'd-live', delayMs: 85 },
], 'exact AA roll links override inferred targets and retain already-zero-HP aircraft');

const aboardInfantryNeverTargets = stylizedAuthoritativeVolleyLinks({
  units: [...units, {
    id: 'a-airborne',
    side: 'attacker',
    type: 'infantry',
    paratrooper: { pairId: 'pair', role: 'infantry', aboard: true },
  }],
  firingIds: ['d-live'],
  shotLinks: [{ firingId: 'd-live', targetId: 'a-airborne' }],
});
assert.deepEqual(aboardInfantryNeverTargets, [],
  'carried infantry remains off-field and an invalid exact link never falls back to an invented target');

console.log('stylized battle volley: all checks passed');
