// Trekking the National Parks — action reducer. Two actions per turn
// (draw / move / claim / occupy), then discard to 12 and end_turn.
// Rules per docs/specs/trekking.md; scoring/tie semantics mirror the mod Lua.

import {
  MAJORS, NEIGHBORS, PARKS, TREK_RULES, SCORING, START, STONE_COLORS, TREK_CATALOG,
  drawTrekCard, settleTrekRiver,
  type StoneColor, type TrekPlayer, type TrekSeat, type TrekState, type TrekSuit,
} from './state.js';

export type TrekAction =
  | { type: 'draw'; source: 'deck' | number } // number = trek river slot 0-4
  | { type: 'move'; path: number[]; cards: number[] } // path excludes origin; cards = hand indices
  | { type: 'claim'; slot: number; cards: number[]; wildPairs?: number[][]; hop?: number | null }
  | { type: 'occupy'; major: number; cards: number[]; wildPairs?: number[][]; swap?: { take: StoneColor; from: number; give: StoneColor } | null }
  | { type: 'discard'; cards: number[] }
  | { type: 'end_turn' };

export interface TrekResult { ok: boolean; error?: string }
const err = (error: string): TrekResult => ({ ok: false, error });

export function currentTrekPlayer(s: TrekState): TrekPlayer { return s.players[s.turn]; }

let eventSeq = 1;
function event(s: TrekState, p: TrekPlayer, title: string, detail: string, extra?: { node?: number; drew?: number }): void {
  s.lastEvent = { seq: eventSeq++, color: p.color, player: p.name, title, detail, ...extra };
  s.log.push(`${p.name}: ${title}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Icon-cost matching (with Acadia wild pairs)
// ---------------------------------------------------------------------------

/**
 * Check that the selected hand cards exactly pay an icon cost. wildPairs are
 * disjoint pairs of the SAME selected indices (Acadia: 2 cards = 1 wild icon);
 * remaining selected cards each pay 1 icon of their own suit. Exact match.
 */
export function costMatches(p: TrekPlayer, cardIdx: number[], cost: TrekSuit[], wildPairs: number[][] | undefined, acadia: boolean): string | null {
  if (new Set(cardIdx).size !== cardIdx.length) return 'duplicate cards';
  if (cardIdx.some((i) => i < 0 || i >= p.hand.length)) return 'bad card index';
  const pairs = wildPairs ?? [];
  if (pairs.length && !acadia) return 'wild pairs need Acadia';
  const inPairs = pairs.flat();
  if (pairs.some((pr) => pr.length !== 2)) return 'wild pairs are 2 cards';
  if (new Set(inPairs).size !== inPairs.length) return 'overlapping wild pairs';
  if (inPairs.some((i) => !cardIdx.includes(i))) return 'wild pair outside selection';

  const singles = cardIdx.filter((i) => !inPairs.includes(i));
  const need: Record<string, number> = {};
  for (const suit of cost) need[suit] = (need[suit] ?? 0) + 1;
  for (const i of singles) {
    const suit = TREK_CATALOG[p.hand[i]].suit;
    if (!need[suit]) return `extra ${suit} card`;
    need[suit]--;
  }
  const missing = Object.values(need).reduce((a, b) => a + b, 0);
  if (missing !== pairs.length) return missing > pairs.length ? 'cost not covered' : 'extra wild pairs';
  return null;
}

function spendCards(s: TrekState, p: TrekPlayer, cardIdx: number[]): void {
  const sorted = [...cardIdx].sort((a, b) => b - a);
  for (const i of sorted) s.trekDiscard.push(p.hand.splice(i, 1)[0]);
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/** Validate a path (node ids, excluding origin) for the mover. Returns error or null. */
export function pathError(s: TrekState, p: TrekPlayer, path: number[]): string | null {
  if (!path.length) return 'empty path';
  const occupied = new Set(s.players.filter((q) => q.seat !== p.seat && q.node !== START).map((q) => q.node));
  let at = p.node;
  const used = new Set<string>();
  for (let i = 0; i < path.length; i++) {
    const next = path[i];
    if (!NEIGHBORS[at]?.includes(next)) return `no trail ${at}-${next}`;
    const key = at < next ? `${at}-${next}` : `${next}-${at}`;
    if (used.has(key)) return 'trail reused';
    used.add(key);
    if (next === p.node) return 'returns to origin';
    const last = i === path.length - 1;
    if (!last && next !== START && occupied.has(next)) return 'blocked by a trekker';
    at = next;
  }
  return null;
}

/** Land on a node: bump any opponent there, collect the stone if present. */
function arrive(s: TrekState, p: TrekPlayer, dest: number): { bumped: TrekPlayer | null; stone: StoneColor | null } {
  let bumped: TrekPlayer | null = null;
  if (dest !== START) {
    for (const q of s.players) {
      if (q.seat !== p.seat && q.node === dest) { q.node = START; bumped = q; }
    }
  }
  p.node = dest;
  let stone: StoneColor | null = null;
  if (dest !== START && s.stones[dest]) {
    stone = s.stones[dest]!;
    s.stones[dest] = null;
    p.stones[stone]++;
  }
  return { bumped, stone };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function applyTrekAction(s: TrekState, seat: number, a: TrekAction): TrekResult {
  if (s.phase !== 'playing') return err('game over');
  const p = s.players[seat];
  if (!p) return err('bad seat');
  if (s.turn !== seat) return err('not your turn');

  switch (a.type) {
    case 'draw': {
      if (s.actionsLeft <= 0) return err('no actions left');
      let card: number | null;
      if (a.source === 'deck') {
        card = drawTrekCard(s);
        if (card === null) return err('trek deck empty');
      } else {
        if (a.source < 0 || a.source >= s.trekRiver.length) return err('bad river slot');
        card = s.trekRiver[a.source];
        if (card === null) return err('empty river slot');
        s.trekRiver[a.source] = drawTrekCard(s);
        settleTrekRiver(s);
      }
      p.hand.push(card);
      s.actionsLeft--;
      event(s, p, 'drew a trek card', a.source === 'deck' ? 'from the deck' : 'from the river', { drew: card });
      return { ok: true };
    }

    case 'move': {
      if (s.actionsLeft <= 0) return err('no actions left');
      if (!a.cards.length) return err('no cards played');
      if (new Set(a.cards).size !== a.cards.length) return err('duplicate cards');
      if (a.cards.some((i) => i < 0 || i >= p.hand.length)) return err('bad card index');
      const bad = pathError(s, p, a.path);
      if (bad) return err(bad);
      const sum = a.cards.reduce((t, i) => t + TREK_CATALOG[p.hand[i]].value, 0);
      const gc = p.majors.some((m) => MAJORS[m].ability === 'plusOneMove');
      if (sum !== a.path.length && !(gc && sum + 1 === a.path.length)) {
        return err(`cards total ${sum}, path is ${a.path.length}`);
      }
      spendCards(s, p, a.cards);
      const dest = a.path[a.path.length - 1];
      const { bumped, stone } = arrive(s, p, dest);
      s.actionsLeft--;
      const bits = [`to ${nodeName(dest)}`];
      if (stone) bits.push(`took a ${stone.toLowerCase()} stone`);
      if (bumped) bits.push(`bumped ${bumped.name} to START`);
      event(s, p, `hiked ${a.path.length}`, bits.join(', '), { node: dest });
      checkEndTrigger(s);
      return { ok: true };
    }

    case 'claim': {
      if (s.actionsLeft <= 0) return err('no actions left');
      if (a.slot < 0 || a.slot >= s.parkRiver.length) return err('bad park slot');
      const parkId = s.parkRiver[a.slot];
      if (parkId === null) return err('empty park slot');
      const park = PARKS[parkId];
      if (p.node !== park.node) return err(`you are not at ${park.name}`);
      const acadia = p.majors.some((m) => MAJORS[m].ability === 'wildPairs');
      const bad = costMatches(p, a.cards, park.cost, a.wildPairs, acadia);
      if (bad) return err(bad);
      // Hawai'i hop: optional free 1-step move after the claim
      const hop = a.hop ?? null;
      if (hop !== null) {
        if (!p.majors.some((m) => MAJORS[m].ability === 'freeHop')) return err('hop needs Hawai’i Volcanoes');
        if (!NEIGHBORS[p.node].includes(hop)) return err('hop must be distance 1');
      }
      spendCards(s, p, a.cards);
      p.parks.push(parkId);
      s.parkRiver[a.slot] = s.parkDeck.pop() ?? null;
      const bits = [`${park.vp} points`];
      if (p.majors.some((m) => MAJORS[m].ability === 'drawOnClaim')) {
        const c = drawTrekCard(s);
        if (c !== null) { p.hand.push(c); bits.push('drew a card (Yellowstone)'); }
      }
      if (hop !== null) {
        const { bumped, stone } = arrive(s, p, hop);
        bits.push(`hopped to ${nodeName(hop)}`);
        if (stone) bits.push(`took a ${stone.toLowerCase()} stone`);
        if (bumped) bits.push(`bumped ${bumped.name}`);
      }
      s.actionsLeft--;
      event(s, p, `claimed ${park.name}`, bits.join(', '), { node: park.node });
      checkEndTrigger(s);
      return { ok: true };
    }

    case 'occupy': {
      if (s.actionsLeft <= 0) return err('no actions left');
      if (!s.majors.includes(a.major)) return err('major not in play');
      const major = MAJORS[a.major];
      if (p.node !== major.node) return err(`you are not at ${major.name}`);
      if (p.majors.includes(a.major)) return err('already occupied by you');
      if (p.campsites <= 0) return err('no campsites left');
      const acadia = p.majors.some((m) => MAJORS[m].ability === 'wildPairs');
      const bad = costMatches(p, a.cards, major.cost, a.wildPairs, acadia);
      if (bad) return err(bad);
      // Everglades swap: validated before any mutation
      if (a.swap) {
        if (major.ability !== 'stoneSwap') return err('swap needs Everglades');
        const q = s.players[a.swap.from];
        if (!q || q.seat === p.seat) return err('bad swap target');
        if (!q.stones[a.swap.take]) return err('target lacks that stone');
        if (!p.stones[a.swap.give]) return err('you lack that stone');
      }
      spendCards(s, p, a.cards);
      p.campsites--;
      p.majors.push(a.major);
      const bits = ['5 points'];
      if (major.ability === 'drawTwo') {
        for (let i = 0; i < 2; i++) {
          const c = drawTrekCard(s);
          if (c !== null) p.hand.push(c);
        }
        bits.push('drew 2 cards (Denali)');
      }
      if (major.ability === 'stoneSwap' && a.swap) {
        const q = s.players[a.swap.from];
        q.stones[a.swap.take]--; p.stones[a.swap.take]++;
        p.stones[a.swap.give]--; q.stones[a.swap.give]++;
        bits.push(`swapped a ${a.swap.give.toLowerCase()} stone for ${q.name}'s ${a.swap.take.toLowerCase()}`);
      }
      s.actionsLeft--;
      event(s, p, `occupied ${major.name}`, bits.join(', '), { node: major.node });
      checkEndTrigger(s);
      return { ok: true };
    }

    case 'discard': {
      if (!a.cards.length) return err('nothing to discard');
      if (new Set(a.cards).size !== a.cards.length) return err('duplicate cards');
      if (a.cards.some((i) => i < 0 || i >= p.hand.length)) return err('bad card index');
      if (p.hand.length - a.cards.length < TREK_RULES.handLimit) return err('would discard below the limit');
      spendCards(s, p, a.cards);
      event(s, p, 'discarded to the hand limit', '');
      return { ok: true };
    }

    case 'end_turn': {
      if (p.hand.length > TREK_RULES.handLimit) return err(`discard to ${TREK_RULES.handLimit} first`);
      checkEndTrigger(s);
      const n = s.players.length;
      const next = (s.turn + 1) % n;
      if (s.finalRound && next === s.first) {
        finishGame(s);
        return { ok: true };
      }
      s.turn = next;
      s.actionsLeft = TREK_RULES.actionsPerTurn;
      return { ok: true };
    }
  }
  return err('unknown action');
}

export function nodeName(id: number): string {
  return id === START ? 'START' : (PARKS.find((p) => p.node === id)?.name ?? MAJORS.find((m) => m.node === id)?.name ?? `node ${id}`);
}

function checkEndTrigger(s: TrekState): void {
  if (s.finalRound) return;
  const stonesGone = Object.values(s.stones).every((c) => c === null);
  const fifthPark = s.players.some((p) => p.parks.length >= TREK_RULES.endTriggerParks);
  if (stonesGone || fifthPark) s.finalRound = true;
}

// ---------------------------------------------------------------------------
// Scoring (mirrors the Lua: strict-max bonus, ties cancel, count>0 guard)
// ---------------------------------------------------------------------------

function stoneTotal(p: TrekPlayer): number {
  return STONE_COLORS.reduce((t, c) => t + p.stones[c], 0);
}

function parksSubtotal(p: TrekPlayer): number {
  return p.parks.reduce((t, id) => t + PARKS[id].vp, 0) + p.majors.length * SCORING.campsiteVp;
}

export function finishGame(s: TrekState): void {
  const most: Partial<Record<StoneColor, TrekSeat>> = {};
  const second: Partial<Record<StoneColor, TrekSeat>> = {};
  const twoPlayer = s.players.length === 2;
  const bonus: Record<number, number> = {};
  for (const p of s.players) bonus[p.seat] = 0;

  for (const color of STONE_COLORS) {
    const counts = s.players.map((p) => ({ p, n: p.stones[color] })).sort((a, b) => b.n - a.n);
    const top = counts[0];
    const mostWinner = top.n > 0 && !counts.some((c) => c.p !== top.p && c.n === top.n) ? top.p : null;
    if (mostWinner) {
      most[color] = mostWinner.color;
      bonus[mostWinner.seat] += SCORING.mostStones[color];
    }
    if (!twoPlayer) {
      const rest = counts.filter((c) => c.p !== mostWinner);
      const t2 = rest[0];
      const secondWinner = t2 && t2.n > 0 && !rest.some((c) => c.p !== t2.p && c.n === t2.n) ? t2.p : null;
      if (secondWinner) {
        second[color] = secondWinner.color;
        bonus[secondWinner.seat] += SCORING.secondMostStones[color];
      }
    }
  }
  s.bonuses = { most, second };

  for (const p of s.players) {
    p.score = stoneTotal(p) * SCORING.stoneVp + parksSubtotal(p) + bonus[p.seat];
  }

  // winner: score -> parks subtotal -> total stones -> shared
  let pool = [...s.players];
  for (const key of [
    (p: TrekPlayer) => p.score,
    (p: TrekPlayer) => parksSubtotal(p),
    (p: TrekPlayer) => stoneTotal(p),
  ]) {
    const best = Math.max(...pool.map(key));
    pool = pool.filter((p) => key(p) === best);
    if (pool.length === 1) break;
  }
  s.winners = pool.map((p) => p.color);
  s.phase = 'ended';
  const names = pool.map((p) => p.name).join(' & ');
  s.log.push(`Game over — ${names} win${pool.length === 1 ? 's' : ''} with ${pool[0].score} points`);
  s.lastEvent = {
    seq: eventSeq++, color: pool[0].color, player: names,
    title: pool.length > 1 ? 'shared victory' : 'wins the game',
    detail: `${pool[0].score} points`,
  };
}

// ---------------------------------------------------------------------------
// Helpers for bots / UI
// ---------------------------------------------------------------------------

/** BFS shortest path lengths from a node, ignoring blockers (for bot targeting). */
export function distancesFrom(node: number): Record<number, number> {
  const dist: Record<number, number> = { [node]: 0 };
  const q = [node];
  while (q.length) {
    const at = q.shift()!;
    for (const nb of NEIGHBORS[at]) {
      if (dist[nb] === undefined) { dist[nb] = dist[at] + 1; q.push(nb); }
    }
  }
  return dist;
}

/** A legal path of exactly `len` trails to `dest`, honoring blockers, or null. */
export function findPath(s: TrekState, p: TrekPlayer, dest: number, len: number): number[] | null {
  const occupied = new Set(s.players.filter((q) => q.seat !== p.seat && q.node !== START).map((q) => q.node));
  const walk = (at: number, path: number[], used: Set<string>): number[] | null => {
    if (path.length === len) return at === dest ? path : null;
    for (const nb of NEIGHBORS[at]) {
      if (nb === p.node) continue;
      const key = at < nb ? `${at}-${nb}` : `${nb}-${at}`;
      if (used.has(key)) continue;
      const last = path.length + 1 === len;
      if (!last && nb !== START && occupied.has(nb)) continue;
      if (last && nb !== dest) continue;
      used.add(key);
      path.push(nb);
      const got = walk(nb, path, used);
      if (got) return got;
      path.pop();
      used.delete(key);
    }
    return null;
  };
  return walk(p.node, [], new Set());
}
