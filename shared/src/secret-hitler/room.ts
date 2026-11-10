// Secret Hitler as a room engine: wraps the pure rules with the event stream the big screen plays,
// and the bookkeeping that holds devices until the screen has finished presenting.
import {
  SH_PICK_ORDER, TABLE_SEATS, applyShAction, createShGame, shPrivateView, shPublicView,
  type ShAction, type ShEvent, type ShPrivateView, type ShPublicView, type ShState,
} from './rules';

export type ShSeat = (typeof TABLE_SEATS)[number];
export interface StampedEvent {
  seq: number;
  e: ShEvent;
}
export interface ShRoomState {
  game: 'secrethitler';
  // Mirrors of the core state in the shape the save list reads.
  phase: 'playing' | 'ended';
  round: number;
  core: ShState;
  events: StampedEvent[];
  seq: number;
  // seq of the last event the table should watch before acting.
  gateSeq: number;
  gateAt: number;
  // Last seq the big screen has finished presenting.
  screenSeq: number;
  // Private notes each Claude seat carries between its turns.
  notes: string[];
}
export type ShView =
  | { game: 'secrethitler'; role: 'screen'; view: ShPublicView; events: StampedEvent[]; seq: number; fresh: boolean; claudeLive?: boolean }
  | { game: 'secrethitler'; role: 'player'; view: ShPrivateView; seq: number; screenSeq: number; screenLive: boolean };

// Events that play on the screen without holding the table.
const LIGHT = new Set<ShEvent['t']>(['vote_cast', 'say', 'claim']);
const KEEP_EVENTS = 600;

function stamp(state: ShRoomState, events: ShEvent[], screenLive: boolean) {
  let gated = false;
  for (const e of events) {
    state.seq += 1;
    state.events.push({ seq: state.seq, e });
    if (!LIGHT.has(e.t)) gated = true;
  }
  if (state.events.length > KEEP_EVENTS) state.events.splice(0, state.events.length - KEEP_EVENTS);
  if (gated) {
    state.gateSeq = state.seq;
    state.gateAt = Date.now();
  }
  if (!screenLive) state.screenSeq = state.seq;
  state.phase = state.core.phase === 'over' ? 'ended' : 'playing';
  state.round = state.core.round;
}

export function createShRoom(seated: { name: string; color: string; ai?: boolean }[], seed: number): ShRoomState {
  const slots = seated.map((p) => Math.max(0, TABLE_SEATS.indexOf(p.color as ShSeat)));
  const { state: core, events } = createShGame({ names: seated.map((p) => p.name), ai: seated.map((p) => !!p.ai), slots, seed });
  const state: ShRoomState = {
    game: 'secrethitler', phase: 'playing', round: 0, core, events: [], seq: 0, gateSeq: 0, gateAt: 0, screenSeq: 0,
    notes: seated.map(() => ''),
  };
  // A new game always has a screen-worthy opening; the server releases it if no screen is watching.
  stamp(state, events, true);
  return state;
}

export function shRoomApply(state: ShRoomState, seat: number, action: ShAction, screenLive: boolean): { ok: boolean; error?: string } {
  const res = applyShAction(state.core, seat, action);
  if (res.error) return { ok: false, error: res.error };
  state.core = res.state;
  stamp(state, res.events, screenLive);
  return { ok: true };
}

// Same table, same seats, new roles.
export function shRematch(state: ShRoomState, seed: number, screenLive: boolean): void {
  const old = state.core;
  const { state: core, events } = createShGame({ names: old.names, ai: old.ai, slots: old.slots, seed });
  state.core = core;
  state.notes = old.names.map(() => '');
  stamp(state, events, screenLive);
}

export function shRoomView(state: ShRoomState, viewer: number | null | 'dev'): ShView {
  if (viewer === null || viewer === 'dev') {
    return {
      game: 'secrethitler', role: 'screen', view: shPublicView(state.core),
      events: state.events.filter((e) => e.seq > state.screenSeq).slice(-150),
      seq: state.seq, fresh: state.screenSeq === 0,
    };
  }
  return { game: 'secrethitler', role: 'player', view: shPrivateView(state.core, viewer), seq: state.gateSeq, screenSeq: state.screenSeq, screenLive: true };
}

const CLAUDE_NAMES = ['Claude', 'Claude II', 'Claude III', 'Claude IV', 'Claude V', 'Claude VI', 'Claude VII', 'Claude VIII', 'Claude IX'];

// The Claude seats to add when a game starts: enough to reach five players, plus any extras asked for.
export function shClaudeSeats(seated: { name: string; color: string }[], extra: number): { name: string; color: ShSeat; ai: true }[] {
  const want = Math.min(10 - seated.length, Math.max(5 - seated.length, Math.max(0, Math.floor(extra) || 0)));
  const taken = new Set(seated.map((p) => p.color));
  const names = new Set(seated.map((p) => p.name.toLowerCase()));
  const out: { name: string; color: ShSeat; ai: true }[] = [];
  for (const color of SH_PICK_ORDER) {
    if (out.length >= want) break;
    if (taken.has(color)) continue;
    const name = CLAUDE_NAMES.find((n) => !names.has(n.toLowerCase())) ?? `Claude ${out.length + 1}`;
    names.add(name.toLowerCase());
    taken.add(color);
    out.push({ name, color, ai: true });
  }
  return out;
}
