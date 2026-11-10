// Live server test over WebSockets: a big screen, human devices and AI seats play Secret Hitler
// to the end through the real room protocol, a Brass room still starts, and Germany plays a whole
// Axis & Allies turn including a battle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { botAction, botClaim, type AxisAction, type AxisView, type ClientMsg, type RoomInfo, type ServerMsg, type ShView, type StampedEvent } from '@bge/shared';

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

// Axis & Allies: one host commands Germany through a whole turn (buy, attack, fight the battle
// through the same decisions a device makes, move, deploy), while a second player holding the
// Soviet Union is refused when it tries to act for Germany. The screen is never needed.
async function axis() {
  let roomId = '';
  let view: AxisView | null = null;
  const tv = await open((m) => {
    if (m.type === 'room_created') roomId = m.roomId;
  });
  tv.send({ type: 'create_room', name: 'Axis smoke', game: 'axis', options: { scenario: '1941', rnd: false, nationalObjectives: true, winCondition: 'standard' } });
  await until(() => roomId !== '', 'axis room created');
  const host = await open((m) => { if (m.type === 'state' && m.view.game === 'axis') view = m.view; });
  host.send({ type: 'join', roomId, name: 'Host' });
  await until(() => host.index === 0, 'axis host seated');
  const guest = await open(() => {});
  guest.send({ type: 'join', roomId, name: 'Guest' });
  await until(() => guest.index === 1, 'axis guest seated');
  guest.send({ type: 'pick_color', color: 'ussr' });
  host.send({ type: 'pick_color', color: 'germany' });
  await wait(100);
  host.send({ type: 'start' });
  await until(() => view !== null, 'axis started');
  const v = () => view as unknown as AxisView;
  assert.equal(v().active, 'germany');
  assert.deepEqual([...v().controlledPowers].sort(), ['germany', 'italy', 'japan', 'uk', 'usa'], 'the host covers every power nobody took');
  assert.equal(v().battleVisualReady, true, 'battles never wait for the screen');

  let sent = 0;
  const act = async (who: Client, action: AxisAction & { asPower?: string }, label: string) => {
    const errors = who.errors.length;
    const before = JSON.stringify(view);
    who.send({ type: 'action', action: action as AxisAction });
    sent++;
    await until(() => who.errors.length > errors || JSON.stringify(view) !== before, label, 5000);
    return who.errors.length > errors ? who.errors[who.errors.length - 1] : null;
  };
  const must = async (action: AxisAction & { asPower?: string }, label: string) => {
    const err = await act(host, action, label);
    assert.equal(err, null, `${label}: ${err}`);
  };

  assert.ok(await act(guest, { type: 'endPhase', asPower: 'germany' } as AxisAction & { asPower: string }, 'guest refused'), 'a guest cannot act for Germany');
  await must({ type: 'buy', key: 'infantry', count: 2 }, 'buy');
  await must({ type: 'endPhase' }, 'end purchase');
  assert.equal(v().phase, 'combatMove');
  const tanks = (v().board['poland'] ?? []).filter((s) => s.power === 'germany' && s.key === 'tank').reduce((n, s) => n + s.count, 0);
  assert.ok(tanks > 0, 'Germany starts with tanks in Poland');
  await must({ type: 'attack', target: 'east-poland', forces: [{ from: 'poland', units: [{ key: 'tank', count: tanks }] }] }, 'attack');
  assert.equal(v().phase, 'battle');

  // Resolve the battle exactly as devices do: roll, pick casualties, press on, continue.
  for (let guard = 0; guard < 200 && v().combat; guard++) {
    const c = v().combat!;
    const ref = { combatId: c.id, visualSeq: c.visualSeq };
    const d = c.battle.decision;
    const sidePower = (side: string) => (side === 'attacker' ? c.attacker : v().pendings.find((p) => p.kind !== 'battle-continue')?.power ?? 'ussr');
    const cont = v().pendings.find((p) => p.kind === 'battle-continue');
    if (cont) {
      const who = cont.power === 'ussr' ? guest : host;
      const err = await act(who, { type: 'battleContinue', ...ref, asPower: cont.power } as AxisAction & { asPower: string }, 'continue');
      assert.equal(err, null, `continue: ${err}`);
    } else if (d?.type === 'casualties') {
      const power = sidePower(d.side);
      const uids: number[] = [];
      for (const b of d.buckets) for (const uid of b.eligible) if (uids.length < d.picks && !uids.includes(uid)) uids.push(uid);
      const err = await act(power === 'ussr' ? guest : host, { type: 'battleCasualties', uids, ...ref, asPower: power } as AxisAction & { asPower: string }, 'casualties');
      assert.equal(err, null, `casualties: ${err}`);
    } else if (d?.type === 'retreat') {
      await must({ type: 'battleRetreat', retreat: false, ...ref }, 'press the attack');
    } else if (d?.type === 'submerge') {
      const power = sidePower(d.side);
      const err = await act(power === 'ussr' ? guest : host, { type: 'battleSubmerge', uids: [], ...ref, asPower: power } as AxisAction & { asPower: string }, 'submerge');
      assert.equal(err, null, `submerge: ${err}`);
    } else {
      await must({ type: 'battleRoll', ...ref }, 'roll');
    }
  }
  assert.equal(v().combat, null, 'the battle resolved without a screen');
  assert.ok(v().lastBattle && v().lastBattle!.space === 'east-poland');
  await must({ type: 'endPhase' }, 'end combat');
  assert.equal(v().phase, 'noncombat');
  await must({ type: 'endPhase' }, 'end noncombat');
  assert.equal(v().phase, 'mobilize');
  await must({ type: 'placeBatch', space: 'germany', units: [{ key: 'infantry', count: 2 }], factory: 'germany' }, 'deploy');
  const before = v().powers.germany.ipcs;
  await must({ type: 'endPhase' }, 'end turn');
  assert.equal(v().active, 'ussr', 'play passes to the Soviet Union');
  assert.ok(v().powers.germany.ipcs > before, 'Germany collected income');
  assert.deepEqual(v().controlledPowers.includes('ussr'), false, 'the host does not command a taken power');
  for (const c of [tv, host, guest]) c.ws.close();
  console.log(`ok axis: a full German turn over the wire (${sent} actions), battle ${v().lastBattle!.status}`);
}

await secretHitler(1, 0, 5);
await secretHitler(4, 0, 5);
await secretHitler(3, 3, 6);
await secretHitler(6, 2, 8);
await brass();
await axis();
console.log('ok server smoke');
process.exit(0);
