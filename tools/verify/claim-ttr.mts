import WebSocket from 'ws';
import { claimableRoutes, bestCardsFor, ROUTES, type TtrView } from '@bge/shared';
const roomId = process.argv[2];
const p = new WebSocket('ws://localhost:8787/ws');
const send = (o: unknown) => p.send(JSON.stringify(o));
let last: TtrView | null = null;
let acting = false, claims = 0, steps = 0;
p.on('open', () => send({ type: 'join', roomId, name: 'Rider' }));
p.on('message', (r: Buffer) => {
  const x = JSON.parse(String(r));
  if (x.type === 'error') { console.log('ERR', x.message); acting = false; step(); }
  if (x.type === 'state' && x.view.game === 'ttr') { last = x.view; acting = false; step(); }
  if (x.type === 'joined') setTimeout(step, 300);
});
function step() {
  if (!last || acting) return;
  const v = last;
  if (v.phase !== 'playing') return;
  if (claims >= 10 || steps > 120) { console.log('done: claims', claims); process.exit(0); }
  steps++;
  const turnSeat = v.players.findIndex((pl) => pl.color === v.turnColor);
  if (v.you !== turnSeat) { acting = true; send({ type: 'dev_view', seat: turnSeat }); return; }
  const me = v.players[turnSeat];
  if (!me?.hand) { acting = true; send({ type: 'dev_view', seat: turnSeat }); return; }
  const shim = { routeOwners: v.routeOwners, harborOwners: v.harborOwners, players: v.players.map((pl) => ({ ...pl, hand: pl.hand ?? [], tickets: [], pendingTickets: [] })) } as never;
  const mine = (shim as { players: never[] }).players[turnSeat];
  const opts = claimableRoutes(shim, mine).map((id) => ROUTES.find((r) => r.id === id)!).sort((a, b) => b.length - a.length);
  acting = true;
  if (v.drawsLeft === 0 && opts.length) {
    const cards = bestCardsFor(shim, mine, opts[0].id);
    if (cards) { claims++; send({ type: 'action', action: { type: 'claim', route: opts[0].id, cards } }); return; }
  }
  send({ type: 'action', action: { type: 'draw_card', source: steps % 2 ? 'train' : 'ship' } });
}
setTimeout(() => { console.log('timeout, claims', claims); process.exit(claims > 0 ? 0 : 1); }, 25000);
