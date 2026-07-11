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
  createDarkTower, dtViewFor, applyDtAction, dtBotAction, dtNormalize, DT_KEYS,
  createDune, duneViewFor, applyDuneAction,
  createAxisGame, axisGameViewFor, applyAxisGameAction, normalizeAxisState,
  createPolitik, politikViewFor, applyPolitikAction, politikBotAction, politikActingSeat,
  createDarkSouls, dsViewFor, applyDarkSoulsAction,
  createFeast, feastViewFor, applyFeastAction, feastActingSeat, feastBotAction,
  createBloodborne, bbViewFor, applyBloodborneAction, bbPostProcess,
  createSeti, setiViewFor, applySetiAction,
  BB_STAT_CARDS, BB_HUNTERS, BB_MISSIONS, bbLampSpaces, bbSpaceNeighbors, bbTileDef, bbWorldExits,
  DS_CLASSES, DS_CLASS_IDS, DS_TREASURE_BY_ID, dsNodeDistance, dsTileGraph, dsNodeBlocked, dsOccupancy,
  CARD_BY_ID as DUNE_CARDS, INTRIGUE_BY_ID as DUNE_INTRIGUE, SPACES as DUNE_SPACES, FACTIONS as DUNE_FACTIONS,
  GAME_SEATS, RULES as TTR_RULES,
  type BrassState, type TtrState, type TrekState, type DtState, type DuneState, type AxisState, type PolitikState,
  type BrassAction, type TtrAction, type TrekAction, type DtAction, type DuneAction, type AxisAction, type PolitikAction,
  type DsState, type DsAction, type DsPending, type DsStat,
  type FeastState, type FeastAction, type FeastSeatColor,
  type BbState, type BbAction, type BbPending,
  type SetiState, type SetiAction, type SetiSeatColor,
  type TtrColor, type Color, type TrekSeat, type TrekPlayer, type TrekSuit, type DtSeat, type DuneSeat, type Faction,
  type SeatColor, type ClientMsg, type ServerMsg, type RoomInfo, type GameOptions, type AxisSeat, type PolitikSeat,
} from '@bge/shared';
import {
  axisBattleActionGeneration,
  authorizeAxisAction,
  controlledAxisPowers,
  hasReadyAxisBattleWatcher,
  isAxisBattleVisualGateAction,
  isAxisBattleVisualMutation,
  resolveActionSeat,
} from './axis-authority.js';
import { createStore, type SavedRoom } from './store.js';
import { bearerToken, canDeleteSave } from './save-auth.js';

// Rooms + lobby + per-game engines. Each room carries a game id ('brass' or
// 'ttr'); start/action/view dispatch to that game's engine.

type GameState = BrassState | TtrState | TrekState | DtState | DuneState | AxisState | PolitikState | DsState | FeastState | BbState | SetiState;

const engines = {
  brass: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, _options?: GameOptions): GameState =>
      createBrass(seated as { name: string; color: Color }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => viewFor(state as BrassState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyAction(state as BrassState, seat, action as BrassAction),
    soloSeats: 4, // dev convenience: pad an empty table to a full game
  },
  ttr: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, _options?: GameOptions): GameState =>
      createTtr(seated as { name: string; color: TtrColor }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => ttrViewFor(state as TtrState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyTtrAction(state as TtrState, seat, action as TtrAction),
    soloSeats: 5,
  },
  trek: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, _options?: GameOptions): GameState =>
      createTrek(seated as { name: string; color: TrekSeat }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => trekViewFor(state as TrekState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyTrekAction(state as TrekState, seat, action as TrekAction),
    soloSeats: 3,
  },
  darktower: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, _options?: GameOptions): GameState =>
      createDarkTower(seated as { name: string; color: DtSeat }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => dtViewFor(state as DtState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyDtAction(state as DtState, seat, action as DtAction),
    soloSeats: 2,
  },
  dune: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, _options?: GameOptions): GameState =>
      createDune(seated as { name: string; color: DuneSeat }[], seed),
    view: (state: GameState, viewer: number | null | 'dev') => duneViewFor(state as DuneState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyDuneAction(state as DuneState, seat, action as DuneAction),
    soloSeats: 3,
  },
  axis: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, options?: GameOptions): GameState =>
      createAxisGame(seated as { name: string; color: AxisSeat }[], seed, options ?? {}),
    view: (state: GameState, viewer: number | null | 'dev') => axisGameViewFor(state as AxisState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyAxisGameAction(state as AxisState, seat, action as AxisAction),
    soloSeats: 1, // one human may drive every power (owner: dev control-all)
  },
  politik: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, options?: GameOptions): GameState =>
      createPolitik(seated as { name: string; color: PolitikSeat }[], seed, options ?? {}),
    view: (state: GameState, viewer: number | null | 'dev') => politikViewFor(state as PolitikState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyPolitikAction(state as PolitikState, seat, action as PolitikAction),
    soloSeats: 3,
  },
  darksouls: {
    // Co-op 1-4 characters; seats beyond the humans are CPU party members.
    // The create screen's partySize wins; otherwise every seated player
    // (including dev solo padding) gets a character. Classes are picked
    // in-game during the setup phase, so seat colors stay class-agnostic.
    create: (seated: { name: string; color: SeatColor }[], seed: number, options?: GameOptions): GameState => {
      const o = options ?? {};
      const requested = Number(o.partySize);
      const partySize = Number.isInteger(requested) && requested >= 1 && requested <= 4
        ? requested
        : Math.min(Math.max(seated.length, 1), 4);
      return createDarkSouls({
        scenarioId: typeof o.scenario === 'string' ? o.scenario : 'standard',
        partySize,
        miniBoss: typeof o.miniBoss === 'string' ? o.miniBoss : 'random',
        mainBoss: typeof o.mainBoss === 'string' ? o.mainBoss : 'random',
        megaFinale: typeof o.megaFinale === 'string' && o.megaFinale !== 'off' ? o.megaFinale : null,
        darkrootMix: o.darkrootMix === 'append' || o.darkrootMix === 'replaceSix' ? o.darkrootMix : 'off',
        darkrootTreasure: o.darkrootTreasure === true,
        mimics: o.mimics === true,
        invaders: o.invaders === true,
        summons: o.summons === true,
        seed,
      });
    },
    view: (state: GameState, viewer: number | null | 'dev') => dsViewFor(state as DsState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyDarkSoulsAction(state as DsState, seat, action as DsAction),
    soloSeats: 4, // dev convenience: a lone table gets a full party of four
  },
  feast: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, options?: GameOptions): GameState => {
      const o = options ?? {};
      const occupationMode = o.occupationMode === 'BC' || o.occupationMode === 'all' ? o.occupationMode : 'A';
      return createFeast(seated as { name: string; color: FeastSeatColor }[], seed, {
        length: o.length === 'short' ? 'short' : 'long',
        occupationMode,
        soloStartingOccupation: o.soloStartingOccupation === 'choose' ? 'choose' : 'random',
      });
    },
    view: (state: GameState, viewer: number | null | 'dev') => feastViewFor(state as FeastState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applyFeastAction(state as FeastState, seat, action as FeastAction),
    minSeats: 1,
    soloSeats: 1,
  },
  bloodborne: {
    // Fully co-op 1-4 hunters; CPU seats fill the party. Campaign + chapter
    // come from the create screen. The reducer throws on illegal actions and
    // drives enemy activation itself (owner directive: enemies are automatic).
    create: (seated: { name: string; color: SeatColor }[], seed: number, options?: GameOptions): GameState => {
      const o = options ?? {};
      const requested = Number(o.partySize);
      const partySize = Number.isInteger(requested) && requested >= 1 && requested <= 4
        ? requested
        : Math.min(Math.max(seated.length, 1), 4);
      const chapter = Number(o.chapter);
      return createBloodborne({
        campaignId: typeof o.campaign === 'string' ? o.campaign : 'the-long-hunt',
        chapter: Number.isInteger(chapter) && chapter >= 1 && chapter <= 3 ? chapter : 1,
        partySize,
        seed,
      });
    },
    view: (state: GameState, viewer: number | null | 'dev') => bbViewFor(state as BbState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => {
      try {
        applyBloodborneAction(state as BbState, seat, action as BbAction);
        bbPostProcess(state as BbState);
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    },
    soloSeats: 4, // a lone table gets a full hunting party
  },
  seti: {
    create: (seated: { name: string; color: SeatColor }[], seed: number, options?: GameOptions): GameState => {
      const difficulty = Number(options?.soloDifficulty);
      return createSeti(seated as { name: string; color: SetiSeatColor }[], seed, {
        soloDifficulty: Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5
          ? difficulty as 1 | 2 | 3 | 4 | 5
          : 3,
        promoCards: options?.promoCards === true,
      });
    },
    view: (state: GameState, viewer: number | null | 'dev') => setiViewFor(state as SetiState, viewer),
    apply: (state: GameState, seat: number, action: unknown) => applySetiAction(state as SetiState, seat, action as SetiAction),
    minSeats: 1,
    soloSeats: 1,
  },
} as const;

const engineOf = (game: string) => engines[game as keyof typeof engines] ?? engines.brass;
const seatsOf = (game: string) => GAME_SEATS[game] ?? GAME_SEATS.brass;

const PORT = Number(process.env.PORT ?? 8787);
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
const MAX_PLAYERS = 6;

// ---------- persistence ----------
// Rooms are continuously saved (file locally, Postgres when DATABASE_URL is
// set) and rehydrated at boot, so games survive restarts AND redeploys.
// Devices hold a per-room token in localStorage and reconnect into their seat.

const store = await createStore(path.resolve(__dirname, '..'));
const saveAdminToken = process.env.BGE_ADMIN_TOKEN?.trim() || undefined;

function isLiveRoom(room: Room): boolean {
  return !room.deleted && rooms.get(room.id) === room;
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
  const saved = await store.load();
  let restored = 0;
  for (const r of saved) {
    if (stale(r)) {
      try { await store.remove(r.id); } catch (err) { console.error(`failed to retire stale room ${r.id}:`, err); }
      continue;
    }
    // migrate Dark Tower games saved under the old node-based movement model
    if (r.game === 'darktower' && r.state) dtNormalize(r.state as never);
    // Fighters are independent units; older Axis saves stored them as carrier
    // cargo and would otherwise hide them from movement and combat.
    if (r.game === 'axis' && r.state) normalizeAxisState(r.state as AxisState);
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
  }
  if (restored) console.log(`  Restored ${restored} saved room${restored === 1 ? '' : 's'} (${store.kind})`);
  // a restored solo game may be waiting on a CPU — get its bots moving again
  // (deferred: botTimers below initializes after this block evaluates)
  setTimeout(() => { for (const room of rooms.values()) scheduleBots(room); }, 1000);
}

setInterval(() => {
  for (const room of rooms.values()) {
    if (stale(room)) void retireRoom(room, true).catch((err) => console.error(`failed to retire stale room ${room.id}:`, err));
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
  if (!room.state) return;
  const view = engineOf(room.game).view(room.state, viewSeat(ws, realSeat));
  if (view.game === 'axis') {
    view.battleVisualReady = axisBattleVisualReady(room);
    // Action authority follows the real room seat, not a dev-view override.
    // Keeping this in the same recipient overlay as visual readiness means it
    // never leaks into persisted game state or another player's view.
    view.controlledPowers = controlledAxisPowers(room.players, realSeat);
  }
  send(ws, { type: 'state', view });
}

function currentAxisBattleGeneration(room: Room): { combatId: number; visualSeq: number } | null {
  if (room.game !== 'axis' || !room.state) return null;
  const combat = (room.state as AxisState).combat;
  if (!combat) return null;
  return {
    combatId: combat.id,
    visualSeq: combat.visualSeq ?? 0,
  };
}

function axisBattleVisualReady(room: Room): boolean {
  return hasReadyAxisBattleWatcher(
    currentAxisBattleGeneration(room),
    [...room.watchers]
      .filter((watcher) => watcher.readyState === WebSocket.OPEN)
      .map((watcher) => conns.get(watcher)?.axisBattleVisualReady),
  );
}

/** Drop acknowledgements as soon as their exact battlefield state is no longer current. */
function pruneAxisBattleVisualReadiness(room: Room): void {
  const current = currentAxisBattleGeneration(room);
  for (const watcher of room.watchers) {
    const watcherConn = conns.get(watcher);
    const ready = watcherConn?.axisBattleVisualReady;
    if (!current || ready?.combatId !== current.combatId || ready.visualSeq !== current.visualSeq) {
      if (watcherConn) watcherConn.axisBattleVisualReady = null;
    }
  }
}

/** Every authoritative battle mutation starts with an unacknowledged display. */
function clearAxisBattleVisualReadiness(room: Room): void {
  for (const watcher of room.watchers) {
    const watcherConn = conns.get(watcher);
    if (watcherConn) watcherConn.axisBattleVisualReady = null;
  }
}

/** State-only fanout for ephemeral connection facts; never touches the save. */
function broadcastStates(room: Room): void {
  if (!isLiveRoom(room)) return;
  pruneAxisBattleVisualReadiness(room);
  for (const ws of room.watchers) sendState(room, ws, null);
  room.players.forEach((player, seat) => {
    for (const ws of player.sockets) sendState(room, ws, seat);
  });
}

function broadcast(room: Room): void {
  if (!isLiveRoom(room)) return;
  // every mutation funnels through here — save the room as a side effect
  room.updatedAt = Date.now();
  persist(room);
  pruneAxisBattleVisualReadiness(room);
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
  if (!isLiveRoom(room)) return;
  if (!room.state) return;
  if (room.game === 'ttr') return scheduleTtrBots(room);
  if (room.game === 'trek') return scheduleTrekBots(room);
  if (room.game === 'darktower') return scheduleDtBots(room);
  if (room.game === 'dune') return scheduleDuneBots(room);
  if (room.game === 'politik') return schedulePolitikBots(room);
  if (room.game === 'darksouls') return scheduleDsBots(room);
  if (room.game === 'feast') return scheduleFeastBots(room);
  if (room.game === 'bloodborne') return scheduleBbBots(room);
}

// Bloodborne is fully co-op: a seat is CPU only when no human holds it. The
// engine drives enemy activation itself; bots answer pendings, pick hunters,
// and take hunter turns at a deliberate pace so the TV can narrate.
function scheduleBbBots(room: Room): void {
  const s = room.state as BbState;
  if (s.phase === 'ended') return;
  const isBot = (seat: number) => seat >= room.players.length || !!room.players[seat]?.isBot;
  let delay: number | null = null;
  if (s.pending.length > 0) {
    if (isBot(s.pending[0].seat)) delay = 1100;
  } else if (s.phase === 'setup') {
    const humansDone = s.hunters.every((h, i) => h.hunterId != null || isBot(i));
    if (humansDone && s.hunters.some((h, i) => h.hunterId == null && isBot(i))) delay = 900;
  } else if (s.activeSeat != null) {
    if (isBot(s.activeSeat)) delay = 1900;
  } else {
    const next = s.hunters.find((h) => !h.tookTurnThisRound && !h.skipTurn);
    if (next && isBot(next.seat)) delay = 1600;
  }
  if (delay === null || botTimers.has(room.id)) return;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { bbBotAct(room); } catch (err) { console.error('bot error:', err); }
    // belt-and-suspenders: an act-less tick produces no broadcast (which is
    // what re-enters scheduling) — re-arm so a transient impasse never stalls
    if (!botTimers.has(room.id)) scheduleBbBots(room);
  }, delay));
}

function scheduleFeastBots(room: Room): void {
  const state = room.state as FeastState;
  if (state.phase === 'ended') return;
  const seat = feastActingSeat(state);
  if (seat === null) return;
  const isBot = seat >= room.players.length || !!room.players[seat]?.isBot;
  if (!isBot || botTimers.has(room.id)) return;
  const delay = state.pending.length > 0 ? 900 : 1600;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { feastBotAct(room, seat); } catch (err) { console.error('bot error:', err); }
  }, delay));
}

// Dark Souls is fully co-op: a seat is CPU only when no human holds it. The
// reducer drains enemy/boss activations itself (the script pump), so bots only
// ever answer pendings, pick classes, take character turns, and — when the
// host seat itself is CPU — drive the party forward from the bonfire.
function scheduleDsBots(room: Room): void {
  const s = room.state as DsState;
  if (s.phase === 'gameOver') return;
  const isBot = (seat: number) => seat >= room.players.length || !!room.players[seat]?.isBot;
  let delay: number | null = null;
  if (s.pendings.length > 0) {
    if (isBot(s.pendings[0].seat)) delay = 1000; // reaction prompts resolve briskly
  } else if (s.phase === 'setup') {
    // CPUs wait for every human to lock a class first (no duplicate classes)
    const humansDone = s.classPicks.every((c, i) => c != null || isBot(i));
    if (humansDone && s.classPicks.some((c, i) => c == null && isBot(i))) delay = 900;
  } else if ((s.phase === 'encounter' || s.phase === 'bossEncounter') && s.encounter?.turn === 'characters') {
    // deliberate pace so the TV can show each move land with its caption
    if (isBot(s.encounter.activeSeat)) delay = 1800;
  } else if (s.phase === 'bonfire') {
    if (isBot(0) || (s.soulCache >= 6 && s.characters.some((ch) => isBot(ch.seat)))) delay = 2200;
  }
  if (delay === null || botTimers.has(room.id)) return;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { dsBotAct(room); } catch (err) { console.error('bot error:', err); }
  }, delay));
}

function schedulePolitikBots(room: Room): void {
  const s = room.state as PolitikState;
  if (s.phase === 'ended') return;
  const seat = politikActingSeat(s);
  const isBot = seat >= room.players.length || !!room.players[seat]?.isBot;
  if (!isBot || botTimers.has(room.id)) return;
  // Setup prompts and private decisions resolve briskly; public Main Actions
  // get a longer beat so the shared board can animate one bot move at a time.
  const delay = s.phase === 'setup' ? 900 : s.pending ? 1200 : 1700;
  botTimers.set(room.id, setTimeout(() => {
    botTimers.delete(room.id);
    try { politikBotAct(room, seat); } catch (err) { console.error('bot error:', err); }
  }, delay));
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

// Politik bot: the reducer exposes one deterministic legal intent at a time.
// Re-check ownership when the timer fires because a human response may have
// advanced a pending Clash, trade, setup choice, or turn in the meantime.
function politikBotAct(room: Room, seat: number): void {
  const s = room.state as PolitikState;
  if (s.phase === 'ended') return;
  if (politikActingSeat(s) !== seat) return;
  const action = politikBotAction(s, seat);
  const result = applyPolitikAction(s, seat, action);
  if (result.ok) broadcast(room); // schedules exactly the next delayed step
  else console.warn(`politik bot seat ${seat} in ${room.id} rejected ${JSON.stringify(action)}: ${result.error ?? 'illegal action'}`);
}

// Feast bot: the shared engine chooses one legal, deterministic intent. Recheck
// turn ownership after the presentation delay so a human response cannot make
// a queued bot action stale.
function feastBotAct(room: Room, seat: number): void {
  const state = room.state as FeastState;
  if (state.phase === 'ended' || feastActingSeat(state) !== seat) return;
  const action = feastBotAction(state, seat);
  const result = applyFeastAction(state, seat, action);
  if (result.ok) broadcast(room);
  else console.warn(`feast bot seat ${seat} in ${room.id} rejected ${JSON.stringify(action)}: ${result.error ?? 'illegal action'}`);
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

// Dark Souls bot: random-legal with the greedy goals from the engine test
// suite (shared/src/darksouls/darksouls-test.ts) — estus when hurt, attack
// whatever is in reach, close toward the nearest hostile, end; answer pendings
// sensibly; at the bonfire level toward the class primary stat and press on.
// The reducer is the rules oracle: candidates are attempted until one sticks.
function dsBotPick(head: DsPending): string {
  switch (head.kind) {
    case 'defence': {
      const canDodge = head.options.some((o) => o.key === 'dodge');
      return canDodge && Number(head.data.damage ?? 0) >= 4 ? 'dodge' : 'block';
    }
    case 'trap': return head.options.some((o) => o.key === 'dodge') ? 'dodge' : 'suffer';
    case 'postRoll': return 'accept';
    case 'treasureKeep': {
      // gear up: equip a drawn card whenever someone can use it
      const equip = head.options.find((o) => o.key.startsWith('equip:'));
      return equip?.key ?? 'stash';
    }
    case 'dodgeMove': return 'stay';
    default: return head.options[0]?.key ?? '';
  }
}

function dsBotCharCandidates(s: DsState, seat: number): DsAction[] {
  const ch = s.characters[seat];
  const enc = s.encounter;
  if (!ch || !enc || !ch.nodeId) return [{ type: 'end_activation' }];
  const out: DsAction[] = [];
  if (ch.damage >= 5 && ch.estus) out.push({ type: 'use_estus' });

  const targetsEnemy = [...enc.enemies].sort((a, b) =>
    dsNodeDistance(enc.faceId, ch.nodeId!, a.nodeId) - dsNodeDistance(enc.faceId, ch.nodeId!, b.nodeId));
  const bossUnits = (s.boss?.units ?? []).filter((u) => u.inPlay && u.nodeId != null);
  for (const hand of ['L', 'R'] as const) {
    const eq = hand === 'L' ? ch.handL : ch.handR;
    if (!eq) continue;
    const card = DS_TREASURE_BY_ID[eq.cardId];
    // strongest affordable option first (more dice = more damage)
    const optIdxs = (card.actions ?? [])
      .map((a, i) => ({ i, dice: Object.values(a.dice ?? {}).reduce((n: number, d) => n + (d ?? 0), 0), cost: a.staminaCost }))
      .filter((o) => o.dice > 0)
      .sort((a, b) => (b.dice - b.cost / 10) - (a.dice - a.cost / 10))
      .map((o) => o.i);
    for (const i of optIdxs) {
      for (const en of targetsEnemy.slice(0, 2)) out.push({ type: 'attack', hand, option: i, targetUid: en.uid });
      for (const u of bossUnits) out.push({ type: 'attack', hand, option: i, targetUnit: u.key });
    }
  }
  // close the distance toward the nearest hostile (static tile distance; the
  // reducer rejects blocked steps, so a wrong guess just falls through)
  const goal = targetsEnemy[0]?.nodeId ?? bossUnits[0]?.nodeId ?? null;
  if (goal && goal !== ch.nodeId) {
    const g = dsTileGraph(enc.faceId);
    const d0 = dsNodeDistance(enc.faceId, ch.nodeId, goal);
    const next = [...g.adj[ch.nodeId]]
      .filter((n) => !dsNodeBlocked(s, n) && dsOccupancy(s, n) < 3
        && dsNodeDistance(enc.faceId, n, goal) < d0)
      .sort((a, b) => dsNodeDistance(enc.faceId, a, goal) - dsNodeDistance(enc.faceId, b, goal))[0];
    if (next) {
      out.push({ type: 'walk', nodeId: next });
      if (ch.damage < 5) out.push({ type: 'run', nodeId: next });
    } else {
      // walled off: smash an adjacent barrel to open the path (core p.17)
      const barrel = enc.terrain.find((t) => t.piece === 'barrel' && !t.destroyed
        && g.adj[ch.nodeId!].includes(t.nodeId) && dsOccupancy(s, t.nodeId) < 3);
      if (barrel) out.push({ type: 'walk', nodeId: barrel.nodeId });
    }
  }
  out.push({ type: 'end_activation' });
  return out;
}

function dsBotBonfireCandidates(s: DsState, isBot: (seat: number) => boolean): { seat: number; action: DsAction }[] {
  const out: { seat: number; action: DsAction }[] = [];
  // a CPU host gears the party up at Andre
  if (isBot(0) && s.partyAt === 'bonfire' && s.soulCache >= 3 && s.treasureDeck.length > 0) {
    out.push({ seat: 0, action: { type: 'buy_treasure' } });
  }
  // every CPU character levels toward its class primary stat
  for (const ch of s.characters) {
    if (!isBot(ch.seat)) continue;
    if (s.partyAt === 'bonfire' && s.soulCache >= 6) {
      const cls = DS_CLASSES[ch.classId];
      const primary = (['str', 'dex', 'int', 'fai'] as DsStat[])
        .sort((a, b) => cls.startingStats[b] - cls.startingStats[a])[0];
      out.push({ seat: ch.seat, action: { type: 'level_up', stat: primary } });
    }
  }
  // party-level decisions (travel, chests, fog gate) stay with a human host
  if (!isBot(0)) return out;
  if (s.partyAt !== 'bonfire') {
    const tile = s.tiles.find((t) => t.id === s.partyAt);
    if (tile && (tile.cleared || tile.completed)) {
      for (const [node, state] of Object.entries(tile.chests)) {
        if (state === 'closed') out.push({ seat: 0, action: { type: 'open_chest', nodeId: node } });
      }
    }
  }
  // always press on (bot goal): fog gate if ready, else forward
  if (s.stage === 'megaBoss') {
    if (s.partyAt === 'bonfire') out.push({ seat: 0, action: { type: 'enter_fog_gate' } });
    else out.push({ seat: 0, action: { type: 'travel', tileId: 'bonfire' } });
  } else if (s.partyAt === s.fogGateTileId) {
    out.push({ seat: 0, action: { type: 'enter_fog_gate' } });
  }
  if (s.partyAt === 'bonfire') {
    if (s.tiles.length > 0) out.push({ seat: 0, action: { type: 'travel', tileId: s.tiles[0].id } });
  } else {
    const i = s.tiles.findIndex((t) => t.id === s.partyAt);
    if (i >= 0 && i + 1 < s.tiles.length) out.push({ seat: 0, action: { type: 'travel', tileId: s.tiles[i + 1].id } });
  }
  return out;
}

function dsBotAct(room: Room): void {
  const s = room.state as DsState;
  if (!s || s.phase === 'gameOver') return;
  const isBot = (seat: number) => seat >= room.players.length || !!room.players[seat]?.isBot;
  const attempt = (seat: number, a: DsAction) => applyDarkSoulsAction(s, seat, a).ok;
  let acted = false;

  // re-check ownership: a human answer may have advanced things since scheduling
  if (s.pendings.length > 0) {
    const head = s.pendings[0];
    if (!isBot(head.seat)) return;
    acted = attempt(head.seat, { type: 'choose', pick: dsBotPick(head) });
    for (const o of head.options) {
      if (acted) break;
      acted = attempt(head.seat, { type: 'choose', pick: o.key });
    }
    if (!acted) console.warn(`ds bot seat ${head.seat} in ${room.id} stuck on ${head.kind}`);
  } else if (s.phase === 'setup') {
    const seat = s.classPicks.findIndex((c, i) => c == null && isBot(i));
    const humansDone = s.classPicks.every((c, i) => c != null || isBot(i));
    if (seat < 0 || !humansDone) return;
    const free = DS_CLASS_IDS.find((c) => !s.classPicks.includes(c));
    if (free) acted = attempt(seat, { type: 'pick_class', classId: free });
    if (!acted) console.warn(`ds bot seat ${seat} in ${room.id} could not pick a class`);
  } else if ((s.phase === 'encounter' || s.phase === 'bossEncounter') && s.encounter?.turn === 'characters') {
    const seat = s.encounter.activeSeat;
    if (!isBot(seat)) return;
    for (const a of dsBotCharCandidates(s, seat)) {
      if (attempt(seat, a)) { acted = true; break; }
    }
    if (!acted) console.warn(`ds bot seat ${seat} in ${room.id} found no legal action`);
  } else if (s.phase === 'bonfire') {
    for (const { seat, action } of dsBotBonfireCandidates(s, isBot)) {
      if (attempt(seat, action)) { acted = true; break; }
    }
    // a quiet bonfire with a human host is not a stall — humans decide travel
  }

  if (acted) broadcast(room);
}

// Bloodborne bot: one meaningful step per tick. Answers pendings, picks a free
// hunter in setup, then on its turn: fight what shares its space, loot, bank
// echoes at the Dream, and otherwise push toward mission tiles / unexplored
// exits so chapters actually progress.
function bbBotAct(room: Room): void {
  const s = room.state as BbState;
  if (!s || s.phase === 'ended') return;
  const isBot = (seat: number) => seat >= room.players.length || !!room.players[seat]?.isBot;
  const attempt = (seat: number, a: BbAction): boolean => {
    try {
      applyBloodborneAction(s, seat, a);
      bbPostProcess(s);
      return true;
    } catch {
      return false;
    }
  };
  let acted = false;

  const answerPending = (p: BbPending): boolean => {
    const h = s.hunters[p.seat];
    switch (p.kind) {
      case 'round-refresh': return attempt(p.seat, { type: 'round_refresh', discard: [] });
      case 'combat-reaction': return attempt(p.seat, { type: 'choose', pass: true });
      case 'combat-attack': {
        const slot = h.slots.findIndex((x) => x === null);
        const card = h.hand.find((c) => !BB_STAT_CARDS[c]?.effects.dodge) ?? h.hand[0];
        if (slot >= 0 && card && attempt(p.seat, { type: 'choose', cardId: card, slot })) return true;
        return attempt(p.seat, { type: 'choose', pass: true });
      }
      case 'combat-dodge':
      case 'combat-rider': {
        const card = h.hand.find((c) => BB_STAT_CARDS[c]?.effects.dodge);
        if (card) {
          for (let slot = 0; slot < h.slots.length; slot++) {
            if (h.slots[slot] === null && attempt(p.seat, { type: 'choose', cardId: card, slot })) return true;
          }
        }
        return attempt(p.seat, { type: 'choose', pass: true });
      }
      case 'discard-for-stun': return attempt(p.seat, { type: 'choose', cardId: h.hand[0] });
      case 'onkill-reward': return attempt(p.seat, { type: 'choose', use: true }) || attempt(p.seat, { type: 'choose', use: false });
      case 'dream-upgrades': return attempt(p.seat, { type: 'choose', upgradeId: s.upgradeRow[0] });
      case 'dream-incorporate': {
        const basic = h.deck.find((c) => BB_STAT_CARDS[c]?.basic);
        if (basic && attempt(p.seat, { type: 'choose', swapOut: basic })) return true;
        return attempt(p.seat, { type: 'choose', discard: true });
      }
      case 'return-placement': {
        const lamp = bbLampSpaces(s)[0];
        return attempt(p.seat, { type: 'choose', side: 0, space: lamp });
      }
      case 'tile-orientation': return attempt(p.seat, { type: 'choose', rot: p.options[0] });
      case 'reward-overflow': return attempt(p.seat, { type: 'choose', giveTo: null });
      case 'mission-choice': return attempt(p.seat, { type: 'choose', option: p.options[0] });
      default: return false;
    }
  };

  const nextStepToward = (from: string, to: string): string | null => {
    const prev = new Map<string, string>([[from, '']]);
    const q = [from];
    while (q.length) {
      const cur = q.shift()!;
      if (cur === to) break;
      for (const nb of bbSpaceNeighbors(s, cur, 'hunter')) {
        if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
      }
    }
    if (!prev.has(to)) return null;
    let cur = to;
    while (prev.get(cur) !== from && prev.get(cur) !== '') cur = prev.get(cur)!;
    return cur === from ? null : cur;
  };

  const objective = (seat: number): { space?: string; edge?: { from: string; edge: 'N' | 'E' | 'S' | 'W' } } => {
    const h = s.hunters[seat];
    const tagged = s.enemies.find((e) => e.missionTag);
    if (tagged) return { space: tagged.space };
    const boss = s.bosses[0];
    if (boss) return { space: boss.space };
    const defs = BB_MISSIONS[s.campaignId] ?? {};
    const ch = defs[`Chapter ${s.chapter} - Setup`] as unknown as { triggers?: { on: string; tile?: string; reveal: string }[] } | undefined;
    for (const t of ch?.triggers ?? []) {
      if (t.on !== 'endMoveOnTile' || s.missions[t.reveal]?.revealed) continue;
      const target = s.tiles.find((x) => bbTileDef(x.tileId).name.toLowerCase() === (t.tile ?? '').toLowerCase());
      if (target) {
        const sp = bbTileDef(target.tileId).spaces[0];
        return { space: `${target.uid}:${sp.id}` };
      }
    }
    if (s.insightCollected >= 2) {
      const central = s.tiles.find((x) => bbTileDef(x.tileId).name === 'CENTRAL LAMP');
      if (central) {
        const sp = bbTileDef(central.tileId).spaces.find((x) => x.named) ?? bbTileDef(central.tileId).spaces[0];
        return { space: `${central.uid}:${sp.id}` };
      }
    }
    for (const t of s.tiles) {
      if (s.fogGates.includes(t.uid)) continue;
      for (const ex of bbWorldExits(t)) {
        const [dx, dy] = ex.edge === 'N' ? [0, -1] : ex.edge === 'S' ? [0, 1] : ex.edge === 'E' ? [1, 0] : [-1, 0];
        if (!s.tiles.some((o) => o.x === t.x + dx && o.y === t.y + dy) && s.tileDeck.length > 0) {
          return { edge: { from: `${t.uid}:${ex.space}`, edge: ex.edge } };
        }
      }
    }
    void h;
    return {};
  };

  if (s.pending.length > 0) {
    const head = s.pending[0];
    if (!isBot(head.seat)) return;
    acted = answerPending(head);
    if (!acted) console.warn(`bb bot seat ${head.seat} in ${room.id} stuck on ${head.kind}`);
  } else if (s.phase === 'setup') {
    const seat = s.hunters.findIndex((h, i) => h.hunterId == null && isBot(i));
    const humansDone = s.hunters.every((h, i) => h.hunterId != null || isBot(i));
    if (seat < 0 || !humansDone) return;
    const free = Object.keys(BB_HUNTERS).filter((id) => BB_HUNTERS[id].set === 'core' && !s.pickedHunters.includes(id));
    const pool = free.length ? free : Object.keys(BB_HUNTERS).filter((id) => !s.pickedHunters.includes(id));
    if (pool.length) acted = attempt(seat, { type: 'pick_hunter', hunterId: pool[0] });
  } else if (s.activeSeat != null && isBot(s.activeSeat)) {
    const seat = s.activeSeat;
    const h = s.hunters[seat];
    const emptySlot = h.slots.findIndex((x) => x === null);
    const target = s.enemies.find((e) => e.space === h.space);
    const bossHere = s.bosses.find((b) => b.space === h.space);
    if (!acted && (target || bossHere) && emptySlot >= 0 && h.hand.length > 1) {
      const card = h.hand.find((c) => !BB_STAT_CARDS[c]?.effects.dodge) ?? h.hand[0];
      acted = attempt(seat, { type: 'attack', cardId: card, slot: emptySlot, enemyUid: target?.uid, bossUid: bossHere?.uid });
    }
    if (!acted && h.space && s.consumableTokens.includes(h.space) && h.hand.length > 1) {
      acted = attempt(seat, { type: 'interact', cardId: h.hand[0] });
    }
    if (!acted && emptySlot === -1 && h.hand.length > 1) {
      acted = attempt(seat, { type: 'transform', cardId: h.hand[0] });
    }
    if (!acted && (h.echoes >= 3 || h.hp <= 1) && h.hand.length > 0 && h.space) {
      acted = attempt(seat, { type: 'dream', cardId: h.hand[0] });
    }
    if (!acted && h.hand.length > 1 && h.space) {
      const obj = objective(seat);
      if (obj.edge && attempt(seat, { type: 'move', cardId: h.hand[0] })) {
        let steps = 0;
        while (h.space !== obj.edge.from && steps++ < 2 && !s.pending.length && !s.combat) {
          const next = nextStepToward(h.space!, obj.edge.from);
          if (!next || !attempt(seat, { type: 'step', to: next })) break;
        }
        if (!s.pending.length && !s.combat) {
          if (h.space === obj.edge.from) attempt(seat, { type: 'step_reveal', edge: obj.edge.edge });
          attempt(seat, { type: 'end_move' });
        }
        acted = true;
      } else if (obj.space && obj.space !== h.space && attempt(seat, { type: 'move', cardId: h.hand[0] })) {
        for (let i = 0; i < 2 && !s.pending.length && !s.combat; i++) {
          const next = nextStepToward(h.space!, obj.space);
          if (!next || !attempt(seat, { type: 'step', to: next })) break;
        }
        if (!s.pending.length && !s.combat) attempt(seat, { type: 'end_move' });
        acted = true;
      }
    }
    if (!acted) acted = attempt(seat, { type: 'end_turn' });
    if (!acted) console.warn(`bb bot seat ${seat} in ${room.id} found no legal action`);
  } else if (s.activeSeat == null) {
    const next = s.hunters.find((h) => !h.tookTurnThisRound && !h.skipTurn && isBot(h.seat));
    if (next) acted = attempt(next.seat, { type: 'begin_turn' });
  }

  if (acted) broadcast(room);
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
  /** Ephemeral and exact battle-state scoped; never serialized. */
  axisBattleVisualReady?: { combatId: number; visualSeq: number } | null;
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
  const botTimer = botTimers.get(room.id);
  if (botTimer) {
    clearTimeout(botTimer);
    botTimers.delete(room.id);
  }
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
      conn.axisBattleVisualReady = null;
    }
  }
  room.watchers.clear();
  for (const player of room.players) player.sockets.clear();
  if (closeSockets) for (const ws of sockets) ws.close(1000, 'Save deleted');
  return true;
}

/** A socket belongs to exactly one room and one role at a time. */
function detachConnection(ws: WebSocket, conn: ConnState): void {
  const previous = conn.room;
  if (!previous) return;
  if (conn.playerIdx === null) previous.watchers.delete(ws);
  else previous.players[conn.playerIdx]?.sockets.delete(ws);
  conn.room = null;
  conn.playerIdx = null;
  conn.viewAs = undefined;
  conn.axisBattleVisualReady = null;
  if (!isLiveRoom(previous)) return;
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
    conn.axisBattleVisualReady = null;
    if (playerIdx === null) {
      room.watchers.delete(ws);
    } else {
      room.players[playerIdx]?.sockets.delete(ws);
    }
    if (!isLiveRoom(room)) return;
    broadcast(room);
    maybeCleanup(room);
  });
});

function maybeCleanup(room: Room): void {
  if (!isLiveRoom(room)) return;
  // Rooms are saves now — never expire one just because everyone disconnected.
  // Only sweep abandoned TV lobbies that no player ever joined; everything
  // else lives until the hourly stale() sweep retires it.
  if (room.started || room.players.length > 0) return;
  if (room.watchers.size > 0) return;
  setTimeout(() => {
    const stillEmpty = isLiveRoom(room) && room.watchers.size === 0 && room.players.length === 0 && !room.started;
    if (stillEmpty) void retireRoom(room, false).catch((err) => console.error(`empty room cleanup failed for ${room.id}:`, err));
  }, 10 * 60 * 1000);
}

function handle(ws: WebSocket, conn: ConnState, msg: ClientMsg): void {
  if (conn.room && !isLiveRoom(conn.room) && !['create_room', 'watch', 'join'].includes(msg.type)) {
    return send(ws, { type: 'error', message: 'This room is being deleted' });
  }
  switch (msg.type) {
    case 'create_room': {
      detachConnection(ws, conn);
      const id = makeRoomId();
      const name = (msg.name || '').trim().slice(0, 40) || `Game ${id}`;
      const room: Room = {
        id, name, game: msg.game || 'brass', createdAt: Date.now(),
        ownerToken: crypto.randomUUID(),
        players: [], watchers: new Set(), started: false, state: null,
        options: msg.options, updatedAt: Date.now(), deleted: false,
      };
      rooms.set(room.id, room);
      room.watchers.add(ws);
      conn.room = room;
      conn.playerIdx = null;
      conn.axisBattleVisualReady = null;
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
      conn.axisBattleVisualReady = null;
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
          if (msg.name) room.players[idx].name = msg.name;
          conn.room = room;
          conn.playerIdx = idx;
          conn.axisBattleVisualReady = null;
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
      conn.axisBattleVisualReady = null;
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
      const minSeats = 'minSeats' in engine ? engine.minSeats : 2;
      while (seated.length < minSeats || (room.players.length < 2 && seated.length < engine.soloSeats)) {
        const c = seats.colors.find((cc) => !seated.some((s) => s.color === cc))!;
        seated.push({ name: `CPU ${seated.length + 1}`, color: c });
      }
      room.state = engine.create(seated, seed, room.options);
      broadcast(room);
      return;
    }
    case 'axis_battle_visual_ready': {
      const room = conn.room;
      if (!room || conn.playerIdx !== null || !room.watchers.has(ws)) {
        return send(ws, { type: 'error', message: 'Only the shared battle display can report visual readiness' });
      }
      if (room.game !== 'axis' || !room.state) {
        return send(ws, { type: 'error', message: 'No Axis battle is in progress' });
      }
      if (!Number.isSafeInteger(msg.combatId) || !Number.isSafeInteger(msg.visualSeq) || msg.visualSeq < 0 || typeof msg.ready !== 'boolean') {
        return send(ws, { type: 'error', message: 'Invalid battle visual readiness signal' });
      }

      const current = currentAxisBattleGeneration(room);
      // Loading callbacks can finish after combat or its visual state advances. A
      // stale reconnect acknowledgement is a harmless no-op, never an unlock.
      if (!current || msg.combatId !== current.combatId || msg.visualSeq !== current.visualSeq) return;

      const nextReady = msg.ready ? { combatId: msg.combatId, visualSeq: msg.visualSeq } : null;
      if (conn.axisBattleVisualReady?.combatId === nextReady?.combatId
        && conn.axisBattleVisualReady?.visualSeq === nextReady?.visualSeq) return;
      conn.axisBattleVisualReady = nextReady;
      broadcastStates(room);
      return;
    }
    case 'action': {
      const room = conn.room;
      if (!room || !room.state) return send(ws, { type: 'error', message: 'No game in progress' });
      let seat: number | null;
      let action: unknown = msg.action;
      if (room.game === 'axis') {
        // Axis clients name the power they are acting for because one host may
        // cover empty seats. Authorize that claim from the real room seat;
        // viewAs is deliberately irrelevant here, even in local development.
        if (conn.playerIdx === null) return send(ws, { type: 'error', message: 'Watchers cannot act' });
        const authorized = authorizeAxisAction(room.players, conn.playerIdx, msg.action);
        if (!authorized.ok) return send(ws, { type: 'error', message: authorized.error });
        seat = conn.playerIdx;
        action = authorized.action;
        if (isAxisBattleVisualGateAction(action)) {
          const target = axisBattleActionGeneration(action);
          const current = currentAxisBattleGeneration(room);
          if (!target || !current
            || target.combatId !== current.combatId
            || target.visualSeq !== current.visualSeq) {
            return send(ws, { type: 'error', message: 'That cinematic battle state is no longer current.' });
          }
          if (!axisBattleVisualReady(room)) {
            return send(ws, { type: 'error', message: 'Wait for the cinematic battle display to settle.' });
          }
        }
      } else {
        seat = resolveActionSeat(conn.playerIdx, conn.viewAs, ALLOW_DEVELOPMENT_CONTROL);
      }
      if (seat === null) return send(ws, { type: 'error', message: 'Watchers cannot act' });
      const result = engineOf(room.game).apply(room.state, seat, action);
      if (!result.ok) return send(ws, { type: 'error', message: result.error ?? 'Illegal action' });
      if (room.game === 'axis' && isAxisBattleVisualMutation(action)) clearAxisBattleVisualReadiness(room);
      broadcast(room);
      return;
    }
    case 'dev_view': {
      // Dev harness: choose a seat's redacted view. In production this never
      // changes action authority; Axis always uses its real-seat policy above.
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
