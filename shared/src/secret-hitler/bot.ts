// Built-in heuristic player. Used when a Claude seat has no API key or the API call fails,
// and by the rules tests. It only sees what a real player at that seat would see.
import type { ShAction, ClaimSlot, ShPrivateView } from './rules';

export interface BotMove {
  action: ShAction;
}

// Public suspicion from the voting record: governments that passed fascist policies look bad.
export function suspicion(v: ShPrivateView): number[] {
  const sus = Array(v.n).fill(0);
  for (const g of v.governments) {
    if (!g.passed || !g.policy) continue;
    const d = g.policy === 'F' ? 1 : -0.6;
    sus[g.president] += d;
    sus[g.chancellor] += d * 1.2;
  }
  for (const intel of v.intel) {
    if (intel.kind === 'investigate' && intel.target !== undefined) sus[intel.target] += intel.party === 'fascist' ? 10 : -10;
  }
  v.notHitler.forEach((ok, i) => { if (ok) sus[i] -= 0.4; });
  return sus;
}

function pick<T>(items: T[], rnd: () => number): T {
  return items[Math.floor(rnd() * items.length)];
}
function minBy<T>(items: T[], score: (t: T) => number, rnd: () => number): T {
  let best = items[0];
  let bestScore = Infinity;
  for (const it of items) {
    const sc = score(it) + rnd() * 0.5;
    if (sc < bestScore) { best = it; bestScore = sc; }
  }
  return best;
}

export function botAction(v: ShPrivateView, rnd: () => number = Math.random): ShAction | null {
  const acts = v.actions;
  if (!acts.length) return null;
  const first = acts[0];
  const evil = v.party === 'fascist';
  const team = new Set(v.known.map((k) => k.seat));
  const hitlerSeat = v.known.find((k) => k.role === 'hitler')?.seat;
  const sus = suspicion(v);
  // Fascists know their side; liberals work from the record.
  const trust = (seat: number) => (evil && team.has(seat) ? -5 : sus[seat]);

  switch (first.type) {
    case 'ready':
      return first;
    case 'nominate': {
      const targets = acts.flatMap((a) => (a.type === 'nominate' ? [a.target] : []));
      if (evil && v.fascist >= 3 && hitlerSeat !== undefined && targets.includes(hitlerSeat)) return { type: 'nominate', target: hitlerSeat };
      if (v.role === 'hitler') return { type: 'nominate', target: minBy(targets, (t) => sus[t], rnd) };
      return { type: 'nominate', target: minBy(targets, trust, rnd) };
    }
    case 'vote': {
      const p = v.president;
      const c = v.chancellor!;
      if (p === v.seat || c === v.seat) return { type: 'vote', ja: true };
      if (evil) {
        const friendly = team.has(p) || team.has(c);
        if (v.fascist >= 3 && hitlerSeat === c) return { type: 'vote', ja: true };
        return { type: 'vote', ja: friendly ? rnd() < 0.9 : rnd() < 0.55 };
      }
      const risk = sus[p] + sus[c] * 1.3 + (v.fascist >= 3 && !v.notHitler[c] ? 0.8 : 0);
      if (v.tracker >= 2) return { type: 'vote', ja: risk < 2.5 };
      return { type: 'vote', ja: risk < 0.9 + rnd() * 0.6 };
    }
    case 'discard': {
      // President: liberals bury a fascist card, fascists bury a liberal one when they can hide it.
      const want = evil && v.role !== 'hitler' ? 'L' : evil && v.fascist >= 3 ? 'L' : 'F';
      const idx = v.hand.indexOf(want as 'L' | 'F');
      return { type: 'discard', index: idx >= 0 ? idx : 0 };
    }
    case 'enact': {
      const canVeto = acts.some((a) => a.type === 'veto');
      if (!evil && canVeto && v.hand.every((c) => c === 'F')) return { type: 'veto' };
      const want = evil && (v.role !== 'hitler' || v.fascist >= 4) ? 'F' : 'L';
      const idx = v.hand.indexOf(want as 'L' | 'F');
      return { type: 'enact', index: idx >= 0 ? idx : 0 };
    }
    case 'veto':
      return first;
    case 'veto_response':
      return { type: 'veto_response', consent: !evil };
    case 'peek_ack':
      return first;
    case 'investigate': {
      const targets = acts.flatMap((a) => (a.type === 'investigate' ? [a.target] : []));
      const fresh = targets.filter((t) => !team.has(t));
      return { type: 'investigate', target: pick(fresh.length ? fresh : targets, rnd) };
    }
    case 'special_election': {
      const targets = acts.flatMap((a) => (a.type === 'special_election' ? [a.target] : []));
      return { type: 'special_election', target: minBy(targets, trust, rnd) };
    }
    case 'execute': {
      const targets = acts.flatMap((a) => (a.type === 'execute' ? [a.target] : []));
      if (evil) {
        const liberals = targets.filter((t) => !team.has(t));
        return { type: 'execute', target: pick(liberals.length ? liberals : targets, rnd) };
      }
      return { type: 'execute', target: minBy(targets, (t) => -sus[t], rnd) };
    }
  }
  return first;
}

// What the bot says it saw. Liberals tell the truth; fascists give the story that fits the board.
export function botClaim(v: ShPrivateView, slot: ClaimSlot, rnd: () => number = Math.random): string | null {
  const gov = v.governments[slot.gov];
  if (!gov) return null;
  const evil = v.party === 'fascist';
  if (slot.kind === 'inv') {
    const intel = [...v.intel].reverse().find((i) => i.kind === 'investigate' && i.target === slot.target);
    if (!intel?.party) return null;
    if (!evil) return intel.party;
    const friend = v.known.some((k) => k.seat === slot.target);
    return friend ? 'liberal' : rnd() < 0.5 ? 'fascist' : intel.party;
  }
  if (slot.kind === 'peek') {
    const intel = [...v.intel].reverse().find((i) => i.kind === 'peek');
    return intel?.cards ? intel.cards.join('') : null;
  }
  const enacted = gov.policy;
  if (!enacted) return null;
  const held = [...v.intel].reverse().find((i) => i.kind === slot.kind && i.round === gov.round)?.cards;
  const truth = held ? [...held].sort((x, y) => (x === y ? 0 : x === 'L' ? -1 : 1)).join('') : null;
  if (!evil && truth) return truth;
  // A fascist tells the story that fits what hit the board.
  if (slot.kind === 'drew') return enacted === 'L' ? (truth ?? 'LLF') : rnd() < 0.7 ? 'FFF' : 'LFF';
  return enacted === 'L' ? (truth ?? 'LF') : 'FF';
}
