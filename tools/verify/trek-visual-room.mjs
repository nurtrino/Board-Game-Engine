// Create a solo trek room (2 CPU seats) and print its id, then keep the
// socket open briefly so the bots start playing.
import WebSocket from 'ws';
const ws = new WebSocket(`ws://localhost:${process.argv[2] ?? '54212'}/ws`);
let roomId = null;
ws.on('message', (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.type === 'room_created') { roomId = m.roomId; ws.send(JSON.stringify({ type: 'join', roomId, name: 'Chase' })); }
  if (m.type === 'joined') { console.log('ROOM', roomId); ws.send(JSON.stringify({ type: 'start' })); }
  if (m.type === 'error') console.log('ERROR:', m.message);
});
ws.on('open', () => ws.send(JSON.stringify({ type: 'create_room', name: 'Trek visual', game: 'trek' })));
setTimeout(() => process.exit(0), 25000);
