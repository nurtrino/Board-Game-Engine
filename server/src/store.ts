// Room persistence. Every mutation schedules a debounced save of the room's
// durable core (players + tokens + full game state — never sockets), so games
// survive server restarts and redeploys:
//   - FileStore  -> server/.rooms.json (local play; survives restarts)
//   - PgStore    -> Postgres via DATABASE_URL (hosted; survives deploys, since
//                   Render's filesystem is ephemeral)
// Players reconnect into their seat with the per-room token their device keeps
// in localStorage, so a resumed game continues exactly where it left off.

import fs from 'node:fs';
import path from 'node:path';
import type { GameOptions, SeatColor } from '@bge/shared';

export interface SavedPlayer { name: string; color: SeatColor; token: string; isBot?: boolean }
export interface SavedRoom {
  id: string;
  name: string;
  game: string;
  createdAt: number;
  players: SavedPlayer[];
  started: boolean;
  state: unknown | null; // the engine state, persisted as JSON
  options?: GameOptions;
  updatedAt: number;
}

export interface RoomStore {
  kind: string;
  load(): Promise<SavedRoom[]>;
  save(room: SavedRoom): void; // debounced, fire-and-forget
  remove(id: string): void;
  flush(): Promise<void>; // write out anything pending (shutdown)
}

const DEBOUNCE_MS = 300;

// ---------- file ----------

export class FileStore implements RoomStore {
  kind = 'file';
  private all = new Map<string, SavedRoom>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string) {}

  async load(): Promise<SavedRoom[]> {
    try {
      const rooms = JSON.parse(fs.readFileSync(this.file, 'utf8')) as SavedRoom[];
      for (const r of rooms) this.all.set(r.id, r);
      return rooms;
    } catch {
      return []; // no file yet (or unreadable) — start fresh
    }
  }

  save(room: SavedRoom): void {
    this.all.set(room.id, room);
    this.schedule();
  }

  remove(id: string): void {
    if (this.all.delete(id)) this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.writeAll(); }, DEBOUNCE_MS);
  }

  private writeAll(): void {
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...this.all.values()]));
      fs.renameSync(tmp, this.file); // atomic: never a half-written save
    } catch (err) {
      console.error('room save failed:', err);
    }
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.writeAll();
  }
}

// ---------- postgres ----------

export class PgStore implements RoomStore {
  kind = 'postgres';
  private pool: import('pg').Pool;
  private timers = new Map<string, { t: NodeJS.Timeout; room: SavedRoom }>();
  private pending = new Map<string, Promise<unknown>>();

  constructor(url: string, PgPool: typeof import('pg').Pool) {
    // Render's internal connection string needs no TLS; external ones do.
    const ssl = process.env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined;
    this.pool = new PgPool({ connectionString: url, ssl, max: 3 });
  }

  async load(): Promise<SavedRoom[]> {
    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS rooms (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())',
    );
    const res = await this.pool.query('SELECT data FROM rooms');
    return res.rows.map((r: { data: SavedRoom }) => r.data);
  }

  save(room: SavedRoom): void {
    const prev = this.timers.get(room.id);
    if (prev) clearTimeout(prev.t);
    const t = setTimeout(() => {
      this.timers.delete(room.id);
      this.upsert(room);
    }, DEBOUNCE_MS);
    this.timers.set(room.id, { t, room });
  }

  private upsert(room: SavedRoom): void {
    const p = this.pool
      .query('INSERT INTO rooms (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()', [room.id, room])
      .catch((err: unknown) => console.error('room save failed:', err))
      .finally(() => this.pending.delete(room.id));
    this.pending.set(room.id, p);
  }

  remove(id: string): void {
    const prev = this.timers.get(id);
    if (prev) { clearTimeout(prev.t); this.timers.delete(id); }
    this.pool.query('DELETE FROM rooms WHERE id = $1', [id])
      .catch((err: unknown) => console.error('room delete failed:', err));
  }

  async flush(): Promise<void> {
    // fire everything still debouncing, then wait for in-flight writes
    const due = [...this.timers.values()];
    for (const { t } of due) clearTimeout(t);
    this.timers.clear();
    for (const { room } of due) this.upsert(room);
    await Promise.allSettled([...this.pending.values()]);
    await this.pool.end();
  }
}

// ---------- selection ----------

export async function createStore(dataDir: string): Promise<RoomStore> {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const pg = await import('pg');
      const store = new PgStore(url, pg.default.Pool);
      await store.load(); // proves connectivity + creates the table
      return store;
    } catch (err) {
      console.error('DATABASE_URL set but Postgres unavailable — falling back to file store:', err);
    }
  }
  return new FileStore(path.join(dataDir, '.rooms.json'));
}
