// Container (2026) — reducer + bot, per docs/specs/container.md.
// All rules from the mod's rulebook PDF; final scoring cross-checked against
// the mod's score-token Lua. Fully enforced (the physical game enforces its
// economy; nothing here is honor-system).

import {
  ContainerState, ContPlayer, ContColor, ContLots, ContAuction, ContBidContainer,
  CONT_COLORS, CONT_RULES, CONT_SCORING_CARDS,
  contFactoryLimit, contHarborLimit, contLotCount, contFactoryUsed, contHarborUsed,
  contEmptyLots, ContFocus,
} from './state.js';

export type ContAction =
  | { type: 'build_factory'; color: ContColor }
  | { type: 'build_warehouse' }
  | { type: 'produce'; make: ContColor[]; lots: ContLots }
  | { type: 'factory_buy'; from: number; picks: { price: number; color: ContColor; count: number }[]; lots: ContLots }
  | { type: 'harbor_buy'; picks: { price: number; color: ContColor; count: number }[]; free?: boolean }
  | { type: 'reprice'; district: 'factory' | 'harbor'; lots: ContLots }
  | { type: 'sail'; to: 'ocean' | 'island' | 'bank' | { harbor: number }; load?: ContColor[] }
  | { type: 'call_bank'; lotType: 'cash' | 'container'; lot: number; cash?: number; containers?: ContBidContainer[] }
  | { type: 'take_loan' }
  | { type: 'repay_loan' }
  | { type: 'end_turn' }
  | { type: 'delivery_bid'; amount: number }
  | { type: 'delivery_resolve'; mode: 'accept' | 'buyout'; winner?: number }
  | { type: 'choose_distribute'; perLot: ContColor[][] }
  | { type: 'choose_seize'; picks: ContColor[] };

type Result = { ok: true } | { ok: false; error: string };
const err = (error: string): Result => ({ ok: false, error: error.replace(/\s+—\s+/g, ', ').replace(/^\p{Ll}/u, (m) => m.toUpperCase()) });

const event = (
  state: ContainerState, text: string, kind?: string, focus?: ContFocus | null,
  transfer?: { from: number; to: number; colors: ContColor[] } | null,
) => {
  state.lastEvent = { seq: state.lastEvent.seq + 1, text, kind, focus: focus ?? null, transfer: transfer ?? null };
};
const seatName = (state: ContainerState, seat: number) => state.players[seat].name.toUpperCase();

// ---------- multiset helpers ----------

const countBy = (list: ContColor[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const c of list) m[c] = (m[c] ?? 0) + 1;
  return m;
};
const sameMultiset = (a: ContColor[], b: ContColor[]): boolean => {
  if (a.length !== b.length) return false;
  const ma = countBy(a), mb = countBy(b);
  return Object.keys({ ...ma, ...mb }).every((k) => (ma[k] ?? 0) === (mb[k] ?? 0));
};
const lotsFlat = (lots: ContLots): ContColor[] => Object.values(lots).flat();
const removeOne = (list: ContColor[], color: ContColor): boolean => {
  const i = list.indexOf(color);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
};

/** validate a full-district arrangement payload: right prices, same multiset */
const validLots = (payload: ContLots, prices: number[], expect: ContColor[]): ContLots | null => {
  const clean = contEmptyLots(prices);
  for (const [k, v] of Object.entries(payload ?? {})) {
    const price = Number(k);
    if (!prices.includes(price)) return null;
    if (!Array.isArray(v) || v.some((c) => !CONT_COLORS.includes(c))) return null;
    clean[price] = [...v];
  }
  return sameMultiset(lotsFlat(clean), expect) ? clean : null;
};

// ---------- bank payment plumbing ----------

const tokenLots = (state: ContainerState, lotType: 'cash' | 'container'): Set<number> =>
  new Set(state.bank.auctions.filter((a) => a.lotType === lotType).map((a) => a.lot));

/** cash into the bank's cash lots, round-robin from lot I, skipping token'd lots */
const payBankCash = (state: ContainerState, amount: number) => {
  const skip = tokenLots(state, 'cash');
  const open = [0, 1, 2].filter((l) => !skip.has(l));
  if (open.length === 0) return; // all lots blocked: cash is simply lost to the vault
  for (let i = 0; i < amount; i++) state.bank.cashLots[open[i % open.length]] += 1;
};

/** the forced per-lot counts for distributing k containers round-robin from lot I */
export const contDistributeCounts = (state: ContainerState, k: number): number[] => {
  const skip = tokenLots(state, 'container');
  const open = [0, 1, 2].filter((l) => !skip.has(l));
  const counts = [0, 0, 0];
  if (open.length === 0) return counts;
  for (let i = 0; i < k; i++) counts[open[i % open.length]] += 1;
  return counts;
};

const payBankContainersAuto = (state: ContainerState, containers: ContColor[]) => {
  const counts = contDistributeCounts(state, containers.length);
  let i = 0;
  for (const lot of [0, 1, 2]) {
    for (let n = 0; n < counts[lot]; n++) state.bank.containerLots[lot].push(containers[i++]);
  }
};

// ---------- game end ----------

const checkEndTrigger = (state: ContainerState) => {
  const out = CONT_COLORS.filter((c) => state.supply.containers[c] <= 0).length;
  if (out >= CONT_RULES.endColorsOut && !state.endTriggered) {
    state.endTriggered = true;
    event(state, 'THE SUPPLY IS EXHAUSTED, FINAL TURN', 'alert', null);
  }
};

const scoreIsland = (p: ContPlayer): { island: number; discarded: ContColor | null; allFive: boolean } => {
  const card = CONT_SCORING_CARDS[p.scoringCard];
  const counts = countBy(p.scoring);
  const present = CONT_COLORS.filter((c) => (counts[c] ?? 0) > 0);
  const allFive = present.length === CONT_COLORS.length;
  const valueOf = (c: ContColor) =>
    c === card.twoValue ? (allFive ? CONT_RULES.twoValueHigh : CONT_RULES.twoValueLow) : (card.values[c] ?? 0);
  if (present.length === 0) return { island: 0, discarded: null, allFive };
  const max = Math.max(...present.map((c) => counts[c]));
  const tied = present.filter((c) => counts[c] === max);
  // rulebook p18: tied two-value color MUST be discarded; otherwise the player
  // chooses (the engine auto-picks the cheapest legal discard for them).
  let discarded: ContColor;
  if (tied.includes(card.twoValue)) discarded = card.twoValue;
  else discarded = tied.reduce((best, c) => (valueOf(c) * counts[c] < valueOf(best) * counts[best] ? c : best), tied[0]);
  const island = present
    .filter((c) => c !== discarded)
    .reduce((sum, c) => sum + valueOf(c) * counts[c], 0);
  return { island, discarded, allFive };
};

const endGame = (state: ContainerState) => {
  // active auctions resolve to their current high bidders (rulebook p18)
  for (const a of [...state.bank.auctions]) {
    const p = state.players[a.bidder];
    state.bank.auctions = state.bank.auctions.filter((x) => x !== a);
    if (a.lotType === 'container') {
      payBankCash(state, a.bid);
      p.holding.push(...state.bank.containerLots[a.lot]);
      state.bank.containerLots[a.lot] = [];
    } else {
      payBankContainersAuto(state, a.bidContainers.map((b) => b.color));
      p.reserves.factory -= a.bidContainers.filter((b) => b.from === 'factory').length;
      p.reserves.harbor -= a.bidContainers.filter((b) => b.from === 'harbor').length;
      p.cash += state.bank.cashLots[a.lot];
      state.bank.cashLots[a.lot] = 0;
    }
    state.bank.tokensFree += 1;
  }
  for (const p of state.players) {
    const { island, discarded, allFive } = scoreIsland(p);
    if (discarded) {
      const n = p.scoring.filter((c) => c === discarded).length;
      state.supply.containers[discarded] += n;
      p.scoring = p.scoring.filter((c) => c !== discarded);
    }
    const lv = CONT_RULES.leftoverValues;
    const leftovers = (p.ship.cargo.length + p.holding.length) * lv.ship + contLotCount(p.harborLots) * lv.harbor;
    const loans = p.loans * CONT_RULES.loanEndPenalty;
    p.finalScore = {
      cash: p.cash, island, leftovers, loans: -loans,
      total: p.cash + island + leftovers - loans,
      discarded, allFive,
    };
  }
  const best = Math.max(...state.players.map((p) => p.finalScore!.total));
  let winners = state.players.filter((p) => p.finalScore!.total === best);
  if (winners.length > 1) {
    const most = Math.max(...winners.map((p) => contLotCount(p.factoryLots)));
    winners = winners.filter((p) => contLotCount(p.factoryLots) === most);
  }
  state.winners = winners.map((p) => p.seat);
  state.phase = 'ended';
  const names = winners.map((p) => p.name.toUpperCase()).join(' AND ');
  event(state, `${names} WIN${winners.length === 1 ? 'S' : ''} WITH $${best}`, 'win', null);
};

// ---------- turn flow ----------

const seizableLocations = (p: ContPlayer): { loc: string; list: ContColor[] }[] => [
  { loc: 'scoring area', list: p.scoring },
  { loc: 'ship', list: p.ship.cargo },
  { loc: 'holding area', list: p.holding },
  { loc: 'harbor', list: lotsFlat(p.harborLots) },
  { loc: 'factory', list: lotsFlat(p.factoryLots) },
];

const startTurn = (state: ContainerState) => {
  const p = state.players[state.turn];
  state.actionsLeft = CONT_RULES.actionsPerTurn;
  state.producedThisTurn = false;
  state.calledBankThisTurn = false;
  state.wonAuctionThisTurn = false;
  state.anchorBuy = false;
  event(state, `${seatName(state, state.turn)}'S TURN`, 'turn', null);

  // 1. loan interest — must be paid before anything else; forced loans, then default
  const due = p.loans * CONT_RULES.loanInterest;
  if (due > 0) {
    while (p.cash < due && p.loans < CONT_RULES.loanMax) {
      p.loans += 1;
      p.cash += CONT_RULES.loanValue;
      event(state, `${seatName(state, state.turn)} IS FORCED TO TAKE A LOAN`, 'alert', { type: 'bank' });
    }
    const paid = Math.min(p.cash, due);
    p.cash -= paid;
    payBankCash(state, paid);
    if (paid > 0) event(state, `${seatName(state, state.turn)} PAYS $${paid} INTEREST`, 'action', { type: 'bank' });
    const unpaid = due - paid;
    if (unpaid > 0) {
      const seizable = seizableLocations(p).some((l) => l.list.length > 0);
      if (seizable) {
        const decider = (state.turn - 1 + state.players.length + state.players.length) % state.players.length;
        state.pending.push({ kind: 'seize', seat: state.turn, decider, count: unpaid });
        event(state, `${seatName(state, state.turn)} DEFAULTS, THE BANK SEIZES ${unpaid} CONTAINER${unpaid > 1 ? 'S' : ''}`, 'alert', { type: 'bank' });
      } else {
        event(state, `${seatName(state, state.turn)} DEFAULTS, THE BANK FORGIVES THE INTEREST`, 'alert', { type: 'bank' });
      }
    }
  }

  // 2. win bank auctions held by this player
  for (const a of state.bank.auctions.filter((x) => x.bidder === state.turn)) {
    state.bank.auctions = state.bank.auctions.filter((x) => x !== a);
    state.bank.tokensFree += 1;
    state.wonAuctionThisTurn = true;
    if (a.lotType === 'container') {
      // cash bid pays the bank, containers to the holding area
      payBankCash(state, a.bid);
      p.holding.push(...state.bank.containerLots[a.lot]);
      event(state, `${seatName(state, state.turn)} WINS THE BANK AUCTION FOR $${a.bid}`, 'action', { type: 'bank' });
      state.bank.containerLots[a.lot] = [];
    } else {
      // container bid pays the bank's container lots, cash to hand
      const colors = a.bidContainers.map((b) => b.color);
      p.reserves.factory -= a.bidContainers.filter((b) => b.from === 'factory').length;
      p.reserves.harbor -= a.bidContainers.filter((b) => b.from === 'harbor').length;
      const distinct = new Set(colors);
      if (distinct.size > 1) {
        state.pending.push({ kind: 'bankDistribute', seat: state.turn, containers: colors, skipLot: null });
      } else {
        payBankContainersAuto(state, colors);
      }
      p.cash += state.bank.cashLots[a.lot];
      event(state, `${seatName(state, state.turn)} WINS $${state.bank.cashLots[a.lot]} AT THE BANK AUCTION`, 'action', { type: 'bank' });
      state.bank.cashLots[a.lot] = 0;
    }
  }
};

const advanceTurn = (state: ContainerState) => {
  if (state.endTriggered) { endGame(state); return; }
  state.turn = (state.turn + 1) % state.players.length;
  startTurn(state);
};

// ---------- delivery auction ----------

const startDelivery = (state: ContainerState, deliverer: number) => {
  const p = state.players[deliverer];
  const bids: Record<number, number | null> = {};
  for (const q of state.players) if (q.seat !== deliverer) bids[q.seat] = null;
  state.delivery = {
    deliverer, cargo: [...p.ship.cargo], stage: 'bidding',
    bids, runoffAmong: [], runoffBids: {}, tied: [],
  };
  event(state, `${seatName(state, deliverer)} DELIVERS TO CONTAINER ISLAND, SECRET BIDS`, 'action', { type: 'island' });
};

const deliveryTotals = (state: ContainerState): Record<number, number> => {
  const d = state.delivery!;
  const totals: Record<number, number> = {};
  for (const [s, b] of Object.entries(d.bids)) totals[Number(s)] = (b ?? 0) + (d.runoffBids[Number(s)] ?? 0);
  return totals;
};

const revealDelivery = (state: ContainerState, allowRunoff: boolean) => {
  const d = state.delivery!;
  const totals = deliveryTotals(state);
  const max = Math.max(...Object.values(totals));
  const top = Object.keys(totals).map(Number).filter((s) => totals[s] === max);
  if (top.length > 1 && allowRunoff) {
    // runoff: tied players add facedown cash on top of their bids
    d.stage = 'runoff';
    d.runoffAmong = top;
    for (const s of top) d.runoffBids[s] = null;
    event(state, `TIE AT $${max}, RUNOFF AUCTION`, 'action', { type: 'island' });
    return;
  }
  // a tie that survives the runoff is broken by the deliverer (p16)
  d.tied = top;
  d.stage = 'resolve';
  event(state, `HIGH BID $${max}, ${seatName(state, d.deliverer)} DECIDES`, 'action', { type: 'island' });
};

const finishDelivery = (state: ContainerState, mode: 'accept' | 'buyout', winnerSeat: number | null): Result => {
  const d = state.delivery!;
  const p = state.players[d.deliverer];
  const totals = deliveryTotals(state);
  const high = Math.max(...Object.values(totals));
  if (mode === 'accept') {
    const winner = d.tied.length === 1 ? d.tied[0] : winnerSeat;
    if (winner === null || !d.tied.includes(winner)) return err('Pick which tied bidder wins');
    const w = state.players[winner];
    w.cash -= totals[winner];
    p.cash += totals[winner] * 2; // bid + matching government subsidy from the supply
    w.scoring.push(...d.cargo);
    event(state, `${seatName(state, winner)} WINS THE DELIVERY FOR $${totals[winner]}`, 'action', { type: 'island' });
  } else {
    if (p.cash < high) return err('Not enough cash to buy out the auction');
    p.cash -= high;
    payBankCash(state, high);
    p.scoring.push(...d.cargo);
    event(state, `${seatName(state, d.deliverer)} BUYS OUT THE DELIVERY FOR $${high}`, 'action', { type: 'island' });
  }
  p.ship.cargo = [];
  state.delivery = null;
  // the turn ends immediately after a delivery auction (rulebook p15)
  advanceTurn(state);
  return { ok: true };
};

// ---------- main reducer ----------

export function applyContainerAction(state: ContainerState, seat: number, action: ContAction): Result {
  if (state.phase === 'ended') return err('The game is over');
  const p = state.players[seat];
  if (!p) return err('Unknown seat');
  const me = () => state.players[seat];
  const n = state.players.length;

  // ---- delivery auction sub-phase ----
  if (state.delivery) {
    const d = state.delivery;
    if (action.type === 'take_loan') {
      // loans are allowed at any time, including while bidding (rulebook p16)
      if (p.loans >= CONT_RULES.loanMax) return err('Loan limit reached');
      p.loans += 1;
      p.cash += CONT_RULES.loanValue;
      event(state, `${seatName(state, seat)} TAKES A $${CONT_RULES.loanValue} LOAN`, 'action', { type: 'bank' });
      return { ok: true };
    }
    if (action.type === 'delivery_bid') {
      const amount = Math.floor(Number(action.amount));
      if (!Number.isFinite(amount) || amount < 0) return err('Invalid bid');
      if (amount > p.cash) return err('Not enough cash for that bid');
      if (d.stage === 'bidding') {
        if (d.bids[seat] === undefined) return err('The deliverer does not bid');
        if (d.bids[seat] !== null) return err('Bid already placed');
        d.bids[seat] = amount;
        event(state, `${seatName(state, seat)} PLACES A SECRET BID`, 'action', { type: 'island' });
        if (Object.values(d.bids).every((b) => b !== null)) revealDelivery(state, true);
        return { ok: true };
      }
      if (d.stage === 'runoff') {
        if (!d.runoffAmong.includes(seat)) return err('Not in the runoff');
        if (d.runoffBids[seat] !== null) return err('Runoff bid already placed');
        if ((d.bids[seat] ?? 0) + amount > p.cash) return err('Not enough cash for that bid');
        d.runoffBids[seat] = amount;
        if (d.runoffAmong.every((s) => d.runoffBids[s] !== null)) revealDelivery(state, false);
        return { ok: true };
      }
      return err('Bidding is closed');
    }
    if (action.type === 'delivery_resolve') {
      if (seat !== d.deliverer) return err('Only the deliverer resolves the auction');
      if (d.stage !== 'resolve') return err('Bids are not all in yet');
      return finishDelivery(state, action.mode, action.winner ?? null);
    }
    return err('Waiting on the delivery auction');
  }

  // ---- pending decisions block everything else ----
  if (state.pending.length > 0) {
    const head = state.pending[0];
    if (head.kind === 'bankDistribute') {
      if (action.type !== 'choose_distribute') return err('Waiting on a bank lot distribution');
      if (seat !== head.seat) return err('Not your decision');
      const counts = contDistributeCounts(state, head.containers.length);
      const perLot = action.perLot;
      if (!Array.isArray(perLot) || perLot.length !== 3) return err('Invalid distribution');
      if (perLot.some((l, i) => l.length !== counts[i])) return err('Lot counts must follow the round robin');
      if (!sameMultiset(perLot.flat(), head.containers)) return err('Distribute exactly the paid containers');
      for (const lot of [0, 1, 2]) state.bank.containerLots[lot].push(...perLot[lot]);
      state.pending.shift();
      return { ok: true };
    }
    if (head.kind === 'seize') {
      if (action.type !== 'choose_seize') return err('Waiting on the loan default seizure');
      if (seat !== head.decider) return err('The player to the right decides the seizure');
      const victim = state.players[head.seat];
      const picks = action.picks;
      if (!Array.isArray(picks) || picks.length > head.count) return err(`Pick ${head.count} container${head.count > 1 ? 's' : ''}`);
      const taken: ContColor[] = [];
      for (const color of picks) {
        const loc = seizableLocations(victim).find((l) => l.list.length > 0);
        if (!loc) break; // nothing left to seize; remaining interest is forgiven
        if (!loc.list.includes(color)) return err(`The Bank seizes from the ${loc.loc} first`);
        if (loc.loc === 'harbor' || loc.loc === 'factory') {
          const lots = loc.loc === 'harbor' ? victim.harborLots : victim.factoryLots;
          for (const price of Object.keys(lots)) {
            if (removeOne(lots[Number(price)], color)) break;
          }
        } else {
          removeOne(loc.list, color);
        }
        taken.push(color);
      }
      if (taken.length < head.count && seizableLocations(victim).some((l) => l.list.length > 0)) {
        return err(`Pick ${head.count} container${head.count > 1 ? 's' : ''}`);
      }
      payBankContainersAuto(state, taken);
      state.pending.shift();
      event(state, `THE BANK SEIZES ${taken.length} CONTAINER${taken.length === 1 ? '' : 'S'} FROM ${seatName(state, head.seat)}`, 'alert', { type: 'bank' });
      return { ok: true };
    }
  }

  // ---- free actions on your own turn ----
  if (action.type === 'take_loan') {
    if (seat !== state.turn) return err('Loans outside auctions are taken on your turn');
    if (p.loans >= CONT_RULES.loanMax) return err('Loan limit reached');
    p.loans += 1;
    p.cash += CONT_RULES.loanValue;
    event(state, `${seatName(state, seat)} TAKES A $${CONT_RULES.loanValue} LOAN`, 'action', { type: 'bank' });
    return { ok: true };
  }
  if (action.type === 'repay_loan') {
    if (seat !== state.turn) return err('Repay loans on your own turn');
    if (p.loans <= 0) return err('No outstanding loans');
    if (p.cash < CONT_RULES.loanValue) return err('Not enough cash to repay');
    p.loans -= 1;
    p.cash -= CONT_RULES.loanValue;
    event(state, `${seatName(state, seat)} REPAYS A LOAN`, 'action', { type: 'bank' });
    return { ok: true };
  }

  if (seat !== state.turn) return err('Not your turn');

  const spendAction = (): Result | null => {
    if (state.actionsLeft <= 0) return err('No actions left, end your turn');
    state.actionsLeft -= 1;
    state.anchorBuy = false;
    return null;
  };

  switch (action.type) {
    case 'end_turn': {
      state.anchorBuy = false;
      advanceTurn(state);
      return { ok: true };
    }

    case 'build_factory': {
      const color = action.color;
      if (!CONT_COLORS.includes(color)) return err('Invalid factory color');
      if (me().factories.length >= CONT_RULES.factoryCosts.length) return err('Factory track is full');
      if (me().factories.includes(color)) return err('You already have that factory color');
      if (state.supply.factories[color] <= 0) return err('No factories of that color in the supply');
      const cost = CONT_RULES.factoryCosts[me().factories.length];
      if (me().cash < cost) return err('Not enough cash');
      const spent = spendAction();
      if (spent) return spent;
      me().cash -= cost; // paid to the supply, not the Bank
      state.supply.factories[color] -= 1;
      me().factories.push(color);
      event(state, `${seatName(state, seat)} BUILDS A ${color.toUpperCase()} FACTORY`, 'action',
        { type: 'board', seat, sub: { kind: 'factoryTrack', index: me().factories.length - 1 } });
      return { ok: true };
    }

    case 'build_warehouse': {
      if (me().warehouses >= CONT_RULES.warehouseCosts.length) return err('Warehouse track is full');
      if (state.supply.warehouses <= 0) return err('No warehouses left in the supply');
      const cost = CONT_RULES.warehouseCosts[me().warehouses];
      if (me().cash < cost) return err('Not enough cash');
      const spent = spendAction();
      if (spent) return spent;
      me().cash -= cost;
      state.supply.warehouses -= 1;
      me().warehouses += 1;
      event(state, `${seatName(state, seat)} BUILDS A WAREHOUSE`, 'action',
        { type: 'board', seat, sub: { kind: 'warehouseTrack', index: me().warehouses - 1 } });
      return { ok: true };
    }

    case 'produce': {
      if (state.producedThisTurn) return err('Produce is once per turn');
      if (me().cash < 1) return err('Cannot pay the $1 union wage');
      const eligible = me().factories.filter((c) => state.supply.containers[c] > 0);
      const room = contFactoryLimit(me()) - contFactoryUsed(me());
      const expected = Math.min(eligible.length, Math.max(0, room));
      if (expected === 0) return err('No containers can be produced');
      const make = action.make ?? [];
      if (make.length !== expected) return err(`You must produce ${expected} container${expected > 1 ? 's' : ''}`);
      if (new Set(make).size !== make.length) return err('One container per factory');
      if (make.some((c) => !eligible.includes(c))) return err('Produce only from your factories with supply');
      const lots = validLots(action.lots, CONT_RULES.factoryLotPrices, [...lotsFlat(me().factoryLots), ...make]);
      if (!lots) return err('Arrange exactly your factory containers');
      const spent = spendAction();
      if (spent) return spent;
      state.producedThisTurn = true;
      me().cash -= 1;
      state.players[(seat - 1 + n) % n].cash += 1; // union wage to the player on your right
      for (const c of make) state.supply.containers[c] -= 1;
      me().factoryLots = lots;
      event(state, `${seatName(state, seat)} PRODUCES ${make.length} CONTAINER${make.length > 1 ? 'S' : ''}`, 'action',
        { type: 'board', seat, sub: { kind: 'factoryLots' } });
      checkEndTrigger(state);
      return { ok: true };
    }

    case 'factory_buy': {
      const other = state.players[action.from];
      if (!other || action.from === seat) return err('Buy from an opponent');
      const picks = action.picks ?? [];
      if (picks.length === 0 || picks.some((x) => !Number.isInteger(x.count) || x.count <= 0)) return err('Pick containers to buy');
      const total = picks.reduce((a, x) => a + x.count, 0);
      const cost = picks.reduce((a, x) => a + x.price * x.count, 0);
      if (contHarborUsed(me()) + total > contHarborLimit(me())) return err('Harbor storage limit exceeded');
      if (me().cash < cost) return err('Not enough cash');
      // availability in the seller's factory lots
      const sellerLots = structuredClone(other.factoryLots);
      for (const x of picks) {
        for (let i = 0; i < x.count; i++) {
          if (!sellerLots[x.price] || !removeOne(sellerLots[x.price], x.color)) return err('Those containers are not in that lot');
        }
      }
      const bought = picks.flatMap((x) => Array.from({ length: x.count }, () => x.color));
      const lots = validLots(action.lots, CONT_RULES.harborLotPrices, [...lotsFlat(me().harborLots), ...bought]);
      if (!lots) return err('Arrange exactly your harbor containers');
      const spent = spendAction();
      if (spent) return spent;
      me().cash -= cost;
      other.cash += cost;
      other.factoryLots = sellerLots;
      me().harborLots = lots;
      // the camera aims where the goods ARRIVE; the TV trucks them over visibly
      event(state, `${seatName(state, seat)} BUYS ${total} FROM ${seatName(state, action.from)}'S FACTORY FOR $${cost}`, 'action',
        { type: 'board', seat, sub: { kind: 'harborLots' } },
        { from: action.from, to: seat, colors: bought });
      return { ok: true };
    }

    case 'harbor_buy': {
      const loc = me().ship.loc;
      if (loc.kind !== 'harbor') return err('Your ship is not docked at a harbor');
      const other = state.players[loc.seat];
      const picks = action.picks ?? [];
      if (picks.length === 0 || picks.some((x) => !Number.isInteger(x.count) || x.count <= 0)) return err('Pick containers to buy');
      const total = picks.reduce((a, x) => a + x.count, 0);
      const cost = picks.reduce((a, x) => a + x.price * x.count, 0);
      if (me().ship.cargo.length + total > CONT_RULES.shipCapacity) return err('Your ship holds at most 5 containers');
      if (me().cash < cost) return err('Not enough cash');
      const sellerLots = structuredClone(other.harborLots);
      for (const x of picks) {
        for (let i = 0; i < x.count; i++) {
          if (!sellerLots[x.price] || !removeOne(sellerLots[x.price], x.color)) return err('Those containers are not in that lot');
        }
      }
      const free = action.free === true && state.anchorBuy;
      if (!free) {
        const spent = spendAction();
        if (spent) return spent;
      } else {
        state.anchorBuy = false;
      }
      me().cash -= cost;
      other.cash += cost;
      other.harborLots = sellerLots;
      for (const x of picks) for (let i = 0; i < x.count; i++) me().ship.cargo.push(x.color);
      event(state, `${seatName(state, seat)} LOADS ${total} FROM ${seatName(state, loc.seat)}'S HARBOR FOR $${cost}`, 'action', { type: 'board', seat: loc.seat });
      return { ok: true };
    }

    case 'reprice': {
      const isFactory = action.district === 'factory';
      const prices = isFactory ? CONT_RULES.factoryLotPrices : CONT_RULES.harborLotPrices;
      const current = isFactory ? me().factoryLots : me().harborLots;
      const lots = validLots(action.lots, prices, lotsFlat(current));
      if (!lots) return err('Arrange exactly the containers in that district');
      const spent = spendAction();
      if (spent) return spent;
      if (isFactory) me().factoryLots = lots; else me().harborLots = lots;
      event(state, `${seatName(state, seat)} REPRICES THE ${isFactory ? 'FACTORY' : 'HARBOR'} DISTRICT`, 'action', { type: 'board', seat });
      return { ok: true };
    }

    case 'sail': {
      const loc = me().ship.loc;
      const to = action.to;
      if (to === 'ocean') {
        if (loc.kind === 'ocean') return err('Already in the ocean');
        const spent = spendAction();
        if (spent) return spent;
        me().ship.loc = { kind: 'ocean' };
        event(state, `${seatName(state, seat)} SAILS INTO THE OCEAN`, 'action', { type: 'ship', seat });
        return { ok: true };
      }
      if (loc.kind !== 'ocean') return err('Sail to the ocean first');
      if (typeof to === 'object' && 'harbor' in to) {
        const other = state.players[to.harbor];
        if (!other) return err('Unknown harbor');
        if (to.harbor === seat) return err('Your ship can never enter your own harbor');
        const spent = spendAction();
        if (spent) return spent;
        me().ship.loc = { kind: 'harbor', seat: to.harbor };
        state.anchorBuy = true; // free harbor purchase on docking
        event(state, `${seatName(state, seat)} DOCKS AT ${seatName(state, to.harbor)}'S HARBOR`, 'action', { type: 'board', seat: to.harbor });
        return { ok: true };
      }
      if (to === 'bank') {
        const load = action.load ?? [];
        const holding = [...me().holding];
        for (const c of load) if (!removeOne(holding, c)) return err('Those containers are not in your holding area');
        if (me().ship.cargo.length + load.length > CONT_RULES.shipCapacity) return err('Your ship holds at most 5 containers');
        const spent = spendAction();
        if (spent) return spent;
        me().ship.loc = { kind: 'bank' };
        me().holding = holding;
        me().ship.cargo.push(...load);
        event(state, `${seatName(state, seat)} DOCKS AT THE OFF-SHORE BANK${load.length ? ` AND LOADS ${load.length}` : ''}`, 'action', { type: 'bank' });
        return { ok: true };
      }
      if (to === 'island') {
        if (me().ship.cargo.length === 0) return err('No containers to deliver');
        const spent = spendAction();
        if (spent) return spent;
        me().ship.loc = { kind: 'island' };
        startDelivery(state, seat);
        return { ok: true };
      }
      return err('Invalid destination');
    }

    case 'call_bank': {
      if (state.calledBankThisTurn) return err('Call Bank is once per turn');
      if (state.wonAuctionThisTurn) return err('You cannot call the Bank the turn you win an auction');
      if (state.endTriggered) return err('You cannot call the Bank the turn the game ends');
      const lotType = action.lotType;
      if (lotType !== 'cash' && lotType !== 'container') return err('Invalid auction type');
      const existing = state.bank.auctions.find((a) => a.lotType === lotType);
      let auction: ContAuction;
      if (existing) {
        // outbid the current high bidder
        if (existing.bidder === seat) return err('You already hold the high bid');
        auction = existing;
      } else {
        // start a new auction (3-4 players: only one active auction at a time —
        // enforced by the single auction token; 5 players: one per type)
        if (state.bank.tokensFree <= 0) return err('No auction token available');
        if (state.players.length <= 4 && state.bank.auctions.length > 0) return err('Only one Bank auction at a time');
        const lot = Number(action.lot);
        if (![0, 1, 2].includes(lot)) return err('Invalid bank lot');
        if (state.bank.auctions.some((a) => a.lot === lot && a.lotType === lotType)) return err('That lot is under auction');
        auction = { lotType, lot, bidder: -1, bid: 0, bidContainers: [] };
      }
      const prev = existing ? existing.bid : 0;

      if (lotType === 'container') {
        // bid cash for the containers on the lot
        const cash = Math.floor(Number(action.cash));
        if (!Number.isFinite(cash) || cash < 1) return err('Bid at least $1');
        if (cash < prev + 1 && existing) return err(`Bid at least $${prev + 1}`);
        if (me().cash < cash) return err('Not enough cash');
        const spent = spendAction();
        if (spent) return spent;
        if (existing) {
          const old = state.players[existing.bidder];
          old.cash += existing.bid; // outbid: cash returns to their hand
        }
        me().cash -= cash;
        auction.bidder = seat;
        auction.bid = cash;
        auction.bidContainers = [];
        event(state, `${seatName(state, seat)} BIDS $${cash} AT THE BANK`, 'action', { type: 'bank' });
      } else {
        // bid containers from your districts for the cash on the lot
        const bid = action.containers ?? [];
        if (bid.length < 1) return err('Bid at least one container');
        if (existing && bid.length < prev + 1) return err(`Bid at least ${prev + 1} containers`);
        const factoryLots = structuredClone(me().factoryLots);
        const harborLots = structuredClone(me().harborLots);
        for (const b of bid) {
          const lots = b.from === 'factory' ? factoryLots : harborLots;
          if (!lots[b.price] || !removeOne(lots[b.price], b.color)) return err('Those containers are not in your districts');
        }
        const spent = spendAction();
        if (spent) return spent;
        if (existing) {
          // outbid: their containers return to their original lots, reserves clear
          const old = state.players[existing.bidder];
          for (const b of existing.bidContainers) {
            const lots = b.from === 'factory' ? old.factoryLots : old.harborLots;
            lots[b.price].push(b.color);
          }
          old.reserves = { factory: 0, harbor: 0 };
        }
        me().factoryLots = factoryLots;
        me().harborLots = harborLots;
        me().reserves.factory += bid.filter((b) => b.from === 'factory').length;
        me().reserves.harbor += bid.filter((b) => b.from === 'harbor').length;
        auction.bidder = seat;
        auction.bid = bid.length;
        auction.bidContainers = bid.map((b) => ({ from: b.from, price: b.price, color: b.color }));
        event(state, `${seatName(state, seat)} BIDS ${bid.length} CONTAINER${bid.length > 1 ? 'S' : ''} AT THE BANK`, 'action', { type: 'bank' });
      }
      if (!existing) state.bank.auctions.push(auction), state.bank.tokensFree -= 1;
      state.calledBankThisTurn = true;
      return { ok: true };
    }

    default:
      return err('Unknown action');
  }
}

// ---------- bot ----------

const botHash = (state: ContainerState, seat: number): number => {
  let h = (state.seed ^ (state.lastEvent.seq * 2654435761) ^ (seat * 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
};

const dumpLots = (existing: ContLots, add: ContColor[], prices: number[], price: number): ContLots => {
  const lots = contEmptyLots(prices);
  lots[price] = [...lotsFlat(existing), ...add];
  return lots;
};

/** seats that currently owe a move (turn player, delivery bidders, pending deciders) */
export function containerSeatsToAct(state: ContainerState): number[] {
  if (state.phase === 'ended') return [];
  if (state.delivery) {
    const d = state.delivery;
    if (d.stage === 'bidding') return Object.keys(d.bids).map(Number).filter((s) => d.bids[s] === null);
    if (d.stage === 'runoff') return d.runoffAmong.filter((s) => d.runoffBids[s] === null);
    return [d.deliverer];
  }
  if (state.pending.length > 0) {
    const head = state.pending[0];
    return [head.kind === 'seize' ? head.decider : head.seat];
  }
  return [state.turn];
}

/** greedy policy used by the server bots and the engine tests */
export function containerBotAction(state: ContainerState, seat: number): ContAction | null {
  const p = state.players[seat];

  if (state.delivery) {
    const d = state.delivery;
    if (d.stage === 'bidding' && d.bids[seat] === null) {
      const wish = Math.min(p.cash, d.cargo.length * 2 + Math.floor(botHash(state, seat) * 3));
      return { type: 'delivery_bid', amount: Math.max(0, wish) };
    }
    if (d.stage === 'runoff' && d.runoffAmong.includes(seat) && d.runoffBids[seat] === null) {
      const spare = p.cash - (d.bids[seat] ?? 0);
      return { type: 'delivery_bid', amount: Math.max(0, Math.min(spare, Math.floor(botHash(state, seat) * 2))) };
    }
    if (d.stage === 'resolve' && d.deliverer === seat) {
      const totals: Record<number, number> = {};
      for (const [s, b] of Object.entries(d.bids)) totals[Number(s)] = (b ?? 0) + (d.runoffBids[Number(s)] ?? 0);
      const high = Math.max(...Object.values(totals));
      const buyout = p.cash >= high && high <= d.cargo.length; // cheap: keep them
      return { type: 'delivery_resolve', mode: buyout ? 'buyout' : 'accept', winner: d.tied[0] };
    }
    return null;
  }

  if (state.pending.length > 0) {
    const head = state.pending[0];
    if (head.kind === 'bankDistribute' && head.seat === seat) {
      const counts = contDistributeCounts(state, head.containers.length);
      const rest = [...head.containers];
      return { type: 'choose_distribute', perLot: counts.map((c) => rest.splice(0, c)) };
    }
    if (head.kind === 'seize' && head.decider === seat) {
      const victim = structuredClone(state.players[head.seat]);
      const picks: ContColor[] = [];
      for (let i = 0; i < head.count; i++) {
        const loc = seizableLocations(victim).find((l) => l.list.length > 0);
        if (!loc) break;
        const color = loc.list[0];
        if (loc.loc === 'harbor' || loc.loc === 'factory') {
          const lots = loc.loc === 'harbor' ? victim.harborLots : victim.factoryLots;
          for (const price of Object.keys(lots)) if (removeOne(lots[Number(price)], color)) break;
        } else removeOne(loc.list, color);
        picks.push(color);
      }
      return { type: 'choose_seize', picks };
    }
    return null;
  }

  if (state.turn !== seat) return null;

  // liquidity
  if (p.cash < 2 && p.loans < CONT_RULES.loanMax) return { type: 'take_loan' };
  if (p.loans > 0 && p.cash >= CONT_RULES.loanValue + 5) return { type: 'repay_loan' };

  if (state.actionsLeft <= 0) return { type: 'end_turn' };

  // recycle bank cash: bid one container on the richest open cash lot
  if (!state.calledBankThisTurn && !state.wonAuctionThisTurn && !state.endTriggered
    && state.bank.tokensFree > 0
    && !state.bank.auctions.some((a) => a.lotType === 'cash')
    && (state.players.length >= 5 || state.bank.auctions.length === 0)) {
    const richest = [0, 1, 2].sort((a, b) => state.bank.cashLots[b] - state.bank.cashLots[a])[0];
    if (state.bank.cashLots[richest] >= 4) {
      const fromFactory = CONT_RULES.factoryLotPrices.flatMap((price) => p.factoryLots[price].map((color) => ({ from: 'factory' as const, price, color })));
      const fromHarbor = CONT_RULES.harborLotPrices.flatMap((price) => p.harborLots[price].map((color) => ({ from: 'harbor' as const, price, color })));
      const pick = [...fromFactory, ...fromHarbor][0];
      if (pick) return { type: 'call_bank', lotType: 'cash', lot: richest, containers: [pick] };
    }
  }

  // 1. produce whenever legal (drains the supply toward game end)
  if (!state.producedThisTurn && p.cash >= 1) {
    const eligible = p.factories.filter((c) => state.supply.containers[c] > 0);
    const room = contFactoryLimit(p) - contFactoryUsed(p);
    const expected = Math.min(eligible.length, Math.max(0, room));
    if (expected > 0) {
      const make = eligible.slice(0, expected);
      return { type: 'produce', make, lots: dumpLots(p.factoryLots, make, CONT_RULES.factoryLotPrices, 2) };
    }
  }

  // 2. grow early
  if (p.factories.length < 2 && p.cash >= CONT_RULES.factoryCosts[p.factories.length] + 2) {
    const color = CONT_COLORS.filter((c) => !p.factories.includes(c) && state.supply.factories[c] > 0)
      .sort((a, b) => state.supply.containers[b] - state.supply.containers[a])[0];
    if (color) return { type: 'build_factory', color };
  }
  if (p.warehouses < 3 && p.factories.length >= 2 && p.cash >= CONT_RULES.warehouseCosts[p.warehouses] + 2 && state.supply.warehouses > 0) {
    return { type: 'build_warehouse' };
  }

  // 3. ship logistics
  const loc = p.ship.loc;
  if (p.ship.cargo.length >= 2 || (state.endTriggered && p.ship.cargo.length > 0)) {
    if (loc.kind === 'ocean') return { type: 'sail', to: 'island' };
    return { type: 'sail', to: 'ocean' };
  }
  if (loc.kind === 'harbor') {
    const other = state.players[loc.seat];
    let budget = p.cash;
    let room = CONT_RULES.shipCapacity - p.ship.cargo.length;
    const picks: { price: number; color: ContColor; count: number }[] = [];
    for (const price of CONT_RULES.harborLotPrices) {
      for (const color of other.harborLots[price]) {
        if (room <= 0 || budget < price) break;
        budget -= price; room -= 1;
        const hit = picks.find((x) => x.price === price && x.color === color);
        if (hit) hit.count += 1; else picks.push({ price, color, count: 1 });
      }
    }
    if (picks.length > 0) return { type: 'harbor_buy', picks, free: state.anchorBuy };
    return { type: 'sail', to: 'ocean' };
  }
  if (loc.kind === 'bank' || loc.kind === 'island') return { type: 'sail', to: 'ocean' };
  if (loc.kind === 'ocean') {
    const target = state.players
      .filter((q) => q.seat !== seat && contLotCount(q.harborLots) > 0)
      .sort((a, b) => contLotCount(b.harborLots) - contLotCount(a.harborLots))[0];
    if (target && p.cash >= 2) return { type: 'sail', to: { harbor: target.seat } };
  }

  // 4. feed harbors: buy the cheapest opponent factory containers in bulk
  {
    let room = contHarborLimit(p) - contHarborUsed(p);
    if (room > 0) {
      const offers = state.players
        .filter((q) => q.seat !== seat)
        .flatMap((q) => CONT_RULES.factoryLotPrices.flatMap((price) =>
          q.factoryLots[price].map((color) => ({ from: q.seat, price, color }))))
        .filter((x) => x.price <= p.cash)
        .sort((a, b) => a.price - b.price);
      if (offers.length > 0) {
        const from = offers[0].from;
        let budget = p.cash;
        const picks: { price: number; color: ContColor; count: number }[] = [];
        const bought: ContColor[] = [];
        for (const o of offers.filter((x) => x.from === from)) {
          if (room <= 0 || budget < o.price) break;
          budget -= o.price; room -= 1;
          bought.push(o.color);
          const hit = picks.find((x) => x.price === o.price && x.color === o.color);
          if (hit) hit.count += 1; else picks.push({ price: o.price, color: o.color, count: 1 });
        }
        if (picks.length > 0) {
          return {
            type: 'factory_buy', from,
            picks,
            lots: dumpLots(p.harborLots, bought, CONT_RULES.harborLotPrices, 4),
          };
        }
      }
    }
  }

  return { type: 'end_turn' };
}
