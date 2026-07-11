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
  /** Creator credential used only for destructive save administration. */
  ownerToken?: string;
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
  /** Resolves only after the deletion is durable. */
  remove(id: string): Promise<void>;
  flush(): Promise<void>; // write out anything pending (shutdown)
}

const DEBOUNCE_MS = 300;
const LOCK_RETRY_MS = 20;
const LOCK_TIMEOUT_MS = 4_000;
const STALE_LOCK_MS = 15_000;

// ---------- file ----------

interface FileSnapshot {
  version: 2;
  rooms: SavedRoom[];
  /** Deletion versions prevent a stale process from resurrecting a room. */
  removed: Record<string, number>;
}

interface PendingSave { room: SavedRoom; seq: number }
interface PendingRemoval { removedAt: number; seq: number }

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code)
    : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FileStore implements RoomStore {
  kind = 'file';
  private all = new Map<string, SavedRoom>();
  private removed = new Map<string, number>();
  private dirty = new Map<string, PendingSave>();
  private removals = new Map<string, PendingRemoval>();
  private opSeq = 0;
  private timer: NodeJS.Timeout | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private file: string) {}

  async load(): Promise<SavedRoom[]> {
    try {
      const snapshot = this.readSnapshot();
      this.all = new Map(snapshot.rooms.map((room) => [room.id, room]));
      this.removed = new Map(Object.entries(snapshot.removed));
      return snapshot.rooms;
    } catch (err) {
      if (errorCode(err) !== 'ENOENT') console.error('room load failed:', err);
      return []; // no file yet (or unreadable) — start fresh
    }
  }

  save(room: SavedRoom): void {
    this.all.set(room.id, room);
    this.dirty.set(room.id, { room, seq: ++this.opSeq });
    this.removals.delete(room.id);
    this.schedule();
  }

  remove(id: string): Promise<void> {
    this.all.delete(id);
    this.dirty.delete(id);
    this.removals.set(id, { removedAt: Date.now(), seq: ++this.opSeq });
    // Destructive API calls need a truthful acknowledgement, so removals skip
    // the debounce and resolve only after their tombstone reaches disk.
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    return this.queueWrite();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.queueWrite();
    }, DEBOUNCE_MS);
  }

  private readSnapshot(): FileSnapshot {
    const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown;
    // Backward compatibility with the original plain SavedRoom[] format.
    if (Array.isArray(parsed)) {
      return { version: 2, rooms: parsed as SavedRoom[], removed: {} };
    }
    if (parsed && typeof parsed === 'object') {
      const candidate = parsed as Partial<FileSnapshot>;
      if (Array.isArray(candidate.rooms) && candidate.removed && typeof candidate.removed === 'object') {
        return { version: 2, rooms: candidate.rooms, removed: candidate.removed };
      }
    }
    throw new Error('Unrecognized room save format');
  }

  private readSnapshotOrEmpty(): FileSnapshot {
    try {
      return this.readSnapshot();
    } catch (err) {
      if (errorCode(err) === 'ENOENT') return { version: 2, rooms: [], removed: {} };
      throw err;
    }
  }

  private async acquireLock(): Promise<number> {
    const lock = `${this.file}.lock`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    while (true) {
      try {
        return fs.openSync(lock, 'wx');
      } catch (err) {
        if (errorCode(err) !== 'EEXIST') throw err;
        try {
          if (Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS) fs.unlinkSync(lock);
        } catch (statErr) {
          if (errorCode(statErr) !== 'ENOENT') throw statErr;
        }
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for room save lock: ${lock}`);
        await sleep(LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS));
      }
    }
  }

  private writeSnapshot(snapshot: FileSnapshot): void {
    const tmp = `${this.file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(snapshot));
      fs.renameSync(tmp, this.file); // atomic: never expose a half-written save
    } finally {
      try { fs.unlinkSync(tmp); } catch (err) { if (errorCode(err) !== 'ENOENT') throw err; }
    }
  }

  private async writePending(): Promise<void> {
    if (!this.dirty.size && !this.removals.size) return;
    const saves = [...this.dirty.entries()];
    const removals = [...this.removals.entries()];
    const lockPath = `${this.file}.lock`;
    const lockFd = await this.acquireLock();
    try {
      // Merge onto disk, not `this.all`: another local server may have written
      // rooms since this FileStore instance loaded its in-memory snapshot.
      const disk = this.readSnapshotOrEmpty();
      const rooms = new Map(disk.rooms.map((room) => [room.id, room]));
      const removed = new Map(Object.entries(disk.removed));

      for (const [id, pending] of saves) {
        const currentVersion = rooms.get(id)?.updatedAt ?? Number.NEGATIVE_INFINITY;
        const removedVersion = removed.get(id) ?? Number.NEGATIVE_INFINITY;
        if (pending.room.updatedAt >= currentVersion && pending.room.updatedAt > removedVersion) {
          rooms.set(id, pending.room);
        }
      }
      for (const [id, pending] of removals) {
        const currentVersion = rooms.get(id)?.updatedAt ?? Number.NEGATIVE_INFINITY;
        const previousRemoval = removed.get(id) ?? Number.NEGATIVE_INFINITY;
        removed.set(id, Math.max(previousRemoval, pending.removedAt));
        if (pending.removedAt >= currentVersion) rooms.delete(id);
      }

      const snapshot: FileSnapshot = {
        version: 2,
        rooms: [...rooms.values()].sort((a, b) => a.id.localeCompare(b.id)),
        removed: Object.fromEntries([...removed.entries()].sort(([a], [b]) => a.localeCompare(b))),
      };
      this.writeSnapshot(snapshot);

      // Clear only the exact operations included in this write. Mutations that
      // arrived while waiting for the lock remain queued for the next pass.
      for (const [id, pending] of saves) {
        if (this.dirty.get(id)?.seq === pending.seq) this.dirty.delete(id);
      }
      for (const [id, pending] of removals) {
        if (this.removals.get(id)?.seq === pending.seq) this.removals.delete(id);
      }
      this.all = rooms;
      this.removed = removed;
      for (const { room } of this.dirty.values()) this.all.set(room.id, room);
      for (const id of this.removals.keys()) this.all.delete(id);
    } finally {
      fs.closeSync(lockFd);
      try { fs.unlinkSync(lockPath); } catch (err) { if (errorCode(err) !== 'ENOENT') throw err; }
    }
  }

  private queueWrite(): Promise<void> {
    const write = this.writeChain.then(() => this.writePending());
    // Keep the queue usable after a failed background write and attach the
    // handler immediately so timer-triggered writes are never unhandled.
    this.writeChain = write.catch((err) => console.error('room save failed:', err));
    return write;
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.writeChain;
    while (this.dirty.size || this.removals.size) await this.queueWrite();
  }
}

// ---------- postgres ----------

export class PgStore implements RoomStore {
  kind = 'postgres';
  private pool: import('pg').Pool;
  private timers = new Map<string, { t: NodeJS.Timeout; room: SavedRoom }>();
  /** Per-room operation tails keep DELETE behind any already-started UPSERT. */
  private pending = new Map<string, Promise<void>>();

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
    this.enqueue(room.id, 'save', () => this.pool.query(
      'INSERT INTO rooms (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()',
      [room.id, room],
    ));
  }

  private enqueue(id: string, kind: 'save' | 'delete', operation: () => Promise<unknown>): Promise<void> {
    const previous = this.pending.get(id) ?? Promise.resolve();
    // A failed earlier operation must not prevent a later delete from running.
    const operationResult = previous
      .catch(() => undefined)
      .then(async () => { await operation(); });
    // The stored tail always settles, so a failed save cannot poison later
    // work. Return the raw result as well so DELETE callers can report failure.
    const next = operationResult.catch((err: unknown) => console.error(`room ${kind} failed:`, err));
    this.pending.set(id, next);
    // Only the current tail may remove itself. An older completion must never
    // hide a newer queued operation from flush().
    void next.finally(() => {
      if (this.pending.get(id) === next) this.pending.delete(id);
    });
    return operationResult;
  }

  remove(id: string): Promise<void> {
    const prev = this.timers.get(id);
    if (prev) { clearTimeout(prev.t); this.timers.delete(id); }
    return this.enqueue(id, 'delete', () => this.pool.query('DELETE FROM rooms WHERE id = $1', [id]));
  }

  async flush(): Promise<void> {
    // fire everything still debouncing, then wait for in-flight writes
    const due = [...this.timers.values()];
    for (const { t } of due) clearTimeout(t);
    this.timers.clear();
    for (const { room } of due) this.upsert(room);
    // Operations can append a new tail while an older snapshot is settling.
    while (this.pending.size) await Promise.allSettled([...this.pending.values()]);
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
