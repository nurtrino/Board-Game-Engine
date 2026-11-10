import assert from 'node:assert/strict';
import {
  applyAxisAction,
  type AxisAction,
  type AxisTransportCargoOrder,
  type AxisUnitPick,
} from './actions.js';
import { axisPieceSelectionSignature } from './physical.js';
import { indexMap, type AxisMap } from './map.js';
import { createAxis, unitCount, type AxisState, type SetupData, type UnitStack } from './state.js';
import type { PowerKey, UnitKey } from './config.js';

const MAP: AxisMap = {
  territories: [
    {
      id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', isCapital: true,
      center: [0, 0], adj: ['enemy', 'captured-aa'],
    },
    {
      id: 'enemy', name: 'Enemy', ipc: 2, originalOwner: 'ussr',
      center: [1, 0], adj: ['home'], coastTo: ['sz-port'],
    },
    {
      id: 'captured-aa', name: 'Captured AA', ipc: 1, originalOwner: 'ussr',
      center: [0, 1], adj: ['home'],
    },
    {
      id: 'port', name: 'Port', ipc: 3, originalOwner: 'germany',
      center: [2, 0], adj: [], coastTo: ['sz-port'],
    },
  ],
  seaZones: [
    { id: 'sz-port', n: 1, center: [2, 1], adj: [], coastTo: ['port', 'enemy'] },
  ],
  canals: [],
};

const idx = indexMap(MAP);
const CONTROL: SetupData['control'] = {
  home: 'germany',
  enemy: 'ussr',
  'captured-aa': 'ussr',
  port: 'germany',
};

function fresh(units: Record<string, UnitStack[]>): AxisState {
  const state = createAxis(MAP, { control: CONTROL, units }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 4201,
  });
  state.phase = 'combatMove';
  return state;
}

const act = (state: AxisState, seat: PowerKey, action: AxisAction) =>
  applyAxisAction(state, idx, seat, action);
const snapshot = (state: AxisState) => JSON.stringify(state);

function exactPick(
  state: AxisState,
  space: string,
  power: PowerKey,
  key: UnitKey,
  ordinals: number[],
): AxisUnitPick {
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
  units: { key: UnitKey; count: number }[],
): AxisTransportCargoOrder {
  return {
    owner: 'germany',
    physicalOrdinal: 0,
    selectionSig: axisPieceSelectionSignature(state.board[zone] ?? [], 'germany', 'transport'),
    units,
  };
}

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

contract('an AA gun cannot move overland during Combat Move', () => {
  const state = fresh({
    home: [{ power: 'germany', key: 'aaGun', count: 1 }],
    enemy: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  const before = snapshot(state);
  const result = act(state, 'germany', {
    type: 'attack',
    target: 'enemy',
    forces: [{
      from: 'home',
      units: [exactPick(state, 'home', 'germany', 'aaGun', [0])],
    }],
  });
  assert.deepEqual(
    { ok: result.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'the reducer must enforce the AA restriction independently of client filtering',
  );
});

contract('an AA gun loaded this Combat Move cannot travel in an amphibious force', () => {
  const state = fresh({
    port: [{ power: 'germany', key: 'aaGun', count: 1 }],
    'sz-port': [{ power: 'germany', key: 'transport', count: 1 }],
  });
  const before = snapshot(state);
  const units = [{ key: 'aaGun' as const, count: 1 }];
  const result = act(state, 'germany', {
    type: 'load',
    zone: 'sz-port',
    territory: 'port',
    units: [exactPick(state, 'port', 'germany', 'aaGun', [0])],
    hulls: [hullOrder(state, 'sz-port', units)],
  });
  assert.deepEqual(
    { ok: result.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'only an AA gun already aboard from a prior turn may move during Combat Move',
  );
});

contract('a prior-loaded AA gun cannot initiate an amphibious battle by itself', () => {
  const state = fresh({
    enemy: [{ power: 'ussr', key: 'infantry', count: 1 }],
    'sz-port': [{
      power: 'germany', key: 'transport', count: 1,
      cargo: [{ power: 'germany', key: 'aaGun', count: 1 }],
    }],
  });
  const before = snapshot(state);
  const units = [{ key: 'aaGun' as const, count: 1 }];
  const result = act(state, 'germany', {
    type: 'attack',
    target: 'enemy',
    forces: [],
    amphibious: {
      zone: 'sz-port',
      hulls: [{ ...hullOrder(state, 'sz-port', units), from: 'sz-port' }],
    },
  });
  assert.deepEqual(
    { ok: result.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'passive prior-loaded cargo may accompany combat but cannot create a new battle',
  );
});

contract('a prior-loaded AA gun may accompany a real amphibious attacker', () => {
  const state = fresh({
    enemy: [{ power: 'ussr', key: 'infantry', count: 1 }],
    'sz-port': [{
      power: 'germany', key: 'transport', count: 1,
      cargo: [
        { power: 'germany', key: 'aaGun', count: 1 },
        { power: 'germany', key: 'infantry', count: 1 },
      ],
    }],
  });
  const units = [
    { key: 'aaGun' as const, count: 1 },
    { key: 'infantry' as const, count: 1 },
  ];
  const result = act(state, 'germany', {
    type: 'attack',
    target: 'enemy',
    forces: [],
    amphibious: {
      zone: 'sz-port',
      hulls: [{ ...hullOrder(state, 'sz-port', units), from: 'sz-port' }],
    },
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    state.combat?.battle.attacker.map((unit) => unit.key).sort(),
    ['aaGun', 'infantry'],
    'the AA gun joins only because the infantry supplies positive attack capability',
  );
});

contract('a captured AA gun remains spent through the capturing turn\'s Noncombat Move', () => {
  const state = fresh({
    home: [{ power: 'germany', key: 'infantry', count: 1 }],
    'captured-aa': [{ power: 'ussr', key: 'aaGun', count: 1 }],
  });
  const attack = act(state, 'germany', {
    type: 'attack',
    target: 'captured-aa',
    forces: [{
      from: 'home',
      units: [exactPick(state, 'home', 'germany', 'infantry', [0])],
    }],
  });
  assert.equal(attack.ok, true, attack.error);
  const combat = state.combat;
  assert.ok(combat?.confirmed, 'passive captured infrastructure still receives the shared battle report');
  const target = { combatId: combat.id, visualSeq: combat.visualSeq };
  assert.equal(act(state, 'germany', { type: 'battleContinue', ...target }).ok, true);
  assert.equal(act(state, 'ussr', { type: 'battleContinue', ...target }).ok, true);
  assert.equal(state.control['captured-aa'], 'germany');
  assert.equal(unitCount(state, 'captured-aa', 'germany', 'aaGun'), 1);
  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, true);
  assert.equal(state.phase, 'noncombat');

  const before = snapshot(state);
  const move = act(state, 'germany', {
    type: 'move',
    from: 'captured-aa',
    to: 'home',
    units: [exactPick(state, 'captured-aa', 'germany', 'aaGun', [0])],
  });
  assert.deepEqual(
    { ok: move.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'capturing an AA gun never grants it a fresh same-turn movement point',
  );
});

if (failures.length > 0) {
  console.error(`axis AA contract regressions: ${failures.length} red contract(s)`);
  for (const failure of failures) console.error(` - ${failure.name}`);
  process.exitCode = 1;
} else {
  console.log('axis AA contract regressions: all contracts passed');
}
