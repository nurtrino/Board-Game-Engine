/**
 * Reducer integration coverage for physical ship commitments and the concrete
 * action facts consumed by classic Feast occupation predicates.
 *
 * Run: npx tsx shared/src/feast/occupation-action-facts-reducer-test.ts
 */

import {
  applyFeastAction,
  createFeast,
  type FeastAction,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastShipType,
  type FeastState,
} from './index.js';

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string): asserts condition {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

function scenario(name: string, run: () => void): void {
  try { run(); }
  catch (error) {
    failed++;
    console.error(`FAIL: ${name} aborted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fresh(seed: number): FeastState {
  const state = createFeast([{ name: 'Action Fact Tester', color: 'Red' }], seed, {
    length: 'long', occupationMode: 'all',
  });
  const player = state.players[0];
  state.phase = 'actions'; state.phaseNumber = 5; state.turn = 0; state.pending = [];
  player.passed = false; player.turnActionTaken = false; player.turnMayEnd = false;
  player.turnEffectUsed = false; player.turnActionId = null;
  player.turnSelectedShipIds = []; player.turnActionFacts = {};
  player.workersAvailable = 7; player.workersTotal = Math.max(player.workersTotal, 7);
  player.playedOccupations = []; player.occupationHand = [];
  player.resources = { wood: 20, stone: 20, ore: 20 };
  player.silver = 20;
  return state;
}

function play(state: FeastState, ...numbers: number[]): void {
  state.players[0].playedOccupations = numbers.map((number) => `occupation-${number}`);
  state.players[0].occupationUses = numbers.map((number) => ({
    cardId: `occupation-${number}`, round: state.round, usesThisRound: 0, usedOnce: false,
  }));
}

function addShip(state: FeastState, type: FeastShipType, id: string, ore = 0): void {
  state.players[0].ships.push({ id, type, ore, emigrated: false, emigratedRound: null });
}

function apply(state: FeastState, action: FeastAction): ReturnType<typeof applyFeastAction> {
  return applyFeastAction(state, 0, action);
}

function mustApply(state: FeastState, action: FeastAction, label: string): void {
  const result = apply(state, action);
  check(result.ok, `${label}${result.ok ? '' : `: ${result.error}`}`);
  if (!result.ok) throw new Error(`${label}: ${result.error}`);
}

function head(state: FeastState, kind?: FeastPendingDecision['kind']): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, `${kind ?? 'pending'} decision exists`);
  if (!decision) throw new Error(`Missing ${kind ?? 'pending'} decision`);
  if (kind) check(decision.kind === kind, `pending decision is ${kind}, got ${decision.kind}`);
  if (kind && decision.kind !== kind) throw new Error(`Expected ${kind}, got ${decision.kind}`);
  return decision;
}

function resolve(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice, label: string): void {
  mustApply(state, { type: 'resolve_decision', decisionId: decision.id, choice }, label);
}

function rejectAtomic(state: FeastState, decisionId: string, choice: FeastDecisionChoice, label: string): void {
  const snapshot = JSON.stringify(state);
  const result = apply(state, { type: 'resolve_decision', decisionId, choice });
  check(!result.ok, `${label} is rejected`);
  equal(JSON.stringify(state), snapshot, `${label} rejection is atomic`);
}

function cardDecision(state: FeastState, number: number): FeastPendingDecision {
  const decision = head(state, 'card-effect');
  check(decision.meta?.cardId === `occupation-${number}`,
    `pending occupation effect belongs to card ${number} (got ${String(decision.meta?.cardId)})`);
  return decision;
}

function acceptCard(state: FeastState, number: number, label: string): void {
  resolve(state, cardDecision(state, number), { accepted: true }, label);
}

function weaponCount(state: FeastState): number {
  return Object.values(state.players[0].weapons).reduce((sum, amount) => sum + amount, 0);
}

function finishLowDieSuccess(state: FeastState, label: string): void {
  let decision = head(state, 'die');
  resolve(state, decision, { optionIds: ['roll'] }, `${label}: roll`);
  decision = head(state, 'die');
  const result = Number(decision.meta?.result ?? 0);
  resolve(state, decision, {
    optionIds: ['resolve'], allocations: result ? [{ id: 'wood', amount: result }] : [],
  }, `${label}: pay ${result} wood and succeed`);
}

scenario('exploration commits a physical ship and rejects forged/stale identities', () => {
  const state = fresh(12001);
  play(state, 12);
  addShip(state, 'whaling-boat', 'explore-whaler', 1);
  addShip(state, 'longship', 'explore-longship', 2);
  mustApply(state, { type: 'place_workers', spaceId: 'explore-short' }, 'start short exploration');
  let decision = head(state, 'exploration');
  equal(decision.meta?.stage, 'ship', 'exploration starts at the physical-ship stage');
  equal(decision.options.map((option) => option.id), ['explore-whaler', 'explore-longship'],
    'every eligible owned physical ship is offered by identity');
  rejectAtomic(state, decision.id, { optionIds: ['forged-longship'] }, 'forged exploration ship');
  resolve(state, decision, { optionIds: ['explore-longship'] }, 'choose ore-bearing longship');

  decision = head(state, 'exploration');
  equal(decision.meta?.stage, 'destination', 'ship selection advances to destination selection');
  equal(state.players[0].turnSelectedShipIds, ['explore-longship'], 'selected exploration ship identity is retained');
  equal(state.players[0].turnActionFacts.shipOre, 2, 'selected exploration ship ore is retained as an action fact');
  state.players[0].ships.find((ship) => ship.id === 'explore-longship')!.emigrated = true;
  rejectAtomic(state, decision.id, { optionIds: [decision.options[0].id] }, 'stale exploration ship');
  state.players[0].ships.find((ship) => ship.id === 'explore-longship')!.emigrated = false;

  const destinationId = state.pending[0].options[0].id;
  const weaponsBefore = weaponCount(state);
  resolve(state, state.pending[0], { optionIds: [destinationId] }, 'claim selected nearby destination');
  check(state.players[0].boards.some((board) => board.id === destinationId), 'selected exploration board is claimed');
  acceptCard(state, 12, 'Helmsman draws after the selected longship was used');
  equal(weaponCount(state), weaponsBefore + 1, 'Helmsman draws exactly one weapon after exploration');
});

scenario('Plundering chooses an exact ship configuration and preserves ore facts', () => {
  const state = fresh(12002);
  play(state, 12);
  addShip(state, 'longship', 'plunder-a', 1);
  addShip(state, 'longship', 'plunder-b', 2);
  addShip(state, 'longship', 'plunder-c', 3);
  mustApply(state, { type: 'place_workers', spaceId: 'plunder' }, 'start Plundering');
  let decision = head(state, 'ship');
  equal(decision.options.length, 3, 'three physical longships produce all three server-owned pairs');
  rejectAtomic(state, decision.id, { optionIds: ['plunder:forged-a,forged-b'] }, 'forged Plundering pair');
  const pair = decision.options.find((option) => option.id === 'plunder:plunder-a,plunder-c');
  check(!!pair, 'desired physical Plundering pair is offered');
  state.players[0].ships.find((ship) => ship.id === 'plunder-c')!.emigrated = true;
  rejectAtomic(state, decision.id, { optionIds: [pair.id] }, 'stale Plundering pair');
  state.players[0].ships.find((ship) => ship.id === 'plunder-c')!.emigrated = false;
  decision = state.pending[0];
  const weaponsBefore = weaponCount(state);
  resolve(state, decision, { optionIds: [pair.id] }, 'commit longships A and C');
  equal(state.players[0].turnSelectedShipIds, ['plunder-a', 'plunder-c'], 'Plundering retains both selected ship identities');
  equal(state.players[0].turnActionFacts.shipOre, 4, 'Plundering retains total selected ship ore');
  equal(state.players[0].turnActionFacts.shipOreById, { 'plunder-a': 1, 'plunder-c': 3 },
    'Plundering retains ore by physical ship identity');
  equal(state.players[0].goods['silver-hoard'], 1, 'Plundering grants the printed Silver Hoard');
  acceptCard(state, 12, 'Helmsman draws after Plundering used longships');
  equal(weaponCount(state), weaponsBefore + 1, 'Helmsman draws once even though two longships were used');
});

scenario('Steersman exposes a server-owned knarr Plundering configuration', () => {
  const state = fresh(14701);
  play(state, 147);
  addShip(state, 'knarr', 'steersman-knarr');
  mustApply(state, { type: 'place_workers', spaceId: 'plunder' }, 'start Steersman Plundering');
  const decision = head(state, 'ship');
  equal(decision.options.map((option) => option.id), ['plunder:steersman-knarr'],
    'lone Steersman knarr is an explicit legal configuration');
  resolve(state, decision, { optionIds: ['plunder:steersman-knarr'] }, 'commit Steersman knarr');
  equal(state.players[0].turnSelectedShipIds, ['steersman-knarr'], 'Steersman knarr identity is retained');
  equal(state.players[0].turnActionFacts.longshipsUsed, 0, 'Steersman does not forge a longship-use fact');
  check(state.pending.length === 0 && state.players[0].turnMayEnd, 'Steersman Plundering completes normally');
});

scenario('Emigration preserves the selected longship ore before clearing it', () => {
  const state = fresh(12003);
  play(state, 12);
  state.round = 4;
  addShip(state, 'longship', 'emigration-longship', 3);
  mustApply(state, { type: 'place_workers', spaceId: 'emigrate-2' }, 'start Emigration');
  let decision = head(state, 'emigration');
  rejectAtomic(state, decision.id, { optionIds: ['forged-emigrant'] }, 'forged emigrating ship');
  state.players[0].ships.find((ship) => ship.id === 'emigration-longship')!.emigrated = true;
  rejectAtomic(state, decision.id, { optionIds: ['emigration-longship'] }, 'stale emigrating ship');
  state.players[0].ships.find((ship) => ship.id === 'emigration-longship')!.emigrated = false;
  decision = state.pending[0];
  const weaponsBefore = weaponCount(state);
  resolve(state, decision, { optionIds: ['emigration-longship'] }, 'emigrate physical longship');
  equal(state.players[0].turnSelectedShipIds, ['emigration-longship'], 'Emigration retains selected ship identity');
  equal(state.players[0].turnActionFacts.shipOre, 3, 'Emigration retains pre-clearing ship ore as an action fact');
  equal(state.players[0].ships.find((ship) => ship.id === 'emigration-longship')?.ore, 0,
    'the emigrated physical ship correctly loses its ore');
  acceptCard(state, 12, 'Helmsman draws after longship Emigration');
  equal(weaponCount(state), weaponsBefore + 1, 'Helmsman draws after Emigration');
});

scenario('occupation-granted Emigration retains physical longship facts and Helmsman timing', () => {
  const state = fresh(12110);
  play(state, 12, 110);
  addShip(state, 'knarr', 'trading-knarr');
  addShip(state, 'longship', 'granted-emigrant', 2);
  mustApply(state, { type: 'place_workers', spaceId: 'overseas-trade-2' }, 'start two-worker Overseas Trading');
  const trade = head(state, 'goods');
  resolve(state, trade, { optionIds: trade.options.slice(0, 1).map((option) => option.id) }, 'resolve printed Overseas Trading');
  acceptCard(state, 110, 'accept occupation-granted Emigration');
  const emigration = cardDecision(state, 110);
  check(emigration.options.some((option) => option.id === 'granted-emigrant'),
    'granted Emigration offers the owned physical longship by identity');
  const weaponsBefore = weaponCount(state);
  resolve(state, emigration, { optionIds: ['granted-emigrant'] }, 'choose the physical granted-emigration longship');
  equal(state.players[0].ships.find((ship) => ship.id === 'granted-emigrant')?.ore, 0,
    'occupation-granted Emigration clears selected ship ore');
  acceptCard(state, 12, 'Helmsman resolves after occupation-granted longship use');
  equal(weaponCount(state), weaponsBefore + 1,
    'occupation-granted Emigration emits the same longship-use timing as a printed Emigration');
});

scenario('ore Crafting stages before/after predicates around the actual payment', () => {
  const state = fresh(103108);
  play(state, 103, 108);
  const oreBefore = state.players[0].resources.ore;
  const workersBefore = state.players[0].workersAvailable;
  mustApply(state, { type: 'place_workers', spaceId: 'craft-chest' }, 'start alternate-payment Craft Chest');
  let decision = head(state, 'goods');
  resolve(state, decision, { optionIds: ['ore'] }, 'select Ore payment');
  equal(state.players[0].resources.ore, oreBefore, 'Forest Blacksmith window occurs before selected Ore is spent');
  equal(state.players[0].turnActionFacts.selectedPayment, 'ore', 'selected Ore payment is a concrete action fact');
  decision = cardDecision(state, 103);
  resolve(state, decision, { accepted: false }, 'decline Forest Blacksmith mountain action');
  equal(state.players[0].resources.ore, oreBefore - 1, 'selected Ore is spent after the before-action window');
  decision = cardDecision(state, 108);
  resolve(state, decision, { accepted: true }, 'pay Ironsmith and return a resolving Viking');
  equal(state.players[0].workersAvailable, workersBefore - 1,
    'Ironsmith returns exactly one of the two Vikings from the resolving space');
  equal(state.actionSpaces.find((space) => space.id === 'craft-chest')?.occupants[0]?.workers, 1,
    'Ironsmith decrements the resolving action-space occupancy deterministically');
});

scenario('Artist counts actual distinct building-resource types paid', () => {
  const state = fresh(11101);
  play(state, 111);
  state.players[0].silver = 0;
  mustApply(state, { type: 'place_workers', spaceId: 'craft-runes-and-chests' }, 'pay Wood and Stone in Crafting');
  equal(state.players[0].turnActionFacts.distinctBuildingResourceTypesPaid, 2,
    'two actual resource types are retained as a fact');
  equal(state.players[0].turnActionFacts.buildingResourceTypesPaid, ['stone', 'wood'],
    'the exact paid resource type set is retained');
  equal(state.players[0].silver, 2, 'Artist grants one silver per distinct paid resource type');
});

scenario('Mountain Guard consumes actual mountain item-type facts', () => {
  const state = fresh(12201);
  play(state, 122);
  state.mountains = [{ id: 'two-types', items: ['wood', 'stone'] }];
  state.players[0].goods.mead = 0;
  mustApply(state, { type: 'place_workers', spaceId: 'mountain-2' }, 'start two-type mountain action');
  resolve(state, head(state, 'mountain'), { allocations: [{ id: 'two-types', amount: 2 }] }, 'take Wood and Stone');
  equal(state.players[0].turnActionFacts.mountainItemTypes, ['wood', 'stone'], 'actual mountain types are retained');
  equal(state.players[0].turnActionFacts.distinctMountainItemTypes, 2, 'actual distinct mountain type count is retained');
  acceptCard(state, 122, 'accept two-type Mountain Guard reward');
  equal(state.players[0].goods.mead, 1, 'two mountain types grant Mead');

  const one = fresh(12202);
  play(one, 122);
  one.mountains = [{ id: 'one-type', items: ['wood', 'wood'] }];
  one.players[0].resources.wood = 0;
  mustApply(one, { type: 'place_workers', spaceId: 'mountain-2' }, 'start one-type mountain action');
  resolve(one, head(one, 'mountain'), { allocations: [{ id: 'one-type', amount: 2 }] }, 'take two Wood');
  acceptCard(one, 122, 'accept matching one-type Mountain Guard reward');
  equal(one.players[0].resources.wood, 3, 'one mountain type grants one additional matching item');
});

scenario('Oil Seller requires the printed one-upgrade capacity and actual one-step exchange', () => {
  const state = fresh(12301);
  play(state, 123);
  state.mountains = [{ id: 'oil-seller-strip', items: ['wood'] }];
  state.players[0].goods.stockfish = 1;
  state.players[0].goods.oil = 1;
  state.players[0].goods.silverware = 0;
  mustApply(state, { type: 'place_workers', spaceId: 'mountain-1-upgrade-1' }, 'start Take 1 / Upgrade 1 action');
  resolve(state, head(state, 'mountain'), { allocations: [{ id: 'oil-seller-strip', amount: 1 }] }, 'take one mountain item');
  resolve(state, head(state, 'goods'), { allocations: [{ id: 'stockfish', amount: 1 }] }, 'upgrade exactly one Stockfish');
  equal(state.players[0].turnActionFacts.upgradeCount, 1, 'actual upgrade count is retained');
  equal(state.players[0].turnActionFacts.upgradeSteps, 1, 'actual upgrade step count is retained');
  acceptCard(state, 123, 'exchange Oil after printed one-upgrade action');
  equal(state.players[0].goods.oil, 0, 'Oil Seller spends one Oil');
  equal(state.players[0].goods.silverware, 1, 'Oil Seller gains one Silverware');

  const wrongCapacity = fresh(12302);
  play(wrongCapacity, 123);
  wrongCapacity.players[0].goods.stockfish = 1;
  wrongCapacity.players[0].goods.oil = 1;
  mustApply(wrongCapacity, { type: 'place_workers', spaceId: 'upgrade-2' }, 'start Upgrade up to 2 action');
  resolve(wrongCapacity, head(wrongCapacity, 'goods'), { allocations: [{ id: 'stockfish', amount: 1 }] }, 'upgrade one on a two-capacity space');
  check(wrongCapacity.pending.length === 0 && wrongCapacity.players[0].goods.oil === 1,
    'Oil Seller does not trigger merely because a larger-capacity action upgraded only one good');
});

scenario('Merchant restricts its extra upgrade to a resulting exchanged tile', () => {
  const state = fresh(15201);
  play(state, 152);
  state.players[0].goods.stockfish = 2;
  state.players[0].goods.cabbage = 1;
  state.players[0].goods.flax = 1;
  mustApply(state, { type: 'place_workers', spaceId: 'upgrade-3' }, 'start Upgrade 3 action');
  const printed = head(state, 'goods');
  resolve(state, printed, { allocations: [
    { id: 'stockfish', amount: 1 }, { id: 'cabbage', amount: 1 }, { id: 'flax', amount: 1 },
  ] }, 'upgrade three concrete origin goods');
  equal(state.players[0].turnActionFacts.goodsExchanged, ['stockfish', 'cabbage', 'flax'],
    'the exact exchanged origin list is retained');
  equal(state.players[0].turnActionFacts.upgradedGoods, ['hide', 'game-meat', 'stockfish'],
    'the physical result faces of the exchanged goods are retained');
  acceptCard(state, 152, 'accept Merchant extra upgrade');
  const extra = cardDecision(state, 152);
  const sources = extra.options.map((option) => option.id.split('->')[0]);
  check(sources.length > 0 && sources.every((source) => ['hide', 'game-meat', 'stockfish'].includes(source)),
    `Merchant offers only the resulting faces of goods exchanged by the resolving action: ${JSON.stringify(extra.options)}`);
  check(!sources.includes('oil'), 'Merchant excludes an unrelated owned upgradable good');
  const stockfish = extra.options.find((option) => option.id.startsWith('stockfish->'));
  check(!!stockfish, 'Merchant offers the Stockfish result produced by the Flax exchange');
  const before = state.players[0].goods.stockfish;
  resolve(state, extra, { optionIds: [stockfish.id] }, 'upgrade the resulting Stockfish face once more');
  equal(state.players[0].goods.stockfish, before - 1, 'Merchant consumes the selected result face exactly once');
});

scenario('Snare Specialist and Farmhand receive resolving-space column/worker facts', () => {
  const snare = fresh(13001);
  play(snare, 130);
  snare.players[0].weapons.snare = 2;
  const workersBefore = snare.players[0].workersAvailable;
  mustApply(snare, { type: 'place_workers', spaceId: 'lay-snare' }, 'start two-worker Snare action');
  finishLowDieSuccess(snare, 'Snare');
  acceptCard(snare, 130, 'discard Snares and return resolving Viking');
  equal(snare.players[0].workersAvailable, workersBefore - 1, 'Snare Specialist returns one placed Viking');
  equal(snare.actionSpaces.find((space) => space.id === 'lay-snare')?.occupants[0]?.workers, 1,
    'Snare Specialist returns from the exact resolving space');

  const hunt = fresh(16301);
  play(hunt, 163);
  hunt.players[0].goods.hide = 0; hunt.players[0].silver = 0;
  mustApply(hunt, { type: 'place_workers', spaceId: 'hunt-game-2' }, 'start second-column two-worker Hunt');
  finishLowDieSuccess(hunt, 'Hunt');
  equal(hunt.players[0].goods.hide, 2, 'Farmhand adds one Hide to the normal Hunting Hide');
  equal(hunt.players[0].silver, 1, 'Farmhand adds one Silver');
});

console.log(`${passed}/${passed + failed} physical-ship and action-fact reducer checks passed`);
if (failed) process.exitCode = 1;
