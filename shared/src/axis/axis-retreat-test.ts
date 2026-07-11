import assert from 'node:assert/strict';
import { applyCasualtyPicks, applyRetreat, createBattle, resolveRoll, type BattleState } from './battle.js';
import { indexMap, type AxisMap } from './map.js';
import {
  deriveAxisRetreatPolicy,
  validateAxisRetreatDestination,
  type AxisRetreatBoardStack,
  type AxisRetreatInputs,
  type AxisRetreatPower,
} from './retreat.js';

const map: AxisMap = {
  territories: [
    { id: 'target', name: 'Target', ipc: 1, originalOwner: 'ussr', center: [0, 0], adj: ['alpha', 'bravo', 'enemy'] },
    { id: 'alpha', name: 'Alpha', ipc: 1, originalOwner: 'germany', center: [1, 0], adj: ['target'] },
    { id: 'bravo', name: 'Bravo', ipc: 1, originalOwner: 'italy', center: [-1, 0], adj: ['target'] },
    { id: 'enemy', name: 'Enemy', ipc: 1, originalOwner: 'ussr', center: [0, 1], adj: ['target'] },
    { id: 'far', name: 'Far', ipc: 1, originalOwner: 'germany', center: [3, 0], adj: [] },
  ],
  seaZones: [
    { id: 'sz-target', n: 1, center: [0, 3], adj: ['sz-a', 'sz-b', 'sz-c'] },
    { id: 'sz-a', n: 2, center: [1, 3], adj: ['sz-target'] },
    { id: 'sz-b', n: 3, center: [-1, 3], adj: ['sz-target'] },
    { id: 'sz-c', n: 4, center: [0, 4], adj: ['sz-target'] },
    { id: 'sz-far', n: 5, center: [3, 3], adj: [] },
  ],
  canals: [],
};

const index = indexMap(map);
const control: Record<string, AxisRetreatPower | null> = {
  target: 'ussr',
  alpha: 'germany',
  bravo: 'italy',
  enemy: 'ussr',
  far: 'germany',
};

function inputs(
  battle: BattleState,
  overrides: Partial<Omit<AxisRetreatInputs, 'battle' | 'index'>> = {},
): AxisRetreatInputs {
  return {
    battle,
    battleSpace: 'target',
    attacker: 'germany',
    board: {},
    control,
    index,
    turnStartHostileSeaZones: [],
    ...overrides,
  };
}

// Final ingress is copied to each physical battle unit, survives a JSON save,
// and remains an established route after that unit becomes a casualty.
{
  const battle = createBattle(
    { units: [
      { key: 'infantry', power: 'germany', count: 1, ingressFrom: 'alpha' },
      { key: 'tank', power: 'germany', count: 1, ingressFrom: 'bravo' },
    ] },
    { units: [{ key: 'infantry', power: 'ussr', count: 1 }] },
    { amphibious: false, seaCombat: false },
  );
  assert.deepEqual(battle.attacker.map((unit) => unit.ingressFrom), ['alpha', 'bravo']);

  const restored = JSON.parse(JSON.stringify(battle)) as BattleState;
  resolveRoll(restored, [6, 6]); // both attackers miss
  resolveRoll(restored, [1]); // defender scores one hit
  assert.equal(restored.decision?.type, 'casualties');
  applyCasualtyPicks(restored, [restored.attacker[0].uid]);
  assert.equal(restored.decision?.type, 'retreat');
  const before = JSON.stringify(restored);
  const policy = deriveAxisRetreatPolicy(inputs(restored));

  assert.deepEqual(policy?.destinations, ['alpha', 'bravo'], 'a casualty does not erase its established ingress route');
  assert.deepEqual(policy?.movingUnitUids, [restored.attacker[1].uid], 'only the surviving land unit physically withdraws');
  assert.equal(validateAxisRetreatDestination(inputs(restored), 'alpha').ok, true, 'survivors may use a route established by a casualty');
  assert.equal(validateAxisRetreatDestination(inputs(restored), 'enemy').ok, false, 'an enemy-controlled ingress is not legal');
  assert.equal(validateAxisRetreatDestination(inputs(restored), 'far').ok, false, 'a friendly but nonadjacent space is not legal');
  assert.equal(JSON.stringify(restored), before, 'derivation and validation are non-mutating');
}

// Aircraft disengage without a board destination and remain over the battle.
{
  const battle = createBattle(
    { units: [{ key: 'fighter', power: 'germany', count: 2, movementSpent: 2 }] },
    { units: [{ key: 'infantry', power: 'ussr', count: 1 }] },
    { amphibious: false, seaCombat: false },
  );
  battle.decision = { type: 'retreat', side: 'attacker' };
  const policy = deriveAxisRetreatPolicy(inputs(battle));

  assert.equal(policy?.destinationRequired, false);
  assert.equal(policy?.airDisengages, true);
  assert.deepEqual(policy?.aircraftUnitUids, battle.attacker.map((unit) => unit.uid));
  assert.deepEqual(policy?.destinations, []);
  assert.equal(validateAxisRetreatDestination(inputs(battle), null).ok, true, 'air-only retreat uses an explicit null destination');
  assert.equal(validateAxisRetreatDestination(inputs(battle), 'alpha').ok, false, 'aircraft are not moved to a land retreat destination');
}

// In a mixed beach assault, overland units and every aircraft withdraw while
// seaborne land units remain committed to combat.
{
  const battle = createBattle(
    { units: [
      { key: 'infantry', power: 'germany', count: 1, ingressFrom: 'alpha' },
      { key: 'infantry', power: 'germany', count: 1 },
      { key: 'fighter', power: 'germany', count: 1, movementSpent: 1 },
    ] },
    { units: [{ key: 'infantry', power: 'ussr', count: 1 }] },
    { amphibious: true, seaCombat: false, amphibiousLand: { infantry: 1 } },
  );
  battle.decision = { type: 'retreat', side: 'attacker', partial: true };
  const overland = battle.attacker.find((unit) => unit.key === 'infantry' && !unit.amphibious)!;
  const beach = battle.attacker.find((unit) => unit.amphibious)!;
  const fighter = battle.attacker.find((unit) => unit.key === 'fighter')!;
  const policy = deriveAxisRetreatPolicy(inputs(battle));

  assert.equal(policy?.mode, 'partial-amphibious');
  assert.deepEqual(policy?.destinations, ['alpha']);
  assert.deepEqual(policy?.movingUnitUids, [overland.uid]);
  assert.deepEqual(policy?.aircraftUnitUids, [fighter.uid]);
  assert.deepEqual(policy?.committedBeachUnitUids, [beach.uid]);
  assert.equal(validateAxisRetreatDestination(inputs(battle), 'alpha').ok, true);
  assert.equal(validateAxisRetreatDestination(inputs(battle), null).ok, false, 'living overland units require their exact destination');
}

// A naval destination must be currently non-hostile AND have been friendly at
// turn start. Enemy submarines do not make a sea zone hostile. A submerged
// attacking submarine stays in the contested zone but its ingress still
// establishes a legal route for the withdrawing surface force.
{
  const battle = createBattle(
    { units: [
      { key: 'destroyer', power: 'germany', count: 1, ingressFrom: 'sz-a' },
      { key: 'transport', power: 'germany', count: 1, ingressFrom: 'sz-b' },
      { key: 'submarine', power: 'germany', count: 1, ingressFrom: 'sz-c' },
    ] },
    { units: [{ key: 'destroyer', power: 'uk', count: 1 }] },
    { amphibious: false, seaCombat: true },
  );
  const submarine = battle.attacker.find((unit) => unit.key === 'submarine')!;
  submarine.submerged = true;
  battle.decision = { type: 'retreat', side: 'attacker' };
  const board: Record<string, AxisRetreatBoardStack[]> = {
    // Enemy submarines and transports do not make a sea zone hostile.
    'sz-c': [{ power: 'ussr', key: 'submarine', count: 1 }],
  };
  const seaInputs = inputs(battle, {
    battleSpace: 'sz-target',
    board,
    turnStartHostileSeaZones: ['sz-b'],
  });
  const policy = deriveAxisRetreatPolicy(seaInputs);

  assert.deepEqual(policy?.destinations, ['sz-a', 'sz-c']);
  assert.equal(policy?.movingUnitUids.includes(submarine.uid), false, 'a submerged submarine does not join the surface retreat');
  assert.deepEqual(policy?.submergedUnitUids, [submarine.uid]);
  assert.equal(validateAxisRetreatDestination(seaInputs, 'sz-b').ok, false, 'clearing a formerly hostile zone does not create a naval retreat route');
  assert.equal(validateAxisRetreatDestination(seaInputs, 'sz-c').ok, true, 'a submerged unit may have established the route before leaving combat');
}

// A surviving land unit without any established ingress prevents the whole
// group, including aircraft, from retreating to an invented location.
{
  const battle = createBattle(
    { units: [
      { key: 'infantry', power: 'germany', count: 1 },
      { key: 'fighter', power: 'germany', count: 1 },
    ] },
    { units: [{ key: 'infantry', power: 'ussr', count: 1 }] },
    { amphibious: false, seaCombat: false },
  );
  battle.decision = { type: 'retreat', side: 'attacker' };
  const noRouteInputs = inputs(battle);
  const policy = deriveAxisRetreatPolicy(noRouteInputs);

  assert.equal(policy?.destinationRequired, true);
  assert.deepEqual(policy?.destinations, []);
  assert.equal(policy?.canRetreat, false);
  assert.equal(validateAxisRetreatDestination(noRouteInputs, null).ok, false);
  assert.equal(validateAxisRetreatDestination(noRouteInputs, 'alpha').ok, false);
}

// When both sides have only transports, the attacker receives the official
// terminal remain-or-retreat choice instead of an unplayable empty-dice round.
{
  const makeStandoff = () => createBattle(
    { units: [{ key: 'transport', power: 'germany', count: 1, ingressFrom: 'sz-a' }] },
    { units: [{ key: 'transport', power: 'uk', count: 1 }] },
    { amphibious: false, seaCombat: true },
  );
  const remain = makeStandoff();
  assert.equal(remain.decision?.type, 'retreat');
  assert.equal(remain.decision?.type === 'retreat' && remain.decision.terminalStandoff, true);
  assert.deepEqual(deriveAxisRetreatPolicy(inputs(remain, { battleSpace: 'sz-target' }))?.destinations, ['sz-a']);
  applyRetreat(remain, false);
  assert.equal(remain.status, 'standoff', 'declining withdrawal ends the battle with both transport groups in place');

  const withdraw = makeStandoff();
  applyRetreat(withdraw, true);
  assert.equal(withdraw.status, 'retreated');
}

console.log('axis retreat policy: all assertions passed');
