// Bot-vs-bot playthroughs with invariants, plus scripted checks of the notebook rules.
import assert from 'node:assert/strict';
import {
  applyShAction, createShGame, shEligibleChancellors, shLegalActions, shPrivateView, shPublicView, shWaitingOn,
  FASCIST_POLICIES, LIBERAL_POLICIES, PRE_DISCARDED_FASCIST, ROLE_COUNTS, TRACK_POWERS,
  type ShAction, type ShEvent, type ShState,
} from './rules';
import { botAction, botClaim } from './bot';

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(s: ShState) {
  const total = s.deck.length + s.discard.length + s.hand.length + s.liberal + s.fascist;
  assert.equal(total, LIBERAL_POLICIES + FASCIST_POLICIES, 'policy cards are conserved');
  const libs = [...s.deck, ...s.discard, ...s.hand].filter((c) => c === 'L').length + s.liberal;
  assert.equal(libs, LIBERAL_POLICIES, 'liberal cards are conserved');
  assert.equal(s.roles.filter((r) => r === 'hitler').length, 1);
  assert.equal(s.roles.filter((r) => r === 'fascist').length, ROLE_COUNTS[s.n].fascist);
  assert.ok(s.tracker >= 0 && s.tracker < 3);
  assert.ok(s.liberal <= 5 && s.fascist <= 6);
  if (s.phase !== 'over' && s.phase !== 'roles') {
    assert.ok(s.alive[s.president], 'president is alive');
    assert.ok(shWaitingOn(s).length > 0, `someone can act in ${s.phase}`);
    if (['nominate', 'vote'].includes(s.phase)) assert.ok(s.deck.length >= 3, 'three cards ready for the next session');
  }
  if (s.phase === 'over') {
    assert.ok(s.winner);
    assert.equal(shWaitingOn(s).length, 0);
  }
  // Views never leak hidden information.
  const pub = shPublicView(s) as unknown as Record<string, unknown>;
  for (const key of ['hand', 'peek', 'intel', 'votes']) assert.ok(!(key in pub), `public view hides ${key}`);
  if (s.phase !== 'over') assert.equal(pub.roles, null);
  for (let seat = 0; seat < s.n; seat++) {
    const v = shPrivateView(s, seat);
    if (v.role === 'liberal') assert.equal(v.known.length, 0);
    if (v.role === 'hitler') assert.equal(v.known.length, s.n <= 6 ? ROLE_COUNTS[s.n].fascist : 0);
    if (v.role === 'fascist') assert.equal(v.known.length, ROLE_COUNTS[s.n].fascist);
    if (v.hand.length) assert.ok(seat === s.president || seat === s.chancellor);
  }
}

function playout(n: number, seed: number) {
  const rnd = rng(seed * 7919 + n);
  const names = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  let { state } = createShGame({ names, ai: names.map(() => true), seed });
  assert.equal(state.discard.length, PRE_DISCARDED_FASCIST[n]);
  let steps = 0;
  const seen = new Set<string>();
  while (state.phase !== 'over') {
    checkInvariants(state);
    const seats = shWaitingOn(state);
    const seat = seats[Math.floor(rnd() * seats.length)];
    const view = shPrivateView(state, seat);
    const action = botAction(view, rnd);
    assert.ok(action, 'bot found a move');
    const res = applyShAction(state, seat, action!);
    assert.equal(res.error, undefined, res.error);
    for (const e of res.events) seen.add(e.t);
    state = res.state;
    // Claims are optional and never block.
    for (let s2 = 0; s2 < n; s2++) {
      for (const slot of [...state.claimSlots[s2]]) {
        if (rnd() < 0.7) {
          const value = botClaim(shPrivateView(state, s2), slot, rnd);
          if (value) {
            const cr = applyShAction(state, s2, { type: 'claim', kind: slot.kind, value });
            assert.equal(cr.error, undefined, cr.error);
            for (const e of cr.events) seen.add(e.t);
            state = cr.state;
          }
        }
      }
    }
    assert.ok(++steps < 2000, 'game terminates');
  }
  checkInvariants(state);
  return { state, seen };
}

// ---- random playthroughs ----
const wins = { liberal: 0, fascist: 0 };
const reasons: Record<string, number> = {};
const allSeen = new Set<string>();
let games = 0;
for (let n = 5; n <= 10; n++) {
  for (let seed = 1; seed <= 250; seed++) {
    const { state, seen } = playout(n, seed);
    wins[state.winner!] += 1;
    reasons[state.winReason!] = (reasons[state.winReason!] ?? 0) + 1;
    seen.forEach((t) => allSeen.add(t));
    games++;
  }
}
for (const t of ['vote_result', 'government', 'enacted', 'tracker', 'chaos', 'reshuffle', 'power', 'investigated', 'special_election', 'peeked', 'executed', 'veto_unlocked', 'veto_proposed', 'veto_passed', 'not_hitler', 'claim', 'game_over']) {
  assert.ok(allSeen.has(t), `playthroughs exercised ${t}`);
}
assert.ok(reasons.policies && reasons.hitler_elected && reasons.hitler_executed, 'all three endings reached');
console.log(`ok ${games} playthroughs`, wins, reasons);

// ---- scripted rules ----
function fresh(n: number, roles?: ShState['roles']): ShState {
  const names = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const { state } = createShGame({ names, ai: names.map(() => true), seed: 42 });
  if (roles) state.roles = roles;
  return state;
}
function act(s: ShState, seat: number, action: ShAction): { s: ShState; events: ShEvent[] } {
  const r = applyShAction(s, seat, action);
  assert.equal(r.error, undefined, r.error);
  return { s: r.state, events: r.events };
}
function elect(s: ShState, chancellor: number, ja = true): { s: ShState; events: ShEvent[] } {
  let cur = act(s, s.president, { type: 'nominate', target: chancellor }).s;
  let events: ShEvent[] = [];
  for (let i = 0; i < cur.n; i++) {
    if (!cur.alive[i]) continue;
    const r = act(cur, i, { type: 'vote', ja });
    cur = r.s;
    events = r.events;
  }
  return { s: cur, events };
}

// Track powers match the printed boards.
assert.deepEqual(TRACK_POWERS['56'], [null, null, 'peek', 'execute', 'execute', null]);
assert.deepEqual(TRACK_POWERS['78'], [null, 'investigate', 'special_election', 'execute', 'execute', null]);
assert.deepEqual(TRACK_POWERS['910'], ['investigate', 'investigate', 'special_election', 'execute', 'execute', null]);

// Illegal moves are rejected and leave state untouched.
{
  const s = fresh(5);
  const other = (s.president + 1) % 5;
  const r = applyShAction(s, other, { type: 'nominate', target: s.president });
  assert.ok(r.error);
  assert.equal(r.state, s);
  assert.ok(applyShAction(s, s.president, { type: 'nominate', target: s.president }).error, 'cannot nominate yourself');
}

// Hitler elected Chancellor after three fascist policies ends the game.
{
  const s = fresh(5, ['liberal', 'hitler', 'fascist', 'liberal', 'liberal']);
  s.fascist = 3;
  s.deck = s.deck.filter((c, i) => !(c === 'F' && s.deck.slice(0, i).filter((x) => x === 'F').length < 3));
  s.president = 0;
  const r = elect(s, 1);
  assert.equal(r.s.winner, 'fascist');
  assert.equal(r.s.winReason, 'hitler_elected');
  // With only two fascist policies the same election just starts a session.
  const s2 = fresh(5, ['liberal', 'hitler', 'fascist', 'liberal', 'liberal']);
  s2.fascist = 2;
  s2.president = 0;
  const r2 = elect(s2, 1);
  assert.equal(r2.s.phase, 'president_discard');
  assert.equal(r2.s.hand.length, 3);
}

// A non-Hitler Chancellor after three fascist policies is publicly cleared.
{
  const s = fresh(5, ['liberal', 'hitler', 'fascist', 'liberal', 'liberal']);
  s.fascist = 3;
  s.president = 0;
  const r = elect(s, 3);
  assert.ok(r.events.some((e) => e.t === 'not_hitler' && e.chancellor === 3));
  assert.equal(r.s.notHitler[3], true);
}

// Three failed elections enact the top policy, ignore its power and clear term limits.
{
  let s = fresh(7);
  s.lastGov = { president: 5, chancellor: 6 };
  s.fascist = 1; // the next fascist policy would grant Investigate on the 7-8 track
  s.deck = ['F', 'L', 'L', 'F', 'F', 'L'];
  for (let i = 0; i < 3; i++) {
    const target = shEligibleChancellors(s)[0];
    s = elect(s, target, false).s;
  }
  assert.equal(s.fascist, 2);
  assert.equal(s.phase, 'nominate', 'no power from a top-decked policy');
  assert.equal(s.tracker, 0);
  assert.equal(s.lastGov, null);
  assert.equal(s.governments.at(-1)!.chaos, 'F');
}

// Term limits: last Chancellor always, last President only with more than five alive.
{
  const s6 = fresh(6);
  s6.president = 0;
  s6.lastGov = { president: 1, chancellor: 2 };
  assert.deepEqual(shEligibleChancellors(s6), [3, 4, 5]);
  const s5 = fresh(5);
  s5.president = 0;
  s5.lastGov = { president: 1, chancellor: 2 };
  assert.deepEqual(shEligibleChancellors(s5), [1, 3, 4]);
  s6.alive[5] = false;
  assert.deepEqual(shEligibleChancellors(s6), [1, 3, 4], 'five left alive relaxes the limit');
}

// A tie fails.
{
  let s = fresh(6);
  s = act(s, s.president, { type: 'nominate', target: shEligibleChancellors(s)[0] }).s;
  let last: ShEvent[] = [];
  for (let i = 0; i < 6; i++) {
    const r = act(s, i, { type: 'vote', ja: i < 3 });
    s = r.s;
    last = r.events;
  }
  const vr = last.find((e) => e.t === 'vote_result');
  assert.ok(vr && vr.t === 'vote_result' && !vr.passed && vr.ja === 3 && vr.nein === 3);
  assert.equal(s.tracker, 1);
}

// Legislative session: discards stay hidden, the enacted card lands, the session can be claimed.
{
  let s = fresh(5);
  s.deck = ['L', 'F', 'F', 'L', 'F', 'F', 'L'];
  const pres = s.president;
  const chan = shEligibleChancellors(s)[0];
  s = elect(s, chan).s;
  assert.deepEqual(shPrivateView(s, pres).hand, ['L', 'F', 'F']);
  assert.deepEqual(shPrivateView(s, chan).hand, []);
  s = act(s, pres, { type: 'discard', index: 1 }).s;
  assert.deepEqual(shPrivateView(s, chan).hand, ['L', 'F']);
  assert.deepEqual(shPrivateView(s, pres).hand, []);
  s = act(s, chan, { type: 'enact', index: 0 }).s;
  assert.equal(s.liberal, 1);
  assert.equal(s.discard.length, 2);
  assert.equal(s.phase, 'nominate');
  assert.equal(s.president, (pres + 1) % 5, 'presidency passes clockwise');
  const c = act(s, pres, { type: 'claim', kind: 'drew', value: 'LFF' });
  assert.equal(c.s.governments[0].claims.drew, 'LFF');
  assert.ok(applyShAction(c.s, pres, { type: 'claim', kind: 'drew', value: 'LLL' }).error, 'one claim per session');
}

// Veto: only after five fascist policies, advances the tracker, a refusal forces an enactment.
{
  let s = fresh(5);
  s.fascist = 5;
  s.deck = ['F', 'F', 'L', 'L', 'F', 'L'];
  const pres = s.president;
  const chan = shEligibleChancellors(s)[0];
  s.roles = s.roles.map(() => 'liberal');
  s.roles[[0, 1, 2, 3, 4].find((i) => i !== pres && i !== chan)!] = 'hitler';
  s = elect(s, chan).s;
  s = act(s, pres, { type: 'discard', index: 2 }).s;
  assert.ok(shLegalActions(s, chan).some((a) => a.type === 'veto'));
  const proposed = act(s, chan, { type: 'veto' }).s;
  const refused = act(proposed, pres, { type: 'veto_response', consent: false }).s;
  assert.equal(refused.phase, 'chancellor_enact');
  assert.ok(!shLegalActions(refused, chan).some((a) => a.type === 'veto'), 'no second veto');
  const consented = act(proposed, pres, { type: 'veto_response', consent: true }).s;
  assert.equal(consented.tracker, 1);
  assert.equal(consented.fascist, 5);
  assert.equal(consented.phase, 'nominate');
  const early = fresh(5);
  early.fascist = 2;
  const e2 = elect(early, shEligibleChancellors(early)[0]).s;
  const e3 = act(e2, e2.president, { type: 'discard', index: 0 }).s;
  assert.ok(!shLegalActions(e3, e3.chancellor!).some((a) => a.type === 'veto'));
}

// Special election: the chosen player runs next, then the order resumes after the caller.
{
  let s = fresh(7);
  s.fascist = 2;
  s.deck = ['F', 'F', 'F', 'L', 'L', 'L', 'F', 'F'];
  const pres = s.president;
  s = elect(s, shEligibleChancellors(s)[0]).s;
  s = act(s, pres, { type: 'discard', index: 0 }).s;
  s = act(s, s.chancellor!, { type: 'enact', index: 0 }).s;
  assert.equal(s.power, 'special_election');
  const target = (pres + 3) % 7;
  s = act(s, pres, { type: 'special_election', target }).s;
  assert.equal(s.president, target);
  assert.equal(s.special, true);
  s = elect(s, shEligibleChancellors(s)[0], false).s;
  assert.equal(s.president, (pres + 1) % 7, 'order returns to the left of the caller');
}

// Investigation shows party, not role, and a player is investigated once.
{
  let s = fresh(9);
  s.deck = ['F', 'F', 'F', 'F', 'F', 'F', 'L', 'L'];
  const pres = s.president;
  s = elect(s, shEligibleChancellors(s)[0]).s;
  s = act(s, pres, { type: 'discard', index: 0 }).s;
  s = act(s, s.chancellor!, { type: 'enact', index: 0 }).s;
  assert.equal(s.power, 'investigate');
  const target = s.roles.findIndex((r, i) => r === 'hitler' && i !== pres);
  const t = target >= 0 ? target : (pres + 1) % 9;
  s = act(s, pres, { type: 'investigate', target: t }).s;
  const intel = shPrivateView(s, pres).intel.find((i) => i.kind === 'investigate')!;
  assert.equal(intel.party, s.roles[t] === 'liberal' ? 'liberal' : 'fascist');
  assert.equal(s.investigated[t], true);
  assert.equal(shPrivateView(s, (pres + 1) % 9).intel.filter((i) => i.kind === 'investigate').length, 0);
}

// Policy peek shows the top three in order and does not disturb the deck.
{
  let s = fresh(5);
  s.fascist = 2;
  s.deck = ['F', 'F', 'F', 'L', 'F', 'L', 'L'];
  const pres = s.president;
  s = elect(s, shEligibleChancellors(s)[0]).s;
  s = act(s, pres, { type: 'discard', index: 0 }).s;
  s = act(s, s.chancellor!, { type: 'enact', index: 0 }).s;
  assert.equal(s.power, 'peek');
  assert.deepEqual(shPrivateView(s, pres).peek, ['L', 'F', 'L']);
  assert.equal(shPrivateView(s, s.chancellor!).peek, null);
  const before = [...s.deck];
  s = act(s, pres, { type: 'peek_ack' }).s;
  assert.deepEqual(s.deck, before);
}

// Execution: killing Hitler wins for the liberals; anyone else is out of the game.
{
  const base = fresh(5, ['liberal', 'hitler', 'fascist', 'liberal', 'liberal']);
  base.fascist = 3;
  base.deck = ['F', 'F', 'F', 'L', 'L', 'L', 'F'];
  base.president = 0;
  let s = elect(base, 3).s;
  s = act(s, 0, { type: 'discard', index: 0 }).s;
  s = act(s, 3, { type: 'enact', index: 0 }).s;
  assert.equal(s.power, 'execute');
  const win = act(s, 0, { type: 'execute', target: 1 }).s;
  assert.equal(win.winner, 'liberal');
  assert.equal(win.winReason, 'hitler_executed');
  const cont = act(s, 0, { type: 'execute', target: 2 }).s;
  assert.equal(cont.alive[2], false);
  assert.equal(cont.phase, 'nominate');
  assert.equal(shLegalActions(cont, 2).length, 0);
  assert.ok(applyShAction(cont, 2, { type: 'say', text: 'hello' }).error, 'the dead do not speak');
  assert.ok(!shEligibleChancellors(cont).includes(2));
}

// The draw pile is rebuilt from the discards when fewer than three cards remain.
{
  let s = fresh(5);
  s.deck = ['L', 'L', 'F', 'F', 'F'];
  s.discard = ['L', 'L', 'L', 'L', ...Array(8).fill('F')];
  const pres = s.president;
  s = elect(s, shEligibleChancellors(s)[0]).s;
  s = act(s, pres, { type: 'discard', index: 2 }).s;
  const r = act(s, s.chancellor!, { type: 'enact', index: 0 });
  assert.ok(r.events.some((e) => e.t === 'reshuffle'));
  assert.equal(r.s.discard.length, 0);
  assert.equal(r.s.deck.length, 16);
}

console.log('ok scripted rules');
