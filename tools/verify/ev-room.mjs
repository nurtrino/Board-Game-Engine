// Create an Everdell room, join one human seat, start (server pads with CPU).
// Prints roomId + playerToken for screenshot drivers.
// Usage: node tools/verify/ev-room.mjs [port] [players]
import WebSocket from 'ws';

const port = process.argv[2] ?? '8787';
const humans = Number(process.argv[3] ?? '1');
const ws = new WebSocket(`ws://localhost:${port}/ws`);
let roomId = null;
const tokens = [];
let joined = 0;

const send = (o) => ws.send(JSON.stringify(o));
ws.on('open', () => send({ type: 'create_room', name: 'Everdell verify', game: 'everdell' }));
ws.on('message', (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.type === 'room_created') {
    roomId = m.roomId;
    send({ type: 'join', roomId, name: 'Chase' });
  }
  if (m.type === 'joined') {
    tokens.push(m.playerToken);
    joined++;
    if (joined < humans) {
      send({ type: 'join', roomId, name: `Guest${joined}` });
    } else {
      send({ type: 'start' });
      setTimeout(() => {
        console.log(JSON.stringify({ roomId, tokens }));
        process.exit(0);
      }, 900);
    }
  }
  if (m.type === 'error') {
    console.error('server error:', m.message);
  }
});
setTimeout(() => { console.error('timeout'); process.exit(1); }, 8000);
