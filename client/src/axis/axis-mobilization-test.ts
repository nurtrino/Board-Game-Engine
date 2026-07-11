import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexMap, type AxisMap } from '@bge/shared';
import {
  axisFirstLegalStagedPlacement,
  axisMobilizationDestinationPlans,
  buildPlaceBatchAction,
  remainingFactoryCapacity,
  type AxisMobilizationPlanningState,
} from './axisMobilization';

assert.deepEqual(
  buildPlaceBatchAction('yunnan', { infantry: 2, tank: 1, china: 2, fighter: 0 }, 'yunnan'),
  {
    type: 'placeBatch',
    space: 'yunnan',
    units: [{ key: 'infantry', count: 2 }, { key: 'tank', count: 1 }],
    china: 2,
    factory: 'yunnan',
  },
  'regular and Chinese selections become one server-atomic command',
);

const reconnectedUsage = JSON.parse(JSON.stringify({ germany: 7 })) as Record<string, number>;
assert.equal(remainingFactoryCapacity(10, reconnectedUsage, 'germany'), 3, 'reconnected authoritative usage determines remaining slots');
assert.equal(remainingFactoryCapacity(2, { yunnan: 4 }, 'yunnan'), 0, 'remaining capacity never becomes negative');

const map: AxisMap = {
  territories: [
    { id: 'factory-low', name: 'Low Factory', ipc: 2, originalOwner: 'germany', center: [0, 0], adj: [], coastTo: ['sz-existing', 'sz-allied', 'sz-batch'] },
    { id: 'factory-high', name: 'High Factory', ipc: 3, originalOwner: 'germany', center: [1, 0], adj: [], coastTo: ['sz-batch'] },
    { id: 'captured-factory', name: 'Captured Factory', ipc: 4, originalOwner: 'ussr', center: [2, 0], adj: [], coastTo: ['sz-captured'] },
    { id: 'new-factory', name: 'New Factory', ipc: 1, originalOwner: 'germany', center: [3, 0], adj: [] },
    { id: 'china-space', name: 'China Space', ipc: 1, originalOwner: 'china', center: [4, 0], adj: [] },
  ],
  seaZones: [
    { id: 'sz-existing', n: 1, center: [0, 1], adj: [], coastTo: ['factory-low'] },
    { id: 'sz-allied', n: 2, center: [1, 1], adj: [], coastTo: ['factory-low'] },
    { id: 'sz-batch', n: 3, center: [2, 1], adj: [], coastTo: ['factory-low', 'factory-high'] },
    { id: 'sz-captured', n: 4, center: [3, 1], adj: [], coastTo: ['captured-factory'] },
  ],
  canals: [],
};
const idx = indexMap(map);

function planningState(overrides: Partial<AxisMobilizationPlanningState> = {}): AxisMobilizationPlanningState {
  return {
    board: {
      'factory-low': [{ power: 'germany', key: 'factory', count: 1 }],
      'factory-high': [{ power: 'germany', key: 'factory', count: 1 }],
      'captured-factory': [{ power: 'germany', key: 'factory', count: 1 }],
      'sz-existing': [
        { power: 'germany', key: 'carrier', count: 1 },
        { power: 'ussr', key: 'cruiser', count: 1 },
      ],
      'sz-allied': [{ power: 'italy', key: 'carrier', count: 1 }],
      'sz-batch': [{ power: 'ussr', key: 'destroyer', count: 1 }],
    },
    control: {
      'factory-low': 'germany',
      'factory-high': 'germany',
      'captured-factory': 'germany',
      'new-factory': 'germany',
      'china-space': 'china',
    },
    contested: ['captured-factory'],
    factoryDamage: {},
    factoriesUsed: {},
    techs: ['increasedFactory'],
    chinaPlacementSpaces: ['china-space'],
    ...overrides,
  };
}

{
  const witness = axisFirstLegalStagedPlacement({
    state: planningState(), idx, power: 'germany', staging: { infantry: 2 },
  });
  assert.equal(witness?.key, 'infantry');
  assert.equal(witness?.plan.space, 'factory-low',
    'the UI focuses an exact legal singleton before offering carryover');

  const blocked = axisFirstLegalStagedPlacement({
    state: planningState({
      factoriesUsed: { 'factory-low': 2, 'factory-high': 5 },
    }),
    idx,
    power: 'germany',
    staging: { infantry: 2 },
  });
  assert.equal(blocked, null,
    'carryover is exposed only after every authoritative singleton destination is exhausted');
}

{
  const plans = axisMobilizationDestinationPlans({
    state: planningState(), idx, power: 'germany', selection: { infantry: 3 },
  });
  assert.ok(!plans.some((plan) => plan.space === 'factory-low'),
    'Increased Factory gives no bonus in a printed two-IPC territory');
  assert.deepEqual(
    plans.find((plan) => plan.space === 'factory-high'),
    {
      space: 'factory-high',
      factory: 'factory-high',
      productionCount: 3,
      factoryMaximum: 5,
      factoryRemaining: 5,
      fighterCount: 0,
    },
    'destination metadata exposes the exact shared factory capacity used by its label',
  );
  assert.ok(!plans.some((plan) => plan.space === 'captured-factory'),
    'a factory captured this turn is not highlighted for production');
}

{
  const fighterPlans = axisMobilizationDestinationPlans({
    state: planningState(), idx, power: 'germany', selection: { fighter: 1 },
  });
  const existingDeck = fighterPlans.find((plan) => plan.space === 'sz-existing');
  assert.equal(existingDeck?.factory, 'factory-low');
  assert.equal(existingDeck?.factoryRemaining, 2);
  assert.equal(existingDeck?.deck?.open, 2, 'own existing carrier deck space is shown before placement');
  assert.ok(!fighterPlans.some((plan) => plan.space === 'sz-allied'),
    'an allied-only carrier zone is never offered for newly mobilized fighters');
  assert.ok(fighterPlans.some((plan) => plan.space === 'sz-existing'),
    'hostile units in an adjacent sea zone do not hide an otherwise legal mobilization destination');
}

{
  const carrierBatch = axisMobilizationDestinationPlans({
    state: planningState(), idx, power: 'germany', selection: { carrier: 1, fighter: 2 },
  }).find((plan) => plan.space === 'sz-batch');
  assert.equal(carrierBatch?.deck?.incomingCarriers, 1);
  assert.equal(carrierBatch?.deck?.open, 2);
  assert.equal(carrierBatch?.fighterCount, 2, 'carrier-plus-fighter batches expose their exact deck demand');

  assert.ok(!axisMobilizationDestinationPlans({
    state: planningState(), idx, power: 'germany', selection: { carrier: 1, fighter: 3 },
  }).some((plan) => plan.space === 'sz-batch'), 'carrier deck overflow is rejected before the player submits');
}

{
  const factoryPlans = axisMobilizationDestinationPlans({
    state: planningState(), idx, power: 'germany', selection: { factory: 1 },
  });
  assert.ok(factoryPlans.some((plan) => plan.space === 'new-factory'));
  assert.ok(!axisMobilizationDestinationPlans({
    state: planningState(), idx, power: 'germany', selection: { factory: 1, infantry: 1 },
  }).length, 'a new industrial complex remains a standalone placement order');
}

{
  const seaPlans = axisMobilizationDestinationPlans({
    state: planningState(), idx, power: 'germany', selection: { destroyer: 1 },
  }).filter((plan) => plan.space === 'sz-batch');
  assert.deepEqual(
    seaPlans.map((plan) => plan.factory),
    ['factory-low', 'factory-high'],
    'each adjacent producing factory remains an explicit sea-placement choice',
  );
}

{
  const promisedState = planningState({
    factoriesUsed: { 'factory-high': 4 },
    stagedCarriers: 1,
    newCarrierLandingObligations: [{
      power: 'germany',
      seaZone: 'sz-batch',
      fighterRefs: ['promised-fighter'],
      carrierFactories: ['factory-high'],
    }],
  });
  assert.ok(!axisMobilizationDestinationPlans({
    state: promisedState, idx, power: 'germany', selection: { infantry: 1 },
  }).some((plan) => plan.space === 'factory-high'),
  'an unrelated placement cannot consume the final factory slot reserved for a promised carrier');

  const promisedCarrier = axisMobilizationDestinationPlans({
    state: promisedState, idx, power: 'germany', selection: { carrier: 1 },
  });
  assert.deepEqual(
    promisedCarrier.map((plan) => [plan.space, plan.factory]),
    [['sz-batch', 'factory-high']],
    'the reserved staged carrier cannot be diverted to another zone or factory',
  );
  assert.equal(promisedCarrier[0]?.matchingReservedCarriers, 1);
  assert.equal(promisedCarrier[0]?.unreservedStagedCarriers, 0);
  assert.deepEqual(
    buildPlaceBatchAction(promisedCarrier[0]!.space, { carrier: 1 }, promisedCarrier[0]!.factory),
    { type: 'placeBatch', space: 'sz-batch', units: [{ key: 'carrier', count: 1 }], factory: 'factory-high' },
    'the required CTA serializes the exact promised sea zone and factory',
  );
}

const playSource = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
assert.match(playSource, /axisMobilizationDestinationPlans/, 'MobilizeSheet uses the pure authoritative placement planner');
assert.match(playSource, /deck.*slots/i, 'placement chips identify carrier deck demand separately from factory demand');
assert.match(playSource, /PLACE REQUIRED/, 'MobilizeSheet pins a direct required-carrier placement action');
assert.match(playSource, /requiredCarrierCount === 0 && !pendingPlacement && confirmCarryover/, 'carryover confirmation cannot bypass a carrier promise or legal placement');
assert.match(playSource, /!pendingPlacement && confirmCarryover/, 'carryover cannot bypass any legal staged placement');
assert.match(playSource, /axisFirstLegalStagedPlacement/, 'end turn focuses the same singleton placement witness as the server');
assert.match(playSource, /Object\.values\(p\.purchasedThisTurn\)/, 'the armory summary counts only purchases from this turn');
assert.match(playSource, /const purchase = p\.purchasedThisTurn\[k\]/, 'armory quantities and returns use the durable purchase ledger');
assert.doesNotMatch(playSource, /const queued = p\.staging\[k\]/, 'older staged carryover is not shown as current cart quantity');
const purchaseSheetSource = playSource.slice(
  playSource.indexOf('function PurchaseSheet'),
  playSource.indexOf('// unit selection:'),
);
assert.doesNotMatch(
  purchaseSheetSource,
  /axisForceInventory|\bHave\b|\bOwned\b/,
  'the buy screen never shows quantities already owned on the board',
);

console.log('axis mobilization: all checks passed');
