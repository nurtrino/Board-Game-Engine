import { strict as assert } from 'node:assert';
import {
  applyAxisAction,
  type AxisAction,
  type AxisNewCarrierLandingOrder,
  type AxisUnitPick,
} from './actions.js';
import { axisPieceSelectionSignature } from './physical.js';
import { indexMap, type AxisMap } from './map.js';
import {
  axisViewFor,
  activePower,
  createAxis,
  normalizeAxisState,
  type AxisState,
  type SetupData,
  type UnitStack,
} from './state.js';
import { TURN_ORDER } from './config.js';

const map: AxisMap = {
  territories: [
    {
      id: 'origin', name: 'Origin', ipc: 2, originalOwner: 'germany', center: [0, 0],
      adj: ['safe'], coastTo: ['sz-a'],
    },
    {
      id: 'safe', name: 'Safe Coast', ipc: 2, originalOwner: 'germany', center: [5, 0],
      adj: ['origin'], coastTo: ['sz-future'],
    },
    {
      id: 'dock', name: 'Dock', ipc: 1, originalOwner: 'germany', center: [4, 1],
      adj: [], coastTo: ['sz-future', 'sz-other'],
    },
    {
      id: 'dock-2', name: 'Second Dock', ipc: 1, originalOwner: 'germany', center: [5, 1],
      adj: [], coastTo: ['sz-future'],
    },
  ],
  seaZones: [
    { id: 'sz-a', n: 1, center: [1, 0], adj: ['sz-b', 'sz-other'], coastTo: ['origin'] },
    { id: 'sz-b', n: 2, center: [2, 0], adj: ['sz-a', 'sz-c'], coastTo: [] },
    { id: 'sz-c', n: 3, center: [3, 0], adj: ['sz-b', 'sz-future'], coastTo: [] },
    {
      id: 'sz-future', n: 4, center: [4, 0], adj: ['sz-c'],
      coastTo: ['safe', 'dock', 'dock-2'],
    },
    { id: 'sz-other', n: 5, center: [1, 1], adj: ['sz-a'], coastTo: ['dock'] },
  ],
  canals: [],
};
const idx = indexMap(map);
const control: SetupData['control'] = {
  origin: 'germany',
  safe: 'germany',
  dock: 'germany',
  'dock-2': 'germany',
};

function game(phase: AxisState['phase'], extra: Record<string, UnitStack[]> = {}): AxisState {
  const state = createAxis(map, {
    control,
    units: {
      dock: [{ power: 'germany', key: 'factory', count: 1 }],
      'dock-2': [{ power: 'germany', key: 'factory', count: 1 }],
      ...extra,
    },
  }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 73,
  });
  state.phase = phase;
  return state;
}

const snapshot = (state: AxisState): string => JSON.stringify(state);
const act = (state: AxisState, action: AxisAction) => applyAxisAction(state, idx, 'germany', action);

function exactPick(
  state: AxisState,
  space: string,
  key: AxisUnitPick['key'],
  ordinals: number[],
): AxisUnitPick {
  return {
    key,
    count: ordinals.length,
    ordinals,
    selectionSig: axisPieceSelectionSignature(state.board[space] ?? [], 'germany', key),
  };
}

function declaration(
  zone: string,
  from: string,
  ordinals: number[],
  carrierFactories: string[],
): AxisNewCarrierLandingOrder {
  return { zone, fighters: [{ from, ordinals }], carrierFactories };
}

{
  const state = game('noncombat', {
    origin: [{ power: 'germany', key: 'fighter', count: 2 }],
    'sz-future': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  state.powers.germany.staging.carrier = 1;

  const legacyBefore = snapshot(state);
  const legacyPromise = act(state, {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [{ key: 'fighter', count: 1 }],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], ['dock'])],
  });
  assert.equal(legacyPromise.ok, false, 'legacy count-only picks cannot claim an exact carrier guarantee');
  assert.equal(snapshot(state), legacyBefore, 'rejected legacy declaration is atomic');

  const first = act(state, {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [exactPick(state, 'origin', 'fighter', [0])],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], ['dock'])],
  });
  assert.equal(first.ok, true, first.error);
  assert.equal(state.board.origin?.filter((stack) => stack.key === 'fighter')
    .reduce((total, stack) => total + stack.count, 0), 1,
  'selecting one fighter never auto-selects the same type in its region');
  assert.equal(state.newCarrierLandingObligations.length, 1);
  assert.equal(state.newCarrierLandingObligations[0]?.fighterRefs.length, 1);
  assert.deepEqual(state.newCarrierLandingObligations[0]?.carrierFactories, ['dock']);
  assert.equal(state.board['sz-future']?.some((stack) =>
    stack.key === 'fighter' && stack.count === 1 && Boolean(stack.carrierLanding)), true);

  const second = act(state, {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [exactPick(state, 'origin', 'fighter', [0])],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], [])],
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(state.newCarrierLandingObligations[0]?.fighterRefs.length, 2);
  assert.deepEqual(state.newCarrierLandingObligations[0]?.carrierFactories, ['dock'],
    'two same-zone fighters share one staged carrier reservation');

  const oldSignature = axisPieceSelectionSignature(
    state.board['sz-future'] ?? [], 'germany', 'fighter',
  );
  const firstTagged = state.board['sz-future']!.find((stack) => stack.carrierLanding)!;
  (firstTagged.carrierLanding as { seaZone: string }).seaZone = 'sz-other';
  const staleBefore = snapshot(state);
  const stale = act(state, {
    type: 'move', from: 'sz-future', to: 'safe',
    units: [{ key: 'fighter', count: 1, ordinals: [0], selectionSig: oldSignature }],
  });
  assert.equal(stale.ok, false, 'changing only a promise tag invalidates an exact selection signature');
  assert.equal(snapshot(state), staleBefore);
  (firstTagged.carrierLanding as { seaZone: string }).seaZone = 'sz-future';
  // Model the same exact promise returning from combat with one landing point
  // left; combat aircraft have their moved marker cleared before noncombat.
  delete firstTagged.moved;
  firstTagged.movementSpent = 3;

  const safeLanding = act(state, {
    type: 'move', from: 'sz-future', to: 'safe',
    units: [exactPick(state, 'sz-future', 'fighter', [0])],
  });
  assert.equal(safeLanding.ok, true, safeLanding.error);
  assert.equal(state.board.safe?.some((stack) => stack.key === 'fighter' && !stack.carrierLanding), true);
  assert.equal(state.newCarrierLandingObligations[0]?.fighterRefs.length, 1,
    'safe landing releases only its exact fighter and retains the shared carrier for the other');
}

{
  const state = game('noncombat', {
    origin: [{ power: 'germany', key: 'fighter', count: 2 }],
    'sz-future': [{ power: 'ussr', key: 'cruiser', count: 1 }],
    'sz-other': [{ power: 'ussr', key: 'destroyer', count: 1 }],
  });
  state.powers.germany.staging.carrier = 1;
  assert.equal(act(state, {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [exactPick(state, 'origin', 'fighter', [0])],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], ['dock'])],
  }).ok, true);
  const before = snapshot(state);
  const doubleSpend = act(state, {
    type: 'move', from: 'origin', to: 'sz-other',
    units: [exactPick(state, 'origin', 'fighter', [0])],
    newCarrierLandings: [declaration('sz-other', 'origin', [0], ['dock'])],
  });
  assert.equal(doubleSpend.ok, false, 'one staged carrier/factory slot cannot serve two zones');
  assert.match(doubleSpend.error ?? '', /reserved|staged|slot/i);
  assert.equal(snapshot(state), before, 'cross-zone double-spend rejection is atomic');
}

{
  const state = game('noncombat', {
    origin: [{ power: 'germany', key: 'fighter', count: 3 }],
    'sz-future': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  state.powers.germany.staging.carrier = 2;
  const move = act(state, {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [exactPick(state, 'origin', 'fighter', [0, 1, 2])],
    newCarrierLandings: [declaration(
      'sz-future', 'origin', [0, 1, 2], ['dock', 'dock-2'],
    )],
  });
  assert.equal(move.ok, true, move.error);
  assert.equal(act(state, { type: 'endPhase' }).ok, true);
  assert.equal(state.phase, 'mobilize');
  const first = act(state, {
    type: 'placeBatch', space: 'sz-future', factory: 'dock',
    units: [{ key: 'carrier', count: 1 }],
  });
  assert.equal(first.ok, true, first.error);
  assert.equal(state.newCarrierLandingObligations[0]?.fighterRefs.length, 1);
  assert.deepEqual(state.newCarrierLandingObligations[0]?.carrierFactories, ['dock-2'],
    'partial hostile placement retains exactly the remaining carrier/factory promise');
  const second = act(state, {
    type: 'placeBatch', space: 'sz-future', factory: 'dock-2',
    units: [{ key: 'carrier', count: 1 }],
  });
  assert.equal(second.ok, true, second.error);
  assert.deepEqual(state.newCarrierLandingObligations, [],
    'sequential promised carriers account for the deck supplied by the first placement');
}

{
  const alliedFull = game('noncombat', {
    origin: [{ power: 'germany', key: 'fighter', count: 1 }],
    'sz-future': [{
      power: 'italy', key: 'carrier', count: 1,
      cargo: [{ power: 'italy', key: 'fighter', count: 2 }],
    }],
  });
  alliedFull.powers.germany.staging.carrier = 1;
  const pick = exactPick(alliedFull, 'origin', 'fighter', [0]);
  const before = snapshot(alliedFull);
  assert.equal(act(alliedFull, {
    type: 'move', from: 'origin', to: 'sz-future', units: [pick],
  }).ok, false, 'allied guests consume every existing allied deck slot');
  assert.equal(snapshot(alliedFull), before);
  const promised = act(alliedFull, {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [exactPick(alliedFull, 'origin', 'fighter', [0])],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], ['dock'])],
  });
  assert.equal(promised.ok, true, promised.error);
  assert.equal(alliedFull.newCarrierLandingObligations[0]?.carrierFactories.length, 1);
}

{
  const state = game('noncombat', {
    origin: [{ power: 'germany', key: 'bomber', count: 1 }],
    'sz-future': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  state.powers.germany.staging.carrier = 1;
  const before = snapshot(state);
  const bomber = act(state, {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [exactPick(state, 'origin', 'bomber', [0])],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], ['dock'])],
  });
  assert.equal(bomber.ok, false, 'bombers can never claim a carrier guarantee');
  assert.equal(snapshot(state), before);

  const capturedFactory = game('noncombat', {
    origin: [{ power: 'germany', key: 'fighter', count: 1 }],
    'sz-future': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  capturedFactory.powers.germany.staging.carrier = 1;
  capturedFactory.contested.push('dock');
  const capturedBefore = snapshot(capturedFactory);
  const captured = act(capturedFactory, {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [exactPick(capturedFactory, 'origin', 'fighter', [0])],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], ['dock'])],
  });
  assert.equal(captured.ok, false, 'a captured-this-turn factory cannot reserve a carrier slot');
  assert.equal(snapshot(capturedFactory), capturedBefore);
}

{
  const state = game('combatMove', {
    origin: [{ power: 'germany', key: 'fighter', count: 1 }],
    'sz-future': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  state.powers.germany.staging.carrier = 1;
  const attack = act(state, {
    type: 'attack', target: 'sz-future',
    forces: [{ from: 'origin', units: [exactPick(state, 'origin', 'fighter', [0])] }],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], ['dock'])],
  });
  assert.equal(attack.ok, true, attack.error);
  const tag = state.combat?.battle.attacker[0]?.carrierLanding;
  assert.ok(tag, 'the exact attack fighter carries its stable promise into battle');
  assert.deepEqual(state.combat?.attackerCommitted[0]?.carrierLanding, tag);

  const restored = normalizeAxisState(JSON.parse(snapshot(state)) as AxisState);
  assert.deepEqual(restored.combat?.battle.attacker[0]?.carrierLanding, tag,
    'JSON reconnect preserves the live battle tag');
  assert.deepEqual(restored.newCarrierLandingObligations, state.newCarrierLandingObligations);
  const view = axisViewFor(restored, idx);
  assert.deepEqual(view.newCarrierLandingObligations, restored.newCarrierLandingObligations);
  (view.newCarrierLandingObligations[0]!.carrierFactories as string[]).splice(0, 1);
  assert.deepEqual(restored.newCarrierLandingObligations[0]?.carrierFactories, ['dock'],
    'public reconnect view clones mutable obligation arrays');

  const dead = state.combat!.battle.attacker.find((unit) => unit.key === 'fighter')!;
  dead.hp = 0;
  state.combat!.battle.status = 'defender_won';
  state.combat!.battle.decision = null;
  state.combat!.confirmed = { attacker: false, defender: false };
  state.pendings = [
    { id: state.pendingSeq++, power: 'germany', kind: 'battle-continue', data: { side: 'attacker' } },
    { id: state.pendingSeq++, power: 'ussr', kind: 'battle-continue', data: { side: 'defender' } },
  ];
  assert.equal(act(state, { type: 'battleContinue' }).ok, true);
  assert.deepEqual(state.newCarrierLandingObligations, [],
    'the exact fighter casualty immediately releases its carrier and factory reservation');
  assert.equal(dead.carrierLanding, undefined);

  // The reconnect branch keeps the fighter alive and demonstrates full
  // retreat -> noncombat protection -> exact hostile mobilization.
  restored.combat!.battle.status = 'retreated';
  restored.combat!.battle.decision = null;
  restored.combat!.retreatTo = null;
  restored.combat!.confirmed = { attacker: false, defender: false };
  restored.pendings = [
    { id: restored.pendingSeq++, power: 'germany', kind: 'battle-continue', data: { side: 'attacker' } },
    { id: restored.pendingSeq++, power: 'ussr', kind: 'battle-continue', data: { side: 'defender' } },
  ];
  assert.equal(applyAxisAction(restored, idx, 'germany', { type: 'battleContinue' }).ok, true);
  assert.equal(applyAxisAction(restored, idx, 'ussr', { type: 'battleContinue' }).ok, true);
  const returned = restored.board['sz-future']?.find((stack) =>
    stack.power === 'germany' && stack.key === 'fighter');
  assert.deepEqual(returned?.carrierLanding, tag, 'aircraft-only retreat preserves the same stable ref');
  assert.equal(returned?.count, 1);

  assert.equal(act(restored, { type: 'endPhase' }).ok, true);
  restored.board['sz-future']!.push({ power: 'germany', key: 'fighter', count: 1 });
  assert.equal(act(restored, { type: 'endPhase' }).ok, true);
  assert.equal(restored.phase, 'mobilize');
  assert.equal(restored.board['sz-future']?.filter((stack) =>
    stack.power === 'germany' && stack.key === 'fighter')
    .reduce((total, stack) => total + stack.count, 0), 1,
  'end noncombat destroys ordinary hostile overflow but preserves the exact promised fighter');
  assert.ok(restored.board['sz-future']?.find((stack) => stack.carrierLanding));

  const blockedEnd = act(restored, { type: 'endPhase' });
  assert.equal(blockedEnd.ok, false, 'mobilization cannot end with a live carrier obligation');
  assert.match(blockedEnd.error ?? '', /required carrier/i);

  restored.powers.germany.staging.infantry = 1;
  const theftBefore = snapshot(restored);
  const stealFactory = act(restored, {
    type: 'placeBatch', space: 'dock', units: [{ key: 'infantry', count: 1 }],
  });
  assert.equal(stealFactory.ok, false, 'unrelated units cannot steal the reserved factory slot');
  assert.equal(snapshot(restored), theftBefore);

  const wrongBefore = snapshot(restored);
  const wrongZone = act(restored, {
    type: 'placeBatch', space: 'sz-other', factory: 'dock', units: [{ key: 'carrier', count: 1 }],
  });
  assert.equal(wrongZone.ok, false, 'a wrong-zone carrier cannot consume the reserved staged hull');
  assert.equal(snapshot(restored), wrongBefore);

  const placed = act(restored, {
    type: 'placeBatch', space: 'sz-future', factory: 'dock', units: [{ key: 'carrier', count: 1 }],
  });
  assert.equal(placed.ok, true, placed.error);
  assert.deepEqual(restored.newCarrierLandingObligations, []);
  assert.equal(restored.board['sz-future']?.some((stack) =>
    stack.power === 'germany' && stack.key === 'fighter' && stack.carrierLanding), false);
  assert.equal(restored.board['sz-future']?.some((stack) =>
    stack.power === 'ussr' && stack.key === 'cruiser'), true,
  'hostile carrier placement starts no new combat');
  assert.equal(restored.combat, null);
  const placedInfantry = act(restored, {
    type: 'placeBatch', space: 'dock-2', units: [{ key: 'infantry', count: 1 }],
  });
  assert.equal(placedInfantry.ok, true, placedInfantry.error);
  assert.equal(act(restored, { type: 'endPhase' }).ok, true, 'turn may end after exact fulfillment');
}

{
  const china = game('noncombat', {
    origin: [{ power: 'china', key: 'fighter', count: 1 }],
    'sz-future': [{ power: 'ussr', key: 'cruiser', count: 1 }],
  });
  china.turnIdx = 5;
  china.turnStartSea = { power: 'usa', hostile: ['sz-future'] };
  china.usaOperationFirst = 'china';
  china.usaOperationIndex = 0;
  china.powers.usa.staging.carrier = 1;
  const before = snapshot(china);
  const result = applyAxisAction(china, idx, 'usa', {
    type: 'move', from: 'origin', to: 'sz-future',
    units: [{
      key: 'fighter', count: 1, ordinals: [0],
      selectionSig: axisPieceSelectionSignature(china.board.origin ?? [], 'china', 'fighter'),
    }],
    newCarrierLandings: [declaration('sz-future', 'origin', [0], ['dock'])],
  });
  assert.equal(result.ok, false, 'China/Flying Tigers cannot declare a new-carrier promise');
  assert.equal(snapshot(china), before);
}

{
  const old = game('noncombat');
  delete (old as Partial<AxisState>).newCarrierLandingObligations;
  delete (old as Partial<AxisState>).carrierLandingSeq;
  normalizeAxisState(old);
  assert.deepEqual(old.newCarrierLandingObligations, [], 'old saves migrate without inferred promises');
  assert.equal(old.carrierLandingSeq, 1);
}

function advanceAlliedGuestToUsaTurn(): {
  state: AxisState;
  homeCarrierRef: string;
  otherCarrierRef: string;
} {
  const state = game('mobilize', {
    'sz-a': [
      { power: 'uk', key: 'carrier', count: 1 },
      {
        power: 'uk', key: 'carrier', count: 1,
        cargo: [{ power: 'usa', key: 'fighter', count: 1 }],
      },
    ],
    'sz-other': [{ power: 'uk', key: 'carrier', count: 1 }],
  });
  state.control.origin = 'usa';
  const carriers = state.board['sz-a']!.filter((stack) => stack.key === 'carrier');
  const home = carriers.find((carrier) => carrier.cargo?.some((cargo) =>
    cargo.power === 'usa' && cargo.key === 'fighter'))!;
  const other = carriers.find((carrier) => carrier !== home)!;
  assert.ok(home.carrierRef && other.carrierRef);

  const italyIndex = TURN_ORDER['1941'].indexOf('italy');
  assert.equal(TURN_ORDER['1941'][italyIndex + 1], 'usa', 'fixture advances directly into the fighter owner turn');
  state.turnIdx = italyIndex;
  state.phase = 'mobilize';
  const advanced = applyAxisAction(state, idx, 'italy', { type: 'endPhase' });
  assert.equal(advanced.ok, true, advanced.error);
  assert.equal(activePower(state), 'usa');
  return { state, homeCarrierRef: home.carrierRef!, otherCarrierRef: other.carrierRef! };
}

{
  const { state, homeCarrierRef, otherCarrierRef } = advanceAlliedGuestToUsaTurn();
  const loose = state.board['sz-a']!.filter((stack) =>
    stack.power === 'usa' && stack.key === 'fighter');
  assert.equal(loose.length, 1);
  assert.equal(loose[0]?.count, 1);
  assert.equal(loose[0]?.carrierBaseRef, homeCarrierRef,
    'an allied guest launches as one independently selectable fighter on its owner turn');
  assert.equal(state.board['sz-a']!.some((carrier) => carrier.key === 'carrier'
    && carrier.cargo?.some((cargo) => cargo.power === 'usa' && cargo.key === 'fighter')), false,
  'the same fighter is not duplicated as carrier cargo after launch');

  state.phase = 'mobilize';
  const ended = applyAxisAction(state, idx, 'usa', { type: 'endPhase' });
  assert.equal(ended.ok, true, ended.error);
  const home = state.board['sz-a']!.find((carrier) => carrier.carrierRef === homeCarrierRef);
  const other = state.board['sz-a']!.find((carrier) => carrier.carrierRef === otherCarrierRef);
  assert.equal(home?.cargo?.find((cargo) => cargo.power === 'usa' && cargo.key === 'fighter')?.count, 1,
    'an unmoved guest re-boards its exact original friendly carrier at turn end');
  assert.equal(Boolean(other?.cargo?.some((cargo) => cargo.power === 'usa' && cargo.key === 'fighter')), false,
    'a lower-capacity ambiguity never silently moves the guest to another hull');
  assert.equal(state.board['sz-a']!.some((stack) => stack.power === 'usa' && stack.key === 'fighter'), false,
    'the re-boarded guest is represented once, as bound cargo during the carrier owner turn');
}

{
  const { state } = advanceAlliedGuestToUsaTurn();
  state.phase = 'noncombat';
  state.usaOperationFirst = 'usa';
  state.usaOperationIndex = 0;
  const signature = axisPieceSelectionSignature(state.board['sz-a'] ?? [], 'usa', 'fighter');
  const moved = applyAxisAction(state, idx, 'usa', {
    type: 'move',
    from: 'sz-a',
    to: 'origin',
    units: [{ key: 'fighter', count: 1, ordinals: [0], selectionSig: signature }],
  });
  assert.equal(moved.ok, true, moved.error);
  assert.equal(state.board.origin?.some((stack) => stack.power === 'usa' && stack.key === 'fighter'), true,
    'the guest fighter can take off and make its own legal move during its owner turn');
  assert.equal(state.board['sz-a']!.some((carrier) => carrier.key === 'carrier'
    && carrier.cargo?.some((cargo) => cargo.power === 'usa' && cargo.key === 'fighter')), false);
}

{
  const { state } = advanceAlliedGuestToUsaTurn();
  state.phase = 'noncombat';
  state.usaOperationFirst = 'usa';
  state.usaOperationIndex = 0;
  const signature = axisPieceSelectionSignature(state.board['sz-a'] ?? [], 'usa', 'fighter');
  const moved = applyAxisAction(state, idx, 'usa', {
    type: 'move',
    from: 'sz-a',
    to: 'sz-other',
    units: [{ key: 'fighter', count: 1, ordinals: [0], selectionSig: signature }],
  });
  assert.equal(moved.ok, true, moved.error);
  assert.equal(state.board['sz-other']?.some((stack) =>
    stack.power === 'usa' && stack.key === 'fighter' && !stack.carrierBaseRef), true,
  'an independently moved guest is no longer tied to its former carrier');

  state.phase = 'mobilize';
  const ended = applyAxisAction(state, idx, 'usa', { type: 'endPhase' });
  assert.equal(ended.ok, true, ended.error);
  const destinationCarrier = state.board['sz-other']?.find((stack) => stack.key === 'carrier');
  assert.equal(destinationCarrier?.cargo?.find((cargo) =>
    cargo.power === 'usa' && cargo.key === 'fighter')?.count, 1,
  'a fighter ending on a different allied deck binds to that exact carrier for its owner turn');
  assert.equal(state.board['sz-other']?.some((stack) => stack.power === 'usa' && stack.key === 'fighter'), false);
}

// Initial games and legacy reconnects do not pass through beginTurn(). The
// active owner's fighter must still launch from an allied carrier as one exact,
// selectable piece while other owners' guests remain bound to the hull.
{
  const state = game('purchase', {
    'sz-a': [{
      power: 'italy', key: 'carrier', count: 1,
      cargo: [
        { power: 'germany', key: 'fighter', count: 1 },
        { power: 'japan', key: 'fighter', count: 1 },
      ],
    }],
  });
  const carrier = state.board['sz-a']!.find((stack) => stack.key === 'carrier')!;
  const activeGuest = state.board['sz-a']!.find((stack) =>
    stack.power === 'germany' && stack.key === 'fighter');
  assert.equal(activeGuest?.count, 1);
  assert.equal(activeGuest?.carrierBaseRef, carrier.carrierRef,
    'the first active power launches from its exact allied deck during hydration');
  assert.equal(carrier.cargo?.find((cargo) => cargo.power === 'germany'), undefined);
  assert.equal(carrier.cargo?.find((cargo) => cargo.power === 'japan')?.count, 1,
    'a different fighter owner stays bound until its own turn');

  const once = snapshot(state);
  normalizeAxisState(state);
  assert.equal(snapshot(state), once, 'active-guest hydration is reconnect-idempotent');

  state.phase = 'noncombat';
  const signature = axisPieceSelectionSignature(state.board['sz-a'] ?? [], 'germany', 'fighter');
  const moved = act(state, {
    type: 'move', from: 'sz-a', to: 'origin',
    units: [{ key: 'fighter', count: 1, ordinals: [0], selectionSig: signature }],
  });
  assert.equal(moved.ok, true, moved.error);
  assert.equal(state.board.origin?.some((stack) =>
    stack.power === 'germany' && stack.key === 'fighter' && !stack.carrierBaseRef), true,
  'the hydrated guest is independently selectable and sheds its old deck hint after takeoff');
}

// Moving an exact carrier without its loose fighter invalidates that fighter's
// preferred-home hint immediately; a later move or save cannot target a hull
// that is no longer present in the sea zone.
{
  const state = game('noncombat', {
    'sz-a': [
      { power: 'germany', key: 'carrier', count: 1 },
      { power: 'germany', key: 'fighter', count: 1 },
    ],
  });
  const carrier = state.board['sz-a']!.find((stack) => stack.key === 'carrier')!;
  const fighter = state.board['sz-a']!.find((stack) => stack.key === 'fighter')!;
  fighter.carrierBaseRef = carrier.carrierRef;
  const moved = act(state, {
    type: 'move', from: 'sz-a', to: 'sz-other',
    units: [{ key: 'carrier', count: 1 }],
  });
  assert.equal(moved.ok, true, moved.error);
  assert.equal(fighter.carrierBaseRef, undefined,
    'successful carrier movement reconciles stale exact deck references');
}

console.log('axis carrier actions: all assertions passed');
