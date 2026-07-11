import assert from 'node:assert/strict';
import {
  applyAxisAction,
  type AxisAction,
  type AxisParatrooperGroupOrder,
} from './actions.js';
import {
  applyCasualtyPicks,
  createBattle,
  currentStep,
  resolveRoll,
} from './battle.js';
import { TURN_ORDER } from './config.js';
import { indexMap, type AxisMap } from './map.js';
import { axisPieceSelectionSignature } from './physical.js';
import {
  axisViewFor,
  createAxis,
  normalizeAxisState,
  unitCount,
  type AxisState,
  type SetupData,
  type UnitStack,
} from './state.js';

const MAP: AxisMap = {
  territories: [
    { id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', center: [0, 0], adj: ['mid', 'target'] },
    { id: 'mid', name: 'Middle', ipc: 2, originalOwner: 'germany', center: [1, 0], adj: ['home', 'target'] },
    { id: 'flank', name: 'Flank', ipc: 2, originalOwner: 'germany', center: [1, 2], adj: ['target'] },
    { id: 'target', name: 'Target', ipc: 3, originalOwner: 'ussr', center: [2, 0], adj: ['home', 'mid', 'flank', 'landing'] },
    { id: 'landing', name: 'Landing', ipc: 1, originalOwner: 'germany', center: [3, 0], adj: ['target', 'factory-2'] },
    { id: 'factory-2', name: 'Second Factory', ipc: 2, originalOwner: 'ussr', center: [4, 0], adj: ['landing'] },
  ],
  seaZones: [],
  canals: [],
};
const idx = indexMap(MAP);
const CONTROL: SetupData['control'] = {
  home: 'germany',
  mid: 'germany',
  flank: 'germany',
  target: 'ussr',
  landing: 'germany',
  'factory-2': 'ussr',
};

function fresh(units: Record<string, UnitStack[]>, seed = 67): AxisState {
  const state = createAxis(MAP, { control: CONTROL, units }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed,
  });
  state.phase = 'combatMove';
  return state;
}

const snapshot = (state: AxisState): string => JSON.stringify(state);
const act = (state: AxisState, action: AxisAction, seat: 'germany' | 'ussr' | 'usa' = 'germany') =>
  applyAxisAction(state, idx, seat, action);

function paraGroup(
  state: AxisState,
  route: string[] = ['home', 'target'],
  ordinals: readonly [number, number][] = [[0, 0]],
  power: 'germany' | 'china' = 'germany',
): AxisParatrooperGroupOrder {
  const from = route[0]!;
  return {
    from,
    route,
    pairs: ordinals.map(([bomber, infantry]) => ({
      bomber: {
        ordinal: bomber,
        selectionSig: axisPieceSelectionSignature(state.board[from] ?? [], power, 'bomber'),
      },
      infantry: {
        ordinal: infantry,
        selectionSig: axisPieceSelectionSignature(state.board[from] ?? [], power, 'infantry'),
      },
    })),
  };
}

function paraAttack(state: AxisState, group = paraGroup(state), forces: Extract<AxisAction, { type: 'attack' }>['forces'] = []): AxisAction {
  return { type: 'attack', target: 'target', forces, paratroopers: [group] };
}

function exposeRetreat(state: AxisState): void {
  const combat = state.combat!;
  combat.battle.status = 'ongoing';
  combat.battle.decision = { type: 'retreat', side: 'attacker' };
  state.pendings = [{
    id: state.pendingSeq++,
    power: 'germany',
    kind: 'battle-retreat',
    data: { decision: combat.battle.decision },
  }];
}

// An exact pair launches without RNG, retains physical linkage, spends the
// explicit route, and deploys before general fire when no AA gun is present.
{
  const state = fresh({
    home: [
      { power: 'germany', key: 'bomber', count: 2 },
      { power: 'germany', key: 'infantry', count: 2 },
    ],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  state.powers.germany.techs.push('paratroopers');
  const rollsBefore = state.rolls;
  assert.equal(act(state, paraAttack(state, paraGroup(state, ['home', 'mid', 'target'], [[1, 1]]))).ok, true);
  assert.equal(state.rolls, rollsBefore, 'declaring the airborne attack draws no RNG');
  assert.equal(unitCount(state, 'home', 'germany', 'bomber'), 1);
  assert.equal(unitCount(state, 'home', 'germany', 'infantry'), 1);
  assert.equal(state.combat?.battle.paratrooperDropSeq, 1);
  assert.equal(currentStep(state.combat!.battle), 'attacker_fire');
  const bomber = state.combat!.battle.attacker.find((unit) => unit.role === 'bomber')!;
  const infantry = state.combat!.battle.attacker.find((unit) => unit.role === 'infantry')!;
  assert.equal(bomber.key, 'bomber');
  assert.equal(infantry.key, 'infantry');
  assert.equal(bomber.pairId, infantry.pairId);
  assert.equal(bomber.counterpartUid, infantry.uid);
  assert.equal(infantry.counterpartUid, bomber.uid);
  assert.equal(infantry.aboard, false, 'no-AA deployment occurs before a combat die is exposed');
  assert.equal(bomber.movementSpent, 2, 'the explicit route, not a recomputed shortcut, is charged');
  assert.equal(infantry.ingressFrom, undefined, 'airborne infantry never invents overland retreat ingress');

  const restored = JSON.parse(snapshot(state)) as AxisState;
  normalizeAxisState(restored);
  const restoredBomber = restored.combat!.battle.attacker.find((unit) => unit.role === 'bomber')!;
  const restoredInfantry = restored.combat!.battle.attacker.find((unit) => unit.role === 'infantry')!;
  assert.equal(restoredBomber.pairId, bomber.pairId);
  assert.equal(restoredBomber.counterpartUid, restoredInfantry.uid);
  assert.equal(restoredInfantry.counterpartUid, restoredBomber.uid);
  assert.equal(axisViewFor(restored, idx).combat?.battle.paratrooperDropSeq, 1,
    'save restoration and public view preserve the deployment generation');
}

// Technology, China, stale signatures, duplicate refs, and mixed legacy picks
// all reject before mutating the board or consuming RNG.
{
  const missingTech = fresh({
    home: [{ power: 'germany', key: 'bomber', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  const missingBefore = snapshot(missingTech);
  assert.equal(act(missingTech, paraAttack(missingTech)).ok, false);
  assert.equal(snapshot(missingTech), missingBefore);

  const stale = fresh({
    home: [{ power: 'germany', key: 'bomber', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  stale.powers.germany.techs.push('paratroopers');
  const validGroup = paraGroup(stale);
  const staleGroup: AxisParatrooperGroupOrder = {
    ...validGroup,
    pairs: [{
      bomber: { ...validGroup.pairs[0]!.bomber },
      infantry: { ...validGroup.pairs[0]!.infantry, selectionSig: 'stale' },
    }],
  };
  const staleBefore = snapshot(stale);
  assert.equal(act(stale, paraAttack(stale, staleGroup)).ok, false);
  assert.equal(snapshot(stale), staleBefore, 'one stale half rejects the entire paired declaration atomically');

  const duplicate = fresh({
    home: [{ power: 'germany', key: 'bomber', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  duplicate.powers.germany.techs.push('paratroopers');
  const group = paraGroup(duplicate);
  const duplicateBefore = snapshot(duplicate);
  assert.equal(act(duplicate, paraAttack(duplicate, group, [{
    from: 'home',
    units: [{
      key: 'bomber', count: 1, ordinals: [0],
      selectionSig: axisPieceSelectionSignature(duplicate.board.home ?? [], 'germany', 'bomber'),
    }],
  }])).ok, false, 'one bomber cannot be selected ordinarily and as a Paratrooper carrier');
  assert.equal(snapshot(duplicate), duplicateBefore);
  assert.equal(act(duplicate, paraAttack(duplicate, group, [{
    from: 'home', units: [{ key: 'infantry', count: 1 }],
  }])).ok, false, 'count-only overlap cannot bypass global exact-piece validation');
  assert.equal(snapshot(duplicate), duplicateBefore);

  const china = fresh({
    home: [{ power: 'china', key: 'bomber', count: 1 }, { power: 'china', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  china.turnIdx = TURN_ORDER['1941'].indexOf('usa');
  china.usaOperationFirst = 'china';
  china.usaOperationIndex = 0;
  const chinaBefore = snapshot(china);
  assert.equal(act(china, paraAttack(china, paraGroup(china, ['home', 'target'], [[0, 0]], 'china')), 'usa').ok, false);
  assert.equal(snapshot(china), chinaBefore, 'China cannot borrow a national Paratroopers advance');
}

// The explicit route stops at the first territory hostile at Combat Move
// start, and exact prior movement cannot be refunded to create a landing.
{
  const firstHostile = fresh({
    home: [{ power: 'germany', key: 'bomber', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  firstHostile.powers.germany.techs.push('paratroopers');
  firstHostile.control.mid = 'ussr';
  const before = snapshot(firstHostile);
  const rejected = act(firstHostile, paraAttack(firstHostile, paraGroup(firstHostile, ['home', 'mid', 'target'])));
  assert.equal(rejected.ok, false);
  assert.match(rejected.error ?? '', /must stop in mid/i);
  assert.equal(snapshot(firstHostile), before);

  const noLanding = fresh({
    home: [
      { power: 'germany', key: 'bomber', count: 1, movementSpent: 5 },
      { power: 'germany', key: 'infantry', count: 1 },
    ],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  noLanding.powers.germany.techs.push('paratroopers');
  const landingBefore = snapshot(noLanding);
  assert.equal(act(noLanding, paraAttack(noLanding)).ok, false,
    'a bomber that spends its final movement reaching the drop has no legal landing reserve');
  assert.equal(snapshot(noLanding), landingBefore);
}

// AA dice target exact bombers. One hit destroys only that bomber's still-
// aboard infantry as cargo; the other pair deploys after the full AA queue.
{
  const battle = createBattle({
    units: [
      { key: 'bomber', power: 'germany', count: 1, pairId: 'p1', role: 'bomber', aboard: false },
      { key: 'infantry', power: 'germany', count: 1, pairId: 'p1', role: 'infantry', aboard: true },
      { key: 'bomber', power: 'germany', count: 1, pairId: 'p2', role: 'bomber', aboard: false },
      { key: 'infantry', power: 'germany', count: 1, pairId: 'p2', role: 'infantry', aboard: true },
    ],
  }, {
    units: [
      { key: 'aaGun', power: 'ussr', count: 1 },
      { key: 'infantry', power: 'ussr', count: 1 },
    ],
  }, { amphibious: false, seaCombat: false });
  assert.equal(currentStep(battle), 'aa_fire');
  assert.equal(battle.paratrooperDropSeq, 0);
  resolveRoll(battle, [1, 6]);
  const firstBomber = battle.attacker.find((unit) => unit.pairId === 'p1' && unit.role === 'bomber')!;
  const firstInfantry = battle.attacker.find((unit) => unit.pairId === 'p1' && unit.role === 'infantry')!;
  const secondBomber = battle.attacker.find((unit) => unit.pairId === 'p2' && unit.role === 'bomber')!;
  const secondInfantry = battle.attacker.find((unit) => unit.pairId === 'p2' && unit.role === 'infantry')!;
  assert.equal(firstBomber.hp, 0);
  assert.equal(firstInfantry.hp, 0, 'the one linked aboard infantry is lost without another AA hit');
  assert.equal(secondBomber.hp, 1);
  assert.equal(secondInfantry.hp, 1);
  assert.equal(secondInfantry.aboard, false, 'surviving pairs deploy only after all AA casualty buckets drain');
  assert.equal(battle.paratrooperDropSeq, 1);
  assert.equal(currentStep(battle), 'attacker_fire');
  const aaEvent = battle.log.find((event) => event.kind === 'aa_fire')!;
  assert.equal(aaEvent.hits, 1, 'linked cargo loss does not fabricate another die hit');
  const casualties = battle.log.flatMap((event) => event.casualties);
  assert.equal(casualties.filter((unit) => unit.key === 'bomber').length, 1);
  assert.equal(casualties.filter((unit) => unit.key === 'infantry').length, 1);
}

// Through the authoritative action path, one post-roll visual generation owns
// both the AA dice and linked deployment, while launch itself remains RNG-free.
{
  const state = fresh({
    home: [{ power: 'germany', key: 'bomber', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [
      { power: 'ussr', key: 'aaGun', count: 1 },
      { power: 'ussr', key: 'infantry', count: 1 },
    ],
  });
  state.powers.germany.techs.push('paratroopers');
  const rollsBefore = state.rolls;
  assert.equal(act(state, paraAttack(state)).ok, true);
  assert.equal(state.rolls, rollsBefore);
  assert.equal(state.combat?.visualSeq, 0);
  assert.equal(state.combat?.battle.paratrooperDropSeq, 0);
  const combatId = state.combat!.id;
  assert.equal(act(state, { type: 'battleRoll', combatId, visualSeq: 0 }).ok, true);
  assert.equal(state.rolls, rollsBefore + 1, 'only the physical AA die consumes RNG');
  assert.equal(state.combat?.battle.paratrooperDropSeq, 1);
  assert.equal(state.combat?.visualSeq, 1,
    'one accepted roll creates one presentable generation whose animation includes the linked drop');
  const after = snapshot(state);
  assert.equal(act(state, { type: 'battleRoll', combatId, visualSeq: 0 }).ok, false);
  assert.equal(snapshot(state), after, 'the pre-deployment cinematic generation cannot roll again');
}

// An AA miss still completes one drop transition, while a bomber destroyed by
// ordinary fire after deployment no longer drags its infantry down with it.
{
  const aaMiss = createBattle({
    units: [
      { key: 'bomber', power: 'germany', count: 1, pairId: 'miss', role: 'bomber' },
      { key: 'infantry', power: 'germany', count: 1, pairId: 'miss', role: 'infantry', aboard: true },
    ],
  }, {
    units: [{ key: 'aaGun', power: 'ussr', count: 1 }, { key: 'infantry', power: 'ussr', count: 1 }],
  }, { amphibious: false, seaCombat: false });
  resolveRoll(aaMiss, [6]);
  assert.equal(aaMiss.paratrooperDropSeq, 1);
  assert.equal(aaMiss.attacker.find((unit) => unit.role === 'infantry')?.aboard, false);

  const ordinaryLoss = createBattle({
    units: [
      { key: 'bomber', power: 'germany', count: 1, pairId: 'landed', role: 'bomber' },
      { key: 'infantry', power: 'germany', count: 1, pairId: 'landed', role: 'infantry', aboard: true },
    ],
  }, {
    units: [{ key: 'infantry', power: 'ussr', count: 1 }],
  }, { amphibious: false, seaCombat: false });
  const landedBomber = ordinaryLoss.attacker.find((unit) => unit.role === 'bomber')!;
  const landedInfantry = ordinaryLoss.attacker.find((unit) => unit.role === 'infantry')!;
  assert.equal(landedInfantry.aboard, false);
  resolveRoll(ordinaryLoss, [6, 6]);
  resolveRoll(ordinaryLoss, [1]);
  assert.equal(ordinaryLoss.decision?.type, 'casualties');
  applyCasualtyPicks(ordinaryLoss, [landedBomber.uid]);
  assert.equal(landedBomber.hp, 0);
  assert.equal(landedInfantry.hp, 1, 'post-drop bomber destruction never kills deployed infantry');
}

// Airborne infantry establishes no retreat route. It may nevertheless move
// with the full force when an ordinary adjacent land attacker supplies one.
{
  const airborneOnly = fresh({
    home: [{ power: 'germany', key: 'bomber', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  airborneOnly.powers.germany.techs.push('paratroopers');
  assert.equal(act(airborneOnly, paraAttack(airborneOnly)).ok, true);
  exposeRetreat(airborneOnly);
  const policy = axisViewFor(airborneOnly, idx).combat?.retreatPolicy;
  assert.equal(policy?.destinationRequired, true);
  assert.deepEqual(policy?.destinations, []);
  const before = snapshot(airborneOnly);
  assert.equal(act(airborneOnly, { type: 'battleRetreat', retreat: true, destination: 'home' }).ok, false);
  assert.equal(snapshot(airborneOnly), before);

  const combined = fresh({
    home: [{ power: 'germany', key: 'bomber', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    flank: [{ power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  combined.powers.germany.techs.push('paratroopers');
  assert.equal(act(combined, paraAttack(combined, paraGroup(combined), [{
    from: 'flank', units: [{ key: 'infantry', count: 1 }],
  }])).ok, true);
  exposeRetreat(combined);
  const combinedPolicy = axisViewFor(combined, idx).combat?.retreatPolicy;
  assert.deepEqual(combinedPolicy?.destinations, ['flank']);
  assert.equal(combinedPolicy?.movingUnitUids.length, 2,
    'ordinary and airborne infantry withdraw together over the established route');
  assert.equal(act(combined, { type: 'battleRetreat', retreat: true, destination: 'flank' }).ok, true);
  assert.equal(act(combined, { type: 'battleContinue' }).ok, true);
  assert.equal(act(combined, { type: 'battleContinue' }, 'ussr').ok, true);
  assert.equal(unitCount(combined, 'flank', 'germany', 'infantry'), 2);
}

// A bomber that has carried Paratroopers is restored as spent and cannot make
// a strategic bombing raid later in the same turn.
{
  const state = fresh({
    home: [{ power: 'germany', key: 'bomber', count: 1 }, { power: 'germany', key: 'infantry', count: 1 }],
    target: [{ power: 'ussr', key: 'factory', count: 1 }],
    'factory-2': [{ power: 'ussr', key: 'factory', count: 1 }],
  });
  state.powers.germany.techs.push('paratroopers');
  const rollsBefore = state.rolls;
  assert.equal(act(state, paraAttack(state)).ok, true);
  assert.equal(state.combat?.battle.status, 'attacker_captured');
  assert.equal(state.rolls, rollsBefore);
  assert.equal(act(state, { type: 'battleContinue' }).ok, true);
  assert.equal(act(state, { type: 'battleContinue' }, 'ussr').ok, true);
  const bomber = state.board.target.find((stack) => stack.power === 'germany' && stack.key === 'bomber');
  assert.equal(bomber?.moved, 1);
  assert.equal(bomber?.movementSpent, 1);
  const beforeRaid = snapshot(state);
  assert.equal(act(state, {
    type: 'sbr', target: 'factory-2', forces: [{ from: 'target', bombers: 1 }],
  }).ok, false);
  assert.equal(snapshot(state), beforeRaid);
}

assert.throws(() => createBattle({
  units: [{ key: 'bomber', power: 'germany', count: 1, pairId: 'broken', role: 'bomber' }],
}, { units: [] }, { amphibious: false, seaCombat: false }), /one bomber and one infantry/i,
'battle creation rejects incomplete pair metadata instead of guessing a counterpart');

console.log('axis Paratroopers actions: all assertions passed');
