// Rails & Sails action engine. Server-authoritative: applyTtrAction mutates
// or rejects; the client imports the same legality helpers so the UI only
// offers legal moves. Rules per the mod's bundled official rulebook:
//   - one action per turn: take travel cards / claim a route / draw tickets /
//     build a harbor / exchange pieces
//   - take travel cards: 2 (faceup or blind, mixed); a faceup wild is the only
//     card that turn, and a wild can't be the second faceup take; 3 wilds
//     faceup flushes all six
//   - claim: cards match route type + color (gray = any one color); wilds
//     free; a double-ship card covers up to 2 spaces; "pair" rail spaces need
//     a 2-card same-color set per space (colors may differ across spaces);
//     double routes: one side per player, both sides only with 4-5 players
//   - tickets: draw 4 keep >=1
//   - harbor: port city with an own route into it; 2 train + 2 ship cards of
//     one color, all bearing the harbor symbol; wilds substitute
//   - exchange: swap supply pieces 1:1 with the box, -1 point each
//   - end: supply <=6 pieces -> two more turns for everyone, then scoring
//     (route points already on the track; +-tickets, tours exact/any/fail,
//     harbors 20/30/40 by completed tickets naming the city, -4 per unbuilt)

import {
  CATALOG, ROUTES, ROUTE_BY_ID, DOUBLE_OF, HARBOR_CITIES, ROUTE_SCORE, RULES,
  makeTicket,
  type TtrState, type TtrPlayer, type TtrColor, type CardColor, type Ticket, type TtrEvent,
} from './state.js';
import { mulberry32, shuffle } from '../brass/rng.js';

export type TtrAction =
  | { type: 'setup_ready'; tickets: number[]; trains: number; ships: number } // tickets = indices into pendingTickets
  | { type: 'draw_card'; source: 'train' | 'ship' | number } // number = market slot 0-5
  | { type: 'end_turn' } // stop drawing early / pass when stuck
  | { type: 'claim'; route: string; cards: number[] } // cards = indices into hand
  | { type: 'draw_tickets' }
  | { type: 'keep_tickets'; keep: number[] } // indices into pendingTickets
  | { type: 'build_harbor'; city: string; cards: number[] }
  | { type: 'exchange'; trains: number; ships: number }; // desired deltas (+take from box, -return)

const MAX_DRAWS = 2;

export interface TtrResult { ok: boolean; error?: string; }
const err = (error: string): TtrResult => ({ ok: false, error });
const OK: TtrResult = { ok: true };

const seatAt = (s: TtrState, turn: number): TtrPlayer => s.players[(s.first + turn) % s.players.length];
export const currentPlayer = (s: TtrState): TtrPlayer => seatAt(s, s.turn);

function event(s: TtrState, p: TtrPlayer, e: Omit<TtrEvent, 'seq' | 'color' | 'player'>): void {
  s.lastEvent = { seq: (s.lastEvent?.seq ?? 0) + 1, color: p.color, player: p.name, ...e };
  s.log.push(`${p.name}: ${e.title}${e.detail ? ` — ${e.detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Decks + market
// ---------------------------------------------------------------------------

function reshuffle(s: TtrState, which: 'train' | 'ship'): void {
  const deck = which === 'train' ? s.trainDeck : s.shipDeck;
  const disc = which === 'train' ? s.trainDiscard : s.shipDiscard;
  if (deck.length === 0 && disc.length) {
    const rng = mulberry32(s.seed ^ (s.lastEvent?.seq ?? 0) * 2654435761);
    deck.push(...shuffle(disc.splice(0), rng));
  }
}

function drawFrom(s: TtrState, which: 'train' | 'ship'): number | null {
  reshuffle(s, which);
  const deck = which === 'train' ? s.trainDeck : s.shipDeck;
  return deck.pop() ?? null;
}

/** Refill an empty market slot (replacement may come from either deck — the
 *  physical rule says the taker chooses; we draw ship for slots 0-2 and train
 *  for 3-5, falling back to the other deck when one is dry). */
function refillSlot(s: TtrState, slot: number): void {
  const pref: 'train' | 'ship' = slot < 3 ? 'ship' : 'train';
  const card = drawFrom(s, pref) ?? drawFrom(s, pref === 'ship' ? 'train' : 'ship');
  s.market[slot] = card;
  flushWildsIfNeeded(s);
}

function flushWildsIfNeeded(s: TtrState): void {
  const wilds = s.market.filter((c) => c !== null && CATALOG[c].wild).length;
  if (wilds < RULES.wildFlushCount) return;
  for (let i = 0; i < s.market.length; i++) {
    const c = s.market[i];
    if (c !== null) (CATALOG[c].type === 'train' ? s.trainDiscard : s.shipDiscard).push(c);
    s.market[i] = null;
  }
  for (let i = 0; i < s.market.length; i++) {
    const pref: 'train' | 'ship' = i < 3 ? 'ship' : 'train';
    s.market[i] = drawFrom(s, pref) ?? drawFrom(s, pref === 'ship' ? 'train' : 'ship');
  }
  s.log.push('Three wilds faceup — market flushed.');
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function piecesLeft(p: TtrPlayer): number { return p.trains + p.ships; }

function endTurn(s: TtrState): void {
  const p = currentPlayer(s);
  s.turnDraws = 0;
  if (s.finalTurns === null && piecesLeft(p) <= RULES.endTriggerPieces) {
    s.finalTurns = s.players.length * RULES.extraTurnsAfterTrigger;
    s.log.push(`${p.name} is down to ${piecesLeft(p)} pieces — ${RULES.extraTurnsAfterTrigger} more turns each.`);
  } else if (s.finalTurns !== null) {
    s.finalTurns--;
    if (s.finalTurns <= 0) return finishGame(s);
  }
  s.turn = (s.turn + 1) % s.players.length;
}

// ---------------------------------------------------------------------------
// Connectivity + final scoring
// ---------------------------------------------------------------------------

/** Cities reachable from `from` over one player's claimed routes. */
export function connectedComponent(s: Pick<TtrState, 'routeOwners'>, color: TtrColor, from: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const [id, owner] of Object.entries(s.routeOwners)) {
    if (owner !== color) continue;
    const r = ROUTE_BY_ID[id];
    (adj.get(r.a) ?? adj.set(r.a, []).get(r.a)!).push(r.b);
    (adj.get(r.b) ?? adj.set(r.b, []).get(r.b)!).push(r.a);
  }
  const seen = new Set<string>([from]);
  const q = [from];
  while (q.length) {
    const c = q.pop()!;
    for (const n of adj.get(c) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  }
  return seen;
}

export function citiesConnected(s: Pick<TtrState, 'routeOwners'>, color: TtrColor, a: string, b: string): boolean {
  return connectedComponent(s, color, a).has(b);
}

/** Ticket outcome: +points (exact for tours), +anyOrder, or -fail. */
export function scoreTicket(s: Pick<TtrState, 'routeOwners'>, color: TtrColor, t: Ticket): number {
  if (!t.tour) return citiesConnected(s, color, t.cities[0], t.cities[1]) ? t.points : -t.fail;
  const allConnected = t.cities.every((c, i) => i === 0 || citiesConnected(s, color, t.cities[0], c));
  if (!allConnected) return -t.fail;
  // "exact order": every consecutive pair connected (the printed chain is
  // traceable); otherwise the lower completed value
  const exact = t.cities.every((c, i) => i === 0 || citiesConnected(s, color, t.cities[i - 1], c));
  return exact ? t.points : (t.anyOrder ?? t.points);
}

export function isTicketComplete(s: Pick<TtrState, 'routeOwners'>, color: TtrColor, t: Ticket): boolean {
  return scoreTicket(s, color, t) > 0;
}

function finishGame(s: TtrState): void {
  s.phase = 'ended';
  for (const p of s.players) {
    let pts = 0;
    const completed: Ticket[] = [];
    for (const t of p.tickets) {
      const v = scoreTicket(s, p.color, t);
      pts += v;
      if (v > 0) completed.push(t);
    }
    // harbors: 20/30/40 per built harbor by completed tickets naming its city
    for (const [city, owner] of Object.entries(s.harborOwners)) {
      if (owner !== p.color) continue;
      const n = completed.filter((t) => t.cities.includes(city)).length;
      if (n >= 3) pts += RULES.harborScore['3'];
      else if (n > 0) pts += RULES.harborScore[String(n) as '1' | '2'];
    }
    pts -= p.harbors * RULES.unbuiltHarborPenalty;
    p.score += pts;
  }
  const best = [...s.players].sort((a, b) => b.score - a.score)[0];
  s.winner = best.color;
  s.log.push(`Game over — ${best.name} wins with ${best.score} points.`);
}

// ---------------------------------------------------------------------------
// Claim legality (shared with the client UI)
// ---------------------------------------------------------------------------

export interface ClaimPlan {
  route: string;
  cost: number; // cards required (informational)
  error?: string;
}

/** Can this set of hand cards claim this route? Returns null if legal, else the reason. */
export function claimError(s: TtrState, p: TtrPlayer, routeId: string, cardIdx: number[]): string | null {
  const r = ROUTE_BY_ID[routeId];
  if (!r) return 'Unknown route';
  if (s.routeOwners[routeId]) return 'Route already claimed';
  const other = DOUBLE_OF[routeId];
  if (other) {
    if (s.routeOwners[other] === p.color) return 'You already claimed the parallel route';
    if (s.routeOwners[other] && s.players.length <= 3) return 'Parallel route is closed with 2-3 players';
  }
  if (r.kind === 'rail' && p.trains < r.length) return `Needs ${r.length} trains — you have ${p.trains}`;
  if (r.kind === 'sea' && p.ships < r.length) return `Needs ${r.length} ships — you have ${p.ships}`;

  const uniq = new Set(cardIdx);
  if (uniq.size !== cardIdx.length) return 'Duplicate cards';
  const played = cardIdx.map((i) => p.hand[i]);
  if (played.some((c) => c === undefined)) return 'Bad card index';
  const types = played.map((c) => CATALOG[c]);

  const wanted = r.kind === 'rail' ? 'train' : 'ship';
  if (types.some((t) => !t.wild && t.type !== wanted)) return `Only ${wanted} cards (plus wilds) can claim this route`;

  // one color for the whole set (gray = any single color; wilds free)
  const colors = new Set(types.filter((t) => !t.wild).map((t) => t.color));
  if (colors.size > 1 && r.pair === 0) return 'Cards must all be one color';
  if (r.color && colors.size && !colors.has(r.color)) return `This route needs ${r.color} cards`;

  if (r.kind === 'rail' && r.pair > 0) {
    // every space needs a same-color PAIR (colors may vary per space, wilds free)
    if (played.length !== r.length * 2) return `Pair route: needs ${r.length * 2} train cards (2 per space)`;
    // greedy pairing: count by color, wilds fill anything
    const byColor = new Map<CardColor, number>();
    let wilds = 0;
    for (const t of types) { if (t.wild) wilds++; else byColor.set(t.color!, (byColor.get(t.color!) ?? 0) + 1); }
    let pairs = 0, spare = 0;
    for (const n of byColor.values()) { pairs += Math.floor(n / 2); spare += n % 2; }
    const wildForSpares = Math.min(wilds, spare);
    pairs += wildForSpares;
    pairs += Math.floor((wilds - wildForSpares) / 2);
    if (pairs < r.length) return 'Pair route: cards must form 2-card same-color sets';
    return null;
  }

  if (r.kind === 'sea') {
    // capacity: double-ship covers up to 2 spaces
    const capacity = types.reduce((a, t) => a + (t.wild ? 1 : t.double ? 2 : 1), 0);
    const capacityMin = types.reduce((a, t) => a + 1, 0);
    if (capacity < r.length) return `Not enough — those cards cover ${capacity} of ${r.length} spaces`;
    if (capacityMin > r.length) return 'Too many cards for this route';
    return null;
  }

  if (played.length !== r.length) return `Needs exactly ${r.length} cards`;
  return null;
}

/** All routes this player could currently claim with SOME subset of hand. */
export function claimableRoutes(s: TtrState, p: TtrPlayer): string[] {
  const out: string[] = [];
  for (const r of ROUTES) {
    if (s.routeOwners[r.id]) continue;
    const other = DOUBLE_OF[r.id];
    if (other && (s.routeOwners[other] === p.color || (s.routeOwners[other] && s.players.length <= 3))) continue;
    if (r.kind === 'rail' && p.trains < r.length) continue;
    if (r.kind === 'sea' && p.ships < r.length) continue;
    if (bestCardsFor(s, p, r.id)) out.push(r.id);
  }
  return out;
}

/** Pick a minimal legal card set for a route from the hand, or null. */
export function bestCardsFor(s: TtrState, p: TtrPlayer, routeId: string): number[] | null {
  const r = ROUTE_BY_ID[routeId];
  if (!r) return null;
  const wanted = r.kind === 'rail' ? 'train' : 'ship';
  const idxByKey = new Map<string, number[]>();
  const wilds: number[] = [];
  p.hand.forEach((c, i) => {
    const t = CATALOG[c];
    if (t.wild) { wilds.push(i); return; }
    if (t.type !== wanted) return;
    const key = `${t.color}|${t.double ? 2 : 1}`;
    (idxByKey.get(key) ?? idxByKey.set(key, []).get(key)!).push(i);
  });
  const colors: (CardColor | null)[] = r.color ? [r.color] : ['Black', 'Green', 'Purple', 'Red', 'White', 'Yellow'];

  for (const color of colors) {
    if (r.kind === 'rail' && r.pair === 0) {
      const own = idxByKey.get(`${color}|1`) ?? [];
      const need = r.length;
      if (own.length + wilds.length >= need) {
        return [...own.slice(0, need), ...wilds.slice(0, Math.max(0, need - own.length))];
      }
    } else if (r.kind === 'rail') {
      // pair route with a single color + wilds (simplest legal set)
      const own = idxByKey.get(`${color}|1`) ?? [];
      const need = r.length * 2;
      if (own.length + wilds.length >= need) {
        return [...own.slice(0, need), ...wilds.slice(0, Math.max(0, need - own.length))];
      }
    } else {
      const singles = idxByKey.get(`${color}|1`) ?? [];
      const doubles = idxByKey.get(`${color}|2`) ?? [];
      // use doubles first, then singles, then wilds
      const set: number[] = [];
      let covered = 0;
      for (const i of doubles) { if (covered >= r.length) break; set.push(i); covered += 2; }
      for (const i of singles) { if (covered >= r.length) break; set.push(i); covered += 1; }
      for (const i of wilds) { if (covered >= r.length) break; set.push(i); covered += 1; }
      if (covered >= r.length) {
        // drop overshoot: if we overshot by 1 with a trailing double, that's fine (rulebook allows)
        return set;
      }
    }
  }
  return null;
}

/** Does the player have any legal action available (used to allow a pass)? */
export function hasAnyMove(s: TtrState, p: TtrPlayer): boolean {
  if (s.trainDeck.length || s.shipDeck.length || s.market.some((c) => c !== null)) return true; // can always draw
  if (s.ticketDeck.length) return true;
  if (claimableRoutes(s, p).length) return true;
  if (harborCities(s, p).length && harborCardsFor(p)) return true;
  if (p.boxTrains + p.boxShips > 0) return true; // exchange
  return false;
}

/** Port cities where this player may build a harbor right now (ignoring cards). */
export function harborCities(s: TtrState, p: TtrPlayer): string[] {
  if (p.harbors <= 0) return [];
  return HARBOR_CITIES.filter((city) => {
    if (s.harborOwners[city]) return false;
    return Object.entries(s.routeOwners).some(([id, o]) => {
      if (o !== p.color) return false;
      const r = ROUTE_BY_ID[id];
      return r.a === city || r.b === city;
    });
  });
}

/** A legal 2-train + 2-ship harbor card set from hand, or null. */
export function harborCardsFor(p: TtrPlayer): number[] | null {
  const colors: CardColor[] = ['Black', 'Green', 'Purple', 'Red', 'White', 'Yellow'];
  const wilds = p.hand.map((c, i) => ({ c, i })).filter(({ c }) => CATALOG[c].wild).map(({ i }) => i);
  for (const color of colors) {
    const trains = p.hand.map((c, i) => ({ t: CATALOG[c], i })).filter(({ t }) => t.type === 'train' && t.harbor && t.color === color).map(({ i }) => i);
    const ships = p.hand.map((c, i) => ({ t: CATALOG[c], i })).filter(({ t }) => t.type === 'ship' && t.harbor && t.color === color).map(({ i }) => i);
    const needT = Math.max(0, 2 - trains.length);
    const needS = Math.max(0, 2 - ships.length);
    if (needT + needS <= wilds.length) {
      return [...trains.slice(0, 2), ...ships.slice(0, 2), ...wilds.slice(0, needT + needS)];
    }
  }
  return null;
}

function harborError(p: TtrPlayer, cardIdx: number[]): string | null {
  const uniq = new Set(cardIdx);
  if (uniq.size !== cardIdx.length || cardIdx.length !== 4) return 'Harbor needs exactly 4 cards';
  const types = cardIdx.map((i) => p.hand[i] === undefined ? null : CATALOG[p.hand[i]]);
  if (types.some((t) => !t)) return 'Bad card index';
  const real = types.filter((t) => !t!.wild) as { type: string; color: CardColor | null; harbor: boolean }[];
  if (real.some((t) => !t.harbor)) return 'All cards must bear the harbor symbol';
  const colors = new Set(real.map((t) => t.color));
  if (colors.size > 1) return 'Harbor cards must all be one color';
  const trains = real.filter((t) => t.type === 'train').length;
  const ships = real.filter((t) => t.type === 'ship').length;
  const wilds = types.length - real.length;
  if (trains > 2 || ships > 2) return 'Harbor takes 2 train + 2 ship cards';
  if (trains + ships + wilds !== 4) return 'Harbor needs exactly 4 cards';
  return null;
}

// ---------------------------------------------------------------------------
// applyTtrAction
// ---------------------------------------------------------------------------

function discard(s: TtrState, p: TtrPlayer, cardIdx: number[]): void {
  const cards = cardIdx.map((i) => p.hand[i]);
  p.hand = p.hand.filter((_, i) => !cardIdx.includes(i));
  for (const c of cards) (CATALOG[c].type === 'train' ? s.trainDiscard : s.shipDiscard).push(c);
}

export function applyTtrAction(s: TtrState, seat: number, a: TtrAction): TtrResult {
  const p = s.players[seat];
  if (!p) return err('Bad seat');
  if (s.phase === 'ended') return err('Game over');

  // ---- setup phase: everyone acts simultaneously ----
  if (s.phase === 'setup') {
    if (a.type !== 'setup_ready') return err('Choose tickets and pieces first');
    if (p.ready) return err('Already locked in');
    const keep = [...new Set(a.tickets)];
    if (keep.length < RULES.setupKeepMin) return err(`Keep at least ${RULES.setupKeepMin} tickets`);
    if (keep.some((i) => !p.pendingTickets[i])) return err('Bad ticket index');
    if (a.trains + a.ships !== RULES.pieceTotal) return err(`Pieces must total ${RULES.pieceTotal}`);
    if (a.trains < 0 || a.trains > RULES.maxTrains) return err(`Trains: 0-${RULES.maxTrains}`);
    if (a.ships < 0 || a.ships > RULES.maxShips) return err(`Ships: 0-${RULES.maxShips}`);
    p.tickets = keep.map((i) => p.pendingTickets[i]);
    const returned = p.pendingTickets.filter((_, i) => !keep.includes(i));
    s.ticketDeck.unshift(...returned.map((t) => t.idx)); // bottom of the deck
    p.pendingTickets = [];
    p.trains = a.trains;
    p.ships = a.ships;
    p.boxTrains = RULES.maxTrains - a.trains;
    p.boxShips = RULES.maxShips - a.ships;
    p.ready = true;
    s.log.push(`${p.name} locked in ${a.trains} trains, ${a.ships} ships, ${keep.length} tickets.`);
    if (s.players.every((pl) => pl.ready)) {
      s.phase = 'playing';
      const first = s.players[s.first];
      s.log.push(`All set — ${first.name} goes first.`);
    }
    return OK;
  }

  // ---- ticket keep decision interrupts the turn ----
  if (p.pendingTickets.length) {
    if (a.type !== 'keep_tickets') return err('Choose which tickets to keep');
    const keep = [...new Set(a.keep)];
    if (keep.length < RULES.ticketKeepMin) return err('Keep at least 1 ticket');
    if (keep.some((i) => !p.pendingTickets[i])) return err('Bad ticket index');
    p.tickets.push(...keep.map((i) => p.pendingTickets[i]));
    const returned = p.pendingTickets.filter((_, i) => !keep.includes(i));
    s.ticketDeck.unshift(...returned.map((t) => t.idx));
    p.pendingTickets = [];
    event(s, p, { title: 'Kept tickets', detail: `${keep.length} of ${keep.length + returned.length}` });
    endTurn(s);
    return OK;
  }

  if (currentPlayer(s) !== p) return err('Not your turn');

  switch (a.type) {
    case 'draw_card': {
      if (s.turnDraws >= MAX_DRAWS) return err('You have already drawn twice');
      if (typeof a.source === 'number') {
        const slot = a.source;
        const c = s.market[slot];
        if (c === null || c === undefined) return err('Empty slot');
        const isWild = CATALOG[c].wild;
        if (isWild && s.turnDraws > 0) return err('A faceup wild cannot be the second card');
        p.hand.push(c);
        s.market[slot] = null;
        refillSlot(s, slot);
        // a faceup wild is the whole turn; otherwise it counts as one draw
        s.turnDraws = isWild ? MAX_DRAWS : s.turnDraws + 1;
        event(s, p, { title: isWild ? 'Took the wild' : 'Took a faceup card', detail: '' });
      } else {
        const c = drawFrom(s, a.source);
        if (c === null) return err(`The ${a.source} deck is empty`);
        p.hand.push(c);
        s.turnDraws++;
        event(s, p, { title: 'Drew from the deck', detail: a.source === 'train' ? 'Train deck' : 'Ship deck' });
      }
      // player decides when to stop (End turn) — turn no longer auto-advances,
      // so a single card is a legal take. Wild locks the turn to end.
      if (s.turnDraws >= MAX_DRAWS) endTurn(s);
      return OK;
    }

    case 'end_turn': {
      // stop drawing early (took one card), or pass when nothing else is legal
      const drew = s.turnDraws > 0;
      const stuck = !drew && !hasAnyMove(s, p);
      if (!drew && !stuck) return err('Take an action first');
      event(s, p, { title: drew ? 'Ended turn' : 'Passed', detail: '' });
      endTurn(s);
      return OK;
    }

    case 'claim': {
      if (s.turnDraws > 0) return err('Finish drawing cards first');
      const reason = claimError(s, p, a.route, a.cards);
      if (reason) return err(reason);
      const r = ROUTE_BY_ID[a.route];
      discard(s, p, a.cards);
      s.routeOwners[r.id] = p.color;
      if (r.kind === 'rail') p.trains -= r.length; else p.ships -= r.length;
      const pts = ROUTE_SCORE[r.length] ?? 0;
      p.score += pts;
      event(s, p, {
        title: `Claimed ${r.a} – ${r.b}`,
        detail: `${r.length} ${r.kind === 'rail' ? 'train' : 'ship'}${r.length === 1 ? '' : 's'} · +${pts}`,
        route: r.id,
      });
      endTurn(s);
      return OK;
    }

    case 'draw_tickets': {
      if (s.turnDraws > 0) return err("Finish drawing cards first");
      if (!s.ticketDeck.length) return err('No tickets left');
      p.pendingTickets = s.ticketDeck.splice(-RULES.ticketDrawCount).map(makeTicket);
      event(s, p, { title: 'Drew tickets', detail: `${p.pendingTickets.length} to choose from`, drew: p.pendingTickets.length });
      return OK; // turn ends when they keep
    }

    case 'keep_tickets':
      return err('No tickets pending');

    case 'build_harbor': {
      if (s.turnDraws > 0) return err("Finish drawing cards first");
      if (p.harbors <= 0) return err('No harbors left');
      if (!HARBOR_CITIES.includes(a.city)) return err('Not a port city');
      if (s.harborOwners[a.city]) return err('That port already has a harbor');
      if (!harborCities(s, p).includes(a.city)) return err('You need a claimed route into that city');
      const reason = harborError(p, a.cards);
      if (reason) return err(reason);
      discard(s, p, a.cards);
      s.harborOwners[a.city] = p.color;
      p.harbors--;
      event(s, p, { title: `Built a harbor`, detail: a.city, city: a.city });
      endTurn(s);
      return OK;
    }

    case 'exchange': {
      if (s.turnDraws > 0) return err("Finish drawing cards first");
      const takeT = a.trains, takeS = a.ships;
      if (takeT < 0 || takeS < 0 || takeT + takeS === 0) return err('Nothing to exchange');
      if (takeT > p.boxTrains) return err(`Only ${p.boxTrains} trains in the box`);
      if (takeS > p.boxShips) return err(`Only ${p.boxShips} ships in the box`);
      const returned = takeT + takeS; // 1:1 — same number of pieces goes back
      if (p.trains + p.ships < returned) return err('Not enough pieces to trade away');
      // return ships first for trains taken, trains first for ships taken
      let giveT = Math.min(p.trains, takeS);
      let giveS = returned - giveT;
      if (giveS > p.ships) { giveS = p.ships; giveT = returned - giveS; }
      p.trains = p.trains - giveT + takeT;
      p.ships = p.ships - giveS + takeS;
      p.boxTrains = p.boxTrains - takeT + giveT;
      p.boxShips = p.boxShips - takeS + giveS;
      p.score -= returned * RULES.exchangePenaltyPerPiece;
      event(s, p, { title: 'Exchanged pieces', detail: `${returned} swapped · -${returned}` });
      endTurn(s);
      return OK;
    }
  }
  return err('Unknown action');
}
