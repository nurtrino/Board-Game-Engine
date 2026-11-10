// Live server test over WebSockets: a big screen, human devices and AI seats play Secret Hitler
// to the end through the real room protocol, and a Brass room still starts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { botAction, botClaim, type ClientMsg, type RoomInfo, type ServerMsg, type ShView, type StampedEvent } from '@bge/shared';

const PORT = 8799;
process.env.PORT = String(PORT);
process.env.SH_AI_DELAY_MS = '0';
process.env.BGE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bge-smoke-'));
delete process.env.DATABASE_URL;
// Force the built-in bot so the test never spends API credits.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
delete process.env.ANTHROPIC_PROFILE;
await import('./index.js');

interface Client {
  ws: WebSocket;
  send: (m: ClientMsg) => void;
  errors: string[];
  room: RoomInfo | null;
  index: number | null;
}
function open(onMsg: (m: ServerMsg, c: Client) => void): Promise<Client> {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c: Client = { ws, send: (m) => ws.send(JSON.stringify(m)), errors: [], room: null, index: null };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d)) as ServerMsg;
    if (m.type === 'error') c.errors.push(m.message);
    if (m.type === 'room') c.room = m.info;
    if (m.type === 'joined') c.index = m.playerIndex;
    onMsg(m, c);
  });
  return new Promise((resolve) => ws.on('open', () => resolve(c)));
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, label: string, ms = 30000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`);
    await wait(10);
  }
}

async function secretHitler(humans: number, claudeSeats: number, expectSeats: number) {
  let roomId = '';
  const events: StampedEvent[] = [];
  let lastSeq = 0;
  let phase = '';
  let seats = 0;
  let sawFresh = false;
  const tv = await open((m, c) => {
    if (m.type === 'room_created') roomId = m.roomId;
    if (m.type !== 'state' || m.view.game !== 'secrethitler') return;
    const w = m.view as ShView;
    assert.equal(w.role, 'screen');
    if (w.role !== 'screen') return;
    if (w.fresh) sawFresh = true;
    for (const e of w.events) if (e.seq > lastSeq) { events.push(e); lastSeq = e.seq; }
    phase = w.view.phase;
    seats = w.view.n;
    assert.equal(w.view.roles === null, w.view.phase !== 'over', 'roles stay hidden on the screen until the end');
    // Pretend each cutscene takes a moment, then report it presented.
    setTimeout(() => c.send({ type: 'presented', seq: w.seq }), 5);
  });
  tv.send({ type: 'create_room', name: 'Smoke', game: 'secrethitler', options: { claudeSeats } });
  await until(() => roomId !== '', 'room created');

  let held = 0;
  const players: Client[] = [];
  for (let h = 0; h < humans; h++) {
    const p = await open((m, c) => {
      if (m.type !== 'state' || m.view.game !== 'secrethitler' || m.view.role !== 'player') return;
      const w = m.view;
      if (w.screenLive && w.screenSeq < w.seq) {
        held++;
        return; // a real phone shows "Watch the screen" here
      }
      const v = w.view;
      assert.equal(v.seat, c.index, 'each device gets its own seat');
      if (v.actions.length) {
        const action = botAction(v);
        if (action) c.send({ type: 'action', action });
      } else if (v.claimSlots.length) {
        const slot = v.claimSlots[0];
        const value = botClaim(v, slot);
        if (value) c.send({ type: 'action', action: { type: 'claim', kind: slot.kind, value } });
      }
    });
    players.push(p);
    p.send({ type: 'join', roomId, name: `Human ${h + 1}` });
    await until(() => p.index === h, `player ${h} seated`);
  }
  // Seats are chairs at the printed table: the second player moves across it.
  if (humans > 1) {
    players[1].send({ type: 'pick_color', color: 'White' });
    await until(() => tv.room?.players[1]?.color === 'White', 'colour picked');
  }
  assert.equal(tv.room!.players.length, humans);
  assert.equal(tv.room!.game, 'secrethitler');

  // Only the host or the screen may start.
  if (humans > 1) {
    players[1].send({ type: 'start' });
    await until(() => players[1].errors.length > 0, 'non-host start rejected');
  }
  players[0].send({ type: 'start' });
  await until(() => phase === 'over', 'game over', 90000);

  assert.equal(seats, expectSeats, 'Claude fills the empty chairs');
  assert.ok(sawFresh, 'the screen was told to play the opening');
  const seqs = events.map((e) => e.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'events arrive in order');
  assert.equal(events[0].e.t, 'game_start');
  assert.equal(events.at(-1)!.e.t, 'game_over');
  assert.ok(events.some((e) => e.e.t === 'enacted'));
  assert.ok(held > 0, 'devices were held while the screen presented');
  const over = events.at(-1)!.e;

  // Nobody can walk in on a game in progress.
  const late = await open(() => {});
  late.send({ type: 'join', roomId, name: 'Latecomer' });
  await until(() => late.errors.length > 0, 'late join rejected');
  late.ws.close();

  // The save list shows it as finished.
  const saves = await (await fetch(`http://localhost:${PORT}/api/saves`)).json() as { roomId: string; status: string; game: string }[];
  assert.equal(saves.find((s) => s.roomId === roomId)?.status, 'ended');

  // Play again deals a new game to the same table.
  phase = '';
  tv.send({ type: 'rematch' });
  await until(() => phase !== '' && phase !== 'over', 'rematch started');
  tv.ws.close();
  for (const p of players) p.ws.close();
  console.log(`ok secret hitler: ${humans} human + ${expectSeats - humans} Claude seats, ${events.length} events, ${over.t === 'game_over' ? `${over.winner} win by ${over.reason}` : '?'}`);
}

async function brass() {
  let roomId = '';
  let game = '';
  let seated = 0;
  const tv = await open((m) => {
    if (m.type === 'room_created') roomId = m.roomId;
    if (m.type === 'state' && m.view.game === 'brass') {
      game = m.view.game;
      seated = m.view.players.length;
    }
  });
  tv.send({ type: 'create_room', name: 'Brass smoke', game: 'brass' });
  await until(() => roomId !== '', 'brass room created');
  const hands: number[] = [];
  const players: Client[] = [];
  for (let i = 0; i < 2; i++) {
    const p = await open((m) => {
      if (m.type === 'state' && m.view.game === 'brass') hands[i] = m.view.players[i].hand?.length ?? 0;
    });
    players.push(p);
    p.send({ type: 'join', roomId, name: `Brass ${i + 1}` });
    await until(() => p.index === i, `brass player ${i} seated`);
  }
  players[0].send({ type: 'start' });
  await until(() => game === 'brass' && hands[0] > 0 && hands[1] > 0, 'brass dealt');
  assert.equal(seated, 2);
  assert.equal(hands[0], 8, 'each Brass player is dealt eight cards');
  tv.ws.close();
  for (const p of players) p.ws.close();
  console.log('ok brass: room starts and deals');
}

await secretHitler(1, 0, 5);
await secretHitler(4, 0, 5);
await secretHitler(3, 3, 6);
await secretHitler(6, 2, 8);
await brass();
console.log('ok server smoke');
process.exit(0);
