#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUDIO_ROLES } from './import-bloodborne-audio.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_AUDIO_DIR = resolve(SCRIPT_DIR, '..', '..', 'client', 'public', 'bloodborne', 'audio');
const TRACK_PATH = /^\/bloodborne\/audio\/tracks\/([a-z0-9][a-z0-9._-]*\.(?:ogg|mp3))$/i;

export async function verifyBloodborneAudio(audioDir = DEFAULT_AUDIO_DIR) {
  const root = resolve(audioDir);
  const manifestPath = join(root, 'manifest.json');
  const errors = [];
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { throw new Error(`Cannot read ${manifestPath}: ${error.message}`); }
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.tracks)) throw new Error('Audio manifest must use schemaVersion 1 with a tracks array.');

  const ids = new Set();
  const referenced = new Set();
  const results = [];
  let credits = '';
  try { credits = await readFile(join(root, 'CREDITS.md'), 'utf8'); } catch { /* empty manifests need no credits */ }

  for (const [index, track] of manifest.tracks.entries()) {
    const label = typeof track?.id === 'string' ? track.id : `track ${index + 1}`;
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(track?.id ?? '')) { errors.push(`${label}: invalid id`); continue; }
    if (ids.has(track.id)) errors.push(`${label}: duplicate id`);
    ids.add(track.id);
    if (!Array.isArray(track.roles) || !track.roles.length || track.roles.some((role) => !AUDIO_ROLES.has(role))) errors.push(`${label}: invalid roles`);
    if (!track.license || !track.source) errors.push(`${label}: missing license/source metadata`);
    if (!(typeof track.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(track.sha256))) errors.push(`${label}: invalid SHA-256`);
    if (!(Number.isSafeInteger(track.bytes) && track.bytes > 0)) errors.push(`${label}: invalid byte size`);
    if (!(Number.isFinite(track.durationSeconds) && track.durationSeconds > 0)) errors.push(`${label}: invalid duration`);
    if (!(Number.isFinite(track.gain) && track.gain >= 0 && track.gain <= 1)) errors.push(`${label}: invalid gain`);
    if (!(Number.isFinite(track.crossfadeMs) && track.crossfadeMs >= 0 && track.crossfadeMs <= 30_000)) errors.push(`${label}: invalid crossfade`);

    const match = typeof track.file === 'string' ? track.file.match(TRACK_PATH) : null;
    if (!match) { errors.push(`${label}: unsafe/non-local file path`); continue; }
    referenced.add(match[1]);
    const file = join(root, 'tracks', match[1]);
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a regular file');
      if (info.size !== track.bytes) errors.push(`${label}: byte size is ${info.size}, manifest says ${track.bytes}`);
      const checksum = await sha256File(file);
      if (checksum !== String(track.sha256).toLowerCase()) errors.push(`${label}: SHA-256 mismatch`);
      const duration = await probeDuration(file);
      if (Math.abs(duration - track.durationSeconds) > 0.05) errors.push(`${label}: duration is ${duration}s, manifest says ${track.durationSeconds}s`);
      if (!credits.includes(track.sha256)) errors.push(`${label}: checksum missing from CREDITS.md`);
      if (track.attribution && !credits.includes(track.attribution)) errors.push(`${label}: attribution missing from CREDITS.md`);
      results.push({ id: track.id, file, bytes: info.size, durationSeconds: duration, sha256: checksum });
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }

  try {
    for (const entry of await readdir(join(root, 'tracks'), { withFileTypes: true })) {
      if (entry.isFile() && /\.(?:ogg|mp3)$/i.test(entry.name) && !referenced.has(entry.name)) errors.push(`orphan audio file: tracks/${entry.name}`);
    }
  } catch (error) {
    if (manifest.tracks.length) errors.push(`cannot inspect tracks directory: ${error.message}`);
  }

  if (errors.length) throw new Error(`Bloodborne audio verification failed:\n- ${errors.join('\n- ')}`);
  return { manifest, tracks: results };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function probeDuration(path) {
  const output = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path]);
  const duration = Number(JSON.parse(output).format?.duration);
  if (!Number.isFinite(duration)) throw new Error('ffprobe returned no duration');
  return Math.round(duration * 1000) / 1000;
}

async function run(command, args) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise(stdout) : reject(new Error(`${command} failed (${code}): ${stderr.trim()}`)));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node tools/audio/verify-bloodborne-audio.mjs [audio-directory]');
    return;
  }
  if (args.length > 1) throw new Error('Expected at most one audio-directory argument.');
  const result = await verifyBloodborneAudio(args[0] ? resolve(args[0]) : DEFAULT_AUDIO_DIR);
  const bytes = result.tracks.reduce((sum, track) => sum + track.bytes, 0);
  console.log(`Verified ${result.tracks.length} Bloodborne audio tracks (${bytes} bytes): files, durations, credits, and SHA-256 checksums match.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
