// Demo and test helper: seats scripted players in a Brass: Birmingham room so a
// whole game plays on the big screen. Create the room on the screen first, then:
//   npm run autoplay:brass -- ROOMCODE [players=3] [--start] [--fast] [--turns=N]
// The players pick only legal moves (the same helpers the devices use) and
// leave a few seconds between them so each cutscene can be watched.
import { WebSocket } from 'ws';
import {
  buildLocations, freeSquares, buildableLinks, sellableSquares, developableTiles, cardIndustries,
  lowestTile, planBuild, INDUSTRY_TYPES,
  type BrassAction, type BrassView, type ClientMsg, type ServerMsg,
} from '@bge/shared';

const args = process.argv.slice(2);
const code = (args.find((a) => /^[A-Za-z]{4}$/.test(a)) ?? '').toUpperCase();
const count = Math.max(2, Math.min(4, Number(args.find((a) => /^\d+$/.test(a)) ?? 3)));
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
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
let acted = 0;

/** Every sensible move for this seat right now, best first. */
function candidates(v: BrassView): BrassAction[] {
  const me = v.players[v.you ?? 0];
  const hand = me.hand ?? [];
  const out: BrassAction[] = [];
  if (!hand.length) return out;
  const spare = Math.floor(Math.random() * hand.length);

  for (const sq of sellableSquares(v.board, v.merchants, me.color)) out.push({ type: 'sell', card: spare, square: sq });

  const builds: BrassAction[] = [];
  hand.forEach((card, ci) => {
    const inds = card.kind === 'location' || card.name === 'Wild Location' ? INDUSTRY_TYPES : cardIndustries(card);
    for (const loc of buildLocations(v.board, me.color, card)) {
      for (const sq of freeSquares(v.board, me.color, loc, v.era)) {
        for (const ind of inds) {
          if (!lowestTile(me.tiles, ind, v.era)) continue;
          const plan = planBuild(v.board, v.markets, v.merchants, me.tiles, v.era, ind, sq);
          if (!('error' in plan) && plan.total <= me.money) builds.push({ type: 'build', card: ci, industry: ind, square: sq });
        }
      }
    }
  });
  const links = me.links > 0 ? buildableLinks(v.board, me.color, v.era) : [];
  const roll = Math.random();
  // mostly build, but lay links often enough that things connect and sell
  if (builds.length && roll < 0.62) out.push(pick(builds));
  if (links.length) out.push({ type: 'network', card: spare, link: pick(links) });
  if (builds.length) out.push(pick(builds));
  const dev = developableTiles(me.tiles);
  if (dev.length && roll > 0.8) out.push({ type: 'develop', card: spare, tile: pick(dev) });
  if (me.money < 12 && me.income - 3 >= -10) out.push({ type: 'loan', card: spare });
  if (hand.length >= 3 && !hand.some((c) => c.kind === 'wild') && v.wild.location > 0 && roll > 0.9) out.push({ type: 'scout', cards: [0, 1, 2] });
  if (dev.length) out.push({ type: 'develop', card: spare, tile: pick(dev) });
  if (me.income - 3 >= -10) out.push({ type: 'loan', card: spare });
  out.push({ type: 'pass', card: spare });
  return out;
}

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
    const key = `${v.batch?.seq ?? 0}`;
    if (busy || key === waitingOn) return;
    if (acted >= maxTurns) return;
    busy = true;
    waitingOn = key;
    await think();
    queue = candidates(v);
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
