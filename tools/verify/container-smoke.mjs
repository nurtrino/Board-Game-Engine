// Live WS smoke test for Container. Creates a room, joins one seat, starts
// (the server pads to 3 seats with CPUs), and plays the human seat from the
// VIEW with the same greedy goals as the engine bot until the game ends.
// Exits 0 on ENDED, 1 on stalls or rejected actions.
// Run: node tools/verify/container-smoke.mjs [ws-url]

import WebSocket from 'ws';

const URL = process.argv[2] ?? 'ws://localhost:8787/ws';
const ws = new WebSocket(URL);
const send = (m) => ws.send(JSON.stringify(m));

let roomId = null;
let seat = null;
let view = null;
let lastSeq = -1;
let lastProgress = Date.now();
let acts = 0;

const PRICES_F = [1, 2, 3, 4];
const PRICES_H = [2, 3, 4, 5, 6];
const lotCount = (lots) => Object.values(lots).reduce((a, l) => a + l.length, 0);
const flat = (lots) => Object.values(lots).flat();
const countBy = (list) => list.reduce((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {});

const dump = (lots, add, price) => {
  const all = [...flat(lots), ...add];
  const out = {};
  for (const p of (price <= 4 ? PRICES_F : PRICES_H)) out[p] = [];
  out[price] = all;
  return out;
};

function myAction() {
  const p = view.players[seat];
  const d = view.delivery;
  if (d) {
    if (d.stage === 'bidding' && d.bidsIn[seat] === false) {
      return { type: 'delivery_bid', amount: Math.min(p.cash ?? 0, d.cargo.length * 2) };
    }
    if (d.stage === 'runoff' && d.bidsIn[seat] === false) {
      return { type: 'delivery_bid', amount: 0 };
    }
    if (d.stage === 'resolve' && d.deliverer === seat) {
      const high = Math.max(0, ...Object.values(d.bids ?? {}));
      const buyout = (p.cash ?? 0) >= high && high <= d.cargo.length;
      return { type: 'delivery_resolve', mode: buyout ? 'buyout' : 'accept', winner: d.tied[0] };
    }
    return null;
  }
  const head = view.pending[0];
  if (head) {
    if (head.kind === 'bankDistribute' && head.seat === seat) {
      // recompute the forced counts: open container lots round-robin
      const skip = new Set(view.bank.auctions.filter((a) => a.lotType === 'container').map((a) => a.lot));
      const open = [0, 1, 2].filter((l) => !skip.has(l));
      const counts = [0, 0, 0];
      for (let i = 0; i < head.containers.length; i++) counts[open[i % open.length]] += 1;
      const rest = [...head.containers];
      return { type: 'choose_distribute', perLot: counts.map((c) => rest.splice(0, c)) };
    }
    if (head.kind === 'seize' && head.decider === seat) {
      const v = view.players[head.seat];
      const locs = [v.scoring.slice(), v.ship.cargo.slice(), v.holding.slice(), flat(v.harborLots), flat(v.factoryLots)];
      const picks = [];
      for (let i = 0; i < head.count; i++) {
        const loc = locs.find((l) => l.length > 0);
        if (!loc) break;
        picks.push(loc.shift());
      }
      return { type: 'choose_seize', picks };
    }
    return null;
  }
  if (view.turn !== seat || view.phase !== 'playing') return null;
  const cash = p.cash ?? 0;
  if (cash < 2 && p.loans < 2) return { type: 'take_loan' };
  if (p.loans > 0 && cash >= 15) return { type: 'repay_loan' };
  if (view.actionsLeft <= 0) return { type: 'end_turn' };

  if (!view.producedThisTurn && cash >= 1) {
    const eligible = p.factories.filter((c) => view.supply.containers[c] > 0);
    const room = p.factories.length * 2 - lotCount(p.factoryLots) - p.reserves.factory;
    const n = Math.min(eligible.length, Math.max(0, room));
    if (n > 0) {
      const make = eligible.slice(0, n);
      return { type: 'produce', make, lots: dump(p.factoryLots, make, 2) };
    }
  }
  if (p.factories.length < 2) {
    const cost = [0, 6, 9, 12][p.factories.length];
    const color = ['Blue', 'White', 'Yellow', 'Red', 'Green']
      .filter((c) => !p.factories.includes(c) && view.supply.factories[c] > 0)[0];
    if (color && cash >= cost + 2) return { type: 'build_factory', color };
  }
  if (p.warehouses < 3 && p.factories.length >= 2 && view.supply.warehouses > 0) {
    const cost = [0, 4, 5, 6, 7][p.warehouses];
    if (cash >= cost + 2) return { type: 'build_warehouse' };
  }
  const loc = p.ship.loc;
  if (p.ship.cargo.length >= 2 || (view.endTriggered && p.ship.cargo.length > 0)) {
    return loc.kind === 'ocean' ? { type: 'sail', to: 'island' } : { type: 'sail', to: 'ocean' };
  }
  if (loc.kind === 'harbor') {
    const other = view.players[loc.seat];
    let budget = cash;
    let room = 5 - p.ship.cargo.length;
    const picks = [];
    for (const price of PRICES_H) {
      for (const color of other.harborLots[price] ?? []) {
        if (room <= 0 || budget < price) break;
        budget -= price; room -= 1;
        const hit = picks.find((x) => x.price === price && x.color === color);
        if (hit) hit.count += 1; else picks.push({ price, color, count: 1 });
      }
    }
    if (picks.length) return { type: 'harbor_buy', picks, free: view.anchorBuy };
    return { type: 'sail', to: 'ocean' };
  }
  if (loc.kind === 'bank' || loc.kind === 'island') return { type: 'sail', to: 'ocean' };
  if (loc.kind === 'ocean') {
    const target = view.players
      .filter((q) => q.seat !== seat && lotCount(q.harborLots) > 0)
      .sort((a, b) => lotCount(b.harborLots) - lotCount(a.harborLots))[0];
    if (target && cash >= 2) return { type: 'sail', to: { harbor: target.seat } };
  }
  {
    let room = p.warehouses - lotCount(p.harborLots) - p.reserves.harbor;
    if (room > 0) {
      const offers = view.players
        .filter((q) => q.seat !== seat)
        .flatMap((q) => PRICES_F.flatMap((price) => (q.factoryLots[price] ?? []).map((color) => ({ from: q.seat, price, color }))))
        .filter((x) => x.price <= cash)
        .sort((a, b) => a.price - b.price);
      if (offers.length) {
        const from = offers[0].from;
        let budget = cash;
        const picks = [];
        const bought = [];
        for (const o of offers.filter((x) => x.from === from)) {
          if (room <= 0 || budget < o.price) break;
          budget -= o.price; room -= 1;
          bought.push(o.color);
          const hit = picks.find((x) => x.price === o.price && x.color === o.color);
          if (hit) hit.count += 1; else picks.push({ price: o.price, color: o.color, count: 1 });
        }
        if (picks.length) return { type: 'factory_buy', from, picks, lots: dump(p.harborLots, bought, 4) };
      }
    }
  }
  return { type: 'end_turn' };
}

let pendingAction = false;
function step() {
  if (!view || seat === null || pendingAction) return;
  if (view.phase === 'ended') {
    console.log('ENDED. winners:', view.winners.map((w) => view.players[w].name).join(','),
      'totals:', view.players.map((q) => `${q.color}:$${q.finalScore?.total}`).join(' '));
    process.exit(0);
  }
  const a = myAction();
  if (!a) return;
  pendingAction = true;
  acts++;
  send({ type: 'action', action: a });
  setTimeout(() => { pendingAction = false; step(); }, 60);
}

ws.on('open', () => send({ type: 'create_room', name: 'Container smoke', game: 'container', options: { length: 'short' } }));
ws.on('message', (data) => {
  const m = JSON.parse(data);
  if (m.type === 'room_created') {
    roomId = m.roomId;
    console.log('room', roomId);
    send({ type: 'join', roomId, name: 'Smoke' });
  } else if (m.type === 'joined') {
    seat = m.seat ?? 0;
    setTimeout(() => send({ type: 'start' }), 250);
  } else if (m.type === 'state') {
    // the creator socket also receives TV-redacted frames; keep only our seat's
    if (m.view.game !== 'container') return;
    if (m.view.you !== seat) return;
    view = m.view;
    if (view.lastEvent.seq !== lastSeq) { lastSeq = view.lastEvent.seq; lastProgress = Date.now(); }
    step();
  } else if (m.type === 'error') {
    console.error('server error:', m.message);
  }
});
ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });

setInterval(() => {
  if (Date.now() - lastProgress > 45000) {
    console.error('STALLED. acts:', acts, 'phase:', view?.phase, 'turn:', view?.turn, 'seat:', seat,
      'delivery:', JSON.stringify(view?.delivery), 'pending:', JSON.stringify(view?.pending));
    process.exit(1);
  }
}, 5000);
