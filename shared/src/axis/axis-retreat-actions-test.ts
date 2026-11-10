import assert from 'node:assert/strict';
import { applyAxisAction, type AxisAction } from './actions.js';
import { indexMap, type AxisMap } from './map.js';
import {
  axisViewFor,
  createAxis,
  normalizeAxisState,
  snapshotAxisTurnStartSea,
  unitCount,
  type AxisState,
  type SetupData,
  type UnitStack,
} from './state.js';

const MAP: AxisMap = {
  territories: [
    { id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', isCapital: true, center: [0, 0], adj: ['target', 'landing'] },
    { id: 'alpha', name: 'Alpha', ipc: 2, originalOwner: 'germany', center: [-1, 0], adj: ['target'] },
    { id: 'bravo', name: 'Bravo', ipc: 2, originalOwner: 'italy', center: [1, 0], adj: ['target'] },
    { id: 'landing', name: 'Landing', ipc: 2, originalOwner: 'germany', center: [0, -1], adj: ['home', 'target', 'deep-target'] },
    { id: 'target', name: 'Target', ipc: 3, originalOwner: 'ussr', center: [0, 1], adj: ['home', 'alpha', 'bravo', 'landing'], coastTo: ['sz-coast'] },
    { id: 'deep-target', name: 'Deep Target', ipc: 2, originalOwner: 'ussr', center: [1, -1], adj: ['landing'] },
    { id: 'far', name: 'Far', ipc: 1, originalOwner: 'germany', center: [4, 0], adj: [] },
    { id: 'port', name: 'Port', ipc: 2, originalOwner: 'germany', center: [-2, 2], adj: [], coastTo: ['sz-origin'] },
  ],
  seaZones: [
    { id: 'sz-origin', n: 1, center: [-2, 3], adj: ['sz-mid'], coastTo: ['port'] },
    { id: 'sz-mid', n: 2, center: [-1, 3], adj: ['sz-origin', 'sz-target'] },
    { id: 'sz-target', n: 3, center: [0, 3], adj: ['sz-mid'] },
    { id: 'sz-coast', n: 4, center: [1, 3], adj: [], coastTo: ['target'] },
  ],
  canals: [],
};

const idx = indexMap(MAP);
const CONTROL: SetupData['control'] = {
  home: 'germany',
  alpha: 'germany',
  bravo: 'italy',
  landing: 'germany',
  target: 'ussr',
  'deep-target': 'ussr',
  far: 'germany',
  port: 'germany',
};

function fresh(units: Record<string, UnitStack[]> = {}, seed = 31): AxisState {
  const state = createAxis(MAP, { control: CONTROL, units }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed,
  });
  state.phase = 'combatMove';
  return state;
}

const act = (state: AxisState, power: 'germany' | 'ussr', action: AxisAction) =>
  applyAxisAction(state, idx, power, action);

function exposeRetreat(state: AxisState, partial = false): void {
  const combat = state.combat!;
  combat.battle.status = 'ongoing';
  combat.battle.decision = { type: 'retreat', side: 'attacker', ...(partial ? { partial: true } : {}) };
  state.pendings = state.pendings.filter((pending) => !pending.kind.startsWith('battle-'));
  state.pendings.push({
    id: state.pendingSeq++, power: 'germany', kind: 'battle-retreat', data: { decision: combat.battle.decision },
  });
}

function confirmReport(state: AxisState): void {
  assert.equal(act(state, 'germany', { type: 'battleContinue' }).ok, true);
  assert.equal(act(state, 'ussr', { type: 'battleContinue' }).ok, true);
}

function terminalize(state: AxisState, status: 'defender_won' | 'retreated'): void {
  const combat = state.combat!;
  combat.battle.status = status;
  combat.battle.decision = null;
  combat.confirmed = { attacker: false, defender: false };
  state.pendings = [
    { id: state.pendingSeq++, power: 'germany', kind: 'battle-continue', data: { side: 'attacker' } },
    { id: state.pendingSeq++, power: 'ussr', kind: 'battle-continue', data: { side: 'defender' } },
  ];
}

// A two-space attacker retreats to its final adjacent ingress, never its
// original source. This is the direct regression for the old c.from[0]
// teleport behavior.
{
  const state = fresh({
    home: [{ power: 'germany', key: 'tank', count: 1 }],
    'deep-target': [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  assert.equal(act(state, 'germany', {
    type: 'attack', target: 'deep-target',
    forces: [{ from: 'home', via: 'landing', units: [{ key: 'tank', count: 1 }] }],
  }).ok, true);
  assert.equal(state.combat?.battle.attacker[0]?.ingressFrom, 'landing');
  exposeRetreat(state);
  assert.deepEqual(axisViewFor(state, idx).combat?.retreatPolicy?.destinations, ['landing']);

  const before = JSON.stringify(state);
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'home' }).ok, false);
  assert.equal(JSON.stringify(state), before, 'the two-space origin is rejected atomically');
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'landing' }).ok, true);
  confirmReport(state);
  assert.equal(unitCount(state, 'landing', 'germany', 'tank'), 1);
  assert.equal(unitCount(state, 'home', 'germany', 'tank'), 0);
}

// Initial creation snapshots real surface hostility, every new turn replaces
// the snapshot for its active power, and legacy hydration treats fought sea
// zones conservatively even when they are now empty.
{
  const initial = fresh({ 'sz-mid': [{ power: 'uk', key: 'cruiser', count: 1 }] });
  assert.equal(initial.turnStartSea.power, 'germany');
  assert.deepEqual(initial.turnStartSea.hostile, ['sz-mid'], 'the initial turn snapshots the created board, not an empty placeholder');

  initial.board['sz-mid'] = [{ power: 'germany', key: 'destroyer', count: 1 }];
  initial.phase = 'mobilize';
  assert.equal(act(initial, 'germany', { type: 'endPhase' }).ok, true);
  assert.equal(initial.turnStartSea.power, 'ussr');
  assert.deepEqual(initial.turnStartSea.hostile, ['sz-mid'], 'beginTurn refreshes hostility for the next active power');

  const legacy = fresh();
  delete (legacy as Partial<AxisState>).turnStartSea;
  legacy.contested = ['sz-mid'];
  normalizeAxisState(legacy);
  assert.deepEqual(legacy.turnStartSea.hostile, ['sz-mid'], 'legacy fought-over zones are conservatively treated as start-hostile');

  legacy.turnIdx = 1;
  legacy.board['sz-mid'] = [{ power: 'germany', key: 'destroyer', count: 1 }];
  snapshotAxisTurnStartSea(legacy, idx);
  assert.equal(legacy.turnStartSea.power, 'ussr');
}

// Multiple original ingress routes stay available after one establishing unit
// becomes a casualty. Every surviving land unit moves to the one exact choice.
{
  const state = fresh({
    alpha: [{ power: 'germany', key: 'infantry', count: 1 }],
    bravo: [{ power: 'germany', key: 'tank', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  assert.equal(act(state, 'germany', {
    type: 'attack', target: 'target',
    forces: [
      { from: 'alpha', units: [{ key: 'infantry', count: 1 }] },
      { from: 'bravo', units: [{ key: 'tank', count: 1 }] },
    ],
  }).ok, true);
  assert.deepEqual(state.combat?.battle.attacker.map((unit) => unit.ingressFrom), ['alpha', 'bravo']);
  state.combat!.battle.attacker.find((unit) => unit.key === 'infantry')!.hp = 0;
  exposeRetreat(state);

  const view = axisViewFor(state, idx);
  assert.deepEqual(view.combat?.retreatPolicy?.destinations, ['alpha', 'bravo']);
  const reconnected = JSON.parse(JSON.stringify(state)) as AxisState;
  normalizeAxisState(reconnected);
  assert.deepEqual(axisViewFor(reconnected, idx).combat?.retreatPolicy?.destinations, ['alpha', 'bravo'], 'reconnect preserves exact ingress provenance');

  const staleBefore = JSON.stringify(state);
  assert.equal(act(state, 'germany', {
    type: 'battleRetreat', retreat: true, destination: 'alpha', combatId: state.combat!.id, visualSeq: 1,
  }).ok, false);
  assert.equal(JSON.stringify(state), staleBefore, 'a stale retreat generation is byte-for-byte non-mutating');

  const malformedBefore = JSON.stringify(state);
  assert.equal(act(state, 'germany', {
    type: 'battleRetreat', retreat: true,
  } as unknown as AxisAction).ok, false);
  assert.equal(JSON.stringify(state), malformedBefore, 'a missing exact destination is rejected before mutation');
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'far' }).ok, false);
  assert.equal(JSON.stringify(state), malformedBefore, 'a friendly space that did not establish ingress is rejected atomically');

  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'alpha' }).ok, true);
  assert.equal(state.combat?.retreatTo, 'alpha');
  confirmReport(state);
  assert.equal(unitCount(state, 'alpha', 'germany', 'tank'), 1, 'all surviving land units use the single chosen route');
  assert.equal(unitCount(state, 'bravo', 'germany', 'tank'), 0);
  assert.equal(state.lastBattle?.retreatTo, 'alpha');
}

// Aircraft-only withdrawal uses an explicit null destination and leaves the
// aircraft over the contested territory with its attack movement preserved.
{
  const state = fresh({
    home: [{ power: 'germany', key: 'fighter', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  assert.equal(act(state, 'germany', {
    type: 'attack', target: 'target', forces: [{ from: 'home', units: [{ key: 'fighter', count: 1 }] }],
  }).ok, true);
  exposeRetreat(state);
  assert.equal(axisViewFor(state, idx).combat?.retreatPolicy?.destinationRequired, false);
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'home' }).ok, false);
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: null }).ok, true);
  confirmReport(state);
  const fighter = state.board.target.find((stack) => stack.power === 'germany' && stack.key === 'fighter');
  assert.equal(fighter?.count, 1);
  assert.equal(fighter?.movementSpent, 1);
  assert.equal(state.lastBattle?.retreatTo, null);
}

// A living land unit with no persisted route cannot teleport, and the whole
// force must press on even when aircraft are also present.
{
  const state = fresh({
    alpha: [{ power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  assert.equal(act(state, 'germany', {
    type: 'attack', target: 'target', forces: [{ from: 'alpha', units: [{ key: 'infantry', count: 1 }] }],
  }).ok, true);
  delete state.combat!.battle.attacker[0].ingressFrom;
  exposeRetreat(state);
  const before = JSON.stringify(state);
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'alpha' }).ok, false);
  assert.equal(JSON.stringify(state), before);
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: false }).ok, true, 'pressing on remains legal when retreat is impossible');
}

// Turn-start hostility blocks a newly cleared intermediate from becoming a
// naval retreat destination.
{
  const state = fresh({
    'sz-origin': [{ power: 'germany', key: 'destroyer', count: 1 }],
    'sz-target': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  state.turnStartSea.hostile = ['sz-mid'];
  assert.equal(act(state, 'germany', {
    type: 'attack', target: 'sz-target',
    forces: [{ from: 'sz-origin', via: 'sz-mid', units: [{ key: 'destroyer', count: 1 }] }],
  }).ok, true);
  exposeRetreat(state);
  assert.deepEqual(axisViewFor(state, idx).combat?.retreatPolicy?.destinations, []);
  const before = JSON.stringify(state);
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'sz-mid' }).ok, false);
  assert.equal(JSON.stringify(state), before);
}

// A surface fleet and exact loaded transport withdraw together. A submerged
// submarine remains in the contested zone, while the transport ledger clears
// combat commitment, preserves cargo/load history, and blocks offload.
{
  const cargo = [{ power: 'germany' as const, key: 'infantry' as const, count: 1 }];
  const state = fresh({
    'sz-origin': [
      { power: 'germany', key: 'transport', count: 1, cargo },
      { power: 'germany', key: 'destroyer', count: 1 },
      { power: 'germany', key: 'submarine', count: 1 },
    ],
    'sz-target': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  const hull = state.board['sz-origin'].find((stack) => stack.key === 'transport')!;
  hull.combatLoadedCargo = cargo.map((item) => ({ ...item }));
  hull.loadedThisTurnCargo = cargo.map((item) => ({ ...item }));
  assert.equal(act(state, 'germany', {
    type: 'attack', target: 'sz-target',
    forces: [{ from: 'sz-origin', via: 'sz-mid', units: [
      { key: 'transport', count: 1 }, { key: 'destroyer', count: 1 }, { key: 'submarine', count: 1 },
    ] }],
  }).ok, true);
  exposeRetreat(state);
  const submarine = state.combat!.battle.attacker.find((unit) => unit.key === 'submarine')!;
  submarine.submerged = true;
  assert.deepEqual(axisViewFor(state, idx).combat?.retreatPolicy?.submergedUnitUids, [submarine.uid]);
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'sz-mid' }).ok, true);
  confirmReport(state);

  assert.equal(unitCount(state, 'sz-mid', 'germany', 'destroyer'), 1);
  assert.equal(unitCount(state, 'sz-target', 'germany', 'submarine'), 1);
  const retreatedHull = state.board['sz-mid'].find((stack) => stack.key === 'transport')!;
  assert.equal(retreatedHull.cargo?.[0]?.count, 1);
  assert.equal(retreatedHull.combatLoadedCargo, undefined);
  assert.equal(retreatedHull.loadedThisTurnCargo?.[0]?.count, 1);
  assert.equal(retreatedHull.offloadBlocked, true);
}

// Mixed amphibious withdrawal moves only overland units to the chosen space.
// Aircraft remain over the battle, beach units stay committed, and offshore
// bombardiers return to their sea zone when the beach battle closes.
{
  const state = fresh({
    alpha: [{ power: 'germany', key: 'infantry', count: 1 }],
    home: [{ power: 'germany', key: 'fighter', count: 1 }],
    'sz-coast': [
      { power: 'germany', key: 'transport', count: 1, cargo: [{ power: 'germany', key: 'infantry', count: 1 }] },
      { power: 'germany', key: 'battleship', count: 1 },
    ],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  assert.equal(act(state, 'germany', {
    type: 'attack', target: 'target',
    forces: [
      { from: 'alpha', units: [{ key: 'infantry', count: 1 }] },
      { from: 'home', units: [{ key: 'fighter', count: 1 }] },
      { from: 'sz-coast', units: [{ key: 'battleship', count: 1 }] },
    ],
    offloadFrom: 'sz-coast', offloadUnits: [{ key: 'infantry', count: 1 }],
  }).ok, true);
  assert.equal(state.combat!.battle.attacker.find((unit) => unit.key === 'battleship')?.ingressFrom, undefined, 'bombardiers do not establish a land route');
  exposeRetreat(state, true);
  const policy = axisViewFor(state, idx).combat?.retreatPolicy;
  assert.deepEqual(policy?.destinations, ['alpha']);
  assert.equal(policy?.committedBeachUnitUids.length, 1);
  assert.equal(act(state, 'germany', { type: 'battleRetreat', retreat: true, destination: 'alpha' }).ok, true);

  const beach = state.combat!.battle.attacker.find((unit) => unit.amphibious)!;
  beach.hp = 0;
  terminalize(state, 'defender_won');
  confirmReport(state);
  assert.equal(unitCount(state, 'alpha', 'germany', 'infantry'), 1);
  assert.equal(unitCount(state, 'target', 'germany', 'fighter'), 1);
  assert.equal(unitCount(state, 'sz-coast', 'germany', 'battleship'), 1);
  assert.equal(state.lastBattle?.retreatTo, 'alpha');
}

console.log('axis retreat actions: all assertions passed');
