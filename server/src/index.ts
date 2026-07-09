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
  createTrek, trekViewFor, applyTrekAction,
  distancesFrom, findPath, TREK_CATALOG, PARKS, MAJORS, TREK_RULES,
  createDarkTower, dtViewFor, applyDtAction, dtBotAction, DT_KEYS,
  createDune, duneViewFor, applyDuneAction,
  createKanban, kanbanViewFor, applyKanbanAction, kanbanBotAction,
  CARD_BY_ID as DUNE_CARDS, INTRIGUE_BY_ID as DUNE_INTRIGUE, SPACES as DUNE_SPACES, FACTIONS as DUNE_FACTIONS,
  GAME_SEATS, RULES as TTR_RULES,
  type BrassState, type TtrState, type TrekState, type DtState, type DuneState, type KanbanState,
  type BrassAction, type TtrAction, type TrekAction, type DtAction, type DuneAction, type KanbanAction, type KanbanSeat,
  type TtrColor, type Color, type TrekSeat, type TrekPlayer, type TrekSuit, type DtSeat, type DuneSeat, type Faction,
  type SeatColor, type ClientMsg, type ServerMsg, type RoomInfo,
} from '@bge/shared';
import { createStore, type SavedRoom } from './store.js';

// Rooms + lobby + per-game engines. Each room carries a game id ('brass' or
// 'ttr'); start/action/view dispatch to that game's engine.

type GameState = BrassState | TtrState | TrekState | DtState | DuneState | KanbanState;

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
  trek: {
    create: (seated: { name: string; color: SeatColor }[], seed: number): GameState =>
      createTrek(seated as { name: string; color: TrekSeat }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => trekViewFor(state as TrekState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyTrekAction(state as TrekState, seat, action as TrekAction),
    soloSeats: 3,
  },
  darktower: {
    create: (seated: { name: string; color: SeatColor }[], seed: number): GameState =>
      createDarkTower(seated as { name: string; color: DtSeat }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => dtViewFor(state as DtState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyDtAction(state as DtState, seat, action as DtAction),
    soloSeats: 2,
  },
  dune: {
    create: (seated: { name: string; color: SeatColor }[], seed: number): GameState =>
      createDune(seated as { name: string; color: DuneSeat }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => duneViewFor(state as DuneState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyDuneAction(state as DuneState, seat, action as DuneAction),
    soloSeats: 3,
  },
  kanban: {
    create: (seated: { name: string; color: SeatColor }[], seed: number): GameState =>
      createKanban(seated as { name: string; color: KanbanSeat }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => kanbanViewFor(state as KanbanState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyKanbanAction(state as KanbanState, seat, action as KanbanAction),
    soloSeats: 3,
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
  if (!room.state) return;
  if (room.game === 'ttr') return scheduleTtrBots(room);
  if (room.game === 'trek') return scheduleTrekBots(room);
  if (room.game === 'darktower') return scheduleDtBots(room);
  if (room.game === 'dune') return scheduleDuneBots(room);
  if (room.game === 'kanban') return scheduleKanbanBots(room);
}

function scheduleKanbanBots(room: Room): void {
  const s = room.state as KanbanState;
  if (s.phase === 'ended') return;
  const seat = s.pending.length ? s.pending[0].seat : s.turn;
  if (seat < room.players.length) return; // a human's turn/choice
  if (botTimers.has(room.id)) return;
  const delay = s.pending.length ? 900 : s.phase === 'meeting' ? 1400 : 1600;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { kanbanBotAct(room, seat); } catch (err) { console.error('bot error:', err); }
  }, delay));
}

function kanbanBotAct(room: Room, seat: number): void {
  const s = room.state as KanbanState;
  let acted = false;
  // the shared random-legal bot supplies attempts; the reducer arbitrates
  for (let i = 0; i < 40 && !acted; i++) {
    const a = kanbanBotAction(s, seat, Math.random);
    if (!a) break;
    acted = applyKanbanAction(s, seat, a).ok;
  }
  if (acted) broadcast(room);
  else console.warn(`kanban bot seat ${seat} in ${room.id} found no legal action`);
}

function scheduleDuneBots(room: Room): void {
  const s = room.state as DuneState;
  if (s.phase === 'ended') return;
  // a pending decision belongs to its owner, otherwise the turn seat acts
  const seat = s.pending.length ? s.pending[0].seat : s.turn;
  if (seat < room.players.length) return; // a human's turn/choice
  if (botTimers.has(room.id)) return;
  const delay = s.pending.length ? 900 : s.phase === 'combat' ? 1400 : 1700;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { duneBotAct(room, seat); } catch (err) { console.error('bot error:', err); }
  }, delay));
}

function scheduleDtBots(room: Room): void {
  const s = room.state as DtState;
  if (s.phase === 'ended') return;
  if (s.turn < room.players.length) return; // a human's turn
  if (botTimers.has(room.id)) return;
  const botSeat = s.turn;
  // longer beat so the TV can replay the tower's display steps
  const delay = s.phase === 'turnDone' ? 2600 : 2000;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { dtBotAct(room, botSeat); } catch (err) { console.error('bot error:', err); }
  }, delay));
}

function scheduleTtrBots(room: Room): void {
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
  // deliberate pace so the TV can show each move land with its caption/fly-to,
  // rather than a whole bot turn resolving in a blink
  const delay = (room.state as TtrState).phase === 'setup' ? 1100 : 1800;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { ttrBotAct(room, botSeat); } catch (err) { console.error('bot error:', err); }
  }, delay));
}

function scheduleTrekBots(room: Room): void {
  const s = room.state as TrekState;
  if (s.phase === 'ended') return;
  if (s.turn < room.players.length) return; // a human's turn
  if (botTimers.has(room.id)) return;
  const botSeat = s.turn;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { trekBotAct(room, botSeat); } catch (err) { console.error('bot error:', err); }
  }, 1800));
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
  } else if (s.turnDraws > 0) {
    // mid-draw: take a second random card, or end the turn (one card is fine)
    if (Math.random() < 0.75) {
      const sources: (number | 'train' | 'ship')[] = ['train', 'ship', 0, 1, 2, 3, 4, 5];
      for (let k = 0; k < 10 && !acted; k++) acted = attempt({ type: 'draw_card', source: sources[rand(sources.length)] });
    }
    if (!acted) acted = attempt({ type: 'end_turn' });
  } else {
    // fresh turn: claim a random affordable route most of the time
    if (Math.random() < 0.6) {
      const options = claimableRoutes(s, p);
      if (options.length) {
        const id = options[rand(options.length)];
        const cards = bestCardsFor(s, p, id);
        if (cards) acted = attempt({ type: 'claim', route: id, cards });
      }
    }
    if (!acted) {
      const sources: (number | 'train' | 'ship')[] = ['train', 'ship', 0, 1, 2, 3, 4, 5];
      for (let k = 0; k < 10 && !acted; k++) acted = attempt({ type: 'draw_card', source: sources[rand(sources.length)] });
    }
    if (!acted && s.ticketDeck.length) acted = attempt({ type: 'draw_tickets' });
    if (!acted && p.boxTrains + p.boxShips > 0) {
      acted = attempt({ type: 'exchange', trains: Math.min(1, p.boxTrains), ships: p.boxTrains > 0 ? 0 : Math.min(1, p.boxShips) });
    }
    if (!acted) acted = attempt({ type: 'end_turn' }); // pass if truly stuck
  }

  if (acted) broadcast(room); // re-enters scheduleBots for the next bot step
  else console.warn(`bot seat ${seat} in ${room.id} found no legal action`);
}

// Trek bot: one action per tick. Claims/occupies when standing on a payable
// target, saves up cards and walks to the nearest payable river park,
// otherwise draws (preferring suits it still needs).
function trekBotAct(room: Room, seat: number): void {
  const s = room.state as TrekState;
  const p = s.players[seat];
  if (!p || s.turn !== seat) return;
  const rand = (n: number) => Math.floor(Math.random() * n);
  const attempt = (a: TrekAction) => applyTrekAction(s, seat, a).ok;
  let acted = false;

  const payFor = (cost: TrekSuit[]): number[] | null => {
    const used = new Set<number>();
    for (const suit of cost) {
      const i = p.hand.findIndex((c, idx) => !used.has(idx) && TREK_CATALOG[c].suit === suit);
      if (i < 0) return null;
      used.add(i);
    }
    return [...used];
  };

  if (s.actionsLeft <= 0) {
    // discard to the limit, then pass
    while (p.hand.length > TREK_RULES.handLimit) {
      const idx = p.hand.map((c, i) => ({ i, v: TREK_CATALOG[c].value })).sort((a, b) => a.v - b.v)
        .slice(0, p.hand.length - TREK_RULES.handLimit).map((x) => x.i);
      if (!attempt({ type: 'discard', cards: idx })) break;
    }
    acted = attempt({ type: 'end_turn' });
  } else {
    // 1) claim a river park under our feet
    for (let slot = 0; slot < s.parkRiver.length && !acted; slot++) {
      const id = s.parkRiver[slot];
      if (id === null || PARKS[id].node !== p.node) continue;
      const cards = payFor(PARKS[id].cost);
      if (cards) acted = attempt({ type: 'claim', slot, cards });
    }
    // 2) occupy a major under our feet
    if (!acted) {
      for (const majorId of s.majors) {
        const m = MAJORS[majorId];
        if (m.node !== p.node || p.majors.includes(majorId) || p.campsites <= 0) continue;
        const cards = payFor(m.cost);
        if (cards && attempt({ type: 'occupy', major: majorId, cards })) { acted = true; break; }
      }
    }
    // 3) walk to the nearest payable river park with an exact spare-card sum
    if (!acted && p.hand.length) {
      const dist = distancesFrom(p.node);
      const goals = s.parkRiver
        .map((id, slot) => ({ id, slot }))
        .filter((g): g is { id: number; slot: number } => g.id !== null && PARKS[g.id].node !== p.node)
        .map((g) => ({ ...g, cost: payFor(PARKS[g.id].cost), d: dist[PARKS[g.id].node] }))
        .filter((g) => g.cost !== null)
        .sort((a, b) => a.d - b.d);
      const subsetSum = (idx: number[], target: number): number[] | null => {
        if (target === 0) return [];
        for (let k = 0; k < idx.length; k++) {
          const v = TREK_CATALOG[p.hand[idx[k]]].value;
          if (v > target) continue;
          const rest = subsetSum(idx.slice(k + 1), target - v);
          if (rest) return [idx[k], ...rest];
        }
        return null;
      };
      for (const g of goals) {
        const spare = p.hand.map((_, i) => i).filter((i) => !g.cost!.includes(i));
        const cards = subsetSum(spare, g.d);
        if (!cards) continue;
        const path = findPath(s, p as TrekPlayer, PARKS[g.id].node, g.d);
        if (path && attempt({ type: 'move', path, cards })) { acted = true; break; }
      }
      // wander toward a stone once the hand is fat enough
      if (!acted && p.hand.length >= 6) {
        const stonesLeft = Object.entries(s.stones).filter(([, c]) => c).map(([n]) => Number(n));
        const one = rand(p.hand.length);
        const len = TREK_CATALOG[p.hand[one]].value;
        const targets = stonesLeft.filter((n) => dist[n] === len);
        const all = Object.keys(dist).map(Number).filter((n) => dist[n] === len && n !== p.node);
        for (const dest of [...targets, ...all.sort(() => Math.random() - 0.5).slice(0, 4)]) {
          const path = findPath(s, p as TrekPlayer, dest, len);
          if (path && attempt({ type: 'move', path, cards: [one] })) { acted = true; break; }
        }
      }
    }
    // 4) draw, preferring river suits still needed for a river park
    if (!acted) {
      const needed = new Set<string>();
      for (const id of s.parkRiver) {
        if (id === null) continue;
        const have = p.hand.map((c) => TREK_CATALOG[c].suit as string);
        for (const suit of PARKS[id].cost) {
          const at = have.indexOf(suit);
          if (at >= 0) have.splice(at, 1); else needed.add(suit);
        }
      }
      let slot = s.trekRiver.findIndex((c) => c !== null && needed.has(TREK_CATALOG[c].suit));
      if (slot < 0) slot = rand(5);
      acted = attempt({ type: 'draw', source: s.trekRiver[slot] !== null ? slot : 'deck' });
      if (!acted) acted = attempt({ type: 'draw', source: 'deck' });
    }
    if (!acted) acted = attempt({ type: 'end_turn' }); // truly stuck: pass
  }

  if (acted) broadcast(room);
  else console.warn(`trek bot seat ${seat} in ${room.id} found no legal action`);
}

// Dark Tower bot: one action per tick — builds an army big enough for the
// tower (bazaar warriors + tomb raids), collects the quad keys, then storms.
function dtBotAct(room: Room, seat: number): void {
  const s = room.state as DtState;
  const p = s.players[seat];
  if (!p || s.turn !== seat || s.phase === 'ended') return;
  const rand = Math.random;
  const attempt = (a: DtAction) => applyDtAction(s, seat, a).ok;
  let acted = false;

  if (s.phase === 'turnDone') acted = attempt({ type: 'end_turn' });
  else if (s.phase === 'battle') {
    if (!s.battle!.tower && p.warriors <= 3 && rand() < 0.7) acted = attempt({ type: 'battle_bail' });
    else acted = attempt({ type: 'battle_continue' });
  } else if (s.phase === 'cursePick') {
    const victims = s.players.filter((q) => q.seat !== seat);
    const v = victims.sort((a, b) => (b.warriors + b.gold) - (a.warriors + a.gold))[0];
    acted = attempt({ type: 'curse', victim: v.seat });
  } else if (s.phase === 'riddle') {
    acted = attempt({ type: 'riddle_guess', key: DT_KEYS[Math.floor(rand() * 3)] });
  } else if (s.phase === 'bazaar') {
    const bz = s.bazaar!;
    if (bz.offer === 'warrior' && p.warriors < 55 && (bz.buying + 1) * bz.prices.warrior <= p.gold && bz.buying < 10) acted = attempt({ type: 'bazaar_yes' });
    else if (bz.offer === 'food' && p.food < 30 && bz.buying < Math.min(20, p.gold)) acted = attempt({ type: 'bazaar_yes' });
    else if (bz.buying > 0) acted = attempt({ type: 'bazaar_no' });
    else if (bz.offer === 'beast' && bz.prices.beast <= p.gold) acted = attempt({ type: 'bazaar_yes' });
    else if ((bz.offer === 'scout' || bz.offer === 'healer') && bz.prices[bz.offer] <= p.gold && rand() < 0.4) acted = attempt({ type: 'bazaar_yes' });
    else if (rand() < 0.3) acted = attempt({ type: 'bazaar_haggle' });
    else acted = attempt({ type: 'bazaar_no' });
  } else {
    // press an action button (the pawn's board position is honor-system)
    acted = attempt(dtBotAction(s, seat));
  }

  if (acted) broadcast(room);
  else console.warn(`dt bot seat ${seat} in ${room.id} found no legal action`);
}

// Dune bot: one action per tick. Resolves pending choices, picks leaders,
// plays agent turns onto random legal spaces, reveals + buys, and bids
// combat intrigue when it holds troops in the conflict.
function duneBotAct(room: Room, seat: number): void {
  const s = room.state as DuneState;
  const rng = Math.random;
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const attempt = (a: DuneAction) => applyDuneAction(s, seat, a).ok;
  let acted = false;

  if (s.pending.length && s.pending[0].seat === seat) {
    const p = s.players[seat];
    const d = s.pending[0].decision as { kind: string; pick?: number; options?: unknown[] };
    const factions = [...DUNE_FACTIONS] as Faction[];
    switch (d.kind) {
      case 'influenceAny': acted = attempt({ type: 'choose', faction: pick(factions) }); break;
      case 'influencePickTwo': case 'baronFactions':
        acted = attempt({ type: 'choose', factions: factions.sort(() => rng() - 0.5).slice(0, 2) });
        break;
      case 'influenceWhereBehind': acted = attempt({ type: 'choose', accept: false }); break;
      case 'influencePick': acted = attempt({ type: 'choose', faction: (d as { options: Faction[] }).options[0] }); break;
      case 'voiceSpace': acted = attempt({ type: 'choose', space: pick(DUNE_SPACES).id }); break;
      case 'trash': {
        const cand = [...p.hand, ...p.discard].filter((c) => c === 'duneDesertPlanet' || c === 'convincingArgument');
        acted = cand.length ? attempt({ type: 'choose', card: cand[0] }) : attempt({ type: 'choose', accept: false });
        break;
      }
      case 'discardOrLoseTroop':
        acted = p.hand.length ? attempt({ type: 'choose', card: pick(p.hand) }) : attempt({ type: 'choose' });
        if (!acted) acted = attempt({ type: 'choose' });
        break;
      case 'helenaRow': case 'freeAcquire': {
        const rows = s.imperiumRow.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
        for (const i of rows.sort(() => rng() - 0.5)) { if (attempt({ type: 'choose', option: i })) { acted = true; break; } }
        if (!acted) acted = attempt({ type: 'choose', accept: false });
        break;
      }
      case 'recallAgent': {
        const mine = Object.entries(s.spaces).find(([, v]) => v.includes(seat));
        if (mine) acted = attempt({ type: 'choose', space: mine[0] });
        break;
      }
      case 'pickOpponentInConflict': {
        const t = s.players.filter((q) => q.seat !== seat && q.inConflict > 0)
          .sort((a, b) => b.inConflict - a.inConflict)[0];
        if (t) acted = attempt({ type: 'choose', seat: t.seat });
        break;
      }
      case 'conflictChoice': {
        const n = (d.options ?? []).length;
        const order = Array.from({ length: n }, (_, i) => i).sort(() => rng() - 0.5);
        if ((d.pick ?? 1) === 1) {
          for (const o of order) { if (attempt({ type: 'choose', option: o })) { acted = true; break; } }
        } else {
          acted = attempt({ type: 'choose', options: order.slice(0, d.pick) });
          if (!acted) acted = attempt({ type: 'choose', options: [0, 1] });
        }
        break;
      }
    }
    if (acted) broadcast(room);
    else console.warn(`dune bot seat ${seat} in ${room.id} stuck on ${d.kind}`);
    return;
  }

  const p = s.players[seat];
  if (!p || s.turn !== seat) return;

  if (s.phase === 'leaders') {
    acted = attempt({ type: 'pick_leader', leader: pick(s.leaderPool) });
  } else if (s.phase === 'combat') {
    const combat = p.intrigue.filter((c) => DUNE_INTRIGUE[c]?.kind.includes('combat'));
    if (!s.postCombat && p.inConflict > 0 && combat.length && rng() < 0.5) acted = attempt({ type: 'intrigue', card: pick(combat) });
    if (!acted) acted = attempt({ type: 'combat_pass' });
  } else if (p.actedThisTurn === 'reveal') {
    // buy the priciest affordable card, else finish
    const buys: DuneAction[] = [];
    s.imperiumRow.forEach((c, i) => { if (c && (DUNE_CARDS[c]?.cost ?? 99) <= p.persuasion) buys.push({ type: 'acquire', row: i }); });
    if (p.persuasion >= 9 - p.spiceMustFlowBonus) buys.push({ type: 'acquire', reserve: 'theSpiceMustFlow' });
    if (!buys.length && p.persuasion >= 2) buys.push({ type: 'acquire', reserve: 'arrakisLiaison' });
    if (buys.length && rng() < 0.9) acted = attempt(pick(buys));
    if (!acted) acted = attempt({ type: 'end_turn' });
  } else if (p.actedThisTurn === 'agent') {
    acted = attempt({ type: 'end_turn' });
  } else {
    // agent turn: try random card x space combos, prefer combat spaces with a deploy
    if (p.agentsLeft + (p.mentat ? 1 : 0) > 0 && p.hand.length && rng() < 0.92) {
      for (let i = 0; i < 16 && !acted; i++) {
        const card = pick(p.hand);
        const space = pick([...DUNE_SPACES]);
        const a: DuneAction = { type: 'agent', card, space: space.id };
        if (space.id === 'sellMelange') a.sell = 2;
        if (space.combat) a.deploy = 2;
        acted = attempt(a);
      }
    }
    if (!acted && !p.revealed) acted = attempt({ type: 'reveal' });
    if (!acted) acted = attempt({ type: 'end_turn' });
  }

  if (acted) broadcast(room);
  else console.warn(`dune bot seat ${seat} in ${room.id} found no legal action`);
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
