// Kanban EV engine tests: random-legal bot playthroughs at 2/3/4 players
// across seeds, with conservation invariants checked after every action.
// Run: npx tsx shared/src/kanban/kanban-test.ts

import {
  CONVEYOR, KANBAN_RULES as R, MODELS, PARTS,
  createKanban, kanbanViewFor,
  type KanbanState,
} from './state.js';
import { applyKanbanAction } from './actions.js';
import { kanbanBotAction } from './bot.js';

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

// bot lives in bot.ts (shared with the server)

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
    const a = kanbanBotAction(s, actor, rng);
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
  check(MODELS.every((m) => Object.values(s.conveyor).filter((c) => c === m).length === 2), 'setup: two cars per model on the line (entry + yellow plate)');
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
