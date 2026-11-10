import { strict as assert } from 'node:assert';
import {
  axisCarrierDeckRequirement,
  axisIncrementalNewCarriersNeeded,
  countAxisLiveTaggedFighters,
  fulfillAxisCarrierPlacement,
  normalizeAxisCarrierFighterTags,
  normalizeAxisCarrierObligations,
  summarizeAxisCarrierOutstanding,
  trimAxisCarrierObligations,
  validateAxisCarrierReservations,
  type AxisCarrierObligationRow,
  type AxisCarrierTaggedFighter,
} from './carrierCommitments.js';

{
  const malformed: unknown = [
    null,
    { power: '', seaZone: 'sz-1', fighterRefs: ['ignored'] },
    {
      power: ' germany ',
      seaZone: ' sz-2 ',
      fighterRefs: ['f-2', 'f-1', 'f-1', 4, ' '],
      carrierFactories: [' Rome ', 'Berlin', 'Berlin', null],
    },
    {
      power: 'germany',
      seaZone: 'sz-2',
      fighterRefs: ['f-3'],
      carrierFactories: ['Kiel'],
    },
    {
      power: 'germany',
      seaZone: 'sz-3',
      fighterRefs: ['f-1', 'f-4'],
      carrierFactories: [],
    },
  ];
  const before = JSON.stringify(malformed);
  assert.deepEqual(normalizeAxisCarrierObligations(malformed), [
    {
      power: 'germany',
      seaZone: 'sz-2',
      fighterRefs: ['f-1', 'f-2', 'f-3'],
      carrierFactories: ['Berlin', 'Berlin', 'Kiel', 'Rome'],
    },
    {
      power: 'germany',
      seaZone: 'sz-3',
      fighterRefs: ['f-4'],
      carrierFactories: [],
    },
  ], 'normalization merges rows, preserves factory multiplicity, and assigns each ref once');
  assert.equal(JSON.stringify(malformed), before, 'normalization never mutates untrusted input');
  assert.deepEqual(normalizeAxisCarrierObligations({}), [], 'non-array save data is defensive');
}

{
  const tags: unknown = [
    { ref: 'f-2', power: 'germany', seaZone: 'sz-2' },
    { ref: ' f-1 ', power: ' germany ', seaZone: ' sz-1 ' },
    { ref: 'f-1', power: 'usa', seaZone: 'sz-9' },
    { ref: '', power: 'germany', seaZone: 'sz-1' },
  ];
  assert.deepEqual(normalizeAxisCarrierFighterTags(tags), [
    { ref: 'f-1', power: 'germany', seaZone: 'sz-1' },
    { ref: 'f-2', power: 'germany', seaZone: 'sz-2' },
  ], 'duplicate stable refs receive one deterministic canonical tag');
  assert.deepEqual(countAxisLiveTaggedFighters([
    { ref: 'b', power: 'usa', seaZone: 'sz-8' },
    { ref: 'a', power: 'usa', seaZone: 'sz-8' },
    { ref: 'c', power: 'germany', seaZone: 'sz-1' },
  ]), [
    { power: 'germany', seaZone: 'sz-1', fighterRefs: ['c'], count: 1 },
    { power: 'usa', seaZone: 'sz-8', fighterRefs: ['a', 'b'], count: 2 },
  ]);
}

{
  assert.equal(axisIncrementalNewCarriersNeeded(2), 1,
    'two same-zone fighters share one new carrier');
  assert.equal(axisIncrementalNewCarriersNeeded(3), 2);
  assert.deepEqual(axisCarrierDeckRequirement(1, {
    ownCarrierSlots: 2,
    alliedCarrierSlots: 2,
    occupiedByOwnFighters: 1,
    occupiedByAlliedGuests: 2,
  }), {
    taggedFighters: 1,
    physicalSlots: 4,
    occupiedPhysicalSlots: 3,
    openPhysicalSlots: 1,
    taggedFightersWithoutPhysicalDeck: 0,
    additionalDeckSlotsNeeded: 0,
    newCarriersNeeded: 0,
  }, 'open allied deck capacity may safely resolve an existing fighter promise');
  assert.equal(axisIncrementalNewCarriersNeeded(1, {
    ownCarrierSlots: 2,
    alliedCarrierSlots: 2,
    occupiedByOwnFighters: 2,
    occupiedByAlliedGuests: 2,
  }), 1, 'allied guests consume physical slots');
  assert.equal(axisIncrementalNewCarriersNeeded(1, {
    ownCarrierSlots: 2,
    alliedCarrierSlots: 0,
    occupiedByOwnFighters: 3,
    occupiedByAlliedGuests: 2,
  }), 2, 'existing friendly overflow must fit before the tagged fighter is guaranteed');
  assert.equal(axisIncrementalNewCarriersNeeded(0, {
    ownCarrierSlots: 0,
    alliedCarrierSlots: 0,
    occupiedByOwnFighters: 9,
    occupiedByAlliedGuests: 0,
  }), 0, 'unrelated overflow alone never invents an obligation');
}

{
  const sameZone: AxisCarrierObligationRow[] = [{
    power: 'germany',
    seaZone: 'sz-1',
    fighterRefs: ['f-1', 'f-2'],
    carrierFactories: ['Berlin'],
  }];
  const valid = validateAxisCarrierReservations({
    obligations: sameZone,
    requirements: [{ power: 'germany', seaZone: 'sz-1', requiredNewCarriers: 1 }],
    staged: [{ power: 'germany', availableCarriers: 1 }],
    factories: [{
      power: 'germany',
      factory: 'Berlin',
      availableCapacity: 1,
      eligibleSeaZones: ['sz-1'],
    }],
  });
  assert.equal(valid.ok, true, 'one carrier and factory slot cover two same-zone fighters');
  assert.deepEqual(valid.reservedByPower, [{ power: 'germany', reserved: 1, available: 1 }]);

  const doublePromised = validateAxisCarrierReservations({
    obligations: [
      ...sameZone.map((row) => ({ ...row, fighterRefs: ['f-1'] })),
      {
        power: 'germany',
        seaZone: 'sz-2',
        fighterRefs: ['f-2'],
        carrierFactories: ['Berlin'],
      },
    ],
    requirements: [
      { power: 'germany', seaZone: 'sz-1', requiredNewCarriers: 1 },
      { power: 'germany', seaZone: 'sz-2', requiredNewCarriers: 1 },
    ],
    staged: [{ power: 'germany', availableCarriers: 1 }],
    factories: [{
      power: 'germany',
      factory: 'Berlin',
      availableCapacity: 1,
      eligibleSeaZones: ['sz-1', 'sz-2'],
    }],
  });
  assert.equal(doublePromised.ok, false);
  assert.deepEqual(doublePromised.issues.map((issue) => issue.code).sort(), [
    'factory-capacity-exhausted',
    'staged-carrier-exhausted',
  ], 'cross-zone promises cannot reuse one staged carrier or production slot');

  const badFactory = validateAxisCarrierReservations({
    obligations: sameZone,
    requirements: [{ power: 'germany', seaZone: 'sz-1', requiredNewCarriers: 2 }],
    staged: [{ power: 'germany', availableCarriers: 1 }],
    factories: [{
      power: 'germany',
      factory: 'Berlin',
      availableCapacity: 1,
      eligibleSeaZones: ['sz-9'],
    }],
  });
  assert.deepEqual(badFactory.issues.map((issue) => issue.code).sort(), [
    'carrier-reservation-shortfall',
    'ineligible-factory',
  ]);

  const exhaustedFactory = validateAxisCarrierReservations({
    obligations: sameZone,
    requirements: [{ power: 'germany', seaZone: 'sz-1', requiredNewCarriers: 1 }],
    staged: [{ power: 'germany', availableCarriers: 1 }],
    factories: [{
      power: 'germany',
      factory: 'Berlin',
      availableCapacity: 0,
      eligibleSeaZones: ['sz-1'],
    }],
  });
  assert.equal(exhaustedFactory.issues.some(
    (issue) => issue.code === 'factory-capacity-exhausted',
  ), true);
}

{
  const obligations: AxisCarrierObligationRow[] = [{
    power: 'germany',
    seaZone: 'sz-1',
    fighterRefs: ['f-1', 'f-2', 'f-3'],
    carrierFactories: ['Rome', 'Berlin'],
  }];
  const liveTags: AxisCarrierTaggedFighter[] = [
    { ref: 'f-1', power: 'germany', seaZone: 'sz-1' },
    { ref: 'f-3', power: 'germany', seaZone: 'sz-1' },
    { ref: 'orphan', power: 'germany', seaZone: 'sz-2' },
  ];
  const before = JSON.stringify({ obligations, liveTags });
  const trimmed = trimAxisCarrierObligations({ obligations, liveTags });
  assert.deepEqual(trimmed.obligations, [{
    power: 'germany',
    seaZone: 'sz-1',
    fighterRefs: ['f-1', 'f-3'],
    carrierFactories: ['Berlin'],
  }], 'a casualty/safe landing releases its exact ref and the now-extra carrier');
  assert.deepEqual(trimmed.releasedFighters, [
    { ref: 'f-2', power: 'germany', seaZone: 'sz-1' },
  ]);
  assert.deepEqual(trimmed.releasedCarrierFactories, [
    { power: 'germany', seaZone: 'sz-1', factory: 'Rome' },
  ], 'deterministic release retains the canonical first factory');
  assert.deepEqual(trimmed.orphanTags, [
    { ref: 'orphan', power: 'germany', seaZone: 'sz-2' },
  ], 'orphan tags are surfaced and never used to infer a new row');
  assert.equal(JSON.stringify({ obligations, liveTags }), before, 'trim is immutable');

  const allResolved = trimAxisCarrierObligations({ obligations, liveTags: [] });
  assert.deepEqual(allResolved.obligations, []);
  assert.equal(allResolved.releasedFighters.length, 3);
  assert.equal(allResolved.releasedCarrierFactories.length, 2);
}

{
  const obligations: AxisCarrierObligationRow[] = [{
    power: 'usa',
    seaZone: 'sz-8',
    fighterRefs: ['f-1', 'f-2', 'f-3', 'f-4'],
    carrierFactories: ['Eastern US', 'Western US'],
  }];
  const wrongZone = fulfillAxisCarrierPlacement({
    obligations,
    placement: { power: 'usa', seaZone: 'sz-9', factory: 'Eastern US', carriers: 1 },
  });
  assert.equal(wrongZone.matchedCarriers, 0);
  assert.equal(wrongZone.uncommittedCarriers, 1);
  assert.deepEqual(wrongZone.obligations, obligations, 'wrong-zone placement fulfills nothing');

  const wrongFactory = fulfillAxisCarrierPlacement({
    obligations,
    placement: { power: 'usa', seaZone: 'sz-8', factory: 'Central US', carriers: 1 },
  });
  assert.equal(wrongFactory.matchedCarriers, 0);
  assert.deepEqual(wrongFactory.resolvedFighterRefs, []);

  const first = fulfillAxisCarrierPlacement({
    obligations,
    placement: { power: 'usa', seaZone: 'sz-8', factory: 'Eastern US', carriers: 2 },
  });
  assert.equal(first.matchedCarriers, 1);
  assert.equal(first.uncommittedCarriers, 1);
  assert.deepEqual(first.resolvedFighterRefs, ['f-1', 'f-2']);
  assert.deepEqual(first.obligations, [{
    power: 'usa',
    seaZone: 'sz-8',
    fighterRefs: ['f-3', 'f-4'],
    carrierFactories: ['Western US'],
  }]);

  const second = fulfillAxisCarrierPlacement({
    obligations: first.obligations,
    placement: { power: 'usa', seaZone: 'sz-8', factory: 'Western US', carriers: 1 },
    deckBefore: {
      ownCarrierSlots: 2,
      alliedCarrierSlots: 0,
      occupiedByOwnFighters: 2,
      occupiedByAlliedGuests: 0,
    },
  });
  assert.deepEqual(second.resolvedFighterRefs, ['f-3', 'f-4']);
  assert.deepEqual(second.obligations, [], 'the final exact placement fulfills the row');

  const alliedGuests = fulfillAxisCarrierPlacement({
    obligations: [{
      power: 'germany',
      seaZone: 'sz-2',
      fighterRefs: ['g-1', 'g-2'],
      carrierFactories: ['Kiel'],
    }],
    placement: { power: 'germany', seaZone: 'sz-2', factory: 'Kiel', carriers: 1 },
    deckBefore: {
      ownCarrierSlots: 0,
      alliedCarrierSlots: 2,
      occupiedByOwnFighters: 0,
      occupiedByAlliedGuests: 2,
    },
  });
  assert.deepEqual(alliedGuests.resolvedFighterRefs, ['g-1', 'g-2'],
    'allied guests consume allied slots, so the new own carrier supplies the promised space');
}

{
  const obligations: AxisCarrierObligationRow[] = [{
    power: 'germany',
    seaZone: 'sz-1',
    fighterRefs: ['f-1', 'f-2'],
    carrierFactories: ['Berlin'],
  }];
  const liveTags: AxisCarrierTaggedFighter[] = obligations[0]!.fighterRefs.map((ref) => ({
    ref,
    power: 'germany',
    seaZone: 'sz-1',
  }));
  const outstanding = summarizeAxisCarrierOutstanding({ obligations, liveTags });
  assert.equal(outstanding.hasOutstanding, true);
  assert.equal(outstanding.totalRequiredNewCarriers, 1);
  assert.equal(outstanding.totalReservedCarriers, 1);
  assert.deepEqual(outstanding.summaries, [{
    power: 'germany',
    seaZone: 'sz-1',
    fighterRefs: ['f-1', 'f-2'],
    fighterCount: 2,
    requiredNewCarriers: 1,
    reservedCarriers: 1,
    missingCarrierReservations: 0,
    carrierFactories: ['Berlin'],
  }]);

  const orphanOnly = summarizeAxisCarrierOutstanding({
    obligations: [],
    liveTags: [{ ref: 'orphan', power: 'usa', seaZone: 'sz-8' }],
  });
  assert.equal(orphanOnly.hasOutstanding, true, 'an orphan tag remains visible to the phase gate');
  assert.equal(orphanOnly.summaries.length, 0);
  assert.equal(orphanOnly.orphanTags.length, 1);

  const clear = summarizeAxisCarrierOutstanding({ obligations, liveTags: [] });
  assert.equal(clear.hasOutstanding, false);
  assert.deepEqual(clear.summaries, []);
}

console.log('axis carrier commitments: all assertions passed');
