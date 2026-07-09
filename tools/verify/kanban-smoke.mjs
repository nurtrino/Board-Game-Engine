// Live WS smoke for Kanban EV. Creates a room, joins one human seat,
// starts (the server pads with CPU seats), and plays the human seat
// random-legal from the view until the game ends. Exits non-zero on
// stalls. Run: node tools/verify/kanban-smoke.mjs [ws-url]

import WebSocket from 'ws';

const URL = process.argv[2] ?? 'ws://localhost:8899/ws';
const ws = new WebSocket(URL);
const send = (m) => ws.send(JSON.stringify(m));
const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];

const DEPTS = ['RnD', 'Assembly', 'Logistics', 'Design', 'Admin'];
const PARTS = ['Autopilots', 'Batteries', 'Bodies', 'Drivetrains', 'Electronics', 'Motors'];
const MODELS = ['City', 'SUV', 'Truck', 'Sport', 'Concept'];

let roomId = null;
let seat = null;
let view = null;
let acts = 0;
let lastProgress = Date.now();

function myMove() {
  if (!view || seat === null) return;
  const me = view.players[seat];
  const act = (action) => { acts++; send({ type: 'action', action }); };

  if (view.pending && view.pending.seat === seat) {
    const d = view.pending.decision;
    switch (d.kind) {
      case 'certSpace': return act({ type: 'choose', space: rand(4) });
      case 'orientPick': {
        const wh = PARTS.filter((x) => view.warehouses[x] > 0);
        const designs = [...view.designRow.filter(Boolean), view.centralTop, view.officeTopTop, view.officeBottomTop].filter(Boolean);
        return act({ type: 'choose', part: pick(wh), design: pick(designs) });
      }
      case 'selectWorkstation': return act({ type: 'choose', dept: pick(DEPTS), space: rand(2) });
      case 'award': return act({ type: 'choose', option: 0 });
      case 'displace': return act({ type: 'choose', node: pick(d.options) });
      case 'garage': {
        const free = me.garages.map((g, i) => (g === null ? i : -1)).filter((i) => i >= 0);
        return act({ type: 'choose', garage: pick(free) });
      }
      case 'seedGoal': return act({ type: 'choose', goal: me.goals[0] });
      default: return act({ type: 'choose' });
    }
  }
  if (view.pending || view.turn !== seat || view.phase === 'ended') return;

  if (view.phase === 'meeting') {
    if (!me.playedGoalThisMeeting) return act({ type: 'speak', playGoal: me.goals[0], placeToken: me.speechOnBoard > 0 ? view.meetingGoals.length : undefined });
    if (me.speechOnBoard > 0 && Math.random() < 0.5) {
      const open = view.meetingGoals.map((g, i) => ({ g, i })).filter(({ g }) => !g.tokens.some((t) => t.seat === seat));
      if (open.length) return act({ type: 'speak', placeToken: pick(open).i });
    }
    return act({ type: 'pass' });
  }
  if (view.phase !== 'work' || me.done) return;

  const tries = [];
  if (me.workstation?.dept === 'Admin' && !me.adminDept) tries.push({ type: 'admin_pick', dept: pick(DEPTS.filter((x) => x !== 'Admin')) });
  if (me.shiftsLeft === 0 && me.bankedShifts > 0 && Math.random() < 0.5) tries.push({ type: 'use_banked', n: 1 });
  if (me.shiftsLeft > 0) {
    tries.push({ type: 'train' });
    const spots = view.designRow.map((g, i) => (g ? i : -1)).filter((i) => i >= 0);
    if (spots.length) tries.push({ type: 'select_design', index: pick(spots) });
    if (me.orders?.length && !me.orderIssued) tries.push({ type: 'issue_order', card: me.orders[0], placement: rand(4) });
    const wh = PARTS.filter((x) => view.warehouses[x] > 0);
    if (wh.length) tries.push({ type: 'collect_parts', warehouse: pick(wh), count: 1 + rand(3) });
    if (me.parts.length) tries.push({ type: 'provide_part', model: pick(MODELS), part: pick(me.parts) });
  }
  tries.push({ type: 'end_turn' });
  return act(pick(tries));
}

ws.on('open', () => send({ type: 'create_room', name: 'Kanban smoke', game: 'kanban' }));
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'room_created') {
    roomId = m.roomId;
    console.log('room', roomId);
    send({ type: 'join', roomId, name: 'Smoke' });
  } else if (m.type === 'joined') {
    seat = m.playerIndex;
    send({ type: 'start' });
  } else if (m.type === 'state') {
    if (m.view.you !== seat) return; // watcher frame
    view = m.view;
    lastProgress = Date.now();
    if (view.phase === 'ended') {
      console.log(`ENDED day=${view.day} winner=${view.winner} acts=${acts}`);
      console.log(view.finalScores?.map((f) => `${view.players[f.seat].name}: ${f.pp} PP`).join(' | '));
      process.exit(0);
    }
    setTimeout(myMove, 50);
  } else if (m.type === 'error') {
    setTimeout(myMove, 50);
  }
});
ws.on('error', (e) => { console.error(e.message); process.exit(1); });

setInterval(() => {
  if (Date.now() - lastProgress > 45000) {
    console.error(`STALLED phase=${view?.phase} day=${view?.day} turn=${view?.turn} pending=${JSON.stringify(view?.pending)}`);
    process.exit(1);
  }
}, 5000);
