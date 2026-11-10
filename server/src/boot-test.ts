// Start-up must survive a database that accepts connections and then says nothing,
// and a save file with junk in it. Either used to be able to keep the port from ever opening.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// A "database" that takes the connection and never replies.
const silent = net.createServer(() => { /* hold the socket open, send nothing */ });
await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
const dbPort = (silent.address() as net.AddressInfo).port;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bge-boot-'));
// Saves the file store will fall back to: one good lobby, several broken rows.
fs.writeFileSync(path.join(dir, '.rooms.json'), JSON.stringify([
  { id: 'GOOD', name: 'Good lobby', game: 'secrethitler', createdAt: Date.now(), players: [], started: false, state: null, updatedAt: Date.now() },
  { id: 'BADA', name: 'No players field', game: 'secrethitler', createdAt: Date.now(), started: true, state: { game: 'secrethitler' }, updatedAt: Date.now() },
  { id: 'BADB', name: 'Half a state', game: 'secrethitler', createdAt: Date.now(), players: [], started: true, state: { game: 'secrethitler', phase: 'playing' }, updatedAt: Date.now() },
  { id: 'OLDG', name: 'Removed game', game: 'ttr', createdAt: Date.now(), players: [], started: true, state: { anything: true }, updatedAt: Date.now() },
]));

const PORT = 8797;
process.env.PORT = String(PORT);
process.env.BGE_DATA_DIR = dir;
process.env.DATABASE_URL = `postgres://user:pass@127.0.0.1:${dbPort}/saves`;
delete process.env.ANTHROPIC_API_KEY;

// With the server's own error handlers installed, a failed check must still end the run.
process.on('unhandledRejection', (err) => { console.error(err); process.exit(1); });

const t0 = Date.now();
await import('./index.js');
const bootMs = Date.now() - t0;
assert.ok(bootMs < 30_000, `server came up in ${bootMs} ms despite a silent database`);

// Give the deferred AI resume a moment to run against the broken saves.
await new Promise((r) => setTimeout(r, 1500));
const home = await fetch(`http://localhost:${PORT}/api/saves`);
assert.equal(home.status, 200);
const saves = await home.json() as { roomId: string; compatible: boolean }[];
assert.ok(saves.some((s) => s.roomId === 'GOOD'), 'the good save was restored');
assert.ok(!saves.some((s) => s.roomId === 'BADA'), 'a save with no players is skipped');
assert.equal(saves.find((s) => s.roomId === 'OLDG')?.compatible, false, 'a save from a removed game is listed as not resumable');

console.log(`ok boot: up in ${bootMs} ms with a silent database and broken saves`);
silent.close();
process.exit(0);
