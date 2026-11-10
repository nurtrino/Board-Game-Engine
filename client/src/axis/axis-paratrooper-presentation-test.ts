import assert from 'node:assert/strict';
import { indexMap, type AxisMap, type AxisView } from '@bge/shared';
import {
  axisParatrooperCommonTargets,
  axisParatrooperPairCards,
  buildAxisParatrooperAttack,
} from './axisParatrooperPresentation.js';

const map: AxisMap = {
  territories: [
    { id: 'base', name: 'Air Base', ipc: 4, originalOwner: 'germany', center: [0, 0], adj: ['enemy'] },
    { id: 'enemy', name: 'Enemy', ipc: 2, originalOwner: 'ussr', center: [1, 0], adj: ['base'] },
  ],
  seaZones: [], canals: [],
};
const idx = indexMap(map);
const view = {
  powers: { germany: { techs: ['paratroopers'] } },
  board: {
    base: [
      { power: 'germany', key: 'bomber', count: 2 },
      { power: 'germany', key: 'infantry', count: 2 },
    ],
    enemy: [{ power: 'ussr', key: 'infantry', count: 1 }],
  },
  control: { base: 'germany', enemy: 'ussr' },
  contested: [],
} as unknown as AxisView;

const cards = axisParatrooperPairCards({ view, idx, power: 'germany' });
assert.equal(cards.length, 4, 'every exact bomber/infantry combination remains an explicit pair choice');
assert.deepEqual(cards.map((card) => [card.bomber.ordinal, card.infantry.ordinal]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
const independentCards = [cards[0]!, cards[3]!];
assert.deepEqual(axisParatrooperCommonTargets(independentCards), [{ target: 'enemy', distance: 1, route: ['base', 'enemy'] }]);

assert.deepEqual(buildAxisParatrooperAttack('enemy', independentCards), {
  type: 'attack',
  target: 'enemy',
  forces: [],
  paratroopers: [{
    from: 'base',
    route: ['base', 'enemy'],
    pairs: independentCards.map((card) => ({
      bomber: { ordinal: card.bomber.ordinal, selectionSig: card.bomber.selectionSig },
      infantry: { ordinal: card.infantry.ordinal, selectionSig: card.infantry.selectionSig },
    })),
  }],
}, 'one atomic attack retains every exact pair and explicit first-hostile route');

assert.equal(axisParatrooperPairCards({
  view: { ...view, powers: { germany: { techs: [] } } } as unknown as AxisView,
  idx,
  power: 'germany',
}).length, 0, 'the builder never exposes borrowed or missing technology');

// Assertions that matched the text of the old interface were removed with that interface.

console.log('axis paratrooper presentation: all checks passed');
