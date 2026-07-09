// Kanban EV engine tests: random-legal bot playthroughs at 2/3/4 players
// across seeds, with conservation invariants checked after every action.
// Run: npx tsx shared/src/kanban/kanban-test.ts

import {
  CONVEYOR, DEPTS, DESIGN_BY_GUID, KANBAN_RULES as R, MODELS, PARTS,
  createKanban, isCertified, kanbanViewFor,
  type CarModel, type Dept, type KanbanState, type Part,
} from './state.js';
import { applyKanbanAction, type KanbanAction } from './actions.js';

let passed = 0;
let failed = 0;
let dumped = false;
function check(cond: boolean, msg: string): void {
  if (cond) passed++;
  else { failed++; console.error('FAIL:', msg); }
}

// ---------- invariants ----------

function invariants(s: KanbanState, tag: string): void {
  // parts conservation: 60 total
  let parts = 0;
  for (const p of PARTS) parts += s.partsSupply[p] + s.warehouses[p];
  parts += s.recycling.length;
  for (const m of MODELS) parts += s.assemblyParts[m].length + s.upgrades[m].filter(Boolean).length;
  for (const p of s.players) parts += p.parts.length;
  check(parts === 60, `${tag}: parts conservation (${parts})`);

  // cars conservation: 40 total (cars may sit in limbo awaiting a branch
  // choice or a garage pick — the pending decision carries them)
  let cars = s.displacing ? 1 : 0;
  cars += s.pending.filter((x) => x.decision.kind === 'garage').length;
  for (const m of MODELS) cars += s.carsSupply[m];
  cars += Object.values(s.conveyor).filter(Boolean).length;
  cars += s.testTrack.filter(Boolean).length;
  for (const p of s.players) cars += p.garages.filter(Boolean).length;
  check(cars === 40, `${tag}: cars conservation (${cars})`);
  if (cars !== 40 && !dumped) {
    dumped = true;
    console.error('  supply', JSON.stringify(s.carsSupply), 'conveyor', JSON.stringify(s.conveyor),
      'track', JSON.stringify(s.testTrack), 'displacing', s.displacing,
      'pending', JSON.stringify(s.pending[0] ?? null), 'log', JSON.stringify(s.log.slice(-3)));
  }
  check(!s.displacing || s.pending.some((x) => x.decision.kind === 'displace'), `${tag}: displacing only while a branch choice pends`);

  // designs conservation: 35 total
  let designs = s.designRow.filter(Boolean).length + s.central.length + s.officeTop.length + s.officeBottom.length;
  for (const p of s.players) designs += p.designs.length + p.upgraded.length;
  check(designs === 35, `${tag}: designs conservation (${designs})`);

  for (const p of s.players) {
    check(p.pp >= 0, `${tag}: ${p.name} pp >= 0`);
    check(p.bankedShifts >= 0 && p.bankedShifts <= R.shiftBankMax, `${tag}: banked in range`);
    check(p.speechOnBoard + p.speechAside <= 5, `${tag}: own speech tokens <= 5 (${p.speechOnBoard}+${p.speechAside})`);
    check(p.garages.length === 5, `${tag}: 5 garages`);
  }
  check(s.week <= R.weekMax && s.cycle <= R.cycleMax, `${tag}: markers in range`);
  check(s.testTrack.filter(Boolean).length <= R.maxBehindPace, `${tag}: test track <= 4`);
}

// ---------- random-legal bot ----------

function rnd(rng: () => number, n: number): number { return Math.floor(rng() * n); }
function pick<T>(rng: () => number, a: T[]): T { return a[rnd(rng, a.length)]; }

function botAction(s: KanbanState, seat: number, rng: () => number): KanbanAction | null {
  const p = s.players[seat];
  const head = s.pending[0];
  if (head && head.seat === seat) {
    const d = head.decision;
    switch (d.kind) {
      case 'certSpace': {
        const free = [0, 1, 2, 3].filter((sp) => !s.players.some((q) => q.seat !== seat && q.cert.section === d.section && q.cert.space === sp));
        return { type: 'choose', space: pick(rng, free) };
      }
      case 'orientPick': {
        const wh = PARTS.filter((x) => s.warehouses[x] > 0);
        const designs = [
          ...s.designRow.filter((g): g is string => g !== null),
          ...[s.central[0], s.officeTop[0], s.officeBottom[0]].filter((g): g is string => !!g),
        ];
        if (!wh.length || !designs.length) return null;
        return { type: 'choose', part: pick(rng, wh), design: pick(rng, designs) };
      }
      case 'selectWorkstation': {
        const opts: { dept: Dept; slot: number }[] = [];
        for (const dept of DEPTS) {
          if (s.day > 1 && dept === p.prevDept) continue;
          if (s.players.length === 2 && !s.sandra.desk && s.sandra.dept === dept) continue;
          for (const slot of [0, 1]) {
            const taken = s.players.some((q) => q.workstation?.dept === dept && q.workstation.slot === slot)
              || (!s.sandra.desk && s.sandra.dept === dept && s.sandra.slot === slot);
            if (!taken) opts.push({ dept, slot });
          }
        }
        if (!opts.length) return null;
        const o = pick(rng, opts);
        return { type: 'choose', dept: o.dept, space: o.slot };
      }
      case 'award': return { type: 'choose', option: 0 };
      case 'displace': return { type: 'choose', node: pick(rng, d.options) };
      case 'garage': {
        const free = p.garages.map((g, i) => (g === null ? i : -1)).filter((i) => i >= 0 && (i < 4 || isCertified(p, 'Assembly')));
        return { type: 'choose', garage: free[0] ?? 0 };
      }
      case 'seedGoal': return { type: 'choose', goal: p.goals[0] };
      default: return null;
    }
  }
  if (s.pending.length > 0) return null;

  if (s.phase === 'meeting') {
    if (s.turn !== seat) return null;
    if (!p.playedGoalThisMeeting) {
      const canSpeak = p.speechOnBoard > 0 && rng() < 0.7;
      return { type: 'speak', playGoal: p.goals[0], placeToken: canSpeak ? s.meetingGoals.length : undefined };
    }
    if (p.speechOnBoard > 0 && rng() < 0.5) {
      const open = s.meetingGoals
        .map((g, i) => ({ g, i }))
        .filter(({ g }) => !g.tokens.some((t) => t.seat === seat));
      if (open.length) return { type: 'speak', placeToken: pick(rng, open).i };
    }
    return { type: 'pass' };
  }

  if (s.phase !== 'work' || s.turn !== seat || p.done || !p.workstation) return null;

  // random-legal work: try things; the reducer rejects illegal attempts
  const depts = p.workstation.dept === 'Admin' ? (p.adminDept ? ['Admin', p.adminDept] : ['Admin']) : [p.workstation.dept];
  const tries: KanbanAction[] = [];
  if (p.workstation.dept === 'Admin' && !p.adminDept) tries.push({ type: 'admin_pick', dept: pick(rng, DEPTS.filter((d) => d !== 'Admin')) });
  if (p.shiftsLeft === 0 && p.bankedShifts > 0 && rng() < 0.5) tries.push({ type: 'use_banked', n: 1 });
  if (p.shiftsLeft > 0) {
    tries.push({ type: 'train', dept: pick(rng, depts as Dept[]) });
    if (depts.includes('Design')) {
      const spots = s.designRow.map((g, i) => (g ? i : -1)).filter((i) => i >= 0);
      if (spots.length) tries.push({ type: 'select_design', index: pick(rng, spots) });
      tries.push({ type: 'advanced_design', stack: 'central' });
    }
    if (depts.includes('Logistics')) {
      if (!p.orderIssued && p.orders.length) tries.push({ type: 'issue_order', card: p.orders[0], placement: rnd(rng, 4) as 0 | 1 | 2 | 3 });
      const full = PARTS.filter((x) => s.warehouses[x] > 0);
      if (full.length) tries.push({ type: 'collect_parts', warehouse: pick(rng, full), count: 1 + rnd(rng, 3) });
      tries.push({ type: 'receive_voucher' });
    }
    if (depts.includes('Assembly') && p.parts.length) {
      tries.push({ type: 'provide_part', model: pick(rng, MODELS), part: pick(rng, p.parts) });
    }
    if (depts.includes('RnD')) {
      const upgradable = p.designs.filter((g) => DESIGN_BY_GUID[g].part && (p.parts.includes(DESIGN_BY_GUID[g].part!) || p.vouchers > 0));
      if (upgradable.length) {
        const g = pick(rng, upgradable);
        const model = DESIGN_BY_GUID[g].model;
        const space = s.upgrades[model].findIndex((x) => x === null);
        if (space >= 0) tries.push({ type: 'upgrade_design', design: g, space, voucher: !p.parts.includes(DESIGN_BY_GUID[g].part!) });
      }
      const queue = s.testTrack.map((c, i) => ({ c, i })).filter(({ c }) => c !== null);
      for (const { c, i } of queue) {
        const match = p.designs.find((g) => DESIGN_BY_GUID[g].model === c);
        if (match) { tries.push({ type: 'claim_car', queueIndex: i, design: match }); break; }
      }
    }
  }
  if (p.parts.length && rng() < 0.2) tries.push({ type: 'recycle', give: pick(rng, p.parts), take: pick(rng, s.recycling) });
  if (p.books > 0 && rng() < 0.4) tries.push({ type: 'homework', dept: pick(rng, depts as Dept[]) });
  tries.push({ type: 'end_turn' });
  return pick(rng, tries);
}

// ---------- playthroughs ----------

function playthrough(playerCount: number, seed: number): void {
  const tag = `${playerCount}p seed ${seed}`;
  const names = ['Ada', 'Bo', 'Cy', 'Dee'].slice(0, playerCount);
  const s = createKanban(names.map((name) => ({ name })), seed);
  let rngState = seed ^ 0x2c1b3c6d;
  const rng = (): number => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  let steps = 0;
  let stuck = 0;
  while (s.phase !== 'ended' && steps < 12000) {
    steps++;
    const actor = s.pending[0]?.seat ?? s.turn;
    const a = botAction(s, actor, rng);
    if (!a) {
      stuck++;
      check(stuck < 500, `${tag}: no action available (phase ${s.phase}, turn ${s.turn}, pending ${JSON.stringify(s.pending[0] ?? null)})`);
      if (stuck >= 500) return;
      continue;
    }
    const r = applyKanbanAction(s, actor, a);
    if (r.ok) { stuck = 0; invariants(s, tag); }
    else {
      stuck++;
      if (stuck >= 800) {
        check(false, `${tag}: wedged on rejections (last: ${r.error}; action ${JSON.stringify(a)}; phase ${s.phase} day ${s.day})`);
        return;
      }
    }
  }
  check(s.phase === 'ended', `${tag}: game ended (day ${s.day}, week ${s.week}, cycle ${s.cycle}, steps ${steps})`);
  if (s.phase === 'ended') {
    check(s.finalScores !== null && s.finalScores.length === playerCount, `${tag}: final scores`);
    check(s.winner !== null, `${tag}: winner declared`);
    const view = kanbanViewFor(s, 0);
    check(view.players[0].goals !== undefined, `${tag}: own hand visible`);
    check(kanbanViewFor(s, null).players[0].goals === undefined, `${tag}: hands redacted for watchers`);
    console.log(`  ${tag}: ended day ${s.day} · ${s.finalScores!.map((f) => `${s.players[f.seat].name} ${f.pp}`).join(' · ')}`);
  }
}

console.log('Kanban EV engine tests');
for (const seed of [11, 42, 77]) {
  for (const n of [2, 3, 4]) playthrough(n, seed);
}

// directed: setup shape
{
  const s = createKanban([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }], 5);
  check(s.phase === 'orientation', 'setup: orientation first');
  check(s.designRow.filter(Boolean).length === 8, 'setup: 8 designs in the row');
  check(s.central.length === 9 && s.officeTop.length === 9 && s.officeBottom.length === 9, 'setup: 9-tile stacks');
  check(s.demands.length === 2, 'setup: 2 demand tiles');
  check(s.players.every((p) => p.orders.length === 2 && p.goals.length === 3), 'setup: hands dealt');
  check(Object.values(s.warehouses).reduce((a, b) => a + b, 0) <= 6, 'setup: starter kanban stocked');
  check(s.recycling.length === 3 && new Set(s.recycling).size === 3, 'setup: recycling 3 different');
  check(MODELS.every((m) => Object.values(s.conveyor).filter((c) => c === m).length === 1), 'setup: one car per model on the line');
  check(s.factoryGoals.length === 6, 'setup: 6 factory goals');
  invariants(s, 'setup');
}

// directed: expansions must be off
{
  let threw = false;
  try { createKanban([{ name: 'A' }, { name: 'B' }], 1, { speedCharger: true }); } catch { threw = true; }
  check(threw, 'options: expansions throw until implemented');
}

// directed: conveyor graph sanity
{
  check(Object.keys(CONVEYOR).length === 13, 'conveyor: 13 nodes');
  const terminal = Object.values(CONVEYOR).filter((n) => n.targets.length === 0);
  check(terminal.length === 1 && terminal[0].num === 32, 'conveyor: single exit at node 32');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
