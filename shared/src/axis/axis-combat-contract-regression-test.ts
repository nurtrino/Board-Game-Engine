import assert from 'node:assert/strict';
import { applyAxisAction, type AxisAction, type AxisUnitPick } from './actions.js';
import { axisPieceSelectionSignature } from './physical.js';
import { indexMap, type AxisMap } from './map.js';
import {
  axisViewFor,
  createAxis,
  unitCount,
  type AxisState,
  type SetupData,
  type UnitStack,
} from './state.js';
import type { PowerKey, UnitKey } from './config.js';

const MAP: AxisMap = {
  territories: [
    {
      id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', isCapital: true,
      center: [0, 0], adj: ['hostile-mid'],
    },
    {
      id: 'hostile-mid', name: 'Hostile Mid', ipc: 1, originalOwner: 'ussr',
      center: [1, 0], adj: ['home', 'friendly-finish'],
    },
    {
      id: 'friendly-finish', name: 'Friendly Finish', ipc: 2, originalOwner: 'germany',
      center: [2, 0], adj: ['hostile-mid'],
    },
    {
      id: 'attack-a', name: 'Attack A', ipc: 1, originalOwner: 'germany',
      center: [0, 2], adj: ['battle-target'],
    },
    {
      id: 'attack-b', name: 'Attack B', ipc: 1, originalOwner: 'germany',
      center: [2, 2], adj: ['battle-target'],
    },
    {
      id: 'battle-target', name: 'Battle Target', ipc: 2, originalOwner: 'ussr',
      center: [1, 2], adj: ['attack-a', 'attack-b'],
    },
    {
      id: 'air-landing', name: 'Air Landing', ipc: 1, originalOwner: 'germany',
      center: [2, 4], adj: [], coastTo: ['sz-safe'],
    },
  ],
  seaZones: [
    { id: 'sz-shared', n: 1, center: [0, 4], adj: ['sz-safe'] },
    { id: 'sz-safe', n: 2, center: [1, 4], adj: ['sz-shared'], coastTo: ['air-landing'] },
    { id: 'sz-origin', n: 3, center: [3, 4], adj: ['sz-target'] },
    { id: 'sz-target', n: 4, center: [4, 4], adj: ['sz-origin'] },
  ],
  canals: [],
};

const idx = indexMap(MAP);
const CONTROL: SetupData['control'] = {
  home: 'germany',
  'hostile-mid': 'ussr',
  'friendly-finish': 'germany',
  'attack-a': 'germany',
  'attack-b': 'germany',
  'battle-target': 'ussr',
  'air-landing': 'germany',
};

function fresh(units: Record<string, UnitStack[]>): AxisState {
  const state = createAxis(MAP, { control: CONTROL, units }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 4101,
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

function finishAsDefenderWin(state: AxisState): void {
  const combat = state.combat;
  assert.ok(combat, 'ordinary attack created a combat');
  for (const unit of combat.battle.attacker) unit.hp = 0;
  combat.battle.status = 'defender_won';
  combat.battle.decision = null;
  combat.battle.queue = [];
  combat.battle.pendingOnAttacker = [];
  combat.battle.pendingOnDefender = [];
  combat.confirmed = { attacker: false, defender: false };
  state.pendings = [
    { id: state.pendingSeq++, power: 'germany', kind: 'battle-continue', data: { side: 'attacker' } },
    { id: state.pendingSeq++, power: 'ussr', kind: 'battle-continue', data: { side: 'defender' } },
  ];
  const target = { combatId: combat.id, visualSeq: combat.visualSeq };
  assert.equal(act(state, 'germany', { type: 'battleContinue', ...target }).ok, true);
  assert.equal(act(state, 'ussr', { type: 'battleContinue', ...target }).ok, true);
  assert.equal(state.phase, 'combatMove');
}

contract('an ordinary space cannot be attacked twice in one turn, and rejection is atomic', () => {
  const state = fresh({
    'attack-a': [{ power: 'germany', key: 'infantry', count: 1 }],
    'attack-b': [{ power: 'germany', key: 'infantry', count: 1 }],
    'battle-target': [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  const first = act(state, 'germany', {
    type: 'attack',
    target: 'battle-target',
    forces: [{
      from: 'attack-a',
      units: [exactPick(state, 'attack-a', 'germany', 'infantry', [0])],
    }],
  });
  assert.equal(first.ok, true, first.error);
  finishAsDefenderWin(state);
  assert.ok(state.contested.includes('battle-target'));

  const before = snapshot(state);
  const repeated = act(state, 'germany', {
    type: 'attack',
    target: 'battle-target',
    forces: [{
      from: 'attack-b',
      units: [exactPick(state, 'attack-b', 'germany', 'infantry', [0])],
    }],
  });
  assert.deepEqual(
    { ok: repeated.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'a resolved ordinary battle permanently closes that space to reinforcements this turn',
  );
});

contract('a transport cannot initiate a sea battle without a unit that has attack value', () => {
  const state = fresh({
    'sz-origin': [{ power: 'germany', key: 'transport', count: 1 }],
    'sz-target': [{ power: 'uk', key: 'destroyer', count: 1 }],
  });
  const before = snapshot(state);
  const result = act(state, 'germany', {
    type: 'attack',
    target: 'sz-target',
    forces: [{
      from: 'sz-origin',
      units: [exactPick(state, 'sz-origin', 'germany', 'transport', [0])],
    }],
  });
  assert.deepEqual(
    { ok: result.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'transport-only attack rejection must precede all board mutation',
  );
});

contract('ships already sharing a hostile zone may conduct combat without moving', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'destroyer', count: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  });
  const result = act(state, 'germany', {
    type: 'attack',
    target: 'sz-shared',
    forces: [{
      from: 'sz-shared',
      units: [exactPick(state, 'sz-shared', 'germany', 'destroyer', [0])],
    }],
  });
  assert.deepEqual(
    {
      ok: result.ok,
      phase: state.phase,
      attackers: state.combat?.battle.attacker.map((unit) => unit.key),
      ingress: state.combat?.battle.attacker[0]?.ingressFrom,
    },
    { ok: true, phase: 'battle', attackers: ['destroyer'], ingress: undefined },
    'remaining in the shared zone establishes combat but no retreat route',
  );
});

contract('same-zone combat requires every own active hull and loose aircraft, but excludes allied and bound units', () => {
  const units: Record<string, UnitStack[]> = {
    'sz-shared': [
      { power: 'germany', key: 'destroyer', count: 2 },
      {
        power: 'germany', key: 'carrier', count: 1,
        cargo: [{ power: 'italy', key: 'fighter', count: 1 }],
      },
      { power: 'germany', key: 'fighter', count: 1 },
      { power: 'germany', key: 'bomber', count: 1 },
      {
        power: 'germany', key: 'transport', count: 1,
        cargo: [{ power: 'germany', key: 'infantry', count: 1 }],
      },
      { power: 'italy', key: 'cruiser', count: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  };
  const partial = fresh(units);
  const before = snapshot(partial);
  const rejected = act(partial, 'germany', {
    type: 'attack',
    target: 'sz-shared',
    forces: [{
      from: 'sz-shared',
      units: [exactPick(partial, 'sz-shared', 'germany', 'destroyer', [0])],
    }],
  });
  assert.deepEqual(
    { ok: rejected.ok, unchanged: snapshot(partial) === before },
    { ok: false, unchanged: true },
    'a highlighted subset rejects atomically instead of auto-selecting matching or neighboring pieces',
  );

  const complete = fresh(units);
  const accepted = act(complete, 'germany', {
    type: 'attack',
    target: 'sz-shared',
    forces: [{
      from: 'sz-shared',
      units: [
        exactPick(complete, 'sz-shared', 'germany', 'destroyer', [0, 1]),
        exactPick(complete, 'sz-shared', 'germany', 'carrier', [0]),
        exactPick(complete, 'sz-shared', 'germany', 'fighter', [0]),
        exactPick(complete, 'sz-shared', 'germany', 'bomber', [0]),
        exactPick(complete, 'sz-shared', 'germany', 'transport', [0]),
      ],
    }],
  });
  assert.equal(accepted.ok, true, accepted.error);
  const attackers = complete.combat?.battle.attacker ?? [];
  assert.deepEqual(
    attackers.map((unit) => unit.key).sort(),
    ['bomber', 'carrier', 'destroyer', 'destroyer', 'fighter', 'transport'],
    'every explicitly selected active-power ship and loose aircraft joins once',
  );
  assert.equal(
    attackers.some((unit) => unit.power === 'italy'),
    false,
    'the allied cruiser and carrier guest do not join Germany\'s attack',
  );
  assert.equal(
    attackers.some((unit) => unit.key === 'infantry'),
    false,
    'transport cargo remains bound to its hull',
  );
  assert.equal(unitCount(complete, 'sz-shared', 'italy', 'cruiser'), 1);
});

contract('electing same-zone combat against only submarines and transports still requires every own active piece', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'destroyer', count: 2 },
      { power: 'germany', key: 'fighter', count: 1 },
      { power: 'uk', key: 'submarine', count: 1 },
      { power: 'uk', key: 'transport', count: 1 },
    ],
  });
  const before = snapshot(state);
  const result = act(state, 'germany', {
    type: 'attack',
    target: 'sz-shared',
    forces: [{
      from: 'sz-shared',
      units: [exactPick(state, 'sz-shared', 'germany', 'destroyer', [0])],
    }],
  });
  assert.deepEqual(
    { ok: result.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'submarine/transport-only enemies do not permit a partial same-zone force or automatic selection',
  );
});

contract('leaving and returning to a shared sea zone establishes the exact retreat route', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'destroyer', count: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  });
  const result = act(state, 'germany', {
    type: 'attack',
    target: 'sz-shared',
    forces: [{
      from: 'sz-shared',
      via: 'sz-safe',
      units: [exactPick(state, 'sz-shared', 'germany', 'destroyer', [0])],
    }],
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(state.combat?.battle.attacker[0]?.ingressFrom, 'sz-safe');
  state.combat!.battle.decision = { type: 'retreat', side: 'attacker' };
  assert.deepEqual(
    axisViewFor(state, idx).combat?.retreatPolicy?.destinations,
    ['sz-safe'],
    'the explicit leave-and-return route is the only retreat destination',
  );
});

contract('a fleet may escape a co-occupied hostile zone during Combat Move', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'destroyer', count: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  });
  // Contract decision: reuse the existing `move` action during Combat Move
  // when its origin is co-occupied and its destination is friendly. No new
  // wire action is required; the reducer must apply Combat-Move timing.
  const result = act(state, 'germany', {
    type: 'move',
    from: 'sz-shared',
    to: 'sz-safe',
    units: [exactPick(state, 'sz-shared', 'germany', 'destroyer', [0])],
  });
  assert.deepEqual(
    {
      ok: result.ok,
      phase: state.phase,
      escaped: unitCount(state, 'sz-safe', 'germany', 'destroyer'),
      enemyRemains: unitCount(state, 'sz-shared', 'uk', 'cruiser'),
    },
    { ok: true, phase: 'combatMove', escaped: 1, enemyRemains: 1 },
  );
});

contract('own aircraft may escape a shared hostile sea zone to a presently friendly landing', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'carrier', count: 1 },
      { power: 'germany', key: 'fighter', count: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  });
  const result = act(state, 'germany', {
    type: 'move',
    from: 'sz-shared',
    to: 'air-landing',
    units: [exactPick(state, 'sz-shared', 'germany', 'fighter', [0])],
  });
  assert.deepEqual(
    {
      ok: result.ok,
      phase: state.phase,
      landed: unitCount(state, 'air-landing', 'germany', 'fighter'),
      carrierRemains: unitCount(state, 'sz-shared', 'germany', 'carrier'),
    },
    { ok: true, phase: 'combatMove', landed: 1, carrierRemains: 1 },
  );
});

contract('a carrier and its loose fighter may escape a shared hostile sea zone together', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'carrier', count: 1 },
      { power: 'germany', key: 'fighter', count: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  });
  const result = act(state, 'germany', {
    type: 'move',
    from: 'sz-shared',
    to: 'sz-safe',
    units: [
      exactPick(state, 'sz-shared', 'germany', 'carrier', [0]),
      exactPick(state, 'sz-shared', 'germany', 'fighter', [0]),
    ],
  });
  assert.deepEqual(
    {
      ok: result.ok,
      phase: state.phase,
      carrier: unitCount(state, 'sz-safe', 'germany', 'carrier'),
      fighter: unitCount(state, 'sz-safe', 'germany', 'fighter'),
      enemyRemains: unitCount(state, 'sz-shared', 'uk', 'cruiser'),
    },
    { ok: true, phase: 'combatMove', carrier: 1, fighter: 1, enemyRemains: 1 },
  );
});

contract('Combat Move cannot end while a still-available own piece shares a zone with an enemy surface warship', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'destroyer', count: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  });
  const before = snapshot(state);
  const result = act(state, 'germany', { type: 'endPhase' });
  assert.deepEqual(
    { ok: result.ok, unchanged: snapshot(state) === before },
    { ok: false, unchanged: true },
    'the player must explicitly fight or move every active-power piece out first',
  );
});

contract('spent aircraft in a resolved hostile sea battle advance to their Noncombat landing instead of deadlocking', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'fighter', count: 1, moved: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  });
  const result = act(state, 'germany', { type: 'endPhase' });
  assert.equal(result.ok, true, result.error);
  assert.equal(state.phase, 'noncombat');
  assert.equal(state.board['sz-shared']?.[0]?.moved, undefined, 'the fighter receives its landing move');
});

contract('enemy-only submarines and transports do not block the end of Combat Move', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'destroyer', count: 1 },
      { power: 'uk', key: 'submarine', count: 1 },
      { power: 'uk', key: 'transport', count: 1 },
    ],
  });
  const result = act(state, 'germany', { type: 'endPhase' });
  assert.equal(result.ok, true, result.error);
  assert.equal(state.phase, 'noncombat');
});

contract('a transport already sharing a zone with an enemy surface ship must resolve that battle', () => {
  const state = fresh({
    'sz-shared': [
      { power: 'germany', key: 'transport', count: 1 },
      { power: 'uk', key: 'cruiser', count: 1 },
    ],
  });
  const result = act(state, 'germany', {
    type: 'attack',
    target: 'sz-shared',
    forces: [{
      from: 'sz-shared',
      units: [exactPick(state, 'sz-shared', 'germany', 'transport', [0])],
    }],
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(state.phase, 'battle');
  assert.equal(state.combat?.battle.status, 'defender_won');
  assert.equal(state.combat?.battle.attacker[0]?.key, 'transport');
  assert.equal(state.combat?.battle.attacker[0]?.hp, 0, 'the mandatory defenseless transport is swept');
  assert.equal(state.combat?.battle.defender[0]?.hp, 1);
});

function expectFriendlyEndingBlitz(destination: 'friendly-finish' | 'home'): void {
  const state = fresh({ home: [{ power: 'germany', key: 'tank', count: 1 }] });
  // Contract decision: the existing routed `move` payload also represents a
  // non-battle Combat Move. The hostile intermediate flips and the tank ends
  // spent in a friendly destination; no synthetic battle is created.
  const result = act(state, 'germany', {
    type: 'move',
    from: 'home',
    via: 'hostile-mid',
    to: destination,
    units: [exactPick(state, 'home', 'germany', 'tank', [0])],
  });
  const tank = (state.board[destination] ?? []).find((stack) =>
    stack.power === 'germany' && stack.key === 'tank');
  assert.deepEqual(
    {
      ok: result.ok,
      phase: state.phase,
      intermediate: state.control['hostile-mid'],
      tankCount: tank?.count ?? 0,
      tankMoved: tank?.moved ?? 0,
      combat: state.combat,
    },
    {
      ok: true,
      phase: 'combatMove',
      intermediate: 'germany',
      tankCount: 1,
      tankMoved: 1,
      combat: null,
    },
  );
}

contract('a tank may blitz through empty hostile land and end in friendly land', () => {
  expectFriendlyEndingBlitz('friendly-finish');
});

contract('a tank may blitz through empty hostile land and return to its origin', () => {
  expectFriendlyEndingBlitz('home');
});

if (failures.length > 0) {
  console.error(`axis combat contract regressions: ${failures.length} red contract(s)`);
  for (const failure of failures) console.error(` - ${failure.name}`);
  process.exitCode = 1;
} else {
  console.log('axis combat contract regressions: all contracts passed');
}
