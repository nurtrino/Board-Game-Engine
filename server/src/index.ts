import express from 'express';
import http from 'node:http';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { createBrass, viewFor, applyAction, SEAT_COLORS, type BrassState, type Color, type ClientMsg, type ServerMsg, type RoomInfo } from '@bge/shared';

// The engine has been scrapped. The server now only manages rooms and the
// lobby: creating a room on the TV, phones joining by QR, and broadcasting the
// player list. Per-game state will be layered back on as games are ported.

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
  color: Color;
  token: string;
  sockets: Set<WebSocket>;
  isBot?: boolean;
}

function freeColor(room: Room): Color | null {
  return SEAT_COLORS.find((c) => !room.players.some((p) => p.color === c)) ?? null;
}

interface Room {
  id: string;
  players: PlayerSlot[];
  watchers: Set<WebSocket>; // TV board views
  started: boolean;
  state: BrassState | null;
}

const rooms = new Map<string, Room>();
const MAX_PLAYERS = 6;

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
  if (room.state) send(ws, { type: 'state', view: viewFor(room.state, viewSeat(ws, realSeat)) });
}

function broadcast(room: Room): void {
  const info = roomInfo(room);
  for (const ws of room.watchers) { send(ws, { type: 'room', info }); sendState(room, ws, null); }
  room.players.forEach((p, seat) => {
    for (const ws of p.sockets) { send(ws, { type: 'room', info }); sendState(room, ws, seat); }
  });
}

// ---------- http ----------

const app = express();
app.use(express.static(CLIENT_DIST));

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
  const anyone = room.watchers.size > 0 || room.players.some((p) => p.sockets.size > 0);
  if (!anyone) {
    // keep empty rooms for 10 minutes so people can reconnect
    setTimeout(() => {
      const stillEmpty = room.watchers.size === 0 && room.players.every((p) => p.sockets.size === 0);
      if (stillEmpty) rooms.delete(room.id);
    }, 10 * 60 * 1000);
  }
}

function handle(ws: WebSocket, conn: ConnState, msg: ClientMsg): void {
  switch (msg.type) {
    case 'create_room': {
      const room: Room = { id: makeRoomId(), players: [], watchers: new Set(), started: false, state: null };
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
      if (!SEAT_COLORS.includes(msg.color)) return send(ws, { type: 'error', message: 'Unknown color' });
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
      // "Start script": build the authoritative initial state (deals hands,
      // sets money/markers/turn order, places merchant tiles, fills markets).
      const seed = crypto.randomInt(2 ** 31);
      const seated = room.players.map((p) => ({ name: p.name, color: p.color }));
      // Solo dev: fill an empty table to a full 4 seats so the dev seat-switcher
      // has all four players to drive. Real 2-4 player games are untouched.
      while (seated.length < 2 || (room.players.length < 2 && seated.length < 4)) {
        const c = SEAT_COLORS.find((cc) => !seated.some((s) => s.color === cc))!;
        seated.push({ name: `CPU ${seated.length + 1}`, color: c });
      }
      room.state = createBrass(seated, seed);
      broadcast(room);
      return;
    }
    case 'action': {
      const room = conn.room;
      if (!room || !room.state) return send(ws, { type: 'error', message: 'No game in progress' });
      // dev harness: a socket viewing another seat acts as that seat
      const seat = conn.viewAs ?? conn.playerIdx;
      if (seat === null || seat === undefined) return send(ws, { type: 'error', message: 'Watchers cannot act' });
      const result = applyAction(room.state, seat, msg.action);
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
