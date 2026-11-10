import './env.js';
import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import {
  createBrass, viewFor, applyAction, brassBotMoves,
  createShRoom, shRoomView, shRoomApply, shRematch, shClaudeSeats, shLegalActions, shPrivateView, botAction, botClaim,
  GAME_SEATS,
  type BrassState, type BrassAction, type Color,
  type ShRoomState, type ShAction,
  type SeatColor, type ClientMsg, type ServerMsg, type RoomInfo, type GameOptions,
} from '@bge/shared';
import { createStore, type SavedRoom } from './store.js';
import { bearerToken, canDeleteSave } from './save-auth.js';
import { resolveRoomSeed } from './room-seed.js';
import { stateMatchesGame } from './save-compat.js';
import { claudeStatus, decideAction, decideClaim, decideReply } from './claude.js';

// A game server that crash-loops is worse than one that logs and carries on.
process.on('uncaughtException', (err) => console.error('uncaught exception:', err));
process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err));

// Rooms + lobby + per-game engines. Each room carries a game id; start/action/view
// dispatch to that game's engine.

type GameState = BrassState | ShRoomState;
type Seated = { name: string; color: SeatColor; ai?: boolean };

const engines = {
  brass: {
    create: (seated: Seated[], seed: number, _options?: GameOptions): GameState =>
      createBrass(seated as { name: string; color: Color }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => viewFor(state as BrassState, viewer),
    apply: (state: GameState, seat: number, action: unknown, _screenLive: boolean) => applyAction(state as BrassState, seat, action as BrassAction),
    minSeats: 2,
    soloSeats: 4, // one player alone gets a full table: the computer plays the other seats
  },
  secrethitler: {
    create: (seated: Seated[], seed: number, _options?: GameOptions): GameState => createShRoom(seated, seed),
    view: (state: GameState, viewer: number | null | 'dev') => shRoomView(state as ShRoomState, viewer),
    apply: (state: GameState, seat: number, action: unknown, screenLive: boolean) => shRoomApply(state as ShRoomState, seat, action as ShAction, screenLive),
    minSeats: 5,
    soloSeats: 5,
  },
} as const;

const engineOf = (game: string) => engines[game as keyof typeof engines] ?? engines.brass;
const seatsOf = (game: string) => GAME_SEATS[game] ?? GAME_SEATS.brass;

const PORT = Number(process.env.PORT ?? 8790);
// The seat-switcher is useful on local dev routes, but a production viewer
// must never acquire action authority by changing the view it receives.
const ALLOW_DEVELOPMENT_CONTROL = process.env.NODE_ENV !== 'production';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

function lanIp(): string {
  // prefer real LAN adapters over virtual ones (VirtualBox, Hyper-V, VMware, WSL)
  const virtualName = /virtual|vethernet|vmware|wsl|tailscale|hamachi|zerotier|docker/i;
  const candidates: { address: string; score: number }[] = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254')) continue;
      let score = 0;
      if (/^wi-?fi|^wlan/i.test(name)) score += 3;
      if (/^ethernet$/i.test(name)) score += 2;
      if (virtualName.test(name)) score -= 10;
      if (i.address.startsWith('192.168.56.')) score -= 5; // VirtualBox host-only default
      candidates.push({ address: i.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? 'localhost';
}

// The public origin phones should open (no trailing slash). Hosted deploys set
// this: Render populates RENDER_EXTERNAL_URL automatically; PUBLIC_URL is a
// manual override. Falls back to the LAN IP for local play on the same network.
function publicBaseUrl(): string {
  const configured = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `http://${lanIp()}:${PORT}`;
}

// ---------- rooms ----------

interface PlayerSlot {
  name: string;
  color: SeatColor;
  token: string;
  sockets: Set<WebSocket>;
  isBot?: boolean;
}

function freeColor(room: Room): SeatColor | null {
  return seatsOf(room.game).colors.find((c) => !room.players.some((p) => p.color === c)) ?? null;
}

interface Room {
  id: string;
  name: string; // the save's name, shown in the lobby and the save list
  game: string; // game id: 'brass' | 'secrethitler'
  createdAt: number;
  /** Creator-only credential; never included in room/list views. */
  ownerToken?: string;
  players: PlayerSlot[];
  watchers: Set<WebSocket>; // TV board views
  started: boolean;
  state: GameState | null;
  options?: GameOptions; // create-screen choices (scenario, variants)
  updatedAt: number;
  /** Ephemeral tombstone that makes every late callback a no-op. */
  deleted: boolean;
}

const rooms = new Map<string, Room>();

// ---------- persistence ----------
// Rooms are continuously saved (file locally, Postgres when DATABASE_URL is
// set) and rehydrated at boot, so games survive restarts AND redeploys.
// Devices hold a per-room token in localStorage and reconnect into their seat.

const store = await createStore(process.env.BGE_DATA_DIR || path.resolve(__dirname, '..'));
const saveAdminToken = process.env.BGE_ADMIN_TOKEN?.trim() || undefined;

function isLiveRoom(room: Room): boolean {
  return !room.deleted && rooms.get(room.id) === room;
}

function roomStateCompatible(room: Room): boolean {
  return room.game in engines && stateMatchesGame(room.game, room.state);
}

function toSaved(room: Room): SavedRoom {
  return {
    id: room.id,
    name: room.name,
    game: room.game,
    createdAt: room.createdAt,
    ownerToken: room.ownerToken,
    players: room.players.map(({ name, color, token, isBot }) => ({ name, color, token, isBot })),
    started: room.started,
    state: room.state,
    options: room.options,
    updatedAt: room.updatedAt,
  };
}

function persist(room: Room): void {
  if (!isLiveRoom(room)) return;
  store.save(toSaved(room));
}

const DAY = 24 * 60 * 60 * 1000;

/** Drop finished games after a week and anything untouched for 60 days. */
function stale(r: { started: boolean; state: unknown; updatedAt: number }): boolean {
  const age = Date.now() - r.updatedAt;
  const phase = (r.state as { phase?: string } | null)?.phase;
  if (phase === 'ended' || phase === 'gameOver') return age > 7 * DAY;
  if (!r.started) return age > 7 * DAY; // lobbies that never started
  return age > 60 * DAY;
}

{
  let saved: SavedRoom[] = [];
  try {
    saved = await store.load();
  } catch (err) {
    console.error('could not load saved rooms, starting with none:', err);
  }
  let restored = 0;
  for (const r of saved) {
   try {
    if (!r || typeof r.id !== 'string' || !Array.isArray(r.players)) continue;
    if (stale(r)) {
      // Not awaited: clearing out an old save must never delay start-up.
      void store.remove(r.id).catch((err) => console.error(`failed to retire stale room ${r.id}:`, err));
      continue;
    }
    // A Secret Hitler table that was mid-cutscene when the server stopped has no screen to wait for now.
    if (r.game === 'secrethitler' && r.state) (r.state as ShRoomState).screenSeq = (r.state as ShRoomState).seq;
    rooms.set(r.id, {
      id: r.id,
      name: r.name ?? `Room ${r.id}`,
      game: r.game ?? 'brass',
      createdAt: r.createdAt ?? r.updatedAt,
      ownerToken: r.ownerToken,
      players: r.players.map((p) => ({ ...p, sockets: new Set<WebSocket>() })),
      watchers: new Set(),
      started: r.started,
      state: r.state as GameState | null,
      options: r.options,
      updatedAt: r.updatedAt,
      deleted: false,
    });
    restored++;
   } catch (err) {
    console.error(`skipping unreadable save ${(r as { id?: string } | null)?.id ?? '?'}:`, err);
   }
  }
  if (restored) console.log(`  Restored ${restored} saved room${restored === 1 ? '' : 's'} (${store.kind})`);
  // a restored game may be waiting on an AI seat: get it moving again
  // (deferred: the timers below initialize after this block evaluates)
  setTimeout(() => {
    for (const room of rooms.values()) {
      try { scheduleBots(room); } catch (err) { console.error(`could not resume AI seats in ${room.id}:`, err); }
    }
  }, 1000);
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (stale(room)) void retireRoom(room, true).catch((err) => console.error(`failed to retire stale room ${room.id}:`, err));
  }
}, 60 * 60 * 1000);

// Render sends SIGTERM on every deploy: write out pending saves first.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => { store.flush().finally(() => process.exit(0)); });
}

function makeRoomId(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
  let id = '';
  do {
    id = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(id));
  return id;
}

function joinUrl(roomId: string): string {
  return `${publicBaseUrl()}/join/${roomId}`;
}

function roomInfo(room: Room): RoomInfo {
  return {
    roomId: room.id,
    name: room.name,
    game: room.game,
    createdAt: room.createdAt,
    started: room.started,
    players: room.players.map((p) => ({ name: p.name, color: p.color, connected: p.isBot ? true : p.sockets.size > 0, isBot: p.isBot })),
    joinUrl: joinUrl(room.id),
  };
}

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// Per-socket connection state, so a socket's dev view override (see 'dev_view')
// can be honored when we redact the game state for it.
const conns = new Map<WebSocket, ConnState>();

// The seat whose view a socket should receive: its dev override if set,
// otherwise its real seat (watchers -> null / neutral TV view).
function viewSeat(ws: WebSocket, realSeat: number | null): number | null | 'dev' {
  const c = conns.get(ws);
  if (c && c.viewAs !== undefined) return c.viewAs;
  return realSeat;
}

function sendState(room: Room, ws: WebSocket, realSeat: number | null): void {
  if (!room.state) return;
  if (!roomStateCompatible(room)) {
    send(ws, { type: 'error', message: 'This save was created with an incompatible game engine. Delete it from New Game and start a fresh save.' });
    return;
  }
  const view = engineOf(room.game).view(room.state, viewSeat(ws, realSeat));
  if (view.game === 'secrethitler') {
    // Connection facts ride on the recipient's copy only; they never reach the save.
    if (view.role === 'screen') view.claudeLive = claudeStatus().live;
    else {
      view.screenLive = screenLive(room);
      if (!presenting(room)) view.screenSeq = view.seq;
    }
  }
  send(ws, { type: 'state', view });
}

/** State-only fanout for ephemeral connection facts; never touches the save. */
function broadcastStates(room: Room): void {
  if (!isLiveRoom(room)) return;
  for (const ws of room.watchers) sendState(room, ws, null);
  room.players.forEach((player, seat) => {
    for (const ws of player.sockets) sendState(room, ws, seat);
  });
}

function broadcast(room: Room): void {
  if (!isLiveRoom(room)) return;
  // every mutation funnels through here: save the room as a side effect
  room.updatedAt = Date.now();
  persist(room);
  const info = roomInfo(room);
  for (const ws of room.watchers) { send(ws, { type: 'room', info }); sendState(room, ws, null); }
  room.players.forEach((p, seat) => {
    for (const ws of p.sockets) { send(ws, { type: 'room', info }); sendState(room, ws, seat); }
  });
  scheduleBots(room);
}

// ---------- Secret Hitler: screen pacing and AI seats ----------
// The big screen plays every event as a cutscene and reports back when it has
// caught up. Until then devices show WATCH THE SCREEN and AI seats hold their
// moves. If the screen goes away the table is released after a timeout.

const PRESENT_TIMEOUT_MS = 45_000;
// Minimum beat before an AI seat acts, so its moves do not land instantly.
const AI_DELAY_MS = Number(process.env.SH_AI_DELAY_MS ?? 1400);
const gateTimers = new Map<string, NodeJS.Timeout>();
const aiBusy = new Map<string, Set<number>>();
const replyBusy = new Map<string, Set<number>>();
const busySet = (map: Map<string, Set<number>>, id: string) => map.get(id) ?? map.set(id, new Set()).get(id)!;
// Claims an AI seat could not make (nothing sensible to say). Remembered so it is not retried forever.
const skippedClaims = new Map<string, Set<string>>();
const claimKey = (seat: number, slot: { kind: string; gov: number }) => `${seat}:${slot.kind}:${slot.gov}`;
function openClaim(room: Room, s: ShRoomState, seat: number) {
  const skipped = skippedClaims.get(room.id);
  return s.core.claimSlots[seat].find((c) => !skipped?.has(claimKey(seat, c)));
}
function skipClaim(room: Room, seat: number, slot: { kind: string; gov: number }) {
  const set = skippedClaims.get(room.id) ?? skippedClaims.set(room.id, new Set()).get(room.id)!;
  set.add(claimKey(seat, slot));
  if (set.size > 500) set.clear();
}

const shState = (room: Room): ShRoomState | null => (room.game === 'secrethitler' && room.state ? (room.state as ShRoomState) : null);
function screenLive(room: Room): boolean {
  return [...room.watchers].some((ws) => ws.readyState === WebSocket.OPEN);
}
/** True while the screen is still showing something the table should watch. */
function presenting(room: Room): boolean {
  const s = shState(room);
  return !!s && screenLive(room) && s.screenSeq < s.gateSeq && Date.now() - s.gateAt < PRESENT_TIMEOUT_MS;
}
function armGate(room: Room): void {
  const s = shState(room);
  if (!s) return;
  if (!screenLive(room)) s.screenSeq = s.seq;
  clearTimeout(gateTimers.get(room.id));
  if (s.screenSeq >= s.gateSeq) return;
  gateTimers.set(room.id, setTimeout(() => {
    // The screen never caught up (closed lid, sleeping tab). Do not strand the table.
    const cur = shState(room);
    if (!cur || !isLiveRoom(room) || cur.screenSeq >= cur.gateSeq) return;
    cur.screenSeq = cur.gateSeq;
    broadcastStates(room);
    scheduleBots(room);
  }, PRESENT_TIMEOUT_MS + 200));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isAiSeat = (room: Room, seat: number) => seat >= room.players.length || !!room.players[seat]?.isBot;

// ---------- Brass: computer seats ----------
// A player who starts alone gets a full table, and the server plays the empty
// seats. Brass has no screen handshake, so a computer seat waits out the time
// the big screen needs to stage whatever just happened, then thinks for a beat.

// 1 is watching pace, 0 is instant (tests). BRASS_CPU=off leaves the seats to be driven by hand.
const BRASS_PACE = Math.max(0, Number(process.env.BRASS_AI_PACE ?? 1));
const BRASS_CPU = process.env.BRASS_CPU !== 'off';
const brassPending = new Map<string, { key: string; timer: NodeJS.Timeout }>();
const brassActedAt = new Map<string, number>();

/** Roughly how long the big screen takes to play the last thing that happened. */
function brassStageMs(s: BrassState): number {
  if (!s.batch) return 12_000; // the opening title and turn order
  let ms = 0;
  for (const f of s.batch.frames) {
    if (f.beat.t === 'action') ms += f.beat.ev.kind === 'pass' ? 2600 : 4500;
    else if (f.beat.t === 'round') ms += 5200;
    else if (f.beat.t === 'score') ms += 6500 + s.players.length * 2200;
    else if (f.beat.t === 'era') ms += 8200;
  }
  return ms;
}

function scheduleBrassSeat(room: Room): void {
  const s = room.state as BrassState | null;
  if (!BRASS_CPU || !room.started || !s || !roomStateCompatible(room) || s.phase !== 'playing') return;
  const seat = s.players.findIndex((p) => p.color === s.turnOrder[s.current]);
  if (seat < 0 || !isAiSeat(room, seat)) return;
  const key = `${s.seq ?? 0}:${s.era}:${s.round}:${s.current}:${s.actionsLeft}`;
  const pending = brassPending.get(room.id);
  if (pending?.key === key) return;
  if (pending) clearTimeout(pending.timer);
  // with no screen up, the pause is what lets a device read the move that just landed
  const live = screenLive(room);
  const think = live ? 700 + Math.random() * 800 : 1600 + Math.random() * 1200;
  const staged = live ? (brassActedAt.get(room.id) ?? 0) + brassStageMs(s) - Date.now() : 0;
  const delay = (Math.max(0, staged) + think) * BRASS_PACE;
  const timer = setTimeout(() => {
    brassPending.delete(room.id);
    try { playBrassSeat(room, key); } catch (err) { console.error(`computer seat failed in ${room.id}:`, err); }
  }, delay);
  brassPending.set(room.id, { key, timer });
}

function playBrassSeat(room: Room, key: string): void {
  const s = room.state as BrassState | null;
  if (!isLiveRoom(room) || room.game !== 'brass' || !s || s.phase !== 'playing') return;
  const seat = s.players.findIndex((p) => p.color === s.turnOrder[s.current]);
  // a person may have taken the seat, or the turn may have moved on, while this waited
  if (seat < 0 || !isAiSeat(room, seat) || key !== `${s.seq ?? 0}:${s.era}:${s.round}:${s.current}:${s.actionsLeft}`) {
    scheduleBrassSeat(room);
    return;
  }
  for (const action of brassBotMoves(viewFor(s, seat))) {
    if (!applyAction(s, seat, action).ok) continue;
    brassActedAt.set(room.id, Date.now());
    broadcast(room);
    return;
  }
  console.warn(`[cpu] ${s.players[seat].name} has no legal move in ${room.id}`);
}

function scheduleBots(room: Room): void {
  if (!isLiveRoom(room)) return;
  if (room.game === 'brass') return scheduleBrassSeat(room);
  const s = shState(room);
  if (!s || s.core.phase === 'over') return;
  const busy = busySet(aiBusy, room.id);
  for (let seat = 0; seat < s.core.n; seat++) {
    if (!isAiSeat(room, seat) || busy.has(seat)) continue;
    if (shLegalActions(s.core, seat).length || openClaim(room, s, seat)) void runAi(room, seat);
  }
}

/** Applies a Secret Hitler action from any source and fans the result out. */
function shAct(room: Room, seat: number, action: ShAction): string | null {
  const s = shState(room);
  if (!s || !isLiveRoom(room)) return 'No game in progress';
  const res = shRoomApply(s, seat, action, screenLive(room));
  if (!res.ok) return res.error ?? 'Illegal action';
  armGate(room);
  broadcast(room);
  if (action.type === 'say' && !isAiSeat(room, seat)) scheduleReplies(room, seat, action.text);
  return null;
}

async function runAi(room: Room, seat: number): Promise<void> {
  const busy = busySet(aiBusy, room.id);
  busy.add(seat);
  let retryMs = 50;
  try {
    // Always yield first, so an AI turn never runs inside the stack of whatever triggered it.
    await sleep(0);
    const started = Date.now();
    while (presenting(room) && Date.now() - started < PRESENT_TIMEOUT_MS) await sleep(250);
    if (screenLive(room) && AI_DELAY_MS > 0) await sleep(AI_DELAY_MS * (0.7 + Math.random() * 0.9));
    const s = shState(room);
    if (!s || !isLiveRoom(room) || s.core.phase === 'over') return;
    const view = shPrivateView(s.core, seat);
    const live = claudeStatus().live;
    const notes = s.notes[seat] ?? '';

    if (view.actions.length) {
      let decision = live ? await decideAction(view, s.events, notes) : null;
      const cur = shState(room);
      if (!cur || !isLiveRoom(room) || cur.core.phase === 'over') return;
      // Other seats may have acted while Claude was thinking. Keep its choice only if it is still legal.
      if (decision?.action && !shLegalActions(cur.core, seat).some((a) => JSON.stringify(a) === JSON.stringify(decision!.action))) decision = null;
      const action = decision?.action ?? botAction(shPrivateView(cur.core, seat));
      if (!action) return;
      if (decision) cur.notes[seat] = decision.notes;
      if (decision?.say) shAct(room, seat, { type: 'say', text: decision.say });
      const err = shAct(room, seat, action);
      if (err) {
        console.warn(`[ai] ${cur.core.names[seat]} move rejected: ${err}`);
        retryMs = 3000;
      }
      return;
    }

    const slot = openClaim(room, s, seat);
    if (slot) {
      const decision = live ? await decideClaim(view, slot, s.events, notes) : null;
      const cur = shState(room);
      if (!cur || !isLiveRoom(room) || !cur.core.claimSlots[seat].some((c) => c.kind === slot.kind && c.gov === slot.gov)) return;
      let action: ShAction | null = decision?.action ?? null;
      if (!action) {
        const value = botClaim(shPrivateView(cur.core, seat), slot);
        action = value ? { type: 'claim', kind: slot.kind, value } : null;
      }
      if (!action) {
        skipClaim(room, seat, slot);
        return;
      }
      if (decision) cur.notes[seat] = decision.notes;
      const err = shAct(room, seat, action);
      if (err) {
        console.warn(`[ai] ${cur.core.names[seat]} claim rejected: ${err}`);
        skipClaim(room, seat, slot);
      } else if (decision?.say) shAct(room, seat, { type: 'say', text: decision.say });
    }
  } catch (err) {
    console.warn('[ai] turn failed', err);
    retryMs = 3000;
  } finally {
    busy.delete(seat);
    // Anything new to do (another claim, the next phase)?
    setTimeout(() => {
      try { scheduleBots(room); } catch (err) { console.error(`AI scheduling failed in ${room.id}:`, err); }
    }, retryMs);
  }
}

// A human spoke: every live Claude seat gets one chance to answer.
function scheduleReplies(room: Room, speaker: number, text: string): void {
  const s0 = shState(room);
  if (!claudeStatus().live || !s0) return;
  const busy = busySet(replyBusy, room.id);
  for (let seat = 0; seat < s0.core.n; seat++) {
    if (!isAiSeat(room, seat) || busy.has(seat) || !s0.core.alive[seat]) continue;
    busy.add(seat);
    void (async () => {
      try {
        await sleep(600 + Math.random() * 900);
        const s = shState(room);
        if (!s || !isLiveRoom(room) || s.core.phase === 'over') return;
        const d = await decideReply(shPrivateView(s.core, seat), s.events, s.notes[seat] ?? '', s.core.names[speaker], text);
        const cur = shState(room);
        if (!d || !cur || !isLiveRoom(room)) return;
        cur.notes[seat] = d.notes;
        if (d.say && cur.core.alive[seat]) shAct(room, seat, { type: 'say', text: d.say });
      } catch (err) {
        console.warn('[ai] reply failed', err);
      } finally {
        busy.delete(seat);
      }
    })();
  }
}

// ---------- http ----------

const app = express();
app.use(express.static(CLIENT_DIST));

// Saved games, newest first: the "select a save" list on the new-game screen.
app.get('/api/saves', (_req, res) => {
  const list = [...rooms.values()]
    .map((r) => ({
      roomId: r.id,
      name: r.name,
      game: r.game,
      compatible: roomStateCompatible(r),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      status: r.state?.phase === 'ended' ? 'ended' : r.started ? 'playing' : 'lobby',
      era: (r.game === 'brass' && r.state && 'era' in r.state ? r.state.era : null),
      round: (r.state && 'round' in r.state ? r.state.round : null),
      numRounds: (r.state && 'numRounds' in r.state ? r.state.numRounds : null),
      players: r.players.map((p) => ({ name: p.name, color: p.color })),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(list);
});

// Delete a saved game only for its creator, original host, or deployment
// administrator. Credentials never appear in GET /api/saves.
app.delete('/api/saves/:id', async (req, res) => {
  const id = req.params.id.toUpperCase();
  const room = rooms.get(id);
  if (!room) { res.status(404).json({ error: 'Not found' }); return; }
  const credential = bearerToken(req.get('authorization'));
  if (!credential) {
    res.set('WWW-Authenticate', 'Bearer realm="save deletion"');
    res.status(401).json({ error: 'A save-owner or administrator credential is required.' });
    return;
  }
  if (!canDeleteSave(room, credential, saveAdminToken)) {
    res.status(403).json({ error: 'This credential cannot delete the save.' });
    return;
  }
  try {
    await retireRoom(room, true);
    res.json({ ok: true });
  } catch (err) {
    console.error(`save deletion failed for ${room.id}:`, err);
    res.status(500).json({ error: 'The save could not be removed from persistent storage.' });
  }
});

// SPA fallback for client-side routes
app.get(['/new', '/join/*', '/board/*', '/play/*', '/dev/*'], (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

interface ConnState {
  room: Room | null;
  playerIdx: number | null; // null = watcher (the TV console)
  viewAs?: number | null; // dev override: which seat's view this socket receives
}

/**
 * Tombstone first, then remove durably, then close sockets. Closing a socket
 * schedules its close handler; clearing ConnState before that callback runs
 * prevents the handler from broadcasting (and therefore saving) the room.
 */
async function retireRoom(room: Room, closeSockets: boolean): Promise<boolean> {
  if (!isLiveRoom(room)) return false;
  room.deleted = true;
  rooms.delete(room.id);
  clearTimeout(gateTimers.get(room.id));
  gateTimers.delete(room.id);
  skippedClaims.delete(room.id);
  aiBusy.delete(room.id);
  replyBusy.delete(room.id);
  try {
    await store.remove(room.id);
  } catch (err) {
    // Keep the in-memory result aligned with durable storage. The connected
    // room remains usable and visible when its database/file delete fails.
    if (!rooms.has(room.id)) {
      room.deleted = false;
      rooms.set(room.id, room);
      broadcast(room);
    }
    throw err;
  }

  const sockets = new Set<WebSocket>([
    ...room.watchers,
    ...room.players.flatMap((player) => [...player.sockets]),
  ]);
  for (const ws of sockets) {
    const conn = conns.get(ws);
    if (conn?.room === room) {
      conn.room = null;
      conn.playerIdx = null;
      conn.viewAs = undefined;
    }
  }
  room.watchers.clear();
  for (const player of room.players) player.sockets.clear();
  if (closeSockets) for (const ws of sockets) ws.close(1000, 'Save deleted');
  return true;
}

/** When the last screen leaves, nothing is left to wait for. */
function screenLeft(room: Room): void {
  const s = shState(room);
  if (!s || screenLive(room) || s.screenSeq >= s.seq) return;
  s.screenSeq = s.seq;
}

/** A socket belongs to exactly one room and one role at a time. */
function detachConnection(ws: WebSocket, conn: ConnState): void {
  const previous = conn.room;
  if (!previous) return;
  if (conn.playerIdx === null) previous.watchers.delete(ws);
  else previous.players[conn.playerIdx]?.sockets.delete(ws);
  const wasWatcher = conn.playerIdx === null;
  conn.room = null;
  conn.playerIdx = null;
  conn.viewAs = undefined;
  if (!isLiveRoom(previous)) return;
  if (wasWatcher) screenLeft(previous);
  broadcast(previous);
  maybeCleanup(previous);
}

wss.on('connection', (ws) => {
  const conn: ConnState = { room: null, playerIdx: null };
  conns.set(ws, conn);

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send(ws, { type: 'error', message: 'Bad message' });
    }
    try {
      handle(ws, conn, msg);
    } catch (err) {
      console.error(err);
      send(ws, { type: 'error', message: 'Server error' });
    }
  });

  ws.on('close', () => {
    conns.delete(ws);
    const room = conn.room;
    if (!room) return;
    const playerIdx = conn.playerIdx;
    conn.room = null;
    conn.playerIdx = null;
    conn.viewAs = undefined;
    if (playerIdx === null) {
      room.watchers.delete(ws);
    } else {
      room.players[playerIdx]?.sockets.delete(ws);
    }
    if (!isLiveRoom(room)) return;
    if (playerIdx === null) screenLeft(room);
    broadcast(room);
    maybeCleanup(room);
  });
});

function maybeCleanup(room: Room): void {
  if (!isLiveRoom(room)) return;
  // Rooms are saves now: never expire one just because everyone disconnected.
  // Only sweep abandoned TV lobbies that no player ever joined; everything
  // else lives until the hourly stale() sweep retires it.
  if (room.started || room.players.length > 0) return;
  if (room.watchers.size > 0) return;
  setTimeout(() => {
    const stillEmpty = isLiveRoom(room) && room.watchers.size === 0 && room.players.length === 0 && !room.started;
    if (stillEmpty) void retireRoom(room, false).catch((err) => console.error(`empty room cleanup failed for ${room.id}:`, err));
  }, 10 * 60 * 1000);
}

const newSeed = (room: Room) => resolveRoomSeed(room.options, ALLOW_DEVELOPMENT_CONTROL, () => crypto.randomInt(2 ** 31));

function handle(ws: WebSocket, conn: ConnState, msg: ClientMsg): void {
  if (conn.room && !isLiveRoom(conn.room) && !['create_room', 'watch', 'join'].includes(msg.type)) {
    return send(ws, { type: 'error', message: 'This room is being deleted' });
  }
  switch (msg.type) {
    case 'create_room': {
      detachConnection(ws, conn);
      const id = makeRoomId();
      const name = (msg.name || '').trim().slice(0, 40) || `Game ${id}`;
      const game = msg.game && msg.game in engines ? msg.game : 'brass';
      const room: Room = {
        id, name, game, createdAt: Date.now(),
        ownerToken: crypto.randomUUID(),
        players: [], watchers: new Set(), started: false, state: null,
        options: msg.options, updatedAt: Date.now(), deleted: false,
      };
      rooms.set(room.id, room);
      room.watchers.add(ws);
      conn.room = room;
      conn.playerIdx = null;
      send(ws, { type: 'room_created', roomId: room.id, joinUrl: joinUrl(room.id), ownerToken: room.ownerToken });
      broadcast(room);
      return;
    }
    case 'watch': {
      const room = rooms.get(msg.roomId.toUpperCase());
      if (!room) return send(ws, { type: 'error', message: 'Room not found' });
      detachConnection(ws, conn);
      room.watchers.add(ws);
      conn.room = room;
      conn.playerIdx = null;
      send(ws, { type: 'watching', roomId: room.id });
      broadcast(room);
      return;
    }
    case 'join': {
      const room = rooms.get(msg.roomId.toUpperCase());
      if (!room) return send(ws, { type: 'error', message: 'Room not found' });
      detachConnection(ws, conn);

      // reconnect by token
      if (msg.playerToken) {
        const idx = room.players.findIndex((p) => p.token === msg.playerToken);
        if (idx >= 0) {
          room.players[idx].sockets.add(ws);
          if (msg.name && !(room.started && room.game === 'secrethitler')) room.players[idx].name = msg.name;
          conn.room = room;
          conn.playerIdx = idx;
          send(ws, { type: 'joined', roomId: room.id, playerToken: msg.playerToken, playerIndex: idx });
          broadcast(room);
          return;
        }
      }
      if (room.started && room.game === 'secrethitler') return send(ws, { type: 'error', message: 'That game has already started' });
      if (room.players.length >= seatsOf(room.game).max) return send(ws, { type: 'error', message: 'Room is full' });
      const name = (msg.name || '').trim().slice(0, 16) || `Player ${room.players.length + 1}`;
      if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        return send(ws, { type: 'error', message: 'Name already taken' });
      }
      const token = crypto.randomUUID();
      const color = freeColor(room);
      if (!color) return send(ws, { type: 'error', message: 'Room is full' });
      room.players.push({ name, color, token, sockets: new Set([ws]) });
      conn.room = room;
      conn.playerIdx = room.players.length - 1;
      send(ws, { type: 'joined', roomId: room.id, playerToken: token, playerIndex: conn.playerIdx });
      broadcast(room);
      return;
    }
    case 'pick_color': {
      const room = conn.room;
      if (!room || conn.playerIdx === null) return send(ws, { type: 'error', message: 'Join first' });
      if (room.started) return send(ws, { type: 'error', message: 'Game already started' });
      if (!seatsOf(room.game).colors.includes(msg.color)) return send(ws, { type: 'error', message: 'Unknown color' });
      const taken = room.players.some((p, i) => i !== conn.playerIdx && p.color === msg.color);
      if (taken) return send(ws, { type: 'error', message: `${msg.color} is taken` });
      room.players[conn.playerIdx].color = msg.color;
      broadcast(room);
      return;
    }
    case 'start': {
      const room = conn.room;
      if (!room) return send(ws, { type: 'error', message: 'Not in a room' });
      // the TV (watcher) or the host (seat 0) may start
      if (conn.playerIdx !== null && conn.playerIdx !== 0) {
        return send(ws, { type: 'error', message: 'Only the host or TV can start' });
      }
      if (room.started) return send(ws, { type: 'error', message: 'Already started' });
      if (room.players.length < 1) return send(ws, { type: 'error', message: 'No players yet' });
      room.started = true;
      // "Start script": build the authoritative initial state for this room's
      // game (deals hands, fills markets, sets turn order).
      const engine = engineOf(room.game);
      const seats = seatsOf(room.game);
      const seated: Seated[] = room.players.map((p) => ({ name: p.name, color: p.color }));
      if (room.game === 'secrethitler') {
        // Claude takes the empty chairs: enough to reach five, plus any extras chosen at creation.
        seated.push(...shClaudeSeats(seated, Number(room.options?.claudeSeats ?? 0)));
      } else {
        // One player alone: fill the table to a full game. The server plays
        // those seats (scheduleBrassSeat). Games of two or more are untouched.
        while (seated.length < engine.minSeats || (room.players.length < 2 && seated.length < engine.soloSeats)) {
          const c = seats.colors.find((cc) => !seated.some((s) => s.color === cc))!;
          seated.push({ name: `CPU ${seated.length + 1}`, color: c });
        }
      }
      room.state = engine.create(seated, newSeed(room), room.options);
      brassActedAt.set(room.id, Date.now());
      armGate(room);
      broadcast(room);
      return;
    }
    case 'rematch': {
      const room = conn.room;
      const s = room ? shState(room) : null;
      if (!room || !s) return send(ws, { type: 'error', message: 'Nothing to restart' });
      if (conn.playerIdx !== null && conn.playerIdx !== 0) return send(ws, { type: 'error', message: 'Only the host or TV can deal a new game' });
      if (s.core.phase !== 'over') return send(ws, { type: 'error', message: 'This game is still going' });
      shRematch(s, newSeed(room), screenLive(room));
      armGate(room);
      broadcast(room);
      return;
    }
    case 'presented': {
      const room = conn.room;
      const s = room ? shState(room) : null;
      if (!room || !s || conn.playerIdx !== null || !room.watchers.has(ws)) return;
      const seq = Math.min(Number(msg.seq) || 0, s.seq);
      if (seq <= s.screenSeq) return;
      const wasHeld = presenting(room);
      s.screenSeq = seq;
      if (wasHeld && !presenting(room)) {
        broadcastStates(room);
        scheduleBots(room);
      }
      return;
    }
    case 'action': {
      const room = conn.room;
      if (!room || !room.state) return send(ws, { type: 'error', message: 'No game in progress' });
      const seat = ALLOW_DEVELOPMENT_CONTROL && conn.viewAs !== undefined ? conn.viewAs : conn.playerIdx;
      if (seat === null) return send(ws, { type: 'error', message: 'Watchers cannot act' });
      if (room.game === 'secrethitler') {
        const err = shAct(room, seat, msg.action as ShAction);
        if (err) send(ws, { type: 'error', message: err });
        return;
      }
      const result = engineOf(room.game).apply(room.state, seat, msg.action, screenLive(room));
      if (!result.ok) return send(ws, { type: 'error', message: result.error ?? 'Illegal action' });
      brassActedAt.set(room.id, Date.now());
      broadcast(room);
      return;
    }
    case 'dev_view': {
      // Dev harness: choose a seat's redacted view. In production this never
      // changes action authority.
      conn.viewAs = msg.seat;
      const room = conn.room;
      if (room) sendState(room, ws, conn.playerIdx);
      return;
    }
  }
}

// Failing to bind the port is fatal: exit so the host restarts us, rather than idling with no listener.
server.on('error', (err) => {
  console.error('server failed to start:', err);
  process.exit(1);
});

server.listen(PORT, () => {
  const claude = claudeStatus();
  console.log('');
  console.log('  Board Game Engine running');
  console.log(`  Public URL:   ${publicBaseUrl()}`);
  console.log(`  (local:       http://localhost:${PORT})`);
  console.log(`  Claude seats: ${claude.live ? `live (${claude.model})` : `built-in bot (${claude.reason})`}`);
  console.log('');
  console.log('  Open the public URL on the TV to host; phones scan the QR to join.');
});
