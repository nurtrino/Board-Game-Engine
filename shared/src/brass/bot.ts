// Built-in Brass player for the computer seats. It sees only what its seat
// would see (its own hand and the public table) and returns its moves best
// first; the caller applies the first one the engine accepts. Every move is
// found with the same helpers the devices use, so nothing here restates a rule.
import type { BrassView, Color } from './state.js';
import {
  TILES, LOCATIONS, LOCATION_OF, LINK_ENDS, EXTERNAL, INDUSTRY_TYPES, LOAN_INCOME_DROP,
  buildLocations, freeSquares, buildableLinks, sellableSquares, developableTiles, cardIndustries,
  lowestTile, planBuild, networkOf, connectedMerchant, beerAvailable, connectedCoalSquares,
  ironSquares, marketConnected, marketBuyPrice, startingCubes,
  type BrassAction, type BuildPlan, type PublicBoard,
} from './actions.js';

const SELLS = ['Cotton Mill', 'Manufacturer', 'Pottery'];

/** What a fresh tile's cubes would fetch if they went straight to the market. */
function marketYield(fill: number[], cubes: number): { sold: number; money: number } {
  let sold = 0;
  let money = 0;
  const f = [...fill];
  while (sold < cubes) {
    const i = f.findIndex((x) => x === 0);
    if (i < 0) break;
    f[i] = 1;
    money += Math.floor(i / 2) + 1;
    sold++;
  }
  return { sold, money };
}

function linkPointsAt(board: PublicBoard, loc: string): number {
  if (EXTERNAL[loc] !== undefined) return EXTERNAL[loc];
  let sum = 0;
  for (const sq of LOCATIONS[loc] ?? []) {
    const b = board.industries[sq];
    if (b) sum += TILES[b.tile].link_points;
  }
  return sum;
}

interface Option { action: BrassAction; score: number }

export function brassBotMoves(v: BrassView, rnd: () => number = Math.random): BrassAction[] {
  const me = v.players[v.you ?? -1];
  const hand = me?.hand ?? [];
  if (!me || !hand.length || v.phase !== 'playing') return [];
  const color: Color = me.color;
  const { board, markets, merchants, era } = v;
  const roundsLeft = v.numRounds - v.round + (era === 'canal' ? v.numRounds : 0);
  const eraRoundsLeft = v.numRounds - v.round;
  // income is worth less the fewer rounds remain to collect it
  const incomeWeight = Math.min(1, roundsLeft / 6);
  const jitter = () => rnd() * 1.5;

  // ---- every build the hand allows, affordable or not ----
  const plans = new Map<string, BuildPlan | null>();
  const planFor = (industry: string, square: string): BuildPlan | null => {
    const key = `${industry}|${square}`;
    if (!plans.has(key)) {
      const p = planBuild(board, markets, merchants, me.tiles, era, industry, square);
      plans.set(key, 'error' in p ? null : p);
    }
    return plans.get(key)!;
  };
  const cardsFor = new Map<string, number[]>(); // build key -> hand indexes that allow it
  const uses = hand.map(() => 0); // how many builds each card opens
  hand.forEach((card, ci) => {
    const inds = card.kind === 'location' || card.name === 'Wild Location' ? INDUSTRY_TYPES : cardIndustries(card);
    for (const loc of buildLocations(board, color, card)) {
      for (const sq of freeSquares(board, color, loc, era)) {
        for (const ind of inds) {
          if (!lowestTile(me.tiles, ind, era) || !planFor(ind, sq)) continue;
          const key = `${ind}|${sq}`;
          const list = cardsFor.get(key) ?? cardsFor.set(key, []).get(key)!;
          if (!list.includes(ci)) { list.push(ci); uses[ci]++; }
        }
      }
    }
    if (card.kind === 'wild') uses[ci] += 1000; // never the card to throw away
  });
  const byUse = hand.map((_, i) => i).sort((a, b) => uses[a] - uses[b]);
  const spare = byUse[0];

  const mySellable = Object.entries(board.industries)
    .filter(([, b]) => b.color === color && !b.flipped && SELLS.includes(TILES[b.tile].type));
  const beerNeeded = mySellable.reduce((n, [, b]) => n + (TILES[b.tile].beers_to_sell ?? 1), 0);

  const options: Option[] = [];
  let bestUnaffordable = 0;

  for (const [key, cards] of cardsFor) {
    const [industry, square] = key.split('|');
    const plan = planFor(industry, square)!;
    const t = TILES[plan.tile];
    const loc = LOCATION_OF[square];
    let flips = 0.5; // how likely the tile is to turn over and score
    let cash = 0;
    let extra = 0;
    if (t.type === 'Coal Mine' || t.type === 'Iron Works') {
      const cubes = startingCubes(plan.tile, era);
      const coal = t.type === 'Coal Mine';
      const open = !coal || marketConnected(board, merchants, loc);
      const y = open ? marketYield(coal ? markets.coal : markets.iron, cubes) : { sold: 0, money: 0 };
      cash = y.money;
      flips = y.sold >= cubes ? 1 : 0.35 + 0.4 * (y.sold / cubes);
    } else if (t.type === 'Brewery') {
      flips = beerNeeded > me.beer ? 0.85 : 0.45;
      extra = beerNeeded > me.beer ? 5 : me.beer >= 2 ? -5 : 0;
    } else {
      const sells = connectedMerchant(board, merchants, loc, t.type) !== null;
      flips = sells ? 0.9 : eraRoundsLeft <= 1 ? 0.1 : 0.45;
      // a tile that needs no beer sells the moment it is connected
      if ((t.beers_to_sell ?? 1) === 0 && sells) extra += 2;
    }
    // level 2 and up stays on the board through the changeover and scores again
    const twice = era === 'canal' && t.level > 1 ? 1.5 : 1;
    const score = flips * (t.points * twice + t.income * 0.9 * incomeWeight)
      + cash * 0.35 + t.link_points * 0.4 + extra - plan.total * 0.2;
    if (plan.total > me.money) { bestUnaffordable = Math.max(bestUnaffordable, score); continue; }
    // spend the card that opens the fewest other builds
    const card = [...cards].sort((a, b) => uses[a] - uses[b])[0];
    options.push({ action: { type: 'build', card, industry, square }, score: score + jitter() });
  }

  // ---- sell: nearly always right when it can be done ----
  for (const sq of sellableSquares(board, merchants, color)) {
    const t = TILES[board.industries[sq].tile];
    const mi = connectedMerchant(board, merchants, LOCATION_OF[sq], t.type);
    if (mi === null || beerAvailable(board, merchants, color, mi) < (t.beers_to_sell ?? 1)) continue;
    options.push({
      action: { type: 'sell', card: spare, square: sq },
      score: 7 + t.points + t.income * incomeWeight + jitter(),
    });
  }

  // ---- links ----
  if (me.links > 0) {
    const net = networkOf(board, color);
    const sellableNow = sellableSquares(board, merchants, color).length;
    for (const link of buildableLinks(board, color, era)) {
      let cost = era === 'canal' ? 3 : 5;
      if (era === 'rail') {
        const end = LINK_ENDS[link].find((e) => LOCATIONS[e]) ?? LINK_ENDS[link][0];
        if (!connectedCoalSquares(board, end).length) {
          if (!marketConnected(board, merchants, end)) continue;
          cost += marketBuyPrice(markets.coal, 'coal', 1);
        }
      }
      if (cost > me.money) { bestUnaffordable = Math.max(bestUnaffordable, 4); continue; }
      const ends = LINK_ENDS[link];
      // with nothing on the board yet, a tile comes before a link
      let score = -cost * 0.25 - (net.size ? 0 : 5);
      for (const end of ends) {
        score += linkPointsAt(board, end) * 0.9;
        if (!net.has(end)) {
          score += 2;
          const open = (LOCATIONS[end] ?? []).filter((sq) => !board.industries[sq]).length;
          score += Math.min(2, open) * 0.4;
          if (hand.some((c) => c.kind === 'location' && c.name === end)) score += 1.5;
        }
      }
      // does this link open a sale?
      const after: PublicBoard = { industries: board.industries, links: { ...board.links, [link]: color } };
      score += (sellableSquares(after, merchants, color).length - sellableNow) * 8;
      options.push({ action: { type: 'network', card: spare, link }, score: score + jitter() });
    }
  }

  // ---- develop ----
  if (roundsLeft > 1) {
    const works = ironSquares(board).length > 0;
    const ironCost = works ? 0 : marketBuyPrice(markets.iron, 'iron', 1);
    if (ironCost <= me.money) {
      for (const tile of developableTiles(me.tiles)) {
        const t = TILES[tile];
        const blocked = era === 'rail' && !t.rail_era;
        const next = Object.entries(me.tiles)
          .filter(([name, n]) => n > 0 && TILES[name].type === t.type && (TILES[name].level > t.level || (name === tile && n > 1)))
          .sort((a, b) => TILES[a[0]].level - TILES[b[0]].level)[0];
        if (!next) continue; // nothing better underneath
        const gain = TILES[next[0]].points - t.points;
        const score = (blocked ? 6 : 0) + gain * 0.5 - 1.5 - ironCost * 0.3;
        options.push({ action: { type: 'develop', card: spare, tile }, score: score + jitter() });
      }
    }
  }

  // ---- loan: when good moves are out of reach ----
  if (me.income - LOAN_INCOME_DROP >= -10 && me.money < 25) {
    const bestNow = options.reduce((m, o) => Math.max(m, o.score), -Infinity);
    let score = bestUnaffordable > Math.max(bestNow, 2) ? 5 + Math.min(6, bestUnaffordable * 0.4) : -2;
    if (me.money < 6) score += 3;
    if (roundsLeft <= 1) score -= 8;
    options.push({ action: { type: 'loan', card: spare }, score: score + jitter() });
  }

  // ---- scout: a hand that can build nothing ----
  if (!cardsFor.size && hand.length >= 3 && !hand.some((c) => c.kind === 'wild')
    && v.wild.location > 0 && v.wild.industry > 0 && roundsLeft > 0) {
    options.push({ action: { type: 'scout', cards: byUse.slice(0, 3) }, score: 2.5 + jitter() });
  }

  options.sort((a, b) => b.score - a.score);
  return [...options.map((o) => o.action), { type: 'pass', card: spare }];
}
