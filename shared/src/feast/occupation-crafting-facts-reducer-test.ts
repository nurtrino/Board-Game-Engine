/**
 * Public-reducer coverage for the crafting/mountain/upgrade occupation facts.
 *
 * Fixtures seed owned cards and inventory, but every behavior and every
 * decision is exercised through applyFeastAction. This makes the reducer the
 * sole authority for selected payments, action-space provenance, exchanged
 * goods, mountain types, and stale/forged decision rejection.
 *
 * Run: npx tsx shared/src/feast/occupation-crafting-facts-reducer-test.ts
 */

import {
  applyFeastAction,
  createFeast,
  type FeastAction,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastResult,
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
  const state = createFeast([{ name: 'Fact Tester', color: 'Red' }], seed, {
    length: 'short', occupationMode: 'all',
  });
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  state.firstPlayer = 0;
  state.pending = [];
  for (const space of state.actionSpaces) space.occupants = [];
  const player = state.players[0];
  player.passed = false;
  player.turnActionTaken = false;
  player.turnMayEnd = false;
  player.turnEffectUsed = false;
  player.turnActionId = null;
  player.turnSelectedShipIds = [];
  player.turnActionFacts = {};
  player.fourthOccupationAfter = false;
  player.workersTotal = 12;
  player.workersByColor[player.activeWorkerColor] = 12;
  player.workersAvailable = 12;
  player.workersWaiting = 0;
  player.silver = 20;
  player.resources = { wood: 0, stone: 0, ore: 0 };
  for (const id of Object.keys(player.goods) as (keyof typeof player.goods)[]) player.goods[id] = 0;
  player.occupationHand = [];
  player.playedOccupations = [];
  player.occupationUses = [];
  return state;
}

function removeCardEverywhere(state: FeastState, number: number): string {
  const id = `occupation-${number}`;
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  state.occupationDiscard = state.occupationDiscard.filter((candidate) => candidate !== id);
  state.occupationUsage = state.occupationUsage.filter((entry) => entry.cardId !== id);
  for (const player of state.players) {
    player.occupationHand = player.occupationHand.filter((candidate) => candidate !== id);
    player.playedOccupations = player.playedOccupations.filter((candidate) => candidate !== id);
    player.occupationUses = player.occupationUses.filter((entry) => entry.cardId !== id);
  }
  return id;
}

function playDirectly(state: FeastState, ...numbers: number[]): void {
  for (const number of numbers) {
    const id = removeCardEverywhere(state, number);
    state.players[0].playedOccupations.push(id);
  }
}

function putInHand(state: FeastState, number: number): string {
  const id = removeCardEverywhere(state, number);
  state.players[0].occupationHand.push(id);
  return id;
}

function apply(state: FeastState, action: FeastAction): FeastResult {
  return applyFeastAction(state, 0, action);
}

function applyExpected(state: FeastState, action: FeastAction, label: string): boolean {
  const result = apply(state, action);
  return check(result.ok, `${label}${result.ok ? '' : `: ${result.error}`}`);
}

function decision(state: FeastState, kind?: FeastPendingDecision['kind']): FeastPendingDecision | null {
  const head = state.pending[0] ?? null;
  if (kind) check(head?.kind === kind, `expected ${kind} decision, got ${head?.kind ?? 'none'}`);
  return head;
}

function resolve(
  state: FeastState, head: FeastPendingDecision, choice: FeastDecisionChoice, label: string,
): boolean {
  return applyExpected(state, {
    type: 'resolve_decision', decisionId: head.id, choice,
  }, label);
}

function acceptCard(state: FeastState, number: number, label: string): boolean {
  const head = decision(state, 'card-effect');
  if (!head) return false;
  check(head.meta?.cardId === `occupation-${number}`, `${label}: card ${number} owns the decision`);
  check(head.meta?.requestKind === 'confirmation', `${label}: effect begins with server confirmation`);
  return resolve(state, head, { accepted: true }, `${label}: accept card ${number}`);
}

function rejectAtomic(
  state: FeastState, head: FeastPendingDecision, choice: FeastDecisionChoice, label: string,
): void {
  const before = JSON.stringify(state);
  const result = apply(state, { type: 'resolve_decision', decisionId: head.id, choice });
  check(!result.ok, `${label}: invalid decision is rejected`);
  equal(JSON.stringify(state), before, `${label}: rejection is atomic`);
}

function rejectStale(
  state: FeastState, decisionId: string, choice: FeastDecisionChoice, label: string,
): void {
  const before = JSON.stringify(state);
  const result = apply(state, { type: 'resolve_decision', decisionId, choice });
  check(!result.ok, `${label}: consumed decision id is rejected`);
  equal(JSON.stringify(state), before, `${label}: stale rejection is atomic`);
}

function occupants(state: FeastState, actionSpaceId: string): number {
  return state.actionSpaces.find((space) => space.id === actionSpaceId)?.occupants
    .filter((entry) => entry.seat === 0).reduce((sum, entry) => sum + entry.workers, 0) ?? 0;
}

feature('103 Forest Blacksmith uses the real selected ore branch before payment', () => {
  const state = fresh(10301);
  playDirectly(state, 103);
  const player = state.players[0];
  player.resources.ore = 2;
  player.resources.wood = 1;
  state.mountains = [{ id: 'ore-branch-strip', items: ['wood', 'stone'] }];

  if (!applyExpected(state, { type: 'place_workers', spaceId: 'craft-chest' }, 'start Craft Chest')) return;
  let head = decision(state, 'goods');
  if (!head) return;
  const ore = head.options.find((option) => option.id === 'ore');
  check(!!ore, 'Craft Chest offers the reducer-owned ore branch');
  if (!ore || !resolve(state, head, { optionIds: [ore.id] }, 'choose ore payment')) return;
  equal(state.players[0].turnActionFacts.selectedPayment, 'ore', 'selectedPayment is recorded from the printed branch');
  check(acceptCard(state, 103, 'Forest Blacksmith'), 'Forest Blacksmith confirmation resolves');

  head = decision(state, 'mountain');
  if (!head) return;
  rejectAtomic(state, head, { allocations: [{ id: 'forged-strip', amount: 1 }] }, 'Forest Blacksmith forged mountain strip');
  const mountainId = head.id;
  if (!resolve(state, head, { allocations: [{ id: 'ore-branch-strip', amount: 1 }] }, 'take pre-crafting mountain item')) return;
  equal(state.players[0].resources, { wood: 2, stone: 0, ore: 1 }, 'mountain reward resolves before the original ore payment');
  equal(state.players[0].goods.chest, 1, 'the original Craft Chest reward still resolves');
  equal(state.players[0].turnActionFacts.buildingResourceTypesPaid, ['ore'], 'the actual paid resource type remains authoritative');
  rejectStale(state, mountainId, { allocations: [{ id: 'ore-branch-strip', amount: 1 }] }, 'Forest Blacksmith stale mountain cursor');

  const woodState = fresh(10302);
  playDirectly(woodState, 103);
  woodState.players[0].resources.wood = 1;
  woodState.mountains = [{ id: 'wood-branch-strip', items: ['ore'] }];
  if (!applyExpected(woodState, { type: 'place_workers', spaceId: 'craft-chest' }, 'start wood Craft Chest')) return;
  const branch = decision(woodState, 'goods');
  if (!branch || !resolve(woodState, branch, { optionIds: ['wood'] }, 'choose wood payment')) return;
  check(woodState.pending[0]?.meta?.cardId !== 'occupation-103', 'wood branch does not qualify Forest Blacksmith');
  equal(woodState.mountains[0]?.items, ['ore'], 'wood branch cannot take the occupation mountain item');
});

feature('108 Ironsmith binds to Forge and returns a Viking from that resolving space', () => {
  const state = fresh(10801);
  playDirectly(state, 108);
  const player = state.players[0];
  player.resources.ore = 1;
  const beforeSilver = player.silver;
  if (!applyExpected(state, { type: 'place_workers', spaceId: 'forge' }, 'start Forge')) return;
  let head = decision(state, 'special');
  if (!head) return;
  check(head.options.some((option) => option.id === 'jewelry'), 'Forge exposes its printed jewelry result');
  if (!resolve(state, head, { optionIds: ['jewelry'] }, 'forge jewelry')) return;
  equal(state.players[0].turnActionFacts.selectedPayment, 'ore', 'Forge records ore as its selected crafting payment');
  equal(occupants(state, 'forge'), 3, 'all three Vikings occupy Forge before Ironsmith resolves');
  check(acceptCard(state, 108, 'Ironsmith'), 'Ironsmith confirmation resolves');
  equal(occupants(state, 'forge'), 2, 'Ironsmith returns exactly one Viking from Forge');
  equal(state.players[0].workersAvailable, 10, 'the returned active Viking is reusable this round');
  equal(state.players[0].silver, beforeSilver - 1, 'Ironsmith pays exactly one silver');
  equal(state.players[0].goods.jewelry, 1, 'the Forge reward remains resolved');

  const woodState = fresh(10802);
  playDirectly(woodState, 108);
  woodState.players[0].resources.wood = 1;
  if (!applyExpected(woodState, { type: 'place_workers', spaceId: 'craft-chest' }, 'start wood Craft Chest')) return;
  head = decision(woodState, 'goods');
  if (!head || !resolve(woodState, head, { optionIds: ['wood'] }, 'pay wood')) return;
  check(woodState.pending[0]?.meta?.cardId !== 'occupation-108', 'Ironsmith rejects the Craft Chest wood branch');
  equal(occupants(woodState, 'craft-chest'), 2, 'wood branch returns no Viking');
});

feature('111 Artist counts distinct building-resource types actually paid', () => {
  const state = fresh(11101);
  playDirectly(state, 111);
  const player = state.players[0];
  player.resources.wood = 2;
  player.resources.stone = 2;
  const beforeSilver = player.silver;
  if (!applyExpected(state, { type: 'place_workers', spaceId: 'craft-runes-and-chests' }, 'craft runes and chests')) return;
  equal(state.players[0].resources, { wood: 0, stone: 0, ore: 0 }, 'printed quantities are actually paid');
  equal(state.players[0].turnActionFacts.buildingResourceTypesPaid, ['stone', 'wood'], 'paid resource identities are deduplicated');
  equal(state.players[0].turnActionFacts.distinctBuildingResourceTypesPaid, 2, 'two distinct types are recorded despite four resources paid');
  equal(state.players[0].turnActionFacts.selectedPayment, undefined, 'a mixed payment has no stale single selectedPayment');
  equal(state.players[0].silver, beforeSilver + 2, 'Artist gains one silver per distinct resource type');

  const nonResource = fresh(11102);
  playDirectly(nonResource, 111);
  nonResource.players[0].goods.flax = 1;
  const nonResourceSilver = nonResource.players[0].silver;
  if (!applyExpected(nonResource, { type: 'place_workers', spaceId: 'craft-linen' }, 'craft linen')) return;
  equal(nonResource.players[0].silver, nonResourceSilver, 'a goods-only Crafting payment awards no Artist silver');
  equal(nonResource.players[0].turnActionFacts.distinctBuildingResourceTypesPaid, undefined, 'goods payments do not forge resource facts');
});

interface MountainFixture {
  name: string;
  actionSpaceId: string;
  strips: FeastState['mountains'];
  allocations: { id: string; amount: number }[];
  branch?: string;
  expectedClause: string;
  expectedReward: 'wood' | 'mead' | 'hide' | 'chest';
  expectedTypes: string[];
}

const mountainFixtures: MountainFixture[] = [
  {
    name: 'one type', actionSpaceId: 'mountain-2',
    strips: [{ id: 'one', items: ['wood', 'wood', 'stone'] }],
    allocations: [{ id: 'one', amount: 2 }], expectedClause: 'one-mountain-type-wood',
    expectedReward: 'wood', expectedTypes: ['wood'],
  },
  {
    name: 'two types', actionSpaceId: 'mountain-2',
    strips: [{ id: 'two', items: ['wood', 'ore'] }],
    allocations: [{ id: 'two', amount: 2 }], expectedClause: 'two-mountain-types',
    expectedReward: 'mead', expectedTypes: ['wood', 'ore'],
  },
  {
    name: 'three types', actionSpaceId: 'mountain-3-upgrade-1',
    strips: [{ id: 'three', items: ['wood', 'stone', 'ore'] }],
    allocations: [{ id: 'three', amount: 3 }], expectedClause: 'three-mountain-types',
    expectedReward: 'hide', expectedTypes: ['wood', 'stone', 'ore'],
  },
  {
    name: 'four types selected branch', actionSpaceId: 'mountain-2x4-or-double-3', branch: 'mountains',
    strips: [{ id: 'four-a', items: ['wood', 'stone'] }, { id: 'four-b', items: ['ore', 'silver-2'] }],
    allocations: [{ id: 'four-a', amount: 2 }, { id: 'four-b', amount: 2 }],
    expectedClause: 'four-mountain-types', expectedReward: 'chest',
    expectedTypes: ['wood', 'stone', 'ore', 'silver'],
  },
];

feature('122 Mountain Guard derives its reward from actual mountain item types', () => {
  mountainFixtures.forEach((fixture, index) => {
    const state = fresh(12210 + index);
    playDirectly(state, 122);
    state.mountains = structuredClone(fixture.strips);
    if (!applyExpected(state, { type: 'place_workers', spaceId: fixture.actionSpaceId }, `${fixture.name}: start action`)) return;
    if (fixture.branch) {
      const branch = decision(state, 'goods');
      if (!branch || !resolve(state, branch, { optionIds: [fixture.branch] }, `${fixture.name}: choose printed branch`)) return;
    }
    let head = decision(state, 'mountain');
    if (!head || !resolve(state, head, { allocations: fixture.allocations }, `${fixture.name}: take mountain items`)) return;
    if (state.pending[0]?.kind === 'goods' && state.pending[0].meta?.mode === 'upgrade') {
      head = state.pending[0];
      if (!resolve(state, head, { allocations: [] }, `${fixture.name}: decline following upgrade`)) return;
    }
    head = decision(state, 'card-effect');
    if (!head) return;
    equal(head.meta?.cardId, 'occupation-122', `${fixture.name}: Mountain Guard owns the bonus`);
    equal(head.meta?.clauseId, fixture.expectedClause, `${fixture.name}: exact reward tier is selected`);
    equal(state.players[0].turnActionFacts.mountainItemTypes, fixture.expectedTypes, `${fixture.name}: normalized mountain types are server facts`);
    equal(state.players[0].turnActionFacts.distinctMountainItemTypes, fixture.expectedTypes.length, `${fixture.name}: distinct count is exact`);
    const before = fixture.expectedReward === 'wood'
      ? state.players[0].resources.wood : state.players[0].goods[fixture.expectedReward];
    if (!acceptCard(state, 122, `${fixture.name} Mountain Guard`)) return;
    const after = fixture.expectedReward === 'wood'
      ? state.players[0].resources.wood : state.players[0].goods[fixture.expectedReward];
    equal(after, before + 1, `${fixture.name}: grants exactly the authentic reward`);
  });

  const silverState = fresh(12299);
  playDirectly(silverState, 122);
  silverState.mountains = [{ id: 'silver-only', items: ['silver-2'] }];
  const beforeSilver = silverState.players[0].silver;
  if (!applyExpected(silverState, { type: 'place_workers', spaceId: 'mountain-2' }, 'silver type: start mountain action')) return;
  const mountain = decision(silverState, 'mountain');
  if (!mountain || !resolve(silverState, mountain, { allocations: [{ id: 'silver-only', amount: 1 }] }, 'silver type: take 2-silver item')) return;
  equal(silverState.players[0].turnActionFacts.mountainItemTypes, ['silver'], '2-silver token normalizes to the silver type');
  const bonus = decision(silverState, 'card-effect');
  if (!bonus) return;
  equal(bonus.meta?.clauseId, 'one-mountain-type-silver', 'silver uses the matching one-type clause');
  if (!acceptCard(silverState, 122, 'silver Mountain Guard')) return;
  equal(silverState.players[0].silver, beforeSilver + 4, 'taken and additional 2-silver items each grant two silver');
});

feature('123 Oil Seller binds to an actual one-capacity single upgrade action', () => {
  const state = fresh(12301);
  playDirectly(state, 123);
  const player = state.players[0];
  player.goods.mead = 1;
  state.mountains = [{ id: 'oil-route', items: ['wood'] }];
  if (!applyExpected(state, { type: 'place_workers', spaceId: 'mountain-1-upgrade-1' }, 'start one-good upgrade action')) return;
  let head = decision(state, 'mountain');
  if (!head || !resolve(state, head, { allocations: [{ id: 'oil-route', amount: 1 }] }, 'take mountain item')) return;
  head = decision(state, 'goods');
  if (!head || !resolve(state, head, { allocations: [{ id: 'mead', amount: 1 }] }, 'upgrade mead to oil')) return;
  equal(state.players[0].turnActionFacts.goodsExchanged, ['mead'], 'original exchanged good is recorded');
  equal(state.players[0].turnActionFacts.upgradedGoods, ['oil'], 'the resulting physical tile face is recorded');
  equal(state.players[0].turnActionFacts.upgradeCountCapacity, 1, 'printed single-upgrade capacity is recorded');
  equal(state.players[0].goods.oil, 1, 'new oil exists before Oil Seller resolves');
  check(acceptCard(state, 123, 'Oil Seller'), 'Oil Seller confirmation resolves');
  equal(state.players[0].goods.oil, 0, 'Oil Seller can spend oil received by the same action');
  equal(state.players[0].goods.silverware, 1, 'Oil Seller receives one silverware');

  const multi = fresh(12302);
  playDirectly(multi, 123);
  multi.players[0].goods.mead = 1;
  multi.players[0].goods.oil = 1;
  if (!applyExpected(multi, { type: 'place_workers', spaceId: 'upgrade-2' }, 'start multi-upgrade action')) return;
  head = decision(multi, 'goods');
  if (!head || !resolve(multi, head, { allocations: [{ id: 'mead', amount: 1 }] }, 'use only one slot of multi-upgrade')) return;
  check(multi.pending[0]?.meta?.cardId !== 'occupation-123', 'capacity-two action does not qualify Oil Seller even when one tile moved');
  equal(multi.players[0].goods.silverware, 0, 'multi-upgrade creates no Oil Seller reward');
});

feature('152 Merchant follows only a tile actually moved by a 3/4 single-upgrade action', () => {
  const state = fresh(15201);
  playDirectly(state, 152);
  const player = state.players[0];
  player.goods.peas = 1;
  player.goods.flax = 1;
  player.goods.beans = 1;
  if (!applyExpected(state, { type: 'place_workers', spaceId: 'upgrade-3' }, 'start triple-upgrade action')) return;
  let head = decision(state, 'goods');
  if (!head || !resolve(state, head, { allocations: [
    { id: 'peas', amount: 1 }, { id: 'flax', amount: 1 }, { id: 'beans', amount: 1 },
  ] }, 'resolve three printed upgrades')) return;
  equal(state.players[0].turnActionFacts.goodsExchanged, ['peas', 'flax', 'beans'], 'Merchant receives real source-good facts');
  equal(state.players[0].turnActionFacts.upgradedGoods, ['mead', 'stockfish', 'milk'], 'Merchant receives real resulting-tile facts');
  check(acceptCard(state, 152, 'Merchant printed action'), 'Merchant confirmation resolves');
  head = decision(state, 'card-effect');
  if (!head) return;
  check(head.options.some((option) => option.id === 'mead->oil'),
    `resulting mead tile is a legal Merchant origin (${head.options.map((option) => option.id).join(', ')})`);
  check(!head.options.some((option) => option.id === 'peas->mead'), 'spent peas face is not a Merchant origin');
  rejectAtomic(state, head, { optionIds: ['peas->mead'] }, 'Merchant forged pre-upgrade face');
  const merchantDecisionId = head.id;
  if (!resolve(state, head, { optionIds: ['mead->oil'] }, 'upgrade the exchanged tile one additional step')) return;
  equal([state.players[0].goods.peas, state.players[0].goods.mead, state.players[0].goods.oil], [0, 0, 1], 'Merchant advances the same physical tile a second step');
  rejectStale(state, merchantDecisionId, { optionIds: ['stockfish->hide'] }, 'Merchant stale upgrade cursor');

  const occupationState = fresh(15202);
  playDirectly(occupationState, 152);
  const card83 = putInHand(occupationState, 83);
  occupationState.players[0].goods.peas = 4;
  if (!applyExpected(occupationState, { type: 'place_workers', spaceId: 'play-occupations-2' }, 'start occupation play action')) return;
  head = decision(occupationState, 'occupation');
  if (!head || !resolve(occupationState, head, { optionIds: [card83] }, 'play four-good upgrade occupation')) return;
  check(acceptCard(occupationState, 83, 'Four-good occupation'), 'card 83 confirmation resolves');
  head = decision(occupationState, 'card-effect');
  if (!head || !resolve(occupationState, head, { allocations: [{ id: 'peas->mead', amount: 4 }] }, 'upgrade four same goods')) return;
  const merchantPrompt = decision(occupationState, 'card-effect');
  if (!merchantPrompt) return;
  const merchantContext = merchantPrompt.continuation.kind === 'occupation-event'
    ? merchantPrompt.continuation.context.fields : {};
  equal(merchantContext.source, 'occupation', 'occupation-sourced upgrade provenance is explicit');
  equal(merchantContext.goodsExchanged, ['peas', 'peas', 'peas', 'peas'], 'occupation upgrade records every physical source tile');
  equal(merchantContext.upgradedGoods, ['mead', 'mead', 'mead', 'mead'], 'occupation upgrade records every resulting tile face');
  check(acceptCard(occupationState, 152, 'Merchant occupation action'), 'Merchant recognizes occupation-sourced four-upgrade action');
  head = decision(occupationState, 'card-effect');
  if (!head) return;
  equal(head.options.map((option) => option.id), ['mead->oil'], 'occupation-sourced Merchant choices are restricted to the moved tile type');
  if (!resolve(occupationState, head, { optionIds: ['mead->oil'] }, 'advance one occupation-upgraded tile')) return;
  equal([occupationState.players[0].goods.peas, occupationState.players[0].goods.mead, occupationState.players[0].goods.oil], [0, 3, 1], 'occupation-sourced Merchant resolution preserves all four tile identities');

  const double = fresh(15203);
  playDirectly(double, 152);
  double.players[0].goods.peas = 1;
  if (!applyExpected(double, { type: 'place_workers', spaceId: 'mountain-2x4-or-double-3' }, 'start double-upgrade choice action')) return;
  head = decision(double, 'goods');
  if (!head || !resolve(double, head, { optionIds: ['upgrades'] }, 'choose double-upgrade branch')) return;
  head = decision(double, 'goods');
  if (!head || !resolve(double, head, { allocations: [{ id: 'peas', amount: 1 }] }, 'double-upgrade peas to oil')) return;
  check(double.pending[0]?.meta?.cardId !== 'occupation-152', 'double-upgrade branch is not a printed single-upgrade 3 action');
});

const failed = features.filter((entry) => entry.failures.length);
for (const entry of features) {
  const status = entry.failures.length ? 'FAIL' : 'PASS';
  console.log(`${status} ${entry.name} (${entry.checks} checks)`);
  for (const failure of entry.failures) console.error(`  - ${failure}`);
}
const checks = features.reduce((sum, entry) => sum + entry.checks, 0);
const failures = failed.reduce((sum, entry) => sum + entry.failures.length, 0);
console.log(`\n${checks - failures}/${checks} checks passed across ${features.length} features`);
if (failed.length) process.exitCode = 1;
