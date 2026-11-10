// Brass: Birmingham action engine, v2. Server-authoritative: applyAction
// mutates the state or rejects with a reason. The same legality/cost helpers
// are imported by the client so the UI only ever offers legal choices.
//
// v2 resource system (the part v1 stubbed):
// - Mines/works/breweries carry cubes (counts read off the tile art:
//   coal 2/3/4/5, iron 4/4/5/6 by level, brewery 1 in canal / 2 in rail).
// - Coal consumption: connected mines first (any owner, via the built link
//   network), else the coal market — which requires the build location to be
//   connected to an external market. Iron: any works anywhere, else the
//   market, no connection needed (the rules' asymmetry).
// - A mine/works flips when its last cube is taken; its owner advances income.
// - Building a coal mine connected to a market immediately sells cubes into
//   the empty market slots (cheapest first), paying the builder. Iron works
//   always sell into the market on build.
// - Beer for selling: the merchant's barrel or any of your own breweries;
//   a brewery flips (and pays income) when its last barrel is drunk.
//
// Still simplified (documented): location squares don't restrict industry
// type (slot icons are art-only in the mod data); develop removes one tile
// per action; opponents' connected breweries can't be tapped when selling.

import data from './setup-data.json';
import squareData from './square-industries.json';
import {
  incomeAt,
  type BrassState, type BrassPlayer, type BuiltIndustry, type Card, type Color, type Merchant,
} from './state.js';

/** Allowed industries per square (read from the board's printed slot icons). */
export const SQUARE_INDUSTRIES: Record<string, string[]> = squareData.squares;
export function squareAllows(square: string, industry: string): boolean {
  const allowed = SQUARE_INDUSTRIES[square];
  return !allowed || allowed.includes(industry);
}

// ---------------------------------------------------------------------------
// Static board graph, from the golden
// ---------------------------------------------------------------------------

export const LOCATIONS: Record<string, string[]> = data.locations;
export const LINKS: Record<string, { canal: boolean; rail: boolean }> = data.links;
export const EXTERNAL: Record<string, number> = data.externalBonuses;
export const TILES: Record<string, {
  type: string; level: number; count: number; canal_era: boolean; rail_era: boolean;
  cost_money: number; cost_coal: number; cost_iron: number; beers_to_sell: number | null;
  points: number; income: number; link_points: number; can_develop: boolean;
}> = data.industryTiles as never;

export const INDUSTRY_TYPES = ['Coal Mine', 'Iron Works', 'Brewery', 'Cotton Mill', 'Manufacturer', 'Pottery'];

/** Cubes printed on the tiles (read from the mat art, level-indexed). */
export const COAL_CUBES: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5 };
export const IRON_CUBES: Record<number, number> = { 1: 4, 2: 4, 3: 5, 4: 6 };
export const BREWERY_BEER = { canal: 1, rail: 2 } as const;

export function startingCubes(tile: string, era: 'canal' | 'rail'): number {
  const t = TILES[tile];
  if (t.type === 'Coal Mine') return COAL_CUBES[t.level] ?? 0;
  if (t.type === 'Iron Works') return IRON_CUBES[t.level] ?? 0;
  if (t.type === 'Brewery') return BREWERY_BEER[era];
  return 0;
}

/** location name -> its square names */
export const SQUARES_OF = LOCATIONS;
/** square name -> location name */
export const LOCATION_OF: Record<string, string> = {};
for (const [loc, sqs] of Object.entries(LOCATIONS)) for (const sq of sqs) LOCATION_OF[sq] = loc;

/** link name -> the locations it touches (internal + external) */
export const LINK_ENDS: Record<string, string[]> = {};
for (const linkName of Object.keys(LINKS)) {
  LINK_ENDS[linkName] = linkName.split(' - ').filter((n) => LOCATIONS[n] || EXTERNAL[n] !== undefined);
}
/** location name -> link names touching it */
export const LINKS_AT: Record<string, string[]> = {};
for (const [link, ends] of Object.entries(LINK_ENDS)) {
  for (const end of ends) (LINKS_AT[end] ??= []).push(link);
}

// ---------------------------------------------------------------------------
// Markets: slot i price = floor(i/2)+1. Buy cheapest cube; sell fills the
// cheapest empty slot.
// ---------------------------------------------------------------------------

const EXHAUST_PRICE = { coal: 8, iron: 6 } as const;

export function marketBuyPrice(fill: number[], kind: 'coal' | 'iron', n: number): number {
  let total = 0;
  const f = [...fill];
  for (let k = 0; k < n; k++) {
    const i = f.findIndex((v) => v === 1);
    if (i < 0) total += EXHAUST_PRICE[kind];
    else { total += Math.floor(i / 2) + 1; f[i] = 0; }
  }
  return total;
}

function marketTake(fill: number[], kind: 'coal' | 'iron', n: number): number {
  let total = 0;
  for (let k = 0; k < n; k++) {
    const i = fill.findIndex((v) => v === 1);
    if (i < 0) total += EXHAUST_PRICE[kind];
    else { total += Math.floor(i / 2) + 1; fill[i] = 0; }
  }
  return total;
}

/** Sell one cube into the cheapest empty slot; returns £ gained (0 if full). */
function marketSellOne(fill: number[]): number {
  const i = fill.findIndex((v) => v === 0);
  if (i < 0) return 0;
  fill[i] = 1;
  return Math.floor(i / 2) + 1;
}

// ---------------------------------------------------------------------------
// Graph + resource helpers (shared with the client UI)
// ---------------------------------------------------------------------------

export interface PublicBoard {
  industries: Record<string, BuiltIndustry>;
  links: Record<string, Color>;
}

/** Locations reachable from `fromLoc` over built links (any owner). */
export function reachable(board: PublicBoard, fromLoc: string): Set<string> {
  const seen = new Set<string>([fromLoc]);
  const queue = [fromLoc];
  while (queue.length) {
    const loc = queue.shift()!;
    for (const link of LINKS_AT[loc] ?? []) {
      if (!board.links[link]) continue;
      for (const end of LINK_ENDS[link]) if (!seen.has(end)) { seen.add(end); queue.push(end); }
    }
  }
  return seen;
}

/** The locations forming a player's network: own tiles + own link endpoints. */
export function networkOf(board: PublicBoard, color: Color): Set<string> {
  const net = new Set<string>();
  for (const [sq, b] of Object.entries(board.industries)) if (b.color === color) net.add(LOCATION_OF[sq]);
  for (const [link, c] of Object.entries(board.links)) if (c === color) for (const end of LINK_ENDS[link]) net.add(end);
  return net;
}

export function hasNetwork(board: PublicBoard, color: Color): boolean {
  return networkOf(board, color).size > 0;
}

/** Squares (with unflipped coal mines holding cubes) connected to fromLoc. */
export function connectedCoalSquares(board: PublicBoard, fromLoc: string): string[] {
  const reach = reachable(board, fromLoc);
  return Object.entries(board.industries)
    .filter(([sq, b]) => TILES[b.tile].type === 'Coal Mine' && !b.flipped && b.cubes > 0 && reach.has(LOCATION_OF[sq]))
    .map(([sq]) => sq);
}

/** Any iron works squares with cubes (no connection required). */
export function ironSquares(board: PublicBoard): string[] {
  return Object.entries(board.industries)
    .filter(([, b]) => TILES[b.tile].type === 'Iron Works' && !b.flipped && b.cubes > 0)
    .map(([sq]) => sq);
}

/** Is this location connected to an external market with an active merchant? */
export function marketConnected(board: PublicBoard, merchants: Merchant[], fromLoc: string): boolean {
  const reach = reachable(board, fromLoc);
  return merchants.some((m) => reach.has(m.location));
}

/** The lowest buildable tile of an industry type for this player, era-legal. */
export function lowestTile(tiles: Record<string, number>, type: string, era: 'canal' | 'rail'): string | null {
  let best: string | null = null;
  let bestLevel = Infinity;
  for (const [name, n] of Object.entries(tiles)) {
    if (n <= 0) continue;
    const t = TILES[name];
    if (t.type !== type) continue;
    if (t.level < bestLevel) { best = name; bestLevel = t.level; }
  }
  if (!best) return null;
  const t = TILES[best];
  if (era === 'canal' && !t.canal_era) return null;
  if (era === 'rail' && !t.rail_era) return null;
  return best;
}

/** Which industry types a card can build. */
export function cardIndustries(card: Card): string[] {
  if (card.kind === 'wild') return card.name === 'Wild Industry' ? INDUSTRY_TYPES : INDUSTRY_TYPES;
  if (card.kind === 'location') return INDUSTRY_TYPES;
  if (card.name === 'Cotton Mill / Manufacturer') return ['Cotton Mill', 'Manufacturer'];
  return [card.name];
}

/** Locations where `card` lets `color` build. */
export function buildLocations(board: PublicBoard, color: Color, card: Card): string[] {
  if (card.kind === 'location') return LOCATIONS[card.name] ? [card.name] : [];
  if (card.kind === 'wild' && card.name === 'Wild Location') return Object.keys(LOCATIONS);
  // industry / wild industry: within your network, or anywhere if you have none
  if (!hasNetwork(board, color)) return Object.keys(LOCATIONS);
  const net = networkOf(board, color);
  return Object.keys(LOCATIONS).filter((l) => net.has(l));
}

/** Free squares in a location, honoring canal-era one-tile-per-location. */
export function freeSquares(board: PublicBoard, color: Color, location: string, era: 'canal' | 'rail'): string[] {
  const squares = LOCATIONS[location] ?? [];
  if (era === 'canal') {
    const already = squares.some((sq) => board.industries[sq]?.color === color);
    if (already) return [];
  }
  return squares.filter((sq) => !board.industries[sq]);
}

/**
 * Full cost + resource plan for building `industry` at `square`, or an error.
 * Pure (no mutation) — the client uses it to grey out impossible choices and
 * quote prices; apply() re-runs it and then commits.
 */
export interface BuildPlan {
  tile: string;
  money: number; // tile cost
  coalFromMines: string[]; // squares to take coal cubes from
  coalFromMarket: number;
  coalMarketCost: number;
  ironFromWorks: string[];
  ironFromMarket: number;
  ironMarketCost: number;
  total: number;
}

export function planBuild(
  board: PublicBoard, markets: { coal: number[]; iron: number[] }, merchants: Merchant[],
  tiles: Record<string, number>, era: 'canal' | 'rail', industry: string, square: string,
): BuildPlan | { error: string } {
  if (!squareAllows(square, industry)) {
    return { error: `${square} only allows ${SQUARE_INDUSTRIES[square]?.join(' or ')}` };
  }
  const tileName = lowestTile(tiles, industry, era);
  if (!tileName) return { error: `No buildable ${industry} this era` };
  const t = TILES[tileName];
  const loc = LOCATION_OF[square];

  const coalFromMines: string[] = [];
  let coalFromMarket = 0;
  if (t.cost_coal > 0) {
    // connected mines first — count multi-cube mines properly
    const budget = new Map<string, number>();
    for (const sq of connectedCoalSquares(board, loc)) budget.set(sq, board.industries[sq].cubes);
    let need = t.cost_coal;
    for (const [sq, cubes] of budget) {
      while (need > 0 && (budget.get(sq) ?? 0) > 0) {
        coalFromMines.push(sq);
        budget.set(sq, cubes - coalFromMines.filter((s) => s === sq).length);
        need--;
      }
      if (need === 0) break;
    }
    if (need > 0) {
      if (!marketConnected(board, merchants, loc)) {
        return { error: 'Needs coal — no connected mine or market' };
      }
      coalFromMarket = need;
    }
  }

  const ironFromWorks: string[] = [];
  let ironFromMarket = 0;
  if (t.cost_iron > 0) {
    const budget = new Map<string, number>();
    for (const sq of ironSquares(board)) budget.set(sq, board.industries[sq].cubes);
    let need = t.cost_iron;
    for (const [sq, cubes] of budget) {
      while (need > 0 && (budget.get(sq) ?? 0) > 0) {
        ironFromWorks.push(sq);
        budget.set(sq, cubes - ironFromWorks.filter((s) => s === sq).length);
        need--;
      }
      if (need === 0) break;
    }
    ironFromMarket = need; // iron may always be bought
  }

  const coalMarketCost = coalFromMarket ? marketBuyPrice(markets.coal, 'coal', coalFromMarket) : 0;
  const ironMarketCost = ironFromMarket ? marketBuyPrice(markets.iron, 'iron', ironFromMarket) : 0;
  return {
    tile: tileName,
    money: t.cost_money,
    coalFromMines, coalFromMarket, coalMarketCost,
    ironFromWorks, ironFromMarket, ironMarketCost,
    total: t.cost_money + coalMarketCost + ironMarketCost,
  };
}

/** Own unflipped industries that could sell, with a connected buying merchant. */
export function sellableSquares(board: PublicBoard, merchants: Merchant[], color: Color): string[] {
  const out: string[] = [];
  for (const [sq, b] of Object.entries(board.industries)) {
    if (b.color !== color || b.flipped) continue;
    const t = TILES[b.tile];
    if (!['Cotton Mill', 'Manufacturer', 'Pottery'].includes(t.type)) continue;
    if (connectedMerchant(board, merchants, LOCATION_OF[sq], t.type) !== null) out.push(sq);
  }
  return out;
}

const BUYS: Record<string, string> = {
  'Buys Cotton': 'Cotton Mill',
  'Buys Goods': 'Manufacturer',
  'Buys Pottery': 'Pottery',
};

/** BFS over built links from a location to a merchant buying `type`. */
export function connectedMerchant(board: PublicBoard, merchants: Merchant[], fromLoc: string, type: string): number | null {
  const reach = reachable(board, fromLoc);
  for (let i = 0; i < merchants.length; i++) {
    const m = merchants[i];
    if (!reach.has(m.location)) continue;
    if (m.tile === 'Buys All' || BUYS[m.tile] === type) return i;
  }
  return null;
}

/** Beer available to `color` for a sale: merchant barrel + own breweries. */
export function beerAvailable(board: PublicBoard, merchants: Merchant[], color: Color, merchantIdx: number): number {
  let n = merchants[merchantIdx]?.beer ? 1 : 0;
  for (const b of Object.values(board.industries)) {
    if (b.color === color && !b.flipped && TILES[b.tile].type === 'Brewery') n += b.cubes;
  }
  return n;
}

/** Links a player may build now. */
export function buildableLinks(board: PublicBoard, color: Color, era: 'canal' | 'rail'): string[] {
  const none = !hasNetwork(board, color);
  const net = networkOf(board, color);
  return Object.keys(LINKS).filter((link) => {
    if (board.links[link]) return false;
    if (era === 'canal' && !LINKS[link].canal) return false;
    if (era === 'rail' && !LINKS[link].rail) return false;
    return none || LINK_ENDS[link].some((end) => net.has(end));
  });
}

/** Squares whose own tile the player may develop-remove... (mat tiles, lowest of each type). */
export function developableTiles(tiles: Record<string, number>): string[] {
  const out: string[] = [];
  for (const type of INDUSTRY_TYPES) {
    let best: string | null = null;
    let bestLevel = Infinity;
    for (const [name, n] of Object.entries(tiles)) {
      if (n <= 0 || TILES[name].type !== type) continue;
      if (TILES[name].level < bestLevel) { best = name; bestLevel = TILES[name].level; }
    }
    if (best && TILES[best].can_develop) out.push(best);
  }
  return out;
}

/** Income track offset for an income level (the mod's track_offset_by_income). */
export function offsetForIncome(income: number): number {
  if (income <= 0) return income + 10;
  if (income <= 10) return (income - 1) * 2 + 12;
  if (income <= 20) return (income - 11) * 3 + 33;
  return (income - 21) * 4 + 64;
}

export const LOAN_INCOME_DROP = 3;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type BrassAction =
  | { type: 'build'; card: number; industry: string; square: string }
  | { type: 'network'; card: number; link: string }
  | { type: 'develop'; card: number; tile: string }
  | { type: 'sell'; card: number; square: string }
  | { type: 'loan'; card: number }
  | { type: 'scout'; cards: number[] }
  | { type: 'pass'; card: number };

export interface ApplyResult { ok: boolean; error?: string; }

let eventSeq = 1;

export function applyAction(state: BrassState, seat: number, action: BrassAction): ApplyResult {
  if (state.phase !== 'playing') return { ok: false, error: 'The game is over' };
  const player = state.players[seat];
  if (!player) return { ok: false, error: 'No such seat' };
  if (state.turnOrder[state.current] !== player.color) return { ok: false, error: 'Not your turn' };

  const fail = (error: string): ApplyResult => ({ ok: false, error });
  const notes: string[] = [];
  const incomeBefore = incomeAt(player.incomeOffset);
  const event = (
    title: string,
    detail: string,
    at?: { square?: string; link?: string; tile?: string; location?: string; cost?: string },
  ) => {
    const delta = incomeAt(player.incomeOffset) - incomeBefore;
    state.lastEvent = {
      seq: eventSeq++, color: player.color, player: player.name, title,
      detail: [detail, ...notes].filter(Boolean).join(' · '),
      kind: action.type,
      incomeDelta: delta || undefined,
      ...at,
    };
    state.log.push(`${player.name}: ${title} — ${state.lastEvent.detail}`);
  };

  const spend = (amount: number): void => {
    player.money -= amount;
    player.spent += amount;
  };

  /** flip a resource tile when depleted; its owner advances income */
  const maybeFlip = (sq: string) => {
    const b = state.board.industries[sq];
    if (!b || b.flipped || b.cubes > 0) return;
    b.flipped = true;
    const owner = state.players.find((p) => p.color === b.color)!;
    owner.incomeOffset = Math.min(99, owner.incomeOffset + TILES[b.tile].income);
    notes.push(`${b.color}'s ${b.tile} exhausted — their income +${TILES[b.tile].income}`);
    refreshBeerTotals(state);
  };

  const takeCard = (idx: number): Card | null => (idx >= 0 && idx < player.hand.length ? player.hand[idx] : null);
  const discard = (...idxs: number[]) => {
    const set = new Set(idxs);
    for (const i of idxs) player.discards.push(player.hand[i]);
    player.hand = player.hand.filter((_, i) => !set.has(i));
  };

  switch (action.type) {
    case 'build': {
      const card = takeCard(action.card);
      if (!card) return fail('Pick a card to play');
      const location = LOCATION_OF[action.square];
      if (!location) return fail('Unknown location');
      if (!buildLocations(state.board, player.color, card).includes(location)) {
        return fail(`That card can't build in ${location}`);
      }
      const inds = cardIndustries(card);
      if (!inds.includes(action.industry)) return fail(`That card can't build a ${action.industry}`);
      if (!freeSquares(state.board, player.color, location, state.era).includes(action.square)) {
        return fail('That spot is not available');
      }
      const plan = planBuild(state.board, state.markets, state.merchants, player.tiles, state.era, action.industry, action.square);
      if ('error' in plan) return fail(plan.error);
      if (player.money < plan.total) return fail(`Costs £${plan.total} — you have £${player.money}`);
      // commit: consume coal/iron cubes from tiles
      for (const sq of plan.coalFromMines) { state.board.industries[sq].cubes--; maybeFlip(sq); }
      for (const sq of plan.ironFromWorks) { state.board.industries[sq].cubes--; maybeFlip(sq); }
      if (plan.coalFromMarket) marketTake(state.markets.coal, 'coal', plan.coalFromMarket);
      if (plan.ironFromMarket) marketTake(state.markets.iron, 'iron', plan.ironFromMarket);
      spend(plan.total);
      player.tiles[plan.tile]--;
      const built: BuiltIndustry = {
        color: player.color, tile: plan.tile, flipped: false,
        cubes: startingCubes(plan.tile, state.era),
      };
      state.board.industries[action.square] = built;
      // auto-sell into the market: coal needs a market connection, iron doesn't
      const t = TILES[plan.tile];
      if (t.type === 'Coal Mine' && marketConnected(state.board, state.merchants, location)) {
        let gained = 0;
        while (built.cubes > 0) {
          const g = marketSellOne(state.markets.coal);
          if (g === 0) break;
          built.cubes--; gained += g;
        }
        if (gained > 0) { player.money += gained; notes.push(`coal to market +£${gained}`); }
        maybeFlip(action.square);
      }
      if (t.type === 'Iron Works') {
        let gained = 0;
        while (built.cubes > 0) {
          const g = marketSellOne(state.markets.iron);
          if (g === 0) break;
          built.cubes--; gained += g;
        }
        if (gained > 0) { player.money += gained; notes.push(`iron to market +£${gained}`); }
        maybeFlip(action.square);
      }
      refreshBeerTotals(state);
      discard(action.card);
      const res = [
        plan.coalFromMines.length ? `${plan.coalFromMines.length} coal from mines` : '',
        plan.coalFromMarket ? `${plan.coalFromMarket} coal £${plan.coalMarketCost}` : '',
        plan.ironFromWorks.length ? `${plan.ironFromWorks.length} iron from works` : '',
        plan.ironFromMarket ? `${plan.ironFromMarket} iron £${plan.ironMarketCost}` : '',
      ].filter(Boolean).join(', ');
      const coalN = plan.coalFromMines.length + plan.coalFromMarket;
      const ironN = plan.ironFromWorks.length + plan.ironFromMarket;
      const cost = [`£${plan.total}`, coalN ? `${coalN} coal` : '', ironN ? `${ironN} iron` : '']
        .filter(Boolean).join(' · ');
      event(`Built ${plan.tile}`, `${location} · £${plan.total}${res ? ` (${res})` : ''}`,
        { square: action.square, tile: plan.tile, location, cost });
      break;
    }

    case 'network': {
      const card = takeCard(action.card);
      if (!card) return fail('Pick a card to play');
      if (player.links <= 0) return fail('No link tiles left');
      if (!buildableLinks(state.board, player.color, state.era).includes(action.link)) {
        return fail('That connection is not available');
      }
      let cost = state.era === 'canal' ? 3 : 5;
      if (state.era === 'rail') {
        // a railway consumes 1 coal, sourced like a build at the link's end
        const end = LINK_ENDS[action.link].find((e) => LOCATIONS[e]) ?? LINK_ENDS[action.link][0];
        const mines = connectedCoalSquares(state.board, end);
        if (mines.length) {
          if (player.money < cost) return fail(`Costs £${cost} — you have £${player.money}`);
          state.board.industries[mines[0]].cubes--; maybeFlip(mines[0]);
          notes.push('coal from a mine');
        } else {
          if (!marketConnected(state.board, state.merchants, end)) return fail('Needs coal — no connected mine or market');
          const coalCost = marketBuyPrice(state.markets.coal, 'coal', 1);
          cost += coalCost;
          if (player.money < cost) return fail(`Costs £${cost} — you have £${player.money}`);
          marketTake(state.markets.coal, 'coal', 1);
        }
      } else if (player.money < cost) {
        return fail(`Costs £${cost} — you have £${player.money}`);
      }
      spend(cost);
      player.links--;
      state.board.links[action.link] = player.color;
      discard(action.card);
      const linkName = action.link.replace(/ - /g, ' to ');
      event(
        state.era === 'canal' ? 'Built a canal' : 'Built a railway',
        `${linkName} · £${cost}`,
        { link: action.link, location: linkName, cost: `£${cost}` },
      );
      break;
    }

    case 'develop': {
      const card = takeCard(action.card);
      if (!card) return fail('Pick a card to play');
      if (!developableTiles(player.tiles).includes(action.tile)) return fail('That tile can’t be developed');
      // develop consumes 1 iron: works first, else market
      const works = ironSquares(state.board);
      let ironNote = 'iron from works';
      let cost = 0;
      if (!works.length) {
        cost = marketBuyPrice(state.markets.iron, 'iron', 1);
        if (player.money < cost) return fail(`Needs 1 iron (£${cost})`);
        marketTake(state.markets.iron, 'iron', 1);
        ironNote = `1 iron £${cost}`;
      } else {
        state.board.industries[works[0]].cubes--; maybeFlip(works[0]);
      }
      if (cost) spend(cost);
      player.tiles[action.tile]--;
      discard(action.card);
      event(`Developed past ${action.tile}`, `Removed from their board · ${ironNote}`);
      break;
    }

    case 'sell': {
      const card = takeCard(action.card);
      if (!card) return fail('Pick a card to play');
      const built = state.board.industries[action.square];
      if (!built || built.color !== player.color || built.flipped) return fail('Nothing of yours to sell there');
      const t = TILES[built.tile];
      const mi = connectedMerchant(state.board, state.merchants, LOCATION_OF[action.square], t.type);
      if (mi === null) return fail('No connected merchant buys that');
      const beersNeeded = t.beers_to_sell ?? 1;
      if (beerAvailable(state.board, state.merchants, player.color, mi) < beersNeeded) {
        return fail(`Needs ${beersNeeded} beer`);
      }
      // consume: merchant barrel first, then own breweries
      let need = beersNeeded;
      const merchant = state.merchants[mi];
      let usedMerchant = false;
      if (merchant.beer && need > 0) { merchant.beer = false; need--; usedMerchant = true; }
      for (const [sq, b] of Object.entries(state.board.industries)) {
        if (need <= 0) break;
        if (b.color !== player.color || b.flipped || TILES[b.tile].type !== 'Brewery') continue;
        while (need > 0 && b.cubes > 0) { b.cubes--; need--; }
        maybeFlip(sq);
      }
      built.flipped = true;
      player.incomeOffset = Math.min(99, player.incomeOffset + t.income);
      refreshBeerTotals(state);
      discard(action.card);
      const beerTxt = beersNeeded === 0 ? 'no beer needed'
        : `${beersNeeded} beer${usedMerchant ? ' incl. the merchant’s' : ''}`;
      event(`Sold ${built.tile}`, `${LOCATION_OF[action.square]} → ${merchant.location} · ${beerTxt} · income +${t.income}`,
        { square: action.square, tile: built.tile, location: LOCATION_OF[action.square], cost: beerTxt });
      break;
    }

    case 'loan': {
      const card = takeCard(action.card);
      if (!card) return fail('Pick a card to play');
      const income = incomeAt(player.incomeOffset);
      if (income - LOAN_INCOME_DROP < -10) return fail('Income is too low for a loan');
      player.money += data.constants.loanAmount;
      player.incomeOffset = offsetForIncome(income - LOAN_INCOME_DROP);
      discard(action.card);
      event('Took a loan', `+£${data.constants.loanAmount} · income £${incomeBefore} → £${incomeAt(player.incomeOffset)}`);
      break;
    }

    case 'scout': {
      if (action.cards.length !== 3) return fail('Scout discards exactly 3 cards');
      if (new Set(action.cards).size !== 3) return fail('Pick three different cards');
      if (action.cards.some((i) => !takeCard(i))) return fail('Pick cards from your hand');
      if (player.hand.some((c) => c.kind === 'wild')) return fail('You already hold a wild card');
      if (state.wild.location < 1 || state.wild.industry < 1) return fail('No wild cards left');
      discard(...action.cards);
      state.wild.location--;
      state.wild.industry--;
      player.hand.push({ cell: 1, name: 'Wild Location', kind: 'wild' });
      player.hand.push({ cell: 2, name: 'Wild Industry', kind: 'wild' });
      event('Scouted', 'Discarded 3 cards for the wild pair');
      break;
    }

    case 'pass': {
      const card = takeCard(action.card);
      if (!card) return fail('Pick a card to play');
      discard(action.card);
      event('Passed', 'Discarded a card');
      break;
    }

    default:
      return fail('Unknown action');
  }

  advance(state);
  return { ok: true };
}

/** keep each player's display beer total in sync with their brewery cubes */
function refreshBeerTotals(state: BrassState): void {
  for (const p of state.players) p.beer = 0;
  for (const b of Object.values(state.board.industries)) {
    if (!b.flipped && TILES[b.tile].type === 'Brewery') {
      const owner = state.players.find((p) => p.color === b.color);
      if (owner) owner.beer += b.cubes;
    }
  }
}

// ---------------------------------------------------------------------------
// Turn / round / era flow
// ---------------------------------------------------------------------------

function playerByColor(state: BrassState, color: Color): BrassPlayer {
  return state.players.find((p) => p.color === color)!;
}

function refillHand(state: BrassState, p: BrassPlayer): number {
  let drew = 0;
  while (p.hand.length < data.constants.handSize && state.drawDeck.length > 0) {
    p.hand.push(state.drawDeck.pop()!);
    drew++;
  }
  return drew;
}

function advance(state: BrassState): void {
  state.actionsLeft--;
  if (state.actionsLeft > 0) return;

  // end of turn: refill, next player
  const drew = refillHand(state, playerByColor(state, state.turnOrder[state.current]));
  if (drew > 0 && state.lastEvent) state.lastEvent.drew = drew;
  state.current++;
  state.actionsLeft = state.era === 'canal' && state.round === 1 ? 1 : 2;

  if (state.current < state.turnOrder.length) return;

  // ---- end of round ----
  if (state.round < state.numRounds) {
    state.round++;
    state.turnOrder = [...state.turnOrder].sort(
      (a, b) => playerByColor(state, a).spent - playerByColor(state, b).spent,
    );
    for (const p of state.players) p.spent = 0;
    for (const p of state.players) p.money = Math.max(0, p.money + incomeAt(p.incomeOffset));
    state.current = 0;
    state.actionsLeft = 2;
    return;
  }

  // ---- end of era ----
  scoreEra(state);
  if (state.era === 'canal') {
    state.board.links = {};
    for (const [sq, b] of Object.entries(state.board.industries)) {
      if (TILES[b.tile].level === 1) delete state.board.industries[sq];
    }
    state.era = 'rail';
    state.round = 1;
    state.turnOrder = [...state.turnOrder].sort(
      (a, b) => playerByColor(state, a).spent - playerByColor(state, b).spent,
    );
    for (const p of state.players) { p.spent = 0; p.links = data.constants.linksPerPlayerPerEra; }
    const rng = mulberrySeq(state.seed + 7777);
    const list = [...(data.decks[String(state.players.length) as '2' | '3' | '4'].list as Card[])];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    state.drawDeck = list;
    for (const p of state.players) refillHand(state, p);
    for (const m of state.merchants) if (m.tile.startsWith('Buys ')) m.beer = true;
    refreshBeerTotals(state);
    state.current = 0;
    state.actionsLeft = 2;
    state.log.push('The Canal Era ends. Rail Era begins.');
    return;
  }

  // game over
  state.phase = 'ended';
  let best: BrassPlayer | null = null;
  for (const p of state.players) {
    if (!best || p.vp > best.vp
      || (p.vp === best.vp && incomeAt(p.incomeOffset) > incomeAt(best.incomeOffset))
      || (p.vp === best.vp && incomeAt(p.incomeOffset) === incomeAt(best.incomeOffset) && p.money > best.money)) {
      best = p;
    }
  }
  state.winner = best?.color ?? null;
  state.log.push(`Game over. ${best?.name ?? '?'} wins with ${best?.vp ?? 0} VP.`);
}

/** Era scoring: flipped industries score their points; each link scores the
 * link points of every adjacent location (built tiles' link icons, merchants
 * count 2). */
function scoreEra(state: BrassState): void {
  const locLinkPoints = (loc: string): number => {
    if (EXTERNAL[loc] !== undefined) return EXTERNAL[loc];
    let sum = 0;
    for (const sq of LOCATIONS[loc] ?? []) {
      const b = state.board.industries[sq];
      if (b) sum += TILES[b.tile].link_points;
    }
    return sum;
  };
  for (const [link, color] of Object.entries(state.board.links)) {
    const pts = LINK_ENDS[link].reduce((a, end) => a + locLinkPoints(end), 0);
    playerByColor(state, color).vp += pts;
  }
  for (const b of Object.values(state.board.industries)) {
    if (b.flipped) playerByColor(state, b.color).vp += TILES[b.tile].points;
  }
  state.log.push(`${state.era === 'canal' ? 'Canal' : 'Rail'} Era scored.`);
}

function mulberrySeq(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
