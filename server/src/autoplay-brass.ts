// Demo and test helper: seats scripted players in a Brass: Birmingham room so a
// whole game plays on the big screen. Create the room on the screen first, then:
//   npm run autoplay:brass -- ROOMCODE [players=3] [--start] [--fast] [--turns=N]
// With players=1 the server fills the other three seats with its own computer players.
// They play with the same brain as the computer seats (shared/src/brass/bot.ts)
// and leave a few seconds between moves so each cutscene can be watched.
import { WebSocket } from 'ws';
import { brassBotMoves, type BrassAction, type ClientMsg, type ServerMsg } from '@bge/shared';

const args = process.argv.slice(2);
const code = (args.find((a) => /^[A-Za-z]{4}$/.test(a)) ?? '').toUpperCase();
const count = Math.max(1, Math.min(4, Number(args.find((a) => /^\d+$/.test(a)) ?? 3)));
const start = args.includes('--start');
const fast = args.includes('--fast');
const maxTurns = Number(args.find((a) => a.startsWith('--turns='))?.slice(8) ?? Infinity);
const host = process.env.BGE_HOST ?? `localhost:${process.env.PORT ?? 8790}`;
if (!code) {
  console.error('Usage: npm run autoplay:brass -- ROOMCODE [players=3] [--start] [--fast] [--turns=N]');
  process.exit(1);
}

const NAMES = ['Alex', 'Sam', 'Riley', 'Jordan'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(fast ? 120 : 3200 + Math.random() * 2600);
let acted = 0;

function seat(i: number) {
  const ws = new WebSocket(`ws://${host}/ws`);
  const send = (m: ClientMsg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
  const me = { send, index: null as number | null };
  let queue: BrassAction[] = [];
  let waitingOn = '';
  let busy = false;
  ws.on('open', () => send({ type: 'join', roomId: code, name: NAMES[i % NAMES.length] }));
  ws.on('message', async (data) => {
    const m = JSON.parse(String(data)) as ServerMsg;
    if (m.type === 'joined') me.index = m.playerIndex;
    if (m.type === 'error') {
      // the move was refused: try the next best one
      const next = queue.shift();
      if (next) send({ type: 'action', action: next });
      else console.log(`[${NAMES[i]}] ${m.message}`);
      return;
    }
    if (m.type !== 'state' || m.view.game !== 'brass') return;
    const v = m.view;
    if (v.phase === 'ended') {
      if (i === 0 && waitingOn !== 'over') {
        waitingOn = 'over';
        console.log(`game over: ${v.players.map((p) => `${p.name} ${p.vp}`).join(', ')}`);
        setTimeout(() => process.exit(0), 500);
      }
      return;
    }
    const mine = v.players[v.you ?? -1];
    if (!mine || v.currentColor !== mine.color) return;
    // one move per turn step; does not lean on the batch counter, which older servers do not send
    const key = `${v.lastEvent?.seq ?? 0}:${v.era}:${v.round}:${v.currentColor}:${v.actionsLeft}:${mine.handCount}`;
    if (busy || key === waitingOn) return;
    if (acted >= maxTurns) return;
    busy = true;
    waitingOn = key;
    await think();
    queue = brassBotMoves(v);
    const first = queue.shift();
    if (first) { acted++; send({ type: 'action', action: first }); }
    busy = false;
  });
  ws.on('close', () => console.log(`[${NAMES[i]}] disconnected`));
  return me;
}

console.log(`${count} scripted players joining Brass room ${code} on ${host}`);
const seats: ReturnType<typeof seat>[] = [];
for (let i = 0; i < count; i++) {
  seats.push(seat(i));
  await sleep(300);
}
if (start) {
  await sleep(800);
  const hostSeat = seats.find((s) => s.index === 0);
  if (!hostSeat) {
    console.error('None of the scripted players is the host. Start the game from the host device.');
    process.exit(1);
  }
  hostSeat.send({ type: 'start' });
  console.log('started');
}
