// Secret Hitler rules engine.
// Source of truth: the "Secret Hitler Original" TTS mod (Workshop 3322335081).
// The mod is a sandbox, so its rules live in its notebook tabs (games/secret-hitler/rules-notebook.md)
// and on the printed fascist tracks. Role counts and who-knows-whom match the Rescripted V2 mod Lua.
// Pure reducer: state -> action -> { state, events }. Events drive the big-screen cutscenes.

export type Policy = 'L' | 'F';
export type Role = 'liberal' | 'fascist' | 'hitler';
export type Party = 'liberal' | 'fascist';
export type Power = 'investigate' | 'special_election' | 'peek' | 'execute';
export type ShPhase =
  | 'roles'
  | 'nominate'
  | 'vote'
  | 'president_discard'
  | 'chancellor_enact'
  | 'veto_response'
  | 'power'
  | 'over';
export type WinReason = 'policies' | 'hitler_elected' | 'hitler_executed';
export type Bracket = '56' | '78' | '910';
export type ClaimKind = 'drew' | 'got' | 'inv' | 'peek';

export const SH_MIN_PLAYERS = 5;
export const SH_MAX_PLAYERS = 10;

// Notebook "Set Up" table: fascists listed are ordinary fascists, Hitler is extra.
export const ROLE_COUNTS: Record<number, { liberal: number; fascist: number }> = {
  5: { liberal: 3, fascist: 1 },
  6: { liberal: 4, fascist: 1 },
  7: { liberal: 4, fascist: 2 },
  8: { liberal: 5, fascist: 2 },
  9: { liberal: 5, fascist: 3 },
  10: { liberal: 6, fascist: 3 },
};

// Printed on the three fascist tracks, slot 1..6. Slot 6 is the fascist win.
export const TRACK_POWERS: Record<Bracket, (Power | null)[]> = {
  '56': [null, null, 'peek', 'execute', 'execute', null],
  '78': [null, 'investigate', 'special_election', 'execute', 'execute', null],
  '910': ['investigate', 'investigate', 'special_election', 'execute', 'execute', null],
};

// The mod's policy deck: 6 liberal and 11 fascist articles.
export const LIBERAL_POLICIES = 6;
export const FASCIST_POLICIES = 11;
// Notebook "Set Up": with 7 players one fascist policy starts in the discard pile, with 9 players two.
export const PRE_DISCARDED_FASCIST: Record<number, number> = { 5: 0, 6: 0, 7: 1, 8: 0, 9: 2, 10: 0 };

// The ten seats printed on the mod's table, clockwise from the near-centre seat.
export const TABLE_SEATS = ['Brown', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'White'] as const;
// The order chairs are handed out as players join: opposite sides first.
export const SH_PICK_ORDER = [0, 5, 2, 7, 4, 8, 1, 6, 3, 9].map((i) => TABLE_SEATS[i]);
// Display colours tuned for a dark UI (the TTS seat colours, with brown lifted so it reads on black).
export const SH_SEAT_HEX: Record<(typeof TABLE_SEATS)[number], string> = {
  Brown: '#b9773f',
  Red: '#e5392f',
  Orange: '#f47a2a',
  Yellow: '#e8d83a',
  Green: '#3fbf45',
  Teal: '#27bfa8',
  Blue: '#3a94ff',
  Purple: '#a855f7',
  Pink: '#f472c8',
  White: '#f1f1f1',
};
// Which printed seats are used for each player count, in clockwise order.
export const SEAT_SLOTS: Record<number, number[]> = {
  5: [0, 2, 4, 6, 8],
  6: [0, 1, 4, 5, 6, 9],
  7: [0, 1, 3, 4, 6, 7, 9],
  8: [1, 2, 3, 4, 6, 7, 8, 9],
  9: [0, 1, 2, 3, 4, 6, 7, 8, 9],
  10: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
};
export function seatSlots(n: number): number[] {
  return SEAT_SLOTS[Math.min(SH_MAX_PLAYERS, Math.max(SH_MIN_PLAYERS, n))];
}
export function seatHex(slot: number): string {
  return SH_SEAT_HEX[TABLE_SEATS[slot]];
}

export interface Intel {
  // 'drew' and 'got' are the cards this seat held as President or Chancellor.
  kind: 'investigate' | 'peek' | 'drew' | 'got';
  round: number;
  target?: number;
  party?: Party;
  cards?: Policy[];
}
export interface ClaimSlot {
  kind: ClaimKind;
  gov: number;
  target?: number;
}
export interface GovRecord {
  round: number;
  president: number;
  chancellor: number;
  votes: (boolean | null)[];
  passed: boolean;
  policy: Policy | null;
  vetoed: boolean;
  chaos: Policy | null;
  power: Power | null;
  powerTarget: number | null;
  claims: { drew?: string; got?: string; inv?: string; peek?: string };
}
export interface TalkEntry {
  seat: number;
  text: string;
  round: number;
}

export interface ShState {
  game: 'secrethitler';
  n: number;
  names: string[];
  ai: boolean[];
  slots: number[];
  bracket: Bracket;
  roles: Role[];
  roleArt: number[];
  alive: boolean[];
  ready: boolean[];
  deck: Policy[];
  discard: Policy[];
  liberal: number;
  fascist: number;
  tracker: number;
  phase: ShPhase;
  round: number;
  president: number;
  chancellor: number | null;
  rotation: number;
  special: boolean;
  lastGov: { president: number; chancellor: number } | null;
  votes: (boolean | null)[];
  hand: Policy[];
  vetoRefused: boolean;
  power: Power | null;
  peek: Policy[] | null;
  investigated: boolean[];
  notHitler: boolean[];
  intel: Intel[][];
  claimSlots: ClaimSlot[][];
  governments: GovRecord[];
  talk: TalkEntry[];
  winner: Party | null;
  winReason: WinReason | null;
  rng: number;
}

export type ShAction =
  | { type: 'ready' }
  | { type: 'nominate'; target: number }
  | { type: 'vote'; ja: boolean }
  | { type: 'discard'; index: number }
  | { type: 'enact'; index: number }
  | { type: 'veto' }
  | { type: 'veto_response'; consent: boolean }
  | { type: 'investigate'; target: number }
  | { type: 'special_election'; target: number }
  | { type: 'execute'; target: number }
  | { type: 'peek_ack' }
  | { type: 'claim'; kind: ClaimKind; value: string }
  | { type: 'say'; text: string };

export type ShEvent =
  | { t: 'game_start'; n: number; bracket: Bracket }
  | { t: 'roles_dealt' }
  | { t: 'candidate'; president: number; special: boolean; round: number }
  | { t: 'nominated'; president: number; chancellor: number }
  | { t: 'vote_cast'; seat: number }
  | { t: 'vote_result'; votes: (boolean | null)[]; ja: number; nein: number; passed: boolean; president: number; chancellor: number }
  | { t: 'government'; president: number; chancellor: number }
  | { t: 'not_hitler'; chancellor: number }
  | { t: 'tracker'; value: number }
  | { t: 'chaos'; policy: Policy }
  | { t: 'draw3'; president: number }
  | { t: 'president_discard'; president: number; chancellor: number }
  | { t: 'veto_proposed'; chancellor: number; president: number }
  | { t: 'veto_refused'; president: number; chancellor: number }
  | { t: 'veto_passed'; president: number; chancellor: number }
  | { t: 'enacted'; policy: Policy; by: 'government' | 'chaos'; liberal: number; fascist: number; slot: number }
  | { t: 'veto_unlocked' }
  | { t: 'reshuffle'; deck: number }
  | { t: 'power'; power: Power; president: number }
  | { t: 'investigated'; president: number; target: number }
  | { t: 'special_election'; president: number; target: number }
  | { t: 'peeked'; president: number }
  | { t: 'executed'; president: number; target: number; wasHitler: boolean }
  | { t: 'claim'; seat: number; kind: ClaimKind; value: string; target?: number }
  | { t: 'say'; seat: number; text: string }
  | { t: 'game_over'; winner: Party; reason: WinReason; roles: Role[]; roleArt: number[] };

export interface ShResult {
  state: ShState;
  events: ShEvent[];
  error?: string;
}

// ---------- rng ----------
function rand(s: ShState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(s: ShState, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- setup ----------
export function bracketFor(n: number): Bracket {
  return n <= 6 ? '56' : n <= 8 ? '78' : '910';
}
export function partyOf(role: Role): Party {
  return role === 'liberal' ? 'liberal' : 'fascist';
}

export function createShGame(opts: { names: string[]; ai?: boolean[]; seed?: number; slots?: number[] }): ShResult {
  const n = opts.names.length;
  if (n < SH_MIN_PLAYERS || n > SH_MAX_PLAYERS) throw new Error(`Secret Hitler needs ${SH_MIN_PLAYERS} to ${SH_MAX_PLAYERS} players`);
  const ai = opts.ai ?? opts.names.map(() => false);
  const s: ShState = {
    game: 'secrethitler',
    n,
    names: [...opts.names],
    ai: [...ai],
    slots: opts.slots && opts.slots.length === n ? [...opts.slots] : [...SEAT_SLOTS[n]],
    bracket: bracketFor(n),
    roles: [],
    roleArt: [],
    alive: Array(n).fill(true),
    ready: ai.map((a) => a),
    deck: [],
    discard: [],
    liberal: 0,
    fascist: 0,
    tracker: 0,
    phase: 'roles',
    round: 0,
    president: 0,
    chancellor: null,
    rotation: 0,
    special: false,
    lastGov: null,
    votes: Array(n).fill(null),
    hand: [],
    vetoRefused: false,
    power: null,
    peek: null,
    investigated: Array(n).fill(false),
    notHitler: Array(n).fill(false),
    intel: Array.from({ length: n }, () => []),
    claimSlots: Array.from({ length: n }, () => []),
    governments: [],
    talk: [],
    winner: null,
    winReason: null,
    rng: (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
  };
  const counts = ROLE_COUNTS[n];
  const roles: Role[] = ['hitler', ...Array<Role>(counts.fascist).fill('fascist'), ...Array<Role>(counts.liberal).fill('liberal')];
  s.roles = shuffle(s, roles);
  // Each seat gets a distinct portrait from the mod's role sheet (3 fascists, 6 liberals).
  const fArt = shuffle(s, [1, 2, 3]);
  const lArt = shuffle(s, [1, 2, 3, 4, 5, 6]);
  s.roleArt = s.roles.map((r) => (r === 'hitler' ? 0 : r === 'fascist' ? fArt.pop()! : lArt.pop()!));
  const pre = PRE_DISCARDED_FASCIST[n];
  s.discard = Array<Policy>(pre).fill('F');
  s.deck = shuffle(s, [...Array<Policy>(LIBERAL_POLICIES).fill('L'), ...Array<Policy>(FASCIST_POLICIES - pre).fill('F')]);
  // Random first presidential candidate. startRound advances rotation by one, so park it one seat back.
  const order = clockwise(s);
  const first = Math.floor(rand(s) * n);
  s.rotation = order[(first + n - 1) % n];
  const events: ShEvent[] = [{ t: 'game_start', n, bracket: s.bracket }, { t: 'roles_dealt' }];
  if (s.ready.every(Boolean)) startRound(s, events);
  return { state: s, events };
}

// ---------- helpers ----------
export function aliveCount(s: Pick<ShState, 'alive'>): number {
  return s.alive.filter(Boolean).length;
}
// Seat indices in clockwise table order (by printed slot).
export function clockwise(s: Pick<ShState, 'slots'>): number[] {
  return s.slots.map((slot, seat) => ({ slot, seat })).sort((a, b) => a.slot - b.slot).map((x) => x.seat);
}
function nextAlive(s: ShState, from: number): number {
  const order = clockwise(s);
  const at = order.indexOf(from);
  for (let i = 1; i <= s.n; i++) {
    const seat = order[(at + i) % s.n];
    if (s.alive[seat]) return seat;
  }
  return from;
}
export function shEligibleChancellors(s: Pick<ShState, 'n' | 'alive' | 'president' | 'lastGov'>): number[] {
  const out: number[] = [];
  const few = aliveCount(s) <= 5;
  for (let seat = 0; seat < s.n; seat++) {
    if (!s.alive[seat] || seat === s.president) continue;
    if (s.lastGov) {
      if (seat === s.lastGov.chancellor) continue;
      // With five or fewer players only the last Chancellor is term limited.
      if (!few && seat === s.lastGov.president) continue;
    }
    out.push(seat);
  }
  return out;
}
function powerTargets(s: ShState): number[] {
  const out: number[] = [];
  for (let seat = 0; seat < s.n; seat++) {
    if (!s.alive[seat] || seat === s.president) continue;
    if (s.power === 'investigate' && s.investigated[seat]) continue;
    out.push(seat);
  }
  return out;
}
export function vetoUnlocked(s: Pick<ShState, 'fascist'>): boolean {
  return s.fascist >= 5;
}

function startRound(s: ShState, events: ShEvent[], specialTarget?: number) {
  s.round += 1;
  if (specialTarget !== undefined) {
    s.president = specialTarget;
    s.special = true;
  } else {
    s.rotation = nextAlive(s, s.rotation);
    s.president = s.rotation;
    s.special = false;
  }
  s.chancellor = null;
  s.votes = Array(s.n).fill(null);
  s.hand = [];
  s.vetoRefused = false;
  s.power = null;
  s.peek = null;
  s.phase = 'nominate';
  events.push({ t: 'candidate', president: s.president, special: s.special, round: s.round });
}

function finish(s: ShState, events: ShEvent[], winner: Party, reason: WinReason) {
  s.winner = winner;
  s.winReason = reason;
  s.phase = 'over';
  s.hand = [];
  s.peek = null;
  s.power = null;
  s.claimSlots = s.claimSlots.map(() => []);
  events.push({ t: 'game_over', winner, reason, roles: [...s.roles], roleArt: [...s.roleArt] });
}

function reshuffleIfNeeded(s: ShState, events: ShEvent[]) {
  if (s.deck.length < 3) {
    s.deck = shuffle(s, [...s.deck, ...s.discard]);
    s.discard = [];
    events.push({ t: 'reshuffle', deck: s.deck.length });
  }
}

// Places a policy on its track. Returns true when the game ended.
function enact(s: ShState, events: ShEvent[], policy: Policy, by: 'government' | 'chaos'): boolean {
  if (policy === 'L') s.liberal += 1;
  else s.fascist += 1;
  events.push({ t: 'enacted', policy, by, liberal: s.liberal, fascist: s.fascist, slot: (policy === 'L' ? s.liberal : s.fascist) - 1 });
  if (s.liberal >= 5) {
    finish(s, events, 'liberal', 'policies');
    return true;
  }
  if (s.fascist >= 6) {
    finish(s, events, 'fascist', 'policies');
    return true;
  }
  if (policy === 'F' && s.fascist === 5) events.push({ t: 'veto_unlocked' });
  return false;
}

function advanceTracker(s: ShState, events: ShEvent[]): boolean {
  s.tracker += 1;
  events.push({ t: 'tracker', value: s.tracker });
  if (s.tracker < 3) return false;
  // Three failed governments: the top policy is enacted, its power is ignored, term limits are forgotten.
  const top = s.deck.shift()!;
  events.push({ t: 'chaos', policy: top });
  const gov = s.governments[s.governments.length - 1];
  if (gov) gov.chaos = top;
  s.tracker = 0;
  s.lastGov = null;
  if (enact(s, events, top, 'chaos')) return true;
  events.push({ t: 'tracker', value: 0 });
  reshuffleIfNeeded(s, events);
  return false;
}

// ---------- actions ----------
export function shLegalActions(s: ShState, seat: number): ShAction[] {
  if (seat < 0 || seat >= s.n) return [];
  if (s.phase === 'roles') return s.ready[seat] ? [] : [{ type: 'ready' }];
  if (s.phase === 'over' || !s.alive[seat]) return [];
  switch (s.phase) {
    case 'nominate':
      return seat === s.president ? shEligibleChancellors(s).map((target) => ({ type: 'nominate', target }) as ShAction) : [];
    case 'vote':
      return s.votes[seat] === null ? [{ type: 'vote', ja: true }, { type: 'vote', ja: false }] : [];
    case 'president_discard':
      return seat === s.president ? s.hand.map((_, index) => ({ type: 'discard', index }) as ShAction) : [];
    case 'chancellor_enact': {
      if (seat !== s.chancellor) return [];
      const out: ShAction[] = s.hand.map((_, index) => ({ type: 'enact', index }) as ShAction);
      if (vetoUnlocked(s) && !s.vetoRefused) out.push({ type: 'veto' });
      return out;
    }
    case 'veto_response':
      return seat === s.president ? [{ type: 'veto_response', consent: true }, { type: 'veto_response', consent: false }] : [];
    case 'power': {
      if (seat !== s.president || !s.power) return [];
      if (s.power === 'peek') return [{ type: 'peek_ack' }];
      const type = s.power;
      return powerTargets(s).map((target) => ({ type, target }) as ShAction);
    }
  }
  return [];
}

export const CLAIM_VALUES: Record<ClaimKind, string[]> = {
  drew: ['LLL', 'LLF', 'LFF', 'FFF'],
  got: ['LL', 'LF', 'FF'],
  inv: ['liberal', 'fascist'],
  peek: ['LLL', 'LLF', 'LFL', 'LFF', 'FLL', 'FLF', 'FFL', 'FFF'],
};

function sameAction(a: ShAction, b: ShAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applyShAction(prev: ShState, seat: number, action: ShAction): ShResult {
  const fail = (error: string): ShResult => ({ state: prev, events: [], error });
  if (seat < 0 || seat >= prev.n) return fail('No such seat');

  // Table talk and claims never block the game.
  if (action.type === 'say') {
    if (!prev.alive[seat] && prev.phase !== 'over') return fail('The dead do not speak');
    const text = String(action.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!text) return fail('Nothing to say');
    const s = structuredClone(prev);
    s.talk.push({ seat, text, round: s.round });
    if (s.talk.length > 80) s.talk.splice(0, s.talk.length - 80);
    return { state: s, events: [{ t: 'say', seat, text }] };
  }
  if (action.type === 'claim') {
    const idx = prev.claimSlots[seat].findIndex((c) => c.kind === action.kind);
    if (idx < 0) return fail('Nothing to claim');
    if (!CLAIM_VALUES[action.kind].includes(action.value)) return fail('Not a valid claim');
    const s = structuredClone(prev);
    const [slot] = s.claimSlots[seat].splice(idx, 1);
    const gov = s.governments[slot.gov];
    if (gov) gov.claims[action.kind] = action.value;
    return { state: s, events: [{ t: 'claim', seat, kind: action.kind, value: action.value, target: slot.target }] };
  }

  const legal = shLegalActions(prev, seat);
  if (!legal.some((a) => sameAction(a, action))) return fail('Not a legal move right now');
  const s = structuredClone(prev);
  const events: ShEvent[] = [];

  switch (action.type) {
    case 'ready': {
      s.ready[seat] = true;
      if (s.ready.every(Boolean)) startRound(s, events);
      break;
    }
    case 'nominate': {
      s.chancellor = action.target;
      s.votes = Array(s.n).fill(null);
      s.phase = 'vote';
      events.push({ t: 'nominated', president: s.president, chancellor: action.target });
      break;
    }
    case 'vote': {
      s.votes[seat] = action.ja;
      events.push({ t: 'vote_cast', seat });
      const pending = s.alive.some((alive, i) => alive && s.votes[i] === null);
      if (pending) break;
      const ja = s.votes.filter((v) => v === true).length;
      const nein = s.votes.filter((v) => v === false).length;
      const passed = ja > nein;
      const chancellor = s.chancellor!;
      s.governments.push({
        round: s.round, president: s.president, chancellor, votes: [...s.votes], passed,
        policy: null, vetoed: false, chaos: null, power: null, powerTarget: null, claims: {},
      });
      events.push({ t: 'vote_result', votes: [...s.votes], ja, nein, passed, president: s.president, chancellor });
      if (!passed) {
        if (advanceTracker(s, events)) break;
        startRound(s, events);
        break;
      }
      events.push({ t: 'government', president: s.president, chancellor });
      s.lastGov = { president: s.president, chancellor };
      if (s.tracker !== 0) {
        s.tracker = 0;
        events.push({ t: 'tracker', value: 0 });
      }
      if (s.fascist >= 3) {
        if (s.roles[chancellor] === 'hitler') {
          finish(s, events, 'fascist', 'hitler_elected');
          break;
        }
        if (!s.notHitler[chancellor]) {
          s.notHitler[chancellor] = true;
          events.push({ t: 'not_hitler', chancellor });
        }
      }
      // A new legislative session closes any claims left open from the previous one.
      s.claimSlots = s.claimSlots.map(() => []);
      s.hand = s.deck.splice(0, 3);
      s.intel[s.president].push({ kind: 'drew', round: s.round, cards: [...s.hand] });
      s.phase = 'president_discard';
      events.push({ t: 'draw3', president: s.president });
      break;
    }
    case 'discard': {
      const [card] = s.hand.splice(action.index, 1);
      s.discard.push(card);
      s.intel[s.chancellor!].push({ kind: 'got', round: s.round, cards: [...s.hand] });
      s.phase = 'chancellor_enact';
      events.push({ t: 'president_discard', president: s.president, chancellor: s.chancellor! });
      break;
    }
    case 'veto': {
      s.phase = 'veto_response';
      events.push({ t: 'veto_proposed', chancellor: s.chancellor!, president: s.president });
      break;
    }
    case 'veto_response': {
      if (!action.consent) {
        s.vetoRefused = true;
        s.phase = 'chancellor_enact';
        events.push({ t: 'veto_refused', president: s.president, chancellor: s.chancellor! });
        break;
      }
      s.discard.push(...s.hand);
      s.hand = [];
      s.governments[s.governments.length - 1].vetoed = true;
      events.push({ t: 'veto_passed', president: s.president, chancellor: s.chancellor! });
      // The session is over: top up the draw pile before the tracker can force a top-deck.
      reshuffleIfNeeded(s, events);
      if (advanceTracker(s, events)) break;
      startRound(s, events);
      break;
    }
    case 'enact': {
      const [policy] = s.hand.splice(action.index, 1);
      s.discard.push(...s.hand);
      s.hand = [];
      const govIndex = s.governments.length - 1;
      const gov = s.governments[govIndex];
      gov.policy = policy;
      const president = s.president;
      const chancellor = s.chancellor!;
      if (enact(s, events, policy, 'government')) break;
      s.claimSlots[president].push({ kind: 'drew', gov: govIndex });
      s.claimSlots[chancellor].push({ kind: 'got', gov: govIndex });
      reshuffleIfNeeded(s, events);
      const power = policy === 'F' ? TRACK_POWERS[s.bracket][s.fascist - 1] : null;
      if (!power) {
        startRound(s, events);
        break;
      }
      s.power = power;
      s.phase = 'power';
      gov.power = power;
      events.push({ t: 'power', power, president });
      if (power === 'peek') {
        s.peek = s.deck.slice(0, 3);
        s.intel[president].push({ kind: 'peek', round: s.round, cards: [...s.peek] });
        events.push({ t: 'peeked', president });
      }
      break;
    }
    case 'peek_ack': {
      s.claimSlots[s.president].push({ kind: 'peek', gov: s.governments.length - 1 });
      startRound(s, events);
      break;
    }
    case 'investigate': {
      const party = partyOf(s.roles[action.target]);
      s.investigated[action.target] = true;
      s.intel[seat].push({ kind: 'investigate', round: s.round, target: action.target, party });
      s.governments[s.governments.length - 1].powerTarget = action.target;
      s.claimSlots[seat].push({ kind: 'inv', gov: s.governments.length - 1, target: action.target });
      events.push({ t: 'investigated', president: seat, target: action.target });
      startRound(s, events);
      break;
    }
    case 'special_election': {
      s.governments[s.governments.length - 1].powerTarget = action.target;
      events.push({ t: 'special_election', president: seat, target: action.target });
      startRound(s, events, action.target);
      break;
    }
    case 'execute': {
      s.alive[action.target] = false;
      s.claimSlots[action.target] = [];
      s.governments[s.governments.length - 1].powerTarget = action.target;
      const wasHitler = s.roles[action.target] === 'hitler';
      events.push({ t: 'executed', president: seat, target: action.target, wasHitler });
      if (wasHitler) {
        finish(s, events, 'liberal', 'hitler_executed');
        break;
      }
      // Killing anyone but Hitler proves nothing about the survivors, but the victim is cleared.
      s.notHitler[action.target] = true;
      startRound(s, events);
      break;
    }
  }
  return { state: s, events };
}

// ---------- views ----------
export interface ShPublicView {
  game: 'secrethitler';
  n: number;
  names: string[];
  ai: boolean[];
  slots: number[];
  bracket: Bracket;
  alive: boolean[];
  ready: boolean[];
  liberal: number;
  fascist: number;
  tracker: number;
  phase: ShPhase;
  round: number;
  president: number;
  chancellor: number | null;
  special: boolean;
  lastGov: { president: number; chancellor: number } | null;
  eligible: number[];
  voted: boolean[];
  deck: number;
  discard: number;
  power: Power | null;
  investigated: boolean[];
  notHitler: boolean[];
  governments: GovRecord[];
  talk: TalkEntry[];
  vetoUnlocked: boolean;
  winner: Party | null;
  winReason: WinReason | null;
  // Revealed only when the game is over.
  roles: Role[] | null;
  roleArt: number[] | null;
}
export interface ShPrivateView extends ShPublicView {
  seat: number;
  role: Role;
  party: Party;
  myArt: number;
  // Seats this player knows the role of (fascists know each other; Hitler knows them at 5 or 6 players).
  known: { seat: number; role: Role }[];
  hand: Policy[];
  peek: Policy[] | null;
  myVote: boolean | null;
  intel: Intel[];
  claimSlots: ClaimSlot[];
  actions: ShAction[];
}

export function shPublicView(s: ShState): ShPublicView {
  const over = s.phase === 'over';
  return {
    game: 'secrethitler',
    n: s.n,
    names: s.names,
    ai: s.ai,
    slots: s.slots,
    bracket: s.bracket,
    alive: s.alive,
    ready: s.ready,
    liberal: s.liberal,
    fascist: s.fascist,
    tracker: s.tracker,
    phase: s.phase,
    round: s.round,
    president: s.president,
    chancellor: s.chancellor,
    special: s.special,
    lastGov: s.lastGov,
    eligible: s.phase === 'nominate' ? shEligibleChancellors(s) : [],
    voted: s.votes.map((v) => v !== null),
    deck: s.deck.length,
    discard: s.discard.length,
    power: s.power,
    investigated: s.investigated,
    notHitler: s.notHitler,
    governments: s.governments,
    talk: s.talk,
    vetoUnlocked: vetoUnlocked(s),
    winner: s.winner,
    winReason: s.winReason,
    roles: over ? s.roles : null,
    roleArt: over ? s.roleArt : null,
  };
}

export function knownTo(s: ShState, seat: number): { seat: number; role: Role }[] {
  const role = s.roles[seat];
  if (role === 'liberal') return [];
  if (role === 'hitler' && s.n > 6) return [];
  const out: { seat: number; role: Role }[] = [];
  for (let i = 0; i < s.n; i++) if (i !== seat && s.roles[i] !== 'liberal') out.push({ seat: i, role: s.roles[i] });
  return out;
}

export function shPrivateView(s: ShState, seat: number): ShPrivateView {
  const holdsHand =
    (s.phase === 'president_discard' && seat === s.president) ||
    ((s.phase === 'chancellor_enact' || s.phase === 'veto_response') && seat === s.chancellor);
  return {
    ...shPublicView(s),
    seat,
    role: s.roles[seat],
    party: partyOf(s.roles[seat]),
    myArt: s.roleArt[seat],
    known: knownTo(s, seat),
    hand: holdsHand ? s.hand : [],
    peek: s.phase === 'power' && s.power === 'peek' && seat === s.president ? s.peek : null,
    myVote: s.votes[seat],
    intel: s.intel[seat],
    claimSlots: s.claimSlots[seat],
    actions: shLegalActions(s, seat),
  };
}

// Seats the game is waiting on right now.
export function shWaitingOn(s: ShState): number[] {
  const out: number[] = [];
  for (let seat = 0; seat < s.n; seat++) if (shLegalActions(s, seat).length) out.push(seat);
  return out;
}

// ---------- text ----------
export const POWER_LABEL: Record<Power, string> = {
  investigate: 'INVESTIGATE LOYALTY',
  special_election: 'CALL SPECIAL ELECTION',
  peek: 'POLICY PEEK',
  execute: 'EXECUTION',
};
const pol = (p: Policy) => (p === 'L' ? 'Liberal' : 'Fascist');
export function claimText(kind: ClaimKind, value: string, names: string[], target?: number): string {
  const cards = (v: string) => v.split('').map((c) => (c === 'L' ? 'Liberal' : 'Fascist')).join(', ');
  if (kind === 'drew') return `claims the draw was ${cards(value)}`;
  if (kind === 'got') return `claims to have received ${cards(value)}`;
  if (kind === 'peek') return `claims the top three are ${cards(value)}`;
  return `claims ${target !== undefined ? names[target] : 'the target'} is ${value}`;
}
// One plain line per public event. Used for the Claude seat's history and the screen log.
export function describeShEvent(e: ShEvent, names: string[]): string | null {
  switch (e.t) {
    case 'game_start': return `A ${e.n} player game begins.`;
    case 'roles_dealt': return null;
    case 'candidate': return `Round ${e.round}. ${names[e.president]} is the presidential candidate${e.special ? ' by special election' : ''}.`;
    case 'nominated': return `${names[e.president]} nominates ${names[e.chancellor]} as chancellor.`;
    case 'vote_cast': return null;
    case 'vote_result': {
      const ja = e.votes.map((v, i) => (v === true ? names[i] : null)).filter(Boolean).join(', ') || 'nobody';
      const nein = e.votes.map((v, i) => (v === false ? names[i] : null)).filter(Boolean).join(', ') || 'nobody';
      return `Vote on ${names[e.president]} + ${names[e.chancellor]}: ${e.passed ? 'PASSED' : 'FAILED'} ${e.ja} to ${e.nein}. Ja: ${ja}. Nein: ${nein}.`;
    }
    case 'government': return `${names[e.president]} is President and ${names[e.chancellor]} is Chancellor.`;
    case 'not_hitler': return `${names[e.chancellor]} took office after three fascist policies and is confirmed not Hitler.`;
    case 'tracker': return e.value > 0 ? `The election tracker moves to ${e.value} of 3.` : null;
    case 'chaos': return `Three governments failed. The country enacts the top policy: ${pol(e.policy)}. Term limits are reset.`;
    case 'draw3': return null;
    case 'president_discard': return null;
    case 'veto_proposed': return `Chancellor ${names[e.chancellor]} asks to veto the agenda.`;
    case 'veto_refused': return `President ${names[e.president]} refuses the veto.`;
    case 'veto_passed': return `President ${names[e.president]} consents. The agenda is vetoed and both policies are discarded.`;
    case 'enacted': return `A ${pol(e.policy)} policy is enacted${e.by === 'chaos' ? ' by the populace' : ''}. Liberal ${e.liberal} of 5, Fascist ${e.fascist} of 6.`;
    case 'veto_unlocked': return 'Veto power is unlocked.';
    case 'reshuffle': return `The discard pile is shuffled into a new draw pile of ${e.deck}.`;
    case 'power': return `President ${names[e.president]} gains a power: ${POWER_LABEL[e.power]}.`;
    case 'investigated': return `${names[e.president]} investigates the loyalty of ${names[e.target]}.`;
    case 'special_election': return `${names[e.president]} calls a special election. ${names[e.target]} is the next candidate.`;
    case 'peeked': return `${names[e.president]} looks at the top three policies.`;
    case 'executed': return `${names[e.president]} executes ${names[e.target]}.${e.wasHitler ? ' It was Hitler.' : ' It was not Hitler.'}`;
    case 'claim': return `${names[e.seat]} ${claimText(e.kind, e.value, names, e.target)}.`;
    case 'say': return `${names[e.seat]} says: "${e.text}"`;
    case 'game_over': {
      const why = e.reason === 'policies' ? (e.winner === 'liberal' ? 'five liberal policies' : 'six fascist policies') : e.reason === 'hitler_elected' ? 'Hitler was elected Chancellor' : 'Hitler was executed';
      return `Game over. The ${e.winner}s win: ${why}.`;
    }
  }
}
