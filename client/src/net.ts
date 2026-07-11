// WebSocket client with auto-reconnect and a small React hook. The engine has
// been scrapped, so this now only tracks room/lobby state for the two screens.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, ServerMsg, RoomInfo, GameView, GameAction } from '@bge/shared';

type Listener = (msg: ServerMsg) => void;

/**
 * Keep only the newest disconnected battle-presentation acknowledgement.
 *
 * A TV can cross hidden/visible, retry, and renderer-ready states while its
 * WebSocket is reconnecting. Replaying every transient acknowledgement would
 * briefly expose an obsolete `ready: true` before the final revocation is
 * processed. Other messages retain their original order; only this ephemeral,
 * per-socket presentation fact is safe (and necessary) to coalesce.
 */
export function enqueueClientMessage(queue: ClientMsg[], msg: ClientMsg): void {
  if (msg.type === 'axis_battle_visual_ready') {
    discardQueuedBattleVisualReadiness(queue);
  }
  queue.push(msg);
}

/** Room navigation must not replay a prior room's ephemeral acknowledgement. */
export function discardQueuedBattleVisualReadiness(queue: ClientMsg[]): void {
  for (let index = queue.length - 1; index >= 0; index--) {
    if (queue[index]?.type === 'axis_battle_visual_ready') queue.splice(index, 1);
  }
}

class Socket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private queue: ClientMsg[] = [];
  private onOpenHooks = new Set<() => void>();

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      for (const hook of this.onOpenHooks) hook();
      for (const m of this.queue.splice(0)) this.ws!.send(JSON.stringify(m));
    };
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMsg;
      for (const l of this.listeners) l(msg);
    };
    this.ws.onclose = () => {
      setTimeout(() => this.connect(), 1500);
    };
  }

  send(msg: ClientMsg): void {
    this.connect();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      enqueueClientMessage(this.queue, msg);
    }
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onOpen(hook: () => void): () => void {
    this.onOpenHooks.add(hook);
    if (this.ws?.readyState === WebSocket.OPEN) hook();
    return () => this.onOpenHooks.delete(hook);
  }

  discardBattleVisualReadiness(): void {
    discardQueuedBattleVisualReadiness(this.queue);
  }
}

export const socket = new Socket();

export function tokenKey(roomId: string): string {
  return `bge-token-${roomId.toUpperCase()}`;
}

export interface RoomConn {
  room: RoomInfo | null;
  view: GameView | null;
  playerIndex: number | null;
  error: string | null;
  clearError: () => void;
  start: () => void;
  act: (action: GameAction) => void;
  signalBattleVisualReady: (combatId: number, ready: boolean, visualSeq: number) => void;
  devViewAs: (seat: number | null) => void;
}

/** mode 'watch' = TV lobby; mode 'play' = a joined player (uses a stored token). */
export function useRoom(roomId: string, mode: 'watch' | 'play', name?: string): RoomConn {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errTimer = useRef<number | undefined>(undefined);
  const battleVisualSignal = useRef<{ combatId: number; visualSeq: number; ready: boolean } | null>(null);

  const signalBattleVisualReady = useCallback((combatId: number, ready: boolean, visualSeq: number) => {
    if (!Number.isSafeInteger(combatId) || !Number.isSafeInteger(visualSeq) || visualSeq < 0) return;
    const signal = { combatId, visualSeq, ready };
    battleVisualSignal.current = signal;
    socket.send({ type: 'axis_battle_visual_ready', ...signal });
  }, []);

  useEffect(() => {
    battleVisualSignal.current = null;
    socket.discardBattleVisualReadiness();
    const offMsg = socket.on((msg) => {
      switch (msg.type) {
        case 'room': setRoom(msg.info); break;
        case 'state': setView(msg.view); break;
        case 'joined':
          localStorage.setItem(tokenKey(msg.roomId), msg.playerToken);
          setPlayerIndex(msg.playerIndex);
          break;
        case 'error':
          setError(msg.message);
          window.clearTimeout(errTimer.current);
          errTimer.current = window.setTimeout(() => setError(null), 4000);
          break;
      }
    });
    const offOpen = socket.onOpen(() => {
      if (mode === 'watch') {
        socket.send({ type: 'watch', roomId });
        // Readiness lives on the socket, not in the save. If a ready TV briefly
        // reconnects while the same cinematic remains mounted, acknowledge the
        // exact battle again after re-attaching as a watcher.
        const signal = battleVisualSignal.current;
        if (signal?.ready) socket.send({ type: 'axis_battle_visual_ready', ...signal });
      } else {
        const token = localStorage.getItem(tokenKey(roomId)) ?? undefined;
        socket.send({ type: 'join', roomId, name: name ?? '', playerToken: token });
      }
    });
    socket.connect();
    return () => { offMsg(); offOpen(); };
  }, [roomId, mode, name]);

  return {
    room,
    view,
    playerIndex,
    error,
    clearError: () => setError(null),
    start: () => socket.send({ type: 'start' }),
    act: (action) => socket.send({ type: 'action', action }),
    signalBattleVisualReady,
    devViewAs: (seat) => socket.send({ type: 'dev_view', seat }),
  };
}
