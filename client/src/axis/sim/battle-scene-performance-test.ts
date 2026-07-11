import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { battleSceneDetailBudget } from './battlescene.js';

assert.deepEqual(
  battleSceneDetailBudget(12),
  { foliageCount: 165, animatedUnitLimit: 48 },
  'small cinematic battles retain the full scene treatment',
);
assert.deepEqual(
  battleSceneDetailBudget(40),
  { foliageCount: 104, animatedUnitLimit: 24 },
  'large battles reduce decoration and mixer work before combatants',
);
assert.deepEqual(
  battleSceneDetailBudget(80),
  { foliageCount: 78, animatedUnitLimit: 16 },
  'very dense battles receive a bounded presentation budget',
);
assert.deepEqual(
  battleSceneDetailBudget(80, true),
  { foliageCount: 64, animatedUnitLimit: 0 },
  'reduced-motion mode disables repeated skeletal motion and trims decoration',
);
assert.deepEqual(
  battleSceneDetailBudget(Number.NaN),
  battleSceneDetailBudget(0),
  'invalid counts cannot inflate renderer work',
);

const source = readFileSync(new URL('./BattleSim.tsx', import.meta.url), 'utf8');
assert.match(source, /placements\.map\(\(p\)[\s\S]*?<Unit/, 'every authoritative placement remains rendered');
assert.match(source, /Foliage count=\{detailBudget\.foliageCount\}/, 'only ornamental forest density follows the budget');
assert.match(source, /UNITS_BY_KEY\[placement\.unit\.type\]\?\.hits/, 'one-hit armies do not spend three draw calls each on redundant health bars');

console.log('cinematic battle scene performance: all checks passed');
