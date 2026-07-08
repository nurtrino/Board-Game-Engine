import express from 'express';
import http from 'node:http';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import {
  createBrass, viewFor, applyAction,
  createTtr, ttrViewFor, applyTtrAction,
  claimableRoutes, bestCardsFor,
  GAME_SEATS, RULES as TTR_RULES,
  type BrassState, type TtrState, type BrassAction, type TtrAction, type TtrColor, type Color,
  type SeatColor, type ClientMsg, type ServerMsg, type RoomInfo,
} from '@bge/shared';
import { createStore, type SavedRoom } from './store.js';

// Rooms + lobby + per-game engines. Each room carries a game id ('brass' or
// 'ttr'); start/action/view dispatch to that game's engine.

type GameState = BrassState | TtrState;

const engines = {
  brass: {
    create: (seated: { name: string; color: SeatColor }[], seed: number): GameState =>
      createBrass(seated as { name: string; color: Color }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => viewFor(state as BrassState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyAction(state as BrassState, seat, action as BrassAction),
    soloSeats: 4, // dev convenience: pad an empty table to a full game
  },
  ttr: {
    create: (seated: { name: string; color: SeatColor }[], seed: number): GameState =>
      createTtr(seated as { name: string; color: TtrColor }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => ttrViewFor(state as TtrState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyTtrAction(state as TtrState, seat, action as TtrAction),
    soloSeats: 5,
  },
} as const;

const engineOf = (game: string) => engines[game as keyof typeof engines] ?? engines.brass;
const seatsOf = (game: string) => GAME_SEATS[game] ?? GAME_SEATS.brass;

const PORT = Number(process.env.PORT ?? 8787);
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
// this — Render populates RENDER_EXTERNAL_URL automatically; PUBLIC_URL is a
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
  game: string; // game id: 'brass' | 'ttr'
  createdAt: number;
  players: PlayerSlot[];
  watchers: Set<WebSocket>; // TV board views
  started: boolean;
  state: GameState | null;
  updatedAt: number;
}

const rooms = new Map<string, Room>();
const MAX_PLAYERS = 6;

// ---------- persistence ----------
// Rooms are continuously saved (file locally, Postgres when DATABASE_URL is
// set) and rehydrated at boot, so games survive restarts AND redeploys.
// Devices hold a per-room token in localStorage and reconnect into their seat.

const store = await createStore(path.resolve(__dirname, '..'));

function toSaved(room: Room): SavedRoom {
  return {
    id: room.id,
    name: room.name,
    game: room.game,
    createdAt: room.createdAt,
    players: room.players.map(({ name, color, token, isBot }) => ({ name, color, token, isBot })),
    started: room.started,
    state: room.state,
    updatedAt: room.updatedAt,
  };
}

function persist(room: Room): void {
  store.save(toSaved(room));
}

const DAY = 24 * 60 * 60 * 1000;

/** Drop finished games after a week and anything untouched for 60 days. */
function stale(r: { started: boolean; state: GameState | null; updatedAt: number }): boolean {
  const age = Date.now() - r.updatedAt;
  if (r.state?.phase === 'ended') return age > 7 * DAY;
  if (!r.started) return age > 7 * DAY; // lobbies that never started
  return age > 60 * DAY;
}

{
  const saved = await store.load();
  let restored = 0;
  for (const r of saved) {
    if (stale(r)) { store.remove(r.id); continue; }
    rooms.set(r.id, {
      id: r.id,
      name: r.name ?? `Room ${r.id}`,
      game: r.game ?? 'brass',
      createdAt: r.createdAt ?? r.updatedAt,
      players: r.players.map((p) => ({ ...p, sockets: new Set<WebSocket>() })),
      watchers: new Set(),
      started: r.started,
      state: r.state,
      updatedAt: r.updatedAt,
    });
    restored++;
  }
  if (restored) console.log(`  Restored ${restored} saved room${restored === 1 ? '' : 's'} (${store.kind})`);
  // a restored solo game may be waiting on a CPU — get its bots moving again
  // (deferred: botTimers below initializes after this block evaluates)
  setTimeout(() => { for (const room of rooms.values()) scheduleBots(room); }, 1000);
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (stale(room)) { rooms.delete(room.id); store.remove(room.id); }
  }
}, 60 * 60 * 1000);

// Render sends SIGTERM on every deploy — write out pending saves first.
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
  if (room.state) send(ws, { type: 'state', view: engineOf(room.game).view(room.state, viewSeat(ws, realSeat)) });
}

function broadcast(room: Room): void {
  // every mutation funnels through here — save the room as a side effect
  room.updatedAt = Date.now();
  persist(room);
  const info = roomInfo(room);
  for (const ws of room.watchers) { send(ws, { type: 'room', info }); sendState(room, ws, null); }
  room.players.forEach((p, seat) => {
    for (const ws of p.sockets) { send(ws, { type: 'room', info }); sendState(room, ws, seat); }
  });
  scheduleBots(room);
}

// ---------- CPU seats ----------
// Solo games pad the table with CPU seats (any seat index >= the real player
// count). They play randomly so the table never deadlocks: at setup they keep
// random tickets and pick a random train/ship split; in play they claim a
// random affordable route or draw random cards, one action per tick.

const botTimers = new Map<string, NodeJS.Timeout>();

function scheduleBots(room: Room): void {
  if (room.game !== 'ttr' || !room.state) return;
  const s = room.state as TtrState;
  if (s.phase === 'ended') return;
  const isBot = (seat: number) => seat >= room.players.length;
  let seat: number | null = null;
  if (s.phase === 'setup') {
    const i = s.players.findIndex((p, idx) => isBot(idx) && !p.ready);
    seat = i >= 0 ? i : null;
  } else {
    const pending = s.players.findIndex((p, idx) => isBot(idx) && p.pendingTickets.length > 0);
    const cur = (s.first + s.turn) % s.players.length;
    if (pending >= 0) seat = pending;
    else if (isBot(cur)) seat = cur;
  }
  if (seat === null || botTimers.has(room.id)) return;
  const botSeat = seat;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { ttrBotAct(room, botSeat); } catch (err) { console.error('bot error:', err); }
  }, 700));
}

function ttrBotAct(room: Room, seat: number): void {
  const s = room.state as TtrState;
  const p = s.players[seat];
  if (!p) return;
  const rand = (n: number) => Math.floor(Math.random() * n);
  const attempt = (a: TtrAction) => applyTtrAction(s, seat, a).ok;
  let acted = false;

  if (s.phase === 'setup') {
    if (p.ready) return;
    // random tickets (the minimum keep), random fleet split
    const idx = p.pendingTickets.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = rand(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const keep = idx.slice(0, TTR_RULES.setupKeepMin);
    const minTrains = TTR_RULES.pieceTotal - TTR_RULES.maxShips;
    const trains = minTrains + rand(TTR_RULES.maxTrains - minTrains + 1);
    acted = attempt({ type: 'setup_ready', tickets: keep, trains, ships: TTR_RULES.pieceTotal - trains });
  } else if (p.pendingTickets.length) {
    acted = attempt({ type: 'keep_tickets', keep: [rand(p.pendingTickets.length)] });
  } else {
    // claim a random affordable route most of the time
    if (s.drawsLeft === 0 && Math.random() < 0.65) {
      const options = claimableRoutes(s, p);
      if (options.length) {
        const id = options[rand(options.length)];
        const cards = bestCardsFor(s, p, id);
        if (cards) acted = attempt({ type: 'claim', route: id, cards });
      }
    }
    if (!acted) {
      // draw a random card (market slot or a deck); a few tries in case a
      // slot is empty or a faceup wild is illegal as the second draw
      const sources: (number | 'train' | 'ship')[] = ['train', 'ship', 0, 1, 2, 3, 4, 5];
      for (let k = 0; k < 10 && !acted; k++) acted = attempt({ type: 'draw_card', source: sources[rand(sources.length)] });
    }
    if (!acted && s.drawsLeft === 0 && s.ticketDeck.length) acted = attempt({ type: 'draw_tickets' });
    if (!acted && s.drawsLeft === 0 && p.boxTrains + p.boxShips > 0) {
      acted = attempt({ type: 'exchange', trains: Math.min(1, p.boxTrains), ships: p.boxTrains > 0 ? 0 : Math.min(1, p.boxShips) });
    }
  }

  if (acted) broadcast(room); // re-enters scheduleBots for the next bot step
  else console.warn(`bot seat ${seat} in ${room.id} found no legal action`);
}

// ---------- http ----------

const app = express();
app.use(express.static(CLIENT_DIST));

// Saved games, newest first — the "select a save" list on the new-game screen.
app.get('/api/saves', (_req, res) => {
  const list = [...rooms.values()]
    .map((r) => ({
      roomId: r.id,
      name: r.name,
      game: r.game,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      status: r.state?.phase === 'ended' ? 'ended' : r.started ? 'playing' : 'lobby',
      era: (r.state && 'era' in r.state ? r.state.era : null),
      round: (r.state && 'round' in r.state ? r.state.round : null),
      numRounds: (r.state && 'numRounds' in r.state ? r.state.numRounds : null),
      players: r.players.map((p) => ({ name: p.name, color: p.color })),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(list);
});

// Delete a saved game: drop it from memory and the store, and boot anyone
// still connected to it.
app.delete('/api/saves/:id', (req, res) => {
  const id = req.params.id.toUpperCase();
  const room = rooms.get(id);
  if (!room) { res.status(404).json({ error: 'Not found' }); return; }
  for (const ws of room.watchers) ws.close();
  for (const p of room.players) for (const ws of p.sockets) ws.close();
  rooms.delete(id);
  store.remove(id);
  res.json({ ok: true });
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
    if (conn.playerIdx === null) {
      room.watchers.delete(ws);
    } else {
      room.players[conn.playerIdx]?.sockets.delete(ws);
    }
    broadcast(room);
    maybeCleanup(room);
  });
});

function maybeCleanup(room: Room): void {
  // Rooms are saves now — never expire one just because everyone disconnected.
  // Only sweep abandoned TV lobbies that no player ever joined; everything
  // else lives until the hourly stale() sweep retires it.
  if (room.started || room.players.length > 0) return;
  if (room.watchers.size > 0) return;
  setTimeout(() => {
    const stillEmpty = room.watchers.size === 0 && room.players.length === 0 && !room.started;
    if (stillEmpty) { rooms.delete(room.id); store.remove(room.id); }
  }, 10 * 60 * 1000);
}

function handle(ws: WebSocket, conn: ConnState, msg: ClientMsg): void {
  switch (msg.type) {
    case 'create_room': {
      const id = makeRoomId();
      const name = (msg.name || '').trim().slice(0, 40) || `Game ${id}`;
      const room: Room = {
        id, name, game: msg.game || 'brass', createdAt: Date.now(),
        players: [], watchers: new Set(), started: false, state: null, updatedAt: Date.now(),
      };
      rooms.set(room.id, room);
      room.watchers.add(ws);
      conn.room = room;
      conn.playerIdx = null;
      send(ws, { type: 'room_created', roomId: room.id, joinUrl: joinUrl(room.id) });
      broadcast(room);
      return;
    }
    case 'watch': {
      const room = rooms.get(msg.roomId.toUpperCase());
      if (!room) return send(ws, { type: 'error', message: 'Room not found' });
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

      // reconnect by token
      if (msg.playerToken) {
        const idx = room.players.findIndex((p) => p.token === msg.playerToken);
        if (idx >= 0) {
          room.players[idx].sockets.add(ws);
          if (msg.name) room.players[idx].name = msg.name;
          conn.room = room;
          conn.playerIdx = idx;
          send(ws, { type: 'joined', roomId: room.id, playerToken: msg.playerToken, playerIndex: idx });
          broadcast(room);
          return;
        }
      }
      if (room.players.length >= MAX_PLAYERS) return send(ws, { type: 'error', message: 'Room is full' });
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
      const seed = crypto.randomInt(2 ** 31);
      const engine = engineOf(room.game);
      const seats = seatsOf(room.game);
      const seated = room.players.map((p) => ({ name: p.name, color: p.color }));
      // Solo dev: fill an empty table to a full game so the dev seat-switcher
      // has every seat to drive. Real multi-player games are untouched.
      while (seated.length < 2 || (room.players.length < 2 && seated.length < engine.soloSeats)) {
        const c = seats.colors.find((cc) => !seated.some((s) => s.color === cc))!;
        seated.push({ name: `CPU ${seated.length + 1}`, color: c });
      }
      room.state = engine.create(seated, seed);
      broadcast(room);
      return;
    }
    case 'action': {
      const room = conn.room;
      if (!room || !room.state) return send(ws, { type: 'error', message: 'No game in progress' });
      // dev harness: a socket viewing another seat acts as that seat
      const seat = conn.viewAs ?? conn.playerIdx;
      if (seat === null || seat === undefined) return send(ws, { type: 'error', message: 'Watchers cannot act' });
      const result = engineOf(room.game).apply(room.state, seat, msg.action);
      if (!result.ok) return send(ws, { type: 'error', message: result.error ?? 'Illegal action' });
      broadcast(room);
      return;
    }
    case 'dev_view': {
      // Dev harness: let a socket receive (and act with) any seat's view.
      conn.viewAs = msg.seat;
      const room = conn.room;
      if (room) sendState(room, ws, conn.playerIdx);
      return;
    }
  }
}

server.listen(PORT, () => {
  console.log('');
  console.log('  Board Game Engine running');
  console.log(`  Public URL:   ${publicBaseUrl()}`);
  console.log(`  (local:       http://localhost:${PORT})`);
  console.log('');
  console.log('  Open the public URL on the TV to host; phones scan the QR to join.');
});
