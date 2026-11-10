import { strict as assert } from 'node:assert';
import { applyAxisAction } from './actions.js';
import { indexMap, type AxisMap } from './map.js';
import { createAxis, type AxisState, type SetupData, type UnitStack } from './state.js';

const map: AxisMap = {
  territories: [
    { id: 'home', name: 'Home', ipc: 5, originalOwner: 'germany', center: [0, 0], adj: ['coast'] },
    { id: 'coast', name: 'Coast', ipc: 2, originalOwner: 'germany', center: [1, 0], adj: ['home'], coastTo: ['sz-1'] },
    { id: 'enemy', name: 'Enemy Coast', ipc: 3, originalOwner: 'ussr', center: [4, 0], adj: ['landing'], coastTo: ['sz-2'] },
    { id: 'landing', name: 'Landing', ipc: 1, originalOwner: 'germany', center: [5, 0], adj: ['enemy'] },
    { id: 'far-enemy', name: 'Far Enemy', ipc: 4, originalOwner: 'ussr', center: [7, 0], adj: ['far-landing'], coastTo: ['sz-4'] },
    { id: 'far-landing', name: 'Far Landing', ipc: 1, originalOwner: 'germany', center: [8, 0], adj: ['far-enemy'] },
  ],
  seaZones: [
    { id: 'sz-1', n: 1, center: [2, 0], adj: ['sz-2'], coastTo: ['coast'] },
    { id: 'sz-2', n: 2, center: [3, 0], adj: ['sz-1', 'sz-3'], coastTo: ['enemy'] },
    { id: 'sz-3', n: 3, center: [5, 0], adj: ['sz-2', 'sz-4'], coastTo: [] },
    { id: 'sz-4', n: 4, center: [6, 0], adj: ['sz-3'], coastTo: ['far-enemy'] },
  ],
  canals: [],
};
const idx = indexMap(map);
const control: SetupData['control'] = {
  home: 'germany',
  coast: 'germany',
  enemy: 'ussr',
  landing: 'germany',
  'far-enemy': 'ussr',
  'far-landing': 'germany',
};

function state(phase: AxisState['phase'], units: Record<string, UnitStack[]>): AxisState {
  const game = createAxis(map, { control, units }, {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard', seed: 19,
  });
  game.phase = phase;
  return game;
}

const durableSnapshot = (game: AxisState): string => JSON.stringify(game);

{
  const game = state('combatMove', {
    home: [{ power: 'germany', key: 'fighter', count: 1 }],
    enemy: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  const before = durableSnapshot(game);
  const rejected = applyAxisAction(game, idx, 'germany', {
    type: 'attack', target: 'enemy', forces: [{ from: 'home', units: [{ key: 'fighter', count: 1 }] }],
  });
  assert.equal(rejected.ok, false, 'full-range fighter attack needs a post-combat landing route');
  assert.equal(durableSnapshot(game), before, 'rejected air attack is fully atomic');

  game.powers.germany.techs.push('longRangeAircraft');
  const accepted = applyAxisAction(game, idx, 'germany', {
    type: 'attack', target: 'enemy', forces: [{ from: 'home', units: [{ key: 'fighter', count: 1 }] }],
  });
  assert.equal(accepted.ok, true, 'long-range fighter crosses the complete coast/sea path and retains a landing route');
  assert.equal(game.phase, 'battle');
}

{
  const game = state('combatMove', {
    home: [{ power: 'germany', key: 'bomber', count: 1 }],
    'far-enemy': [{ power: 'ussr', key: 'factory', count: 1 }],
  });
  const before = durableSnapshot(game);
  const rejected = applyAxisAction(game, idx, 'germany', {
    type: 'sbr', target: 'far-enemy', forces: [{ from: 'home', bombers: 1 }],
  });
  assert.equal(rejected.ok, false, 'an exact-range bomber raid without movement left to land is rejected');
  assert.equal(durableSnapshot(game), before, 'rejected raid does not roll dice, mark movement, or damage the factory');

  game.powers.germany.techs.push('longRangeAircraft');
  const rollsBeforeLaunch = game.rolls;
  const accepted = applyAxisAction(game, idx, 'germany', {
    type: 'sbr', target: 'far-enemy', forces: [{ from: 'home', bombers: 1 }],
  });
  assert.equal(accepted.ok, true, 'long-range bomber raid follows a six-edge land/sea route and can land afterward');
  assert.equal(game.phase, 'battle');
  assert.equal(game.combat?.kind, 'strategicRaid');
  assert.equal(game.combat?.visualSeq, 0);
  assert.equal(game.rolls, rollsBeforeLaunch, 'launching the raid draws no RNG before the cinematic is ready');
  assert.equal(game.factoryDamage['far-enemy'] ?? 0, 0, 'launching the raid applies no damage before its physical dice');
  assert.equal(game.board.home?.some((stack) => stack.key === 'bomber') ?? false, false, 'exact raider is committed out of its origin');
  assert.equal(game.board['far-enemy']?.some((stack) => stack.key === 'bomber') ?? false, false, 'raider is not restored before the raid report closes');

  const combatId = game.combat!.id;
  assert.equal(applyAxisAction(game, idx, 'germany', {
    type: 'battleRoll', combatId, visualSeq: 0,
  }).ok, true, 'cinematic strategic damage roll resolves after launch');
  assert.ok((game.factoryDamage['far-enemy'] ?? 0) > 0);
  assert.equal(game.combat?.battle.status, 'raid_resolved');
  assert.equal(game.combat?.raid?.appliedDamage, game.factoryDamage['far-enemy']);
  assert.equal(applyAxisAction(game, idx, 'germany', {
    type: 'battleContinue', combatId, visualSeq: 1,
  }).ok, true, 'raider acknowledges the cinematic report');
  assert.equal(applyAxisAction(game, idx, 'ussr', {
    type: 'battleContinue', combatId, visualSeq: 1,
  }).ok, true, 'factory defender acknowledges the cinematic report');
  assert.equal(game.board['far-enemy']?.some((stack) =>
    stack.key === 'bomber' && stack.movementSpent === 6 && stack.moved === 1), true,
  'surviving raider waits at the target with the exact attack distance spent');
  assert.equal(applyAxisAction(game, idx, 'germany', { type: 'endPhase' }).ok, true);
  assert.equal(applyAxisAction(game, idx, 'germany', {
    type: 'move', from: 'far-enemy', to: 'far-landing', units: [{ key: 'bomber', count: 1 }],
  }).ok, true, 'raider lands from the bombed territory using only its remaining movement');
}

{
  const game = state('noncombat', { home: [{ power: 'germany', key: 'fighter', count: 1 }] });
  const before = durableSnapshot(game);
  const rejected = applyAxisAction(game, idx, 'germany', {
    type: 'move', from: 'home', to: 'landing', units: [{ key: 'fighter', count: 1 }],
  });
  assert.equal(rejected.ok, false, 'ordinary fighter range does not reach a five-edge landing path');
  assert.equal(durableSnapshot(game), before, 'out-of-range noncombat air move is atomic');

  game.powers.germany.techs.push('longRangeAircraft');
  const accepted = applyAxisAction(game, idx, 'germany', {
    type: 'move', from: 'home', to: 'landing', units: [{ key: 'fighter', count: 1 }],
  });
  assert.equal(accepted.ok, true, 'noncombat air movement uses the full graph instead of a two-hop shortcut');
  assert.equal(game.board.landing?.some((stack) => stack.key === 'fighter' && stack.count === 1), true);
}

{
  const overloaded = state('noncombat', {
    'sz-1': [
      { power: 'germany', key: 'carrier', count: 1 },
      { power: 'germany', key: 'fighter', count: 3 },
    ],
  });
  const before = durableSnapshot(overloaded);
  const rejected = applyAxisAction(overloaded, idx, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2',
    units: [{ key: 'carrier', count: 1 }, { key: 'fighter', count: 3 }],
  });
  assert.equal(rejected.ok, false, 'one carrier cannot receive three selected fighters');
  assert.equal(durableSnapshot(overloaded), before, 'carrier-capacity rejection leaves every physical piece at origin');

  const exact = state('noncombat', {
    'sz-1': [
      { power: 'germany', key: 'carrier', count: 1 },
      { power: 'germany', key: 'fighter', count: 2 },
    ],
  });
  const accepted = applyAxisAction(exact, idx, 'germany', {
    type: 'move', from: 'sz-1', to: 'sz-2',
    units: [{ key: 'carrier', count: 1 }, { key: 'fighter', count: 2 }],
  });
  assert.equal(accepted.ok, true, 'carrier and exactly two fighters may move together into empty water');
  assert.equal(exact.board['sz-2']?.some((stack) => stack.key === 'carrier' && stack.count === 1), true);
  assert.equal(exact.board['sz-2']?.some((stack) => stack.key === 'fighter' && stack.count === 2), true);
}

{
  const game = state('combatMove', {
    coast: [{ power: 'germany', key: 'fighter', count: 1 }],
    landing: [{ power: 'germany', key: 'fighter', count: 1 }],
    enemy: [{ power: 'ussr', key: 'infantry', count: 1 }],
  });
  const attack = applyAxisAction(game, idx, 'germany', {
    type: 'attack',
    target: 'enemy',
    // Preserve the farther origin first so aggregate fallback resolution cannot
    // silently choose the fighter with more movement remaining.
    forces: [
      { from: 'coast', units: [{ key: 'fighter', count: 1 }] },
      { from: 'landing', units: [{ key: 'fighter', count: 1 }] },
    ],
  });
  assert.equal(attack.ok, true);
  assert.deepEqual(game.combat?.battle.attacker.map((unit) => unit.movementSpent), [3, 1],
    'mixed-origin battle units retain their individual attack distances');

  // End the fixture as a retreat without depending on random combat dice. The
  // normal two-commander report flow invokes finishBattle and restores pieces.
  game.combat!.battle.status = 'retreated';
  game.combat!.battle.decision = null;
  game.combat!.retreatTo = null;
  game.combat!.confirmed = { attacker: false, defender: false };
  game.pendings = [
    { id: game.pendingSeq++, power: 'germany', kind: 'battle-continue', data: { side: 'attacker' } },
    { id: game.pendingSeq++, power: 'ussr', kind: 'battle-continue', data: { side: 'defender' } },
  ];
  assert.equal(applyAxisAction(game, idx, 'germany', { type: 'battleContinue' }).ok, true);
  assert.equal(applyAxisAction(game, idx, 'ussr', { type: 'battleContinue' }).ok, true);
  assert.deepEqual(game.board.enemy
    ?.filter((stack) => stack.power === 'germany' && stack.key === 'fighter')
    .map((stack) => stack.movementSpent), [3, 1],
  'surviving same-type aircraft restore as separate spent-distance stacks');

  assert.equal(applyAxisAction(game, idx, 'germany', { type: 'endPhase' }).ok, true);
  const before = durableSnapshot(game);
  const tooFar = applyAxisAction(game, idx, 'germany', {
    type: 'move', from: 'enemy', to: 'coast', units: [{ key: 'fighter', count: 1 }],
  });
  assert.equal(tooFar.ok, false, 'the first physical fighter has only one point left and cannot use its wingmate\'s range');
  assert.equal(durableSnapshot(game), before, 'mixed-range rejection is atomic');
  assert.equal(applyAxisAction(game, idx, 'germany', {
    type: 'move', from: 'enemy', to: 'landing', units: [{ key: 'fighter', count: 1 }],
  }).ok, true, 'the same low-remaining fighter may still take its adjacent legal landing');
}

console.log('axis air actions: all assertions passed');
