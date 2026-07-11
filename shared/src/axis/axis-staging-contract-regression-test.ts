import assert from 'node:assert/strict';
import { applyAxisAction, type AxisAction } from './actions.js';
import { indexMap, type AxisMap } from './map.js';
import { createAxis, normalizeAxisState, type AxisState, type SetupData, type UnitStack } from './state.js';

const MAP: AxisMap = {
  territories: [
    {
      id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', isCapital: true,
      center: [0, 0], adj: [], coastTo: ['sz-home'],
    },
  ],
  seaZones: [
    { id: 'sz-home', n: 1, center: [0, 1], adj: [], coastTo: ['home'] },
  ],
  canals: [],
};

const idx = indexMap(MAP);
const CONTROL: SetupData['control'] = { home: 'germany' };

function fresh(
  phase: AxisState['phase'],
  units: Record<string, UnitStack[]> = {},
): AxisState {
  const state = createAxis(MAP, { control: CONTROL, units }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 4301,
  });
  state.phase = phase;
  return state;
}

const act = (state: AxisState, action: AxisAction) => applyAxisAction(state, idx, 'germany', action);
const snapshot = (state: AxisState) => JSON.stringify(state);

const failures: { name: string; message: string }[] = [];
function contract(name: string, body: () => void): void {
  try {
    body();
    console.log(`[green] ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ name, message });
    console.error(`[red] ${name}: ${message}`);
  }
}

contract('prior-turn carryover staging cannot be unbought or refunded', () => {
  const state = fresh('purchase');
  // State present when Purchase begins is carryover by definition. The exact
  // current-turn ledger starts empty and is never inferred from staging.
  state.powers.germany.staging = { tank: 1 };
  const before = snapshot(state);
  const ipcsBefore = state.powers.germany.ipcs;
  const result = act(state, { type: 'unbuy', key: 'tank', count: 1 });
  assert.deepEqual(
    {
      ok: result.ok,
      unchanged: snapshot(state) === before,
      ipcs: state.powers.germany.ipcs,
      staged: state.powers.germany.staging.tank,
    },
    { ok: false, unchanged: true, ipcs: ipcsBefore, staged: 1 },
  );
});

contract('legacy Purchase saves never infer refundable provenance from carryover staging', () => {
  const state = fresh('purchase');
  state.powers.germany.staging = { tank: 1 };
  delete (state.powers.germany as Partial<typeof state.powers.germany>).purchasedThisTurn;
  normalizeAxisState(state);
  assert.deepEqual(state.powers.germany.purchasedThisTurn, {});
  const normalized = snapshot(state);
  normalizeAxisState(state);
  assert.equal(snapshot(state), normalized, 'purchase-ledger migration is idempotent');
  const before = snapshot(state);
  assert.equal(act(state, { type: 'unbuy', key: 'tank', count: 1 }).ok, false);
  assert.equal(snapshot(state), before, 'legacy carryover remains nonrefundable and rejection stays atomic');
});

contract('a unit purchased this turn can still be unbought at its paid price', () => {
  const state = fresh('purchase');
  state.powers.germany.staging = { tank: 1 }; // prior-turn carryover
  const ipcsBefore = state.powers.germany.ipcs;
  assert.equal(act(state, { type: 'buy', key: 'infantry', count: 1 }).ok, true);
  assert.equal(state.powers.germany.ipcs, ipcsBefore - 3);
  assert.equal(act(state, { type: 'unbuy', key: 'infantry', count: 1 }).ok, true);
  assert.deepEqual(state.powers.germany.staging, { tank: 1 });
  assert.equal(state.powers.germany.ipcs, ipcsBefore);
});

contract('same-type carryover remains after refunding only this turn\'s purchased pieces', () => {
  const state = fresh('purchase');
  state.powers.germany.staging = { tank: 2 }; // prior-turn carryover
  const ipcsBefore = state.powers.germany.ipcs;
  assert.equal(act(state, { type: 'buy', key: 'tank', count: 1 }).ok, true);
  assert.equal(state.powers.germany.staging.tank, 3);
  assert.equal(act(state, { type: 'unbuy', key: 'tank', count: 1 }).ok, true);
  assert.equal(state.powers.germany.staging.tank, 2);
  assert.equal(state.powers.germany.ipcs, ipcsBefore);

  const before = snapshot(state);
  const rejected = act(state, { type: 'unbuy', key: 'tank', count: 1 });
  assert.deepEqual(
    { ok: rejected.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'the reducer never infers a refundable current purchase from undifferentiated carryover',
  );
});

contract('unbuy refunds the recorded paid price even if the live unit price later differs', () => {
  const state = fresh('purchase');
  const ipcsBefore = state.powers.germany.ipcs;
  assert.equal(act(state, { type: 'buy', key: 'carrier', count: 1 }).ok, true);
  assert.equal(state.powers.germany.ipcs, ipcsBefore - 14);
  state.powers.germany.techs.push('improvedShipyards');
  assert.equal(act(state, { type: 'unbuy', key: 'carrier', count: 1 }).ok, true);
  assert.equal(
    state.powers.germany.ipcs,
    ipcsBefore,
    'the exact 14 IPCs paid are restored rather than the now-discounted 11 IPC price',
  );
});

contract('Purchase close clears refund provenance without discarding staged units', () => {
  const state = fresh('purchase');
  assert.equal(act(state, { type: 'buy', key: 'infantry', count: 2 }).ok, true);
  assert.deepEqual(state.powers.germany.purchasedThisTurn.infantry, { count: 2, paidUnitCost: 3 });
  assert.equal(act(state, { type: 'endPhase' }).ok, true);
  assert.deepEqual(state.powers.germany.purchasedThisTurn, {});
  assert.equal(state.powers.germany.staging.infantry, 2);
});

contract('Mobilize cannot end while any staged unit has a legal placement', () => {
  const state = fresh('mobilize', {
    home: [{ power: 'germany', key: 'factory', count: 1 }],
  });
  state.powers.germany.staging = { infantry: 1 };
  state.powers.germany.factoriesUsed = {};
  const before = snapshot(state);
  const result = act(state, { type: 'endPhase' });
  assert.deepEqual(
    { ok: result.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'carryover is permitted only after every currently legal placement is exhausted',
  );
});

contract('Mobilize may end with carryover when no eligible factory can place it', () => {
  const state = fresh('mobilize');
  state.powers.germany.staging = { infantry: 1 };
  const result = act(state, { type: 'endPhase' });
  assert.equal(result.ok, true, result.error);
  assert.equal(state.powers.germany.staging.infantry, 1, 'blocked excess remains staged for a future turn');
  assert.equal(state.phase, 'purchase', 'play advances to the next power');
});

contract('Mobilize may end when factory capacity is exhausted for every staged placement', () => {
  const state = fresh('mobilize', {
    home: [{ power: 'germany', key: 'factory', count: 1 }],
  });
  state.powers.germany.staging = { destroyer: 1 };
  state.powers.germany.factoriesUsed = { home: 5 };
  const result = act(state, { type: 'endPhase' });
  assert.equal(result.ok, true, result.error);
  assert.equal(state.powers.germany.staging.destroyer, 1);
  assert.equal(state.phase, 'purchase');
});

if (failures.length > 0) {
  console.error(`axis staging contract regressions: ${failures.length} red contract(s)`);
  for (const failure of failures) console.error(` - ${failure.name}`);
  process.exitCode = 1;
} else {
  console.log('axis staging contract regressions: all contracts passed');
}
