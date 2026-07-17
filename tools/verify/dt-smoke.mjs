// Live WS smoke: two driver players play a full Dark Tower game.
// Run: npx tsx tools/verify/dt-smoke.mjs <port>
import WebSocket from 'ws';
import {
  DT_KEYS, DT_NODE, DT_FORWARD_FRONTIER,
  dtActionForNode, dtAdjacent, dtKingdomAt,
} from '../../shared/src/index.ts';

const URL = `ws://localhost:${process.argv[2] ?? '8787'}/ws`;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } };

const mk = (name) => new Promise((res, rej) => {
  const ws = new WebSocket(URL);
  const c = { ws, name, view: null, room: null, seat: null, handlers: [], send: (m) => ws.send(JSON.stringify(m)) };
  c.wait = (pred, t = 15000) => new Promise((r, j) => {
    if (pred(c)) return r();
    const to = setTimeout(() => j(new Error(name + ' timeout')), t);
    c.handlers.push(() => { if (pred(c)) { clearTimeout(to); r(); } });
  });
  ws.on('open', () => res(c));
  ws.on('error', rej);
  ws.on('message', (b) => {
    const m = JSON.parse(b.toString());
    if (m.type === 'room') c.room = m.info;
    if (m.type === 'state' && (c.seat === null || m.view.you === c.seat)) c.view = m.view;
    if (m.type === 'joined') c.seat = m.playerIndex;
    for (const h of [...c.handlers]) h(m);
  });
});

function pick(v, seat) {
  const p = v.players[seat];
  if (v.phase === 'turnDone') return { type: 'end_turn' };
  if (v.phase === 'battle') return (!v.battle.tower && p.warriors <= 3 && Math.random() < 0.7) ? { type: 'battle_bail' } : { type: 'battle_continue' };
  if (v.phase === 'cursePick') return { type: 'curse', victim: v.players.find((q) => q.seat !== seat).seat };
  if (v.phase === 'riddle') return { type: 'riddle_guess', key: DT_KEYS[Math.floor(Math.random() * 3)] };
  if (v.phase === 'bazaar') {
    const bz = v.bazaar;
    if (bz.offer === 'warrior' && p.warriors < 55 && (bz.buying + 1) * bz.prices.warrior <= p.gold && bz.buying < 10) return { type: 'bazaar_yes' };
    if (bz.offer === 'food' && p.food < 30 && bz.buying < Math.min(20, p.gold)) return { type: 'bazaar_yes' };
    if (bz.buying > 0) return { type: 'bazaar_no' };
    if (bz.offer === 'beast' && bz.prices.beast <= p.gold) return { type: 'bazaar_yes' };
    return Math.random() < 0.25 ? { type: 'bazaar_haggle' } : { type: 'bazaar_no' };
  }
  const legal = v.legalSteps ?? [];
  const actionAt = (id) => ({ type: dtActionForNode(id) ?? 'move' });
  if (!legal.length) return actionAt(p.node);
  if (p.node !== v.turnNode) return actionAt(p.node);

  const currentKingdom = dtKingdomAt(p.color, p.quad);
  const kindOf = (id) => DT_NODE.get(id)?.kind;
  const nav = (goal) => {
    const direct = legal.find(goal);
    if (direct) return direct;
    const prev = new Map([[p.node, null]]), queue = [p.node];
    let found = null;
    while (queue.length && !found) {
      const current = queue.shift();
      for (const neighbor of dtAdjacent(current)) {
        if (prev.has(neighbor)) continue;
        const n = DT_NODE.get(neighbor);
        const pass = n?.kingdom === currentKingdom && n.kind !== 'frontier' && n.kind !== 'darktower'
          && !(n.kind === 'citadel' && n.kingdom !== p.color);
        if (goal(neighbor) || pass) {
          prev.set(neighbor, current); queue.push(neighbor);
          if (goal(neighbor)) { found = neighbor; break; }
        }
      }
    }
    if (!found) return null;
    let hop = found;
    while (prev.get(hop) !== p.node && prev.get(hop) !== null) hop = prev.get(hop);
    return legal.includes(hop) ? hop : null;
  };
  const isTomb = (id) => kindOf(id) === 'tomb' || kindOf(id) === 'ruin';
  const isRest = (id) => kindOf(id) === 'sanctuary' || kindOf(id) === 'citadel';
  const isBazaar = (id) => kindOf(id) === 'bazaar';
  const haveKey = p.quad === 0 || (p.quad === 1 && p.brasskey) || (p.quad === 2 && p.silverkey) || (p.quad === 3 && p.goldkey);
  let target = null;
  if (p.warriors <= 4 || p.food <= 4) target = nav(isRest) ?? nav(isBazaar);
  if (!target && p.quad >= 4 && p.brasskey && p.silverkey && p.goldkey) {
    if (p.warriors >= Math.min(44, v.dtBrigands ?? 44)) target = nav((id) => kindOf(id) === 'darktower');
    if (!target && p.gold >= 8) target = nav(isBazaar);
    if (!target) target = isTomb(p.node) ? p.node : nav(isTomb);
  } else if (!target && haveKey) {
    target = nav((id) => id === DT_FORWARD_FRONTIER.get(currentKingdom));
  } else if (!target) {
    if (p.warriors < 12 && p.gold >= 12) target = nav(isBazaar);
    if (!target) target = isTomb(p.node) ? p.node : nav(isTomb);
  }
  target ??= legal.find((id) => id !== p.node && kindOf(id) === 'empty') ?? legal.find((id) => id !== p.node) ?? p.node;
  return target === p.node ? actionAt(p.node) : { type: 'move_token', node: target };
}

const [a, b] = await Promise.all([mk('Ada'), mk('Ben')]);
a.send({ type: 'create_room', name: 'DT smoke', game: 'darktower' });
let roomId;
await new Promise((r) => a.handlers.push((m) => { if (m.type === 'room_created') { roomId = m.roomId; r(); } }));
for (const c of [a, b]) { c.send({ type: 'join', roomId, name: c.name }); await c.wait((x) => x.seat !== null); }
a.send({ type: 'start' });
await a.wait((c) => c.view?.game === 'darktower');
console.log('started; level', a.view.level, 'riddle hidden:', a.view.riddle === null);
ok(a.view.riddle === null, 'riddle hidden in play');

let acts = 0;
const t0 = Date.now();
while (a.view.phase !== 'ended' && acts < 6000 && Date.now() - t0 < 180000) {
  const seat = a.view.turn;
  const c = [a, b][seat];
  await c.wait((x) => x.view && (x.view.turn === seat || x.view.phase === 'ended'), 15000);
  if (c.view.phase === 'ended') break;
  // every successful action emits a fresh event — wait on the seq
  const before = JSON.stringify([c.view.lastEvent?.seq, c.view.phase, c.view.bazaar, c.view.riddlePhase, c.view.players[seat]?.node, c.view.turnNode]);
  c.send({ type: 'action', action: pick(c.view, seat) });
  try {
    await c.wait((x) => x.view.phase === 'ended' || JSON.stringify([x.view.lastEvent?.seq, x.view.phase, x.view.bazaar, x.view.riddlePhase, x.view.players[seat]?.node, x.view.turnNode]) !== before, 8000);
  } catch { ok(false, `stalled at act ${acts}`); break; }
  acts++;
}
ok(a.view.phase === 'ended', `game ended (${acts} acts)`);
ok(a.view.winner !== null, 'winner set');
ok(a.view.riddle !== null, 'riddle revealed at end');
console.log('final:', a.view.winner, 'rating', a.view.score, `(${acts} acts)`);
console.log(fails ? `${fails} FAILURES` : 'DT SMOKE OK');
for (const c of [a, b]) c.ws.close();
process.exit(fails ? 1 : 0);
