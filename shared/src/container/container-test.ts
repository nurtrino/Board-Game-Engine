// Container engine tests: bot playthroughs at every player count and length,
// conservation invariants after every action, and directed rules tests
// cross-checked against docs/specs/container.md (rulebook page refs inline).
// Run: npx tsx shared/src/container/container-test.ts

import {
  createContainer, ContainerState, ContColor, CONT_COLORS, CONT_RULES,
  CONT_SUPPLY_BY_PLAYERS, CONTAINER_SEATS, contLotCount, containerViewFor,
} from './state.js';
import {
  applyContainerAction, containerBotAction, containerSeatsToAct, ContAction,
} from './actions.js';

let failures = 0;
const check = (cond: unknown, label: string) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
};

const seats = (n: number) =>
  CONTAINER_SEATS.slice(0, n).map((color, i) => ({ name: `P${i}${color}`, color, isCpu: true }));

const countColors = (list: ContColor[], acc: Record<ContColor, number>) => {
  for (const c of list) acc[c]++;
};

function invariants(state: ContainerState, label: string) {
  const perColor = Object.fromEntries(CONT_COLORS.map((c) => [c, state.supply.containers[c]])) as Record<ContColor, number>;
  for (const p of state.players) {
    countColors(Object.values(p.factoryLots).flat(), perColor);
    countColors(Object.values(p.harborLots).flat(), perColor);
    countColors(p.ship.cargo, perColor);
    countColors(p.holding, perColor);
    countColors(p.scoring, perColor);
    check(p.cash >= 0, `${label}: cash >= 0 (${p.name} has ${p.cash})`);
    check(p.ship.cargo.length <= CONT_RULES.shipCapacity, `${label}: ship cap`);
    check(new Set(p.factories).size === p.factories.length, `${label}: distinct factories`);
    check(p.reserves.factory >= 0 && p.reserves.harbor >= 0, `${label}: reserves >= 0`);
    if (state.phase === 'playing') {
      check(contLotCount(p.factoryLots) + p.reserves.factory <= p.factories.length * CONT_RULES.factoryLimitPer,
        `${label}: factory limit (${p.name})`);
      check(contLotCount(p.harborLots) + p.reserves.harbor <= p.warehouses * CONT_RULES.harborLimitPer,
        `${label}: harbor limit (${p.name})`);
    }
  }
  for (const lot of state.bank.containerLots) countColors(lot, perColor);
  for (const a of state.bank.auctions) countColors(a.bidContainers.map((b) => b.color), perColor);
  const supplyDef = CONT_SUPPLY_BY_PLAYERS[String(state.players.length)];
  const total = supplyDef.containersPerColor[state.length];
  for (const c of CONT_COLORS) {
    // discarded scoring containers return to the supply at game end, so the
    // total is conserved through the whole game including final scoring
    check(perColor[c] === total, `${label}: conservation ${c} (${perColor[c]} != ${total})`);
  }
  for (const amount of state.bank.cashLots) check(amount >= 0, `${label}: bank cash lots >= 0`);
  // reserves mirror the containers each player has on the bid tile
  for (const p of state.players) {
    const mine = state.bank.auctions.filter((a) => a.bidder === p.seat && a.lotType === 'cash');
    const f = mine.reduce((s, a) => s + a.bidContainers.filter((b) => b.from === 'factory').length, 0);
    const h = mine.reduce((s, a) => s + a.bidContainers.filter((b) => b.from === 'harbor').length, 0);
    check(p.reserves.factory === f && p.reserves.harbor === h, `${label}: reserves match bids (${p.name})`);
  }
}

// ---------------- bot playthroughs ----------------

function playthrough(n: number, length: 'short' | 'standard' | 'extended', seed: number) {
  const state = createContainer(seats(n), seed, { length });
  let steps = 0;
  while (state.phase === 'playing' && steps < 30000) {
    const actors = containerSeatsToAct(state);
    check(actors.length > 0, `playthrough ${n}p: someone can act`);
    let acted = false;
    for (const seatIdx of actors) {
      const action = containerBotAction(state, seatIdx);
      if (!action) continue;
      const r = applyContainerAction(state, seatIdx, action);
      if (!r.ok) {
        failures++;
        console.error(`FAIL: playthrough ${n}p ${length}: bot action rejected:`, JSON.stringify(action), '->', r.error);
        return;
      }
      acted = true;
      steps++;
      invariants(state, `playthrough ${n}p ${length} step ${steps}`);
      break; // re-evaluate actors after each apply
    }
    if (!acted) { failures++; console.error(`FAIL: playthrough ${n}p ${length}: stalled`); return; }
    if (failures > 25) return;
  }
  check(state.phase === 'ended', `playthrough ${n}p ${length}: finished (${steps} steps)`);
  if (state.phase === 'ended') {
    check(state.winners.length >= 1, `playthrough ${n}p: winners`);
    for (const p of state.players) {
      check(p.finalScore !== null, `playthrough ${n}p: final score for ${p.name}`);
      check(p.finalScore!.total === p.finalScore!.cash + p.finalScore!.island + p.finalScore!.leftovers + p.finalScore!.loans,
        `playthrough ${n}p: score adds up`);
    }
    console.log(`playthrough ${n}p ${length}: ended in ${steps} steps; totals`,
      state.players.map((p) => `${p.color}:$${p.finalScore!.total}`).join(' '));
  }
}

for (const n of [3, 4, 5]) playthrough(n, 'standard', 100 + n);
playthrough(3, 'short', 7);
playthrough(5, 'extended', 9);

// ---------------- directed rules tests ----------------

const fresh = (n = 3, seed = 42) => createContainer(seats(n), seed, { length: 'standard' });
const ok = (r: { ok: boolean }) => r.ok === true;
const rej = (r: { ok: true } | { ok: false; error: string }, label: string) => {
  check(!r.ok, label + ' (should reject)');
};

// setup facts (rulebook p2-3)
{
  const s = fresh(3);
  check(s.supply.warehouses === 12 - 3, 'setup: 3p warehouse supply minus starting');
  for (const p of s.players) {
    check(p.cash === 20, 'setup: $20 cash');
    check(p.warehouses === 1 && p.factories.length === 1, 'setup: free buildings');
    check(p.factoryLots[2].length === 1 && p.factoryLots[2][0] === p.factories[0], 'setup: starting container in the $2 lot');
    check(p.ship.loc.kind === 'ocean' && p.ship.cargo.length === 0, 'setup: ship in the ocean');
  }
  const bankCount = s.bank.containerLots[0].length + s.bank.containerLots[1].length + s.bank.containerLots[2].length;
  check(bankCount === 3 && s.bank.containerLots[0].length === 2 && s.bank.containerLots[1].length === 1, 'setup: bank containers 2/1/0');
  check(s.bank.cashLots.join(',') === '1,2,3', 'setup: bank cash 1/2/3');
  check(new Set(s.players.map((p) => p.scoringCard)).size === s.players.length, 'setup: distinct scoring cards');
  invariants(s, 'setup');
}

// produce: wage to the right, once per turn, maximality (p8-9)
{
  const s = fresh(3);
  const t = s.turn;
  const p = s.players[t];
  const right = s.players[(t - 1 + 3) % 3];
  const cashBefore = p.cash, rightBefore = right.cash;
  const color = p.factories[0];
  const r = applyContainerAction(s, t, { type: 'produce', make: [color], lots: { 1: [], 2: [color, color], 3: [], 4: [] } });
  check(ok(r), 'produce: legal produce accepted');
  check(p.cash === cashBefore - 1 && right.cash === rightBefore + 1, 'produce: $1 union wage to the right');
  check(p.factoryLots[2].length === 2, 'produce: containers arranged');
  rej(applyContainerAction(s, t, { type: 'produce', make: [color], lots: { 2: [color, color, color] } }), 'produce: twice per turn');
  invariants(s, 'produce');
}

// build: cost, distinct colors, supply (p8)
{
  const s = fresh(3);
  const t = s.turn;
  const p = s.players[t];
  rej(applyContainerAction(s, t, { type: 'build_factory', color: p.factories[0] }), 'build: duplicate factory color');
  const other = CONT_COLORS.find((c) => !p.factories.includes(c) && s.supply.factories[c] > 0)!;
  const r = applyContainerAction(s, t, { type: 'build_factory', color: other });
  check(ok(r), 'build: factory accepted');
  check(p.cash === 20 - CONT_RULES.factoryCosts[1], 'build: paid $6 for the second factory');
  const r2 = applyContainerAction(s, t, { type: 'build_warehouse' });
  check(ok(r2), 'build: warehouse accepted');
  check(p.cash === 20 - 6 - 4, 'build: paid $4 for the second warehouse');
  rej(applyContainerAction(s, t, { type: 'build_warehouse' }), 'build: no actions left');
  invariants(s, 'build');
}

// sail restrictions (p11)
{
  const s = fresh(3);
  const t = s.turn;
  rej(applyContainerAction(s, t, { type: 'sail', to: { harbor: t } }), 'sail: own harbor forbidden');
  rej(applyContainerAction(s, t, { type: 'sail', to: 'island' }), 'sail: island with empty ship');
  const other = (t + 1) % 3;
  check(ok(applyContainerAction(s, t, { type: 'sail', to: { harbor: other } })), 'sail: dock at opponent');
  check(s.anchorBuy === true, 'sail: anchor purchase available');
  rej(applyContainerAction(s, t, { type: 'sail', to: 'bank' }), 'sail: board-to-board without ocean');
  check(ok(applyContainerAction(s, t, { type: 'sail', to: 'ocean' })), 'sail: back to ocean');
  rej(applyContainerAction(s, t, { type: 'sail', to: 'ocean' }), 'sail: no actions left');
}

// factory purchase moves containers to the buyer's harbor (p9)
{
  const s = fresh(3);
  const t = s.turn;
  const seller = s.players[(t + 1) % 3];
  const color = seller.factoryLots[2][0];
  const buyer = s.players[t];
  const r = applyContainerAction(s, t, {
    type: 'factory_buy', from: seller.seat,
    picks: [{ price: 2, color, count: 1 }],
    lots: { 2: [], 3: [color], 4: [], 5: [], 6: [] },
  });
  check(ok(r), 'factory buy: accepted');
  check(buyer.cash === 18 && seller.cash === 22, 'factory buy: $2 paid to the seller');
  check(seller.factoryLots[2].length === 0 && buyer.harborLots[3].length === 1, 'factory buy: container moved');
  // harbor limit: 1 warehouse = 1 slot, already full
  const seller2 = s.players[(t + 2) % 3];
  const color2 = seller2.factoryLots[2][0];
  rej(applyContainerAction(s, t, {
    type: 'factory_buy', from: seller2.seat,
    picks: [{ price: 2, color: color2, count: 1 }],
    lots: { 3: [color], 4: [color2] },
  }), 'factory buy: harbor storage limit');
  invariants(s, 'factory buy');
}

// harbor purchase + free anchor action (p10-11)
{
  const s = fresh(3);
  const t = s.turn;
  const owner = s.players[(t + 1) % 3];
  const color = owner.factoryLots[2][0];
  // stage a container into the owner's harbor
  owner.harborLots[4].push(owner.factoryLots[2].pop()!);
  check(ok(applyContainerAction(s, t, { type: 'sail', to: { harbor: owner.seat } })), 'harbor buy: dock');
  const r = applyContainerAction(s, t, { type: 'harbor_buy', picks: [{ price: 4, color, count: 1 }], free: true });
  check(ok(r), 'harbor buy: free anchor purchase');
  check(s.actionsLeft === 1, 'harbor buy: anchor buy costs no action');
  check(s.players[t].ship.cargo.length === 1 && owner.cash === 24, 'harbor buy: loaded and paid');
  invariants(s, 'harbor buy');
}

// delivery auction: accept pays double, containers land in the winner's scoring area (p15-16)
{
  const s = fresh(3);
  const t = s.turn;
  const p = s.players[t];
  p.ship.cargo = ['Blue', 'Red'] as ContColor[];
  s.supply.containers.Blue -= 1; s.supply.containers.Red -= 1;
  check(ok(applyContainerAction(s, t, { type: 'sail', to: 'island' })), 'delivery: sail to island');
  check(s.delivery !== null && s.delivery!.stage === 'bidding', 'delivery: bidding opens');
  const [b1, b2] = s.players.filter((q) => q.seat !== t).map((q) => q.seat);
  rej(applyContainerAction(s, t, { type: 'delivery_bid', amount: 5 }), 'delivery: deliverer cannot bid');
  check(ok(applyContainerAction(s, b1, { type: 'delivery_bid', amount: 4 })), 'delivery: bid 1');
  check(ok(applyContainerAction(s, b2, { type: 'delivery_bid', amount: 6 })), 'delivery: bid 2');
  check(s.delivery!.stage === 'resolve', 'delivery: bids revealed');
  const cashBefore = p.cash;
  check(ok(applyContainerAction(s, t, { type: 'delivery_resolve', mode: 'accept' })), 'delivery: accept');
  check(p.cash === cashBefore + 12, 'delivery: bid + government subsidy');
  check(s.players[b2].cash === 14 && s.players[b2].scoring.length === 2, 'delivery: winner paid and scored');
  check(s.turn !== t || s.players.length === 1, 'delivery: turn ended immediately');
  invariants(s, 'delivery accept');
}

// delivery runoff on ties, then buyout (p16)
{
  const s = fresh(3);
  const t = s.turn;
  const p = s.players[t];
  p.ship.cargo = ['Green'] as ContColor[];
  s.supply.containers.Green -= 1;
  applyContainerAction(s, t, { type: 'sail', to: 'island' });
  const [b1, b2] = s.players.filter((q) => q.seat !== t).map((q) => q.seat);
  applyContainerAction(s, b1, { type: 'delivery_bid', amount: 3 });
  applyContainerAction(s, b2, { type: 'delivery_bid', amount: 3 });
  check(s.delivery!.stage === 'runoff', 'runoff: tie starts a runoff');
  applyContainerAction(s, b1, { type: 'delivery_bid', amount: 1 });
  applyContainerAction(s, b2, { type: 'delivery_bid', amount: 0 });
  check(s.delivery!.stage === 'resolve' && s.delivery!.tied.join(',') === String(b1), 'runoff: totals decide');
  const bankBefore = [...s.bank.cashLots];
  check(ok(applyContainerAction(s, t, { type: 'delivery_resolve', mode: 'buyout' })), 'runoff: buyout');
  check(p.scoring.length === 1, 'buyout: containers kept');
  check(s.bank.cashLots.reduce((a, b) => a + b, 0) === bankBefore.reduce((a, b) => a + b, 0) + 4, 'buyout: winning bid paid to the bank lots');
  check(s.players[b1].cash === 20, 'buyout: high bidder keeps their cash');
  invariants(s, 'delivery buyout');
}

// call bank: cash bid for containers, outbid, win at turn start; once per turn (p12-14)
{
  const s = fresh(3);
  const a = s.turn;
  const b = (a + 1) % 3, c = (a + 2) % 3;
  check(ok(applyContainerAction(s, a, { type: 'call_bank', lotType: 'container', lot: 0, cash: 2 })), 'bank: open cash bid');
  check(s.bank.auctions.length === 1 && s.bank.tokensFree === 0, 'bank: token placed');
  check(s.players[a].cash === 18, 'bank: bid cash locked away');
  rej(applyContainerAction(s, a, { type: 'call_bank', lotType: 'container', lot: 0, cash: 5 }), 'bank: once per turn');
  applyContainerAction(s, a, { type: 'end_turn' });
  // next player outbids
  rej(applyContainerAction(s, b, { type: 'call_bank', lotType: 'container', lot: 1, cash: 2 }), 'bank: must outbid, not underbid');
  check(ok(applyContainerAction(s, b, { type: 'call_bank', lotType: 'container', lot: 0, cash: 3 })), 'bank: outbid');
  check(s.players[a].cash === 20, 'bank: outbid cash returned');
  applyContainerAction(s, b, { type: 'end_turn' });
  applyContainerAction(s, c, { type: 'end_turn' });
  applyContainerAction(s, a, { type: 'end_turn' });
  // b's turn starts: wins the auction
  check(s.bank.auctions.length === 0 && s.bank.tokensFree === 1, 'bank: auction resolved at turn start');
  check(s.players[b].holding.length === 2, 'bank: lot I containers to the holding area');
  check(s.players[b].cash === 17, 'bank: paid the bid');
  check(s.wonAuctionThisTurn === true && s.turn === b, 'bank: win flag set');
  rej(applyContainerAction(s, b, { type: 'call_bank', lotType: 'container', lot: 1, cash: 1 }), 'bank: no call the turn you win');
  invariants(s, 'bank cash-bid auction');
}

// call bank: container bid, reserves count against the storage limit (p12-13)
{
  const s = fresh(3);
  const t = s.turn;
  const p = s.players[t];
  const color = p.factoryLots[2][0];
  check(ok(applyContainerAction(s, t, {
    type: 'call_bank', lotType: 'cash', lot: 2,
    containers: [{ from: 'factory', price: 2, color }],
  })), 'bank: container bid accepted');
  check(p.reserves.factory === 1 && p.factoryLots[2].length === 0, 'bank: reserve token placed');
  // factory limit is 2 (1 factory): 1 reserve + produce 1 = at limit, so produce only 1
  const r = applyContainerAction(s, t, { type: 'produce', make: [p.factories[0]], lots: { 2: [p.factories[0]] } });
  check(ok(r), 'bank: produce with reserve');
  rej(applyContainerAction(s, t, { type: 'produce', make: [p.factories[0]], lots: { 2: [p.factories[0], p.factories[0]] } }),
    'bank: reserve fills the district');
  invariants(s, 'bank container bid');
}

// loans: interest at turn start, forced loan, default seizure order (p16-17)
{
  const s = fresh(3);
  const t = s.turn;
  const p = s.players[t];
  check(ok(applyContainerAction(s, t, { type: 'take_loan' })), 'loan: take');
  check(p.cash === 30 && p.loans === 1, 'loan: +$10');
  check(ok(applyContainerAction(s, t, { type: 'repay_loan' })), 'loan: repay');
  check(p.cash === 20 && p.loans === 0, 'loan: -$10');
  // engineer a default: 2 loans, no cash, a container on the ship
  p.loans = 2;
  p.cash = 0;
  p.ship.cargo = ['Blue'] as ContColor[];
  s.supply.containers.Blue -= 1;
  p.scoring = ['Red'] as ContColor[];
  s.supply.containers.Red -= 1;
  applyContainerAction(s, t, { type: 'end_turn' });
  applyContainerAction(s, (t + 1) % 3, { type: 'end_turn' });
  applyContainerAction(s, (t + 2) % 3, { type: 'end_turn' });
  // t's turn again: $2 interest due, $0 cash, 2 loans -> default, seize 2
  check(s.pending.length === 1 && s.pending[0].kind === 'seize', 'default: seizure pending');
  const decider = (t - 1 + 3) % 3;
  rej(applyContainerAction(s, decider, { type: 'choose_seize', picks: ['Blue', 'Blue'] as ContColor[] }),
    'default: scoring area is seized first');
  check(ok(applyContainerAction(s, decider, { type: 'choose_seize', picks: ['Red', 'Blue'] as ContColor[] })),
    'default: scoring then ship');
  check(p.scoring.length === 0 && p.ship.cargo.length === 0, 'default: containers seized');
  invariants(s, 'default');
}

// final scoring per the card values + forced two-value discard (p18, mod Lua)
{
  const s = fresh(3);
  const p = s.players[0];
  p.scoringCard = 'White'; // two-value White; Yellow 10 / Green 6 / Red 4 / Blue 2
  p.scoring = ['White', 'White', 'Yellow', 'Green', 'Red', 'Blue', 'Blue'] as ContColor[];
  // most common: White(2) tied Blue(2) -> two-value tied: White MUST go
  s.endTriggered = true;
  s.players[1].scoring = [];
  s.players[2].scoring = [];
  for (const q of s.players) { q.ship.cargo = []; q.holding = []; q.harborLots = { 2: [], 3: [], 4: [], 5: [], 6: [] }; q.factoryLots = { 1: [], 2: [], 3: [], 4: [] }; q.loans = 0; }
  const t = s.turn;
  applyContainerAction(s, t, { type: 'end_turn' });
  check(s.phase === 'ended', 'scoring: game ended after the final turn');
  check(p.finalScore!.discarded === 'White', 'scoring: tied two-value color is discarded');
  // all five colors present pre-discard -> irrelevant now (White discarded), rest: Y10+G6+R4+B2*2
  check(p.finalScore!.island === 10 + 6 + 4 + 2 + 2, `scoring: island value (${p.finalScore!.island})`);
  check(p.finalScore!.allFive === true, 'scoring: all five counted pre-discard');
}

// leftover values + loan penalty (p18)
{
  const s = fresh(3);
  const p = s.players[0];
  for (const q of s.players) { q.scoring = []; }
  p.ship.cargo = ['Blue', 'Blue'] as ContColor[];
  s.supply.containers.Blue -= 2;
  p.holding = ['Red'] as ContColor[];
  s.supply.containers.Red -= 1;
  p.harborLots[3] = ['Green'] as ContColor[];
  s.supply.containers.Green -= 1;
  p.loans = 1;
  s.endTriggered = true;
  applyContainerAction(s, s.turn, { type: 'end_turn' });
  const fsc = p.finalScore!;
  check(fsc.leftovers === 3 * 3 + 2, `scoring: leftovers $${fsc.leftovers} (3 ship/holding x3 + harbor x2)`);
  check(fsc.loans === -11, 'scoring: loan penalty $11');
}

// view redaction: cash and scoring cards hidden from others until the end
{
  const s = fresh(3);
  const v0 = containerViewFor(s, 0);
  check(v0.players[0].cash === 20 && v0.players[1].cash === null, 'view: own cash visible, others hidden');
  check(v0.players[0].scoringCard !== null && v0.players[1].scoringCard === null, 'view: scoring card secrecy');
  const tv = containerViewFor(s, null);
  check(tv.players.every((q) => q.cash === null && q.scoringCard === null), 'view: TV sees no secrets');
  // delivery bids hidden while bidding
  const t = s.turn;
  s.players[t].ship.cargo = ['Blue'] as ContColor[];
  s.supply.containers.Blue -= 1;
  applyContainerAction(s, t, { type: 'sail', to: 'island' });
  const bidder = s.players.find((q) => q.seat !== t)!.seat;
  applyContainerAction(s, bidder, { type: 'delivery_bid', amount: 5 });
  const vOther = containerViewFor(s, s.players.find((q) => q.seat !== t && q.seat !== bidder)!.seat);
  check(vOther.delivery!.bids === null && vOther.delivery!.bidsIn[bidder] === true, 'view: bids masked while bidding');
  const vBidder = containerViewFor(s, bidder);
  check(vBidder.delivery!.yourBid === 5, 'view: your own bid visible');
}

// game end trigger: two colors exhausted ends the game after the turn (p18)
{
  const s = fresh(3);
  s.supply.containers.Blue = 0;
  s.supply.containers.Red = 1;
  const t = s.turn;
  const p = s.players[t];
  if (!p.factories.includes('Red')) { p.factories = ['Red']; }
  p.factoryLots = { 1: [], 2: [p.factories[0]], 3: [], 4: [] } as unknown as typeof p.factoryLots;
  // normalize: the starting container color must match what is in lots for conservation; skip invariants here
  const r = applyContainerAction(s, t, { type: 'produce', make: ['Red'], lots: { 2: [p.factoryLots[2][0], 'Red'] } });
  check(ok(r), 'end: produce the last red');
  check(s.endTriggered === true, 'end: trigger set when two colors are out');
  rej(applyContainerAction(s, t, { type: 'call_bank', lotType: 'container', lot: 0, cash: 1 }), 'end: no call bank on the end turn');
  applyContainerAction(s, t, { type: 'end_turn' });
  check(s.phase === 'ended', 'end: game over after the final turn');
}

console.log(failures === 0 ? 'ALL CONTAINER TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
