import { strict as assert } from 'node:assert';
import {
  applyAxisDefendingCarrierLandingChoice,
  deriveAxisDefendingCarrierLandingProgress,
  validateAxisDefendingCarrierLandingSnapshot,
  type AxisDefendingCarrierLandingChoice,
  type AxisDefendingCarrierLandingSnapshot,
} from './defendingCarrierLandings.js';

const baseSnapshot = (
  overrides: Partial<AxisDefendingCarrierLandingSnapshot> = {},
): AxisDefendingCarrierLandingSnapshot => ({
  timing: { allCombatsResolved: true, ordinaryNoncombatStarted: false },
  fighters: [{ ref: 'fighter:usa:7', power: 'usa', originSeaZone: 'sz-1', homeCarrierRef: 'carrier:uk:2' }],
  carriers: [],
  seaZones: [
    { id: 'sz-1', adjacentSeaZones: ['sz-2'], adjacentTerritories: ['coast'] },
    { id: 'sz-2', adjacentSeaZones: ['sz-1', 'sz-3'], adjacentTerritories: [] },
    { id: 'sz-3', adjacentSeaZones: ['sz-2'], adjacentTerritories: ['far-coast'] },
  ],
  territories: [
    { id: 'coast', controller: 'uk' },
    { id: 'far-coast', controller: 'usa' },
  ],
  ...overrides,
});

{
  const snapshot = baseSnapshot({
    carriers: [
      { ref: 'carrier:uk:2', power: 'uk', seaZone: 'sz-1', occupied: 0 },
      { ref: 'carrier:usa:9', power: 'usa', seaZone: 'sz-2', occupied: 0 },
    ],
  });
  const progress = deriveAxisDefendingCarrierLandingProgress(snapshot);
  assert.equal(progress.ok, true);
  assert.equal(progress.status, 'decision');
  if (!progress.ok || progress.status !== 'decision') throw new Error('expected a landing decision');
  assert.equal(progress.decision.owner, 'usa', 'the exact fighter owner receives a multinational landing prompt');
  assert.deepEqual(progress.decision.options, [{
    fighterRef: 'fighter:usa:7',
    fighterPower: 'usa',
    kind: 'carrier',
    carrierRef: 'carrier:uk:2',
    carrierPower: 'uk',
    space: 'sz-1',
    distance: 0,
    ruleStep: 'home-carrier',
  }], 'an open surviving home carrier is compulsory, even when owned by an ally');
  assert.equal(JSON.stringify(snapshot), JSON.stringify(baseSnapshot({
    carriers: [
      { ref: 'carrier:uk:2', power: 'uk', seaZone: 'sz-1', occupied: 0 },
      { ref: 'carrier:usa:9', power: 'usa', seaZone: 'sz-2', occupied: 0 },
    ],
  })), 'derivation does not mutate its snapshot');
}

{
  const snapshot = baseSnapshot({
    carriers: [
      { ref: 'carrier:uk:2', power: 'uk', seaZone: 'sz-1', occupied: 2 },
      { ref: 'carrier:uk:1', power: 'uk', seaZone: 'sz-1', occupied: 1 },
      { ref: 'carrier:usa:3', power: 'usa', seaZone: 'sz-1', occupied: 0 },
      { ref: 'carrier:germany:1', power: 'germany', seaZone: 'sz-1', occupied: 0 },
      { ref: 'carrier:usa:9', power: 'usa', seaZone: 'sz-2', occupied: 0 },
    ],
  });
  const progress = deriveAxisDefendingCarrierLandingProgress(snapshot);
  if (!progress.ok || progress.status !== 'decision') throw new Error('expected same-zone choices');
  assert.deepEqual(progress.decision.options.map((option) =>
    option.kind === 'carrier' ? [option.carrierRef, option.ruleStep, option.distance] : option.kind), [
    ['carrier:uk:1', 'same-zone-carrier', 0],
    ['carrier:usa:3', 'same-zone-carrier', 0],
  ], 'a full home deck falls back to exact friendly same-zone hulls before land or adjacent decks');
}

{
  const snapshot = baseSnapshot({
    carriers: [
      { ref: 'carrier:usa:adjacent', power: 'usa', seaZone: 'sz-2', occupied: 1 },
      { ref: 'carrier:uk:hostile', power: 'uk', seaZone: 'sz-2-hostile', occupied: 0 },
      { ref: 'carrier:usa:far', power: 'usa', seaZone: 'sz-3', occupied: 0 },
      { ref: 'carrier:germany:enemy', power: 'germany', seaZone: 'sz-2', occupied: 0 },
    ],
    seaZones: [
      { id: 'sz-1', adjacentSeaZones: ['sz-2', 'sz-2-hostile'], adjacentTerritories: ['coast', 'enemy-coast', 'hot-coast'] },
      { id: 'sz-2', adjacentSeaZones: ['sz-1', 'sz-3'], adjacentTerritories: [] },
      { id: 'sz-2-hostile', adjacentSeaZones: ['sz-1'], adjacentTerritories: [], hostileTo: ['allies'] },
      { id: 'sz-3', adjacentSeaZones: ['sz-2'], adjacentTerritories: ['far-coast'] },
    ],
    territories: [
      { id: 'coast', controller: 'uk' },
      { id: 'enemy-coast', controller: 'germany' },
      { id: 'hot-coast', controller: 'usa', hostileTo: ['allies'] },
      { id: 'far-coast', controller: 'usa' },
    ],
  });
  const progress = deriveAxisDefendingCarrierLandingProgress(snapshot);
  if (!progress.ok || progress.status !== 'decision') throw new Error('expected one-space choices');
  assert.equal(progress.decision.ruleStep, 'one-space');
  assert.deepEqual(progress.decision.options.map((option) =>
    option.kind === 'carrier' ? `carrier:${option.carrierRef}@${option.space}`
      : option.kind === 'territory' ? `land:${option.territory}` : 'destroy'), [
    'land:coast',
    'carrier:carrier:usa:adjacent@sz-2',
  ], 'only direct friendly non-hostile destinations are offered in stable order');
  assert.ok(!progress.decision.options.some((option) => option.space === 'sz-3' || option.space === 'far-coast'),
    'the emergency move never searches a second edge');
}

{
  const snapshot = baseSnapshot({
    territories: [{ id: 'coast', controller: 'germany' }, { id: 'far-coast', controller: 'usa' }],
  });
  const progress = deriveAxisDefendingCarrierLandingProgress(snapshot);
  if (!progress.ok || progress.status !== 'decision') throw new Error('expected forced loss');
  assert.deepEqual(progress.decision.options, [{
    fighterRef: 'fighter:usa:7', fighterPower: 'usa', kind: 'destroy',
    space: null, distance: null, ruleStep: 'no-landing',
  }], 'a fighter with no legal same-zone or one-space landing is explicitly destroyed');
  const illegalSurvival = applyAxisDefendingCarrierLandingChoice(snapshot, [], {
    fighterRef: 'fighter:usa:7', kind: 'territory', territory: 'far-coast',
  });
  assert.equal(illegalSurvival.ok, false, 'a two-edge destination cannot bypass the forced loss');
  const loss = applyAxisDefendingCarrierLandingChoice(snapshot, [], {
    fighterRef: 'fighter:usa:7', kind: 'destroy',
  });
  assert.equal(loss.ok, true);
  assert.equal(loss.progress.status, 'complete');
}

{
  const snapshot = baseSnapshot({
    timing: { allCombatsResolved: false, ordinaryNoncombatStarted: false },
    carriers: [{ ref: 'carrier:uk:2', power: 'uk', seaZone: 'sz-1', occupied: 0 }],
  });
  const waiting = deriveAxisDefendingCarrierLandingProgress(snapshot);
  assert.equal(waiting.status, 'waiting-for-combat', 'the queue is invisible until all acting-player combats conclude');
  const early = applyAxisDefendingCarrierLandingChoice(snapshot, [], {
    fighterRef: 'fighter:usa:7', kind: 'carrier', carrierRef: 'carrier:uk:2',
  });
  assert.equal(early.ok, false);
  if (!early.ok) assert.match(early.error, /after every combat/i);

  const late = deriveAxisDefendingCarrierLandingProgress({
    ...snapshot,
    timing: { allCombatsResolved: true, ordinaryNoncombatStarted: true },
  });
  assert.equal(late.ok, false, 'ordinary noncombat is blocked while an emergency landing remains');
  if (!late.ok) assert.match(late.error, /before ordinary noncombat/i);
}

{
  const snapshot = baseSnapshot({
    fighters: [
      { ref: 'fighter:usa:z', power: 'usa', originSeaZone: 'sz-1', homeCarrierRef: 'carrier:uk:home' },
      { ref: 'fighter:uk:a', power: 'uk', originSeaZone: 'sz-1', homeCarrierRef: 'carrier:uk:sunk' },
    ],
    carriers: [
      { ref: 'carrier:uk:home', power: 'uk', seaZone: 'sz-1', occupied: 1 },
      { ref: 'carrier:usa:adjacent', power: 'usa', seaZone: 'sz-2', occupied: 0 },
    ],
  });
  const first = deriveAxisDefendingCarrierLandingProgress(snapshot);
  if (!first.ok || first.status !== 'decision') throw new Error('expected exact first fighter');
  assert.equal(first.decision.fighter.ref, 'fighter:usa:z',
    'home-carrier claims resolve before another fighter can consume that deck');

  const wrongFighter = applyAxisDefendingCarrierLandingChoice(snapshot, [], {
    fighterRef: 'fighter:uk:a', kind: 'carrier', carrierRef: 'carrier:uk:home',
  });
  assert.equal(wrongFighter.ok, false, 'out-of-order exact refs cannot race deck capacity');

  const home = applyAxisDefendingCarrierLandingChoice(snapshot, [], {
    fighterRef: 'fighter:usa:z', kind: 'carrier', carrierRef: 'carrier:uk:home',
  });
  assert.equal(home.ok, true);
  if (!home.ok || !home.progress.ok || home.progress.status !== 'decision') throw new Error('expected second decision');
  assert.equal(home.progress.decision.fighter.ref, 'fighter:uk:a');
  assert.deepEqual(home.progress.decision.options.map((option) => option.space), ['coast', 'sz-2'],
    'the second allied fighter sees capacity after the exact first assignment');
  assert.equal(home.progress.decks.find((deck) => deck.carrierRef === 'carrier:uk:home')?.open, 0);

  const choicesBefore = JSON.stringify(home.choices);
  const adjacent = applyAxisDefendingCarrierLandingChoice(snapshot, home.choices, {
    fighterRef: 'fighter:uk:a', kind: 'carrier', carrierRef: 'carrier:usa:adjacent',
  });
  assert.equal(adjacent.ok, true);
  assert.equal(adjacent.progress.status, 'complete');
  assert.equal(JSON.stringify(home.choices), choicesBefore, 'appending a resolution never mutates the prior ledger');
}

{
  const malformed = baseSnapshot({
    fighters: [
      { ref: 'dup', power: 'usa', originSeaZone: 'sz-1', homeCarrierRef: 'carrier:lost' },
      { ref: 'dup', power: 'uk', originSeaZone: 'sz-1', homeCarrierRef: 'carrier:lost' },
      { ref: 'third', power: 'usa', originSeaZone: 'sz-1', homeCarrierRef: 'carrier:lost' },
    ],
    carriers: [{ ref: ' full ', power: 'uk', seaZone: 'sz-1', occupied: 3 }],
  });
  const issues = validateAxisDefendingCarrierLandingSnapshot(malformed);
  assert.ok(issues.some((issue) => issue.includes('Duplicate fighter ref')));
  assert.ok(issues.some((issue) => issue.includes('nonempty, trimmed')));
  assert.ok(issues.some((issue) => issue.includes('0-2 occupied')));
  assert.ok(issues.some((issue) => issue.includes('can base only two')));
  assert.equal(deriveAxisDefendingCarrierLandingProgress(malformed).ok, false,
    'malformed exact physical state is reported instead of normalized');
}

{
  const snapshot = baseSnapshot({
    carriers: [{ ref: 'carrier:uk:2', power: 'uk', seaZone: 'sz-1', occupied: 0 }],
  });
  const staleLedger: AxisDefendingCarrierLandingChoice[] = [
    { fighterRef: 'fighter:usa:7', kind: 'carrier', carrierRef: 'carrier:uk:2' },
    { fighterRef: 'fighter:usa:7', kind: 'carrier', carrierRef: 'carrier:uk:2' },
  ];
  const replayed = deriveAxisDefendingCarrierLandingProgress(snapshot, staleLedger);
  assert.equal(replayed.ok, false, 'duplicate/stale exact choices cannot be replayed');
  if (!replayed.ok) assert.match(replayed.error, /stale/i);
}

console.log('Axis defending carrier fighter landing tests passed');
