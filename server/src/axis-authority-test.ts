import assert from 'node:assert/strict';
import type { AxisAction, SeatColor } from '@bge/shared';
import {
  axisBattleActionGeneration,
  axisBattleContinueCombatId,
  axisBattleRollCombatId,
  authorizeAxisAction,
  controlledAxisPowers,
  hasReadyAxisBattleWatcher,
  isAxisBattleContinue,
  isAxisBattleRoll,
  isAxisBattleVisualGateAction,
  isAxisBattleVisualMutation,
  resolveActionSeat,
} from './axis-authority.js';

const action: AxisAction = { type: 'endPhase' };
const players = (...colors: SeatColor[]) => colors.map((color) => ({ color }));

{
  const table = players('germany', 'ussr');
  assert.deepEqual(controlledAxisPowers(table, 1), ['ussr'], 'a non-host recipient controls only their selected power');
  const host = controlledAxisPowers(table, 0);
  assert.equal(host.includes('germany'), true, 'the host controls their selected power');
  assert.equal(host.includes('ussr'), false, 'the host cannot control another player\'s power');
  assert.equal(host.includes('uk'), true, 'the host covers an unseated power');
}

assert.deepEqual(
  new Set(controlledAxisPowers(players('germany'), 0)),
  new Set(['germany', 'ussr', 'japan', 'uk', 'italy', 'usa']),
  'a solo host controls all six powers',
);
assert.deepEqual(controlledAxisPowers(players('germany'), null), [], 'a watcher receives no action authority');
assert.deepEqual(controlledAxisPowers(players('red'), 0), [], 'a non-Axis room color cannot acquire Axis authority');

{
  const result = authorizeAxisAction(players('germany', 'ussr'), 1, action);
  assert.equal(result.ok, true, 'an action without asPower uses the player\'s assigned power');
  if (result.ok) assert.equal(result.action.asPower, 'ussr');
}

{
  const result = authorizeAxisAction(players('germany', 'ussr'), 1, { ...action, asPower: 'germany' });
  assert.equal(result.ok, false, 'a player cannot impersonate another seated power');
}

{
  const result = authorizeAxisAction(players('germany', 'ussr'), 0, { ...action, asPower: 'ussr' });
  assert.equal(result.ok, false, 'the host cannot override another player\'s assignment');
}

{
  const result = authorizeAxisAction(players('germany', 'ussr'), 0, { ...action, asPower: 'uk' });
  assert.equal(result.ok, true, 'the host can cover an unseated power at a partial table');
}

{
  const result = authorizeAxisAction(players('germany', 'ussr'), 1, { ...action, asPower: 'uk' });
  assert.equal(result.ok, false, 'a non-host cannot claim an unseated power');
}

{
  const result = authorizeAxisAction(players('germany'), 0, { ...action, asPower: 'usa' });
  assert.equal(result.ok, true, 'solo play can drive every otherwise-unseated power');
}

{
  const result = authorizeAxisAction(players('germany'), 0, { ...action, asPower: 'china' });
  assert.equal(result.ok, false, 'China must route through its intended U.S. authority');
}

assert.equal(resolveActionSeat(1, 4, false), 1, 'production ignores dev view impersonation');
assert.equal(resolveActionSeat(null, 4, false), null, 'a production watcher remains unable to act');
assert.equal(resolveActionSeat(1, 4, true), 4, 'the local development harness remains available');

assert.equal(isAxisBattleRoll({ type: 'battleRoll' }), true, 'battle rolls are recognized for the visual gate');
assert.equal(isAxisBattleRoll({ type: 'battleCasualties' }), false, 'other battle actions do not wait on visuals');
assert.equal(isAxisBattleRoll(null), false, 'malformed actions cannot trigger the battle-roll path');
assert.equal(axisBattleRollCombatId({ type: 'battleRoll', combatId: 12 }), 12, 'a roll carries its exact combat target');
assert.equal(axisBattleRollCombatId({ type: 'battleRoll', combatId: Number.NaN }), null, 'non-finite combat targets are rejected');
assert.equal(axisBattleRollCombatId({ type: 'battleRoll', combatId: 1.5 }), null, 'fractional combat targets are rejected');
assert.equal(axisBattleRollCombatId({ type: 'battleRoll' }), null, 'untargeted rolls are rejected');
assert.equal(isAxisBattleContinue({ type: 'battleContinue' }), true, 'terminal continuation is recognized for the visual gate');
assert.equal(axisBattleContinueCombatId({ type: 'battleContinue', combatId: 12 }), 12, 'continuation targets the exact displayed battle');
assert.equal(axisBattleContinueCombatId({ type: 'battleContinue' }), null, 'untargeted continuation is rejected by the room boundary');

for (const type of ['battleRoll', 'battleCasualties', 'battleSubmerge', 'battleRetreat'] as const) {
  const candidate = { type, combatId: 12, visualSeq: 4 };
  assert.equal(isAxisBattleVisualMutation(candidate), true, `${type} starts a new cinematic generation`);
  assert.equal(isAxisBattleVisualGateAction(candidate), true, `${type} waits for the current cinematic generation`);
  assert.deepEqual(axisBattleActionGeneration(candidate), { combatId: 12, visualSeq: 4 }, `${type} targets the exact cinematic state`);
}
assert.equal(isAxisBattleVisualMutation({ type: 'battleContinue', combatId: 12, visualSeq: 4 }), false, 'continuing does not create another visual generation');
assert.equal(isAxisBattleVisualGateAction({ type: 'battleContinue', combatId: 12, visualSeq: 4 }), true, 'continuing still waits for the final cinematic generation');
assert.equal(axisBattleActionGeneration({ type: 'battleRoll', combatId: 12, visualSeq: 3.5 }), null, 'fractional visual generations are rejected');
assert.equal(axisBattleActionGeneration({ type: 'battleRoll', combatId: 12, visualSeq: -1 }), null, 'negative visual generations are rejected');
assert.equal(axisBattleActionGeneration({ type: 'battleRoll', combatId: 12 }), null, 'untargeted visual generations are rejected');

assert.equal(hasReadyAxisBattleWatcher({ combatId: 12, visualSeq: 3 }, [null, { combatId: 12, visualSeq: 3 }]), true, 'one connected watcher ready for the exact battlefield state unlocks it');
assert.equal(hasReadyAxisBattleWatcher({ combatId: 12, visualSeq: 3 }, [{ combatId: 12, visualSeq: 2 }, { combatId: 11, visualSeq: 3 }]), false, 'stale battle and state acknowledgements do not unlock it');
assert.equal(hasReadyAxisBattleWatcher({ combatId: 12, visualSeq: 3 }, []), false, 'a battle stays locked without a connected ready watcher');
assert.equal(hasReadyAxisBattleWatcher(null, [{ combatId: 12, visualSeq: 3 }]), false, 'readiness never carries across the absence of a battle');

console.log('axis authority: all checks passed');
