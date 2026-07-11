import assert from 'node:assert/strict';
import correctionsJson from '../../../games/axis-allies/golden/setup-asia-corrections.json';
import mapJson from './map-data.json';
import setupJson from './setup-data.json';
import type { Scenario, UnitKey } from './config.js';
import type { TerritoryDef } from './map.js';
import type { SetupData } from './state.js';
import {
  chinaInfantryGrantFromControl,
  chinaFighterAttackHasLanding,
  chinaMoveDistance,
  chinaPlacementSpaces,
  chinaReachableDistances,
  chineseUnitCount,
  controllerAfterChineseCapture,
  isChinaOperatingTerritory,
} from './china.js';

interface CorrectedStack {
  power: string;
  key: UnitKey;
  count: number;
}

interface ScenarioCorrection {
  units: Record<string, CorrectedStack[]>;
  control: Record<string, string | null>;
}

const territories = (mapJson as unknown as { territories: TerritoryDef[] }).territories;
const territoryById = Object.fromEntries(territories.map((territory) => [territory.id, territory]));
const setups = setupJson as unknown as Record<Scenario, SetupData>;
const corrections = correctionsJson as unknown as Record<Scenario, ScenarioCorrection>;

for (const scenario of ['1941', '1942'] as const) {
  const setup = setups[scenario];
  const correction = corrections[scenario];

  for (const [space, expected] of Object.entries(correction.units)) {
    assert.deepEqual(setup.units[space] ?? [], expected, `${scenario} corrected ${space} setup`);
  }
  for (const [space, expected] of Object.entries(correction.control)) {
    assert.equal(setup.control[space], expected, `${scenario} corrected ${space} control`);
  }

  const chinesePieces = Object.entries(setup.units).flatMap(([space, stacks]) =>
    stacks.filter((stack) => stack.power === 'china').map((stack) => ({ space, ...stack })));
  assert.ok(chinesePieces.length > 0, `${scenario} includes Chinese pieces`);
  for (const piece of chinesePieces) {
    assert.equal(
      isChinaOperatingTerritory(territoryById[piece.space]),
      true,
      `${scenario} ${piece.key} stays in the Chinese operating region (${piece.space})`,
    );
  }

  const flyingTigers = chinesePieces.filter((piece) => piece.key === 'fighter');
  assert.deepEqual(
    flyingTigers.map(({ space, count }) => ({ space, count })),
    [{ space: 'yunnan', count: 1 }],
    `${scenario} Flying Tigers begin in Yunnan as a Chinese fighter`,
  );
  const infantry = chinesePieces
    .filter((piece) => piece.key === 'infantry')
    .reduce((total, piece) => total + piece.count, 0);
  assert.equal(infantry, scenario === '1941' ? 4 : 9, `${scenario} Chinese infantry setup total`);
}

for (const id of ['yunnan', 'manchuria', 'kiangsu', 'kwangtung']) {
  assert.equal(isChinaOperatingTerritory(territoryById[id]), true, `${id} is in China's operating region`);
}
for (const id of ['burma', 'french-indo-china-thailand']) {
  assert.equal(isChinaOperatingTerritory(territoryById[id]), false, `${id} is outside China's operating region`);
}

{
  const control = Object.fromEntries(
    territories.filter((territory) => territory.isChinese).map((territory) => [territory.id, 'china']),
  );
  assert.equal(chinaInfantryGrantFromControl(territories, control), 4, 'nine Chinese territories grant four infantry');
  assert.equal(
    chinaInfantryGrantFromControl(territories, { ...control, kwangtung: 'china' }),
    5,
    'Chinese-controlled Kwangtung contributes to the grant',
  );
  assert.equal(
    chinaInfantryGrantFromControl(territories, { ...control, yunnan: 'usa', sikang: 'uk' }),
    4,
    'Chinese territories held by major Allied powers still contribute to the grant',
  );
  assert.equal(
    chinaInfantryGrantFromControl(territories, { ...control, yunnan: 'japan', sikang: 'germany' }),
    3,
    'Chinese territories under Axis control do not contribute to the grant',
  );
  assert.equal(
    chinaInfantryGrantFromControl(territories, { ...control, kwangtung: 'uk' }),
    4,
    'Kwangtung contributes only when China itself controls it',
  );
}

{
  const control = { yunnan: 'china', hupeh: 'china', kwangtung: 'china' };
  const board = {
    yunnan: [
      { power: 'china', count: 2 },
      { power: 'uk', count: 8 },
    ],
    hupeh: [
      { power: 'china', count: 2 },
      { power: 'china', count: 1 },
    ],
  };
  const choices = chinaPlacementSpaces(territories, control, board);
  assert.equal(chineseUnitCount(board.yunnan), 2, 'Allied pieces do not count as Chinese pieces');
  assert.ok(choices.includes('yunnan'), 'a territory starting below three Chinese pieces is eligible');
  assert.ok(!choices.includes('hupeh'), 'a territory starting with three Chinese pieces is ineligible');
  assert.ok(choices.includes('kwangtung'), 'Chinese-controlled Kwangtung is eligible');
  assert.ok(
    !chinaPlacementSpaces(territories, { ...control, kwangtung: 'uk' }, board).includes('kwangtung'),
    'UK-controlled Kwangtung is not a Chinese placement space',
  );
}

assert.equal(controllerAfterChineseCapture('yunnan', true), 'china', 'China retains ordinary captures');
assert.equal(controllerAfterChineseCapture('kwangtung', true), 'uk', 'Kwangtung is restored to a functioning UK');
assert.equal(controllerAfterChineseCapture('kwangtung', false), 'china', 'China holds Kwangtung while London is occupied');

{
  const reachable = chinaReachableDistances(territories, 'yunnan', 4);
  assert.equal(reachable.get('kwangtung'), 1, 'Flying Tigers can reach Kwangtung inside their region');
  assert.equal(reachable.has('burma'), false, 'China movement graph cannot cross Burma');
  assert.equal(reachable.has('french-indo-china-thailand'), false, 'China movement graph cannot cross French Indo-China');
  assert.equal(chinaMoveDistance(territories, 'yunnan', 'burma', 4), null, 'restricted distance never uses an outside shortcut');
  assert.equal(chinaFighterAttackHasLanding({
    territories,
    control: { yunnan: 'china', kwangtung: 'japan' },
    contested: ['kwangtung'],
    from: 'yunnan',
    target: 'kwangtung',
  }), true, 'Flying Tigers can attack when enough restricted movement remains to return');
  assert.equal(chinaFighterAttackHasLanding({
    territories,
    control: { yunnan: 'japan', kwangtung: 'japan' },
    contested: ['kwangtung'],
    from: 'yunnan',
    target: 'kwangtung',
  }), false, 'Flying Tigers cannot launch a suicide attack without an in-region landing');
}

console.log('axis China rules: all checks passed');
