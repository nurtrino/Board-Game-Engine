// Container (2026) — state + setup + views, per docs/specs/container.md.
// Rules come from the mod's own rulebook PDF (mod 3745603443 has no global
// Lua); setup counts and the final-scoring algorithm are cross-checked against
// the mod's setup buttons and score-token scripts. Base game only. 3-5 players.

import { mulberry32, shuffle } from '../brass/rng.js';
import data from './data.json';

export type ContainerSeat = 'Brown' | 'Pink' | 'Teal' | 'Purple' | 'Orange';
export const CONTAINER_SEATS: readonly ContainerSeat[] = data.seats as ContainerSeat[];
export const CONTAINER_SEAT_HEX: Record<ContainerSeat, string> = data.seatHex as Record<ContainerSeat, string>;

export type ContColor = 'Blue' | 'White' | 'Yellow' | 'Red' | 'Green';
export const CONT_COLORS: readonly ContColor[] = data.colors as ContColor[];

export type ContGameLength = 'short' | 'standard' | 'extended';

export const CONT_RULES = {
  factoryCosts: data.tracks.factoryCosts, // [0, 6, 9, 12] — cost of your Nth factory
  factoryLotPrices: data.tracks.factoryLotPrices as number[], // [1,2,3,4]
  factoryLimitPer: data.tracks.factoryLimitPer, // 2 per factory
  warehouseCosts: data.tracks.warehouseCosts, // [0, 4, 5, 6, 7]
  harborLotPrices: data.tracks.harborLotPrices as number[], // [2,3,4,5,6]
  harborLimitPer: data.tracks.harborLimitPer, // 1 per warehouse
  shipCapacity: data.shipCapacity, // 5
  loanValue: data.loans.value, // 10
  loanInterest: data.loans.interest, // 1
  loanMax: data.loans.max, // 2
  loanEndPenalty: data.loans.endPenalty, // 11
  startingCash: data.startingCash, // 20
  startingContainerLot: data.startingContainerLot, // the $2 factory lot
  actionsPerTurn: data.actions.perTurn, // 2
  twoValueHigh: data.twoValueHigh, // 10
  twoValueLow: data.twoValueLow, // 5
  leftoverValues: data.leftoverValues as { ship: number; holding: number; harbor: number; factory: number },
  endColorsOut: data.endColorsOut, // supply out of 2 colors ends the game
} as const;

export interface ContScoringCardDef {
  twoValue: ContColor;
  values: Partial<Record<ContColor, number>>;
}
export const CONT_SCORING_CARDS: Record<ContColor, ContScoringCardDef> =
  data.scoringCards as Record<ContColor, ContScoringCardDef>;

export const CONT_SUPPLY_BY_PLAYERS = data.supplyByPlayers as Record<string, {
  auctionTokens: number; warehouses: number; factoriesPerColor: number;
  containersPerColor: Record<ContGameLength, number>;
}>;

// ---------- state ----------

export type ContShipLoc =
  | { kind: 'ocean' }
  | { kind: 'harbor'; seat: number }
  | { kind: 'island' }
  | { kind: 'bank' };

/** price -> containers in that lot */
export type ContLots = Record<number, ContColor[]>;

export interface ContBidContainer {
  from: 'factory' | 'harbor';
  price: number; // source lot (containers return here if outbid)
  color: ContColor;
}

export interface ContAuction {
  /** which bank lot type is being auctioned (what the winner receives) */
  lotType: 'cash' | 'container';
  lot: number; // 0..2 — the bank lot the auction token sits on
  bidder: number; // seat holding the bid tile
  /** cash amount (container-lot auction) or container count (cash-lot auction) */
  bid: number;
  bidContainers: ContBidContainer[]; // container bids only
}

export interface ContDelivery {
  deliverer: number;
  cargo: ContColor[];
  stage: 'bidding' | 'runoff' | 'resolve';
  /** seat -> secret bid; null until submitted. Runoff adds go to runoffBids. */
  bids: Record<number, number | null>;
  runoffAmong: number[];
  runoffBids: Record<number, number | null>;
  /** highest bidders after reveal (post-runoff ties resolved by deliverer) */
  tied: number[];
}

export type ContFocus =
  | { type: 'board'; seat: number }
  | { type: 'ship'; seat: number }
  | { type: 'island' }
  | { type: 'bank' };

export type ContPending =
  | { kind: 'bankDistribute'; seat: number; containers: ContColor[]; skipLot: number | null }
  | { kind: 'seize'; seat: number; decider: number; count: number };

export interface ContPlayer {
  seat: number;
  color: ContainerSeat;
  name: string;
  isCpu: boolean;
  cash: number; // secret
  loans: number;
  factories: ContColor[]; // distinct colors, up to 4
  warehouses: number; // 1..5
  factoryLots: ContLots; // prices 1..4
  harborLots: ContLots; // prices 2..6
  reserves: { factory: number; harbor: number }; // containers locked on the bid tile
  ship: { loc: ContShipLoc; cargo: ContColor[] };
  holding: ContColor[]; // Off-Shore Bank holding area
  scoring: ContColor[]; // Container Island scoring area
  scoringCard: ContColor; // secret until game end
  finalScore: {
    cash: number; island: number; leftovers: number; loans: number; total: number;
    discarded: ContColor | null; allFive: boolean;
  } | null;
}

export interface ContainerState {
  game: 'container';
  seed: number;
  length: ContGameLength;
  phase: 'playing' | 'ended';
  players: ContPlayer[];
  supply: {
    containers: Record<ContColor, number>;
    factories: Record<ContColor, number>;
    warehouses: number;
  };
  bank: {
    cashLots: number[]; // 3 amounts
    containerLots: ContColor[][]; // 3 lists
    auctions: ContAuction[];
    tokensFree: number;
  };
  turn: number; // seat index
  actionsLeft: number;
  producedThisTurn: boolean;
  calledBankThisTurn: boolean;
  wonAuctionThisTurn: boolean;
  /** free harbor purchase available (set on docking, cleared by any action) */
  anchorBuy: boolean;
  delivery: ContDelivery | null;
  pending: ContPending[];
  endTriggered: boolean;
  winners: number[];
  rolls: number;
  lastEvent: {
    seq: number; text: string; kind?: string;
    /** semantic focus for the TV camera fly-to (client maps to world coords) */
    focus?: ContFocus | null;
  };
}

export const contRng = (state: ContainerState): (() => number) => {
  const r = mulberry32((state.seed ^ (state.rolls * 0x9e3779b9)) >>> 0);
  state.rolls++;
  return r;
};

export const contEmptyLots = (prices: number[]): ContLots =>
  Object.fromEntries(prices.map((p) => [p, []]));

export const contFactoryLimit = (p: ContPlayer): number => p.factories.length * CONT_RULES.factoryLimitPer;
export const contHarborLimit = (p: ContPlayer): number => p.warehouses * CONT_RULES.harborLimitPer;
export const contLotCount = (lots: ContLots): number => Object.values(lots).reduce((a, l) => a + l.length, 0);
export const contFactoryUsed = (p: ContPlayer): number => contLotCount(p.factoryLots) + p.reserves.factory;
export const contHarborUsed = (p: ContPlayer): number => contLotCount(p.harborLots) + p.reserves.harbor;

export interface ContCreateOptions {
  length?: ContGameLength;
}

export function createContainer(
  seated: { name: string; color: ContainerSeat; isCpu?: boolean }[],
  seed: number,
  options?: ContCreateOptions,
): ContainerState {
  const n = seated.length;
  if (n < 3 || n > 5) throw new Error('Container seats 3 to 5 players');
  const length: ContGameLength = options?.length ?? 'standard';
  const supplyDef = CONT_SUPPLY_BY_PLAYERS[String(n)];

  const state: ContainerState = {
    game: 'container',
    seed,
    length,
    phase: 'playing',
    players: [],
    supply: {
      containers: Object.fromEntries(CONT_COLORS.map((c) => [c, supplyDef.containersPerColor[length]])) as Record<ContColor, number>,
      factories: Object.fromEntries(CONT_COLORS.map((c) => [c, supplyDef.factoriesPerColor])) as Record<ContColor, number>,
      warehouses: supplyDef.warehouses,
    },
    bank: {
      cashLots: [...data.bankSetup.cash],
      containerLots: [[], [], []],
      auctions: [],
      tokensFree: supplyDef.auctionTokens,
    },
    turn: 0,
    actionsLeft: CONT_RULES.actionsPerTurn,
    producedThisTurn: false,
    calledBankThisTurn: false,
    wonAuctionThisTurn: false,
    anchorBuy: false,
    delivery: null,
    pending: [],
    endTriggered: false,
    winners: [],
    rolls: 0,
    lastEvent: { seq: 0, text: 'GAME BEGINS', kind: 'turn', focus: null },
  };

  const rng = contRng(state);

  // bank containers: 1 of each color, shuffled; 2 to lot I, 1 to lot II
  const bankDeal = shuffle(CONT_COLORS, rng);
  state.bank.containerLots[0] = [bankDeal[0], bankDeal[1]];
  state.bank.containerLots[1] = [bankDeal[2]];
  for (const c of [bankDeal[0], bankDeal[1], bankDeal[2]]) state.supply.containers[c]--;

  // starting factories: 1 of each of 5 colors dealt randomly, leftovers stay
  const factoryDeal = shuffle(CONT_COLORS, rng);
  // secret scoring cards: shuffle the 5 cards, deal 1 each
  const cardDeal = shuffle(CONT_COLORS, rng);

  state.players = seated.map((s, seat) => {
    const startFactory = factoryDeal[seat];
    state.supply.factories[startFactory]--;
    state.supply.warehouses--;
    state.supply.containers[startFactory]--;
    const factoryLots = contEmptyLots(CONT_RULES.factoryLotPrices);
    factoryLots[CONT_RULES.startingContainerLot] = [startFactory];
    return {
      seat,
      color: s.color,
      name: s.name,
      isCpu: s.isCpu ?? false,
      cash: CONT_RULES.startingCash,
      loans: 0,
      factories: [startFactory],
      warehouses: 1,
      factoryLots,
      harborLots: contEmptyLots(CONT_RULES.harborLotPrices),
      reserves: { factory: 0, harbor: 0 },
      ship: { loc: { kind: 'ocean' }, cargo: [] },
      holding: [],
      scoring: [],
      scoringCard: cardDeal[seat],
      finalScore: null,
    };
  });

  state.turn = Math.floor(rng() * n);
  state.lastEvent = {
    seq: 1,
    text: `${state.players[state.turn].name.toUpperCase()} GOES FIRST`,
    kind: 'turn',
    focus: null,
  };
  return state;
}

// ---------- view ----------

export interface ContPlayerView extends Omit<ContPlayer, 'cash' | 'scoringCard'> {
  cash: number | null; // hidden for others / TV until game end
  scoringCard: ContColor | null;
}

export interface ContainerView extends Omit<ContainerState, 'players' | 'delivery' | 'seed'> {
  you: number | null;
  players: ContPlayerView[];
  delivery: (Omit<ContDelivery, 'bids' | 'runoffBids'> & {
    /** seat -> true once submitted; amounts hidden until reveal */
    bidsIn: Record<number, boolean>;
    bids: Record<number, number | null> | null; // revealed at resolve stage / to nobody before
    yourBid: number | null;
  }) | null;
}

export function containerViewFor(state: ContainerState, viewer: number | null | 'dev'): ContainerView {
  const you = viewer === 'dev' ? 0 : viewer;
  const ended = state.phase === 'ended';
  const { seed: _seed, delivery, players, ...rest } = state;
  return {
    ...rest,
    you,
    players: players.map((p) => ({
      ...p,
      cash: ended || p.seat === you ? p.cash : null,
      scoringCard: ended || p.seat === you ? p.scoringCard : null,
    })),
    delivery: delivery
      ? {
          deliverer: delivery.deliverer,
          cargo: delivery.cargo,
          stage: delivery.stage,
          runoffAmong: delivery.runoffAmong,
          tied: delivery.tied,
          // who still owes a bid in the CURRENT stage (runoff tracks its own)
          bidsIn: delivery.stage === 'runoff'
            ? Object.fromEntries(delivery.runoffAmong.map((s) => [s, delivery.runoffBids[s] !== null]))
            : Object.fromEntries(Object.entries(delivery.bids).map(([s, b]) => [s, b !== null])),
          bids: delivery.stage === 'resolve'
            ? Object.fromEntries(Object.entries(delivery.bids).map(([s, b]) => [s, (b ?? 0) + (delivery.runoffBids[Number(s)] ?? 0)]))
            : null,
          yourBid: you !== null && delivery.bids[you] !== undefined ? delivery.bids[you] : null,
        }
      : null,
  };
}
