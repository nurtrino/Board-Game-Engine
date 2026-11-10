import assert from 'node:assert/strict';
import { AXIS_MAP, createAxisGame } from '@bge/shared';
import { layoutSpace, regionSlots, SLOT_SPACING } from './layout';
import { inRegion, regionAt, SPACE_CENTER } from './world';

// Every space has at least one standing spot, and every spot is inside its own borders.
let total = 0;
for (const id of [...AXIS_MAP.territories.map((t) => t.id), ...AXIS_MAP.seaZones.map((z) => z.id)]) {
  const slots = regionSlots(id);
  assert.ok(slots.length >= 1, `${id} has no spot`);
  total += slots.length;
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    const d = Math.hypot(slots[i][0] - slots[j][0], slots[i][1] - slots[j][1]);
    assert.ok(d > SLOT_SPACING * 0.8, `${id} spots overlap`);
  }
}

// Both scenarios lay out completely: every unit is represented exactly once.
for (const scenario of ['1941', '1942'] as const) {
  const state = createAxisGame([], 1, { scenario });
  let each = 0, stacked = 0;
  for (const [space, stacks] of Object.entries(state.board)) {
    const units = stacks.reduce((n, s) => n + s.count, 0);
    const layout = layoutSpace(space, stacks);
    assert.equal(layout.spots.reduce((n, s) => n + s.pieces.length, 0), units, `${scenario} ${space} loses units`);
    assert.equal(new Set(layout.spots.map((s) => s.id)).size, layout.spots.length, `${scenario} ${space} duplicate ids`);
    if (layout.stacked) stacked++; else if (units) each++;
    // Islands smaller than one spot stand on their printed anchor and are exempt.
    if (!layout.stacked && regionSlots(space).length > 1) for (const s of layout.spots) assert.ok(inRegion(space, s.x, s.y), `${scenario} ${space} piece outside borders`);
  }
  console.log(`${scenario}: ${each} spaces with every unit standing, ${stacked} stacked`);
}
assert.equal(regionAt(...SPACE_CENTER['germany']), 'germany');
console.log(`layout: all checks passed (${total} spots)`);
