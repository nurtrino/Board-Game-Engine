import assert from 'node:assert/strict';
import { applyAxisAction, type AxisAction, type AxisTransportCargoOrder } from './actions.js';
import { axisPieceSelectionSignature, enumerateAxisPhysicalPieces } from './physical.js';
import { createAxis, normalizeAxisState, type AxisState, type SetupData } from './state.js';
import { indexMap, type AxisMap } from './map.js';
import type { PowerKey, UnitKey } from './config.js';

const MAP: AxisMap = {
  territories: [
    { id: 'port', name: 'Port', ipc: 3, originalOwner: 'uk', center: [0, 0], adj: ['canal'], coastTo: ['sz-0'] },
    { id: 'port-b', name: 'Port B', ipc: 1, originalOwner: 'uk', center: [0, 1], adj: [], coastTo: ['sz-0', 'sz-1'] },
    { id: 'canal', name: 'Canal', ipc: 1, originalOwner: 'uk', center: [1, 0], adj: ['port'], coastTo: [] },
    { id: 'friendly-a', name: 'Friendly A', ipc: 2, originalOwner: 'uk', center: [3, 0], adj: [], coastTo: ['sz-2'] },
    { id: 'friendly-b', name: 'Friendly B', ipc: 1, originalOwner: 'uk', center: [3, 1], adj: [], coastTo: ['sz-2'] },
    { id: 'target', name: 'Target', ipc: 2, originalOwner: 'germany', center: [3, 2], adj: [], coastTo: ['sz-2'] },
  ],
  seaZones: [
    { id: 'sz-0', n: 0, center: [0, 2], adj: ['sz-1'], coastTo: ['port', 'port-b'] },
    { id: 'sz-1', n: 1, center: [1, 2], adj: ['sz-0', 'sz-2'], coastTo: ['port-b'] },
    { id: 'sz-2', n: 2, center: [2, 2], adj: ['sz-1'], coastTo: ['friendly-a', 'friendly-b', 'target'] },
  ],
  canals: [{ id: 'test-canal', name: 'Test Canal', connects: ['sz-1', 'sz-2'], controlledBy: ['canal'] }],
};

const SETUP: SetupData = {
  units: {},
  control: {
    port: 'uk', 'port-b': 'uk', canal: 'uk', 'friendly-a': 'uk', 'friendly-b': 'uk', target: 'germany',
  },
};
const idx = indexMap(MAP);

function fresh(phase: AxisState['phase'] = 'noncombat'): AxisState {
  const state = createAxis(MAP, SETUP, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 19,
  });
  state.turnIdx = 3; // UK
  state.phase = phase;
  state.board = {
    port: [{ power: 'uk', key: 'infantry', count: 2 }, { power: 'uk', key: 'tank', count: 1 }],
    target: [{ power: 'germany', key: 'infantry', count: 1 }],
  };
  return state;
}

const act = (state: AxisState, seat: PowerKey, action: AxisAction) => applyAxisAction(state, idx, seat, action);

function exactPick(state: AxisState, space: string, power: PowerKey, key: UnitKey, ordinals: number[]) {
  return {
    key,
    count: ordinals.length,
    ordinals,
    selectionSig: axisPieceSelectionSignature(state.board[space] ?? [], power, key),
  };
}

function hullOrder(
  state: AxisState,
  zone: string,
  owner: PowerKey,
  physicalOrdinal: number,
  units: { key: UnitKey; count: number }[],
): AxisTransportCargoOrder {
  return {
    owner,
    physicalOrdinal,
    selectionSig: axisPieceSelectionSignature(state.board[zone] ?? [], owner, 'transport'),
    units,
  };
}

function finishArtificialSeaBattle(state: AxisState, status: 'attacker_cleared' | 'retreated'): void {
  const combat = state.combat!;
  combat.battle.status = status;
  if (status === 'retreated') combat.retreatTo = 'sz-1';
  if (status === 'attacker_cleared') for (const unit of combat.battle.defender) unit.hp = 0;
  combat.confirmed = { attacker: false, defender: false };
  state.pendings = [
    { id: state.pendingSeq++, power: 'uk', kind: 'battle-continue', data: { side: 'attacker' } },
    { id: state.pendingSeq++, power: 'germany', kind: 'battle-continue', data: { side: 'defender' } },
  ];
  assert.equal(act(state, 'uk', { type: 'battleContinue' }).ok, true);
  assert.equal(act(state, 'germany', { type: 'battleContinue' }).ok, true);
}

// Empty transports are physical hulls too; spent hulls retain an all-piece ordinal.
{
  const state = fresh();
  state.board['sz-0'] = [{ power: 'uk', key: 'transport', count: 2, moved: 1 }];
  normalizeAxisState(state);
  assert.equal(state.board['sz-0'].length, 2);
  const pieces = enumerateAxisPhysicalPieces(state.board['sz-0']);
  assert.deepEqual(pieces.map((piece) => piece.physicalOrdinal), [0, 1]);
  assert.equal(pieces.find((piece) => !piece.available)?.ordinal, null);
}

// Exact per-hull loading is atomic and does not pool manifests.
{
  const state = fresh();
  state.board['sz-0'] = [
    { power: 'uk', key: 'transport', count: 1 },
    { power: 'uk', key: 'transport', count: 1 },
  ];
  const loaded = act(state, 'uk', {
    type: 'load', zone: 'sz-0', territory: 'port',
    units: [exactPick(state, 'port', 'uk', 'infantry', [0]), exactPick(state, 'port', 'uk', 'tank', [0])],
    hulls: [hullOrder(state, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }]), hullOrder(state, 'sz-0', 'uk', 1, [{ key: 'tank', count: 1 }])],
  });
  assert.equal(loaded.ok, true, loaded.error);
  assert.deepEqual(state.board['sz-0'].map((stack) => stack.cargo?.[0]?.key), ['infantry', 'tank']);

  state.board.port.find((stack) => stack.key === 'infantry')!.count = 2;
  const before = JSON.stringify(state);
  const overloaded = act(state, 'uk', {
    type: 'load', zone: 'sz-0', territory: 'port', units: [exactPick(state, 'port', 'uk', 'infantry', [0, 1])],
    hulls: [hullOrder(state, 'sz-0', 'uk', 1, [{ key: 'infantry', count: 2 }])],
  });
  assert.equal(overloaded.ok, false);
  assert.equal(JSON.stringify(state), before, 'capacity rejection is atomic');
}

// Allied three-turn lifecycle succeeds, but same-turn allied bridging and a second offload do not.
{
  const state = fresh();
  state.board['sz-0'] = [{ power: 'usa', key: 'transport', count: 1 }];
  const loaded = act(state, 'uk', {
    type: 'load', zone: 'sz-0', territory: 'port', units: [exactPick(state, 'port', 'uk', 'infantry', [0, 1])],
    hulls: [hullOrder(state, 'sz-0', 'usa', 0, [{ key: 'infantry', count: 2 }])],
  });
  assert.equal(loaded.ok, true, loaded.error);
  const bridgeBefore = JSON.stringify(state);
  const bridge = act(state, 'uk', {
    type: 'offload', zone: 'sz-0', territory: 'port-b',
    hulls: [hullOrder(state, 'sz-0', 'usa', 0, [{ key: 'infantry', count: 1 }])],
  });
  assert.match(bridge.error ?? '', /later turn/i);
  assert.equal(JSON.stringify(state), bridgeBefore);

  state.phase = 'mobilize';
  assert.equal(act(state, 'uk', { type: 'endPhase' }).ok, true); // clears UK-turn load marker
  state.turnIdx = 5;
  state.phase = 'noncombat';
  state.usaOperationFirst = 'usa';
  state.usaOperationIndex = 0;
  const moved = act(state, 'usa', {
    type: 'move', from: 'sz-0', to: 'sz-2', via: 'sz-1',
    units: [exactPick(state, 'sz-0', 'usa', 'transport', [0])],
  });
  assert.equal(moved.ok, true, moved.error);

  state.turnIdx = 3;
  state.phase = 'noncombat';
  const offload = act(state, 'uk', {
    type: 'offload', zone: 'sz-2', territory: 'friendly-a',
    hulls: [hullOrder(state, 'sz-2', 'usa', 0, [{ key: 'infantry', count: 1 }])],
  });
  assert.equal(offload.ok, true, offload.error);
  const hull = state.board['sz-2'].find((stack) => stack.key === 'transport')!;
  assert.equal(hull.offloadedTo, 'friendly-a');
  assert.equal(state.board['friendly-a'][0].moved, 1, 'offloaded cargo is spent');
  const second = act(state, 'uk', {
    type: 'offload', zone: 'sz-2', territory: 'friendly-a',
    hulls: [hullOrder(state, 'sz-2', 'usa', 0, [{ key: 'infantry', count: 1 }])],
  });
  assert.match(second.error ?? '', /already unloaded/i);
}

// Own noncombat load -> offload is legal; hostile surface ships block both dock actions.
{
  const state = fresh();
  state.board['sz-0'] = [{ power: 'uk', key: 'transport', count: 1 }];
  assert.equal(act(state, 'uk', {
    type: 'load', zone: 'sz-0', territory: 'port', units: [exactPick(state, 'port', 'uk', 'infantry', [0])],
    hulls: [hullOrder(state, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }])],
  }).ok, true);
  assert.equal(act(state, 'uk', {
    type: 'offload', zone: 'sz-0', territory: 'port-b',
    hulls: [hullOrder(state, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }])],
  }).ok, true);

  const hostile = fresh();
  hostile.board['sz-0'] = [
    { power: 'uk', key: 'transport', count: 1, cargo: [{ power: 'uk', key: 'infantry', count: 1 }] },
    { power: 'germany', key: 'destroyer', count: 1 },
  ];
  const before = JSON.stringify(hostile);
  assert.match(act(hostile, 'uk', {
    type: 'load', zone: 'sz-0', territory: 'port', units: [exactPick(hostile, 'port', 'uk', 'infantry', [0])],
    hulls: [hullOrder(hostile, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }])],
  }).error ?? '', /hostile surface/i);
  assert.match(act(hostile, 'uk', {
    type: 'offload', zone: 'sz-0', territory: 'port-b',
    hulls: [hullOrder(hostile, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }])],
  }).error ?? '', /hostile surface/i);
  assert.equal(JSON.stringify(hostile), before);
}

// Combat loads are committed, block phase/NCM escape, and complete a two-zone assault atomically.
{
  const state = fresh('combatMove');
  state.board['sz-0'] = [{ power: 'uk', key: 'transport', count: 1 }];
  assert.equal(act(state, 'uk', {
    type: 'load', zone: 'sz-0', territory: 'port', units: [exactPick(state, 'port', 'uk', 'infantry', [0])],
    hulls: [hullOrder(state, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }])],
  }).ok, true);
  assert.equal(state.board['sz-0'][0].combatLoadedCargo?.[0]?.count, 1);
  assert.match(act(state, 'uk', { type: 'endPhase' }).error ?? '', /must complete/i);
  state.phase = 'noncombat';
  assert.match(act(state, 'uk', {
    type: 'move', from: 'sz-0', to: 'sz-1', units: [exactPick(state, 'sz-0', 'uk', 'transport', [0])],
  }).error ?? '', /committed or spent/i);
  state.phase = 'combatMove';
  const assault = act(state, 'uk', {
    type: 'attack', target: 'target', forces: [],
    amphibious: {
      zone: 'sz-2',
      hulls: [{ ...hullOrder(state, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }]), from: 'sz-0', via: 'sz-1' }],
    },
  });
  assert.equal(assault.ok, true, assault.error);
  const finalHull = state.board['sz-2'].find((stack) => stack.key === 'transport')!;
  assert.equal(finalHull.moved, 1);
  assert.equal(finalHull.offloadedTo, 'target');
  assert.equal(finalHull.combatLoadedCargo, undefined);
  assert.equal(state.board['sz-0']?.some((stack) => stack.key === 'transport') ?? false, false);
}

// Route gates: closed canal/intermediate/final surface hostility reject atomically; subs do not.
{
  const routed = (state: AxisState): AxisAction => ({
    type: 'attack', target: 'target', forces: [],
    amphibious: {
      zone: 'sz-2',
      hulls: [{ ...hullOrder(state, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }]), from: 'sz-0', via: 'sz-1' }],
    },
  });
  for (const obstruction of ['closed-canal', 'intermediate', 'final'] as const) {
    const state = fresh('combatMove');
    state.board['sz-0'] = [{ power: 'uk', key: 'transport', count: 1, cargo: [{ power: 'uk', key: 'infantry', count: 1 }] }];
    if (obstruction === 'closed-canal') state.control.canal = 'germany';
    if (obstruction === 'intermediate') state.board['sz-1'] = [{ power: 'germany', key: 'destroyer', count: 1 }];
    if (obstruction === 'final') state.board['sz-2'] = [{ power: 'germany', key: 'destroyer', count: 1 }];
    const before = JSON.stringify(state);
    assert.equal(act(state, 'uk', routed(state)).ok, false, obstruction);
    assert.equal(JSON.stringify(state), before, `${obstruction} rejection is atomic`);
  }

  const sub = fresh('combatMove');
  sub.board['sz-0'] = [{ power: 'uk', key: 'transport', count: 1, cargo: [{ power: 'uk', key: 'infantry', count: 1 }] }];
  sub.board['sz-2'] = [{ power: 'germany', key: 'submarine', count: 1 }];
  assert.equal(act(sub, 'uk', routed(sub)).ok, true, 'a lone enemy submarine does not block the route');
}

// Zero-route allied hulls and one-zone owner routes are legal; moving an allied hull is not.
{
  const zero = fresh('combatMove');
  zero.board['sz-2'] = [{
    power: 'usa', key: 'transport', count: 1, moved: 1,
    cargo: [{ power: 'uk', key: 'infantry', count: 1 }],
  }];
  assert.equal(act(zero, 'uk', {
    type: 'attack', target: 'target', forces: [],
    amphibious: { zone: 'sz-2', hulls: [{ ...hullOrder(zero, 'sz-2', 'usa', 0, [{ key: 'infantry', count: 1 }]), from: 'sz-2' }] },
  }).ok, true);

  const one = fresh('combatMove');
  one.board['sz-1'] = [{ power: 'uk', key: 'transport', count: 1, cargo: [{ power: 'uk', key: 'infantry', count: 1 }] }];
  assert.equal(act(one, 'uk', {
    type: 'attack', target: 'target', forces: [],
    amphibious: { zone: 'sz-2', hulls: [{ ...hullOrder(one, 'sz-1', 'uk', 0, [{ key: 'infantry', count: 1 }]), from: 'sz-1' }] },
  }).ok, true);

  const alliedMove = fresh('combatMove');
  alliedMove.board['sz-1'] = [{ power: 'usa', key: 'transport', count: 1, cargo: [{ power: 'uk', key: 'infantry', count: 1 }] }];
  assert.match(act(alliedMove, 'uk', {
    type: 'attack', target: 'target', forces: [],
    amphibious: { zone: 'sz-2', hulls: [{ ...hullOrder(alliedMove, 'sz-1', 'usa', 0, [{ key: 'infantry', count: 1 }]), from: 'sz-1' }] },
  }).error ?? '', /only the transport owner/i);
}

// The battle UID ledger preserves a victorious hull's commitment and marks a retreated hull spent.
for (const outcome of ['attacker_cleared', 'retreated'] as const) {
  const state = fresh('combatMove');
  state.board['sz-0'] = [{ power: 'uk', key: 'transport', count: 1 }, { power: 'uk', key: 'destroyer', count: 1 }];
  state.board['sz-2'] = [{ power: 'germany', key: 'destroyer', count: 1 }];
  assert.equal(act(state, 'uk', {
    type: 'load', zone: 'sz-0', territory: 'port', units: [exactPick(state, 'port', 'uk', 'infantry', [0])],
    hulls: [hullOrder(state, 'sz-0', 'uk', 0, [{ key: 'infantry', count: 1 }])],
  }).ok, true);
  assert.equal(act(state, 'uk', {
    type: 'attack', target: 'sz-2',
    forces: [{ from: 'sz-0', via: 'sz-1', units: [exactPick(state, 'sz-0', 'uk', 'transport', [0]), exactPick(state, 'sz-0', 'uk', 'destroyer', [0])] }],
  }).ok, true);
  finishArtificialSeaBattle(state, outcome);

  const zone = outcome === 'attacker_cleared' ? 'sz-2' : 'sz-1';
  const hull = state.board[zone].find((stack) => stack.key === 'transport')!;
  if (outcome === 'attacker_cleared') {
    assert.equal(hull.combatLoadedCargo?.[0]?.count, 1, 'victorious hull retains its beach commitment');
    assert.equal(act(state, 'uk', {
      type: 'attack', target: 'target', forces: [],
      amphibious: { zone: 'sz-2', hulls: [{ ...hullOrder(state, 'sz-2', 'uk', 0, [{ key: 'infantry', count: 1 }]), from: 'sz-2' }] },
    }).ok, true, 'victorious transport may zero-route assault after the sea zone is clear');
  } else {
    assert.equal(hull.combatLoadedCargo, undefined, 'retreat clears the assault commitment without deleting cargo');
    assert.equal(hull.offloadBlocked, true);
    state.phase = 'noncombat';
    assert.match(act(state, 'uk', {
      type: 'offload', zone: 'sz-1', territory: 'port-b',
      hulls: [hullOrder(state, 'sz-1', 'uk', 0, [{ key: 'infantry', count: 1 }])],
    }).error ?? '', /retreated/i);
  }
}

console.log('axis transport actions: all checks passed');
