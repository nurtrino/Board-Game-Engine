// Kanban EV reducer: full enforcement of the day loop (department
// selection, work shifts, Sandra's evaluation + departmental tasks),
// the five departments' tasks, meetings, end-of-week scoring, and final
// scoring — per docs/specs/kanban-ev.md (rulebook digest with page refs).
// Multi-step choices run through the pending-decision queue in state.ts.

import {
  AWARD_BY_GUID, CAR_VALUES, CERT_SECTIONS, CONVEYOR, DEPTS, DESIGN_BY_GUID,
  ENTRY_NODE, GOAL_BY_GUID, KANBAN_RULES as R, MODELS, ORDER_BY_GUID, PARTS, TOP_ROW_PARTS,
  UPGRADE_SPACES, certCount, certOrder, designCapacity, isCertified, kbShuffle, partCapacity,
  speechCapacity, testedDesigns,
  type Benefit, type CarModel, type Dept, type KanbanPlayer, type KanbanState, type Part,
} from './state.js';

export type KanbanAction =
  | { type: 'choose'; space?: number; part?: Part; design?: string; dept?: Dept; option?: number; node?: number; garage?: number; goal?: string }
  | { type: 'use_banked'; n: number }
  | { type: 'train'; dept?: Dept } // 1 shift
  | { type: 'homework'; dept?: Dept } // 1 book, no shift
  | { type: 'recycle'; give: Part; take: Part } // free, any time on your turn
  | { type: 'select_design'; index: number } // design row spot 0..7
  | { type: 'advanced_design'; stack: 'central' | 'officeTop' | 'officeBottom' }
  | { type: 'issue_order'; card: string; placement: 0 | 1 | 2 | 3 }
  | { type: 'collect_parts'; warehouse: Part; count: number }
  | { type: 'receive_voucher' }
  | { type: 'provide_part'; model: CarModel; part: Part; voucher?: boolean }
  | { type: 'claim_car'; queueIndex: number; design: string }
  | { type: 'upgrade_design'; design: string; space: number; voucher?: boolean; double?: boolean }
  | { type: 'admin_pick'; dept: Dept }
  | { type: 'end_turn' }
  | { type: 'speak'; playGoal?: string; placeToken?: number } // meeting
  | { type: 'pass' };

// kanban order placements: which symbol indices land on the top row's side
// (mirrors the mod's Calculate: two line positions x two rotations)
export const ORDER_SPLITS: { top: number[]; bottom: number[] }[] = [
  { top: [0, 1, 2, 3], bottom: [4, 5] },
  { top: [0, 1], bottom: [2, 3, 4, 5] },
  { top: [2, 3, 4, 5], bottom: [0, 1] },
  { top: [4, 5], bottom: [0, 1, 2, 3] },
];

export interface KanbanResult { ok: boolean; error?: string }
const err = (error: string): KanbanResult => ({ ok: false, error });
const ok: KanbanResult = { ok: true };

function ev(s: KanbanState, p: KanbanPlayer, title: string, detail?: string): void {
  s.eventSeq++;
  s.lastEvent = { seq: s.eventSeq, player: p.name, color: p.color, title, detail };
  s.log.push(`${p.name}: ${title}${detail ? ` · ${detail}` : ''}`);
}

// ---------- benefits ----------

/** Apply a benefit. During your own work turn, tokens/books/vouchers/banked
 * shifts land in `gains` (unusable until end of turn, rulebook p9). */
function applyBenefit(s: KanbanState, p: KanbanPlayer, b: Benefit | null | undefined): void {
  if (!b) return;
  const deferred = s.phase === 'work' && s.turn === p.seat && !p.done;
  if (b.pp) p.pp = Math.max(0, p.pp + b.pp);
  for (let i = 0; i < (b.speech ?? 0); i++) gainGeneric(s, p, deferred);
  if (deferred) {
    p.gains.bankedShifts += b.bankedShifts ?? 0;
    p.gains.books += b.books ?? 0;
    p.gains.vouchers += b.vouchers ?? 0;
  } else {
    p.bankedShifts = Math.min(R.shiftBankMax, p.bankedShifts + (b.bankedShifts ?? 0));
    p.books = Math.min(R.bookSlots, p.books + (b.books ?? 0));
    p.vouchers = Math.min(R.voucherSlots, p.vouchers + (b.vouchers ?? 0));
  }
}

/** Gaining a generic speech token: swap for one of your own onto the board
 * if a slot is free, else keep the generic beside the board (p9). */
function gainGeneric(s: KanbanState, p: KanbanPlayer, deferred: boolean): void {
  if (deferred) { p.gains.generic++; return; }
  if (p.speechAside > 0 && p.speechOnBoard < speechCapacity(p)) {
    p.speechAside--;
    p.speechOnBoard++;
  } else {
    p.genericAside++;
  }
}

function foldGains(s: KanbanState, p: KanbanPlayer): void {
  p.bankedShifts = Math.min(R.shiftBankMax, p.bankedShifts + p.gains.bankedShifts);
  p.books = Math.min(R.bookSlots, p.books + p.gains.books);
  p.vouchers = Math.min(R.voucherSlots, p.vouchers + p.gains.vouchers);
  const generic = p.gains.generic;
  p.gains = { bankedShifts: 0, books: 0, vouchers: 0, generic: 0 };
  for (let i = 0; i < generic; i++) gainGeneric(s, p, false);
}

// ---------- factory goals ----------

function checkFactoryGoals(s: KanbanState, p: KanbanPlayer): void {
  for (const g of s.factoryGoals) {
    if (g.speech <= 0 || p.factoryGoalsTaken.includes(g.id)) continue;
    const have = g.kind === 'cars' ? p.garages.filter(Boolean).length
      : g.kind === 'upgrades' ? p.upgraded.length
      : certCount(p);
    if (have >= g.need) {
      g.speech--;
      p.factoryGoalsTaken.push(g.id);
      gainGeneric(s, p, s.phase === 'work' && s.turn === p.seat && !p.done);
      ev(s, p, 'Factory goal met', `${g.kind} ${g.need}`);
    }
  }
  s.factoryGoals = s.factoryGoals.filter((g) => g.speech > 0);
}

// ---------- training / certification ----------

function trainOne(s: KanbanState, p: KanbanPlayer, dept: Dept): void {
  if (p.training[dept] >= R.trainingTrack) return;
  const before = p.training[dept];
  p.training[dept]++;
  p.trainingArrival[dept] = ++s.arrivalCounter;
  if (before < R.certifiedAt && p.training[dept] >= R.certifiedAt) {
    if (dept === 'RnD' && p.doubleUpgrade === 'locked') p.doubleUpgrade = 'ready';
    ev(s, p, `Certified in ${dept}`);
    const next = Math.min(5, p.cert.section + 1);
    s.pending.push({ seat: p.seat, decision: { kind: 'certSpace', section: next, label: `Certified in ${dept}: pick a space in section ${next}` } });
    s.turn = s.pending[0].seat;
  }
  if (p.training[dept] === R.trainingTrack) {
    // expert: first arrival takes the stack's generic token; pick an award if any remain
    if (s.awardSpeech[dept] > 0) { s.awardSpeech[dept] = 0; gainGeneric(s, p, s.turn === p.seat && s.phase === 'work'); }
    if (s.awards[dept].length > 0 && !p.awardsTaken.includes(dept)) {
      p.awardsTaken.push(dept);
      s.pending.push({ seat: p.seat, decision: { kind: 'award', dept, options: s.awards[dept], label: `Expert in ${dept}: choose an award` } });
      s.turn = s.pending[0].seat;
    }
    ev(s, p, `Expert in ${dept}`);
  }
}

/** which departments this player may train/work in right now */
function activeDepts(p: KanbanPlayer): Dept[] {
  if (!p.workstation) return [];
  if (p.workstation.dept === 'Admin') return p.adminDept ? ['Admin', p.adminDept] : ['Admin'];
  return [p.workstation.dept];
}

function spendShift(s: KanbanState, p: KanbanPlayer): KanbanResult {
  if (p.shiftsLeft <= 0) return err('no shifts left — use banked shifts or end your turn');
  p.shiftsLeft--;
  return ok;
}

// ---------- design row ----------

function refillDesignRow(s: KanbanState): void {
  // slide right within each row of 4, then refill from that row's office
  // stack, then central; both empty -> top row first (rulebook p10)
  for (let row = 0; row < 2; row++) {
    const idx = [0, 1, 2, 3].map((c) => row * 4 + c);
    const tiles = idx.map((i) => s.designRow[i]).filter((t): t is string => t !== null);
    while (tiles.length < 4) {
      const office = row === 0 ? s.officeTop : s.officeBottom;
      const from = office.length ? office : s.central;
      if (!from.length) break;
      tiles.unshift(from.shift()!);
    }
    for (let c = 3; c >= 0; c--) s.designRow[row * 4 + c] = tiles.pop() ?? null;
  }
}

// ---------- conveyor ----------

/** Move the car at `from` into `to`; whoever was at `to` is displaced
 * onward along its own arrows (branch choices go to the player). */
function moveCarTo(s: KanbanState, p: KanbanPlayer, from: number, to: number): KanbanResult {
  const car = s.conveyor[from];
  if (!car) return ok;
  const occupant = s.conveyor[to] ?? null;
  s.conveyor[from] = null;
  s.conveyor[to] = car;
  if (occupant) return displaceOnward(s, p, to, occupant);
  return ok;
}

/** `car` was pushed out of `node`; send it along node's arrows. */
function displaceOnward(s: KanbanState, p: KanbanPlayer, node: number, car: CarModel): KanbanResult {
  const targets = CONVEYOR[node].targets;
  if (targets.length === 0) { carRollsOut(s, p, car); return ok; }
  if (targets.length === 1) {
    const to = targets[0];
    const occupant = s.conveyor[to] ?? null;
    s.conveyor[to] = car;
    if (occupant) return displaceOnward(s, p, to, occupant);
    return ok;
  }
  s.displacing = car;
  s.pending.push({ seat: p.seat, decision: { kind: 'displace', node, options: targets, label: `Choose where the displaced ${car} car goes` } });
  s.turn = p.seat;
  return ok;
}

function carRollsOut(s: KanbanState, p: KanbanPlayer, car: CarModel): void {
  // exit gate PP: the mod's arrow graph funnels every exit through the
  // middle gate (2 PP); node/gate mapping re-verified in the client fit
  p.pp += R.conveyorExitPP.middle;
  for (const d of s.demands) {
    if (d.tile.model === car && d.speech > 0) { d.speech--; gainGeneric(s, p, true); break; }
  }
  const cars = s.testTrack.filter(Boolean);
  if (cars.length >= R.maxBehindPace) {
    // the car directly behind the pace car returns to the supply
    const firstIdx = s.testTrack.findIndex(Boolean);
    s.carsSupply[s.testTrack[firstIdx]!]++;
    s.testTrack[firstIdx] = null;
  }
  s.testTrack.push(car);
  ev(s, p, `${car} car rolls out`, `+${R.conveyorExitPP.middle} PP`);
}

// ---------- day flow ----------

export function workstationShifts(dept: Dept, slot: number): number {
  if (dept === 'Admin') return slot === 0 ? 1 : 2;
  return slot === 0 ? 2 : 3;
}

/** top-to-bottom position key; Sandra's desk sorts below everything */
function posKey(dept: Dept | null, slot: number, desk: boolean): number {
  if (desk || dept === null) return 999;
  return DEPTS.indexOf(dept) * 10 + slot;
}

function beginDay(s: KanbanState): void {
  s.day++;
  s.sandraDone = false;
  for (const p of s.players) {
    p.prevDept = p.workstation?.dept ?? null;
    p.done = false;
    p.shiftsDealt = false;
    p.shiftsLeft = 0;
    p.bankedSpent = 0;
    p.adminDept = null;
    p.orderIssued = false;
    p.voucherTaken = false;
    p.claimedThisTurn = 0;
  }
  // selection order: day 1 = certification order; later = position order
  // (including Sandra at her spot; she selects when her position comes up)
  if (s.day === 1) {
    s.order = certOrder(s);
  } else {
    const seats = s.players.map((p) => ({ seat: p.seat, key: posKey(p.workstation?.dept ?? null, p.workstation?.slot ?? 0, false) }));
    seats.push({ seat: -1, key: posKey(s.sandra.dept, s.sandra.slot, s.sandra.desk) }); // -1 = Sandra
    seats.sort((a, b) => a.key - b.key);
    s.order = seats.map((x) => x.seat);
  }
  s.orderIdx = -1;
  s.phase = 'select';
  for (const p of s.players) p.workstation = null;
  s.log.push(`Day ${s.day}: choose workstations.`);
  advanceSelection(s);
}

function slotFree(s: KanbanState, dept: Dept, slot: number): boolean {
  if (s.players.some((p) => p.workstation?.dept === dept && p.workstation.slot === slot)) return false;
  if (!s.sandra.desk && s.sandra.dept === dept && s.sandra.slot === slot) return false;
  return true;
}

function sandraSelects(s: KanbanState): void {
  // next empty workstation, next department top->bottom from her current
  const startIdx = s.sandra.desk ? 0 : (DEPTS.indexOf(s.sandra.dept!) + 1) % DEPTS.length;
  for (let i = 0; i < DEPTS.length; i++) {
    const dept = DEPTS[(startIdx + i) % DEPTS.length];
    if (dept === 'Admin') { s.sandra = { dept: null, slot: 0, desk: true }; s.log.push('Sandra sits at her desk.'); return; }
    const slot = [0, 1].find((sl) => !s.players.some((p) => p.workstation?.dept === dept && p.workstation.slot === sl));
    if (slot !== undefined) {
      s.sandra = { dept, slot, desk: false };
      s.log.push(`Sandra moves to ${dept}.`);
      return;
    }
  }
  s.sandra = { dept: null, slot: 0, desk: true };
}

function advanceSelection(s: KanbanState): void {
  for (;;) {
    s.orderIdx++;
    if (s.orderIdx >= s.order.length) {
      // day 2 has Sandra selecting last only if she wasn't in the order
      if (s.day > 1 && !s.order.includes(-1)) sandraSelects(s);
      beginWork(s);
      return;
    }
    const actor = s.order[s.orderIdx];
    if (actor === -1) { sandraSelects(s); continue; }
    s.turn = actor;
    s.pending = [{ seat: actor, decision: { kind: 'selectWorkstation', label: 'Choose a workstation for the day' } }];
    return;
  }
}

function beginWork(s: KanbanState): void {
  s.phase = 'work';
  s.pending = [];
  advanceWork(s);
}

function advanceWork(s: KanbanState): void {
  type Actor = { key: number; seat: number };
  const actors: Actor[] = s.players
    .filter((p) => p.workstation)
    .map((p) => ({ key: posKey(p.workstation!.dept, p.workstation!.slot, false), seat: p.seat }));
  if (!(s.sandra.desk && s.day === 1)) {
    actors.push({ key: posKey(s.sandra.dept, s.sandra.slot, s.sandra.desk), seat: -1 });
  }
  actors.sort((a, b) => a.key - b.key);

  for (const a of actors) {
    if (a.seat === -1) {
      if (s.sandraDone) continue;
      s.sandraDone = true;
      sandraTurn(s);
      if (s.phase !== 'work') return; // end-of-week scoring may have ended the game
      continue;
    }
    const p = s.players[a.seat];
    if (p.done) continue;
    s.turn = a.seat;
    if (!p.shiftsDealt) {
      p.shiftsDealt = true;
      p.shiftsLeft = workstationShifts(p.workstation!.dept, p.workstation!.slot);
      cleanFullAssembly(s, p);
      ev(s, p, `Works in ${p.workstation!.dept}`, `${p.shiftsLeft} shifts`);
    }
    return; // wait for this player's actions
  }
  endDay(s);
}

function cleanFullAssembly(s: KanbanState, p: KanbanPlayer): void {
  if (!activeDepts(p).includes('Assembly')) return;
  for (const m of MODELS) {
    if (s.assemblyParts[m].length >= 6) {
      for (const part of s.assemblyParts[m]) s.partsSupply[part]++;
      s.assemblyParts[m] = [];
      s.log.push(`${m} assembly spaces cleaned out.`);
    }
  }
}

// ---------- Sandra ----------

function sandraTurn(s: KanbanState): void {
  if (s.sandra.desk) { endOfWeekScoring(s); checkGameEndNow(s); return; }
  const dept = s.sandra.dept!;
  // evaluation: least-trained player(s) in her department
  const min = Math.min(...s.players.map((p) => p.training[dept]));
  for (const p of s.players) {
    if (p.training[dept] !== min) continue;
    const fails = dept === 'RnD' ? p.upgraded.length <= 2
      : dept === 'Assembly' ? p.garages.filter(Boolean).length <= 2
      : dept === 'Logistics' ? p.parts.length <= 2
      : dept === 'Design' ? p.designs.length <= 2
      : certCount(p) <= 2;
    if (fails) {
      const loss = 1 + Math.max(0, R.evaluationThreshold - p.bankedShifts);
      p.pp = Math.max(0, p.pp - loss);
      ev(s, p, 'Evaluated by Sandra', `-${loss} PP`);
    }
  }
  switch (dept) {
    case 'RnD':
      advancePace(s, 1);
      s.log.push('Sandra: the pace car advances.');
      break;
    case 'Assembly':
      for (const m of MODELS) {
        for (const part of s.assemblyParts[m]) s.partsSupply[part]++;
        s.assemblyParts[m] = [];
      }
      s.log.push('Sandra: all assembly spaces cleared.');
      break;
    case 'Logistics':
      for (const part of PARTS) {
        if (s.warehouses[part] > 1) { s.partsSupply[part] += s.warehouses[part] - 1; s.warehouses[part] = 1; }
      }
      s.log.push('Sandra: warehouses stripped to one part.');
      break;
    case 'Design': {
      const back: string[] = [];
      for (const i of [3, 7, 2, 6]) { // the rightmost two columns
        if (s.designRow[i]) { back.push(s.designRow[i]!); s.designRow[i] = null; }
      }
      s.central.push(...kbShuffle(s, back));
      refillDesignRow(s);
      s.log.push('Sandra: the design row is recycled.');
      break;
    }
    case 'Admin':
      endOfWeekScoring(s);
      break;
  }
}

function advancePace(s: KanbanState, n: number): void {
  for (let i = 0; i < n; i++) {
    s.pace = (s.pace + 1) % R.testTrackSpaces;
    if ((R.stripedSpaces as readonly number[]).includes(s.pace)) s.meetingTriggered = true;
  }
}

function endOfWeekScoring(s: KanbanState): void {
  for (const p of s.players) {
    let pp = 0;
    const tested = testedDesigns(p);
    for (const car of p.garages) {
      if (!car) continue;
      pp += s.upgrades[car].filter(Boolean).length; // upgrades by anyone
      pp += tested.filter((t) => t.model === car).length;
    }
    if (pp > 0) { p.pp += pp; ev(s, p, 'End of week', `+${pp} PP`); }
  }
  if (s.week < R.weekMax) s.week++;
  s.log.push(`End of week ${s.week}.`);
}

// ---------- day end / meetings / game end ----------

function endDay(s: KanbanState): void {
  if (s.meetingTriggered) { beginMeeting(s); return; }
  checkGameEndNow(s) || beginDay(s);
}

function beginMeeting(s: KanbanState): void {
  s.phase = 'meeting';
  s.meetingTriggered = false;
  s.order = certOrder(s);
  s.orderIdx = 0;
  for (const p of s.players) { p.playedGoalThisMeeting = false; p.meetingPassed = false; p.spokenGoals = []; }
  s.turn = s.order[0];
  s.log.push('Board meeting.');
}

function advanceMeeting(s: KanbanState): void {
  for (let i = 1; i <= s.order.length; i++) {
    const seat = s.order[(s.orderIdx + i) % s.order.length];
    if (!s.players[seat].meetingPassed) {
      s.orderIdx = (s.orderIdx + i) % s.order.length;
      s.turn = seat;
      return;
    }
  }
  endMeeting(s);
}

function endMeeting(s: KanbanState): void {
  for (const p of s.players) {
    p.speechAside += p.spokenGoals.length;
    p.spokenGoals = [];
    while (p.genericAside > 0 && p.speechAside > 0 && p.speechOnBoard < speechCapacity(p)) {
      p.genericAside--;
      p.speechAside--;
      p.speechOnBoard++;
    }
  }
  s.performanceDiscard.push(...s.meetingGoals.map((g) => g.guid));
  s.meetingGoals = [];
  s.pending = certOrder(s).map((seat) => ({ seat, decision: { kind: 'seedGoal' as const, label: 'Place one Performance Goal for the next meeting' } }));
  s.turn = s.pending[0].seat;
}

function drawPerformance(s: KanbanState): string | null {
  if (s.performanceDeck.length === 0) {
    s.performanceDeck = kbShuffle(s, s.performanceDiscard);
    s.performanceDiscard = [];
  }
  return s.performanceDeck.shift() ?? null;
}

function finishMeetingSeeding(s: KanbanState): void {
  while (s.meetingGoals.length < 4) {
    const g = drawPerformance(s);
    if (!g) break;
    s.meetingGoals.push({ guid: g, tokens: [] });
  }
  s.meetingGoals = kbShuffle(s, s.meetingGoals);
  for (const p of s.players) {
    while (p.goals.length < R.handGoals) {
      const g = drawPerformance(s);
      if (!g) break;
      p.goals.push(g);
    }
  }
  if (s.cycle < R.cycleMax) s.cycle++;
  s.phase = 'work'; // transient
  checkGameEndNow(s) || beginDay(s);
}

function checkGameEndNow(s: KanbanState): boolean {
  if (!((s.week >= 2 && s.cycle >= 3) || (s.week >= 3 && s.cycle >= 2))) return false;
  if (s.phase === 'select' || s.phase === 'meeting') return false;
  finalScoring(s);
  return true;
}

function finalScoring(s: KanbanState): void {
  for (const p of s.players) {
    foldGains(s, p);
    let pp = 0;
    let speech = p.speechOnBoard + p.genericAside;
    const met = s.finalGoal.achievements.filter((a) => achievementMet(s, p, a)).sort((x, y) => y.pp - x.pp);
    for (const a of met) {
      if (speech <= 0) break;
      speech--;
      pp += a.pp;
    }
    pp += p.bankedShifts;
    pp += speech + p.books + p.vouchers;
    for (const car of p.garages) if (car) pp += CAR_VALUES[car];
    for (const t of testedDesigns(p)) pp += s.partValues[t.part];
    p.pp += pp;
  }
  for (const dept of DEPTS) {
    const ranked = s.players
      .filter((p) => p.training[dept] > 0)
      .sort((a, b) => (b.training[dept] - a.training[dept]) || (b.trainingArrival[dept] - a.trainingArrival[dept]));
    ranked.forEach((p, i) => { if (i < 3) p.pp += R.trainingFinalPP[i]; });
  }
  const ranked = [...s.players].sort((a, b) => (b.pp - a.pp)
    || (b.garages.filter(Boolean).length - a.garages.filter(Boolean).length)
    || (testedDesigns(b).length - testedDesigns(a).length)
    || (b.bankedShifts - a.bankedShifts));
  s.finalScores = ranked.map((p) => ({ seat: p.seat, pp: p.pp }));
  s.winner = ranked[0].color;
  s.phase = 'ended';
  s.pending = [];
  s.log.push(`${ranked[0].name} wins with ${ranked[0].pp} PP.`);
}

function achievementMet(s: KanbanState, p: KanbanPlayer, a: { kind: string; n?: number; model?: CarModel; part?: Part; depts?: Dept[] }): boolean {
  const cars = p.garages.filter((c): c is CarModel => c !== null);
  switch (a.kind) {
    case 'cars': return cars.length >= (a.n ?? 0);
    case 'carsSameModel': return MODELS.some((m) => cars.filter((c) => c === m).length >= (a.n ?? 0));
    case 'carsDiffModels': return new Set(cars).size >= (a.n ?? 0);
    case 'model': return cars.filter((c) => c === a.model).length >= (a.n ?? 0);
    case 'upgradedDesigns': return p.upgraded.length >= (a.n ?? 0);
    case 'upgradedDiffParts': return new Set(p.upgraded.map((u) => u.part)).size >= (a.n ?? 0);
    case 'upgradedSamePart': return PARTS.some((part) => p.upgraded.filter((u) => u.part === part).length >= (a.n ?? 0));
    case 'upgradedPart': return p.upgraded.filter((u) => u.part === a.part).length >= (a.n ?? 0);
    case 'testedDesigns': return testedDesigns(p).length >= (a.n ?? 0);
    case 'testedDiffParts': return new Set(testedDesigns(p).map((t) => t.part)).size >= (a.n ?? 0);
    case 'certifications': return certCount(p) >= (a.n ?? 0);
    case 'certificationsAtMost': return certCount(p) <= (a.n ?? 5);
    case 'certsIn': return (a.depts ?? []).every((d) => isCertified(p, d));
    case 'expertDepts': return DEPTS.filter((d) => p.training[d] >= R.trainingTrack).length >= (a.n ?? 0);
    case 'expertDeptsAtMost': return DEPTS.filter((d) => p.training[d] >= R.trainingTrack).length <= (a.n ?? 5);
    case 'bankedShifts': return p.bankedShifts >= (a.n ?? 0);
    case 'books': return p.books >= (a.n ?? 0);
    default: return false;
  }
}

// ---------- reducer ----------

export function applyKanbanAction(s: KanbanState, seat: number, a: KanbanAction): KanbanResult {
  if (s.phase === 'ended') return err('the game is over');
  const p = s.players[seat];
  if (!p) return err('no such seat');

  if (s.pending.length > 0) {
    if (a.type !== 'choose') return err('resolve the pending choice first');
    if (s.pending[0].seat !== seat) return err('not your decision');
    return resolveChoice(s, p, a);
  }
  if (a.type === 'choose') return err('nothing to choose');

  if (s.phase === 'meeting') {
    if (s.turn !== seat) return err('not your turn');
    if (a.type === 'speak') return speak(s, p, a);
    if (a.type === 'pass') {
      if (!p.playedGoalThisMeeting) return err('you must play a Performance Goal before passing');
      p.meetingPassed = true;
      if (s.players.every((q) => q.meetingPassed)) { endMeeting(s); return ok; }
      advanceMeeting(s);
      return ok;
    }
    return err('meeting: speak or pass');
  }

  if (s.phase !== 'work') return err('wait for the work phase');
  if (s.turn !== seat) return err('not your turn');
  if (p.done || !p.workstation) return err('your meeple is down');

  switch (a.type) {
    case 'use_banked': {
      const worked = workstationShifts(p.workstation.dept, p.workstation.slot);
      const room = R.maxShiftsPerDay - worked - p.bankedSpent;
      const n = Math.min(a.n, room, p.bankedShifts);
      if (n <= 0) return err(room <= 0 ? 'the 4-shift day limit is reached' : 'no banked shifts');
      p.bankedShifts -= n;
      p.bankedSpent += n;
      p.shiftsLeft += n;
      return ok;
    }
    case 'train': {
      const depts = activeDepts(p);
      const dept = a.dept ?? depts[0];
      if (!depts.includes(dept)) return err('train where you work');
      const r = spendShift(s, p);
      if (!r.ok) return r;
      trainOne(s, p, dept);
      checkFactoryGoals(s, p);
      return ok;
    }
    case 'homework': {
      const depts = activeDepts(p);
      const dept = a.dept ?? depts[0];
      if (!depts.includes(dept)) return err('read for a department you work in');
      if (p.books <= 0) return err('no books');
      p.books--;
      trainOne(s, p, dept);
      checkFactoryGoals(s, p);
      return ok;
    }
    case 'recycle': {
      if (!p.parts.includes(a.give)) return err('you do not store that part');
      const ri = s.recycling.indexOf(a.take);
      if (ri < 0) return err('that part is not in recycling');
      if (s.recycling.some((x, i) => i !== ri && x === a.give)) return err('recycling must hold three different parts');
      p.parts.splice(p.parts.indexOf(a.give), 1);
      p.parts.push(a.take);
      s.recycling[ri] = a.give;
      return ok;
    }
    case 'select_design': {
      if (!activeDepts(p).includes('Design')) return err('work in Design for that');
      if (p.designs.length >= designCapacity(p)) return err('no empty design space');
      const guid = a.index >= 0 && a.index <= 7 ? s.designRow[a.index] : null;
      if (!guid) return err('pick a design from the row');
      const r = spendShift(s, p);
      if (!r.ok) return r;
      s.designRow[a.index] = null;
      p.designs.push(guid);
      const col = a.index % 4;
      if (col === 3) applyBenefit(s, p, { bankedShifts: 1 });
      if (col === 2) applyBenefit(s, p, { books: 1 });
      ev(s, p, 'Selects a design', DESIGN_BY_GUID[guid].model);
      return ok;
    }
    case 'advanced_design': {
      if (!activeDepts(p).includes('Design')) return err('work in Design for that');
      if (!isCertified(p, 'Design')) return err('requires Design certification');
      if (p.designs.length >= designCapacity(p)) return err('no empty design space');
      const stack = a.stack === 'central' ? s.central : a.stack === 'officeTop' ? s.officeTop : s.officeBottom;
      if (stack.length === 0) return err('that stack is empty');
      const r = spendShift(s, p);
      if (!r.ok) return r;
      const guid = stack.shift()!;
      p.designs.push(guid);
      if (a.stack !== 'central' && stack.length === 0 && s.central.length > 0) stack.push(s.central.shift()!);
      ev(s, p, 'Selects an advanced design', DESIGN_BY_GUID[guid].model);
      return ok;
    }
    case 'issue_order': {
      if (!activeDepts(p).includes('Logistics')) return err('work in Logistics for that');
      if (p.orderIssued) return err('one kanban order per turn');
      if (!p.orders.includes(a.card)) return err('not your order card');
      const split = ORDER_SPLITS[a.placement];
      if (!split) return err('bad placement');
      const r = spendShift(s, p);
      if (!r.ok) return r;
      p.orderIssued = true;
      applyBenefit(s, p, { bankedShifts: 1 });
      const order = ORDER_BY_GUID[a.card];
      for (let i = 0; i < 6; i++) {
        const part = order.parts[i];
        const matches = TOP_ROW_PARTS.includes(part) ? split.top.includes(i) : split.bottom.includes(i);
        if (matches && s.partsSupply[part] > 0) { s.partsSupply[part]--; s.warehouses[part]++; }
      }
      p.orders.splice(p.orders.indexOf(a.card), 1);
      s.kanbanDeck.push(a.card);
      p.orders.push(s.kanbanDeck.shift()!);
      ev(s, p, 'Issues a kanban order');
      return ok;
    }
    case 'collect_parts': {
      if (!activeDepts(p).includes('Logistics')) return err('work in Logistics for that');
      const have = s.warehouses[a.warehouse];
      if (have <= 0) return err('that warehouse is empty');
      const room = partCapacity(p) - p.parts.length;
      const n = Math.min(a.count, have, room);
      if (n <= 0) return err('no storage space');
      const r = spendShift(s, p);
      if (!r.ok) return r;
      s.warehouses[a.warehouse] -= n;
      for (let i = 0; i < n; i++) p.parts.push(a.warehouse);
      ev(s, p, 'Collects car parts', `${n} ${a.warehouse}`);
      return ok;
    }
    case 'receive_voucher': {
      if (!activeDepts(p).includes('Logistics')) return err('work in Logistics for that');
      if (!isCertified(p, 'Logistics')) return err('requires Logistics certification');
      if (p.voucherTaken) return err('one voucher per turn');
      const r = spendShift(s, p);
      if (!r.ok) return r;
      p.voucherTaken = true;
      applyBenefit(s, p, { vouchers: 1 });
      return ok;
    }
    case 'provide_part': {
      if (!activeDepts(p).includes('Assembly')) return err('work in Assembly for that');
      cleanFullAssembly(s, p);
      const line = s.assemblyParts[a.model];
      if (line.includes(a.part)) return err('that part is already on this model');
      if (line.length >= 6) return err('assembly spaces are full');
      const upgradedParts = s.upgrades[a.model].filter((x): x is Part => x !== null);
      const missingUpgraded = [...new Set(upgradedParts)].filter((u) => !line.includes(u));
      if (missingUpgraded.length > 0 && !missingUpgraded.includes(a.part)) {
        return err(`provide the upgraded parts first (${missingUpgraded.join(', ')})`);
      }
      if (a.voucher) {
        if (p.vouchers <= 0) return err('no parts voucher');
        if (s.partsSupply[a.part] <= 0) return err('that part is out of supply');
      } else if (!p.parts.includes(a.part)) return err('you do not store that part');
      const r = spendShift(s, p);
      if (!r.ok) return r;
      if (a.voucher) { p.vouchers--; s.partsSupply[a.part]--; } else p.parts.splice(p.parts.indexOf(a.part), 1);
      line.push(a.part);
      const entry = ENTRY_NODE[a.model];
      const res = moveEntryCar(s, p, entry, a.model);
      ev(s, p, 'Provides a part', `${a.part} → ${a.model}`);
      return res;
    }
    case 'claim_car': {
      if (!activeDepts(p).includes('RnD')) return err('work in R&D for that');
      const car = s.testTrack[a.queueIndex];
      if (a.queueIndex < 0 || !car) return err('no car at that spot');
      const design = DESIGN_BY_GUID[a.design];
      if (!p.designs.includes(a.design)) return err('not your design');
      if (design.model !== car) return err('the design must match the car');
      if (!p.garages.some((g, i) => g === null && (i < 4 || isCertified(p, 'Assembly')))) return err('no empty garage');
      // queue position counts only remaining cars nearer the pace car
      const position = s.testTrack.slice(0, a.queueIndex).filter(Boolean).length;
      const cost = R.claimShiftCost[Math.min(position, 3)];
      if (p.shiftsLeft < cost) return err(`that car costs ${cost} shifts`);
      p.shiftsLeft -= cost;
      s.testTrack[a.queueIndex] = null;
      p.designs.splice(p.designs.indexOf(a.design), 1);
      s.central.push(a.design);
      p.claimedThisTurn++;
      s.pending.push({ seat: p.seat, decision: { kind: 'garage', model: car, label: `Park the ${car} car in a garage` } });
      s.turn = p.seat;
      ev(s, p, 'Claims a car', car);
      return ok;
    }
    case 'upgrade_design': {
      if (!activeDepts(p).includes('RnD')) return err('work in R&D for that');
      const design = DESIGN_BY_GUID[a.design];
      if (!p.designs.includes(a.design)) return err('not your design');
      if (!design.part) return err('that design cannot upgrade a part');
      const spaces = s.upgrades[design.model];
      if (a.space < 0 || a.space > 5 || spaces[a.space] !== null) return err('pick an empty upgrade space');
      if (a.voucher) {
        if (p.vouchers <= 0) return err('no parts voucher');
        if (s.partsSupply[design.part] <= 0) return err('that part is out of supply');
      } else if (!p.parts.includes(design.part)) return err(`you need a ${design.part} part`);
      if (a.double) {
        if (p.doubleUpgrade !== 'ready') return err('double-upgrade is not available');
        if (s.partDoubled[design.part]) return err('that part was already double-upgraded');
      }
      const r = spendShift(s, p);
      if (!r.ok) return r;
      if (a.voucher) { p.vouchers--; s.partsSupply[design.part]--; } else p.parts.splice(p.parts.indexOf(design.part), 1);
      spaces[a.space] = design.part;
      applyBenefit(s, p, UPGRADE_SPACES[design.model][a.space]);
      if (a.double) {
        s.partValues[design.part] = Math.min(6, s.partValues[design.part] + 2);
        s.partDoubled[design.part] = true;
        p.doubleUpgrade = 'used';
        p.pp += s.partValues[design.part];
      } else {
        s.partValues[design.part] = Math.min(6, s.partValues[design.part] + 1);
      }
      p.designs.splice(p.designs.indexOf(a.design), 1);
      p.upgraded.push({ model: design.model, part: design.part });
      p.pp += 2;
      checkFactoryGoals(s, p);
      ev(s, p, 'Upgrades a design', `${design.model} ${design.part}${a.double ? ' · doubled' : ''}`);
      return ok;
    }
    case 'admin_pick': {
      if (p.workstation.dept !== 'Admin') return err('you are not in Administration');
      if (p.adminDept) return err('you already chose a department');
      if (a.dept === 'Admin') return err('pick another department');
      p.adminDept = a.dept;
      cleanFullAssembly(s, p);
      ev(s, p, 'Micromanages', a.dept);
      return ok;
    }
    case 'end_turn': {
      refillDesignRow(s);
      advancePace(s, p.claimedThisTurn);
      p.claimedThisTurn = 0;
      s.testTrack = s.testTrack.filter(Boolean); // close the gaps
      for (let i = 0; i < s.demands.length; i++) {
        if (s.demands[i].speech <= 0 && s.demandStack.length > 0) {
          const old = s.demands[i].tile;
          const next = s.demandStack.shift()!;
          s.demands[i] = { tile: next, speech: next.speechs };
          s.demandStack = kbShuffle(s, [...s.demandStack, old]);
        }
      }
      foldGains(s, p);
      p.done = true;
      ev(s, p, 'Ends the turn');
      advanceWork(s);
      return ok;
    }
    default:
      return err('not available now');
  }
}

/** provide-part step 2: the model's entry-line car advances; a fresh car
 * enters the line if the supply has one */
function moveEntryCar(s: KanbanState, p: KanbanPlayer, entry: number, model: CarModel): KanbanResult {
  const targets = CONVEYOR[entry].targets;
  let res: KanbanResult = ok;
  if (s.conveyor[entry]) {
    if (targets.length === 1) res = moveCarTo(s, p, entry, targets[0]);
    else if (targets.length > 1) {
      s.pending.push({ seat: p.seat, decision: { kind: 'displace', node: entry, options: targets, label: `Choose where the ${s.conveyor[entry]} car moves` } });
      s.turn = p.seat;
      return ok; // the fresh car enters when the choice resolves
    } else {
      carRollsOut(s, p, s.conveyor[entry]!);
      s.conveyor[entry] = null;
    }
  }
  if (s.conveyor[entry] === null && s.carsSupply[model] > 0) {
    s.conveyor[entry] = model;
    s.carsSupply[model]--;
  }
  return res;
}

// ---------- meeting speak ----------

function speak(s: KanbanState, p: KanbanPlayer, a: { playGoal?: string; placeToken?: number }): KanbanResult {
  if (!a.playGoal && a.placeToken === undefined) return err('play a goal and/or place a speech token');
  if (a.playGoal && !p.goals.includes(a.playGoal)) return err('not your goal card');
  if (a.playGoal && p.playedGoalThisMeeting) return err('you already played a goal this meeting');
  if (a.placeToken !== undefined) {
    const g = s.meetingGoals[a.placeToken];
    const playedIdx = a.playGoal ? s.meetingGoals.length : -1; // if playing now, token must go on it
    if (a.playGoal && a.placeToken !== playedIdx) return err('if you play and speak in one turn, speak on your own goal');
    if (!a.playGoal) {
      if (!g) return err('no such goal');
      if (g.tokens.some((t) => t.seat === p.seat)) return err('you already spoke on that goal');
      if (g.tokens.length >= GOAL_BY_GUID[g.guid].max) return err('no speech icons left on that goal');
    }
    if (p.speechOnBoard <= 0) return err('no speech tokens on your board');
  }
  if (a.playGoal) {
    p.goals.splice(p.goals.indexOf(a.playGoal), 1);
    p.playedGoalThisMeeting = true;
    s.meetingGoals.push({ guid: a.playGoal, tokens: [] });
    ev(s, p, 'Presents a goal');
  }
  if (a.placeToken !== undefined) {
    const idx = a.playGoal ? s.meetingGoals.length - 1 : a.placeToken;
    const g = s.meetingGoals[idx];
    const def = GOAL_BY_GUID[g.guid];
    const multIdx = g.tokens.length;
    if (multIdx >= def.max) return err('no speech icons left on that goal');
    p.speechOnBoard--;
    p.spokenGoals.push(idx);
    const mult = def.max - multIdx;
    const have = countGoalMatches(s, p, def.per);
    const pp = def.pp * Math.min(mult, have);
    g.tokens.push({ seat: p.seat, multIdx });
    p.pp += pp;
    ev(s, p, 'Speaks', `+${pp} PP`);
  }
  advanceMeeting(s);
  return ok;
}

function countGoalMatches(s: KanbanState, p: KanbanPlayer, per: string): number {
  const cars = p.garages.filter((c): c is CarModel => c !== null);
  const [kind, arg] = per.split(':');
  switch (kind) {
    case 'car': return cars.length;
    case 'carModelKind': return new Set(cars).size;
    case 'model': return cars.filter((c) => c === arg).length;
    case 'upgradedPart': return p.upgraded.filter((u) => u.part === arg).length;
    case 'upgradedDesign': return p.upgraded.length;
    case 'testedDesign': return testedDesigns(p).length;
    case 'partOf': {
      const parts = arg.split(',') as Part[];
      return p.parts.filter((x) => parts.includes(x)).length;
    }
    case 'carInGarages': {
      const idxs = arg.split(',').map((x) => +x - 1);
      return idxs.filter((i) => p.garages[i] !== null).length;
    }
    case 'certifiedIn': return isCertified(p, arg as Dept) ? 1 : 0;
    case 'design': return p.designs.length;
    case 'book': return p.books;
    case 'certification': return certCount(p);
    case 'part': return p.parts.length;
    case 'bankedShift': return p.bankedShifts;
    case 'speechOnBoard': return p.speechOnBoard;
    default: return 0;
  }
}

// ---------- choice resolution ----------

function resolveChoice(s: KanbanState, p: KanbanPlayer, a: KanbanAction & { type: 'choose' }): KanbanResult {
  const d = s.pending[0].decision;
  const done = (): KanbanResult => {
    s.pending.shift();
    afterChoice(s);
    return ok;
  };
  switch (d.kind) {
    case 'certSpace': {
      if (a.space === undefined || a.space < 0 || a.space > 3) return err('pick a space (0-3)');
      const taken = s.players.some((q) => q.seat !== p.seat && q.cert.section === d.section && q.cert.space === a.space);
      if (taken) return err('that space is taken');
      p.cert = { section: d.section, space: a.space };
      // benefits are printed left-to-right; space 0 is the rightmost
      applyBenefit(s, p, CERT_SECTIONS[d.section][3 - a.space]);
      checkFactoryGoals(s, p);
      return done();
    }
    case 'orientPick': {
      if (!a.part || !a.design) return err('pick a part and a design');
      if (s.warehouses[a.part] <= 0) return err('that warehouse is empty');
      const inRow = s.designRow.includes(a.design);
      const onStacks = s.central[0] === a.design || s.officeTop[0] === a.design || s.officeBottom[0] === a.design;
      if (!inRow && !onStacks) return err('pick an available design');
      s.warehouses[a.part]--;
      p.parts.push(a.part);
      if (inRow) s.designRow[s.designRow.indexOf(a.design)] = null;
      else if (s.central[0] === a.design) s.central.shift();
      else if (s.officeTop[0] === a.design) s.officeTop.shift();
      else s.officeBottom.shift();
      p.designs.push(a.design);
      return done();
    }
    case 'selectWorkstation': {
      if (!a.dept || a.space === undefined) return err('pick a department and slot');
      const slot = a.space;
      if (slot !== 0 && slot !== 1) return err('slot 0 (top) or 1 (bottom)');
      if (s.day > 1 && a.dept === p.prevDept) return err('you must change departments');
      if (!slotFree(s, a.dept, slot)) return err('that workstation is taken');
      if (s.players.length === 2 && !s.sandra.desk && s.sandra.dept === a.dept) return err('Sandra blocks that department (2-player rule)');
      p.workstation = { dept: a.dept, slot };
      s.pending.shift();
      advanceSelection(s);
      return ok;
    }
    case 'award': {
      if (a.option === undefined || !d.options[a.option]) return err('pick an award');
      const guid = d.options[a.option];
      s.awards[d.dept] = s.awards[d.dept].filter((g) => g !== guid);
      applyBenefit(s, p, AWARD_BY_GUID[guid]);
      ev(s, p, 'Takes an award');
      return done();
    }
    case 'displace': {
      if (a.node === undefined || !d.options.includes(a.node)) return err('pick a conveyor arrow');
      s.pending.shift();
      let r: KanbanResult = ok;
      if (s.displacing) {
        // an in-flight displaced car picks its branch
        const car = s.displacing;
        s.displacing = null;
        const occupant = s.conveyor[a.node] ?? null;
        s.conveyor[a.node] = car;
        if (occupant) r = displaceOnward(s, p, a.node, occupant);
      } else {
        // the entry-line car picks its branch; a fresh car then enters
        r = moveCarTo(s, p, d.node, a.node);
        const entryModel = (Object.keys(ENTRY_NODE) as CarModel[]).find((m) => ENTRY_NODE[m] === d.node);
        if (entryModel && s.conveyor[d.node] === null && s.carsSupply[entryModel] > 0) {
          s.conveyor[d.node] = entryModel;
          s.carsSupply[entryModel]--;
        }
      }
      afterChoice(s);
      return r;
    }
    case 'garage': {
      if (a.garage === undefined || a.garage < 0 || a.garage > 4) return err('pick a garage');
      if (p.garages[a.garage] !== null) return err('that garage is full');
      if (a.garage === 4 && !isCertified(p, 'Assembly')) return err('the 5th garage unlocks with Assembly certification');
      p.garages[a.garage] = d.model;
      const tile = p.garageTiles[a.garage];
      if (!tile.flipped) {
        tile.flipped = true;
        applyBenefit(s, p, tile.effect);
      }
      checkFactoryGoals(s, p);
      return done();
    }
    case 'seedGoal': {
      if (!a.goal || !p.goals.includes(a.goal)) return err('pick a goal from your hand');
      p.goals.splice(p.goals.indexOf(a.goal), 1);
      s.meetingGoals.push({ guid: a.goal, tokens: [] });
      s.pending.shift();
      if (s.pending.length === 0) finishMeetingSeeding(s);
      else s.turn = s.pending[0].seat;
      return ok;
    }
    default:
      return err('unknown decision');
  }
}

function afterChoice(s: KanbanState): void {
  if (s.pending.length > 0) { s.turn = s.pending[0].seat; return; }
  if (s.phase === 'orientation') advanceOrientation(s);
  else if (s.phase === 'work') {
    const p = s.players[s.turn];
    if (!p || p.done || !p.workstation) advanceWork(s);
  }
}

function advanceOrientation(s: KanbanState): void {
  const unplaced = s.order.filter((seat) => s.players[seat].cert.space < 0);
  if (unplaced.length > 0) {
    s.turn = unplaced[0];
    s.pending = [{ seat: s.turn, decision: { kind: 'certSpace', section: 0, label: 'Choose your starting spot on the Certification track' } }];
    return;
  }
  const next = certOrder(s).find((seat) => !s.oriented.includes(seat));
  if (next !== undefined) {
    s.oriented.push(next);
    s.turn = next;
    s.pending = [{ seat: next, decision: { kind: 'orientPick', label: 'Take one car part and one design' } }];
    return;
  }
  s.oriented = [];
  refillDesignRow(s);
  beginDay(s);
}
