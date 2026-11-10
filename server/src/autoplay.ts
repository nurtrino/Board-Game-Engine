// Demo and test helper: seats scripted players in a Secret Hitler room so a whole game plays on the big screen.
// Create the room on the screen first, then: npm run autoplay -- ROOMCODE [players=4] [--start] [--fast]
// The scripted players use the built-in bot brain and wait for the screen like real devices do.
import { WebSocket } from 'ws';
import { botAction, botClaim, type ClientMsg, type ServerMsg } from '@bge/shared';

const args = process.argv.slice(2);
const code = (args.find((a) => /^[A-Za-z]{4}$/.test(a)) ?? '').toUpperCase();
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 4);
const start = args.includes('--start');
const fast = args.includes('--fast');
const host = process.env.BGE_HOST ?? `localhost:${process.env.PORT ?? 8790}`;
if (!code) {
  console.error('Usage: npm run autoplay -- ROOMCODE [players=4] [--start] [--fast]');
  process.exit(1);
}

const NAMES = ['Alex', 'Sam', 'Riley', 'Jordan', 'Casey', 'Morgan', 'Quinn', 'Avery', 'Drew', 'Harper'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(fast ? 150 : 1200 + Math.random() * 1800);
let announced = false;

function seat(i: number) {
  const ws = new WebSocket(`ws://${host}/ws`);
  const send = (m: ClientMsg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
  const me = { send, index: null as number | null };
  let busy = false;
  let lastKey = '';
  ws.on('open', () => send({ type: 'join', roomId: code, name: NAMES[i % NAMES.length] }));
  ws.on('message', async (data) => {
    const m = JSON.parse(String(data)) as ServerMsg;
    if (m.type === 'joined') me.index = m.playerIndex;
    if (m.type === 'error') console.log(`[${NAMES[i]}] ${m.message}`);
    if (m.type !== 'state' || m.view.game !== 'secrethitler' || m.view.role !== 'player') return;
    const w = m.view;
    const v = w.view;
    if (v.phase === 'over') {
      if (!announced) console.log(`game over: ${v.winner}s win (${v.winReason})`);
      announced = true;
      return;
    }
    announced = false;
    if (w.screenLive && w.screenSeq < w.seq) return;
    const key = `${v.round}:${v.phase}:${JSON.stringify(v.actions)}:${v.claimSlots.length}`;
    if (busy || key === lastKey) return;
    busy = true;
    lastKey = key;
    await think();
    if (v.actions.length) {
      const action = botAction(v);
      if (action) send({ type: 'action', action });
    } else if (v.claimSlots.length) {
      const slot = v.claimSlots[0];
      const value = botClaim(v, slot);
      if (value) send({ type: 'action', action: { type: 'claim', kind: slot.kind, value } });
    }
    busy = false;
    lastKey = '';
  });
  ws.on('close', () => console.log(`[${NAMES[i]}] disconnected`));
  return me;
}

console.log(`${count} scripted players joining room ${code} on ${host}`);
const seats: ReturnType<typeof seat>[] = [];
for (let i = 0; i < count; i++) {
  seats.push(seat(i));
  await sleep(300);
}
if (start) {
  await sleep(800);
  // Only the host (the first player in the room) may start.
  const hostSeat = seats.find((s) => s.index === 0);
  if (!hostSeat) {
    console.error('None of the scripted players is the host. Start the game from the host device.');
    process.exit(1);
  }
  hostSeat.send({ type: 'start' });
  console.log('started');
}
