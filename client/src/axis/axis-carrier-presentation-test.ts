import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { indexMap, type AxisMap, type AxisView } from '@bge/shared';
import {
  axisCarrierLandingPlans,
  axisCarrierObligationCards,
  axisCarrierRequiredPlacements,
  axisCarrierReservedFactoryCount,
} from './axisCarrierPresentation.js';

const map: AxisMap = {
  territories: [
    { id: 'origin-a', name: 'Origin A', ipc: 2, originalOwner: 'germany', center: [0, 0], adj: [], coastTo: ['sz-a'] },
    { id: 'origin-b', name: 'Origin B', ipc: 2, originalOwner: 'germany', center: [0, 1], adj: [], coastTo: ['sz-a'] },
    { id: 'dock', name: 'Dock', ipc: 2, originalOwner: 'germany', center: [2, 0], adj: [], coastTo: ['sz-a', 'sz-future'] },
    { id: 'dock-2', name: 'Dock 2', ipc: 1, originalOwner: 'germany', center: [2, 1], adj: [], coastTo: ['sz-a', 'sz-future'] },
  ],
  seaZones: [
    { id: 'sz-a', n: 1, center: [1, 0], adj: ['sz-future'], coastTo: ['origin-a', 'origin-b', 'dock', 'dock-2'] },
    { id: 'sz-future', n: 2, center: [2, 0], adj: ['sz-a'], coastTo: ['dock', 'dock-2'] },
  ],
  canals: [],
};
const idx = indexMap(map);

function view(): AxisView {
  const powers = Object.fromEntries(['germany', 'ussr', 'japan', 'uk', 'italy', 'usa'].map((power) => [power, {
    key: power,
    ipcs: 0,
    techs: [],
    researchTokens: 0,
    staging: power === 'germany' ? { carrier: 2 } : {},
    factoriesUsed: {},
    capitalHeldBy: null,
    lastIncome: 0,
    production: 0,
  }])) as unknown as AxisView['powers'];
  return {
    game: 'axis', battleVisualReady: false, controlledPowers: ['germany'],
    options: { scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard' },
    round: 1, phase: 'noncombat', awaitingChart: false, active: 'germany',
    capitalOccupied: false, turnStartedCapitalOccupied: false, operatingPower: 'germany',
    usaOperationFirst: null, usaOperationIndex: 0,
    turnOrder: ['germany', 'ussr', 'japan', 'uk', 'italy', 'usa'],
    powers,
    board: {
      'origin-a': [{ power: 'germany', key: 'fighter', count: 1 }],
      'origin-b': [{ power: 'germany', key: 'fighter', count: 1 }],
      dock: [{ power: 'germany', key: 'factory', count: 1 }],
      'dock-2': [{ power: 'germany', key: 'factory', count: 1 }],
      'sz-future': [{ power: 'ussr', key: 'cruiser', count: 1 }],
    },
    control: { 'origin-a': 'germany', 'origin-b': 'germany', dock: 'germany', 'dock-2': 'germany' },
    contested: [], factoryDamage: {}, combat: null, pendings: [], lastBattle: null,
    vc: { axis: 0, allies: 0, goal: 13 }, winner: null,
    chinaGrant: 0, chinaPlacementSpaces: [], log: [], researchCost: 5,
    newCarrierLandingObligations: [],
    defendingCarrierLanding: null,
    economicRaidLedger: { power: 'germany', targetedFactories: [] },
    rocketLedger: { power: 'germany', launchedFrom: [], targetedFactories: [] },
  };
}

{
  const state = view();
  const plans = axisCarrierLandingPlans({
    view: state,
    idx,
    power: 'germany',
    fighters: [
      { from: 'origin-a', ordinal: 0, movementSpent: 0 },
      { from: 'origin-b', ordinal: 0, movementSpent: 0 },
    ],
    mode: 'noncombat',
    target: 'sz-future',
  });
  assert.equal(plans.length, 2, 'each eligible factory is an explicit one-carrier choice');
  assert.ok(plans.every((plan) => plan.hostile && plan.newCarriers === 1));
  assert.deepEqual(plans[0]?.declaration.fighters, [
    { from: 'origin-a', ordinals: [0] },
    { from: 'origin-b', ordinals: [0] },
  ]);
  assert.equal(plans[0]?.moveDeclarations['origin-a']?.carrierFactories.length, 1,
    'the first exact origin reserves the shared carrier');
  assert.deepEqual(plans[0]?.moveDeclarations['origin-b']?.carrierFactories, [],
    'the second exact origin consumes its remaining deck slot without double-reserving');
}

{
  const state = view();
  state.newCarrierLandingObligations = [{
    power: 'germany', seaZone: 'sz-future', fighterRefs: ['stable-1'], carrierFactories: ['dock'],
  }];
  state.board['sz-future']!.push({
    power: 'germany', key: 'fighter', count: 1,
    carrierLanding: { ref: 'stable-1', seaZone: 'sz-future' },
  });
  const plans = axisCarrierLandingPlans({
    view: state,
    idx,
    power: 'germany',
    fighters: [{ from: 'origin-a', ordinal: 0, movementSpent: 0 }],
    mode: 'noncombat',
    target: 'sz-future',
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.newCarriers, 0);
  assert.deepEqual(plans[0]?.carrierFactories, [], 'same-zone second fighter shares the reserved hull');
  assert.equal(axisCarrierReservedFactoryCount(state, 'germany', 'dock'), 1);
  assert.deepEqual(axisCarrierObligationCards(state, 'germany'), [{
    power: 'germany', seaZone: 'sz-future', fighterCount: 1,
    carrierCount: 1, carrierFactories: ['dock'],
  }]);
  assert.deepEqual(axisCarrierRequiredPlacements(state, 'germany'), [{
    seaZone: 'sz-future', factory: 'dock', count: 1,
  }]);
}

{
  const state = view();
  state.powers.germany.staging.carrier = 0;
  assert.deepEqual(axisCarrierLandingPlans({
    view: state,
    idx,
    power: 'germany',
    fighters: [{ from: 'origin-a', ordinal: 0, movementSpent: 0 }],
    mode: 'noncombat',
    target: 'sz-future',
  }), [], 'no staged carrier means no amber promise target');
  state.powers.germany.staging.carrier = 1;
  state.contested = ['dock', 'dock-2'];
  assert.deepEqual(axisCarrierLandingPlans({
    view: state,
    idx,
    power: 'germany',
    fighters: [{ from: 'origin-a', ordinal: 0, movementSpent: 0 }],
    mode: 'noncombat',
    target: 'sz-future',
  }), [], 'captured-this-turn factories never appear as reservation choices');
}

{
  const state = view();
  state.board['sz-a'] = [
    { power: 'germany', key: 'fighter', count: 1, carrierLanding: { ref: 'old-a', seaZone: 'sz-a' } },
    { power: 'germany', key: 'fighter', count: 1, carrierLanding: { ref: 'old-b', seaZone: 'sz-a' } },
    { power: 'germany', key: 'fighter', count: 1, carrierLanding: { ref: 'moving', seaZone: 'sz-a' } },
  ];
  state.newCarrierLandingObligations = [{
    power: 'germany',
    seaZone: 'sz-a',
    fighterRefs: ['old-a', 'old-b', 'moving'],
    carrierFactories: ['dock', 'dock-2'],
  }];
  const plans = axisCarrierLandingPlans({
    view: state,
    idx,
    power: 'germany',
    fighters: [{
      from: 'sz-a',
      ordinal: 2,
      movementSpent: 0,
      carrierLanding: { ref: 'moving', seaZone: 'sz-a' },
    }],
    mode: 'noncombat',
    target: 'sz-future',
  });
  assert.ok(plans.some((plan) => plan.carrierFactories[0] === 'dock-2'),
    'moving one of three tagged fighters frees the second old carrier/factory reservation for its new zone');
  assert.ok(plans.every((plan) => plan.newCarriers === 1),
    'the re-promise reserves exactly one carrier after the old row trims from two carriers to one');
}

{
  const state = view();
  state.powers.germany.staging.carrier = 1;
  state.board['sz-a'] = [
    { power: 'germany', key: 'carrier', count: 1 },
    { power: 'germany', key: 'fighter', count: 1, carrierLanding: { ref: 'staying', seaZone: 'sz-a' } },
    { power: 'germany', key: 'fighter', count: 1, carrierLanding: { ref: 'moving-hostile', seaZone: 'sz-a' } },
    { power: 'ussr', key: 'destroyer', count: 1 },
  ];
  state.newCarrierLandingObligations = [{
    power: 'germany',
    seaZone: 'sz-a',
    fighterRefs: ['staying', 'moving-hostile'],
    carrierFactories: ['dock'],
  }];
  assert.deepEqual(axisCarrierLandingPlans({
    view: state,
    idx,
    power: 'germany',
    fighters: [{
      from: 'sz-a',
      ordinal: 1,
      movementSpent: 0,
      carrierLanding: { ref: 'moving-hostile', seaZone: 'sz-a' },
    }],
    mode: 'noncombat',
    target: 'sz-future',
  }), [], 'a hostile old zone cannot free its reservation by counting physical carrier slots the reducer ignores');
}

const playSource = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
assert.match(
  playSource,
  /const airOrigins = carrierPlan \? \[\.\.\.pickedSpaces\]\.sort\(\(a, b\) => a\.localeCompare\(b\)\) : pickedSpaces/,
  'carrier-backed multi-origin moves dispatch in the same deterministic origin order used to allocate factory deltas',
);

console.log('axis carrier presentation: all checks passed');
