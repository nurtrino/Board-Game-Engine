// Everdell reducer: full base-game enforcement per The Gilded Book pp28-41 +
// The Archive appendix (docs/specs/everdell.md has the rule-by-rule refs).
// Branching effects use the pending-decision queue: while non-empty, only
// `choose` by the head's owner is legal.

import {
  EV_BASIC_EVENT_BY_ID, EV_BASIC_LOC_BY_ID, EV_BASIC_LOCATIONS, EV_CARD_BY_ID,
  EV_JOURNEY_BY_ID, EV_RESOURCES, EV_SPECIAL_BY_ID,
  type EvCardDef, type EvColor, type EvResMap, type EvResource,
} from './catalog.js';
import {
  EV_CITY_LIMIT, EV_HAND_LIMIT, evCityCount, evCityHas, evCitySpaces, evShuffle,
  evTakesSpace, evZeroRes,
  type EvCityCard, type EvLocRef, type EvPending, type EverdellPlayer, type EverdellState,
} from './state.js';

// ---------- action union ----------

export type EvPlayAbility =
  | { kind: 'none' }
  | { kind: 'occupied'; uid: number }                       // free critter via its construction
  | { kind: 'evertree'; uid: number }                       // Ever Tree grants any critter
  | { kind: 'innkeeper'; uid: number }                      // critter -3 berries, discard innkeeper
  | { kind: 'crane'; uid: number; discount: EvResMap }      // construction -3 any, discard crane
  | { kind: 'judge'; from: EvResource; to: EvResource }     // swap 1 resource
  | { kind: 'dungeon'; uid: number; prisonerUid: number; discount: EvResMap };

export type EverdellAction =
  | { type: 'place_worker'; loc: EvLocRef }
  | { type: 'play_card'; source: 'hand' | 'meadow'; card: string; meadowIndex?: number; ability?: EvPlayAbility; payTo?: number; foolTarget?: number }
  | { type: 'prepare' }
  | { type: 'pass' }
  | { type: 'end_turn' }
  | { type: 'choose'; [k: string]: unknown };

export interface EverdellResult { ok: boolean; error?: string }

const upper = (t: string) => t.replace(/^\p{Ll}/u, (m) => m.toUpperCase());
const err = (error: string): EverdellResult => ({ ok: false, error: upper(error.replace(/\s+—\s+/g, ', ')) });

function evt(s: EverdellState, text: string, kind?: string): void {
  s.lastEvent = { seq: s.lastEvent.seq + 1, text, kind };
}

const nameOf = (s: EverdellState, seat: number) => s.players[seat].name.toUpperCase();
const cardName = (id: string) => (EV_CARD_BY_ID[id]?.name ?? id).toUpperCase();

// ---------- resource helpers ----------

function resTotal(m: EvResMap): number {
  return EV_RESOURCES.reduce((a, r) => a + (m[r] ?? 0), 0);
}

function canPay(p: EverdellPlayer, cost: EvResMap): boolean {
  return EV_RESOURCES.every((r) => p.res[r] >= (cost[r] ?? 0));
}

function pay(p: EverdellPlayer, cost: EvResMap): void {
  for (const r of EV_RESOURCES) p.res[r] -= cost[r] ?? 0;
}

function gain(p: EverdellPlayer, res: EvResMap): void {
  for (const r of EV_RESOURCES) p.res[r] += res[r] ?? 0;
}

function drawCards(s: EverdellState, p: EverdellPlayer, n: number): number {
  let drawn = 0;
  while (drawn < n && p.hand.length < EV_HAND_LIMIT) {
    const c = drawFromDeck(s);
    if (!c) break;
    p.hand.push(c);
    drawn++;
  }
  return drawn;
}

/** Deck empty -> shuffle discard into a new deck (Gilded Book p37). */
function drawFromDeck(s: EverdellState): string | null {
  if (s.deck.length === 0 && s.discard.length > 0) {
    s.deck = evShuffle(s, s.discard.splice(0));
  }
  return s.deck.pop() ?? null;
}

function replenishMeadow(s: EverdellState): void {
  for (let i = 0; i < 8; i++) {
    if (s.meadow[i] === null) s.meadow[i] = drawFromDeck(s);
  }
}

// ---------- cost of playing a card (client mirrors this for greying) ----------

/** Effective cost after the chosen card-playing ability; null = illegal ability. */
export function everdellPlayCost(
  p: EverdellPlayer, def: EvCardDef, ability: EvPlayAbility,
): EvResMap | null {
  const base: EvResMap = { ...def.cost };
  switch (ability.kind) {
    case 'none':
      return base;
    case 'occupied': {
      const cc = p.city.find((c) => c.uid === ability.uid);
      if (!cc || def.kind !== 'critter') return null;
      if (cc.occupiedUsed) return null;
      const host = EV_CARD_BY_ID[cc.card];
      if (!host || host.kind !== 'construction') return null;
      const links = host.link === 'harvester-gatherer' ? ['harvester', 'gatherer'] : [host.link];
      if (!links.includes(def.id)) return null;
      return {};
    }
    case 'evertree': {
      const cc = p.city.find((c) => c.uid === ability.uid);
      if (!cc || cc.card !== 'ever-tree' || cc.occupiedUsed || def.kind !== 'critter') return null;
      return {};
    }
    case 'innkeeper': {
      if (def.kind !== 'critter') return null;
      const cc = p.city.find((c) => c.uid === ability.uid && c.card === 'innkeeper');
      if (!cc) return null;
      const out: EvResMap = { ...base };
      out.berry = Math.max(0, (out.berry ?? 0) - 3);
      return out;
    }
    case 'crane': {
      if (def.kind !== 'construction') return null;
      const cc = p.city.find((c) => c.uid === ability.uid && c.card === 'crane');
      if (!cc) return null;
      return applyDiscount(base, ability.discount, 3);
    }
    case 'dungeon': {
      const cc = p.city.find((c) => c.uid === ability.uid && c.card === 'dungeon');
      if (!cc) return null;
      const cap = evCityHas(p.city, 'ranger') ? 2 : 1;
      if (cc.prisoners.length >= cap) return null;
      const prisoner = p.city.find((c) => c.uid === ability.prisonerUid);
      if (!prisoner) return null;
      const pDef = EV_CARD_BY_ID[prisoner.card];
      if (!pDef || pDef.kind !== 'critter') return null;
      // the Ranger may not occupy the second cell it unlocks
      if (prisoner.card === 'ranger' && cc.prisoners.length === 1) return null;
      return applyDiscount(base, ability.discount, 3);
    }
    case 'judge': {
      if ((base[ability.from] ?? 0) < 1 || ability.from === ability.to) return null;
      const out: EvResMap = { ...base };
      out[ability.from] = (out[ability.from] ?? 0) - 1;
      out[ability.to] = (out[ability.to] ?? 0) + 1;
      return out;
    }
  }
}

function applyDiscount(base: EvResMap, discount: EvResMap, cap: number): EvResMap | null {
  if (resTotal(discount) > cap) return null;
  const out: EvResMap = { ...base };
  for (const r of EV_RESOURCES) {
    const d = discount[r] ?? 0;
    if (d > (out[r] ?? 0)) return null; // over-discounting a resource the cost doesn't have
    out[r] = (out[r] ?? 0) - d;
  }
  return out;
}

/** Uniqueness + city-limit check for putting `def` into `seatIdx`'s city. */
function cityRoomFor(s: EverdellState, seat: number, def: EvCardDef): string | null {
  const p = s.players[seat];
  if (def.rarity === 'unique' && evCityHas(p.city, def.id)) return `only one ${def.name} per city`;
  if (def.noSpace) return null;
  // Gatherer/Harvester may share a space with an unpaired partner
  if ((def.id === 'gatherer' || def.id === 'harvester') && findPairHost(p, def.id)) return null;
  if (evCitySpaces(p.city) >= EV_CITY_LIMIT) return 'city is full (15 spaces)';
  return null;
}

function findPairHost(p: EverdellPlayer, incoming: string): EvCityCard | null {
  const partner = incoming === 'gatherer' ? 'harvester' : 'gatherer';
  return p.city.find((c) => c.card === partner && !c.sharedWith) ?? null;
}

// ---------- entering the city + triggers ----------

function addToCity(s: EverdellState, seat: number, cardId: string): EvCityCard {
  const p = s.players[seat];
  const def = EV_CARD_BY_ID[cardId];
  if ((cardId === 'gatherer' || cardId === 'harvester')) {
    const host = findPairHost(p, cardId);
    if (host) {
      host.sharedWith = cardId;
      host.sharedUid = s.nextUid++;
      return host;
    }
  }
  const cc: EvCityCard = {
    uid: s.nextUid++, card: cardId, sharedWith: null, sharedUid: null,
    occupiedUsed: false, storedPoints: 0, storedRes: evZeroRes(), prisoners: [],
  };
  if (def && !def.noSpace) p.city.push(cc);
  else if (def?.noSpace) p.city.push(cc); // Wanderer sits in the city list but occupies no space
  if (cardId === 'clock-tower') cc.storedPoints = 3; // Archive p10
  return cc;
}

/** Remove a city entry (returns it). Shared partner stays as its own card. */
function removeFromCity(p: EverdellPlayer, uid: number): EvCityCard | null {
  const i = p.city.findIndex((c) => c.uid === uid);
  if (i < 0) return null;
  const [cc] = p.city.splice(i, 1);
  if (cc.sharedWith) {
    // partner remains in the city in its own right
    p.city.splice(i, 0, {
      uid: cc.sharedUid ?? uid, card: cc.sharedWith, sharedWith: null, sharedUid: null,
      occupiedUsed: false, storedPoints: 0, storedRes: evZeroRes(), prisoners: [],
    });
    cc.sharedWith = null;
    cc.sharedUid = null;
  }
  return cc;
}

/** Post-play triggers: Shopkeeper / Courthouse / Historian (Archive). */
function playTriggers(s: EverdellState, seat: number, def: EvCardDef): void {
  const p = s.players[seat];
  if (def.kind === 'critter' && def.id !== 'shopkeeper' && evCityHas(p.city, 'shopkeeper')) {
    gain(p, { berry: 1 });
    evt(s, `${nameOf(s, seat)} GAINS 1 BERRY · SHOPKEEPER`, 'gain');
  }
  if (def.kind === 'construction' && def.id !== 'courthouse' && evCityHas(p.city, 'courthouse')) {
    s.pending.push({ kind: 'courthouse', seat });
  }
  if (def.id !== 'historian' && evCityHas(p.city, 'historian')) {
    drawCards(s, p, 1);
  }
}

// ---------- production ----------

/** Activate one green production card for `seat` (choices go to pending). */
function activateProduction(s: EverdellState, seat: number, cc: EvCityCard, cardId: string): void {
  const p = s.players[seat];
  switch (cardId) {
    case 'farm': gain(p, { berry: 1 }); break;
    case 'mine': gain(p, { pebble: 1 }); break;
    case 'resin-refinery': gain(p, { resin: 1 }); break;
    case 'twig-barge': gain(p, { twig: 2 }); break;
    case 'general-store': gain(p, { berry: evCityCount(p.city, 'farm') > 0 ? 2 : 1 }); break;
    case 'fairgrounds': drawCards(s, p, 2); break;
    case 'barge-toad': gain(p, { twig: 2 * evCityCount(p.city, 'farm') }); break;
    case 'storehouse': s.pending.push({ kind: 'storehouse', seat, uid: cc.uid }); break;
    case 'woodcarver': if (p.res.twig > 0) s.pending.push({ kind: 'pay-per-point', seat, resource: 'twig', max: 3, reason: 'WOODCARVER' }); break;
    case 'doctor': if (p.res.berry > 0) s.pending.push({ kind: 'pay-per-point', seat, resource: 'berry', max: 3, reason: 'DOCTOR' }); break;
    case 'peddler': if (resTotal(p.res) > 0) s.pending.push({ kind: 'peddler', seat, max: 2 }); break;
    case 'monk': if (p.res.berry > 0 && s.players.length > 1) s.pending.push({ kind: 'monk-give', seat, max: 2 }); break;
    case 'chip-sweep': s.pending.push({ kind: 'chip-sweep', seat }); break;
    case 'miner-mole': s.pending.push({ kind: 'miner-mole', seat }); break;
    case 'teacher': {
      const drawn: string[] = [];
      for (let i = 0; i < 2; i++) {
        const c = drawFromDeck(s);
        if (c) drawn.push(c);
      }
      if (drawn.length <= 1) {
        // only able to draw 1: keep it (Archive p8)
        for (const c of drawn) if (p.hand.length < EV_HAND_LIMIT) p.hand.push(c); else s.discard.push(c);
      } else {
        s.pending.push({ kind: 'teacher-give', seat, cards: drawn });
      }
      break;
    }
    case 'harvester': {
      const paired = p.city.some((c) =>
        (c.card === 'harvester' && c.sharedWith === 'gatherer') || (c.card === 'gatherer' && c.sharedWith === 'harvester'));
      if (paired && evCityCount(p.city, 'farm') > 0) s.pending.push({ kind: 'harvester-any', seat, n: 1 });
      break;
    }
    default: break;
  }
}

/** All green production in `seat`'s city (played + prepare into spring/autumn). */
function activateAllProduction(s: EverdellState, seat: number): void {
  const p = s.players[seat];
  for (const cc of [...p.city]) {
    const ids = [cc.card, ...(cc.sharedWith ? [cc.sharedWith] : [])];
    for (const id of ids) {
      if (EV_CARD_BY_ID[id]?.color === 'production') activateProduction(s, seat, cc, id);
    }
  }
}

// ---------- on-play effects ----------

function onPlayEffect(s: EverdellState, seat: number, cc: EvCityCard, def: EvCardDef): void {
  const p = s.players[seat];
  if (def.color === 'production') {
    activateProduction(s, seat, cc, def.id); // once immediately when played (any season)
    return;
  }
  switch (def.id) {
    case 'wanderer': drawCards(s, p, 3); break;
    case 'postal-pigeon': {
      const revealed: string[] = [];
      for (let i = 0; i < 2; i++) {
        const c = drawFromDeck(s);
        if (c) revealed.push(c);
      }
      if (revealed.length) s.pending.push({ kind: 'pigeon-play', seat, revealed });
      break;
    }
    case 'bard': if (p.hand.length > 0) s.pending.push({ kind: 'bard-discard', seat, max: 5 }); break;
    case 'shepherd': {
      gain(p, { berry: 3 });
      const chapel = p.city.find((c) => c.card === 'chapel');
      const pts = chapel?.storedPoints ?? 0;
      if (pts > 0) p.points += pts;
      break;
    }
    case 'ranger': s.pending.push({ kind: 'ranger-move', seat }); break;
    case 'undertaker': s.pending.push({ kind: 'undertaker-discard', seat, remaining: 3 }); break;
    case 'ruins': break; // handled at play time (ruins-target pending pushed there)
    case 'fool': break;  // handled at play time
    default: break;
  }
}

// ---------- worker placement ----------

function workersAvailable(p: EverdellPlayer): number {
  return p.workersTotal - p.workers.length;
}

function workersAt(s: EverdellState, loc: EvLocRef): { seat: number; w: { loc: EvLocRef; permanent: boolean } }[] {
  const out: { seat: number; w: { loc: EvLocRef; permanent: boolean } }[] = [];
  for (const p of s.players) {
    for (const w of p.workers) {
      if (sameLoc(w.loc, loc)) out.push({ seat: p.seat, w });
    }
  }
  return out;
}

function sameLoc(a: EvLocRef, b: EvLocRef): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case 'basic': return a.id === (b as { id: string }).id;
    case 'forest': return a.id === (b as { id: string }).id;
    case 'haven': return true;
    case 'journey': return a.id === (b as { id: string }).id;
    case 'city': return a.seat === (b as { seat: number }).seat && a.uid === (b as { uid: number }).uid;
    case 'basicEvent': return a.id === (b as { id: string }).id;
    case 'specialEvent': return a.id === (b as { id: string }).id;
  }
}

/** Legality of placing seat's worker at loc. Returns error text or null. */
export function everdellCanPlace(s: EverdellState, seat: number, loc: EvLocRef): string | null {
  const p = s.players[seat];
  switch (loc.t) {
    case 'basic': {
      const def = EV_BASIC_LOC_BY_ID[loc.id];
      if (!def) return 'unknown location';
      if (!def.shared && workersAt(s, loc).length > 0) return 'location is occupied';
      return null;
    }
    case 'forest': {
      const f = s.forest.find((x) => x.id === loc.id);
      if (!f) return 'that forest card is not in play';
      const here = workersAt(s, loc);
      if (here.some((h) => h.seat === seat)) return 'you already have a worker there';
      const cap = s.players.length >= 4 ? 2 : 1; // Gilded Book p29
      if (here.length >= cap) return 'location is occupied';
      return canPerformForest(s, seat, loc.id);
    }
    case 'haven':
      if (p.hand.length < 1) return 'no cards to discard at the Haven';
      return null;
    case 'journey': {
      const def = EV_JOURNEY_BY_ID[loc.id];
      if (!def) return 'unknown journey spot';
      if (p.season !== 'autumn') return 'the Journey opens in autumn';
      if (!def.shared && workersAt(s, loc).length > 0) return 'location is occupied';
      if (p.hand.length < def.points) return `need ${def.points} cards to discard`;
      return null;
    }
    case 'city': {
      const owner = s.players[loc.seat];
      if (!owner) return 'bad city';
      const cc = owner.city.find((c) => c.uid === loc.uid);
      if (!cc) return 'card is not in that city';
      const def = EV_CARD_BY_ID[cc.card];
      if (!def) return 'unknown card';
      const isSpot = def.color === 'destination' || def.destinationSpot;
      if (!isSpot) return 'not a destination';
      if (loc.seat !== seat && !def.open) return 'that destination is closed to visitors';
      const here = workersAt(s, loc);
      let cap = 1;
      if (cc.card === 'monastery' && evCityHas(owner.city, 'monk')) cap = 2;
      if (cc.card === 'cemetery' && evCityHas(owner.city, 'undertaker')) cap = 2;
      if (here.length >= cap) return 'destination is occupied';
      return canPerformDestination(s, seat, owner, cc);
    }
    case 'basicEvent': {
      const st = s.basicEvents.find((e) => e.id === loc.id);
      const def = EV_BASIC_EVENT_BY_ID[loc.id];
      if (!st || !def) return 'unknown event';
      if (st.claimedBy !== null) return 'event already achieved';
      const n = p.city.reduce((a, c) => {
        const ids = [c.card, ...(c.sharedWith ? [c.sharedWith] : [])];
        return a + ids.filter((id) => EV_CARD_BY_ID[id]?.color === def.requiresColor).length;
      }, 0);
      if (n < def.count) return `needs ${def.count} ${def.requiresColor} cards`;
      return null;
    }
    case 'specialEvent': {
      const st = s.specialEvents.find((e) => e.id === loc.id);
      const def = EV_SPECIAL_BY_ID[loc.id];
      if (!st || !def) return 'that event is not in play';
      if (st.claimedBy !== null) return 'event already achieved';
      if (def.requiresCards && !def.requiresCards.every((id) => evCityHas(p.city, id))) {
        return `needs ${def.requiresCards.map((id) => EV_CARD_BY_ID[id]?.name ?? id).join(' and ')} in your city`;
      }
      if (def.requiresColors) {
        for (const [color, need] of Object.entries(def.requiresColors)) {
          const n = p.city.reduce((a, c) => {
            const ids = [c.card, ...(c.sharedWith ? [c.sharedWith] : [])];
            return a + ids.filter((id) => EV_CARD_BY_ID[id]?.color === (color as EvColor)).length;
          }, 0);
          if (n < (need ?? 0)) return `needs ${need} ${color} cards`;
        }
      }
      if (def.cost && !canPay(p, def.cost)) return 'cannot pay the event cost';
      if (def.id === 'croak-wart-cure' && p.city.length < 2) return 'need 2 city cards to discard';
      return null;
    }
  }
}

function canPerformForest(s: EverdellState, seat: number, id: string): string | null {
  const p = s.players[seat];
  switch (id) {
    case 'f-discard-draw':
    case 'f-discard-any':
      return p.hand.length >= 1 ? null : 'no cards to discard';
    case 'f-meadow-discount':
      return null;
    default:
      return null;
  }
}

function canPerformDestination(s: EverdellState, seat: number, owner: EverdellPlayer, cc: EvCityCard): string | null {
  const p = s.players[seat];
  switch (cc.card) {
    case 'storehouse':
      return resTotal(cc.storedRes) > 0 ? null : 'nothing stored to take';
    case 'inn': {
      // must be able to play some meadow card with the discount (p28 no-blocking)
      const ok = s.meadow.some((m) => m && playableWithDiscount(s, seat, m, 3, null));
      return ok ? null : 'no playable Meadow card';
    }
    case 'post-office':
      return p.hand.length >= 2 && s.players.length > 1 ? null : 'need 2 cards to give';
    case 'university':
      return p.city.some((c) => c.card !== 'university') ? null : 'no other card to discard';
    case 'chapel':
      return null;
    case 'queen': {
      const ok = [...p.hand, ...s.meadow.filter((m): m is string => !!m)]
        .some((id) => (EV_CARD_BY_ID[id]?.points ?? 99) <= 3 && playableWithDiscount(s, seat, id, 99, 3));
      return ok ? null : 'no playable card worth up to 3';
    }
    case 'lookout':
      return null;
    case 'monastery':
      return resTotal(p.res) >= 2 && s.players.length > 1 ? null : 'need 2 resources to give';
    case 'cemetery':
      return s.deck.length + s.discard.length > 0 ? null : 'no cards left';
    default:
      return 'not a destination';
  }
}

/** Is some ability-free play of cardId possible with a blanket discount? */
function playableWithDiscount(s: EverdellState, seat: number, cardId: string, discount: number, maxPoints: number | null): boolean {
  const def = EV_CARD_BY_ID[cardId];
  if (!def) return false;
  if (maxPoints !== null && def.points > maxPoints) return false;
  if (cityRoomFor(s, seat, def)) return false;
  const p = s.players[seat];
  const cost = { ...def.cost };
  let remaining = discount;
  for (const r of EV_RESOURCES) {
    const use = Math.min(remaining, cost[r] ?? 0);
    cost[r] = (cost[r] ?? 0) - use;
    remaining -= use;
  }
  return canPay(p, cost);
}

function resolveWorkerEffect(s: EverdellState, seat: number, loc: EvLocRef): void {
  const p = s.players[seat];
  switch (loc.t) {
    case 'basic': applyBasicLocation(s, seat, loc.id); break;
    case 'forest': applyForestLocation(s, seat, loc.id); break;
    case 'haven': s.pending.push({ kind: 'haven', seat }); break;
    case 'journey': {
      const def = EV_JOURNEY_BY_ID[loc.id];
      s.pending.push({ kind: 'journey-discard', seat, id: loc.id, n: def.points });
      break;
    }
    case 'city': {
      const owner = s.players[loc.seat];
      const cc = owner.city.find((c) => c.uid === loc.uid);
      if (!cc) break;
      const def = EV_CARD_BY_ID[cc.card];
      if (loc.seat !== seat && def?.open) {
        owner.points += def.openPoints ?? 1;
        evt(s, `${nameOf(s, loc.seat)} GAINS ${def.openPoints ?? 1} POINT · OPEN ${cardName(cc.card)}`, 'gain');
      }
      applyDestination(s, seat, loc.seat, cc);
      break;
    }
    case 'basicEvent': achieveBasicEvent(s, seat, loc.id); break;
    case 'specialEvent': achieveSpecialEvent(s, seat, loc.id); break;
  }
}

function applyBasicLocation(s: EverdellState, seat: number, id: string): void {
  const p = s.players[seat];
  const def = EV_BASIC_LOC_BY_ID[id];
  const gains: EvResMap = {};
  for (const r of EV_RESOURCES) if (def.gain[r]) gains[r] = def.gain[r];
  gain(p, gains);
  if (def.gain.card) drawCards(s, p, def.gain.card);
  if (def.gain.point) p.points += def.gain.point;
}

function applyForestLocation(s: EverdellState, seat: number, id: string): void {
  const p = s.players[seat];
  switch (id) {
    case 'f-two-cards-any': drawCards(s, p, 2); s.pending.push({ kind: 'gain-any', seat, n: 1, reason: 'FOREST' }); break;
    case 'f-resin-twig': gain(p, { resin: 2, twig: 1 }); break;
    case 'f-berries-card': gain(p, { berry: 2 }); drawCards(s, p, 1); break;
    case 'f-two-any': s.pending.push({ kind: 'gain-any', seat, n: 2, reason: 'FOREST' }); break;
    case 'f-meadow-discount': s.pending.push({ kind: 'meadow2-draw', seat }); break;
    case 'f-copy-basic': s.pending.push({ kind: 'copy-basic', seat, draw: 1, allowForest: false, allowOccupied: true }); break;
    case 'f-three-berries': gain(p, { berry: 3 }); break;
    case 'f-discard-draw': s.pending.push({ kind: 'discard-any-draw', seat }); break;
    case 'f-discard-any': s.pending.push({ kind: 'discard-up-to-3-any', seat }); break;
    case 'f-twig-resin-berry': gain(p, { twig: 1, resin: 1, berry: 1 }); break;
    case 'f-cards-pebble': drawCards(s, p, 3); gain(p, { pebble: 1 }); break;
    default: break;
  }
}

function applyDestination(s: EverdellState, seat: number, ownerSeat: number, cc: EvCityCard): void {
  const p = s.players[seat];
  switch (cc.card) {
    case 'storehouse': {
      gain(p, cc.storedRes);
      cc.storedRes = evZeroRes();
      break;
    }
    case 'inn': s.pending.push({ kind: 'inn-play', seat }); break;
    case 'post-office': s.pending.push({ kind: 'post-office-give', seat }); break;
    case 'university': s.pending.push({ kind: 'university-target', seat }); break;
    case 'chapel': {
      cc.storedPoints += 1;
      drawCards(s, p, 2 * cc.storedPoints);
      break;
    }
    case 'queen': s.pending.push({ kind: 'play-discounted', seat, discount: 0, from: 'both', fromCards: null, maxPoints: 3, free: true, reason: 'QUEEN', optional: false }); break;
    case 'lookout': s.pending.push({ kind: 'copy-basic', seat, draw: 0, allowForest: true, allowOccupied: true }); break;
    case 'monastery': s.pending.push({ kind: 'monastery-give', seat }); break;
    case 'cemetery': s.pending.push({ kind: 'cemetery-source', seat }); break;
    default: break;
  }
}

// ---------- events ----------

function achieveBasicEvent(s: EverdellState, seat: number, id: string): void {
  const st = s.basicEvents.find((e) => e.id === id)!;
  st.claimedBy = seat;
  s.players[seat].achievedBasic.push(id);
  evt(s, `${nameOf(s, seat)} ACHIEVES ${EV_BASIC_EVENT_BY_ID[id].name.toUpperCase()}`, 'event');
}

function achieveSpecialEvent(s: EverdellState, seat: number, id: string): void {
  const p = s.players[seat];
  const st = s.specialEvents.find((e) => e.id === id)!;
  const def = EV_SPECIAL_BY_ID[id];
  st.claimedBy = seat;
  p.achievedSpecial.push(id);
  if (def.cost) pay(p, def.cost);
  evt(s, `${nameOf(s, seat)} ACHIEVES ${def.name.toUpperCase()}`, 'event');
  switch (id) {
    case 'tax-relief': activateAllProduction(s, seat); break;
    case 'evening-fireworks': if (p.res.twig > 0) s.pending.push({ kind: 'fireworks-twigs', seat, eventId: id }); break;
    case 'pristine-chapel': {
      const chapel = p.city.find((c) => c.card === 'chapel');
      const pts = chapel?.storedPoints ?? 0;
      if (pts > 0) {
        drawCards(s, p, pts);
        s.pending.push({ kind: 'gain-any', seat, n: pts, reason: 'PRISTINE CHAPEL CEILING' });
      }
      break;
    }
    case 'acorn-thieves': if (p.city.some((c) => EV_CARD_BY_ID[c.card]?.kind === 'critter' || (c.sharedWith && EV_CARD_BY_ID[c.sharedWith]?.kind === 'critter'))) s.pending.push({ kind: 'acorn-thieves', seat, eventId: id }); break;
    case 'marketing-plan': if (resTotal(p.res) > 0 && s.players.length > 1) s.pending.push({ kind: 'marketing-plan', seat, eventId: id }); break;
    case 'ancient-scrolls': {
      const revealed: string[] = [];
      for (let i = 0; i < 5; i++) {
        const c = drawFromDeck(s);
        if (c) revealed.push(c);
      }
      if (revealed.length) s.pending.push({ kind: 'ancient-scrolls', seat, eventId: id, revealed });
      break;
    }
    case 'well-run-city': {
      if (p.workers.some((w) => !w.permanent)) s.pending.push({ kind: 'well-run-city', seat, eventId: id });
      break;
    }
    case 'croak-wart-cure': s.pending.push({ kind: 'croak-city-discard', seat, eventId: id }); break;
    case 'new-management': if (resTotal(p.res) > 0) s.pending.push({ kind: 'new-management', seat, eventId: id }); break;
    case 'performer-residence': if (p.res.berry > 0) s.pending.push({ kind: 'performer-berries', seat, eventId: id }); break;
    case 'graduation-scholars': if (p.hand.some((c) => EV_CARD_BY_ID[c]?.kind === 'critter')) s.pending.push({ kind: 'graduation', seat, eventId: id }); break;
    default: break;
  }
}

// ---------- prepare for season ----------

function startPrepare(s: EverdellState, seat: number): void {
  const p = s.players[seat];
  // Clock Tower: before bringing back workers (Archive p10)
  const tower = p.city.find((c) => c.card === 'clock-tower' && c.storedPoints > 0);
  const hasBasicForestWorker = p.workers.some((w) => w.loc.t === 'basic' || w.loc.t === 'forest');
  if (tower && hasBasicForestWorker) {
    s.pending.push({ kind: 'clock-tower', seat, uid: tower.uid });
    return; // finishPrepare runs after the choice
  }
  finishPrepare(s, seat);
}

function finishPrepare(s: EverdellState, seat: number): void {
  const p = s.players[seat];
  p.workers = p.workers.filter((w) => w.permanent);
  const next = p.season === 'winter' ? 'spring' : p.season === 'spring' ? 'summer' : 'autumn';
  p.season = next;
  if (next === 'spring') {
    p.workersTotal += 1;
    evt(s, `${nameOf(s, seat)} PREPARES FOR SPRING · PRODUCTION`, 'season');
    activateAllProduction(s, seat);
  } else if (next === 'summer') {
    p.workersTotal += 1;
    evt(s, `${nameOf(s, seat)} PREPARES FOR SUMMER`, 'season');
    if (s.meadow.some((m) => m) && p.hand.length < EV_HAND_LIMIT) {
      s.pending.push({ kind: 'summer-meadow', seat, remaining: 2 });
    }
  } else {
    p.workersTotal += 2;
    evt(s, `${nameOf(s, seat)} PREPARES FOR AUTUMN · PRODUCTION`, 'season');
    activateAllProduction(s, seat);
  }
}

// ---------- scoring ----------

export function everdellScore(s: EverdellState, seat: number): { total: number; parts: { cards: number; tokens: number; prosperity: number; journey: number; events: number } } {
  const p = s.players[seat];
  let cards = 0;
  let tokens = p.points;
  let prosperity = 0;
  let journey = 0;
  let events = 0;

  const cityIds: string[] = [];
  for (const cc of p.city) {
    cityIds.push(cc.card);
    if (cc.sharedWith) cityIds.push(cc.sharedWith);
    tokens += cc.storedPoints;
    // prisoners in the Dungeon are worth nothing (Archive p10)
  }
  for (const id of cityIds) cards += EV_CARD_BY_ID[id]?.points ?? 0;

  const count = (pred: (d: EvCardDef) => boolean) =>
    cityIds.reduce((a, id) => a + (pred(EV_CARD_BY_ID[id]) ? 1 : 0), 0);

  for (const id of cityIds) {
    switch (id) {
      case 'theater': prosperity += count((d) => d?.kind === 'critter' && d.rarity === 'unique'); break;
      case 'school': prosperity += count((d) => d?.kind === 'critter' && d.rarity === 'common'); break;
      case 'palace': prosperity += count((d) => d?.kind === 'construction' && d.rarity === 'unique'); break;
      case 'castle': prosperity += count((d) => d?.kind === 'construction' && d.rarity === 'common'); break;
      case 'ever-tree': prosperity += count((d) => d?.color === 'prosperity'); break;
      case 'king': prosperity += p.achievedBasic.length + 2 * p.achievedSpecial.length; break;
      case 'architect': prosperity += Math.min(6, p.res.resin + p.res.pebble); break;
      default: break;
    }
  }
  // Gatherer pair bonus (per paired gatherer; Archive p5)
  for (const cc of p.city) {
    const pair = (cc.card === 'gatherer' && cc.sharedWith === 'harvester') || (cc.card === 'harvester' && cc.sharedWith === 'gatherer');
    if (pair) prosperity += 3;
  }

  for (const w of p.workers) {
    if (w.loc.t === 'journey') journey += EV_JOURNEY_BY_ID[w.loc.id].points;
  }

  for (const id of p.achievedBasic) events += EV_BASIC_EVENT_BY_ID[id].points;
  for (const st of s.specialEvents) {
    if (st.claimedBy !== seat) continue;
    const def = EV_SPECIAL_BY_ID[st.id];
    if (def.points) events += def.points;
    const pp = def.pointsPer;
    if (pp) {
      switch (pp.what) {
        case 'cemetery-workers': {
          events += (pp.each ?? 0) * p.workers.filter((w) => w.permanent && w.loc.t === 'city' && cardAtLoc(s, w.loc) === 'cemetery').length;
          break;
        }
        case 'monastery-workers': {
          events += (pp.each ?? 0) * p.workers.filter((w) => w.permanent && w.loc.t === 'city' && cardAtLoc(s, w.loc) === 'monastery').length;
          break;
        }
        case 'dungeon-prisoners': {
          const dungeon = p.city.find((c) => c.card === 'dungeon');
          events += (pp.each ?? 0) * (dungeon?.prisoners.length ?? 0);
          break;
        }
        case 'chapel-points': {
          const chapel = p.city.find((c) => c.card === 'chapel');
          events += (pp.each ?? 0) * (chapel?.storedPoints ?? 0);
          break;
        }
        case 'stored-twig': events += (pp.each ?? 0) * st.storedRes.twig; break;
        case 'stored-berry': events += (pp.each ?? 0) * st.storedRes.berry; break;
        case 'stored-mixed':
          events += (pp.berryTwigEach ?? 0) * (st.storedRes.berry + st.storedRes.twig)
            + (pp.resinPebbleEach ?? 0) * (st.storedRes.resin + st.storedRes.pebble);
          break;
        case 'cards-beneath': events += (pp.each ?? 0) * st.beneath.length; break;
        case 'harvester-gatherer-pairs-all-cities': {
          let pairs = 0;
          for (const q of s.players) {
            for (const cc of q.city) {
              if ((cc.card === 'gatherer' && cc.sharedWith === 'harvester') || (cc.card === 'harvester' && cc.sharedWith === 'gatherer')) pairs++;
            }
          }
          events += (pp.each ?? 0) * pairs;
          break;
        }
        default: break;
      }
    }
  }

  return { total: cards + tokens + prosperity + journey + events, parts: { cards, tokens, prosperity, journey, events } };
}

function cardAtLoc(s: EverdellState, loc: EvLocRef & { t: 'city' }): string | null {
  return s.players[loc.seat]?.city.find((c) => c.uid === loc.uid)?.card ?? null;
}

function endGame(s: EverdellState): void {
  s.phase = 'ended';
  let best = -Infinity;
  for (const p of s.players) {
    const r = everdellScore(s, p.seat);
    p.score = r.total;
    p.scoreParts = r.parts;
    best = Math.max(best, r.total);
  }
  let top = s.players.filter((p) => p.score === best);
  if (top.length > 1) {
    const ev = (p: EverdellPlayer) => p.achievedBasic.length + p.achievedSpecial.length;
    const bestEv = Math.max(...top.map(ev));
    top = top.filter((p) => ev(p) === bestEv);
  }
  if (top.length > 1) {
    const left = (p: EverdellPlayer) => resTotal(p.res);
    const bestLeft = Math.max(...top.map(left));
    top = top.filter((p) => left(p) === bestLeft);
  }
  s.winners = top.map((p) => p.seat);
  evt(s, `${s.winners.map((w) => nameOf(s, w)).join(' · ')} WINS · ${best} POINTS`, 'win');
}

// ---------- turn flow ----------

/** After a main action fully resolves (queue drained), END TURN becomes the
 * only legal act — the owner's explicit-turnover rule; no silent advance. */
function finishIfIdle(s: EverdellState): void {
  if (s.pending.length > 0) return; // decisions still block
  if (s.phase !== 'playing') return;
  s.turnDone = true;
}

function advanceTurn(s: EverdellState): void {
  s.turnDone = false;
  if (s.players.every((p) => p.passed)) {
    endGame(s);
    return;
  }
  for (let step = 1; step <= s.players.length; step++) {
    const next = (s.turn + step) % s.players.length;
    if (!s.players[next].passed) {
      s.turn = next;
      evt(s, `${nameOf(s, next)} TO PLAY`, 'turn');
      return;
    }
  }
}

/** Does the seat have any legal act this turn? (pass legality in autumn) */
export function everdellHasAnyAction(s: EverdellState, seat: number): boolean {
  const p = s.players[seat];
  if (workersAvailable(p) > 0) {
    for (const l of EV_BASIC_LOCATIONS) if (!everdellCanPlace(s, seat, { t: 'basic', id: l.id })) return true;
    for (const f of s.forest) if (!everdellCanPlace(s, seat, { t: 'forest', id: f.id })) return true;
    if (!everdellCanPlace(s, seat, { t: 'haven' })) return true;
    for (const j of ['journey-2', 'journey-3', 'journey-4', 'journey-5']) if (!everdellCanPlace(s, seat, { t: 'journey', id: j })) return true;
    for (const q of s.players) {
      for (const cc of q.city) if (!everdellCanPlace(s, seat, { t: 'city', seat: q.seat, uid: cc.uid })) return true;
    }
    for (const e of s.basicEvents) if (!everdellCanPlace(s, seat, { t: 'basicEvent', id: e.id })) return true;
    for (const e of s.specialEvents) if (!everdellCanPlace(s, seat, { t: 'specialEvent', id: e.id })) return true;
  }
  // any playable card?
  for (const id of new Set([...p.hand, ...s.meadow.filter((m): m is string => !!m)])) {
    if (everdellCanPlayAnyhow(s, seat, id)) return true;
  }
  return false;
}

/** Can the card be played with at least one ability/payment? (no pendings) */
export function everdellCanPlayAnyhow(s: EverdellState, seat: number, cardId: string): boolean {
  const p = s.players[seat];
  const def = EV_CARD_BY_ID[cardId];
  if (!def) return false;
  if (def.id === 'fool') {
    return s.players.some((q) => q.seat !== seat
      && evCitySpaces(q.city) < EV_CITY_LIMIT && !evCityHas(q.city, 'fool'))
      && canPay(p, def.cost);
  }
  if (def.id === 'ruins') return cityRoomForRuins(p); // free; replaces a construction
  if (cityRoomFor(s, seat, def)) return false;
  if (canPay(p, def.cost)) return true;
  // free critter via occupied token / ever tree
  if (def.kind === 'critter') {
    for (const cc of p.city) {
      const host = EV_CARD_BY_ID[cc.card];
      if (!host || host.kind !== 'construction' || cc.occupiedUsed) continue;
      const links = host.link === 'harvester-gatherer' ? ['harvester', 'gatherer'] : [host.link];
      if (links.includes(def.id) || host.link === 'any') return true;
    }
    if (evCityHas(p.city, 'innkeeper')) {
      const c = { ...def.cost, berry: Math.max(0, def.cost.berry - 3) };
      if (canPay(p, c)) return true;
    }
  }
  if (def.kind === 'construction' && evCityHas(p.city, 'crane')) {
    // feasible iff the per-resource shortfalls sum to at most the 3 discount
    let cap = 3;
    let feasible = true;
    for (const r of EV_RESOURCES) {
      cap -= Math.max(0, def.cost[r] - p.res[r]);
      if (cap < 0) { feasible = false; break; }
    }
    if (feasible) return true;
  }
  if (def.kind === 'critter' && evCityHas(p.city, 'dungeon')) {
    const dungeon = p.city.find((c) => c.card === 'dungeon')!;
    const capCells = evCityHas(p.city, 'ranger') ? 2 : 1;
    if (dungeon.prisoners.length < capCells && p.city.some((c) => EV_CARD_BY_ID[c.card]?.kind === 'critter')) {
      let cap = 3;
      let feasible = true;
      for (const r of EV_RESOURCES) {
        const short = Math.max(0, def.cost[r] - p.res[r]);
        cap -= short;
        if (cap < 0) { feasible = false; break; }
      }
      if (feasible) return true;
    }
  }
  // judge: swap 1
  if (evCityHas(p.city, 'judge')) {
    for (const from of EV_RESOURCES) {
      if ((def.cost[from] ?? 0) < 1) continue;
      for (const to of EV_RESOURCES) {
        if (to === from) continue;
        const c = { ...def.cost };
        c[from] -= 1;
        c[to] += 1;
        if (canPay(p, c)) return true;
      }
    }
  }
  return false;
}

function cityRoomForRuins(p: EverdellPlayer): boolean {
  // Ruins replaces a construction, so the city never grows
  return p.city.some((c) => EV_CARD_BY_ID[c.card]?.kind === 'construction' && c.card !== 'ruins');
}

/** Client mirror of the city legality check (uniqueness + 15-space limit). */
export function everdellCityRoomFor(s: EverdellState, seat: number, def: EvCardDef): string | null {
  if (def.id === 'ruins') return cityRoomForRuins(s.players[seat]) ? null : 'no construction to ruin';
  return cityRoomFor(s, seat, def);
}

// ---------- the reducer ----------

export function applyEverdellAction(s: EverdellState, seat: number, a: EverdellAction): EverdellResult {
  if (s.phase !== 'playing') return err('game over');
  const p = s.players[seat];
  if (!p) return err('bad seat');

  if (a.type === 'choose') return resolveChoose(s, seat, a);

  if (s.pending.length > 0) return err('resolve the pending decision first');
  if (s.turn !== seat) return err('not your turn');
  if (p.passed) return err('you have passed');

  if (a.type === 'end_turn') {
    if (!s.turnDone) return err('take an action first');
    advanceTurn(s);
    return { ok: true };
  }
  if (s.turnDone) return err('your turn is over, press End Turn');

  switch (a.type) {
    case 'place_worker': {
      if (workersAvailable(p) < 1) return err('no workers available');
      const why = everdellCanPlace(s, seat, a.loc);
      if (why) return err(why);
      const permanent = a.loc.t === 'journey'
        || (a.loc.t === 'city' && EV_CARD_BY_ID[cardAtLoc(s, a.loc as EvLocRef & { t: 'city' }) ?? '']?.permanentSpot === true);
      p.workers.push({ loc: a.loc, permanent });
      evt(s, `${nameOf(s, seat)} PLACES A WORKER · ${locLabel(s, a.loc)}`, 'place');
      resolveWorkerEffect(s, seat, a.loc);
      finishIfIdle(s);
      return { ok: true };
    }

    case 'play_card': {
      const def = EV_CARD_BY_ID[a.card];
      if (!def) return err('unknown card');
      if (a.source === 'hand') {
        if (!p.hand.includes(a.card)) return err('card not in your hand');
      } else {
        if (a.meadowIndex === undefined || s.meadow[a.meadowIndex] !== a.card) return err('card not in the Meadow');
      }
      const ability: EvPlayAbility = a.ability ?? { kind: 'none' };
      // Fool
      if (def.id === 'fool') {
        if (a.foolTarget === undefined) return err('choose an opponent for the Fool');
        const q = s.players[a.foolTarget];
        if (!q || q.seat === seat) return err('the Fool goes to an opponent');
        if (evCityHas(q.city, 'fool')) return err('they already host a Fool');
        if (evCitySpaces(q.city) >= EV_CITY_LIMIT) return err('their city is full');
        const cost = everdellPlayCost(p, def, ability);
        if (!cost) return err('that ability does not apply');
        if (!canPay(p, cost)) return err('not enough resources');
        pay(p, cost);
        applyAbilitySideEffects(s, seat, ability);
        takeCardFromSource(s, p, a);
        addToCity(s, a.foolTarget, 'fool');
        evt(s, `${nameOf(s, seat)} SENDS THE FOOL TO ${nameOf(s, a.foolTarget)}`, 'play');
        afterCardPlayed(s, seat, def, a.source);
        return { ok: true };
      }
      // Ruins replaces a construction
      if (def.id === 'ruins') {
        if (!cityRoomForRuins(p)) return err('no construction to ruin');
        takeCardFromSource(s, p, a);
        s.pending.push({ kind: 'ruins-target', seat, ruinsUid: -1 });
        evt(s, `${nameOf(s, seat)} PLAYS ${cardName(def.id)}`, 'play');
        afterCardPlayed(s, seat, def, a.source);
        return { ok: true };
      }
      const roomWhy = cityRoomFor(s, seat, def);
      if (roomWhy) return err(roomWhy);
      const cost = everdellPlayCost(p, def, ability);
      if (cost === null) return err('that ability does not apply');
      if (!canPay(p, cost)) return err('not enough resources');
      // Shepherd: cost goes to a chosen opponent (Archive p7)
      if (def.costToOpponent && resTotal(cost) > 0) {
        if (a.payTo === undefined || !s.players[a.payTo] || a.payTo === seat) return err('choose an opponent to pay');
        pay(p, cost);
        gain(s.players[a.payTo], cost);
      } else {
        pay(p, cost);
      }
      applyAbilitySideEffects(s, seat, ability);
      markOccupied(s, seat, ability);
      takeCardFromSource(s, p, a);
      const cc = addToCity(s, seat, def.id);
      evt(s, `${nameOf(s, seat)} PLAYS ${cardName(def.id)}`, 'play');
      onPlayEffect(s, seat, cc, def);
      afterCardPlayed(s, seat, def, a.source);
      return { ok: true };
    }

    case 'prepare': {
      if (p.season === 'autumn') return err('autumn is the last season, pass instead');
      startPrepare(s, seat);
      finishIfIdle(s);
      return { ok: true };
    }

    case 'pass': {
      if (p.season !== 'autumn') return err('you can only pass in autumn');
      p.passed = true;
      evt(s, `${nameOf(s, seat)} PASSES FOR THE WINTER`, 'pass');
      advanceTurn(s); // pass is itself the explicit turnover
      return { ok: true };
    }

    default:
      return err('unknown action');
  }
}

function locLabel(s: EverdellState, loc: EvLocRef): string {
  switch (loc.t) {
    case 'basic': {
      const g = EV_BASIC_LOC_BY_ID[loc.id].gain;
      return Object.entries(g).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(' + ');
    }
    case 'forest': return 'FOREST';
    case 'haven': return 'HAVEN';
    case 'journey': return `JOURNEY ${EV_JOURNEY_BY_ID[loc.id].points}`;
    case 'city': {
      const id = cardAtLoc(s, loc);
      return id ? cardName(id) : 'CITY';
    }
    case 'basicEvent': return EV_BASIC_EVENT_BY_ID[loc.id].name.toUpperCase();
    case 'specialEvent': return EV_SPECIAL_BY_ID[loc.id].name.toUpperCase();
  }
}

function takeCardFromSource(s: EverdellState, p: EverdellPlayer, a: { source: 'hand' | 'meadow'; card: string; meadowIndex?: number }): void {
  if (a.source === 'hand') {
    p.hand.splice(p.hand.indexOf(a.card), 1);
  } else {
    s.meadow[a.meadowIndex!] = null;
    replenishMeadow(s);
  }
}

function applyAbilitySideEffects(s: EverdellState, seat: number, ability: EvPlayAbility): void {
  const p = s.players[seat];
  if (ability.kind === 'innkeeper' || ability.kind === 'crane') {
    const cc = removeFromCity(p, ability.uid);
    if (cc) s.discard.push(cc.card);
  }
  if (ability.kind === 'dungeon') {
    const dungeon = p.city.find((c) => c.uid === ability.uid);
    const prisoner = removeFromCity(p, ability.prisonerUid);
    if (dungeon && prisoner) dungeon.prisoners.push(prisoner.card);
  }
}

function markOccupied(s: EverdellState, seat: number, ability: EvPlayAbility): void {
  const p = s.players[seat];
  if (ability.kind === 'occupied' || ability.kind === 'evertree') {
    const cc = p.city.find((c) => c.uid === ability.uid);
    if (cc) cc.occupiedUsed = true;
  }
}

function afterCardPlayed(s: EverdellState, seat: number, def: EvCardDef, source: 'hand' | 'meadow'): void {
  playTriggers(s, seat, def);
  void source;
  finishIfIdle(s);
}

// ---------- choose (pending resolution) ----------

type Choose = { type: 'choose'; [k: string]: unknown };

function resolveChoose(s: EverdellState, seat: number, a: Choose): EverdellResult {
  const head = s.pending[0];
  if (!head) return err('nothing to decide');
  if (head.seat !== seat) return err('not your decision');
  const p = s.players[seat];

  const done = () => {
    s.pending.shift();
    finishIfIdle(s);
    return { ok: true } as EverdellResult;
  };

  switch (head.kind) {
    case 'gain-any': {
      const gains = a.gains as EvResMap | undefined;
      if (!gains || resTotal(gains) !== head.n) return err(`choose ${head.n} resources`);
      gain(p, gains);
      return done();
    }
    case 'storehouse': {
      const pick = a.pick as string;
      const sets: Record<string, EvResMap> = { twig: { twig: 3 }, resin: { resin: 2 }, pebble: { pebble: 1 }, berry: { berry: 2 } };
      const set = sets[pick];
      if (!set) return err('choose twig, resin, pebble or berry');
      const cc = p.city.find((c) => c.uid === head.uid);
      if (cc) for (const r of EV_RESOURCES) cc.storedRes[r] += set[r] ?? 0;
      return done();
    }
    case 'pay-per-point': {
      const n = Number(a.n ?? 0);
      if (!Number.isInteger(n) || n < 0 || n > head.max) return err(`pay 0 to ${head.max}`);
      if (p.res[head.resource] < n) return err(`not enough ${head.resource}`);
      p.res[head.resource] -= n;
      p.points += n;
      if (n > 0) evt(s, `${nameOf(s, seat)} GAINS ${n} POINT${n > 1 ? 'S' : ''} · ${head.reason}`, 'gain');
      return done();
    }
    case 'peddler': {
      const give = (a.give ?? {}) as EvResMap;
      const get = (a.get ?? {}) as EvResMap;
      const n = resTotal(give);
      if (n > head.max) return err(`trade up to ${head.max}`);
      if (resTotal(get) !== n) return err('trade equal amounts');
      if (!canPay(p, give)) return err('not enough resources');
      pay(p, give);
      gain(p, get);
      return done();
    }
    case 'monk-give': {
      const n = Number(a.n ?? 0);
      const to = Number(a.to);
      if (n === 0) return done();
      if (!Number.isInteger(n) || n < 0 || n > head.max) return err('give up to 2 berries');
      if (!s.players[to] || to === seat) return err('choose an opponent');
      if (p.res.berry < n) return err('not enough berries');
      p.res.berry -= n;
      s.players[to].res.berry += n;
      p.points += 2 * n;
      return done();
    }
    case 'chip-sweep': {
      const uid = Number(a.uid);
      const target = p.city.find((c) => c.uid === uid);
      const id = String(a.card ?? target?.card ?? '');
      if (!target) return err('choose a production card in your city');
      const ids = [target.card, ...(target.sharedWith ? [target.sharedWith] : [])];
      if (!ids.includes(id) || EV_CARD_BY_ID[id]?.color !== 'production') return err('not a production card');
      if (id === 'chip-sweep') return err('the Chip Sweep cannot activate itself');
      s.pending.shift();
      activateProduction(s, seat, target, id);
      finishIfIdle(s);
      return { ok: true };
    }
    case 'miner-mole': {
      const oseat = Number(a.seat);
      const uid = Number(a.uid);
      const q = s.players[oseat];
      if (!q || oseat === seat) return err('choose an opponent card');
      const target = q.city.find((c) => c.uid === uid);
      if (!target) return err('card not found');
      const id = String(a.card ?? target.card);
      const ids = [target.card, ...(target.sharedWith ? [target.sharedWith] : [])];
      if (!ids.includes(id) || EV_CARD_BY_ID[id]?.color !== 'production') return err('not a production card');
      if (id === 'storehouse' || id === 'miner-mole') return err('the Miner Mole cannot copy that');
      s.pending.shift();
      // value determined by the opponent's city (Archive p6): activate against
      // a virtual context — implemented by evaluating counts on q but gains to p.
      activateCopiedProduction(s, seat, oseat, id);
      finishIfIdle(s);
      return { ok: true };
    }
    case 'teacher-give': {
      const keep = String(a.keep);
      const to = Number(a.to);
      if (!head.cards.includes(keep)) return err('keep one of the drawn cards');
      if (!s.players[to] || to === seat) return err('choose an opponent');
      const other = head.cards.find((c) => c !== keep) ?? null;
      if (p.hand.length < EV_HAND_LIMIT) p.hand.push(keep); else s.discard.push(keep);
      if (other) {
        const q = s.players[to];
        if (q.hand.length < EV_HAND_LIMIT && !q.passed) q.hand.push(other); else s.discard.push(other);
      }
      return done();
    }
    case 'harvester-any': {
      const gains = a.gains as EvResMap | undefined;
      if (!gains || resTotal(gains) !== head.n) return err(`choose ${head.n} resource`);
      gain(p, gains);
      return done();
    }
    case 'courthouse': {
      const pick = String(a.pick);
      if (!['twig', 'resin', 'pebble'].includes(pick)) return err('choose twig, resin or pebble');
      gain(p, { [pick]: 1 } as EvResMap);
      return done();
    }
    case 'bard-discard': {
      const uids = (a.cards ?? []) as string[];
      if (!Array.isArray(uids) || uids.length > head.max) return err(`discard up to ${head.max}`);
      if (!removeHandCards(p, uids)) return err('cards not in hand');
      s.discard.push(...uids);
      p.points += uids.length;
      return done();
    }
    case 'ruins-target': {
      const uid = Number(a.uid);
      const target = p.city.find((c) => c.uid === uid);
      if (!target || EV_CARD_BY_ID[target.card]?.kind !== 'construction' || target.card === 'ruins') {
        return err('choose a construction to ruin');
      }
      const idx = p.city.indexOf(target);
      const removed = removeFromCity(p, uid)!;
      s.discard.push(removed.card);
      const def = EV_CARD_BY_ID[removed.card]!;
      gain(p, def.cost);
      // workers on the ruined card move onto the Ruins (Archive p13)
      const ruins: EvCityCard = {
        uid: s.nextUid++, card: 'ruins', sharedWith: null, sharedUid: null,
        occupiedUsed: false, storedPoints: 0, storedRes: evZeroRes(), prisoners: [],
      };
      p.city.splice(Math.min(idx, p.city.length), 0, ruins);
      for (const q of s.players) {
        for (const w of q.workers) {
          if (w.loc.t === 'city' && w.loc.seat === seat && w.loc.uid === uid) w.loc = { t: 'city', seat, uid: ruins.uid };
        }
      }
      drawCards(s, p, 2);
      return done();
    }
    case 'fool-target':
      return err('unused');
    case 'pigeon-play': {
      const pick = a.pick === null ? null : String(a.pick);
      s.pending.shift();
      if (pick !== null) {
        const def = EV_CARD_BY_ID[pick];
        if (!head.revealed.includes(pick) || !def) return pendingRestore(s, head, 'pick a revealed card');
        if (def.points > 3) return pendingRestore(s, head, 'card must be worth up to 3');
        if (cityRoomFor(s, seat, def)) return pendingRestore(s, head, 'no room for that card');
        const rest = head.revealed.filter((c) => c !== pick);
        s.discard.push(...rest);
        const cc = addToCity(s, seat, def.id);
        evt(s, `${nameOf(s, seat)} PLAYS ${cardName(def.id)} · POSTAL PIGEON`, 'play');
        onPlayEffect(s, seat, cc, def);
        playTriggers(s, seat, def);
      } else {
        s.discard.push(...head.revealed);
      }
      finishIfIdle(s);
      return { ok: true };
    }
    case 'ranger-move': {
      if (a.skip === true) return done();
      const from = a.from as EvLocRef | undefined;
      const to = a.to as EvLocRef | undefined;
      if (!from || !to) return err('choose a worker and a destination');
      const w = p.workers.find((x) => sameLoc(x.loc, from) && !x.permanent);
      if (!w) return err('no movable worker there');
      // temporarily lift the worker, then validate the target
      p.workers = p.workers.filter((x) => x !== w);
      const why = everdellCanPlace(s, seat, to);
      if (why) {
        p.workers.push(w);
        return err(why);
      }
      const permanent = to.t === 'journey'
        || (to.t === 'city' && EV_CARD_BY_ID[cardAtLoc(s, to as EvLocRef & { t: 'city' }) ?? '']?.permanentSpot === true);
      p.workers.push({ loc: to, permanent });
      s.pending.shift();
      evt(s, `${nameOf(s, seat)} MOVES A WORKER · ${locLabel(s, to)}`, 'place');
      resolveWorkerEffect(s, seat, to);
      finishIfIdle(s);
      return { ok: true };
    }
    case 'undertaker-discard': {
      const picks = (a.cards ?? []) as number[];
      if (!Array.isArray(picks) || picks.length !== Math.min(3, s.meadow.filter((m) => m).length)) return err('discard 3 Meadow cards');
      const idxs = [...new Set(picks.map(Number))];
      if (idxs.length !== picks.length || idxs.some((i) => !s.meadow[i])) return err('bad meadow picks');
      for (const i of idxs) {
        s.discard.push(s.meadow[i]!);
        s.meadow[i] = null;
      }
      replenishMeadow(s);
      s.pending.shift();
      if (s.meadow.some((m) => m) && p.hand.length < EV_HAND_LIMIT) {
        s.pending.unshift({ kind: 'undertaker-draw', seat });
      }
      finishIfIdle(s);
      return { ok: true };
    }
    case 'undertaker-draw': {
      const i = Number(a.index);
      if (!s.meadow[i]) return err('pick a meadow card');
      if (p.hand.length < EV_HAND_LIMIT) p.hand.push(s.meadow[i]!);
      else s.discard.push(s.meadow[i]!);
      s.meadow[i] = null;
      replenishMeadow(s);
      return done();
    }
    case 'haven': {
      const cards = (a.cards ?? []) as string[];
      const gains = (a.gains ?? {}) as EvResMap;
      if (!Array.isArray(cards) || cards.length < 1) return err('discard at least 1 card');
      if (resTotal(gains) !== Math.floor(cards.length / 2)) return err('gain 1 per 2 discarded');
      if (!removeHandCards(p, cards)) return err('cards not in hand');
      s.discard.push(...cards);
      gain(p, gains);
      return done();
    }
    case 'journey-discard': {
      const cards = (a.cards ?? []) as string[];
      if (!Array.isArray(cards) || cards.length !== head.n) return err(`discard ${head.n} cards`);
      if (!removeHandCards(p, cards)) return err('cards not in hand');
      s.discard.push(...cards);
      evt(s, `${nameOf(s, seat)} SETS OUT ON THE JOURNEY · ${head.n} POINTS`, 'place');
      return done();
    }
    case 'copy-basic': {
      const id = String(a.id);
      const def = EV_BASIC_LOC_BY_ID[id];
      if (!def) {
        if (head.allowForest) {
          const f = s.forest.find((x) => x.id === id);
          if (f) {
            s.pending.shift();
            applyForestLocation(s, seat, id);
            if (head.draw > 0) drawCards(s, p, head.draw);
            finishIfIdle(s);
            return { ok: true };
          }
        }
        return err('choose a location to copy');
      }
      s.pending.shift();
      applyBasicLocation(s, seat, id);
      if (head.draw > 0) drawCards(s, p, head.draw);
      finishIfIdle(s);
      return { ok: true };
    }
    case 'meadow2-draw': {
      const picks = (a.cards ?? []) as number[];
      const n = Math.min(2, s.meadow.filter((m) => m).length, EV_HAND_LIMIT - p.hand.length);
      if (!Array.isArray(picks) || picks.length !== n) return err(`draw ${n} meadow cards`);
      const idxs = [...new Set(picks.map(Number))];
      if (idxs.length !== picks.length || idxs.some((i) => !s.meadow[i])) return err('bad meadow picks');
      const drawn: string[] = [];
      for (const i of idxs) {
        drawn.push(s.meadow[i]!);
        p.hand.push(s.meadow[i]!);
        s.meadow[i] = null;
      }
      replenishMeadow(s);
      s.pending.shift();
      s.pending.unshift({ kind: 'play-discounted', seat, discount: 1, from: 'hand', fromCards: drawn, maxPoints: null, free: false, reason: 'FOREST', optional: true });
      finishIfIdle(s);
      return { ok: true };
    }
    case 'play-discounted': {
      if (a.skip === true) {
        if (!head.optional) return err('you must play a card');
        return done();
      }
      const pick = String(a.card);
      const from = head.fromCards ?? [
        ...(head.from !== 'meadow' ? p.hand : []),
        ...(head.from !== 'hand' ? s.meadow.filter((m): m is string => !!m) : []),
      ];
      if (!from.includes(pick)) return err('pick an eligible card');
      const def = EV_CARD_BY_ID[pick];
      if (!def) return err('unknown card');
      if (head.maxPoints !== null && def.points > head.maxPoints) return err(`card must be worth up to ${head.maxPoints}`);
      const roomWhy = cityRoomFor(s, seat, def);
      if (roomWhy) return err(roomWhy);
      let cost: EvResMap = {};
      if (!head.free) {
        const discount = (a.discount ?? {}) as EvResMap;
        if (resTotal(discount) > head.discount) return err(`discount is up to ${head.discount}`);
        const c = applyDiscount({ ...def.cost }, discount, head.discount);
        if (!c) return err('bad discount');
        cost = c;
      }
      if (!canPay(p, cost)) return err('not enough resources');
      pay(p, cost);
      // remove from its zone (hand first, then the Meadow)
      const hi = p.hand.indexOf(pick);
      if (hi >= 0 && head.from !== 'meadow') {
        p.hand.splice(hi, 1);
      } else {
        const i = s.meadow.indexOf(pick);
        if (i >= 0) {
          s.meadow[i] = null;
          replenishMeadow(s);
        } else if (hi >= 0) {
          p.hand.splice(hi, 1);
        }
      }
      s.pending.shift();
      const cc = addToCity(s, seat, def.id);
      evt(s, `${nameOf(s, seat)} PLAYS ${cardName(def.id)} · ${head.reason}`, 'play');
      onPlayEffect(s, seat, cc, def);
      playTriggers(s, seat, def);
      finishIfIdle(s);
      return { ok: true };
    }
    case 'inn-play': {
      const pick = String(a.card);
      const i = s.meadow.indexOf(pick);
      if (i < 0) return err('pick a Meadow card');
      const def = EV_CARD_BY_ID[pick];
      if (!def) return err('unknown card');
      const roomWhy = cityRoomFor(s, seat, def);
      if (roomWhy) return err(roomWhy);
      const discount = (a.discount ?? {}) as EvResMap;
      if (resTotal(discount) > 3) return err('discount is up to 3');
      const cost = applyDiscount({ ...def.cost }, discount, 3);
      if (!cost) return err('bad discount');
      if (!canPay(p, cost)) return err('not enough resources');
      pay(p, cost);
      s.meadow[i] = null;
      replenishMeadow(s);
      s.pending.shift();
      const cc = addToCity(s, seat, def.id);
      evt(s, `${nameOf(s, seat)} PLAYS ${cardName(def.id)} · INN`, 'play');
      onPlayEffect(s, seat, cc, def);
      playTriggers(s, seat, def);
      finishIfIdle(s);
      return { ok: true };
    }
    case 'post-office-give': {
      const to = Number(a.to);
      const cards = (a.cards ?? []) as string[];
      const q = s.players[to];
      if (!q || to === seat) return err('choose an opponent');
      if (!Array.isArray(cards) || cards.length !== Math.min(2, p.hand.length)) return err('give 2 cards');
      if (!removeHandCards(p, cards)) return err('cards not in hand');
      for (const c of cards) {
        if (q.hand.length < EV_HAND_LIMIT && !q.passed) q.hand.push(c);
        else s.discard.push(c);
      }
      s.pending.shift();
      s.pending.unshift({ kind: 'post-office-redraw', seat });
      finishIfIdle(s);
      return { ok: true };
    }
    case 'post-office-redraw': {
      const cards = (a.cards ?? []) as string[];
      if (!Array.isArray(cards)) return err('choose discards');
      if (!removeHandCards(p, cards)) return err('cards not in hand');
      s.discard.push(...cards);
      drawCards(s, p, EV_HAND_LIMIT - p.hand.length);
      return done();
    }
    case 'university-target': {
      const uid = Number(a.uid);
      const target = p.city.find((c) => c.uid === uid);
      if (!target) return err('choose a card in your city');
      if (target.card === 'university') return err('the University cannot discard itself');
      const removed = removeFromCity(p, uid)!;
      s.discard.push(removed.card);
      for (const pr of removed.prisoners) s.discard.push(pr);
      const def = EV_CARD_BY_ID[removed.card]!;
      gain(p, def.cost);
      p.points += 1;
      // workers on the removed card: permanent are lost, others go on University (Archive p13)
      for (const q of s.players) {
        q.workers = q.workers.filter((w) => {
          if (w.loc.t === 'city' && w.loc.seat === seat && w.loc.uid === uid) {
            if (w.permanent) {
              if (!q.passed) q.workersTotal -= 1; // removed from the game
              return false;
            }
            const uni = p.city.find((c) => c.card === 'university');
            if (uni) w.loc = { t: 'city', seat, uid: uni.uid };
          }
          return true;
        });
      }
      s.pending.shift();
      s.pending.unshift({ kind: 'gain-any', seat, n: 1, reason: 'UNIVERSITY' });
      finishIfIdle(s);
      return { ok: true };
    }
    case 'monastery-give': {
      const to = Number(a.to);
      const give = (a.give ?? {}) as EvResMap;
      const q = s.players[to];
      if (!q || to === seat) return err('choose an opponent');
      if (resTotal(give) !== 2) return err('give 2 resources');
      if (!canPay(p, give)) return err('not enough resources');
      pay(p, give);
      gain(q, give);
      p.points += 4;
      return done();
    }
    case 'cemetery-source': {
      const source = String(a.source);
      if (source !== 'deck' && source !== 'discard') return err('choose deck or discard');
      const pool = source === 'deck' ? s.deck : s.discard;
      if (pool.length === 0) return err(`the ${source} is empty`);
      const revealed: string[] = [];
      for (let i = 0; i < 4 && pool.length > 0; i++) revealed.push(pool.pop()!);
      s.pending.shift();
      s.pending.unshift({ kind: 'cemetery-play', seat, revealed });
      finishIfIdle(s);
      return { ok: true };
    }
    case 'cemetery-play': {
      const pick = a.pick === null ? null : String(a.pick);
      s.pending.shift();
      if (pick !== null) {
        const def = EV_CARD_BY_ID[pick];
        if (!head.revealed.includes(pick) || !def) return pendingRestore(s, head, 'pick a revealed card');
        if (cityRoomFor(s, seat, def)) return pendingRestore(s, head, 'no room for that card');
        s.discard.push(...head.revealed.filter((c) => c !== pick));
        const cc = addToCity(s, seat, def.id);
        evt(s, `${nameOf(s, seat)} PLAYS ${cardName(def.id)} · CEMETERY`, 'play');
        onPlayEffect(s, seat, cc, def);
        playTriggers(s, seat, def);
      } else {
        s.discard.push(...head.revealed);
      }
      finishIfIdle(s);
      return { ok: true };
    }
    case 'clock-tower': {
      if (a.skip === true) {
        s.pending.shift();
        finishPrepare(s, seat);
        finishIfIdle(s);
        return { ok: true };
      }
      const loc = a.loc as EvLocRef | undefined;
      if (!loc || (loc.t !== 'basic' && loc.t !== 'forest')) return err('choose a basic or forest location');
      if (!p.workers.some((w) => sameLoc(w.loc, loc))) return err('you have no worker there');
      const tower = p.city.find((c) => c.uid === head.uid);
      if (!tower || tower.storedPoints < 1) return err('no points on the Clock Tower');
      tower.storedPoints -= 1;
      s.pending.shift();
      if (loc.t === 'basic') applyBasicLocation(s, seat, loc.id);
      else applyForestLocation(s, seat, loc.id);
      finishPrepare(s, seat);
      finishIfIdle(s);
      return { ok: true };
    }
    case 'summer-meadow': {
      if (a.skip === true) return done();
      const i = Number(a.index);
      if (!s.meadow[i]) return err('pick a meadow card');
      if (p.hand.length >= EV_HAND_LIMIT) return done();
      p.hand.push(s.meadow[i]!);
      s.meadow[i] = null;
      replenishMeadow(s);
      const remaining = head.remaining - 1;
      s.pending.shift();
      if (remaining > 0 && s.meadow.some((m) => m) && p.hand.length < EV_HAND_LIMIT) {
        s.pending.unshift({ kind: 'summer-meadow', seat, remaining });
      }
      finishIfIdle(s);
      return { ok: true };
    }
    case 'discard-any-draw': {
      const cards = (a.cards ?? []) as string[];
      if (!Array.isArray(cards) || cards.length < 1) return err('discard at least 1');
      if (!removeHandCards(p, cards)) return err('cards not in hand');
      s.discard.push(...cards);
      drawCards(s, p, cards.length * 2);
      return done();
    }
    case 'discard-up-to-3-any': {
      const cards = (a.cards ?? []) as string[];
      if (!Array.isArray(cards) || cards.length < 1 || cards.length > 3) return err('discard 1 to 3 cards');
      if (!removeHandCards(p, cards)) return err('cards not in hand');
      s.discard.push(...cards);
      s.pending.shift();
      s.pending.unshift({ kind: 'gain-any', seat, n: cards.length, reason: 'FOREST' });
      finishIfIdle(s);
      return { ok: true };
    }
    case 'fireworks-twigs': {
      const n = Math.min(Number(a.n ?? 0), 3, p.res.twig);
      if (n < 0 || !Number.isInteger(Number(a.n ?? 0))) return err('place 0 to 3 twigs');
      p.res.twig -= n;
      const st = s.specialEvents.find((e) => e.id === head.eventId)!;
      st.storedRes.twig += n;
      return done();
    }
    case 'performer-berries': {
      const n = Math.min(Number(a.n ?? 0), 3, p.res.berry);
      if (n < 0 || !Number.isInteger(Number(a.n ?? 0))) return err('place 0 to 3 berries');
      p.res.berry -= n;
      const st = s.specialEvents.find((e) => e.id === head.eventId)!;
      st.storedRes.berry += n;
      return done();
    }
    case 'new-management': {
      const place = (a.place ?? {}) as EvResMap;
      if (resTotal(place) > 3) return err('place up to 3 resources');
      if (!canPay(p, place)) return err('not enough resources');
      pay(p, place);
      const st = s.specialEvents.find((e) => e.id === head.eventId)!;
      for (const r of EV_RESOURCES) st.storedRes[r] += place[r] ?? 0;
      return done();
    }
    case 'acorn-thieves': {
      const uids = (a.uids ?? []) as number[];
      if (!Array.isArray(uids) || uids.length > 2) return err('choose up to 2 critters');
      const st = s.specialEvents.find((e) => e.id === head.eventId)!;
      for (const uid of uids.map(Number)) {
        const cc = p.city.find((c) => c.uid === uid);
        if (!cc) return err('card not in your city');
        const isCritterMain = EV_CARD_BY_ID[cc.card]?.kind === 'critter';
        if (!isCritterMain) return err('choose critters');
      }
      for (const uid of uids.map(Number)) {
        const removed = removeFromCity(p, uid);
        if (removed) st.beneath.push(removed.card);
      }
      return done();
    }
    case 'graduation': {
      const cards = (a.cards ?? []) as string[];
      if (!Array.isArray(cards) || cards.length > 3) return err('choose up to 3 critters');
      if (cards.some((c) => EV_CARD_BY_ID[c]?.kind !== 'critter')) return err('choose critters');
      if (!removeHandCards(p, cards)) return err('cards not in hand');
      const st = s.specialEvents.find((e) => e.id === head.eventId)!;
      st.beneath.push(...cards);
      return done();
    }
    case 'ancient-scrolls': {
      const keep = (a.keep ?? []) as string[];
      if (!Array.isArray(keep)) return err('choose cards to draw');
      const counts = new Map<string, number>();
      for (const c of head.revealed) counts.set(c, (counts.get(c) ?? 0) + 1);
      for (const c of keep) {
        const left = counts.get(c) ?? 0;
        if (left <= 0) return err('pick revealed cards');
        counts.set(c, left - 1);
      }
      const st = s.specialEvents.find((e) => e.id === head.eventId)!;
      for (const c of keep) {
        if (p.hand.length < EV_HAND_LIMIT) p.hand.push(c);
        else st.beneath.push(c);
      }
      for (const [c, n] of counts) for (let i = 0; i < n; i++) st.beneath.push(c);
      return done();
    }
    case 'marketing-plan': {
      const gives = (a.gives ?? []) as { to: number; res: EvResMap }[];
      if (!Array.isArray(gives)) return err('choose donations');
      let total = 0;
      const combined = evZeroRes();
      for (const g of gives) {
        const q = s.players[Number(g.to)];
        if (!q || Number(g.to) === seat) return err('donate to opponents');
        total += resTotal(g.res ?? {});
        for (const r of EV_RESOURCES) combined[r] += (g.res?.[r] ?? 0);
      }
      if (total > 3) return err('donate up to 3 resources');
      if (!canPay(p, combined)) return err('not enough resources');
      for (const g of gives) {
        pay(p, g.res);
        gain(s.players[Number(g.to)], g.res);
      }
      p.points += 2 * total;
      return done();
    }
    case 'croak-city-discard': {
      const uids = (a.uids ?? []) as number[];
      const need = Math.min(2, p.city.length);
      if (!Array.isArray(uids) || uids.length !== need) return err(`discard ${need} city cards`);
      for (const uid of uids.map(Number)) {
        if (!p.city.some((c) => c.uid === uid)) return err('card not in your city');
      }
      for (const uid of uids.map(Number)) {
        const removed = removeFromCity(p, uid);
        if (removed) {
          s.discard.push(removed.card);
          for (const pr of removed.prisoners) s.discard.push(pr);
        }
      }
      return done();
    }
    case 'well-run-city': {
      const from = a.from as EvLocRef | undefined;
      if (!from) return err('choose a worker to bring back');
      const w = p.workers.find((x) => sameLoc(x.loc, from) && !x.permanent);
      if (!w) return err('no worker there');
      p.workers = p.workers.filter((x) => x !== w);
      return done();
    }
    case 'shepherd-pay':
      return err('unused');
    default:
      return err('unknown decision');
  }
}

/** Copy a production card as the Miner Mole: counts read the opponent's city. */
function activateCopiedProduction(s: EverdellState, seat: number, oseat: number, id: string): void {
  const p = s.players[seat];
  const q = s.players[oseat];
  switch (id) {
    case 'farm': gain(p, { berry: 1 }); break;
    case 'mine': gain(p, { pebble: 1 }); break;
    case 'resin-refinery': gain(p, { resin: 1 }); break;
    case 'twig-barge': gain(p, { twig: 2 }); break;
    case 'general-store': gain(p, { berry: evCityCount(q.city, 'farm') > 0 ? 2 : 1 }); break;
    case 'fairgrounds': drawCards(s, p, 2); break;
    case 'barge-toad': gain(p, { twig: 2 * evCityCount(q.city, 'farm') }); break;
    case 'woodcarver': if (p.res.twig > 0) s.pending.push({ kind: 'pay-per-point', seat, resource: 'twig', max: 3, reason: 'MINER MOLE' }); break;
    case 'doctor': if (p.res.berry > 0) s.pending.push({ kind: 'pay-per-point', seat, resource: 'berry', max: 3, reason: 'MINER MOLE' }); break;
    case 'peddler': if (resTotal(p.res) > 0) s.pending.push({ kind: 'peddler', seat, max: 2 }); break;
    case 'monk': if (p.res.berry > 0 && s.players.length > 1) s.pending.push({ kind: 'monk-give', seat, max: 2 }); break;
    case 'chip-sweep': s.pending.push({ kind: 'chip-sweep', seat }); break;
    case 'teacher': {
      const drawn: string[] = [];
      for (let i = 0; i < 2; i++) {
        const c = drawFromDeck(s);
        if (c) drawn.push(c);
      }
      if (drawn.length <= 1) {
        for (const c of drawn) if (p.hand.length < EV_HAND_LIMIT) p.hand.push(c); else s.discard.push(c);
      } else {
        s.pending.push({ kind: 'teacher-give', seat, cards: drawn });
      }
      break;
    }
    case 'harvester': {
      const paired = q.city.some((c) =>
        (c.card === 'harvester' && c.sharedWith === 'gatherer') || (c.card === 'gatherer' && c.sharedWith === 'harvester'));
      if (paired && evCityCount(q.city, 'farm') > 0) s.pending.push({ kind: 'harvester-any', seat, n: 1 });
      break;
    }
    default: break;
  }
}

function pendingRestore(s: EverdellState, head: EvPending, msg: string): EverdellResult {
  s.pending.unshift(head);
  return err(msg);
}

function removeHandCards(p: EverdellPlayer, cards: string[]): boolean {
  const hand = [...p.hand];
  for (const c of cards) {
    const i = hand.indexOf(c);
    if (i < 0) return false;
    hand.splice(i, 1);
  }
  p.hand = hand;
  return true;
}

// ---------- bot ----------

/** Greedy CPU: resolve pendings sensibly, else play/place/prepare/pass. */
export function everdellBotAction(s: EverdellState, seat: number): EverdellAction | null {
  const p = s.players[seat];
  const head = s.pending[0];
  if (head && head.seat === seat) return botChoose(s, seat, head);
  if (head) return null;
  if (s.turn !== seat || p.passed) return null;
  if (s.turnDone) return { type: 'end_turn' };

  // 1. play the highest-point affordable card (hand first, then meadow)
  let best: { action: EverdellAction; score: number } | null = null;
  const consider = (source: 'hand' | 'meadow', card: string, meadowIndex?: number) => {
    const def = EV_CARD_BY_ID[card];
    if (!def || def.id === 'fool' || def.id === 'ruins') return;
    if (cityRoomFor(s, seat, def)) return;
    if (!canPay(p, def.cost)) return;
    const score = def.points + (def.color === 'production' ? 1.5 : 0) + (def.kind === 'construction' ? 0.5 : 0);
    if (!best || score > best.score) {
      best = { action: { type: 'play_card', source, card, meadowIndex, payTo: def.costToOpponent ? (seat + 1) % s.players.length : undefined }, score };
    }
  };
  for (const c of p.hand) consider('hand', c);
  s.meadow.forEach((m, i) => { if (m) consider('meadow', m, i); });
  if (best && (best as { score: number }).score >= 1) return (best as { action: EverdellAction }).action;

  // 2. place a worker on the most valuable open spot
  if (p.workersTotal - p.workers.length > 0) {
    const spots: { loc: EvLocRef; score: number }[] = [];
    for (const l of EV_BASIC_LOCATIONS) {
      if (!everdellCanPlace(s, seat, { t: 'basic', id: l.id })) {
        const g = l.gain;
        spots.push({ loc: { t: 'basic', id: l.id }, score: (g.twig ?? 0) + (g.resin ?? 0) * 1.5 + (g.pebble ?? 0) * 2 + (g.berry ?? 0) * 1.5 + (g.card ?? 0) * 0.8 + (g.point ?? 0) * 2 });
      }
    }
    for (const f of s.forest) {
      if (!everdellCanPlace(s, seat, { t: 'forest', id: f.id })) {
        const complex = ['f-discard-draw', 'f-discard-any', 'f-meadow-discount'].includes(f.id);
        spots.push({ loc: { t: 'forest', id: f.id }, score: complex ? 2 : 3.5 });
      }
    }
    for (const e of s.basicEvents) {
      if (!everdellCanPlace(s, seat, { t: 'basicEvent', id: e.id })) spots.push({ loc: { t: 'basicEvent', id: e.id }, score: 6 });
    }
    for (const e of s.specialEvents) {
      if (!everdellCanPlace(s, seat, { t: 'specialEvent', id: e.id })) spots.push({ loc: { t: 'specialEvent', id: e.id }, score: 7 });
    }
    if (p.season === 'autumn' && p.hand.length >= 3) {
      for (const j of ['journey-5', 'journey-4', 'journey-3', 'journey-2']) {
        if (!everdellCanPlace(s, seat, { t: 'journey', id: j })) {
          spots.push({ loc: { t: 'journey', id: j }, score: 1 + EV_JOURNEY_BY_ID[j].points * 0.5 });
          break;
        }
      }
    }
    spots.sort((x, y) => y.score - x.score);
    if (spots.length > 0) return { type: 'place_worker', loc: spots[0].loc };
  }

  // 3. season / pass
  if (p.season !== 'autumn') return { type: 'prepare' };
  return { type: 'pass' };
}

function botChoose(s: EverdellState, seat: number, head: EvPending): EverdellAction {
  const p = s.players[seat];
  const any = (n: number): EvResMap => {
    const out: EvResMap = {};
    const prefs: EvResource[] = ['berry', 'twig', 'resin', 'pebble'];
    for (let i = 0; i < n; i++) out[prefs[i % prefs.length]] = (out[prefs[i % prefs.length]] ?? 0) + 1;
    return out;
  };
  const worst = (n: number) => [...p.hand].sort((a, b) => (EV_CARD_BY_ID[a]?.points ?? 0) - (EV_CARD_BY_ID[b]?.points ?? 0)).slice(0, n);
  const opp = (seat + 1) % s.players.length;
  switch (head.kind) {
    case 'gain-any': return { type: 'choose', gains: any(head.n) };
    case 'storehouse': return { type: 'choose', pick: 'twig' };
    case 'pay-per-point': return { type: 'choose', n: Math.min(head.max, p.res[head.resource]) };
    case 'peddler': return { type: 'choose', give: {}, get: {} };
    case 'monk-give': return { type: 'choose', n: Math.min(2, p.res.berry), to: opp };
    case 'chip-sweep': {
      const t = p.city.find((c) => EV_CARD_BY_ID[c.card]?.color === 'production' && c.card !== 'chip-sweep')
        ?? p.city.find((c) => EV_CARD_BY_ID[c.card]?.color === 'production');
      return { type: 'choose', uid: t?.uid ?? -1, card: t?.card };
    }
    case 'miner-mole': {
      for (const q of s.players) {
        if (q.seat === seat) continue;
        const t = q.city.find((c) => EV_CARD_BY_ID[c.card]?.color === 'production' && c.card !== 'storehouse' && c.card !== 'miner-mole');
        if (t) return { type: 'choose', seat: q.seat, uid: t.uid, card: t.card };
      }
      return { type: 'choose', seat: opp, uid: -1 };
    }
    case 'teacher-give': return { type: 'choose', keep: head.cards[0], to: opp };
    case 'harvester-any': return { type: 'choose', gains: any(head.n) };
    case 'courthouse': return { type: 'choose', pick: 'pebble' };
    case 'bard-discard': return { type: 'choose', cards: worst(Math.min(head.max, p.hand.length)) };
    case 'ruins-target': {
      const t = p.city.find((c) => EV_CARD_BY_ID[c.card]?.kind === 'construction' && c.card !== 'ruins');
      return { type: 'choose', uid: t?.uid ?? -1 };
    }
    case 'pigeon-play': {
      const pick = head.revealed.find((c) => {
        const d = EV_CARD_BY_ID[c];
        return d && d.points <= 3 && !cityRoomFor(s, seat, d);
      });
      return { type: 'choose', pick: pick ?? null };
    }
    case 'ranger-move': return { type: 'choose', skip: true };
    case 'undertaker-discard': {
      const idxs: number[] = [];
      s.meadow.forEach((m, i) => { if (m && idxs.length < 3) idxs.push(i); });
      return { type: 'choose', cards: idxs };
    }
    case 'undertaker-draw': {
      const i = s.meadow.findIndex((m) => m);
      return { type: 'choose', index: i };
    }
    case 'haven': {
      const n = Math.max(2, p.hand.length >= 2 ? 2 : 1);
      const cards = worst(Math.min(n, p.hand.length));
      return { type: 'choose', cards, gains: any(Math.floor(cards.length / 2)) };
    }
    case 'journey-discard': return { type: 'choose', cards: worst(head.n) };
    case 'copy-basic': return { type: 'choose', id: 'loc-3twig' };
    case 'meadow2-draw': {
      const idxs: number[] = [];
      const n = Math.min(2, s.meadow.filter((m) => m).length, EV_HAND_LIMIT - p.hand.length);
      s.meadow.forEach((m, i) => { if (m && idxs.length < n) idxs.push(i); });
      return { type: 'choose', cards: idxs };
    }
    case 'play-discounted': {
      const from = head.fromCards ?? [
        ...(head.from !== 'meadow' ? p.hand : []),
        ...(head.from !== 'hand' ? s.meadow.filter((m): m is string => !!m) : []),
      ];
      for (const c of from) {
        const d = EV_CARD_BY_ID[c];
        if (!d) continue;
        if (head.maxPoints !== null && d.points > head.maxPoints) continue;
        if (cityRoomFor(s, seat, d)) continue;
        if (head.free) return { type: 'choose', card: c };
        const disc: EvResMap = {};
        let left = head.discount;
        for (const r of EV_RESOURCES) {
          const use = Math.min(left, d.cost[r]);
          if (use > 0) disc[r] = use;
          left -= use;
        }
        const cost = applyDiscount({ ...d.cost }, disc, head.discount);
        if (cost && canPay(p, cost)) return { type: 'choose', card: c, discount: disc };
      }
      return { type: 'choose', skip: true };
    }
    case 'inn-play': {
      for (const c of s.meadow) {
        if (!c) continue;
        const d = EV_CARD_BY_ID[c];
        if (!d || cityRoomFor(s, seat, d)) continue;
        const disc: EvResMap = {};
        let left = 3;
        for (const r of EV_RESOURCES) {
          const use = Math.min(left, d.cost[r]);
          if (use > 0) disc[r] = use;
          left -= use;
        }
        const cost = applyDiscount({ ...d.cost }, disc, 3);
        if (cost && canPay(p, cost)) return { type: 'choose', card: c, discount: disc };
      }
      return { type: 'choose', card: '' };
    }
    case 'post-office-give': return { type: 'choose', to: opp, cards: worst(Math.min(2, p.hand.length)) };
    case 'post-office-redraw': return { type: 'choose', cards: [] };
    case 'university-target': {
      const t = [...p.city].filter((c) => c.card !== 'university')
        .sort((x, y) => (EV_CARD_BY_ID[x.card]?.points ?? 0) - (EV_CARD_BY_ID[y.card]?.points ?? 0))[0];
      return { type: 'choose', uid: t?.uid ?? -1 };
    }
    case 'monastery-give': return { type: 'choose', to: opp, give: any(2) };
    case 'cemetery-source': return { type: 'choose', source: s.deck.length > 0 ? 'deck' : 'discard' };
    case 'cemetery-play': {
      const pick = head.revealed.find((c) => {
        const d = EV_CARD_BY_ID[c];
        return d && !cityRoomFor(s, seat, d);
      });
      return { type: 'choose', pick: pick ?? null };
    }
    case 'clock-tower': return { type: 'choose', skip: true };
    case 'summer-meadow': {
      const i = s.meadow.findIndex((m) => m);
      return i >= 0 ? { type: 'choose', index: i } : { type: 'choose', skip: true };
    }
    case 'discard-any-draw': return { type: 'choose', cards: worst(Math.min(2, p.hand.length)) };
    case 'discard-up-to-3-any': return { type: 'choose', cards: worst(Math.min(2, Math.max(1, p.hand.length ? 1 : 0))) };
    case 'fireworks-twigs': return { type: 'choose', n: Math.min(3, p.res.twig) };
    case 'performer-berries': return { type: 'choose', n: Math.min(3, p.res.berry) };
    case 'new-management': return { type: 'choose', place: any(Math.min(3, resTotal(p.res))) };
    case 'acorn-thieves': return { type: 'choose', uids: [] };
    case 'graduation': return { type: 'choose', cards: [] };
    case 'ancient-scrolls': return { type: 'choose', keep: head.revealed.slice(0, Math.max(0, EV_HAND_LIMIT - p.hand.length)) };
    case 'marketing-plan': {
      const n = Math.min(3, resTotal(p.res));
      return { type: 'choose', gives: n > 0 ? [{ to: opp, res: any(n) }] : [] };
    }
    case 'croak-city-discard': {
      const t = [...p.city]
        .sort((x, y) => (EV_CARD_BY_ID[x.card]?.points ?? 0) - (EV_CARD_BY_ID[y.card]?.points ?? 0))
        .slice(0, Math.min(2, p.city.length));
      return { type: 'choose', uids: t.map((c) => c.uid) };
    }
    case 'well-run-city': {
      const w = p.workers.find((x) => !x.permanent);
      return { type: 'choose', from: w?.loc };
    }
    default:
      return { type: 'choose' };
  }
}
