import assert from 'node:assert/strict';
import { applyAxisAction } from './actions.js';
import { stepDice } from './battle.js';
import { indexMap, type AxisMap } from './map.js';
import { createAxis, type AxisState, type SetupData } from './state.js';

const MAP: AxisMap = {
  territories: [
    {
      id: 'germany', name: 'Germany', ipc: 10, originalOwner: 'germany',
      isCapital: true, center: [0, 0], adj: ['target'], coastTo: [],
    },
    {
      id: 'target', name: 'Target', ipc: 6, originalOwner: 'uk',
      center: [1, 0], adj: ['germany'], coastTo: [],
    },
  ],
  seaZones: [],
  canals: [],
};

const SETUP: SetupData = {
  units: {
    germany: [
      { power: 'germany', key: 'fighter', count: 1 },
      { power: 'germany', key: 'bomber', count: 1 },
    ],
    target: [
      { power: 'uk', key: 'infantry', count: 1 },
      { power: 'uk', key: 'aaGun', count: 1 },
      { power: 'usa', key: 'aaGun', count: 1 },
      { power: 'uk', key: 'factory', count: 1 },
    ],
  },
  control: { germany: 'germany', target: 'uk' },
};

const idx = indexMap(MAP);

function fresh(radar = true): AxisState {
  const state = createAxis(MAP, SETUP, {
    scenario: '1941', rnd: false, nationalObjectives: false,
    winCondition: 'standard', seed: 31,
  });
  state.phase = 'combatMove';
  state.powers.usa.techs = radar ? ['radar'] : [];
  return state;
}

// In an allied defense, Radar belongs to the physical gun owner. It must not
// depend on stack order or leak from a side-wide fallback.
{
  const state = fresh();
  const result = applyAxisAction(state, idx, 'germany', {
    type: 'attack', target: 'target',
    forces: [{ from: 'germany', units: [{ key: 'fighter', count: 1 }] }],
  });
  assert.equal(result.ok, true, result.error);
  const battle = state.combat!.battle;
  const guns = battle.defender.filter((unit) => unit.key === 'aaGun');
  assert.equal(guns.length, 2, 'every allied AA gun enters the battle');
  assert.equal(guns.find((unit) => unit.power === 'usa')?.techs?.includes('radar'), true);
  assert.deepEqual(guns.find((unit) => unit.power === 'uk')?.techs, []);

  const aircraft = battle.attacker.find((unit) => unit.key === 'fighter')!;
  const dice = stepDice(battle, 'aa_fire');
  assert.equal(dice.length, 1, 'only one AA shot is assigned to each aircraft');
  assert.equal(dice[0].hitOn, 2, 'the defending coalition selects its Radar AA gun');
  assert.equal(dice[0].targetUid, aircraft.uid, 'the AA shot names its exact aircraft');
}

// Strategic raids use the same multinational, owner-local AA contract and do
// not discard additional guns merely because the factory has another owner.
{
  const state = fresh();
  const result = applyAxisAction(state, idx, 'germany', {
    type: 'sbr', target: 'target', forces: [{ from: 'germany', bombers: 1 }],
  });
  assert.equal(result.ok, true, result.error);
  const battle = state.combat!.battle;
  const guns = battle.defender.filter((unit) => unit.key === 'aaGun');
  assert.equal(guns.length, 2, 'every allied AA gun is represented in the raid');
  assert.equal(guns.find((unit) => unit.power === 'usa')?.techs?.includes('radar'), true);

  const bomber = battle.attacker.find((unit) => unit.key === 'bomber')!;
  const dice = stepDice(battle, 'aa_fire');
  assert.equal(dice.length, 1);
  assert.equal(dice[0].hitOn, 2);
  assert.equal(dice[0].targetUid, bomber.uid);
}

// Without any owner-local Radar advance, the same defense remains a 1.
{
  const state = fresh(false);
  const result = applyAxisAction(state, idx, 'germany', {
    type: 'sbr', target: 'target', forces: [{ from: 'germany', bombers: 1 }],
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(stepDice(state.combat!.battle, 'aa_fire')[0].hitOn, 1);
}

console.log('axis AA actions: all checks passed');
