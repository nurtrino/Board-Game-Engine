import { strict as assert } from 'node:assert';
import { indexMap, type AxisMap } from './map.js';
import {
  airDistance,
  airUnitRange,
  carrierDeckStatus,
  strandedAircraftForPower,
  validateAirAttackLanding,
  validateAirNoncombatLanding,
  type AirBoardSnapshot,
} from './airMovement.js';

const map: AxisMap = {
  territories: [
    { id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', center: [0, 0], adj: ['coast'] },
    { id: 'coast', name: 'Coast', ipc: 2, originalOwner: 'germany', center: [1, 0], adj: ['home'], coastTo: ['sz-1'] },
    { id: 'enemy', name: 'Enemy Coast', ipc: 3, originalOwner: 'ussr', center: [4, 0], adj: ['landing'], coastTo: ['sz-2'] },
    { id: 'landing', name: 'Landing', ipc: 1, originalOwner: 'germany', center: [5, 0], adj: ['enemy'] },
    { id: 'neutral', name: 'Neutral', ipc: 0, originalOwner: null, center: [2, 1], adj: [] },
  ],
  seaZones: [
    { id: 'sz-1', n: 1, center: [2, 0], adj: ['sz-2'], coastTo: ['coast'] },
    { id: 'sz-2', n: 2, center: [3, 0], adj: ['sz-1'], coastTo: ['enemy'] },
  ],
  canals: [],
};
const idx = indexMap(map);

const base = (): AirBoardSnapshot => ({
  board: {
    home: [{ power: 'germany', key: 'fighter', count: 3 }, { power: 'germany', key: 'bomber', count: 1 }],
    'sz-1': [{ power: 'germany', key: 'carrier', count: 1 }],
    enemy: [{ power: 'ussr', key: 'infantry', count: 1 }],
  },
  control: { home: 'germany', coast: 'germany', enemy: 'ussr', landing: 'germany', neutral: null },
  contested: [],
});

assert.equal(airDistance(idx, 'home', 'enemy', 4), 4, 'air graph crosses land, coast, and sea');
assert.equal(airDistance(idx, 'coast', 'sz-2', 2), 2, 'coastal land and sea are adjacent to aircraft');
assert.equal(airDistance(idx, 'home', 'neutral', 8), null, 'strict neutrals are not air destinations');
assert.equal(airUnitRange('fighter', ['longRangeAircraft']), 6, 'long-range aircraft adds two movement');

{
  const snapshot = base();
  const noReturn = validateAirAttackLanding({
    snapshot, idx, power: 'germany', air: [{ from: 'home', key: 'fighter', count: 1 }], target: 'enemy',
  });
  assert.equal(noReturn.ok, false, 'a full-range attack without a landing route is rejected');

  const longRange = validateAirAttackLanding({
    snapshot, idx, power: 'germany', techs: ['longRangeAircraft'],
    air: [{ from: 'home', key: 'fighter', count: 1 }], target: 'enemy',
  });
  assert.equal(longRange.ok, true, 'unused long-range movement may reach friendly land');
}

{
  const snapshot = base();
  const noCarrier = validateAirNoncombatLanding({
    snapshot, idx, power: 'germany', air: [{ from: 'home', key: 'fighter', count: 1 }], destination: 'sz-2',
  });
  assert.equal(noCarrier.ok, false, 'empty water is never offered as a fighter landing');

  const carrierArrives = validateAirNoncombatLanding({
    snapshot,
    idx,
    power: 'germany',
    air: [{ from: 'home', key: 'fighter', count: 1 }],
    destination: 'sz-2',
    carrierMoves: [{ from: 'sz-1', to: 'sz-2', count: 1 }],
  });
  assert.equal(carrierArrives.ok, true, 'a carrier and fighter may converge in one atomic selection');

  const bomberAtSea = validateAirNoncombatLanding({
    snapshot,
    idx,
    power: 'germany',
    air: [{ from: 'home', key: 'bomber', count: 1 }],
    destination: 'sz-2',
    carrierMoves: [{ from: 'sz-1', to: 'sz-2', count: 1 }],
  });
  assert.equal(bomberAtSea.ok, false, 'bombers cannot use carrier decks');
}

{
  const snapshot = base();
  snapshot.board['sz-1'] = [];
  snapshot.board['sz-2'] = [{ power: 'ussr', key: 'cruiser', count: 1 }];
  const ordinary = validateAirNoncombatLanding({
    snapshot,
    idx,
    power: 'germany',
    air: [{ from: 'coast', key: 'fighter', count: 1 }],
    destination: 'sz-2',
  });
  assert.equal(ordinary.ok, false);
  const promised = validateAirNoncombatLanding({
    snapshot,
    idx,
    power: 'germany',
    air: [{ from: 'coast', key: 'fighter', count: 1, futureCarrierZone: 'sz-2' }],
    destination: 'sz-2',
  });
  assert.equal(promised.ok, true,
    'an exact globally reserved fighter may end in its hostile future-carrier zone');
  const attack = validateAirAttackLanding({
    snapshot,
    idx,
    power: 'germany',
    air: [{ from: 'home', key: 'fighter', count: 1, futureCarrierZone: 'sz-2' }],
    target: 'sz-2',
  });
  assert.equal(attack.ok, true, 'an attacking exact fighter is forced to its reachable future zone');
}

{
  const snapshot = base();
  snapshot.board['sz-2'] = [
    { power: 'germany', key: 'carrier', count: 1, cargo: [{ power: 'italy', key: 'fighter', count: 1 }] },
    { power: 'germany', key: 'fighter', count: 2 },
  ];
  const deck = carrierDeckStatus(snapshot, 'germany', 'sz-2');
  assert.deepEqual(deck, { capacity: 2, occupied: 3, open: 0, hostile: false }, 'allied guests consume physical deck slots');
  const stranded = strandedAircraftForPower(snapshot, idx, 'germany');
  assert.ok(stranded.some((group) => group.space === 'sz-2' && group.key === 'fighter' && group.count === 1));
}

{
  const snapshot = base();
  snapshot.board['sz-2'] = [
    { power: 'ussr', key: 'cruiser', count: 1 },
    {
      power: 'germany', key: 'fighter', count: 1,
      carrierLanding: { ref: 'fighter:promised', seaZone: 'sz-2' },
    },
    { power: 'germany', key: 'fighter', count: 1 },
  ];
  assert.deepEqual(strandedAircraftForPower(snapshot, idx, 'germany'), [{
    space: 'sz-2', key: 'fighter', count: 1, reason: 'no-carrier',
  }], 'the promised exact fighter is protected while ordinary hostile overflow remains stranded');
}

{
  const snapshot = base();
  snapshot.contested = ['landing'];
  const result = validateAirAttackLanding({
    snapshot,
    idx,
    power: 'germany',
    air: [{ from: 'home', key: 'bomber', count: 1 }],
    target: 'enemy',
  });
  assert.equal(result.ok, false, 'aircraft cannot plan to land in territory contested this turn');
}

console.log('axis air movement: all assertions passed');
