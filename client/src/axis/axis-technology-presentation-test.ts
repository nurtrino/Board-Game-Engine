import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STARTING_IPCS } from '@bge/shared';
import {
  axisCurrentUnitReference,
  axisFactoryRepairOffer,
  axisResearchChartPresentation,
} from './axisTechnologyPresentation';

assert.equal(STARTING_IPCS['1942'].germany, 37, '1942 Germany begins with the official 37 IPCs');

{
  const techs = ['improvedShipyards', 'jetFighters', 'superSubs', 'longRangeAircraft'] as const;
  assert.deepEqual(axisCurrentUnitReference('fighter', techs), {
    cost: 10, attack: 4, defense: 4, move: 6,
    costModified: false, attackModified: true, moveModified: true,
  });
  assert.deepEqual(axisCurrentUnitReference('submarine', techs), {
    cost: 5, attack: 3, defense: 1, move: 2,
    costModified: true, attackModified: true, moveModified: false,
  });
  assert.equal(axisCurrentUnitReference('bomber', techs).move, 8);
  assert.equal(axisCurrentUnitReference('battleship', techs).cost, 17);
  assert.equal(axisCurrentUnitReference('infantry', techs).attack, 1,
    'conditional artillery support is not misrepresented as an unconditional profile change');
}

assert.equal(axisFactoryRepairOffer(0, ['increasedFactory']), null);
assert.deepEqual(axisFactoryRepairOffer(3, ['increasedFactory']), { count: 2, cost: 1, discounted: true });
assert.deepEqual(axisFactoryRepairOffer(1, ['increasedFactory']), { count: 1, cost: 1, discounted: false });
assert.deepEqual(axisFactoryRepairOffer(4, []), { count: 1, cost: 1, discounted: false });

{
  const charts = axisResearchChartPresentation([
    'advancedArtillery', 'rockets', 'paratroopers', 'increasedFactory', 'warBonds', 'mechanizedInfantry',
  ]);
  assert.equal(charts[0].complete, true);
  assert.equal(charts[0].remaining, 0);
  assert.equal(charts[1].complete, false);
  assert.equal(charts[1].remaining, 6);
  assert.ok(charts[0].advances.every((advance) => advance.developed));
  assert.match(charts[0].advances.find((advance) => advance.key === 'rockets')!.text, /one AA gun per territory/i);
  assert.match(charts[0].advances.find((advance) => advance.key === 'paratroopers')!.text, /antiaircraft fire/i);
}

const play = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
assert.match(play, /axisResearchChartPresentation/, 'R&D UI uses the pure chart presentation contract');
assert.match(play, /disabled=\{chart\.complete\}/, 'completed research charts are disabled');
assert.match(play, /one breakthrough this turn/i, 'research copy states the one-breakthrough-per-turn limit');
assert.match(play, /axisFactoryRepairOffer/, 'repair UI uses the discounted batch contract');
assert.match(play, /count: offer\.count/, 'repair action sends the displayed one- or two-damage batch');
assert.match(play, /axisCurrentUnitReference/, 'purchase and nation references use current technology-adjusted values');

console.log('axis technology presentation: all checks passed');
