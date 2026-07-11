import assert from 'node:assert/strict';
import { strandedAircraft } from './axisAirLanding';

const view = {
  control: { germany: 'germany', france: 'germany', egypt: 'uk' },
  board: {
    germany: [{ power: 'germany', key: 'fighter', count: 1 }],
    egypt: [{ power: 'germany', key: 'bomber', count: 1 }],
    'sz-1': [
      { power: 'germany', key: 'carrier', count: 1 },
      { power: 'germany', key: 'fighter', count: 3 },
      { power: 'germany', key: 'bomber', count: 1 },
    ],
  },
} as const;

assert.deepEqual(strandedAircraft(view as never, 'germany'), [
  { space: 'egypt', key: 'bomber', count: 1, reason: 'hostile-territory' },
  { space: 'sz-1', key: 'bomber', count: 1, reason: 'bomber-at-sea' },
  { space: 'sz-1', key: 'fighter', count: 1, reason: 'no-carrier' },
]);

const alliedDeck = {
  control: {},
  board: {
    'sz-2': [
      { power: 'uk', key: 'carrier', count: 1 },
      { power: 'usa', key: 'fighter', count: 2 },
    ],
  },
} as const;
assert.deepEqual(strandedAircraft(alliedDeck as never, 'usa'), [], 'allied carriers provide landing slots');

const occupiedGuestDeck = {
  control: {},
  board: {
    'sz-3': [
      { power: 'uk', key: 'carrier', count: 1, cargo: [{ power: 'usa', key: 'fighter', count: 1 }] },
      { power: 'usa', key: 'fighter', count: 2 },
    ],
  },
} as const;
assert.deepEqual(strandedAircraft(occupiedGuestDeck as never, 'usa'), [
  { space: 'sz-3', key: 'fighter', count: 1, reason: 'no-carrier' },
], 'allied guest cargo consumes a physical carrier slot in the warning');

const contestedLanding = {
  control: { germany: 'germany' },
  contested: ['germany'],
  board: { germany: [{ power: 'germany', key: 'fighter', count: 1 }] },
} as const;
assert.deepEqual(strandedAircraft(contestedLanding as never, 'germany'), [
  { space: 'germany', key: 'fighter', count: 1, reason: 'hostile-territory' },
], 'a territory contested this turn is not a legal aircraft landing');

const promisedCarrierLanding = {
  control: {},
  board: {
    'sz-4': [
      {
        power: 'germany',
        key: 'fighter',
        count: 1,
        carrierLanding: { ref: 'promised-fighter', seaZone: 'sz-4' },
      },
      { power: 'germany', key: 'fighter', count: 1 },
    ],
  },
} as const;
assert.deepEqual(strandedAircraft(promisedCarrierLanding as never, 'germany'), [
  { space: 'sz-4', key: 'fighter', count: 1, reason: 'no-carrier' },
], 'only the exact fighter protected by a purchased-carrier promise is removed from the warning');

console.log('axis air landing: all checks passed');
