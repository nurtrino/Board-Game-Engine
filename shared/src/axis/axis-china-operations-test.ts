import assert from 'node:assert/strict';
import { applyAxisAction, type AxisAction } from './actions.js';
import { TURN_ORDER } from './config.js';
import { AXIS_INDEX, createAxisGame } from './game.js';
import { axisPieceSelectionSignature } from './physical.js';
import { operatingPower, type AxisState } from './state.js';

const act = (state: AxisState, action: AxisAction) => applyAxisAction(state, AXIS_INDEX, 'usa', action);

function usaCombat(first: 'usa' | 'china'): AxisState {
  const state = createAxisGame([], 2026, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard',
  });
  // These operation-order checks skip all combat. Remove the opening US
  // transport trapped with Japan in sz-50 so the mandatory sea-battle rule is
  // not the subject of every phase-transition assertion below.
  state.board['sz-50'] = (state.board['sz-50'] ?? []).filter((stack) => stack.power !== 'usa');
  state.turnIdx = TURN_ORDER['1941'].indexOf('usa');
  state.phase = 'purchase';
  state.chinaGrantPreparedRound = null;
  assert.equal(act(state, { type: 'endPhase' }).ok, true, 'USA purchase ends');
  assert.equal(state.chinaGrant, 3, 'China grant snapshots seven non-Axis Chinese territories at Purchase Units');
  assert.equal(act(state, { type: 'chooseUsOperationOrder', first }).ok, true, 'USA chooses the explicit operation order');
  return state;
}

{
  const state = usaCombat('china');
  assert.equal(operatingPower(state), 'china', 'China operates first when selected');
  assert.equal(act(state, { type: 'chooseUsOperationOrder', first: 'usa' }).ok, false, 'operation order locks for the turn');
  assert.equal(act(state, { type: 'endPhase' }).ok, true, 'China can finish its combat block');
  assert.equal(state.phase, 'combatMove', 'the second combat block remains Combat Move');
  assert.equal(operatingPower(state), 'usa', 'USA follows only after China fully finishes combat');
  assert.equal(act(state, { type: 'endPhase' }).ok, true, 'USA can finish its combat block');
  assert.equal(state.phase, 'noncombat', 'both combat blocks lead to noncombat');
  assert.equal(operatingPower(state), 'china', 'noncombat reuses the chosen China-first order');
  assert.equal(act(state, { type: 'endPhase' }).ok, true, 'China finishes separate noncombat');
  assert.equal(state.phase, 'noncombat', 'USA still receives its separate noncombat block');
  assert.equal(operatingPower(state), 'usa', 'USA follows China in noncombat');
  assert.equal(act(state, { type: 'endPhase' }).ok, true, 'USA finishes separate noncombat');
  assert.equal(state.phase, 'mobilize', 'both noncombat blocks lead to mobilization');
  assert.ok(state.chinaPlacementSpaces.length > 0, 'China placement eligibility is snapshotted on entering mobilization');
}

{
  const state = usaCombat('usa');
  assert.equal(operatingPower(state), 'usa', 'USA-first choice is honored');
  assert.equal(act(state, { type: 'endPhase' }).ok, true);
  assert.equal(operatingPower(state), 'china', 'China follows USA without interleaving');
  assert.equal(act(state, { type: 'endPhase' }).ok, true);
  assert.equal(state.phase, 'noncombat');
  assert.equal(operatingPower(state), 'usa', 'USA-first order carries into noncombat');
}

{
  const state = usaCombat('china');
  state.board.yunnan = [{ power: 'usa', key: 'infantry', count: 1 }];
  state.board.kwangtung = [];
  state.control.yunnan = 'china';
  state.control.kwangtung = 'japan';
  const signature = axisPieceSelectionSignature(state.board.yunnan, 'usa', 'infantry');
  assert.equal(act(state, {
    type: 'attack', target: 'kwangtung',
    forces: [{ from: 'yunnan', units: [{ key: 'infantry', count: 1, ordinals: [0], selectionSig: signature }] }],
  }).ok, false, 'USA pieces cannot interleave into the China combat block');
}

{
  const state = usaCombat('china');
  state.board.yunnan = [{ power: 'china', key: 'infantry', count: 2 }];
  state.board.fukien = [{ power: 'japan', key: 'infantry', count: 1 }];
  state.control.yunnan = 'china';
  state.control.fukien = 'japan';
  const signature = axisPieceSelectionSignature(state.board.yunnan, 'china', 'infantry');
  const declared = act(state, {
    type: 'attack', target: 'fukien',
    forces: [{ from: 'yunnan', units: [{ key: 'infantry', count: 1, ordinals: [1], selectionSig: signature }] }],
  });
  assert.equal(declared.ok, true, `one exact Chinese infantry attacks (${declared.error ?? ''})`);
  assert.equal(state.board.yunnan.find((stack) => stack.power === 'china')?.count, 1, 'exact ordinal moves one piece, never the whole type');
  assert.equal(state.combat?.attacker, 'china', 'battle records China as the separate attacker');
  assert.equal(state.combat?.kind, 'battle', 'China cannot enter the strategic-raid combat kind');
  assert.equal(state.combat?.visualSeq, 0, 'Chinese battle begins at cinematic generation zero');
  const combatId = state.combat!.id;
  assert.equal(applyAxisAction(state, AXIS_INDEX, 'uk', { type: 'battleRoll', combatId, visualSeq: 0 }).ok, false, 'another Allied seat cannot roll for China');
  assert.equal(act(state, { type: 'battleRoll', combatId, visualSeq: 0 }).ok, true, 'USA seat rolls for China');
  assert.equal(state.combat?.visualSeq, 1, 'Chinese roll advances the same visual generation gate');
  assert.equal(act(state, { type: 'battleRoll', combatId, visualSeq: 0 }).ok, false, 'stale Chinese cinematic generation is rejected');
}

{
  const state = usaCombat('china');
  state.board.yunnan = [{ power: 'china', key: 'infantry', count: 1 }];
  state.board.fukien = [];
  state.control.yunnan = 'china';
  state.control.fukien = 'japan';
  const signature = axisPieceSelectionSignature(state.board.yunnan, 'china', 'infantry');
  assert.equal(act(state, {
    type: 'attack', target: 'fukien',
    forces: [{ from: 'yunnan', units: [{ key: 'infantry', count: 1, ordinals: [0], selectionSig: signature }] }],
  }).ok, true, 'China can walk into an empty hostile printed Chinese territory');
  assert.equal(state.control.fukien, 'china', 'ordinary Chinese captures receive a China control marker');
}

{
  const state = usaCombat('china');
  state.powers.usa.techs = ['longRangeAircraft', 'jetFighters'];
  state.board.yunnan = [{ power: 'china', key: 'fighter', count: 1 }];
  state.board.kwangtung = [{ power: 'japan', key: 'infantry', count: 1 }];
  state.control.yunnan = 'china';
  state.control.kwangtung = 'japan';
  const signature = axisPieceSelectionSignature(state.board.yunnan, 'china', 'fighter');
  const declared = act(state, {
    type: 'attack', target: 'kwangtung',
    forces: [{ from: 'yunnan', units: [{ key: 'fighter', count: 1, ordinals: [0], selectionSig: signature }] }],
  });
  assert.equal(declared.ok, true, `Flying Tigers attack inside their region (${declared.error ?? ''})`);
  assert.deepEqual(state.combat?.battle.atkTechs, [], 'Flying Tigers inherit no U.S. technology');
  assert.equal(state.combat?.battle.attacker[0]?.movementSpent, 1, 'Flying Tigers retain exact combat movement spent');
}

{
  const state = usaCombat('china');
  state.board.yunnan = [{ power: 'china', key: 'fighter', count: 1 }];
  state.board.burma = [{ power: 'japan', key: 'infantry', count: 1 }];
  state.control.yunnan = 'china';
  state.control.burma = 'japan';
  const signature = axisPieceSelectionSignature(state.board.yunnan, 'china', 'fighter');
  assert.equal(act(state, {
    type: 'attack', target: 'burma',
    forces: [{ from: 'yunnan', units: [{ key: 'fighter', count: 1, ordinals: [0], selectionSig: signature }] }],
  }).ok, false, 'Flying Tigers cannot leave the Chinese operating region even to return');
  assert.match(act(state, { type: 'sbr', target: 'burma', forces: [{ from: 'yunnan', bombers: 1 }] }).error ?? '', /cannot conduct strategic bombing/i);
  assert.match(act(state, { type: 'load', zone: 'sz-35', territory: 'yunnan', units: [{ key: 'infantry', count: 1 }] }).error ?? '', /cannot load/i);
}

{
  const state = usaCombat('china');
  assert.equal(act(state, { type: 'endPhase' }).ok, true, 'China combat ends');
  assert.equal(act(state, { type: 'endPhase' }).ok, true, 'USA combat ends');
  assert.equal(operatingPower(state), 'china');
  state.board.yunnan = [{ power: 'china', key: 'fighter', count: 1, movementSpent: 3 }];
  state.board.kwangtung = [];
  state.control.yunnan = 'china';
  state.control.kwangtung = 'uk';
  const signature = axisPieceSelectionSignature(state.board.yunnan, 'china', 'fighter');
  const moved = act(state, {
    type: 'move', from: 'yunnan', to: 'kwangtung',
    units: [{ key: 'fighter', count: 1, ordinals: [0], selectionSig: signature }],
  });
  assert.equal(moved.ok, true, `Flying Tigers use only their one remaining movement point (${moved.error ?? ''})`);
  const fighter = state.board.kwangtung.find((stack) => stack.power === 'china' && stack.key === 'fighter');
  assert.equal(fighter?.movementSpent, 4, 'Flying Tigers preserve total movementSpent through noncombat');
}

for (const ukCapitalHeld of [false, true]) {
  const state = usaCombat('china');
  state.powers.uk.capitalHeldBy = ukCapitalHeld ? 'japan' : null;
  state.board.yunnan = [{ power: 'china', key: 'infantry', count: 1 }];
  state.board.kwangtung = [];
  state.control.yunnan = 'china';
  state.control.kwangtung = 'japan';
  const signature = axisPieceSelectionSignature(state.board.yunnan, 'china', 'infantry');
  const walkedIn = act(state, {
    type: 'attack', target: 'kwangtung',
    forces: [{ from: 'yunnan', units: [{ key: 'infantry', count: 1, ordinals: [0], selectionSig: signature }] }],
  });
  assert.equal(walkedIn.ok, true, 'China can occupy empty hostile Kwangtung');
  assert.equal(state.control.kwangtung, ukCapitalHeld ? 'china' : 'uk', 'Kwangtung controller follows London status');
}

{
  const state = usaCombat('usa');
  state.powers.uk.capitalHeldBy = 'japan';
  state.control['united-kingdom'] = 'japan';
  state.control.kwangtung = 'china';
  state.board['united-kingdom'] = [];
  state.board['sz-2'] = [{
    power: 'usa', key: 'transport', count: 1,
    cargo: [{ power: 'usa', key: 'infantry', count: 1 }],
  }];
  const liberated = act(state, {
    type: 'attack', target: 'united-kingdom', forces: [],
    offloadFrom: 'sz-2', offloadUnits: [{ key: 'infantry', count: 1 }],
  });
  assert.equal(liberated.ok, true, `USA liberates empty London amphibiously (${liberated.error ?? ''})`);
  assert.equal(state.powers.uk.capitalHeldBy, null, 'London liberation restores the UK');
  assert.equal(state.control.kwangtung, 'uk', 'temporarily Chinese-controlled Kwangtung returns to UK on liberation');
}

{
  const state = usaCombat('china');
  const purchaseGrant = state.chinaGrant;
  state.control.manchuria = 'china';
  assert.equal(state.chinaGrant, purchaseGrant, 'current-turn captures never recalculate the Purchase Units grant');
}

console.log('axis China operations: all checks passed');
