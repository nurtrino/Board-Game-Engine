import assert from 'node:assert/strict';
import { figureCounts, truthFor } from './roster';

const t = (total: number, alive: number, submerged = 0, aboard = 0, withdrawn = 0) => ({ total, alive, submerged, aboard, withdrawn });

// uncapped groups map one to one
assert.deepEqual(figureCounts(4, t(4, 4)), { live: 4, submerged: 0, aboard: 0, gone: 0, dead: 0 });
assert.deepEqual(figureCounts(4, t(4, 3)), { live: 3, submerged: 0, aboard: 0, gone: 0, dead: 1 });
assert.deepEqual(figureCounts(4, t(4, 0)), { live: 0, submerged: 0, aboard: 0, gone: 0, dead: 4 });

// capped groups thin out in proportion, the first loss shows, the last figure stands to the end
{
  let last = 16;
  for (let alive = 40; alive >= 0; alive--) {
    const c = figureCounts(16, t(40, alive));
    assert.ok(c.live <= last, 'figures never come back as units fall');
    assert.equal(c.live + c.dead + c.gone, 16);
    if (alive > 0) assert.ok(c.live >= 1, 'a living group always shows a figure');
    else assert.equal(c.live, 0);
    last = c.live;
  }
  assert.equal(figureCounts(16, t(40, 40)).live, 16);
  assert.equal(figureCounts(16, t(40, 39)).live, 15, 'the first casualty leaves a wreck');
  assert.equal(figureCounts(16, t(40, 1)).live, 1);
}

// submarines: all under, some under, none under
assert.equal(figureCounts(3, t(3, 3, 3)).submerged, 3);
assert.equal(figureCounts(3, t(3, 3, 1)).submerged, 1);
assert.equal(figureCounts(3, t(3, 2, 2)).submerged, 2);
assert.equal(figureCounts(1, t(1, 1, 1)).submerged, 1);
assert.equal(figureCounts(3, t(3, 3, 0)).submerged, 0);

// paratroopers still aboard are not on the ground yet
assert.equal(figureCounts(4, t(4, 4, 0, 2)).aboard, 2);
assert.equal(figureCounts(2, t(2, 2, 0, 2)).aboard, 2);

// a withdrawal leaves no wrecks
assert.deepEqual(figureCounts(5, t(5, 0, 0, 0, 5)), { live: 0, submerged: 0, aboard: 0, gone: 5, dead: 0 });
assert.deepEqual(figureCounts(6, t(6, 2, 0, 0, 3)), { live: 2, submerged: 0, aboard: 0, gone: 3, dead: 1 });

// truth from the battle state: missing units withdrew, a full retreat takes every survivor
{
  const units = new Map([[1, { hp: 1 }], [2, { hp: 0 }], [3, { hp: 1, submerged: true }], [4, { hp: 1, aboard: true }]]);
  assert.deepEqual(truthFor([1, 2, 3, 4, 5], units), { total: 5, alive: 3, submerged: 1, aboard: 1, withdrawn: 1 });
  assert.deepEqual(truthFor([1, 2, 3], units, true), { total: 3, alive: 0, submerged: 0, aboard: 0, withdrawn: 2 });
}
assert.deepEqual(figureCounts(0, t(3, 3)), { live: 0, submerged: 0, aboard: 0, gone: 0, dead: 0 });

console.log('battle roster: ok');
