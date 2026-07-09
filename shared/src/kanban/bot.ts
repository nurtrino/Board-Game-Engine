// Random-legal Kanban EV bot: resolves every pending-decision kind and
// takes plausible work/meeting turns. Shared by the engine tests and the
// server's CPU seats — the reducer rejects anything illegal harmlessly.

import {
  DEPTS, DESIGN_BY_GUID, MODELS, PARTS, isCertified,
  type CarModel, type Dept, type KanbanState,
} from './state.js';
import type { KanbanAction } from './actions.js';

function rnd(rng: () => number, n: number): number { return Math.floor(rng() * n); }
function pick<T>(rng: () => number, a: T[]): T { return a[rnd(rng, a.length)]; }

export function kanbanBotAction(s: KanbanState, seat: number, rng: () => number): KanbanAction | null {
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

  const depts: Dept[] = p.workstation.dept === 'Admin' ? (p.adminDept ? ['Admin', p.adminDept] : ['Admin']) : [p.workstation.dept];
  const tries: KanbanAction[] = [];
  if (p.workstation.dept === 'Admin' && !p.adminDept) tries.push({ type: 'admin_pick', dept: pick(rng, DEPTS.filter((d) => d !== 'Admin')) });
  if (p.shiftsLeft === 0 && p.bankedShifts > 0 && rng() < 0.5) tries.push({ type: 'use_banked', n: 1 });
  if (p.shiftsLeft > 0) {
    tries.push({ type: 'train', dept: pick(rng, depts) });
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
      tries.push({ type: 'provide_part', model: pick(rng, MODELS as CarModel[]), part: pick(rng, p.parts) });
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
  if (p.books > 0 && rng() < 0.4) tries.push({ type: 'homework', dept: pick(rng, depts) });
  tries.push({ type: 'end_turn' });
  return pick(rng, tries);
}
