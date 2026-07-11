import assert from 'node:assert/strict';
import { applyAxisAction, type AxisAction } from './actions.js';
import { indexMap, type AxisMap } from './map.js';
import {
  addUnits,
  axisViewFor,
  createAxis,
  normalizeAxisState,
  operatingPower,
  unitCount,
  type AxisState,
  type SetupData,
  type UnitStack,
} from './state.js';
import { TURN_ORDER, type PowerKey } from './config.js';

const MAP: AxisMap = {
  territories: [
    { id: 'coast', name: 'Coast', ipc: 2, originalOwner: 'uk', center: [2, 1], adj: [], coastTo: ['sz-battle'] },
    { id: 'coast-2', name: 'Second Coast', ipc: 2, originalOwner: 'uk', center: [2, 4], adj: [], coastTo: ['sz-battle-2'] },
  ],
  seaZones: [
    { id: 'sz-origin', n: 1, center: [0, 0], adj: ['sz-battle'] },
    { id: 'sz-battle', n: 2, center: [1, 0], adj: ['sz-origin', 'sz-adj'], coastTo: ['coast'] },
    { id: 'sz-adj', n: 3, center: [2, 0], adj: ['sz-battle'] },
    { id: 'sz-origin-2', n: 4, center: [0, 3], adj: ['sz-battle-2'] },
    { id: 'sz-battle-2', n: 5, center: [1, 3], adj: ['sz-origin-2'], coastTo: ['coast-2'] },
  ],
  canals: [],
};
const idx = indexMap(MAP);
const CONTROL: SetupData['control'] = { coast: 'uk', 'coast-2': 'uk' };

function fresh(
  units: Record<string, UnitStack[]>,
  control: SetupData['control'] = CONTROL,
  seed = 83,
): AxisState {
  const state = createAxis(MAP, { units, control }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed,
  });
  state.phase = 'combatMove';
  return state;
}

const act = (state: AxisState, seat: PowerKey, action: AxisAction) =>
  applyAxisAction(state, idx, seat, action);
const durable = (state: AxisState): string => JSON.stringify(state);

function declare(state: AxisState, target = 'sz-battle', from = 'sz-origin'): void {
  const result = act(state, 'germany', {
    type: 'attack',
    target,
    forces: [{ from, units: [{ key: 'destroyer', count: 1 }] }],
  });
  assert.equal(result.ok, true, result.error);
}

/** Finish without depending on RNG while retaining exact physical survivors. */
function finishDefenderWin(state: AxisState, sunkCarrierRefs: readonly string[] = []): void {
  const combat = state.combat!;
  for (const unit of combat.battle.attacker) unit.hp = 0;
  for (const unit of combat.battle.defender) {
    if (unit.carrierRef && sunkCarrierRefs.includes(unit.carrierRef)) unit.hp = 0;
  }
  combat.battle.status = 'defender_won';
  combat.battle.decision = null;
  combat.battle.queue = [];
  combat.battle.pendingOnAttacker = [];
  combat.battle.pendingOnDefender = [];
  combat.confirmed = { attacker: false, defender: false };
  const defender = combat.battle.defender.find((unit) => unit.hp > 0)?.power as PowerKey;
  state.pendings = [
    { id: state.pendingSeq++, power: 'germany', kind: 'battle-continue', data: { side: 'attacker' } },
    { id: state.pendingSeq++, power: defender, kind: 'battle-continue', data: { side: 'defender' } },
  ];
  assert.equal(act(state, 'germany', { type: 'battleContinue' }).ok, true);
  assert.equal(act(state, defender, { type: 'battleContinue' }).ok, true);
  assert.equal(state.phase, 'combatMove');
}

// Every carrier hull is physical and durable through normalize and movement.
{
  const state = fresh({
    'sz-origin': [
      { power: 'germany', key: 'carrier', count: 2 },
      { power: 'germany', key: 'fighter', count: 2 },
    ],
  });
  const carriers = state.board['sz-origin'].filter((stack) => stack.key === 'carrier');
  assert.equal(carriers.length, 2);
  assert.equal(new Set(carriers.map((stack) => stack.carrierRef)).size, 2);
  const once = durable(state);
  normalizeAxisState(state);
  assert.equal(durable(state), once, 'exact carrier migration is idempotent on reconnect');
  state.phase = 'noncombat';
  const ref = carriers[0]!.carrierRef!;
  assert.equal(act(state, 'germany', {
    type: 'move', from: 'sz-origin', to: 'sz-battle',
    units: [{ key: 'carrier', count: 1 }],
  }).ok, true);
  assert.equal(state.board['sz-battle'].find((stack) => stack.key === 'carrier')?.carrierRef, ref);
}

// Reconnect migration cannot recycle the exact identity of a carrier that was
// sunk underneath a still-pending defending fighter, even if an old save lost
// its monotonic hull counter.
{
  const state = fresh({});
  const lostHomeRef = `carrier-hull:${state.seed}:1`;
  state.pendingDefendingCarrierFighters = [{
    ref: `def-carrier-fighter:${state.seed}:1`,
    power: 'usa',
    originSeaZone: 'sz-battle',
    homeCarrierRef: lostHomeRef,
  }];
  delete (state as Partial<AxisState>).carrierHullSeq;
  normalizeAxisState(state);
  addUnits(state, 'sz-origin', 'germany', 'carrier', 1);
  const replacement = state.board['sz-origin']?.find((stack) => stack.key === 'carrier');
  assert.ok(replacement?.carrierRef);
  assert.notEqual(replacement.carrierRef, lostHomeRef,
    'a newly allocated hull never aliases the lost exact home named by the pending fighter');
}

// USA and China finish combat separately but restart Noncombat Move in the
// originally chosen order. An intervening emergency queue must advertise and
// resume that first operation, not the combatant that happened to finish last.
{
  const state = fresh({
    'sz-battle': [{ power: 'italy', key: 'carrier', count: 1 }],
  });
  const home = state.board['sz-battle']!.find((stack) => stack.key === 'carrier')!;
  state.turnIdx = TURN_ORDER['1941'].indexOf('usa');
  state.turnStartSea = { power: 'usa', hostile: [] };
  state.phase = 'combatMove';
  state.usaOperationFirst = 'usa';
  state.usaOperationIndex = 1; // China is the second and final combat block.
  const fighterRef = `def-carrier-fighter:${state.seed}:resume`;
  state.pendingDefendingCarrierFighters = [{
    ref: fighterRef,
    power: 'germany',
    originSeaZone: 'sz-battle',
    homeCarrierRef: home.carrierRef!,
  }];

  const activated = act(state, 'usa', { type: 'endPhase' });
  assert.equal(activated.ok, true, activated.error);
  assert.equal(state.defendingCarrierLanding?.resumeCombatant, 'usa');
  assert.equal(state.phase, 'combatMove');
  assert.equal(act(state, 'germany', {
    type: 'defendingCarrierLanding', fighterRef,
    kind: 'carrier', carrierRef: home.carrierRef!,
  }).ok, true);
  assert.equal(state.phase, 'noncombat');
  assert.equal(state.usaOperationIndex, 0);
  assert.equal(operatingPower(state), 'usa',
    'the chosen first USA operation owns the first ordinary noncombat controls');
  assert.match(state.log.at(-1)?.text ?? '', /United States begins ordinary noncombat/i);
}

// A surviving allied guest stays off-board until all combat ends, then its
// owner receives the compulsory exact-home choice. Every other action is gated.
{
  const state = fresh({
    'sz-origin': [{ power: 'germany', key: 'destroyer', count: 1 }],
    'sz-battle': [{
      power: 'uk', key: 'carrier', count: 1,
      cargo: [{ power: 'usa', key: 'fighter', count: 1 }],
    }],
  });
  const homeRef = state.board['sz-battle'].find((stack) => stack.key === 'carrier')!.carrierRef!;
  declare(state);
  const launched = state.combat!.battle.defender.find((unit) => unit.key === 'fighter')!;
  assert.ok(launched.defendingCarrierFighterRef);
  assert.equal(launched.homeCarrierRef, homeRef);
  finishDefenderWin(state);
  assert.equal(state.pendingDefendingCarrierFighters.length, 1);
  assert.equal(state.defendingCarrierLanding, null, 'landing decisions stay hidden while Combat Move remains open');
  assert.equal(unitCount(state, 'sz-battle', 'usa', 'fighter'), 0);

  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, true);
  assert.equal(state.phase, 'combatMove', 'ordinary noncombat has not begun while the queue is active');
  const queue = state.defendingCarrierLanding!;
  const view = axisViewFor(state, idx);
  assert.equal(view.defendingCarrierLanding?.progress.status, 'decision');
  if (view.defendingCarrierLanding?.progress.status !== 'decision') throw new Error('expected exact landing decision');
  assert.equal(view.defendingCarrierLanding.progress.decision.owner, 'usa');
  assert.deepEqual(view.defendingCarrierLanding.progress.decision.options.map((option) =>
    option.kind === 'carrier' ? [option.carrierRef, option.ruleStep] : option.kind), [[homeRef, 'home-carrier']]);
  const durableFighterRef = queue.snapshot.fighters[0]!.ref;
  (view.defendingCarrierLanding.snapshot.fighters[0] as { ref: string }).ref = 'view-only';
  (view.defendingCarrierLanding.choices as unknown[]).push({ fighterRef: 'view-only', kind: 'destroy' });
  assert.equal(queue.snapshot.fighters[0]!.ref, durableFighterRef);
  assert.equal(queue.choices.length, 0, 'view snapshot and choice arrays are deep clones');

  const blockedBefore = durable(state);
  assert.equal(act(state, 'germany', {
    type: 'defendingCarrierLanding', fighterRef: launched.defendingCarrierFighterRef!,
    kind: 'carrier', carrierRef: homeRef,
  }).ok, false, 'the acting player cannot decide for an enemy fighter owner');
  assert.equal(durable(state), blockedBefore);
  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, false);
  assert.equal(durable(state), blockedBefore, 'phase advance is atomically blocked by the exact queue');

  const restored = JSON.parse(durable(state)) as AxisState;
  normalizeAxisState(restored);
  assert.equal(axisViewFor(restored, idx).defendingCarrierLanding?.progress.status, 'decision');
  const restoredBefore = durable(restored);
  const stale = act(restored, 'usa', {
    type: 'defendingCarrierLanding', fighterRef: 'wrong-fighter', kind: 'carrier', carrierRef: homeRef,
  });
  assert.equal(stale.ok, false);
  assert.equal(durable(restored), restoredBefore);
  assert.equal(act(restored, 'usa', {
    type: 'defendingCarrierLanding', fighterRef: launched.defendingCarrierFighterRef!,
    kind: 'carrier', carrierRef: homeRef,
  }).ok, true);
  assert.equal(restored.phase, 'noncombat');
  assert.equal(restored.defendingCarrierLanding, null);
  const carrier = restored.board['sz-battle'].find((stack) => stack.carrierRef === homeRef)!;
  assert.equal(carrier.cargo?.find((cargo) => cargo.power === 'usa' && cargo.key === 'fighter')?.count, 1);
  assert.equal(unitCount(restored, 'sz-battle', 'usa', 'fighter'), 0, 'allied guest is nested exactly once');

}

// Own loose fighters are assigned to exact home decks deterministically at
// battle creation, including a durable preferred base ref.
{
  const state = fresh({
    'sz-origin': [{ power: 'germany', key: 'destroyer', count: 1 }],
    'sz-battle': [
      { power: 'uk', key: 'carrier', count: 2 },
      { power: 'uk', key: 'fighter', count: 3 },
    ],
  });
  const refs = state.board['sz-battle'].filter((stack) => stack.key === 'carrier')
    .map((stack) => stack.carrierRef!).sort();
  declare(state);
  const homes = state.combat!.battle.defender.filter((unit) => unit.key === 'fighter')
    .map((unit) => unit.homeCarrierRef!);
  assert.deepEqual(homes, [refs[0], refs[0], refs[1]],
    'loose fighters fill deterministic exact decks without pooled capacity');
  assert.equal(new Set(state.combat!.battle.defender.filter((unit) => unit.key === 'fighter')
    .map((unit) => unit.defendingCarrierFighterRef)).size, 3);
}

// A sunk home carrier falls back to the exact same-zone deck. Coalition deck
// capacity is replayed across the choice and own fighters remain loose/based.
{
  const state = fresh({
    'sz-origin': [{ power: 'germany', key: 'destroyer', count: 1 }],
    'sz-battle': [
      {
        power: 'uk', key: 'carrier', count: 1,
        cargo: [{ power: 'usa', key: 'fighter', count: 1 }],
      },
      { power: 'uk', key: 'carrier', count: 1 },
    ],
  });
  const carrierUnitsBefore = state.board['sz-battle'].filter((stack) => stack.key === 'carrier');
  const homeRef = carrierUnitsBefore[0]!.carrierRef!;
  const fallbackRef = carrierUnitsBefore[1]!.carrierRef!;
  declare(state);
  const fighterRef = state.combat!.battle.defender.find((unit) => unit.key === 'fighter')!.defendingCarrierFighterRef!;
  finishDefenderWin(state, [homeRef]);
  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, true);
  const progress = axisViewFor(state, idx).defendingCarrierLanding?.progress;
  if (!progress || progress.status !== 'decision') throw new Error('expected same-zone fallback');
  assert.deepEqual(progress.decision.options.map((option) => option.kind === 'carrier' && option.carrierRef), [fallbackRef]);
  assert.equal(act(state, 'usa', {
    type: 'defendingCarrierLanding', fighterRef, kind: 'carrier', carrierRef: fallbackRef,
  }).ok, true);
  assert.equal(state.board['sz-battle'].find((stack) => stack.carrierRef === fallbackRef)
    ?.cargo?.find((cargo) => cargo.power === 'usa')?.count, 1);
}

// A destroyed home with no same-zone deck gets only direct one-space options.
// An adjacent carrier already filled by own loose fighters is not offered.
{
  const state = fresh({
    'sz-origin': [{ power: 'germany', key: 'destroyer', count: 1 }],
    'sz-battle': [{
      power: 'uk', key: 'carrier', count: 1,
      cargo: [{ power: 'usa', key: 'fighter', count: 1 }],
    }],
    'sz-adj': [
      { power: 'usa', key: 'carrier', count: 1 },
      { power: 'usa', key: 'fighter', count: 2 },
    ],
  });
  const homeRef = state.board['sz-battle'].find((stack) => stack.key === 'carrier')!.carrierRef!;
  declare(state);
  const fighterRef = state.combat!.battle.defender.find((unit) => unit.key === 'fighter')!.defendingCarrierFighterRef!;
  finishDefenderWin(state, [homeRef]);
  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, true);
  const progress = axisViewFor(state, idx).defendingCarrierLanding?.progress;
  if (!progress || progress.status !== 'decision') throw new Error('expected one-space landing');
  assert.deepEqual(progress.decision.options.map((option) => option.kind), ['territory'],
    'full adjacent own deck is excluded from coalition capacity');
  assert.equal(act(state, 'usa', {
    type: 'defendingCarrierLanding', fighterRef, kind: 'territory', territory: 'coast',
  }).ok, true);
  assert.equal(unitCount(state, 'coast', 'usa', 'fighter'), 1);
}

// With no legal direct land or deck, destruction is an explicit owner action.
{
  const state = fresh({
    'sz-origin': [{ power: 'germany', key: 'destroyer', count: 1 }],
    'sz-battle': [{
      power: 'uk', key: 'carrier', count: 1,
      cargo: [{ power: 'usa', key: 'fighter', count: 1 }],
    }],
  }, { coast: 'germany', 'coast-2': 'uk' });
  const homeRef = state.board['sz-battle'].find((stack) => stack.key === 'carrier')!.carrierRef!;
  declare(state);
  const fighterRef = state.combat!.battle.defender.find((unit) => unit.key === 'fighter')!.defendingCarrierFighterRef!;
  finishDefenderWin(state, [homeRef]);
  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, true);
  const progress = axisViewFor(state, idx).defendingCarrierLanding?.progress;
  if (!progress || progress.status !== 'decision') throw new Error('expected forced loss');
  assert.deepEqual(progress.decision.options.map((option) => option.kind), ['destroy']);
  assert.equal(act(state, 'usa', {
    type: 'defendingCarrierLanding', fighterRef, kind: 'destroy',
  }).ok, true);
  assert.equal(state.phase, 'noncombat');
  assert.equal(unitCount(state, 'coast', 'usa', 'fighter'), 0);
}

// Pending fighters do not prevent another declared combat; the single queue is
// activated only when the acting player explicitly ends all Combat Move work.
{
  const state = fresh({
    'sz-origin': [{ power: 'germany', key: 'destroyer', count: 1 }],
    'sz-battle': [{ power: 'uk', key: 'carrier', count: 1, cargo: [{ power: 'usa', key: 'fighter', count: 1 }] }],
    'sz-origin-2': [{ power: 'germany', key: 'destroyer', count: 1 }],
    'sz-battle-2': [{ power: 'uk', key: 'carrier', count: 1, cargo: [{ power: 'uk', key: 'fighter', count: 1 }] }],
  });
  declare(state);
  finishDefenderWin(state);
  assert.equal(state.pendingDefendingCarrierFighters.length, 1);
  declare(state, 'sz-battle-2', 'sz-origin-2');
  finishDefenderWin(state);
  assert.equal(state.pendingDefendingCarrierFighters.length, 2);
  assert.equal(state.defendingCarrierLanding, null);
  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, true);
  const activated = (state as AxisState).defendingCarrierLanding;
  assert.equal(activated?.snapshot.fighters.length, 2);

  const first = axisViewFor(state, idx).defendingCarrierLanding?.progress;
  if (!first || first.status !== 'decision') throw new Error('expected first owner-routed landing');
  assert.equal(first.decision.owner, 'usa');
  const firstOption = first.decision.options[0];
  if (!firstOption || firstOption.kind !== 'carrier') throw new Error('expected exact surviving home carrier');
  const beforeWrongOwner = durable(state);
  assert.equal(act(state, 'uk', {
    type: 'defendingCarrierLanding', fighterRef: first.decision.fighter.ref,
    kind: 'carrier', carrierRef: firstOption.carrierRef,
  }).ok, false, 'a later fighter owner cannot resolve the current owner prompt');
  assert.equal(durable(state), beforeWrongOwner);
  assert.equal(act(state, 'usa', {
    type: 'defendingCarrierLanding', fighterRef: first.decision.fighter.ref,
    kind: 'carrier', carrierRef: firstOption.carrierRef,
  }).ok, true);

  const restored = JSON.parse(durable(state)) as AxisState;
  normalizeAxisState(restored);
  const second = axisViewFor(restored, idx).defendingCarrierLanding?.progress;
  if (!second || second.status !== 'decision') throw new Error('expected second owner-routed landing');
  assert.equal(second.decision.owner, 'uk',
    'the authoritative prompt transfers to the next exact fighter owner after reconnect');
  const secondOption = second.decision.options[0];
  if (!secondOption || secondOption.kind !== 'carrier') throw new Error('expected second exact home carrier');
  const beforeSecondWrongOwner = durable(restored);
  assert.equal(act(restored, 'usa', {
    type: 'defendingCarrierLanding', fighterRef: second.decision.fighter.ref,
    kind: 'carrier', carrierRef: secondOption.carrierRef,
  }).ok, false);
  assert.equal(durable(restored), beforeSecondWrongOwner,
    'owner routing remains atomic after a partially resolved queue reconnects');
  assert.equal(act(restored, 'uk', {
    type: 'defendingCarrierLanding', fighterRef: second.decision.fighter.ref,
    kind: 'carrier', carrierRef: secondOption.carrierRef,
  }).ok, true);
  assert.equal(restored.defendingCarrierLanding, null);
  assert.equal(restored.phase, 'noncombat',
    'ordinary noncombat begins only after every fighter owner has resolved its landing');
}

console.log('axis defending carrier landing actions: all assertions passed');
