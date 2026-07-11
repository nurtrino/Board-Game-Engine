import assert from 'node:assert/strict';
import type { AxisView } from '@bge/shared';
import { axisForceInventory } from './axisInventory.js';

const board = {
  germany: [{ power: 'germany', key: 'infantry', count: 3 }],
  'sz-1': [
    { power: 'germany', key: 'transport', count: 1, cargo: [{ power: 'germany', key: 'tank', count: 1 }] },
    { power: 'germany', key: 'fighter', count: 2 },
    { power: 'uk', key: 'destroyer', count: 1 },
  ],
} as AxisView['board'];

assert.deepEqual(
  axisForceInventory(board, 'germany'),
  { infantry: 3, transport: 1, tank: 1, fighter: 2 },
  'the nation roster counts fielded pieces and attached transport cargo only for that power',
);

console.log('axis force inventory: all checks passed');
