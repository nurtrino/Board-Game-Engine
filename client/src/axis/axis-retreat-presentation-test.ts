import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AxisRetreatPolicy } from '@bge/shared';
import {
  axisRetreatCopy,
  axisRetreatOutcomeText,
  axisRetreatSelectionKey,
  buildAxisRemainAction,
  buildAxisRetreatAction,
  initialAxisRetreatSelection,
  normalizeAxisRetreatSelection,
  type AxisRetreatCombat,
} from './axisRetreatPresentation.js';

const policy = (overrides: Partial<AxisRetreatPolicy> = {}): AxisRetreatPolicy => ({
  mode: 'full',
  destinations: ['alpha'],
  destinationRequired: true,
  canRetreat: true,
  movingUnitUids: [1],
  aircraftUnitUids: [],
  airDisengages: false,
  committedBeachUnitUids: [],
  submergedUnitUids: [],
  ...overrides,
});

const combat = (overrides: Partial<AxisRetreatCombat> = {}): AxisRetreatCombat => ({
  id: 17,
  visualSeq: 4,
  space: 'battle-space',
  retreatPolicy: policy(),
  battle: { decision: { type: 'retreat' } },
  ...overrides,
});

assert.equal(initialAxisRetreatSelection(policy()), 'alpha', 'one exact route is visibly preselected');
assert.equal(
  initialAxisRetreatSelection(policy({ destinations: ['alpha', 'bravo'] })),
  undefined,
  'multiple exact routes never auto-select',
);
assert.equal(
  initialAxisRetreatSelection(policy({ destinations: [], canRetreat: false })),
  undefined,
  'a no-route force never receives a fabricated default',
);
assert.equal(
  normalizeAxisRetreatSelection(policy({ destinations: ['alpha', 'bravo'] }), 'stale'),
  undefined,
  'a stale controller choice disappears before the effect reset',
);

assert.deepEqual(
  buildAxisRetreatAction(combat(), 'alpha', true),
  { type: 'battleRetreat', retreat: true, destination: 'alpha', combatId: 17, visualSeq: 4 },
  'retreat payload includes the exact destination and battle generation',
);
assert.equal(buildAxisRetreatAction(combat(), 'alpha', false), null, 'retreat remains locked until the cinematic generation is ready');
assert.equal(
  buildAxisRetreatAction(combat({ retreatPolicy: policy({ destinations: ['alpha', 'bravo'] }) }), undefined, true),
  null,
  'multiple routes require an explicit selection before confirm',
);
assert.equal(
  buildAxisRetreatAction(combat({ retreatPolicy: policy({ destinations: [], canRetreat: false }) }), undefined, true),
  null,
  'no-route retreat is disabled',
);
assert.deepEqual(
  buildAxisRemainAction(combat(), true),
  { type: 'battleRetreat', retreat: false, combatId: 17, visualSeq: 4 },
  'remaining never smuggles a retreat destination',
);
assert.equal(buildAxisRemainAction(combat(), false), null, 'remain is also locked behind cinematic readiness');

{
  const airPolicy = policy({
    destinations: [],
    destinationRequired: false,
    movingUnitUids: [],
    aircraftUnitUids: [2, 3],
    airDisengages: true,
  });
  const airCombat = combat({ retreatPolicy: airPolicy });
  assert.equal(initialAxisRetreatSelection(airPolicy), null, 'air-only disengagement deterministically selects the null destination');
  assert.deepEqual(
    buildAxisRetreatAction(airCombat, null, true),
    { type: 'battleRetreat', retreat: true, destination: null, combatId: 17, visualSeq: 4 },
    'air-only payload explicitly sends null',
  );
  assert.equal(axisRetreatCopy(airCombat).retreatLabel, 'DISENGAGE AIRCRAFT');
}

{
  const mixed = combat({
    retreatPolicy: policy({ mode: 'partial-amphibious', committedBeachUnitUids: [8, 9], aircraftUnitUids: [3] }),
  });
  const copy = axisRetreatCopy(mixed);
  assert.match(copy.body, /overland units and aircraft withdraw together/i);
  assert.match(copy.body, /Seaborne troops.*remain/i);
}

{
  const standoff = combat({ battle: { decision: { type: 'retreat', terminalStandoff: true } } });
  const copy = axisRetreatCopy(standoff);
  assert.equal(copy.remainLabel, 'REMAIN', 'transport standoff never calls remaining "press the attack"');
  assert.match(copy.body, /every attacking transport/i);
}

assert.notEqual(
  axisRetreatSelectionKey(combat()),
  axisRetreatSelectionKey(combat({ visualSeq: 5 })),
  'a new visual generation clears local retreat selection',
);
assert.notEqual(
  axisRetreatSelectionKey(combat()),
  axisRetreatSelectionKey(combat({ retreatPolicy: policy({ destinations: ['bravo'] }) })),
  'an authoritative policy change clears local retreat selection',
);
assert.equal(
  axisRetreatOutcomeText('Germany', 'alpha', 'battle-space', (space) => space.toUpperCase()),
  'Germany retreats to ALPHA',
  'reports name the chosen destination',
);
assert.equal(
  axisRetreatOutcomeText('Germany', null, 'battle-space', (space) => space.toUpperCase()),
  'Germany aircraft disengage over BATTLE-SPACE',
  'air-only reports describe disengagement instead of a fabricated route',
);

const playSource = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
assert.match(playSource, /buildAxisRetreatAction/, 'controller retreat submit goes through the pure exact-payload builder');
assert.match(playSource, /retreatPolicy\.destinations/, 'controller map and route cards come from the authoritative policy');
assert.match(playSource, /battleVisualReady/, 'controller keeps retreat actions behind visual readiness');
assert.doesNotMatch(
  playSource,
  /type:\s*'battleRetreat',\s*retreat:\s*true,\s*combatId/,
  'controller has no destination-less retreat payload escape hatch',
);

const stageSource = readFileSync(new URL('./AxisBattleStage.tsx', import.meta.url), 'utf8');
assert.match(stageSource, /retreatTo/, 'cinematic and final reports read the persisted chosen destination');
assert.match(stageSource, /REMAIN/, 'transport standoff copy is explicit on the cinematic stage');

console.log('axis retreat presentation: all checks passed');

