// Personal device for Kanban EV — board-first. The screen IS the factory:
// tap the pulsing targets on the 3D board to act (pick a workstation, take
// a design, stock a warehouse, provide a part, claim a car, speak at the
// meeting). A chip strip below completes multi-part choices (which part,
// which design, how to place an order). Toggle to your 3D player mat any
// time. The TV stays the shared table.

import { useMemo, useState } from 'react';
import {
  DEPTS, DESIGN_BY_GUID, GOAL_BY_GUID, MODELS, ORDER_BY_GUID, PARTS, UPGRADE_SPACES,
  type CarModel, type Dept, type KanbanAction, type KanbanView, type Part,
} from '@bge/shared';
import {
  BAY_SPOT, CERT_SPOT, DESIGN_SPOT, KANBAN_DECK_PICK, LAYOUT_TABLES, NODE_SPOT, QUEUE_SPOT,
  SEAT_TINT, STACK_SPOT, useKanbanScene, KanbanTable, type KanbanPick, type KanbanSceneDef,
} from './KanbanScene';
import { KanbanMat } from './KanbanMat';
import { CardSprite } from '../trek/TrekBoard';
import { GameIntro, type Intro } from '../ttr/GameIntro';
import { playSfx } from '../sfx';

const KANBAN_INTRO: Intro = {
  title: 'Kanban EV',
  tagline: 'Prove yourself on the factory floor — Sandra is watching.',
  goal: 'Score the most Production Points (PP) by designing, assembling, upgrading and testing electric cars across five departments. The game ends after enough weeks and production cycles pass; highest PP wins.',
  points: [
    { label: 'Tap the board', detail: 'Everything is played on the factory floor: pulsing targets mark every legal tap — workstations, design tiles, warehouses, assembly lines, cars, training tracks.' },
    { label: 'A day', detail: 'Pick a workstation in a NEW department (top spot acts earlier but gives fewer shifts). Then everyone works in top-to-bottom order.' },
    { label: 'Shifts', detail: 'Spend shifts on department tasks or training. Banked shifts add more, but never more than 4 worked in a day. Books train for free.' },
    { label: 'Design', detail: 'Take design tiles from the row — you need them to claim and upgrade cars. The rightmost columns pay a banked shift or a book.' },
    { label: 'Logistics', detail: 'Issue a kanban order to stock the warehouses (and bank a shift), collect parts from one warehouse, and — once certified — take a parts voucher.' },
    { label: 'Assembly', detail: 'Provide a part a model still needs: its car advances down the line and may roll out to the test track for PP. Upgraded parts first. Recycling swaps parts for free.' },
    { label: 'R&D', detail: 'Claim cars from the test track (matching design + empty garage; deeper cars cost more shifts) and upgrade designs with a matching part for PP.' },
    { label: 'Sandra', detail: 'She evaluates the least-trained player in her department — fail her criteria and you lose PP. Then she clears assembly, strips warehouses, recycles designs, advances the pace car, or scores the week.' },
    { label: 'Meetings', detail: 'When the pace car crosses a striped space, the day ends in a meeting: play one performance goal from your hand and spend speech tokens on goals to score them.' },
    { label: 'Game end', detail: 'When weeks and production cycles run out: final-goal achievements, banked shifts, leftovers, car values (2-6), training ranks, tested designs at part value.' },
  ],
  rulebook: '/kanban/rulebook.pdf',
  walkthrough: [
    {
      title: 'What you are trying to do',
      body: 'Kanban EV is a race for Production Points (PP). You are a new employee in an electric-car factory, and everything you do — taking designs, stocking parts, assembling cars, upgrading and testing them — pays PP now or at the end.\n\nThe reliable engines: claim cars into your garages (they score their value and enable "tested designs"), upgrade designs (+2 PP each, more when tested), speak well at meetings, and keep Sandra off your back.\n\nThe game ends when the weeks and production cycles run out. Most PP wins.',
    },
    {
      title: 'Your screen is the factory',
      body: 'The 3D board on your device is live: when it is your turn, pulsing frames mark every legal tap. Tap a workstation to sit there, a design tile to take it, a warehouse to collect parts, an assembly line to provide a part, a car on the test track to claim it.\n\nWhen a tap needs a follow-up (which part? which design?), chips appear under the board — tap one to finish the move.\n\nThe MY MAT button flips to your player board: your designs, parts, books, vouchers, garages and speech tokens as real pieces. FACTORY flips back.',
    },
    {
      title: 'A day, start to finish',
      body: 'Each day starts with everyone choosing a workstation — always in a DIFFERENT department from yesterday. The top spot in each department acts earlier in the day but grants fewer shifts (2, or 1 in Admin); the bottom spot grants more (3, or 2 in Admin).\n\nThen, in top-to-bottom workstation order, each player spends their shifts. Sandra takes her turn exactly where her workstation sits in that order.\n\nWhen everyone has worked, the day ends — a meeting fires if the pace car crossed a striped space, and the week ends when Sandra reaches Administration.',
    },
    {
      title: 'Shifts, banked shifts and books',
      body: 'Your workstation gives you 2-3 shifts (1-2 in Admin). Most tasks cost exactly 1 shift; training costs 1 per step.\n\nBanked shifts are savings: tap USE BANKED to convert one into a working shift — but you can never work more than 4 shifts in one day. Each banked shift is also 1 PP at game end, and Sandra fines you 1 PP per banked shift below 5 when she evaluates you — the bank is both armor and points.\n\nBooks are free training: spend one any time on your turn to advance a training track without spending a shift.',
    },
    {
      title: 'Design and Logistics',
      body: 'DESIGN: tap a tile in the row to take it (1 shift). You need a design of a model to claim that car, and a design showing a specific part to upgrade it. Tiles in the rightmost columns also pay a banked shift or a book. Certified designers can take from the face-down stacks.\n\nLOGISTICS: tap the kanban deck to issue an order (1 shift — banks a shift and stocks warehouses by the card split you choose), tap a warehouse to collect everything that fits (1 shift). Certified: take a parts voucher — a wildcard part usable at the moment of assembly or upgrade.',
    },
    {
      title: 'Assembly and the conveyor',
      body: 'Tap a model’s assembly line and pick a part it does not have yet (upgraded parts must be provided first). The model’s car advances one position — pushing any car in the way along the printed arrows; you choose at forks, including whether a belt-end car rolls out through its gate (1 / 2 / 1 PP).\n\nCars that roll out join the test track queue behind the pace car and pay the gate’s PP to YOU — even if someone else later claims the car.\n\nRecycling is free and unlimited on your turn: tap a recycling part to swap one of yours for it.',
    },
    {
      title: 'R&D: claim and upgrade',
      body: 'CLAIM: tap a car on the test track. You need a design of its model (it returns to the central stack) and an empty garage. The 1st car behind the pace car costs 1 shift, the 2nd and 3rd cost 2, the 4th costs 3. The pace car advances that many spaces at end of turn — crossing a stripe calls a meeting.\n\nUPGRADE: tap a model’s bay with a matching part-design in hand and the part in storage (or a voucher). Pick the upgrade space — each prints a different benefit. +2 PP, and the part’s value rises for end-game tested-design scoring.\n\nCertified in R&D: once per game you may DOUBLE an upgrade — value +2 and you score the new value immediately.',
    },
    {
      title: 'Training, certification, Sandra',
      body: 'Tap your department’s training track to train (1 shift per step). Crossing the arrow certifies you: department perks unlock, and your certification marker advances a section — pick a space, take its printed benefit. The last space is Expert: first arrival takes a speech token, and everyone reaching it picks a secret award.\n\nSandra evaluates the LEAST-trained player in her department every day: fail her criteria (say, 2 or fewer designs in Design) and you lose 1 PP plus 1 per banked shift below 5.\n\nHer daily task wrecks something predictable: pace car +1 in R&D, assembly cleared, warehouses stripped, the design row recycled, or end-of-week scoring in Admin.',
    },
    {
      title: 'Meetings',
      body: 'A meeting ends the day after the pace car crosses a striped space. In certification-track order, each turn you either SPEAK or PASS.\n\nYou MUST play exactly one performance goal from your hand sometime during the meeting (tap it below the board). Placing a speech token on a goal card scores it: goal PP times how many you have, capped by the multiplier — earlier speakers get the bigger multipliers, and each card only holds so many speakers.\n\nAfter the meeting, everyone seeds one hand goal for the next meeting, hands refill to three, and the production cycle advances — one step closer to the end.',
    },
    {
      title: 'The end and the final goal',
      body: 'The game ends when the week marker and production-cycle marker together run out (one at 2+, the other at 3).\n\nFinal scoring: the FINAL GOAL tile (bottom of the board — check it early) pays each achievement you meet for one speech token each. Then 1 PP per banked shift, per leftover token, book and voucher; your cars score their model values (City 2 up to Concept 6); the training tracks pay 5/3/1 to the deepest markers; and every TESTED design — an upgraded design whose model sits in your garages — scores that part’s current value.\n\nTies break on cars, then tested designs, then banked shifts.',
    },
  ],
};

const hex = (t: number[]) => `#${t.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

const CSS = `
.kb-wrap { position: fixed; inset: 0; background: #05080b; color: #e8ebf0; font: 14px Inter, sans-serif; overflow: hidden; display: flex; flex-direction: column; }
.kb-top { display: flex; gap: 8px; align-items: center; padding: 8px 12px 4px; flex-wrap: wrap; }
.kb-3d { position: relative; flex: 1; min-height: 0; }
.kb-strip { border-top: 1px solid rgba(255,255,255,0.08); padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; max-height: 42vh; overflow-y: auto; }
.kb-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.kb-btn { padding: 10px 13px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06); color: #e8ebf0; font: 700 12px Inter, sans-serif; letter-spacing: 1px; text-transform: uppercase; }
.kb-btn.primary { background: rgba(120,200,255,0.14); border-color: rgba(120,200,255,0.5); }
.kb-btn.armed { outline: 2px solid #aef7ff; }
.kb-btn:disabled { opacity: 0.35; cursor: default; }
.kb-lab { font: 700 11px Inter, sans-serif; letter-spacing: 1.6px; text-transform: uppercase; opacity: 0.6; }
.kb-err { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: #35131a; border: 1px solid rgba(255,90,90,0.4); color: #ffb3b3; padding: 7px 13px; border-radius: 10px; z-index: 70; font-size: 12.5px; white-space: nowrap; }
.kb-view { position: absolute; top: 8px; left: 8px; z-index: 10; display: flex; gap: 6px; }
.kb-hint { position: absolute; bottom: 8px; left: 8px; right: 8px; z-index: 10; pointer-events: none; text-align: center; }
.kb-card { border: none; background: none; padding: 0; cursor: pointer; border-radius: 8px; }
.kb-card.sel { outline: 3px solid #aef7ff; outline-offset: 2px; }
.kb-card:disabled { opacity: 0.4; cursor: default; }
`;

function goalText(guid: string): string {
  const g = GOAL_BY_GUID[guid];
  if (!g) return guid;
  const [kind, arg] = g.per.split(':');
  const what: Record<string, string> = {
    car: 'car', carModelKind: 'different model', model: arg, upgradedPart: `${arg} upgrade`,
    upgradedDesign: 'upgraded design', testedDesign: 'tested design', partOf: `part (${arg})`,
    carInGarages: `car in garages ${arg}`, certifiedIn: `${arg} certification`, design: 'design',
    book: 'book', certification: 'certification', part: 'part', bankedShift: 'banked shift', speechOnBoard: 'kept speech token',
  };
  return `${g.pp} PP / ${what[kind] ?? g.per} (x${g.max})`;
}

/** a performance goal card image (sheet 118, 8x5) */
function GoalCard({ scene, guid, w = 74 }: { scene: KanbanSceneDef; guid: string; w?: number }) {
  const def = scene.objects[guid];
  const sheet = scene.sheets[String(def?.sheet ?? 118)] ?? scene.sheets['118'];
  if (def?.cell === undefined) return null;
  return <CardSprite face={sheet.face} cols={sheet.cols} rows={sheet.rows} cell={def.cell} w={w} h={w * 1.55} />;
}

/** a design tile face as a 2D chip (lower-left texture quadrant) */
function DesignChip({ scene, guid, w = 54, selected, onClick }: {
  scene: KanbanSceneDef; guid: string; w?: number; selected?: boolean; onClick?: () => void;
}) {
  const def = scene.objects[guid];
  const d = DESIGN_BY_GUID[guid];
  return (
    <button className={`kb-card${selected ? ' sel' : ''}`} onClick={onClick} title={`${d?.model} ${d?.part ?? ''}`}>
      <div style={{
        width: w, height: w, borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)',
        backgroundImage: `url(${def?.tex ?? ''})`, backgroundSize: '200% 200%', backgroundPosition: '0% 100%',
      }} />
      <div style={{ fontSize: 10, opacity: 0.7, paddingTop: 2 }}>{d?.model}{d?.part ? ` · ${d.part.slice(0, 5)}` : ' · flex'}</div>
    </button>
  );
}

// what a tap on the board has armed; the strip completes it
type Armed =
  | { kind: 'provide'; model: CarModel }
  | { kind: 'upgrade'; model: CarModel }
  | { kind: 'order' }
  | { kind: 'claim'; queueIndex: number }
  | { kind: 'recycle'; take: Part }
  | { kind: 'orientPart'; part: Part }
  | null;

function pickLabel(id: string, view: KanbanView): string {
  const [kind, a, b] = id.split(':');
  switch (kind) {
    case 'ws': return `${a} ${b === '0' ? 'top' : 'bottom'}`;
    case 'cert': return `space ${4 - +a}`;
    case 'wh': return a;
    case 'design': return `row ${+a + 1}`;
    case 'stack': return a === 'central' ? 'central stack' : a === 'officeTop' ? 'office top' : 'office bottom';
    case 'displace': return a === '0' ? 'roll out' : `spot ${a}`;
    case 'speak': return `goal ${+a + 1}`;
    case 'order': return 'kanban order';
    case 'voucher': return 'voucher';
    case 'provide': return `build ${a}`;
    case 'upgrade': return `upgrade ${a}`;
    case 'recycle': return `recycling ${view.recycling[+a] ?? ''}`;
    case 'claim': return `claim ${view.testTrack[+a] ?? ''}`;
    case 'train': return `train ${a}`;
    default: return id;
  }
}

export function KanbanPlay({ view, act, error }: {
  view: KanbanView;
  act: (a: KanbanAction) => void;
  error: string | null;
}) {
  const [showIntro, setShowIntro] = useState(true);
  const [view3d, setView3d] = useState<'factory' | 'mat'>('factory');
  const [armed, setArmed] = useState<Armed>(null);
  const scene = useKanbanScene();
  const me = view.you !== null ? view.players[view.you] : null;

  const send = (a: KanbanAction) => { playSfx('click'); setArmed(null); act(a); };

  const myPending = me && view.pending?.seat === me.seat ? view.pending : null;
  const myTurn = me !== null && view.turn === me.seat && !view.pending;
  const working = myTurn && view.phase === 'work' && me !== null && !me.done && !!me.workstation;
  const depts: Dept[] = me?.workstation
    ? (me.workstation.dept === 'Admin' ? (me.adminDept ? ['Admin', me.adminDept] : ['Admin']) : [me.workstation.dept])
    : [];

  // ---------- board targets for the current decision ----------
  const picks: KanbanPick[] = useMemo(() => {
    if (!me || !scene) return [];
    const out: KanbanPick[] = [];
    const S = LAYOUT_TABLES.SPOTS;
    const d = myPending?.decision as (Record<string, unknown> & { kind: string }) | undefined;

    if (d?.kind === 'selectWorkstation') {
      DEPTS.forEach((dept, di) => {
        [0, 1].forEach((slot) => {
          const spot = S.Departments[di][slot];
          if (spot) out.push({ id: `ws:${dept}:${slot}`, x: spot.x, z: spot.z, r: 1.15 });
        });
      });
      return out;
    }
    if (d?.kind === 'certSpace') {
      for (let sp = 0; sp < 4; sp++) {
        const taken = view.players.some((q) => q.seat !== me.seat && q.cert.section === d.section && q.cert.space === sp);
        if (!taken) {
          const spot = CERT_SPOT(d.section as number, sp);
          out.push({ id: `cert:${sp}`, x: spot.x, z: spot.z, r: 0.75 });
        }
      }
      return out;
    }
    if (d?.kind === 'orientPick') {
      if (!armed || armed.kind !== 'orientPart') {
        PARTS.forEach((part, wi) => {
          if (view.warehouses[part] > 0) {
            const g = LAYOUT_TABLES.PARTS.Positions.Logistics[wi][2];
            out.push({ id: `wh:${part}`, x: g.x, z: g.z, r: 1.9 });
          }
        });
      } else {
        view.designRow.forEach((g, i) => { if (g) { const s = DESIGN_SPOT(i); out.push({ id: `design:${i}`, x: s.x, z: s.z, r: 1.7 }); } });
        (['central', 'officeTop', 'officeBottom'] as const).forEach((k) => {
          const top = k === 'central' ? view.centralTop : k === 'officeTop' ? view.officeTopTop : view.officeBottomTop;
          if (top) { const s = STACK_SPOT(k); out.push({ id: `stack:${k}`, x: s.x, z: s.z, r: 1.7 }); }
        });
      }
      return out;
    }
    if (d?.kind === 'displace') {
      (d.options as number[]).forEach((n) => {
        if (n === 0) out.push({ id: 'displace:0', x: 27, z: -16.2, w: 3.2, d: 9 });
        else { const s = NODE_SPOT(n); out.push({ id: `displace:${n}`, x: s.x, z: s.z, r: 1.6 }); }
      });
      return out;
    }
    if (view.phase === 'meeting' && myTurn) {
      view.meetingGoals.forEach((g, i) => {
        const full = g.tokens.length >= (GOAL_BY_GUID[g.guid]?.max ?? 0);
        const spoken = g.tokens.some((tk) => tk.seat === me.seat);
        if (!full && !spoken && me.speechOnBoard > 0) {
          const spot = LAYOUT_TABLES.GOALS.Cards.Positions[Math.min(i, 3)];
          out.push({ id: `speak:${i}`, x: spot.x, z: spot.z, w: 3.8, d: 5.6 });
        }
      });
      return out;
    }
    if (!working) return out;

    // work turn: targets by department
    if (depts.includes('Design') && me.shiftsLeft > 0 && me.designs.length < 4 + (me.training.Design >= 3 ? 1 : 0)) {
      view.designRow.forEach((g, i) => { if (g) { const s = DESIGN_SPOT(i); out.push({ id: `design:${i}`, x: s.x, z: s.z, r: 1.7 }); } });
      if (me.training.Design >= 3) {
        (['central', 'officeTop', 'officeBottom'] as const).forEach((k) => {
          const top = k === 'central' ? view.centralTop : k === 'officeTop' ? view.officeTopTop : view.officeBottomTop;
          if (top) { const s = STACK_SPOT(k); out.push({ id: `stack:${k}`, x: s.x, z: s.z, r: 1.7 }); }
        });
      }
    }
    if (depts.includes('Logistics') && me.shiftsLeft > 0) {
      PARTS.forEach((part, wi) => {
        if (view.warehouses[part] > 0 && me.parts.length < 5 + (me.training.Logistics >= 3 ? 1 : 0)) {
          const g = LAYOUT_TABLES.PARTS.Positions.Logistics[wi][2];
          out.push({ id: `wh:${part}`, x: g.x, z: g.z, r: 1.9 });
        }
      });
      if (!me.orderIssued && (me.orders?.length ?? 0) > 0) out.push({ id: 'order', x: KANBAN_DECK_PICK.x, z: KANBAN_DECK_PICK.z, w: 3.6, d: 5.2 });
      if (me.training.Logistics >= 3 && !me.voucherTaken) out.push({ id: 'voucher', x: 6.9, z: -30.5, r: 1.4 });
    }
    if (depts.includes('Assembly') && me.shiftsLeft > 0 && (me.parts.length > 0 || me.vouchers > 0)) {
      const ENTRY: Record<CarModel, number> = { City: 13, Concept: 11, Sport: 15, SUV: 12, Truck: 14 };
      MODELS.forEach((m) => {
        const entry = NODE_SPOT(ENTRY[m]);
        out.push({ id: `provide:${m}`, x: entry.x + 2.4, z: entry.z, r: 1.4 });
      });
    }
    if (depts.includes('Assembly') && me.parts.length > 0) {
      view.recycling.forEach((_part, i) => {
        const s = LAYOUT_TABLES.PARTS.Positions.Recycling[i];
        out.push({ id: `recycle:${i}`, x: s.x, z: s.z, r: 1.1 });
      });
    }
    if (depts.includes('RnD')) {
      view.testTrack.forEach((c, i) => {
        if (c && (me.designs ?? []).some((g) => DESIGN_BY_GUID[g].model === c)
          && me.garages.some((g, gi) => g === null && (gi < 4 || me.training.Assembly >= 3))) {
          const s = QUEUE_SPOT(i);
          out.push({ id: `claim:${i}`, x: s.x, z: s.z, w: 2.6, d: 3.4 });
        }
      });
      if (me.shiftsLeft > 0) {
        MODELS.forEach((m) => {
          const usable = (me.designs ?? []).some((g) => DESIGN_BY_GUID[g].model === m && DESIGN_BY_GUID[g].part
            && (me.parts.includes(DESIGN_BY_GUID[g].part!) || me.vouchers > 0));
          if (usable && view.upgrades[m].some((x) => x === null)) {
            const s = BAY_SPOT(m);
            out.push({ id: `upgrade:${m}`, x: s.x, z: s.z, w: 4.6, d: 4.2 });
          }
        });
      }
    }
    // training: the next space on each department you work in
    depts.forEach((dept) => {
      const lvl = Math.min(me.training[dept], 5);
      if (lvl < 5 && (me.shiftsLeft > 0 || me.books > 0)) {
        const spot = S.Trainings[DEPTS.indexOf(dept)][lvl + 1];
        out.push({ id: `train:${dept}`, x: spot.x, z: spot.z, r: 1.0 });
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, scene, view, myPending, myTurn, working, armed]);

  if (!me || !scene) return <div className="page center"><h2>Clocking in</h2></div>;

  // ---------- board tap dispatcher ----------
  const onPick = (id: string) => {
    playSfx('click');
    const [kind, a, b] = id.split(':');
    switch (kind) {
      case 'ws': return send({ type: 'choose', dept: a as Dept, space: +b });
      case 'cert': return send({ type: 'choose', space: +a });
      case 'wh':
        if (myPending?.decision.kind === 'orientPick') { setArmed({ kind: 'orientPart', part: a as Part }); return; }
        return send({ type: 'collect_parts', warehouse: a as Part, count: 6 });
      case 'design': {
        if (armed?.kind === 'orientPart') return send({ type: 'choose', part: armed.part, design: view.designRow[+a]! });
        return send({ type: 'select_design', index: +a });
      }
      case 'stack': {
        if (armed?.kind === 'orientPart') {
          const top = a === 'central' ? view.centralTop : a === 'officeTop' ? view.officeTopTop : view.officeBottomTop;
          return send({ type: 'choose', part: armed.part, design: top! });
        }
        return send({ type: 'advanced_design', stack: a as 'central' | 'officeTop' | 'officeBottom' });
      }
      case 'displace': return send({ type: 'choose', node: +a });
      case 'speak': return send({ type: 'speak', placeToken: +a });
      case 'order': setArmed({ kind: 'order' }); return;
      case 'voucher': return send({ type: 'receive_voucher' });
      case 'provide': setArmed({ kind: 'provide', model: a as CarModel }); return;
      case 'upgrade': setArmed({ kind: 'upgrade', model: a as CarModel }); return;
      case 'recycle': setArmed({ kind: 'recycle', take: view.recycling[+a] }); return;
      case 'claim': {
        const car = view.testTrack[+a]!;
        const designs = (me.designs ?? []).filter((g) => DESIGN_BY_GUID[g].model === car);
        if (designs.length === 1) return send({ type: 'claim_car', queueIndex: +a, design: designs[0] });
        setArmed({ kind: 'claim', queueIndex: +a });
        return;
      }
      case 'train': return send({ type: 'train', dept: a as Dept });
    }
  };

  const d = myPending?.decision as (Record<string, unknown> & { kind: string; label?: string }) | undefined;
  const status =
    view.phase === 'ended' ? `${view.players.find((p) => p.color === view.winner)?.name} wins`
    : d ? (armed?.kind === 'orientPart' ? `Taking a part · now tap a design` : String(d.label ?? 'Choose on the board'))
    : view.pending ? `${view.players[view.pending.seat].name} is deciding`
    : view.phase === 'meeting' ? (myTurn ? 'Meeting · tap a goal card on the board, play a goal below, or pass' : `${view.players[view.turn]?.name} is speaking`)
    : view.phase === 'select' ? (myTurn ? 'Tap a workstation for the day' : `${view.players[view.turn]?.name ?? 'Sandra'} is choosing`)
    : working ? `Your turn · ${me.shiftsLeft} shifts · tap the board`
    : view.phase === 'work' ? `${view.players[view.turn]?.name ?? 'Sandra'} is working` : '';

  return (
    <div className="kb-wrap">
      <style>{CSS}</style>
      <div className="kb-top">
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: hex(SEAT_TINT[me.color]) }} />
        <b>{me.name}</b>
        <span style={{ opacity: 0.55, fontSize: 12 }}>{me.workstation ? me.workstation.dept : ''}</span>
        <span style={{ opacity: 0.8, fontSize: 12, marginLeft: 'auto' }}>
          {me.bankedShifts}bk · {me.books}bo · {me.vouchers}vo · {me.speechOnBoard}sp
        </span>
        <span style={{ font: '800 16px Inter, sans-serif' }}>{me.pp} PP</span>
        <button className="kb-btn" style={{ padding: '5px 9px' }} onClick={() => setShowIntro(true)}>?</button>
      </div>

      {/* the live 3D surface */}
      <div className="kb-3d">
        {view3d === 'factory'
          ? <KanbanTable scene={scene} view={view} pickTargets={picks} onPick={onPick} embed />
          : <KanbanMat scene={scene} me={me} height="100%" />}
        <div className="kb-view">
          <button className={`kb-btn${view3d === 'factory' ? ' armed' : ''}`} onClick={() => setView3d('factory')}>Factory</button>
          <button className={`kb-btn${view3d === 'mat' ? ' armed' : ''}`} onClick={() => setView3d('mat')}>My mat</button>
        </div>
        <div className="kb-hint">
          <span className="kb-lab" style={{ background: 'rgba(5,8,11,0.75)', padding: '5px 10px', borderRadius: 9, opacity: 0.95 }}>{status}</span>
        </div>
        {error && <div className="kb-err">{error}</div>}
      </div>

      {/* the completion strip */}
      <div className="kb-strip">
        {picks.length > 0 && (
          <div className="kb-row" style={{ opacity: 0.9 }}>
            {picks.map((pt) => (
              <button key={pt.id} className="kb-btn" style={{ padding: '7px 10px', fontSize: 11 }} onClick={() => onPick(pt.id)}>
                {pickLabel(pt.id, view)}
              </button>
            ))}
          </div>
        )}
        {armed?.kind === 'orientPart' && (
          <div className="kb-row">
            <span className="kb-lab">Part chosen · tap a design tile on the board</span>
            <button className="kb-btn" onClick={() => setArmed(null)}>Back</button>
          </div>
        )}
        {armed?.kind === 'provide' && (
          <div className="kb-row">
            <span className="kb-lab">Provide to {armed.model}:</span>
            {[...new Set(me.parts)].map((p) => (
              <button key={p} className="kb-btn" onClick={() => send({ type: 'provide_part', model: armed.model, part: p })}>{p}</button>
            ))}
            {me.vouchers > 0 && PARTS.filter((p) => !me.parts.includes(p)).map((p) => (
              <button key={`v${p}`} className="kb-btn" onClick={() => send({ type: 'provide_part', model: armed.model, part: p, voucher: true })}>{p} (V)</button>
            ))}
            <button className="kb-btn" onClick={() => setArmed(null)}>Back</button>
          </div>
        )}
        {armed?.kind === 'upgrade' && (() => {
          const designs = (me.designs ?? []).filter((g) => DESIGN_BY_GUID[g].model === armed.model && DESIGN_BY_GUID[g].part);
          const benefits = (UPGRADE_SPACES as Record<string, ({ pp?: number; bankedShifts?: number; books?: number } | null)[]>)[armed.model];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="kb-lab">Upgrade {armed.model} · pick the space for its benefit</span>
              {designs.map((g) => {
                const part = DESIGN_BY_GUID[g].part!;
                const have = me.parts.includes(part);
                const canDouble = me.doubleUpgrade === 'ready' && !view.partDoubled[part];
                if (!have && me.vouchers <= 0) return null;
                return (
                  <div key={g} className="kb-row">
                    <DesignChip scene={scene} guid={g} />
                    {view.upgrades[armed.model].map((x, space) => x === null && (
                      <button key={space} className="kb-btn" onClick={() => send({ type: 'upgrade_design', design: g, space, voucher: !have })}>
                        {benefits?.[space]?.pp ? `+${benefits[space]!.pp} PP` : benefits?.[space]?.bankedShifts ? 'bank 1' : benefits?.[space]?.books ? '+1 book' : 'plain'}
                      </button>
                    ))}
                    {canDouble && view.upgrades[armed.model].some((x) => x === null) && (
                      <button className="kb-btn primary" onClick={() => send({ type: 'upgrade_design', design: g, space: view.upgrades[armed.model].findIndex((x) => x === null), voucher: !have, double: true })}>
                        DOUBLE (+{Math.min(6, view.partValues[part] + 2)} PP)
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="kb-row"><button className="kb-btn" onClick={() => setArmed(null)}>Back</button></div>
            </div>
          );
        })()}
        {armed?.kind === 'order' && (me.orders ?? []).map((o) => (
          <div key={o} className="kb-row">
            <span className="kb-lab">{ORDER_BY_GUID[o].parts.map((p) => p.slice(0, 4)).join(' · ')}</span>
            {([0, 1, 2, 3] as const).map((pl) => (
              <button key={pl} className="kb-btn" onClick={() => send({ type: 'issue_order', card: o, placement: pl })}>
                {pl === 0 ? 'first 4 up' : pl === 1 ? 'first 2 up' : pl === 2 ? 'last 4 up' : 'last 2 up'}
              </button>
            ))}
            <button className="kb-btn" onClick={() => setArmed(null)}>Back</button>
          </div>
        ))}
        {armed?.kind === 'recycle' && (
          <div className="kb-row">
            <span className="kb-lab">Swap for the {armed.take}:</span>
            {[...new Set(me.parts)].map((p) => (
              <button key={p} className="kb-btn" onClick={() => send({ type: 'recycle', give: p, take: armed.take })}>give {p}</button>
            ))}
            <button className="kb-btn" onClick={() => setArmed(null)}>Back</button>
          </div>
        )}
        {armed?.kind === 'claim' && (
          <div className="kb-row">
            <span className="kb-lab">Return which design?</span>
            {(me.designs ?? []).filter((g) => DESIGN_BY_GUID[g].model === view.testTrack[armed.queueIndex]).map((g) => (
              <DesignChip key={g} scene={scene} guid={g} onClick={() => send({ type: 'claim_car', queueIndex: armed.queueIndex, design: g })} />
            ))}
            <button className="kb-btn" onClick={() => setArmed(null)}>Back</button>
          </div>
        )}

        {/* pending prompts that live off-board */}
        {d?.kind === 'award' && (
          <div className="kb-row">
            <span className="kb-lab">Pick a secret award</span>
            {(d.options as string[]).map((g, i) => (
              <button key={g} className="kb-btn" onClick={() => send({ type: 'choose', option: i })}>Award {i + 1}</button>
            ))}
          </div>
        )}
        {d?.kind === 'garage' && (
          <div className="kb-row">
            <span className="kb-lab">Park the {String(d.model)}:</span>
            {me.garages.map((g, i) => (
              <button key={i} className="kb-btn" disabled={g !== null || (i === 4 && me.training.Assembly < 3)}
                onClick={() => send({ type: 'choose', garage: i })}>
                G{i + 1}{g ? ` · ${g}` : me.garageTiles[i].flipped ? '' : ' · bonus'}
              </button>
            ))}
          </div>
        )}
        {d?.kind === 'seedGoal' && (
          <div className="kb-row">
            <span className="kb-lab">Seed one goal for the next meeting</span>
            {(me.goals ?? []).map((g) => (
              <button key={g} className="kb-card" onClick={() => send({ type: 'choose', goal: g })} title={goalText(g)}>
                <GoalCard scene={scene} guid={g} />
              </button>
            ))}
          </div>
        )}

        {/* meeting hand */}
        {view.phase === 'meeting' && !d && (
          <div className="kb-row">
            <span className="kb-lab">{me.playedGoalThisMeeting ? 'Goal played' : 'Play one goal:'}</span>
            {!me.playedGoalThisMeeting && (me.goals ?? []).map((g) => (
              <button key={g} className="kb-card" disabled={!myTurn}
                onClick={() => send({ type: 'speak', playGoal: g, placeToken: me.speechOnBoard > 0 ? view.meetingGoals.length : undefined })}
                title={goalText(g)}>
                <GoalCard scene={scene} guid={g} />
              </button>
            ))}
            <button className="kb-btn primary" disabled={!myTurn || !me.playedGoalThisMeeting} onClick={() => send({ type: 'pass' })}>Pass</button>
          </div>
        )}

        {/* work-turn utilities */}
        {working && !armed && (
          <div className="kb-row">
            {me.workstation!.dept === 'Admin' && !me.adminDept && DEPTS.filter((x) => x !== 'Admin').map((x) => (
              <button key={x} className="kb-btn" onClick={() => send({ type: 'admin_pick', dept: x })}>Manage {x}</button>
            ))}
            <button className="kb-btn" disabled={me.bankedShifts <= 0} onClick={() => act({ type: 'use_banked', n: 1 })}>Use banked</button>
            <button className="kb-btn primary" style={{ marginLeft: 'auto' }} onClick={() => send({ type: 'end_turn' })}>End turn</button>
          </div>
        )}
      </div>

      {showIntro && <GameIntro intro={KANBAN_INTRO} onClose={() => setShowIntro(false)} />}
    </div>
  );
}
