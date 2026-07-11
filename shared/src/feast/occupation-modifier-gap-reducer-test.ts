// Reducer-level regression coverage for occupation modifiers that alter an
// existing printed action or placement rule.
//
// These are deliberately end-to-end through applyFeastAction. Test setup may
// seed owned pieces/cards, but the behavior under test is never invoked through
// the occupation runtime/executor directly.
//
// Run: npx tsx shared/src/feast/occupation-modifier-gap-reducer-test.ts

import {
  applyFeastAction,
  createFeast,
  type FeastAction,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastResult,
  type FeastShipType,
  type FeastState,
} from './index.js';

interface FeatureResult {
  name: string;
  checks: number;
  failures: string[];
}

const features: FeatureResult[] = [];
let currentFeature: FeatureResult | null = null;

function feature(name: string, run: () => void): void {
  const result: FeatureResult = { name, checks: 0, failures: [] };
  features.push(result);
  currentFeature = result;
  try {
    run();
  } catch (error) {
    result.failures.push(`uncaught fixture error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    currentFeature = null;
  }
}

function check(condition: unknown, message: string): boolean {
  if (!currentFeature) throw new Error('check() called outside a feature');
  currentFeature.checks++;
  if (!condition) currentFeature.failures.push(message);
  return !!condition;
}

function equal(actual: unknown, expected: unknown, message: string): boolean {
  return check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`,
  );
}

function fresh(seed: number): FeastState {
  const state = createFeast(
    [{ name: 'Occupation Modifier Tester', color: 'Red' }],
    seed,
    { length: 'short', occupationMode: 'all' },
  );
  const player = state.players[0];
  state.phase = 'actions';
  state.turn = 0;
  state.pending = [];
  player.passed = false;
  player.turnActionTaken = false;
  player.turnMayEnd = false;
  player.turnEffectUsed = false;
  player.turnActionId = null;
  player.workersAvailable = Math.max(player.workersAvailable, 7);
  return state;
}

function playDirectly(state: FeastState, ...numbers: number[]): void {
  const player = state.players[0];
  player.playedOccupations = numbers.map((number) => `occupation-${number}`);
  // An empty hand avoids the unrelated fourth-column occupation timing prompt.
  player.occupationHand = [];
}

function addShip(state: FeastState, type: FeastShipType, id = `test-${type}`): string {
  state.players[0].ships.push({ id, type, ore: 0, emigrated: false, emigratedRound: null });
  return id;
}

function apply(state: FeastState, action: FeastAction): FeastResult {
  return applyFeastAction(state, 0, action);
}

function applyExpected(state: FeastState, action: FeastAction, label: string): boolean {
  const result = apply(state, action);
  return check(result.ok, `${label}${result.error ? `: ${result.error}` : ''}`);
}

function head(state: FeastState, kind?: FeastPendingDecision['kind']): FeastPendingDecision | null {
  const decision = state.pending[0] ?? null;
  if (kind) check(decision?.kind === kind, `expected a ${kind} decision, got ${decision?.kind ?? 'none'}`);
  return decision;
}

function resolve(
  state: FeastState,
  decision: FeastPendingDecision,
  choice: FeastDecisionChoice,
  label: string,
): boolean {
  return applyExpected(state, {
    type: 'resolve_decision', decisionId: decision.id, choice,
  }, label);
}

/** Accept modifier confirmations that interrupt an otherwise printed action. */
function acceptCardEffects(state: FeastState, label: string): boolean {
  for (let guard = 0; guard < 12 && state.pending[0]?.kind === 'card-effect'; guard++) {
    const decision = state.pending[0];
    const enabled = decision.options.filter((option) => !option.disabled);
    const min = decision.min ?? 0;
    const choice: FeastDecisionChoice = {
      accepted: true,
      ...(min > 0 ? { optionIds: enabled.slice(0, min).map((option) => option.id) } : {}),
    };
    if (!resolve(state, decision, choice, `${label}: accept ${decision.label}`)) return false;
  }
  return check(state.pending[0]?.kind !== 'card-effect', `${label}: card-effect chain terminates`);
}

function startAndRollBattle(state: FeastState, actionSpaceId = 'raid'): FeastPendingDecision | null {
  if (!applyExpected(state, { type: 'place_workers', spaceId: actionSpaceId }, `start ${actionSpaceId}`)) return null;
  if (!acceptCardEffects(state, actionSpaceId)) return null;
  let decision = head(state, 'die');
  if (!decision || decision.kind !== 'die') return null;
  // Battle actions, like Whaling, now explicitly select the physical ship
  // used. This matters for Pillaging ore and Steersman's knarr substitution.
  if (decision.meta?.stage === 'boats') {
    const ship = decision.options.find((option) => !option.disabled);
    if (!ship || !resolve(state, decision, { optionIds: [ship.id] }, `choose ship for ${actionSpaceId}`)) return null;
    if (!acceptCardEffects(state, `${actionSpaceId} start`)) return null;
    decision = head(state, 'die');
    if (!decision || decision.kind !== 'die') return null;
  }
  if (!resolve(state, decision, { optionIds: ['roll'] }, `roll ${actionSpaceId}`)) return null;
  if (!acceptCardEffects(state, `${actionSpaceId} roll`)) return null;
  decision = head(state, 'die');
  return decision?.kind === 'die' ? decision : null;
}

function currentDieResult(decision: FeastPendingDecision | null): number | null {
  if (!decision || decision.kind !== 'die') return null;
  const value = decision.meta?.result;
  return typeof value === 'number' ? value : null;
}

function resolveBattle(
  state: FeastState,
  decision: FeastPendingDecision,
  allocations: { id: string; amount: number }[],
  label: string,
): boolean {
  if (!resolve(state, decision, { optionIds: ['resolve'], allocations }, label)) return false;
  return acceptCardEffects(state, `${label} aftermath`);
}

// ---------------------------------------------------------------------------
// 11 Trident Hunter: each spear is worth -2, replacing its normal -1 value.
// ---------------------------------------------------------------------------

feature('11 Trident Hunter — spear pays 2 during Whaling', () => {
  const state = fresh(1);
  playDirectly(state, 11);
  const boatId = addShip(state, 'whaling-boat');
  const player = state.players[0];
  player.resources.wood = 20;
  player.weapons.spear = 2;

  if (!applyExpected(state, { type: 'place_workers', spaceId: 'whaling-major' }, 'start Whaling')) return;
  let decision = head(state, 'die');
  if (!decision || decision.kind !== 'die') return;
  if (!resolve(state, decision, { optionIds: [boatId] }, 'choose one Whaling Boat')) return;
  decision = head(state, 'die');
  if (!decision || decision.kind !== 'die') return;
  if (!resolve(state, decision, { optionIds: ['roll'] }, 'roll Whaling die')) return;
  if (!acceptCardEffects(state, 'Whaling roll')) return;
  decision = head(state, 'die');
  const result = currentDieResult(decision);
  check(result !== null && result >= 2, 'fixture roll leaves at least 2 to pay after the selected boat');
  if (!decision || decision.kind !== 'die' || result === null || result < 2) return;

  const woodPaid = result - 2;
  const woodBefore = player.resources.wood;
  const spearsBefore = player.weapons.spear;
  const whaleBefore = player.goods['whale-meat'];
  const ok = resolve(state, decision, {
    optionIds: ['resolve'],
    allocations: [{ id: 'wood', amount: woodPaid }, { id: 'spear', amount: 1 }],
  }, 'pay remaining Whaling result with one double-value spear');

  check(ok, `one spear plus ${woodPaid} wood satisfies a Whaling result of ${result}`);
  equal(state.players[0].resources.wood, woodBefore - woodPaid, 'only the declared wood is spent');
  equal(state.players[0].weapons.spear, spearsBefore - 1, 'exactly one spear is spent');
  equal(state.players[0].goods['whale-meat'], whaleBefore + 1, 'successful payment awards Whale Meat');
});

// ---------------------------------------------------------------------------
// 89 Catapulter: each stone is worth +2, replacing its normal +1 value.
// ---------------------------------------------------------------------------

feature('89 Catapulter — stone pays 2 during Raiding/Pillaging', () => {
  for (const actionSpaceId of ['raid', 'pillage-2']) {
    const state = fresh(4); // deterministic first roll is below 6 for d8 and d12
    playDirectly(state, 89);
    addShip(state, 'longship');
    const player = state.players[0];
    player.resources.stone = 8;

    if (!applyExpected(state, { type: 'place_workers', spaceId: actionSpaceId }, `start passive ${actionSpaceId}`)) continue;
    check(state.pending[0]?.kind !== 'card-effect', `${actionSpaceId}: Catapulter has no action-start activation prompt`);
    let decision = head(state, 'die');
    if (!decision || decision.kind !== 'die') continue;
    if (decision.meta?.stage === 'boats') {
      const ship = decision.options.find((option) => !option.disabled);
      if (!ship || !resolve(state, decision, { optionIds: [ship.id] }, `choose Catapulter ship for ${actionSpaceId}`)) continue;
      check(state.pending[0]?.kind !== 'card-effect', `${actionSpaceId}: Catapulter has no ship-selection activation prompt`);
      decision = head(state, 'die');
      if (!decision || decision.kind !== 'die') continue;
    }
    if (!resolve(state, decision, { optionIds: ['roll'] }, `roll passive ${actionSpaceId}`)) continue;
    check(state.pending[0]?.kind !== 'card-effect', `${actionSpaceId}: Catapulter has no per-roll activation prompt`);
    decision = head(state, 'die');
    const rolled = currentDieResult(decision);
    check(rolled !== null && rolled < 6, `${actionSpaceId} fixture produces a result below the success threshold`);
    if (!decision || decision.kind !== 'die' || rolled === null) continue;
    const stones = Math.max(1, Math.ceil((6 - rolled) / 2));
    const expectedResult = rolled + stones * 2;
    const stoneBefore = player.resources.stone;
    const ok = resolveBattle(state, decision, [{ id: 'stone', amount: stones }], `resolve ${actionSpaceId} with Catapulter stones`);

    check(ok, `${actionSpaceId}: ${stones} stone at +2 each raises ${rolled} to legal result ${expectedResult}`);
    equal(state.players[0].resources.stone, stoneBefore - stones, `${actionSpaceId}: declared stones are spent once`);
    const loot = state.pending[0];
    check(loot?.kind === 'die-spend', `${actionSpaceId}: successful Catapulter payment reaches loot`);
    equal(loot?.meta?.result, expectedResult, `${actionSpaceId}: loot eligibility uses doubled stone value`);
  }
});

// ---------------------------------------------------------------------------
// 136 Raider: the modified result may be split across exactly two loot tiles.
// ---------------------------------------------------------------------------

feature('136 Raider — split battle result generates two loot tiles', () => {
  const state = fresh(1);
  playDirectly(state, 136);
  addShip(state, 'longship');
  const player = state.players[0];
  player.resources.stone = 20;
  const chestBefore = player.goods.chest;
  const runeBefore = player.goods['rune-stone'];

  const decision = startAndRollBattle(state, 'raid');
  const rolled = currentDieResult(decision);
  if (!decision || decision.kind !== 'die' || rolled === null) return;
  const target = 14; // Chest 8 + Rune Stone 6.
  if (!resolveBattle(state, decision, [{ id: 'stone', amount: target - rolled }], 'resolve Raider battle at 14')) return;

  const loot = head(state, 'die-spend');
  if (!loot || loot.kind !== 'die-spend') return;
  equal(loot.max, 2, 'accepted Raider split permits two loot selections');
  check(loot.options.some((option) => option.id === 'good:chest'), 'Chest is offered at sword value 8');
  check(loot.options.some((option) => option.id === 'good:rune-stone'), 'Rune Stone is offered at sword value 6');
  const ok = resolve(state, loot, { optionIds: ['good:chest', 'good:rune-stone'] }, 'take split 8+6 loot');
  check(ok, 'two distinct loot tiles whose combined sword value is 14 are accepted');
  equal(state.players[0].goods.chest, chestBefore + 1, 'first split tile is gained');
  equal(state.players[0].goods['rune-stone'], runeBefore + 1, 'second split tile is gained');
});

// ---------------------------------------------------------------------------
// 137 Melee Fighter: spears substitute for long swords in any combination.
// ---------------------------------------------------------------------------

feature('137 Melee Fighter — spears substitute for battle swords', () => {
  const state = fresh(4);
  playDirectly(state, 137);
  addShip(state, 'longship');
  const player = state.players[0];
  player.weapons.spear = 8;
  player.weapons['long-sword'] = 0;

  const decision = startAndRollBattle(state, 'raid');
  const rolled = currentDieResult(decision);
  check(rolled !== null && rolled < 6, 'fixture needs weapon payment to succeed');
  if (!decision || decision.kind !== 'die' || rolled === null) return;
  const spears = Math.max(1, 6 - rolled);
  const spearBefore = player.weapons.spear;
  const ok = resolveBattle(state, decision, [{ id: 'spear', amount: spears }], 'pay battle result with substituted spears');

  check(ok, `${spears} spear${spears === 1 ? '' : 's'} may replace the missing long swords`);
  equal(state.players[0].weapons.spear, spearBefore - spears, 'substituted spears are discarded exactly once');
  check(state.pending[0]?.kind === 'die-spend', 'spear-paid battle proceeds to loot');
});

// ---------------------------------------------------------------------------
// 138 Robber: green loot uses the sword value of its blue reverse minus one.
// ---------------------------------------------------------------------------

feature('138 Robber — green battle loot is generated from blue backs', () => {
  const state = fresh(1);
  playDirectly(state, 138);
  addShip(state, 'longship');
  const player = state.players[0];
  player.resources.stone = 10;
  const oilBefore = player.goods.oil;

  const decision = startAndRollBattle(state, 'raid');
  const rolled = currentDieResult(decision);
  if (!decision || decision.kind !== 'die' || rolled === null) return;
  const target = Math.max(6, rolled);
  if (!resolveBattle(state, decision, [{ id: 'stone', amount: target - rolled }], 'resolve Robber battle')) return;

  const loot = head(state, 'die-spend');
  if (!loot || loot.kind !== 'die-spend') return;
  const oil = loot.options.find((option) => option.id === 'good:oil');
  check(!!oil, 'Oil is offered as green loot when its Rune Stone back (6) minus 1 is affordable');
  check(/(?:sword\s*)?5/i.test(oil?.detail ?? ''), 'Oil advertises authentic sword value 5');
  const ok = resolve(state, loot, { optionIds: ['good:oil'] }, 'take Oil with Robber');
  check(ok, 'the generated green-loot option is selectable');
  equal(state.players[0].goods.oil, oilBefore + 1, 'selected green loot enters supply');
});

// ---------------------------------------------------------------------------
// 139 Loot Hunter: every tied highest special on the oval supply is -1 sword.
// ---------------------------------------------------------------------------

feature('139 Loot Hunter — all highest-value special loot is one cheaper', () => {
  const state = fresh(1);
  playDirectly(state, 139);
  addShip(state, 'longship');
  // Forge Hammer and Fibula are tied at the highest remaining printed value 10.
  state.specialSupply = ['forge-hammer', 'fibula', 'horseshoe'];
  const player = state.players[0];
  player.resources.stone = 10;

  const decision = startAndRollBattle(state, 'raid');
  const rolled = currentDieResult(decision);
  if (!decision || decision.kind !== 'die' || rolled === null) return;
  const target = 9;
  if (!resolveBattle(state, decision, [{ id: 'stone', amount: target - rolled }], 'resolve Loot Hunter battle at 9')) return;

  const loot = head(state, 'die-spend');
  if (!loot || loot.kind !== 'die-spend') return;
  check(loot.options.some((option) => option.id === 'special:forge-hammer'), 'Forge Hammer drops from sword 10 to 9');
  check(loot.options.some((option) => option.id === 'special:fibula'), 'the tied Fibula also drops from sword 10 to 9');
  const ok = resolve(state, loot, { optionIds: ['special:forge-hammer'] }, 'take reduced Forge Hammer');
  check(ok, 'a highest-value special is selectable at the reduced value');
  check(state.players[0].specials.includes('forge-hammer'), 'selected special loot enters the player supply');
  check(state.specialSupply.includes('fibula'), 'unchosen tied special remains on the oval supply');
});

// ---------------------------------------------------------------------------
// 147 Steersman: one knarr unlocks every action that requires a longship.
// ---------------------------------------------------------------------------

feature('147 Steersman — knarr satisfies longship action eligibility', () => {
  for (const [index, actionSpaceId] of ['raid', 'pillage-2', 'plunder', 'explore-long'].entries()) {
    const state = fresh(1470 + index);
    playDirectly(state, 147);
    addShip(state, 'knarr');
    if (actionSpaceId === 'explore-long') state.explorations[0].face = 'baffin-island';
    const started = apply(state, { type: 'place_workers', spaceId: actionSpaceId });
    check(started.ok, `a lone knarr legally starts ${actionSpaceId}${started.error ? `: ${started.error}` : ''}`);
    equal(
      state.players[0].ships.filter((ship) => !ship.emigrated && ship.type === 'longship').length,
      0,
      `${actionSpaceId} fixture owns no actual longship`,
    );
    check(
      state.actionSpaces.find((space) => space.id === actionSpaceId)?.occupants.some((occupant) => occupant.seat === 0),
      `${actionSpaceId} commits its printed Viking cost`,
    );
  }
});

// ---------------------------------------------------------------------------
// 170 Refugee Helper: every Emigration costs 2 silver less, floored at zero.
// ---------------------------------------------------------------------------

feature('170 Refugee Helper — Emigration costs 2 silver less', () => {
  const state = fresh(170);
  state.round = 5;
  playDirectly(state, 170);
  const knarrId = addShip(state, 'knarr');
  const player = state.players[0];
  player.silver = 3; // round 5 printed cost 5, authentic discounted cost 3.

  const started = apply(state, { type: 'place_workers', spaceId: 'emigrate-2' });
  check(started.ok, `exactly 3 silver is enough for round-5 Emigration${started.error ? `: ${started.error}` : ''}`);
  if (!started.ok) return;
  if (!acceptCardEffects(state, 'Refugee Helper Emigration')) return;
  const decision = head(state, 'emigration');
  if (!decision || decision.kind !== 'emigration') return;
  check(/3\s+silver/i.test(decision.prompt) || decision.meta?.cost === 3, 'Emigration decision exposes the discounted cost 3');
  const ok = resolve(state, decision, { optionIds: [knarrId] }, 'emigrate the knarr for 3 silver');
  check(ok, 'discounted Emigration resolves through the public decision');
  equal(state.players[0].silver, 0, 'round-5 Emigration deducts 3 rather than 5 silver');
  check(state.players[0].ships.find((ship) => ship.id === knarrId)?.emigrated === true, 'chosen knarr is emigrated');
});

// ---------------------------------------------------------------------------
// 186 Pea Flour Baker: two horizontal Peas, but never a third, each Feast.
// ---------------------------------------------------------------------------

function prepareFeast(state: FeastState): void {
  const player = state.players[0];
  state.phase = 'feast';
  state.pending = [{
    id: 'test-feast-decision', seat: 0, kind: 'feast', label: 'Serve the Feast',
    prompt: 'Cover every open Banquet Table cell, then finish the feast.',
    options: [{ id: 'finish', label: 'Finish Feast' }], min: 0, max: 1,
    meta: { requiredCells: 8, emigrated: 0 }, continuation: { kind: 'feast' }, private: false,
  }];
  player.workersTotal = 8;
  player.goods.peas = 4;
  player.feastPlacements = [];
  player.feastHorizontalTypes = [];
}

feature('186 Pea Flour Baker — Feast permits exactly two horizontal Peas', () => {
  const control = fresh(1860);
  playDirectly(control);
  prepareFeast(control);
  check(apply(control, { type: 'feast_place', pieceId: 'peas', x: 0, y: 0, rotation: 0 }).ok, 'control Feast accepts its first horizontal Peas');
  const normalSecond = apply(control, { type: 'feast_place', pieceId: 'peas', x: 3, y: 0, rotation: 0 });
  check(!normalSecond.ok && /only one peas/i.test(normalSecond.error ?? ''), 'without card 186, a second horizontal Peas is rejected');

  const state = fresh(1861);
  playDirectly(state, 186);
  prepareFeast(state);
  check(apply(state, { type: 'feast_place', pieceId: 'peas', x: 0, y: 0, rotation: 0 }).ok, 'Pea Flour Baker accepts the first horizontal Peas');
  const second = apply(state, { type: 'feast_place', pieceId: 'peas', x: 3, y: 0, rotation: 0 });
  check(second.ok, `Pea Flour Baker accepts a second horizontal Peas${second.error ? `: ${second.error}` : ''}`);
  const third = apply(state, { type: 'feast_place', pieceId: 'peas', x: 6, y: 0, rotation: 0 });
  check(!third.ok && /horizontal/i.test(third.error ?? ''), 'a third horizontal Peas remains illegal');
  const vertical = apply(state, { type: 'feast_place', pieceId: 'peas', x: 6, y: 0, rotation: 90 });
  check(vertical.ok, `the third Peas may instead be vertical${vertical.error ? `: ${vertical.error}` : ''}`);
});

// ---------------------------------------------------------------------------
// Report each interaction independently so a failing gap never masks another.
// ---------------------------------------------------------------------------

let totalChecks = 0;
let totalFailures = 0;
for (const result of features) {
  totalChecks += result.checks;
  totalFailures += result.failures.length;
  if (!result.failures.length) console.log(`PASS ${result.name} (${result.checks} checks)`);
  else {
    console.error(`FAIL ${result.name} (${result.failures.length}/${result.checks} failed)`);
    for (const failure of result.failures) console.error(`  - ${failure}`);
  }
}

if (totalFailures) {
  console.error(`\n${totalFailures} failed across ${totalChecks} reducer checks`);
  process.exitCode = 1;
} else {
  console.log(`\n${totalChecks}/${totalChecks} occupation modifier gap checks passed`);
}
