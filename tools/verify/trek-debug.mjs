import WebSocket from 'ws';
const ws = new WebSocket(`ws://localhost:${process.argv[2] ?? '54212'}/ws`);
let roomId = null, seat = null;
ws.on('message', (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.type === 'room_created') { roomId = m.roomId; ws.send(JSON.stringify({ type: 'join', roomId, name: 'Dbg' })); }
  if (m.type === 'joined') { seat = m.playerIndex; ws.send(JSON.stringify({ type: 'start' })); }
  if (m.type === 'error') console.log('ERROR:', m.message);
  if (m.type === 'state') {
    console.log('state: game', m.view.game, 'phase', m.view.phase, 'you', m.view.you, 'seat', seat);
    console.log('players:', m.view.players.map((p) => ({ name: p.name, seat: p.seat, hand: p.hand, handCount: p.handCount })));
    ws.close();
    process.exit(0);
  }
});
ws.on('open', () => ws.send(JSON.stringify({ type: 'create_room', name: 'dbg', game: 'trek' })));
setTimeout(() => { console.log('timeout'); process.exit(1); }, 10000);
