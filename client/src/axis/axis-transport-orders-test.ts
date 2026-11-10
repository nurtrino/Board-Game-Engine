import assert from 'node:assert/strict';
import type { AxisUnitPick, UnitStack } from '@bge/shared';
import {
  buildAxisTransportLoadAction,
  buildAxisTransportOffloadAction,
  listAxisTransportHullCards,
  setAxisTransportHullUnits,
  summarizeAxisTransportRoute,
  toggleAxisTransportHull,
  type AxisTransportRouteOrder,
} from './axisTransportOrders.js';

const independentHulls: UnitStack[] = [
  {
    power: 'uk',
    key: 'transport',
    count: 1,
    cargo: [{ power: 'uk', key: 'infantry', count: 1 }],
  },
  { power: 'uk', key: 'transport', count: 1 },
];
const independentCards = listAxisTransportHullCards('sz-7', independentHulls, 'uk');
assert.deepEqual(
  independentCards.map((card) => card.physicalOrdinal),
  [0, 1],
  'each hull receives its own durable physical ordinal',
);

let selected = toggleAxisTransportHull([], independentCards[0]);
selected = toggleAxisTransportHull(selected, independentCards[1], []);
assert.deepEqual(
  selected.map(({ physicalOrdinal }) => physicalOrdinal),
  [0, 1],
  'toggling a second hull leaves the first exact hull selected',
);
selected = toggleAxisTransportHull(selected, independentCards[0]);
assert.deepEqual(
  selected.map(({ physicalOrdinal }) => physicalOrdinal),
  [1],
  'toggling one selected hull removes only that hull',
);

const alliedStacks: UnitStack[] = [
  { power: 'uk', key: 'transport', count: 1 },
  {
    power: 'usa',
    key: 'transport',
    count: 1,
    cargo: [
      { power: 'uk', key: 'infantry', count: 1 },
      { power: 'usa', key: 'tank', count: 1 },
    ],
  },
];
const alliedCards = listAxisTransportHullCards('sz-8', alliedStacks, 'uk');
const ownHull = alliedCards.find((card) => card.owner === 'uk');
const alliedHull = alliedCards.find((card) => card.owner === 'usa');
assert.ok(ownHull?.movable, 'the operating power can move its ready transport');
assert.ok(alliedHull, 'a same-side transport appears for cargo operations');
assert.equal(alliedHull.movable, false, 'an allied transport is never offered as movable');
assert.deepEqual(
  alliedHull.cargo,
  [{ key: 'infantry', count: 1 }],
  'a hull card exposes only the operating power cargo on an allied ship',
);
assert.deepEqual(
  alliedHull.manifest,
  [
    { power: 'uk', key: 'infantry', count: 1 },
    { power: 'usa', key: 'tank', count: 1 },
  ],
  'the public card names every allied occupant instead of hiding used capacity',
);
assert.deepEqual(
  alliedHull.capacity,
  {
    total: 2,
    occupied: 2,
    remaining: 0,
    canLoadInfantry: false,
    canLoadNonInfantry: false,
  },
  'capacity still accounts for hidden allied cargo',
);

const movedStacks: UnitStack[] = [{
  power: 'usa',
  key: 'transport',
  count: 1,
  moved: 1,
  cargo: [{ power: 'uk', key: 'artillery', count: 1 }],
}];
const movedHull = listAxisTransportHullCards('sz-9', movedStacks, 'uk')[0];
assert.ok(movedHull, 'a moved same-side hull remains physically selectable');
assert.equal(movedHull.status, 'moved');
assert.equal(movedHull.movable, false);
assert.equal(movedHull.canOffload, true, 'the operating power can select its cargo for offload');

const blockedHull = listAxisTransportHullCards('sz-9', [{
  ...movedStacks[0],
  offloadBlocked: true,
}], 'uk')[0];
assert.equal(blockedHull.canOffload, false);
assert.match(blockedHull.disabledReason ?? '', /retreated/i);

const committedHull = listAxisTransportHullCards('sz-9', [{
  ...movedStacks[0],
  combatLoadedCargo: [{ power: 'uk', key: 'artillery', count: 1 }],
}], 'uk', 'noncombat')[0];
assert.equal(committedHull.canOffload, false);
assert.match(committedHull.disabledReason ?? '', /amphibious/i);
const committedCombatHull = listAxisTransportHullCards('sz-9', [{
  power: 'uk', key: 'transport', count: 1,
  cargo: [{ power: 'uk', key: 'artillery', count: 1 }],
  combatLoadedCargo: [{ power: 'uk', key: 'artillery', count: 1 }],
}], 'uk', 'combat')[0];
assert.equal(committedCombatHull.canOffload, true, 'combat-loaded cargo is selectable for its required assault');
assert.equal(committedCombatHull.movable, true, 'a ready committed owner hull can route atomically into that assault');

const alliedSameTurn = listAxisTransportHullCards('sz-8', [{
  power: 'usa', key: 'transport', count: 1,
  cargo: [{ power: 'uk', key: 'infantry', count: 1 }],
  loadedThisTurnCargo: [{ power: 'uk', key: 'infantry', count: 1 }],
}], 'uk')[0];
assert.equal(alliedSameTurn.canOffload, false);
assert.match(alliedSameTurn.disabledReason ?? '', /wait/i);

const emptyCards = listAxisTransportHullCards(
  'sz-10',
  [
    { power: 'uk', key: 'transport', count: 1 },
    { power: 'uk', key: 'transport', count: 1 },
  ],
  'uk',
);
let loadOrders = toggleAxisTransportHull([], emptyCards[0], []);
loadOrders = toggleAxisTransportHull(loadOrders, emptyCards[1], []);
loadOrders = setAxisTransportHullUnits(loadOrders, emptyCards[0], [{ key: 'infantry', count: 1 }]);
loadOrders = setAxisTransportHullUnits(loadOrders, emptyCards[1], [{ key: 'tank', count: 1 }]);

const landPicks: AxisUnitPick[] = [
  { key: 'infantry', count: 1, ordinals: [2], selectionSig: 'infantry-snapshot' },
  { key: 'tank', count: 1, ordinals: [0], selectionSig: 'tank-snapshot' },
];
const loadAction = buildAxisTransportLoadAction('sz-10', 'india', landPicks, loadOrders);
assert.ok(loadAction, 'a completely assigned exact load order is submit-ready');
assert.deepEqual(
  loadAction.hulls.map(({ owner, physicalOrdinal, units }) => ({ owner, physicalOrdinal, units })),
  [
    { owner: 'uk', physicalOrdinal: 0, units: [{ key: 'infantry', count: 1 }] },
    { owner: 'uk', physicalOrdinal: 1, units: [{ key: 'tank', count: 1 }] },
  ],
  'the serialized payload preserves each hull manifest instead of pooling cargo',
);
assert.equal(
  buildAxisTransportLoadAction('sz-10', 'india', landPicks, [loadOrders[0]]),
  null,
  'an incomplete per-hull assignment cannot be submitted',
);

const offloadSelection = toggleAxisTransportHull([], alliedHull);
assert.deepEqual(
  buildAxisTransportOffloadAction('sz-8', 'united-kingdom', offloadSelection),
  {
    type: 'offload',
    zone: 'sz-8',
    territory: 'united-kingdom',
    hulls: [{
      owner: 'usa',
      physicalOrdinal: alliedHull.physicalOrdinal,
      selectionSig: alliedHull.selectionSig,
      units: [{ key: 'infantry', count: 1 }],
    }],
  },
  'offload serialization retains allied hull ownership and exact cargo',
);

const snapshotStacks: UnitStack[] = [{
  power: 'uk',
  key: 'transport',
  count: 1,
  cargo: [{ power: 'uk', key: 'infantry', count: 1 }],
}];
const snapshotCard = listAxisTransportHullCards('sz-11', snapshotStacks, 'uk')[0];
const captured = toggleAxisTransportHull([], snapshotCard);
snapshotStacks[0] = {
  ...snapshotStacks[0],
  cargo: [{ power: 'uk', key: 'infantry', count: 2 }],
};
const refreshedCard = listAxisTransportHullCards('sz-11', snapshotStacks, 'uk')[0];
assert.notEqual(refreshedCard.selectionSig, snapshotCard.selectionSig, 'a cargo change produces a fresh token');
assert.equal(
  captured[0].selectionSig,
  snapshotCard.selectionSig,
  'a pending selection retains the token captured at tap time',
);

const routed: AxisTransportRouteOrder = {
  ...loadOrders[0],
  from: 'sz-12',
  via: 'sz-13',
};
assert.deepEqual(
  summarizeAxisTransportRoute(routed, 'sz-14'),
  {
    path: ['sz-12', 'sz-13', 'sz-14'],
    distance: 2,
    label: 'sz-12 → sz-13 → sz-14',
    cargoCount: 1,
  },
  'route summaries represent an explicit projection without deciding legality',
);

console.log('axis transport orders: all checks passed');
