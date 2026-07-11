import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore, PgStore, type SavedRoom } from './store.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bge-file-store-'));
const file = path.join(tempDir, '.rooms.json');
const baseTime = Date.now() - 10_000;

function room(id: string, name: string, updatedAt: number): SavedRoom {
  return {
    id,
    name,
    game: 'axis',
    createdAt: baseTime,
    players: [{ name: 'Tester', color: 'germany', token: `${id}-token` }],
    started: true,
    state: { marker: name },
    updatedAt,
  };
}

async function waitFor(check: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

class OrderedFakePool {
  static instance: OrderedFakePool;
  readonly calls: string[] = [];
  readonly rows = new Map<string, SavedRoom>();
  releaseInsert: (() => void) | null = null;
  failDelete = false;

  constructor(_options: unknown) {
    OrderedFakePool.instance = this;
  }

  query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    if (sql.startsWith('INSERT INTO rooms')) {
      const [id, data] = values as [string, SavedRoom];
      this.calls.push(`insert:start:${id}`);
      return new Promise((resolve) => {
        this.releaseInsert = () => {
          this.rows.set(id, data);
          this.calls.push(`insert:finish:${id}`);
          this.releaseInsert = null;
          resolve({ rows: [] });
        };
      });
    }
    if (sql.startsWith('DELETE FROM rooms')) {
      const id = String(values[0]);
      this.calls.push(`delete:${id}`);
      if (this.failDelete) return Promise.reject(new Error('delete unavailable'));
      this.rows.delete(id);
      return Promise.resolve({ rows: [] });
    }
    if (sql.startsWith('CREATE TABLE')) return Promise.resolve({ rows: [] });
    if (sql.startsWith('SELECT data')) return Promise.resolve({ rows: [...this.rows.values()].map((data) => ({ data })) });
    return Promise.reject(new Error(`Unexpected SQL: ${sql}`));
  }

  end(): Promise<void> {
    this.calls.push('end');
    return Promise.resolve();
  }
}

try {
  // The original file format was a plain SavedRoom[]. Loading it must remain
  // supported as owner credentials are introduced, and the next write should
  // upgrade it without losing the room.
  const legacyFile = path.join(tempDir, 'legacy-rooms.json');
  fs.writeFileSync(legacyFile, JSON.stringify([room('OLDX', 'Legacy', baseTime)]));
  const legacyStore = new FileStore(legacyFile);
  const legacyRooms = await legacyStore.load();
  assert.equal(legacyRooms[0]?.ownerToken, undefined, 'legacy saves need no ownerToken field');
  legacyStore.save({ ...legacyRooms[0], ownerToken: 'new-owner', updatedAt: baseTime + 1 });
  await legacyStore.flush();
  const upgraded = JSON.parse(fs.readFileSync(legacyFile, 'utf8')) as { version: number; rooms: SavedRoom[] };
  assert.equal(upgraded.version, 2, 'legacy arrays upgrade to the versioned snapshot');
  assert.equal(upgraded.rooms[0]?.ownerToken, 'new-owner', 'new ownership metadata persists after upgrade');

  // Both instances load the same empty snapshot, then flush independent rooms
  // concurrently. Neither stale in-memory map may replace the other's room.
  const first = new FileStore(file);
  const second = new FileStore(file);
  await Promise.all([first.load(), second.load()]);
  first.save(room('AAAA', 'Alpha', baseTime + 100));
  second.save(room('BBBB', 'Bravo', baseTime + 100));
  await Promise.all([first.flush(), second.flush()]);

  let observer = new FileStore(file);
  let loaded = await observer.load();
  assert.deepEqual(loaded.map((entry) => entry.id).sort(), ['AAAA', 'BBBB'], 'interleaved stores preserve independent rooms');

  // Whichever lock is acquired last, an older same-room update must not roll
  // back a version already committed by the other process.
  first.save(room('AAAA', 'Alpha newest', baseTime + 300));
  second.save(room('AAAA', 'Alpha stale', baseTime + 200));
  await Promise.all([second.flush(), first.flush()]);
  observer = new FileStore(file);
  loaded = await observer.load();
  assert.equal(loaded.find((entry) => entry.id === 'AAAA')?.name, 'Alpha newest', 'newer updatedAt wins across writers');
  assert.ok(loaded.some((entry) => entry.id === 'BBBB'), 'same-room updates do not clobber unrelated rooms');

  // A stale process must not resurrect a room after another process deletes it.
  await first.remove('AAAA');
  await first.flush();
  second.save(room('AAAA', 'Alpha resurrected', baseTime + 400));
  await second.flush();
  observer = new FileStore(file);
  loaded = await observer.load();
  assert.equal(loaded.some((entry) => entry.id === 'AAAA'), false, 'removal tombstones reject stale resurrection');
  assert.ok(loaded.some((entry) => entry.id === 'BBBB'), 'removing one room preserves the rest');

  // A Postgres DELETE must queue behind an upsert that has already begun. If
  // it races ahead, the late INSERT can recreate the save after deletion.
  const pgStore = new PgStore('postgres://test', OrderedFakePool as unknown as typeof import('pg').Pool);
  const pgRoom = room('PGAA', 'Postgres', Date.now());
  pgStore.save(pgRoom);
  await waitFor(() => OrderedFakePool.instance.releaseInsert !== null, 'debounced Postgres upsert did not start');
  const pg = OrderedFakePool.instance;
  const deletion = pgStore.remove(pgRoom.id);
  await Promise.resolve();
  assert.equal(pg.calls.some((call) => call === `delete:${pgRoom.id}`), false, 'delete waits for the in-flight upsert');
  pg.releaseInsert?.();
  await deletion;
  await pgStore.flush();
  assert.deepEqual(pg.calls.slice(0, 3), [
    `insert:start:${pgRoom.id}`,
    `insert:finish:${pgRoom.id}`,
    `delete:${pgRoom.id}`,
  ], 'Postgres operations are serialized in save-then-delete order');
  assert.equal(pg.rows.has(pgRoom.id), false, 'the deleted row cannot be resurrected by an older upsert');

  // Removing during the debounce window cancels the write altogether.
  const canceledStore = new PgStore('postgres://test', OrderedFakePool as unknown as typeof import('pg').Pool);
  const canceledRoom = room('PGZZ', 'Canceled', Date.now());
  const canceledPg = OrderedFakePool.instance;
  canceledStore.save(canceledRoom);
  await canceledStore.remove(canceledRoom.id);
  await canceledStore.flush();
  assert.equal(canceledPg.calls.some((call) => call.startsWith('insert:')), false, 'delete cancels a not-yet-started upsert');
  assert.equal(canceledPg.calls.includes(`delete:${canceledRoom.id}`), true, 'the delete itself is included in flush');

  // The HTTP layer can only return a truthful result if a durable-store
  // failure rejects remove() instead of being swallowed in the background.
  const failingStore = new PgStore('postgres://test', OrderedFakePool as unknown as typeof import('pg').Pool);
  const failingPg = OrderedFakePool.instance;
  failingPg.failDelete = true;
  const previousConsoleError = console.error;
  console.error = () => undefined;
  try {
    await assert.rejects(failingStore.remove('PGNO'), /delete unavailable/, 'Postgres deletion failures reach the caller');
    await failingStore.flush();
  } finally {
    console.error = previousConsoleError;
  }

  console.log('room stores: all checks passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
