// WebSocket client with auto-reconnect and a small React hook. The engine has
// been scrapped, so this now only tracks room/lobby state for the two screens.

import { useEffect, useRef, useState } from 'react';
import type { ClientMsg, ServerMsg, RoomInfo, GameView, GameAction } from '@bge/shared';

type Listener = (msg: ServerMsg) => void;

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
      this.queue.push(msg);
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
  devViewAs: (seat: number | null) => void;
}

/** mode 'watch' = TV lobby; mode 'play' = a joined player (uses a stored token). */
export function useRoom(roomId: string, mode: 'watch' | 'play', name?: string): RoomConn {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
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
    devViewAs: (seat) => socket.send({ type: 'dev_view', seat }),
  };
}
